/**
 * Timetable holiday underlay — ascii-sharks OceanEngine.
 * Source: https://github.com/stackedlol/ascii-sharks (MIT) · vendored in docs/vendor/ascii-sharks/
 *
 * Shows swimming ASCII sharks/fish under #home-panel-tt ONLY when the browsed
 * day is a holiday / off day (html[data-tone=holiday]). Hidden on normal / BF.
 * Replaces the former Motion Prompt #015 Particles underlay.
 *
 * Lifecycle: start OceanEngine when holiday panel is visible; destroy when
 * switching to a school day, leaving the panel, or leaving the page.
 * OceanEngine already pauses via IntersectionObserver + prefers-reduced-motion.
 */
(function () {
  "use strict";

  var HOST_ID = "home-tt-holiday-ocean";
  var PANEL_ID = "home-panel-tt";
  var CANVAS_CLASS = "tt-holiday-ocean-canvas";

  /** Compact holiday panel: one hammerhead + a smaller classic companion. */
  var SHARKS = [
    { kind: "hammerhead", size: 1 },
    { kind: "classic", size: 0.72 }
  ];

  /** Cap fish schools so the small 539×208 panel stays light. */
  var FISH_COUNT = 48;

  var hostEl = null;
  var canvas = null;
  var engine = null;
  var toneMo = null;
  var panelMo = null;

  function activeTone() {
    var t = document.documentElement.getAttribute("data-tone");
    if (t === "holiday" || t === "bf" || t === "normal") return t;
    return "normal";
  }

  function isHolidayTone() {
    return activeTone() === "holiday";
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

  function ensureHost() {
    hostEl = document.getElementById(HOST_ID);
    return hostEl;
  }

  function ensureCanvas() {
    if (!ensureHost()) return null;
    canvas = hostEl.querySelector("canvas." + CANVAS_CLASS);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = CANVAS_CLASS;
      canvas.setAttribute("aria-hidden", "true");
      /* Mono face helps ASCII glyphs; Geist Mono optional via CSS font stack. */
      canvas.style.fontFamily =
        '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      hostEl.appendChild(canvas);
    }
    return canvas;
  }

  function showHost() {
    if (!ensureHost()) return;
    hostEl.hidden = false;
    hostEl.removeAttribute("hidden");
    hostEl.classList.add("is-active");
  }

  function hideHost() {
    if (!ensureHost()) return;
    hostEl.hidden = true;
    hostEl.setAttribute("hidden", "");
    hostEl.classList.remove("is-active");
  }

  function destroyEngine() {
    if (engine && typeof engine.destroy === "function") {
      try {
        engine.destroy();
      } catch (err) {
        /* ignore */
      }
    }
    engine = null;
  }

  function startEngine() {
    if (typeof window.AsciiSharks === "undefined" || !window.AsciiSharks.OceanEngine) {
      return;
    }
    if (!ensureCanvas()) return;
    showHost();
    /* Need non-zero layout box before OceanEngine.resize(). */
    if (canvas.getBoundingClientRect().width < 1) {
      requestAnimationFrame(function () {
        if (shouldShow()) startEngine();
      });
      return;
    }
    if (engine) return;
    try {
      engine = new window.AsciiSharks.OceanEngine(canvas, SHARKS, {
        fishCount: FISH_COUNT
      });
    } catch (err) {
      console.warn("[tt-holiday-ocean] OceanEngine failed:", err);
      engine = null;
    }
  }

  function stopAll() {
    destroyEngine();
    hideHost();
  }

  function sync() {
    if (shouldShow()) {
      startEngine();
    } else {
      stopAll();
    }
  }

  function boot() {
    ensureCanvas();

    if (typeof MutationObserver === "function") {
      toneMo = new MutationObserver(sync);
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

    document.addEventListener("visibilitychange", function () {
      /* OceanEngine pauses itself when off-screen; re-sync on return. */
      if (document.visibilityState === "visible") sync();
    });

    document.addEventListener("schooladmin:authed", sync);
    document.addEventListener("schooladmin:browse-date", sync);

    window.addEventListener("pagehide", stopAll);
    window.addEventListener("beforeunload", stopAll);

    sync();
  }

  window.LwfssTtHolidayOcean = {
    sync: sync,
    stop: stopAll
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
