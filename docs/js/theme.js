/**
 * Light / dark theme toggle.
 * Preference key: lwfss-theme = "dark" | "light"
 * Applied on <html data-theme="dark">; early apply is in index.html <head>.
 * Light chrome hue comes from <html data-tone> (holiday|normal|bf).
 */
(function () {
  var KEY = "lwfss-theme";
  var META_DARK = "#12141f";
  var META_BY_TONE = {
    holiday: "#9b1e18",
    normal: "#0d3f7a",
    bf: "#0d5238"
  };

  function read() {
    try {
      return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
    } catch (e) {
      return "light";
    }
  }

  function write(theme) {
    try {
      localStorage.setItem(KEY, theme);
    } catch (e) {}
  }

  function toneMeta() {
    var tone = document.documentElement.getAttribute("data-tone") || "normal";
    return META_BY_TONE[tone] || META_BY_TONE.normal;
  }

  function syncMeta() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    meta.setAttribute("content", read() === "dark" ? META_DARK : toneMeta());
  }

  function apply(theme) {
    var root = document.documentElement;
    if (theme === "dark") {
      root.setAttribute("data-theme", "dark");
    } else {
      root.removeAttribute("data-theme");
    }

    var btn = document.getElementById("theme-toggle");
    if (btn) {
      var dark = theme === "dark";
      btn.setAttribute("aria-pressed", dark ? "true" : "false");
      btn.title = dark ? "切換淺色模式" : "切換深色模式";
    }

    syncMeta();
  }

  function set(theme) {
    write(theme);
    apply(theme);
  }

  function toggle() {
    set(read() === "dark" ? "light" : "dark");
  }

  function bind() {
    apply(read());
    var btn = document.getElementById("theme-toggle");
    if (btn && !btn._themeBound) {
      btn._themeBound = true;
      btn.addEventListener("click", toggle);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  window.LwfssTheme = {
    get: read,
    set: set,
    toggle: toggle,
    apply: apply,
    syncMeta: syncMeta
  };
})();