/**
 * 座位表 — teacher seating charts
 * Picker/roster limited to classes & subject groups the signed-in teacher teaches.
 */
(function () {
  "use strict";

  var ACADEMIC_YEAR = "2026-2027";
  var CLASS_CODES = (function () {
    var out = [];
    for (var f = 1; f <= 6; f++) {
      "ABCD".split("").forEach(function (L) { out.push(String(f) + L); });
    }
    return out;
  })();

  var state = {
    ready: false,
    /** @type {{kind:string,key:string,label:string,classCode?:string,form?:string,subject?:string,groupName?:string,classCodes?:string[],reasons?:string[]}|null} */
    scope: null,
    scopes: [],
    charts: [],
    chartId: null,
    title: "",
    rows: 6,
    cols: 6,
    seats: {},
    roster: [],
    rosterIdSet: {},
    selectedSeat: null,
    dirty: false,
    saving: false,
    statusMsg: "",
    /** pointer drag: { kind:'seat'|'roster', r,c, studentId, pointerId, startX, startY, moved, fromEl } */
    ptrDrag: null,
    suppressClick: false
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
    return window.__schoolAdminSession || null;
  }

  function getClient() {
    var auth = window.SchoolAdminAuth;
    return (auth && auth.getClient && auth.getClient()) || window.__supabaseClient || null;
  }

  function teacherCode(session) {
    if (session && session.staff && session.staff.short_name) {
      return String(session.staff.short_name).toUpperCase();
    }
    return "";
  }

  function ownerEmail(session) {
    return String((session && session.email) || "").toLowerCase();
  }

  function seatKey(r, c) { return r + "," + c; }

  function displayName(stu) {
    var zh = (stu.chinese_name || stu.name_zh || "").trim();
    var en = (stu.english_name || stu.name_en || "").trim();
    if (zh && en) return zh;
    return zh || en || ("#" + (stu.class_no || ""));
  }

  function secondaryName(stu) {
    var zh = (stu.chinese_name || stu.name_zh || "").trim();
    var en = (stu.english_name || stu.name_en || "").trim();
    if (zh && en) return en;
    return "";
  }

  function normalizeSex(sex) {
    var s = String(sex == null ? "" : sex).trim().toUpperCase();
    if (s === "F" || s === "女" || s === "FEMALE" || s === "GIRL") return "F";
    if (s === "M" || s === "男" || s === "MALE" || s === "BOY") return "M";
    return "";
  }

  function sexClass(sex) {
    var n = normalizeSex(sex);
    if (n === "F") return " is-girl";
    if (n === "M") return " is-boy";
    return "";
  }

  function sexFromRosterId(studentId) {
    var stu = findStudent(studentId);
    return stu ? normalizeSex(stu.sex) : "";
  }

  function setStatus(msg, isErr) {
    state.statusMsg = msg || "";
    var el = $("seat-status");
    if (!el) return;
    el.textContent = state.statusMsg;
    el.classList.toggle("is-err", !!isErr);
  }

  function expandClassToken(token) {
    token = String(token || "").toUpperCase().replace(/\s+/g, "");
    if (!token) return [];
    if (/^[1-6][A-D]$/.test(token)) return [token];
    var m = token.match(/^([1-6])([A-D])-([A-D])$/);
    if (m) {
      var out = [];
      for (var code = m[2].charCodeAt(0); code <= m[3].charCodeAt(0); code++) {
        out.push(m[1] + String.fromCharCode(code));
      }
      return out;
    }
    return [];
  }

  function isSingleClassToken(token) {
    return /^[1-6][A-D]$/.test(String(token || "").toUpperCase().replace(/\s+/g, ""));
  }

  function formFromClassCode(classCode) {
    var m = String(classCode || "").match(/^([1-6])/);
    return m ? ("S" + m[1]) : "";
  }

  function scopeKeyClass(classCode) {
    return "class:" + String(classCode || "").toUpperCase();
  }

  function scopeKeyGroup(form, subject, groupName) {
    return "group:" + form + "|" + subject + "|" + groupName;
  }

  function scopeKeySplit(token, subject) {
    return "split:" + String(token || "").toUpperCase().replace(/\s+/g, "") + "|" + String(subject || "");
  }

  function parseScopeKey(key) {
    key = String(key || "");
    if (key.indexOf("class:") === 0) {
      return { kind: "class", classCode: key.slice(6).toUpperCase() };
    }
    if (key.indexOf("group:") === 0) {
      var rest = key.slice(6).split("|");
      return {
        kind: "group",
        form: rest[0] || "",
        subject: rest[1] || "",
        groupName: rest.slice(2).join("|") || ""
      };
    }
    return null;
  }

  function findScopeByKey(key) {
    for (var i = 0; i < state.scopes.length; i++) {
      if (state.scopes[i].key === key) return state.scopes[i];
    }
    return null;
  }

  /**
   * Build seating picker scopes.
   * If the teacher has any student_groups (Excel 分組名單) rows, ONLY those
   * group scopes are listed (+ 班主任 whole-class if they are class teacher).
   * Lesson-based whole-class / split scopes are skipped in that case so e.g. TLC
   * only sees S4 ICT / S5 MATH / S6 MATH from the grouping sheet — not full 4A.
   * Teachers with no group rows fall back to 班主任 + lessons (S1 etc.).
   */
  async function loadTaughtScopes(session) {
    var client = getClient();
    var code = teacherCode(session);
    var map = {};

    function addClassScope(classCode, reason) {
      classCode = String(classCode || "").toUpperCase();
      if (CLASS_CODES.indexOf(classCode) < 0) return;
      var key = scopeKeyClass(classCode);
      if (!map[key]) {
        map[key] = {
          kind: "class",
          key: key,
          classCode: classCode,
          form: formFromClassCode(classCode),
          subject: "",
          groupName: "",
          classCodes: [classCode],
          label: classCode,
          reasons: []
        };
      }
      if (reason && map[key].reasons.indexOf(reason) < 0) {
        map[key].reasons.push(reason);
      }
    }

    function addGroupScope(form, subject, groupName, classCodes, reason) {
      form = String(form || "");
      subject = String(subject || "");
      groupName = String(groupName || "");
      if (!form || !subject || !groupName) return;
      var key = scopeKeyGroup(form, subject, groupName);
      var codes = (classCodes || []).map(function (c) {
        return String(c || "").toUpperCase();
      }).filter(function (c) { return CLASS_CODES.indexOf(c) >= 0; });
      codes.sort();
      if (!map[key]) {
        map[key] = {
          kind: "group",
          key: key,
          classCode: codes.length ? codes.join(",") : form,
          form: form,
          subject: subject,
          groupName: groupName,
          classCodes: codes,
          label: "",
          reasons: []
        };
      } else {
        codes.forEach(function (c) {
          if (map[key].classCodes.indexOf(c) < 0) map[key].classCodes.push(c);
        });
        map[key].classCodes.sort();
        map[key].classCode = map[key].classCodes.join(",") || form;
      }
      if (reason && map[key].reasons.indexOf(reason) < 0) {
        map[key].reasons.push(reason);
      }
    }

    function finalizeAndReturn() {
      var list = Object.keys(map).map(function (k) { return map[k]; });
      list.forEach(function (s) {
        var reason = (s.reasons || []).join("·") || (
          s.kind === "group" ? "分組" : (s.kind === "split" ? "合班" : "任教")
        );
        if (s.kind === "group") {
          var classPart = (s.classCodes && s.classCodes.length)
            ? s.classCodes.join(",")
            : "";
          s.label = s.form + " " + s.subject + " · " + s.groupName +
            (classPart ? "（" + classPart + "）" : "") +
            " · " + reason;
        } else if (s.kind === "split") {
          s.label = s.classCode + " · " + (s.subject || "課") + "（" + reason + "）";
        } else {
          s.label = s.classCode + "（" + reason + "）";
        }
      });
      list.sort(function (a, b) {
        var order = { group: 0, class: 1, split: 2 };
        var ao = order[a.kind] != null ? order[a.kind] : 9;
        var bo = order[b.kind] != null ? order[b.kind] : 9;
        if (ao !== bo) return ao - bo;
        return a.label.localeCompare(b.label, "zh-HK");
      });
      state.scopes = list;
      return list;
    }

    function addHomeroomScopes() {
      if (session && session.staff && session.staff.class_teacher) {
        addClassScope(session.staff.class_teacher, "班主任");
      }
    }

    async function addHomeroomFromCloud() {
      if (!client || !code) return;
      try {
        var ct = await client
          .from("class_teachers")
          .select("class_code")
          .ilike("teacher_short_name", code)
          .eq("academic_year", ACADEMIC_YEAR);
        if (ct.data) {
          ct.data.forEach(function (r) { addClassScope(r.class_code, "班主任"); });
        }
      } catch (e0) { /* ignore */ }
    }

    // --- student_groups (Excel 分組名單) first ---
    var hasGroups = false;
    if (client && code) {
      try {
        var sg = await client
          .from("student_groups")
          .select("student_id,form,subject,group_name")
          .ilike("teacher_short_name", code)
          .eq("academic_year", ACADEMIC_YEAR)
          .limit(5000);
        if (sg.data && sg.data.length) {
          hasGroups = true;
          var byGroup = {};
          var studentIds = [];
          sg.data.forEach(function (r) {
            var gk = r.form + "\0" + r.subject + "\0" + r.group_name;
            if (!byGroup[gk]) {
              byGroup[gk] = {
                form: r.form,
                subject: r.subject,
                groupName: r.group_name,
                studentIds: []
              };
            }
            byGroup[gk].studentIds.push(r.student_id);
            studentIds.push(r.student_id);
          });
          var idToClass = {};
          var uniq = [];
          var seenId = {};
          studentIds.forEach(function (id) {
            if (id == null || seenId[id]) return;
            seenId[id] = true;
            uniq.push(id);
          });
          for (var i = 0; i < uniq.length; i += 400) {
            var chunk = uniq.slice(i, i + 400);
            var st = await client
              .from("students")
              .select("id,class_code")
              .in("id", chunk);
            if (st.data) {
              st.data.forEach(function (row) {
                idToClass[String(row.id)] = row.class_code;
              });
            }
          }
          Object.keys(byGroup).forEach(function (gk) {
            var g = byGroup[gk];
            var codes = [];
            var seenC = {};
            g.studentIds.forEach(function (sid) {
              var cc = idToClass[String(sid)];
              if (!cc || seenC[cc]) return;
              seenC[cc] = true;
              codes.push(cc);
            });
            addGroupScope(g.form, g.subject, g.groupName, codes, "分組名單");
          });
        }
      } catch (e1) { /* ignore */ }
    }

    // Prefer Excel groups only when present (TLC / streaming teachers).
    if (hasGroups) {
      addHomeroomScopes();
      await addHomeroomFromCloud();
      return finalizeAndReturn();
    }

    // No group rows → 班主任 + lesson-based class/split (e.g. S1 whole classes).
    addHomeroomScopes();
    await addHomeroomFromCloud();

    if (client && code) {
      try {
        var lessons = await client
          .from("lessons")
          .select("class_short,class_name,subject_short,subject")
          .ilike("teacher_code", code)
          .limit(3000);
        if (lessons.data) {
          var sawSplit = {};
          lessons.data.forEach(function (l) {
            var raw = String(l.class_short || l.class_name || "").replace(/\s+/g, "");
            if (!raw) return;
            var subj = String(l.subject_short || l.subject || "");
            if (raw.indexOf(",") >= 0 || raw.indexOf("，") >= 0) {
              var token = raw.replace(/，/g, ",").toUpperCase();
              var parts = token.split(",").map(function (x) { return x.trim(); }).filter(Boolean);
              var sk = scopeKeySplit(token, subj);
              if (sawSplit[sk]) return;
              sawSplit[sk] = true;
              map[sk] = {
                kind: "split",
                key: sk,
                classCode: token,
                form: formFromClassCode(parts[0] || ""),
                subject: subj,
                groupName: "",
                classCodes: parts.filter(function (c) { return CLASS_CODES.indexOf(c) >= 0; }),
                label: token + " · " + (subj || "課") + "（合班／分班）",
                reasons: ["任教"]
              };
              return;
            }
            if (/[A-D]-[A-D]/.test(raw)) return;
            if (!isSingleClassToken(raw)) return;
            addClassScope(raw, "任教");
          });
        }
      } catch (e2) { /* ignore */ }
    } else if (code) {
      var data = window.TIMETABLE_DATA;
      if (data && data.teachers) {
        var t = null;
        for (var ti = 0; ti < data.teachers.length; ti++) {
          if (String(data.teachers[ti].code || "").toUpperCase() === code) {
            t = data.teachers[ti];
            break;
          }
        }
        if (t && t.schedule) {
          Object.keys(t.schedule).forEach(function (day) {
            var periods = t.schedule[day] || {};
            Object.keys(periods).forEach(function (p) {
              var cell = periods[p];
              if (!cell) return;
              var raw = String(cell.classShort || cell.class || "").replace(/\s+/g, "");
              if (raw.indexOf(",") >= 0 || /[A-D]-[A-D]/.test(raw)) return;
              if (isSingleClassToken(raw)) addClassScope(raw, "任教");
            });
          });
        }
      }
    }

    return finalizeAndReturn();
  }

  async function loadRosterForScope(scope) {
    state.roster = [];
    state.rosterIdSet = {};
    var client = getClient();
    if (!client || !scope) return;

    if (scope.kind === "class") {
      var res = await client
        .from("students")
        .select("id,class_code,class_no,chinese_name,english_name,sex,house")
        .eq("class_code", scope.classCode)
        .eq("academic_year", ACADEMIC_YEAR)
        .order("class_no", { ascending: true });
      if (res.error) throw new Error(res.error.message || "讀取學生名單失敗");
      state.roster = res.data || [];
    } else if (scope.kind === "split") {
      var codes = (scope.classCodes && scope.classCodes.length)
        ? scope.classCodes
        : String(scope.classCode || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean);
      if (!codes.length) {
        state.roster = [];
      } else {
        var sp = await client
          .from("students")
          .select("id,class_code,class_no,chinese_name,english_name,sex,house")
          .in("class_code", codes)
          .eq("academic_year", ACADEMIC_YEAR)
          .order("class_code", { ascending: true })
          .order("class_no", { ascending: true });
        if (sp.error) throw new Error(sp.error.message || "讀取學生名單失敗");
        state.roster = sp.data || [];
      }
    } else if (scope.kind === "group") {
      var sg = await client
        .from("student_groups")
        .select("student_id")
        .eq("form", scope.form)
        .eq("subject", scope.subject)
        .eq("group_name", scope.groupName)
        .eq("academic_year", ACADEMIC_YEAR)
        .ilike("teacher_short_name", teacherCode(getSession()) || "")
        .limit(2000);
      if (sg.error) throw new Error(sg.error.message || "讀取分組名單失敗");
      var ids = (sg.data || []).map(function (r) { return r.student_id; }).filter(Boolean);
      if (!ids.length) {
        state.roster = [];
      } else {
        var students = [];
        for (var i = 0; i < ids.length; i += 400) {
          var chunk = ids.slice(i, i + 400);
          var st = await client
            .from("students")
            .select("id,class_code,class_no,chinese_name,english_name,sex,house")
            .in("id", chunk)
            .order("class_code", { ascending: true })
            .order("class_no", { ascending: true });
          if (st.error) throw new Error(st.error.message || "讀取學生名單失敗");
          students = students.concat(st.data || []);
        }
        // Stable sort: class then class_no
        students.sort(function (a, b) {
          if (a.class_code !== b.class_code) {
            return String(a.class_code).localeCompare(String(b.class_code), "en");
          }
          return (a.class_no || 0) - (b.class_no || 0);
        });
        state.roster = students;
      }
    }

    state.rosterIdSet = {};
    state.roster.forEach(function (s) {
      state.rosterIdSet[String(s.id)] = true;
    });
  }

  async function loadChartsForScope(scope) {
    var client = getClient();
    var session = getSession();
    state.charts = [];
    if (!client || !session || !scope) return;
    var email = ownerEmail(session);
    var q = client
      .from("seating_charts")
      .select("id,class_code,teacher_code,owner_email,title,rows,cols,layout,updated_at,academic_year,scope_kind,form,subject,group_name")
      .eq("academic_year", ACADEMIC_YEAR)
      .eq("owner_email", email)
      .eq("scope_kind", scope.kind)
      .order("updated_at", { ascending: false });
    if (scope.kind === "class") {
      q = q.eq("class_code", scope.classCode);
    } else if (scope.kind === "split") {
      q = q.eq("class_code", scope.classCode).eq("subject", scope.subject || "");
    } else {
      q = q.eq("form", scope.form).eq("subject", scope.subject).eq("group_name", scope.groupName);
    }
    var res = await q;
    if (res.error) throw new Error(res.error.message || "讀取座位表失敗");
    state.charts = res.data || [];
  }

  function layoutToSeats(layout) {
    var map = {};
    (layout || []).forEach(function (s) {
      if (s == null || s.r == null || s.c == null) return;
      // Drop seats whose student is no longer in roster
      if (s.student_id != null && !state.rosterIdSet[String(s.student_id)]) return;
      var sex = normalizeSex(s.sex);
      if (!sex && s.student_id != null) sex = sexFromRosterId(s.student_id);
      map[seatKey(s.r, s.c)] = {
        r: s.r,
        c: s.c,
        student_id: s.student_id || null,
        class_no: s.class_no || null,
        name_zh: s.name_zh || "",
        name_en: s.name_en || "",
        sex: sex,
        notes: s.notes || ""
      };
    });
    return map;
  }

  function seatsToLayout() {
    var out = [];
    Object.keys(state.seats).forEach(function (k) {
      var s = state.seats[k];
      if (!s || s.student_id == null) return;
      if (!state.rosterIdSet[String(s.student_id)]) return; // hard filter
      out.push({
        r: s.r,
        c: s.c,
        student_id: s.student_id,
        class_no: s.class_no,
        name_zh: s.name_zh || "",
        name_en: s.name_en || "",
        sex: normalizeSex(s.sex) || sexFromRosterId(s.student_id),
        notes: s.notes || ""
      });
    });
    out.sort(function (a, b) {
      if (a.r !== b.r) return a.r - b.r;
      return a.c - b.c;
    });
    return out;
  }

  function pruneSeatsToRoster() {
    var removed = 0;
    Object.keys(state.seats).forEach(function (k) {
      var s = state.seats[k];
      if (s && s.student_id != null && !state.rosterIdSet[String(s.student_id)]) {
        delete state.seats[k];
        removed++;
      }
    });
    return removed;
  }

  function assignedIds() {
    var ids = {};
    Object.keys(state.seats).forEach(function (k) {
      var s = state.seats[k];
      if (s && s.student_id != null) ids[String(s.student_id)] = true;
    });
    return ids;
  }

  function suggestGrid(n) {
    var cols = n <= 24 ? 6 : (n <= 35 ? 7 : 8);
    var rows = Math.max(4, Math.ceil((n || 24) / cols) + 1);
    if (rows > 12) rows = 12;
    if (cols > 10) cols = 10;
    return { rows: rows, cols: cols };
  }

  function defaultTitle(scope) {
    if (!scope) return "座位表";
    if (scope.kind === "group") {
      return scope.form + " " + scope.subject + " · " + scope.groupName + " 座位表";
    }
    if (scope.kind === "split") {
      return scope.classCode + " · " + (scope.subject || "") + " 座位表";
    }
    return scope.classCode + " 座位表";
  }

  function applyChart(chart) {
    if (!chart) {
      state.chartId = null;
      state.title = defaultTitle(state.scope);
      var g = suggestGrid((state.roster || []).length || 30);
      state.rows = g.rows;
      state.cols = g.cols;
      state.seats = {};
      state.dirty = false;
      state.selectedSeat = null;
      return;
    }
    state.chartId = chart.id;
    state.title = chart.title || defaultTitle(state.scope);
    state.rows = chart.rows || 6;
    state.cols = chart.cols || 6;
    state.seats = layoutToSeats(chart.layout);
    state.dirty = false;
    state.selectedSeat = null;
  }

  function fillScopeSelect() {
    var sel = $("seat-class-select");
    if (!sel) return;
    var prev = (state.scope && state.scope.key) || sel.value || "";
    sel.innerHTML = "";
    var opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = state.scopes.length
      ? "選擇分組／班別…"
      : "未有分組／班別";
    sel.appendChild(opt0);

    var classScopes = state.scopes.filter(function (s) { return s.kind === "class"; });
    var groupScopes = state.scopes.filter(function (s) { return s.kind === "group"; });
    var splitScopes = state.scopes.filter(function (s) { return s.kind === "split"; });

    function appendGroup(label, list) {
      if (!list.length) return;
      var og = document.createElement("optgroup");
      og.label = label;
      list.forEach(function (s) {
        var opt = document.createElement("option");
        opt.value = s.key;
        opt.textContent = s.label;
        og.appendChild(opt);
      });
      sel.appendChild(og);
    }

    appendGroup("分組名單（Excel）", groupScopes);
    appendGroup("班主任班別", classScopes);
    appendGroup("合班／分班（無分組名單）", splitScopes);

    if (prev && findScopeByKey(prev)) sel.value = prev;
  }

  function fillChartSelect() {
    var sel = $("seat-chart-select");
    if (!sel) return;
    var prev = state.chartId;
    sel.innerHTML = "";
    var optNew = document.createElement("option");
    optNew.value = "";
    optNew.textContent = "＋ 新增座位表";
    sel.appendChild(optNew);
    state.charts.forEach(function (ch) {
      var opt = document.createElement("option");
      opt.value = String(ch.id);
      var when = ch.updated_at ? String(ch.updated_at).slice(0, 16).replace("T", " ") : "";
      opt.textContent = (ch.title || "座位表") + (when ? " · " + when : "");
      sel.appendChild(opt);
    });
    if (prev) sel.value = String(prev);
  }

  function renderRoster() {
    var box = $("seat-roster");
    if (!box) return;
    var taken = assignedIds();
    var free = state.roster.filter(function (s) { return !taken[String(s.id)]; });
    var headExtra = state.scope && (state.scope.kind === "group" || state.scope.kind === "split")
      ? "（分組）"
      : "";
    var html = '<div class="seat-roster-head">未編座位' + headExtra +
      ' <span class="muted">' + free.length + "／" + state.roster.length + "</span></div>";
    if (!state.roster.length) {
      html += '<p class="muted seat-empty">此班別／分組未有學生名單。</p>';
    } else if (!free.length) {
      html += '<p class="muted seat-empty">全部已入座。</p>';
    } else {
      html += '<ul class="seat-roster-list">';
      free.forEach(function (s) {
        var noLabel = (state.scope && (state.scope.kind === "group" || state.scope.kind === "split") && s.class_code)
          ? (s.class_code + "-" + s.class_no)
          : String(s.class_no);
        html += '<li class="seat-roster-item' + sexClass(s.sex) + '" draggable="true" data-student-id="' +
          escapeHtml(s.id) + '" tabindex="0">' +
          '<span class="seat-no">' + escapeHtml(noLabel) + "</span>" +
          '<span class="seat-name">' + escapeHtml(displayName(s)) + "</span>" +
          (secondaryName(s)
            ? '<span class="seat-name-en">' + escapeHtml(secondaryName(s)) + "</span>"
            : "") +
          "</li>";
      });
      html += "</ul>";
    }
    box.innerHTML = html;
  }

  function renderGrid() {
    var box = $("seat-grid");
    if (!box) return;
    var rows = state.rows;
    var cols = state.cols;
    var html = '<div class="seat-board" style="--seat-cols:' + cols + '">';
    html += '<div class="seat-board-label seat-board-front">黑板／講台</div>';
    html += '<div class="seat-board-grid">';
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var key = seatKey(r, c);
        var seat = state.seats[key];
        var selected = state.selectedSeat && state.selectedSeat.r === r && state.selectedSeat.c === c;
        var cls = "seat-cell";
        if (seat && seat.student_id) {
          cls += " is-filled";
          var sx = normalizeSex(seat.sex) || (seat.student_id != null ? sexFromRosterId(seat.student_id) : "");
          cls += sexClass(sx);
        }
        if (selected) cls += " is-selected";
        var label = "";
        if (seat && seat.student_id) {
          label = '<span class="seat-cell-no">' + escapeHtml(seat.class_no || "") + "</span>" +
            '<span class="seat-cell-name">' + escapeHtml(seat.name_zh || seat.name_en || "") + "</span>";
        } else {
          label = '<span class="seat-cell-empty">空</span>';
        }
        var filled = !!(seat && seat.student_id);
        html += '<div role="button" tabindex="0" class="' + cls + '" data-r="' + r + '" data-c="' + c +
          '" data-filled="' + (filled ? "1" : "0") + '"' +
          (filled ? ' draggable="true"' : "") +
          ' aria-label="座位 R' + (r + 1) + " C" + (c + 1) + '">' + label + "</div>";
      }
    }
    html += "</div>";
    html += '<div class="seat-board-label seat-board-back">課室後</div>';
    html += "</div>";
    box.innerHTML = html;
  }

  function renderToolbarMeta() {
    var titleInput = $("seat-title");
    if (titleInput && document.activeElement !== titleInput) {
      titleInput.value = state.title || "";
    }
    var rowsInput = $("seat-rows");
    var colsInput = $("seat-cols");
    if (rowsInput) rowsInput.value = String(state.rows);
    if (colsInput) colsInput.value = String(state.cols);
    var dirty = $("seat-dirty");
    if (dirty) dirty.hidden = !state.dirty;
    var editor = $("seat-editor");
    if (editor) editor.classList.toggle("hidden", !state.scope);
    var empty = $("seat-pick-hint");
    if (empty) empty.classList.toggle("hidden", !!state.scope);
  }

  function renderAll() {
    fillChartSelect();
    renderToolbarMeta();
    renderGrid();
    renderRoster();
  }

  function findStudent(id) {
    id = String(id);
    for (var i = 0; i < state.roster.length; i++) {
      if (String(state.roster[i].id) === id) return state.roster[i];
    }
    return null;
  }

  function seatObjFromStudent(stu, r, c) {
    return {
      r: r,
      c: c,
      student_id: stu.id,
      class_no: stu.class_no,
      name_zh: stu.chinese_name || "",
      name_en: stu.english_name || "",
      sex: normalizeSex(stu.sex),
      notes: ""
    };
  }

  function cloneSeatAt(seat, r, c) {
    if (!seat) return null;
    var sex = normalizeSex(seat.sex);
    if (!sex && seat.student_id != null) sex = sexFromRosterId(seat.student_id);
    return {
      r: r,
      c: c,
      student_id: seat.student_id,
      class_no: seat.class_no,
      name_zh: seat.name_zh || "",
      name_en: seat.name_en || "",
      sex: sex,
      notes: seat.notes || ""
    };
  }

  function placeStudent(r, c, studentId) {
    var stu = findStudent(studentId);
    if (!stu) {
      setStatus("只可以編入呢個班別／分組嘅學生。", true);
      return false;
    }
    if (!state.rosterIdSet[String(stu.id)]) {
      setStatus("學生唔喺任教名單內。", true);
      return false;
    }
    Object.keys(state.seats).forEach(function (k) {
      if (state.seats[k] && String(state.seats[k].student_id) === String(studentId)) {
        delete state.seats[k];
      }
    });
    state.seats[seatKey(r, c)] = seatObjFromStudent(stu, r, c);
    state.dirty = true;
    state.selectedSeat = null;
    renderAll();
    return true;
  }

  /** Move or swap occupants between two seats. */
  function swapOrMoveSeat(r1, c1, r2, c2) {
    if (r1 === r2 && c1 === c2) return false;
    var k1 = seatKey(r1, c1);
    var k2 = seatKey(r2, c2);
    var a = state.seats[k1] || null;
    var b = state.seats[k2] || null;
    if (!a && !b) return false;
    if (a) state.seats[k2] = cloneSeatAt(a, r2, c2);
    else delete state.seats[k2];
    if (b) state.seats[k1] = cloneSeatAt(b, r1, c1);
    else delete state.seats[k1];
    state.dirty = true;
    state.selectedSeat = null;
    renderAll();
    return true;
  }

  function clearSeat(r, c) {
    delete state.seats[seatKey(r, c)];
    state.dirty = true;
    state.selectedSeat = null;
    renderAll();
  }

  function handleSeatTap(r, c) {
    var key = seatKey(r, c);
    var sel = state.selectedSeat;
    if (sel && (sel.r !== r || sel.c !== c)) {
      var fromFilled = !!(state.seats[seatKey(sel.r, sel.c)] && state.seats[seatKey(sel.r, sel.c)].student_id);
      var toFilled = !!(state.seats[key] && state.seats[key].student_id);
      if (fromFilled || toFilled) {
        swapOrMoveSeat(sel.r, sel.c, r, c);
        if (fromFilled && toFilled) setStatus("已互換座位。");
        else if (fromFilled) setStatus("已移到新座位。");
        else setStatus("已移到所選座位。");
        return;
      }
    }
    if (sel && sel.r === r && sel.c === c) {
      // Second tap on same seat: clear if occupied, else deselect
      if (state.seats[key] && state.seats[key].student_id) {
        clearSeat(r, c);
        setStatus("已清空座位。");
      } else {
        state.selectedSeat = null;
        renderGrid();
        setStatus("已取消選擇。");
      }
      return;
    }
    state.selectedSeat = { r: r, c: c };
    renderGrid();
    var filled = state.seats[key] && state.seats[key].student_id;
    setStatus(
      filled
        ? ("已選 R" + (r + 1) + " C" + (c + 1) + " — 再撳另一座位互換／搬位；再撳同一格清空。")
        : ("已選空位 R" + (r + 1) + " C" + (c + 1) + " — 再撳名單學生編入，或撳有人座位搬過來。")
    );
  }

  function autoFill() {
    if (!state.roster.length) {
      setStatus("冇學生名單，唔可以自動編位。", true);
      return;
    }
    state.seats = {};
    var i = 0;
    for (var r = 0; r < state.rows && i < state.roster.length; r++) {
      for (var c = 0; c < state.cols && i < state.roster.length; c++) {
        var stu = state.roster[i++];
        state.seats[seatKey(r, c)] = seatObjFromStudent(stu, r, c);
      }
    }
    state.dirty = true;
    state.selectedSeat = null;
    setStatus("已按名單次序自動編位（可再調整）。");
    renderAll();
  }

  async function saveChart() {
    var session = getSession();
    var client = getClient();
    if (!session || session.role !== "staff") {
      setStatus("只限教職員儲存座位表。", true);
      return;
    }
    if (!client) {
      setStatus("未連接資料庫。", true);
      return;
    }
    if (!state.scope) {
      setStatus("請先選擇任教班別／分組。", true);
      return;
    }
    if (state.saving) return;

    var removed = pruneSeatsToRoster();
    var layout = seatsToLayout();
    if (removed) {
      setStatus("已移除 " + removed + " 位唔屬於此名單嘅學生，請再儲存。", true);
      state.dirty = true;
      renderAll();
      return;
    }

    state.saving = true;
    setStatus("儲存中…");
    var scope = state.scope;
    var payload = {
      class_code: scope.kind === "class"
        ? scope.classCode
        : (scope.classCode || (scope.classCodes || []).join(",") || scope.form),
      teacher_code: teacherCode(session),
      owner_email: ownerEmail(session),
      title: (state.title || defaultTitle(scope)).trim(),
      rows: state.rows,
      cols: state.cols,
      layout: layout,
      academic_year: ACADEMIC_YEAR,
      scope_kind: scope.kind,
      form: scope.kind === "group" ? scope.form : (scope.form || ""),
      subject: (scope.kind === "group" || scope.kind === "split") ? (scope.subject || "") : "",
      group_name: scope.kind === "group" ? scope.groupName : ""
    };
    try {
      var res;
      if (state.chartId) {
        res = await client
          .from("seating_charts")
          .update({
            title: payload.title,
            rows: payload.rows,
            cols: payload.cols,
            layout: payload.layout,
            teacher_code: payload.teacher_code,
            class_code: payload.class_code,
            scope_kind: payload.scope_kind,
            form: payload.form,
            subject: payload.subject,
            group_name: payload.group_name
          })
          .eq("id", state.chartId)
          .eq("owner_email", payload.owner_email)
          .select("id,class_code,teacher_code,owner_email,title,rows,cols,layout,updated_at,academic_year,scope_kind,form,subject,group_name")
          .single();
      } else {
        res = await client
          .from("seating_charts")
          .insert(payload)
          .select("id,class_code,teacher_code,owner_email,title,rows,cols,layout,updated_at,academic_year,scope_kind,form,subject,group_name")
          .single();
      }
      if (res.error) throw new Error(res.error.message || "儲存失敗");
      state.chartId = res.data.id;
      state.dirty = false;
      await loadChartsForScope(state.scope);
      renderAll();
      setStatus("已儲存（" + (res.data.updated_at || "").slice(0, 19).replace("T", " ") + "）");
    } catch (e) {
      setStatus(e && e.message ? e.message : "儲存失敗", true);
    } finally {
      state.saving = false;
    }
  }

  async function deleteChart() {
    if (!state.chartId) {
      applyChart(null);
      renderAll();
      setStatus("已清空編輯器（未儲存嘅新表）。");
      return;
    }
    if (!window.confirm("確定刪除呢份座位表？")) return;
    var client = getClient();
    var session = getSession();
    if (!client || !session) return;
    try {
      var res = await client
        .from("seating_charts")
        .delete()
        .eq("id", state.chartId)
        .eq("owner_email", ownerEmail(session));
      if (res.error) throw new Error(res.error.message || "刪除失敗");
      state.chartId = null;
      await loadChartsForScope(state.scope);
      applyChart(null);
      renderAll();
      setStatus("已刪除座位表。");
    } catch (e) {
      setStatus(e && e.message ? e.message : "刪除失敗", true);
    }
  }

  function todayLabel() {
    try {
      return new Intl.DateTimeFormat("zh-HK", {
        timeZone: "Asia/Hong_Kong",
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short"
      }).format(new Date());
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function displayTeacher(session) {
    if (!session) return "";
    var name = (session.staff && session.staff.name) || session.name || "";
    var code = teacherCode(session);
    if (name && code) return name + "（" + code + "）";
    return name || code || "";
  }

  function exportPdf() {
    if (!state.scope) {
      setStatus("請先選擇班別／分組。", true);
      return;
    }
    var session = getSession();
    var teacher = displayTeacher(session);
    var rows = state.rows;
    var cols = state.cols;
    var cells = "";
    for (var r = 0; r < rows; r++) {
      cells += "<tr>";
      for (var c = 0; c < cols; c++) {
        var seat = state.seats[seatKey(r, c)];
        var inner = "";
        var sexN = "";
        if (seat && seat.student_id && state.rosterIdSet[String(seat.student_id)]) {
          sexN = normalizeSex(seat.sex) || sexFromRosterId(seat.student_id);
          inner = '<div class="no">' + escapeHtml(seat.class_no || "") + "</div>" +
            '<div class="zh">' + escapeHtml(seat.name_zh || "") + "</div>" +
            (seat.name_en ? '<div class="en">' + escapeHtml(seat.name_en) + "</div>" : "");
        }
        var tdCls = seat && seat.student_id ? "filled" : "empty";
        if (sexN === "F") tdCls += " girl";
        else if (sexN === "M") tdCls += " boy";
        cells += '<td class="' + tdCls + '">' + inner + "</td>";
      }
      cells += "</tr>";
    }

    var scopeLabel = state.scope.label || state.title || "";
    var html = "<!DOCTYPE html><html lang=\"zh-HK\"><head><meta charset=\"UTF-8\" />" +
      "<title>" + escapeHtml(state.title || "座位表") + "</title>" +
      "<style>" +
      "@page{size:A4 landscape;margin:12mm;}" +
      "body{font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif;" +
      "color:#111;margin:0;padding:8px;}" +
      "h1{font-size:20px;margin:0 0 4px;text-align:center;}" +
      ".meta{text-align:center;font-size:12px;color:#444;margin-bottom:10px;}" +
      ".front,.back{text-align:center;font-size:11px;color:#666;margin:6px 0;}" +
      "table{border-collapse:collapse;width:100%;table-layout:fixed;}" +
      "td{border:1px solid #333;height:56px;vertical-align:middle;text-align:center;" +
      "padding:4px;font-size:12px;}" +
      "td.empty{background:#f7f7f7;}" +
      "td.girl{background:#ffe4ec;}" +
      "td.boy{background:#dbebff;}" +
      ".no{font-weight:700;font-size:11px;}" +
      ".zh{font-size:13px;}" +
      ".en{font-size:10px;color:#444;}" +
      "@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}" +
      "</style></head><body>" +
      "<h1>" + escapeHtml(state.title || "座位表") + "</h1>" +
      '<div class="meta">' + escapeHtml(scopeLabel) +
      " · " + escapeHtml(teacher) +
      " · " + escapeHtml(todayLabel()) +
      " · " + rows + "×" + cols +
      " · <span style=\"background:#ffe4ec;padding:1px 6px;border-radius:4px\">女</span> " +
      "<span style=\"background:#dbebff;padding:1px 6px;border-radius:4px\">男</span></div>" +
      '<div class="front">黑板／講台</div>' +
      "<table><tbody>" + cells + "</tbody></table>" +
      '<div class="back">課室後</div>' +
      "<script>window.onload=function(){setTimeout(function(){window.print();},200);};<\/script>" +
      "</body></html>";

    var w = window.open("", "_blank");
    if (!w) {
      setStatus("瀏覽器封鎖彈出視窗，請允許後再匯出。", true);
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setStatus("已開啟列印預覽（可揀「儲存為 PDF」）。");
  }

  async function onScopeChange(key) {
    state.scope = key ? findScopeByKey(key) : null;
    state.chartId = null;
    state.selectedSeat = null;
    if (!state.scope) {
      state.charts = [];
      state.roster = [];
      state.rosterIdSet = {};
      applyChart(null);
      renderAll();
      setStatus("");
      return;
    }
    setStatus("載入 " + state.scope.label + "…");
    try {
      await Promise.all([
        loadRosterForScope(state.scope),
        loadChartsForScope(state.scope)
      ]);
      if (state.charts.length) applyChart(state.charts[0]);
      else applyChart(null);
      renderAll();
      setStatus(
        state.scope.label + " · 學生 " + state.roster.length +
        " 人 · 座位表 " + state.charts.length + " 份"
      );
    } catch (e) {
      setStatus(e && e.message ? e.message : "載入失敗", true);
    }
  }

  function onChartSelect(idStr) {
    if (!idStr) {
      applyChart(null);
      renderAll();
      setStatus("新座位表（未儲存）。");
      return;
    }
    var id = parseInt(idStr, 10);
    var found = null;
    for (var i = 0; i < state.charts.length; i++) {
      if (state.charts[i].id === id) { found = state.charts[i]; break; }
    }
    applyChart(found);
    var pruned = pruneSeatsToRoster();
    renderAll();
    setStatus(
      "已載入：" + (found && found.title ? found.title : "") +
      (pruned ? "（已略過 " + pruned + " 位唔喺名單嘅學生）" : "")
    );
  }

  function bindEditorEvents() {
    var root = $("home-panel-seating");
    if (!root || root.dataset.seatBound === "1") return;
    root.dataset.seatBound = "1";

    function cellFromPoint(x, y) {
      var el = document.elementFromPoint(x, y);
      return el ? el.closest(".seat-cell") : null;
    }

    function clearDragOver() {
      Array.prototype.forEach.call(root.querySelectorAll(".seat-cell.is-drag-over"), function (el) {
        el.classList.remove("is-drag-over");
      });
      Array.prototype.forEach.call(root.querySelectorAll(".seat-cell.is-dragging"), function (el) {
        el.classList.remove("is-dragging");
      });
    }

    function endPtrDrag(apply) {
      var d = state.ptrDrag;
      state.ptrDrag = null;
      root.classList.remove("is-seat-dragging");
      clearDragOver();
      if (!d) return;
      if (d.fromEl && d.fromEl.releasePointerCapture) {
        try { d.fromEl.releasePointerCapture(d.pointerId); } catch (err) { /* ignore */ }
      }
      if (!apply) return;
      // Prevent duplicate click handler after pointerup
      state.suppressClick = true;
      setTimeout(function () { state.suppressClick = false; }, 80);
      if (!d.moved) {
        // Tap: seat select / swap, or roster place into selected
        if (d.kind === "seat") {
          handleSeatTap(d.r, d.c);
        } else if (d.kind === "roster" && d.studentId) {
          if (!state.selectedSeat) {
            setStatus("請先撳一個座位，再選學生；或拖學生到座位。", true);
            return;
          }
          if (placeStudent(state.selectedSeat.r, state.selectedSeat.c, d.studentId)) {
            setStatus("已編入座位。");
          }
        }
        return;
      }
      // Drag completed
      if (d.kind === "seat" && d.targetR != null) {
        if (swapOrMoveSeat(d.r, d.c, d.targetR, d.targetC)) {
          var tok = state.seats[seatKey(d.targetR, d.targetC)];
          var other = state.seats[seatKey(d.r, d.c)];
          if (tok && other) setStatus("已拖拉互換座位。");
          else setStatus("已拖拉搬位。");
        }
      } else if (d.kind === "roster" && d.studentId && d.targetR != null) {
        if (placeStudent(d.targetR, d.targetC, d.studentId)) {
          setStatus("已拖入座位。");
        }
      }
    }

    root.addEventListener("change", function (e) {
      var t = e.target;
      if (t.id === "seat-class-select") {
        onScopeChange(t.value || "");
      } else if (t.id === "seat-chart-select") {
        onChartSelect(t.value || "");
      } else if (t.id === "seat-rows" || t.id === "seat-cols") {
        var rows = parseInt(($("seat-rows") && $("seat-rows").value) || "6", 10);
        var cols = parseInt(($("seat-cols") && $("seat-cols").value) || "6", 10);
        if (!(rows > 0 && rows <= 20)) rows = state.rows;
        if (!(cols > 0 && cols <= 20)) cols = state.cols;
        state.rows = rows;
        state.cols = cols;
        Object.keys(state.seats).forEach(function (k) {
          var s = state.seats[k];
          if (s.r >= rows || s.c >= cols) delete state.seats[k];
        });
        state.dirty = true;
        renderAll();
      }
    });

    root.addEventListener("input", function (e) {
      if (e.target && e.target.id === "seat-title") {
        state.title = e.target.value;
        state.dirty = true;
        var dirty = $("seat-dirty");
        if (dirty) dirty.hidden = false;
      }
    });

    // Toolbar clicks (not seats — seats use pointer)
    root.addEventListener("click", function (e) {
      if (state.suppressClick) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      var btn = e.target.closest("[data-seat-action]");
      if (btn) {
        var act = btn.getAttribute("data-seat-action");
        if (act === "save") saveChart();
        else if (act === "pdf") exportPdf();
        else if (act === "autofill") autoFill();
        else if (act === "clear-all") {
          if (window.confirm("清空所有座位？")) {
            state.seats = {};
            state.dirty = true;
            renderAll();
          }
        } else if (act === "delete") deleteChart();
        return;
      }
      // Fallback click for seats (keyboard / no pointer)
      var cell = e.target.closest(".seat-cell");
      if (cell && !state.ptrDrag) {
        var r = parseInt(cell.getAttribute("data-r"), 10);
        var c = parseInt(cell.getAttribute("data-c"), 10);
        handleSeatTap(r, c);
        return;
      }
      var item = e.target.closest(".seat-roster-item");
      if (item && !state.ptrDrag) {
        var sid = item.getAttribute("data-student-id");
        if (!state.selectedSeat) {
          setStatus("請先撳一個座位，再選學生；或拖學生到座位。", true);
          return;
        }
        if (placeStudent(state.selectedSeat.r, state.selectedSeat.c, sid)) {
          setStatus("已編入座位。");
        }
      }
    });

    root.addEventListener("keydown", function (e) {
      var cell = e.target.closest(".seat-cell");
      if (!cell) return;
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      handleSeatTap(
        parseInt(cell.getAttribute("data-r"), 10),
        parseInt(cell.getAttribute("data-c"), 10)
      );
    });

    // Pointer drag: seat↔seat swap / roster→seat (works on phone)
    root.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      var cell = e.target.closest(".seat-cell");
      var item = e.target.closest(".seat-roster-item");
      if (cell) {
        var r = parseInt(cell.getAttribute("data-r"), 10);
        var c = parseInt(cell.getAttribute("data-c"), 10);
        var filled = cell.getAttribute("data-filled") === "1";
        // Allow drag from any seat (empty can receive via tap); drag source only if filled
        state.ptrDrag = {
          kind: "seat",
          r: r,
          c: c,
          filled: filled,
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          moved: false,
          fromEl: cell,
          targetR: null,
          targetC: null
        };
        try { cell.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        return;
      }
      if (item) {
        state.ptrDrag = {
          kind: "roster",
          studentId: item.getAttribute("data-student-id"),
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          moved: false,
          fromEl: item,
          targetR: null,
          targetC: null
        };
        try { item.setPointerCapture(e.pointerId); } catch (err2) { /* ignore */ }
      }
    });

    root.addEventListener("pointermove", function (e) {
      var d = state.ptrDrag;
      if (!d || e.pointerId !== d.pointerId) return;
      var dx = e.clientX - d.startX;
      var dy = e.clientY - d.startY;
      if (!d.moved && (dx * dx + dy * dy) > 64) {
        // Only start seat-drag if source has a student
        if (d.kind === "seat" && !d.filled) {
          endPtrDrag(false);
          state.ptrDrag = null;
          return;
        }
        d.moved = true;
        root.classList.add("is-seat-dragging");
        if (d.fromEl) d.fromEl.classList.add("is-dragging");
      }
      if (!d.moved) return;
      e.preventDefault();
      clearDragOver();
      if (d.fromEl) d.fromEl.classList.add("is-dragging");
      var over = cellFromPoint(e.clientX, e.clientY);
      if (over) {
        var tr = parseInt(over.getAttribute("data-r"), 10);
        var tc = parseInt(over.getAttribute("data-c"), 10);
        if (d.kind === "seat" && tr === d.r && tc === d.c) {
          d.targetR = null;
          d.targetC = null;
        } else {
          over.classList.add("is-drag-over");
          d.targetR = tr;
          d.targetC = tc;
        }
      } else {
        d.targetR = null;
        d.targetC = null;
      }
    }, { passive: false });

    root.addEventListener("pointerup", function (e) {
      var d = state.ptrDrag;
      if (!d || e.pointerId !== d.pointerId) return;
      endPtrDrag(true);
    });
    root.addEventListener("pointercancel", function (e) {
      var d = state.ptrDrag;
      if (!d || e.pointerId !== d.pointerId) return;
      endPtrDrag(false);
    });

    // Desktop HTML5 DnD fallback (roster + filled seats)
    root.addEventListener("dragstart", function (e) {
      var cell = e.target.closest(".seat-cell");
      var item = e.target.closest(".seat-roster-item");
      if (cell && cell.getAttribute("data-filled") === "1" && e.dataTransfer) {
        e.dataTransfer.setData("text/seat", cell.getAttribute("data-r") + "," + cell.getAttribute("data-c"));
        e.dataTransfer.effectAllowed = "move";
        cell.classList.add("is-dragging");
        return;
      }
      if (item && e.dataTransfer) {
        e.dataTransfer.setData("text/student-id", item.getAttribute("data-student-id"));
        e.dataTransfer.effectAllowed = "copyMove";
      }
    });
    root.addEventListener("dragend", function () {
      clearDragOver();
    });
    root.addEventListener("dragover", function (e) {
      if (e.target.closest(".seat-cell")) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      }
    });
    root.addEventListener("dragenter", function (e) {
      var cell = e.target.closest(".seat-cell");
      if (cell) cell.classList.add("is-drag-over");
    });
    root.addEventListener("dragleave", function (e) {
      var cell = e.target.closest(".seat-cell");
      if (cell) cell.classList.remove("is-drag-over");
    });
    root.addEventListener("drop", function (e) {
      var cell = e.target.closest(".seat-cell");
      if (!cell) return;
      e.preventDefault();
      clearDragOver();
      var r = parseInt(cell.getAttribute("data-r"), 10);
      var c = parseInt(cell.getAttribute("data-c"), 10);
      var seatData = e.dataTransfer.getData("text/seat");
      if (seatData) {
        var parts = seatData.split(",");
        var r0 = parseInt(parts[0], 10);
        var c0 = parseInt(parts[1], 10);
        if (swapOrMoveSeat(r0, c0, r, c)) setStatus("已拖拉互換／搬位。");
        return;
      }
      var sid = e.dataTransfer.getData("text/student-id");
      if (sid && placeStudent(r, c, sid)) setStatus("已拖入座位。");
    });
  }

  async function showPanel() {
    var session = getSession();
    var studentNote = $("seat-student-note");
    var staffUI = $("seat-staff-ui");
    if (!session || session.role !== "staff") {
      if (staffUI) staffUI.classList.add("hidden");
      if (studentNote) studentNote.classList.remove("hidden");
      return;
    }
    if (staffUI) staffUI.classList.remove("hidden");
    if (studentNote) studentNote.classList.add("hidden");

    bindEditorEvents();
    setStatus("載入任教班別／分組…");
    try {
      await loadTaughtScopes(session);
    } catch (e) {
      state.scopes = [];
    }
    fillScopeSelect();
    // Update hint text
    var hint = $("seat-pick-hint");
    if (hint) {
      hint.textContent = state.scopes.length
        ? "有分組名單嘅老師只顯示 Excel 分組（例如 S4 ICT、S5 MATH）；班主任另加自己班。冇分組先會用時間表整班。"
        : "未找到你嘅分組名單或任教班別。請聯絡 IT 核對 student_groups／時間表。";
    }
    if (state.scope && findScopeByKey(state.scope.key)) {
      await onScopeChange(state.scope.key);
    } else {
      state.scope = null;
      renderAll();
      setStatus(
        state.scopes.length
          ? ("你有 " + state.scopes.length + " 個任教範圍，請揀一個開始。")
          : "未有可編嘅班別／分組。"
      );
    }
    state.ready = true;
  }

  window.SchoolAdminSeating = {
    show: showPanel,
    isDirty: function () { return !!state.dirty; },
    /** Shared taught-scope picker (same as 座位表). Returns scopes array. */
    getTaughtScopes: function (session) {
      return loadTaughtScopes(session || getSession());
    },
    getScopes: function () { return state.scopes.slice(); }
  };

  document.addEventListener("schooladmin:authed", function () {
    var session = getSession();
    if (session && session.role === "staff") {
      loadTaughtScopes(session).catch(function () { /* ignore */ });
    }
  });
})();
