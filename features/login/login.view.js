/* =========================================================
   기능: 시작 화면 — 뷰(화면)
   앱 아이콘과 같은 테마(파란 배경 + 노란 해)로 첫 진입을 맞는다.
   온보딩을 아직 안 한 사용자에게만 뜬다.

   "게스트로 시작하기" → 동의 화면 → 온보딩 (작업지시서 4-2).
   동의한 사람만 익명 로그인하고 기록을 올린다(ConsentService.agree → Sync.run).
   동의하지 않아도 앱은 똑같이 쓰고, 기록은 기기에만 남는다.
   ========================================================= */
var LoginView = (function () {

  var root;

  function show() {
    root = document.getElementById('login');
    root.classList.add('show');
    render();
  }
  function hide() { root.classList.remove('show'); }

  function render() {
    root.innerHTML =
      '<div class="lg-in">' +
        '<div class="lg-top">' +
          '<div class="lg-icon">' + sunMark() + '</div>' +
          '<h1 class="lg-title">하루<span>햇빛</span></h1>' +
          '<p class="lg-sub">오늘 언제 몇 분 쬐면 되는지<br>계산해서 알려드려요</p>' +
        '</div>' +

        '<div class="lg-foot">' +
          '<button class="btn lg-btn" id="lg-guest">게스트로 시작하기</button>' +
          '<p class="lg-note">계정 없이 바로 씁니다 · 동의한 경우에만 기록을 익명으로 보내요</p>' +
        '</div>' +
      '</div>';

    document.getElementById('lg-guest').onclick = function () {
      hide();
      /* 동의를 먼저 받고, 답하면 온보딩으로 (피부 타입·지역은 계산에 꼭 필요하다) */
      ConsentView.show(function () { OnboardingView.show(); });
    };
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

  return { show: show, hide: hide };
})();
