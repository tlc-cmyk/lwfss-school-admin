(function () {
  "use strict";

  /**
   * 班主任 — staff-only grid of form teachers (1A–6D) + 非班主任.
   * Data from Supabase class_teachers / staff / teachers; timetable via TIMETABLE_DATA.
   */

  var ACADEMIC_YEAR = "2026-2027";
  var STREAMS = ["A", "B", "C", "D"];
  var FORMS = ["1", "2", "3", "4", "5", "6"];

  /** class_teachers / staff short codes → TIMETABLE_DATA ShortName */
  var CODE_ALIASES = {
    LTTJ: "LTTT",
    WWKF: "WWK",
    GG: "NET",
    CKHC: "CKH"
  };

  var state = {
    loaded: false,
    loading: false,
    error: "",
    /** @type {{classCode:string, form:string, stream:string, teachers:object[]}[]} */
    classes: [],
    /** @type {object[]} */
    nonForm: [],
    meta: { classCount: 0, formTeacherSlots: 0, nonFormCount: 0, year: ACADEMIC_YEAR },
    bound: false,
    query: ""
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

  function getClient() {
    var auth = window.SchoolAdminAuth;
    return (auth && auth.getClient && auth.getClient()) || window.__supabaseClient || null;
  }

  function getTimetableData() {
    if (window.SchoolAdminHome && typeof SchoolAdminHome.getTimetableData === "function") {
      var d = SchoolAdminHome.getTimetableData();
      if (d && d.teachers) return d;
    }
    return window.TIMETABLE_DATA || null;
  }

  function findTimetableTeacher(code) {
    var data = getTimetableData();
    if (!data || !data.teachers) return null;
    var q = String(code || "").trim().toUpperCase();
    if (!q) return null;
    for (var i = 0; i < data.teachers.length; i++) {
      if (String(data.teachers[i].code || "").toUpperCase() === q) return data.teachers[i];
    }
    return null;
  }

  function normalizeShort(code) {
    return String(code || "").trim().toUpperCase();
  }

  function timetableCodeFor(shortCode) {
    var u = normalizeShort(shortCode);
    if (!u) return "";
    return CODE_ALIASES[u] || u;
  }

  function normalizeClassCode(raw) {
    var s = String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
    if (!s) return "";
    // S1A → 1A
    var m = s.match(/^S?([1-6])([A-D])$/);
    if (m) return m[1] + m[2];
    return s;
  }

  function classToFormStream(classCode) {
    var c = normalizeClassCode(classCode);
    var m = c.match(/^([1-6])([A-D])$/);
    if (!m) return null;
    return { form: m[1], stream: m[2], classCode: c };
  }

  function normalizeFtQuery(q) {
    return String(q || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
  }

  function teacherMatches(entry, rawQ, upperQ) {
    if (!upperQ) return true;
    var code = normalizeShort(entry.code);
    var tt = normalizeShort(entry.timetableCode);
    var chi = String(entry.chi || "");
    var eng = String(entry.eng || "").toUpperCase();
    if (code && code.indexOf(upperQ) !== -1) return true;
    if (tt && tt.indexOf(upperQ) !== -1) return true;
    if (eng && eng.indexOf(upperQ) !== -1) return true;
    if (chi && chi.indexOf(rawQ) !== -1) return true;
    return false;
  }

  function classMatches(classCode, upperQ) {
    if (!upperQ) return true;
    var c = normalizeClassCode(classCode);
    var sForm = "S" + c; // S1A
    if (c.indexOf(upperQ) !== -1) return true;
    if (sForm.indexOf(upperQ) !== -1) return true;
    // form only: 1 / S1
    var m = c.match(/^([1-6])([A-D])$/);
    if (m) {
      if (upperQ === m[1] || upperQ === "S" + m[1]) return true;
    }
    return false;
  }

  function resolveDisplayNames(shortLower, staffByShort, teachersByCode) {
    var u = normalizeShort(shortLower);
    var staff = staffByShort[u] || staffByShort[String(shortLower || "").toLowerCase()];
    var ttCode = timetableCodeFor(u);
    var tt = findTimetableTeacher(ttCode) || findTimetableTeacher(u);
    var dbT = teachersByCode[ttCode] || teachersByCode[u] || null;
    var chi = (staff && staff.name) || (tt && tt.chi) || (dbT && dbT.chi_name) || "";
    var eng = (tt && tt.eng) || (dbT && dbT.eng_name) || "";
    return { chi: chi, eng: eng, inTimetable: !!tt, timetableCode: tt ? tt.code : ttCode };
  }

  function buildModel(classRows, staffRows, teacherRows) {
    var staffByShort = {};
    (staffRows || []).forEach(function (s) {
      var k = normalizeShort(s.short_name);
      if (k) staffByShort[k] = s;
      var low = String(s.short_name || "").trim().toLowerCase();
      if (low) staffByShort[low] = s;
    });

    var teachersByCode = {};
    (teacherRows || []).forEach(function (t) {
      var k = normalizeShort(t.code);
      if (k) teachersByCode[k] = t;
    });

    var byClass = {};
    var formShorts = {};
    (classRows || []).forEach(function (row) {
      var parsed = classToFormStream(row.class_code);
      if (!parsed) return;
      var short = String(row.teacher_short_name || "").trim();
      if (!short) return;
      var u = normalizeShort(short);
      formShorts[u] = true;
      // also mark aliased target so we don't double-list
      var aliased = timetableCodeFor(u);
      if (aliased) formShorts[aliased] = true;

      if (!byClass[parsed.classCode]) {
        byClass[parsed.classCode] = {
          classCode: parsed.classCode,
          form: parsed.form,
          stream: parsed.stream,
          teachers: []
        };
      }
      var names = resolveDisplayNames(short, staffByShort, teachersByCode);
      byClass[parsed.classCode].teachers.push({
        code: u,
        chi: names.chi,
        eng: names.eng,
        timetableCode: names.timetableCode !== u ? names.timetableCode : (CODE_ALIASES[u] || ""),
        inTimetable: names.inTimetable,
        sortOrder: row.sort_order == null ? 0 : row.sort_order
      });
    });

    Object.keys(byClass).forEach(function (cc) {
      byClass[cc].teachers.sort(function (a, b) {
        return (a.sortOrder - b.sortOrder) || a.code.localeCompare(b.code);
      });
    });

    var classes = [];
    FORMS.forEach(function (form) {
      STREAMS.forEach(function (stream) {
        var cc = form + stream;
        if (byClass[cc]) classes.push(byClass[cc]);
      });
    });
    // any unexpected class codes
    Object.keys(byClass).sort().forEach(function (cc) {
      if (!classes.some(function (c) { return c.classCode === cc; })) {
        classes.push(byClass[cc]);
      }
    });

    var nonForm = [];
    (staffRows || []).forEach(function (s) {
      if (!s || !s.is_teaching_staff) return;
      var u = normalizeShort(s.short_name);
      if (!u) return;
      if (formShorts[u] || formShorts[timetableCodeFor(u)]) return;
      var names = resolveDisplayNames(s.short_name, staffByShort, teachersByCode);
      nonForm.push({
        code: u,
        chi: names.chi || s.name || "",
        eng: names.eng || "",
        timetableCode: names.timetableCode !== u ? names.timetableCode : (CODE_ALIASES[u] || ""),
        inTimetable: names.inTimetable
      });
    });
    nonForm.sort(function (a, b) { return a.code.localeCompare(b.code); });

    var slots = 0;
    classes.forEach(function (c) { slots += c.teachers.length; });

    return {
      classes: classes,
      nonForm: nonForm,
      meta: {
        year: ACADEMIC_YEAR,
        classCount: classes.length,
        formTeacherSlots: slots,
        nonFormCount: nonForm.length
      }
    };
  }

  function fetchAll(client, table, select, orderCol) {
    var PAGE = 1000;
    var all = [];
    function page(from) {
      var q = client.from(table).select(select);
      if (orderCol) q = q.order(orderCol);
      return q.range(from, from + PAGE - 1).then(function (res) {
        if (!res || res.error) throw (res && res.error) || new Error("查詢失敗");
        var rows = res.data || [];
        all = all.concat(rows);
        if (rows.length < PAGE) return all;
        return page(from + PAGE);
      });
    }
    return page(0);
  }

  function loadData() {
    if (state.loading) return Promise.resolve();
    var client = getClient();
    var session = getSession();
    if (!client || !session || session.role !== "staff") {
      state.error = "請以教職員身分登入後再睇班主任。";
      state.loaded = false;
      return Promise.resolve();
    }
    state.loading = true;
    state.error = "";
    renderShell();

    return Promise.all([
      client
        .from("class_teachers")
        .select("class_code, teacher_short_name, sort_order")
        .eq("academic_year", ACADEMIC_YEAR)
        .order("class_code")
        .order("sort_order")
        .then(function (res) {
          if (!res || res.error) throw (res && res.error) || new Error("無法載入班主任");
          return res.data || [];
        }),
      fetchAll(client, "staff", "short_name, name, class_teacher, is_teaching_staff", "short_name"),
      fetchAll(client, "teachers", "code, eng_name, chi_name", "code")
    ])
      .then(function (parts) {
        var model = buildModel(parts[0], parts[1], parts[2]);
        state.classes = model.classes;
        state.nonForm = model.nonForm;
        state.meta = model.meta;
        state.loaded = true;
        state.loading = false;
        state.error = "";
        renderAll();
      })
      .catch(function (err) {
        state.loading = false;
        state.loaded = false;
        state.error = (err && (err.message || err.msg)) || "載入班主任失敗";
        renderAll();
      });
  }

  function openTeacher(entry) {
    if (!entry) return;
    var code = entry.timetableCode || entry.code;
    var aliased = timetableCodeFor(entry.code);
    var tryCodes = [code, aliased, entry.code].filter(Boolean);
    var ok = false;
    if (window.SchoolAdminHome && typeof SchoolAdminHome.viewTeacher === "function") {
      for (var i = 0; i < tryCodes.length; i++) {
        if (SchoolAdminHome.viewTeacher(tryCodes[i])) {
          ok = true;
          break;
        }
      }
    }
    if (!ok) {
      // Fallback: set select + switch tab via DOM
      var resolved = null;
      for (var j = 0; j < tryCodes.length; j++) {
        resolved = findTimetableTeacher(tryCodes[j]);
        if (resolved) break;
      }
      if (!resolved) return;
      var sel = $("home-teacher-select");
      if (sel) {
        sel.value = resolved.code;
        try {
          sel.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (e) { /* ignore */ }
      }
      if (window.SchoolAdminHome && typeof SchoolAdminHome.switchPanel === "function") {
        SchoolAdminHome.switchPanel("tt");
      } else {
        var tab = $("home-tab-tt");
        if (tab) tab.click();
      }
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e2) { /* ignore */ }
    }
  }

  function renderTeacherButton(entry, highlight) {
    var tt = entry.inTimetable;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ft-teacher" + (tt ? " has-tt" : "") + (highlight ? " is-hit" : "");
    var nameLine = [entry.chi, entry.eng].filter(Boolean).join(" · ");
    btn.innerHTML =
      '<span class="ft-code">' + escapeHtml(entry.code) + "</span>" +
      (nameLine ? '<span class="ft-name">' + escapeHtml(nameLine) + "</span>" : "") +
      (tt ? '<span class="ft-tt-hint">查看時間表</span>' : "");
    if (tt) {
      btn.title = "開啟 " + entry.code + " 時間表";
      btn.addEventListener("click", function () { openTeacher(entry); });
    } else {
      btn.title = entry.code + " 唔喺時間表資料入面";
      btn.disabled = true;
      btn.setAttribute("aria-disabled", "true");
    }
    return btn;
  }

  function renderShell() {
    var metaEl = $("home-ft-meta");
    var grid = $("home-ft-grid");
    var empty = $("home-ft-empty");
    if (state.loading && metaEl) metaEl.textContent = "載入班主任中…";
    if (state.loading && grid) grid.innerHTML = "";
    if (empty) empty.hidden = true;
  }

  function renderAll() {
    var metaEl = $("home-ft-meta");
    var grid = $("home-ft-grid");
    var empty = $("home-ft-empty");
    if (!grid) return;

    grid.innerHTML = "";

    if (state.error) {
      if (metaEl) metaEl.textContent = state.error;
      if (empty) {
        empty.hidden = false;
        empty.textContent = state.error;
      }
      return;
    }

    if (!state.loaded) {
      if (metaEl) metaEl.textContent = "載入班主任中…";
      if (empty) empty.hidden = true;
      return;
    }

    var rawQ = state.query;
    var q = normalizeFtQuery(rawQ);
    var visibleClasses = 0;
    var visibleTeachers = 0;

    FORMS.forEach(function (form) {
      var formClasses = state.classes.filter(function (c) { return c.form === form; });
      if (!formClasses.length) return;

      var streamWrap = document.createElement("div");
      streamWrap.className = "ft-form-block";
      var heading = document.createElement("h3");
      heading.textContent = form + " 年級";
      streamWrap.appendChild(heading);
      var formGrid = document.createElement("div");
      formGrid.className = "ft-grid";
      var formHasVisible = false;

      STREAMS.forEach(function (stream) {
        var cls = formClasses.filter(function (c) { return c.stream === stream; })[0];
        if (!cls) return;
        var teachers = cls.teachers || [];
        var classHit = classMatches(cls.classCode, q);
        var teacherHitFlags = teachers.map(function (entry) {
          return teacherMatches(entry, rawQ, q);
        });
        var anyTeacherHit = teacherHitFlags.some(Boolean);
        if (q && !classHit && !anyTeacherHit) return;

        formHasVisible = true;
        visibleClasses += 1;
        var card = document.createElement("div");
        card.className = "ft-class" + (q && (classHit || anyTeacherHit) ? " is-hit" : "");
        var idEl = document.createElement("div");
        idEl.className = "ft-class-id";
        idEl.textContent = cls.classCode;
        card.appendChild(idEl);

        teachers.forEach(function (entry, idx) {
          if (q && !classHit && !teacherHitFlags[idx]) return;
          visibleTeachers += 1;
          card.appendChild(renderTeacherButton(entry, !!(q && teacherHitFlags[idx])));
        });
        formGrid.appendChild(card);
      });

      if (formHasVisible) {
        streamWrap.appendChild(formGrid);
        grid.appendChild(streamWrap);
      }
    });

    var nonForm = state.nonForm || [];
    var nonHits = nonForm.map(function (entry) {
      return teacherMatches(entry, rawQ, q);
    });
    var queryLooksLikeClass = q && /^S?[1-6][A-D]?$/.test(q);
    var showNon = nonForm.length > 0 && (!q || nonHits.some(Boolean)) &&
      !(queryLooksLikeClass && !nonHits.some(Boolean));

    if (showNon) {
      var nfBlock = document.createElement("div");
      nfBlock.className = "ft-form-block";
      var nfH = document.createElement("h3");
      nfH.textContent = "非班主任";
      nfBlock.appendChild(nfH);
      var nfWrap = document.createElement("div");
      nfWrap.className = "ft-nonform";
      nonForm.forEach(function (entry, idx) {
        if (q && !nonHits[idx]) return;
        visibleTeachers += 1;
        nfWrap.appendChild(renderTeacherButton(entry, !!(q && nonHits[idx])));
      });
      nfBlock.appendChild(nfWrap);
      grid.appendChild(nfBlock);
    }

    if (metaEl) {
      var m = state.meta || {};
      metaEl.textContent = q
        ? ("搜尋「" + rawQ + "」· 顯示 " + visibleClasses + " 班／" + visibleTeachers + " 人")
        : ("班主任 · " + (m.year || ACADEMIC_YEAR) + " · " + (m.classCount || 0) + " 班 · " +
          (m.formTeacherSlots || 0) + " 位班主任 · 非班主任 " + (m.nonFormCount || 0) + " 人");
    }
    if (empty) {
      empty.hidden = grid.children.length > 0;
      empty.textContent = "冇符合嘅班別或教師。";
    }
  }

  function bind() {
    if (state.bound) return;
    state.bound = true;
    var input = $("home-ft-search");
    var clearBtn = $("home-ft-search-clear");
    if (input) {
      input.addEventListener("input", function () {
        state.query = input.value || "";
        renderAll();
      });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          input.value = "";
          state.query = "";
          renderAll();
        }
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        if (input) {
          input.value = "";
          input.focus();
        }
        state.query = "";
        renderAll();
      });
    }
  }

  function show() {
    bind();
    if (!state.loaded && !state.loading) {
      loadData();
    } else {
      renderAll();
    }
  }

  window.SchoolAdminFormTeachers = {
    show: show,
    refresh: function () {
      state.loaded = false;
      return loadData();
    }
  };
})();
