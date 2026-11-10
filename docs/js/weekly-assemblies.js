(function () {
  "use strict";

  /**
   * Day8 周會總表 — dated weekly assembly schedule as a month-grouped timeline.
   * Source: public.weekly_assemblies. Timeslot context: 循環日 Day 8 · 第6–7節.
   */

  var ACADEMIC_YEAR = "2026-2027";
  var FORM_KEYS = ["s1", "s2", "s3", "s4", "s5", "s6"];
  var FORM_LABELS = ["中一", "中二", "中三", "中四", "中五", "中六"];

  var state = {
    loaded: false,
    loading: false,
    error: "",
    rows: [],
    formFilter: "all",
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

  function getClient() {
    var auth = window.SchoolAdminAuth;
    return (auth && auth.getClient && auth.getClient()) || window.__supabaseClient || null;
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

  function browseDate() {
    if (window.SchoolAdminHome && typeof SchoolAdminHome.getBrowseDate === "function") {
      return SchoolAdminHome.getBrowseDate() || todayHK();
    }
    return todayHK();
  }

  function parseIso(iso) {
    var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return {
      y: parseInt(m[1], 10),
      mo: parseInt(m[2], 10),
      d: parseInt(m[3], 10),
      weekday: new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))).getUTCDay()
    };
  }

  function formatDisplayDate(iso) {
    var p = parseIso(iso);
    if (!p) return iso || "—";
    var wd = ["日", "一", "二", "三", "四", "五", "六"];
    return p.mo + "月" + p.d + "日 星期" + wd[p.weekday];
  }

  function formatMonthHeading(iso) {
    var p = parseIso(iso);
    if (!p) return iso || "";
    return p.y + "年" + p.mo + "月";
  }

  function monthKey(iso) {
    return String(iso || "").slice(0, 7);
  }

  function isCancelled(row) {
    return /取消/.test(String((row && row.venue) || ""));
  }

  function programmeText(row, key) {
    return String((row && row[key]) || "").trim();
  }

  function formatFormRange(indices) {
    if (!indices.length) return "";
    var parts = [];
    var start = indices[0];
    var prev = indices[0];
    for (var i = 1; i <= indices.length; i++) {
      var cur = i < indices.length ? indices[i] : null;
      if (cur === prev + 1) {
        prev = cur;
        continue;
      }
      if (start === prev) {
        parts.push(FORM_LABELS[start]);
      } else {
        parts.push(FORM_LABELS[start] + "–" + FORM_LABELS[prev]);
      }
      start = cur;
      prev = cur;
    }
    return parts.join("、");
  }

  function formProgrammeGroups(row) {
    var items = [];
    var i;
    for (i = 0; i < FORM_KEYS.length; i++) {
      var text = programmeText(row, FORM_KEYS[i]);
      if (!text) continue;
      items.push({ index: i, text: text });
    }
    if (!items.length) return [];

    if (items.length === 6) {
      var same = true;
      for (i = 1; i < 6; i++) {
        if (items[i].text !== items[0].text) {
          same = false;
          break;
        }
      }
      if (same) {
        return [{ formsLabel: "全校", text: items[0].text, keys: FORM_KEYS.slice() }];
      }
    }

    var groups = [];
    var map = Object.create(null);
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (!map[it.text]) {
        map[it.text] = { text: it.text, indices: [] };
        groups.push(map[it.text]);
      }
      map[it.text].indices.push(it.index);
    }

    return groups.map(function (g) {
      return {
        formsLabel: formatFormRange(g.indices),
        text: g.text,
        keys: g.indices.map(function (idx) { return FORM_KEYS[idx]; })
      };
    });
  }

  function groupsForFilter(row, filter) {
    var groups = formProgrammeGroups(row);
    if (!filter || filter === "all") return groups;
    return groups.filter(function (g) {
      return g.keys.indexOf(filter) !== -1;
    }).map(function (g) {
      var idx = FORM_KEYS.indexOf(filter);
      return {
        formsLabel: idx >= 0 ? FORM_LABELS[idx] : g.formsLabel,
        text: g.text,
        keys: [filter]
      };
    });
  }

  function rowMatchesFilter(row, filter) {
    if (!filter || filter === "all") return true;
    return !!programmeText(row, filter);
  }

  function findNextRow(rows, fromIso, filter) {
    var i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.assembly_date >= fromIso && !isCancelled(r) && rowMatchesFilter(r, filter)) {
        return r;
      }
    }
    return null;
  }

  function findTodayRow(rows, today, filter) {
    var i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].assembly_date === today && rowMatchesFilter(rows[i], filter)) {
        return rows[i];
      }
    }
    return null;
  }

  function bind() {
    if (state.bound) return;
    var filters = $("home-wa-filters");
    if (!filters) return;
    state.bound = true;
    filters.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-wa-form]");
      if (!btn || !filters.contains(btn)) return;
      var next = btn.getAttribute("data-wa-form") || "all";
      if (next === state.formFilter) return;
      state.formFilter = next;
      renderAll();
    });
  }

  function syncFilterChips() {
    var filters = $("home-wa-filters");
    if (!filters) return;
    var buttons = filters.querySelectorAll("[data-wa-form]");
    for (var i = 0; i < buttons.length; i++) {
      var on = (buttons[i].getAttribute("data-wa-form") || "all") === state.formFilter;
      buttons[i].classList.toggle("active", on);
      buttons[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function renderProgrammes(groups) {
    if (!groups.length) return "";
    return (
      '<ul class="wa-progs">' +
      groups.map(function (g) {
        return (
          '<li class="wa-prog">' +
            '<span class="wa-prog-forms">' + escapeHtml(g.formsLabel) + "</span>" +
            '<span class="wa-prog-text">' + escapeHtml(g.text) + "</span>" +
          "</li>"
        );
      }).join("") +
      "</ul>"
    );
  }

  function renderVenue(row) {
    var venue = String((row && row.venue) || "").trim();
    if (isCancelled(row)) {
      return (
        '<div class="wa-venue-line">' +
          '<span class="wa-badge wa-badge-cancelled">取消</span>' +
          (venue ? '<span class="wa-venue">' + escapeHtml(venue) + "</span>" : "") +
        "</div>"
      );
    }
    if (!venue) return "";
    return (
      '<div class="wa-venue-line">' +
        '<span class="wa-venue">' + escapeHtml(venue) + "</span>" +
      "</div>"
    );
  }

  function renderTheme(row) {
    var theme = String((row && row.theme_week) || "").trim();
    if (!theme) return "";
    return '<span class="wa-theme">' + escapeHtml(theme) + "</span>";
  }

  function cardClasses(row, ctx) {
    var cls = ["wa-card"];
    if (row.assembly_date === ctx.today) cls.push("is-today");
    if (row.assembly_date === ctx.browse) cls.push("is-browse");
    if (ctx.nextIso && row.assembly_date === ctx.nextIso) cls.push("is-next");
    if (isCancelled(row)) cls.push("is-cancelled");
    return cls.join(" ");
  }

  function statusBadges(row, ctx, opts) {
    var badges = [];
    if (opts && opts.pinKind === "today") {
      badges.push('<span class="wa-badge wa-badge-today">今日</span>');
    } else if (opts && opts.pinKind === "next") {
      badges.push('<span class="wa-badge wa-badge-next">下次</span>');
    } else {
      if (row.assembly_date === ctx.today) {
        badges.push('<span class="wa-badge wa-badge-today">今日</span>');
      } else if (ctx.nextIso && row.assembly_date === ctx.nextIso) {
        badges.push('<span class="wa-badge wa-badge-next">下次</span>');
      }
    }
    return badges.join("");
  }

  function renderCard(row, ctx, opts) {
    var groups = groupsForFilter(row, ctx.filter);
    var badges = statusBadges(row, ctx, opts);
    var theme = renderTheme(row);
    return (
      '<article class="' + cardClasses(row, ctx) + '" data-date="' + escapeHtml(row.assembly_date) + '">' +
        '<header class="wa-card-head">' +
          '<div class="wa-card-when">' +
            '<time class="wa-card-date" datetime="' + escapeHtml(row.assembly_date) + '">' +
              escapeHtml(formatDisplayDate(row.assembly_date)) +
            "</time>" +
            (badges ? '<span class="wa-card-badges">' + badges + "</span>" : "") +
          "</div>" +
          (theme ? '<div class="wa-card-theme">' + theme + "</div>" : "") +
        "</header>" +
        renderVenue(row) +
        renderProgrammes(groups) +
      "</article>"
    );
  }

  function renderPinned(ctx) {
    var el = $("home-wa-next");
    if (!el) return;
    var row = ctx.todayRow || ctx.nextRow;
    if (!row) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    var kind = ctx.todayRow ? "today" : "next";
    var title = kind === "today" ? "今日周會" : "下次周會";
    el.hidden = false;
    el.innerHTML =
      '<p class="wa-next-kicker">' + title + "</p>" +
      renderCard(row, ctx, { pinKind: kind });
  }

  function renderTimeline(rows, ctx) {
    var wrap = $("home-wa-list");
    if (!wrap) return 0;
    var visible = rows.filter(function (r) { return rowMatchesFilter(r, ctx.filter); });
    if (!visible.length) {
      wrap.innerHTML = "";
      return 0;
    }

    var html = "";
    var currentMonth = "";
    var i;
    for (i = 0; i < visible.length; i++) {
      var r = visible[i];
      var mk = monthKey(r.assembly_date);
      if (mk !== currentMonth) {
        if (currentMonth) html += "</div></section>";
        currentMonth = mk;
        html +=
          '<section class="wa-month">' +
            '<h3 class="wa-month-title">' + escapeHtml(formatMonthHeading(r.assembly_date)) + "</h3>" +
            '<div class="wa-month-cards">';
      }
      html += renderCard(r, ctx, null);
    }
    if (currentMonth) html += "</div></section>";
    wrap.innerHTML = html;
    return visible.length;
  }

  function loadData() {
    var client = getClient();
    var meta = $("home-wa-meta");
    var empty = $("home-wa-empty");
    var wrap = $("home-wa-list");
    var next = $("home-wa-next");
    if (!client) {
      state.error = "未能連接資料庫";
      state.loading = false;
      renderAll();
      return Promise.resolve();
    }
    state.loading = true;
    state.error = "";
    if (meta) meta.textContent = "載入周會編排…";
    if (empty) empty.hidden = true;
    if (wrap) wrap.innerHTML = "";
    if (next) {
      next.hidden = true;
      next.innerHTML = "";
    }

    return client
      .from("weekly_assemblies")
      .select("assembly_date,theme_week,s1,s2,s3,s4,s5,s6,venue,academic_year,sort_order")
      .eq("academic_year", ACADEMIC_YEAR)
      .order("sort_order", { ascending: true })
      .order("assembly_date", { ascending: true })
      .then(function (res) {
        state.loading = false;
        if (res.error) {
          state.error = res.error.message || "讀取失敗";
          state.rows = [];
          state.loaded = false;
        } else {
          state.rows = res.data || [];
          state.loaded = true;
          state.error = "";
        }
        renderAll();
      })
      .catch(function (err) {
        state.loading = false;
        state.loaded = false;
        state.rows = [];
        state.error = (err && err.message) || "讀取失敗";
        renderAll();
      });
  }

  function renderAll() {
    bind();
    syncFilterChips();

    var meta = $("home-wa-meta");
    var empty = $("home-wa-empty");
    var wrap = $("home-wa-list");
    var next = $("home-wa-next");
    if (!wrap) return;

    if (state.error) {
      wrap.innerHTML = "";
      if (next) {
        next.hidden = true;
        next.innerHTML = "";
      }
      if (meta) meta.textContent = "";
      if (empty) {
        empty.hidden = false;
        empty.textContent = "未能載入周會編排：" + state.error;
      }
      return;
    }

    if (state.loading) {
      if (meta) meta.textContent = "載入周會編排…";
      return;
    }

    var rows = state.rows || [];
    if (!rows.length) {
      wrap.innerHTML = "";
      if (next) {
        next.hidden = true;
        next.innerHTML = "";
      }
      if (meta) meta.textContent = ACADEMIC_YEAR.replace("-", "–") + " · Day 8 · P6–P7";
      if (empty) {
        empty.hidden = false;
        empty.textContent = "暫時未有周會編排。";
      }
      return;
    }

    var today = todayHK();
    var browse = browseDate();
    var filter = state.formFilter || "all";
    var todayRow = findTodayRow(rows, today, filter);
    var nextRow = findNextRow(rows, today, filter);
    var ctx = {
      today: today,
      browse: browse,
      filter: filter,
      todayRow: todayRow,
      nextRow: nextRow,
      nextIso: nextRow ? nextRow.assembly_date : ""
    };

    if (meta) {
      meta.textContent = ACADEMIC_YEAR.replace("-", "–") + " · 共 " + rows.length + " 次 · Day 8 · P6–P7";
    }

    renderPinned(ctx);
    var shown = renderTimeline(rows, ctx);
    if (empty) {
      if (!shown) {
        empty.hidden = false;
        var labelIdx = FORM_KEYS.indexOf(filter);
        var label = labelIdx >= 0 ? FORM_LABELS[labelIdx] : "";
        empty.textContent = label ? ("此篩選下未有" + label + "的周會編排。") : "暫時未有周會編排。";
      } else {
        empty.hidden = true;
      }
    }
  }

  function show() {
    bind();
    if (!state.loaded && !state.loading) {
      loadData();
    } else {
      renderAll();
    }
  }

  window.SchoolAdminWeeklyAssemblies = {
    show: show,
    refresh: function () {
      state.loaded = false;
      return loadData();
    }
  };
})();
