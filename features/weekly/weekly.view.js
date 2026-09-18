/* =========================================================
   기능: 주간 — 뷰(화면)

   레퍼런스의 두 번째 화면 구조를 따른다.
     제목 + 원형 버튼 → 알약 세그먼트 → 큰 수치 카드(막대+말풍선) → 2열 도넛 타일 → 리스트
   세그먼트는 장식이 아니라 실제로 아래 묶음을 갈아 끼운다.
   내용은 그대로다 — 홈에서 옮겨 온 그래프·생체리듬이 여기 들어 있다.
   ========================================================= */
var WeeklyView = (function () {

  var el, m;
  var view = 'sum';                     // sum · uv · log (탭을 바꿔도 유지된다)
  var VIEWS = [
    { id: 'sum', label: '요약' },
    { id: 'uv',  label: '그래프' },
    { id: 'log', label: '기록' }
  ];

  function render(model) {
    m = model;
    el = document.getElementById('screen-weekly');
    el.innerHTML =
      header() + segment() +
      '<div id="w-sum"' + (view === 'sum' ? '' : ' hidden') + '>' +
        trendCard() + tilesRow() + forecastCard() +
      '</div>' +
      '<div id="w-uv"' + (view === 'uv' ? '' : ' hidden') + '>' +
        chartCard() + circadianCard() + gapDetailCard() +
      '</div>' +
      '<div id="w-log"' + (view === 'log' ? '' : ' hidden') + '>' +
        logCard() +
      '</div>';
    bind();
  }

  /* ---------- 헤더 ---------- */
  function header() {
    return '<div class="hdr">' +
      '<div class="hdr-l">' +
        '<div class="hdr-t">나의 햇빛<br>기록</div>' +
        '<div class="hdr-d">하루 목표를 100%로 본 충전률</div>' +
      '</div>' +
      '<div class="hdr-acts">' +
        '<button class="iconbtn" id="w-home" aria-label="홈으로">' + UI.ICON.home + '</button>' +
        '<button class="iconbtn" id="w-my" aria-label="마이페이지로">' + UI.ICON.user + '</button>' +
      '</div>' +
    '</div>';
  }

  function segment() {
    return '<div class="seg seg-float">' +
      VIEWS.map(function (v) {
        return '<button data-v="' + v.id + '"' + (view === v.id ? ' class="on"' : '') + '>' +
               v.label + '</button>';
      }).join('') +
    '</div>';
  }

  /* ---------- 주간 추이 : 큰 수치 + 알약 막대 + 말풍선 ---------- */
  function trendCard() {
    /* 말풍선은 이번 주 최고치 위에 띄운다 (레퍼런스의 툴팁 위치) */
    var peak = m.bars.reduce(function (a, b) { return b.percent > a.percent ? b : a; }, m.bars[0]);

    return '<div class="sec">' +
      '<div class="c-head">' +
        '<div class="c-ico">📊</div>' +
        '<div class="c-t">주간 충전 추이<small>최근 7일</small></div>' +
      '</div>' +
      '<div class="stat"><div class="stat-n">' + m.weeklyPercent + '</div>' +
        '<div class="stat-u">% · 주간 평균</div></div>' +
      '<div class="pbars" style="margin-top:22px;height:172px">' +
        m.bars.map(function (b) {
          var top = (b === peak && b.percent > 0)
            ? '<div class="tipwrap"><div class="tip">' + b.percent + '%</div>' +
              '<div class="tip-stem"></div><div class="tip-dot"></div></div>'
            : '';
          var cls = b.percent ? (b.isToday ? ' on' : '') : ' mute';
          return '<div class="pbar-c' + (b.isToday ? ' today' : '') + '">' + top +
            '<div class="pbar' + cls + '" style="height:' + Math.max(14, b.height) + '%;' +
              'min-height:34px;padding-top:9px">' +
              (b.percent ? '<b>' + b.percent + '</b>' : '') +
            '</div>' +
            '<div class="pbar-x">' + b.label + '</div>' +
          '</div>';
        }).join('') +
      '</div></div>';
  }

  /* ---------- 2열 도넛 타일 ---------- */
  function tilesRow() {
    var store = '<div class="sec">' +
      '<div class="c-head" style="margin-bottom:10px">' +
        '<div class="c-ico mint">🫙</div>' +
        '<div class="c-t" style="font-size:14.5px">체내 저장량</div>' +
      '</div>' +
      Chart.donut(m.bodyStore, {
        size: 124, stroke: 14,
        center: '<div class="donut-n">' + m.bodyStore + '<small>%</small></div>' +
                '<div class="donut-l">반감기 ' + m.halfLife + '일</div>'
      }) +
      '<div class="gauge-cap" style="text-align:center">' +
        (m.missDays > 0 ? '창 없는 날 ' + m.missDays + '일째' : '꾸준히 채우는 중') +
      '</div></div>';

    var total = '<div class="sec">' +
      '<div class="c-head" style="margin-bottom:10px">' +
        '<div class="c-ico plum">⏱️</div>' +
        '<div class="c-t" style="font-size:14.5px">주간 충전률</div>' +
      '</div>' +
      Chart.donut(Math.min(100, m.weeklyPercent), {
        size: 124, stroke: 14, color: '#7C5CFC',
        center: '<div class="donut-n">' + m.weeklyPercent + '<small>%</small></div>' +
                '<div class="donut-l">누적 ' + m.totalMinutes + '분</div>'
      }) +
      '<div class="gauge-cap" style="text-align:center">기록 ' + m.sessions.length + '회</div>' +
    '</div>';

    return '<div class="grid2">' + store + total + '</div>';
  }

  /* ---------- 예보 ---------- */
  function forecastCard() {
    return '<div class="sec">' +
      '<div class="c-head">' +
        '<div class="c-ico warm">🗓️</div>' +
        '<div class="c-t">' + (m.forecast.length > 1 ? '앞으로 ' + m.forecast.length + '일' : '오늘 예보') +
          '<small>' + (m.forecast.length > 1
            ? '기상청 단기예보 기준으로 창이 열리는 날'
            : '단기예보가 오늘치만 도착했어요') + '</small></div>' +
      '</div>' +
      '<div class="win-list">' +
        (m.forecast.length ? m.forecast.map(function (f) {
          return '<div class="win-item' + (f.isToday ? ' best' : '') + '">' +
            '<div class="win-rank" style="font-size:11px">' + f.label.split(' ')[1] + '</div>' +
            '<div class="lrow-b"><div class="win-time">' + f.label.split(' ')[0] + ' · ' + f.bestText + '</div>' +
                 '<div class="win-meta">' + f.mode.label + ' 모드 · 창 ' + f.count + '개</div></div>' +
            '<div class="win-min">' + (f.minutes || '—') + (f.minutes ? '<small>분</small>' : '') + '</div>' +
          '</div>';
        }).join('') : '<div class="empty">예보를 불러오지 못했어요</div>') +
      '</div></div>';
  }

  /* ---------- 홈에서 옮겨 온 시간별 그래프 ---------- */
  function chartCard() {
    var d = m.detail;
    if (!d) return '<div class="sec"><div class="empty">예보를 불러오지 못했어요</div></div>';
    return '<div class="sec">' +
      '<div class="c-head">' +
        '<div class="c-ico">☀️</div>' +
        '<div class="c-t">오늘 시간별 날씨<small>파란 띠가 나갈 수 있는 구간</small></div>' +
      '</div>' +
      '<div class="chart-wrap">' +
        '<div class="chart-legend">' +
          '<i><b style="background:#2B63F6"></b>나갈 수 있는 정도</i>' +
          '<i><b style="background:#F59E0B"></b>기온</i>' +
        '</div>' + d.chart +
      '</div>' +
      '<div class="sun-line">' +
        '<span>일출 <b>' + d.sun.rise + '</b> · 일몰 <b>' + d.sun.set + '</b></span>' +
        '<span>남중 <b>' + d.solarNoonText + '</b> · 최대고도 <b>' + d.maxAltText + '</b></span>' +
      '</div>' +
    '</div>';
  }

  /* ---------- 홈에서 옮겨 온 §6 생체리듬 ---------- */
  function circadianCard() {
    var c = m.detail && m.detail.circadian;
    if (!c) return '';
    return '<div class="sec">' +
      '<div class="c-head">' +
        '<div class="c-ico plum">🌗</div>' +
        '<div class="c-t">생체리듬<small>햇빛의 두 번째 축 · 비타민D와 파장이 달라요</small></div>' +
      '</div>' +
      '<div class="card' + (c.indoorHint ? ' info' : '') + '">' +
        '<div class="card-t">심부체온 최저점 ' + c.tminText + '</div>' +
        '<div class="card-b">' + c.body + '</div>' +
      '</div>' +
      (c.phaseLabel
        ? '<div class="card"><div class="card-t">⏱️ 오늘 권장 시점의 효과</div>' +
          '<div class="card-b">' + c.phaseLabel + '</div></div>'
        : '') +
      '<div class="card"><div class="card-t">🚫 빛 회피 창</div>' +
        '<div class="card-b"><b>' + c.avoidText + '</b>부터 취침 전까지는 밝은 빛을 줄이세요. ' +
        '기상 ' + c.wakeText + ' 기준 16시간 후입니다.</div></div>' +
    '</div>';
  }

  /* ---------- 홈에서 옮겨 온 §5 상세 — 공식 섭취기준 (창이 없는 날만) ---------- */
  function gapDetailCard() {
    var g = m.detail && m.detail.gap;
    if (!g) return '';
    return '<div class="sec">' +
      '<div class="c-head">' +
        '<div class="c-ico warm">💊</div>' +
        '<div class="c-t">보충제를 고려할 구간<small>용량은 정해 드리지 않습니다 · 공식 기준만</small></div>' +
      '</div>' +
      '<dl class="official" style="margin-top:0">' +
        '<dt>비타민D 섭취 기준</dt>' +
        g.official.rows.map(function (r) {
          return '<dd><span>' + r.k + '</span><b>' + r.v + '</b></dd>';
        }).join('') +
        '<div class="src">출처 · ' + g.official.source + '</div>' +
      '</dl></div>';
  }

  /* ---------- 노출 이력 ---------- */
  function logCard() {
    return '<div class="sec">' +
      '<div class="c-head">' +
        '<div class="c-ico">📒</div>' +
        '<div class="c-t">노출 이력<small>누적 ' + m.totalMinutes + '분 · ' + m.sessions.length + '회</small></div>' +
      '</div>' +
      (m.sessions.length
        ? m.sessions.map(function (s) {
            return '<div class="log">' +
              '<div class="log-d">' + s.dateText + '</div>' +
              '<div class="log-t">' + s.timeText + ' · ' + s.minutes + '분' +
                '<small>' + s.gear + ' · ' + s.limitLabel + ' 기준</small></div>' +
              '<div class="log-p">+' + s.percent + '%</div>' +
            '</div>';
          }).join('')
        : '<div class="empty"><em>🌤️</em>아직 기록이 없어요<br>타이머로 한 번 나가 보세요</div>') +
    '</div>';
  }

  /* ---------- 이벤트 ---------- */
  function bind() {
    [].forEach.call(el.querySelectorAll('.seg button'), function (b) {
      b.onclick = function () {
        view = b.dataset.v;
        [].forEach.call(el.querySelectorAll('.seg button'), function (o) {
          o.classList.toggle('on', o.dataset.v === view);
        });
        ['sum', 'uv', 'log'].forEach(function (id) {
          document.getElementById('w-' + id).hidden = (id !== view);
        });
        window.scrollTo(0, 0);
        var ap = document.getElementById('app');
        if (ap) ap.scrollTop = 0;   // 데스크톱 기기 틀에서는 #app이 스크롤된다
      };
    });
    var home = document.getElementById('w-home');
    if (home) home.onclick = function () { App.go('home'); };
    var my = document.getElementById('w-my');
    if (my) my.onclick = function () { App.go('settings'); };
  }

  return { render: render };
})();
