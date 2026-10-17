/**
 * Login gate mascot — Motion Prompt #011 Squash & stretch.
 * // Motion Prompt #011 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#011
 *
 * Ports kit helpers #011 needs (pure u-based draw). Demo character kept;
 * timings/easing unchanged from upstream.
 * Continuous loop while the login gate is visible (u = t % CYC).
 */
(function () {
  "use strict";

  // Motion Prompt #011 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#011

  var CW = 539;
  var CH = 208;
  var CYC = 4.7;

  var C = {
    navy: "#0F1A3D",
    navy3: "#2A3D80",
    coral: "#FF6B5C",
    yel: "#FFC83D"
  };

  var lerp = function (a, b, x) {
    return a + (b - a) * x;
  };
  var mod = function (a, n) {
    return ((a % n) + n) % n;
  };

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function stage(k, col) {
    k.fillStyle = col || C.navy;
    k.fillRect(0, 0, CW, CH);
  }

  // @element 11 — Squash & stretch (timings/easing exact from published code)
  function drawSquashStretch(k, w, h, u) {
    stage(k);
    var T = CYC / 4;
    var q = mod(u, T) / T;
    var c = 0.1;
    var floor = h - 28;
    var R = 37;
    var Hgt = 92;
    var X = w / 2 + 150 * Math.sin((u / CYC) * Math.PI * 2);
    var sy;
    var yb;
    var grounded = false;
    if (q < c || q > 1 - c) {
      var d = (q < c ? q : 1 - q) / c;
      sy = lerp(0.52, 1.28, d * d);
      yb = floor;
      grounded = true;
    } else {
      var qq = (q - c) / (1 - 2 * c);
      var sp = Math.abs(2 * qq - 1);
      yb = floor - Hgt * (1 - sp * sp);
      sy = 1 + 0.28 * Math.pow(sp, 3);
    }
    var sx = 1 / sy;
    var hg = (floor - yb) / Hgt;
    k.fillStyle = C.navy3;
    rr(k, 40, floor, w - 80, 5, 2.5);
    k.fill();
    k.fillStyle = "rgba(0,0,0,.32)";
    k.beginPath();
    k.ellipse(
      X,
      floor + 9,
      R * 1.2 * (1 - hg * 0.55) * Math.max(1, sx),
      6 * (1 - hg * 0.5),
      0,
      0,
      7
    );
    k.fill();
    // Landing splash lines
    var dq = q < 0.5 ? q : q - 1;
    if (Math.abs(dq) < 0.16 && dq > -0.02) {
      var t = (dq + 0.02) / 0.18;
      k.strokeStyle = C.yel;
      k.lineWidth = 5 * (1 - t);
      k.lineCap = "round";
      [-1, 1].forEach(function (s) {
        k.beginPath();
        k.moveTo(X + s * (50 + 28 * t), floor - 6 - 10 * t);
        k.lineTo(X + s * (62 + 40 * t), floor - 12 - 20 * t);
        if (t < 0.97) k.stroke();
      });
    }
    k.save();
    k.translate(X, yb);
    k.scale(sx, sy);
    k.fillStyle = C.coral;
    k.beginPath();
    k.arc(0, -R, R, 0, 7);
    k.fill();
    k.fillStyle = "#fff";
    k.beginPath();
    k.ellipse(-12, -R - 4, 7, 9.5, 0, 0, 7);
    k.ellipse(12, -R - 4, 7, 9.5, 0, 0, 7);
    k.fill();
    k.fillStyle = C.navy;
    k.beginPath();
    k.arc(-10.5, -R - 3, 3.8, 0, 7);
    k.arc(13.5, -R - 3, 3.8, 0, 7);
    k.fill();
    k.restore();
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
    var host = document.getElementById("gate-mascot");
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
    var elapsed = (now - t0) / 1000;
    // Continuous loop while gate visible.
    var u = elapsed % CYC;
    var dpr = canvas.width / CW;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CW, CH);
    ctx.save();
    drawSquashStretch(ctx, CW, CH, u);
    ctx.restore();
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    if (!gateVisible()) return;
    if (!ensureCanvas()) return;
    var host = document.getElementById("gate-mascot");
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
    var host = document.getElementById("gate-mascot");
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

  window.LwfssLoginMascot = { start: start, stop: stop, sync: sync };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
