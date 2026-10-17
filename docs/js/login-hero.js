/**
 * Login gate hero — Motion Prompt #005 Mask reveal.
 * // Motion Prompt #005 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#005
 *
 * Ports only the kit helpers #005 needs (pure u-based draw). Content localized
 * for LWFSS school-admin; timings/easing unchanged from upstream.
 */
(function () {
  "use strict";

  // Motion Prompt #005 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#005

  var CW = 539;
  var CH = 208;
  var CYC = 4.7;

  var C = {
    navy: "#0F1A3D",
    coral: "#FF6B5C",
    yel: "#FFC83D",
    // Brand-friendly divider for dark login stage (neon cyan from app dark theme)
    cyan: "#22d3ee"
  };

  var DISP = '"Avenir Next", "Helvetica Neue", system-ui, sans-serif';
  // Traditional Chinese stack used across the app (Cantonese copy)
  var TC =
    '"PingFang HK", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", "Hiragino Sans GB", sans-serif';

  var clamp = function (x, a, b) {
    if (a === undefined) a = 0;
    if (b === undefined) b = 1;
    return Math.min(b, Math.max(a, x));
  };
  var P = function (t, a, b) {
    return clamp((t - a) / (b - a));
  };
  var eIO = function (x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  };
  var eOut5 = function (x) {
    return 1 - Math.pow(1 - x, 5);
  };
  var eIn = function (x) {
    return x * x * x;
  };
  var mod = function (a, n) {
    return ((a % n) + n) % n;
  };
  var backIn = function (x, s) {
    if (s === undefined) s = 1.70158;
    return (s + 1) * x * x * x - s * x * x;
  };

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function txt(ctx, s, x, y, font, col, align, base, ls) {
    if (align === undefined) align = "left";
    if (base === undefined) base = "alphabetic";
    if (ls === undefined) ls = "0px";
    ctx.font = font;
    ctx.fillStyle = col;
    ctx.textAlign = align;
    ctx.textBaseline = base;
    ctx.letterSpacing = ls;
    ctx.fillText(s, x, y);
    ctx.letterSpacing = "0px";
  }

  function stage(k, col) {
    k.fillStyle = col || C.navy;
    k.fillRect(0, 0, CW, CH);
  }

  // @element 05 — Mask reveal (content only changed; timings/easing exact)
  function drawMaskReveal(k, w, h, u) {
    stage(k);
    var T = CYC / 2;
    var lu = mod(u, T);
    var X = w / 2;
    var LY = 124;
    var lg = eIO(P(lu, 0.1, 0.5)) * (1 - eIO(P(lu, 2.05, 2.3)));
    // Top: slides up from below the line
    var up =
      (1 - eOut5(P(lu, 0.35, 1.0))) * 120 +
      backIn(P(lu, 1.7, 2.05), 1.2) * -150;
    k.save();
    k.beginPath();
    k.rect(0, 8, w, LY - 8 - 5);
    k.clip();
    txt(k, "LWFSS", X, LY - 14 + up, "800 98px " + DISP, "#fff", "center", "alphabetic", "1px");
    k.restore();
    // Bottom: slides down from above the line
    var dn =
      (1 - eOut5(P(lu, 0.55, 1.15))) * -60 +
      eIn(P(lu, 1.75, 2.05)) * 70;
    k.save();
    k.beginPath();
    k.rect(0, LY + 5, w, 52);
    k.clip();
    txt(
      k,
      "行政系統",
      X,
      LY + 44 + dn,
      "700 32px " + TC,
      C.yel,
      "center",
      "alphabetic",
      "6px"
    );
    k.restore();
    if (lg > 0.005) {
      k.fillStyle = C.cyan;
      rr(k, X - 190 * lg, LY - 3, 380 * lg, 6, 3);
      k.fill();
    }
  }

  var rafId = 0;
  var t0 = 0;
  var canvas = null;
  var ctx = null;
  var running = false;
  var observer = null;

  function gateVisible() {
    var gate = document.getElementById("gate");
    return !!(gate && !gate.classList.contains("hidden"));
  }

  function ensureCanvas() {
    var host = document.getElementById("gate-hero");
    if (!host) return null;
    canvas = host.querySelector("canvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      canvas.width = CW;
      canvas.height = CH;
      host.appendChild(canvas);
    }
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pw = Math.round(CW * dpr);
    var ph = Math.round(CH * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx = canvas.getContext("2d");
    return canvas;
  }

  function frame(now) {
    if (!running) return;
    if (!gateVisible()) {
      stop();
      return;
    }
    if (!ctx && !ensureCanvas()) return;
    var u = ((now - t0) / 1000) % CYC;
    var dpr = canvas.width / CW;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CW, CH);
    ctx.save();
    drawMaskReveal(ctx, CW, CH, u);
    ctx.restore();
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    if (!gateVisible()) return;
    if (!ensureCanvas()) return;
    var host = document.getElementById("gate-hero");
    if (host) host.hidden = false;
    running = true;
    t0 = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    var host = document.getElementById("gate-hero");
    if (host) host.hidden = true;
  }

  function sync() {
    if (gateVisible()) start();
    else stop();
  }

  function boot() {
    sync();
    document.addEventListener("schooladmin:authed", stop);
    var gate = document.getElementById("gate");
    if (gate && typeof MutationObserver === "function") {
      observer = new MutationObserver(sync);
      observer.observe(gate, { attributes: true, attributeFilter: ["class"] });
    }
  }

  window.LwfssLoginHero = { start: start, stop: stop, sync: sync };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
