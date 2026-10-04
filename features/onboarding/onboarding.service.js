/* =========================================================
   기능: 온보딩 — 서비스(로직)
   §7 · 1회, 약 30초. 이후 매일 입력할 것은 없다.
   ========================================================= */
var OnboardingService = (function () {

  /* §7 질문 1 — 피부 타입 (마이페이지와 같은 6단계 · 피츠패트릭 Ⅰ~Ⅵ) */
  var SKIN_OPTIONS = [
    { type: 1, label: 'Ⅰ', title: '항상 타고 절대 안 그을림',   desc: '타입 Ⅰ' },
    { type: 2, label: 'Ⅱ', title: '쉽게 타고 조금 그을림',      desc: '타입 Ⅱ' },
    { type: 3, label: 'Ⅲ', title: '가끔 타고 서서히 그을림',    desc: '타입 Ⅲ' },
    { type: 4, label: 'Ⅳ', title: '거의 안 타고 잘 그을림',     desc: '타입 Ⅳ' },
    { type: 5, label: 'Ⅴ', title: '드물게 타고 진하게 그을림',  desc: '타입 Ⅴ' },
    { type: 6, label: 'Ⅵ', title: '타지 않음',                  desc: '타입 Ⅵ' }
  ];
  var UNSURE_INDEX = 2;   // '잘 모르겠어요' → 타입 Ⅲ 기본값

  /* 질문 2 — 나이(돌려서 고르기) · 키 · 몸무게(직접 입력). 마이페이지에서도 같은 방식으로 고친다.
     동의 화면에서 만 14세 이상만 받으므로 나이는 14부터. 처음에는 25세에 맞춰 둔다. */
  var AGE = { min: 14, max: 100, initial: 25 };
  var BODY = {
    heightCm: { min: 100, max: 230, label: '키',     unit: 'cm', obj: '키를',     top: '키는' },
    weightKg: { min: 25,  max: 250, label: '몸무게', unit: 'kg', obj: '몸무게를', top: '몸무게는' }
  };
  /* 비어 있거나 범위를 벗어난 칸의 안내 문구 — 모두 맞으면 null */
  function bodyError(v) {
    for (var k in BODY) {
      var n = parseFloat(v[k]), b = BODY[k];
      if (v[k] === '' || v[k] == null) return b.obj + ' 입력해 주세요';
      if (isNaN(n) || n < b.min || n > b.max) return b.top + ' ' + b.min + '~' + b.max + b.unit + ' 사이로 입력해 주세요';
    }
    return null;
  }

  var state = { step: 0, skinIndex: null, wakeTime: '07:00', loc: null, age: AGE.initial, body: { heightCm: '', weightKg: '' } };

  function steps() {
    return ['skin', 'body', 'location'];
  }
  function total() { return steps().length; }

  function reset() {
    var p = Repo.getProfile();
    state = {
      step: 0, skinIndex: null, wakeTime: p.wakeTime || '07:00', loc: Repo.getLocation(),
      age: p.age || AGE.initial,
      body: { heightCm: p.heightCm || '', weightKg: p.weightKg || '' }
    };
  }

  function pickSkin(i) { state.skinIndex = i; }
  function setWake(v)  { state.wakeTime = v; }
  function setLoc(l)   { state.loc = l; }
  function setBody(k, v) { state.body[k] = v; }
  function setAge(v)   { state.age = v; }

  function canNext() {
    var s = steps()[state.step];
    if (s === 'skin') return state.skinIndex !== null;
    if (s === 'body') return !!state.age && !bodyError(state.body);
    if (s === 'location') return !!state.loc;
    return true;
  }
  function next() { if (state.step < total() - 1) state.step++; }
  function back() { if (state.step > 0) state.step--; }

  /* 위치 권한 → 실패 시 도시 선택으로 폴백 (§7) */
  function useGeolocation() {
    return WeatherAPI.locate().then(function (loc) {
      state.loc = loc;
      return loc;
    });
  }
  function useCity(name) {
    var c = KmaGeo.findByName(name);
    if (c) state.loc = { lat: c.lat, lon: c.lon, name: c.name, precise: false, nx: c.nx, ny: c.ny, areaNo: c.areaNo };
    return state.loc;
  }

  function complete() {
    var skin = state.skinIndex !== null ? SKIN_OPTIONS[state.skinIndex].type : 3;
    Repo.setProfile({
      onboarded: true,
      skinType: skin,
      wakeTime: state.wakeTime,
      age: state.age,
      heightCm: Math.round(parseFloat(state.body.heightCm)),
      weightKg: Math.round(parseFloat(state.body.weightKg))
    });
    if (state.loc) Repo.setLocation(state.loc);
    return Repo.getProfile();
  }

  return {
    SKIN_OPTIONS: SKIN_OPTIONS, UNSURE_INDEX: UNSURE_INDEX, BODY: BODY, bodyError: bodyError,
    AGE: AGE, setAge: setAge,
    get state() { return state; },
    steps: steps, total: total, reset: reset,
    pickSkin: pickSkin, setWake: setWake, setLoc: setLoc, setBody: setBody,
    canNext: canNext, next: next, back: back,
    useGeolocation: useGeolocation, useCity: useCity, complete: complete
  };
})();
