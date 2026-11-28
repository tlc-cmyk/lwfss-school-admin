(function () {
  "use strict";

  var ACADEMIC_YEAR = "2026-2027";
  var S3_CLASSES = ["3A", "3B", "3C", "3D"];
  var BLOCK_META = {
    x1: { title: "X1 選修一", range: "1-21" },
    x2: { title: "X2 選修二", range: "1-21" },
    x3: { title: "X3 選修三", range: "1-21" }
  };
  var MEDIUM_LABEL = { cmi: "中", emi: "英" };

  var root = null;
  var loaded = false;
  var loading = false;
  var saving = false;
  var subjects = [];
  var roundRow = null;
  var roster = [];
  var submission = null;
  var identity = {
    classCode: "",
    classNo: "",
    chineseName: "",
    englishName: "",
    studentId: null,
    confirmed: false,
    autoMatched: false
  };
  var ranks = {};
  var mathsLanguage = "";
  var staffFilter = { classCode: "", maths: "", status: "" };
  var staffSaving = false;

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getSession() {
    return (window.SchoolAdminAuth && SchoolAdminAuth.getSession()) || window.__schoolAdminSession || null;
  }

  function getClient() {
    var auth = window.SchoolAdminAuth;
    return (auth && auth.getClient && auth.getClient()) || window.__supabaseClient || null;
  }

  function sessionEmail(session) {
    return String((session && session.email) || "").trim().toLowerCase();
  }

  function canUseCloud(session) {
    if (!session || session.method !== "supabase") return false;
    var email = sessionEmail(session);
    if (!email) return false;
    if (window.SchoolAdminAuth && SchoolAdminAuth.emailAllowed) {
      return SchoolAdminAuth.emailAllowed(email);
    }
    return /@g\.lwfss\.edu\.hk$/i.test(email);
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function studentAppUrl() {
    var cfg = window.SCHOOL_ADMIN_CONFIG || {};
    var u = cfg.studentAppUrl || "https://tlc-cmyk.github.io/lwfss-student-app/";
    return String(u).replace(/\/?$/, "/");
  }

  function formatHkDateTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    try {
      var parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Hong_Kong",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).formatToParts(d);
      var map = {};
      parts.forEach(function (p) { map[p.type] = p.value; });
      return map.year + "年" + Number(map.month) + "月" + Number(map.day) + "日 "
        + map.hour + ":" + map.minute + "（香港時間）";
    } catch (e) {
      var t = new Date(d.getTime() + 8 * 3600 * 1000);
      return t.getUTCFullYear() + "年" + (t.getUTCMonth() + 1) + "月" + t.getUTCDate() + "日 "
        + pad2(t.getUTCHours()) + ":" + pad2(t.getUTCMinutes()) + "（香港時間）";
    }
  }

  function isoToHkLocalInput(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    try {
      var parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Hong_Kong",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      }).formatToParts(d);
      var map = {};
      parts.forEach(function (p) { map[p.type] = p.value; });
      return map.year + "-" + map.month + "-" + map.day + "T" + map.hour + ":" + map.minute;
    } catch (e) {
      var t = new Date(d.getTime() + 8 * 3600 * 1000);
      return t.getUTCFullYear() + "-" + pad2(t.getUTCMonth() + 1) + "-" + pad2(t.getUTCDate())
        + "T" + pad2(t.getUTCHours()) + ":" + pad2(t.getUTCMinutes());
    }
  }

  function hkLocalInputToIso(localStr) {
    var v = String(localStr || "").trim();
    if (!v) return null;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return v + ":00+08:00";
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(v)) return v + "+08:00";
    return null;
  }

  function isRoundOpen(row) {
    if (!row || row.locked) return false;
    if (!row.deadline) return true;
    var t = new Date(row.deadline).getTime();
    if (isNaN(t)) return true;
    return Date.now() < t;
  }

  function deadlineStatusText(row, forStudent) {
    if (!row) return "未能載入選科回合設定。";
    var when = row.deadline ? formatHkDateTime(row.deadline) : "";
    if (row.locked) {
      return forStudent
        ? "表格已關閉，你仍可查看已提交的選擇，但不能再更改或重新提交。"
        : "表格已關閉。學生不可再提交或改選。";
    }
    if (row.deadline && !isRoundOpen(row)) {
      return forStudent
        ? "改選限期已過（限期：" + when + "）。你仍可查看已提交的選擇，但不能再更改或重新提交。"
        : "改選限期已過（限期：" + when + "）。學生不可再提交或改選。";
    }
    if (when) {
      return forStudent
        ? "請於 " + when + " 前完成或更改選科。限期過後將不能再改選。"
        : "表格開放中。學生可於 " + when + " 前提交或改選。";
    }
    return forStudent
      ? "表格現正開放，尚未設定改選限期。"
      : "表格開放中（尚未設定改選限期）。";
  }

  function subjectsByBlock(block) {
    return subjects.filter(function (s) {
      return s.block === block;
    }).sort(function (a, b) { return a.sort_order - b.sort_order; });
  }

  function parseRank(raw) {
    var t = String(raw == null ? "" : raw).trim();
    if (!t) return null;
    if (!/^[0-9]+$/.test(t)) return NaN;
    var n = Number(t);
    if (!Number.isInteger(n)) return NaN;
    return n;
  }

  function validateRanks(current) {
    var issues = { missing: 0, invalid: [], clash: {}, ok: false };
    var used = {};
    subjects.forEach(function (s) {
      var n = parseRank(current[s.code]);
      if (n == null) {
        issues.missing += 1;
        return;
      }
      if (!Number.isFinite(n) || n < 1 || n > 21) {
        issues.invalid.push(s.code);
        return;
      }
      if (used[n]) {
        issues.clash[s.code] = n;
        issues.clash[used[n]] = n;
      } else {
        used[n] = s.code;
      }
    });
    issues.ok = issues.missing === 0 && issues.invalid.length === 0 && Object.keys(issues.clash).length === 0
      && subjects.length === 21;
    return issues;
  }

  function validationMessage(issues) {
    if (!subjects.length) return "未能載入科目清單。";
    if (issues.invalid.length) return "優次必須是 1 至 21 的整數。";
    if (Object.keys(issues.clash).length) return "優次數字不可以重複。請檢查標示為重複的科目。";
    if (issues.missing) return "尚有 " + issues.missing + " 科未填優次。請為全部 21 科填上 1 至 21，數字不可重複。";
    if (!mathsLanguage) return "請選擇來年數學科修讀的語言（中文修讀或英文修讀）。";
    if (!identity.confirmed) return "請先確認班別、學號與姓名。";
    return "已填妥 1 至 21，可以提交。";
  }

  function errText(err) {
    var msg = (err && (err.message || err.error_description || err.details)) || "";
    msg = String(msg);
    if (/改選限期已過|表格已關閉/.test(msg)) return "改選限期已過或表格已關閉，現在不能提交或更改。";
    if (/優次數字不可重複/.test(msg)) return "優次數字不可重複。";
    if (/必須為全部 21|必須填滿/.test(msg)) return "必須為全部 21 個科目各填一個不重複的優次（1 至 21）。";
    if (/數學科修讀的語言/.test(msg)) return "請選擇來年數學科修讀的語言（中文或英文）。";
    if (/找不到對應的中三/.test(msg)) return "找不到對應的中三學生名單記錄，請核對班別與學號。";
    if (/不能更改已提交的班別/.test(msg)) return "不能更改已提交的班別或學號。如填錯，請聯絡老師。";
    if (/duplicate key|unique/i.test(msg) && /class/i.test(msg)) {
      return "此班別與學號已有其他帳戶提交，請核對後再試，或請老師協助處理。";
    }
    if (/row-level security|RLS|42501/i.test(msg)) {
      return "沒有權限儲存（可能已過改選限期，或身分不符）。";
    }
    return msg || "儲存失敗，請稍後再試。";
  }

  function setHtml(el, html) {
    if (el) el.innerHTML = html;
  }

  async function loadCatalogue() {
    var client = getClient();
    if (!client) throw new Error("尚未連線到資料庫。");
    var subjRes = await client
      .from("subject_choice_subjects")
      .select("code, academic_year, block, display_name, sort_order, is_apl, medium, pair_group")
      .eq("academic_year", ACADEMIC_YEAR)
      .order("block")
      .order("sort_order");
    if (subjRes.error) throw subjRes.error;
    subjects = subjRes.data || [];
    var roundRes = await client
      .from("subject_choice_rounds")
      .select("academic_year, title, locked, deadline, updated_at, updated_by_email")
      .eq("academic_year", ACADEMIC_YEAR)
      .maybeSingle();
    if (roundRes.error) throw roundRes.error;
    roundRow = roundRes.data || null;
  }

  async function loadRoster() {
    var client = getClient();
    var res = await client
      .from("students")
      .select("id, class_code, class_no, chinese_name, english_name, email, academic_year")
      .eq("academic_year", ACADEMIC_YEAR)
      .in("class_code", S3_CLASSES)
      .order("class_code")
      .order("class_no");
    if (res.error) throw res.error;
    roster = res.data || [];
  }

  async function loadOwnSubmission(email) {
    var client = getClient();
    var res = await client
      .from("subject_choice_submissions")
      .select("id, academic_year, owner_email, student_id, class_code, class_no, chinese_name, english_name, maths_language, ranks, submitted_at, updated_at")
      .eq("academic_year", ACADEMIC_YEAR)
      .eq("owner_email", email)
      .maybeSingle();
    if (res.error) throw res.error;
    submission = res.data || null;
  }

  function applySubmissionToForm() {
    if (!submission) return;
    identity.classCode = submission.class_code;
    identity.classNo = String(submission.class_no);
    identity.chineseName = submission.chinese_name || "";
    identity.englishName = submission.english_name || "";
    identity.studentId = submission.student_id;
    identity.confirmed = true;
    identity.autoMatched = true;
    mathsLanguage = submission.maths_language || "";
    ranks = {};
    var raw = submission.ranks || {};
    Object.keys(raw).forEach(function (k) { ranks[k] = raw[k]; });
  }

  function matchRosterByEmail(email) {
    if (!email) return null;
    var lower = email.toLowerCase();
    for (var i = 0; i < roster.length; i++) {
      if ((roster[i].email || "").toLowerCase() === lower) return roster[i];
    }
    return null;
  }

  function findRosterStudent(classCode, classNo) {
    var no = Number(classNo);
    for (var i = 0; i < roster.length; i++) {
      if (roster[i].class_code === classCode && roster[i].class_no === no) return roster[i];
    }
    return null;
  }

  function classNumbers(classCode) {
    return roster.filter(function (s) { return s.class_code === classCode; })
      .map(function (s) { return s.class_no; });
  }

  function mediumBadge(s) {
    var lab = MEDIUM_LABEL[s.medium];
    if (!lab) return "";
    return '<span class="sc-medium sc-medium-' + escapeHtml(s.medium) + '">' + lab + "</span>";
  }

  function renderStudentShell() {
    if (!root) return;
    var open = isRoundOpen(roundRow);
    var title = (roundRow && roundRow.title) || "學生選科系統";
    var status = deadlineStatusText(roundRow, true);
    var lockedNote = open ? "" : " sc-form-locked";
    root.innerHTML =
      '<div class="sc-wrap sc-student' + lockedNote + '">' +
        '<header class="sc-hero">' +
          '<h2 class="sc-title">學生選科系統</h2>' +
          '<p class="sc-subtitle">按優次為 X1、X2、X3填上 (1至21)</p>' +
          '<p class="sc-year muted">' + escapeHtml(title) + " · " + escapeHtml(ACADEMIC_YEAR) + " 學年中三升中四</p>" +
          '<p class="sc-deadline" id="sc-deadline-msg">' + escapeHtml(status) + "</p>" +
        "</header>" +
        '<div id="sc-identity"></div>' +
        '<div id="sc-form-body" hidden></div>' +
      "</div>";
  }

  function renderIdentity() {
    var box = $("sc-identity");
    if (!box) return;
    var session = getSession();
    var email = sessionEmail(session);

    if (identity.confirmed) {
      box.innerHTML =
        '<section class="sc-card sc-id-card" aria-label="學生資料">' +
          '<p class="sc-id-line"><span class="sc-id-label">班別</span> ' + escapeHtml(identity.classCode) +
          '　<span class="sc-id-label">學號</span> ' + escapeHtml(identity.classNo) + "</p>" +
          '<p class="sc-id-line"><span class="sc-id-label">姓名</span> ' +
            escapeHtml(identity.chineseName || "—") +
            (identity.englishName ? "　" + escapeHtml(identity.englishName) : "") +
          "</p>" +
          '<p class="sc-id-line muted">登入帳戶：' + escapeHtml(email) + "</p>" +
        "</section>";
      return;
    }

    var numOpts = '<option value="">請選擇學號</option>';
    if (identity.classCode) {
      classNumbers(identity.classCode).forEach(function (n) {
        numOpts += '<option value="' + n + '"' + (String(identity.classNo) === String(n) ? " selected" : "") + ">" + n + "</option>";
      });
    }
    var classOpts = S3_CLASSES.map(function (c) {
      return '<option value="' + c + '"' + (identity.classCode === c ? " selected" : "") + ">" + c + "</option>";
    }).join("");

    var preview = "";
    if (identity.classCode && identity.classNo) {
      var stu = findRosterStudent(identity.classCode, identity.classNo);
      if (stu) {
        preview =
          '<div class="sc-name-preview">' +
            "<p>請確認以下是你的姓名：</p>" +
            '<p class="sc-name-confirm"><strong>' + escapeHtml(stu.chinese_name || "—") + "</strong>" +
              (stu.english_name ? "　" + escapeHtml(stu.english_name) : "") +
            "</p>" +
            '<button type="button" class="btn" id="sc-confirm-id">確認並開始填寫</button>' +
          "</div>";
      } else {
        preview = '<p class="sc-error" role="alert">名單上找不到此班別與學號。</p>';
      }
    }

    box.innerHTML =
      '<section class="sc-card sc-id-card" aria-label="確認身分">' +
        "<p>此表格只供 <strong>2026-2027 學年中三</strong>（3A–3D）學生填寫。請選擇你的班別與學號，並確認姓名。</p>" +
        '<div class="sc-id-picks">' +
          '<label class="sc-field"><span>班別</span>' +
            '<select id="sc-class" aria-label="班別">' +
              '<option value="">請選擇班別</option>' + classOpts +
            "</select></label>" +
          '<label class="sc-field"><span>學號</span>' +
            '<select id="sc-class-no" aria-label="學號"' + (identity.classCode ? "" : " disabled") + ">" +
              numOpts +
            "</select></label>" +
        "</div>" +
        preview +
      "</section>";

    var classSel = $("sc-class");
    var noSel = $("sc-class-no");
    if (classSel) {
      classSel.addEventListener("change", function () {
        identity.classCode = classSel.value || "";
        identity.classNo = "";
        identity.confirmed = false;
        renderIdentity();
      });
    }
    if (noSel) {
      noSel.addEventListener("change", function () {
        identity.classNo = noSel.value || "";
        identity.confirmed = false;
        renderIdentity();
      });
    }
    var confirmBtn = $("sc-confirm-id");
    if (confirmBtn) {
      confirmBtn.addEventListener("click", function () {
        var stu = findRosterStudent(identity.classCode, identity.classNo);
        if (!stu) return;
        identity.chineseName = stu.chinese_name || "";
        identity.englishName = stu.english_name || "";
        identity.studentId = stu.id;
        identity.confirmed = true;
        renderIdentity();
        renderFormBody();
      });
    }
  }

  function renderFormBody() {
    var body = $("sc-form-body");
    if (!body) return;
    if (!identity.confirmed) {
      body.hidden = true;
      body.innerHTML = "";
      return;
    }
    body.hidden = false;
    var open = isRoundOpen(roundRow);
    var disabled = !open;

    var maths =
      '<fieldset class="sc-card sc-maths" id="sc-maths-fs"' + (disabled ? " disabled" : "") + ">" +
        "<legend>希望中四修讀數學科的語言</legend>" +
        '<p class="sc-hint">來年數學科修讀的語言（必選）</p>' +
        '<div class="sc-maths-opts" role="radiogroup" aria-label="來年數學科修讀的語言">' +
          '<label class="sc-radio"><input type="radio" name="sc-maths" value="中文"' +
            (mathsLanguage === "中文" ? " checked" : "") + (disabled ? " disabled" : "") +
            '> <span>中文修讀</span></label>' +
          '<label class="sc-radio"><input type="radio" name="sc-maths" value="英文"' +
            (mathsLanguage === "英文" ? " checked" : "") + (disabled ? " disabled" : "") +
            '> <span>英文修讀</span></label>' +
        "</div>" +
      "</fieldset>";

    var notes =
      '<p class="sc-notes">1 為最優先，21 為最末。三組合共 21 科，每個數字只可用一次。' +
      "企會財／BAFS、生物／Biology、經濟／Economics、物理／Physics 為中英文班對應科目；地理1 與 地理3 為同一科目不同組別。" +
      "粉紅色科目為應用學習課程（ApL）。</p>";

    var cols = ["x1", "x2", "x3"].map(function (block) {
      var meta = BLOCK_META[block];
      var rows = subjectsByBlock(block).map(function (s) {
        var val = ranks[s.code] == null || ranks[s.code] === "" ? "" : String(ranks[s.code]);
        var aplClass = s.is_apl ? " sc-apl" : "";
        return '<tr class="sc-row' + aplClass + '">' +
          '<th scope="row">' +
            '<label for="sc-rank-' + escapeHtml(s.code) + '">' +
              '<span class="sc-subj-name">' + escapeHtml(s.display_name) + "</span>" +
              mediumBadge(s) +
            "</label>" +
          "</th>" +
          "<td>" +
            '<input class="sc-rank" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" ' +
              'id="sc-rank-' + escapeHtml(s.code) + '" data-code="' + escapeHtml(s.code) + '" ' +
              'value="' + escapeHtml(val) + '" ' +
              'aria-label="' + escapeHtml(s.display_name) + ' 優次（1至21）" ' +
              (disabled ? "disabled " : "") +
              "autocomplete=\"off\">" +
          "</td>" +
        "</tr>";
      }).join("");
      return '<div class="sc-block sc-block-' + block + '">' +
        '<div class="sc-block-head">' +
          '<span class="sc-block-title">' + escapeHtml(meta.title) + "</span>" +
          '<span class="sc-block-range">' + escapeHtml(meta.range) + "</span>" +
        "</div>" +
        '<table class="sc-table">' +
          "<thead><tr><th>科目</th><th>優次</th></tr></thead>" +
          "<tbody>" + rows + "</tbody>" +
        "</table>" +
      "</div>";
    }).join("");

    var saved = "";
    if (submission) {
      saved = '<p class="sc-saved" id="sc-saved-msg">已提交。最後儲存：'
        + escapeHtml(formatHkDateTime(submission.updated_at || submission.submitted_at))
        + "。首次提交：" + escapeHtml(formatHkDateTime(submission.submitted_at)) + "。</p>";
    } else {
      saved = '<p class="sc-saved" id="sc-saved-msg">尚未提交。</p>';
    }

    body.innerHTML =
      maths + notes +
      '<div class="sc-grid" id="sc-grid">' + cols + "</div>" +
      '<div class="sc-actions">' +
        '<p class="sc-live" id="sc-live" role="status" aria-live="polite"></p>' +
        saved +
        '<button type="button" class="btn" id="sc-submit"' + (disabled ? " disabled" : "") + ">" +
          (submission ? "更新選科" : "提交選科") +
        "</button>" +
        '<p class="sc-error" id="sc-form-err" role="alert" hidden></p>' +
      "</div>";

    Array.prototype.forEach.call(body.querySelectorAll('input[name="sc-maths"]'), function (inp) {
      inp.addEventListener("change", function () {
        mathsLanguage = inp.value;
        refreshValidation();
      });
    });
    Array.prototype.forEach.call(body.querySelectorAll("input.sc-rank"), function (inp) {
      inp.addEventListener("input", function () {
        var code = inp.getAttribute("data-code");
        var raw = inp.value.trim();
        if (raw === "") delete ranks[code];
        else ranks[code] = raw;
        refreshValidation();
      });
    });
    var submit = $("sc-submit");
    if (submit) submit.addEventListener("click", onSubmit);
    refreshValidation();
  }

  function refreshValidation() {
    var issues = validateRanks(ranks);
    var live = $("sc-live");
    var submit = $("sc-submit");
    var open = isRoundOpen(roundRow);
    var canSubmit = open && issues.ok && !!mathsLanguage && identity.confirmed;
    if (submit) submit.disabled = !canSubmit || saving;
    if (live) {
      live.textContent = open ? validationMessage(issues) : deadlineStatusText(roundRow, true);
      live.classList.toggle("sc-ok", canSubmit);
    }
    Array.prototype.forEach.call(document.querySelectorAll("#sc-grid input.sc-rank"), function (inp) {
      var code = inp.getAttribute("data-code");
      var n = parseRank(inp.value);
      var clash = Object.prototype.hasOwnProperty.call(issues.clash, code);
      var invalid = issues.invalid.indexOf(code) !== -1 || (n != null && (!Number.isFinite(n) || n < 1 || n > 21));
      inp.classList.toggle("sc-rank-clash", clash || invalid);
      inp.classList.toggle("sc-rank-filled", !clash && !invalid && n != null);
      inp.setAttribute("aria-invalid", clash || invalid ? "true" : "false");
    });
  }

  async function onSubmit() {
    if (saving) return;
    var errEl = $("sc-form-err");
    if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
    var issues = validateRanks(ranks);
    if (!issues.ok || !mathsLanguage || !identity.confirmed) {
      refreshValidation();
      return;
    }
    if (!isRoundOpen(roundRow)) {
      if (errEl) { errEl.hidden = false; errEl.textContent = deadlineStatusText(roundRow, true); }
      return;
    }
    var session = getSession();
    var email = sessionEmail(session);
    var client = getClient();
    if (!client || !email) {
      if (errEl) { errEl.hidden = false; errEl.textContent = "請先以學校 Google 帳戶登入。"; }
      return;
    }
    var payloadRanks = {};
    subjects.forEach(function (s) {
      payloadRanks[s.code] = parseRank(ranks[s.code]);
    });
    var payload = {
      academic_year: ACADEMIC_YEAR,
      owner_email: email,
      class_code: identity.classCode,
      class_no: Number(identity.classNo),
      maths_language: mathsLanguage,
      ranks: payloadRanks
    };
    saving = true;
    refreshValidation();
    var submit = $("sc-submit");
    if (submit) submit.textContent = "正在儲存…";
    try {
      var res = await client
        .from("subject_choice_submissions")
        .upsert(payload, { onConflict: "academic_year,owner_email" })
        .select("id, academic_year, owner_email, student_id, class_code, class_no, chinese_name, english_name, maths_language, ranks, submitted_at, updated_at")
        .single();
      if (res.error) throw res.error;
      submission = res.data;
      applySubmissionToForm();
      var saved = $("sc-saved-msg");
      if (saved) {
        saved.textContent = "已成功儲存。最後儲存："
          + formatHkDateTime(submission.updated_at) + "。";
      }
      if (submit) submit.textContent = "更新選科";
    } catch (e) {
      if (errEl) { errEl.hidden = false; errEl.textContent = errText(e); }
      if (submit) submit.textContent = submission ? "更新選科" : "提交選科";
    } finally {
      saving = false;
      refreshValidation();
    }
  }

  async function loadStudent() {
    renderMessage("正在載入選科表格…");
    await loadCatalogue();
    await loadRoster();
    var email = sessionEmail(getSession());
    await loadOwnSubmission(email);
    if (submission) {
      applySubmissionToForm();
    } else {
      var matched = matchRosterByEmail(email);
      if (matched) {
        if (S3_CLASSES.indexOf(matched.class_code) === -1) {
          renderNotEligible();
          return;
        }
        identity.classCode = matched.class_code;
        identity.classNo = String(matched.class_no);
        identity.chineseName = matched.chinese_name || "";
        identity.englishName = matched.english_name || "";
        identity.studentId = matched.id;
        identity.confirmed = true;
        identity.autoMatched = true;
      }
    }
    renderStudentShell();
    renderIdentity();
    renderFormBody();
  }

  function renderNotEligible() {
    if (!root) return;
    root.innerHTML =
      '<div class="sc-wrap sc-student">' +
        '<header class="sc-hero">' +
          '<h2 class="sc-title">學生選科系統</h2>' +
        "</header>" +
        '<section class="sc-card">' +
          "<p>此表格只供 <strong>2026-2027 學年中三</strong>學生進行中四選科。</p>" +
          "<p>你的班別不在是次選科範圍。如有疑問，請聯絡班主任或學校行政。</p>" +
        "</section>" +
      "</div>";
  }

  function renderMessage(text) {
    if (!root) return;
    root.innerHTML = '<p class="muted sc-loading">' + escapeHtml(text) + "</p>";
  }

  function renderError(text) {
    if (!root) return;
    root.innerHTML = '<p class="sc-error" role="alert">' + escapeHtml(text) + "</p>";
  }

  /* —— Staff —— */

  var staffSubs = [];

  async function loadStaffData() {
    var client = getClient();
    await loadCatalogue();
    await loadRoster();
    var res = await client
      .from("subject_choice_submissions")
      .select("id, academic_year, owner_email, student_id, class_code, class_no, chinese_name, english_name, maths_language, ranks, submitted_at, updated_at")
      .eq("academic_year", ACADEMIC_YEAR)
      .order("class_code")
      .order("class_no");
    if (res.error) throw res.error;
    staffSubs = res.data || [];
  }

  function subByStudent(classCode, classNo) {
    for (var i = 0; i < staffSubs.length; i++) {
      if (staffSubs[i].class_code === classCode && staffSubs[i].class_no === classNo) {
        return staffSubs[i];
      }
    }
    return null;
  }

  function filteredRosterRows() {
    var f = staffFilter;
    return roster.filter(function (s) {
      if (f.classCode && s.class_code !== f.classCode) return false;
      var sub = subByStudent(s.class_code, s.class_no);
      if (f.status === "submitted" && !sub) return false;
      if (f.status === "pending" && sub) return false;
      if (f.maths) {
        if (!sub || sub.maths_language !== f.maths) return false;
      }
      return true;
    });
  }

  function firstChoiceCounts() {
    var counts = {};
    subjects.forEach(function (s) { counts[s.code] = 0; });
    staffSubs.forEach(function (sub) {
      var r = sub.ranks || {};
      subjects.forEach(function (s) {
        if (Number(r[s.code]) === 1) counts[s.code] += 1;
      });
    });
    return counts;
  }

  function renderStaff() {
    if (!root) return;
    var submittedN = staffSubs.length;
    var totalN = roster.length;
    var pendingN = Math.max(0, totalN - submittedN);
    var counts = firstChoiceCounts();
    var rows = filteredRosterRows();

    var classOpts = S3_CLASSES.map(function (c) {
      return '<option value="' + c + '"' + (staffFilter.classCode === c ? " selected" : "") + ">" + c + "</option>";
    }).join("");

    var firstHtml = ["x1", "x2", "x3"].map(function (block) {
      var meta = BLOCK_META[block];
      var items = subjectsByBlock(block).map(function (s) {
        return '<li><span class="sc-subj-name' + (s.is_apl ? " sc-apl" : "") + '">' +
          escapeHtml(s.display_name) + '</span><strong>' + (counts[s.code] || 0) + "</strong></li>";
      }).join("");
      return '<div class="sc-count-col sc-block-' + block + '">' +
        '<h4>' + escapeHtml(meta.title) + "</h4><ul>" + items + "</ul></div>";
    }).join("");

    var tableRows = rows.map(function (s) {
      var sub = subByStudent(s.class_code, s.class_no);
      var status = sub
        ? '<span class="sc-pill sc-pill-ok">已提交</span>'
        : '<span class="sc-pill sc-pill-wait">未提交</span>';
      var maths = sub ? (sub.maths_language === "英文" ? "英文修讀" : "中文修讀") : "—";
      var first = "—";
      if (sub && sub.ranks) {
        var top = null;
        subjects.forEach(function (subj) {
          if (Number(sub.ranks[subj.code]) === 1) top = subj.display_name;
        });
        if (top) first = top;
      }
      var when = sub ? formatHkDateTime(sub.updated_at || sub.submitted_at) : "—";
      var mail = sub ? escapeHtml(sub.owner_email) : "—";
      var del = sub
        ? '<button type="button" class="sc-text-btn" data-del="' + sub.id + '">刪除</button>'
        : "";
      return "<tr>" +
        "<td>" + escapeHtml(s.class_code) + "</td>" +
        "<td>" + escapeHtml(String(s.class_no)) + "</td>" +
        "<td>" + escapeHtml(s.chinese_name || "") +
          (s.english_name ? '<div class="muted sc-en">' + escapeHtml(s.english_name) + "</div>" : "") +
        "</td>" +
        "<td>" + status + "</td>" +
        "<td>" + escapeHtml(maths) + "</td>" +
        "<td>" + escapeHtml(first) + "</td>" +
        "<td class=\"sc-when\">" + escapeHtml(when) + "</td>" +
        "<td class=\"sc-mail\">" + mail + "</td>" +
        "<td>" + del + "</td>" +
      "</tr>";
    }).join("");

    if (!tableRows) {
      tableRows = '<tr><td colspan="9" class="muted">沒有符合篩選的學生。</td></tr>';
    }

    var deadlineInput = isoToHkLocalInput(roundRow && roundRow.deadline);
    root.innerHTML =
      '<div class="sc-wrap sc-staff">' +
        '<header class="sc-hero">' +
          '<h2 class="sc-title">學生選科系統</h2>' +
          '<p class="sc-subtitle">中三升中四選科 · 教職員管理</p>' +
          '<p class="sc-deadline" id="sc-staff-status">' + escapeHtml(deadlineStatusText(roundRow, false)) + "</p>" +
        "</header>" +
        '<section class="sc-card sc-settings" aria-label="選科設定">' +
          "<h3>學生填表網址</h3>" +
          '<p class="sc-hint">請將以下學生app連結轉發給中三同學。學生只在學生app填表，不會在本行政系統提交。</p>' +
          '<p class="sc-share-url"><a href="' + studentAppUrl() + '" id="sc-student-app-link">' + studentAppUrl() + "</a></p>" +
          '<p class="sc-settings-actions" style="margin-bottom:16px">' +
            '<button type="button" class="btn" id="sc-copy-student-url">複製連結</button>' +
            '<span class="sc-settings-msg" id="sc-copy-msg" role="status"></span>' +
          "</p>" +
          "<h3>改選限期與開關</h3>" +
          '<p class="sc-hint">限期以香港時間為準。未設定限期時，除非關閉表格，否則學生可隨時提交或更改。過了限期或關閉表格後，學生仍可查看已提交選擇，但不能再改選。</p>' +
          '<div class="sc-settings-row">' +
            '<label class="sc-field"><span>改選限期（香港時間）</span>' +
              '<input type="datetime-local" id="sc-deadline-input" value="' + escapeHtml(deadlineInput) + '">' +
            "</label>" +
            '<button type="button" class="sc-text-btn" id="sc-deadline-clear">清除限期</button>' +
          "</div>" +
          '<label class="sc-check"><input type="checkbox" id="sc-lock"' +
            ((roundRow && roundRow.locked) ? " checked" : "") + "> 關閉表格（學生不可再提交或改選）</label>" +
          '<div class="sc-settings-actions">' +
            '<button type="button" class="btn" id="sc-save-settings">儲存設定</button>' +
            '<span class="sc-settings-msg" id="sc-settings-msg" role="status"></span>' +
          "</div>" +
        "</section>" +
        '<section class="sc-card sc-summary" aria-label="提交概況">' +
          "<h3>提交概況</h3>" +
          '<p>中三名單 <strong>' + totalN + "</strong> 人，已提交 <strong>" + submittedN +
            "</strong>，未提交 <strong>" + pendingN + "</strong>。</p>" +
          '<h4 class="sc-count-title">各科第一志願人數</h4>' +
          '<div class="sc-counts">' + firstHtml + "</div>" +
        "</section>" +
        '<section class="sc-card sc-list" aria-label="學生提交名單">' +
          '<div class="sc-list-head">' +
            "<h3>學生名單</h3>" +
            '<button type="button" class="btn" id="sc-export">匯出 CSV</button>' +
          "</div>" +
          '<div class="sc-filters">' +
            '<label>班別 <select id="sc-filter-class">' +
              '<option value="">全部</option>' + classOpts +
            "</select></label>" +
            '<label>數學語言 <select id="sc-filter-maths">' +
              '<option value="">全部</option>' +
              '<option value="中文"' + (staffFilter.maths === "中文" ? " selected" : "") + ">中文修讀</option>" +
              '<option value="英文"' + (staffFilter.maths === "英文" ? " selected" : "") + ">英文修讀</option>" +
            "</select></label>" +
            '<label>狀態 <select id="sc-filter-status">' +
              '<option value="">全部</option>' +
              '<option value="submitted"' + (staffFilter.status === "submitted" ? " selected" : "") + ">已提交</option>" +
              '<option value="pending"' + (staffFilter.status === "pending" ? " selected" : "") + ">未提交</option>" +
            "</select></label>" +
            '<span class="muted">顯示 ' + rows.length + " 人</span>" +
          "</div>" +
          '<div class="sc-table-wrap">' +
            '<table class="sc-admin-table">' +
              "<thead><tr>" +
                "<th>班別</th><th>學號</th><th>姓名</th><th>狀態</th><th>數學語言</th>" +
                "<th>第一志願</th><th>最後儲存</th><th>提交帳戶</th><th></th>" +
              "</tr></thead>" +
              "<tbody>" + tableRows + "</tbody>" +
            "</table>" +
          "</div>" +
          '<p class="sc-hint">如學生填錯他人學號，可刪除該提交讓正確學生重新填寫。刪除後無法復原。</p>' +
        "</section>" +
        '<section class="sc-card sc-rank-detail" id="sc-rank-detail" hidden></section>' +
      "</div>";

    $("sc-deadline-clear") && $("sc-deadline-clear").addEventListener("click", function () {
      var inp = $("sc-deadline-input");
      if (inp) inp.value = "";
    });
    var copyBtn = $("sc-copy-student-url");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var url = studentAppUrl();
        var done = function () {
          var msg = $("sc-copy-msg");
          if (msg) msg.textContent = "已複製學生app連結。";
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done).catch(function () {
            window.prompt("請複製學生app連結：", url);
          });
        } else {
          window.prompt("請複製學生app連結：", url);
        }
      });
    }
    $("sc-save-settings") && $("sc-save-settings").addEventListener("click", saveSettings);
    $("sc-export") && $("sc-export").addEventListener("click", exportCsv);
    ["sc-filter-class", "sc-filter-maths", "sc-filter-status"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener("change", function () {
        staffFilter.classCode = ($("sc-filter-class") || {}).value || "";
        staffFilter.maths = ($("sc-filter-maths") || {}).value || "";
        staffFilter.status = ($("sc-filter-status") || {}).value || "";
        renderStaff();
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll("[data-del]"), function (btn) {
      btn.addEventListener("click", function () {
        var id = Number(btn.getAttribute("data-del"));
        deleteSubmission(id);
      });
    });
  }

  async function saveSettings() {
    if (staffSaving) return;
    var msg = $("sc-settings-msg");
    var client = getClient();
    if (!client || !roundRow) {
      if (msg) msg.textContent = "未能連線或尚未載入回合設定。";
      return;
    }
    var raw = (($("sc-deadline-input") || {}).value || "").trim();
    var deadline = raw ? hkLocalInputToIso(raw) : null;
    if (raw && !deadline) {
      if (msg) msg.textContent = "限期格式不正確。";
      return;
    }
    var locked = !!($("sc-lock") && $("sc-lock").checked);
    staffSaving = true;
    if (msg) msg.textContent = "正在儲存…";
    try {
      var res = await client
        .from("subject_choice_rounds")
        .update({ deadline: deadline, locked: locked })
        .eq("academic_year", ACADEMIC_YEAR)
        .select("academic_year, title, locked, deadline, updated_at, updated_by_email")
        .single();
      if (res.error) throw res.error;
      roundRow = res.data;
      if (msg) msg.textContent = "已儲存設定。";
      renderStaff();
      var after = $("sc-settings-msg");
      if (after) after.textContent = "已儲存設定。";
    } catch (e) {
      if (msg) msg.textContent = errText(e);
    } finally {
      staffSaving = false;
    }
  }

  async function deleteSubmission(id) {
    if (!id) return;
    var row = null;
    staffSubs.forEach(function (s) { if (s.id === id) row = s; });
    var label = row ? (row.class_code + " " + row.class_no + " " + (row.chinese_name || "")) : "";
    if (!window.confirm("確定刪除「" + label + "」的選科提交？刪除後無法復原。")) return;
    var client = getClient();
    var res = await client.from("subject_choice_submissions").delete().eq("id", id);
    if (res.error) {
      window.alert(errText(res.error));
      return;
    }
    await loadStaffData();
    renderStaff();
  }

  function csvCell(v) {
    var s = String(v == null ? "" : v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function exportCsv() {
    var rows = filteredRosterRows();
    var cols = ["班別", "學號", "中文姓名", "英文姓名", "狀態", "數學語言", "提交帳戶", "首次提交", "最後儲存"];
    subjects.slice().sort(function (a, b) {
      if (a.block !== b.block) return a.block < b.block ? -1 : 1;
      return a.sort_order - b.sort_order;
    }).forEach(function (s) {
      var prefix = s.block.toUpperCase() + " ";
      cols.push(prefix + s.display_name);
    });
    var lines = [cols.map(csvCell).join(",")];
    rows.forEach(function (s) {
      var sub = subByStudent(s.class_code, s.class_no);
      var line = [
        s.class_code,
        s.class_no,
        s.chinese_name || "",
        s.english_name || "",
        sub ? "已提交" : "未提交",
        sub ? (sub.maths_language === "英文" ? "英文修讀" : "中文修讀") : "",
        sub ? sub.owner_email : "",
        sub ? formatHkDateTime(sub.submitted_at) : "",
        sub ? formatHkDateTime(sub.updated_at) : ""
      ];
      subjects.slice().sort(function (a, b) {
        if (a.block !== b.block) return a.block < b.block ? -1 : 1;
        return a.sort_order - b.sort_order;
      }).forEach(function (subj) {
        line.push(sub && sub.ranks && sub.ranks[subj.code] != null ? sub.ranks[subj.code] : "");
      });
      lines.push(line.map(csvCell).join(","));
    });
    var blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "中三選科_" + ACADEMIC_YEAR + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }

  function renderStudentRedirect() {
    if (!root) return;
    var url = studentAppUrl();
    root.innerHTML =
      '<div class="sc-wrap sc-student">' +
        '<header class="sc-hero">' +
          '<h2 class="sc-title">學生選科系統</h2>' +
          '<p class="sc-subtitle">請前往學生app填寫</p>' +
        "</header>" +
        '<section class="sc-card" aria-label="前往學生app">' +
          "<p>中三升中四選科已改為在獨立的<strong>學生app</strong>填寫，學校行政系統不再接受學生提交，以免兩邊重複。</p>" +
          "<p>請用學校 Google 帳戶（@g.lwfss.edu.hk）登入學生app，選擇班別與學號後填上 1 至 21 優次，並選擇來年數學科修讀語言。</p>" +
          '<p class="sc-actions" style="text-align:left;margin-top:12px">' +
            '<a class="btn" id="sc-open-student-app" href="' + url + '">前往學生app填寫選科</a>' +
          "</p>" +
          '<p class="muted">網址：<a href="' + url + '">' + url + "</a></p>" +
        "</section>" +
      "</div>";
  }

  async function show() {
    root = $("subject-choice-root");
    if (!root) return;
    var session = getSession();
    if (!session) {
      renderMessage("請先登入。");
      return;
    }
    if (!canUseCloud(session)) {
      renderError("選科系統需要以學校 Google 帳戶（@g.lwfss.edu.hk）登入後使用。");
      return;
    }
    if (loading) return;
    loading = true;
    try {
      if (session.role === "staff") {
        await loadStaffData();
        renderStaff();
      } else {
        renderStudentRedirect();
      }
      loaded = true;
    } catch (e) {
      renderError(errText(e) || "載入選科系統時發生錯誤。");
    } finally {
      loading = false;
    }
  }

  function gotoFromTimetable() {
    if (window.SchoolAdminHome && typeof window.SchoolAdminHome.switchPanel === "function") {
      window.SchoolAdminHome.switchPanel("subject-choice");
      return;
    }
    var tab = $("home-tab-subject-choice");
    if (tab) tab.click();
  }

  window.SchoolAdminSubjectChoice = {
    show: show,
    go: gotoFromTimetable
  };
})();
