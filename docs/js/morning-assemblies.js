(function () {
  "use strict";

  /**
   * 早會 — staff booking of morning-assembly content + venue for the next 10 school days.
   * Source: public.morning_assemblies (dated overrides).
   * Defaults: public.assembly_by_day (cycle-day theme) when content empty.
   * School days: public.cycle_days where cycle_day IS NOT NULL.
   */

  var CONTENT_MAX = 500;
  var VENUE_MAX = 80;
  var NOTES_MAX = 200;
  var WINDOW_DAYS = 10;
  var DEFAULT_VENUE_HINT = "禮堂";

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
    var y = parseInt(m[1], 10);
    var mo = parseInt(m[2], 10);
    var d = parseInt(m[3], 10);
    var wd = ["日", "一", "二", "三", "四", "五", "六"];
    var dt = new Date(Date.UTC(y, mo - 1, d));
    var w = wd[dt.getUTCDay()];
    return mo + "/" + d + "（" + w + "）";
  }

  function themeForDay(cycleDay) {
    var t = state.themes[cycleDay] || state.themes[String(cycleDay)];
    return t || null;
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

  function readCardInputs(iso) {
    var contentEl = document.querySelector('.ma-content[data-date="' + iso + '"]');
    var venueEl = document.querySelector('.ma-venue[data-date="' + iso + '"]');
    var notesEl = document.querySelector('.ma-notes[data-date="' + iso + '"]');
    var content = contentEl ? String(contentEl.value || "").trim() : "";
    var venue = venueEl ? String(venueEl.value || "").trim() : "";
    var notes = notesEl ? String(notesEl.value || "").trim() : "";
    if (content.length > CONTENT_MAX) content = content.slice(0, CONTENT_MAX);
    if (venue.length > VENUE_MAX) venue = venue.slice(0, VENUE_MAX);
    if (notes.length > NOTES_MAX) notes = notes.slice(0, NOTES_MAX);
    return { content: content, venue: venue, notes: notes };
  }

  function setCardStatus(iso, msg, isErr) {
    var el = document.querySelector('.ma-status[data-date="' + iso + '"]');
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("is-err", !!isErr);
  }

  function saveDay(iso) {
    var session = getSession();
    if (!canManage(session)) {
      setCardStatus(iso, "只限教職員預約", true);
      return;
    }
    var client = getClient();
    if (!client) {
      setCardStatus(iso, "未能連接資料庫", true);
      return;
    }
    if (state.savingIso) return;

    var vals = readCardInputs(iso);
    var email = String(session.email || "").trim().toLowerCase();
    var code = "";
    if (session.staff && session.staff.short_name) {
      code = String(session.staff.short_name).trim().toUpperCase();
    }

    state.savingIso = iso;
    setCardStatus(iso, "儲存中…", false);

    var empty = !vals.content && !vals.venue && !vals.notes;
    var existing = state.bookings[iso];

    var done = function (errMsg) {
      state.savingIso = "";
      if (errMsg) {
        setCardStatus(iso, errMsg, true);
        return;
      }
      setCardStatus(iso, "已儲存", false);
      notifyChanged();
      loadData();
    };

    if (empty) {
      if (!existing) {
        state.savingIso = "";
        setCardStatus(iso, "未有變更", false);
        return;
      }
      client
        .from("morning_assemblies")
        .delete()
        .eq("assembly_date", iso)
        .then(function (res) {
          if (res.error) done(res.error.message || "清除失敗");
          else done(null);
        })
        .catch(function (err) {
          done((err && err.message) || "清除失敗");
        });
      return;
    }

    var payload = {
      assembly_date: iso,
      content: vals.content,
      venue: vals.venue,
      notes: vals.notes,
      booked_by: email,
      booked_by_code: code,
      booked_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    client
      .from("morning_assemblies")
      .upsert(payload, { onConflict: "assembly_date" })
      .then(function (res) {
        if (res.error) done(res.error.message || "儲存失敗");
        else done(null);
      })
      .catch(function (err) {
        done((err && err.message) || "儲存失敗");
      });
  }

  function clearDay(iso) {
    var contentEl = document.querySelector('.ma-content[data-date="' + iso + '"]');
    var venueEl = document.querySelector('.ma-venue[data-date="' + iso + '"]');
    var notesEl = document.querySelector('.ma-notes[data-date="' + iso + '"]');
    if (contentEl) contentEl.value = "";
    if (venueEl) venueEl.value = "";
    if (notesEl) notesEl.value = "";
    saveDay(iso);
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
      if (!iso || !action) return;
      if (action === "save") saveDay(iso);
      else if (action === "clear") clearDay(iso);
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
      setMeta("早會預約 · 未來 " + WINDOW_DAYS + " 個上學日");
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
      if (b && (b.content || b.venue || b.notes)) bookedCount += 1;
    });

    setMeta(
      "未來 " + days.length + " 個上學日（由 " + formatDisplayDate(days[0].day_date) +
      " 起）· 已預約／改場地 " + bookedCount + " 日"
    );

    list.innerHTML = days.map(function (d) {
      var iso = d.day_date;
      var cycle = d.cycle_day;
      var theme = themeForDay(cycle);
      var defaultTheme = (theme && theme.theme) ? theme.theme : "—";
      var flag = theme && theme.is_flag;
      var booking = state.bookings[iso] || null;
      var content = booking ? (booking.content || "") : "";
      var venue = booking ? (booking.venue || "") : "";
      var notes = booking ? (booking.notes || "") : "";
      var hasBooking = !!(content || venue || notes);
      var cls = ["ma-card"];
      if (iso === today) cls.push("is-today");
      if (hasBooking) cls.push("is-booked");
      else cls.push("is-empty");

      var who = bookerLabel(booking);
      var whoLine = who
        ? '<div class="ma-booked-by muted">預約：' + escapeHtml(who) +
          (booking && booking.booked_at
            ? ' · <span class="ma-booked-at">' + escapeHtml(String(booking.booked_at).replace("T", " ").slice(0, 16)) + "</span>"
            : "") +
          "</div>"
        : (hasBooking ? "" : '<div class="ma-booked-by muted">尚未預約內容</div>');

      return (
        '<article class="' + cls.join(" ") + '" data-date="' + escapeHtml(iso) + '">' +
          '<header class="ma-card-head">' +
            '<div class="ma-card-date">' +
              '<strong>' + escapeHtml(formatDisplayDate(iso)) + "</strong>" +
              '<span class="ma-cycle">Day ' + escapeHtml(String(cycle)) + "</span>" +
              (iso === today ? '<span class="ma-today-badge">今日</span>' : "") +
              (flag ? '<span class="ma-flag-badge">升國旗</span>' : "") +
            "</div>" +
            '<div class="ma-default muted">預設主題：' + escapeHtml(defaultTheme) + "</div>" +
            whoLine +
          "</header>" +
          '<label class="ma-label" for="ma-content-' + escapeHtml(iso) + '">早會內容（預約）</label>' +
          '<textarea id="ma-content-' + escapeHtml(iso) + '" class="ma-content" data-date="' + escapeHtml(iso) +
            '" rows="2" maxlength="' + CONTENT_MAX + '" placeholder="例如：學生會報告／嘉賓分享…">' +
            escapeHtml(content) + "</textarea>" +
          '<div class="ma-row">' +
            '<label class="ma-label" for="ma-venue-' + escapeHtml(iso) + '">場地更改' +
              '<input id="ma-venue-' + escapeHtml(iso) + '" type="text" class="ma-venue" data-date="' +
                escapeHtml(iso) + '" maxlength="' + VENUE_MAX +
                '" placeholder="預設 ' + DEFAULT_VENUE_HINT + '（留空＝唔改）" value="' + escapeHtml(venue) + '" />' +
            "</label>" +
            '<label class="ma-label" for="ma-notes-' + escapeHtml(iso) + '">備註' +
              '<input id="ma-notes-' + escapeHtml(iso) + '" type="text" class="ma-notes" data-date="' +
                escapeHtml(iso) + '" maxlength="' + NOTES_MAX +
                '" placeholder="可選" value="' + escapeHtml(notes) + '" />' +
            "</label>" +
          "</div>" +
          '<div class="ma-actions">' +
            '<button type="button" class="home-memo-btn home-memo-btn-save" data-ma-action="save" data-date="' +
              escapeHtml(iso) + '">儲存</button>' +
            '<button type="button" class="home-memo-btn home-memo-btn-danger" data-ma-action="clear" data-date="' +
              escapeHtml(iso) + '"' + (hasBooking ? "" : " disabled") + ">清除預約</button>" +
            '<span class="ma-status home-memo-status" data-date="' + escapeHtml(iso) + '" aria-live="polite"></span>' +
          "</div>" +
        "</article>"
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
