/* =========================================================
   기능: 로그인 — Firebase 익명 인증 (작업지시서 4-1)

   사용자는 아무것도 입력하지 않는다. 기기마다 uid 하나를 받는다.
   이름·이메일은 받지 않는다.

   원칙: 앱은 Firebase 없이도 돌아가야 한다 (오프라인 우선).
     · SDK를 못 불러오거나 네트워크가 없으면 조용히 넘어간다.
     · 로그인 실패가 화면 흐름을 막지 않는다.

   ⚠️ 익명 uid는 브라우저 저장소를 지우면 사라진다 — 같은 사람이 새 uid를 받는다.
   ========================================================= */
var Auth = (function () {

  var auth = null;
  var user = null;
  var listeners = [];
  var resolveFirst;
  /* 저장돼 있던 로그인 상태를 복원한 뒤에 처음 한 번 풀린다.
     이걸 기다리지 않고 바로 signInAnonymously()를 부르면,
     이미 uid가 있는 사람에게 새 uid를 또 만들어 버린다. */
  var firstState = new Promise(function (res) { resolveFirst = res; });

  try {
    if (window.firebase && window.FIREBASE_CONFIG) {
      if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
      auth = firebase.auth();
      auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () {});
      auth.onAuthStateChanged(function (u) {
        user = u;
        resolveFirst(u);
        listeners.forEach(function (cb) { try { cb(u); } catch (e) {} });
      });
    } else {
      resolveFirst(null);
    }
  } catch (e) {
    auth = null;
    resolveFirst(null);
  }

  function available() { return !!auth; }

  /* 이미 로그인돼 있으면 그대로, 처음이면 익명 계정을 만든다 */
  function signIn() {
    if (!auth) return Promise.reject(new Error('firebase-unavailable'));
    return firstState.then(function (u) {
      return u || auth.signInAnonymously().then(function (r) { return r.user; });
    });
  }

  /* 화면 흐름에서 부르는 쪽 — 실패해도 절대 throw 하지 않는다 */
  function ensure() {
    return signIn().catch(function (e) {
      if (window.console) console.warn('[Auth] 익명 로그인 건너뜀 — 앱은 그대로 동작', (e && e.code) || e);
      return null;
    });
  }

  function signOut() { return auth ? auth.signOut() : Promise.resolve(); }
  function uid() { return user ? user.uid : null; }

  /* 상태가 바뀔 때마다 알려 준다. 이미 확정된 상태가 있으면 바로 한 번 부른다. */
  function onChange(cb) {
    listeners.push(cb);
    firstState.then(function () { try { cb(user); } catch (e) {} });
  }

  return {
    available: available, signIn: signIn, ensure: ensure,
    signOut: signOut, uid: uid, onChange: onChange
  };
})();
