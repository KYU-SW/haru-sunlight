/* =========================================================
   관리자 대시보드 — 화면
   admin.html 전용. 앱(index.html)과 같은 Firebase 로그인 상태를 쓴다.
   앱 로그인 화면에서 관리자 계정으로 로그인하면 이 화면으로 넘어와 바로 기록을 읽는다.
   (그 브라우저의 앱은 관리자 계정으로 로그인된 상태가 된다. 로그아웃하면 앱은 다시 게스트로 시작한다.)

   데이터
     · 타이머 기록  — Firestore users · sessions (관리자 계정만 읽힘, firestore.rules isAdmin)
     · 예시 데이터  — 기록이 쌓이기 전 화면 확인용. 화면 위에 '예시'가 계속 보인다.
   설문은 따로 진행한다. 여기서는 앱이 모은 객관적 기록만 본다.
   참가자 수는 따로 정하지 않는다 — Firestore에 들어온 사람 수가 곧 분모다.
   ========================================================= */
var AdminView = (function () {

  var S = AdminStats;
  var KEY_CFG = 'sunrx.admin.cfg';

  var state = {
    mode: null,            // 'live' | 'demo'
    email: null,
    users: [], sessions: [],
    tab: 'summary',
    loading: false
  };
  var app = null, auth = null, db = null;

  /* ---------- 저장 (이 브라우저에만) ---------- */
  function load(k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var DEFAULT_CFG = { start: '', weeks: 0, stampMin: 5, growth: 20 };
  function cfg() {
    var c = load(KEY_CFG, {}), o = {};
    for (var k in DEFAULT_CFG) o[k] = c[k] !== undefined ? c[k] : DEFAULT_CFG[k];
    if (state.mode === 'demo' && !o.start) { var d = AdminDemo.data(); o.start = d.start; o.weeks = d.weeks; }   // 예시 데이터의 기간
    return o;
  }

  /* ---------- 작은 도구 ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(x, d) { return (x === null || x === undefined || isNaN(x)) ? '—' : (+x).toFixed(d === undefined ? 1 : d).replace(/\.0+$/, ''); }
  function pct(x, d) { return (x === null || x === undefined || isNaN(x)) ? '—' : fmt(x * 100, d === undefined ? 0 : d) + '%'; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  /* =========================================================
     Firebase — 관리자 로그인
     ========================================================= */
  function initFirebase() {
    try {
      if (!window.firebase || !window.FIREBASE_CONFIG) return false;
      /* 앱과 같은 로그인 상태를 쓴다 — 앱 로그인 화면에서 관리자로 로그인하면 여기로 바로 넘어온다 */
      app = firebase.apps.length ? firebase.app() : firebase.initializeApp(window.FIREBASE_CONFIG);
      auth = app.auth();
      db = app.firestore();
      return true;
    } catch (e) { console.warn('[Admin] Firebase 초기화 실패', e); return false; }
  }

  /* 관리자 아이디 — '@' 없이 적으면 프로젝트 주소를 붙여 Firebase 로그인용 이메일로 만든다.
     예: admin → admin@haru-sunlight.firebaseapp.com (실제로 메일을 받는 주소가 아니다) */
  var ADMIN_DOMAIN = 'haru-sunlight.firebaseapp.com';
  function toEmail(id) { id = String(id || '').trim(); return id.indexOf('@') < 0 && id ? id + '@' + ADMIN_DOMAIN : id; }
  function showId(email) { email = email || ''; return email.slice(-ADMIN_DOMAIN.length - 1) === '@' + ADMIN_DOMAIN ? email.slice(0, -ADMIN_DOMAIN.length - 1) : email; }

  function errText(e) {
    var c = (e && e.code) || '';
    if (/wrong-password|invalid-credential|user-not-found|invalid-login/.test(c)) return '아이디나 비밀번호가 맞지 않아요';
    if (/invalid-email/.test(c)) return '아이디에는 영문·숫자만 써 주세요';
    if (/too-many-requests/.test(c)) return '시도가 너무 많았어요. 잠시 뒤에 다시 해 주세요';
    if (/network/.test(c)) return '인터넷 연결을 확인해 주세요';
    if (/permission-denied/.test(c)) return '이 계정은 관리자 목록에 없어요';
    return '로그인하지 못했어요 (' + c + ')';
  }

  function fetchLive() {
    state.loading = true; render();
    return Promise.all([db.collection('users').get(), db.collection('sessions').get()])
      .then(function (r) {
        /* 지금 로그인한 관리자 계정의 문서는 참가자에서 뺀다 (관리자가 앱에서 동의·타이머를 눌러도 섞이지 않게) */
        var me = auth.currentUser ? auth.currentUser.uid : null;
        state.users = r[0].docs.filter(function (d) { return d.id !== me; })
          .map(function (d) { var x = d.data(); x.uid = d.id; return x; });
        state.sessions = r[1].docs.map(function (d) { return d.data(); })
          .filter(function (x) { return x.uid !== me; });
        state.mode = 'live'; state.loading = false; state.error = null;
        render();
      })
      .catch(function (e) {
        state.loading = false;
        state.error = (e && e.code === 'permission-denied') ? 'denied' : ('읽지 못했어요 (' + ((e && e.code) || e) + ')');
        render();
      });
  }

  /* =========================================================
     렌더
     ========================================================= */
  function render() {
    var root = $('admin');
    if (!state.mode && !state.loading) { root.innerHTML = loginHtml(); bindLogin(); return; }
    if (state.loading) { root.innerHTML = '<div class="ad-center"><p class="ad-muted">기록을 불러오는 중이에요…</p></div>'; return; }

    var c = cfg();
    var rec = S.records(state.sessions, state.users, { start: c.start || null, weeks: +c.weeks || 0, stampMin: +c.stampMin, today: today() });
    var ctx = { c: c, rec: rec };

    root.innerHTML =
      '<header class="ad-top">' +
        '<div class="ad-top-in">' +
          '<h1 class="ad-logo">하루<span>햇빛</span> <em>관리자</em></h1>' +
          (state.mode === 'demo' ? '<span class="ad-chip">예시 데이터</span>' : '<span class="ad-chip on">실제 기록</span>') +
          '<div class="ad-top-r">' +
            (state.mode === 'live' ? '<span class="ad-muted">' + esc(state.email) + '</span><button class="ad-link" id="ad-reload">새로고침</button>' : '') +
            '<button class="ad-link" id="ad-out">' + (state.mode === 'live' ? '로그아웃' : '나가기') + '</button>' +
          '</div>' +
        '</div>' +
        '<nav class="ad-tabs" role="tablist">' +
          tabBtn('summary', '요약') + tabBtn('records', '타이머 기록') + tabBtn('settings', '설정') +
        '</nav>' +
      '</header>' +
      '<main class="ad-main">' +
        (state.error === 'denied' ? '<div class="ad-note">이 계정은 관리자가 아니라서 기록을 볼 수 없어요.</div>' :
          state.error ? '<div class="ad-note">' + esc(state.error) + '</div>' : '') +
        ({ summary: summaryHtml, records: recordsHtml, settings: settingsHtml }[state.tab])(ctx) +
      '</main>';
    bindMain(ctx);
  }

  function tabBtn(id, label) {
    return '<button role="tab" data-tab="' + id + '" class="' + (state.tab === id ? 'on' : '') + '" aria-selected="' + (state.tab === id) + '">' + label + '</button>';
  }

  /* ---------- 로그인 ---------- */
  function loginHtml() {
    var ok = !!auth;
    return '<div class="ad-center"><div class="ad-login">' +
      '<h1 class="ad-logo big">하루<span>햇빛</span></h1>' +
      '<p class="ad-login-t">관리자 대시보드</p>' +
      (ok ? (
        '<label class="ad-field"><span>관리자 아이디</span><input id="ad-email" type="text" autocomplete="username" autocapitalize="off" spellcheck="false"></label>' +
        '<label class="ad-field"><span>비밀번호</span><input id="ad-pw" type="password" autocomplete="current-password"></label>' +
        '<p class="ad-err" id="ad-err" role="alert"></p>' +
        '<button class="ad-btn" id="ad-login">로그인</button>'
      ) : '<p class="ad-muted">Firebase에 연결하지 못했어요. 예시 데이터로 화면을 볼 수 있어요.</p>') +
      '<button class="ad-btn sub" id="ad-demo">예시 데이터로 보기</button>' +
      '<p class="ad-foot">관리자 계정으로만 볼 수 있어요.</p>' +
    '</div></div>';
  }

  function bindLogin() {
    $('ad-demo').onclick = startDemo;
    if (!$('ad-login')) return;
    var go = function () {
      var email = toEmail($('ad-email').value), pw = $('ad-pw').value;
      if (!email || !pw) { $('ad-err').textContent = '아이디와 비밀번호를 입력해 주세요'; return; }
      $('ad-login').disabled = true; $('ad-err').textContent = '';
      auth.signInWithEmailAndPassword(email, pw).then(function (cred) {
        state.email = showId(cred.user.email);
        fetchLive();
      }).catch(function (e) { $('ad-err').textContent = errText(e); $('ad-login').disabled = false; });
    };
    $('ad-login').onclick = go;
    $('ad-pw').onkeydown = function (e) { if (e.key === 'Enter') go(); };
  }

  function startDemo() {
    var d = AdminDemo.data();
    state.mode = 'demo'; state.users = d.users; state.sessions = d.sessions; state.error = null;
    render();
  }

  /* =========================================================
     차트 (SVG, 라이브러리 없음) — 파랑 한 가지 + 사전은 흐린 글자색
     ========================================================= */
  var W = 560, H = 220, PAD = { l: 40, r: 16, t: 18, b: 30 };

  function niceMax(v) {
    if (!(v > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  }
  function yGrid(max, h, fmtY) {
    var g = '', unit = fmtY ? max * 100 : max;                  // 눈금이 딱 떨어지게 4칸 또는 5칸
    var n = (unit / 5) % 1 === 0 && (unit / 4) % 1 !== 0 ? 5 : ((unit / 4) % 1 === 0 ? 4 : 5);
    for (var i = 0; i <= n; i++) {
      var v = max * i / n, y = PAD.t + h - h * i / n;
      g += '<line class="g" x1="' + PAD.l + '" x2="' + (W - PAD.r) + '" y1="' + y + '" y2="' + y + '"/>' +
        '<text class="ax" x="' + (PAD.l - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + (fmtY ? fmtY(v) : fmt(v, 0)) + '</text>';
    }
    return g;
  }

  /* 주차별 평균 + 95% 신뢰구간 음영 */
  function lineCI(pts, unit) {
    if (!pts.length) return empty();
    var h = H - PAD.t - PAD.b, w = W - PAD.l - PAD.r;
    var max = niceMax(Math.max.apply(null, pts.map(function (p) { return Math.max(p.ci[1], p.mean); })));
    var x = function (i) { return PAD.l + (pts.length === 1 ? w / 2 : w * i / (pts.length - 1)); };
    var y = function (v) { return PAD.t + h - h * Math.max(0, v) / max; };
    var band = pts.map(function (p, i) { return x(i) + ',' + y(p.ci[1]); }).concat(
      pts.slice().reverse().map(function (p, j) { return x(pts.length - 1 - j) + ',' + y(p.ci[0]); })).join(' ');
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(i) + ',' + y(p.mean); }).join('');
    var g = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="ad-svg" role="img" aria-label="주별 햇빛 쬔 시간">' + yGrid(max, h) +
      '<polygon class="band" points="' + band + '"/><path class="ln" d="' + line + '"/>';
    pts.forEach(function (p, i) {
      var last = i === pts.length - 1 || i === 0;
      g += '<g class="pt"><rect class="hit" x="' + (x(i) - 24) + '" y="' + PAD.t + '" width="48" height="' + h + '"/>' +
        '<circle cx="' + x(i) + '" cy="' + y(p.mean) + '" r="4.5"/>' +
        (last ? '<text class="val" x="' + x(i) + '" y="' + (y(p.mean) - 12) + '" text-anchor="middle">' + fmt(p.mean) + unit + '</text>' : '') +
        '<text class="ax" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + p.week + '주</text>' +
        '<title>' + p.week + '주째 (' + p.from + '~)\n한 사람 평균 ' + fmt(p.mean) + unit + ' · 오차 범위 ' + fmt(Math.max(0, p.ci[0])) + '~' + fmt(p.ci[1]) + unit + '</title></g>';
    });
    return g + '</svg>';
  }

  function empty() { return '<div class="ad-empty">아직 데이터가 없어요</div>'; }

  /* 며칠 했는지를 몇 구간으로 묶어 '구간 — 막대 — 몇 명'으로 보여 준다.
     세로 막대 히스토그램은 가로·세로 축을 읽어야 해서 알아보기 어려웠다. */
  var DAY_GROUPS = [[0, 0, '0일'], [1, 3, '1~3일'], [4, 7, '4~7일'], [8, 14, '8~14일'], [15, Infinity, '15일 이상']];
  function groups(values) {
    var counts = DAY_GROUPS.map(function (g) {
      return values.filter(function (v) { return v >= g[0] && v <= g[1]; }).length;
    });
    var total = values.length, max = Math.max.apply(null, counts.concat([1]));
    if (!total) return empty();
    return '<div class="ad-hbars">' + DAY_GROUPS.map(function (g, i) {
      return '<div class="ad-hbar"><span class="ad-hbar-l">' + g[2] + '</span>' +
        '<span class="ad-hbar-t"><i style="width:' + (counts[i] / max * 100) + '%"></i></span>' +
        '<b>' + counts[i] + '명</b></div>';
    }).join('') + '</div>';
  }

  /* ---------- 공통 조각 ---------- */
  function card(title, body, sub) {
    return '<section class="ad-card"><div class="ad-card-h"><h3>' + title + '</h3>' + (sub ? '<span class="ad-muted">' + sub + '</span>' : '') + '</div>' + body + '</section>';
  }
  function rows(list) {
    return '<div class="ad-rows">' + list.map(function (r) {
      return '<div class="ad-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
    }).join('') + '</div>';
  }
  function pill(ok, labelOk, labelNo) {
    if (ok === null) return '<span class="ad-pill none">데이터 없음</span>';
    return ok ? '<span class="ad-pill ok">' + (labelOk || '목표 달성') + '</span>' : '<span class="ad-pill no">' + (labelNo || '목표 미달') + '</span>';
  }
  function table(head, body) {
    return '<div class="ad-tw"><table class="ad-t"><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + body.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div>';
  }

  /* =========================================================
     탭 ① 요약
     ========================================================= */
  function growth(rec) {
    var w = rec.weekly;
    if (w.length < 2 || !(w[0].mean > 0)) return null;
    return w[w.length - 1].mean / w[0].mean - 1;
  }

  function summaryHtml(x) {
    var rec = x.rec, c = x.c, w = rec.weekly;
    var g = growth(rec);
    var tiles = [
      { lab: '일주일에 햇빛 쬔 시간', val: w.length ? '첫 주 ' + fmt(w[0].mean) + '분 → <b>' + fmt(w[w.length - 1].mean) + '분</b>' : '—',
        sub: g === null ? '한 사람 평균 · 첫 주와 마지막 주 비교' : '한 사람 평균 · 첫 주보다 ' + pct(Math.abs(g)) + (g >= 0 ? ' 늘었어요' : ' 줄었어요'),
        ok: g === null ? null : g * 100 >= c.growth, goal: '목표: ' + c.growth + '% 이상 늘기' },
      { lab: '등록한 사람', val: '<b>' + rec.n + '</b>명', sub: '타이머를 쓴 사람 ' + rec.withData + '명 · 타이머 ' + rec.sessions + '번' },
      { lab: '2주 넘게 쓴 사람', val: '<b>' + rec.retained + '</b> / ' + rec.n + '명', sub: '처음 쓴 날부터 2주 뒤에도 타이머를 켠 사람' },
      { lab: '하루 목표를 다 채운 날', val: '한 사람당 <b>' + fmt(S.mean(rec.goals)) + '</b>일', sub: '비타민D 하루 목표를 100% 채운 날' },
      { lab: c.stampMin + '분 이상 쬔 날', val: '한 사람당 <b>' + fmt(S.mean(rec.stamps)) + '</b>일', sub: '앱에서 스탬프를 받은 날' },
      { lab: '하루에 채운 양', val: '평균 <b>' + fmt(rec.avgCharge, 0) + '%</b>', sub: '타이머를 쓴 날 기준 · 100%면 하루 목표만큼' }
    ];
    return '<div class="ad-hd"><h2>한눈에 보기</h2><p class="ad-muted">' + periodText(rec) + '</p></div>' +
      '<div class="ad-tiles">' + tiles.map(function (t) {
        return '<div class="ad-tile"><span class="ad-lab">' + t.lab + '</span><div class="ad-big">' + t.val + '</div>' +
          '<span class="ad-muted">' + t.sub + '</span>' + (t.ok !== undefined ? '<div class="ad-tile-f">' + pill(t.ok) + '<span class="ad-muted">' + t.goal + '</span></div>' : '') + '</div>';
      }).join('') + '</div>' +
      card('주별 햇빛 쬔 시간 (한 사람 평균)', lineCI(w, '분'), rec.n + '명 기준 · 연한 띠는 오차 범위');
  }
  function periodText(rec) {
    if (!rec.start) return '아직 기록이 없어요';
    return rec.start + ' ~ ' + rec.end + ' (' + rec.weeks + '주) · ' + rec.n + '명 · 타이머 ' + rec.sessions + '번';
  }

  /* =========================================================
     탭 ② 타이머 기록
     ========================================================= */
  function recordsHtml(x) {
    var rec = x.rec, c = x.c;
    var people = rec.people.slice().sort(function (a, b) { return b.total - a.total; });
    return '<div class="ad-hd"><h2>타이머 기록</h2><p class="ad-muted">' + periodText(rec) + '</p></div>' +
      '<div class="ad-grid2">' +
        card('주별 햇빛 쬔 시간 (한 사람 평균)', lineCI(rec.weekly, '분') +
          table(['주', '시작일', '한 사람 평균(분)', '오차 범위(분)', '모두 합친 시간(분)'], rec.weekly.map(function (p) {
            return [p.week + '주', p.from, fmt(p.mean), fmt(Math.max(0, p.ci[0])) + ' ~ ' + fmt(p.ci[1]), fmt(p.total, 0)];
          })), '타이머를 안 쓴 사람은 0분으로 계산해요') +
        card('숫자로 보기', rows([
          ['등록한 사람', rec.n + '명'],
          ['타이머를 쓴 사람', rec.withData + '명'],
          [c.stampMin + '분 이상 쬔 날 (한 사람당)', fmt(S.mean(rec.stamps)) + '일'],
          ['하루 목표를 다 채운 날 (한 사람당)', fmt(S.mean(rec.goals)) + '일'],
          ['하루에 채운 양 (평균)', fmt(rec.avgCharge, 0) + '%'],
          ['가장 오래 안 쓴 기간 (보통)', fmt(rec.gapMedian, 0) + '일'],
          ['2주 넘게 쓴 사람', rec.retained + ' / ' + rec.n + '명'],
          ['첫 주보다 마지막 주에 더 쬔 사람', rec.improved === null ? '—' : rec.improved + '명'],
          ['알림 켠 사람 · 일주일 평균', fmt(rec.notify.onMean) + '분 (' + rec.notify.on + '명)'],
          ['알림 끈 사람 · 일주일 평균', fmt(rec.notify.offMean) + '분 (' + rec.notify.off + '명)']
        ])) +
        card(c.stampMin + '분 이상 쬔 날이 며칠인 사람이 몇 명?', groups(rec.stamps), '예: 8~14일 줄의 숫자 = 그만큼 쬔 사람 수') +
        card('하루 목표를 다 채운 날이 며칠인 사람이 몇 명?', groups(rec.goals), '예: 0일 줄의 숫자 = 한 번도 못 채운 사람 수') +
      '</div>' +
      card('사람별 기록', '<div class="ad-bar-r"><span class="ad-muted">이름 대신 익명 ID 앞 6자리만 보여요.</span>' +
          '<button class="ad-btn sm sub" id="ad-csv">기록 CSV 내려받기</button></div>' +
        table(['ID', '쓴 날', '쬔 시간 합계(분)', c.stampMin + '분 이상 쬔 날', '목표 다 채운 날', '가장 오래 안 쓴 기간', '2주 넘게 사용', '알림'],
          people.map(function (p) {
            return ['<code>' + esc(p.uid.slice(0, 6)) + '</code>', p.days + '일', fmt(p.total, 0), p.stamps, p.goals, p.gap + '일', p.retained ? '예' : '아니오', p.notify ? '켬' : '끔'];
          })));
  }

  /* =========================================================
     탭 ③ 설정 (8절 — 팀이 정할 것)
     ========================================================= */
  function settingsHtml(x) {
    var c = x.c;
    function f(id, label, val, type, help) {
      return '<label class="ad-field"><span>' + label + '</span><input id="' + id + '" type="' + type + '" value="' + esc(val) + '">' +
        (help ? '<small class="ad-muted">' + help + '</small>' : '') + '</label>';
    }
    return '<div class="ad-hd"><h2>설정</h2><p class="ad-muted">숫자를 셀 때 쓰는 기준이에요. 이 컴퓨터에만 저장돼요.</p></div>' +
      '<section class="ad-card ad-form">' +
        f('cf-start', '평가 시작일', c.start, 'date', '비우면 첫 기록 날부터') +
        f('cf-weeks', '평가 기간 (주)', c.weeks || '', 'number', '비우면 마지막 기록까지') +
        f('cf-stamp', '쬔 날로 셀 최소 시간 (분)', c.stampMin, 'number', '하루에 이만큼 쬐면 쬔 날(스탬프 1개)로 세요') +
        f('cf-growth', '햇빛 시간 늘리기 목표 (%)', c.growth, 'number', '첫 주보다 마지막 주에 몇 % 늘면 목표 달성인지') +
        '<div class="ad-form-f"><button class="ad-btn" id="cf-save">저장</button><button class="ad-link" id="cf-reset">처음 값으로</button></div>' +
      '</section>' +
      (state.mode === 'demo' ? '<p class="ad-muted">예시 데이터는 2026-10-05부터 4주로 만들어졌어요. 시작일을 비우면 이 기간을 써요.</p>' : '');
  }

  /* =========================================================
     이벤트
     ========================================================= */
  function bindMain(ctx) {
    [].forEach.call(document.querySelectorAll('.ad-tabs button'), function (b) {
      b.onclick = function () { state.tab = b.dataset.tab; try { history.replaceState(null, '', '#' + state.tab); } catch (e) {} render(); window.scrollTo(0, 0); };
    });
    $('ad-out').onclick = function () {
      var done = function () {
        state.mode = null; state.users = []; state.sessions = []; state.error = null;
        render();
      };
      /* 실제 기록을 보던 중이면 로그아웃하고 앱 첫 화면으로 — 앱은 다시 게스트로 시작한다 */
      var toApp = function () { location.href = 'index.html'; };
      if (state.mode === 'live' && auth) auth.signOut().then(toApp, toApp); else done();
    };
    if ($('ad-reload')) $('ad-reload').onclick = fetchLive;
    if ($('ad-csv')) $('ad-csv').onclick = exportCsv;

    if ($('cf-save')) {
      $('cf-save').onclick = function () {
        var v = function (id) { return $(id).value.trim(); };
        save(KEY_CFG, {
          start: v('cf-start'), weeks: Math.max(0, +v('cf-weeks') || 0),
          stampMin: Math.max(0, +v('cf-stamp') || 0), growth: +v('cf-growth') || 0
        });
        render();
        toast('저장했어요');
      };
      $('cf-reset').onclick = function () { save(KEY_CFG, {}); render(); toast('처음 값으로 돌렸어요'); };
    }
  }

  function toast(msg) {
    var t = $('ad-toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  /* 기록 CSV — 발표 자료·통계 프로그램용. 이름·이메일은 원래 없다. */
  function exportCsv() {
    var head = ['uid', 'dateKey', 'at', 'minutes', 'percent', 'clothing', 'limitedBy', 'endedBy'];
    var lines = [head.join(',')].concat(state.sessions.map(function (s) {
      return head.map(function (k) { var v = s[k] === undefined ? '' : s[k]; return /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v; }).join(',');
    }));
    var blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'haru-sunlight-sessions-' + today() + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function start() {
    var h = (location.hash || '').slice(1);
    if (['summary', 'records', 'settings'].indexOf(h) >= 0) state.tab = h;
    if (initFirebase()) {
      /* 이미 관리자로 로그인해 있으면 바로 불러온다 */
      var first = true;
      auth.onAuthStateChanged(function (u) {
        if (!first) return; first = false;
        if (u && !u.isAnonymous && u.email) { state.email = showId(u.email); fetchLive(); }
        else render();
      });
    } else {
      startDemo();
    }
  }

  return { start: start };
})();
