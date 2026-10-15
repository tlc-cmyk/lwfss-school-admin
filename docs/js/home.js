(function () {
  "use strict";

  var PAGE = 1000;
  var cloudStarted = false;
  var clockTimer = null;
  var WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

  // Bell times (一般／BF) — same source as timetable-app bells.json
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
          { key: "lunch", label: "午飯", start: "12:35", end: "13:45", period: null },
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
        label: "BF 上課時間表",
        slots: [
          { key: "homeroom", label: "班主任／早會", start: "07:55", end: "08:30", period: null },
          { key: "p1", label: "第1節", start: "08:30", end: "09:15", period: 1 },
          { key: "p2", label: "第2節", start: "09:15", end: "10:00", period: 2 },
          { key: "recess", label: "小息", start: "10:00", end: "10:20", period: null },
          { key: "p3", label: "第3節", start: "10:20", end: "11:05", period: 3 },
          { key: "p4", label: "第4節", start: "11:05", end: "11:50", period: 4 },
          { key: "p5", label: "第5節", start: "11:50", end: "12:35", period: 5 },
          { key: "lunch", label: "午飯", start: "12:35", end: "13:45", period: null },
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

  // Static assembly themes by cycle day (not in Supabase)
  var ASSEMBLY_BY_DAY = {
    "1": "校長分享",
    "2": "國旗下的講話 / 輔導組",
    "3": "頒獎",
    "4": "學風組",
    "5": "英語分享環節",
    "6": "教師分享",
    "7": "國旗下的講話 / 訓導組",
    "8": "頒獎",
    "9": "升輔組 / 閱讀分享",
    "10": "英語分享環節"
  };

  var state = {
    browseDate: null,       // YYYY-MM-DD being viewed
    todayCycleDay: null,    // cycle day for real today
    browseCycleDay: null,   // cycle day for browseDate
    cycleNote: "",
    calendarItems: [],
    deadlineItems: [],
    viewingCode: "",
    selectedDay: null       // D1–D10 selection for bottom TT
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

  function scheduleIdForDay(d) {
    return (BELLS.byCycleDay && BELLS.byCycleDay[String(d)]) || "general";
  }

  function scheduleForDay(d) {
    return BELLS.schedules[scheduleIdForDay(d)] || BELLS.schedules.general;
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
        else if (s.key === "lunch") label = "午飯";
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
            statusEl.className = "tt-status-chip " + statusChipClass(slot);
          } else {
            statusEl.hidden = true;
          }
        } else if (browseIsToday()) {
          statusEl.hidden = false;
          statusEl.textContent = "無上課";
          statusEl.className = "tt-status-chip is-after";
        } else {
          statusEl.hidden = true;
        }
      }

      // Refresh now-banner + period past/current occasionally
      if (browseIsToday() && state.selectedDay && state.selectedDay === state.todayCycleDay) {
        updateNowBanner();
      }
    }
    tick();
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(tick, 1000);
  }

  function renderWho(session) {
    var el = $("tt-hero-who");
    if (!el) return;
    var name = displayPersonName(session);
    if (!name) {
      el.textContent = "";
      return;
    }
    var short = session.staff && session.staff.short_name
      ? String(session.staff.short_name).toUpperCase()
      : "";
    el.innerHTML = escapeHtml(name) +
      (short ? ' <span class="tt-who-code">' + escapeHtml(short) + "</span>" : "");
  }

  function renderHeroChrome(session) {
    var iso = state.browseDate || todayHK();
    var dateEl = $("home-date");
    if (dateEl) dateEl.textContent = formatDateLine(iso);

    var dayNum = $("home-date-daynum");
    if (dayNum) {
      var p = iso.split("-");
      dayNum.textContent = p[2] ? String(parseInt(p[2], 10)) : "—";
    }

    var pill = $("home-today-pill");
    if (pill) pill.hidden = !browseIsToday();

    var dateInput = $("home-date-input");
    if (dateInput && dateInput.value !== iso) dateInput.value = iso;

    renderWho(session);

    var cycleEl = $("home-cycle");
    var subEl = $("home-sched-label");
    var day = effectiveCycleDay();
    if (cycleEl) {
      if (day) {
        cycleEl.textContent = "循環日 Day " + day;
        cycleEl.classList.remove("is-off");
      } else {
        cycleEl.textContent = browseIsToday() ? "今日無上課／假期" : "是日無上課／假期";
        cycleEl.classList.add("is-off");
      }
    }
    if (subEl) {
      if (day) {
        var sched = scheduleForDay(day);
        subEl.textContent = (sched && sched.label) || "一般上課時間";
      } else {
        subEl.textContent = state.cycleNote || "";
      }
    }

    // Remarks line (calendar events of type remark / all non-deadline titles)
    var remarks = $("home-remarks");
    if (remarks) {
      var remarkTitles = (state.calendarItems || [])
        .filter(function (it) { return it.source === "calendar"; })
        .map(function (it) { return it.title; });
      if (remarkTitles.length) {
        remarks.innerHTML = '<span class="tt-remarks-label">當日事項</span> ' +
          escapeHtml(remarkTitles.join("、"));
        remarks.hidden = false;
      } else {
        remarks.innerHTML = "";
        remarks.hidden = true;
      }
    }

    // Duty — no Supabase table; keep hidden
    var duty = $("home-duty");
    if (duty) {
      duty.hidden = true;
      duty.textContent = "";
    }

    // Assembly from static map when we have a cycle day
    var asm = $("home-assembly");
    if (asm) {
      if (day && ASSEMBLY_BY_DAY[String(day)]) {
        asm.hidden = false;
        asm.innerHTML = '<span class="tt-meta-label">早會：</span>' +
          escapeHtml(ASSEMBLY_BY_DAY[String(day)]);
      } else {
        asm.hidden = true;
        asm.textContent = "";
      }
    }

    renderEventList(session);
  }

  function renderEventList(session) {
    var list = $("home-event-list");
    if (!list) return;
    var items = [];

    // Prefer splitting: calendar meetings + staff deadlines for staff
    (state.calendarItems || []).forEach(function (it) {
      if (it.source === "calendar" && it.type && it.type !== "remark") {
        items.push({ icon: it.type === "meeting" ? "🗓️" : "📋", title: it.title });
      }
    });

    if (session && session.role === "staff") {
      (state.deadlineItems || []).forEach(function (it) {
        var title = it.title || "";
        // Split combined "…／行政會議" style rows into checklist + meeting
        var parts = title.split(/\s*[\/／]\s*/);
        var meetPart = null;
        if (parts.length > 1 && /會議\s*$/.test(parts[parts.length - 1])) {
          meetPart = parts.pop();
          title = parts.join("／");
        }
        var badge = browseIsToday() ? "今日" : "";
        if (title) {
          items.push({ icon: "📋", title: title, badge: badge });
        }
        if (meetPart) {
          items.push({ icon: "🗓️", title: meetPart, badge: badge });
        } else if (!title && /會議/.test(it.title || "")) {
          items.push({ icon: "🗓️", title: it.title, badge: badge });
        }
      });
    }

    if (!items.length) {
      list.innerHTML = "";
      return;
    }

    var html = "";
    items.forEach(function (it) {
      html +=
        '<li class="tt-event-item">' +
          '<span class="tt-event-icon" aria-hidden="true">' + it.icon + "</span>" +
          '<span class="tt-event-title">' + escapeHtml(it.title) + "</span>" +
          (it.badge ? '<span class="tt-event-badge">' + escapeHtml(it.badge) + "</span>" : "") +
        "</li>";
    });
    list.innerHTML = html;
  }

  function buildDayGrid() {
    var grid = $("home-day-grid");
    if (!grid) return;
    grid.innerHTML = "";
    var todayMark = state.todayCycleDay;
    for (var d = 1; d <= 10; d++) {
      (function (day) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tt-day-chip";
        btn.dataset.day = String(day);
        btn.setAttribute("role", "tab");
        btn.textContent = "D" + day;
        if (todayMark === day) btn.classList.add("has-today-mark");
        if (state.selectedDay === day) {
          btn.classList.add("active");
          btn.setAttribute("aria-selected", "true");
        } else {
          btn.setAttribute("aria-selected", "false");
        }
        btn.addEventListener("click", function () {
          window.__userPickedDay = true;
          state.selectedDay = day;
          refreshDayGridActive();
          showSelectedTeacher();
        });
        grid.appendChild(btn);
      })(d);
    }
  }

  function refreshDayGridActive() {
    var grid = $("home-day-grid");
    if (!grid) return;
    Array.prototype.forEach.call(grid.querySelectorAll(".tt-day-chip"), function (chip) {
      var day = parseInt(chip.dataset.day, 10);
      var on = day === state.selectedDay;
      chip.classList.toggle("active", on);
      chip.setAttribute("aria-selected", on ? "true" : "false");
      chip.classList.toggle("has-today-mark", state.todayCycleDay === day);
    });
  }

  function updateNowBanner() {
    var banner = $("home-now-banner");
    if (!banner) return;
    var day = state.selectedDay;
    if (!browseIsToday() || !day || day !== state.todayCycleDay) {
      banner.hidden = true;
      banner.textContent = "";
      return;
    }
    var slot = findCurrentSlot(day);
    if (!slot) {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    banner.className = "tt-now-banner" + (slot.kind === "period" ? " is-period" : "");
    if (slot.kind === "period") {
      banner.textContent = "⏱ 現正：" + (slot.slotLabel || ("第" + slot.period + "節"));
    } else {
      banner.textContent = "⏱ " + slot.label;
    }
  }

  function loadCycleAndCalendar(session) {
    var client = getClient();
    var iso = state.browseDate || todayHK();
    renderHeroChrome(session);

    if (!client || !session || session.method !== "supabase") {
      state.browseCycleDay = null;
      state.todayCycleDay = null;
      state.cycleNote = "登入後可顯示循環日";
      state.calendarItems = [];
      state.deadlineItems = [];
      if (!state.selectedDay) state.selectedDay = 1;
      renderHeroChrome(session);
      buildDayGrid();
      renderTimetableSection(session);
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

    Promise.all([cycleBrowse, cycleToday, calP]).then(function (parts) {
      var browseRes = parts[0];
      var todayRes = parts[1];
      var calRes = parts[2];

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
      } else {
        state.todayCycleDay = state.todayCycleDay; // keep prior if any
      }
      window.__todayCycleDay = state.todayCycleDay;

      // Default selected day: today's cycle, else browse cycle, else 1
      if (!state.selectedDay) {
        state.selectedDay = state.todayCycleDay || state.browseCycleDay || 1;
      } else if (iso === realToday && state.browseCycleDay && !window.__userPickedDay) {
        state.selectedDay = state.browseCycleDay;
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
        renderHeroChrome(session);
        buildDayGrid();
        renderTimetableSection(session);
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
              items = dlRes.data.map(function (r) {
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
      renderHeroChrome(session);
      buildDayGrid();
      renderTimetableSection(session);
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

  function renderPeriods(teacher, day) {
    var box = $("home-periods");
    var meta = $("home-tt-meta");
    var result = $("home-tt-result");
    var title = $("home-day-title");
    var countEl = $("home-lesson-count");
    if (!box) return;

    var sched = scheduleForDay(day);
    if (title) {
      title.textContent = "Day " + day + " · " + ((sched && sched.label) || "一般上課時間");
    }

    if (!teacher || !day) {
      box.innerHTML = "";
      if (result) result.classList.add("hidden");
      if (countEl) countEl.hidden = true;
      return;
    }

    if (meta) {
      meta.innerHTML =
        '<span class="code">' + escapeHtml(teacher.code) + "</span>" +
        '<span class="name-chi">' + escapeHtml(teacher.chi || "—") + "</span>" +
        '<span class="name-eng">' + escapeHtml(teacher.eng || "") + "</span>";
    }

    box.innerHTML = "";
    var schedule = (teacher.schedule && teacher.schedule[String(day)]) || {};
    var maxp = periodsForDay(day);
    var busy = 0;
    var live = browseIsToday() && day === state.todayCycleDay;
    var curSlot = live ? findCurrentSlot(day) : null;
    var curPeriod = (curSlot && curSlot.kind === "period") ? curSlot.period : null;
    var nowMins = nowHKTParts().minutes;

    for (var p = 1; p <= maxp; p++) {
      var cell = schedule[String(p)];
      var bell = periodBell(day, p);
      var row = document.createElement("div");
      var extra = "";
      if (live) {
        if (curPeriod === p) extra = " is-current";
        else if (bell) {
          var endM = hmToMinutes(bell.end);
          if (endM != null && nowMins >= endM) extra = " is-past";
        }
      }
      var timeHtml = bell
        ? '<span class="tt-period-time">' + escapeHtml(bell.start) + " — " + escapeHtml(bell.end) + "</span>"
        : "";

      if (cell) {
        busy++;
        row.className = ("tt-period lesson" + extra).trim();
        row.innerHTML =
          '<div class="tt-period-left">' +
            '<span class="tt-pnum">P' + p + "</span>" +
            timeHtml +
          "</div>" +
          '<div class="tt-period-body">' +
            '<div class="subj">' + escapeHtml(cell.subjectShort || cell.subject || "—") + "</div>" +
            '<div class="detail">' + escapeHtml(cell.classShort || cell.class || "") +
              (cell.teacher && cell.teacher !== teacher.code ? " · " + escapeHtml(cell.teacher) : "") +
            "</div>" +
            (cell.room ? '<span class="room">' + escapeHtml(cell.room) + "</span>" : "") +
          "</div>";
      } else {
        row.className = ("tt-period free" + extra).trim();
        row.innerHTML =
          '<div class="tt-period-left">' +
            '<span class="tt-pnum">P' + p + "</span>" +
            timeHtml +
          "</div>" +
          '<div class="tt-period-body">' +
            '<div class="subj free-label">空堂</div>' +
            '<div class="detail-free">Free period</div>' +
          "</div>";
      }
      if (extra.indexOf("is-current") >= 0) row.setAttribute("aria-current", "true");
      box.appendChild(row);
    }

    if (countEl) {
      countEl.hidden = false;
      countEl.textContent = busy + " 節課 / " + maxp + " 節";
    }
    if (result) result.classList.remove("hidden");
    updateNowBanner();
  }

  function showSelectedTeacher() {
    var sel = $("home-teacher-select");
    var code = sel ? sel.value : state.viewingCode;
    state.viewingCode = code || "";
    var msg = $("home-tt-message");
    var result = $("home-tt-result");
    var day = state.selectedDay;

    var title = $("home-day-title");
    if (title && day) {
      var sched = scheduleForDay(day);
      title.textContent = "Day " + day + " · " + ((sched && sched.label) || "一般上課時間");
    }

    if (!day) {
      if (msg) {
        msg.textContent = "請選擇循環日";
        msg.classList.remove("hidden");
      }
      if (result) result.classList.add("hidden");
      updateNowBanner();
      return;
    }

    if (!code) {
      if (msg) {
        msg.textContent = "請選擇教師以查看課表";
        msg.classList.remove("hidden");
      }
      if (result) result.classList.add("hidden");
      // Still show empty period shells? Prefer message only.
      updateNowBanner();
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
      updateNowBanner();
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
      return;
    }
    var client = getClient();
    if (!client || session.method !== "supabase") {
      if (getData()) {
        fillTeacherSelect(state.viewingCode);
        showSelectedTeacher();
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
      if (status) status.textContent = "";
      fillTeacherSelect(state.viewingCode);
      showSelectedTeacher();
    }).catch(function () {
      cloudStarted = false;
      if (status) status.textContent = getData() ? "使用本地備份" : "未能載入時間表";
      if (getData()) {
        fillTeacherSelect(state.viewingCode);
        showSelectedTeacher();
      }
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
    bindDatePicker();
    renderHeroChrome(session);
    loadCycleAndCalendar(session);
    if (session.role === "staff") loadTimetableCloud(session);
    else renderTimetableSection(session);
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
    buildDayGrid();
    if (window.__schoolAdminSession) onAuthed();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
