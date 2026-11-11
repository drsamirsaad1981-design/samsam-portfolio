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
  snaps = withLiveTotal(snaps);
  if (snaps.length === 1) snaps = [snaps[0], snaps[0]];
  if (noData) noData.style.display = 'none';
  canvas.style.display = '';

  const last  = snaps[snaps.length - 1].v;
  const hc = holdingsChangeText(snaps), isPos = hc.up;
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
  const totals = {}; let all = 0;
  portfolio.forEach(c => { const v = c.qty * c.currentPrice, k = c.cat || 'other'; totals[k] = (totals[k] || 0) + v; all += v; });
  const keys = T.pickerKeys(totals);
  const sub = v => SamsamFmt.usd(v) + (hovMode === 'alloc' ? ' · ' + (all > 0 ? v / all * 100 : 0).toFixed(1) + '%' : '');
  const options = [{ value: 'all', label: 'All Coins', sub: SamsamFmt.usd(all), icon: '<span class="cp-globe">' + SamsamUI.ic('globe', { solo: true }) + '</span>' }]
    .concat(keys.map(k => ({ value: k, label: T.label(k), sub: sub(totals[k] || 0), icon: `<span class="cp-dot" style="background:${T.color(k)}"></span>` })));
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
function renderHovDonut() {
  const svg = document.getElementById('hovDonut'); if (!svg || hovMode !== 'alloc') return;
  const T = SamsamTaxonomy, totals = {}; let all = 0;
  portfolio.forEach(c => { const v = c.qty * c.currentPrice, k = c.cat || 'other'; if (v > 0) { totals[k] = (totals[k] || 0) + v; all += v; } });
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const cx = 100, cy = 100, R = 88, r = 58; let a0 = -Math.PI / 2;
  svg.innerHTML = entries.map(([k, v]) => {
    const ang = Math.min(v / all * Math.PI * 2, Math.PI * 2 - 1e-4), a1 = a0 + ang, L = ang > Math.PI ? 1 : 0;
    const P = (rad, a) => (cx + rad * Math.cos(a)).toFixed(2) + ',' + (cy + rad * Math.sin(a)).toFixed(2);
    const d = `M${P(r, a0)} L${P(R, a0)} A${R},${R} 0 ${L},1 ${P(R, a1)} L${P(r, a1)} A${r},${r} 0 ${L},0 ${P(r, a0)} Z`; a0 = a1;
    const on = !hovCat || hovCat === k;
    return `<path class="donut-slice" data-cat="${k}" d="${d}" fill="${T.color(k)}" opacity="${!hovCat ? .92 : on ? 1 : .35}" style="${hovCat && on ? 'transform:scale(1.04)' : ''}"><title>${T.label(k)} · ${(v / all * 100).toFixed(1)}%</title></path>`;
  }).join('');
  svg.onclick = e => { const p = e.target.closest('.donut-slice'); if (!p) return; const k = p.dataset.cat === hovCat ? '' : p.dataset.cat; setHovCat(k); };
  const cv = document.getElementById('hovDonutVal'), cl = document.getElementById('hovDonutLbl');
  if (hovCat) { cv.textContent = (all > 0 ? (totals[hovCat] || 0) / all * 100 : 0).toFixed(1) + '%'; cv.style.color = T.color(hovCat); cl.textContent = T.label(hovCat); }
  else { cv.textContent = SamsamFmt.usd(all); cv.style.color = ''; cl.textContent = 'Total'; }
}
