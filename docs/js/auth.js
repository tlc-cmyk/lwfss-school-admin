(function () {
  "use strict";

  var STORAGE_KEY = "lwfss_school_admin_session";
  var cfg = window.SCHOOL_ADMIN_CONFIG || {};
  var allowedDomain = (cfg.allowedDomain || "g.lwfss.edu.hk").toLowerCase();

  function $(id) { return document.getElementById(id); }

  function loadSession() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveSession(session) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch (e) { /* ignore */ }
  }

  function clearSession() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  function emailAllowed(email) {
    if (!email) return false;
    var parts = String(email).toLowerCase().split("@");
    return parts.length === 2 && parts[1] === allowedDomain;
  }

  function showApp(session) {
    var gate = $("gate");
    var app = $("app");
    if (gate) gate.classList.add("hidden");
    if (app) app.classList.remove("hidden");
    var who = $("signed-in-as");
    if (who && session) {
      who.textContent = (session.name || session.email || "") +
        (session.email ? " · " + session.email : "");
    }
    window.__schoolAdminSession = session;
  }

  function showGate(message) {
    var gate = $("gate");
    var app = $("app");
    if (gate) gate.classList.remove("hidden");
    if (app) app.classList.add("hidden");
    var err = $("gate-err");
    if (err && message) err.textContent = message;
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

  function acceptCredential(response) {
    var err = $("gate-err");
    var payload = decodeJwtPayload(response.credential || "");
    if (!payload) {
      if (err) err.textContent = "無法驗證 Google 登入回應";
      return;
    }
    var email = (payload.email || "").toLowerCase();
    if (!emailAllowed(email)) {
      if (err) {
        err.textContent = "只允許 @" + allowedDomain + " 學校帳戶登入（你使用了 " +
          (email || "未知帳戶") + "）";
      }
      clearSession();
      return;
    }
    if (payload.email_verified === false) {
      if (err) err.textContent = "此 Google 帳戶尚未驗證電郵";
      return;
    }
    var session = {
      email: email,
      name: payload.name || payload.given_name || email.split("@")[0],
      picture: payload.picture || "",
      sub: payload.sub || "",
      at: Date.now(),
      method: "google"
    };
    saveSession(session);
    if (err) err.textContent = "";
    showApp(session);
  }

  function initGoogleButton() {
    var clientId = (cfg.googleClientId || "").trim();
    var slot = $("google-btn-slot");
    var hint = $("oauth-hint");
    var emergency = $("emergency-box");

    if (!clientId) {
      if (hint) {
        hint.classList.remove("hidden");
        hint.innerHTML =
          "尚未設定 Google OAuth Client ID。<br>" +
          "請 IT Coordinator 在 Google Cloud Console 建立網頁用戶端，" +
          "並把 Client ID 填入 <code>docs/js/config.js</code> 的 <code>googleClientId</code>。" +
          "<br>授權網域請加入 GitHub Pages 網址，並限制 Workspace 網域 <strong>" +
          allowedDomain + "</strong>。詳見 README。";
      }
      if (slot) slot.innerHTML = "";
    } else if (window.google && google.accounts && google.accounts.id) {
      if (hint) hint.classList.add("hidden");
      google.accounts.id.initialize({
        client_id: clientId,
        callback: acceptCredential,
        auto_select: false,
        hd: allowedDomain,
        context: "signin",
        ux_mode: "popup",
        cancel_on_tap_outside: true
      });
      if (slot) {
        slot.innerHTML = "";
        google.accounts.id.renderButton(slot, {
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: 280
        });
      }
    } else {
      if (hint) {
        hint.classList.remove("hidden");
        hint.textContent = "無法載入 Google Identity Services，請檢查網絡或稍後再試。";
      }
    }

    // 緊急通行碼：僅當 config 有設定時顯示（正式環境應留空）
    var pw = (cfg.emergencyPassword || "").trim();
    if (emergency) {
      if (pw) {
        emergency.classList.remove("hidden");
      } else {
        emergency.classList.add("hidden");
      }
    }
  }

  function setupEmergency() {
    var form = $("emergency-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var pw = (cfg.emergencyPassword || "").trim();
      var input = $("emergency-input");
      var err = $("gate-err");
      if (!pw) {
        if (err) err.textContent = "未啟用緊急通行碼，請使用學校 Google 帳戶登入";
        return;
      }
      if ((input.value || "").trim() === pw) {
        var session = {
          email: "emergency@" + allowedDomain,
          name: "緊急通行",
          picture: "",
          sub: "emergency",
          at: Date.now(),
          method: "emergency"
        };
        saveSession(session);
        if (err) err.textContent = "";
        showApp(session);
      } else {
        if (err) err.textContent = "通行碼不正確";
        if (input) input.select();
      }
    });
  }

  function setupSignOut() {
    var btn = $("sign-out");
    if (!btn) return;
    btn.addEventListener("click", function () {
      clearSession();
      if (window.google && google.accounts && google.accounts.id) {
        try { google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ }
      }
      location.reload();
    });
  }

  function init() {
    setupSignOut();
    setupEmergency();

    var existing = loadSession();
    if (existing && emailAllowed(existing.email)) {
      showApp(existing);
    } else {
      clearSession();
      showGate("");
    }

    // GIS 可能稍後才 ready
    var tries = 0;
    function tryInit() {
      tries += 1;
      initGoogleButton();
      var clientId = (cfg.googleClientId || "").trim();
      if (clientId && !(window.google && google.accounts && google.accounts.id) && tries < 40) {
        setTimeout(tryInit, 150);
      }
    }
    tryInit();
  }

  window.SchoolAdminAuth = {
    getSession: loadSession,
    signOut: function () {
      clearSession();
      location.reload();
    },
    emailAllowed: emailAllowed
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
