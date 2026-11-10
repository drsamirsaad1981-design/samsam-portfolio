// samsam-coinpage.js — a coin's own screen (#holdings/SYM): its transactions (History), the Mining / Staking / Airdrop tag,
// automatic staking's Change / Stop, delete, Edit opening position, the type / coin pickers, the coin's note, and the
// older History window. Loaded right after samsam-home.js, whose data (portfolio, transactions…) and routing
// (openCoinTx / closeCoinTx) it uses. Moved out of samsam-home.js as it was.
// ── Transaction History ───────────────────────────────
let _histSym = null;

function openHistory(sym) {
  _histSym = sym;
  document.getElementById('histSym').textContent = sym;
  renderHistory();
  document.getElementById('historyModal').classList.add('active');
}
function closeHistory() {
  document.getElementById('historyModal').classList.remove('active');
  _histSym = null;
}

function renderHistory() {
  const sym = _histSym;
  if (!sym) return;
  const txs = getTxForSym(sym);
  const coin = portfolio.find(c => c.sym === sym);
  const fmtN = n => n < 1 ? n.toFixed(6) : n < 10 ? n.toFixed(4) : n.toFixed(2);
  const fmtDate = d => {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) + ' ' +
           dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  };
  const perTx = realizedState.perTx || {};

  // Summary bar — realized P&L uses the average cost at the time of each sale
  const sumEl = document.getElementById('histSummary');
  const sells = txs.filter(t=>t.type==='sell');
  const totalBuys  = txs.filter(t=>t.type==='buy').reduce((s,t)=>s+t.qty-(+t.fee||0),0);   // what arrived (after a fee in coins)
  const totalSells = sells.reduce((s,t)=>s+t.qty,0);
  const realized   = sells.reduce((s,t)=>s+((perTx[t.id]&&perTx[t.id].realized)||0),0);
  const curQty = coin ? coin.qty : 0;
  const avgCost= coin ? coin.basePrice : 0;
  sumEl.innerHTML = `
    <div><span>Transactions</span> <strong>${txs.length}</strong></div>
    <div><span>Total Bought</span> <strong style="color:#22c55e">${fmtN(totalBuys)} ${sym}</strong></div>
    <div><span>Total Sold</span> <strong style="color:#ef4444">${fmtN(totalSells)} ${sym}</strong></div>
    <div><span>${SAMSAM_LABELS.AMOUNT}</span> <strong>${fmtN(curQty)} ${sym}</strong></div>
    <div><span>${SAMSAM_LABELS.AVG_BUY_PRICE}</span> <strong>${SamsamFmt.price(avgCost)}</strong></div>
    <div><span>Realized Profit</span> <strong style="color:${realized>=0?'#22c55e':'#ef4444'}">${sells.length?(realized>=0?'+':'-')+SamsamFmt.usd(Math.abs(realized)):'—'}</strong></div>`;

  // Transaction list
  const listEl = document.getElementById('histList');
  if(txs.length === 0) {
    listEl.innerHTML = '<div class="tx-empty">No transactions recorded yet.<br><small>Future Buy/Sell operations will appear here.</small></div>';
    return;
  }
  listEl.innerHTML = [...txs].reverse().map(t => {
    const meta = `<div class="tx-meta">${fmtDate(t.date)}${t.note?' · '+String(t.note).replace(/</g,'&lt;'):''}</div>`;
    if (t.type === 'transfer_in' && t.kind === 'reward') {
      const q = t.qty - (+t.fee || 0);
      return `<div class="tx-row tx-tin">
        <div class="tx-details"><span class="tx-type-badge">${SamsamUI.dot('purple')}${t.src === 'mining' ? 'MINING' : t.src === 'airdrop' ? 'AIRDROP' : 'REWARD'}</span>
          <div><strong>+${fmtN(q)} ${t.sym}</strong> at <strong>$0 cost</strong></div>${meta}</div>
        <button class="tx-delete-btn" onclick="deleteTx('${t.id}')">${SamsamUI.ic('trash')}Delete</button>
      </div>`;
    }
    if (t.type === 'transfer_in' || t.type === 'transfer_out') {
      const isIn = t.type === 'transfer_in', fee = +t.fee || 0;
      return `<div class="tx-row tx-${isIn ? 'tin' : 'tout'}">
        <div class="tx-details"><span class="tx-type-badge">${isIn ? SamsamUI.dot('blue') + 'TRANSFER IN' : SamsamUI.dot('orange') + 'TRANSFER OUT'}</span>
          <div><strong>${isIn ? '+' : '-'}${fmtN(isIn ? t.qty - fee : t.qty + fee)} ${t.sym}</strong>${isIn ? ` @ <strong>$${t.price.toFixed(4)}</strong>` : ''}${fee ? ` · fee ${fmtN(fee)} ${t.sym}` : ''}</div>${meta}</div>
        <button class="tx-delete-btn" onclick="deleteTx('${t.id}')">${SamsamUI.ic('trash')}Delete</button>
      </div>`;
    }
    if (t.type === 'adjust') {
      const parts = [];
      if (t.setQty != null) parts.push(`${SAMSAM_LABELS.AMOUNT} set to <strong>${fmtN(+t.setQty)} ${t.sym}</strong>`);
      if (t.setAvg != null) parts.push(`${SAMSAM_LABELS.AVG_BUY_PRICE} set to <strong>${SamsamFmt.price(+t.setAvg)}</strong>`);
      return `<div class="tx-row tx-adjust">
        <div class="tx-details"><span class="tx-type-badge">${SamsamUI.icon('pencil')} EDIT</span><div>${parts.join(' · ')}</div>${meta}</div>
        <button class="tx-delete-btn" onclick="deleteTx('${t.id}')">${SamsamUI.ic('trash')}Delete</button>
      </div>`;
    }
    const isBuy = t.type === 'buy';
    const pnl = isBuy ? null : (perTx[t.id] ? perTx[t.id].realized : null);
    const pnlStr = pnl !== null && pnl !== undefined
      ? `<div style="font-size:0.72rem;margin-top:2px;color:${pnl>=0?'#22c55e':'#ef4444'}">${pnl>=0?'Profit':'Loss'}: ${pnl>=0?'+':'-'}${SamsamFmt.usd(Math.abs(pnl))}</div>`
      : '';
    return `<div class="tx-row tx-${t.type}">
      <div class="tx-details">
        <span class="tx-type-badge">${isBuy?SamsamUI.dot('green')+'BUY':SamsamUI.dot('red')+'SELL'}</span>
        <div><strong>${fmtN(t.qty)} ${t.sym}</strong> @ <strong>$${t.price.toFixed(4)}</strong> = <strong>${SamsamFmt.usd((t.total ?? t.qty*t.price) + (isBuy ? 1 : -1) * (+t.feeUsd || 0))}</strong>${+t.feeUsd ? ` <small>(${isBuy ? 'incl.' : 'after'} fee ${SamsamFmt.usd(+t.feeUsd)})</small>` : ''}${isBuy && +t.fee ? ` <small>· fee ${fmtN(+t.fee)} ${t.sym} → ${fmtN(t.qty - t.fee)} arrived</small>` : ''}</div>
        ${pnlStr}
        ${meta}
      </div>
      <button class="tx-delete-btn" onclick="deleteTx('${t.id}')">${SamsamUI.ic('trash')}Delete</button>
    </div>`;
  }).join('');
}

