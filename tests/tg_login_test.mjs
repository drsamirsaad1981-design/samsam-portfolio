// 📱 the full app inside Telegram: POST /tg/login (tools/worker/login.mjs) — Telegram's signature → a sign-in for the
// linked account only. Run: node tests/tg_login_test.mjs
import crypto from 'node:crypto';
import { tgLogin } from '../tools/worker/login.mjs';

let ok = 0, n = 0; const check = (name, c, d) => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c ? '' : ' -> ' + JSON.stringify(d))); };
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { type: 'service_account', project_id: 'samsam-portfolio', client_email: 'bot@samsam-portfolio.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const kv = new Map([['tg:users', JSON.stringify({ 888: { name: 'Ali', uid: 'uid-ali' }, 777: { name: 'NoLink' }, 666: { name: 'Paused', uid: 'uid-p', paused: true } })]]);
const ENV = { TELEGRAM_BOT_TOKEN: '123:fake', TELEGRAM_CHAT_ID: '555', FIREBASE_UID: 'uid-samir', FIREBASE_SERVICE_ACCOUNT: JSON.stringify(SA),
  RATE: { get: async k => kv.has(k) ? kv.get(k) : null, put: async (k, v) => { kv.set(k, v); } } };
const APPO = 'https://drsamirsaad1981-design.github.io';

// initData signed the way Telegram does: key = HMAC("WebAppData", bot token), hash = HMAC(key, sorted "k=v" lines)
function initData(user, ageSec = 10, token = ENV.TELEGRAM_BOT_TOKEN) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000) - ageSec), query_id: 'AAE', user: JSON.stringify(user) });
  const check = [...p.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => k + '=' + v).join('\n');
  const key = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  p.set('hash', crypto.createHmac('sha256', key).update(check).digest('hex'));
  return p.toString();
}
const call = async (body, origin = APPO, method = 'POST') => {
  const r = await tgLogin(new Request('https://w.example/tg/login', { method, headers: { Origin: origin, 'content-type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }), ENV);
  return { status: r.status, j: method === 'POST' ? await r.json().catch(() => ({})) : null, h: r.headers };
};
const claims = t => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());
const verifies = t => { const [h, p, s] = t.split('.'); return crypto.verify('RSA-SHA256', Buffer.from(h + '.' + p), publicKey, Buffer.from(s, 'base64url')); };

let r = await call({ initData: initData({ id: 555, first_name: 'Samir' }) });
check('Samir (the owner) → a custom token for HIS account, signed with the service account, 1 hour', r.status === 200 && claims(r.j.token).uid === 'uid-samir' && verifies(r.j.token) && claims(r.j.token).exp - claims(r.j.token).iat === 3600 && /identitytoolkit/.test(claims(r.j.token).aud), r);
r = await call({ initData: initData({ id: 888, first_name: 'Ali' }) });
check('a member with a linked portfolio → a token for the account he linked (never Samir\'s)', r.status === 200 && claims(r.j.token).uid === 'uid-ali', r.j);
r = await call({ initData: initData({ id: 777 }) });
check('a member not linked yet → 403 not-linked, no token', r.status === 403 && r.j.error === 'not-linked' && !r.j.token, r);
r = await call({ initData: initData({ id: 666 }) });
check('a paused member → 403 paused', r.status === 403 && r.j.error === 'paused', r);
r = await call({ initData: initData({ id: 31337 }) });
check('a stranger → 403 not-member', r.status === 403 && r.j.error === 'not-member', r);
r = await call({ initData: initData({ id: 555 }, 10, '999:other-bot') });
check('signed by another bot (wrong token) → 401', r.status === 401 && r.j.error === 'signature', r);
const forged = initData({ id: 888 }).replace(encodeURIComponent('"id":888'), encodeURIComponent('"id":555'));
r = await call({ initData: forged });
check('initData changed after signing (888 → 555) → 401, no token', r.status === 401 && !r.j.token, r);
r = await call({ initData: initData({ id: 555 }, 31 * 60) });
check('opened more than 30 minutes ago → 401 expired', r.status === 401 && r.j.error === 'expired', r);
r = await call({ initData: '' });
check('no initData → 401', r.status === 401, r);
r = await call({ initData: initData({ id: 555 }) }, 'https://evil.example');
check('another site → 403 (only the app\'s own origin)', r.status === 403 && !r.j.token, r);
r = await call(null, APPO, 'OPTIONS');
check('CORS pre-flight from the app → 204, allows the app\'s origin', r.status === 204 && r.h.get('Access-Control-Allow-Origin') === APPO);
let last = null; for (let i = 0; i < 21; i++) last = await call({ initData: initData({ id: 888 }) });
check('more than 20 tries an hour for one Telegram user → 429', last.status === 429, last.status);

console.log(`\n${ok}/${n} passed`);
if (ok !== n) process.exit(1);
