/* =========================================================
   관리자 대시보드 — 예시 데이터
   실제 기록이 쌓이기 전에 화면을 확인하는 용도. 화면에 '예시'라고 계속 표시한다.
   ========================================================= */
var AdminDemo = (function () {

  function rng(seed) {                   // 고정 난수 — 열 때마다 같은 예시가 나오게
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  var START = '2026-10-05', WEEKS = 4, N = 30;

  function data() {
    var r = rng(7), users = [], sessions = [];
    var cloth = ['shortShort', 'shortLong', 'longLong'];
    var sidos = ['서울특별시', '경기도', '인천광역시', '충청남도', '대전광역시'];
    var start = AdminStats.dayNum(START);
    for (var i = 0; i < 27; i++) {                        // 30명 중 27명만 가입·기록 (3명은 기록 0)
      var uid = 'demo' + ('0' + i).slice(-2) + 'x' + Math.floor(r() * 1e6).toString(36);
      var notify = r() < 0.55;
      users.push({ uid: uid, notify: notify, sido: sidos[Math.floor(r() * sidos.length)], skinType: 1 + Math.floor(r() * 6) });
      var drop = r() < 0.18 ? 9 + Math.floor(r() * 8) : 99;         // 일부는 중간에 그만 씀
      var base = 0.25 + r() * 0.3;
      for (var d = 0; d < WEEKS * 7; d++) {
        if (d > drop) break;
        var p = base + d * 0.012 + (notify ? 0.08 : 0);
        if (r() > p) continue;
        var times = r() < 0.25 ? 2 : 1;
        for (var t = 0; t < times; t++) {
          var min = Math.max(1, Math.round(6 + r() * 14 + d * 0.15));
          var pct = Math.min(300, Math.round(min * (4 + r() * 5)));
          sessions.push({
            uid: uid, dateKey: AdminStats.keyOf(start + d), at: (start + d) * 86400000 + (11 + t * 3) * 3600000,
            minutes: min, percent: pct, clothing: cloth[Math.floor(r() * 3)],
            limitedBy: r() < 0.8 ? 'vitd' : (r() < 0.6 ? 'burn' : 'heat')
          });
        }
      }
    }
    /* 연령대 · BMI 구간 — 위 난수 순서를 바꾸지 않도록 따로 뽑는다. 몇 명은 입력 안 함 */
    var r2 = rng(19), ages = [20, 20, 20, 20, 30, 10, 40, 50], bmis = ['normal', 'normal', 'normal', 'under', 'pre', 'obese1', 'obese2'];
    users.forEach(function (u) {
      if (r2() < 0.88) u.ageGroup = ages[Math.floor(r2() * ages.length)];
      if (r2() < 0.8) u.bmiGroup = bmis[Math.floor(r2() * bmis.length)];
    });
    return { users: users, sessions: sessions, n: N, start: START, weeks: WEEKS };
  }

  return { data: data };
})();
