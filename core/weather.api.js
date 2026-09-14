/* =========================================================
   1계층 외부 데이터 — 파사드  [백엔드 계층]
   기상청 2개 API(단기예보 · 생활기상지수)만 쓴다. 하루 1회 호출 · 캐시.
   위쪽 계층(prescription, features)은 기상청을 쓰는지조차 몰라도 된다.

   ⚠️ 국내 좌표 전용 — 기상청 API가 해외 위치를 지원하지 않는다.
   ⚠️ 서비스키는 앱 기능(설정 화면 입력)이 아니라 config.local.js 파일로만 넣는다.
      그 파일은 .gitignore에 등록돼 있어 깃허브에 올라가지 않는다.
      키가 있는 사람만 config.local.example.js를 복사해 채워 넣고 테스트한다.
   ⚠️ 키가 없으면 config.js의 KMA_PROXY_URL(중계 서버)로 받는다 — 공개 링크용.
      → README "서비스키 설정" 참고.
   ========================================================= */
var WeatherAPI = (function () {

  var CITIES = KmaGeo.CITIES;

  function key() { return (window.KMA_SERVICE_KEY || '').trim(); }
  /* 중계 서버 주소(config.js) — 공개 링크용. 키는 그 서버에만 있다 */
  function proxy() { return (window.KMA_PROXY_URL || '').trim(); }
  function nearestCity(lat, lon) { return KmaGeo.nearestCity(lat, lon).name; }
  function todayKey() { return Engine.dayKey(new Date()); }
  function hasKey() { return !!key(); }
  function hasProxy() { return !!proxy(); }
  function inKorea(lat, lon) { return KmaGeo.inKorea(lat, lon); }

  /* 브라우저 위치정보 — 국내 좌표가 아니면 명시적으로 거부한다.
     (기상청 API는 해외를 지원하지 않으므로 여기서 걸러야 한다) */
  function locate() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) return reject(new Error('unsupported'));
      navigator.geolocation.getCurrentPosition(
        function (p) {
          var lat = Math.round(p.coords.latitude * 100) / 100;
          var lon = Math.round(p.coords.longitude * 100) / 100;
          if (!KmaGeo.inKorea(lat, lon)) {
            var e = new Error('국내 좌표가 아닙니다');
            e.outOfKorea = true;
            return reject(e);
          }
          var c = KmaGeo.nearestCity(lat, lon);
          var g = KmaGeo.toGrid(lat, lon);
          resolve({ lat: lat, lon: lon, name: c.name, precise: true, nx: g.nx, ny: g.ny, areaNo: c.areaNo });
        },
        function (e) { reject(e); },
        { timeout: 8000, maximumAge: 600000 }
      );
    });
  }

  /* 캐시 수명 — 1시간.
     명세 §8은 "하루 1회"였지만, 시간이 지나면 지금 시각의 자외선지수·기온이
     달라지므로 1시간 주기로 다시 받아 화면이 따라가게 한다.
     (기상청 발표 자체는 단기예보 3시간·자외선지수 6/18시 간격이라,
      1시간마다 호출해도 새 발표가 나오면 그때 반영되는 구조다) */
  var TTL_MS = 60 * 60 * 1000;

  /* 실패해도 옛 캐시를 돌려준다(발표 중 네트워크 사고 대비). */
  function load(loc, force) {
    var cache = Repo.getWeatherCache();
    var fresh = cache && cache.dateKey === todayKey() &&
                cache.lat === loc.lat && cache.lon === loc.lon &&
                (Date.now() - (cache.fetchedAt || 0)) < TTL_MS;

    if (fresh && !force) {
      return Promise.resolve({ data: cache, stale: false, cached: true });
    }

    return KmaProvider.load(loc, key(), proxy())
      .then(function (data) {
        Repo.setWeatherCache(data);
        return { data: data, stale: false, cached: false };
      })
      .catch(function (err) {
        if (cache) return { data: cache, stale: true, cached: true, error: err };
        throw err;
      });
  }

  return {
    CITIES: CITIES, GROUPS: KmaGeo.GROUPS, nearestCity: nearestCity,
    locate: locate, load: load, todayKey: todayKey,
    hasKey: hasKey, hasProxy: hasProxy, inKorea: inKorea, TTL_MS: TTL_MS
  };
})();
