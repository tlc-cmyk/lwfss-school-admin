/**
 * Current lesson cards — Motion Prompt #095 Animated gradient.
 * // Motion Prompt #095 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#095
 *
 * Ambient loop behind timetable lesson card(s) that are happening now
 * (.tt-period.lesson.is-current in #home-periods / #home-cr-periods).
 * Not applied to free/break rows or the sticky #home-top bar.
 * Ports the drifting mesh from #095 (no lp browser frame, headline, or button).
 * Timings unchanged: u = t % 4.8.
 */
(function () {
  "use strict";

  // Motion Prompt #095 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#095

  /** Card / view design size from pack lp (view inside frame: VW×VH). */
  var DW = 511;
  var DH = 168;
  var CYC = 4.8;

  var SELECTOR =
    "#home-periods .tt-period.lesson.is-current, #home-cr-periods .tt-period.lesson.is-current";

  /**
   * Blob table from #095: [colorKey, x0, y0, r, ax, ay, phase]
   * Colors resolved per palette so dark mode can retint without changing motion.
   */
  var BLOB_MOTION = [
    ["c0", 150, 60, 230, 70, 30, 0],
    ["c1", 380, 40, 210, 60, 40, 2.1],
    ["c2", 330, 150, 240, 80, 30, 4.2],
    ["c3", 90, 170, 200, 50, 35, 1.0]
  ];

  var PALETTES = {
    light: {
      base: "#FFF1EB",
      c0: "#FF5A2C",
      c1: "#FFB08F",
      c2: "#3B64E8",
      c3: "#9DB6FB",
      /* Dark scrim so card text can stay light/readable over peach + blobs */
      scrim: "rgba(12, 28, 56, 0.38)"
    },
    dark: {
      base: "#081428",
      c0: "#FF6A3A",
      c1: "#C45A38",
      c2: "#22d3ee",
      c3: "#3B64E8",
      scrim: "rgba(0, 0, 0, 0.28)"
    }
  };

  /** @type {Map<Element, {canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, cssW: number, cssH: number, ro: ResizeObserver|null}>} */
  var instances = new Map();
  var rafId = 0;
  var t0 = 0;
  var running = false;
  var reduced = false;
  var rootMo = null;
  var themeMo = null;
  var syncQueued = false;

  function prefersReduced() {
    return !!(
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function isDark() {
    return document.documentElement.getAttribute("data-theme") === "dark";
  }

  function palette() {
    return isDark() ? PALETTES.dark : PALETTES.light;
  }

  /**
   * Draw only the drifting mesh (no frame / headline / button).
   * Coordinates are DW×DH; caller sets transform for cover + DPR.
   */
  function drawMesh(k, u, pal) {
    var a = (2 * Math.PI * u) / CYC;
    k.fillStyle = pal.base;
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
    if (pal.scrim) {
      k.fillStyle = pal.scrim;
      k.fillRect(-80, -80, DW + 160, DH + 160);
    }
  }

  function sizeCanvas(inst, host) {
    var canvas = inst.canvas;
    var rect = host.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    if (w === inst.cssW && h === inst.cssH && canvas.width) return true;
    inst.cssW = w;
    inst.cssH = h;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pw = Math.round(w * dpr);
    var ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    return true;
  }

  function applyCoverTransform(inst) {
    var canvas = inst.canvas;
    var ctx = inst.ctx;
    var dpr = canvas.width / inst.cssW;
    var s = Math.max(inst.cssW / DW, inst.cssH / DH);
    var ox = (inst.cssW - DW * s) / 2;
    var oy = (inst.cssH - DH * s) / 2;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
  }

  function paintOne(inst, host, u) {
    if (!inst.ctx) return;
    if (!sizeCanvas(inst, host)) return;
    applyCoverTransform(inst);
    inst.ctx.save();
    drawMesh(inst.ctx, u, palette());
    inst.ctx.restore();
  }

  function paintAll(u) {
    instances.forEach(function (inst, host) {
      if (!document.body.contains(host)) return;
      paintOne(inst, host, u);
    });
  }

  function attach(host) {
    if (instances.has(host)) return;
    var canvas = host.querySelector("canvas.lesson-now-bg");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = "lesson-now-bg";
      canvas.setAttribute("aria-hidden", "true");
      host.insertBefore(canvas, host.firstChild);
    }
    var ctx = canvas.getContext("2d");
    var inst = {
      canvas: canvas,
      ctx: ctx,
      cssW: 0,
      cssH: 0,
      ro: null
    };
    host.classList.add("has-lesson-now-gradient");
    if (typeof ResizeObserver === "function") {
      inst.ro = new ResizeObserver(function () {
        inst.cssW = 0;
        inst.cssH = 0;
        var u = reduced
          ? 0
          : running
            ? ((performance.now() - t0) / 1000) % CYC
            : 0;
        paintOne(inst, host, u);
      });
      inst.ro.observe(host);
    }
    instances.set(host, inst);
    paintOne(inst, host, reduced ? 0 : running ? ((performance.now() - t0) / 1000) % CYC : 0);
  }

  function detach(host) {
    var inst = instances.get(host);
    if (!inst) return;
    if (inst.ro) {
      try {
        inst.ro.disconnect();
      } catch (e) { /* ignore */ }
      inst.ro = null;
    }
    if (inst.canvas && inst.canvas.parentNode === host) {
      host.removeChild(inst.canvas);
    }
    host.classList.remove("has-lesson-now-gradient");
    instances.delete(host);
  }

  function sync() {
    var live = document.querySelectorAll(SELECTOR);
    var keep = new Set();
    for (var i = 0; i < live.length; i++) {
      keep.add(live[i]);
      attach(live[i]);
    }
    var stale = [];
    instances.forEach(function (_inst, host) {
      if (!keep.has(host) || !document.body.contains(host)) stale.push(host);
    });
    for (var j = 0; j < stale.length; j++) detach(stale[j]);

    if (instances.size === 0) {
      stopLoop();
      return;
    }
    if (reduced || prefersReduced()) {
      reduced = true;
      stopLoop();
      paintAll(0);
      return;
    }
    if (!running) startLoop();
  }

  function queueSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(function () {
      syncQueued = false;
      sync();
    });
  }

  function frame(now) {
    if (!running) return;
    if (instances.size === 0) {
      stopLoop();
      return;
    }
    if (document.visibilityState === "hidden") {
      rafId = requestAnimationFrame(frame);
      return;
    }
    var elapsed = (now - t0) / 1000;
    var u = elapsed % CYC;
    paintAll(u);
    rafId = requestAnimationFrame(frame);
  }

  function startLoop() {
    reduced = prefersReduced();
    if (reduced) {
      stopLoop();
      paintAll(0);
      return;
    }
    if (running) return;
    running = true;
    t0 = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    running = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function onReducedChange() {
    reduced = prefersReduced();
    if (reduced) {
      stopLoop();
      paintAll(0);
    } else if (instances.size) {
      startLoop();
    }
  }

  function boot() {
    var roots = [
      document.getElementById("home-periods"),
      document.getElementById("home-cr-periods")
    ].filter(Boolean);

    if (typeof MutationObserver === "function") {
      rootMo = new MutationObserver(function () {
        queueSync();
      });
      roots.forEach(function (root) {
        rootMo.observe(root, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["class"]
        });
      });

      themeMo = new MutationObserver(function () {
        if (instances.size) {
          var u = reduced
            ? 0
            : running
              ? ((performance.now() - t0) / 1000) % CYC
              : 0;
          paintAll(u);
        }
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
      if (document.visibilityState === "visible" && !reduced && instances.size) {
        if (!running) startLoop();
      }
    });

    document.addEventListener("schooladmin:authed", function () {
      queueSync();
    });

    var app = document.getElementById("app");
    if (app && typeof MutationObserver === "function") {
      var appMo = new MutationObserver(function () {
        if (!app.classList.contains("hidden")) queueSync();
      });
      appMo.observe(app, { attributes: true, attributeFilter: ["class"] });
    }

    // Period flips rebuild the list via home.js clock — MutationObserver covers
    // that; also refresh on a light interval so we recover if MO missed a class
    // swap without a childList change.
    setInterval(function () {
      if (document.visibilityState === "hidden") return;
      sync();
    }, 2000);

    sync();
  }

  window.LwfssLessonNowGradient = {
    sync: sync,
    refresh: queueSync,
    stop: function () {
      stopLoop();
      var hosts = [];
      instances.forEach(function (_i, h) {
        hosts.push(h);
      });
      hosts.forEach(detach);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
