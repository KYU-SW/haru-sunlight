/* =========================================================
   기능: 주간 — 서비스(로직)
   충전률 · 체내 저장량 · 노출 이력 · 앞으로 7일 창 예보
   ========================================================= */
var WeeklyService = (function () {

  var DOW = ['일', '월', '화', '수', '목', '금', '토'];

  function build(weather, loc, profile) {
    var daily = Repo.getDaily();
    var weekly = Engine.weeklyCharge(daily);
    var today = Engine.dayKey(new Date());

    var bars = weekly.days.map(function (d) {
      return {
        key: d.key,
        label: DOW[d.date.getDay()],
        percent: d.percent,
        height: Math.max(4, Math.min(100, d.percent)),
        isToday: d.key === today
      };
    });

    var sessions = Repo.getSessions().slice(0, 30).map(function (s) {
      var d = new Date(s.at);
      return {
        dateText: (d.getMonth() + 1) + '/' + d.getDate(),
        timeText: UI.hm(d.getHours() * 60 + d.getMinutes()),
        minutes: s.minutes,
        percent: s.percent,
        gear: (Engine.CLOTHING[s.clothing] || {}).label,
        limitLabel: Engine.LIMIT_LABEL[s.limitedBy] || ''
      };
    });

    var forecast = [];
    if (weather && loc) {
      forecast = Prescription.forWeek(weather, loc, profile).map(function (rx) {
        var d = rx.date;
        return {
          key: rx.dateKey,
          label: (d.getMonth() + 1) + '/' + d.getDate() + ' ' + DOW[d.getDay()],
          isToday: rx.dateKey === today,
          mode: rx.mode,
          count: rx.windows.length,
          bestText: rx.windows.length
            ? UI.hm(rx.windows[0].recommendStart) + ' · ' + rx.windows[0].recommendMinutes + '분'
            : '쉬는 날',
          minutes: rx.windows.length ? rx.windows[0].recommendMinutes : 0
        };
      });
    }

    var missDays = Engine.consecutiveMissDays(daily, (daily[today] || 0) > 0);

    /* 홈에서 옮겨 온 상세 — 오늘 처방 기준 그래프·생체리듬·대체 수단 */
    var rxToday = (weather && loc) ? Prescription.forToday(weather, loc, profile) : null;
    var detail = null;
    if (rxToday) {
      var hm = HomeService.build(rxToday, {});
      detail = {
        chart: hm.chart,
        sun: hm.sun,
        solarNoonText: hm.solarNoonText,
        maxAltText: hm.maxAltText,
        circadian: hm.circadian,
        gap: hm.gap,
        modeLabel: hm.modeLabel
      };
    }

    return {
      detail: detail,
      weeklyPercent: weekly.percent,
      bars: bars,
      bodyStore: Math.round(Engine.bodyStore(daily)),
      halfLife: Engine.HALF_LIFE_DAYS,
      sessions: sessions,
      forecast: forecast,
      missDays: missDays,
      totalMinutes: Repo.getSessions().reduce(function (a, s) { return a + s.minutes; }, 0)
    };
  }

  return { build: build };
})();
