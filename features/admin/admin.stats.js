/* =========================================================
   관리자 대시보드 — 계산 (화면과 무관한 순수 함수)
   근거 문서: 기대효과_평가계획.md 3절(객관 지표) · 2절(설문) · 4절(연계표) · 5절(만족)

   원칙
     · 집단 수준으로만 본다. 설문과 기록을 사람 단위로 잇지 않는다.
     · 주차별 평균의 분모는 참가자 전원(N). 기록이 없는 사람도 0분으로 넣는다.
     · 스탬프 = 그날 타이머 분 합계가 기준(분) 이상인 날. 목표 달성일 = 그날 충전률 합 100% 이상.
   ========================================================= */
var AdminStats = (function () {

  /* ---------- 날짜 ---------- */
  function dayNum(key) {                 // 'YYYY-MM-DD' → 1970-01-01부터의 일수 (시간대 영향 없음)
    var p = key.split('-');
    return Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
  }
  function keyOf(n) {
    var d = new Date(n * 86400000);
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
  }

  /* ---------- 기초 통계 ---------- */
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function mean(a) { return a.length ? sum(a) / a.length : NaN; }
  function sd(a) {
    if (a.length < 2) return NaN;
    var m = mean(a), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return Math.sqrt(s / (a.length - 1));
  }
  function median(a) {
    if (!a.length) return NaN;
    var b = a.slice().sort(function (x, y) { return x - y; }), h = b.length >> 1;
    return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2;
  }
  /* 평균의 95% 신뢰구간 (정규 근사) */
  function ci95(a) {
    var m = mean(a), s = sd(a);
    if (!(a.length > 1) || isNaN(s)) return [m, m];
    var e = 1.96 * s / Math.sqrt(a.length);
    return [m - e, m + e];
  }
  /* 비율의 95% 신뢰구간 (Wilson) — 5절 */
  function wilson(k, n) {
    if (!n) return [NaN, NaN];
    var z = 1.96, p = k / n, d = 1 + z * z / n;
    var c = (p + z * z / (2 * n)) / d;
    var h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return [Math.max(0, c - h), Math.min(1, c + h)];
  }

  /* 표준정규 누적분포 (Abramowitz–Stegun 7.1.26) */
  function normCdf(x) {
    var t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t *
      Math.exp(-x * x / 2);
    return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }

  /* Mann–Whitney U (짝짓지 않은 두 집단, 양측, 정규 근사 + 동점 보정) — 3절 분석 방법 */
  function mannWhitney(a, b) {
    var n1 = a.length, n2 = b.length;
    if (!n1 || !n2) return null;
    var all = [];
    a.forEach(function (v) { all.push({ v: v, g: 0 }); });
    b.forEach(function (v) { all.push({ v: v, g: 1 }); });
    all.sort(function (x, y) { return x.v - y.v; });
    var ties = 0, i = 0;
    while (i < all.length) {
      var j = i;
      while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
      var r = (i + j) / 2 + 1, t = j - i + 1;
      for (var k = i; k <= j; k++) all[k].r = r;
      if (t > 1) ties += t * t * t - t;
      i = j + 1;
    }
    var r1 = 0;
    all.forEach(function (x) { if (x.g === 0) r1 += x.r; });
    var u1 = r1 - n1 * (n1 + 1) / 2, u = Math.min(u1, n1 * n2 - u1);
    var n = n1 + n2;
    var sigma = Math.sqrt(n1 * n2 / 12 * ((n + 1) - ties / (n * (n - 1))));
    if (!sigma) return { u: u, p: 1 };
    var z = (u - n1 * n2 / 2) / sigma;              // u는 작은 쪽이라 z ≤ 0
    return { u: u, z: z, p: Math.min(1, 2 * normCdf(z)) };
  }

  /* =========================================================
     타이머 기록 → 객관 지표 (3절)
     sessions: [{uid, dateKey, minutes, percent, limitedBy, endedBy}]
     users:    [{uid, notify, sido, skinType}]
     cfg:      {n, start, weeks, stampMin}
     ========================================================= */
  function records(sessions, users, cfg) {
    var byUser = {};                     // uid → dayNum → {min, pct}
    var firstDay = Infinity, lastDay = -Infinity;
    sessions.forEach(function (s) {
      if (!s || !s.uid || !s.dateKey) return;
      var d = dayNum(s.dateKey);
      var u = byUser[s.uid] || (byUser[s.uid] = {});
      var day = u[d] || (u[d] = { min: 0, pct: 0 });
      day.min += +s.minutes || 0;
      day.pct += +s.percent || 0;
      if (d < firstDay) firstDay = d;
      if (d > lastDay) lastDay = d;
    });

    var start = cfg.start ? dayNum(cfg.start) : (isFinite(firstDay) ? firstDay : null);
    var weeks = cfg.weeks || (start !== null && isFinite(lastDay) ? Math.max(1, Math.floor((lastDay - start) / 7) + 1) : 0);
    var end = start !== null ? start + weeks * 7 - 1 : null;     // 평가 기간 마지막 날
    var stampMin = cfg.stampMin || 0;

    /* 참가자 명단 — users 문서 + 기록만 있는 uid. 분모는 N(설정)과 실제 인원 중 큰 값 */
    var roster = {};
    users.forEach(function (u) { roster[u.uid] = u; });
    Object.keys(byUser).forEach(function (uid) { if (!roster[uid]) roster[uid] = { uid: uid }; });
    var uids = Object.keys(roster);
    var n = Math.max(cfg.n || 0, uids.length);
    var zeros = n - uids.length;                                 // 명단에 없는 참가자 = 기록 0

    var lastCounted = end;                                        // 오늘 이후는 세지 않는다 (기간 전이면 기간 끝까지)
    if (end !== null && cfg.today && dayNum(cfg.today) >= start) lastCounted = Math.min(end, dayNum(cfg.today));
    function inPeriod(d) { return start !== null && d >= start && d <= end; }
    function padded(arr) { for (var i = 0; i < zeros; i++) arr.push(0); return arr; }

    /* 사람별 요약 */
    var people = uids.map(function (uid) {
      var days = byUser[uid] || {};
      var keys = Object.keys(days).map(Number).filter(inPeriod).sort(function (a, b) { return a - b; });
      var week = [];
      for (var w = 0; w < weeks; w++) week.push(0);
      var stamps = 0, goals = 0, pcts = [];
      keys.forEach(function (d) {
        var x = days[d];
        week[Math.floor((d - start) / 7)] += x.min;
        if (x.min >= stampMin) stamps++;
        if (x.pct >= 100) goals++;
        pcts.push(x.pct);
      });
      /* 최장 공백일 — 평가 기간 안에서 기록 없이 이어진 날 수 */
      var gap = 0, run = 0;
      for (var d = start; d !== null && d <= lastCounted; d++) {
        if (days[d] && inPeriod(d)) { run = 0; } else { run++; if (run > gap) gap = run; }
      }
      var all = Object.keys(days).map(Number).sort(function (a, b) { return a - b; });
      var retained = all.length > 0 && all[all.length - 1] >= all[0] + 14;   // 첫 기록 후 14일째 이후에도 기록
      return {
        uid: uid, notify: !!(roster[uid] && roster[uid].notify),
        sido: roster[uid] && roster[uid].sido, skinType: roster[uid] && roster[uid].skinType,
        week: week, total: sum(week), days: keys.length, stamps: stamps, goals: goals,
        pcts: pcts, gap: gap, retained: retained, hasData: keys.length > 0
      };
    });

    /* 주차별 집단 평균 (분모 N, 0분 포함) */
    var weekly = [];
    for (var w = 0; w < weeks; w++) {
      var vals = padded(people.map(function (p) { return p.week[w]; }));
      weekly.push({ week: w + 1, from: keyOf(start + w * 7), mean: mean(vals), ci: ci95(vals), total: sum(vals) });
    }

    var stampsAll = padded(people.map(function (p) { return p.stamps; }));
    var goalsAll = padded(people.map(function (p) { return p.goals; }));
    var dayPcts = [];
    people.forEach(function (p) { dayPcts = dayPcts.concat(p.pcts); });

    var limited = { vitd: 0, burn: 0, heat: 0 }, ended = {};
    var sessCount = 0;
    sessions.forEach(function (s) {
      if (!s || !s.dateKey || !inPeriod(dayNum(s.dateKey))) return;
      sessCount++;
      if (limited[s.limitedBy] !== undefined) limited[s.limitedBy]++;
      var e = s.endedBy || 'manual';
      ended[e] = (ended[e] || 0) + 1;
    });

    /* 첫 주 대비 마지막 주에 늘어난 사람 수 (앱 익명 ID 기준, 설문과 잇지 않음) */
    var improved = weeks > 1 ? people.filter(function (p) { return p.week[weeks - 1] > p.week[0]; }).length : null;

    /* 알림 켬·끔별 1인당 주 평균 노출 (자기선택 편향 있음) */
    function perWeek(list) { return weeks ? mean(list.map(function (p) { return p.total / weeks; })) : NaN; }
    var on = people.filter(function (p) { return p.notify; }), off = people.filter(function (p) { return !p.notify; });

    function dist(key) {
      var m = {};
      people.forEach(function (p) { var k = p[key] || '모름'; m[k] = (m[k] || 0) + 1; });
      return m;
    }

    return {
      n: n, observed: uids.length, withData: people.filter(function (p) { return p.hasData; }).length,
      start: start !== null ? keyOf(start) : null, end: end !== null ? keyOf(end) : null, weeks: weeks,
      sessions: sessCount, weekly: weekly, people: people,
      stamps: stampsAll, goals: goalsAll,
      goalDaysTotal: sum(goalsAll),
      avgCharge: mean(dayPcts),
      gapMedian: median(people.map(function (p) { return p.gap; }).concat(
        (function () { var a = [], len = start !== null ? lastCounted - start + 1 : 0; for (var i = 0; i < zeros; i++) a.push(len); return a; })())),
      retained: people.filter(function (p) { return p.retained; }).length,
      improved: improved,
      notify: { on: on.length, off: off.length, onMean: perWeek(on), offMean: perWeek(off) },   // 가입 기록이 없는 참가자는 알림 설정을 알 수 없어 뺀다
      limited: limited, ended: ended,
      sido: dist('sido'), skin: dist('skinType')
    };
  }

  /* =========================================================
     설문 CSV (2절) — 구글 폼 내보내기
     열 제목에 문항 번호를 넣어 둔다: "[P1] 지난 7일 중 …"
     ========================================================= */
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  }

  var CODES = /(?:^|[^A-Za-z0-9])(S10|[DPKSMFXO][0-9])(?![0-9])/;
  function codeOf(header) { var m = CODES.exec(String(header)); return m ? m[1] : null; }

  function norm(s) { return String(s || '').replace(/\s+/g, '').replace(/[–—−\-]/g, '~'); }
  var TIME = ['5분미만', '5~15분', '15~30분', '30~60분', '60분이상', '모르겠다'];
  function timeIdx(v) { var i = TIME.indexOf(norm(v)); return i < 0 ? null : i; }
  function num(v) { var m = /-?\d+(\.\d+)?/.exec(String(v || '')); return m ? +m[0] : null; }

  /* 한 파일 → [{P1:3, P2:1, K1:'거짓', S1:4, …}] + 인식한 문항 목록 */
  function survey(text) {
    var rows = parseCSV(text);
    if (rows.length < 2) return { rows: [], codes: [], unknown: [] };
    var head = rows[0], map = {}, codes = [], unknown = [];
    head.forEach(function (h, i) {
      var c = codeOf(h);
      if (c && map[c] === undefined) { map[c] = i; codes.push(c); }
      else if (i > 0 && !/타임스탬프|timestamp/i.test(h)) unknown.push(h);
    });
    var out = rows.slice(1).map(function (r) {
      var o = {};
      codes.forEach(function (c) {
        var v = (r[map[c]] || '').trim();
        if (v === '') return;
        if (c === 'P1') o[c] = num(v);
        else if (c === 'P2' || c === 'P3') o[c] = timeIdx(v);
        else if (/^(S\d+|M1|M2|F\d)$/.test(c)) o[c] = num(v);
        else o[c] = v;
      });
      return o;
    });
    return { rows: out, codes: codes, unknown: unknown };
  }

  var KEY = { K1: '거짓', K2: '참', K3: '참' };

  function sus(r) {
    var t = 0;
    for (var i = 1; i <= 10; i++) {
      var v = r['S' + i];
      if (!(v >= 1 && v <= 5)) return null;          // 한 문항이라도 비면 제외
      t += i % 2 ? v - 1 : 5 - v;
    }
    return t * 2.5;
  }

  function counts(rows, key, n) {
    var a = []; for (var i = 0; i < n; i++) a.push(0);
    rows.forEach(function (r) { var v = r[key]; if (v !== null && v !== undefined && v >= 0 && v < n) a[v]++; });
    return a;
  }
  function tally(rows, key) {
    var m = {};
    rows.forEach(function (r) { var v = r[key]; if (v) m[v] = (m[v] || 0) + 1; });
    return m;
  }
  function vals(rows, key) {
    return rows.map(function (r) { return r[key]; }).filter(function (v) { return typeof v === 'number' && !isNaN(v); });
  }

  function surveyStats(pre, post) {
    pre = pre || []; post = post || [];
    function block(rows) {
      var k = {};
      ['K1', 'K2', 'K3'].forEach(function (c) {
        var ans = rows.filter(function (r) { return r[c]; });
        k[c] = { n: ans.length, ok: ans.filter(function (r) { return String(r[c]).trim() === KEY[c]; }).length };
      });
      var kn = k.K1.n + k.K2.n + k.K3.n, kok = k.K1.ok + k.K2.ok + k.K3.ok;
      var p3 = counts(rows, 'P3', 6);
      var p3n = sum(p3);
      return {
        n: rows.length,
        p1: vals(rows, 'P1'),
        p2: counts(rows, 'P2', 5),
        p3: p3,
        p3Extreme: p3n ? (p3[0] + p3[4]) / p3n : NaN,          // 5분 미만 + 60분 이상 (과소·과대 인식)
        k: k, kRate: kn ? kok / kn : NaN
      };
    }
    var a = block(pre), b = block(post);
    var susScores = post.map(sus).filter(function (v) { return v !== null; });
    var m1 = vals(post, 'M1');
    var sat = m1.filter(function (v) { return v >= 4; }).length;
    function agree(key) { var v = vals(post, key); return { n: v.length, agree: v.filter(function (x) { return x >= 4; }).length, mean: mean(v), dist: [1, 2, 3, 4, 5].map(function (s) { return v.filter(function (x) { return x === s; }).length; }) }; }
    return {
      pre: a, post: b,
      p1Test: mannWhitney(a.p1, b.p1),
      sus: { n: susScores.length, mean: mean(susScores), sd: sd(susScores), scores: susScores },
      m1: { n: m1.length, sat: sat, ci: wilson(sat, m1.length), mean: mean(m1) },
      m2: { n: vals(post, 'M2').length, mean: mean(vals(post, 'M2')) },
      m3: tally(post, 'M3'),
      f1: agree('F1'), f2: agree('F2'), f3: agree('F3'),
      x1: tally(post, 'X1'),
      demo: { d1: tally(pre, 'D1'), d2: tally(pre, 'D2'), d3: tally(pre, 'D3') },
      open: {
        o1: post.map(function (r) { return r.O1; }).filter(Boolean),
        o2: post.map(function (r) { return r.O2; }).filter(Boolean)
      }
    };
  }

  return {
    dayNum: dayNum, keyOf: keyOf, mean: mean, sd: sd, median: median, ci95: ci95, wilson: wilson,
    mannWhitney: mannWhitney, records: records, parseCSV: parseCSV, codeOf: codeOf, survey: survey,
    surveyStats: surveyStats, sus: sus, TIME: TIME
  };
})();
