/* =========================================================
   core / 적응형 개인화 — 못 쬔 이유 → 조치 → 효과 확인 → 안 되면 다음 조치
   DOM 접근 없음. 상태는 프로필 fix = { reason, step, week, baseRate, done } 하나.

   흐름 (한 주에 질문은 하나만 — Rouvere 외 2025: 질문이 늘면 이탈이 는다)
     ① 이유를 고르면 그 이유의 1단계 조치를 켠다. 지난번과 같은 이유면 다음 단계로 (반복 → 처방 자체를 바꾼다)
     ② 다음 주에는 "그 조치가 도움이 됐나요?"를 묻는다 — 답 + 실제 기록(목표 채운 비율)을 같이 본다
        · 도움 됐다고 하거나 비율이 올랐으면 그대로 두고 확인을 끝낸다 (그다음 주엔 다시 이유를 묻는다)
        · 둘 다 아니면 다음 단계 조치로 바꾸고 한 주 뒤에 또 확인한다 (마지막 단계면 끝내고 이유를 다시 묻는다)
   근거 (CALCULATION.md 11장)
     · 반응 없으면 바꾸고 · 있으면 유지: SMART 신체활동 연구 고찰 (Whiston 외 2024)
     · 반응을 보고 고른 메시지 > 같은 메시지: DIAMANTE 무작위 대조시험 (Aguilera 외 2024)
     · 짧게 자주도 유지 가능: 여름 5~10분 · 일주일 대부분 날 (Elliott 외 2024)
   ========================================================= */
var Adapt = (function () {

  /* 이유별 조치 단계 — 앞에서부터 차례로 */
  var LADDER = {
    time:    ['course12', 'split'],
    forgot:  ['notify', 'notifyEarly'],
    weather: ['outdoorLight', 'courseLight'],
    burn:    ['burnNote', 'skinCheck'],
    lazy:    ['course', 'split']
  };
  /* 화면에 보일 조치 이름 */
  var NAME = {
    course12: '12주 코스 추천', split: '짧게 나눠 쬐기', notify: '햇빛 알림', notifyEarly: '30분 전 알림',
    outdoorLight: '흐린 날 바깥 빛 안내', courseLight: '회복 코스 겨울 미션', burnNote: '화상 한계 시간 표시',
    skinCheck: '피부 타입 다시 확인', course: '회복 코스'
  };

  function last(reason) { return (LADDER[reason] || []).length - 1; }

  /* 지금 켜져 있는 조치 이름 (없으면 null) */
  function current(fix) {
    if (!fix || !LADDER[fix.reason]) return null;
    return LADDER[fix.reason][Math.min(fix.step || 0, last(fix.reason))];
  }

  /* ① 이유를 골랐을 때 — 같은 이유가 또 나오면 다음 단계 */
  function onReason(prev, reason, week, baseRate) {
    if (!LADDER[reason]) return null;                       // 'none' — 조치 없음
    var step = prev && prev.reason === reason ? Math.min((prev.step || 0) + 1, last(reason)) : 0;
    return { reason: reason, step: step, week: week, baseRate: baseRate, done: false };
  }

  /* 이번 팝업에서 확인 질문을 할 차례인지 — 조치를 켠 주(fix.week) 바로 다음 주를 지난주로 볼 때 */
  function needCheck(fix, lastWeek) {
    return !!(fix && !fix.done && LADDER[fix.reason] && fix.week === Report.addDays(lastWeek, -7));
  }

  /* ② 확인 질문에 답했을 때 — afterRate: 지난주(조치를 켠 뒤 한 주) 목표 채운 비율
     돌려주는 값 { fix: 새 상태, result: 'kept' | 'next' | 'end', improved } */
  function onCheck(fix, helped, afterRate, lastWeek) {
    var improved = afterRate != null && fix.baseRate != null && afterRate > fix.baseRate;
    if (helped || improved) return { fix: assign(fix, { done: true }), result: 'kept', improved: improved };
    if ((fix.step || 0) < last(fix.reason)) {
      return { fix: assign(fix, { step: (fix.step || 0) + 1, week: lastWeek, baseRate: afterRate }), result: 'next', improved: false };
    }
    return { fix: assign(fix, { done: true }), result: 'end', improved: false };
  }

  function assign(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }

  /* 짧게 나눠 쬐기 — 6분 이상이면 두 번으로 (반올림 올림) */
  function split(minutes) { return minutes >= 6 ? Math.ceil(minutes / 2) : null; }

  return { LADDER: LADDER, NAME: NAME, current: current, onReason: onReason, needCheck: needCheck, onCheck: onCheck, split: split };
})();
