// The Telegram bot (tools/worker → tools/dist/samsam-worker.js), tested on the BUILT file — the one you paste into
// Cloudflare. Every network call is faked here: Telegram, GitHub's prices branch, CoinGecko, Google sign-in, Firestore.
// Checks: only Telegram + only your chat get answers; each view's numbers = the app's maths; buttons redraw in place;
// stablecoins never "best"; tickers / names / unknown coins; Arabic + English; text Telegram accepts; the setup link;
// AI Analysis (/analyze) still behaves; and the built file is up to date with its sources.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { summarize, priceSeries, isStable } from '/home/claude/samsam-portfolio/tools/alerts-core.mjs';

const ROOT = '/home/claude/samsam-portfolio';
let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' -> ' + JSON.stringify(d).slice(0, 400))); };
const fx = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', f), 'utf8'));

// ── the built file is current ──
const SOURCES = ['tools/ai-worker.js', 'tools/alerts-core.mjs', 'samsam-core.js', 'tools/worker/index.mjs', 'tools/worker/idle.mjs', 'tools/worker/bot.mjs', 'tools/worker/data.mjs', 'tools/worker/cg-ids.json', 'tools/worker/ai.mjs', 'tools/worker/watch.mjs', 'tools/worker/voice.mjs', 'tools/worker/trade.mjs', 'tools/worker/daily.mjs', 'tools/worker/paper.mjs', 'tools/worker/who.mjs', 'tools/worker/byok.mjs', 'tools/worker/cex.mjs', 'tools/worker/bidi.mjs', 'tools/worker/usmarket.mjs', 'tools/worker/stars.mjs', 'tools/worker/admin.mjs', 'guide.json', 'tools/worker/community.mjs'];
const h = crypto.createHash('sha256'); for (const f of SOURCES) h.update(fs.readFileSync(path.join(ROOT, f)));
const built = fs.readFileSync(path.join(ROOT, 'tools/dist/samsam-worker.js'), 'utf8');
check('the built Worker is up to date with its sources (else: node tools/build-worker.mjs)', built.includes('sources-hash: ' + h.digest('hex').slice(0, 16)));
check('no secret value in the built file', !/sk-ant-|BEGIN PRIVATE KEY|\d{8,}:[A-Za-z0-9_-]{30,}/.test(built));

