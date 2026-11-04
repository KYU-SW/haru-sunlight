/* =========================================================
   서비스 워커 — 알림 전용 (캐시 없음)

   왜 다시 등록하나
   ----------------
   안드로이드 크롬은 페이지에서 new Notification()을 막고
   서비스 워커의 registration.showNotification()만 허용한다.
   그래서 알림을 띄우려면 워커가 등록돼 있어야 한다.

   캐시는 하지 않는다
   ------------------
   초기 버전이 '캐시 우선'이라 코드를 고쳐도 옛 파일이 계속 떴다(그래서 한때 자기 제거용으로 두었다).
   이 워커는 fetch 핸들러가 없다 = 모든 요청이 네트워크로 바로 간다. 고치면 새로고침만으로 반영된다.
   예전 워커가 남긴 캐시는 활성화할 때 지운다.

   ⚠️ 오프라인(PWA) 기능을 켤 때도 '캐시 우선'으로는 돌아가지 말 것(네트워크 우선 권장).
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
      .then(function () { return self.clients.claim(); })
  );
});

/* 알림을 누르면 열려 있는 앱 창으로 가고, 없으면 새로 연다 */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(self.registration.scope) === 0 && 'focus' in list[i]) return list[i].focus();
      }
      return self.clients.openWindow(url);
    })
  );
});

/* fetch 핸들러 없음 = 모든 요청이 네트워크로 직행 */
