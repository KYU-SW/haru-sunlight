/* =========================================================
   지난주 평균 자동 계산 — GitHub Actions(.github/workflows/weekly-stats.yml)가 매주 월요일 새벽에 실행
   · Firestore sessions 에서 지난주(월~일) 기록만 읽는다
   · 계산은 앱과 똑같은 core/report.js (Report.lastWeek · Report.summarize) 를 그대로 불러 쓴다
   · 결과는 stats/latest 에 숫자 셋(인원 · 하루 목표 채운 비율 평균 · 쬔 시간 평균)만 쓴다
     — 개인 기록은 이 스크립트 안에서만 다루고 밖으로 내보내지 않는다
   · 관리자 계정의 기록은 뺀다 (firestore.rules 의 관리자 UID)

   실행: FIREBASE_SERVICE_ACCOUNT='{...서비스 계정 JSON...}' TZ=Asia/Seoul node weekly-stats.mjs
   ========================================================= */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = new URL('../../', import.meta.url);

/* core/report.js — 브라우저용 IIFE(var Report)를 그대로 읽어 온다 (복사본을 두지 않는다) */
export function loadReport() {
  const ctx = vm.createContext({ Math, Date, Object });
  vm.runInContext(readFileSync(fileURLToPath(new URL('core/report.js', ROOT)), 'utf8') + '\n;globalThis.__R = Report;', ctx);
  return ctx.__R;
}

/* firestore.rules 에 묶인 관리자 UID (주석 줄은 빼고 본다) */
export function adminUids() {
  const rules = readFileSync(fileURLToPath(new URL('firestore.rules', ROOT)), 'utf8');
  const code = rules.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const m = code.match(/request\.auth\.uid in \[([^\]]*)\]/);
  return m ? (m[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1)) : [];
}

function todayKeySeoul() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);          // 한국 시간 기준 오늘
  return d.toISOString().slice(0, 10);
}

/* db — firebase-admin Firestore. 쓴 값을 돌려준다 (기록이 없으면 null, 쓰지 않음) */
export async function run(db, opts = {}) {
  const Report = loadReport();
  const range = Report.lastWeek(opts.today || todayKeySeoul());
  const skip = new Set(opts.adminUids || adminUids());
  const snap = await db.collection('sessions')
    .where('dateKey', '>=', range.start).where('dateKey', '<=', range.end).get();
  const sessions = snap.docs.map((d) => d.data()).filter((s) => s.uid && !skip.has(s.uid));
  const s = Report.summarize(sessions, range);
  if (!s.n) return null;
  const out = { week: s.week, n: s.n, goalRate: s.goalRate, minutes: s.minutes, by: 'github-actions' };
  await db.collection('stats').doc('latest').set(Object.assign({ updatedAt: opts.serverTimestamp() }, out));
  return out;
}

/* 명령줄에서 실행할 때만 firebase-admin 을 불러온다 (테스트는 run 만 가져다 쓴다) */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.log('::warning::FIREBASE_SERVICE_ACCOUNT 비밀값이 없어 건너뜁니다 (README › 지난주 평균 자동 계산 참고)');
    process.exit(0);
  }
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  initializeApp({ credential: cert(JSON.parse(raw)) });
  const out = await run(getFirestore(), { serverTimestamp: () => FieldValue.serverTimestamp() });
  console.log(out ? `stats/latest 갱신 — ${out.week} 주 · ${out.n}명 · 목표 채운 비율 ${out.goalRate}% · 쬔 시간 ${out.minutes}분`
                  : '지난주 기록이 없어 그대로 둡니다');
}
