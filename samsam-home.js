// samsam-home.js — the main page (index.html): portfolio, holdings, charts, AI report… (moved out of index.html as it was).
const COIN_COLORS = SamsamCoins.COLORS;   // shared: samsam-coins.js

// CoinGecko image URLs (thumb size ~50px, works cross-origin)
const COIN_ICONS = SamsamCoins.ICONS;   // shared: samsam-coins.js
function getCoinGeckoUrl(sym) {
  const coin = portfolio.find(c => c.sym === sym);
  return SamsamCoins.cgUrl(sym, coin && coin.cgId);   // shared: samsam-coins.js
}
function getCoinIcon(sym, size=36) {
  // Check coin object for saved logoUrl (manually added coins)
  const coin = portfolio.find(c => c.sym === sym);
  const url = (coin && coin.logoUrl) || COIN_ICONS[sym];
  if (url) {
    return `<img src="${url}" width="${size}" height="${size}" data-sym="${sym}" data-size="${size}" style="border-radius:50%;flex-shrink:0;object-fit:contain;background:transparent" onerror="coinImgErr(this)">`;
  }
  return coinFallback(sym, size);
}
function getCoinIconLinked(sym, size=36) {
  const url = getCoinGeckoUrl(sym);
  const icon = getCoinIcon(sym, size);
  if (!url) return icon;
  return `<a href="${url}" target="_blank" rel="noopener" title="Open ${sym} on CoinMarketCap" style="display:inline-flex;flex-shrink:0;border-radius:50%;text-decoration:none;transition:opacity 0.15s" onmouseover="this.style.opacity='0.75'" onmouseout="this.style.opacity='1'">${icon}</a>`;
}
// Category tag (colour + label from samsam-taxonomy.js); click filters by that category
function catTag(cat, sym) {
  const k = cat || 'other', L = SamsamTaxonomy.label(k);
  if (!sym) return `<button type="button" class="cat-tag" style="--cat-c:${SamsamTaxonomy.color(k)}" onclick="event.stopPropagation();setCatFilter('${k}')" title="Show only ${L}">${L}</button>`;
  // On coin cards / rows the whole tag (and its pencil) opens "Change category" — easy to tap on a phone
  const tag = `<button type="button" class="cat-tag" style="--cat-c:${SamsamTaxonomy.color(k)}" onclick="event.stopPropagation();openCatEdit('${sym}')" title="${L} — tap to change the category of ${sym}" aria-label="Category ${L} — change for ${sym}">${L}</button>`;
  return `<span class="category-badge-editable">${tag}<button type="button" class="cat-edit" onclick="event.stopPropagation();openCatEdit('${sym}')" title="Change the category of ${sym}" aria-label="Change the category of ${sym}">${SamsamUI.icon('pencil')}</button></span>`;
}
// Category choice (fillCatSelect / syncCatCustom / readCatChoice): shared samsam-add.js
// "⋯" on a coin card / table row: the less-used actions, in one menu (bottom sheet on phones)
// Asset cell for the table and the cards: logo · symbol ↗ (📝 when there's a note) / price • 24h ✏️ / category
function assetHtml(c, below) {
  const esc = SamsamCoins.esc, note = (c.notes || '').trim();
  const noteBtn = note ? `<button type="button" class="note-dot" onclick="event.stopPropagation();editNote('${c.sym}')" title="${esc(note)}" aria-label="Note for ${c.sym}: ${esc(note)}">${SamsamUI.ic('note', { solo: true })}</button>` : '';
  return SamsamCoins.assetCell(c.sym, { price: c.currentPrice, change24h: c.change24h, logoUrl: c.logoUrl, cgId: c.cgId, size: 36, badge: noteBtn,
    after: `<button type="button" class="val-edit price-edit" onclick="promptPrice('${c.sym}')" title="Set a manual price (only used when there is no live market price)" aria-label="Set a manual price for ${c.sym}">${SamsamUI.icon('pencil')}</button>`, below });
}
// Notes live in the ⋯ menu (📝 next to the symbol shows there is one; tap it to read or edit)
async function editNote(sym) {
  if (!requireCloud()) return;
  const c = portfolio.find(x => x.sym === sym); if (!c) return;
  const v = await CPDialog.prompt(`A private note for ${sym}. Leave it empty to remove it.`, { title: `Note — ${sym}`, icon: 'note', value: c.notes || '', okText: 'Save' });
  if (v === null || v === undefined) return;
  updateNote(sym, String(v).trim());
}
function openCoinMenu(btn, sym) {
  const c = portfolio.find(x => x.sym === sym) || { sym };
  CPMenu.open(btn, `${sym} — more actions`, [
    { icon: 'arrowDown', label: SAMSAM_LABELS.TRANSFER_IN, onClick: () => openTransferIn(sym) },
    { icon: 'arrowUp', label: SAMSAM_LABELS.TRANSFER_OUT, onClick: () => openTransferOut(sym) },
    { icon: 'coins', label: 'Reward (staking)', onClick: () => openAddTx('reward', sym) },
    { icon: 'history', label: 'History', onClick: () => openHistory(sym) },
    { icon: 'note', label: (c.notes || '').trim() ? 'Edit Note' : 'Add Note', onClick: () => editNote(sym) },
    { divider: true },
    SamsamCoins.hasFutures(sym) === false ? null : { icon: 'flame', label: 'Liquidation Map', href: SamsamCoins.liqMapUrl(sym) },
    SamsamCoins.ccSlug(sym, c) ? { icon: 'sparkles', label: 'Price Prediction', href: SamsamCoins.predictionUrl(sym, c) } : null,   // only a CoinCodex page we know — never a web search
    { divider: true },
    { icon: 'trash', label: 'Remove', danger: true, onClick: () => removeCoin(sym) },
  ]);
}
// Change category: the shared dialog in samsam-add.js (openCatEdit / saveCatEdit / closeCatEdit) — same on Accumulation
function getCoinNameLinked(sym) {
  const url = getCoinGeckoUrl(sym);
  const name = COIN_NAMES[sym] || '';
  const symHtml = `<div style="font-weight:700;font-size:0.85rem">${sym}${url ? SamsamCoins.EXT : ''}</div>`;
  const nameHtml = `<div style="font-size:0.72rem;color:var(--fg2)">${name}</div>`;
  if (!url) return `<div>${symHtml}${nameHtml}</div>`;
  return `<a class="ext-link" href="${url}" target="_blank" rel="noopener" title="Open ${sym} on CoinMarketCap" style="text-decoration:none;color:inherit;display:block;transition:opacity 0.15s" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">${symHtml}${nameHtml}</a>`;
}
function coinFallback(sym, size) {
  const color = COIN_COLORS[sym] || '#6b7280';
  const letter = sym.slice(0,3);
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.32)}px;font-weight:700;color:#fff;flex-shrink:0;letter-spacing:-1px">${letter}</div>`;
}
function coinImgErr(el) {
  const sym = el.getAttribute('data-sym');
  const size = parseInt(el.getAttribute('data-size')) || 32;
  if (!el.parentNode) return; // image was re-rendered away before it failed
  el.outerHTML = coinFallback(sym, size);
}
const COIN_NAMES = SamsamCoins.NAMES;   // shared: samsam-coins.js

const BASE_PORTFOLIO = [
  { sym:'BTC',     qty:0.01304,        basePrice:80980.29, walletValue:1056.09, cat:'btc' },
  { sym:'TAO',     qty:1.0985,         basePrice:270.90,   walletValue:297.58,  cat:'ai' },
  { sym:'SUI',     qty:251.50,         basePrice:1.0251,   walletValue:257.82,  cat:'layer1' },
  { sym:'NEAR',    qty:60.15,          basePrice:4.745,    walletValue:285.49,  cat:'layer1' },
  { sym:'SEI',     qty:4558.67,        basePrice:0.065,    walletValue:296.31,  cat:'layer1' },
  { sym:'ATOM',    qty:160.12,         basePrice:1.721,    walletValue:275.64,  cat:'layer1' },
  { sym:'APT',     qty:300.11,         basePrice:0.7965,   walletValue:239.04,  cat:'layer1' },
  { sym:'AVAX',    qty:26.46,          basePrice:9.760,    walletValue:258.32,  cat:'layer1' },
  { sym:'ICP',     qty:100.09,         basePrice:2.967,    walletValue:297.05,  cat:'layer1' },
  { sym:'KSM',     qty:55.02,          basePrice:4.436,    walletValue:244.09,  cat:'layer1' },
  { sym:'GRAM',    qty:175.61,         basePrice:1.350,    walletValue:237.14,  cat:'layer1' },
  { sym:'NIGHT',   qty:5070.91,        basePrice:0.04333,  walletValue:219.72,  cat:'layer1' },
  { sym:'BNB',     qty:0.007984,       basePrice:729.82,   walletValue:5.826,   cat:'layer1' },
  { sym:'ARB',     qty:1357.31,        basePrice:0.1791,   walletValue:243.09,  cat:'layer2' },
  { sym:'ETH',     qty:0.01536,        basePrice:2432.00,  walletValue:37.37,   cat:'layer1' },
  { sym:'MOVR',    qty:174.83,         basePrice:1.374,    walletValue:240.27,  cat:'layer2' },
  { sym:'GLMR',    qty:21170.56,       basePrice:0.0102,   walletValue:216.00,  cat:'layer2' },
  { sym:'OP',      qty:1821.06,        basePrice:0.1344,   walletValue:244.93,  cat:'layer2' },
  { sym:'WLD',     qty:468.38,         basePrice:0.4808,   walletValue:225.19,  cat:'ai' },
  { sym:'SOL',     qty:2.546,          basePrice:104.58,   walletValue:266.30,  cat:'layer1' },
  { sym:'PYTH',    qty:2716.54,        basePrice:0.08232,  walletValue:223.62,  cat:'infra' },
  { sym:'JUP',     qty:741.31,         basePrice:0.3086,   walletValue:228.76,  cat:'defi' },
  { sym:'RENDER',  qty:114.21,         basePrice:1.873,    walletValue:214.01,  cat:'ai' },
  { sym:'QNT',     qty:1.194,          basePrice:205.15,   walletValue:244.96,  cat:'infra' },
  { sym:'HBAR',    qty:3008.57,        basePrice:0.08415,  walletValue:253.20,  cat:'layer1' },
  { sym:'DOGE',    qty:2769.22,        basePrice:0.0809,   walletValue:224.02,  cat:'meme' },
  { sym:'MON',     qty:9997.75,        basePrice:0.02317,  walletValue:231.64,  cat:'layer1' },
  { sym:'CRO',     qty:4026.12,        basePrice:0.05706,  walletValue:229.73,  cat:'layer1' },
  { sym:'XDC',     qty:6782.04,        basePrice:0.03398,  walletValue:230.52,  cat:'layer1' },
  { sym:'DOT',     qty:206.15,         basePrice:1.121,    walletValue:231.09,  cat:'layer1' },
  { sym:'LINK',    qty:20.34,          basePrice:12.35,    walletValue:251.30,  cat:'defi' },
  { sym:'ENS',     qty:40.11,          basePrice:5.660,    walletValue:227.09,  cat:'defi' },
  { sym:'STRK',    qty:2925.91,        basePrice:0.07454,  walletValue:218.12,  cat:'layer2' },
  { sym:'ONDO',    qty:486.78,         basePrice:0.4375,   walletValue:212.96,  cat:'defi' },
  { sym:'AVAIL',   qty:84648.66,       basePrice:0.002647, walletValue:224.14,  cat:'infra' },
  { sym:'KAVA',    qty:3038.55,        basePrice:0.06842,  walletValue:207.92,  cat:'defi' },
  { sym:'PONS',    qty:754.08,         basePrice:0.2998,   walletValue:226.07,  cat:'defi' },
  { sym:'MNT',     qty:452.20,         basePrice:0.5186,   walletValue:234.51,  cat:'layer2' },
  { sym:'FLR',     qty:35446.22,       basePrice:0.00663,  walletValue:235.00,  cat:'infra' },
  { sym:'KAS',     qty:6299.89,        basePrice:0.03635,  walletValue:229.00,  cat:'layer1' },
  { sym:'POL',     qty:2414.1327,      basePrice:0.09521,  walletValue:229.84,  cat:'layer2' },
  { sym:'XPL',     qty:2799.70,        basePrice:0.08056,  walletValue:225.57,  cat:'infra' },
  { sym:'VTHO',    qty:332670.85,      basePrice:0.0006003,walletValue:199.70,  cat:'layer1' },
  { sym:'VET',     qty:30476.08,       basePrice:0.006881, walletValue:209.73,  cat:'layer1' },
];

