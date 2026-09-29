/* =========================================================
   관리자 대시보드 — 예시 데이터
   실제 기록이 쌓이기 전에 화면을 확인하는 용도. 화면에 '예시'라고 계속 표시한다.
   설문은 구글 폼 CSV와 같은 모양의 글로 만들어, 실제 파일과 같은 길(AdminStats.survey)로 읽는다.
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
    return { users: users, sessions: sessions, n: N, start: START, weeks: WEEKS };
  }

  function csv(rows) {
    return rows.map(function (r) {
      return r.map(function (c) { c = String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(',');
    }).join('\n');
  }
  function pick(r, arr, w) {
    var t = 0, x = r(), i;
    for (i = 0; i < w.length; i++) t += w[i];
    x *= t;
    for (i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return arr[i]; }
    return arr[arr.length - 1];
  }

  var T = AdminStats.TIME.map(function (s) { return s.replace('미만', ' 미만').replace('이상', ' 이상'); });
  var TF = ['참', '거짓', '모름'];

  function preCsv() {
    var r = rng(11), head = ['타임스탬프', '[D1] 연령대', '[D2] 성별 (선택)', '[D3] 현재 비타민D 보충제를 드시나요?',
      '[P1] 지난 7일 중, 낮 시간(10~15시)에 야외에서 15분 이상 있었던 날은 며칠인가요?',
      '[P2] 그런 날, 하루 평균 야외에 있던 시간은?', '[P3] 비타민D를 위해 햇빛을 하루 몇 분 쬐어야 한다고 생각하나요?',
      '[K1] 유리창을 통과한 햇빛으로도 피부에서 비타민D가 만들어진다.',
      '[K2] 피부가 붉어지기 시작하는 시간이 되기 전에 햇빛 쬐기를 멈추는 것이 안전하다.',
      '[K3] 비타민D 생성에는 아침·저녁보다 한낮의 햇빛이 유리하다.'];
    var rows = [head];
    for (var i = 0; i < 30; i++) rows.push(['2026/10/04 20:1' + (i % 10),
      pick(r, ['10대', '20대', '30대', '40대 이상'], [2, 22, 4, 2]), pick(r, ['여', '남', '응답 안 함'], [14, 13, 3]),
      pick(r, ['예', '아니오'], [6, 24]), pick(r, [0, 1, 2, 3, 4, 5], [5, 8, 7, 5, 3, 2]),
      pick(r, T.slice(0, 5), [7, 10, 7, 4, 2]), pick(r, T, [4, 6, 5, 3, 5, 7]),
      pick(r, TF, [11, 12, 7]), pick(r, TF, [16, 6, 8]), pick(r, TF, [15, 7, 8])]);
    return csv(rows);
  }

  function postCsv() {
    var r = rng(23), head = ['타임스탬프',
      '[P1] 지난 7일 중, 낮 시간(10~15시)에 야외에서 15분 이상 있었던 날은 며칠인가요?',
      '[P2] 그런 날, 하루 평균 야외에 있던 시간은?', '[P3] 비타민D를 위해 햇빛을 하루 몇 분 쬐어야 한다고 생각하나요?',
      '[K1] 유리창을 통과한 햇빛으로도 피부에서 비타민D가 만들어진다.',
      '[K2] 피부가 붉어지기 시작하는 시간이 되기 전에 햇빛 쬐기를 멈추는 것이 안전하다.',
      '[K3] 비타민D 생성에는 아침·저녁보다 한낮의 햇빛이 유리하다.'];
    for (var s = 1; s <= 10; s++) head.push('[S' + s + '] SUS ' + s);
    head.push('[M1] 앱에 전반적으로 만족하시나요?', '[M2] 앞으로도 계속 사용할 의향이 있나요?', '[M3] 다른 사람에게 추천하시겠어요?',
      '[F1] 햇빛을 쬐는 것에 더 신경 쓰게 되었다.', '[F2] 야외에 나가는 날이 늘었다고 느낀다.',
      '[F3] 컨디션(피로·기분)이 나아졌다고 느낀다.', '[X1] 타이머를 켜지 않고 낮에 야외에 나간 날이 있었나요?',
      '[O1] 가장 불편했던 점', '[O2] 가장 좋았던 점');
    var o1 = ['타이머를 켜 두는 걸 자주 잊었어요', '날씨가 흐린 날에도 시간이 떠서 헷갈렸어요', '', '알림이 조금 늦게 와요', '', ''];
    var o2 = ['몇 분만 쬐면 되는지 바로 알려 줘서 좋았어요', '스탬프 모으는 재미가 있어요', '', '화상 한계 시간을 알려 줘서 안심됐어요', '', ''];
    var rows = [head];
    for (var i = 0; i < 28; i++) {
      var row = ['2026/11/02 19:2' + (i % 10), pick(r, [0, 1, 2, 3, 4, 5, 6], [1, 3, 6, 7, 6, 3, 2]),
        pick(r, T.slice(0, 5), [2, 8, 11, 5, 2]), pick(r, T, [2, 12, 8, 3, 1, 2]),
        pick(r, TF, [4, 23, 1]), pick(r, TF, [25, 2, 1]), pick(r, TF, [24, 3, 1])];
      for (s = 1; s <= 10; s++) row.push(s % 2 ? pick(r, [2, 3, 4, 5], [1, 4, 12, 9]) : pick(r, [1, 2, 3, 4], [11, 11, 4, 1]));
      row.push(pick(r, [2, 3, 4, 5], [1, 6, 13, 8]), pick(r, [2, 3, 4, 5], [2, 8, 11, 7]), pick(r, ['예', '아니오'], [21, 7]),
        pick(r, [2, 3, 4, 5], [2, 6, 12, 8]), pick(r, [2, 3, 4, 5], [3, 8, 11, 6]), pick(r, [1, 2, 3, 4, 5], [2, 6, 12, 6, 2]),
        pick(r, ['없음', '가끔', '자주'], [9, 14, 5]), o1[i % o1.length], o2[i % o2.length]);
      rows.push(row);
    }
    return csv(rows);
  }

  return { data: data, preCsv: preCsv, postCsv: postCsv };
})();
