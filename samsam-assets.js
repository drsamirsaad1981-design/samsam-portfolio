// samsam-assets.js — the Market Hub's three sections: 🪙 Crypto (the page as it was) · 📈 bStocks · 🥇 Metals.
//
// bStocks: Binance's tokenized US stocks (CoinGecko's "bStocks Ecosystem" category), all of them, from the snapshot GitHub
// saves every ~30 minutes (tools/update-market.mjs): a summary (how many, their total market cap, up / down today), the US
// stock market's hours (the tokens trade 24/7, the real shares only while New York is open), the best and worst today,
// and the full list — search, sort, a tap opens the coin on CoinGecko.
// Metals: gold, silver, platinum and copper (the snapshot also has Brent oil, not shown here) — Yahoo Finance's front-month futures (delayed ~10–15 min), with
// the change since the last close, 7 days, a month's line; gold / silver / platinum also per gram in Saudi riyals.
// The choice of section is remembered on this device (and #stocks / #metals open one directly).
(function () {
  'use strict';
  var doc = document, $ = function (id) { return doc.getElementById(id); };
  var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ar = function () { return !!(window.CPLang && CPLang.ar); };
  var T = function (en, a) { return ar() ? a : en; };
  var iso = function (s) { return '⁦' + s + '⁩'; };
  // 🇺🇸 drawn, not an emoji: Windows shows flag emoji as the letters "US"
  var US_FLAG = '<svg class="as-flag" viewBox="0 0 19 10" width="19" height="10" aria-hidden="true"><rect width="19" height="10" fill="#b22234"/><path d="M0 1.15h19M0 2.7h19M0 4.23h19M0 5.77h19M0 7.3h19M0 8.85h19" stroke="#fff" stroke-width=".77"/><rect width="7.6" height="5.38" fill="#3c3b6e"/><g fill="#fff"><circle cx="1.3" cy="1.1" r=".35"/><circle cx="3.8" cy="1.1" r=".35"/><circle cx="6.3" cy="1.1" r=".35"/><circle cx="2.55" cy="2.7" r=".35"/><circle cx="5.05" cy="2.7" r=".35"/><circle cx="1.3" cy="4.3" r=".35"/><circle cx="3.8" cy="4.3" r=".35"/><circle cx="6.3" cy="4.3" r=".35"/></g></svg>';
  var KEY = 'samsam_mk_view', VIEWS = ['crypto', 'stocks', 'metals'];
  var M = function () { return window.SamsamMarket; };
  var SAR = 3.75, OZ = 31.1034768;   // the riyal is pegged to the dollar; a troy ounce in grams

  function usd(v, d) {
    if (v == null || !isFinite(v)) return '—';
    var a = Math.abs(v), dd = d != null ? d : a >= 1000 ? 0 : a >= 1 ? 2 : 4;
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: dd, maximumFractionDigits: dd });
  }
  function pct(v) { if (v == null || !isFinite(v)) return '<span class="as-pc">—</span>'; return '<span class="as-pc ' + (v >= 0 ? 'up' : 'dn') + '">' + iso((v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + '%') + '</span>'; }
  function ago(t) { var m = Math.round((Date.now() - t) / 60000); return !t ? '' : m < 1 ? T('just now', 'الآن') : m < 60 ? T(m + ' min ago', 'منذ ' + iso(m) + ' دقيقة') : T(Math.round(m / 60) + ' h ago', 'منذ ' + iso(Math.round(m / 60)) + ' ساعة'); }
  function spark(p, w, h) { return M() && M().spark ? M().spark(p, w, h) : ''; }

  // ── the US stock market's hours (New York, Mon–Fri 9:30–16:00; pre-market from 4:00, after-hours to 20:00) — holidays not counted
  function nyParts(d) {
    var f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(d), o = {};
    f.forEach(function (x) { o[x.type] = x.value; });
    return { wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday), m: (+o.hour % 24) * 60 + +o.minute };
  }
  function usMarket(now) {
    now = now || new Date();
    var p = nyParts(now), wk = p.wd >= 1 && p.wd <= 5, OPEN = 570, CLOSE = 960;
    var state = !wk ? 'closed' : p.m >= OPEN && p.m < CLOSE ? 'open' : p.m >= 240 && p.m < OPEN ? 'pre' : p.m >= CLOSE && p.m < 1200 ? 'after' : 'closed';
    // the next change, found minute by minute in 15-minute steps (no time-zone arithmetic to get wrong)
    var target = state === 'open' ? CLOSE : OPEN, t = new Date(now.getTime());
    for (var i = 0; i < 4 * 24 * 5; i++) { t = new Date(t.getTime() + 15 * 60e3); var q = nyParts(t); if (q.wd >= 1 && q.wd <= 5 && q.m >= target && q.m < target + 15) break; }
    var at = new Date(Math.floor(t.getTime() / 60e3) * 60e3 - ((nyParts(t).m - target) * 60e3));
    return { state: state, next: at };
  }
  function riyadh(d) { return d.toLocaleString(ar() ? 'ar-SA-u-nu-latn' : 'en-GB', { timeZone: 'Asia/Riyadh', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }); }

  var st = { view: 'crypto', stocks: null, stT: 0, metals: null, meT: 0, q: '', sort: 'mcap', dir: -1, err: '' };

  // ── 📈 bStocks ──
  function stocksHtml() {
    var list = st.stocks;
    if (!list) return '<p class="as-note">' + (st.err || T('Loading…', 'جارٍ التحميل…')) + '</p>';
    var mk = usMarket(), up = list.filter(function (x) { return x.ch24 > 0; }).length, dn = list.filter(function (x) { return x.ch24 < 0; }).length;
    var cap = list.reduce(function (s, x) { return s + (x.mcap || 0); }, 0), withCh = list.filter(function (x) { return x.ch24 != null; });
    var avg = withCh.length ? withCh.reduce(function (s, x) { return s + x.ch24; }, 0) / withCh.length : null;
    var stLbl = { open: T('Open', 'مفتوح'), pre: T('Pre-market', 'ما قبل الافتتاح'), after: T('After hours', 'بعد الإغلاق'), closed: T('Closed', 'مغلق') }[mk.state];
    var nextLbl = mk.state === 'open' ? T('closes', 'يُغلق') : T('opens', 'يفتح');
    var by = function (f, n) { return withCh.slice().sort(f).slice(0, n); };
    var best = by(function (a, b) { return b.ch24 - a.ch24; }, 3), worst = by(function (a, b) { return a.ch24 - b.ch24; }, 3);
    var chip = function (x) { return '<a class="as-mv" href="' + E(x.url && /^https:\/\//.test(x.url) ? x.url : 'https://www.coingecko.com/en/coins/' + encodeURIComponent(x.id)) + '" target="_blank" rel="noopener">' + (x.img ? '<img src="' + E(x.img) + '" alt="" loading="lazy">' : '') + '<b>' + E(x.sym) + '</b>' + pct(x.ch24) + '</a>'; };
    var h = '<div class="as-grid">' +
      '<div class="as-card"><div class="as-k">📈 bStocks<span class="cp-hint" data-hint="bstocks" role="button" tabindex="0"></span></div><div class="as-v">' + iso(list.length) + ' <small>' + T('stocks', 'سهماً') + '</small></div>' +
        '<div class="as-li">' + T('Market cap', 'القيمة السوقية') + ' <b>' + iso(M() ? M().fmtBig(cap) : usd(cap)) + '</b></div>' +
        '<div class="as-li">' + T('Today', 'اليوم') + ' <b><span class="up">▲ ' + iso(up) + '</span> · <span class="dn">▼ ' + iso(dn) + '</span></b></div>' +
        '<div class="as-li">' + T('Average 24h', 'متوسط 24 ساعة') + ' <b>' + pct(avg) + '</b></div></div>' +
      '<div class="as-card as-us as-' + mk.state + '"><div class="as-k">' + US_FLAG + ' ' + T('US stock market', 'السوق الأمريكي') + '</div><div class="as-v"><i class="as-dot"></i>' + stLbl + '</div>' +
        '<div class="as-li as-left">' + nextLbl + ' <b>' + E(riyadh(mk.next)) + '</b> <small>' + T('Riyadh', 'بتوقيت الرياض') + '</small></div>' +
        '<div class="as-li as-small">' + T('The tokens trade 24/7; the real shares move only while New York is open (9:30–16:00 New York, holidays not shown).', 'التوكنات تُتداول على مدار الساعة؛ أما الأسهم الحقيقية فتتحرك فقط أثناء فتح سوق نيويورك (9:30–16:00 بتوقيت نيويورك، دون احتساب العطل).') + '</div></div>' +
      '</div>' +
      '<div class="as-movers"><div><div class="as-k">' + T('Best today', 'الأفضل اليوم') + '</div>' + best.map(chip).join('') + '</div><div><div class="as-k">' + T('Worst today', 'الأسوأ اليوم') + '</div>' + worst.map(chip).join('') + '</div></div>';
    // the list
    var q = st.q.trim().toLowerCase(), rows = list.filter(function (x) { return !q || x.sym.toLowerCase().indexOf(q) >= 0 || String(x.name || '').toLowerCase().indexOf(q) >= 0; });
    var k = st.sort; rows.sort(function (a, b) { var va = a[k], vb = b[k]; if (va == null) return 1; if (vb == null) return -1; return k === 'name' ? st.dir * String(va).localeCompare(String(vb)) : st.dir * (va - vb); });
    var head = function (key, lbl, cls) { return '<button type="button" class="' + (cls || '') + (st.sort === key ? ' on' : '') + '" data-sort="' + key + '">' + lbl + (st.sort === key ? (st.dir < 0 ? ' ▾' : ' ▴') : '') + '</button>'; };
    h += '<div class="as-list"><div class="mk-tools as-tools"><div class="ss-search"><span class="ss-search-ic" data-ic="search" data-ic-solo data-ic-size="16"></span><input type="search" id="asQ" placeholder="' + E(T('Search stock…', 'ابحث عن سهم…')) + '" value="' + E(st.q) + '" autocomplete="off" aria-label="Search"></div></div>' +
      '<div class="as-head">' + head('name', T('Stock', 'السهم'), 'l') + head('price', T('Price', 'السعر')) + head('ch24', '24h') + head('ch7', '7d', 'w') + head('mcap', T('Market cap', 'القيمة السوقية'), 'w') + '</div>' +
      (rows.length ? rows.map(function (x) {
        return '<a class="as-row" href="' + E(x.url && /^https:\/\//.test(x.url) ? x.url : 'https://www.coingecko.com/en/coins/' + encodeURIComponent(x.id)) + '" target="_blank" rel="noopener"><span class="as-n">' + (x.img ? '<img src="' + E(x.img) + '" alt="" loading="lazy">' : '<i class="as-ph"></i>') +
          '<span><b>' + E(x.sym) + '</b><small>' + E(String(x.name || '').replace(/\s*bStock$/i, '')) + '</small></span></span>' +
          '<span class="as-p">' + iso(usd(x.price)) + '</span><span>' + pct(x.ch24) + '</span><span class="w">' + pct(x.ch7) + '</span><span class="w as-mc">' + iso(M() ? M().fmtBig(x.mcap) : '') + '</span></a>';
      }).join('') : '<p class="as-note">' + T('No stock matches.', 'لا يوجد سهم مطابق.') + '</p>') + '</div>' +
      '<p class="as-src">' + T('Prices: CoinGecko (bStocks Ecosystem), saved ' + ago(st.stT) + '. Tokenized stocks on Binance — not the shares themselves. Not financial advice.', 'الأسعار: CoinGecko (bStocks Ecosystem)، حُفظت ' + ago(st.stT) + '. أسهم مرمّزة على Binance — وليست الأسهم نفسها. ليست نصيحة مالية.') + '</p>';
    return h;
  }

  // ── 🥇 Metals ──
  var MET = {
    gold: ['🥇', 'Gold', 'الذهب', true], silver: ['🥈', 'Silver', 'الفضة', true], platinum: ['⚪', 'Platinum', 'البلاتين', true],
    copper: ['🟠', 'Copper', 'النحاس', false], brent: ['🛢️', 'Brent oil', 'نفط برنت', false],
  };
  var UNIT = { oz: ['/ oz', '/ أونصة'], lb: ['/ lb', '/ رطل'], bbl: ['/ barrel', '/ برميل'] };
  // 🥇 your gold / silver (added in the portfolio in grams; kept in troy ounces there) — or a button to add some
  var MINE = { XAU: ['🥇', 'Gold 24k', 'ذهب عيار 24', 'gold'], XAG: ['🥈', 'Silver', 'فضة', 'silver'] };
  // 🕌 zakat: due (2.5%), the days left in the hijri year, or below the nisab
  function zkLine(c, d, pr) {
    var z = SamsamCoins.zakat(c.sym, d); if (!z) return '';
    var g = function (n) { return iso(n.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ' + T('g', 'جم')); };
    return '<div class="as-zk">🕌 ' + (z.due ? T('Zakat due', 'الزكاة مستحقة') + ': <b>' + g(z.zakatG) + '</b> ≈ <b>' + iso(usd(z.zakatOz * pr, 2)) + '</b> <small>(2.5%)</small>'
      : z.meets ? T('Above the nisab — zakat on', 'فوق النصاب — الزكاة في') + ' ' + SamsamCoins.zakatDayLabel(!!(window.CPLang && CPLang.ar)) + T(', in', '، بعد') + ' <b>' + iso(z.daysLeft) + '</b> ' + T('days', 'يوم')
      : T('Below the nisab', 'أقل من النصاب') + ' (' + g(z.nisab) + ') — ' + T('no zakat', 'لا زكاة')) + '</div>';
  }
  function mineHtml(list) {
    var S = window.Samsam, d = null; try { d = S && S.getState ? S.getState() : null; } catch (_) {}
    if (!d || !d.portfolio) return '';
    var pf = (d.portfolio || []).filter(function (c) { return MINE[c.sym] && c.qty > 1e-12; }), rz = (d.realized && d.realized.bySym) || {};
    var spot = function (k) { var x = (list || []).filter(function (m) { return m.k === k; })[0]; return x ? x.price : 0; };
    var g2 = function (oz) { return (oz * OZ).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ' + T('g', 'جم'); };
    var add = '<button type="button" class="as-add" data-add="XAU">🥇 ' + T('Add gold', 'أضف ذهب') + '</button><button type="button" class="as-add" data-add="XAG">🥈 ' + T('Add silver', 'أضف فضة') + '</button>';
    if (!pf.length) return '<div class="as-card as-mine as-mine-empty"><div class="as-k">' + T('Your metals', 'معادنك') + '</div><p class="as-li">' + T('Track the gold and silver you own — in grams, at the live price.', 'تابع الذهب والفضة اللي تملكها — بالجرام وبالسعر الحي.') + '</p><div class="as-adds">' + add + '</div></div>';
    var tv = 0, tp = 0, docs = {}; (d.coins || []).forEach(function (x) { docs[x.sym] = x; });
    var rows = pf.map(function (c) {
      var vt = SamsamCoins.vaultOf(docs[c.sym], ar()), m = MINE[c.sym], pr = c.currentPrice > 0 ? c.currentPrice : spot(m[3]), val = c.qty * pr, cost = c.qty * c.basePrice, pnl = val - cost + ((rz[c.sym] || {}).realized || 0);
      var ch = c.basePrice > 0 && pr > 0 ? (pr / c.basePrice - 1) * 100 : null; tv += val; tp += pnl;
      return '<div class="as-mrow"><div class="as-mn">' + m[0] + ' <b>' + T(m[1], m[2]) + '</b><small>' + iso(g2(c.qty)) + '</small></div>' +
        '<div class="as-mv2"><b>' + iso(usd(val, 2)) + '</b><span class="as-pc ' + (pnl >= 0 ? 'up' : 'dn') + '">' + iso((pnl >= 0 ? '+' : '−') + usd(Math.abs(pnl), 2)) + '</span></div>' +
        '<div class="as-li as-left">' + T('Gram now', 'الجرام الآن') + ' <b>' + iso(usd(pr / OZ, 2)) + '</b> · ' + T('your avg', 'متوسط شرائك') + ' <b>' + iso(usd(c.basePrice / OZ, 2)) + '</b> ' + pct(ch) + '</div>' +
        zkLine(c, d, pr) +
        '<div class="as-macts"><button type="button" data-vault="' + c.sym + '">' + (vt ? vt.e + ' ' + E(vt.label) : '🏦 ' + T('Where is it kept?', 'أين تحفظه؟')) + '</button><button type="button" data-hist="' + c.sym + '">📜 ' + T('History · edit', 'السجل · تعديل') + '</button></div></div>';
    }).join('');
    return '<div class="as-card as-mine"><div class="as-k">' + T('Your metals', 'معادنك') + '<a class="as-mopen" href="./index.html">' + T('Open in portfolio ›', 'افتح في المحفظة ›') + '</a></div><div class="as-mrows">' + rows + '</div>' +
      (pf.length > 1 ? '<div class="as-mtot">' + T('Total', 'الإجمالي') + ' <b>' + iso(usd(tv, 2)) + '</b> <span class="as-pc ' + (tp >= 0 ? 'up' : 'dn') + '">' + iso((tp >= 0 ? '+' : '−') + usd(Math.abs(tp), 2)) + '</span></div>' : '') +
      '<div class="as-adds">' + add + '</div><p class="as-zn">🕌 ' + T('Zakat: once a year on your zakat day (1 Ramadan unless you chose another — the ✎ on the portfolio page) — 2.5% of what you hold that day when it is at least the nisab (85 g gold · 595 g silver). An estimate — check with a scholar.', 'الزكاة: مرة كل عام في يوم زكاتك (1 رمضان ما لم تختر غيره — من علامة ✎ في صفحة المحفظة) — 2.5% مما تملكه في ذلك اليوم إذا بلغ النصاب (85 جم ذهب · 595 جم فضة). تقدير تقريبي — راجع أهل العلم.') + '</p></div>';
  }
  function metalsHtml() {
    var list = st.metals;
    if (!list) return mineHtml(null) + '<p class="as-note">' + (st.err || T('Loading…', 'جارٍ التحميل…')) + '</p>';
    list = list.filter(function (x) { return x.k !== 'brent'; });   // metals only (no oil)
    var g = list.filter(function (x) { return x.k === 'gold'; })[0], s = list.filter(function (x) { return x.k === 'silver'; })[0];
    var h = mineHtml(list) + '<div class="as-metals">' + list.map(function (x) {
      var d = MET[x.k] || ['•', x.k, x.k, false], u = UNIT[x.unit] || ['', ''];
      return '<div class="as-card as-metal"><div class="as-k">' + d[0] + ' ' + T(d[1], d[2]) + (x.k === 'gold' ? '<span class="cp-hint" data-hint="metals" role="button" tabindex="0"></span>' : '') + '</div>' +
        '<div class="as-v">' + iso(usd(x.price, x.price >= 100 ? 2 : x.price >= 10 ? 2 : 3)) + ' <small>' + T(u[0], u[1]) + '</small></div>' +
        '<div class="as-chs"><span>' + T('Today', 'اليوم') + ' ' + pct(x.ch24) + '</span><span>' + T('7 days', '7 أيام') + ' ' + pct(x.ch7) + '</span></div>' +
        spark(x.spark, 220, 40) +
        (d[3] && x.unit === 'oz' ? '<div class="as-li">' + T('1 gram', 'الجرام') + ' <b>' + iso((x.price / OZ * SAR).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' SAR') + '</b> · <b>' + iso(usd(x.price / OZ, 2)) + '</b></div>' : '') + '</div>';
    }).join('') + '</div>';
    if (g && s && s.price > 0) h += '<p class="as-note">⚖️ ' + T('Gold / silver ratio', 'نسبة الذهب إلى الفضة') + ': <b>' + iso((g.price / s.price).toFixed(1)) + '</b> — ' + T('how many ounces of silver buy one ounce of gold.', 'عدد أونصات الفضة التي تشتري أونصة ذهب واحدة.') + '</p>';
    h += '<p class="as-src">' + T('Futures prices from Yahoo Finance (front month, delayed ~10–15 min), saved ' + ago(st.meT) + '. Gram prices: the ounce price ÷ 31.1 g, × 3.75 SAR (pure 24k metal, no shop premium). Not financial advice.',
      'أسعار العقود الآجلة من Yahoo Finance (الشهر الأقرب، بتأخير ~10–15 دقيقة)، حُفظت ' + ago(st.meT) + '. سعر الجرام: سعر الأونصة ÷ 31.1 جرام × 3.75 ريال (معدن خالص عيار 24، دون هامش المحلات). ليست نصيحة مالية.') + '</p>';
    return h;
  }

  function draw() {
    VIEWS.forEach(function (v) { var b = doc.querySelector('#mkSeg [data-v="' + v + '"]'); if (b) b.setAttribute('aria-selected', String(st.view === v)); });
    var c = $('vCrypto'), s = $('vStocks'), m = $('vMetals'); if (!c || !s || !m) return;
    c.hidden = st.view !== 'crypto'; s.hidden = st.view !== 'stocks'; m.hidden = st.view !== 'metals';
    var keepQ = doc.activeElement && doc.activeElement.id === 'asQ', pos = keepQ ? doc.activeElement.selectionStart : 0;
    if (st.view === 'stocks') s.innerHTML = stocksHtml();
    if (st.view === 'metals') m.innerHTML = metalsHtml();
    if (keepQ && $('asQ')) { $('asQ').focus(); try { $('asQ').setSelectionRange(pos, pos); } catch (_) {} }
    if (s.hidden === false || m.hidden === false) s.setAttribute('dir', ar() ? 'rtl' : 'ltr'), m.setAttribute('dir', ar() ? 'rtl' : 'ltr');
  }
  function load() {
    if (!M()) return;
    if (st.view === 'stocks' && !st.stocks) M().stocks().then(function (r) { if (r && r.data) { st.stocks = r.data; st.stT = r.t; } else st.err = T('No bStocks data yet — try again later.', 'لا توجد بيانات bStocks بعد — حاول لاحقاً.'); draw(); }).catch(function () { st.err = T('Could not load — check the internet.', 'تعذّر التحميل — تحقق من الإنترنت.'); draw(); });
    if (st.view === 'metals' && !st.metals) M().metals().then(function (r) { if (r && r.data) { st.metals = r.data; st.meT = r.t; } else st.err = T('No metals data yet — try again later.', 'لا توجد بيانات للمعادن بعد — حاول لاحقاً.'); draw(); }).catch(function () { st.err = T('Could not load — check the internet.', 'تعذّر التحميل — تحقق من الإنترنت.'); draw(); });
  }
  function show(v, save) {
    if (VIEWS.indexOf(v) < 0) v = 'crypto';
    st.view = v; st.err = '';
    if (save) { try { localStorage.setItem(KEY, v); } catch (_) {} try { history.replaceState(null, '', v === 'crypto' ? location.pathname + location.search : '#' + v); } catch (_) {} }
    draw(); load();
  }
  function init() {
    var seg = $('mkSeg'); if (!seg) return;
    seg.innerHTML = '<button type="button" role="tab" data-v="crypto">🪙 ' + T('Crypto', 'كريبتو') + '</button><button type="button" role="tab" data-v="stocks">📈 bStocks</button><button type="button" role="tab" data-v="metals">🥇 ' + T('Metals', 'المعادن') + '</button>';
    seg.addEventListener('click', function (e) { var b = e.target.closest('[data-v]'); if (b) show(b.dataset.v, true); });
    var area = function (e) {
      var b = e.target.closest('[data-sort]'); if (!b) return;
      var k = b.dataset.sort; if (st.sort === k) st.dir = -st.dir; else { st.sort = k; st.dir = k === 'name' ? 1 : -1; } draw();
    };
    $('vStocks').addEventListener('click', area);
    $('vMetals').addEventListener('click', function (e) {   // ➕ gold / silver → the Add window, already on that metal
      var v = e.target.closest('[data-vault]'), hs = e.target.closest('[data-hist]');
      if (v && window.CPAdd && CPAdd.openVault) return CPAdd.openVault(v.dataset.vault);
      if (hs && window.SamsamUI) return SamsamUI.openCoin(hs.dataset.hist);   // its History: edit or delete a buy
      var b = e.target.closest('[data-add]'); if (!b || !window.openAddCoin || !window.acMetal) return;
      window.openAddCoin(); window.acMetal(b.dataset.add);
    });
    var hook = function (S) { if (S && S.onChange) S.onChange(function () { if (st.view === 'metals') draw(); }); if (st.view === 'metals') draw(); };   // a buy / sell redraws your metals
    if (window.Samsam) hook(window.Samsam); else window.addEventListener('samsam-ready', function () { hook(window.Samsam); }, { once: true });
    $('vStocks').addEventListener('input', function (e) { if (e.target.id === 'asQ') { st.q = e.target.value; draw(); } });
    var h = (location.hash || '').slice(1), saved = null; try { saved = localStorage.getItem(KEY); } catch (_) {}
    show(VIEWS.indexOf(h) >= 0 ? h : saved || 'crypto', false);
    setInterval(function () { if (st.view === 'stocks') draw(); }, 60e3);
    // swipe left / right (phones) between Crypto · bStocks · Metals, like the portfolio tabs
    if (window.SamsamUI && SamsamUI.swipeGroup) SamsamUI.swipeGroup({ tabs: VIEWS, cur: function () { return st.view; }, go: function (v) { show(v, true); window.scrollTo({ top: 0, behavior: 'instant' }); } });
    window.addEventListener('hashchange', function () { var x = (location.hash || '').slice(1); if (VIEWS.indexOf(x) >= 0 && x !== st.view) show(x, true); });   // the market's open / closed line keeps up
  }
  window.SamsamAssets = { show: show, usMarket: usMarket, _st: st };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})();
