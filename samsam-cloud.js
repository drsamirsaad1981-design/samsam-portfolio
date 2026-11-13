// samsam-cloud.js — the ONLY place the app reads or writes portfolio data.
//
// Cloud database: Firebase Firestore, one private space per signed-in user:
//   users/{uid}/coins/{SYM}     coin settings + opening position (never a running balance)
//   users/{uid}/txs/{id}        immutable buy / sell / adjust ledger
//   users/{uid}/accum/{SYM}     accumulation targets
//   users/{uid}/snaps/{YYYY-MM-DD}  chart snapshots (merged, so devices never overwrite each other)
//   users/{uid}/meta/info       schema + migration record
//
// Every change is written straight to Firestore. Firestore keeps an offline copy on the
// device (IndexedDB), shows the change instantly, queues it while offline and uploads it
// on reconnect. Every open device listens live, so a change on one device appears on the
// others within a second or two — no Save button, no refresh, no polling.
//
// Pages talk to this module through window.Samsam (see the API at the bottom).

import * as Core from './samsam-core.js?v=202611132329';
import * as Hist from './samsam-history.js?v=202611132329';
import { FIREBASE_CONFIG, ALLOWED_EMAILS } from './firebase-config.js?v=202611132329';

const SDK = 'https://www.gstatic.com/firebasejs/13.0.0';
const PRICE_KEY = 'samsam_prices_v1';      // device-local live-price cache (not user data)
const DEVICE_KEY = 'samsam_device_id';
const LEGACY = {
  pf: 'samsam_pf_v4', tx: 'samsam_tx_v1', custom: 'samsam_custom_v1', archived: 'samsam_archived_v1',
  acc: 'samsam_acc_v1', perf: 'samsam_perf_v1', holdings: 'samsam_holdings_v1',
};

