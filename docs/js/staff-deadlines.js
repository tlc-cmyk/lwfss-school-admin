(function () {
  "use strict";

  var ACADEMIC_YEAR = "2026-2027";
  var TITLE_MAX = 500;
  var RAW_MAX = 40;

  var rows = [];
  var filter = "upcoming";
  var loaded = false;
  var loading = false;
  var saving = false;
  var editId = null; // null = new

  function $(id) { return document.getElementById(id); }

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
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, "0");
      var day = String(d.getDate()).padStart(2, "0");
      return y + "-" + m + "-" + day;
    }
  }

  function getSession() {
    return (window.SchoolAdminAuth && SchoolAdminAuth.getSession()) || window.__schoolAdminSession || null;
  }

  function getClient() {
    var auth = window.SchoolAdminAuth;
    return (auth && auth.getClient && auth.getClient()) || window.__supabaseClient || null;
  }

  function canManage(session) {
    if (!session || session.method !== "supabase") return false;
    if (session.role !== "staff") return false;
    var email = (session.email || "").toLowerCase();
    if (!email) return false;
    if (window.SchoolAdminAuth && SchoolAdminAuth.emailAllowed) {
      return SchoolAdminAuth.emailAllowed(email);
    }
    return /@g\.lwfss\.edu\.hk$/i.test(email);
  }

  function monthLabel(iso) {
    if (!iso) return "日期待定";
    var parts = iso.split("-");
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    return y + "年" + m + "月";
  }

  function formatDue(row) {
    if (row.due_date_raw) return row.due_date_raw;
    return row.due_date || "—";
  }

  function isUpcoming(row, today) {
    if (!row.due_date) return true;
    return row.due_date >= today;
  }

  function rawFromIso(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    var parts = iso.split("-");
    var d = parseInt(parts[2], 10);
    var m = parseInt(parts[1], 10);
    if (!d || !m) return "";
    return d + "/" + m;
  }

  function nextSortOrder() {
    var max = 0;
    rows.forEach(function (r) {
      var n = parseInt(r.sort_order, 10) || 0;
      if (n > max) max = n;
    });
    return max + 1;
  }

  function setStatus(msg, isErr) {
    var el = $("deadline-form-status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("is-err", !!isErr);
  }

  function setFormMode(isEdit) {
    var mode = $("deadline-form-mode");
    if (mode) mode.textContent = isEdit ? "編輯文件期限" : "新增文件期限";
    var del = $("deadline-form-delete");
    if (del) del.hidden = !isEdit;
  }

  function fillForm(row) {
    var dateInput = $("deadline-due-date");
    var rawInput = $("deadline-due-raw");
    var titleInput = $("deadline-title");
    var sortInput = $("deadline-sort-order");
    if (row) {
      editId = row.id;
      if (dateInput) dateInput.value = row.due_date || "";
      if (rawInput) rawInput.value = row.due_date_raw || "";
      if (titleInput) titleInput.value = row.title || "";
      if (sortInput) sortInput.value = row.sort_order != null ? String(row.sort_order) : "";
      setFormMode(true);
    } else {
      editId = null;
      if (dateInput) dateInput.value = "";
      if (rawInput) rawInput.value = "";
      if (titleInput) titleInput.value = "";
      if (sortInput) sortInput.value = String(nextSortOrder());
      setFormMode(false);
    }
    render();
  }

  function readForm() {
    var dateInput = $("deadline-due-date");
    var rawInput = $("deadline-due-raw");
    var titleInput = $("deadline-title");
    var sortInput = $("deadline-sort-order");
    var due = (dateInput && dateInput.value) ? String(dateInput.value).trim() : "";
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) due = "";
    var raw = rawInput ? String(rawInput.value || "").trim() : "";
    if (raw.length > RAW_MAX) raw = raw.slice(0, RAW_MAX);
    if (!raw && due) raw = rawFromIso(due);
    var title = titleInput ? String(titleInput.value || "").trim() : "";
    if (title.length > TITLE_MAX) title = title.slice(0, TITLE_MAX);
    var sortVal = sortInput ? String(sortInput.value || "").trim() : "";
    var sortOrder = parseInt(sortVal, 10);
    if (!isFinite(sortOrder)) sortOrder = nextSortOrder();
    return {
      due_date: due || null,
      due_date_raw: raw,
      title: title,
      academic_year: ACADEMIC_YEAR,
      sort_order: sortOrder
    };
  }

  function notifyChanged(dueDate) {
    try {
      document.dispatchEvent(new CustomEvent("schooladmin:deadlines-changed", {
        detail: { due_date: dueDate || null }
      }));
    } catch (e) { /* ignore */ }
    if (window.SchoolAdminHome && typeof SchoolAdminHome.reloadBrowseDay === "function") {
      SchoolAdminHome.reloadBrowseDay();
    }
    if (window.SchoolAdminAlmanac && typeof SchoolAdminAlmanac.refresh === "function") {
      SchoolAdminAlmanac.refresh();
    }
  }

  function render() {
    var box = $("deadlines-list");
    var meta = $("deadlines-meta");
    if (!box) return;
    var today = todayHK();
    var list = rows.slice();
    if (filter === "upcoming") {
      list = list.filter(function (r) { return isUpcoming(r, today); });
    }
    list.sort(function (a, b) {
      if (a.due_date && b.due_date) {
        if (a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
      } else if (a.due_date && !b.due_date) return -1;
      else if (!a.due_date && b.due_date) return 1;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    if (meta) {
      meta.textContent =
        (filter === "upcoming" ? "即將到期／進行中： " : "全年共 ") +
        list.length + " 項" +
        (filter === "upcoming" ? "（今日 " + today + "）" : "");
    }

    if (!list.length) {
      box.innerHTML = '<p class="muted">沒有符合條件的項目。</p>';
      return;
    }

    var html = "";
    var lastMonth = null;
    var canEdit = canManage(getSession());
    list.forEach(function (row) {
      var mk = row.due_date ? monthLabel(row.due_date) : "其他／日期範圍";
      if (mk !== lastMonth) {
        html += '<h3 class="deadline-month">' + escapeHtml(mk) + "</h3>";
        lastMonth = mk;
      }
      var past = row.due_date && row.due_date < today;
      var todayHit = row.due_date === today;
      var active = editId != null && String(editId) === String(row.id);
      html +=
        '<article class="deadline-item' +
        (past ? " past" : "") +
        (todayHit ? " today" : "") +
        (active ? " is-editing" : "") +
        '" data-deadline-id="' + escapeHtml(String(row.id)) + '">' +
        '<div class="deadline-date">' + escapeHtml(formatDue(row)) + "</div>" +
        '<div class="deadline-body">' + escapeHtml(row.title || "") + "</div>";
      if (canEdit) {
        html +=
          '<div class="deadline-actions">' +
            '<button type="button" class="home-memo-btn" data-deadline-action="edit" data-deadline-id="' +
              escapeHtml(String(row.id)) + '">編輯</button>' +
            '<button type="button" class="home-memo-btn home-memo-btn-danger" data-deadline-action="delete" data-deadline-id="' +
              escapeHtml(String(row.id)) + '">刪除</button>' +
          "</div>";
      }
      html += "</article>";
    });
    box.innerHTML = html;
  }

  function bindFilters() {
    var bar = document.querySelector(".deadlines-filters");
    if (!bar || bar.dataset.bound === "1") return;
    bar.dataset.bound = "1";
    bar.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-filter]");
      if (!btn) return;
      filter = btn.getAttribute("data-filter") || "upcoming";
      bar.querySelectorAll("button[data-filter]").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      render();
    });
  }

  function loadDeadlines(opts) {
    opts = opts || {};
    var session = getSession();
    var err = $("deadlines-err");
    var formWrap = $("deadline-form");

    if (!session || session.role !== "staff") {
      if (err) err.textContent = "";
      var metaEl = $("deadlines-meta");
      if (metaEl) metaEl.textContent = "";
      var boxEl = $("deadlines-list");
      if (boxEl) boxEl.innerHTML = "";
      if (formWrap) formWrap.hidden = true;
      rows = [];
      loaded = false;
      return Promise.resolve();
    }

    if (formWrap) formWrap.hidden = !canManage(session);

    var client = getClient();
    if (!client || session.method !== "supabase") {
      if (err) err.textContent = "需要以學校 Google 帳戶登入才可讀取清單。";
      return Promise.resolve();
    }

    if (loading && !opts.force) return Promise.resolve();
    if (loaded && !opts.force) {
      render();
      return Promise.resolve();
    }

    loading = true;
    if (err) err.textContent = "";
    return client
      .from("staff_deadlines")
      .select("id,due_date,due_date_raw,title,academic_year,sort_order")
      .eq("academic_year", ACADEMIC_YEAR)
      .order("sort_order", { ascending: true })
      .then(function (res) {
        loading = false;
        if (res.error) {
          loaded = false;
          if (err) err.textContent = "無法載入：" + (res.error.message || res.error);
          return;
        }
        rows = res.data || [];
        loaded = true;
        if (editId == null) {
          var sortInput = $("deadline-sort-order");
          if (sortInput && !sortInput.value) sortInput.value = String(nextSortOrder());
        }
        render();
      })
      .catch(function (e) {
        loading = false;
        loaded = false;
        if (err) err.textContent = "無法載入：" + (e && e.message ? e.message : e);
      });
  }

  function findRow(id) {
    id = String(id);
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].id) === id) return rows[i];
    }
    return null;
  }

  function saveDeadline() {
    if (saving) return;
    var session = getSession();
    if (!canManage(session)) {
      setStatus("請先以教職員帳戶登入", true);
      return;
    }
    var client = getClient();
    if (!client) {
      setStatus("尚未連上雲端", true);
      return;
    }
    var payload = readForm();
    if (!payload.title) {
      setStatus("請填寫標題", true);
      return;
    }

    saving = true;
    setStatus(editId != null ? "更新中…" : "新增中…", false);
    var saveBtn = $("deadline-form-save");
    var delBtn = $("deadline-form-delete");
    if (saveBtn) saveBtn.disabled = true;
    if (delBtn) delBtn.disabled = true;

    var req;
    if (editId != null) {
      req = client
        .from("staff_deadlines")
        .update(payload)
        .eq("id", editId)
        .select("id,due_date,due_date_raw,title,academic_year,sort_order")
        .maybeSingle();
    } else {
      req = client
        .from("staff_deadlines")
        .insert(payload)
        .select("id,due_date,due_date_raw,title,academic_year,sort_order")
        .maybeSingle();
    }

    req
      .then(function (res) {
        saving = false;
        if (saveBtn) saveBtn.disabled = false;
        if (delBtn) delBtn.disabled = false;
        if (res && res.error) {
          setStatus("儲存失敗：" + (res.error.message || ""), true);
          return;
        }
        setStatus(editId != null ? "已更新" : "已新增", false);
        fillForm(null);
        loaded = false;
        loadDeadlines({ force: true }).then(function () {
          notifyChanged(payload.due_date);
        });
        setTimeout(function () {
          var el = $("deadline-form-status");
          if (el && (el.textContent === "已更新" || el.textContent === "已新增")) {
            setStatus("", false);
          }
        }, 1800);
      })
      .catch(function (e) {
        saving = false;
        if (saveBtn) saveBtn.disabled = false;
        if (delBtn) delBtn.disabled = false;
        setStatus("儲存失敗：" + (e && e.message ? e.message : e), true);
      });
  }

  function deleteDeadline(id, opts) {
    opts = opts || {};
    if (saving) return;
    var session = getSession();
    if (!canManage(session)) {
      setStatus("請先以教職員帳戶登入", true);
      return;
    }
    var client = getClient();
    if (!client) {
      setStatus("尚未連上雲端", true);
      return;
    }
    id = id != null ? id : editId;
    if (id == null) {
      setStatus("未有選取項目", true);
      return;
    }
    var row = findRow(id);
    var label = row ? (formatDue(row) + " · " + (row.title || "").slice(0, 40)) : ("#" + id);
    if (!opts.skipConfirm) {
      if (!window.confirm("刪除文件期限？\n" + label)) return;
    }

    saving = true;
    setStatus("刪除中…", false);
    var saveBtn = $("deadline-form-save");
    var delBtn = $("deadline-form-delete");
    if (saveBtn) saveBtn.disabled = true;
    if (delBtn) delBtn.disabled = true;

    var due = row && row.due_date ? row.due_date : null;
    client
      .from("staff_deadlines")
      .delete()
      .eq("id", id)
      .then(function (res) {
        saving = false;
        if (saveBtn) saveBtn.disabled = false;
        if (delBtn) delBtn.disabled = false;
        if (res && res.error) {
          setStatus("刪除失敗：" + (res.error.message || ""), true);
          return;
        }
        if (editId != null && String(editId) === String(id)) fillForm(null);
        setStatus("已刪除", false);
        loaded = false;
        loadDeadlines({ force: true }).then(function () {
          notifyChanged(due);
        });
        setTimeout(function () {
          var el = $("deadline-form-status");
          if (el && el.textContent === "已刪除") setStatus("", false);
        }, 1800);
      })
      .catch(function (e) {
        saving = false;
        if (saveBtn) saveBtn.disabled = false;
        if (delBtn) delBtn.disabled = false;
        setStatus("刪除失敗：" + (e && e.message ? e.message : e), true);
      });
  }

  function onListClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest("[data-deadline-action]") : null;
    if (!btn) return;
    var list = $("deadlines-list");
    if (!list || !list.contains(btn)) return;
    e.preventDefault();
    var action = btn.getAttribute("data-deadline-action");
    var id = btn.getAttribute("data-deadline-id");
    if (!id) return;
    if (action === "edit") {
      var row = findRow(id);
      if (!row) return;
      fillForm(row);
      setStatus("已載入，可修改後儲存", false);
      var form = $("deadline-form");
      if (form) {
        try { form.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (err) { /* ignore */ }
      }
      var titleInput = $("deadline-title");
      if (titleInput) {
        try { titleInput.focus(); } catch (err2) { /* ignore */ }
      }
    } else if (action === "delete") {
      deleteDeadline(id);
    }
  }

  function bindForm() {
    var form = $("deadline-form");
    if (!form || form.dataset.bound === "1") return;
    form.dataset.bound = "1";

    var saveBtn = $("deadline-form-save");
    if (saveBtn) {
      saveBtn.addEventListener("click", function (e) {
        e.preventDefault();
        saveDeadline();
      });
    }
    var clearBtn = $("deadline-form-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", function (e) {
        e.preventDefault();
        fillForm(null);
        setStatus("已清空表單（新增模式）", false);
      });
    }
    var delBtn = $("deadline-form-delete");
    if (delBtn) {
      delBtn.addEventListener("click", function (e) {
        e.preventDefault();
        deleteDeadline(editId);
      });
    }
    var todayBtn = $("deadline-due-today");
    if (todayBtn) {
      todayBtn.addEventListener("click", function (e) {
        e.preventDefault();
        var dateInput = $("deadline-due-date");
        var rawInput = $("deadline-due-raw");
        var iso = todayHK();
        if (dateInput) dateInput.value = iso;
        if (rawInput && !String(rawInput.value || "").trim()) rawInput.value = rawFromIso(iso);
      });
    }
    var dateInput = $("deadline-due-date");
    if (dateInput) {
      dateInput.addEventListener("change", function () {
        var rawInput = $("deadline-due-raw");
        var v = (dateInput.value || "").trim();
        if (!rawInput) return;
        if (!String(rawInput.value || "").trim() && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
          rawInput.value = rawFromIso(v);
        }
      });
    }
    var titleInput = $("deadline-title");
    if (titleInput) {
      titleInput.setAttribute("maxlength", String(TITLE_MAX));
      titleInput.addEventListener("keydown", function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          saveDeadline();
        }
      });
    }
    var list = $("deadlines-list");
    if (list && list.dataset.actionsBound !== "1") {
      list.dataset.actionsBound = "1";
      list.addEventListener("click", onListClick);
    }
  }

  function showPanel() {
    bindFilters();
    bindForm();
    var session = getSession();
    var formWrap = $("deadline-form");
    if (formWrap) formWrap.hidden = !canManage(session);
    if (editId == null) fillForm(null);
    loaded = false;
    loadDeadlines({ force: true });
  }

  function onAuthed() {
    bindFilters();
    bindForm();
    var session = getSession();
    if (!session) return;
    if (session.role === "staff") loadDeadlines({ force: true });
  }

  function init() {
    bindFilters();
    bindForm();
    document.addEventListener("schooladmin:authed", onAuthed);
    window.addEventListener("schooladmin:authed", onAuthed);
    if (window.__schoolAdminSession) onAuthed();
  }

  window.SchoolAdminStaffDeadlines = {
    show: showPanel,
    reload: function () {
      loaded = false;
      return loadDeadlines({ force: true });
    },
    getRows: function () { return rows.slice(); }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
