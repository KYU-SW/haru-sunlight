/* =========================================================
   기능: 시작 화면 · 로그인 · 회원가입 — 뷰(화면)
   온보딩을 아직 안 한 사용자에게 뜬다. 마이페이지 '계정'에서도 연다.

   시작 화면(해 · 시작하기) ─▶ 입력 화면(로그인 | 회원가입 · 가입 없이 둘러보기)
   입력 화면은 하늘(위) + 시트(아래). 시트 안에서 로그인 | 회원가입 탭을 바꾼다.
   ─▶ 동의 화면(아직 답 안 했으면) ─▶ 온보딩 ─▶ 홈
   하늘은 지금 시각에 따라 아침·낮·저녁·밤 네 가지로 바뀌고, 해가 시트 뒤에서 떠오른다.

   · 계정은 이메일 + 비밀번호(Firebase 이메일 인증). 폰을 바꾸거나 앱 데이터를
     지워도 로그인하면 같은 참가자(uid)로 기록된다.
   · 로그인과 동의는 따로다 — 계정이 있어도 기록 전송은 동의해야만 한다.
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
    root.innerHTML = mode === 'start' ? startHtml() : screenHtml();
    bind();
    if (mode !== 'start') {
      var first = document.getElementById('lg-email');
      if (first) setTimeout(function () { first.focus(); }, 250);
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
          ? '<button class="btn lg-btn" id="lg-to-login">시작하기</button>'
          : '<button class="btn lg-btn" id="lg-guest">게스트로 시작하기</button>' +
            '<p class="lg-note">계정 없이 바로 씁니다 · 동의한 경우에만 기록을 익명으로 보내요</p>') +
      '</div>' +
    '</div>';
  }

  /* ---------- 하늘 — 지금 시각에 따라 색과 해 높이가 바뀐다 ----------
     아침(5–10시) · 낮(10–16시) · 저녁(16–19시) · 밤. 해는 시트 뒤에서 떠오른다. */
  /* 시간대에 따라 하늘색만 바꾼다 (인사말은 두지 않는다) */
  function skyPhase() {
    var h = new Date().getHours();
    if (h >= 5 && h < 10)  return { key: 'morning' };
    if (h >= 10 && h < 16) return { key: 'day' };
    if (h >= 16 && h < 19) return { key: 'evening' };
    return { key: 'night' };
  }

  function screenHtml() {
    var ph = skyPhase();
    var signup = mode === 'signup';
    var online = Auth.available();
    var tab = signup ? 'signup' : 'login';

    return '<div class="lg2 lg2-' + ph.key + (fromSettings ? ' lg2-modal' : '') + '">' +
      '<div class="lg2-sky" aria-hidden="true">' +
      '</div>' +
      '<div class="lg2-head">' +
        '<div class="lg2-brand">' +
          '<h1 class="lg2-title">하루햇빛</h1>' +
          '<img class="lg2-logo" src="icon.svg" alt="" aria-hidden="true">' +
        '</div>' +
        (fromSettings
          ? '<button class="lg2-close" id="lg-back" aria-label="닫기">' + closeIcon() + '</button>'
          : '<button class="lg2-close lg2-prev" id="lg-back" aria-label="이전">' + backIcon() + '</button>') +
      '</div>' +

      '<div class="lg2-sheet">' +
        (online ? (
          '<div class="lg2-tabs" role="tablist">' +
            '<button role="tab" id="lg-tab-login" class="' + (tab === 'login' ? 'on' : '') + '" aria-selected="' + (tab === 'login') + '">로그인</button>' +
            '<button role="tab" id="lg-tab-signup" class="' + (tab === 'signup' ? 'on' : '') + '" aria-selected="' + (tab === 'signup') + '">회원가입</button>' +
            '<i class="lg2-tab-bar ' + tab + '"></i>' +
          '</div>' +
          '<div class="lg2-form">' +
            field('lg-email', 'email', '이메일', 'email', mailIcon()) +
            field('lg-pw', 'password', signup ? '비밀번호 (8자 이상)' : '비밀번호',
                  signup ? 'new-password' : 'current-password', lockIcon(), true) +
            (signup ? field('lg-pw2', 'password', '비밀번호 확인', 'new-password', lockIcon(), true) : '') +
          '</div>' +
          (signup
            ? '<div class="lg2-checks"><span id="lg-chk-len">8자 이상</span><span id="lg-chk-same">두 칸이 같아요</span></div>'
            : '<button class="lg2-link" id="lg-reset">비밀번호를 잊었어요</button>') +
          '<div class="lg2-sp"></div>' +
          '<button class="btn btn-primary lg2-submit" id="lg-submit">' + (signup ? '가입하고 시작' : '로그인') + '</button>'
        ) : (
          '<p class="lg2-offline">지금은 계정에 연결할 수 없어요.<br>게스트로 먼저 써 보세요.</p>' +
          '<div class="lg2-sp"></div>'
        )) +
        (fromSettings ? '' :
          '<button class="lg2-guest" id="lg-guest">' + (online ? '가입 없이 <b>둘러보기</b>' : '<b>게스트로 시작하기</b>') + '</button>') +
      '</div>' +
    '</div>';
  }

  function field(id, type, placeholder, autocomplete, icon, eye) {
    return '<label class="lg2-field">' + icon +
      '<input id="' + id + '" type="' + type + '" placeholder="' + placeholder + '"' +
      ' autocomplete="' + autocomplete + '" autocapitalize="off" spellcheck="false">' +
      (eye ? '<button type="button" class="lg2-eye" data-for="' + id + '" aria-label="비밀번호 보기">' + eyeIcon() + '</button>' : '') +
    '</label>';
  }

  function mailIcon() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg>'; }
  function lockIcon() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>'; }
  function eyeIcon() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'; }
  function backIcon() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>'; }
  function closeIcon() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'; }

  /* ---------- 이벤트 ---------- */
  function bind() {
    var q = function (id) { return document.getElementById(id); };

    if (q('lg-guest')) q('lg-guest').onclick = next;

    /* 시작 화면 — 시작하기를 누르면 해가 뜨는 로그인 화면으로 넘어간다 */
    if (mode === 'start') {
      if (q('lg-to-login')) q('lg-to-login').onclick = function () { open('login'); };
      if (q('lg-to-signup')) q('lg-to-signup').onclick = function () { open('signup'); };
      return;
    }

    /* 뒤로 — 마이페이지에서 열었으면 닫고, 아니면 시작 화면으로 */
    if (q('lg-back')) q('lg-back').onclick = function () {
      if (fromSettings) { hide(); return; }
      open('start');
    };
    if (!q('lg-submit')) return;              // 오프라인 — 게스트 버튼만

    /* 탭 — 입력한 이메일은 그대로 두고 칸만 바꾼다 */
    function switchTo(m) {
      if (m === (mode === 'signup' ? 'signup' : 'login')) return;
      var email = q('lg-email').value;
      mode = m; busy = false; render();
      q('lg-email').value = email;
    }
    q('lg-tab-login').onclick = function () { switchTo('login'); };
    q('lg-tab-signup').onclick = function () { switchTo('signup'); };

    q('lg-submit').onclick = submit;
    [].forEach.call(root.querySelectorAll('input'), function (inp) {
      inp.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
    });

    /* 비밀번호 보기 */
    [].forEach.call(root.querySelectorAll('.lg2-eye'), function (b) {
      b.onclick = function () {
        var inp = q(b.dataset.for);
        var show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        b.classList.toggle('on', show);
        b.setAttribute('aria-label', show ? '비밀번호 숨기기' : '비밀번호 보기');
      };
    });

    /* 회원가입 — 조건을 채우면 바로 초록 체크 */
    if (q('lg-pw2')) {
      var sync = function () {
        var a = q('lg-pw').value, b2 = q('lg-pw2').value;
        q('lg-chk-len').classList.toggle('ok', a.length >= 8);
        q('lg-chk-same').classList.toggle('ok', !!b2 && a === b2);
      };
      q('lg-pw').oninput = q('lg-pw2').oninput = sync;
    }

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
    if (mode === 'start') mode = 'login';
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
