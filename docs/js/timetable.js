(function () {
  "use strict";

  var PAGE = 1000;
  var uiReady = false;
  var cloudStarted = false;
  var searchedFromQuery = false;

  function $(id) { return document.getElementById(id); }

  function getData() {
    return window.TIMETABLE_DATA || null;
  }

  function periodsForDay(day) {
    return day === 5 || day === 10 ? 8 : 7;
  }

  function findTeacher(code) {
    var data = getData();
    if (!data || !data.teachers) return null;
    var q = (code || "").trim().toUpperCase();
    if (!q) return null;
    for (var i = 0; i < data.teachers.length; i++) {
      if (data.teachers[i].code.toUpperCase() === q) return data.teachers[i];
    }
    var hits = [];
    var raw = (code || "").trim();
    for (var j = 0; j < data.teachers.length; j++) {
      var t = data.teachers[j];
      if (
        t.code.toUpperCase().indexOf(q) >= 0 ||
        (t.chi && t.chi.indexOf(raw) >= 0) ||
        (t.eng && t.eng.toUpperCase().indexOf(q) >= 0)
      ) {
        hits.push(t);
      }
    }
    return hits.length === 1 ? hits[0] : hits.length ? hits : null;
  }

  function renderSuggestions(list) {
    var box = $("suggest");
    if (!box) return;
    box.innerHTML = "";
    if (!list || !list.length) return;
    list.slice(0, 12).forEach(function (t) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = t.code + " · " + (t.chi || t.eng);
      btn.addEventListener("click", function () {
        $("code-input").value = t.code;
        showTeacher(t);
      });
      box.appendChild(btn);
    });
  }

  function setDayTheme(day) {
    if (day === 5 || day === 10) {
      document.documentElement.setAttribute("data-day-theme", "bf");
    } else {
      document.documentElement.removeAttribute("data-day-theme");
    }
  }

  function renderDayTabs(activeDay) {
    var tabs = $("day-tabs");
    if (!tabs) return;
    tabs.innerHTML = "";
    for (var d = 1; d <= 10; d++) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "day-tab" + (d === 5 || d === 10 ? " bf" : "") + (d === activeDay ? " active" : "");
      btn.textContent = "Day " + d;
      btn.dataset.day = String(d);
      btn.addEventListener("click", function (ev) {
        var day = parseInt(ev.currentTarget.dataset.day, 10);
        window.__userPickedDay = true;
        var t = window.__currentTeacher;
        if (t) renderSchedule(t, day);
      });
      tabs.appendChild(btn);
    }
  }


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

  function electiveBlockFromSubject(subjectShort, subject) {
    var s = String(subjectShort || subject || "").trim();
    if (!s) return null;
    var m = s.match(/-B([123])-/i);
    if (m) return "B" + m[1];
    if (/^ICT$/i.test(s.replace(/\s+/g, ""))) return "B1";
    return null;
  }

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

  function electiveOptionLabel(subjectShort, subject) {
    var raw = String(subjectShort || subject || "").trim();
    if (!raw) return "—";
    if (/^ICT$/i.test(raw)) return "ICT";
    if (/流行聲樂/.test(raw)) return "聲樂";
    if (/BF\s*AI|AI\s*900/i.test(raw)) return "BF AI";
    var u = raw.toUpperCase();
    if (/^GEO/.test(u)) return "GEO";
    if (/^HMS/.test(u)) return "HMS";
    if (/^CHIS|^CHIST/.test(u)) return "CHIS";
    if (/^BAF|^BA\b/.test(u)) return "BAF";
    if (/^CHEM|^CHE/.test(u)) return "CHEM";
    if (/^BIO/.test(u)) return "BIO";
    if (/^PHY/.test(u)) return "PHY";
    if (/^ECO/.test(u)) return "ECO";
    if (/^HIST|^HIS-/.test(u)) return "HIST";
    if (/^THS/.test(u)) return "THS";
    if (/^VA\b|^VA-/.test(u)) return "VA";
    if (/^MAM|^MATH/.test(u)) return "M2";
    var first = raw.split(/[-_\s]/)[0];
    return String(first || raw).replace(/[ce]$/i, "").toUpperCase();
  }

  function electiveBlockTitle(blockKey) {
    if (!blockKey) return "選修";
    var parts = String(blockKey).split("|");
    var block = parts[1] || "";
    return block ? ("選修 " + block) : "選修";
  }

  function getAllLessonRows() {
    if (window.__LESSON_ROWS && window.__LESSON_ROWS.length) return window.__LESSON_ROWS;
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

  function orderMergedSlots(groups, preferCode) {
    var list = (groups || []).slice();
    list.sort(function (a, b) {
      if (preferCode) {
        var am = a.code === preferCode ? 0 : 1;
        var bm = b.code === preferCode ? 0 : 1;
        if (am !== bm) return am - bm;
      }
      var ka = String(a.label || "") + "\0" + a.code + "\0" + a.room;
      var kb = String(b.label || "") + "\0" + b.code + "\0" + b.room;
      return ka.localeCompare(kb);
    });
    return list;
  }

  function collectMergedSlots(day, period, cell) {
    var out = [];
    var seen = {};
    if (!cell) return out;
    var classKey = classGroupKeyFromLesson({
      classShort: cell.classShort,
      class: cell.class
    });
    var subjectKey = subjectKeyFromLesson({
      subjectShort: cell.subjectShort,
      subject: cell.subject
    });
    var blockKey = electiveBlockKeyFromLesson({
      class_short: cell.classShort,
      class_name: cell.class,
      subject_short: cell.subjectShort,
      subject: cell.subject
    });
    getAllLessonRows().forEach(function (l) {
      if (parseInt(l.day, 10) !== day) return;
      if (parseInt(l.period, 10) !== period) return;
      if (classGroupKeyFromLesson(l) !== classKey) return;
      if (blockKey) {
        if (electiveBlockKeyFromLesson(l) !== blockKey) return;
      } else if (subjectKeyFromLesson(l) !== subjectKey) {
        return;
      }
      var code = String(l.teacher_code || "").trim();
      var room = String(l.room || "").trim();
      if (!code) return;
      var id = (blockKey ? subjectKeyFromLesson(l) + "\0" : "") + code + "\0" + room;
      if (seen[id]) return;
      seen[id] = true;
      out.push({
        code: code,
        room: room,
        label: blockKey ? electiveOptionLabel(l.subject_short, l.subject) : "",
        isElective: !!blockKey
      });
    });
    return orderMergedSlots(out, null);
  }

  function splitGroupsHtml(groups, preferCode) {
    var list = orderMergedSlots(groups, preferCode);
    if (!list.length) return "";
    var html = '<div class="tt-groups" aria-label="分組">';
    list.forEach(function (g) {
      var mine = preferCode && g.code === preferCode ? " is-mine" : "";
      var bits = [];
      if (g.label) bits.push(g.label);
      if (g.code) bits.push(g.code);
      if (g.room) bits.push(g.room);
      html += '<span class="tt-g' + mine + '">' + escapeHtml(bits.join(" · ")) + "</span>";
    });
    html += "</div>";
    return html;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderSchedule(teacher, day) {
    window.__currentTeacher = teacher;
    window.__currentDay = day;
    setDayTheme(day);
    renderDayTabs(day);

    var meta = $("teacher-meta");
    if (meta) {
      meta.innerHTML =
        '<span class="code">' + escapeHtml(teacher.code) + "</span>" +
        '<span class="name-chi">' + escapeHtml(teacher.chi || "—") + "</span>" +
        '<span class="name-eng">' + escapeHtml(teacher.eng || "") + "</span>" +
        '<span class="muted">' + teacher.lessonCount + " 節</span>";
    }

    var box = $("periods");
    if (!box) return;
    box.innerHTML = "";
    var schedule = (teacher.schedule && teacher.schedule[String(day)]) || {};
    var maxp = periodsForDay(day);
    for (var p = 1; p <= maxp; p++) {
      var cell = schedule[String(p)];
      var row = document.createElement("div");
      if (cell) {
        var merged = collectMergedSlots(day, p, cell);
        var isElective = !!(merged.length && merged[0].isElective);
        var isSplit = merged.length > 1;
        var blockKey = electiveBlockKeyFromLesson({
          class_short: cell.classShort,
          class_name: cell.class,
          subject_short: cell.subjectShort,
          subject: cell.subject
        });
        row.className = "period lesson" + (isSplit ? " is-split" : "") +
          (isElective ? " is-elective" : "");
        var titleText = isElective
          ? electiveBlockTitle(blockKey)
          : (cell.subjectShort || cell.subject || "—");
        var detailText = cell.classShort || cell.class || "";
        var trailing = "";
        if (isSplit) {
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
          '<div class="pnum">' + p + "</div>" +
          '<div class="body">' +
            '<div class="subj">' + escapeHtml(titleText) + "</div>" +
            '<div class="detail">' + escapeHtml(detailText) + "</div>" +
            trailing +
          "</div>";
      } else {
        row.className = "period free";
        row.innerHTML =
          '<div class="pnum">' + p + "</div>" +
          '<div class="body"><div class="subj">空堂</div><div class="detail">Free</div></div>';
      }
      box.appendChild(row);
    }

    var result = $("result");
    if (result) result.classList.remove("hidden");
  }

  function showTeacher(t) {
    if (!t) return;
    if (Array.isArray(t)) {
      renderSuggestions(t);
      var result = $("result");
      if (result) result.classList.add("hidden");
      return;
    }
    renderSuggestions([]);
    var day = window.__currentDay || window.__todayCycleDay || 1;
    renderSchedule(t, day);
  }

  function doSearch() {
    var input = $("code-input");
    var q = (input && input.value) || "";
    var found = findTeacher(q);
    var err = $("search-err");
    if (!found) {
      if (err) err.textContent = "找不到教師「" + q.trim() + "」";
      renderSuggestions(getData() ? getData().teachers.slice(0, 8) : []);
      var result = $("result");
      if (result) result.classList.add("hidden");
      return;
    }
    if (err) err.textContent = "";
    showTeacher(found);
  }

  function setInfo(data, extra) {
    var info = $("data-info");
    if (!info) return;
    if (!data || !data.meta) {
      info.textContent = extra || "";
      return;
    }
    var count = data.meta.teacherCount || (data.teachers ? data.teachers.length : 0);
    info.textContent =
      (data.meta.schoolShort || "") + " · " +
      count + " 位教師 · 更新於 " +
      (data.meta.generatedAt || "—") +
      (extra ? " · " + extra : "");
  }

  function setCloudNote(text) {
    var note = $("cloud-note");
    if (!note) return;
    if (text) {
      note.textContent = text;
      note.classList.remove("hidden");
    } else {
      note.textContent = "";
      note.classList.add("hidden");
    }
  }

  function bindLocal(extra) {
    var data = getData();
    setInfo(data, extra || "");
    if (data && data.teachers) renderSuggestions(data.teachers.slice(0, 8));
    applyQuery();
  }

  function applyQuery() {
    if (searchedFromQuery) return;
    var params = new URLSearchParams(location.search);
    var code = params.get("t") || "";
    if (!code) {
      var q = params.get("code") || "";
      // Supabase PKCE 回傳的 ?code= 很長，不是教師代碼
      if (q && /^[A-Za-z0-9]{1,8}$/.test(q)) code = q;
    }
    var input = $("code-input");
    if (code && input && getData()) {
      searchedFromQuery = true;
      input.value = code;
      doSearch();
    }
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
    var extraDays = String(metaMap.periods_extra_days || "5,10").split(",").map(function (x) {
      return parseInt(x, 10);
    }).filter(function (n) { return !isNaN(n); });
    return {
      meta: {
        school: metaMap.school || "",
        schoolShort: metaMap.school_short || "",
        sourceFileId: metaMap.source_file_id || "",
        sourceName: metaMap.source_name || "",
        sourceTab: metaMap.source_tab || "",
        teacherCount: parseInt(metaMap.teacher_count, 10) || teachers.length,
        days: parseInt(metaMap.days, 10) || 10,
        periodsNormal: parseInt(metaMap.periods_normal, 10) || 7,
        periodsExtraDays: extraDays.length ? extraDays : [5, 10],
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
      var query = supabase.from(table).select("*").order(orderCol).range(from, from + PAGE - 1);
      return query.then(function (res) {
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

  function weekdayLabelHK(iso) {
    try {
      var parts = iso.split("-").map(function (x) { return parseInt(x, 10); });
      var dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 4, 0, 0)); // HK morning-ish
      return new Intl.DateTimeFormat("zh-HK", { timeZone: "Asia/Hong_Kong", weekday: "long" }).format(dt);
    } catch (e) {
      return "";
    }
  }

  function setTodayBanner(cycleDay, note) {
    var main = $("today-banner-text");
    var sub = $("today-banner-sub");
    var banner = $("today-banner");
    if (!main) return;
    var iso = todayHK();
    var wd = weekdayLabelHK(iso);
    if (cycleDay) {
      main.innerHTML =
        "今日：<strong>" + iso + "</strong>" +
        (wd ? "（" + wd + "）" : "") +
        " · <strong class=\"today-day\">Day " + cycleDay + "</strong>";
      if (sub) sub.textContent = note || "已自動選取今日循環日課表";
      if (banner) banner.classList.remove("is-off");
      window.__todayCycleDay = cycleDay;
      // Auto-select this day when showing a teacher
      if (!window.__userPickedDay) {
        window.__currentDay = cycleDay;
        var t = window.__currentTeacher;
        if (t) renderSchedule(t, cycleDay);
      }
    } else {
      main.innerHTML =
        "今日：<strong>" + iso + "</strong>" +
        (wd ? "（" + wd + "）" : "") +
        " · <strong>今日無上課／假期</strong>";
      if (sub) sub.textContent = note || "校曆未標示循環日（週末、假期、考試日或活動日）";
      if (banner) banner.classList.add("is-off");
      window.__todayCycleDay = null;
    }
  }

  function loadTodayCycleDay() {
    var auth = window.SchoolAdminAuth;
    var supabase = (auth && auth.getClient && auth.getClient()) || window.__supabaseClient;
    var session = auth && auth.getSession ? auth.getSession() : window.__schoolAdminSession;
    var iso = todayHK();
    if (!supabase || !session || session.method !== "supabase") {
      setTodayBanner(null, "登入後可顯示今日循環日");
      return;
    }
    supabase
      .from("cycle_days")
      .select("cycle_day,note")
      .eq("day_date", iso)
      .maybeSingle()
      .then(function (res) {
        if (res.error) {
          setTodayBanner(null, "未能讀取循環日：" + (res.error.message || ""));
          return;
        }
        var row = res.data;
        if (row && row.cycle_day) setTodayBanner(row.cycle_day, row.note || "");
        else setTodayBanner(null, "");
      })
      .catch(function (e) {
        setTodayBanner(null, "未能讀取循環日");
      });
  }


  function useLocalBackup() {
    setCloudNote("雲端暫不可用，使用本地備份");
    bindLocal("本地備份");
  }

  function loadFromCloud() {
    if (cloudStarted) return;
    var auth = window.SchoolAdminAuth;
    var supabase = (auth && auth.getClient && auth.getClient()) || window.__supabaseClient;
    var session = auth && auth.getSession ? auth.getSession() : window.__schoolAdminSession;
    if (!session || session.method !== "supabase" || !supabase) {
      setCloudNote("");
      bindLocal(session && session.method !== "supabase" ? "本地備份" : "");
      return;
    }
    cloudStarted = true;
    setCloudNote("");
    setInfo(null, "正在從 Supabase 雲端載入時間表…");
    Promise.all([
      fetchAll(supabase, "teachers", "code"),
      fetchAll(supabase, "lessons", "id"),
      fetchAll(supabase, "meta", "key")
    ]).then(function (parts) {
      var data = assemble(parts[0], parts[1], parts[2]);
      if (!data.teachers.length) throw new Error("empty");
      window.TIMETABLE_DATA = data;
      window.__LESSON_ROWS = parts[1] || [];
      setCloudNote("");
      var current = window.__currentTeacher && window.__currentTeacher.code;
      bindLocal("Supabase 雲端");
      if (current) {
        var again = findTeacher(current);
        if (again && !Array.isArray(again)) renderSchedule(again, window.__currentDay || 1);
      } else if (window.__preferTeacherCode) {
        var prefer = findTeacher(window.__preferTeacherCode);
        if (prefer && !Array.isArray(prefer)) {
          showTeacher(prefer);
          window.__preferTeacherCode = "";
        }
      }
    }).catch(function () {
      cloudStarted = false;
      useLocalBackup();
    });
  }

  function ensureUi() {
    if (uiReady) return;
    uiReady = true;
    var form = $("search-form");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        doSearch();
      });
    }
    var input = $("code-input");
    if (input) {
      input.addEventListener("input", function () {
        var q = input.value.trim();
        if (q.length < 1) {
          renderSuggestions((getData() && getData().teachers || []).slice(0, 8));
          return;
        }
        var found = findTeacher(q);
        if (Array.isArray(found)) renderSuggestions(found);
        else if (found) renderSuggestions([found]);
      });
    }
  }

  function prefillOwnCode(session) {
    var input = $("code-input");
    if (!input || !session || !session.staff || !session.staff.short_name) return;
    if ((input.value || "").trim()) return;
    var code = String(session.staff.short_name).toUpperCase();
    input.value = code;
    // Auto-search once data is ready
    window.__preferTeacherCode = code;
  }

  function onAuthed() {
    ensureUi();
    var session = (window.SchoolAdminAuth && SchoolAdminAuth.getSession()) || window.__schoolAdminSession;
    if (!session) return;
    // Students do not use teacher timetable UI
    if (session.role === "student") {
      setCloudNote("");
      return;
    }
    if (session.role && session.role !== "staff") {
      // Role still resolving — wait for next authed event
      return;
    }
    prefillOwnCode(session);
    loadTodayCycleDay();
    if (session.method === "supabase") {
      var client = (window.SchoolAdminAuth && SchoolAdminAuth.getClient && SchoolAdminAuth.getClient()) || window.__supabaseClient;
      if (client) loadFromCloud();
      else {
        var waits = 0;
        (function wait() {
          waits += 1;
          var ready = (window.SchoolAdminAuth && SchoolAdminAuth.getClient && SchoolAdminAuth.getClient()) || window.__supabaseClient;
          if (ready) loadFromCloud();
          else if (waits < 50) setTimeout(wait, 100);
          else useLocalBackup();
        })();
      }
    } else {
      setCloudNote("");
      bindLocal("");
    }
  }

  function init() {
    ensureUi();
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
