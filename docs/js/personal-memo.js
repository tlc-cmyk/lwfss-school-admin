(function () {
  "use strict";

  var BODY_MAX = 2000;
  var PREVIEW_MAX = 80;
  var loadedEmail = "";
  var bodyText = "";
  var editing = false;
  var saving = false;

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

  function setStatus(msg, isErr) {
    var el = $("home-memo-status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("is-err", !!isErr);
  }

  function renderSticky() {
    var wrap = $("home-memo");
    var preview = $("home-memo-preview");
    var empty = $("home-memo-empty");
    var editBtn = $("home-memo-edit-btn");
    var editor = $("home-memo-editor");
    var session = getSession();

    if (!wrap) return;

    if (!canUseMemo(session)) {
      wrap.hidden = true;
      if (editor) editor.hidden = true;
      editing = false;
      return;
    }

    wrap.hidden = false;
    var previewText = compactPreview(bodyText);
    if (preview) {
      if (previewText) {
        preview.textContent = previewText;
        preview.hidden = false;
        if (empty) empty.hidden = true;
      } else {
        preview.textContent = "";
        preview.hidden = true;
        if (empty) empty.hidden = false;
      }
    }
    if (editBtn) {
      editBtn.textContent = editing ? "收起" : "編輯";
      editBtn.setAttribute("aria-expanded", editing ? "true" : "false");
    }
    if (editor) {
      editor.hidden = !editing;
      if (editing) {
        var ta = $("home-memo-input");
        if (ta && document.activeElement !== ta) ta.value = bodyText;
      }
    }
  }

  function loadMemo(session) {
    session = session || getSession();
    if (!canUseMemo(session)) {
      bodyText = "";
      loadedEmail = "";
      renderSticky();
      return;
    }
    var email = (session.email || "").toLowerCase();
    var client = getClient();
    if (!client) {
      setStatus("尚未連上雲端", true);
      renderSticky();
      return;
    }
    if (loadedEmail === email && bodyText != null) {
      renderSticky();
      return;
    }
    setStatus("載入中…", false);
    client
      .from("personal_memos")
      .select("owner_email,body,updated_at")
      .eq("owner_email", email)
      .maybeSingle()
      .then(function (res) {
        if (res && res.error) {
          setStatus("讀取失敗：" + (res.error.message || ""), true);
          bodyText = "";
          loadedEmail = email;
          renderSticky();
          return;
        }
        bodyText = (res && res.data && res.data.body) ? String(res.data.body) : "";
        loadedEmail = email;
        setStatus("", false);
        renderSticky();
      })
      .catch(function (e) {
        setStatus("讀取失敗：" + (e && e.message ? e.message : e), true);
        bodyText = "";
        loadedEmail = email;
        renderSticky();
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
    var ta = $("home-memo-input");
    var next = ta ? String(ta.value || "") : "";
    if (next.length > BODY_MAX) {
      setStatus("不可超過 " + BODY_MAX + " 字", true);
      return;
    }
    var email = (session.email || "").toLowerCase();
    saving = true;
    setStatus("儲存中…", false);
    var btn = $("home-memo-save");
    if (btn) btn.disabled = true;

    client
      .from("personal_memos")
      .upsert(
        { owner_email: email, body: next },
        { onConflict: "owner_email" }
      )
      .select("owner_email,body,updated_at")
      .maybeSingle()
      .then(function (res) {
        saving = false;
        if (btn) btn.disabled = false;
        if (res && res.error) {
          setStatus("儲存失敗：" + (res.error.message || ""), true);
          return;
        }
        bodyText = (res && res.data && res.data.body != null)
          ? String(res.data.body)
          : next;
        loadedEmail = email;
        editing = false;
        setStatus("已儲存", false);
        renderSticky();
        setTimeout(function () {
          var el = $("home-memo-status");
          if (el && el.textContent === "已儲存") setStatus("", false);
        }, 1800);
      })
      .catch(function (e) {
        saving = false;
        if (btn) btn.disabled = false;
        setStatus("儲存失敗：" + (e && e.message ? e.message : e), true);
      });
  }

  function clearMemo() {
    var ta = $("home-memo-input");
    if (ta) ta.value = "";
    // Keep focus; user still needs to save
    setStatus("已清空輸入；撳「儲存」才會寫入", false);
  }

  function toggleEdit() {
    var session = getSession();
    if (!canUseMemo(session)) return;
    editing = !editing;
    if (editing) {
      var ta = $("home-memo-input");
      if (ta) {
        ta.value = bodyText;
        setTimeout(function () {
          try { ta.focus(); } catch (e) { /* ignore */ }
        }, 0);
      }
      setStatus("", false);
    }
    renderSticky();
  }

  function cancelEdit() {
    editing = false;
    setStatus("", false);
    renderSticky();
  }

  function bindUi() {
    var editBtn = $("home-memo-edit-btn");
    if (editBtn && editBtn.dataset.bound !== "1") {
      editBtn.dataset.bound = "1";
      editBtn.addEventListener("click", function (e) {
        e.preventDefault();
        toggleEdit();
      });
    }
    var saveBtn = $("home-memo-save");
    if (saveBtn && saveBtn.dataset.bound !== "1") {
      saveBtn.dataset.bound = "1";
      saveBtn.addEventListener("click", function (e) {
        e.preventDefault();
        saveMemo();
      });
    }
    var cancelBtn = $("home-memo-cancel");
    if (cancelBtn && cancelBtn.dataset.bound !== "1") {
      cancelBtn.dataset.bound = "1";
      cancelBtn.addEventListener("click", function (e) {
        e.preventDefault();
        cancelEdit();
      });
    }
    var clearBtn = $("home-memo-clear");
    if (clearBtn && clearBtn.dataset.bound !== "1") {
      clearBtn.dataset.bound = "1";
      clearBtn.addEventListener("click", function (e) {
        e.preventDefault();
        clearMemo();
      });
    }
    var ta = $("home-memo-input");
    if (ta && ta.dataset.bound !== "1") {
      ta.dataset.bound = "1";
      ta.setAttribute("maxlength", String(BODY_MAX));
      ta.addEventListener("keydown", function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          saveMemo();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          cancelEdit();
        }
      });
    }
  }

  function onAuthed() {
    bindUi();
    var session = getSession();
    if (!session || !session.role) return;
    // Reload when email changes
    var email = (session.email || "").toLowerCase();
    if (loadedEmail && loadedEmail !== email) {
      bodyText = "";
      loadedEmail = "";
      editing = false;
    }
    loadMemo(session);
  }

  function init() {
    bindUi();
    document.addEventListener("schooladmin:authed", onAuthed);
    window.addEventListener("schooladmin:authed", onAuthed);
    if (window.__schoolAdminSession) onAuthed();
    else renderSticky();
  }

  window.SchoolAdminPersonalMemo = {
    reload: function () { loadedEmail = ""; loadMemo(getSession()); },
    getBody: function () { return bodyText; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
