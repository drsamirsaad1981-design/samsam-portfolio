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
    if (u.pathname.endsWith('/v3/fear-and-greed/historical')) return J({ data: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ timestamp: String((today - n) * 86400), value: [13, 11, 15, 20, 22, 25, 27, 31, 33][n] })), status: { error_code: 0 } });
    if (u.pathname.endsWith('/v1/global-metrics/quotes/latest')) return J({ data: { btc_dominance: 59.31, eth_dominance: 9.8, quote: { USD: { total_market_cap: 3.3e12, total_volume_24h: 9e10, total_market_cap_yesterday_percentage_change: -1.5 } } }, status: { error_code: 0 } });
    if (u.pathname.endsWith('/v1/altcoin-season-index/latest')) return J({ data: { altcoin_index: 46, snapshot_time: new Date().toISOString() }, status: { error_code: 0 } }); }
  if (u.pathname === '/cmclist') { if (!cmcUp) { r.writeHead(403); return r.end('{}'); } return J({ data: { cryptoCurrencyList: cmcList.map(c => ({ symbol: c.symbol, name: c.name, slug: c.name.toLowerCase().replace(/\W+/g, '-'), tags: c.tags || [], quotes: [{ name: 'USD', marketCap: c.mc }] })) } }); }
  if (u.pathname === '/fng/') return J({ data: [{ value: '10', value_classification: 'Extreme Fear' }, { value: '10' }, {}, {}, {}, {}, {}, { value: '29' }] });
  if (u.pathname === '/cg/coins/markets' && u.searchParams.get('category') === 'bstocks-ecosystem') { hits.stocksQ = u.search; return J([{ id: 'nvidia-bstock', symbol: 'nvdab', name: 'NVIDIA bStock', image: 'x.png', current_price: 180, market_cap: 5e8, total_volume: 1e7, price_change_percentage_24h_in_currency: 2.5, price_change_percentage_7d_in_currency: -1.2, sparkline_in_7d: { price: Array.from({ length: 168 }, (_, i) => 170 + i / 16) } },
    { id: 'sandisk-bstock', symbol: 'sndkb', name: 'SanDisk bStock', image: 'y.png', current_price: 79.6, market_cap: 5e6, total_volume: 1e7, price_change_percentage_24h_in_currency: -91.37, price_change_percentage_7d_in_currency: -90.9, sparkline_in_7d: { price: [917, 79] } }]); }
  if (u.pathname.startsWith('/yh/v8/finance/chart/')) { const sym = decodeURIComponent(u.pathname.split('/').pop()); if (sym === 'HG=F') { r.writeHead(429); return r.end('{}'); }
    const base = { 'GC=F': 2000, 'SI=F': 25, 'PL=F': 950, 'BZ=F': 80 }[sym]; return J({ chart: { result: [{ meta: { regularMarketPrice: base * 1.01, previousClose: base, regularMarketTime: 1795000000 }, indicators: { quote: [{ close: Array.from({ length: 22 }, (_, i) => base * (0.95 + i * 0.0025)) }] } }] } }); }
  // 🆕 a bStock that just listed: CoinGecko has the coin, the bStocks category doesn't yet
  if (u.pathname === '/cg/search') { hits.search = (hits.search || 0) + 1; return J({ coins: /Anthropic/.test(u.searchParams.get('query')) ? [{ id: 'anthropic-bstocks-tokenized-stock', name: 'Anthropic (bStocks Tokenized Stock)', symbol: 'ANTB' }, { id: 'anthropic-ondo', name: 'Anthropic (Ondo Tokenized Stock)', symbol: 'ANTON' }] : [{ id: 'nvidia-bstock', name: 'NVIDIA (bStocks Tokenized Stock)', symbol: 'NVDAB' }] }); }
  if (u.pathname === '/cg/coins/markets' && u.searchParams.get('ids') === 'anthropic-bstocks-tokenized-stock') { hits.extra = (hits.extra || 0) + 1; return J([{ id: 'anthropic-bstocks-tokenized-stock', symbol: 'antb', name: 'Anthropic (bStocks Tokenized Stock)', image: 'a.png', current_price: 89.4, market_cap: 3e6, total_volume: 2e6, price_change_percentage_24h_in_currency: -7.9, price_change_percentage_7d_in_currency: null, sparkline_in_7d: { price: [97, 95, 89] } }]); }
  if (u.pathname === '/cg/coins/markets') return J(u.searchParams.get('category') ? [] : u.searchParams.get('page') === '1' ? mk : []);
  if (u.pathname === '/cg/global') return J({ data: { total_market_cap: { usd: 3e12 }, total_volume: { usd: 1e11 }, market_cap_change_percentage_24h_usd: 1, market_cap_percentage: { btc: 58, eth: 10, usdt: 5 }, active_cryptocurrencies: 1 } });
  // 🐋 Hyperliquid: a leaderboard of 14 traders (2 too small, 1 bad address) and each one's positions
  if (u.pathname === '/hl/board') return J({ leaderboardRows: Array.from({ length: 14 }, (_, i) => ({ ethAddress: i === 13 ? 'nope' : '0x' + String(i + 1).padStart(40, '0'), accountValue: String(i >= 11 ? 5e5 : 5e6), windowPerformances: [['day', { pnl: '1' }], ['allTime', { pnl: String(1e6 * (20 - i)) }]] })) });
  if (u.pathname === '/hl/info') { let b = ''; q.on('data', c => { b += c; }); return q.on('end', () => { const n = +JSON.parse(b).user.slice(-2); hits.hl = (hits.hl || 0) + 1;
    J({ assetPositions: [{ position: { coin: 'BTC', szi: n <= 8 ? '1.5' : '-2', positionValue: '3000000' } }, { position: { coin: 'kPEPE', szi: '-100', positionValue: '50000' } }, { position: { coin: 'DUST', szi: '1', positionValue: '500' } }] }); }); }
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
const env = { ...process.env, CG_FAST: '1', NO_LINKS: '1', CG_API: B + '/cg', BN_API: B + '/bn', FNG_API: B + '/fng/?limit=2', CMC_PUB: B + '/cmcpub', CMC_LIST: B + '/cmclist?x=1', YH_API: B + '/yh', HL_BOARD: B + '/hl/board', HL_INFO: B + '/hl/info' };
const run = dir => new Promise((ok, no) => { import('node:child_process').then(({ execFile }) => execFile(process.execPath, [path.join(ROOT, 'tools/update-market.mjs'), dir], { env, timeout: 120000 }, (e, so, se) => e ? no(e) : ok(so))); });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkt-'));
const out = await run(dir);
const m = JSON.parse(fs.readFileSync(path.join(dir, 'm/market.json'), 'utf8')), alt = JSON.parse(fs.readFileSync(path.join(dir, 'm/alt.json'), 'utf8'));
check('Fear & Greed is CoinMarketCap\'s (13, Extreme Fear), yesterday 11, last week 31', m.fng && m.fng.value === 13 && m.fng.label === 'Extreme Fear' && m.fng.prev === 11 && m.fng.week === 31 && m.fng.src === 'cmc', m.fng);
check('Altcoin Season is CoinMarketCap\'s official index (46), ready, the app\'s own count kept as "own"', m.alt && m.alt.value === 46 && m.alt.ready && m.alt.src === 'cmc' && m.alt.own != null && m.alt.label === 'Leaning Bitcoin', m.alt);
check('the page\'s coins are CoinMarketCap\'s top 100: its order, no stablecoin / wrapped, no CoinGecko-only coin', alt.list === 'cmc' && alt.coins.length === 100 && alt.coins[6].id === 'alt8' && alt.coins[7].id === 'alt7' && !alt.coins.some(c => c.id === 'zzz' || c.id === 'tether'), alt.coins.slice(5, 9).map(c => c.id));
check('…today on the page = the official number; the own count is there too', alt.official === 46 && alt.live[today][0] === 46 && alt.own === 60, [alt.official, alt.live[today], alt.own]);
check('Market Dominance is CoinMarketCap\'s: BTC 59.31, ETH 9.8, USDT = its cap ÷ its total (4.545), the next coins from its list', m.global.domSrc === 'cmc' && m.global.dom.btc === 59.31 && m.global.dom.eth === 9.8 && m.global.dom.usdt === 4.545 && m.global.domTop[0][0] === 'ALT1' && m.global.domTop[0][1] === 3.03 && !m.global.domTop.some(x => x[0] === 'WBTC'), m.global);
check('Total market cap, volume and 24h are CoinMarketCap\'s (3.3T, 90B, −1.5%); CoinGecko\'s kept beside them', m.global.mcap === 3.3e12 && m.global.vol === 9e10 && m.global.mcapCh24 === -1.5 && m.global.src === 'cmc' && m.global.cg.mcap === 3e12 && m.global.cg.vol === 1e11, m.global);
check('📈 bStocks: a "−91% in a day" (a split / bad print) keeps its price but has no % — never a best / worst', (x => x && x.price === 79.6 && x.ch24 === null && x.ch7 === null)(m.stocks.find(r => r.sym === 'SNDKB')), m.stocks.find(r => r.sym === 'SNDKB'));
check('⏳ alt.json carries the 7 / 30 / 90-day changes as of the last daily close (what the Signal uses)', alt.closed && alt.closed.day === alt.today - 1 && Array.isArray(alt.closed.btc) && alt.closed.btc.length === 3 && Object.keys(alt.closed.p).length > 0 && Object.values(alt.closed.p).every(p => p.length === 3), alt.closed && [alt.closed.day, alt.closed.btc, Object.keys(alt.closed.p).length]);
check('🆕 a bStock CoinGecko lists but has not put in the category yet (Anthropic · ANTB) is found by name and added — only bStocks, no other issuer', (x => x && x.price === 89.4 && x.ch24 === -7.9 && x.fresh === true)(m.stocks.find(r => r.sym === 'ANTB')) && !m.stocks.some(r => r.sym === 'ANTON') && m.stocks.filter(r => r.sym === 'NVDAB').length === 1 && m.stockExtra.ids.join() === 'anthropic-bstocks-tokenized-stock', [m.stocks.map(r => r.sym), m.stockExtra]);
check('📈 bStocks: all of them (per_page=250) with logo, 24h and 7d change, a small 7-day line', /per_page=250/.test(hits.stocksQ) && /7d/.test(decodeURIComponent(hits.stocksQ)) && m.stocks && m.stocks[0].sym === 'NVDAB' && m.stocks[0].img === 'x.png' && m.stocks[0].ch7 === -1.2 && m.stocks[0].spark.length >= 20 && m.stocks[0].spark.length <= 30, m.stocks);
const gold = (m.metals || []).find(x => x.k === 'gold');
check('🥇 metals: gold, silver, platinum, Brent from Yahoo (price, +1% since the last close, a month of closes); copper refused → left out this time', m.metals && m.metals.map(x => x.k).join() === 'gold,silver,platinum,brent' && gold.unit === 'oz' && Math.abs(gold.price - 2020) < 1e-9 && Math.abs(gold.ch24 - 1) < 1e-9 && gold.spark.length === 22 && gold.ch7 != null && m.metals.find(x => x.k === 'brent').unit === 'bbl', m.metals);
check('🐋 whales: the biggest winners with ≥ $1M (11 of 14: two too small, one bad address) → per coin how many are long / short and the dollars: BTC 8 long · 3 short ($24M vs $9M) = "long"; kPEPE counted as PEPE; positions under $10k left out',
  m.whales && m.whales.n === 11 && hits.hl === 11 && m.whales.coins.BTC.long === 8 && m.whales.coins.BTC.short === 3 && m.whales.coins.BTC.longUsd === 24e6 && m.whales.coins.BTC.shortUsd === 9e6 && m.whales.coins.BTC.side === 'long' && m.whales.coins.PEPE.side === 'short' && !m.whales.coins.DUST && m.parts.whales, m.whales);
