/* =========================================================
   공용: 기록 업로드 — Firestore (작업지시서 4-3 · 2절 데이터 계약)

   원칙
     · 기기 저장이 먼저다. 업로드는 끝난 기록을 나중에 올린다(오프라인 우선).
     · 동의한 사람만 올린다. 동의한 뒤에 생긴 기록만 올린다.
     · 실패해도 앱은 멈추지 않는다. 다음 기회(앱 열기·타이머 종료·온라인 복귀)에 다시 시도한다.
     · 같은 기록을 두 번 올리지 않는다 — 문서 ID = `${uid}_${at}` + 올린 목록을 기기에 저장.

   올리는 곳
     users/{uid}          동의 시각·버전, 피부 타입, 시·도, 알림, 앱 버전
     sessions/{uid}_{at}  타이머 한 번 = 문서 하나 (규칙상 만든 뒤 고칠 수 없다)
   ========================================================= */
var Sync = (function () {

  var APP_VERSION = 'v_0.1';
  var KEY_UP = 'sunrx.uploaded';        // 올린 문서 ID 목록
  var KEY_USER = 'sunrx.userSynced';    // users 문서를 처음 만든 uid (createdAt을 한 번만 넣으려고)
  var CLOTHES = ['shortShort', 'shortLong', 'longLong'];
  var LIMITS = ['vitd', 'burn', 'heat'];

  var db = null, busy = false, started = false;
  var again = false;   // 도는 중에 또 불리면 끝난 뒤 한 번 더 돈다 (그 사이 바뀐 지역·피부 타입을 놓치지 않게)
  try {
    if (window.firebase && firebase.firestore && firebase.apps.length) db = firebase.firestore();
  } catch (e) { db = null; }

  function readJSON(k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function enabled() { return !!db && ConsentService.given(); }

  /* 오프라인이면 Firestore 쓰기가 응답 없이 기다린다 — 너무 오래 걸리면 실패로 보고 다음에 다시 */
  function withTimeout(p, ms) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej({ code: 'timeout' }); }, ms);
      p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }

  function sidoOf(loc) {
    if (!loc) return null;
    var c = KmaGeo.findByName(loc.name);
    return c ? c.sido : null;
  }

  /* ---------- users/{uid} ---------- */
  function userDoc(uid) {
    var p = Repo.getProfile(), c = p.consent || {};
    var FV = firebase.firestore.FieldValue;
    var d = {
      updatedAt: FV.serverTimestamp(),
      consentedAt: firebase.firestore.Timestamp.fromMillis(c.at || Date.now()),
      consentVersion: c.version || ConsentService.VERSION,
      notify: !!p.notify,
      appVersion: APP_VERSION
    };
    if (p.skinType) d.skinType = p.skinType;
    var sido = sidoOf(Repo.getLocation());
    if (sido) d.sido = sido;                       // 시·도 이름만 — 좌표·시군구는 보내지 않는다
    var synced = readJSON(KEY_USER, null);
    if (!synced || synced.uid !== uid) d.createdAt = FV.serverTimestamp();
    return d;
  }
  function pushUser(uid) {
    return withTimeout(db.collection('users').doc(uid).set(userDoc(uid), { merge: true }), 15000)
      .then(function () { writeJSON(KEY_USER, { uid: uid, at: Date.now() }); });
  }

  /* ---------- sessions/{uid}_{at} ---------- */
  function sessionDoc(uid, s) {
    var d = {
      uid: uid,
      dateKey: s.dateKey,
      at: s.at,
      minutes: Math.max(1, Math.min(600, Math.round(s.minutes))),
      percent: Math.max(0, Math.min(300, Math.round(s.percent))),
      clothing: s.clothing,
      limitedBy: s.limitedBy,
      uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (s.endedBy) d.endedBy = s.endedBy;          // 타이머 자동 종료가 생기면 채워진다 (없으면 manual로 본다)
    return d;
  }

  /* 동의한 뒤에 생긴 기록 중 아직 안 올린 것 */
  function pending(uid) {
    var c = Repo.getProfile().consent;
    var since = (c && c.agreed && c.at) || Infinity;
    var done = readJSON(KEY_UP, []);
    return Repo.getSessions().filter(function (s) {
      return s.at >= since && done.indexOf(uid + '_' + s.at) < 0;
    });
  }
  function mark(id) {
    var done = readJSON(KEY_UP, []);
    if (done.indexOf(id) < 0) { done.push(id); writeJSON(KEY_UP, done.slice(-500)); }
  }

  function uploadOne(uid, s) {
    var id = uid + '_' + s.at;
    /* 규칙에 걸릴 값은 몇 번을 보내도 거절된다 — 건너뛰고 표시만 해 둔다 */
    if (CLOTHES.indexOf(s.clothing) < 0 || LIMITS.indexOf(s.limitedBy) < 0) { mark(id); return Promise.resolve(false); }
    var ref = db.collection('sessions').doc(id);
    return withTimeout(ref.set(sessionDoc(uid, s)), 15000)
      .catch(function (e) {
        /* 첫 전송은 됐는데 응답만 못 받은 경우 — 다시 쓰면 규칙(수정 금지)에 걸린다.
           이미 있으면 성공으로 본다 (작업지시서 4-3) */
        if (e && e.code === 'permission-denied') {
          return ref.get().then(function (snap) { if (!snap.exists) throw e; });
        }
        throw e;
      })
      .then(function () { mark(id); return true; });
  }

  /* 한 번 돌기 — 사용자 문서 갱신 → 밀린 기록 올리기. 결과로 올린 개수를 준다. */
  function run() {
    if (!enabled()) return Promise.resolve(0);
    if (navigator.onLine === false) return Promise.resolve(0);
    if (busy) { again = true; return Promise.resolve(0); }
    busy = true;
    var sent = 0;
    return Auth.signIn()
      .then(function (u) {
        var uid = u.uid;
        return pushUser(uid)
          .catch(function (e) { console.warn('[Sync] 사용자 정보 갱신 건너뜀', (e && e.code) || e); })
          .then(function () {
            return pending(uid).reduce(function (chain, s) {
              return chain.then(function () {
                return uploadOne(uid, s).then(function (ok) { if (ok) sent++; });
              });
            }, Promise.resolve());
          });
      })
      .catch(function (e) { console.warn('[Sync] 업로드 건너뜀 — 다음에 다시 시도', (e && e.code) || e); })
      .then(function () {
        busy = false;
        if (again) { again = false; run(); }
        return sent;
      });
  }

  /* 앱을 열 때 한 번 부른다 — 온라인으로 돌아오면 자동으로 다시 시도 */
  function start() {
    if (started) return;
    started = true;
    window.addEventListener('online', function () { run(); });
    run();
  }

  /* 이 기기에서 지금 uid로 올린 기록 수 (마이페이지 표시용) */
  function count() {
    var uid = Auth.uid();
    if (!uid) return 0;
    return readJSON(KEY_UP, []).filter(function (id) { return id.indexOf(uid + '_') === 0; }).length;
  }

  return { run: run, start: start, count: count, available: function () { return !!db; } };
})();