let portfolio = [];
let archivedCoins = [];
let btcPrice = 82363;
// Baseline (date + BTC price that day) — a cloud setting; Portfolio vs BTC compares against it. See samsam-hints.js → baseline.
let baselineState = { date: '2026-10-15', btcPrice: 81162, isDefault: true };
const fmtBaselineDay = iso => { const d = new Date(iso + 'T00:00:00'); return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
function renderBaselineLabel() {
  const t = fmtBaselineDay(baselineState.date);
  const a = document.getElementById('baselineLabel'); if (a) a.textContent = t;
  const f = document.getElementById('footerBaseline'); if (f) f.textContent = t;
}
let sortCol = 'currentValue';
let sortDir = 1;  // 1 = descending (highest first), -1 = ascending
let liveStatus = 'idle';
let lastFetchTime = null;

const COINGECKO_IDS = SamsamCoins.CG_IDS;   // shared: samsam-coins.js

// Alternative CoinGecko ids tried when the main id returns no price.
const ALT_CG_IDS = { PONS: ['pons'] };

const LIVE_PRICES_OCT15 = {
  BTC:82363.28, ETH:2444.58,
  SOL:105.81, BNB:718.42, TAO:276.21, SUI:0.8207, NEAR:5.252, SEI:0.06197,
  ATOM:1.739, APT:0.8207, AVAX:9.964, ICP:3.074, KSM:4.488, GRAM:1.372,
  ARB:0.1922, MOVR:1.399, GLMR:0.01038, OP:0.1413, WLD:0.5023,
  PYTH:0.09368, JUP:0.3089, RENDER:1.996, QNT:209.46, HBAR:0.08369,
  DOGE:0.08112, CRO:0.05825, XDC:0.03393, DOT:1.125, LINK:12.50,
  ENS:5.733, STRK:0.09143, ONDO:0.4600, AVAIL:0.002632, KAVA:0.069,
  MNT:0.5295, FLR:0.006713, KAS:0.03612, POL:0.09554, VTHO:0.0006441,
  VET:0.00705, NIGHT:0.04419, MON:0.02344, PONS:0.3498, XPL:0.08513,
};

const ACCUM_KEY      = 'samsam_acc_v1';      // legacy key (read only during one-time import)
const VIEW_KEY       = 'samsam_view_pref';   // cards/table view preference (per device)

// ─── Data layer ──────────────────────────────────────────────────────────────
// All portfolio data lives in the cloud (samsam-cloud.js → Firebase Firestore).
// Holdings are DERIVED from each coin's opening position + its transaction ledger
// (samsam-core.js), so every device computes identical numbers and every change
// is saved and synced automatically. Nothing here writes portfolio data to localStorage.
let transactions = [];
let customCoins = [];
let accumPlanState = [];
let realizedState = { total: 0, sellCount: 0, perTx: {} };
let perfSnapsState = [];
let holdingsSnapsState = [];
let cloudReady = false;

function whenSamsam(cb) {
  if (window.Samsam) cb(window.Samsam);
  else window.addEventListener('samsam-ready', () => cb(window.Samsam), { once: true });
}
function cloudWrite(promise) {
  // Errors are shown by the sync pill; keep a console trace for debugging.
  if (promise && promise.catch) promise.catch(e => console.error('[Portfolio] save failed', e));
  return promise;
}
function requireCloud() {
  if (!window.Samsam || !Samsam.isReady()) { CPDialog.alert('Your portfolio is still loading from the cloud. Please try again in a moment.'); return false; }
  return true;
}
function applyCloudState(d) {
  portfolio      = d.portfolio;
  portfolio.forEach(c => { if (c.name && c.name !== c.sym && !COIN_NAMES[c.sym]) COIN_NAMES[c.sym] = c.name; });
  transactions   = d.transactions;
  archivedCoins  = d.archivedCoins;
  customCoins    = d.customCoins;
  accumPlanState = d.accumPlan;
  realizedState  = d.realized;
  perfSnapsState = d.perfSnaps;
  holdingsSnapsState = d.holdingsSnaps;
  btcPrice       = d.btcPrice || btcPrice;
  if (d.baseline) { baselineState = d.baseline; renderBaselineLabel(); }
  cloudReady = true;
  renderAll();
  if (_histSym) renderHistory();
  try { renderAccumProgress(accumPlanState); } catch(_) {}
  try { drawPerfChart(); } catch(_) {}
  try { drawHoldingsChart(); } catch(_) {}
  const ov = document.getElementById('holdingsOverlay');
  if (ov && ov.style.display === 'flex') { try { if (coinTxSym) renderCoinTx(); else { drawHoldingsOverlayChart(); renderHoldingsAssetList(); } } catch(_) {} }
  lastCloudSync = new Date(); updateSyncFooter();
  takeSnapshotsIfDue();
  // Coins that arrived from the cloud without a live price on this device (e.g. a coin
  // added on another device) get priced right away instead of on the next 60 s refresh.
  const prices = Samsam.getPrices();
  applyCloudState._tried = applyCloudState._tried || new Set();
  const unpriced = portfolio.filter(c => (c.cgId || COINGECKO_IDS[c.sym]) && !(prices[c.sym] && prices[c.sym].usd > 0) && !applyCloudState._tried.has(c.sym));
  if (unpriced.length) {
    unpriced.forEach(c => applyCloudState._tried.add(c.sym)); // once per coin per visit — no request loop
    clearTimeout(applyCloudState._pt);
    applyCloudState._pt = setTimeout(fetchLivePrices, 300);
  }
}

// checked CoinMarketCap / CoinCodex page names and the futures list arrived (samsam-coins.js) → links point to the right pages
window.addEventListener('samsam-links', () => { if (!cloudReady) return; try { renderAll(); if (coinTxSym) renderCoinTx(); } catch (_) {} });
function getRemovedSyms() { return new Set(archivedCoins.map(c => c.sym)); }

function getTxForSym(sym) {
  return transactions.filter(t => t.sym === sym).sort(Samsam.core.compareTx);
}
function addTransaction(sym, type, qty, price, note) {
  return cloudWrite(Samsam.addTx(sym, type, qty, price, note));
}

// ── Realized P&L ─────────────────────────────────────────────────────────────
// Average-cost method, replayed from each coin's opening position (samsam-core.js).
function calcRealizedPnl() { return { total: realizedState.total, sellCount: realizedState.sellCount }; }
// One coin's All Time Profit = its sells (realized) + what it holds now (value − cost) — the same number as on Performance and the coin's page
function coinProfit(c) {
  const rs = (realizedState.bySym || {})[c.sym] || {};
  return CPProfit.calc({ value: c.qty * c.currentPrice, cost: c.qty * c.basePrice, realized: rs.realized, sellCount: rs.sellCount, sellFees: rs.sellFees, soldCost: rs.soldCost });
}

function getCustomSyms() {
  return new Set(customCoins.map(c => c.sym));
}

// Reset: pins every Oct-15 starting coin back to its starting quantity and average price.
// Recorded as ledger corrections, so it syncs to every device and history is preserved.
async function resetApp() {
  if (!requireCloud()) return;
  if (!(await CPDialog.confirm('Reset all starting coins to their Oct-15 quantities and prices? Your transaction history is kept.', { title: 'Reset portfolio', okText: 'Reset', danger: true }))) return;
  cloudWrite(Samsam.resetToBaseline(BASE_PORTFOLIO));
}

function calcStats() {
  const btcEntry = portfolio.find(c => c.sym === 'BTC');
  const btcQty = btcEntry ? btcEntry.qty : 0;
  const altTotal = portfolio.filter(c => c.sym !== 'BTC').reduce((s,c) => s + c.qty * c.currentPrice, 0);
  const btcValue = btcQty * btcPrice;
  return { btcQty, btcValue, altTotal, total: btcValue + altTotal };
}

// All Time Profit for the whole portfolio — the header card, the chart legend and the details sheet all read this.
let htxProfitData = null;   // the coin page's All Time Profit, read when its card is tapped
function allTimeProfitData() {
  return CPProfit.calc({ value: calcStats().total, cost: portfolio.reduce((s, c) => s + c.qty * (c.basePrice || 0), 0),
    realized: realizedState.total || 0, sellCount: realizedState.sellCount || 0, sellFees: realizedState.sellFees || 0, soldCost: realizedState.soldCost || 0 });
}

// Portfolio vs BTC per coin — "did this coin beat the same money in Bitcoin?" (samsam-core.js → vsBtcByCoin).
// Worked out once per refresh for all coins; BTC itself is always 0.
let vsBtcCache = null, vsBtcKey = '';
function vsBtcMap() {
  const st = window.Samsam && Samsam.isReady() ? Samsam.getState() : null; if (!st) return {};
  const key = [st.transactions.length, st.coins.length, btcPrice, baselineState.btcPrice, perfSnapsState.length, portfolio.map(c => c.currentPrice).join(',')].join('|');
  if (vsBtcCache && key === vsBtcKey) return vsBtcCache;
  const prices = {}; portfolio.forEach(c => { prices[c.sym] = c.sym === 'BTC' ? btcPrice : c.currentPrice; });
  vsBtcKey = key;
  return (vsBtcCache = Samsam.core.vsBtcByCoin(st.coins, st.transactions, { prices, btcNow: btcPrice, btcAt: Samsam.core.btcPriceLookup(perfSnapsState), baselineBtc: baselineState.btcPrice }));
}
function getPerf(coin) {
  const r = vsBtcMap()[coin.sym];
  return r ? r.pct : 0;
}

function getCoinPct(coin) {
  // Coin's own price change vs avg buy price (%)
  if (!coin.basePrice || coin.basePrice <= 0) return 0;
  return ((coin.currentPrice / coin.basePrice) - 1) * 100;
}

// A coin you no longer hold (everything sold or sent out): no Avg. Buy Price to compare with, nothing to sell
const isSoldOut = c => !!c && !(c.qty > 1e-12);
// One label per Signal everywhere (table, cards, coin page, CSV): short for the badges, long for exports
function signalLabel(action, long) {
  if (action === 'soldout') return long ? 'Sold out' : SamsamUI.dot('grey') + 'Sold out';
  if (action === 'convert') return long ? 'Sell / Convert to BTC' : SamsamUI.dot('red') + (long === false ? 'Sell / Convert' : 'Sell/Convert');
  if (action === 'reinforce') return long ? 'Reinforce' : SamsamUI.dot('green') + 'Reinforce';
  return long ? 'Hold' : SamsamUI.dot('grey') + 'Hold';
}
// Avg. Buy Price as shown: "—" once the coin is sold out (the old average means nothing then)
const avgShown = c => isSoldOut(c) ? '—' : SamsamFmt.price(c.basePrice);

// Signal: the coin's price vs its Avg. Buy Price with your thresholds (Signal ✏️ — defaults −5% / −20%), and with Smart on
// (the default) checked against the coin's 30 / 90 days vs BTC — samsam-core.js → signalFor (the Telegram alerts use the same).
let rsMap = {};   // 30 / 90-day strength vs BTC per CoinGecko id (m/alt.json, written by GitHub with each market snapshot)
function rsFor(c) { const id = c && (c.cgId || (SamsamCoins.CG_IDS || {})[c.sym]); return (id && rsMap[id]) || null; }
function signalRules() { return window.Samsam && Samsam.getSignalRules ? Samsam.getSignalRules() : { reinforce: -5, sell: -20, smart: true }; }
function signalInfo(coin, rules) {
  const r = rules || signalRules(), chg = getCoinPct(coin);
  if (window.Samsam && Samsam.core && Samsam.core.signalFor) return Samsam.core.signalFor({ sym: coin.sym, chg, rules: r, rs: rsFor(coin), smart: r.smart !== false });
  const a = coin.sym === 'BTC' ? 'hold' : chg < r.sell ? 'convert' : chg <= r.reinforce ? 'reinforce' : 'hold';
  return { action: a, base: a, why: null, rs: null };
}
function getAction(sym, perf, coin) {
  if (isSoldOut(coin)) return 'soldout';
  if (sym === 'BTC') return 'hold';
  if (!coin) { const r = signalRules(); return perf < r.sell ? 'convert' : perf <= r.reinforce ? 'reinforce' : 'hold'; }
  return signalInfo(coin).action;
}
// the Signal badge; when Smart changed the classic signal, a small mark and the reason on hover / long-press
function sigBadge(c, action) {
  const i = action === 'soldout' || !c || c.sym === 'BTC' ? null : signalInfo(c);
  const changed = i && (i.why === 'weak' || i.why === 'strong');
  const tip = changed ? (i.why === 'weak' ? `Smart: Hold instead of Reinforce — ${c.sym} is behind BTC over 30 and 90 days` : `Smart: Hold instead of Sell / Convert — ${c.sym} is ahead of BTC over 30 and 90 days`) : '';
  return `<span class="action-badge action-${action}${changed ? ' sig-smart' : ''}"${tip ? ` title="${SamsamCoins.esc(tip)}"` : ''}>${signalLabel(action)}${changed ? SamsamUI.ic('sparkles', { solo: true, size: 11 }) : ''}</span>`;
}
whenSamsam(() => {
  const M = window.SamsamMarket; if (!M || !M.altPage) return;
  const load = () => M.altPage().then(j => { rsMap = Samsam.core && Samsam.core.strengthMap ? Samsam.core.strengthMap(j) : {}; try { renderAll(); if (typeof coinTxSym !== 'undefined' && coinTxSym && typeof renderCoinTx === 'function') renderCoinTx(); } catch (_) {} }, () => {});
  load(); setInterval(load, 30 * 60e3);
});

// Full-precision value for editable inputs (no rounding → editing never loses digits)
function fmtInput(n) { n = Number(n) || 0; return parseFloat(n.toPrecision(12)).toString(); }

function fmt(n, dec) {
  return parseFloat(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// Until the first data arrives from the cloud, the totals show a placeholder — never a wrong "$0.00"
const HEAD_WAIT = '$—.——';
function headerWaiting() { return !portfolio.length && (!cloudReady || !(window.Samsam && Samsam.isReady && Samsam.isReady())); }   // no $0 until this page has the cloud portfolio
function renderHeader() {
  if (headerWaiting()) {
    ['totalUsd', 'totalPnlCard', 'altUsd'].forEach(id => { const e = document.getElementById(id); if (e) e.textContent = HEAD_WAIT; });
    ['totalUsdBtc', 'totalPnlSub', 'totalBtcUsd', 'altUsdBtc'].forEach(id => { const e = document.getElementById(id); if (e) e.textContent = '—'; });
    const b = document.getElementById('totalBtc'); if (b) b.textContent = '—.—— BTC';
    return;
  }
  const { btcQty, btcValue, altTotal, total } = calcStats();
  const fmtUsd = n => SamsamFmt.usd(n);
  const fmtBtc = n => (btcPrice > 0 ? parseFloat((n / btcPrice).toFixed(8)).toString() : '—') + ' BTC';

  // Card 1: Total Portfolio
  document.getElementById('totalUsd').textContent = fmtUsd(total);
  document.getElementById('totalUsdBtc').textContent = btcPrice > 0 ? '(' + fmtBtc(total) + ')' : '—';

  // Card 2: All Time Profit = Realized + Unrealized — one definition on every page (CPProfit.calc in samsam-ui.js).
  const ap = allTimeProfitData();
  const pnl = ap.total, pct = ap.pct, cost = ap.cost, realized = ap.realized;
  const sign = pnl >= 0 ? '+' : '-';
  const pnlEl = document.getElementById('totalPnlCard');
  pnlEl.textContent = sign + SamsamFmt.usd(Math.abs(pnl));
  pnlEl.className = 'stat-value ' + (pnl >= 0 ? 'stat-pos' : 'stat-neg');
  const subEl = document.getElementById('totalPnlSub');
  subEl.textContent = '(' + (pct >= 0 ? '+' : '-') + Math.abs(pct).toFixed(2) + '%)';
  subEl.classList.toggle('stat-pos', pnl >= 0); subEl.classList.toggle('stat-neg', pnl < 0);
  pnlEl.parentElement.title = 'Tap for details — Realized ' + fmtUsd(realized) + ' + Unrealized ' + fmtUsd(ap.unrealized);
  CPProfit.bind(pnlEl.parentElement, allTimeProfitData, { scope: 'Whole Portfolio' });
  try { renderMiniBar(); } catch (_) {}

  // Card 3: BTC Accumulated — strip trailing zeros, max 8 decimals
  document.getElementById('totalBtc').textContent = parseFloat(btcQty.toFixed(8)).toString() + ' BTC';
  document.getElementById('totalBtcUsd').textContent = btcPrice > 0 ? '(' + fmtUsd(btcValue) + ')' : '—';

  // Card 4: Altcoins Accumulated
  document.getElementById('altUsd').textContent = fmtUsd(altTotal);
  document.getElementById('altUsdBtc').textContent = btcPrice > 0 ? '(' + fmtBtc(altTotal) + ')' : '—';

  renderBtcTicker();
}

// ── Live BTC ticker ──────────────────────────────────────────────────────────
let btcTicker = { price: 0, ch24: null, high24: null, low24: null, t: 0 };
async function fetchBtcTicker() {
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = (await r.json())[0];
    if (d && d.current_price) {
      btcTicker = { price: d.current_price, ch24: d.price_change_percentage_24h, high24: d.high_24h, low24: d.low_24h, t: Date.now() };
      renderBtcTicker();
    }
  } catch (e) { /* keep the price from the regular price refresh */ }
}
let _tickerKey = '';
// market numbers for the ticker: cached / GitHub snapshot (no extra CoinGecko calls from Home), every 3 minutes
var tickerMkt = {};
function loadTickerMarket() {
  const M = window.SamsamMarket; if (!M) return;
  const val = p => p.then(r => r && 'data' in r ? r.data : r, () => null);
  Promise.all([val(M.global()), val(M.fng()), val(M.alt90())]).then(([g, f, alt]) => { tickerMkt = { g, f, alt }; renderBtcTicker(); });
}
loadTickerMarket(); setInterval(() => { if (!document.hidden) loadTickerMarket(); }, 3 * 60e3);
function renderBtcTicker() {
  const track = document.getElementById('btcTickerTrack');
  if (!track) return;
  const live = liveStatus !== 'error';
  const price = btcTicker.price > 0 && Date.now() - btcTicker.t < 5 * 60e3 ? btcTicker.price : btcPrice;
  const btcCoin = portfolio.find(c => c.sym === 'BTC');
  const ch = btcTicker.ch24 != null ? btcTicker.ch24 : (btcCoin && btcCoin.change24h != null ? btcCoin.change24h : null);
  const usd = n => n >= 1000 ? '$' + Math.round(n).toLocaleString('en-US') : SamsamFmt.usd(n);   // whole dollars above $1,000 (keeps the line short)
  const parts = [
    `<span class="bt-item">${SamsamUI.liveDot(live ? 'ok' : 'error', true)}<span class="bt-live">${live ? 'Live' : 'Offline'}</span></span>`,
    `<span class="bt-item">BTC / USD <strong>${price > 0 ? usd(price) : '—'}</strong></span>`,
  ];
  if (ch != null) parts.push(`<span class="bt-item"><span class="${ch >= 0 ? 'bt-up' : 'bt-down'}">${ch >= 0 ? '▲ +' : '▼ -'}${Math.abs(ch).toFixed(2)}%</span> 24h</span>`);
  // the market (same numbers as the Market tab) — any of these opens the Market tab
  const M = window.SamsamMarket, tm = tickerMkt || {}, g = tm.g, f = tm.f, a = tm.alt;
  if (M && (g || f)) {
    const go = (inner, label) => `<a class="bt-item bt-mkt" href="./market.html" title="Open the Market tab" aria-label="${label} — open the Market tab">${inner}</a>`;
    if (g) parts.push(go(`Market Cap <strong>${M.fmtBig(g.mcap)}</strong><span class="${g.mcapCh24 >= 0 ? 'bt-up' : 'bt-down'}">${g.mcapCh24 >= 0 ? '▲ +' : '▼ -'}${Math.abs(g.mcapCh24 || 0).toFixed(2)}%</span>`, 'Total market cap'));
    if (f) parts.push(go(`Fear &amp; Greed <strong style="color:${M.fngColor(f.value)}">${f.value}</strong><span class="bt-tag" style="color:${M.fngColor(f.value)}">${SamsamCoins.esc(f.label)}</span>`, 'Fear and Greed'));
    if (g) parts.push(go(`BTC Dominance <strong>${g.dom.btc.toFixed(1)}%</strong>`, 'Bitcoin dominance'));
    if (a) parts.push(go(`Altcoin Season <strong>${a.value}<span class="bt-of">/100</span></strong>`, 'Altcoin Season'));
    parts.push(go(`<span class="bt-explore">Explore ↗</span>`, 'Explore the market'));
  }
  const group = parts.join('<span class="bt-sep"></span>') + '<span class="bt-sep"></span>';
  if (group === _tickerKey) return; // unchanged → don't restart the animation
  _tickerKey = group;
  // Two identical copies → seamless loop (animation moves exactly one copy's width)
  track.innerHTML = `<div class="btc-ticker-group">${group}</div><div class="btc-ticker-group" aria-hidden="true">${group}</div>`;
  fitBtcTicker();
}
// Fits on screen → show it once, still (nothing repeated or cut). Too long → scroll, with each copy at least as
// wide as the bar so the same value is never visible twice at the same time.
function fitBtcTicker() {
  const bar = document.getElementById('btcTicker'), track = document.getElementById('btcTickerTrack');
  if (!bar || !track || !track.firstElementChild) return;
  const groups = track.querySelectorAll('.btc-ticker-group');
  groups.forEach(g => g.style.minWidth = '');
  bar.classList.remove('static');
  const fits = groups[0].scrollWidth <= bar.clientWidth - 8;   // fits → one still line; too long (now with the market) → scrolls
  bar.classList.toggle('static', fits);
  // + room for one more item, so a value leaving on the left is gone before its copy comes in on the right
  if (!fits) groups.forEach(g => g.style.minWidth = (bar.clientWidth + 200) + 'px');
  // same speed whatever the length (≈45 px a second) — easy to read while it moves
  track.style.animationDuration = fits ? '' : Math.max(20, Math.round(groups[0].getBoundingClientRect().width / 45)) + 's';
}
if (window.ResizeObserver) document.addEventListener('DOMContentLoaded', () => { const b = document.getElementById('btcTicker'); if (b) { let t; new ResizeObserver(() => { clearTimeout(t); t = setTimeout(fitBtcTicker, 80); }).observe(b); } });

let activeCatFilter = '';

function setCatFilter(cat, exact) {
  const before = activeCatFilter;
  activeCatFilter = exact ? cat : ((activeCatFilter === cat) ? '' : cat);
  // Always reset to Holdings / Current Value descending on category change
  sortCol = 'currentValue';
  sortDir = 1;
  renderSummary();
  renderTableAndStack();
  if (before !== activeCatFilter) animateCoinList();
}
// New category → the coin list slides up and fades in (cards and table rows, lightly staggered)
function animateCoinList() {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const items = [...document.querySelectorAll('#coinsStack.view-active > .coin-card, #portfolioTableWrapper.view-active #tableBody > tr')];
  items.forEach((el, i) => {
    el.classList.remove('slide-up'); void el.offsetWidth;
    el.style.animationDelay = Math.min(i, 12) * 30 + 'ms';
    el.classList.add('slide-up');
  });
}

let catPickerDD = null;
function renderSummary() {
  const T = SamsamTaxonomy;
  const catTotals = {};
  portfolio.forEach(c => { const k = c.cat || 'other'; catTotals[k] = (catTotals[k] || 0) + c.qty * c.currentPrice; });
  const allTotal = portfolio.reduce((s, c) => s + c.qty * c.currentPrice, 0);
  const dot = color => `<span class="cp-dot" style="background:${color}"></span>`;
  const keys = T.pickerKeys(catTotals);
  const options = [{ value: 'all', label: 'All Coins', sub: SamsamFmt.usd(allTotal), icon: '<span class="cp-globe">' + SamsamUI.ic('globe', { solo: true }) + '</span>' }]
    .concat(keys.map(k => ({ value: k, label: T.label(k), sub: SamsamFmt.usd(catTotals[k] || 0), icon: dot(T.color(k)) })))
    .concat([{ value: '__manage', label: 'Manage Categories', sub: 'rename · colour · add', icon: '<span class="cp-globe">' + SamsamUI.ic('pencil', { solo: true }) + '</span>' }]);
  const grid = document.getElementById('summaryGrid');
  if (!catPickerDD) {
    grid.innerHTML = '<div class="cat-picker" id="catPicker"><div id="catPickerDD"></div></div>';
    catPickerDD = SamsamDropdown.create(document.getElementById('catPickerDD'), {
      options, value: 'all', ariaLabel: 'Category', title: 'Choose a category', minWidth: 260, maxHeight: 360,
      onChange: v => {
        if (v === '__manage') { catPickerDD.setValue(activeCatFilter || 'all'); CPAdd.manageCategories(); return; }   // not a filter: opens Manage Categories
        setCatFilter(v === 'all' ? '' : v, true);
      },
    });
    const btn = catPickerDD.button;
    btn.insertAdjacentHTML('afterbegin', '<span class="cp-kicker">Category</span>');
    btn.querySelector('.sdd-chev').insertAdjacentHTML('beforebegin', '<span class="cp-val" id="catPickerVal"></span>');
  }
  const cur = activeCatFilter || 'all';
  catPickerDD.setOptions(options);
  catPickerDD.setValue(cur);
  const sel = options.find(o => o.value === cur) || options[0];
  document.getElementById('catPickerVal').textContent = sel.sub;
  document.getElementById('catPicker').style.setProperty('--cat-c', cur === 'all' ? 'var(--accent)' : T.color(cur));
}

function getFilteredSorted() {
  const filter = document.getElementById('filterAction') ? document.getElementById('filterAction').value : '';
  const search = document.getElementById('searchBox') ? document.getElementById('searchBox').value.toLowerCase() : '';

  // Top Gainers / Top Losers: sort all coins by P&L % (currentPrice vs basePrice)
  if (filter === 'gainers' || filter === 'losers') {
    let rows = portfolio.filter(c => {
      if (search && !c.sym.toLowerCase().includes(search) && !(COIN_NAMES[c.sym]||'').toLowerCase().includes(search)) return false;
      if (activeCatFilter && (c.cat || 'other') !== activeCatFilter) return false;
      return true;
    });
    // Sort by P&L%: gainers = highest profit first, losers = highest loss first
    rows.sort((a, b) => {
      const pa = a.basePrice > 0 ? (a.currentPrice - a.basePrice) / a.basePrice * 100 : 0;
      const pb = b.basePrice > 0 ? (b.currentPrice - b.basePrice) / b.basePrice * 100 : 0;
      return filter === 'gainers' ? pb - pa : pa - pb;
    });
    return rows;
  }

  let rows = portfolio.filter(c => {
    if (search && !c.sym.toLowerCase().includes(search) && !(COIN_NAMES[c.sym]||'').toLowerCase().includes(search)) return false;
    if (filter) { const perf=getPerf(c); const action=getAction(c.sym,perf,c); if(action!==filter) return false; }
    if (activeCatFilter && (c.cat || 'other') !== activeCatFilter) return false;
    return true;
  });
  rows.sort((a,b) => {
    let av, bv;
    switch(sortCol) {
      case 'qty': av=a.qty; bv=b.qty; break;
      case 'basePrice': av=a.basePrice; bv=b.basePrice; break;
      case 'currentPrice': av=a.currentPrice; bv=b.currentPrice; break;
      case 'baseValue': av=a.qty*a.basePrice; bv=b.qty*b.basePrice; break;
      case 'currentValue': av=a.qty*a.currentPrice; bv=b.qty*b.currentPrice; break;
      case 'pnl': av=coinProfit(a).total; bv=coinProfit(b).total; break;
      case 'perf': av=getPerf(a); bv=getPerf(b); break;
      case 'name': av=a.sym; bv=b.sym; return sortDir*av.localeCompare(bv);
      default: av=a.qty*a.currentPrice; bv=b.qty*b.currentPrice;
    }
    return sortDir*(bv-av);
  });
  return rows;
}

// ── Best / worst performer (24h) for the chosen category; tiny holdings are left out ──
function renderMovers() {
  const host = document.getElementById('moversCard'); if (!host) return;
  const C = SamsamCoins, T = SamsamTaxonomy;
  const total = portfolio.reduce((s, c) => s + c.qty * c.currentPrice, 0);
  const rows = portfolio.filter(c => !activeCatFilter || (c.cat || 'other') === activeCatFilter)
    .map(c => ({ sym: c.sym, logoUrl: c.logoUrl, value: c.qty * c.currentPrice, score: typeof c.change24h === 'number' ? c.change24h : NaN }));
  const m = C.pickMovers(rows, total);
  const head = { title: "Today's Movers", badge: '24h · ' + (activeCatFilter ? T.label(activeCatFilter) : 'All Coins'), hint: 'movers24h' };
  if (!m) { host.innerHTML = C.moversCard({ head, empty: activeCatFilter ? `No 24h price changes yet for ${T.label(activeCatFilter)}.` : 'Best and worst performer appear once live prices load.' }); return; }
  const half = (label, r) => r && { label, row: r, pct: r.score, text: C.signedPct(r.score), onClickJs: `openCoinFromMovers('${r.sym}')` };
  host.innerHTML = C.moversCard({ head, best: half('Best Performer', m.best), worst: half('Worst Performer', m.worst) || { label: 'Worst Performer' } });
}
function openCoinFromMovers(sym) { openHoldingsView(); openCoinTx(sym); }   // Back → Holdings list → page

// The sorted column is lit with ▲ (A→Z / lowest first) or ▼ (highest first)
function markSortedHeader() {
  document.querySelectorAll('#portfolioTable thead th[data-sort]').forEach(th => {
    const on = th.dataset.sort === sortCol, asc = th.dataset.sort === 'name' ? sortDir > 0 : sortDir < 0;
    th.classList.toggle('sorted', on);
    th.setAttribute('aria-sort', on ? (asc ? 'ascending' : 'descending') : 'none');
    th.querySelector('.th-sort').textContent = on ? (asc ? '▲' : '▼') : '';
  });
}
function renderTableAndStack() {
  renderMovers();
  const rows = getFilteredSorted();
  markSortedHeader();

  // Desktop table
  const tbody = document.getElementById('tableBody');
  if (tbody) {
    let html = '';
    rows.forEach((c,i) => {
      const perf=getPerf(c); const action=getAction(c.sym,perf,c);
      const baseVal=c.qty*c.basePrice; const curVal=c.qty*c.currentPrice;
      const color=COIN_COLORS[c.sym]||'#6b7280';
      const perfClass=perf>2?'perf-up':perf<-2?'perf-down':'perf-neutral';
      const perfSign=perf>0?'+':''; const perfIcon=perf>2?'▲':perf<-2?'▼':'—';
      const actionLabel=signalLabel(action);   // same short label as the cards
      const ap=coinProfit(c); const pnl=ap.total; const pnlPct=ap.pct;
      const pnlCls=pnl>=0?'pnl-positive':'pnl-negative'; const pnlSign=pnl>=0?'+':'';
      html += `<tr>
        <td style="text-align:left">${assetHtml(c, catTag(c.cat, c.sym))}</td>
        <td class="ro-num num-r" title="Amount changes only through Buy / Sell / Transfer">${SamsamCoins.holdCell(c.sym, curVal, c.qty)}</td>
        <td class="ro-num num-r" style="color:var(--fg2)" title="${isSoldOut(c) ? 'Sold out — no coins held' : 'Calculated from Buy / Sell / Transfer'}">${avgShown(c)}</td>
        <td class="ro-num num-r" style="color:var(--fg2)">${SamsamFmt.usd(baseVal)}</td>
        <td class="num-r"><span class="${pnlCls}" style="font-size:0.82rem;font-weight:600">${SamsamFmt.usdSigned(pnl)}<br><span style="font-size:0.7rem;opacity:0.8">${pnlSign}${pnlPct.toFixed(1)}%</span></span></td>
        <td>${sigBadge(c, action)}</td>
        <td style="text-align:center;white-space:nowrap">
          <div class="row-act act3">
            <button class="btn-buy-more" onclick="openBuyMore('${c.sym}')" title="Buy ${c.sym}">+ Buy</button>
            <button class="btn-sell" onclick="openSell('${c.sym}')" title="Sell ${c.sym}">− Sell</button>
            <button type="button" class="btn-more" onclick="event.stopPropagation();openCoinMenu(this,'${c.sym}')" aria-haspopup="menu" aria-expanded="false" title="More actions for ${c.sym}" aria-label="More actions for ${c.sym}">⋯</button>
          </div>
        </td>
      </tr>`;
    });
    tbody.innerHTML = html;
  }

  // Mobile card stack
  const stack = document.getElementById('coinsStack');
  if (stack) {
    stack.innerHTML = rows.map((c,i) => {
      const perf=getPerf(c); const action=getAction(c.sym,perf,c);
      const baseVal=c.qty*c.basePrice; const curVal=c.qty*c.currentPrice;
      const ap=coinProfit(c); const pnl=ap.total; const pnlPct=ap.pct;
      const pnlCls=pnl>=0?'pnl-positive':'pnl-negative'; const pnlSign=pnl>=0?'+':'';
      const perfClass=perf>2?'perf-up':perf<-2?'perf-down':'perf-neutral';
      const perfSign=perf>0?'+':''; const perfIcon=perf>2?'▲':perf<-2?'▼':'—';
      const actionLabel=signalLabel(action);
      const color=COIN_COLORS[c.sym]||'#6b7280';
      return `<div class="coin-card">
        <div class="coin-card-header">
          ${assetHtml(c, catTag(c.cat, c.sym))}
          <div class="card-pnl ${pnlCls}" title="All Time Profit = sells (realized) + Holdings − Cost Basis">
            <div class="card-pnl-usd">${SamsamFmt.usdSigned(pnl)}</div>
            <div class="card-pnl-pct">(${pnlSign}${pnlPct.toFixed(1)}%)</div>
          </div>
        </div>
        <div class="coin-card-body card-stats-grid">
          <div class="coin-metric"><label>Holdings</label><val>${SamsamCoins.holdCell(c.sym, curVal, c.qty, { align: 'left' })}</val></div>
          <div class="coin-metric"><label>${SAMSAM_LABELS.AVG_BUY_PRICE}<button type="button" class="cp-hint" data-hint="avgBuy" aria-label="About Avg. Buy Price"></button></label><val title="${avgShown(c)}">${avgShown(c)}</val></div>
          <div class="coin-metric"><label>${SAMSAM_LABELS.COST_BASIS}<button type="button" class="cp-hint" data-hint="costBasis" aria-label="About Cost Basis"></button></label><val title="${SamsamFmt.usd(baseVal)}">${SamsamFmt.usd(baseVal)}</val></div>
          <div class="coin-metric"><label>${SAMSAM_LABELS.SIGNAL}<button type="button" class="cp-hint" data-hint="signal" aria-label="About Signal"></button></label><val>${sigBadge(c, action)}</val></div>
        </div>
        <div class="coin-card-actions card-act act3 card-actions-footer">
          <button class="btn-buy-more" onclick="openBuyMore('${c.sym}')">+ Buy</button>
          <button class="btn-sell" onclick="openSell('${c.sym}')">− Sell</button>
          <button type="button" class="btn-more" onclick="event.stopPropagation();openCoinMenu(this,'${c.sym}')" aria-haspopup="menu" aria-expanded="false" title="More actions for ${c.sym}" aria-label="More actions for ${c.sym}">⋯</button>
        </div>
      </div>`;
    }).join('');
  }
}

// Manual price: synced via the cloud; live market prices (when available) take precedence.
async function promptPrice(sym) {
  const c = portfolio.find(x => x.sym === sym); if (!c) return;
  const v = await CPDialog.prompt(`Only used when there is no live market price.`, { title: `Manual price for ${sym} (USD)`, value: c.currentPrice || '', inputMode: 'decimal', okText: 'Save' });
  if (v != null && v !== '') updatePrice(sym, v.replace(/[$,\s]/g, ''));
}
function updatePrice(sym, val) {
  const n = parseFloat(val);
  if (n > 0 && requireCloud()) cloudWrite(Samsam.setManualPrice(sym, n));
}
function updateNote(sym, val) {
  if (!requireCloud()) return;
  const coin = portfolio.find(c=>c.sym===sym);
  if (coin && (coin.notes||'') !== val) cloudWrite(Samsam.updateCoin(sym, { notes: val }));
}
// Quantity and average buy price are NOT editable: they are calculated only from the
// ledger (opening position + Buy / Sell / Transfer In / Transfer Out), so every number
// can be traced to a transaction.
const fmtQtyRO = n => parseFloat((+n || 0).toFixed(8)).toLocaleString('en-US', { maximumFractionDigits: 8 });
const fmtPriceRO = n => SamsamFmt.price(n);
const fmtAvgRO = n => SamsamFmt.price(n);

// ── Buy / Sell / Transfer In / Transfer Out ──────────
// Every action opens the same Add Transaction form (see openAddTx).
function openBuyMore(sym) { openAddTx('buy', sym); }
function openSell(sym) { openAddTx('sell', sym); }
function openTransferIn(sym) { openAddTx('transfer_in', sym); }
function openTransferOut(sym) { openAddTx('transfer_out', sym); }

// ── Remove Coin ───────────────────────────────────────
let _rmSym = null;
function removeCoin(sym) {
  _rmSym = sym;
  document.getElementById('rmSym').textContent = sym;
  const c = portfolio.find(x => x.sym === sym), q = c ? c.qty : 0;
  document.getElementById('rmInfo').innerHTML = (q > 1e-12
    ? `You still hold <b>${fmtQtyRO(q)} ${sym}</b> (${SamsamFmt.usd(q * (c.currentPrice || 0))}). They leave the portfolio at their average cost — recorded as a <b>Transfer Out</b>, no profit or loss. <span style="color:#f59e0b">Sold them? Record a <b>Sell</b> instead so the profit counts.</span><br>`
    : '') + `Past buys and sells (and their Realized profit) stay in the history. Adding ${sym} again later starts from zero.`;
  document.getElementById('removeModal').classList.add('active');
}
function closeRemove() {
  document.getElementById('removeModal').classList.remove('active');
  _rmSym = null;
}
function confirmRemove() {
  if(!_rmSym) return;
  if (!requireCloud()) return;
  // Removed on every device: what's left leaves at cost (Transfer Out); history and Realized profit stay; re-adding starts from zero.
  cloudWrite(Samsam.removeCoin(_rmSym));
  closeRemove();
}
document.getElementById('removeModal').addEventListener('click', function(e){ if(e.target===this) closeRemove(); });

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
        <div class="tx-details"><span class="tx-type-badge">${SamsamUI.dot('purple')}REWARD</span>
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
  const pairTxt = pair ? (pair.type === 'buy'
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

// ── Add New Coin / Add Transaction: the shared forms in samsam-add.js (same on every page) ──
CPAdd.defaultTxSym = () => coinTxSym;                 // "+ Add" on a coin's Transactions screen → that coin
CPAdd.on('coin', d => { COIN_NAMES[d.sym] = d.name; });
CPAdd.on('tx', d => {   // the coin's Transactions screen shows everything again if a filter would hide the new entry
  if (coinTxSym === d.sym && htxTypeDD && htxTypeDD.value !== 'all' && !(htxTypeDD.value === 'transfer' && d.type.startsWith('transfer')) && htxTypeDD.value !== d.type) { htxTypeDD.setValue('all'); renderCoinTx(); }
});

// Price Prediction: find the coin's CoinCodex page once and keep it on the coin (all devices use it).
// If CoinCodex can't be reached, the button opens a search that finds the page instead.
function linkCoinCodex(sym, opts) { CPAdd.linkCodex(sym, opts); }
let _ccTried = false;
function linkMissingCoinCodex() {   // coins added before this feature, or on a device that couldn't reach CoinCodex
  if (_ccTried || !cloudReady) return; _ccTried = true;
  portfolio.filter(c => !SamsamCoins.CC_SLUGS[c.sym] && !c.ccSlug).forEach((c, i) => setTimeout(() => linkCoinCodex(c.sym, { cgId: c.cgId, name: c.name || COIN_NAMES[c.sym] }), 1500 * i));
}


function sortTable(col) {
  if(sortCol===col)sortDir*=-1;else{sortCol=col;sortDir=1;}
  renderTableAndStack();
}


function exportData() {
  // CSV = exactly what the table shows (same rows, same order, same figures), plus name, category and notes.
  // Every cell is quoted; text that a spreadsheet could run as a formula (= + - @) is prefixed with ' .
  const L = SAMSAM_LABELS, T = window.SamsamTaxonomy;
  const cell = v => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const rows = [['#', 'Coin', 'Name', 'Category', L.AMOUNT, L.AVG_BUY_PRICE, L.CURRENT_PRICE, L.COST_BASIS, L.HOLDINGS_VALUE, L.PNL, L.PNL + ' %', L.PORTFOLIO_VS_BTC + ' %', L.SIGNAL, 'Notes']];
  getFilteredSorted().forEach((c, i) => {
    const perf = getPerf(c), action = getAction(c.sym, perf, c);
    const baseVal = c.qty * c.basePrice, curVal = c.qty * c.currentPrice, ap = coinProfit(c), pnl = ap.total;
    rows.push([i + 1, c.sym, COIN_NAMES[c.sym] || c.name || c.sym, T ? T.label(c.cat) : (c.cat || ''), c.qty, isSoldOut(c) ? '' : c.basePrice, c.currentPrice,
      baseVal.toFixed(2), curVal.toFixed(2), pnl.toFixed(2), ap.pct.toFixed(2), perf.toFixed(2), signalLabel(action, true), c.notes || '']);
  });
  const csv = rows.map(r => r.map(cell).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'cute-portfolio-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// The PDF's first page: the key numbers, the Holdings and Performance charts (same range as the cards, light colours),
// the allocation donut with every category, and the Accumulation Plan — then the table on the next pages.
function pdfSummary() {
  const box = document.getElementById('pdfSummary'); if (!box) return;
  const esc = SamsamCoins.esc, usd = v => SamsamFmt.usd(v), ap = allTimeProfitData(), total = calcStats().total;
  const RANGE = { '24h': 'Last 24 hours', '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', all: 'All time' }[holdingsRange] || '';
  const cats = {}; portfolio.forEach(c => { const k = c.cat || 'other', v = c.qty * c.currentPrice; if (v > 0) cats[k] = (cats[k] || 0) + v; });
  const catSum = Object.values(cats).reduce((a, b) => a + b, 0), entries = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  // donut
  let a0 = -Math.PI / 2, paths = '';
  const cx = 70, cy = 70, R = 66, r = 42;
  entries.forEach(([k, v]) => {
    const ang = v / catSum * Math.PI * 2, a1 = a0 + Math.min(ang, Math.PI * 2 - 1e-4), L = ang > Math.PI ? 1 : 0, P = (rr, a) => `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`;
    paths += `<path d="M${P(r, a0)} L${P(R, a0)} A${R},${R} 0 ${L},1 ${P(R, a1)} L${P(r, a1)} A${r},${r} 0 ${L},0 ${P(r, a0)} Z" fill="${CAT_COLORS[k] || '#6b7280'}"/>`;
    a0 += ang;
  });
  const legend = entries.map(([k, v]) => `<div class="ps-li"><span class="ps-dot" style="background:${CAT_COLORS[k] || '#6b7280'}"></span><span class="ps-cat">${esc(CAT_LABELS[k] || k)}</span><b>${(v / catSum * 100).toFixed(1)}%</b><span class="ps-usd">${usd(v)}</span></div>`).join('');
  // accumulation plan
  const plan = accumPlanState || [];
  const prog = plan.length ? Samsam.core.overallProgress(plan.map(e => { const c = portfolio.find(x => x.sym && x.sym.toUpperCase() === (e.sym || '').toUpperCase()); return { actual: c ? c.qty || 0 : 0, target: e.targetQty || 0 }; })).pct : null;
  const met = plan.filter(e => { const c = portfolio.find(x => x.sym && x.sym.toUpperCase() === (e.sym || '').toUpperCase()); return e.targetQty > 0 && c && c.qty >= e.targetQty; }).length;
  const cls = n => n >= 0 ? 'up' : 'down', sg = n => (n >= 0 ? '+' : '−');
  box.innerHTML = `
    <div class="ps-tiles">
      <div class="ps-tile"><span>Total Value</span><b>${usd(total)}</b></div>
      <div class="ps-tile"><span>All Time Profit</span><b class="${cls(ap.total)}">${sg(ap.total)}${usd(Math.abs(ap.total))}</b><i class="${cls(ap.total)}">${sg(ap.pct)}${Math.abs(ap.pct).toFixed(2)}%</i></div>
      <div class="ps-tile" id="psBtc" title="The same money kept in BTC"><span>BTC Trend</span><b>—</b></div>
      <div class="ps-tile"><span>Coins</span><b>${portfolio.filter(c => c.qty > 0).length}</b></div>
      <div class="ps-tile"><span>BTC Price</span><b>${usd(btcPrice)}</b></div>
    </div>
    <div class="ps-row ps-charts">
      <div class="ps-card"><div class="ps-h">Holdings value <em>${RANGE}</em><span class="ps-chg" id="psHchg"></span></div><div class="ps-cw"><canvas id="psHold"></canvas></div><div class="ps-none" id="psHoldNone" hidden>No history yet</div></div>
      <div class="ps-card"><div class="ps-h">Performance vs BTC <em>${RANGE}</em></div><div class="ps-cw"><canvas id="psPerf"></canvas></div><div class="ps-none" id="psPerfNone" hidden>No history yet</div>
        <div class="ps-leg"><span><i style="background:#3b82f6"></i>All Time Profit %</span><span><i style="background:#f0a060"></i>BTC Trend %</span></div></div>
    </div>
    <div class="ps-row">
      <div class="ps-card ps-alloc"><div class="ps-h">Portfolio Allocation</div>
        <div class="ps-ab"><div class="ps-donut"><svg viewBox="0 0 140 140" width="140" height="140">${paths}</svg><div class="ps-dc"><b>${entries.length}</b><span>categories</span></div></div><div class="ps-legend">${legend || '—'}</div></div></div>
      ${prog != null ? `<div class="ps-card ps-plan"><div class="ps-h">Accumulation Plan</div><div class="ps-bar"><i style="width:${Math.min(100, prog).toFixed(1)}%"></i></div><div class="ps-pl"><b>${prog.toFixed(1)}% complete</b><span>${met} / ${plan.length} targets met</span></div></div>` : ''}
    </div>`;
  // the two charts, drawn in light colours at the PDF's size: laid out off-screen just long enough to draw
  box.classList.add('ps-drawing');
  const h = drawHoldingsChart({ canvas: document.getElementById('psHold'), height: 175 });
  if (!h) { document.getElementById('psHold').hidden = true; document.getElementById('psHoldNone').hidden = false; }
  else { const e = document.getElementById('psHchg'); e.textContent = h.text; e.className = 'ps-chg ' + (h.up ? 'up' : 'down'); }
  let pf = null; try { pf = drawPerfChart({ canvas: document.getElementById('psPerf'), height: 175 }); } catch (_) {}
  if (!pf) { document.getElementById('psPerf').hidden = true; document.getElementById('psPerfNone').hidden = false; }
  else { const b = document.querySelector('#psBtc b'); b.textContent = sg(pf.btcTrend) + Math.abs(pf.btcTrend).toFixed(2) + '%'; b.className = cls(pf.btcTrend); }
  box.classList.remove('ps-drawing');
}

function exportPdf() {
  // Fill PDF header with live stats
  const totalEl = document.getElementById('totalUsd');
  const total = totalEl ? totalEl.textContent : '—';
  const now = new Date().toLocaleString('en-US', { dateStyle:'medium', timeStyle:'short' });
  const coinCount = portfolio.length;
  const meta = document.getElementById('pdfMeta');
  if (meta) {
    meta.innerHTML =
      `Generated: ${now}` + (baselineState && baselineState.date ? `<br>Baseline: ${SamsamCoins.esc(new Date(baselineState.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}` : '');
  }
  pdfSummary();
  // The PDF is the table (more data visible): show it for printing, then go back to the view you had
  const wasCards = currentView === 'cards';
  if (wasCards) applyView('table');
  const restore = () => { window.removeEventListener('afterprint', restore); if (wasCards) applyView('cards'); };
  window.addEventListener('afterprint', restore);
  setTimeout(() => { window.print(); setTimeout(restore, 1000); }, 120);
}

// Theme switching lives in samsam-ui.js (shared by every page).
function toggleTheme() { SamsamUI.toggleTheme(); }

const CAT_COLORS=SamsamTaxonomy.colors;
const CAT_LABELS=SamsamTaxonomy.labels;

function renderDashboard() {
  const catTotals={btc:0};
  portfolio.forEach(c=>{
    const val=c.qty*c.currentPrice;
    const cat=c.cat||'other';
    catTotals[cat]=(catTotals[cat]||0)+val;
  });
  const totalVal=Object.values(catTotals).reduce((a,b)=>a+b,0);
  const entries=Object.entries(catTotals).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);

  // ② Larger donut: viewBox 160×160, cx/cy=80, outer r=64, inner r=42
  const cx=80,cy=80,r=64,inner=42;
  let startAngle=-Math.PI/2,paths='';
  entries.forEach(([cat,val])=>{
    const angle=(val/totalVal)*Math.PI*2;const endAngle=startAngle+angle;
    const x1=cx+r*Math.cos(startAngle),y1=cy+r*Math.sin(startAngle);
    const x2=cx+r*Math.cos(endAngle),y2=cy+r*Math.sin(endAngle);
    const ix1=cx+inner*Math.cos(startAngle),iy1=cy+inner*Math.sin(startAngle);
    const ix2=cx+inner*Math.cos(endAngle),iy2=cy+inner*Math.sin(endAngle);
    const large=angle>Math.PI?1:0;
    const pctSlice=(val/totalVal*100).toFixed(1);
    const label=CAT_LABELS[cat]||cat;
    const valFmt=SamsamFmt.usd(val);
    paths+=`<path d="M${ix1},${iy1} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} L${ix2},${iy2} A${inner},${inner} 0 ${large},0 ${ix1},${iy1} Z"
      fill="${CAT_COLORS[cat]||'#6b7280'}" opacity="0.9" style="cursor:pointer;transition:opacity 0.15s"
      onmouseenter="donutHover('${label}','${valFmt}','${pctSlice}','${CAT_COLORS[cat]||'#6b7280'}')"
      onmouseleave="donutHoverReset()"/>`;
    startAngle=endAngle;
  });
  const totalFmt=SamsamFmt.usd(totalVal);
  const svgEl=document.getElementById('donutChart');
  // ② Larger centre text to match bigger donut
  svgEl.innerHTML=paths+
    `<text id="donutCenter1" x="80" y="74" text-anchor="middle" font-size="16" font-weight="700" fill="var(--fg)">${totalFmt}</text>
     <text id="donutCenter2" x="80" y="93" text-anchor="middle" font-size="11" fill="var(--fg2)">Total</text>`;
  // Hover handlers
  window.donutHover=function(label,val,pct,color){
    document.getElementById('donutCenter1').textContent=pct+'%';
    document.getElementById('donutCenter1').setAttribute('fill',color);
    document.getElementById('donutCenter2').textContent=label;
  };
  window.donutHoverReset=function(){
    document.getElementById('donutCenter1').textContent=totalFmt;
    document.getElementById('donutCenter1').setAttribute('fill','var(--fg)');
    document.getElementById('donutCenter2').textContent='Total';
  };
  // Legend with percentage
  document.getElementById('donutLegend').innerHTML=entries.map(([cat,val])=>{
    const pct=(val/totalVal*100).toFixed(1);
    const valFmt=SamsamFmt.usd(val);
    return `<div class="legend-item">
      <span class="legend-dot" style="background:${CAT_COLORS[cat]||'#6b7280'}"></span>
      <span class="legend-label">${CAT_LABELS[cat]||cat}</span>
      <span class="legend-val">${valFmt} <span class="legend-pct">${pct}%</span></span>
    </div>`;
  }).join('');

  // P&L
  let totalBase=0,totalCurrent=0;
  const catPnl={};
  portfolio.forEach(c=>{
    const base=c.qty*c.basePrice,cur=c.qty*c.currentPrice;
    totalBase+=base;totalCurrent+=cur;
    const cat=c.cat||'other';
    catPnl[cat]=catPnl[cat]||{base:0,cur:0};
    catPnl[cat].base+=base;catPnl[cat].cur+=cur;
  });
  const totalPnl=totalCurrent-totalBase;
  const totalPnlPct=totalBase>0?(totalPnl/totalBase*100):0;
  const totalCls=totalPnl>=0?'pnl-positive':'pnl-negative';
  const totalSign=totalPnl>=0?'+':'';

  const pnlRowsHtml=Object.entries(catPnl).sort((a,b)=>(b[1].cur-b[1].base)-(a[1].cur-a[1].base)).map(([cat,{base,cur}])=>{
    const pnl=cur-base,pnlPct=base>0?(pnl/base*100):0;
    const cls=pnl>0?'pnl-positive':pnl<0?'pnl-negative':'';
    const sign=pnl>=0?'+':'';
    return `<div class="pnl-row">
      <span class="pnl-label"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${CAT_COLORS[cat]||'#6b7280'};margin-right:6px;vertical-align:middle"></span>${CAT_LABELS[cat]||cat}</span>
      <span class="pnl-val ${cls}">${SamsamFmt.usdSigned(pnl)} (${sign}${pnlPct.toFixed(1)}%)</span>
    </div>`;
  }).join('');

  document.getElementById('pnlRows').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <div style="background:var(--bg3);border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:0.68rem;color:var(--fg2);margin-bottom:4px;text-transform: none;letter-spacing: .01em">Cost Basis</div>
        <div style="font-size:0.95rem;font-weight:700">${SamsamFmt.usd(totalBase)}</div>
      </div>
      <div style="background:var(--bg3);border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:0.68rem;color:var(--fg2);margin-bottom:4px;text-transform: none;letter-spacing: .01em">Current</div>
        <div style="font-size:0.95rem;font-weight:700">${SamsamFmt.usd(totalCurrent)}</div>
      </div>
    </div>
    <div class="pnl-row pnl-total" style="margin-bottom:10px">
      <span class="pnl-label" style="font-weight:700;color:var(--accent)">${SamsamUI.ic('performance')}Unrealized Profit</span>
      <div style="text-align:right">
        <div class="pnl-val ${totalCls}" style="font-size:1.05rem">${SamsamFmt.usdSigned(totalPnl)}</div>
        <div class="${totalCls}" style="font-size:0.75rem;opacity:0.85">${totalSign}${totalPnlPct.toFixed(2)}%</div>
      </div>
    </div>
    ${pnlRowsHtml}`;

  // ── Render Allocation Mini Card ──────────────────────────────────────────
  renderAllocMiniCard(catTotals, totalVal);
}

function renderAllocMiniCard(catTotals, totalVal) {
  const card = document.getElementById('allocMiniCard');
  if (!card) return;
  const entries = Object.entries(catTotals).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  if (!entries.length || totalVal <= 0) return;
  card.style.display = 'flex';

  // Mini donut
  const cx=30,cy=30,rOuter=28,rInner=18;
  let startAngle = -Math.PI/2, paths='';
  entries.forEach(([cat,val])=>{
    const angle=(val/totalVal)*Math.PI*2, endAngle=startAngle+angle;
    const x1=cx+rOuter*Math.cos(startAngle),y1=cy+rOuter*Math.sin(startAngle);
    const x2=cx+rOuter*Math.cos(endAngle),y2=cy+rOuter*Math.sin(endAngle);
    const ix1=cx+rInner*Math.cos(startAngle),iy1=cy+rInner*Math.sin(startAngle);
    const ix2=cx+rInner*Math.cos(endAngle),iy2=cy+rInner*Math.sin(endAngle);
    const large=angle>Math.PI?1:0;
    paths+=`<path d="M${ix1},${iy1} L${x1},${y1} A${rOuter},${rOuter} 0 ${large},1 ${x2},${y2} L${ix2},${iy2} A${rInner},${rInner} 0 ${large},0 ${ix1},${iy1} Z" fill="${CAT_COLORS[cat]||'#6b7280'}" opacity="0.92"/>`;
    startAngle=endAngle;
  });
  document.getElementById('allocMiniSvg').innerHTML=paths;

  // All categories
  document.getElementById('allocMiniCats').innerHTML=entries.map(([cat,val])=>{
    const pct=(val/totalVal*100).toFixed(1);
    const color=CAT_COLORS[cat]||'#6b7280';
    const label=CAT_LABELS[cat]||cat;
    return `<div class="alloc-mini-cat"><span class="alloc-mini-dot" style="background:${color}"></span>${label} <span style="color:var(--fg2);font-weight:400">${pct}%</span></div>`;
  }).join('');
}

let snapshotDue = false;
async function fetchLivePrices() {
  setLiveStatus('loading');
  // Collect IDs from both the static map and per-coin cgId (manually added coins)
  const idSet = new Set(Object.values(COINGECKO_IDS).filter(Boolean));
  portfolio.forEach(c => { if(c.cgId) idSet.add(c.cgId); });
  Object.values(ALT_CG_IDS).flat().forEach(i => idSet.add(i));
  const ids = [...idSet];
  const url=`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`;
  try {
    const res=await fetch(url);
    if(!res.ok)throw new Error('HTTP '+res.status);
    const data=await res.json();
    // Prices are market data, cached per device — they never overwrite portfolio data.
    const map = {};
    const syms = new Set([...Object.keys(COINGECKO_IDS), ...portfolio.map(c => c.sym)]);
    syms.forEach(sym => {
      const coin = portfolio.find(c => c.sym === sym);
      const cgId = (coin && coin.cgId) || COINGECKO_IDS[sym];
      const hit = [cgId, ...(ALT_CG_IDS[sym] || [])].find(i => i && data[i] && data[i].usd);
      if (hit && !(typeof fastAt !== 'undefined' && Date.now() - (fastAt[sym] || 0) < 45000)) map[sym] = { usd: data[hit].usd, ch24: data[hit].usd_24h_change ?? null };   // a fresher Binance price wins
    });
    const btcFresh = typeof fastAt !== 'undefined' && Date.now() - (fastAt.BTC || 0) < 45000;   // a fresher Binance BTC price wins
    if (data['bitcoin'] && data['bitcoin'].usd && !btcFresh) { btcPrice = data['bitcoin'].usd; map.BTC = map.BTC || { usd: btcPrice, ch24: data['bitcoin'].usd_24h_change ?? null }; }
    lastFetchTime=new Date();
    setLiveStatus('ok');
    snapshotDue = true;
    fetchBtcTicker();
    whenSamsam(S => S.updatePrices(map)); // re-renders every view via applyCloudState
    fetchMissingLogos(); linkMissingCoinCodex();
  } catch(e){setLiveStatus(navigator.onLine?'error':'offline');updateLiveIndicator();}
}

// Chart points are saved once the cloud portfolio and fresh prices are both available.
function takeSnapshotsIfDue() {
  if (!snapshotDue || !cloudReady) return;
  snapshotDue = false;
  try { updatePerfChart(); } catch(_) {}
  try { updateHoldingsChart(); } catch(_) {}
}

let _logoFetching = false;
async function fetchMissingLogos() {
  if (_logoFetching || !cloudReady) return;
  _logoFetching = true;
  const missing = portfolio.filter(c => c.cgId && !c.logoUrl);
  for(const coin of missing) {
    try {
      await new Promise(r => setTimeout(r, 800)); // 800ms delay between requests
      const res = await fetch(`https://api.coingecko.com/api/v3/coins/${coin.cgId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`);
      if(res.ok) {
        const data = await res.json();
        if(data.image && data.image.small) cloudWrite(Samsam.updateCoin(coin.sym, { logoUrl: data.image.small }));
      }
    } catch(e) { /* skip, will retry next refresh */ }
  }
  _logoFetching = false;
}

function setLiveStatus(s){liveStatus=s;updateLiveIndicator();}
function updateLiveIndicator(){
  const el=document.getElementById('liveIndicator');if(!el)return;
  if(liveStatus==='loading')el.innerHTML=SamsamUI.liveDot('loading')+' Fetching live prices…';
  else if(liveStatus==='ok'){const t=lastFetchTime?lastFetchTime.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}):'';el.innerHTML=SamsamUI.liveDot('ok')+` Live · <span class="lv-upd">Updated </span>${t}`;}
  else if(liveStatus==='error')el.innerHTML=SamsamUI.liveDot('error')+' Fetch failed — using saved prices';
  else if(liveStatus==='offline')el.innerHTML=SamsamUI.liveDot('idle')+' Offline — showing last saved prices';
  else el.innerHTML=SamsamUI.liveDot('idle')+' Prices from last session';
}

