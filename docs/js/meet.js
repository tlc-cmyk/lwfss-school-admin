(function () {
  "use strict";

  var MIN_PICK = 2;
  var MAX_PICK = 8;
  var SUGGEST_ROOMS = 4; // max rooms listed per free slot

  // Same Day→bell mapping as home.js (Day 5／10 = BF)
  var BELLS = {
    byCycleDay: {
      "1": "general", "2": "general", "3": "general", "4": "general", "5": "bf",
      "6": "general", "7": "general", "8": "general", "9": "general", "10": "bf"
    },
    schedules: {
      general: {
        id: "general",
        label: "一般上課時間",
        periods: {
          "1": { start: "08:30", end: "09:15" },
          "2": { start: "09:15", end: "10:00" },
          "3": { start: "10:20", end: "11:05" },
          "4": { start: "11:05", end: "11:50" },
          "5": { start: "11:50", end: "12:35" },
          "6": { start: "14:05", end: "14:50" },
          "7": { start: "14:50", end: "15:35" }
        }
      },
      bf: {
        id: "bf",
        label: "BF上課時間",
        periods: {
          "1": { start: "08:30", end: "09:15" },
          "2": { start: "09:15", end: "10:00" },
          "3": { start: "10:20", end: "11:05" },
          "4": { start: "11:05", end: "11:50" },
          "5": { start: "11:50", end: "12:35" },
          "6": { start: "13:45", end: "14:30" },
          "7": { start: "14:30", end: "15:15" },
          "8": { start: "15:15", end: "16:45" }
        }
      }
    }
  };

  var state = {
    mode: "day",       // "day" | "week"
    day: 1,            // cycle day 1–10 when mode=day
    selected: {},      // uppercase code -> true
    filter: "",
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

  function getData() {
    if (window.SchoolAdminHome && typeof SchoolAdminHome.getTimetableData === "function") {
      var d = SchoolAdminHome.getTimetableData();
      if (d && d.teachers) return d;
    }
    return window.TIMETABLE_DATA || null;
  }

  function scheduleIdForDay(d) {
    return BELLS.byCycleDay[String(d)] || "general";
  }

  function periodBell(d, p) {
    if (window.SchoolAdminHome && typeof SchoolAdminHome.periodBell === "function") {
      var b = SchoolAdminHome.periodBell(d, p);
      if (b) return b;
    }
    var sched = BELLS.schedules[scheduleIdForDay(d)] || BELLS.schedules.general;
    return (sched.periods && sched.periods[String(p)]) || null;
  }

  function periodsForDay(day) {
    if (window.SchoolAdminHome && typeof SchoolAdminHome.periodsForDay === "function") {
      return SchoolAdminHome.periodsForDay(day);
    }
    return day === 5 || day === 10 ? 8 : 7;
  }

  function bellLabelForDay(d) {
    if (window.SchoolAdminHome && typeof SchoolAdminHome.bellLabelForDay === "function") {
      return SchoolAdminHome.bellLabelForDay(d) || "";
    }
    var sched = BELLS.schedules[scheduleIdForDay(d)];
    return (sched && sched.label) || "";
  }

  function selectedCodes() {
    return Object.keys(state.selected).filter(function (c) { return state.selected[c]; })
      .sort(function (a, b) { return a.localeCompare(b); });
  }

  function selectedCount() {
    return selectedCodes().length;
  }

  function teacherList() {
    var data = getData();
    if (!data || !data.teachers) return [];
    return data.teachers.slice().sort(function (a, b) {
      return String(a.code).localeCompare(String(b.code));
    });
  }

  function findTeacher(code) {
    var q = String(code || "").toUpperCase();
    if (!q) return null;
    var list = teacherList();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].code).toUpperCase() === q) return list[i];
    }
    return null;
  }

  /** True if teacher has a lesson at day/period. */
  function isBusy(teacher, day, period) {
    if (!teacher || day == null || period == null) return false;
    var dayKey = String(day);
    var periodKey = String(period);
    var cell = teacher.schedule && teacher.schedule[dayKey] && teacher.schedule[dayKey][periodKey];
    return !!cell;
  }

  /** Free periods for one teacher on one day. */
  function freePeriodsFor(teacher, day) {
    var maxP = periodsForDay(day);
    var free = [];
    for (var p = 1; p <= maxP; p++) {
      if (!isBusy(teacher, day, p)) free.push(p);
    }
    return free;
  }

  /** Intersection of free periods across selected codes for one day. */
  function sharedFreeForDay(codes, day) {
    if (!codes || codes.length < MIN_PICK) return [];
    var teachers = [];
    for (var i = 0; i < codes.length; i++) {
      var t = findTeacher(codes[i]);
      if (!t) return [];
      teachers.push(t);
    }
    var base = freePeriodsFor(teachers[0], day);
    var out = [];
    for (var j = 0; j < base.length; j++) {
      var p = base[j];
      var allFree = true;
      for (var k = 1; k < teachers.length; k++) {
        if (isBusy(teachers[k], day, p)) { allFree = false; break; }
      }
      if (allFree) out.push(p);
    }
    return out;
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

  /** Rooms that have any lesson at day+period (from lessons / schedules). */
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

  /** Ordinary classroom: numeric room codes e.g. 301、506. */
  function isOrdinaryClassroom(name) {
    return /^\d{3,4}$/.test(String(name || "").trim());
  }

  function isLabOrSpecial(name) {
    var u = String(name || "").toUpperCase();
    return /LAB|MMLC|COMPUTER|I\.?\s*T\.?\s*ROOM|STEM|MUSIC|VISUAL\s*ARTS|HOME\s*ECONOMICS|GEOGRAPHY|SCIENCE/.test(u);
  }

  /**
   * Suggest free rooms for a day+period.
   * Prefer ordinary classrooms; then other indoor rooms; skip playgrounds.
   * Returns up to SUGGEST_ROOMS names.
   */
  function suggestFreeRooms(day, period) {
    var busy = busyRoomsAt(day, period);
    var all = allRoomsFromData();
    var ordinary = [];
    var other = [];
    all.forEach(function (r) {
      if (busy[r] || isOutdoorRoom(r)) return;
      if (isOrdinaryClassroom(r)) ordinary.push(r);
      else other.push(r);
    });
    ordinary.sort(function (a, b) {
      return parseInt(a, 10) - parseInt(b, 10);
    });
    // Prefer non-lab specials before labs when filling remainder
    other.sort(function (a, b) {
      var la = isLabOrSpecial(a) ? 1 : 0;
      var lb = isLabOrSpecial(b) ? 1 : 0;
      if (la !== lb) return la - lb;
      return a.localeCompare(b, "zh-HK");
    });
    var out = ordinary.slice();
    for (var i = 0; i < other.length && out.length < SUGGEST_ROOMS; i++) {
      out.push(other[i]);
    }
    return out.slice(0, SUGGEST_ROOMS);
  }

  function renderRoomSuggest(day, period) {
    var rooms = suggestFreeRooms(day, period);
    if (!rooms.length) {
      return '<div class="meet-rooms"><span class="meet-rooms-label">可用課室</span><span class="meet-rooms-none">本節未有可建議課室</span></div>';
    }
    var chips = rooms.map(function (r) {
      var cls = "meet-room-chip" + (isOrdinaryClassroom(r) ? " is-class" : " is-special");
      return '<span class="' + cls + '">' + escapeHtml(r) + "</span>";
    }).join("");
    return (
      '<div class="meet-rooms">' +
        '<span class="meet-rooms-label">建議課室</span>' +
        '<span class="meet-rooms-list">' + chips + "</span>" +
      "</div>"
    );
  }

  function selfCode() {
    var session = getSession();
    if (!session || !session.staff) return "";
    var sn = (session.staff.short_name || "").trim().toUpperCase();
    if (sn && findTeacher(sn)) return sn;
    return "";
  }

  function ensureDefaultSelf() {
    if (selectedCount() > 0) return;
    var me = selfCode();
    if (me) state.selected[me] = true;
  }

  function syncDayFromHome() {
    if (window.SchoolAdminHome && typeof SchoolAdminHome.getSelectedDay === "function") {
      var d = SchoolAdminHome.getSelectedDay();
      if (d >= 1 && d <= 10) state.day = d;
    } else if (window.SchoolAdminHome && typeof SchoolAdminHome.getTodayCycleDay === "function") {
      var td = SchoolAdminHome.getTodayCycleDay();
      if (td >= 1 && td <= 10) state.day = td;
    }
  }

  function setHint(msg, isErr) {
    var el = $("meet-hint");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("is-err", !!isErr);
  }

  // Motion Prompt #060 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#060
  // Segmented control — slide thumb under the active 單日／循環周 chip (0.25s easeInOutCubic via CSS).
  function syncMeetModeSegThumb(bar, instant) {
    if (!bar || !bar.classList.contains("mp-seg")) return;
    var thumb = bar.querySelector(".mp-seg-thumb");
    var active = bar.querySelector("[data-meet-mode].active");
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

  function renderModeBar() {
    var bar = $("meet-mode-bar");
    if (!bar) return;
    Array.prototype.forEach.call(bar.querySelectorAll("[data-meet-mode]"), function (btn) {
      var on = btn.getAttribute("data-meet-mode") === state.mode;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    // Layout may not be ready while the panel is hidden; only mark ready once width > 0.
    var instant = !bar.dataset.segReady;
    syncMeetModeSegThumb(bar, instant);
    requestAnimationFrame(function () {
      syncMeetModeSegThumb(bar, !bar.dataset.segReady);
      var thumb = bar.querySelector(".mp-seg-thumb");
      if (thumb && parseFloat(thumb.style.width) > 0) {
        bar.dataset.segReady = "1";
      }
    });
    var dayWrap = $("meet-day-wrap");
    if (dayWrap) {
      var show = state.mode === "day";
      dayWrap.classList.toggle("hidden", !show);
      if (show) dayWrap.removeAttribute("hidden");
      else dayWrap.setAttribute("hidden", "");
    }
  }

  // Motion Prompt #060 — slide thumb under the active D1–D10 chip.
  function syncMeetDaySegThumb(bar, instant) {
    if (!bar || !bar.classList.contains("mp-seg")) return;
    var thumb = bar.querySelector(".mp-seg-thumb");
    var active = bar.querySelector("[data-meet-day].active");
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

  function ensureMeetDaySegBuilt(grid) {
    if (!grid) return;
    if (!grid.querySelector(".mp-seg-thumb")) {
      var thumb = document.createElement("span");
      thumb.className = "mp-seg-thumb";
      thumb.setAttribute("aria-hidden", "true");
      grid.insertBefore(thumb, grid.firstChild);
    }
    if (grid.querySelectorAll("[data-meet-day]").length === 10) return;
    // Keep thumb; rebuild only day chips.
    Array.prototype.forEach.call(grid.querySelectorAll("[data-meet-day]"), function (el) {
      el.parentNode.removeChild(el);
    });
    var frag = document.createDocumentFragment();
    for (var d = 1; d <= 10; d++) {
      var isBf = d === 5 || d === 10;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (isBf ? " is-bf" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("data-meet-day", String(d));
      btn.title = "Day " + d + (isBf ? " · BF" : "");
      btn.textContent = "D" + d;
      frag.appendChild(btn);
    }
    grid.appendChild(frag);
    delete grid.dataset.segReady;
  }

  function renderDayGrid() {
    var grid = $("meet-day-grid");
    if (!grid) return;
    ensureMeetDaySegBuilt(grid);
    Array.prototype.forEach.call(grid.querySelectorAll("[data-meet-day]"), function (btn) {
      var d = parseInt(btn.getAttribute("data-meet-day"), 10);
      var on = d === state.day;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    var dayWrap = $("meet-day-wrap");
    var visible = dayWrap && !dayWrap.classList.contains("hidden") && !dayWrap.hasAttribute("hidden");
    if (!visible) {
      delete grid.dataset.segReady;
      return;
    }
    var instant = !grid.dataset.segReady;
    syncMeetDaySegThumb(grid, instant);
    requestAnimationFrame(function () {
      syncMeetDaySegThumb(grid, !grid.dataset.segReady);
      var thumb = grid.querySelector(".mp-seg-thumb");
      if (thumb && parseFloat(thumb.style.width) > 0) {
        grid.dataset.segReady = "1";
      }
    });
  }

  function renderSelectedChips() {
    var wrap = $("meet-selected");
    var countEl = $("meet-count");
    var codes = selectedCodes();
    if (countEl) {
      countEl.textContent = "已選 " + codes.length + "／" + MAX_PICK;
      countEl.classList.toggle("is-ok", codes.length >= MIN_PICK && codes.length <= MAX_PICK);
      countEl.classList.toggle("is-warn", codes.length > 0 && codes.length < MIN_PICK);
    }
    if (!wrap) return;
    if (!codes.length) {
      wrap.innerHTML = '<span class="meet-selected-empty">尚未選擇同事（請選 ' + MIN_PICK + "–" + MAX_PICK + " 人）</span>";
      return;
    }
    var html = [];
    codes.forEach(function (code) {
      var t = findTeacher(code);
      var name = t ? (t.chi || t.eng || "") : "";
      html.push(
        '<button type="button" class="meet-chip" data-meet-remove="' + escapeHtml(code) + '"' +
        ' title="移除 ' + escapeHtml(code) + '">' +
        '<span class="meet-chip-code">' + escapeHtml(code) + "</span>" +
        (name ? '<span class="meet-chip-name">' + escapeHtml(name) + "</span>" : "") +
        '<span class="meet-chip-x" aria-hidden="true">×</span>' +
        "</button>"
      );
    });
    wrap.innerHTML = html.join("");
  }

  function renderPicker() {
    var list = $("meet-picker-list");
    if (!list) return;
    var teachers = teacherList();
    var q = String(state.filter || "").trim().toLowerCase();
    var html = [];
    var shown = 0;
    teachers.forEach(function (t) {
      var code = String(t.code || "").toUpperCase();
      if (!code) return;
      var name = t.chi || t.eng || "";
      var hay = (code + " " + name + " " + (t.eng || "")).toLowerCase();
      if (q && hay.indexOf(q) < 0) return;
      shown++;
      var checked = !!state.selected[code];
      var disabled = !checked && selectedCount() >= MAX_PICK;
      html.push(
        '<label class="meet-pick-row' + (checked ? " is-on" : "") + (disabled ? " is-disabled" : "") + '">' +
          '<input type="checkbox" data-meet-code="' + escapeHtml(code) + '"' +
          (checked ? " checked" : "") + (disabled ? " disabled" : "") + " />" +
          '<span class="meet-pick-code">' + escapeHtml(code) + "</span>" +
          '<span class="meet-pick-name">' + escapeHtml(name || "—") + "</span>" +
        "</label>"
      );
    });
    if (!teachers.length) {
      list.innerHTML = '<p class="meet-empty">時間表載入中…</p>';
      return;
    }
    if (!shown) {
      list.innerHTML = '<p class="meet-empty">找不到符合「' + escapeHtml(state.filter) + "」的教師</p>";
      return;
    }
    list.innerHTML = html.join("");
  }

  function formatSlot(day, period) {
    var bell = periodBell(day, period);
    var time = bell ? (bell.start + "–" + bell.end) : "";
    return {
      day: day,
      period: period,
      label: "第" + period + "節",
      time: time,
      bellLabel: bellLabelForDay(day)
    };
  }

  function renderResults() {
    var box = $("meet-results");
    if (!box) return;
    var codes = selectedCodes();
    var n = codes.length;

    if (!getData() || !teacherList().length) {
      box.innerHTML = '<p class="meet-empty">時間表載入中，請稍候…</p>';
      setHint("");
      return;
    }

    if (n < MIN_PICK) {
      box.innerHTML = '<p class="meet-empty">請選擇至少 ' + MIN_PICK + " 位同事，以計算共同空堂。</p>";
      setHint("尚欠 " + (MIN_PICK - n) + " 人", true);
      return;
    }
    if (n > MAX_PICK) {
      box.innerHTML = '<p class="meet-empty">最多選擇 ' + MAX_PICK + " 人。</p>";
      setHint("已超過上限", true);
      return;
    }

    setHint("共同空堂＝所選同事該節皆無課；建議課室＝該節 lessons 無人用（優先普通課室）");

    var names = codes.map(function (c) {
      var t = findTeacher(c);
      return c + (t && (t.chi || t.eng) ? "（" + (t.chi || t.eng) + "）" : "");
    }).join("、");

    if (state.mode === "day") {
      var day = state.day || 1;
      var shared = sharedFreeForDay(codes, day);
      var bellLab = bellLabelForDay(day);
      var head =
        '<div class="meet-result-head">' +
          "<strong>Day " + day + "</strong>" +
          (bellLab ? " · " + escapeHtml(bellLab) : "") +
          " · 共同空堂 <strong>" + shared.length + "</strong> 節" +
        "</div>" +
        '<p class="meet-result-who muted">對象：' + escapeHtml(names) + "</p>";

      if (!shared.length) {
        box.innerHTML = head + '<p class="meet-empty">呢日冇共同空堂。可試其他 Day，或改為「循環周」睇邊日得。</p>';
        return;
      }

      var cards = shared.map(function (p) {
        var s = formatSlot(day, p);
        return (
          '<div class="meet-slot">' +
            '<div class="meet-slot-main">' +
              '<span class="meet-slot-period">' + escapeHtml(s.label) + "</span>" +
              (s.time ? '<span class="meet-slot-time">' + escapeHtml(s.time) + "</span>" : "") +
              '<span class="meet-slot-tag">共同空堂</span>' +
            "</div>" +
            renderRoomSuggest(day, p) +
          "</div>"
        );
      });
      box.innerHTML = head + '<div class="meet-slot-list">' + cards.join("") + "</div>";
      return;
    }

    // week mode: D1–D10
    var dayBlocks = [];
    var total = 0;
    for (var d = 1; d <= 10; d++) {
      var free = sharedFreeForDay(codes, d);
      total += free.length;
      var lab = bellLabelForDay(d);
      var isBf = d === 5 || d === 10;
      var inner;
      if (!free.length) {
        inner = '<p class="meet-day-none">無共同空堂</p>';
      } else {
        inner = '<div class="meet-slot-list meet-slot-list-compact">' + free.map(function (p) {
          var s = formatSlot(d, p);
          return (
            '<div class="meet-slot">' +
              '<div class="meet-slot-main">' +
                '<span class="meet-slot-period">' + escapeHtml(s.label) + "</span>" +
                (s.time ? '<span class="meet-slot-time">' + escapeHtml(s.time) + "</span>" : "") +
              "</div>" +
              renderRoomSuggest(d, p) +
            "</div>"
          );
        }).join("") + "</div>";
      }
      dayBlocks.push(
        '<section class="meet-week-day' + (isBf ? " is-bf" : "") + (free.length ? " has-free" : "") + '">' +
          '<header class="meet-week-day-h">' +
            "<strong>Day " + d + "</strong>" +
            (lab ? '<span class="muted"> · ' + escapeHtml(lab) + "</span>" : "") +
            '<span class="meet-week-count">' + free.length + " 節</span>" +
          "</header>" +
          inner +
        "</section>"
      );
    }

    box.innerHTML =
      '<div class="meet-result-head">' +
        "循環周（D1–D10）· 共 <strong>" + total + "</strong> 個共同空堂時段" +
      "</div>" +
      '<p class="meet-result-who muted">對象：' + escapeHtml(names) + "</p>" +
      '<div class="meet-week-grid">' + dayBlocks.join("") + "</div>";
  }

  function renderAll() {
    renderModeBar();
    renderDayGrid();
    renderSelectedChips();
    renderPicker();
    renderResults();
  }

  function toggleCode(code, wantOn) {
    var c = String(code || "").toUpperCase();
    if (!c || !findTeacher(c)) return;
    if (wantOn) {
      if (state.selected[c]) return;
      if (selectedCount() >= MAX_PICK) {
        setHint("最多選 " + MAX_PICK + " 人", true);
        return;
      }
      state.selected[c] = true;
    } else {
      delete state.selected[c];
    }
    renderAll();
  }

  function bind() {
    if (state.bound) return;
    state.bound = true;

    var modeBar = $("meet-mode-bar");
    if (modeBar) {
      modeBar.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-meet-mode]");
        if (!btn || !modeBar.contains(btn)) return;
        var m = btn.getAttribute("data-meet-mode");
        if (!m || m === state.mode) return;
        state.mode = m;
        renderAll();
      });
      if (typeof ResizeObserver !== "undefined") {
        var ro = new ResizeObserver(function () {
          syncMeetModeSegThumb(modeBar, true);
        });
        ro.observe(modeBar);
      }
      window.addEventListener("resize", function () {
        syncMeetModeSegThumb(modeBar, true);
      });
    }

    var dayGrid = $("meet-day-grid");
    if (dayGrid) {
      dayGrid.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-meet-day]");
        if (!btn || !dayGrid.contains(btn)) return;
        var d = parseInt(btn.getAttribute("data-meet-day"), 10);
        if (!(d >= 1 && d <= 10) || d === state.day) return;
        state.day = d;
        renderAll();
      });
      if (typeof ResizeObserver !== "undefined") {
        var dayRo = new ResizeObserver(function () {
          syncMeetDaySegThumb(dayGrid, true);
        });
        dayRo.observe(dayGrid);
      }
      window.addEventListener("resize", function () {
        syncMeetDaySegThumb(dayGrid, true);
      });
    }

    var search = $("meet-search");
    if (search) {
      search.addEventListener("input", function () {
        state.filter = search.value || "";
        renderPicker();
      });
    }

    var picker = $("meet-picker-list");
    if (picker) {
      picker.addEventListener("change", function (e) {
        var input = e.target;
        if (!input || input.getAttribute("data-meet-code") == null) return;
        toggleCode(input.getAttribute("data-meet-code"), !!input.checked);
      });
    }

    var selected = $("meet-selected");
    if (selected) {
      selected.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-meet-remove]");
        if (!btn || !selected.contains(btn)) return;
        toggleCode(btn.getAttribute("data-meet-remove"), false);
      });
    }

    var clearBtn = $("meet-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        state.selected = {};
        ensureDefaultSelf();
        renderAll();
      });
    }
  }

  function show() {
    var session = getSession();
    if (!session || session.role !== "staff") return;
    bind();
    syncDayFromHome();
    ensureDefaultSelf();
    renderAll();
  }

  window.SchoolAdminMeet = {
    show: show,
    refresh: function () {
      if (document.getElementById("home-panel-meet") &&
          !document.getElementById("home-panel-meet").classList.contains("hidden")) {
        show();
      }
    }
  };
})();
