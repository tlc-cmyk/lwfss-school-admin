(function () {
  "use strict";

  /**
   * 早會 — multi-item announcements per school day.
   * UI: item list (drag reorder) + one input + 「增加」 per day.
   * Source: public.morning_assembly_items; defaults from assembly_by_day.
   */

  var CONTENT_MAX = 500;
  var WINDOW_DAYS = 10;

  var state = {
    loaded: false,
    loading: false,
    saving: false,
    error: "",
    schoolDays: [],
    /** @type {Object.<string, object[]>} */
    itemsByDate: {},
    themes: {},
    bound: false,
    drag: {
      itemId: null,
      fromIso: null
    }
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
    if (!meta) return;
    // Hint/summary lines intentionally not shown; keep node only for rare status if needed.
    meta.textContent = "";
    meta.hidden = true;
  }

  function setDayStatus(iso, msg, isErr) {
    var el = document.querySelector('.ma-status[data-date="' + iso + '"]');
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("is-err", !!isErr);
  }

  function sortItems(arr) {
    return (arr || []).slice().sort(function (a, b) {
      var sa = parseInt(a.sort_order, 10) || 0;
      var sb = parseInt(b.sort_order, 10) || 0;
      if (sa !== sb) return sa - sb;
      return (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0);
    });
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
        state.itemsByDate = {};
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
        state.itemsByDate = {};
        renderAll();
        return;
      }

      var from = days[0].day_date;
      var to = days[days.length - 1].day_date;
      return client
        .from("morning_assembly_items")
        .select("id,assembly_date,content,sort_order,booked_by,booked_by_code,booked_at")
        .gte("assembly_date", from)
        .lte("assembly_date", to)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
        .then(function (itemRes) {
          state.loading = false;
          if (itemRes.error) {
            state.error = itemRes.error.message || "讀取事項失敗";
            state.itemsByDate = {};
            state.loaded = false;
          } else {
            var byDate = {};
            (itemRes.data || []).forEach(function (r) {
              if (!r || !r.assembly_date) return;
              if (!byDate[r.assembly_date]) byDate[r.assembly_date] = [];
              byDate[r.assembly_date].push(r);
            });
            Object.keys(byDate).forEach(function (iso) {
              byDate[iso] = sortItems(byDate[iso]);
            });
            state.itemsByDate = byDate;
            state.loaded = true;
            state.error = "";
          }
          renderAll();
        });
    }).catch(function (err) {
      state.loading = false;
      state.loaded = false;
      state.schoolDays = [];
      state.itemsByDate = {};
      state.error = (err && err.message) || "讀取失敗";
      renderAll();
    });
  }

  function addItem(iso) {
    var session = getSession();
    if (!canManage(session)) {
      setDayStatus(iso, "只限教職員", true);
      return;
    }
    var client = getClient();
    if (!client) {
      setDayStatus(iso, "未能連接資料庫", true);
      return;
    }
    if (state.saving) return;

    var input = document.querySelector('.ma-input[data-date="' + iso + '"]');
    var content = input ? String(input.value || "").trim() : "";
    if (content.length > CONTENT_MAX) content = content.slice(0, CONTENT_MAX);
    if (!content) {
      setDayStatus(iso, "請先輸入內容", true);
      return;
    }

    var email = String(session.email || "").trim().toLowerCase();
    var code = "";
    if (session.staff && session.staff.short_name) {
      code = String(session.staff.short_name).trim().toUpperCase();
    }
    var existing = sortItems(state.itemsByDate[iso] || []);
    var nextOrder = 0;
    existing.forEach(function (it) {
      var n = parseInt(it.sort_order, 10) || 0;
      if (n + 1 > nextOrder) nextOrder = n + 1;
    });

    state.saving = true;
    setDayStatus(iso, "增加中…", false);

    client
      .from("morning_assembly_items")
      .insert({
        assembly_date: iso,
        content: content,
        sort_order: nextOrder,
        booked_by: email,
        booked_by_code: code,
        booked_at: new Date().toISOString()
      })
      .then(function (res) {
        state.saving = false;
        if (res.error) {
          setDayStatus(iso, res.error.message || "增加失敗", true);
          return;
        }
        if (input) input.value = "";
        setDayStatus(iso, "已增加", false);
        notifyChanged();
        loadData();
      })
      .catch(function (err) {
        state.saving = false;
        setDayStatus(iso, (err && err.message) || "增加失敗", true);
      });
  }

  function deleteItem(iso, itemId) {
    var session = getSession();
    if (!canManage(session)) {
      setDayStatus(iso, "只限教職員", true);
      return;
    }
    var client = getClient();
    if (!client || state.saving) return;
    if (!window.confirm("刪除此宣布事項？")) return;

    state.saving = true;
    setDayStatus(iso, "刪除中…", false);
    client
      .from("morning_assembly_items")
      .delete()
      .eq("id", itemId)
      .then(function (res) {
        state.saving = false;
        if (res.error) {
          setDayStatus(iso, res.error.message || "刪除失敗", true);
          return;
        }
        setDayStatus(iso, "已刪除", false);
        notifyChanged();
        loadData();
      })
      .catch(function (err) {
        state.saving = false;
        setDayStatus(iso, (err && err.message) || "刪除失敗", true);
      });
  }

  function persistOrder(iso, orderedIds) {
    var client = getClient();
    if (!client || !orderedIds || !orderedIds.length) return Promise.resolve();
    state.saving = true;
    setDayStatus(iso, "更新排序…", false);

    var updates = orderedIds.map(function (id, idx) {
      return client
        .from("morning_assembly_items")
        .update({ sort_order: idx, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("assembly_date", iso);
    });

    return Promise.all(updates)
      .then(function (results) {
        state.saving = false;
        for (var i = 0; i < results.length; i++) {
          if (results[i] && results[i].error) {
            setDayStatus(iso, results[i].error.message || "排序失敗", true);
            loadData();
            return;
          }
        }
        // Keep local state in sync
        var byId = {};
        (state.itemsByDate[iso] || []).forEach(function (it) { byId[String(it.id)] = it; });
        state.itemsByDate[iso] = orderedIds.map(function (id, idx) {
          var row = byId[String(id)];
          if (row) row.sort_order = idx;
          return row;
        }).filter(Boolean);
        setDayStatus(iso, "已更新排序", false);
        notifyChanged();
      })
      .catch(function (err) {
        state.saving = false;
        setDayStatus(iso, (err && err.message) || "排序失敗", true);
        loadData();
      });
  }

  function reorderDom(listEl, dragged, target) {
    if (!listEl || !dragged || !target || dragged === target) return null;
    var items = Array.prototype.slice.call(listEl.querySelectorAll(".ma-item"));
    var from = items.indexOf(dragged);
    var to = items.indexOf(target);
    if (from < 0 || to < 0 || from === to) return null;
    if (from < to) listEl.insertBefore(dragged, target.nextSibling);
    else listEl.insertBefore(dragged, target);
    return Array.prototype.map.call(listEl.querySelectorAll(".ma-item"), function (el) {
      return el.getAttribute("data-id");
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
      var action = btn.getAttribute("data-ma-action");
      var iso = btn.getAttribute("data-date");
      if (!action) return;
      if (action === "add" && iso) {
        addItem(iso);
        return;
      }
      if (action === "delete") {
        var id = btn.getAttribute("data-id");
        iso = btn.getAttribute("data-date");
        if (iso && id) deleteItem(iso, id);
      }
    });

    list.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter") return;
      var input = ev.target && ev.target.classList && ev.target.classList.contains("ma-input")
        ? ev.target
        : null;
      if (!input) return;
      ev.preventDefault();
      var iso = input.getAttribute("data-date");
      if (iso) addItem(iso);
    });

    list.addEventListener("dragstart", function (ev) {
      var item = ev.target && ev.target.closest ? ev.target.closest(".ma-item") : null;
      if (!item) return;
      state.drag.itemId = item.getAttribute("data-id");
      state.drag.fromIso = item.getAttribute("data-date");
      item.classList.add("is-dragging");
      try {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", state.drag.itemId || "");
      } catch (e) { /* ignore */ }
    });

    list.addEventListener("dragend", function (ev) {
      var item = ev.target && ev.target.closest ? ev.target.closest(".ma-item") : null;
      if (item) item.classList.remove("is-dragging");
      Array.prototype.forEach.call(list.querySelectorAll(".ma-item.is-drag-over"), function (el) {
        el.classList.remove("is-drag-over");
      });
      state.drag.itemId = null;
      state.drag.fromIso = null;
    });

    list.addEventListener("dragover", function (ev) {
      var item = ev.target && ev.target.closest ? ev.target.closest(".ma-item") : null;
      if (!item) return;
      if (item.getAttribute("data-date") !== state.drag.fromIso) return;
      ev.preventDefault();
      try { ev.dataTransfer.dropEffect = "move"; } catch (e) { /* ignore */ }
      Array.prototype.forEach.call(list.querySelectorAll(".ma-item.is-drag-over"), function (el) {
        if (el !== item) el.classList.remove("is-drag-over");
      });
      item.classList.add("is-drag-over");
    });

    list.addEventListener("dragleave", function (ev) {
      var item = ev.target && ev.target.closest ? ev.target.closest(".ma-item") : null;
      if (item) item.classList.remove("is-drag-over");
    });

    list.addEventListener("drop", function (ev) {
      var target = ev.target && ev.target.closest ? ev.target.closest(".ma-item") : null;
      if (!target) return;
      var iso = target.getAttribute("data-date");
      if (!iso || iso !== state.drag.fromIso) return;
      ev.preventDefault();
      target.classList.remove("is-drag-over");
      var dragged = list.querySelector('.ma-item[data-id="' + state.drag.itemId + '"]');
      var dayList = target.parentNode;
      var ordered = reorderDom(dayList, dragged, target);
      if (ordered && ordered.length) persistOrder(iso, ordered);
    });
  }

  function renderItems(iso, items) {
    items = sortItems(items || []);
    if (!items.length) {
      return '<div class="ma-items-empty muted">尚未有宣布事項（可拖拉排序）</div>';
    }
    return (
      '<ul class="ma-items" data-date="' + escapeHtml(iso) + '">' +
      items.map(function (it) {
        var who = bookerLabel(it);
        return (
          '<li class="ma-item" draggable="true" data-id="' + escapeHtml(String(it.id)) +
            '" data-date="' + escapeHtml(iso) + '">' +
            '<span class="ma-item-handle" title="拖拉排序" aria-hidden="true">⋮⋮</span>' +
            '<div class="ma-item-body">' +
              '<div class="ma-item-text">' + escapeHtml(it.content || "") + "</div>" +
              (who ? '<div class="ma-item-who muted">' + escapeHtml(who) + "</div>" : "") +
            "</div>" +
            '<button type="button" class="ma-item-del" data-ma-action="delete" data-date="' +
              escapeHtml(iso) + '" data-id="' + escapeHtml(String(it.id)) +
              '" title="刪除" aria-label="刪除事項">×</button>' +
          "</li>"
        );
      }).join("") +
      "</ul>"
    );
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
    var itemCount = 0;
    days.forEach(function (d) {
      itemCount += (state.itemsByDate[d.day_date] || []).length;
    });

    setMeta("未來 " + days.length + " 個上學日 · 共 " + itemCount + " 項宣布");

    list.innerHTML = days.map(function (d) {
      var iso = d.day_date;
      var cycle = d.cycle_day;
      var theme = themeForDay(cycle);
      var defaultTheme = (theme && theme.theme) ? theme.theme : "—";
      var items = state.itemsByDate[iso] || [];
      var cls = ["ma-day"];
      if (iso === today) cls.push("is-today");
      if (items.length) cls.push("is-booked");

      return (
        '<section class="' + cls.join(" ") + '" data-date="' + escapeHtml(iso) + '">' +
          '<div class="ma-day-head">' +
            '<div class="ma-day-label">' +
              '<strong>' + escapeHtml(formatDisplayDate(iso)) + "</strong>" +
              '<span class="ma-cycle">Day ' + escapeHtml(String(cycle)) + "</span>" +
              (iso === today ? '<span class="ma-today-badge">今日</span>' : "") +
            "</div>" +
            '<div class="ma-default muted">預設：' + escapeHtml(defaultTheme) + "</div>" +
          "</div>" +
          renderItems(iso, items) +
          '<div class="ma-day-add">' +
            '<input type="text" class="ma-input" data-date="' + escapeHtml(iso) +
              '" maxlength="' + CONTENT_MAX +
              '" placeholder="新增宣布事項" aria-label="' +
              escapeHtml(formatDisplayDate(iso) + " 新增宣布事項") + '" />' +
            '<button type="button" class="home-memo-btn home-memo-btn-save ma-add-btn" data-ma-action="add" data-date="' +
              escapeHtml(iso) + '">增加</button>' +
            '<span class="ma-status home-memo-status" data-date="' + escapeHtml(iso) + '" aria-live="polite"></span>' +
          "</div>" +
        "</section>"
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
