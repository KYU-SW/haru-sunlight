/* =========================================================
   기능: 내 햇빛 분석(주간) — 뷰(화면)

   하단 탭에서 빼고 마이페이지 → '내 햇빛 분석'으로 들어오는 하위 화면이다.
   세그먼트로 쪼개지 않고 한 화면에 중요도 순으로 쌓는다.
     이번 주 분석: 충전률(막대) → 저장량 · 누적 → 예보
     노출 이력:   누적 · 횟수 → 이력 목록 (마이페이지의 '내 햇빛 기록'을 누르면 이쪽으로 연다)
   ========================================================= */
var WeeklyView = (function () {

  var el, m;
  var mode = 'analysis';     // analysis(이번 주 분석) · log(노출 이력) — 같은 화면을 둘로 쓴다

  /* 마이페이지에서 들어올 때 어느 쪽으로 열지 정하고 연다 */
  function open(which) {
    mode = which === 'log' ? 'log' : 'analysis';
    App.go('weekly');
  }

  function render(model) {
    m = model;
    el = document.getElementById('screen-weekly');
    el.innerHTML = mode === 'log'
      ? header('노출 이력') +
        '<div class="ha-wrap">' + logSummary() + logCard() + '</div>'
      : header('이번 주 분석') +
        '<div class="ha-wrap">' +
          weekCard() +
          splitCard() +
          forecastCard() +
        '</div>';
    bind();
  }

  /* ---------- 머리 : 뒤로 + 제목 ---------- */
  function header(title) {
    return '<div class="an-head">' +
      '<button class="an-back" id="w-back" aria-label="마이페이지로">' + UI.ICON.back + '</button>' +
      '<div class="an-t">' + title + '</div>' +
    '</div>';
  }

  /* ---------- 노출 이력 머리 요약 ---------- */
  function logSummary() {
    return '<section class="ha-t an-split">' +
      '<div><div class="ha-lab">이번 주 누적</div>' +
        '<b>' + m.totalMinutes + '<small>분</small></b></div>' +
      '<div><div class="ha-lab">나간 횟수</div>' +
        '<b>' + m.sessions.length + '<small>회</small></b></div>' +
    '</section>';
  }

  /* ---------- 이번 주 충전률 : 큰 수치 + 7일 막대 (오늘만 파랑) ---------- */
  function weekCard() {
    return '<section class="ha-t an-card">' +
      '<div class="ha-lab">이번 주 평균 충전률</div>' +
      '<div class="an-big">' + m.weeklyPercent + '<small>%</small></div>' +
      '<div class="an-bars">' +
        m.bars.map(function (b) {
          var h = b.percent ? Math.max(10, b.height) : 4;
          return '<div class="an-bar' + (b.isToday ? ' today' : '') + '">' +
            '<span class="an-bar-v">' + (b.percent ? b.percent : '') + '</span>' +
            '<i style="height:' + h + '%"></i>' +
            '<span class="an-bar-x">' + b.label + '</span>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</section>';
  }

  /* ---------- 체내 저장량 | 누적 시간 ---------- */
  function splitCard() {
    return '<section class="ha-t an-split">' +
      '<div><div class="ha-lab">체내 저장량</div>' +
        '<b>' + m.bodyStore + '<small>%</small></b>' +
        '<span>' + (m.missDays > 0 ? '햇빛 못 쬔 날 ' + m.missDays + '일째' : '반감기 ' + m.halfLife + '일') + '</span></div>' +
      '<div><div class="ha-lab">이번 주 누적</div>' +
        '<b>' + m.totalMinutes + '<small>분</small></b>' +
        '<span>기록 ' + m.sessions.length + '회</span></div>' +
    '</section>';
  }

  /* ---------- 예보로 본 햇빛 창 ---------- */
  function forecastCard() {
    if (!m.forecast.length) return '';
    return '<section class="ha-t an-card">' +
      '<div class="ha-lab">' + (m.forecast.length > 1 ? '앞으로 ' + m.forecast.length + '일' : '오늘 예보') + '</div>' +
      '<div class="an-list">' +
        m.forecast.map(function (f) {
          var parts = f.label.split(' ');
          return '<div class="an-row' + (f.isToday ? ' on' : '') + '">' +
            '<span class="an-row-d"><b>' + parts[0] + '</b>' + (parts[1] || '') + '</span>' +
            '<span class="an-row-m">' + f.bestText + '</span>' +
            '<span class="an-row-v">' + (f.minutes ? f.minutes + '분' : '—') + '</span>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</section>';
  }

  /* ---------- 노출 이력 ---------- */
  function logCard() {
    return '<section class="ha-t an-card">' +
      (m.sessions.length
        ? '<div class="an-list">' + m.sessions.map(function (s) {
            return '<div class="an-row">' +
              '<span class="an-row-d"><b>' + s.dateText + '</b></span>' +
              '<span class="an-row-m">' + s.timeText + ' · ' + s.minutes + '분</span>' +
              '<span class="an-row-v blue">+' + s.percent + '%</span>' +
            '</div>';
          }).join('') + '</div>'
        : '<div class="an-empty">아직 기록이 없어요<br>타이머로 한 번 나가 보세요</div>') +
    '</section>';
  }

  /* ---------- 이벤트 ---------- */
  function bind() {
    var back = document.getElementById('w-back');
    if (back) back.onclick = function () { App.go('settings'); };
  }

  return { render: render, open: open };
})();
