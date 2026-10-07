/* =========================================================
   관리자 대시보드 — 계산 (화면과 무관한 순수 함수)
   근거 문서: 기대효과_평가계획.md 3절(객관 지표). 설문은 따로 진행하므로 여기서 다루지 않는다.

   원칙
     · 집단 수준으로만 본다.
     · 주차별 평균의 분모는 Firestore에 들어온 참가자 전원. 기록이 없는 사람도 0분으로 넣는다.
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
  /* =========================================================
     타이머 기록 → 객관 지표 (3절)
     sessions: [{uid, dateKey, minutes, percent, limitedBy, endedBy}]
     users:    [{uid, notify, sido, skinType}]
     cfg:      {start, weeks, stampMin}
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

    /* 참가자 명단 — users 문서 + 기록만 있는 uid. 이 인원이 곧 분모다 */
    var roster = {};
    users.forEach(function (u) { roster[u.uid] = u; });
    Object.keys(byUser).forEach(function (uid) { if (!roster[uid]) roster[uid] = { uid: uid }; });
    var uids = Object.keys(roster);
    var n = uids.length;
    var zeros = 0;                                               // 따로 정한 인원이 없으니 채울 0도 없다

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
        ageGroup: roster[uid] && roster[uid].ageGroup, bmiGroup: roster[uid] && roster[uid].bmiGroup,
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
      sido: dist('sido'), skin: dist('skinType'),
      byAge: byGroup(people, 'ageGroup', AGE_GROUPS, weeks),
      byBmi: byGroup(people, 'bmiGroup', BMI_GROUPS, weeks)
    };
  }

  /* ---------- 연령대 · BMI 구간별 (users 문서의 ageGroup · bmiGroup — 원값은 앱이 보내지 않는다) ---------- */
  var AGE_GROUPS = [[10, '10대'], [20, '20대'], [30, '30대'], [40, '40대'], [50, '50대'], [60, '60대'], [70, '70대 이상']];
  var BMI_GROUPS = [['under', '저체중'], ['normal', '정상'], ['pre', '비만 전단계'], ['obese1', '1단계 비만'], ['obese2', '2단계 비만 이상']];

  function byGroup(people, key, order, weeks) {
    var out = order.map(function (g) { return { key: g[0], label: g[1], list: [] }; });
    var none = { key: null, label: '입력 안 함', list: [] };
    people.forEach(function (p) {
      var row = null;
      for (var i = 0; i < out.length; i++) if (out[i].key === p[key]) row = out[i];
      (row || none).list.push(p);
    });
    return out.concat([none]).filter(function (g) { return g.list.length; }).map(function (g) {
      var l = g.list;
      return {
        label: g.label, n: l.length,
        withData: l.filter(function (p) { return p.hasData; }).length,
        weekMean: weeks ? mean(l.map(function (p) { return p.total / weeks; })) : NaN,
        goalsMean: mean(l.map(function (p) { return p.goals; })),
        retained: l.filter(function (p) { return p.retained; }).length
      };
    });
  }

  return {
    dayNum: dayNum, keyOf: keyOf, mean: mean, sd: sd, median: median, ci95: ci95, records: records
  };
})();
