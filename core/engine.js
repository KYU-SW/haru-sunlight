/* =========================================================
   2계층 — 계산 엔진 (순수 함수)
   개발명세 §2 · §3 · §4 · §6 을 그대로 옮긴 것.
   여기 있는 상수/공식은 프로토타입 간 통일 대상 → 임의 수정 금지.
   ========================================================= */
var Engine = (function () {

  /* ---------- §2 상수 — 근거와 출처는 CALCULATION.md ---------- */

  /* 비타민D 시간 — Sánchez-Pérez 외(2024, Heliyon 10:e30864) 식 4·6·9 그대로 (McKenzie 계열)
       t = MED ÷ (k × R × 자외선지수 × 노출 비율)
       k = 12.5 J/m²·min : 피부 타입 Ⅱ가 온몸을 드러내고 자외선지수 10, R = 2일 때 1,000 IU에 약 1분 (논문 유도값)
       R = 1.3121 × 자외선지수^-0.1722 : 비타민D 유효 자외선 ÷ 홍반 유효 자외선 (식 6) */
  var K_VITD = 12.5;
  function vitdRatio(uvi) { return 1.3121 * Math.pow(uvi, -0.1722); }

  /* UVI → 분 단위 환산계수. 자외선지수 1 = 25 mW/m² (WHO·WMO·UNEP·ICNIRP)
     0.025 W/m² × 60초 = 1.5 */
  var UVI_COEFF = 1.5;

  /* 피부 타입별 최소홍반량(J/m²) — Kallioğlu 외(2024, Scientific Reports) 표 */
  var MED = { 1: 200, 2: 250, 3: 300, 4: 450, 5: 600, 6: 1000 };

  /* 노출 비율(AF) — Sánchez-Pérez 외(2024) 표 3 그대로
       얼굴 0.09 · 얼굴+손 0.10 · 얼굴+손+팔 0.27 · 얼굴+손+팔+다리 0.63 · 온몸 1.00 */
  var CLOTHING = {
    shortShort: { f: 0.63, label: '반팔 + 반바지' },   // 얼굴 · 손 · 팔 · 다리
    shortLong:  { f: 0.27, label: '반팔 + 긴바지' },   // 얼굴 · 손 · 팔
    longLong:   { f: 0.10, label: '긴팔 + 긴바지' }    // 얼굴 · 손
  };

  /* ---------- 개인 변수 — 근거와 출처는 CALCULATION.md ⑤ ---------- */

  /* 쬐는 장소 — 바닥이 자외선을 되쏘아 몸이 받는 양이 늘어난다
       모래 15% · 새 눈 최대 80% : WHO(2002) 자외선지수 안내서
       바닷가 5% : Diffey & Mobley(2018) — 자외선지수 14에서 바닷물 반사는 지수 0.7 정도 */
  var PLACES = {
    normal: { r: 0,    label: '공원 · 길' },
    sand:   { r: 0.15, label: '모래사장' },
    sea:    { r: 0.05, label: '바닷가' },
    snow:   { r: 0.8,  label: '눈 위' }
  };

  /* 나이 · 키 · 몸무게는 계산에 쓰지 않는다 (CALCULATION.md ⑤)
       나이 — Borecka 외(2024, Nutrients): 65~89세와 18~40세의 비타민D 생성에 유의한 차이 없음
       비만 — Obbarius 외(2017, Endocrine): 같은 UVB에서 비만군 증가가 오히려 51% 더 큼
     BMI는 Firestore 통계 구간(shared/sync.js)에만 쓴다. */
  function bmi(heightCm, weightKg) {
    return heightCm > 0 && weightKg > 0 ? weightKg / Math.pow(heightCm / 100, 2) : null;
  }

  /* 프로필에서 계산에 쓰는 값만 뽑는다 — 모든 호출부가 같은 값을 넘기게 */
  function personal(profile) {
    profile = profile || {};
    return {
      skinType: profile.skinType, clothing: profile.clothing, place: profile.place,
      age: profile.age, heightCm: profile.heightCm, weightKg: profile.weightKg
    };
  }

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

  /* §3 체감온도 — 고용노동부 「2026년 폭염 대비 노동자 건강보호 대책」(2026.5.13) 권고 그대로
       33℃ 이상(폭염주의보)   : 옥외 활동 단축
       35℃ 이상(폭염경보)     : 오후 2~5시 옥외 활동 중지
       38℃ 이상(폭염중대경보) : 옥외 활동 중지
     정부 기준에 '몇 분까지'라는 숫자는 없어서 분 상한은 두지 않고, 막는 시간대만 정한다. */
  var HOT_START = 14 * 60, HOT_END = 17 * 60;
  function heatCap(hiC, minuteOfDay) {
    if (hiC < 33) return { minutes: Infinity, level: 0, note: null };
    if (hiC < 35) return { minutes: Infinity, level: 1, note: '폭염주의보 수준 — 짧게 나가세요' };
    if (hiC < 38) {
      var hot = minuteOfDay != null && minuteOfDay >= HOT_START && minuteOfDay < HOT_END;
      return hot ? { minutes: 0, level: 2, note: '폭염경보 수준 — 오후 2~5시는 나가지 마세요' }
                 : { minutes: Infinity, level: 2, note: '폭염경보 수준 — 오후 2~5시는 피하세요' };
    }
    return { minutes: 0, level: 3, note: '폭염중대경보 수준 — 나가지 마세요' };
  }

  /* ---------- §2 한 시점의 노출시간 ---------- */
  function computePoint(o) {
    var med  = MED[o.skinType] || MED[3];
    var fBSA = (CLOTHING[o.clothing] || CLOTHING.shortShort).f;
    var uvi  = o.uvi > 0 ? o.uvi : 0;
    var refl = (PLACES[o.place] || PLACES.normal).r;

    /* 바닥 반사만큼 몸이 받는 자외선이 늘어난다 — 비타민D·화상 둘 다에 적용 */
    var denom = UVI_COEFF * uvi * (1 + refl);

    /* 비타민D : Sánchez-Pérez 외(2024) 식 4·9 — MED ÷ (k × R × 자외선지수 × 노출 비율)
       바닥 반사만큼 받는 자외선이 늘고, R은 하늘의 자외선지수로 정한다. */
    var vitd = uvi > 0 ? med / (K_VITD * vitdRatio(uvi) * uvi * (1 + refl) * fBSA) : Infinity;

    /* 화상 : 면적과 무관하다 — 드러난 피부 한 곳이 받는 양은 옷차림과 상관없이 같다. */
    var burn = denom > 0 ? med / denom : Infinity;

    /* §3 체감온도 — 예보가 체감온도(apparent_temperature)를 직접 주면 그 값을 쓰고,
       없을 때만 기온·습도로 NOAA Heat Index를 계산한다. */
    var hi   = (o.feelsLike != null && isFinite(o.feelsLike))
             ? o.feelsLike
             : heatIndex(o.tempC, o.rh);
    var heat = heatCap(hi, o.minuteOfDay);

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
      med: med, fBSA: fBSA, place: o.place || 'normal', reflection: refl,

      rain: !!o.rain
    };
  }

  /* ---------- §2 창이 열리는 조건 (넷 다 만족해야 함) ---------- */
  function isOpen(altitudeDeg, r) {
    return altitudeDeg >= 45          // 1. 그림자가 키보다 짧다 = UVB 도달
        && r.heat > 0                 // 2. 열 안전 상한 > 0
        && r.minutes <= 60            // 3. 60분 넘으면 비현실적이라 창을 안 냄
        && !r.rain;                   // 4. 비·눈 예보 시간은 뺀다 (기상청 강수형태 PTY)
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
          uviClear:  lerp(a.uviClear,  b.uviClear,  w),
          rain: !!a.rain                  // 강수는 그 시각부터 한 시간 동안으로 본다
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
    var me = personal(profile);
    return series.map(function (p) {
      var o = {
        uvi: p.uvi, uviClear: p.uviClear, tempC: p.tempC, rh: p.rh,
        feelsLike: p.feelsLike, rain: p.rain, minuteOfDay: p.minuteOfDay
      };
      for (var k in me) o[k] = me[k];
      var r = computePoint(o);
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
    if (ctx.maxHeatIndexC >= 33) {   // 기상청 폭염주의보 기준(체감 33℃)
      var am = ctx.windows.filter(function (w) { return w.recommendStart < 12 * 60; });
      return {
        id: 'heat', label: '폭염',
        reason: '오늘 최고 체감온도 ' + ctx.maxHeatIndexC.toFixed(0) + '℃ — 정오·오후에는 나가지 마세요',
        headline: am.length ? '오전에만 나가요' : '오늘은 안 나가는 게 낫습니다',
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
      reason: '효율이 가장 좋은 시간부터 보여드려요',
      headline: '오늘 이 시간이 제일 좋아요',
      windows: ctx.windows
    };
  }

  /* ---------- 평소 나가는 시각 — 내 기록에서 찾는다 ----------
     최근 14일 타이머 기록이 3번 이상이면 시작 시각의 가운데 값(분). 모자라면 null. */
  var HABIT_DAYS = 14, HABIT_MIN_COUNT = 3;
  function habitMinute(sessions, nowMs) {
    var from = (nowMs || Date.now()) - HABIT_DAYS * 86400000;
    var mins = (sessions || []).filter(function (s) { return s && s.at >= from; })
      .map(function (s) { var d = new Date(s.at); return d.getHours() * 60 + d.getMinutes(); })
      .sort(function (a, b) { return a - b; });
    if (mins.length < HABIT_MIN_COUNT) return null;
    var h = mins.length >> 1;
    return mins.length % 2 ? mins[h] : Math.round((mins[h - 1] + mins[h]) / 2);
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
    K_VITD: K_VITD, vitdRatio: vitdRatio, UVI_COEFF: UVI_COEFF, MED: MED, CLOTHING: CLOTHING,
    PLACES: PLACES, bmi: bmi,
    personal: personal, habitMinute: habitMinute,
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
