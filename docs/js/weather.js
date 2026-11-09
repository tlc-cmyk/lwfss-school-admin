/**
 * Tai Kok Tsui (大角咀) live weather for sticky #home-top bar.
 * Open-Meteo (no API key): https://open-meteo.com/
 */
(function () {
  "use strict";

  var LAT = 22.322;
  var LON = 114.162;
  var REFRESH_MS = 15 * 60 * 1000;
  var URL =
    "https://api.open-meteo.com/v1/forecast" +
    "?latitude=" + LAT +
    "&longitude=" + LON +
    "&current=temperature_2m,weather_code" +
    "&timezone=Asia%2FHong_Kong";

  var timer = null;
  var started = false;

  function $(id) {
    return document.getElementById(id);
  }

  /** WMO Weather interpretation codes → 繁中短標 */
  function weatherLabel(code) {
    var c = Number(code);
    if (!isFinite(c)) return "";
    if (c === 0) return "晴";
    if (c === 1) return "大致天晴";
    if (c === 2) return "間中有雲";
    if (c === 3) return "多雲";
    if (c === 45 || c === 48) return "有霧";
    if (c === 51 || c === 53 || c === 55) return "微雨";
    if (c === 56 || c === 57) return "凍雨";
    if (c === 61 || c === 63 || c === 65) return "有雨";
    if (c === 66 || c === 67) return "凍雨";
    if (c === 71 || c === 73 || c === 75 || c === 77) return "有雪";
    if (c === 80 || c === 81 || c === 82) return "驟雨";
    if (c === 85 || c === 86) return "雪驟";
    if (c === 95) return "雷暴";
    if (c === 96 || c === 99) return "雷暴冰雹";
    return "天氣";
  }

  function formatTemp(t) {
    var n = Number(t);
    if (!isFinite(n)) return null;
    return Math.round(n) + "°C";
  }

  function hideWeather() {
    var el = $("home-weather");
    if (!el) return;
    el.hidden = true;
    el.classList.remove("is-loading");
    el.textContent = "—";
  }

  function showWeather(tempText, label) {
    var el = $("home-weather");
    if (!el) return;
    var parts = ["大角咀"];
    if (tempText) parts.push(tempText);
    if (label) parts.push(label);
    el.textContent = parts.join(" ");
    el.title = "大角咀即時天氣（Open-Meteo）";
    el.classList.remove("is-loading");
    el.hidden = false;
  }

  function fetchWeather() {
    var el = $("home-weather");
    if (!el) return Promise.resolve();
    return fetch(URL, { credentials: "omit", cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var cur = data && data.current;
        if (!cur) throw new Error("no current");
        var tempText = formatTemp(cur.temperature_2m);
        var label = weatherLabel(cur.weather_code);
        if (!tempText) throw new Error("bad temp");
        showWeather(tempText, label);
      })
      .catch(function () {
        // Keep top bar intact: hide weather chip on failure.
        hideWeather();
      });
  }

  function start() {
    if (started) {
      fetchWeather();
      return;
    }
    started = true;
    fetchWeather();
    if (timer) clearInterval(timer);
    timer = setInterval(fetchWeather, REFRESH_MS);
  }

  window.SchoolAdminWeather = {
    start: start,
    refresh: fetchWeather,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