function renderAll(){renderHeader();renderSummary();renderTableAndStack();renderDashboard();}

// ── View Toggle (Cards ↔ Table) ───────────────────────
let currentView = 'cards'; // default: mobile cards

function applyView(view) {
  const changed = currentView !== view;
  currentView = view;
  const stack   = document.getElementById('coinsStack');
  const table   = document.getElementById('portfolioTableWrapper');
  if (changed) {   // gentle slide-in of the view you switched to
    const shown = view === 'table' ? table : stack;
    shown.classList.remove('view-enter'); void shown.offsetWidth; shown.classList.add('view-enter');
    shown.addEventListener('animationend', () => shown.classList.remove('view-enter'), { once: true });
  }
  const btn     = document.getElementById('viewToggleBtn');
  stack.classList.toggle('view-active', view !== 'table');
  table.classList.toggle('view-active', view === 'table');
  // Light up the button of the view that is actually on screen
  btn.querySelectorAll('button').forEach(b => {
    const on = b.dataset.view === (view === 'table' ? 'table' : 'cards');
    b.classList.toggle('btn-toggle-active', on); b.setAttribute('aria-pressed', String(on));
  });
  try { localStorage.setItem(window.innerWidth <= 640 ? 'samsam_view_phone' : VIEW_KEY, view); } catch(e) {}   // phones keep their own choice
}

