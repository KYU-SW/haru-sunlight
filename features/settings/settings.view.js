/* =========================================================
   기능: 설정(마이페이지) — 뷰(화면)

   목록형으로 간략하게 연다.
     내 햇빛 기록(누르면 노출 이력 · 아래 줄은 이번 주 분석) → 내 정보 → 알림 · 리듬 → 위치
   자주 안 바꾸는 값(피부 타입·옷차림·SPF, 지역)은 줄 하나로 두고 누르면 시트로 연다.
   계산식·계산 근거는 화면에 드러내지 않는다.
   ========================================================= */
var SettingsView = (function () {

  var el;

  var SPF = [
    { v: 1,  label: '안 바름' },
    { v: 15, label: 'SPF 15' },
    { v: 30, label: 'SPF 30' },
    { v: 50, label: 'SPF 50+' }
  ];
  function spfLabel(v) {
    var o = SPF.filter(function (s) { return s.v === (v || 1); })[0];
    return o ? o.label : 'SPF ' + v;
  }

  function render() {
    var m = SettingsService.model(App.prescription());
    el = document.getElementById('screen-settings');
    var p = m.profile;
    var skin = 'ⅠⅡⅢⅣⅤⅥ'[p.skinType - 1];
    var cloth = m.clothingOptions.filter(function (c) { return c.key === p.clothing; })[0];

    el.innerHTML =
      '<div class="an-head"><div class="an-t">마이페이지</div></div>' +
      '<div class="ha-wrap">' +
        recordCard() +

        group('내 정보',
          navRow('s-body-skin', '피부 타입', '타입 ' + skin) +
          navRow('s-body-cloth', '기본 옷차림', cloth ? cloth.label : '') +
          navRow('s-body-spf', '선크림', spfLabel(p.spf))) +

        group('알림 · 리듬',
          '<div class="st-row"><span class="st-l">기상 시간</span>' +
            '<input type="time" class="st-time" id="s-wake-in" value="' + p.wakeTime + '"></div>' +
          toggleRow('s-notify', '햇빛 알림', p.notify && m.notifyGranted)) +

        group('위치',
          navRow('s-region', '지역', m.location ? UI.esc(m.location.name) : '설정 안 됨')) +
      '</div>';

    bind();
  }

  /* ---------- 내 햇빛 기록 — 위: 노출 이력으로 · 아래 줄: 이번 주 분석으로 ---------- */
  function recordCard() {
    var w = null;
    try {
      var cache = Repo.getWeatherCache();
      if (cache) w = WeeklyService.build(cache, Repo.getLocation(), Repo.getProfile());
    } catch (e) { w = null; }

    return '<section class="ha-t st-rec">' +
      '<button class="st-an" id="s-history">' +
        '<div class="ha-lab">내 햇빛 기록</div>' +
        (w
          ? '<div class="st-an-v">이번 주 <b>' + w.weeklyPercent + '%</b> 채웠어요</div>'
          : '<div class="st-an-v">노출 이력 보기</div>') +
        UI.ICON.right +
      '</button>' +
      '<button class="st-rec-go" id="s-analysis"><span class="st-l">이번 주 분석</span>' +
        (w ? '<span class="st-mini">' + w.bars.map(function (b) {
          return '<i' + (b.isToday ? ' class="on"' : '') + ' style="height:' +
                 (b.percent ? Math.max(18, b.height) : 12) + '%"></i>';
        }).join('') + '</span>' : '') +
        UI.ICON.right + '</button>' +
    '</section>';
  }

  function group(title, rows) {
    return '<div class="st-g">' + title + '</div>' +
      '<section class="ha-t st-list">' + rows + '</section>';
  }
  function navRow(id, label, value) {
    return '<button class="st-row" id="' + id + '"><span class="st-l">' + label + '</span>' +
      '<span class="st-v">' + value + UI.ICON.right + '</span></button>';
  }
  function toggleRow(id, label, on) {
    return '<button class="st-row" id="' + id + '"><span class="st-l">' + label + '</span>' +
      '<span class="sw' + (on ? ' on' : '') + '"></span></button>';
  }

  /* ---------- 내 정보 시트 : 피부 타입 · 기본 옷차림 · 선크림 ----------
     #sheet-body는 #screen-settings 밖에 있어 이 시트 전용 바인딩을 따로 건다. */
  function bodyInfoSheet() {
    var m = SettingsService.model(App.prescription());
    var p = m.profile;

    var html =
      '<div class="st-sh">' +
        '<div class="st-sh-t">피부 타입</div>' +
        '<div class="seg" id="s-skin">' +
          m.skinOptions.map(function (s) {
            return '<button data-t="' + s.t + '"' + (p.skinType === s.t ? ' class="on"' : '') + '>' +
                   s.label + '</button>';
          }).join('') +
        '</div>' +
        '<div class="st-sh-d">' +
          m.skinOptions.filter(function (s) { return s.t === p.skinType; })[0].desc + '</div>' +
      '</div>' +

      '<div class="st-sh">' +
        '<div class="st-sh-t">기본 옷차림</div>' +
        '<div class="seg" id="s-cloth">' +
          m.clothingOptions.map(function (c) {
            return '<button data-c="' + c.key + '"' + (p.clothing === c.key ? ' class="on"' : '') + '>' +
              c.label + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +

      '<div class="st-sh">' +
        '<div class="st-sh-t">선크림</div>' +
        '<div class="seg" id="s-spf">' +
          SPF.map(function (s) {
            return '<button data-spf="' + s.v + '"' + ((p.spf || 1) === s.v ? ' class="on"' : '') + '>' +
              s.label + '</button>';
          }).join('') +
        '</div>' +
      '</div>';

    UI.sheet('내 정보', null, html);
    bindBodyInfoSheet();
  }

  function bindBodyInfoSheet() {
    var sheet = document.getElementById('sheet-body');
    if (!sheet) return;
    function hook(sel, patch) {
      [].forEach.call(sheet.querySelectorAll(sel), function (b) {
        b.onclick = function () {
          SettingsService.set(patch(b));
          App.invalidate();
          render();
          bodyInfoSheet();
        };
      });
    }
    hook('#s-skin button', function (b) { return { skinType: +b.dataset.t }; });
    hook('#s-cloth button', function (b) { return { clothing: b.dataset.c }; });
    hook('#s-spf button', function (b) { return { spf: +b.dataset.spf }; });
  }

  /* ---------- 지역 시트 : 현재 위치 또는 검색 ----------
     목록은 기상청 자료가 있는 지역만(KmaGeo). '○○ 전체'는 시·도 이름 하나로 보여 준다. */
  function areaLabel(c) {
    if (/\s전체$/.test(c.name)) return c.sido;
    return /(시|군)$/.test(c.name) ? c.sido + ' ' + c.name : c.name;
  }

  function regionSheet() {
    /* 검색창을 맨 위에 두고 시트를 크게 연다 — 자판이 올라와도 결과가 가리지 않게 */
    UI.sheet('지역', null,
      '<div class="st-search">' + UI.ICON.search +
        '<input id="s-q" type="search" placeholder="시·군 이름 검색 (예: 수원, 여수)" autocomplete="off"></div>' +
      '<button class="st-geo" id="s-geo">' + UI.ICON.pin + '현재 위치로 찾기</button>' +
      '<div class="st-res" id="s-res"></div>');
    document.getElementById('sheet-body').classList.add('tall');
    bindRegionSheet();
    var qi = document.getElementById('s-q');
    if (qi) setTimeout(function () { qi.focus(); }, 320);
  }

  function searchResults(q) {
    var key = q.replace(/\s/g, '');
    if (!key) return '';
    var cur = Repo.getLocation();
    var hits = KmaGeo.CITIES.filter(function (c) {
      return areaLabel(c).replace(/\s/g, '').indexOf(key) >= 0;
    }).slice(0, 20);
    if (!hits.length) return '<div class="st-res-none">찾는 지역이 없어요</div>';
    return hits.map(function (c) {
      var on = cur && cur.name === c.name;
      return '<button class="st-res-i' + (on ? ' on' : '') + '" data-city="' + c.name + '">' +
        areaLabel(c) + (on ? '<b>현재</b>' : '') + '</button>';
    }).join('');
  }

  function bindRegionSheet() {
    var sheet = document.getElementById('sheet-body');
    if (!sheet) return;
    var input = sheet.querySelector('#s-q');
    var res = sheet.querySelector('#s-res');

    function pick(name) {
      var loc = SettingsService.useCity(name);
      if (!loc) return;
      App.refresh(true);          // 지역이 바뀌면 그 지역 자외선지수로 즉시 다시 받는다
      UI.toast(areaLabel(KmaGeo.findByName(name)) + '(으)로 바꿨어요');
      UI.closeSheet();
      if (el && document.getElementById('screen-settings').classList.contains('active')) render();
    }

    input.oninput = function () {
      res.innerHTML = searchResults(input.value);
      [].forEach.call(res.querySelectorAll('[data-city]'), function (b) {
        b.onclick = function () { pick(b.dataset.city); };
      });
    };

    sheet.querySelector('#s-geo').onclick = function () {
      UI.toast('위치를 확인하는 중…');
      SettingsService.useGeolocation()
        .then(function () {
          App.refresh(true); UI.toast('현재 위치로 바꿨어요'); UI.closeSheet();
          if (document.getElementById('screen-settings').classList.contains('active')) render();
        })
        .catch(function () { UI.toast('위치 권한이 없어요. 지역을 검색해 주세요'); });
    };
  }

  function bind() {
    var q = function (id) { return document.getElementById(id); };

    q('s-history').onclick = function () { WeeklyView.open('log'); };
    q('s-analysis').onclick = function () { WeeklyView.open('analysis'); };
    q('s-body-skin').onclick = q('s-body-cloth').onclick = q('s-body-spf').onclick =
      function () { bodyInfoSheet(); };
    q('s-region').onclick = function () { regionSheet(); };

    q('s-wake-in').onchange = function () {
      SettingsService.set({ wakeTime: this.value }); after();
    };
    q('s-notify').onclick = function () {
      if (!Notify.supported()) return UI.toast('이 브라우저는 알림을 지원하지 않아요');
      var cur = Repo.getProfile().notify && Notify.granted();
      SettingsService.toggleNotify(!cur).then(function (ok) {
        if (!cur && !ok) UI.toast('브라우저에서 알림이 차단돼 있어요');
        else if (ok) UI.toast('햇빛 시간 ' + Notify.LEAD_MIN + '분 전에 알려드릴게요');
        after();
      });
    };
  }

  /* 설정이 바뀌면 처방을 다시 계산해야 한다 (아키텍처: 설정 변경 시 재계산) */
  function after() {
    App.invalidate();
    render();
  }

  /* 홈의 '서울 ⌄'에서도 지역 시트를 연다 */
  return { render: render, regionSheet: regionSheet };
})();