// A coin you got for free (Transfer In at $0, or a Reward) → Mining / Staking / Airdrop, or back to a plain Transfer In.
// Only the label changes (Rewards & mining sorts by it) — the amount, the $0 cost and your holdings stay the same.
async function stopStaking(sym) {
  const st = Samsam.getStake && Samsam.getStake(sym); if (!st || !requireCloud()) return;
  const due = Samsam.core.stakeEarned(st.qty, st.apy, Date.now() - Date.parse(st.since));
  const ok = await CPDialog.confirm(`Stop automatic staking for ${sym}? What it earned up to now (+${parseFloat(due.toFixed(8))} ${sym}) is added as a last Staking reward. Rewards already added stay.`, { title: 'Stop staking', okText: 'Stop staking' });
  if (ok) Samsam.stopStake(sym).catch(e => CPDialog.alert('Could not stop it: ' + (e && e.message || e)));
}
function openTagMenu(btn, id) {
  const t = transactions.find(x => x.id === id);
  if (!t || !requireCloud()) return;
  const cur = t.kind === 'reward' ? (t.src || 'staking') : null;
  const go = src => Samsam.tagTx(id, src).catch(e => CPDialog.alert('Could not change it: ' + (e && e.message || e)));   // the row's label changes at once
  const opt = (s, label) => ({ icon: cur === s ? '✓' : 'coins', label, onClick: () => { if (cur !== s) go(s); } });
  CPMenu.open(btn, `This ${t.sym} came from…`, [opt('mining', 'Mining'), opt('staking', 'Staking'), opt('airdrop', 'Airdrop'),
    cur ? { divider: true } : null, cur ? { icon: 'arrowDown', label: 'Not a reward (plain Transfer In)', onClick: () => go(null) } : null]);
}