function toggleView() {
  applyView(currentView === 'cards' ? 'table' : 'cards');
}

function initView() {
  // On mobile (<= 640px) always start with cards view regardless of saved pref
  if (window.innerWidth <= 640) {   // phones: Cards, unless you picked Table in Settings
    let ph = 'cards'; try { ph = localStorage.getItem('samsam_view_phone') === 'table' ? 'table' : 'cards'; } catch (_) {}
    applyView(ph);
    return;
  }
  let saved = 'cards';
  try { saved = localStorage.getItem(VIEW_KEY) || 'cards'; } catch(e) {}
  applyView(saved);
}

// ── Analysis Report ───────────────────────────────────
// IMPORTANT: Replace this URL with YOUR deployed Cloudflare Worker URL after setup
const ANALYSIS_WORKER_URL = 'https://samsam-analysis.dr-samir-saad-1981.workers.dev/analyze';

let analysisLang = 'en';
let analysisRunning = false;

function openAnalysis() {
  document.getElementById('analysisModal').classList.add('active');
  // No report yet: the start screen (quick report with API credit, or free with the Claude app) — nothing is spent until you choose
  if (!aiLast && !analysisRunning) renderAiStart();
  aiPrepApp();
}

function closeAnalysis() {
  document.getElementById('analysisModal').classList.remove('active');
}

function setAnalysisLang(lang) {
  analysisLang = lang;
  document.getElementById('langEnBtn').classList.toggle('active', lang === 'en');
  document.getElementById('langArBtn').classList.toggle('active', lang === 'ar');
  aiPrepApp();
  if (analysisRunning) return;
  // a report written here (API) is written again in the new language; otherwise back to the start screen
  if (aiLast && aiLast.src === 'api') runAnalysis(); else renderAiStart();
}

function buildPortfolioPayload() {
  // Compute per-coin stats using actual portfolio data
  const coins = portfolio.map(c => {
    const avgCost     = c.basePrice || 0;   // basePrice = avg cost basis
    const currentVal  = c.qty * (c.currentPrice || c.basePrice);
    const costBasis   = c.qty * avgCost;
    return {
      sym:          c.sym,
      name:         COIN_NAMES[c.sym] || c.sym,
      qty:          +c.qty.toFixed(8),
      avgCost:      +avgCost.toFixed(8),
      currentPrice: +(c.currentPrice || c.basePrice),
      currentValue: +currentVal.toFixed(2),
      costBasis:    +costBasis.toFixed(2),
      pnlUsd:       +(currentVal - costBasis).toFixed(2),
      pnlPct:       avgCost > 0 ? +((c.currentPrice - avgCost) / avgCost * 100).toFixed(2) : 0,
      cat:          c.cat || 'other',
    };
  });

  const { btcQty, btcValue, altTotal, total } = calcStats();
  const totalCost   = coins.reduce((s, c) => s + c.costBasis, 0);
  const totalPnl    = total - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost * 100) : 0;
  const lastUpdate  = lastFetchTime
    ? lastFetchTime.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Not yet fetched this session';

  // Build accumulation plan summary
  let accumPlanData = [];
  try {
    const raw = accumPlanState || [];
    accumPlanData = raw.map(entry => {
      const coin = portfolio.find(c => c.sym && c.sym.toUpperCase() === (entry.sym||'').toUpperCase());
      const actualQty    = coin ? (coin.qty || 0) : 0;
      const targetQty    = entry.targetQty || 0;
      const currentPrice = coin ? (coin.currentPrice || coin.basePrice || 0) : 0;
      const progress     = targetQty > 0 ? Math.min(actualQty / targetQty * 100, 100) : 0;
      const costToTarget = Math.max(targetQty - actualQty, 0) * currentPrice;
      return {
        sym:          entry.sym,
        name:         entry.name || entry.sym,
        targetQty:    +targetQty,
        actualQty:    +actualQty.toFixed(8),
        pendingQty:   +Math.max(targetQty - actualQty, 0).toFixed(8),
        currentPrice: +currentPrice,
        costToTarget: +costToTarget.toFixed(2),
        progressPct:  +progress.toFixed(1),
        met:          targetQty > 0 && actualQty >= targetQty,
      };
    });
  } catch(_) {}

  const accumMet     = accumPlanData.filter(e => e.met).length;
  const accumTotal   = accumPlanData.length;
  const accumWgtAct  = accumPlanData.reduce((s, e) => s + e.actualQty   * e.currentPrice, 0);
  const accumWgtTgt  = accumPlanData.reduce((s, e) => s + e.targetQty   * e.currentPrice, 0);
  const accumOverall = accumWgtTgt > 0 ? Math.min(accumWgtAct / accumWgtTgt * 100, 100) : 0;

  return {
    coins,
    stats: {
      total:       +total.toFixed(2),
      totalCost:   +totalCost.toFixed(2),
      totalPnl:    +totalPnl.toFixed(2),
      totalPnlPct: +totalPnlPct.toFixed(2),
      btcQty:      +btcQty.toFixed(8),
      btcValue:    +btcValue.toFixed(2),
      altTotal:    +altTotal.toFixed(2),
      btcPrice:    +btcPrice,
      numCoins:    coins.length,
      lastUpdate,
    },
    accumPlan: {
      entries:        accumPlanData,
      totalTargets:   accumTotal,
      metTargets:     accumMet,
      overallPct:     +accumOverall.toFixed(1),
      totalCostToMeet:+accumPlanData.reduce((s,e)=>s+e.costToTarget,0).toFixed(2),
    }
  };
}

// Market data for the AI report: cached / snapshot numbers (no extra CoinGecko calls), at most ~4 seconds.
// Live overview + the trends GitHub saves (m/alt.json: dominance, ETH/BTC, breadth; m/etf.json: ETF flows).
async function marketContext(lang) {
  const M = window.SamsamMarket; if (!M) return '';
  const wait = p => Promise.race([Promise.resolve(p).then(r => r, () => null), new Promise(r => setTimeout(() => r(null), 4000))]);
  const quiet = p => wait(Promise.resolve(p).then(r => r && 'data' in r ? r.data : r));
  const [g, f, top, a90, ap, etf] = await Promise.all([quiet(M.global()), quiet(M.fng()), quiet(M.top()), quiet(M.alt90()), wait(M.altPage && M.altPage()), wait(M.etf && M.etf())]);
  aiAltPage = ap;
  if (!g && !f && !top && !ap) return '';
  const pc = v => v == null || isNaN(v) ? 'n/a' : (v >= 0 ? '+' : '') + (+v).toFixed(2) + '%';
  const usd = v => v >= 1000 ? '$' + Math.round(v).toLocaleString('en-US') : '$' + (+v).toPrecision(4);
  const flow = v => (v < 0 ? '-' : '+') + (Math.abs(v) >= 1e9 ? '$' + (Math.abs(v) / 1e9).toFixed(2) + 'B' : '$' + (Math.abs(v) / 1e6).toFixed(1) + 'M');
  // a saved daily series ([day, value], day = days since 1970): its value `days` days before today
  const back = (ser, days) => { if (!ap || !Array.isArray(ser)) return null; const d = ap.today - days; let v = null; ser.forEach(p => { if (p[0] <= d) v = p[1]; }); return v; };
  const last = ser => Array.isArray(ser) && ser.length ? ser[ser.length - 1][1] : null;
  const L = ['', '', lang === 'ar' ? 'بيانات السوق (السوق الحي — نفس أرقام Market Hub في التطبيق؛ البيانات بالإنجليزية كما هي):' : 'MARKET DATA (the live crypto market — the same numbers as the app\'s Market Hub):'];
  if (g) L.push(`- Total market cap ${M.fmtBig(g.mcap)} (${pc(g.mcapCh24)} in 24h), 24h volume ${M.fmtBig(g.vol)}`);
  if (top && top.length) {
    const by = id => top.find(r => r.id === id);
    [['bitcoin', 'BTC'], ['ethereum', 'ETH']].forEach(([id, s]) => { const c = by(id); if (c && c.price) L.push(`- ${s} price ${usd(c.price)} (${pc(c.ch24)} 24h${c.ch7 != null ? `, ${pc(c.ch7)} 7d` : ''}${c.ch30 != null ? `, ${pc(c.ch30)} 30d` : ''})`); });
  }
  if (ap && Array.isArray(ap.btc)) L.push(`- BTC trend: ${pc(ap.btc[0])} over 7 days, ${pc(ap.btc[1])} over 30 days, ${pc(ap.btc[2])} over 90 days`);
  const trend = (name, now, ser, dp, unit) => {
    if (now == null) return; const w = back(ser, 7), m = back(ser, 30), f2 = v => v == null ? 'n/a' : (+v).toFixed(dp) + unit;
    L.push(`- ${name}: ${f2(now)} now, ${f2(w)} 7 days ago, ${f2(m)} 30 days ago`);
  };
  if (g) L.push(`- Dominance now: BTC ${g.dom.btc.toFixed(1)}%, ETH ${g.dom.eth.toFixed(1)}%, USDT ${g.dom.usdt.toFixed(1)}%, others ${Math.max(0, 100 - g.dom.btc - g.dom.eth - g.dom.usdt).toFixed(1)}%`);
  if (ap) {
    trend('BTC dominance', g ? g.dom.btc : last(ap.domEst), ap.domEst, 1, '%');
    trend('USDT dominance (stablecoin cash waiting on the side)', g ? g.dom.usdt : last(ap.usdtEst), ap.usdtEst, 2, '%');
    trend('ETH/BTC ratio', last(ap.ethbtc), ap.ethbtc, 5, '');
  }
  if (f) L.push(`- Fear & Greed: ${f.value}/100 (${f.label})${f.prev != null ? `, yesterday ${f.prev}` : ''}${f.week != null ? `, a week ago ${f.week}` : ''}`);
  const alt = a90 || (top && M.altSeason(top));
  if (alt) {
    const was = ap && Array.isArray(ap.idx) ? back(ap.idx.map(r => [r[0], r[1]]), 30) : null;
    L.push(`- Altcoin Season index: ${alt.value}/100 (${alt.label}) — ${alt.beat}/${alt.n} top coins beat BTC over ${alt.period || '30d'}${was != null ? `; it was ${was}/100 30 days ago` : ''}`);
  }
  if (ap && ap.breadth) L.push('- Top 100 coins vs BTC: ' + ['7', '30', '90'].filter(k => ap.breadth[k]).map(k => { const b = ap.breadth[k]; return `${k} days: ${b.beat}/${b.n} beat BTC (BTC ${pc(b.btc)}, median coin ${pc(b.med)})`; }).join('; '));
  if (etf) ['btc', 'eth'].forEach(k => {
    const e = etf[k], d = e && e.days; if (!d || !d.length) return;
    const sum = n => d.slice(-n).reduce((s, r) => s + r[1], 0), z = d[d.length - 1];
    L.push(`- US spot ${k.toUpperCase()} ETF flows: ${flow(z[1])} on ${z[0]}, ${flow(sum(5))} over the last 5 trading days, ${flow(sum(d.length))} over the last ${d.length} trading days; net assets ${M.fmtBig(z[3])}`);
    const fl = e.funds && e.funds.list;
    if (fl && fl.length) L.push(`  Biggest moves on ${e.funds.date}: ` + fl.slice().sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 3).map(x => `${x.t} ${flow(x.net)}`).join(', '));
  });
  if (top && top.length) {
    const ok = top.filter(r => r.ch24 != null && !M.isExcluded(r)).sort((a, b) => b.ch24 - a.ch24);
    if (ok.length >= 10) {
      L.push(`- Top 24h gainers (top 100): ${ok.slice(0, 5).map(r => `${r.sym} ${pc(r.ch24)}`).join(', ')}`);
      L.push(`- Top 24h losers (top 100): ${ok.slice(-5).reverse().map(r => `${r.sym} ${pc(r.ch24)}`).join(', ')}`);
    }
  }
  return L.join('\n');
}
let aiAltPage = null;

