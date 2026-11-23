// samsam-hchart.js — the main page's Holdings chart and its full view (#holdings): the range tabs, the overlay chart,
// the coin list with its sort, category and Assets / Allocation switch. Loaded right after samsam-home.js, whose data
// and routing it uses. Moved out of samsam-home.js as it was.
// ── Holdings Chart ────────────────────────────────────────────────────────────
// the main page's charts open on All (the whole history) — or the range picked in Settings
let holdingsRange  = (() => { try { const v = localStorage.getItem('samsam_chart_range'); return ['24h', '7d', '30d', '90d', 'all'].includes(v) ? v : 'all'; } catch (_) { return 'all'; } })();
document.querySelectorAll('.holdings-tab').forEach(b => b.classList.toggle('active', b.dataset.range === holdingsRange));

// Holdings points: one per 5 minutes, stored in the cloud (merged across devices).
function saveHoldingsSnapshot(value) {
  cloudWrite(Samsam.recordSnapshot('holdings', Date.now(), value));
}

function loadHoldingsSnaps() { return holdingsSnapsState; }

function setHoldingsRange(range, btn) {
  holdingsRange = range;   // one range for both main-page chart cards
  document.querySelectorAll('.holdings-tab').forEach(b => b.classList.toggle('active', b.dataset.range === range));
  drawHoldingsChart();
  try { drawPerfChart(); } catch (_) {}
}

function drawHoldingsChart(pc) {   // pc: { canvas, height } — the PDF's copy (light colours, no page updates)
  const allSnaps = loadHoldingsSnaps();
  const canvas   = pc ? pc.canvas : document.getElementById('holdingsCanvas');
  const noData   = document.getElementById('holdingsNoData');
  const totalEl  = document.getElementById('holdingsTotal');
  const changeEl = document.getElementById('holdingsChange');
  if (!canvas) return;

  // Filter by range
  const now = Date.now();
  const rangeMs = { '24h': 86400000, '7d': 604800000, '30d': 2592000000, '90d': 7776000000, 'all': Infinity };
  const cutoff  = holdingsRange === 'all' ? 0 : now - rangeMs[holdingsRange];
  let snaps = allSnaps.filter(s => s.t >= cutoff);
  // "Altcoins only" (the switch under the range, one for both cards): the card shows the altcoins' own value and profit
  const alt = !pc && window.SamsamCoins && SamsamCoins.perfScope() === 'alt' && typeof altHoldings === 'function' ? altHoldings(cutoff) : null;
  if (alt) snaps = alt.snaps;

  if (pc && !snaps.length) return null;
  // Need at least 1 point — if only 1 snapshot duplicate it so chart renders as a flat baseline
  if (snaps.length === 0) {
    if (noData) noData.style.display = '';
    canvas.style.display = 'none';
    // Still show current total
    const { total } = calcStats ? calcStats() : { total: 0 };
    if (total > 0) totalEl.textContent = SamsamFmt.usd(total);
    if (changeEl) { changeEl.textContent = ''; }
    return;
  }
  if (!alt) snaps = withLiveTotal(snaps);
  if (snaps.length === 1) snaps = [snaps[0], snaps[0]];
  if (noData) noData.style.display = 'none';
  canvas.style.display = '';

  const last  = snaps[snaps.length - 1].v;
  const hc = holdingsChangeText(snaps, alt), isPos = hc.up;
  const color = isPos ? '#22c55e' : '#f43f5e'; // green when prices took it up, red when down
  if (pc) { SamsamChart.draw(canvas, { height: pc.height, format: 'usd', timeMode: timeModeFor(holdingsRange), theme: 'light', series: [{ points: snaps, color: isPos ? '#16a34a' : '#e11d48', width: 2.2, fill: true }] }); return hc; }

  // Update header
  totalEl.textContent = SamsamFmt.usd(last);
  if (changeEl) { changeEl.textContent = hc.text; changeEl.title = hc.title; changeEl.className = 'holdings-change ' + (isPos ? 'pos' : 'neg'); }

  SamsamChart.draw(canvas, { height: TRIO_CHART_H(), format: 'usd', timeMode: timeModeFor(holdingsRange), series: [{ points: snaps, color, width: 2.2, fill: true }] });
}

function updateHoldingsChart() {
  const { total } = calcStats ? calcStats() : { total: 0 };
  if (total > 0) {
    saveHoldingsSnapshot(total);
    drawHoldingsChart();
  }
}

// ResizeObserver for holdings canvas
(function initHoldingsChart() {
  const wrap = document.getElementById('holdingsCard');
  if (!wrap) return;
  if (window.ResizeObserver) {
    let ro_t;
    const ro = new ResizeObserver(() => { clearTimeout(ro_t); ro_t = setTimeout(drawHoldingsChart, 50); });
    ro.observe(wrap);
  }
  setTimeout(drawHoldingsChart, 3100);
})();

