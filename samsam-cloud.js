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

import * as Core from './samsam-core.js?v=202610231133';
import { FIREBASE_CONFIG, ALLOWED_EMAILS } from './firebase-config.js?v=202610231133';

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
function cleanCoin(c) {
  const o = { ...c, sym: Clean.sym(c.sym || c.id) };
  if ('name' in o) o.name = Clean.label(o.name) || o.sym;
  if ('notes' in o) o.notes = Clean.text(o.notes, 500);
  if ('cgId' in o) o.cgId = Clean.cgId(o.cgId);
  if ('ccSlug' in o) o.ccSlug = Clean.cgId(o.ccSlug);
  if ('cmcSlug' in o) o.cmcSlug = Clean.cgId(o.cmcSlug);
  if ('logoUrl' in o) o.logoUrl = Clean.url(o.logoUrl);
  if ('cat' in o) o.cat = Clean.key(o.cat) || 'other';
  if ('catLabel' in o) o.catLabel = Clean.label(o.catLabel, 40) || null;
  if ('catLocked' in o) o.catLocked = o.catLocked === true;
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
  return o;
}

// ── state ───────────────────────────────────────────────────────────────────
const S = {
  configured: !!(FIREBASE_CONFIG && FIREBASE_CONFIG.projectId && !/PASTE/i.test(FIREBASE_CONFIG.apiKey || 'PASTE')),
  user: null, authResolved: false, denied: null,
  coins: new Map(), txs: new Map(), accum: new Map(), snapDocs: new Map(), meta: null,
  loaded: { coins: false, txs: false, accum: false, snaps: false, meta: false },
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
function currentBaseline() {
  const b = cleanBaseline(S.meta && S.meta.baseline);
  return b ? { ...b, isDefault: false } : { ...DEFAULT_BASELINE, setAt: '', source: 'default', isDefault: true };
}

function derive() {
  const coins = [...S.coins.values()];
  const txs = [...S.txs.values()].sort(Core.compareTx);
  const T = window.SamsamTaxonomy;
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
  const snaps = Core.flattenSnaps([...S.snapDocs.values()]);
  const btc = S.prices.BTC && S.prices.BTC.usd > 0 ? S.prices.BTC.usd
    : (portfolio.find(c => c.sym === 'BTC') || {}).currentPrice || S.opts.fallbackPrices.BTC || 0;
  S.derived = {
    portfolio, transactions: txs, coins, archivedCoins: removed,
    customCoins: coins.filter(c => c.isCustom && !c.removed).map(c => ({ sym: c.sym, cat: catOf(c.sym, c.cat, c.catLocked), cgId: c.cgId, logoUrl: c.logoUrl })),
    accumPlan, perfSnaps: snaps.perf, holdingsSnaps: snaps.holdings, realized, btcPrice: btc, baseline: currentBaseline(),
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
function emit() {
  setTimeout(syncCategories, 0);
  setTimeout(sealLegacy, 0);
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
  au.onAuthStateChanged(auth, user => onUser(user));
  window.addEventListener('online', renderStatus);
  window.addEventListener('offline', renderStatus);
}

function emailAllowed(user) {
  if (!user) return false;
  const list = (ALLOWED_EMAILS || []).map(e => String(e).toLowerCase().trim()).filter(Boolean);
  return list.length === 0 || list.includes(String(user.email || '').toLowerCase());
}

function onUser(user) {
  S.authResolved = true;
  S.unsub.forEach(u => { try { u(); } catch (_) {} }); S.unsub = [];
  S.coins.clear(); S.txs.clear(); S.accum.clear(); S.snapDocs.clear(); S.meta = null;
  Object.keys(S.loaded).forEach(k => S.loaded[k] = false);
  S.user = null; S.denied = null;
  if (!user) { showGate('signin'); renderStatus(); return; }
  if (!emailAllowed(user)) { S.denied = user.email; showGate('denied'); fb.au.signOut(fb.auth); return; }
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
  });
}

const API = {
  // reading
  onChange(cb) { S.listeners.add(cb); if (S.derived && allLoaded()) setTimeout(() => cb(S.derived), 0); return () => S.listeners.delete(cb); },
  getState() { return S.derived || derive(); },
  isReady() { return !!S.user && allLoaded(); },
  core: Core,
  configure(opts) { Object.assign(S.opts, opts || {}); if (allLoaded()) emit(); },
  getBaseline() { return currentBaseline(); },
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

  // coins
  updateCoin(sym, fields) {
    fields = { ...fields };
    if ('name' in fields) fields.name = Clean.label(fields.name);
    if ('cat' in fields) fields.cat = Clean.key(fields.cat) || 'other';
    if ('catLabel' in fields) fields.catLabel = Clean.label(fields.catLabel, 40) || null;
    if ('catLocked' in fields) fields.catLocked = fields.catLocked === true;
    if ('notes' in fields) fields.notes = Clean.text(fields.notes, 500);
    if ('cgId' in fields) fields.cgId = Clean.cgId(fields.cgId);
    if ('ccSlug' in fields) fields.ccSlug = Clean.cgId(fields.ccSlug);
    if ('cmcSlug' in fields) fields.cmcSlug = Clean.cgId(fields.cmcSlug);
    if ('logoUrl' in fields) fields.logoUrl = Clean.url(fields.logoUrl);
    if ('lastPrice' in fields && !(Number(fields.lastPrice) > 0 && Number.isFinite(Number(fields.lastPrice)))) delete fields.lastPrice;
    return commit((b, ref, fs) => b.set(ref('coins', safeId(sym)), clean({ ...fields, updatedAt: new Date().toISOString() }), { merge: true }), `Update ${sym}`);
  },
  addCoin(coin, { qty, price, note, feeUsd } = {}) {
    const rawSym = String(coin.sym == null ? '' : coin.sym).trim().toUpperCase();
    coin = cleanCoin({ ...coin, cat: coin.cat || 'other' });
    const sym = coin.sym;
    if (!sym || sym !== rawSym) { const e = new Error('Invalid coin symbol (letters, digits, . _ - only)'); setError(e, 'Add coin'); return Promise.reject(e); }
    const existing = S.coins.get(sym);
    const hasHistory = [...S.txs.values()].some(t => t.sym === sym);
    const order = existing && existing.order != null ? existing.order : Math.max(-1, ...[...S.coins.values()].map(c => c.order ?? 0)) + 1;
    return commit((b, ref) => {
      b.set(ref('coins', safeId(sym)), clean({
        sym, name: coin.name || sym, cat: coin.cat || 'other', catLocked: coin.catLocked === true, catLabel: coin.catLabel || null,
        cgId: coin.cgId || null, cmcSlug: coin.cmcSlug || null, logoUrl: coin.logoUrl || null,
        notes: coin.notes || '', isCustom: true, removed: false, removedAt: null, order, lastPrice: price || null,
        opening: existing && existing.opening ? existing.opening : { qty: 0, avg: 0 },
        addedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }), { merge: true });
      const id = Core.newId('tx_');
      // Every new or re-added coin starts with an ordinary Buy (no manual corrections).
      b.set(ref('txs', id), txDoc(sym, 'buy', qty, price, note || (hasHistory ? 'Re-added coin' : 'Initial position'), { feeUsd }));
    }, `Add ${sym}`);
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
  removeCoin(sym) { return API.updateCoin(sym, { removed: true, removedAt: new Date().toISOString() }); },

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
    const size = kind === 'perf' ? Core.HOUR : Core.FIVE_MIN;
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
function backupObject() {
  const d = API.getState();
  return { app: 'samsam-portfolio', kind: 'cloud-backup', exportedAt: new Date().toISOString(),
    coins: d.coins, transactions: d.transactions, accumPlan: d.accumPlan, perfSnaps: d.perfSnaps, holdingsSnaps: d.holdingsSnaps,
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
  return downloadEncrypted(backupObject(), `cute-portfolio-backup-${stamp()}.enc.json`, opts);
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
  #samsamGate .card{max-width:420px;width:100%;background:var(--bg2,var(--card,#111827));border:1px solid var(--border,#1f2937);border-radius:16px;padding:24px;text-align:center}
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
  .ss-sync-hdr .ss-cloud{font-size:15px;line-height:1}
  .ss-sync-hdr .ss-live{position:absolute;right:5px;bottom:5px;width:8px;height:8px;box-shadow:0 0 0 2px var(--bg2,var(--card,#111827))}
  @media print{.ss-sync-hdr{display:none!important}}
  #samsamSyncMenu{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:calc(max(16px,env(safe-area-inset-bottom)) + 44px);z-index:99991;display:none;width:min(300px,calc(100vw - 24px));background:var(--bg2,var(--card,#111827));color:var(--fg,#e5e7eb);border:1px solid var(--border,#374151);border-radius:12px;padding:12px;font:13px/1.45 system-ui,-apple-system,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35)}
  #samsamSyncMenu .row{display:flex;gap:8px;margin-top:10px} #samsamSyncMenu .samsam-btn{flex:1;min-height:38px;padding:8px;font-size:12px}
  #samsamSyncMenu .muted{color:var(--fg2,#9ca3af);font-size:12px} #samsamSyncMenu .err{color:#ef4444;font-size:12px;margin-top:6px;word-break:break-word}
  #samsamSetup{display:none;margin:12px auto;max-width:760px;background:var(--bg2,var(--card,#111827));border:1px solid #2563eb;border-radius:14px;padding:18px;color:var(--fg,#e5e7eb)}
  #samsamSetup h3{margin:0 0 6px;font-size:1.05rem} #samsamSetup p{margin:6px 0;color:var(--fg2,#9ca3af);font-size:.88rem;line-height:1.5}
  #samsamSetup .opts{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px} #samsamSetup .opts .samsam-btn{flex:1 1 200px}
  #samsamSetup .msg{margin-top:10px;font-size:.85rem}
  /* Empty space at the end of every page, so the floating Synced badge never covers the last row */
  body::after{content:"";display:block;height:calc(72px + env(safe-area-inset-bottom,0px))}
  @media (max-width:700px){body::after{height:calc(96px + env(safe-area-inset-bottom,0px))}}
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
  document.querySelectorAll('[data-theme-toggle]').forEach(t => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ss-theme-btn ss-sync-hdr';
    b.innerHTML = '<span class="ss-cloud" aria-hidden="true">☁️</span><span class="ss-live" data-state="loading"></span>';
    b.addEventListener('click', e => openMenu(e, b));
    t.parentNode.insertBefore(b, t);
    // Theme button pinned to a corner (main page header): pin the cloud button just to its left
    const cs = getComputedStyle(t);
    if (cs.position === 'absolute') Object.assign(b.style, { position: 'absolute', top: cs.top, right: (parseFloat(cs.right) + t.offsetWidth + 8) + 'px', zIndex: cs.zIndex });
  });
  document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.style.display = 'none'; });
  document.body.append(gate, pill, menu);
}

function showGate(kind) {
  const g = document.getElementById('samsamGate'), body = document.getElementById('samsamGateBody');
  if (window.CPSplash) CPSplash.hide();
  if (!g) return;
  if (kind === 'config') body.innerHTML = `<p>Cloud sync isn't configured yet.</p><p>Add your Firebase settings to <code>firebase-config.js</code> and publish again.</p>`;
  else if (kind === 'denied') body.innerHTML = `<p><strong>${esc(S.denied)}</strong> isn't allowed to open this portfolio.</p><button class="samsam-btn primary" id="samsamSignInBtn">Sign in with another Google account</button>`;
  else body.innerHTML = `<p>Sign in to load your portfolio. Your data is stored privately in the cloud and stays the same on every device.</p><button class="samsam-btn primary" id="samsamSignInBtn">Sign in with Google</button><p id="samsamGateErr" style="color:#ef4444"></p>`;
  const b = document.getElementById('samsamSignInBtn'); if (b) b.onclick = () => signIn();
  g.style.display = 'flex';
}
function hideGate() { const g = document.getElementById('samsamGate'); if (g) g.style.display = 'none'; }

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
  pill.dataset.s = s; txt.textContent = '☁️ ' + label;
  pill.title = '☁️ ' + label; pill.setAttribute('aria-label', 'Cloud sync: ' + label);
  // Stay expanded while anything needs attention; collapse to the dot a moment after "Synced"
  // The floating badge only appears when something needs attention (offline with waiting changes, or an error).
  // Connecting / saving / synced show on the ☁️ button in the page header instead — nothing floats over the page.
  clearTimeout(pill._miniT);
  pill.classList.toggle('mini', !(s === 'offline' || s === 'error'));
  document.querySelectorAll('.ss-sync-hdr').forEach(b => {
    b.title = '☁️ ' + label; b.setAttribute('aria-label', 'Cloud sync: ' + label);
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
      ${S.lastError ? `<div class="err">⚠️ ${esc(S.lastError.label)}: ${esc(S.lastError.message)}</div>` : ''}
      ${S.user && allLoaded() ? '<div class="row"><a class="samsam-btn" href="recover.html" style="text-decoration:none">🛟 Recover data</a></div>' : ''}
      <div class="row">${S.user && allLoaded() ? '<button class="samsam-btn" id="samsamBk" title="Download an encrypted backup (AES-256)">🔐 Backup</button>' : ''}
      ${S.user ? '<button class="samsam-btn" id="samsamOut">Sign out</button>' : '<button class="samsam-btn primary" id="samsamIn">Sign in</button>'}</div>
      ${S.lastError ? '<div class="row"><button class="samsam-btn" id="samsamClr">Dismiss error</button><button class="samsam-btn" id="samsamReload">Reload</button></div>' : ''}`;
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    on('samsamBk', () => { menu.style.display = 'none'; downloadBackup().catch(e => setError(e, 'Backup')); }); on('samsamOut', () => API.signOut()); on('samsamIn', signIn);
    on('samsamClr', () => { S.lastError = null; renderStatus(); }); on('samsamReload', () => location.reload());
  }
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
    el.innerHTML = `<h3>☁️ One-time setup needed</h3><p>Your cloud portfolio is empty. Open the main <a href="index.html" style="color:#60a5fa">Portfolio page</a> to import your data.</p>`;
    el.style.display = 'block'; return;
  }
  if (el.dataset.busy) return;
  const L = readLegacy();
  const hasLocal = L.coins.length > 0;
  const cost = L.coins.reduce((s, c) => s + (+c.qty || 0) * (+c.basePrice || 0), 0);
  const when = L.lastSave ? new Date(L.lastSave).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'unknown';
  el.innerHTML = `<h3>☁️ Set up your cloud portfolio (one time)</h3>
    <p>The cloud is empty. Choose where your real data is. Do this on the device that has your <strong>most up-to-date</strong> portfolio — all other devices will then load it automatically.</p>
    ${hasLocal ? `<p><strong>This device has:</strong> ${L.coins.length} coins, ${L.transactions.length} transactions, ${L.accumPlan.length} accumulation targets, Cost Basis $${cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, last saved ${when}.</p>` : '<p>This device has no saved portfolio.</p>'}
    <div class="opts">
      ${hasLocal ? '<button class="samsam-btn primary" id="samsamImpLocal">⬆ Upload this device\'s data</button>' : ''}
      <label class="samsam-btn" style="position:relative">📄 Import a backup file<input type="file" accept="application/json,.json" id="samsamImpFile" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>
      ${S.opts.basePortfolio ? '<button class="samsam-btn" id="samsamImpBase">Start from the Oct-15 starting portfolio</button>' : ''}
    </div>
    <p class="muted" style="font-size:.8rem">Before uploading, an encrypted backup file of this device's data is downloaded first.</p>
    <div class="msg" id="samsamSetupMsg"></div>`;
  el.style.display = 'block';
  const msg = t => { const m = document.getElementById('samsamSetupMsg'); if (m) m.textContent = t; };
  const go = async (legacy, source, backupFirst) => {
    el.dataset.busy = '1';
    el.querySelectorAll('button,input').forEach(b => b.disabled = true);
    try {
      if (backupFirst && !(await downloadEncrypted({ app: 'samsam-portfolio', kind: 'device-backup', exportedAt: new Date().toISOString(), legacy },
        `cute-portfolio-device-backup-${stamp()}.enc.json`, { title: '🔐 Backup before upload', text: 'A copy of this device\'s data is saved first, encrypted. Choose a password (8+ characters) — you need it only to open that file.' }))) {
        delete el.dataset.busy; el.querySelectorAll('button,input').forEach(b => b.disabled = false); msg(''); return;
      }
      msg('Uploading…');
      const r = await runImport(legacy, source);
      msg(`✅ Done — ${r.coins.length} coins and ${r.txs.length} transactions are now in the cloud.` + (r.adjusted.length ? ` (${r.adjusted.length} coin(s) had manual edits; an “Imported” correction keeps their figures exactly as before.)` : ''));
      delete el.dataset.busy;
    } catch (e) { delete el.dataset.busy; msg('⚠️ ' + friendly(e)); el.querySelectorAll('button,input').forEach(b => b.disabled = false); }
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
    } catch (e) { msg('⚠️ ' + friendly(e)); }
  };
}

boot().catch(e => { setError(e, 'Start-up'); });
