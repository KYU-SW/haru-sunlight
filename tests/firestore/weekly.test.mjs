/* =========================================================
   지난주 평균 자동 계산(scripts/weekly-stats) — Firebase 에뮬레이터에서 실제로 돌려 본다
   · 가짜 기록을 sessions 에 넣고 → run() → stats/latest 에 맞는 숫자가 들어가는지
   · 지난주 밖의 기록 · 관리자 기록은 빠지는지, 개인 기록이 stats 에 새지 않는지
   ========================================================= */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { run, loadReport, adminUids } from '../../scripts/weekly-stats/weekly-stats.mjs';

let db;
before(async () => {
  initializeApp({ projectId: 'demo-haru-sunlight' });     // FIRESTORE_EMULATOR_HOST 는 emulators:exec 가 넣어 준다
  db = getFirestore();
});

const S = (uid, dateKey, percent, minutes) => ({ uid, dateKey, at: Date.parse(dateKey), percent, minutes, clothing: 'shortShort', limitedBy: 'vitd' });

async function seed(list) {
  const old = await db.collection('sessions').get();
  await Promise.all(old.docs.map((d) => d.ref.delete()));
  await db.collection('stats').doc('latest').delete().catch(() => {});
  await Promise.all(list.map((s, i) => db.collection('sessions').doc(s.uid + '_' + s.at + '_' + i).set(s)));
}

test('weekly — 앱과 같은 계산(core/report.js)을 불러온다', () => {
  const R = loadReport();
  assert.equal(R.lastWeek('2026-11-25').week, '2026-11-16');
});

test('weekly — firestore.rules 의 관리자 UID를 읽는다', () => {
  assert.ok(Array.isArray(adminUids()));
});

test('weekly — 지난주 기록으로 stats/latest 에 평균만 쓴다 (지난주 밖 · 관리자 기록은 뺀다)', async () => {
  await seed([
    S('a', '2026-11-16', 60, 5), S('a', '2026-11-16', 50, 4), S('a', '2026-11-18', 40, 3),   // a: 2일 중 1일 → 50% · 12분
    S('b', '2026-11-20', 100, 10),                                                           // b: 1일 중 1일 → 100% · 10분
    S('a', '2026-11-23', 100, 9), S('c', '2026-11-10', 100, 8),                              // 지난주 밖
    S('admin1', '2026-11-17', 0, 30)                                                         // 관리자 — 뺀다
  ]);
  const out = await run(db, { today: '2026-11-25', adminUids: ['admin1'], serverTimestamp: () => FieldValue.serverTimestamp() });
  assert.deepEqual(out, { week: '2026-11-16', n: 2, goalRate: 75, minutes: 11, by: 'github-actions' });
  const doc = (await db.collection('stats').doc('latest').get()).data();
  assert.deepEqual(Object.keys(doc).sort(), ['by', 'goalRate', 'minutes', 'n', 'updatedAt', 'week']);   // 개인 기록 · uid 없음
  assert.equal(doc.goalRate, 75);
});

test('weekly — 지난주 기록이 없으면 쓰지 않는다', async () => {
  await seed([S('a', '2026-11-10', 100, 5)]);
  const out = await run(db, { today: '2026-11-25', adminUids: [], serverTimestamp: () => FieldValue.serverTimestamp() });
  assert.equal(out, null);
  assert.equal((await db.collection('stats').doc('latest').get()).exists, false);
});