// Draw chart after layout is complete — use ResizeObserver for accurate width on all devices
(function initPerfChart() {
  const wrap = document.getElementById('perfChartWrap');
  if (!wrap) return;
  // ResizeObserver redraws whenever the container changes width (desktop resize, orientation, etc.)
  if (window.ResizeObserver) {
    let roTimer;
    const ro = new ResizeObserver(() => {
      clearTimeout(roTimer);
      roTimer = setTimeout(drawPerfChart, 50);
    });
    ro.observe(wrap);
  }
  // Initial draw after DOM & prices settle
  setTimeout(drawPerfChart, 3000);
  // (cloud sync is live — no polling needed)
})();

// Holdings screen: sort by Asset (A→Z), Price or Holdings value; tap the same column again to reverse
let hovSort = { key: 'holdings', dir: -1 };
try { const v = JSON.parse(localStorage.getItem('samsam_hov_sort') || 'null'); if (v && ['asset', 'holdings'].includes(v.key)) hovSort = v; } catch (_) {}
function setHovSort(key) {
  hovSort = hovSort.key === key ? { key, dir: -hovSort.dir } : { key, dir: key === 'asset' ? 1 : -1 };
  try { localStorage.setItem('samsam_hov_sort', JSON.stringify(hovSort)); } catch (_) {}
  renderHoldingsAssetList();
}
// Holdings screen category filter — same single card + dropdown/bottom sheet as the main page
let hovCat = '', hovCatDD = null;
function setHovCat(cat) {
  if (cat === hovCat) return;
  hovCat = cat; renderHoldingsAssetList();
  if (!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches))
    document.querySelectorAll('#hovAssetList .hov-asset-row').forEach((el, i) => { el.style.animationDelay = Math.min(i, 12) * 30 + 'ms'; el.classList.add('slide-up'); });
}
function renderHovCatPicker() {
  const host = document.getElementById('hovCatHost'), T = SamsamTaxonomy;
  if (!host || !window.SamsamDropdown) return;
  const sub = (v, all) => SamsamFmt.usd(v) + ' · ' + (all > 0 ? v / all * 100 : 0).toFixed(1) + '%';
  const pk = T.pickerOptions(portfolio.map(c => ({ sym: c.sym, cat: c.cat, v: c.qty * c.currentPrice })), { sub });
  const options = [{ value: 'all', label: pk.classes.length > 1 ? 'All' : 'All Coins', sub: SamsamFmt.usd(pk.all), icon: '<span class="cp-globe">' + SamsamUI.ic('globe', { solo: true }) + '</span>' }].concat(pk.options);
  if (!hovCatDD) {
    host.innerHTML = '<div class="cat-picker" id="hovCatPicker"><div id="hovCatDD"></div></div>';
    hovCatDD = SamsamDropdown.create(document.getElementById('hovCatDD'), {
      options, value: 'all', ariaLabel: 'Category', title: 'Choose a category', minWidth: 260, maxHeight: 360,
      onChange: v => setHovCat(v === 'all' ? '' : v),
    });
    hovCatDD.button.insertAdjacentHTML('afterbegin', '<span class="cp-kicker">Category</span>');
    hovCatDD.button.querySelector('.sdd-chev').insertAdjacentHTML('beforebegin', '<span class="cp-val" id="hovCatVal"></span>');
  }
  const cur = hovCat || 'all';
  hovCatDD.setOptions(options); hovCatDD.setValue(cur);
  document.getElementById('hovCatVal').textContent = (options.find(o => o.value === cur) || options[0]).sub;
  document.getElementById('hovCatPicker').style.setProperty('--cat-c', cur === 'all' ? 'var(--accent)' : T.color(cur));
}
// The main page's Holdings card → Performance, with its Portfolio Value chart (under Total Value) open
function openHoldingsChart() { try { localStorage.setItem('samsam_pf_hv', '1'); } catch (_) {} SamsamUI.ptabGo('performance'); }
// This screen is Allocation (donut by category + each coin's share of the whole portfolio). It used to also be
// "Holdings" (the total + chart + coin list) — dropped: Performance has the same list, the Overview card the chart.
const hovMode = 'alloc';
function setHovMode(m, quiet) { paintHovMode(); if (!quiet) renderHoldingsAssetList(); }   // kept for old callers
function paintHovMode() {
  const ov = document.getElementById('holdingsOverlay'); if (ov) ov.setAttribute('data-mode', 'alloc');
  const h = document.querySelector('.hov-list-header .hov-h-lbl'); if (h) h.textContent = 'Allocation';
  const tabs = document.getElementById('hovPtabs'); if (tabs && window.SamsamUI && SamsamUI.ptabs) SamsamUI.ptabs(tabs, 'allocation');
  if (ov && ov.getAttribute('data-view') !== 'tx') {   // the screen's title
    const t = document.getElementById('hovNavTitle'), ic = document.getElementById('hovNavIcon');
    if (t) t.textContent = 'Allocation';
    if (ic && window.SamsamUI) ic.innerHTML = SamsamUI.navIcon('allocation');
  }
}
// Two rings when you hold more than one class: inside, Crypto · Stocks · Metals; outside, the categories of each,
// lined up under their class. One class → one ring of categories, as before. Tap a slice → that class / category.
function renderHovDonut() {
  const svg = document.getElementById('hovDonut'); if (!svg || hovMode !== 'alloc') return;
  const T = SamsamTaxonomy;
  const t = T.tree(portfolio.filter(c => c.qty * c.currentPrice > 0).map(c => ({ sym: c.sym, cat: c.cat, v: c.qty * c.currentPrice })));
  const all = t.all, two = t.classes.length > 1;
  const cx = 100, cy = 100, P = (rad, a) => (cx + rad * Math.cos(a)).toFixed(2) + ',' + (cy + rad * Math.sin(a)).toFixed(2);
  const arc = (r, R, a0, a1) => { const L = a1 - a0 > Math.PI ? 1 : 0; return `M${P(r, a0)} L${P(R, a0)} A${R},${R} 0 ${L},1 ${P(R, a1)} L${P(r, a1)} A${r},${r} 0 ${L},0 ${P(r, a0)} Z`; };
  const on = (k, g) => !hovCat || hovCat === k || (T.isClassKey(hovCat) && hovCat === 'c:' + g);
  const slice = (k, g, r, R, a0, a1, v, cls) => `<path class="donut-slice${cls}" data-cat="${k}" d="${arc(r, R, a0, a1)}" fill="${T.color(k)}" opacity="${!hovCat ? .92 : on(k, g) ? 1 : .3}" style="${hovCat && hovCat === k ? 'transform:scale(1.04)' : ''}"><title>${T.label(k)} · ${(v / all * 100).toFixed(1)}%</title></path>`;
  const ang = v => Math.min(v / all * Math.PI * 2, Math.PI * 2 - 1e-4);
  let a0 = -Math.PI / 2, out = '';
  // biggest class first, and inside it its biggest category first
  t.classes.slice().sort((a, b) => b.v - a.v).forEach(c => {
    const c0 = a0;
    c.cats.filter(k => k.v > 0).sort((a, b) => b.v - a.v).forEach(k => { const a1 = a0 + ang(k.v); out += slice(k.key, c.key, two ? 66 : 58, 88, a0, a1, k.v, ''); a0 = a1; });
    if (two) out += slice('c:' + c.key, c.key, 50, 62, c0, Math.min(c0 + ang(c.v), a0), c.v, ' donut-cls');
  });
  svg.innerHTML = all > 0 ? out : '';
  svg.setAttribute('aria-label', two ? 'Portfolio allocation by class (inner ring) and by category (outer ring)' : 'Portfolio allocation by category');
  svg.onclick = e => { const p = e.target.closest('.donut-slice'); if (!p) return; const k = p.dataset.cat === hovCat ? '' : p.dataset.cat; setHovCat(k); };
  const cv = document.getElementById('hovDonutVal'), cl = document.getElementById('hovDonutLbl');
  document.getElementById('hovAllocCard').classList.toggle('two-rings', two);
  if (hovCat) {
    let v = 0; t.classes.forEach(c => { if (hovCat === 'c:' + c.key) v += c.v; else c.cats.forEach(k => { if (k.key === hovCat) v += k.v; }); });
    cv.textContent = (all > 0 ? v / all * 100 : 0).toFixed(1) + '%'; cv.style.color = T.color(hovCat); cl.textContent = T.label(hovCat);
  }
  else { cv.textContent = SamsamFmt.usd(all); cv.style.color = ''; cl.textContent = 'Total'; }
  renderHovClassBar(t);
}
// Under the donut (two classes or more): one line per class — its colour, name, value and share; tap → filter to it
function renderHovClassBar(t) {
  const card = document.getElementById('hovAllocCard'); if (!card) return;
  let bar = document.getElementById('hovClsBar');
  if (t.classes.length < 2) { if (bar) bar.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'hovClsBar'; bar.className = 'hov-cls-bar'; card.appendChild(bar);
    bar.onclick = e => { const b = e.target.closest('[data-cls]'); if (b) setHovCat(hovCat === b.dataset.cls ? '' : b.dataset.cls); }; }
  bar.innerHTML = t.classes.map(c => { const k = 'c:' + c.key;
    return `<button type="button" class="hov-cls" data-cls="${k}" aria-pressed="${hovCat === k}" style="--c:${c.color}"><span class="cp-cls" style="--c:${c.color}"></span><b>${c.label}</b><span>${SamsamFmt.usd(c.v)}</span><i>${(t.all > 0 ? c.v / t.all * 100 : 0).toFixed(1)}%</i></button>`; }).join('');
}
