(function () {
  "use strict";

  var rows = [];
  var filter = "upcoming";
  var loaded = false;

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function todayHK() {
    // Asia/Hong_Kong calendar date as YYYY-MM-DD
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Hong_Kong",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date());
    } catch (e) {
      var d = new Date();
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, "0");
      var day = String(d.getDate()).padStart(2, "0");
      return y + "-" + m + "-" + day;
    }
  }

  function monthLabel(iso) {
    if (!iso) return "日期待定";
    var parts = iso.split("-");
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    return y + "年" + m + "月";
  }

  function formatDue(row) {
    if (row.due_date_raw) return row.due_date_raw;
    return row.due_date || "—";
  }

  function isUpcoming(row, today) {
    if (!row.due_date) return true; // undated (e.g. 12月中旬) keep visible
    return row.due_date >= today;
  }

  function render() {
    var box = $("deadlines-list");
    var meta = $("deadlines-meta");
    if (!box) return;
    var today = todayHK();
    var list = rows.slice();
    if (filter === "upcoming") {
      list = list.filter(function (r) { return isUpcoming(r, today); });
    }
    // sort: due_date nulls last within group, then sort_order
    list.sort(function (a, b) {
      if (a.due_date && b.due_date) {
        if (a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
      } else if (a.due_date && !b.due_date) return -1;
      else if (!a.due_date && b.due_date) return 1;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    if (meta) {
      meta.textContent =
        (filter === "upcoming" ? "即將到期／進行中： " : "全年共 ") +
        list.length + " 項" +
        (filter === "upcoming" ? "（今日 " + today + "）" : "");
    }

    if (!list.length) {
      box.innerHTML = '<p class="muted">沒有符合條件的項目。</p>';
      return;
    }

    var html = "";
    var lastMonth = null;
    list.forEach(function (row) {
      var mk = row.due_date ? monthLabel(row.due_date) : "其他／日期範圍";
      if (mk !== lastMonth) {
        html += '<h3 class="deadline-month">' + escapeHtml(mk) + "</h3>";
        lastMonth = mk;
      }
      var past = row.due_date && row.due_date < today;
      var todayHit = row.due_date === today;
      html +=
        '<article class="deadline-item' +
        (past ? " past" : "") +
        (todayHit ? " today" : "") +
        '">' +
        '<div class="deadline-date">' + escapeHtml(formatDue(row)) + "</div>" +
        '<div class="deadline-body">' + escapeHtml(row.title || "") + "</div>" +
        "</article>";
    });
    box.innerHTML = html;
  }

  function bindFilters() {
    var bar = document.querySelector(".deadlines-filters");
    if (!bar || bar.dataset.bound === "1") return;
    bar.dataset.bound = "1";
    bar.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-filter]");
      if (!btn) return;
      filter = btn.getAttribute("data-filter") || "upcoming";
      bar.querySelectorAll("button[data-filter]").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      render();
    });
  }

  function loadDeadlines() {
    if (loaded) return;
    var auth = window.SchoolAdminAuth;
    var session = auth && auth.getSession ? auth.getSession() : window.__schoolAdminSession;
    var client = (auth && auth.getClient && auth.getClient()) || window.__supabaseClient;
    var err = $("deadlines-err");
    if (!session || session.role !== "staff") {
      if (err) err.textContent = "";
      return;
    }
    if (!client || session.method !== "supabase") {
      if (err) err.textContent = "需要以學校 Google 帳戶登入才可讀取清單。";
      return;
    }
    loaded = true;
    if (err) err.textContent = "";
    client
      .from("staff_deadlines")
      .select("id,due_date,due_date_raw,title,academic_year,sort_order")
      .eq("academic_year", "2026-2027")
      .order("sort_order", { ascending: true })
      .then(function (res) {
        if (res.error) {
          loaded = false;
          if (err) err.textContent = "無法載入：" + (res.error.message || res.error);
          return;
        }
        rows = res.data || [];
        render();
      })
      .catch(function (e) {
        loaded = false;
        if (err) err.textContent = "無法載入：" + (e && e.message ? e.message : e);
      });
  }

  function onAuthed() {
    bindFilters();
    var session = (window.SchoolAdminAuth && SchoolAdminAuth.getSession()) || window.__schoolAdminSession;
    if (!session) return;
    if (session.role === "staff") loadDeadlines();
  }

  function init() {
    function bindAuthedListener() {
      if (bindAuthedListener.done) return;
      bindAuthedListener.done = true;
      // Auth publishes on document; also listen on window for older builds.
      document.addEventListener("schooladmin:authed", onAuthed);
      window.addEventListener("schooladmin:authed", onAuthed);
    }
    bindAuthedListener();
    if (window.__schoolAdminSession) onAuthed();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
