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
const SOURCES = ['tools/ai-worker.js', 'tools/alerts-core.mjs', 'samsam-core.js', 'tools/worker/index.mjs', 'tools/worker/bot.mjs', 'tools/worker/data.mjs', 'tools/worker/cg-ids.json'];
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
const USER = () => ({
  coins: [{ sym: 'BTC', cgId: 'bitcoin', opening: { qty: 0.1, avg: 70000 } }, { sym: 'SOL', cgId: 'solana', opening: { qty: 10, avg: 160 } },
    { sym: 'LINK', cgId: 'chainlink', opening: { qty: 50, avg: 15 } }, { sym: 'USDT', cgId: 'tether', opening: { qty: 900, avg: 0.5 } },
    { sym: 'NOID', name: 'No Id Coin', opening: { qty: 100, avg: 2 } },   // saved without a CoinGecko id, not in the top 500 — like PONS / CYBER
    ...Array.from({ length: MANY }, (_, i) => ({ sym: 'ZZ' + i, cgId: 'zz-coin-' + i, opening: { qty: 1, avg: 1 } }))],
  txs: [], accum: [{ sym: 'SOL', targetQty: 20 }, { sym: 'LINK', targetQty: 50 }, { sym: 'PENDLE', targetQty: 100, alertPrice: 3, cgId: 'pendle' }],
  meta: { alerts: { lang: LANG }, baseline: { btcPrice: 70000 }, exitPlan: [{ sym: 'LINK', tps: [{ price: 25, pct: 25, lock: true }, { price: 0, pct: 50, lock: false }, { price: 0, pct: 25, lock: false }] }] },
});
const sent = [], claudeCalls = []; let tokenCalls = 0, cgDown = false, MANY = 0, outside = 0;
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (input, init = {}) => {
  const u = typeof input === 'string' ? input : input.url, body = init.body;
  if (!u.startsWith('https://api.telegram.org/')) outside++;
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
    if (u.endsWith(':runQuery')) return J([{ document: { name: 'projects/p/databases/(default)/documents/users/UID1/meta/info' } }]);
    if (u.includes('/users/UID1/coins?')) return J({ documents: U.coins.map(doc) });
    if (u.includes('/users/UID1/txs?')) return J({ documents: [] });
    if (u.includes('/users/UID1/accum?')) return J({ documents: U.accum.map(doc) });
    if (u.endsWith('/users/UID1/meta/info')) return J(doc(U.meta));
    return J({}, 404);
  }
  if (u.startsWith('https://www.googleapis.com/service_accounts')) return J({ keys: [] });
  if (u === 'https://api.anthropic.com/v1/messages') {
    const b = JSON.parse(body); claudeCalls.push(b);
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
    if (/futures of sol/i.test(q)) return J({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'td1', name: 'get_derivatives', input: { coin: 'sol' } }, { type: 'tool_use', id: 'td2', name: 'get_derivatives', input: { coin: 'zzqq' } }] });
    if (/everything/i.test(q)) return J({ stop_reason: 'tool_use', content: ['get_portfolio', 'get_market', 'get_plan', 'get_exit'].map((name, i) => ({ type: 'tool_use', id: 'tu' + i, name, input: name === 'get_market' ? { top: 200 } : {} })).concat([{ type: 'tool_use', id: 'tuh', name: 'get_history', input: { coin: 'sol', days: 7 } }]) });
    return J({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'A general answer about ' + q.slice(0, 30) }] });
  }
  if (u.startsWith('https://data-api.binance.vision/api/v3/ticker/24hr')) { const sy = new URL(u).searchParams.get('symbol'); return sy === 'NOIDUSDT' ? J({ symbol: sy, lastPrice: '2.50000000', priceChangePercent: '4.20' }) : J({ code: -1121, msg: 'Invalid symbol.' }, 400); }
  // futures data for SOL (OKX, Binance, Hyperliquid); anything else → not found
  if (u.startsWith('https://www.okx.com/api/v5/public/funding-rate?instId=SOL-USDT-SWAP')) return J({ code: '0', data: [{ fundingRate: '0.0001', nextFundingTime: String(NOW + 3 * HR) }] });
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
check('/start → the welcome with the keyboard under the chat, then the menu', out().length === 2 && out()[0].b.reply_markup.keyboard && out()[0].b.reply_markup.is_persistent === false && btnTexts(out()[1]).length === 8 && btnTexts(out()[1]).includes('🌐 عربي') && btnTexts(out()[1]).includes('🚪 Exit plan'), out().map(x => Object.keys(x.b.reply_markup || {})));
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
check('Claude called get_coin, then answered from its result (SOL $150, you hold 10, signal)', claudeCalls.length === 2 && claudeCalls[0].tools.length === 7 && /<b>SOL<\/b> is \$150 \(3\.5% 24h\)/.test(v.b.text) && /You hold 10 — /.test(v.b.text), v.b.text);
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

console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
