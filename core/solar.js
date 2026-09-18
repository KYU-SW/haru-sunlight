/* =========================================================
   1) 태양고도 계산  —  NOAA Solar Position Algorithm
   순수 함수. 외부 의존성 없음.
   ========================================================= */
var Solar = (function () {
  var RAD = Math.PI / 180;
  var DEG = 180 / Math.PI;

  function julianCentury(y, mo, d, minutesLocal, tzHours) {
    var utcMs = Date.UTC(y, mo - 1, d, 0, 0, 0) + (minutesLocal - tzHours * 60) * 60000;
    var jd = utcMs / 86400000 + 2440587.5;
    return (jd - 2451545.0) / 36525.0;
  }

  /* NOAA 스프레드시트 알고리즘: 적위(declination) + 균시차(equation of time) */
  function sunParams(jc) {
    var L0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
    if (L0 < 0) L0 += 360;
    var M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
    var e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);

    var C = Math.sin(M * RAD) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
            Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * jc) +
            Math.sin(3 * M * RAD) * 0.000289;

    var trueLong = L0 + C;
    var appLong = trueLong - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * jc) * RAD);

    var meanObliq = 23 + (26 + ((21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813)))) / 60) / 60;
    var obliqCorr = meanObliq + 0.00256 * Math.cos((125.04 - 1934.136 * jc) * RAD);

    var declin = Math.asin(Math.sin(obliqCorr * RAD) * Math.sin(appLong * RAD)) * DEG;

    var varY = Math.tan(obliqCorr / 2 * RAD) * Math.tan(obliqCorr / 2 * RAD);
    var eqTime = 4 * DEG * (
      varY * Math.sin(2 * L0 * RAD) -
      2 * e * Math.sin(M * RAD) +
      4 * e * varY * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
      0.5 * varY * varY * Math.sin(4 * L0 * RAD) -
      1.25 * e * e * Math.sin(2 * M * RAD)
    );

    return { declin: declin, eqTime: eqTime };
  }

  /* 태양고도(도). minutesLocal = 그 지역 자정으로부터의 분 */
  function altitude(y, mo, d, minutesLocal, lat, lon, tzHours) {
    var jc = julianCentury(y, mo, d, minutesLocal, tzHours);
    var p = sunParams(jc);

    var tst = (minutesLocal + p.eqTime + 4 * lon - 60 * tzHours) % 1440;
    if (tst < 0) tst += 1440;

    var ha = tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180;

    var cosZ = Math.sin(lat * RAD) * Math.sin(p.declin * RAD) +
               Math.cos(lat * RAD) * Math.cos(p.declin * RAD) * Math.cos(ha * RAD);
    cosZ = Math.max(-1, Math.min(1, cosZ));
    return 90 - Math.acos(cosZ) * DEG;
  }

  /* 남중시각(분) */
  function solarNoonMinutes(y, mo, d, lon, tzHours) {
    var jc = julianCentury(y, mo, d, 720, tzHours);
    var p = sunParams(jc);
    return 720 - 4 * lon - p.eqTime + 60 * tzHours;
  }

  /* 그날의 최대 태양고도 — §4 겨울 모드 판정에 사용 */
  function maxAltitude(y, mo, d, lat, lon, tzHours) {
    var noon = solarNoonMinutes(y, mo, d, lon, tzHours);
    return altitude(y, mo, d, noon, lat, lon, tzHours);
  }

  /* 일출·일몰(분) — 고도가 -0.833°(대기굴절+태양 반지름)를 지나는 시각.
     기상청 단기예보는 일출·일몰을 주지 않으므로 직접 구한다. */
  function sunriseSunset(y, mo, d, lat, lon, tzHours) {
    var H0 = -0.833;
    var noon = solarNoonMinutes(y, mo, d, lon, tzHours);
    var at = function (m) { return altitude(y, mo, d, m, lat, lon, tzHours); };
    if (at(noon) < H0) return { rise: null, set: null };

    var lo = noon - 720, hi = noon, i, m1, m2;
    for (i = 0; i < 40; i++) { m1 = (lo + hi) / 2; if (at(m1) < H0) lo = m1; else hi = m1; }
    var rise = (lo + hi) / 2;

    lo = noon; hi = noon + 720;
    for (i = 0; i < 40; i++) { m2 = (lo + hi) / 2; if (at(m2) > H0) lo = m2; else hi = m2; }
    var set = (lo + hi) / 2;

    return { rise: rise, set: set };
  }

  return {
    altitude: altitude,
    maxAltitude: maxAltitude,
    solarNoonMinutes: solarNoonMinutes,
    sunriseSunset: sunriseSunset
  };
})();
