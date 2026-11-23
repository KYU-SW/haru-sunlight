/* =========================================================
   기능: 지난주 돌아보기 — 타이머가 끝난 뒤 한 주에 한 번 뜨는 가운데 팝업
   ① 비교: "다른 사람들은 평균 55% 채웠는데, 나는 67% 채웠어요" — 하루 목표를 채운 비율 한 줄 (그래프 없음)
      다른 사람 평균은 Firestore stats/latest (관리자 대시보드가 올림, 3명 이상일 때만)
   ② 질문: "햇빛을 못 쬔 날, 가장 큰 이유는?" (시간 · 깜빡 · 날씨 · 탈까 봐 · 귀찮아서)
      → 개선: 이유에 맞게 앱이 바뀐다 — 12주 코스 추천 · 알림 켜기 · 흐린 날 바깥 빛 안내 · 화상 한계 표시 · 회복 코스
      → 확인: 다음 주 팝업에서 "그 뒤로 40% → 60%" (프로필 barrier · barrierWeek)
      → 분석: Firestore surveys/{uid}_{주 월요일} · 관리자 대시보드에 이유별 응답과 다음 주 변화
   계산은 core/report.js
   ========================================================= */
var ReportView = (function () {

  var stats = null;

  /* 못 쬔 이유 — 값은 firestore.rules 의 answer 목록과 같다 */
  var REASONS = [
    ['time',    '⏰', '시간이 없어서'],
    ['forgot',  '💭', '깜빡해서'],
    ['weather', '🌧️', '날씨 탓'],
    ['burn',    '🧴', '탈까 봐'],
    ['lazy',    '🛋️', '귀찮아서'],
    ['none',    '🙌', '다 채웠어요']
  ];
  var NAME = { time: '시간이 없어서', forgot: '깜빡해서', weather: '날씨가 안 좋아서', burn: '탈까 봐 걱정돼서', lazy: '나가기 귀찮아서' };
  /* 이유별로 앱이 바꾸는 것 — t: 안내 · btn/act: 바로 할 일 (없으면 '확인'만) */
  function fix(a) {
    if (a === 'time')    return { t: '회복 코스 추천을 요일을 고르는 12주 코스로 바꿔 둘게요', btn: '12주 코스 보기', act: 'course' };
    if (a === 'forgot')  return Repo.getProfile().notify
      ? { t: '알림이 켜져 있어요. 햇빛 시간 15분 전에 알려 드릴게요' }
      : { t: '햇빛 시간 15분 전에 알림으로 알려 드릴게요', btn: '알림 켜기', act: 'notify' };
    if (a === 'weather') return { t: '햇빛 시간이 없는 날엔 홈에서 바깥 빛 20~30분으로 대신하도록 알려 드릴게요' };
    if (a === 'burn')    return { t: '홈 처방에 피부가 빨개지기까지 남은 시간을 같이 보여 드릴게요' };
    if (a === 'lazy')    return { t: '하루 하나씩 할 일을 정해 주는 회복 코스를 해 보세요', btn: '회복 코스 보기', act: 'course' };
    return { t: '지난주처럼만 이어 가요' };
  }

  function today() { return Engine.dayKey(new Date()); }
  function seen() { try { return JSON.parse(localStorage.getItem('sunrx.reportSeen')) || {}; } catch (e) { return {}; } }
  function markSeen(week, answer) {
    try { localStorage.setItem('sunrx.reportSeen', JSON.stringify({ week: week, answer: answer || null, at: Date.now() })); } catch (e) {}
  }

  /* force — 이미 '봤다'고 표시한 뒤에도 내용을 만들 때 */
  function model(force) {
    var r = Report.lastWeek(today());
    var me = Report.mine(Repo.getSessions(), r);
    return { range: r, me: me, cmp: Report.compare(me, stats), show: !!me && (force || seen().week !== r.week) };
  }

  function tf(e) { return '<span class="tf">' + e + '</span>'; }

  /* 다른 사람과 비교 — 큰 문장 하나 (하루 목표를 채운 비율) */
  function compareHtml(m) {
    var me = m.me, c = m.cmp;
    if (!c) return '<div class="rp-big">지난주 하루 목표를<br><b>' + me.days + '일 중 ' + me.goalDays + '일</b> 채웠어요</div>';
    return '<div class="rp-big">다른 사람들은 평균 ' + c.avg + '% 채웠는데,<br>나는 <b>' + me.goalRate + '%</b> 채웠어요</div>';
  }

  /* 지난번에 고른 이유 → 그 뒤로 바뀐 것 (지난번 주 vs 지난주) */
  function followHtml(m) {
    var p = Repo.getProfile();
    if (!p.barrier || !NAME[p.barrier] || p.barrierWeek !== Report.addDays(m.range.week, -7)) return '';
    var before = Report.mine(Repo.getSessions(), { week: p.barrierWeek, start: p.barrierWeek, end: Report.addDays(p.barrierWeek, 6) });
    if (!before) return '';
    var d = m.me.goalRate - before.goalRate;
    return '<div class="rp-follow">지난번엔 \'' + NAME[p.barrier] + '\'라고 하셨죠. 그 뒤로 ' + before.goalRate + '% → <b>' + m.me.goalRate + '%</b>' +
      (d > 0 ? ' 늘었어요' : d < 0 ? ' 줄었어요' : ' 그대로예요') + '</div>';
  }

  function questionHtml(m) {
    var full = m.me.goalDays === m.me.days;
    var list = full ? [REASONS[5]].concat(REASONS.slice(0, 5)) : REASONS.slice(0, 5);
    return '<div class="rp-q">' + (full ? '다 채웠어요! 그래도 힘들었던 게 있다면?' : '햇빛을 못 쬔 날, 가장 큰 이유는?') + '</div>' +
      '<div class="rp-a">' + list.map(function (r) {
        return '<button class="rp-b" data-a="' + r[0] + '">' + tf(r[1]) + '<span>' + r[2] + '</span></button>';
      }).join('') + '</div>';
  }

  function modal() {
    var bg = document.getElementById('rp-modal');
    if (!bg) {
      bg = document.createElement('div');
      bg.className = 'tc-modal-bg rp-bg';
      bg.id = 'rp-modal';
      (document.querySelector('.phone') || document.body).appendChild(bg);
    }
    bg.onclick = function (e) { if (e.target === bg) close(); };
    return bg;
  }
  function close() { var bg = document.getElementById('rp-modal'); if (bg) bg.classList.remove('show'); }

  function show(m) {
    var bg = modal();
    bg.innerHTML =
      '<div class="tc-modal rp-m" role="dialog" aria-modal="true" aria-labelledby="rp-title" id="h-report">' +
        '<div class="rp-top"><span class="rp-k" id="rp-title">지난주 돌아보기</span>' +
          '<button class="rp-x" id="h-report-x" aria-label="닫기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
        compareHtml(m) + followHtml(m) +
        '<div id="rp-step">' + questionHtml(m) + '</div>' +
      '</div>';
    bg.classList.add('show');
    document.getElementById('h-report-x').onclick = close;
    bindAnswers(m.range.week);
  }

  function bindAnswers(week) {
    [].forEach.call(document.querySelectorAll('#h-report .rp-b'), function (b) {
      b.onclick = function () {
        if (b.disabled) return;
        [].forEach.call(document.querySelectorAll('#h-report .rp-b'), function (o) { o.disabled = true; });
        b.classList.add('on');
        var a = b.dataset.a;
        /* 고른 이유를 기기에 남긴다 — 앱이 그에 맞게 바뀌고(추천 · 홈 문구), 다음 주 팝업에서 그 뒤로 얼마나 바뀌었는지 보여 준다 */
        Repo.setProfile(a === 'none' ? { barrier: null, barrierWeek: null } : { barrier: a, barrierWeek: week });
        App.invalidate();
        var send = window.Sync && Sync.sendSurvey ? Sync.sendSurvey(week, a) : Promise.reject(new Error('no-sync'));
        send.then(function () { markSeen(week, a); }, function () { /* 못 보내도 기기에는 반영 */ })
          .then(function () { tip(a); });
      };
    });
  }

  function tip(a) {
    var step = document.getElementById('rp-step');
    if (!step) return;
    var F = fix(a);
    step.innerHTML = '<div class="rp-tip">' + F.t + '</div>' +
      '<div class="tc-m-btns">' +
        (F.act ? '<button class="btn btn-sub" id="rp-later">나중에</button><button class="btn btn-primary" id="rp-go">' + F.btn + '</button>'
               : '<button class="btn btn-primary" id="rp-later">확인</button>') +
      '</div>';
    document.getElementById('rp-later').onclick = function () { close(); App.refreshView(); };
    if (document.getElementById('rp-go')) document.getElementById('rp-go').onclick = function () {
      close();
      if (F.act === 'notify') return App.enableNotify();
      if (F.act === 'course') return App.go('course');
    };
  }

  /* 타이머가 끝난 뒤 — 이번 주에 아직 안 봤고 지난주 기록이 있으면 띄운다.
     다른 사람 평균은 최대 3초 기다리고, 못 받으면 내 기록만 보여 준다. 띄우면 그 주엔 다시 안 띄운다 */
  function afterTimer() {
    var m = model();
    if (!m.show) return Promise.resolve(false);
    markSeen(m.range.week);
    var wait = (window.Sync && Sync.weeklyStats)
      ? Promise.race([Sync.weeklyStats(), new Promise(function (r) { setTimeout(function () { r(null); }, 3000); })])
      : Promise.resolve(null);
    return wait.then(function (s) {
      if (s && s.week === m.range.week) stats = s;
      show(model(true));
      return true;
    });
  }

  return { afterTimer: afterTimer, model: model, REASONS: REASONS.map(function (r) { return r[0]; }) };
})();
