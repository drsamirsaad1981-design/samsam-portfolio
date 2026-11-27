// The Telegram bot (tools/worker → tools/dist/samsam-worker.js), tested on the BUILT file — the one you paste into
// Cloudflare. Every network call is faked here: Telegram, GitHub's prices branch, CoinGecko, Google sign-in, Firestore.
// Checks: only Telegram + only your chat get answers; each view's numbers = the app's maths; buttons redraw in place;
// stablecoins never "best"; tickers / names / unknown coins; Arabic + English; text Telegram accepts; the setup link;
// AI Analysis (/analyze) still behaves; and the built file is up to date with its sources.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { summarize, priceSeries, isStable, planName, planAmt, evaluate, perUnit, usd, settings as alertCfg } from '../tools/alerts-core.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' -> ' + JSON.stringify(d).slice(0, 400))); };
const fx = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', f), 'utf8'));

// ── the built file is current ──
const SOURCES = ['tools/ai-worker.js', 'tools/alerts-core.mjs', 'samsam-core.js', 'tools/worker/index.mjs', 'tools/worker/idle.mjs', 'tools/worker/bot.mjs', 'tools/worker/data.mjs', 'tools/worker/cg-ids.json', 'tools/worker/ai.mjs', 'tools/worker/watch.mjs', 'tools/worker/voice.mjs', 'tools/worker/trade.mjs', 'tools/worker/daily.mjs', 'tools/worker/paper.mjs', 'tools/worker/who.mjs', 'tools/worker/byok.mjs', 'tools/worker/cex.mjs', 'tools/worker/bidi.mjs', 'tools/worker/usmarket.mjs', 'tools/worker/stars.mjs', 'tools/worker/admin.mjs', 'guide.json', 'tools/worker/community.mjs', 'tools/worker/xpost.mjs', 'tools/worker/stall.mjs', 'tools/worker/leave.mjs'];
const h = crypto.createHash('sha256'); for (const f of SOURCES) h.update(fs.readFileSync(path.join(ROOT, f)));
const built = fs.readFileSync(path.join(ROOT, 'tools/dist/samsam-worker.js'), 'utf8');
check('the built Worker is up to date with its sources (else: node tools/build-worker.mjs)', built.includes('sources-hash: ' + h.digest('hex').slice(0, 16)));
check('no secret value in the built file', !/sk-ant-|BEGIN PRIVATE KEY|\d{8,}:[A-Za-z0-9_-]{30,}/.test(built));

// ── fake world ──
const NOW = Date.now(), HR = 3600e3;
const market = fx('market_snap_fixture.json'), top500 = fx('top500_fixture.json'), alt = fx('alt_fixture.json'), etf = fx('etf_fixture.json');
// 🌈 the Bitcoin rainbow's small part, as update-market.mjs copies it into the snapshot: three closes in band 2, which holds
{ const C = await import('../samsam-core.js'), F = { a: -16.1839, b: 5.5943, lo: -0.746, hi: 1.216, share: [0.8, 11.8, 33.5, 24.8, 14.5, 9.8, 2.8, 1.7, 0.2] }, today = Math.floor(NOW / 864e5);
  market.rainbow = { v: 1, fit: F, held: { band: 2, since: C.rainbowIso(today - 20) }, closes: [3, 2, 1].map(k => [C.rainbowIso(today - k), C.rainbowLine(F, today - k) * 10 ** (F.lo + 1.5 * (F.hi - F.lo) / 9)]),
    w200: { ma: 48000, day: C.rainbowIso(today - 3), under: { days: 310, pct: 6.8, last: '2023-03-12' } }, pi: { day: C.rainbowIso(today - 1), ratio: 61.37, d111: 70500, d350x2: 114880, peaks: [[2011, 180.2, '2011-06-12'], [2013, 133.4, '2013-12-05'], [2017, 104.1, '2017-12-17'], [2021, 101.9, '2021-04-12'], [2025, 78.4, '2025-01-21']], crosses: ['2013-04-05', '2013-12-03', '2017-12-16', '2021-04-12'] } }; }   // (📏 the 200-week average and the Pi Cycle ride with it)
