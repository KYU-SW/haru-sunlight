/* =========================================================
   공개 설정 — 이 파일에는 키를 적지 않는다

   KMA_SERVICE_KEY : 기상청 서비스키(공공데이터포털 · 단기예보 + 생활기상지수).
                     저장소에는 빈 값으로 두고, 깃허브 페이지에 배포할 때
                     .github/workflows/deploy-pages.yml 이 저장소 비밀값(Secrets)
                     KMA_SERVICE_KEY 로 채워서 올린다. 키가 있으면 브라우저가 기상청을 직접 부른다.
                     (앱은 받은 날씨를 1시간 저장해 두어 호출이 적다 — 하루 한도 1만 번)

   KMA_PROXY_URL   : 기상청 API 중계 서버(worker/kma-proxy.js) 주소.
                     키가 비어 있을 때만 이 주소로 받는다.

   로컬 개발은 config.local.js(깃허브에 안 올라감)에 키를 넣는다 — 이 파일보다 우선한다.
   ========================================================= */
window.KMA_SERVICE_KEY = '';   // 비워 둔다 — 배포 때 채워진다
window.KMA_PROXY_URL = 'https://haru-sunlight-kma.haru-sunlight.workers.dev';
