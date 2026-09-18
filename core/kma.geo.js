/* =========================================================
   core / 기상청 좌표계  [백엔드 계층]
   - 위경도 → 단기예보 격자(nx, ny)  : 기상청 DFS Lambert Conformal Conic
   - 지역 목록(시도별 분류) + 생활기상지수 지점코드(areaNo)

   ⚠️ areaNo는 추측하지 않았다. 아래 목록은 전부 기상청 생활기상지수 API로
      실제 조회해 응답이 오는 것만 남긴 것이다(2026-09 기준 검증).
      · 강원은 51, 전북은 52 (특별자치도 전환 후 신규 코드)
      · 광주·전남은 2026-07-01 "전남광주통합특별시"로 통합되어 옛 코드
        29xx·46xx가 폐지되고 12xx 계열로 재편 → 통합 대표코드 하나만 수록
   ========================================================= */
var KmaGeo = (function () {

  /* ---------- 단기예보 격자 변환 (기상청 배포 공식 그대로) ---------- */
  var RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0;
  var OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
  var DEGRAD = Math.PI / 180.0, PI = Math.PI;

  function toGrid(lat, lon) {
    var re = RE / GRID;
    var slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD;
    var olon = OLON * DEGRAD, olat = OLAT * DEGRAD;

    var sn = Math.tan(PI * 0.25 + slat2 * 0.5) / Math.tan(PI * 0.25 + slat1 * 0.5);
    sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);

    var sf = Math.tan(PI * 0.25 + slat1 * 0.5);
    sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;

    var ro = Math.tan(PI * 0.25 + olat * 0.5);
    ro = re * sf / Math.pow(ro, sn);

    var ra = Math.tan(PI * 0.25 + lat * DEGRAD * 0.5);
    ra = re * sf / Math.pow(ra, sn);

    var theta = lon * DEGRAD - olon;
    if (theta > PI) theta -= 2.0 * PI;
    if (theta < -PI) theta += 2.0 * PI;
    theta *= sn;

    return {
      nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
      ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5)
    };
  }

  function inKorea(lat, lon) {
    return lat >= 32 && lat <= 39.5 && lon >= 124 && lon <= 132;
  }

  /* ---------- 지역 목록 (시도 → 시·군) ----------
     시·군 단위까지만 둔다(구·동은 넣지 않는다). 광역시·특별시는 하나로.
     '// *' 표시는 기상청에서 시 코드를 따로 검증하지 않은 곳 — 도 대표코드를 쓴다
     (단기예보는 좌표 격자로 받으므로 날씨는 그 시 기준, 자외선지수만 도 단위다).
     nx/ny는 toGrid()로 실행 시 계산한다. */
  var GROUPS = [
    { sido: '서울', areas: [
      { name: '서울', lat: 37.5665, lon: 126.9780, areaNo: '1100000000' }
    ]},
    { sido: '경기', areas: [
      { name: '경기 전체', lat: 37.2750, lon: 127.0095, areaNo: '4100000000' },
      { name: '수원시',   lat: 37.2636, lon: 127.0286, areaNo: '4111000000' },
      { name: '성남시',   lat: 37.4200, lon: 127.1265, areaNo: '4113000000' },
      { name: '고양시',   lat: 37.6584, lon: 126.8320, areaNo: '4128000000' },
      { name: '용인시',   lat: 37.2411, lon: 127.1776, areaNo: '4146000000' },
      { name: '부천시',   lat: 37.5035, lon: 126.7660, areaNo: '4119000000' },
      { name: '안산시',   lat: 37.3219, lon: 126.8309, areaNo: '4127000000' },
      { name: '안양시',   lat: 37.3943, lon: 126.9568, areaNo: '4117000000' },
      { name: '남양주시', lat: 37.6360, lon: 127.2165, areaNo: '4136000000' },
      { name: '화성시',   lat: 37.1996, lon: 126.8310, areaNo: '4159000000' },
      { name: '평택시',   lat: 36.9921, lon: 127.1129, areaNo: '4122000000' },
      { name: '의정부시', lat: 37.7381, lon: 127.0338, areaNo: '4115000000' },
      { name: '파주시',   lat: 37.7599, lon: 126.7800, areaNo: '4148000000' },
      { name: '시흥시',   lat: 37.3800, lon: 126.8030, areaNo: '4100000000' }, // *
      { name: '김포시',   lat: 37.6153, lon: 126.7156, areaNo: '4100000000' }, // *
      { name: '광명시',   lat: 37.4786, lon: 126.8646, areaNo: '4100000000' }, // *
      { name: '광주시',   lat: 37.4295, lon: 127.2550, areaNo: '4100000000' }, // *
      { name: '하남시',   lat: 37.5393, lon: 127.2148, areaNo: '4100000000' }, // *
      { name: '군포시',   lat: 37.3617, lon: 126.9352, areaNo: '4100000000' }, // *
      { name: '오산시',   lat: 37.1498, lon: 127.0772, areaNo: '4100000000' }, // *
      { name: '이천시',   lat: 37.2724, lon: 127.4350, areaNo: '4100000000' }, // *
      { name: '안성시',   lat: 37.0080, lon: 127.2797, areaNo: '4100000000' }, // *
      { name: '구리시',   lat: 37.5943, lon: 127.1296, areaNo: '4100000000' }, // *
      { name: '의왕시',   lat: 37.3449, lon: 126.9683, areaNo: '4100000000' }, // *
      { name: '포천시',   lat: 37.8949, lon: 127.2003, areaNo: '4100000000' }, // *
      { name: '양주시',   lat: 37.7853, lon: 127.0458, areaNo: '4100000000' }, // *
      { name: '여주시',   lat: 37.2983, lon: 127.6370, areaNo: '4100000000' }, // *
      { name: '동두천시', lat: 37.9036, lon: 127.0606, areaNo: '4100000000' }, // *
      { name: '과천시',   lat: 37.4292, lon: 126.9876, areaNo: '4100000000' }, // *
      { name: '가평군',   lat: 37.8315, lon: 127.5105, areaNo: '4100000000' }, // *
      { name: '양평군',   lat: 37.4918, lon: 127.4875, areaNo: '4100000000' }, // *
      { name: '연천군',   lat: 38.0966, lon: 127.0748, areaNo: '4100000000' }  // *
    ]},
    { sido: '인천', areas: [
      { name: '인천',   lat: 37.4563, lon: 126.7052, areaNo: '2800000000' },
      { name: '강화군', lat: 37.7469, lon: 126.4878, areaNo: '2871000000' }
    ]},
    { sido: '강원', areas: [
      { name: '강원 전체', lat: 37.8854, lon: 127.7300, areaNo: '5100000000' },
      { name: '춘천시',   lat: 37.8813, lon: 127.7300, areaNo: '5111000000' },
      { name: '원주시',   lat: 37.3422, lon: 127.9202, areaNo: '5113000000' },
      { name: '강릉시',   lat: 37.7519, lon: 128.8761, areaNo: '5115000000' },
      { name: '속초시',   lat: 38.2070, lon: 128.5918, areaNo: '5121000000' },
      { name: '동해시',   lat: 37.5247, lon: 129.1143, areaNo: '5117000000' },
      { name: '태백시',   lat: 37.1641, lon: 128.9856, areaNo: '5100000000' }, // *
      { name: '삼척시',   lat: 37.4499, lon: 129.1652, areaNo: '5100000000' }  // *
    ]},
    { sido: '대전', areas: [
      { name: '대전', lat: 36.3504, lon: 127.3845, areaNo: '3000000000' }
    ]},
    { sido: '세종', areas: [
      { name: '세종', lat: 36.4800, lon: 127.2890, areaNo: '3600000000' }
    ]},
    { sido: '충북', areas: [
      { name: '충북 전체', lat: 36.6357, lon: 127.4917, areaNo: '4300000000' },
      { name: '청주시',   lat: 36.6424, lon: 127.4890, areaNo: '4311000000' },
      { name: '충주시',   lat: 36.9910, lon: 127.9259, areaNo: '4313000000' },
      { name: '제천시',   lat: 37.1326, lon: 128.1910, areaNo: '4315000000' }
    ]},
    { sido: '충남', areas: [
      { name: '충남 전체', lat: 36.6588, lon: 126.6728, areaNo: '4400000000' },
      { name: '천안시',   lat: 36.8151, lon: 127.1139, areaNo: '4413000000' },
      { name: '아산시',   lat: 36.7898, lon: 127.0018, areaNo: '4420000000' },
      { name: '서산시',   lat: 36.7848, lon: 126.4503, areaNo: '4421000000' },
      { name: '공주시',   lat: 36.4465, lon: 127.1190, areaNo: '4415000000' },
      { name: '보령시',   lat: 36.3334, lon: 126.6128, areaNo: '4400000000' }, // *
      { name: '논산시',   lat: 36.1871, lon: 127.0987, areaNo: '4400000000' }, // *
      { name: '당진시',   lat: 36.8897, lon: 126.6459, areaNo: '4400000000' }, // *
      { name: '계룡시',   lat: 36.2745, lon: 127.2489, areaNo: '4400000000' }  // *
    ]},
    { sido: '전북', areas: [
      { name: '전북 전체', lat: 35.8203, lon: 127.1088, areaNo: '5200000000' },
      { name: '전주시',   lat: 35.8242, lon: 127.1480, areaNo: '5211000000' },
      { name: '익산시',   lat: 35.9483, lon: 126.9576, areaNo: '5214000000' },
      { name: '군산시',   lat: 35.9676, lon: 126.7369, areaNo: '5213000000' },
      { name: '정읍시',   lat: 35.5699, lon: 126.8559, areaNo: '5200000000' }, // *
      { name: '남원시',   lat: 35.4164, lon: 127.3904, areaNo: '5200000000' }, // *
      { name: '김제시',   lat: 35.8036, lon: 126.8809, areaNo: '5200000000' }  // *
    ]},
    { sido: '광주·전남', areas: [
      /* 2026-07-01 전남광주통합특별시 출범으로 코드 재편. 통합 대표코드만 검증됨. */
      { name: '광주·전남 전체', lat: 35.1595, lon: 126.8526, areaNo: '1200000000' },
      { name: '광주',   lat: 35.1595, lon: 126.8526, areaNo: '1200000000' }, // *
      { name: '목포시', lat: 34.8118, lon: 126.3922, areaNo: '1200000000' }, // *
      { name: '여수시', lat: 34.7604, lon: 127.6622, areaNo: '1200000000' }, // *
      { name: '순천시', lat: 34.9507, lon: 127.4872, areaNo: '1200000000' }, // *
      { name: '나주시', lat: 35.0160, lon: 126.7108, areaNo: '1200000000' }, // *
      { name: '광양시', lat: 34.9407, lon: 127.6959, areaNo: '1200000000' }  // *
    ]},
    { sido: '대구', areas: [
      { name: '대구', lat: 35.8714, lon: 128.6014, areaNo: '2700000000' }
    ]},
    { sido: '경북', areas: [
      { name: '경북 전체', lat: 36.5760, lon: 128.5056, areaNo: '4700000000' },
      { name: '포항시',   lat: 36.0190, lon: 129.3435, areaNo: '4711000000' },
      { name: '경주시',   lat: 35.8562, lon: 129.2247, areaNo: '4713000000' },
      { name: '안동시',   lat: 36.5684, lon: 128.7294, areaNo: '4717000000' },
      { name: '구미시',   lat: 36.1196, lon: 128.3446, areaNo: '4719000000' },
      { name: '김천시',   lat: 36.1398, lon: 128.1136, areaNo: '4700000000' }, // *
      { name: '영주시',   lat: 36.8057, lon: 128.6240, areaNo: '4700000000' }, // *
      { name: '영천시',   lat: 35.9733, lon: 128.9386, areaNo: '4700000000' }, // *
      { name: '상주시',   lat: 36.4109, lon: 128.1590, areaNo: '4700000000' }, // *
      { name: '문경시',   lat: 36.5865, lon: 128.1867, areaNo: '4700000000' }, // *
      { name: '경산시',   lat: 35.8251, lon: 128.7414, areaNo: '4700000000' }  // *
    ]},
    { sido: '부산', areas: [
      { name: '부산', lat: 35.1796, lon: 129.0756, areaNo: '2600000000' }
    ]},
    { sido: '울산', areas: [
      { name: '울산', lat: 35.5384, lon: 129.3114, areaNo: '3100000000' }
    ]},
    { sido: '경남', areas: [
      { name: '경남 전체', lat: 35.2372, lon: 128.6924, areaNo: '4800000000' },
      { name: '창원시',   lat: 35.2280, lon: 128.6811, areaNo: '4812000000' },
      { name: '진주시',   lat: 35.1800, lon: 128.1076, areaNo: '4817000000' },
      { name: '김해시',   lat: 35.2286, lon: 128.8894, areaNo: '4825000000' },
      { name: '양산시',   lat: 35.3350, lon: 129.0378, areaNo: '4833000000' },
      { name: '통영시',   lat: 34.8544, lon: 128.4332, areaNo: '4800000000' }, // *
      { name: '사천시',   lat: 35.0036, lon: 128.0642, areaNo: '4800000000' }, // *
      { name: '밀양시',   lat: 35.5038, lon: 128.7464, areaNo: '4800000000' }, // *
      { name: '거제시',   lat: 34.8806, lon: 128.6211, areaNo: '4800000000' }  // *
    ]},
    { sido: '제주', areas: [
      { name: '제주시',   lat: 33.4996, lon: 126.5312, areaNo: '5011000000' },
      { name: '서귀포시', lat: 33.2542, lon: 126.5600, areaNo: '5013000000' }
    ]}
  ];

  /* 평평한 목록 — 최근접 탐색·기존 호출부 호환용. 격자는 여기서 계산해 붙인다. */
  var CITIES = [];
  GROUPS.forEach(function (g) {
    g.areas.forEach(function (a) {
      var grid = toGrid(a.lat, a.lon);
      CITIES.push({
        sido: g.sido, name: a.name, lat: a.lat, lon: a.lon,
        areaNo: a.areaNo, nx: grid.nx, ny: grid.ny
      });
    });
  });

  function nearestCity(lat, lon) {
    var best = CITIES[0], bd = Infinity;
    CITIES.forEach(function (c) {
      var d = Math.pow(c.lat - lat, 2) + Math.pow((c.lon - lon) * 0.8, 2);
      if (d < bd) { bd = d; best = c; }
    });
    return best;
  }

  function findByName(name) {
    return CITIES.filter(function (c) { return c.name === name; })[0] || null;
  }

  return {
    toGrid: toGrid, inKorea: inKorea,
    GROUPS: GROUPS, CITIES: CITIES,
    nearestCity: nearestCity, findByName: findByName
  };
})();
