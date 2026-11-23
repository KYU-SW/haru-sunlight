/* =========================================================
   Firestore 보안 규칙 테스트 — Firebase 에뮬레이터(실제 Firestore 규칙 엔진)
   · 저장소의 firestore.rules 를 그대로 올려서 검사한다 (복사본 아님)
   · 앱(shared/sync.js)이 실제로 보내는 문서 모양으로 쓴다 — 칸 목록은 통합 테스트 시나리오 2가
     sync.js 출력과 같은지 따로 확인한다
   · 실제 Firebase 프로젝트는 건드리지 않는다 (demo- 프로젝트 · 로컬 에뮬레이터)

   실행: cd tests/firestore && npm install && npm test   (Java 21 필요 — GitHub Actions에서 자동 실행)
   ========================================================= */
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

const RULES = readFileSync(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8');

/* 관리자 — 규칙의 이메일 목록 그대로. 규칙에 UID 목록이 있으면 그 UID로 접속한다 */
const ADMIN_EMAIL = 'admin@haru-sunlight.firebaseapp.com';
const CODE = RULES.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');   // 주석 속 예시는 빼고 본다
const uidMatch = CODE.match(/request\.auth\.uid in \['([^']+)'/);
const ADMIN_UID = uidMatch ? uidMatch[1] : 'admin-test-uid';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-haru-sunlight',
    firestore: { rules: RULES, host: '127.0.0.1', port: 8080 }
  });
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

/* ---------- 접속 주체 ---------- */
const db = {
  alice: () => env.authenticatedContext('alice', { email: 'alice@example.com' }).firestore(),
  anonBob: () => env.authenticatedContext('bob', { firebase: { sign_in_provider: 'anonymous' } }).firestore(),
  guest: () => env.unauthenticatedContext().firestore(),
  admin: () => env.authenticatedContext(ADMIN_UID, { email: ADMIN_EMAIL }).firestore()
};

/* ---------- 앱이 보내는 모양 (shared/sync.js userDoc · sessionDoc) ---------- */
function userDoc(over) {
  return Object.assign({
    updatedAt: serverTimestamp(),
    consentedAt: Timestamp.fromMillis(Date.UTC(2026, 10, 1)),
    consentVersion: 'v2',
    notify: false,
    appVersion: 'v_2.2',
    skinType: 3,
    ageGroup: 20,
    bmiGroup: 'normal',
    sido: '서울',
    createdAt: serverTimestamp()
  }, over || {});
}
const AT = 1795396800000;
function sessionDoc(uid, over) {
  return Object.assign({
    uid: uid, dateKey: '2026-11-23', at: AT, minutes: 12, percent: 100,
    clothing: 'shortShort', limitedBy: 'vitd', uploadedAt: serverTimestamp()
  }, over || {});
}
/* 규칙을 건너뛰고 미리 깔아 두기 */
async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), path), data); });
}

