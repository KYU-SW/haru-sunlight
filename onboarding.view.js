/* =========================================================
   기능: 온보딩 — 뷰(화면)
   두 단계: 피부 타입 → 지역(현재 위치 또는 검색)

   단계가 바뀔 때만 화면이 옆에서 들어온다. 같은 단계 안에서 선택지를 누를 때는
   애니메이션을 다시 틀지 않는다(누를 때마다 화면이 튀어 보이던 문제).
   ========================================================= */
var OnboardingView = (function () {

  var S = OnboardingService;
  var root, locating = false;
  var shownStep = -1;          // 마지막으로 그린 단계 — 바뀔 때만 들어오는 애니메이션
  var lastPct = 0;             // 진행 막대가 이전 값에서 이어서 늘어나게
  var query = '';              // 지역 검색어

  function show() {
    root = document.getElementById('onboarding');
    root.classList.add('show');
    S.reset();
    shownStep = -1; lastPct = 0; query = '';
    render();
  }
  function hide() { root.classList.remove('show'); }

  function render() {
    var step = S.steps()[S.state.step];
    var entering = S.state.step !== shownStep;
    shownStep = S.state.step;
    var pct = (S.state.step + 1) / S.total() * 100;

    root.innerHTML =
      '<div class="ob-in">' +
        '<div class="ob-prog"><i id="ob-bar" style="width:' + lastPct + '%"></i></div>' +
        '<div class="ob-body' + (entering ? ' enter' : '') + '">' +
          (step === 'skin' ? skinStep() : locStep()) +
        '</div>' +
        '<div class="ob-foot">' +
          '<button class="btn btn-primary" id="ob-next"' + (S.canNext() ? '' : ' disabled') + '>' +
            (S.state.step === S.total() - 1 ? '시작하기' : '다음') +
          '</button>' +
          (S.state.step > 0 ? '<button class="ob-skip" id="ob-back">이전</button>' : '') +
        '</div>' +
      '</div>';

    /* 이전 너비로 그린 뒤 다음 프레임에 새 너비로 — transition이 실제로 보이게 */
    var bar = document.getElementById('ob-bar');
    requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.width = pct + '%'; }); });
    lastPct = pct;

    bind(step);
  }

  function skinStep() {
    return '' +
      '<div class="ob-step">1 / ' + S.total() + '</div>' +
      '<div class="ob-q">여름에 팔뚝을<br>30분 쬐면 어떻게 되나요?</div>' +
      '<div class="ob-help">피부 타입에 따라 필요한 시간이 5배까지 차이 나요.</div>' +
      '<div class="ob-opts">' +
        S.SKIN_OPTIONS.map(function (o, i) {
          return '<button class="ob-opt' + (S.state.skinIndex === i ? ' on' : '') + '" data-i="' + i + '">' +
                   '<em class="ob-opt-n">' + o.label + '</em>' +
                   '<div><div class="ob-opt-t">' + o.title + '</div></div>' +
                 '</button>';
        }).join('') +
      '</div>' +
      '<button class="ob-unsure" id="ob-unsure">잘 모르겠어요 · 타입 Ⅲ으로 시작</button>' +
      '<div class="ob-tip"><b>유리창 너머 햇빛은 소용없어요.</b><br>' +
        '비타민D를 만드는 자외선(UVB)은 유리를 통과하지 못해요. 꼭 밖에서 쬐세요.</div>';
  }

  /* ---------- 지역 : 현재 위치 또는 검색 (마이페이지 지역 시트와 같은 방식) ---------- */
  function areaLabel(c) {
    if (/\s전체$/.test(c.name)) return c.sido;
    return /(시|군)$/.test(c.name) ? c.sido + ' ' + c.name : c.name;
  }

  function results() {
    var key = query.replace(/\s/g, '');
    if (!key) return '';
    var l = S.state.loc;
    var hits = KmaGeo.CITIES.filter(function (c) {
      return areaLabel(c).replace(/\s/g, '').indexOf(key) >= 0;
    }).slice(0, 20);
    if (!hits.length) return '<div class="st-res-none">찾는 지역이 없어요</div>';
    return hits.map(function (c) {
      var on = l && l.name === c.name;
      return '<button class="st-res-i' + (on ? ' on' : '') + '" data-city="' + c.name + '">' +
        areaLabel(c) + (on ? '<b>선택됨</b>' : '') + '</button>';
    }).join('');
  }

  function locStep() {
    var l = S.state.loc;
    var cur = l ? KmaGeo.findByName(l.name) : null;
    return '' +
      '<div class="ob-step">2 / ' + S.total() + '</div>' +
      '<div class="ob-q">어디 계세요?</div>' +
      '<div class="ob-help">그 지역 기상청 예보로 계산해요. 위치는 이 기기에만 저장돼요.</div>' +
      (l ? '<div class="ob-picked">' + (cur ? areaLabel(cur) : UI.esc(l.name)) +
             (l.precise ? ' · 현재 위치' : '') + '</div>' : '') +
      '<button class="st-geo" id="ob-geo" style="margin-top:18px">' + UI.ICON.pin +
        (locating ? '확인 중…' : '현재 위치로 찾기') + '</button>' +
      '<div class="st-search">' + UI.ICON.search +
        '<input id="ob-q" type="search" placeholder="시·군 이름 검색 (예: 수원, 여수)" autocomplete="off" value="' +
        UI.esc(query) + '"></div>' +
      '<div class="st-res" id="ob-res">' + results() + '</div>';
  }

  function bindResults() {
    [].forEach.call(root.querySelectorAll('#ob-res [data-city]'), function (b) {
      b.onclick = function () {
        S.useCity(b.dataset.city);
        query = '';
        render();
      };
    });
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
      document.getElementById('ob-unsure').onclick = function () {
        S.pickSkin(S.UNSURE_INDEX); S.next(); render();
      };
    }
    if (step === 'location') {
      var input = document.getElementById('ob-q');
      input.oninput = function () {
        query = input.value;
        document.getElementById('ob-res').innerHTML = results();   // 입력칸은 그대로 두고 결과만 바꾼다
        bindResults();
      };
      bindResults();

      var geo = document.getElementById('ob-geo');
      geo.onclick = function () {
        locating = true; render();
        S.useGeolocation()
          .then(function () { locating = false; render(); })
          .catch(function (e) {
            locating = false; render();
            UI.toast(e && e.outOfKorea
              ? '기상청 API는 국내 지역만 지원해요. 지역을 검색해 주세요'
              : '위치 권한이 없어요. 지역을 검색해 주세요');
          });
      };
    }
  }

  return { show: show, hide: hide };
})();
