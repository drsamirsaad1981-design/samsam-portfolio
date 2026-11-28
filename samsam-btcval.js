// samsam-btcval.js — the Bitcoin Pi Cycle + Bitcoin MVRV card on the Market Hub (market.html → #valCard), under the
// rainbow in the "Bitcoin Valuation" section.
//
// Two cells side by side, each a market reading WITHOUT a personal level (your own exit levels stay on Plan → Exit):
//   · the value now;
//   · a range bar from the lowest to the highest reading since 2012, with a dot where today's stands — the same filled
//     bar (8 px, rounded) and the same white dot with a dark ring as Altcoin Season's and BTC Funding's, on ONE smooth
//     cold → warm blend of the funding bar's colours (lower readings cold, higher warm): no segments, no edges, no
//     named level — and never the profit green or the loss red;
//   · for the Pi Cycle: the two averages in dollars (the same numbers as the Exit page's row), so the cell says what the
//     percent is made of and stands as tall as MVRV's;
//   · "Higher than N% of days since 2012" — measured by the daily jobs (tools/update-rainbow.mjs for the Pi Cycle,
//     tools/update-macro.mjs for MVRV), never a zone we named: no "low / high", no "cheap / expensive";
//   · this cycle's highest reading;
//   · for MVRV: Bitcoin's realized market cost, and the source's name (Coin Metrics' free data asks for it).
// The readers are samsam-core.js (btcMarks → pi, mvrvRead) — the same numbers as the Exit page's rows. A part that is
// missing or too old shows no cell; no cell, no card. A cell made before the jobs wrote the history shows no bar and no
// "higher than" line rather than a guess. The words are written here in the page's language (data-no-tr).
(function () {
  'use strict';
  if (window.SamsamBtcVal) return;
  var el = null, rb = null, mv = null;
  var ar = function () { return !!(window.CPLang && window.CPLang.ar); }, T = function (en, a) { return ar() ? a : en; };
  var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var C = function () { return window.Samsam && window.Samsam.core && window.Samsam.core.btcMarks && window.Samsam.core.histPos ? window.Samsam.core : null; };
  var M = function () { return window.SamsamMarket; };
  var L = function (s) { return '<bdi dir="ltr">' + E(s) + '</bdi>'; };   // a number keeps its shape inside an Arabic line
  var usd = function (v) { return '$' + Math.round(v).toLocaleString('en-US'); };
  // the bar's blend: the funding bar's five colours (samsam-funding.js → COL, measured there), run together without edges
  var RAMP = (window.SamsamFunding && window.SamsamFunding.COL) || ['#9d5bf4', '#3c96c5', '#b9c5d8', '#fdf156', '#e5a323'];

  var CSS = '.mk-val{margin-bottom:14px}.mk-val[hidden]{display:none}.bv-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px}' +
    '@media(max-width:339px){.bv-grid{grid-template-columns:1fr}}' +
    '.bv-cell{min-width:0;display:grid;gap:5px;align-content:start}.bv-cell+.bv-cell{border-inline-start:1px solid var(--border);padding-inline-start:18px}' +
    '@media(max-width:339px){.bv-cell+.bv-cell{border-inline-start:0;padding-inline-start:0;border-top:1px solid var(--border);padding-top:10px}}' +
    '.bv-k{font-size:.74rem;font-weight:700;color:var(--fg2);line-height:1.5}.bv-kt{white-space:nowrap;display:inline-flex;align-items:center;gap:4px}' +
    '.bv-v{font-size:1.45rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.15;color:var(--fg)}' +
    '.bv-n{font-size:.7rem;color:var(--fg2);line-height:1.45}.bv-n b{color:var(--fg);font-weight:700;font-variant-numeric:tabular-nums}' +
    '.bv-bar{direction:ltr;padding:3px 0 0}.bv-track{position:relative;height:8px;border-radius:4px;background:linear-gradient(90deg,' + RAMP.join(',') + ');box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--fg) 20%,transparent)}' +
    '.bv-rail{position:absolute;left:7px;right:7px;top:0;bottom:0}.bv-dot{position:absolute;top:50%;box-sizing:border-box;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#fff;border:2.5px solid #0b1020;box-shadow:0 0 0 1.5px rgba(255,255,255,.6)}' +
    '.bv-ends{display:flex;justify-content:space-between;margin-top:4px;font-size:.62rem;color:var(--fg2);font-variant-numeric:tabular-nums}';

  // one cell: name + ⓘ, the value, the range bar, the measured line, this cycle's highest, extra lines
  function cell(id, name, hint, value, fmt, hist, peak, extra) {
    var c = C(), pos = hist ? c.histPos(value, hist) : null, yr = hist && hist.year;
    var w = name.split(' '), tail = w.pop();   // the ⓘ never drops to a line of its own: it stays with the name's last word
    return '<div class="bv-cell" id="' + id + '"><div class="bv-k">' + (w.length ? E(w.join(' ')) + ' ' : '') + '<span class="bv-kt">' + E(tail) + '<span class="cp-hint" data-hint="' + hint + '" role="button" tabindex="0"></span></span></div>' +
      '<div class="bv-v">' + L(fmt(value)) + '</div>' +
      (pos == null ? '' : '<div class="bv-bar" role="img" aria-label="' + E(T('Between its lowest (' + fmt(hist.lo) + ') and its highest (' + fmt(hist.hi) + ') since ' + yr, 'بين أدنى قراءة (' + fmt(hist.lo) + ') وأعلى قراءة (' + fmt(hist.hi) + ') منذ ' + yr)) + '">' +
        '<div class="bv-track"><div class="bv-rail"><i class="bv-dot" style="left:' + pos.toFixed(1) + '%"></i></div></div><div class="bv-ends" aria-hidden="true"><span>' + E(fmt(hist.lo)) + '</span><span>' + E(fmt(hist.hi)) + '</span></div></div>' +
        '<div class="bv-n bv-pct">' + T('Higher than <b>' + L(Math.round(hist.under) + '%') + '</b> of days since ' + L(yr), 'أعلى من <b>' + L(Math.round(hist.under) + '%') + '</b> من الأيام منذ ' + L(yr)) + '</div>') +
      (peak == null ? '' : '<div class="bv-n bv-peak">' + T('This cycle’s highest: <b>' + L(fmt(peak)) + '</b>', 'أعلى قراءة بالدورة: <b>' + L(fmt(peak)) + '</b>') + '</div>') +
      (extra || '') + '</div>';
  }
  var lastOf = function (pk) { return pk && pk.length && pk[pk.length - 1] ? +pk[pk.length - 1][1] : null; };
  function paint() {
    if (!el) return;
    var c = C(); if (!c) return;
    var mk = rb ? c.btcMarks(rb, Date.now()) : null, p = mk && mk.pi, m = mv ? c.mvrvRead(mv, Date.now()) : null;
    if (!p && !m) { el.hidden = true; return; }
    var pf = function (v) { return (+v).toFixed(1) + '%'; }, mf = function (v) { return (+v).toFixed(2); };
    el.hidden = false;
    el.innerHTML = '<div class="bv-grid">' +
      (p ? cell('bvPi', T('Bitcoin Pi Cycle', 'مؤشر Pi Cycle للبيتكوين'), 'pi', p.ratio, pf, p.hist, lastOf(p.peaks),
        '<div class="bv-n">' + T(L('100%') + ' is the cross', L('100%') + ' هو التقاطع') + '</div>' +
        (p.d111 > 0 && p.d350x2 > 0 ? '<div class="bv-n bv-avg">' + T('111-day average: <b>' + L(usd(p.d111)) + '</b>', 'متوسط ' + L('111') + ' يوماً: <b>' + L(usd(p.d111)) + '</b>') + '</div>' +
          '<div class="bv-n bv-avg">' + T(L('2×') + ' 350-day average: <b>' + L(usd(p.d350x2)) + '</b>', 'ضعف متوسط ' + L('350') + ' يوماً: <b>' + L(usd(p.d350x2)) + '</b>') + '</div>' : '')) : '') +
      (m ? cell('bvMv', T('Bitcoin MVRV', 'مؤشر MVRV للبيتكوين'), 'mvrv', m.v, mf, m.hist, lastOf(m.peaks),
        (m.realized ? '<div class="bv-n bv-cost">' + T('Bitcoin’s realized market cost: <b>' + L(usd(m.realized)) + '</b>', 'متوسط تكلفة البيتكوين المحققة للسوق: <b>' + L(usd(m.realized)) + '</b>') + '</div>' : '') +
        '<div class="bv-n bv-src">' + T('Source: Coin Metrics', 'المصدر: ' + L('Coin Metrics')) + (m.via ? ' ' + T('(today’s value: ' + E(m.via) + ')', '(قيمة اليوم: ' + L(m.via) + ')') : '') + '</div>') : '') +
      '</div>';
    if (window.CPHint && window.CPHint.paint) window.CPHint.paint(el);
  }
  function load() {
    if (!M()) return;
    var go = function (n) { if (C() || n > 60) paint(); else setTimeout(function () { go(n + 1); }, 150); };   // (the maths arrives with samsam-cloud.js)
    if (M().rainbow) M().rainbow().then(function (f) { rb = f; go(0); }, function () {});
    if (M().mvrv) M().mvrv().then(function (f) { mv = f; go(0); }, function () {});
  }
  window.SamsamBtcVal = {
    mount: function (node) {
      if (!node || el) return; el = node; el.setAttribute('data-no-tr', '');
      var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      load();
    },
    refresh: load,
  };
})();
