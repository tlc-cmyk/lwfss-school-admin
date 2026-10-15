(function () {
  "use strict";

  var PAGE = 1000;
  var cloudStarted = false;
  var clockTimer = null;
  var state = {
    cycleDay: null,
    cycleNote: "",
    calendarItems: [],
    viewingCode: ""
  };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

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
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
  }

  function formatDateLongHK(iso) {
    try {
      var parts = iso.split("-").map(function (x) { return parseInt(x, 10); });
      var dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 4, 0, 0));
      return new Intl.DateTimeFormat("zh-HK", {
        timeZone: "Asia/Hong_Kong",
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long"
      }).format(dt);
    } catch (e) {
      return iso;
    }
  }

  function formatTimeHK(date) {
    try {
      return new Intl.DateTimeFormat("zh-HK", {
        timeZone: "Asia/Hong_Kong",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).format(date);
    } catch (e) {
      return "";
    }
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

  function periodsForDay(day) {
    return day === 5 || day === 10 ? 8 : 7;
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

  function startClock() {
    var el = $("home-clock");
    if (!el) return;
    function tick() {
      el.textContent = formatTimeHK(new Date()) + " HKT";
    }
    tick();
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(tick, 1000);
  }

  function renderStripChrome(session) {
    var iso = todayHK();
    var dateEl = $("home-date");
    if (dateEl) dateEl.textContent = formatDateLongHK(iso);

    var greet = $("home-greeting");
    if (greet) {
      var name = displayPersonName(session);
      if (name) {
        greet.innerHTML = "你好，<strong>" + escapeHtml(name) + "</strong>";
      } else {
        greet.textContent = "";
      }
    }

    var cycleEl = $("home-cycle");
    if (cycleEl) {
      if (state.cycleDay) {
        cycleEl.innerHTML = '<span class="home-cycle-day">Day ' + state.cycleDay + "</span>";
        cycleEl.classList.remove("is-off");
      } else {
        cycleEl.innerHTML = "<span>今日無上課／假期</span>";
        cycleEl.classList.add("is-off");
      }
    }

    var noteEl = $("home-cycle-note");
    if (noteEl) {
      noteEl.textContent = state.cycleNote || "";
    }
  }

  function renderCalendarItems(session) {
    var box = $("home-calendar-list");
    if (!box) return;
    var items = state.calendarItems || [];
    if (!items.length) {
      box.innerHTML = '<p class="home-empty muted">今日暫無特別事項</p>';
      return;
    }
    var html = "<ul class=\"home-cal-ul\">";
    items.forEach(function (it) {
      var label = it.title || "";
      var badge = it.source === "deadline" ? '<span class="home-cal-badge">教職員</span>' : "";
      html +=
        "<li>" +
        badge +
        "<span class=\"home-cal-title\">" + escapeHtml(label) + "</span>" +
        "</li>";
    });
    html += "</ul>";
    box.innerHTML = html;
  }

  function loadCycleAndCalendar(session) {
    var client = getClient();
    var iso = todayHK();
    renderStripChrome(session);

    if (!client || !session || session.method !== "supabase") {
      state.cycleDay = null;
      state.cycleNote = "登入後可顯示今日循環日";
      state.calendarItems = [];
      renderStripChrome(session);
      renderCalendarItems(session);
      renderTimetableSection(session);
      return;
    }

    var cycleP = client
      .from("cycle_days")
      .select("cycle_day,note")
      .eq("day_date", iso)
      .maybeSingle();

    var calP = client
      .from("calendar_events")
      .select("id,event_date,event_date_raw,title,event_type,sort_order")
      .eq("event_date", iso)
      .order("sort_order", { ascending: true });

    Promise.all([cycleP, calP]).then(function (parts) {
      var cycleRes = parts[0];
      var calRes = parts[1];

      if (cycleRes && !cycleRes.error && cycleRes.data && cycleRes.data.cycle_day) {
        state.cycleDay = cycleRes.data.cycle_day;
        state.cycleNote = cycleRes.data.note || "";
        window.__todayCycleDay = state.cycleDay;
      } else {
        state.cycleDay = null;
        state.cycleNote = (cycleRes && cycleRes.error)
          ? ("未能讀取循環日：" + (cycleRes.error.message || ""))
          : "";
        window.__todayCycleDay = null;
      }

      var calItems = [];
      if (calRes && !calRes.error && calRes.data && calRes.data.length) {
        calItems = calRes.data.map(function (r) {
          return { title: r.title, source: "calendar", type: r.event_type || "remark" };
        });
      }

      function finish(items) {
        state.calendarItems = items;
        renderStripChrome(session);
        renderCalendarItems(session);
        renderTimetableSection(session);
      }

      // If calendar_events empty: staff see today's staff_deadlines; students omit staff-only
      if (!calItems.length && session.role === "staff") {
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
            finish(items);
          })
          .catch(function () { finish([]); });
      } else {
        // Students: only calendar_events (already filtered; staff_deadlines omitted)
        finish(calItems);
      }
    }).catch(function () {
      state.cycleDay = null;
      state.cycleNote = "未能讀取循環日";
      state.calendarItems = [];
      renderStripChrome(session);
      renderCalendarItems(session);
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
    if (!box) return;
    if (!teacher || !day) {
      box.innerHTML = "";
      if (result) result.classList.add("hidden");
      return;
    }
    if (meta) {
      meta.innerHTML =
        '<span class="code">' + escapeHtml(teacher.code) + "</span>" +
        '<span class="name-chi">' + escapeHtml(teacher.chi || "—") + "</span>" +
        '<span class="name-eng">' + escapeHtml(teacher.eng || "") + "</span>" +
        '<span class="muted">Day ' + day + " · " + teacher.lessonCount + " 節</span>";
    }
    box.innerHTML = "";
    var schedule = (teacher.schedule && teacher.schedule[String(day)]) || {};
    var maxp = periodsForDay(day);
    for (var p = 1; p <= maxp; p++) {
      var cell = schedule[String(p)];
      var row = document.createElement("div");
      if (cell) {
        row.className = "period lesson";
        row.innerHTML =
          '<div class="pnum">' + p + "</div>" +
          '<div class="body">' +
            '<div class="subj">' + escapeHtml(cell.subjectShort || cell.subject || "—") + "</div>" +
            '<div class="detail">' + escapeHtml(cell.classShort || cell.class || "") +
              (cell.teacher && cell.teacher !== teacher.code ? " · " + escapeHtml(cell.teacher) : "") +
            "</div>" +
            (cell.room ? '<span class="room">' + escapeHtml(cell.room) + "</span>" : "") +
          "</div>";
      } else {
        row.className = "period free";
        row.innerHTML =
          '<div class="pnum">' + p + "</div>" +
          '<div class="body"><div class="subj">空堂</div><div class="detail">Free</div></div>';
      }
      box.appendChild(row);
    }
    if (result) result.classList.remove("hidden");
  }

  function showSelectedTeacher() {
    var sel = $("home-teacher-select");
    var code = sel ? sel.value : state.viewingCode;
    state.viewingCode = code || "";
    var msg = $("home-tt-message");
    var result = $("home-tt-result");
    if (!state.cycleDay) {
      if (msg) {
        msg.textContent = "今日無上課／假期";
        msg.classList.remove("hidden");
      }
      if (result) result.classList.add("hidden");
      return;
    }
    if (!code) {
      if (msg) {
        msg.textContent = "請選擇教師以查看今日課表";
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
    renderPeriods(t, state.cycleDay);
  }

  function renderTimetableSection(session) {
    var staffBlock = $("home-tt-staff");
    var studentBlock = $("home-tt-student");
    var msg = $("home-tt-message");

    if (!session || session.role === "student") {
      if (staffBlock) staffBlock.classList.add("hidden");
      if (studentBlock) studentBlock.classList.remove("hidden");
      return;
    }

    if (studentBlock) studentBlock.classList.add("hidden");
    if (staffBlock) staffBlock.classList.remove("hidden");

    if (!state.cycleDay) {
      if (msg) {
        msg.textContent = "今日無上課／假期";
        msg.classList.remove("hidden");
      }
      var result = $("home-tt-result");
      if (result) result.classList.add("hidden");
      // Still allow teacher dropdown for browsing? Spec says clear message if no Day.
      // Keep dropdown but don't show periods for today.
      fillTeacherSelect(state.viewingCode);
      return;
    }

    if (msg) {
      msg.textContent = "";
      msg.classList.add("hidden");
    }
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
      // Local backup already in TIMETABLE_DATA if script loaded
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

  function onAuthed() {
    var session = getSession();
    if (!session) return;
    // Wait until role resolved
    if (!session.role) return;

    startClock();
    bindTeacherSelect();
    renderStripChrome(session);
    loadCycleAndCalendar(session);
    if (session.role === "staff") loadTimetableCloud(session);
    else renderTimetableSection(session);
  }

  function init() {
    function bindAuthedListener() {
      if (bindAuthedListener.done) return;
      bindAuthedListener.done = true;
      document.addEventListener("schooladmin:authed", onAuthed);
      window.addEventListener("schooladmin:authed", onAuthed);
    }
    bindAuthedListener();
    startClock();
    if (window.__schoolAdminSession) onAuthed();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
