// The Telegram bot (tools/worker → tools/dist/samsam-worker.js), tested on the BUILT file — the one you paste into
// Cloudflare. Every network call is faked here: Telegram, GitHub's prices branch, CoinGecko, Google sign-in, Firestore.
// Checks: only Telegram + only your chat get answers; each view's numbers = the app's maths; buttons redraw in place;
// stablecoins never "best"; tickers / names / unknown coins; Arabic + English; text Telegram accepts; the setup link;
// AI Analysis (/analyze) still behaves; and the built file is up to date with its sources.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { summarize, priceSeries, isStable } from '../tools/alerts-core.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' -> ' + JSON.stringify(d).slice(0, 400))); };
const fx = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', f), 'utf8'));

// ── the built file is current ──
const SOURCES = ['tools/ai-worker.js', 'tools/alerts-core.mjs', 'samsam-core.js', 'tools/worker/index.mjs', 'tools/worker/bot.mjs', 'tools/worker/data.mjs', 'tools/worker/cg-ids.json', 'tools/worker/ai.mjs', 'tools/worker/watch.mjs', 'tools/worker/voice.mjs', 'tools/worker/trade.mjs', 'tools/worker/daily.mjs', 'tools/worker/paper.mjs', 'tools/worker/miniapp.mjs', 'tools/worker/miniapp.html', 'tools/worker/who.mjs'];
const h = crypto.createHash('sha256'); for (const f of SOURCES) h.update(fs.readFileSync(path.join(ROOT, f)));
const built = fs.readFileSync(path.join(ROOT, 'tools/dist/samsam-worker.js'), 'utf8');
check('the built Worker is up to date with its sources (else: node tools/build-worker.mjs)', built.includes('sources-hash: ' + h.digest('hex').slice(0, 16)));
check('no secret value in the built file', !/sk-ant-|BEGIN PRIVATE KEY|\d{8,}:[A-Za-z0-9_-]{30,}/.test(built));

