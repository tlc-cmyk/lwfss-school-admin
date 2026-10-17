/**
 * 我的課堂 — seating layout + attendance for taught classes/groups
 * Reuses taught-scope logic from SchoolAdminSeating; date from sticky browse date.
 */
(function () {
  "use strict";

  var ACADEMIC_YEAR = "2026-2027";
  var STATUS_CYCLE = ["", "present", "absent", "late"];
  var STATUS_LABEL = {
    present: "出席",
    absent: "缺席",
    late: "遲到"
  };
  var STATUS_SHORT = {
    present: "出",
    absent: "缺",
    late: "遲"
  };

  var state = {
    ready: false,
    scope: null,
    scopes: [],
    roster: [],
    rosterIdSet: {},
    seats: {},
    rows: 6,
    cols: 6,
    chartId: null,
    chartTitle: "",
    layoutSource: "", // "chart" | "autofill"
    attendanceDate: "",
    /** student_id -> status */
    attendance: {},
    saving: false,
    statusMsg: "",
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

  function browseDateFromHome() {
    if (window.SchoolAdminHome && typeof SchoolAdminHome.getBrowseDate === "function") {
      var d = SchoolAdminHome.getBrowseDate();
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    }
    var input = $("home-date-input");
    if (input && /^\d{4}-\d{2}-\d{2}$/.test(input.value || "")) return input.value;
    return todayHK();
  }

  function seatKey(r, c) { return r + "," + c; }

  function displayName(stu) {
    var zh = (stu.chinese_name || stu.name_zh || "").trim();
    var en = (stu.english_name || stu.name_en || "").trim();
    if (zh && en) return zh;
    return zh || en || ("#" + (stu.class_no || ""));
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

  function setStatus(msg, isErr) {
    state.statusMsg = msg || "";
    var el = $("cr-attend-status");
    if (!el) return;
    el.textContent = state.statusMsg;
    el.classList.toggle("is-err", !!isErr);
  }

  function formatDateLabel(iso) {
    var parts = String(iso || "").split("-").map(function (x) { return parseInt(x, 10); });
    if (parts.length !== 3 || !parts[0]) return iso || "";
    var WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
    var dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 4, 0, 0));
    var wd = WEEKDAYS[dt.getUTCDay()];
    var today = iso === todayHK() ? " · 今日" : "";
    return parts[1] + "月" + parts[2] + "日（週" + wd + "）" + today;
  }

  async function loadScopes(session) {
    if (window.SchoolAdminSeating && typeof SchoolAdminSeating.getTaughtScopes === "function") {
      state.scopes = await SchoolAdminSeating.getTaughtScopes(session);
      return state.scopes;
    }
    state.scopes = [];
    return state.scopes;
  }

  function findScopeByKey(key) {
    for (var i = 0; i < state.scopes.length; i++) {
      if (state.scopes[i].key === key) return state.scopes[i];
    }
    return null;
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

  function findStudent(id) {
    id = String(id);
    for (var i = 0; i < state.roster.length; i++) {
      if (String(state.roster[i].id) === id) return state.roster[i];
    }
    return null;
  }

  function sexFromRosterId(studentId) {
    var stu = findStudent(studentId);
    return stu ? normalizeSex(stu.sex) : "";
  }

  function autofillSeats6x6() {
    var roster = state.roster.slice().sort(function (a, b) {
      if (a.class_code !== b.class_code) {
        return String(a.class_code || "").localeCompare(String(b.class_code || ""), "en");
      }
      return (a.class_no || 0) - (b.class_no || 0);
    });
    var cols = 6;
    var rows = Math.max(6, Math.ceil(roster.length / cols) || 6);
    if (rows > 20) rows = 20;
    state.rows = rows;
    state.cols = cols;
    state.seats = {};
    var max = Math.min(roster.length, rows * cols);
    for (var i = 0; i < max; i++) {
      var r = Math.floor(i / cols);
      var c = i % cols;
      var stu = roster[i];
      state.seats[seatKey(r, c)] = {
        r: r,
        c: c,
        student_id: stu.id,
        class_no: stu.class_no,
        class_code: stu.class_code || "",
        name_zh: stu.chinese_name || "",
        name_en: stu.english_name || "",
        sex: normalizeSex(stu.sex)
      };
    }
    state.layoutSource = "autofill";
    state.chartId = null;
    state.chartTitle = "";
  }

  function layoutToSeats(layout, rows, cols) {
    state.rows = rows || 6;
    state.cols = cols || 6;
    state.seats = {};
    (layout || []).forEach(function (s) {
      if (s == null || s.r == null || s.c == null) return;
      if (s.student_id != null && !state.rosterIdSet[String(s.student_id)]) return;
      var sex = normalizeSex(s.sex);
      if (!sex && s.student_id != null) sex = sexFromRosterId(s.student_id);
      var stu = s.student_id != null ? findStudent(s.student_id) : null;
      state.seats[seatKey(s.r, s.c)] = {
        r: s.r,
        c: s.c,
        student_id: s.student_id || null,
        class_no: s.class_no != null ? s.class_no : (stu && stu.class_no),
        class_code: (stu && stu.class_code) || "",
        name_zh: s.name_zh || (stu && stu.chinese_name) || "",
        name_en: s.name_en || (stu && stu.english_name) || "",
        sex: sex
      };
    });
  }

  async function loadChartForScope(scope) {
    var client = getClient();
    var session = getSession();
    state.chartId = null;
    state.chartTitle = "";
    if (!client || !session || !scope) {
      autofillSeats6x6();
      return;
    }
    var email = ownerEmail(session);
    var q = client
      .from("seating_charts")
      .select("id,title,rows,cols,layout,updated_at,scope_kind,class_code,form,subject,group_name")
      .eq("academic_year", ACADEMIC_YEAR)
      .eq("owner_email", email)
      .eq("scope_kind", scope.kind)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (scope.kind === "class") {
      q = q.eq("class_code", scope.classCode);
    } else if (scope.kind === "split") {
      q = q.eq("class_code", scope.classCode).eq("subject", scope.subject || "");
    } else {
      q = q.eq("form", scope.form).eq("subject", scope.subject).eq("group_name", scope.groupName);
    }
    var res = await q;
    if (res.error) throw new Error(res.error.message || "讀取座位表失敗");
    var chart = (res.data && res.data[0]) || null;
    if (chart && Array.isArray(chart.layout) && chart.layout.length) {
      layoutToSeats(chart.layout, chart.rows, chart.cols);
      state.chartId = chart.id;
      state.chartTitle = chart.title || "";
      state.layoutSource = "chart";
    } else {
      autofillSeats6x6();
    }
  }

  function scopeFilterFields(scope) {
    if (!scope) return null;
    return {
      scope_kind: scope.kind,
      class_code: scope.classCode || "",
      form: scope.form || "",
      subject: scope.subject || "",
      group_name: scope.groupName || ""
    };
  }

  async function loadAttendance() {
    state.attendance = {};
    var client = getClient();
    var session = getSession();
    var scope = state.scope;
    var date = state.attendanceDate;
    if (!client || !session || !scope || !date) return;
    var fields = scopeFilterFields(scope);
    var q = client
      .from("class_attendance")
      .select("student_id,status")
      .eq("owner_email", ownerEmail(session))
      .eq("attendance_date", date)
      .eq("academic_year", ACADEMIC_YEAR)
      .eq("scope_kind", fields.scope_kind)
      .eq("class_code", fields.class_code)
      .eq("form", fields.form)
      .eq("subject", fields.subject)
      .eq("group_name", fields.group_name);
    var res = await q;
    if (res.error) throw new Error(res.error.message || "讀取出席紀錄失敗");
    (res.data || []).forEach(function (row) {
      if (row.student_id != null && row.status) {
        state.attendance[String(row.student_id)] = row.status;
      }
    });
  }

  async function upsertAttendance(studentId, status) {
    var client = getClient();
    var session = getSession();
    var scope = state.scope;
    if (!client || !session || !scope) throw new Error("未登入或未選班");
    var fields = scopeFilterFields(scope);
    var email = ownerEmail(session);
    var code = teacherCode(session);

    if (!status) {
      // Clear: delete existing row
      var del = client
        .from("class_attendance")
        .delete()
        .eq("owner_email", email)
        .eq("attendance_date", state.attendanceDate)
        .eq("scope_kind", fields.scope_kind)
        .eq("class_code", fields.class_code)
        .eq("form", fields.form)
        .eq("subject", fields.subject)
        .eq("group_name", fields.group_name)
        .eq("student_id", studentId);
      var delRes = await del;
      if (delRes.error) throw new Error(delRes.error.message || "清除出席失敗");
      delete state.attendance[String(studentId)];
      return;
    }

    var row = {
      owner_email: email,
      teacher_code: code,
      attendance_date: state.attendanceDate,
      scope_kind: fields.scope_kind,
      class_code: fields.class_code,
      form: fields.form,
      subject: fields.subject,
      group_name: fields.group_name,
      student_id: studentId,
      status: status,
      academic_year: ACADEMIC_YEAR
    };
    var res = await client
      .from("class_attendance")
      .upsert(row, {
        onConflict: "owner_email,attendance_date,scope_kind,class_code,form,subject,group_name,student_id"
      });
    if (res.error) throw new Error(res.error.message || "儲存出席失敗");
    state.attendance[String(studentId)] = status;
  }

  function countSummary() {
    var present = 0, absent = 0, late = 0, unmarked = 0;
    var seen = {};
    Object.keys(state.seats).forEach(function (k) {
      var s = state.seats[k];
      if (!s || s.student_id == null) return;
      var id = String(s.student_id);
      if (seen[id]) return;
      seen[id] = true;
      var st = state.attendance[id] || "";
      if (st === "present") present++;
      else if (st === "absent") absent++;
      else if (st === "late") late++;
      else unmarked++;
    });
    // Also count roster students not on seats
    state.roster.forEach(function (stu) {
      var id = String(stu.id);
      if (seen[id]) return;
      seen[id] = true;
      var st = state.attendance[id] || "";
      if (st === "present") present++;
      else if (st === "absent") absent++;
      else if (st === "late") late++;
      else unmarked++;
    });
    return { present: present, absent: absent, late: late, unmarked: unmarked, total: Object.keys(seen).length };
  }

  function fillScopeSelect() {
    var sel = $("cr-attend-class-select");
    if (!sel) return;
    var prev = (state.scope && state.scope.key) || sel.value || "";
    sel.innerHTML = "";
    var opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = state.scopes.length ? "選擇分組／班別…" : "未有分組／班別";
    sel.appendChild(opt0);

    var groupScopes = state.scopes.filter(function (s) { return s.kind === "group"; });
    var classScopes = state.scopes.filter(function (s) { return s.kind === "class"; });
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

  function renderMeta() {
    var dateEl = $("cr-attend-date-label");
    if (dateEl) dateEl.textContent = formatDateLabel(state.attendanceDate || browseDateFromHome());

    var srcEl = $("cr-attend-layout-src");
    if (srcEl) {
      if (!state.scope) {
        srcEl.textContent = "";
        srcEl.hidden = true;
      } else if (state.layoutSource === "chart") {
        srcEl.textContent = "座位：已存座位表" + (state.chartTitle ? "「" + state.chartTitle + "」" : "");
        srcEl.hidden = false;
      } else {
        srcEl.textContent = "座位：未存座位表 → 按學號排 " + state.rows + "×" + state.cols;
        srcEl.hidden = false;
      }
    }

    var sum = countSummary();
    var sumEl = $("cr-attend-summary");
    if (sumEl) {
      if (!state.scope) {
        sumEl.hidden = true;
      } else {
        sumEl.hidden = false;
        sumEl.innerHTML =
          '<span class="cr-attend-pill is-present">出席 ' + sum.present + "</span>" +
          '<span class="cr-attend-pill is-absent">缺席 ' + sum.absent + "</span>" +
          '<span class="cr-attend-pill is-late">遲到 ' + sum.late + "</span>" +
          '<span class="cr-attend-pill is-unmarked">未記 ' + sum.unmarked + "</span>" +
          '<span class="muted">共 ' + sum.total + " 人</span>";
      }
    }

    var body = $("cr-attend-body");
    if (body) body.classList.toggle("hidden", !state.scope);
    var hint = $("cr-attend-pick-hint");
    if (hint) hint.classList.toggle("hidden", !!state.scope);
  }

  function noLabelForSeat(seat) {
    if (!seat) return "";
    if (state.scope && (state.scope.kind === "group" || state.scope.kind === "split") && seat.class_code) {
      return seat.class_code + "-" + (seat.class_no || "");
    }
    return String(seat.class_no != null ? seat.class_no : "");
  }

  function renderGrid() {
    var box = $("cr-attend-grid");
    if (!box) return;
    if (!state.scope) {
      box.innerHTML = "";
      return;
    }
    var rows = state.rows;
    var cols = state.cols;
    var html = '<div class="seat-board cr-attend-board" style="--seat-cols:' + cols + '">';
    html += '<div class="seat-board-label seat-board-back">課室後</div>';
    html += '<div class="seat-board-grid">';
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var key = seatKey(r, c);
        var seat = state.seats[key];
        var cls = "seat-cell cr-attend-cell";
        var label = "";
        var sid = "";
        if (seat && seat.student_id) {
          sid = String(seat.student_id);
          var st = state.attendance[sid] || "";
          cls += " is-filled";
          cls += sexClass(seat.sex || sexFromRosterId(seat.student_id));
          if (st) cls += " is-att-" + st;
          var badge = st
            ? '<span class="cr-attend-badge is-' + st + '">' + escapeHtml(STATUS_SHORT[st] || "") + "</span>"
            : '<span class="cr-attend-badge is-unmarked">?</span>';
          label =
            badge +
            '<span class="seat-cell-no">' + escapeHtml(noLabelForSeat(seat)) + "</span>" +
            '<span class="seat-cell-name">' + escapeHtml(seat.name_zh || seat.name_en || "") + "</span>";
        } else {
          label = '<span class="seat-cell-empty">空</span>';
        }
        html += '<div role="button" tabindex="0" class="' + cls + '" data-r="' + r + '" data-c="' + c + '"' +
          (sid ? ' data-student-id="' + escapeHtml(sid) + '"' : "") +
          ' aria-label="座位 R' + (r + 1) + " C" + (c + 1) +
          (sid ? " · " + (STATUS_LABEL[state.attendance[sid]] || "未記") : "") + '">' +
          label + "</div>";
      }
    }
    html += "</div>";
    html += '<div class="seat-board-label seat-board-front">黑板／講台</div>';
    html += "</div>";
    box.innerHTML = html;
  }

  function renderUnseated() {
    var box = $("cr-attend-unseated");
    if (!box) return;
    if (!state.scope) {
      box.innerHTML = "";
      box.hidden = true;
      return;
    }
    var seated = {};
    Object.keys(state.seats).forEach(function (k) {
      var s = state.seats[k];
      if (s && s.student_id != null) seated[String(s.student_id)] = true;
    });
    var free = state.roster.filter(function (s) { return !seated[String(s.id)]; });
    if (!free.length) {
      box.innerHTML = "";
      box.hidden = true;
      return;
    }
    box.hidden = false;
    var html = '<div class="cr-attend-unseated-head">未入座（仍可點名） <span class="muted">' +
      free.length + '</span></div><ul class="cr-attend-unseated-list">';
    free.forEach(function (s) {
      var id = String(s.id);
      var st = state.attendance[id] || "";
      var no = (state.scope.kind === "group" || state.scope.kind === "split") && s.class_code
        ? (s.class_code + "-" + s.class_no)
        : String(s.class_no);
      html += '<li class="cr-attend-unseated-item' + sexClass(s.sex) +
        (st ? " is-att-" + st : "") +
        '" role="button" tabindex="0" data-student-id="' + escapeHtml(id) + '">' +
        '<span class="cr-attend-badge is-' + (st || "unmarked") + '">' +
        escapeHtml(st ? STATUS_SHORT[st] : "?") + "</span>" +
        '<span class="seat-no">' + escapeHtml(no) + "</span>" +
        '<span class="seat-name">' + escapeHtml(displayName(s)) + "</span>" +
        "</li>";
    });
    html += "</ul>";
    box.innerHTML = html;
  }

  function renderAll() {
    renderMeta();
    renderGrid();
    renderUnseated();
  }

  function nextStatus(cur) {
    var i = STATUS_CYCLE.indexOf(cur || "");
    if (i < 0) i = 0;
    return STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
  }

  async function cycleStudentStatus(studentId) {
    if (!studentId || state.saving) return;
    var cur = state.attendance[String(studentId)] || "";
    var next = nextStatus(cur);
    state.saving = true;
    setStatus("儲存中…");
    try {
      await upsertAttendance(Number(studentId) || studentId, next);
      renderAll();
      setStatus(next ? ("已記「" + STATUS_LABEL[next] + "」") : "已清除出席紀錄");
    } catch (e) {
      setStatus((e && e.message) || "儲存失敗", true);
    } finally {
      state.saving = false;
    }
  }

  async function markAllPresent() {
    if (!state.scope || state.saving) return;
    var ids = [];
    var seen = {};
    Object.keys(state.seats).forEach(function (k) {
      var s = state.seats[k];
      if (s && s.student_id != null && !seen[String(s.student_id)]) {
        seen[String(s.student_id)] = true;
        ids.push(s.student_id);
      }
    });
    state.roster.forEach(function (stu) {
      if (!seen[String(stu.id)]) {
        seen[String(stu.id)] = true;
        ids.push(stu.id);
      }
    });
    if (!ids.length) return;
    state.saving = true;
    setStatus("全部標為出席…");
    try {
      for (var i = 0; i < ids.length; i++) {
        await upsertAttendance(ids[i], "present");
      }
      renderAll();
      setStatus("已全部標為出席（" + ids.length + " 人）");
    } catch (e) {
      setStatus((e && e.message) || "儲存失敗", true);
      renderAll();
    } finally {
      state.saving = false;
    }
  }

  async function clearAllAttendance() {
    if (!state.scope || state.saving) return;
    if (!window.confirm("清除當日呢個班／組嘅全部出席紀錄？")) return;
    var client = getClient();
    var session = getSession();
    var fields = scopeFilterFields(state.scope);
    if (!client || !session || !fields) return;
    state.saving = true;
    setStatus("清除中…");
    try {
      var res = await client
        .from("class_attendance")
        .delete()
        .eq("owner_email", ownerEmail(session))
        .eq("attendance_date", state.attendanceDate)
        .eq("scope_kind", fields.scope_kind)
        .eq("class_code", fields.class_code)
        .eq("form", fields.form)
        .eq("subject", fields.subject)
        .eq("group_name", fields.group_name);
      if (res.error) throw new Error(res.error.message || "清除失敗");
      state.attendance = {};
      renderAll();
      setStatus("已清除當日出席紀錄");
    } catch (e) {
      setStatus((e && e.message) || "清除失敗", true);
    } finally {
      state.saving = false;
    }
  }

  async function onScopeChange(key) {
    var scope = findScopeByKey(key);
    state.scope = scope;
    if (!scope) {
      state.seats = {};
      state.attendance = {};
      renderAll();
      setStatus(state.scopes.length ? "請揀一個班別／分組。" : "未有可點名嘅班別／分組。");
      return;
    }
    setStatus("載入座位同出席…");
    try {
      await loadRosterForScope(scope);
      await loadChartForScope(scope);
      await loadAttendance();
      renderAll();
      setStatus(
        "撳座位循環：未記 → 出席 → 缺席 → 遲到 → 未記。日期跟頂欄。"
      );
    } catch (e) {
      setStatus((e && e.message) || "載入失敗", true);
      renderAll();
    }
  }

  async function onBrowseDate(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    if (iso === state.attendanceDate) {
      renderMeta();
      return;
    }
    state.attendanceDate = iso;
    renderMeta();
    if (!state.scope) return;
    // Only reload attendance when panel might be visible / has scope
    try {
      await loadAttendance();
      renderAll();
      setStatus("已切換日期：" + formatDateLabel(iso));
    } catch (e) {
      setStatus((e && e.message) || "讀取出席失敗", true);
    }
  }

  function bindUi() {
    if (state.bound) return;
    state.bound = true;
    var root = $("home-panel-classroom");
    if (!root) return;

    var sel = $("cr-attend-class-select");
    if (sel) {
      sel.addEventListener("change", function () {
        onScopeChange(sel.value || "");
      });
    }

    root.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-cr-attend-action]");
      if (btn && root.contains(btn)) {
        var act = btn.getAttribute("data-cr-attend-action");
        if (act === "all-present") markAllPresent();
        else if (act === "clear-all") clearAllAttendance();
        else if (act === "use-today") {
          var today = todayHK();
          var input = $("home-date-input");
          if (input) {
            input.value = today;
            input.dispatchEvent(new Event("change", { bubbles: true }));
          } else {
            onBrowseDate(today);
          }
        }
        return;
      }
      var cell = e.target.closest(".cr-attend-cell[data-student-id], .cr-attend-unseated-item[data-student-id]");
      if (cell && root.contains(cell)) {
        cycleStudentStatus(cell.getAttribute("data-student-id"));
      }
    });

    root.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var cell = e.target.closest(".cr-attend-cell[data-student-id], .cr-attend-unseated-item[data-student-id]");
      if (!cell || !root.contains(cell)) return;
      e.preventDefault();
      cycleStudentStatus(cell.getAttribute("data-student-id"));
    });
  }

  async function showPanel() {
    var session = getSession();
    var studentNote = $("cr-attend-student-note");
    var staffUI = $("cr-attend-staff-ui");
    if (!session || session.role !== "staff") {
      if (staffUI) staffUI.classList.add("hidden");
      if (studentNote) studentNote.classList.remove("hidden");
      return;
    }
    if (staffUI) staffUI.classList.remove("hidden");
    if (studentNote) studentNote.classList.add("hidden");

    bindUi();
    state.attendanceDate = browseDateFromHome();
    setStatus("載入任教班別／分組…");
    try {
      await loadScopes(session);
    } catch (e) {
      state.scopes = [];
    }
    fillScopeSelect();
    var hint = $("cr-attend-pick-hint");
    if (hint) {
      hint.textContent = state.scopes.length
        ? "範圍同座位表一樣（Excel 分組優先，例如 S4 ICT、S5／S6 MATH）。有存座位表就用；冇就按學號排 6×6。"
        : "未找到你嘅分組名單或任教班別。請聯絡 IT 核對 student_groups／時間表。";
    }
    if (state.scope && findScopeByKey(state.scope.key)) {
      await onScopeChange(state.scope.key);
    } else {
      state.scope = null;
      renderAll();
      setStatus(
        state.scopes.length
          ? ("你有 " + state.scopes.length + " 個任教範圍，請揀一個開始點名。")
          : "未有可點名嘅班別／分組。"
      );
    }
    state.ready = true;
  }

  function init() {
    document.addEventListener("schooladmin:browse-date", function (ev) {
      var iso = ev && ev.detail && ev.detail.date;
      if (iso) onBrowseDate(iso);
    });
    document.addEventListener("schooladmin:authed", function () {
      var session = getSession();
      if (session && session.role === "staff") {
        state.attendanceDate = browseDateFromHome();
      }
    });
  }

  window.SchoolAdminClassroom = {
    show: showPanel,
    onBrowseDate: onBrowseDate
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
