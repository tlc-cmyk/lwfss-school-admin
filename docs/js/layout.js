/**
 * Desktop / mobile layout mode.
 * Preference key: lwfss-layout = "auto" | "desktop" | "mobile"
 * Applied on <html data-layout="desktop|mobile">; early apply is in index.html <head>.
 * Same URL, same JS, same Supabase data — only the chrome/layout changes.
 */
(function () {
  var KEY = "lwfss-layout";
  var MQ = "(min-width: 900px)";

  function readPref() {
    try {
      var v = localStorage.getItem(KEY);
      if (v === "desktop" || v === "mobile" || v === "auto") return v;
    } catch (e) {}
    return "auto";
  }

  function writePref(pref) {
    try {
      localStorage.setItem(KEY, pref);
    } catch (e) {}
  }

  function wideScreen() {
    try {
      return !!(window.matchMedia && window.matchMedia(MQ).matches);
    } catch (e) {
      return false;
    }
  }

  function resolve(pref) {
    pref = pref || readPref();
    if (pref === "desktop") return "desktop";
    if (pref === "mobile") return "mobile";
    return wideScreen() ? "desktop" : "mobile";
  }

  function syncButton(layout) {
    var btn = document.getElementById("layout-toggle");
    if (!btn) return;
    var desktop = layout === "desktop";
    btn.setAttribute("aria-pressed", desktop ? "true" : "false");
    btn.title = desktop ? "改為手機版介面" : "改為電腦版介面";
    btn.setAttribute("aria-label", btn.title);
  }

  function apply(layout) {
    var root = document.documentElement;
    var prev = root.getAttribute("data-layout");
    if (layout !== "desktop" && layout !== "mobile") layout = resolve();
    root.setAttribute("data-layout", layout);
    syncButton(layout);
    if (prev && prev !== layout) {
      try {
        document.dispatchEvent(new CustomEvent("lwfss-layoutchange", {
          detail: { layout: layout, previous: prev }
        }));
      } catch (e) {}
      try { window.dispatchEvent(new Event("resize")); } catch (e) {}
    }
  }

  function setPref(pref) {
    if (pref !== "desktop" && pref !== "mobile" && pref !== "auto") pref = "auto";
    writePref(pref);
    apply(resolve(pref));
  }

  function toggle() {
    setPref(resolve() === "desktop" ? "mobile" : "desktop");
  }

  function bind() {
    apply(resolve());
    var btn = document.getElementById("layout-toggle");
    if (btn && !btn._layoutBound) {
      btn._layoutBound = true;
      btn.addEventListener("click", toggle);
    }
    if (!bind.mqBound && window.matchMedia) {
      bind.mqBound = true;
      var mq = window.matchMedia(MQ);
      var onChange = function () {
        if (readPref() === "auto") apply(resolve("auto"));
      };
      if (typeof mq.addEventListener === "function") mq.addEventListener("change", onChange);
      else if (typeof mq.addListener === "function") mq.addListener(onChange);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  window.LwfssLayout = {
    getPref: readPref,
    get: resolve,
    setPref: setPref,
    toggle: toggle,
    apply: apply
  };
})();