async function deleteTx(txId) {
  const tx = transactions.find(t => t.id === txId);
  if(!tx) return;
  if (!requireCloud()) return;
  const fmtN = n => n < 1 ? n.toFixed(6) : n < 10 ? n.toFixed(4) : n.toFixed(2);
  const what = tx.type === 'adjust'
    ? `this manual edit of ${tx.sym}`
    : tx.kind === 'reward' ? `this REWARD?\n\n+${fmtN(tx.qty)} ${tx.sym} at $0 cost`
    : `this ${tx.type.replace('_', ' ').toUpperCase()} transaction?\n\n${fmtN(tx.qty)} ${tx.sym}` + (tx.type === 'transfer_out' ? '' : ` @ ${SamsamFmt.price(tx.price)} = ${SamsamFmt.usd(tx.qty*tx.price)}`);
  // Warn if a later sale would then exceed the remaining holdings.
  let oversell = '';
  try {
    const st = Samsam.getState();
    const c = st.coins.find(x => x.sym === tx.sym);
    const rest = getTxForSym(tx.sym).filter(t => t.id !== txId);
    const r = Samsam.core.replay(c ? c.opening : { qty: 0, avg: 0 }, rest);
    let q = c ? c.opening.qty : 0; let bad = false;
    for (const t of rest) {
      const need = t.type === 'sell' ? t.qty : t.type === 'transfer_out' ? t.qty + (+t.fee || 0) : 0;
      if (need > q * (1 + 1e-9)) bad = true;
      q = Samsam.core.applyTx({ qty: q, avg: 0 }, t).qty;
    }
    if (bad) oversell = `\n\nNote: a later SELL would then be larger than your holdings; ${tx.sym} quantity will become ${fmtN(r.qty)}.`;
  } catch(_) {}
  // A sell whose money went into a stablecoin: that Buy goes with it (and the other way round)
  const pair = tx.link ? transactions.find(t => t.id === tx.link) : transactions.find(t => t.link === txId);
  const pairTxt = pair && pair.kind === 'pay' ? `\n\nThe ${SamsamFmt.usd(pair.qty)} ${pair.sym} it was paid with comes back (that payment is deleted too).`
    : pair && tx.kind === 'pay' ? `\n\nThis paid for buying ${fmtN(pair.qty)} ${pair.sym} — that buy is deleted too.`
    : pair ? (pair.type === 'buy'
    ? `\n\nThe ${SamsamFmt.usd(pair.qty * pair.price)} ${pair.sym} added from this sell is deleted too.`
    : `\n\nThis ${tx.sym} came from selling ${fmtN(pair.qty)} ${pair.sym} — that sell is deleted too.`) : '';
  const ok = await CPDialog.confirm(
    `${what}\nDate: ${new Date(tx.date).toLocaleDateString()}${oversell}${pairTxt}\n\n` +
    `Holdings and average cost will be recalculated automatically on all devices.`,
    { title: 'Delete transaction?', okText: 'Delete', danger: true }
  );
  if(!ok) return;
  // Holdings are re-derived from the remaining ledger (including the opening position).
  cloudWrite(pair && Samsam.deleteTxs ? Samsam.deleteTxs([txId, pair.id]) : Samsam.deleteTx(txId));
}

document.getElementById('historyModal').addEventListener('click', function(e){ if(e.target===this) closeHistory(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('historyModal').classList.contains('active') && !document.querySelector('.cph')) closeHistory(); });

// ── Coin transactions & performance ─────────────────────────────────────────
const BASELINE_DATE = '2026-10-15T00:00:00';
// ── Edit opening position ─────────────────────────────────────────────────────
function openEditOpening() {
  if (!coinTxSym || !requireCloud()) return;
  const doc = Samsam.getState().coins.find(c => c.sym === coinTxSym);
  const o = (doc && doc.opening) || { qty: 0, avg: 0 };
  const isBase = BASE_PORTFOLIO.some(b => b.sym === coinTxSym);
  document.getElementById('eopCoin').innerHTML = getCoinIcon(coinTxSym, 24) + `<span>${coinTxSym}</span><small>${COIN_NAMES[coinTxSym] || ''}</small>`;
  document.getElementById('eopQty').value = fmtInput(o.qty);
  document.getElementById('eopAvg').value = fmtInput(o.avg);
  document.getElementById('eopDate').value = (o.date || (isBase ? BASELINE_DATE : (doc && doc.addedAt) || BASELINE_DATE)).slice(0, 10);
  document.getElementById('eopErr').textContent = '';
  previewEditOpening();
  document.getElementById('eopBackdrop').classList.add('show'); document.body.classList.add('atx-open');
}
function closeEditOpening() { document.getElementById('eopBackdrop').classList.remove('show'); document.body.classList.remove('atx-open'); }
function readEditOpening() {
  const qty = parseFloat(document.getElementById('eopQty').value), avg = parseFloat(document.getElementById('eopAvg').value);
  if (!(qty >= 0) || !(avg >= 0)) return { err: 'Enter a quantity and price (0 or more).' };
  const txs = transactions.filter(t => t.sym === coinTxSym);
  const r = Samsam.core.replay({ qty, avg }, txs);
  return { qty, avg, r };
}
function previewEditOpening() {
  const x = readEditOpening(), pv = document.getElementById('eopPreview');
  if (x.err) { pv.innerHTML = ''; return; }
  const usd = n => SamsamFmt.usd(n);
  const q = n => parseFloat(n.toFixed(8)).toLocaleString('en-US', { maximumFractionDigits: 8 });
  const p = n => '$' + (+n).toLocaleString('en-US', { maximumFractionDigits: n >= 1 ? 4 : 8 });
  pv.innerHTML = `Opening cost: <b>${usd(x.qty * x.avg)}</b><br>After all transactions: <b>${q(x.r.qty)} ${coinTxSym}</b> · ${SAMSAM_LABELS.AVG_BUY_PRICE} <b>${SamsamFmt.price(x.r.avg)}</b> · ${SAMSAM_LABELS.COST_BASIS} <b>${usd(x.r.qty * x.r.avg)}</b>` +
    (transactions.some(t => t.sym === coinTxSym && t.type === 'adjust') ? '<br><span style="color:#f59e0b">' + SamsamUI.ic('alert') + 'This coin also has manual “Edit” rows; they override the result above. Delete them if they are no longer needed.</span>' : '');
}
function saveEditOpening() {
  const x = readEditOpening();
  if (x.err) { document.getElementById('eopErr').textContent = x.err; return; }
  const d = document.getElementById('eopDate').value;
  cloudWrite(Samsam.updateCoin(coinTxSym, { opening: { qty: x.qty, avg: x.avg, ...(d ? { date: d + 'T00:00:00' } : {}) } }));
  closeEditOpening();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('eopBackdrop').classList.contains('show')) closeEditOpening(); });