// What the report must look like — sent with every request (the Worker's 7 sections, each with fixed points),
// so the app can show it as clean cards in English or Arabic.
function aiLayout(lang) {
  const ar = lang === 'ar';
  const T = ar
    ? { sum: 'الخلاصة', btc: 'اتجاه BTC', dom: 'سيطرة BTC', eb: 'ETH/BTC', liq: 'السيولة', etf: 'تدفقات ETF', fng: 'المعنويات', alt: 'موسم العملات البديلة', ver: 'الحكم',
        val: 'القيمة والربح', vs: 'مقارنة بـ BTC', all: 'التوزيع', bs: 'حصة BTC', best: 'الأفضل', worst: 'الأسوأ', risk: 'التركّز، العملات الضعيفة، العملات المستقرة…',
        pr: 'التقدّم', cl: 'الأقرب للهدف', need: 'المتبقي', nx: 'الشراء القادم', buy: 'شراء', hold: 'احتفاظ', red: 'تقليل', wk: 'الأسبوع' }
    : { sum: 'Summary', btc: 'BTC trend', dom: 'BTC dominance', eb: 'ETH/BTC', liq: 'Liquidity', etf: 'ETF flows', fng: 'Sentiment', alt: 'Altcoin Season', ver: 'Verdict',
        val: 'Value & profit', vs: 'vs BTC', all: 'Allocation', bs: 'BTC share', best: 'Best', worst: 'Worst', risk: 'Concentration, Weak coins, Stablecoins…',
        pr: 'Progress', cl: 'Closest to target', need: 'Still needed', nx: 'Next buy', buy: 'Buy', hold: 'Hold', red: 'Reduce', wk: 'Week' };
  const b = s => `**${s}:**`;
  if (ar) return ['', '', 'شكل التقرير — التزم به تمامًا (يفصّل الأقسام السبعة المطلوبة):',
    '- في البداية سطر **الخلاصة** ثم 3 نقاط بالضبط تبدأ بـ "- ": مرحلة السوق، حالة المحفظة، أهم خطوة واحدة. بعدها الأقسام السبعة.',
    '- كل عنوان قسم في سطر وحده بالشكل "N. <إيموجي> <العنوان>" حيث N من 1 إلى 7 والعنوان بالعربية. لا يبدأ أي سطر آخر برقم بعده نقطة.',
    '- داخل الأقسام نقاط "- " فقط: فكرة واحدة في كل نقطة، جملتان قصيرتان على الأكثر، ودائمًا بالأرقام الحقيقية. كل نقطة تبدأ بعنوان صغير عريض ثم نقطتين، مثل "- **العنوان:** النص".',
    `- 1 السوق — نقطة لكل بند وبهذا الترتيب: ${b(T.btc)} خلال 7 و30 و90 يومًا · ${b(T.dom)} الآن مقارنة بقبل 7 و30 يومًا، صاعدة أم هابطة وماذا يعني ذلك · ${b(T.eb)} النسبة واتجاهها · ${b(T.liq)} اتجاه سيطرة USDT وحجم التداول · ${b(T.etf)} لـ BTC وETH، دخول أم خروج خلال آخر 5 أيام تداول · ${b(T.fng)} مؤشر Fear & Greed الآن مقارنة بقبل أسبوع · ${b(T.alt)} قيمة المؤشر وعدد العملات الكبرى التي تفوقت على BTC خلال 7 و30 و90 يومًا. آخر نقطة ${b(T.ver)} مرحلة السوق في جملة واحدة وماذا تعني لهذه المحفظة.`,
    `- 2 المحفظة — ${b(T.val)} · ${b(T.vs)} كم عملة تفوقت على وضع المبلغ نفسه في BTC (vsBtcPct) وأكبر الفروق · ${b(T.all)} كل فئة ونسبتها (وإن وُجد targetAllocation: بُعد كل مجموعة عن هدفها وما يجب شراؤه أو تخفيضه) · ${b(T.bs)}.`,
    `- 3 الأفضل والأسوأ — ${b(T.best)} و${b(T.worst)}: حتى 3 عملات لكل منهما مع تغيّر 24 ساعة و7 أيام ومنذ الشراء.`,
    `- 4 المخاطر — نقطة لكل خطر بعنوان عريض خاص به (${T.risk}) مع الأرقام.`,
    `- 5 خطة التجميع — ${b(T.pr)} · ${b(T.cl)} · ${b(T.need)} بالدولار · ${b(T.nx)}.`,
    `- 6 التوصيات — نقطة لكل عملة مهمة، تبدأ بـ BTC، و10 عملات على الأكثر: "- **SYM — ${T.buy}:** السبب"، باستخدام كلمة واحدة فقط من: ${T.buy} / ${T.hold} / ${T.red}. لكل عملة إشارة من التطبيق (signal)؛ اذكر متى تختلف معها ولماذا.`,
    `- 7 خطة العمل — 4 نقاط من "- **${T.wk} 1:** …" إلى "**${T.wk} 4:**"، كل منها خطوة عملية بمبلغ أو مستوى سعر عند الحاجة.`,
    '- اجعل التقرير كله في حدود 900 كلمة تقريبًا.'].join('\n');
  return ['', '', 'REPORT LAYOUT — follow it exactly (it details the 7 sections above):',
    `- First a line ${'**' + T.sum + '**'} and exactly 3 "- " bullets: the market phase, the state of the portfolio, the single most important action. Then the 7 sections.`,
    '- Each section heading on its own line as "N. <emoji> <title>" with N = 1 to 7' + (ar ? ' and the title in Arabic' : '') + '. No other line may start with a number followed by a dot.',
    '- Inside the sections only "- " bullets: one idea per bullet, at most 2 short sentences, always with the real numbers. Every bullet starts with a bold label and a colon, like "- **Label:** text".',
    `- 1 Market — one bullet each, in this order: ${b(T.btc)} 7 / 30 / 90 days · ${b(T.dom)} now vs 7 and 30 days ago, rising or falling, and what that says · ${b(T.eb)} the ratio and its direction · ${b(T.liq)} the USDT dominance trend and volume · ${b(T.etf)} BTC and ETH, inflow or outflow over the last 5 trading days · ${b(T.fng)} Fear & Greed now vs a week ago · ${b(T.alt)} the index and how many top coins beat BTC over 7 / 30 / 90 days. Last bullet ${b(T.ver)} the market phase in one sentence and what it means for this portfolio.`,
    `- 2 Portfolio — ${b(T.val)} · ${b(T.vs)} how many coins beat holding the same money in BTC (vsBtcPct), the biggest gaps · ${b(T.all)} each category with its % (and, if targetAllocation is given, how far each group is from its target and what to buy or trim) · ${b(T.bs)}.`,
    `- 3 Best & Worst — ${b(T.best)} and ${b(T.worst)}: up to 3 coins each, with their 24h, 7d and since-buy %.`,
    `- 4 Risks — one bullet per risk with its own bold label (${T.risk}) and the numbers.`,
    `- 5 Accumulation Plan — ${b(T.pr)} · ${b(T.cl)} · ${b(T.need)} in $ · ${b(T.nx)}.`,
    `- 6 Recommendations — one bullet per coin that matters, BTC first, at most 10: "- **SYM — ${T.buy}:** the reason", using exactly one of ${T.buy} / ${T.hold} / ${T.red}. Each coin has the app's Signal (signal); say when you disagree with it and why.`,
    `- 7 Action Plan — 4 bullets "- **${T.wk} 1:** …" to "**${T.wk} 4:**", each a concrete action with an amount or a price level where it helps.`,
    '- Keep the whole report under about 900 words.'].join('\n');
}

function renderAnalysisLoading() {
  aiAtStart(false);
  aiLast = null; aiOutButtons(false);
  document.getElementById('analysisBody').innerHTML = `
    <div class="analysis-loading">
      <div class="analysis-spinner"></div>
      <div style="font-size:0.85rem">Claude AI is reading the market and analyzing your portfolio…</div>
      <div style="font-size:0.72rem;opacity:0.6">This takes 10–30 seconds</div>
    </div>`;
}

function renderAnalysisError(msg, detail) {
  aiAtStart(false);
  aiLast = null; aiOutButtons(false);
  document.getElementById('analysisBody').innerHTML = `
    <div class="analysis-error">
      <strong>${SamsamUI.ic('alert')}${msg}</strong>
      ${detail ? `<div style="margin-top:6px;font-size:0.8rem;opacity:0.85">${detail}</div>` : ''}
      <div style="margin-top:10px;font-size:0.78rem">
        Click <strong>${SamsamUI.ic('refresh')}Regenerate</strong> to try again, or check the
        <a href="https://github.com/drsamirsaad1981-design/samsam-portfolio#analysis-setup" target="_blank" rel="noopener noreferrer">setup guide</a>.
      </div>
    </div>`;
}