/* ================= users/{uid} ================= */
test('users — 본인 uid로 앱이 보내는 문서를 만든다 (set + merge)', async () => {
  await assertSucceeds(setDoc(doc(db.alice(), 'users/alice'), userDoc(), { merge: true }));
});
test('users — 익명(게스트) 로그인도 본인 문서는 만든다', async () => {
  await assertSucceeds(setDoc(doc(db.anonBob(), 'users/bob'), userDoc(), { merge: true }));
});
test('users — 로그인 안 한 사람은 못 쓴다', async () => {
  await assertFails(setDoc(doc(db.guest(), 'users/alice'), userDoc()));
});
test('users — 남의 uid 문서는 못 쓴다', async () => {
  await assertFails(setDoc(doc(db.alice(), 'users/bob'), userDoc()));
});
test('users — 이메일 칸을 넣으면 거절', async () => {
  await assertFails(setDoc(doc(db.alice(), 'users/alice'), userDoc({ email: 'alice@example.com' })));
});
test('users — 좌표를 넣으면 거절', async () => {
  await assertFails(setDoc(doc(db.alice(), 'users/alice'), userDoc({ lat: 37.5665, lon: 126.978 })));
});
test('users — 나이 · 키 · 몸무게 원값을 넣으면 거절', async () => {
  await assertFails(setDoc(doc(db.alice(), 'users/alice'), userDoc({ age: 22 })));
  await assertFails(setDoc(doc(db.alice(), 'users/alice'), userDoc({ heightCm: 168, weightKg: 60 })));
});
test('users — 연령대 · BMI 구간은 정해진 값만 (25세 → 거절, obese3 → 거절)', async () => {
  await assertFails(setDoc(doc(db.alice(), 'users/alice'), userDoc({ ageGroup: 25 })));
  await assertFails(setDoc(doc(db.alice(), 'users/alice'), userDoc({ bmiGroup: 'obese3' })));
});
test('users — 피부 타입 1~6 밖 · 너무 긴 시도 이름 · 이상한 버전 문자열은 거절', async () => {
  await assertFails(setDoc(doc(db.alice(), 'users/alice'), userDoc({ skinType: 7 })));
  await assertFails(setDoc(doc(db.alice(), 'users/alice'), userDoc({ sido: '=HYPERLINK("http://x")' })));
  await assertFails(setDoc(doc(db.alice(), 'users/alice'), userDoc({ appVersion: '2.2' })));
});
test('users — 본인은 읽고, 남은 못 읽고, 관리자는 읽는다', async () => {
  await seed('users/alice', userDoc());
  await assertSucceeds(getDoc(doc(db.alice(), 'users/alice')));
  await assertFails(getDoc(doc(db.anonBob(), 'users/alice')));
  await assertSucceeds(getDoc(doc(db.admin(), 'users/alice')));
});
test('users — 관리자 이메일이 아닌 계정은 남의 문서를 못 읽는다', async () => {
  await seed('users/alice', userDoc());
  const fake = env.authenticatedContext('mallory', { email: 'admin@example.com' }).firestore();
  await assertFails(getDoc(doc(fake, 'users/alice')));
});

test('users — 관리자 이메일이어도 UID가 다르면 관리자가 아니다 (규칙에 UID를 묶었을 때)', { skip: !uidMatch && '규칙에 관리자 UID가 없음' }, async () => {
  await seed('users/alice', userDoc());
  const impostor = env.authenticatedContext('someone-else', { email: ADMIN_EMAIL }).firestore();
  await assertFails(getDoc(doc(impostor, 'users/alice')));
});

