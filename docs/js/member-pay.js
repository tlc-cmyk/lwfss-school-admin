/**
 * 會員付費 panel — Motion Prompt #022 Light sweep accent.
 * // Motion Prompt #022 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#022
 *
 * Ports kit helpers #022 needs (pure u-based draw). Content localized for
 * LWFSS school-admin; timings/easing unchanged from upstream.
 * Plays one sweep (+ sparkle) when the panel opens, then freezes on the
 * finished badge (no active band). Stub only — no payment backend.
 */
(function () {
  "use strict";

  // Motion Prompt #022 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#022

  var CW = 539;
  var CH = 208;
  var CYC = 4.7;

  var C = {
    navy: "#0F1A3D",
    yel: "#FFC83D"
  };

  var DISP = '"Avenir Next", "Helvetica Neue", system-ui, sans-serif';
  var TC =
    '"PingFang HK", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", "Hiragino Sans GB", sans-serif';

  var clamp = function (x, a, b) {
    if (a === undefined) a = 0;
    if (b === undefined) b = 1;
    return Math.min(b, Math.max(a, x));
  };
  var lerp = function (a, b, x) {
    return a + (b - a) * x;
  };
  var P = function (t, a, b) {
    return clamp((t - a) / (b - a));
  };
  // Quadratic ease-in-out (kit eIOs)
  var eIOs = function (x) {
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  };
  var mod = function (a, n) {
    return ((a % n) + n) % n;
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

  function star(k, x, y, R, rot, inner, n) {
    if (rot === undefined) rot = 0;
    if (inner === undefined) inner = 0.5;
    if (n === undefined) n = 5;
    k.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var r = i % 2 ? R * inner : R;
      var a = rot - Math.PI / 2 + (i * Math.PI) / n;
      var px = x + Math.cos(a) * r;
      var py = y + Math.sin(a) * r;
      if (i) k.lineTo(px, py);
      else k.moveTo(px, py);
    }
    k.closePath();
  }

  // Transparent stage — badge sits on the panel card (no navy fill).
  // @element 22 — Light sweep (content localized; timings/easing exact)
  function drawLightSweep(k, w, h, u) {
    var T = CYC / 2;
    var lu = mod(u, T);
    var p = eIOs(P(lu, 0.45, 1.5));
    var BW = 400;
    var BH = 112;
    var X = w / 2 - BW / 2;
    var Y = h / 2 - BH / 2;

    k.fillStyle = "rgba(0,0,0,.3)";
    rr(k, X + 3, Y + 9, BW, BH, 28);
    k.fill();

    var g = k.createLinearGradient(X, Y, X + BW, Y + BH);
    g.addColorStop(0, "#2B62E0");
    g.addColorStop(1, "#4E8BFF");
    k.fillStyle = g;
    rr(k, X, Y, BW, BH, 28);
    k.fill();

    // Accent star (kept from upstream layout)
    k.fillStyle = C.yel;
    star(k, X + 56, Y + BH / 2, 26, 0, 0.5);
    k.lineJoin = "round";
    k.strokeStyle = C.yel;
    k.lineWidth = 4;
    k.stroke();
    k.fill();

    // Localized title
    txt(
      k,
      "會員付費",
      X + 100,
      Y + BH / 2 + 2,
      "800 40px " + TC,
      "#fff",
      "left",
      "middle",
      "2px"
    );

    if (p > 0 && p < 1) {
      k.save();
      rr(k, X, Y, BW, BH, 28);
      k.clip();
      k.translate(lerp(X - 130, X + BW + 130, p), Y + BH / 2);
      k.rotate(0.42);
      var gr = k.createLinearGradient(-58, 0, 58, 0);
      gr.addColorStop(0, "rgba(255,255,255,0)");
      gr.addColorStop(0.5, "rgba(255,255,255,.72)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      k.fillStyle = gr;
      k.fillRect(-58, -160, 116, 320);
      k.fillStyle = "rgba(255,255,255,.5)";
      k.fillRect(78, -160, 12, 320);
      k.restore();
    }

    // Exit sparkle (1.38–1.98 s of half-cycle)
    var tt = lu - 1.38;
    if (tt > 0 && tt < 0.6) {
      var q = tt / 0.6;
      var sc = Math.sin(Math.PI * q) * (1 + 0.2 * (1 - q));
      k.save();
      k.translate(X + BW - 8, Y + 6);
      k.rotate(q * 0.9);
      k.fillStyle = "#fff";
      star(k, 0, 0, 30 * sc, 0, 0.22, 4);
      k.fill();
      k.restore();
    }
  }

  // After sweep + sparkle (~1.98 s); freeze mid half-cycle with clean badge.
  var HOLD_U = 2.05;

  var rafId = 0;
  var t0 = 0;
  var canvas = null;
  var ctx = null;
  var running = false;

  function panelVisible() {
    var panel = document.getElementById("home-panel-member-pay");
    return !!(panel && !panel.classList.contains("hidden") && !panel.hasAttribute("hidden"));
  }

  function ensureCanvas() {
    var host = document.getElementById("member-pay-hero");
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
    if (!panelVisible()) {
      stop();
      return;
    }
    if (!ctx && !ensureCanvas()) return;
    var elapsed = (now - t0) / 1000;
    var done = elapsed >= HOLD_U;
    var u = done ? HOLD_U : elapsed;
    var dpr = canvas.width / CW;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CW, CH);
    ctx.save();
    drawLightSweep(ctx, CW, CH, u);
    ctx.restore();
    if (done) {
      running = false;
      rafId = 0;
      return;
    }
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (!panelVisible()) return;
    if (!ensureCanvas()) return;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
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
  }

  function show() {
    start();
  }

  window.SchoolAdminMemberPay = {
    show: show,
    start: start,
    stop: stop
  };
})();
