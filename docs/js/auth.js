(function () {
  "use strict";

  var LEGACY_KEY = "lwfss_school_admin_session";
  var SUPABASE_JS = "https://esm.sh/@supabase/supabase-js@2.117.3";
  var cfg = window.SCHOOL_ADMIN_CONFIG || {};
  var allowedDomain = (cfg.allowedDomain || "g.lwfss.edu.hk").toLowerCase();
  var client = null;
  var publishedEmail = "";
  var gateMessage = "";
  var booted = false;

  function $(id) { return document.getElementById(id); }

  function emailAllowed(email) {
    if (!email) return false;
    var parts = String(email).toLowerCase().split("@");
    return parts.length === 2 && parts[1] === allowedDomain;
  }

  function sessionEmail(session) {
    var user = session && session.user;
    if (!user) return "";
    var meta = user.user_metadata || {};
    return String(user.email || meta.email || "").toLowerCase();
  }

  function displayName(user, email) {
    var meta = (user && user.user_metadata) || {};
    return meta.full_name || meta.name || meta.given_name || (email ? email.split("@")[0] : "");
  }

  function roleLabel(session) {
    if (!session) return "";
    if (session.role === "staff") {
      var title = session.staff && session.staff.role_title;
      return title ? ("教職員（" + title + "）") : "教職員";
    }
    if (session.role === "student") return "學生";
    return "載入身分中…";
  }

  function applyRoleView(session) {
    var role = (session && session.role) || "";
    if (role === "staff" || role === "student") {
      document.documentElement.setAttribute("data-app-role", role);
    } else {
      document.documentElement.removeAttribute("data-app-role");
    }
  }

  function showApp(session) {
    var gate = $("gate");
    var app = $("app");
    if (gate) gate.classList.add("hidden");
    if (app) app.classList.remove("hidden");
    applyRoleView(session);
    var who = $("signed-in-as");
    if (who && session) {
      var name = session.name || "";
      var email = session.email || "";
      var label = roleLabel(session);
      var html = "";
      if (name) html += '<span class="who-name">' + escapeText(name) + '</span>';
      if (email) html += (html ? " · " : "") + '<span class="who-email">' + escapeText(email) + '</span>';
      if (label) {
        var badgeClass = session.role === "staff" ? "staff" : (session.role === "student" ? "student" : "");
        html += ' <span class="role-badge ' + badgeClass + '">' + escapeText(label) + '</span>';
      }
      who.innerHTML = html;
    }
    window.__schoolAdminSession = session;
  }

  function escapeText(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showGate(message) {
    var gate = $("gate");
    var app = $("app");
    if (gate) gate.classList.remove("hidden");
    if (app) app.classList.add("hidden");
    var err = $("gate-err");
    if (err) err.textContent = message || "";
    document.documentElement.removeAttribute("data-app-role");
    window.__schoolAdminSession = null;
  }

  function publish(session) {
    window.__schoolAdminSession = session;
    showApp(session);
    try {
      window.dispatchEvent(new CustomEvent("schooladmin:authed", { detail: session }));
    } catch (e) { /* ignore */ }
  }

  function loadEmergency() {
    try {
      var raw = sessionStorage.getItem(LEGACY_KEY);
      var session = raw ? JSON.parse(raw) : null;
      var pw = (cfg.emergencyPassword || "").trim();
      if (!pw || !session || session.method !== "emergency") return null;
      if (!emailAllowed(session.email)) return null;
      return session;
    } catch (e) {
      return null;
    }
  }

  function saveEmergency(session) {
    try { sessionStorage.setItem(LEGACY_KEY, JSON.stringify(session)); } catch (e) { /* ignore */ }
  }

  function clearEmergency() {
    try { sessionStorage.removeItem(LEGACY_KEY); } catch (e) { /* ignore */ }
  }

  function setHint() {
    var hint = $("oauth-hint");
    if (hint) {
      hint.textContent = "";
      hint.classList.add("hidden");
    }
  }

  function lookupStaffAndPublish(baseSession) {
    var email = (baseSession.email || "").toLowerCase();
    var finish = function (role, staffRow, errMsg) {
      baseSession.role = role;
      baseSession.staff = staffRow || null;
      if (errMsg) baseSession.roleLookupError = errMsg;
      else delete baseSession.roleLookupError;
      publish(baseSession);
    };
    if (!client || !email) {
      finish("student", null, "");
      return;
    }
    client
      .from("staff")
      .select("email,short_name,name,role_title,class_teacher,is_teaching_staff")
      .eq("email", email)
      .maybeSingle()
      .then(function (result) {
        if (result && result.error) {
          // Fail closed for teacher UI: treat as student if lookup fails
          finish("student", null, result.error.message || "staff lookup failed");
          return;
        }
        var row = result && result.data;
        if (row && row.is_teaching_staff !== false) {
          // Prefer staff Chinese name when available
          if (row.name) baseSession.name = row.name;
          finish("staff", row, "");
        } else {
          finish("student", null, "");
        }
      })
      .catch(function (e) {
        finish("student", null, e && e.message ? e.message : "staff lookup failed");
      });
  }

  function acceptSupabaseSession(session) {
    if (!session || !session.user) {
      if (!publishedEmail && !loadEmergency()) showGate(gateMessage);
      return;
    }
    var email = sessionEmail(session);
    if (!emailAllowed(email)) {
      var shown = email || "未知帳戶";
      publishedEmail = "";
      gateMessage = "只允許 @" + allowedDomain + " 學校帳戶登入（你使用了 " + shown + "）";
      showGate(gateMessage);
      if (client) {
        client.auth.signOut().catch(function () { /* ignore */ });
      }
      return;
    }
    if (publishedEmail === email && window.__schoolAdminSession && window.__schoolAdminSession.method === "supabase" && window.__schoolAdminSession.role) {
      showApp(window.__schoolAdminSession);
      return;
    }
    gateMessage = "";
    publishedEmail = email;
    var user = session.user;
    var meta = user.user_metadata || {};
    clearEmergency();
    lookupStaffAndPublish({
      email: email,
      name: displayName(user, email),
      picture: meta.avatar_url || meta.picture || "",
      sub: user.id || "",
      at: Date.now(),
      method: "supabase",
      role: ""
    });
  }

  function signInWithSupabase() {
    var err = $("gate-err");
    if (!client) {
      if (err) err.textContent = "尚未連上 Supabase，請稍後再試。";
      return;
    }
    var btn = $("supabase-login");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "正在前往 Google…";
    }
    client.auth.signInWithOAuth({
      provider: "google",
      options: {
        queryParams: {
          hd: allowedDomain,
          access_type: "online",
          prompt: "select_account"
        },
        redirectTo: window.location.origin + window.location.pathname
      }
    }).then(function (result) {
      if (result && result.error) {
        if (err) {
          err.textContent = "無法開始 Google 登入：" + (result.error.message || result.error) +
            "。請確認 Supabase 已啟用 Google provider。";
        }
        if (btn) {
          btn.disabled = false;
          btn.textContent = "使用學校 Google 帳戶登入";
        }
      }
    }).catch(function (e) {
      if (err) err.textContent = "無法開始 Google 登入：" + (e && e.message ? e.message : e);
      if (btn) {
        btn.disabled = false;
        btn.textContent = "使用學校 Google 帳戶登入";
      }
    });
  }

  function setupSupabaseButton() {
    var btn = $("supabase-login");
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", signInWithSupabase);
  }

  function enableSupabaseButton() {
    var btn = $("supabase-login");
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = "使用學校 Google 帳戶登入";
  }

  function decodeJwtPayload(token) {
    try {
      var mid = token.split(".")[1];
      var json = atob(mid.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  function acceptGisCredential(response) {
    var err = $("gate-err");
    var payload = decodeJwtPayload((response && response.credential) || "");
    if (!payload) {
      if (err) err.textContent = "無法驗證 Google 登入回應";
      return;
    }
    var email = String(payload.email || "").toLowerCase();
    if (!emailAllowed(email)) {
      if (err) {
        err.textContent = "只允許 @" + allowedDomain + " 學校帳戶登入（你使用了 " +
          (email || "未知帳戶") + "）";
      }
      return;
    }
    if (payload.email_verified === false) {
      if (err) err.textContent = "此 Google 帳戶尚未驗證電郵";
      return;
    }
    publishedEmail = email;
    publish({
      email: email,
      name: payload.name || payload.given_name || email.split("@")[0],
      picture: payload.picture || "",
      sub: payload.sub || "",
      at: Date.now(),
      method: "google",
      role: "student",
      staff: null
    });
    if (err) err.textContent = "";
  }

  function initOptionalGis() {
    var clientId = (cfg.googleClientId || "").trim();
    var slot = $("google-btn-slot");
    if (!clientId) {
      if (slot) slot.innerHTML = "";
      return;
    }
    if (!(window.google && google.accounts && google.accounts.id)) return;
    if (slot) {
      slot.innerHTML = "";
      var note = document.createElement("p");
      note.className = "muted";
      note.style.margin = "8px 0";
      note.textContent = "備援：GIS 按鈕（沒有 Supabase 工作階段，時間表只會用本地備份）";
      slot.appendChild(note);
      var mount = document.createElement("div");
      slot.appendChild(mount);
      google.accounts.id.initialize({
        client_id: clientId,
        callback: acceptGisCredential,
        auto_select: false,
        hd: allowedDomain,
        context: "signin",
        ux_mode: "popup",
        cancel_on_tap_outside: true
      });
      google.accounts.id.renderButton(mount, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: 280
      });
    }
  }

  function loadGisScript() {
    var clientId = (cfg.googleClientId || "").trim();
    if (!clientId) return;
    if (window.google && google.accounts && google.accounts.id) {
      initOptionalGis();
      return;
    }
    var existing = document.querySelector("script[data-gis='1']");
    if (existing) return;
    var s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.setAttribute("data-gis", "1");
    s.onload = function () {
      var tries = 0;
      (function tick() {
        tries += 1;
        if (window.google && google.accounts && google.accounts.id) initOptionalGis();
        else if (tries < 40) setTimeout(tick, 150);
      })();
    };
    document.head.appendChild(s);
  }

  function setupEmergency() {
    var emergency = $("emergency-box");
    var pw = (cfg.emergencyPassword || "").trim();
    if (emergency) {
      if (pw) emergency.classList.remove("hidden");
      else emergency.classList.add("hidden");
    }
    var form = $("emergency-form");
    if (!form || form.dataset.bound === "1") return;
    form.dataset.bound = "1";
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var password = (cfg.emergencyPassword || "").trim();
      var input = $("emergency-input");
      var err = $("gate-err");
      if (!password) {
        if (err) err.textContent = "未啟用緊急通行碼，請使用學校 Google 帳戶登入";
        return;
      }
      if (input && (input.value || "").trim() === password) {
        var session = {
          email: "emergency@" + allowedDomain,
          name: "緊急通行",
          picture: "",
          sub: "emergency",
          at: Date.now(),
          method: "emergency",
          role: "staff",
          staff: { email: "emergency@" + allowedDomain, short_name: "", name: "緊急通行", role_title: "緊急通行", class_teacher: null, is_teaching_staff: true }
        };
        saveEmergency(session);
        publishedEmail = session.email;
        if (err) err.textContent = "";
        publish(session);
      } else {
        if (err) err.textContent = "通行碼不正確";
        if (input) input.select();
      }
    });
  }

  function setupSignOut() {
    var btn = $("sign-out");
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", function () {
      clearEmergency();
      publishedEmail = "";
      var done = function () { location.reload(); };
      if (client) client.auth.signOut().then(done, done);
      else done();
    });
  }

  function bootClient() {
    var url = (cfg.supabaseUrl || "").trim();
    var key = (cfg.supabaseAnonKey || "").trim();
    var err = $("gate-err");
    if (!url || !key) {
      if (err) err.textContent = "尚未設定 Supabase URL 或 anon key（docs/js/config.js）。";
      return Promise.resolve(null);
    }
    return import(SUPABASE_JS).then(function (mod) {
      var createClient = mod.createClient;
      client = createClient(url, key, {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true
        }
      });
      window.__supabaseClient = client;
      enableSupabaseButton();
      client.auth.onAuthStateChange(function (_event, session) {
        acceptSupabaseSession(session);
      });
      return client.auth.getSession().then(function (result) {
        if (result && result.error) {
          if (err && !publishedEmail) err.textContent = "讀取登入狀態失敗：" + result.error.message;
          return null;
        }
        acceptSupabaseSession(result && result.data ? result.data.session : null);
        return client;
      });
    }).catch(function (e) {
      if (err) err.textContent = "無法載入 Supabase 程式庫，請檢查網絡後再試。";
      var btn = $("supabase-login");
      if (btn) btn.textContent = "使用學校 Google 帳戶登入";
      return null;
    });
  }

  function init() {
    if (booted) return;
    booted = true;
    setupSignOut();
    setupEmergency();
    setupSupabaseButton();
    setHint();
    loadGisScript();

    var emergency = loadEmergency();
    if (emergency) {
      publishedEmail = emergency.email;
      publish(emergency);
    } else {
      clearEmergency();
      showGate("");
    }
    bootClient();
  }

  window.SchoolAdminAuth = {
    getSession: function () { return window.__schoolAdminSession || null; },
    getClient: function () { return client; },
    getRole: function () {
      var s = window.__schoolAdminSession;
      return s && s.role ? s.role : "";
    },
    isStaff: function () {
      var s = window.__schoolAdminSession;
      return !!(s && s.role === "staff");
    },
    signOut: function () {
      clearEmergency();
      if (client) {
        client.auth.signOut().then(function () { location.reload(); }, function () { location.reload(); });
      } else {
        location.reload();
      }
    },
    emailAllowed: emailAllowed
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
