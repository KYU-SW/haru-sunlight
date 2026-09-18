/* =========================================================
   shared / 시간별 UV · 기온 그래프 (인라인 SVG)
   가능 창을 파란 띠로 하이라이트한다 (§9 홈)
   ========================================================= */
var Chart = (function () {

  var W = 320, H = 132, PAD_B = 20, T0 = 5 * 60, T1 = 20 * 60;

  function x(min) { return (min - T0) / (T1 - T0) * W; }

  function render(rx) {
    var pts = rx.scanned.filter(function (p) {
      return p.minuteOfDay >= T0 && p.minuteOfDay <= T1;
    });
    if (!pts.length) return '';

    var uvMax = Math.max(2, Math.ceil(pts.reduce(function (m, p) { return Math.max(m, p.uvi); }, 0)));
    var tMin = pts.reduce(function (m, p) { return Math.min(m, p.tempC); }, 99);
    var tMax = pts.reduce(function (m, p) { return Math.max(m, p.tempC); }, -99);
    if (tMax - tMin < 4) tMax = tMin + 4;

    var plotH = H - PAD_B;
    var uvY = function (v) { return plotH - (v / uvMax) * (plotH - 8); };
    var tY  = function (v) { return plotH - ((v - tMin) / (tMax - tMin)) * (plotH - 26) - 8; };

    /* 가능 창 하이라이트 */
    var bands = rx.windows.map(function (w) {
      var x0 = Math.max(0, x(w.start)), x1 = Math.min(W, x(w.end));
      if (x1 <= x0) return '';
      return '<rect x="' + x0.toFixed(1) + '" y="0" width="' + (x1 - x0).toFixed(1) +
             '" height="' + plotH + '" rx="4" fill="#2B63F6" opacity=".1"/>';
    }).join('');

    /* UV 곡선 + 면적 */
    var line = '', area = '';
    pts.forEach(function (p, i) {
      var px = x(p.minuteOfDay).toFixed(1), py = uvY(p.uvi).toFixed(1);
      line += (i ? 'L' : 'M') + px + ' ' + py;
    });
    area = line + 'L' + x(pts[pts.length - 1].minuteOfDay).toFixed(1) + ' ' + plotH +
           'L' + x(pts[0].minuteOfDay).toFixed(1) + ' ' + plotH + 'Z';

    /* 기온 곡선 */
    var tline = '';
    pts.forEach(function (p, i) {
      tline += (i ? 'L' : 'M') + x(p.minuteOfDay).toFixed(1) + ' ' + tY(p.tempC).toFixed(1);
    });

    /* 눈금 */
    var ticks = '';
    [6, 9, 12, 15, 18].forEach(function (h) {
      var px = x(h * 60);
      ticks += '<line x1="' + px.toFixed(1) + '" y1="0" x2="' + px.toFixed(1) + '" y2="' + plotH +
               '" stroke="#DCE3EE" stroke-width="1" stroke-dasharray="2 3"/>' +
               '<text x="' + px.toFixed(1) + '" y="' + (H - 5) +
               '" fill="#8A96AA" font-size="10" font-weight="600" text-anchor="middle">' + h + '시</text>';
    });

    /* 지금 시각 */
    var nowLine = '';
    if (rx.nowMinute != null && rx.nowMinute >= T0 && rx.nowMinute <= T1) {
      var nx = x(rx.nowMinute).toFixed(1);
      nowLine = '<line x1="' + nx + '" y1="0" x2="' + nx + '" y2="' + plotH +
                '" stroke="#141A24" stroke-width="1.5"/>' +
                '<circle cx="' + nx + '" cy="0" r="3" fill="#141A24"/>';
    }

    /* 권장 시작점 마커 */
    var mark = '';
    if (rx.targetWindow) {
      var mx = x(rx.targetWindow.recommendStart);
      var my = uvY(rx.targetWindow.best.uvi);
      if (mx >= 0 && mx <= W) {
        var lab = '추천 ' + UI.hm(rx.targetWindow.recommendStart);
        var lw = lab.length * 6.2 + 14;                     // 글자 수로 말풍선 너비를 잡는다
        var lx = Math.min(W - lw / 2, Math.max(lw / 2, mx)); // 그래프 밖으로 나가지 않게
        var ly = Math.max(16, my - 26);
        mark =
          '<line x1="' + mx.toFixed(1) + '" y1="' + (ly + 9) + '" x2="' + mx.toFixed(1) +
            '" y2="' + my.toFixed(1) + '" stroke="#2B63F6" stroke-width="1.5" opacity=".45"/>' +
          '<rect x="' + (lx - lw / 2).toFixed(1) + '" y="' + (ly - 9) + '" width="' + lw.toFixed(1) +
            '" height="19" rx="7" fill="#2B63F6"/>' +
          '<text x="' + lx.toFixed(1) + '" y="' + (ly + 4) +
            '" fill="#fff" font-size="10.5" font-weight="700" text-anchor="middle">' + lab + '</text>' +
          '<circle cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) +
            '" r="5" fill="#fff" stroke="#2B63F6" stroke-width="3"/>';
      }
    }

    return '' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" preserveAspectRatio="none" style="overflow:visible">' +
        '<defs><linearGradient id="uvg" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#2B63F6" stop-opacity=".28"/>' +
          '<stop offset="100%" stop-color="#2B63F6" stop-opacity="0"/>' +
        '</linearGradient></defs>' +
        ticks + bands +
        '<path d="' + area + '" fill="url(#uvg)"/>' +
        '<path d="' + tline + '" fill="none" stroke="#F59E0B" stroke-width="1.6" stroke-dasharray="3 3" stroke-linecap="round"/>' +
        '<path d="' + line + '" fill="none" stroke="#2B63F6" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>' +
        nowLine + mark +
      '</svg>' +
      '<div style="display:flex;justify-content:center;padding:6px 2px 0;font-size:11px;color:#8A96AA;font-weight:600">' +
        '<span>기온 ' + Math.round(tMin) + '~' + Math.round(tMax) + '℃</span>' +
      '</div>';
  }


  /* ---------- 도넛 게이지 ----------
     레퍼런스처럼 두꺼운 원호 + 남은 몫은 빗금. pct는 0~100.
     center에 넣은 HTML이 가운데에 그대로 표시된다. */
  function donut(pct, opts) {
    opts = opts || {};
    var size = opts.size || 132, sw = opts.stroke || 15;
    var color = opts.color || '#2B63F6';
    var r = (size - sw) / 2, cx = size / 2, c = 2 * Math.PI * r;
    var p = Math.max(0, Math.min(100, pct)) / 100;
    var id = 'hatch' + Math.random().toString(36).slice(2, 7);

    return '<div class="donut" style="width:' + size + 'px;height:' + size + 'px">' +
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" ' +
           'style="transform:rotate(-90deg)">' +
        '<defs><pattern id="' + id + '" width="5" height="5" patternUnits="userSpaceOnUse" ' +
          'patternTransform="rotate(45)">' +
          '<line x1="0" y1="0" x2="0" y2="5" stroke="#D3DAE5" stroke-width="2.8"/>' +
        '</pattern></defs>' +
        '<circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" ' +
          'stroke="url(#' + id + ')" stroke-width="' + sw + '"/>' +
        '<circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke="' + color + '" ' +
          'stroke-width="' + sw + '" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" ' +
          'stroke-dashoffset="' + (c * (1 - p)).toFixed(1) + '" ' +
          'style="transition:stroke-dashoffset .8s cubic-bezier(.25,.46,.45,.94)"/>' +
      '</svg>' +
      '<div class="donut-in">' + (opts.center || '') + '</div>' +
    '</div>';
  }

  /* ---------- 반원 게이지 ---------- */
  function arc(pct, opts) {
    opts = opts || {};
    var w = opts.width || 230, sw = opts.stroke || 16;
    var color = opts.color || '#2B63F6';
    var r = (w - sw) / 2, cx = w / 2, cy = r + sw / 2;
    var h = cy + sw / 2 + 2;
    var len = Math.PI * r;                       // 반원 길이
    var p = Math.max(0, Math.min(100, pct)) / 100;
    var id = 'hatch' + Math.random().toString(36).slice(2, 7);
    var d = 'M' + (sw / 2) + ' ' + cy + ' A' + r + ' ' + r + ' 0 0 1 ' + (w - sw / 2) + ' ' + cy;

    return '<div class="donut" style="width:' + w + 'px;height:' + h + 'px;margin:0 auto">' +
      '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
        '<defs><pattern id="' + id + '" width="5" height="5" patternUnits="userSpaceOnUse" ' +
          'patternTransform="rotate(45)">' +
          '<line x1="0" y1="0" x2="0" y2="5" stroke="#D3DAE5" stroke-width="2.8"/>' +
        '</pattern></defs>' +
        '<path d="' + d + '" fill="none" stroke="url(#' + id + ')" stroke-width="' + sw + '"/>' +
        '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" ' +
          'stroke-linecap="round" stroke-dasharray="' + len.toFixed(1) + '" ' +
          'stroke-dashoffset="' + (len * (1 - p)).toFixed(1) + '" ' +
          'style="transition:stroke-dashoffset .8s cubic-bezier(.25,.46,.45,.94)"/>' +
      '</svg>' +
      '<div class="donut-in" style="justify-content:flex-end;padding-bottom:6px">' +
        (opts.center || '') + '</div>' +
    '</div>';
  }

  return { render: render, donut: donut, arc: arc };
})();
