(function () {
  "use strict";

  var PAGE = 1000;
  var cloudStarted = false;
  var clockTimer = null;
  var WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
  var NOTES_DEADLINE_MAX = 2;
  // Hide from homepage「今日事項」only (still listed on 全部文件遞交).
  var HOME_NOTES_HIDDEN_DEADLINE_TITLES = {
    "中、英文科老師完成修改中六學生申報聯招及個人概覽自述文章/學會活動計劃書/行政會議": true
  };

  // Bell times (一般／BF) — Day 5／10 = BF; other cycle days = 一般
  // Source: teacher timetable columns 一般上課時間／BF上課時間 (same as timetable-app bells.json).
  // Do not use 特別上課時間表 times for 一般.
  var BELLS = {
    byCycleDay: {
      "1": "general", "2": "general", "3": "general", "4": "general", "5": "bf",
      "6": "general", "7": "general", "8": "general", "9": "general", "10": "bf"
    },
    schedules: {
      general: {
        id: "general",
        label: "一般上課時間",
        slots: [
          { key: "homeroom", label: "班主任／早會", start: "07:55", end: "08:30", period: null },
          { key: "p1", label: "第1節", start: "08:30", end: "09:15", period: 1 },
          { key: "p2", label: "第2節", start: "09:15", end: "10:00", period: 2 },
          { key: "recess", label: "小息", start: "10:00", end: "10:20", period: null },
          { key: "p3", label: "第3節", start: "10:20", end: "11:05", period: 3 },
          { key: "p4", label: "第4節", start: "11:05", end: "11:50", period: 4 },
          { key: "p5", label: "第5節", start: "11:50", end: "12:35", period: 5 },
          { key: "lunch", label: "午膳", start: "12:35", end: "13:45", period: null },
          { key: "reading", label: "閱讀時段", start: "13:45", end: "14:05", period: null },
          { key: "p6", label: "第6節", start: "14:05", end: "14:50", period: 6 },
          { key: "p7", label: "第7節", start: "14:50", end: "15:35", period: 7 }
        ],
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
        slots: [
          { key: "homeroom", label: "班主任／早會", start: "07:55", end: "08:30", period: null },
          { key: "p1", label: "第1節", start: "08:30", end: "09:15", period: 1 },
          { key: "p2", label: "第2節", start: "09:15", end: "10:00", period: 2 },
          { key: "recess", label: "小息", start: "10:00", end: "10:20", period: null },
          { key: "p3", label: "第3節", start: "10:20", end: "11:05", period: 3 },
          { key: "p4", label: "第4節", start: "11:05", end: "11:50", period: 4 },
          { key: "p5", label: "第5節", start: "11:50", end: "12:35", period: 5 },
          { key: "lunch", label: "午膳", start: "12:35", end: "13:45", period: null },
          { key: "p6", label: "第6節", start: "13:45", end: "14:30", period: 6 },
          { key: "p7", label: "第7節", start: "14:30", end: "15:15", period: 7 },
          { key: "p8", label: "第8節（BF）", start: "15:15", end: "16:45", period: 8 }
        ],
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

  var CLASS_CODES = (function () {
    var out = [];
    for (var f = 1; f <= 6; f++) {
      "ABCD".split("").forEach(function (L) { out.push(String(f) + L); });
    }
    return out;
  })();

  var state = {
    browseDate: null,
    todayCycleDay: null,
    browseCycleDay: null,
    cycleNote: "",
    calendarItems: [],
    deadlineItems: [],
    assemblyByDay: {},
    viewingCode: "",
    selectedDay: null,
    activePanel: "tt",
    lessonRows: null,
    crMode: "class",
    crClass: "",
    crRoom: ""
  };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function todayHK() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Hong_Kong",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date());
    } catch (e) {
      var d = new Date();
      var t = new Date(d.getTime() + 8 * 3600 * 1000);
      return t.getUTCFullYear() + "-" + pad2(t.getUTCMonth() + 1) + "-" + pad2(t.getUTCDate());
    }
  }

  function nowHKTParts() {
    try {
      var parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Hong_Kong",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false, hourCycle: "h23"
      }).formatToParts(new Date());
      var map = {};
      parts.forEach(function (p) { if (p.type !== "literal") map[p.type] = p.value; });
      var hh = parseInt(map.hour, 10);
      var mm = parseInt(map.minute, 10);
      var ss = parseInt(map.second, 10);
      return {
        ymd: map.year + "-" + map.month + "-" + map.day,
        hour: hh, minute: mm, second: ss,
        hm: pad2(hh) + ":" + pad2(mm),
        minutes: hh * 60 + mm
      };
    } catch (e) {
      var n = new Date();
      var t = new Date(n.getTime() + 8 * 3600 * 1000);
      var hh2 = t.getUTCHours(), mm2 = t.getUTCMinutes(), ss2 = t.getUTCSeconds();
      return {
        ymd: t.getUTCFullYear() + "-" + pad2(t.getUTCMonth() + 1) + "-" + pad2(t.getUTCDate()),
        hour: hh2, minute: mm2, second: ss2,
        hm: pad2(hh2) + ":" + pad2(mm2),
        minutes: hh2 * 60 + mm2
      };
    }
  }

  function formatDateLine(iso) {
    var parts = iso.split("-").map(function (x) { return parseInt(x, 10); });
    if (parts.length !== 3 || !parts[0]) return iso;
    var dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 4, 0, 0));
    var wd = WEEKDAYS[dt.getUTCDay()];
    return parts[0] + "年" + parts[1] + "月" + parts[2] + "日 (週" + wd + ")";
  }

  function hmToMinutes(hm) {
    if (!hm) return null;
    var m = String(hm).match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  /** Seconds from midnight in Asia/Hong_Kong. */
  function nowHKTSeconds() {
    var p = nowHKTParts();
    return p.hour * 3600 + p.minute * 60 + p.second;
  }

  /** Whole seconds remaining until HH:MM end (HKT). Null if unknown/over. */
  function secondsUntilEnd(hmEnd) {
    var endM = hmToMinutes(hmEnd);
    if (endM == null) return null;
    var left = endM * 60 - nowHKTSeconds();
    return left > 0 ? left : 0;
  }

  function formatCountdown(secLeft) {
    if (secLeft == null) return "";
    if (secLeft <= 0) return "結束";
    var m = Math.floor(secLeft / 60);
    var s = secLeft % 60;
    if (m >= 60) {
      var h = Math.floor(m / 60);
      m = m % 60;
      return "剩 " + h + " 時 " + m + " 分";
    }
    if (m >= 1) return "剩 " + m + " 分";
    return "剩 " + s + " 秒";
  }

  function countdownHtml(hmEnd) {
    var left = secondsUntilEnd(hmEnd);
    if (left == null) return "";
    return '<span class="tt-period-countdown" data-end="' + escapeHtml(hmEnd) + '" aria-live="polite">' +
      escapeHtml(formatCountdown(left)) +
      "</span>";
  }

  function updateLiveCountdowns() {
    var nodes = document.querySelectorAll("#home-periods .tt-period-countdown[data-end], #home-cr-periods .tt-period-countdown[data-end]");
    if (!nodes.length) return;
    Array.prototype.forEach.call(nodes, function (el) {
      var left = secondsUntilEnd(el.getAttribute("data-end"));
      el.textContent = formatCountdown(left);
    });
  }

  function scheduleIdForDay(d) {
    return (BELLS.byCycleDay && BELLS.byCycleDay[String(d)]) || "general";
  }

  function scheduleForDay(d) {
    return BELLS.schedules[scheduleIdForDay(d)] || BELLS.schedules.general;
  }

  function bellLabelForDay(d) {
    if (d == null) return "";
    var sched = scheduleForDay(d);
    return (sched && sched.label) || "";
  }

  function periodBell(d, p) {
    var sched = scheduleForDay(d);
    if (!sched || !sched.periods) return null;
    return sched.periods[String(p)] || null;
  }

  function periodsForDay(day) {
    return day === 5 || day === 10 ? 8 : 7;
  }

  function findCurrentSlot(cycleDay) {
    var sched = scheduleForDay(cycleDay);
    if (!sched || !sched.slots || !sched.slots.length) return null;
    var mins = nowHKTParts().minutes;
    var slots = sched.slots;
    var firstStart = hmToMinutes(slots[0].start);
    var lastEnd = hmToMinutes(slots[slots.length - 1].end);
    if (firstStart != null && mins < firstStart) {
      return { kind: "before", label: "上課前", period: null, key: null };
    }
    if (lastEnd != null && mins >= lastEnd) {
      return { kind: "after", label: "放學後", period: null, key: null };
    }
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      var a = hmToMinutes(s.start);
      var b = hmToMinutes(s.end);
      if (a == null || b == null) continue;
      if (mins >= a && mins < b) {
        if (s.period != null) {
          return { kind: "period", label: "上課中", period: s.period, key: s.key, slotLabel: s.label };
        }
        var label = "小息";
        if (s.key === "recess") label = "小息";
        else if (s.key === "lunch") label = "午膳";
        else if (s.key === "homeroom") label = "早會";
        else if (s.key === "reading") label = "閱讀";
        else label = s.label || "休息";
        return { kind: "break", label: label, period: null, key: s.key };
      }
      if (i + 1 < slots.length) {
        var nextA = hmToMinutes(slots[i + 1].start);
        if (nextA != null && mins >= b && mins < nextA) {
          return { kind: "break", label: "小息", period: null, key: "gap" };
        }
      }
    }
    return null;
  }

  function statusChipClass(slot) {
    if (!slot) return "";
    if (slot.kind === "period") return "is-period";
    if (slot.kind === "break") return "is-break";
    if (slot.kind === "after" || slot.kind === "before") return "is-after";
    return "";
  }

  function getSession() {
    return (window.SchoolAdminAuth && SchoolAdminAuth.getSession()) || window.__schoolAdminSession || null;
  }

  function getClient() {
    var auth = window.SchoolAdminAuth;
    return (auth && auth.getClient && auth.getClient()) || window.__supabaseClient || null;
  }

  function displayPersonName(session) {
    if (!session) return "";
    if (session.staff && session.staff.name) return session.staff.name;
    if (session.name) return session.name;
    if (session.email) return session.email.split("@")[0];
    return "";
  }

  function getData() {
    return window.TIMETABLE_DATA || null;
  }

  function findTeacher(code) {
    var data = getData();
    if (!data || !data.teachers) return null;
    var q = (code || "").trim().toUpperCase();
    if (!q) return null;
    for (var i = 0; i < data.teachers.length; i++) {
      if (data.teachers[i].code.toUpperCase() === q) return data.teachers[i];
    }
    return null;
  }

  function browseIsToday() {
    return (state.browseDate || todayHK()) === todayHK();
  }

  function effectiveCycleDay() {
    return state.browseCycleDay;
  }

  /** Message when browse date has no cycle day (holiday / non-school day). */
  function noCycleDayMessage() {
    return browseIsToday() ? "今日無上課／假期" : "是日無上課／假期";
  }

  function startClock() {
    function tick() {
      var parts = nowHKTParts();
      var el = $("home-clock");
      if (el) el.textContent = parts.hm;

      var statusEl = $("home-status");
      var cycleForStatus = browseIsToday() ? state.todayCycleDay : null;
      if (statusEl) {
        if (cycleForStatus) {
          var slot = findCurrentSlot(cycleForStatus);
          if (slot && slot.label) {
            statusEl.hidden = false;
            statusEl.textContent = slot.label;
            statusEl.className = "home-status-chip " + statusChipClass(slot);
          } else {
            statusEl.hidden = true;
          }
        } else if (browseIsToday()) {
          statusEl.hidden = false;
          statusEl.textContent = "無上課";
          statusEl.className = "home-status-chip is-after";
        } else {
          statusEl.hidden = true;
        }
      }

      // Refresh period past/current when the minute or current period flips
      var slotNow = state.todayCycleDay ? findCurrentSlot(state.todayCycleDay) : null;
      var periodKey = slotNow && slotNow.kind === "period" ? String(slotNow.period) : (slotNow ? slotNow.kind + ":" + (slotNow.key || "") : "none");
      var mark = parts.hm + "|" + periodKey;
      if (browseIsToday() && state.selectedDay && state.selectedDay === state.todayCycleDay) {
        if (window.__homePeriodMark !== mark) {
          window.__homePeriodMark = mark;
          var result = $("home-tt-result");
          if (result && !result.classList.contains("hidden") && state.viewingCode) {
            var t = findTeacher(state.viewingCode);
            if (t) renderPeriods(t, state.selectedDay);
          }
          if (state.activePanel === "class-room") showClassRoomView();
        } else {
          updateLiveCountdowns();
        }
      } else {
        updateLiveCountdowns();
      }
      // 即時空堂 always follows HK now + today's cycle day (independent of D1–D10 picker)
      if (state.activePanel === "free" && window.__homeFreeMark !== mark) {
        window.__homeFreeMark = mark;
        renderFreePanel();
      }

      // Sticky 「下堂」countdown: real today + logged-in staff (not browse date / picker)
      updateNextLessonCountdown();
    }
    tick();
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(tick, 1000);
  }

  function compactRoleLabel(session) {
    if (!session) return "";
    if (session.role === "staff") {
      var title = session.staff && session.staff.role_title;
      return title ? String(title) : "教職員";
    }
    if (session.role === "student") return "學生";
    return "";
  }

  function renderWho(session) {
    var el = $("home-who");
    if (!el) return;
    var name = displayPersonName(session);
    if (!name) {
      el.textContent = "";
      return;
    }
    var short = session.staff && session.staff.short_name
      ? String(session.staff.short_name).toUpperCase()
      : "";
    // Sticky top keeps name (+ short code); role title dropped to save height.
    el.innerHTML = escapeHtml(name) +
      (short ? ' <span class="home-who-code">' + escapeHtml(short) + "</span>" : "");
  }

  /** Logged-in staff short code (not the 「查看教師」picker). */
  function loggedInTeacherCode(session) {
    session = session || getSession();
    if (!session || session.role !== "staff") return "";
    if (session.staff && session.staff.short_name) {
      return String(session.staff.short_name).toUpperCase();
    }
    return "";
  }

  /**
   * Next upcoming teaching period for the logged-in staff on real today
   * (state.todayCycleDay + Asia/Hong_Kong now). Skips 空堂; ignores browse date.
   * kind: hide | pending | none | next | done
   */
  function findNextOwnLesson() {
    var code = loggedInTeacherCode();
    if (!code) return { kind: "hide" };
    var day = state.todayCycleDay;
    if (!day) return { kind: "none" };
    var teacher = findTeacher(code);
    if (!teacher) return { kind: "pending" };
    var schedule = (teacher.schedule && teacher.schedule[String(day)]) || {};
    var maxp = periodsForDay(day);
    var nowSec = nowHKTSeconds();
    var lessons = [];
    for (var p = 1; p <= maxp; p++) {
      if (!schedule[String(p)]) continue;
      var bell = periodBell(day, p);
      if (!bell) continue;
      var startM = hmToMinutes(bell.start);
      var endM = hmToMinutes(bell.end);
      if (startM == null) continue;
      lessons.push({
        period: p,
        start: bell.start,
        end: bell.end,
        startSec: startM * 60,
        endSec: endM != null ? endM * 60 : startM * 60 + 1
      });
    }
    if (!lessons.length) return { kind: "none" };
    var inCurrent = false;
    for (var i = 0; i < lessons.length; i++) {
      var L = lessons[i];
      if (L.startSec > nowSec) {
        return { kind: "next", lesson: L, secLeft: L.startSec - nowSec };
      }
      if (nowSec >= L.startSec && nowSec < L.endSec) inCurrent = true;
    }
    // Last (or only remaining) lesson still in progress — no 「下堂」yet.
    if (inCurrent) return { kind: "hide" };
    return { kind: "done" };
  }

  function formatNextLessonText(info) {
    if (!info || info.kind === "hide" || info.kind === "pending") return null;
    if (info.kind === "none") return "今日無堂";
    if (info.kind === "done") return "今日完結";
    var sec = info.secLeft;
    if (sec == null) return null;
    if (sec >= 3600) return "下堂 " + info.lesson.start;
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    if (m >= 1) return "下堂 還有 " + m + " 分";
    return "下堂 還有 " + s + " 秒";
  }

  function updateNextLessonCountdown() {
    var el = $("home-next-lesson");
    if (!el) return;
    var info = findNextOwnLesson();
    var text = formatNextLessonText(info);
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      el.className = "home-next-lesson";
      return;
    }
    el.hidden = false;
    if (el.textContent !== text) el.textContent = text;
    var done = info.kind === "done" || info.kind === "none";
    el.className = "home-next-lesson" + (done ? " is-done" : "");
  }

  /** Sticky bar background tone: holiday=red, normal=blue, bf=green. */
  function topToneForDay(day) {
    if (!day) return "holiday";
    return scheduleIdForDay(day) === "bf" ? "bf" : "normal";
  }

  function applyHomeTopTone(day) {
    var top = $("home-top");
    if (!top) return;
    top.setAttribute("data-tone", topToneForDay(day));
  }

  function renderHomeBar(session) {
    var iso = state.browseDate || todayHK();
    var dateEl = $("home-date");
    if (dateEl) dateEl.textContent = formatDateLine(iso);

    var dateInput = $("home-date-input");
    if (dateInput && dateInput.value !== iso) dateInput.value = iso;

    renderWho(session);

    var cycleEl = $("home-cycle");
    var day = effectiveCycleDay();
    applyHomeTopTone(day);
    if (cycleEl) {
      if (day) {
        var bellLab = bellLabelForDay(day);
        cycleEl.textContent = "Day " + day + (bellLab ? " · " + bellLab : "");
        cycleEl.classList.remove("is-off");
        cycleEl.classList.toggle("is-bf", scheduleIdForDay(day) === "bf");
      } else {
        cycleEl.textContent = noCycleDayMessage();
        cycleEl.classList.add("is-off");
        cycleEl.classList.remove("is-bf");
      }
    }

    // Assembly / next-lesson removed from sticky top (keep-only compact bar).
    renderNotes(session);
    try {
      document.dispatchEvent(new CustomEvent("schooladmin:browse-date", {
        detail: { date: state.browseDate || todayHK() }
      }));
    } catch (e) { /* ignore */ }
  }

  function renderAssembly() {
    var el = $("home-assembly");
    if (!el) return;
    var day = effectiveCycleDay();
    var row = day && state.assemblyByDay ? state.assemblyByDay[day] : null;
    if (!row || !row.theme) {
      el.innerHTML = "";
      el.hidden = true;
      return;
    }
    var flagNote = row.is_flag
      ? ' <span class="home-assembly-flag">· 升國旗</span>'
      : "";
    el.innerHTML =
      '<span class="home-assembly-label">早會：</span>' +
      '<span class="home-assembly-theme">' + escapeHtml(row.theme) + "</span>" +
      flagNote;
    el.hidden = false;
  }

  function renderNotes(session) {
    var section = $("home-notes");
    var list = $("home-notes-list");
    if (!list || !section) return;

    var items = [];
    var seen = {};

    // Prefer calendar_events, then staff_deadlines — up to two separate rows.
    (state.calendarItems || []).forEach(function (it) {
      if (!it || !it.title) return;
      if (items.length >= NOTES_DEADLINE_MAX) return;
      var title = String(it.title);
      if (seen[title]) return;
      seen[title] = true;
      items.push(title);
    });

    // Staff deadlines — fill remaining slots only
    if (session && session.role === "staff") {
      (state.deadlineItems || []).forEach(function (it) {
        if (items.length >= NOTES_DEADLINE_MAX) return;
        var title = (it && it.title) || "";
        if (!title || seen[title]) return;
        seen[title] = true;
        items.push(title);
      });
    }

    if (!items.length) {
      list.innerHTML = "";
      section.hidden = true;
      return;
    }

    list.innerHTML = items
      .map(function (title) {
        return '<div class="home-note-item">' + escapeHtml(title) + "</div>";
      })
      .join("");
    section.hidden = false;
  }

  var DAY_COUNT = 10;
  var DAY_LOOP_COPIES = 3;
  /** Per-grid circular Day scroller controllers (WeakMap-like via dataset id). */
  var dayScrollers = {};
  var dayScrollerSeq = 0;

  function dayGridNodes() {
    return document.querySelectorAll("#home-panels .tt-day-grid");
  }

  function selectDayFromScroller(day, opts) {
    opts = opts || {};
    day = parseInt(day, 10);
    if (!(day >= 1 && day <= DAY_COUNT)) return;
    if (!opts.fromDateSync) window.__userPickedDay = true;
    var changed = state.selectedDay !== day;
    state.selectedDay = day;
    refreshDayGridActive();
    // Keep every Day strip centered on the same Day (時間表 + 班別／課室).
    if (!opts.skipSyncScroll) {
      Array.prototype.forEach.call(dayGridNodes(), function (grid) {
        if (opts.sourceGrid && grid === opts.sourceGrid) return;
        var scroller = getDayScroller(grid);
        if (scroller) scroller.scrollToDay(day, { animate: !!opts.animateSync, select: false });
      });
    }
    if (changed || opts.force) {
      showSelectedTeacher();
      showClassRoomView();
    }
  }

  function getDayScroller(grid) {
    if (!grid) return null;
    var id = grid.dataset.dayScrollerId;
    return id ? dayScrollers[id] : null;
  }

  /**
   * Circular D1–D10 chip scroller: tripled track + transform, touch inertia,
   * snap-to-center. Click still selects; 改日期 sync via scrollToDay.
   */
  function createDayScroller(grid) {
    var prev = getDayScroller(grid);
    if (prev) prev.destroy();

    var id = String(++dayScrollerSeq);
    grid.dataset.dayScrollerId = id;

    var track = document.createElement("div");
    track.className = "tt-day-track";
    grid.innerHTML = "";
    grid.appendChild(track);
    grid.classList.add("is-loop");

    var x = 0;
    var velocity = 0;
    var dragging = false;
    var moved = false;
    var lastPointerX = 0;
    var lastPointerT = 0;
    var pointerId = null;
    var moveSamples = []; // recent {t,x} for flick velocity
    var rafId = 0;
    var snapRaf = 0;
    var setWidth = 0;
    var chipCenters = []; // relative to track start for one set (copy 0)
    var reducedMotion = false;
    try {
      reducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) { /* ignore */ }

    var FRICTION = 0.960;
    var MIN_COAST_V = 0.035; // px/ms
    var MAX_V = 3.2; // px/ms

    function makeChip(day, copyIndex) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tt-day-chip" + (day === 5 || day === 10 ? " is-bf" : "");
      btn.dataset.day = String(day);
      btn.dataset.copy = String(copyIndex);
      btn.setAttribute("role", "tab");
      btn.textContent = "D" + day;
      btn.setAttribute("aria-selected", "false");
      btn.tabIndex = -1;
      return btn;
    }

    function rebuildChips() {
      track.innerHTML = "";
      for (var c = 0; c < DAY_LOOP_COPIES; c++) {
        for (var d = 1; d <= DAY_COUNT; d++) {
          track.appendChild(makeChip(d, c));
        }
      }
      applyActiveClasses();
    }

    function applyActiveClasses() {
      var todayMark = state.todayCycleDay;
      Array.prototype.forEach.call(track.querySelectorAll(".tt-day-chip"), function (chip) {
        var day = parseInt(chip.dataset.day, 10);
        var on = day === state.selectedDay;
        chip.classList.toggle("active", on);
        chip.setAttribute("aria-selected", on ? "true" : "false");
        chip.classList.toggle("has-today-mark", todayMark === day);
      });
    }

    function measure() {
      var chips = track.querySelectorAll(".tt-day-chip");
      if (chips.length < DAY_COUNT) return;
      chipCenters = [];
      for (var i = 0; i < DAY_COUNT; i++) {
        var chip = chips[i];
        chipCenters.push(chip.offsetLeft + chip.offsetWidth / 2);
      }
      // Width of one D1–D10 set (gap included via offset of first chip of copy 1).
      var firstOfCopy1 = chips[DAY_COUNT];
      setWidth = firstOfCopy1 ? firstOfCopy1.offsetLeft : 0;
      if (!setWidth && chips[DAY_COUNT - 1]) {
        var last = chips[DAY_COUNT - 1];
        setWidth = last.offsetLeft + last.offsetWidth + 6; // gap fallback
      }
    }

    function wrapX(raw) {
      if (!setWidth) return raw;
      // x and x±setWidth center the same Day; keep x in [-setWidth, 0).
      var midBase = -setWidth;
      var rel = raw - midBase;
      rel = ((rel % setWidth) + setWidth) % setWidth;
      return midBase + rel;
    }

    function applyTransform() {
      track.style.transform = "translate3d(" + x + "px,0,0)";
    }

    function gridCenter() {
      return grid.clientWidth / 2;
    }

    /** translateX that centers a chip whose center (in track coords) is chipCenter. */
    function xForChipCenter(chipCenter) {
      return gridCenter() - chipCenter;
    }

    function nearestDayAtX(tx) {
      if (!chipCenters.length || !setWidth) return state.selectedDay || 1;
      // Effective center position on infinite track:
      // viewport center maps to track coord = gridCenter - tx
      var trackPos = gridCenter() - tx;
      // Normalize into copy 0 metric space [0, setWidth)
      var local = ((trackPos % setWidth) + setWidth) % setWidth;
      var bestDay = 1;
      var bestDist = Infinity;
      for (var i = 0; i < chipCenters.length; i++) {
        var c = chipCenters[i];
        var d0 = Math.abs(c - local);
        // also consider wrap around set edges
        var d1 = Math.abs(c + setWidth - local);
        var d2 = Math.abs(c - setWidth - local);
        var dist = Math.min(d0, d1, d2);
        if (dist < bestDist) {
          bestDist = dist;
          bestDay = i + 1;
        }
      }
      return bestDay;
    }

    function chipCenterForDay(day, preferCopy) {
      // Middle copy by default
      var copy = preferCopy != null ? preferCopy : 1;
      var idx = copy * DAY_COUNT + (day - 1);
      var chips = track.querySelectorAll(".tt-day-chip");
      var chip = chips[idx];
      if (!chip) return chipCenters[day - 1] + copy * setWidth;
      return chip.offsetLeft + chip.offsetWidth / 2;
    }

    function stopCoast() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (snapRaf) {
        cancelAnimationFrame(snapRaf);
        snapRaf = 0;
      }
      velocity = 0;
    }

    function settleToNearest(select) {
      if (!setWidth || !chipCenters.length) return;
      var day = nearestDayAtX(x);
      var targetCenter = chipCenterForDay(day, 1);
      var targetX = wrapX(xForChipCenter(targetCenter));
      // Pick nearest equivalent target among wrapped positions
      var candidates = [targetX, targetX + setWidth, targetX - setWidth];
      var best = candidates[0];
      var bestD = Math.abs(candidates[0] - x);
      for (var i = 1; i < candidates.length; i++) {
        var dd = Math.abs(candidates[i] - x);
        if (dd < bestD) {
          bestD = dd;
          best = candidates[i];
        }
      }
      animateTo(best, function () {
        x = wrapX(x);
        applyTransform();
        if (select !== false) selectDayFromScroller(day, { sourceGrid: grid });
        else applyActiveClasses();
      });
    }

    function animateTo(targetX, done) {
      stopCoast();
      if (reducedMotion) {
        x = targetX;
        applyTransform();
        if (done) done();
        return;
      }
      var startX = x;
      var dist = targetX - startX;
      if (Math.abs(dist) < 0.5) {
        x = targetX;
        applyTransform();
        if (done) done();
        return;
      }
      var startT = performance.now();
      var dur = Math.min(420, Math.max(180, Math.abs(dist) * 0.55));
      function step(now) {
        var t = Math.min(1, (now - startT) / dur);
        // ease-out cubic
        var e = 1 - Math.pow(1 - t, 3);
        x = startX + dist * e;
        applyTransform();
        if (t < 1) {
          snapRaf = requestAnimationFrame(step);
        } else {
          snapRaf = 0;
          x = targetX;
          applyTransform();
          if (done) done();
        }
      }
      snapRaf = requestAnimationFrame(step);
    }

    function coast() {
      var last = performance.now();
      function step(now) {
        var dt = Math.max(1, now - last);
        last = now;
        if (Math.abs(velocity) < MIN_COAST_V) {
          rafId = 0;
          velocity = 0;
          settleToNearest(true);
          return;
        }
        x += velocity * dt;
        x = wrapX(x);
        applyTransform();
        // Friction per frame normalized to ~16ms
        velocity *= Math.pow(FRICTION, dt / 16.67);
        rafId = requestAnimationFrame(step);
      }
      rafId = requestAnimationFrame(step);
    }

    function onPointerDown(e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      stopCoast();
      dragging = true;
      moved = false;
      pointerId = e.pointerId;
      lastPointerX = e.clientX;
      lastPointerT = performance.now();
      velocity = 0;
      moveSamples = [{ t: lastPointerT, x: e.clientX }];
      grid.classList.add("is-dragging");
      try { grid.setPointerCapture(pointerId); } catch (err) { /* ignore */ }
    }

    function onPointerMove(e) {
      if (!dragging || e.pointerId !== pointerId) return;
      var now = performance.now();
      var dx = e.clientX - lastPointerX;
      var dt = Math.max(1, now - lastPointerT);
      if (Math.abs(dx) > 2) moved = true;
      x += dx;
      x = wrapX(x);
      applyTransform();
      lastPointerX = e.clientX;
      lastPointerT = now;
      moveSamples.push({ t: now, x: e.clientX });
      while (moveSamples.length > 6) moveSamples.shift();
      // Drop samples older than 100ms
      while (moveSamples.length > 2 && now - moveSamples[0].t > 100) moveSamples.shift();
      if (moveSamples.length >= 2) {
        var a = moveSamples[0];
        var b = moveSamples[moveSamples.length - 1];
        var span = Math.max(1, b.t - a.t);
        velocity = (b.x - a.x) / span;
        if (velocity > MAX_V) velocity = MAX_V;
        if (velocity < -MAX_V) velocity = -MAX_V;
      }
      if (moved) e.preventDefault();
    }

    function onPointerUp(e) {
      if (!dragging || e.pointerId !== pointerId) return;
      dragging = false;
      grid.classList.remove("is-dragging");
      try { grid.releasePointerCapture(pointerId); } catch (err) { /* ignore */ }
      pointerId = null;

      var target = e.target && e.target.closest ? e.target.closest(".tt-day-chip") : null;
      if (!moved && target && grid.contains(target)) {
        var day = parseInt(target.dataset.day, 10);
        scrollToDay(day, { animate: true, select: true });
        return;
      }

      if (Math.abs(velocity) >= MIN_COAST_V) {
        coast();
      } else {
        settleToNearest(true);
      }
    }

    function onPointerCancel(e) {
      if (!dragging || (pointerId != null && e.pointerId !== pointerId)) return;
      dragging = false;
      pointerId = null;
      grid.classList.remove("is-dragging");
      settleToNearest(true);
    }

    function onClickCapture(e) {
      // Suppress native button click after a drag; we handle selection ourselves.
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    }

    function scrollToDay(day, opts) {
      opts = opts || {};
      day = parseInt(day, 10);
      if (!(day >= 1 && day <= DAY_COUNT)) return;
      measure();
      if (!setWidth) {
        requestAnimationFrame(function () { scrollToDay(day, opts); });
        return;
      }
      stopCoast();
      var targetCenter = chipCenterForDay(day, 1);
      var targetX = wrapX(xForChipCenter(targetCenter));
      function after() {
        x = wrapX(x);
        applyTransform();
        if (opts.select) selectDayFromScroller(day, { sourceGrid: grid });
        else applyActiveClasses();
      }
      if (opts.animate && !reducedMotion) {
        // Choose shortest path among wrapped targets relative to current x
        var cands = [targetX, targetX + setWidth, targetX - setWidth];
        var best = cands[0];
        var bestD = Math.abs(cands[0] - x);
        for (var i = 1; i < cands.length; i++) {
          var dd = Math.abs(cands[i] - x);
          if (dd < bestD) { bestD = dd; best = cands[i]; }
        }
        animateTo(best, after);
      } else {
        x = targetX;
        applyTransform();
        after();
      }
    }

    function onResize() {
      var day = state.selectedDay || state.todayCycleDay || nearestDayAtX(x);
      measure();
      if (!setWidth) return;
      x = wrapX(xForChipCenter(chipCenterForDay(day, 1)));
      applyTransform();
    }

    var ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(function () { onResize(); });
      ro.observe(grid);
    } else {
      window.addEventListener("resize", onResize);
    }

    rebuildChips();
    // Layout then center
    requestAnimationFrame(function () {
      measure();
      var focus = state.selectedDay || state.todayCycleDay || 1;
      if (setWidth) {
        x = wrapX(xForChipCenter(chipCenterForDay(focus, 1)));
        applyTransform();
      }
    });

    grid.addEventListener("pointerdown", onPointerDown);
    grid.addEventListener("pointermove", onPointerMove);
    grid.addEventListener("pointerup", onPointerUp);
    grid.addEventListener("pointercancel", onPointerCancel);
    grid.addEventListener("click", onClickCapture, true);

    var api = {
      scrollToDay: scrollToDay,
      refreshActive: applyActiveClasses,
      destroy: function () {
        stopCoast();
        grid.removeEventListener("pointerdown", onPointerDown);
        grid.removeEventListener("pointermove", onPointerMove);
        grid.removeEventListener("pointerup", onPointerUp);
        grid.removeEventListener("pointercancel", onPointerCancel);
        grid.removeEventListener("click", onClickCapture, true);
        if (ro) ro.disconnect();
        else window.removeEventListener("resize", onResize);
        delete dayScrollers[id];
        delete grid.dataset.dayScrollerId;
        grid.classList.remove("is-loop", "is-dragging");
      }
    };
    dayScrollers[id] = api;
    return api;
  }

  function scrollTodayDayIntoView() {
    // Prefer the Day driven by sticky date (or manual chip), else today's mark.
    var focusDay = state.selectedDay || state.todayCycleDay;
    if (!focusDay) return;
    Array.prototype.forEach.call(dayGridNodes(), function (grid) {
      var scroller = getDayScroller(grid);
      if (scroller) {
        scroller.scrollToDay(focusDay, { animate: false, select: false });
        return;
      }
      var chip = grid.querySelector('.tt-day-chip[data-day="' + focusDay + '"]');
      if (!chip) return;
      requestAnimationFrame(function () {
        var target = chip.offsetLeft + chip.offsetWidth / 2 - grid.clientWidth / 2;
        grid.scrollLeft = Math.max(0, target);
      });
    });
  }

  function fillOneDayGrid(grid) {
    if (!grid) return;
    createDayScroller(grid);
  }

  function buildDayGrid() {
    var grids = dayGridNodes();
    if (!grids.length) return;
    Array.prototype.forEach.call(grids, fillOneDayGrid);
    scrollTodayDayIntoView();
  }

  function refreshDayGridActive() {
    Array.prototype.forEach.call(dayGridNodes(), function (grid) {
      var scroller = getDayScroller(grid);
      if (scroller) {
        scroller.refreshActive();
        return;
      }
      Array.prototype.forEach.call(grid.querySelectorAll(".tt-day-chip"), function (chip) {
        var day = parseInt(chip.dataset.day, 10);
        var on = day === state.selectedDay;
        chip.classList.toggle("active", on);
        chip.setAttribute("aria-selected", on ? "true" : "false");
        chip.classList.toggle("has-today-mark", state.todayCycleDay === day);
      });
    });
  }

  function loadCycleAndCalendar(session) {
    var client = getClient();
    var iso = state.browseDate || todayHK();
    renderHomeBar(session);

    if (!client || !session || session.method !== "supabase") {
      state.browseCycleDay = null;
      state.todayCycleDay = null;
      state.cycleNote = "登入後可顯示循環日";
      state.calendarItems = [];
      state.deadlineItems = [];
      state.assemblyByDay = {};
      if (!state.selectedDay) state.selectedDay = 1;
      renderHomeBar(session);
      buildDayGrid();
      renderTimetableSection(session);
      showClassRoomView();
      if (state.activePanel === "free") renderFreePanel();
      if (state.activePanel === "meet") refreshMeetPanel();
      return;
    }

    var realToday = todayHK();

    var cycleBrowse = client
      .from("cycle_days")
      .select("cycle_day,note")
      .eq("day_date", iso)
      .maybeSingle();

    var cycleToday = iso === realToday
      ? cycleBrowse
      : client.from("cycle_days").select("cycle_day,note").eq("day_date", realToday).maybeSingle();

    var calP = client
      .from("calendar_events")
      .select("id,event_date,event_date_raw,title,event_type,sort_order")
      .eq("event_date", iso)
      .order("sort_order", { ascending: true });

    var assemblyP = Object.keys(state.assemblyByDay || {}).length
      ? Promise.resolve({ data: null, _cached: true })
      : client.from("assembly_by_day").select("day,theme,is_flag,is_3x").order("day");

    Promise.all([cycleBrowse, cycleToday, calP, assemblyP]).then(function (parts) {
      var browseRes = parts[0];
      var todayRes = parts[1];
      var calRes = parts[2];
      var assemblyRes = parts[3];

      if (assemblyRes && !assemblyRes._cached && !assemblyRes.error && assemblyRes.data) {
        var map = {};
        assemblyRes.data.forEach(function (r) {
          if (r && r.day) map[r.day] = r;
        });
        state.assemblyByDay = map;
      }

      if (browseRes && !browseRes.error && browseRes.data && browseRes.data.cycle_day) {
        state.browseCycleDay = browseRes.data.cycle_day;
        state.cycleNote = browseRes.data.note || "";
      } else {
        state.browseCycleDay = null;
        state.cycleNote = (browseRes && browseRes.error)
          ? ("未能讀取循環日：" + (browseRes.error.message || ""))
          : "";
      }

      if (iso === realToday) {
        state.todayCycleDay = state.browseCycleDay;
      } else if (todayRes && !todayRes.error && todayRes.data && todayRes.data.cycle_day) {
        state.todayCycleDay = todayRes.data.cycle_day;
      }

      window.__todayCycleDay = state.todayCycleDay;

      // Sticky 改日期 drives D1–D10 for 時間表／班別／課室 unless user tapped a Day chip.
      if (!window.__userPickedDay) {
        state.selectedDay = state.browseCycleDay || null;
      } else if (!state.selectedDay) {
        state.selectedDay = state.browseCycleDay || state.todayCycleDay || 1;
      }

      var calItems = [];
      if (calRes && !calRes.error && calRes.data && calRes.data.length) {
        calItems = calRes.data.map(function (r) {
          return { title: r.title, source: "calendar", type: r.event_type || "remark" };
        });
      }
      state.calendarItems = calItems;

      function finishDeadlines(items) {
        state.deadlineItems = items || [];
        renderHomeBar(session);
        buildDayGrid();
        renderTimetableSection(session);
        showClassRoomView();
        if (state.activePanel === "free") renderFreePanel();
        if (state.activePanel === "meet") refreshMeetPanel();
        startClock();
      }

      if (session.role === "staff") {
        client
          .from("staff_deadlines")
          .select("id,due_date,due_date_raw,title,sort_order")
          .eq("due_date", iso)
          .order("sort_order", { ascending: true })
          .then(function (dlRes) {
            var items = [];
            if (dlRes && !dlRes.error && dlRes.data) {
              items = dlRes.data
                .filter(function (r) {
                  var t = (r && r.title) || "";
                  return t && !HOME_NOTES_HIDDEN_DEADLINE_TITLES[t];
                })
                .map(function (r) {
                  return { title: r.title, source: "deadline" };
                });
            }
            finishDeadlines(items);
          })
          .catch(function () { finishDeadlines([]); });
      } else {
        finishDeadlines([]);
      }
    }).catch(function () {
      state.browseCycleDay = null;
      state.cycleNote = "未能讀取循環日";
      state.calendarItems = [];
      state.deadlineItems = [];
      renderHomeBar(session);
      buildDayGrid();
      renderTimetableSection(session);
      showClassRoomView();
      if (state.activePanel === "free") renderFreePanel();
      if (state.activePanel === "meet") refreshMeetPanel();
    });
  }

  function assemble(teacherRows, lessonRows, metaRows) {
    var metaMap = {};
    (metaRows || []).forEach(function (row) { metaMap[row.key] = row.value; });
    var byCode = {};
    var teachers = (teacherRows || []).map(function (t) {
      var schedule = {};
      for (var d = 1; d <= 10; d++) schedule[String(d)] = {};
      var obj = {
        code: t.code,
        eng: t.eng_name || "",
        chi: t.chi_name || "",
        lessonCount: t.lesson_count || 0,
        schedule: schedule
      };
      byCode[t.code] = obj;
      return obj;
    });
    (lessonRows || []).forEach(function (l) {
      var teacher = byCode[l.teacher_code];
      if (!teacher) return;
      var dayKey = String(l.day);
      var day = teacher.schedule[dayKey] || (teacher.schedule[dayKey] = {});
      day[String(l.period)] = {
        class: l.class_name || "",
        classShort: l.class_short || "",
        subject: l.subject || "",
        subjectShort: l.subject_short || "",
        teacher: l.teachers_field || "",
        room: l.room || ""
      };
    });
    return {
      meta: {
        school: metaMap.school || "",
        schoolShort: metaMap.school_short || "",
        teacherCount: parseInt(metaMap.teacher_count, 10) || teachers.length,
        generatedAt: metaMap.generated_at || "",
        generatedFrom: "Supabase cloud"
      },
      teachers: teachers
    };
  }

  function fetchAll(supabase, table, orderCol) {
    var from = 0;
    var all = [];
    function next() {
      return supabase.from(table).select("*").order(orderCol).range(from, from + PAGE - 1).then(function (res) {
        if (res.error) throw res.error;
        var rows = res.data || [];
        all = all.concat(rows);
        if (rows.length < PAGE) return all;
        from += PAGE;
        return next();
      });
    }
    return next();
  }

  function fillTeacherSelect(preferCode) {
    var sel = $("home-teacher-select");
    if (!sel) return;
    var data = getData();
    var teachers = (data && data.teachers) || [];
    var prev = preferCode || sel.value || state.viewingCode || "";
    sel.innerHTML = "";
    var opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "選擇教師…";
    sel.appendChild(opt0);
    teachers.slice().sort(function (a, b) {
      return String(a.code).localeCompare(String(b.code));
    }).forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t.code;
      opt.textContent = t.code + " · " + (t.chi || t.eng || "");
      sel.appendChild(opt);
    });
    if (prev && findTeacher(prev)) {
      sel.value = prev;
      state.viewingCode = prev;
    }
  }


  /** Map subject_short / subject to a stable family key for colouring. */
  function subjectFamily(short, full) {
    var raw = String(short || full || "").trim();
    if (!raw) return "other";
    var s = raw.toUpperCase().replace(/\s+/g, " ");
    if (/流行聲樂/.test(raw)) return "mus";
    if (/^BF\s*AI|AI\s*900/.test(s)) return "stem";
    if (/^C\s*&\s*SD|^C&SD/.test(s)) return "csd";
    if (/^CHIN/.test(s)) return "chin";
    if (/^CHIS|^CHIST/.test(s)) return "chis";
    if (/^ENG/.test(s)) return "eng";
    if (/^MATH|^MAM/.test(s)) return "math";
    if (/^CHEM|^CHE[^A-Z]|^CHE$/.test(s) || s.indexOf("CHEM") === 0) return "chem";
    if (/^BIO/.test(s)) return "bio";
    if (/^PHY/.test(s)) return "phy";
    if (/^SCI/.test(s)) return "sci";
    if (/^GEO/.test(s)) return "geog";
    if (/^ECO/.test(s)) return "eco";
    if (s === "BA" || /^BAF|^BA\b/.test(s)) return "bafs";
    if (/^ICT/.test(s)) return "ict";
    if (s === "PE" || /^PE\b/.test(s)) return "pe";
    if (/^MUS/.test(s)) return "mus";
    if (s === "VA" || /^VA\b|^VA-/.test(s)) return "va";
    if (s === "HE" || /^HE\b/.test(s)) return "he";
    if (/^PTH/.test(s)) return "pth";
    if (/^STEM/.test(s)) return "stem";
    if (/^CES/.test(s)) return "ces";
    if (/^HMS/.test(s)) return "hmsc";
    if (/^THS/.test(s)) return "ths";
    if (/^HIST|^HIS-/.test(s)) return "hist";
    if (/^CL(-|$|\b)/.test(s)) return "cl";
    var m = s.match(/^([A-Z]{2,6})/);
    return m ? m[1].toLowerCase() : "other";
  }

  /** CSS class suffix for a subject family (tt-subj-*). */
  function subjectClass(short, full) {
    var fam = subjectFamily(short, full);
    var known = {
      chin: 1, eng: 1, math: 1, sci: 1, chem: 1, bio: 1, phy: 1,
      hist: 1, chis: 1, geog: 1, eco: 1, bafs: 1, ict: 1, pe: 1,
      mus: 1, va: 1, he: 1, pth: 1, stem: 1, ces: 1, cl: 1, csd: 1,
      hmsc: 1, ths: 1, other: 1
    };
    if (known[fam]) return "tt-subj-" + fam;
    var h = 0;
    for (var i = 0; i < fam.length; i++) h = ((h << 5) - h + fam.charCodeAt(i)) | 0;
    return "tt-subj-h" + (Math.abs(h) % 8);
  }


  function isBreakSlot(s) {
    return !!(s && s.period == null && (s.key === "homeroom" || s.key === "recess" || s.key === "lunch" || s.key === "reading"));
  }

  /** Compact display names for non-lesson bell slots. */
  function breakSlotLabel(s) {
    if (!s) return "";
    if (s.key === "homeroom") return "早會";
    if (s.key === "recess") return "小息";
    if (s.key === "lunch") return "午膳";
    if (s.key === "reading") return "閱讀";
    return s.label || "休息";
  }

  /** Tiny countdown markup for break rows (same live updater as periods). */
  function breakCountdownHtml(hmEnd) {
    var left = secondsUntilEnd(hmEnd);
    if (left == null) return "";
    return '<span class="tt-period-countdown tt-break-cd" data-end="' + escapeHtml(hmEnd) + '" aria-live="polite">' +
      escapeHtml(formatCountdown(left)) +
      "</span>";
  }

  function makeBreakRow(slot, live, curSlot, nowMins) {
    var extra = "";
    var isCurrent = false;
    if (live) {
      if (curSlot && curSlot.kind === "break" && curSlot.key === slot.key) {
        extra = " is-current";
        isCurrent = true;
      } else {
        var endM = hmToMinutes(slot.end);
        if (endM != null && nowMins >= endM) extra = " is-past";
      }
    }
    var row = document.createElement("div");
    row.className = ("tt-period break" + extra).trim();
    row.setAttribute("data-break", slot.key || "");
    var label = breakSlotLabel(slot);
    row.innerHTML =
      '<div class="tt-period-left">' +
        '<span class="tt-pnum">' + escapeHtml(label) + "</span>" +
        '<span class="tt-period-time">' + escapeHtml(slot.start) + " — " + escapeHtml(slot.end) + "</span>" +
        (isCurrent ? breakCountdownHtml(slot.end) : "") +
      "</div>";
    if (isCurrent) row.setAttribute("aria-current", "true");
    return row;
  }

  function renderPeriods(teacher, day) {
    var box = $("home-periods");
    var result = $("home-tt-result");
    var countEl = $("home-lesson-count");
    if (!box) return;

    if (!teacher || !day) {
      box.innerHTML = "";
      if (result) result.classList.add("hidden");
      if (countEl) countEl.hidden = true;
      return;
    }

    box.innerHTML = "";
    var schedule = (teacher.schedule && teacher.schedule[String(day)]) || {};
    var maxp = periodsForDay(day);
    var busy = 0;
    var live = browseIsToday() && day === state.todayCycleDay;
    var curSlot = live ? findCurrentSlot(day) : null;
    var curPeriod = (curSlot && curSlot.kind === "period") ? curSlot.period : null;
    var nowMins = nowHKTParts().minutes;
    var sched = scheduleForDay(day);
    var slots = (sched && sched.slots && sched.slots.length)
      ? sched.slots
      : (function () {
          var syn = [];
          for (var i = 1; i <= maxp; i++) {
            syn.push({ key: "p" + i, label: "第" + i + "節", period: i, start: "", end: "" });
          }
          return syn;
        })();

    slots.forEach(function (s) {
      if (isBreakSlot(s)) {
        box.appendChild(makeBreakRow(s, live, curSlot, nowMins));
        return;
      }
      if (s.period == null) return;
      var p = s.period;
      var cell = schedule[String(p)];
      var bell = periodBell(day, p) || (s.start && s.end ? { start: s.start, end: s.end } : null);
      var row = document.createElement("div");
      var extra = "";
      var isCurrent = false;
      if (live) {
        if (curPeriod === p) {
          extra = " is-current";
          isCurrent = true;
        } else if (bell) {
          var endM = hmToMinutes(bell.end);
          if (endM != null && nowMins >= endM) extra = " is-past";
        }
      }
      var timeHtml = bell
        ? '<span class="tt-period-time">' + escapeHtml(bell.start) + " — " + escapeHtml(bell.end) + "</span>"
        : "";
      var cdHtml = (isCurrent && bell) ? countdownHtml(bell.end) : "";

      if (cell) {
        busy++;
        var blockKey = electiveBlockKeyFromLesson({
          class_short: cell.classShort,
          class_name: cell.class,
          subject_short: cell.subjectShort,
          subject: cell.subject
        });
        // Teacher view: only this teacher's group/option (not peer chips).
        var merged = ownMergedSlots(collectMergedSlots(day, p, cell), teacher.code);
        var isElective = !!blockKey;
        // Elective: keep one option chip (subject·room). Same-subject split with
        // a single own slot: plain room (no peer teachers).
        var useChips = merged.length > 1 || (isElective && merged.length > 0);
        var isSplit = useChips;
        var subjCls = subjectClass(cell.subjectShort, cell.subject);
        if (isElective) subjCls = "tt-subj-elective";
        row.className = ("tt-period lesson " + subjCls + extra +
          (isSplit ? " is-split" : "") + (isElective ? " is-elective" : "")).trim();
        row.setAttribute("data-subj", isElective ? "elective" : subjectFamily(cell.subjectShort, cell.subject));
        var titleText = isElective
          ? electiveBlockTitle(blockKey)
          : (cell.subjectShort || cell.subject || "—");
        var detailText = cell.classShort || cell.class || "";
        var trailing = "";
        if (useChips) {
          trailing = splitGroupsHtml(merged, teacher.code);
        } else {
          if (cell.teacher && cell.teacher !== teacher.code) {
            detailText += (detailText ? " · " : "") + cell.teacher;
          }
          if (cell.room) {
            trailing = '<span class="room">' + escapeHtml(cell.room) + "</span>";
          }
        }
        row.innerHTML =
          '<div class="tt-period-left">' +
            '<span class="tt-pnum">P' + p + "</span>" +
            timeHtml +
            cdHtml +
          "</div>" +
          '<div class="tt-period-body">' +
            '<div class="subj">' + escapeHtml(titleText) + "</div>" +
            '<div class="detail">' + escapeHtml(detailText) + "</div>" +
            trailing +
          "</div>";
      } else {
        row.className = ("tt-period free" + extra).trim();
        row.innerHTML =
          '<div class="tt-period-left">' +
            '<span class="tt-pnum">P' + p + "</span>" +
            timeHtml +
            cdHtml +
          "</div>" +
          '<div class="tt-period-body">' +
            '<div class="subj free-label">空堂</div>' +
          "</div>";
      }
      if (isCurrent) row.setAttribute("aria-current", "true");
      box.appendChild(row);
    });

    if (countEl) {
      countEl.hidden = false;
      countEl.textContent = busy + " / " + maxp + " 節";
    }
    if (result) result.classList.remove("hidden");
  }

  function showSelectedTeacher() {
    var sel = $("home-teacher-select");
    var code = sel ? sel.value : state.viewingCode;
    state.viewingCode = code || "";
    var msg = $("home-tt-message");
    var result = $("home-tt-result");
    var day = state.selectedDay;

    if (!day) {
      if (msg) {
        msg.textContent = (!state.browseCycleDay && !window.__userPickedDay)
          ? noCycleDayMessage()
          : "請選擇循環日";
        msg.classList.remove("hidden");
      }
      if (result) result.classList.add("hidden");
      return;
    }

    if (!code) {
      if (msg) {
        msg.textContent = "請選擇教師以查看課表";
        msg.classList.remove("hidden");
      }
      if (result) result.classList.add("hidden");
      return;
    }

    var t = findTeacher(code);
    if (!t) {
      if (msg) {
        msg.textContent = "找不到教師「" + code + "」";
        msg.classList.remove("hidden");
      }
      if (result) result.classList.add("hidden");
      return;
    }
    if (msg) {
      msg.textContent = "";
      msg.classList.add("hidden");
    }
    renderPeriods(t, day);
  }

  function renderTimetableSection(session) {
    var studentBlock = $("home-tt-student");
    var msg = $("home-tt-message");
    var teacherRow = document.querySelector(".tt-teacher-row");

    if (!session || session.role === "student") {
      if (studentBlock) studentBlock.classList.remove("hidden");
      if (teacherRow) teacherRow.classList.add("hidden");
      var result = $("home-tt-result");
      if (result) result.classList.add("hidden");
      if (msg) msg.classList.add("hidden");
      var countEl = $("home-lesson-count");
      if (countEl) countEl.hidden = true;
      return;
    }

    if (studentBlock) studentBlock.classList.add("hidden");
    if (teacherRow) teacherRow.classList.remove("hidden");

    fillTeacherSelect(state.viewingCode);
    showSelectedTeacher();
  }

  function preferOwnCode(session) {
    if (state.viewingCode) return;
    if (session && session.staff && session.staff.short_name) {
      state.viewingCode = String(session.staff.short_name).toUpperCase();
    }
  }

  function loadTimetableCloud(session) {
    if (session.role !== "staff") return;
    preferOwnCode(session);
    if (cloudStarted && getData()) {
      fillTeacherSelect(state.viewingCode);
      showSelectedTeacher();
      fillClassRoomSelects();
      showClassRoomView();
      if (state.activePanel === "free") renderFreePanel();
      if (state.activePanel === "meet") refreshMeetPanel();
      return;
    }
    var client = getClient();
    if (!client || session.method !== "supabase") {
      if (getData()) {
        fillTeacherSelect(state.viewingCode);
        showSelectedTeacher();
        fillClassRoomSelects();
        showClassRoomView();
      }
      return;
    }
    if (cloudStarted) return;
    cloudStarted = true;
    var status = $("home-tt-status");
    if (status) status.textContent = "正在載入時間表…";
    Promise.all([
      fetchAll(client, "teachers", "code"),
      fetchAll(client, "lessons", "id"),
      fetchAll(client, "meta", "key")
    ]).then(function (parts) {
      var data = assemble(parts[0], parts[1], parts[2]);
      if (!data.teachers.length) throw new Error("empty");
      window.TIMETABLE_DATA = data;
      state.lessonRows = parts[1] || [];
      if (status) status.textContent = "";
      fillTeacherSelect(state.viewingCode);
      showSelectedTeacher();
      fillClassRoomSelects();
      showClassRoomView();
      if (state.activePanel === "free") renderFreePanel();
      if (state.activePanel === "meet") refreshMeetPanel();
    }).catch(function () {
      cloudStarted = false;
      if (status) status.textContent = getData() ? "使用本地備份" : "未能載入時間表";
      if (getData()) {
        fillTeacherSelect(state.viewingCode);
        showSelectedTeacher();
        fillClassRoomSelects();
        showClassRoomView();
      }
    });
  }


  function flattenLessonsFromData() {
    var data = getData();
    if (!data || !data.teachers) return [];
    var rows = [];
    data.teachers.forEach(function (t) {
      for (var d = 1; d <= 10; d++) {
        var dayMap = (t.schedule && t.schedule[String(d)]) || {};
        Object.keys(dayMap).forEach(function (p) {
          var cell = dayMap[p];
          if (!cell) return;
          rows.push({
            teacher_code: t.code,
            day: d,
            period: parseInt(p, 10),
            class_name: cell.class || "",
            class_short: cell.classShort || "",
            subject: cell.subject || "",
            subject_short: cell.subjectShort || "",
            teachers_field: cell.teacher || t.code,
            room: cell.room || ""
          });
        });
      }
    });
    return rows;
  }

  function getLessonRows() {
    if (state.lessonRows && state.lessonRows.length) return state.lessonRows;
    return flattenLessonsFromData();
  }

  /**
   * Cell merge rules (DB has no explicit group id):
   * 1) Same-subject split / co-taught: same day + period + subject + class
   *    group (e.g. 2A,2B ENG → AYWS@402 + NET@401).
   * 2) Senior elective block: same day + period + whole-form class
   *    (4A-D / 5A-D / 6A-D) + same block B1/B2/B3 parsed from subject_short
   *    (e.g. GEOc-GEO4-B1-…, CHEM-CHE4-B1-…); bare ICT counts as B1.
   *    Different elective subjects in that block → ONE cell listing options.
   */
  function classGroupKeyFromLesson(l) {
    return String(
      (l && (l.class_short || l.class_name || l.classShort || l.class)) || ""
    ).replace(/\s+/g, "");
  }

  function subjectKeyFromLesson(l) {
    return String(
      (l && (l.subject_short || l.subjectShort || l.subject)) || ""
    ).replace(/\s+/g, "").toUpperCase();
  }

  /** Whole-form senior class keys used by elective rows (4A-D / 4A,4B,4C,4D). */
  function isSeniorElectiveClassKey(classKey) {
    var k = String(classKey || "").toUpperCase().replace(/\s+/g, "");
    if (/^[4-6]A-D$/.test(k)) return true;
    if (/^[4-6]A,[4-6]B,[4-6]C,[4-6]D$/.test(k)) return true;
    return false;
  }

  function formFromClassKey(classKey) {
    var m = String(classKey || "").match(/^([4-6])/);
    return m ? m[1] : "";
  }

  /**
   * Elective block id from subject code, e.g. "B1" from GEOc-GEO4-B1-Geog_1C.
   * ICT (no -Bn- token) is Block 1 with the GEO/HMS/CHIS/BAF/CHEM set.
   */
  function electiveBlockFromSubject(subjectShort, subject) {
    var s = String(subjectShort || subject || "").trim();
    if (!s) return null;
    var m = s.match(/-B([123])-/i);
    if (m) return "B" + m[1];
    if (/^ICT$/i.test(s.replace(/\s+/g, ""))) return "B1";
    return null;
  }

  /** "4|B1" / "5|B2" / "6|B1" or null if not a senior elective option. */
  function electiveBlockKeyFromLesson(l) {
    var ck = classGroupKeyFromLesson(l);
    if (!isSeniorElectiveClassKey(ck)) return null;
    var form = formFromClassKey(ck);
    if (!form) return null;
    var block = electiveBlockFromSubject(
      l.subject_short || l.subjectShort,
      l.subject
    );
    if (!block) return null;
    return form + "|" + block;
  }

  /** Compact option name for chips: GEO / HMS / CHIS / ICT / BAF / CHEM… */
  function electiveOptionLabel(subjectShort, subject) {
    var fam = subjectFamily(subjectShort, subject);
    var map = {
      geog: "GEO", hmsc: "HMS", chis: "CHIS", ict: "ICT", bafs: "BAF",
      chem: "CHEM", bio: "BIO", phy: "PHY", eco: "ECO", hist: "HIST",
      ths: "THS", va: "VA", math: "M2", mus: "聲樂", stem: "BF AI"
    };
    if (map[fam]) return map[fam];
    var raw = String(subjectShort || subject || "").trim();
    if (!raw) return "—";
    if (/^ICT$/i.test(raw)) return "ICT";
    var first = raw.split(/[-_\s]/)[0];
    return String(first || raw).replace(/[ce]$/i, "").toUpperCase();
  }

  function electiveBlockTitle(blockKey) {
    if (!blockKey) return "選修";
    var parts = String(blockKey).split("|");
    var block = parts[1] || "";
    return block ? ("選修 " + block) : "選修";
  }

  function slotSortKey(g) {
    return String(g.label || "") + "\0" + String(g.code || "") + "\0" + String(g.room || "");
  }

  function orderSplitGroups(groups, preferCode) {
    var list = (groups || []).slice();
    list.sort(function (a, b) {
      if (preferCode) {
        var am = a.code === preferCode ? 0 : 1;
        var bm = b.code === preferCode ? 0 : 1;
        if (am !== bm) return am - bm;
      }
      return slotSortKey(a).localeCompare(slotSortKey(b));
    });
    return list;
  }


  /**
   * Teacher timetable only: keep chips whose teacher_code matches the viewer.
   * Class/room panels skip this and keep the full merged list.
   */
  function ownMergedSlots(groups, teacherCode) {
    var code = String(teacherCode || "").trim();
    if (!code) return [];
    return (groups || []).filter(function (g) {
      return g && g.code === code;
    });
  }

  /**
   * Peers for one cell: same-subject split groups, or all options in the
   * same senior elective block (different subjects).
   * Each slot: { code, room, subjectShort, subject, label, isElective }.
   */
  function collectMergedSlots(day, period, cell) {
    var out = [];
    var seen = {};
    if (!cell) return out;
    var classKey = classGroupKeyFromLesson({
      classShort: cell.classShort,
      class: cell.class,
      class_short: cell.classShort,
      class_name: cell.class
    });
    var subjectKey = subjectKeyFromLesson({
      subjectShort: cell.subjectShort,
      subject: cell.subject,
      subject_short: cell.subjectShort
    });
    var blockKey = electiveBlockKeyFromLesson({
      class_short: cell.classShort,
      class_name: cell.class,
      subject_short: cell.subjectShort,
      subject: cell.subject
    });
    getLessonRows().forEach(function (l) {
      if (parseInt(l.day, 10) !== day) return;
      if (parseInt(l.period, 10) !== period) return;
      if (classGroupKeyFromLesson(l) !== classKey) return;
      if (blockKey) {
        if (electiveBlockKeyFromLesson(l) !== blockKey) return;
      } else {
        if (subjectKeyFromLesson(l) !== subjectKey) return;
      }
      var code = String(l.teacher_code || "").trim();
      var room = String(l.room || "").trim();
      if (!code) return;
      var subj = l.subject_short || l.subject || "";
      var id = (blockKey ? subjectKeyFromLesson(l) + "\0" : "") + code + "\0" + room;
      if (seen[id]) return;
      seen[id] = true;
      out.push({
        code: code,
        room: room,
        subjectShort: l.subject_short || "",
        subject: l.subject || "",
        label: blockKey
          ? electiveOptionLabel(l.subject_short, l.subject)
          : "",
        isElective: !!blockKey
      });
    });
    return orderSplitGroups(out, null);
  }

  /** @deprecated name kept: same as collectMergedSlots for subject splits. */
  function collectSplitGroups(day, period, subjectKey, classKey) {
    return collectMergedSlots(day, period, {
      classShort: classKey,
      class: classKey,
      subjectShort: subjectKey,
      subject: subjectKey
    });
  }

  /**
   * Structured chips with aligned columns.
   * Elective: subject · teacher · room (full-width rows).
   * Split: teacher · room (equal 2-col grid).
   * preferCode marked is-mine (class/room show all; teacher view pre-filters).
   */
  function splitGroupsHtml(groups, preferCode) {
    var list = orderSplitGroups(groups, preferCode);
    if (!list.length) return "";
    var isElective = false;
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].isElective || list[i].label) {
        isElective = true;
        break;
      }
    }
    var mod = isElective ? " tt-groups--elective" : " tt-groups--split";
    var html = '<div class="tt-groups' + mod + '" aria-label="分組">';
    list.forEach(function (g) {
      var mine = preferCode && g.code === preferCode ? " is-mine" : "";
      var parts = "";
      if (g.label) {
        parts += '<span class="tt-g-s">' + escapeHtml(g.label) + "</span>";
      }
      if (g.code) {
        parts += '<span class="tt-g-t">' + escapeHtml(g.code) + "</span>";
      }
      if (g.room) {
        parts += '<span class="tt-g-r">' + escapeHtml(g.room) + "</span>";
      }
      html += '<span class="tt-g' + mine + '">' + parts + "</span>";
    });
    html += "</div>";
    return html;
  }

  /** Whether a class token (1A / 4A-D / 6A-D) includes target class code. */
  function classTokenIncludes(token, target) {
    token = String(token || "").toUpperCase().replace(/\s+/g, "");
    target = String(target || "").toUpperCase();
    if (!token || !target) return false;
    if (token === target) return true;
    var m = token.match(/^([1-6])([A-D])-([A-D])$/);
    if (m && m[1] === target.charAt(0)) {
      var from = m[2].charCodeAt(0);
      var to = m[3].charCodeAt(0);
      var letter = target.charCodeAt(1);
      return letter >= from && letter <= to;
    }
    return false;
  }

  function lessonMatchesClass(lesson, classCode) {
    var raw = String(lesson.class_short || lesson.class_name || "");
    var parts = raw.split(/[,，]/);
    for (var i = 0; i < parts.length; i++) {
      if (classTokenIncludes(parts[i].trim(), classCode)) return true;
    }
    return false;
  }

  function listRoomsFromLessons() {
    var seen = {};
    var rooms = [];
    getLessonRows().forEach(function (l) {
      var r = String(l.room || "").trim();
      if (!r || seen[r]) return;
      seen[r] = true;
      rooms.push(r);
    });
    rooms.sort(function (a, b) {
      var na = /^\d+$/.test(a);
      var nb = /^\d+$/.test(b);
      if (na && nb) return parseInt(a, 10) - parseInt(b, 10);
      if (na && !nb) return -1;
      if (!na && nb) return 1;
      return a.localeCompare(b, "zh-HK");
    });
    return rooms;
  }

  function fillClassRoomSelects() {
    var classSel = $("home-cr-class-select");
    var roomSel = $("home-cr-room-select");
    if (classSel) {
      var prevC = state.crClass || classSel.value || "";
      classSel.innerHTML = "";
      var opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "選擇班別…";
      classSel.appendChild(opt0);
      CLASS_CODES.forEach(function (code) {
        var opt = document.createElement("option");
        opt.value = code;
        opt.textContent = code;
        classSel.appendChild(opt);
      });
      if (prevC && CLASS_CODES.indexOf(prevC) >= 0) {
        classSel.value = prevC;
        state.crClass = prevC;
      }
    }
    if (roomSel) {
      var prevR = state.crRoom || roomSel.value || "";
      var rooms = listRoomsFromLessons();
      roomSel.innerHTML = "";
      var r0 = document.createElement("option");
      r0.value = "";
      r0.textContent = "選擇課室…";
      roomSel.appendChild(r0);
      rooms.forEach(function (r) {
        var opt = document.createElement("option");
        opt.value = r;
        opt.textContent = r;
        roomSel.appendChild(opt);
      });
      if (prevR && rooms.indexOf(prevR) >= 0) {
        roomSel.value = prevR;
        state.crRoom = prevR;
      }
    }
    applyClassRoomModeUI();
  }

  function applyClassRoomModeUI() {
    var mode = state.crMode === "room" ? "room" : "class";
    state.crMode = mode;
    var modeBar = document.querySelector(".tt-cr-mode");
    if (modeBar) {
      Array.prototype.forEach.call(modeBar.querySelectorAll("[data-cr-mode]"), function (btn) {
        var on = btn.getAttribute("data-cr-mode") === mode;
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    var classLabel = $("home-cr-class-label");
    var classSel = $("home-cr-class-select");
    var roomLabel = $("home-cr-room-label");
    var roomSel = $("home-cr-room-select");
    var showClass = mode === "class";
    function setHidden(el, hidden) {
      if (!el) return;
      el.classList.toggle("hidden", hidden);
      if (hidden) el.setAttribute("hidden", "");
      else el.removeAttribute("hidden");
    }
    setHidden(classLabel, !showClass);
    setHidden(classSel, !showClass);
    setHidden(roomLabel, showClass);
    setHidden(roomSel, showClass);
  }

  /**
   * Merge rows into one cell:
   * - elective block → key = class + block (B1/B2/B3)
   * - else → key = subject + class (split groups across rooms)
   */
  function groupLessonsForPeriod(lessons) {
    var groups = [];
    var index = {};
    (lessons || []).forEach(function (l) {
      var classKey = classGroupKeyFromLesson(l);
      var blockKey = electiveBlockKeyFromLesson(l);
      var subjKey = subjectKeyFromLesson(l);
      var key = blockKey
        ? ("E\0" + blockKey + "\0" + classKey)
        : (subjKey + "\0" + classKey);
      if (index[key] == null) {
        index[key] = groups.length;
        groups.push({
          class: l.class_name || "",
          classShort: l.class_short || "",
          subject: l.subject || "",
          subjectShort: l.subject_short || "",
          room: "",
          teachers: [],
          groupSlots: [],
          isElective: !!blockKey,
          blockKey: blockKey || ""
        });
      }
      var g = groups[index[key]];
      var code = String(l.teacher_code || "").trim();
      var room = String(l.room || "").trim();
      var label = blockKey ? electiveOptionLabel(l.subject_short, l.subject) : "";
      function pushSlot(c, r, lab, ss, sub) {
        if (!c) return;
        for (var i = 0; i < g.groupSlots.length; i++) {
          if (g.groupSlots[i].code === c && g.groupSlots[i].room === r &&
              g.groupSlots[i].label === lab) return;
        }
        g.groupSlots.push({
          code: c,
          room: r,
          label: lab || "",
          subjectShort: ss || "",
          subject: sub || "",
          isElective: !!blockKey
        });
        if (g.teachers.indexOf(c) < 0) g.teachers.push(c);
      }
      if (code) {
        pushSlot(code, room, label, l.subject_short || "", l.subject || "");
      } else {
        var field = String(l.teachers_field || "").trim();
        if (field) {
          field.split(/[,，\/、]/).forEach(function (p) {
            var c = p.trim();
            if (c) pushSlot(c, room, label, l.subject_short || "", l.subject || "");
          });
        }
      }
    });
    groups.forEach(function (g) {
      g.groupSlots = orderSplitGroups(g.groupSlots, null);
      var rooms = [];
      g.groupSlots.forEach(function (s) {
        if (s.room && rooms.indexOf(s.room) < 0) rooms.push(s.room);
      });
      g.room = rooms.length === 1 ? rooms[0] : "";
      g.rooms = rooms;
    });
    return groups;
  }

  function filterLessonsForClassRoom(day) {
    var rows = getLessonRows();
    var mode = state.crMode === "room" ? "room" : "class";
    return rows.filter(function (l) {
      if (parseInt(l.day, 10) !== day) return false;
      if (mode === "room") {
        return String(l.room || "").trim() === state.crRoom;
      }
      return lessonMatchesClass(l, state.crClass);
    });
  }

  function renderClassRoomPeriods(day, lessons) {
    var box = $("home-cr-periods");
    var result = $("home-cr-result");
    var countEl = $("home-cr-lesson-count");
    if (!box) return;

    box.innerHTML = "";
    var maxp = periodsForDay(day);
    var busy = 0;
    var live = browseIsToday() && day === state.todayCycleDay;
    var curSlot = live ? findCurrentSlot(day) : null;
    var curPeriod = (curSlot && curSlot.kind === "period") ? curSlot.period : null;
    var nowMins = nowHKTParts().minutes;
    var mode = state.crMode === "room" ? "room" : "class";

    var byPeriod = {};
    (lessons || []).forEach(function (l) {
      var p = parseInt(l.period, 10);
      if (!byPeriod[p]) byPeriod[p] = [];
      byPeriod[p].push(l);
    });

    var sched = scheduleForDay(day);
    var slots = (sched && sched.slots && sched.slots.length)
      ? sched.slots
      : (function () {
          var syn = [];
          for (var i = 1; i <= maxp; i++) {
            syn.push({ key: "p" + i, label: "第" + i + "節", period: i, start: "", end: "" });
          }
          return syn;
        })();

    slots.forEach(function (s) {
      if (isBreakSlot(s)) {
        box.appendChild(makeBreakRow(s, live, curSlot, nowMins));
        return;
      }
      if (s.period == null) return;
      var p = s.period;
      var bell = periodBell(day, p) || (s.start && s.end ? { start: s.start, end: s.end } : null);
      var extra = "";
      var isCurrent = false;
      if (live) {
        if (curPeriod === p) {
          extra = " is-current";
          isCurrent = true;
        } else if (bell) {
          var endM = hmToMinutes(bell.end);
          if (endM != null && nowMins >= endM) extra = " is-past";
        }
      }
      var timeHtml = bell
        ? '<span class="tt-period-time">' + escapeHtml(bell.start) + " — " + escapeHtml(bell.end) + "</span>"
        : "";
      var cdHtml = (isCurrent && bell) ? countdownHtml(bell.end) : "";
      var groups = groupLessonsForPeriod(byPeriod[p] || []);

      if (!groups.length) {
        var freeRow = document.createElement("div");
        freeRow.className = ("tt-period free" + extra).trim();
        freeRow.innerHTML =
          '<div class="tt-period-left">' +
            '<span class="tt-pnum">P' + p + "</span>" +
            timeHtml +
            cdHtml +
          "</div>" +
          '<div class="tt-period-body">' +
            '<div class="subj free-label">空堂</div>' +
          "</div>";
        if (isCurrent) freeRow.setAttribute("aria-current", "true");
        box.appendChild(freeRow);
        return;
      }

      busy++;
      groups.forEach(function (cell, gi) {
        var row = document.createElement("div");
        var slots = cell.groupSlots || [];
        var isSplit = slots.length > 1;
        var isElective = !!cell.isElective;
        // Room view usually has one option — keep that subject's colour/name visible.
        var focusSlot = slots.length === 1 ? slots[0] : null;
        var focusLabel = "";
        if (isElective) {
          if (focusSlot && focusSlot.label) {
            focusLabel = focusSlot.label;
          } else if (cell.subjectShort || cell.subject) {
            focusLabel = electiveOptionLabel(cell.subjectShort, cell.subject);
          }
        }
        var subjCls;
        var dataSubj;
        if (isElective && focusLabel && (mode === "room" || !isSplit)) {
          subjCls = subjectClass(
            (focusSlot && focusSlot.subjectShort) || cell.subjectShort,
            (focusSlot && focusSlot.subject) || cell.subject
          );
          dataSubj = subjectFamily(
            (focusSlot && focusSlot.subjectShort) || cell.subjectShort,
            (focusSlot && focusSlot.subject) || cell.subject
          );
        } else if (isElective) {
          subjCls = "tt-subj-elective";
          dataSubj = "elective";
        } else {
          subjCls = subjectClass(cell.subjectShort, cell.subject);
          dataSubj = subjectFamily(cell.subjectShort, cell.subject);
        }
        row.className = ("tt-period lesson " + subjCls + extra +
          (isSplit ? " is-split" : "") + (isElective ? " is-elective" : "")).trim();
        row.setAttribute("data-subj", dataSubj);
        var titleText;
        if (isElective) {
          titleText = electiveBlockTitle(cell.blockKey);
          // Room panel (or single-option cell): always show this room's subject.
          if (focusLabel && (mode === "room" || !isSplit)) {
            titleText += " · " + focusLabel;
          }
        } else {
          titleText = cell.subjectShort || cell.subject || "—";
        }
        var detailBits = [];
        if (mode === "room") {
          if (cell.classShort || cell.class) detailBits.push(cell.classShort || cell.class);
          // Teacher goes on the elective chip when we show one; else keep in detail.
          if (!isSplit && !(isElective && focusSlot) && cell.teachers && cell.teachers.length) {
            detailBits.push(cell.teachers.join(", "));
          }
        } else {
          if (cell.classShort && cell.classShort !== state.crClass) {
            detailBits.push(cell.classShort);
          } else if ((isSplit || isElective) && (cell.classShort || cell.class)) {
            detailBits.push(cell.classShort || cell.class);
          }
          if (!isSplit && cell.teachers && cell.teachers.length) {
            detailBits.push(cell.teachers.join(", "));
          }
        }
        var trailing = "";
        if (isSplit) {
          trailing = splitGroupsHtml(slots, null);
        } else if (isElective && mode === "room" && focusSlot) {
          // Explicit chip: 「ECO · CKH」(room omitted — already viewing that room)
          trailing = splitGroupsHtml([{
            code: focusSlot.code,
            room: "",
            label: focusSlot.label || focusLabel
          }], null);
        } else if (mode === "class" && cell.room) {
          trailing = '<span class="room">' + escapeHtml(cell.room) + "</span>";
        } else if (mode === "room" && cell.room && groups.length > 1) {
          trailing = '<span class="room">' + escapeHtml(cell.room) + "</span>";
        }
        row.innerHTML =
          '<div class="tt-period-left">' +
            '<span class="tt-pnum">P' + p + "</span>" +
            (gi === 0 ? timeHtml : "") +
            (gi === 0 ? cdHtml : "") +
          "</div>" +
          '<div class="tt-period-body">' +
            '<div class="subj">' + escapeHtml(titleText) + "</div>" +
            '<div class="detail">' + escapeHtml(detailBits.join(" · ")) + "</div>" +
            trailing +
          "</div>";
        if (isCurrent && gi === 0) row.setAttribute("aria-current", "true");
        box.appendChild(row);
      });
    });

    if (countEl) {
      countEl.hidden = false;
      countEl.textContent = busy + " / " + maxp + " 節";
    }
    if (result) result.classList.remove("hidden");
  }

  function showClassRoomView() {
    var session = getSession();
    var staffBlock = document.querySelector(".tt-cr-staff");
    var studentBlock = document.querySelector(".tt-cr-student");

    if (!session || session.role === "student") {
      if (staffBlock) staffBlock.classList.add("hidden");
      if (studentBlock) studentBlock.classList.remove("hidden");
      return;
    }
    if (staffBlock) staffBlock.classList.remove("hidden");
    if (studentBlock) studentBlock.classList.add("hidden");

    applyClassRoomModeUI();

    var msg = $("home-cr-message");
    var result = $("home-cr-result");
    var countEl = $("home-cr-lesson-count");
    var day = state.selectedDay;
    var mode = state.crMode === "room" ? "room" : "class";
    var pick = mode === "room" ? state.crRoom : state.crClass;

    if (!day) {
      if (msg) {
        msg.textContent = (!state.browseCycleDay && !window.__userPickedDay)
          ? noCycleDayMessage()
          : "請選擇循環日";
        msg.classList.remove("hidden");
      }
      if (result) result.classList.add("hidden");
      if (countEl) countEl.hidden = true;
      return;
    }

    if (!pick) {
      if (msg) {
        msg.textContent = mode === "room" ? "請選擇課室以查看課表" : "請選擇班別以查看課表";
        msg.classList.remove("hidden");
      }
      if (result) result.classList.add("hidden");
      if (countEl) countEl.hidden = true;
      return;
    }

    if (!getLessonRows().length) {
      if (msg) {
        msg.textContent = "時間表資料尚未載入";
        msg.classList.remove("hidden");
      }
      if (result) result.classList.add("hidden");
      if (countEl) countEl.hidden = true;
      return;
    }

    if (msg) {
      msg.textContent = "";
      msg.classList.add("hidden");
    }
    renderClassRoomPeriods(day, filterLessonsForClassRoom(day));
  }

  function bindClassRoomControls() {
    var modeBar = document.querySelector(".tt-cr-mode");
    if (modeBar && modeBar.dataset.bound !== "1") {
      modeBar.dataset.bound = "1";
      modeBar.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-cr-mode]");
        if (!btn || !modeBar.contains(btn)) return;
        var mode = btn.getAttribute("data-cr-mode");
        if (!mode || mode === state.crMode) return;
        state.crMode = mode;
        applyClassRoomModeUI();
        showClassRoomView();
      });
    }
    var classSel = $("home-cr-class-select");
    if (classSel && classSel.dataset.bound !== "1") {
      classSel.dataset.bound = "1";
      classSel.addEventListener("change", function () {
        state.crClass = classSel.value || "";
        showClassRoomView();
      });
    }
    var roomSel = $("home-cr-room-select");
    if (roomSel && roomSel.dataset.bound !== "1") {
      roomSel.dataset.bound = "1";
      roomSel.addEventListener("change", function () {
        state.crRoom = roomSel.value || "";
        showClassRoomView();
      });
    }
  }


  /** Teachers with no lesson at day/period (from lessons / assembled schedule). */
  function listFreeTeachers(day, period) {
    var data = getData();
    if (!data || !data.teachers || day == null || period == null) return [];
    var dayKey = String(day);
    var periodKey = String(period);
    var busy = {};
    var rows = getLessonRows();
    for (var i = 0; i < rows.length; i++) {
      var L = rows[i];
      if (L.day === day && L.period === period && L.teacher_code) {
        busy[String(L.teacher_code).toUpperCase()] = true;
      }
    }
    // Also trust assembled schedule (covers local backup without lessonRows)
    var free = [];
    data.teachers.forEach(function (t) {
      if (!t || !t.code) return;
      var codeU = String(t.code).toUpperCase();
      var cell = t.schedule && t.schedule[dayKey] && t.schedule[dayKey][periodKey];
      if (cell || busy[codeU]) return;
      free.push({
        short_name: t.code,
        name: t.chi || t.eng || ""
      });
    });
    free.sort(function (a, b) {
      return String(a.short_name).localeCompare(String(b.short_name));
    });
    return free;
  }

  function renderFreePanel() {
    var metaEl = $("home-free-meta");
    var listEl = $("home-free-list");
    if (!metaEl || !listEl) return;

    var session = getSession();
    if (!session || session.role !== "staff") {
      metaEl.textContent = "";
      listEl.innerHTML = "";
      return;
    }

    if (!getData() || !getData().teachers || !getData().teachers.length) {
      metaEl.textContent = "時間表載入中…";
      listEl.innerHTML = "";
      return;
    }

    var day = state.todayCycleDay;
    if (!day) {
      metaEl.textContent = "今日無上課／假期，沒有可顯示的空堂。";
      listEl.innerHTML = '<p class="home-free-empty">今日非循環日</p>';
      return;
    }

    var slot = findCurrentSlot(day);
    var bellLab = bellLabelForDay(day);
    if (!slot || slot.kind !== "period" || slot.period == null) {
      var why = "現時非上課時段";
      if (slot) {
        if (slot.kind === "before") why = "尚未上課";
        else if (slot.kind === "after") why = "已放學";
        else if (slot.kind === "break") why = "現時為" + (slot.label || "休息");
      }
      metaEl.textContent = "Day " + day +
        (bellLab ? " · " + bellLab : "") +
        " · " + why +
        " · 空堂名單只在上課節顯示";
      listEl.innerHTML = '<p class="home-free-empty">' + escapeHtml(why) + "</p>";
      return;
    }

    var period = slot.period;
    var bell = periodBell(day, period);
    var timeStr = bell ? (bell.start + "–" + bell.end) : "";
    var free = listFreeTeachers(day, period);
    metaEl.textContent = "Day " + day +
      (bellLab ? " · " + bellLab : "") +
      " · 第" + period + "節" +
      (timeStr ? "（" + timeStr + "）" : "") +
      " · 空堂 " + free.length + " 人";

    if (!free.length) {
      listEl.innerHTML = '<p class="home-free-empty">本節沒有空堂教師</p>';
      return;
    }

    var html = [];
    free.forEach(function (t) {
      html.push(
        '<div class="home-free-row">' +
          '<span class="home-free-code">' + escapeHtml(t.short_name) + "</span>" +
          '<span class="home-free-name">' + escapeHtml(t.name || "—") + "</span>" +
        "</div>"
      );
    });
    listEl.innerHTML = html.join("");
  }

    function switchHomePanel(panelId) {
    if (!panelId) panelId = "tt";
    state.activePanel = panelId;

    var bar = $("home-func-bar");
    if (bar) {
      Array.prototype.forEach.call(bar.querySelectorAll(".home-func-tab"), function (tab) {
        var on = tab.getAttribute("data-panel") === panelId;
        tab.classList.toggle("active", on);
        tab.setAttribute("aria-selected", on ? "true" : "false");
        tab.tabIndex = on ? 0 : -1;
      });
    }

    Array.prototype.forEach.call(document.querySelectorAll("#home-panels .home-panel"), function (panel) {
      var on = panel.getAttribute("data-panel") === panelId;
      panel.classList.toggle("hidden", !on);
      if (on) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
    });

    if (panelId === "class-room") {
      fillClassRoomSelects();
      showClassRoomView();
      scrollTodayDayIntoView();
    }
    if (panelId === "free") {
      renderFreePanel();
    }
    if (panelId === "seating") {
      if (window.SchoolAdminSeating && typeof window.SchoolAdminSeating.show === "function") {
        window.SchoolAdminSeating.show();
      }
    }
    if (panelId === "classroom") {
      if (window.SchoolAdminClassroom && typeof window.SchoolAdminClassroom.show === "function") {
        window.SchoolAdminClassroom.show();
      }
    }
    if (panelId === "memo") {
      if (window.SchoolAdminPersonalMemo && typeof window.SchoolAdminPersonalMemo.show === "function") {
        window.SchoolAdminPersonalMemo.show();
      }
    }
    if (panelId === "meet") {
      if (window.SchoolAdminMeet && typeof window.SchoolAdminMeet.show === "function") {
        window.SchoolAdminMeet.show();
      }
    }
  }

  function bindFuncBar() {
    var bar = $("home-func-bar");
    if (!bar || bar.dataset.bound === "1") return;
    bar.dataset.bound = "1";
    bar.addEventListener("click", function (e) {
      var tab = e.target.closest(".home-func-tab");
      if (!tab || !bar.contains(tab)) return;
      var id = tab.getAttribute("data-panel");
      if (!id || id === state.activePanel) return;
      switchHomePanel(id);
    });
    // Keyboard: left/right between tabs
    bar.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
      var tabs = Array.prototype.slice.call(bar.querySelectorAll(".home-func-tab"));
      if (!tabs.length) return;
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) i = tabs.findIndex(function (t) { return t.classList.contains("active"); });
      if (i < 0) i = 0;
      var next = i;
      if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      e.preventDefault();
      tabs[next].focus();
      switchHomePanel(tabs[next].getAttribute("data-panel"));
    });
  }

  function bindTeacherSelect() {
    var sel = $("home-teacher-select");
    if (!sel || sel.dataset.bound === "1") return;
    sel.dataset.bound = "1";
    sel.addEventListener("change", function () {
      state.viewingCode = sel.value || "";
      showSelectedTeacher();
    });
  }

  function bindDatePicker() {
    var input = $("home-date-input");
    if (!input || input.dataset.bound === "1") return;
    input.dataset.bound = "1";
    input.addEventListener("change", function () {
      var v = (input.value || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
      state.browseDate = v;
      window.__userPickedDay = false;
      try {
        document.dispatchEvent(new CustomEvent("schooladmin:browse-date", { detail: { date: v } }));
      } catch (e) { /* ignore */ }
      var session = getSession();
      if (session) loadCycleAndCalendar(session);
    });
  }

  function onAuthed() {
    var session = getSession();
    if (!session) return;
    if (!session.role) return;

    if (!state.browseDate) state.browseDate = todayHK();

    startClock();
    bindTeacherSelect();
    bindClassRoomControls();
    bindDatePicker();
    bindFuncBar();
    switchHomePanel(state.activePanel || "tt");
    renderHomeBar(session);
    loadCycleAndCalendar(session);
    if (session.role === "staff") loadTimetableCloud(session);
    else {
      renderTimetableSection(session);
      showClassRoomView();
    }
  }

  function init() {
    function bindAuthedListener() {
      if (bindAuthedListener.done) return;
      bindAuthedListener.done = true;
      // Auth dispatches on document (CustomEvent does not bubble to window).
      document.addEventListener("schooladmin:authed", onAuthed);
      window.addEventListener("schooladmin:authed", onAuthed);
    }
    bindAuthedListener();
    state.browseDate = todayHK();
    startClock();
    bindFuncBar();
    bindClassRoomControls();
    switchHomePanel(state.activePanel || "tt");
    buildDayGrid();
    fillClassRoomSelects();
    if (window.__schoolAdminSession) onAuthed();
  }

  function refreshMeetPanel() {
    if (window.SchoolAdminMeet && typeof window.SchoolAdminMeet.refresh === "function") {
      window.SchoolAdminMeet.refresh();
    }
  }

  window.SchoolAdminHome = {
    getBrowseDate: function () { return state.browseDate || todayHK(); },
    getTodayCycleDay: function () { return state.todayCycleDay; },
    getSelectedDay: function () { return state.selectedDay; },
    getTimetableData: function () { return getData(); },
    periodBell: periodBell,
    periodsForDay: periodsForDay,
    bellLabelForDay: bellLabelForDay,
    todayHK: todayHK
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
