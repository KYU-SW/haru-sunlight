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
    place: 'normal',      // 쬐는 장소 — 타이머에서 고른다 (Engine.PLACES)
    age: null,            // 나이(돌려서 고름) · 키(cm) · 몸무게(kg)(직접 입력) — 온보딩·마이페이지.
                          // 원값은 기기에만 두고, 서버에는 연령대·BMI 구간만 보낸다
    heightCm: null,
    weightKg: null,
    spf: 1,               // 안 바르면 1
    wakeTime: '07:00',    // §6 생체리듬 축
    useCircadian: true,
    supplement: false,    // §5 합산 상한 경고용
    notify: false,
    barrier: null,        // 햇빛을 못 쬔 가장 큰 이유 — 'time' · 'forgot' · 'weather' · 'burn' · 'lazy' (지난주 돌아보기에서 고름)
    barrierWeek: null,    // 그 이유를 고른 주(월요일) — 다음 주 팝업에서 그 뒤로 얼마나 바뀌었는지 보여 준다
    autoCloth: false,     // 켜면 그날 낮 최고 기온으로 옷차림을 하루 한 번 맞춘다 (Engine.clothingForTemp)
    autoClothDay: null,   // 마지막으로 맞춘 날 — 같은 날 직접 바꾼 옷차림은 덮어쓰지 않는다
    consent: null         // 기록 수집 동의 {agreed, version, at} — 답하기 전엔 null
  };

  function read(key, fallback) {
    try {
      var v = localStorage.getItem(NS + key);
      var o = v ? JSON.parse(v) : null;
      return o == null ? fallback : o;     // 저장값이 'null' 문자열이어도 기본값으로
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

  /* 일별 안전 한계 소모율 {'2026-09-24': {burn:0.62, heat:0.30}} — 0~1
     화상·더위 한계는 하루 단위로 쌓인다. 타이머를 껐다 켜도 초기화되지 않는다. */
  function getLoad() { return read('load', {}); }
  function getDayLoad(dateKey) {
    var l = getLoad()[dateKey] || {};
    return { burn: l.burn || 0, heat: l.heat || 0, at: l.at || 0 };
  }
  function setDayLoad(dateKey, load) {
    var l = getLoad();
    /* at = 마지막으로 쬔 시각. 더위 몫은 쉬는 동안 줄어드므로 시각이 필요하다. */
    l[dateKey] = { burn: load.burn || 0, heat: load.heat || 0, at: load.at || Date.now() };
    write('load', l);
    return l;
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

  /* 진행 중인 타이머 세션 — 새로고침·앱 종료 뒤에도 이어 가기 위해 (TimerService) */
  function getTimer() { return read('timer', null); }
  function setTimer(o) { write('timer', o); }
  function clearTimer() { try { localStorage.removeItem(NS + 'timer'); } catch (e) {} }

  /* 회복 코스 — 두 코스를 같이 할 수 있다: courses = { daily8: {type,start,days}, load12: {...} } (core/course.js)
     예전 한 개짜리 'course' 기록은 처음 읽을 때 courses 로 옮긴다 */
  function getCourses() {
    var all = read('courses', null);
    if (all) return all;
    var old = read('course', null);
    return old && old.start ? (function () { var o = {}; o[old.type || 'daily8'] = old; return o; })() : {};
  }
  function setCourseOf(type, c) {
    var all = getCourses();
    if (c) { c.type = type; all[type] = c; } else delete all[type];
    write('courses', all);
    try { localStorage.removeItem(NS + 'course'); } catch (e) {}
  }
  /* 예전 이름 — 하나만 다루던 코드용: 첫 번째 코스 / 전부 지우기 */
  function getCourse() { var all = getCourses(); var k = Object.keys(all)[0]; return k ? all[k] : null; }
  function setCourse(c) {
    if (c) return setCourseOf(c.type || 'daily8', c);
    write('courses', {});
    try { localStorage.removeItem(NS + 'course'); } catch (e) {}
  }

  function reset() {
    ['profile', 'location', 'daily', 'load', 'sessions', 'weather', 'timer', 'course', 'courses'].forEach(function (k) {
      try { localStorage.removeItem(NS + k); } catch (e) {}
    });
  }

  return {
    getProfile: getProfile, setProfile: setProfile,
    getLocation: getLocation, setLocation: setLocation,
    getDaily: getDaily, addCharge: addCharge,
    getLoad: getLoad, getDayLoad: getDayLoad, setDayLoad: setDayLoad,
    getSessions: getSessions, addSession: addSession,
    getWeatherCache: getWeatherCache, setWeatherCache: setWeatherCache,
    getTimer: getTimer, setTimer: setTimer, clearTimer: clearTimer,
    getCourse: getCourse, setCourse: setCourse, getCourses: getCourses, setCourseOf: setCourseOf,
    reset: reset
  };
})();
