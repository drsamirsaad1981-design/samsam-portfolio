// samsam-edits.js — the main page's small editors: Signal thresholds and the Baseline.
// ── Signal thresholds editor ──
// The fields hold how far BELOW your Avg. Buy Price (the − is printed in front), so the phone's number pad is enough:
// 8 → −8%. A "-8" typed or pasted means the same; a comma works as the decimal point.
function sgNum(id) {
  const v = String(document.getElementById(id).value).replace(/[%\s+]/g, '').replace(/[−–-]/g, '').replace(',', '.');
  return v === '' || !/^\d*\.?\d*$/.test(v) || v === '.' ? NaN : -Number(v);
}
function sgRead() {
  const r = sgNum('sgReinforce'), x = sgNum('sgSell');
  const ok = Number.isFinite(r) && Number.isFinite(x) && r <= 0 && r >= -99 && x >= -99.9 && x < r;
  return { reinforce: r, sell: x, ok };
}
const sgShow = n => String(Math.abs(n));
function openSignalEdit() {
  if (!requireCloud()) return;
  const r = Samsam.getSignalRules();
  document.getElementById('sgReinforce').value = sgShow(r.reinforce); document.getElementById('sgSell').value = sgShow(r.sell);
  document.getElementById('sgReset').style.display = r.isDefault ? 'none' : '';
  document.getElementById('sgSmart').checked = r.smart !== false;
  document.getElementById('sgModal').classList.add('show'); sgPreview();
  setTimeout(() => document.getElementById('sgReinforce').focus(), 30);
  document.addEventListener('keydown', sgKey, true);
}
function closeSignalEdit() { document.getElementById('sgModal').classList.remove('show'); document.removeEventListener('keydown', sgKey, true); }
function sgKey(e) { if (e.key === 'Escape' && !document.querySelector('.cph')) { e.preventDefault(); closeSignalEdit(); } }
document.getElementById('sgModal').addEventListener('click', e => { if (e.target.id === 'sgModal') closeSignalEdit(); });
function sgUseDefault() { document.getElementById('sgReinforce').value = 5; document.getElementById('sgSell').value = 20; sgPreview(); }
// live preview: how many of your coins land in each Signal with these numbers
function sgPreview() {
  const v = sgRead(), box = document.getElementById('sgPrev'), save = document.getElementById('sgSave');
  save.disabled = !v.ok;
  if (!v.ok) { box.innerHTML = '<span style="color:#f87171">' + SamsamUI.ic('alert') + 'Sell / Convert must be further below than Reinforce (e.g. 5 and 20), up to 99.</span>'; return; }
  const n = { hold: 0, reinforce: 0, convert: 0 }, smart = document.getElementById('sgSmart').checked; let changed = 0;
  portfolio.forEach(c => { if (isSoldOut(c)) return; if (c.sym === 'BTC') { n.hold++; return; } const i = signalInfo(c, { reinforce: v.reinforce, sell: v.sell, smart }); n[i.action]++; if (i.why === 'weak' || i.why === 'strong') changed++; });
  const f = x => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x) + '%';
  box.innerHTML = `<div>${SamsamUI.dot('grey')}Hold: above ${f(v.reinforce)} — <b>${n.hold}</b> coins</div><div>${SamsamUI.dot('green')}Reinforce: ${f(v.reinforce)} to ${f(v.sell)} — <b>${n.reinforce}</b> coins</div><div>${SamsamUI.dot('red')}Sell / Convert: below ${f(v.sell)} — <b>${n.convert}</b> coins</div>` + (smart ? `<div class="sg-sm">${SamsamUI.ic('sparkles')}Smart keeps <b>${changed}</b> coin${changed === 1 ? '' : 's'} on Hold</div>` : '');
}
async function saveSignalEdit() {
  const v = sgRead(); if (!v.ok) return;
  const btn = document.getElementById('sgSave'); btn.disabled = true;
  try {
    await Samsam.setSignalRules(v.reinforce === -5 && v.sell === -20 ? null : { reinforce: v.reinforce, sell: v.sell });
    const smart = document.getElementById('sgSmart').checked;
    if (smart !== (Samsam.getSignalRules().smart !== false)) await Samsam.setSignalSmart(smart);
    closeSignalEdit();
  }
  catch (e) { document.getElementById('sgPrev').innerHTML = '<span style="color:#f87171">' + SamsamUI.ic('alert') + SamsamCoins.esc((e && e.message) || e) + '</span>'; }
  finally { btn.disabled = false; }
}
// ── Compact bar ──
(function () {
  const bar = document.getElementById('miniBar'), head = document.getElementById('appHead');
  if (!bar || !head || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(([e]) => { const on = !e.isIntersecting && e.boundingClientRect.top < 0; bar.classList.toggle('show', on); bar.setAttribute('aria-hidden', on ? 'false' : 'true'); bar.querySelector('button').tabIndex = on ? 0 : -1; },
    { threshold: 0, rootMargin: '-40px 0px 0px 0px' }).observe(head);
})();
function renderMiniBar() {
  const t = document.getElementById('miniTotal'), p = document.getElementById('miniPnl'); if (!t) return;
  t.textContent = document.getElementById('totalUsd').textContent;
  const ap = allTimeProfitData();
  p.textContent = (ap.total >= 0 ? '+' : '−') + SamsamFmt.usd(Math.abs(ap.total)) + ' · ' + (ap.pct >= 0 ? '+' : '−') + Math.abs(ap.pct).toFixed(2) + '%';
  p.className = 'mini-pnl ' + (ap.total >= 0 ? 'pos' : 'neg'); p.title = 'All Time Profit';
}

// ── Baseline editor ──
const BL_DEFAULT = { date: '2026-10-15', btcPrice: 81162 };
let blFetchSeq = 0, blSource = 'coingecko';
function openBaselineEdit() {
  if (!requireCloud()) return;
  const d = document.getElementById('blDate'), p = document.getElementById('blPrice');
  d.max = new Date().toISOString().slice(0, 10);
  d.value = baselineState.date; p.value = fmtInput(baselineState.btcPrice); blSource = baselineState.source === 'manual' ? 'manual' : 'coingecko';
  document.getElementById('blSrc').textContent = baselineState.isDefault ? 'Original baseline' : (blSource === 'manual' ? 'Entered by hand' : 'From CoinGecko (daily price, 00:00 UTC)');
  document.getElementById('blSrc').className = 'bl-src';
  document.getElementById('blReset').style.display = baselineState.isDefault ? 'none' : '';
  document.getElementById('blModal').classList.add('show');
  blPreview(); setTimeout(() => d.focus(), 30);
  document.addEventListener('keydown', blKey, true);
}
function closeBaselineEdit() { document.getElementById('blModal').classList.remove('show'); document.removeEventListener('keydown', blKey, true); blFetchSeq++; }
function blKey(e) { if (e.key === 'Escape' && !document.querySelector('.cph')) { e.preventDefault(); closeBaselineEdit(); } }
document.getElementById('blModal').addEventListener('click', e => { if (e.target.id === 'blModal') closeBaselineEdit(); });
async function blDateChanged() {
  const date = document.getElementById('blDate').value, src = document.getElementById('blSrc');
  if (!date) return blPreview();
  if (date === BL_DEFAULT.date) { document.getElementById('blPrice').value = fmtInput(BL_DEFAULT.btcPrice); blSource = 'coingecko'; src.textContent = 'Original baseline'; src.className = 'bl-src'; return blPreview(); }
  const seq = ++blFetchSeq; src.textContent = 'Looking up BTC price on ' + fmtBaselineDay(date) + '…'; src.className = 'bl-src';
  blPreview(true);
  try {
    const price = await Samsam.fetchBtcPriceOn(date);
    if (seq !== blFetchSeq) return;
    document.getElementById('blPrice').value = fmtInput(price); blSource = 'coingecko';
    src.textContent = 'From CoinGecko (daily price, 00:00 UTC) — you can change it';
  } catch (e) {
    if (seq !== blFetchSeq) return;
    src.textContent = 'Couldn’t look it up (' + (e && e.message || 'network') + ') — type the price yourself'; src.className = 'bl-src err';
    document.getElementById('blPrice').value = ''; blSource = 'manual'; document.getElementById('blPrice').focus();
  }
  blPreview();
}
function blPriceTyped() { blSource = 'manual'; blFetchSeq++; const s = document.getElementById('blSrc'); s.textContent = 'Entered by hand'; s.className = 'bl-src'; blPreview(); }
function blUseDefault() { document.getElementById('blDate').value = BL_DEFAULT.date; blDateChanged(); }
// Your own BTC price on that day: the average price of the BTC you held at the end of the chosen date
// (opening position + buys up to that day). A market's daily price is an average of the whole day; what you
// actually paid at a given hour and minute can be higher or lower — this lets you use your real price.
function blMyBtcPrice(date) {
  const st = Samsam.getState(), doc = st.coins.find(c => c.sym === 'BTC');
  if (!doc || !date) return null;
  const end = date + 'T23:59:59.999Z';
  const r = Samsam.core.replay(doc.opening, st.transactions.filter(t => t.sym === 'BTC' && String(t.date) <= end));
  return r.qty > 0 && r.avg > 0 ? Math.round(r.avg * 100) / 100 : null;
}
function blRenderMine() {
  const b = document.getElementById('blMine'), d = document.getElementById('blDate').value, p = blMyBtcPrice(d);
  if (!p) { b.hidden = true; return; }
  b.hidden = false; b.dataset.price = p;
  b.innerHTML = `Use my BTC buy price on that day: <b>$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>`;
  const cur = parseFloat(String(document.getElementById('blPrice').value).replace(/[$,\s]/g, ''));
  b.setAttribute('aria-pressed', String(Math.abs(cur - p) < 0.005));
}
function blUseMine() {
  const p = Number(document.getElementById('blMine').dataset.price); if (!(p > 0)) return;
  blFetchSeq++; document.getElementById('blPrice').value = fmtInput(p); blSource = 'manual';
  const s = document.getElementById('blSrc'); s.textContent = 'Your own BTC average buy price on that day'; s.className = 'bl-src';
  blPreview();
}
function blRead() {
  const date = document.getElementById('blDate').value;
  const price = parseFloat(String(document.getElementById('blPrice').value).replace(/[$,\s]/g, ''));
  return { date, price, ok: /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= new Date().toISOString().slice(0, 10) && price > 0 };
}
// Before saving, show exactly what changes: the BTC reference price, how far every coin's Portfolio vs BTC moves.
function blPreview(loading) {
  try { blRenderMine(); } catch (_) {}
  const r = blRead(), el = document.getElementById('blPrev'), save = document.getElementById('blSave');
  const same = r.ok && r.date === baselineState.date && Math.abs(r.price - baselineState.btcPrice) < 0.005;
  save.disabled = !r.ok || same || !!loading;
  if (loading) { el.innerHTML = '<span class="bl-same">Looking up the price…</span>'; return; }
  if (!r.ok) { el.innerHTML = '<span class="bl-same">Pick a date (not in the future) and a BTC price above 0.</span>'; return; }
  if (same) { el.innerHTML = '<span class="bl-same">This is the baseline you have now.</span>'; return; }
  const oldB = baselineState.btcPrice;
  const usd = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Exactly which coins move, and by how much: recompute Portfolio vs BTC with the new reference price
  let moved = '';
  try {
    const st = Samsam.getState(), prices = {}; portfolio.forEach(c => { prices[c.sym] = c.sym === 'BTC' ? btcPrice : c.currentPrice; });
    const o = { prices, btcNow: btcPrice, btcAt: Samsam.core.btcPriceLookup(perfSnapsState) };
    const a = Samsam.core.vsBtcByCoin(st.coins, st.transactions, { ...o, baselineBtc: oldB }), b = Samsam.core.vsBtcByCoin(st.coins, st.transactions, { ...o, baselineBtc: r.price });
    const d = Object.keys(b).filter(k => a[k] && b[k] && Math.abs(b[k].pct - a[k].pct) >= 0.05).map(k => b[k].pct - a[k].pct);
    moved = d.length ? `<b>Portfolio vs BTC</b> changes for <b>${d.length}</b> coin${d.length > 1 ? 's' : ''} you held on that date (about ${d[0] >= 0 ? '+' : '−'}${Math.abs(d.reduce((x, y) => x + y, 0) / d.length).toFixed(1)} pts).<br>` : 'No coin\'s Portfolio vs BTC changes.<br>';
  } catch (_) {}
  el.innerHTML = `BTC reference price: <b>${usd(oldB)}</b> → <b>${usd(r.price)}</b><br>` + moved +
    `<span class="bl-same">Holdings, transactions, All Time Profit and signals stay the same.</span>`;
}
async function saveBaselineEdit() {
  const r = blRead(); if (!r.ok) return;
  const btn = document.getElementById('blSave'); btn.disabled = true;
  // Saved on this device at once and synced to the cloud (offline too); only a refused value keeps the dialog open.
  let failed = null;
  cloudWrite(Samsam.setBaseline({ date: r.date, btcPrice: r.price, source: blSource })).catch(e => { failed = e; });
  await new Promise(res => setTimeout(res, 0));
  if (!failed) { closeBaselineEdit(); return; }
  const s = document.getElementById('blSrc'); s.textContent = 'Not saved: ' + (failed.message || failed); s.className = 'bl-src err'; btn.disabled = false;
}
