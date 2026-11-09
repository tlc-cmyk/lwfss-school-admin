(function () {
  "use strict";

  /**
   * Day8 周會總表 — full dated weekly assembly schedule (周會).
   * Source: public.weekly_assemblies (Sheet「2627年度週會編排總表」).
   * Timeslot context: 循環日 Day 8 · 第6–7節.
   */

  var ACADEMIC_YEAR = "2026-2027";
  var FORM_KEYS = ["s1", "s2", "s3", "s4", "s5", "s6"];
  var FORM_LABELS = ["中一", "中二", "中三", "中四", "中五", "中六"];

  var state = {
    loaded: false,
    loading: false,
    error: "",
    rows: [],
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

  function isCancelled(row) {
    return /取消/.test(String((row && row.venue) || ""));
  }

  function loadData() {
    var client = getClient();
    var meta = $("home-wa-meta");
    var empty = $("home-wa-empty");
    var wrap = $("home-wa-table-wrap");
    if (!client) {
      state.error = "未能連接資料庫";
      state.loading = false;
      renderAll();
      return Promise.resolve();
    }
    state.loading = true;
    state.error = "";
    if (meta) meta.textContent = "載入周會總表…";
    if (empty) empty.hidden = true;
    if (wrap) wrap.innerHTML = "";

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
    var meta = $("home-wa-meta");
    var empty = $("home-wa-empty");
    var wrap = $("home-wa-table-wrap");
    if (!wrap) return;

    if (state.error) {
      wrap.innerHTML = "";
      if (meta) meta.textContent = "";
      if (empty) {
        empty.hidden = false;
        empty.textContent = "未能載入周會總表：" + state.error;
      }
      return;
    }

    if (state.loading) {
      if (meta) meta.textContent = "載入周會總表…";
      return;
    }

    var rows = state.rows || [];
    if (!rows.length) {
      wrap.innerHTML = "";
      if (meta) meta.textContent = "周會總表 · " + ACADEMIC_YEAR;
      if (empty) {
        empty.hidden = false;
        empty.textContent = "暫時未有周會編排。";
      }
      return;
    }

    if (empty) empty.hidden = true;

    var today = todayHK();
    var browse = browseDate();
    var nextIso = "";
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].assembly_date >= today && !isCancelled(rows[i])) {
        nextIso = rows[i].assembly_date;
        break;
      }
    }

    if (meta) {
      meta.textContent =
        "Day 8 周會總表 · " + ACADEMIC_YEAR + " · 共 " + rows.length + " 次" +
        (nextIso ? (" · 下次 " + formatDisplayDate(nextIso)) : "");
    }

    var thead =
      "<thead><tr>" +
      "<th scope=\"col\">日期</th>" +
      "<th scope=\"col\">主題週／活動</th>" +
      FORM_LABELS.map(function (lab) { return "<th scope=\"col\">" + lab + "</th>"; }).join("") +
      "<th scope=\"col\">場地安排</th>" +
      "</tr></thead>";

    var body = rows.map(function (r) {
      var iso = r.assembly_date;
      var cls = ["wa-row"];
      if (iso === today) cls.push("is-today");
      if (iso === browse) cls.push("is-browse");
      if (iso === nextIso) cls.push("is-next");
      if (isCancelled(r)) cls.push("is-cancelled");
      var cells =
        "<td class=\"wa-date\">" + escapeHtml(formatDisplayDate(iso)) +
          "<div class=\"wa-date-iso muted\">" + escapeHtml(iso) + "</div></td>" +
        "<td class=\"wa-theme\">" + escapeHtml(r.theme_week || "—") + "</td>" +
        FORM_KEYS.map(function (k) {
          return "<td class=\"wa-form\">" + escapeHtml(r[k] || "—") + "</td>";
        }).join("") +
        "<td class=\"wa-venue\">" + escapeHtml(r.venue || "—") + "</td>";
      return "<tr class=\"" + cls.join(" ") + "\" data-date=\"" + escapeHtml(iso) + "\">" + cells + "</tr>";
    }).join("");

    wrap.innerHTML =
      '<div class="wa-scroll">' +
        '<table class="wa-table" aria-label="周會編排總表">' +
          thead +
          "<tbody>" + body + "</tbody>" +
        "</table>" +
      "</div>";
  }

  function show() {
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
