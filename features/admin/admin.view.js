/* =========================================================
   관리자 대시보드 — 화면
   admin.html 전용. 앱(index.html)과 같은 Firebase 로그인 상태를 쓴다.
   앱 로그인 화면에서 관리자 계정으로 로그인하면 이 화면으로 넘어와 바로 기록을 읽는다.
   (그 브라우저의 앱은 관리자 계정으로 로그인된 상태가 된다. 로그아웃하면 앱은 다시 게스트로 시작한다.)

   데이터
     · 타이머 기록  — Firestore users · sessions (관리자 계정만 읽힘, firestore.rules isAdmin)
     · 설문         — 구글 폼 응답 CSV를 끌어다 놓는다 (사전 · 사후). 이 브라우저에만 보관.
     · 예시 데이터  — 기록이 쌓이기 전 화면 확인용. 화면 위에 '예시'가 계속 보인다.
   ========================================================= */
var AdminView = (function () {

  var S = AdminStats;
  var KEY_CFG = 'sunrx.admin.cfg', KEY_PRE = 'sunrx.admin.pre', KEY_POST = 'sunrx.admin.post';

  var state = {
    mode: null,            // 'live' | 'demo'
    email: null,
    users: [], sessions: [],
    pre: null, post: null, // 설문 CSV 원문
    tab: 'summary',
    loading: false
  };
  var app = null, auth = null, db = null;

  /* ---------- 저장 (이 브라우저에만) ---------- */
  function load(k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var DEFAULT_CFG = { n: 30, start: '', weeks: 0, stampMin: 5, growth: 20, susGoal: 68, satGoal: 20 };
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
    var rec = S.records(state.sessions, state.users, { n: c.n, start: c.start || null, weeks: +c.weeks || 0, stampMin: +c.stampMin, today: today() });
    var pre = state.pre ? S.survey(state.pre) : null, post = state.post ? S.survey(state.post) : null;
    var sv = S.surveyStats(pre ? pre.rows : [], post ? post.rows : []);
    var ctx = { c: c, rec: rec, sv: sv, pre: pre, post: post };

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
          tabBtn('summary', '요약') + tabBtn('records', '타이머 기록') + tabBtn('survey', '설문') +
          tabBtn('link', '연계표') + tabBtn('settings', '설정') +
        '</nav>' +
      '</header>' +
      '<main class="ad-main">' +
        (state.error === 'denied' ? '<div class="ad-note">이 계정은 관리자 목록에 없어서 기록을 읽지 못했어요. firestore.rules 의 관리자 이메일에 넣고 게시해 주세요.</div>' :
          state.error ? '<div class="ad-note">' + esc(state.error) + '</div>' : '') +
        ({ summary: summaryHtml, records: recordsHtml, survey: surveyHtml, link: linkHtml, settings: settingsHtml }[state.tab])(ctx) +
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
      '<p class="ad-foot">firestore.rules 에 등록된 관리자 계정만 기록을 읽을 수 있어요.</p>' +
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
    state.pre = AdminDemo.preCsv(); state.post = AdminDemo.postCsv();
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
    var g = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="ad-svg" role="img" aria-label="주차별 집단 평균 노출 시간">' + yGrid(max, h) +
      '<polygon class="band" points="' + band + '"/><path class="ln" d="' + line + '"/>';
    pts.forEach(function (p, i) {
      var last = i === pts.length - 1 || i === 0;
      g += '<g class="pt"><rect class="hit" x="' + (x(i) - 24) + '" y="' + PAD.t + '" width="48" height="' + h + '"/>' +
        '<circle cx="' + x(i) + '" cy="' + y(p.mean) + '" r="4.5"/>' +
        (last ? '<text class="val" x="' + x(i) + '" y="' + (y(p.mean) - 12) + '" text-anchor="middle">' + fmt(p.mean) + unit + '</text>' : '') +
        '<text class="ax" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + p.week + '주</text>' +
        '<title>' + p.week + '주차 (' + p.from + '~)\n평균 ' + fmt(p.mean) + unit + ' · 95% 구간 ' + fmt(Math.max(0, p.ci[0])) + '~' + fmt(p.ci[1]) + unit + '</title></g>';
    });
    return g + '</svg>';
  }

  /* 막대 (분포) — labels[i] 아래 값 counts[i] */
  function bars(labels, counts, tip) {
    var total = counts.reduce(function (a, b) { return a + b; }, 0);
    if (!total) return empty();
    var h = H - PAD.t - PAD.b, w = W - PAD.l - PAD.r;
    var max = niceMax(Math.max.apply(null, counts));
    var bw = w / labels.length, gap = Math.min(10, bw * 0.25);
    var g = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="ad-svg" role="img">' + yGrid(max, h);
    labels.forEach(function (l, i) {
      var v = counts[i], bh = h * v / max, x0 = PAD.l + i * bw + gap / 2, y0 = PAD.t + h - bh;
      g += '<g class="pt"><rect class="hit" x="' + (PAD.l + i * bw) + '" y="' + PAD.t + '" width="' + bw + '" height="' + h + '"/>' +
        (v ? '<path class="bar" d="' + barPath(x0, y0, bw - gap, bh) + '"/>' : '') +
        (labels.length <= 14 || i % 2 === 0 ? '<text class="ax" x="' + (x0 + (bw - gap) / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(l) + '</text>' : '') +
        '<title>' + esc(tip ? tip(l, v) : l + ': ' + v + '명') + '</title></g>';
    });
    return g + '</svg>';
  }
  function barPath(x, y, w, h) {             // 위쪽만 4px 둥글게, 바닥은 기준선에 붙인다
    var r = Math.min(4, w / 2, h);
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) +
      'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
  }

  /* 사전·사후 나란히 — 값은 비율(0~1) */
  function pairBars(labels, a, b, asRate) {
    var h = H - PAD.t - PAD.b, w = W - PAD.l - PAD.r;
    var ta = a.reduce(function (s, v) { return s + v; }, 0), tb = b.reduce(function (s, v) { return s + v; }, 0);
    if (!ta && !tb) return empty();
    var ra = asRate ? a : a.map(function (v) { return ta ? v / ta : 0; });
    var rb = asRate ? b : b.map(function (v) { return tb ? v / tb : 0; });
    var max = asRate ? 1 : Math.min(1, niceMax(Math.max.apply(null, ra.concat(rb))));
    var bw = w / labels.length, inner = Math.min(22, (bw - 12) / 2);
    var g = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="ad-svg" role="img">' + yGrid(max, h, function (v) { return fmt(v * 100, 0) + '%'; });
    labels.forEach(function (l, i) {
      var cx = PAD.l + i * bw + bw / 2;
      [[ra[i], 'pre', a[i]], [rb[i], 'post', b[i]]].forEach(function (d, k) {
        var bh = h * d[0] / max, x0 = cx - inner - 1 + k * (inner + 2);
        if (bh > 0) g += '<path class="bar ' + d[1] + '" d="' + barPath(x0, PAD.t + h - bh, inner, bh) + '"/>';
      });
      g += '<g class="pt"><rect class="hit" x="' + (PAD.l + i * bw) + '" y="' + PAD.t + '" width="' + bw + '" height="' + h + '"/>' +
        '<text class="ax" x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(l) + '</text>' +
        '<title>' + esc(l) + '\n사전 ' + pct(ra[i]) + (asRate ? '' : ' (' + a[i] + '명)') + '\n사후 ' + pct(rb[i]) + (asRate ? '' : ' (' + b[i] + '명)') + '</title></g>';
    });
    return g + '</svg>' + '<div class="ad-legend"><span class="pre">사전</span><span class="post">사후</span></div>';
  }

  function empty() { return '<div class="ad-empty">아직 데이터가 없어요</div>'; }

  function hist(values, maxBin) {
    var c = []; for (var i = 0; i <= maxBin; i++) c.push(0);
    values.forEach(function (v) { c[Math.min(maxBin, v)]++; });
    return c;
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
    var rec = x.rec, sv = x.sv, c = x.c, w = rec.weekly;
    var g = growth(rec);
    var tiles = [
      { lab: '주간 평균 노출 시간', val: w.length ? fmt(w[0].mean) + '분 → <b>' + fmt(w[w.length - 1].mean) + '분</b>' : '—',
        sub: g === null ? '1주차와 마지막 주 비교' : '1주차 대비 ' + (g >= 0 ? '+' : '') + pct(g),
        ok: g === null ? null : g * 100 >= c.growth, goal: '목표 +' + c.growth + '%' },
      { lab: 'SUS 평균', val: sv.sus.n ? '<b>' + fmt(sv.sus.mean) + '점</b>' : '—', sub: '업계 평균 68 · 상위 10% 80.3',
        ok: sv.sus.n ? sv.sus.mean >= c.susGoal : null, goal: '목표 ' + c.susGoal + '점' },
      { lab: '만족 (M1 4점 이상)', val: sv.m1.n ? '<b>' + sv.m1.sat + '</b> / ' + sv.m1.n + '명' : '—',
        sub: sv.m1.n ? '95% 구간 ' + pct(sv.m1.ci[0], 1) + '~' + pct(sv.m1.ci[1], 1) : '사후 설문을 올리면 나와요',
        ok: sv.m1.n ? sv.m1.sat >= c.satGoal : null, goal: '목표 ' + c.satGoal + '명' },
      { lab: '사용 지속', val: '<b>' + rec.retained + '</b> / ' + rec.n + '명', sub: '첫 기록 후 14일째 이후에도 기록', ok: undefined },
      { lab: '권장 노출량을 채운 날', val: '<b>' + rec.goalDaysTotal + '</b>일', sub: '참가자 전체 합 · 1인 평균 ' + fmt(S.mean(rec.goals)) + '일', ok: undefined },
      { lab: '지식 정답률 (K1~K3)', val: sv.pre.n || sv.post.n ? pct(sv.pre.kRate) + ' → <b>' + pct(sv.post.kRate) + '</b>' : '—', sub: '사전 → 사후', ok: undefined }
    ];
    return '<div class="ad-hd"><h2>한눈에 보기</h2><p class="ad-muted">' + periodText(rec) + '</p></div>' +
      '<div class="ad-tiles">' + tiles.map(function (t) {
        return '<div class="ad-tile"><span class="ad-lab">' + t.lab + '</span><div class="ad-big">' + t.val + '</div>' +
          '<span class="ad-muted">' + t.sub + '</span>' + (t.ok !== undefined ? '<div class="ad-tile-f">' + pill(t.ok) + '<span class="ad-muted">' + t.goal + '</span></div>' : '') + '</div>';
      }).join('') + '</div>' +
      '<div class="ad-grid2">' +
        card('주차별 집단 평균 노출 시간', lineCI(w, '분'), '분모 ' + rec.n + '명 · 음영은 95% 신뢰구간') +
        card('발표 흐름', '<ol class="ad-flow">' +
          '<li><b>행동 변화</b> — 타이머 기록 노출 시간이 늘었는지</li>' +
          '<li><b>설문이 뒷받침</b> — P1·P2, F2가 같은 방향인지</li>' +
          '<li><b>건강은 추정으로만</b> — 권장 노출량을 채운 날 ' + rec.goalDaysTotal + '일</li>' +
          '<li><b>사용성·만족</b> — SUS ' + fmt(sv.sus.mean) + '점, 만족 ' + (sv.m1.n ? sv.m1.sat + '/' + sv.m1.n + '명' : '—') + '</li>' +
          '<li><b>한계 공개</b> — 타이머 없이 나간 날이 있었다 ' + x1Count(sv) + '명</li></ol>' +
          '<p class="ad-warn"><b>쓰지 않는 표현</b> "비타민D가 합성됐다", "건강이 좋아졌다", "충분했다"</p>') +
      '</div>';
  }
  function periodText(rec) {
    if (!rec.start) return '아직 기록이 없어요';
    return rec.start + ' ~ ' + rec.end + ' · ' + rec.weeks + '주 · 참가자 ' + rec.n + '명 (기록 있는 사람 ' + rec.withData + '명) · 타이머 기록 ' + rec.sessions + '건';
  }
  function x1Count(sv) { var t = sv.x1; return sv.post.n ? (t['가끔'] || 0) + (t['자주'] || 0) : '—'; }

  /* =========================================================
     탭 ② 타이머 기록
     ========================================================= */
  function recordsHtml(x) {
    var rec = x.rec, c = x.c;
    var maxS = Math.max(7, Math.max.apply(null, rec.stamps.concat([0])));
    var sb = Math.min(maxS, 28), stampHist = hist(rec.stamps, sb), goalHist = hist(rec.goals, sb);
    var lbl = []; for (var i = 0; i <= sb; i++) lbl.push(i === sb && maxS > sb ? sb + '+' : String(i));
    var people = rec.people.slice().sort(function (a, b) { return b.total - a.total; });
    return '<div class="ad-hd"><h2>타이머 기록</h2><p class="ad-muted">' + periodText(rec) + '</p></div>' +
      '<div class="ad-grid2">' +
        card('주차별 집단 평균 노출 시간', lineCI(rec.weekly, '분') +
          table(['주차', '시작일', '평균(분)', '95% 구간', '합계(분)'], rec.weekly.map(function (p) {
            return [p.week + '주', p.from, fmt(p.mean), fmt(Math.max(0, p.ci[0])) + ' ~ ' + fmt(p.ci[1]), fmt(p.total, 0)];
          })), '기록 없는 사람도 0분으로 넣어요') +
        card('지표', rows([
          ['참가자 (분모)', rec.n + '명'],
          ['기록 있는 사람', rec.withData + '명'],
          ['1인 평균 스탬프 (' + c.stampMin + '분 이상인 날)', fmt(S.mean(rec.stamps)) + '개'],
          ['1인 평균 목표 달성일 (충전률 100% 이상)', fmt(S.mean(rec.goals)) + '일'],
          ['평균 충전률 (기록한 날)', fmt(rec.avgCharge, 0) + '%'],
          ['최장 공백일 (중앙값)', fmt(rec.gapMedian, 0) + '일'],
          ['사용 지속 (14일째 이후에도 기록)', rec.retained + ' / ' + rec.n + '명'],
          ['1주차보다 마지막 주가 늘어난 사람', rec.improved === null ? '—' : rec.improved + '명'],
          ['알림 켬 · 1인 주 평균', fmt(rec.notify.onMean) + '분 (' + rec.notify.on + '명)'],
          ['알림 끔 · 1인 주 평균', fmt(rec.notify.offMean) + '분 (' + rec.notify.off + '명)'],
          ['어디에 막혀 끝났나', '비타민D ' + rec.limited.vitd + ' · 화상 ' + rec.limited.burn + ' · 더위 ' + rec.limited.heat + '건']
        ])) +
        card('스탬프 수 분포', bars(lbl, stampHist, function (l, v) { return '스탬프 ' + l + '개: ' + v + '명'; }), '사람 수 · 스탬프 = ' + c.stampMin + '분 이상 쬔 날') +
        card('목표 달성일 분포', bars(lbl, goalHist, function (l, v) { return l + '일 달성: ' + v + '명'; }), '사람 수 · 그날 충전률 합 100% 이상') +
      '</div>' +
      card('참가자별 기록', '<div class="ad-bar-r"><span class="ad-muted">ID는 앞 6자리만 보여요. 설문과 잇지 않아요.</span>' +
          '<button class="ad-btn sm sub" id="ad-csv">기록 CSV 내려받기</button></div>' +
        table(['익명 ID', '기록한 날', '노출 합계(분)', '스탬프', '목표 달성일', '최장 공백', '14일 지속', '알림'],
          people.map(function (p) {
            return ['<code>' + esc(p.uid.slice(0, 6)) + '</code>', p.days + '일', fmt(p.total, 0), p.stamps, p.goals, p.gap + '일', p.retained ? '예' : '아니오', p.notify ? '켬' : '끔'];
          })));
  }

  /* =========================================================
     탭 ③ 설문
     ========================================================= */
  function drop(id, label, parsed) {
    var info = parsed ? '응답 <b>' + parsed.rows.length + '</b>개 · 인식한 문항 ' + parsed.codes.length + '개' +
      (parsed.unknown.length ? '<br><span class="ad-muted">번호가 없어 뺀 열 ' + parsed.unknown.length + '개</span>' : '') : '구글 폼 응답을 CSV로 내려받아 여기에 끌어다 놓으세요';
    return '<label class="ad-drop' + (parsed ? ' has' : '') + '" id="' + id + '-zone"><input type="file" id="' + id + '" accept=".csv,text/csv" hidden>' +
      '<b>' + label + '</b><span>' + info + '</span>' +
      (parsed ? '<span class="ad-link">다른 파일로 바꾸기</span>' : '<span class="ad-link">파일 고르기</span>') + '</label>';
  }

  function surveyHtml(x) {
    var sv = x.sv, a = sv.pre, b = sv.post;
    var tl = ['5분 미만', '5~15', '15~30', '30~60', '60분 이상'];
    var p1t = sv.p1Test;
    var body = '<div class="ad-drops">' + drop('ad-pre', '사전 설문', x.pre) + drop('ad-post', '사후 설문', x.post) + '</div>' +
      '<p class="ad-muted ad-help">열 제목 앞에 문항 번호를 붙여 두면 자동으로 읽어요. 예: <code>[P1] 지난 7일 중…</code>, <code>[S3] 이 앱은 사용하기 쉽다…</code> · 파일은 이 브라우저에만 남아요.</p>';
    if (!a.n && !b.n) return '<div class="ad-hd"><h2>설문</h2></div>' + body;

    return '<div class="ad-hd"><h2>설문</h2><p class="ad-muted">사전 ' + a.n + '명 · 사후 ' + b.n + '명 · 개인별로 짝짓지 않고 집단 평균을 나란히 봐요</p></div>' + body +
      '<div class="ad-grid2">' +
        card('P1 · 낮 야외 15분 이상인 날 (지난 7일)', rows([
          ['사전 평균', fmt(S.mean(a.p1)) + '일 (± ' + fmt(S.sd(a.p1)) + ', ' + a.p1.length + '명)'],
          ['사후 평균', fmt(S.mean(b.p1)) + '일 (± ' + fmt(S.sd(b.p1)) + ', ' + b.p1.length + '명)'],
          ['Mann–Whitney U', p1t ? 'U = ' + fmt(p1t.u) + ', p ' + (p1t.p < 0.001 ? '< 0.001' : '= ' + fmt(p1t.p, 3)) : '—']
        ]) + pairBars(['0', '1', '2', '3', '4', '5', '6', '7'], hist(a.p1, 7), hist(b.p1, 7)), '± 표준편차') +
        card('P2 · 그런 날 하루 평균 야외 시간', pairBars(tl, a.p2, b.p2), '응답 비율') +
        card('P3 · 하루 몇 분 쬐어야 한다고 생각하나', pairBars(tl.concat(['모름']), a.p3, b.p3) +
          rows([['5분 미만 + 60분 이상으로 답한 비율', pct(a.p3Extreme) + ' → ' + pct(b.p3Extreme)]]), '응답 비율') +
        card('지식 정답률', pairBars(['K1 유리창', 'K2 화상 전 멈춤', 'K3 한낮'],
          ['K1', 'K2', 'K3'].map(function (k) { return a.k[k].n ? a.k[k].ok / a.k[k].n : 0; }),
          ['K1', 'K2', 'K3'].map(function (k) { return b.k[k].n ? b.k[k].ok / b.k[k].n : 0; }), true) +
          rows([['세 문항 전체', pct(a.kRate) + ' → ' + pct(b.kRate)]]), '정답: K1 거짓 · K2 참 · K3 참') +
        card('SUS (사용성)', rows([
          ['평균', sv.sus.n ? fmt(sv.sus.mean) + '점 (± ' + fmt(sv.sus.sd) + ', ' + sv.sus.n + '명)' : '—'],
          ['기준', '업계 평균 68점 · 상위 10% 80.3점']
        ]) + bars(['0~', '50~', '60~', '68~', '80.3~'], susBins(sv.sus.scores), function (l, v) { return l + '점: ' + v + '명'; }) +
          '<p class="ad-warn">번역 초안 SUS예요. 발표 때 검증본으로 바꾸거나 초안임을 밝혀요.</p>', '홀수 −1, 짝수 5−점수, 합 × 2.5') +
        card('만족 · 의향', rows([
          ['M1 만족 (4점 이상)', sv.m1.n ? sv.m1.sat + ' / ' + sv.m1.n + '명' : '—'],
          ['95% 신뢰구간 (Wilson)', sv.m1.n ? pct(sv.m1.ci[0], 1) + ' ~ ' + pct(sv.m1.ci[1], 1) : '—'],
          ['M1 평균 별점', fmt(sv.m1.mean)],
          ['M2 계속 사용 의향 (평균)', fmt(sv.m2.mean)],
          ['M3 추천하겠다', (sv.m3['예'] || 0) + ' / ' + ((sv.m3['예'] || 0) + (sv.m3['아니오'] || 0)) + '명']
        ]) + '<p class="ad-muted">퍼센트 하나로 쓰지 말고 "' + (sv.m1.n ? sv.m1.sat + '/' + sv.m1.n : 'N/30') + '명"으로 적어요.</p>') +
        card('체감 (주관 · 인과를 주장하지 않아요)', rows([
          ['F1 햇빛에 더 신경 쓰게 됨 (4점 이상)', sv.f1.agree + ' / ' + sv.f1.n + '명'],
          ['F2 야외 나가는 날이 늘었다고 느낌', sv.f2.agree + ' / ' + sv.f2.n + '명'],
          ['F3 컨디션이 나아졌다고 느낌', sv.f3.agree + ' / ' + sv.f3.n + '명'],
          ['X1 타이머 없이 나간 날', '없음 ' + (sv.x1['없음'] || 0) + ' · 가끔 ' + (sv.x1['가끔'] || 0) + ' · 자주 ' + (sv.x1['자주'] || 0) + '명']
        ])) +
        card('응답자 (사전)', rows([
          ['연령대', tallyText(sv.demo.d1)], ['성별', tallyText(sv.demo.d2)], ['비타민D 보충제 복용', tallyText(sv.demo.d3)]
        ]) + '<p class="ad-muted">보충제(D3)는 결과를 해석할 때의 교란 요인이에요.</p>') +
      '</div>' +
      '<div class="ad-grid2">' +
        card('O1 · 가장 불편했던 점', openList(sv.open.o1)) + card('O2 · 가장 좋았던 점', openList(sv.open.o2)) +
      '</div>';
  }
  function susBins(sc) {
    var b = [0, 0, 0, 0, 0];
    sc.forEach(function (v) { b[v >= 80.3 ? 4 : v >= 68 ? 3 : v >= 60 ? 2 : v >= 50 ? 1 : 0]++; });
    return b;
  }
  function tallyText(t) { var k = Object.keys(t); return k.length ? k.map(function (x) { return esc(x) + ' ' + t[x]; }).join(' · ') : '—'; }
  function openList(l) { return l.length ? '<ul class="ad-open">' + l.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : empty(); }

  /* =========================================================
     탭 ④ 연계표 (4절) — 발표 문장을 수치로 채운다
     ========================================================= */
  function linkHtml(x) {
    var rec = x.rec, sv = x.sv, a = sv.pre, b = sv.post, w = rec.weekly;
    var first = w[0], last = w[w.length - 1];
    function n(v, d, u) { return isNaN(v) || v === null || v === undefined ? '<i>?</i>' : '<b>' + fmt(v, d) + (u || '') + '</b>'; }
    var ws = weekStamps(x);
    var avgMin = S.mean(state.sessions.map(function (s) { return +s.minutes || 0; }));
    var rowsL = [
      ['P1 · P2 야외 활동', '주간 타이머 노출 시간',
        '설문상 낮 야외 활동일이 평균 ' + n(S.mean(a.p1)) + '일에서 ' + n(S.mean(b.p1)) + '일로, 타이머 기록 노출 시간은 주 ' +
        n(first && first.mean, 1, '분') + '에서 ' + n(last && last.mean, 1, '분') + '으로 늘었다', '독립된 두 출처가 같은 방향'],
      ['F2 늘었다고 느낌', '스탬프 수 (집단 평균)',
        n(sv.f2.agree, 0) + '명이 늘었다고 느낀다고 답했고, 기록의 스탬프도 평균 주 ' + n(ws[0], 1, '개') + '에서 ' + n(ws[ws.length - 1], 1, '개') + '로 늘었다', '체감과 기록이 같은 방향'],
      ['X1 타이머 없이 나간 날', '기록된 노출 시간의 한계',
        '타이머 없이 나간 날이 있었다는 응답은 ' + n(b.n ? (sv.x1['가끔'] || 0) + (sv.x1['자주'] || 0) : NaN, 0) + '명. 기록은 이를 포함하지 않는다', '한계를 수치로 공개'],
      ['K1 · K2 · K3 지식', '(기록 없음)',
        '정답률이 ' + n(a.kRate * 100, 0, '%') + '에서 ' + n(b.kRate * 100, 0, '%') + '로 올랐다', '정답이 있는 객관 지표'],
      ['P3 필요 시간 인식', '타이머 평균 노출 분',
        '필요 시간을 5분 미만/60분 이상으로 답한 사람이 ' + n(a.p3Extreme * 100, 0, '%') + '에서 ' + n(b.p3Extreme * 100, 0, '%') + '로 줄었고, 평균 타이머 시간은 ' + n(avgMin, 1, '분') + '이었다', '인식의 과대·과소 감소 + 실제 행동'],
      ['S1~S10 SUS', '사용 지속, 스탬프 수',
        'SUS 평균 ' + n(sv.sus.mean, 1, '점') + '(업계 평균 68). 2주 뒤에도 기록이 있던 사람은 ' + n(rec.retained, 0) + '명', '말과 행동이 같은 방향'],
      ['M1 · M2 만족 · 의향', '사용 지속률',
        '만족 ' + n(sv.m1.n ? sv.m1.sat : NaN, 0) + '/' + (sv.m1.n || rec.n) + '명, 기간 끝까지 사용한 사람 ' + n(lastWeekActive(rec), 0) + '/' + rec.n + '명', '같은 사람인지는 확인하지 않음'],
      ['F1 더 신경 쓰게 됨', '알림 사용 여부별 노출 시간',
        '알림 켠 사람 1인 주 평균 ' + n(rec.notify.onMean, 1, '분') + ', 끈 사람 ' + n(rec.notify.offMean, 1, '분') + ' (설명용)', '자기선택 편향 있음'],
      ['F3 컨디션', '(연계 없음)', '주관적 체감일 뿐 인과는 주장하지 않는다', '주관 항목임을 명시']
    ];
    return '<div class="ad-hd"><h2>연계표</h2><p class="ad-muted">설문과 기록은 서로 다른 출처예요. 같은 방향이면 설득력이 커져요. <i>?</i> 는 아직 데이터가 없는 자리예요.</p></div>' +
      card('발표 문장', table(['설문 문항', '붙이는 기록', '발표 문장', '의미'], rowsL)) +
      '<div class="ad-grid2">' +
        card('표현 주의', '<ul class="ad-open"><li>개인 단위로 잇지 않아요. "그중 N명", "같은 사람이"는 쓰지 않아요.</li>' +
          '<li>"앱 때문에 늘었다"가 아니라 "앱을 쓰는 동안 늘었다"로 써요. 비교군이 없어요.</li>' +
          '<li>"비타민D가 합성됐다", "건강이 좋아졌다", "충분했다"는 쓰지 않아요.</li></ul>') +
        card('한계 (발표에서 먼저 밝힐 것)', '<ol class="ad-open">' +
          '<li>비타민D를 직접 측정하지 않았다 (혈액검사 범위 밖)</li><li>비교군이 없다</li><li>신기함 효과 — 사용 기간 ' + rec.weeks + '주</li>' +
          '<li>타이머를 켠 시간만 기록된다 — 타이머 없이 나간 날이 있었다 ' + x1Count(sv) + '명</li>' +
          '<li>표본이 작다 — 참가자 ' + rec.n + '명</li><li>자가보고 편향 (P1·P2)</li><li>SUS 한국어판 미검증</li>' +
          '<li>집단 수준 비교 — 개인의 변화는 보지 못한다</li></ol>') +
      '</div>';
  }
  function lastWeekActive(rec) {
    if (!rec.weeks) return NaN;
    return rec.people.filter(function (p) { return p.week[rec.weeks - 1] > 0; }).length;
  }
  /* 주차별 1인 평균 스탬프 수 (분모 N) */
  function weekStamps(x) {
    var rec = x.rec, c = x.c;
    if (!rec.start) return [];
    var start = S.dayNum(rec.start), out = [];
    for (var i = 0; i < rec.weeks; i++) out.push(0);
    var days = {};
    state.sessions.forEach(function (s) {
      var d = S.dayNum(s.dateKey), k = s.uid + '|' + d;
      if (d < start || d >= start + rec.weeks * 7) return;
      days[k] = (days[k] || 0) + (+s.minutes || 0);
    });
    Object.keys(days).forEach(function (k) {
      var d = +k.split('|')[1];
      if (days[k] >= c.stampMin) out[Math.floor((d - start) / 7)]++;
    });
    return out.map(function (v) { return v / rec.n; });
  }

  /* =========================================================
     탭 ⑤ 설정 (8절 — 팀이 정할 것)
     ========================================================= */
  function settingsHtml(x) {
    var c = x.c;
    function f(id, label, val, type, help) {
      return '<label class="ad-field"><span>' + label + '</span><input id="' + id + '" type="' + type + '" value="' + esc(val) + '">' +
        (help ? '<small class="ad-muted">' + help + '</small>' : '') + '</label>';
    }
    return '<div class="ad-hd"><h2>설정</h2><p class="ad-muted">평가 계획 8절에서 팀이 정할 값이에요. 이 브라우저에만 저장돼요.</p></div>' +
      '<section class="ad-card ad-form">' +
        f('cf-n', '참가자 수 (주차별 평균의 분모)', c.n, 'number', '기록이 없는 사람도 0분으로 넣어요') +
        f('cf-start', '평가 시작일', c.start, 'date', '비우면 첫 기록 날부터') +
        f('cf-weeks', '사용 기간 (주)', c.weeks || '', 'number', '비우면 마지막 기록까지') +
        f('cf-stamp', '스탬프 최소 기준 (분)', c.stampMin, 'number', '그날 타이머 합계가 이 분 이상이면 스탬프 1개') +
        f('cf-growth', '노출 시간 증가 목표 (%)', c.growth, 'number', '1주차 대비 마지막 주') +
        f('cf-sus', 'SUS 목표 (점)', c.susGoal, 'number', '업계 평균 68 · 상위 10% 80.3') +
        f('cf-sat', '만족 목표 (명)', c.satGoal, 'number', 'M1 4점 이상') +
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
        state.pre = load(KEY_PRE, null); state.post = load(KEY_POST, null);     // 예시 설문을 지운다
        render();
      };
      /* 실제 기록을 보던 중이면 로그아웃하고 앱 첫 화면으로 — 앱은 다시 게스트로 시작한다 */
      var toApp = function () { location.href = 'index.html'; };
      if (state.mode === 'live' && auth) auth.signOut().then(toApp, toApp); else done();
    };
    if ($('ad-reload')) $('ad-reload').onclick = fetchLive;
    if ($('ad-csv')) $('ad-csv').onclick = exportCsv;

    ['ad-pre', 'ad-post'].forEach(function (id) {
      var inp = $(id), zone = $(id + '-zone');
      if (!inp) return;
      var take = function (file) {
        if (!file) return;
        var r = new FileReader();
        r.onload = function () {
          var text = String(r.result || '');
          if (id === 'ad-pre') { state.pre = text; if (state.mode === 'live') save(KEY_PRE, text); }
          else { state.post = text; if (state.mode === 'live') save(KEY_POST, text); }
          render();
        };
        r.readAsText(file, 'utf-8');
      };
      inp.onchange = function () { take(inp.files[0]); };
      zone.ondragover = function (e) { e.preventDefault(); zone.classList.add('over'); };
      zone.ondragleave = function () { zone.classList.remove('over'); };
      zone.ondrop = function (e) { e.preventDefault(); zone.classList.remove('over'); take(e.dataTransfer.files[0]); };
    });

    if ($('cf-save')) {
      $('cf-save').onclick = function () {
        var v = function (id) { return $(id).value.trim(); };
        save(KEY_CFG, {
          n: Math.max(1, +v('cf-n') || 30), start: v('cf-start'), weeks: Math.max(0, +v('cf-weeks') || 0),
          stampMin: Math.max(0, +v('cf-stamp') || 0), growth: +v('cf-growth') || 0, susGoal: +v('cf-sus') || 68, satGoal: +v('cf-sat') || 20
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
    if (['summary', 'records', 'survey', 'link', 'settings'].indexOf(h) >= 0) state.tab = h;
    state.pre = load(KEY_PRE, null); state.post = load(KEY_POST, null);
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