// ── small helpers ───────────────────────────────────────────────────────────
const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
};
const deviceId = (() => {
  let id = null; try { id = localStorage.getItem(DEVICE_KEY); } catch (_) {}
  if (!id) { id = Core.newId('dev_'); try { localStorage.setItem(DEVICE_KEY, id); } catch (_) {} }
  return id;
})();
const UIc = (n, o) => (window.SamsamUI && SamsamUI.ic ? SamsamUI.ic(n, o) : '');
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = obj => JSON.parse(JSON.stringify(obj)); // Firestore rejects `undefined`
const safeId = s => String(s).replace(/[\/#\[\]?*]/g, '_').slice(0, 300) || 'x';

// ── input hygiene (XSS / injection) ─────────────────────────────────────────
// Every document is cleaned when it is READ from the cloud and before it is WRITTEN, so a value
// typed on any device (or edited in the console) can never carry markup or script into a page.
const TX_TYPES = ['buy', 'sell', 'adjust', 'transfer_in', 'transfer_out'];
export const Clean = {
  sym: v => String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 20),
  label: (v, max = 80) => String(v == null ? '' : v).replace(/[<>"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, max),
  text: (v, max = 1000) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max),
  cgId: v => (typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(v)) ? v : null,
  url: v => (typeof v === 'string' && /^https:\/\/[^\s"'<>`\\]{1,500}$/.test(v)) ? v : null,
  key: v => (typeof v === 'string' && /^[a-z0-9_-]{1,30}$/.test(v)) ? v : undefined,
  num: v => { const n = Number(v); return Number.isFinite(n) ? n : 0; },
};
// Where a coin lives (the wallet check reads it there): nets = [{ k: network, c: token contract or '' for the network's own coin }]
//   k = 'btc' | 'sol' | 'ton' | 'sui' | 'apt' | 'near' | 'hbar' | 'kas' | 'doge' | 'atom' | 'sei' | 'kava' | 'evm:<CoinGecko platform>'
// at = where you keep it: 'wallet' | 'binance' | 'gate' | 'staked' | 'other'
export const COIN_PLACES = ['wallet', 'binance', 'gate', 'staked', 'other'];
function cleanNets(v) {
  if (!Array.isArray(v)) return null;
  const out = [];
  for (const x of v) {
    if (!x || out.length >= 6) continue;
    const k = String(x.k || '').trim().toLowerCase();
    if (!/^(btc|sol|ton|sui|apt|near|hbar|kas|doge|atom|sei|kava|evm:[a-z0-9][a-z0-9-]{0,60})$/.test(k)) continue;
    const c = String(x.c || '').trim().slice(0, 120);
    if (c && !/^[A-Za-z0-9:_-]{20,120}$/.test(c)) continue;
    if (!out.some(y => y.k === k && y.c.toLowerCase() === c.toLowerCase())) out.push({ k, c });
  }
  return out;
}
function cleanPlaces(v) { return Array.isArray(v) ? COIN_PLACES.filter(p => v.includes(p)) : null; }
function cleanCoin(c) {
  const o = { ...c, sym: Clean.sym(c.sym || c.id) };
  if ('name' in o) o.name = Clean.label(o.name) || o.sym;
  if ('notes' in o) o.notes = Clean.text(o.notes, 1000);
  if ('cgId' in o) o.cgId = Clean.cgId(o.cgId);
  if ('ccSlug' in o) o.ccSlug = Clean.cgId(o.ccSlug);
  if ('cmcSlug' in o) o.cmcSlug = Clean.cgId(o.cmcSlug);
  if ('logoUrl' in o) o.logoUrl = Clean.url(o.logoUrl);
  if ('cat' in o) o.cat = Clean.key(o.cat) || 'other';
  if ('catLabel' in o) o.catLabel = Clean.label(o.catLabel, 40) || null;
  if ('catLocked' in o) o.catLocked = o.catLocked === true;
  if ('nets' in o) o.nets = cleanNets(o.nets);
  if ('at' in o) o.at = cleanPlaces(o.at);
  if (o.opening) o.opening = { qty: Clean.num(o.opening.qty), avg: Clean.num(o.opening.avg) };
  return o;
}
function cleanTx(t) {
  const o = { ...t, sym: Clean.sym(t.sym), note: Clean.text(t.note, 500), qty: Clean.num(t.qty), price: Clean.num(t.price) };
  if (!TX_TYPES.includes(o.type)) o.type = 'adjust';
  return o;
}
function cleanAccum(a) {
  const o = { ...a, sym: Clean.sym(a.sym || a.id) };
  for (const k of ['name']) if (k in o) o.name = Clean.label(o.name);
  for (const k of ['note', 'notes']) if (k in o) o[k] = Clean.text(o[k], 500);
  if ('cgId' in o) o.cgId = Clean.cgId(o.cgId);
  if ('logoUrl' in o) o.logoUrl = Clean.url(o.logoUrl);
  if ('cat' in o) o.cat = Clean.key(o.cat) || 'other';
  if ('dca' in o) o.dca = Core.cleanDca(o.dca);   // the coin's regular buy (null = none)
  return o;
}

// ── state ───────────────────────────────────────────────────────────────────
const S = {
  configured: !!(FIREBASE_CONFIG && FIREBASE_CONFIG.projectId && !/PASTE/i.test(FIREBASE_CONFIG.apiKey || 'PASTE')),
  user: null, authResolved: false, denied: null,
  coins: new Map(), txs: new Map(), accum: new Map(), snapDocs: new Map(), meta: null, catCfg: null,
  loaded: { coins: false, txs: false, accum: false, snaps: false, meta: false, cats: false },
  fromCache: true, pending: 0, lastError: null, lastSyncedAt: null,
  prices: ls.get(PRICE_KEY, {}) || {},
  opts: { fallbackPrices: {}, basePortfolio: null, coinNames: {}, setupPage: false },
  listeners: new Set(), unsub: [], derived: null,
};
let fb = null; // { auth, db, fs (firestore fns), au (auth fns) }

const allLoaded = () => Object.values(S.loaded).every(Boolean);

// ── derived view (what pages render) ────────────────────────────────────────
// ── Baseline ─────────────────────────────────────────────────────────────────
// The day the app compares your coins with Bitcoin. Its BTC price ("BTC reference price") drives
// Portfolio vs BTC, the Hold / Reinforce / Sell signals and VS Bitcoin on Performance.
// Saved per user in users/{uid}/meta/info.baseline, so every page and device uses the same one.
export const DEFAULT_BASELINE = Object.freeze({ date: '2026-10-15', btcPrice: 81162 });
function cleanBaseline(b) {
  if (!b || typeof b !== 'object') return null;
  const date = String(b.date || ''), p = Number(b.btcPrice);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date + 'T00:00:00Z')) || !(p > 0 && p < 1e8)) return null;
  return { date, btcPrice: p, setAt: typeof b.setAt === 'string' ? b.setAt.slice(0, 40) : '', source: b.source === 'manual' ? 'manual' : 'coingecko' };
}
// ── Signal thresholds (Hold / Reinforce / Sell), saved in users/{uid}/meta/info.signal ──
//   change ≤ reinforce → Reinforce · change < sell → Sell / Convert · otherwise Hold   (change = price vs Avg. Buy Price, %)
export const DEFAULT_SIGNAL = Object.freeze({ reinforce: -5, sell: -20 });
function cleanSignal(s) {
  if (!s || typeof s !== 'object') return null;
  const r = Number(s.reinforce), x = Number(s.sell);
  if (!Number.isFinite(r) || !Number.isFinite(x) || r > 100 || r < -99 || x < -99.9 || x >= r) return null;
  return { reinforce: Math.round(r * 100) / 100, sell: Math.round(x * 100) / 100 };
}
// ── Market Hub watchlist (coins you follow, not own), saved in users/{uid}/meta/info.watch ──
function cleanWatch(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set(), out = [];
  for (const w of list) {
    if (!w || typeof w !== 'object') continue;
    const id = String(w.id || '').toLowerCase().slice(0, 100);
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    const img = typeof w.img === 'string' && /^https:\/\//.test(w.img) ? w.img.slice(0, 500) : '';
    out.push({ id, sym: String(w.sym || '').toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 20), name: String(w.name || '').slice(0, 80), img });
    if (out.length >= 200) break;
  }
  return out;
}
// ── Exit Strategy (Plan page): saved in users/{uid}/meta/info → exitTab, exitTargets, exitPlan ──
//   exitTargets: your macro levels — BTC.D at or under btcD, USDT.D inside usdtHi…usdtLo, ETH/BTC at or over ethBtc
//   exitPlan:    [{ sym, cgId?, baseQty, startedAt, moonbag, tps: [{ price, pct }] ×3 }]
//                baseQty = the amount held when the coin was added (buys recorded after startedAt add to it; selling TP1 never
//                shrinks TP2 / TP3); sells recorded after startedAt fill the steps in order.
export const DEFAULT_EXIT_TARGETS = Object.freeze({ btcD: 45.9, usdtHi: 3.73, usdtLo: 1.914, ethBtc: 0.085 });
const numIn = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
function cleanExitTargets(t) {
  const d = DEFAULT_EXIT_TARGETS; if (!t || typeof t !== 'object') return { ...d, isDefault: true };
  let hi = numIn(t.usdtHi, 0.01, 50) ?? d.usdtHi, lo = numIn(t.usdtLo, 0, 50) ?? d.usdtLo;
  if (lo > hi) [lo, hi] = [hi, lo];
  return { btcD: numIn(t.btcD, 1, 100) ?? d.btcD, usdtHi: hi, usdtLo: lo, ethBtc: numIn(t.ethBtc, 0.0001, 10) ?? d.ethBtc, isDefault: false };
}
function cleanExitPlan(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set(), out = [];
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const sym = String(e.sym || '').toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 20);
    if (!sym || seen.has(sym)) continue; seen.add(sym);
    // lock: true = a price you typed (fixed) · false = follows your average buy price × the step's multiplier ·
    // null = saved before this choice existed (the page decides from the price)
    const tps = (Array.isArray(e.tps) ? e.tps : []).slice(0, 3).map(t => ({ price: numIn(t && t.price, 0, 1e12) || 0, pct: numIn(t && t.pct, 0, 100) ?? 0,
      lock: t && t.lock === true ? true : t && t.lock === false ? false : null }));
    while (tps.length < 3) tps.push({ price: 0, pct: [25, 50, 25][tps.length], lock: false });
    const cg = String(e.cgId || '').toLowerCase();
    out.push({ sym, cgId: /^[a-z0-9][a-z0-9._-]{0,99}$/.test(cg) ? cg : '', baseQty: numIn(e.baseQty, 0, 1e15) || 0,
      startedAt: typeof e.startedAt === 'string' && !isNaN(Date.parse(e.startedAt)) ? e.startedAt.slice(0, 40) : new Date(0).toISOString(),
      moonbag: e.moonbag !== false, tps });
    if (out.length >= 100) break;
  }
  return out;
}
//   exitSteps:   your default steps — multipliers of the average buy price and the % sold at each (new coins, Auto)
export const DEFAULT_EXIT_STEPS = Object.freeze({ mults: [2, 3, 5], pcts: [25, 50, 25] });
function cleanExitSteps(v) {
  const d = DEFAULT_EXIT_STEPS; if (!v || typeof v !== 'object') return { mults: [...d.mults], pcts: [...d.pcts], isDefault: true };
  const mults = [0, 1, 2].map(i => numIn(Array.isArray(v.mults) ? v.mults[i] : null, 1.01, 10000) ?? d.mults[i]);
  let pcts = [0, 1, 2].map(i => numIn(Array.isArray(v.pcts) ? v.pcts[i] : null, 0, 100) ?? d.pcts[i]);
  if (Math.abs(pcts.reduce((a, b) => a + b, 0) - 100) > 0.05) pcts = [...d.pcts];
  return { mults, pcts, isDefault: false };
}
function currentExit() {
  const m = S.meta || {};
  return { tab: m.exitTab === 'exit' ? 'exit' : 'accum', targets: cleanExitTargets(m.exitTargets), plan: cleanExitPlan(m.exitPlan), steps: cleanExitSteps(m.exitSteps) };
}
// ── Target allocation, saved in users/{uid}/meta/info.targets ──
//   { cats: { group: { pct, label } }, band }   group = a category key, or 'btc' (Bitcoin on its own); pct add up to 100;
//   label = the group's name when saved (the Telegram alerts show it); band = how far (points) a group may drift.
//   Saved as a list ({ list: [{ g, pct, label }], band }): a saved map would be merged with the old one (a group you
//   removed would stay), a list is replaced whole.
function cleanTargets(t) {
  if (!t || typeof t !== 'object') return null;
  const src = Array.isArray(t.list) ? Object.fromEntries(t.list.filter(x => x && x.g).map(x => [String(x.g), x])) : t.cats;
  if (Array.isArray(t.names)) t = { ...t, names: Object.fromEntries(t.names.filter(x => x && x.g).map(x => [String(x.g), x.label])) };
  if (!src || typeof src !== 'object') return null;
  const cats = {}; let sum = 0, n = 0;
  for (const [k, v] of Object.entries(src)) {
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/i.test(k) || n >= 40) continue;
    const pct = numIn(v && typeof v === 'object' ? v.pct : v, 0, 100); if (pct == null || pct <= 0) continue;
    const label = String((v && v.label) || k).replace(/[<>"'`\\]/g, '').trim().slice(0, 40) || k;
    cats[k] = { pct: Math.round(pct * 100) / 100, label }; sum += pct; n++;
  }
  if (!n || Math.abs(sum - 100) > 0.05) return null;
  const names = {};   // every group's name when saved (also the ones without a target) — for the Telegram alerts
  for (const [k, v] of Object.entries(t.names && typeof t.names === 'object' ? t.names : {})) if (/^[a-z0-9][a-z0-9_-]{0,39}$/i.test(k) && Object.keys(names).length < 60) names[k] = String(v || k).replace(/[<>"'`\\]/g, '').trim().slice(0, 40) || k;
  for (const [k, v] of Object.entries(cats)) names[k] = v.label;
  return { cats, band: numIn(t.band, 1, 50) ?? 5, names };
}
// ── Your own wallet addresses (public addresses only — never a seed phrase or private key), saved in meta/info.wallets ──
//   [{ id, label, kind: 'btc' | 'sol' | 'evm', addr }] — the wallet check reads their balances from the blockchain
export function walletKind(addr) {
  const a = String(addr || '').trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(a)) return 'evm';
  if (/^0x[0-9a-fA-F]{64}$/.test(a)) return 'sui';
  if (/^(bc1[02-9ac-hj-np-z]{11,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/.test(a)) return 'btc';
  if (/^0\.0\.\d{1,12}$/.test(a)) return 'hbar';
  if (/^kaspa:[02-9ac-hj-np-z]{61,63}$/.test(a)) return 'kas';
  if (/^cosmos1[02-9ac-hj-np-z]{38,58}$/.test(a)) return 'atom';
  if (/^sei1[02-9ac-hj-np-z]{38,58}$/.test(a)) return 'sei';
  if (/^kava1[02-9ac-hj-np-z]{38,58}$/.test(a)) return 'kava';
  if (/^(([a-z0-9_-]+\.)*[a-z0-9_-]{2,}\.near|[0-9a-f]{64})$/.test(a)) return 'near';
  if (/^(EQ|UQ|Ef|Uf|kQ|0Q)[A-Za-z0-9_-]{46}$/.test(a) || /^-?[01]:[0-9a-fA-F]{64}$/.test(a)) return 'ton';
  if (/^D[5-9A-HJ-NP-U][1-9A-HJ-NP-Za-km-z]{32}$/.test(a)) return 'doge';
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return 'sol';
  return null;
}
// the networks an address could belong to (a 0x… with 64 hex digits is used by both Sui and Aptos — you pick)
export function walletKinds(addr) { const k = walletKind(addr); return k === 'sui' ? ['sui', 'apt'] : k ? [k] : []; }
function cleanWallets(w) {
  const out = [], seen = new Set();
  for (const x of Array.isArray(w) ? w : []) {
    if (!x || out.length >= 20) continue;
    const addr = String(x.addr || '').trim(), ks = walletKinds(addr), kind = ks.includes(x.kind) ? x.kind : ks[0];
    if (!kind || seen.has(addr.toLowerCase())) continue; seen.add(addr.toLowerCase());
    out.push({ id: String(x.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || ('w' + out.length), kind, addr,
      label: String(x.label || '').replace(/[<>"'`\\]/g, '').trim().slice(0, 30) });
  }
  return out;
}
// ── Telegram alerts settings, saved in users/{uid}/meta/info.alerts (read by tools/alerts.mjs on GitHub every 30 min) ──
export const DEFAULT_ALERTS = Object.freeze({ lang: 'en', brief: true, briefTime: '08:30', weekly: true, moves: true, movePct: 5, signals: true, plan: true,
  tp: true, macro: true, sentiment: true, etf: true, etfMin: 500, quiet: true, health: true, drift: true, dca: true, buy: true });
function cleanAlerts(a) {
  const d = DEFAULT_ALERTS, out = { ...d };
  if (!a || typeof a !== 'object') return { ...out, isDefault: true };
  for (const k of Object.keys(d)) if (typeof d[k] === 'boolean' && typeof a[k] === 'boolean') out[k] = a[k];
  out.lang = a.lang === 'ar' ? 'ar' : 'en';
  out.briefTime = typeof a.briefTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(a.briefTime) ? a.briefTime : d.briefTime;
  out.movePct = numIn(a.movePct, 1, 50) ?? d.movePct;
  out.etfMin = numIn(a.etfMin, 50, 10000) ?? d.etfMin;
  return { ...out, isDefault: false };
}
function currentSignal() {
  const s = cleanSignal(S.meta && S.meta.signal), smart = !(S.meta && S.meta.signalSmart === false);
  return s ? { ...s, smart, isDefault: false } : { ...DEFAULT_SIGNAL, smart, isDefault: true };
}
function currentBaseline() {
  const b = cleanBaseline(S.meta && S.meta.baseline);
  if (b) return { ...b, isDefault: false };
  if (S.user && !isMainOwner()) {   // a member who hasn't started yet: today (Oct 15 is Samir's start, never theirs)
    const p = S.prices.BTC && S.prices.BTC.usd > 0 ? S.prices.BTC.usd : DEFAULT_BASELINE.btcPrice;
    return { date: new Date().toISOString().slice(0, 10), btcPrice: p, setAt: '', source: 'default', isDefault: true };
  }
  return { ...DEFAULT_BASELINE, setAt: '', source: 'default', isDefault: true };
}

// Chart history: rebuilt from the ledger × real hourly prices (samsam-history.js → CoinGecko), from the first day your
// portfolio has (the Oct-15 starting positions / your first transaction) up to the last hour with prices. Recorded
// points are used after that hour, and for everything until the price history has arrived.
const START_DAY = Date.parse(DEFAULT_BASELINE.date + 'T00:00:00Z');
function chartHistory(coins, txs, portfolio, snaps) {
  if (!coins.length) return null;
  const C = window.SamsamCoins || {}, ids = C.CG_IDS || {};
  const firstTx = txs.length ? Math.min(...txs.map(t => Date.parse(t.date) || Infinity)) : Infinity;
  const hasOpening = coins.some(c => c.opening && c.opening.qty > 0);
  // A portfolio with a starting position (the Oct-15 portfolio) charts from that day, like CoinMarketCap — older
  // transactions are already part of that day's amounts. Without one, from the first transaction.
  let start = hasOpening ? (isMainOwner() ? START_DAY : Math.min(Date.parse(currentBaseline().date + 'T00:00:00Z') || firstTx, firstTx)) : firstTx;
  if (!isFinite(start)) return null;
  start = Math.max(start, Date.now() - 89 * 864e5);
  // only coins actually held at some moment since the start (a coin removed earlier, or never bought, needs no history)
  const bySym = Core.groupTxBySym(txs);
  const heldInWindow = c => {
    const list = bySym.get(c.sym) || [];
    if (c.removed && c.removedAt && Date.parse(c.removedAt) < start) return false;
    const before = list.filter(t => (Date.parse(t.date) || 0) < start);
    if (Core.replay(c.opening, before).qty > 0) return true;
    return list.some(t => (Date.parse(t.date) || 0) >= start && (t.type === 'buy' || t.type === 'transfer_in' || t.type === 'adjust'));
  };
  const needs = [{ sym: 'BTC', id: 'bitcoin' }];
  const alt = C.CG_ALT || {};
  for (const c of coins) if (c.sym !== 'BTC' && heldInWindow(c)) needs.push({ sym: c.sym, id: Hist.pick([c.cgId, ids[c.sym], ...(alt[c.sym] || [])]) });
  Hist.ensure(needs, start, () => { if (allLoaded()) emit(); });
  if (!Hist.covers(needs, start)) return null;
  const until = Hist.coveredUntil(needs);
  if (!(until > start)) return null;
  const fallback = {};
  for (const c of coins) fallback[c.sym] = Number(c.lastPrice) || 0;
  for (const p of portfolio) if (p.currentPrice > 0) fallback[p.sym] = p.currentPrice;
  const times = [];
  for (let t = Math.ceil(start / Core.HOUR) * Core.HOUR; t <= until; t += Core.HOUR) times.push(t);
  if (times[times.length - 1] !== until) times.push(until);
  const pts = Core.historyPoints(coins, txs, Hist.series(needs), times, fallback).filter(p => p.v > 0);
  return {
    perf: pts.concat(snaps.perf.filter(s => s.t > until)),
    holdings: pts.map(p => ({ t: p.t, v: p.v })).concat(snaps.holdings.filter(s => s.t > until)),
  };
}

// Chart points are saved only when (almost) the whole portfolio is valued at live prices fetched in the last
// 15 minutes. A device that has just opened (a new browser, a phone back from sleep) values coins it has no live
// price for yet at their last saved / average price — that total must not become a point on everyone's chart.
function livePricesFresh() {
  const pf = (S.derived && S.derived.portfolio) || [], now = Date.now(), ids = (window.SamsamCoins && SamsamCoins.CG_IDS) || {};
  let total = 0, stale = 0;
  for (const c of pf) {
    const val = c.qty > 0 ? c.qty * (c.currentPrice || 0) : 0; if (!(val > 0)) continue;
    total += val;
    const p = S.prices[c.sym], priceable = c.sym === 'BTC' || c.cgId || ids[c.sym];
    if (priceable && !(p && p.usd > 0 && now - (p.t || 0) < 15 * 60e3)) stale += val;
  }
  return total > 0 && stale / total < 0.01;
}

function derive() {
  const coins = [...S.coins.values()];
  const txs = [...S.txs.values()].sort(Core.compareTx);
  const T = window.SamsamTaxonomy;
  // your category settings (names, colours, your own and deleted categories) first, then the coins' own categories
  if (T && T.applySettings) T.applySettings(S.catCfg);
  // your own categories (named on any device) become real categories on every page
  if (T && T.register) for (const c of coins) if (c.catLabel && T.isCustom(c.cat)) T.register(c.cat, c.catLabel);
  // each coin's CoinMarketCap page (saved when it was added) for every link on every page
  if (window.SamsamCoins && SamsamCoins.registerCoin) for (const c of coins) SamsamCoins.registerCoin(c.sym, { cmcSlug: c.cmcSlug, name: c.name });
  const catOf = (sym, cat, locked) => T ? T.categoryOf(sym, cat, locked) : (cat || 'other');
  const portfolio = Core.derivePortfolio(coins, txs, S.prices, S.opts.fallbackPrices).map(p => ({ ...p, cat: catOf(p.sym, p.cat, p.catLocked) }));
  const removed = coins.filter(c => c.removed).map(c => {
    const r = Core.replay(c.opening, txs.filter(t => t.sym === c.sym));
    return { sym: c.sym, qty: r.qty, basePrice: r.avg, cat: catOf(c.sym, c.cat, c.catLocked), cgId: c.cgId, logoUrl: c.logoUrl,
      removedAt: c.removedAt || '', removedPermanently: true };
  });
  const realized = Core.realizedPnl(coins, txs);
  const accumPlan = [...S.accum.values()]
    .sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || String(a.sym).localeCompare(String(b.sym)))
    .map(({ order, updatedAt, ...e }) => e);
  const recorded = Core.flattenSnaps([...S.snapDocs.values()]);
  let hist = null;
  try { hist = chartHistory(coins, txs, portfolio, recorded); } catch (e) { console.warn('[Samsam] chart history', e); }
  const snaps0 = hist || recorded;
  const liveTotal = portfolio.reduce((s, c) => s + (c.qty > 0 ? c.qty * (c.currentPrice || 0) : 0), 0);
  const snaps = { perf: Core.dropSpikes(snaps0.perf, liveTotal), holdings: Core.dropSpikes(snaps0.holdings, liveTotal) };
  const btc =S.prices.BTC && S.prices.BTC.usd > 0 ? S.prices.BTC.usd
    : (portfolio.find(c => c.sym === 'BTC') || {}).currentPrice || S.opts.fallbackPrices.BTC || 0;
  S.derived = {
    portfolio, transactions: txs, coins, archivedCoins: removed,
    customCoins: coins.filter(c => c.isCustom && !c.removed).map(c => ({ sym: c.sym, cat: catOf(c.sym, c.cat, c.catLocked), cgId: c.cgId, logoUrl: c.logoUrl })),
    accumPlan, perfSnaps: snaps.perf, holdingsSnaps: snaps.holdings, realized, btcPrice: btc, baseline: currentBaseline(),
    watchlist: cleanWatch(S.meta && S.meta.watch),
    exit: currentExit(),
    needsSetup: allLoaded() && !(S.meta && S.meta.state === 'done') && S.coins.size === 0,
  };
  return S.derived;
}

// Re-render callbacks are deferred while the user is typing in an editable field, so a
// live update from another device never wipes a value mid-edit.
function isEditing() {
  const a = document.activeElement;
  if (!a || a === document.body) return false;
  if (a.id === 'searchBox' || a.closest && a.closest('#samsamSyncMenu')) return false;
  return (a.tagName === 'INPUT' && a.type !== 'button' && a.type !== 'checkbox') || a.tagName === 'TEXTAREA' || a.isContentEditable;
}
let emitTimer = null, waitingForBlur = false;
// Keep each coin's saved category in the cloud in step with samsam-taxonomy.js (one write, only when something differs).
let catSyncDone = false;
function syncCategories() {
  const T = window.SamsamTaxonomy;
  if (catSyncDone || !T || !S.user || !allLoaded()) return;
  catSyncDone = true;
  const fix = [...S.coins.values()].filter(c => c.sym && !c.catLocked && T.categoryOf(c.sym, c.cat) !== c.cat);
  if (!fix.length) return;
  commit((b, ref) => { for (const c of fix) b.set(ref('coins', safeId(c.sym)), { cat: T.categoryOf(c.sym, c.cat), updatedAt: new Date().toISOString() }, { merge: true }); },
    `Update categories (${fix.length} coins)`).catch(() => { catSyncDone = false; });
}
// At-rest encryption: once the cloud holds the portfolio, the old app's plain-text copy on this device
// is moved into the encrypted device vault (samsam-vault.js) and the plain copy is deleted.
let sealDone = false;
function sealLegacy() {
  if (sealDone || !window.SamsamVault || !SamsamVault.available || !allLoaded() || !(S.meta && S.meta.state === 'done')) return;
  sealDone = true;
  SamsamVault.sealKeys(Object.values(LEGACY)).then(n => { if (n) console.info(`[Samsam] encrypted ${n} item(s) of old local data`); })
    .catch(e => { sealDone = false; console.warn('[Samsam] could not encrypt local data', e); });
}
// ── One price feed for every open page ──
// Live prices are saved on the device; when any open page (another tab, or a tab of the app shell)
// saves fresher ones, every other page takes them at once — the same Total Value everywhere.
function mergePrices(into, from) {
  let changed = false;
  for (const [sym, p] of Object.entries(from || {}))
    if (p && p.usd > 0 && (!into[sym] || (p.t || 0) > (into[sym].t || 0))) { into[sym] = p; changed = true; }
  return changed;
}
window.addEventListener('storage', e => {
  if (e.key !== PRICE_KEY || !e.newValue) return;
  try { if (mergePrices(S.prices, JSON.parse(e.newValue))) emit(); } catch (_) {}
});
function emit() {
  setTimeout(syncCategories, 0);
  setTimeout(sealLegacy, 0);
  setTimeout(autoBookStakes, 0);
  if (emitTimer) return;
  emitTimer = setTimeout(() => {
    emitTimer = null;
    if (!allLoaded()) { renderStatus(); return; }
    if (isEditing()) {
      if (!waitingForBlur) { waitingForBlur = true; document.addEventListener('focusout', () => { waitingForBlur = false; setTimeout(emit, 0); }, { once: true }); }
      renderStatus(); return;
    }
    const d = derive();
    renderStatus();
    renderSetup(d);
    for (const cb of S.listeners) { try { cb(d); } catch (e) { console.error('[Samsam] render error', e); } }
    if (window.CPSplash) requestAnimationFrame(() => CPSplash.hide());   // first full render done → open the app
  }, 30);
}

// ── Firebase bootstrap ──────────────────────────────────────────────────────
async function boot() {
  injectUi();
  if (!S.configured) { renderStatus(); showGate('config'); return; }
  const [{ initializeApp }, au, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = initializeApp(FIREBASE_CONFIG);
  let db;
  try {
    db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch (e) {
    console.warn('[Samsam] offline cache unavailable, using memory cache', e);
    db = fs.getFirestore(app);
  }
  const auth = au.getAuth(app);
  fb = { app, db, auth, fs, au };
  try { await au.getRedirectResult(auth); } catch (e) { setError(e); }
  // came back from the sign-in link in the e-mail → finish signing in (the address was kept on this device; else asked again)
  if (au.isSignInWithEmailLink && au.isSignInWithEmailLink(auth, location.href)) {
    const email = (() => { try { return localStorage.getItem('cp-signin-email'); } catch (_) { return null; } })();
    if (email) await finishEmailLink(email); else S.emailLinkPending = true;
  }
  au.onAuthStateChanged(auth, user => onUser(user));
  window.addEventListener('online', renderStatus);
  window.addEventListener('offline', renderStatus);
}

// Samir (the e-mail in firebase-config.js) — everyone else is an invited member with a portfolio of their own: no Oct-15
// starting portfolio, their own baseline (the day they started), their own setup screen.
function isMainOwner(user = S.user) {
  const list = (ALLOWED_EMAILS || []).map(e => String(e).toLowerCase().trim()).filter(Boolean);
  return !!user && (list.length === 0 || list.includes(String(user.email || '').toLowerCase()));
}
function emailAllowed(user) {   // the owner(s) in firebase-config.js; everyone else: the database rules decide (see probeAccess)
  if (!user) return false;
  const list = (ALLOWED_EMAILS || []).map(e => String(e).toLowerCase().trim()).filter(Boolean);
  return list.length === 0 || list.includes(String(user.email || '').toLowerCase());
}
// someone invited through the Telegram bot: their e-mail is in Firestore config/access, which only the rules can read.
// One read of their own (empty) settings tells: allowed → in; "permission denied" → not (yet) invited.
async function probeAccess(user) {
  try { await (fb.fs.getDocFromServer || fb.fs.getDoc)(fb.fs.doc(fb.db, 'users', user.uid, 'meta', 'info')); return true; }
  catch (e) { return !/permission-denied/.test((e && e.code) || ''); }   // offline etc. → let them in; the rules still guard every read
}

// 🎟 an invite opened in the app (…/?invite=CODE, from Dr. Samir Saad's dashboard): kept on this device until the person
// has signed in, then sent once to the Worker (/join) — their checked e-mail joins the access list, no second approval
const JOIN_URL = 'https://samsam-analysis.dr-samir-saad-1981.workers.dev/join';
(function keepInvite() {
  try {
    const u = new URL(location.href), c = (u.searchParams.get('invite') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length === 8) { localStorage.setItem('cp-invite', c); u.searchParams.delete('invite'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); }
  } catch (_) {}
})();
const pendingInvite = () => { try { return localStorage.getItem('cp-invite') || ''; } catch (_) { return ''; } };
async function redeemInvite(user, code) {
  code = String(code || pendingInvite()).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 8 || !user || !user.getIdToken) return { ok: false };
  try {
    const r = await fetch(JOIN_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: await user.getIdToken(true), code }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) { try { localStorage.removeItem('cp-invite'); } catch (_) {} return { ok: true }; }
    if (r.status === 400) { try { localStorage.removeItem('cp-invite'); } catch (_) {} }
    return { ok: false, error: j.error || ('Error ' + r.status) };
  } catch (e) { return { ok: false, error: 'Could not reach the server — check the internet and try again.' }; }
}

async function onUser(user) {
  S.authResolved = true;
  S.unsub.forEach(u => { try { u(); } catch (_) {} }); S.unsub = [];
  S.coins.clear(); S.txs.clear(); S.accum.clear(); S.snapDocs.clear(); S.meta = null; S.catCfg = null;
  Object.keys(S.loaded).forEach(k => S.loaded[k] = false);
  S.user = null; S.denied = null;
  if (!user) { showGate('signin'); renderStatus(); return; }
  if (!emailAllowed(user) && !(await probeAccess(user))) {
    const j = pendingInvite() ? await redeemInvite(user) : { ok: false };   // 🎟 an invite waiting on this device → join now
    if (!(j.ok && await probeAccess(user))) { S.denied = user.email; S.deniedUser = user; S.inviteErr = j.error || ''; showGate('denied'); return; }
  }
  S.deniedUser = null;
  S.user = user;
  hideGate();
  listen();
  renderStatus();
}

function userPath(...parts) { return ['users', S.user.uid, ...parts]; }

function listen() {
  const { db, fs } = fb;
  const opt = { includeMetadataChanges: true };
  const onErr = what => e => { setError(e, `Could not load ${what}`); };
  const track = snap => { S.fromCache = snap.metadata.fromCache; if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) S.lastSyncedAt = new Date(); };
  const coll = (name, map, key, fix) => fs.onSnapshot(fs.collection(db, ...userPath(name)), opt, snap => {
    track(snap);
    map.clear(); snap.forEach(d => { try { map.set(d.id, fix({ ...d.data(), id: d.id })); } catch (e) { console.warn('[Samsam] skipped unreadable', name, d.id, e); } });
    S.loaded[key] = true; emit();
  }, onErr(name));
  S.unsub.push(coll('coins', S.coins, 'coins', cleanCoin));
  S.unsub.push(coll('txs', S.txs, 'txs', cleanTx));
  S.unsub.push(coll('accum', S.accum, 'accum', cleanAccum));
  const cutoff = Core.dayId(Date.now() - 120 * 86400e3);
  S.unsub.push(fs.onSnapshot(
    fs.query(fs.collection(db, ...userPath('snaps')), fs.where(fs.documentId(), '>=', cutoff)), opt, snap => {
      track(snap); S.snapDocs.clear(); snap.forEach(d => S.snapDocs.set(d.id, { ...d.data(), id: d.id }));
      S.loaded.snaps = true; emit();
    }, onErr('chart history')));
  S.unsub.push(fs.onSnapshot(fs.doc(db, ...userPath('meta', 'categories')), opt, snap => {
    track(snap); S.catCfg = snap.exists() ? snap.data() : null; S.loaded.cats = true; emit();
  }, e => { S.loaded.cats = true; emit(); onErr('categories')(e); }));   // never hold the app back over the settings
  S.unsub.push(fs.onSnapshot(fs.doc(db, ...userPath('meta', 'info')), opt, snap => {
    track(snap); S.meta = snap.exists() ? snap.data() : null; S.loaded.meta = true; emit();
  }, onErr('settings')));
}

// ── writes ──────────────────────────────────────────────────────────────────
// Every write is one atomic batch. The UI updates instantly from the local cache;
// the status pill shows "Saving…" until the server confirms, and a red error if it fails.
function requireUser() {
  if (!S.user) throw new Error('Not signed in');
  if (!allLoaded()) throw new Error('Still loading your portfolio — try again in a moment');
}
function commit(build, label) {
  // Bad input or "not signed in" never throws into the page: it becomes a rejected promise
  // and a visible red status ("Sync problem — tap" shows the reason).
  let batch;
  try {
    requireUser();
    const { db, fs } = fb;
    batch = fs.writeBatch(db);
    const ref = (...p) => fs.doc(db, ...userPath(...p));
    build(batch, ref, fs);
  } catch (e) { setError(e, label); return Promise.reject(e); }
  S.pending++; renderStatus();
  return batch.commit().then(() => {
    S.pending--; S.lastSyncedAt = new Date(); if (S.lastError && S.lastError.label === label) S.lastError = null; renderStatus();
  }).catch(e => { S.pending--; setError(e, label); throw e; });
}

function txDoc(sym, type, qty, price, note, extra = {}) {
  const now = new Date().toISOString();
  const raw = String(sym == null ? '' : sym).trim().toUpperCase();
  sym = Clean.sym(raw); note = Clean.text(note, 500);
  if (!sym || sym !== raw) throw new Error('Invalid coin symbol (letters, digits, . _ - only)');
  if (!TX_TYPES.includes(type)) throw new Error('Invalid transaction type');
  if (!(Number(qty) >= 0) || !(Number(price) >= 0) || !Number.isFinite(Number(qty)) || !Number.isFinite(Number(price))) throw new Error('Amount and price must be positive numbers');
  return clean({
    sym, type, qty: Number(qty) || 0, price: Number(price) || 0, total: (Number(qty) || 0) * (Number(price) || 0),
    date: extra.date || now, createdAt: now, note: note || '', device: deviceId,
    ...(extra.setQty != null ? { setQty: Number(extra.setQty) } : {}),
    ...(extra.setAvg != null ? { setAvg: Number(extra.setAvg) } : {}),
    ...(extra.fee > 0 ? { fee: Number(extra.fee) } : {}),
    ...(extra.feeUsd > 0 ? { feeUsd: Number(extra.feeUsd) } : {}),
    ...(type === 'buy' && extra.netFee > 0 ? { netFee: Number(extra.netFee) } : {}),   // the part of `fee` that was the network fee to your wallet
    ...(extra.link ? { link: Clean.text(extra.link, 60) } : {}),   // a stablecoin Buy made from a Sell → that Sell's id
    ...(type === 'transfer_in' && extra.kind === 'reward' ? { kind: 'reward', ...(['staking', 'mining', 'airdrop'].includes(extra.src) ? { src: extra.src } : {}) } : {}),
    ...(type === 'sell' && extra.kind === 'pay' ? { kind: 'pay' } : {}),   // stablecoin spent on a Buy (link = that Buy's id)   // staking / mining reward: coins in at $0 cost
  });
}

// ── Automatic staking (users/{uid}/meta/info.stakes): [{ sym, qty, apy, since, start }] ──
function cleanStakes(list) {
  const out = [], seen = new Set();
  for (const x of Array.isArray(list) ? list : []) {
    const sym = Clean.sym(x && x.sym), qty = Number(x && x.qty), apy = Number(x && x.apy), since = Date.parse(x && x.since);
    if (!sym || seen.has(sym) || !(qty > 0) || !(apy > 0 && apy <= 1000) || !Number.isFinite(since) || out.length >= 50) continue;
    seen.add(sym); out.push({ sym, qty, apy, since: new Date(since).toISOString(), start: Number.isFinite(Date.parse(x.start)) ? new Date(Date.parse(x.start)).toISOString() : new Date(since).toISOString() });
  }
  return out;
}
const fmtApy = a => (Math.round(a * 100) / 100) + '%';
// The Reward transactions for a stake up to `now` (one per week, plus the part-week when `final`) — the same id and
// content on every device, so two devices booking the same week write one transaction, not two.
function stakeWrites(stake, now, final) {
  const r = Core.stakeBook(stake, now, final);
  const docs = r.rewards.map(w => ['stk_' + stake.sym + '_' + Date.parse(w.date), { ...txDoc(stake.sym, 'transfer_in', w.qty, 0,
    'Staking reward · auto ' + fmtApy(stake.apy), { kind: 'reward', src: 'staking', date: w.date }), createdAt: w.date, device: 'auto-staking' }]);
  return { docs, stake: { ...stake, qty: r.qty, since: r.since } };
}
function writeStakes(build, list, label) {
  return commit((b, ref) => { build(b, ref); b.set(ref('meta', 'info'), { stakes: list }, { merge: true }); }, label);
}
let stakeBusy = false, stakeLast = 0;
function autoBookStakes() {
  if (stakeBusy || !S.user || !allLoaded() || Date.now() - stakeLast < 10 * 60e3) return;
  const list = cleanStakes(S.meta && S.meta.stakes); if (!list.length) return;
  stakeLast = Date.now();
  API.bookStakes().catch(() => {});
}

const API = {
  // ── automatic staking ──
  // 🔗 the Telegram bot: a one-time code (10 min) the bot reads with its service account when you send /link CODE
  linkTelegram() {
    const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', b = crypto.getRandomValues(new Uint8Array(8)), code = [...b].map(x => ABC[x % ABC.length]).join('');
    const exp = new Date(Date.now() + 10 * 60e3).toISOString();
    return commit((b2, ref) => b2.set(ref('meta', 'tglink'), { code, exp, email: String((S.user && S.user.email) || '').toLowerCase(), createdAt: new Date().toISOString() }), 'Link Telegram').then(() => ({ code, exp }));
  },
  getStakes() { return cleanStakes(S.meta && S.meta.stakes); },
  getStake(sym) { return API.getStakes().find(x => x.sym === String(sym || '').toUpperCase()) || null; },
  // Every full week since the last booking becomes a Reward (Staking) at $0 cost; the staked amount grows by it.
  bookStakes(now = Date.now()) {
    const list = API.getStakes(); let docs = [];
    const next = list.map(st => {
      const w = stakeWrites(st, now, false);
      if (!w.docs.length || docs.length + w.docs.length > 400) return st;   // one batch holds 500 writes; the rest waits for the next run
      docs = docs.concat(w.docs); return w.stake;
    });
    if (!docs.length) return Promise.resolve(0);
    stakeBusy = true;
    return writeStakes((b, ref) => docs.forEach(([id, d]) => b.set(ref('txs', id), d)), next, 'Staking rewards')
      .then(() => docs.length).finally(() => { stakeBusy = false; });
  },
  // Start (or replace) automatic staking for a coin you hold: qty staked, APY %, from `start` (default now)
  startStake(sym, { qty, apy, start } = {}) {
    sym = String(sym || '').toUpperCase();
    if (!S.coins.has(sym)) return Promise.reject(new Error('Add the coin first'));
    const since = start ? new Date(start) : new Date();
    const st = cleanStakes([{ sym, qty, apy, since: since.toISOString(), start: since.toISOString() }])[0];
    if (!st) return Promise.reject(new Error('Enter the amount staked and an APY above 0%'));
    if (Date.parse(st.since) > Date.now() + 60e3) return Promise.reject(new Error('The start date cannot be in the future'));
    if (Date.parse(st.since) < Date.now() - 5 * 365 * 864e5) return Promise.reject(new Error('The start date can be at most 5 years ago'));
    const old = API.getStake(sym);
    if (old) return API.editStake(sym, { qty: st.qty, apy: st.apy });
    return writeStakes(() => {}, API.getStakes().concat(st), 'Start staking').then(() => API.bookStakes()).then(() => st);
  },
  // New amount and / or APY from now on: what was earned so far is booked first at the old rate
  editStake(sym, { qty, apy } = {}) {
    const list = API.getStakes(), i = list.findIndex(x => x.sym === String(sym || '').toUpperCase());
    if (i < 0) return Promise.reject(new Error('This coin is not on automatic staking'));
    const now = Date.now(), w = stakeWrites(list[i], now, true);
    const st = cleanStakes([{ ...w.stake, qty: qty != null && qty !== '' ? qty : w.stake.qty, apy: apy != null && apy !== '' ? apy : w.stake.apy, start: list[i].start }])[0];
    if (!st) return Promise.reject(new Error('Enter the amount staked and an APY above 0%'));
    list[i] = st;
    return writeStakes((b, ref) => w.docs.forEach(([id, d]) => b.set(ref('txs', id), d)), list, 'Change staking').then(() => st);
  },
  // Stop: books what was earned up to now, then the coin is no longer on automatic staking
  stopStake(sym) {
    const list = API.getStakes(), i = list.findIndex(x => x.sym === String(sym || '').toUpperCase());
    if (i < 0) return Promise.resolve(0);
    const w = stakeWrites(list[i], Date.now(), true);
    list.splice(i, 1);
    return writeStakes((b, ref) => w.docs.forEach(([id, d]) => b.set(ref('txs', id), d)), list, 'Stop staking').then(() => w.docs.length);
  },
  // reading
  onChange(cb) { S.listeners.add(cb); if (S.derived && allLoaded()) setTimeout(() => cb(S.derived), 0); return () => S.listeners.delete(cb); },
  getState() { return S.derived || derive(); },
  syncedAt() { return S.lastSyncedAt; },   // last moment the server confirmed everything (shared footer)
  isReady() { return !!S.user && allLoaded(); },
  core: Core,
  configure(opts) { Object.assign(S.opts, opts || {}); if (allLoaded()) emit(); },
  getBaseline() { return currentBaseline(); },
  isOwner() { return isMainOwner(); },
  getSignalRules() { return currentSignal(); },
  getWatchlist() { return cleanWatch(S.meta && S.meta.watch); },
  getExit() { return currentExit(); },
  getAlerts() { return cleanAlerts(S.meta && S.meta.alerts); },
  getTargets() { return cleanTargets(S.meta && S.meta.targets); },
  getWallets() { return cleanWallets(S.meta && S.meta.wallets); },
  // Network & where held of many coins in one cloud write: { SYM: { nets?, at? } } — only for coins you have
  setCoinPlaces(map) {
    const rows = Object.entries(map || {}).filter(([sym]) => S.coins.has(sym)).map(([sym, v]) => {
      const f = {}; if (v && 'nets' in v) f.nets = cleanNets(v.nets); if (v && 'at' in v) f.at = cleanPlaces(v.at); return [sym, f];
    }).filter(([, f]) => Object.keys(f).length);
    if (!rows.length) return Promise.resolve(0);
    return commit((b, ref) => rows.forEach(([sym, f]) => b.set(ref('coins', safeId(sym)), clean({ ...f, updatedAt: new Date().toISOString() }), { merge: true })), 'Networks').then(() => rows.length);
  },
  setWallets(list) {
    const w = cleanWallets(list);
    return commit((bt, ref) => bt.set(ref('meta', 'info'), { wallets: w }, { merge: true }), 'Wallets').then(() => w);
  },
  walletKind, walletKinds,
  openAlerts() { openAlertsSheet(); },
  // any of { tab, targets (null → defaults), plan, steps (null → defaults) } — each saved as its own field, so edits on two devices don't clash
  saveExit(part = {}) {
    const d = {};
    if (part.tab) d.exitTab = part.tab === 'exit' ? 'exit' : 'accum';
    if ('targets' in part) { if (part.targets == null) d.exitTargets = null; else { const { isDefault, ...t } = cleanExitTargets(part.targets); d.exitTargets = t; } }
    if (part.plan) d.exitPlan = cleanExitPlan(part.plan);
    if ('steps' in part) { if (part.steps == null) d.exitSteps = null; else { const { isDefault, ...v } = cleanExitSteps(part.steps); d.exitSteps = v; } }
    if (!Object.keys(d).length) return Promise.resolve();
    return commit((bt, ref) => bt.set(ref('meta', 'info'), d, { merge: true }), 'Exit plan');
  },
  // null → no targets
  setTargets(t) {
    const c = t == null ? null : cleanTargets(t);
    if (t != null && !c) { const e = new Error('The targets must add up to 100%.'); setError(e, 'Targets'); return Promise.reject(e); }
    const saved = c ? { list: Object.entries(c.cats).map(([g, v]) => ({ g, pct: v.pct, label: v.label })), band: c.band,
      names: Object.entries(c.names).map(([g, label]) => ({ g, label })), setAt: new Date().toISOString() } : null;
    return commit((bt, ref) => bt.set(ref('meta', 'info'), { targets: saved }, { merge: true }), 'Targets');
  },
  setAlerts(a) {
    const { isDefault, ...c } = cleanAlerts(a);
    return commit((bt, ref) => bt.set(ref('meta', 'info'), { alerts: { ...c, setAt: new Date().toISOString() } }, { merge: true }), 'Alerts');
  },
  saveWatchlist(list) {
    const w = cleanWatch(list);
    return commit((bt, ref) => bt.set(ref('meta', 'info'), { watch: w }, { merge: true }), 'Watchlist');
  },
  signalOf(pct, sym) { const r = currentSignal(); if (sym === 'BTC') return 'hold'; return pct < r.sell ? 'convert' : pct <= r.reinforce ? 'reinforce' : 'hold'; },
  // null → back to the defaults (−5% / −20%)
  setSignalRules(rules) {
    const s = rules == null ? null : cleanSignal(rules);
    if (rules != null && !s) { const e = new Error('Sell / Convert must be lower than Reinforce (between −99% and +100%).'); setError(e, 'Signal'); return Promise.reject(e); }
    return commit((bt, ref, fs) => bt.set(ref('meta', 'info'), { signal: s ? { ...s, setAt: new Date().toISOString() } : null }, { merge: true }), 'Signal');
  },
  // Smart signal on / off (users/{uid}/meta/info.signalSmart; missing = on)
  setSignalSmart(on) { return commit((bt, ref) => bt.set(ref('meta', 'info'), { signalSmart: !!on }, { merge: true }), 'Signal'); },
  // Change the baseline (date + BTC price on that date). Only the comparison with BTC changes —
  // holdings, transactions and profit stay exactly as they are.
  setBaseline({ date, btcPrice, source } = {}) {
    const b = cleanBaseline({ date, btcPrice, source, setAt: new Date().toISOString() });
    if (!b) { const e = new Error('Pick a valid date and a BTC price above 0.'); setError(e, 'Baseline'); return Promise.reject(e); }
    if (Date.parse(b.date + 'T00:00:00Z') > Date.now()) { const e = new Error('The baseline date cannot be in the future.'); setError(e, 'Baseline'); return Promise.reject(e); }
    return commit((bt, ref) => bt.set(ref('meta', 'info'), { baseline: b }, { merge: true }), 'Baseline');
  },
  // BTC closing price on a day (CoinGecko daily history, 00:00 UTC). Resolves to a number, or rejects.
  async fetchBtcPriceOn(date) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
    if (!m) throw new Error('Invalid date');
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/bitcoin/history?date=${m[3]}-${m[2]}-${m[1]}&localization=false`);
    if (!r.ok) throw new Error('Price service unavailable (' + r.status + ')');
    const j = await r.json(), p = j && j.market_data && j.market_data.current_price && Number(j.market_data.current_price.usd);
    if (!(p > 0)) throw new Error('No BTC price for that day');
    return Math.round(p * 100) / 100;
  },

  // prices are per-device market data, not portfolio data
  updatePrices(map) {
    const t = Date.now();
    for (const [sym, p] of Object.entries(map || {})) if (p && p.usd > 0) S.prices[sym] = { usd: p.usd, ch24: p.ch24 ?? null, t };
    mergePrices(S.prices, ls.get(PRICE_KEY, {}));   // keep anything fresher another tab saved meanwhile
    ls.set(PRICE_KEY, S.prices); emit();
  },
  // Manual price (for coins without a live feed): saved on the coin in the cloud so every
  // device shows the same value. A live market price, when available, takes precedence.
  setManualPrice(sym, usd) {
    if (!(usd > 0)) return Promise.resolve();
    if (S.prices[sym]) { delete S.prices[sym]; ls.set(PRICE_KEY, S.prices); }
    return API.updateCoin(sym, { lastPrice: usd });
  },
  getPrices() { return S.prices; },

  // ledger
  addTx(sym, type, qty, price, note = '', extra = {}) {
    const id = Core.newId('tx_');
    return commit((b, ref) => b.set(ref('txs', id), txDoc(sym, type, qty, price, note, extra)), `Save ${type} ${sym}`).then(() => id);
  },
  adjust(sym, { setQty, setAvg }, note) {
    return API.addTx(sym, 'adjust', 0, 0, note || 'Manual edit', { setQty, setAvg });
  },
  deleteTx(id) { return commit((b, ref) => b.delete(ref('txs', safeId(id))), 'Delete transaction'); },
  // A coin you got for free (Transfer In at $0) → mark it Staking / Mining / Airdrop, or back to a plain Transfer In (src = null).
  // Only the label changes: amount, $0 cost, date and your note stay. The database rules never let a saved transaction change
  // in place, so it is saved again under a new id and the old one is deleted — both in one step (all or nothing).
  tagTx(id, src) {
    const t = S.txs.get(String(id));
    if (!t || t.type !== 'transfer_in' || Number(t.price) > 0) return Promise.reject(new Error('Only a Transfer In at $0 cost can be marked as a reward'));
    const ok = ['staking', 'mining', 'airdrop'].includes(src);
    const AUTO = ['Staking reward', 'Mining reward', 'Airdrop'], NOTE = { staking: 'Staking reward', mining: 'Mining reward', airdrop: 'Airdrop' };
    const { id: _id, kind: _k, src: _s, ...rest } = t;
    if (AUTO.includes(rest.note)) rest.note = ok ? NOTE[src] : '';   // the note the app wrote itself follows the new label; yours stays
    const nid = Core.newId('tx_');
    return commit((b, ref) => { b.set(ref('txs', nid), clean({ ...rest, ...(ok ? { kind: 'reward', src } : {}) })); b.delete(ref('txs', safeId(t.id))); }, 'Mark transaction').then(() => nid);
  },
  deleteTxs(ids) { return commit((b, ref) => (ids || []).forEach(id => b.delete(ref('txs', safeId(id)))), 'Delete transactions'); },
  // A Sell whose money stays in the portfolio: the Sell + a Buy of the stablecoin for what you got (sell value − fee),
  // in ONE write. The Buy is priced at $1, so it adds exactly that much cash and no profit is counted twice.
  // A stablecoin you don't hold yet is added first (Add Coin), then gets the Buy.
  sellToStable(sym, qty, price, note, extra = {}, stable = {}) {
    const ss = Clean.sym(String(stable.sym || '').toUpperCase());
    const cash = Math.max(0, (Number(qty) || 0) * (Number(price) || 0) - (Number(extra.feeUsd) || 0));
    if (!ss || ss === Clean.sym(String(sym).toUpperCase()) || !(cash > 0)) return API.addTx(sym, 'sell', qty, price, note, extra);
    const sellId = Core.newId('tx_'), when = Date.parse(extra.date) || Date.now();
    const bdate = new Date(when + 1).toISOString();
    const bnote = 'From selling ' + (+Number(qty).toPrecision(8)) + ' ' + sym;
    const cur = S.coins.get(ss);
    if (cur && !cur.removed) {
      return commit((b, ref) => {
        b.set(ref('txs', sellId), txDoc(sym, 'sell', qty, price, note, extra));
        b.set(ref('txs', Core.newId('tx_')), txDoc(ss, 'buy', cash, 1, bnote, { date: bdate, link: sellId }));
      }, `Sell ${sym} → ${ss}`).then(() => sellId);
    }
    return commit((b, ref) => b.set(ref('txs', sellId), txDoc(sym, 'sell', qty, price, note, extra)), `Save sell ${sym}`)
      .then(() => API.addCoin({ sym: ss, name: stable.name || ss, cat: stable.cat || 'other', cgId: stable.cgId || null, cmcSlug: stable.cmcSlug || null, logoUrl: stable.logoUrl || null }, { qty: cash, price: 1, note: bnote, link: sellId }))
      .then(() => sellId);
  },

  // Buy paid from a stablecoin: the Buy + the stablecoin going out at $1 (marked kind:'pay', linked to the Buy) in ONE write
  buyFromStable(sym, qty, price, note, extra = {}, stableSym) {
    const ss = Clean.sym(String(stableSym || '').toUpperCase());
    const cost = Math.max(0, (Number(qty) || 0) * (Number(price) || 0) + (Number(extra.feeUsd) || 0));
    if (!ss || ss === Clean.sym(String(sym).toUpperCase()) || !(cost > 0) || !S.coins.has(ss)) return API.addTx(sym, 'buy', qty, price, note, extra);
    const buyId = Core.newId('tx_'), when = Date.parse(extra.date) || Date.now();
    const pnote = 'Paid for buying ' + (+Number(qty).toPrecision(8)) + ' ' + sym;
    return commit((b, ref) => {
      b.set(ref('txs', buyId), txDoc(sym, 'buy', qty, price, note, extra));
      b.set(ref('txs', Core.newId('tx_')), txDoc(ss, 'sell', cost, 1, pnote, { date: new Date(when + 1).toISOString(), link: buyId, kind: 'pay' }));
    }, `Buy ${sym} with ${ss}`).then(() => buyId);
  },

  // Recovery: in ONE atomic write, restore missing transactions (keeping their original ids, so
  // nothing is duplicated), re-create/un-remove coins, pin chosen coins to recovered qty/avg, and
  // add/update accumulation targets. Used by recover.html.
  restore({ txs = [], coins = [], pins = [], accum = [] } = {}) {
    const now = new Date().toISOString();
    return commit((b, ref) => {
      for (const c of coins) {
        const cur = S.coins.get(c.sym);
        b.set(ref('coins', safeId(c.sym)), clean({
          sym: c.sym, name: c.name || (cur && cur.name) || c.sym, cat: c.cat || (cur && cur.cat) || 'other',
          cgId: c.cgId || (cur && cur.cgId) || null, logoUrl: c.logoUrl || (cur && cur.logoUrl) || null,
          isCustom: cur ? !!cur.isCustom : true, removed: false, removedAt: null,
          opening: cur && cur.opening ? cur.opening : { qty: 0, avg: 0 },
          order: cur && cur.order != null ? cur.order : 3000, updatedAt: now,
        }), { merge: true });
      }
      for (const t of txs) {
        const { id, ...d } = t;
        b.set(ref('txs', safeId(id)), clean({ ...d, qty: +d.qty || 0, price: +d.price || 0,
          total: d.total != null ? +d.total : (+d.qty || 0) * (+d.price || 0), note: d.note || '',
          date: d.date || now, createdAt: d.createdAt || d.date || now }));
      }
      // Pins are written last-in-time so they win over everything before them.
      pins.forEach((pn, i) => {
        b.set(ref('txs', Core.newId('tx_')), txDoc(pn.sym, 'adjust', 0, 0, pn.note || 'Recovered from backup',
          { setQty: pn.qty, setAvg: pn.avg, date: new Date(Date.now() + i).toISOString() }));
      });
      for (const a of accum) b.set(ref('accum', safeId(a.sym)), clean({ ...a, updatedAt: now }));
    }, 'Restore data');
  },

  // Import from an exchange file: new coins first, then the transactions. Each transaction has a fixed id made from
  // the file (order number…), so importing the same file again rewrites the same documents — never a duplicate.
  // Firestore takes ≤ 500 writes per batch → chunks of 400.
  importTxs({ txs = [], coins = [] } = {}) {
    const now = new Date().toISOString();
    const docs = [];
    for (const c of coins) {
      const cc = cleanCoin({ ...c, cat: c.cat || 'other' }); if (!cc.sym || S.coins.get(cc.sym) && !S.coins.get(cc.sym).removed) continue;
      const order = Math.max(-1, ...[...S.coins.values()].map(x => x.order ?? 0)) + 1 + docs.length;
      docs.push(['coins', safeId(cc.sym), clean({ sym: cc.sym, name: cc.name || cc.sym, cat: cc.cat || 'other', cgId: cc.cgId || null, cmcSlug: null,
        logoUrl: cc.logoUrl || null, notes: '', isCustom: true, removed: false, removedAt: null, order, opening: { qty: 0, avg: 0 }, addedAt: now, updatedAt: now }), true]);
    }
    for (const t of txs) {
      const id = 'imp_' + String(t.key || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
      if (id === 'imp_') continue;
      docs.push(['txs', safeId(id), txDoc(t.sym, t.type, t.qty, t.price, t.note || '', { date: t.date, fee: t.fee, feeUsd: t.feeUsd, netFee: t.netFee, kind: t.kind, src: t.src }), false]);
    }
    const parts = [];
    for (let i = 0; i < docs.length; i += 400) parts.push(docs.slice(i, i + 400));
    return parts.reduce((p, part, i) => p.then(() => commit((b, ref) => part.forEach(([col, id, d, merge]) => merge ? b.set(ref(col, id), d, { merge: true }) : b.set(ref(col, id), d)),
      parts.length > 1 ? `Import (${i + 1}/${parts.length})` : 'Import')), Promise.resolve()).then(() => txs.length);
  },
  // Settings saved in a backup (recover.html): the ones you tick are put back as they were
  settingsNow: () => settingsNow(),
  lastBackupAt: () => (S.meta && S.meta.lastBackupAt) || null,
  restoreSettings({ info = {}, categories } = {}) {
    const d = {}; for (const k of SETTING_KEYS) if (k in info) d[k] = info[k] === undefined ? null : info[k];
    return commit((b, ref) => {
      if (Object.keys(d).length) b.set(ref('meta', 'info'), clean(d), { merge: true });
      if (categories !== undefined) b.set(ref('meta', 'categories'), clean(categories || { labels: {}, colors: {}, customs: {}, removed: [] }));
    }, 'Restore settings');
  },
  // coins
  updateCoin(sym, fields) {
    fields = { ...fields };
    if ('name' in fields) fields.name = Clean.label(fields.name);
    if ('cat' in fields) fields.cat = Clean.key(fields.cat) || 'other';
    if ('catLabel' in fields) fields.catLabel = Clean.label(fields.catLabel, 40) || null;
    if ('catLocked' in fields) fields.catLocked = fields.catLocked === true;
    if ('notes' in fields) fields.notes = Clean.text(fields.notes, 1000);   // Asset Strategy & Notes
    if ('cgId' in fields) fields.cgId = Clean.cgId(fields.cgId);
    if ('ccSlug' in fields) fields.ccSlug = Clean.cgId(fields.ccSlug);
    if ('cmcSlug' in fields) fields.cmcSlug = Clean.cgId(fields.cmcSlug);
    if ('logoUrl' in fields) fields.logoUrl = Clean.url(fields.logoUrl);
    if ('nets' in fields) fields.nets = cleanNets(fields.nets);
    if ('at' in fields) fields.at = cleanPlaces(fields.at);
    if ('lastPrice' in fields && !(Number(fields.lastPrice) > 0 && Number.isFinite(Number(fields.lastPrice)))) delete fields.lastPrice;
    return commit((b, ref, fs) => b.set(ref('coins', safeId(sym)), clean({ ...fields, updatedAt: new Date().toISOString() }), { merge: true }), `Update ${sym}`);
  },
  addCoin(coin, { qty, price, note, feeUsd, link, pay } = {}) {
    const rawSym = String(coin.sym == null ? '' : coin.sym).trim().toUpperCase();
    coin = cleanCoin({ ...coin, cat: coin.cat || 'other' });
    const sym = coin.sym;
    if (!sym || sym !== rawSym) { const e = new Error('Invalid coin symbol (letters, digits, . _ - only)'); setError(e, 'Add coin'); return Promise.reject(e); }
    const existing = S.coins.get(sym);
    const own = [...S.txs.values()].filter(t => t.sym === sym);
    const hasHistory = own.length > 0;
    // A coin removed earlier (before removal recorded its balance leaving): close the old position at the
    // moment it was removed, so adding it again starts from zero — past sells and their Realized profit stay.
    const left = existing && existing.removed ? Core.replay(existing.opening, own).qty : 0;
    // dated when it was removed — never before its own last transaction, so it always closes everything before it
    const lastT = Math.max(0, ...own.map(t => Date.parse(t.date) || 0));
    const remT = existing && existing.removedAt && Date.parse(existing.removedAt) ? Date.parse(existing.removedAt) : Date.now() - 1000;
    const removedAt = new Date(Math.min(Date.now() - 1, Math.max(remT, lastT + 1))).toISOString();
    const order = existing && existing.order != null ? existing.order : Math.max(-1, ...[...S.coins.values()].map(c => c.order ?? 0)) + 1;
    return commit((b, ref) => {
      b.set(ref('coins', safeId(sym)), clean({
        sym, name: coin.name || sym, cat: coin.cat || 'other', catLocked: coin.catLocked === true, catLabel: coin.catLabel || null,
        cgId: coin.cgId || null, cmcSlug: coin.cmcSlug || null, logoUrl: coin.logoUrl || null,
        ...(coin.nets ? { nets: coin.nets } : {}), ...(coin.at ? { at: coin.at } : {}),
        notes: coin.notes || '', isCustom: true, removed: false, removedAt: null, order, lastPrice: price || null,
        opening: existing && existing.opening ? existing.opening : { qty: 0, avg: 0 },
        addedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }), { merge: true });
      if (left > 1e-12) b.set(ref('txs', Core.newId('tx_')), txDoc(sym, 'transfer_out', left, 0, 'Removed from portfolio', { date: removedAt }));
      const id = Core.newId('tx_');
      // Every new or re-added coin starts with an ordinary Buy (no manual corrections).
      b.set(ref('txs', id), txDoc(sym, 'buy', qty, price, note || (hasHistory ? 'Re-added coin' : 'Initial position'), { feeUsd, link }));
      // paid from a stablecoin you hold: it goes out at $1 in the same write, linked to this Buy
      const ps = pay && Clean.sym(String(pay).toUpperCase()), cost = (Number(qty) || 0) * (Number(price) || 0) + (Number(feeUsd) || 0);
      if (ps && ps !== sym && S.coins.has(ps) && !S.coins.get(ps).removed && cost > 0)
        b.set(ref('txs', Core.newId('tx_')), txDoc(ps, 'sell', cost, 1, 'Paid for buying ' + (+Number(qty).toPrecision(8)) + ' ' + sym, { date: new Date(Date.now() + 1).toISOString(), link: id, kind: 'pay' }));
    }, `Add ${sym}`);
  },
  // ── Manage Categories: one settings doc (users/{uid}/meta/categories) every page and device applies ──
  categorySettings() { const T = window.SamsamTaxonomy; return T ? T.settings() : { labels: {}, colors: {}, customs: {}, removed: [] }; },
  // change(cfg) edits a copy of the settings; extra(b, ref) adds more writes to the same batch
  editCategories(change, label = 'Categories', extra) {
    const T = window.SamsamTaxonomy; if (!T) return Promise.reject(new Error('Categories not loaded'));
    const cfg = T.settings(); change(cfg);
    const out = { labels: {}, colors: {}, customs: {}, removed: [...new Set(cfg.removed || [])].filter(k => T.isCustom(k)).slice(0, 200), updatedAt: new Date().toISOString() };
    for (const [k, v] of Object.entries(cfg.labels || {})) { const l = Clean.label(v, 40); if (l && T.defaultLabel(k) && l !== T.defaultLabel(k)) out.labels[Clean.key(k)] = l; }
    for (const [k, v] of Object.entries(cfg.colors || {})) if (/^#[0-9a-f]{6}$/i.test(v)) out.colors[Clean.key(k)] = v.toLowerCase();
    for (const [k, v] of Object.entries(cfg.customs || {})) { const l = Clean.label(v, 40); if (l && T.isCustom(k) && !out.removed.includes(k)) out.customs[k] = l; }
    S.catCfg = out;   // this device at once (names / colours / lists), the cloud copy follows
    T.applySettings(out); for (const c of S.coins.values()) if (c.catLabel && T.isCustom(c.cat)) T.register(c.cat, c.catLabel);
    emit();
    return commit((b, ref) => { b.set(ref('meta', 'categories'), out); if (extra) extra(b, ref); }, label);
  },
  renameCategory(key, name) {
    const T = window.SamsamTaxonomy, l = Clean.label(name, 40);
    if (!l) return Promise.reject(new Error('Type a name for the category'));
    const clash = Object.entries(T.labels).find(([k, v]) => k !== key && String(v).toLowerCase() === l.toLowerCase());
    if (clash) return Promise.reject(new Error(`"${l}" is already a category`));
    return API.editCategories(cfg => { if (T.isCustom(key)) cfg.customs[key] = l; else if (l === T.defaultLabel(key)) delete cfg.labels[key]; else cfg.labels[key] = l; }, 'Rename category');
  },
  recolorCategory(key, color) {
    if (!/^#[0-9a-f]{6}$/i.test(String(color || ''))) return Promise.reject(new Error('Pick a colour'));
    const T = window.SamsamTaxonomy;
    return API.editCategories(cfg => { if (!T.isCustom(key) && color.toLowerCase() === T.defaultColor(key)) delete cfg.colors[key]; else cfg.colors[key] = color.toLowerCase(); }, 'Category colour');
  },
  // A new category of your own (empty until you move coins into it). Resolves to its key.
  createCategory(name, color) {
    const T = window.SamsamTaxonomy, l = Clean.label(name, 40);
    if (!l) return Promise.reject(new Error('Type a name for the category'));
    if (Object.values(T.labels).some(v => String(v).toLowerCase() === l.toLowerCase())) return Promise.reject(new Error(`"${l}" is already a category`));
    const key = T.customKey(l);
    return API.editCategories(cfg => { cfg.customs[key] = l; cfg.removed = (cfg.removed || []).filter(k => k !== key); if (color) cfg.colors[key] = color; }, 'New category').then(() => key);
  },
  // Built-in: back to its original name and colour. Yours: deleted — its coins go back to their default category.
  resetCategory(key) {
    return API.editCategories(cfg => { delete cfg.labels[key]; delete cfg.colors[key]; }, 'Reset category');
  },
  deleteCategory(key) {
    const T = window.SamsamTaxonomy;
    if (!T.isCustom(key)) return Promise.reject(new Error('Built-in categories can be renamed, not deleted'));
    const coins = [...S.coins.values()].filter(c => c.cat === key);
    return API.editCategories(cfg => { delete cfg.customs[key]; delete cfg.colors[key]; cfg.removed = [...(cfg.removed || []), key]; }, 'Delete category', (b, ref) => {
      const now = new Date().toISOString();
      for (const c of coins) b.set(ref('coins', safeId(c.sym)), { cat: T.defaultOf(c.sym) || 'other', catLocked: false, catLabel: null, updatedAt: now }, { merge: true });
    });
  },
  // Your choice of category for a coin (built-in key, or a name of your own → 'x-…' key + label).
  // Locked, so it is never reset to the default list; pass null to go back to the default.
  setCategory(sym, key, label) {
    const T = window.SamsamTaxonomy;
    if (key == null) return API.updateCoin(sym, { cat: T ? (T.defaultOf(sym) || 'other') : 'other', catLocked: false, catLabel: null });
    if (T && T.isCustom(key)) { if (!Clean.label(label, 40)) return Promise.reject(new Error('Type a name for the category')); T.register(key, label); }
    else if (!(T && T.labels[key])) return Promise.reject(new Error('Unknown category'));
    return API.updateCoin(sym, { cat: key, catLocked: true, catLabel: T && T.isCustom(key) ? Clean.label(label, 40) : null });
  },
  // Remove a coin: what you still hold leaves the portfolio at its average cost (a Transfer Out, "Removed from
  // portfolio" — no profit or loss), so totals, charts and the BTC comparison stay right, and adding the coin again
  // later starts from zero. Past buys / sells (and their Realized profit) stay in the history.
  removeCoin(sym) {
    sym = Clean.sym(String(sym || '').toUpperCase());
    const c = S.coins.get(sym); if (!c) return Promise.resolve();
    const left = Core.replay(c.opening, [...S.txs.values()].filter(t => t.sym === sym)).qty;
    const now = new Date().toISOString();
    return commit((b, ref) => {
      b.set(ref('coins', safeId(sym)), clean({ removed: true, removedAt: now, updatedAt: now }), { merge: true });
      if (left > 1e-12) b.set(ref('txs', Core.newId('tx_')), txDoc(sym, 'transfer_out', left, 0, 'Removed from portfolio', { date: now }));
    }, `Remove ${sym}`);
  },

  // accumulation targets — one document per coin, so edits on two devices merge
  saveAccumPlan(plan) {
    const next = new Map((plan || []).map((e, i) => [e.sym, { ...e, order: i }]));
    return commit((b, ref) => {
      for (const [sym0, e0] of next) {
        const e = cleanAccum(e0), sym = e.sym; if (!sym) continue;
        const cur = S.accum.get(sym);
        const { id, updatedAt, ...curData } = cur || {};
        if (!cur || JSON.stringify(clean(curData)) !== JSON.stringify(clean(e))) b.set(ref('accum', safeId(sym)), clean({ ...e, updatedAt: new Date().toISOString() }));
      }
      for (const sym of S.accum.keys()) if (!next.has(sym)) b.delete(ref('accum', safeId(sym)));
    }, 'Save accumulation plan');
  },

  // chart snapshots — one bucket per hour (performance) / 5 minutes (holdings)
  _snapWritten: new Set(),
  recordSnapshot(kind, t, v, b) {
    if (!API.isReady() || !(v > 0)) return Promise.resolve();
    if (!livePricesFresh()) return Promise.resolve();   // a device still on old / fallback prices must not save a point
    const size =kind === 'perf' ? Core.HOUR : Core.FIVE_MIN;
    const key = String(Core.bucket(t, size)), field = kind === 'perf' ? 'p' : 'h';
    const memo = field + key;
    const day = S.snapDocs.get(Core.dayId(t));
    if (API._snapWritten.has(memo) || (day && day[field] && day[field][key])) return Promise.resolve();
    API._snapWritten.add(memo);
    const val = kind === 'perf' ? { t, v: +v.toFixed(2), b: +b || 0 } : { t, v: +v.toFixed(2) };
    return commit((bt, ref) => bt.set(ref('snaps', Core.dayId(t)), { [field]: { [key]: val } }, { merge: true }), 'Save chart point')
      .catch(() => API._snapWritten.delete(memo));
  },

  // whole-portfolio operations
  resetToBaseline(base) {
    const now = new Date().toISOString();
    return commit((b, ref) => {
      for (const c of base || []) {
        if (!S.coins.has(c.sym) || S.coins.get(c.sym).removed) continue;
        b.set(ref('txs', Core.newId('tx_')), txDoc(c.sym, 'adjust', 0, 0, 'Reset to Oct-15 starting portfolio', { setQty: c.qty, setAvg: c.basePrice, date: now }));
      }
    }, 'Reset portfolio');
  },

  // account
  signIn: () => signIn(), signOut: () => signOutAndClear(),
  user: () => S.user,
  // A fresh Firebase ID token (proves who is signed in) — the AI analysis Worker checks it before running
  idToken: () => (S.user && S.user.getIdToken ? S.user.getIdToken() : Promise.resolve(null)),
  downloadBackup: (o) => downloadBackup(o),
  readBackupFile: f => readBackupFile(f),
};
window.Samsam = API;
window.dispatchEvent(new Event('samsam-ready'));

// ── one-time import of the data this device already has ─────────────────────
function readLegacy() {
  const pfRaw = ls.get(LEGACY.pf, null);
  const coins = Array.isArray(pfRaw) ? pfRaw : (pfRaw && Array.isArray(pfRaw.coins) ? pfRaw.coins : []);
  return {
    coins, btcPrice: pfRaw && pfRaw.btcPrice, lastSave: pfRaw && pfRaw.lastSave,
    transactions: ls.get(LEGACY.tx, []) || [], customCoins: ls.get(LEGACY.custom, []) || [],
    archivedCoins: ls.get(LEGACY.archived, []) || [], accumPlan: ls.get(LEGACY.acc, []) || [],
    perfSnaps: ls.get(LEGACY.perf, []) || [], holdingsSnaps: ls.get(LEGACY.holdings, []) || [],
  };
}

// Converts the old app's data (localStorage or an old JSON backup) into cloud documents.
export function buildImport(legacy, opts = {}) {
  const txs = (legacy.transactions || []).filter(t => t && t.sym && ['buy', 'sell', 'adjust', 'transfer_in', 'transfer_out'].includes(t.type))
    .map(t => clean({ ...t, id: safeId(t.id || Core.newId('tx_')), qty: +t.qty || 0, price: +t.price || 0,
      total: t.total != null ? +t.total : (+t.qty || 0) * (+t.price || 0), date: t.date || new Date(0).toISOString(),
      createdAt: t.createdAt || t.date || new Date(0).toISOString(), note: t.note || '' }));
  const bySym = Core.groupTxBySym(txs);
  const custom = new Set((legacy.customCoins || []).map(c => c.sym));
  const coins = [], extraTx = [];
  const now = new Date().toISOString();
  const addCoin = (c, i, removed) => {
    const d = Core.deriveOpening({ qty: c.qty, avg: c.basePrice }, bySym.get(c.sym) || []);
    coins.push(clean({
      sym: c.sym, name: c.name || (opts.coinNames || {})[c.sym] || c.sym, cat: c.cat || 'other', cgId: c.cgId || null,
      logoUrl: c.logoUrl || null, notes: c.notes || '', isCustom: custom.has(c.sym), order: i,
      opening: d.opening, removed, removedAt: removed ? (c.removedAt || now) : null,
      lastPrice: c.currentPrice > 0 ? c.currentPrice : null, addedAt: c.addedAt || now, updatedAt: now,
    }));
    if (d.needAdjust) extraTx.push(clean({ id: Core.newId('tx_'), sym: c.sym, type: 'adjust', qty: 0, price: 0, total: 0,
      setQty: d.current.qty, setAvg: d.current.avg, date: now, createdAt: now, device: deviceId,
      note: 'Imported: matched holdings saved on this device' }));
  };
  const active = new Set();
  (legacy.coins || []).forEach((c, i) => { if (c && c.sym && !active.has(c.sym)) { active.add(c.sym); addCoin(c, i, false); } });
  const removedSeen = new Set();
  [...(legacy.archivedCoins || [])].reverse().forEach(c => {
    if (!c || !c.sym || active.has(c.sym) || removedSeen.has(c.sym) || c.removedPermanently === false) return;
    removedSeen.add(c.sym); addCoin(c, 1000 + removedSeen.size, true);
  });
  for (const sym of bySym.keys()) if (!active.has(sym) && !removedSeen.has(sym)) {
    coins.push({ sym, name: sym, cat: 'other', isCustom: true, order: 2000, opening: { qty: 0, avg: 0 }, removed: true, removedAt: now, updatedAt: now });
  }
  const accum = (legacy.accumPlan || []).filter(e => e && e.sym).map((e, i) => clean({ ...e, order: i, updatedAt: now }));
  const days = new Map();
  const put = (t, field, key, val) => { const id = Core.dayId(t); if (!days.has(id)) days.set(id, { p: {}, h: {} }); days.get(id)[field][key] = val; };
  for (const s of legacy.perfSnaps || []) if (s && s.t > 0) put(s.t, 'p', String(Core.bucket(s.t, Core.HOUR)), clean({ t: s.t, v: +s.v || 0, b: +s.b || 0 }));
  for (const s of legacy.holdingsSnaps || []) if (s && s.t > 0) put(s.t, 'h', String(Core.bucket(s.t, Core.FIVE_MIN)), { t: s.t, v: +s.v || 0 });
  const prices = {};
  for (const c of legacy.coins || []) if (c && c.currentPrice > 0) prices[c.sym] = { usd: c.currentPrice, ch24: c.change24h ?? null, t: Date.now() };
  if (legacy.btcPrice > 0) prices.BTC = { usd: legacy.btcPrice, ch24: null, t: Date.now() };
  return { coins, txs: [...txs, ...extraTx], accum, snapDays: [...days.entries()].map(([id, d]) => ({ id, ...d })), prices, adjusted: extraTx.map(t => t.sym) };
}

async function runImport(legacy, source) {
  requireUser();
  const { db, fs } = fb;
  const metaRef = fs.doc(db, ...userPath('meta', 'info'));
  // Claim the import so two devices can't import at the same time.
  await fs.runTransaction(db, async tr => {
    const cur = await tr.get(metaRef);
    const m = cur.exists() ? cur.data() : null;
    if (m && m.state === 'done') throw new Error('This portfolio is already set up in the cloud.');
    if (m && m.state === 'importing' && m.by !== deviceId && Date.now() - Date.parse(m.startedAt || 0) < 5 * 60e3)
      throw new Error('Another device is importing right now — wait a minute and reload.');
    tr.set(metaRef, { schema: 1, state: 'importing', by: deviceId, source, startedAt: new Date().toISOString() });
  });
  const imp = buildImport(legacy, { coinNames: S.opts.coinNames });
  const ops = [];
  imp.coins.forEach(c => ops.push(['coins', safeId(c.sym), c]));
  imp.txs.forEach(t => { const { id, ...d } = t; ops.push(['txs', safeId(id), d]); });
  imp.accum.forEach(a => ops.push(['accum', safeId(a.sym), a]));
  imp.snapDays.forEach(({ id, ...d }) => ops.push(['snaps', id, d]));
  for (let i = 0; i < ops.length; i += 400) {
    const b = fs.writeBatch(db);
    ops.slice(i, i + 400).forEach(([c, id, d]) => b.set(fs.doc(db, ...userPath(c, id)), d));
    await b.commit();
  }
  await fs.setDoc(metaRef, { schema: 1, state: 'done', by: deviceId, source, importedAt: new Date().toISOString(),
    counts: { coins: imp.coins.length, txs: imp.txs.length, accum: imp.accum.length, snapDays: imp.snapDays.length } });
  // Seed prices only where this device has no live price yet — never overwrite fresher ones.
  const missing = {};
  for (const [sym, pr] of Object.entries(imp.prices)) if (!(S.prices[sym] && S.prices[sym].usd > 0)) missing[sym] = pr;
  API.updatePrices(missing);
  return imp;
}

// Signing out removes this device's offline copy of the portfolio (Firestore's IndexedDB cache),
// so nothing readable is left behind on a shared or lost device. Signing in again reloads it from the cloud.
async function signOutAndClear() {
  if (!fb) return;
  try { await fb.au.signOut(fb.auth); } catch (e) { setError(e, 'Sign out'); return; }
  try { await fb.fs.terminate(fb.db); await fb.fs.clearIndexedDbPersistence(fb.db); } catch (e) { console.warn('[Samsam] could not clear offline cache', e); }
  location.reload();
}

function downloadJson(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function stamp() { return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'); }
// Your settings (meta/info) — everything except the setup bookkeeping — and the category names/colours (meta/categories)
const SETTING_KEYS = ['targets', 'alerts', 'watch', 'signal', 'signalSmart', 'baseline', 'exitTab', 'exitTargets', 'exitPlan', 'exitSteps', 'wallets'];
function settingsNow() {
  const m = S.meta || {}, info = {};
  for (const k of SETTING_KEYS) if (m[k] !== undefined) info[k] = m[k];
  return { info, categories: S.catCfg || null };
}
function backupObject() {
  const d = API.getState();
  return { app: 'samsam-portfolio', kind: 'cloud-backup', exportedAt: new Date().toISOString(),
    coins: d.coins, transactions: d.transactions, accumPlan: d.accumPlan, perfSnaps: d.perfSnaps, holdingsSnaps: d.holdingsSnaps,
    settings: settingsNow(),
    // legacy-compatible view, so a backup can always be re-imported
    legacy: { coins: d.portfolio.map(c => ({ ...c })), transactions: d.transactions, archivedCoins: d.archivedCoins,
      customCoins: d.customCoins, accumPlan: d.accumPlan, perfSnaps: d.perfSnaps, holdingsSnaps: d.holdingsSnaps } };
}
// Encrypted backup (AES-256-GCM, key from your password). Resolves true when a file was downloaded,
// false when the person cancelled. opts: { title, text, data (object to back up instead of the cloud), name }
async function downloadEncrypted(obj, name, opts = {}) {
  const V = window.SamsamVault;
  if (!V || !V.available) throw new Error('Encryption is not available in this browser.');
  const pw = await V.askPassword({ mode: 'set', title: opts.title, text: opts.text });
  if (!pw) return false;
  downloadJson(await V.encryptBackup(obj, pw), name);
  return true;
}
function downloadBackup(opts = {}) {
  return downloadEncrypted(backupObject(), `cute-portfolio-backup-${stamp()}.enc.json`, opts).then(ok => {
    // remembered in the cloud, so every device's menu shows when the last backup was made
    if (ok && S.user) commit((b, ref) => b.set(ref('meta', 'info'), { lastBackupAt: new Date().toISOString() }, { merge: true }), 'Backup').catch(() => {});
    return ok;
  });
}
function backupAge() {
  const t = Date.parse(S.meta && S.meta.lastBackupAt); if (!t) return { text: 'never', old: true };
  const days = Math.floor((Date.now() - t) / 864e5);
  return { text: days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago', old: days >= 30 };
}
// Opens a backup file chosen by the person: plain JSON, or an encrypted backup (asks for its password).
async function readBackupFile(file) {
  const j = JSON.parse(await file.text());
  if (window.SamsamVault && SamsamVault.isEncrypted(j)) {
    const pw = await SamsamVault.askPassword({ mode: 'enter' });
    if (!pw) return null;
    return SamsamVault.decryptBackup(j, pw);
  }
  return j;
}

// ── UI: sign-in gate, status pill, setup panel ──────────────────────────────
function injectUi() {
  if (document.getElementById('samsamSyncPill')) return;
  const css = document.createElement('style');
  css.textContent = `
  #samsamGate{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:16px;background:var(--bg,#0b0f17);color:var(--fg,#e5e7eb);font-family:inherit}
  #samsamGate .card{max-width:420px;width:100%;background:var(--card-solid,var(--bg2,#111827));border:1px solid var(--border,#1f2937);border-radius:16px;padding:24px;text-align:center}
  #samsamGate h2{margin:0 0 8px;font-size:1.25rem} #samsamGate p{margin:8px 0;color:var(--fg2,#9ca3af);font-size:.9rem;line-height:1.5}
  .samsam-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:10px 18px;border-radius:10px;border:1px solid var(--border,#374151);background:var(--bg3,#1f2937);color:var(--fg,#e5e7eb);font:inherit;font-weight:600;cursor:pointer}
  .samsam-btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}
  .samsam-btn[disabled]{opacity:.6;cursor:default}
  #samsamSyncPill{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));z-index:99990;transition:padding .2s,gap .2s,opacity .2s;display:flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;font:600 12px/1.2 system-ui,-apple-system,sans-serif;background:var(--bg2,var(--card,#111827));color:var(--fg,#e5e7eb);border:1px solid var(--border,#374151);box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;max-width:calc(100vw - 24px)}
  #samsamSyncPill[data-s=error]{border-color:#ef4444}
  /* When everything is synced the floating badge steps aside (it would sit over the numbers);
     the status lives in the page header instead. It comes back while saving, offline or on an error. */
  #samsamSyncPill.mini{display:none}
  .ss-sync-hdr{position:relative;gap:0}
  .ss-sync-hdr .ss-cloud{display:inline-flex;line-height:0}
  .ss-sync-hdr .ss-live{position:absolute;right:5px;bottom:5px;width:8px;height:8px;box-shadow:0 0 0 2px var(--bg2,var(--card,#111827))}
  @media print{.ss-sync-hdr{display:none!important}}
  #samsamSyncMenu{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:calc(max(16px,env(safe-area-inset-bottom)) + 44px);z-index:99991;display:none;width:min(300px,calc(100vw - 24px));background:var(--card-solid,var(--bg2,#111827));color:var(--fg,#e5e7eb);border:1px solid var(--border,#374151);border-radius:12px;padding:12px;font:13px/1.45 system-ui,-apple-system,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35)}
  #samsamSyncMenu .row{display:flex;gap:8px;margin-top:10px} #samsamSyncMenu .samsam-btn{flex:1;min-height:38px;padding:8px;font-size:12px}
  #samsamSyncMenu .muted{color:var(--fg2,#9ca3af);font-size:12px} #samsamSyncMenu .err{color:#ef4444;font-size:12px;margin-top:6px;word-break:break-word}
  #samsamSetup{display:none;margin:12px auto;max-width:760px;background:var(--card-solid,var(--bg2,#111827));border:1px solid #2563eb;border-radius:14px;padding:18px;color:var(--fg,#e5e7eb)}
  #samsamSetup h3{margin:0 0 6px;font-size:1.05rem} #samsamSetup p{margin:6px 0;color:var(--fg2,#9ca3af);font-size:.88rem;line-height:1.5}
  #samsamSetup .opts{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px} #samsamSetup .opts .samsam-btn{flex:1 1 200px}
  #samsamSetup .msg{margin-top:10px;font-size:.85rem}
  /* Empty space at the end of every page, so the floating Synced badge never covers the last row */
  body::after{content:"";display:block;height:calc(72px + env(safe-area-inset-bottom,0px))}
  @media (max-width:700px){body::after{height:calc(96px + env(safe-area-inset-bottom,0px))}}
  /* pages with the bottom bar already keep room for it (the badge only shows on a problem) — just a small gap under the footer */
  body.has-bnav::after,body.in-shell::after{height:12px!important}
  #cpAlerts{position:fixed;inset:0;z-index:99995;background:rgba(2,6,23,.55);display:flex;align-items:flex-end;justify-content:center;padding:0}
  @media (min-width:640px){#cpAlerts{align-items:center;padding:16px}}
  #cpAlerts .al-box{width:min(460px,100%);max-height:92vh;overflow:auto;background:var(--card-solid,var(--bg2,#111827));color:var(--fg,#e5e7eb);border:1px solid var(--border,#374151);border-radius:18px 18px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));font:14px/1.45 system-ui,-apple-system,'Inter',sans-serif;box-shadow:0 -10px 40px rgba(0,0,0,.35)}
  @media (min-width:640px){#cpAlerts .al-box{border-radius:18px}}
  #cpAlerts .al-h{display:flex;align-items:center;gap:10px;margin-bottom:4px} #cpAlerts .al-h b{font-size:1.05rem;flex:1}
  #cpAlerts .al-ic{width:32px;height:32px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:rgba(124,58,237,.16);color:#a78bfa}
  [data-theme="light"] #cpAlerts .al-ic{color:#6d28d9;background:rgba(124,58,237,.1)}
  #cpAlerts .al-x{background:none;border:0;color:var(--fg2,#9ca3af);cursor:pointer;padding:6px;line-height:0}
  #cpAlerts .al-sub{color:var(--fg2,#9ca3af);font-size:12.5px;margin:0 0 12px}
  #cpAlerts .al-sec{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--fg2,#9ca3af);margin:14px 0 6px}
  #cpAlerts .al-seg{display:grid;grid-template-columns:1fr 1fr;gap:4px;background:var(--bg3,#1f2937);border:1px solid var(--border,#374151);border-radius:12px;padding:4px}
  #cpAlerts .al-seg button{border:0;border-radius:9px;padding:9px;font:inherit;font-weight:700;background:none;color:var(--fg2,#9ca3af);cursor:pointer}
  #cpAlerts .al-seg button[aria-pressed="true"]{background:#7c3aed;color:#fff}
  #cpAlerts .al-row{display:flex;align-items:center;gap:10px;padding:10px 2px;border-top:1px solid var(--border,#374151)}
  #cpAlerts .al-row:first-of-type{border-top:0}
  #cpAlerts .al-t{flex:1;min-width:0} #cpAlerts .al-t b{display:block;font-size:13.5px} #cpAlerts .al-t span{display:block;font-size:12px;color:var(--fg2,#9ca3af)}
  #cpAlerts select{background:var(--bg3,#1f2937);color:var(--fg,#e5e7eb);border:1px solid var(--border,#374151);border-radius:8px;padding:5px 6px;font:inherit;font-size:12.5px}
  #cpAlerts .al-sw{position:relative;width:42px;height:24px;flex:none} #cpAlerts .al-sw input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer;z-index:1}
  #cpAlerts .al-sw i{position:absolute;inset:0;border-radius:12px;background:var(--border,#374151);transition:background .15s} #cpAlerts .al-sw i::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .15s}
  #cpAlerts .al-sw input:checked + i{background:#7c3aed} #cpAlerts .al-sw input:checked + i::after{transform:translateX(18px)}
  #cpAlerts .al-sw input:focus-visible + i{outline:2px solid #a78bfa;outline-offset:2px}
  #cpAlerts .al-foot{display:flex;gap:8px;margin-top:14px} #cpAlerts .al-foot .samsam-btn{flex:1;min-height:42px}
  #cpAlerts .al-note{font-size:12px;color:var(--fg2,#9ca3af);margin-top:10px;line-height:1.5} #cpAlerts .al-msg{font-size:12.5px;margin-top:8px;min-height:1em}
  #cpAlerts .al-msg.ok{color:#22c55e} #cpAlerts .al-msg.err{color:#ef4444}
  @media print{#samsamSyncPill,#samsamSyncMenu,#samsamGate{display:none!important} body::after{display:none}}`;
  document.head.appendChild(css);
  const gate = document.createElement('div'); gate.id = 'samsamGate';
  gate.innerHTML = `<div class="card"><img src="./logo-mark.svg?v=1" alt="" width="64" height="64" style="margin:0 auto 10px;display:block"><h2>Cute Portfolio</h2><div id="samsamGateBody"></div></div>`;
  const pill = document.createElement('button'); pill.id = 'samsamSyncPill'; pill.type = 'button';
  pill.innerHTML = `<span class="ss-live" id="samsamSyncDot" data-state="loading"></span><span id="samsamSyncText">Connecting…</span>`;
  const menu = document.createElement('div'); menu.id = 'samsamSyncMenu';
  const openMenu = (e, anchor) => {
    e.stopPropagation();
    const show = menu.style.display !== 'block';
    menu.style.display = show ? 'block' : 'none';
    if (show && anchor) {           // opened from the header: drop down under the button
      const r = anchor.getBoundingClientRect();
      menu.style.top = (r.bottom + 8) + 'px'; menu.style.bottom = 'auto'; menu.style.right = Math.max(8, innerWidth - r.right) + 'px';
    } else if (show) { menu.style.top = ''; menu.style.bottom = ''; menu.style.right = ''; }
    renderStatus();
  };
  pill.addEventListener('click', e => openMenu(e, null));
  // Cloud status button next to every theme button (page headers + Holdings screen)
  // (also for theme buttons added later — samsam-ui.js puts one in every page header)
  const addCloud = t => {
    if (t.__ssCloud) return; t.__ssCloud = true;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ss-theme-btn ss-sync-hdr';
    b.innerHTML = '<span class="ss-cloud" aria-hidden="true">' + UIc('cloud', { solo: true, size: 18 }) + '</span><span class="ss-live" data-state="loading"></span>';
    b.addEventListener('click', e => openMenu(e, b));
    t.parentNode.insertBefore(b, t);
    // Theme button pinned to a corner (main page header): pin the cloud button just to its left
    const cs = getComputedStyle(t);
    if (cs.position === 'absolute') Object.assign(b.style, { position: 'absolute', top: cs.top, right: (parseFloat(cs.right) + t.offsetWidth + 8) + 'px', zIndex: cs.zIndex });
    renderStatus();
  };
  document.querySelectorAll('[data-theme-toggle]').forEach(addCloud);
  window.__ssCloudBtn = addCloud;
  document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.style.display = 'none'; });
  document.body.append(gate, pill, menu);
}

function showGate(kind) {
  const g = document.getElementById('samsamGate'), body = document.getElementById('samsamGateBody');
  if (window.CPSplash) CPSplash.hide();
  if (!g) return;
  if (kind === 'config') body.innerHTML = `<p>Cloud sync isn't configured yet.</p><p>Add your Firebase settings to <code>firebase-config.js</code> and publish again.</p>`;
  else if (kind === 'denied') body.innerHTML = `<p><strong>${esc(S.denied)}</strong> isn't allowed in yet.</p>` +
    `<p style="margin:10px 0 6px">🎟 Have an invite code?</p><input id="samsamInvite" autocapitalize="characters" autocomplete="off" maxlength="12" placeholder="e.g. 2NS782A9" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid rgba(127,127,140,.35);font:inherit;margin-bottom:8px;letter-spacing:.08em;text-transform:uppercase">` +
    `<button class="samsam-btn primary" id="samsamJoinBtn">Join</button><p id="samsamGateErr" style="color:#ef4444">${esc(S.inviteErr || '')}</p>` +
    `<button class="samsam-btn" id="samsamOtherBtn" style="margin-top:6px">Use another account</button>`;
  else body.innerHTML = (pendingInvite() ? `<p style="font-weight:700">🎟 You're invited to Cute Portfolio — sign in to join.</p>` : '') + `<p>${S.emailLinkPending ? 'Type the e-mail address the sign-in link was sent to.' : 'Sign in to load your portfolio. Your data is stored privately in the cloud and stays the same on every device.'}</p>` +
    (S.emailLinkPending ? '' : `<button class="samsam-btn primary" id="samsamSignInBtn">Sign in with Google</button><p class="samsam-or" style="margin:14px 0 8px;opacity:.7">or with any e-mail (iCloud, Outlook…) — no password</p>`) +
    `<input id="samsamEmail" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid rgba(127,127,140,.35);font:inherit;margin-bottom:8px">` +
    `<button class="samsam-btn" id="samsamEmailBtn">${S.emailLinkPending ? 'Sign in' : 'Email me a sign-in link'}</button><p id="samsamGateErr" style="color:#ef4444"></p><p id="samsamGateOk" style="color:#16a34a"></p>`;
  if (kind === 'denied') body.innerHTML += `<p style="opacity:.75;font-size:13px">No code? Ask Dr. Samir Saad for an invite link — or, if you're in the Telegram bot already, send it /app with this e-mail.</p>`;
  const jb = document.getElementById('samsamJoinBtn'); if (jb) jb.onclick = async () => {
    const er = document.getElementById('samsamGateErr'), code = (document.getElementById('samsamInvite') || {}).value;
    if (er) er.textContent = ''; jb.disabled = true;
    const r = await redeemInvite(S.deniedUser, code);
    if (r.ok) { onUser(S.deniedUser); return; }
    jb.disabled = false; if (er) er.textContent = r.error || 'That code did not work.';
  };
  const ob = document.getElementById('samsamOtherBtn'); if (ob) ob.onclick = async () => { try { await fb.au.signOut(fb.auth); } catch (_) {} };
  const b = document.getElementById('samsamSignInBtn'); if (b) b.onclick = () => signIn();
  const eb = document.getElementById('samsamEmailBtn'); if (eb) eb.onclick = () => emailLink(document.getElementById('samsamEmail').value);
  g.style.display = 'flex';
}
function hideGate() { const g = document.getElementById('samsamGate'); if (g) g.style.display = 'none'; }

// any e-mail: Firebase sends a one-time sign-in link; opening it on this device finishes the sign-in (finishEmailLink)
async function emailLink(raw) {
  const email = String(raw || '').trim().toLowerCase(), err = document.getElementById('samsamGateErr'), ok = document.getElementById('samsamGateOk');
  if (err) err.textContent = ''; if (ok) ok.textContent = '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { if (err) err.textContent = 'Type a valid e-mail address.'; return; }
  if (S.emailLinkPending) return finishEmailLink(email);
  try {
    await fb.au.sendSignInLinkToEmail(fb.auth, email, { url: location.origin + location.pathname, handleCodeInApp: true });
    try { localStorage.setItem('cp-signin-email', email); } catch (_) {}
    if (ok) ok.textContent = 'Sent ✅ Open the link in the e-mail on this device (check spam too).';
  } catch (e) { if (err) err.textContent = friendly(e); }
}
async function finishEmailLink(email) {
  try {
    await fb.au.signInWithEmailLink(fb.auth, email, location.href);
    try { localStorage.removeItem('cp-signin-email'); } catch (_) {}
    S.emailLinkPending = false;
    history.replaceState(null, '', location.pathname + location.hash);   // the one-time code out of the address bar
  } catch (e) { S.emailLinkPending = false; setError(e); const el = document.getElementById('samsamGateErr'); if (el) el.textContent = friendly(e); }
}

async function signIn() {
  const { au, auth } = fb;
  const provider = new au.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try { await au.signInWithPopup(auth, provider); }
  catch (e) {
    if (/popup-blocked|operation-not-supported|web-storage-unsupported/.test(e.code || '')) return au.signInWithRedirect(auth, provider);
    if (/popup-closed-by-user|cancelled-popup-request/.test(e.code || '')) return;
    const el = document.getElementById('samsamGateErr'); if (el) el.textContent = friendly(e);
  }
}

function friendly(e) {
  const c = (e && e.code) || '';
  if (!navigator.onLine) return 'You are offline. Changes are kept on this device and sent when the connection returns.';
  if (/resource-exhausted|quota/.test(c)) return 'The cloud is busy (quota reached). Your change is kept — try again later.';
  if (/unauthenticated/.test(c)) return 'Your sign-in expired. Sign in again.';
  if (/permission-denied/.test(c)) return 'Permission denied — this account is not allowed by the database rules.';
  if (/unauthorized-domain/.test(c)) return 'This website address is not in Firebase → Authentication → Authorized domains.';
  if (/network|unavailable/.test(c)) return 'No connection to the cloud right now.';
  return (e && e.message) || String(e);
}
function setError(e, label = 'Sync') {
  console.error('[Samsam]', label, e);
  S.lastError = { label, message: friendly(e), at: new Date() };
  renderStatus();
}

function renderStatus() {
  const pill = document.getElementById('samsamSyncPill'), txt = document.getElementById('samsamSyncText');
  const menu = document.getElementById('samsamSyncMenu');
  if (!pill) return;
  let s, label;
  if (!S.configured) { s = 'error'; label = 'Cloud not configured'; }
  else if (!S.authResolved) { s = 'saving'; label = 'Connecting…'; }
  else if (!S.user) { s = 'offline'; label = 'Signed out'; }
  else if (S.lastError) { s = 'error'; label = 'Sync problem — tap'; }
  else if (!allLoaded()) { s = 'saving'; label = 'Loading…'; }
  else if (!navigator.onLine || (S.pending && S.fromCache)) { s = 'offline'; label = S.pending ? `Offline · ${S.pending} change${S.pending > 1 ? 's' : ''} waiting` : 'Offline · saved on device'; }
  else if (S.pending) { s = 'saving'; label = 'Saving…'; }
  else if (S.fromCache) { s = 'saving'; label = 'Syncing…'; }
  else { s = 'synced'; label = 'Synced'; }
  pill.dataset.s = s; txt.innerHTML = UIc('cloud') + esc(label);
  pill.title = 'Cloud sync: ' + label; pill.setAttribute('aria-label', 'Cloud sync: ' + label);
  // Stay expanded while anything needs attention; collapse to the dot a moment after "Synced"
  // The floating badge only appears when something needs attention (offline with waiting changes, or an error).
  // Connecting / saving / synced show on the ☁️ button in the page header instead — nothing floats over the page.
  clearTimeout(pill._miniT);
  pill.classList.toggle('mini', !(s === 'offline' || s === 'error'));
  document.querySelectorAll('.ss-sync-hdr').forEach(b => {
    b.title = 'Cloud sync: ' + label; b.setAttribute('aria-label', 'Cloud sync: ' + label);
    const d = b.querySelector('.ss-live'); if (d) d.dataset.state = { synced: 'ok', saving: 'loading', offline: 'idle', error: 'error' }[s] || 'idle';
  });
  // Same shared status dot as the Live indicator (samsam-ui.js)
  const dot = document.getElementById('samsamSyncDot');
  if (dot) dot.dataset.state = { synced: 'ok', saving: 'loading', offline: 'idle', error: 'error' }[s] || 'idle';
  if (menu && menu.style.display === 'block') {
    const t = S.lastSyncedAt ? S.lastSyncedAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    menu.innerHTML = `<div><strong>Cloud sync</strong></div>
      <div class="muted">${S.user ? 'Signed in as ' + esc(S.user.email || '') : 'Not signed in'}</div>
      <div class="muted">Last confirmed by server: ${t}</div>
      <div class="muted">Device: ${deviceId.slice(-6)}</div>
      ${S.lastError ? `<div class="err">${UIc('alert')}${esc(S.lastError.label)}: ${esc(S.lastError.message)}</div>` : ''}
      ${S.user && allLoaded() ? (a => '<div class="muted" style="margin-top:10px"' + (a.old ? ' data-old="1"' : '') + '>' + UIc(a.old ? 'alert' : 'lock') + 'Last backup: <b' + (a.old ? ' style="color:#f59e0b"' : '') + '>' + a.text + '</b></div>')(backupAge()) : ''}
      <div class="row">${S.user && allLoaded() ? '<button class="samsam-btn" id="samsamBk" title="Download an encrypted backup (AES-256)">' + UIc('lock') + 'Backup</button>' +
        (window.SamsamSettings ? '<button class="samsam-btn" id="samsamSettings" title="Every setting: alerts, rules, data, display">' + UIc('sliders') + 'Settings</button>' : '') : ''}
      ${S.user ? '' : '<button class="samsam-btn primary" id="samsamIn">Sign in</button>'}</div>
      ${S.lastError ? '<div class="row"><button class="samsam-btn" id="samsamClr">Dismiss error</button><button class="samsam-btn" id="samsamReload">Reload</button></div>' : ''}`;
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    on('samsamBk', () => { menu.style.display = 'none'; downloadBackup().catch(e => setError(e, 'Backup')); }); on('samsamOut', () => API.signOut()); on('samsamIn', signIn);
    on('samsamClr', () => { S.lastError = null; renderStatus(); }); on('samsamReload', () => location.reload());
    on('samsamAlerts', () => { menu.style.display = 'none'; openAlertsSheet(); });
    on('samsamImport', () => { menu.style.display = 'none'; window.SamsamImport.open(); });
    on('samsamSettings', () => { menu.style.display = 'none'; window.SamsamSettings.open(); });
  }
}

// ── Telegram alerts sheet (from the cloud menu, on every page) ──
function openAlertsSheet() {
  if (!S.user || !allLoaded() || !isMainOwner()) return;   // the GitHub Telegram alerts go to Samir only (members: alerts in the bot)
  document.getElementById('cpAlerts')?.remove();
  const a = cleanAlerts(S.meta && S.meta.alerts), back = document.activeElement;
  const sw = (k, title, sub, extra = '') => `<div class="al-row"><div class="al-t"><b>${title}</b><span>${sub}</span></div>${extra}<label class="al-sw"><input type="checkbox" data-k="${k}" ${a[k] ? 'checked' : ''} aria-label="${esc(title)}"><i></i></label></div>`;
  const sel = (k, opts, fmt) => `<select data-k="${k}" aria-label="${k}">${opts.map(v => `<option value="${v}" ${String(a[k]) === String(v) ? 'selected' : ''}>${fmt(v)}</option>`).join('')}</select>`;
  const times = []; for (let h = 5; h <= 11; h++) for (const m of ['00', '30']) times.push(String(h).padStart(2, '0') + ':' + m);
  const el = document.createElement('div'); el.id = 'cpAlerts'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Telegram alerts');
  el.innerHTML = `<div class="al-box">
    <div class="al-h"><span class="al-ic">${UIc('bell', { solo: true, size: 18 })}</span><b>Telegram alerts</b><button type="button" class="al-x" aria-label="Close">${UIc('x', { solo: true, size: 18 })}</button></div>
    <p class="al-sub">Sent by your bot. GitHub checks every 30 minutes, after the market update.</p>
    <div class="al-sec">Language</div>
    <div class="al-seg" role="group" aria-label="Language"><button type="button" data-lang="en" aria-pressed="${a.lang === 'en'}">English</button><button type="button" data-lang="ar" aria-pressed="${a.lang === 'ar'}">العربية</button></div>
    <div class="al-sec">Reports</div>
    ${sw('brief', 'Morning brief', 'Your portfolio, movers and the market, every day', sel('briefTime', times, v => v))}
    ${sw('weekly', 'Weekly report', 'Friday morning: the week vs BTC')}
    <div class="al-sec">Alerts</div>
    ${sw('moves', 'Big moves', 'BTC or your portfolio moves this much', sel('movePct', [3, 5, 8, 10, 15], v => '±' + v + '%'))}
    ${sw('signals', 'Signal changes', 'A coin turns Reinforce, Hold or Sell / Convert')}
    ${sw('plan', 'Plan targets', 'A coin reaches its Accumulation Plan target')}
    ${sw('buy', 'Buy-price alerts', 'A plan coin drops to the alert price you set on it')}
    ${sw('tp', 'Take-profit levels', 'A coin reaches TP1 / TP2 / TP3 of your exit plan')}
    ${sw('macro', 'Exit levels', 'BTC dominance, USDT dominance, ETH/BTC at your exit targets')}
    ${sw('drift', 'Allocation drift', 'A category moves outside your target allocation band')}
    ${sw('dca', 'DCA reminders', 'Your regular buys: on the day, and 2 days late if not bought')}
    ${sw('sentiment', 'Market extremes', 'Extreme Fear / Greed, Altcoin / Bitcoin Season')}
    ${sw('etf', 'Big ETF days', 'BTC or ETH spot ETFs move at least', sel('etfMin', [250, 500, 1000, 2000], v => v >= 1000 ? '$' + v / 1000 + 'B' : '$' + v + 'M'))}
    ${sw('health', 'Data warnings', 'A price or market source stops updating')}
    <div class="al-sec">Quiet</div>
    ${sw('quiet', 'Quiet hours 00:00–07:00', 'Alerts wait until morning, except very big moves (2× your %)')}
    <div class="al-foot"><button type="button" class="samsam-btn" data-act="cancel">Cancel</button><button type="button" class="samsam-btn primary" data-act="save">Save</button></div>
    <div class="al-msg" role="status"></div>
    <div class="al-note">Times are Riyadh time. Each alert comes once; it can come again only after the condition went away.</div>
  </div>`;
  document.body.appendChild(el);
  const close = () => { el.remove(); document.removeEventListener('keydown', key, true); try { back && back.focus && back.focus(); } catch (_) {} };
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', key, true);
  el.addEventListener('click', e => { if (e.target === el) close(); });
  el.querySelector('.al-x').onclick = close; el.querySelector('[data-act=cancel]').onclick = close;
  el.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => el.querySelectorAll('[data-lang]').forEach(x => x.setAttribute('aria-pressed', String(x === b))));
  el.querySelector('[data-act=save]').onclick = async () => {
    const v = { lang: el.querySelector('[data-lang][aria-pressed="true"]').dataset.lang };
    el.querySelectorAll('input[data-k]').forEach(i => { v[i.dataset.k] = i.checked; });
    el.querySelectorAll('select[data-k]').forEach(s => { v[s.dataset.k] = s.dataset.k === 'briefTime' ? s.value : +s.value; });
    const msg = el.querySelector('.al-msg'); msg.className = 'al-msg'; msg.textContent = 'Saving…';
    try { await API.setAlerts(v); msg.className = 'al-msg ok'; msg.textContent = 'Saved — the next check uses these settings.'; setTimeout(close, 900); }
    catch (e) { msg.className = 'al-msg err'; msg.textContent = 'Not saved: ' + (e && e.message || e); }
  };
  setTimeout(() => el.querySelector('[data-lang][aria-pressed="true"]').focus(), 30);
}

// Setup panel (only on the main page): shown once, when the cloud is empty.
function renderSetup(d) {
  let el = document.getElementById('samsamSetup');
  if (!d.needsSetup) { if (el) el.style.display = 'none'; return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'samsamSetup';
    const host = document.querySelector('.container') || document.querySelector('main') || document.body;
    host.insertBefore(el, host.firstChild);
  }
  if (!S.opts.setupPage) {
    el.innerHTML = isMainOwner() ? `<h3>${UIc('cloud')}One-time setup needed</h3><p>Your cloud portfolio is empty. Open the main <a href="index.html" style="color:#60a5fa">Portfolio page</a> to import your data.</p>`
      : `<h3>👋 Your portfolio is new</h3><p>Open the <a href="index.html" style="color:#60a5fa">Portfolio page</a> to start it — then add your first coin.</p>`;
    el.style.display = 'block'; return;
  }
  if (el.dataset.busy) return;
  if (!isMainOwner()) return renderWelcome(el);
  const L = readLegacy();
  const hasLocal = L.coins.length > 0;
  const cost = L.coins.reduce((s, c) => s + (+c.qty || 0) * (+c.basePrice || 0), 0);
  const when = L.lastSave ? new Date(L.lastSave).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'unknown';
  el.innerHTML = `<h3>${UIc('cloud')}Set up your cloud portfolio (one time)</h3>
    <p>The cloud is empty. Choose where your real data is. Do this on the device that has your <strong>most up-to-date</strong> portfolio — all other devices will then load it automatically.</p>
    ${hasLocal ? `<p><strong>This device has:</strong> ${L.coins.length} coins, ${L.transactions.length} transactions, ${L.accumPlan.length} accumulation targets, Cost Basis $${cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, last saved ${when}.</p>` : '<p>This device has no saved portfolio.</p>'}
    <div class="opts">
      ${hasLocal ? '<button class="samsam-btn primary" id="samsamImpLocal">' + UIc('upload') + 'Upload this device\'s data</button>' : ''}
      <label class="samsam-btn" style="position:relative">${UIc('file')}Import a backup file<input type="file" accept="application/json,.json" id="samsamImpFile" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>
      ${S.opts.basePortfolio ? '<button class="samsam-btn" id="samsamImpBase">Start from the Oct-15 starting portfolio</button>' : ''}
    </div>
    <p class="muted" style="font-size:.8rem">Before uploading, an encrypted backup file of this device's data is downloaded first.</p>
    <div class="msg" id="samsamSetupMsg"></div>`;
  el.style.display = 'block';
  const msg = t => { const m = document.getElementById('samsamSetupMsg'); if (m) m.innerHTML = t; };
  const go = async (legacy, source, backupFirst) => {
    el.dataset.busy = '1';
    el.querySelectorAll('button,input').forEach(b => b.disabled = true);
    try {
      if (backupFirst && !(await downloadEncrypted({ app: 'samsam-portfolio', kind: 'device-backup', exportedAt: new Date().toISOString(), legacy },
        `cute-portfolio-device-backup-${stamp()}.enc.json`, { title: 'Backup before upload', icon: 'lock', text: 'A copy of this device\'s data is saved first, encrypted. Choose a password (8+ characters) — you need it only to open that file.' }))) {
        delete el.dataset.busy; el.querySelectorAll('button,input').forEach(b => b.disabled = false); msg(''); return;
      }
      msg('Uploading…');
      const r = await runImport(legacy, source);
      msg(`${UIc('checkCircle')}Done — ${r.coins.length} coins and ${r.txs.length} transactions are now in the cloud.` + (r.adjusted.length ? ` (${r.adjusted.length} coin(s) had manual edits; an “Imported” correction keeps their figures exactly as before.)` : ''));
      delete el.dataset.busy;
    } catch (e) { delete el.dataset.busy; msg(UIc('alert') + esc(friendly(e))); el.querySelectorAll('button,input').forEach(b => b.disabled = false); }
  };
  const bl = document.getElementById('samsamImpLocal'); if (bl) bl.onclick = () => go(L, 'device:' + deviceId, true);
  const bb = document.getElementById('samsamImpBase'); if (bb) bb.onclick = async () => {
    if (!(await CPDialog.confirm('Use this only if no device has your real data.', { title: 'Start from the Oct-15 starting portfolio?', okText: 'Start' }))) return;
    go({ coins: S.opts.basePortfolio.map(c => ({ ...c, currentPrice: (S.opts.fallbackPrices || {})[c.sym] || c.basePrice })), transactions: [] }, 'baseline', false);
  };
  const bf = document.getElementById('samsamImpFile'); if (bf) bf.onchange = async () => {
    const f = bf.files && bf.files[0]; if (!f) return;
    try {
      let j; try { j = await readBackupFile(f); } finally { bf.value = ''; }
      if (!j) return;
      const legacy = j.legacy || (j.portfolioData ? { ...j.portfolioData, accumPlan: j.accumPlan, perfSnaps: j.perfSnaps } : j);
      if (!legacy || !Array.isArray(legacy.coins)) throw new Error('This file is not a Cute Portfolio backup.');
      if (!(await CPDialog.confirm(`${legacy.coins.length} coins and ${(legacy.transactions || []).length} transactions from “${f.name}”.`, { title: 'Import this backup?', okText: 'Import' }))) return;
      go(legacy, 'file:' + f.name, false);
    } catch (e) { msg(UIc('alert') + esc(friendly(e))); }
  };
}

// 👋 an invited member's first visit: a new, empty portfolio of their own (or their backup). Their baseline = the day they start.
function renderWelcome(el) {
  el.innerHTML = `<h3>👋 Welcome to Cute Portfolio</h3>
    <p>Your portfolio is new and private — only you can see it.</p>
    <div class="opts">
      <button class="samsam-btn primary" id="samsamStartEmpty">${UIc('plus')}Start my portfolio</button>
      <label class="samsam-btn" style="position:relative">${UIc('file')}I have a backup file<input type="file" accept="application/json,.json" id="samsamImpFile" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>
    </div>
    <p class="muted" style="font-size:.8rem">Then add your coins with <b>+</b>, or bring your trades from an exchange: Settings → Import from exchange.</p>
    <div class="msg" id="samsamSetupMsg"></div>`;
  el.style.display = 'block';
  const msg = t => { const m = document.getElementById('samsamSetupMsg'); if (m) m.innerHTML = t; };
  const go = async (legacy, source) => {
    el.dataset.busy = '1'; el.querySelectorAll('button,input').forEach(b => b.disabled = true); msg('Setting up…');
    try {
      await runImport(legacy, source);
      await startBaseline().catch(() => {});   // the day they start (they can change it in Settings → Baseline)
      delete el.dataset.busy; msg('');
    } catch (e) { delete el.dataset.busy; msg(UIc('alert') + esc(friendly(e))); el.querySelectorAll('button,input').forEach(b => b.disabled = false); }
  };
  const be = document.getElementById('samsamStartEmpty'); if (be) be.onclick = () => go({ coins: [], transactions: [] }, 'new');
  const bf = document.getElementById('samsamImpFile'); if (bf) bf.onchange = async () => {
    const f = bf.files && bf.files[0]; if (!f) return;
    try {
      let j; try { j = await readBackupFile(f); } finally { bf.value = ''; }
      if (!j) return;
      const legacy = j.legacy || (j.portfolioData ? { ...j.portfolioData, accumPlan: j.accumPlan, perfSnaps: j.perfSnaps } : j);
      if (!legacy || !Array.isArray(legacy.coins)) throw new Error('This file is not a Cute Portfolio backup.');
      if (!(await CPDialog.confirm(`${legacy.coins.length} coins and ${(legacy.transactions || []).length} transactions from “${f.name}”.`, { title: 'Import this backup?', okText: 'Import' }))) return;
      go(legacy, 'file:' + f.name);
    } catch (e) { msg(UIc('alert') + esc(friendly(e))); }
  };
}
// a member's baseline: today, at today's BTC price (live; else yesterday's close)
async function startBaseline() {
  if (S.meta && S.meta.baseline) return;
  const today = new Date().toISOString().slice(0, 10);
  let p = S.prices.BTC && S.prices.BTC.usd > 0 ? S.prices.BTC.usd : 0, date = today;
  if (!(p > 0)) { date = new Date(Date.now() - 864e5).toISOString().slice(0, 10); p = await API.fetchBtcPriceOn(date); }
  return API.setBaseline({ date, btcPrice: Math.round(p), source: 'coingecko' });
}

boot().catch(e => { setError(e, 'Start-up'); });
