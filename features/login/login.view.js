/* =========================================================
   기능: 시작 화면 · 로그인 · 회원가입 — 뷰(화면)
   온보딩을 아직 안 한 사용자에게 뜬다. 마이페이지 '계정'에서도 연다.

   시작 화면 ─┬─ 로그인      ─┐
              ├─ 회원가입    ─┼─▶ 동의 화면(아직 답 안 했으면) ─▶ 온보딩 ─▶ 홈
              └─ 게스트로 둘러보기 ┘

   · 계정은 이메일 + 비밀번호(Firebase 이메일 인증). 폰을 바꾸거나 앱 데이터를
     지워도 로그인하면 같은 참가자(uid)로 기록된다.
   · 로그인과 동의는 따로다 — 계정이 있어도 기록 전송은 동의해야만 한다.
   · 입력 화면은 온보딩과 같은 틀(.ob-in · .ob-q · .ob-foot)과 검색칸 모양(.st-search)을 쓴다.
   · Firebase를 못 불러오면 게스트 버튼만 보인다(오프라인 우선).
   ========================================================= */
var LoginView = (function () {

  var root;
  var mode = 'start';        // start · login · signup
  var fromSettings = false;  // 마이페이지에서 열었으면 끝나고 마이페이지로 돌아간다
  var busy = false;

  function show() {
    fromSettings = false;
    open('start');
  }

  /* 마이페이지 '계정'에서 바로 로그인/회원가입 화면을 연다 */
  function openFromSettings(m) {
    fromSettings = true;
    open(m === 'signup' ? 'signup' : 'login');
  }

  function open(m) {
    root = document.getElementById('login');
    root.classList.add('show');
    mode = m;
    busy = false;
    render();
  }
  function hide() { root.classList.remove('show'); }

  function render() {
    root.innerHTML = mode === 'start' ? startHtml() : formHtml();
    bind();
    if (mode !== 'start') {
      var first = document.getElementById('lg-email');
      if (first) setTimeout(function () { first.focus(); }, 200);
    }
  }

  /* ---------- 시작 화면 ---------- */
  function startHtml() {
    return '<div class="lg-in">' +
      '<div class="lg-top">' +
        '<div class="lg-icon">' + sunMark() + '</div>' +
        '<h1 class="lg-title">하루<span>햇빛</span></h1>' +
        '<p class="lg-sub">오늘 언제 몇 분 쬐면 되는지<br>계산해서 알려드려요</p>' +
      '</div>' +
      '<div class="lg-foot">' +
        (Auth.available()
          ? '<button class="btn lg-btn" id="lg-to-login">로그인</button>' +
            '<button class="btn lg-btn2" id="lg-to-signup">회원가입</button>' +
            '<button class="ob-skip" id="lg-guest">게스트로 둘러보기</button>'
          : '<button class="btn lg-btn" id="lg-guest">게스트로 시작하기</button>' +
            '<p class="lg-note">계정 없이 바로 씁니다 · 동의한 경우에만 기록을 익명으로 보내요</p>') +
      '</div>' +
    '</div>';
  }

  /* ---------- 로그인 · 회원가입 입력 화면 ---------- */
  function formHtml() {
    var signup = mode === 'signup';
    return '<div class="ob-in">' +
      '<div class="ob-body enter">' +
        '<div class="ob-q">' + (signup ? '계정을 만들어요' : '로그인') + '</div>' +
        '<div class="ob-help">' + (signup
          ? '로그인하면 폰을 바꿔도 같은 사람으로 기록돼요.'
          : '가입한 이메일과 비밀번호를 입력해 주세요.') + '</div>' +
        '<div class="lg-form">' +
          field('lg-email', 'email', '이메일', 'email') +
          field('lg-pw', 'password', signup ? '비밀번호 (8자 이상)' : '비밀번호',
                signup ? 'new-password' : 'current-password') +
          (signup ? field('lg-pw2', 'password', '비밀번호 확인', 'new-password') : '') +
        '</div>' +
        (signup ? '' : '<button class="lg-link" id="lg-reset">비밀번호를 잊었어요</button>') +
      '</div>' +
      '<div class="ob-foot">' +
        '<button class="btn btn-primary" id="lg-submit">' + (signup ? '가입하기' : '로그인') + '</button>' +
        '<button class="ob-skip" id="lg-switch">' +
          (signup ? '이미 계정이 있어요 · 로그인' : '계정이 없어요 · 회원가입') + '</button>' +
        '<button class="ob-skip" id="lg-back">이전</button>' +
      '</div>' +
    '</div>';
  }

  function field(id, type, placeholder, autocomplete) {
    return '<div class="st-search lg-field">' +
      '<input id="' + id + '" type="' + type + '" placeholder="' + placeholder + '"' +
      ' autocomplete="' + autocomplete + '" autocapitalize="off" spellcheck="false"></div>';
  }

  /* ---------- 이벤트 ---------- */
  function bind() {
    var q = function (id) { return document.getElementById(id); };

    if (mode === 'start') {
      if (q('lg-to-login')) q('lg-to-login').onclick = function () { open('login'); };
      if (q('lg-to-signup')) q('lg-to-signup').onclick = function () { open('signup'); };
      q('lg-guest').onclick = next;
      return;
    }

    q('lg-back').onclick = function () {
      if (fromSettings) { hide(); return; }
      open('start');
    };
    q('lg-switch').onclick = function () { open(mode === 'signup' ? 'login' : 'signup'); };
    q('lg-submit').onclick = submit;
    /* 마지막 칸에서 엔터를 누르면 제출 */
    [].forEach.call(root.querySelectorAll('input'), function (inp) {
      inp.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
    });

    if (q('lg-reset')) q('lg-reset').onclick = function () {
      var email = q('lg-email').value.trim();
      if (!email) return UI.toast('이메일을 먼저 입력해 주세요');
      Auth.resetPassword(email)
        .then(function () { UI.toast('비밀번호를 바꾸는 메일을 보냈어요'); })
        .catch(function (e) { var msg = Auth.errorText(e); if (msg) UI.toast(msg); });
    };
  }

  function submit() {
    if (busy) return;
    var q = function (id) { return document.getElementById(id); };
    var email = q('lg-email').value.trim();
    var pw = q('lg-pw').value;

    if (!email || !pw) return UI.toast('이메일과 비밀번호를 입력해 주세요');
    if (mode === 'signup') {
      if (pw.length < 8) return UI.toast('비밀번호는 8자 이상으로 해 주세요');
      if (pw !== q('lg-pw2').value) return UI.toast('비밀번호가 서로 달라요');
    }

    busy = true;
    var btn = q('lg-submit');
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = mode === 'signup' ? '가입하는 중…' : '로그인 중…';

    (mode === 'signup' ? Auth.signUpEmail(email, pw) : Auth.signInEmail(email, pw))
      .then(function () {
        UI.toast(mode === 'signup' ? '가입했어요' : '로그인했어요');
        if (fromSettings) {
          hide();
          if (window.Sync) Sync.run();
          App.go('settings');
        } else {
          next();
        }
      })
      .catch(function (e) {
        busy = false;
        btn.disabled = false;
        btn.textContent = label;
        var msg = Auth.errorText(e);
        if (msg) UI.toast(msg);
      });
  }

  /* 로그인 방식과 상관없이 다음은 같다 — 동의(아직 답 안 했으면) → 온보딩.
     계정이 있어도 기록 전송은 동의해야만 한다(로그인 ≠ 동의). */
  function next() {
    hide();
    if (ConsentService.answered()) OnboardingView.show();
    else ConsentView.show(function () { OnboardingView.show(); });
  }

  /* 아이콘과 같은 해 그림 (배경이 이미 파랗기 때문에 해만 그린다) */
  function sunMark() {
    return '<svg viewBox="0 0 512 512" width="118" height="118" aria-hidden="true">' +
      '<defs><linearGradient id="lgSun" x1="0.3" y1="0" x2="0.7" y2="1">' +
        '<stop offset="0%" stop-color="#FFE480"/><stop offset="100%" stop-color="#F8CB45"/>' +
      '</linearGradient></defs>' +
      '<g stroke="#FBD75C" stroke-width="22" stroke-linecap="round">' +
        '<line x1="256" y1="123" x2="256" y2="48"/>' +
        '<line x1="256" y1="389" x2="256" y2="464"/>' +
        '<line x1="123" y1="256" x2="48" y2="256"/>' +
        '<line x1="389" y1="256" x2="464" y2="256"/>' +
        '<line x1="162" y1="162" x2="109" y2="109"/>' +
        '<line x1="350" y1="162" x2="403" y2="109"/>' +
        '<line x1="350" y1="350" x2="403" y2="403"/>' +
        '<line x1="162" y1="350" x2="109" y2="403"/>' +
      '</g>' +
      '<circle cx="256" cy="256" r="110" fill="url(#lgSun)"/>' +
      '<ellipse cx="186" cy="272" rx="20" ry="13" fill="#F79A5B" opacity=".48"/>' +
      '<ellipse cx="326" cy="272" rx="20" ry="13" fill="#F79A5B" opacity=".48"/>' +
      '<g fill="none" stroke="#6E3F17" stroke-width="14" stroke-linecap="round">' +
        '<path d="M196 250 Q215 228 234 250"/>' +
        '<path d="M278 250 Q297 228 316 250"/>' +
        '<path d="M223 289 Q256 320 289 289"/>' +
      '</g>' +
    '</svg>';
  }

  return { show: show, hide: hide, openFromSettings: openFromSettings };
})();
