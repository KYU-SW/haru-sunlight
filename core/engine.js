/* =========================================================
   2계층 — 계산 엔진 (순수 함수)
   개발명세 §2 · §3 · §4 · §6 을 그대로 옮긴 것.
   여기 있는 상수/공식은 프로토타입 간 통일 대상 → 임의 수정 금지.
   ========================================================= */
var Engine = (function () {

  /* ---------- §2 상수 ---------- */
  var K = 0.4;              // 비타민D/홍반 비율 (문헌 0.3~0.5 중 중앙값)
  var UVI_COEFF = 1.5;      // UVI → 홍반조사량(W/m²) 환산계수 (고정)

  var MED = { 1: 150, 2: 250, 3: 300, 4: 400, 5: 500, 6: 600 }; // Fitzpatrick, J/m²

  /* f_BSA(노출 피부 면적) 위치 — 분모로 확정.

     명세 §2 원문은 (k × MED × f_BSA) ÷ (1.5 × UVI) 로 f_BSA가 '분자'였는데,
     그러면 옷을 더 껴입을수록 필요시간이 짧아지는 역전이 생긴다.
       (분자일 때)  반팔반바지 6.4분  >  긴팔긴바지 1.6분   ← 살을 가릴수록 빨리 채워짐(?)

     비타민D 총 생성량 = 조사강도 × 시간 × 노출면적 이므로,
     같은 양을 채우려면 노출면적이 작을수록 시간이 길어져야 한다 → f_BSA는 분모.
       (분모일 때)  반팔반바지 40분  <  긴팔긴바지 160분    ← 직관과 일치

     ※ §1의 "공식 통일" 대상이므로 다른 프로토타입도 같이 맞춰야 한다.
        되돌리려면 이 한 줄만 false로 바꾸면 명세 원문 그대로 동작한다. */
  var F_BSA_IN_DENOMINATOR = true;

  var CLOTHING = {
    shortShort: { f: 0.40, label: '반팔 + 반바지' },
    shortLong:  { f: 0.25, label: '반팔 + 긴바지' },
    longLong:   { f: 0.10, label: '긴팔 + 긴바지' }
  };

  var LIMIT_LABEL = {
    vitd: '비타민D 필요량',
    burn: '화상 한계',
    heat: '열 안전 상한'
  };

  /* ---------- §3 체감온도 — NOAA Heat Index ---------- */
  function heatIndex(tempC, rh) {
    var T = tempC * 9 / 5 + 32;
    var R = rh;

    // NWS 규칙: 단순식과 기온의 평균이 80°F 미만이면 단순식을 그대로 쓴다
    var simple = 0.5 * (T + 61.0 + ((T - 68.0) * 1.2) + (R * 0.094));
    if ((simple + T) / 2 < 80) return (simple - 32) * 5 / 9;

    var HI = -42.379 + 2.04901523 * T + 10.14333127 * R
           - 0.22475541 * T * R - 0.00683783 * T * T
           - 0.05481717 * R * R + 0.00122874 * T * T * R
           + 0.00085282 * T * R * R - 0.00000199 * T * T * R * R;

    if (R < 13 && T >= 80 && T <= 112) {
      HI -= ((13 - R) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
    } else if (R > 85 && T >= 80 && T <= 87) {
      HI += ((R - 85) / 10) * ((87 - T) / 5);
    }
    return (HI - 32) * 5 / 9;
  }

  /* §3 표 — 체감온도 → 최대 노출 + 부가 지시문구 */
  function heatCap(hiC) {
    if (hiC < 31) return { minutes: Infinity, level: 0, note: null };
    if (hiC < 35) return { minutes: 20, level: 1, note: '물 마시고 나가세요' };
    if (hiC < 38) return { minutes: 10, level: 2, note: '모자 쓰고, 직사광선 짧게' };
    return { minutes: 0, level: 3, note: '노출 금지 — 다른 시간대로' };
  }

  /* ---------- §2 한 시점의 노출시간 ---------- */
  function computePoint(o) {
    var med  = MED[o.skinType] || MED[3];
    var fBSA = (CLOTHING[o.clothing] || CLOTHING.shortShort).f;
    var spf  = o.spf && o.spf > 1 ? o.spf : 1;   // 안 바르면 1
    var uvi  = o.uvi > 0 ? o.uvi : 0;

    var denom = UVI_COEFF * uvi;
    var vitd = denom > 0
      ? (F_BSA_IN_DENOMINATOR ? (K * med) / (denom * fBSA)   // 물리 기준(미채택)
                              : (K * med * fBSA) / denom)    // 명세 §2 그대로
      : Infinity;
    var burn = denom > 0 ? (med * spf) / denom : Infinity;

    /* §3 체감온도 — 예보가 체감온도(apparent_temperature)를 직접 주면 그 값을 쓰고,
       없을 때만 기온·습도로 NOAA Heat Index를 계산한다. */
    var hi   = (o.feelsLike != null && isFinite(o.feelsLike))
             ? o.feelsLike
             : heatIndex(o.tempC, o.rh);
    var heat = heatCap(hi);

    var minutes = Math.min(vitd, burn, heat.minutes);
    var limitedBy = minutes === heat.minutes ? 'heat' : (minutes === burn ? 'burn' : 'vitd');

    return {
      minutes: minutes,
      limitedBy: limitedBy,
      limitedByLabel: LIMIT_LABEL[limitedBy],
      vitd: vitd, burn: burn, heat: heat.minutes,
      heatIndexC: hi, heatLevel: heat.level, heatNote: heat.note,
      uvi: uvi, uviClear: o.uviClear == null ? null : o.uviClear,
      tempC: o.tempC, rh: o.rh, feelsLike: o.feelsLike,
      heatFromForecast: (o.feelsLike != null && isFinite(o.feelsLike)),
      med: med, fBSA: fBSA, spf: spf
    };
  }

  /* ---------- §2 창이 열리는 조건 (셋 다 만족해야 함) ---------- */
  function isOpen(altitudeDeg, r) {
    return altitudeDeg >= 45          // 1. 그림자가 키보다 짧다 = UVB 도달
        && r.heat > 0                 // 2. 열 안전 상한 > 0
        && r.minutes <= 60;           // 3. 60분 넘으면 비현실적이라 창을 안 냄
  }

  /* ---------- 시간별 데이터 → 10분 간격 보간 ---------- */
  function interpolate(hourly, stepMin) {
    stepMin = stepMin || 10;
    var out = [];
    for (var i = 0; i < hourly.length - 1; i++) {
      var a = hourly[i], b = hourly[i + 1];
      for (var t = 0; t < 60; t += stepMin) {
        var w = t / 60;
        out.push({
          minuteOfDay: a.minuteOfDay + t,
          uvi:   a.uvi   + (b.uvi   - a.uvi)   * w,
          tempC: a.tempC + (b.tempC - a.tempC) * w,
          rh:    lerp(a.rh, b.rh, w),
          feelsLike: lerp(a.feelsLike, b.feelsLike, w),
          uviClear:  lerp(a.uviClear,  b.uviClear,  w)
        });
      }
    }
    if (hourly.length) out.push(hourly[hourly.length - 1]);
    return out;
  }

  /* 값이 없는 항목(null)은 보간하지 않고 null로 둔다 */
  function lerp(a, b, w) {
    if (a == null || b == null) return a == null ? b : a;
    return a + (b - a) * w;
  }

  /* ---------- 노출창 탐색 ----------
     series: [{minuteOfDay, uvi, tempC, rh}] · sunAlt(minuteOfDay) → 고도(도) */
  function scan(series, profile, sunAlt) {
    return series.map(function (p) {
      var r = computePoint({
        uvi: p.uvi, uviClear: p.uviClear, tempC: p.tempC, rh: p.rh,
        feelsLike: p.feelsLike,
        skinType: profile.skinType, clothing: profile.clothing, spf: profile.spf
      });
      r.minuteOfDay = p.minuteOfDay;
      r.altitude = sunAlt(p.minuteOfDay);
      r.open = isOpen(r.altitude, r);
      return r;
    });
  }

  /* 연속으로 열린 구간을 창 하나로 묶는다 */
  function findWindows(scanned) {
    var wins = [], cur = null;
    scanned.forEach(function (p) {
      if (p.open) {
        if (!cur) cur = { start: p.minuteOfDay, end: p.minuteOfDay, points: [] };
        cur.end = p.minuteOfDay;
        cur.points.push(p);
      } else if (cur) { wins.push(cur); cur = null; }
    });
    if (cur) wins.push(cur);

    return wins.map(function (w) {
      /* 창 안에서 권장 시점 고르기.
         그냥 '필요시간이 가장 짧은' 시점을 고르면 안 된다 —
         열 상한/화상 한계에 잘려서 짧아진 시각이 1등으로 뽑히기 때문이다.
         (예: 12시 25분(목표 달성 가능) vs 14시 20분(열 상한에 잘림) → 14시가 뽑힘)

         그래서 '목표를 실제로 끝까지 채울 수 있는 시점'을 먼저 추리고,
         그 안에서 가장 짧은 시각을 고른다. 하나도 없으면 그때만 기존 방식으로 뽑되
         화면에서 "목표를 못 채운다"고 알려 준다. */
      var completable = w.points.filter(function (p) {
        return p.vitd <= p.heat && p.vitd <= p.burn;
      });
      var pool = completable.length ? completable : w.points;
      var best = pool.reduce(function (m, p) { return p.minutes < m.minutes ? p : m; });
      w.completable = completable.length > 0;
      w.end += 10;                       // 마지막 표본이 대표하는 구간 폭
      w.best = best;
      w.recommendStart   = Math.round(best.minuteOfDay / 5) * 5;
      w.recommendMinutes = Math.max(1, Math.round(best.minutes));
      w.spanMinutes = w.end - w.start;
      return w;
    }).sort(function (a, b) {
      /* 목표를 채울 수 있는 창을 먼저, 그 안에서는 이른 시각 순 */
      if (a.completable !== b.completable) return a.completable ? -1 : 1;
      return a.start - b.start;
    });
  }

  /* ---------- §4 기상·계절 모드 (판정 순서대로, 첫 히트 적용) ---------- */
  function decideMode(ctx) {   // ctx: {maxAltitude, maxHeatIndexC, windows}
    if (ctx.maxAltitude < 45) {
      return {
        id: 'winter', label: '겨울',
        reason: '오늘 최대 태양고도 ' + ctx.maxAltitude.toFixed(0) + '° — 45°에 못 미칩니다',
        headline: '오늘은 햇빛으로 비타민D를 만들 수 없어요',
        windows: []
      };
    }
    if (ctx.maxHeatIndexC >= 31) {
      var am = ctx.windows.filter(function (w) { return w.recommendStart < 12 * 60; });
      return {
        id: 'heat', label: '폭염',
        reason: '오늘 최고 체감온도 ' + ctx.maxHeatIndexC.toFixed(0) + '℃ — 정오·오후 창은 닫았습니다',
        headline: am.length ? '오전 창만 열어 뒀어요' : '오늘은 안 나가는 게 낫습니다',
        windows: am
      };
    }
    if (ctx.windows.length === 0) {
      return {
        id: 'cloudy', label: '장마 · 흐림',
        reason: '날씨가 흐려 오늘 일조 시간이 없습니다',
        headline: '오늘은 무리예요',
        windows: []
      };
    }
    return {
      id: 'normal', label: '평상',
      reason: '전 시간대 개방 · 효율이 가장 좋은 창부터 보여드립니다',
      headline: '오늘 이 창이 제일 좋아요',
      windows: ctx.windows
    };
  }

  /* ---------- 체내 저장량 추적 — 25(OH)D 반감기 ≈ 21일 ---------- */
  var HALF_LIFE_DAYS = 21;

  function dayKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* dailyPercents: {'2026-08-31': 62, ...} → 0~100 정규화 저장량
     100% = 매일 목표치를 채워 온 상태 */
  function bodyStore(dailyPercents) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var num = 0, den = 0;
    for (var d = 0; d < 60; d++) {
      var day = new Date(today.getTime() - d * 86400000);
      var decay = Math.pow(0.5, d / HALF_LIFE_DAYS);
      num += (dailyPercents[dayKey(day)] || 0) * decay;
      den += 100 * decay;
    }
    return den > 0 ? Math.min(100, num / den * 100) : 0;
  }

  function weeklyCharge(dailyPercents) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var sum = 0, days = [];
    for (var d = 6; d >= 0; d--) {
      var day = new Date(today.getTime() - d * 86400000);
      var v = dailyPercents[dayKey(day)] || 0;
      sum += v;
      days.push({ key: dayKey(day), date: day, percent: v });
    }
    return { percent: Math.round(sum / 7), days: days };
  }

  /* 연속으로 창이 없던 날수 — §5 장마 모드 안내 강도 결정 */
  function consecutiveMissDays(dailyPercents, todayHasWindow) {
    if (todayHasWindow) return 0;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var n = 1;
    for (var d = 1; d < 30; d++) {
      var day = new Date(today.getTime() - d * 86400000);
      if ((dailyPercents[dayKey(day)] || 0) > 0) break;
      n++;
    }
    return n;
  }

  /* ---------- §6 축 2 — 생체리듬 ----------
     유리창: UVB(290~315nm) 차단 / 가시광 청색(~460nm) 통과
     → 창가에 앉아 있으면 비타민D는 0이지만 생체리듬은 리셋된다 */
  function circadian(wakeMinutes, exposureMinuteOfDay) {
    var tmin = wakeMinutes - 120;                 // 심부체온 최저점
    if (tmin < 0) tmin += 1440;
    var avoidStart = (wakeMinutes + 16 * 60) % 1440;

    var phase = null;
    if (exposureMinuteOfDay != null) {
      phase = exposureMinuteOfDay >= tmin ? 'advance' : 'delay';
    }
    return {
      tmin: tmin,
      avoidStart: avoidStart,
      phase: phase,
      phaseLabel: phase === 'advance' ? '위상 전진 — 일찍 졸립니다'
                : phase === 'delay'   ? '위상 지연 — 늦게 졸립니다' : null
    };
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  return {
    K: K, UVI_COEFF: UVI_COEFF, MED: MED, CLOTHING: CLOTHING,
    F_BSA_IN_DENOMINATOR: F_BSA_IN_DENOMINATOR,
    HALF_LIFE_DAYS: HALF_LIFE_DAYS, LIMIT_LABEL: LIMIT_LABEL,
    heatIndex: heatIndex, heatCap: heatCap,
    computePoint: computePoint, isOpen: isOpen,
    interpolate: interpolate, scan: scan, findWindows: findWindows,
    decideMode: decideMode,
    bodyStore: bodyStore, weeklyCharge: weeklyCharge,
    consecutiveMissDays: consecutiveMissDays,
    circadian: circadian, dayKey: dayKey
  };
})();
