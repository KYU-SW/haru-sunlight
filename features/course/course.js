/* =========================================================
   기능: 회복 코스 — 하단 '회복 코스' 탭
   계산은 core/course.js, 기록은 Repo.getCourses()(기기 저장) — 두 코스를 같이 할 수 있다.

   화면 흐름
     코스 고르기(카드 2장) → 카드를 누르면 그 코스의 소개(왜 8주 / 왜 12주, 애니메이션)
     → 마지막 장에서 시작 → 진행 중(오늘 할 일 · 진행 · 기록) → 끝(첫 2주 vs 마지막 2주)
   홈의 코스 카드도 이 탭으로 들어온다.
   ========================================================= */
var CourseService = (function () {

  function todayKey() { return Engine.dayKey(new Date()); }

  /* 하고 있는 코스 — Course.ORDER 순서 (8주 · 12주) */
  function list() { var all = Repo.getCourses(); return Course.ORDER.filter(function (t) { return all[t] && all[t].start; }); }
  function get(type) { return Repo.getCourses()[type] || null; }

  function start(type) {
    Repo.setCourseOf(type || 'daily8', { start: todayKey(), days: {} });
    note(App.prescription());
  }

  /* type 이 없으면 전부 그만둔다 */
  function stop(type) {
    if (type) return Repo.setCourseOf(type, null);
    Repo.setCourse(null);
  }

  /* 오늘 미션 종류를 적어 둔다 — 한 번 정해지면 그날은 바꾸지 않는다 (하는 코스 모두)
     (저녁에 예보가 밤 시간만 남아도 낮에 정한 미션이 그대로 남도록) */
  function note(rx) {
    if (!rx) return;
    var kind = Course.kindFor(rx);
    if (!kind) return;
    list().forEach(function (t) {
      var c = get(t), k = rx.dateKey;
      c.days = c.days || {};
      if (c.days[k] && c.days[k].kind) return;
      c.days[k] = c.days[k] || {};
      c.days[k].kind = kind;
      Repo.setCourseOf(t, c);
    });
  }

  /* 겨울 미션 — 낮에 바깥에서 빛을 받고 왔다고 스스로 체크 (Joh 2020의 '햇빛 일지'와 같은 방식)
     하루 할 일은 같은 햇빛이라 하는 코스 모두에 같이 체크한다 */
  function checkLight(on) {
    var k = todayKey();
    list().forEach(function (t) {
      var c = get(t);
      c.days = c.days || {};
      c.days[k] = c.days[k] || {};
      c.days[k].light = on !== false;
      Repo.setCourseOf(t, c);
    });
  }

  /* type 이 없으면 첫 번째로 하는 코스 (없으면 시작 전 모습) */
  function model(type) {
    var t = type || list()[0];
    return Course.model(t ? get(t) : null, Repo.getDaily(), todayKey());
  }
  function models() { return list().map(function (t) { return model(t); }); }

  return { start: start, stop: stop, note: note, checkLight: checkLight, model: model, models: models, list: list, get: get };
})();


