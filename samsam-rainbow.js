// samsam-rainbow.js — 🌈 the Bitcoin Rainbow card on the Market Hub (market.html → #rbCard).
//
// One trend line through every daily close of Bitcoin since 18 Aug 2010 and nine equal bands around it (equal on the log
// scale). The maths is samsam-core.js (rainbowRead / rainbowEdges …) — the same answer as the bot's line, the alert and
// the Exit page. The numbers come from GitHub once a day (tools/update-rainbow.mjs):
//   · the snapshot's small part (SamsamMarket.rainbow) paints the closed card at once: the band that holds (two daily
//     closes), its name, the strip of nine with the price's place on it;
//   · m/rainbow.json (SamsamMarket.rainbowFull) is asked for when the card opens: the chart since 2010, the moves.
// It describes the past. No colour or word here tells anyone to buy or sell.
//
// Colours: the nine bands keep the chart's classic order (violet → blue → green → yellow → red) but are MEASURED, not
// picked by eye: every pair is at least 15 apart (OKLab × 100; the closest 15.6), each ≥ 3:1 on the dark card. Nine hues
// cannot all stay apart for colour-blind eyes (violet ~ blue is 7.5), so a band is never told by colour alone: its number
// is on the strip, in the tooltip and in the table.
(function () {
  'use strict';
  if (window.SamsamRainbow) return;
  var COL = ['#8f57ff', '#0464cd', '#1bc6de', '#00aa73', '#96d208', '#ffe678', '#ff9027', '#ff1522', '#b13a71'];
  var INK = ['#fff', '#fff', '#06121f', '#06121f', '#06121f', '#06121f', '#06121f', '#fff', '#fff'];   // the number on each band
  var DAY = 864e5, OPEN_KEY = 'samsam_mkt_rb_open';
  var el = null, small = null, full = null, fullAsked = false, tipOn = null, mvPart = null;
  var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var C = function () { return window.Samsam && window.Samsam.core && window.Samsam.core.rainbowRead ? window.Samsam.core : null; };
  var M = function () { return window.SamsamMarket; };
  function usd(v) {
    if (v == null || !isFinite(v)) return '—';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(v >= 1e7 ? 1 : 2) + 'M';
    if (v >= 100) return '$' + Math.round(v).toLocaleString('en-US');
    if (v >= 1) return '$' + v.toFixed(2);
    return '$' + (+v.toPrecision(2));
  }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function day(iso) { var p = String(iso).slice(0, 10).split('-'); return +p[2] + ' ' + MON[+p[1] - 1] + ' ' + p[0]; }   // "5 Nov 2026"
  function vsTxt(v) { return Math.abs(v) < 0.5 ? 'On the trend line' : Math.round(Math.abs(v)) + '% ' + (v < 0 ? 'under' : 'over') + ' the trend line'; }

  var CSS = '.mk-rb{margin-bottom:14px;gap:10px;scroll-margin-top:84px}.mk-rb[hidden]{display:none}.mk-rb .mk-etf-sum,.mk-rb .mk-etf-tog[aria-expanded="true"] .mk-etf-sum{display:inline;color:var(--fg);white-space:normal;text-align:end;min-width:0}.mk-rb .mk-k{white-space:nowrap;flex:none}' +
    '@media(max-width:430px){.mk-rb .mk-etf-tog{flex-wrap:wrap;row-gap:3px}.mk-rb .mk-etf-sum,.mk-rb .mk-etf-tog[aria-expanded="true"] .mk-etf-sum{order:3;flex-basis:100%;text-align:start;margin-inline-start:0;white-space:nowrap}.mk-rb .mk-k{flex:1 1 auto}}' +   // a phone: the band and its name on their own line, never broken in two
    '.rb-strip{position:relative;padding-top:13px;direction:ltr}.rb-bar{display:grid;grid-template-columns:repeat(9,1fr);gap:2px;border-radius:9px;overflow:hidden}' +
    '.rb-seg{height:26px;display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:800;font-variant-numeric:tabular-nums}' +
    '.rb-seg.on{box-shadow:inset 0 0 0 2.5px var(--fg);font-size:.86rem}' +
    '.rb-pin{position:absolute;top:0;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:11px solid var(--fg);transform:translateX(-7px)}' +
    '.rb-under{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:7px;font-size:.74rem;font-weight:600;color:var(--fg2)}.rb-under b{color:var(--fg);font-weight:800}' +
    '.rb-body{display:grid;gap:12px}.rb-body[hidden]{display:none}' +
    '.rb-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}@media(min-width:760px){.rb-stats{grid-template-columns:repeat(4,minmax(0,1fr))}}' +
    '.rb-stat{border:1px solid var(--border);border-radius:11px;padding:8px 10px;min-width:0}.rb-stat>span{display:block;font-size:.68rem;font-weight:700;color:var(--fg2)}' +
    '.rb-stat b{display:block;font-size:.98rem;font-weight:800;color:var(--fg);font-variant-numeric:tabular-nums;margin-top:2px}.rb-stat small{display:block;font-size:.66rem;color:var(--fg2);margin-top:1px}' +
    '.rb-w200{border:1px solid var(--border);border-radius:11px;padding:8px 10px;font-size:.78rem;line-height:1.55;color:var(--fg2)}.rb-w200 b{color:var(--fg);font-weight:800;font-variant-numeric:tabular-nums}' +
    '.rb-w200 small{display:block;font-size:.68rem}.rb-dash{display:inline-block;width:22px;height:0;border-top:2px dashed var(--fg);vertical-align:middle;margin-inline-end:7px;opacity:.85}' +
    '.rb-chart{position:relative;direction:ltr}.rb-chart svg{display:block;width:100%;height:auto;touch-action:pan-y}' +
    '.rb-chart text{font-family:Inter,system-ui,sans-serif;font-size:11px;fill:var(--fg2)}.rb-chart .rb-bn{font-size:10px;font-weight:800}.rb-chart [data-off]{display:none}' +
    '.rb-tip{position:absolute;top:6px;pointer-events:none;background:var(--bg);border:1px solid var(--border);border-radius:9px;padding:6px 9px;font-size:.72rem;line-height:1.45;color:var(--fg);box-shadow:var(--shadow);white-space:nowrap;z-index:2}' +
    '.rb-tip b{font-weight:800}.rb-tip i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-inline-end:5px;vertical-align:-1px}' +
    '.rb-wait{font-size:.76rem;color:var(--fg2);padding:18px 0;text-align:center}' +
    '.rb-table{width:100%;border-collapse:collapse;font-size:.76rem;font-variant-numeric:tabular-nums}.rb-table th{font-size:.66rem;font-weight:700;color:var(--fg2);text-align:start;padding:4px 6px}' +
    '.rb-table td{padding:6px;border-top:1px solid var(--border);color:var(--fg);text-align:start}.rb-table th.r,.rb-table td.r{text-align:end}' +
    '.rb-table td:first-child{white-space:nowrap;font-weight:800}.rb-table i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-inline-end:6px;vertical-align:-1px}' +
    '.rb-table tr.on td{background:color-mix(in srgb,var(--fg) 7%,transparent);font-weight:800}.rb-table .rb-now{font-size:.64rem;font-weight:800;color:var(--fg2);margin-inline-start:6px}' +
    '.rb-range{direction:ltr;unicode-bidi:isolate;display:inline-block;white-space:nowrap}.rb-stat .rb-range{white-space:normal}' +
    '@media(max-width:460px){.rb-table .rb-range{white-space:normal}.rb-table td,.rb-table th{padding-inline:4px}}' +
    '.rb-facts{font-size:.76rem;color:var(--fg2);line-height:1.6}.rb-facts b{color:var(--fg);font-weight:700}';

  function shell() {
    return '<div class="mk-etf-h"><button type="button" class="mk-etf-tog" id="rbTog" aria-expanded="false" aria-controls="rbBody">' +
      '<span class="mk-k"><span data-ic="activity"></span>Bitcoin Rainbow<span class="cp-hint" data-hint="rainbow" role="button" tabindex="0"></span></span>' +
      '<span class="mk-etf-sum" id="rbSum"></span>' +
      '<svg class="mk-etf-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></div>' +
      '<div id="rbTop"></div><div class="rb-body mk-etf-body" id="rbBody" hidden></div>';
  }
  function read() { var c = C(); return c && small ? c.rainbowRead(small, Date.now()) : null; }

  // the closed card: the summary, the strip of nine with the last close's place on it, one line under it
  function paintTop(r) {
    var c = C(), f = r.fit, pos = Math.min(100, Math.max(0, (Math.log10(r.close / r.line) - f.lo) / (f.hi - f.lo) * 100));
    document.getElementById('rbSum').textContent = 'Band ' + r.band + ' of 9 · ' + c.rainbowName(r.band);
    var segs = COL.map(function (col, i) { return '<div class="rb-seg' + (i + 1 === r.band ? ' on' : '') + '" style="background:' + col + ';color:' + INK[i] + '">' + (i + 1) + '</div>'; }).join('');
    document.getElementById('rbTop').innerHTML =
      '<div class="rb-strip" id="rbStrip" role="img" aria-label="Band ' + r.band + ' of 9"><i class="rb-pin" style="left:' + pos.toFixed(2) + '%"></i><div class="rb-bar">' + segs + '</div></div>' +
      '<div class="rb-under"><span id="rbVs"><b>' + E(vsTxt(r.vs)) + '</b></span><span id="rbPend">' + (r.pending ? 'Last close in band ' + r.pending + ' — one more close confirms' : 'Close ' + E(usd(r.close)) + ' · ' + E(day(r.day))) + '</span></div>';
  }

  function stat(k, v, s) { return '<div class="rb-stat"><span>' + k + '</span><b>' + v + '</b>' + (s ? '<small>' + s + '</small>' : '') + '</div>'; }
  function paintBody(r) {
    var c = C(), body = document.getElementById('rbBody'), f = r.fit, share = r.share || [];
    var rows = ''; for (var b = 9; b >= 1; b--) rows += '<tr' + (b === r.band ? ' class="on"' : '') + ' data-b="' + b + '"><td><i style="background:' + COL[b - 1] + '"></i>' + b + '</td><td>' + E(c.rainbowName(b)) + (b === r.band ? '<span class="rb-now">now</span>' : '') + '</td>' +
      '<td class="r"><span class="rb-range">' + E(usd(r.edges[b - 1])) + ' – ' + E(usd(r.edges[b])) + '</span></td><td class="r">' + (share[b - 1] != null ? (+share[b - 1]).toFixed(1) + '%' : '—') + '</td></tr>';
    var pk = full && Array.isArray(full.peaks) ? full.peaks : (small && small.peaks) || [], mv = full && full.moves && full.moves.last ? full.moves.last.slice(-3).reverse() : [];
    var facts = [];
    if (pk.length) facts.push('The highest band each cycle held: <b>' + pk.map(function (x) { return '<bdi dir="ltr">' + x[0] + ': ' + x[1] + '</bdi>'; }).join(' · ') + '</b>');
    // a move: "3 → 2" in English. In Arabic the same arrow, kept left-to-right inside a right-to-left line, is read from
    // the right as "2 → 3" — so Arabic says it in words: "من 3 إلى 2".
    var AR = !!(window.CPLang && CPLang.ar), move = function (a, b) { return AR ? '<b class="rb-mv">من ' + a + ' إلى ' + b + '</b>' : '<b class="rb-mv"><bdi dir="ltr">' + a + ' → ' + b + '</bdi></b>'; };
    if (mv.length) facts.push('<span>Last moves:</span> ' + mv.map(function (x) { return move(x[1], x[2]) + ' (<span>' + E(day(x[0])) + '</span>)'; }).join(' · '));
    if (f.to) facts.push('<span>The line was last fitted on</span> <b><span>' + E(day(f.to)) + '</span></b>');
    body.innerHTML =
      '<div class="rb-stats">' + stat('Last daily close', E(usd(r.close)), E(day(r.day))) + stat('Trend line', E(usd(r.line)), E(vsTxt(r.vs))) +
        stat('This band', '<span class="rb-range">' + E(usd(r.lo)) + ' – ' + E(usd(r.hi)) + '</span>', share[r.band - 1] != null ? (+share[r.band - 1]).toFixed(1) + '% of days since 2010' : '') +
        stat('In this band since', r.since ? E(day(r.since)) : '—', 'counted after two daily closes') + '</div>' +
      w200Html() + mvrvHtml() +
      '<div class="rb-chart" id="rbChart">' + (full ? '' : '<div class="rb-wait">Loading the chart…</div>') + '</div>' +
      '<table class="rb-table" id="rbTable"><thead><tr><th>Band</th><th>Name</th><th class="r">Range today</th><th class="r">Days since 2010</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      (facts.length ? '<div class="rb-facts" id="rbFacts">' + facts.join('<br>') + '</div>' : '') +
      '<p class="mk-etf-note">One trend line through every daily close since 18 Aug 2010 (blockchain.com until 2017, Binance after), and nine equal bands between the deepest and the highest distance from it. The line is fitted again every week. It describes the past — it is not a forecast.</p>';
    if (full) { document.getElementById('rbChart').innerHTML = chart(r); hover(r); }   // (drawn once the box has its width)
  }

  // 📏 the 200-week average (the mean of the last 200 Sunday closes — samsam-core.js → btcMarks): the dashed line on the chart.
  // A reference, not a floor: the row says how many daily closes were under it, and when the last one was.
  function w200Html() {
    var c = C(), m = c && c.btcMarks ? c.btcMarks(small, Date.now()) : null, w = m && m.w200; if (!w) return '';
    var v = Math.round(Math.abs(w.vs)), h = w.hist;
    return '<div class="rb-w200" id="rbW200"><i class="rb-dash"></i><span>200-week average:</span> <b class="rb-range">' + E(usd(w.ma)) + '</b><span class="cp-hint" data-hint="w200" role="button" tabindex="0"></span> · <span>' + (v < 1 ? 'Bitcoin’s price is now at it' : 'Bitcoin’s price is now ~' + v + '% ' + (w.vs < 0 ? 'below' : 'above') + ' it') + '</span>' +   // (the price here is the last daily close)
      (h && h.days != null ? '<small><span>Daily closes under it: ' + h.days.toLocaleString('en-US') + ' (' + h.pct + '% of the days)</span>' + (h.last ? ' · <span>the last on</span> <span>' + E(day(h.last)) + '</span>' : '') + ' · <span>a reference, not a floor</span></small>' : '') + '</div>';
  }
  // MVRV (Bitcoin's market value ÷ its realized value — samsam-core.js → mvrvRead on the snapshot's part): the ratio, the
  // market's average cost it implies and the close against it, each cycle's highest — and whose number it is (Coin Metrics'
  // free data asks for its name). A reference, not a floor.
  function mvrvHtml() {
    var c = C(), m = c && c.mvrvRead ? c.mvrvRead(mvPart, Date.now()) : null; if (!m) return '';
    var vs = (m.v - 1) * 100, v = Math.round(Math.abs(vs)), pk = (m.peaks || []).filter(function (x) { return x && x[0] >= 2012; });
    return '<div class="rb-w200 rb-mvrv" id="rbMvrv"><span data-no-tr>MVRV</span> <b class="rb-range">' + m.v.toFixed(2) + '</b><span class="cp-hint" data-hint="mvrv" role="button" tabindex="0"></span>' +
      (m.realized ? ' · <span>Bitcoin’s realized market cost:</span> <b class="rb-range">' + E(usd(m.realized)) + '</b> · <span>' + (v < 1 ? 'Bitcoin’s price is now at average cost' : 'Bitcoin’s price is now ~' + v + '% ' + (vs < 0 ? 'below' : 'above') + ' average cost') + '</span>' : '') +
      '<small>' + (pk.length ? '<span>Each cycle’s highest:</span> ' + pk.map(function (x) { return '<bdi dir="ltr">' + x[0] + ': ' + (+x[1]).toFixed(2) + '</bdi>'; }).join(' · ') + ' · ' : '') +
      '<span>a reference, not a floor</span> · <span class="rb-src">Source: Coin Metrics</span>' + (m.via ? ' <span>(today’s value: ' + E(m.via) + ')</span>' : '') + '</small></div>';
  }
  // the chart: price on a log scale against time, the nine bands as ribbons, the weekly closes as one line
  var G = { w: 720, h: 330, l: 46, r: 22, t: 8, b: 24 };
  function chart(r) {
    var bw = Math.round(document.getElementById('rbChart').clientWidth) || 720;   // one SVG unit = one pixel: the labels keep their size on a phone (no width yet — the Crypto view is hidden — is drawn again when it shows: the observer in mount)
    G.w = Math.max(220, Math.min(1800, bw)); G.h = G.w < 520 ? 250 : 340; G.l = G.w < 520 ? 40 : 46; chart.w = bw;
    var c = C(), f = r.fit, pts = full.weekly, d0 = pts[0][0], dEnd = pts[pts.length - 1][0], d1 = dEnd + 365;   // a year ahead: where the bands go next
    var yLo = Math.log10(0.03), yHi = Math.log10(c.rainbowEdges(f, d1)[9] * 1.15);
    var X = function (d) { return G.l + (d - d0) / (d1 - d0) * (G.w - G.l - G.r); }, Y = function (p) { return G.t + (yHi - Math.log10(p)) / (yHi - yLo) * (G.h - G.t - G.b); };
    var N = 90, xs = []; for (var i = 0; i <= N; i++) xs.push(d0 + (d1 - d0) * i / N);
    var edges = xs.map(function (d) { return c.rainbowEdges(f, d); }), s = '';
    for (var b = 0; b < 9; b++) {
      var up = xs.map(function (d, k) { return X(d).toFixed(1) + ',' + Y(edges[k][b + 1]).toFixed(1); }), dn = xs.map(function (d, k) { return X(d).toFixed(1) + ',' + Y(Math.max(edges[k][b], 0.03)).toFixed(1); }).reverse();
      s += '<path d="M' + up.join('L') + 'L' + dn.join('L') + 'Z" fill="' + COL[b] + '" opacity="' + (b + 1 === r.band ? 1 : .78) + '" stroke="var(--card)" stroke-width="1.2"/>';
      if (b % (G.w < 520 ? 4 : 2) === 0) s += '<text class="rb-bn" x="' + (G.w - G.r + 6) + '" y="' + (Y(Math.sqrt(edges[N][b] * edges[N][b + 1])) + 3.5).toFixed(1) + '" style="fill:var(--fg)">' + (b + 1) + '</text>';   // (the odd bands — 1 · 5 · 9 on a phone: nine numbers would touch)
    }
    var grid = ''; [0.1, 1, 10, 100, 1000, 1e4, 1e5, 1e6].forEach(function (p) { if (Math.log10(p) > yLo && Math.log10(p) < yHi) grid += '<line x1="' + G.l + '" x2="' + (G.w - G.r) + '" y1="' + Y(p).toFixed(1) + '" y2="' + Y(p).toFixed(1) + '" stroke="var(--border)" stroke-width="1"/><text x="' + (G.l - 6) + '" y="' + (Y(p) + 3.5).toFixed(1) + '" text-anchor="end">' + (p >= 1e6 ? '$1M' : p >= 1000 ? '$' + p / 1000 + 'k' : '$' + p) + '</text>'; });
    for (var y = 2012; y <= new Date(d1 * DAY).getUTCFullYear(); y += (G.w < 520 ? 4 : 2)) { var dx = Date.UTC(y, 0, 1) / DAY; if (dx > d0 && dx < d1) grid += '<text x="' + X(dx).toFixed(1) + '" y="' + (G.h - 7) + '" text-anchor="middle">' + y + '</text>'; }
    var line = pts.map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(Math.max(p[1], 0.03)).toFixed(1); }).join('L'), lp = pts[pts.length - 1];
    var wl = c.btcW200 ? c.btcW200(pts) : [], wPath = wl.length > 1 ? 'M' + wl.map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join('L') : '';   // 📏 the 200-week average, from the same weekly closes
    chart.X = X; chart.Y = Y; chart.d0 = d0; chart.d1 = dEnd; chart.w200 = wl;
    return '<svg viewBox="0 0 ' + G.w + ' ' + G.h + '" role="img" aria-label="Bitcoin price since 2010 inside the nine rainbow bands (log scale)">' + s + grid +
      '<path d="M' + line + '" fill="none" stroke="var(--card)" stroke-width="4" stroke-linejoin="round" opacity=".85"/><path d="M' + line + '" fill="none" stroke="var(--fg)" stroke-width="1.8" stroke-linejoin="round"/>' +
      (wPath ? '<path id="rbW200Line" d="' + wPath + '" fill="none" stroke="var(--card)" stroke-width="3.4" opacity=".7"/><path d="' + wPath + '" fill="none" stroke="var(--fg)" stroke-width="1.5" stroke-dasharray="5 4" opacity=".9"/>' : '') +
      '<circle cx="' + X(lp[0]).toFixed(1) + '" cy="' + Y(lp[1]).toFixed(1) + '" r="4.5" fill="var(--fg)" stroke="var(--card)" stroke-width="2"/>' +
      '<g id="rbCross" data-off><line id="rbCrossL" y1="' + G.t + '" y2="' + (G.h - G.b) + '" stroke="var(--fg2)" stroke-width="1" stroke-dasharray="3 3"/><circle id="rbCrossD" r="4.5" fill="var(--fg)" stroke="var(--card)" stroke-width="2"/></g></svg><div class="rb-tip" id="rbTip" hidden></div>';
  }
  // hover / touch: the nearest weekly close — its day, price and the band it was in
  function hover(r) {
    var c = C(), box = document.getElementById('rbChart'), svg = box && box.querySelector('svg'); if (!svg) return;
    var pts = full.weekly, f = r.fit, tip = document.getElementById('rbTip'), cross = document.getElementById('rbCross');
    function at(ev) {
      var rc = svg.getBoundingClientRect(), x = (ev.clientX - rc.left) / rc.width * G.w, d = chart.d0 + (x - G.l) / (G.w - G.l - G.r) * (pts[pts.length - 1][0] + 365 - chart.d0);
      var lo = 0, hi = pts.length - 1; while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (pts[mid][0] < d) lo = mid; else hi = mid; }
      var p = Math.abs(pts[lo][0] - d) <= Math.abs(pts[hi][0] - d) ? pts[lo] : pts[hi], band = c.rainbowBand(f, c.rainbowDev(f, p[0], p[1])), px = chart.X(p[0]), py = chart.Y(Math.max(p[1], 0.03));
      cross.removeAttribute('data-off'); document.getElementById('rbCrossL').setAttribute('x1', px); document.getElementById('rbCrossL').setAttribute('x2', px);
      document.getElementById('rbCrossD').setAttribute('cx', px); document.getElementById('rbCrossD').setAttribute('cy', py);
      if (tipOn !== p[0]) tip.innerHTML = '<b>' + E(usd(p[1])) + '</b> <span>' + E(day(c.rainbowIso(p[0]))) + '</span><br><i style="background:' + COL[band - 1] + '"></i><span>Band ' + band + ' · ' + E(c.rainbowName(band)) + '</span>' + (function () { var w = (chart.w200 || []).filter(function (x) { return x[0] <= p[0]; }).pop(); return w ? '<br><span>200-week average</span> <b>' + E(usd(w[1])) + '</b>' : ''; })();
      tip.hidden = false; tipOn = p[0];
      var left = px / G.w * rc.width, tw = tip.offsetWidth; tip.style.left = Math.max(0, Math.min(rc.width - tw, left > rc.width / 2 ? left - tw - 12 : left + 12)) + 'px';
    }
    function off() { cross.setAttribute('data-off', ''); tip.hidden = true; tipOn = null; }
    svg.addEventListener('pointermove', at); svg.addEventListener('pointerdown', at);
    svg.addEventListener('pointerleave', function (ev) { if (ev.pointerType !== 'touch') off(); });
    svg.addEventListener('pointercancel', off);   // the finger went on to scroll the page: no line or tooltip is left behind   // a finger: the tooltip stays after the tap, until a tap outside the chart
    if (!hover.doc) { hover.doc = true; document.addEventListener('pointerdown', function (ev) { var b = document.getElementById('rbChart'); if (b && !b.contains(ev.target)) { var t = document.getElementById('rbTip'), x = document.getElementById('rbCross'); if (t) t.hidden = true; if (x) x.setAttribute('data-off', ''); tipOn = null; } }); }
  }

  function paint() {
    if (!el) return;
    var r = read();
    if (!r) { el.hidden = true; return; }   // no file, or its last close is over 4 days old: nothing is shown
    el.hidden = false; paintTop(r);
    if (!document.getElementById('rbBody').hidden) paintBody(r);
  }
  function setOpen(on, keep) {
    var body = document.getElementById('rbBody'); body.hidden = !on; el.classList.toggle('open', on);
    document.getElementById('rbTog').setAttribute('aria-expanded', String(on));
    if (keep) try { localStorage.setItem(OPEN_KEY, on ? '1' : '0'); } catch (_) {}
    if (on) { var r = read(); if (r) paintBody(r); loadFull(); }
  }
  function loadFull() {
    if (fullAsked || !M() || !M().rainbowFull) return; fullAsked = true;
    M().rainbowFull().then(function (j) { if (j && j.v === 1 && Array.isArray(j.weekly) && j.weekly.length > 100) { full = j; paint(); } else note('The chart is not ready yet.'); }, function () { fullAsked = false; note('Could not load the chart — try again later.'); });
  }
  function note(t) { var w = el && el.querySelector('.rb-wait'); if (w) w.textContent = t; }
  function load() {
    if (!M() || !M().rainbow) return;
    if (M().mvrv) M().mvrv().then(function (p) { mvPart = p; if (small) paint(); }, function () {});
    M().rainbow().then(function (f) { small = f; var go = function (n) { if (C() || n > 60) paint(); else setTimeout(function () { go(n + 1); }, 150); }; go(0); });   // (the maths arrives with samsam-cloud.js)
  }
  // market.html#rainbow (the bot's alert button): open the card and bring it into view
  function fromHash() { if (/^#rainbow\b/.test(location.hash || '') && el) { setOpen(true); setTimeout(function () { if (!el.hidden) el.scrollIntoView({ block: 'start' }); }, 700); } }   // (after the cards above it have their height)

  window.SamsamRainbow = {
    COLORS: COL,
    mount: function (node) {
      if (!node || el) return; el = node;
      var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      el.innerHTML = shell();
      var on = false; try { on = localStorage.getItem(OPEN_KEY) === '1'; } catch (_) {}
      document.getElementById('rbTog').addEventListener('click', function (ev) { if (ev.target.closest('.cp-hint')) return; setOpen(document.getElementById('rbBody').hidden, true); });
      setOpen(on || /^#rainbow\b/.test(location.hash || ''));
      load(); fromHash(); window.addEventListener('hashchange', fromHash);
      // The card can be painted while its view is hidden (the hub opened on Metals or bStocks): the chart then has no width
      // to take and was drawn 720 wide, shrunk to tiny labels once shown. Whenever the card's box changes, draw it to fit.
      if (window.ResizeObserver) new ResizeObserver(function () { var b = document.getElementById('rbChart'), w = b ? Math.round(b.clientWidth) : 0; if (full && w > 0 && !document.getElementById('rbBody').hidden && w !== chart.w) paint(); }).observe(el);
      var rt = null; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { var b = document.getElementById('rbChart'); if (full && b && !document.getElementById('rbBody').hidden && Math.round(b.clientWidth) !== chart.w) paint(); }, 200); });
    },
    refresh: load,
  };
})();
