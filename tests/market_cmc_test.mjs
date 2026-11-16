// tools/update-market.mjs with CoinMarketCap: Fear & Greed and the Altcoin Season Index are CoinMarketCap's own numbers
// (with yesterday / last week from its history); the Altcoin Season page's coins are CoinMarketCap's top 100 (its order,
// its stablecoin / wrapped tags left out), matched to CoinGecko rows by ticker + market cap. When CoinMarketCap doesn't
// answer: alternative.me's Fear & Greed and the app's own count, as before.
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0; const check = (n, c, d) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 300) : '')); } };
const DAY = 864e5, today = Math.floor(Date.now() / DAY);
// 130 CoinGecko coins: bitcoin, a stablecoin, then alts; ALT7 and ALT8 swap places on CoinMarketCap; "ZZZ" is only on CoinGecko
const cg = [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', market_cap: 2e12, current_price: 100000 }, { id: 'tether', symbol: 'usdt', name: 'Tether', market_cap: 1.5e11, current_price: 1 }];
for (let i = 1; i <= 128; i++) cg.push({ id: 'alt' + i, symbol: 'alt' + i, name: 'Alt ' + i, market_cap: 1e11 / i, current_price: 10 + i });
cg.splice(5, 0, { id: 'zzz', symbol: 'zzz', name: 'Only on CoinGecko', market_cap: 9e10, current_price: 5 });
const mk = cg.map((c, i) => ({ ...c, image: '', market_cap_rank: i + 1, total_volume: 1, price_change_percentage_24h_in_currency: 1, price_change_percentage_7d_in_currency: 1, price_change_percentage_30d_in_currency: 1, sparkline_in_7d: { price: [1, 2] } }));
const cmcList = [{ symbol: 'BTC', name: 'Bitcoin', mc: 2e12 }, { symbol: 'USDT', name: 'Tether', mc: 1.5e11, tags: ['stablecoin'] }, { symbol: 'WBTC', name: 'Wrapped BTC', mc: 1e10, tags: [{ slug: 'wrapped-tokens' }] }]
  .concat(cg.filter(c => /^alt/.test(c.id)).map(c => ({ symbol: c.symbol.toUpperCase(), name: c.name, mc: c.market_cap })));
[cmcList[9], cmcList[10]] = [cmcList[10], cmcList[9]];   // a different order than CoinGecko's
let cmcUp = true, hits = { cmcPub: 0 };
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x'), J = o => { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify(o)); };
  if (u.pathname.startsWith('/cmcpub/')) { hits.cmcPub++; if (!cmcUp) { r.writeHead(403); return r.end('{}'); }
    if (u.pathname.endsWith('/v3/fear-and-greed/latest')) return J({ data: { value: 13, value_classification: 'Extreme fear', update_time: new Date().toISOString() }, status: { error_code: '0' } });
    if (u.pathname.endsWith('/v3/fear-and-greed/historical')) return J({ data: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ timestamp: new Date((today - n) * DAY).toISOString(), value: [13, 11, 15, 20, 22, 25, 27, 31, 33][n] })), status: { error_code: 0 } });
    if (u.pathname.endsWith('/v1/altcoin-season-index/latest')) return J({ data: { altcoin_index: 46, snapshot_time: new Date().toISOString() }, status: { error_code: 0 } }); }
  if (u.pathname === '/cmclist') { if (!cmcUp) { r.writeHead(403); return r.end('{}'); } return J({ data: { cryptoCurrencyList: cmcList.map(c => ({ symbol: c.symbol, name: c.name, slug: c.name.toLowerCase().replace(/\W+/g, '-'), tags: c.tags || [], quotes: [{ name: 'USD', marketCap: c.mc }] })) } }); }
  if (u.pathname === '/fng/') return J({ data: [{ value: '10', value_classification: 'Extreme Fear' }, { value: '10' }, {}, {}, {}, {}, {}, { value: '29' }] });
  if (u.pathname === '/cg/coins/markets') return J(u.searchParams.get('category') ? [] : u.searchParams.get('page') === '1' ? mk : []);
  if (u.pathname === '/cg/global') return J({ data: { total_market_cap: { usd: 3e12 }, total_volume: { usd: 1e11 }, market_cap_change_percentage_24h_usd: 1, market_cap_percentage: { btc: 58, eth: 10, usdt: 5 }, active_cryptocurrencies: 1 } });
  if (u.pathname === '/cg/coins/categories') return J([]);
  if (u.pathname.startsWith('/cg/coins/')) return J({ prices: [], market_caps: [] });
  if (u.pathname === '/bn/klines') {   // 100 daily candles; alts 1–60 doubled over 90 days, the rest flat; BTC +10%
    const sym = u.searchParams.get('symbol').replace(/USDT$/, ''), c = cg.find(x => x.symbol.toUpperCase() === sym); if (!c) { r.writeHead(400); return r.end('{}'); }
    const n = +(c.id.replace('alt', '')) || 0, up = c.id === 'bitcoin' ? 1.1 : n && n <= 60 ? 2 : 1;
    return J(Array.from({ length: 100 }, (_, i) => { const d = today - 99 + i, f = d <= today - 90 ? 1 / up : 1; return [d * DAY, String(c.current_price * f), '0', '0', String(c.current_price)]; }));
  }
  r.writeHead(404); r.end('{}');
});
await new Promise(ok => srv.listen(0, ok)); const B = 'http://127.0.0.1:' + srv.address().port;
const env = { ...process.env, CG_FAST: '1', NO_LINKS: '1', CG_API: B + '/cg', BN_API: B + '/bn', FNG_API: B + '/fng/?limit=2', CMC_PUB: B + '/cmcpub', CMC_LIST: B + '/cmclist?x=1' };
const run = dir => new Promise((ok, no) => { import('node:child_process').then(({ execFile }) => execFile(process.execPath, [path.join(ROOT, 'tools/update-market.mjs'), dir], { env, timeout: 120000 }, (e, so, se) => e ? no(e) : ok(so))); });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkt-'));
const out = await run(dir);
const m = JSON.parse(fs.readFileSync(path.join(dir, 'm/market.json'), 'utf8')), alt = JSON.parse(fs.readFileSync(path.join(dir, 'm/alt.json'), 'utf8'));
check('Fear & Greed is CoinMarketCap\'s (13, Extreme Fear), yesterday 11, last week 31', m.fng && m.fng.value === 13 && m.fng.label === 'Extreme Fear' && m.fng.prev === 11 && m.fng.week === 31 && m.fng.src === 'cmc', m.fng);
check('Altcoin Season is CoinMarketCap\'s official index (46), ready, the app\'s own count kept as "own"', m.alt && m.alt.value === 46 && m.alt.ready && m.alt.src === 'cmc' && m.alt.own != null && m.alt.label === 'Leaning Bitcoin', m.alt);
check('the page\'s coins are CoinMarketCap\'s top 100: its order, no stablecoin / wrapped, no CoinGecko-only coin', alt.list === 'cmc' && alt.coins.length === 100 && alt.coins[6].id === 'alt8' && alt.coins[7].id === 'alt7' && !alt.coins.some(c => c.id === 'zzz' || c.id === 'tether'), alt.coins.slice(5, 9).map(c => c.id));
check('…today on the page = the official number; the own count is there too', alt.official === 46 && alt.live[today][0] === 46 && alt.own === 60, [alt.official, alt.live[today], alt.own]);
// CoinMarketCap down → as before
cmcUp = false; fs.rmSync(dir, { recursive: true });
const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'mkt-'));
await run(dir2);
const m2 = JSON.parse(fs.readFileSync(path.join(dir2, 'm/market.json'), 'utf8')), alt2 = JSON.parse(fs.readFileSync(path.join(dir2, 'm/alt.json'), 'utf8'));
check('CoinMarketCap down → alternative.me\'s Fear & Greed (10)', m2.fng && m2.fng.value === 10 && m2.fng.src === 'alternative.me', m2.fng);
check('…and the app\'s own Altcoin Season count from CoinGecko\'s top 100', m2.alt && m2.alt.src === 'own' && m2.alt.value != null && alt2.list === 'coingecko' && alt2.coins.some(c => c.id === 'zzz'), m2.alt);
fs.rmSync(dir2, { recursive: true }); srv.close();
console.log(`${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
