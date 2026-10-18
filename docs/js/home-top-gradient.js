/**
 * Home top info bar — Motion Prompt #095 Animated gradient.
 * // Motion Prompt #095 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#095
 *
 * Ambient loop behind #home-top content only (not the function bar).
 * Ports the drifting mesh from #095 (no lp browser frame, headline, or button).
 * Timings unchanged: u = t % 4.8. Tone / dark mode shift palette only.
 */
(function () {
  "use strict";

  // Motion Prompt #095 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#095

  /** Card / view design size from pack lp (view inside frame: VW×VH). */
  var DW = 511;
  var DH = 168;
  var CYC = 4.8;

  /**
   * Blob table from #095: [colorKey, x0, y0, r, ax, ay, phase]
   * Colors resolved per palette so tone/dark can retint without changing motion.
   */
  var BLOB_MOTION = [
    ["c0", 150, 60, 230, 70, 30, 0],
    ["c1", 380, 40, 210, 60, 40, 2.1],
    ["c2", 330, 150, 240, 80, 30, 4.2],
    ["c3", 90, 170, 200, 50, 35, 1.0]
  ];

  /** Light: normal = exact #095; holiday warmer/redder; bf greener. */
  var PALETTES = {
    light: {
      normal: {
        base: "#FFF1EB",
        c0: "#FF5A2C",
        c1: "#FFB08F",
        c2: "#3B64E8",
        c3: "#9DB6FB",
        scrim: "rgba(12, 28, 56, 0.34)"
      },
      holiday: {
        base: "#FFE8E4",
        c0: "#FF3D2A",
        c1: "#FF9A7A",
        c2: "#E8483C",
        c3: "#FFB0A8",
        scrim: "rgba(56, 12, 12, 0.36)"
      },
      bf: {
        base: "#E8FFF4",
        c0: "#1FAF6B",
        c1: "#8FDBB0",
        c2: "#0D8A5A",
        c3: "#A8F0D0",
        scrim: "rgba(8, 40, 28, 0.36)"
      }
    },
    dark: {
      normal: {
        base: "#081428",
        c0: "#FF6A3A",
        c1: "#C45A38",
        c2: "#22d3ee",
        c3: "#3B64E8",
        scrim: "rgba(0, 0, 0, 0.22)"
      },
      holiday: {
        base: "#1a0808",
        c0: "#FF4A3A",
        c1: "#C04038",
        c2: "#f07167",
        c3: "#E8483C",
        scrim: "rgba(0, 0, 0, 0.22)"
      },
      bf: {
        base: "#041812",
        c0: "#2dd4bf",
        c1: "#1A9B6C",
        c2: "#34d399",
        c3: "#0D8A5A",
        scrim: "rgba(0, 0, 0, 0.22)"
      }
    }
  };

  var host = null;
  var canvas = null;
  var ctx = null;
  var rafId = 0;
  var t0 = 0;
  var running = false;
  var reduced = false;
  var ro = null;
  var mo = null;
  var themeMo = null;
  var cssW = 0;
  var cssH = 0;

  function prefersReduced() {
    return !!(
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function isDark() {
    return document.documentElement.getAttribute("data-theme") === "dark";
  }

  function toneOf(el) {
    var t = el && el.getAttribute("data-tone");
    if (t === "holiday" || t === "bf") return t;
    return "normal";
  }

  function paletteFor(el) {
    var mode = isDark() ? "dark" : "light";
    var tone = toneOf(el);
    return PALETTES[mode][tone] || PALETTES[mode].normal;
  }

  /**
   * Draw only the drifting mesh (no frame / headline / button).
   * Coordinates are DW×DH; caller sets transform for cover + DPR.
   */
  function drawMesh(k, u, pal) {
    var a = (2 * Math.PI * u) / CYC;
    k.fillStyle = pal.base;
    // Pad so cover-scale never shows gaps at edges
    k.fillRect(-80, -80, DW + 160, DH + 160);
    for (var i = 0; i < BLOB_MOTION.length; i++) {
      var b = BLOB_MOTION[i];
      var col = pal[b[0]];
      var x0 = b[1];
      var y0 = b[2];
      var r = b[3];
      var ax = b[4];
      var ay = b[5];
      var ph = b[6];
      var x = x0 + ax * Math.cos(a + ph);
      var y = y0 + ay * Math.sin(a + ph);
      var g = k.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col);
      g.addColorStop(1, "rgba(255,255,255,0)");
      k.globalAlpha = 0.85;
      k.fillStyle = g;
      k.fillRect(-80, -80, DW + 160, DH + 160);
      k.globalAlpha = 1;
    }
    // Keep white sticky text readable over peach / light blobs
    if (pal.scrim) {
      k.fillStyle = pal.scrim;
      k.fillRect(-80, -80, DW + 160, DH + 160);
    }
  }

  function ensureCanvas() {
    host = document.getElementById("home-top");
    if (!host) return null;
    canvas = host.querySelector("canvas.home-top-bg");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = "home-top-bg";
      canvas.setAttribute("aria-hidden", "true");
      host.insertBefore(canvas, host.firstChild);
    }
    ctx = canvas.getContext("2d");
    return canvas;
  }

  function sizeCanvas() {
    if (!host || !canvas) return false;
    var rect = host.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    if (w === cssW && h === cssH && canvas.width) return true;
    cssW = w;
    cssH = h;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pw = Math.round(w * dpr);
    var ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    return true;
  }

  /** Cover DW×DH onto cssW×cssH (uniform), then apply DPR. */
  function applyCoverTransform() {
    var dpr = canvas.width / cssW;
    var s = Math.max(cssW / DW, cssH / DH);
    var ox = (cssW - DW * s) / 2;
    var oy = (cssH - DH * s) / 2;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
  }

  function paint(u) {
    if (!ctx && !ensureCanvas()) return;
    if (!sizeCanvas()) return;
    var pal = paletteFor(host);
    applyCoverTransform();
    ctx.save();
    drawMesh(ctx, u, pal);
    ctx.restore();
  }

  function frame(now) {
    if (!running) return;
    if (!host || !document.body.contains(host)) {
      stop();
      return;
    }
    if (document.visibilityState === "hidden") {
      rafId = requestAnimationFrame(frame);
      return;
    }
    var elapsed = (now - t0) / 1000;
    var u = elapsed % CYC;
    paint(u);
    rafId = requestAnimationFrame(frame);
  }

  function freezeFirstFrame() {
    t0 = performance.now();
    paint(0);
  }

  function start() {
    if (!ensureCanvas()) return;
    sizeCanvas();
    reduced = prefersReduced();
    if (reduced) {
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      freezeFirstFrame();
      return;
    }
    if (running) return;
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

  function repaintStaticOrKick() {
    if (reduced || prefersReduced()) {
      reduced = true;
      freezeFirstFrame();
      return;
    }
    if (!running) start();
    else paint(((performance.now() - t0) / 1000) % CYC);
  }

  function onReducedChange() {
    reduced = prefersReduced();
    if (reduced) {
      stop();
      freezeFirstFrame();
    } else {
      start();
    }
  }

  function boot() {
    if (!ensureCanvas()) return;
    host.classList.add("has-home-top-gradient");

    if (typeof ResizeObserver === "function") {
      ro = new ResizeObserver(function () {
        cssW = 0;
        cssH = 0;
        repaintStaticOrKick();
      });
      ro.observe(host);
    } else {
      window.addEventListener("resize", function () {
        cssW = 0;
        cssH = 0;
        repaintStaticOrKick();
      });
    }

    if (typeof MutationObserver === "function") {
      mo = new MutationObserver(function () {
        repaintStaticOrKick();
      });
      mo.observe(host, { attributes: true, attributeFilter: ["data-tone"] });

      themeMo = new MutationObserver(function () {
        repaintStaticOrKick();
      });
      themeMo.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"]
      });
    }

    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (mq.addEventListener) mq.addEventListener("change", onReducedChange);
      else if (mq.addListener) mq.addListener(onReducedChange);
    }

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && !reduced) {
        if (!running) start();
      }
    });

    // App is hidden until auth; resize + start when it shows
    document.addEventListener("schooladmin:authed", function () {
      cssW = 0;
      cssH = 0;
      requestAnimationFrame(function () {
        repaintStaticOrKick();
      });
    });
    var app = document.getElementById("app");
    if (app && typeof MutationObserver === "function") {
      var appMo = new MutationObserver(function () {
        if (!app.classList.contains("hidden")) {
          cssW = 0;
          cssH = 0;
          requestAnimationFrame(function () {
            repaintStaticOrKick();
          });
        }
      });
      appMo.observe(app, { attributes: true, attributeFilter: ["class"] });
    }

    start();
  }

  window.LwfssHomeTopGradient = {
    start: start,
    stop: stop,
    refresh: repaintStaticOrKick
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
