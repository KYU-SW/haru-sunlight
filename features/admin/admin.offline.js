/* =========================================================
   관리자 대시보드 — 현장에서 모은 기록 (참가자별 요약)
   화면과 무관한 순수 함수. 앱의 타이머 기록(sessions)과 모양이 달라 따로 둔다.

   저장 위치: Firestore offline/{익명 ID} — 관리자만 읽고 쓴다(firestore.rules).
   관리자가 설정 탭에서 익명화한 파일(offline-records.json)을 올리면 여기서 검사한 뒤 저장한다.
   참가자 기록은 코드 · 저장소에 넣지 않는다(admin.html은 공개 주소라 누구나 읽을 수 있다).

   한 사람의 모양
     { id, records, setRate, goalDone, goalTotal, completer, before, after, exceptions: { 종류: 횟수 } }
       id         익명 ID (원래 이름·번호와 이어지지 않는 임의 문자, 영문 소문자·숫자 4~12자)
       records    모은 기록 수        setRate    타이머를 맞춘 비율(0~100)
       goalDone   목표를 채운 기록 수 / goalTotal 전체 기록 수
       before·after  앱을 쓰기 전·후 평균 지연(분)
   ========================================================= */
var AdminOffline = (function () {

  /* 예외 이름 → 화면에 보일 말 */
  var EXC = {
    late_over_5min: '5분 넘게 지연',
    timer_not_set: '타이머 안 맞춤',
    missed_confirmation: '확인 놓침',
    timer_reset: '타이머 다시 맞춤'
  };
  var EXC_ORDER = ['late_over_5min', 'timer_not_set', 'missed_confirmation', 'timer_reset'];

  /* 지연(분) 구간 — 아래쪽 값은 포함, 위쪽 값은 미포함 */
  var BINS = [[0, 5, '5분 미만'], [5, 10, '5~10분'], [10, 15, '10~15분'], [15, Infinity, '15분 이상']];

  function fin(x) { x = +x; return isFinite(x) ? x : null; }

  /* 파일 글 → 참가자 목록. 형식이 틀리면 몇 번째 줄이 문제인지 알려 주는 Error를 던진다. */
  function parse(text) {
    var d = JSON.parse(text);
    var arr = Array.isArray(d) ? d : (d && d.participants);
    if (!Array.isArray(arr) || !arr.length) throw new Error('참가자 기록이 없어요');
    var seen = {};
    return arr.map(function (r, i) {
      var at = (i + 1) + '번째 줄';
      if (!r || typeof r !== 'object') throw new Error(at + ' 형식이 맞지 않아요');
      var id = String(r.id === undefined ? '' : r.id).toLowerCase();
      if (!/^[a-z0-9]{4,12}$/.test(id)) throw new Error(at + ' 익명 ID는 영문 소문자·숫자 4~12자여야 해요');
      if (seen[id]) throw new Error(at + ' 익명 ID가 겹쳐요');
      seen[id] = 1;
      var records = fin(r.records), goalDone = fin(r.goalDone), goalTotal = fin(r.goalTotal),
        setRate = fin(r.setRate), before = fin(r.before), after = fin(r.after);
      if ([records, goalDone, goalTotal, setRate, before, after].some(function (v) { return v === null || v < 0; }))
        throw new Error(at + ' 숫자가 비었거나 맞지 않아요');
      if (goalDone > goalTotal) throw new Error(at + ' 목표 완료가 전체보다 많아요');
      if (records > 1000 || goalTotal > 1000 || setRate > 100 || before > 1440 || after > 1440)
        throw new Error(at + ' 숫자가 너무 커요');
      var exc = {};
      if (r.exceptions && typeof r.exceptions === 'object') {
        Object.keys(r.exceptions).forEach(function (k) {
          var n = fin(r.exceptions[k]);
          if (EXC[k] && n > 0) exc[k] = Math.round(n);        // 모르는 종류는 버린다
        });
      }
      return {
        id: id, records: Math.round(records), setRate: Math.min(100, setRate),
        goalDone: Math.round(goalDone), goalTotal: Math.round(goalTotal),
        completer: r.completer === true || r.completer === 'O',
        before: before, after: after, exceptions: exc
      };
    });
  }

  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function mean(a) { return a.length ? sum(a) / a.length : NaN; }

  function change(before, after) { return before > 0 ? (before - after) / before : null; }   // 양수 = 지연이 줄었다

  /* 참가자 목록 → 화면에 쓸 집계 */
  function summary(list) {
    var people = list.map(function (p) {
      return {
        id: p.id, records: p.records, setRate: p.setRate, goalDone: p.goalDone, goalTotal: p.goalTotal,
        goalRate: p.goalTotal ? p.goalDone / p.goalTotal : null, completer: p.completer,
        before: p.before, after: p.after, change: change(p.before, p.after), exceptions: p.exceptions
      };
    });
    var before = people.map(function (p) { return p.before; }), after = people.map(function (p) { return p.after; });
    var mb = mean(before), ma = mean(after);

    function bins(vals) {
      return BINS.map(function (b) { return { label: b[2], n: vals.filter(function (v) { return v >= b[0] && v < b[1]; }).length }; });
    }
    var exc = EXC_ORDER.map(function (k) {
      var who = people.filter(function (p) { return p.exceptions[k]; });
      return { key: k, label: EXC[k], times: sum(who.map(function (p) { return p.exceptions[k]; })), people: who.length };
    });

    return {
      n: people.length, records: sum(people.map(function (p) { return p.records; })),
      goalDone: sum(people.map(function (p) { return p.goalDone; })), goalTotal: sum(people.map(function (p) { return p.goalTotal; })),
      completers: people.filter(function (p) { return p.completer; }).length,
      setRateMean: mean(people.map(function (p) { return p.setRate; })) / 100,
      beforeMean: mb, afterMean: ma, change: change(mb, ma),
      shorter: people.filter(function (p) { return p.after < p.before; }).length,
      longer: people.filter(function (p) { return p.after > p.before; }).length,
      beforeBins: bins(before), afterBins: bins(after),
      exceptions: exc, people: people
    };
  }

  /* Firestore에 저장할 모양 (id는 문서 ID로 쓴다) */
  function toDoc(p) {
    var exc = {};
    Object.keys(p.exceptions || {}).forEach(function (k) { exc[k] = p.exceptions[k]; });
    return { records: p.records, setRate: p.setRate, goalDone: p.goalDone, goalTotal: p.goalTotal,
      completer: !!p.completer, before: p.before, after: p.after, exceptions: exc };
  }

  return { parse: parse, summary: summary, toDoc: toDoc, EXC: EXC };
})();
