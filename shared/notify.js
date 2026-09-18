/* =========================================================
   shared / 알림 — 창이 열리기 15분 전 (§9)
   "09:15부터 18분, 오늘 제일 좋은 창입니다"
   ========================================================= */
var Notify = (function () {

  var LEAD_MIN = 15;
  var timers = [];

  function supported() { return typeof Notification !== 'undefined'; }
  function granted() { return supported() && Notification.permission === 'granted'; }

  function request() {
    if (!supported()) return Promise.resolve(false);
    if (Notification.permission === 'granted') return Promise.resolve(true);
    if (Notification.permission === 'denied') return Promise.resolve(false);
    return Notification.requestPermission().then(function (p) { return p === 'granted'; });
  }

  function fire(title, body) {
    if (!granted()) return;
    try { new Notification(title, { body: body, icon: 'icon.png', tag: 'sunrx' }); }
    catch (e) { UI.toast(title + ' — ' + body); }
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