// ── fake world ──
const NOW = Date.now(), HR = 3600e3;
const market = fx('market_snap_fixture.json'), top500 = fx('top500_fixture.json'), alt = fx('alt_fixture.json'), etf = fx('etf_fixture.json');
market.parts = { top: new Date(NOW - 12 * 60e3).toISOString() };
market.stocks = [['NVDAB', 2.1], ['TSLAB', -3.4], ['CRCLB', 7.8], ['AAPLB', 0.4], ['GMEB', -6.2], ['MSFTB', 1.1], ['METAB', -0.9], ['AMZNB', 3.3]].map(([sym, ch24], i) => ({ id: sym.toLowerCase() + '-bstock', sym, name: sym, price: 100 + i * 10, ch24 }));
const series = (price, p24, p7) => { const n = 24 * 9, t0 = NOW - (n - 1) * HR; return { t0, step: HR, p: Array.from({ length: n }, (_, i) => i === n - 1 ? price : i >= n - 25 ? p24 : i >= n - 169 ? (p24 + p7) / 2 : p7) }; };
const LIVE = { bitcoin: { usd: 77000, usd_24h_change: 1.25, usd_market_cap: 1.53e12, usd_24h_vol: 4e10 }, solana: { usd: 150, usd_24h_change: 3.5 }, tether: { usd: 1.0002, usd_24h_change: 0.01 }, chainlink: { usd: 11, usd_24h_change: -4.2 }, pendle: { usd: 3.21, usd_24h_change: 7.7, usd_market_cap: 5e8 } };
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { type: 'service_account', project_id: 'samsam-portfolio', client_email: 'bot@samsam-portfolio.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://oauth2.googleapis.com/token' };
const fsv = v => typeof v === 'string' ? { stringValue: v } : typeof v === 'number' ? { doubleValue: v } : typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(fsv) } } : v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fsv(x)])) } } : { nullValue: null };
const doc = o => ({ name: 'x', fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fsv(v)])) });
let LANG = 'ar';   // the alerts are in Arabic — the bot still starts in English
let AGG_CALLS = 0, LIST_TXS = 0, COIN_UPD = '';
const USER = () => ({
  coins: [{ sym: 'BTC', cgId: 'bitcoin', opening: { qty: 0.1, avg: 70000 }, ...(COIN_UPD ? { updatedAt: COIN_UPD } : {}) }, { sym: 'SOL', cgId: 'solana', opening: { qty: 10, avg: 160 } },
    { sym: 'LINK', cgId: 'chainlink', opening: { qty: 50, avg: 15 } }, { sym: 'USDT', cgId: 'tether', opening: { qty: 900, avg: 0.5 } },
    { sym: 'NOID', name: 'No Id Coin', opening: { qty: 100, avg: 2 } },   // saved without a CoinGecko id, not in the top 500 — like PONS / CYBER
    ...Array.from({ length: MANY }, (_, i) => ({ sym: 'ZZ' + i, cgId: 'zz-coin-' + i, opening: { qty: 1, avg: 1 } }))],
  txs: [], accum: [{ sym: 'SOL', targetQty: 20 }, { sym: 'LINK', targetQty: 50 }, { sym: 'PENDLE', targetQty: 100, alertPrice: 3, cgId: 'pendle' }],
  meta: { alerts: { lang: LANG }, baseline: { btcPrice: 70000 }, exitPlan: [{ sym: 'LINK', tps: [{ price: 25, pct: 25, lock: true }, { price: 0, pct: 50, lock: false }, { price: 0, pct: 25, lock: false }] }] },
});
const sent = [], claudeCalls = [], fileGets = [], VOICE_BYTES = new Uint8Array(70000).map((_, i) => (i * 7) % 256); const commits = [], committed = [], composeCalls = []; let COMPOSE_FAIL = false, HOT = false; const kicks = [], pinWrites = [], accessWrites = [], tglinkWrites = []; let TGLINK = null; let OWNER_PIN = 'UID1', ACCOUNTS = ['UID1']; let FS_WRITE_403 = false, logoFetches = 0, BN403 = false, bnCalls = 0, EXLIVE = {}, tokenCalls = 0, cgDown = false, MANY = 0, outside = 0;
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (input, init = {}) => {
  const u = typeof input === 'string' ? input : input.url, body = init.body;
  if (!u.startsWith('https://api.telegram.org/')) outside++;
  if (u.startsWith('https://api.telegram.org/file/bot123:fake/')) { fileGets.push(u); return new Response(VOICE_BYTES, { status: 200 }); }
  if (u.startsWith('https://api.telegram.org/bot') && u.endsWith('/getFile')) { const b = JSON.parse(body); sent.push({ m: 'getFile', b }); return J({ ok: true, result: { file_id: b.file_id, file_path: 'voice/file_9.oga' } }); }
  if (/^https:\/\/(coin-images|assets)\.coingecko\.com\//.test(u)) { logoFetches++; return /tether|325/.test(u) ? new Response('nf', { status: 404 }) : /notimage/.test(u) ? new Response('<html>', { headers: { 'content-type': 'text/html' } }) : new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'), { headers: { 'content-type': 'image/png' } }); }
  if (u === 'https://api.github.com/repos/drsamirsaad1981-design/samsam-portfolio/actions/workflows/prices.yml/dispatches') { kicks.push({ auth: init.headers.authorization, body: JSON.parse(body) }); return new Response(null, { status: 204 }); }
  if (u.startsWith('https://api.telegram.org/bot') && body instanceof FormData) { const m = u.split('/').pop(); const ph = body.get('photo'); sent.push({ m, b: { chat_id: body.get('chat_id'), caption: body.get('caption'), photoBytes: ph ? new Uint8Array(await ph.arrayBuffer()) : null } }); return J({ ok: true, result: { message_id: 8 } }); }
  if (u.startsWith('https://api.telegram.org/bot')) { const m = u.split('/').pop(); const b = JSON.parse(body); sent.push({ m, b }); return J(m === 'editMessageText' && b.text === sent.lastEdit ? { ok: false, description: 'Bad Request: message is not modified' } : { ok: true, result: { message_id: 7 } }); }
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
    if (/\/users\/UID2\/meta\/tglink$/.test(u) && init.method === 'PATCH') { tglinkWrites.push(JSON.parse(body)); TGLINK = null; return J({}); }
    if (u.endsWith('/documents/config/owner')) { if (init.method === 'PATCH') { pinWrites.push(JSON.parse(body)); OWNER_PIN = JSON.parse(body).fields.uid.stringValue; return J({}); } return OWNER_PIN ? J(doc({ uid: OWNER_PIN })) : J({}, 404); }
    if (u.endsWith(':runAggregationQuery')) { AGG_CALLS++; const c = JSON.parse(body).structuredAggregationQuery.structuredQuery.from[0].collectionId, uid = (/\/users\/(\w+):/.exec(u) || [])[1];
      const n = uid === 'UID1' ? (c === 'txs' ? committed.length : c === 'coins' ? U.coins.length : U.accum.length) : (c === 'coins' ? 1 : 0); return J([{ result: { aggregateFields: { n: { integerValue: String(n) } } } }]); }
    if (u.endsWith(':runQuery') && /"updatedAt"/.test(body)) { const since = JSON.parse(body).structuredQuery.where.fieldFilter.value.stringValue, c = JSON.parse(body).structuredQuery.from[0].collectionId, uid = (/\/users\/(\w+):/.exec(u) || [])[1];
      const rows = uid === 'UID1' ? (c === 'coins' ? U.coins : U.accum) : []; return J(rows.filter(r => typeof r.updatedAt === 'string' && r.updatedAt > since).slice(0, 1).map(r => ({ document: { name: 'x', fields: doc(r).fields } })).concat([{ readTime: 'now' }])); }
    if (u.endsWith(':runQuery') && /"limit":1000/.test(body)) return J([...ACCOUNTS.map(a => ({ document: { name: 'projects/p/databases/(default)/documents/users/' + a + '/meta/info', fields: {} } })), ...(TGLINK ? [{ document: { name: 'projects/p/databases/(default)/documents/users/UID2/meta/tglink', fields: doc(TGLINK).fields } }] : [])]);
    if (/\/users\/UID2\/(coins|txs|accum)\?/.test(u)) return J({ documents: /coins/.test(u) ? [doc({ sym: 'ETH', cgId: 'ethereum', opening: { qty: 2, avg: 2500 } })] : [] });
    if (u.endsWith('/users/UID2/meta/info')) return J(doc({}));
    if (u.endsWith(':runQuery')) return J(ACCOUNTS.map(a => ({ document: { name: 'projects/p/databases/(default)/documents/users/' + a + '/meta/info' } })));
    if (u.includes('/users/UID1/coins?')) return J({ documents: U.coins.map(doc) });
    if (u.includes('/users/UID1/txs?')) LIST_TXS++;
    if (u.includes('/users/UID1/txs?')) return J({ documents: committed.map(w => ({ name: w.update.name, fields: w.update.fields })) });
    if (u.endsWith('/documents:commit')) { if (FS_WRITE_403) return J({ error: { code: 403, message: 'Missing or insufficient permissions.' } }, 403); const b = JSON.parse(body); commits.push(b); committed.push(...b.writes); return J({ writeResults: b.writes.map(() => ({ updateTime: new Date().toISOString() })), commitTime: new Date().toISOString() }); }
    if (u.includes('/users/UID1/accum?')) return J({ documents: U.accum.map(doc) });
    if (u.endsWith('/users/UID1/meta/info')) return J(doc(U.meta));
    return J({}, 404);
  }
  if (u.startsWith('https://www.googleapis.com/service_accounts')) return J({ keys: [{ ...crypto.createPublicKey(privateKey).export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }] });
  if (u === 'https://api.anthropic.com/v1/messages') {
    const b = JSON.parse(body); claudeCalls.push(b);
    if (/SMART (MORNING|EVENING)/.test(b.system || '')) { composeCalls.push(b); if (COMPOSE_FAIL) return J({ type: 'error', error: { type: 'overloaded_error' } }, 529); const f = JSON.parse(b.messages[0].content.replace(/^FACTS:\n/, '')); return J({ stop_reason: 'end_turn', content: [{ type: 'text', text: /MORNING/.test(b.system) ? `☀️ **Calm day**\n🎯 **Today**\n1. ${(f.todo[0] || {}).what || 'hold'}` : `🌙 **Quiet day**\n• since morning: **${f.since_morning ? f.since_morning.portfolio_change_usd : 'n/a'}**` }] }); }
    if (init.headers['x-api-key'] !== 'sk-test') return J({ type: 'error', error: { type: 'authentication_error' } }, 401);
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
const post = (upd, secret = ENV.TG_SECRET, env = ENV) => W.fetch(new Request(HOST + '/tg', { method: 'POST', headers: { 'content-type': 'application/json', ...(secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {}) }, body: JSON.stringify(upd) }), env, {});
let UPD = 100;
const say = (text, chat = 555) => post({ update_id: ++UPD, message: { message_id: 1, chat: { id: chat, type: 'private' }, from: { id: chat }, text } });
const tap = data => post({ update_id: ++UPD, callback_query: { id: 'q1', data, from: { id: 555 }, message: { message_id: 42, chat: { id: 555 } } } });
const out = () => sent.filter(x => x.m === 'sendMessage' || x.m === 'editMessageText');
const last = () => out().slice(-1)[0];
const okHtml = t => { const tags = [...t.matchAll(/<\/?([a-z]+)[^>]*>/g)].map(m => m[1]); const stray = t.replace(/<\/?(b|i|code)>/g, '').match(/[<>]|&(?!amp;|lt;|gt;)/); return tags.every(x => ['b', 'i', 'code'].includes(x)) && !stray; };
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
check('portfolio: the exit line — Exit 0/3 · next TP LINK +127%', /🚪 Exit 0\/3 · next TP LINK \+127%/.test(pf), pf.slice(-200));
check('portfolio: best / worst today up to 5 each, no stablecoin', !/USDT\s/.test(pf.split('🌍')[0]) && (pf.match(/📈 <b>Best today<\/b>\n((?:<code>.*\n?)+)/) || ['', ''])[1].trim().split('\n').length <= 5, pf);
check('"Open the app" is a link to the site', btns(v).find(b => b.text === '📱 Open the app').url === 'https://drsamirsaad1981-design.github.io/samsam-portfolio/');
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
const pick = n => { const T = [...market.top, ...top500.top].filter((r, i, a) => r.rank <= n && r.ch24 != null && !isStable(r.sym) && a.findIndex(x => x.id === r.id) === i).map(r => ({ ...r, ch24: LIVE[r.id] ? LIVE[r.id].usd_24h_change : r.ch24 }));
  return [...[...T].sort((a, b) => b.ch24 - a.ch24).slice(0, 5), ...[...T].sort((a, b) => a.ch24 - b.ch24).slice(0, 5)].map(r => r.sym.toUpperCase()); };
let tops = [...cryptoPart(v.b.text).matchAll(/<code>(\S+)\s/g)].map(x => x[1]);
check('market best / worst: no stablecoins', tops.length > 0 && !tops.some(isStable), tops);
check(`market: Top 100 → 5 best + 5 worst ${pick(100)}`, JSON.stringify(tops) === JSON.stringify(pick(100)), { tops, want: pick(100) });
check('market buttons: ✓ Top 100 · Top 200 · Top 300 · Top 500, then Refresh', JSON.stringify(btns(v).slice(0, 5).map(b => [b.text, b.callback_data])) === JSON.stringify([['✓ Top 100', 'mk:100'], ['Top 200', 'mk:200'], ['Top 300', 'mk:300'], ['Top 500', 'mk:500'], ['🔄 Refresh', 'mk:100']]), btns(v).map(b => b.text));
const bs = [...v.b.text.split('🏦')[1] ? v.b.text.matchAll(/🏦 <b>bStocks · (best|worst) 24h<\/b>\n((?:<code>.*\n?)+)/g) : []].map(x => [x[1], [...x[2].matchAll(/<code>(\S+)\s/g)].map(y => y[1])]);
check('bStocks: best 5 (CRCLB, AMZNB, NVDAB, MSFTB, AAPLB) + worst 5 (GMEB, TSLAB, METAB, AAPLB, MSFTB)', JSON.stringify(bs) === JSON.stringify([['best', ['CRCLB', 'AMZNB', 'NVDAB', 'MSFTB', 'AAPLB']], ['worst', ['GMEB', 'TSLAB', 'METAB', 'AAPLB', 'MSFTB']]]) && /tokenized US stocks/.test(v.b.text), bs);
sent.length = 0; await tap('mk:500');
v = last(); tops = [...cryptoPart(v.b.text).matchAll(/<code>(\S+)\s/g)].map(x => x[1]);
check(`tap Top 500 → edited in place, 5 best + 5 worst of the top 500 ${pick(500)}`, v.m === 'editMessageText' && /Top 500 · best 24h/.test(v.b.text) && JSON.stringify(tops) === JSON.stringify(pick(500)) && btns(v)[3].text === '✓ Top 500', { tops, want: pick(500) });
sent.length = 0; await say('/market');
check('…and Top 500 is remembered next time', /Top 500 · best 24h/.test(last().b.text) && btns(last())[4].callback_data === 'mk:500', last().b.text.slice(0, 40));
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
check('exit: the 3 conditions (✅ / ⬜) with now → target', /Exit conditions<\/b> · 0 of 3 met/.test(v.b.text) && /⬜ BTC dominance [\d.]+% → ≤ 45\.9%/.test(v.b.text) && /⬜ USDT dominance/.test(v.b.text) && /⬜ ETH\/BTC/.test(v.b.text), v.b.text);
check('exit: LINK TP1 $25 (+127%, sell 25%), TP2 = avg $15 × 3, TP3 × 5 — one short line each', /<b>LINK<\/b> · \$11\.00/.test(v.b.text) && /⬜ TP1 \$25\.00 · \+127% · 25%/.test(v.b.text) && /⬜ TP2 \$45\.00 · \+309% · 50%/.test(v.b.text) && /⬜ TP3 \$75\.00 · \+582% · 25%/.test(v.b.text), v.b.text);
const exLong = Math.max(...plain(v.b.text).split('\n').map(l => [...l].length));
check(`exit: every line fits a phone (longest ${exLong} ≤ 40)`, exLong <= 40, plain(v.b.text).split('\n').filter(l => [...l].length > 40));
check('exit: button opens Exit Strategy (accumulation.html#exit); Telegram-safe', btns(v).some(b => b.url && b.url.endsWith('accumulation.html#exit')) && okHtml(v.b.text), btns(v));
sent.length = 0; await tap('ex');
check('tap 🚪 Exit plan → edited in place', last().m === 'editMessageText' && /Exit plan/.test(last().b.text));
sent.length = 0; await say('/signals');
check('signals: grouped, Telegram-safe', /Signals/.test(last().b.text) && okHtml(last().b.text), last().b.text);
sent.length = 0; await say('/start');
check('/start → the welcome with the keyboard under the chat, then the menu', out().length === 2 && out()[0].b.reply_markup.keyboard && out()[0].b.reply_markup.is_persistent === false && btnTexts(out()[1]).length === 12 && btnTexts(out()[1]).includes('🗓 Daily') && btnTexts(out()[1]).includes('🧪 Paper') && btns(out()[1]).some(b => b.text === '📊 Report' && b.web_app && b.web_app.url === HOST + '/tg/app') && btnTexts(out()[1]).includes('🔔 Alerts') && btnTexts(out()[1]).includes('🌐 عربي') && btnTexts(out()[1]).includes('🚪 Exit plan'), out().map(x => Object.keys(x.b.reply_markup || {})));
check('the keyboard under the chat: 6 short buttons in 2 rows, not pinned (the ⌨️ icon hides / shows it)', JSON.stringify(out()[0].b.reply_markup.keyboard.map(r => r.map(b => b.text))) === JSON.stringify([['💼 Portfolio', '🌍 Market', '📋 Plan'], ['🚪 Exit', '🏆 Movers', '🎯 Signals']]) && out()[0].b.reply_markup.is_persistent === false, out()[0].b.reply_markup);
sent.length = 0; await say('/hide');
check('/hide → the buttons go away (remove_keyboard) with a note how to bring them back', last().b.reply_markup && last().b.reply_markup.remove_keyboard === true && /⌨️/.test(last().b.text), last().b);
for (const [txt, want] of [['🏆 Movers', /Best &amp; worst \(your coins\)/], ['🏆 Best & worst', /Best &amp; worst \(your coins\)/], ['🚪 Exit', /Exit conditions/], ['🚪 Exit plan', /Exit conditions/], ['🎯 Signals', /<b>Signals<\/b>/], ['📋 Plan', /Accumulation plan/], ['🌍 Market', /Top \d+ · best/]]) {
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
check('Claude called get_coin, then answered from its result (SOL $150, you hold 10, signal)', claudeCalls.length === 2 && claudeCalls[0].tools.length === 14 && /<b>SOL<\/b> is \$150 \(3\.5% 24h\)/.test(v.b.text) && /You hold 10 — /.test(v.b.text), v.b.text);
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
check('5 tools in one turn: portfolio, market (Top 200), plan, exit, 7-day history', all && all.length === 5 && all[0].total_value_usd > 0 && all[1].top200_best_24h && all[1].bstocks_best_24h.length === 5 && all[2].coins.length === 3 && all[3].conditions.length === 3 && all[4].change_pct != null && all[4].high && all[4].daily_closes, all && all.map(x => Object.keys(x).slice(0, 4)));
check('get_portfolio: every coin with share %, profit vs average, signal (USDT marked stablecoin)', all[0].coins.length === 5 && all[0].coins.find(c => c.ticker === 'USDT').stablecoin === true && all[0].coins.every(c => 'signal' in c && 'share_pct' in c), all[0].coins);
check('get_exit: LINK TP1 $25 at +127% to go, sell 25%', all[3].take_profits[0].ticker === 'LINK' && all[3].take_profits[0].level_usd === 25 && Math.round(all[3].take_profits[0].pct_to_go) === 127 && all[3].take_profits[0].sell_pct === 25, all[3].take_profits[0]);
check('get_portfolio: each coin\'s result vs BTC (vs_btc_pct) and 30 / 90-day strength vs BTC — one call answers "which coins are weaker than BTC"', all[0].coins.every(c => 'vs_btc_pct' in c && 'vs_btc_30d_pts' in c) && all[0].coins.find(c => c.ticker === 'SOL').vs_btc_pct != null, all[0].coins.map(c => [c.ticker, c.vs_btc_pct]));
sent.length = 0; claudeCalls.length = 0; await say('the futures of SOL?');
const dv = claudeCalls[1] && claudeCalls[1].messages.at(-1).content.map(r => JSON.parse(r.content));
const sm = dv && dv[0].summary;
check('get_derivatives: OKX + Binance + Hyperliquid for SOL', dv && dv[0].sources.map(x => x.source).join() === 'OKX,Binance,Hyperliquid', dv && dv[0]);
check('…funding: OKX 0.01% / Binance 0.03% / Hyperliquid 0.01% (hourly × 8) → average 0.0167% per 8 h, 18.3% a year, "longs paying (normal)"', sm.funding_8h_pct_avg === 0.0167 && sm.funding_annualized_pct === 18.3 && /longs paying \(normal\)/.test(sm.funding_reading), sm);
check('…open interest $500M + $600M + $300M = $1.4B, +9.6% in 24 h (OKX), 68.8% of accounts long (Binance)', sm.open_interest_usd_total === 1.4e9 && sm.open_interest_change_24h_pct === 9.6 && sm.long_accounts_pct === 68.8, sm);
check('…liquidations in the last 24 h (OKX): longs $15,000, shorts $3,200 (the 30-hour-old one left out)', sm.liquidations_24h.orders === 2 && sm.liquidations_24h.longs_usd === 15000 && sm.liquidations_24h.shorts_usd === 3200, sm.liquidations_24h);
check('…a coin with no futures → "no futures data", not a crash', /no futures data/.test(dv[1].error), dv[1]);
check('…the 📡 line names the futures sources', /futures: OKX, Binance, Hyperliquid \(live\)/.test(last().b.text), last().b.text.slice(-200));
check('the prompt says: call the tools again for every question (never repeat an earlier "no data"), and get_derivatives for liquidation questions', /call the tools again/.test(claudeCalls[0].system) && /never repeat an earlier "no data"/.test(claudeCalls[0].system) && /always call get_derivatives/.test(claudeCalls[0].system));
check('the prompt asks for the AI Analysis style: verdict line, emoji section titles, short bullets', /AI Analysis report/.test(claudeCalls[0].system) && /emoji \+ \*\*Title\*\*/.test(claudeCalls[0].system) && /One idea per bullet/.test(claudeCalls[0].system), claudeCalls[0].system.slice(0, 80));
sent.length = 0; claudeCalls.length = 0; await say('keep looking at btc please');
check('a model that keeps calling tools → after 8 rounds it must answer (tools still declared, tool_choice none) — no error', /Final answer after many rounds/.test(last().b.text) && claudeCalls.length === 9 && claudeCalls.at(-1).tool_choice.type === 'none' && claudeCalls.every(c => c.tools), [claudeCalls.length, last().b.text.slice(0, 60)]);
await say('/new'); claudeCalls.length = 0; await say('ما هي أفضل عملة؟'); await say('Which coins are weaker than BTC in my portfolio?');
check('language follows THIS message: Arabic question → "answer in Egyptian Arabic", English after it → "answer in English"', /in Arabic — answer in Egyptian Arabic/.test(claudeCalls[0].system) && /in English — answer in English/.test(claudeCalls.at(-1).system), claudeCalls.map(c => (c.system.match(/latest message is in [^—]+— [^(]+/) || [''])[0]));
check('…and the note rides on the question itself ("(Reply in English.)"), not kept in the memory', /\(Reply in English\.\)$/.test(claudeCalls.at(-1).messages.at(-1).content) && /جاوب بالعربي/.test(claudeCalls[0].messages.at(-1).content) && !claudeCalls.at(-1).messages.slice(0, -1).some(m => /Reply in English|جاوب بالعربي/.test(String(m.content))), claudeCalls.at(-1).messages.map(m => String(m.content).slice(-30)));
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

// ── language: English by default, 🌐 switches (and back) ──
sent.length = 0; await say('/menu');
check('English by default (even with the alerts set to Arabic): menu has "🌐 عربي"', /What would you like/.test(last().b.text) && btnTexts(last()).includes('🌐 عربي'), last().b.text);
sent.length = 0; await tap('lang:ar');
check('tap 🌐 عربي → "اللغة: عربي ✅" with the Arabic keyboard, the menu redrawn in Arabic', out().some(x => x.b.text === 'اللغة: عربي ✅' && x.b.reply_markup.keyboard[0][0].text === '💼 محفظتي') && out().some(x => x.m === 'editMessageText' && /تحب تشوف إيه/.test(x.b.text) && btnTexts(x).includes('🌐 English')), out().map(x => x.b.text.slice(0, 30)));
sent.length = 0; await say('/portfolio');
check('…and it stays Arabic', /محفظتك الآن/.test(last().b.text), last().b.text.slice(0, 60));
sent.length = 0; await say('english');
check('typing "english" → back to English', out().some(x => x.b.text === 'Language: English ✅') && /What would you like/.test(last().b.text), out().map(x => x.b.text.slice(0, 30)));
sent.length = 0; await say('/lang');
check('/lang → the two choices', JSON.stringify(btns(last()).map(b => b.callback_data)) === '["lang:en","lang:ar"]', btns(last()));

// ── Arabic ──
await tap('lang:ar');   // the Arabic checks below
sent.length = 0;
await post({ message: { chat: { id: 555 }, text: '/portfolio' } }, ENV.TG_SECRET, { ...ENV, BOT_LANG: 'ar' });
check('Arabic: "محفظتك الآن"', /محفظتك الآن/.test(last().b.text) && btnTexts(last()).includes('🔄 تحديث'), last().b.text.slice(0, 120));
sent.length = 0; await post({ message: { chat: { id: 555 }, text: '📋 الخطة' } }, ENV.TG_SECRET, { ...ENV, BOT_LANG: 'ar' });
check('Arabic keyboard "📋 الخطة" → the plan in Arabic', /خطة التجميع/.test(last().b.text) && okHtml(last().b.text), last().b.text);
sent.length = 0; await post({ message: { chat: { id: 555 }, text: 'sol' } }, ENV.TG_SECRET, { ...ENV, BOT_LANG: 'ar' });
check('Arabic coin card', /معاك <b>10 SOL<\/b>/.test(last().b.text) && /متوسطك/.test(last().b.text), last().b.text);

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
const kvStore = new Map(), KV = { get: async k => kvStore.has(k) ? kvStore.get(k) : null, put: async (k, v) => { kvStore.set(k, v); }, delete: async k => { kvStore.delete(k); } };
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
const fired = sent.filter(x => x.m === 'sendMessage');
check('cron: SOL $139 → "🔔 🔻 SOL below $140", now $139, the note, buttons SOL + Liq Map', fired.length === 1 && /🔔 🔻 <b>SOL below \$140<\/b>/.test(fired[0].b.text) && /Now: <b>\$139<\/b>/.test(fired[0].b.text) && /buy zone/.test(fired[0].b.text) && btns(fired[0])[0].text === '🪙 SOL', fired.map(x => x.b.text));
const left = JSON.parse(kvStore.get('tg:555:alerts'));
check('…and it is removed; the waiting one is still waiting (still above $100)', left.length === 2 && !left.some(a => a.value === 140) && left.find(a => a.value === 100).armed === false, left);
sent.length = 0; Wk = await fresh(); await cron(Wk);
check('next cron: nothing fires again', sent.filter(x => x.m === 'sendMessage').length === 0, sent.map(x => x.b.text));
LIVE.solana.usd = 95; Wk = await fresh(); await cron(Wk);
check('SOL drops to $95 → the "≥ $100" alert is now armed (no message)', JSON.parse(kvStore.get('tg:555:alerts')).find(a => a.value === 100).armed === true && sent.filter(x => x.m === 'sendMessage').length === 0);
LIVE.solana.usd = 105; Wk = await fresh(); sent.length = 0; await cron(Wk);
check('…back above $100 → "🚀 SOL above $100" fires', sent.some(x => x.m === 'sendMessage' && /🚀 <b>SOL above \$100<\/b>/.test(x.b.text)), sent.map(x => x.b.text));
LIVE.solana.usd = 150;
sent.length = 0; Wk = await fresh(); await postK(Wk, '/alerts');
av = last(); const del = btns(av).find(b => /^🗑 1/.test(b.text));
await Wk.fetch(new Request(HOST + '/tg', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': ENV.TG_SECRET }, body: JSON.stringify({ update_id: ++UPD, callback_query: { id: 'qd', data: del.callback_data, message: { message_id: 77, chat: { id: 555 } } } }) }), ENVK, {});
check('🗑 1 → deleted, the list redrawn in place, "🗑 Alert deleted"', JSON.parse(kvStore.get('tg:555:alerts')).length === 0 && last().m === 'editMessageText' && /No alerts yet/.test(last().b.text) && sent.some(x => x.m === 'answerCallbackQuery' && /deleted/.test(x.b.text || '')), [kvStore.get('tg:555:alerts'), last().b.text]);
sent.length = 0; Wk = await fresh(); await cron(Wk);
check('cron with no alerts → no outside calls, nothing sent', sent.length === 0);
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
check('voice → "🎙️ Listening…" at once', vm[0] && vm[0].m === 'sendMessage' && /^🎙️ (Listening|بسمع)…$/.test(vm[0].b.text), vm.map(x => x.b.text));
check('…the file is fetched from Telegram (getFile, then the download)', sent.some(x => x.m === 'getFile' && x.b.file_id === 'VF1') && fileGets.length === 1 && fileGets[0].endsWith('/voice/file_9.oga'), fileGets);
check('…Whisper turbo: first finds the language (no hint), then the whole note again in English with the English crypto words', aiRuns.length === 2 && aiRuns[0].model === '@cf/openai/whisper-large-v3-turbo' && aiRuns[0].inp.audio === Buffer.from(VOICE_BYTES).toString('base64') && !aiRuns[0].inp.initial_prompt && !aiRuns[0].inp.language && aiRuns[1].inp.language === 'en' && /BTC/.test(aiRuns[1].inp.initial_prompt) && !/[\u0600-\u06FF]/.test(aiRuns[1].inp.initial_prompt), aiRuns.map(x => [x.inp.language, x.inp.initial_prompt]));
check('…that message becomes "🎙️ I heard: <i>…</i>" + "🧠 Thinking…" under it', vm[1] && vm[1].m === 'editMessageText' && vm[1].b.message_id === 7 && /^🎙️ (I heard:|سمعت:) <i>what is the price of SOL\?<\/i>\n🧠 (Thinking|بفكّر)…$/.test(vm[1].b.text) && okHtml(vm[1].b.text), vm[1] && vm[1].b.text);
check('…then answered by Claude exactly like the typed question (tools called, answer about SOL)', claudeCalls.length === 2 && claudeCalls[0].messages.at(-1).content.startsWith('what is the price of SOL?') && /SOL<\/b> is \$/.test(last().b.text), [claudeCalls.length, last().b.text.slice(0, 80)]);
check('…all in ONE message: one sendMessage, the answer is an edit with "I heard" still on top + the buttons', sent.filter(x => x.m === 'sendMessage').length === 1 && last().m === 'editMessageText' && last().b.message_id === 7 && /^🎙️ (I heard:|سمعت:) <i>what is the price of SOL\?<\/i>\n\n<b>SOL/.test(last().b.text) && /left today|النهارده/.test(last().b.text) && btnTexts(last()).some(x => /SOL/.test(x)) && okHtml(last().b.text), [sent.map(x => x.m), last().b.text.slice(0, 90)]);
HEARD = 'sol'; sent.length = 0; claudeCalls.length = 0; await voice();
check('voice "sol" → the SOL card in the same message, under "I heard" (no Claude, no question used)', claudeCalls.length === 0 && sent.filter(x => x.m === 'sendMessage').length === 1 && last().m === 'editMessageText' && /^🎙️ (I heard:|سمعت:) <i>sol<\/i>\n\n/.test(last().b.text) && /SOL/.test(last().b.text) && btnTexts(last()).some(x => /Liq Map/.test(x)), [sent.map(x => x.m), last().b.text.slice(0, 60)]);
HEARD = 'my alerts'; sent.length = 0; claudeCalls.length = 0; await voice();
check('voice "alerts"-like words that are a question → still one message (to Claude)', sent.filter(x => x.m === 'sendMessage').length === 1, sent.map(x => x.m));
HEARD = '/alerts'; sent.length = 0; await voice();
check('voice that is a list command → "I heard" stays, the list comes as its own message', out().some(x => x.m === 'editMessageText' && /^🎙️ (I heard:|سمعت:) <i>\/alerts<\/i>$/.test(x.b.text)) && /alerts|تنبيه/i.test(last().b.text) && last().m === 'sendMessage', out().map(x => x.m + ' ' + x.b.text.slice(0, 40)));
HEARD = 'ممكن تنبهني لو سولانا نزلت تحت 82'; sent.length = 0; claudeCalls.length = 0; await voice();
check('Arabic voice → "سمعت / I heard" in Arabic letters, then to Claude', out().some(x => /ممكن تنبهني لو سولانا نزلت تحت 82/.test(x.b.text)) && claudeCalls.length >= 1, out().map(x => x.b.text.slice(0, 50)));
HEARD = 'tell <b>me</b> & go'; sent.length = 0; await voice();
check('heard text with < & is escaped (Telegram accepts it)', out().some(x => /I heard:|سمعت:/.test(x.b.text) && okHtml(x.b.text) && x.b.text.includes('&lt;b&gt;')), out().map(x => x.b.text.slice(0, 60)));
HEARD = ' . '; sent.length = 0; claudeCalls.length = 0; await voice();
check('silence / no words → "couldn\'t make out any words", nothing asked', /make out|ما سمعتش/.test(last().b.text) && claudeCalls.length === 0, last().b.text);
AI_FAIL = true; sent.length = 0; await voice(); AI_FAIL = false;
check('Whisper fails → "couldn\'t read that voice note", no crash', /read that voice|ما قدرتش أقرا/.test(last().b.text), last().b.text);
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
check('✅ tapped again → "already saved or cancelled", nothing written twice', commits.length === 1 && /already saved or cancelled|اتحفظت أو اتلغت/.test(last().b.text), last().b.text);
sent.length = 0; claudeCalls.length = 0; await say('I sold 20 LINK at 18');
tv = last(); tb = btns(tv);
check('a sell: date 10 Nov, fee $1, realized +$59 ((18−15)×20 − 1), LINK 50 → 30', /Sell 20 LINK<\/b> @ \$18\.00 = <b>\$360\.00<\/b>/.test(tv.b.text) && /10 Nov/.test(tv.b.text) && /fee \$1\.00/.test(tv.b.text) && /Realized: <b>\+\$59\.00<\/b>/.test(tv.b.text) && /LINK 50 → <b>30<\/b>/.test(tv.b.text), tv.b.text);
sent.length = 0; await tapM(tb[1].callback_data, tv.b.reply_markup);
check('❌ → cancelled, nothing written; ✅ after that does nothing', /Cancelled/.test(last().b.text) && commits.length === 1, last().b.text);
sent.length = 0; await tapM(tb[0].callback_data, tv.b.reply_markup);
check('…(✅ after ❌ → already cancelled)', commits.length === 1 && /already saved or cancelled|اتحفظت أو اتلغت/.test(last().b.text));
sent.length = 0; claudeCalls.length = 0; await say('I sold 999 SOL at 150');
const errs = claudeCalls[1].messages.at(-1).content.map(r => JSON.parse(r.content).error);
check('checks: sell more than held / a coin not held / no price / a price 100× off / a future date → errors, no buttons', /only 15 SOL held/.test(errs[0]) && /DOGE is not in the portfolio/.test(errs[1]) && /price is missing/.test(errs[2]) && /far from today/.test(errs[3]) && /future/.test(errs[4]) && !btns(last()).some(b => /^tx:/.test(b.callback_data || '')), errs);
sent.length = 0; claudeCalls.length = 0; await say('two buys please');
tv = last(); tb = btns(tv);
check('two trades in one message → numbered, "✅ Confirm all 2"; at-market BTC ($770 at $77,000 = 0.01 BTC); LINK 10 for $120 = $12 each', /1\. 🟢/.test(tv.b.text) && /2\. 🟢/.test(tv.b.text) && /Buy 0\.01 BTC<\/b> @ \$77,000/.test(tv.b.text) && /Buy 10 LINK<\/b> @ \$12\.00/.test(tv.b.text) && tb[0].text === '✅ Confirm all 2', [tv.b.text, tb.map(b => b.text)]);
FS_WRITE_403 = true; sent.length = 0; await tapM(tb[0].callback_data, tv.b.reply_markup); FS_WRITE_403 = false;
check('Firestore refuses the write (read-only account) → "Not saved" + how to fix it (Cloud Datastore User)', /Not saved/.test(last().b.text) && /Cloud Datastore User/.test(last().b.text) && commits.length === 1, last().b.text);
sent.length = 0; claudeCalls.length = 0; await say('بعت i sold 20 link بـ 18');
tv = last(); tb = btns(tv);
check('Arabic message → the summary + buttons in Arabic (بيع … ربح محقق, ✅ تأكيد)', /للحفظ/.test(tv.b.text) && /بيع 20 LINK<\/b> بسعر \$18\.00/.test(tv.b.text) && /الكمية: من 50 لـ <b>30<\/b> LINK/.test(tv.b.text) && /ربح محقق/.test(tv.b.text) && !/→/.test(tv.b.text) && tb[0].text === '✅ تأكيد', [tv.b.text, tb.map(b => b.text)]);
sent.length = 0; await tapM(tb[1].callback_data, tv.b.reply_markup);
check('…❌ answered in Arabic too', /اتلغت/.test(last().b.text), last().b.text);
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
LIVE.solana.usd = 140; Wd = await fresh(); sent.length = 0; composeCalls.length = 0; await cron(Wd, RIYADH('21:00'));
const em = sent.find(x => x.m === 'sendMessage' && /🌙/.test(x.b.text)), ef = composeCalls[0] && JSON.parse(composeCalls[0].messages[0].content.replace(/^FACTS:\n/, ''));
check('21:00 → 🌙 Smart evening: since the morning −$150 (SOL 150 → 140 × 15 — 5 bought above), BTC futures, sectors, closest levels', em && ef && ef.since_morning && Math.round(ef.since_morning.portfolio_change_usd) === -150 && ef.btc_futures !== undefined && ef.sectors_24h && ef.sectors_24h.best[0].name === 'AI' && Array.isArray(ef.closest_levels), ef && { s: ef.since_morning, sec: ef.sectors_24h });
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
// 🧲 radar: BTC, then SOL (your biggest coins), one per run
HOT = true; Wd = await fresh(); sent.length = 0; await cron(Wd, RIYADH('13:10')); await cron(Wd, RIYADH('13:40'));
const rm = sent.find(x => x.m === 'sendMessage' && /🧲/.test(x.b.text));
check('🧲 :10 / :40 → one coin each (BTC, then SOL): SOL funding hot → "Crowded longs" + Liq Map, once', rm && /SOL/.test(rm.b.text) && /(Crowded longs|لونجات زحمة)/.test(rm.b.text) && btns(rm).some(b => /Liq Map/.test(b.text)) && btns(rm).some(b => b.callback_data === 'c:solana') && okHtml(rm.b.text), rm && rm.b.text);
sent.length = 0; for (const hm of ['14:10', '14:40', '15:10', '15:40']) { Wd = await fresh(); await cron(Wd, RIYADH(hm)); }
check('…not again within 12 h (the next rounds stay quiet)', !sent.some(x => x.m === 'sendMessage' && /🧲.*SOL/s.test(x.b.text)), sent.filter(x => x.m === 'sendMessage').map(x => x.b.text.slice(0, 40)));
HOT = false;
// 🔥 sectors
sent.length = 0; Wd = await fresh(); await cron(Wd, RIYADH('16:25'));
const secm = sent.find(x => x.m === 'sendMessage' && /🔥/.test(x.b.text));
check('🔥 :25 hourly → sectors ≥ $1B moving ≥ 10%: AI +14.2% (you hold its leader SOL) and Meme −11.5%; tiny / calm ones left out', secm && /AI<\/b> \+14\.2%/.test(secm.b.text) && /SOL/.test(secm.b.text) && /Meme<\/b> −11\.5%/.test(secm.b.text) && !/Tiny|Calm/.test(secm.b.text), secm && secm.b.text);
sent.length = 0; Wd = await fresh(); await cron(Wd, RIYADH('17:25'));
check('…once a day each', !sent.some(x => x.m === 'sendMessage' && /🔥/.test(x.b.text)));
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
check('"/" menu sent again by itself: invite, users, start, report, daily, morning, evening, alerts, paper, pin, unpin, hide… (22)', names.length === 22 && ['invite', 'users', 'start', 'report', 'paper', 'menu', 'portfolio', 'price', 'market', 'plan', 'exit', 'movers', 'signals', 'alerts', 'daily', 'morning', 'evening', 'pin', 'unpin', 'new', 'lang', 'hide'].every(n => names.includes(n)), names);
sent.length = 0; Wd = await fresh(); await postK(Wd, '/menu');
check('…and only once (remembered in KV)', !sent.some(x => x.m === 'setMyCommands'));
claudeCalls.length = 0; sent.length = 0;
for (const c of ['/start', '/menu', '/portfolio', '/price btc', '/market', '/plan', '/exit', '/movers', '/signals', '/alerts', '/daily', '/morning', '/evening', '/pin', '/unpin', '/new', '/lang', '/hide']) { Wd = await fresh(); await postK(Wd, c); }
check('every command in the "/" menu is understood (none goes to the AI as a question) and answers', claudeCalls.filter(b => !/SMART/.test(b.system || '')).length === 0 && out().length >= 18, [claudeCalls.length, out().length]);

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

// ── 📊 phase 7: the Mini App — the page holds no data; /tg/api answers only Telegram-signed requests from your account ──
const initData = (userId, ageS = 60, token = ENV.TELEGRAM_BOT_TOKEN) => {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000) - ageS), query_id: 'AAE1', user: JSON.stringify({ id: userId, first_name: 'Samir' }) });
  const dcs = [...p.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => k + '=' + v).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  p.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex')); return p.toString();
};
const apiCall = (body, env = ENVK) => W.fetch(new Request(HOST + '/tg/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, {});
let ar0 = await W.fetch(new Request(HOST + '/tg/app'), ENVK, {}), html = await ar0.text();
check('/tg/app → the page (HTML, no data in it, a strict CSP, Telegram\'s script)', ar0.status === 200 && /text\/html/.test(ar0.headers.get('content-type')) && /telegram-web-app\.js/.test(html) && /frame-ancestors/.test(ar0.headers.get('content-security-policy')) && !/77,?000|UID1|samir@/i.test(html), ar0.headers.get('content-security-policy'));
check('/tg/api: no signature → 401', (await apiCall({})).status === 401);
check('…a forged signature (another bot token) → 401', (await apiCall({ initData: initData(555, 60, '999:other') })).status === 401);
check('…a signature older than 24 h → 401', (await apiCall({ initData: initData(555, 90000) })).status === 401);
check('…signed, but someone else (not your chat id) → 403', (await apiCall({ initData: initData(999) })).status === 403);
check('…GET → 405', (await W.fetch(new Request(HOST + '/tg/api'), ENVK, {})).status === 405);
let ar1 = await apiCall({ initData: initData(555) }), rj = await ar1.json();
check('…you, signed → the report: value / coins / plan / exit / market / today / alerts / paper', ar1.status === 200 && rj.ok && rj.report.connected && rj.report.pf.value > 0 && rj.report.coins[0].sym === 'BTC' && rj.report.plan.items.length === 3 && rj.report.exit.macro.length === 3 && rj.report.market.btc.price === 77000 && Array.isArray(rj.report.todo) && Array.isArray(rj.report.alerts) && rj.report.paper && rj.report.paper.start_cash_usd === 1000, rj.report && Object.keys(rj.report));
check('…coin shares add up to 100% and match the value', Math.abs(rj.report.coins.reduce((a, c) => a + c.share, 0) - 100) < 0.1 && Math.abs(rj.report.coins.reduce((a, c) => a + c.value, 0) - rj.report.pf.value) < 0.05);
// the page itself, in a browser: a fake Telegram + the real report
let PW = null; try { PW = (await import('node:module')).createRequire(import.meta.url)('playwright'); } catch (_) { console.log('SKIP the page in a browser (no Playwright here — GitHub\'s deploy check)'); }
if (PW) {
const { chromium } = PW;
const br = await chromium.launch(), pg = await br.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const perr = []; pg.on('pageerror', e => perr.push(String(e))); pg.on('console', m => { if (m.type() === 'error') perr.push(m.text()); });
let REP = rj.report;
await pg.route('https://telegram.org/**', r => r.fulfill({ contentType: 'text/javascript', body: 'window.Telegram={WebApp:{initData:"signed",ready(){},expand(){},HapticFeedback:{selectionChanged(){}}}};' }));
await pg.route(HOST + '/tg/app', r => r.fulfill({ contentType: 'text/html', body: html }));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
await pg.route(/https:\/\/(coin-images|assets)\.coingecko\.com\/.*/, r => /tether|usdt|325/i.test(r.request().url()) ? r.fulfill({ status: 404, body: '' }) : r.fulfill({ contentType: 'image/png', body: PNG }));   // USDT's logo "broken" → letters
let apiBody = null; await pg.route(HOST + '/tg/api', r => { apiBody = r.request().postData(); r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, report: REP }) }); });
await pg.goto(HOST + '/tg/app'); await pg.waitForSelector('.hero');
const txt0 = await pg.innerText('body');
check('page: sends Telegram\'s initData, shows the value, today\'s list, the coins tab (allocation + holdings)', JSON.parse(apiBody).initData === 'signed' && txt0.includes(new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(REP.pf.value)) && /Today/.test(txt0) && /Allocation/.test(txt0) && /Holdings/.test(txt0) && /BTC/.test(txt0), txt0.slice(0, 300));
await pg.waitForTimeout(200);
check('report sends real logos (CoinGecko) for your coins; only from allowed hosts', rj.report.logos.BTC && /^https:\/\/(coin-images|assets)\.coingecko\.com\//.test(rj.report.logos.BTC) && Object.values(rj.report.logos).every(u => /^https:\/\/(assets\.coingecko\.com|coin-images\.coingecko\.com|s2\.coinmarketcap\.com|raw\.githubusercontent\.com)\//.test(u)), rj.report.logos);
check('page shows them as images; a logo that fails becomes the coin\'s letters (USDT)', (await pg.$$('.ic.logo img')).length >= 3 && (await pg.$$eval('.ic:not(.logo)', a => a.map(x => x.textContent))).includes('USDT'), await pg.$$eval('.ic', a => a.map(x => x.className + ':' + x.textContent)));
check('allocation by the app\'s groups (no targets set → now only: Bitcoin first)', rj.report.alloc && !rj.report.alloc.targets && rj.report.alloc.groups[0].key === 'btc' && /Bitcoin/.test(await pg.innerText('body')), rj.report.alloc);
await pg.screenshot({ path: path.join(ROOT, 'tests/shots/miniapp_coins.png'), fullPage: true });
REP = { ...rj.report, alloc: { targets: true, band: 5, groups: [{ key: 'btc', name: 'Bitcoin', now: 62, target: 50, drift: 12, usd: 6800, fix: -1300, state: 'off' }, { key: 'layer1', name: 'Layer 1', now: 25, target: 30, drift: -5, usd: 2700, fix: 550, state: 'ok' }, { key: 'defi', name: 'DeFi', now: 13, target: 20, drift: -7, usd: 1400, fix: 770, state: 'warn' }] } };
await pg.click('.btn'); await pg.waitForTimeout(150);
const at = await pg.innerText('body');
check('with targets → now vs target, a target mark, "1/3 on target", trim $1,300 / add $770', /1\/3 on target/.test(at) && /trim \$1,300/.test(at) && /add \$770/.test(at) && /target 50%/.test(at) && (await pg.$$('.tmark')).length === 3, at.slice(0, 600));
await pg.screenshot({ path: path.join(ROOT, 'tests/shots/miniapp_alloc.png'), fullPage: false });
REP = rj.report;
const tabTexts = await pg.$$eval('.tab', a => a.map(x => x.textContent));
for (const [i, want] of [[1, /Overall/], [2, /Exit conditions[\s\S]*now[\s\S]*target/], [3, /Fear & Greed|Market/], [4, /Paper/], [5, /Alerts/]]) {
  await pg.click(`.tab >> nth=${i}`); const tt = await pg.innerText('body');
  check(`page tab ${tabTexts[i]} → ${want}`, want.test(tt), tt.slice(0, 200));
  if (i === 2 || i === 3) await pg.screenshot({ path: path.join(ROOT, `tests/shots/miniapp_${i === 2 ? 'exit' : 'market'}.png`), fullPage: true });
}
REP = { ...rj.report, lang: 'ar' }; await pg.click('.btn'); await pg.waitForTimeout(150);
const txtAr = await pg.innerText('body');
check('page in Arabic (right to left) after 🔄 with the bot in Arabic', (await pg.getAttribute('html', 'dir')) === 'rtl' && /القيمة الكلية/.test(txtAr), txtAr.slice(0, 120));
await pg.screenshot({ path: path.join(ROOT, 'tests/shots/miniapp_ar.png'), fullPage: true });
REP = { ...rj.report, coins: [{ sym: '<img src=x onerror=alert(1)>', name: '', qty: 1, price: 1, avg: 1, value: 50, share: 100, ch24: 1, ch7: 1, pnl: 1, signal: 'hold', stable: false }], lang: 'en' };
await pg.click('.btn'); await pg.waitForTimeout(150); await pg.click('.tab >> nth=0');
check('page never runs data as HTML (a coin named <img onerror> is shown as text)', (await pg.$$('img')).length === 0 && (await pg.innerText('body')).includes('<img'));
// 📸 image cards: drawn in the page, previewed, sent through /tg/card
REP = rj.report; await pg.click('.btn'); await pg.waitForTimeout(150);
await pg.route(HOST + '/tg/logo**', async r => { const res = await W.fetch(new Request(r.request().url()), ENVK, {}); r.fulfill({ status: res.status, contentType: res.headers.get('content-type') || 'text/plain', body: Buffer.from(await res.arrayBuffer()) }); });
let cardBody = null; await pg.route(HOST + '/tg/card', async r => { cardBody = JSON.parse(r.request().postData()); const res = await W.fetch(new Request(HOST + '/tg/card', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...cardBody, initData: initData(555) }) }), ENVK, {}); r.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); });
await pg.click('.hero .cam'); await pg.waitForFunction(() => { const i = document.querySelector('.sheet .prev'); return i && i.naturalWidth === 1080; }, null, { timeout: 5000 });
check('…the card draws the real logos (fetched through /tg/logo)', logoFetches >= 3, logoFetches);
check('📸 on the value card → a preview of a 1080×1350 portfolio card', (await pg.$eval('.sheet .prev', i => [i.naturalWidth, i.naturalHeight].join('x'))) === '1080x1350');
const pv1 = await pg.$eval('.sheet .prev', i => i.src); fs.writeFileSync(path.join(ROOT, 'tests/shots/card_portfolio.png'), Buffer.from(pv1.split(',')[1], 'base64'));
await pg.click('.sheet .more >> nth=0'); await pg.waitForFunction(old => document.querySelector('.sheet .prev').src !== old, pv1, { timeout: 5000 }).catch(() => {});
const pv2 = await pg.$eval('.sheet .prev', i => i.src);
check('…"hide $" redraws it without the amounts (a different image), remembered', pv2 !== pv1 && (await pg.evaluate(() => localStorage.getItem('cp-priv'))) === '1', [pv1.length, pv2.length, await pg.evaluate(() => localStorage.getItem('cp-priv')), await pg.$$eval('.sheet .more', b => b.map(x => x.textContent))]);
fs.writeFileSync(path.join(ROOT, 'tests/shots/card_portfolio_hidden.png'), Buffer.from(pv2.split(',')[1], 'base64'));
sent.length = 0; await pg.click('.sheet .btn'); await pg.waitForFunction(() => /Sent|اتبعتت/.test((document.querySelector('.sheet-st') || {}).textContent || ''), null, { timeout: 5000 });
const ph = sent.find(x => x.m === 'sendPhoto');
check('…📤 → the JPEG goes through /tg/card to Telegram as a photo in your chat, with a caption', cardBody && /^\/9j\//.test(cardBody.jpg) && ph && ph.b.chat_id === '555' && ph.b.photoBytes[0] === 0xFF && ph.b.photoBytes[1] === 0xD8 && /Cute Portfolio/.test(ph.b.caption), [cardBody && cardBody.jpg.slice(0, 8), ph && ph.b.caption]);
await pg.waitForTimeout(1000);
await pg.evaluate(() => localStorage.setItem('cp-priv', '0'));
await pg.click('.tab >> nth=0'); await pg.click('.row.tap >> nth=1'); await pg.waitForFunction(() => { const i = document.querySelector('.sheet .prev'); return i && i.naturalWidth === 1080; }, null, { timeout: 5000 });
fs.writeFileSync(path.join(ROOT, 'tests/shots/card_coin.png'), Buffer.from((await pg.$eval('.sheet .prev', i => i.src)).split(',')[1], 'base64'));
check('tap a coin in Holdings → its own card (SOL)', !!(await pg.$('.sheet .prev')));
await pg.click('.sheet .more >> text=Close');
await pg.click('.tab >> nth=3'); await pg.click('h2 .cam'); await pg.waitForFunction(() => { const i = document.querySelector('.sheet .prev'); return i && i.naturalWidth === 1080; }, null, { timeout: 5000 });
fs.writeFileSync(path.join(ROOT, 'tests/shots/card_market.png'), Buffer.from((await pg.$eval('.sheet .prev', i => i.src)).split(',')[1], 'base64'));
check('📸 on Market → the market card (no "hide $" there)', (await pg.$$('.sheet .more')).length === 1);
await pg.click('.sheet .more >> text=Close');
const many = Array.from({ length: 20 }, (_, i) => ({ sym: 'C' + i, name: '', qty: 1, price: 1, avg: 1, value: 1000 - i * 10, share: 5, ch24: 1, ch7: 1, pnl: 1, signal: 'hold', stable: false }));
REP = { ...rj.report, lang: 'en', coins: many, plan: { pct: 80, completed: 6, counted: 9, items: [...Array.from({ length: 6 }, (_, i) => ({ sym: 'D' + i, actual: 10, target: 10, pct: 100 })), { sym: 'ETH', actual: 0, target: 1, pct: 0 }, { sym: 'BTC', actual: 0.13, target: 1, pct: 13 }, { sym: 'SOL', actual: 9, target: 10, pct: 90 }] } };
await pg.click('.btn'); await pg.waitForTimeout(150); await pg.click('.tab >> nth=0');
const holdVisible = async () => pg.$$eval('section.card', cs => { const c = cs.find(x => /Holdings/.test(x.textContent)); return [...c.querySelectorAll('.row')].filter(r => r.getBoundingClientRect().height > 0 && r.closest('.fold') == null || (r.closest('.fold') && r.closest('.fold').getBoundingClientRect().height > 0)).length; });
check('a long list (20 coins) shows 8 + "▾ Show all 20"', (await holdVisible()) === 8 && (await pg.$$eval('.more', b => b.map(x => x.textContent))).includes('▾ Show all 20'), [await holdVisible(), await pg.$$eval('.more', b => b.map(x => x.textContent))]);
await pg.click('.more >> text=Show all 20'); await pg.waitForTimeout(400);
check('…tap → slides open to all 20, the button says "▴ Show less"', (await holdVisible()) === 20 && (await pg.$$eval('.more', b => b.map(x => x.textContent))).includes('▴ Show less'));
await pg.click('.tab >> nth=1'); await pg.waitForTimeout(100);
const planOrder = await pg.$$eval('section.card', cs => { const c = cs.find(x => /Overall/.test(x.textContent)); return [...c.querySelectorAll('.row')].filter(r => !r.closest('.fold') || r.closest('.fold').getBoundingClientRect().height > 0).map(r => r.textContent.trim().slice(0, 30)); });
check('plan: still-to-buy first, furthest first (ETH 0% → BTC 13% → SOL 90%); the 6 met fold into "✅ 6 targets met"', /Overall/.test(planOrder[0]) && /ETH/.test(planOrder[1]) && /BTC/.test(planOrder[2]) && /SOL/.test(planOrder[3]) && planOrder.length === 4 && (await pg.$$eval('.more', b => b.map(x => x.textContent))).includes('▾ ✅ 6 targets met'), planOrder);
await pg.screenshot({ path: path.join(ROOT, 'tests/shots/miniapp_plan_fold.png') });
await pg.click('.tab >> nth=0'); await pg.waitForTimeout(100);
check('…an opened list stays open when you come back to the tab', (await holdVisible()) === 20);
await pg.screenshot({ path: path.join(ROOT, 'tests/shots/miniapp_fold.png') });
REP = rj.report;
check('page: no script errors', perr.filter(e => !/Failed to load resource/.test(e)).length === 0, perr);
await br.close();
}