// The report as cards: a summary, then the 7 sections — each with its SVG icon and its title in the report's language
// (whatever emoji / wording the AI used). Bullets with a bold label, numbered steps, Buy / Hold / Reduce badges.
// The AI's text is escaped first, so it can never put markup or script on the page.
const AI_SECS = [
  ['bar', 'Market Overview', 'نظرة على السوق', /market|السوق/i],
  ['briefcase', 'Portfolio & Allocation', 'المحفظة والتوزيع', /portfolio|allocation|المحفظة|التوزيع/i],
  ['star', 'Best & Worst Performers', 'الأفضل والأسوأ أداءً', /best|worst|perform|الأفضل|الأسوأ|أداء/i],
  ['alert', 'Risks & Concentration', 'المخاطر والتركّز', /risk|concentr|المخاطر|التركز|التركّز/i],
  ['target', 'Accumulation Plan', 'خطة التجميع', /accumul|التجميع/i],
  ['sparkles', 'Recommendations', 'التوصيات', /recommend|التوصيات|توصيات/i],
  ['zap', 'Action Plan — Next 30 Days', 'خطة العمل — الـ 30 يوم القادمة', /action|plan|30|خطة|العمل/i],
];
const AI_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
function aiReportHtml(text, lang) {
  const ar = lang === 'ar', ic = n => SamsamUI.ic(n, { solo: true, size: 16 });
  const lines = SamsamCoins.esc(String(text || '')).replace(/\r/g, '').split('\n');
  const secs = [{ n: 0, items: [] }]; let cur = secs[0], next = 1;
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || /^([-_*])\1{2,}$/.test(t)) { cur.items.push({ k: 'gap' }); continue; }
    const h = t.replace(/^#{1,4}\s*/, '').replace(/^\*\*(.*)\*\*:?$/, '$1').trim();
    const m = /^(\d)\s*[.)]\s*(.*)$/.exec(h);
    if (m && +m[1] === next && next <= 7 && (AI_EMOJI.test(h) || /^#/.test(t) || /^\*\*.*\*\*:?$/.test(t) || AI_SECS[next - 1][3].test(m[2]))) {
      cur = { n: next++, items: [] }; secs.push(cur); continue;
    }
    if (cur.n === 0 && /^(summary|tl;?dr|key takeaways|الخلاصة|ملخص|الملخص)\s*:?$/i.test(h.replace(AI_EMOJI, '').trim())) continue;
    let b = /^(\s*)[-•*·]\s+(.*)$/.exec(raw);
    if (b) { cur.items.push({ k: 'li', sub: b[1].replace(/\t/g, '  ').length >= 2, s: b[2] }); continue; }
    b = /^\s*(\d+)[.)]\s+(.*)$/.exec(raw);
    if (b) { cur.items.push({ k: 'step', s: b[2] }); continue; }
    cur.items.push({ k: 'p', s: t.replace(/^#{1,4}\s*/, '') });
  }
  // in Arabic, numbers like -2.96% / -$1.2B / 0.0331 keep their left-to-right order inside the right-to-left text
  const num = s => ar ? s.replace(/(?<![&#\w.])[+\-−]?\$?\d[\d,]*(\.\d+)?%?[KMBT]?(?![\w;])/g, m => `<bdi dir="ltr">${m}</bdi>`) : s;
  const bold = s => num(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*\*/g, '');
  const VERD = /^(verdict|bottom line|conclusion|الحكم|الخلاصة|النتيجة)$/i;
  const REC = [[/\b(buy|accumulate|add)\b|شراء|اشتر|تجميع|زيادة/i, 'buy'], [/\b(reduce|sell|trim|convert)\b|تقليل|بيع|خفض/i, 'reduce'], [/\b(hold|keep)\b|احتفاظ|احتفظ|انتظار/i, 'hold']];
  const li = (it, sec) => {
    const lm = /^\*\*(.+?)\*\*\s*:?\s*([\s\S]*)$/.exec(it.s);
    if (!lm) return `<li${it.sub ? ' class="sub"' : ''}>${bold(it.s)}</li>`;
    const key = lm[1].replace(/:\s*$/, '').trim(), rest = bold(lm[2]), keyH = ar ? key.replace(/[A-Za-z][\w/&.$-]*(\s+[A-Za-z][\w/&.$-]*)*/g, m => `<bdi dir="ltr">${m}</bdi>`) : key;
    if (sec === 6) {   // "SYM — Buy: reason"
      const parts = key.split(/\s*[—–\-:|]\s*/), word = parts.length > 1 ? parts.slice(1).join(' ') : '', kind = word && (REC.find(r => r[0].test(word)) || [])[1];
      if (kind) return `<li class="ai-rec"><span class="ai-sym">${parts[0]}</span><span class="ai-badge ai-${kind}">${word}</span><span class="ai-t">${rest}</span></li>`;
    }
    if (VERD.test(key)) return `<li class="ai-verdict"><span class="ai-k">${keyH}</span><span class="ai-t">${rest}</span></li>`;
    return `<li${it.sub ? ' class="sub"' : ''}><bdi class="ai-k">${keyH}:</bdi> ${rest}</li>`;
  };
  const body = sec => {
    let out = '', open = '';
    const close = () => { if (open) { out += `</${open}>`; open = ''; } };
    sec.items.forEach(it => {
      if (it.k === 'gap') return close();
      const want = it.k === 'li' ? 'ul' : it.k === 'step' ? 'ol' : '';
      if (want !== open) { close(); if (want) { out += `<${want}>`; open = want; } }
      out += it.k === 'li' ? li(it, sec.n) : it.k === 'step' ? `<li>${bold(it.s)}</li>` : `<p>${bold(it.s)}</p>`;
    });
    close(); return out;
  };
  const found = secs.length > 1;
  let html = '';
  secs.forEach(sec => {
    const inner = body(sec); if (!inner) return;
    if (sec.n === 0) { html += found ? `<section class="ai-sec ai-sum"><h3><span class="ai-ic">${ic('checkCircle')}</span><span>${ar ? 'الخلاصة' : 'Summary'}</span></h3>${inner}</section>` : `<section class="ai-sec">${inner}</section>`; return; }
    const S = AI_SECS[sec.n - 1];
    html += `<section class="ai-sec" data-sec="${sec.n}"><h3><span class="ai-ic">${ic(S[0])}</span><span><bdi dir="ltr">${sec.n}.</bdi> ${ar ? S[2] : S[1]}</span></h3>${inner}</section>`;
  });
  return html;
}

// The last report, for Copy / PDF
let aiLast = null;
function aiAtStart(on) { document.getElementById('analysisModal').classList.toggle('ai-at-start', on); }
function aiOutButtons(on) { ['aiCopyBtn', 'aiPdfBtn'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = !on; }); }
function aiTitle() {
  const ar = aiLast && aiLast.lang === 'ar';
  return (ar ? 'تقرير الذكاء الاصطناعي — Cute Portfolio' : 'Cute Portfolio — AI Analysis Report');
}
function aiSubtitle() { const m = aiLast.meta; return `${m.generatedAt}${m.model ? ' · Claude (' + m.model + ')' : ''} · ${m.numCoins} positions · prices ${m.lastUpdate}`; }
// Copy: the report as plain text (bold marks kept), with a title line — ready to paste into Claude or a note
async function copyAnalysis() {
  if (!aiLast) return;
  const text = `${aiTitle()}\n${aiSubtitle()}\n\n${String(aiLast.text).trim()}\n`;
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (_) {
    try { const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.appendChild(t); t.select(); ok = document.execCommand('copy'); t.remove(); } catch (_) {}
  }
  const b = document.getElementById('aiCopyBtn'), l = b.querySelector('span:last-child');
  l.textContent = ok ? 'Copied' : 'Copy failed'; b.classList.toggle('done', ok);
  clearTimeout(b._t); b._t = setTimeout(() => { l.textContent = 'Copy'; b.classList.remove('done'); }, 2200);
}
// PDF: print only the report (white page, every card), the browser's "Save as PDF"; the file is named after the date
function pdfAnalysis() {
  if (!aiLast) return;
  document.getElementById('aiPrintRoot')?.remove();
  const root = document.createElement('div'); root.id = 'aiPrintRoot';
  const dir = aiLast.lang === 'ar' ? 'rtl' : 'ltr';
  root.innerHTML = `<div class="ai-print-head" dir="${dir}"><b>${SamsamCoins.esc(aiTitle())}</b><span>${SamsamCoins.esc(aiSubtitle())}</span></div>` +
    document.getElementById('analysisBody').innerHTML;
  document.body.appendChild(root);
  const title = document.title, d = new Date();
  document.title = `AI Report ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  document.body.classList.add('ai-print');
  let done = false;
  const undo = () => { if (done) return; done = true; document.body.classList.remove('ai-print'); root.remove(); document.title = title;
    window.removeEventListener('afterprint', undo); document.removeEventListener('pointerdown', undo, true); };
  window.addEventListener('afterprint', undo);
  // phones may not wait for the print sheet: undo on the next tap back on the page as well
  setTimeout(() => { window.print(); setTimeout(() => document.addEventListener('pointerdown', undo, true), 800); }, 50);
}

function renderAnalysisReport(text, meta) {
  const lang = meta.lang || analysisLang;
  aiLast = { text, lang, meta, src: meta.src || 'api' }; aiOutButtons(true); aiAtStart(false);
  let html = '<div class="analysis-content" dir="' + (lang === 'ar' ? 'rtl' : 'ltr') + '" lang="' + lang + '">' + aiReportHtml(text, lang) + '</div>';
  html += `<div class="analysis-meta">
    <span>${SamsamUI.ic('bot')}Generated by Claude AI${meta.model ? ' (' + SamsamCoins.esc(meta.model) + ')' : ''}</span>${meta.left != null ? `<span>${SamsamUI.ic('clock')}${meta.left} report${meta.left === 1 ? '' : 's'} left today</span>` : ''}
    <span>${SamsamUI.ic('clock')}${meta.generatedAt}</span>
    <span>${SamsamUI.ic('activity')}Prices: ${meta.lastUpdate}</span>
    <span>${SamsamUI.ic('briefcase')}${meta.numCoins} positions</span>
  </div>`;

  document.getElementById('analysisBody').innerHTML = html;
}

// More about each coin for the AI: 24h / 7 / 30 / 90-day change, vs BTC, weight, the app's Signal; and the split by category.
function enrichPayload(pd) {
  const total = pd.stats.total || 0, mine = (aiAltPage && aiAltPage.mine) || {}, btc = aiAltPage && aiAltPage.btc;
  const r2 = v => v == null || isNaN(v) ? null : +(+v).toFixed(2);
  const cats = {};
  pd.coins.forEach(x => {
    const c = portfolio.find(p => p.sym === x.sym); if (!c) return;
    const id = c.cgId || (SamsamCoins.CG_IDS || {})[c.sym], tc = id && aiAltPage && (aiAltPage.coins || []).find(r => r.id === id), p = (c.sym === 'BTC' ? btc : id && (mine[id] || (tc && tc.p))) || [];
    x.ch24 = r2(c.change24h); x.ch7 = r2(p[0]); x.ch30 = r2(p[1]); x.ch90 = r2(p[2]);
    x.weightPct = total > 0 ? r2(x.currentValue / total * 100) : null;
    x.vsBtcPct = c.sym === 'BTC' ? 0 : r2(getPerf(c));
    x.signal = signalLabel(getAction(c.sym, 0, c), true);
    x.catLabel = (typeof CAT_LABELS !== 'undefined' && CAT_LABELS[x.cat]) || x.cat;
    const k = x.catLabel; cats[k] = (cats[k] || 0) + x.currentValue;
  });
  pd.stats.byCategory = Object.keys(cats).map(k => ({ cat: k, value: +cats[k].toFixed(2), pct: total > 0 ? +(cats[k] / total * 100).toFixed(1) : 0 })).sort((a, b) => b.value - a.value);
  const alts = pd.coins.filter(x => x.sym !== 'BTC' && x.qty > 0 && x.vsBtcPct != null);
  pd.stats.coinsBeatingBtc = `${alts.filter(x => x.vsBtcPct > 0).length} of ${alts.length}`;
  pd.stats.btcSharePct = total > 0 ? +(pd.stats.btcValue / total * 100).toFixed(1) : 0;
  const tg = Samsam.getTargets && Samsam.getTargets();   // your target allocation (Bitcoin on its own, then categories)
  if (tg && Samsam.core.allocationPlan) {
    const plan = Samsam.core.allocationPlan(tgGroups(), tg.cats, { band: tg.band });
    pd.stats.targetAllocation = { bandPts: tg.band, groups: plan.groups.filter(g => g.target > 0 || g.now >= 0.05).map(g => ({ group: tgLabel(g.key), nowPct: +g.now.toFixed(1), targetPct: +g.target.toFixed(1), driftPts: +g.drift.toFixed(1), toTargetUsd: Math.round(g.full) })) };
  }
  const rules = window.Samsam && Samsam.getSignalRules ? Samsam.getSignalRules() : { reinforce: -5, sell: -20 };
  pd.stats.signalRules = `Signal vs the coin's avg buy price: Reinforce at ${rules.reinforce}% or lower, Sell / Convert to BTC below ${rules.sell}%, otherwise Hold; BTC is always Hold`;
  return pd;
}

// Everything the report is written from — the same for the quick report (Worker) and the Claude app
async function aiRequestParts(lang) {
  const portfolioData = buildPortfolioPayload();
  let accumContext = '';
  if (portfolioData.accumPlan && portfolioData.accumPlan.entries.length > 0 && lang === 'ar') {
    const ap = portfolioData.accumPlan;
    accumContext  = `\n\nخطة التجميع (تحقق ${ap.metTargets} من ${ap.totalTargets} أهداف، الإنجاز الكلي ${ap.overallPct}%، المتبقي $${ap.totalCostToMeet}):\n`;
    accumContext += ap.entries.map(e =>
      `- ${e.sym}: الهدف ${e.targetQty}، المتوفر ${e.actualQty}، المتبقي ${e.pendingQty}، التقدّم ${e.progressPct}%، تكلفة الإكمال $${e.costToTarget}${e.met ? ' ✓ تحقق' : ''}`
    ).join('\n');
    accumContext += `\nعند التوصية بالشراء أو الاحتفاظ، خذ في الاعتبار العملات الموجودة في خطة التجميع ومدى قربها من أهدافها.`;
  } else if (portfolioData.accumPlan && portfolioData.accumPlan.entries.length > 0) {
    const ap = portfolioData.accumPlan;
    accumContext  = `\n\nACCUMULATION PLAN (${ap.metTargets}/${ap.totalTargets} targets met, overall ${ap.overallPct}% complete, $${ap.totalCostToMeet} still needed):\n`;
    accumContext += ap.entries.map(e =>
      `- ${e.sym}: target ${e.targetQty}, actual ${e.actualQty}, pending ${e.pendingQty}, progress ${e.progressPct}%, cost to complete $${e.costToTarget}${e.met ? ' ✓ MET' : ''}`
    ).join('\n');
    accumContext += `\nWhen making Buy/Hold recommendations, factor in which coins are part of the accumulation plan and how close they are to their targets.`;
  }
  // The market right now (same numbers as the Market Hub); it travels in the free-text context the Worker adds to the prompt
  accumContext += await marketContext(lang);
  enrichPayload(portfolioData);
  accumContext += aiLayout(lang);
  return { portfolioData, accumContext };
}

// ── Free: the Claude app ──
// The whole prompt (the same instructions the Worker gives Claude + your data) is copied; you paste it in the Claude app,
// copy its reply and paste it back here, where it shows as the same cards (Copy / PDF too). No API credit is used.
function aiAppSystem(lang) {
  if (lang === 'ar') return ['أنت محلل محترف لمحافظ العملات الرقمية، تكتب تقريرًا خاصًا لصاحب المحفظة.',
    'اعتمد في كل جملة على البيانات المرفقة فقط. لا تخترع أسعارًا أو أخبارًا أو أرقامًا. كن محددًا: اذكر العملات والمبالغ والنسب.',
    'هذا تحليل وليس نصيحة مالية؛ لا تَعِد بأرباح. اجعله عمليًا ومختصرًا.',
    'اكتب التقرير كله بالعربية الفصحى الواضحة والمباشرة، واترك رموز العملات والأرقام ومبالغ $ بالحروف اللاتينية.',
    'التنسيق: نص عادي مع خط عريض (**…**) ونقاط تبدأ بـ "- " فقط. بدون جداول أو كود أو HTML. اكتب التقرير فقط، بدون مقدمة قبله ولا أسئلة بعده.',
    'استخدم عناوين الأقسام المرقّمة هذه بالضبط، كل عنوان في سطر وحده، وبالترتيب نفسه:',
    '1. 📊 نظرة على السوق', '2. 🥧 المحفظة والتوزيع', '3. 🏆 الأفضل والأسوأ أداءً', '4. ⚠️ المخاطر والتركّز',
    '5. 💰 خطة التجميع', '6. 💡 التوصيات (شراء / احتفاظ / تقليل لكل عملة مهمة)', '7. 🎯 خطة العمل للـ 30 يومًا القادمة'].join('\n');
  const L = lang === 'ar'
    ? 'Write the whole report in Arabic (Modern Standard Arabic, clear and direct). Keep coin tickers, numbers and $ amounts in Latin characters.'
    : 'Write the whole report in clear, direct English.';
  return ['You are a seasoned crypto portfolio analyst writing a private report for the portfolio owner.',
    'Base every statement on the data provided. Do not invent prices, news or numbers. Be specific: name coins, amounts and percentages.',
    'This is analysis, not financial advice; do not promise returns. Keep it practical and concise.', L,
    'Format: plain text with markdown bold (**…**) and "- " bullets only. No tables, no code blocks, no HTML. Reply with the report only — no introduction before it and no questions after it.',
    'Use exactly these numbered section headings, each on its own line, in this order:',
    '1. 📊 Market Overview', '2. 🥧 Portfolio Overview & Allocation', '3. 🏆 Best & Worst Performers', '4. ⚠️ Risks & Concentration',
    '5. 💰 Accumulation Plan Progress', '6. 💡 Recommendations (Buy / Hold / Reduce, per coin where it matters)', '7. 🎯 Action Plan for the Next 30 Days'].join('\n');
}
let aiApp = null;   // { lang, text, t } — prepared when the report opens, so the copy happens right on your tap
async function aiPrepApp(force) {
  const lang = analysisLang;
  if (!force && aiApp && aiApp.lang === lang && Date.now() - aiApp.t < 10 * 60e3) return aiApp;
  if (!(window.Samsam && Samsam.isReady && Samsam.isReady())) return null;
  try {
    const { portfolioData, accumContext } = await aiRequestParts(lang);
    const at = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    const text = lang === 'ar'
      ? `${aiAppSystem(lang)}\n\n---\n\nبيانات المحفظة (JSON، بالدولار، ${at}):\n${JSON.stringify(portfolioData)}${accumContext}\n\nاكتب التقرير الآن بالعربية.`
      : `${aiAppSystem(lang)}\n\n---\n\nPORTFOLIO DATA (JSON, USD, ${at}):\n${JSON.stringify(portfolioData)}${accumContext}\n\nWrite the report now.`;
    aiApp = { lang, text, t: Date.now() };
    return aiApp;
  } catch (_) { return null; }
}
async function aiCopyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
  try { const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok; } catch (_) { return false; }
}
function aiFlash(id, txt, ok) {
  const b = document.getElementById(id); if (!b) return; const l = b.querySelector('span:last-child'), was = b.dataset.lbl || (b.dataset.lbl = l.textContent);
  l.textContent = txt; b.classList.toggle('done', !!ok); clearTimeout(b._t); b._t = setTimeout(() => { l.textContent = was; b.classList.remove('done'); }, 2600);
}
async function aiCopyForApp() {
  const ar = analysisLang === 'ar';
  const ready = aiApp && aiApp.lang === analysisLang && Date.now() - aiApp.t < 10 * 60e3;
  if (!ready) {
    aiFlash('aiAppCopy', ar ? 'جارٍ التجهيز…' : 'Preparing…');
    const a = await aiPrepApp(true);
    if (!a) { aiFlash('aiAppCopy', ar ? 'غير جاهز — حاول مرة أخرى' : 'Not ready — try again'); return; }
  }
  const ok = await aiCopyText(aiApp.text);
  if (!ok) { aiFlash('aiAppCopy', ar ? 'اضغط مرة أخرى للنسخ' : 'Tap again to copy'); return; }
  aiFlash('aiAppCopy', ar ? 'تم النسخ — الصقه في Claude' : 'Copied — paste it in Claude', true);
  document.getElementById('aiStep2')?.classList.add('on');
  try { window.open('https://claude.ai/new', '_blank', 'noopener'); } catch (_) {}
}
function renderAiStart() {
  if (analysisRunning) return;
  aiLast = null; aiOutButtons(false); aiAtStart(true);
  const ar = analysisLang === 'ar';
  const T = ar ? { free: 'مجانًا مع تطبيق Claude', freeD: 'نفس التقرير، يكتبه Claude في تطبيقك — بدون أي خصم من رصيد الـ API. لغة التقرير: العربية.',
      s1: 'انسخ بيانات محفظتك والسوق، ثم الصقها في محادثة جديدة مع Claude.', b1: 'نسخ لـ Claude',
      s2: 'بعد أن يكتب Claude التقرير، انسخ رده (زر النسخ أسفله) والصقه هنا.', b2: 'لصق التقرير',
      q: 'تقرير سريع هنا', qD: 'يُكتب في حوالي 20 ثانية بضغطة واحدة — يُخصم من رصيد Anthropic API (حوالي <bdi dir="ltr">$0.07–0.13</bdi> للتقرير).', qb: 'إنشاء التقرير' }
    : { free: 'Free with the Claude app', freeD: 'The same report, written in your Claude app — no API credit used. Report language: English.',
      s1: 'Copy your portfolio + market data, then paste it in a new Claude chat.', b1: 'Copy for Claude',
      s2: 'When Claude has written it, copy its reply (the copy button under it) and paste it here.', b2: 'Paste report',
      q: 'Quick report here', qD: 'Written in about 20 seconds with one tap — uses your Anthropic API credit (about $0.07–0.13 a report).', qb: 'Create report' };
  document.getElementById('analysisBody').innerHTML = `
    <div class="ai-start" dir="${ar ? 'rtl' : 'ltr'}" lang="${ar ? 'ar' : 'en'}">
      <div class="ai-opt">
        <div class="ai-opt-h"><span class="ai-ic">${SamsamUI.ic('sparkles', { solo: true, size: 16 })}</span><div><b>${T.free}</b><span>${T.freeD}</span></div></div>
        <ol class="ai-steps">
          <li id="aiStep1"><span>${T.s1}</span>
            <button class="btn-analysis" id="aiAppCopy" onclick="aiCopyForApp()"><span data-ic="file"></span><span>${T.b1}</span></button></li>
          <li id="aiStep2"><span>${T.s2}</span>
            <button class="btn-analysis" id="aiAppPaste" onclick="aiPasteReport()"><span data-ic="download"></span><span>${T.b2}</span></button></li>
        </ol>
      </div>
      <div class="ai-opt">
        <div class="ai-opt-h"><span class="ai-ic">${SamsamUI.ic('bot', { solo: true, size: 16 })}</span><div><b>${T.q}</b><span>${T.qD}</span></div></div>
        <button class="btn-analysis ai-quick" onclick="runAnalysis()"><span data-ic="refresh"></span><span>${T.qb}</span></button>
      </div>
    </div>`;
  aiPaintIcons();
}
function aiPaintIcons() { document.querySelectorAll('#analysisBody [data-ic]').forEach(e => { if (!e.firstChild) e.innerHTML = SamsamUI.ic(e.dataset.ic, { solo: true, size: 14 }); }); }
async function aiPasteReport() {
  let t = '';
  try { t = await navigator.clipboard.readText(); } catch (_) {}
  if (t && /(^|\n)\s*(#+\s*)?\**\s*[1-7]\s*[.)]/.test(t) && t.length > 200) return aiShowPasted(t);
  // the browser didn't hand over the clipboard (or it isn't a report): a box to paste into
  aiAtStart(true);
  const ar = analysisLang === 'ar';
  document.getElementById('analysisBody').innerHTML = `
    <div class="ai-paste" dir="${ar ? 'rtl' : 'ltr'}">
      <label for="aiPasteTxt">${ar ? 'الصق رد Claude هنا:' : "Paste Claude's reply here:"}</label>
      <textarea id="aiPasteTxt" rows="9" placeholder="${ar ? 'اضغط مطولًا ثم لصق' : 'Long-press → Paste'}" dir="auto"></textarea>
      <div class="ai-paste-b"><button class="btn-analysis" onclick="aiShowPasted(document.getElementById('aiPasteTxt').value)"><span data-ic="checkCircle"></span><span>${ar ? 'عرض التقرير' : 'Show report'}</span></button>
        <button class="btn-analysis" onclick="renderAiStart()"><span data-ic="x"></span><span>${ar ? 'رجوع' : 'Back'}</span></button></div>
      <div class="ai-paste-err" id="aiPasteErr" hidden>${ar ? 'هذا لا يبدو كالتقرير — الصق رد Claude كاملًا.' : "That doesn't look like the report — paste Claude's whole reply."}</div>
    </div>`;
  aiPaintIcons();
  document.getElementById('aiPasteTxt').focus();
}
function aiShowPasted(t) {
  t = String(t || '').trim();
  if (t.length < 120) { const e = document.getElementById('aiPasteErr'); if (e) e.hidden = false; return; }
  const lang = (t.match(/[\u0600-\u06FF]/g) || []).length > 80 ? 'ar' : 'en';
  const pd = (() => { try { return buildPortfolioPayload(); } catch (_) { return { stats: {} }; } })();
  renderAnalysisReport(t.slice(0, 40000), { lang, src: 'app', model: 'Claude app', left: null,
    generatedAt: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }), lastUpdate: pd.stats.lastUpdate || '—', numCoins: pd.stats.numCoins || 0 });
}

async function runAnalysis() {
  if (analysisRunning) return;

  // Check Worker URL is configured
  if (ANALYSIS_WORKER_URL.includes('YOUR-SUBDOMAIN')) {
    renderAnalysisError(
      'Worker not configured yet',
      'Replace <code>YOUR-SUBDOMAIN</code> in the code with your Cloudflare Worker URL. See setup instructions below.'
    );
    // Show setup instructions in the modal
    document.getElementById('analysisBody').innerHTML += `
      <div style="margin-top:16px;background:var(--bg3);border-radius:8px;padding:14px 16px;font-size:0.8rem;line-height:1.9;border:1px solid var(--border)">
        <strong style="color:var(--accent);font-size:0.88rem">${SamsamUI.ic('sliders')}One-Time Setup (5 minutes)</strong><br>
        <ol style="margin:8px 0 0 16px;padding:0">
          <li>Go to <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">dash.cloudflare.com</a> → Workers &amp; Pages → Create</li>
          <li>Paste the Worker code (see <code>worker.js</code> file shared below)</li>
          <li>Deploy → copy the <code>.workers.dev</code> URL</li>
          <li>In Worker Settings → Variables → add <strong>Secret: ANTHROPIC_API_KEY</strong></li>
          <li>In <code>index.html</code> replace <code>YOUR-SUBDOMAIN</code> in <code>ANALYSIS_WORKER_URL</code></li>
          <li>Push to GitHub → done ${SamsamUI.ic('checkCircle')}</li>
        </ol>
        <div style="margin-top:10px;color:var(--fg2)">Cost: Free tier (100,000 Worker requests/day + ~$0.01/report for Claude API)</div>
      </div>`;
    return;
  }

  analysisRunning = true;
  document.getElementById('regenBtn').disabled = true;
  renderAnalysisLoading();

  try {
    const lang = analysisLang;
    const { portfolioData, accumContext } = await aiRequestParts(lang);

    // Proof of sign-in: the Worker verifies this Firebase ID token and counts reports per account per day
    let idToken = null;
    try { idToken = window.Samsam && Samsam.idToken ? await Samsam.idToken() : null; } catch (_) {}
    if (!idToken) { renderAnalysisError('Sign in first', 'The AI report is only for signed-in accounts. Sign in, then try again.'); return; }

    const res = await fetch(ANALYSIS_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portfolioData, language: lang, accumContext, idToken }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      renderAnalysisError(
        res.status === 429 ? 'Daily limit reached' : res.status === 401 || res.status === 403 ? 'Not allowed' : 'Analysis failed',
        SamsamCoins.esc(err.error || `Server returned ${res.status}. Please try again.`)
      );
      return;
    }

    const data = await res.json();
    if (!data.report) {
      renderAnalysisError('Empty response from AI', 'Claude returned an empty report. Please try again.');
      return;
    }

    renderAnalysisReport(data.report, {
      lang, src: 'api',
      model:       typeof data.model === 'string' ? data.model : '',
      left:        Number.isFinite(data.remaining) ? data.remaining : null,
      generatedAt: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
      lastUpdate:  portfolioData.stats.lastUpdate,
      numCoins:    portfolioData.stats.numCoins,
    });

  } catch (err) {
    renderAnalysisError(
      'Connection error',
      'Could not reach the analysis service. Check your internet connection and try again.'
    );
  } finally {
    analysisRunning = false;
    document.getElementById('regenBtn').disabled = false;
  }
}

// Close modal on overlay click
document.getElementById('analysisModal').addEventListener('click', function(e) {
  if (e.target === this) closeAnalysis();
});

document.getElementById('searchBox').addEventListener('input',renderTableAndStack);
// Signal filter: same dropdown component as the category card (bottom sheet on mobile)
(function () {
  const host = document.getElementById('signalDD'); if (!host || !window.SamsamDropdown) return;
  const opts = [
    { value: '', label: 'All signals', icon: SamsamUI.ic('zap', { solo: true }) }, { value: 'gainers', label: 'Top Gainers', icon: SamsamUI.dot('green') },
    { value: 'losers', label: 'Top Losers', icon: SamsamUI.dot('red') }, { value: 'convert', label: 'Sell / Convert to BTC', icon: SamsamUI.dot('red') },
    { value: 'hold', label: 'Hold', icon: SamsamUI.dot('grey') }, { value: 'reinforce', label: 'Reinforce', icon: SamsamUI.dot('green') },
    { value: '__rules', label: 'Signal Thresholds', sub: 'Reinforce · Sell %', icon: SamsamUI.ic('pencil', { solo: true }) },
  ];
  window.signalDD = SamsamDropdown.create(host, {
    options: opts, value: '', ariaLabel: 'Signal filter', title: 'Filter by signal', minWidth: 220,
    onChange: v => {
      if (v === '__rules') { window.signalDD.setValue(document.getElementById('filterAction').value || ''); openSignalEdit(); return; }   // not a filter
      document.getElementById('filterAction').value = v; sortCol = 'currentValue'; sortDir = 1; renderTableAndStack(); animateCoinList();
    },
  });
})();
document.getElementById('currentDate').innerHTML=SamsamUI.icon('calendar')+'<span>'+new Date().toLocaleDateString('en-US',{year:'numeric',month:(innerWidth<=480?'short':'long'),day:'numeric'})+'</span>';
document.querySelector('.hm-baseline .val-edit').innerHTML = SamsamUI.icon('pencil');
document.querySelectorAll('.sg-edit').forEach(b => { b.innerHTML = SamsamUI.icon('pencil'); });
renderBaselineLabel();

// Baseline + fallback prices let the store show sensible prices before the first live fetch.
whenSamsam(S => {
  S.configure({ basePortfolio: BASE_PORTFOLIO, fallbackPrices: LIVE_PRICES_OCT15, coinNames: COIN_NAMES, setupPage: true });
  S.onChange(applyCloudState);
});
renderAll();      // empty shell until the cloud portfolio arrives (normally < 1 s, instant from the offline cache)
initView();       // apply view preference (shows/hides correct container)
fetchLivePrices();
// Auto-refresh live prices every 60 seconds
// Live prices: refresh every 60s while the page is visible. Hidden tabs (phone locked, other tab) don't
// poll — no wasted battery, data or CoinGecko rate limit — and catch up as soon as they are visible / online again.
let _priceTimer = null, _lastPricePoll = Date.now();
function _pollPrices() { if (document.hidden || !navigator.onLine) return; _lastPricePoll = Date.now(); fetchLivePrices(); }
function _startPricePolling() { clearInterval(_priceTimer); _priceTimer = setInterval(_pollPrices, 60000); }
_startPricePolling();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearInterval(_priceTimer); _priceTimer = null; return; }
  if (Date.now() - _lastPricePoll > 60000) _pollPrices();
  _startPricePolling();
});
window.addEventListener('online', () => _pollPrices());

// Fast lane: every 15 s, Binance's live price for the coins you hold that trade against USDT (CoinGecko's free prices lag
// a minute or more). A Binance price is used only when it is within 25% of the CoinGecko one (the same ticker can be a
// different coin), and the 24h % keeps CoinGecko's price of 24 h ago. Coins Binance doesn't have stay on CoinGecko.
var fastAt = {};   // var: fetchLivePrices() runs before this line on load
async function fastPrices() {
  if (document.hidden || !navigator.onLine || !window.SamsamMarket || !SamsamMarket.fastPrices || !(window.Samsam && Samsam.isReady())) return;
  const held = portfolio.filter(c => c.qty > 0 && c.currentPrice > 0);
  const px = await SamsamMarket.fastPrices(held.map(c => c.sym));
  const map = {}, now = Date.now();
  held.forEach(c => {
    const p = px[c.sym]; if (!(p > 0) || Math.abs(p / c.currentPrice - 1) > 0.25) return;
    const ago = c.change24h != null ? c.currentPrice / (1 + c.change24h / 100) : null;
    map[c.sym] = { usd: p, ch24: ago > 0 ? (p / ago - 1) * 100 : (c.change24h ?? null) }; fastAt[c.sym] = now;
    if (c.sym === 'BTC') btcPrice = p;
  });
  if (Object.keys(map).length) { lastFetchTime = new Date(); Samsam.updatePrices(map); }
}
setInterval(fastPrices, 15000); setTimeout(fastPrices, 4000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) fastPrices(); });
window.addEventListener('offline', () => { if (typeof setLiveStatus === 'function') setLiveStatus('offline'); });