// Custom dropdowns (samsam-dropdown.js): same dark component on mobile (bottom sheet) and desktop (popover)
let htxTypeDD = null, htxCoinDD = null;
function ensureHtxDropdowns() {
  if (htxTypeDD) return;
  htxTypeDD = SamsamDropdown.create(document.getElementById('htxTypeDD'), {
    options: [{ value: 'all', label: SAMSAM_LABELS.ALL_TYPES }, { value: 'buy', label: SAMSAM_LABELS.BUY }, { value: 'sell', label: SAMSAM_LABELS.SELL },
      { value: 'transfer_in', label: SAMSAM_LABELS.TRANSFER_IN }, { value: 'transfer_out', label: SAMSAM_LABELS.TRANSFER_OUT }, { value: 'reward', label: 'Reward' }],
    value: 'all', ariaLabel: 'Transaction type', title: 'Transaction type', minWidth: 180,
    onChange: () => renderCoinTx(),
  });
  htxCoinDD = SamsamDropdown.create(document.getElementById('htxCoinDD'), {
    options: [], searchable: true, searchPlaceholder: 'Search coin...', ariaLabel: 'Coin', title: 'Select coin', minWidth: 200,
    onChange: v => selectCoinTx(v),
  });
}
// ⓘ popovers: tap to open on touch screens, tap outside / Esc to close; keep inside the screen
document.addEventListener('click', e => {
  const tip = e.target.closest && e.target.closest('.info-tip');
  document.querySelectorAll('.info-tip.open').forEach(t => { if (t !== tip) t.classList.remove('open'); });
  if (tip && !e.target.closest('.info-pop')) { tip.classList.toggle('open'); fitInfoPop(tip); }
});
document.addEventListener('mouseover', e => { const tip = e.target.closest && e.target.closest('.info-tip'); if (tip) fitInfoPop(tip); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.info-tip.open').forEach(t => t.classList.remove('open')); });
function fitInfoPop(tip) {
  const pop = tip.querySelector('.info-pop'); if (!pop) return;
  pop.classList.remove('edge-r');
  requestAnimationFrame(() => { const r = pop.getBoundingClientRect(); if (r.right > innerWidth - 8 || r.left < 8) pop.classList.toggle('edge-r', r.right > innerWidth - 8); });
}
let htxNoteTimer = null;
function htxNoteTyped() {
  const st = document.getElementById('htxNoteSt'); st.textContent = 'Typing…';
  clearTimeout(htxNoteTimer); htxNoteTimer = setTimeout(htxNoteSave, 1000);
}
async function htxNoteSave() {
  clearTimeout(htxNoteTimer);
  const el = document.getElementById('htxNote'), st = document.getElementById('htxNoteSt'), sym = el.dataset.sym;
  const coin = portfolio.find(c => c.sym === sym); if (!coin || !requireCloud()) return;
  const v = el.value.replace(/\s+$/, '');
  if ((coin.notes || '') === v) { if (st.textContent === 'Typing…') st.innerHTML = SamsamUI.ic('check') + 'Saved'; return; }
  st.textContent = 'Saving…';
  try { await Samsam.updateCoin(sym, { notes: v }); if (el.dataset.sym === sym) st.innerHTML = SamsamUI.ic('check') + 'Saved'; }
  catch (e) { st.innerHTML = SamsamUI.ic('alert') + 'Not saved — ' + SamsamCoins.esc((e && e.message) || e); }
}
function renderCoinTx() {
  if (!coinTxSym) return;
  const sym = coinTxSym;
  const st = window.Samsam && Samsam.isReady() ? Samsam.getState() : null;
  const listEl = document.getElementById('htxList');
  const liq = document.getElementById('htxLiqLink');
  if (liq) {   // CoinGlass maps coins with futures — the others still open it, marked "Try" (it may have none)
    const noFut = SamsamCoins.hasFutures(sym) === false;
    liq.classList.remove('off'); liq.classList.toggle('maybe', noFut);
    if (noFut) { liq.href = SamsamCoins.liqMapUrl(sym); liq.title = `${sym}: ${SamsamCoins.LIQ_MAYBE}`; liq.innerHTML = SamsamUI.ic('flame', { solo: true }) + 'Try Liq.Map' + '<span class="ext-mark">' + SamsamUI.ic('ext', { solo: true, size: 12 }) + '</span>'; }
    else { liq.href = SamsamCoins.liqMapUrl(sym); liq.title = `Open the ${sym} liquidation heatmap on CoinGlass (new tab)`; liq.innerHTML = SamsamUI.ic('flame', { solo: true }) + 'Liq.Map' + '<span class="ext-mark">' + SamsamUI.ic('ext', { solo: true, size: 12 }) + '</span>'; }
  }
  const pred = document.getElementById('htxPredLink');
  if (pred) {   // a CoinCodex page we know is the right one; otherwise a plain "No prediction" note (never a web search)
    const pc = portfolio.find(c => c.sym === sym) || {}, ok = !!SamsamCoins.ccSlug(sym, pc);
    pred.classList.toggle('off', !ok);
    if (ok) { pred.href = SamsamCoins.predictionUrl(sym, pc); pred.title = `Open the ${sym} price prediction on CoinCodex (new tab)`; pred.innerHTML = SamsamUI.ic('sparkles', { solo: true }) + 'Prediction<span class="ext-mark">' + SamsamUI.ic('ext', { solo: true, size: 12 }) + '</span>'; }
    else { pred.removeAttribute('href'); pred.title = `CoinCodex has no price prediction page for ${sym}`; pred.innerHTML = SamsamUI.ic('sparkles', { solo: true }) + 'No prediction'; }
  }
  const cmc = document.getElementById('htxCmcLink'), cmcUrl = getCoinGeckoUrl(sym), cg = /coingecko\.com/.test(cmcUrl || '');
  if (cmc) { cmc.hidden = !cmcUrl; if (cmcUrl) { cmc.href = cmcUrl; cmc.title = cg ? `${sym} isn't listed on CoinMarketCap — open it on CoinGecko (new tab)` : `Open ${sym} on CoinMarketCap (new tab)`; cmc.innerHTML = SamsamUI.ic('bar', { solo: true }) + (cg ? 'CoinGecko' : 'CMC') + '<span class="ext-mark">' + SamsamUI.ic('ext', { solo: true, size: 12 }) + '</span>'; } }
  // Coin selector (searchable): every coin you hold, largest first; current coin always listed
  ensureHtxDropdowns();
  const coins = [...portfolio].sort((a, b) => b.qty * b.currentPrice - a.qty * a.currentPrice);
  const opts = coins.map(c => c.sym);
  if (!opts.includes(sym)) opts.unshift(sym);
  const optsKey = opts.join(',') + '|' + coins.map(c => c.logoUrl ? 1 : 0).join('');
  if (htxCoinDD._key !== optsKey) {
    htxCoinDD._key = optsKey;
    htxCoinDD.setOptions(opts.map(s => ({ value: s, label: s, icon: getCoinIcon(s, 20) })));
  }
  htxCoinDD.setValue(sym);
  if (!st) { listEl.innerHTML = '<div class="htx-empty">Loading…</div>'; return; }

  const coin = portfolio.find(c => c.sym === sym);
  const doc = st.coins.find(c => c.sym === sym);
  const usd = (n, d = 2) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const priceFmt = n => SamsamFmt.price(n);
  const qtyFmt = n => parseFloat(Number(n).toFixed(8)).toLocaleString('en-US', { maximumFractionDigits: 8 });

  // ── Summary cards ──
  const qty = coin ? coin.qty : 0, avg = coin ? coin.basePrice : 0, price = coin ? coin.currentPrice : 0;
  const value = qty * price, cost = qty * avg;
  const perTx = realizedState.perTx || {};
  const coinTxs = transactions.filter(t => t.sym === sym);
  const coinSells = coinTxs.filter(t => t.type === 'sell');
  // All Time Profit for this coin — same CPProfit.calc as the header card and the Performance page
  const ap = CPProfit.calc({ value, cost,
    realized: coinSells.reduce((s, t) => s + ((perTx[t.id] && perTx[t.id].realized) || 0), 0),
    sellCount: coinSells.length, sellFees: coinSells.reduce((s, t) => s + (+t.feeUsd || 0), 0),
    soldCost: ((realizedState.bySym || {})[sym] || {}).soldCost || 0 });
  htxProfitData = ap;
  const realized = ap.realized, profit = ap.total, profitPct = ap.pct;
  const ch = coin && coin.change24h != null ? coin.change24h : null;
  const arrow = n => n >= 0 ? '▲ +' : '▼ -';   // arrow plus explicit sign: ▲ +2.45% / ▼ -1.30%
  // Holdings: value • 24h change, the amount under it (same as the main page)
  document.getElementById('htxHoldings').innerHTML = SamsamCoins.esc(usd(value)) + (ch == null ? '' : ` <span class="htx-h24 ${ch >= 0 ? 'htx-pos' : 'htx-neg'}" title="24h change">• ${ch >= 0 ? '+' : '−'}${Math.abs(ch).toFixed(2)}%</span>`);
  const h24 = document.getElementById('htxHoldings24');
  const rewQty = coinTxs.filter(t => t.type === 'transfer_in' && t.kind === 'reward').reduce((s, t) => s + (+t.qty || 0) - (+t.fee || 0), 0);
  h24.textContent = qtyFmt(qty) + ' ' + sym + (rewQty > 0 ? ` · rewards +${qtyFmt(rewQty)}` : ''); h24.className = 'htx-sub htx-muted';
  // Network & where held (the wallet check reads the coin there) — tap to change
  let netEl = document.getElementById('htxNet');
  if (!netEl && window.SamsamWallets) { netEl = document.createElement('button'); netEl.type = 'button'; netEl.id = 'htxNet'; netEl.className = 'htx-net'; h24.insertAdjacentElement('afterend', netEl); }
  if (netEl) {
    const nt = SamsamWallets.placeText(sym);
    netEl.innerHTML = SamsamUI.ic('link') + '<span>' + SamsamCoins.esc(nt || 'Set network & where held') + '</span>';
    netEl.classList.toggle('htx-net-empty', !nt); netEl.title = 'Network & where held — used by the wallet check'; netEl.onclick = () => SamsamWallets.editCoin(sym);
  }
  // Automatic staking: amount · APY · earned since the last weekly booking — Change / Stop
  let stkEl = document.getElementById('htxStake');
  const stake = Samsam.getStake ? Samsam.getStake(sym) : null;
  if (stake && !stkEl) { stkEl = document.createElement('div'); stkEl.id = 'htxStake'; stkEl.className = 'htx-stake'; document.getElementById('htxSignal').insertAdjacentElement('beforebegin', stkEl); }
  if (stkEl) {
    stkEl.hidden = !stake;
    if (stake) {
      const C = Samsam.core, due = C.stakeEarned(stake.qty, stake.apy, Date.now() - Date.parse(stake.since));
      const next = Math.max(0, Math.ceil((Date.parse(stake.since) + C.STAKE_WEEK - Date.now()) / 864e5));
      stkEl.innerHTML = `<span class="htx-stake-t">${SamsamUI.ic('coins')}<b>Staking</b> ${qtyFmt(stake.qty)} ${SamsamCoins.esc(sym)} · ${+stake.apy.toFixed(2)}% APY</span>` +
        `<span class="htx-stake-s">+${qtyFmt(due)} ${SamsamCoins.esc(sym)} earned this week · next reward ${next <= 0 ? 'today' : 'in ' + next + ' day' + (next > 1 ? 's' : '')}</span>` +
        `<span class="htx-stake-b"><button type="button" class="htx-stake-btn" onclick="CPAdd.openStake('${SamsamCoins.esc(sym)}')">${SamsamUI.ic('pencil')}Change</button>` +
        `<button type="button" class="htx-stake-btn stop" onclick="stopStaking('${SamsamCoins.esc(sym)}')">${SamsamUI.ic('x')}Stop</button></span>`;
    }
  }
  h24.onclick = rewQty > 0 && window.SamsamRewards ? () => SamsamRewards.open({ sym }) : null; h24.style.cursor = h24.onclick ? 'pointer' : '';
  h24.title = rewQty > 0 ? `${qtyFmt(rewQty)} ${sym} came from staking / mining rewards (≈ ${usd(rewQty * price)} now, $0 cost)` : '';
  // Signal (your thresholds) + why
  const sigEl = document.getElementById('htxSignal');
  if (coin) {
    const act = getAction(sym, 0, coin), pct = getCoinPct(coin);
    const lab = signalLabel(act, false), si = act === 'soldout' || sym === 'BTC' ? null : signalInfo(coin);
    const pts = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(0) + ' pts';
    const vsB = si && si.rs ? ` · vs BTC ${pts(si.rs.d30)} (30d), ${pts(si.rs.d90)} (90d)` : '';
    const smartWhy = !si ? '' : si.why === 'weak' ? ' — Smart: not adding, it keeps losing to BTC' : si.why === 'strong' ? ' — Smart: holding, it is beating BTC (the market dipped)' : si.why === 'confirmed' ? ' — confirmed vs BTC' : '';
    const why = act === 'soldout' ? 'You hold none of this coin now' : sym === 'BTC' ? 'BTC is always Hold' : `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}% vs your Avg. Buy Price${vsB}${smartWhy}`;
    sigEl.innerHTML = `<span>Signal</span><span class="action-badge action-${act}">${lab}</span><span class="htx-sig-why">${why}</span>` +
      `<button type="button" class="cp-hint" data-hint="signal" aria-label="About Signal"></button><button type="button" class="val-edit" onclick="openSignalEdit()" title="Change the Signal thresholds" aria-label="Change the Signal thresholds">${SamsamUI.icon('pencil')}</button>`;
  } else sigEl.innerHTML = '';
  // Asset Strategy & Notes: the coin's note (same one as ⋯ → Note and the 📝) — never overwritten while you type
  const nEl = document.getElementById('htxNote');
  if (nEl && (document.activeElement !== nEl || nEl.dataset.sym !== sym)) {
    if (nEl.dataset.sym !== sym) { clearTimeout(htxNoteTimer); document.getElementById('htxNoteSt').textContent = ''; }
    nEl.dataset.sym = sym; nEl.value = (coin && coin.notes) || ''; nEl.disabled = !coin;
  }
  const pEl = document.getElementById('htxProfit');
  CPProfit.bind(pEl.parentElement, () => htxProfitData, () => ({ scope: coinTxSym }));
  pEl.textContent = (profit >= 0 ? '+' : '-') + usd(Math.abs(profit));
  pEl.className = 'htx-value ' + (profit >= 0 ? 'htx-pos' : 'htx-neg');
  const ppEl = document.getElementById('htxProfitPct');
  ppEl.textContent = arrow(profit) + Math.abs(profitPct).toFixed(2) + '%' + (realized ? ` · realized ${realized >= 0 ? '+' : '-'}${usd(Math.abs(realized))}` : '');
  ppEl.className = 'htx-sub ' + (profit >= 0 ? 'htx-pos' : 'htx-neg');
  document.getElementById('htxAvg').textContent = avg > 0 && !isSoldOut(coin) ? priceFmt(avg) : '—';
  document.getElementById('htxCost').textContent = usd(cost);

  // ── History: opening position + every recorded transaction, newest first ──
  const entries = [];
  const open = doc && doc.opening;
  if (open && open.qty > 0) {
    const isBase = BASE_PORTFOLIO.some(b => b.sym === sym);
    const oDate = open.date || (isBase ? BASELINE_DATE : (doc.addedAt || BASELINE_DATE));
    entries.push({ kind: 'buy', label: 'Buy', opening: true, note: (isBase && !open.date ? 'Opening position (Oct-15 start)' : 'Opening position') + ' · @ ' + priceFmt(open.avg),
      date: oDate, qty: open.qty, usd: open.qty * open.avg, order: '' });
  }
  coinTxs.forEach(t => {
    if (t.type === 'buy' || t.type === 'sell') {
      const r = perTx[t.id];
      const feeU = +t.feeUsd || 0;   // buy: added to the cost · sell: taken off the proceeds
      const feeQ = t.type === 'buy' ? (+t.fee || 0) : 0;   // buy: coins taken as a fee / network fee to your wallet
      entries.push({ id: t.id, kind: t.type, label: t.type === 'buy' ? 'Buy' : t.kind === 'pay' ? 'Paid' : 'Sell', qty: t.qty - feeQ, usd: (t.total ?? t.qty * t.price) + (t.type === 'buy' ? feeU : -feeU),
        note: (t.note ? t.note + ' · ' : '') + '@ ' + priceFmt(t.price) + (feeU ? ' · fee ' + usd(feeU) : '') + (feeQ ? ' · fee ' + qtyFmt(feeQ) + ' ' + sym : '') + (t.type === 'sell' && t.kind !== 'pay' && r && r.realized != null ? ` · ${r.realized >= 0 ? 'profit' : 'loss'} ${usd(Math.abs(r.realized))}` : ''),
        date: t.date, order: t.createdAt || '' });
    } else if (t.type === 'transfer_in' && t.kind === 'reward') {
      // the label already says Mining / Staking / Airdrop, so the app's own note ("Mining reward · wallet check") is shortened
      // to what it adds ("Wallet check"); a note you typed stays as it is
      const rNote = String(t.note || '').replace(/^(Staking reward|Mining reward|Airdrop)\s*(·\s*)?/i, '')
        .replace(/^wallet check$/i, 'Wallet check').replace(/^auto (\S+)$/i, 'Auto · $1 APY');
      entries.push({ id: t.id, kind: 'reward', tag: true, label: t.src === 'mining' ? 'Mining' : t.src === 'airdrop' ? 'Airdrop' : 'Staking', qty: t.qty - (+t.fee || 0), usd: (t.qty - (+t.fee || 0)) * (price || 0),
        note: [rNote, '$0\u00a0cost'].filter(Boolean).join(' · '), date: t.date, order: t.createdAt || '' });
    } else if (t.type === 'transfer_in' || t.type === 'transfer_out') {
      const isIn = t.type === 'transfer_in', fee = +t.fee || 0;
      entries.push({ id: t.id, kind: t.type, tag: isIn && !(+t.price > 0), label: isIn ? SAMSAM_LABELS.TRANSFER_IN : SAMSAM_LABELS.TRANSFER_OUT,
        qty: isIn ? t.qty - fee : t.qty + fee, usd: isIn ? t.qty * t.price : (t.qty + fee) * (price || 0),
        note: [t.note, isIn && t.price ? '@ ' + priceFmt(t.price) : '', fee ? 'fee ' + qtyFmt(fee) + ' ' + sym : ''].filter(Boolean).join(' · '),
        date: t.date, order: t.createdAt || '' });
    } else if (t.type === 'adjust') {
      const parts = [];
      if (t.setQty != null) parts.push(SAMSAM_LABELS.AMOUNT + ' → ' + qtyFmt(t.setQty) + ' ' + sym);
      if (t.setAvg != null) parts.push(SAMSAM_LABELS.AVG_BUY_PRICE + ' → ' + priceFmt(+t.setAvg));
      entries.push({ id: t.id, kind: 'adjust', label: 'Edit', note: (t.note || 'Manual edit') + (parts.length ? ' · ' + parts.join(', ') : ''), date: t.date, order: t.createdAt || '' });
    }
  });
  const type = htxTypeDD.value;
  const shown = entries.filter(e => type === 'all' || e.kind === type || (type === 'transfer' && e.kind.startsWith('transfer')))
    .sort((a, b) => (b.date + b.order).localeCompare(a.date + a.order));
  if (!shown.length) {
    const tName = { all: '', buy: 'Buy ', sell: 'Sell ', reward: 'Reward ', transfer_in: SAMSAM_LABELS.TRANSFER_IN + ' ', transfer_out: SAMSAM_LABELS.TRANSFER_OUT + ' ' }[type] || '';
    listEl.innerHTML = `<div class="htx-empty">No ${tName}transactions for ${sym} yet.<br><small>Tap + to add one.</small></div>`;
    return;
  }
  const icon = getCoinIcon(sym, 30);
  let lastDay = '', html = '';
  shown.forEach(e => {
    const day = new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (day !== lastDay) { html += `<div class="htx-date">${day}</div>`; lastDay = day; }
    const plus = e.kind === 'buy' || e.kind === 'transfer_in' || e.kind === 'reward';
    const qCls = { buy: 'htx-pos', sell: 'htx-neg', transfer_in: 'htx-in', transfer_out: 'htx-out', reward: 'htx-rew' }[e.kind];
    const amt = e.kind === 'adjust' ? '' :
      `<div class="htx-row-qty ${qCls}">${plus ? '+' : '-'}${qtyFmt(e.qty)} ${sym}</div><div class="htx-row-usd">${usd(e.usd)}</div>`;
    html += `<div class="htx-row">
      <span class="htx-row-icon">${icon}</span>
      <div class="htx-row-main"><div class="htx-row-type"><span class="htx-dot htx-dot-${e.kind}"></span>${e.label}</div><div class="htx-row-note">${String(e.note).replace(/</g, '&lt;')}</div></div>
      <div class="htx-row-amt">${amt}</div>
      <div class="htx-row-act">${e.opening
        ? `<button type="button" class="htx-act htx-edit" onclick="openEditOpening()" title="Edit opening position" aria-label="Edit opening position">${SamsamUI.icon('pencil')}</button>`
        : (e.tag ? `<button type="button" class="htx-act htx-tag" onclick="openTagMenu(this,'${e.id}')" title="Mark as Mining / Staking / Airdrop" aria-label="Mark this ${e.label} as Mining, Staking or Airdrop">${SamsamUI.ic('coins', { solo: true })}</button>` : '') +
          `<button type="button" class="htx-act" onclick="deleteTx('${e.id}')" title="Delete" aria-label="Delete this ${e.label}">${SamsamUI.ic('trash', { solo: true })}</button>`}</div>
    </div>`;
  });
  listEl.innerHTML = html;
}