var CourseView = (function () {

  var el;
  var tourType = null, tourStep = 0;     // 소개를 보는 중인 코스 · 몇 번째 장
  var showType = null;                   // 두 코스를 같이 할 때 지금 보는 코스
  var picking = false;                   // 코스를 하는 중에 '코스 고르기'로 다시 돌아온 상태

  function open() { App.go('course'); }
  function tf(e) { return '<span class="tf">' + e + '</span>'; }

  /* ---------- 오늘 할 일 문구 ---------- */
  function mission(m) {
    var t = m.today;
    if (!t) return { title: '', body: '' };
    if (t.state === 'done') return { title: '오늘 할 일을 마쳤어요', body: m.type.weekly ? '이번 주 ' + m.weekDone + '/' + m.weekGoal + '번' : '내일 또 봐요' };
    if (m.type.weekly && m.weekMet) return { title: '이번 주 목표 다 채웠어요', body: '더 쬐어도 괜찮아요. 다음 주에 또 봐요' };
    if (t.kind === 'light') return {
      title: '낮에 바깥에서 <b>' + Course.LIGHT_MIN + '~' + Course.LIGHT_MAX + '분</b>',
      body: '오늘은 해가 약해서 비타민D는 잘 안 생겨요. 그래도 나가서 밝은 빛 받고 오면 오늘 할 일 끝이에요'
    };
    if (t.kind === 'rest') return { title: '오늘은 쉬는 날이에요', body: m.type.weekly ? '오늘은 쬘 시간이 없어요. 이번 주 다른 날에 하면 돼요' : '오늘은 기록에서 빠지니까 신경 안 써도 돼요' };
    if (t.kind === 'vitd') return { title: '오늘 처방 시간 <b>다 채우기</b>', body: '홈에서 타이머 켜고 쬐면 알아서 체크돼요' };
    return { title: '오늘 할 일은 아직이에요', body: '낮 예보가 들어오면 정해 드릴게요' };
  }

  function weekText(m) { return m.type.weekly ? '이번 주 <b>' + m.weekDone + '</b>/' + m.weekGoal + '번' : '이번 주 <b>' + m.weekDone + '</b>/7'; }

  /* ---------- 홈 카드 — 하는 코스마다 하나 ---------- */
  function homeCard() {
    return CourseService.models().map(oneHomeCard).join('');
  }
  function oneHomeCard(m) {
    var id = m.type.id;
    if (m.finished) {
      return '<button class="ha-t cs-home cs-home-go" data-type="' + id + '">' +
        '<div class="cs-home-h"><span class="ha-lab">회복 코스</span>' + UI.ICON.right + '</div>' +
        '<div class="cs-home-t">' + m.type.name + '를 마쳤어요 · <b>결과 보기</b></div>' +
      '</button>';
    }
    var t = m.today, ms = mission(m);
    var canCheck = t.kind === 'light' && t.state !== 'done' && !(m.type.weekly && m.weekMet);
    return '<section class="ha-t cs-home">' +
      '<button class="cs-home-h cs-home-go" data-type="' + id + '"><span class="ha-lab">' + m.type.name + ' · ' + m.week + '주차</span>' +
        '<span class="cs-home-v">' + weekText(m) + UI.ICON.right + '</span></button>' +
      '<div class="cs-home-t' + (t.state === 'done' ? ' done' : '') + '">' + ms.title + '</div>' +
      '<div class="cs-home-b">' + ms.body + '</div>' +
      (canCheck ? '<button class="ha-cta cs-check cs-home-check">다녀왔어요</button>' : '') +
    '</section>';
  }

  function bindHome() {
    [].forEach.call(document.querySelectorAll('#screen-home .cs-home-go'), function (b) {
      b.onclick = function () { showType = b.dataset.type; open(); };
    });
    [].forEach.call(document.querySelectorAll('#screen-home .cs-home-check'), function (b) {
      b.onclick = function () {
        CourseService.checkLight(true);
        UI.toast('체크했어요. 오늘 할 일 끝!');
        App.refreshView();
      };
    });
  }

  /* =========================================================
     코스별 내용 — 카드 · 소개(왜 이 기간인지) · 근거 시트
     숫자 공식은 넣지 않는다 (CALCULATION.md 10장)
     ========================================================= */
  var INFO = {
    daily8: {
      emoji: '☀️',
      pitch: '매일 조금씩, 8주 동안 쭉. 우리나라 연구 그대로예요',
      tags: ['매일', '8주 · 56일', '국내 연구'],
      tour: [
        { art: artSun,
          t: '햇빛, 쬐면 늘어요.<br>근데 <b>꾸준히</b>가 어렵죠',
          b: '서울 20~30대 150명을 8주 동안 지켜봤더니, 빠지지 않고 쬔 사람만 확실히 늘었어요.',
          s: 'Joh 외 2020 · Clinical Nutrition' },
        { art: function () { return artTimeline(8, 8, '습관이 자리 잡는 때'); },
          t: '왜 하필 <b>8주</b>일까요?',
          b: '그 연구가 딱 8주였어요. 그리고 새 습관이 몸에 붙는 데 보통 두 달쯤(59~66일) 걸려요.',
          s: 'Joh 외 2020 · Singh 외 2024' },
        { art: function () { return artVs('주 3번 · 1달', '거의 그대로', 18, '매일 · 8주', '올랐어요', 78); },
          t: '한 달이면<br><b>안 될까요?</b>',
          b: '대구에서 20~40대가 한 달 동안 주 3번 쬐어 봤는데, 비타민D가 거의 그대로였어요.',
          s: 'Lee 외 2020 · J Korean Med Sci' },
        { art: artMissions,
          t: '할 일은<br><b>하루에 딱 하나</b>',
          b: '날씨 보고 앱이 정해 드려요. 해가 약한 겨울엔 바깥 빛만 받고 와도 돼요.',
          s: 'Brown 외 2022 · PLoS Biology' },
        { art: function () { return artDots(56); },
          t: '8주 뒤엔<br><b>처음이랑 비교</b>해 봐요',
          b: '첫 2주랑 마지막 2주에 얼마나 잘 지켰는지 나란히 보여 드려요.',
          s: '' }
      ],
      evidence: [
        { t: '왜 8주인가요?',
          b: '서울 20~30대가 8주 동안 매일 점심때 햇빛을 쬐었더니 비타민D가 늘었어요. 단, 빼먹지 않은 사람만 확실히 늘었어요.',
          s: 'Joh 외 2020 · Clinical Nutrition — 서울 18~39세 150명 무작위 대조시험' },
        { t: '습관이 되려면',
          b: '새 습관이 몸에 붙는 데 보통 두 달쯤(59~66일) 걸려요. "21일이면 습관 된다"는 말은 근거가 없대요.',
          s: 'Singh 외 2024 · Healthcare — 연구 20편 · 2,601명 종합' },
        { t: '한 달이면 안 될까요?',
          b: '주 3번씩 한 달 쬔 사람들은 비타민D가 거의 그대로였어요. 연구진도 이 정도로는 부족하다고 했어요.',
          s: 'Lee 외 2020 · J Korean Med Sci — 대구 20~49세 60명 무작위 대조시험' },
        { t: '겨울엔 왜 바깥 빛인가요?',
          b: '해가 약한 날엔 비타민D가 잘 안 생겨요. 그래도 바깥은 실내보다 훨씬 밝아서, 낮엔 바깥 빛부터 받으라고 해요.',
          s: 'Brown 외 2022 · PLoS Biology — 빛 전문가 합의 권고' }
      ]
    },
    load12: {
      emoji: '🔋',
      pitch: '매일은 힘들다면. 첫 한 달만 주 3번 하면 돼요',
      tags: ['주 3번 → 주 1번', '12주', '요일 자유'],
      tour: [
        { art: artLoad,
          t: '처음엔 <b>자주</b>,<br>그다음엔 <b>가끔</b>',
          b: '첫 4주는 주 3번, 나머지 8주는 주 1번이에요. 무슨 요일에 할지는 편한 대로 해요.',
          s: '' },
        { art: function () { return artTimeline(12, 12, '97%가 충분 수준'); },
          t: '왜 하필 <b>12주</b>일까요?',
          b: '영국 젊은 남성 137명이 딱 이렇게 12주를 했더니, 거의 다(97%) 비타민D가 충분해졌어요.',
          s: 'Carswell 외 2018 · Med Sci Sports Exerc' },
        { art: function () { return artVs('1달에서 멈추면', '거의 그대로', 18, '8주 더 이어 가면', '유지돼요', 78); },
          t: '한 달 하고<br><b>끝내면 안 돼요?</b>',
          b: '한 달만 하면 거의 안 오른다는 국내 연구가 있어요. 그래서 그 뒤에도 주 1번은 이어 가요.',
          s: 'Lee 외 2020 · J Korean Med Sci' },
        { art: artMissions,
          t: '하는 날엔<br><b>날씨 보고</b> 하나',
          b: '해가 좋으면 처방 시간 채우기, 겨울엔 바깥 빛 받기. 비 오거나 너무 더우면 다른 날로 미뤄요.',
          s: 'Brown 외 2022 · PLoS Biology' },
        { art: function () { return artDots(12, true); },
          t: '12주 뒤엔<br><b>처음이랑 비교</b>해 봐요',
          b: '첫 2주랑 마지막 2주에 목표를 얼마나 채웠는지 보여 드려요.',
          s: '' }
      ],
      evidence: [
        { t: '왜 12주 · 주 3번 → 주 1번인가요?',
          b: '영국 젊은 남성 137명이 첫 4주는 주 3번, 그다음 8주는 주 1번 햇빛 같은 빛을 쬐었더니 97%가 충분해졌어요.',
          s: 'Carswell 외 2018 · Med Sci Sports Exerc — 영국 군 신병 무작위 대조시험 (겨울, 햇빛과 같은 빛의 램프 사용)' },
        { t: '한 달 하고 끝내면 안 돼요?',
          b: '대구에서 20~40대가 주 3번씩 한 달 쬐어 봤는데 비타민D가 거의 그대로였어요.',
          s: 'Lee 외 2020 · J Korean Med Sci — 대구 20~49세 60명 무작위 대조시험' },
        { t: '겨울엔 왜 바깥 빛인가요?',
          b: '해가 약한 날엔 비타민D가 잘 안 생겨요. 그래도 바깥은 실내보다 훨씬 밝아서, 낮엔 바깥 빛부터 받으라고 해요.',
          s: 'Brown 외 2022 · PLoS Biology — 빛 전문가 합의 권고' }
      ]
    }
  };

  /* ---------- 소개 그림 (CSS 애니메이션) ---------- */
  function artSun() {
    return '<div class="cs-sun"><i class="cs-sun-r"></i><i class="cs-sun-c">' + tf('☀️') + '</i></div>';
  }
  function artMissions() {
    return '<div class="cs-ms">' +
      msRow('☀️', '해가 좋은 날', '처방 시간 채우기') +
      msRow('⛅', '자외선이 약한 날', '바깥 빛 ' + Course.LIGHT_MIN + '~' + Course.LIGHT_MAX + '분') +
      msRow('🌧️', '비 · 폭염', '쉬는 날') + '</div>';
  }
  function msRow(e, k, v) {
    return '<div class="cs-ms-r">' + tf(e) + '<span class="cs-ms-k">' + k + '</span><b>' + v + '</b></div>';
  }
  /* 주차 눈금 — 끝 주에 깃발 */
  function artTimeline(n, mark, label) {
    var s = '';
    for (var i = 1; i <= n; i++) {
      s += '<i class="' + (i === mark ? 'end' : '') + '" style="animation-delay:' + (0.1 + i * 0.06).toFixed(2) + 's"></i>';
    }
    return '<div class="cs-tl"><div class="cs-tl-flag">' + label + '</div><div class="cs-tl-row">' + s + '</div>' +
      '<div class="cs-tl-ax"><span>1주</span><span>' + n + '주</span></div></div>';
  }
  /* 두 방식 비교 — 짧은 막대 vs 긴 막대 */
  function artVs(a, av, ah, b, bv, bh) {
    return '<div class="cs-cmp">' +
      '<div class="cs-cmp-c"><b>' + av + '</b><i style="--h:' + ah + '%"></i><span>' + a + '</span></div>' +
      '<div class="cs-cmp-c now"><b>' + bv + '</b><i style="--h:' + bh + '%"></i><span>' + b + '</span></div></div>';
  }
  /* 12주 막대 — 처음 4주는 높게(주 3번), 다음 8주는 낮게(주 1번) */
  function artLoad() {
    var s = '';
    for (var w = 1; w <= 12; w++) {
      s += '<i class="' + (w <= 4 ? 'hi' : '') + '" style="animation-delay:' + (0.1 + w * 0.07).toFixed(2) + 's"></i>';
    }
    return '<div class="cs-load"><div class="cs-load-row">' + s + '</div>' +
      '<div class="cs-load-ax"><span>1~4주 · 주 3번</span><span>5~12주 · 주 1번</span></div></div>';
  }
  /* 칸이 차오름 — 56칸(매일) 또는 12칸(주) */
  function artDots(n, weeks) {
    var d = '';
    for (var i = 0; i < n; i++) d += '<i style="animation-delay:' + (0.15 + i * (weeks ? 0.09 : 0.025)).toFixed(3) + 's"></i>';
    return '<div class="cs-dots' + (weeks ? ' wk' : '') + '">' + d + '</div>';
  }

  /* ---------- 근거 시트 ---------- */
  function showEvidence(type) {
    var info = INFO[type], T = Course.TYPES[type];
    UI.sheet(T.name + ' 근거', '이 연구들을 보고 만들었어요',
      '<div class="cs-ev">' + info.evidence.map(function (e) {
        return '<div class="cs-ev-i"><div class="cs-ev-t">' + e.t + '</div>' +
          '<div class="cs-ev-b">' + e.b + '</div><div class="cs-ev-s">' + e.s + '</div></div>';
      }).join('') +
      '<div class="cs-ev-n">피검사로 재는 건 아니에요. 병을 고치는 게 아니라, 햇빛 쬐는 습관을 되찾는 코스예요.</div></div>' +
      '<button class="btn btn-primary cs-ev-ok" id="c-ev-ok">확인</button>');
    document.getElementById('c-ev-ok').onclick = function () { UI.closeSheet(); };
  }

  /* =========================================================
     탭 화면
     ========================================================= */
  function render() {
    App.prescription() && CourseService.note(App.prescription());
    el = document.getElementById('screen-course');
    if (tourType) {
      el.innerHTML = tour();
      bindTour();
      return;
    }
    var on = CourseService.list();
    if (!on.length) picking = false;
    if (on.indexOf(showType) < 0) showType = on[0] || null;
    var m = CourseService.model(showType);
    var pick = !on.length || picking;
    el.innerHTML =
      '<div class="an-head cs-head">' +
        (pick && on.length ? '<button class="an-back" id="c-pick-back" aria-label="코스로 돌아가기">' + UI.ICON.back + '</button>' : '') +
        '<div class="an-t">회복 코스</div>' +
        
      '</div>' +
      '<div class="ha-wrap">' +
        (pick ? picker(on) : curRow(on) + (on.length > 1 ? seg(on) : '') + (m.finished ? result(m) : running(m))) +
      '</div>';
    bind(m);
  }

  /* 맨 위 한 줄 — 지금 하는 코스 + 코스 고르기 */
  function curRow(on) {
    var label = on.length > 1 ? '<b>두 코스</b> 하는 중' : '<b>' + Course.TYPES[on[0]].name + '</b> 하는 중';
    return '<button class="cs-cur" id="c-pick">' + tf(INFO[on[0]].emoji) + '<span class="cs-cur-t">' + label + '</span>' +
      '<span class="cs-cur-go">코스 고르기' + UI.ICON.right + '</span></button>';
  }

  /* 두 코스를 같이 할 때 — 맨 위 전환 */
  function seg(on) {
    return '<div class="cs-seg">' + on.map(function (t) {
      return '<button class="cs-seg-b' + (t === showType ? ' on' : '') + '" data-show="' + t + '">' + Course.TYPES[t].name + '</button>';
    }).join('') + '</div>';
  }



  /* ---------- 코스 고르기 — 카드 2장 (추천 코스 카드에 '나에게 추천' 표시 · 이유) ---------- */
  /* ---------- 코스 추천 — 받은 정보(최근 기록 · 나이)로 둘 중 하나 (core/course.js recommend) ---------- */
  function recommendation() {
    var r = Course.recommend(Repo.getProfile(), Repo.getSessions(), Engine.dayKey(new Date()));
    r.why = r.reason === 'time' ? '지난주에 시간이 없었다고 하셨죠. 요일을 골라 주 3번부터 하는 코스가 맞아요'
          : r.reason === 'habit' ? '최근 2주 동안 주 평균 ' + r.perWeek + '일 타이머를 썼어요. 매일 하던 대로 이어 가요'
          : r.reason === 'light' ? '최근 2주 동안 주 평균 ' + r.perWeek + '일 썼어요. 주 3번부터 시작하는 코스가 맞아요'
          : r.reason === 'age' ? '서울 18~39세가 8주 동안 매일 해서 효과를 본 연구와 같은 나이대예요'
          : '처음엔 주 3번부터 가볍게 시작하는 코스가 좋아요';
    return r;
  }

  /* on — 하는 중인 코스 (카드에 '하는 중' · 누르면 그 코스로) */
  function picker(on) {
    on = on || [];
    var rec = recommendation();
    return '<div class="cs-pick-h">' + (on.length ? '하나 더 하거나, 하는 코스로 돌아가요' : '어떤 코스로 해 볼까요?') + '</div>' +

      Course.ORDER.map(function (id, i) {
        var T = Course.TYPES[id], info = INFO[id];
        var doing = on.indexOf(id) >= 0;
        var isRec = !doing && !on.length && rec.type === id;
        return '<button class="ha-t cs-card' + (isRec ? ' rec' : '') + (doing ? ' doing' : '') + '" data-type="' + id + '" style="animation-delay:' + (i * 0.08) + 's">' +
          '<div class="cs-card-top"><span class="cs-card-e">' + tf(info.emoji) + '</span>' +
            (isRec ? '<span class="cs-card-rec">나에게 추천</span>' : '') +
            (doing ? '<span class="cs-card-rec doing">하는 중</span>' : '') +
            '<span class="cs-card-len"><b>' + T.weeks + '</b>주</span></div>' +
          '<div class="cs-card-n">' + T.name + '</div>' +
          '<div class="cs-card-p">' + info.pitch + '</div>' +
          '<div class="cs-card-tags">' + info.tags.map(function (g) { return '<span>' + g + '</span>'; }).join('') + '</div>' +
          '<div class="cs-card-go">' + (doing ? '이 코스로 가기' : '왜 ' + T.weeks + '주인지 보기') + UI.ICON.right + '</div>' +
        '</button>';
      }).join('') +
      (on.length ? '<div class="cs-pick-n">두 코스를 같이 해도 하루 할 일은 한 번에 같이 체크돼요</div>' : '');
  }

  /* ---------- 코스별 소개 (애니메이션) ---------- */
  function tour() {
    var T = Course.TYPES[tourType], steps = INFO[tourType].tour;
    var s = steps[tourStep], last = tourStep === steps.length - 1;
    return '<div class="cs-ob" id="c-ob">' +
      '<div class="cs-ob-top">' +
        '<button class="an-back" id="c-ob-back" aria-label="코스 고르기로">' + UI.ICON.back + '</button>' +
        '<span class="cs-ob-name">' + T.name + '</span>' +
        (last ? '<span class="cs-ob-skip"></span>' : '<button class="cs-ob-skip" id="c-ob-skip">건너뛰기</button>') +
      '</div>' +
      '<div class="cs-ob-body">' +
        '<div class="cs-ob-art">' + s.art() + '</div>' +
        '<div class="cs-ob-t">' + s.t + '</div>' +
        '<div class="cs-ob-b">' + s.b + '</div>' +
        (s.s ? '<div class="cs-ob-s">' + s.s + '</div>' : '') +
      '</div>' +
      '<div class="cs-ob-foot">' +
        '<div class="cs-ob-dots">' + steps.map(function (x, i) {
          return '<i class="' + (i === tourStep ? 'on' : '') + '"></i>';
        }).join('') + '</div>' +
        (last
          ? '<button class="ha-cta" id="c-ob-start">' + T.name + ' 시작</button>' +
            '<button class="cs-link" id="c-ob-ev">근거 자세히 보기</button>'
          : '<button class="ha-cta" id="c-ob-next">다음</button>') +
      '</div>' +
    '</div>';
  }

  function bindTour() {
    var q = function (id) { return document.getElementById(id); };
    var n = INFO[tourType].tour.length;
    var go = function (d) {
      var k = tourStep + d;
      if (k < 0 || k >= n) return;
      tourStep = k; render();
    };
    q('c-ob-back').onclick = function () {
      if (tourStep > 0) return go(-1);
      tourType = null; render();
    };
    if (q('c-ob-next')) q('c-ob-next').onclick = function () { go(1); };
    if (q('c-ob-skip')) q('c-ob-skip').onclick = function () { tourStep = n - 1; render(); };
    if (q('c-ob-ev')) q('c-ob-ev').onclick = function () { showEvidence(tourType); };
    if (q('c-ob-start')) q('c-ob-start').onclick = function () {
      var t = tourType;
      tourType = null; tourStep = 0;
      var both = CourseService.list().length > 0;
      CourseService.start(t);
      showType = t; picking = false;
      UI.toast(both ? '두 코스를 같이 해요 · 하루 할 일은 한 번에 체크돼요' : '시작! 오늘이 1일째예요');
      render();
    };
    /* 하단 탭은 그대로 보이게 — 소개 화면은 탭 바로 위까지만 */
    /* 위는 앱 화면 맨 위(데스크톱 틀의 상태바 아래), 아래는 탭 바로 위까지 — 실제 위치를 재서 맞춘다 */
    var ob = q('c-ob'), x0 = null, tabs = document.querySelector('.tabs'), app = document.getElementById('app');
    var r = ob.getBoundingClientRect();
    if (app) ob.style.top = Math.max(0, app.getBoundingClientRect().top - r.top) + 'px';
    if (tabs) ob.style.bottom = Math.max(0, r.bottom - tabs.getBoundingClientRect().top) + 'px';
    /* 옆으로 밀어서 넘기기 */
    ob.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    ob.addEventListener('touchend', function (e) {
      if (x0 == null) return;
      var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    });
  }

  /* ---------- 진행 중 ---------- */
  function running(m, extra) {
    var t = m.today, ms = mission(m), done = t.state === 'done';
    var free = m.type.weekly && m.weekMet && !done;
    var canCheck = t.kind === 'light' && !done && !free;
    var undo = t.kind === 'light' && done && (((CourseService.get(m.type.id) || {}).days || {})[t.key] || {}).light;
    var cta = canCheck ? '<button class="ha-cta cs-start" id="c-check">다녀왔어요</button>'
      : t.kind === 'vitd' && !done && !free ? '<button class="ha-cta cs-start" id="c-home">처방 보러 가기</button>' : '';
    return '<section class="ha-t cs-hero' + (done ? ' done' : '') + '">' +
        '<div class="cs-hero-h"><span class="ha-lab">오늘 할 일</span></div>' +
        '<div class="cs-title lg' + (done || free ? ' done' : '') + '">' + (done ? StampView.mark() + ' ' : '') + ms.title + '</div>' +
        '<div class="cs-desc">' + ms.body + '</div>' +
        cta +
        (undo ? '<button class="cs-link" id="c-uncheck">체크 취소</button>' : '') +
      '</section>' +
      progress(m) +
      '<section class="ha-t an-split">' +
        '<div><div class="ha-lab">채운 날</div><b>' + m.total.done + '<small>일</small></b></div>' +
        '<div><div class="ha-lab">달성률</div><b>' + (m.total.percent == null ? '–' : m.total.percent + '<small>%</small>') + '</b></div>' +
      '</section>' +
      grid(m) +
      (extra || '') +
      '<button class="cs-link cs-why" id="c-why">왜 ' + m.weeks + '주예요? · 근거 보기</button>' +
      '<button class="cs-link" id="c-stop">코스 그만두기</button>';
  }

  /* 진행 — 전체 막대 + 이번 주 7칸 */
  function progress(m) {
    var pct = Math.round(m.dayN / m.days * 100);
    var wk = m.cells.slice((m.week - 1) * 7, m.week * 7);
    return '<section class="ha-t an-card">' +
      '<div class="cs-hero-h"><span class="ha-lab">진행</span><span class="cs-left">' + m.dayN + '/' + m.days + '일 · 끝까지 ' + (m.days - m.dayN) + '일</span></div>' +
      '<div class="an-big">' + m.week + '<small>주차</small> <span class="cs-of">/ ' + m.weeks + '주</span>' +
        '<span class="cs-wgoal">' + weekText(m) + '</span></div>' +
      '<div class="cs-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="cs-week">' + wk.map(function (c) {
        return '<div class="cs-wd"><i class="cs-d ' + c.state + '">' + mark(c) + '</i><span>' + c.n + '일</span></div>';
      }).join('') + '</div>' +
    '</section>';
  }

  function mark(c) { return c.state === 'done' ? StampView.mark() : c.state === 'rest' ? '–' : ''; }

  /* 기록판 — 한 줄이 한 주. 주 단위 코스는 줄 끝에 '2/3' */
  function grid(m) {
    var rows = '';
    for (var w = 1; w <= m.weeks; w++) {
      var cells = m.cells.slice((w - 1) * 7, w * 7), wl = m.weekList[w - 1];
      rows += '<div class="cs-wk' + (m.type.weekly ? ' wg' : '') + (w === m.week && !m.finished ? ' now' : '') + '"><span class="cs-wk-l">' + w + '주</span>' +
        cells.map(function (c) { return '<i class="cs-d ' + c.state + '">' + mark(c) + '</i>'; }).join('') +
        (m.type.weekly ? '<span class="cs-wk-g' + (wl.met ? ' met' : '') + '">' + Math.min(wl.done, wl.goal) + '/' + wl.goal + '</span>' : '') +
        '</div>';
    }
    return '<section class="ha-t an-card">' +
      '<div class="ha-lab">' + m.weeks + '주 기록</div>' +
      '<div class="cs-grid">' + rows + '</div>' +
      '<div class="cs-legend"><span><i class="cs-d done">' + StampView.mark() + '</i>채움</span>' +
        (m.type.weekly ? '<span>오른쪽 숫자 · 그 주 목표</span>' : '<span><i class="cs-d miss"></i>못 채움</span>') +
        '<span><i class="cs-d rest">–</i>쉬는 날</span></div>' +
    '</section>';
  }

  /* ---------- 끝 ---------- */
  function result(m) {
    var f = m.first.percent, l = m.last.percent;
    var diff = f != null && l != null ? l - f : null;
    return '<section class="ha-t an-card">' +
        '<div class="ha-lab">' + m.type.name + '를 마쳤어요</div>' +
        '<div class="an-big">' + m.total.done + '<small>일 채움</small></div>' +
        '<div class="cs-desc">' + (m.type.weekly
          ? m.weeks + '주 동안 ' + m.total.counted + '번 중 ' + m.total.got + '번 해냈어요'
          : '쉬는 날 빼고 ' + m.total.counted + '일 중 ' + m.total.done + '일 해냈어요') + '</div>' +
      '</section>' +
      '<section class="ha-t an-split">' +
        '<div><div class="ha-lab">첫 2주</div><b>' + (f == null ? '–' : f + '<small>%</small>') + '</b></div>' +
        '<div><div class="ha-lab">마지막 2주</div><b>' + (l == null ? '–' : l + '<small>%</small>') + '</b></div>' +
      '</section>' +
      (diff != null ? '<div class="cs-diff">처음보다 <b>' + (diff >= 0 ? diff + '%p 늘었어요' : -diff + '%p 줄었어요') + '</b></div>' : '') +
      grid(m) +
      '<button class="ha-cta cs-start" id="c-restart">다른 코스 고르기</button>' +
      '<button class="cs-link cs-why" id="c-why">이 코스의 근거 보기</button>';
  }

  function bind(m) {
    var q = function (id) { return document.getElementById(id); };
    [].forEach.call(el.querySelectorAll('.cs-card'), function (b) {
      b.onclick = function () {
        if (b.classList.contains('doing')) { showType = b.dataset.type; picking = false; return render(); }
        tourType = b.dataset.type; tourStep = 0; render();
      };
    });
    if (q('c-pick')) q('c-pick').onclick = function () { picking = true; render(); };
    if (q('c-pick-back')) q('c-pick-back').onclick = function () { picking = false; render(); };
    [].forEach.call(el.querySelectorAll('.cs-seg-b'), function (b) {
      b.onclick = function () { showType = b.dataset.show; render(); };
    });
    if (q('c-why')) q('c-why').onclick = function () { showEvidence(m.type.id); };
    if (q('c-home')) q('c-home').onclick = function () { App.go('home'); };
    if (q('c-restart')) q('c-restart').onclick = function () { CourseService.stop(m.type.id); render(); };
    if (q('c-check')) q('c-check').onclick = function () {
      CourseService.checkLight(true);
      UI.toast('체크했어요. 오늘 할 일 끝!');
      render();
    };
    if (q('c-uncheck')) q('c-uncheck').onclick = function () {
      CourseService.checkLight(false);
      render();
    };
    if (q('c-stop')) q('c-stop').onclick = function () {
      UI.sheet(m.type.name + ' 그만할까요?', '이 코스에서 한 기록이 다 지워져요',
        '<div class="btn-row"><button class="btn btn-sub" id="c-stop-no">계속할게요</button>' +
        '<button class="btn btn-primary" id="c-stop-yes">그만할래요</button></div>');
      q('c-stop-no').onclick = function () { UI.closeSheet(); };
      q('c-stop-yes').onclick = function () {
        CourseService.stop(m.type.id);
        UI.closeSheet();
        UI.toast('코스를 그만뒀어요');
        render();
      };
    }
  }

  return { open: open, render: render, homeCard: homeCard, bindHome: bindHome };
})();
