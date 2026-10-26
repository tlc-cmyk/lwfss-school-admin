/**
 * Timetable holiday underlay — ascii-sharks OceanEngine.
 * Source: https://github.com/stackedlol/ascii-sharks (MIT) · vendored in docs/vendor/ascii-sharks/
 *
 * Shows swimming ASCII sharks/fish under #home-panel-tt ONLY when the browsed
 * day is a holiday / off day (html[data-tone=holiday]). Hidden on normal / BF.
 *
 * Appearance: canvas clear colour follows CSS --bg; light themes use dark ink
 * so glyphs stay readable without a black box. Layout fills leftover panel space.
 *
 * Lifecycle: start OceanEngine when holiday panel is visible; destroy when
 * switching to a school day, leaving the panel, or leaving the page.
 * Theme/tone changes retint via setAppearance (no full restart).
 */
(function () {
  "use strict";

  var HOST_ID = "home-tt-holiday-ocean";
  var PANEL_ID = "home-panel-tt";
  var CANVAS_CLASS = "tt-holiday-ocean-canvas";

  /** Holiday panel: hammerhead + classic companion (scales with canvas size). */
  var SHARKS = [
    { kind: "hammerhead", size: 1 },
    { kind: "classic", size: 0.72 },
    { kind: "mako", size: 0.55 }
  ];

  /** Fish schools for the larger fill area — still capped for perf. */
  var FISH_COUNT = 72;

  var hostEl = null;
  var canvas = null;
  var engine = null;
  var toneMo = null;
  var panelMo = null;
  var hostRo = null;

  function activeTone() {
    var t = document.documentElement.getAttribute("data-tone");
    if (t === "holiday" || t === "bf" || t === "normal") return t;
    return "normal";
  }

  function isHolidayTone() {
    return activeTone() === "holiday";
  }

  function isDarkTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark";
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

  /** Read site tokens so the ocean blends with the page (holiday light/dark). */
  function readAppearance() {
    var root = document.documentElement;
    var cs = getComputedStyle(root);
    var bg = (cs.getPropertyValue("--bg") || "").trim() || (isDarkTheme() ? "#161010" : "#f7f2f1");
    var dark = isDarkTheme();
    return {
      background: bg,
      inkMode: dark ? "dark" : "light",
      grid: dark ? "rgba(255,255,255,0.055)" : "rgba(192,57,43,0.10)"
    };
  }

  function applyAppearance() {
    if (!engine || typeof engine.setAppearance !== "function") return;
    try {
      engine.setAppearance(readAppearance());
    } catch (err) {
      /* ignore */
    }
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
    var box = canvas.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) {
      requestAnimationFrame(function () {
        if (shouldShow()) startEngine();
      });
      return;
    }
    if (engine) {
      applyAppearance();
      return;
    }
    try {
      var appearance = readAppearance();
      engine = new window.AsciiSharks.OceanEngine(canvas, SHARKS, {
        fishCount: FISH_COUNT,
        background: appearance.background,
        inkMode: appearance.inkMode,
        grid: appearance.grid
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
      toneMo = new MutationObserver(function () {
        if (!shouldShow()) {
          stopAll();
          return;
        }
        if (engine) applyAppearance();
        else startEngine();
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

    /* Host size changes (flex fill / orientation) — OceanEngine watches canvas,
       but ensuring canvas has layout height helps first paint. */
    if (typeof ResizeObserver === "function" && ensureHost()) {
      hostRo = new ResizeObserver(function () {
        if (engine && shouldShow() && canvas) {
          /* Engine ResizeObserver on canvas fires when CSS height changes. */
        }
      });
      hostRo.observe(hostEl);
    }

    document.addEventListener("visibilitychange", function () {
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
    stop: stopAll,
    applyAppearance: applyAppearance
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