market.parts = { top: new Date(NOW - 12 * 60e3).toISOString() };
// MVRV, the dollar index, BTC funding — the snapshot's three parts from tools/update-macro.mjs
market.mvrv = { v: 1, day: new Date(NOW - 864e5).toISOString().slice(0, 10), now: 1.139, price: 60415, realized: 53033, wk: 1.16, mo: 1.49, peaks: [[2011, 7.74, '2011-06-04'], [2013, 5.88, '2013-11-18'], [2017, 4.72, '2017-12-07'], [2021, 3.96, '2021-02-21'], [2024, 2.74, '2024-11-21']], lows: [[2022, 0.75, '2022-11-09']], over35: '2021-03-19', under1: '2023-01-12', src: 'Coin Metrics' };
market.dxy = { v: 1, price: 103.872, prev: 103.675, ch24: 0.19, ch7: -0.03, lo52: 96.22, hi52: 104.32, spark: [103.1, 103.5, 103.87], at: new Date(NOW - 15 * 60e3).toISOString(), src: 'Yahoo Finance (DX-Y.NYB)' };
market.funding = { v: 1, rate: 0.0044, m7: 0.0016, oi: 9342100000, n: 5, venues: [['Hyperliquid', 0.01, 2.32e9], ['Bitget', 0.0018, 2.31e9], ['OKX', 0.0003, 1.96e9], ['Gate', 0.0069, 1.95e9], ['Deribit', 0.0003, 0.8021e9]].map(([k, rate, oi]) => ({ k, rate, oi, m7: 0.002 })), missing: ['Binance', 'Bybit'], at: new Date(NOW - 15 * 60e3).toISOString() };
market.stocks = [['NVDAB', 2.1, 'NVIDIA'], ['TSLAB', -3.4, 'Tesla'], ['CRCLB', 7.8, 'Circle'], ['AAPLB', 0.4, 'Apple'], ['GMEB', -6.2, 'GameStop'], ['MSFTB', 1.1, 'Microsoft'], ['METAB', -0.9, 'Meta'], ['AMZNB', 3.3, 'Amazon']].map(([sym, ch24, n], i) => ({ id: sym.toLowerCase() + '-bstock', sym, name: n + ' bStock', price: 100 + i * 10, ch24 }));
market.metals = [['gold', 'oz', 2650, 0.76], ['silver', 'oz', 31.2, -0.5], ['platinum', 'oz', 960, 0.1], ['copper', 'lb', 4.35, 1.2], ['brent', 'bbl', 73.4, -1.4]].map(([k, unit, price, ch24]) => ({ k, unit, price, ch24, ch7: ch24 * 2, spark: [price * 0.98, price] })); market.parts = { ...(market.parts || {}), metals: new Date().toISOString() };
const series = (price, p24, p7) => { const n = 24 * 9, t0 = NOW - (n - 1) * HR; return { t0, step: HR, p: Array.from({ length: n }, (_, i) => i === n - 1 ? price : i >= n - 25 ? p24 : i >= n - 169 ? (p24 + p7) / 2 : p7) }; };
const LIVE = { bitcoin: { usd: 77000, usd_24h_change: 1.25, usd_market_cap: 1.53e12, usd_24h_vol: 4e10 }, solana: { usd: 150, usd_24h_change: 3.5 }, tether: { usd: 1.0002, usd_24h_change: 0.01 }, chainlink: { usd: 11, usd_24h_change: -4.2 }, pendle: { usd: 3.21, usd_24h_change: 7.7, usd_market_cap: 5e8 } };
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { type: 'service_account', project_id: 'samsam-portfolio', client_email: 'bot@samsam-portfolio.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://oauth2.googleapis.com/token' };
const fsv = v => typeof v === 'string' ? { stringValue: v } : typeof v === 'number' ? { doubleValue: v } : typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(fsv) } } : v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fsv(x)])) } } : { nullValue: null };
const doc = o => ({ name: 'x', fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fsv(v)])) });
let LANG = 'ar';   // the alerts are in Arabic — the bot still starts in English
const claudeKeys = []; const premOn = x => !!(x && x.premium && (!x.premUntil || x.premUntil > Date.now())); let AGG_CALLS = 0, LIST_TXS = 0, COIN_UPD = '';
const USER = () => ({
  coins: [{ sym: 'BTC', cgId: 'bitcoin', opening: { qty: 0.1, avg: 70000 }, ...(COIN_UPD ? { updatedAt: COIN_UPD } : {}) }, { sym: 'SOL', cgId: 'solana', opening: { qty: 10, avg: 160 } },
    { sym: 'LINK', cgId: 'chainlink', opening: { qty: 50, avg: 15 } }, { sym: 'USDT', cgId: 'tether', opening: { qty: 900, avg: 0.5 } },
    { sym: 'NOID', name: 'No Id Coin', opening: { qty: 100, avg: 2 } },   // saved without a CoinGecko id, not in the top 500 — like PONS / CYBER
    ...Array.from({ length: MANY }, (_, i) => ({ sym: 'ZZ' + i, cgId: 'zz-coin-' + i, opening: { qty: 1, avg: 1 } })), ...(globalThis.__extraCoins || [])],
  txs: [], accum: [{ sym: 'SOL', targetQty: 20 }, { sym: 'LINK', targetQty: 50 }, { sym: 'PENDLE', targetQty: 100, alertPrice: 3, cgId: 'pendle' }],
  meta: { ...(globalThis.__zakatDay ? { zakatDay: globalThis.__zakatDay } : {}), ...(globalThis.__metaExtra || {}), ...(globalThis.__lastBackupAt === null ? {} : { lastBackupAt: globalThis.__lastBackupAt || new Date().toISOString() }), alerts: { lang: LANG }, baseline: { btcPrice: 70000 }, exitPlan: [{ sym: 'LINK', tps: [{ price: 25, pct: 25, lock: true }, { price: 0, pct: 50, lock: false }, { price: 0, pct: 25, lock: false }] }] },
});
const sent = [], claudeCalls = [], fileGets = [], VOICE_BYTES = new Uint8Array(70000).map((_, i) => (i * 7) % 256); const commits = [], committed = [], composeCalls = []; let COMPOSE_FAIL = false, HOT = false; const kicks = [], pinWrites = [], accessWrites = [], tglinkWrites = []; let TGLINK = null, TGLINK_UID = 'UID2'; let OWNER_PIN = 'UID1', ACCOUNTS = ['UID1']; let FS_WRITE_403 = false, logoFetches = 0, BN403 = false, bnCalls = 0, EXLIVE = {}, tokenCalls = 0, cgDown = false, MANY = 0, outside = 0;
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
// Cloudflare's cache (caches.default), as the Worker sees it: the 🛡 limits (flood, strangers) count there, shared by every Worker copy
const cacheStore = new Map();
globalThis.caches = { default: { match: async r => cacheStore.has(r.url) ? new Response(cacheStore.get(r.url)) : undefined, put: async (r, res) => { cacheStore.set(r.url, await res.text()); } } };
const limitKey = (kind, chat, ms) => 'https://limit.cache/' + encodeURIComponent(`${kind}:${chat}:${Math.floor(Date.now() / ms)}`);
globalThis.fetch = async (input, init = {}) => {
  const u = typeof input === 'string' ? input : input.url, body = init.body;
  if (!u.startsWith('https://api.telegram.org/')) outside++;
  if (u.startsWith('https://api.telegram.org/file/bot123:fake/')) { fileGets.push(u); return new Response(VOICE_BYTES, { status: 200 }); }
  if (u.startsWith('https://api.telegram.org/bot') && u.endsWith('/getFile')) { const b = JSON.parse(body); sent.push({ m: 'getFile', b }); return J({ ok: true, result: { file_id: b.file_id, file_path: 'voice/file_9.oga' } }); }
  if (/^https:\/\/(coin-images|assets)\.coingecko\.com\//.test(u)) { logoFetches++; return /tether|325/.test(u) ? new Response('nf', { status: 404 }) : /notimage/.test(u) ? new Response('<html>', { headers: { 'content-type': 'text/html' } }) : new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'), { headers: { 'content-type': 'image/png' } }); }
  if (/identitytoolkit\.googleapis\.com\/v1\/accounts:signInWithCustomToken/.test(u) && globalThis.__signins) { const tok = JSON.parse(body).token, uid = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString()).uid; return J({ idToken: 'fresh-' + uid }); }
  if (/identitytoolkit\.googleapis\.com\/v1\/accounts:delete/.test(u) && globalThis.__signins) { globalThis.__signins.push(JSON.parse(body).idToken); return J({}); }
  if (u === 'https://api.github.com/repos/drsamirsaad1981-design/samsam-portfolio/actions/workflows/prices.yml/dispatches') { kicks.push({ auth: init.headers.authorization, body: JSON.parse(body) }); return new Response(null, { status: 204 }); }
  if (u.startsWith('https://api.telegram.org/bot') && body instanceof FormData) { const m = u.split('/').pop(); const ph = body.get('photo'); sent.push({ m, b: { chat_id: body.get('chat_id'), caption: body.get('caption'), photoBytes: ph ? new Uint8Array(await ph.arrayBuffer()) : null } }); return J({ ok: true, result: { message_id: 8 } }); }
  if (u.startsWith('https://api.telegram.org/bot')) { const m = u.split('/').pop(); const b = JSON.parse(body); if (typeof b.text === 'string') { try { const lg = kvStore.get(`tg:${b.chat_id}:lang`); if (lg && +b.chat_id > 0) (globalThis.__byLang = globalThis.__byLang || []).push({ lang: lg, chat: b.chat_id, text: b.text, kb: JSON.stringify((b.reply_markup && (b.reply_markup.inline_keyboard || b.reply_markup.keyboard)) || '') }); } catch (_) {} b.raw = b.text; b.text = b.text.replace(/[\u200E\u200F\u2060\u2066\u2069]/g, '').replace(/\u00A0/g, ' '); (globalThis.__all = globalThis.__all || []).push(b.raw); } sent.push({ m, b }); if (m === 'createInvoiceLink') return J({ ok: true, result: 'https://t.me/$inv-' + b.payload }); if (m === 'createChatInviteLink') return J({ ok: true, result: { invite_link: 'https://t.me/+join' + b.chat_id } }); if (m === 'createForumTopic') return J({ ok: true, result: { message_thread_id: 100 + sent.filter(x => x.m === 'createForumTopic').length } }); if (m === 'sendChatAction' && (globalThis.__goneTopics || []).includes(b.message_thread_id)) return J({ ok: false, description: 'Bad Request: message thread not found' }); if (m === 'getChat') return J({ ok: true, result: { id: b.chat_id, is_forum: false, ...(b.chat_id === -1001 && !globalThis.__unlinked ? { linked_chat_id: -1002 } : {}) } }); if (m === 'getMe') return J({ ok: true, result: { id: 1, username: 'samsam_portfolio_bot' } }); if (m === 'getChatMember') return J({ ok: true, result: { status: b.chat_id === -1003 ? 'administrator' : 'left' } }); return J(m === 'editMessageText' && b.text === sent.lastEdit ? { ok: false, description: 'Bad Request: message is not modified' } : { ok: true, result: { message_id: 7 } }); }
  if (u.includes('raw.githubusercontent.com/drsamirsaad1981-design/samsam-portfolio/prices/')) {
    const f = u.split('/prices/')[1];
    if (f === 'm/market.json') return J(market); if (f === 'm/top500.json') return J(top500); if (f === 'm/alt.json') return J(alt); if (f === 'm/etf.json') return J(etf);
    const id = (f.match(/^p\/(.+)\.json$/) || [])[1];
    const P = { bitcoin: [77000, 76000, 72000], solana: [150, 145, 170], chainlink: [11, 11.5, 12], tether: [1, 1, 1], pendle: [3.2, 3, 2.8] }[id];
    return P ? J(series(...P)) : new Response('404', { status: 404 });
  }
  if (u.startsWith('https://api.coingecko.com/api/v3/simple/price')) { if (cgDown) return new Response('busy', { status: 429 }); const ids = decodeURIComponent(new URL(u).searchParams.get('ids')).split(','); return J(Object.fromEntries(ids.filter(i => LIVE[i]).map(i => [i, LIVE[i]]))); }
  if (u.startsWith('https://api.coingecko.com/api/v3/search')) { const q = new URL(u).searchParams.get('query'); return J({ coins: q === 'pendle' ? [{ id: 'pendle', symbol: 'pendle', name: 'Pendle', market_cap_rank: 120 }] : [] }); }
  if (u === 'https://oauth2.googleapis.com/token') {
    tokenCalls++;
    const jwt = new URLSearchParams(body).get('assertion'), [hh, pp, ss] = jwt.split('.');
    const ok = crypto.verify('RSA-SHA256', Buffer.from(hh + '.' + pp), crypto.createPublicKey(privateKey), Buffer.from(ss, 'base64url'));
    const claims = JSON.parse(Buffer.from(pp, 'base64url'));
    return ok && claims.iss === SA.client_email && /datastore/.test(claims.scope) ? J({ access_token: 'tok', expires_in: 3600 }) : J({ error: 'bad' }, 400);
  }
  if (u.startsWith('https://firestore.googleapis.com/')) {
    if ((init.headers || {}).authorization !== 'Bearer tok') return J({}, 403);
    const U = USER();
    if (u.endsWith('/documents/config/access')) { accessWrites.push(JSON.parse(body)); return J({}); }
    if (new RegExp('/users/' + TGLINK_UID + '/meta/tglink$').test(u) && init.method === 'PATCH') { tglinkWrites.push(JSON.parse(body)); TGLINK = null; return J({}); }
    if (/\/meta\/info\?updateMask/.test(u) && init.method === 'PATCH') { (globalThis.__alertsLang = globalThis.__alertsLang || []).push({ u, body: JSON.parse(body) }); return J({}); }   // 🌐 alerts.lang ← the bot's language
    if (u.endsWith('/documents/config/owner')) { if (init.method === 'PATCH') { pinWrites.push(JSON.parse(body)); OWNER_PIN = JSON.parse(body).fields.uid.stringValue; return J({}); } return OWNER_PIN ? J(doc({ uid: OWNER_PIN })) : J({}, 404); }
    if (u.endsWith(':runAggregationQuery')) { AGG_CALLS++; const c = JSON.parse(body).structuredAggregationQuery.structuredQuery.from[0].collectionId, uid = (/\/users\/(\w+):/.exec(u) || [])[1];
      const n = uid === 'UID1' ? (c === 'txs' ? committed.length : c === 'coins' ? U.coins.length : U.accum.length) : (c === 'coins' ? 1 : 0); return J([{ result: { aggregateFields: { n: { integerValue: String(n) } } } }]); }
    if (u.endsWith(':runQuery') && /"updatedAt"/.test(body)) { const since = JSON.parse(body).structuredQuery.where.fieldFilter.value.stringValue, c = JSON.parse(body).structuredQuery.from[0].collectionId, uid = (/\/users\/(\w+):/.exec(u) || [])[1];
      const rows = uid === 'UID1' ? (c === 'coins' ? U.coins : U.accum) : []; return J(rows.filter(r => typeof r.updatedAt === 'string' && r.updatedAt > since).slice(0, 1).map(r => ({ document: { name: 'x', fields: doc(r).fields } })).concat([{ readTime: 'now' }])); }
    if (u.endsWith(':runQuery') && /"limit":1000/.test(body)) return J([...ACCOUNTS.map(a => ({ document: { name: 'projects/p/databases/(default)/documents/users/' + a + '/meta/info', fields: {} } })), ...(TGLINK ? [{ document: { name: 'projects/p/databases/(default)/documents/users/' + TGLINK_UID + '/meta/tglink', fields: doc(TGLINK).fields } }] : [])]);
    if (/\/users\/UID2\/(coins|txs|accum)\?/.test(u)) return J({ documents: /coins/.test(u) ? [doc({ sym: 'ETH', cgId: 'ethereum', opening: { qty: 2, avg: 2500 } })] : [] });
    if (u.endsWith('/users/UID2/meta/info')) return J(doc({}));
    if (u.endsWith(':runQuery')) return J(ACCOUNTS.map(a => ({ document: { name: 'projects/p/databases/(default)/documents/users/' + a + '/meta/info' } })));
    if (u.includes('/users/UID1/coins?')) return J({ documents: U.coins.map(doc) });
    if (u.includes('/users/UID1/txs?')) LIST_TXS++;
    if (u.includes('/users/UID1/txs?')) return J({ documents: committed.map(w => ({ name: w.update.name, fields: w.update.fields })) });
    if (u.endsWith('/documents:commit')) { if (FS_WRITE_403) return J({ error: { code: 403, message: 'Missing or insufficient permissions.' } }, 403); const b = JSON.parse(body); commits.push(b); committed.push(...b.writes); return J({ writeResults: b.writes.map(() => ({ updateTime: new Date().toISOString() })), commitTime: new Date().toISOString() }); }
    if (u.includes('/users/UID1/accum?')) return J({ documents: U.accum.map(doc) });
    if (u.endsWith('/users/UID1/meta/info')) return J(doc(globalThis.__metaOver || U.meta));
    return J({}, 404);
  }
  if (u.startsWith('https://www.googleapis.com/service_accounts')) return J({ keys: [{ ...crypto.createPublicKey(privateKey).export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }] });
  if (u.startsWith('https://api.anthropic.com/v1/models')) { const k = (init.headers || {})['x-api-key'] || ''; return J({ data: [] }, /^sk-ant-good/.test(k) ? 200 : 401); }
  if (u === 'https://api.anthropic.com/v1/messages') {
    const b = JSON.parse(body); claudeCalls.push(b); claudeKeys.push(init.headers['x-api-key']);
    if (/^sk-ant-dead/.test(init.headers['x-api-key'])) return J({ type: 'error', error: { type: 'authentication_error' } }, 401);
    if (/SMART (MORNING|EVENING)/.test(b.system || '')) { composeCalls.push(b); if (COMPOSE_FAIL) return J({ type: 'error', error: { type: 'overloaded_error' } }, 529); if (globalThis.__shortMorning) return J({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '🩸 **the market is red, stay calm and don’t half' }] }); const f = JSON.parse(b.messages[0].content.replace(/^FACTS:\n/, '')); return J({ stop_reason: 'end_turn', content: [{ type: 'text', text: /MORNING/.test(b.system) ? `☀️ **Calm day**\n🎯 **Today**\n1. ${(f.todo[0] || {}).what || 'hold'}` : `🌙 **Quiet day**\n• since morning: **${f.since_morning ? f.since_morning.portfolio_change_usd : 'n/a'}**` }] }); }
    if (init.headers['x-api-key'] !== 'sk-test' && !/^sk-ant-good/.test(init.headers['x-api-key'])) return J({ type: 'error', error: { type: 'authentication_error' } }, 401);
    if (b.model === 'bad-model') return J({ type: 'error', error: { type: 'not_found_error', message: 'model: bad-model' } }, 404);
    const msgs = b.messages, lastM = msgs[msgs.length - 1];
    if (msgs.some(m => Array.isArray(m.content) && m.content.some(c => c.type === 'tool_use')) && !b.tools) return J({ type: 'error', error: { type: 'invalid_request_error', message: 'Requests which include `tool_use` or `tool_result` blocks must define tools.' } }, 400);   // the real API's rule
    if (msgs.some(m => typeof m.content === 'string' && /keep looking/i.test(m.content)) && msgs.length > 1) {   // a model that never stops calling tools
      if (b.tool_choice && b.tool_choice.type === 'none') return J({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Final answer after many rounds.' }] });
      return J({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tl' + msgs.length, name: 'get_coin', input: { coin: 'btc' } }] });
    }
    if (Array.isArray(lastM.content) && lastM.content[0].type === 'tool_result') {   // after the tools: answer from their results
      const res = lastM.content.map(r => JSON.parse(r.content));
      const coin = res.find(r => r.ticker);
      if (coin) return J({ stop_reason: 'end_turn', content: [{ type: 'text', text: `**${coin.ticker}** is $${coin.price_usd} (${coin.change_24h_pct}% 24h).\n- You hold ${coin.you_hold && coin.you_hold.amount} — ${coin.you_hold && coin.you_hold.signal}\n<script>x</script> & done` }] });
      const tools = res.map(r => Object.keys(r).sort().join(',')).join(' | ');
      return J({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Tools gave: ' + tools }] });
    }
    const q = String(lastM.content);
    if (/keep looking/i.test(q)) return J({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tl0', name: 'get_coin', input: { coin: 'btc' } }] });
    if (/price of sol/i.test(q)) return J({ stop_reason: 'tool_use', content: [{ type: 'text', text: 'Let me check.' }, { type: 'tool_use', id: 'tu1', name: 'get_coin', input: { coin: 'sol' } }] });
    if (/alert me gold/i.test(q)) return J({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tg1', name: 'set_alert', input: { coin: 'الذهب', kind: 'price_above', value: 2700 } }, { type: 'tool_use', id: 'tg2', name: 'set_alert', input: { coin: 'Tesla', kind: 'change_24h_below', value: -5 } }, { type: 'tool_use', id: 'tg3', name: 'set_alert', input: { coin: 'بلاتين', kind: 'price_below', value: 950 } }, { type: 'tool_use', id: 'tg4', name: 'set_alert', input: { coin: 'gold', kind: 'funding_below', value: 0 } }, { type: 'tool_use', id: 'tg5', name: 'set_alert', input: { coin: 'oil', kind: 'price_below', value: 70 } }] });
    if (/alert me sol/i.test(q)) return J({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'ta1', name: 'set_alert', input: { coin: 'sol', kind: 'price_below', value: 140, note: 'buy zone' } }, { type: 'tool_use', id: 'ta2', name: 'set_alert', input: { coin: 'sol', kind: 'price_above', value: 100 } }, { type: 'tool_use', id: 'ta3', name: 'set_alert', input: { kind: 'portfolio_above', value: 1e9 } }, { type: 'tool_use', id: 'ta4', name: 'set_alert', input: { coin: 'sol', kind: 'nonsense', value: 1 } }] });
    if (/i bought 5 sol/i.test(q)) return J({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tr1', name: 'record_trade', input: { side: 'buy', coin: 'sol', amount: 5, price_usd: 140, paid_with: 'USDT' } }] });
    if (/i sold 20 link/i.test(q)) return J({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tr2', name: 'record_trade', input: { side: 'sell', coin: 'link', amount: 20, price_usd: 18, fee_usd: 1, date: '2026-11-10' } }] });
    if (/i sold 999 sol/i.test(q)) return J({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tr3', name: 'record_trade', input: { side: 'sell', coin: 'sol', amount: 999, price_usd: 150 } }, { type: 'tool_use', id: 'tr4', name: 'record_trade', input: { side: 'buy', coin: 'doge', amount: 10, price_usd: 0.2 } }, { type: 'tool_use', id: 'tr5', name: 'record_trade', input: { side: 'buy', coin: 'sol', amount: 1 } }, { type: 'tool_use', id: 'tr6', name: 'record_trade', input: { side: 'buy', coin: 'sol', amount: 1, price_usd: 15000 } }, { type: 'tool_use', id: 'tr7', name: 'record_trade', input: { side: 'buy', coin: 'sol', amount: 1, price_usd: 150, date: '2030-01-01' } }] });
    if (/two buys/i.test(q)) return J({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tr8', name: 'record_trade', input: { side: 'buy', coin: 'btc', total_usd: 770, at_market: true } }, { type: 'tool_use', id: 'tr9', name: 'record_trade', input: { side: 'buy', coin: 'link', amount: 10, total_usd: 120 } }] });
    if (/paper buy btc/i.test(q)) return J({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'pa1', name: 'paper_trade', input: { side: 'buy', coin: 'btc', usd: 1000 } }] });
    if (/paper sell half/i.test(q)) return J({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'pa2', name: 'paper_trade', input: { side: 'sell', coin: 'btc', fraction: 0.5 } }, { type: 'tool_use', id: 'pa3', name: 'get_paper', input: {} }] });
    if (/paper too much/i.test(q)) return J({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'pa4', name: 'paper_trade', input: { side: 'buy', coin: 'sol', usd: 1e7 } }, { type: 'tool_use', id: 'pa5', name: 'paper_trade', input: { side: 'sell', coin: 'link', amount: 1 } }, { type: 'tool_use', id: 'pa6', name: 'paper_trade', input: { side: 'buy', coin: 'usdt', usd: 10 } }] });
    if (/what if/i.test(q)) return J({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tw1', name: 'what_if', input: { prices: { BTC: 100000 } } }, { type: 'tool_use', id: 'tw2', name: 'what_if', input: { moves_pct: { SOL: -20 }, sell: [{ coin: 'sol', fraction: 0.5 }], buy: [{ coin: 'link', usd: 110 }] } }, { type: 'tool_use', id: 'tw3', name: 'what_if', input: { prices: { LINK: 26 } } }] });
    if (/futures of sol/i.test(q)) return J({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'td1', name: 'get_derivatives', input: { coin: 'sol' } }, { type: 'tool_use', id: 'td2', name: 'get_derivatives', input: { coin: 'zzqq' } }] });
    if (/liq of sol/i.test(q)) return J({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tq1', name: 'get_coin', input: { coin: 'sol' } }, { type: 'tool_use', id: 'tq2', name: 'get_history', input: { coin: 'sol', days: 3 } }, { type: 'tool_use', id: 'tq3', name: 'get_derivatives', input: { coin: 'sol' } }, { type: 'tool_use', id: 'tq4', name: 'get_portfolio', input: {} }] });
    if (/everything/i.test(q)) return J({ stop_reason: 'tool_use', content: ['get_portfolio', 'get_market', 'get_plan', 'get_exit'].map((name, i) => ({ type: 'tool_use', id: 'tu' + i, name, input: name === 'get_market' ? { top: 200 } : {} })).concat([{ type: 'tool_use', id: 'tuh', name: 'get_history', input: { coin: 'sol', days: 7 } }]) });
    return J({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'A general answer about ' + q.slice(0, 30) }] });
  }
  if (u.startsWith('https://data-api.binance.vision/api/v3/ticker/24hr') && BN403) { bnCalls++; return new Response('{"code":0,"msg":"Service unavailable from a restricted location"}', { status: 403 }); }
  if (u.startsWith('https://www.okx.com/api/v5/market/ticker?instId=SOL-USDT') && BN403) return J({ code: '0', data: [{ last: '96.1', open24h: '94' }] });
  if (u.startsWith('https://data-api.binance.vision/api/v3/ticker/24hr')) { const sy = new URL(u).searchParams.get('symbol'); if (EXLIVE[sy]) return J({ symbol: sy, lastPrice: String(EXLIVE[sy][0]), priceChangePercent: String(EXLIVE[sy][1]) }); return sy === 'NOIDUSDT' ? J({ symbol: sy, lastPrice: '2.50000000', priceChangePercent: '4.20' }) : J({ code: -1121, msg: 'Invalid symbol.' }, 400); }
  // futures data for SOL (OKX, Binance, Hyperliquid); anything else → not found
  if (u.startsWith('https://www.okx.com/api/v5/public/funding-rate?instId=SOL-USDT-SWAP')) return J({ code: '0', data: [{ fundingRate: HOT ? '0.0015' : '0.0001', nextFundingTime: String(NOW + 3 * HR) }] });
  if (u.startsWith('https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=SOL-USDT-SWAP')) return J({ code: '0', data: [{ oiUsd: '500000000' }] });
  if (u.startsWith('https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume?ccy=SOL')) return J({ code: '0', data: Array.from({ length: 30 }, (_, i) => [String(NOW - i * HR), String(500e6 / (1 + i * 0.004)), '1']) });
  if (u.startsWith('https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=SOL')) return J({ code: '0', data: [[String(NOW), '2.5'], [String(NOW - HR), '2.4']] });
  if (u.startsWith('https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&uly=SOL-USDT')) return J({ code: '0', data: [{ details: [{ side: 'sell', posSide: 'long', sz: '100', bkPx: '150', ts: String(NOW - HR) }, { side: 'buy', posSide: 'short', sz: '20', bkPx: '160', ts: String(NOW - 2 * HR) }, { side: 'sell', posSide: 'long', sz: '999', bkPx: '150', ts: String(NOW - 30 * HR) }] }] });
  if (u.startsWith('https://www.okx.com/api/v5/public/instruments?instType=SWAP&instId=SOL-USDT-SWAP')) return J({ code: '0', data: [{ ctVal: '1' }] });
  if (u.startsWith('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=SOLUSDT')) return J({ symbol: 'SOLUSDT', lastFundingRate: '0.0003', markPrice: '150' });
  if (u.startsWith('https://fapi.binance.com/fapi/v1/openInterest?symbol=SOLUSDT')) return J({ openInterest: '4000000' });
  if (u.startsWith('https://fapi.binance.com/futures/data/openInterestHist?symbol=SOLUSDT')) return J(Array.from({ length: 25 }, (_, i) => ({ sumOpenInterestValue: String(550e6 + i * 2e6) })));
  if (u.startsWith('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=SOLUSDT')) return J([{ longShortRatio: '2.2', longAccount: '0.6875' }]);
  if (u.startsWith('https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=SOLUSDT')) return J([{ longShortRatio: '1.4' }]);
  if (u.startsWith('https://fapi.binance.com/')) return J({ code: -1121, msg: 'Invalid symbol.' }, 400);
  if (u === 'https://api.hyperliquid.xyz/info') return J([{ universe: [{ name: 'BTC' }, { name: 'SOL' }] }, [{ funding: '0.0000125', openInterest: '1000', markPx: '77000' }, { funding: '0.0000125', openInterest: '2000000', markPx: '150', dayNtlVlm: '90000000' }]]);
  if (u.startsWith('https://www.okx.com/') || u.startsWith('https://api.gateio.ws/') || u.startsWith('https://api.mexc.com/')) return J({ code: '51001', data: [] }, 400);
  throw new Error('unexpected fetch ' + u);
};

const W = (await import('../tools/dist/samsam-worker.js')).default;
const ENV = { ANTHROPIC_API_KEY: 'sk-test', TELEGRAM_BOT_TOKEN: '123:fake', TELEGRAM_CHAT_ID: '555', TG_SECRET: 'test_secret_0123456789', FIREBASE_SERVICE_ACCOUNT: JSON.stringify(SA) };
const HOST = 'https://samsam-analysis.example.workers.dev';
let LIMITS = false;   // the 🛡 limits (flood / strangers) count only in the tests made for them — the rest send many messages fast
const post = (upd, secret = ENV.TG_SECRET, env = ENV) => (LIMITS || [...cacheStore.keys()].forEach(k => { if (k.startsWith('https://limit.cache/')) cacheStore.delete(k); }), W.fetch(new Request(HOST + '/tg', { method: 'POST', headers: { 'content-type': 'application/json', ...(secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {}) }, body: JSON.stringify(upd) }), env, {}));
let UPD = 100;
const say = (text, chat = 555) => post({ update_id: ++UPD, message: { message_id: 1, chat: { id: chat, type: 'private' }, from: { id: chat }, text } });
const tap = data => post({ update_id: ++UPD, callback_query: { id: 'q1', data, from: { id: 555 }, message: { message_id: 42, chat: { id: 555 } } } });
const out = () => sent.filter(x => x.m === 'sendMessage' || x.m === 'editMessageText');
const last = () => out().slice(-1)[0];
const okHtml = t => { const tags = [...t.matchAll(/<\/?([a-z]+)[^>]*>/g)].map(m => m[1]); const stray = t.replace(/<\/?(b|i|code)>|<a href="https:\/\/[^"<>]+">|<\/a>/g, '').match(/[<>]|&(?!amp;|lt;|gt;)/); return tags.every(x => ['b', 'i', 'code', 'a'].includes(x)) && !stray; };   // (<a href="https://…">: the channel's links)
const btnTexts = v => (v.b.reply_markup && v.b.reply_markup.inline_keyboard || []).flat().map(b => b.text);
const btns = v => (v.b.reply_markup && v.b.reply_markup.inline_keyboard || []).flat();

// ── who gets an answer ──
let r = await say('/portfolio');
check('Telegram answered 200', r.status === 200);
check('your chat → an answer', sent.length > 0);
sent.length = 0; r = await post({ message: { chat: { id: 999 }, text: '/portfolio' } });
check('another chat → ignored, nothing sent', r.status === 200 && sent.length === 0);
sent.length = 0; r = await post({ message: { chat: { id: 555 }, text: '/portfolio' } }, 'wrong');
check('wrong webhook secret → 403, nothing sent', r.status === 403 && sent.length === 0);
r = await post({ message: { chat: { id: 555 }, text: '/portfolio' } }, null);
check('no webhook secret → 403', r.status === 403 && sent.length === 0);
r = await post({ message: { chat: { id: 555 }, text: '/portfolio' } }, ENV.TG_SECRET, { ...ENV, TG_SECRET: '' });
check('Worker without TG_SECRET → refuses everything', r.status === 403 && sent.length === 0);
r = await W.fetch(new Request(HOST + '/tg'), ENV, {});
check('GET /tg → 404', r.status === 404);

// ── portfolio = the app's maths ──
sent.length = 0; await say('/portfolio');
let v = last(); const pf = v.b.text;
const m = { top: market.top.map(x => ({ ...x })), top500: top500.top.map(x => ({ ...x })), global: market.global, fng: market.fng, alt: market.alt, altPage: alt, etf, cgIds: {},
  series: Object.fromEntries(['bitcoin', 'solana', 'chainlink', 'tether', 'pendle'].map(id => [id, priceSeries(JSON.parse(JSON.stringify(series(...{ bitcoin: [77000, 76000, 72000], solana: [150, 145, 170], chainlink: [11, 11.5, 12], tether: [1, 1, 1], pendle: [3.2, 3, 2.8] }[id]))))])) };
for (const r0 of [...m.top, ...m.top500]) if (LIVE[r0.id]) { r0.price = LIVE[r0.id].usd; r0.ch24 = LIVE[r0.id].usd_24h_change; }
m.top500.push({ id: 'x-noid', sym: 'NOID', name: 'NOID', price: 2.5, ch24: 4.2 });   // what the exchanges give the bot
const sum = summarize({ ...USER(), coins: USER().coins.map(c => c.sym === 'NOID' ? { ...c, cgId: 'x-noid' } : c) }, m, NOW);
const fmt2 = x => '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
check(`portfolio value = the app's (${fmt2(sum.value)})`, pf.includes(fmt2(sum.value)), pf.slice(0, 300));
check('portfolio uses live prices (BTC 0.1 × $77,000 inside the total)', sum.value > 7700 && pf.includes('💼'));
check('portfolio: Telegram-safe HTML', okHtml(pf), pf);
check('portfolio buttons: Refresh · Best & worst · Plan · Exit plan · Signals · Open the app · Menu', JSON.stringify(btnTexts(v)) === JSON.stringify(['🔄 Refresh', '🏆 Best & worst', '📋 Plan', '🚪 Exit plan', '🎯 Signals', '📱 Open the app', '⬅️ Menu']), btnTexts(v));
const plain = x => x.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
const longest = Math.max(...plain(pf).split('\n').map(l => [...l].length));
check(`portfolio: every line fits a phone (longest ${longest} ≤ 40 characters)`, longest <= 40, plain(pf).split('\n').filter(l => [...l].length > 40));
check('portfolio: the exit line — two counts, never one (market structure 0/3 · Bitcoin valuation 0/3) · next TP LINK +127%', /🚪 Exit 0\/3 · 0\/3 · next TP LINK \+127%/.test(pf), pf.slice(-200));
check('portfolio: best / worst today up to 5 each, no stablecoin', !/USDT\s/.test(pf.split('🌍')[0]) && (pf.match(/📈 <b>Best today<\/b>\n((?:<code>.*\n?)+)/) || ['', ''])[1].trim().split('\n').length <= 5, pf);
check('"Open the app" opens the full app inside Telegram (a Mini App button → the site)', (btns(v).find(b => b.text === '📱 Open the app').web_app || {}).url === 'https://drsamirsaad1981-design.github.io/samsam-portfolio/index.html');
check('one Google sign-in for several questions (token cached)', tokenCalls === 1, tokenCalls);

// ── buttons redraw the same message ──
sent.length = 0; await tap('mv');
v = last();
check('tap Best & worst → the same message is edited (no new message)', v.m === 'editMessageText' && v.b.message_id === 42 && sent.some(x => x.m === 'answerCallbackQuery'));
check('…and the button answers AFTER the edit with "✅ Updated hh:mm:ss" (one tap is enough)', sent.findIndex(x => x.m === 'answerCallbackQuery') > sent.findIndex(x => x.m === 'editMessageText') && /^✅ Updated \d\d:\d\d:\d\d$/.test(sent.find(x => x.m === 'answerCallbackQuery').b.text), sent.map(x => x.m));
check('best & worst: never a stablecoin (USDT bought at $0.50 is +100%)', !/USDT/.test(v.b.text) && /SOL|LINK/.test(v.b.text) && /stablecoins left out/.test(v.b.text), v.b.text);
check('best & worst: Telegram-safe', okHtml(v.b.text), v.b.text);
sent.length = 0; await tap('pf');
check('tap Refresh on the portfolio → edited in place', last().m === 'editMessageText' && last().b.text.includes(fmt2(sum.value)));

// ── a coin ──
sent.length = 0; await say('sol');
v = last();
check('"sol" → Solana card with the live price', /Solana/.test(v.b.text) && v.b.text.includes('$150.00'), v.b.text);
check('coin card: your holding, average, change vs average, signal', /You hold <b>10 SOL<\/b> = \$1,500\.00/.test(v.b.text) && /avg \$160\.00/.test(v.b.text) && /−6\.3%/.test(v.b.text) && /Signal: /.test(v.b.text), v.b.text);
check('coin card: a 7-day line (block characters)', /<code>[▁▂▃▄▅▆▇█]{16}<\/code>/.test(v.b.text), v.b.text);
check('coin card: "live" when CoinGecko answered', /CoinGecko · live/.test(v.b.text));
check('coin buttons: Refresh (by id) · Liq Map · Chart · In the app', btns(v)[0].callback_data === 'c:solana' && btns(v).find(b => b.text === '🔥 Liq Map').url.endsWith('coin=SOL') && btns(v).some(b => b.text === '💼 In the app' && b.url.endsWith('#holdings/SOL')), btns(v));
check('coin card: Telegram-safe', okHtml(v.b.text), v.b.text);
sent.length = 0; await tap('c:solana');
check('tap Refresh on a coin → edited in place, same coin', last().m === 'editMessageText' && /Solana/.test(last().b.text));
sent.length = 0; await say('btc eth');
check('"btc eth" → two cards', out().length === 2 && /Bitcoin/.test(out()[0].b.text) && /Ethereum/.test(out()[1].b.text), out().map(x => x.b.text.slice(0, 40)));
sent.length = 0; await say('/price pendle');
v = last();
check('a coin you don\'t hold (pendle) → its card, "You don\'t hold it", no "In the app"', /Pendle/.test(v.b.text) && /don't hold/.test(v.b.text) && !btnTexts(v).includes('💼 In the app'), v.b.text);
sent.length = 0; await say('zzqqxx');
check('a word that is no coin → a question for Claude (not "couldn\'t find"), no crash', /A general answer about zzqqxx/.test(last().b.text) && okHtml(last().b.text), last().b.text);
sent.length = 0; await say('/price zzqqxx');
check('/price of an unknown coin → "couldn\'t find"', /couldn't find/.test(last().b.text), last().b.text);
cgDown = true; sent.length = 0; await say('link');
check('CoinGecko busy → the snapshot, with its age', /snapshot \d+ min old/.test(last().b.text) || /CoinGecko · live/.test(last().b.text), last().b.text.slice(-80));
cgDown = false;

// ── a coin saved without a CoinGecko id, not in the top 500, CoinGecko quiet → priced by the exchanges ──
sent.length = 0; await say('noid');
v = last();
check('a coin with no CoinGecko id → its live price from Binance ($2.50, +4.2%), "Binance · live"', /\$2\.50/.test(v.b.text) && /\+4\.2% 24h/.test(v.b.text) && /Binance · live/.test(v.b.text), v.b.text);
check('…and your holding of it at that price (100 × $2.50 = $250.00, +25.0% vs avg $2)', /You hold <b>100 NOID<\/b> = \$250\.00/.test(v.b.text) && /\+25\.0%/.test(v.b.text), v.b.text);
check('…its Refresh button works (by ticker) and the chart opens TradingView', btns(v)[0].callback_data === 'c:x-noid' && btns(v).some(b => /tradingview\.com\/symbols\/NOIDUSDT/.test(b.url || '')), btns(v));
sent.length = 0; await tap('c:x-noid');
check('tap Refresh on it → the same card, edited', last().m === 'editMessageText' && /\$2\.50/.test(last().b.text), last().b.text.slice(0, 80));
sent.length = 0; await say('/portfolio');
check('the portfolio counts it at the exchange price (value includes 100 × $2.50)', last().b.text.includes(fmt2(sum.value)) && sum.coins.find(c => c.sym === 'NOID').value === 250, [fmt2(sum.value), last().b.text.slice(0, 120)]);

// ── outside calls stay within Cloudflare's 50 even with 60 coins (none in the top 500) ──
MANY = 60; outside = 0;
await W.fetch(new Request(HOST + '/tg/setup?key=nope'), ENV, {});   // (nothing)
const D2 = await import('../tools/dist/samsam-worker.js?many');   // a fresh Worker instance → nothing cached
const post2 = upd => D2.default.fetch(new Request(HOST + '/tg', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': ENV.TG_SECRET }, body: JSON.stringify(upd) }), ENV, {});
sent.length = 0; outside = 0;
await post2({ message: { chat: { id: 555 }, text: '/portfolio' } });
check(`60 coins, nothing cached: ${outside} outside calls for one answer (≤ 42; Cloudflare allows 50 with Telegram's)`, outside <= 42 && /Your portfolio now|محفظتك الآن/.test(last().b.text), outside);
claudeCalls.length = 0; outside = 0;
await post2({ update_id: 900001, message: { chat: { id: 555 }, text: 'the futures of SOL?' } });
const dv2 = claudeCalls[1] && claudeCalls[1].messages.at(-1).content.map(r => JSON.parse(r.content));
check(`60 coins, a fresh Worker: the futures question still gets its data (${outside} outside calls)`, dv2 && dv2[0].summary && dv2[0].sources.length === 3, dv2 && dv2[0]);
const D3 = await import('../tools/dist/samsam-worker.js?liq');   // another fresh Worker: nothing cached at all
MANY = 60; claudeCalls.length = 0; outside = 0;
await D3.default.fetch(new Request(HOST + '/tg', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': ENV.TG_SECRET }, body: JSON.stringify({ update_id: 900002, message: { chat: { id: 555 }, text: 'Liq of SOL in 24 hours' } }) }), ENV, {});
const lq = claudeCalls[1] && claudeCalls[1].messages.at(-1).content.map(r => JSON.parse(r.content));
check(`the real case: 60 coins, cold start, coin + history + futures + portfolio at once → all four arrive, futures included (${outside} outside calls)`, lq && lq[0].ticker && lq[1].change_pct != null && lq[2].summary && lq[2].summary.liquidations_24h && lq[3].total_value_usd > 0 && outside + 4 <= 50, lq && lq.map(x => x.error || Object.keys(x).slice(0, 3)));
MANY = 0;
MANY = 0;

// ── market, plan, signals, menu ──
sent.length = 0; await say('/market');
v = last();
const cryptoPart = x => x.split('🏦')[0];
check('market: BTC, dominance, Fear & Greed, Top 100 by default', /BTC/.test(v.b.text) && /Fear/.test(v.b.text) && /Top 100 · best 24h/.test(v.b.text), v.b.text.slice(0, 300));
check('market: 🌈 the Bitcoin rainbow line — the band that holds, its name, the percent against the trend line', /\n🌈 Bitcoin rainbow  <b>band 2 of 9<\/b>\nDeep discount · −\d+% vs the line\n/.test(v.b.text), v.b.text.slice(0, 500));
check('market: 💵 the dollar index and ⚖️ BTC funding — five venues weighted by open interest, said to be WITHOUT Binance and Bybit', /\n💵 Dollar index  <b>103\.87<\/b> 🟢 \+0\.19%\n⚖️ BTC funding <b>\+0\.0044%<\/b> · calm\n<i>per 8 h · 5 venues · no Binance, Bybit<\/i>/.test(v.b.text), v.b.text.slice(0, 700));
const pick = n => { const T = [...market.top, ...top500.top].filter((r, i, a) => r.rank <= n && r.ch24 != null && !isStable(r.sym) && a.findIndex(x => x.id === r.id) === i).map(r => ({ ...r, ch24: LIVE[r.id] ? LIVE[r.id].usd_24h_change : r.ch24 }));
  return [...[...T].sort((a, b) => b.ch24 - a.ch24).slice(0, 5), ...[...T].sort((a, b) => a.ch24 - b.ch24).slice(0, 5)].map(r => r.sym.toUpperCase()); };
let tops = [...cryptoPart(v.b.text).matchAll(/<code>(\S+)\s/g)].map(x => x[1]);
check('market best / worst: no stablecoins', tops.length > 0 && !tops.some(isStable), tops);
check(`market: Top 100 → 5 best + 5 worst ${pick(100)}`, JSON.stringify(tops) === JSON.stringify(pick(100)), { tops, want: pick(100) });
check('market buttons: 🪙 Crypto · 📈 bStocks · 🥇 Metals, then ✓ Top 100 · Top 200 · Top 300 · Top 500, then Refresh', JSON.stringify(btns(v).slice(0, 8).map(b => [b.text, b.callback_data])) === JSON.stringify([['✓ 🪙 Crypto', 'mk'], ['📈 bStocks', 'mks'], ['🥇 Metals', 'mkm'], ['✓ Top 100', 'mk:100'], ['Top 200', 'mk:200'], ['Top 300', 'mk:300'], ['Top 500', 'mk:500'], ['🔄 Refresh', 'mk:100']]) && !/bStocks · best/.test(v.b.text), btns(v).map(b => b.text));
sent.length = 0; await tap('mks'); { const sv = last();
const bs = [...sv.b.text.matchAll(/<b>bStocks · (best|worst) 24h<\/b>\n((?:<code>.*\n?)+)/g)].map(x => [x[1], [...x[2].matchAll(/<code>(\S+)\s/g)].map(y => y[1])]);
check('📈 tap bStocks → the same message: the US market (open / closed, the next change in Riyadh time), best 5 (CRCLB, AMZNB, NVDAB, MSFTB, AAPLB) + the worst: only those that fell (GMEB, TSLAB, METAB — a share that rose is never "worst")', sv.m === 'editMessageText' && /US market: <b>(🟢|🟡|⚪)/.test(sv.b.text) && /Riyadh/.test(sv.b.text) && JSON.stringify(bs) === JSON.stringify([['best', ['CRCLB', 'AMZNB', 'NVDAB', 'MSFTB', 'AAPLB']], ['worst', ['GMEB', 'TSLAB', 'METAB']]]) && /tokenized US stocks/.test(sv.b.text) && btns(sv)[1].text === '✓ 📈 bStocks' && okHtml(sv.b.text), sv.b.text); }
sent.length = 0; await tap('mkm'); { const mv = last();
check('🥇 tap Metals → gold / silver / platinum / copper (no oil), the gram in SAR, the gold/silver ratio', mv.m === 'editMessageText' && /Gold<\/b> \$2,650 \/ oz/.test(mv.b.text) && /1 gram: <b>319\.50 SAR<\/b>/.test(mv.b.text) && !/Brent|oil/.test(mv.b.text) && /Copper/.test(mv.b.text) && /ratio: <b>84\.9<\/b>/.test(mv.b.text) && btns(mv)[2].text === '✓ 🥇 Metals' && okHtml(mv.b.text), mv.b.text); }
sent.length = 0; await say('/metals');
check('…/metals (or "الذهب") opens it straight away', /🥇 <b>Metals<\/b>/.test(last().b.text), last().b.text.slice(0, 60));
sent.length = 0; await tap('mk:500');
v = last(); tops = [...cryptoPart(v.b.text).matchAll(/<code>(\S+)\s/g)].map(x => x[1]);
check(`tap Top 500 → edited in place, 5 best + 5 worst of the top 500 ${pick(500)}`, v.m === 'editMessageText' && /Top 500 · best 24h/.test(v.b.text) && JSON.stringify(tops) === JSON.stringify(pick(500)) && btns(v)[6].text === '✓ Top 500', { tops, want: pick(500) });
sent.length = 0; await say('/market');
check('…and Top 500 is remembered next time', /Top 500 · best 24h/.test(last().b.text) && btns(last())[7].callback_data === 'mk:500', last().b.text.slice(0, 40));
sent.length = 0; await tap('mk:100');
check('back to Top 100', /Top 100 · best 24h/.test(last().b.text));
const longMk = Math.max(...plain(last().b.text).split('\n').map(l => [...l].length));
check(`market: every line fits a phone (longest ${longMk} ≤ 40)`, longMk <= 40, plain(last().b.text).split('\n').filter(l => [...l].length > 40));
check('market: Telegram-safe', okHtml(v.b.text), v.b.text);
sent.length = 0; await say('/plan');
v = last();
check('plan: overall %, a bar per coin, LINK done ✅, SOL 50%', /Overall: <b>/.test(v.b.text) && /LINK\s*<\/code> ▰{10} 100% ✅/.test(v.b.text) && /SOL\s*<\/code> ▰{5}▱{5} 50%/.test(v.b.text), v.b.text);
check('plan: buy-price alert for PENDLE (a coin you don\'t own)', /Buy-price alerts/.test(v.b.text) && /PENDLE/.test(v.b.text), v.b.text);
sent.length = 0; await say('/exit');
v = last();
check('exit: two groups, each with its own count — market structure (3: now → target)', /\n🧭 <b>Market structure<\/b> · 0 of 3 met\n⏳ BTC dominance: [\d.]+% → ≤ 45\.9%\n⏳ USDT dominance: [\d.]+% → ≤ 3\.73%\n⏳ ETH\/BTC: [\d.]+ → ≥ 0\.0850\n/.test(v.b.text), v.b.text);
check('exit: …and Bitcoin valuation (3): the rainbow band against your band (6 until you choose), the Pi Cycle against your level (100 = the cross), MVRV against yours (3.0 until you choose) — with its source named', /\n🌈 <b>Bitcoin valuation<\/b> · 0 of 3 met\n⏳ Rainbow band: 2 \(Deep discount\) → ≥ 6\n⏳ Pi Cycle: 61\.4% → ≥ 100%\n⏳ MVRV: 1\.14 → ≥ 3\.00\n<i>MVRV · source: Coin Metrics<\/i>\n/.test(v.b.text) && !/of 4|of 5/.test(v.b.text), v.b.text);
check('exit: LINK TP1 $25 (+127%, sell 25%), TP2 = avg $15 × 3, TP3 × 5 — one short line each', /<b>LINK<\/b> · \$11\.00/.test(v.b.text) && /⏳ TP1 \$25\.00 · \+127% · 25%/.test(v.b.text) && /⏳ TP2 \$45\.00 · \+309% · 50%/.test(v.b.text) && /⏳ TP3 \$75\.00 · \+582% · 25%/.test(v.b.text), v.b.text);
const exLong = Math.max(...plain(v.b.text).split('\n').map(l => [...l].length));
check(`exit: every line fits a phone (longest ${exLong} ≤ 40)`, exLong <= 40, plain(v.b.text).split('\n').filter(l => [...l].length > 40));
check('exit: button opens Exit Strategy (accumulation.html#exit); Telegram-safe', btns(v).some(b => b.url && b.url.endsWith('accumulation.html#exit')) && okHtml(v.b.text), btns(v));
sent.length = 0; await tap('ex');
check('tap 🚪 Exit plan → edited in place', last().m === 'editMessageText' && /Exit plan/.test(last().b.text));
sent.length = 0; await say('/signals');
check('signals: grouped, Telegram-safe', /Signals/.test(last().b.text) && okHtml(last().b.text), last().b.text);
sent.length = 0; await say('/start');
check('/start → the welcome with the keyboard under the chat, then the menu', out().length === 2 && out()[0].b.reply_markup.keyboard && out()[0].b.reply_markup.is_persistent === false && btnTexts(out()[1]).length === 12 && btnTexts(out()[1]).includes('🗓 Daily') && btnTexts(out()[1]).includes('🧪 Paper') && btns(out()[1]).some(b => b.text === '📱 Open the app' && b.web_app && b.web_app.url === 'https://drsamirsaad1981-design.github.io/samsam-portfolio/index.html') && btnTexts(out()[1]).includes('🔔 Alerts') && btnTexts(out()[1]).includes('🌐 عربي') && btnTexts(out()[1]).includes('🚪 Exit plan'), out().map(x => Object.keys(x.b.reply_markup || {})));
check('the keyboard under the chat: 6 short buttons in 2 rows, not pinned (the ⌨️ icon hides / shows it)', JSON.stringify(out()[0].b.reply_markup.keyboard.map(r => r.map(b => b.text))) === JSON.stringify([['💼 Portfolio', '🌍 Market', '📋 Plan'], ['🚪 Exit', '🏆 Movers', '🎯 Signals']]) && out()[0].b.reply_markup.is_persistent === false, out()[0].b.reply_markup);
sent.length = 0; await say('/hide');
check('/hide → the buttons go away (remove_keyboard) with a note how to bring them back', last().b.reply_markup && last().b.reply_markup.remove_keyboard === true && /⌨️/.test(last().b.text), last().b);
for (const [txt, want] of [['🏆 Movers', /Best &amp; worst \(your coins\)/], ['🏆 Best & worst', /Best &amp; worst \(your coins\)/], ['🚪 Exit', /Market structure/], ['🚪 Exit plan', /Market structure/], ['🎯 Signals', /<b>Signals<\/b>/], ['📋 Plan', /Accumulation plan/], ['🌍 Market', /Top \d+ · best/]]) {
  sent.length = 0; await say(txt);
  check(`keyboard "${txt}" works on the first tap`, want.test(last().b.text), last().b.text.slice(0, 80));
}
sent.length = 0; await say('💼 Portfolio');
check('a typed message shows "typing…" first', sent[0] && sent[0].m === 'sendChatAction' && sent[0].b.action === 'typing', sent.slice(0, 2).map(x => x.m));
check('the keyboard button "💼 Portfolio" → the portfolio', last().b.text.includes(fmt2(sum.value)));

// ── 🧠 phase 2: plain words → Claude, with the live-data tools ──
await say('/new'); sent.length = 0; claudeCalls.length = 0; await say('what is the price of SOL?');
v = last();
check('a question → "🧠 Thinking…" at once, then that same message becomes the answer', sent.find(x => x.m === 'sendMessage').b.text === '🧠 Thinking…' && v.m === 'editMessageText' && v.b.message_id === 7, sent.map(x => x.m));
check('Claude called get_coin, then answered from its result (SOL $150, you hold 10, signal)', claudeCalls.length === 2 && claudeCalls[0].tools.length === 15 && /<b>SOL<\/b> is \$150 \(3\.5% 24h\)/.test(v.b.text) && /You hold 10 — /.test(v.b.text), v.b.text);
const tr = JSON.parse(claudeCalls[1].messages.at(-1).content[0].content);
check('get_coin gave Claude: live price + source, rank, 7d high / low, futures, your holding (avg, profit, signal)', tr.price_usd === 150 && /CoinGecko \(live\)/.test(tr.price_source) && tr.you_hold.amount === 10 && tr.you_hold.average_buy_usd === 160 && tr.you_hold.signal && 'perpetual_futures' in tr && tr.high_7d > 0, tr);
check('the answer is Telegram-safe (its <script> and & escaped, ** → <b>, "- " → •)', okHtml(v.b.text) && /&lt;script&gt;/.test(v.b.text) && /• You hold/.test(v.b.text), v.b.text);
check('footer: where the numbers came from + "N/30 left today"', /📡 Data: CoinGecko \(live\) · your portfolio \(Firebase\)/.test(v.b.text) && /\d+\/30 left today/.test(v.b.text), v.b.text.slice(-160));
check('buttons: 🪙 SOL (opens its card) · 🔥 Liq Map · 🆕 New chat · ⬅️ Menu', JSON.stringify(btns(v).map(b => b.text)) === JSON.stringify(['🪙 SOL', '🔥 Liq Map', '🆕 New chat', '⬅️ Menu']) && btns(v)[0].callback_data === 'c:solana', btns(v));
check('the system prompt forbids numbers from memory and asks for short phone lines', /must come from a tool result/.test(claudeCalls[0].system) && /≤ 40 characters/.test(claudeCalls[0].system) && claudeCalls[0].model === 'claude-sonnet-5-5', claudeCalls[0].system.slice(0, 120));
sent.length = 0; claudeCalls.length = 0; await say('and ETH?');
check('it remembers: the next question carries the earlier question + answer', claudeCalls[0].messages.length === 3 && /price of SOL\?$/.test(claudeCalls[0].messages[0].content) && /SOL\*\* is/.test(claudeCalls[0].messages[1].content), claudeCalls[0].messages.map(x => String(x.content).slice(0, 30)));
sent.length = 0; await say('/new');
check('/new → "New chat" and the memory is gone', /New chat/.test(last().b.text));
claudeCalls.length = 0; await say('hello there');
check('…the next question starts fresh (1 message)', claudeCalls[0].messages.length === 1, claudeCalls[0].messages.length);
sent.length = 0; claudeCalls.length = 0; await say('tell me everything');
const all = claudeCalls[1] && claudeCalls[1].messages.at(-1).content.map(r => JSON.parse(r.content));
check('5 tools in one turn: portfolio, market (Top 200), plan, exit, 7-day history', all && all.length === 5 && all[0].total_value_usd > 0 && all[1].top200_best_24h && all[1].bstocks_best_24h.length === 5 && all[2].coins.length === 3 && all[3].conditions.length === 6 && /rainbow/i.test(all[3].conditions[3].name) && /Pi Cycle/.test(all[3].conditions[4].name) && /MVRV.*Coin Metrics/.test(all[3].conditions[5].name) && all[3].conditions[5].now === 1.139 && all[3].conditions.map(c => c.group).join() === 'Market structure,Market structure,Market structure,Bitcoin valuation,Bitcoin valuation,Bitcoin valuation' && all[1].bitcoin_rainbow.average_200_week_usd === 48000 && all[1].bitcoin_rainbow.pi_cycle_pct === 61.37 && all[1].bitcoin_rainbow && all[1].bitcoin_rainbow.band === 2 && all[1].bitcoin_rainbow.name === 'Deep discount' && /not a forecast/.test(all[1].bitcoin_rainbow.note) && all[4].change_pct != null && all[4].high && all[4].daily_closes, all && all.map(x => Object.keys(x).slice(0, 4)));
check('…the market tool carries MVRV (source named), the dollar index and BTC funding (its venues, and the ones not in it)', all && all[1].bitcoin_mvrv && all[1].bitcoin_mvrv.ratio === 1.139 && all[1].bitcoin_mvrv.market_average_cost_usd === 53033 && /Coin Metrics/.test(all[1].bitcoin_mvrv.source) && all[1].bitcoin_mvrv.highest_by_cycle.length === 5 && all[1].us_dollar_index.value === 103.872 && all[1].us_dollar_index.level === 'Moderate strength' && all[1].us_dollar_index.level_ar === 'قوة معتدلة' && all[1].us_dollar_index.level_range === '100 – 105' && /68% of weeks/.test(all[1].us_dollar_index.note) && /53% of weeks/.test(all[1].us_dollar_index.note) && all[1].us_dollar_index.place_in_52_week_range_pct === 94 && all[1].btc_funding.rate_8h_pct === 0.0044 && all[1].btc_funding.reading === 'Calm — at or under the resting rate' && all[1].btc_funding.not_included.join() === 'Binance,Bybit' && /WITHOUT Binance and Bybit/.test(all[1].btc_funding.note) && all[1].btc_funding.venues.length === 5, all && [all[1].bitcoin_mvrv, all[1].us_dollar_index, all[1].btc_funding]);
check('get_market: metals, no oil (gold with the gram in SAR 319.5), the US stock market\'s state and next change, the bStocks summary (8: 5 up, 3 down)', all[1].metals.length === 4 && all[1].metals[0].name === 'gold' && all[1].metals[0].gram_sar_24k === 319.5 && !('gram_sar_24k' in all[1].metals[3]) && !all[1].metals.some(x => x.name === 'brent') && ['open', 'pre', 'after', 'closed'].includes(all[1].us_stock_market.state) && all[1].us_stock_market.next_change_riyadh && all[1].bstocks_summary.count === 8 && all[1].bstocks_summary.up === 5, { m: all[1].metals_and_oil, u: all[1].us_stock_market, b: all[1].bstocks_summary });
check('get_portfolio: every coin with share %, profit vs average, signal (USDT marked stablecoin)', all[0].coins.length === 5 && all[0].coins.find(c => c.ticker === 'USDT').stablecoin === true && all[0].coins.every(c => 'signal' in c && 'share_pct' in c), all[0].coins);
check('get_exit: LINK TP1 $25 at +127% to go, sell 25%', all[3].take_profits[0].ticker === 'LINK' && all[3].take_profits[0].level_usd === 25 && Math.round(all[3].take_profits[0].pct_to_go) === 127 && all[3].take_profits[0].sell_pct === 25, all[3].take_profits[0]);
check('get_portfolio: each coin\'s result vs BTC (vs_btc_pct) and 30 / 90-day strength vs BTC — one call answers "which coins are weaker than BTC"', all[0].coins.every(c => 'vs_btc_pct' in c && 'vs_btc_30d_pts' in c) && all[0].coins.find(c => c.ticker === 'SOL').vs_btc_pct != null, all[0].coins.map(c => [c.ticker, c.vs_btc_pct]));
sent.length = 0; claudeCalls.length = 0; await say('the futures of SOL?');
const dv = claudeCalls[1] && claudeCalls[1].messages.at(-1).content.map(r => JSON.parse(r.content));
const sm = dv && dv[0].summary;
check('get_derivatives: OKX + Binance + Hyperliquid for SOL', dv && dv[0].sources.map(x => x.source).join() === 'OKX,Binance,Hyperliquid', dv && dv[0]);
check('…funding: OKX 0.01% / Binance 0.03% / Hyperliquid 0.01% (hourly × 8) → average 0.0167% per 8 h, 18.3% a year — over the resting +0.01%, in the core\'s one wording', sm.funding_8h_pct_avg === 0.0167 && sm.funding_annualized_pct === 18.3 && sm.funding_reading === 'Longs paying over the resting rate' && sm.funding_state === 'up', sm);
check('…open interest $500M + $600M + $300M = $1.4B, +9.6% in 24 h (OKX), 68.8% of accounts long (Binance)', sm.open_interest_usd_total === 1.4e9 && sm.open_interest_change_24h_pct === 9.6 && sm.long_accounts_pct === 68.8, sm);
check('…liquidations in the last 24 h (OKX): longs $15,000, shorts $3,200 (the 30-hour-old one left out)', sm.liquidations_24h.orders === 2 && sm.liquidations_24h.longs_usd === 15000 && sm.liquidations_24h.shorts_usd === 3200, sm.liquidations_24h);
check('…a coin with no futures → "no futures data", not a crash', /no futures data/.test(dv[1].error), dv[1]);
check('…the 📡 line names the futures sources', /futures: OKX, Binance, Hyperliquid \(live\)/.test(last().b.text), last().b.text.slice(-200));
check('the prompt says: call the tools again for every question (never repeat an earlier "no data"), and get_derivatives for liquidation questions', /call the tools again/.test(claudeCalls[0].system) && /never repeat an earlier "no data"/.test(claudeCalls[0].system) && /always call get_derivatives/.test(claudeCalls[0].system));
check('the prompt asks for the AI Analysis style: verdict line, emoji section titles, short bullets', /AI Analysis report/.test(claudeCalls[0].system) && /emoji \+ \*\*Title\*\*/.test(claudeCalls[0].system) && /One idea per bullet/.test(claudeCalls[0].system), claudeCalls[0].system.slice(0, 80));
sent.length = 0; claudeCalls.length = 0; await say('keep looking at btc please');
check('a model that keeps calling tools → after 8 rounds it must answer (tools still declared, tool_choice none) — no error', /Final answer after many rounds/.test(last().b.text) && claudeCalls.length === 9 && claudeCalls.at(-1).tool_choice.type === 'none' && claudeCalls.every(c => c.tools), [claudeCalls.length, last().b.text.slice(0, 60)]);
await say('/new'); claudeCalls.length = 0; await say('ما هي أفضل عملة؟'); await say('Which coins are weaker than BTC in my portfolio?');
check('language follows THIS message: Arabic question → "answer in simple Modern Standard Arabic", English after it → "answer in English"', /in Arabic — answer in simple Modern Standard Arabic/.test(claudeCalls[0].system) && /in English — answer in English/.test(claudeCalls.at(-1).system), claudeCalls.map(c => (c.system.match(/latest message is in [^—]+— [^(]+/) || [''])[0]));
check('…and the note rides on the question itself ("(Reply in English.)"), not kept in the memory', /\(Reply in English\.\)$/.test(claudeCalls.at(-1).messages.at(-1).content) && /أجب بالعربية الفصحى/.test(claudeCalls[0].messages.at(-1).content) && !claudeCalls.at(-1).messages.slice(0, -1).some(m => /Reply in English|جاوب بالعربي/.test(String(m.content))), claudeCalls.at(-1).messages.map(m => String(m.content).slice(-30)));
sent.length = 0; claudeCalls.length = 0; const dup = UPD + 1;
await post({ update_id: dup, message: { message_id: 9, chat: { id: 555 }, text: 'what is the price of SOL?' } });
await post({ update_id: dup, message: { message_id: 9, chat: { id: 555 }, text: 'what is the price of SOL?' } });
UPD = dup;
check('Telegram re-sends the same message (slow answer) → answered once', claudeCalls.length === 2 && sent.filter(x => x.m === 'sendMessage').length === 1, [claudeCalls.length, sent.map(x => x.m)]);
sent.length = 0; claudeCalls.length = 0;
await post({ update_id: ++UPD, message: { chat: { id: 555 }, text: 'hello model' } }, ENV.TG_SECRET, { ...ENV, BOT_MODEL: 'bad-model', MODEL: 'claude-opus-4-5' });
check('a model name Anthropic refuses → asks again with AI Analysis\'s model', claudeCalls.map(c => c.model).join() === 'bad-model,claude-opus-4-5' && /A general answer/.test(last().b.text), claudeCalls.map(c => c.model));
sent.length = 0; claudeCalls.length = 0;
await post({ update_id: ++UPD, message: { chat: { id: 555 }, text: 'over the limit?' } }, ENV.TG_SECRET, { ...ENV, AI_DAILY_LIMIT: '3' });
check('past the daily limit → "used today\'s 3 questions", Claude not called', claudeCalls.length === 0 && /used today's 3 questions/.test(last().b.text), last().b.text);
sent.length = 0;
await post({ update_id: ++UPD, message: { chat: { id: 555 }, text: 'no key?' } }, ENV.TG_SECRET, { ...ENV, ANTHROPIC_API_KEY: '' });
check('no Anthropic key → says so, no crash', /not set up/.test(last().b.text), last().b.text);
sent.length = 0; outside = 0; claudeCalls.length = 0; await say('tell me everything');
check(`a 5-tool question stays within Cloudflare's 50 calls (${outside} outside + ${sent.length} Telegram)`, outside + sent.length <= 50, [outside, sent.length]);

// 🌐 English mode = English only: not one Arabic letter in anything the bot sent so far (every command, button view and
// alert above ran in English) — the user's own words echoed back aside
{ const AR = /[\u0600-\u06FF]/, bad = [...new Set((globalThis.__all || []).filter(t => AR.test(t) && !/A.general.answer.about/.test(t.replace(/[\u200E\u200F\u2060\u2066\u2069]/g, ''))).map(t => (t.split('\n').find(l => AR.test(l)) || '').replace(/<[^>]+>/g, '').slice(0, 90)))];
  check(`English mode: no Arabic in any of the ${(globalThis.__all || []).length} messages sent in English`, (globalThis.__all || []).length > 50 && !bad.length, bad.slice(0, 8)); }
// ── language: English by default, 🌐 switches (and back) ──
sent.length = 0; await say('/menu');
check('English by default (even with the alerts set to Arabic): menu has "🌐 عربي"', /What would you like/.test(last().b.text) && btnTexts(last()).includes('🌐 عربي'), last().b.text);
sent.length = 0; await tap('lang:ar');
check('tap 🌐 عربي → "اللغة: عربي ✅" with the Arabic keyboard, the menu redrawn in Arabic', out().some(x => x.b.text === 'اللغة: عربي ✅' && x.b.reply_markup.keyboard[0][0].text === '💼 محفظتي') && out().some(x => x.m === 'editMessageText' && /ماذا تريد أن ترى/.test(x.b.text) && btnTexts(x).includes('🌐 English')), out().map(x => x.b.text.slice(0, 30)));
sent.length = 0; await say('/portfolio');
check('…and it stays Arabic', /محفظتك الآن/.test(last().b.text), last().b.text.slice(0, 60));
sent.length = 0; await say('english');
check('typing "english" → back to English', out().some(x => x.b.text === 'Language: English ✅') && /What would you like/.test(last().b.text), out().map(x => x.b.text.slice(0, 30)));
sent.length = 0; await say('/lang');
check('/lang → the two choices', JSON.stringify(btns(last()).map(b => b.callback_data)) === '["lang:en","lang:ar"]', btns(last()));

// ── Arabic ──
await tap('lang:ar');   // the Arabic checks below
{ const w = (globalThis.__alertsLang || []).pop();
  check('🌐 /lang → عربي: GitHub\'s alerts follow — the Worker writes alerts.lang = ar (+ langPicked) to your settings, ONLY those two fields (masked)', w && /users\/UID1\/meta\/info\?updateMask\.fieldPaths=alerts\.lang&updateMask\.fieldPaths=alerts\.langPicked$/.test(w.u) && w.body.fields.alerts.mapValue.fields.lang.stringValue === 'ar' && w.body.fields.alerts.mapValue.fields.langPicked.booleanValue === true && Object.keys(w.body.fields).join() === 'alerts', w); }
sent.length = 0;
if (process.env.DUMP_AR) {   // a look at the Arabic views as Telegram gets them (raw, marks included) → /tmp/ar_dump.txt
  const out = [];
  for (const d of ['menu', 'mk', 'mks', 'mkm', 'pf', 'bal', 'alerts', 'plan']) { sent.length = 0; await tap(d); const x = sent.filter(y => y.b && typeof y.b.raw === 'string' && /editMessageText|sendMessage/.test(y.m) && !/تم التحديث/.test(y.b.raw)).pop(); out.push('=== ' + d + '\n' + (x ? x.b.raw : '(none)')); }
  for (const t of ['/market', '/stocks', '/metals', '/alerts', '/analyze']) { sent.length = 0; await say(t); const x = sent.filter(y => y.b && typeof y.b.raw === 'string').pop(); out.push('=== ' + t + '\n' + (x ? x.b.raw : '(none)')); }
  fs.writeFileSync('/tmp/ar_dump.txt', out.join('\n\n')); sent.length = 0;
}
// Arabic lines built so each part starts with an Arabic word (Telegram keeps them in order right-to-left)
sent.length = 0; await tap('mk');
{ const tx = sent.filter(y => y.m === 'editMessageText').pop().b.text;
  check('Arabic market: "الهيمنة: البيتكوين 59.8% · التيثر 6.95%", Fear & Greed and Altcoin Season in Arabic, ETF "تدفقات ETF (6 نوفمبر)"',
    /الهيمنة: البيتكوين 59\.8% · التيثر 6\.95%/.test(tx) && /البيتكوين: <b>\$77,000<\/b>/.test(tx) && /الخوف والطمع: <b>28<\/b> · خوف/.test(tx) && /موسم العملات البديلة: <b>50<\/b>/.test(tx) && /· يميل للعملات البديلة/.test(tx) && /تدفقات ETF \(\d+ [\u0600-\u06FF]+\):\n• BTC/.test(tx) && !/Fear|Leaning|Nov/.test(tx), tx); }
sent.length = 0; await tap('mks');
{ const tx = sent.filter(y => y.m === 'editMessageText').pop().b.text;
  check('Arabic bStocks: "📊 عدد الأسهم 8 · 🟢 صاعد 5 · 🔴 هابط 3 · المتوسط", no empty "—", headers start in Arabic',
    /📊 عدد الأسهم 8\n🟢 صاعد 5 · 🔴 هابط 3 · المتوسط \+0\.53%/.test(tx) && !/ — ·/.test(tx) && /الأفضل في bStocks/.test(tx), tx); }
sent.length = 0; await tap('sg');
{ const x = sent.filter(y => y.m === 'editMessageText').pop(), tx = x ? x.b.text : '';
  check('Arabic signals: "مقارنة بمتوسط شرائك" once in each group header, rows short ("SOL −6.3% · متوسطك $…", no fixed-width block mixed with Arabic)', /\(\d+\) · <i>مقارنة بمتوسطك<\/i>/.test(tx) && /<b>SOL<\/b> −6\.3% · متوسطك \$/.test(tx) && !/<code>/.test(tx), tx.slice(0, 300)); }
sent.length = 0; await tap('pl');
{ const x = sent.filter(y => y.m === 'editMessageText').pop(), tx = x ? x.b.text : '';
  check('Arabic plan: shorter bar (7) and "باقي" with a short amount, DCA "… شهرياً" (no "/mo")', /▱{1,7} \d+% · باقي [\d.]+/.test(tx) && !/▱{8}|▰{8}/.test(tx) && !/\/mo/.test(tx), tx.slice(0, 400)); }
sent.length = 0; await tap('mkm');
{ const tx = sent.filter(y => y.m === 'editMessageText').pop().b.text;
  check('Arabic metals: short lines "الذهب $2,650 · اليوم +0.8% · أسبوع …", the unit said once ("الأسعار للأونصة (النحاس للرطل)"), no slash', /<b>الذهب<\/b> \$2,650 · اليوم \+0\.8%\n +أسبوع \+1\.5% · الجرام <b>319\.50 ريال<\/b>/.test(tx) && /الأسعار للأونصة \(النحاس للرطل\)/.test(tx) && !/ \/ أونصة/.test(tx), tx); }
// 🔎 Arabic sweep: every view and command, in Arabic — no line may read left-to-right by mistake. Telegram takes a line's
// direction from its first visible character, whatever marks it carries (seen 20 Nov): so in an Arabic message a line must
// not START with a Latin letter, a digit or "$ + − (" — and a fixed-width <code> row must not hold Arabic words
// (the tables of tickers and numbers only, "CYBER +31.3% $269", stay left-to-right on purpose).
const rtlBad = raw => {
  const AR = /[؀-ۿ]/, plain = raw.replace(/<[^>]+>/g, ''), ar = (plain.match(/[؀-ۿ]/g) || []).length, la = (plain.match(/[A-Za-z]/g) || []).length;
  if (!ar || ar * 3 < la) return [];   // not an Arabic message
  return raw.split('\n').filter(line => {
    const bare = line.replace(/[‎‏⁠]/g, ''), vis = bare.replace(/<[^>]+>/g, '').replace(/[ \s]/g, '');
    if (!vis) return false;
    const code = /^\s*<code>/.test(bare), inCode = (bare.match(/<code>([\s\S]*?)<\/code>/) || [])[1] || '';
    if (code) return AR.test(vis) && /[A-Za-z0-9]/.test(inCode);   // a ticker / number table row with Arabic beside it
    if (/^https?:\/\/\S+$/.test(vis) || /^\d\uFE0F?\u20E3/.test(vis)) return false;   // a link alone on its line; a numbered step (1️⃣ — an emoji)
    return /^[A-Za-z0-9$+\-−(]/.test(vis);
  });
};
{
  const seen = [], grab = () => { for (const y of sent) if (y.b && typeof y.b.raw === 'string' && String(y.b.chat_id) === '555') seen.push(y.b.raw); sent.length = 0; };
  sent.length = 0;
  for (const t of ['/start', '/menu', '/portfolio', '/market', '/stocks', '/metals', '/plan', '/exit', '/movers', '/signals', '/alerts', '/daily', '/paper', '/report', '/guide', '/community', '/premium', '/support', '/lang', '/hide', '/pin', '/balances', '/coin', 'btc', 'sol link', '/feedback', '/users', '/invite', '/stats', '/new', '/morning', '/evening']) {
    await say(t); grab();
  }
  for (const d of ['pf', 'mk', 'mks', 'mkm', 'pl', 'ex', 'mv', 'sg', 'al', 'dy', 'pp', 'rp', 'coin', 'menu', 'pin:r', ...JSON.parse(fs.readFileSync(path.join(ROOT, 'guide.json'), 'utf8')).sections.map(x => 'gd:' + x.k)]) { await tap(d); grab(); }
  const bad = []; for (const raw of seen) for (const l of rtlBad(raw)) bad.push(l.replace(/[‎‏⁠]/g, '').replace(/ /g, ' ').slice(0, 90));
  check(`🔎 Arabic sweep: ${seen.length} messages (every command and button) — no line starts left-to-right, no Arabic inside a ticker table`, seen.length > 60 && !bad.length, [...new Set(bad)].slice(0, 40));
}
sent.length = 0;
await post({ message: { chat: { id: 555 }, text: '/portfolio' } }, ENV.TG_SECRET, { ...ENV, BOT_LANG: 'ar' });
check('Arabic: "محفظتك الآن"', /محفظتك الآن/.test(last().b.text) && btnTexts(last()).includes('🔄 تحديث'), last().b.text.slice(0, 120));
sent.length = 0; await post({ message: { chat: { id: 555 }, text: '📋 الخطة' } }, ENV.TG_SECRET, { ...ENV, BOT_LANG: 'ar' });
check('Arabic keyboard "📋 الخطة" → the plan in Arabic', /خطة التجميع/.test(last().b.text) && okHtml(last().b.text), last().b.text);
sent.length = 0; await post({ message: { chat: { id: 555 }, text: 'sol' } }, ENV.TG_SECRET, { ...ENV, BOT_LANG: 'ar' });
check('Arabic coin card', /لديك <b>10 SOL<\/b>/.test(last().b.text) && /متوسط شرائك/.test(last().b.text), last().b.text);

// ── setup link ──
sent.length = 0;
r = await W.fetch(new Request(HOST + '/tg/setup?key=nope'), ENV, {});
check('setup with a wrong key → 403, nothing sent', r.status === 403 && sent.length === 0);
r = await W.fetch(new Request(HOST + '/tg/setup?key=' + ENV.TG_SECRET), { ...ENV, BOT_LANG: 'en' }, {});
const sj = await r.json();
const hook = sent.find(x => x.m === 'setWebhook');
check('setup → webhook on /tg with the secret, menu set, welcome sent, portfolio connected', r.status === 200 && sj.ok && hook && hook.b.url === HOST + '/tg' && hook.b.secret_token === ENV.TG_SECRET && sent.some(x => x.m === 'setMyCommands') && sj.portfolio === 'connected', sj);
check('setup reply never shows a secret', !JSON.stringify(sj).includes(ENV.TG_SECRET) && !JSON.stringify(sj).includes('fake'));
r = await W.fetch(new Request(HOST + '/tg/setup?key=short'), { ...ENV, TG_SECRET: 'short' }, {});
check('setup: a TG_SECRET Telegram would refuse → explained', r.status === 400);

// ── AI Analysis still the same ──
r = await W.fetch(new Request(HOST + '/analyze', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' }), ENV, {});
check('/analyze from another site → 403 (unchanged)', r.status === 403);
r = await W.fetch(new Request(HOST + '/analyze', { method: 'OPTIONS', headers: { Origin: 'https://drsamirsaad1981-design.github.io' } }), ENV, {});
check('/analyze CORS preflight from the app → 204 (unchanged)', r.status === 204);
r = await W.fetch(new Request(HOST + '/analyze', { method: 'POST', headers: { Origin: 'https://drsamirsaad1981-design.github.io', 'content-type': 'application/json' }, body: '{}' }), ENV, {});
check('/analyze without sign-in → 401 (unchanged)', r.status === 401);

// ── no portfolio connected ──
sent.length = 0;
await post({ message: { chat: { id: 555 }, text: 'btc' } }, ENV.TG_SECRET, { ...ENV, FIREBASE_SERVICE_ACCOUNT: '' });
check('without the Firebase key a coin still works (no holding line)', /Bitcoin/.test(last().b.text) && !/You hold/.test(last().b.text), last().b.text);

// ── 🔔 phase 3: alerts in words, checked by the cron; what-if ──
const kvStore = new Map(), KV = { list: async ({ prefix }) => ({ keys: [...kvStore.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }), get: async k => kvStore.has(k) ? kvStore.get(k) : null, put: async (k, v) => { kvStore.set(k, v); }, delete: async k => { kvStore.delete(k); } };
const ENVK = { ...ENV, RATE: KV };
let inst = 0;
const fresh = async () => (await import('../tools/dist/samsam-worker.js?w' + (++inst))).default;   // a new Worker instance: nothing cached
const postK = async (Wk, text) => Wk.fetch(new Request(HOST + '/tg', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': ENV.TG_SECRET }, body: JSON.stringify({ update_id: ++UPD, message: { chat: { id: 555 }, text } }) }), ENVK, {});
const RIYADH = hm => Date.parse(new Date(NOW + 3 * HR).toISOString().slice(0, 10) + 'T' + hm + ':00+03:00');   // today, a Riyadh clock time
const cron = async (Wk, at = RIYADH('03:07')) => { const p = []; await Wk.scheduled({ cron: '*/5 * * * *', scheduledTime: at }, ENVK, { waitUntil: x => p.push(x) }); await Promise.all(p); };   // 03:07: no daily job (quiet)
let Wk = await fresh();
sent.length = 0; claudeCalls.length = 0; await postK(Wk, 'alert me sol');
const al = claudeCalls[1] && claudeCalls[1].messages.at(-1).content.map(r => JSON.parse(r.content));
check('set_alert: "SOL ≤ $140" saved, now $150, waiting (armed)', al && al[0].ok && al[0].alert === 'SOL price ≤ $140' && al[0].now === 150 && al[0].already_met === false, al && al[0]);
check('set_alert: "SOL ≥ $100" is already true → saved, but waits for the next crossing (already_met)', al[1].ok && al[1].already_met === true, al[1]);
check('set_alert: portfolio ≥ $1B (no coin needed); a wrong kind → a clear error', al[2].ok && al[2].alert === 'Portfolio value ≥ $1.00B' && /kind must be/.test(al[3].error), [al[2], al[3]]);
check('the prompt routes "tell me if…" to set_alert and "what if…" to what_if', /set_alert/.test(claudeCalls[0].system) && /what_if/.test(claudeCalls[0].system));
sent.length = 0; await postK(Wk, '/alerts');
let av = last();
check('/alerts: the 3 alerts listed, the one already true marked "waits to reset first", a 🗑 per alert', /Your alerts<\/b> \(3\)/.test(av.b.text) && /SOL price ≤ \$140/.test(av.b.text) && /waits to reset first/.test(av.b.text) && btns(av).filter(b => /^🗑/.test(b.text)).length === 3, av.b.text);
LIVE.solana.usd = 139; Wk = await fresh(); sent.length = 0; await cron(Wk);
check('⏳ cron: SOL $139 the first time → nothing yet (could be a wick), the alert notes when it became true', sent.filter(x => x.m === 'sendMessage').length === 0 && JSON.parse(kvStore.get('tg:555:alerts')).find(a => a.value === 140).since > 0, sent.map(x => x.b.text));
LIVE.solana.usd = 141; Wk = await fresh(); await cron(Wk, RIYADH('03:12'));
check('⏳ …back above $140 on the next check (a wick) → nothing sent, and it starts over', sent.filter(x => x.m === 'sendMessage').length === 0 && !JSON.parse(kvStore.get('tg:555:alerts')).find(a => a.value === 140).since);
LIVE.solana.usd = 139; Wk = await fresh(); await cron(Wk, RIYADH('03:17'));
Wk = await fresh(); sent.length = 0; await cron(Wk, RIYADH('03:22'));
const fired = sent.filter(x => x.m === 'sendMessage');
check('cron: SOL $139 on two checks in a row → "🔔 🔻 SOL below $140", now $139, the note, "not a wick", buttons SOL + Liq Map', fired.length === 1 && /🔔 🔻 <b>SOL below \$140<\/b>/.test(fired[0].b.text) && /Now: <b>\$139<\/b>/.test(fired[0].b.text) && /buy zone/.test(fired[0].b.text) && /not a wick/.test(fired[0].b.text) && btns(fired[0])[0].text === '🪙 SOL', fired.map(x => x.b.text));
const left = JSON.parse(kvStore.get('tg:555:alerts'));
check('…and it is removed; the waiting one is still waiting (still above $100)', left.length === 2 && !left.some(a => a.value === 140) && left.find(a => a.value === 100).armed === false, left);
sent.length = 0; Wk = await fresh(); await cron(Wk);
check('next cron: nothing fires again', sent.filter(x => x.m === 'sendMessage').length === 0, sent.map(x => x.b.text));
{ // 🌐 an Arabic chat: the alert it set arrives in Arabic — every word, the date and the buttons (it used to be English for everyone)
  const keepA = kvStore.get('tg:555:alerts'), keepL = kvStore.get('tg:555:lang'), at = RIYADH('03:27');
  kvStore.set('tg:555:lang', 'ar');
  kvStore.set('tg:555:alerts', JSON.stringify([{ id: 'arx1', kind: 'price_below', sym: 'SOL', cg: 'solana', value: 500, armed: true, since: at - 6 * 60e3, created: at - 3600e3, note: '' },
    { id: 'arx2', kind: 'price_above', sym: 'GOLD', metal: 'gold', value: 100, armed: true, since: at - 6 * 60e3, created: at - 3600e3 }]));
  Wk = await fresh(); sent.length = 0; await postK(Wk, '/alerts');
  const lv = last().b.text;
  check('🌐 /alerts in Arabic: "سعر SOL ≤ $500" and "سعر الذهب ≥ $100 للأونصة" (no English "price")', /سعر SOL ≤ \$500/.test(lv) && /سعر الذهب ≥ \$100 للأونصة/.test(lv) && !/price|Gold/.test(lv), lv);
  Wk = await fresh(); sent.length = 0; await cron(Wk, at);
  const fa = sent.filter(x => x.m === 'sendMessage')[0], ft = fa ? fa.b.text : '', fb = fa ? btns(fa).map(b => b.text) : [];
  check('🌐 cron, Arabic chat: "تنبيهان" · "SOL تحت $500" · "الذهب فوق $100" · "الآن:" · "تنبيهك من … نوفمبر … (ليس ذيل شمعة)", no English words', /<b>تنبيهان<\/b>/.test(ft) && /<b>SOL تحت \$500<\/b>/.test(ft) && /<b>الذهب فوق \$100<\/b>/.test(ft) && /الآن: <b>\$/.test(ft) && /تنبيهك من \d+ [\u0600-\u06FF]+/.test(ft) && /ليس ذيل شمعة/.test(ft) && !/Now|Your alert|below|above|alerts|Nov/.test(ft) && okHtml(ft), ft);
  check('…its buttons too: 🪙 SOL · 🥇 المعادن · 🔔 تنبيهاتي', fb.includes('🪙 SOL') && fb.includes('🥇 المعادن') && fb.includes('🔔 تنبيهاتي') && !fb.some(x => /Metals|\/alerts/.test(x)), fb);
  kvStore.set('tg:555:alerts', keepA); if (keepL == null) kvStore.delete('tg:555:lang'); else kvStore.set('tg:555:lang', keepL); sent.length = 0;
}
LIVE.solana.usd = 95; Wk = await fresh(); await cron(Wk);
check('SOL drops to $95 → the "≥ $100" alert is now armed (no message)', JSON.parse(kvStore.get('tg:555:alerts')).find(a => a.value === 100).armed === true && sent.filter(x => x.m === 'sendMessage').length === 0);
LIVE.solana.usd = 105; Wk = await fresh(); sent.length = 0; await cron(Wk); Wk = await fresh(); await cron(Wk, RIYADH('03:27'));
check('…back above $100 → "🚀 SOL above $100" fires', sent.some(x => x.m === 'sendMessage' && /🚀 <b>SOL above \$100<\/b>/.test(x.b.text)), sent.map(x => x.b.text));
LIVE.solana.usd = 150;
sent.length = 0; Wk = await fresh(); await postK(Wk, '/alerts');
av = last(); const del = btns(av).find(b => /^🗑 1/.test(b.text));
await Wk.fetch(new Request(HOST + '/tg', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': ENV.TG_SECRET }, body: JSON.stringify({ update_id: ++UPD, callback_query: { id: 'qd', data: del.callback_data, message: { message_id: 77, chat: { id: 555 } } } }) }), ENVK, {});
check('🗑 1 → deleted, the list redrawn in place, "🗑 Alert deleted"', JSON.parse(kvStore.get('tg:555:alerts')).length === 0 && last().m === 'editMessageText' && /No alerts yet/.test(last().b.text) && sent.some(x => x.m === 'answerCallbackQuery' && /deleted/.test(x.b.text || '')), [kvStore.get('tg:555:alerts'), last().b.text]);
sent.length = 0; Wk = await fresh(); await cron(Wk);
check('cron with no alerts → no outside calls, nothing sent', sent.length === 0);
// 🔔 several alerts confirmed in the same round → ONE message (fewer messages), each alert still on its own lines
kvStore.set('tg:555:alerts', JSON.stringify([{ id: 'g1', kind: 'price_below', value: 140, sym: 'SOL', cg: 'solana', armed: true, created: NOW, since: 1 }, { id: 'g2', kind: 'price_above', value: 1000, sym: 'BTC', cg: 'bitcoin', armed: true, created: NOW, since: 1 }]));
LIVE.solana.usd = 139; sent.length = 0; Wk = await fresh(); await cron(Wk);
{ const ms = sent.filter(x => x.m === 'sendMessage');
  check('🔔 two alerts confirmed together → one message "2 alerts" with both, a button for each coin + 🔔 /alerts; both removed', ms.length === 1 && /🔔 <b>2 alerts<\/b>/.test(ms[0].b.text) && /SOL below \$140/.test(ms[0].b.text) && /BTC above \$1,000/.test(ms[0].b.text) && okHtml(ms[0].b.text) && btns(ms[0]).map(b => b.text).join(' ') === '🪙 SOL 🪙 BTC 🔔 /alerts' && JSON.parse(kvStore.get('tg:555:alerts')).length === 0, ms.map(x => [x.b.text, btns(x).map(b => b.text)])); }
LIVE.solana.usd = 150;
// 🥇 / 📈 alerts on metals and bStocks (no oil any more) (prices from the snapshot)
claudeCalls.length = 0; Wk = await fresh(); await postK(Wk, 'alert me gold');
{ const ga = claudeCalls[1] && claudeCalls[1].messages.at(-1).content.map(r => JSON.parse(r.content));
  check('🥇 set_alert "الذهب" ≥ $2,700 → Gold price ≥ $2,700/oz, now $2,650; "Tesla" → the bStock TSLAB; "بلاتين" → Platinum ≤ $950/oz; funding on gold → refused; "oil" → not a metal any more', ga && ga[0].ok && ga[0].alert === 'Gold price ≥ $2,700/oz' && ga[0].now === 2650 && ga[1].ok && /^TSLAB \(Tesla\) 24h change ≤ −5/.test(ga[1].alert) && ga[2].ok && /^Platinum price ≤ \$950/.test(ga[2].alert) && /crypto futures only/.test(ga[3].error) && ga[4] && !ga[4].ok, ga);
  check('…the tool tells Claude metals and bStocks are checked against ~30-minute prices', /a METAL — gold, silver, platinum, copper/.test(JSON.stringify(claudeCalls[0].tools)) && !/brent/i.test(JSON.stringify(claudeCalls[0].tools)) && /bStock/.test(JSON.stringify(claudeCalls[0].tools))); }
sent.length = 0; Wk = await fresh(); await postK(Wk, '/alerts');
check('/alerts grouped: 📈 Stocks (bStocks) · 🥇 Metals, numbered as shown, with the ~30-minute note', /<b>📈 Stocks \(bStocks\)<\/b>\n1\. TSLAB \(Tesla\)/.test(last().b.text) && /<b>🥇 Metals<\/b>\n2\. Gold price ≥ \$2,700\/oz\n3\. Platinum price ≤ \$950/.test(last().b.text) && /prices refreshed every ~30 min/.test(last().b.text) && okHtml(last().b.text) && btns(last())[0].text === '🗑 1', last().b.text);
market.metals.find(x => x.k === 'gold').price = 2710; Wk = await fresh(); sent.length = 0; await cron(Wk); Wk = await fresh(); await cron(Wk, RIYADH('03:12'));
{ const gf = sent.filter(x => x.m === 'sendMessage' && /Gold above/.test(x.b.text || ''));
  check('cron: gold $2,710 → the gold alert fires (with a 🥇 Metals button), the others wait', gf.length === 1 && JSON.stringify(gf[0].b.reply_markup).includes('mkm') && JSON.parse(kvStore.get('tg:555:alerts')).length === 2, sent.map(x => (x.b.text || '').slice(0, 40))); }
market.metals.find(x => x.k === 'gold').price = 2650; kvStore.set('tg:555:alerts', '[]');
// what-if
claudeCalls.length = 0; Wk = await fresh(); await postK(Wk, 'what if btc hits 100k');
const wi = claudeCalls[1] && claudeCalls[1].messages.at(-1).content.map(r => JSON.parse(r.content));
check('what_if BTC $100,000: value +$2,300 (0.1 BTC × $23,000), profit up by the same', wi && wi[0].change_usd === 2300 && Math.round(wi[0].all_time_profit_after_usd - wi[0].all_time_profit_now_usd) === 2300 && wi[0].changed_coins[0].ticker === 'BTC' && wi[0].changed_coins[0].price_then === 100000, wi && wi[0]);
check('what_if SOL −20% + sell half (5 SOL at $120 → $600 cash, −$200 vs avg $160) + buy $110 LINK: value change = −$300 (only the price move)', wi[1].cash_from_sells_usd === 600 && wi[1].realized_profit_from_sells_usd === -200 && wi[1].change_usd === -300 && wi[1].new_money_usd === 110 && wi[1].trades.find(t => t.buy === 'LINK').amount === 10, wi[1]);
check('what_if LINK $26 → the exit plan\'s TP1 ($25) would be reached', wi[2].exit_take_profits_reached.length === 1 && wi[2].exit_take_profits_reached[0].coin === 'LINK' && wi[2].exit_take_profits_reached[0].tp === 1, wi[2].exit_take_profits_reached);
check('wrangler.toml runs the alerts every 5 minutes', /crons = \["\*\/5 \* \* \* \*"\]/.test(fs.readFileSync(path.join(ROOT, 'tools/worker/wrangler.toml'), 'utf8')));

// ── 🎙️ voice notes → Whisper (Workers AI binding) → answered as if typed ──
const aiRuns = []; let HEARD = 'what is the price of SOL?', AI_FAIL = false;
let VLANG = 'en', VPROB = 0.95, VFORCED = null;   // what Whisper "detects", and (unsure case) what each forced language gives
const ENVV = { ...ENV, AI: { run: async (model, inp) => { aiRuns.push({ model, inp }); if (AI_FAIL) throw new Error('3010: bad audio');
  if (inp.language && VFORCED) return { text: VFORCED[inp.language][0], segments: [{ avg_logprob: VFORCED[inp.language][1] }] };
  return { text: HEARD, word_count: 6, transcription_info: { language: /[\u0600-\u06FF]/.test(HEARD) ? 'ar' : VLANG, language_probability: VPROB }, segments: [{ avg_logprob: -0.2 }] }; } } };
const voice = (v, env = ENVV) => post({ update_id: ++UPD, message: { message_id: 3, chat: { id: 555, type: 'private' }, from: { id: 555 }, voice: { file_id: 'VF1', duration: 5, mime_type: 'audio/ogg', file_size: 70000, ...v } } }, ENV.TG_SECRET, env);
await say('/new'); sent.length = 0; claudeCalls.length = 0; fileGets.length = 0; await voice();
const vm = sent.filter(x => x.m === 'sendMessage' || x.m === 'editMessageText');
check('voice → "🎙️ Listening…" at once', vm[0] && vm[0].m === 'sendMessage' && /^🎙️ (Listening|أستمع)…$/.test(vm[0].b.text), vm.map(x => x.b.text));
check('…the file is fetched from Telegram (getFile, then the download)', sent.some(x => x.m === 'getFile' && x.b.file_id === 'VF1') && fileGets.length === 1 && fileGets[0].endsWith('/voice/file_9.oga'), fileGets);
check('…Whisper turbo: first finds the language (no hint), then the whole note again in English with the English crypto words', aiRuns.length === 2 && aiRuns[0].model === '@cf/openai/whisper-large-v3-turbo' && aiRuns[0].inp.audio === Buffer.from(VOICE_BYTES).toString('base64') && !aiRuns[0].inp.initial_prompt && !aiRuns[0].inp.language && aiRuns[1].inp.language === 'en' && /BTC/.test(aiRuns[1].inp.initial_prompt) && !/[\u0600-\u06FF]/.test(aiRuns[1].inp.initial_prompt), aiRuns.map(x => [x.inp.language, x.inp.initial_prompt]));
check('…that message becomes "🎙️ I heard: <i>…</i>" + "🧠 Thinking…" under it', vm[1] && vm[1].m === 'editMessageText' && vm[1].b.message_id === 7 && /^🎙️ (I heard:|سمعت:) <i>what is the price of SOL\?<\/i>\n🧠 (Thinking|أفكر)…$/.test(vm[1].b.text) && okHtml(vm[1].b.text), vm[1] && vm[1].b.text);
check('…then answered by Claude exactly like the typed question (tools called, answer about SOL)', claudeCalls.length === 2 && claudeCalls[0].messages.at(-1).content.startsWith('what is the price of SOL?') && /SOL<\/b> is \$/.test(last().b.text), [claudeCalls.length, last().b.text.slice(0, 80)]);
check('…all in ONE message: one sendMessage, the answer is an edit with "I heard" still on top + the buttons', sent.filter(x => x.m === 'sendMessage').length === 1 && last().m === 'editMessageText' && last().b.message_id === 7 && /^🎙️ (I heard:|سمعت:) <i>what is the price of SOL\?<\/i>\n\n<b>SOL/.test(last().b.text) && /left today|اليوم/.test(last().b.text) && btnTexts(last()).some(x => /SOL/.test(x)) && okHtml(last().b.text), [sent.map(x => x.m), last().b.text.slice(0, 90)]);
HEARD = 'sol'; sent.length = 0; claudeCalls.length = 0; await voice();
check('voice "sol" → the SOL card in the same message, under "I heard" (no Claude, no question used)', claudeCalls.length === 0 && sent.filter(x => x.m === 'sendMessage').length === 1 && last().m === 'editMessageText' && /^🎙️ (I heard:|سمعت:) <i>sol<\/i>\n\n/.test(last().b.text) && /SOL/.test(last().b.text) && btnTexts(last()).some(x => /Liq Map|خريطة التصفيات/.test(x)), [sent.map(x => x.m), last().b.text.slice(0, 60)]);
HEARD = 'my alerts'; sent.length = 0; claudeCalls.length = 0; await voice();
check('voice "alerts"-like words that are a question → still one message (to Claude)', sent.filter(x => x.m === 'sendMessage').length === 1, sent.map(x => x.m));
HEARD = '/alerts'; sent.length = 0; await voice();
check('voice that is a list command → "I heard" stays, the list comes as its own message', out().some(x => x.m === 'editMessageText' && /^🎙️ (I heard:|سمعت:) <i>\/alerts<\/i>$/.test(x.b.text)) && /alerts|تنبيه/i.test(last().b.text) && last().m === 'sendMessage', out().map(x => x.m + ' ' + x.b.text.slice(0, 40)));
HEARD = 'ممكن تنبهني لو سولانا نزلت تحت 82'; sent.length = 0; claudeCalls.length = 0; await voice();
check('Arabic voice → "سمعت / I heard" in Arabic letters, then to Claude', out().some(x => /ممكن تنبهني لو سولانا نزلت تحت 82/.test(x.b.text)) && claudeCalls.length >= 1, out().map(x => x.b.text.slice(0, 50)));
HEARD = 'tell <b>me</b> & go'; sent.length = 0; await voice();
check('heard text with < & is escaped (Telegram accepts it)', out().some(x => /I heard:|سمعت:/.test(x.b.text) && okHtml(x.b.text) && x.b.text.includes('&lt;b&gt;')), out().map(x => x.b.text.slice(0, 60)));
HEARD = ' . '; sent.length = 0; claudeCalls.length = 0; await voice();
check('silence / no words → "couldn\'t make out any words", nothing asked', /make out|لم أسمع/.test(last().b.text) && claudeCalls.length === 0, last().b.text);
AI_FAIL = true; sent.length = 0; await voice(); AI_FAIL = false;
check('Whisper fails → "couldn\'t read that voice note", no crash', /read that voice|لم أستطع قراءة/.test(last().b.text), last().b.text);
sent.length = 0; aiRuns.length = 0; fileGets.length = 0; await voice({ duration: 300 });
check('a 5-minute note → "up to 2 min", nothing downloaded', /2 min|2 دقيقة/.test(last().b.text) && aiRuns.length === 0 && fileGets.length === 0, last().b.text);
sent.length = 0; await voice({}, ENV);
check('Worker without the AI binding → says so, asks to type it', /AI binding/.test(last().b.text), last().b.text);
sent.length = 0; await post({ update_id: ++UPD, message: { message_id: 4, chat: { id: 999 }, voice: { file_id: 'X', duration: 3 } } }, ENV.TG_SECRET, ENVV);
check('a voice note from another chat → ignored', sent.length === 0);
sent.length = 0; aiRuns.length = 0; await post({ update_id: ++UPD, message: { message_id: 5, chat: { id: 555 }, audio: { file_id: 'AU1', duration: 20, file_size: 300000 } } }, ENV.TG_SECRET, ENVV);
check('an audio file (not a voice note) is understood too', aiRuns.length >= 1 && sent.some(x => x.m === 'getFile' && x.b.file_id === 'AU1'));
// the note that came back as Arabic letters + Russian ("… 24 час"): Whisper unsure → English and Arabic both, the surer one wins
HEARD = 'تبهني لقوضية كيفية كوين في 24 час'; VLANG = 'ru'; VPROB = 0.41; VFORCED = { en: ['Notify me for liquidation of KAVA coin in 24 hours.', -0.25], ar: ['نبهني لتصفية كافا كوين في 24 ساعة', -0.9] };
sent.length = 0; aiRuns.length = 0; claudeCalls.length = 0; await voice();
check('Whisper unsure (another script, low probability) → tries English and Arabic, keeps the surer one (English)', aiRuns.length === 3 && aiRuns.slice(1).map(x => x.inp.language).sort().join() === 'ar,en' && out().some(x => /I heard:|سمعت:/.test(x.b.text) && /Notify me for liquidation of KAVA/.test(x.b.text)), out().map(x => x.b.text.slice(0, 80)));
VFORCED = { en: ['Wait hold on there', -1.4], ar: ['نبّهني لو سولانا نزلت تحت 80', -0.3] }; sent.length = 0; aiRuns.length = 0; await voice();
check('…and when the Arabic one is surer, Arabic wins', out().some(x => /نبّهني لو سولانا نزلت تحت 80/.test(x.b.text)));
VFORCED = { en: ['Привет как дела', -0.1], ar: ['نبهني لو بيتكوين نزل', -0.8] }; sent.length = 0; aiRuns.length = 0; await voice();
check('…never one in another script (Cyrillic), even if Whisper is surer of it', out().some(x => /نبهني لو بيتكوين نزل/.test(x.b.text)) && !out().some(x => /Привет/.test(x.b.text)));
HEARD = 'نبّهني لو ETH نزل تحت 2000'; VLANG = 'ar'; VPROB = 0.97; VFORCED = null; sent.length = 0; aiRuns.length = 0; await voice();
check('sure it is Arabic → again in Arabic with the Arabic hint', aiRuns.length === 2 && aiRuns[1].inp.language === 'ar' && /نبّهني/.test(aiRuns[1].inp.initial_prompt));
VLANG = 'en'; VPROB = 0.95; HEARD = 'what is the price of SOL?';
check('wrangler.toml has the AI binding for voice', /\[ai\]\s*\nbinding = "AI"/.test(fs.readFileSync(path.join(ROOT, 'tools/worker/wrangler.toml'), 'utf8')));

// ── an old market snapshot (GitHub ran its schedule late) + CoinGecko busy → the coin asked about is priced live by the exchanges ──
market.parts = { top: new Date(NOW - 70 * 60e3).toISOString() }; cgDown = true; EXLIVE = { SOLUSDT: [95.5, 2.5], BTCUSDT: [78100, 1.4], LINKUSDT: [900, 1] };
sent.length = 0; Wk = await fresh(); await postK(Wk, 'sol');
check('old snapshot → the SOL card shows the exchange price ($95.5, Binance)', /95\.5/.test(last().b.text) && /Binance/.test(last().b.text), last().b.text.slice(0, 200));
sent.length = 0; Wk = await fresh(); await postK(Wk, 'link');
check('…but a price far from the snapshot\'s (another coin with that ticker) is never used', !/\$900/.test(last().b.text) && /LINK/.test(last().b.text), last().b.text.slice(0, 200));
sent.length = 0; claudeCalls.length = 0; Wk = await fresh(); await postK(Wk, 'what is the price of SOL?');
check('…and Claude\'s get_coin gets the live price + says where it came from', /\$95\.5/.test(last().b.text) && /Binance \(live\)/.test(last().b.text), last().b.text.slice(-200));
BN403 = true; bnCalls = 0; sent.length = 0; Wk = await fresh(); await postK(Wk, 'sol');
check('Binance refuses Cloudflare (403) → OKX gives the SOL price ($96.1)', /96\.1/.test(last().b.text) && /OKX/.test(last().b.text) && bnCalls >= 1, [bnCalls, last().b.text.slice(0, 120)]);
const bn1 = bnCalls; sent.length = 0; await postK(Wk, 'sol'); await postK(Wk, 'link');
check('…and Binance is left out after that (no more calls to it for 30 min)', bnCalls === bn1, [bn1, bnCalls]);
BN403 = false;
market.parts = { top: new Date(NOW - 12 * 60e3).toISOString() }; EXLIVE = {}; sent.length = 0; Wk = await fresh(); await postK(Wk, 'sol');
check('a fresh snapshot (12 min) → no exchange call needed, snapshot price', !/Binance/.test(last().b.text), last().b.text.slice(0, 200));
cgDown = false;

// ── 🧾 phase 4: trades in words → summary → ✅ Confirm / ❌ Cancel → Firestore (only on Confirm) ──
const tapM = (data, markup) => post({ update_id: ++UPD, callback_query: { id: 'qt', data, from: { id: 555 }, message: { message_id: 42, chat: { id: 555 }, reply_markup: markup } } });
await tap('lang:en');   // (the chat's language decides the bot's own words: the summary and its buttons)
await say('/new'); sent.length = 0; claudeCalls.length = 0; await say('I bought 5 SOL at 140 with USDT');
let tv = last(), tb = btns(tv);
check('trade → the bot\'s own summary: Buy 5 SOL @ $140 = $700, paid with USDT, SOL 10 → 15, avg $160 → $153.33', /🧾/.test(tv.b.text) && /Buy 5 SOL<\/b> @ \$140\.00 = <b>\$700\.00<\/b>/.test(tv.b.text) && /paid with USDT −\$700\.00/.test(tv.b.text) && /SOL 10 → <b>15<\/b>/.test(tv.b.text) && /avg \$160\.00 → <b>\$153\.33<\/b>/.test(tv.b.text) && okHtml(tv.b.text), tv.b.text);
check('…with ✅ Confirm / ❌ Cancel as the first row, and NOTHING saved yet', tb[0].text === '✅ Confirm' && /^tx:ok:\w+$/.test(tb[0].callback_data) && tb[1].text === '❌ Cancel' && commits.length === 0, [tb.map(b => b.text), commits.length]);
check('…Claude was told it is NOT saved (and to say tap Confirm)', JSON.stringify(claudeCalls[1].messages.at(-1).content).includes('NOT saved yet'));
const markup = tv.b.reply_markup; sent.length = 0; outside = 0; await tapM(tb[0].callback_data, markup);
const confirmCalls = outside;
const cw = commits[0] && commits[0].writes, f = w => w.update.fields;
check('✅ → ONE all-or-nothing write of 2 docs (the Buy + USDT out at $1, kind pay, linked), never overwriting', commits.length === 1 && cw.length === 2 && cw.every(w => w.currentDocument && w.currentDocument.exists === false) && /\/users\/UID1\/txs\/tx_\d+_\w+$/.test(cw[0].update.name), commits);
check('…the Buy doc = the app\'s txDoc (sym, type, qty, price, total, date, createdAt, note, device telegram-bot)', f(cw[0]).sym.stringValue === 'SOL' && f(cw[0]).type.stringValue === 'buy' && f(cw[0]).qty.integerValue === '5' && f(cw[0]).price.integerValue === '140' && f(cw[0]).total.integerValue === '700' && f(cw[0]).device.stringValue === 'telegram-bot' && !isNaN(Date.parse(f(cw[0]).date.stringValue)) && 'createdAt' in f(cw[0]) && 'note' in f(cw[0]), f(cw[0]));
check('…the USDT doc: sell 700 @ $1, kind pay, link = the Buy\'s id, 1 ms later', f(cw[1]).sym.stringValue === 'USDT' && f(cw[1]).type.stringValue === 'sell' && f(cw[1]).qty.integerValue === '700' && f(cw[1]).kind.stringValue === 'pay' && f(cw[1]).link.stringValue === cw[0].update.name.split('/').pop() && Date.parse(f(cw[1]).date.stringValue) === Date.parse(f(cw[0]).date.stringValue) + 1, f(cw[1]));
check('…the buttons go at once (✅/❌ removed, the others kept) and "Saved" + SOL now 15 · avg $153.33 (read back from Firestore)', sent[0].m === 'editMessageReplyMarkup' && !JSON.stringify(sent[0].b.reply_markup).includes('tx:') && sent[0].b.reply_markup.inline_keyboard.length === markup.inline_keyboard.length - 1 && /Saved the trade/.test(last().b.text) && /SOL now: <b>15<\/b> · avg \$153\.33/.test(last().b.text), [sent.map(x => x.m), last().b.text]);
check('…✅ stays well inside Cloudflare\'s 50 calls (portfolio read once, no second read)', confirmCalls <= 20, confirmCalls);
sent.length = 0; await tapM(tb[0].callback_data, markup);
check('✅ tapped again → "already saved or cancelled", nothing written twice', commits.length === 1 && /already saved or cancelled|حُفظت أو أُلغيت/.test(last().b.text), last().b.text);
sent.length = 0; claudeCalls.length = 0; await say('I sold 20 LINK at 18');
tv = last(); tb = btns(tv);
check('a sell: date 10 Nov, fee $1, realized +$59 ((18−15)×20 − 1), LINK 50 → 30', /Sell 20 LINK<\/b> @ \$18\.00 = <b>\$360\.00<\/b>/.test(tv.b.text) && /10 Nov/.test(tv.b.text) && /fee \$1\.00/.test(tv.b.text) && /Realized: <b>\+\$59\.00<\/b>/.test(tv.b.text) && /LINK 50 → <b>30<\/b>/.test(tv.b.text), tv.b.text);
sent.length = 0; await tapM(tb[1].callback_data, tv.b.reply_markup);
check('❌ → cancelled, nothing written; ✅ after that does nothing', /Cancelled/.test(last().b.text) && commits.length === 1, last().b.text);
sent.length = 0; await tapM(tb[0].callback_data, tv.b.reply_markup);
check('…(✅ after ❌ → already cancelled)', commits.length === 1 && /already saved or cancelled|حُفظت أو أُلغيت/.test(last().b.text));
sent.length = 0; claudeCalls.length = 0; await say('I sold 999 SOL at 150');
const errs = claudeCalls[1].messages.at(-1).content.map(r => JSON.parse(r.content).error);
check('checks: sell more than held / a coin not held / no price / a price 100× off / a future date → errors, no buttons', /only 15 SOL held/.test(errs[0]) && /DOGE is not in the portfolio/.test(errs[1]) && /price is missing/.test(errs[2]) && /far from today/.test(errs[3]) && /future/.test(errs[4]) && !btns(last()).some(b => /^tx:/.test(b.callback_data || '')), errs);
sent.length = 0; claudeCalls.length = 0; await say('two buys please');
tv = last(); tb = btns(tv);
check('two trades in one message → numbered, "✅ Confirm all 2"; at-market BTC ($770 at $77,000 = 0.01 BTC); LINK 10 for $120 = $12 each', /1\. 🟢/.test(tv.b.text) && /2\. 🟢/.test(tv.b.text) && /Buy 0\.01 BTC<\/b> @ \$77,000/.test(tv.b.text) && /Buy 10 LINK<\/b> @ \$12\.00/.test(tv.b.text) && tb[0].text === '✅ Confirm all 2', [tv.b.text, tb.map(b => b.text)]);
FS_WRITE_403 = true; sent.length = 0; await tapM(tb[0].callback_data, tv.b.reply_markup); FS_WRITE_403 = false;
check('Firestore refuses the write (read-only account) → "Not saved" + how to fix it (Cloud Datastore User)', /Not saved/.test(last().b.text) && /Cloud Datastore User/.test(last().b.text) && commits.length === 1, last().b.text);
await tap('lang:ar');
sent.length = 0; claudeCalls.length = 0; await say('I sold 20 LINK at 18');
tv = last(); tb = btns(tv);
check('🌐 an Arabic chat, the trade typed in English → the bot\'s own summary, its date and its buttons are still Arabic (never an English summary over Arabic buttons)', /للحفظ/.test(tv.b.text) && /بيع 20 LINK<\/b> بسعر \$18\.00/.test(tv.b.text) && /التاريخ: 10 نوفمبر/.test(tv.b.text) && !/To save|Sell 20|10 Nov/.test(tv.b.text) && tb[0].text === '✅ تأكيد' && tb[1].text === '❌ إلغاء', [tv.b.text, tb.map(b => b.text)]);
sent.length = 0; await tapM(tb[1].callback_data, tv.b.reply_markup);
sent.length = 0; claudeCalls.length = 0; await say('بعت i sold 20 link بـ 18');
tv = last(); tb = btns(tv);
check('Arabic message → the summary + buttons in Arabic (بيع … ربح محقق, ✅ تأكيد)', /للحفظ/.test(tv.b.text) && /بيع 20 LINK<\/b> بسعر \$18\.00/.test(tv.b.text) && /الكمية: من 50 إلى <b>30<\/b> LINK/.test(tv.b.text) && /ربح محقق/.test(tv.b.text) && !/→/.test(tv.b.text) && tb[0].text === '✅ تأكيد', [tv.b.text, tb.map(b => b.text)]);
sent.length = 0; await tapM(tb[1].callback_data, tv.b.reply_markup);
check('…❌ answered in Arabic too', /أُلغيت/.test(last().b.text), last().b.text);
// 15 minutes later → nothing saved
const Wt = await fresh(); sent.length = 0; claudeCalls.length = 0; await postK(Wt, 'I sold 20 LINK at 18');
const tkey = [...kvStore.keys()].find(k => k.startsWith('tg:tx:')), tg0 = JSON.parse(kvStore.get(tkey)); tg0.created -= 16 * 60e3; kvStore.set(tkey, JSON.stringify(tg0));
await Wt.fetch(new Request(HOST + '/tg', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': ENV.TG_SECRET }, body: JSON.stringify({ update_id: ++UPD, callback_query: { id: 'qx', data: 'tx:ok:' + tkey.slice(6), message: { message_id: 9, chat: { id: 555 } } } }) }), ENVK, {});
check('a trade confirmed after 15 min → "Over 15 minutes old", nothing saved', /15 (minutes|دقيقة)/.test(last().b.text) && commits.length === 1, last().b.text);

// ── 🗓 phase 5: smart morning / evening, radars, the live pinned message (the 5-minute cron) ──
market.sectors = [{ id: 'artificial-intelligence', name: 'AI', mcap: 5e10, ch24: 14.2, top: ['solana', 'x1', 'x2'] }, { id: 'meme-token', name: 'Meme', mcap: 3e10, ch24: -11.5, top: ['dogecoin'] }, { id: 'small', name: 'Tiny', mcap: 2e8, ch24: 40, top: [] }, { id: 'calm', name: 'Calm', mcap: 9e10, ch24: 2, top: [] }];
for (const k of [...kvStore.keys()]) if (/^tg:555:(daily|snap|pin|radar|sector|log)/.test(k)) kvStore.delete(k);
LIVE.pendle.usd = 3.05;   // 1.7% above the buy-price alert ($3) → a morning task
let Wd = await fresh(); sent.length = 0; composeCalls.length = 0; await cron(Wd, RIYADH('08:45'));
let mm = sent.find(x => x.m === 'sendMessage');
check('08:45 Riyadh → ☀️ Smart morning (Claude writes it from the facts: no tools, not counted)', mm && /☀️ <b>(Smart morning|الصباح الذكي)<\/b>/.test(mm.b.text) && /Calm day/.test(mm.b.text) && composeCalls.length === 1 && !composeCalls[0].tools && okHtml(mm.b.text), mm && mm.b.text);
const mf = JSON.parse(composeCalls[0].messages[0].content.replace(/^FACTS:\n/, ''));
check('…its facts: the portfolio (= summarize), the market, and today\'s tasks (PENDLE 1.7% above your $3 buy price)', mf.portfolio.value_usd > 0 && mf.market.btc_usd > 0 && mf.todo.some(x => x.what === 'near_buy_price' && x.coin === 'PENDLE' && x.your_buy_price_usd === 3 && Math.abs(x.pct_above_buy_price - 1.67) < 0.01), mf.todo);
check('…a snapshot is kept for the evening', !!kvStore.get('tg:555:snap:' + new Date(NOW + 3 * HR).toISOString().slice(0, 10)));
sent.length = 0; await cron(Wd, RIYADH('09:00')); await cron(Wd, RIYADH('10:20'));
check('…sent once a day (later runs: nothing; 09:00 is a pinned-message slot → that one only)', !sent.some(x => x.m === 'sendMessage' && /Smart morning|الصباح الذكي/.test(x.b.text)), sent.map(x => x.m));
// (the snapshot's funding is "15 minutes old" at the evening's own hour: with the real clock's time, this check failed
//  whenever the test ran more than 6 hours before 21:00 Riyadh — and this test is the Worker's deploy gate)
const fundAt = market.funding.at; market.funding.at = new Date(RIYADH('21:00') - 15 * 60e3).toISOString();
LIVE.solana.usd = 140; Wd = await fresh(); sent.length = 0; composeCalls.length = 0; await cron(Wd, RIYADH('21:00')); market.funding.at = fundAt;
const em = sent.find(x => x.m === 'sendMessage' && /🌙/.test(x.b.text)), ef = composeCalls[0] && JSON.parse(composeCalls[0].messages[0].content.replace(/^FACTS:\n/, ''));
check('21:00 → 🌙 Smart evening: since the morning −$150 (SOL 150 → 140 × 15 — 5 bought above), BTC futures, sectors, closest levels', em && ef && ef.since_morning && Math.round(ef.since_morning.portfolio_change_usd) === -150 && ef.btc_futures !== undefined && ef.sectors_24h && ef.sectors_24h.best[0].name === 'AI' && Array.isArray(ef.closest_levels), ef && { s: ef.since_morning, sec: ef.sectors_24h });
check('…the evening\'s BTC funding is the market\'s own line (the number /market shows), with what it is made of', ef && ef.btc_futures.funding_8h_pct === 0.0044 && ef.btc_futures.funding_reading === 'Calm — at or under the resting rate' && ef.btc_futures.funding_from === '5 venues weighted by open interest, without Binance and Bybit', ef && ef.btc_futures);
{ const { radarFindings } = await import('../tools/worker/daily.mjs'), f = r => radarFindings({ funding_8h_pct_avg: r }).join();
  check('🧲 the radar words funding like every other place: crowded longs at or over +0.03% per 8 h, crowded shorts at or under −0.01%', f(0.03) === 'hot_longs' && f(0.0299) === '' && f(0.0101) === '' && f(0.004) === '' && f(-0.0099) === '' && f(-0.01) === 'hot_shorts' && radarFindings({ funding_annualized_pct: 40 }).join() === 'hot_longs' && radarFindings({ funding_annualized_pct: -11 }).join() === 'hot_shorts' && radarFindings({}).join() === '', [f(0.03), f(-0.01)]); }
LIVE.solana.usd = 150;
for (const k of [...kvStore.keys()]) if (/^tg:555:daily:sent/.test(k)) kvStore.delete(k);
COMPOSE_FAIL = true; Wd = await fresh(); sent.length = 0; await cron(Wd, RIYADH('08:50')); COMPOSE_FAIL = false;
mm = sent.find(x => x.m === 'sendMessage');
check('Claude busy → the bot\'s own plain morning (value, 3 tasks, BTC) — still sent', mm && /☀️/.test(mm.b.text) && /PENDLE/.test(mm.b.text) && /BTC/.test(mm.b.text) && okHtml(mm.b.text), mm && mm.b.text);
for (const k of [...kvStore.keys()]) if (/^tg:555:daily:sent/.test(k)) kvStore.delete(k);
sent.length = 0; outside = 0; Wd = await fresh(); await cron(Wd, RIYADH('23:55'));
check('…the evening run (portfolio + market + BTC futures + Claude) stays inside Cloudflare\'s 50 calls with Telegram', outside + sent.length <= 45, [outside, sent.length]);
check('evening window wraps fine: 23:55 (2 h 55 late) still sends it', sent.some(x => x.m === 'sendMessage' && /🌙/.test(x.b.text)));
// 📌 pinned
for (const k of [...kvStore.keys()]) if (/^tg:555:daily:sent/.test(k)) kvStore.set(k, JSON.stringify({ morning: new Date(NOW + 3 * HR).toISOString().slice(0, 10), evening: new Date(NOW + 3 * HR).toISOString().slice(0, 10) }));
kvStore.delete('tg:555:pin'); sent.length = 0; Wd = await fresh(); await cron(Wd, RIYADH('12:15'));
const pm = sent.find(x => x.m === 'sendMessage');
check('📌 :15 → the live message sent silently and pinned (value, BTC, plan, exit, alerts)', pm && /📌/.test(pm.b.text) && pm.b.disable_notification === true && sent.some(x => x.m === 'pinChatMessage' && x.b.disable_notification === true) && /BTC/.test(pm.b.text) && okHtml(pm.b.text), sent.map(x => x.m));
sent.length = 0; await cron(Wd, RIYADH('12:30'));
check('…15 min later, nothing changed → not redrawn (no Telegram call at all)', sent.length === 0, sent.map(x => x.m));
LIVE.bitcoin.usd = 78000; Wd = await fresh(); sent.length = 0; await cron(Wd, RIYADH('12:45')); LIVE.bitcoin.usd = 77000;
check('…a number changed → the same message is edited (not a new one)', sent.length === 1 && sent[0].m === 'editMessageText' && sent[0].b.message_id === 7 && /78,000/.test(sent[0].b.text), sent.map(x => x.m));
// 🧲 radar: BTC, then SOL (your biggest coins), one per run — kept for the 📡 digest (12:00 · 16:00 · 20:00), no message of its own
HOT = true; Wd = await fresh(); sent.length = 0; await cron(Wd, RIYADH('13:10')); await cron(Wd, RIYADH('13:40'));
check('🧲 :10 / :40 → one coin each (BTC, then SOL): SOL funding hot → kept for the digest, NO message now', !sent.some(x => x.m === 'sendMessage') && JSON.parse(kvStore.get('tg:555:digest')).lev.SOL.finds.includes('hot_longs'), [sent.map(x => x.m), kvStore.get('tg:555:digest')]);
sent.length = 0; for (const hm of ['14:10', '14:40', '15:10', '15:40']) { Wd = await fresh(); await cron(Wd, RIYADH(hm)); }
check('…the next rounds stay quiet too', !sent.some(x => x.m === 'sendMessage'), sent.filter(x => x.m === 'sendMessage').map(x => x.b.text.slice(0, 40)));
HOT = false;
market.whales = { t: new Date(RIYADH('15:00')).toISOString(), src: 'Hyperliquid', n: 25, coins: { BTC: { long: 14, short: 6, longUsd: 3.1e8, shortUsd: 1.2e8, side: 'long' }, SOL: { long: 3, short: 9, longUsd: 2e7, shortUsd: 9e7, side: 'short', was: 'long', flipT: new Date(RIYADH('15:00')).toISOString() }, DOGE: { long: 1, short: 1, longUsd: 1e5, shortUsd: 1e5, side: 'mixed' } } };
sent.length = 0; Wd = await fresh(); await cron(Wd, RIYADH('16:05'));
const dgm = sent.find(x => x.m === 'sendMessage' && /📡/.test(x.b.text));
check('📡 16:05 → ONE radar digest: 🧲 SOL "Crowded longs" with its numbers + Liq Map', sent.filter(x => x.m === 'sendMessage').length === 1 && dgm && /Radar digest<\/b> · 16:00/.test(dgm.b.text) && /<b>SOL<\/b>: .*Crowded longs/.test(dgm.b.text) && /Funding \+/.test(dgm.b.text) && btns(dgm).some(b => /Liq Map/.test(b.text)) && okHtml(dgm.b.text), dgm && dgm.b.text);
check('…🐋 whales: the 25 biggest winning traders — BTC 14 long · 6 short ($310M vs $120M), SOL flipped long → short; a coin with too few traders left out; "not financial advice"', dgm && /the 25 biggest winning traders on Hyperliquid/.test(dgm.b.text) && /<b>BTC<\/b>: 14 long · 6 short — \$310M vs \$120M/.test(dgm.b.text) && /<b>SOL<\/b>: 3 long · 9 short — \$20M vs \$90M · 🔄 flipped long → short/.test(dgm.b.text) && !/DOGE/.test(dgm.b.text) && /Not financial advice/.test(dgm.b.text), dgm && dgm.b.text);
sent.length = 0; Wd = await fresh(); await cron(Wd, RIYADH('16:20'));
check('…once per slot (16:20 → nothing)', !sent.some(x => x.m === 'sendMessage'));
// 🔥 sectors → the next digest
sent.length = 0; Wd = await fresh(); await cron(Wd, RIYADH('16:25')); await cron(Wd, RIYADH('17:25'));
check('🔥 :25 hourly → sectors ≥ $1B moving ≥ 10% are kept for the digest (no message now)', !sent.some(x => x.m === 'sendMessage') && Object.keys(JSON.parse(kvStore.get('tg:555:digest')).sec || {}).length === 2, kvStore.get('tg:555:digest'));
sent.length = 0; Wd = await fresh(); await cron(Wd, RIYADH('20:05'));
const secm = sent.find(x => x.m === 'sendMessage' && /📡/.test(x.b.text));
check('📡 20:05 → the digest: AI +14.2% (you hold its leader SOL) and Meme −11.5%; tiny / calm ones left out; no 🧲 part (nothing new)', secm && /AI<\/b> \+14\.2%/.test(secm.b.text) && /you hold: <b>SOL<\/b>/.test(secm.b.text) && /Meme<\/b> −11\.5%/.test(secm.b.text) && !/Tiny|Calm/.test(secm.b.text) && !/🧲/.test(secm.b.text) && okHtml(secm.b.text), secm && secm.b.text);
kvStore.delete('tg:555:daily:sent'); sent.length = 0; Wd = await fresh(); await cron(Wd, RIYADH('12:05'));
check('…a slot with nothing found and no whale flip → no message at all', !sent.some(x => x.m === 'sendMessage' && /📡/.test(x.b.text)), sent.filter(x => x.m === 'sendMessage').map(x => x.b.text.slice(0, 50)));
// 🕌 zakat: a reminder a week before your zakat day (a hijri day chosen in the app), and the amounts on the day itself
{
  const hj = t => { const o = {}; new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Asia/Riyadh' }).formatToParts(new Date(t)).forEach(p => { o[p.type] = parseInt(p.value, 10); }); return o; };
  const at = RIYADH('10:00'), td = hj(at), wk = hj(at + 7 * 24 * HR), again = () => { const d = JSON.parse(kvStore.get('tg:555:daily:sent') || '{}'); delete d.zk; d.morning = new Date(NOW + 3 * HR).toISOString().slice(0, 10); kvStore.set('tg:555:daily:sent', JSON.stringify(d)); kvStore.delete('fs:pf:UID1'); };   // (the portfolio kept in KV: read again, with the new zakat day)
  const zmsg = () => sent.find(x => x.m === 'sendMessage' && /🕌/.test(x.b.text));
  globalThis.__zakatDay = { m: wk.month, d: wk.day }; again(); kvStore.delete('tg:555:zakat:sent'); globalThis.__alertsLang = [];
  sent.length = 0; Wd = await fresh(); await cron(Wd, at);
  check('🕌 a week before your zakat day (10:00) → one reminder: the day, the crypto against the value of 85 g of gold, an estimate, "not a ruling"', zmsg() && /zakat day is in 7 days/.test(zmsg().b.text) && new RegExp(wk.day + ' ').test(zmsg().b.text) && /Crypto: /.test(zmsg().b.text) && /check with a scholar/.test(zmsg().b.text) && okHtml(zmsg().b.text), zmsg() ? zmsg().b.text : sent.map(x => x.m));
  check('…no value kept yet (that is for the day itself)', !(globalThis.__alertsLang || []).some(w => /fieldPaths=zakat/.test(w.u)));
  again(); sent.length = 0; Wd = await fresh(); await cron(Wd, at + 30 * 60e3);
  check('…once (asked again → nothing)', !zmsg(), zmsg() && zmsg().b.text);
  globalThis.__zakatDay = { m: td.month, d: td.day }; again();
  sent.length = 0; Wd = await fresh(); await cron(Wd, at);
  const zw = (globalThis.__alertsLang || []).find(w => /fieldPaths=zakat$/.test(w.u));
  check('🕌 on the day → "Today is your zakat day" with the amounts (2.5%), a button to the app', zmsg() && /Today is your zakat day/.test(zmsg().b.text) && new RegExp(String(td.year)).test(zmsg().b.text) && /Crypto: (<b>\$[\d,.]+<\/b> — 2\.5% of|below the nisab)/.test(zmsg().b.text) && btns(zmsg()).some(b => b.web_app) && okHtml(zmsg().b.text), zmsg() ? zmsg().b.text : sent.map(x => x.m));
  check('…and the day\'s crypto value + the nisab are kept in your settings (only the "zakat" field), for the app', zw && zw.body.fields.zakat.mapValue.fields.hy.integerValue === String(td.year) && +(zw.body.fields.zakat.mapValue.fields.nisabUsd.doubleValue || zw.body.fields.zakat.mapValue.fields.nisabUsd.integerValue) > 7000 && Object.keys(zw.body.fields).join() === 'zakat', zw);
  globalThis.__zakatDay = { m: (td.month + 5) % 12 + 1, d: 15 }; again(); kvStore.delete('tg:555:zakat:sent'); sent.length = 0; Wd = await fresh(); await cron(Wd, at);
  check('…any other day → nothing', !zmsg(), zmsg() && zmsg().b.text);
  // 🧭 the money pool, as the app counts it: coins + a share (bStock) + cash & certificates at the official rate; shares switchable
  {
    const D = await import('../tools/worker/daily.mjs'), CORE = await import('../samsam-core.js');
    const m0 = { ...market, top: market.top || [], top500: Array.isArray(top500) ? top500 : (top500.rows || top500.top || []), idOf: {}, cgIds: {}, metals: market.metals, fx: { EGP: { rate: 50 }, SAR: { rate: 3.75 } } };
    const base = D.zakatFacts(USER(), m0, at);
    globalThis.__extraCoins = [{ sym: 'NVDAB', cgId: 'nvidia-bstock', opening: { qty: 10, avg: 150 }, lastPrice: 200 }];
    globalThis.__metaExtra = { cash: [{ id: 'c1', kind: 'cash', cur: 'EGP', amount: 250000, label: 'Bank' }, { id: 'c2', kind: 'cash', cur: 'USD', amount: 1000 }] };
    const withAll = D.zakatFacts(USER(), m0, at);
    check('🕌🧭 the bot\'s zakat pool: + the share ($2,000) + cash (250,000 EGP at 50 = $5,000, + $1,000), as the app', Math.abs(withAll.crypto - base.crypto - 2000 - 6000) < 0.01 && withAll.pool.stock === 2000 && withAll.pool.cash === 6000, [base.crypto, withAll.pool]);
    // 💼 the whole wealth in the bot: the summary, the portfolio view / brief line, and the AI's tools (get_portfolio → net_worth, get_zakat)
    {
      const AC = await import('../tools/alerts-core.mjs'), AI = await import('../tools/worker/ai.mjs'), DATA = await import('../tools/worker/data.mjs'), BOT = await import('../tools/worker/bot.mjs');
      const u1 = USER(), mm = { ...m0, live: {} }, s1 = AC.summarize(DATA.withIds(u1, mm), mm, at), w = s1.wealth;
      check('💼 summary.wealth: Net worth = portfolio + cash ($6,000), parts add up, the share is a share', w && Math.abs(w.cash - 6000) < 0.01 && Math.abs(w.total - s1.value - 6000) < 0.01 && Math.abs(Object.values(w.parts).reduce((a, b) => a + b, 0) - w.total) < 0.01 && w.parts.stock === 2000 && w.kindOf.NVDAB === 'share' && w.kindOf.BTC === 'crypto', w && [w.total, w.parts, w.kindOf]);
      check('🎯 the signal counts are coins only (the share is not counted as a Hold)', s1.counts.reinforce + s1.counts.sell + s1.counts.hold === s1.coins.filter(c => w.kindOf[c.sym] === 'crypto').length && s1.coins.some(c => w.kindOf[c.sym] !== 'crypto'), [s1.counts, w.kindOf]);
      const wp = AC.wealthParts(s1);
      check('💼 shares of the whole are rounded to add up to exactly 100', wp.reduce((a, r) => a + r.r, 0) === 100 && wp.some(r => r.k === 'cash'), wp);
      check('💼 "coins beat BTC" counts coins only (the share is not an altcoin)', s1.alts === s1.coins.filter(c => c.sym !== 'BTC' && w.kindOf[c.sym] === 'crypto' && c.vs).length, [s1.alts, s1.coins.map(c => c.sym)]);
      const en = AC.brief(s1, mm, { lang: 'en' }, at).text, ar = AC.brief(s1, mm, { lang: 'ar' }, at).text;
      check('☀️ the morning brief carries one Net worth line (EN + AR), right under the value', /🏦 Net worth <b>\$[\d,.]+<\/b>\n<i>.*cash \d+%/.test(en) && /🏦 صافي الثروة: <b>\$[\d,.]+<\/b>\n<i>.*النقد \d+%/.test(ar) && en.indexOf('🏦') < en.indexOf('All Time Profit'), en.slice(0, 400));
      const ctx = { env: {}, used: new Set(), coins: new Set(), user: async () => u1, market: async () => mm, sum: async () => ({ s: s1, m: mm }) };
      const gp = await AI.runTool(ctx, 'get_portfolio', {}), nv = gp.coins.find(c => c.ticker === 'NVDAB');
      check('🤖 get_portfolio → net_worth (total, parts with shares, cash items), portfolio numbers stay cash-free', gp.net_worth && Math.abs(gp.net_worth.total_usd - gp.total_value_usd - 6000) < 0.02 && gp.net_worth.parts.some(x => x.part === 'Cash & certificates' && x.usd === 6000) && gp.net_worth.cash_items.length === 2 && Math.abs(gp.net_worth.parts.reduce((a, x) => a + x.share_pct, 0) - 100) < 0.2, gp.net_worth);
      check('🤖 a share has kind "share" and no signal; coins keep theirs', nv && nv.kind === 'share' && /^none/.test(nv.signal) && gp.coins.find(c => c.ticker === 'BTC').kind === 'crypto' && !/^none/.test(gp.coins.find(c => c.ticker === 'BTC').signal), nv);
      const gz = await AI.runTool(ctx, 'get_zakat', {}), zf = D.zakatFacts(u1, mm, Date.now());
      check('🤖 get_zakat = the app\'s pool (crypto · metals · shares · cash), nisab, 2.5%, state and days left', gz.state === zf.y.state && gz.pool_parts_today_usd.cash_and_certificates === 6000 && gz.pool_parts_today_usd.shares === 2000 && Math.abs(gz.pool_today_usd - zf.pool.value) < 0.01 && gz.nisab_usd > 0 && Math.abs(gz.zakat_usd - zf.y.zakatUsd) < 0.01 && /not a fatwa/.test(gz.note) && /^\d+ \w/.test(gz.zakat_day) && gz.next_zakat_hijri_year === zf.y.nextHy && gz.hijri_year === (['due', 'paid', 'below'].includes(zf.y.state) ? zf.y.hy : zf.y.nextHy), gz);
      check('🤖 the AI is told: wealth from net_worth, signals for crypto only, zakat from get_zakat', AI.TOOLS.some(t => t.name === 'get_zakat'), AI.TOOLS && AI.TOOLS.map(t => t.name));
      globalThis.__metaExtra = {}; const s0 = AC.summarize(DATA.withIds(USER(), mm), mm, at);
      check('💼 no cash → no Net worth line (the brief stays as it was)', AC.wealthLine(s0, false) === null && !/🏦/.test(AC.brief(s0, mm, { lang: 'en' }, at).text));
      globalThis.__metaExtra = { cash: [{ id: 'c1', kind: 'cash', cur: 'EGP', amount: 250000, label: 'Bank' }, { id: 'c2', kind: 'cash', cur: 'USD', amount: 1000 }] };
    }
    globalThis.__metaExtra = { ...globalThis.__metaExtra, zakatStocks: false };
    const noSh = D.zakatFacts(USER(), m0, at);
    check('…shares switched off in the app → the bot leaves them out too', Math.abs(noSh.crypto - base.crypto - 6000) < 0.01 && noSh.pool.stocksCounted === false, noSh.pool);
    check('…and the bot\'s Signal for the share is Hold (learned from its coin)', CORE.assetClass('NVDAB') === 'stock' && CORE.signalFor({ sym: 'NVDAB', chg: -60, rules: { reinforce: -5, sell: -20 } }).action === 'hold');
    globalThis.__zakatDay = { m: td.month, d: td.day }; globalThis.__metaExtra = { ...globalThis.__metaExtra, zakatStocks: true }; again(); kvStore.delete('tg:555:zakat:sent'); sent.length = 0; Wd = await fresh(); await cron(Wd, at);
    check('…the day\'s message names the pool: "Crypto + shares + cash"', zmsg() && /Crypto \+ shares \+ cash: /.test(zmsg().b.text), zmsg() && zmsg().b.text);
    delete globalThis.__extraCoins; delete globalThis.__metaExtra;
  }
  // ✓ Paid: still due two weeks after the day (the day's pool kept) → a weekly reminder; marked paid in the app → none
  {
    const ago = hj(at - 14 * 24 * HR);
    globalThis.__zakatDay = { m: ago.month, d: ago.day };
    globalThis.__metaExtra = { zakat: { hy: ago.year, value: 50000, nisabUsd: 9000, date: '2026-01-01' } };
    again(); kvStore.delete('tg:555:zakat:sent'); sent.length = 0; Wd = await fresh(); await cron(Wd, at);
    check('🕌 14 days after the day, not marked paid → "still due": $1,250.00 (2.5% of $50,000 kept that day), tap ✓ Paid', zmsg() && /still due/.test(zmsg().b.text) && /\$1,250\.00/.test(zmsg().b.text) && /✓ Paid/.test(zmsg().b.text), zmsg() && zmsg().b.text);
    globalThis.__metaExtra = { ...globalThis.__metaExtra, zakatPaid: [{ hy: ago.year, paid: 1250, zakat: 1250, cur: 'USD', at: '2026-01-02' }] };
    again(); kvStore.delete('tg:555:zakat:sent'); sent.length = 0; Wd = await fresh(); await cron(Wd, at);
    check('…marked ✓ Paid in the app → no reminder', !zmsg(), zmsg() && zmsg().b.text);
    const D = await import('../tools/worker/daily.mjs');
    const m0 = { ...market, top: market.top || [], top500: Array.isArray(top500) ? top500 : (top500.rows || top500.top || []), idOf: {}, cgIds: {}, metals: [{ k: 'gold', price: 3000 }, { k: 'platinum', price: 1000 }], fx: {} };
    globalThis.__extraCoins = [{ sym: 'XPT', opening: { qty: 2, avg: 900 } }];
    const f = D.zakatFacts(USER(), m0, at);
    check('🕌 one pool: platinum ($2,000) is in it as metals; the year reads "paid"', f.pool.metal === 2000 && f.y.state === 'paid', [f.pool, f.y && f.y.state]);
    delete globalThis.__extraCoins; delete globalThis.__metaExtra;
  }
  delete globalThis.__zakatDay;
}
check('today\'s log keeps what happened (radar, sector) for the evening', /radar/.test(kvStore.get('tg:555:log:' + new Date(NOW + 3 * HR).toISOString().slice(0, 10)) || '') && /sector/.test(kvStore.get('tg:555:log:' + new Date(NOW + 3 * HR).toISOString().slice(0, 10)) || ''));
// /daily
Wd = await fresh(); sent.length = 0; await postK(Wd, '/daily');
let dyv = last();
check('/daily → the 5 switches (all ✅) + morning / evening now', /✅/.test(dyv.b.text) && btns(dyv).filter(b => /^dy:(morning|evening|radar|sectors|pin)$/.test(b.callback_data)).length === 5 && btns(dyv).some(b => b.callback_data === 'dy:now:m'), dyv.b.text);
await Wd.fetch(new Request(HOST + '/tg', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': ENV.TG_SECRET }, body: JSON.stringify({ update_id: ++UPD, callback_query: { id: 'qy', data: 'dy:radar', message: { message_id: 50, chat: { id: 555 } } } }) }), ENVK, {});
check('tap ⬜/✅ Leverage radar → off, the list redrawn in place', JSON.parse(kvStore.get('tg:555:daily')).radar === false && last().m === 'editMessageText' && btns(last()).some(b => b.callback_data === 'dy:radar' && /^⬜/.test(b.text)), kvStore.get('tg:555:daily'));
HOT = true; sent.length = 0; kvStore.delete('tg:555:radar:seen'); Wd = await fresh(); await cron(Wd, RIYADH('18:10')); await cron(Wd, RIYADH('18:40')); HOT = false;
check('…radar off → no radar message', !sent.some(x => x.m === 'sendMessage' && /🧲/.test(x.b.text)));
sent.length = 0; composeCalls.length = 0; await postK(Wd, '/morning');
check('/morning → the smart morning now', sent.some(x => x.m === 'sendMessage' && /☀️/.test(x.b.text)) && composeCalls.length === 1);
check('wrangler cron still every 5 min; update-market keeps the sectors (≥ $500M, kept on failure)', /sectors/.test(fs.readFileSync(path.join(ROOT, 'tools/update-market.mjs'), 'utf8')) && /old\.sectors/.test(fs.readFileSync(path.join(ROOT, 'tools/update-market.mjs'), 'utf8')));
LIVE.pendle.usd = 3.21;

// the "/" menu: every command, refreshed by itself when the list changes (no /start needed)
kvStore.delete('tg:555:cmdv'); Wd = await fresh(); sent.length = 0; await postK(Wd, '/menu');
const sc = sent.find(x => x.m === 'setMyCommands'), names = sc ? sc.b.commands.map(c => c.command) : [];
check('"/" menu sent again by itself: invite, users, stats, start, report, daily, morning, evening, alerts, paper, pin, unpin, guide, community, hide, feedback… (29, with balances, stocks, metals)', names.length === 29 && names.includes('balances') && names.includes('metals') && ['invite', 'users', 'stats', 'guide', 'community', 'start', 'report', 'paper', 'menu', 'portfolio', 'price', 'market', 'plan', 'exit', 'movers', 'signals', 'alerts', 'daily', 'morning', 'evening', 'pin', 'unpin', 'new', 'lang', 'hide', 'feedback'].every(n => names.includes(n)), names);
sent.length = 0; Wd = await fresh(); await postK(Wd, '/menu');
check('…and only once (remembered in KV)', !sent.some(x => x.m === 'setMyCommands'));
claudeCalls.length = 0; sent.length = 0;
for (const c of ['/start', '/menu', '/portfolio', '/price btc', '/market', '/plan', '/exit', '/movers', '/signals', '/alerts', '/daily', '/morning', '/evening', '/pin', '/unpin', '/new', '/lang', '/hide']) { Wd = await fresh(); await postK(Wd, c); }
check('every command in the "/" menu is understood (none goes to the AI as a question) and answers', claudeCalls.filter(b => !/SMART/.test(b.system || '')).length === 0 && out().length >= 18, [claudeCalls.length, out().length]);
{ // 🎯 signals are for coins: gold and a share are in the portfolio, never in /signals (its count is /portfolio's)
  globalThis.__extraCoins = [{ sym: 'XAU', opening: { qty: 2, avg: 3000 }, lastPrice: 4000 }, { sym: 'NVDAB', cls: 'stock', cgId: 'nvidia-bstocks', opening: { qty: 1, avg: 100 }, lastPrice: 150 }];
  sent.length = 0; Wd = await fresh(); await postK(Wd, '/signals'); const sg = plain(last().b.text);
  check('🎯 /signals: SOL is listed; gold (XAU) and the share (NVDAB) are not — signals are for coins', /SOL/.test(sg) && !/XAU|NVDAB/.test(sg), sg);
  sent.length = 0; Wd = await fresh(); await postK(Wd, '/portfolio'); const pf = plain(last().b.text);
  check('…and they are still in /portfolio (the total counts them)', /XAU|Gold|NVDAB/.test(pf) || /\$/.test(pf), pf.slice(0, 300));
  delete globalThis.__extraCoins; sent.length = 0;
  // 🥇 a metal's take-profit: kept per ounce, shown per gram as on the app's Exit page
  const GPO = 31.1034768, sx = summarize({ coins: [{ sym: 'SOL', cgId: 'solana', opening: { qty: 2, avg: 80 } }, { sym: 'XAU', opening: { qty: 2, avg: 3000 }, lastPrice: 4000 }, { sym: 'NVDAB', cls: 'stock', cgId: 'nvidia-bstocks', opening: { qty: 1, avg: 100 }, lastPrice: 150 }], txs: [], accum: [],
    meta: { exitPlan: [{ sym: 'XAU', tps: [{ price: 0, pct: 25, lock: false }, { price: 250 * GPO, pct: 50, lock: true }, { price: 0, pct: 25, lock: false }] }, { sym: 'SOL', tps: [{ price: 200, pct: 25, lock: true }] }] } },
    { top: [{ id: 'solana', price: 80, ch24: 0 }], top500: [], series: {}, global: {}, cgIds: {} }, Date.now());
  const tx = sx.tps.filter(t => t.sym === 'XAU'), ts = sx.tps.find(t => t.sym === 'SOL');
  check('🥇 gold\'s take-profits read per gram: TP1 ×2 of $3,000/oz = "$192.90/g", the typed TP2 = "$250.00/g"; a coin\'s stays "$200"',
    tx.length === 3 && tx.every(t => t.g === GPO) && perUnit(tx[0], tx[0].level, usd) === '$192.90/g' && perUnit(tx[1], tx[1].level, usd) === '$250.00/g' && ts.g === 1 && perUnit(ts, ts.level, usd) === '$200', [tx.map(t => perUnit(t, t.level, usd)), ts && perUnit(ts, ts.level, usd)]);
  check('…each row knows its class (crypto / metal / stock) and the signal count is coins only', sx.coins.map(c => c.sym + ':' + c.cls).sort().join() === 'NVDAB:stock,SOL:crypto,XAU:metal' && sx.counts.reinforce + sx.counts.sell + sx.counts.hold === 1, [sx.coins.map(c => c.sym + ':' + c.cls), sx.counts]);
  check('…the AI names CoinMarketCap as the Fear & Greed source (alternative.me only when it stood in)', /["']alternative\.me["'] : ["']CoinMarketCap["']/.test(built), '');
}

// ── 🧪 phase 9: paper trading — pretend money, real prices, the real portfolio untouched ──
kvStore.delete('tg:555:paper'); Wd = await fresh(); sent.length = 0; await postK(Wd, '/paper');
let pv = last();
check('/paper → a new pretend portfolio: $10,000 cash, no coins yet, vs BTC', /🧪/.test(pv.b.text) && /\$10,000\.00/.test(pv.b.text) && /(No coins yet|مفيش عملات)/.test(pv.b.text) && JSON.parse(kvStore.get('tg:555:paper')).btcStart === 77000 && okHtml(pv.b.text), pv.b.text);
const cmt0 = commits.length; claudeCalls.length = 0; sent.length = 0; Wd = await fresh(); await postK(Wd, 'paper buy btc for 1000');
let pp = JSON.parse(kvStore.get('tg:555:paper')), pr = JSON.parse(claudeCalls[1].messages.at(-1).content[0].content);
check('"paper buy BTC $1000" → done at once at $77,000 with 0.1% fee: 0.012975 BTC, $9,000 cash left', pr.ok && Math.abs(pp.pos.BTC.qty - 1000 / (77000 * 1.001)) < 1e-9 && Math.abs(pp.cash - 9000) < 1e-6 && Math.abs(pp.pos.BTC.avg - 77077) < 0.01, [pr, pp]);
check('…the real portfolio untouched (no Firestore write) and the answer has 🧪 / ↩️ Undo', commits.length === cmt0 && btns(last()).some(b => b.callback_data === 'pp:undo') && btns(last()).some(b => b.callback_data === 'pp'), btnTexts(last()));
LIVE.bitcoin.usd = 84700; sent.length = 0; Wd = await fresh(); await postK(Wd, '/paper');
pv = last();
check('BTC +10% → paper value $10,098.90; the same $10,000 in BTC from the start = $11,000 → −9.0 pts vs BTC', /\$10,098\.90/.test(pv.b.text) && /\$11,000\.00/.test(pv.b.text) && /−9\.0<\/b> pts/.test(pv.b.text), pv.b.text);
claudeCalls.length = 0; Wd = await fresh(); await postK(Wd, 'paper sell half my btc');
const ps = claudeCalls[1].messages.at(-1).content.map(r => JSON.parse(r.content));
pp = JSON.parse(kvStore.get('tg:555:paper'));
check('"paper sell half" → half the BTC sold at $84,700 minus 0.1%; realized ≈ +$49; get_paper reads it back', ps[0].ok && Math.abs(pp.pos.BTC.qty - 1000 / (77000 * 1.001) / 2) < 1e-9 && Math.abs(ps[0].done.realized - ((84700 - 77077) * pp.pos.BTC.qty - 84700 * pp.pos.BTC.qty * 0.001)) < 0.05 && ps[1].coins[0].coin === 'BTC', [ps[0].done, ps[1].value_usd]);
const cashBefore = pp.cash; sent.length = 0;
await Wd.fetch(new Request(HOST + '/tg', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': ENV.TG_SECRET }, body: JSON.stringify({ update_id: ++UPD, callback_query: { id: 'qp', data: 'pp:undo', message: { message_id: 60, chat: { id: 555 } } } }) }), ENVK, {});
pp = JSON.parse(kvStore.get('tg:555:paper'));
check('↩️ Undo → the sell reversed exactly (BTC and cash back), the view redrawn in place, only once', Math.abs(pp.pos.BTC.qty - 1000 / (77000 * 1.001)) < 1e-9 && Math.abs(pp.cash - 9000) < 1e-6 && pp.cash < cashBefore && !pp.undo && last().m === 'editMessageText' && !btns(last()).some(b => b.callback_data === 'pp:undo'), [pp.cash, pp.pos]);
claudeCalls.length = 0; Wd = await fresh(); await postK(Wd, 'paper too much');
const pe = claudeCalls[1].messages.at(-1).content.map(r => JSON.parse(r.content).error);
check('checks: more than the pretend cash / a coin not in the paper portfolio / a stablecoin → errors', /pretend cash left/.test(pe[0]) && /only 0 LINK/.test(pe[1]) && /stablecoins are the cash/.test(pe[2]), pe);
sent.length = 0;
await Wd.fetch(new Request(HOST + '/tg', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': ENV.TG_SECRET }, body: JSON.stringify({ update_id: ++UPD, callback_query: { id: 'qp2', data: 'pp:new', message: { message_id: 60, chat: { id: 555 } } } }) }), ENVK, {});
check('🔁 → asks how much: $1,000 / $10,000 / $100,000', btns(last()).map(b => b.callback_data).join() === 'pp:new:1000,pp:new:10000,pp:new:100000,pp');
await Wd.fetch(new Request(HOST + '/tg', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': ENV.TG_SECRET }, body: JSON.stringify({ update_id: ++UPD, callback_query: { id: 'qp3', data: 'pp:new:1000', message: { message_id: 60, chat: { id: 555 } } } }) }), ENVK, {});
pp = JSON.parse(kvStore.get('tg:555:paper'));
check('…$1,000 → a fresh paper portfolio from BTC $84,700', pp.cash === 1000 && pp.startCash === 1000 && !Object.keys(pp.pos).length && pp.btcStart === 84700 && /\$1,000\.00/.test(last().b.text), pp);
LIVE.bitcoin.usd = 77000;

// the old report page is gone (20 Nov): 📱 opens the full app, signed in by Telegram (tests/tg_login_test.mjs, tg_miniapp_test.py)
for (const pth of ['/tg/app', '/tg/api', '/tg/card', '/tg/logo']) { const r = await W.fetch(new Request(HOST + pth, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), ENVK, {}); check(`the old report page's ${pth} no longer answers`, r.status >= 400, r.status); }

// GitHub late with the market snapshot → the Worker's cron asks GitHub to run it now (needs GH_DISPATCH_TOKEN)
const ENVG = { ...ENVK, GH_DISPATCH_TOKEN: 'github_pat_test' };
const cronG = async (env, at) => { const Wg = await fresh(); const p = []; await Wg.scheduled({ cron: '*/5 * * * *', scheduledTime: at }, env, { waitUntil: x => p.push(x) }); await Promise.all(p); };
kvStore.delete('tg:kick'); market.parts = { top: new Date(NOW - 12 * 60e3).toISOString() };
await cronG(ENVG, RIYADH('03:07'));
check('snapshot 12 min old → GitHub is not asked', kicks.length === 0);
market.parts = { top: new Date(NOW - 70 * 60e3).toISOString() };
await cronG(ENVK, RIYADH('03:12'));
check('…70 min old but no GH_DISPATCH_TOKEN → nothing (it just waits for GitHub)', kicks.length === 0);
await cronG(ENVG, RIYADH('03:17'));
check('…70 min old + the token → GitHub runs the snapshot now (workflow_dispatch on main)', kicks.length === 1 && kicks[0].auth === 'Bearer github_pat_test' && kicks[0].body.ref === 'main', kicks);
await cronG(ENVG, RIYADH('03:22'));
check('…and not again for 20 min', kicks.length === 1);
check('built file holds no GitHub token', !/github_pat_|ghp_[A-Za-z0-9]{20}/.test(built));
market.parts = { top: new Date(NOW - 12 * 60e3).toISOString() };

// 🛠 price updates stopped: the snapshot over 90 min old → ONE message to the owner (never a member), a reminder only
// after 6 h, and one "back" message when a fresh snapshot arrives
{
  const stall = () => sent.filter(m => m.m === 'sendMessage' && /Price updates|تحديث الأسعار/.test(m.b.text || ''));
  kvStore.delete('tg:stall'); kvStore.delete('tg:kick'); sent.length = 0;
  market.parts = { top: new Date(NOW - 70 * 60e3).toISOString() }; await cronG(ENVG, RIYADH('03:27'));
  check('🛠 snapshot 70 min old → no "stopped" message yet (GitHub is only asked to run it)', stall().length === 0 && !kvStore.get('tg:stall'), stall().map(m => m.b.text));
  market.parts = { top: new Date(Date.now() - 95 * 60e3).toISOString() }; await cronG(ENVG, RIYADH('03:32'));
  const s1 = stall();
  check('🛠 95 min old → the owner gets ONE "Price updates stopped" with the age, what the bot tried, and a button to the runs on GitHub',
    s1.length === 1 && String(s1[0].b.chat_id) === '555' && /Price updates stopped/.test(s1[0].b.text) && /1 h 35 min old/.test(s1[0].b.text) && /asking GitHub/.test(s1[0].b.text)
    && btns(s1[0]).length === 1 && /github\.com\/.+\/actions\/workflows\/prices\.yml$/.test(btns(s1[0])[0].url), s1.map(m => [m.b.chat_id, m.b.text]));
  await cronG(ENVG, RIYADH('03:37')); await cronG(ENVG, RIYADH('03:42'));
  check('…and not again on the next runs', stall().length === 1);
  const st = JSON.parse(kvStore.get('tg:stall')); kvStore.set('tg:stall', JSON.stringify({ ...st, at: Date.now() - 6.1 * 3600e3 }));
  market.parts = { top: new Date(Date.now() - 8 * 3600e3).toISOString() }; await cronG(ENVK, RIYADH('03:47'));
  const s2 = stall();
  check('…6 h later, still stopped → one reminder ("still stopped"; without the GitHub key it says so)', s2.length === 2 && /still stopped/.test(s2[1].b.text) && /8 h old/.test(s2[1].b.text) && /no GitHub key/.test(s2[1].b.text), s2.map(m => m.b.text));
  market.parts = { top: new Date(Date.now() - 3 * 60e3).toISOString() }; await cronG(ENVG, RIYADH('03:52'));
  const s3 = stall();
  check('…a fresh snapshot → one "Price updates are back", and the record is cleared', s3.length === 3 && /are back/.test(s3[2].b.text) && /after \d+ h/.test(s3[2].b.text) && kvStore.get('tg:stall') === '{}', [s3.map(m => m.b.text), kvStore.get('tg:stall')]);
  await cronG(ENVG, RIYADH('03:57'));
  check('…and then silence', stall().length === 3);
  const St = await import('../tools/worker/stall.mjs');
  const ar = St.stallMessage({ age: 125 * 60e3, kick: 'refused' }, 'ar');
  check('🛠 in Arabic: the title, the age in Arabic counting, and the refused request', /تحديث الأسعار توقف/.test(ar.text) && /ساعتين و5 دقيقة/.test(ar.text) && /رفض الطلب/.test(ar.text) && !/[A-Za-z]{4,}(?<!GitHub)/.test(ar.text.replace(/GitHub/g, '')), ar.text);
  check('🛠 an unreadable snapshot is told as such', /unreadable for 1 h 40 min/.test(St.stallMessage({ age: 100 * 60e3, unread: true }, 'en').text));
  kvStore.delete('tg:stall'); kvStore.delete('tg:kick'); sent.length = 0; kicks.length = 0;
}
market.parts = { top: new Date(NOW - 12 * 60e3).toISOString() };

// the same alert twice (e.g. said again by voice) → kept once
kvStore.set('tg:555:alerts', '[]'); Wd = await fresh(); claudeCalls.length = 0; await postK(Wd, 'alert me sol'); claudeCalls.length = 0; await postK(Wd, 'alert me sol');
const al2 = JSON.parse(kvStore.get('tg:555:alerts')), dupRes = claudeCalls[1].messages.at(-1).content.map(r => JSON.parse(r.content));
check('the same alert asked twice → stored once ("already set")', al2.filter(a => a.kind === 'price_below' && a.value === 140).length === 1 && dupRes[0].already_set === true, [al2.length, dupRes[0]]);
kvStore.set('tg:555:alerts', '[]');

// ── phase 10 · step 1: each person their own space; the owner's old shared keys move to theirs once ──
for (const k of [...kvStore.keys()]) if (/^tg:555:|^tg:migrated/.test(k)) kvStore.delete(k);
kvStore.set('tg:alerts', JSON.stringify([{ id: 'old1', kind: 'price_below', value: 1, sym: 'SOL', cg: 'solana', armed: true, created: NOW }]));
kvStore.set('tg:paper', JSON.stringify({ start: NOW, startCash: 10000, btcStart: 77000, cash: 9000, pos: { BTC: { qty: 0.01, avg: 77000, id: 'bitcoin' } }, trades: [] }));
kvStore.set('tg:lang', 'ar');
Wd = await fresh(); sent.length = 0; await postK(Wd, '/alerts');
check('the owner\'s old shared data (alerts, paper, language) moves to their own keys, once', JSON.parse(kvStore.get('tg:555:alerts'))[0].id === 'old1' && JSON.parse(kvStore.get('tg:555:paper')).cash === 9000 && kvStore.get('tg:555:lang') === 'ar' && !!kvStore.get('tg:migrated') && /تنبيهاتك/.test(last().b.text), [kvStore.get('tg:555:lang'), last().b.text.slice(0, 40)]);
kvStore.set('tg:alerts', '[]'); Wd = await fresh(); await postK(Wd, '/alerts');
check('…and never again (a later change of the old key doesn\'t overwrite)', JSON.parse(kvStore.get('tg:555:alerts')).length === 1);
const cmdCall = sent.find(x => x.m === 'setMyCommands');
check('the "/" menu is set for this chat only (scope chat 555)', cmdCall && cmdCall.b.scope && cmdCall.b.scope.type === 'chat' && String(cmdCall.b.scope.chat_id) === '555', cmdCall && cmdCall.b.scope);
check('another chat still gets nothing (only invited chats — step 2)', await (async () => { sent.length = 0; await post({ update_id: ++UPD, message: { message_id: 1, chat: { id: 777 }, from: { id: 777 }, text: '/start' } }, ENV.TG_SECRET, ENVK); return sent.length === 0; })());
check('a trade prepared by one chat can\'t be confirmed from another', await (async () => { kvStore.set('tg:tx:zz1', JSON.stringify({ created: Date.now(), trades: [], lang: 'en', chat: '999' })); const c0 = commits.length; Wd = await fresh(); await Wd.fetch(new Request(HOST + '/tg', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': ENV.TG_SECRET }, body: JSON.stringify({ update_id: ++UPD, callback_query: { id: 'qz', data: 'tx:ok:zz1', message: { message_id: 5, chat: { id: 555 } } } }) }), ENVK, {}); return commits.length === c0 && !!kvStore.get('tg:tx:zz1'); })());
kvStore.set('tg:555:lang', 'en'); kvStore.set('tg:555:alerts', '[]'); kvStore.delete('tg:paper'); kvStore.delete('tg:alerts'); kvStore.delete('tg:lang');
check('wrangler: AsyncLocalStorage on (nodejs_als)', /compatibility_flags = \["nodejs_als"\]/.test(fs.readFileSync(path.join(ROOT, 'tools/worker/wrangler.toml'), 'utf8')));

// ── phase 10 · step 2: invites ──
const sayAs = (chat, text, from = {}) => post({ update_id: ++UPD, message: { message_id: 1, chat: { id: chat, type: 'private' }, from: { id: chat, first_name: 'Ali', language_code: 'en', ...from }, text } }, ENV.TG_SECRET, ENVK);
const tapAs = (chat, data) => post({ update_id: ++UPD, callback_query: { id: 'qq', data, from: { id: chat }, message: { message_id: 61, chat: { id: chat } } } }, ENV.TG_SECRET, ENVK);
kvStore.delete('tg:users'); for (const k of [...kvStore.keys()]) if (/^tg:(nope|inv):/.test(k)) kvStore.delete(k);
sent.length = 0; await sayAs(777, 'hello'); await sayAs(777, 'hello again'); await sayAs(777, '/portfolio');
check('a stranger → one polite "private, send your invite code" a day — then silence (no data, no AI)', sent.filter(x => x.m === 'sendMessage').length === 1 && /private/.test(sent.find(x => x.m === 'sendMessage').b.text) && String(sent.find(x => x.m === 'sendMessage').b.chat_id) === '777', sent.map(x => x.m));
// 🛡 a stranger guessing codes: 5 tries an hour, then nothing — no Firebase read (a /link code is checked against Firebase)
{ LIMITS = true; let fs0 = 0; const of = globalThis.fetch; globalThis.fetch = (i, o) => { const u = typeof i === 'string' ? i : i.url; if (/firestore\.googleapis\.com/.test(u)) fs0++; return of(i, o); };
  const w0 = kvStore.size;
  for (let i = 0; i < 8; i++) await sayAs(4242, '/link ZZZZZZZ' + i);
  const fsReads = fs0; fs0 = 0;
  for (let i = 0; i < 25; i++) await sayAs(4243, 'hi ' + i);
  globalThis.fetch = of; LIMITS = false;
  check('🛡 a stranger trying /link codes: only 5 tries an hour reach Firebase (8 sent)', fsReads > 0 && fsReads <= 5 * 4, fsReads);
  check('🛡 a stranger sending 25 messages: no Firebase, and the bot\'s memory (KV) grows by at most a couple of keys', fs0 === 0 && kvStore.size - w0 <= 4, [fs0, kvStore.size - w0]); }
// 🙋 no code: a stranger asks for an invite → the owner gets ONE message with ✅ / ✖️; accepted → they are in at once
{ for (const k of [...kvStore.keys()]) if (/^tg:(nope|req):/.test(k)) kvStore.delete(k);
  sent.length = 0; await sayAs(9001, 'hello', { first_name: 'Huda', username: 'huda', language_code: 'ar' });
  check('🙋 a stranger is told how to ask: "send the word invite / دعوة"', /دعوة/.test(last().b.text) && String(last().b.chat_id) === '9001', last().b.text);
  sent.length = 0; await sayAs(9001, 'أريد دعوة', { first_name: 'Huda', username: 'huda', language_code: 'ar' });
  const toOwner = sent.find(x => x.m === 'sendMessage' && String(x.b.chat_id) === '555'), toHer = sent.find(x => x.m === 'sendMessage' && String(x.b.chat_id) === '9001');
  check('🙋 "أريد دعوة" → she is told it arrived, and the owner gets her name with ✅ Accept / ✖️ Decline', !!toHer && /وصل طلبك/.test(toHer.b.text) && !!toOwner && /Huda/.test(toOwner.b.text) && /@huda/.test(toOwner.b.text) && btns(toOwner).some(b => b.callback_data === 'rq:ok:9001') && btns(toOwner).some(b => b.callback_data === 'rq:no:9001'), sent.map(x => [x.b.chat_id, x.b.text]));
  sent.length = 0; await sayAs(9001, 'invite please', { first_name: 'Huda', language_code: 'ar' }); await sayAs(9001, 'دعوة', { first_name: 'Huda', language_code: 'ar' });
  check('…asking again: the owner is not messaged a second time', !sent.some(x => x.m === 'sendMessage' && String(x.b.chat_id) === '555'), sent.map(x => [x.b.chat_id, x.b.text]));
  sent.length = 0; await tapAs(9001, 'rq:ok:9001'); await tapAs(777000, 'rq:ok:9001');
  check('…only the owner can accept (her own tap, or a stranger\'s, does nothing)', !JSON.parse(kvStore.get('tg:users') || '{}')['9001']);
  sent.length = 0; await tapAs(555, 'rq:ok:9001');
  check('✅ Accept → she is a member at once, welcomed in Arabic, and the owner\'s message says so', !!JSON.parse(kvStore.get('tg:users'))['9001'] && sent.some(x => String(x.b.chat_id) === '9001' && /أهلاً Huda/.test(x.b.text || '')) && sent.some(x => x.m === 'editMessageText' && /Accepted/.test(x.b.text || '')), sent.map(x => [x.m, x.b.chat_id, (x.b.text || '').slice(0, 60)]));
  sent.length = 0; await tapAs(555, 'rq:ok:9001');
  check('…a second tap changes nothing (the request is closed)', !sent.some(x => x.m === 'sendMessage'));
  sent.length = 0; await sayAs(9002, '/start invite', { first_name: 'Omar', language_code: 'en' }); await tapAs(555, 'rq:no:9002');
  check('✖️ Decline (from the welcome page\'s link, /start invite) → not a member, not told; the owner\'s message says Declined', !JSON.parse(kvStore.get('tg:users'))['9002'] && sent.some(x => x.m === 'editMessageText' && /Declined/.test(x.b.text || '')) && sent.filter(x => x.m === 'sendMessage' && String(x.b.chat_id) === '9002').length === 1, sent.map(x => [x.m, x.b.chat_id, (x.b.text || '').slice(0, 60)]));
  const u = JSON.parse(kvStore.get('tg:users')); delete u['9001']; kvStore.set('tg:users', JSON.stringify(u)); for (const k of [...kvStore.keys()]) if (/^tg:(nope|req|9001):/.test(k)) kvStore.delete(k); }
sent.length = 0; Wd = await fresh(); await postK(Wd, '/invite');
const code = (/<code>([A-Z2-9]{8})<\/code>/.exec(last().b.text) || [])[1];
check('/invite (owner) → an 8-letter one-time code', !!code && !/[01IO]/.test(code), last().b.text);
for (const k of [...kvStore.keys()]) if (/^tg:nope:/.test(k)) kvStore.delete(k);
sent.length = 0; await sayAs(777, '/start ' + code);
const toOwner = sent.find(x => x.m === 'sendMessage' && String(x.b.chat_id) === '555');
check('the friend sends /start CODE → welcome + the keyboard + the menu; you get "👤 Ali joined"', JSON.parse(kvStore.get('tg:users'))['777'].name === 'Ali' && sent.some(x => String(x.b.chat_id) === '777' && /Welcome, Ali/.test(x.b.text || '')) && toOwner && /Ali/.test(toOwner.b.text), sent.map(x => [x.m, x.b.chat_id, (x.b.text || '').slice(0, 30)]));
sent.length = 0; await sayAs(888, code, { first_name: 'Eve' });
check('…the same code again (someone else) → not valid; Eve stays out', !JSON.parse(kvStore.get('tg:users'))['888'] && /not valid/.test(last().b.text));
sent.length = 0; await sayAs(777, '/portfolio');
const c7 = sent.find(x => x.m === 'setMyCommands' && x.b.scope && String(x.b.scope.chat_id) === '777');
check('Ali: /portfolio → "not linked yet" (never your portfolio)', /linked yet/.test(last().b.text) && !/\$7,700|BTC .*0\.1\b/.test(last().b.text), last().b.text);
sent.length = 0; await sayAs(777, '/invite');
check('Ali: /invite → owner only', /Only the bot owner/.test(last().b.text));
kvStore.delete('tg:777:alerts'); claudeCalls.length = 0; sent.length = 0; await sayAs(777, 'alert me sol');
check('Ali sets alerts → stored under his chat only; yours untouched', JSON.parse(kvStore.get('tg:777:alerts') || '[]').length >= 1 && JSON.parse(kvStore.get('tg:555:alerts') || '[]').every(a => a.id !== JSON.parse(kvStore.get('tg:777:alerts'))[0].id));
check('…his AI limit is 5 a day (yours 30)', /\d+\/5 left today/.test(last().b.text), last().b.text.slice(-60));
check('…and Claude is told he is an invited user (not Samir)', /invited/.test(claudeCalls[0].system) && !/one private user, Samir/.test(claudeCalls[0].system));
check('…his "/" menu has no /invite or /users', c7 && !c7.b.commands.some(c => /invite|users/.test(c.command)), c7 && c7.b.commands.map(c => c.command));
LIVE.solana.usd = 130; kvStore.set('tg:777:alerts', JSON.stringify([{ id: 'a7', kind: 'price_below', value: 140, sym: 'SOL', cg: 'solana', armed: true, created: NOW, since: 1 }]));   // (already true on the check before)
sent.length = 0; Wd = await fresh(); await cron(Wd); LIVE.solana.usd = 150;
check('cron: Ali\'s alert fires to Ali (chat 777), not to you', sent.some(x => x.m === 'sendMessage' && String(x.b.chat_id) === '777' && /SOL below/.test(x.b.text)) && !sent.some(x => x.m === 'sendMessage' && String(x.b.chat_id) === '555' && /SOL below \$140/.test(x.b.text)), sent.map(x => [x.b.chat_id, (x.b.text || '').slice(0, 30)]));
sent.length = 0; Wd = await fresh(); await postK(Wd, '/users');
check('/users (owner) → Ali listed (tap → his card with limits and 🗑)', /Ali/.test(last().b.text) && btns(last()).some(b => b.callback_data === 'us:m:777'));
sent.length = 0; await tapAs(555, 'us:del:777');
check('🗑 → Ali removed, told so, and the list redrawn', !JSON.parse(kvStore.get('tg:users'))['777'] && sent.some(x => String(x.b.chat_id) === '777' && /removed/.test(x.b.text || '')) && sent.some(x => x.m === 'editMessageText'));
for (const k of [...kvStore.keys()]) if (/^tg:nope:/.test(k)) kvStore.delete(k);
sent.length = 0; claudeCalls.length = 0; await sayAs(777, 'what is the price of SOL?');
check('…after that Ali is a stranger again (no AI, just "private")', claudeCalls.length === 0 && /private/.test(last().b.text));

// ── phase 10 · step 3a: the owner's portfolio is pinned (config/owner) — another account in Firebase can never be read instead ──
OWNER_PIN = null; ACCOUNTS = ['UID1']; pinWrites.length = 0; Wd = await fresh(); sent.length = 0; await postK(Wd, '/portfolio');
check('no pin + one account → that account, pinned now (config/owner = UID1)', pinWrites.length === 1 && OWNER_PIN === 'UID1' && /\$/.test(last().b.text));
OWNER_PIN = null; ACCOUNTS = ['UID2', 'UID1']; pinWrites.length = 0; Wd = await fresh(); sent.length = 0; await postK(Wd, '/portfolio');
check('no pin + two accounts → no portfolio at all (never a guess), nothing pinned', pinWrites.length === 0 && /not connected/i.test(last().b.text), last().b.text);
OWNER_PIN = 'UID1'; Wd = await fresh(); sent.length = 0; await postK(Wd, '/portfolio');
check('pinned UID1 + two accounts → yours', /\$/.test(last().b.text) && !/not connected/i.test(last().b.text));
ACCOUNTS = ['UID1'];
check('GitHub alerts use the same pin (config/owner), skip when unsure', /config\/owner/.test(fs.readFileSync(path.join(ROOT, 'tools/alerts.mjs'), 'utf8')) && /no owner pinned — skipped/.test(fs.readFileSync(path.join(ROOT, 'tools/alerts.mjs'), 'utf8')));

// ── phase 10 · step 3: the app for invited people (/app → your ✅ → config/access), /link their portfolio, AI Analysis limits ──
kvStore.delete('tg:users'); for (const k of [...kvStore.keys()]) if (/^tg:(nope|inv|appreq):|^tg:777:/.test(k)) kvStore.delete(k);
Wd = await fresh(); sent.length = 0; await postK(Wd, '/invite');
const code2 = (/<code>([A-Z2-9]{8})<\/code>/.exec(last().b.text) || [])[1]; await sayAs(777, '/start ' + code2);
sent.length = 0; await sayAs(777, '/app');
check('/app with no e-mail → how to send it', /\/app you@example\.com/.test(last().b.text));
sent.length = 0; accessWrites.length = 0; await sayAs(777, 'cute.friend@gmail.com');
check('…then just the e-mail on its own (as people do) → handled as /app (not the AI): opened for that e-mail, you get a note', sent.some(x => String(x.b.chat_id) === '555' && /cute\.friend@gmail\.com/.test(x.b.text || '') && /opened the app/.test(x.b.text || '')), sent.map(x => (x.b.text || '').slice(0, 60)));
sent.length = 0; accessWrites.length = 0; await sayAs(777, '/app Ali.Friend@iCloud.com');
const req = sent.find(x => String(x.b.chat_id) === '555' && /opened the app/.test(x.b.text || ''));
check('/app ali.friend@icloud.com → an invited member: the app opens for that e-mail at once (config/access), he gets the link, you get a note', accessWrites.length === 1 && JSON.stringify(accessWrites[0]).includes('ali.friend@icloud.com') && sent.some(x => String(x.b.chat_id) === '777' && /drsamirsaad1981-design\.github\.io/.test(x.b.text || '')) && req && /ali\.friend@icloud\.com/.test(req.b.text), sent.map(x => [x.m, x.b.chat_id, (x.b.text || '').slice(0, 40)]));
check('…the link says which e-mail it is for as 8 hex of its SHA-256 (?for=9762675f) — never the e-mail itself in the link', sent.some(x => String(x.b.chat_id) === '777' && /samsam-portfolio\/\?for=9762675f\n/.test(x.b.text || '') && !/\?for=[^\n]*@/.test(x.b.text)), sent.map(x => x.b.text));
// (✅ / ❌ buttons stay for old pending requests)
check('…his record carries the approved e-mail', JSON.parse(kvStore.get('tg:users'))['777'].email === 'ali.friend@icloud.com');
sent.length = 0; await sayAs(777, '/link ABCDEFGH');
check('/link with a wrong code → not valid (nothing linked)', /not valid/.test(last().b.text) && !JSON.parse(kvStore.get('tg:users'))['777'].uid);
TGLINK = { code: 'K7M2PQ9R', exp: new Date(Date.now() + 5 * 60e3).toISOString(), email: 'someone.else@x.com' }; sent.length = 0; await sayAs(777, '/link K7M2PQ9R');
check('…a code made by another e-mail than the approved one → refused', /another e-mail/.test(last().b.text) && !JSON.parse(kvStore.get('tg:users'))['777'].uid);
TGLINK = { code: 'K7M2PQ9R', exp: new Date(Date.now() - 60e3).toISOString(), email: 'ali.friend@icloud.com' }; sent.length = 0; await sayAs(777, '/link K7M2PQ9R');
check('…an expired code (over 10 min) → refused', /not valid/.test(last().b.text));
TGLINK = { code: 'K7M2PQ9R', exp: new Date(Date.now() + 5 * 60e3).toISOString(), email: 'ali.friend@icloud.com' }; sent.length = 0; tglinkWrites.length = 0; await sayAs(777, '/start LK7M2PQ9R');
check('…the app\'s "Open the bot" (/start LCODE) → linked to UID2, the code used up, his daily messages on', JSON.parse(kvStore.get('tg:users'))['777'].uid === 'UID2' && tglinkWrites.length === 1 && /Linked/.test(last().b.text) && JSON.parse(kvStore.get('tg:777:daily')).morning === true && JSON.parse(kvStore.get('tg:777:daily')).radar === true, [kvStore.get('tg:users'), last().b.text]);
sent.length = 0; await sayAs(777, '/portfolio');
check('Ali /portfolio → HIS portfolio (2 ETH from UID2) — never yours', /ETH/.test(last().b.text) && !/LINK|SOL/.test(last().b.text), last().b.text.slice(0, 200));
sent.length = 0; await postK(await fresh(), '/portfolio');
check('…and yours is still yours', /BTC/.test(last().b.text) && /SOL/.test(last().b.text));
// limits in /users: his card, − / +
sent.length = 0; await tapAs(555, 'us:m:777');
check('/users → tap Ali → his card: app e-mail, linked, 🧠 5 a day, 📊 0 a day (quick reports off until his own key)', /ali\.friend@icloud\.com/.test(last().b.text) && /linked/.test(last().b.text) && /<b>5<\/b>/.test(last().b.text) && /reports a day: <b>0<\/b>/.test(last().b.text), last().b.text);
await tapAs(555, 'us:ai:+:777'); await tapAs(555, 'us:ai:+:777'); await tapAs(555, 'us:rp:-:777');
check('…🧠 + + → 7 questions, 📊 − → 0 reports (saved for him)', JSON.parse(kvStore.get('tg:users'))['777'].ai === 7 && JSON.parse(kvStore.get('tg:users'))['777'].reports === 0);
claudeCalls.length = 0; sent.length = 0; await sayAs(777, 'what is the price of SOL?');
check('…his bot now says x/7 left today', /\/7 left today/.test(last().b.text), last().b.text.slice(-40));
// AI Analysis in the app (a real signed Firebase token)
const fbToken = (email, uid) => { const b = o => Buffer.from(JSON.stringify(o)).toString('base64url'), now = Math.floor(Date.now() / 1000);
  const h = b({ alg: 'RS256', kid: 'k1', typ: 'JWT' }), p = b({ aud: 'samsam-portfolio', iss: 'https://securetoken.google.com/samsam-portfolio', sub: uid, email, email_verified: true, iat: now, auth_time: now, exp: now + 3600 });
  return h + '.' + p + '.' + crypto.sign('RSA-SHA256', Buffer.from(h + '.' + p), privateKey).toString('base64url'); };
const ENVA = { ...ENVK, ALLOWED_EMAILS: 'dr.samir.saad.1981@gmail.com', DAILY_LIMIT: '5' };
const analyze = (email, uid) => W.fetch(new Request(HOST + '/analyze', { method: 'POST', headers: { Origin: 'https://drsamirsaad1981-design.github.io', 'content-type': 'application/json' }, body: JSON.stringify({ idToken: fbToken(email, uid), portfolioData: { value: 1 }, language: 'en' }) }), ENVA, {});
claudeCalls.length = 0; let an = await analyze('dr.samir.saad.1981@gmail.com', 'UID1');
check('AI Analysis: you → a report on your model (Opus), limit 5', an.status === 200 && claudeCalls.at(-1).model === 'claude-opus-4-5' && (await an.json()).remaining === 4);
an = await analyze('ali.friend@icloud.com', 'UID2');
check('…Ali with reports set to 0 → "not on for this account"', an.status === 429 && claudeCalls.length === 1);
await tapAs(555, 'us:rp:+:777'); claudeCalls.length = 0; an = await analyze('ali.friend@icloud.com', 'UID2');
const anj = await an.json();
check('…reports 1 → his report on Sonnet 5.5, 0 left today; a second → limit', an.status === 200 && claudeCalls.at(-1).model === 'claude-sonnet-5-5' && anj.remaining === 0 && (await analyze('ali.friend@icloud.com', 'UID2')).status === 429, anj);
check('…an e-mail nobody approved → 403', (await analyze('random@gmail.com', 'UIDX')).status === 403);
sent.length = 0; accessWrites.length = 0; await tapAs(555, 'us:del:777');
check('🗑 Ali → his e-mail leaves config/access too (the app closes for him)', accessWrites.length === 1 && !JSON.stringify(accessWrites[0]).includes('ali.friend'), accessWrites);
check('firestore.rules: own data only; Samir always; invited e-mails from config/access; config/ never writable by the app', /allowedEmail\(\)/.test(fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8')) && /config\/access/.test(fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8')) && /request\.auth\.uid == userId/.test(fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8')) && !/match \/config/.test(fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8')));

// 📉 Firebase reads: each look (the 5-minute check, a message) reads the whole portfolio only when something changed (else ~6 small reads)
{
  kvStore.delete('fs:pf:UID1'); OWNER_PIN = 'UID1'; ACCOUNTS = ['UID1']; COIN_UPD = '2026-11-01T00:00:00.000Z';
  LIST_TXS = 0; AGG_CALLS = 0; await postK(await fresh(), '/portfolio');
  check('reads: the first look reads the portfolio in full and keeps a copy in KV', LIST_TXS === 1 && kvStore.has('fs:pf:UID1'), LIST_TXS);
  LIST_TXS = 0; AGG_CALLS = 0; await postK(await fresh(), '/portfolio');
  check('…the next look (a new Worker, nothing in memory): only the counts + "anything newer?" — no full read', LIST_TXS === 0 && AGG_CALLS === 3, [LIST_TXS, AGG_CALLS]);
  COIN_UPD = '2026-11-13T09:00:00.000Z'; LIST_TXS = 0; await postK(await fresh(), '/portfolio');
  check('…a coin changed in the app (newer updatedAt) → read in full again', LIST_TXS === 1, LIST_TXS);
  LIST_TXS = 0; await postK(await fresh(), '/portfolio');
  check('…then quiet again', LIST_TXS === 0, LIST_TXS);
  MANY = 1; LIST_TXS = 0; await postK(await fresh(), '/portfolio'); MANY = 0;
  check('…a coin added (the count moved) → read in full', LIST_TXS === 1, LIST_TXS);
  const k = JSON.parse(kvStore.get('fs:pf:UID1')); k.at -= 7 * 3600e3; kvStore.set('fs:pf:UID1', JSON.stringify(k)); LIST_TXS = 0; await postK(await fresh(), '/portfolio');
  check('…and a full read every 6 hours anyway', LIST_TXS === 1, LIST_TXS);
  COIN_UPD = '';
}

// 🧲 the radars wait for a portfolio: a member who joined but hasn't linked gets none; 📉 "today" for a coin bought today
{
  const m2 = JSON.parse(kvStore.get('tg:users')); m2['888'] = { name: 'New', joined: Date.now() }; kvStore.set('tg:users', JSON.stringify(m2)); kvStore.delete('tg:888:daily');
  sent.length = 0; await sayAs(888, '/daily');
  check('a member not linked yet: Leverage radar and Sector radar start off', /⬜ Leverage radar/.test(last().b.text) && /⬜ Sector radar/.test(last().b.text), last().b.text);
  // the language: a member whose language key went missing still gets their own (saved with them), never the owner's Arabic
  const ENV_AR = { ...ENVK, BOT_LANG: 'ar' };
  await post({ update_id: ++UPD, message: { message_id: 1, chat: { id: 888, type: 'private' }, from: { id: 888, first_name: 'New', language_code: 'en' }, text: '/lang' } }, ENV.TG_SECRET, ENV_AR);
  kvStore.delete('tg:888:lang');
  const W3 = await fresh(); sent.length = 0;
  await W3.fetch(new Request(HOST + '/tg', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': ENV.TG_SECRET }, body: JSON.stringify({ update_id: ++UPD, message: { message_id: 1, chat: { id: 888, type: 'private' }, from: { id: 888, first_name: 'New' }, text: '/daily' } }) }), ENV_AR, {});
  check('a member with no language key (a new Worker, BOT_LANG=ar for the owner) → still English, not the owner\'s Arabic', /Leverage radar/.test(last().b.text), last().b.text.slice(0, 80));
  const mk = { top: [{ id: 'solana', price: 79.65, ch24: -3.88 }], top500: [], series: {}, global: {}, cgIds: {} };
  const s1 = summarize({ coins: [{ sym: 'SOL', cgId: 'solana', opening: { qty: 1, avg: 81 }, addedAt: new Date(Date.now() - 3600e3).toISOString() }], txs: [], accum: [], meta: {} }, mk, Date.now());
  check('📉 a coin added an hour ago at $81, now $79.65: "today" = −$1.35 (from the price paid), not the 24 h drop', Math.abs(s1.d24 + 1.35) < 0.01, s1.d24);
  const s2 = summarize({ coins: [{ sym: 'SOL', cgId: 'solana', opening: { qty: 1, avg: 81 }, addedAt: '2026-01-01T00:00:00Z' }], txs: [], accum: [], meta: {} }, mk, Date.now());
  check('…held since before today: "today" = the 24 h move (−3.88%)', Math.abs(s2.ch24 + 3.88) < 0.01, s2.ch24);
}

// 📌 unpinned in Telegram itself, then /pin → pinned again; a new language redraws the pinned message in it
{
  const st = JSON.parse(kvStore.get('tg:555:pin') || '{}');
  if (!st.id) { await postK(await fresh(), '/pin'); }
  sent.length = 0; await postK(await fresh(), '/pin');
  check('📌 /pin (the old one maybe deleted in Telegram) → a NEW message, pinned; the old one unpinned and removed', sent.some(x => x.m === 'sendMessage' && /📌/.test(x.b.text || '')) && sent.some(x => x.m === 'pinChatMessage') && sent.some(x => x.m === 'deleteMessage'), sent.map(x => x.m));
  sent.length = 0; await postK(await fresh(), 'عربي');
  const ed = sent.find(x => x.m === 'editMessageText' && /📌/.test(x.b.text || ''));
  check('🌐 → عربي: the pinned message is redrawn in Arabic right away', ed && /مباشر/.test(ed.b.text), sent.map(x => x.m));
  await postK(await fresh(), 'english');
  // the Google token: a fresh Worker takes it from KV instead of signing in again
  tokenCalls = 0; kvStore.delete('fs:pf:UID1'); await postK(await fresh(), '/portfolio'); const t1 = tokenCalls;
  kvStore.delete('fs:pf:UID1'); await postK(await fresh(), '/portfolio');
  check('🔑 a new Worker instance reuses the Google token kept in KV (no new sign-in)', tokenCalls === t1 && kvStore.has('fs:gtok'), [t1, tokenCalls]);
}

// ── step 4: /users shows today's use; ⏸ pause; 🌊 too many messages; 🧹 /forget ──
{
  const mm = JSON.parse(kvStore.get('tg:users')); mm['888'] = { ...mm['888'], uid: 'UID2', lang: 'en' }; kvStore.set('tg:users', JSON.stringify(mm));
  const dayR = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
  kvStore.set(`tg:888:ai:${dayR}`, '3'); kvStore.set(`ai:UID2:${new Date().toISOString().slice(0, 10)}`, '1');
  sent.length = 0; await sayAs(555, '/users');
  check('👥 /users: each member\'s use today — 🧠 3/5 · 📊 1/0', /New[\s\S]*today 🧠 3\/5 · 📊 1\/0/.test(last().b.text), last().b.text);
  // ⏸ pause
  sent.length = 0; await tapAs(555, 'us:pz:888');
  check('⏸ Pause → the member is paused (told once), the card says paused, ▶️ Resume shows', JSON.parse(kvStore.get('tg:users'))['888'].paused === true && sent.some(x => String(x.b.chat_id) === '888' && /paused/.test(x.b.text || '')) && /paused/.test(sent.find(x => x.m === 'editMessageText').b.text) && JSON.stringify(sent.find(x => x.m === 'editMessageText').b.reply_markup).includes('Resume'), sent.map(x => x.m));
  kvStore.delete('tg:nope:888'); sent.length = 0; await sayAs(888, '/menu'); await sayAs(888, '/portfolio');
  check('…a paused member: one short note, then nothing (no menu, no portfolio)', sent.filter(x => String(x.b.chat_id) === '888' && x.m === 'sendMessage').length === 1 && /paused/.test(sent[0].b.text), sent.map(x => x.m + ':' + (x.b.text || '').slice(0, 30)));
  const W5 = await fresh(); sent.length = 0; await W5.scheduled({ cron: '*/5 * * * *', scheduledTime: RIYADH('03:15') }, ENVK, { waitUntil: () => {} });
  await new Promise(r => setTimeout(r, 300));
  check('…and the 5-minute round skips them (nothing sent to a paused member)', !sent.some(x => String(x.b.chat_id) === '888'), sent.filter(x => String(x.b.chat_id) === '888').map(x => x.m));
  await tapAs(555, 'us:pz:888');
  check('▶️ Resume → active again', !JSON.parse(kvStore.get('tg:users'))['888'].paused);
  // 🌊 flood: 20 a minute
  for (const k of [...cacheStore.keys()]) if (k.includes('flood%3A888')) cacheStore.delete(k);
  cacheStore.set(limitKey('flood', 888, 60e3), '20'); sent.length = 0; LIMITS = true;
  await sayAs(888, '/menu'); await sayAs(888, '/menu'); LIMITS = false;
  const to888 = sent.filter(x => String(x.b.chat_id) === '888' && x.m === 'sendMessage');
  check('🌊 the 21st message in a minute → one "wait a minute", the 22nd → nothing', to888.length === 1 && /wait a minute/.test(to888[0].b.text), to888.map(x => x.b.text.slice(0, 40)));
  for (const k of [...cacheStore.keys()]) if (k.includes('flood%3A888')) cacheStore.delete(k);   // (a new minute for what follows)
  for (const k of [...kvStore.keys()]) if (k.startsWith('tg:rl:888:')) kvStore.delete(k);
  sent.length = 0; for (let i = 0; i < 25; i++) await post({ update_id: ++UPD, message: { message_id: 1, chat: { id: 555, type: 'private' }, from: { id: 555, first_name: 'Samir' }, text: '/menu' } }, ENV.TG_SECRET, ENVK);
  check('…the owner has no such limit', !sent.some(x => /wait a minute/.test(x.b.text || '')));
  // 🧹 /forget
  kvStore.set('tg:888:alerts', '[{"sym":"SOL"}]'); kvStore.set('tg:888:paper', '{}'); kvStore.set('tg:888:hist', '[]'); kvStore.set('fs:pf:UID2', '{}');
  sent.length = 0; await sayAs(888, '/forget');
  check('🧹 /forget → asks first (✅ Yes, delete / ❌ Cancel); nothing deleted yet', /Delete everything/.test(last().b.text) && JSON.stringify(last().b.reply_markup).includes('fg:yes') && kvStore.has('tg:888:alerts'), last().b.text);
  await tapAs(888, 'fg:no');
  check('…❌ Cancel → nothing deleted', kvStore.has('tg:888:alerts') && JSON.parse(kvStore.get('tg:users'))['888'].uid === 'UID2');
  sent.length = 0; await tapAs(888, 'fg:yes');
  const left = [...kvStore.keys()].filter(k => k.startsWith('tg:888:'));
  check('…✅ → alerts, paper, chat memory… gone; the portfolio link removed; today\'s AI counter kept; still a member', !kvStore.has('tg:888:alerts') && !kvStore.has('tg:888:paper') && !kvStore.has('fs:pf:UID2') && left.every(k => /:ai:\d{4}-/.test(k)) && !JSON.parse(kvStore.get('tg:users'))['888'].uid && JSON.parse(kvStore.get('tg:users'))['888'] && /forgotten everything/.test(sent.find(x => x.m === 'editMessageText').b.text), left);
  sent.length = 0; await sayAs(555, '/forget');
  check('…the owner: /forget is for members (points to /new)', /\/new/.test(last().b.text));
}

// ⭐ premium (manual, in /users): voice notes + 20 questions + 3 reports a day
{
  const vMsg = () => post({ update_id: ++UPD, message: { message_id: 3, chat: { id: 888, type: 'private' }, from: { id: 888 }, voice: { file_id: 'VF1', duration: 5, mime_type: 'audio/ogg', file_size: 70000 } } }, ENV.TG_SECRET, { ...ENVV, RATE: KV });
  for (const k of [...kvStore.keys()]) if (k.startsWith('tg:rl:888:')) kvStore.delete(k);
  sent.length = 0; fileGets.length = 0; await vMsg();
  check('🎙 a member who is not premium: a voice note → "for ⭐ premium members", not transcribed', /premium/.test(last().b.text) && fileGets.length === 0, last().b.text);
  sent.length = 0; await tapAs(555, 'us:pr:888');
  const x = JSON.parse(kvStore.get('tg:users'))['888'];
  check('⭐ Premium → 20 questions, 3 reports a day; the member is told; the card shows ⭐', x.premium === true && x.ai === 20 && x.reports === 3 && sent.some(x2 => String(x2.b.chat_id) === '888' && /premium as a gift/.test(x2.b.text || '')) && /⭐/.test(sent.find(x2 => x2.m === 'editMessageText').b.text), x);
  sent.length = 0; fileGets.length = 0; await vMsg();
  check('…now their voice notes work', fileGets.length === 1, sent.map(x2 => (x2.b.text || '').slice(0, 30)));
  await tapAs(555, 'us:pr:888');
  sent.length = 0; for (const k of [...kvStore.keys()]) if (k.startsWith('tg:rl:888:')) kvStore.delete(k);
  await sayAs(888, '/start premium');
  check('⭐ the app\'s "become premium" link (/start premium) → the premium page: what it adds, the price, why, Subscribe', /Cute Portfolio Premium/.test(last().b.text) && /350 ⭐ a month/.test(last().b.text) && /non-profit/.test(last().b.text) && JSON.stringify(last().b.reply_markup).includes('t.me/$inv'), last().b.text.slice(0, 80));
  const y = JSON.parse(kvStore.get('tg:users'))['888'];
  check('☆ off again → back to 5 / 0, no voice', !y.premium && y.ai === 5 && y.reports === 0);
}

// 🔑 a member's own Claude key (Settings → My Claude key → /key)
{
  const mm = JSON.parse(kvStore.get('tg:users')); mm['888'] = { ...mm['888'], email: 'new.member@x.com', premium: undefined, ai: 5, reports: 1 }; kvStore.set('tg:users', JSON.stringify(mm));
  const GOOD = 'sk-ant-good-' + 'a'.repeat(40), BAD = 'sk-ant-nope-' + 'b'.repeat(40);
  const keyReq = (email, uid, body) => W.fetch(new Request(HOST + '/key', { method: 'POST', headers: { Origin: 'https://drsamirsaad1981-design.github.io', 'content-type': 'application/json' }, body: JSON.stringify({ idToken: fbToken(email, uid), ...body }) }), ENVA, {});
  let r = await keyReq('new.member@x.com', 'UID2', { action: 'status' }); let j = await r.json();
  check('🔑 /key status: none yet', r.status === 200 && j.has === false, j);
  r = await keyReq('new.member@x.com', 'UID2', { action: 'set', key: 'hello' });
  check('…not a key shape → refused (400)', r.status === 400);
  r = await keyReq('new.member@x.com', 'UID2', { action: 'set', key: BAD });
  check('…a key Claude refuses → 400, nothing saved', r.status === 400 && !kvStore.has('tg:888:byok'));
  r = await keyReq('new.member@x.com', 'UID2', { action: 'set', key: GOOD }); j = await r.json();
  const stored = kvStore.get('tg:888:byok') || '';
  check('…a working key → saved ENCRYPTED (the key never appears in KV), only its last 4 shown', r.status === 200 && j.has && j.tail === 'aaaa' && stored && !stored.includes(GOOD) && !stored.includes('sk-ant'), [j, stored.slice(0, 60)]);
  r = await keyReq('dr.samir.saad.1981@gmail.com', 'UID1', { action: 'status' });
  check('…the owner (and strangers) can\'t use /key (403)', r.status === 403);
  for (const k of [...kvStore.keys()]) if (k.startsWith('tg:rl:888:')) kvStore.delete(k);
  claudeKeys.length = 0; sent.length = 0; await sayAs(888, 'what is the price of SOL?');
  check('…their questions now run on THEIR key, with 100 a day', claudeKeys.length > 0 && claudeKeys.every(k => k === GOOD) && /\/100 left today/.test(last().b.text), [claudeKeys.map(k => k.slice(0, 12)), last().b.text.slice(-40)]);
  claudeKeys.length = 0; const an2 = await analyze('new.member@x.com', 'UID2'); const anj2 = await an2.json();
  check('…their AI Analysis reports too (10 a day, on their key; 1 used earlier today → 8 left)', an2.status === 200 && claudeKeys.at(-1) === GOOD && anj2.remaining === 8, anj2);
  sent.length = 0; fileGets.length = 0;
  await post({ update_id: ++UPD, message: { message_id: 3, chat: { id: 888, type: 'private' }, from: { id: 888 }, voice: { file_id: 'VF1', duration: 5, mime_type: 'audio/ogg', file_size: 70000 } } }, ENV.TG_SECRET, { ...ENVV, RATE: KV });
  check('…and voice notes work for them (not premium, own key)', fileGets.length === 1);
  sent.length = 0; await tapAs(555, 'us:m:888');
  check('…the owner sees 🔑 "uses their own Claude key (…aaaa)" on the card', /own Claude key \(…aaaa\)/.test(last().b.text), last().b.text);
  check('…the card shows the key\'s limits (100 questions · 10 reports 🔑)', /a day: <b>100<\/b> 🔑/.test(last().b.text) && /a day: <b>10<\/b> 🔑/.test(last().b.text), last().b.text);
  sent.length = 0; await tapAs(555, 'us');
  check('…/users: 🔑 before their name and today …/100 · …/10', /🔑 <b>/.test(last().b.text) && /\/100 · 📊 \d+\/10/.test(last().b.text), last().b.text);
  sent.length = 0; await tapAs(888, 'menu');
  check('…their own hello says "🔑 Your own Claude key" (not ⭐ premium)', /🔑 Your own Claude key/.test(last().b.text) && !/premium member/.test(last().b.text), last().b.text.slice(0, 160));
  // a dead key → a clear message (no silent fallback to Samir's key)
  const DEAD = 'sk-ant-dead-' + 'c'.repeat(40);
  r = await keyReq('new.member@x.com', 'UID2', { action: 'set', key: GOOD });
  const W6 = await fresh(); kvStore.set('tg:888:byok', kvStore.get('tg:888:byok'));
  // (simulate the key dying later: save DEAD directly through the module, as the app would have when it still worked)
  const byok = await import('../tools/worker/byok.mjs'), who = await import('../tools/worker/who.mjs');
  await who.asChat('888', () => byok.saveKey(ENVK, DEAD));
  claudeKeys.length = 0;
  await W6.fetch(new Request(HOST + '/tg', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': ENV.TG_SECRET }, body: JSON.stringify({ update_id: ++UPD, message: { message_id: 1, chat: { id: 888, type: 'private' }, from: { id: 888 }, text: 'what is the price of SOL?' } }) }), ENVK, {});
  check('…their key refused later → "Claude refused your own API key… fix it in the app", Samir\'s key not used', /refused your own API key/.test(last().b.text) && !claudeKeys.includes('sk-test'), [claudeKeys, last().b.text.slice(0, 60)]);
  r = await keyReq('new.member@x.com', 'UID2', { action: 'delete' }); j = await r.json();
  check('…🗑 delete → gone', j.has === false && !kvStore.has('tg:888:byok'));
  await keyReq('new.member@x.com', 'UID2', { action: 'set', key: GOOD });
  for (const k of [...kvStore.keys()]) if (k.startsWith('tg:rl:888:')) kvStore.delete(k);
  await sayAs(888, '/forget'); await tapAs(888, 'fg:yes');
  check('…/forget deletes it too', !kvStore.has('tg:888:byok'));
}

// ⭐💛 Telegram Stars: premium subscription, support, the checks, the end of a month, /stats
{
  for (const k of [...kvStore.keys()]) if (k.startsWith('tg:rl:888:')) kvStore.delete(k);
  const mm = JSON.parse(kvStore.get('tg:users')); mm['888'] = { name: 'New', joined: Date.now(), lang: 'en' }; kvStore.set('tg:users', JSON.stringify(mm)); kvStore.delete('tg:stars:log');
  sent.length = 0; await sayAs(888, '/premium');
  const inv = sent.find(x => x.m === 'createInvoiceLink');
  check('⭐ /premium → a Stars SUBSCRIPTION link: 350 ⭐, every 30 days, for this member only', inv && inv.b.currency === 'XTR' && inv.b.prices[0].amount === 350 && inv.b.subscription_period === 2592000 && inv.b.payload === 'prem:888' && JSON.stringify(last().b.reply_markup).includes('Subscribe'), inv && inv.b);
  const pre = (from, payload, amount) => post({ update_id: ++UPD, pre_checkout_query: { id: 'pc1', from: { id: from }, currency: 'XTR', total_amount: amount, invoice_payload: payload } }, ENV.TG_SECRET, ENVK);
  sent.length = 0; await pre(888, 'prem:888', 350);
  check('…Telegram\'s payment check: the member paying for themselves → OK', sent.some(x => x.m === 'answerPreCheckoutQuery' && x.b.ok === true));
  sent.length = 0; await pre(999, 'prem:888', 350); const no1 = sent.find(x => x.m === 'answerPreCheckoutQuery');
  sent.length = 0; await pre(888, 'prem:888', 5); const no2 = sent.find(x => x.m === 'answerPreCheckoutQuery');
  check('…someone else, or a wrong price → refused (nothing is charged)', no1 && no1.b.ok === false && no2 && no2.b.ok === false);
  const exp = Math.floor(Date.now() / 1000) + 30 * 86400;
  const paidMsg = (sp) => post({ update_id: ++UPD, message: { message_id: 9, chat: { id: 888, type: 'private' }, from: { id: 888 }, successful_payment: { currency: 'XTR', ...sp } } }, ENV.TG_SECRET, ENVK);
  sent.length = 0; await paidMsg({ total_amount: 350, invoice_payload: 'prem:888', telegram_payment_charge_id: 'ch1', subscription_expiration_date: exp, is_recurring: true, is_first_recurring: true });
  let x = JSON.parse(kvStore.get('tg:users'))['888'];
  check('…paid → premium (Stars) until the date Telegram gives, 20 / 3, and a 💛 supporter too; thanked; you are told', x.supporter === true && x.starsPaid === 350 && x.premium && x.premSrc === 'stars' && x.premUntil === exp * 1000 && x.ai === 20 && x.reports === 3 && sent.some(m => String(m.b.chat_id) === '888' && /you're premium now/.test(m.b.text || '')) && sent.some(m => String(m.b.chat_id) === '555' && /subscribed to Premium — 350 ⭐/.test(m.b.text || '')), x);
  sent.length = 0; await paidMsg({ total_amount: 350, invoice_payload: 'prem:888', telegram_payment_charge_id: 'ch2', subscription_expiration_date: exp + 30 * 86400, is_recurring: true, is_first_recurring: false });
  x = JSON.parse(kvStore.get('tg:users'))['888'];
  check('…next month Telegram renews it → "Premium renewed", the end date moves', x.premUntil === (exp + 30 * 86400) * 1000 && sent.some(m => /renewed/.test(m.b.text || '')));
  sent.length = 0; await sayAs(888, '/premium');
  check('…/premium now says "premium until …, renews by itself" (no second Subscribe)', /premium until/.test(last().b.text) && /renews by itself/.test(last().b.text) && !sent.some(m => m.m === 'createInvoiceLink'), last().b.text.slice(-120));
  // 💛 support
  sent.length = 0; await sayAs(888, '/support');
  check('💛 /support → optional, any size, a badge; 50 / 100 / 250 / 500 ⭐', /Optional/.test(last().b.text) && /Supporter 💛/.test(last().b.text) && ['sp:50', 'sp:100', 'sp:250', 'sp:500'].every(k => JSON.stringify(last().b.reply_markup).includes(k)), last().b.text);
  sent.length = 0; await tapAs(888, 'sp:100'); const si = sent.find(m => m.m === 'sendInvoice');
  check('…tap 100 ⭐ → a one-time Stars invoice of 100', si && si.b.currency === 'XTR' && si.b.prices[0].amount === 100 && si.b.payload === 'sup:888:100' && !si.b.subscription_period, si && si.b);
  sent.length = 0; await paidMsg({ total_amount: 100, invoice_payload: 'sup:888:100', telegram_payment_charge_id: 'ch3' });
  x = JSON.parse(kvStore.get('tg:users'))['888'];
  check('…paid → Supporter 💛 (+100 ⭐ on top of the 700 of premium — a premium member counts as a supporter), thanked, you are told', x.supporter === true && x.starsPaid === 800 && sent.some(m => /Supporter 💛/.test(m.b.text || '')) && sent.some(m => String(m.b.chat_id) === '555' && /supported the project with 100 ⭐/.test(m.b.text || '')), x);
  await paidMsg({ total_amount: 100, invoice_payload: 'sup:888:100', telegram_payment_charge_id: 'ch3' });
  sent.length = 0; await sayAs(555, '/stats');
  check('📈 /stats (you): members, premium now (Stars / gift), supporters, Stars this month and all time (a payment sent twice counts once)', /Premium now: <b>1<\/b> \(Stars 1/.test(last().b.text) && /Supporters: <b>1<\/b>/.test(last().b.text) && /All time: <b>800<\/b>/.test(last().b.text), last().b.text);
  sent.length = 0; await sayAs(888, '/stats');
  check('…/stats is yours only', /Only the bot owner/.test(last().b.text));
  // the month ends (no renewal) → back to standard, told
  const m2 = JSON.parse(kvStore.get('tg:users')); m2['888'].premUntil = Date.now() - 1000; kvStore.set('tg:users', JSON.stringify(m2));
  sent.length = 0; const W8 = await fresh(); const pw = []; await W8.scheduled({ cron: '*/5 * * * *', scheduledTime: RIYADH('03:15') }, ENVK, { waitUntil: x2 => pw.push(x2) }); await Promise.all(pw);
  x = JSON.parse(kvStore.get('tg:users'))['888'];
  check('⏳ the paid month ended (cancelled in Telegram) → back to 5 / 0, told "premium has ended"', !x.premium && x.ai === 5 && x.reports === 0 && x.supporter === true && sent.some(m => String(m.b.chat_id) === '888' && /premium has ended/.test(m.b.text || '')), x);
  // 🎁 a gift of 30 days, and a reminder 3 days before its end
  sent.length = 0; await tapAs(555, 'us:pd:30:888');
  x = JSON.parse(kvStore.get('tg:users'))['888'];
  check('🎁 +30 days (from /users or a gift request) → premium (gift) for 30 days; the member is told until when', x.premium && x.premSrc === 'gift' && Math.abs(x.premUntil - (Date.now() + 30 * 864e5)) < 60e3 && sent.some(m => String(m.b.chat_id) === '888' && /gift — until/.test(m.b.text || '')), x);
  const m3 = JSON.parse(kvStore.get('tg:users')); m3['888'].premUntil = Date.now() + 2 * 864e5; kvStore.set('tg:users', JSON.stringify(m3));
  sent.length = 0; const W9 = await fresh(); const pw2 = []; await W9.scheduled({ cron: '*/5 * * * *', scheduledTime: RIYADH('03:20') }, ENVK, { waitUntil: x2 => pw2.push(x2) }); await Promise.all(pw2);
  check('…2 days before a gift ends → one reminder ("/premium")', sent.filter(m => String(m.b.chat_id) === '888' && /ends on/.test(m.b.text || '')).length === 1);
  // the webhook asks Telegram for the payment checks too (once)
  kvStore.delete('tg:hookv'); sent.length = 0; await postK(await fresh(), '/menu'); await postK(await fresh(), '/menu');
  const hooks = sent.filter(m => m.m === 'setWebhook');
  check('🔌 the webhook is updated once to receive Telegram\'s payment checks (pre_checkout_query)', hooks.length === 1 && hooks[0].b.allowed_updates.includes('pre_checkout_query') && hooks[0].b.drop_pending_updates === false, hooks.map(h => h.b));
}

// 🛠 the app's admin dashboard (/admin) — the owner only; the same powers as /users, /invite, /stats
{
  const adm = (email, uid, body) => W.fetch(new Request(HOST + '/admin', { method: 'POST', headers: { Origin: 'https://drsamirsaad1981-design.github.io', 'content-type': 'application/json' }, body: JSON.stringify({ idToken: fbToken(email, uid), ...body }) }), ENVA, {});
  let r = await adm('new.member@x.com', 'UID2', { action: 'overview' });
  check('🛠 /admin: a member (or anyone but you) → 403', r.status === 403);
  r = await adm('dr.samir.saad.1981@gmail.com', 'UID1', { action: 'overview' }); let j = await r.json();
  const n = j.members && j.members.find(x => x.chat === '888');
  check('…you → the numbers (members, premium, supporters, Stars month / all time) + every member (badges, limits, use today) + the Stars log', r.status === 200 && j.stats.members >= 1 && j.stats.supporters >= 1 && j.stats.starsAll >= 450 && n && n.supporter === true && typeof n.usedQ === 'number' && Array.isArray(j.payments) && j.payments.length >= 2 && j.price === 350, JSON.stringify(j).slice(0, 300));
  kvStore.set('tg:botname', 'samsam_portfolio_bot'); sent.length = 0; r = await adm('dr.samir.saad.1981@gmail.com', 'UID1', { action: 'invite' }); j = await r.json();
  check('…➕ new invite → a code + its t.me link (7 days), usable in the bot', /^[A-Z2-9]{8}$/.test(j.code) && /t\.me\/.+\?start=/.test(j.link || '') && kvStore.has('tg:inv:' + j.code), j);
  sent.length = 0; r = await adm('dr.samir.saad.1981@gmail.com', 'UID1', { action: 'member', chat: '888', op: 'gift30' }); j = await r.json();
  let x = JSON.parse(kvStore.get('tg:users'))['888'];
  check('…🎁 +30 days from the dashboard → premium (gift), the member is told, the answer carries the fresh overview', j.ok && premOn(x) && sent.some(m => String(m.b.chat_id) === '888' && /gift/.test(m.b.text || '')) && j.overview && j.overview.members.find(y => y.chat === '888').premium, x);
  await adm('dr.samir.saad.1981@gmail.com', 'UID1', { action: 'member', chat: '888', op: 'ai+' });
  check('…🧠 + → the question limit goes up', JSON.parse(kvStore.get('tg:users'))['888'].ai === x.ai + 1);
  await adm('dr.samir.saad.1981@gmail.com', 'UID1', { action: 'member', chat: '888', op: 'pause' });
  check('…⏸ pause / ▶️ resume', JSON.parse(kvStore.get('tg:users'))['888'].paused === true && (await (await adm('dr.samir.saad.1981@gmail.com', 'UID1', { action: 'member', chat: '888', op: 'resume' })).json()).ok && !JSON.parse(kvStore.get('tg:users'))['888'].paused);
  kvStore.set('tg:appreq:888', 'new.friend@x.com'); accessWrites.length = 0;
  j = await (await adm('dr.samir.saad.1981@gmail.com', 'UID1', { action: 'overview' })).json();
  const pend = j.members.find(y => y.chat === '888').pending;
  await adm('dr.samir.saad.1981@gmail.com', 'UID1', { action: 'member', chat: '888', op: 'approve' });
  check('…📱 an app request waiting shows, ✅ approve → the e-mail allowed (config/access)', pend === 'new.friend@x.com' && JSON.parse(kvStore.get('tg:users'))['888'].email === 'new.friend@x.com' && accessWrites.length === 1);
  await adm('dr.samir.saad.1981@gmail.com', 'UID1', { action: 'member', chat: '888', op: 'endPrem' });
  check('…☆ end premium', !premOn(JSON.parse(kvStore.get('tg:users'))['888']));
}

// 📱 an invite opened in the APP: /join → in at once; later the bot links in one step. Max members; the quiet 5-minute round
{
  const ADM = (body) => W.fetch(new Request(HOST + '/admin', { method: 'POST', headers: { Origin: 'https://drsamirsaad1981-design.github.io', 'content-type': 'application/json' }, body: JSON.stringify({ idToken: fbToken('dr.samir.saad.1981@gmail.com', 'UID1'), ...body }) }), ENVA, {});
  const JOIN = (email, uid, code) => W.fetch(new Request(HOST + '/join', { method: 'POST', headers: { Origin: 'https://drsamirsaad1981-design.github.io', 'content-type': 'application/json' }, body: JSON.stringify({ idToken: fbToken(email, uid), code }) }), ENVA, {});
  let j = await (await ADM({ action: 'invite' })).json();
  check('➕ an invite now has two links: the bot\'s and the app\'s (…/samsam-portfolio/?invite=CODE)', /\?invite=/.test(j.appLink || '') && j.appLink.endsWith(j.code), j);
  let r = await JOIN('mona@x.com', 'UIDM', 'WRONGXX1');
  check('📱 /join with a wrong code → 400, nothing allowed', r.status === 400);
  accessWrites.length = 0; sent.length = 0;
  r = await JOIN('Mona@X.com', 'UIDM', j.code); const jj = await r.json();
  const ms = JSON.parse(kvStore.get('tg:users'));
  check('📱 /join with the code → in at once (no second approval): an app member "a:UIDM", e-mail on the access list, the code used up, you get a note', r.status === 200 && jj.ok && ms['a:UIDM'] && ms['a:UIDM'].email === 'mona@x.com' && accessWrites.length === 1 && JSON.stringify(accessWrites[0]).includes('mona@x.com') && !kvStore.has('tg:inv:' + j.code) && sent.some(m => /joined from the app/.test(m.b.text || '')), [jj, Object.keys(ms)]);
  r = await JOIN('mona@x.com', 'UIDM', j.code);
  check('…opening the link again (same account) → fine, nothing new used', r.status === 200 && (await r.json()).already === true);
  sent.length = 0; const W7 = await fresh(); const pw = []; await W7.scheduled({ cron: '*/5 * * * *', scheduledTime: RIYADH('03:25') }, ENVK, { waitUntil: x => pw.push(x) }); await Promise.all(pw);
  check('…an app-only member gets no Telegram messages from the 5-minute round', !sent.some(m => String(m.b.chat_id).startsWith('a:')));
  j = await (await ADM({ action: 'overview' })).json();
  check('🛠 the dashboard shows them as an app member (📱, no bot yet)', j.members.some(m => m.chat === 'a:UIDM' && m.appOnly === true));
  // later: the app's "Link the Telegram bot" (/start LCODE) from a chat the bot doesn't know yet
  TGLINK = { code: 'M0NA2LNK', exp: new Date(Date.now() + 5 * 60e3).toISOString(), email: 'mona@x.com' };
  TGLINK_UID = 'UIDM';
  sent.length = 0; await post({ update_id: ++UPD, message: { message_id: 1, chat: { id: 4444, type: 'private' }, from: { id: 4444, first_name: 'Mona', username: 'mona', language_code: 'en' }, text: '/start LM0NA2LNK' } }, ENV.TG_SECRET, ENVK);
  const ms2 = JSON.parse(kvStore.get('tg:users'));
  check('🔗 /start L<code> from the app member\'s Telegram → they\'re in AND linked in one step (record moved to their chat), welcomed; you get a note', !ms2['a:UIDM'] && ms2['4444'] && ms2['4444'].email === 'mona@x.com' && ms2['4444'].uid === 'UIDM' && ms2['4444'].user === 'mona' && sent.some(m => String(m.b.chat_id) === '4444' && /Linked/.test(m.b.text || '')) && sent.some(m => String(m.b.chat_id) === '555' && /📱→🤖/.test(m.b.text || '')), [Object.keys(ms2), sent.map(m => (m.b.text || '').slice(0, 40))]);
  TGLINK_UID = 'UID2';
  // max members (20 / 50 / 100) from the dashboard
  j = await (await ADM({ action: 'setMax', max: 50 })).json();
  check('👥 max members → 50 from the dashboard (20 / 50 / 100 only)', j.max === 50 && (await ADM({ action: 'setMax', max: 7 })).status === 400);
  sent.length = 0; await sayAs(555, '/users');
  check('…/users shows x/50', /\/50\)/.test(last().b.text), last().b.text.slice(0, 60));
  await ADM({ action: 'setMax', max: 20 });
  // the quiet round: it asked Firebase lately → no question at all this time
  kvStore.delete('fs:pf:UID1'); await postK(await fresh(), '/portfolio');   // a full read (now "checked")
  AGG_CALLS = 0; LIST_TXS = 0; const W10 = await fresh(); const pw3 = []; await W10.scheduled({ cron: '*/5 * * * *', scheduledTime: RIYADH('03:30') }, ENVK, { waitUntil: x => pw3.push(x) }); await Promise.all(pw3);
  check('📉 the 5-minute round right after a check: no Firebase question at all (0 counts, 0 full reads)', AGG_CALLS === 0 && LIST_TXS === 0, [AGG_CALLS, LIST_TXS]);
  const k = JSON.parse(kvStore.get('fs:pf:UID1')); k.checked -= 11 * 60e3; kvStore.set('fs:pf:UID1', JSON.stringify(k));
  AGG_CALLS = 0; const W11 = await fresh(); const pw4 = []; await W11.scheduled({ cron: '*/5 * * * *', scheduledTime: RIYADH('03:35') }, ENVK, { waitUntil: x => pw4.push(x) }); await Promise.all(pw4);
  check('…11 minutes later the owner\'s portfolio is asked again (members: 30)', AGG_CALLS === 0 || AGG_CALLS === 3, AGG_CALLS);
}

// 🔌 /balances — the exchanges' live balances next to the app (keys connected in the app; here from the 1-minute cache)
{
  const { seal } = await import('../tools/worker/byok.mjs');
  const ENVB = { ...ENVK, FIREBASE_UID: 'UIDX' };
  kvStore.set('cex:UIDX', JSON.stringify({ binance: { v: await seal(ENVB, JSON.stringify({ k: 'x', s: 'y' })), tail: 'ab12', at: '2026-11-17', readOnly: true } }));
  kvStore.set('cex:UIDX:bal', JSON.stringify({ t: Date.now(), b: [{ ex: 'binance', name: 'Binance', ok: true, assets: [{ sym: 'SOL', spot: 4, funding: 0, earn: 6 }, { sym: 'BTC', spot: 0.05, funding: 0, earn: 0 }, { sym: 'ZZZ', spot: 3, funding: 0, earn: 0 }] }] }));
  for (const k of [...kvStore.keys()]) if (k.startsWith('tg:rl:')) kvStore.delete(k);
  sent.length = 0; await post({ update_id: ++UPD, message: { message_id: 1, chat: { id: 555, type: 'private' }, from: { id: 555, first_name: 'S', language_code: 'en' }, text: '/balances' } }, ENV.TG_SECRET, ENVB);
  const bv = sent.filter(m => m.m === 'sendMessage').at(-1);
  check('🔌 /balances → Binance balances next to the app: SOL 10 (spot 4 + earn 6) vs 15 in the app, BTC ▫️ (the rest elsewhere), ZZZ not in the app', bv && /Exchanges · live balances/.test(bv.b.text) && /<b>SOL<\/b> 10 · \$1,500\n +app: 15/.test(bv.b.text) && /▫️ <b>BTC<\/b> 0\.05/.test(bv.b.text) && /Not in the app<\/b> \(1\)\n▪️ ZZZ 3/.test(bv.b.text) && okHtml(bv.b.text) && JSON.stringify(bv.b.reply_markup).includes('bal:r'), bv && bv.b.text);
  kvStore.delete('cex:UIDX'); kvStore.delete('cex:UIDX:bal');
  sent.length = 0; await post({ update_id: ++UPD, message: { message_id: 1, chat: { id: 555, type: 'private' }, from: { id: 555, first_name: 'S', language_code: 'en' }, text: '/balances' } }, ENV.TG_SECRET, ENVB);
  const bn = sent.filter(m => m.m === 'sendMessage').at(-1);
  check('…no exchange connected → how to connect one in the app (read-only key), with 📱 Open in the app', bn && /No exchange connected/.test(bn.b.text) && /performance\.html/.test(JSON.stringify(bn.b.reply_markup)), bn && bn.b.text);
}

// 📘 /guide — the same guide as the app (guide.json), both languages, every part opens in place
{
  const G = JSON.parse(fs.readFileSync(path.join(ROOT, 'guide.json'), 'utf8'));
  check('📘 guide.json: every part has a title, English and Arabic lines, Telegram-safe HTML', G.sections.length >= 12 && G.sections.every(x => x.k && x.e && x.t.en && x.t.ar && x.en.length && x.ar.length && [...x.en, ...x.ar].every(l => okHtml(l))), G.sections.filter(x => ![...x.en, ...x.ar].every(l => okHtml(l))).map(x => x.k));
  for (const k of [...kvStore.keys()]) if (k.startsWith('tg:rl:')) kvStore.delete(k);
  sent.length = 0; await sayAs(555, '/guide');
  check('…/guide → the index: one button per part (two in a row) + Menu', /the guide|الدليل/.test(last().b.text) && G.sections.every(x => JSON.stringify(last().b.reply_markup).includes('gd:' + x.k)), last().b.text);
  sent.length = 0; await tapAs(555, 'gd:alerts');
  const ed = sent.find(x => x.m === 'editMessageText');
  check('…tap a part → it opens in the same message, with ⬅️ Guide', ed && /🔔/.test(ed.b.text) && JSON.stringify(ed.b.reply_markup).includes('"gd"'), ed && ed.b.text.slice(0, 80));
  check('…a card: summary in italics, numbered steps 1️⃣ 2️⃣, a 💡 tip, /alerts as plain (tappable) text', ed && /<i>/.test(ed.b.text) && /1️⃣/.test(ed.b.text) && /2️⃣/.test(ed.b.text) && /💡 <b>Tip:<\/b>/.test(ed.b.text) && /\/alerts/.test(ed.b.text) && !/<code>\/alerts/.test(ed.b.text) && okHtml(ed.b.text), ed && ed.b.text);
  const kb = ed && JSON.stringify(ed.b.reply_markup);
  check('…◀️ Previous (coins) · 📘 Index · Next ▶️ (trades)', kb && kb.includes('gd:coins') && kb.includes('gd:trades') && /Previous/.test(kb) && /Next/.test(kb), kb);
  sent.length = 0; await tapAs(555, 'gd:start'); const e1 = sent.find(x => x.m === 'editMessageText');
  check('…the first part: no Previous', e1 && !/Previous/.test(JSON.stringify(e1.b.reply_markup)) && /Next/.test(JSON.stringify(e1.b.reply_markup)));
  const bm = await import('../tools/worker/bot.mjs'), va = bm.guideView('ar', 'alerts'), vi = bm.guideView('ar');
  check('…Arabic: every line starts right-to-left, commands kept as an LTR island, نصيحة, السابق/التالي', va.text.split('\n').filter(l => l && !/^🔔/.test(l)).every(l => l[0] === '\u200F') && va.text.includes('\u200E/alerts\u200E') && /نصيحة/.test(va.text) && /السابق/.test(JSON.stringify(va.buttons)) && /التالي/.test(JSON.stringify(va.buttons)), va.text);
  check('…the index in groups (🚀 📅 ✨ 👤), each group starts a new row of buttons', /🚀 <b>البداية<\/b>/.test(vi.text) && /👤 <b>الحساب<\/b>/.test(vi.text) && vi.buttons[1].length === 1 && vi.buttons[1][0].callback_data === 'gd:link', vi.buttons.map(r => r.map(x => x.callback_data).join()));
  check('📘 guide.json: every part has a summary, a tip, a group, 2–5 steps', G.sections.every(x => x.s && x.s.en && x.s.ar && x.tip && x.tip.en && x.tip.ar && G.groups.some(g => g.k === x.g) && x.en.length >= 2 && x.en.length <= 5 && x.en.length === x.ar.length), G.sections.filter(x => !(x.s && x.tip && x.en.length === x.ar.length)).map(x => x.k));
}

// 👥 the channel + its comments (the discussion group) — one place since 20 Nov
{
  const upd = o => post({ update_id: ++UPD, ...o }, ENV.TG_SECRET, ENVK);
  const added = (chatObj, from, status = 'administrator') => upd({ my_chat_member: { chat: chatObj, from: { id: from }, date: 1, old_chat_member: { status: 'left', user: { id: 1 } }, new_chat_member: { status, user: { id: 1 } } } });
  kvStore.delete('tg:community');
  sent.length = 0; await added({ id: -1009, type: 'supergroup', title: 'Spam' }, 999);
  check('👥 someone else adds the bot to a group → it leaves at once', sent.some(m => m.m === 'leaveChat' && m.b.chat_id === -1009) && !kvStore.has('tg:community'));
  sent.length = 0; await added({ id: -1001, type: 'channel', title: 'Cute Portfolio Signals' }, 555);
  let c = JSON.parse(kvStore.get('tg:community') || '{}');
  check('📢 you add it to the channel as admin → remembered, a join link that needs approval, you get the link', c.channel && c.channel.id === -1001 && c.channel.link && sent.some(m => m.m === 'createChatInviteLink' && m.b.creates_join_request === true) && sent.some(m => String(m.b.chat_id) === '555' && /is set up/.test(m.b.text || '')), c);
  const gp = sent.find(m => m.m === 'sendMessage' && m.b.chat_id === -1001);
  check('📘 …and a guide post in the channel (both languages, /feedback), pinned; its LINK (no buttons: they hide the comments) opens the guide in the bot', gp && /Getting started · البداية/.test(gp.b.text) && /\/feedback/.test(gp.b.text) && okHtml(gp.b.text) && gp.b.text.includes('href="https://t.me/samsam_portfolio_bot?start=guide"') && !gp.b.reply_markup && sent.some(m => m.m === 'pinChatMessage' && m.b.chat_id === -1001) && c.channel.guideMsg, gp && gp.b);
  check('…no forum topics any more', !sent.some(m => /Forum/.test(m.m)));
  globalThis.__unlinked = true;
  sent.length = 0; await added({ id: -1002, type: 'supergroup', title: 'Cute Portfolio Community' }, 555);
  check('💬 the group, not linked to the channel yet → you are told how (channel → Edit → Discussion)', /Discussion/.test(last().b.text) && !JSON.parse(kvStore.get('tg:community')).group.linked && !sent.some(m => m.m === 'createChatInviteLink'), last().b.text);
  globalThis.__unlinked = false;
  for (const k of [...kvStore.keys()]) if (k.startsWith('tg:rl:')) kvStore.delete(k);
  sent.length = 0; await sayAs(555, '/community setup');
  c = JSON.parse(kvStore.get('tg:community'));
  check('…linked in Telegram → /community setup: "comments are on", the group remembered as the channel\'s discussion', c.group.linked === true && sent.some(m => /Comments are on/.test(m.b.text || '')) && !sent.some(m => m.m === 'sendMessage' && m.b.chat_id === -1001), sent.map(m => m.m));
  { // 🧹 /community revoke: the bot switches off the old join links it made — never the current one; members can't
    const cur = 'https://t.me/+CURlink000000000A', code = cur.split('+').pop(); kvStore.set('tg:community', JSON.stringify({ ...c, channel: { ...c.channel, link: cur } }));
    sent.length = 0; await sayAs(555, `/community revoke https://t.me/+OLDlink0000000001 t.me/+OLDlink0000000002 ${cur}`);
    const rv = sent.filter(m => m.m === 'revokeChatInviteLink');
    check('🧹 /community revoke <links> → each old link revoked by the bot in the channel, the current join link kept, one summary', rv.length === 2 && rv.every(m => m.b.chat_id === c.channel.id) && rv[0].b.invite_link === 'https://t.me/+OLDlink0000000001' && !rv.some(m => m.b.invite_link.endsWith(code)) && /Old join links/.test(last().b.text) && /the current join link, kept/.test(last().b.text) && JSON.parse(kvStore.get('tg:community')).channel.link === cur, [rv.map(m => m.b), last().b.text]);
    sent.length = 0; await sayAs(888, '/community revoke https://t.me/+OLDlink0000000003');
    check('…members can\'t', !sent.some(m => m.m === 'revokeChatInviteLink') && /Only the bot owner/.test(last().b.text), last().b.text);
  }
  kvStore.set('tg:community', JSON.stringify({ ...JSON.parse(kvStore.get('tg:community')), channel: undefined }));
  sent.length = 0; await post({ update_id: ++UPD, message: { message_id: 5, chat: { id: 555, type: 'private' }, from: { id: 555 }, forward_origin: { type: 'channel', chat: { id: -1003, type: 'channel', title: 'Signals 2' }, message_id: 1 }, text: 'hi' } }, ENV.TG_SECRET, ENVK);
  check('📢 you forward a channel post to the bot (it\'s admin there) → that channel is set up', JSON.parse(kvStore.get('tg:community')).channel.id === -1003 && sent.some(m => /is set up/.test(m.b.text || '')));
  kvStore.set('tg:community', JSON.stringify({ ...JSON.parse(kvStore.get('tg:community')), channel: c.channel }));
  // join requests
  const req = (chatId, from) => upd({ chat_join_request: { chat: { id: chatId, type: 'channel', title: 'Cute Portfolio Signals' }, from: { id: from }, user_chat_id: from, date: 1 } });
  sent.length = 0; await req(-1001, 888);
  check('🚪 a member asks to join → approved (+ a welcome DM)', sent.some(m => m.m === 'approveChatJoinRequest' && m.b.user_id === 888) && sent.some(m => String(m.b.chat_id) === '888' && /You're in/.test(m.b.text || '')));
  sent.length = 0; await req(-1001, 31337);
  check('…a stranger → declined', sent.some(m => m.m === 'declineChatJoinRequest' && m.b.user_id === 31337) && !sent.some(m => m.m === 'approveChatJoinRequest'));
  for (const k of [...kvStore.keys()]) if (k.startsWith('tg:rl:')) kvStore.delete(k);
  sent.length = 0; await sayAs(888, '/community');
  check('👥 /community (members) → the channel\'s link only; talk in the comments, ideas via /feedback', /members only/.test(last().b.text) && /comment/.test(last().b.text) && /\/feedback/.test(last().b.text) && JSON.stringify(last().b.reply_markup).includes('+join-1001') && !JSON.stringify(last().b.reply_markup).includes('+join-1002'), last().b.text);
  sent.length = 0; await sayAs(555, '/announce The app now speaks Arabic!');
  check('📣 /announce (you) → the channel (🆕 What\'s new)', sent.some(m => m.b.chat_id === -1001 && /speaks Arabic/.test(m.b.text || '') && /🆕/.test(m.b.text)) && !sent.some(m => m.b.chat_id === -1002) && /📢/.test(last().b.text));
  // 💡 /feedback
  for (const k of [...kvStore.keys()]) if (k.startsWith('tg:rl:')) kvStore.delete(k);
  sent.length = 0; await sayAs(888, '/feedback المحفظة ما تفتح على الآيفون');
  check('💡 /feedback <text> (a member) → to you with who sent it; the member is thanked (never read as "portfolio")', sent.some(m => String(m.b.chat_id) === '555' && /Feedback/.test(m.b.text || '') && /المحفظة ما تفتح/.test(m.b.text)) && /Samir|سمير/.test(last().b.text) && String(last().b.chat_id) === '888', sent.map(m => [m.b.chat_id, (m.b.text || '').slice(0, 40)]));
  sent.length = 0; await sayAs(888, '/feedback');
  check('…/feedback alone → how to use it (nothing sent to you)', /\/feedback/.test(last().b.text) && !sent.some(m => String(m.b.chat_id) === '555'));
  sent.length = 0; await sayAs(888, '/start guide');
  check('📘 /start guide (the channel post\'s button) → the guide', JSON.stringify(last().b.reply_markup || {}).includes('gd:'), last().b.text);
  sent.length = 0; await sayAs(888, '/announce hi');
  check('…members can\'t announce', /Only the bot owner/.test(last().b.text) && !sent.some(m => m.b.chat_id === -1001));
  // the market pulse at 09:00 Riyadh, once, pinned
  sent.length = 0; const Wp = await fresh(); const pp = []; await Wp.scheduled({ cron: '*/5 * * * *', scheduledTime: RIYADH('09:05') }, ENVK, { waitUntil: x => pp.push(x) }); await Promise.all(pp);
  const pulse = sent.find(m => m.m === 'sendMessage' && m.b.chat_id === -1001);
  check('📢 09:05 → the market pulse in the channel (BTC, cap, dominance, Fear & Greed, movers, "not financial advice"), pinned', pulse && /Market pulse/.test(pulse.b.text) && /BTC/.test(pulse.b.text) && /Not financial advice/.test(pulse.b.text) && okHtml(pulse.b.text) && sent.some(m => m.m === 'pinChatMessage' && m.b.chat_id === -1001), pulse && pulse.b.text);
  check('…with a 🧭 Market Hub link in the text and NO buttons (Telegram hides the comments of a post with buttons)', /<a href="https:\/\/drsamirsaad1981-design\.github\.io\/samsam-portfolio\/market\.html">Market Hub<\/a>/.test(pulse.b.text) && !pulse.b.reply_markup, pulse && pulse.b);
  check('…the English and Arabic "not financial advice" on two lines', /Not financial advice — for information only\.<\/i>\n<i>/.test(pulse.b.text), pulse && pulse.b.text.slice(-160));
  sent.length = 0; const Wq = await fresh(); const pq = []; await Wq.scheduled({ cron: '*/5 * * * *', scheduledTime: RIYADH('09:10') }, ENVK, { waitUntil: x => pq.push(x) }); await Promise.all(pq);
  check('…+ 🥇 gold · silver (no Brent) and 🇺🇸 US stocks (state, best CRCLB, worst GMEB)', /🥇 Gold <b>\$2,650<\/b>/.test(pulse.b.text) && /Silver/.test(pulse.b.text) && !/Brent/.test(pulse.b.text) && /🇺🇸 US stocks (Open|Pre-market|After hours|Closed) · CRCLB \+7\.8% · GMEB −6\.2%/.test(pulse.b.text), pulse.b.text);
  check('…once a morning (09:10 → nothing new)', !sent.some(m => m.b.chat_id === -1001 && /Market pulse/.test(m.b.text || '')));
  // 🔥 13:00 the sector map · 🧲 17:30 leverage & whales — two more posts between the morning and the evening pulse
  sent.length = 0; { const Ws = await fresh(), ps = []; await Ws.scheduled({ cron: '*/5 * * * *', scheduledTime: RIYADH('13:05') }, ENVK, { waitUntil: x => ps.push(x) }); await Promise.all(ps); }
  const secP = sent.find(m => m.m === 'sendMessage' && m.b.chat_id === -1001);
  check('🔥 13:05 → "Sector map" in the channel: strongest / weakest sectors (≥ $1B) with their leaders, both languages, no buttons (comments stay), not pinned', secP && /Sector map<\/b> · \d+ \w+\n🔥 <b>خريطة القطاعات<\/b>/.test(secP.b.text) && /Strongest 24h/.test(secP.b.text) && /AI<\/b> \+14\.2%/.test(secP.b.text) && /Weakest 24h/.test(secP.b.text) && /Meme<\/b> −11\.5%/.test(secP.b.text) && !/Tiny/.test(secP.b.text) && /Not financial advice/.test(secP.b.text) && !secP.b.reply_markup && okHtml(secP.b.text) && !sent.some(m => m.m === 'pinChatMessage' && m.b.chat_id === -1001), secP && secP.b.text);
  sent.length = 0; { const Ws = await fresh(), ps = []; await Ws.scheduled({ cron: '*/5 * * * *', scheduledTime: RIYADH('13:10') }, ENVK, { waitUntil: x => ps.push(x) }); await Promise.all(ps); }
  check('…once a day', !sent.some(m => m.m === 'sendMessage' && m.b.chat_id === -1001));
  market.whales = { t: new Date(RIYADH('15:00')).toISOString(), src: 'Hyperliquid', n: 25, coins: { BTC: { long: 14, short: 6, longUsd: 3.1e8, shortUsd: 1.2e8, side: 'long' }, ETH: { long: 5, short: 11, longUsd: 4e7, shortUsd: 1.5e8, side: 'short' } } };
  sent.length = 0; { const Ws = await fresh(), ps = []; await Ws.scheduled({ cron: '*/5 * * * *', scheduledTime: RIYADH('17:35') }, ENVK, { waitUntil: x => ps.push(x) }); await Promise.all(ps); }
  const levP = sent.find(m => m.m === 'sendMessage' && m.b.chat_id === -1001);
  check('🧲 17:35 → "Leverage & whales": BTC · ETH · SOL funding / OI / longs, 🐋 the 25 biggest winning traders (BTC 14 long · 6 short), the US market, both languages', levP && /Leverage &amp; whales<\/b> · \d+ \w+\n🧲 <b>الرافعة والحيتان<\/b>/.test(levP.b.text) && /<b>BTC<\/b> · funding/.test(levP.b.text) && /<b>SOL<\/b> · /.test(levP.b.text) && /the 25 biggest winning traders on Hyperliquid/.test(levP.b.text) && /<b>BTC<\/b>: 14 long · 6 short — \$310M vs \$120M/.test(levP.b.text) && /<b>ETH<\/b>: 5 long · 11 short/.test(levP.b.text) && /🇺🇸 US market: /.test(levP.b.text) && /الحيتان يتحوّطون/.test(levP.b.text) && !levP.b.reply_markup && okHtml(levP.b.text), levP && levP.b.text);
  { // 📢 two languages in the channel = an English line and an Arabic line; a line never starts in one and carries the other
    const mixed = t => String(t || '').split('\n').map(l => l.replace(/<[^>]+>/g, '')).filter(l => { const ar = (l.match(/[\u0600-\u06FF]/g) || []).length, first = (l.match(/[A-Za-z\u0600-\u06FF]/) || [''])[0]; return ar > 0 && /[A-Za-z]/.test(first); });
    const bad = [pulse, secP, levP].filter(Boolean).flatMap(x => mixed(x.b.text));
    check('📢 channel posts: every line is English OR Arabic (an Arabic line starts in Arabic) — the two never run into each other', pulse && secP && levP && !bad.length && /Market pulse<\/b> · \d+ \w+\n[^<]+<b>نبض السوق<\/b>/.test(pulse.b.text), bad);
  }
  delete market.whales;
  sent.length = 0; await post({ update_id: ++UPD, message: { message_id: 1, chat: { id: -1002, type: 'supergroup' }, from: { id: 888 }, text: 'hello everyone' } }, ENV.TG_SECRET, ENVK);
  check('💬 people commenting (the discussion group) → the bot stays quiet', sent.filter(m => m.m === 'sendMessage').length === 0);
}

// 🌐 ONE language everywhere: the bot's language and the alerts' language (app → Alerts) are the same setting
{
  const C = ENV.TELEGRAM_CHAT_ID, LK = `tg:${C}:lang`, SK = `tg:${C}:alsync`, TK = SK + 'T', at = RIYADH('03:10'), keep = USER().meta, keepL = kvStore.get(LK);
  const set = (bot, sync, ago, alerts) => { kvStore.delete('fs:pf:UID1'); kvStore.set(LK, bot); kvStore.set(SK, sync); kvStore.set(TK, String(at - ago)); globalThis.__metaOver = { ...keep, alerts: { ...(keep && keep.alerts), ...alerts } }; globalThis.__alertsLang = []; };
  const wrote = () => (globalThis.__alertsLang || []).filter(w => /users\/UID1\//.test(w.u)).map(w => w.body.fields.alerts.mapValue.fields.lang.stringValue);
  set('en', 'en', 2 * 3600e3, { lang: 'ar', langPicked: true }); await cronG(ENVK, at);
  check('🌐 Arabic picked in the app (Alerts → Language) → the bot speaks Arabic too, nothing overwritten', kvStore.get(LK) === 'ar' && kvStore.get(SK) === 'ar' && !wrote().length, [kvStore.get(LK), wrote()]);
  set('en', 'en', 5 * 60e3, { lang: 'ar', langPicked: true }); await cronG(ENVK, at);
  check('🌐 /lang English a moment ago (the settings copy may be old) → never undone: the alerts are set to English', kvStore.get(LK) === 'en' && wrote().join() === 'en', [kvStore.get(LK), wrote()]);
  set('ar', 'en', 2 * 3600e3, { lang: 'en', langPicked: true }); await cronG(ENVK, at);
  check('🌐 the bot is Arabic, the alerts still English → the alerts become Arabic', kvStore.get(LK) === 'ar' && wrote().join() === 'ar' && kvStore.get(SK) === 'ar', [kvStore.get(LK), wrote()]);
  set('en', 'en', 2 * 3600e3, { lang: 'en', langPicked: true }); await cronG(ENVK, at);
  check('🌐 the same language on both sides → nothing written', kvStore.get(LK) === 'en' && !wrote().length, wrote());
  delete globalThis.__metaOver; if (keepL == null) kvStore.delete(LK); else kvStore.set(LK, keepL);
}

// ☀️ a smart morning cut short by Claude (max_tokens) → the plain morning, never half a message
{
  const old = globalThis.__shortMorning; globalThis.__shortMorning = true;
  for (const k of [...kvStore.keys()]) if (/^tg:555:daily:sent/.test(k)) kvStore.delete(k);
  sent.length = 0; const Wm = await fresh(); const pm = []; await Wm.scheduled({ cron: '*/5 * * * *', scheduledTime: RIYADH('08:45') }, ENVK, { waitUntil: x => pm.push(x) }); await Promise.all(pm);
  const mm = sent.find(m => m.m === 'sendMessage' && /Smart morning|Morning/.test(m.b.text || '') && String(m.b.chat_id) === '555');
  check('☀️ Claude cut off (max_tokens) → the plain morning is sent instead (no half line, no stray **)', mm && !/\*\*/.test(mm.b.text) && !/half/.test(mm.b.text) && /Today|💼/.test(mm.b.text), mm && mm.b.text.slice(0, 120));
  check('…with the other markets in one line when they moved (CRCLB +7.8% today): gold and the bStock (no Brent)', mm && /🥇 Gold \$2,650 \+0\.8% · 🇺🇸 CRCLB \+7\.8%/.test(mm.b.text) && !/Brent/.test(mm.b.text), mm && mm.b.text);
  globalThis.__shortMorning = old;
}

// 📣 the owner's daily post for X: one message at 10:00 with the Arabic and the English text and a button for each that
// opens X with the text written — the bot never posts on X itself
{
  kvStore.delete('tg:xpost');
  const xmsg = () => sent.filter(m => m.m === 'sendMessage' && String(m.b.chat_id) === '555' && /post for X|منشور X/.test(m.b.text || ''));
  const cron = async hm => { const W = await fresh(); const ps = []; await W.scheduled({ cron: '*/5 * * * *', scheduledTime: RIYADH(hm) }, ENVK, { waitUntil: x => ps.push(x) }); await Promise.all(ps); };
  sent.length = 0; await cron('10:05');
  const xm = xmsg(), urls = xm.length ? btns(xm[0]).map(b => b.url) : [], X = await import('../tools/worker/xpost.mjs');
  check('📣 10:05 → the owner gets ONE "post for X" message with one button that opens X with the text written', xm.length === 1 && urls.length === 1 && /^https:\/\/x\.com\/intent\/post\?text=/.test(urls[0]), xm.map(m => m.b.text));
  const txt = urls.length ? decodeURIComponent(urls[0].split('text=')[1]) : '', lines = txt.split('\n');
  check('…one post with both languages (Arabic lines, then English lines — never one line with both words), within 280 by X\'s count, one link, no advice', X.xLen(txt) <= 280 && /[؀-ۿ]/.test(txt) && /[A-Za-z]{4,} [A-Za-z]{3,}/.test(txt) && (txt.match(/https:\/\//g) || []).length === 1 && /samsam-portfolio\/welcome$/.test(txt) && !/\b(buy now|sell now)\b|اشتر الآن|بِع الآن/i.test(txt) && !lines.some(l => !/^https/.test(l) && /[؀-ۿ]{3,}/.test(l) && /[A-Za-z]{4,} [A-Za-z]{4,}/.test(l)), [X.xLen(txt), txt]);
  check('…and the button\'s link is short enough for Telegram (< 2,000 characters)', urls.every(u => u.length < 2000), urls.map(u => u.length));
  check('…only the owner hears it (no member, not the channel)', !sent.some(m => m.m === 'sendMessage' && String(m.b.chat_id) !== '555' && /post for X|منشور X/.test(m.b.text || '')));
  sent.length = 0; await cron('10:10');
  check('…once a day (10:10 → nothing more)', xmsg().length === 0);
  sent.length = 0; await postK(await fresh(), '/xpost');
  check('/xpost → today\'s post again, now', xmsg().length === 1);
  sent.length = 0; await postK(await fresh(), '/xpost off'); kvStore.set('tg:xpost', JSON.stringify({ ...JSON.parse(kvStore.get('tg:xpost')), day: '2000-01-01' })); await cron('10:05');
  check('/xpost off → confirmed, and the next 10:05 sends nothing', sent.some(m => /is off|أوقفت/.test(m.b.text || '')) && xmsg().length === 0, sent.map(m => m.b.text));
  sent.length = 0; await postK(await fresh(), '/xpost on'); check('/xpost on → back on', /is on|يعمل/.test(last().b.text || ''));
  { const seen = new Set(), M = { btc: { price: 123456, ch24: -11.2 }, global: { mcap: 2.06e12, mcapCh24: -10.7, dom: { btc: 58.7, usdt: 8.5 } }, fng: { value: 8, label: 'Extreme Fear' }, alt: { value: 45 }, metals: [{ k: 'gold', price: 3515.25, ch24: -4.6 }, { k: 'silver', price: 41.07, ch24: -7.3 }], etf: { days: [] } };
    for (let d = 0; d < 24; d++) { const dr = X.xDraft(M, Date.UTC(2026, 10, 22) + d * 86400e3); seen.add(dr.angle + ':' + dr.text.slice(0, 24)); if (X.xLen(dr.text) > 280) seen.add('TOO LONG ' + d + ' ' + X.xLen(dr.text)); }
    check('…a different angle each day (pulse, metals, a feature…), every one within 280', seen.size >= 5 && ![...seen].some(x => /TOO LONG/.test(x)), [...seen]); }
  kvStore.delete('tg:xpost');
}

// 📘 a new release changed the guide → ONE short post in the channel naming the parts (🆕 new / ✏️ updated), once
{
  const cc = JSON.parse(kvStore.get('tg:community'));
  if (cc.channel) {
    cc.channel.guideSig = { ...cc.channel.guideSig, alerts: 'old' }; delete cc.channel.guideSig.help; kvStore.set('tg:community', JSON.stringify(cc));
    sent.length = 0; const Wg = await fresh(); const pg2 = []; await Wg.scheduled({ cron: '*/5 * * * *', scheduledTime: RIYADH('04:05') }, ENVK, { waitUntil: x => pg2.push(x) }); await Promise.all(pg2);
    const posts = sent.filter(m => m.m === 'sendMessage' && m.b.chat_id === -1001);
    check('🆕 the guide changed (a part updated, a part new) → one post in the channel: ✏️ + 🆕, with the guide button', posts.length === 1 && /New in the guide/.test(posts[0].b.text) && /✏️ 🔔/.test(posts[0].b.text) && /🆕/.test(posts[0].b.text) && posts[0].b.text.includes('start=guide') && !posts[0].b.reply_markup, posts.map(m => m.b.text));
    { const dms = sent.filter(m => m.m === 'sendMessage' && m.b.chat_id !== -1001 && /New in the guide|جديد في الدليل/.test(m.b.text || '')), own = dms.find(m => String(m.b.chat_id) === '555');
      check('🔔 …and each member hears it in the bot too: the changed parts, with buttons that open them (gd:alerts) and the full guide', !!own && /✏️ 🔔/.test(own.b.text) && JSON.stringify(own.b.reply_markup).includes('"gd:alerts"') && JSON.stringify(own.b.reply_markup).includes('"gd"') && new Set(dms.map(m => String(m.b.chat_id))).size === dms.length, dms.map(m => [m.b.chat_id, m.b.text])); }
    sent.length = 0; const Wh = await fresh(); const ph = []; await Wh.scheduled({ cron: '*/5 * * * *', scheduledTime: RIYADH('04:10') }, ENVK, { waitUntil: x => ph.push(x) }); await Promise.all(ph);
    check('…and not again', !sent.some(m => m.m === 'sendMessage' && m.b.chat_id === -1001));
    const c3 = JSON.parse(kvStore.get('tg:community')); c3.channel.guideV = 1; kvStore.set('tg:community', JSON.stringify(c3));
    sent.length = 0; const Wv = await fresh(); const pv = []; await Wv.scheduled({ cron: '*/5 * * * *', scheduledTime: RIYADH('04:15') }, ENVK, { waitUntil: x => pv.push(x) }); await Promise.all(pv);
    const rp = sent.filter(m => m.m === 'sendMessage' && m.b.chat_id === -1001);
    check('🔔 …a second change the same day: the channel hears it, the members are not messaged again (once a day)', !sent.some(m => m.m === 'sendMessage' && m.b.chat_id !== -1001 && m.b.reply_markup && JSON.stringify(m.b.reply_markup).includes('"gd"')));
    check('📘 a new edition of the guide → one "new edition" post (not 15)', rp.length === 1 && /new edition/i.test(rp[0].b.text), rp.map(m => m.b.text));
    sent.length = 0; const Wv2 = await fresh(); const pv2 = []; await Wv2.scheduled({ cron: '*/5 * * * *', scheduledTime: RIYADH('04:20') }, ENVK, { waitUntil: x => pv2.push(x) }); await Promise.all(pv2);
    check('…and not again', !sent.some(m => m.m === 'sendMessage' && m.b.chat_id === -1001));
  }
  kvStore.delete('tg:cmdscope'); sent.length = 0; await postK(await fresh(), '/menu');
  check('"/" menu: the general list only in private chats (none in groups)', sent.some(m => m.m === 'deleteMyCommands') && sent.some(m => m.m === 'setMyCommands' && m.b.scope && m.b.scope.type === 'all_private_chats'));
}

// 💳 the app's Support card asks the Worker for Telegram payment links (members with the bot linked)
{
  const KEYR = (email, uid, body) => W.fetch(new Request(HOST + '/key', { method: 'POST', headers: { Origin: 'https://drsamirsaad1981-design.github.io', 'content-type': 'application/json' }, body: JSON.stringify({ idToken: fbToken(email, uid), ...body }) }), ENVA, {});
  const mm = JSON.parse(kvStore.get('tg:users')); mm['888'] = { ...mm['888'], email: 'pay.me@x.com', premium: undefined, premUntil: undefined, premSrc: undefined }; mm['a:UIDZ'] = { name: 'appy', email: 'appy@x.com', uid: 'UIDZ', joined: Date.now() }; kvStore.set('tg:users', JSON.stringify(mm));
  let j = await (await KEYR('pay.me@x.com', 'UID2', { action: 'status' })).json();
  check('💳 status for the Support card: price 350, amounts, supporter, bot linked, the community links', j.price === 350 && j.amounts.join() === '50,100,250,500' && j.botLinked === true && j.supporter === true && 'channel' in j.community, j);
  sent.length = 0; j = await (await KEYR('pay.me@x.com', 'UID2', { action: 'invoice', kind: 'prem' })).json();
  const il = sent.find(m => m.m === 'createInvoiceLink');
  check('…⭐ premium → a Telegram subscription link for THIS member (prem:888, 350, 30 days)', /t\.me/.test(j.link || '') && il && il.b.payload === 'prem:888' && il.b.prices[0].amount === 350 && il.b.subscription_period === 2592000, [j, il && il.b]);
  sent.length = 0; j = await (await KEYR('pay.me@x.com', 'UID2', { action: 'invoice', kind: 'sup', n: 250 })).json();
  check('…💛 250 → a one-time link (sup:888:250)', /t\.me/.test(j.link || '') && sent.find(m => m.m === 'createInvoiceLink').b.payload === 'sup:888:250');
  const r = await KEYR('appy@x.com', 'UIDZ', { action: 'invoice', kind: 'sup', n: 50 });
  check('…an app-only member (no bot yet) → "link-bot" (Stars are paid from a Telegram account)', r.status === 409 && (await r.json()).error === 'link-bot');
}

// ↩️ removed by mistake: kept 60 days (restore from the dashboard), and someone who rejoins gets their premium / supporter back
{
  const ADM = (body) => W.fetch(new Request(HOST + '/admin', { method: 'POST', headers: { Origin: 'https://drsamirsaad1981-design.github.io', 'content-type': 'application/json' }, body: JSON.stringify({ idToken: fbToken('dr.samir.saad.1981@gmail.com', 'UID1'), ...body }) }), ENVA, {});
  const mm = JSON.parse(kvStore.get('tg:users')); mm['888'] = { ...mm['888'], email: 'back@x.com', premium: true, premUntil: Date.now() + 20 * 864e5, premSrc: 'stars', supporter: true, starsPaid: 400 }; kvStore.set('tg:users', JSON.stringify(mm));
  await ADM({ action: 'member', chat: '888', op: 'remove' });
  let j = await (await ADM({ action: 'overview' })).json();
  check('🗑 removed → gone from members, kept in "Removed (60 days)" with ⭐💛', !j.members.some(x => x.chat === '888') && j.removed.some(x => x.chat === '888' && x.premium && x.supporter), j.removed);
  accessWrites.length = 0; j = await (await ADM({ action: 'restore', chat: '888' })).json();
  const back = JSON.parse(kvStore.get('tg:users'))['888'];
  check('↩️ Restore → back exactly as before (premium, supporter, e-mail on the access list)', j.ok && back && back.premium && back.supporter && back.starsPaid === 400 && back.email === 'back@x.com' && accessWrites.length === 1 && !j.overview.removed.some(x => x.chat === '888'), back);
  // removed, then rejoins with a new invite code (no restore pressed) → their record comes back by itself
  await ADM({ action: 'member', chat: '888', op: 'remove' });
  const code = (await (await ADM({ action: 'invite' })).json()).code;
  sent.length = 0; await post({ update_id: ++UPD, message: { message_id: 1, chat: { id: 888, type: 'private' }, from: { id: 888, first_name: 'New', language_code: 'en' }, text: '/start ' + code } }, ENV.TG_SECRET, ENVK);
  const re = JSON.parse(kvStore.get('tg:users'))['888'];
  check('…rejoining with a new invite → premium ⭐ + supporter 💛 + e-mail back, "Welcome back" in the welcome', re && re.premium && re.supporter && re.email === 'back@x.com' && sent.some(m => /Welcome back/.test(m.b.text || '')), re);
  // no record kept (removed before this existed) → the Stars log tells
  const m2 = JSON.parse(kvStore.get('tg:users')); delete m2['888']; kvStore.set('tg:users', JSON.stringify(m2)); kvStore.delete('tg:removed:888');
  kvStore.set('tg:stars:log', JSON.stringify([{ t: Date.now() - 864e5, chat: '888', kind: 'prem', stars: 300 }, { t: Date.now() - 864e5, chat: '888', kind: 'sup', stars: 50 }]));
  const code2 = (await (await ADM({ action: 'invite' })).json()).code;
  await post({ update_id: ++UPD, message: { message_id: 1, chat: { id: 888, type: 'private' }, from: { id: 888, first_name: 'New' }, text: '/start ' + code2 } }, ENV.TG_SECRET, ENVK);
  const r3 = JSON.parse(kvStore.get('tg:users'))['888'];
  check('…no record kept → from the Stars log: supporter (350 ⭐) and this month\'s premium (Stars, 30 days from the payment)', r3.supporter && r3.starsPaid === 350 && r3.premium && r3.premSrc === 'stars' && Math.abs(r3.premUntil - (Date.now() + 29 * 864e5)) < 3600e3, r3);
}

// 💤 idle members: no bot / app use for 14 days → the round skips their daily messages (one note), any message wakes them;
// the dashboard shows idle + last activity + 📖 Firebase reads per member today
{
  const ADM = (body) => W.fetch(new Request(HOST + '/admin', { method: 'POST', headers: { Origin: 'https://drsamirsaad1981-design.github.io', 'content-type': 'application/json' }, body: JSON.stringify({ idToken: fbToken('dr.samir.saad.1981@gmail.com', 'UID1'), ...body }) }), ENVA, {});
  const mm = JSON.parse(kvStore.get('tg:users')); mm['888'] = { ...mm['888'], name: 'New', joined: Date.now() - 100 * 864e5, paused: undefined, lang: 'en' }; kvStore.set('tg:users', JSON.stringify(mm));
  kvStore.set('tg:seen:888', String(Date.now() - 20 * 864e5)); kvStore.delete('tg:idlenote:888');
  const Wi = await fresh(); sent.length = 0;
  let p = []; await Wi.scheduled({ cron: '*/5 * * * *', scheduledTime: Date.now() }, ENVK, { waitUntil: x => p.push(x) }); await Promise.all(p);
  const to888 = sent.filter(x => String(x.b && x.b.chat_id) === '888');
  check('💤 20 days without use → one note "paused while you\'re away", nothing else from the round', to888.length === 1 && /paused while you're away/.test(to888[0].b.text) && kvStore.has('tg:idlenote:888'), to888.map(x => x.b.text));
  sent.length = 0; p = []; await Wi.scheduled({ cron: '*/5 * * * *', scheduledTime: Date.now() + 5 * 60e3 }, ENVK, { waitUntil: x => p.push(x) }); await Promise.all(p);
  check('…the next round: no second note', !sent.some(x => String(x.b && x.b.chat_id) === '888'));
  let j = await (await ADM({ action: 'overview' })).json();
  const me = j.members.find(x => x.chat === '888');
  check('dashboard: 💤 idle, last activity 20 days ago, idle count, 📖 reads today', me && me.idle === true && me.idleDays === 20 && !me.removeHint && j.stats.idle >= 1 && Number.isFinite(j.stats.readsToday) && Number.isFinite(me.reads), me);
  await post({ update_id: ++UPD, message: { message_id: 1, chat: { id: 888, type: 'private' }, from: { id: 888, first_name: 'New' }, text: 'hi' } }, ENV.TG_SECRET, ENVK);
  check('a message → awake again (note cleared, last activity now)', !kvStore.has('tg:idlenote:888') && Date.now() - +kvStore.get('tg:seen:888') < 60e3);
  j = await (await ADM({ action: 'overview' })).json();
  check('…the dashboard says active', j.members.find(x => x.chat === '888').idle === false);
  kvStore.set('tg:seen:888', String(Date.now() - 70 * 864e5));
  j = await (await ADM({ action: 'overview' })).json();
  check('70 days → the dashboard suggests removing (nothing removed by itself)', j.members.find(x => x.chat === '888').removeHint === true && JSON.parse(kvStore.get('tg:users'))['888']);
  kvStore.set('tg:seen:888', String(Date.now()));
  const own = String(ENV.TELEGRAM_CHAT_ID); kvStore.set('tg:seen:' + own, String(Date.now() - 90 * 864e5));
  sent.length = 0; p = []; await Wi.scheduled({ cron: '*/5 * * * *', scheduledTime: Date.now() + 10 * 60e3 }, ENVK, { waitUntil: x => p.push(x) }); await Promise.all(p);
  check('the owner is never idle (no note)', !sent.some(x => String(x.b && x.b.chat_id) === own && /away/.test(x.b.text || '')));
}

if (process.env.DUMP_LANG) fs.writeFileSync(process.env.DUMP_LANG, JSON.stringify(globalThis.__byLang || []));
if (process.env.DUMP_TEXTS) fs.writeFileSync(process.env.DUMP_TEXTS, JSON.stringify(globalThis.__all || []));
// 🗑 /leave: a member deletes their own account from the app — the bot forgets them for good, the e-mail leaves the access
// list, the owner is told; never the owner's own account, never without the typed confirmation
{
  const H = { Origin: 'https://drsamirsaad1981-design.github.io', 'content-type': 'application/json' };
  const ADM = body => W.fetch(new Request(HOST + '/admin', { method: 'POST', headers: H, body: JSON.stringify({ idToken: fbToken('dr.samir.saad.1981@gmail.com', 'UID1'), ...body }) }), ENVA, {});
  const JOIN = (email, uid, code) => W.fetch(new Request(HOST + '/join', { method: 'POST', headers: H, body: JSON.stringify({ idToken: fbToken(email, uid), code }) }), ENVA, {});
  const LEAVE = (email, uid, body = { confirm: 'DELETE' }) => W.fetch(new Request(HOST + '/leave', { method: 'POST', headers: H, body: JSON.stringify({ idToken: fbToken(email, uid), ...body }) }), ENVA, {});
  const inv = await (await ADM({ action: 'invite' })).json(); await JOIN('zed@x.com', 'UIDZ', inv.code);
  // …who then linked Telegram (chat 7777) and left things behind
  const m0 = JSON.parse(kvStore.get('tg:users')); m0['7777'] = { ...m0['a:UIDZ'], name: 'Zed', appOnly: undefined }; delete m0['a:UIDZ']; kvStore.set('tg:users', JSON.stringify(m0));
  kvStore.set('tg:7777:alerts', '[{"id":1}]'); kvStore.set('tg:7777:hist', '[]'); kvStore.set('tg:7777:byok', '{}'); kvStore.set('cex:UIDZ', '{}'); kvStore.set('fs:pf:UIDZ', '{}');
  let r = await LEAVE('dr.samir.saad.1981@gmail.com', 'UID1');
  check('🗑 /leave from the owner\'s account → 403, nothing happens', r.status === 403 && JSON.parse(kvStore.get('tg:users'))['7777']);
  r = await LEAVE('zed@x.com', 'UIDZ', {});
  check('🗑 /leave without the typed confirmation → 400, nothing happens', r.status === 400 && JSON.parse(kvStore.get('tg:users'))['7777'] && kvStore.has('tg:7777:alerts'));
  globalThis.__signins = [];
  accessWrites.length = 0; sent.length = 0;
  r = await LEAVE('zed@x.com', 'UIDZ'); const lj = await r.json();
  const left = [...kvStore.keys()].filter(k => k.startsWith('tg:7777:') || k === 'cex:UIDZ' || k === 'fs:pf:UIDZ' || k === 'tg:removed:7777');
  check('🗑 /leave → the member record is gone for good (no "restore" copy), with their alerts, chat memory, Claude key, exchange keys and cache', r.status === 200 && lj.ok && lj.member === true && !JSON.parse(kvStore.get('tg:users'))['7777'] && left.length === 0, [r.status, lj, left]);
  check('…their e-mail leaves the app\'s access list', accessWrites.length === 1 && !JSON.stringify(accessWrites[0]).includes('zed@x.com'), accessWrites);
  check('…they get one goodbye in Telegram, and the owner is told who left', sent.some(m => String(m.b.chat_id) === '7777' && /deleted, as you asked/.test(m.b.text || '')) && sent.some(m => String(m.b.chat_id) === '555' && /deleted their own account/.test(m.b.text || '') && /Zed/.test(m.b.text)), sent.map(m => [m.b.chat_id, m.b.text]));
  check('…and the sign-in itself is deleted, with a fresh sign-in made for that account only', lj.signin === true && globalThis.__signins.length === 1 && globalThis.__signins[0] === 'fresh-UIDZ', [lj, globalThis.__signins]);
  globalThis.__signins = null;
  r = await LEAVE('zed@x.com', 'UIDZ');
  check('…asking again (already gone) → still fine, nothing to remove', r.status === 200 && (await r.json()).member === false);
}

// 🔐 the backup file: one reminder when the last file is over 30 days old (or never made, portfolio over a week old),
// then quiet for 30 days
{
  const bmsg = () => sent.filter(x => x.m === 'sendMessage' && /🔐/.test(x.b.text || '') && String(x.b.chat_id) === '555');
  const again = async () => { await new Promise(r => setTimeout(r, 300));   // (a late write of the run before must land first)
    const d = JSON.parse(kvStore.get('tg:555:daily:sent') || '{}'); delete d.bk; kvStore.set('tg:555:daily:sent', JSON.stringify(d)); for (const k of [...kvStore.keys()]) if (k.startsWith('fs:pf:')) kvStore.delete(k); };
  // (the file's age is counted from the run's own clock, so the test passes at any hour of the day)
  const at = RIYADH('13:00'), at2 = RIYADH('13:30'), at3 = RIYADH('14:00'); kvStore.delete('tg:555:bk:rem');
  await again(); sent.length = 0; Wd = await fresh(); await cron(Wd, at);
  check('🔐 a backup file made lately → no reminder', bmsg().length === 0, bmsg().map(x => x.b.text));
  globalThis.__lastBackupAt = new Date(at2 - 41.5 * 864e5).toISOString(); await again(); sent.length = 0; Wd = await fresh(); await cron(Wd, at2);
  check('🔐 the last file is 41 days old → one reminder: how old, why the file matters, where the button is, and a button to the app', bmsg().length === 1 && /41 days ago/.test(bmsg()[0].b.text) && /only copy outside your account/.test(bmsg()[0].b.text) && /Settings → Backup → Back up now/.test(bmsg()[0].b.text) && btns(bmsg()[0]).length === 1, bmsg().map(x => x.b.text));
  await again(); sent.length = 0; Wd = await fresh(); await cron(Wd, at3);
  check('…and not again (quiet for 30 days)', bmsg().length === 0);
  kvStore.set('tg:555:bk:rem', String(Date.now() - 31 * 864e5)); await again(); sent.length = 0; Wd = await fresh(); await cron(Wd, at);
  check('…31 days later, still no new file → one more', bmsg().length === 1);
  kvStore.delete('tg:555:bk:rem'); globalThis.__lastBackupAt = null; const cu = COIN_UPD; COIN_UPD = new Date(Date.now() - 2 * 864e5).toISOString(); await again(); sent.length = 0; Wd = await fresh(); await cron(Wd, at2);
  check('🔐 never backed up, but the portfolio is 2 days old → not yet', bmsg().length === 0, bmsg().map(x => x.b.text));
  COIN_UPD = new Date(Date.now() - 20 * 864e5).toISOString(); await again(); sent.length = 0; Wd = await fresh(); await cron(Wd, at3);
  check('🔐 never backed up and the portfolio is 20 days old → "not made yet"', bmsg().length === 1 && /not made yet/.test(bmsg()[0].b.text), bmsg().map(x => x.b.text));
  COIN_UPD = cu; globalThis.__lastBackupAt = undefined; kvStore.delete('tg:555:bk:rem'); await again(); sent.length = 0;
}

// /link with no code → a fixed "how to link" answer, never an AI question
{
  const mm = JSON.parse(kvStore.get('tg:users')); mm['8888'] = { name: 'Nolink', joined: Date.now() }; mm['8889'] = { name: 'Linked', joined: Date.now(), uid: 'UID2', email: 'l@x.com' }; kvStore.set('tg:users', JSON.stringify(mm));
  sent.length = 0; claudeCalls.length = 0; await sayAs(8888, '/link');
  const a1 = sent.filter(m => String(m.b.chat_id) === '8888' && m.m === 'sendMessage');
  check('/link with no code (not linked) → how to get the code, and "/link CODE" — no AI question used', a1.length === 1 && /isn't linked yet/.test(a1[0].b.text) && /\/link CODE/.test(a1[0].b.text) && claudeCalls.length === 0, [a1.map(m => m.b.text), claudeCalls.length]);
  sent.length = 0; await sayAs(8889, '/link');
  check('/link with no code (already linked) → "already linked ✅"', sent.some(m => String(m.b.chat_id) === '8889' && /already linked/.test(m.b.text || '')) && claudeCalls.length === 0, sent.map(m => m.b.text));
  const m2 = JSON.parse(kvStore.get('tg:users')); delete m2['8888']; delete m2['8889']; kvStore.set('tg:users', JSON.stringify(m2));
}

// 🎯 the plan for all four: a savings goal counts your cash in that currency; metals in grams, shares as shares
{
  const mk = { top: [{ id: 'solana', price: 80, ch24: 0 }], top500: [], series: {}, global: {}, cgIds: {} };
  const GPO = 31.1034768;
  const s = summarize({ coins: [{ sym: 'SOL', cgId: 'solana', opening: { qty: 2, avg: 80 } }], txs: [],
    accum: [{ sym: 'SOL', targetQty: 10 }, { sym: 'CASH-EGP', kind: 'cash', targetQty: 500000 }, { sym: 'XAU', cls: 'metal', targetQty: 100 / GPO }, { sym: 'NVDAB', cls: 'stock', cgId: 'nvidia-bstocks', targetQty: 20 }],
    meta: { cash: [{ id: 'a', kind: 'cash', cur: 'EGP', amount: 200000, label: 'Bank' }, { id: 'b', kind: 'cash', cur: 'EGP', amount: 50000, label: 'Wallet' }, { id: 'c', kind: 'cash', cur: 'USD', amount: 9999, label: 'USD' }] } }, mk, Date.now());
  { // 🛒 the month's regular buys in /portfolio: dollars — a saving in EGP at the official rate, never its number as dollars
    const d = summarize({ coins: [{ sym: 'SOL', cgId: 'solana', opening: { qty: 2, avg: 80 } }], txs: [], meta: {},
      accum: [{ sym: 'SOL', targetQty: 10, dca: { usd: 100, every: 'month', day: 1, since: '2026-01-01' } }, { sym: 'CASH-EGP', targetQty: 500000, dca: { usd: 5000, every: 'month', day: 1, since: '2026-01-01' } }] }, { ...mk, fx: { EGP: { rate: 50 } } }, Date.now());
    check('…summarize: SOL $100 a month, the saving 5,000 EGP = $100 a month', d.dca.length === 2 && d.dca.find(x => x.sym === 'CASH-EGP').usdMo === 100 && d.dca.find(x => x.sym === 'SOL').usdMo === 100, d.dca.map(x => [x.sym, x.s.perMonth, x.usdMo]));
    const total = d.dca.reduce((a, x) => a + (x.usdMo || 0), 0);
    check('…the month\'s total is $200 (not $5,100) — and /portfolio\'s line adds the dollars (usdMo), in the built Worker too', total === 200 && /sum\.dca\.reduce\(\(a, x\) => a \+ \(x\.usdMo \|\| 0\), 0\)/.test(built) && !/a \+ x\.s\.perMonth/.test(built), total);
    const { todo } = await import('../tools/worker/daily.mjs');
    const td = todo({ ...d, dca: d.dca.map(x => ({ ...x, s: { ...x.s, state: 'today' } })) }, Date.now());
    const eg = td.find(x => x.coin === 'CASH-EGP'), so = td.find(x => x.coin === 'SOL' && x.what === 'dca_today');
    check('…the morning\'s facts: a saving is "5000 EGP" (save_amount + currency), a coin stays buy_usd', eg && eg.save_amount === 5000 && eg.currency === 'EGP' && eg.buy_usd === undefined && so && so.buy_usd === 100, [eg, so]);
  }
  const by = Object.fromEntries(s.plan.map(p => [p.sym, p]));
  check('🎯 plan: a savings goal (CASH-EGP) counts the cash in EGP only — 250,000 of 500,000', by['CASH-EGP'] && by['CASH-EGP'].kind === 'cash' && by['CASH-EGP'].actual === 250000, by['CASH-EGP']);
  check('…kinds: coin · cash · metal · stock', [by.SOL.kind, by['CASH-EGP'].kind, by.XAU.kind, by.NVDAB.kind].join() === 'coin,cash,metal,stock', s.plan.map(p => p.kind));
  check('…amounts in their units: 250,000 EGP · 100 g · 20 shares · 8 SOL', planAmt(by['CASH-EGP'], 250000, false) === '250,000 EGP' && planAmt(by.XAU, 100 / GPO, false) === '100 g' && planAmt(by.NVDAB, 20, false) === '20 shares' && planAmt(by.SOL, 8, false) === '8 SOL',
    [planAmt(by['CASH-EGP'], 250000, false), planAmt(by.XAU, 100 / GPO, false), planAmt(by.NVDAB, 20, false)]);
  check('…names: Gold / الذهب · Savings EGP / ادخار EGP', planName(by.XAU, false) === 'Gold' && planName(by.XAU, true) === 'الذهب' && planName(by['CASH-EGP'], false) === 'Savings EGP' && planName(by['CASH-EGP'], true) === 'ادخار EGP' && planAmt(by.XAU, 100 / GPO, true) === '100 جم');
  check('…the overall progress uses them (SOL 20% · cash 50% · gold 0% · shares 0% → 17.5%)', Math.abs(s.prog.pct - 17.5) < 0.01, s.prog);

  // 🪙 platinum / copper: priced from the world price (copper $/lb → $/troy oz)
  const m2 = { ...mk, metals: [{ k: 'platinum', price: 1000, ch24: 1 }, { k: 'copper', price: 4.5, ch24: -2 }], fx: { EGP: { rate: 50 } } };
  const s3 = summarize({ coins: [{ sym: 'XPT', opening: { qty: 1, avg: 900 } }, { sym: 'XCU', opening: { qty: 100, avg: 0.3 } }], txs: [], accum: [{ sym: 'XPT', targetQty: 2 }], meta: {} }, m2, Date.now());
  const px = Object.fromEntries(s3.coins.map(c => [c.sym, c.price]));
  check('🪙 platinum $1,000/oz and copper $4.50/lb → $0.3086/oz, both priced, Signal Hold, named in the plan', px.XPT === 1000 && Math.abs(px.XCU - 4.5 * 31.1034768 / 453.59237) < 1e-9 && planName(s3.plan[0], false) === 'Platinum' && planName(s3.plan[0], true) === 'البلاتين' && s3.coins.every(c => !s3.signal || s3.signal[c.sym] !== 'reinforce' && s3.signal[c.sym] !== 'sell'), px);
  // 🏦 a regular saving: 5,000 EGP monthly on today's date → the DCA day message names it in EGP, the total in dollars
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
  const dd = +today.slice(8, 10);
  if (dd <= 28) {
    const u = { coins: [{ sym: 'SOL', cgId: 'solana', opening: { qty: 1, avg: 80 } }], txs: [], meta: {},
      accum: [{ sym: 'CASH-EGP', kind: 'cash', targetQty: 100000, dca: { usd: 5000, every: 'month', day: dd, since: '2026-01-01' } }, { sym: 'SOL', targetQty: 5, dca: { usd: 100, every: 'month', day: dd, since: '2026-01-01' } }] };
    const s4 = summarize(u, m2, Date.now());
    const eg = s4.dca.find(x => x.sym === 'CASH-EGP');
    check('🏦 a regular saving: 5,000 EGP a month = $100/mo at 50, state today', eg && eg.s.cur === 'EGP' && eg.usdMo === 100 && eg.s.state === 'today', eg);
    const cfg = { ...alertCfg({}), dca: true };
    const noon = Date.parse(today + 'T09:00:00Z');   // 12:00 in Riyadh: after the brief time, out of the quiet hours
    const r0 = evaluate(s4, m2, { v: 1, sig: {}, plan: {}, tp: {}, macro: {}, health: {}, dcaDay: {}, dcaMiss: {} }, { ...cfg, digest: false }, noon);
    const txt = (r0.messages || []).map(o => o.text).join('\n'), all = txt;
    check('…the DCA-day message: "🏦 Savings EGP 5,000 EGP", SOL $100, total $200', /Savings EGP\s+<b>5,000 EGP<\/b>/.test(txt) && /SOL\s+<b>\$100/.test(txt) && /\$200/.test(txt), txt.slice(0, 400) || all.slice(0, 300));
    const sv = summarize({ ...u, accum: [{ ...u.accum[0], dca: { ...u.accum[0].dca, paid: [today] } }] }, m2, Date.now()).dca[0];
    check('…marked "✓ Saved" today → done', sv.s.state === 'done', sv.s);
  }
}

console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
