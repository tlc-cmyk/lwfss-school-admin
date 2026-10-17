(function () {
  "use strict";

  var BODY_MAX = 2000;
  var PREVIEW_MAX = 80;

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

  function $(id) { return document.getElementById(id); }

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

  function compactPreview(text) {
    var t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return "";
    if (t.length <= PREVIEW_MAX) return t;
    return t.slice(0, PREVIEW_MAX - 1) + "…";
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
      // Ignore stale responses if browse date changed mid-flight
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
    });
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
        // Refresh sticky if same browse date
        if (iso === (stickyDate || browseDateFromHome())) {
          stickyBody = editBody;
          stickyDate = iso;
          stickyKey = editKey;
          renderSticky();
        }
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

  function deleteMemo() {
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
    if (!window.confirm("刪除 " + iso + " 嘅個人備忘？")) return;

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
        editBody = "";
        editExists = false;
        editKey = email + "|" + iso;
        setStatus("已刪除", false);
        syncPanelInputs();
        if (iso === (stickyDate || browseDateFromHome())) {
          stickyBody = "";
          stickyDate = iso;
          stickyKey = editKey;
          renderSticky();
        }
      })
      .catch(function (e) {
        saving = false;
        if (btn) btn.disabled = false;
        setStatus("刪除失敗：" + (e && e.message ? e.message : e), true);
      });
  }

  function showPanel() {
    var browse = browseDateFromHome();
    if (!editDate || editDate === stickyDate || editDate === browse) {
      loadEdit(browse, { force: true });
    } else {
      loadEdit(editDate, { force: false });
      syncPanelInputs();
    }
  }

  function onBrowseDate(iso) {
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      var prev = stickyDate;
      loadSticky(iso); // uses stickyKey cache when same email|date
      var panel = $("home-panel-memo");
      var panelVisible = panel && !panel.classList.contains("hidden") && !panel.hidden;
      if (panelVisible && prev !== iso && (!editDate || editDate === prev)) {
        loadEdit(iso, { force: true });
      }
    } else {
      loadSticky(browseDateFromHome());
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
  }

  function onAuthed() {
    bindUi();
    var session = getSession();
    if (!session || !session.role) return;
    stickyKey = "";
    editKey = "";
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
      loadSticky(browseDateFromHome());
    },
    getStickyBody: function () { return stickyBody; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
