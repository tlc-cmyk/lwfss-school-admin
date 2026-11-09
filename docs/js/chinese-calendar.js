/**
 * 通勝／撕曆風「日曆」面板 — 版面仿傳統日曆，內容取自本系統
 * （循環日、假期色調、早會、值日、文件遞交、課堂／OLE／鐘聲）。
 * 不複製參考圖 IP 插畫；用學校 tone（holiday 紅／BF 綠／school 藍）+ 簡易飾紋。
 */
(function () {
  "use strict";

  var WEEKDAYS_ZH = ["日", "一", "二", "三", "四", "五", "六"];
  var WEEKDAYS_EN = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  var MONTHS_EN = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  var STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  var BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  var ZODIAC = ["鼠", "牛", "虎", "兔", "龍", "蛇", "馬", "羊", "猴", "雞", "狗", "豬"];
  var SHICHEN = [
    { name: "子", range: "23–01" },
    { name: "丑", range: "01–03" },
    { name: "寅", range: "03–05" },
    { name: "卯", range: "05–07" },
    { name: "辰", range: "07–09" },
    { name: "巳", range: "09–11" },
    { name: "午", range: "11–13" },
    { name: "未", range: "13–15" },
    { name: "申", range: "15–17" },
    { name: "酉", range: "17–19" },
    { name: "戌", range: "19–21" },
    { name: "亥", range: "21–23" }
  ];

  /** Approximate solar-term starts (Hong Kong) for academic years we care about.
   *  Values are ISO date strings of the day the term begins (local calendar day). */
  var SOLAR_TERMS = [
    { date: "2025-11-07", name: "立冬" },
    { date: "2025-11-22", name: "小雪" },
    { date: "2025-12-07", name: "大雪" },
    { date: "2025-12-21", name: "冬至" },
    { date: "2026-01-05", name: "小寒" },
    { date: "2026-01-20", name: "大寒" },
    { date: "2026-02-04", name: "立春" },
    { date: "2026-02-18", name: "雨水" },
    { date: "2026-03-05", name: "驚蟄" },
    { date: "2026-03-20", name: "春分" },
    { date: "2026-04-05", name: "清明" },
    { date: "2026-04-20", name: "穀雨" },
    { date: "2026-05-05", name: "立夏" },
    { date: "2026-05-21", name: "小滿" },
    { date: "2026-06-05", name: "芒種" },
    { date: "2026-06-21", name: "夏至" },
    { date: "2026-07-07", name: "小暑" },
    { date: "2026-07-23", name: "大暑" },
    { date: "2026-08-07", name: "立秋" },
    { date: "2026-08-23", name: "處暑" },
    { date: "2026-09-07", name: "白露" },
    { date: "2026-09-23", name: "秋分" },
    { date: "2026-10-08", name: "寒露" },
    { date: "2026-10-23", name: "霜降" },
    { date: "2026-11-07", name: "立冬" },
    { date: "2026-11-22", name: "小雪" },
    { date: "2026-12-07", name: "大雪" },
    { date: "2026-12-22", name: "冬至" },
    { date: "2027-01-05", name: "小寒" },
    { date: "2027-01-20", name: "大寒" },
    { date: "2027-02-04", name: "立春" },
    { date: "2027-02-19", name: "雨水" },
    { date: "2027-03-06", name: "驚蟄" },
    { date: "2027-03-21", name: "春分" },
    { date: "2027-04-05", name: "清明" },
    { date: "2027-04-20", name: "穀雨" },
    { date: "2027-05-06", name: "立夏" },
    { date: "2027-05-21", name: "小滿" },
    { date: "2027-06-06", name: "芒種" },
    { date: "2027-06-22", name: "夏至" },
    { date: "2027-07-07", name: "小暑" },
    { date: "2027-07-23", name: "大暑" },
    { date: "2027-08-07", name: "立秋" },
    { date: "2027-08-23", name: "處暑" },
    { date: "2027-09-08", name: "白露" },
    { date: "2027-09-23", name: "秋分" },
    { date: "2027-10-08", name: "寒露" },
    { date: "2027-10-23", name: "霜降" },
    { date: "2027-11-07", name: "立冬" }
  ];

  /**
   * Compact lunar month lengths for selected Gregorian spans (school years).
   * Each entry: lunar year label + months as day counts (29/30); leapMonth 1–12 or 0.
   * Source: public lunar calendars (approx. for display; not a full almanac engine).
   */
  var LUNAR_PACK = [
    // 乙巳年 2025 — leap June (閏六月)
    { start: "2025-01-29", yearStem: 1, yearBranch: 5, leapMonth: 6, months: [29, 30, 29, 29, 30, 29, 30, 30, 29, 30, 30, 29, 30] },
    // 丙午年 2026
    { start: "2026-02-17", yearStem: 2, yearBranch: 6, leapMonth: 0, months: [29, 30, 29, 29, 30, 29, 30, 29, 30, 30, 30, 29] },
    // 丁未年 2027 — leap May
    { start: "2027-02-06", yearStem: 3, yearBranch: 7, leapMonth: 5, months: [30, 29, 30, 29, 29, 30, 29, 30, 29, 30, 30, 29, 30] }
  ];

  var LUNAR_DAY_NAMES = [
    "", "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
    "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
    "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"
  ];
  var LUNAR_MONTH_NAMES = ["", "正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "臘月"];

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function parseIso(iso) {
    var p = String(iso || "").split("-");
    if (p.length !== 3) return null;
    var y = parseInt(p[0], 10);
    var m = parseInt(p[1], 10);
    var d = parseInt(p[2], 10);
    if (!y || !m || !d) return null;
    return { y: y, m: m, d: d, iso: iso };
  }

  function weekdayOf(iso) {
    var p = parseIso(iso);
    if (!p) return 0;
    var dt = new Date(Date.UTC(p.y, p.m - 1, p.d, 4, 0, 0));
    return dt.getUTCDay();
  }

  function daysBetween(aIso, bIso) {
    var a = parseIso(aIso);
    var b = parseIso(bIso);
    if (!a || !b) return 0;
    var da = Date.UTC(a.y, a.m - 1, a.d);
    var db = Date.UTC(b.y, b.m - 1, b.d);
    return Math.round((db - da) / 86400000);
  }

  function lunarOf(iso) {
    var pack = null;
    var i;
    for (i = LUNAR_PACK.length - 1; i >= 0; i--) {
      if (iso >= LUNAR_PACK[i].start) {
        pack = LUNAR_PACK[i];
        break;
      }
    }
    if (!pack) return null;
    var offset = daysBetween(pack.start, iso);
    if (offset < 0) return null;
    var months = pack.months;
    var mi = 0;
    while (mi < months.length && offset >= months[mi]) {
      offset -= months[mi];
      mi++;
    }
    if (mi >= months.length) return null;
    var day = offset + 1;
    var monthOrdinal = mi + 1;
    var isLeap = false;
    var displayMonth = monthOrdinal;
    if (pack.leapMonth > 0) {
      if (monthOrdinal === pack.leapMonth + 1) {
        isLeap = true;
        displayMonth = pack.leapMonth;
      } else if (monthOrdinal > pack.leapMonth + 1) {
        displayMonth = monthOrdinal - 1;
      }
    }
    var big = months[mi] === 30;
    return {
      stem: STEMS[pack.yearStem],
      branch: BRANCHES[pack.yearBranch],
      zodiac: ZODIAC[pack.yearBranch],
      monthName: (isLeap ? "閏" : "") + (LUNAR_MONTH_NAMES[displayMonth] || ("月" + displayMonth)),
      dayName: LUNAR_DAY_NAMES[day] || String(day),
      bigSmall: big ? "大" : "小",
      monthNum: displayMonth,
      day: day
    };
  }

  function solarTermFor(iso) {
    var current = null;
    var next = null;
    var i;
    for (i = 0; i < SOLAR_TERMS.length; i++) {
      if (SOLAR_TERMS[i].date <= iso) current = SOLAR_TERMS[i];
      if (SOLAR_TERMS[i].date > iso) {
        next = SOLAR_TERMS[i];
        break;
      }
    }
    return { current: current, next: next };
  }

  function yearGanzhi(y) {
    // 1984 = 甲子
    var idx = (y - 1984) % 60;
    if (idx < 0) idx += 60;
    return {
      stem: STEMS[idx % 10],
      branch: BRANCHES[idx % 12],
      zodiac: ZODIAC[idx % 12]
    };
  }

  function home() {
    return window.SchoolAdminHome || null;
  }

  function session() {
    return (window.SchoolAdminAuth && SchoolAdminAuth.getSession && SchoolAdminAuth.getSession()) ||
      window.__schoolAdminSession || null;
  }

  function browseDate() {
    var h = home();
    if (h && typeof h.getBrowseDate === "function") return h.getBrowseDate();
    return null;
  }

  function panelVisible() {
    var panel = $("home-panel-almanac");
    return !!(panel && !panel.classList.contains("hidden") && !panel.hasAttribute("hidden"));
  }

  function toneOf(day) {
    var h = home();
    if (h && typeof h.getDayTone === "function") return h.getDayTone(day);
    if (!day) return "holiday";
    if (h && typeof h.scheduleIdForDay === "function" && h.scheduleIdForDay(day) === "bf") return "bf";
    return "normal";
  }

  function collectLessons(code, cycleDay) {
    var h = home();
    if (!h || !code || !cycleDay) return [];
    if (typeof h.getTeacherDayLessons === "function") {
      return h.getTeacherDayLessons(code, cycleDay) || [];
    }
    return [];
  }

  function viewingCode(sess) {
    var h = home();
    if (h && typeof h.getViewingCode === "function") {
      var c = h.getViewingCode();
      if (c) return String(c).toUpperCase();
    }
    if (sess && sess.staff && sess.staff.short_name) {
      return String(sess.staff.short_name).trim().toUpperCase();
    }
    return "";
  }

  function buildYiJi(ctx) {
    var yi = [];
    var ji = [];
    var tone = ctx.tone;
    var day = ctx.cycleDay;
    var calKind = ctx.calKind || { kind: "off" };
    var notes = ctx.notes || [];
    var deadlines = ctx.deadlines || [];
    var duty = ctx.duty;
    var assembly = ctx.assembly;
    var lessons = ctx.lessons || [];
    var ole = ctx.ole;
    var buk = ctx.buk;
    var bellLabel = ctx.bellLabel || "";

    if (tone === "holiday" || (!day && calKind.kind === "holiday")) {
      yi.push("休息充電");
      yi.push("溫習／備課自訂進度");
      ji.push("當放假忘記備課");
      ji.push("校內事務積壓到返學日");
    } else if (!day && calKind.kind === "exam") {
      yi.push("跟進考試／統測安排");
      yi.push("留意考場及時間");
      ji.push("當平常上課日亂調課");
    } else if (day) {
      yi.push("跟 Day " + day + " 課表上課");
      if (/BF/.test(bellLabel) || tone === "bf") {
        yi.push("留意 BF／第8節時間");
      } else {
        yi.push("準時返校準備早會");
      }
      if (assembly && assembly.theme) {
        yi.push("早會：" + assembly.theme + (assembly.is_flag ? "（升旗）" : ""));
      }
      if (ctx.weekly) {
        var wTheme = ctx.weekly.theme_week || ctx.weekly.s1 || "周會";
        yi.push("周會（P6–P7）：" + truncate(wTheme, 16));
        if (/取消/.test(String(ctx.weekly.venue || ""))) {
          ji.push("當有周會——其實已取消");
        }
      } else if (day === 8) {
        yi.push("周會時段：第6–7節");
      }
      if (duty && (duty.teacher1 || duty.teacher2)) {
        var codes = [duty.teacher1, duty.teacher2].filter(Boolean).join("／");
        yi.push("值日老師：" + codes);
        if (ctx.meCode && codes.toUpperCase().indexOf(ctx.meCode) >= 0) {
          yi.push("今日你係值日——早到巡視");
        }
      }
      if (lessons.length) {
        yi.push("今日 " + lessons.length + " 堂：先備好頭兩節");
      } else {
        yi.push("今日無堂——可處理行政／備課");
        ji.push("空堂太鬆散唔跟進度");
      }
      if (ole && ole.kind === "clubs" && ole.club) {
        yi.push("課後活動：" + (ole.club.name || "OLE"));
      } else if (ole && ole.kind && ole.kind !== "clubs") {
        ji.push("今日課後活動暫停：" + (ole.title || ""));
      }
      if (buk && buk.assignment) {
        yi.push("中六補課：" + (buk.assignment.subject || "補課"));
      }
      ji.push("遲到錯過班主任／早會");
      if (tone === "bf") {
        ji.push("當一般日——忘記第8節");
      } else {
        ji.push("當 BF 日提早放人");
      }
    } else {
      yi.push("查校曆核對今日安排");
      ji.push("假設有循環日亂改課表");
    }

    deadlines.forEach(function (t) {
      if (yi.length < 8) yi.push("交文件：" + truncate(t, 18));
      if (ji.length < 8) ji.push("拖到過期：" + truncate(t, 14));
    });
    notes.forEach(function (t) {
      if (/會議/.test(t) && yi.length < 8) yi.push("出席：" + truncate(t, 18));
      else if (yi.length < 8) yi.push(truncate(t, 20));
    });

    if (!yi.length) yi.push("按校曆行事");
    if (!ji.length) ji.push("忽略頂欄日期／事項");

    return {
      yi: uniqueKeep(yi).slice(0, 6),
      ji: uniqueKeep(ji).slice(0, 6)
    };
  }

  function truncate(s, n) {
    s = String(s || "");
    if (s.length <= n) return s;
    return s.slice(0, n - 1) + "…";
  }

  function uniqueKeep(arr) {
    var seen = {};
    var out = [];
    arr.forEach(function (x) {
      var k = String(x || "").trim();
      if (!k || seen[k]) return;
      seen[k] = true;
      out.push(k);
    });
    return out;
  }

  function fortuneGrid(ctx) {
    var lessons = ctx.lessons || [];
    var n = lessons.length;
    var tone = ctx.tone;
    function stars(v) {
      var s = "";
      var i;
      for (i = 1; i <= 5; i++) s += i <= v ? "★" : "☆";
      return s;
    }
    var work = tone === "holiday" ? 2 : (n >= 5 ? 5 : (n >= 3 ? 4 : (n ? 3 : 2)));
    var admin = (ctx.deadlines && ctx.deadlines.length) ? 5 : ((ctx.notes && ctx.notes.length) ? 4 : 3);
    var energy = tone === "bf" ? 4 : (tone === "holiday" ? 2 : 3);
    var prep = n ? Math.min(5, Math.max(2, 6 - Math.floor(n / 2))) : 4;
    return [
      { label: "教學", stars: stars(work) },
      { label: "行政", stars: stars(admin) },
      { label: "體力", stars: stars(energy) },
      { label: "備課", stars: stars(prep) }
    ];
  }

  function bannerTexts(ctx) {
    var left = "";
    var right = "";
    var wd = ctx.weekday;
    var day = ctx.cycleDay;
    var tone = ctx.tone;
    var term = ctx.term && ctx.term.current ? ctx.term.current.name : "";

    if (tone === "holiday" || (!day && ctx.calKind && ctx.calKind.kind === "holiday")) {
      left = term ? (term + "休養生息") : "假日休養生息";
      right = (wd === 0 || wd === 6) ? "週末慢活得閒" : "毋須趕鐘回校";
    } else if (!day && ctx.calKind && ctx.calKind.kind === "exam") {
      left = "試日依時到場";
      right = "忌當循環日亂調";
    } else if (day) {
      left = "循環日第" + day + "日";
      if (ctx.assembly && ctx.assembly.theme) {
        right = "早會" + truncate(ctx.assembly.theme, 6);
      } else if (tone === "bf") {
        right = "BF日勿忘第八節";
      } else if (wd === 1) {
        right = "月曜亦要準時";
      } else if (wd === 5) {
        right = "金曜收好今日尾";
      } else {
        right = "跟鐘聲勿匆忙";
      }
    } else {
      left = "今日無循環日";
      right = "先查校曆安排";
    }
    return { left: left, right: right };
  }

  function coupletChars(text) {
    return Array.from(String(text || "")).map(function (ch) {
      if (ch === " ") return '<span class="almanac-couplet-gap" aria-hidden="true"></span>';
      return '<span class="almanac-couplet-ch">' + escapeHtml(ch) + "</span>";
    }).join("");
  }

  function cornerFlourish() {
    return (
      '<svg class="almanac-flourish-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
        '<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">' +
          '<path d="M8 56 V22 Q8 8 22 8 H56"/>' +
          '<path d="M16 56 V28 Q16 16 28 16 H56"/>' +
          '<path d="M8 40 h12 M24 8 v12"/>' +
          '<circle cx="20" cy="20" r="3" fill="currentColor" stroke="none"/>' +
          '<path d="M28 12 l4-6 4 6 -4 3z" fill="currentColor" stroke="none" opacity="0.9"/>' +
        "</g>" +
      "</svg>"
    );
  }

  function buildHourStrip(ctx) {
    var day = ctx.cycleDay;
    var h = home();
    var slots = [];
    if (day && h && typeof h.getBellSlots === "function") {
      slots = h.getBellSlots(day) || [];
    }
    if (slots.length) {
      var lessonMap = {};
      (ctx.lessons || []).forEach(function (L) {
        if (L && L.period != null) lessonMap[String(L.period)] = L;
      });
      return slots.map(function (s) {
        var label = s.label || s.key || "";
        var shortLabel = label
          .replace("班主任／早會", "早會")
          .replace("第", "P")
          .replace("節（BF）", "")
          .replace("節", "")
          .replace("閱讀時段", "閱讀")
          .replace("小息", "小息")
          .replace("午膳", "午膳");
        var detail = s.start ? String(s.start).slice(0, 5) : "";
        var luck = "平";
        if (s.period != null) {
          var L = lessonMap[String(s.period)];
          if (L) {
            detail = truncate((L.subjectShort || L.subject || "有課") + (L.classShort || L.class ? " " + (L.classShort || L.class) : ""), 8);
            luck = "吉";
          } else {
            detail = "空堂";
            luck = "閒";
          }
        } else if (s.key === "recess" || s.key === "lunch") {
          luck = "吉";
        } else if (s.key === "homeroom") {
          luck = ctx.assembly ? "吉" : "平";
          if (ctx.assembly && ctx.assembly.theme) detail = truncate(ctx.assembly.theme, 8);
        }
        return {
          head: shortLabel,
          sub: detail,
          luck: luck,
          time: s.start && s.end ? (s.start + "–" + s.end) : ""
        };
      });
    }
    // Holiday / no cycle: traditional 時辰 + school-flavoured tips
    var tips = ["宵夜休養生息", "仲訓緊唔好嘈", "早朝備課思緒", "返學路上小心", "早會／頭兩節", "小息提神一息", "午膳前收斂", "閱讀／午後堂", "課後跟進文件", "放工唔好積壓", "家庭時間優先", "早啲瞓明日神"];
    return SHICHEN.map(function (sc, i) {
      return {
        head: sc.name,
        sub: tips[i] || sc.range,
        luck: (i === 4 || i === 5 || i === 7) ? "吉" : (i === 0 || i === 11 ? "平" : "平"),
        time: sc.range
      };
    });
  }

  function centerFacts(ctx) {
    var rows = [];
    var toneLabel = ctx.tone === "holiday" ? "假期" : (ctx.tone === "bf" ? "BF日" : "上課日");
    if (!ctx.cycleDay && ctx.calKind) {
      if (ctx.calKind.kind === "exam") toneLabel = ctx.noCycleMsg || "考試日";
      else if (ctx.calKind.kind === "holiday") toneLabel = "假期";
      else toneLabel = ctx.noCycleMsg || "休課";
    }
    rows.push({ k: "校況", v: toneLabel + (ctx.cycleDay ? (" · Day " + ctx.cycleDay) : "") });
    if (ctx.duty && (ctx.duty.teacher1 || ctx.duty.teacher2)) {
      rows.push({
        k: "值日",
        v: [ctx.duty.teacher1, ctx.duty.teacher2].filter(Boolean).join(" · ")
      });
    }
    if (ctx.assembly && ctx.assembly.theme) {
      rows.push({ k: "早會", v: ctx.assembly.theme + (ctx.assembly.is_flag ? " · 升旗" : "") });
    }
    if (ctx.weekly) {
      var wv = (ctx.weekly.theme_week || ctx.weekly.s1 || "周會") + " · P6–P7";
      if (/取消/.test(String(ctx.weekly.venue || ""))) wv += "（取消）";
      rows.push({ k: "周會", v: truncate(wv, 22) });
    } else if (ctx.cycleDay === 8) {
      rows.push({ k: "周會", v: "Day 8 · P6–P7" });
    }
    if (ctx.lessons && ctx.lessons.length) {
      var first = ctx.lessons[0];
      rows.push({
        k: "頭堂",
        v: "P" + first.period + " " + truncate(first.subjectShort || first.subject || "", 10) +
          (first.classShort || first.class ? "／" + (first.classShort || first.class) : "")
      });
    } else if (ctx.cycleDay) {
      rows.push({ k: "課堂", v: "今日無堂" });
    }
    if (ctx.ole && ctx.ole.kind === "clubs" && ctx.ole.club) {
      rows.push({ k: "OLE", v: ctx.ole.club.name || "課後活動" });
    }
    if (ctx.buk && ctx.buk.assignment) {
      rows.push({ k: "補課", v: (ctx.buk.assignment.subject || "") + (ctx.buk.assignment.room ? " @" + ctx.buk.assignment.room : "") });
    }
    var dirs = ctx.tone === "holiday"
      ? "宜家居 · 忌趕工"
      : (ctx.tone === "bf" ? "宜校園 · 課室樓層" : "宜辦公室 · 課室");
    rows.push({ k: "方位", v: dirs });
    return rows;
  }

  function gatherContext() {
    var h = home();
    var sess = session();
    var iso = browseDate() || (h && h.todayHK && h.todayHK()) || "";
    var p = parseIso(iso) || { y: 2026, m: 11, d: 1, iso: iso };
    var wd = weekdayOf(iso);
    var cycleDay = h && typeof h.getBrowseCycleDay === "function" ? h.getBrowseCycleDay() : null;
    var tone = toneOf(cycleDay);
    var calKind = h && typeof h.getBrowseCalendarKind === "function" ? h.getBrowseCalendarKind() : { kind: "off" };
    var noCycleMsg = h && typeof h.getNoCycleDayMessage === "function" ? h.getNoCycleDayMessage() : "";
    var calendarItems = h && typeof h.getCalendarItems === "function" ? h.getCalendarItems() : [];
    var deadlineItems = h && typeof h.getDeadlineItems === "function" ? h.getDeadlineItems() : [];
    var notes = [];
    (calendarItems || []).forEach(function (it) { if (it && it.title) notes.push(String(it.title)); });
    var deadlines = [];
    (deadlineItems || []).forEach(function (it) { if (it && it.title) deadlines.push(String(it.title)); });
    var duty = h && typeof h.getDuty === "function" ? h.getDuty() : null;
    var weekly = h && typeof h.getWeeklyAssembly === "function" ? h.getWeeklyAssembly() : null;
    var assembly = null;
    if (cycleDay && h && typeof h.getAssemblyForDay === "function") {
      assembly = h.getAssemblyForDay(cycleDay);
    }
    var code = viewingCode(sess);
    var meCode = "";
    if (sess && sess.staff && sess.staff.short_name) meCode = String(sess.staff.short_name).trim().toUpperCase();
    var lessons = collectLessons(code, cycleDay);
    var ole = null;
    var buk = null;
    if (h && code) {
      if (typeof h.getOleP8 === "function") ole = h.getOleP8(code, iso);
      if (typeof h.getBukP8 === "function") buk = h.getBukP8(code, iso, cycleDay);
    }
    var bellLabel = "";
    if (cycleDay && h && typeof h.bellLabelForDay === "function") {
      bellLabel = h.bellLabelForDay(cycleDay) || "";
    }
    var lunar = lunarOf(iso);
    var ganzhi = yearGanzhi(p.y);
    if (lunar) {
      ganzhi = { stem: lunar.stem, branch: lunar.branch, zodiac: lunar.zodiac };
    }
    var term = solarTermFor(iso);
    return {
      iso: iso,
      y: p.y,
      m: p.m,
      d: p.d,
      weekday: wd,
      cycleDay: cycleDay,
      tone: tone,
      calKind: calKind,
      noCycleMsg: noCycleMsg,
      notes: notes,
      deadlines: deadlines,
      duty: duty,
      weekly: weekly,
      assembly: assembly,
      lessons: lessons,
      ole: ole,
      buk: buk,
      bellLabel: bellLabel,
      lunar: lunar,
      ganzhi: ganzhi,
      term: term,
      meCode: meCode,
      code: code,
      role: sess && sess.role
    };
  }

  function render() {
    var root = $("almanac-root");
    if (!root) return;
    var ctx = gatherContext();
    if (!ctx.iso) {
      root.innerHTML = '<p class="almanac-loading muted">未有日期</p>';
      return;
    }

    var sheet = root;
    sheet.setAttribute("data-tone", ctx.tone || "normal");

    var yiJi = buildYiJi(ctx);
    var banners = bannerTexts(ctx);
    var fortunes = fortuneGrid(ctx);
    var facts = centerFacts(ctx);
    var hours = buildHourStrip(ctx);
    var lunar = ctx.lunar;
    var term = ctx.term;
    var gz = ctx.ganzhi;

    var termTitle = term.current ? term.current.name : "節氣";
    var termNote = "";
    if (term.current && term.current.date === ctx.iso) {
      termNote = "今日交節";
    } else if (term.next) {
      termNote = "下一個 " + term.next.name + " " + term.next.date.slice(5).replace("-", "/");
    } else if (ctx.cycleDay) {
      termNote = "Day " + ctx.cycleDay;
    } else {
      termNote = ctx.noCycleMsg || "按校曆";
    }

    var lunarK = "農曆";
    var lunarV = "—";
    var lunarBadge = "";
    if (lunar) {
      lunarK = "農曆" + lunar.monthName;
      lunarV = lunar.dayName;
      lunarBadge = lunar.bigSmall;
    } else if (ctx.cycleDay) {
      lunarK = "循環日";
      lunarV = "Day " + ctx.cycleDay;
    } else {
      lunarK = "校曆";
      lunarV = ctx.noCycleMsg || "休課";
    }

    var monthZh = (["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"][ctx.m] || String(ctx.m)) + "月";

    var fortuneHtml = fortunes.map(function (f) {
      return '<tr><th scope="row">' + escapeHtml(f.label) + "</th><td class=\"almanac-stars\">" +
        escapeHtml(f.stars) + "</td></tr>";
    }).join("");

    var factsHtml = facts.map(function (r, idx) {
      var cls = idx === 0 ? " is-lead" : "";
      return '<tr class="' + cls + '"><th scope="row">' + escapeHtml(r.k) +
        "</th><td>" + escapeHtml(r.v) + "</td></tr>";
    }).join("");

    var hourHead = hours.map(function (hItem) {
      return "<th scope=\"col\">" + escapeHtml(hItem.head) + "</th>";
    }).join("");
    var hourSub = hours.map(function (hItem) {
      return "<td title=\"" + escapeHtml(hItem.time || "") + "\">" + escapeHtml(hItem.sub) + "</td>";
    }).join("");
    var hourLuck = hours.map(function (hItem) {
      var luckCls = hItem.luck === "吉" ? "is-ji" : (hItem.luck === "閒" ? "is-xian" : "is-ping");
      return '<td class="almanac-luck-cell"><span class="almanac-hour-luck ' + luckCls + '">' +
        escapeHtml(hItem.luck) + "</span></td>";
    }).join("");

    function yiJiCol(list, kind) {
      var mark = kind === "yi" ? "宜" : "忌";
      var items = (list || []).map(function (t) {
        return '<li><span class="almanac-vert">' + escapeHtml(t) + "</span></li>";
      }).join("");
      return (
        '<div class="almanac-col almanac-' + kind + '">' +
          '<div class="almanac-col-badge" aria-hidden="true">' + mark + "</div>" +
          '<ul class="almanac-col-list">' + items + "</ul>" +
        "</div>"
      );
    }

    var footerBits = [];
    footerBits.push(ctx.tone === "holiday" ? "假期" : (ctx.tone === "bf" ? "BF日" : "上課日"));
    if (ctx.code) footerBits.push(ctx.code);
    footerBits.push("資料來自本系統");

    sheet.innerHTML =
      '<div class="almanac-frame">' +
        '<div class="almanac-flourish almanac-flourish-tl" aria-hidden="true">' + cornerFlourish() + "</div>" +
        '<div class="almanac-flourish almanac-flourish-tr" aria-hidden="true">' + cornerFlourish() + "</div>" +
        '<div class="almanac-flourish almanac-flourish-bl" aria-hidden="true">' + cornerFlourish() + "</div>" +
        '<div class="almanac-flourish almanac-flourish-br" aria-hidden="true">' + cornerFlourish() + "</div>" +

        '<header class="almanac-header">' +
          '<div class="almanac-year">' +
            '<div class="almanac-year-num">' + escapeHtml(String(ctx.y)) + "</div>" +
            '<div class="almanac-year-gan">' + escapeHtml(gz.stem + gz.branch + "年 · " + gz.zodiac + "年") + "</div>" +
          "</div>" +
          '<div class="almanac-seal-wrap" aria-hidden="true">' +
            '<span class="almanac-cloud almanac-cloud-l"></span>' +
            '<div class="almanac-zodiac"><span>' + escapeHtml(gz.zodiac) + "</span></div>" +
            '<span class="almanac-cloud almanac-cloud-r"></span>' +
          "</div>" +
          '<div class="almanac-month">' +
            '<div class="almanac-month-row">' +
              '<span class="almanac-month-zh">' + escapeHtml(monthZh) + "</span>" +
              (lunarBadge
                ? '<span class="almanac-month-badge">' + escapeHtml(lunarBadge) + "</span>"
                : "") +
            "</div>" +
            '<div class="almanac-month-en">' + escapeHtml(MONTHS_EN[ctx.m - 1] || "") + "</div>" +
          "</div>" +
        "</header>" +

        '<section class="almanac-upper" aria-label="日期">' +
          '<aside class="almanac-couplet almanac-couplet-left">' + coupletChars(banners.left) + "</aside>" +
          '<div class="almanac-stage">' +
            '<div class="almanac-stage-deco" aria-hidden="true">' +
              '<span class="almanac-sun"></span><span class="almanac-moon"></span>' +
            "</div>" +
            '<div class="almanac-chip almanac-chip-term">' +
              '<div class="almanac-chip-k">' + escapeHtml(termTitle) + "</div>" +
              '<div class="almanac-chip-v">' + escapeHtml(termNote) + "</div>" +
            "</div>" +
            '<div class="almanac-day-block">' +
              '<div class="almanac-day-num">' + escapeHtml(String(ctx.d)) + "</div>" +
              '<div class="almanac-weekday">星期' + escapeHtml(WEEKDAYS_ZH[ctx.weekday]) + "</div>" +
              '<div class="almanac-weekday-en">' + escapeHtml(WEEKDAYS_EN[ctx.weekday]) + "</div>" +
            "</div>" +
            '<div class="almanac-chip almanac-chip-lunar">' +
              '<div class="almanac-chip-k">' + escapeHtml(lunarK) +
                (lunarBadge ? '<span class="almanac-chip-badge">' + escapeHtml(lunarBadge) + "</span>" : "") +
              "</div>" +
              '<div class="almanac-chip-v">' + escapeHtml(lunarV) + "</div>" +
            "</div>" +
          "</div>" +
          '<aside class="almanac-couplet almanac-couplet-right">' + coupletChars(banners.right) + "</aside>" +
        "</section>" +

        '<section class="almanac-lower" aria-label="宜忌">' +
          yiJiCol(yiJi.yi, "yi") +
          '<div class="almanac-center">' +
            '<table class="almanac-grid">' +
              "<tbody>" + factsHtml + "</tbody>" +
            "</table>" +
            '<table class="almanac-grid almanac-grid-fortune">' +
              '<thead><tr><th colspan="2">運勢</th></tr></thead>' +
              "<tbody>" + fortuneHtml + "</tbody>" +
            "</table>" +
          "</div>" +
          yiJiCol(yiJi.ji, "ji") +
        "</section>" +

        '<table class="almanac-shichen" aria-label="時段">' +
          "<thead><tr>" + hourHead + "</tr></thead>" +
          "<tbody>" +
            "<tr class=\"almanac-shichen-sub\">" + hourSub + "</tr>" +
            "<tr class=\"almanac-shichen-luck\">" + hourLuck + "</tr>" +
          "</tbody>" +
        "</table>" +

        '<footer class="almanac-footer">' +
          "<span>" + escapeHtml(footerBits.join(" · ")) + "</span>" +
          '<button type="button" class="almanac-pick-date" id="almanac-focus-date">改日期</button>' +
        "</footer>" +
      "</div>";

    var btn = $("almanac-focus-date");
    if (btn) {
      btn.addEventListener("click", function () {
        var input = $("home-date-input");
        if (!input) return;
        try {
          if (typeof input.showPicker === "function") input.showPicker();
          else { input.focus(); input.click(); }
        } catch (e) {
          input.focus();
        }
      });
    }
  }

  function show() {
    render();
  }

  function refresh() {
    if (panelVisible()) render();
  }

  function bind() {
    if (bind.done) return;
    bind.done = true;
    document.addEventListener("schooladmin:browse-date", function () {
      refresh();
    });
    document.addEventListener("schooladmin:authed", function () {
      refresh();
    });
  }

  window.SchoolAdminAlmanac = {
    show: show,
    refresh: refresh,
    render: render
  };

  bind();
})();