function showSyncStatus(msg, color) {
  const el = document.getElementById('footerSyncStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = color;
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 4000);
}

// ─── Accumulation Progress on Main Page ──────────────────────────────────────
function renderAccumProgress(plan) {
  if (!plan || plan.length === 0) return;
  let weightedActual = 0, weightedTarget = 0, completed = 0;
  plan.forEach(entry => {
    const coin = portfolio.find(c => c.sym && c.sym.toUpperCase() === (entry.sym||'').toUpperCase());
    const actualQty   = coin ? (coin.qty || 0) : 0;
    const targetQty   = entry.targetQty || 0;
    const currentPrice = coin ? (coin.currentPrice || 0) : 0;
    const targetVal   = targetQty * currentPrice;
    weightedActual   += actualQty * currentPrice;
    weightedTarget   += targetVal;
    if (targetQty > 0 && actualQty >= targetQty) completed++;
  });
  // Overall Progress = average of each coin's completion, each capped at 100% — same as the Accumulation page
  const pct = Samsam.core.overallProgress(plan.map(entry => {
    const coin = portfolio.find(c => c.sym && c.sym.toUpperCase() === (entry.sym || '').toUpperCase());
    return { actual: coin ? (coin.qty || 0) : 0, target: entry.targetQty || 0 };
  })).pct;
  document.getElementById('accumFill').style.width  = pct.toFixed(1) + '%';
  document.getElementById('accumPct').textContent   = pct.toFixed(1) + '% complete';
  document.getElementById('accumDetail').textContent = completed + ' / ' + plan.length + ' targets met';
  // card always visible (no display:none needed — it's an <a> block)
}

let lastCloudSync = null;

function updateSyncFooter() {
  const el = document.getElementById('footerSyncTime');
  if (!el) return;
  if (lastCloudSync) {
    const t = lastCloudSync.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const d = lastCloudSync.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    el.innerHTML = SamsamUI.ic('cloud') + `Cloud synced: ${d} at ${t}`;
  } else {
    el.innerHTML = SamsamUI.ic('cloud') + 'Cloud: not synced yet';
  }
}

// Holdings header/chart end on the live portfolio total, so it always equals the TOTAL PORTFOLIO card
// Holdings change in a range, split honestly: what prices did vs money you added or took out.
//   From prices = Profit(end) − Profit(start)     (Profit = Value − Cost Basis + Realized, from the ledger)
//   Added       = Net invested(end) − Net invested(start)   (buys + fees − sells)
// Value change = From prices + Added. The green/red and the % follow the price part only.
// % = the price part ÷ (value at the start + money added) · "All" = the All Time Profit card (same $ and %).
function holdingsChangeText(snaps) {
  const a = snaps[0], z = snaps[snaps.length - 1];
  if (!(window.Samsam && Samsam.isReady())) { const d = z.v - a.v, p = a.v > 0 ? d / a.v * 100 : 0; return { text: `${d >= 0 ? '+' : '−'}${SamsamFmt.usd(Math.abs(d))}  (${d >= 0 ? '+' : '−'}${Math.abs(p).toFixed(2)}%)`, up: d >= 0, title: '' }; }
  const st = Samsam.getState();
  const s = Samsam.core.profitSeries(st.coins, st.transactions, [a.t, z.t]);
  const priceGain = (z.v - s.cost[1] + s.realized[1]) - (a.v - s.cost[0] + s.realized[0]);
  let gain = priceGain;
  const added = (s.cost[1] - s.realized[1]) - (s.cost[0] - s.realized[0]);
  // % of the money at work in the range: what you held at the start + what you added (a $20k top-up is not a loss or a gain).
  // "All" = the All Time Profit card exactly (profit since you bought, ÷ everything invested).
  let pct = (a.v + Math.max(0, added)) > 0 ? gain / (a.v + Math.max(0, added)) * 100 : 0;
  if (holdingsRange === 'all') { const at = allTimeProfitData(); gain = at.total; pct = at.pct; }
  const sg = n => n >= 0 ? '+' : '−';
  let text = `${sg(gain)}${SamsamFmt.usd(Math.abs(gain))}  (${sg(pct)}${Math.abs(pct).toFixed(2)}%)`;
  if (Math.abs(added) >= 1) text += ` · ${added > 0 ? '+' : '−'}${SamsamFmt.usd(Math.abs(added))} ${added > 0 ? 'added' : 'taken out'}`;
  return { text, up: gain >= 0, title: `Value change ${sg(z.v - a.v)}${SamsamFmt.usd(Math.abs(z.v - a.v))} = ${sg(priceGain)}${SamsamFmt.usd(Math.abs(priceGain))} from prices, ${added >= 0 ? '+' : '−'}${SamsamFmt.usd(Math.abs(added))} ${added >= 0 ? 'added' : 'taken out'}` };
}

function withLiveTotal(snaps) {
  if (!snaps.length) return snaps;
  const { total } = calcStats();
  if (!(total > 0)) return snaps;
  const lastT = snaps[snaps.length - 1].t, now = Date.now();
  return [...snaps, { t: Math.max(now, lastT + 1), v: total }];
}

// X-axis rule shared by every chart: 24h → hours (06:00, 12:00…), longer ranges → dates (18 Oct…)
const RANGE_MS = { '24h': 864e5, '7d': 6048e5, '30d': 2592e6, '90d': 7776e6, all: Infinity };
function timeModeFor(range) { return range === '24h' ? 'hours' : 'days'; }

// Same chart height in both chart cards so the three-card row lines up
function TRIO_CHART_H() { return window.innerWidth >= 1024 ? 170 : 140; }

// ─── Portfolio Performance Chart ─────────────────────────────────────────────
function loadPerfSnapshots() { return perfSnapsState; }

// Performance points: at most one per hour, stored in the cloud (merged across devices).
function savePerfSnapshot(portfolioValue, btcPrice) {
  cloudWrite(Samsam.recordSnapshot('perf', Date.now(), portfolioValue, btcPrice));
}

function drawPerfChart(pc) {   // pc: { canvas, height } — the PDF's copy (light colours, no page updates)
  const allPerf = loadPerfSnapshots();
  const cutoff = holdingsRange === 'all' ? 0 : Date.now() - RANGE_MS[holdingsRange];
  let snaps = allPerf.filter(s => s.t >= cutoff);
  if (!snaps.length && allPerf.length) snaps = [allPerf[allPerf.length - 1]];
  if (pc && snaps.length < 1) return null;
  const wrap  = pc ? null : document.getElementById('perfChartWrap');
  const noData = pc ? null : document.getElementById('perfNoData');
  const canvas = pc ? pc.canvas : document.getElementById('perfChartCanvas');
  // Always show the section
  if (wrap) wrap.style.display = '';
  if (snaps.length < 1) {
    if (noData) noData.style.display = '';
    canvas.style.display = 'none';
    return;
  }
  if (noData) noData.style.display = 'none';
  canvas.style.display = '';
  // If only 1 snapshot, duplicate it so chart renders as a flat baseline
  if (snaps.length === 1) snaps = [snaps[0], { ...snaps[0], t: snaps[0].t + 1 }];

  // Performance (cumulative): All Time Profit % at every point vs BTC Trend since the baseline (samsam-core.js → perfChartSeries).
  // The line ends on "now" so it finishes exactly on the numbers of the All Time Profit card.
  const st = Samsam.getState(), ap = allTimeProfitData();
  const live = { t: Date.now(), v: calcStats().total, b: btcPrice };
  // computed over the whole history (the BTC benchmark needs every buy/sell), then cut to the range shown
  const hist = allPerf.length ? allPerf : snaps;
  const pts = live.v > 0 && live.b > 0 && live.t > hist[hist.length - 1].t ? hist.concat([live]) : hist;
  const full = Samsam.core.perfChartSeries(pts, st.coins, st.transactions, { baselineBtc: baselineState.btcPrice });
  const t0 = snaps[0].t, inR = p => p.t >= t0;
  const ser = { port: full.port.filter(inR), btc: full.btc.filter(inR) };
  if (ser.port.length < 2) { ser.port = full.port.slice(-2); ser.btc = full.btc.slice(-2); }
  SamsamChart.draw(canvas, { height: pc ? pc.height : TRIO_CHART_H(), format: 'pct', timeMode: timeModeFor(holdingsRange), theme: pc ? 'light' : undefined, series: [
    { points: ser.btc, color: '#f0a060', width: 2 },                         // BTC Trend
    { points: ser.port, color: '#3b82f6', width: 2.4, fill: true },          // All Time Profit %
  ] });
  const tri = n => (n >= 0 ? '▲ ' : '▼ ') + Math.abs(n).toFixed(2) + '%';
  const btcTrend = ser.btc.length ? ser.btc[ser.btc.length - 1].v : 0;   // BTC benchmark now (same money, in BTC)
  if (pc) return { btcTrend, ap };
  const setV = (id, text, n) => { const e = document.getElementById(id); if (e) { e.textContent = text; e.className = 'perf-legend-val ' + (n >= 0 ? 'up' : 'down'); } };
  setV('perfPortfolioLabel', (ap.total >= 0 ? '+' : '−') + SamsamFmt.usd(Math.abs(ap.total)), ap.total);
  setV('perfPortfolioPct', tri(ap.pct), ap.total);
  setV('perfBtcLabel', tri(btcTrend), btcTrend);
}

function updatePerfChart() {
  // Called after live prices load — save snapshot then redraw
  const { total } = calcStats();
  if (total > 0 && btcPrice > 0) {
    savePerfSnapshot(total, btcPrice);
    drawPerfChart();
  }
}

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