// CoinMarketCap down → as before
cmcUp = false; fs.rmSync(dir, { recursive: true });
const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'mkt-'));
await run(dir2);
const m2 = JSON.parse(fs.readFileSync(path.join(dir2, 'm/market.json'), 'utf8')), alt2 = JSON.parse(fs.readFileSync(path.join(dir2, 'm/alt.json'), 'utf8'));
check('CoinMarketCap down → alternative.me\'s Fear & Greed (10)', m2.fng && m2.fng.value === 10 && m2.fng.src === 'alternative.me', m2.fng);
check('CoinMarketCap down → CoinGecko\'s dominance (58)', m2.global.dom.btc === 58 && m2.global.domSrc !== 'cmc', m2.global);
check('…and the app\'s own Altcoin Season count from CoinGecko\'s top 100', m2.alt && m2.alt.src === 'own' && m2.alt.value != null && alt2.list === 'coingecko' && alt2.coins.some(c => c.id === 'zzz'), m2.alt);
fs.rmSync(dir2, { recursive: true }); srv.close();
// the app (samsam-market.js): CoinMarketCap's numbers from the snapshot, moved live by CoinGecko's change since then
{
  const vm = await import('node:vm');
  const snapG = { mcap: 3.3e12, vol: 9e10, mcapCh24: -1.5, src: 'cmc', cg: { mcap: 3e12, vol: 1e11, ch: -1 }, dom: { btc: 59.31, eth: 9.8, usdt: 4.5 }, domTop: [['BNB', 3.4]], domSrc: 'cmc' };
  let cgLive = { mcap: 3.03e12, vol: 1.1e11 }, cgUp = true;
  const fetchF = (url) => {
    const J = o => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(o) });
    if (url.includes('market.json')) return J({ updated: new Date().toISOString(), parts: { global: new Date().toISOString(), dom: new Date().toISOString() }, global: snapG });
    if (url.includes('/global')) return cgUp ? J({ data: { total_market_cap: { usd: cgLive.mcap }, total_volume: { usd: cgLive.vol }, market_cap_change_percentage_24h_usd: 0, market_cap_percentage: { btc: 58, eth: 10, usdt: 5 } } }) : Promise.reject(new Error('busy'));
    return Promise.reject(new Error('no'));
  };
  const store = {}, ctx = { window: { __marketSnap: 'https://x/m/market.json' }, location: { hostname: '', pathname: '/' }, navigator: { onLine: true }, fetch: fetchF,
    localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } }, setTimeout, Promise, Date, JSON, Math };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'samsam-market.js'), 'utf8'), ctx);
  const g = (await ctx.window.SamsamMarket.global(true)).data;
  check('app: CoinGecko\'s total moved +1% since the snapshot → CoinMarketCap\'s 3.3T moves +1% (3.333T); dominance is CoinMarketCap\'s', Math.abs(g.mcap - 3.333e12) < 1e6 && Math.abs(g.vol - 9.9e10) < 1e6 && g.dom.btc === 59.31 && g.domTop[0][0] === 'BNB', g);
  check('app: …24h follows too (−1.5% → about −0.515%)', Math.abs(g.mcapCh24 - ((1 - 0.015) * 1.01 - 1) * 100) < 1e-9, g.mcapCh24);
}
// ETF flows (tools/update-etf.mjs): a fund list saved before every issuer reported (adds up to −143M of the day's −185M)
// is asked again; once it adds up it isn't asked again
{
  let funds = [['IBIT', -143531040], ['FBTC', 0]], calls = 0;
  const s2 = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x'), J = o => { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ code: 0, data: o })); };
    if (u.pathname.endsWith('/etfs/summary-history')) return J([{ date: '2026-11-13', total_net_inflow: -185450233, cum_net_inflow: 1, total_net_assets: 1, total_value_traded: 1 }]);
    if (u.pathname.endsWith('/etfs')) { calls++; return J(funds.map(([t]) => ({ ticker: t, name: t }))); }
    const m = /\/etfs\/([A-Z]+)\/market-snapshot/.exec(u.pathname); if (m) { const f = funds.find(x => x[0] === m[1]); return J({ date: '2026-11-13', net_inflow: f[1], cum_inflow: 1, net_assets: 1 }); }
    r.writeHead(404); r.end('{}');
  });
  await new Promise(ok => s2.listen(0, ok));
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'etf-')); fs.mkdirSync(path.join(d, 'm'));
  fs.writeFileSync(path.join(d, 'm/etf.json'), JSON.stringify({ btc: { days: [['2026-11-13', -185450233, 1, 1, 1]], funds: { date: '2026-11-13', at: Date.now() - 3 * 3600e3, list: [{ t: 'IBIT', net: -143531040 }, { t: 'FBTC', net: 0 }] } }, eth: { days: [] } }));
  const runEtf = () => new Promise((ok, no) => import('node:child_process').then(({ execFile }) => execFile(process.execPath, [path.join(ROOT, 'tools/update-etf.mjs'), d], { env: { ...process.env, CG_FAST: '1', SOSO_API: 'http://127.0.0.1:' + s2.address().port, SOSO_API_KEY: 'test' }, timeout: 60000 }, (e, so) => e ? no(e) : ok(so))));
  const realNow = Date.now(); const dayOk = realNow - Date.parse('2026-11-13T00:00:00Z') < 4 * 864e5;
  funds = [['IBIT', -143531040], ['FBTC', -41919193]];
  await runEtf();
  let e = JSON.parse(fs.readFileSync(path.join(d, 'm/etf.json'), 'utf8'));
  if (dayOk) check('ETF: funds that don\'t add up to the day yet are asked again → FBTC −41.9M now in', e.btc.funds.list.find(f => f.t === 'FBTC').net === -41919193 && calls >= 1, e.btc.funds);
  else check('ETF: (the test day is older than 4 days — only checks it ran)', !!e.btc.days.length);
  const c0 = calls; await runEtf();
  check('ETF: once they add up, the funds aren\'t asked again', calls === c0, calls - c0);
  s2.close(); fs.rmSync(d, { recursive: true });
}
console.log(`${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