// /tg/card directly: the same checks as /tg/api, and only a JPEG goes on
const cardCall = body => W.fetch(new Request(HOST + '/tg/card', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), ENVK, {});
const JPG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3]).toString('base64');
check('/tg/card: no signature → 401 · someone else → 403 · not a JPEG → 400', (await cardCall({ jpg: JPG })).status === 401 && (await cardCall({ initData: initData(999), jpg: JPG })).status === 403 && (await cardCall({ initData: initData(555), jpg: Buffer.from('<svg/>').toString('base64') })).status === 400);
sent.length = 0; const cr = await cardCall({ initData: initData(555), jpg: JPG, kind: 'coin', sym: 'sol' });
check('…you + a JPEG → sendPhoto to your chat, caption "🪙 SOL · Cute Portfolio"', cr.status === 200 && sent.some(x => x.m === 'sendPhoto' && x.b.caption === '🪙 SOL · Cute Portfolio' && x.b.chat_id === '555'));

// /tg/logo: only coin-logo hosts, only images
const lg = u => W.fetch(new Request(HOST + '/tg/logo?u=' + encodeURIComponent(u)), ENVK, {});
let lr = await lg('https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png');
check('/tg/logo → the logo from this site (an image, cached a week)', lr.status === 200 && lr.headers.get('content-type') === 'image/png' && /max-age=604800/.test(lr.headers.get('cache-control')));
check('…another host → 400 · not https → 400 · not an image → 404', (await lg('https://evil.example.com/x.png')).status === 400 && (await lg('http://coin-images.coingecko.com/x.png')).status === 400 && (await lg('https://assets.coingecko.com/notimage')).status === 404);

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
check('Mini App for Ali (signed by him) → his report, no portfolio (connected: false)', await (async () => { const r = await apiCall({ initData: initData(777) }); const j = await r.json(); return r.status === 200 && j.report.connected === false; })());
LIVE.solana.usd = 130; kvStore.set('tg:777:alerts', JSON.stringify([{ id: 'a7', kind: 'price_below', value: 140, sym: 'SOL', cg: 'solana', armed: true, created: NOW }]));
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
check('…then just the e-mail on its own (as people do) → the same request goes to the owner, not to the AI', sent.some(x => String(x.b.chat_id) === '555' && /cute\.friend@gmail\.com/.test(x.b.text || '') && /ap:ok:777/.test(JSON.stringify(x.b.reply_markup || {}))), sent.map(x => (x.b.text || '').slice(0, 60)));
sent.length = 0; accessWrites.length = 0; await sayAs(777, '/app Ali.Friend@iCloud.com');
const req = sent.find(x => String(x.b.chat_id) === '555' && /ap:ok:777/.test(JSON.stringify(x.b.reply_markup || {})));
check('/app ali.friend@icloud.com → "sent for approval"; you get ✅ Allow / ❌ No; nothing allowed yet', /approval/.test(sent.find(x => x.m === 'sendMessage' && String(x.b.chat_id) === '777').b.text) && req && /ali\.friend@icloud\.com/.test(req.b.text) && accessWrites.length === 0, [sent.map(x => [x.m, x.b.chat_id, (x.b.text || '').slice(0, 40)]), accessWrites.length]);
sent.length = 0; await tapAs(555, 'ap:ok:777');
check('✅ → his e-mail goes into config/access (the rules read it) and he gets the app link', accessWrites.length === 1 && JSON.stringify(accessWrites[0]).includes('ali.friend@icloud.com') && sent.some(x => String(x.b.chat_id) === '777' && /drsamirsaad1981-design\.github\.io/.test(x.b.text || '')), accessWrites);
sent.length = 0; await sayAs(777, '/link ABCDEFGH');
check('/link with a wrong code → not valid (nothing linked)', /not valid/.test(last().b.text) && !JSON.parse(kvStore.get('tg:users'))['777'].uid);
TGLINK = { code: 'K7M2PQ9R', exp: new Date(Date.now() + 5 * 60e3).toISOString(), email: 'someone.else@x.com' }; sent.length = 0; await sayAs(777, '/link K7M2PQ9R');
check('…a code made by another e-mail than the approved one → refused', /another e-mail/.test(last().b.text) && !JSON.parse(kvStore.get('tg:users'))['777'].uid);
TGLINK = { code: 'K7M2PQ9R', exp: new Date(Date.now() - 60e3).toISOString(), email: 'ali.friend@icloud.com' }; sent.length = 0; await sayAs(777, '/link K7M2PQ9R');
check('…an expired code (over 10 min) → refused', /not valid/.test(last().b.text));
TGLINK = { code: 'K7M2PQ9R', exp: new Date(Date.now() + 5 * 60e3).toISOString(), email: 'ali.friend@icloud.com' }; sent.length = 0; tglinkWrites.length = 0; await sayAs(777, '/start LK7M2PQ9R');
check('…the app\'s "Open the bot" (/start LCODE) → linked to UID2, the code used up, his daily messages on', JSON.parse(kvStore.get('tg:users'))['777'].uid === 'UID2' && tglinkWrites.length === 1 && /Linked/.test(last().b.text) && JSON.parse(kvStore.get('tg:777:daily')).morning === true, [kvStore.get('tg:users'), last().b.text]);
sent.length = 0; await sayAs(777, '/portfolio');
check('Ali /portfolio → HIS portfolio (2 ETH from UID2) — never yours', /ETH/.test(last().b.text) && !/LINK|SOL/.test(last().b.text), last().b.text.slice(0, 200));
sent.length = 0; await postK(await fresh(), '/portfolio');
check('…and yours is still yours', /BTC/.test(last().b.text) && /SOL/.test(last().b.text));
// limits in /users: his card, − / +
sent.length = 0; await tapAs(555, 'us:m:777');
check('/users → tap Ali → his card: app e-mail, linked, 🧠 5 a day, 📊 1 a day', /ali\.friend@icloud\.com/.test(last().b.text) && /linked/.test(last().b.text) && /<b>5<\/b>/.test(last().b.text) && /<b>1<\/b>/.test(last().b.text), last().b.text);
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

console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
