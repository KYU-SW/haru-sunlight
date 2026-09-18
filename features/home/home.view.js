/* =========================================================
   기능: 홈(오늘의 처방) — 뷰(화면)

   레퍼런스 구조를 그대로 따른다.
     큰 제목 + 원형 버튼  →  원형 버튼 + 파란 알약 CTA
     →  요약 카드(큰 수치)  →  오늘 열리는 창

   홈에는 이 세 가지만 둔다. '무엇이 이 시간을 정했나'와 하단 이동 행들은
   마이페이지로, 시간별 그래프·생체리듬은 주간 탭으로 옮겼다.
   ========================================================= */
var HomeView = (function () {

  var el;

  function render(m) {
    el = document.getElementById('screen-home');
    el.innerHTML =
      head(m) +
      '<div class="ha-wrap">' +
        (m.stale ? '<div class="stale" style="margin:0">⚠️ 네트워크 연결이 안 돼 저장된 예보로 계산했어요</div>' : '') +
        greeting(m) +
        heroTile(m) +
        miniTiles(m) +
        (m.windows.length > 1 ? slotsCard(m) : '') +
      '</div>';
    bind(m);
  }

  function tf(e) { return '<span class="tf">' + e + '</span>'; }

  function uvLevel(u) {
    if (u < 3) return '낮음';
    if (u < 6) return '보통';
    if (u < 8) return '높음';
    if (u < 11) return '매우 높음';
    return '위험';
  }

  /* ---------- 머리 : 로고 + 아이콘 / 날짜 (지역은 마이페이지에서만) ---------- */
  function head(m) {
    var d = m.rx.date;
    var dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    var notifyOn = m.rx.profile.notify && Notify.granted();
    return '<div class="ha-head">' +
      '<div class="ha-top">' +
        '<div class="ha-logo">하루<span>햇빛</span></div>' +
        '<div class="ha-icons">' +
          '<button id="h-bell" aria-label="알림">' + UI.ICON.bell + (notifyOn ? '<i class="ha-dot"></i>' : '') + '</button>' +
          '<button id="h-refresh" aria-label="날씨 새로고침">' + UI.ICON.refresh + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="ha-loc">' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + dow + '요일</div>' +
    '</div>';
  }

  /* ---------- 오늘의 한마디 — 날짜마다 하나씩 (같은 날엔 새로고침해도 그대로) ----------
     창이 없는 날에 '나가 볼까요'가 뜨면 어색하므로 문구 묶음을 나눈다. */
  var GREET_OPEN = [
    '또 오셨네요!<br>오늘도 <em>햇빛</em> 쬐어 볼까요?',
    '반가워요!<br>오늘 <em>햇빛 시간</em> 알려드릴게요',
    '커피 한 잔 대신<br><em>햇빛 한 잔</em> 어때요?',
    '오늘 <em>햇빛</em>,<br>미리 확인해 뒀어요',
    '잠깐 <em>바람 쐬러</em><br>나가 볼까요?',
    '오늘은 <em>몇 분</em>이면 될지<br>같이 볼까요?',
    '창밖 날씨는<br><em>저희가</em> 보고 있을게요'
  ];
  var GREET_CLOSED = [
    '오늘은 <em>쉬어 가는 날</em>이에요',
    '<em>햇빛</em>은 내일 또 와요',
    '<em>내일</em> 다시 만나요'
  ];

  function greeting(m) {
    var d = m.rx.date;
    var day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
    var pool = m.hero.state === 'closed' ? GREET_CLOSED : GREET_OPEN;
    return '<div class="ha-greet">' + pool[day % pool.length] + '</div>';
  }

  /* ---------- 처방 타일 ---------- */
  function heroTile(m) {
    var h = m.hero, big, sub, art;
    if (h.state === 'open') {
      big = h.when; sub = '권장 <b>' + h.minutes + '분</b> · 지금 나가면 좋아요'; art = '☀️';
    } else if (h.state === 'waiting') {
      big = h.when; sub = '권장 <b>' + h.minutes + '분</b> · ' + h.kicker + ' 시작'; art = '🌤️';
    } else {
      big = h.headline; sub = h.when; art = h.passed ? '🌇' : '🌧️';
    }

    var cta;
    if (h.cta) {
      cta = '<button class="ha-cta" id="h-cta">' +
              (h.cta.action === 'timer' ? UI.ICON.play : UI.ICON.bell) + h.cta.label + '</button>';
    } else if (h.passed) {
      cta = '<button class="ha-cta" id="h-cta-tomorrow">' + UI.ICON.bell + '내일 알림 받기</button>';
    } else {
      cta = '<button class="ha-cta" id="h-cta-time">' + UI.ICON.timer + '나가야 할 시간 보기</button>';
    }

    return '<section class="ha-t ha-hero">' +
      '<div class="ha-lab">오늘의 처방</div>' +
      '<div class="ha-big' + (h.state === 'closed' ? ' sm' : '') + '">' + big + '</div>' +
      '<div class="ha-sub">' + sub + '</div>' +
      '<div class="ha-art">' + tf(art) + '</div>' +
      cta +
      (h.sub ? '<div class="ha-foot"><button id="h-cta-sub">' + h.sub.label + '</button></div>' : '') +
    '</section>';
  }

  /* ---------- 기온 · 자외선 — 한 카드에 위아래로, 가운데는 5단계 막대 ----------
     자외선: 기상청 자외선지수 5단계(낮음 <3 · 보통 <6 · 높음 <8 · 매우 높음 <11 · 위험)
     기온:   체감온도 기준. 위 두 칸은 기상청 폭염특보 기준(체감 33℃ 주의보 · 35℃ 경보),
             아래 세 칸은 선선 <18 · 쾌적 <26 · 더움 <33 */
  var UV_CUT = [3, 6, 8, 11];
  var HEAT_CUT = [18, 26, 33, 35];
  var HEAT_WORD = ['선선', '쾌적', '더움', '폭염 주의', '폭염 경고'];

  function step(v, cuts) {
    for (var i = 0; i < cuts.length; i++) if (v < cuts[i]) return i + 1;
    return cuts.length + 1;
  }

  function levelBar(n) {
    var s = '';
    for (var i = 1; i <= 5; i++) s += '<i' + (i <= n ? ' class="on"' : '') + '></i>';
    return '<span class="ha-bar">' + s + '</span>';
  }

  function miniTiles(m) {
    var w = m.weatherNow;
    if (!w) return '';
    var heat = step(parseFloat(w.feels), HEAT_CUT);
    var uv = step(+w.uvi, UV_CUT);
    return '<section class="ha-t ha-list">' +
      '<div class="ha-li"><span class="ha-lab">기온</span>' + levelBar(heat) +
        '<span class="ha-li-r"><b>' + w.tempC + '</b><small>' + HEAT_WORD[heat - 1] + '</small></span></div>' +
      '<div class="ha-li"><span class="ha-lab">자외선</span>' + levelBar(uv) +
        '<span class="ha-li-r"><b>' + w.uvi + '</b><small>' + uvLevel(+w.uvi) + '</small></span></div>' +
    '</section>';
  }

  /* ---------- 시간대가 여러 개일 때만 ---------- */
  function slotsCard(m) {
    return '<section class="ha-t ha-slots">' +
      '<div class="ha-lab" style="margin-bottom:10px">오늘 쬘 수 있는 시간</div>' +
      m.windows.map(function (w) {
        var badge = w.active ? '<i class="now">지금</i>' : (w.best ? '<i>추천</i>' : '');
        return '<button class="ha-slot" data-win="' + w.index + '">' +
          '<span class="ha-slot-ic">' + tf(w.active ? '🏃' : '☀️') + '</span>' +
          '<span class="ha-slot-b"><b>' + w.timeText + badge + '</b><small>' + (w.cappedNote || w.recommendText) + '</small></span>' +
          '<span class="ha-slot-v">' + w.minutes + '분</span>' +
        '</button>';
      }).join('') +
    '</section>';
  }

  /* ---------- 이벤트 ---------- */
  function bind(m) {
    var q = function (id) { return document.getElementById(id); };

    /* 새로고침 — 기상청에서 날씨·자외선지수를 지금 다시 받아온다.
       받는 동안 아이콘을 돌리고, 끝나면 언제 기준 자료인지 토스트로 알려 준다. */
    if (q('h-refresh')) q('h-refresh').onclick = function () {
      var btn = this;
      if (btn.dataset.busy === '1') return;        // 연타 방지
      btn.dataset.busy = '1';
      btn.classList.add('spinning');

      App.refresh(true).then(function (res) {
        if (!res) return;
        if (res.stale) {
          UI.toast('기상청에서 새 자료를 못 받아 저장된 예보로 보여드려요');
          return;
        }
        var t = new Date(res.data.fetchedAt);
        UI.toast('최신 예보로 새로고침했어요 · ' +
                 UI.hm(t.getHours() * 60 + t.getMinutes()) + ' 기준');
      }).catch(function () {
        /* 실패 토스트는 App.refresh가 이미 띄운다 */
      }).then(function () {
        /* 화면이 다시 그려지면 이 버튼은 사라지지만, 안 그려진 경우를 대비해 되돌린다 */
        var cur = document.getElementById('h-refresh');
        if (cur) { cur.classList.remove('spinning'); cur.dataset.busy = ''; }
      });
    };

    if (q('h-bell')) q('h-bell').onclick = function () { App.enableNotify(); };
    if (q('h-go-weekly')) q('h-go-weekly').onclick = function () { WeeklyView.open('analysis'); };

    if (q('h-cta')) q('h-cta').onclick = function () {
      if (m.hero.cta.action === 'timer') App.startTimer(m.rx.activeWindow || m.rx.targetWindow);
      else App.enableNotify();
    };
    if (q('h-cta-sub')) q('h-cta-sub').onclick = function () {
      App.startTimer(m.rx.targetWindow);
    };
    if (q('h-cta-time')) q('h-cta-time').onclick = function () { App.go('timer'); };
    if (q('h-cta-tomorrow')) q('h-cta-tomorrow').onclick = function () { App.enableNotify(); };

    [].forEach.call(el.querySelectorAll('[data-win]'), function (b) {
      b.onclick = function () { App.startTimer(m.rx.windows[+b.dataset.win]); };
    });
  }

  return { render: render };
})();
