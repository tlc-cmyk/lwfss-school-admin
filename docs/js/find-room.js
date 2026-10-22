(function () {
  "use strict";

  /**
   * 搵課室 — staff-only: which classrooms are free on a cycle Day (+ periods).
   * Multi-select periods → rooms free in every selected period (intersection).
   * Room universe derived from lessons (same approach as meet.js); no rooms master table.
   */

  var state = {
    day: 1,
    /** @type {number[]} sorted unique selected periods (1..8) */
    periods: [],
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

  function sortOrdinary(a, b) { return parseInt(a, 10) - parseInt(b, 10); }
  function sortSpecial(a, b) {
    var la = isLabOrSpecial(a) ? 1 : 0;
    var lb = isLabOrSpecial(b) ? 1 : 0;
    if (la !== lb) return la - lb;
    return a.localeCompare(b, "zh-HK");
  }

  /**
   * Indoor rooms free / occupied for a single period.
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

    freeOrdinary.sort(sortOrdinary);
    occOrdinary.sort(sortOrdinary);
    freeSpecial.sort(sortSpecial);
    occSpecial.sort(sortSpecial);

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

  /**
   * Rooms free in every selected period (intersection of free sets).
   * A room occupied in any selected period is not continuous-free.
   */
  function classifyRoomsIntersection(day, periods) {
    var all = allRoomsFromData();
    var freeOrdinary = [];
    var freeSpecial = [];
    var totalIndoor = 0;
    var busyByPeriod = periods.map(function (p) { return busyRoomsAt(day, p); });

    all.forEach(function (r) {
      if (isOutdoorRoom(r)) return;
      totalIndoor++;
      var busySomewhere = false;
      for (var i = 0; i < busyByPeriod.length; i++) {
        if (busyByPeriod[i][r]) {
          busySomewhere = true;
          break;
        }
      }
      if (busySomewhere) return;
      if (isOrdinaryClassroom(r)) freeOrdinary.push(r);
      else freeSpecial.push(r);
    });

    freeOrdinary.sort(sortOrdinary);
    freeSpecial.sort(sortSpecial);

    return {
      free: freeOrdinary.concat(freeSpecial),
      freeOrdinary: freeOrdinary,
      freeSpecial: freeSpecial,
      totalIndoor: totalIndoor
    };
  }

  function sortedUniquePeriods(arr) {
    var seen = {};
    var out = [];
    (arr || []).forEach(function (p) {
      var n = Number(p);
      if (!(n >= 1) || seen[n]) return;
      seen[n] = true;
      out.push(n);
    });
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  function clampPeriodsToDay() {
    var maxp = periodsForDay(state.day);
    state.periods = state.periods.filter(function (p) { return p >= 1 && p <= maxp; });
  }

  function allPeriodsSelected() {
    var maxp = periodsForDay(state.day);
    if (state.periods.length !== maxp) return false;
    for (var p = 1; p <= maxp; p++) {
      if (state.periods.indexOf(p) < 0) return false;
    }
    return true;
  }

  function periodsAreContiguous(periods) {
    if (!periods || periods.length < 2) return true;
    for (var i = 1; i < periods.length; i++) {
      if (periods[i] !== periods[i - 1] + 1) return false;
    }
    return true;
  }

  function formatPeriodList(periods) {
    return periods.map(function (p) { return "P" + p; }).join("、");
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

  /** Smart default: today's current period as a one-item selection; else all periods. */
  function smartDefaultPeriods() {
    var today = null;
    if (window.SchoolAdminHome && typeof SchoolAdminHome.getTodayCycleDay === "function") {
      today = SchoolAdminHome.getTodayCycleDay();
    }
    if (today != null && state.day === today) {
      if (window.SchoolAdminHome && typeof SchoolAdminHome.getCurrentPeriod === "function") {
        var p = SchoolAdminHome.getCurrentPeriod();
        if (p != null && p >= 1) return [p];
      }
    }
    var maxp = periodsForDay(state.day);
    var all = [];
    for (var i = 1; i <= maxp; i++) all.push(i);
    return all;
  }

  function applySmartDefaultsOnce() {
    if (state.defaultsApplied) return;
    syncDayFromHome();
    state.periods = smartDefaultPeriods();
    state.defaultsApplied = true;
  }

  // Motion Prompt #060 — slide thumb under active chip (day picker only)
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
    clampPeriodsToDay();
    var maxp = periodsForDay(state.day);

    // Multi-toggle chips — no sliding thumb
    var needRebuild = bar.querySelectorAll("[data-fr-period]").length !== (maxp + 1) ||
      bar.classList.contains("mp-seg");
    if (needRebuild) {
      bar.className = "fr-period-toggles";
      bar.setAttribute("role", "group");
      bar.setAttribute("aria-label", "節次多選（可同時揀多節）");
      bar.innerHTML = "";

      function addChip(val, label, title) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chip fr-period-chip";
        btn.setAttribute("data-fr-period", String(val));
        btn.textContent = label;
        if (title) btn.title = title;
        bar.appendChild(btn);
      }
      addChip("all", "全部", "全選／清除當日所有課節");
      for (var p = 1; p <= maxp; p++) addChip(String(p), "P" + p, "切換第" + p + "節");
    }

    var allOn = allPeriodsSelected();
    Array.prototype.forEach.call(bar.querySelectorAll("[data-fr-period]"), function (btn) {
      var v = btn.getAttribute("data-fr-period");
      var on;
      if (v === "all") {
        on = allOn;
      } else {
        on = state.periods.indexOf(parseInt(v, 10)) >= 0;
      }
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
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

  function renderPromptPick() {
    return (
      '<div class="fr-block fr-prompt">' +
        '<p class="fr-empty">請先揀至少一個課節（可同時揀多節搵連續空課室）</p>' +
      "</div>"
    );
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

  function renderMultiPeriods(day, periods) {
    var info = classifyRoomsIntersection(day, periods);
    var freeN = info.free.length;
    var label = formatPeriodList(periods);
    var contiguous = periodsAreContiguous(periods);
    var title = "連續空課室（已選 " + label + "）";
    var countLine = freeN + " 間課室可連續使用";

    var html = [];
    html.push('<div class="fr-meta-row">');
    html.push('<p class="muted fr-meta" id="fr-meta-live">Day ' + day + " · " + escapeHtml(countLine) + "</p>");
    html.push("</div>");

    if (!contiguous) {
      html.push(
        '<p class="fr-note fr-note-gap" role="note">已選節次非連續（仍顯示各節皆空嘅課室，方便分段使用）</p>'
      );
    }

    html.push('<div class="fr-block">');
    html.push('<h3 class="fr-block-title">' + escapeHtml(title) +
      ' <span class="fr-block-count">' + freeN + "</span></h3>");
    if (info.freeOrdinary.length) {
      html.push('<p class="fr-sub-label">普通課室</p>');
      html.push('<div class="fr-chip-row">' + chipsHtml(info.freeOrdinary, false) + "</div>");
    }
    if (info.freeSpecial.length) {
      html.push('<p class="fr-sub-label">特別室</p>');
      html.push('<div class="fr-chip-row">' + chipsHtml(info.freeSpecial, false) + "</div>");
    }
    if (!freeN) {
      html.push('<p class="fr-empty">已選課節沒有可連續使用嘅空課室</p>');
    }
    html.push("</div>");

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

    clampPeriodsToDay();
    var periods = state.periods;

    if (!periods.length) {
      el.innerHTML = renderPromptPick();
    } else if (periods.length === 1) {
      el.innerHTML = renderSinglePeriod(state.day, periods[0]);
    } else {
      el.innerHTML = renderMultiPeriods(state.day, periods);
    }
  }

  function renderAll() {
    renderDayGrid();
    renderPeriodBar();
    renderResults();
  }

  function togglePeriod(p) {
    var idx = state.periods.indexOf(p);
    if (idx >= 0) {
      state.periods.splice(idx, 1);
    } else {
      state.periods.push(p);
      state.periods = sortedUniquePeriods(state.periods);
    }
  }

  function selectAllPeriods() {
    var maxp = periodsForDay(state.day);
    var all = [];
    for (var i = 1; i <= maxp; i++) all.push(i);
    state.periods = all;
  }

  function clearPeriods() {
    state.periods = [];
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
        clampPeriodsToDay();
        // Re-smart period only when switching onto today's cycle day
        var today = window.SchoolAdminHome && SchoolAdminHome.getTodayCycleDay
          ? SchoolAdminHome.getTodayCycleDay() : null;
        if (today != null && d === today) {
          var cur = null;
          if (window.SchoolAdminHome && typeof SchoolAdminHome.getCurrentPeriod === "function") {
            cur = SchoolAdminHome.getCurrentPeriod();
          }
          if (cur != null && cur >= 1) state.periods = [cur];
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
        if (v === "all") {
          if (allPeriodsSelected()) clearPeriods();
          else selectAllPeriods();
        } else {
          togglePeriod(parseInt(v, 10));
        }
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
