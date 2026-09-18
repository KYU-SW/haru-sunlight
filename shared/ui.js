/* =========================================================
   UI 공통 유틸 — 포맷 · 아이콘 · 토스트 · 바텀시트
   ========================================================= */
var UI = (function () {

  function p2(n) { return n < 10 ? '0' + n : '' + n; }

  /* 분(0~1440) → '09:15' */
  function hm(min) {
    min = Math.round(min);
    var h = Math.floor(min / 60) % 24, m = min % 60;
    return p2(h) + ':' + p2(m);
  }
  /* 분 → '오전 9:15' (토스식 한글 시각) */
  function hmk(min) {
    min = Math.round(min);
    var h = Math.floor(min / 60) % 24, m = min % 60;
    var ap = h < 12 ? '오전' : '오후';
    var hh = h % 12; if (hh === 0) hh = 12;
    return ap + ' ' + hh + ':' + p2(m);
  }
  function dateKo(d) {
    var w = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + w + '요일';
  }
  function timeToMin(s) {
    var a = (s || '07:00').split(':');
    return parseInt(a[0], 10) * 60 + parseInt(a[1] || 0, 10);
  }
  function nowMin() {
    var d = new Date();
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function mins(v) {
    if (!isFinite(v)) return '제한 없음';
    if (v >= 600) return '10시간+';
    return (v < 10 ? Math.round(v * 10) / 10 : Math.round(v)) + '분';
  }

  var ICON = {
    pin:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/></svg>',
    timer:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>',
    week: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20V11M12 20V4M19 20v-6"/></svg>',
    set:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1v.3a2 2 0 11-4 0v-.2a1.6 1.6 0 00-2.8-1.1l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 004.6 15a2 2 0 00-1.8-1.2h-.3a2 2 0 010-4h.2A1.6 1.6 0 004.6 9a1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5v-.3a2 2 0 014 0v.2a1.6 1.6 0 002.7 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8v.1a1.6 1.6 0 001.5 1H21a2 2 0 010 4h-.2a1.6 1.6 0 00-1.4 1z"/></svg>',
    right:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 01-3.4 0"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
    refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 11-2.6-6.4M21 3v6h-6"/></svg>',
    /* 레퍼런스의 원형 아이콘 버튼들 */
    sliders:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8h10M18 8h2M4 16h4M12 16h8"/><circle cx="16" cy="8" r="2.2"/><circle cx="10" cy="16" r="2.2"/></svg>',
    sun:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M19.1 4.9l-1.6 1.6M6.5 17.5l-1.6 1.6"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c0-4 3.4-6 7.5-6s7.5 2 7.5 6"/></svg>',
    search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>'
  };

  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  function sheet(title, desc, html) {
    var bg = document.getElementById('sheet-bg');
    document.getElementById('sheet-body').classList.remove('tall');
    document.getElementById('sheet-body').innerHTML =
      '<div class="sheet-grip"></div>' +
      '<div class="sheet-t">' + title + '</div>' +
      (desc ? '<div class="sheet-d">' + desc + '</div>' : '') + (html || '');
    bg.classList.add('show');
  }
  function closeSheet() { document.getElementById('sheet-bg').classList.remove('show'); }

  return {
    p2: p2, hm: hm, hmk: hmk, dateKo: dateKo, timeToMin: timeToMin,
    nowMin: nowMin, esc: esc, mins: mins,
    ICON: ICON, toast: toast, sheet: sheet, closeSheet: closeSheet
  };
})();
