/* =========================================================
   기능: 노출 타이머 — 뷰(화면)

   한 화면 구성: 링 · 지금 상태 · 차림 · 버튼이 처음부터 모두 보인다.
   "나갈게요"를 눌러도 화면이 바뀌지 않고 그 자리에서 카운트가 시작된다.
   레퍼런스의 결과 화면처럼 큰 링 카드 아래 지표 타일을 둔다.
   ========================================================= */
var TimerView = (function () {

  var el, loop = null, rx = null;
  var R = 113, C = 2 * Math.PI * R;

  function render(prescription) {
    rx = prescription;
    el = document.getElementById('screen-timer');
    paint();
    if (TimerService.isRunning()) startLoop();
  }

  /* 정지 상태에서 보여 줄 예상치 — 지금 열린 창이면 '지금', 아니면 다음 창의 최적 시점 */
  function previewPoint() {
    if (!rx) return null;
    if (rx.activeWindow) return rx.nowPoint;
    if (rx.targetWindow) return rx.targetWindow.best;
    /* 오늘 창이 하나도 없는 날 — 홈의 '나가야 할 시간 보기'가 여기로 온다.
       지금 값은 밤이면 무한대라 쓸모가 없으니 내일 창을 기준으로 보여 준다. */
    if (rx.tomorrow && rx.tomorrow.window) return rx.tomorrow.window.best;
    return rx.nowPoint;
  }

  function paint() {
    var running = TimerService.isRunning();
    var s = running ? TimerService.snapshot() : null;
    var p = running ? s.point : previewPoint();
    var w = rx ? (rx.activeWindow || rx.targetWindow) : null;

    var seconds = running ? s.remainingSec : (p && isFinite(p.minutes) ? Math.round(p.minutes * 60) : null);
    var pct = running ? Math.min(1, s.dose) : 0;

    el.innerHTML =
      '<div class="hdr">' +
        '<div class="hdr-l">' +
          '<div class="hdr-t">노출 타이머</div>' +
          '<div class="hdr-d">' + (running ? '지금 쬐는 중이에요' : '차림을 바꾸면 즉시 다시 계산돼요') + '</div>' +
        '</div>' +
        '<div class="hdr-acts">' +
          '<button class="iconbtn" id="t-home" aria-label="홈으로">' + UI.ICON.back + '</button>' +
          '<button class="iconbtn" id="t-week" aria-label="기록 보기">' + UI.ICON.week + '</button>' +
        '</div>' +
      '</div>' +

      '<div class="timer-wrap">' +
        '<div class="timer-card">' +
          '<div class="top-mode ' + (running ? 'mode-normal' : 'mode-cloudy') + '">' +
            '<span class="dot"></span>' + (running ? '노출 중' : '대기 중') +
          '</div>' +

          '<div class="ring">' +
            '<svg width="100%" height="100%" viewBox="0 0 250 250">' +
              '<defs><pattern id="tring" width="5" height="5" patternUnits="userSpaceOnUse" ' +
                'patternTransform="rotate(45)">' +
                '<line x1="0" y1="0" x2="0" y2="5" stroke="#DCE3EE" stroke-width="2.6"/>' +
              '</pattern></defs>' +
              '<circle cx="125" cy="125" r="' + R + '" fill="none" stroke="url(#tring)" stroke-width="15"/>' +
              '<circle id="t-arc" cx="125" cy="125" r="' + R + '" fill="none" stroke="#2B63F6" ' +
                'stroke-width="15" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" ' +
                'stroke-dashoffset="' + (C * (1 - pct)).toFixed(1) + '" ' +
                'style="transition:stroke-dashoffset .5s linear"/>' +
            '</svg>' +
            '<div class="ring-in">' +
              '<div class="ring-num" id="t-clock">' + clock(seconds) + '</div>' +
              '<div class="ring-lab" id="t-lab">' + label(running, s, p) + '</div>' +
              '<div class="ring-pct" id="t-pct">' + (running ? s.percent + '% 충전' : chargeHint(w)) + '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="timer-live" id="t-live">' + liveText(running, s, p) + '</div>' +
      '</div>' +

      '<div id="t-act-idle" class="btn-wrap" style="margin-top:12px"' + (running ? ' hidden' : '') + '>' +
        '<button class="btn btn-primary" id="t-start">' + UI.ICON.play + '나갈게요</button>' +
      '</div>' +
      '<div id="t-act-run" class="btn-row" style="margin-top:12px"' + (running ? '' : ' hidden') + '>' +
        '<button class="btn btn-sub" id="t-stop">그만할래요</button>' +
        '<button class="btn btn-primary" id="t-done">다 채웠어요</button>' +
      '</div>' +

      gearSec() +

      '<div class="sec">' +
        '<div class="card"><div class="card-t">🔁 중간에 바꿔도 됩니다</div>' +
          '<div class="card-b">옷차림을 바꾸면 남은 시간이 즉시 다시 계산됩니다. ' +
          '지나간 시간은 그때의 조건으로 이미 적립돼 있어요.</div>' +
        '</div>' +
      '</div>';

    bind();
  }

  function label(running, s, p) {
    if (running) return s.limitLabel + ' 기준 남은 시간';
    if (!p || !isFinite(p.minutes)) return '지금은 나가도 효과가 없어요';
    if (rx && rx.activeWindow) return '지금 나가면 필요한 시간';
    if (rx && rx.targetWindow) return '다음 창에서 필요한 시간';
    if (rx && rx.tomorrow && rx.tomorrow.window) return '내일 창에서 필요한 시간';
    return '다음 창에서 필요한 시간';
  }

  function chargeHint(w) {
    if (!rx) return '';
    if (rx.activeWindow) return '창은 ' + UI.hm(rx.activeWindow.end) + '까지';
    if (w) return UI.hmk(w.recommendStart) + '부터 열려요';
    if (rx.tomorrow && rx.tomorrow.window)
      return '오늘은 창이 없어요 · 내일 ' + UI.hmk(rx.tomorrow.window.recommendStart) + '부터';
    return '오늘은 열린 창이 없어요';
  }

  /* ---------- 옷차림 (즉시 반영) ---------- */
  function gearSec() {
    var p = Repo.getProfile();
    return '<div class="sec">' +
      '<div class="c-head">' +
        '<div class="c-ico">👕</div>' +
        '<div class="c-t">지금 차림<small>바꾸면 바로 다시 계산됩니다</small></div>' +
      '</div>' +
      '<div class="seg" id="t-cloth">' +
        Object.keys(Engine.CLOTHING).map(function (k) {
          return '<button data-c="' + k + '"' + (p.clothing === k ? ' class="on"' : '') + '>' +
                 Engine.CLOTHING[k].label + '</button>';
        }).join('') +
      '</div></div>';
  }

  /* ---------- 이벤트 ---------- */
  function bind() {
    var q = function (id) { return document.getElementById(id); };

    if (q('t-home')) q('t-home').onclick = function () { App.go('home'); };
    if (q('t-week')) q('t-week').onclick = function () { App.go('weekly'); };

    q('t-start').onclick = function () {
      if (!rx) return UI.toast('예보를 불러오는 중이에요');
      TimerService.start(rx, rx.activeWindow || rx.targetWindow);
      q('t-act-idle').hidden = true;
      q('t-act-run').hidden = false;
      var mode = el.querySelector('.top-mode');
      mode.className = 'top-mode mode-normal';
      mode.innerHTML = '<span class="dot"></span>노출 중';
      update(TimerService.tick());
      startLoop();
    };
    q('t-stop').onclick = function () { end(false); };
    q('t-done').onclick = function () { end(true); };

    [].forEach.call(el.querySelectorAll('#t-cloth button'), function (b) {
      b.onclick = function () { setGear({ clothing: b.dataset.c }); };
    });
  }

  function setGear(patch) {
    Repo.setProfile(patch);
    App.invalidate();
    var p = Repo.getProfile();
    [].forEach.call(el.querySelectorAll('#t-cloth button'), function (b) {
      b.classList.toggle('on', b.dataset.c === p.clothing);
    });

    if (TimerService.isRunning()) {
      update(TimerService.tick());
    } else {
      /* 정지 상태에서도 예상 시간이 바로 바뀌어야 한다 */
      rx = App.prescription() || rx;
      var pt = previewPoint();
      document.getElementById('t-clock').textContent =
        clock(pt && isFinite(pt.minutes) ? Math.round(pt.minutes * 60) : null);
      document.getElementById('t-live').innerHTML = liveText(false, null, pt);
    }
  }

  /* ---------- 루프 ---------- */
  function startLoop() {
    stopLoop();
    loop = setInterval(function () {
      var s = TimerService.tick();
      if (!s) return stopLoop();
      update(s);
      if (s.done) end(true);
    }, 1000);
  }
  function stopLoop() { if (loop) { clearInterval(loop); loop = null; } }

  function update(s) {
    var q = function (id) { return document.getElementById(id); };
    if (!q('t-clock')) return;
    q('t-clock').textContent = clock(s.remainingSec);
    q('t-lab').textContent = s.limitLabel + ' 기준 남은 시간';
    q('t-pct').textContent = s.percent + '% 충전';
    q('t-live').innerHTML = liveText(true, s, s.point);
    var arc = q('t-arc');
    if (arc) arc.setAttribute('stroke-dashoffset', C * (1 - Math.min(1, s.dose)));
  }

  /* 지금 조건 — 세 지표 타일 + 설명 한 줄. 1초마다 다시 그려지므로 항상 최신이다. */
  function liveText(running, s, p) {
    if (!p) return '<div class="tnote">예보를 불러오는 중이에요</div>';

    var tiles = '<div class="tstat-duo">' +
      '<div class="tstat-duo-i"><b>' + p.heatIndexC.toFixed(0) + '℃</b><span>체감온도</span></div>' +
      '<div class="tstat-duo-i"><b>' + p.altitude.toFixed(0) + '°</b><span>태양고도</span></div>' +
    '</div>';

    var body = '이 조건에서 필요한 시간 <b>' + UI.mins(p.vitd) + '</b>' +
      (running ? ' · 경과 <b>' + Math.floor(s.elapsedSec / 60) + '분 ' + (s.elapsedSec % 60) + '초</b>' : '');

    /* 안전 한계가 목표보다 먼저 오면, 이 차림으로는 목표를 못 채운다는 걸 분명히 말해 준다.
       (노출 면적이 적을수록 필요시간은 길어지는데 화상 한계는 그대로라서 생기는 상황) */
    var cap = capNote(p);
    if (cap) body += '<br><span style="color:#F0475B;font-weight:700">' + cap + '</span>';

    return tiles + '<div class="tnote">' + body + '</div>';
  }

  /* 목표(비타민D)보다 먼저 걸리는 한계가 있으면 그 이유와 '해법'을 한 줄로.
     한계에 걸린다고 끝이 아니라, 나눠 쬐면 목표를 채울 수 있다는 게 핵심이다. */
  function capNote(p) {
    if (!isFinite(p.vitd)) return '';
    if (p.heat <= 0) return '⚠️ 더위 때문에 지금은 나가면 안 돼요 — 시원해지면 다시 알려드릴게요';

    if (p.heat < p.vitd) {
      var times = Math.ceil(p.vitd / p.heat);
      return '⚠️ 더위 때문에 한 번에 ' + UI.mins(p.heat) + '까지예요. ' +
             '목표를 채우려면 <u>' + UI.mins(p.heat) + '씩 ' + times + '번 나눠서</u> 나가세요' +
             (p.heatNote ? ' · ' + p.heatNote : '');
    }
    if (p.burn < p.vitd) {
      return '⚠️ 화상 한계 ' + UI.mins(p.burn) + '에 먼저 걸려요 — 이 차림으론 목표를 못 채웁니다. ' +
             '팔·다리를 더 내놓으면 필요시간이 줄어요';
    }
    return '';
  }

  function clock(sec) {
    if (sec == null || !isFinite(sec)) return '--:--';
    var m = Math.floor(sec / 60), r = Math.floor(sec % 60);
    return UI.p2(m) + ':' + UI.p2(r);
  }

  function end(completed) {
    stopLoop();
    var out = TimerService.stop();
    if (out) {
      if (completed) Notify.done(out.minutes, out.percent);
      UI.toast(completed
        ? '들어오세요 · ' + out.minutes + '분, ' + out.percent + '% 충전'
        : out.minutes + '분 기록했어요 · ' + out.percent + '% 충전');
    }
    App.invalidate();
    rx = App.prescription() || rx;
    paint();
  }

  return { render: render, stopLoop: stopLoop };
})();
