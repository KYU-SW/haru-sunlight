/* =========================================================
   기능: 온보딩 — 뷰(화면)
   ========================================================= */
var OnboardingView = (function () {

  var S = OnboardingService;
  var root, locating = false;

  function show() {
    root = document.getElementById('onboarding');
    root.classList.add('show');
    S.reset();
    render();
  }
  function hide() { root.classList.remove('show'); }

  function render() {
    var step = S.steps()[S.state.step];
    var body =
        step === 'skin'     ? skinStep()
      : step === 'wake'     ? wakeStep()
      :                       locStep();

    root.innerHTML =
      '<div class="ob-in">' +
        '<div class="ob-prog"><i style="width:' +
          ((S.state.step + 1) / S.total() * 100) + '%"></i></div>' +
        '<div class="ob-body">' + body + '</div>' +
        '<div class="ob-foot">' +
          '<button class="btn btn-primary" id="ob-next"' + (S.canNext() ? '' : ' disabled') + '>' +
            (S.state.step === S.total() - 1 ? '시작하기' : '다음') +
          '</button>' +
          (S.state.step > 0 ? '<button class="ob-skip" id="ob-back">이전</button>' : '') +
        '</div>' +
      '</div>';

    bind(step);
  }

  function skinStep() {
    return '' +
      '<div class="ob-step">1 / ' + S.total() + '</div>' +
      '<div class="ob-q">여름에 팔뚝을<br>30분 쬐면 어떻게 되나요?</div>' +
      '<div class="ob-help">피부 타입에 따라 필요한 시간이 4배까지 차이납니다.<br>딱 이 질문 하나로 정해집니다.</div>' +
      '<div class="ob-opts">' +
        S.SKIN_OPTIONS.map(function (o, i) {
          return '<button class="ob-opt' + (S.state.skinIndex === i ? ' on' : '') + '" data-i="' + i + '">' +
                   '<em>' + o.emoji + '</em>' +
                   '<div><div class="ob-opt-t">' + o.title + '</div>' +
                   '<div class="ob-opt-d">' + o.desc + '</div></div>' +
                 '</button>';
        }).join('') +
      '</div>';
  }

  function wakeStep() {
    return '' +
      '<div class="ob-step">2 / ' + S.total() + '</div>' +
      '<div class="ob-q">보통 몇 시에 일어나세요?</div>' +
      '<div class="ob-help">햇빛은 비타민D만 만드는 게 아니라 생체리듬도 맞춥니다.<br>기상 시각을 알면 언제 쬐야 밤에 잘 자는지 알려드려요.</div>' +
      '<input class="ob-time" id="ob-wake" type="time" value="' + S.state.wakeTime + '">' +
      '<div class="card info" style="margin-top:20px">' +
        '<div class="card-t">💡 유리창은 절반만 통과시켜요</div>' +
        '<div class="card-b">비타민D를 만드는 <b>UVB(290~315nm)</b>는 유리에 막히지만, ' +
        '생체리듬을 맞추는 <b>청색광(~460nm)</b>은 통과합니다. ' +
        '창가에 앉으면 비타민D는 0이어도 리듬은 리셋됩니다.</div>' +
      '</div>';
  }

  function locStep() {
    var l = S.state.loc;
    return '' +
      '<div class="ob-step">3 / ' + S.total() + '</div>' +
      '<div class="ob-q">어디 계세요?</div>' +
      '<div class="ob-help">기상청 API 기준 국내 지역만 지원해요. 위치는 이 기기에만 저장돼요.</div>' +
      '<button class="btn btn-primary" id="ob-geo" style="margin-top:26px">' +
        (locating ? '확인 중…' : '📍 현재 위치 사용') +
      '</button>' +
      '<div style="text-align:center;font-size:13px;color:#8B95A1;font-weight:600;margin:18px 0 4px">' +
        '또는 도시 선택</div>' +
      obRegionPicker(l) +
      (l ? '<div class="card" style="margin-top:20px"><div class="card-b">선택됨 · <b>' + l.name +
           '</b> (' + l.lat + ', ' + l.lon + ')' + (l.precise ? ' · 현재 위치' : '') + '</div></div>' : '');
  }

  /* 시도 → 지역 2단계 선택 (설정 화면과 같은 방식) */
  var obSido = null;
  function obRegionPicker(l) {
    var cur = l ? KmaGeo.findByName(l.name) : null;
    var sido = obSido || (cur ? cur.sido : KmaGeo.GROUPS[0].sido);
    var g = KmaGeo.GROUPS.filter(function (x) { return x.sido === sido; })[0] || KmaGeo.GROUPS[0];
    return '<div style="font-size:12.5px;font-weight:700;color:#6B7684;margin:22px 0 7px">시 · 도</div>' +
      '<div class="ob-city" id="ob-sido">' +
        KmaGeo.GROUPS.map(function (x) {
          return '<button data-sido="' + x.sido + '"' + (x.sido === sido ? ' class="on"' : '') + '>' + x.sido + '</button>';
        }).join('') +
      '</div>' +
      '<div style="font-size:12.5px;font-weight:700;color:#6B7684;margin:16px 0 7px">' + g.sido + ' 지역</div>' +
      '<div class="ob-city" id="ob-city">' +
        g.areas.map(function (a) {
          var on = l && l.name === a.name;
          return '<button data-city="' + a.name + '"' + (on ? ' class="on"' : '') + '>' + a.name + '</button>';
        }).join('') +
      '</div>';
  }

  function bind(step) {
    var next = document.getElementById('ob-next');
    if (next) next.onclick = function () {
      if (!S.canNext()) return;
      if (S.state.step === S.total() - 1) {
        S.complete();
        hide();
        App.boot();
      } else { S.next(); render(); }
    };
    var back = document.getElementById('ob-back');
    if (back) back.onclick = function () { S.back(); render(); };

    if (step === 'skin') {
      [].forEach.call(root.querySelectorAll('.ob-opt'), function (b) {
        b.onclick = function () { S.pickSkin(+b.dataset.i); render(); };
      });
    }
    if (step === 'wake') {
      var w = document.getElementById('ob-wake');
      w.onchange = function () { S.setWake(w.value); render(); };
    }
    if (step === 'location') {
      var geo = document.getElementById('ob-geo');
      if (geo) geo.onclick = function () {
        locating = true; render();
        S.useGeolocation()
          .then(function () { locating = false; render(); })
          .catch(function (e) {
            locating = false; render();
            UI.toast(e && e.outOfKorea
              ? '기상청 API는 국내 지역만 지원해요. 도시를 골라 주세요'
              : '위치 권한이 없어요. 도시를 골라 주세요');
          });
      };
      [].forEach.call(root.querySelectorAll('[data-sido]'), function (b) {
        b.onclick = function () { obSido = b.dataset.sido; render(); };
      });
      [].forEach.call(root.querySelectorAll('[data-city]'), function (b) {
        b.onclick = function () {
          var loc = S.useCity(b.dataset.city);
          if (loc) obSido = (KmaGeo.findByName(loc.name) || {}).sido || obSido;
          render();
        };
      });
    }
  }

  return { show: show, hide: hide };
})();
