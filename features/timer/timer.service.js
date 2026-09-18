/* =========================================================
   기능: 노출 타이머 — 서비스(로직)
   §9 · 옷차림·SPF 토글을 즉시 반영해 남은 시간을 재계산한다.
   단순 카운트다운이 아니라 '누적 선량' 방식:
     매 초 dt / (그 순간의 필요시간) 만큼 채워진다.
     → 중간에 옷을 걷거나 구름이 끼면 남은 시간이 늘거나 준다.
   ========================================================= */
var TimerService = (function () {

  var st = null;

  function isRunning() { return !!(st && st.running); }
  function session() { return st; }

  function start(rx, win) {
    st = {
      rx: rx,
      window: win || null,
      running: true,
      startedAt: Date.now(),
      lastTick: Date.now(),
      elapsedSec: 0,
      dose: 0,                 // 0~1 · 비타민D 목표 대비 누적
      last: null
    };
    tick();
    return st;
  }

  function stop() {
    if (!st) return null;
    st.running = false;
    return finish();
  }

  /* 현재 프로필(옷차림·SPF·피부) 기준으로 '지금' 값을 다시 계산 */
  function currentPoint() {
    var profile = Repo.getProfile();
    var nowM = Prescription.localNow(st.rx.tz).minute;   // 예보 지점 현지 시각
    var p = Prescription.pointAt(st.rx, nowM);
    var r = Engine.computePoint({
      uvi: p.uvi, tempC: p.tempC, rh: p.rh,
      skinType: profile.skinType, clothing: profile.clothing, spf: profile.spf
    });
    r.altitude = p.altitude;
    r.minuteOfDay = nowM;
    return r;
  }

  function tick() {
    if (!st) return null;
    var now = Date.now();
    var dt = Math.min(60, (now - st.lastTick) / 1000);   // 탭 복귀 시 폭주 방지
    st.lastTick = now;

    var p = currentPoint();
    st.last = p;

    if (st.running) {
      st.elapsedSec += dt;
      var reqSec = p.vitd * 60;
      if (isFinite(reqSec) && reqSec > 0) st.dose += dt / reqSec;
    }
    return snapshot();
  }

  function snapshot() {
    var p = st.last || currentPoint();
    var reqSec = p.vitd * 60;

    var doseRemain = isFinite(reqSec) ? Math.max(0, (1 - st.dose) * reqSec) : Infinity;
    var burnRemain = isFinite(p.burn) ? Math.max(0, p.burn * 60 - st.elapsedSec) : Infinity;
    var heatRemain = isFinite(p.heat) ? Math.max(0, p.heat * 60 - st.elapsedSec) : Infinity;

    var remaining = Math.min(doseRemain, burnRemain, heatRemain);
    var reason = remaining === heatRemain ? 'heat'
               : remaining === burnRemain ? 'burn' : 'vitd';

    return {
      running: st.running,
      elapsedSec: Math.round(st.elapsedSec),
      remainingSec: Math.round(remaining),
      percent: Math.round(st.dose * 100),
      dose: st.dose,
      point: p,
      limitedBy: reason,
      limitLabel: Engine.LIMIT_LABEL[reason],
      requiredMin: p.vitd,
      done: remaining <= 0,
      window: st.window
    };
  }

  /* 종료 처리 — 이력 기록까지 (§9 주간 화면 반영) */
  function finish() {
    var s = snapshot();
    var minutes = Math.max(1, Math.round(st.elapsedSec / 60));
    var percent = Math.min(300, Math.round(st.dose * 100));

    HomeService.record(st.rx, {
      startedAt: st.startedAt,
      minutes: minutes,
      percent: percent,
      clothing: Repo.getProfile().clothing,
      spf: Repo.getProfile().spf,
      limitedBy: s.limitedBy
    });

    var out = { minutes: minutes, percent: percent, limitedBy: s.limitedBy };
    st = null;
    return out;
  }

  function reset() { st = null; }

  return {
    start: start, stop: stop, tick: tick, snapshot: snapshot,
    isRunning: isRunning, session: session, reset: reset,
    currentPoint: currentPoint
  };
})();
