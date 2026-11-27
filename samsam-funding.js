// samsam-funding.js — ⚖️ the BTC Funding card on the Market Hub (market.html → #fundCard).
//
// What longs pay shorts on Bitcoin's perpetual futures, percent per 8 hours (negative: shorts pay). The number is the
// snapshot's (tools/update-macro.mjs): several venues as one rate, weighted by open interest. The reader and the wording
// are samsam-core.js (fundingNow, fundingRead / FUNDING_WORDS) — the same answer as the bot's line in /market, the AI's
// facts and the leverage radar.
//   · closed: the rate and its state in a few words;
//   · open: the 7-day mean, what a year at this rate would be, every venue with its own rate and open interest — and, in
//     plain words, the big venues that are NOT in the mix (Binance and Bybit refuse the address the data is read from;
//     when the relay hands one over, the snapshot's `missing` shrinks and this note changes by itself).
// A mood reading, not a signal: over the last year BTC funding was never above the resting +0.01%, and it said nothing at
// the October 2025 top (the lab of 27 Nov 2026). No colour or word here tells anyone to buy or sell. A snapshot part over
// 6 hours old is not shown.
(function () {
  'use strict';
  if (window.SamsamFunding) return;
  var OPEN_KEY = 'samsam_mkt_fund_open', el = null, part = null;
  var ar = function () { return !!(window.CPLang && window.CPLang.ar); }, T = function (en, a) { return ar() ? a : en; };
  var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var C = function () { return window.Samsam && window.Samsam.core && window.Samsam.core.fundingNow ? window.Samsam.core : null; };
  var M = function () { return window.SamsamMarket; };
  var L = function (s) { return '<bdi dir="ltr">' + s + '</bdi>'; };   // a number keeps its shape inside an Arabic line
  function rate(v, dp) { return v == null || !isFinite(v) ? '—' : (v < 0 ? '−' : '+') + Math.abs(v).toFixed(dp == null ? 4 : dp) + '%'; }
  function big(v) { return !(v > 0) ? '—' : v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : '$' + Math.round(v / 1e6) + 'M'; }
  function list(a) { return ar() ? a.join(' و ') : a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a.join(''); }

  var CSS = '.mk-fund{margin-bottom:14px;gap:10px}.mk-fund[hidden]{display:none}.mk-fund .mk-etf-sum{color:var(--fg);white-space:normal;text-align:end;min-width:0}.mk-fund .mk-k{white-space:nowrap;flex:none}' +
    '@media(max-width:430px){.mk-fund .mk-etf-tog{flex-wrap:wrap;row-gap:3px}.mk-fund .mk-etf-sum{order:3;flex-basis:100%;text-align:start;margin-inline-start:0}.mk-fund .mk-k{flex:1 1 auto}}' +
    '.fd-top{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}.fd-v{font-size:1.6rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.15}.fd-v small{font-size:.78rem;font-weight:600;color:var(--fg2);margin-inline-start:6px}' +
    '.fd-w{font-size:.82rem;font-weight:700;color:var(--fg)}' +
    '.fd-stats{display:grid;grid-template-columns:repeat(3,auto);gap:4px 16px;font-size:.7rem;color:var(--fg2);font-variant-numeric:tabular-nums}.fd-stats b{display:block;font-size:.86rem;font-weight:800;color:var(--fg)}' +
    '.fd-tbl{display:grid;grid-template-columns:1fr auto auto;gap:5px 16px;font-size:.78rem;font-variant-numeric:tabular-nums;align-items:baseline}.fd-tbl .h{font-size:.68rem;font-weight:700;color:var(--fg2)}.fd-tbl .r{text-align:end}.fd-tbl b{font-weight:700}' +
    '.fd-note{font-size:.76rem;color:var(--fg2);line-height:1.6}.fd-note b{color:var(--fg);font-weight:700}';

  function shell() {
    return '<div class="mk-etf-h"><button type="button" class="mk-etf-tog" id="fdTog" aria-expanded="false" aria-controls="fdBody">' +
      '<span class="mk-k"><span data-ic="activity"></span>' + T('BTC Funding', 'تمويل البيتكوين') + '<span class="cp-hint" data-hint="funding" role="button" tabindex="0"></span></span>' +
      '<span class="mk-etf-sum" id="fdSum"></span>' +
      '<svg class="mk-etf-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></div>' +
      '<div class="mk-etf-body" id="fdBody" hidden></div>';
  }
  function read() { var c = C(); return c && part ? c.fundingNow(part, Date.now()) : null; }
  // the venues that are not in the mix, said in words (nothing when none is missing)
  function without(f) { return f.missing.length ? T('without ' + list(f.missing), 'بدون ' + list(f.missing)) : ''; }
  function body(f) {
    var c = C(), wo = without(f);
    return '<div class="fd-top"><div><div class="fd-v" id="fdV">' + L(rate(f.rate)) + '<small>' + T('per 8 hours', 'لكل 8 ساعات') + '</small></div><div class="fd-w" id="fdW">' + E(c.fundingWord(f.rate, ar())) + '</div></div>' +
      '<div class="fd-stats"><div>' + T('7-day mean', 'متوسط 7 أيام') + '<b id="fdM7">' + L(rate(f.m7)) + '</b></div><div>' + T('A year at this rate', 'سنة بهذا المعدل') + '<b id="fdYr">' + L(rate(f.yr, 1)) + '</b></div><div>' + T('Open interest', 'العقود المفتوحة') + '<b id="fdOi">' + L(big(f.oi)) + '</b></div></div></div>' +
      '<div class="fd-tbl" id="fdTbl"><span class="h">' + T('Venue', 'المنصة') + '</span><span class="h r">' + T('Rate / 8 h', 'المعدل / 8 ساعات') + '</span><span class="h r">' + T('Open interest', 'العقود المفتوحة') + '</span>' +
      f.venues.map(function (x) { return '<b>' + L(E(x.k)) + '</b><span class="r">' + L(rate(x.rate)) + '</span><span class="r">' + L(big(x.oi)) + '</span>'; }).join('') + '</div>' +
      '<p class="fd-note" id="fdNote">' + T('One rate from <b>' + f.n + ' venues</b>, weighted by open interest', 'معدل واحد من <b>' + f.n + ' منصات</b>، موزون بالعقود المفتوحة') +
      (wo ? ' — <b id="fdNo">' + E(wo) + '</b>' + T(' (not reachable from where this is read).', ' (غير متاحة من العنوان الذي تُقرأ منه البيانات).') : '.') + ' ' +
      T('Positive: longs pay shorts; negative: shorts pay. Over the last year Bitcoin’s funding was never above the resting ' + L('+0.01%') + ' — read it as the market’s mood, not as a signal. Not financial advice.',
        'الموجب: مراكز الشراء تدفع لمراكز البيع؛ والسالب: العكس. خلال السنة الأخيرة لم يتجاوز تمويل البيتكوين المعدل الأساسي ' + L('+0.01%') + ' — اقرأه كمزاج للسوق، لا كإشارة. ليست نصيحة مالية.') + '</p>';
  }
  function paint() {
    if (!el) return;
    var f = read();
    if (!f) { el.hidden = true; return; }   // no part, or over 6 hours old: nothing is shown
    el.hidden = false;
    var wo = without(f);
    document.getElementById('fdSum').innerHTML = L(rate(f.rate)) + ' · ' + E(C().fundingWord(f.rate, ar(), true)) + (wo ? ' · ' + E(wo) : '');
    var b = document.getElementById('fdBody'); if (!b.hidden) b.innerHTML = body(f);
  }
  function setOpen(on, keep) {
    var b = document.getElementById('fdBody'); b.hidden = !on; el.classList.toggle('open', on);
    document.getElementById('fdTog').setAttribute('aria-expanded', String(on));
    if (keep) try { localStorage.setItem(OPEN_KEY, on ? '1' : '0'); } catch (_) {}
    paint();
  }
  function load() {
    if (!M() || !M().funding) return;
    M().funding().then(function (f) { part = f; var go = function (n) { if (C() || n > 60) paint(); else setTimeout(function () { go(n + 1); }, 150); }; go(0); });   // (the maths arrives with samsam-cloud.js)
  }
  window.SamsamFunding = {
    mount: function (node) {
      if (!node || el) return; el = node; el.setAttribute('data-no-tr', '');   // its words are written in the page's language here
      var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      el.innerHTML = shell();
      var on = false; try { on = localStorage.getItem(OPEN_KEY) === '1'; } catch (_) {}
      document.getElementById('fdTog').addEventListener('click', function (ev) { if (ev.target.closest('.cp-hint')) return; setOpen(document.getElementById('fdBody').hidden, true); });
      setOpen(on); load();
    },
    refresh: load,
  };
})();
