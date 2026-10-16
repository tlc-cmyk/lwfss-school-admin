/**
 * 座位表 — teacher seating charts
 * Staff: list taught classes → edit grid → save to Supabase → print/PDF.
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
    classCode: "",
    charts: [],
    chartId: null,
    title: "",
    rows: 6,
    cols: 6,
    // map key "r,c" → seat object
    seats: {},
    roster: [],
    selectedSeat: null, // {r,c}
    dirty: false,
    saving: false,
    taughtClasses: [],
    statusMsg: ""
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

  function setStatus(msg, isErr) {
    state.statusMsg = msg || "";
    var el = $("seat-status");
    if (!el) return;
    el.textContent = state.statusMsg;
    el.classList.toggle("is-err", !!isErr);
  }

  /** Parse class tokens from lessons.class_short / class_name (1A, 2A,2B, 4A-D). */
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

  function collectTaughtClasses(session) {
    var seen = {};
    var list = [];
    function add(code, reason) {
      code = String(code || "").toUpperCase();
      if (CLASS_CODES.indexOf(code) < 0) return;
      if (!seen[code]) {
        seen[code] = { code: code, reasons: [] };
        list.push(seen[code]);
      }
      if (reason && seen[code].reasons.indexOf(reason) < 0) {
        seen[code].reasons.push(reason);
      }
    }

    var code = teacherCode(session);
    if (session && session.staff && session.staff.class_teacher) {
      add(session.staff.class_teacher, "班主任");
    }

    // From cloud/local timetable lessons
    var rows = null;
    try {
      if (window.__homeLessonRows) rows = window.__homeLessonRows;
    } catch (e) { /* ignore */ }
    if (!rows) {
      var data = window.TIMETABLE_DATA;
      if (data && data.teachers && code) {
        var t = null;
        for (var i = 0; i < data.teachers.length; i++) {
          if (String(data.teachers[i].code || "").toUpperCase() === code) {
            t = data.teachers[i];
            break;
          }
        }
        if (t && t.schedule) {
          Object.keys(t.schedule).forEach(function (day) {
            var periods = t.schedule[day] || {};
            Object.keys(periods).forEach(function (p) {
              var cell = periods[p];
              if (!cell) return;
              var raw = cell.classShort || cell.class || "";
              String(raw).split(/[,，]/).forEach(function (tok) {
                expandClassToken(tok.trim()).forEach(function (c) { add(c, "任教"); });
              });
            });
          });
        }
      }
    }

    list.sort(function (a, b) {
      return a.code.localeCompare(b.code, "en");
    });
    return list;
  }

  async function enrichTaughtFromCloud(session) {
    var client = getClient();
    var code = teacherCode(session);
    if (!client || !code) return collectTaughtClasses(session);

    var seen = {};
    collectTaughtClasses(session).forEach(function (x) {
      seen[x.code] = { code: x.code, reasons: x.reasons.slice() };
    });
    function add(c, reason) {
      c = String(c || "").toUpperCase();
      if (CLASS_CODES.indexOf(c) < 0) return;
      if (!seen[c]) seen[c] = { code: c, reasons: [] };
      if (reason && seen[c].reasons.indexOf(reason) < 0) seen[c].reasons.push(reason);
    }

    try {
      var ct = await client
        .from("class_teachers")
        .select("class_code")
        .ilike("teacher_short_name", code)
        .eq("academic_year", ACADEMIC_YEAR);
      if (ct.data) {
        ct.data.forEach(function (r) { add(r.class_code, "班主任"); });
      }
    } catch (e) { /* ignore */ }

    try {
      var lessons = await client
        .from("lessons")
        .select("class_short,class_name")
        .ilike("teacher_code", code)
        .limit(2000);
      if (lessons.data) {
        lessons.data.forEach(function (l) {
          var raw = String(l.class_short || l.class_name || "");
          raw.split(/[,，]/).forEach(function (tok) {
            expandClassToken(tok.trim()).forEach(function (c) { add(c, "任教"); });
          });
        });
      }
    } catch (e2) { /* ignore */ }

    try {
      var sg = await client
        .from("student_groups")
        .select("student_id")
        .ilike("teacher_short_name", code)
        .eq("academic_year", ACADEMIC_YEAR)
        .limit(3000);
      if (sg.data && sg.data.length) {
        var ids = sg.data.map(function (r) { return r.student_id; }).filter(Boolean);
        // Cap IN filter size
        var chunk = ids.slice(0, 500);
        if (chunk.length) {
          var st = await client
            .from("students")
            .select("class_code")
            .in("id", chunk);
          if (st.data) {
            st.data.forEach(function (r) { add(r.class_code, "分組"); });
          }
        }
      }
    } catch (e3) { /* ignore */ }

    var list = Object.keys(seen).map(function (k) { return seen[k]; });
    list.sort(function (a, b) { return a.code.localeCompare(b.code, "en"); });
    return list;
  }

  async function loadRoster(classCode) {
    var client = getClient();
    if (!client || !classCode) {
      state.roster = [];
      return;
    }
    var res = await client
      .from("students")
      .select("id,class_code,class_no,chinese_name,english_name,sex,house")
      .eq("class_code", classCode)
      .eq("academic_year", ACADEMIC_YEAR)
      .order("class_no", { ascending: true });
    if (res.error) throw new Error(res.error.message || "讀取學生名單失敗");
    state.roster = res.data || [];
  }

  async function loadCharts(classCode) {
    var client = getClient();
    var session = getSession();
    if (!client || !session || !classCode) {
      state.charts = [];
      return;
    }
    var email = ownerEmail(session);
    var res = await client
      .from("seating_charts")
      .select("id,class_code,teacher_code,owner_email,title,rows,cols,layout,updated_at,academic_year")
      .eq("class_code", classCode)
      .eq("academic_year", ACADEMIC_YEAR)
      .eq("owner_email", email)
      .order("updated_at", { ascending: false });
    if (res.error) throw new Error(res.error.message || "讀取座位表失敗");
    state.charts = res.data || [];
  }

  function layoutToSeats(layout) {
    var map = {};
    (layout || []).forEach(function (s) {
      if (s == null || s.r == null || s.c == null) return;
      map[seatKey(s.r, s.c)] = {
        r: s.r,
        c: s.c,
        student_id: s.student_id || null,
        class_no: s.class_no || null,
        name_zh: s.name_zh || "",
        name_en: s.name_en || "",
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
      out.push({
        r: s.r,
        c: s.c,
        student_id: s.student_id,
        class_no: s.class_no,
        name_zh: s.name_zh || "",
        name_en: s.name_en || "",
        notes: s.notes || ""
      });
    });
    out.sort(function (a, b) {
      if (a.r !== b.r) return a.r - b.r;
      return a.c - b.c;
    });
    return out;
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
    // Prefer ~6–8 columns; rows to fit
    var cols = n <= 24 ? 6 : (n <= 35 ? 7 : 8);
    var rows = Math.max(4, Math.ceil(n / cols) + 1);
    if (rows > 12) rows = 12;
    if (cols > 10) cols = 10;
    return { rows: rows, cols: cols };
  }

  function applyChart(chart) {
    if (!chart) {
      state.chartId = null;
      state.title = state.classCode ? (state.classCode + " 座位表") : "座位表";
      var g = suggestGrid((state.roster || []).length || 30);
      state.rows = g.rows;
      state.cols = g.cols;
      state.seats = {};
      state.dirty = false;
      state.selectedSeat = null;
      return;
    }
    state.chartId = chart.id;
    state.title = chart.title || (chart.class_code + " 座位表");
    state.rows = chart.rows || 6;
    state.cols = chart.cols || 6;
    state.seats = layoutToSeats(chart.layout);
    state.dirty = false;
    state.selectedSeat = null;
  }

  function fillClassSelect() {
    var sel = $("seat-class-select");
    if (!sel) return;
    var prev = state.classCode || sel.value || "";
    sel.innerHTML = "";
    var opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = state.taughtClasses.length
      ? "選擇任教班別…"
      : "選擇班別…";
    sel.appendChild(opt0);

    var taughtSet = {};
    state.taughtClasses.forEach(function (t) {
      taughtSet[t.code] = t;
      var opt = document.createElement("option");
      opt.value = t.code;
      var reason = (t.reasons || []).join("·") || "任教";
      opt.textContent = t.code + "（" + reason + "）";
      sel.appendChild(opt);
    });

    // Also offer all classes under an optgroup for flexibility
    var og = document.createElement("optgroup");
    og.label = "全部班別";
    CLASS_CODES.forEach(function (c) {
      if (taughtSet[c]) return;
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      og.appendChild(opt);
    });
    if (og.childNodes.length) sel.appendChild(og);

    if (prev) sel.value = prev;
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
    var html = '<div class="seat-roster-head">未編座位 <span class="muted">' +
      free.length + "／" + state.roster.length + "</span></div>";
    if (!state.roster.length) {
      html += '<p class="muted seat-empty">未有學生名單。</p>';
    } else if (!free.length) {
      html += '<p class="muted seat-empty">全部已入座。</p>';
    } else {
      html += '<ul class="seat-roster-list">';
      free.forEach(function (s) {
        html += '<li class="seat-roster-item" draggable="true" data-student-id="' +
          escapeHtml(s.id) + '" tabindex="0">' +
          '<span class="seat-no">' + escapeHtml(s.class_no) + "</span>" +
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
        if (seat && seat.student_id) cls += " is-filled";
        if (selected) cls += " is-selected";
        var label = "";
        if (seat && seat.student_id) {
          label = '<span class="seat-cell-no">' + escapeHtml(seat.class_no || "") + "</span>" +
            '<span class="seat-cell-name">' + escapeHtml(seat.name_zh || seat.name_en || "") + "</span>";
        } else {
          label = '<span class="seat-cell-empty">空</span>';
        }
        html += '<button type="button" class="' + cls + '" data-r="' + r + '" data-c="' + c +
          '" aria-label="座位 R' + (r + 1) + " C" + (c + 1) + '">' + label + "</button>";
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
    if (editor) editor.classList.toggle("hidden", !state.classCode);
    var empty = $("seat-pick-hint");
    if (empty) empty.classList.toggle("hidden", !!state.classCode);
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

  function placeStudent(r, c, studentId) {
    var stu = findStudent(studentId);
    if (!stu) return;
    // Remove from previous seat if any
    Object.keys(state.seats).forEach(function (k) {
      if (state.seats[k] && String(state.seats[k].student_id) === String(studentId)) {
        delete state.seats[k];
      }
    });
    state.seats[seatKey(r, c)] = {
      r: r,
      c: c,
      student_id: stu.id,
      class_no: stu.class_no,
      name_zh: stu.chinese_name || "",
      name_en: stu.english_name || "",
      notes: ""
    };
    state.dirty = true;
    state.selectedSeat = null;
    renderAll();
  }

  function clearSeat(r, c) {
    delete state.seats[seatKey(r, c)];
    state.dirty = true;
    state.selectedSeat = null;
    renderAll();
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
        state.seats[seatKey(r, c)] = {
          r: r,
          c: c,
          student_id: stu.id,
          class_no: stu.class_no,
          name_zh: stu.chinese_name || "",
          name_en: stu.english_name || "",
          notes: ""
        };
      }
    }
    state.dirty = true;
    state.selectedSeat = null;
    setStatus("已按學號自動編位（可再拖曳調整）。");
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
    if (!state.classCode) {
      setStatus("請先選擇班別。", true);
      return;
    }
    if (state.saving) return;
    state.saving = true;
    setStatus("儲存中…");
    var payload = {
      class_code: state.classCode,
      teacher_code: teacherCode(session),
      owner_email: ownerEmail(session),
      title: (state.title || (state.classCode + " 座位表")).trim(),
      rows: state.rows,
      cols: state.cols,
      layout: seatsToLayout(),
      academic_year: ACADEMIC_YEAR
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
            teacher_code: payload.teacher_code
          })
          .eq("id", state.chartId)
          .eq("owner_email", payload.owner_email)
          .select("id,class_code,teacher_code,owner_email,title,rows,cols,layout,updated_at,academic_year")
          .single();
      } else {
        res = await client
          .from("seating_charts")
          .insert(payload)
          .select("id,class_code,teacher_code,owner_email,title,rows,cols,layout,updated_at,academic_year")
          .single();
      }
      if (res.error) throw new Error(res.error.message || "儲存失敗");
      state.chartId = res.data.id;
      state.dirty = false;
      await loadCharts(state.classCode);
      renderAll();
      setStatus("已儲存（" + (res.data.updated_at || "").slice(0, 19).replace("T", " ") + " HKT）");
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
      await loadCharts(state.classCode);
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

  /** Print / Save as PDF via browser print dialog (Traditional Chinese fonts OK). */
  function exportPdf() {
    if (!state.classCode) {
      setStatus("請先選擇班別。", true);
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
        if (seat && seat.student_id) {
          inner = '<div class="no">' + escapeHtml(seat.class_no || "") + "</div>" +
            '<div class="zh">' + escapeHtml(seat.name_zh || "") + "</div>" +
            (seat.name_en ? '<div class="en">' + escapeHtml(seat.name_en) + "</div>" : "");
        }
        cells += '<td class="' + (seat && seat.student_id ? "filled" : "empty") + '">' +
          inner + "</td>";
      }
      cells += "</tr>";
    }

    var html = "<!DOCTYPE html><html lang=\"zh-HK\"><head><meta charset=\"UTF-8\" />" +
      "<title>" + escapeHtml(state.title || state.classCode + " 座位表") + "</title>" +
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
      ".no{font-weight:700;font-size:11px;}" +
      ".zh{font-size:13px;}" +
      ".en{font-size:10px;color:#444;}" +
      "@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}" +
      "</style></head><body>" +
      "<h1>" + escapeHtml(state.title || (state.classCode + " 座位表")) + "</h1>" +
      '<div class="meta">班別 ' + escapeHtml(state.classCode) +
      " · " + escapeHtml(teacher) +
      " · " + escapeHtml(todayLabel()) +
      " · " + rows + "×" + cols + "</div>" +
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

  function displayTeacher(session) {
    if (!session) return "";
    var name = (session.staff && session.staff.name) || session.name || "";
    var code = teacherCode(session);
    if (name && code) return name + "（" + code + "）";
    return name || code || "";
  }

  async function onClassChange(classCode) {
    state.classCode = classCode || "";
    state.chartId = null;
    state.selectedSeat = null;
    if (!state.classCode) {
      state.charts = [];
      state.roster = [];
      applyChart(null);
      renderAll();
      setStatus("");
      return;
    }
    setStatus("載入 " + state.classCode + "…");
    try {
      await Promise.all([loadRoster(state.classCode), loadCharts(state.classCode)]);
      if (state.charts.length) {
        applyChart(state.charts[0]);
      } else {
        applyChart(null);
      }
      renderAll();
      setStatus(
        state.classCode + " · 學生 " + state.roster.length +
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
    renderAll();
    setStatus("已載入：" + (found && found.title ? found.title : ""));
  }

  function bindEditorEvents() {
    var root = $("home-panel-seating");
    if (!root || root.dataset.seatBound === "1") return;
    root.dataset.seatBound = "1";

    root.addEventListener("change", function (e) {
      var t = e.target;
      if (t.id === "seat-class-select") {
        onClassChange(t.value || "");
      } else if (t.id === "seat-chart-select") {
        onChartSelect(t.value || "");
      } else if (t.id === "seat-rows" || t.id === "seat-cols") {
        var rows = parseInt(($("seat-rows") && $("seat-rows").value) || "6", 10);
        var cols = parseInt(($("seat-cols") && $("seat-cols").value) || "6", 10);
        if (!(rows > 0 && rows <= 20)) rows = state.rows;
        if (!(cols > 0 && cols <= 20)) cols = state.cols;
        state.rows = rows;
        state.cols = cols;
        // Drop seats outside new bounds
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

    root.addEventListener("click", function (e) {
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

      var cell = e.target.closest(".seat-cell");
      if (cell) {
        var r = parseInt(cell.getAttribute("data-r"), 10);
        var c = parseInt(cell.getAttribute("data-c"), 10);
        var key = seatKey(r, c);
        // Double-click / second tap on filled selected seat → clear
        if (state.selectedSeat && state.selectedSeat.r === r && state.selectedSeat.c === c) {
          if (state.seats[key] && state.seats[key].student_id) {
            clearSeat(r, c);
            return;
          }
        }
        state.selectedSeat = { r: r, c: c };
        renderGrid();
        setStatus("已選座位 R" + (r + 1) + " C" + (c + 1) + " — 再撳名單學生編入，或再撳座位清空。");
        return;
      }

      var item = e.target.closest(".seat-roster-item");
      if (item) {
        var sid = item.getAttribute("data-student-id");
        if (!state.selectedSeat) {
          setStatus("請先撳一個空位，再選學生。", true);
          return;
        }
        placeStudent(state.selectedSeat.r, state.selectedSeat.c, sid);
        setStatus("已編入座位。");
      }
    });

    // Drag & drop from roster → seat
    root.addEventListener("dragstart", function (e) {
      var item = e.target.closest(".seat-roster-item");
      if (!item || !e.dataTransfer) return;
      e.dataTransfer.setData("text/student-id", item.getAttribute("data-student-id"));
      e.dataTransfer.effectAllowed = "copy";
    });
    root.addEventListener("dragover", function (e) {
      if (e.target.closest(".seat-cell")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    });
    root.addEventListener("drop", function (e) {
      var cell = e.target.closest(".seat-cell");
      if (!cell) return;
      e.preventDefault();
      var sid = e.dataTransfer.getData("text/student-id");
      if (!sid) return;
      var r = parseInt(cell.getAttribute("data-r"), 10);
      var c = parseInt(cell.getAttribute("data-c"), 10);
      placeStudent(r, c, sid);
      setStatus("已拖入座位。");
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
    setStatus("載入任教班別…");
    try {
      state.taughtClasses = await enrichTaughtFromCloud(session);
    } catch (e) {
      state.taughtClasses = collectTaughtClasses(session);
    }
    fillClassSelect();
    if (state.classCode) {
      await onClassChange(state.classCode);
    } else {
      renderAll();
      setStatus(
        state.taughtClasses.length
          ? ("你有 " + state.taughtClasses.length + " 個任教／班主任班別，請揀一個開始。")
          : "請選擇班別開始編座位表。"
      );
    }
    state.ready = true;
  }

  // Expose for home.js panel switch
  window.SchoolAdminSeating = {
    show: showPanel,
    isDirty: function () { return !!state.dirty; }
  };

  document.addEventListener("schooladmin:authed", function () {
    // Prefetch taught classes quietly when staff signs in
    var session = getSession();
    if (session && session.role === "staff") {
      enrichTaughtFromCloud(session).then(function (list) {
        state.taughtClasses = list;
      }).catch(function () { /* ignore */ });
    }
  });
})();
