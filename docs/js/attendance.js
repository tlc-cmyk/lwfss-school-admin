/**
 * 今日拍卡 — eClass「完整拍卡紀錄」原始數據 CSV 解析與本機暫存。
 * 格式：UTF-16 或 UTF-8、Tab 分隔；欄：日期、班別、學號、學生姓名、可變數量「記錄時間」。
 * Privacy: 顯示姓名／班別／拍卡時間。school-admin 面板經 Supabase 共享予教職員；本模組仍提供 localStorage 輔助（可選）。
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'lwfssAttendanceCsv';
  var SAMPLE_URL = 'data/attendance-sample.csv';

  function stripQuotes(s) {
    s = String(s == null ? '' : s).trim();
    if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
      s = s.slice(1, -1).replace(/""/g, '"');
    }
    return s.trim();
  }

  function splitTsvLine(line) {
    // Simple TSV with optional quoted fields (eClass style: "field"\t"field")
    var out = [];
    var i = 0;
    var n = line.length;
    while (i < n) {
      if (line.charAt(i) === '"') {
        i++;
        var buf = '';
        while (i < n) {
          var ch = line.charAt(i);
          if (ch === '"') {
            if (i + 1 < n && line.charAt(i + 1) === '"') {
              buf += '"';
              i += 2;
              continue;
            }
            i++;
            break;
          }
          buf += ch;
          i++;
        }
        out.push(buf);
        if (i < n && line.charAt(i) === '\t') i++;
      } else {
        var start = i;
        while (i < n && line.charAt(i) !== '\t') i++;
        out.push(line.slice(start, i));
        if (i < n && line.charAt(i) === '\t') i++;
      }
    }
    return out;
  }

  function normalizeYmd(s) {
    s = stripQuotes(s);
    // 2026-10-14 or 2026/10/14
    var m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (!m) return s;
    var y = m[1];
    var mo = ('0' + m[2]).slice(-2);
    var d = ('0' + m[3]).slice(-2);
    return y + '-' + mo + '-' + d;
  }

  function normalizeTime(s) {
    s = stripQuotes(s);
    if (!s) return '';
    // HH:MM:SS or HH:MM
    var m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return s;
    var hh = ('0' + m[1]).slice(-2);
    var mm = m[2];
    var ss = m[3] != null ? m[3] : '00';
    return hh + ':' + mm + ':' + ss;
  }

  function shortTime(t) {
    if (!t) return '—';
    return t.length >= 5 ? t.slice(0, 5) : t;
  }

  function decodeBuffer(buf) {
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(u8);
    }
    if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(u8);
    }
    if (u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) {
      return new TextDecoder('utf-8').decode(u8);
    }
    // Heuristic: many NULs → UTF-16LE without relying solely on BOM
    var nul = 0;
    var probe = Math.min(u8.length, 200);
    for (var i = 1; i < probe; i += 2) {
      if (u8[i] === 0) nul++;
    }
    if (nul > probe / 6) {
      try {
        return new TextDecoder('utf-16le').decode(u8);
      } catch (e) { /* fall through */ }
    }
    return new TextDecoder('utf-8').decode(u8);
  }

  /**
   * @returns {{ records: Array<{date:string, className:string, no:string, name:string, times:string[], firstTap:string, lastTap:string}>, dates: string[], error?: string }}
   */
  function parseCsvText(text) {
    if (text == null || String(text).trim() === '') {
      return { records: [], dates: [], error: '空檔案' };
    }
    var raw = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var lines = raw.split('\n').filter(function (l) { return l.trim().length > 0; });
    if (!lines.length) return { records: [], dates: [], error: '空檔案' };

    var headerCols = splitTsvLine(lines[0]).map(stripQuotes);
    var h0 = headerCols[0] || '';
    if (h0.indexOf('日期') === -1 && h0.toLowerCase().indexOf('date') === -1) {
      // still try: maybe no header
    }

    var records = [];
    var dateSet = {};
    for (var li = 1; li < lines.length; li++) {
      var cols = splitTsvLine(lines[li]).map(stripQuotes);
      if (cols.length < 4) continue;
      var date = normalizeYmd(cols[0]);
      var className = cols[1];
      var no = cols[2];
      var name = cols[3];
      var times = [];
      for (var ti = 4; ti < cols.length; ti++) {
        var t = normalizeTime(cols[ti]);
        if (t) times.push(t);
      }
      times.sort();
      var firstTap = times.length ? times[0] : '';
      var lastTap = times.length ? times[times.length - 1] : '';
      if (!date && !className) continue;
      records.push({
        date: date,
        className: className,
        no: no,
        name: name,
        times: times,
        firstTap: firstTap,
        lastTap: lastTap
      });
      if (date) dateSet[date] = true;
    }
    var dates = Object.keys(dateSet).sort();
    if (!records.length) {
      return { records: [], dates: [], error: '找不到拍卡列（請確認為 eClass「完整拍卡紀錄」原始數據）' };
    }
    return { records: records, dates: dates };
  }

  function parseArrayBuffer(buf) {
    return parseCsvText(decodeBuffer(buf));
  }

  function loadRawFromStorage() {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function saveRawToStorage(text) {
    try {
      localStorage.setItem(STORAGE_KEY, String(text || ''));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearStorage() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
  }

  function todayYmdHK() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Hong_Kong',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
    } catch (e) {
      var d = new Date();
      return d.getFullYear() + '-' +
        ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
        ('0' + d.getDate()).slice(-2);
    }
  }

  function filterByDate(records, ymd) {
    if (!ymd) return records.slice();
    return records.filter(function (r) { return r.date === ymd; });
  }

  /**
   * Arrived = at least one tap time.
   * @returns {{ date: string, arrived: number, byClass: Object.<string,{count:number, students:Array}>, lastTap: string, firstTap: string, classOrder: string[] }}
   */
  function summarize(records) {
    var byClass = {};
    var arrived = 0;
    var allFirst = [];
    var allLast = [];
    var date = '';
    records.forEach(function (r) {
      if (!r.times || !r.times.length) return;
      arrived++;
      if (!date && r.date) date = r.date;
      if (r.firstTap) allFirst.push(r.firstTap);
      if (r.lastTap) allLast.push(r.lastTap);
      var c = r.className || '?';
      if (!byClass[c]) byClass[c] = { count: 0, students: [] };
      byClass[c].count++;
      byClass[c].students.push(r);
    });
    Object.keys(byClass).forEach(function (c) {
      byClass[c].students.sort(function (a, b) {
        var na = parseInt(a.no, 10) || 0;
        var nb = parseInt(b.no, 10) || 0;
        if (na !== nb) return na - nb;
        return String(a.name).localeCompare(String(b.name), 'zh-HK');
      });
    });
    allFirst.sort();
    allLast.sort();
    var classOrder = Object.keys(byClass).sort(function (a, b) {
      var ma = a.match(/^(\d+)([A-Z])$/i);
      var mb = b.match(/^(\d+)([A-Z])$/i);
      if (ma && mb) {
        var fa = parseInt(ma[1], 10) - parseInt(mb[1], 10);
        if (fa !== 0) return fa;
        return ma[2].toUpperCase().localeCompare(mb[2].toUpperCase());
      }
      return a.localeCompare(b, 'zh-HK');
    });
    return {
      date: date,
      arrived: arrived,
      byClass: byClass,
      classOrder: classOrder,
      firstTap: allFirst.length ? allFirst[0] : '',
      lastTap: allLast.length ? allLast[allLast.length - 1] : ''
    };
  }

  function rosterTotals() {
    var data = global.STUDENTS_DATA;
    if (!data || !data.meta || !data.meta.classes) return null;
    return {
      studentCount: data.meta.studentCount || 0,
      classes: data.meta.classes
    };
  }

  function fetchSampleText() {
    return fetch(SAMPLE_URL, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('sample HTTP ' + res.status);
        return res.text();
      });
  }

  function readFileAsBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error || new Error('讀取失敗')); };
      reader.readAsArrayBuffer(file);
    });
  }


  /** Match key used by game + 今日拍卡: CLASS|classNo (no leading zeros). */
  function studentKey(className, no) {
    var c = String(className || '').trim().toUpperCase();
    var m = c.match(/^S?(\d+[A-D])$/i);
    if (m) c = m[1].toUpperCase();
    var n = parseInt(no, 10);
    if (!c || !n) return '';
    return c + '|' + n;
  }

  /**
   * Index students who have at least one tap time.
   * @returns {Object.<string, object>} key -> record
   */
  function buildTapIndex(records) {
    var byKey = {};
    (records || []).forEach(function (r) {
      if (!r || !r.times || !r.times.length) return;
      var k = studentKey(r.className, r.no);
      if (!k) return;
      byKey[k] = r;
    });
    return byKey;
  }

  function hasTap(byKey, className, no) {
    var k = studentKey(className, no);
    return !!(k && byKey && byKey[k]);
  }

  global.AttendanceUtil = {
    STORAGE_KEY: STORAGE_KEY,
    SAMPLE_URL: SAMPLE_URL,
    stripQuotes: stripQuotes,
    decodeBuffer: decodeBuffer,
    parseCsvText: parseCsvText,
    parseArrayBuffer: parseArrayBuffer,
    loadRawFromStorage: loadRawFromStorage,
    saveRawToStorage: saveRawToStorage,
    clearStorage: clearStorage,
    todayYmdHK: todayYmdHK,
    filterByDate: filterByDate,
    summarize: summarize,
    rosterTotals: rosterTotals,
    fetchSampleText: fetchSampleText,
    readFileAsBuffer: readFileAsBuffer,
    shortTime: shortTime,
    studentKey: studentKey,
    buildTapIndex: buildTapIndex,
    hasTap: hasTap
  };
})(typeof window !== 'undefined' ? window : this);
