/* =========================================================
   기능: 타이머 시작 전 확인 — 바텀시트

   타이머를 시작하는 모든 곳(홈의 '타이머 시작' · 햇빛 시간 줄 · 타이머 화면의 '나갈게요')에서
   바로 시작하지 않고 가운데 확인 창을 먼저 띄운다.
     · '아니요' → 바로 시작
     · '네, 바꿀게요' → 아래 시트에서 지역 · 피부 타입 · 차림 · 쬐는 곳을 고친 뒤 '이대로 시작'
     · 지역 · 지금 차림 · 쬐는 곳을 지난번 값 그대로 보여 주고, 바뀌었으면 여기서 고친다.
     · 고르면 바로 저장되고(타이머 화면의 차림·장소와 같은 값), 필요한 시간이 그 자리에서 다시 계산된다.
     · '이대로 시작'을 눌러야 타이머가 시작된다. 바깥을 누르면 시작하지 않고 닫힌다.
   이미 쬐는 중이면 띄우지 않는다(바로 타이머 화면으로).
   ========================================================= */
var TimerCheck = (function () {

  var onGo = null, win = null;

  /* 열기 — go: 시작할 때 할 일, w: 시작할 햇빛 시간(없으면 지금 열린 시간)
     먼저 가운데 확인 창으로 묻고, 바꿀 게 있다고 하면 그때 시트를 연다. */
  function open(go, w) {
    onGo = go; win = w || null;
    confirmBox();
  }

  function openSheet() {
    UI.sheet('나가기 전에 확인해요', '바뀐 걸 고르면 필요한 시간이 바로 바뀌어요.', body());
    bind();
  }

  function start() {
    var go = onGo; onGo = null;
    if (go) go();
  }

  /* ---------- 가운데 확인 창 ---------- */
  var WARN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
             '<path d="M12 9.5v4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="16.9" r="1.25" fill="currentColor"/></svg>';

  function confirmBox() {
    var bg = document.getElementById('tc-modal');
    if (!bg) {
      bg = document.createElement('div');
      bg.className = 'tc-modal-bg';
      bg.id = 'tc-modal';
      (document.querySelector('.phone') || document.body).appendChild(bg);
    }
    bg.innerHTML =
      '<div class="tc-modal" role="alertdialog" aria-modal="true" aria-labelledby="tc-m-t">' +
        '<div class="tc-m-ic">' + WARN + '</div>' +
        '<div class="tc-m-t" id="tc-m-t">혹시 어디 놀러 갔다가<br>피부가 타진 않았나요?</div>' +
        '<div class="tc-m-d">지역이나 옷차림, 쬐는 곳이 바뀌면<br>필요한 시간도 달라져요.</div>' +
        '<div class="tc-m-btns">' +
          '<button class="btn btn-sub" id="tc-m-yes">네, 바꿀게요</button>' +
          '<button class="btn btn-primary" id="tc-m-no">아니요, 바로 시작</button>' +
        '</div>' +
      '</div>';
    bg.classList.add('show');
    function close() { bg.classList.remove('show'); }
    document.getElementById('tc-m-yes').onclick = function () { close(); openSheet(); };
    document.getElementById('tc-m-no').onclick = function () { close(); start(); };
    bg.onclick = function (e) { if (e.target === bg) { close(); onGo = null; } };   // 바깥을 누르면 시작하지 않고 닫는다
  }

  function body() {
    var p = Repo.getProfile(), loc = Repo.getLocation();
    return '<div class="tc">' +
      '<button class="tc-row" id="tc-region">' +
        '<span class="tc-lab">지역</span>' +
        '<span class="tc-val">' + (loc ? UI.esc(loc.name) : '설정 안 됨') + '<i>바꾸기</i></span>' +
      '</button>' +

      '<div class="tc-sec">' +
        '<div class="tc-lab">피부 타입 <span class="tc-sub">햇볕에 타서 피부색이 바뀌었으면 고쳐 주세요</span></div>' +
        '<div class="seg tc-skin" id="tc-skin">' +
          [1, 2, 3, 4, 5, 6].map(function (t) {
            return '<button data-t="' + t + '"' + (p.skinType === t ? ' class="on"' : '') + '>' + 'ⅠⅡⅢⅣⅤⅥ'[t - 1] + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +

      '<div class="tc-sec">' +
        '<div class="tc-lab">지금 차림</div>' +
        '<div class="seg" id="tc-cloth">' +
          Object.keys(Engine.CLOTHING).map(function (k) {
            return '<button data-c="' + k + '"' + (p.clothing === k ? ' class="on"' : '') + '>' +
                   Engine.CLOTHING[k].label + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +

      '<div class="tc-sec">' +
        '<div class="tc-lab">쬐는 곳</div>' +
        '<div class="seg tc-place" id="tc-place">' +
          Object.keys(Engine.PLACES).map(function (k) {
            return '<button data-p="' + k + '"' + ((p.place || 'normal') === k ? ' class="on"' : '') + '>' +
                   Engine.PLACES[k].label + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +

      '<div class="tc-est" id="tc-est">' + estimate() + '</div>' +

      '<button class="btn btn-primary tc-go" id="tc-go">' + UI.ICON.play + '이대로 시작</button>' +
    '</div>';
  }

  /* 지금 고른 조건으로 필요한 시간 — 타이머 화면의 대기 중 숫자와 같은 계산 */
  function estimate() {
    var rx = App.prescription();
    if (!rx) return '예보를 불러오는 중이에요';
    var w = win || rx.activeWindow || rx.targetWindow;
    var pt = rx.activeWindow ? rx.nowPoint : (w ? w.best : rx.nowPoint);
    var carried = TimerService.carriedToday(rx);
    if (carried >= 1) return '오늘 필요한 양은 <b>다 채웠어요</b> · 안전 한계까지만 더 쬘 수 있어요';
    if (!pt || !isFinite(pt.minutes)) return '지금은 햇빛을 쬐어도 비타민D가 거의 안 생겨요';
    var min = Math.max(1, Math.round(pt.minutes * (1 - carried)));
    return '이 조건이면 <b>약 ' + min + '분</b> 쬐면 돼요' + (carried > 0 ? ' (오늘 채운 몫은 빼고)' : '');
  }

  function bind() {
    var sheet = document.getElementById('sheet-body');
    var q = function (id) { return document.getElementById(id); };

    [].forEach.call(sheet.querySelectorAll('#tc-skin button'), function (b) {
      b.onclick = function () { set({ skinType: +b.dataset.t }); };
    });
    [].forEach.call(sheet.querySelectorAll('#tc-cloth button'), function (b) {
      b.onclick = function () { set({ clothing: b.dataset.c }); };
    });
    [].forEach.call(sheet.querySelectorAll('#tc-place button'), function (b) {
      b.onclick = function () { set({ place: b.dataset.p }); };
    });

    /* 지역은 원래 지역 시트로 — 바꾸고 나면 예보를 새로 받으니 시작 버튼을 다시 누른다 */
    q('tc-region').onclick = function () { SettingsView.regionSheet(); };

    q('tc-go').onclick = function () {
      UI.closeSheet();
      start();
    };
  }

  function set(patch) {
    Repo.setProfile(patch);
    App.invalidate();
    var p = Repo.getProfile(), sheet = document.getElementById('sheet-body');
    [].forEach.call(sheet.querySelectorAll('#tc-skin button'), function (b) {
      b.classList.toggle('on', +b.dataset.t === p.skinType);
    });
    [].forEach.call(sheet.querySelectorAll('#tc-cloth button'), function (b) {
      b.classList.toggle('on', b.dataset.c === p.clothing);
    });
    [].forEach.call(sheet.querySelectorAll('#tc-place button'), function (b) {
      b.classList.toggle('on', b.dataset.p === (p.place || 'normal'));
    });
    document.getElementById('tc-est').innerHTML = estimate();
  }

  return { open: open };
})();