/* ================= sessions/{uid}_{at} ================= */
const SID = 'alice_' + AT;
test('sessions — 앱이 보내는 타이머 기록을 만든다', async () => {
  await assertSucceeds(setDoc(doc(db.alice(), 'sessions/' + SID), sessionDoc('alice')));
});
test('sessions — 문서 ID가 {uid}_{at} 형식이 아니면 거절 (같은 기록을 ID만 바꿔 여러 번 올리기 방지)', async () => {
  await assertFails(setDoc(doc(db.alice(), 'sessions/alice_123'), sessionDoc('alice')));
  await assertFails(setDoc(doc(db.alice(), 'sessions/random-id'), sessionDoc('alice')));
});
test('sessions — 남의 uid로는 못 올린다', async () => {
  await assertFails(setDoc(doc(db.alice(), 'sessions/bob_' + AT), sessionDoc('bob')));
});
test('sessions — 값 범위 검사 (0분 · 601분 · 301% · 없는 옷차림 · 없는 이유)', async () => {
  await assertFails(setDoc(doc(db.alice(), 'sessions/' + SID), sessionDoc('alice', { minutes: 0 })));
  await assertFails(setDoc(doc(db.alice(), 'sessions/' + SID), sessionDoc('alice', { minutes: 601 })));
  await assertFails(setDoc(doc(db.alice(), 'sessions/' + SID), sessionDoc('alice', { percent: 301 })));
  await assertFails(setDoc(doc(db.alice(), 'sessions/' + SID), sessionDoc('alice', { clothing: 'swimsuit' })));
  await assertFails(setDoc(doc(db.alice(), 'sessions/' + SID), sessionDoc('alice', { limitedBy: 'rain' })));
});
test('sessions — 목록에 없는 칸(좌표 등)을 넣으면 거절', async () => {
  await assertFails(setDoc(doc(db.alice(), 'sessions/' + SID), sessionDoc('alice', { lat: 37.5 })));
});
test('sessions — 한 번 올린 기록은 참가자가 고치거나 지울 수 없다', async () => {
  await seed('sessions/' + SID, sessionDoc('alice'));
  await assertFails(updateDoc(doc(db.alice(), 'sessions/' + SID), { minutes: 60 }));
  await assertFails(setDoc(doc(db.alice(), 'sessions/' + SID), sessionDoc('alice', { minutes: 60 })));
  await assertFails(deleteDoc(doc(db.alice(), 'sessions/' + SID)));
});
test('sessions — 본인 · 관리자만 읽는다', async () => {
  await seed('sessions/' + SID, sessionDoc('alice'));
  await assertSucceeds(getDoc(doc(db.alice(), 'sessions/' + SID)));
  await assertFails(getDoc(doc(db.anonBob(), 'sessions/' + SID)));
  await assertSucceeds(getDoc(doc(db.admin(), 'sessions/' + SID)));
});
test('sessions — 관리자는 고칠 수 있지만 editedBy가 본인이어야 하고, 주인 · 시각은 못 바꾼다', async () => {
  await seed('sessions/' + SID, sessionDoc('alice'));
  const fix = sessionDoc('alice', { minutes: 15, editedAt: serverTimestamp(), editedBy: ADMIN_UID });
  await assertSucceeds(setDoc(doc(db.admin(), 'sessions/' + SID), fix));
  await assertFails(setDoc(doc(db.admin(), 'sessions/' + SID), Object.assign({}, fix, { editedBy: 'someone-else' })));
  await assertFails(setDoc(doc(db.admin(), 'sessions/' + SID), Object.assign({}, fix, { uid: 'bob' })));
});

/* ================= adminLog · offline · 그 밖 ================= */
const LOG = { at: serverTimestamp(), by: ADMIN_UID, action: 'edit', target: 'sessions/' + SID, before: {}, after: {}, reason: '시간 잘못 입력' };
test('adminLog — 관리자만 남기고, 남긴 내역은 고치거나 지울 수 없다', async () => {
  await assertSucceeds(setDoc(doc(db.admin(), 'adminLog/l1'), LOG));
  await assertFails(setDoc(doc(db.alice(), 'adminLog/l2'), Object.assign({}, LOG, { by: 'alice' })));
  await assertFails(updateDoc(doc(db.admin(), 'adminLog/l1'), { reason: '바꿈' }));
  await assertFails(deleteDoc(doc(db.admin(), 'adminLog/l1')));
});
test('adminLog — 이유가 비어 있으면 거절', async () => {
  await assertFails(setDoc(doc(db.admin(), 'adminLog/l3'), Object.assign({}, LOG, { reason: '' })));
});
const OFF = { records: 10, setRate: 80, goalDone: 6, goalTotal: 10, completer: true, before: 12.5, after: 6,
              exceptions: { late_over_5min: 2 }, importedAt: serverTimestamp(), editedBy: ADMIN_UID };
test('offline — 관리자만 읽고 쓰며, 값 범위를 검사한다', async () => {
  await assertSucceeds(setDoc(doc(db.admin(), 'offline/p01a'), OFF));
  await assertFails(getDoc(doc(db.alice(), 'offline/p01a')));
  await assertFails(setDoc(doc(db.alice(), 'offline/p02b'), OFF));
  await assertFails(setDoc(doc(db.admin(), 'offline/p03c'), Object.assign({}, OFF, { goalDone: 11 })));
  await assertFails(setDoc(doc(db.admin(), 'offline/Name-Kim'), OFF));
});
test('그 밖의 경로는 전부 막힌다', async () => {
  await assertFails(setDoc(doc(db.alice(), 'anything/x'), { a: 1 }));
  await assertFails(getDoc(doc(db.admin(), 'anything/x')));
});
