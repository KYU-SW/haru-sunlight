/* =========================================================
   core / 회복 코스 — 햇빛 습관을 되찾는 코스 2가지
   DOM 접근 없음. 기록은 Repo(기기 저장)에만 둔다.

   코스 (TYPES)
     daily8 : 8주 매일 코스 — 56일 동안 날마다 그날 할 일 하나
     load12 : 12주 채우고 유지 코스 — 처음 4주는 주 3번, 다음 8주는 주 1번 (요일은 자유)

   그날 할 일은 날씨로 정한다 (두 코스 같음)
     vitd  : 햇빛 시간이 있는 날 — 앱 처방(비타민D 필요량)을 다 채우기 (충전률 100%)
     light : 겨울 모드(자외선지수 < Engine.MIN_UVI) — 낮에 바깥에서 20~30분 빛 받기 (스스로 체크)
     rest  : 흐림 · 장마, 폭염으로 햇빛 시간이 없는 날 — 쉬는 날. 8주 코스 달성률에서 빠진다.

   근거 (자세한 내용은 CALCULATION.md 10장)
     · 8주 매일: Joh 외 2020, Clin Nutr 39(3):727 — 서울 18~39세 무작위 대조시험, 8주 · 매일 정오 무렵 20~30분.
       잘 지킨 사람만 혈중 비타민D가 의미 있게 올랐다 → 꾸준히 하게 돕는 것이 코스의 목적.
     · 8주(약 2개월): Singh 외 2024, Healthcare 12(23):2488 — 건강 습관이 자리 잡는 데 중앙값 59~66일.
     · 짧게는 안 되는 이유: Lee 외 2020, J Korean Med Sci 35(8):e50 — 대구 20~49세, 주 3회 · 1달 → 거의 안 오름.
     · 12주 채우고 유지: Carswell 외 2018, Med Sci Sports Exerc 50(12):2555 — 영국 군 신병(젊은 남성) 137명,
       햇빛과 같은 빛의 램프로 4주 주 3회 → 8주 주 1회, 97%가 충분 수준(50 nmol/L) 도달.
     · 겨울 미션: Brown 외 2022, PLoS Biol e3001571 — 낮에는 밝은 빛을, 가능하면 햇빛으로.
       비타민D는 만들지 못하므로 화면에서 그렇게 말하지 않는다.
   ========================================================= */
