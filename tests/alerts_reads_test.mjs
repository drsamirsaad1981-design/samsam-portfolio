// tools/alerts.mjs (the GitHub alerts, ~50 runs a day) against a fake Firestore: the first run reads the portfolio in full and
// keeps a copy in meta/alerts.pf; the next runs only ask "anything new?" (counts + a newer updatedAt) — unless something changed.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0; const check = (n, c, d = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' -> ' + JSON.stringify(d))); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alr-')), out = path.join(tmp, 'out'); fs.mkdirSync(path.join(out, 'm'), { recursive: true }); fs.mkdirSync(path.join(out, 'p'));
fs.writeFileSync(path.join(out, 'm', 'market.json'), JSON.stringify({ top: [{ id: 'bitcoin', sym: 'BTC', price: 70000, ch24: 1, rank: 1 }], global: {} }));
fs.writeFileSync(path.join(out, 'm', 'top500.json'), JSON.stringify({ top: [] }));
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { client_email: 'x@y', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), project_id: 'p', token_uri: 'https://oauth2.googleapis.com/token' };
const db = path.join(tmp, 'db.json'), log = path.join(tmp, 'log.json');
const N = 120;   // transactions
fs.writeFileSync(db, JSON.stringify({ alerts: null, extraTx: 0, coinUpd: '2026-11-01T00:00:00Z' }));
// the fake: global fetch patched before alerts.mjs runs
const pre = path.join(tmp, 'pre.mjs');
fs.writeFileSync(pre, `
import fs from 'node:fs';
const DB = ${JSON.stringify(db)}, LOG = ${JSON.stringify(log)};
const st = () => JSON.parse(fs.readFileSync(DB, 'utf8')), save = s => fs.writeFileSync(DB, JSON.stringify(s));
const reads = n => { let l = []; try { l = JSON.parse(fs.readFileSync(LOG, 'utf8')); } catch (_) {} l.push(n); fs.writeFileSync(LOG, JSON.stringify(l)); };
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const S = v => ({ stringValue: v }), doc = o => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? { doubleValue: v } : S(v)])) });
globalThis.fetch = async (u, init = {}) => {
  u = String(u); const s = st();
  if (u.includes('oauth2')) return J({ access_token: 't' });
  if (u.includes('api.telegram.org')) return J({ ok: true });
  const txs = ${N} + s.extraTx;
  if (u.endsWith('/config/owner')) { reads(1); return J(doc({ uid: 'U' })); }
  if (u.endsWith('/meta/info')) { reads(1); return J(doc({})); }
  if (u.endsWith('/meta/alerts')) {
    if (init.method === 'PATCH') { const f = JSON.parse(init.body).fields; s.alerts = { state: f.state.stringValue, pf: f.pf && f.pf.stringValue }; save(s); return J({}); }
    reads(1); return s.alerts ? J(doc({ state: s.alerts.state, ...(s.alerts.pf ? { pf: s.alerts.pf } : {}) })) : J({}, 404);
  }
  if (u.endsWith(':runAggregationQuery')) { reads(1); const c = JSON.parse(init.body).structuredAggregationQuery.structuredQuery.from[0].collectionId; return J([{ result: { aggregateFields: { n: { integerValue: String(c === 'txs' ? txs : c === 'coins' ? 2 : 1) } } } }]); }
  if (u.endsWith(':runQuery')) { reads(1); const since = JSON.parse(init.body).structuredQuery.where.fieldFilter.value.stringValue; return J(s.coinUpd > since && /coins/.test(init.body) ? [{ document: { name: 'x' } }] : [{ readTime: 'now' }]); }
  if (u.includes('/U/coins?')) { reads(2); return J({ documents: [doc({ sym: 'BTC', cgId: 'bitcoin', updatedAt: s.coinUpd }), doc({ sym: 'SOL', cgId: 'solana', updatedAt: '2026-11-01T00:00:00Z' })] }); }
  if (u.includes('/U/txs?')) { reads(txs); return J({ documents: Array.from({ length: txs }, (_, i) => doc({ sym: 'BTC', type: 'buy', qty: 0.001, price: 60000, date: '2026-10-01T00:00:00Z' })) }); }
  if (u.includes('/U/accum?')) { reads(1); return J({ documents: [doc({ sym: 'BTC', targetQty: 1, updatedAt: '2026-11-01T00:00:00Z' })] }); }
  return J({}, 404);
};`);
const run = () => { fs.writeFileSync(log, '[]'); const r = spawnSync(process.execPath, ['--import', pre, path.join(ROOT, 'tools/alerts.mjs'), out], { env: { ...process.env, TELEGRAM_BOT_TOKEN: '1:x', TELEGRAM_CHAT_ID: '5', FIREBASE_SERVICE_ACCOUNT: JSON.stringify(SA) }, encoding: 'utf8' });
  return { out: r.stdout + r.stderr, reads: JSON.parse(fs.readFileSync(log, 'utf8')).reduce((a, b) => a + b, 0), code: r.status }; };

let r = run();
check('1st run: the portfolio read in full (~125 reads), a copy kept in meta/alerts', r.code === 0 && /read in full/.test(r.out) && r.reads >= N && JSON.parse(fs.readFileSync(db)).alerts.pf, r);
r = run();
check('2nd run: "unchanged — the kept copy used", ≤ 8 reads', r.code === 0 && /unchanged/.test(r.out) && r.reads <= 8, r);
const s = JSON.parse(fs.readFileSync(db)); s.extraTx = 1; fs.writeFileSync(db, JSON.stringify(s));
r = run();
check('a new transaction (the count moved) → read in full again', /read in full/.test(r.out) && r.reads > N, r);
const s2 = JSON.parse(fs.readFileSync(db)); s2.coinUpd = '2026-11-14T10:00:00Z'; fs.writeFileSync(db, JSON.stringify(s2));
r = run();
check('a coin edited in the app (newer updatedAt) → read in full again', /read in full/.test(r.out), r.out);
r = run();
check('…then quiet again', /unchanged/.test(r.out) && r.reads <= 8, r);
console.log(`${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
