/* =========================================================
   기능: 온보딩 — 뷰(화면)
   세 단계: 피부 타입 → 나이·키·몸무게 → 지역(현재 위치 또는 검색)

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
          (step === 'skin' ? skinStep() : step === 'body' ? bodyStep() : locStep()) +
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

  /* ---------- 나이 · 키 · 몸무게 ---------- */
  function bodyStep() {
    return '' +
      '<div class="ob-step">2 / ' + S.total() + '</div>' +
      '<div class="ob-q">나이와 키, 몸무게를<br>알려 주세요</div>' +
      '<div class="ob-help">같은 햇빛이라도 나이와 몸집에 따라 필요한 시간이 달라요. 마이페이지에서 언제든 고칠 수 있어요.</div>' +
      '<div class="ob-lab">나이</div>' + ageWheel('ob-age', S.state.age) +
      '<div class="ob-lab">키 · 몸무게</div>' + numFields(S.BODY, S.state.body, 'ob-') +
      '<p class="ob-num-err" id="ob-body-err"></p>';
  }

  /* 나이 — 아이폰처럼 위아래로 돌려서 고르는 휠. 마이페이지 시트도 같은 모양을 쓴다.
     줄 높이(WHEEL_ROW)만큼 스크롤이 딱딱 멈추고, 가운데 줄이 고른 값이다. */
  var WHEEL_ROW = 40;
  function ageWheel(id, cur) {
    var items = '';
    for (var v = S.AGE.min; v <= S.AGE.max; v++) {
      items += '<div class="wheel-i" data-v="' + v + '">' + v + '세</div>';
    }
    return '<div class="wheel"><div class="wheel-band"></div>' +
      '<div class="wheel-list" id="' + id + '" data-cur="' + (cur || S.AGE.initial) + '">' +
        '<div class="wheel-pad"></div>' + items + '<div class="wheel-pad"></div>' +
      '</div></div>';
  }
  function bindWheel(list, onChange) {
    var items = [].slice.call(list.querySelectorAll('.wheel-i'));
    var min = S.AGE.min, t = null;
    function index() { return Math.max(0, Math.min(items.length - 1, Math.round(list.scrollTop / WHEEL_ROW))); }
    function mark() {
      var i = index();
      items.forEach(function (el, k) { el.classList.toggle('on', k === i); });
      return i;
    }
    list.scrollTop = (+list.dataset.cur - min) * WHEEL_ROW;
    mark();
    list.onscroll = function () {
      var i = mark();
      clearTimeout(t);
      t = setTimeout(function () { onChange(min + i); }, 80);
    };
    /* 컴퓨터에서는 마우스로 끌어도 돌아가게 — 손가락은 브라우저가 알아서 스크롤한다 */
    var drag = null;
    list.onpointerdown = function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { y: e.clientY, top: list.scrollTop, moved: false };
      list.style.scrollSnapType = 'none';           // 끄는 동안은 자석을 끈다
      list.setPointerCapture(e.pointerId);
    };
    list.onpointermove = function (e) {
      if (!drag) return;
      var dy = e.clientY - drag.y;
      if (Math.abs(dy) > 3) drag.moved = true;
      list.scrollTop = drag.top - dy;
    };
    list.onpointerup = list.onpointercancel = function (e) {
      if (!drag) return;
      var moved = drag.moved;
      drag = null;
      var target = index();                          // 끌었으면 가장 가까운 줄
      if (!moved && e.clientY != null) {             // 그냥 눌렀으면 누른 줄로
        var pad = (list.clientHeight - WHEEL_ROW) / 2;
        var y = e.clientY - list.getBoundingClientRect().top + list.scrollTop - pad;
        target = Math.max(0, Math.min(items.length - 1, Math.floor(y / WHEEL_ROW)));
      }
      /* 손을 뗀 직후 브라우저가 지금 자리에 다시 자석을 붙이므로, 다 굴러간 뒤에 자석을 켠다 */
      requestAnimationFrame(function () {
        list.scrollTo({ top: target * WHEEL_ROW, behavior: 'smooth' });
        setTimeout(function () { list.style.scrollSnapType = ''; }, 400);
      });
    };
    /* 손가락으로 줄을 누를 때 (마우스는 위에서 처리) */
    items.forEach(function (el, k) {
      el.onclick = function () { list.scrollTo({ top: k * WHEEL_ROW, behavior: 'smooth' }); };
    });
  }

  /* 숫자 칸 묶음 — 마이페이지 '내 정보' 시트도 같은 모양을 쓴다 */
  function numFields(spec, val, prefix) {
    return '<div class="ob-nums">' + Object.keys(spec).map(function (k) {
      var b = spec[k];
      return '<label class="ob-num"><span>' + b.label + '</span>' +
        '<input id="' + prefix + k + '" type="number" inputmode="numeric" min="' + b.min + '" max="' + b.max + '" value="' + UI.esc(val[k]) + '">' +
        '<em>' + b.unit + '</em></label>';
    }).join('') + '</div>';
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
      '<div class="ob-step">3 / ' + S.total() + '</div>' +
      '<div class="ob-q">어디 계세요?</div>' +
      '<div class="ob-help">그 지역 기상청 예보로 계산해요. 정확한 위치는 이 기기에만 남고, 보내더라도 시·도 이름뿐이에요.</div>' +
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
        if (window.Sync) Sync.run();   // 피부 타입·시도를 사용자 정보에 반영 (동의했을 때만)
        showCalc();
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
    if (step === 'body') {
      bindWheel(document.getElementById('ob-age'), function (v) {
        S.setAge(v);
        next.disabled = !S.canNext();
      });
      /* 입력할 때마다 화면을 다시 그리면 자판이 내려가므로 버튼 상태와 안내만 바꾼다 */
      Object.keys(S.BODY).forEach(function (k) {
        var inp = document.getElementById('ob-' + k);
        inp.oninput = function () {
          S.setBody(k, inp.value);
          next.disabled = !S.canNext();
          document.getElementById('ob-body-err').textContent = '';
        };
        inp.onblur = function () {
          if (inp.value === '') return;
          var err = S.bodyError(S.state.body);
          var b = S.BODY[k], n = parseFloat(inp.value);
          document.getElementById('ob-body-err').textContent =
            (isNaN(n) || n < b.min || n > b.max) ? err : '';
        };
      });
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

  /* ---------- 마지막 — '맞춤 처방을 계산하고 있어요' ----------
     입력한 값이 실제로 쓰였다는 걸 보여 준다. 가짜 기다림이 아니라 실제로 오늘 날씨를 받는 동안
     원이 차오르고, 계산이 빨리 끝나도 한 단계씩 천천히 눈에 들어오게 단계마다 STEP_MS만큼 보여 준다. */
  var STEP_MS = 1000;
  var CALC_R = 54, CALC_C = 2 * Math.PI * CALC_R;
  var CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function showCalc() {
    var loc = Repo.getLocation();
    var steps = ['피부 타입 반영', '나이 · 체형 반영', (loc ? loc.name + ' ' : '') + '오늘 날씨 불러오기', '오늘 햇빛 시간 계산'];
    root.innerHTML =
      '<div class="ob-in"><div class="cc">' +
        '<div class="cc-ring">' +
          '<svg viewBox="0 0 128 128"><circle class="trk" cx="64" cy="64" r="' + CALC_R + '"/>' +
          '<circle class="arc" id="cc-arc" cx="64" cy="64" r="' + CALC_R + '" stroke-dasharray="' + CALC_C + '" stroke-dashoffset="' + CALC_C + '"/></svg>' +
          '<div class="cc-num" id="cc-num">0%</div>' +
        '</div>' +
        '<div class="cc-t">맞춤 처방을<br>계산하고 있어요</div>' +
        '<ul class="cc-list">' + steps.map(function (t) { return '<li><i>' + CHECK + '</i>' + UI.esc(t) + '</li>'; }).join('') + '</ul>' +
      '</div></div>';

    var arc = document.getElementById('cc-arc'), num = document.getElementById('cc-num');
    var items = root.querySelectorAll('.cc-list li');
    /* 원과 숫자는 한 프레임씩 같이 그린다. 단계가 진행되는 동안 그 단계 몫(25%)을
       STEP_MS에 걸쳐 일정한 속도로 채워, 단계가 이어지면 끊김 없이 계속 차오른다. */
    var shown = 0, from = 0, to = 0, t0 = 0, raf = 0;
    function draw(p) {
      arc.style.strokeDashoffset = CALC_C * (1 - p / 100);
      num.textContent = Math.floor(p) + '%';
    }
    function frame(now) {
      var k = Math.min(1, (now - t0) / STEP_MS);
      shown = from + (to - from) * k;
      draw(shown);
      raf = k < 1 ? requestAnimationFrame(frame) : 0;
    }
    function fillTo(p) {
      from = shown; to = p; t0 = performance.now();
      if (!raf) raf = requestAnimationFrame(frame);
    }
    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function step(i) {
      if (items[i - 1]) { items[i - 1].classList.remove('run'); items[i - 1].classList.add('ok'); }
      if (items[i]) items[i].classList.add('run');
      if (i >= items.length) {                 // 다 끝났으면 남은 끝자리까지 바로 100%로
        if (raf) cancelAnimationFrame(raf);
        raf = 0; shown = 100; draw(100);
        return;
      }
      fillTo((i + 1) * 25);                    // 지금 단계가 끝날 때 닿을 곳
    }

    step(0);
    wait(STEP_MS).then(function () { step(1); return wait(STEP_MS); })
      .then(function () { step(2); return Promise.all([WeatherAPI.load(loc, false).catch(function () {}), wait(STEP_MS)]); })
      .then(function () { step(3); return wait(STEP_MS); })
      .then(function () { step(4); return wait(STEP_MS + 200); })
      .then(function () { hide(); App.boot(); });   // 날씨는 방금 받아 둬서 홈은 바로 뜬다
  }

  return { show: show, hide: hide, numFields: numFields, ageWheel: ageWheel, bindWheel: bindWheel };
})();
