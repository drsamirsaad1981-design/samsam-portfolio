// the Binance relay (tools/binance-relay/functions/index.js): signed-in only, 5 fixed read paths, passes the answer back
import Module from 'node:module';
import path from 'node:path';
let ok = 0, n = 0; const check = (name, c, d) => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c ? '' : ' -> ' + JSON.stringify(d))); };
let handler = null, opts = null;
const orig = Module._load;
Module._load = function (req, ...a) {
  if (req === 'firebase-functions/v2/https') return { onRequest: (o, h) => { opts = o; handler = h; return h; } };
  if (req === 'firebase-admin') return { initializeApp() {}, auth: () => ({ verifyIdToken: async t => { if (t !== 'GOOD') throw new Error('bad'); return { uid: 'U1' }; } }) };
  return orig.call(this, req, ...a);
};
const require = Module.createRequire(import.meta.url);
require(path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'tools/binance-relay/functions/index.js'));   // from the repo, wherever the test is run from
const calls = [];
globalThis.fetch = async (url, o) => { calls.push({ url, o }); return new Response('{"balances":[]}', { status: 200 }); };
const run = async body => { let st = 200, out = null; const res = { status(s) { st = s; return this; }, json(j) { out = j; } }; await handler({ method: 'POST', body }, res); return { st, out }; };
const SIG = 'a'.repeat(64), KEY = 'K'.repeat(64);
check('runs in Doha (me-central1), at most 2 instances, 20 s', opts.region === 'me-central1' && opts.maxInstances === 2 && opts.timeoutSeconds === 20);
let r = await run({ idToken: 'BAD', path: '/api/v3/account', method: 'GET', qs: `timestamp=1&signature=${SIG}`, key: KEY });
check('not signed in → 401, nothing sent to Binance', r.st === 401 && !calls.length, r);
r = await run({ idToken: 'GOOD', path: '/api/v3/order', method: 'POST', qs: `symbol=BTCUSDT&side=BUY&timestamp=1&signature=${SIG}`, key: KEY });
check('an ORDER (trading) path → refused, nothing sent', r.st === 400 && !calls.length, r);
r = await run({ idToken: 'GOOD', path: '/sapi/v1/capital/withdraw/apply', method: 'POST', qs: `coin=BTC&timestamp=1&signature=${SIG}`, key: KEY });
check('a WITHDRAW path → refused, nothing sent', r.st === 400 && !calls.length, r);
r = await run({ idToken: 'GOOD', path: '/api/v3/account', method: 'POST', qs: `timestamp=1&signature=${SIG}`, key: KEY });
check('a read path with the wrong method → refused', r.st === 400 && !calls.length, r);
r = await run({ idToken: 'GOOD', path: '/api/v3/account', method: 'GET', qs: `timestamp=1`, key: KEY });
check('an unsigned query → refused', r.st === 400 && !calls.length, r);
r = await run({ idToken: 'GOOD', path: '/api/v3/account', method: 'GET', qs: `omitZeroBalances=true&recvWindow=10000&timestamp=1&signature=${SIG}`, key: KEY });
check('a signed read → passed to api.binance.com with the API key header, the answer returned', r.st === 200 && r.out.status === 200 && /balances/.test(r.out.body) && calls[0].url === `https://api.binance.com/api/v3/account?omitZeroBalances=true&recvWindow=10000&timestamp=1&signature=${SIG}` && calls[0].o.headers['X-MBX-APIKEY'] === KEY, { r, c: calls[0] });
r = await run({ idToken: 'GOOD', path: '/sapi/v1/asset/get-funding-asset', method: 'POST', qs: `recvWindow=10000&timestamp=1&signature=${SIG}`, key: KEY });
check('the funding wallet (POST) → passed', r.st === 200 && calls[1].o.method === 'POST', r);
console.log(`${ok}/${n} passed`); process.exit(ok === n ? 0 : 1);
