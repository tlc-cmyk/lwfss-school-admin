/**
 * Light / dark theme toggle.
 * Preference key: lwfss-theme = "dark" | "light"
 * Applied on <html data-theme="dark">; early apply is in index.html <head>.
 */
(function () {
  var KEY = "lwfss-theme";
  var META_LIGHT = "#1a3a6c";
  var META_DARK = "#12141f";

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

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", theme === "dark" ? META_DARK : META_LIGHT);
    }
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

  window.LwfssTheme = { get: read, set: set, toggle: toggle, apply: apply };
})();
