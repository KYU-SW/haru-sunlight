/* =========================================================
   core / 주간 돌아보기 — 지난주(월~일) 기록 요약 · 여러 사람 평균
   DOM · Firebase 접근 없음. 앱(홈 카드)과 관리자 대시보드가 같이 쓴다.

   한 사람의 지난주
     days      타이머를 쓴 날 수
     goalDays  그날 타이머 충전률 합이 100% 이상인 날 수 (하루 목표를 채운 날)
     goalRate  goalDays ÷ days (%, 반올림)
     minutes   쬔 시간 합 (분)
   여러 사람 평균 (관리자가 stats/latest 에 올린다)
     n · goalRate(사람별 비율의 평균) · minutes(사람별 합의 평균)
     → 3명 미만이면 앱에서 비교를 보여 주지 않는다 (누구 기록인지 짐작되지 않게)
   ========================================================= */
var Report = (function () {

  var MIN_N = 3;

  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function key(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function parse(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function add(k, n) { var d = parse(k); return key(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); }

  /* 그 날짜가 속한 주의 월요일 */
  function monday(k) { var d = parse(k); return add(k, -((d.getDay() + 6) % 7)); }

  /* 지난주 — week는 그 주 월요일 */
  function lastWeek(todayKey) {
    var start = add(monday(todayKey), -7);
    return { week: start, start: start, end: add(start, 6) };
  }

  /* 기록(sessions) 중 한 사람 · 한 주 요약. 그 주에 쓴 날이 없으면 null */
  function mine(sessions, range) {
    var byDay = {}, minutes = 0;
    (sessions || []).forEach(function (s) {
      if (!s || !s.dateKey || s.dateKey < range.start || s.dateKey > range.end) return;
      byDay[s.dateKey] = (byDay[s.dateKey] || 0) + (+s.percent || 0);
      minutes += +s.minutes || 0;
    });
    var days = Object.keys(byDay).length;
    if (!days) return null;
    var goalDays = Object.keys(byDay).filter(function (k) { return byDay[k] >= 100; }).length;
    return { week: range.week, days: days, goalDays: goalDays,
             goalRate: Math.round(goalDays / days * 100), minutes: Math.round(minutes) };
  }

  /* 여러 사람 기록(uid가 붙은 sessions) → 평균 */
  function summarize(sessions, range) {
    var byUser = {};
    (sessions || []).forEach(function (s) { if (s && s.uid) (byUser[s.uid] = byUser[s.uid] || []).push(s); });
    var rows = Object.keys(byUser).map(function (u) { return mine(byUser[u], range); }).filter(Boolean);
    var n = rows.length;
    if (!n) return { week: range.week, n: 0, goalRate: null, minutes: null };
    var avg = function (f) { return Math.round(rows.reduce(function (a, r) { return a + r[f]; }, 0) / n); };
    return { week: range.week, n: n, goalRate: avg('goalRate'), minutes: avg('minutes') };
  }

  /* 나 vs 평균 — 같은 주 · 3명 이상일 때만. diff = 내 비율 − 평균 비율 (%p) */
  function compare(me, stats) {
    if (!me || !stats || stats.week !== me.week || !(stats.n >= MIN_N) || stats.goalRate == null) return null;
    return { avg: stats.goalRate, avgMinutes: stats.minutes, n: stats.n, diff: me.goalRate - stats.goalRate };
  }

  return { MIN_N: MIN_N, monday: monday, lastWeek: lastWeek, mine: mine, summarize: summarize, compare: compare, addDays: add };
})();
