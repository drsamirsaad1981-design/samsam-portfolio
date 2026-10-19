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

import * as Core from './samsam-core.js?v=202610191510';
import { FIREBASE_CONFIG, ALLOWED_EMAILS } from './firebase-config.js?v=202610191510';

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
const clean = obj => JSON.parse(JSON.stringify(obj)); // Firestore rejects `undefined`
const safeId = s => String(s).replace(/[\/#\[\]?*]/g, '_').slice(0, 300) || 'x';

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
function derive() {
  const coins = [...S.coins.values()];
  const txs = [...S.txs.values()].sort(Core.compareTx);
  const portfolio = Core.derivePortfolio(coins, txs, S.prices, S.opts.fallbackPrices);
  const removed = coins.filter(c => c.removed).map(c => {
    const r = Core.replay(c.opening, txs.filter(t => t.sym === c.sym));
    return { sym: c.sym, qty: r.qty, basePrice: r.avg, cat: c.cat, cgId: c.cgId, logoUrl: c.logoUrl,
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
    customCoins: coins.filter(c => c.isCustom && !c.removed).map(c => ({ sym: c.sym, cat: c.cat, cgId: c.cgId, logoUrl: c.logoUrl })),
    accumPlan, perfSnaps: snaps.perf, holdingsSnaps: snaps.holdings, realized, btcPrice: btc,
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
function emit() {
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
  const coll = (name, map, key) => fs.onSnapshot(fs.collection(db, ...userPath(name)), opt, snap => {
    track(snap);
    map.clear(); snap.forEach(d => map.set(d.id, { ...d.data(), id: d.id }));
    S.loaded[key] = true; emit();
  }, onErr(name));
  S.unsub.push(coll('coins', S.coins, 'coins'));
  S.unsub.push(coll('txs', S.txs, 'txs'));
  S.unsub.push(coll('accum', S.accum, 'accum'));
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
  requireUser();
  const { db, fs } = fb;
  const batch = fs.writeBatch(db);
  const ref = (...p) => fs.doc(db, ...userPath(...p));
  build(batch, ref, fs);
  S.pending++; renderStatus();
  return batch.commit().then(() => {
    S.pending--; S.lastSyncedAt = new Date(); if (S.lastError && S.lastError.label === label) S.lastError = null; renderStatus();
  }).catch(e => { S.pending--; setError(e, label); throw e; });
}

function txDoc(sym, type, qty, price, note, extra = {}) {
  const now = new Date().toISOString();
  return clean({
    sym, type, qty: Number(qty) || 0, price: Number(price) || 0, total: (Number(qty) || 0) * (Number(price) || 0),
    date: extra.date || now, createdAt: now, note: note || '', device: deviceId,
    ...(extra.setQty != null ? { setQty: Number(extra.setQty) } : {}),
    ...(extra.setAvg != null ? { setAvg: Number(extra.setAvg) } : {}),
    ...(extra.fee > 0 ? { fee: Number(extra.fee) } : {}),
  });
}

const API = {
  // reading
  onChange(cb) { S.listeners.add(cb); if (S.derived && allLoaded()) setTimeout(() => cb(S.derived), 0); return () => S.listeners.delete(cb); },
  getState() { return S.derived || derive(); },
  isReady() { return !!S.user && allLoaded(); },
  core: Core,
  configure(opts) { Object.assign(S.opts, opts || {}); if (allLoaded()) emit(); },

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
    return commit((b, ref, fs) => b.set(ref('coins', safeId(sym)), clean({ ...fields, updatedAt: new Date().toISOString() }), { merge: true }), `Update ${sym}`);
  },
  addCoin(coin, { qty, price, note } = {}) {
    const sym = coin.sym;
    const existing = S.coins.get(sym);
    const hasHistory = [...S.txs.values()].some(t => t.sym === sym);
    const order = existing && existing.order != null ? existing.order : Math.max(-1, ...[...S.coins.values()].map(c => c.order ?? 0)) + 1;
    return commit((b, ref) => {
      b.set(ref('coins', safeId(sym)), clean({
        sym, name: coin.name || sym, cat: coin.cat || 'other', cgId: coin.cgId || null, logoUrl: coin.logoUrl || null,
        notes: coin.notes || '', isCustom: true, removed: false, removedAt: null, order, lastPrice: price || null,
        opening: existing && existing.opening ? existing.opening : { qty: 0, avg: 0 },
        addedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }), { merge: true });
      const id = Core.newId('tx_');
      // Every new or re-added coin starts with an ordinary Buy (no manual corrections).
      b.set(ref('txs', id), txDoc(sym, 'buy', qty, price, note || (hasHistory ? 'Re-added coin' : 'Initial position')));
    }, `Add ${sym}`);
  },
  removeCoin(sym) { return API.updateCoin(sym, { removed: true, removedAt: new Date().toISOString() }); },

  // accumulation targets — one document per coin, so edits on two devices merge
  saveAccumPlan(plan) {
    const next = new Map((plan || []).map((e, i) => [e.sym, { ...e, order: i }]));
    return commit((b, ref) => {
      for (const [sym, e] of next) {
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
        b.set(ref('txs', Core.newId('tx_')), txDoc(c.sym, 'adjust', 0, 0, 'Reset to Oct-15 baseline', { setQty: c.qty, setAvg: c.basePrice, date: now }));
      }
    }, 'Reset portfolio');
  },

  // account
  signIn: () => signIn(), signOut: () => fb && fb.au.signOut(fb.auth),
  user: () => S.user,
  downloadBackup: () => downloadBackup(),
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

function downloadJson(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function stamp() { return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'); }
function downloadBackup() {
  const d = API.getState();
  downloadJson({ app: 'samsam-portfolio', kind: 'cloud-backup', exportedAt: new Date().toISOString(),
    coins: d.coins, transactions: d.transactions, accumPlan: d.accumPlan, perfSnaps: d.perfSnaps, holdingsSnaps: d.holdingsSnaps,
    // legacy-compatible view, so a backup can always be re-imported
    legacy: { coins: d.portfolio.map(c => ({ ...c })), transactions: d.transactions, archivedCoins: d.archivedCoins,
      customCoins: d.customCoins, accumPlan: d.accumPlan, perfSnaps: d.perfSnaps, holdingsSnaps: d.holdingsSnaps } },
  `samsam-backup-${stamp()}.json`);
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
  #samsamSyncPill{position:fixed;right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));z-index:99990;display:flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;font:600 12px/1.2 system-ui,-apple-system,sans-serif;background:var(--bg2,var(--card,#111827));color:var(--fg,#e5e7eb);border:1px solid var(--border,#374151);box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;max-width:calc(100vw - 24px)}
  #samsamSyncPill[data-s=error]{border-color:#ef4444}
  #samsamSyncMenu{position:fixed;right:max(12px,env(safe-area-inset-right));bottom:calc(max(12px,env(safe-area-inset-bottom)) + 44px);z-index:99991;display:none;width:min(300px,calc(100vw - 24px));background:var(--bg2,var(--card,#111827));color:var(--fg,#e5e7eb);border:1px solid var(--border,#374151);border-radius:12px;padding:12px;font:13px/1.45 system-ui,-apple-system,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35)}
  #samsamSyncMenu .row{display:flex;gap:8px;margin-top:10px} #samsamSyncMenu .samsam-btn{flex:1;min-height:38px;padding:8px;font-size:12px}
  #samsamSyncMenu .muted{color:var(--fg2,#9ca3af);font-size:12px} #samsamSyncMenu .err{color:#ef4444;font-size:12px;margin-top:6px;word-break:break-word}
  #samsamSetup{display:none;margin:12px auto;max-width:760px;background:var(--bg2,var(--card,#111827));border:1px solid #2563eb;border-radius:14px;padding:18px;color:var(--fg,#e5e7eb)}
  #samsamSetup h3{margin:0 0 6px;font-size:1.05rem} #samsamSetup p{margin:6px 0;color:var(--fg2,#9ca3af);font-size:.88rem;line-height:1.5}
  #samsamSetup .opts{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px} #samsamSetup .opts .samsam-btn{flex:1 1 200px}
  #samsamSetup .msg{margin-top:10px;font-size:.85rem}
  /* Empty space at the end of every page, so the floating Synced badge never covers the last row */
  body::after{content:"";display:block;height:calc(72px + env(safe-area-inset-bottom,0px))}
  @media print{#samsamSyncPill,#samsamSyncMenu,#samsamGate{display:none!important} body::after{display:none}}`;
  document.head.appendChild(css);
  const gate = document.createElement('div'); gate.id = 'samsamGate';
  gate.innerHTML = `<div class="card"><h2>💼 Samsam Portfolio</h2><div id="samsamGateBody"></div></div>`;
  const pill = document.createElement('button'); pill.id = 'samsamSyncPill'; pill.type = 'button';
  pill.innerHTML = `<span class="ss-live" id="samsamSyncDot" data-state="loading"></span><span id="samsamSyncText">Connecting…</span>`;
  const menu = document.createElement('div'); menu.id = 'samsamSyncMenu';
  pill.addEventListener('click', e => { e.stopPropagation(); menu.style.display = menu.style.display === 'block' ? 'none' : 'block'; renderStatus(); });
  document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.style.display = 'none'; });
  document.body.append(gate, pill, menu);
}

function showGate(kind) {
  const g = document.getElementById('samsamGate'), body = document.getElementById('samsamGateBody');
  if (!g) return;
  if (kind === 'config') body.innerHTML = `<p>Cloud sync isn't configured yet.</p><p>Add your Firebase settings to <code>firebase-config.js</code> and publish again.</p>`;
  else if (kind === 'denied') body.innerHTML = `<p><strong>${S.denied}</strong> isn't allowed to open this portfolio.</p><button class="samsam-btn primary" id="samsamSignInBtn">Sign in with another Google account</button>`;
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
  // Same shared status dot as the Live indicator (samsam-ui.js)
  const dot = document.getElementById('samsamSyncDot');
  if (dot) dot.dataset.state = { synced: 'ok', saving: 'loading', offline: 'idle', error: 'error' }[s] || 'idle';
  if (menu && menu.style.display === 'block') {
    const t = S.lastSyncedAt ? S.lastSyncedAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    menu.innerHTML = `<div><strong>Cloud sync</strong></div>
      <div class="muted">${S.user ? 'Signed in as ' + (S.user.email || '') : 'Not signed in'}</div>
      <div class="muted">Last confirmed by server: ${t}</div>
      <div class="muted">Device: ${deviceId.slice(-6)}</div>
      ${S.lastError ? `<div class="err">⚠️ ${S.lastError.label}: ${S.lastError.message}</div>` : ''}
      ${S.user && allLoaded() ? '<div class="row"><a class="samsam-btn" href="recover.html" style="text-decoration:none">🛟 Recover data</a></div>' : ''}
      <div class="row">${S.user && allLoaded() ? '<button class="samsam-btn" id="samsamBk">⬇ Backup</button>' : ''}
      ${S.user ? '<button class="samsam-btn" id="samsamOut">Sign out</button>' : '<button class="samsam-btn primary" id="samsamIn">Sign in</button>'}</div>
      ${S.lastError ? '<div class="row"><button class="samsam-btn" id="samsamClr">Dismiss error</button><button class="samsam-btn" id="samsamReload">Reload</button></div>' : ''}`;
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    on('samsamBk', downloadBackup); on('samsamOut', () => API.signOut()); on('samsamIn', signIn);
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
    ${hasLocal ? `<p><strong>This device has:</strong> ${L.coins.length} coins, ${L.transactions.length} transactions, ${L.accumPlan.length} accumulation targets, cost basis $${cost.toLocaleString('en-US', { maximumFractionDigits: 2 })}, last saved ${when}.</p>` : '<p>This device has no saved portfolio.</p>'}
    <div class="opts">
      ${hasLocal ? '<button class="samsam-btn primary" id="samsamImpLocal">⬆ Upload this device\'s data</button>' : ''}
      <label class="samsam-btn" style="position:relative">📄 Import a backup file<input type="file" accept="application/json,.json" id="samsamImpFile" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>
      ${S.opts.basePortfolio ? '<button class="samsam-btn" id="samsamImpBase">Start from Oct-15 baseline</button>' : ''}
    </div>
    <p class="muted" style="font-size:.8rem">Before uploading, a backup file of this device's data is downloaded automatically.</p>
    <div class="msg" id="samsamSetupMsg"></div>`;
  el.style.display = 'block';
  const msg = t => { const m = document.getElementById('samsamSetupMsg'); if (m) m.innerHTML = t; };
  const go = async (legacy, source, backupFirst) => {
    el.dataset.busy = '1';
    el.querySelectorAll('button,input').forEach(b => b.disabled = true);
    try {
      if (backupFirst) downloadJson({ app: 'samsam-portfolio', kind: 'device-backup', exportedAt: new Date().toISOString(), legacy }, `samsam-device-backup-${stamp()}.json`);
      msg('Uploading…');
      const r = await runImport(legacy, source);
      msg(`✅ Done — ${r.coins.length} coins and ${r.txs.length} transactions are now in the cloud.` + (r.adjusted.length ? ` (${r.adjusted.length} coin(s) had manual edits; an “Imported” correction keeps their figures exactly as before.)` : ''));
      delete el.dataset.busy;
    } catch (e) { delete el.dataset.busy; msg('⚠️ ' + friendly(e)); el.querySelectorAll('button,input').forEach(b => b.disabled = false); }
  };
  const bl = document.getElementById('samsamImpLocal'); if (bl) bl.onclick = () => go(L, 'device:' + deviceId, true);
  const bb = document.getElementById('samsamImpBase'); if (bb) bb.onclick = () => {
    if (!confirm('Start from the Oct-15 baseline? Use this only if no device has your real data.')) return;
    go({ coins: S.opts.basePortfolio.map(c => ({ ...c, currentPrice: (S.opts.fallbackPrices || {})[c.sym] || c.basePrice })), transactions: [] }, 'baseline', false);
  };
  const bf = document.getElementById('samsamImpFile'); if (bf) bf.onchange = async () => {
    const f = bf.files && bf.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      const legacy = j.legacy || (j.portfolioData ? { ...j.portfolioData, accumPlan: j.accumPlan, perfSnaps: j.perfSnaps } : j);
      if (!legacy || !Array.isArray(legacy.coins)) throw new Error('This file is not a Samsam portfolio backup.');
      if (!confirm(`Import ${legacy.coins.length} coins and ${(legacy.transactions || []).length} transactions from “${f.name}”?`)) return;
      go(legacy, 'file:' + f.name, false);
    } catch (e) { msg('⚠️ ' + friendly(e)); }
  };
}

boot().catch(e => { setError(e, 'Start-up'); });
