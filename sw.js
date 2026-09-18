/* =========================================================
   서비스 워커 — 자기 제거용 (kill switch)

   왜 이렇게 두었나
   ----------------
   초기 버전이 '캐시 우선'이라, 코드를 고쳐도 브라우저가 옛 파일을 계속 썼다.
   더 나쁜 건 그 옛 워커가 '고쳐진 워커를 불러오는 코드'까지 가로막아서
   자력으로 풀리지 않았다는 점이다(닭-달걀).

   그래서 이 파일은 캐시를 전부 지우고 스스로 등록을 해제한 뒤
   열려 있는 탭을 새로고침한다. 그 뒤로는 모든 요청이 네트워크로 바로 간다.
   개발 중에는 이게 맞다 — 고치면 새로고침만으로 바로 반영된다.

   ⚠️ 오프라인(PWA) 기능을 다시 켤 때
      1) 이 파일을 캐시 전략(네트워크 우선 권장) 버전으로 되돌리고
      2) shared/app.js 맨 아래의 serviceWorker.register 호출을 되살린다.
      단, 그때도 '캐시 우선'으로는 돌아가지 말 것.
   ========================================================= */

self.addEventListener('install', function () {
  self.skipWaiting();          // 대기하지 않고 바로 활성화
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll({ type: 'window' }); })
      .then(function (clients) {
        clients.forEach(function (c) { c.navigate(c.url); });   // 최신 코드로 다시 로드
      })
  );
});

/* fetch 핸들러 없음 = 모든 요청이 네트워크로 직행 */
