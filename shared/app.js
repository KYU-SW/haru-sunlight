/* =========================================================
   shared / 앱 셸 — 부트스트랩 · 탭 라우팅 · 상태 보유
   기능 뷰는 여기서만 호출한다. 계산은 전부 core 계층이 한다.
   ========================================================= */
var App = (function () {

  var state = {
    profile: null,
    location: null,
    weather: null,
    stale: false,
    rx: null,          // 오늘 처방 (invalidate() 되면 다시 계산)
    tab: 'home',
    loading: true,
    error: null
  };

  /* 헤더 구분선 — 평소엔 없고, 내용이 헤더 밑으로 들어가면(스크롤) 옅게 생긴다.
     데스크톱 기기 틀에서는 #app이, 휴대폰에서는 창이 스크롤되므로 둘 다 듣는다. */
  function syncScrolled() {
    var app = document.getElementById('app');
    var y = Math.max(app.scrollTop, window.scrollY || 0);
    app.classList.toggle('is-scrolled', y > 4);
  }
  function watchScroll() {
    document.getElementById('app').addEventListener('scroll', syncScrolled, { passive: true });
    window.addEventListener('scroll', syncScrolled, { passive: true });
    syncScrolled();
  }

  /* ---------- 부트 ---------- */
  function init() {
    document.getElementById('sheet-bg').onclick = function (e) {
      if (e.target.id === 'sheet-bg') UI.closeSheet();
    };
    [].forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.onclick = function () { go(t.dataset.tab); };
    });
    watchScroll();

    state.profile = Repo.getProfile();
    state.location = Repo.getLocation();

    if (!state.profile.onboarded || !state.location) {
      /* 첫 진입은 시작 화면부터 — 거기서 "시작하기"를 누르면 온보딩으로 넘어간다 */
      LoginView.show();
      return;
    }
    if (ConsentService.given()) Auth.ensure(); // 동의한 사람만 익명 로그인 (기다리지 않음)
    Sync.start();                              // 밀린 기록 올리기 + 온라인 복귀 때 다시 시도 (동의 안 했으면 아무것도 안 함)
    var hash = (location.hash || '').replace('#', '');
    if (hash === 'timer') hash = 'home';      // 주소로 바로 들어오는 길도 막는다
    if (hash) state.tab = hash;
    applyActiveTab(state.tab);
    boot();
  }

  function boot() {
    state.profile = Repo.getProfile();
    state.location = Repo.getLocation();
    state.loading = true;
    state.error = null;
    applyActiveTab(state.tab);   // go()를 안 거쳐도 지금 탭이 보이게 먼저 맞춘다
    renderSkeleton();

    WeatherAPI.load(state.location, false)
      .then(function (res) {
        state.weather = res.data;
        state.stale = res.stale;
        state.loading = false;
        invalidate();
        if (state.profile.notify) Notify.schedule(prescription());
        go(state.tab);
        scheduleHourly();
      })
      .catch(function (err) {
        state.loading = false;
        state.error = err;
        refreshView();   // 설정 탭이면 renderError 대신 SettingsView가 뜨도록 분기를 태운다
      });
  }

  /* 예보 다시 받기. 호출부가 성공/실패를 알 수 있도록 Promise를 돌려준다
     (새로고침 버튼이 회전 표시를 끄고 결과 토스트를 띄우는 데 쓴다) */
  function refresh(force) {
    if (!state.location) return Promise.resolve(null);
    state.location = Repo.getLocation();
    return WeatherAPI.load(state.location, !!force).then(function (res) {
      state.weather = res.data;
      state.stale = res.stale;
      invalidate();
      if (state.profile.notify) Notify.schedule(prescription());
      refreshView();
      return res;
    }).catch(function (e) {
      UI.toast(e && e.noKey ? '기상청 서비스키가 없어요 — config.local.js를 확인해 주세요' : '예보를 받지 못했어요');
      throw e;
    });
  }

  /* ---------- 처방 (설정 변경 시 재계산) ---------- */
  function invalidate() { state.rx = null; state.profile = Repo.getProfile(); }

  function prescription() {
    if (!state.weather || !state.location) return null;
    if (!state.rx) {
      state.rx = Prescription.forToday(state.weather, state.location, Repo.getProfile());
    }
    return state.rx;
  }

  /* ---------- 라우팅 ---------- */
  var TABS = ['home', 'timer', 'weekly', 'settings'];

  /* 탭 버튼·화면의 active 클래스만 맞춘다. renderSkeleton/renderError처럼
     go()를 거치지 않고 state.tab에 직접 그리는 경로도 이걸 먼저 불러야
     그 화면이 실제로 보인다(안 그러면 콘텐츠는 그려지는데 숨겨진 채로 남는다). */
  function applyActiveTab(tab) {
    [].forEach.call(document.querySelectorAll('.tab'), function (t) {
      /* 분석(weekly)은 마이페이지의 하위 화면이라 마이페이지 탭을 켜 둔다.
         타이머는 탭 자체가 없으므로 홈 탭을 켜 둔다 */
      var lit = tab === 'weekly' ? 'settings' : tab === 'timer' ? 'home' : tab;
      t.classList.toggle('on', t.dataset.tab === lit);
    });
    [].forEach.call(document.querySelectorAll('.screen'), function (s) {
      s.classList.toggle('active', s.id === 'screen-' + tab);
    });
  }

  /* 타이머 화면은 '타이머 시작'을 누른 직후에만 열린다.
     아래 탭에는 타이머 버튼이 없고, 주소·뒤로가기로 들어오면 홈으로 돌린다. */
  var timerAllowed = false;

  function go(tab) {
    if (TABS.indexOf(tab) < 0) tab = 'home';
    if (tab === 'timer' && !timerAllowed) tab = 'home';
    if (tab !== 'timer') timerAllowed = false;
    state.tab = tab;
    if (location.hash !== '#' + tab) {
      try { history.replaceState(null, '', '#' + tab); } catch (e) {}
    }
    applyActiveTab(tab);
    if (tab !== 'timer') TimerView.stopLoop();
    scrollTop();
    refreshView();
    syncScrolled();              // 탭을 바꾸면 맨 위라 선이 바로 사라진다(스크롤 이벤트는 한 박자 늦게 온다)
  }

  /* 데스크톱에서는 기기 틀 안의 #app이 스크롤되고, 휴대폰에서는 창이 스크롤된다.
     탭을 바꿨을 때 맨 위로 올리려면 둘 다 손봐야 한다. */
  function scrollTop() {
    window.scrollTo(0, 0);
    var a = document.getElementById('app');
    if (a) a.scrollTop = 0;
  }

  function refreshView() {
    /* 설정 탭은 날씨를 못 받은 상태(키 없음·오류)에서도 항상 열려야 한다 —
       거기서 config.local.js 설정 방법을 안내한다 */
    if (state.tab === 'settings') return SettingsView.render();

    if (state.loading) return renderSkeleton();
    if (state.error) return renderError();
    var rx = prescription();
    if (!rx) return renderError();

    if (state.tab === 'home') {
      HomeView.render(HomeService.build(rx, { stale: state.stale }));
    } else if (state.tab === 'timer') {
      TimerView.render(rx);
    } else if (state.tab === 'weekly') {
      WeeklyView.render(WeeklyService.build(state.weather, state.location, Repo.getProfile()));
    }
  }

  /* ---------- 액션 ---------- */
  function startTimer(win) {
    var rx = prescription();
    if (!rx) return;
    var over = TimerService.exhausted(rx);
    if (over && !TimerService.isRunning()) {
      UI.toast(over === 'heat'
        ? '오늘은 더위 한계까지 다 쬐었어요 — 내일 다시 해요'
        : '오늘은 화상 한계까지 다 쬐었어요 — 내일 다시 해요');
    } else if (!TimerService.isRunning()) {
      TimerService.start(rx, win || rx.activeWindow || rx.targetWindow);
    }
    timerAllowed = true;
    go('timer');
  }

  function enableNotify() {
    Notify.request().then(function (ok) {
      Repo.setProfile({ notify: ok });
      invalidate();
      if (ok) {
        var n = Notify.schedule(prescription());
        UI.toast(n ? '햇빛 시간 ' + n + '번, 15분 전에 알려드릴게요' : '오늘 남은 햇빛 시간이 없어요');
      } else {
        UI.toast('브라우저에서 알림이 차단돼 있어요');
      }
      refreshView();
    });
  }

  /* ---------- 로딩 · 오류 ---------- */
  function renderSkeleton() {
    var bar = function (w, h, mt) {
      return '<div class="skel" style="width:' + w + ';height:' + h + 'px' +
             (mt ? ';margin-top:' + mt + 'px' : '') + '"></div>';
    };
    document.getElementById('screen-' + state.tab).innerHTML =
      '<div class="hdr"><div class="hdr-l">' + bar('180px', 30) + bar('130px', 15, 12) + '</div>' +
        '<div class="hdr-acts">' +
          '<div class="skel" style="width:46px;height:46px;border-radius:50%"></div>' +
          '<div class="skel" style="width:46px;height:46px;border-radius:50%"></div>' +
        '</div></div>' +
      '<div class="actrow">' +
        '<div class="skel" style="width:50px;height:50px;border-radius:50%"></div>' +
        '<div class="skel" style="width:50px;height:50px;border-radius:50%"></div>' +
        '<div class="skel" style="flex:1;height:50px;border-radius:99px"></div>' +
      '</div>' +
      '<div class="sec">' + bar('60%', 20) + bar('50%', 46, 16) + bar('100%', 150, 20) + '</div>' +
      '<div class="sec">' + bar('45%', 18) + bar('100%', 62, 14) + bar('100%', 62, 8) + '</div>';
  }

  /* 서비스키는 앱 UI에 넣지 않는다(설정 화면에도 없음).
     키가 없을 때만 이 화면에서 config.local.js 설정 방법을 안내한다. */
  function renderError() {
    var noKey = state.error && state.error.noKey;

    var body = noKey
      ? '<div class="empty" style="padding-top:80px"><em>🔑</em>' +
          '기상청 서비스키가 없어요' +
        '</div>' +
        '<div class="sec" style="padding-top:0">' +
          '<div class="card warn">' +
            '<div class="card-t">config.local.js 파일에 넣어 주세요</div>' +
            '<div class="card-b">앱 화면에서는 키를 입력받지 않습니다. 아래대로 파일만 만들면 바로 시작돼요. ' +
              '이 파일은 <b>.gitignore</b>에 등록돼 있어 깃허브에는 올라가지 않습니다.</div>' +
          '</div>' +
          '<dl class="official" style="margin-top:8px">' +
            '<dt>설정 방법</dt>' +
            '<dd style="display:block;padding:6px 0;font-size:13px;color:#4E5968;line-height:1.75">' +
              '1. <b>config.local.example.js</b>를 복사해 <b>config.local.js</b>로 저장<br>' +
              '2. 그 안의 <b>window.KMA_SERVICE_KEY</b>에 발급받은 키를 붙여넣기<br>' +
              '3. 페이지 새로고침' +
            '</dd>' +
          '</dl>' +
        '</div>' +
        '<div class="btn-wrap"><button class="btn btn-primary" id="e-retry">다시 시도</button></div>'
      : '<div class="empty" style="padding-top:100px"><em>📡</em>' +
          UI.esc((state.error && state.error.message) || '예보를 받지 못했어요') +
          '<br>네트워크 상태를 확인해 주세요' +
        '</div>' +
        '<div class="btn-wrap"><button class="btn btn-primary" id="e-retry">다시 시도</button></div>';

    document.getElementById('screen-' + state.tab).innerHTML = body;
    var b = document.getElementById('e-retry');
    if (b) b.onclick = function () { boot(); };
  }

  /* ---------- 매시 정각 자동 갱신 ----------
     시간이 흐르면 '지금'의 자외선지수·기온이 달라지므로 1시간마다 다시 받아
     화면을 새로 계산한다. 정각에 맞춰 첫 틱을 걸고 이후 1시간 간격. */
  var hourlyTimer = null;
  function scheduleHourly() {
    if (hourlyTimer) clearTimeout(hourlyTimer);
    var now = new Date();
    var msToNextHour = (60 - now.getMinutes()) * 60000 - now.getSeconds() * 1000;
    if (msToNextHour < 5000) msToNextHour += 3600000;
    hourlyTimer = setTimeout(function () {
      refresh(false);          // TTL(1시간) 지났으면 실제 재조회, 아니면 캐시로 재계산
      scheduleHourly();
    }, msToNextHour);
  }

  /* ---------- 생명주기 ---------- */
  var bootedDay = Engine.dayKey(new Date());
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    var today = Engine.dayKey(new Date());
    if (today !== bootedDay) { bootedDay = today; boot(); return; }   // 자정 넘김
    refresh(false);            // 돌아왔을 때 캐시가 1시간 넘었으면 새로 받는다
    scheduleHourly();
  });

  return {
    init: init, boot: boot, go: go, refresh: refresh,
    refreshView: refreshView, invalidate: invalidate,
    prescription: prescription, startTimer: startTimer, enableNotify: enableNotify,
    get state() { return state; }
  };
})();

document.addEventListener('DOMContentLoaded', function () {
  App.init();
  /* 서비스 워커는 지금 등록하지 않는다.
     초기 '캐시 우선' 워커 때문에 코드를 고쳐도 옛 화면이 계속 떠서,
     sw.js를 자기 제거용으로 바꿔 두었다(이미 등록된 것만 스스로 정리된다).
     오프라인 기능을 다시 켤 때 sw.js와 함께 이 등록을 되살리면 된다. */
});
