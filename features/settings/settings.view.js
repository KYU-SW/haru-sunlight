/* =========================================================
   기능: 설정(마이페이지) — 뷰(화면)

   레퍼런스의 마지막 화면처럼 인사말 + 아바타로 열고,
   원형 버튼 + 파란 알약 CTA를 얹은 뒤 카드로 항목을 묶는다.
   설정 항목·동작은 이전과 완전히 같다.
   ========================================================= */
var SettingsView = (function () {

  var el;
  var openSido = null;   // 지역 선택에서 펼쳐 둔 시·도

  function render() {
    /* 예보를 못 받았으면 App.prescription()이 null을 준다 — 그때는 오늘 카드만 빠지고
       나머지 설정은 그대로 열린다(키 없음 안내가 여기서 이뤄져야 하므로). */
    var m = SettingsService.model(App.prescription());
    el = document.getElementById('screen-settings');
    var p = m.profile;

    el.innerHTML =
      profileHeader(m) +
      todayCard(m) +
      moreCard() +
      bodyInfoRow(m) +

      '<div class="sec">' +
        '<div class="c-head">' +
          '<div class="c-ico plum">🌗</div>' +
          '<div class="c-t">리듬 · 알림</div>' +
        '</div>' +
        row('s-wake', '기상 시간', '생체리듬 계산 기준',
          '<input type="time" id="s-wake-in" value="' + p.wakeTime +
          '" style="border:none;background:#fff;border-radius:12px;padding:9px 11px;' +
          'font-size:14px;font-weight:800;color:#141A24">') +
        toggleRow('s-circ', '생체리듬 안내', '심부체온 최저점 · 빛 회피 창을 주간 탭에 표시', p.useCircadian) +
        toggleRow('s-supp', '보충제 복용 중', '켜면 합산 상한(4,000 IU/일) 경고를 함께 보여드려요', p.supplement) +
        toggleRow('s-notify', '알림', m.notifySupported
          ? '창이 열리기 ' + Notify.LEAD_MIN + '분 전에 알려드려요'
          : '이 브라우저는 알림을 지원하지 않아요', p.notify && m.notifyGranted) +
      '</div>' +

      '<div class="sec">' +
        '<div class="c-head">' +
          '<div class="c-ico mint">📍</div>' +
          '<div class="c-t">위치<small>기상청 API 기준 국내 지역만 · 기기에만 저장돼요</small></div>' +
        '</div>' +
        '<div class="card" style="margin-bottom:10px"><div class="card-b">' +
          (m.location
            ? '<b>' + UI.esc(m.location.name) + '</b> · ' + m.location.lat + ', ' + m.location.lon +
              (m.location.precise ? ' · 현재 위치' : ' · 도시 선택')
            : '설정되지 않음') +
        '</div></div>' +
        '<button class="btn btn-sub" id="s-geo">📍 현재 위치로 다시 잡기</button>' +
        regionPicker(m) +
      '</div>';

    bind();
  }

  /* ---------- 홈에서 옮겨 온 '무엇이 이 시간을 정했나' ----------
     오늘 처방이 왜 그 숫자인지 설명하는 카드다. 알약 막대로 한눈에 보여 주고
     그 아래에 세 제약의 값과 근거를 그대로 편다. */

  /* 알약 막대에 쓸 짧은 이름 · 표기 (막대 폭이 좁아 긴 문구는 못 넣는다) */
  var SHORT = { vitd: '비타민D', burn: '화상', heat: '열', alt: '고도' };
  function short(v) { return v === '제한 없음' ? '없음' : v; }

  /* 피부 타입 · 기본 옷차림 — 늘 펴 두지 않고 '신체 정보' 버튼 하나로 묶어
     누르면 시트로 연다(자주 안 바꾸는 값이라 화면을 계속 차지할 필요가 없다). */
  function bodyInfoRow(m) {
    var p = m.profile;
    var skin = 'ⅠⅡⅢⅣⅤⅥ'[p.skinType - 1];
    var cloth = m.clothingOptions.filter(function (c) { return c.key === p.clothing; })[0];
    return '<div class="sec">' +
      '<button class="more-row" id="s-body-info">' +
        '<div class="more-ico">🧑‍🦰</div>' +
        '<div class="more-body">' +
          '<div class="more-t">신체 정보</div>' +
          '<div class="more-d">피부 타입 ' + skin + ' · ' + (cloth ? cloth.label : '') + '</div>' +
        '</div>' + UI.ICON.right +
      '</button>' +
    '</div>';
  }

  /* 신체 정보 시트 — 이전에 화면에 늘 펴져 있던 피부 타입/옷차림 카드를
     그대로 옮겨 왔다. #sheet-body는 #screen-settings 밖에 있어 el 기준
     querySelector로 못 찾으므로, 이 시트 전용 바인딩을 따로 건다. */
  function bodyInfoSheet() {
    var m = SettingsService.model(App.prescription());
    var p = m.profile;

    var html =
      '<div class="sec">' +
        '<div class="c-head">' +
          '<div class="c-ico">🧑‍🦰</div>' +
          '<div class="c-t">피부 타입<small>Fitzpatrick 분류 · 현재 MED ' + m.medOfCurrent + ' J/m²</small></div>' +
        '</div>' +
        '<div class="seg" id="s-skin">' +
          m.skinOptions.map(function (s) {
            return '<button data-t="' + s.t + '"' + (p.skinType === s.t ? ' class="on"' : '') + '>' +
                   s.label + '</button>';
          }).join('') +
        '</div>' +
        '<div class="stat-cap" style="margin-top:12px">' +
          m.skinOptions.filter(function (s) { return s.t === p.skinType; })[0].desc + '</div>' +
      '</div>' +

      '<div class="sec">' +
        '<div class="c-head">' +
          '<div class="c-ico warm">👕</div>' +
          '<div class="c-t">기본 옷차림<small>노출 피부 면적(f_BSA)이 필요 시간을 좌우합니다</small></div>' +
        '</div>' +
        '<div class="seg" id="s-cloth">' +
          m.clothingOptions.map(function (c) {
            return '<button data-c="' + c.key + '"' + (p.clothing === c.key ? ' class="on"' : '') + '>' +
              c.label + '<div style="font-size:11px;color:#8A96AA;font-weight:700;margin-top:2px">' +
              Math.round(c.f * 100) + '%</div></button>';
          }).join('') +
        '</div>' +
      '</div>';

    UI.sheet('신체 정보', null, html);
    bindBodyInfoSheet();
  }

  function bindBodyInfoSheet() {
    var sheet = document.getElementById('sheet-body');
    if (!sheet) return;
    [].forEach.call(sheet.querySelectorAll('#s-skin button'), function (b) {
      b.onclick = function () {
        SettingsService.set({ skinType: +b.dataset.t });
        App.invalidate();
        render();
        bodyInfoSheet();
      };
    });
    [].forEach.call(sheet.querySelectorAll('#s-cloth button'), function (b) {
      b.onclick = function () {
        SettingsService.set({ clothing: b.dataset.c });
        App.invalidate();
        render();
        bodyInfoSheet();
      };
    });
  }

  function todayCard(m) {
    var t = m.today;
    if (!t) return '';
    var head = t.state === 'closed'
      ? t.modeLabel + ' 모드 · 오늘은 창이 없어요'
      : (t.kicker ? t.kicker + ' ' : '') + t.minutes + '분 · ' + t.why;

    return '<div class="sec">' +
      '<div class="c-head">' +
        '<div class="c-ico warm">📋</div>' +
        '<div class="c-t">무엇이 이 시간을 정했나<small>파란 항목이 오늘의 결정자</small></div>' +
      '</div>' +
      '<div class="stat-cap" style="margin-top:0;margin-bottom:2px">' + head + '</div>' +
      pbars(t) +
      '<div class="limits" style="margin-top:18px">' +
        t.limits.map(function (l) {
          return '<div class="limit' + (l.win ? ' win' : '') + '">' +
            '<div class="limit-ico">' + l.icon + '</div>' +
            '<div class="limit-body">' +
              '<div class="limit-name">' + l.name +
                (l.win ? '<span class="limit-tag">결정</span>' : '') + '</div>' +
              '<div class="limit-note">' + l.note + '</div>' +
            '</div>' +
            '<div class="limit-val">' + l.value + '</div>' +
          '</div>';
        }).join('') +
      '</div></div>';
  }

  /* 세 제약을 알약 막대로 — 가장 짧은 것이 파랑(오늘의 결정자)이다.
     min() 계산이라 파란 막대가 제일 낮게 보이는 게 정상이다. */
  function pbars(t) {
    var rows = t.limits.filter(function (l) { return l.key !== 'alt'; });
    if (!rows.length) return '';

    var vals = rows.map(function (l) {
      var n = parseFloat(l.value);                 // '25분' → 25, '제한 없음' → NaN
      return isFinite(n) ? Math.min(n, 60) : 60;   // 60분을 천장으로 본다
    });
    var max = Math.max.apply(null, vals) || 60;

    return '<div class="pbars" style="margin-top:16px">' +
      rows.map(function (l, i) {
        var h = Math.max(38, Math.round(vals[i] / max * 100));
        return '<div class="pbar-c">' +
          '<div class="pbar' + (l.win ? ' on' : '') + '" style="height:' + h + '%">' +
            '<b>' + short(l.value) + '</b><span>' + (SHORT[l.key] || l.name) + '</span>' +
          '</div></div>';
      }).join('') +
    '</div>' +
    '<div class="stat-cap" style="text-align:center;margin-top:12px">' +
      '세 제약 중 <b>가장 짧은 값</b>이 오늘의 처방이에요</div>';
  }

  /* 홈 맨 아래에 있던 이동 행 — 주간 탭으로 가는 입구 */
  function moreCard() {
    return '<div class="sec">' +
      '<button class="more-row" id="s-more-weekly">' +
        '<div class="more-ico">📈</div>' +
        '<div class="more-body">' +
          '<div class="more-t">생체리듬 자세히</div>' +
          '<div class="more-d">노출 가능 구간, 주간 충전률</div>' +
        '</div>' + UI.ICON.right +
      '</button>' +
    '</div>';
  }

  /* 인사말 + 아바타 (레퍼런스의 "Hi, Sophia!" 자리)
     홈으로 가는 원형 버튼은 따로 줄을 두지 않고 아바타 옆에 바로 붙였다
     (기록 화면으로 가는 길은 아래 '생체리듬 자세히' 카드 하나로만 열어 둔다;
     '공식과 대입값 보기'는 마이페이지에서 없앴다 — 계산 근거는 홈 화면의
     원형 버튼(h-evi)에서 같은 시트로 그대로 열 수 있다). */
  function profileHeader(m) {
    var skin = 'ⅠⅡⅢⅣⅤⅥ'[m.profile.skinType - 1];
    return '<div class="my-head">' +
      '<div class="my-body">' +
        '<div class="my-t">마이페이지</div>' +
        '<div class="my-d">피부 타입 ' + skin + ' · 기상 ' + m.profile.wakeTime +
          ' · ' + (m.location ? UI.esc(m.location.name) : '위치 미설정') + '</div>' +
      '</div>' +
      '<div class="my-acts">' +
        '<button class="iconbtn" id="s-go-home" aria-label="홈으로">' + UI.ICON.home + '</button>' +
        '<div class="my-ava">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="#2B63F6" stroke-width="2" stroke-linecap="round">' +
          '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c0-4 3.4-6 7.5-6s7.5 2 7.5 6"/></svg>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* 지역 선택 — 시도를 먼저 고르고 그 안의 지역을 고른다.
     지역마다 기상청 지점코드(areaNo)가 달라 자외선지수도 그 지역 값으로 바뀐다. */
  function regionPicker(m) {
    var cur = m.location ? KmaGeo.findByName(m.location.name) : null;
    var curSido = openSido || (cur ? cur.sido : (KmaGeo.GROUPS[0] || {}).sido);
    var group = KmaGeo.GROUPS.filter(function (g) { return g.sido === curSido; })[0] || KmaGeo.GROUPS[0];

    return '<div style="margin-top:16px">' +
      '<div style="font-size:12px;font-weight:800;color:#66738A;margin-bottom:8px">시 · 도</div>' +
      '<div class="ob-city" id="s-sido" style="margin-top:0">' +
        KmaGeo.GROUPS.map(function (g) {
          return '<button data-sido="' + g.sido + '"' + (g.sido === curSido ? ' class="on"' : '') +
                 '>' + g.sido + '</button>';
        }).join('') +
      '</div>' +
      '<div style="font-size:12px;font-weight:800;color:#66738A;margin:18px 0 8px">' +
        group.sido + ' 지역 <span style="font-weight:600;color:#AEB8C7">· ' + group.areas.length + '곳</span></div>' +
      '<div class="ob-city" id="s-city" style="margin-top:0">' +
        group.areas.map(function (a) {
          var on = m.location && m.location.name === a.name;
          return '<button data-city="' + a.name + '"' + (on ? ' class="on"' : '') + '>' + a.name + '</button>';
        }).join('') +
      '</div>' +
    '</div>';
  }

  function row(id, title, desc, right) {
    return '<div class="row" id="' + id + '">' +
      '<div class="row-l"><div class="row-t">' + title + '</div>' +
      '<div class="row-d">' + desc + '</div></div>' + (right || '') + '</div>';
  }
  function toggleRow(id, title, desc, on) {
    return '<button class="row" id="' + id + '">' +
      '<div class="row-l"><div class="row-t">' + title + '</div>' +
      '<div class="row-d">' + desc + '</div></div>' +
      '<div class="sw' + (on ? ' on' : '') + '"></div></button>';
  }

  function bind() {
    var q = function (id) { return document.getElementById(id); };

    if (q('s-go-home')) q('s-go-home').onclick = function () { App.go('home'); };
    if (q('s-more-weekly')) q('s-more-weekly').onclick = function () { App.go('weekly'); };
    if (q('s-body-info')) q('s-body-info').onclick = function () { bodyInfoSheet(); };

    q('s-wake-in').onchange = function () {
      SettingsService.set({ wakeTime: this.value }); after();
    };
    q('s-circ').onclick = function () {
      SettingsService.set({ useCircadian: !Repo.getProfile().useCircadian }); after();
    };
    q('s-supp').onclick = function () {
      SettingsService.set({ supplement: !Repo.getProfile().supplement }); after();
    };
    q('s-notify').onclick = function () {
      var cur = Repo.getProfile().notify && Notify.granted();
      SettingsService.toggleNotify(!cur).then(function (ok) {
        if (!cur && !ok) UI.toast('브라우저에서 알림이 차단돼 있어요');
        else if (ok) UI.toast('창이 열리기 15분 전에 알려드릴게요');
        after();
      });
    };

    q('s-geo').onclick = function () {
      UI.toast('위치를 확인하는 중…');
      SettingsService.useGeolocation()
        .then(function () { App.refresh(true); UI.toast('위치를 갱신했어요'); })
        .catch(function () { UI.toast('권한이 없어요. 아래에서 도시를 골라 주세요'); });
    };
    [].forEach.call(el.querySelectorAll('#s-sido button'), function (b) {
      b.onclick = function () { openSido = b.dataset.sido; render(); };
    });
    [].forEach.call(el.querySelectorAll('#s-city button'), function (b) {
      b.onclick = function () {
        var loc = SettingsService.useCity(b.dataset.city);
        if (loc) openSido = (KmaGeo.findByName(loc.name) || {}).sido || openSido;
        App.refresh(true);          // 지역이 바뀌면 그 지역 자외선지수로 즉시 다시 받는다
        UI.toast(b.dataset.city + '(으)로 바꿨어요');
        render();
      };
    });

    if (q('s-evidence')) q('s-evidence').onclick = function () { evidenceSheet(); };
  }

  /* 계산 근거 — 지금 대입 중인 값 그대로 (홈의 원형 버튼에서도 열린다) */
  function evidenceSheet() {
    var rx = App.prescription();
    if (!rx) return UI.toast('예보를 불러온 뒤에 볼 수 있어요');
    var p = rx.activeWindow ? rx.nowPoint : (rx.targetWindow ? rx.targetWindow.best : rx.nowPoint);
    var dd = function (k, v) { return '<dd><span>' + k + '</span><b>' + v + '</b></dd>'; };

    UI.sheet('계산 근거', '모든 계산은 이 기기에서 이뤄집니다. 서버로 보내는 값은 없습니다.',
      '<div class="card"><div class="card-t">공식</div>' +
        '<div class="card-b" style="font-family:ui-monospace,Menlo,monospace;font-size:12.5px;line-height:1.9">' +
          '비타민D 필요시간 = (k × MED) ÷ (1.5 × UVI × f_BSA)<br>' +
          '화상 한계시간 = MED ÷ (1.5 × UVI)<br>' +
          '열 안전 상한 = 체감온도 구간표<br>' +
          '<b style="color:#2B63F6">최종 = min(세 값)</b>' +
        '</div></div>' +
      '<div class="card"><div class="card-t">지금 대입한 값</div><dl class="official" style="margin-top:4px">' +
        dd('k (비타민D/홍반 비율)', Engine.K) +
        dd('MED (피부 타입 ' + 'ⅠⅡⅢⅣⅤⅥ'[rx.profile.skinType - 1] + ')', p.med + ' J/m²') +
        dd('f_BSA (' + Engine.CLOTHING[rx.profile.clothing].label + ')', p.fBSA) +
        dd('UVI', p.uvi.toFixed(2)) +
        dd('환산계수', Engine.UVI_COEFF) +
        dd('체감온도', p.heatIndexC.toFixed(1) + '℃') +
        dd('태양고도', p.altitude.toFixed(1) + '°') +
      '</dl></div>' +
      '<div class="card"><div class="card-t">창이 열리는 조건</div><div class="card-b">' +
        '① 태양고도 ≥ 45° — 그림자가 키보다 짧아야 UVB가 도달합니다<br>' +
        '② 열 안전 상한 &gt; 0<br>' +
        '③ 계산된 노출시간 ≤ 60분' +
      '</div></div>' +
      '<div class="card warn"><div class="card-t">아직 확정 안 된 값</div><div class="card-b">' +
        'k는 문헌마다 0.3~0.5로 갈립니다. 이 버전은 중앙값 <b>0.4</b>로 고정했습니다. ' +
        '노출시간→IU 환산도 편차가 커서 IU 대신 <b>충전률 %</b>로만 표시합니다.' +
      '</div></div>');
  }

  /* 설정이 바뀌면 처방을 다시 계산해야 한다 (아키텍처: 설정 변경 시 재계산) */
  function after() {
    App.invalidate();
    render();
  }

  /* 홈의 원형 버튼에서도 열 수 있게 밖으로 내보낸다 */
  return { render: render, evidenceSheet: evidenceSheet };
})();
