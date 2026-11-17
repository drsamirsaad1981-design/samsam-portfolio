// 🔌 live exchange balances (tools/worker/cex.mjs): signatures as Binance / Gate document them, read-only keys only,
// keys kept encrypted, balances added up (spot + funding + earn), members only.
import crypto from 'node:crypto';
import { cexHandler } from '../tools/worker/cex.mjs';
let ok = 0, n = 0;
const check = (name, c, d) => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c ? '' : ' -> ' + JSON.stringify(d))); };
const kv = new Map();
const pk = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const env = { RATE: { get: async k => kv.has(k) ? kv.get(k) : null, put: async (k, v) => { kv.set(k, v); }, delete: async k => { kv.delete(k); } }, FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ private_key: pk }) };
const OWNER = { email: 'owner@x.com', uid: 'U1', owners: ['owner@x.com'] };
const KEYB = 'B'.repeat(60) + 'kb12', SECB = 'S'.repeat(64), KEYG = 'g'.repeat(28) + 'gk34', SECG = 'h'.repeat(64);
let perms = { enableReading: true, enableWithdrawals: false, enableSpotAndMarginTrading: false }, calls = [], badSig = [], status451 = false;
globalThis.fetch = async (url, o = {}) => {
  const u = new URL(url), H = o.headers || {}; calls.push(u.host + u.pathname);
  const J = (j, s = 200) => new Response(JSON.stringify(j), { status: s, headers: { 'content-type': 'application/json' } });
  if (u.host.endsWith('binance.com')) {
    if (status451) return J({ code: 0, msg: 'Service unavailable from a restricted location' }, 451);
    const qs = u.search.slice(1), i = qs.lastIndexOf('&signature='), want = crypto.createHmac('sha256', SECB).update(qs.slice(0, i)).digest('hex');
    if (H['X-MBX-APIKEY'] !== KEYB || qs.slice(i + 11) !== want) { badSig.push(u.pathname); return J({ code: -1022, msg: 'Signature for this request is not valid.' }, 400); }
    if (u.pathname === '/sapi/v1/account/apiRestrictions') return J(perms);
    if (u.pathname === '/api/v3/account') return J({ balances: [{ asset: 'BTC', free: '0.5', locked: '0.1' }, { asset: 'LDBTC', free: '0.2', locked: '0' }, { asset: 'LDO', free: '10', locked: '0' }, { asset: 'SOL', free: '0', locked: '0' }] });
    if (u.pathname === '/sapi/v1/simple-earn/flexible/position') return J({ rows: [{ asset: 'BTC', totalAmount: '0.2' }] });
    if (u.pathname === '/sapi/v1/simple-earn/locked/position') return J({ rows: [{ asset: 'SOL', amount: '3' }] });
    if (u.pathname === '/sapi/v1/asset/get-funding-asset') { check('Binance funding wallet is a POST', o.method === 'POST'); return J([{ asset: 'USDT', free: '100', locked: '0', freeze: '0', withdrawing: '0' }]); }
  }
  if (u.host === 'api.gateio.ws') {
    const path = u.pathname, q = u.search.slice(1), ts = H.Timestamp;
    const want = crypto.createHmac('sha512', SECG).update(['GET', path, q, crypto.createHash('sha512').update('').digest('hex'), ts].join('\n')).digest('hex');
    if (H.KEY !== KEYG || H.SIGN !== want) { badSig.push(path); return J({ label: 'INVALID_SIGNATURE', message: 'Signature mismatch' }, 401); }
    if (path === '/api/v4/spot/accounts') return J([{ currency: 'BTC', available: '0.01', locked: '0' }, { currency: 'kas', available: '500', locked: '25' }]);
    if (path === '/api/v4/earn/uni/lends') return J([{ currency: 'USDT', amount: '50' }]);
  }
  return J({ msg: 'unknown ' + url }, 404);
};

