(function () {
  "use strict";

  /**
   * 早會 — staff booking of morning-assembly content for the next 10 school days.
   * UI: one text input + 「增加」 per day.
   * Source: public.morning_assemblies; defaults from assembly_by_day.
   */

  var CONTENT_MAX = 500;
  var WINDOW_DAYS = 10;

  var state = {
    loaded: false,
    loading: false,
    savingIso: "",
    error: "",
    schoolDays: [],
    bookings: {},
    themes: {},
    bound: false
  };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getSession() {
    return (window.SchoolAdminAuth && SchoolAdminAuth.getSession()) ||
      window.__schoolAdminSession || null;
  }

  function getClient() {
    var auth = window.SchoolAdminAuth;
    return (auth && auth.getClient && auth.getClient()) || window.__supabaseClient || null;
  }

  function canManage(session) {
    if (!session || session.method !== "supabase") return false;
    if (session.role !== "staff") return false;
    var email = (session.email || "").toLowerCase();
    if (!email) return false;
    if (window.SchoolAdminAuth && SchoolAdminAuth.emailAllowed) {
      return SchoolAdminAuth.emailAllowed(email);
    }
    return /@g\.lwfss\.edu\.hk$/i.test(email);
  }

  function todayHK() {
    if (window.SchoolAdminHome && typeof SchoolAdminHome.todayHK === "function") {
      return SchoolAdminHome.todayHK();
    }
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Hong_Kong",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date());
    } catch (e) {
      var d = new Date();
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
  }

  function formatDisplayDate(iso) {
    var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso || "—";
    var mo = parseInt(m[2], 10);
    var d = parseInt(m[3], 10);
    var wd = ["日", "一", "二", "三", "四", "五", "六"];
    var dt = new Date(Date.UTC(parseInt(m[1], 10), mo - 1, d));
    return mo + "/" + d + "（" + wd[dt.getUTCDay()] + "）";
  }

  function themeForDay(cycleDay) {
    return state.themes[cycleDay] || state.themes[String(cycleDay)] || null;
  }

  function bookerLabel(row) {
    if (!row) return "";
    var code = String(row.booked_by_code || "").trim().toUpperCase();
    if (code) return code;
    var email = String(row.booked_by || "").trim();
    if (!email) return "";
    var at = email.indexOf("@");
    return at > 0 ? email.slice(0, at) : email;
  }

  function notifyChanged() {
    try {
      document.dispatchEvent(new CustomEvent("schooladmin:morning-assemblies-changed"));
    } catch (e) { /* ignore */ }
  }

  function setMeta(text) {
    var meta = $("home-ma-meta");
    if (meta) meta.textContent = text || "";
  }

  function setRowStatus(iso, msg, isErr) {
    var el = document.querySelector('.ma-status[data-date="' + iso + '"]');
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("is-err", !!isErr);
  }

  function readInput(iso) {
    var el = document.querySelector('.ma-input[data-date="' + iso + '"]');
    var content = el ? String(el.value || "").trim() : "";
    if (content.length > CONTENT_MAX) content = content.slice(0, CONTENT_MAX);
    return content;
  }

  function loadData() {
    var client = getClient();
    var list = $("home-ma-list");
    var empty = $("home-ma-empty");
    if (!client) {
      state.error = "未能連接資料庫";
      state.loading = false;
      state.loaded = false;
      renderAll();
      return Promise.resolve();
    }

    state.loading = true;
    state.error = "";
    setMeta("載入未來 " + WINDOW_DAYS + " 個上學日…");
    if (empty) empty.hidden = true;
    if (list) list.innerHTML = "";

    var today = todayHK();
    var cycleP = client
      .from("cycle_days")
      .select("day_date,cycle_day,note")
      .gte("day_date", today)
      .not("cycle_day", "is", null)
      .order("day_date", { ascending: true })
      .limit(WINDOW_DAYS);

    var themeP = Object.keys(state.themes || {}).length
      ? Promise.resolve({ data: null, _cached: true })
      : client.from("assembly_by_day").select("day,theme,is_flag,is_3x").order("day");

    return Promise.all([cycleP, themeP]).then(function (parts) {
      var cycleRes = parts[0];
      var themeRes = parts[1];

      if (themeRes && !themeRes._cached && !themeRes.error && themeRes.data) {
        var map = {};
        themeRes.data.forEach(function (r) {
          if (r && r.day) map[r.day] = r;
        });
        state.themes = map;
      }

      if (cycleRes.error) {
        state.loading = false;
        state.loaded = false;
        state.schoolDays = [];
        state.bookings = {};
        state.error = cycleRes.error.message || "讀取循環日失敗";
        renderAll();
        return;
      }

      var days = (cycleRes.data || []).filter(function (r) {
        return r && r.day_date && r.cycle_day != null;
      });
      state.schoolDays = days;

      if (!days.length) {
        state.loading = false;
        state.loaded = true;
        state.bookings = {};
        renderAll();
        return;
      }

      var from = days[0].day_date;
      var to = days[days.length - 1].day_date;
      return client
        .from("morning_assemblies")
        .select("assembly_date,content,venue,booked_by,booked_by_code,booked_at,notes")
        .gte("assembly_date", from)
        .lte("assembly_date", to)
        .order("assembly_date", { ascending: true })
        .then(function (bookRes) {
          state.loading = false;
          if (bookRes.error) {
            state.error = bookRes.error.message || "讀取預約失敗";
            state.bookings = {};
            state.loaded = false;
          } else {
            var bmap = {};
            (bookRes.data || []).forEach(function (r) {
              if (r && r.assembly_date) bmap[r.assembly_date] = r;
            });
            state.bookings = bmap;
            state.loaded = true;
            state.error = "";
          }
          renderAll();
        });
    }).catch(function (err) {
      state.loading = false;
      state.loaded = false;
      state.schoolDays = [];
      state.bookings = {};
      state.error = (err && err.message) || "讀取失敗";
      renderAll();
    });
  }

  function addDay(iso) {
    var session = getSession();
    if (!canManage(session)) {
      setRowStatus(iso, "只限教職員", true);
      return;
    }
    var client = getClient();
    if (!client) {
      setRowStatus(iso, "未能連接資料庫", true);
      return;
    }
    if (state.savingIso) return;

    var content = readInput(iso);
    if (!content) {
      setRowStatus(iso, "請先輸入內容", true);
      return;
    }

    var email = String(session.email || "").trim().toLowerCase();
    var code = "";
    if (session.staff && session.staff.short_name) {
      code = String(session.staff.short_name).trim().toUpperCase();
    }
    var existing = state.bookings[iso] || {};

    state.savingIso = iso;
    setRowStatus(iso, "增加中…", false);

    var payload = {
      assembly_date: iso,
      content: content,
      venue: existing.venue || "",
      notes: existing.notes || "",
      booked_by: email,
      booked_by_code: code,
      booked_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    client
      .from("morning_assemblies")
      .upsert(payload, { onConflict: "assembly_date" })
      .then(function (res) {
        state.savingIso = "";
        if (res.error) {
          setRowStatus(iso, res.error.message || "增加失敗", true);
          return;
        }
        setRowStatus(iso, "已增加", false);
        notifyChanged();
        loadData();
      })
      .catch(function (err) {
        state.savingIso = "";
        setRowStatus(iso, (err && err.message) || "增加失敗", true);
      });
  }

  function bindListOnce() {
    if (state.bound) return;
    var list = $("home-ma-list");
    if (!list) return;
    state.bound = true;
    list.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-ma-action]") : null;
      if (!btn) return;
      var iso = btn.getAttribute("data-date");
      var action = btn.getAttribute("data-ma-action");
      if (!iso || action !== "add") return;
      addDay(iso);
    });
    list.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter") return;
      var input = ev.target && ev.target.classList && ev.target.classList.contains("ma-input")
        ? ev.target
        : null;
      if (!input) return;
      ev.preventDefault();
      var iso = input.getAttribute("data-date");
      if (iso) addDay(iso);
    });
  }

  function renderAll() {
    var list = $("home-ma-list");
    var empty = $("home-ma-empty");
    var formWrap = $("home-ma-staff");
    var studentNote = $("home-ma-student");
    if (!list) return;

    bindListOnce();

    var session = getSession();
    var manage = canManage(session);
    if (formWrap) formWrap.hidden = !manage;
    if (studentNote) studentNote.hidden = manage;

    if (!manage) {
      setMeta("");
      list.innerHTML = "";
      if (empty) empty.hidden = true;
      return;
    }

    if (state.error) {
      list.innerHTML = "";
      setMeta("");
      if (empty) {
        empty.hidden = false;
        empty.textContent = "未能載入早會預約：" + state.error;
      }
      return;
    }

    if (state.loading) {
      setMeta("載入未來 " + WINDOW_DAYS + " 個上學日…");
      return;
    }

    var days = state.schoolDays || [];
    if (!days.length) {
      list.innerHTML = "";
      setMeta("早會 · 未來 " + WINDOW_DAYS + " 個上學日");
      if (empty) {
        empty.hidden = false;
        empty.textContent = "未來日子暫時未有循環日資料。";
      }
      return;
    }

    if (empty) empty.hidden = true;
    var today = todayHK();
    var bookedCount = 0;
    days.forEach(function (d) {
      var b = state.bookings[d.day_date];
      if (b && String(b.content || "").trim()) bookedCount += 1;
    });

    setMeta(
      "未來 " + days.length + " 個上學日 · 已預約 " + bookedCount + " 日"
    );

    list.innerHTML = days.map(function (d) {
      var iso = d.day_date;
      var cycle = d.cycle_day;
      var theme = themeForDay(cycle);
      var defaultTheme = (theme && theme.theme) ? theme.theme : "—";
      var booking = state.bookings[iso] || null;
      var content = booking ? String(booking.content || "").trim() : "";
      var hasBooking = !!content;
      var who = bookerLabel(booking);
      var cls = ["ma-row"];
      if (iso === today) cls.push("is-today");
      if (hasBooking) cls.push("is-booked");

      var current = hasBooking
        ? '<div class="ma-current muted">已約：' + escapeHtml(content) +
          (who ? "（" + escapeHtml(who) + "）" : "") + "</div>"
        : '<div class="ma-current muted">預設：' + escapeHtml(defaultTheme) + "</div>";

      return (
        '<div class="' + cls.join(" ") + '" data-date="' + escapeHtml(iso) + '">' +
          '<div class="ma-row-label">' +
            '<strong>' + escapeHtml(formatDisplayDate(iso)) + "</strong>" +
            '<span class="ma-cycle">Day ' + escapeHtml(String(cycle)) + "</span>" +
            (iso === today ? '<span class="ma-today-badge">今日</span>' : "") +
          "</div>" +
          current +
          '<div class="ma-row-add">' +
            '<input type="text" class="ma-input" data-date="' + escapeHtml(iso) +
              '" maxlength="' + CONTENT_MAX +
              '" placeholder="早會內容" value="' + escapeHtml(content) +
              '" aria-label="' + escapeHtml(formatDisplayDate(iso) + " 早會內容") + '" />' +
            '<button type="button" class="home-memo-btn home-memo-btn-save ma-add-btn" data-ma-action="add" data-date="' +
              escapeHtml(iso) + '">增加</button>' +
            '<span class="ma-status home-memo-status" data-date="' + escapeHtml(iso) + '" aria-live="polite"></span>' +
          "</div>" +
        "</div>"
      );
    }).join("");
  }

  function show() {
    if (!state.loaded && !state.loading) {
      loadData();
    } else {
      renderAll();
    }
  }

  window.SchoolAdminMorningAssemblies = {
    show: show,
    refresh: function () {
      state.loaded = false;
      return loadData();
    }
  };
})();
