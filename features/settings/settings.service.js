/* =========================================================
   기능: 설정 — 서비스(로직)
   §9 · 피부타입 · 기상시간 · 보충제 복용 여부 (+ 위치 · 알림)
   ========================================================= */
var SettingsService = (function () {

  var SKIN = [
    { t: 1, label: 'Ⅰ', desc: '항상 타고 절대 안 그을림' },
    { t: 2, label: 'Ⅱ', desc: '쉽게 타고 조금 그을림' },
    { t: 3, label: 'Ⅲ', desc: '가끔 타고 서서히 그을림' },
    { t: 4, label: 'Ⅳ', desc: '거의 안 타고 잘 그을림' },
    { t: 5, label: 'Ⅴ', desc: '드물게 타고 진하게 그을림' },
    { t: 6, label: 'Ⅵ', desc: '타지 않음' }
  ];
  /* rx(오늘 처방)를 받으면 '무엇이 이 시간을 정했나'까지 뷰모델에 담는다.
     홈에서 이곳으로 옮겨 온 카드다. 예보를 못 받은 상태(키 없음·오류)에서도
     설정 화면은 열려야 하므로 rx가 없으면 today를 null로 둔다. */
  function model(rx) {
    var p = Repo.getProfile();
    var loc = Repo.getLocation();
    var cache = Repo.getWeatherCache();
    var today = null;
    if (rx) {
      var h = HomeService.build(rx, {});
      today = {
        limits: h.limits,
        mode: h.mode,
        modeLabel: h.modeLabel,
        minutes: h.hero.minutes,
        kicker: h.hero.kicker,
        why: h.hero.why,
        state: h.hero.state
      };
    }

    return {
      today: today,
      profile: p,
      location: loc,
      skinOptions: SKIN,
      clothingOptions: Object.keys(Engine.CLOTHING).map(function (k) {
        return { key: k, label: Engine.CLOTHING[k].label, f: Engine.CLOTHING[k].f };
      }),
      medOfCurrent: Engine.MED[p.skinType],
      notifySupported: Notify.supported(),
      notifyGranted: Notify.granted(),
      cacheText: cache
        ? cache.dateKey + ' · ' + new Date(cache.fetchedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) + ' 갱신' +
          (cache.uvMissing ? ' · 일부 자료 누락(날씨만 반영)' : '')
        : '없음'
    };
  }

  function set(patch) { return Repo.setProfile(patch); }

  function toggleNotify(on) {
    if (!on) { Repo.setProfile({ notify: false }); Notify.clear(); return Promise.resolve(false); }
    return Notify.request().then(function (ok) {
      Repo.setProfile({ notify: ok });
      return ok;
    });
  }

  function useGeolocation() {
    return WeatherAPI.locate().then(function (loc) {
      Repo.setLocation(loc);
      return loc;
    });
  }
  function useCity(name) {
    var c = KmaGeo.findByName(name);
    if (!c) return null;
    var loc = { lat: c.lat, lon: c.lon, name: c.name, precise: false, nx: c.nx, ny: c.ny, areaNo: c.areaNo };
    Repo.setLocation(loc);
    return loc;
  }

  function resetAll() { Repo.reset(); }

  return {
    SKIN: SKIN,
    model: model, set: set, toggleNotify: toggleNotify,
    useGeolocation: useGeolocation, useCity: useCity, resetAll: resetAll
  };
})();