let r = await cexHandler(env, { email: 'stranger@x.com', uid: 'U9', owners: ['owner@x.com'] }, { action: 'status' });
check('a stranger (not owner, not a member) → 403', r.status === 403, r);
r = await cexHandler(env, OWNER, { action: 'set', ex: 'binance', key: 'short', secret: SECB });
check('a key that is not key-shaped → refused before any call', r.status === 400 && !calls.length, r);
perms = { enableReading: true, enableWithdrawals: true, enableSpotAndMarginTrading: true };
r = await cexHandler(env, OWNER, { action: 'set', ex: 'binance', key: KEYB, secret: SECB });
check('Binance key that can trade / withdraw → REFUSED, nothing saved', r.status === 400 && r.error === 'refused-perms' && r.extra.includes('enableWithdrawals') && !kv.has('cex:U1'), r);
perms = { enableReading: true, enableWithdrawals: false, enableSpotAndMarginTrading: false };
r = await cexHandler(env, OWNER, { action: 'set', ex: 'binance', key: KEYB, secret: SECB });
check('read-only Binance key → saved, signatures right (HMAC-SHA256)', r.ok && r.exchanges[0].ex === 'binance' && r.exchanges[0].tail === 'kb12' && r.exchanges[0].readOnly === true && !badSig.length, { r, badSig });
check('…kept ENCRYPTED: neither the key nor the secret appears in storage', kv.has('cex:U1') && !kv.get('cex:U1').includes(KEYB) && !kv.get('cex:U1').includes(SECB) && !kv.get('cex:U1').includes('SSSSSSSS'), kv.get('cex:U1').slice(0, 80));
r = await cexHandler(env, OWNER, { action: 'set', ex: 'gate', key: KEYG, secret: SECG });
check('Gate key → saved (HMAC-SHA512 v4 signature), permissions "not checked" (Gate can\'t tell)', r.ok && r.exchanges.length === 2 && r.exchanges[1].readOnly === null && !badSig.length, { r, badSig });
calls = [];
r = await cexHandler(env, OWNER, { action: 'balances' });
const bn = r.balances.find(x => x.ex === 'binance'), gt = r.balances.find(x => x.ex === 'gate'), A = (b, s) => (b.assets.find(x => x.sym === s) || {});
check('Binance: spot 0.6 BTC + earn 0.2 (LDBTC not counted twice), LDO kept as a coin, SOL locked earn 3, USDT funding 100', A(bn, 'BTC').spot === 0.6 && A(bn, 'BTC').earn === 0.2 && !A(bn, 'LDBTC').sym && A(bn, 'LDO').spot === 10 && A(bn, 'SOL').earn === 3 && A(bn, 'USDT').funding === 100, bn);
check('Gate: spot BTC + KAS (upper-cased, locked included), lent USDT 50', A(gt, 'BTC').spot === 0.01 && A(gt, 'KAS').spot === 525 && A(gt, 'USDT').earn === 50, gt);
const before = calls.length; r = await cexHandler(env, OWNER, { action: 'balances' });
check('asked again at once → from the cache, no new exchange calls', r.cached && calls.length === before, calls.length - before);
status451 = true; kv.delete('cex:U1:bal');
r = await cexHandler(env, OWNER, { action: 'balances' });
check('Binance blocks the server\'s location (451) → "blocked", Gate still works', r.balances.find(x => x.ex === 'binance').error === 'blocked' && r.balances.find(x => x.ex === 'gate').ok, r.balances.map(x => [x.ex, x.ok, x.error]));
status451 = false;
r = await cexHandler(env, OWNER, { action: 'delete', ex: 'binance' });
check('remove Binance → its key is gone, Gate stays', r.exchanges.length === 1 && r.exchanges[0].ex === 'gate' && !JSON.parse(kv.get('cex:U1')).binance, r);
r = await cexHandler(env, OWNER, { action: 'delete', ex: 'gate' });
check('remove the last one → nothing left in storage', !kv.has('cex:U1') && !kv.has('cex:U1:bal'), [...kv.keys()]);
r = await cexHandler(env, OWNER, { action: 'set', ex: 'binance', key: KEYB, secret: 'W'.repeat(64) });
check('wrong secret → "refused", with what Binance said (code -1022, its message) for the screen', r.status === 400 && r.error === 'refused' && /-1022/.test(r.said) && /Signature/.test(r.said) && !r.said.includes('WWWW'), r);
const realFetch = globalThis.fetch; globalThis.fetch = async () => new Response('<html><body><h1>403 ERROR</h1>The request could not be satisfied.</body></html>', { status: 403, headers: { 'content-type': 'text/html' } });
r = await cexHandler(env, OWNER, { action: 'set', ex: 'binance', key: KEYB, secret: SECB });
check('a web page (not JSON) with 403 = Binance blocking the server, not your key → "blocked"', r.error === 'blocked' && /not JSON/.test(r.said), r);
globalThis.fetch = realFetch;
// 🇸🇦 the relay (Google Cloud, Doha): Binance answers it while it refuses the Worker (451)
{
  const inner = globalThis.fetch; let relayCalls = [];
  globalThis.fetch = async (url, o = {}) => {
    if (String(url).startsWith('https://me-central1-samsam-portfolio.cloudfunctions.net/binanceRelay')) {
      const b = JSON.parse(o.body); relayCalls.push(b);
      const was = status451; status451 = false;
      const r = await inner('https://api.binance.com' + b.path + '?' + b.qs, { method: b.method, headers: { 'X-MBX-APIKEY': b.key } });
      status451 = was;
      return new Response(JSON.stringify({ status: r.status, body: await r.text() }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return inner(url, o);
  };
  status451 = true; kv.delete('cex:U1'); kv.delete('cex:U1:bal');
  const T = { ...OWNER, token: 'ID-TOKEN' };
  r = await cexHandler(env, T, { action: 'set', ex: 'binance', key: KEYB, secret: SECB });
  check('Binance blocks the Worker (451) but the relay gets through → connected', r.ok && relayCalls.length >= 1, r);
  const rc = relayCalls[0] || {};
  check('…the relay gets the signed-in token, a fixed path, the SIGNED query and the API key — never the secret', rc.idToken === 'ID-TOKEN' && rc.path === '/sapi/v1/account/apiRestrictions' && /&signature=[0-9a-f]{64}$/.test(rc.qs) && rc.key === KEYB && !JSON.stringify(relayCalls).includes(SECB), rc);
  r = await cexHandler(env, T, { action: 'balances' });
  check('…balances through the relay too (funding = POST)', r.balances[0].ok && relayCalls.some(x => x.path === '/sapi/v1/asset/get-funding-asset' && x.method === 'POST'), r.balances[0]);
  globalThis.fetch = async (url, o) => String(url).includes('cloudfunctions.net') ? new Response('Not Found', { status: 404 }) : inner(url, o);
  status451 = false; kv.delete('cex:U1:bal');
  r = await cexHandler(env, T, { action: 'balances', fresh: true });
  check('no relay deployed (404) → straight to Binance, as before', r.balances[0].ok, r.balances[0]);
  globalThis.fetch = inner; kv.delete('cex:U1'); kv.delete('cex:U1:bal');
}
const src = (await import('node:fs')).readFileSync(new URL('../tools/dist/samsam-worker.js', import.meta.url), 'utf8');
check('the built Worker has the /cex route', /isCex/.test(src) && /cexHandler/.test(src));
console.log(`${ok}/${n} passed`); process.exit(ok === n ? 0 : 1);
