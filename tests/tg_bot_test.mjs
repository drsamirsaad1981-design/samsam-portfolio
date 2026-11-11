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
const series = (price, p24, p7) => { const n = 24 * 9, t0 = NOW - (n - 1) * HR; return { t0, step: HR, p: Array.from({ length: n }, (_, i) => i === n - 1 ? price : i >= n - 25 ? p24 : i >= n - 169 ? (p24 + p7) / 2 : p7) }; };
const LIVE = { bitcoin: { usd: 77000, usd_24h_change: 1.25, usd_market_cap: 1.53e12, usd_24h_vol: 4e10 }, solana: { usd: 150, usd_24h_change: 3.5 }, tether: { usd: 1.0002, usd_24h_change: 0.01 }, chainlink: { usd: 11, usd_24h_change: -4.2 }, pendle: { usd: 3.21, usd_24h_change: 7.7, usd_market_cap: 5e8 } };
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { type: 'service_account', project_id: 'samsam-portfolio', client_email: 'bot@samsam-portfolio.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://oauth2.googleapis.com/token' };
const fsv = v => typeof v === 'string' ? { stringValue: v } : typeof v === 'number' ? { doubleValue: v } : typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(fsv) } } : v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fsv(x)])) } } : { nullValue: null };
const doc = o => ({ name: 'x', fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fsv(v)])) });
let LANG = 'ar';   // the alerts are in Arabic — the bot still starts in English
const USER = () => ({
  coins: [{ sym: 'BTC', cgId: 'bitcoin', opening: { qty: 0.1, avg: 70000 } }, { sym: 'SOL', cgId: 'solana', opening: { qty: 10, avg: 160 } },
    { sym: 'LINK', cgId: 'chainlink', opening: { qty: 50, avg: 15 } }, { sym: 'USDT', cgId: 'tether', opening: { qty: 900, avg: 0.5 } }],
  txs: [], accum: [{ sym: 'SOL', targetQty: 20 }, { sym: 'LINK', targetQty: 50 }, { sym: 'PENDLE', targetQty: 100, alertPrice: 3, cgId: 'pendle' }],
  meta: { alerts: { lang: LANG }, baseline: { btcPrice: 70000 }, exitPlan: [{ sym: 'LINK', tps: [{ price: 25, pct: 25, lock: true }, { price: 0, pct: 50, lock: false }, { price: 0, pct: 25, lock: false }] }] },
});
const sent = []; let tokenCalls = 0, cgDown = false;
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (input, init = {}) => {
  const u = typeof input === 'string' ? input : input.url, body = init.body;
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
  throw new Error('unexpected fetch ' + u);
};

const W = (await import('../tools/dist/samsam-worker.js')).default;
const ENV = { TELEGRAM_BOT_TOKEN: '123:fake', TELEGRAM_CHAT_ID: '555', TG_SECRET: 'test_secret_0123456789', FIREBASE_SERVICE_ACCOUNT: JSON.stringify(SA) };
const HOST = 'https://samsam-analysis.example.workers.dev';
const post = (upd, secret = ENV.TG_SECRET, env = ENV) => W.fetch(new Request(HOST + '/tg', { method: 'POST', headers: { 'content-type': 'application/json', ...(secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {}) }, body: JSON.stringify(upd) }), env, {});
const say = (text, chat = 555) => post({ update_id: 1, message: { message_id: 1, chat: { id: chat, type: 'private' }, from: { id: chat }, text } });
const tap = data => post({ update_id: 2, callback_query: { id: 'q1', data, from: { id: 555 }, message: { message_id: 42, chat: { id: 555 } } } });
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
const sum = summarize(USER(), m, NOW);
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
check('unknown coin → "couldn\'t find", no crash', /couldn't find/.test(last().b.text) && okHtml(last().b.text), last().b.text);
cgDown = true; sent.length = 0; await say('link');
check('CoinGecko busy → the snapshot, with its age', /snapshot \d+ min old/.test(last().b.text) || /CoinGecko · live/.test(last().b.text), last().b.text.slice(-80));
cgDown = false;

// ── market, plan, signals, menu ──
sent.length = 0; await say('/market');
v = last();
check('market: BTC, dominance, Fear & Greed, top 100 best / worst', /BTC/.test(v.b.text) && /Fear/.test(v.b.text) && /Top 500 · best 24h/.test(v.b.text), v.b.text.slice(0, 300));
const tops = [...v.b.text.matchAll(/<code>(\S+)\s/g)].map(x => x[1]);
check('market best / worst: no stablecoins', tops.length > 0 && !tops.some(isStable), tops);
const T5 = [...market.top, ...top500.top].filter((r, i, a) => r.rank <= 500 && r.ch24 != null && !isStable(r.sym) && a.findIndex(x => x.id === r.id) === i).map(r => ({ ...r, ch24: LIVE[r.id] ? LIVE[r.id].usd_24h_change : r.ch24 }));
const best5 = [...T5].sort((a, b) => b.ch24 - a.ch24).slice(0, 5).map(r => r.sym.toUpperCase()), worst5 = [...T5].sort((a, b) => a.ch24 - b.ch24).slice(0, 5).map(r => r.sym.toUpperCase());
check(`market: top 500, 5 best ${best5} + 5 worst ${worst5}`, /Top 500 · best 24h/.test(v.b.text) && JSON.stringify(tops) === JSON.stringify([...best5, ...worst5]), { tops, best5, worst5 });
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
check('/start → the welcome with the keyboard under the chat, then the menu', out().length === 2 && out()[0].b.reply_markup.keyboard && out()[0].b.reply_markup.is_persistent && btnTexts(out()[1]).length === 8 && btnTexts(out()[1]).includes('🌐 عربي') && btnTexts(out()[1]).includes('🚪 Exit plan'), out().map(x => Object.keys(x.b.reply_markup || {})));
sent.length = 0; await say('💼 Portfolio');
check('a typed message shows "typing…" first', sent[0] && sent[0].m === 'sendChatAction' && sent[0].b.action === 'typing', sent.slice(0, 2).map(x => x.m));
check('the keyboard button "💼 Portfolio" → the portfolio', last().b.text.includes(fmt2(sum.value)));
sent.length = 0; await say('what do you think about the market this week?');
check('free text → "plain words arrive in the next phase" + menu (no crash)', /next phase/.test(last().b.text) && btnTexts(last()).length === 8, last().b.text);

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
check('Arabic keyboard "📋 الخطة" → the plan in Arabic', /خطة التجميع/.test(last().b.text) && okHtml(last().b.text), last().b.text.slice(0, 120));
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
