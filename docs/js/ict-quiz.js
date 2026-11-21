(function () {
  "use strict";

  var STORE_PREFIX = "lwfss-ict-quiz-v1:";
  var papers = [];
  var questionsByPaper = {};
  var papersLoaded = false;
  var loadingPapers = false;
  var assetCache = {}; // path -> { mime, fileName, objectUrl, byteSize }
  var view = { mode: "list", paperId: "", no: 1 };
  var statusMsg = "";

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

  function canUseQuiz(session) {
    if (!session || session.method !== "supabase") return false;
    var email = (session.email || "").toLowerCase();
    if (!email) return false;
    if (window.SchoolAdminAuth && SchoolAdminAuth.emailAllowed) {
      return SchoolAdminAuth.emailAllowed(email);
    }
    return /@g\.lwfss\.edu\.hk$/i.test(email);
  }

  function storeKey() {
    var session = getSession();
    var email = session && session.email ? String(session.email).toLowerCase() : "anon";
    return STORE_PREFIX + email;
  }

  function loadStore() {
    try {
      var raw = localStorage.getItem(storeKey());
      return raw ? JSON.parse(raw) : { answers: {} };
    } catch (e) {
      return { answers: {} };
    }
  }

  function saveStore(s) {
    try { localStorage.setItem(storeKey(), JSON.stringify(s)); } catch (e) { /* ignore */ }
  }

  function answersOf(pid) {
    var store = loadStore();
    if (!store.answers[pid]) store.answers[pid] = {};
    return store.answers[pid];
  }

  function setAnswer(pid, no, key) {
    var store = loadStore();
    if (!store.answers[pid]) store.answers[pid] = {};
    if (store.answers[pid][no]) return store.answers[pid][no];
    store.answers[pid][no] = key;
    saveStore(store);
    return key;
  }

  function clearAnswers(pid) {
    var store = loadStore();
    store.answers[pid] = {};
    saveStore(store);
  }

  function progress(paper) {
    var qs = questionsByPaper[paper.id] || [];
    var a = loadStore().answers[paper.id] || {};
    var n = 0;
    var correct = 0;
    qs.forEach(function (q) {
      if (a[q.no]) {
        n += 1;
        if (a[q.no] === q.answer) correct += 1;
      }
    });
    return { n: n, total: qs.length || paper.question_count || 0, correct: correct };
  }

  function paperById(id) {
    for (var i = 0; i < papers.length; i++) {
      if (papers[i].id === id) return papers[i];
    }
    return null;
  }

  function mapPaper(row) {
    return {
      id: row.id,
      yearLabel: row.year_label,
      yearSort: row.year_sort,
      title: row.title,
      shortTitle: row.short_title,
      navSubject: row.nav_subject,
      navPaper: row.nav_paper,
      paper: row.paper,
      section: row.section,
      official: !!row.official,
      questionCount: row.question_count,
      pdfPath: row.pdf_path,
      pdfLabel: row.pdf_label,
      note: row.note,
      source: row.source,
      answerSource: row.answer_source
    };
  }

  function mapQuestion(row) {
    return {
      no: row.no,
      answer: row.answer,
      stemHtml: row.stem_html,
      options: row.options || [],
      layout: row.layout || "",
      headers: row.headers || null,
      sourceNote: row.source_note || ""
    };
  }

  function setStatus(msg) {
    statusMsg = msg || "";
    var el = $("ict-quiz-status");
    if (el) el.textContent = statusMsg;
  }

  function loadPapers() {
    if (papersLoaded) return Promise.resolve(true);
    if (loadingPapers) return loadingPapers;
    var client = getClient();
    if (!client) {
      setStatus("尚未連上資料庫。");
      return Promise.resolve(false);
    }
    setStatus("載入試卷目錄…");
    loadingPapers = client
      .from("ict_quiz_papers")
      .select("id,year_label,year_sort,title,short_title,nav_subject,nav_paper,paper,section,official,question_count,pdf_path,pdf_label,note,source,answer_source")
      .order("year_sort", { ascending: true })
      .then(function (result) {
        loadingPapers = null;
        if (result && result.error) {
          setStatus("未能載入題庫：" + (result.error.message || result.error));
          return false;
        }
        papers = (result.data || []).map(mapPaper);
        papersLoaded = true;
        setStatus("");
        return true;
      })
      .catch(function (e) {
        loadingPapers = null;
        setStatus("未能載入題庫：" + (e && e.message ? e.message : e));
        return false;
      });
    return loadingPapers;
  }

  function loadQuestions(paperId) {
    if (questionsByPaper[paperId]) return Promise.resolve(questionsByPaper[paperId]);
    var client = getClient();
    if (!client) return Promise.resolve([]);
    setStatus("載入題目…");
    return client
      .from("ict_quiz_questions")
      .select("paper_id,no,answer,stem_html,options,layout,headers,source_note")
      .eq("paper_id", paperId)
      .order("no", { ascending: true })
      .then(function (result) {
        if (result && result.error) {
          setStatus("未能載入題目：" + (result.error.message || result.error));
          return [];
        }
        var list = (result.data || []).map(mapQuestion);
        questionsByPaper[paperId] = list;
        setStatus("");
        return list;
      })
      .catch(function (e) {
        setStatus("未能載入題目：" + (e && e.message ? e.message : e));
        return [];
      });
  }

  function decodeBase64(b64) {
    var bin = atob(b64);
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function loadAssets(paths) {
    var missing = [];
    var i;
    for (i = 0; i < paths.length; i++) {
      if (paths[i] && !assetCache[paths[i]]) missing.push(paths[i]);
    }
    if (!missing.length) return Promise.resolve();
    var client = getClient();
    if (!client) return Promise.resolve();
    return client
      .from("ict_quiz_assets")
      .select("path,mime_type,file_name,content_base64,byte_size")
      .in("path", missing)
      .then(function (result) {
        if (result && result.error) {
          setStatus("未能載入附圖：" + (result.error.message || result.error));
          return;
        }
        (result.data || []).forEach(function (row) {
          try {
            var bytes = decodeBase64(row.content_base64);
            var blob = new Blob([bytes], { type: row.mime_type || "application/octet-stream" });
            if (assetCache[row.path] && assetCache[row.path].objectUrl) {
              try { URL.revokeObjectURL(assetCache[row.path].objectUrl); } catch (e) { /* ignore */ }
            }
            assetCache[row.path] = {
              mime: row.mime_type,
              fileName: row.file_name,
              objectUrl: URL.createObjectURL(blob),
              byteSize: row.byte_size
            };
          } catch (e) { /* ignore a bad asset */ }
        });
      })
      .catch(function () { /* ignore */ });
  }

  function collectImagePaths(html) {
    var paths = [];
    var re = /(?:src|data-ict-asset)=["'](images\/[^"']+)["']/g;
    var m;
    var text = String(html || "");
    while ((m = re.exec(text))) {
      if (paths.indexOf(m[1]) < 0) paths.push(m[1]);
    }
    return paths;
  }

  function rewriteStem(html) {
    return String(html || "").replace(/src="(images\/[^"]+)"/g, function (_, path) {
      var asset = assetCache[path];
      if (asset && asset.objectUrl) {
        return 'src="' + asset.objectUrl + '" data-ict-asset="' + path + '"';
      }
      return 'src="" data-ict-asset="' + path + '" alt="載入附圖中"';
    });
  }

  function optionLabel(q, opt) {
    if (q.layout === "two-col" && opt.cells && opt.cells.length) {
      return '<div class="ict-quiz-opt-cells"><span>' + opt.cells[0] + "</span><span>" + opt.cells[1] + "</span></div>";
    }
    return opt.html || "";
  }

  function renderGate() {
    var root = $("ict-quiz-root");
    if (!root) return;
    root.innerHTML =
      '<div class="ict-quiz-card">' +
        '<h2 class="home-panel-title">ICT 題庫</h2>' +
        '<p class="muted">請先用學校 Google 帳戶（@g.lwfss.edu.hk）登入，先可以練習官方樣本試卷同練習卷選擇題。</p>' +
      "</div>";
  }

  function renderList() {
    var root = $("ict-quiz-root");
    if (!root) return;
    var cards = papers
      .slice()
      .sort(function (a, b) { return a.yearSort - b.yearSort; })
      .map(function (p) {
        var pr = progress(p);
        var total = pr.total || p.questionCount || 0;
        var pct = total ? Math.round((pr.n / total) * 100) : 0;
        var start = pr.n && pr.n < total ? pr.n + 1 : 1;
        return (
          '<button type="button" class="ict-quiz-paper-card" data-paper="' + escapeHtml(p.id) + '" data-start="' + start + '">' +
            "<h3>" + escapeHtml(p.shortTitle) + " " + escapeHtml(p.section || "") +
              (p.official ? '<span class="ict-quiz-badge">官方評卷參考</span>' : "") +
            "</h3>" +
            '<div class="ict-quiz-paper-meta">' + escapeHtml(p.yearLabel) + " · " + total + " 題" +
              (pr.n ? " · 已作答 " + pr.n + "/" + total + "（答對 " + pr.correct + "）" : "") +
            "</div>" +
            (p.note ? '<div class="ict-quiz-paper-note">' + escapeHtml(p.note) + "</div>" : "") +
            '<div class="ict-quiz-prog" aria-hidden="true"><span style="width:' + pct + '%"></span></div>' +
          "</button>"
        );
      })
      .join("");
    root.innerHTML =
      '<div class="ict-quiz-card">' +
        '<h2 class="home-panel-title">ICT 題庫</h2>' +
        '<p class="muted ict-quiz-hint">以香港考試及評核局樣本試卷、練習卷甲部選擇題作校本練習。撳 A–D 後即時顯示對錯與官方答案。試題版權屬考評局，僅供已登入的本校師生使用。</p>' +
        '<p id="ict-quiz-status" class="muted ict-quiz-status">' + escapeHtml(statusMsg) + "</p>" +
        (cards || '<p class="muted">題庫尚未匯入。</p>') +
        '<p class="ict-quiz-copy">試題及評卷參考版權屬香港考試及評核局。不得公開轉載或作商業用途。</p>' +
      "</div>";
    Array.prototype.forEach.call(root.querySelectorAll("[data-paper]"), function (btn) {
      btn.addEventListener("click", function () {
        openPaper(btn.getAttribute("data-paper"), parseInt(btn.getAttribute("data-start"), 10) || 1);
      });
    });
  }

  function renderQuestion(paper, no) {
    var root = $("ict-quiz-root");
    if (!root || !paper) return;
    var qs = questionsByPaper[paper.id] || [];
    var total = qs.length;
    if (!total) {
      root.innerHTML =
        '<div class="ict-quiz-card">' +
          '<p id="ict-quiz-status" class="muted ict-quiz-status">' + escapeHtml(statusMsg || "沒有題目。") + "</p>" +
          '<button type="button" class="ict-quiz-text-btn" id="ict-quiz-back">返回目錄</button>' +
        "</div>";
      var back0 = $("ict-quiz-back");
      if (back0) back0.addEventListener("click", function () { view.mode = "list"; render(); });
      return;
    }
    var idx = Math.min(Math.max(1, no), total);
    view.no = idx;
    var q = qs[idx - 1];
    var chosen = (loadStore().answers[paper.id] || {})[q.no] || null;
    var locked = !!chosen;
    var optsHtml = q.options.map(function (opt) {
      var cls = "ict-quiz-opt";
      if (locked) {
        cls += " locked";
        if (opt.key === q.answer) cls += " correct";
        else if (opt.key === chosen) cls += " wrong";
      }
      return (
        '<button type="button" class="' + cls + '" data-key="' + escapeHtml(opt.key) + '"' + (locked ? " disabled" : "") + ">" +
          '<span class="letter">' + escapeHtml(opt.key) + "</span>" +
          '<span class="ict-quiz-opt-body">' + optionLabel(q, opt) + "</span>" +
        "</button>"
      );
    }).join("");
    var fb = "";
    if (locked) {
      fb = chosen === q.answer
        ? '<div class="ict-quiz-feedback ok">正確</div>'
        : '<div class="ict-quiz-feedback no">不正確。正確答案為 ' + escapeHtml(q.answer) + "。</div>";
    }
    var twoHead = q.layout === "two-col" && q.headers
      ? '<div class="ict-quiz-two-head"><span>' + q.headers[0] + "</span><span>" + q.headers[1] + "</span></div>"
      : "";
    var intro = idx === 1 && paper.note ? '<p class="ict-quiz-paper-note">' + escapeHtml(paper.note) + "</p>" : "";
    var stem = rewriteStem(q.stemHtml);
    root.innerHTML =
      '<div class="ict-quiz-card ict-quiz-qcard">' +
        '<div class="ict-quiz-toolbar">' +
          '<button type="button" class="ict-quiz-text-btn" id="ict-quiz-back">← 目錄</button>' +
          '<div class="ict-quiz-toolbar-title">' +
            '<div class="ict-quiz-kicker">' + escapeHtml(paper.navSubject || "資訊及通訊科技") + "</div>" +
            '<div class="ict-quiz-paper-name">' + escapeHtml(paper.navPaper || paper.shortTitle) + " Q" + q.no + "</div>" +
          "</div>" +
          (paper.pdfPath
            ? '<button type="button" class="ict-quiz-dl" id="ict-quiz-dl">全卷下載</button>'
            : '<span class="ict-quiz-dl-ph"></span>') +
        "</div>" +
        (q.sourceNote ? '<div class="ict-quiz-source">' + escapeHtml(q.sourceNote) + "</div>" : "") +
        '<div class="ict-quiz-stem">' + stem + "</div>" +
        '<div class="ict-quiz-mode">撳選項練習</div>' +
        twoHead +
        '<div class="ict-quiz-opts" id="ict-quiz-opts">' + optsHtml + "</div>" +
        fb +
        intro +
        '<p id="ict-quiz-status" class="muted ict-quiz-status">' + escapeHtml(statusMsg) + "</p>" +
        '<nav class="ict-quiz-nav">' +
          '<button type="button" class="ict-quiz-nav-btn" id="ict-quiz-prev"' + (idx === 1 ? " disabled" : "") + ">← 上一題</button>" +
          '<button type="button" class="ict-quiz-jump" id="ict-quiz-jump">' + idx + " / " + total + "　第" + idx + "題 <span class=\"chev\">▾</span></button>" +
          '<button type="button" class="ict-quiz-nav-btn" id="ict-quiz-next">' + (idx === total ? "完成" : "下一題 →") + "</button>" +
        "</nav>" +
        '<p class="ict-quiz-copy">試題及評卷參考版權屬香港考試及評核局。</p>' +
      "</div>";

    if (!locked) {
      Array.prototype.forEach.call(root.querySelectorAll(".ict-quiz-opt"), function (btn) {
        btn.addEventListener("click", function () {
          var key = btn.getAttribute("data-key");
          if (!key) return;
          setAnswer(paper.id, q.no, key);
          renderQuestion(paper, idx);
        });
      });
    }
    var back = $("ict-quiz-back");
    if (back) back.addEventListener("click", function () { view.mode = "list"; render(); });
    var prev = $("ict-quiz-prev");
    if (prev) prev.addEventListener("click", function () { if (idx > 1) { view.no = idx - 1; renderQuestion(paper, idx - 1); } });
    var next = $("ict-quiz-next");
    if (next) next.addEventListener("click", function () {
      if (idx === total) { view.mode = "end"; renderEnd(paper); }
      else { view.no = idx + 1; renderQuestion(paper, idx + 1); }
    });
    var jump = $("ict-quiz-jump");
    if (jump) jump.addEventListener("click", function () { openPicker(paper, idx); });
    var dl = $("ict-quiz-dl");
    if (dl) dl.addEventListener("click", function () { downloadPdf(paper, dl); });
  }

  function renderEnd(paper) {
    var root = $("ict-quiz-root");
    if (!root || !paper) return;
    var qs = questionsByPaper[paper.id] || [];
    var pr = progress(paper);
    var a = loadStore().answers[paper.id] || {};
    var wrong = qs.filter(function (q) { return a[q.no] && a[q.no] !== q.answer; });
    var unanswered = qs.filter(function (q) { return !a[q.no]; });
    var wrongList = wrong.length === 0
      ? "<p>沒有答錯的題目。</p>"
      : "<p>答錯題號：" + wrong.map(function (q) {
          return '<button type="button" class="ict-quiz-inline" data-no="' + q.no + '">' + q.no + "</button>";
        }).join("、") + "。</p>";
    var miss = unanswered.length === 0
      ? ""
      : "<p>尚未作答：" + unanswered.map(function (q) {
          return '<button type="button" class="ict-quiz-inline" data-no="' + q.no + '">' + q.no + "</button>";
        }).join("、") + "。</p>";
    root.innerHTML =
      '<div class="ict-quiz-card">' +
        '<div class="ict-quiz-toolbar">' +
          '<button type="button" class="ict-quiz-text-btn" id="ict-quiz-back">← 目錄</button>' +
          '<div class="ict-quiz-toolbar-title">' +
            '<div class="ict-quiz-kicker">' + escapeHtml(paper.navSubject || "資訊及通訊科技") + "</div>" +
            '<div class="ict-quiz-paper-name">' + escapeHtml(paper.navPaper || paper.shortTitle) + "</div>" +
          "</div>" +
          (paper.pdfPath
            ? '<button type="button" class="ict-quiz-dl" id="ict-quiz-dl">全卷下載</button>'
            : '<span class="ict-quiz-dl-ph"></span>') +
        "</div>" +
        '<div class="ict-quiz-end-score"><div class="big">' + pr.correct + "/" + pr.total + "</div>" +
          "<p>已作答 " + pr.n + " 題，答對 " + pr.correct + " 題</p></div>" +
        wrongList + miss +
        '<div class="ict-quiz-actions">' +
          '<button type="button" class="ict-quiz-nav-btn" id="ict-quiz-back-2">返回目錄</button>' +
          '<button type="button" class="ict-quiz-nav-btn ict-quiz-primary" id="ict-quiz-retry">重新作答</button>' +
        "</div>" +
        '<p class="ict-quiz-copy">試題及評卷參考版權屬香港考試及評核局。</p>' +
      "</div>";
    function goList() { view.mode = "list"; render(); }
    var back = $("ict-quiz-back");
    var back2 = $("ict-quiz-back-2");
    if (back) back.addEventListener("click", goList);
    if (back2) back2.addEventListener("click", goList);
    var retry = $("ict-quiz-retry");
    if (retry) retry.addEventListener("click", function () {
      if (window.confirm("清除本卷作答記錄並從頭開始？")) {
        clearAnswers(paper.id);
        view.mode = "question";
        view.no = 1;
        renderQuestion(paper, 1);
      }
    });
    Array.prototype.forEach.call(root.querySelectorAll("[data-no]"), function (b) {
      b.addEventListener("click", function () {
        view.mode = "question";
        view.no = parseInt(b.getAttribute("data-no"), 10) || 1;
        renderQuestion(paper, view.no);
      });
    });
    var dl = $("ict-quiz-dl");
    if (dl) dl.addEventListener("click", function () { downloadPdf(paper, dl); });
  }

  function openPicker(paper, current) {
    var existing = document.getElementById("ict-quiz-overlay");
    if (existing) existing.remove();
    var qs = questionsByPaper[paper.id] || [];
    var a = loadStore().answers[paper.id] || {};
    var buttons = qs.map(function (q) {
      var cls = "";
      if (q.no === current) cls += " current";
      if (a[q.no]) cls += a[q.no] === q.answer ? " ok" : " bad";
      return '<button type="button" class="' + cls.trim() + '" data-no="' + q.no + '">' + q.no + "</button>";
    }).join("");
    var overlay = document.createElement("div");
    overlay.id = "ict-quiz-overlay";
    overlay.className = "ict-quiz-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "跳至題目");
    overlay.innerHTML = '<div class="ict-quiz-sheet"><h3>跳至題目</h3><div class="ict-quiz-qgrid">' + buttons + "</div></div>";
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.remove();
    });
    Array.prototype.forEach.call(overlay.querySelectorAll("button[data-no]"), function (b) {
      b.addEventListener("click", function () {
        view.mode = "question";
        view.no = parseInt(b.getAttribute("data-no"), 10) || 1;
        overlay.remove();
        renderQuestion(paper, view.no);
      });
    });
    document.body.appendChild(overlay);
  }

  function downloadPdf(paper, btn) {
    if (!paper || !paper.pdfPath) return;
    var label = (btn && btn.textContent) || "全卷下載";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "準備檔案…";
    }
    loadAssets([paper.pdfPath]).then(function () {
      var asset = assetCache[paper.pdfPath];
      if (!asset || !asset.objectUrl) {
        setStatus("未能下載官方試卷 PDF。");
        if (btn) { btn.disabled = false; btn.textContent = label; }
        return;
      }
      var a = document.createElement("a");
      a.href = asset.objectUrl;
      a.download = asset.fileName || "HKDSE-ICT-Paper1.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (btn) { btn.disabled = false; btn.textContent = label; }
    });
  }

  function openPaper(paperId, startNo) {
    var paper = paperById(paperId);
    if (!paper) return;
    view.mode = "question";
    view.paperId = paperId;
    view.no = startNo || 1;
    loadQuestions(paperId).then(function (qs) {
      var paths = [];
      (qs || []).forEach(function (q) {
        collectImagePaths(q.stemHtml).forEach(function (p) {
          if (paths.indexOf(p) < 0) paths.push(p);
        });
      });
      return loadAssets(paths);
    }).then(function () {
      renderQuestion(paperById(paperId), view.no);
    });
  }

  function render() {
    var session = getSession();
    if (!canUseQuiz(session)) {
      renderGate();
      return;
    }
    if (!papersLoaded) {
      var root = $("ict-quiz-root");
      if (root && view.mode === "list") {
        root.innerHTML =
          '<div class="ict-quiz-card">' +
            '<h2 class="home-panel-title">ICT 題庫</h2>' +
            '<p id="ict-quiz-status" class="muted ict-quiz-status">' + escapeHtml(statusMsg || "載入試卷目錄…") + "</p>" +
          "</div>";
      }
      loadPapers().then(function () { render(); });
      return;
    }
    if (view.mode === "question") {
      var p = paperById(view.paperId);
      if (!p) { view.mode = "list"; renderList(); return; }
      if (!questionsByPaper[p.id]) {
        openPaper(p.id, view.no);
        return;
      }
      renderQuestion(p, view.no);
      return;
    }
    if (view.mode === "end") {
      var p2 = paperById(view.paperId);
      if (!p2) { view.mode = "list"; renderList(); return; }
      renderEnd(p2);
      return;
    }
    renderList();
  }

  function show() {
    render();
  }

  function resetOnSignOut() {
    papers = [];
    questionsByPaper = {};
    papersLoaded = false;
    loadingPapers = false;
    Object.keys(assetCache).forEach(function (k) {
      if (assetCache[k] && assetCache[k].objectUrl) {
        try { URL.revokeObjectURL(assetCache[k].objectUrl); } catch (e) { /* ignore */ }
      }
    });
    assetCache = {};
    view = { mode: "list", paperId: "", no: 1 };
    var overlay = document.getElementById("ict-quiz-overlay");
    if (overlay) overlay.remove();
  }

  document.addEventListener("schooladmin:authed", function () {
    // Keep cached data for a valid session; drop it if the new session cannot use the quiz.
    if (!canUseQuiz(getSession())) resetOnSignOut();
  });

  window.SchoolAdminIctQuiz = {
    show: show
  };
})();
