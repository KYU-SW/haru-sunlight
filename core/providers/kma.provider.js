/* =========================================================
   1계층 외부 데이터 — 기상청(공공데이터포털)  [백엔드 계층]

     날씨(기온·습도) : 기상청_단기예보 조회서비스(2.0)   getVilageFcst
     자외선지수      : 기상청_생활기상지수 조회서비스(4.0) getUVIdxV5

   ⚠️ getUVIdxV5는 실서비스키로 확인한 경로가 아니라 공공데이터포털 문서
      (Swagger 스펙)로만 확인했다. 응답 구조(h0~h75, 3시간 간격)는 문서와
      정확히 일치하지만, 실제 값이 나오는지는 서비스키 발급 후 최초 1회
      직접 호출해 확인해야 한다 — 아래 SERVICE KEY 안내 참고.
   ========================================================= */
var KmaProvider = (function () {

  var FCST_URL = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst';
  var UV_URL   = 'https://apis.data.go.kr/1360000/LivingWthrIdxServiceV5/getUVIdxV5';

  var TZ_HOURS = 9;                                       // 기상청 = KST 고정
  var FCST_BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23];     // 단기예보 발표시각
  var UV_BASE_HOURS = [6, 18];                             // 자외선지수 발표시각(1일 2회)
  var PUBLISH_DELAY_MIN = 15;                              // 발표 후 실제 제공까지의 여유

  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(d) { return d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()); }
  function dashed(s) { return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8); }

  /* 공공데이터포털은 인코딩/디코딩 두 형태의 키를 함께 준다.
     디코딩 키(+, / 포함)를 그대로 붙이면 인증이 깨지므로 정규화한다. */
  function encKey(key) {
    var k = (key || '').trim();
    return k.indexOf('%') >= 0 ? k : encodeURIComponent(k);
  }

  /* 지금 시각 기준으로 쓸 수 있는 최근 발표시각들(최신순) */
  function recentBases(now, hours, count) {
    var t = new Date(now.getTime() - PUBLISH_DELAY_MIN * 60000);
    var list = [];
    for (var back = 0; back <= 1; back++) {
      var d = new Date(t.getTime() - back * 86400000);
      for (var i = hours.length - 1; i >= 0; i--) {
        var c = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hours[i], 0, 0);
        if (c <= t) list.push(c);
      }
    }
    list.sort(function (a, b) { return b - a; });
    return list.slice(0, count || 1);
  }

  /* data.go.kr 공통 오류 봉투 처리 */
  function unwrap(json) {
    if (json && json.OpenAPI_ServiceResponse) {
      var h = json.OpenAPI_ServiceResponse.cmmMsgHeader || {};
      var e = new Error(h.returnAuthMsg || h.errMsg || '기상청 API 오류');
      e.kmaCode = h.returnReasonCode;
      throw e;
    }
    var r = json && json.response;
    if (!r) throw new Error('기상청 API 응답 형식을 해석하지 못했습니다');
    var code = r.header && r.header.resultCode;
    if (code && code !== '00') {
      var e2 = new Error('(' + code + ') ' + (r.header.resultMsg || '기상청 API 오류'));
      e2.kmaCode = code;
      throw e2;
    }
    var items = r.body && r.body.items && r.body.items.item;
    if (!items) return [];
    return Object.prototype.toString.call(items) === '[object Array]' ? items : [items];
  }

  function getJson(url) {
    return fetch(url).then(function (res) {
      return res.text().then(function (txt) {
        try { return JSON.parse(txt); }
        catch (e) {
          var m = txt.match(/<returnAuthMsg>([^<]*)<|<errMsg>([^<]*)</);
          throw new Error(m ? (m[1] || m[2]) : ('HTTP ' + res.status + ' — 응답을 해석할 수 없습니다'));
        }
      });
    });
  }

  /* 호출 경로 — 로컬 키가 있으면 기상청 직접, 없으면 중계 서버(키는 서버에만 있음)
     src = { fcst: 기본 URL, uv: 기본 URL, auth: '?serviceKey=…&' | '?' } */
  function source(key, proxy) {
    if (key) return { fcst: FCST_URL, uv: UV_URL, auth: '?serviceKey=' + encKey(key) + '&', via: 'direct' };
    var base = String(proxy).replace(/\/+$/, '');
    return { fcst: base + '/fcst', uv: base + '/uv', auth: '?', via: 'proxy' };
  }

  /* ---------- 단기예보: 기온(TMP) · 습도(REH) ---------- */
  function fetchForecast(src, nx, ny, now) {
    var bases = recentBases(now, FCST_BASE_HOURS, 2);

    function attempt(i) {
      if (i >= bases.length) return Promise.reject(new Error('단기예보 발표 자료를 찾지 못했습니다'));
      var b = bases[i];
      var url = src.fcst + src.auth +
        'pageNo=1&numOfRows=1000&dataType=JSON' +
        '&base_date=' + ymd(b) + '&base_time=' + p2(b.getHours()) + '00' +
        '&nx=' + nx + '&ny=' + ny;

      return getJson(url).then(unwrap).then(function (items) {
        if (!items.length) throw new Error('단기예보 항목이 비어 있습니다');
        return items;
      }).catch(function (e) {
        if (i + 1 < bases.length) return attempt(i + 1);
        throw e;
      });
    }
    return attempt(0);
  }

  function parseForecast(items) {
    var days = {};   // {'2026-08-31': {9: {tempC, rh}, ...}}
    items.forEach(function (it) {
      if (it.category !== 'TMP' && it.category !== 'REH') return;
      var date = dashed(it.fcstDate);
      var hour = parseInt(String(it.fcstTime).slice(0, 2), 10);
      if (!days[date]) days[date] = {};
      if (!days[date][hour]) days[date][hour] = {};
      var v = parseFloat(it.fcstValue);
      if (isNaN(v)) return;
      if (it.category === 'TMP') days[date][hour].tempC = v;
      else days[date][hour].rh = v;
    });
    return days;
  }

  /* ---------- 생활기상지수: 자외선지수 ---------- */
  function fetchUv(src, areaNo, now) {
    var bases = recentBases(now, UV_BASE_HOURS, 3);

    function attempt(i) {
      if (i >= bases.length) return Promise.reject(new Error('자외선지수 발표 자료를 찾지 못했습니다'));
      var b = bases[i];
      var url = src.uv + src.auth +
        'pageNo=1&numOfRows=10&dataType=JSON' +
        '&areaNo=' + areaNo +
        '&time=' + ymd(b) + p2(b.getHours());

      return getJson(url).then(unwrap).then(function (items) {
        if (!items.length) throw new Error('자외선지수 항목이 비어 있습니다');
        return { item: items[0], base: b };
      }).catch(function (e) {
        if (i + 1 < bases.length) return attempt(i + 1);
        throw e;
      });
    }
    return attempt(0);
  }

  /* h0~h75(3시간 간격) → [{ms, uvi}] */
  function parseUv(res) {
    var it = res.item, baseMs = res.base.getTime(), pts = [];
    for (var h = 0; h <= 75; h += 3) {
      var raw = it['h' + h];
      if (raw === undefined || raw === null || raw === '') continue;
      var v = parseFloat(raw);
      if (isNaN(v)) continue;
      pts.push({ ms: baseMs + h * 3600000, uvi: v });
    }
    return pts;
  }

  /* 3시간 간격 UV를 임의 시각에 선형보간. 범위 밖은 0(야간 취급) */
  function uvAt(pts, ms) {
    if (!pts.length) return 0;
    if (ms <= pts[0].ms || ms >= pts[pts.length - 1].ms) return 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      if (ms >= a.ms && ms <= b.ms) {
        var w = (ms - a.ms) / (b.ms - a.ms);
        return a.uvi + (b.uvi - a.uvi) * w;
      }
    }
    return 0;
  }

  /* ---------- 두 응답 병합 → 앱 공통 포맷 ---------- */
  function merge(fcstDays, uvPts, loc) {
    var out = [];
    Object.keys(fcstDays).sort().forEach(function (dateKey) {
      var hours = fcstDays[dateKey];
      var parts = dateKey.split('-');
      var y = +parts[0], mo = +parts[1], d = +parts[2];

      var hourList = Object.keys(hours).map(Number).sort(function (a, b) { return a - b; })
        .filter(function (h) { return hours[h].tempC != null && hours[h].rh != null; });

      var hourly = hourList.map(function (h) {
        var ms = new Date(y, mo - 1, d, h, 0, 0).getTime();
        return {
          minuteOfDay: h * 60,
          uvi: Math.max(0, uvAt(uvPts, ms)),
          uviClear: null,               // 기상청은 청천 UV를 주지 않는다
          tempC: hours[h].tempC,
          rh: hours[h].rh,
          feelsLike: null               // §3 NOAA Heat Index로 계산(엔진이 자동 처리)
        };
      });
      if (hourly.length < 2) return;

      var ss = Solar.sunriseSunset(y, mo, d, loc.lat, loc.lon, TZ_HOURS);
      out.push({
        date: dateKey,
        hourly: hourly,
        sunrise: ss.rise != null ? dateKey + 'T' + isoTime(ss.rise) : null,
        sunset:  ss.set  != null ? dateKey + 'T' + isoTime(ss.set)  : null
      });
    });
    return out;
  }
  function isoTime(min) {
    var m = Math.round(min), h = Math.floor(m / 60) % 24;
    return p2(h) + ':' + p2(m % 60);
  }

  /* ---------- 공개 API ---------- */
  function load(loc, key, proxy) {
    if (!key && !proxy) {
      var e0 = new Error('기상청 서비스키가 없습니다 — config.local.js에 넣어 주세요');
      e0.noKey = true;
      return Promise.reject(e0);
    }
    if (!KmaGeo.inKorea(loc.lat, loc.lon)) {
      return Promise.reject(new Error('기상청 API는 국내 좌표만 지원합니다'));
    }

    var now = new Date();
    var nearest = KmaGeo.nearestCity(loc.lat, loc.lon);
    var grid = (loc.nx && loc.ny) ? { nx: loc.nx, ny: loc.ny } : KmaGeo.toGrid(loc.lat, loc.lon);
    var areaNo = loc.areaNo || nearest.areaNo;
    var src = source(key, proxy);

    return Promise.all([
      fetchForecast(src, grid.nx, grid.ny, now).then(parseForecast),
      fetchUv(src, areaNo, now).then(parseUv)
        .catch(function (e) { return { error: e }; })     // UV만 실패해도 날씨는 살린다
    ]).then(function (r) {
      var fcstDays = r[0];
      var uvRes = r[1];
      var uvPts = (uvRes && uvRes.error) ? [] : uvRes;
      var days = merge(fcstDays, uvPts, loc);
      if (!days.length) throw new Error('예보를 시간별로 정리하지 못했습니다');

      return {
        source: 'kma',
        via: src.via,
        sourceLabel: '기상청 단기예보 · 생활기상지수',
        fetchedAt: Date.now(),
        dateKey: Engine.dayKey(now),
        utcOffsetSeconds: TZ_HOURS * 3600,
        timezone: 'Asia/Seoul',
        lat: loc.lat, lon: loc.lon,
        grid: grid, areaNo: areaNo,
        uvMissing: !!(uvRes && uvRes.error),
        uvError: (uvRes && uvRes.error) ? uvRes.error.message : null,
        days: days
      };
    });
  }

  return {
    FCST_URL: FCST_URL, UV_URL: UV_URL, load: load,
    _: { recentBases: recentBases, parseForecast: parseForecast, parseUv: parseUv,
         uvAt: uvAt, merge: merge, encKey: encKey, unwrap: unwrap, source: source }
  };
})();
