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
   - 허용한 출처(깃허브 페이지 · 로컬 개발)에서 온 요청만 받는다.
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

const ALLOWED_ORIGINS = [
  /^https:\/\/mnsjwn\.github\.io$/,
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
    for (const [name, value] of url.searchParams) {
      const rule = PARAMS[name];
      if (!rule || !rule.test(value)) {
        return new Response('bad parameter: ' + name, { status: 400, headers: cors });
      }
      qs.push(name + '=' + value);
    }
    qs.sort();

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
