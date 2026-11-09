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
    log: [],               // 기록 관리 — 최근 변경 내역 (adminLog)
    sel: null,             // 기록 관리 — 기록을 보고 있는 참가자 uid
    edit: null,            // 기록 관리 — { id } 고치는 중 / { id: null } 새로 넣는 중
    merge: null,           // 기록 관리 — 합칠 참가자 uid
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
    /* 변경 내역은 규칙을 새로 게시하기 전이면 못 읽는다 — 그래도 나머지는 보여 준다 */
    var logs = db.collection('adminLog').orderBy('at', 'desc').limit(50).get()
      .then(function (q) { return q.docs.map(function (d) { return d.data(); }); })
      .catch(function () { return []; });
    return Promise.all([db.collection('users').get(), db.collection('sessions').get(), logs])
      .then(function (r) {
        /* 지금 로그인한 관리자 계정의 문서는 참가자에서 뺀다 (관리자가 앱에서 동의·타이머를 눌러도 섞이지 않게) */
        var me = auth.currentUser ? auth.currentUser.uid : null;
        state.users = r[0].docs.filter(function (d) { return d.id !== me; })
          .map(function (d) { var x = d.data(); x.uid = d.id; return x; });
        state.sessions = r[1].docs.map(function (d) { var x = d.data(); x._id = d.id; return x; })
          .filter(function (x) { return x.uid !== me; });
        state.log = r[2];
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
          tabBtn('summary', '요약') + tabBtn('records', '타이머 기록') + tabBtn('manage', '기록 관리') + tabBtn('settings', '설정') +
        '</nav>' +
      '</header>' +
      '<main class="ad-main">' +
        (state.error === 'denied' ? '<div class="ad-note">이 계정은 관리자가 아니라서 기록을 볼 수 없어요.</div>' :
          state.error ? '<div class="ad-note">' + esc(state.error) + '</div>' : '') +
        ({ summary: summaryHtml, records: recordsHtml, manage: manageHtml, settings: settingsHtml }[state.tab])(ctx) +
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
    state.sessions.forEach(function (x) { x._id = sid(x); });
    state.log = []; state.sel = state.edit = state.merge = null;
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

  /* 계속 쓴 사람 — 첫 주에 쓰고 마지막 주에도 쓴 사람 (2주 평가면 '둘째 주에도') */
  function retLabel(weeks) { return weeks === 2 ? '둘째 주에도 쓴 사람' : '마지막 주까지 쓴 사람'; }
  function retCount(rec) { return rec.retained === null ? '—' : rec.retained + ' / ' + rec.n + '명'; }

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

  /* 연령대 · BMI 구간별 표 — 사람 수가 적은 칸은 평균이 크게 흔들리니 숫자만 참고한다 */
  function groupTable(list, weeks) {
    if (!list.length) return empty();
    var small = list.some(function (g) { return g.n < 5; });
    return table(['구간', '사람', '타이머 쓴 사람', '일주일 평균(분)', '목표 다 채운 날', retLabel(weeks)],
      list.map(function (g) {
        return [esc(g.label), g.n + '명', g.withData + '명', fmt(g.weekMean), fmt(g.goalsMean) + '일', g.retained + '명'];
      })) +
      (small ? '<p class="ad-muted">5명보다 적은 구간은 평균이 크게 흔들려요. 비교보다 참고용으로 봐 주세요.</p>' : '');
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
      { lab: retLabel(rec.weeks), val: rec.retained === null ? '—' : '<b>' + rec.retained + '</b> / ' + rec.n + '명',
        sub: rec.weeks > 1 ? '첫 주에 쓰고 ' + (rec.weeks === 2 ? '둘째' : '마지막') + ' 주에도 타이머를 켠 사람' : '평가 기간이 2주 이상이어야 셀 수 있어요' },
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
          [retLabel(rec.weeks), retCount(rec)],
          ['첫 주보다 마지막 주에 더 쬔 사람', rec.improved === null ? '—' : rec.improved + '명'],
          ['알림 켠 사람 · 일주일 평균', fmt(rec.notify.onMean) + '분 (' + rec.notify.on + '명)'],
          ['알림 끈 사람 · 일주일 평균', fmt(rec.notify.offMean) + '분 (' + rec.notify.off + '명)']
        ])) +
        card(c.stampMin + '분 이상 쬔 날이 며칠인 사람이 몇 명?', groups(rec.stamps), '예: 8~14일 줄의 숫자 = 그만큼 쬔 사람 수') +
        card('하루 목표를 다 채운 날이 며칠인 사람이 몇 명?', groups(rec.goals), '예: 0일 줄의 숫자 = 한 번도 못 채운 사람 수') +
        card('연령대별', groupTable(rec.byAge, rec.weeks), '온보딩에서 입력한 나이를 10살 단위로 묶었어요') +
        card('BMI 구간별', groupTable(rec.byBmi, rec.weeks), '대한비만학회 기준 · 저체중 18.5 미만 · 정상 23 미만 · 비만 전단계 25 미만 · 1단계 비만 30 미만') +
      '</div>' +
      card('사람별 기록', '<div class="ad-bar-r"><span class="ad-muted">이름 대신 익명 ID 앞 6자리만 보여요.</span>' +
          '<button class="ad-btn sm sub" id="ad-csv">기록 CSV 내려받기</button></div>' +
        table(['ID', '쓴 날', '쬔 시간 합계(분)', c.stampMin + '분 이상 쬔 날', '목표 다 채운 날', '가장 오래 안 쓴 기간', retLabel(rec.weeks), '알림'],
          people.map(function (p) {
            return ['<code>' + esc(p.uid.slice(0, 6)) + '</code>', p.days + '일', fmt(p.total, 0), p.stamps, p.goals, p.gap + '일', p.retained ? '예' : '아니오', p.notify ? '켬' : '끔'];
          })));
  }

  /* =========================================================
     탭 ③ 기록 관리 — 관리자가 기록을 넣고 · 고치고 · 지운다
     쓰는 경우: 로그인 문제로 다른 ID에 기록이 쌓인 사람, 탈퇴 후 다시 가입한 사람,
               타이머를 안 끄고 둔 기록, 앱 밖에서 따로 받은 기록.
     원칙
       · 모든 변경은 adminLog에 '언제 · 누가 · 무엇을 · 바꾸기 전 · 바꾼 뒤 · 이유'로 남긴다.
         (평가 데이터라, 고친 내용을 나중에 설명할 수 있어야 한다)
       · 이유는 꼭 적는다.
       · 참가자 앱에 저장된 기록(기기 저장소)은 바뀌지 않는다. Firestore 기록만 바뀐다.
       · 예시 데이터에서는 이 화면 안에서만 바뀌고 Firebase에는 쓰지 않는다.
     ========================================================= */
  var CLOTH = [['shortShort', '반팔 + 반바지'], ['shortLong', '반팔 + 긴바지'], ['longLong', '긴팔 + 긴바지']];
  var ACTIONS = { add: '기록 추가', edit: '기록 수정', delete: '기록 삭제', merge: '참가자 합치기',
                  addUser: '참가자 추가', deleteUser: '참가자 삭제' };

  function sid(x) { return x._id || (x.uid + '_' + x.at); }
  function shortId(uid) { return /^manual-/.test(uid) ? uid : uid.slice(0, 6); }
  function hhmm(at) { var d = new Date(at); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function clothLabel(k) { for (var i = 0; i < CLOTH.length; i++) if (CLOTH[i][0] === k) return CLOTH[i][1]; return k || '—'; }
  function sessionsOf(uid) {
    return state.sessions.filter(function (x) { return x.uid === uid; })
      .sort(function (a, b) { return b.at - a.at; });
  }
  /* 참가자 명단 — users 문서 + 기록만 있는 uid */
  function roster() {
    var m = {};
    state.users.forEach(function (u) { m[u.uid] = { uid: u.uid, manual: !!u.manual, n: 0, min: 0, last: null }; });
    state.sessions.forEach(function (x) {
      var p = m[x.uid] || (m[x.uid] = { uid: x.uid, manual: false, n: 0, min: 0, last: null });
      p.n++; p.min += +x.minutes || 0;
      if (!p.last || x.dateKey > p.last) p.last = x.dateKey;
    });
    return Object.keys(m).map(function (k) { return m[k]; })
      .sort(function (a, b) { return b.n - a.n || (a.uid < b.uid ? -1 : 1); });
  }
  /* 저장할 기록의 모양 — firestore.rules의 sessions 검사와 같은 범위 */
  function plain(x) {
    if (!x) return null;
    return { uid: x.uid, dateKey: x.dateKey, at: x.at, minutes: x.minutes, percent: x.percent,
             clothing: x.clothing, limitedBy: x.limitedBy };
  }
  function checkSession(d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dateKey || '')) return '날짜를 골라 주세요';
    if (!(d.at > 0)) return '시작 시각을 골라 주세요';
    if (!(d.minutes >= 1 && d.minutes <= 600)) return '쬔 시간은 1~600분 사이로 적어 주세요';
    if (!(d.percent >= 0 && d.percent <= 300)) return '채운 양은 0~300% 사이로 적어 주세요';
    return null;
  }
  /* 채운 양을 모를 때 — 그 사람(없으면 전체)의 1분당 평균으로 채운다 */
  function guessPercent(uid, minutes) {
    function rate(list) {
      var m = 0, p = 0;
      list.forEach(function (x) { m += +x.minutes || 0; p += +x.percent || 0; });
      return m > 0 ? p / m : null;
    }
    var r = rate(sessionsOf(uid));
    if (r === null) r = rate(state.sessions);
    if (r === null) r = 10;
    return Math.max(0, Math.min(300, Math.round(r * minutes)));
  }
  /* 같은 사람 · 같은 시각 기록이 이미 있으면 1초씩 미룬다 (문서 ID = uid_at) */
  function freeAt(uid, at, except) {
    var ids = {};
    state.sessions.forEach(function (x) { if (sid(x) !== except) ids[sid(x)] = true; });
    while (ids[uid + '_' + at]) at += 1000;
    return at;
  }

  /* ---------- 쓰기 — 한 번에 묶어서(batch) 쓰고, 변경 내역을 같이 남긴다 ---------- */
  function commit(ops, entry) {
    var me = (auth && auth.currentUser && state.mode === 'live') ? auth.currentUser.uid : 'demo';
    entry.by = me;
    ops.forEach(function (o) { if (o.col === 'sessions' && o.data) { o.data.editedBy = me; } });

    function applyLocal() {
      ops.forEach(function (o) {
        var list = o.col === 'sessions' ? state.sessions : state.users;
        var key = o.col === 'sessions' ? sid : function (u) { return u.uid; };
        for (var i = list.length - 1; i >= 0; i--) if (key(list[i]) === o.id) list.splice(i, 1);
        if (o.type === 'set') {
          var x = {}; for (var k in o.data) x[k] = o.data[k];
          if (o.col === 'sessions') { x._id = o.id; x.editedAt = Date.now(); } else { x.uid = o.id; }
          list.push(x);
        }
      });
      var e = {}; for (var k in entry) e[k] = entry[k];
      e.at = Date.now();
      state.log.unshift(e);
    }

    if (state.mode !== 'live') { applyLocal(); return Promise.resolve(); }
    var b = db.batch(), FV = firebase.firestore.FieldValue;
    ops.forEach(function (o) {
      var ref = db.collection(o.col).doc(o.id);
      if (o.type === 'delete') { b.delete(ref); return; }
      var d = {}; for (var k in o.data) d[k] = o.data[k];
      if (o.col === 'sessions') d.editedAt = FV.serverTimestamp();
      else d.createdAt = FV.serverTimestamp();
      b.set(ref, d);
    });
    var log = {}; for (var k in entry) log[k] = entry[k];
    log.at = FV.serverTimestamp();
    b.set(db.collection('adminLog').doc(), log);
    return b.commit().then(applyLocal);
  }
  function fail(e) {
    var c = (e && e.code) || '';
    toast(c === 'permission-denied' ? '저장하지 못했어요 — Firestore 규칙을 새로 게시했는지 확인해 주세요' : '저장하지 못했어요 (' + (c || e) + ')');
  }
  function done(msg) { state.edit = null; state.merge = null; render(); toast(msg); }

  /* ---------- 화면 ---------- */
  function manageHtml() {
    var list = roster();
    var demoNote = state.mode === 'demo' ? '<div class="ad-note">예시 데이터예요. 여기서 바꾼 내용은 이 화면에서만 보이고 저장되지 않아요.</div>' : '';
    return '<div class="ad-hd"><h2>기록 관리</h2><p class="ad-muted">기록을 넣고 · 고치고 · 지울 수 있어요. 바꾼 내용은 이유와 함께 아래 변경 내역에 남아요.</p></div>' +
      demoNote +
      card('참가자', '<div class="ad-bar-r"><span class="ad-muted">로그인이 안 되는 사람은 참가자를 새로 만들어 기록을 대신 넣을 수 있어요.</span>' +
          '<button class="ad-btn sm sub" id="mg-add-user">참가자 추가</button></div>' +
        (list.length ? table(['ID', '타이머 기록', '쬔 시간 합계(분)', '마지막 기록', ''],
          list.map(function (p) {
            return ['<code>' + esc(shortId(p.uid)) + '</code>' + (p.manual ? ' <span class="ad-chip">직접 추가</span>' : ''),
              p.n + '번', fmt(p.min, 0), p.last || '—',
              '<div class="ad-acts">' +
                '<button class="ad-link" data-sel="' + esc(p.uid) + '">' + (state.sel === p.uid ? '보는 중' : '기록 보기') + '</button>' +
                '<button class="ad-link" data-merge="' + esc(p.uid) + '">합치기</button>' +
                '<button class="ad-link" data-deluser="' + esc(p.uid) + '">삭제</button>' +
              '</div>'];
          })) : empty())) +
      (state.merge ? mergeHtml(list) : '') +
      (state.sel ? personHtml(state.sel) : '') +
      logHtml();
  }

  function mergeHtml(list) {
    var from = state.merge, n = sessionsOf(from).length;
    var opts = list.filter(function (p) { return p.uid !== from; }).map(function (p) {
      return '<option value="' + esc(p.uid) + '">' + esc(shortId(p.uid)) + ' · 기록 ' + p.n + '번</option>';
    }).join('');
    return card('참가자 합치기', '<p class="ad-muted"><code>' + esc(shortId(from)) + '</code>의 기록 ' + n + '개를 아래 참가자에게 옮기고, <code>' +
        esc(shortId(from)) + '</code>는 지워요. 다시 가입해서 ID가 둘이 된 사람을 한 사람으로 묶을 때 써요.</p>' +
      '<div class="ad-form ad-form-in">' +
        '<label class="ad-field"><span>옮길 참가자</span><select id="mg-to">' + opts + '</select></label>' +
        '<label class="ad-field"><span>이유</span><input id="mg-reason" type="text" maxlength="200" placeholder="예: 탈퇴 후 다시 가입"></label>' +
        '<p class="ad-err" id="mg-err" role="alert"></p>' +
        '<div class="ad-form-f"><button class="ad-btn" id="mg-go"' + (opts ? '' : ' disabled') + '>합치기</button><button class="ad-link" id="mg-cancel">취소</button></div>' +
      '</div>');
  }

  function personHtml(uid) {
    var list = sessionsOf(uid);
    var ed = state.edit;
    return card('<code>' + esc(shortId(uid)) + '</code>의 기록',
      '<div class="ad-bar-r"><span class="ad-muted">기록 ' + list.length + '개 · 날짜가 최근인 것부터</span>' +
        '<button class="ad-btn sm sub" id="mg-add">기록 추가</button></div>' +
      (ed ? editHtml(uid, ed.id) : '') +                     // 고치는 칸은 목록 위에 — 긴 목록 아래로 내려가지 않게
      (list.length ? table(['날짜', '시작', '쬔 시간(분)', '채운 양', '차림', '', ''],
        list.map(function (x) {
          var mark = x.manual ? '<span class="ad-chip">직접 추가</span>' : x.editedAt ? '<span class="ad-chip">고침</span>' : '';
          return [x.dateKey, hhmm(x.at), x.minutes, x.percent + '%', esc(clothLabel(x.clothing)), mark,
            '<div class="ad-acts"><button class="ad-link" data-edit="' + esc(sid(x)) + '">고치기</button>' +
            '<button class="ad-link" data-del="' + esc(sid(x)) + '">삭제</button></div>'];
        })) : empty()));
  }

  function editHtml(uid, id) {
    var x = null;
    if (id) state.sessions.forEach(function (s) { if (sid(s) === id) x = s; });
    var date = x ? x.dateKey : today(), time = x ? hhmm(x.at) : '12:00';
    var opt = CLOTH.map(function (c) { return '<option value="' + c[0] + '"' + (x && x.clothing === c[0] ? ' selected' : '') + '>' + c[1] + '</option>'; }).join('');
    return '<div class="ad-form ad-form-in">' +
      '<h3>' + (x ? date + ' ' + time + ' 기록 고치기' : '기록 추가') + '</h3>' +
      '<div class="ad-form-row">' +
        '<label class="ad-field"><span>날짜</span><input id="ed-date" type="date" value="' + esc(date) + '"></label>' +
        '<label class="ad-field"><span>시작 시각</span><input id="ed-time" type="time" value="' + esc(time) + '"></label>' +
      '</div><div class="ad-form-row">' +
        '<label class="ad-field"><span>쬔 시간 (분)</span><input id="ed-min" type="number" min="1" max="600" value="' + (x ? x.minutes : '') + '"></label>' +
        '<label class="ad-field"><span>채운 양 (%)</span><input id="ed-pct" type="number" min="0" max="300" value="' + (x ? x.percent : '') + '"' +
          (x ? '' : ' placeholder="비우면 평균으로 채워요"') + '></label>' +
      '</div>' +
      '<label class="ad-field"><span>차림</span><select id="ed-cloth">' + opt + '</select></label>' +
      '<label class="ad-field"><span>이유</span><input id="ed-reason" type="text" maxlength="200" placeholder="' +
        (x ? '예: 타이머를 안 끄고 둠' : '예: 로그인이 안 돼서 따로 받은 기록') + '"></label>' +
      '<p class="ad-err" id="ed-err" role="alert"></p>' +
      '<div class="ad-form-f"><button class="ad-btn" id="ed-save" data-id="' + esc(id || '') + '" data-uid="' + esc(uid) + '">저장</button>' +
        '<button class="ad-link" id="ed-cancel">취소</button></div>' +
    '</div>';
  }

  function logHtml() {
    if (!state.log.length) return card('변경 내역', '<div class="ad-empty">아직 바꾼 기록이 없어요</div>');
    return card('변경 내역', table(['언제', '무엇을', '대상', '이유'], state.log.slice(0, 50).map(function (e) {
      var at = e.at && e.at.toDate ? e.at.toDate() : new Date(e.at);
      var when = isNaN(at) ? '—' : (at.getMonth() + 1) + '/' + at.getDate() + ' ' + hhmm(at.getTime());
      return [when, ACTIONS[e.action] || esc(e.action), '<code>' + esc(e.target || '') + '</code>', esc(e.reason || '')];
    })), '최근 50건');
  }

  /* ---------- 동작 ---------- */
  function bindManage() {
    function each(sel, fn) { [].forEach.call(document.querySelectorAll(sel), fn); }
    each('[data-sel]', function (b) { b.onclick = function () { state.sel = b.dataset.sel; state.edit = null; render(); }; });
    each('[data-merge]', function (b) { b.onclick = function () { state.merge = b.dataset.merge; render(); }; });
    each('[data-edit]', function (b) { b.onclick = function () { state.edit = { id: b.dataset.edit }; render(); }; });
    each('[data-del]', function (b) { b.onclick = function () { delSession(b.dataset.del); }; });
    each('[data-deluser]', function (b) { b.onclick = function () { delUser(b.dataset.deluser); }; });
    if ($('mg-add')) $('mg-add').onclick = function () { state.edit = { id: null }; render(); };
    if ($('ed-cancel')) $('ed-cancel').onclick = function () { state.edit = null; render(); };
    if ($('ed-save')) {
      $('ed-save').onclick = saveSession;
      $('ed-save').closest('.ad-form-in').scrollIntoView({ block: 'center' });
    }
    if ($('mg-cancel')) $('mg-cancel').onclick = function () { state.merge = null; render(); };
    if ($('mg-go')) $('mg-go').onclick = mergeUser;
    $('mg-add-user').onclick = addUser;
  }

  function saveSession() {
    var b = $('ed-save'), id = b.dataset.id || null, uid = b.dataset.uid;
    var old = null;
    if (id) state.sessions.forEach(function (s) { if (sid(s) === id) old = s; });
    var date = $('ed-date').value, time = $('ed-time').value || '12:00';
    var minutes = Math.round(+$('ed-min').value);
    var pctRaw = $('ed-pct').value.trim();
    var reason = $('ed-reason').value.trim();
    var at = date ? new Date(date + 'T' + time + ':00').getTime() : NaN;
    var d = {
      uid: uid, dateKey: date, at: at, minutes: minutes,
      percent: pctRaw === '' ? guessPercent(uid, minutes) : Math.round(+pctRaw),
      clothing: $('ed-cloth').value,
      limitedBy: old ? old.limitedBy : 'vitd'
    };
    if (old && old.endedBy) d.endedBy = old.endedBy;
    if (old ? old.manual : true) d.manual = true;
    var err = checkSession(d) || (reason ? null : '이유를 적어 주세요');
    if (err) { $('ed-err').textContent = err; return; }

    /* 시각이 바뀌면 문서 ID(uid_at)도 바뀐다 — 새로 쓰고 옛것을 지운다 */
    if (!old || old.at !== d.at) d.at = freeAt(uid, d.at, id);
    var nid = uid + '_' + d.at;
    var ops = [{ type: 'set', col: 'sessions', id: nid, data: d }];
    if (old && nid !== id) ops.push({ type: 'delete', col: 'sessions', id: id });
    b.disabled = true;
    commit(ops, { action: old ? 'edit' : 'add', target: nid, before: plain(old), after: plain(d), reason: reason })
      .then(function () { done(old ? '고쳤어요' : '넣었어요'); }, function (e) { b.disabled = false; fail(e); });
  }

  function delSession(id) {
    var old = null;
    state.sessions.forEach(function (s) { if (sid(s) === id) old = s; });
    if (!old) return;
    var reason = prompt(old.dateKey + ' ' + hhmm(old.at) + ' · ' + old.minutes + '분 기록을 지울까요?\n지우는 이유를 적어 주세요');
    if (reason === null) return;
    if (!reason.trim()) { toast('이유를 적어야 지울 수 있어요'); return; }
    commit([{ type: 'delete', col: 'sessions', id: id }],
      { action: 'delete', target: id, before: plain(old), after: null, reason: reason.trim().slice(0, 200) })
      .then(function () { done('지웠어요'); }, fail);
  }

  function addUser() {
    var reason = prompt('새 참가자를 만들어요. 이 참가자에게는 기록을 직접 넣을 수 있어요.\n만드는 이유를 적어 주세요 (예: 로그인 오류로 앱을 못 쓰는 참가자)');
    if (reason === null) return;
    if (!reason.trim()) { toast('이유를 적어야 만들 수 있어요'); return; }
    var uid = 'manual-' + Math.random().toString(36).slice(2, 10);
    var by = (auth && auth.currentUser && state.mode === 'live') ? auth.currentUser.uid : 'demo';
    commit([{ type: 'set', col: 'users', id: uid, data: { manual: true, editedBy: by } }],
      { action: 'addUser', target: uid, before: null, after: { uid: uid }, reason: reason.trim().slice(0, 200) })
      .then(function () { state.sel = uid; state.edit = { id: null }; render(); toast('참가자를 만들었어요 — 기록을 넣어 주세요'); }, fail);
  }

  function delUser(uid) {
    var list = sessionsOf(uid);
    var reason = prompt('참가자 ' + shortId(uid) + '와 기록 ' + list.length + '개를 모두 지울까요?\n지운 기록은 되돌릴 수 없어요. 지우는 이유를 적어 주세요');
    if (reason === null) return;
    if (!reason.trim()) { toast('이유를 적어야 지울 수 있어요'); return; }
    var ops = list.map(function (x) { return { type: 'delete', col: 'sessions', id: sid(x) }; });
    ops.push({ type: 'delete', col: 'users', id: uid });
    commit(ops, { action: 'deleteUser', target: uid, before: { uid: uid, sessions: list.length }, after: null, reason: reason.trim().slice(0, 200) })
      .then(function () { if (state.sel === uid) state.sel = null; done('지웠어요'); }, fail);
  }

  function mergeUser() {
    var from = state.merge, to = $('mg-to').value, reason = $('mg-reason').value.trim();
    if (!to) return;
    if (!reason) { $('mg-err').textContent = '이유를 적어 주세요'; return; }
    var list = sessionsOf(from), ops = [], taken = {};
    state.sessions.forEach(function (x) { if (x.uid === to) taken[x.at] = true; });
    list.forEach(function (x) {
      var at = x.at;
      while (taken[at]) at += 1000;
      taken[at] = true;
      var d = plain(x); d.uid = to; d.at = at;
      if (x.endedBy) d.endedBy = x.endedBy;
      if (x.manual) d.manual = true;
      ops.push({ type: 'set', col: 'sessions', id: to + '_' + at, data: d });
      ops.push({ type: 'delete', col: 'sessions', id: sid(x) });
    });
    ops.push({ type: 'delete', col: 'users', id: from });
    if (ops.length > 490) { $('mg-err').textContent = '기록이 너무 많아 한 번에 옮길 수 없어요'; return; }
    $('mg-go').disabled = true;
    commit(ops, { action: 'merge', target: from, before: { uid: from, sessions: list.length }, after: { uid: to }, reason: reason.slice(0, 200) })
      .then(function () { state.sel = to; done('합쳤어요'); }, function (e) { $('mg-go').disabled = false; fail(e); });
  }

  /* =========================================================
     탭 ④ 설정 (8절 — 팀이 정할 것)
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
        state.log = []; state.sel = state.edit = state.merge = null;
        render();
      };
      /* 실제 기록을 보던 중이면 로그아웃하고 앱 첫 화면으로 — 앱은 다시 게스트로 시작한다 */
      var toApp = function () { location.href = 'index.html'; };
      if (state.mode === 'live' && auth) auth.signOut().then(toApp, toApp); else done();
    };
    if ($('ad-reload')) $('ad-reload').onclick = fetchLive;
    if ($('ad-csv')) $('ad-csv').onclick = exportCsv;
    if (state.tab === 'manage') bindManage();

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

  /* CSV 칸 하나 — 엑셀이 = + - @ 로 시작하는 글자를 수식으로 실행하지 않게 앞에 ' 를 붙인다 */
  function csvCell(v) {
    if (v === undefined || v === null) return '';
    if (typeof v === 'number') return String(v);
    var t = String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }

  /* 기록 CSV — 발표 자료·통계 프로그램용. 이름·이메일은 원래 없다. */
  function exportCsv() {
    var head = ['uid', 'dateKey', 'at', 'minutes', 'percent', 'clothing', 'limitedBy', 'endedBy'];
    /* 관리자가 넣거나 고친 기록은 표시해 둔다 (자세한 내용은 기록 관리 › 변경 내역) */
    var lines = [head.concat(['manual', 'edited']).join(',')].concat(state.sessions.map(function (s) {
      return head.map(function (k) { return csvCell(s[k]); }).concat([s.manual ? 1 : 0, s.editedAt ? 1 : 0]).join(',');
    }));
    var blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'haru-sunlight-sessions-' + today() + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function start() {
    var h = (location.hash || '').slice(1);
    if (['summary', 'records', 'manage', 'settings'].indexOf(h) >= 0) state.tab = h;
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
