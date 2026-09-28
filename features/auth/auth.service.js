/* =========================================================
   기능: 로그인 — Firebase 인증 (작업지시서 4-1)

   두 가지 길
     · 게스트: 익명 로그인. 아무것도 입력하지 않고 기기마다 uid 하나를 받는다.
     · 계정: 이메일 + 비밀번호로 가입·로그인한다. 폰을 바꾸거나 앱 데이터를 지워도
             같은 uid(같은 참가자)로 기록된다.
   이메일은 로그인 확인에만 쓰고 Firestore 기록에는 넣지 않는다.
   ⚠️ Firebase 콘솔 › Authentication › 로그인 방법에서 '이메일/비밀번호'를 켜야 동작한다.

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
    /* 처음 상태가 아니라 '지금' 상태를 본다 — 그 사이 계정으로 로그인했으면 그대로 쓴다 */
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

  /* ---------- 이메일 계정 ----------
     회원가입: 게스트(익명)로 쓰던 중이면 linkWithCredential로 같은 uid에 계정을 붙인다
               → 그동안 올린 기록과 새 기록이 한 사람으로 묶인다. 처음이면 새로 만든다.
     로그인:   그 계정의 uid로 들어간다(다른 기기에서도 같은 참가자).
     이메일은 Firebase 로그인 확인에만 쓰고, Firestore 기록에는 담지 않는다(보안 규칙이 막는다). */
  function signUpEmail(email, pw) {
    if (!auth) return Promise.reject({ code: 'firebase-unavailable' });
    return firstState.then(function () {
      if (user && user.isAnonymous) {
        var cred = firebase.auth.EmailAuthProvider.credential(email, pw);
        return user.linkWithCredential(cred);
      }
      return auth.createUserWithEmailAndPassword(email, pw);
    }).then(function (r) { return r.user; });
  }

  function signInEmail(email, pw) {
    if (!auth) return Promise.reject({ code: 'firebase-unavailable' });
    return auth.signInWithEmailAndPassword(email, pw).then(function (r) { return r.user; });
  }

  function resetPassword(email) {
    if (!auth) return Promise.reject({ code: 'firebase-unavailable' });
    return auth.sendPasswordResetEmail(email);
  }

  /* 로그인 실패를 화면에 보여 줄 한국어 문구로 */
  function errorText(e) {
    var code = (e && e.code) || '';
    if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use')
      return '이미 가입된 이메일이에요. 로그인해 주세요';
    if (code === 'auth/invalid-email') return '이메일 형식이 맞지 않아요';
    if (code === 'auth/weak-password') return '비밀번호가 너무 짧아요';
    if (code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials' ||
        code === 'auth/wrong-password' || code === 'auth/user-not-found')
      return '이메일 또는 비밀번호가 맞지 않아요';
    if (code === 'auth/missing-password') return '비밀번호를 입력해 주세요';
    if (code === 'auth/too-many-requests') return '시도가 너무 많아요. 잠시 뒤 다시 해 주세요';
    if (code === 'auth/operation-not-allowed') return '이메일 로그인이 아직 켜져 있지 않아요 (Firebase 설정 필요)';
    if (code === 'auth/network-request-failed') return '인터넷 연결을 확인해 주세요';
    if (code === 'firebase-unavailable') return '지금은 로그인할 수 없어요';
    return '로그인하지 못했어요. 잠시 뒤 다시 해 주세요';
  }

  /* 계정으로 로그인한 상태인가 (게스트 = 익명은 아님) */
  function isMember() { return !!(user && !user.isAnonymous); }
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
    signUpEmail: signUpEmail, signInEmail: signInEmail, resetPassword: resetPassword,
    errorText: errorText, isMember: isMember, email: email,
    signOut: signOut, uid: uid, onChange: onChange
  };
})();
