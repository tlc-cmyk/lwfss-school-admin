(function () {
  "use strict";

  /**
   * 搵課室 — staff-only: which classrooms are free on a cycle Day (+ period).
   * Room universe derived from lessons (same approach as meet.js); no rooms master table.
   */

  var state = {
    day: 1,
    period: "all", // "all" | 1..8
    showOccupied: false,
    bound: false,
    defaultsApplied: false
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

  function getData() {
    if (window.SchoolAdminHome && typeof SchoolAdminHome.getTimetableData === "function") {
      var d = SchoolAdminHome.getTimetableData();
      if (d && d.teachers) return d;
    }
    return window.TIMETABLE_DATA || null;
  }

  function periodsForDay(day) {
    if (window.SchoolAdminHome && typeof SchoolAdminHome.periodsForDay === "function") {
      return SchoolAdminHome.periodsForDay(day);
    }
    return day === 5 || day === 10 ? 8 : 7;
  }

  function periodBell(d, p) {
    if (window.SchoolAdminHome && typeof SchoolAdminHome.periodBell === "function") {
      var b = SchoolAdminHome.periodBell(d, p);
      if (b) return b;
    }
    return null;
  }

  function bellLabelForDay(d) {
    if (window.SchoolAdminHome && typeof SchoolAdminHome.bellLabelForDay === "function") {
      return SchoolAdminHome.bellLabelForDay(d) || "";
    }
    return (d === 5 || d === 10) ? "BF上課時間" : "一般上課時間";
  }

  /** Collect unique room names from all teacher schedule cells. */
  function allRoomsFromData() {
    var data = getData();
    var seen = {};
    var rooms = [];
    if (!data || !data.teachers) return rooms;
    data.teachers.forEach(function (t) {
      if (!t || !t.schedule) return;
      Object.keys(t.schedule).forEach(function (dayKey) {
        var dayMap = t.schedule[dayKey];
        if (!dayMap) return;
        Object.keys(dayMap).forEach(function (periodKey) {
          var cell = dayMap[periodKey];
          if (!cell) return;
          var r = String(cell.room || "").trim();
          if (!r || seen[r]) return;
          seen[r] = true;
          rooms.push(r);
        });
      });
    });
    return rooms;
  }

  /** Rooms that have any lesson at day+period. */
  function busyRoomsAt(day, period) {
    var data = getData();
    var busy = {};
    if (!data || !data.teachers || day == null || period == null) return busy;
    var dayKey = String(day);
    var periodKey = String(period);
    data.teachers.forEach(function (t) {
      if (!t || !t.schedule) return;
      var cell = t.schedule[dayKey] && t.schedule[dayKey][periodKey];
      if (!cell) return;
      var r = String(cell.room || "").trim();
      if (r) busy[r] = true;
    });
    return busy;
  }

  function isOutdoorRoom(name) {
    var u = String(name || "").toUpperCase();
    return /PLAYGROUND|操場|球場|COVERED\s*PLAY|OPEN\s*AREA/.test(u);
  }

  function isOrdinaryClassroom(name) {
    return /^\d{3,4}$/.test(String(name || "").trim());
  }

  function isLabOrSpecial(name) {
    var u = String(name || "").toUpperCase();
    return /LAB|MMLC|COMPUTER|I\.?\s*T\.?\s*ROOM|STEM|MUSIC|VISUAL\s*ARTS|HOME\s*ECONOMICS|GEOGRAPHY|SCIENCE/.test(u);
  }

  /**
   * Indoor rooms for the day filter, split free vs occupied.
   * Ordinary numeric classrooms first; skip playgrounds / empty strings.
   */
  function classifyRooms(day, period) {
    var busy = busyRoomsAt(day, period);
    var all = allRoomsFromData();
    var freeOrdinary = [];
    var freeSpecial = [];
    var occOrdinary = [];
    var occSpecial = [];
    var totalIndoor = 0;

    all.forEach(function (r) {
      if (isOutdoorRoom(r)) return;
      totalIndoor++;
      var ordinary = isOrdinaryClassroom(r);
      if (busy[r]) {
        if (ordinary) occOrdinary.push(r);
        else occSpecial.push(r);
      } else {
        if (ordinary) freeOrdinary.push(r);
        else freeSpecial.push(r);
      }
    });

    function sortOrd(a, b) { return parseInt(a, 10) - parseInt(b, 10); }
    function sortSpec(a, b) {
      var la = isLabOrSpecial(a) ? 1 : 0;
      var lb = isLabOrSpecial(b) ? 1 : 0;
      if (la !== lb) return la - lb;
      return a.localeCompare(b, "zh-HK");
    }
    freeOrdinary.sort(sortOrd);
    occOrdinary.sort(sortOrd);
    freeSpecial.sort(sortSpec);
    occSpecial.sort(sortSpec);

    return {
      free: freeOrdinary.concat(freeSpecial),
      freeOrdinary: freeOrdinary,
      freeSpecial: freeSpecial,
      occupied: occOrdinary.concat(occSpecial),
      occupiedOrdinary: occOrdinary,
      occupiedSpecial: occSpecial,
      totalIndoor: totalIndoor
    };
  }

  function syncDayFromHome() {
    if (window.SchoolAdminHome && typeof SchoolAdminHome.getTodayCycleDay === "function") {
      var td = SchoolAdminHome.getTodayCycleDay();
      if (td >= 1 && td <= 10) {
        state.day = td;
        return;
      }
    }
    if (window.SchoolAdminHome && typeof SchoolAdminHome.getSelectedDay === "function") {
      var d = SchoolAdminHome.getSelectedDay();
      if (d >= 1 && d <= 10) {
        state.day = d;
        return;
      }
    }
    state.day = 1;
  }

  function smartDefaultPeriod() {
    var today = null;
    if (window.SchoolAdminHome && typeof SchoolAdminHome.getTodayCycleDay === "function") {
      today = SchoolAdminHome.getTodayCycleDay();
    }
    if (today == null || state.day !== today) return "all";
    if (window.SchoolAdminHome && typeof SchoolAdminHome.getCurrentPeriod === "function") {
      var p = SchoolAdminHome.getCurrentPeriod();
      if (p != null && p >= 1) return p;
    }
    return "all";
  }

  function applySmartDefaultsOnce() {
    if (state.defaultsApplied) return;
    syncDayFromHome();
    state.period = smartDefaultPeriod();
    state.defaultsApplied = true;
  }

  // Motion Prompt #060 — slide thumb under active chip
  function syncSegThumb(bar, activeSel, instant) {
    if (!bar || !bar.classList.contains("mp-seg")) return;
    var thumb = bar.querySelector(".mp-seg-thumb");
    var active = bar.querySelector(activeSel);
    if (!thumb || !active) return;
    var x = active.offsetLeft;
    var w = active.offsetWidth;
    if (instant) {
      var prev = thumb.style.transition;
      thumb.style.transition = "none";
      thumb.style.width = w + "px";
      thumb.style.transform = "translateX(" + x + "px)";
      void thumb.offsetWidth;
      thumb.style.transition = prev;
    } else {
      thumb.style.width = w + "px";
      thumb.style.transform = "translateX(" + x + "px)";
    }
  }

  function ensureDaySegBuilt(grid) {
    if (!grid) return;
    if (!grid.querySelector(".mp-seg-thumb")) {
      var thumb = document.createElement("span");
      thumb.className = "mp-seg-thumb";
      thumb.setAttribute("aria-hidden", "true");
      grid.insertBefore(thumb, grid.firstChild);
    }
    if (grid.querySelectorAll("[data-fr-day]").length === 10) return;
    Array.prototype.forEach.call(grid.querySelectorAll("[data-fr-day]"), function (el) {
      el.parentNode.removeChild(el);
    });
    var frag = document.createDocumentFragment();
    for (var d = 1; d <= 10; d++) {
      var isBf = d === 5 || d === 10;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (isBf ? " is-bf" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("data-fr-day", String(d));
      btn.title = "Day " + d + (isBf ? " · BF" : "");
      btn.textContent = "D" + d;
      frag.appendChild(btn);
    }
    grid.appendChild(frag);
    delete grid.dataset.segReady;
  }

  function renderDayGrid() {
    var grid = $("fr-day-grid");
    if (!grid) return;
    ensureDaySegBuilt(grid);
    Array.prototype.forEach.call(grid.querySelectorAll("[data-fr-day]"), function (btn) {
      var d = parseInt(btn.getAttribute("data-fr-day"), 10);
      var on = d === state.day;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    var instant = !grid.dataset.segReady;
    syncSegThumb(grid, "[data-fr-day].active", instant);
    requestAnimationFrame(function () {
      syncSegThumb(grid, "[data-fr-day].active", !grid.dataset.segReady);
      var thumb = grid.querySelector(".mp-seg-thumb");
      if (thumb && parseFloat(thumb.style.width) > 0) {
        grid.dataset.segReady = "1";
      }
    });
  }

  function renderPeriodBar() {
    var bar = $("fr-period-bar");
    if (!bar) return;
    var maxp = periodsForDay(state.day);
    if (state.period !== "all" && Number(state.period) > maxp) {
      state.period = "all";
    }

    var needRebuild = bar.querySelectorAll("[data-fr-period]").length !== (maxp + 1);
    if (needRebuild || !bar.querySelector(".mp-seg-thumb")) {
      bar.innerHTML = "";
      var thumb = document.createElement("span");
      thumb.className = "mp-seg-thumb";
      thumb.setAttribute("aria-hidden", "true");
      bar.appendChild(thumb);

      function addChip(val, label) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chip";
        btn.setAttribute("data-fr-period", String(val));
        btn.textContent = label;
        bar.appendChild(btn);
      }
      addChip("all", "全部");
      for (var p = 1; p <= maxp; p++) addChip(String(p), "P" + p);
      delete bar.dataset.segReady;
    }

    Array.prototype.forEach.call(bar.querySelectorAll("[data-fr-period]"), function (btn) {
      var v = btn.getAttribute("data-fr-period");
      var on = String(state.period) === v;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });

    var instant = !bar.dataset.segReady;
    syncSegThumb(bar, "[data-fr-period].active", instant);
    requestAnimationFrame(function () {
      syncSegThumb(bar, "[data-fr-period].active", !bar.dataset.segReady);
      var thumb2 = bar.querySelector(".mp-seg-thumb");
      if (thumb2 && parseFloat(thumb2.style.width) > 0) {
        bar.dataset.segReady = "1";
      }
    });
  }

  function roomChipHtml(r, occupied) {
    var cls = "meet-room-chip fr-room-chip" +
      (isOrdinaryClassroom(r) ? " is-class" : " is-special") +
      (occupied ? " is-occupied" : "");
    return '<span class="' + cls + '">' + escapeHtml(r) + "</span>";
  }

  function chipsHtml(rooms, occupied) {
    if (!rooms.length) return '<span class="fr-rooms-none">無</span>';
    return rooms.map(function (r) { return roomChipHtml(r, occupied); }).join("");
  }

  function renderSinglePeriod(day, period) {
    var info = classifyRooms(day, period);
    var bell = periodBell(day, period);
    var timeStr = bell ? (bell.start + "–" + bell.end) : "";
    var freeN = info.free.length;
    var total = info.totalIndoor;
    var meta =
      "Day " + day +
      " · 第" + period + "節" +
      (timeStr ? "（" + timeStr + "）" : "") +
      " · 空課室 " + freeN + "／" + total;

    var html = [];
    html.push('<div class="fr-meta-row"><p class="muted fr-meta" id="fr-meta-live">' + escapeHtml(meta) + "</p>");
    html.push(
      '<button type="button" class="chip fr-toggle-occ' + (state.showOccupied ? " active" : "") +
      '" id="fr-toggle-occ" aria-pressed="' + (state.showOccupied ? "true" : "false") + '">' +
      (state.showOccupied ? "隱藏使用中" : "顯示使用中") +
      "（" + info.occupied.length + "）</button></div>"
    );

    html.push('<div class="fr-block">');
    html.push('<h3 class="fr-block-title">空課室 <span class="fr-block-count">' + freeN + "</span></h3>");
    if (info.freeOrdinary.length) {
      html.push('<p class="fr-sub-label">普通課室</p>');
      html.push('<div class="fr-chip-row">' + chipsHtml(info.freeOrdinary, false) + "</div>");
    }
    if (info.freeSpecial.length) {
      html.push('<p class="fr-sub-label">特別室</p>');
      html.push('<div class="fr-chip-row">' + chipsHtml(info.freeSpecial, false) + "</div>");
    }
    if (!freeN) {
      html.push('<p class="fr-empty">本節沒有空課室（已知課室皆有課）</p>');
    }
    html.push("</div>");

    if (state.showOccupied) {
      html.push('<div class="fr-block fr-block-occ">');
      html.push('<h3 class="fr-block-title">使用中 <span class="fr-block-count">' + info.occupied.length + "</span></h3>");
      if (info.occupiedOrdinary.length) {
        html.push('<p class="fr-sub-label">普通課室</p>');
        html.push('<div class="fr-chip-row">' + chipsHtml(info.occupiedOrdinary, true) + "</div>");
      }
      if (info.occupiedSpecial.length) {
        html.push('<p class="fr-sub-label">特別室</p>');
        html.push('<div class="fr-chip-row">' + chipsHtml(info.occupiedSpecial, true) + "</div>");
      }
      if (!info.occupied.length) {
        html.push('<p class="fr-empty">本節沒有課室使用紀錄</p>');
      }
      html.push("</div>");
    }

    return html.join("");
  }

  function renderAllPeriods(day) {
    var maxp = periodsForDay(day);
    var html = [];
    var bellLab = bellLabelForDay(day);
    html.push(
      '<p class="muted fr-meta">Day ' + day +
      (bellLab ? " · " + escapeHtml(bellLab) : "") +
      " · 各節空課室（普通課室優先）</p>"
    );

    for (var p = 1; p <= maxp; p++) {
      var info = classifyRooms(day, p);
      var bell = periodBell(day, p);
      var timeStr = bell ? (bell.start + "–" + bell.end) : "";
      html.push('<div class="fr-period-group">');
      html.push(
        '<div class="fr-period-head">' +
          '<span class="fr-period-label">第' + p + "節</span>" +
          (timeStr ? '<span class="fr-period-time">' + escapeHtml(timeStr) + "</span>" : "") +
          '<span class="fr-period-count">空 ' + info.free.length + "／" + info.totalIndoor + "</span>" +
        "</div>"
      );
      if (info.free.length) {
        html.push('<div class="fr-chip-row">' + chipsHtml(info.free, false) + "</div>");
      } else {
        html.push('<p class="fr-empty fr-empty-inline">本節無空課室</p>');
      }
      html.push("</div>");
    }
    return html.join("");
  }

  function renderResults() {
    var el = $("fr-results");
    if (!el) return;

    var data = getData();
    if (!data || !data.teachers || !data.teachers.length) {
      el.innerHTML = '<p class="fr-empty">時間表載入中…</p>';
      return;
    }

    if (state.period === "all") {
      el.innerHTML = renderAllPeriods(state.day);
    } else {
      el.innerHTML = renderSinglePeriod(state.day, Number(state.period));
    }
  }

  function renderAll() {
    renderDayGrid();
    renderPeriodBar();
    renderResults();
  }

  function bind() {
    if (state.bound) return;
    state.bound = true;

    var dayGrid = $("fr-day-grid");
    if (dayGrid) {
      dayGrid.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-fr-day]");
        if (!btn || !dayGrid.contains(btn)) return;
        var d = parseInt(btn.getAttribute("data-fr-day"), 10);
        if (!(d >= 1 && d <= 10) || d === state.day) return;
        state.day = d;
        // Re-smart period only when switching onto today's cycle day
        var today = window.SchoolAdminHome && SchoolAdminHome.getTodayCycleDay
          ? SchoolAdminHome.getTodayCycleDay() : null;
        if (today != null && d === today) {
          var cur = smartDefaultPeriod();
          if (cur !== "all") state.period = cur;
        }
        renderAll();
      });
    }

    var periodBar = $("fr-period-bar");
    if (periodBar) {
      periodBar.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-fr-period]");
        if (!btn || !periodBar.contains(btn)) return;
        var v = btn.getAttribute("data-fr-period");
        if (v === "all") state.period = "all";
        else state.period = parseInt(v, 10);
        renderAll();
      });
    }

    var results = $("fr-results");
    if (results) {
      results.addEventListener("click", function (e) {
        var btn = e.target.closest("#fr-toggle-occ");
        if (!btn || !results.contains(btn)) return;
        state.showOccupied = !state.showOccupied;
        renderResults();
      });
    }
  }

  function show() {
    var session = getSession();
    if (!session || session.role !== "staff") return;
    bind();
    applySmartDefaultsOnce();
    // Keep day in sync with today's cycle when reopening if user never changed day
    // (defaultsApplied stays true so period choice is preserved across tab switches)
    renderAll();
  }

  window.SchoolAdminFindRoom = {
    show: show,
    refresh: function () {
      var panel = document.getElementById("home-panel-find-room");
      if (panel && !panel.classList.contains("hidden")) {
        show();
      }
    }
  };
})();
