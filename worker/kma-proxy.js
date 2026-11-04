/* =========================================================
   기상청 API 중계 서버 (Cloudflare Worker)

   왜 필요한가
   -----------
   앱은 서버 없이 브라우저에서 돌아가므로, 공개 링크에 서비스키를 넣으면
   누구나 개발자도구로 키를 볼 수 있다. 그래서 키는 이 Worker의 비밀값
   (wrangler secret put KMA_SERVICE_KEY)으로만 보관하고,
   브라우저는 키 없이 이 Worker 주소만 부른다.

     브라우저 ──(키 없음)──▶ Worker ──(키 붙임)──▶ apis.data.go.kr

   ⚠️ 이 파일과 wrangler.toml에는 키가 없다. 키는 깃허브에 올라가지 않는다.

   막아 둔 것
   - 경로는 /fcst(단기예보) · /uv(자외선지수) 두 개만 중계한다.
   - 쿼리는 앱이 쓰는 파라미터만 숫자 형식 검사 후 전달한다(serviceKey 주입 불가).
   - 값도 앱이 실제로 보내는 범위만 받는다(1쪽 · 행 수 상한 · 격자 범위 · 발표 시각 · 최근 3일).
     → 값을 조금씩 바꿔 캐시를 피하며 기상청 하루 한도를 소진시키는 요청을 막는다.
   - 허용한 출처(깃허브 페이지 · 로컬 개발)에서 온 요청만 받는다.
     (Origin 헤더는 브라우저 밖에서는 꾸밀 수 있으므로 이것만으로는 막히지 않는다 → 아래 횟수 제한)
   - IP별 요청 횟수 제한 — wrangler.toml에 LIMITER를 켜면 동작한다(없으면 건너뜀).
   - 같은 요청은 10분간 엣지 캐시로 돌려줘 기상청 호출 한도를 아낀다.
   ========================================================= */

const UPSTREAM = {
  '/fcst': 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst',
  '/uv':   'https://apis.data.go.kr/1360000/LivingWthrIdxServiceV5/getUVIdxV5'
};

const PARAMS = {
  pageNo: /^\d{1,3}$/, numOfRows: /^\d{1,4}$/, dataType: /^JSON$/,
  base_date: /^\d{8}$/, base_time: /^\d{4}$/, nx: /^\d{1,3}$/, ny: /^\d{1,3}$/,
  areaNo: /^\d{10}$/, time: /^\d{10}$/
};

/* 형식 검사를 통과한 값이 앱이 실제로 보내는 범위인지 (kma.provider.js 기준) */
const FCST_TIMES = ['0200', '0500', '0800', '1100', '1400', '1700', '2000', '2300'];
const UV_HOURS = ['06', '18'];
const MAX_ROWS = { '/fcst': 1000, '/uv': 10 };

function kstDay(offsetDays) {
  const d = new Date(Date.now() + 9 * 3600000 - offsetDays * 86400000);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function checkRange(path, p) {
  const days = [kstDay(0), kstDay(1), kstDay(2)];          // 오늘 · 어제 · 그제 (KST)
  if (p.pageNo !== '1') return 'pageNo';
  if (!(+p.numOfRows >= 1 && +p.numOfRows <= MAX_ROWS[path])) return 'numOfRows';
  if (path === '/fcst') {
    if (!(+p.nx >= 1 && +p.nx <= 149)) return 'nx';
    if (!(+p.ny >= 1 && +p.ny <= 253)) return 'ny';
    if (days.indexOf(p.base_date) < 0) return 'base_date';
    if (FCST_TIMES.indexOf(p.base_time) < 0) return 'base_time';
    if (p.areaNo || p.time) return 'areaNo';
  } else {
    if (!p.areaNo) return 'areaNo';
    if (!p.time || days.indexOf(p.time.slice(0, 8)) < 0 || UV_HOURS.indexOf(p.time.slice(8)) < 0) return 'time';
    if (p.nx || p.ny || p.base_date || p.base_time) return 'nx';
  }
  return null;
}

const ALLOWED_ORIGINS = [
  /^https:\/\/kyu-sw\.github\.io$/,      // 현재 저장소(KYU-SW/haru-sunlight)의 깃허브 페이지
  /^https:\/\/mnsjwn\.github\.io$/,      // 이전 저장소 주소
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
];

const CACHE_SECONDS = 600;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

/* 공공데이터포털 키는 인코딩/디코딩 두 형태가 있다 — 앱과 같은 방식으로 정규화 */
function encKey(key) {
  const k = (key || '').trim();
  return k.indexOf('%') >= 0 ? k : encodeURIComponent(k);
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    if (!ALLOWED_ORIGINS.some((re) => re.test(origin))) {
      return new Response('forbidden origin', { status: 403 });
    }
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return new Response('method not allowed', { status: 405, headers: cors });

    const url = new URL(request.url);
    const target = UPSTREAM[url.pathname];
    if (!target) return new Response('not found', { status: 404, headers: cors });
    if (!env.KMA_SERVICE_KEY) return new Response('server key missing', { status: 500, headers: cors });

    const qs = [];
    const p = {};
    for (const [name, value] of url.searchParams) {
      const rule = PARAMS[name];
      if (!rule || !rule.test(value) || name in p) {
        return new Response('bad parameter: ' + name, { status: 400, headers: cors });
      }
      p[name] = value;
      qs.push(name + '=' + value);
    }
    const bad = checkRange(url.pathname, p);
    if (bad) return new Response('bad parameter: ' + bad, { status: 400, headers: cors });
    qs.sort();

    /* IP별 횟수 제한 — wrangler.toml의 [[ratelimits]] LIMITER가 있을 때만 */
    if (env.LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.LIMITER.limit({ key: ip });
      if (!success) return new Response('too many requests', { status: 429, headers: cors });
    }

    /* 캐시 키에는 키가 들어가지 않는다 */
    const cacheKey = new Request('https://kma-cache' + url.pathname + '?' + qs.join('&'));
    const cache = caches.default;
    let body = null;
    const hit = await cache.match(cacheKey);
    if (hit) {
      body = await hit.text();
    } else {
      const upstream = await fetch(target + '?serviceKey=' + encKey(env.KMA_SERVICE_KEY) + '&' + qs.join('&'));
      body = await upstream.text();
      /* 정상 응답(resultCode 00)만 캐시한다 — 발표 전 빈 응답이나 오류는 저장하지 않음 */
      if (upstream.ok && /"resultCode"\s*:\s*"00"/.test(body)) {
        ctx.waitUntil(cache.put(cacheKey, new Response(body, {
          headers: { 'Content-Type': 'application/json; charset=utf-8',
                     'Cache-Control': 'public, max-age=' + CACHE_SECONDS }
        })));
      }
    }

    return new Response(body, {
      status: 200,
      headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8',
                               'Cache-Control': 'no-store' }, cors)
    });
  }
};
