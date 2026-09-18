/* =========================================================
   기능: 온보딩 — 서비스(로직)
   §7 · 1회, 약 30초. 이후 매일 입력할 것은 없다.
   ========================================================= */
var OnboardingService = (function () {

  /* §7 질문 1 — 피부 타입 */
  var SKIN_OPTIONS = [
    { type: 2, emoji: '🥵', title: '빨개지고 벗겨진다, 잘 안 탄다', desc: '타입 II · MED 250' },
    { type: 3, emoji: '🙂', title: '조금 빨개졌다가 갈색으로 탄다', desc: '타입 III · MED 300' },
    { type: 4, emoji: '😎', title: '거의 안 빨개지고 잘 탄다',     desc: '타입 IV · MED 400' },
    { type: 3, emoji: '🤔', title: '잘 모르겠다',                  desc: '타입 III 기본값으로 시작' }
  ];

  var state = { step: 0, skinIndex: null, wakeTime: '07:00', loc: null };

  function steps() {
    return ['skin', 'wake', 'location'];
  }
  function total() { return steps().length; }

  function reset() {
    var p = Repo.getProfile();
    state = { step: 0, skinIndex: null, wakeTime: p.wakeTime || '07:00', loc: Repo.getLocation() };
  }

  function pickSkin(i) { state.skinIndex = i; }
  function setWake(v)  { state.wakeTime = v; }
  function setLoc(l)   { state.loc = l; }

  function canNext() {
    var s = steps()[state.step];
    if (s === 'skin') return state.skinIndex !== null;
    if (s === 'wake') return /^\d{2}:\d{2}$/.test(state.wakeTime);
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
      wakeTime: state.wakeTime
    });
    if (state.loc) Repo.setLocation(state.loc);
    return Repo.getProfile();
  }

  return {
    SKIN_OPTIONS: SKIN_OPTIONS,
    get state() { return state; },
    steps: steps, total: total, reset: reset,
    pickSkin: pickSkin, setWake: setWake, setLoc: setLoc,
    canNext: canNext, next: next, back: back,
    useGeolocation: useGeolocation, useCity: useCity, complete: complete
  };
})();
