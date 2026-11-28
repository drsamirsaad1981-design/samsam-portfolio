// samsam-stables.js — the Stablecoin Supply card on the Market Hub (market.html → #stableCard), in Market Pulse under
// ETF Flows: ETF Flows is money coming from outside through the US funds; this is the cash already inside crypto.
//
// How many dollar-pegged coins exist, from DefiLlama's free API through the scheduled job (tools/update-macro.mjs →
// the snapshot's `stables` part), read by samsam-core.js → stablesNow. Counted in COINS, not at market price: a coin that
// loses its peg falls in price, not in supply, and must not read as money leaving. A coin that STAYS under $0.90 is left
// out by the job (two days running; its supply comes off every day shown) — the card only says so.
//   · closed: the total, the last 30 daily changes as small bars (green above the line when coins were issued, red under
//     it when they were redeemed — a signed amount, like ETF Flows), and the net change of 7 and 30 days;
//   · open: the total and its day, the net change of a day / 7 / 30 days / a year, the same 30 days larger, and the
//     biggest coins from the data itself (never a list typed here): supply, share, the month's change — a coin that
//     was not listed a month ago reads "new", not a percent.
// A reading of liquidity, not a forecast of price: the ⓘ says what was measured against Bitcoin and how weak it is.
// A part over 4 days old is not shown. The words are written here in the page's language (data-no-tr).
(function () {
  'use strict';
  if (window.SamsamStables) return;
  var OPEN_KEY = 'samsam_mkt_stable_open', el = null, part = null;
  var ar = function () { return !!(window.CPLang && window.CPLang.ar); }, T = function (en, a) { return ar() ? a : en; };
  var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var C = function () { return window.Samsam && window.Samsam.core && window.Samsam.core.stablesNow ? window.Samsam.core : null; };
  var M = function () { return window.SamsamMarket; };
  var L = function (s) { return '<bdi dir="ltr">' + E(s) + '</bdi>'; };   // a number or a ticker keeps its shape inside an Arabic line
  function big(v) { var a = Math.abs(v); return a >= 1e9 ? '$' + (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? '$' + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M' : '$' + Math.round(a).toLocaleString('en-US'); }
  function money(v) { return v == null || !isFinite(v) ? '—' : !Math.round(v) ? '$0' : (v > 0 ? '+' : '−') + big(v); }   // a change: signed
  function pct(v, dp) { if (v == null || !isFinite(v)) return '—'; var r = +v.toFixed(dp == null ? 2 : dp); return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toFixed(dp == null ? 2 : dp) + '%'; }
  function cls(v, dp) { if (v == null || !isFinite(v)) return ''; var r = dp == null ? Math.round(v) : +v.toFixed(dp); return r > 0 ? 'up' : r < 0 ? 'down' : ''; }   // zero: no colour
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], MON_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  function day(iso, year) { var p = String(iso).split('-'), d = +p[2], m = +p[1] - 1; return ar() ? d + ' ' + MON_AR[m] + (year ? ' ' + p[0] : '') : d + ' ' + MON[m] + (year ? ' ' + p[0] : ''); }   // plain text (a title)
  // …and as it is shown: an Arabic date reads from the right (the day, the month, the year), so only its NUMBERS are
  // left-to-right pieces — the whole date inside one would put the day at the left end
  function dayH(iso, year) { var p = String(iso).split('-'); return ar() ? L(+p[2]) + ' ' + MON_AR[+p[1] - 1] + (year ? ' ' + L(p[0]) : '') : L(day(iso, year)); }

  var CSS = '.mk-stb{margin-bottom:14px;gap:10px}.mk-stb[hidden]{display:none}.mk-stb .mk-etf-sum{color:var(--fg)}' +
    '.sb-fold{display:grid;gap:6px}.sb-fold[hidden]{display:none}' +
    '.sb-bars{position:relative;display:flex;align-items:stretch;gap:2px;direction:ltr}.sb-bars.mini{height:28px}.sb-bars.full{height:72px;gap:3px}' +
    '.sb-bars .b{flex:1 1 0;position:relative}.sb-bars .b i{position:absolute;left:0;right:0;border-radius:2px}.sb-bars .z{position:absolute;left:0;right:0;height:1px;background:var(--border)}' +
    '.sb-ml{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-size:.74rem;color:var(--fg2);font-variant-numeric:tabular-nums}.sb-ml b{font-weight:800;margin-inline-start:5px}' +
    '.mk-stb b.up{color:var(--green)}.mk-stb b.down{color:var(--red)}' +
    '.sb-top{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}.sb-l{font-size:.7rem;font-weight:700;color:var(--fg2)}' +
    '.sb-v{font-size:1.6rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.15}' +
    '.sb-stats{display:grid;grid-template-columns:repeat(4,auto);gap:4px 14px;font-size:.7rem;color:var(--fg2);font-variant-numeric:tabular-nums}.sb-stats b{display:block;font-size:.84rem;font-weight:800;color:var(--fg)}.sb-stats small{display:block;font-size:.66rem}' +
    '@media(max-width:430px){.sb-stats{grid-template-columns:repeat(2,auto);flex-basis:100%;justify-content:start;gap:8px 22px}}' +
    '.sb-cap{font-size:.68rem;color:var(--fg2);display:flex;justify-content:space-between;gap:10px}' +
    '.sb-tbl{max-width:560px;display:grid;grid-template-columns:1fr auto auto auto;gap:5px 14px;font-size:.78rem;font-variant-numeric:tabular-nums;align-items:baseline}.sb-tbl .h{font-size:.68rem;font-weight:700;color:var(--fg2)}.sb-tbl .r{text-align:end}.sb-tbl b{font-weight:700}' +
    '.sb-tbl .nw{color:var(--fg2);font-weight:600}.sb-note{font-size:.76rem;color:var(--fg2);line-height:1.6}.sb-note b{color:var(--fg);font-weight:700}';

  function shell() {
    return '<div class="mk-etf-h"><button type="button" class="mk-etf-tog" id="sbTog" aria-expanded="false" aria-controls="sbBody">' +
      '<span class="mk-k"><span data-ic="coins"></span>' + T('Stablecoin Supply', 'معروض العملات المستقرة') + '<span class="cp-hint" data-hint="stables" role="button" tabindex="0"></span></span>' +
      '<span class="mk-etf-sum" id="sbSum"></span>' +
      '<svg class="mk-etf-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></div>' +
      '<div class="sb-fold" id="sbFold" hidden></div><div class="mk-etf-body" id="sbBody" hidden></div>';
  }
  function read() { var c = C(); return c && part ? c.stablesNow(part, Date.now()) : null; }
  // the daily changes as bars on one scale, the zero line where issues and redemptions meet (as ETF Flows draws its days)
  function bars(s, kind) {
    var B = s.bars, pos = 0, neg = 0, i; for (i = 0; i < B.length; i++) { if (B[i][1] > pos) pos = B[i][1]; if (-B[i][1] > neg) neg = -B[i][1]; }
    var zero = pos + neg > 0 ? pos / (pos + neg) * 100 : 50, up = 0, dn = 0;
    var h = B.map(function (r) {
      var v = r[1], hh = Math.abs(v) / (pos + neg || 1) * 100; if (v > 0) up++; else if (v < 0) dn++;
      return '<span class="b" data-d="' + r[0] + '" data-s="' + (v > 0 ? 'in' : v < 0 ? 'out' : 'flat') + '" title="' + E(day(r[0]) + ': ' + money(v)) + '"><i style="' + (v >= 0 ? 'bottom:' + (100 - zero) + '%' : 'top:' + zero + '%') + ';height:' + Math.max(kind === 'mini' ? 5 : 2, hh).toFixed(2) + '%;background:' + (v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--fg2)') + '"></i></span>';
    }).join('');
    return '<div class="sb-bars ' + kind + '" id="' + (kind === 'mini' ? 'sbMini' : 'sbBars') + '" role="img" aria-label="' + E(T('Dollar-pegged supply, daily change over the last ' + B.length + ' days: ' + up + ' up, ' + dn + ' down', 'معروض العملات المربوطة بالدولار، التغيّر اليومي في آخر ' + B.length + ' يوماً: ' + up + ' صعود، ' + dn + ' هبوط')) + '"><span class="z" style="top:' + zero + '%"></span>' + h + '</div>';
  }
  function net(label, v, id) { return '<span id="' + id + '">' + label + '<b class="' + cls(v) + '">' + L(money(v)) + '</b></span>'; }
  function fold(s) {
    return bars(s, 'mini') + '<div class="sb-ml">' + net(T('Last 7 days', 'آخر ' + L('7') + ' أيام'), s.d7, 'sbF7') + net(T('Last 30 days', 'آخر ' + L('30') + ' يوماً'), s.d30, 'sbF30') + '</div>';
  }
  function body(s) {
    var st = function (k, v, p) { return '<div>' + k + '<b class="' + cls(v) + '">' + L(money(v)) + '</b>' + (p == null ? '' : '<small>' + L(pct(p)) + '</small>') + '</div>'; };
    return '<div class="sb-top"><div><div class="sb-l" id="sbDay">' + T('In circulation · ', 'في التداول · ') + dayH(s.day, true) + '</div><div class="sb-v" id="sbV">' + L(big(s.total)) + '</div></div>' +
      '<div class="sb-stats" id="sbStats">' + st(T('1 day', 'يوم واحد'), s.d1) + st(T('7 days', L('7') + ' أيام'), s.d7, s.p7) + st(T('30 days', L('30') + ' يوماً'), s.d30, s.p30) + st(T('1 year', 'سنة'), s.d365, s.p365) + '</div></div>' +
      (s.bars.length ? '<div class="sb-cap"><span>' + T('Daily change, last ' + s.bars.length + ' days', 'التغيّر اليومي، آخر ' + L(s.bars.length) + ' يوماً') + '</span><span id="sbSpan">' + T(dayH(s.bars[0][0]) + ' → ' + dayH(s.bars[s.bars.length - 1][0]), 'من ' + dayH(s.bars[0][0]) + ' إلى ' + dayH(s.bars[s.bars.length - 1][0])) + '</span></div>' + bars(s, 'full') : '') +
      (s.top.length ? '<div class="sb-tbl" id="sbTbl"><span class="h">' + T('Coin', 'العملة') + '</span><span class="h r">' + T('Supply', 'المعروض') + '</span><span class="h r">' + T('Share', 'الحصة') + '</span><span class="h r">' + T('30 days', L('30') + ' يوماً') + '</span>' +
        s.top.slice(0, 6).map(function (x) { return '<b title="' + E(x.name) + '">' + L(x.sym) + '</b><span class="r">' + L(big(x.circ)) + '</span><span class="r">' + L(x.share.toFixed(1) + '%') + '</span>' +
          (x.isNew ? '<span class="r nw">' + T('new', 'جديدة') + '</span>' : '<b class="r ' + cls(x.m30, 2) + '">' + L(pct(x.m30)) + '</b>'); }).join('') + '</div>' : '') +
      '<p class="sb-note" id="sbNote">' + T('<b>Dollar-pegged stablecoins</b>, counted in coins — not at market price, so a slip in a coin\'s price does not read as money leaving. A coin that stays under ' + L('$0.90') + ' is no longer counted. A move from one coin to another changes the list, not the total. A reading of liquidity, not a forecast of price. Source: DefiLlama, once a day. Not financial advice.',
        '<b>العملات المستقرة المربوطة بالدولار</b>، محسوبة بعدد العملات لا بسعر السوق — فتراجع سعر عملة لا يُقرأ كأموال خرجت. والعملة التي تبقى تحت ' + L('$0.90') + ' لا تُحسب. والانتقال من عملة إلى أخرى يغيّر القائمة لا الإجمالي. قراءة للسيولة، وليست توقعاً للسعر. المصدر: ' + L('DefiLlama') + '، مرة في اليوم. ليست نصيحة مالية.') + '</p>';
  }
  function paint() {
    if (!el) return;
    var s = read();
    if (!s) { el.hidden = true; return; }   // no part, or over 4 days old: nothing is shown
    el.hidden = false;
    document.getElementById('sbSum').innerHTML = L(big(s.total));
    // one picture of the days at a time: the small bars while closed, the larger ones inside when open
    var b = document.getElementById('sbBody'), fo = document.getElementById('sbFold');
    if (b.hidden) { b.innerHTML = ''; fo.innerHTML = s.bars.length ? fold(s) : ''; fo.hidden = !fo.innerHTML; } else { fo.innerHTML = ''; fo.hidden = true; b.innerHTML = body(s); }
  }
  function setOpen(on, keep) {
    var b = document.getElementById('sbBody'); b.hidden = !on; el.classList.toggle('open', on);
    document.getElementById('sbTog').setAttribute('aria-expanded', String(on));
    if (keep) try { localStorage.setItem(OPEN_KEY, on ? '1' : '0'); } catch (_) {}
    paint();
  }
  function load() {
    if (!M() || !M().stables) return;
    M().stables().then(function (f) { part = f; var go = function (n) { if (C() || n > 60) paint(); else setTimeout(function () { go(n + 1); }, 150); }; go(0); });   // (the maths arrives with samsam-cloud.js)
  }
  window.SamsamStables = {
    mount: function (node) {
      if (!node || el) return; el = node; el.setAttribute('data-no-tr', '');
      var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      el.innerHTML = shell();
      var on = false; try { on = localStorage.getItem(OPEN_KEY) === '1'; } catch (_) {}
      document.getElementById('sbTog').addEventListener('click', function (ev) { if (ev.target.closest('.cp-hint')) return; setOpen(document.getElementById('sbBody').hidden, true); });
      setOpen(on); load();
    },
    refresh: load,
  };
})();
