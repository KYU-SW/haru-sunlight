/* =========================================================
   기능: 기록 수집 동의 (작업지시서 4-2 · 6절)

   흐름: 시작 화면 → [동의 화면] → 온보딩 → 홈
     · 동의하면   : 익명 로그인 → (다음 단계) 기록 업로드 켜짐
     · 동의 안 하면: 앱은 똑같이 쓰고, 로그인·업로드는 하지 않는다
   마이페이지의 '기록 전송' 스위치로 언제든 끄고 켤 수 있다(동의 철회).

   ⚠️ 문구는 6절 초안이다 — 법률 검토를 거친 문구가 아니다.
   ⚠️ KEEP_DAYS · CONTACT 는 팀이 정할 값이다(작업지시서 9절). 정해지면 여기만 채운다.
   ========================================================= */
var ConsentService = (function () {

  var VERSION = 'v1';          // 문구를 바꾸면 올린다 → 다시 동의를 받게 된다
  var KEEP_DAYS = null;        // [  ] 평가 종료 후 며칠 안에 삭제하나
  var CONTACT = null;          // [  ] 문의처 (예: 팀 이메일)

  function get() { return Repo.getProfile().consent || null; }

  /* 지금 문구 버전에 동의한 상태인가 */
  function given() {
    var c = get();
    return !!(c && c.agreed && c.version === VERSION);
  }
  /* 한 번이라도 답을 했는가 (동의든 거부든) */
  function answered() {
    var c = get();
    return !!(c && c.version === VERSION);
  }

  function agree() {
    Repo.setProfile({ consent: { agreed: true, version: VERSION, at: Date.now() } });
    /* 동의한 사람만 익명 로그인하고, 이어서 사용자 정보를 올린다 */
    return Auth.ensure().then(function () { if (window.Sync) return Sync.run(); });
  }
  function decline() {
    Repo.setProfile({ consent: { agreed: false, version: VERSION, at: Date.now() } });
  }

  /* 화면에 보일 항목 — 6절 초안 그대로 */
  function items() {
    return [
      ['수집하는 것', '익명 ID, 사용 시작일, 타이머 기록(날짜·시작 시각·노출 분·충전률·옷차림·종료 사유), 알림 설정, 지역(시·도 단위), 피부 타입'],
      ['수집하지 않는 것', '이름, 이메일, 전화번호, 정확한 위치(좌표)'],
      ['목적', '전공 발표의 앱 효과 평가 (여러 사람의 평균 통계로만 써요)'],
      ['보관', KEEP_DAYS ? '평가가 끝나고 ' + KEEP_DAYS + '일 안에 지워요' : '평가가 끝나면 지워요 (기간은 따로 안내해요)'],
      ['제3자 제공', '없어요'],
      ['거부', '동의하지 않아도 앱은 똑같이 쓸 수 있고, 기록은 보내지 않아요. 마이페이지에서 언제든 전송을 끌 수 있어요.'],
      ['문의', CONTACT || '따로 안내해요']
    ];
  }

  return { VERSION: VERSION, get: get, given: given, answered: answered,
           agree: agree, decline: decline, items: items };
})();


var ConsentView = (function () {

  var S = ConsentService;

  function listHtml() {
    return '<dl class="cs-list">' +
      S.items().map(function (r) {
        return '<div class="cs-row"><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>';
      }).join('') +
    '</dl>';
  }

  /* 만 14세 미만은 법정대리인 동의가 필요할 수 있어 참가를 14세 이상으로 제한한다 (6절) */
  function checksHtml(p) {
    return '<div class="cs-checks">' +
      '<label class="cs-check"><input type="checkbox" id="' + p + 'age">만 14세 이상이에요</label>' +
      '<label class="cs-check"><input type="checkbox" id="' + p + 'ok">위 내용을 읽었고 동의해요</label>' +
    '</div>';
  }

  /* 두 칸이 모두 체크돼야 버튼이 켜진다 */
  function wire(scope, p, btn) {
    var a = scope.querySelector('#' + p + 'age'), b = scope.querySelector('#' + p + 'ok');
    function sync() { btn.disabled = !(a.checked && b.checked); }
    a.onchange = b.onchange = sync;
    sync();
  }

  /* 시작 화면 다음에 뜨는 전체 화면. 끝나면 next()로 온보딩을 연다. */
  function show(next) {
    var root = document.getElementById('onboarding');   // 온보딩과 같은 틀을 쓴다
    root.classList.add('show');
    root.innerHTML =
      '<div class="ob-in">' +
        '<div class="ob-body enter">' +
          '<div class="ob-step">시작하기 전에</div>' +
          '<div class="ob-q">사용 기록을<br>평가에 보태 주실래요?</div>' +
          '<div class="ob-help">앱이 실제로 도움이 되는지 보려고 사용 기록을 <b>익명으로</b> 모아요. ' +
            '동의하지 않아도 앱은 똑같이 쓸 수 있어요.</div>' +
          listHtml() +
          checksHtml('cs-') +
        '</div>' +
        '<div class="ob-foot">' +
          '<button class="btn btn-primary" id="cs-yes" disabled>동의하고 시작</button>' +
          '<button class="ob-skip" id="cs-no">동의하지 않고 시작</button>' +
        '</div>' +
      '</div>';

    var yes = document.getElementById('cs-yes');
    wire(root, 'cs-', yes);
    yes.onclick = function () {
      if (yes.disabled) return;
      S.agree();               // 로그인은 기다리지 않는다 — 오프라인이어도 바로 넘어간다
      next();
    };
    document.getElementById('cs-no').onclick = function () {
      S.decline();
      next();
    };
  }

  /* 마이페이지에서 전송을 다시 켤 때 — 같은 내용을 시트로 */
  function sheet(onAgree) {
    UI.sheet('기록 전송', '앱이 실제로 도움이 되는지 보려고 사용 기록을 익명으로 모아요.',
      listHtml() + checksHtml('cs2-') +
      '<button class="btn btn-primary" id="cs2-yes" style="margin-top:16px" disabled>동의하고 켜기</button>');
    var body = document.getElementById('sheet-body');
    body.classList.add('tall');
    var yes = body.querySelector('#cs2-yes');
    wire(body, 'cs2-', yes);
    yes.onclick = function () {
      if (yes.disabled) return;
      S.agree();
      UI.closeSheet();
      if (onAgree) onAgree();
    };
  }

  return { show: show, sheet: sheet };
})();
