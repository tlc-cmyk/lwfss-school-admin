(function () {
  "use strict";

  /**
   * 今日拍卡 — eClass gate punches shared via public.gate_attendance.
   * Distinct from class_attendance (我的課堂點名).
   */

  var ACADEMIC_YEAR = "2026-2027";
  var PAGE_SIZE = 1000;

  var state = {
    loaded: false,
    loading: false,
    saving: false,
    error: "",
    records: [],
    dates: [],
    view: "byclass",
    classFilter: "",
    source: "",
    uploadedMeta: "",
    roster: null,
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

  function getSession() {
    return (window.SchoolAdminAuth && SchoolAdminAuth.getSession()) ||
      window.__schoolAdminSession || null;
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

  function util() {
    return window.AttendanceUtil || null;
  }

  function displayName(r) {
    var n = r.name || r.student_name || "";
    return n.replace(/\s*\([0-9]+[A-Za-z]-[0-9]+\)\s*$/, "").trim() || n;
  }

  function pickFocusDate(dates) {
    var U = util();
    var today = U ? U.todayYmdHK() : "";
    if (today && dates.indexOf(today) !== -1) return today;
    if (dates.length === 1) return dates[0];
    if (dates.length) return dates[dates.length - 1];
    return today || "";
  }

  function rowFromDb(row) {
    var times = Array.isArray(row.tap_times) ? row.tap_times.slice() : [];
    return {
      date: row.punch_date,
      className: row.class_name || "",
      no: String(row.student_no || ""),
      name: row.student_name || "",
      times: times,
      firstTap: row.first_tap || (times.length ? times[0] : ""),
      lastTap: row.last_tap || (times.length ? times[times.length - 1] : ""),
      uploaded_by: row.uploaded_by || "",
      uploaded_by_code: row.uploaded_by_code || "",
      uploaded_at: row.uploaded_at || "",
      source: row.source || ""
    };
  }

  function dbRowsFromParsed(records, email, code, source) {
    var now = new Date().toISOString();
    return (records || []).map(function (r) {
      return {
        punch_date: r.date,
        class_name: r.className || "",
        student_no: String(r.no || ""),
        student_name: r.name || "",
        tap_times: r.times || [],
        first_tap: r.firstTap || "",
        last_tap: r.lastTap || "",
        uploaded_by: email,
        uploaded_by_code: code,
        uploaded_at: now,
        source: source || "upload"
      };
    });
  }

  function applyLocal(records, source, meta) {
    var dateSet = {};
    (records || []).forEach(function (r) {
      if (r.date) dateSet[r.date] = true;
    });
    state.records = records || [];
    state.dates = Object.keys(dateSet).sort();
    state.source = source || "";
    state.uploadedMeta = meta || "";
    state.classFilter = "";
    state.error = "";
  }

  function setStatus(msg, isErr) {
    var el = $("home-att-status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("is-err", !!isErr);
  }

  function loadRoster() {
    var client = getClient();
    if (!client) return Promise.resolve(null);
    return client
      .from("students")
      .select("class_code")
      .eq("academic_year", ACADEMIC_YEAR)
      .then(function (res) {
        if (res.error) return null;
        var classes = {};
        var total = 0;
        (res.data || []).forEach(function (row) {
          var c = row.class_code || "";
          if (!c) return;
          classes[c] = (classes[c] || 0) + 1;
          total++;
        });
        state.roster = { studentCount: total, classes: classes };
        return state.roster;
      })
      .catch(function () { return null; });
  }

  function loadFromCloud() {
    var client = getClient();
    if (!client) {
      state.error = "未能連接資料庫";
      state.loaded = true;
      renderAll();
      return Promise.resolve();
    }
    state.loading = true;
    setStatus("載入中…", false);
    return client
      .from("gate_attendance")
      .select("punch_date,class_name,student_no,student_name,tap_times,first_tap,last_tap,uploaded_by,uploaded_by_code,uploaded_at,source")
      .order("punch_date", { ascending: false })
      .limit(PAGE_SIZE)
      .then(function (res) {
        state.loading = false;
        state.loaded = true;
        if (res.error) {
          state.error = res.error.message || "載入失敗";
          setStatus(state.error, true);
          renderAll();
          return;
        }
        var rows = (res.data || []).map(rowFromDb);
        var source = "";
        var meta = "";
        if (rows.length) {
          source = rows[0].source || "upload";
          var who = rows[0].uploaded_by_code || "";
          if (!who && rows[0].uploaded_by) {
            var em = rows[0].uploaded_by;
            var at = em.indexOf("@");
            who = at > 0 ? em.slice(0, at) : em;
          }
          if (who) meta = "由 " + who + " 上載";
          if (rows[0].uploaded_at) {
            try {
              var d = new Date(rows[0].uploaded_at);
              meta += (meta ? " · " : "") + d.toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong" });
            } catch (e) { /* ignore */ }
          }
        }
        applyLocal(rows, source, meta);
        setStatus("", false);
        renderAll();
      })
      .catch(function (e) {
        state.loading = false;
        state.loaded = true;
        state.error = (e && e.message) || "載入失敗";
        setStatus(state.error, true);
        renderAll();
      });
  }

  function uniqueDates(records) {
    var set = {};
    (records || []).forEach(function (r) {
      if (r.date) set[r.date] = true;
    });
    return Object.keys(set);
  }

  function replaceDatesInCloud(parsedRecords, source) {
    var session = getSession();
    if (!canManage(session)) {
      return Promise.reject(new Error("只限教職員上載"));
    }
    var client = getClient();
    if (!client) return Promise.reject(new Error("未能連接資料庫"));

    var email = String(session.email || "").trim().toLowerCase();
    var code = "";
    if (session.staff && session.staff.short_name) {
      code = String(session.staff.short_name).trim().toUpperCase();
    }
    var dates = uniqueDates(parsedRecords);
    if (!dates.length) return Promise.reject(new Error("檔案無有效日期"));

    var rows = dbRowsFromParsed(parsedRecords, email, code, source);
    state.saving = true;
    setStatus("上載中…", false);

    var del = client.from("gate_attendance").delete().in("punch_date", dates);
    return del.then(function (delRes) {
      if (delRes.error) throw new Error(delRes.error.message || "清除舊資料失敗");
      // chunk inserts
      var chunks = [];
      var i;
      for (i = 0; i < rows.length; i += 400) {
        chunks.push(rows.slice(i, i + 400));
      }
      var chain = Promise.resolve();
      chunks.forEach(function (chunk) {
        chain = chain.then(function () {
          return client.from("gate_attendance").insert(chunk).then(function (ins) {
            if (ins.error) throw new Error(ins.error.message || "寫入失敗");
          });
        });
      });
      return chain;
    }).then(function () {
      state.saving = false;
      return loadFromCloud();
    }).catch(function (e) {
      state.saving = false;
      setStatus((e && e.message) || "上載失敗", true);
      throw e;
    });
  }

  function handleFile(file) {
    var U = util();
    if (!U || !file) return;
    U.readFileAsBuffer(file).then(function (buf) {
      var text = U.decodeBuffer(buf);
      var parsed = U.parseCsvText(text);
      if (parsed.error && !parsed.records.length) {
        alert(parsed.error);
        return;
      }
      return replaceDatesInCloud(parsed.records, "upload").then(function () {
        setStatus("已上載並共享予教職員", false);
      }).catch(function (e) {
        alert((e && e.message) || "上載失敗");
      });
    }).catch(function (e) {
      alert("讀取檔案失敗：" + (e && e.message ? e.message : e));
    });
  }

  function loadSample() {
    var U = util();
    if (!U) return;
    var btn = $("home-att-sample");
    if (btn) { btn.disabled = true; btn.textContent = "載入中…"; }
    U.fetchSampleText().then(function (text) {
      var parsed = U.parseCsvText(text);
      if (parsed.error && !parsed.records.length) {
        alert(parsed.error);
        return;
      }
      return replaceDatesInCloud(parsed.records, "sample").then(function () {
        setStatus("已載入示例並共享", false);
      });
    }).catch(function () {
      alert("無法載入示例（請直接上載 CSV）。");
    }).then(function () {
      if (btn) { btn.disabled = false; btn.textContent = "載入示例"; }
    });
  }

  function clearFocusDate() {
    var session = getSession();
    if (!canManage(session)) {
      alert("只限教職員清除");
      return;
    }
    var focus = pickFocusDate(state.dates);
    if (!focus) {
      alert("沒有可清除嘅日期");
      return;
    }
    if (!window.confirm("清除 " + focus + " 嘅拍卡資料？（全校教職員都會睇唔到）")) return;
    var client = getClient();
    if (!client) {
      alert("未能連接資料庫");
      return;
    }
    state.saving = true;
    setStatus("清除中…", false);
    client
      .from("gate_attendance")
      .delete()
      .eq("punch_date", focus)
      .then(function (res) {
        state.saving = false;
        if (res.error) {
          setStatus(res.error.message || "清除失敗", true);
          return;
        }
        return loadFromCloud();
      })
      .catch(function (e) {
        state.saving = false;
        setStatus((e && e.message) || "清除失敗", true);
      });
  }

  function renderAll() {
    var U = util();
    var summaryEl = $("home-att-summary");
    var arrivedEl = $("home-att-arrived");
    var metaEl = $("home-att-summary-meta");
    var chipsEl = $("home-att-chips");
    var bodyEl = $("home-att-body");
    var emptyEl = $("home-att-empty");
    var staffEl = $("home-att-staff");
    var studentEl = $("home-att-student");
    var toolbarEl = $("home-att-toolbar");

    var session = getSession();
    var isStaff = !!(session && session.role === "staff");
    if (staffEl) staffEl.hidden = !isStaff;
    if (studentEl) studentEl.hidden = isStaff;
    if (!isStaff) return;
    if (!bodyEl) return;

    if (toolbarEl) {
      var canWrite = canManage(session);
      Array.prototype.forEach.call(toolbarEl.querySelectorAll("[data-att-write]"), function (btn) {
        btn.disabled = !canWrite || state.saving;
      });
    }

    if (!U) {
      bodyEl.innerHTML = "";
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = "拍卡模組未載入。";
      }
      if (summaryEl) summaryEl.hidden = true;
      if (chipsEl) chipsEl.hidden = true;
      return;
    }

    if (state.loading && !state.records.length) {
      bodyEl.innerHTML = "";
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = "載入拍卡資料中…";
      }
      if (summaryEl) summaryEl.hidden = true;
      if (chipsEl) chipsEl.hidden = true;
      return;
    }

    if (!state.records.length) {
      bodyEl.innerHTML = "";
      if (summaryEl) summaryEl.hidden = true;
      if (chipsEl) { chipsEl.hidden = true; chipsEl.innerHTML = ""; }
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = state.error
          ? state.error
          : "尚未有拍卡資料。請上載 eClass CSV，或撳「載入示例」。資料會共享予全校教職員。";
      }
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    var focusDate = pickFocusDate(state.dates);
    var dayRecords = U.filterByDate(state.records, focusDate);
    var sum = U.summarize(dayRecords);
    var roster = state.roster;
    var totalStudents = roster && roster.studentCount ? roster.studentCount : 0;

    if (summaryEl) summaryEl.hidden = false;
    if (arrivedEl) arrivedEl.textContent = "已到 " + sum.arrived;
    var metaParts = [];
    if (focusDate) {
      var parts = focusDate.split("-");
      metaParts.push(parseInt(parts[2], 10) + "/" + parseInt(parts[1], 10) + "/" + parts[0]);
    }
    if (totalStudents) metaParts.push("全校約 " + totalStudents + " 人");
    metaParts.push(sum.classOrder.length + " 班有紀錄");
    if (sum.lastTap) metaParts.push("最後 " + U.shortTime(sum.lastTap));
    if (state.source === "sample") metaParts.push("示例");
    else if (state.source === "upload") metaParts.push("已上載");
    if (state.uploadedMeta) metaParts.push(state.uploadedMeta);
    if (metaEl) metaEl.textContent = metaParts.join(" · ");

    if (chipsEl) {
      chipsEl.hidden = false;
      chipsEl.innerHTML = "";
      var allBtn = document.createElement("button");
      allBtn.type = "button";
      allBtn.className = !state.classFilter ? "active" : "";
      allBtn.innerHTML = "全部<span class=\"att-n\">" + sum.arrived + "</span>";
      allBtn.addEventListener("click", function () {
        state.classFilter = "";
        renderAll();
      });
      chipsEl.appendChild(allBtn);
      sum.classOrder.forEach(function (c) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = state.classFilter === c ? "active" : "";
        btn.innerHTML = escapeHtml(c) + "<span class=\"att-n\">" + sum.byClass[c].count + "</span>";
        btn.addEventListener("click", function () {
          state.classFilter = c;
          renderAll();
        });
        chipsEl.appendChild(btn);
      });
    }

    document.querySelectorAll("[data-att-view]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-att-view") === state.view);
    });

    var classesToShow = state.classFilter
      ? (sum.byClass[state.classFilter] ? [state.classFilter] : [])
      : sum.classOrder.slice();

    if (!classesToShow.length) {
      bodyEl.innerHTML = "<p class=\"att-empty-hint\">此篩選無拍卡紀錄。</p>";
      return;
    }

    function rowHtml(r) {
      return "<div class=\"att-row\">" +
        "<span class=\"att-no\">" + escapeHtml(r.no) + "</span>" +
        "<span class=\"att-name\">" + escapeHtml(displayName(r)) + "</span>" +
        "<span class=\"att-time\" title=\"首次 " + escapeHtml(U.shortTime(r.firstTap)) + "\">" +
        escapeHtml(U.shortTime(r.lastTap)) + "</span></div>";
    }

    if (state.view === "list") {
      var flat = [];
      classesToShow.forEach(function (c) {
        (sum.byClass[c].students || []).forEach(function (r) { flat.push(r); });
      });
      flat.sort(function (a, b) {
        if (a.lastTap !== b.lastTap) return a.lastTap < b.lastTap ? 1 : -1;
        if (a.className !== b.className) return String(a.className).localeCompare(String(b.className));
        return (parseInt(a.no, 10) || 0) - (parseInt(b.no, 10) || 0);
      });
      bodyEl.innerHTML = "<div class=\"att-list\">" + flat.map(rowHtml).join("") + "</div>";
    } else {
      var htmlParts = [];
      classesToShow.forEach(function (c) {
        var block = sum.byClass[c];
        var classTotal = roster && roster.classes && roster.classes[c] ? roster.classes[c] : null;
        var countLabel = classTotal
          ? (block.count + "／" + classTotal)
          : String(block.count);
        htmlParts.push(
          "<div class=\"att-class-block\">" +
          "<h3>" + escapeHtml(c) + "<span class=\"att-n\">已到 " + escapeHtml(countLabel) + "</span></h3>" +
          "<div class=\"att-list\">" + block.students.map(rowHtml).join("") + "</div></div>"
        );
      });
      bodyEl.innerHTML = htmlParts.join("");
    }
  }

  function bindUi() {
    if (state.bound) return;
    state.bound = true;
    var uploadBtn = $("home-att-upload");
    var fileInput = $("home-att-file");
    var sampleBtn = $("home-att-sample");
    var clearBtn = $("home-att-clear");
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener("click", function () { fileInput.click(); });
      fileInput.addEventListener("change", function () {
        var f = fileInput.files && fileInput.files[0];
        if (f) handleFile(f);
        fileInput.value = "";
      });
    }
    if (sampleBtn) sampleBtn.addEventListener("click", loadSample);
    if (clearBtn) clearBtn.addEventListener("click", clearFocusDate);
    document.querySelectorAll("[data-att-view]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.view = b.getAttribute("data-att-view") || "byclass";
        renderAll();
      });
    });
  }

  function show() {
    bindUi();
    if (!state.loaded && !state.loading) {
      Promise.all([loadFromCloud(), loadRoster()]).then(function () {
        renderAll();
      });
    } else {
      renderAll();
    }
  }

  window.SchoolAdminGateAttendance = {
    show: show,
    refresh: function () {
      state.loaded = false;
      return Promise.all([loadFromCloud(), loadRoster()]);
    }
  };
})();