var Course = (function () {

  var LIGHT_MIN = 20;       // 겨울 미션 — 20~30분
  var LIGHT_MAX = 30;
  var GOAL = 100;           // vitd 미션 — 그날 충전률 (스탬프와 같은 기준)

  var TYPES = {
    daily8: { id: 'daily8', name: '8주 매일 코스', short: '매일 · 8주', days: 56, weeks: 8, weekly: false,
              goal: function () { return 7; } },
    load12: { id: 'load12', name: '12주 채우고 유지 코스', short: '주 3번 → 주 1번 · 12주', days: 84, weeks: 12, weekly: true,
              goal: function (w) { return w <= 4 ? 3 : 1; } }
  };
  var ORDER = ['daily8', 'load12'];

  /* 예전 기록(type 없음)은 8주 매일 코스로 본다 */
  function typeOf(course) { return TYPES[(course && course.type) || 'daily8'] || TYPES.daily8; }

  /* 기본값 — 8주 매일 코스 (smoke 테스트 · 예전 화면 호환) */
  var DAYS = TYPES.daily8.days, WEEKS = TYPES.daily8.weeks;

  function parse(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dayNo(k) { var d = parse(k); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); }
  function addKey(k, n) { var d = parse(k); return Engine.dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); }

  /* 오늘 처방으로 미션 종류를 정한다. 낮 예보가 없으면(저녁 조회) 정하지 않는다 — null */
  function kindFor(rx) {
    if (!rx || rx.hasDaytimeData === false) return null;
    var id = rx.mode && rx.mode.id;
    if (id === 'winter') return 'light';
    if (rx.windows && rx.windows.length) return 'vitd';
    return 'rest';
  }

  /* 하루 상태 — done · miss · rest · today(아직 진행 중) · future
     주 단위 코스(load12)는 안 한 날이 '못 채움'이 아니라 그냥 지나간 날(free)이다 */
  function dayState(course, daily, k, todayKey) {
    if (k > todayKey) return 'future';
    var rec = (course.days || {})[k] || {};
    var done = (daily[k] || 0) >= GOAL || !!rec.light;   // 겨울날에 처방을 채워도 인정
    if (done) return 'done';
    if (rec.kind === 'rest') return 'rest';
    if (k === todayKey) return 'today';
    return typeOf(course).weekly ? 'free' : 'miss';
  }

  /* 8주 코스 구간 달성률 — 쉬는 날은 빼고, 오늘이 아직 안 끝났으면 오늘도 뺀다 */
  function rate(cells) {
    var counted = cells.filter(function (c) { return c.state === 'done' || c.state === 'miss'; });
    var done = counted.filter(function (c) { return c.state === 'done'; }).length;
    return { done: done, counted: counted.length, percent: counted.length ? Math.round(done / counted.length * 100) : null };
  }

  /* 주 단위 코스 달성률 — 끝난 주 + 이미 목표를 채운 이번 주만 센다. 주 목표보다 많이 한 날은 넘치지 않게 자른다 */
  function rateWeeks(weeks) {
    var counted = weeks.filter(function (w) { return w.ended || w.met; });
    var goal = 0, got = 0, days = 0;
    counted.forEach(function (w) { goal += w.goal; got += Math.min(w.done, w.goal); });
    weeks.forEach(function (w) { days += w.done; });
    return { done: days, counted: goal, got: got, percent: goal ? Math.round(got / goal * 100) : null };
  }

  function model(course, daily, todayKey) {
    var T = typeOf(course);
    if (!course || !course.start) return { started: false, type: T, days: T.days, weeks: T.weeks };
    var idx = dayNo(todayKey) - dayNo(course.start);           // 0부터
    var finished = idx >= T.days;
    var cells = [];
    for (var i = 0; i < T.days; i++) {
      var k = addKey(course.start, i);
      var rec = (course.days || {})[k] || {};
      cells.push({ key: k, n: i + 1, week: Math.floor(i / 7) + 1, kind: rec.kind || null,
                   state: dayState(course, daily, k, todayKey), isToday: k === todayKey });
    }
    var weeks = [];
    for (var w = 1; w <= T.weeks; w++) {
      var wc = cells.slice((w - 1) * 7, w * 7);
      var done = wc.filter(function (c) { return c.state === 'done'; }).length;
      weeks.push({ w: w, goal: T.goal(w), done: done, met: done >= T.goal(w),
                   ended: wc[6].key < todayKey });
    }
    var dayN = Math.min(T.days, idx + 1);
    var week = Math.min(T.weeks, Math.floor(Math.min(idx, T.days - 1) / 7) + 1);
    var weekCells = cells.slice((week - 1) * 7, week * 7);
    var today = finished ? null : cells[idx];
    var span = function (a, b) {
      return T.weekly ? rateWeeks(weeks.slice(a / 7, b / 7)) : rate(cells.slice(a, b));
    };
    return {
      started: true, finished: finished, type: T,
      start: course.start, end: addKey(course.start, T.days - 1),
      days: T.days, weeks: T.weeks, dayN: dayN, week: week,
      cells: cells, weekList: weeks,
      total: T.weekly ? rateWeeks(weeks) : rate(cells),
      thisWeek: rate(weekCells),
      weekDone: weeks[week - 1].done,
      weekGoal: weeks[week - 1].goal,
      weekMet: weeks[week - 1].met,
      /* 첫 2주 vs 마지막 2주 — 평가 계획(첫 주 · 마지막 주 비교)과 같은 방식 */
      first: span(0, 14),
      last: span(T.days - 14, T.days),
      today: today
    };
  }

  return {
    DAYS: DAYS, WEEKS: WEEKS, LIGHT_MIN: LIGHT_MIN, LIGHT_MAX: LIGHT_MAX, GOAL: GOAL,
    TYPES: TYPES, ORDER: ORDER, typeOf: typeOf,
    kindFor: kindFor, dayState: dayState, model: model, addKey: addKey
  };
})();