// ── fake world ──
const NOW = Date.now(), HR = 3600e3;
const rd = f => JSON.parse(fs.readFileSync('/tmp/demo/prices/' + f, 'utf8'));
const market = rd('m/market.json'), top500 = rd('m/top500.json'), alt = rd('m/alt.json'), etf = rd('m/etf.json');
const series = (price, p24, p7) => { const n = 24 * 9, t0 = NOW - (n - 1) * HR; return { t0, step: HR, p: Array.from({ length: n }, (_, i) => i === n - 1 ? price : i >= n - 25 ? p24 : i >= n - 169 ? (p24 + p7) / 2 : p7) }; };
const LIVE = { bitcoin: { usd: 77000, usd_24h_change: 1.25, usd_market_cap: 1.53e12, usd_24h_vol: 4e10 }, solana: { usd: 150, usd_24h_change: 3.5 }, tether: { usd: 1.0002, usd_24h_change: 0.01 }, chainlink: { usd: 11, usd_24h_change: -4.2 }, pendle: { usd: 3.21, usd_24h_change: 7.7, usd_market_cap: 5e8 } };
for (const r of [...market.top, ...(top500.top || [])]) if (r.id && r.price) LIVE[r.id] = { usd: r.price, usd_24h_change: r.ch24 || 0, usd_market_cap: r.mcap || 0, usd_24h_vol: r.vol || 0 };
for (const id of ['pax-gold', 'kinesis-silver']) if (!LIVE[id]) { const p = rd('p/' + id + '.json').p; LIVE[id] = { usd: p[p.length - 1], usd_24h_change: (p[p.length - 1] / p[p.length - 25] - 1) * 100 }; }
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { type: 'service_account', project_id: 'samsam-portfolio', client_email: 'bot@samsam-portfolio.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://oauth2.googleapis.com/token' };
const fsv = v => typeof v === 'string' ? { stringValue: v } : typeof v === 'number' ? { doubleValue: v } : typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(fsv) } } : v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fsv(x)])) } } : { nullValue: null };
const doc = o => ({ name: 'x', fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fsv(v)])) });
let LANG = 'ar';   // the alerts are in Arabic — the bot still starts in English
const claudeKeys = []; const premOn = x => !!(x && x.premium && (!x.premUntil || x.premUntil > Date.now())); let AGG_CALLS = 0, LIST_TXS = 0, COIN_UPD = '';
const DEMO = {"coins": [{"sym": "BTC", "cgId": "bitcoin", "name": "Bitcoin", "opening": {"qty": 0.21, "avg": 74008.12933333333}}, {"sym": "ETH", "cgId": "ethereum", "name": "Ethereum", "opening": {"qty": 2.7, "avg": 2024.9877777777779}}, {"sym": "SOL", "cgId": "solana", "name": "Solana", "opening": {"qty": 36, "avg": 84.08204944444445}}, {"sym": "LINK", "cgId": "chainlink", "name": "Chainlink", "opening": {"qty": 170, "avg": 10.228235294117647}}, {"sym": "DOT", "cgId": "polkadot", "name": "Polkadot", "opening": {"qty": 900, "avg": 1.1238663}}, {"sym": "AVAX", "cgId": "avalanche-2", "name": "Avalanche", "opening": {"qty": 110, "avg": 7.14}}, {"sym": "NEAR", "cgId": "near", "name": "NEAR Protocol", "opening": {"qty": 220, "avg": 3.76}}, {"sym": "SUI", "cgId": "sui", "name": "Sui", "opening": {"qty": 1600, "avg": 0.719695}}, {"sym": "RENDER", "cgId": "render-token", "name": "Render", "opening": {"qty": 420, "avg": 1.39}}, {"sym": "DOGE", "cgId": "dogecoin", "name": "Dogecoin", "opening": {"qty": 9000, "avg": 0.059244000000000005}}, {"sym": "ATOM", "cgId": "cosmos", "name": "Cosmos Hub", "opening": {"qty": 380, "avg": 1.27}}, {"sym": "XAU", "cgId": "pax-gold", "name": "Gold (24k)", "opening": {"qty": 1.0, "avg": 3981.2526000000003}}, {"sym": "XAG", "cgId": "kinesis-silver", "name": "Silver (999)", "opening": {"qty": 25, "avg": 52.174634999999995}}], "txs": [], "accum": [{"sym": "BTC", "targetQty": 0.5, "dca": {"usd": 300, "every": "month", "day": 1, "since": "2026-11-01"}}, {"sym": "ETH", "targetQty": 5}, {"sym": "SOL", "targetQty": 60, "dca": {"usd": 50, "every": "week", "day": 1, "since": "2026-11-01"}}, {"sym": "LINK", "targetQty": 170}, {"sym": "SUI", "targetQty": 4000}, {"sym": "XAU", "targetQty": 2}]};
const USER = () => ({ ...DEMO, meta: { alerts: { lang: LANG }, baseline: { btcPrice: 81608.643 }, exitPlan: [{"sym": "SOL", "tps": [{"price": 112.88, "pct": 25, "lock": true}, {"price": 155.21, "pct": 50, "lock": true}, {"price": 246.92, "pct": 25, "lock": true}]}, {"sym": "ETH", "tps": [{"price": 2693.44, "pct": 25, "lock": true}, {"price": 3703.48, "pct": 50, "lock": true}, {"price": 5891.9, "pct": 25, "lock": true}]}, {"sym": "LINK", "tps": [{"price": 13.76, "pct": 25, "lock": true}, {"price": 18.92, "pct": 50, "lock": true}, {"price": 30.1, "pct": 25, "lock": true}]}, {"sym": "SUI", "tps": [{"price": 1.03, "pct": 25, "lock": true}, {"price": 1.42, "pct": 50, "lock": true}, {"price": 2.26, "pct": 25, "lock": true}]}] } });
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
  if (u === 'https://api.github.com/repos/drsamirsaad1981-design/samsam-portfolio/actions/workflows/prices.yml/dispatches') { kicks.push({ auth: init.headers.authorization, body: JSON.parse(body) }); return new Response(null, { status: 204 }); }
  if (u.startsWith('https://api.telegram.org/bot') && body instanceof FormData) { const m = u.split('/').pop(); const ph = body.get('photo'); sent.push({ m, b: { chat_id: body.get('chat_id'), caption: body.get('caption'), photoBytes: ph ? new Uint8Array(await ph.arrayBuffer()) : null } }); return J({ ok: true, result: { message_id: 8 } }); }
  if (u.startsWith('https://api.telegram.org/bot')) { const m = u.split('/').pop(); const b = JSON.parse(body); if (typeof b.text === 'string') { try { const lg = kvStore.get(`tg:${b.chat_id}:lang`); if (lg && +b.chat_id > 0) (globalThis.__byLang = globalThis.__byLang || []).push({ lang: lg, chat: b.chat_id, text: b.text, kb: JSON.stringify((b.reply_markup && (b.reply_markup.inline_keyboard || b.reply_markup.keyboard)) || '') }); } catch (_) {} b.raw = b.text; b.text = b.text.replace(/[\u200E\u200F\u2060\u2066\u2069]/g, '').replace(/\u00A0/g, ' '); (globalThis.__all = globalThis.__all || []).push(b.raw); } sent.push({ m, b }); if (m === 'createInvoiceLink') return J({ ok: true, result: 'https://t.me/$inv-' + b.payload }); if (m === 'createChatInviteLink') return J({ ok: true, result: { invite_link: 'https://t.me/+join' + b.chat_id } }); if (m === 'createForumTopic') return J({ ok: true, result: { message_thread_id: 100 + sent.filter(x => x.m === 'createForumTopic').length } }); if (m === 'sendChatAction' && (globalThis.__goneTopics || []).includes(b.message_thread_id)) return J({ ok: false, description: 'Bad Request: message thread not found' }); if (m === 'getChat') return J({ ok: true, result: { id: b.chat_id, is_forum: false, ...(b.chat_id === -1001 && !globalThis.__unlinked ? { linked_chat_id: -1002 } : {}) } }); if (m === 'getMe') return J({ ok: true, result: { id: 1, username: 'samsam_portfolio_bot' } }); if (m === 'getChatMember') return J({ ok: true, result: { status: b.chat_id === -1003 ? 'administrator' : 'left' } }); return J(m === 'editMessageText' && b.text === sent.lastEdit ? { ok: false, description: 'Bad Request: message is not modified' } : { ok: true, result: { message_id: 7 } }); }
  if (u.includes('raw.githubusercontent.com/drsamirsaad1981-design/samsam-portfolio/prices/')) {
    const f = u.split('/prices/')[1];
    if (f === 'm/market.json') return J(market); if (f === 'm/top500.json') return J(top500); if (f === 'm/alt.json') return J(alt); if (f === 'm/etf.json') return J(etf);
    const id = (f.match(/^p\/(.+)\.json$/) || [])[1];
    try { return J(rd('p/' + id + '.json')); } catch (_) { return new Response('404', { status: 404 }); }
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

const W = (await import('/home/claude/samsam-portfolio/tools/dist/samsam-worker.js')).default;
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
// ── demo run ──
const grab = async (label, f) => { sent.length = 0; await f(); const o = out(); return o.map(x => ({ label, text: x.b.text, buttons: (x.b.reply_markup && x.b.reply_markup.inline_keyboard || []).map(r => r.map(b => b.text)) })); };
const res = {};
for (const lang of ['en', 'ar']) {
  if (lang === 'ar') await tap('lang:ar');
  const L = [];
  for (const [label, cmd] of [['portfolio', '/portfolio'], ['signals', '/signals'], ['market', '/market'], ['plan', '/plan'], ['movers', '/movers'], ['exit', '/exit'], ['metals', '/metals'], ['stocks', '/stocks'], ['sol', 'sol']]) L.push(...await grab(label, () => say(cmd)));
  res[lang] = L;
}
fs.writeFileSync('/home/claude/demo/bot.json', JSON.stringify(res, null, 1));
console.log(Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.map(x => x.label + ':' + (x.text || '').length)])));
process.exit(0);
