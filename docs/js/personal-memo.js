(function () {
  "use strict";

  var BODY_MAX = 2000;
  var PREVIEW_MAX = 80;
  var LIST_PREVIEW_MAX = 60;
  var WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

  /** Sticky top shows memo for browse/today date. */
  var stickyDate = "";
  var stickyBody = "";
  var stickyKey = ""; // email|date

  /** Panel editor state. */
  var editDate = "";
  var editBody = "";
  var editExists = false;
  var editKey = "";
  var saving = false;
  var loadingEdit = false;

  /** Cached list of own memos (newest date first). */
  var memoList = [];
  var listLoadedFor = ""; // email
  var listLoading = false;

  function $(id) { return document.getElementById(id); }

  function pad2(n) { return String(n).padStart(2, "0"); }

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
      var t = new Date(d.getTime() + 8 * 3600 * 1000);
      return t.getUTCFullYear() + "-" + pad2(t.getUTCMonth() + 1) + "-" + pad2(t.getUTCDate());
    }
  }

  function getSession() {
    return (window.SchoolAdminAuth && SchoolAdminAuth.getSession()) || window.__schoolAdminSession || null;
  }

  function getClient() {
    var auth = window.SchoolAdminAuth;
    return (auth && auth.getClient && auth.getClient()) || window.__supabaseClient || null;
  }

  function canUseMemo(session) {
    if (!session || session.method !== "supabase") return false;
    var email = (session.email || "").toLowerCase();
    if (!email) return false;
    if (window.SchoolAdminAuth && SchoolAdminAuth.emailAllowed) {
      return SchoolAdminAuth.emailAllowed(email);
    }
    return /@g\.lwfss\.edu\.hk$/i.test(email);
  }

  function compactPreview(text, maxLen) {
    maxLen = maxLen || PREVIEW_MAX;
    var t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return "";
    if (t.length <= maxLen) return t;
    return t.slice(0, maxLen - 1) + "…";
  }

  function formatMemoDate(iso) {
    var parts = String(iso || "").split("-").map(function (x) { return parseInt(x, 10); });
    if (parts.length !== 3 || !parts[0]) return iso || "";
    var dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 4, 0, 0));
    var wd = WEEKDAYS[dt.getUTCDay()];
    return parts[0] + "年" + parts[1] + "月" + parts[2] + "日（週" + wd + "）";
  }

  function normalizeDate(val) {
    if (!val) return "";
    var s = String(val);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return s;
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

  function setStatus(msg, isErr) {
    var el = $("memo-status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("is-err", !!isErr);
  }

  function emptyStickyLabel(iso) {
    return iso === todayHK() ? "今日未有備忘" : "是日未有備忘";
  }

  function renderSticky() {
    var wrap = $("home-memo");
    var preview = $("home-memo-preview");
    var empty = $("home-memo-empty");
    var session = getSession();
    if (!wrap) return;

    if (!canUseMemo(session)) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;

    var previewText = compactPreview(stickyBody);
    if (previewText) {
      if (preview) {
        preview.textContent = previewText;
        preview.hidden = false;
        preview.title = stickyBody.replace(/\s+/g, " ").trim();
      }
      if (empty) empty.hidden = true;
    } else {
      if (preview) {
        preview.textContent = "";
        preview.hidden = true;
        preview.removeAttribute("title");
      }
      if (empty) {
        empty.textContent = emptyStickyLabel(stickyDate || browseDateFromHome());
        empty.hidden = false;
      }
    }
  }

  function fetchMemo(email, iso) {
    var client = getClient();
    if (!client) return Promise.resolve({ body: "", exists: false, error: "尚未連上雲端" });
    return client
      .from("personal_memos")
      .select("owner_email,memo_date,body,updated_at")
      .eq("owner_email", email)
      .eq("memo_date", iso)
      .maybeSingle()
      .then(function (res) {
        if (res && res.error) {
          return { body: "", exists: false, error: res.error.message || "讀取失敗" };
        }
        if (res && res.data) {
          return {
            body: res.data.body != null ? String(res.data.body) : "",
            exists: true,
            error: ""
          };
        }
        return { body: "", exists: false, error: "" };
      })
      .catch(function (e) {
        return { body: "", exists: false, error: e && e.message ? e.message : String(e) };
      });
  }

  function setListMeta(msg) {
    var el = $("memo-list-meta");
    if (el) el.textContent = msg || "";
  }

  function renderMemoList() {
    var box = $("memo-list");
    if (!box) return;
    var session = getSession();
    if (!canUseMemo(session)) {
      box.innerHTML = "";
      setListMeta("");
      return;
    }

    if (!memoList.length) {
      box.innerHTML = '<p class="home-memo-list-empty">尚未寫任何備忘</p>';
      setListMeta("共 0 則");
      return;
    }

    setListMeta("共 " + memoList.length + " 則（只顯示自己）");
    var html = [];
    memoList.forEach(function (row) {
      var iso = normalizeDate(row.memo_date);
      var body = row.body != null ? String(row.body) : "";
      var preview = compactPreview(body, LIST_PREVIEW_MAX);
      var active = iso && iso === editDate ? " is-active" : "";
      var previewHtml = preview
        ? '<span class="home-memo-row-preview">' + escapeHtml(preview) + "</span>"
        : '<span class="home-memo-row-preview is-empty">（空白）</span>';
      html.push(
        '<div class="home-memo-row' + active + '" data-memo-date="' + escapeHtml(iso) + '">' +
          '<div class="home-memo-row-main">' +
            '<span class="home-memo-row-date">' + escapeHtml(formatMemoDate(iso)) + "</span>" +
            previewHtml +
          "</div>" +
          '<div class="home-memo-row-actions">' +
            '<button type="button" class="home-memo-btn" data-memo-action="update" data-memo-date="' +
              escapeHtml(iso) + '">更新</button>' +
            '<button type="button" class="home-memo-btn home-memo-btn-danger" data-memo-action="delete" data-memo-date="' +
              escapeHtml(iso) + '">刪除</button>' +
          "</div>" +
        "</div>"
      );
    });
    box.innerHTML = html.join("");
  }

  function loadMemoList(opts) {
    opts = opts || {};
    var session = getSession();
    var box = $("memo-list");
    if (!canUseMemo(session)) {
      memoList = [];
      listLoadedFor = "";
      if (box) box.innerHTML = "";
      setListMeta("");
      return Promise.resolve();
    }
    var email = (session.email || "").toLowerCase();
    var client = getClient();
    if (!client) {
      setListMeta("尚未連上雲端");
      return Promise.resolve();
    }
    if (!opts.force && listLoadedFor === email && !listLoading) {
      renderMemoList();
      return Promise.resolve();
    }
    if (listLoading && !opts.force) return Promise.resolve();

    listLoading = true;
    setListMeta("載入中…");
    return client
      .from("personal_memos")
      .select("owner_email,memo_date,body,updated_at")
      .eq("owner_email", email)
      .order("memo_date", { ascending: false })
      .then(function (res) {
        listLoading = false;
        if (res && res.error) {
          memoList = [];
          listLoadedFor = "";
          setListMeta("讀取清單失敗：" + (res.error.message || ""));
          if (box) box.innerHTML = '<p class="home-memo-list-empty">無法載入備忘清單</p>';
          return;
        }
        memoList = (res && res.data) ? res.data.slice() : [];
        listLoadedFor = email;
        renderMemoList();
      })
      .catch(function (e) {
        listLoading = false;
        memoList = [];
        listLoadedFor = "";
        setListMeta("讀取清單失敗：" + (e && e.message ? e.message : e));
        if (box) box.innerHTML = '<p class="home-memo-list-empty">無法載入備忘清單</p>';
      });
  }

  function loadSticky(iso) {
    var session = getSession();
    iso = iso || browseDateFromHome();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) iso = todayHK();
    stickyDate = iso;

    if (!canUseMemo(session)) {
      stickyBody = "";
      stickyKey = "";
      renderSticky();
      return;
    }
    var email = (session.email || "").toLowerCase();
    var key = email + "|" + iso;
    if (stickyKey === key) {
      renderSticky();
      return;
    }

    fetchMemo(email, iso).then(function (r) {
      if (stickyDate !== iso) return;
      stickyBody = r.body || "";
      stickyKey = key;
      renderSticky();
    });
  }

  function syncPanelInputs() {
    var dateInput = $("memo-date-input");
    var ta = $("memo-body-input");
    if (dateInput && dateInput.value !== editDate) dateInput.value = editDate || "";
    if (ta && document.activeElement !== ta) ta.value = editBody;
    renderMemoList(); // refresh active highlight
  }

  function loadEdit(iso, opts) {
    opts = opts || {};
    var session = getSession();
    iso = iso || editDate || browseDateFromHome() || todayHK();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) iso = todayHK();
    editDate = iso;

    if (!canUseMemo(session)) {
      editBody = "";
      editExists = false;
      editKey = "";
      setStatus("請先以學校帳戶登入", true);
      syncPanelInputs();
      return;
    }
    var email = (session.email || "").toLowerCase();
    var key = email + "|" + iso;
    if (!opts.force && editKey === key && !loadingEdit) {
      syncPanelInputs();
      return;
    }

    loadingEdit = true;
    setStatus("載入中…", false);
    syncPanelInputs();
    fetchMemo(email, iso).then(function (r) {
      loadingEdit = false;
      if (editDate !== iso) return;
      if (r.error) {
        editBody = "";
        editExists = false;
        editKey = key;
        setStatus("讀取失敗：" + r.error, true);
        syncPanelInputs();
        return;
      }
      editBody = r.body || "";
      editExists = !!r.exists;
      editKey = key;
      setStatus(editExists ? "" : "此日尚未寫備忘", false);
      syncPanelInputs();
      if (opts.focus) {
        var ta = $("memo-body-input");
        if (ta) {
          try {
            ta.focus();
            ta.scrollIntoView({ block: "nearest", behavior: "smooth" });
          } catch (e) { /* ignore */ }
        }
      }
    });
  }

  function refreshStickyIfNeeded(iso, body) {
    if (iso === (stickyDate || browseDateFromHome())) {
      stickyBody = body || "";
      stickyDate = iso;
      var session = getSession();
      var email = session && session.email ? String(session.email).toLowerCase() : "";
      stickyKey = email ? (email + "|" + iso) : "";
      renderSticky();
    }
  }

  function saveMemo() {
    if (saving) return;
    var session = getSession();
    if (!canUseMemo(session)) {
      setStatus("請先以學校帳戶登入", true);
      return;
    }
    var client = getClient();
    if (!client) {
      setStatus("尚未連上雲端", true);
      return;
    }
    var dateInput = $("memo-date-input");
    var iso = (dateInput && dateInput.value) || editDate || todayHK();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      setStatus("請選擇有效日期", true);
      return;
    }
    var ta = $("memo-body-input");
    var next = ta ? String(ta.value || "") : "";
    if (next.length > BODY_MAX) {
      setStatus("不可超過 " + BODY_MAX + " 字", true);
      return;
    }
    var email = (session.email || "").toLowerCase();
    saving = true;
    setStatus("儲存中…", false);
    var btn = $("memo-save");
    if (btn) btn.disabled = true;

    client
      .from("personal_memos")
      .upsert(
        { owner_email: email, memo_date: iso, body: next },
        { onConflict: "owner_email,memo_date" }
      )
      .select("owner_email,memo_date,body,updated_at")
      .maybeSingle()
      .then(function (res) {
        saving = false;
        if (btn) btn.disabled = false;
        if (res && res.error) {
          setStatus("儲存失敗：" + (res.error.message || ""), true);
          return;
        }
        editDate = iso;
        editBody = (res && res.data && res.data.body != null) ? String(res.data.body) : next;
        editExists = true;
        editKey = email + "|" + iso;
        setStatus("已儲存", false);
        syncPanelInputs();
        refreshStickyIfNeeded(iso, editBody);
        loadMemoList({ force: true });
        setTimeout(function () {
          var el = $("memo-status");
          if (el && el.textContent === "已儲存") setStatus("", false);
        }, 1800);
      })
      .catch(function (e) {
        saving = false;
        if (btn) btn.disabled = false;
        setStatus("儲存失敗：" + (e && e.message ? e.message : e), true);
      });
  }

  function clearInput() {
    var ta = $("memo-body-input");
    if (ta) ta.value = "";
    setStatus("已清空輸入；撳「儲存」才會寫入", false);
  }

  function deleteMemoForDate(iso, opts) {
    opts = opts || {};
    if (saving) return;
    var session = getSession();
    if (!canUseMemo(session)) {
      setStatus("請先以學校帳戶登入", true);
      return;
    }
    var client = getClient();
    if (!client) {
      setStatus("尚未連上雲端", true);
      return;
    }
    iso = normalizeDate(iso) || editDate || todayHK();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      setStatus("請選擇有效日期", true);
      return;
    }
    if (!opts.skipConfirm) {
      if (!window.confirm("刪除 " + formatMemoDate(iso) + " 嘅個人備忘？")) return;
    }

    var email = (session.email || "").toLowerCase();
    saving = true;
    setStatus("刪除中…", false);
    var btn = $("memo-delete");
    if (btn) btn.disabled = true;

    client
      .from("personal_memos")
      .delete()
      .eq("owner_email", email)
      .eq("memo_date", iso)
      .then(function (res) {
        saving = false;
        if (btn) btn.disabled = false;
        if (res && res.error) {
          setStatus("刪除失敗：" + (res.error.message || ""), true);
          return;
        }
        if (editDate === iso) {
          editBody = "";
          editExists = false;
          editKey = email + "|" + iso;
          syncPanelInputs();
        }
        setStatus("已刪除", false);
        refreshStickyIfNeeded(iso, "");
        loadMemoList({ force: true });
        setTimeout(function () {
          var el = $("memo-status");
          if (el && el.textContent === "已刪除") setStatus("", false);
        }, 1800);
      })
      .catch(function (e) {
        saving = false;
        if (btn) btn.disabled = false;
        setStatus("刪除失敗：" + (e && e.message ? e.message : e), true);
      });
  }

  function deleteMemo() {
    var dateInput = $("memo-date-input");
    var iso = (dateInput && dateInput.value) || editDate || todayHK();
    deleteMemoForDate(iso);
  }

  function showPanel() {
    var browse = browseDateFromHome();
    if (!editDate || editDate === stickyDate || editDate === browse) {
      loadEdit(browse, { force: true });
    } else {
      loadEdit(editDate, { force: false });
      syncPanelInputs();
    }
    loadMemoList({ force: true });
  }

  function onBrowseDate(iso) {
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      var prev = stickyDate;
      loadSticky(iso);
      var panel = $("home-panel-memo");
      var panelVisible = panel && !panel.classList.contains("hidden") && !panel.hidden;
      if (panelVisible && prev !== iso && (!editDate || editDate === prev)) {
        loadEdit(iso, { force: true });
      }
    } else {
      loadSticky(browseDateFromHome());
    }
  }

  function onListClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest("[data-memo-action]") : null;
    if (!btn) return;
    var list = $("memo-list");
    if (!list || !list.contains(btn)) return;
    e.preventDefault();
    var action = btn.getAttribute("data-memo-action");
    var iso = normalizeDate(btn.getAttribute("data-memo-date"));
    if (!iso) return;
    if (action === "update") {
      editKey = "";
      loadEdit(iso, { force: true, focus: true });
      setStatus("已載入 " + formatMemoDate(iso) + "，可修改後儲存", false);
    } else if (action === "delete") {
      deleteMemoForDate(iso);
    }
  }

  function bindUi() {
    var dateInput = $("memo-date-input");
    if (dateInput && dateInput.dataset.bound !== "1") {
      dateInput.dataset.bound = "1";
      dateInput.addEventListener("change", function () {
        var v = (dateInput.value || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
        editKey = "";
        loadEdit(v, { force: true });
      });
    }
    var todayBtn = $("memo-date-today");
    if (todayBtn && todayBtn.dataset.bound !== "1") {
      todayBtn.dataset.bound = "1";
      todayBtn.addEventListener("click", function (e) {
        e.preventDefault();
        editKey = "";
        loadEdit(todayHK(), { force: true });
      });
    }
    var saveBtn = $("memo-save");
    if (saveBtn && saveBtn.dataset.bound !== "1") {
      saveBtn.dataset.bound = "1";
      saveBtn.addEventListener("click", function (e) {
        e.preventDefault();
        saveMemo();
      });
    }
    var clearBtn = $("memo-clear");
    if (clearBtn && clearBtn.dataset.bound !== "1") {
      clearBtn.dataset.bound = "1";
      clearBtn.addEventListener("click", function (e) {
        e.preventDefault();
        clearInput();
      });
    }
    var delBtn = $("memo-delete");
    if (delBtn && delBtn.dataset.bound !== "1") {
      delBtn.dataset.bound = "1";
      delBtn.addEventListener("click", function (e) {
        e.preventDefault();
        deleteMemo();
      });
    }
    var ta = $("memo-body-input");
    if (ta && ta.dataset.bound !== "1") {
      ta.dataset.bound = "1";
      ta.setAttribute("maxlength", String(BODY_MAX));
      ta.addEventListener("keydown", function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          saveMemo();
        }
      });
    }
    var list = $("memo-list");
    if (list && list.dataset.bound !== "1") {
      list.dataset.bound = "1";
      list.addEventListener("click", onListClick);
    }
  }

  function onAuthed() {
    bindUi();
    var session = getSession();
    if (!session || !session.role) return;
    stickyKey = "";
    editKey = "";
    listLoadedFor = "";
    loadSticky(browseDateFromHome());
  }

  function init() {
    bindUi();
    document.addEventListener("schooladmin:authed", onAuthed);
    window.addEventListener("schooladmin:authed", onAuthed);
    document.addEventListener("schooladmin:browse-date", function (ev) {
      var iso = ev && ev.detail && ev.detail.date;
      onBrowseDate(iso);
    });
    if (window.__schoolAdminSession) onAuthed();
    else renderSticky();
  }

  window.SchoolAdminPersonalMemo = {
    show: showPanel,
    onBrowseDate: onBrowseDate,
    reload: function () {
      stickyKey = "";
      editKey = "";
      listLoadedFor = "";
      loadSticky(browseDateFromHome());
      loadMemoList({ force: true });
    },
    getStickyBody: function () { return stickyBody; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
