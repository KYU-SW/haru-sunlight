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
      header(m) +
      (m.stale ? '<div class="stale">⚠️ 네트워크 연결이 안 돼 저장된 예보로 계산했어요</div>' : '') +
      summaryCard(m) +
      /* 타이머 시작 CTA — '오늘의 처방' 카드 바로 아래에 가로로 길게 둔다. */
      ctaWide(m) +
      /* 창이 있으면 '오늘 열리는 창', 없으면 그 자리에 대체 수단이 온다.
         '무엇이 이 시간을 정했나'와 하단 이동 행들은 마이페이지로 옮겼다. */
      (m.windows.length ? windowsCard(m) : '') +
      (m.gap ? gapCard(m) : '');
    bind(m);
  }

  /* ---------- 헤더 : 큰 제목 + 원형 버튼 ---------- */
  function header(m) {
    var d = m.rx.date;
    var dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    var dateShort = (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + dow;
    var notifyOn = m.rx.profile.notify && Notify.granted();

    return '<div class="hdr">' +
      '<div class="hdr-l">' +
        '<div class="hdr-t">하루 햇빛</div>' +
        '<div class="hdr-d">' + UI.esc(m.loc.name) + ' · ' + dateShort + '</div>' +
      '</div>' +
      '<div class="hdr-acts">' +
        '<button class="iconbtn" id="h-loc" aria-label="지역 바꾸기">' + UI.ICON.pin + '</button>' +
        '<button class="iconbtn" id="h-evi" aria-label="계산 근거 보기">' + UI.ICON.sliders + '</button>' +
        '<button class="iconbtn" id="h-bell" aria-label="알림">' + UI.ICON.bell +
          (notifyOn ? '<span class="dot"></span>' : '') + '</button>' +
        '<button class="iconbtn" id="h-refresh" aria-label="날씨 새로고침">' +
          UI.ICON.refresh + '</button>' +
      '</div>' +
    '</div>';
  }

  /* ---------- 타이머 시작 CTA : '오늘의 처방' 카드 아래에 가로로 길게 ----------
     예전엔 이 버튼이 원형 버튼들과 한 줄에 있는 파란 알약이었다.
     이제 오늘의 처방(summaryCard) 바로 밑에 화면 너비만큼 길게 배치해
     '지금 무엇을 해야 하는지'가 처방 다음 동작으로 바로 이어지게 한다. */
  function ctaWide(m) {
    var h = m.hero;
    var cta;
    if (h.cta) {
      cta = '<button class="act-cta wide" id="h-cta">' +
              (h.cta.action === 'timer' ? UI.ICON.play : UI.ICON.bell) + h.cta.label + '</button>';
    } else if (h.passed) {
      /* 오늘 햇빛 쬘 수 있는 시간이 이미 다 지났다 — 더 할 수 있는 행동이 없으니
         버튼 자체를 아예 띄우지 않는다(내일 다시 열린다는 안내는 summaryCard에 있다). */
      return '';
    } else {
      /* 예전엔 '대체 수단 보기'가 아래 음식 카드로 스크롤만 해서
         무엇을 하는 버튼인지 알기 어려웠다. 이제 타이머로 보내
         '얼마나 나가야 하는지'를 직접 보여 준다(오늘 창이 없으면 내일 창 기준). */
      cta = '<button class="act-cta wide" id="h-cta-time">' + UI.ICON.timer +
            '나가야 할 시간 보기</button>';
    }
    return '<div class="cta-wrap">' + cta + '</div>';
  }

  /* ---------- 요약 카드 : 큰 수치 + 알약 막대 ---------- */
  function summaryCard(m) {
    var h = m.hero;
    var w = m.weatherNow;

    var main = h.state === 'closed'
      ? '<div class="stat"><div class="stat-n ink" style="font-size:25px;letter-spacing:-.9px;' +
          'line-height:1.35">' + h.headline + '</div></div>'
      : '<div class="stat"><div class="stat-n">' + h.minutes + '</div>' +
        '<div class="stat-u">분</div></div>';

    var cap = (h.kicker ? h.kicker + ' · ' : '') + h.why;

    var duo = '<div class="duo" style="margin-top:16px">' +
        (w ? '<div class="duo-i"><b>' + w.tempC + '</b><span>' +
               (w.feels === w.tempC ? '기온' : '체감 ' + w.feels) + '</span></div>' : '') +
        '<div class="duo-i"><b>' + m.windows.length + '</b><span>일조 시간</span></div>' +
      '</div>';

    var sub = h.sub
      ? '<button class="btn-text" id="h-cta-sub">' + h.sub.label + '</button>'
      : '';

    return '<div class="sec">' +
      '<div class="c-head">' +
        '<div class="c-ico">' + UI.ICON.sun + '</div>' +
        '<div class="c-t">오늘의 처방<small>' + (h.when || m.dateText) + '</small></div>' +
        '<button class="c-go" id="h-go-weekly" aria-label="주간으로">' + UI.ICON.right + '</button>' +
      '</div>' +
      '<div class="top-mode mode-' + m.mode.id + '" style="margin-bottom:14px">' +
        '<span class="dot"></span>' + m.modeLabel + ' 모드</div>' +
      main +
      '<div class="stat-cap">' + cap + '</div>' +
      duo +
      sub +
    '</div>';
  }

  /* ---------- 오늘 열리는 창 ---------- */
  function windowsCard(m) {
    return '<div class="sec">' +
      '<div class="c-head">' +
        '<div class="c-ico mint">🪟</div>' +
        '<div class="c-t">오늘의 일조 시간<small>무리 없이 쬘 수 있는 시간만 골랐어요</small></div>' +
        '<span class="pill">' + m.windows.length + '개</span>' +
      '</div>' +
      '<div class="win-list">' +
        m.windows.map(function (w) {
          return '<button class="win-item' + (w.best ? ' best' : '') + '" data-win="' + w.index + '">' +
            '<div class="win-rank">' + (w.active ? '지금' : w.index + 1) + '</div>' +
            '<div class="lrow-b"><div class="win-time">' + w.timeText + '</div>' +
                 '<div class="win-meta">' + w.meta +
                 (w.cappedNote ? '<br><span style="color:#F0475B;font-weight:700">' +
                    w.cappedNote + '</span>' : '') +
                 '</div></div>' +
            '<div class="win-min">' + w.minutes + '<small>분</small></div>' +
          '</button>';
        }).join('') +
      '</div></div>';
  }

  /* ---------- 창이 없는 날의 대체 수단 ---------- */
  function gapCard(m) {
    var g = m.gap;
    return '<div class="sec">' +
      '<div class="c-head">' +
        '<div class="c-ico warm">🍽️</div>' +
        '<div class="c-t">' + g.title + '<small>' + g.subtitle + '</small></div>' +
      '</div>' +
      '<div class="sec-desc" style="margin-bottom:12px">' + g.note + '</div>' +
      foodGroups(g) +
      (g.showSupplementWarning
        ? '<div class="card warn" style="margin-top:12px"><div class="card-t">⚠️ 합산 상한 주의</div>' +
          '<div class="card-b">' + g.supplementWarning + '</div></div>'
        : '') +
    '</div>';
  }

  /* 비타민D가 든 음식 — 한 번에 다 펴면 카드가 길어져 읽기 어렵다.
     분류를 골라 그 분류만 보게 한다. 고른 분류는 화면을 다시 그려도 유지된다. */
  var foodTab = 0;

  function foodGroups(g) {
    if (foodTab >= g.foods.length) foodTab = 0;
    return '<div class="fseg" id="h-fseg">' +
        g.foods.map(function (grp, i) {
          return '<button class="fseg-b' + (i === foodTab ? ' on' : '') + '" data-fg="' + i + '">' +
                 grp.group + '<span>' + grp.items.length + '</span></button>';
        }).join('') +
      '</div>' +
      '<div id="h-fbody">' + foodBody(g) + '</div>' +
      '<div class="fnote">' + g.foodsCaveat + '</div>';
  }

  /* 고른 분류 하나만 그린다. 함량이 특히 높은 것은 파란 칩으로 구분한다
     (정확한 IU는 적지 않는다 — 자연산·양식·조리법에 따라 몇 배씩 갈리기 때문). */
  function foodBody(g) {
    var grp = g.foods[foodTab] || g.foods[0];
    return (grp.note ? '<div class="fgroup-n">' + grp.note + '</div>' : '') +
      '<div class="fchips">' +
        grp.items.map(function (f) {
          return '<span class="fchip' + (f.top ? ' top' : '') + '">' +
            '<em>' + f.emoji + '</em>' + f.name + '</span>';
        }).join('') +
      '</div>';
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
    if (q('h-loc')) q('h-loc').onclick = function () { App.go('settings'); };
    if (q('h-evi')) q('h-evi').onclick = function () { SettingsView.evidenceSheet(); };
    if (q('h-go-weekly')) q('h-go-weekly').onclick = function () { App.go('weekly'); };

    if (q('h-cta')) q('h-cta').onclick = function () {
      if (m.hero.cta.action === 'timer') App.startTimer(m.rx.activeWindow || m.rx.targetWindow);
      else App.enableNotify();
    };
    if (q('h-cta-sub')) q('h-cta-sub').onclick = function () {
      App.startTimer(m.rx.targetWindow);
    };
    if (q('h-cta-time')) q('h-cta-time').onclick = function () { App.go('timer'); };

    if (m.gap) {
      [].forEach.call(el.querySelectorAll('[data-fg]'), function (b) {
        b.onclick = function () {
          foodTab = +b.dataset.fg;
          [].forEach.call(el.querySelectorAll('[data-fg]'), function (x) {
            x.classList.toggle('on', +x.dataset.fg === foodTab);
          });
          document.getElementById('h-fbody').innerHTML = foodBody(m.gap);
        };
      });
    }

    [].forEach.call(el.querySelectorAll('[data-win]'), function (b) {
      b.onclick = function () { App.startTimer(m.rx.windows[+b.dataset.win]); };
    });
  }

  return { render: render };
})();
