/**
 * Timetable holiday underlay — Motion Prompt #015 Particles.
 * // Motion Prompt #015 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#015
 *
 * Celebration fountain under #home-panel-tt (below day grid / periods area)
 * ONLY when the browsed day is a holiday / off day (html[data-tone=holiday]).
 * Hidden on normal / BF. Ports kit helpers #015 needs (pure u-based draw);
 * skips demo stage fill + emitter platform so particles sit on the panel.
 * Palette retinted to holiday red family (light + dark). Loop: u = t % 4.7.
 * prefers-reduced-motion: freeze on a mid-cycle frame (no rAF).
 */
(function () {
  "use strict";

  // Motion Prompt #015 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#015

  var CW = 539;
  var CH = 208;
  var CYC = 4.7;

  /** Mid-flight freeze frame when reduced motion is on. */
  var FREEZE_U = 0.85;

  var HOST_ID = "home-tt-holiday-particles";
  var PANEL_ID = "home-panel-tt";

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
  var smooth = function (x) {
    return x * x * (3 - 2 * x);
  };
  var mod = function (a, n) {
    return ((a % n) + n) % n;
  };
  function rand(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /**
   * Holiday red-family retint of kit PAL [blue, coral, yel, mint].
   * Motion / sizes / spin unchanged.
   */
  var PALETTES = {
    light: ["#D6453D", "#F07167", "#FFC83D", "#E8A09A"],
    dark: ["#F07167", "#D6453D", "#FFC83D", "#E5A39A"]
  };

  function isDark() {
    return document.documentElement.getAttribute("data-theme") === "dark";
  }

  function activeTone() {
    var t = document.documentElement.getAttribute("data-tone");
    if (t === "holiday" || t === "bf" || t === "normal") return t;
    return "normal";
  }

  function isHolidayTone() {
    return activeTone() === "holiday";
  }

  function palette() {
    return isDark() ? PALETTES.dark : PALETTES.light;
  }

  /** Build PARTS once per palette so colors refresh on theme/tone without new motion seeds. */
  function buildParts(pal) {
    var R = rand(15);
    var a = [];
    for (var i = 0; i < 84; i++) {
      var n = R() < 0.5 ? 2 : 3;
      a.push({
        T: CYC / n,
        ph: R() * CYC,
        vx: (R() - 0.5) * 2 * 190,
        vy: -(250 + R() * 150),
        sz: 5 + R() * 6,
        col: pal[i % 4],
        kind: i % 3,
        spin: (R() - 0.5) * 9
      });
    }
    return a;
  }

  var partsCacheKey = "";
  var PARTS = null;

  function partsForPalette() {
    var pal = palette();
    var key = (isDark() ? "d" : "l") + "|" + pal.join(",");
    if (key !== partsCacheKey || !PARTS) {
      partsCacheKey = key;
      PARTS = buildParts(pal);
    }
    return PARTS;
  }

  /**
   * @element 15 — Particles (no stage fill, no emitter platform).
   * Spec timings / gravity / shapes exact from upstream.
   */
  function drawParticles(k, w, h, u) {
    var parts = partsForPalette();
    var X = w / 2;
    var Y = h - 20;
    var G = 470;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var t = mod(u + p.ph, p.T);
      var life = Math.min(p.T, 1.5);
      if (t > life) continue;
      var x = X + p.vx * t;
      var y = Y + p.vy * t + 0.5 * G * t * t;
      var a =
        Math.min(1, t / 0.06) *
        (1 - smooth(P(t, life * 0.7, life)));
      var sc = lerp(1.15, 0.7, t / life);
      k.globalAlpha = a;
      k.fillStyle = p.col;
      k.save();
      k.translate(x, y);
      k.rotate(t * p.spin);
      k.scale(sc, sc);
      if (p.kind === 0) {
        k.beginPath();
        k.arc(0, 0, p.sz, 0, 7);
        k.fill();
      } else if (p.kind === 1) {
        k.fillRect(-p.sz, -p.sz, p.sz * 2, p.sz * 2);
      } else {
        k.beginPath();
        k.moveTo(0, -p.sz * 1.3);
        k.lineTo(p.sz * 1.2, p.sz);
        k.lineTo(-p.sz * 1.2, p.sz);
        k.closePath();
        k.fill();
      }
      k.restore();
    }
    k.globalAlpha = 1;
  }

  var rafId = 0;
  var t0 = 0;
  var canvas = null;
  var ctx = null;
  var running = false;
  var reduced = false;
  var hostEl = null;
  var toneMo = null;
  var panelMo = null;

  function prefersReduced() {
    return !!(
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function panelActive() {
    var panel = document.getElementById(PANEL_ID);
    if (!panel) return false;
    if (panel.hidden) return false;
    if (panel.classList.contains("hidden")) return false;
    var app = document.getElementById("app");
    if (app && app.classList.contains("hidden")) return false;
    return true;
  }

  function shouldShow() {
    return isHolidayTone() && panelActive();
  }

  function ensureCanvas() {
    hostEl = document.getElementById(HOST_ID);
    if (!hostEl) return null;
    canvas = hostEl.querySelector("canvas.tt-holiday-particles-canvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = "tt-holiday-particles-canvas";
      canvas.setAttribute("aria-hidden", "true");
      canvas.width = CW;
      canvas.height = CH;
      hostEl.appendChild(canvas);
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

  function paint(u) {
    if (!ctx && !ensureCanvas()) return;
    var dpr = canvas.width / CW;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CW, CH);
    ctx.save();
    drawParticles(ctx, CW, CH, u);
    ctx.restore();
  }

  function frame(now) {
    if (!running) return;
    if (!shouldShow()) {
      stopLoop();
      hideHost();
      return;
    }
    if (document.visibilityState === "hidden") {
      rafId = requestAnimationFrame(frame);
      return;
    }
    if (!ctx && !ensureCanvas()) {
      stopLoop();
      return;
    }
    var u = ((now - t0) / 1000) % CYC;
    paint(u);
    rafId = requestAnimationFrame(frame);
  }

  function showHost() {
    hostEl = document.getElementById(HOST_ID);
    if (!hostEl) return;
    hostEl.hidden = false;
    hostEl.removeAttribute("hidden");
    hostEl.classList.add("is-active");
  }

  function hideHost() {
    hostEl = document.getElementById(HOST_ID);
    if (!hostEl) return;
    hostEl.hidden = true;
    hostEl.setAttribute("hidden", "");
    hostEl.classList.remove("is-active");
  }

  function startLoop() {
    reduced = prefersReduced();
    if (!ensureCanvas()) return;
    showHost();
    if (reduced) {
      stopLoop();
      paint(FREEZE_U);
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

  function sync() {
    if (shouldShow()) {
      startLoop();
    } else {
      stopLoop();
      hideHost();
    }
  }

  function onReducedChange() {
    reduced = prefersReduced();
    if (!shouldShow()) {
      stopLoop();
      hideHost();
      return;
    }
    if (reduced) {
      stopLoop();
      showHost();
      if (ensureCanvas()) paint(FREEZE_U);
    } else {
      startLoop();
    }
  }

  function boot() {
    ensureCanvas();

    if (typeof MutationObserver === "function") {
      toneMo = new MutationObserver(function () {
        /* Tone or theme change: rebuild palette cache via paint path. */
        partsCacheKey = "";
        sync();
      });
      toneMo.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-tone", "data-theme"]
      });

      var panel = document.getElementById(PANEL_ID);
      if (panel) {
        panelMo = new MutationObserver(sync);
        panelMo.observe(panel, {
          attributes: true,
          attributeFilter: ["class", "hidden"]
        });
      }

      var app = document.getElementById("app");
      if (app) {
        var appMo = new MutationObserver(sync);
        appMo.observe(app, { attributes: true, attributeFilter: ["class"] });
      }
    }

    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (mq.addEventListener) mq.addEventListener("change", onReducedChange);
      else if (mq.addListener) mq.addListener(onReducedChange);
    }

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && shouldShow() && !reduced) {
        if (!running) startLoop();
      }
    });

    document.addEventListener("schooladmin:authed", sync);
    document.addEventListener("schooladmin:browse-date", sync);

    sync();
  }

  window.LwfssTtHolidayParticles = {
    sync: sync,
    stop: function () {
      stopLoop();
      hideHost();
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