/* ── Holdings Full View ── */
// URL routes: #holdings → list, #holdings/BTC → BTC transactions. Refresh and the
// browser/phone Back button always land on the right screen.
let coinTxSym = null;
function holdingsRoute() {
  const m = location.hash.match(/^#holdings(?:\/([^/?#]+))?$/);
  return m ? { open: true, sym: m[1] ? decodeURIComponent(m[1]).toUpperCase() : null } : { open: false, sym: null };
}
function showHoldingsOverlay() {
  const overlay = document.getElementById('holdingsOverlay');
  if (!overlay) return null;
  if (overlay.style.display !== 'flex') {
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    // Reset range tabs to 24h when the overlay opens
    overlay.querySelectorAll('.hov-tab').forEach(b => b.classList.remove('active'));
    const first = overlay.querySelector('.hov-tab');
    if (first) first.classList.add('active');
    holdingsOverlayRange = '24h';
  }
  return overlay;
}
function applyHoldingsRoute() {
  const r = holdingsRoute();
  const overlay = document.getElementById('holdingsOverlay');
  if (!overlay) return;
  if (!r.open) {
    overlay.style.display = 'none'; overlay.removeAttribute('data-view');
    document.body.style.overflow = ''; coinTxSym = null; return;
  }
  showHoldingsOverlay();
  if (r.sym) {
    coinTxSym = r.sym;
    overlay.setAttribute('data-view', 'tx');
    document.getElementById('hovNavTitle').textContent = r.sym + ' Transactions'; document.getElementById('hovNavIcon').innerHTML = SamsamUI.ic('receipt', { solo: true, size: 22, sw: 1.9, cls: 'nav-ic' });
    renderCoinTx();
  } else {
    coinTxSym = null;
    overlay.removeAttribute('data-view');
    document.getElementById('hovNavTitle').textContent = 'Holdings'; document.getElementById('hovNavIcon').innerHTML = SamsamUI.navIcon('holdings');
    drawHoldingsOverlayChart();
    renderHoldingsAssetList();
  }
  overlay.scrollTop = 0;
}
function openHoldingsView() {
  if (location.hash !== '#holdings') history.pushState({ hov: 'list' }, '', '#holdings');
  applyHoldingsRoute();
}
function closeHoldingsView() {
  history.pushState(null, '', location.pathname + location.search);
  applyHoldingsRoute();
}
function openCoinTx(sym) {
  history.pushState({ hov: 'tx' }, '', '#holdings/' + encodeURIComponent(sym));
  ensureHtxDropdowns(); htxTypeDD.setValue('all');
  applyHoldingsRoute();
}
// "Back to Holdings": step back if we came from the list, otherwise replace the URL.
function closeCoinTx() {
  if (history.state && (history.state.hov === 'tx' || history.state.ret)) history.back();   // ret: came from Allocation / Performance → back there
  else { history.replaceState({ hov: 'list' }, '', '#holdings'); applyHoldingsRoute(); }
}
function selectCoinTx(sym) {
  history.replaceState(history.state, '', '#holdings/' + encodeURIComponent(sym));   // same history entry (keeps "ret"; a page opened straight on a coin still goes Back to Holdings)
  applyHoldingsRoute();
}
function hovBack() { if (coinTxSym) closeCoinTx(); else closeHoldingsView(); }

// Restore the right screen on load / refresh, and follow the Back button
window.addEventListener('DOMContentLoaded', function() {
  // Opened from another page (SamsamUI.openCoin) → Back on this screen returns to that page
  try { const r = JSON.parse(sessionStorage.getItem('cpReturn') || 'null'); sessionStorage.removeItem('cpReturn');
    const route = holdingsRoute();
    if (r && route.sym === r.sym && Date.now() - r.t < 60000 && history.length > 1) history.replaceState({ hov: 'tx', ret: 1 }, '', location.hash);
  } catch (_) {}
  if (holdingsRoute().open) setTimeout(applyHoldingsRoute, 300);
});
window.addEventListener('popstate', applyHoldingsRoute);

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
  if (liq) {   // CoinGlass maps only coins with futures — the others get a plain note instead of an empty page
    const noFut = SamsamCoins.hasFutures(sym) === false;
    liq.classList.toggle('off', noFut);
    if (noFut) { liq.removeAttribute('href'); liq.title = `${sym} has no futures market, so CoinGlass has no liquidation map for it`; liq.innerHTML = SamsamUI.ic('flame', { solo: true }) + 'No futures'; }
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
      entries.push({ id: t.id, kind: t.type, label: t.type === 'buy' ? 'Buy' : 'Sell', qty: t.qty - feeQ, usd: (t.total ?? t.qty * t.price) + (t.type === 'buy' ? feeU : -feeU),
        note: (t.note ? t.note + ' · ' : '') + '@ ' + priceFmt(t.price) + (feeU ? ' · fee ' + usd(feeU) : '') + (feeQ ? ' · fee ' + qtyFmt(feeQ) + ' ' + sym : '') + (t.type === 'sell' && r && r.realized != null ? ` · ${r.realized >= 0 ? 'profit' : 'loss'} ${usd(Math.abs(r.realized))}` : ''),
        date: t.date, order: t.createdAt || '' });
    } else if (t.type === 'transfer_in' && t.kind === 'reward') {
      entries.push({ id: t.id, kind: 'reward', label: 'Reward', qty: t.qty - (+t.fee || 0), usd: (t.qty - (+t.fee || 0)) * (price || 0),
        note: [t.note, '$0 cost · value now'].filter(Boolean).join(' · '), date: t.date, order: t.createdAt || '' });
    } else if (t.type === 'transfer_in' || t.type === 'transfer_out') {
      const isIn = t.type === 'transfer_in', fee = +t.fee || 0;
      entries.push({ id: t.id, kind: t.type, label: isIn ? SAMSAM_LABELS.TRANSFER_IN : SAMSAM_LABELS.TRANSFER_OUT,
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
        : `<button type="button" class="htx-act" onclick="deleteTx('${e.id}')" title="Delete" aria-label="Delete this ${e.label}">${SamsamUI.ic('trash', { solo: true })}</button>`}</div>
    </div>`;
  });
  listEl.innerHTML = html;
}

let holdingsOverlayRange = '24h';

function setHoldingsOverlayRange(range, btn) {
  holdingsOverlayRange = range;
  document.querySelectorAll('.hov-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  drawHoldingsOverlayChart();
}

// Redraw the Holdings chart when its card changes width (rotation, window resize)
(function () {
  const wrap = document.querySelector('#holdingsOverlay .hov-chart-wrap');
  if (!wrap || !window.ResizeObserver) return;
  let t; new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => {
    const ov = document.getElementById('holdingsOverlay');
    if (ov && ov.style.display === 'flex' && !coinTxSym) drawHoldingsOverlayChart();
  }, 60); }).observe(wrap);
})();
function drawHoldingsOverlayChart() {
  const canvas = document.getElementById('hovCanvas');
  if (!canvas) return;
  const allSnaps = loadHoldingsSnaps();
  const now = Date.now();
  const rangeMs = { '24h': 86400000, '7d': 604800000, '30d': 2592000000, '90d': 7776000000, 'all': Infinity };
  const cutoff = holdingsOverlayRange === 'all' ? 0 : now - rangeMs[holdingsOverlayRange];
  let snaps = allSnaps.filter(s => s.t >= cutoff);
  if (snaps.length === 0) { snaps = allSnaps.length ? [allSnaps[allSnaps.length-1]] : []; }
  snaps = withLiveTotal(snaps);
  if (snaps.length === 1) snaps = [snaps[0], snaps[0]];

  const totalEl  = document.getElementById('hovTotal');
  const changeEl = document.getElementById('hovChange');

  if (snaps.length === 0) {
    if (totalEl) { const {total} = calcStats(); totalEl.textContent = total > 0 ? SamsamFmt.usd(total) : '$—'; }
    if (changeEl) changeEl.textContent = '';
    canvas.style.display = 'none';
    return;
  }
  canvas.style.display = '';

  const last = snaps[snaps.length-1].v;
  const hc = holdingsChangeText(snaps), isPos = hc.up;

  if (totalEl) totalEl.textContent = SamsamFmt.usd(last);
  if (changeEl) { changeEl.textContent = hc.text; changeEl.title = hc.title; changeEl.className = 'hov-change ' + (isPos ? 'pos' : 'neg'); }

  const lineColor = isPos ? '#22c55e' : '#f43f5e'; // green when up, red when down
  SamsamChart.draw(canvas, { height: 210, format: 'usd', hover: true, timeMode: timeModeFor(holdingsOverlayRange), series: [{ points: snaps, color: lineColor, width: 2.6, fill: true, name: 'Portfolio' }] });
}

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
// Assets | Allocation switch (Allocation = donut by category + each coin's share of the whole portfolio)
let hovMode = 'assets';
try { if (localStorage.getItem('samsam_hov_mode') === 'alloc') hovMode = 'alloc'; } catch (_) {}
function setHovMode(m, quiet) {
  hovMode = m === 'alloc' ? 'alloc' : 'assets';
  try { localStorage.setItem('samsam_hov_mode', hovMode); } catch (_) {}
  paintHovMode();
  if (!quiet) { renderHoldingsAssetList(); if (hovMode === 'assets' && typeof drawHoldingsOverlayChart === 'function') drawHoldingsOverlayChart(); }   // the chart was hidden → draw it at its real size
}
function paintHovMode() {
  const ov = document.getElementById('holdingsOverlay'); if (ov) ov.setAttribute('data-mode', hovMode);
  document.querySelectorAll('#hovModeSeg > button').forEach(b => { const on = b.dataset.m === hovMode; b.classList.toggle('btn-toggle-active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  const h = document.querySelector('.hov-list-header .hov-h-lbl'); if (h) h.textContent = hovMode === 'alloc' ? 'Allocation' : 'Holdings';
  const tabs = document.getElementById('hovPtabs'); if (tabs && window.SamsamUI && SamsamUI.ptabs) SamsamUI.ptabs(tabs, hovMode === 'alloc' ? 'allocation' : 'holdings');
  if (ov && ov.getAttribute('data-view') !== 'tx') {   // the screen's title follows the tab
    const t = document.getElementById('hovNavTitle'), ic = document.getElementById('hovNavIcon');
    if (t) t.textContent = hovMode === 'alloc' ? 'Allocation' : 'Holdings';
    if (ic && window.SamsamUI) ic.innerHTML = SamsamUI.navIcon(hovMode === 'alloc' ? 'allocation' : 'holdings');
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
// ── Target allocation (Allocation mode): your target % per group (Bitcoin on its own, then your categories), how far
// each group is from it, and what to buy / trim — with new money only, or a full rebalance (samsam-core.js → allocationPlan).
function tgGroups() {
  const out = {};
  portfolio.forEach(c => { const v = c.qty * c.currentPrice; if (v > 0) { const g = Samsam.core.groupOf(c); out[g] = (out[g] || 0) + v; } });
  return out;
}
const tgLabel = g => SamsamTaxonomy.label(g);   // Bitcoin is a category like the others (renamed in Manage Categories too)
const tgColor = g => SamsamTaxonomy.color(g);
let tgMode = 'cash', tgCash = 500;
try { tgMode = localStorage.getItem('samsam_rb_mode') === 'full' ? 'full' : 'cash'; tgCash = Math.max(0, +localStorage.getItem('samsam_rb_cash') || 500); } catch (_) {}
// coins to use in a group: to buy — Reinforce first, never Sell / Convert; to trim — Sell / Convert first, then the biggest
function tgCoins(g, buy) {
  const pri = buy ? { reinforce: 0, hold: 1, convert: 9 } : { convert: 0, hold: 1, reinforce: 2 };
  return portfolio.filter(c => !isSoldOut(c) && Samsam.core.groupOf(c) === g)
    .map(c => ({ c, a: getAction(c.sym, 0, c), v: c.qty * c.currentPrice }))
    .filter(x => !buy || x.a !== 'convert')
    .sort((x, y) => pri[x.a] - pri[y.a] || y.v - x.v).slice(0, 3)
    .map(x => x.c.sym + (x.a === 'reinforce' ? ' (Reinforce)' : x.a === 'convert' ? ' (Sell / Convert)' : ''));
}
function renderHovTargets() {
  const box = document.getElementById('hovTgtCard'); if (!box || hovMode !== 'alloc' || !window.Samsam || !Samsam.core || !Samsam.core.allocationPlan) return;
  const t = Samsam.getTargets ? Samsam.getTargets() : null, ic = n => SamsamUI.ic(n, { solo: true, size: 16 });
  if (!t) {
    box.innerHTML = `<div class="tg-h"><span class="tg-ic">${ic('target')}</span><b>Target allocation</b></div>
      <div class="tg-empty"><p>Set the share you want for each category (Bitcoin included) — see how far you are from it, and exactly what to buy (or trim) to get back.</p>
      <button type="button" class="tg-go" onclick="openTargets()">${ic('target')}Set my targets</button></div>`;
    return;
  }
  const esc = SamsamCoins.esc, usd = v => SamsamFmt.usd(v), f1 = v => v.toFixed(1) + '%', pts = v => Math.abs(v) < 0.05 ? '0.0' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(1);   // a rounding crumb is 0.0, no sign
  const plan = Samsam.core.allocationPlan(tgGroups(), t.cats, { band: t.band, cash: tgMode === 'cash' ? tgCash : 0 });
  const shown = plan.groups.filter(g => g.target > 0 || g.now >= 0.05);
  tgSyncNames(t, shown.map(g => g.key));   // a group with no target and (almost) nothing in it: left out
  plan.count = shown.length; plan.onTarget = shown.filter(g => g.state === 'ok').length;
  const rows = shown.map(g => `<div class="tg-row" data-g="${esc(g.key)}">
      <div class="tg-l"><span class="tg-dot" style="background:${tgColor(g.key)}"></span><span class="tg-n">${esc(tgLabel(g.key))}</span>
        <span class="tg-v"><b>${f1(g.now)}</b> → ${f1(g.target)}</span><span class="tg-d ${g.state}" title="points away from your target">${g.state === 'ok' ? '✓ ' : ''}${pts(g.drift)}</span></div>
      <div class="tg-bar"><i style="width:${Math.min(100, g.now).toFixed(2)}%;background:${tgColor(g.key)}"></i>${g.target > 0 ? `<u style="left:${Math.min(100, g.target).toFixed(2)}%" title="target ${f1(g.target)}"></u>` : ''}</div></div>`).join('');
  let acts;
  if (tgMode === 'cash') {
    const list = plan.groups.filter(g => g.add >= 1).sort((a, b) => b.add - a.add);
    acts = list.length ? list.map(g => { const coins = tgCoins(g.key, true);
      return `<div class="tg-act"><span class="tg-dot" style="background:${tgColor(g.key)}"></span><span class="tg-n">${esc(tgLabel(g.key))}<span>${coins.length ? esc(coins.join(' · ')) : 'no coin in this category yet — pick one to add'}</span></span><span class="tg-amt buy">+${usd(g.add)}</span></div>`; }).join('')
      : '<div class="tg-note">Type an amount to see where it should go.</div>';
  } else {
    const list = plan.groups.filter(g => Math.abs(g.full) >= 1 && g.state !== 'ok').sort((a, b) => Math.abs(b.full) - Math.abs(a.full));
    acts = list.length ? list.map(g => { const buy = g.full > 0, coins = tgCoins(g.key, buy);
      return `<div class="tg-act"><span class="tg-dot" style="background:${tgColor(g.key)}"></span><span class="tg-n">${buy ? 'Buy' : 'Trim'} ${esc(tgLabel(g.key))}<span>${coins.length ? esc(coins.join(' · ')) : 'no coin in this category yet — pick one to add'}</span></span><span class="tg-amt ${buy ? 'buy' : 'sell'}">${buy ? '+' : '−'}${usd(Math.abs(g.full))}</span></div>`; }).join('')
      : `<div class="tg-note">${ic('checkCircle')} Every group is inside your ±${t.band} band — nothing to do.</div>`;
  }
  // a card: closed it shows the title + how many categories are on target; tap it to open (remembered on this device)
  let tgOpen = false; try { tgOpen = localStorage.getItem('samsam_tg_open') === '1'; } catch (_) {}
  const off = shown.filter(g => g.state !== 'ok').length;
  box.innerHTML = `<div class="tg-h tg-tap" role="button" tabindex="0" aria-expanded="${tgOpen}" aria-controls="tgBody"><span class="tg-ic">${ic('target')}</span><b>Target allocation</b><button type="button" class="tg-edit" onclick="event.stopPropagation();openTargets()">${SamsamUI.ic('pencil', { solo: true, size: 13 })}Edit</button>
      <span class="tg-chev" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></div>
    <div class="tg-sub tg-tap2"><b>${plan.onTarget} of ${plan.count}</b> categories on target · band ±${t.band} pts${!tgOpen && off ? ` · <span class="tg-offn">${off} to rebalance</span>` : ''}</div>
    <div class="tg-body" id="tgBody"${tgOpen ? '' : ' hidden'}>
    <div class="tg-rows">${rows}</div>
    <div class="tg-rb"><div class="tg-rb-h"><b>Rebalance</b><span class="tg-seg" role="group" aria-label="Rebalance with"><button type="button" data-m="cash" aria-pressed="${tgMode === 'cash'}">New money</button><button type="button" data-m="full" aria-pressed="${tgMode === 'full'}">Full rebalance</button></span></div>
      ${tgMode === 'cash' ? `<div class="tg-cash">Invest <label>$<input type="text" inputmode="decimal" id="tgCash" value="${tgCash}" aria-label="Amount to invest"></label> without selling anything</div>` : '<div class="tg-cash">Buy and trim so every group is on target (your total stays the same)</div>'}
      <div class="tg-acts">${acts}</div>
      <div class="tg-note">At today's prices. Coins to use: Reinforce first; to trim, Sell / Convert first. A plan to check, not advice.</div></div></div>`;
  const tgTog = () => { try { localStorage.setItem('samsam_tg_open', tgOpen ? '0' : '1'); } catch (_) {} renderHovTargets(); };
  box.querySelector('.tg-h').onclick = tgTog; box.querySelector('.tg-sub').onclick = tgTog;
  box.querySelector('.tg-h').onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); tgTog(); } };
  box.querySelectorAll('.tg-seg button').forEach(b => b.onclick = () => { tgMode = b.dataset.m; try { localStorage.setItem('samsam_rb_mode', tgMode); } catch (_) {} renderHovTargets(); });
  const ci = document.getElementById('tgCash');
  if (ci) ci.onchange = ci.onkeyup = e => { const v = Math.max(0, parseFloat(String(ci.value).replace(/[^0-9.]/g, '')) || 0); if (v === tgCash && e.type !== 'change') return; tgCash = v; try { localStorage.setItem('samsam_rb_cash', String(v)); } catch (_) {}
    clearTimeout(ci._t); ci._t = setTimeout(() => { const pos = ci.selectionStart; renderHovTargets(); const n = document.getElementById('tgCash'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} } }, e.type === 'change' ? 0 : 450); };
}
// A category renamed (Manage Categories): the targets follow the category, not its name — on screen at once; the copy of
// the names the Telegram alerts use is refreshed here (one save, only when a name really changed)
let tgNamesBusy = false;
function tgSyncNames(t, keys) {
  if (tgNamesBusy || !t) return;
  const all = [...new Set([...Object.keys(t.cats), ...keys])], names = Object.fromEntries(all.map(k => [k, tgLabel(k)]));
  if (all.every(k => (t.names || {})[k] === names[k])) return;
  tgNamesBusy = true;
  const cats = Object.fromEntries(Object.entries(t.cats).map(([k, v]) => [k, { pct: v.pct, label: names[k] }]));
  Samsam.setTargets({ cats, band: t.band, names }).catch(() => {}).finally(() => { tgNamesBusy = false; });   // once saved, the names match: no second save
}
// the editor: a % per group, adding up to 100
function openTargets() {
  if (!requireCloud()) return;
  document.getElementById('tgModal')?.remove();
  const t = Samsam.getTargets(), now = tgGroups(), total = Object.values(now).reduce((a, b) => a + b, 0), esc = SamsamCoins.esc;
  const keys = [...new Set(['btc', ...Object.keys(now).sort((a, b) => now[b] - now[a]), ...Object.keys((t && t.cats) || {})])];
  const all = [...new Set(['btc', ...SamsamTaxonomy.ORDER, ...SamsamTaxonomy.customs().map(c => c.key), 'other'])].filter(k => !SamsamTaxonomy.isRemoved(k));
  const el = document.createElement('div'); el.className = 'bl-overlay show'; el.id = 'tgModal'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'tgTitle');
  const row = k => `<div class="tge-row" data-g="${esc(k)}"><span class="tg-dot" style="background:${tgColor(k)}"></span><span class="tg-n">${esc(tgLabel(k))}<span>now ${(total > 0 ? (now[k] || 0) / total * 100 : 0).toFixed(1)}%</span></span>
      <span class="tge-in"><input type="text" inputmode="decimal" value="${t && t.cats[k] ? +t.cats[k].pct : ''}" placeholder="0" aria-label="${esc(tgLabel(k))} target %"><i>%</i></span>
      ${now[k] ? '<span style="width:30px"></span>' : `<button type="button" class="tge-x" aria-label="Remove ${esc(tgLabel(k))}">${SamsamUI.ic('x', { solo: true, size: 15 })}</button>`}</div>`;
  el.innerHTML = `<div class="bl-card">
    <div class="bl-head"><span style="color:var(--accent)">${SamsamUI.ic('target', { solo: true, size: 22 })}</span><h3 id="tgTitle">Target allocation</h3><button type="button" class="bl-x" aria-label="Close">×</button></div>
    <p class="bl-lead">The share you want for each category. They must add up to 100%.</p>
    <div class="tge-rows">${keys.map(row).join('')}</div>
    <div class="tge-tools"><select id="tgAdd" aria-label="Add a group"><option value="">+ Add a category</option>${all.filter(k => !keys.includes(k)).map(k => `<option value="${esc(k)}">${esc(tgLabel(k))}</option>`).join('')}</select>
      <button type="button" data-act="current">Use my current split</button><button type="button" data-act="clear">Clear</button></div>
    <label class="bl-field"><span>Band — how far a category may drift before it counts as off target</span>
      <select id="tgBand" style="height:40px;border-radius:10px;border:1px solid var(--border);background:var(--bg3);color:var(--fg);font:inherit;padding:0 10px">${[3, 5, 10, 15].map(b => `<option value="${b}" ${(t ? t.band : 5) === b ? 'selected' : ''}>±${b} points</option>`).join('')}</select></label>
    <div class="tge-sum" id="tgSum" aria-live="polite"></div>
    <div class="bl-acts"><button type="button" data-act="cancel">Cancel</button><button type="button" class="bl-save" data-act="save">Save</button></div>
    ${t ? '<button type="button" class="bl-reset" data-act="remove">Remove my targets</button>' : ''}
  </div>`;
  document.body.appendChild(el);
  const rowsBox = el.querySelector('.tge-rows'), sumEl = el.querySelector('#tgSum'), save = el.querySelector('[data-act=save]');
  const read = () => { const cats = {}; let sum = 0; rowsBox.querySelectorAll('.tge-row').forEach(r => { const v = parseFloat(String(r.querySelector('input').value).replace(',', '.')); if (v > 0) { cats[r.dataset.g] = { pct: Math.round(v * 100) / 100, label: tgLabel(r.dataset.g) }; sum += v; } }); return { cats, sum: Math.round(sum * 100) / 100 }; };
  const paint = () => { const { sum } = read(), ok = Math.abs(sum - 100) <= 0.05; sumEl.className = 'tge-sum ' + (ok ? 'ok' : 'bad');
    sumEl.textContent = ok ? 'Total 100% ✓' : sum < 100 ? `Total ${+sum.toFixed(2)}% — ${+(100 - sum).toFixed(2)}% left to place` : `Total ${+sum.toFixed(2)}% — ${+(sum - 100).toFixed(2)}% too much`; save.disabled = !ok; };
  const wire = r => { r.querySelector('input').oninput = paint; const x = r.querySelector('.tge-x'); if (x) x.onclick = () => { r.remove(); paint(); }; };
  rowsBox.querySelectorAll('.tge-row').forEach(wire);
  el.querySelector('#tgAdd').onchange = e => { const k = e.target.value; if (!k) return; rowsBox.insertAdjacentHTML('beforeend', row(k)); wire(rowsBox.lastElementChild); e.target.querySelector(`option[value="${CSS.escape(k)}"]`)?.remove(); e.target.value = ''; rowsBox.lastElementChild.querySelector('input').focus(); paint(); };
  el.querySelector('[data-act=current]').onclick = () => {   // today's split, rounded to 0.1 and made to add up to exactly 100
    const ins = [...rowsBox.querySelectorAll('.tge-row')].map(r => ({ i: r.querySelector('input'), v: total > 0 ? (now[r.dataset.g] || 0) / total * 100 : 0 }));
    ins.forEach(x => { x.r = Math.round(x.v * 10) / 10; }); const diff = Math.round((100 - ins.reduce((s, x) => s + x.r, 0)) * 10) / 10, big = ins.reduce((a, b) => b.v > a.v ? b : a, ins[0]);
    if (big) big.r = Math.round((big.r + diff) * 10) / 10; ins.forEach(x => { x.i.value = x.r > 0 ? x.r : ''; }); paint(); };
  el.querySelector('[data-act=clear]').onclick = () => { rowsBox.querySelectorAll('input').forEach(i => { i.value = ''; }); paint(); };
  const close = () => { el.remove(); document.removeEventListener('keydown', key, true); };
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', key, true);
  el.addEventListener('click', e => { if (e.target === el) close(); });
  el.querySelector('.bl-x').onclick = close; el.querySelector('[data-act=cancel]').onclick = close;
  save.onclick = async () => { const { cats } = read(); save.disabled = true;
    const names = Object.fromEntries([...rowsBox.querySelectorAll('.tge-row')].map(r => [r.dataset.g, tgLabel(r.dataset.g)]));   // every group's name, for the Telegram alerts
    try { await Samsam.setTargets({ cats, band: +el.querySelector('#tgBand').value, names }); close(); renderHoldingsAssetList(); }
    catch (e) { sumEl.className = 'tge-sum bad'; sumEl.textContent = (e && e.message) || String(e); save.disabled = false; } };
  const rm = el.querySelector('[data-act=remove]');
  if (rm) rm.onclick = async () => { await Samsam.setTargets(null); close(); renderHoldingsAssetList(); };
  paint(); setTimeout(() => rowsBox.querySelector('input').focus(), 30);
}
// Each coin: › its transactions, ⌄ its three outside links (Liq.Map · Prediction · CMC). Open rows stay open across
// the live price refreshes; the search box filters by symbol or name.
const hovOpen = new Set(); let hovQuery = '';
function toggleHovLinks(sym, btn) {
  const box = document.getElementById('hovLinks-' + sym); if (!box) return;
  const on = box.hidden; box.hidden = !on; on ? hovOpen.add(sym) : hovOpen.delete(sym);
  if (btn) btn.setAttribute('aria-expanded', String(on));
}
function hovSearch(v) { hovQuery = String(v || '').trim().toUpperCase(); renderHoldingsAssetList(); }
const HOV_CHEV = d => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
function renderHoldingsAssetList() {
  const container = document.getElementById('hovAssetList');
  if (!container || !portfolio) return;
  paintHovMode();
  renderHovCatPicker();
  renderHovDonut();
  renderHovTargets();
  const allVal = portfolio.reduce((s, c) => s + (c.qty * c.currentPrice || 0), 0);
  const maxVal = hovMode === 'alloc' ? portfolio.filter(c => !hovCat || (c.cat || 'other') === hovCat).reduce((m, c) => Math.max(m, c.qty * c.currentPrice || 0), 0) : 0;
  const val = c => hovSort.key === 'asset' ? c.sym : hovSort.key === 'price' ? (c.currentPrice || 0) : c.holdingVal;
  const sorted = portfolio.filter(c => !hovCat || (c.cat || 'other') === hovCat)
    .filter(c => !hovQuery || c.sym.includes(hovQuery) || String(COIN_NAMES[c.sym] || c.name || '').toUpperCase().includes(hovQuery))
    .map(c => ({ ...c, holdingVal: c.qty * c.currentPrice }))
    .sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * hovSort.dir || b.holdingVal - a.holdingVal; });
  document.querySelectorAll('.hov-list-header .hov-sort').forEach(b => {
    const on = b.dataset.sort === hovSort.key;
    b.classList.toggle('active', on);
    b.setAttribute('aria-sort', on ? (hovSort.dir > 0 ? 'ascending' : 'descending') : 'none');
    b.querySelector('i').textContent = on ? (hovSort.dir > 0 ? ' ▲' : ' ▼') : '';
  });

  container.innerHTML = sorted.map(c => {
    const pct24 = c.change24h ?? 0;
    const sign = pct24 >= 0 ? '+' : '';
    const clr = pct24 >= 0 ? 'var(--green)' : 'var(--red)';
    const arrow = pct24 >= 0 ? '▲' : '▼';
    const priceStr = SamsamFmt.price(c.currentPrice);
    const holdVal = SamsamFmt.usd(c.holdingVal);
    // amount (the coin is already named on the row, so no symbol here): fewer decimals as the number grows,
    // K / M from 10,000 so it always fits on one line on a phone — 0.009564 · 1.0985 · 9,997.75 · 84.65K · 1.25M
    // (full amount with the symbol in the tooltip)
    const q = Number(c.qty) || 0;
    const holdQty = (q >= 1e6 ? +(q / 1e6).toFixed(2) + 'M'
      : q >= 1e4 ? +(q / 1e3).toFixed(2) + 'K'
      : q.toLocaleString('en-US', { maximumFractionDigits: q < 1 ? 8 : q < 1000 ? 4 : 2 }));
    // $3,113.26 → the cents a little lighter, like the reference design
    const vm = /^(.*?)(\.\d+)$/.exec(holdVal);
    const holdValHtml = vm ? `${vm[1]}<span class="hov-cents">${vm[2]}</span>` : holdVal;
    const holdQtyFull = q.toLocaleString('en-US', { maximumFractionDigits: 8 }) + ' ' + c.sym;
    // Symbol + name (and logo) open the coin on CoinMarketCap, like the main table
    const cgUrl = getCoinGeckoUrl(c.sym);
    const coinName = COIN_NAMES[c.sym] || c.name || c.sym;
    const nameInner = `<span class="hov-name">${coinName}</span>${cgUrl ? SamsamCoins.EXT : ''}`;
    const nameEl = cgUrl
      ? `<a class="hov-asset-name hov-cg-link ext-link" href="${cgUrl}" target="_blank" rel="noopener noreferrer" title="Open ${coinName} on CoinMarketCap">${nameInner}</a>`
      : `<div class="hov-asset-name">${nameInner}</div>`;
    // Two columns: coin name over price · 24h change  |  value over symbol + amount
    return `<div class="hov-asset-row" data-sym="${c.sym}">
      <div class="hov-coin-icon">${getCoinIconLinked(c.sym, 36)}</div>
      <div class="hov-asset-left">
        ${SamsamCoins.assetText(c.sym, { price: c.currentPrice, change24h: c.change24h ?? 0, cgId: c.cgId, name: coinName })}
      </div>
      <div class="hov-asset-holding htx-open" role="button" tabindex="0" title="View ${c.sym} transactions"
           onclick="openCoinTx('${c.sym}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openCoinTx('${c.sym}')}">
        <span class="hov-hold-txt">${SamsamCoins.holdCell(c.sym, c.qty * c.currentPrice, c.qty, hovMode === 'alloc' ? { below: `<div class="hov-share"><span class="alloc-bar-wrap"><span class="alloc-bar" style="width:${maxVal > 0 ? Math.max(2, c.holdingVal / maxVal * 100) : 0}%;background:${SamsamTaxonomy.color(c.cat || 'other')}"></span></span><span class="coin-pct">${(allVal > 0 ? c.holdingVal / allVal * 100 : 0).toFixed(2)}%</span></div>` } : undefined)}</span>
        <span class="hov-arrows">
          <button type="button" class="hov-btn hov-go" title="${c.sym} transactions" aria-label="Open ${c.sym} transactions" onclick="event.stopPropagation();openCoinTx('${c.sym}')">${HOV_CHEV('m9 6 6 6-6 6')}</button>
          <button type="button" class="hov-btn hov-more" title="${c.sym}: Liq.Map, Prediction, CMC" aria-label="${c.sym} links: Liq.Map, Prediction, CMC" aria-expanded="${hovOpen.has(c.sym)}" aria-controls="hovLinks-${c.sym}" onclick="event.stopPropagation();toggleHovLinks('${c.sym}',this)" onkeydown="event.stopPropagation()">${HOV_CHEV('m6 9 6 6 6-6')}</button>
        </span>
      </div>
    </div>
    <div class="hov-links" id="hovLinks-${c.sym}"${hovOpen.has(c.sym) ? '' : ' hidden'}>${SamsamCoins.quickLinks(c.sym, { cgId: c.cgId, ccSlug: c.ccSlug, name: coinName })}</div>`;
  }).join('') || (hovQuery ? `<div class="hov-none">No coin matches “${String(hovQuery).replace(/[<>&"]/g, '')}”.</div>` : '');
}
