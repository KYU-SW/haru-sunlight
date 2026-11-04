/* =========================================================
   shared / 알림 — 창이 열리기 15분 전 (§9)
   "09:15부터 18분, 오늘 제일 좋은 창입니다"
   ========================================================= */
var Notify = (function () {

  var LEAD_MIN = 15;
  var LATE_MS = 10 * 60000;   // 예약 시각보다 이만큼 늦게 깨어나면 건너뛴다
  var timers = [];

  function supported() { return typeof Notification !== 'undefined'; }
  function granted() { return supported() && Notification.permission === 'granted'; }

  function request() {
    if (!supported()) return Promise.resolve(false);
    if (Notification.permission === 'granted') return Promise.resolve(true);
    if (Notification.permission === 'denied') return Promise.resolve(false);
    return Notification.requestPermission().then(function (p) { return p === 'granted'; });
  }

  /* 알림 띄우기 — 안드로이드 크롬은 페이지의 new Notification()을 막고
     서비스 워커(sw.js)의 showNotification()만 허용하므로 워커를 먼저 쓴다.
     워커가 없는 환경(파일로 연 경우 등)에서는 기존 방식, 그것도 안 되면 토스트. */
  var OPTS = { icon: 'icon-192.png', tag: 'sunrx', data: { url: './' } };

  function registration() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    return navigator.serviceWorker.getRegistration().then(function (reg) {
      if (reg && reg.active) return reg;
      /* 등록 직후라 아직 활성화 전이면 잠깐 기다린다 */
      return Promise.race([
        navigator.serviceWorker.ready,
        new Promise(function (r) { setTimeout(function () { r(null); }, 3000); })
      ]);
    }).catch(function () { return null; });
  }

  function fire(title, body) {
    if (!granted()) return Promise.resolve(false);
    var o = { body: body };
    for (var k in OPTS) o[k] = OPTS[k];
    return registration().then(function (reg) {
      if (reg && reg.showNotification) return reg.showNotification(title, o).then(function () { return true; });
      new Notification(title, o);
      return true;
    }).catch(function () {
      UI.toast(title + ' — ' + body);
      return false;
    });
  }

  function clear() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  /* 오늘 남은 창 전부에 대해 15분 전 알림 예약 (앱이 열려 있는 동안 유효) */
  function schedule(rx) {
    clear();
    if (!granted() || !rx || !rx.windows.length) return 0;

    var nowMs = Date.now();
    var n = 0;
    rx.windows.forEach(function (w, i) {
      var t = new Date(rx.date);
      t.setHours(0, 0, 0, 0);
      var fireAt = t.getTime() + (w.recommendStart - LEAD_MIN) * 60000;
      if (fireAt <= nowMs) return;
      var best = i === 0 && rx.windows.length > 1 ? ', 오늘 제일 좋은 시간이에요'
               : rx.windows.length === 1 ? ', 오늘 유일한 시간이에요' : '';
      var delay = fireAt - nowMs;
      if (delay > 2147483000) return;                 // setTimeout 상한
      timers.push(setTimeout(function () {
        /* 화면이 꺼져 있던 동안 멈춰 있다가 늦게 깨어났으면, 이미 지난 안내라 울리지 않는다 */
        if (Date.now() - fireAt > LATE_MS) return;
        fire('곧 햇빛 시간이에요',
             UI.hm(w.recommendStart) + '부터 ' + w.recommendMinutes + '분' + best);
      }, delay));
      n++;
    });
    return n;
  }

  function done(minutes, percent) {
    fire('들어오세요', minutes + '분 채웠습니다 · 오늘 충전 ' + percent + '%');
  }

  return {
    LEAD_MIN: LEAD_MIN, supported: supported, granted: granted,
    request: request, schedule: schedule, clear: clear, fire: fire, done: done
  };
})();
