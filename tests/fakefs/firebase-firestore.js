// Test double for the subset of the Firestore web SDK used by samsam-cloud.js.
// Talks to server.mjs. Latency-compensated local writes, offline queue, live listeners.
// Each shell iframe gets its own port so its 15 s long-poll doesn't eat the parent's 6-socket-per-host budget
// (the real SDK's multi-tab manager keeps a single network client; this fake has one per frame).
const FRAME_HOST = (() => { try { if (window.parent === window) return 1; const m = location.pathname.match(/(performance|allocation|accumulation)\.html/); return m ? ({performance:2,allocation:3,accumulation:4})[m[1]] : 5; } catch (_) { return 6; } })();
const SERVER = window.__FAKE_SERVER || `http://127.0.0.1:${8786 + FRAME_HOST}`;
const server = new Map();   // path -> data (confirmed)
let pending = [];           // [{ops, resolve, reject}]
let seq = 0;
const listeners = new Set();
let polling = false;
let connected = false;

function deepMerge(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b)) out[k] = (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') ? deepMerge(out[k], v) : v;
  return out;
}
function applyOps(map, ops) {
  for (const op of ops) {
    if (op.op === 'delete') map.delete(op.path);
    else map.set(op.path, op.merge ? deepMerge(map.get(op.path), op.data) : op.data);
  }
}
function view() { const m = new Map(server); for (const p of pending) applyOps(m, p.ops); return m; }
const pendingPaths = () => new Set(pending.flatMap(p => p.ops.map(o => o.path)));
const offline = () => !!window.__fakeOffline;

function notify() {
  const v = view(), pp = pendingPaths();
  for (const l of listeners) {
    const fromCache = !connected;
    if (l.kind === 'doc') {
      const has = v.has(l.path);
      l.cb({ id: l.path.split('/').pop(), exists: () => has, data: () => has ? JSON.parse(JSON.stringify(v.get(l.path))) : undefined,
        metadata: { fromCache, hasPendingWrites: pp.has(l.path) } });
    } else {
      const docs = [...v.entries()].filter(([p]) => p.startsWith(l.path + '/') && !p.slice(l.path.length + 1).includes('/'))
        .map(([p, d]) => ({ id: p.split('/').pop(), data: () => JSON.parse(JSON.stringify(d)) }))
        .filter(d => !l.min || d.id >= l.min);
      l.cb({ forEach: f => docs.forEach(f), size: docs.length, docs,
        metadata: { fromCache, hasPendingWrites: docs.some(d => pp.has(l.path + '/' + d.id)) } });
    }
  }
}

async function poll() {
  if (polling) return; polling = true;
  while (true) {
    if (offline()) { connected = false; notify(); polling = false; return; }
    try {
      const r = await fetch(`${SERVER}/changes?since=${seq}`);
      const j = await r.json();
      if (offline()) continue;
      for (const d of j.docs) { if (d.path === '__reset__') server.clear(); else if (d.data == null) server.delete(d.path); else server.set(d.path, d.data); }
      seq = j.seq; connected = true; notify();
    } catch (e) { connected = false; notify(); await new Promise(r => setTimeout(r, 500)); }
  }
}
let flushing = false;
async function flush() {
  if (flushing) return; flushing = true;
  while (pending.length && !offline()) {
    const p = pending[0];
    try {
      const r = await fetch(`${SERVER}/commit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops: p.ops, pre: p.pre || [] }) });
      if (!r.ok) { pending.shift(); const e = new Error('commit failed ' + r.status); e.code = r.status === 409 ? 'aborted' : 'internal'; p.reject(e); notify(); continue; }
      applyOps(server, p.ops); pending.shift(); p.resolve(); notify();
    } catch (e) { break; }
  }
  flushing = false;
}
window.__fakeGoOnline = () => { window.__fakeOffline = false; poll(); flush(); };
window.__fakeGoOffline = () => { window.__fakeOffline = true; connected = false; notify(); };

function submit(ops, pre) {
  return new Promise((resolve, reject) => { pending.push({ ops, pre, resolve, reject }); notify(); flush(); });
}

export function initializeFirestore() { poll(); return { fake: true }; }
export function getFirestore() { poll(); return { fake: true }; }
export function persistentLocalCache() { return {}; }
export function persistentMultipleTabManager() { return {}; }
const pathOf = segs => segs.join('/');
export function collection(db, ...segs) { return { type: 'coll', path: pathOf(segs) }; }
export function doc(db, ...segs) { return { type: 'doc', path: pathOf(segs), id: segs[segs.length - 1] }; }
export function documentId() { return '__id__'; }
export function where(f, op, v) { return { f, op, v }; }
export function query(c, w) { return { ...c, min: w && w.op === '>=' ? w.v : null }; }
export function serverTimestamp() { return new Date().toISOString(); }
export async function terminate() { window.__fakeTerminated = true; }
export async function clearIndexedDbPersistence() { window.__fakeCleared = true; }
export function onSnapshot(ref, opt, cb, err) {
  if (typeof opt === 'function') { err = cb; cb = opt; }
  const l = { kind: ref.type, path: ref.path, min: ref.min || null, cb };
  listeners.add(l); setTimeout(notify, 5);
  return () => listeners.delete(l);
}
export function writeBatch() {
  const ops = [];
  return {
    set(ref, data, o) { ops.push({ op: 'set', path: ref.path, data: JSON.parse(JSON.stringify(data)), merge: !!(o && o.merge) }); },
    update(ref, data) { ops.push({ op: 'set', path: ref.path, data, merge: true }); },
    delete(ref) { ops.push({ op: 'delete', path: ref.path }); },
    commit() { return submit(ops); },
  };
}
// the access check (samsam-cloud.js probeAccess): tests can make an account "not invited yet" with window.__FAKE_DENY
export async function getDocFromServer(ref) { if (window.__FAKE_DENY) { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; } const v = view().get(ref.path); return { exists: () => v !== undefined, data: () => v }; }
export function setDoc(ref, data, o) { const b = writeBatch(); b.set(ref, data, o); return b.commit(); }
export async function runTransaction(db, fn) {
  for (let i = 0; i < 5; i++) {
    const reads = [], ops = [];
    const tr = {
      async get(ref) { const r = await fetch(`${SERVER}/get?path=${encodeURIComponent(ref.path)}`); const j = await r.json(); reads.push({ path: ref.path, version: j.version });
        return { exists: () => j.data != null, data: () => j.data }; },
      set(ref, data) { ops.push({ op: 'set', path: ref.path, data }); },
    };
    const out = await fn(tr);
    try { await submit(ops, reads); return out; } catch (e) { if (e.code !== 'aborted') throw e; }
  }
  throw new Error('transaction failed');
}
