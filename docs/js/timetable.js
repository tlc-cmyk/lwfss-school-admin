(function () {
  "use strict";

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
        var t = window.__currentTeacher;
        if (t) renderSchedule(t, day);
      });
      tabs.appendChild(btn);
    }
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
    renderSchedule(t, window.__currentDay || 1);
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

  function init() {
    var data = getData();
    var info = $("data-info");
    if (info && data && data.meta) {
      info.textContent =
        (data.meta.schoolShort || "") + " · " +
        data.meta.teacherCount + " 位教師 · 更新於 " +
        (data.meta.generatedAt || "—");
    }

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

    if (data && data.teachers) {
      renderSuggestions(data.teachers.slice(0, 8));
    }

    var params = new URLSearchParams(location.search);
    var code = params.get("code") || params.get("t");
    if (code && input) {
      input.value = code;
      doSearch();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
