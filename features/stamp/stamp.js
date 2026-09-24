/* =========================================================
   기능: 스탬프 — 하루 햇빛량을 다 채운 날에 해 도장이 찍힌다

   기준: 그날 충전률이 100% 이상이면 찍힌다 (Repo.getDaily()의 일별 누적).
   마이페이지의 '내 정보' 위에 이번 주 일곱 칸으로 놓이고,
   '한 달 치 보기'를 누르면 그달 달력을 시트로 연다.
   ========================================================= */
var StampService = (function () {

  var GOAL = 100;              // 몇 %부터 찍어 줄지 — 여기 한 곳만 바꾸면 된다
  var DOW = ['월', '화', '수', '목', '금', '토', '일'];

  function key(d) { return Engine.dayKey(d); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

  /* 월요일을 주의 시작으로 */
  function weekStart(d) {
    var i = (d.getDay() + 6) % 7;
    return addDays(d, -i);
  }

  function filled(daily, d) { return (daily[key(d)] || 0) >= GOAL; }

  /* 이번 주 일곱 칸 */
  function week(daily, today) {
    var start = weekStart(today), out = [];
    for (var i = 0; i < 7; i++) {
      var d = addDays(start, i);
      out.push({
        key: key(d), dow: DOW[i], day: d.getDate(),
        on: filled(daily, d),
        isToday: key(d) === key(today),
        future: d > today && key(d) !== key(today)
      });
    }
    return out;
  }

  /* 오늘(또는 어제)부터 거슬러 올라가며 이어 찍힌 날 수 */
  function streak(daily, today) {
    var n = 0, d = today;
    if (!filled(daily, d)) d = addDays(d, -1);      // 오늘은 아직 채우는 중일 수 있다
    while (filled(daily, d)) { n++; d = addDays(d, -1); }
    return n;
  }

  /* 그달 달력 — 월요일 시작, 앞쪽 빈칸 포함 */
  function month(daily, ref) {
    var y = ref.getFullYear(), m = ref.getMonth();
    var first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
    var pad = (first.getDay() + 6) % 7;
    var cells = [], i;
    for (i = 0; i < pad; i++) cells.push(null);
    for (i = 1; i <= last.getDate(); i++) {
      var d = new Date(y, m, i);
      cells.push({
        key: key(d), day: i,
        on: filled(daily, d),
        isToday: key(d) === Engine.dayKey(new Date()),
        future: d > new Date()
      });
    }
    return {
      year: y, month: m + 1, cells: cells,
      count: cells.filter(function (c) { return c && c.on; }).length
    };
  }

  function model(ref) {
    var daily = Repo.getDaily();
    var today = ref || new Date();
    var w = week(daily, today);
    return {
      goal: GOAL,
      week: w,
      weekCount: w.filter(function (c) { return c.on; }).length,
      streak: streak(daily, today),
      todayDone: filled(daily, today),
      month: month(daily, today)
    };
  }

  return { GOAL: GOAL, DOW: DOW, model: model, month: month, week: week, streak: streak };
})();


/* ---------------------------------------------------------
   스탬프 — 뷰(그리기)
   --------------------------------------------------------- */
var StampView = (function () {

  /* 해 도장 — 광선 여덟 줄 + 가운데 흰 체크 (도장 시안 '해님 · 체크') */
  var MARK =
    '<svg viewBox="0 0 100 100" aria-hidden="true" class="stp-svg">' +
      '<g stroke="currentColor" stroke-width="7" stroke-linecap="round">' +
        '<path d="M50 12v-4M50 88v4M88 50h4M12 50H8M76.9 23.1l2.8-2.8M20.3 79.7l2.8-2.8' +
                 'M76.9 76.9l2.8 2.8M20.3 20.3l2.8 2.8"/>' +
      '</g>' +
      '<circle cx="50" cy="50" r="30" fill="currentColor"/>' +
      '<path d="M38 51l8.5 8.5L63 43" fill="none" stroke="#fff" stroke-width="7" ' +
            'stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';

  function mark() { return MARK; }

  /* 마이페이지 카드 — 이번 주 일곱 칸 (숫자가 먼저) */
  function card(m) {
    return '<div class="st-g">스탬프</div>' +
      '<section class="ha-t stp">' +
        '<div class="stp-h">' +
          '<div>' +
            '<div class="stp-lab">이번 주 채운 날</div>' +
            '<div class="stp-big"><b>' + m.weekCount + '</b><span>/ 7일</span></div>' +
          '</div>' +
          (m.streak > 1 ? '<span class="stp-streak">' + m.streak + '일 연속</span>' : '') +
        '</div>' +
        '<div class="stp-week">' +
          m.week.map(function (c) {
            var cls = c.on ? 'on' : c.isToday ? 'today' : 'off';
            return '<div class="stp-d' + (c.isToday ? ' now' : '') + '">' +
              '<span class="stp-dow">' + c.dow + '</span>' +
              '<span class="stp-m ' + cls + '">' + (c.on ? MARK : '') + '</span>' +
            '</div>';
          }).join('') +
        '</div>' +
        '<button class="stp-more" id="s-stamp-more">한 달 치 보기</button>' +
      '</section>';
  }

  /* 한 달 치 시트 */
  function openMonth() {
    var m = StampService.model().month;
    var html =
      '<div class="stp-sh-h">' +
        '<span class="stp-sh-t">' + m.month + '월 스탬프</span>' +
        '<span class="stp-sh-v">' + m.count + '일 채움</span>' +
      '</div>' +
      '<div class="stp-grid">' +
        StampService.DOW.map(function (d) { return '<div class="stp-gd">' + d + '</div>'; }).join('') +
        m.cells.map(function (c) {
          if (!c) return '<div class="stp-c pad"></div>';
          return '<div class="stp-c' + (c.on ? ' on' : '') + (c.isToday ? ' today' : '') + '">' +
            (c.on ? MARK : c.day) + '</div>';
        }).join('') +
      '</div>' +
      '<div class="stp-legend">' +
        '<span><i class="stp-lg on">' + MARK + '</i>다 채운 날</span>' +
        '<span><i class="stp-lg">·</i>못 채운 날</span>' +
      '</div>';

    UI.sheet('스탬프', '하루 햇빛량을 다 채운 날에 도장이 찍혀요', html);
    document.getElementById('sheet-body').classList.add('tall');
  }

  return { card: card, mark: mark, openMonth: openMonth };
})();
