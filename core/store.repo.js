/* =========================================================
   저장 · 플랫폼 — 로컬 저장소 (설정 · 노출 이력)
   ========================================================= */
/* 전역: Repo — 기능 계층은 이 저장소 API로만 접근한다 */
var Repo = (function () {
  var NS = 'sunrx.';

  var DEFAULT_PROFILE = {
    onboarded: false,
    skinType: 3,          // §7 기본값 — 타입 III
    clothing: 'shortShort',
    spf: 1,               // 안 바르면 1
    wakeTime: '07:00',    // §6 생체리듬 축
    useCircadian: true,
    supplement: false,    // §5 합산 상한 경고용
    notify: false
  };

  function read(key, fallback) {
    try {
      var v = localStorage.getItem(NS + key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch (e) {}
  }

  function getProfile() {
    var p = read('profile', {});
    var out = {};
    for (var k in DEFAULT_PROFILE) {
      out[k] = p[k] !== undefined ? p[k] : DEFAULT_PROFILE[k];
    }
    return out;
  }
  function setProfile(patch) {
    var p = getProfile();
    for (var k in patch) p[k] = patch[k];
    write('profile', p);
    return p;
  }

  function getLocation() { return read('location', null); }
  function setLocation(loc) { write('location', loc); }

  /* 일별 충전률 {'2026-08-31': 62} */
  function getDaily() { return read('daily', {}); }
  function addCharge(dateKey, percent) {
    var d = getDaily();
    d[dateKey] = Math.round((d[dateKey] || 0) + percent);
    write('daily', d);
    return d;
  }

  /* 노출 이력 세션 단위 */
  function getSessions() { return read('sessions', []); }
  function addSession(s) {
    var arr = getSessions();
    arr.unshift(s);
    write('sessions', arr.slice(0, 200));
    return arr;
  }

  /* 날씨 캐시 — §8 하루 1회 호출 */
  function getWeatherCache() { return read('weather', null); }
  function setWeatherCache(obj) { write('weather', obj); }

  function reset() {
    ['profile', 'location', 'daily', 'sessions', 'weather'].forEach(function (k) {
      try { localStorage.removeItem(NS + k); } catch (e) {}
    });
  }

  return {
    getProfile: getProfile, setProfile: setProfile,
    getLocation: getLocation, setLocation: setLocation,
    getDaily: getDaily, addCharge: addCharge,
    getSessions: getSessions, addSession: addSession,
    getWeatherCache: getWeatherCache, setWeatherCache: setWeatherCache,
    reset: reset
  };
})();
