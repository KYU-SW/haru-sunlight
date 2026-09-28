/* =========================================================
   기능: 로그인 — Firebase 인증 (작업지시서 4-1)

   두 가지 길
     · 게스트: 익명 로그인. 아무것도 입력하지 않고 기기마다 uid 하나를 받는다.
     · 구글: 폰을 바꾸거나 앱 데이터를 지워도 같은 uid(같은 참가자)로 기록된다.
   이메일은 로그인 확인에만 쓰고 Firestore 기록에는 넣지 않는다.

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
    /* 처음 상태가 아니라 '지금' 상태를 본다 — 그 사이 구글로 로그인했으면 그대로 쓴다 */
    return firstState.then(function () {
      return user || auth.signInAnonymously().then(function (r) { return r.user; });
    });
  }

  /* 화면 흐름에서 부르는 쪽 — 실패해도 절대 throw 하지 않는다 */
  function ensure() {
    return signIn().catch(function (e) {
      if (window.console) console.warn('[Auth] 익명 로그인 건너뜀 — 앱은 그대로 동작', (e && e.code) || e);
      return null;
    });
  }

  /* ---------- 구글 로그인 ----------
     게스트(익명)로 쓰던 사람이 로그인하면 linkWithPopup으로 같은 uid를 이어 쓴다
     → 그동안 올린 기록과 새 기록이 한 사람으로 묶인다.
     이미 다른 기기에서 그 구글 계정으로 로그인한 적이 있으면 그 계정 uid로 들어간다.
     이메일은 Firebase 로그인 확인에만 쓰고, Firestore 기록에는 담지 않는다(보안 규칙이 막는다).
     ⚠️ Firebase 콘솔 › Authentication › 로그인 방법에서 Google을 켜야 동작한다. */
  function signInWithGoogle() {
    if (!auth) return Promise.reject({ code: 'firebase-unavailable' });
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return firstState.then(function () {
      var u = user;
      if (u && u.isAnonymous) {
        return u.linkWithPopup(provider).catch(function (e) {
          /* 이 구글 계정이 이미 다른 uid에 연결돼 있으면 그 계정으로 로그인 */
          if (e && e.code === 'auth/credential-already-in-use' && e.credential) {
            return auth.signInWithCredential(e.credential);
          }
          throw e;
        });
      }
      return auth.signInWithPopup(provider);
    }).then(function (r) { return r.user; });
  }

  /* 로그인 실패를 화면에 보여 줄 한국어 문구로 */
  function errorText(e) {
    var code = (e && e.code) || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return null; // 사용자가 닫음 — 알리지 않음
    if (code === 'auth/popup-blocked') return '팝업이 막혔어요. 브라우저에서 팝업을 허용해 주세요';
    if (code === 'auth/operation-not-allowed') return '구글 로그인이 아직 켜져 있지 않아요 (Firebase 설정 필요)';
    if (code === 'auth/unauthorized-domain') return '이 주소에서는 로그인할 수 없어요 (승인 도메인 설정 필요)';
    if (code === 'auth/network-request-failed') return '인터넷 연결을 확인해 주세요';
    if (code === 'firebase-unavailable') return '지금은 로그인할 수 없어요';
    return '로그인하지 못했어요. 잠시 뒤 다시 해 주세요';
  }

  function isGoogle() { return !!(user && !user.isAnonymous); }
  function email() { return user && !user.isAnonymous ? (user.email || '') : ''; }

  function signOut() { return auth ? auth.signOut() : Promise.resolve(); }
  function uid() { return user ? user.uid : null; }

  /* 상태가 바뀔 때마다 알려 준다. 이미 확정된 상태가 있으면 바로 한 번 부른다. */
  function onChange(cb) {
    listeners.push(cb);
    firstState.then(function () { try { cb(user); } catch (e) {} });
  }

  return {
    available: available, signIn: signIn, ensure: ensure,
    signInWithGoogle: signInWithGoogle, errorText: errorText,
    isGoogle: isGoogle, email: email,
    signOut: signOut, uid: uid, onChange: onChange
  };
})();
