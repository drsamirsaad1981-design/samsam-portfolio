// Samsam Portfolio — one source for coin names, colours, logos and CoinGecko links (all pages).
// Pages keep their old names (COIN_COLORS, COIN_ICONS, COIN_NAMES, COINGECKO_IDS) as references to these maps.
(function () {
  var COLORS = {
    "BTC": "#f7931a",
    "ETH": "#627eea",
    "SOL": "#9945ff",
    "BNB": "#f3ba2f",
    "TAO": "#6366f1",
    "SUI": "#4da2ff",
    "NEAR": "#00c08b",
    "SEI": "#c4342d",
    "ATOM": "#2e3148",
    "APT": "#00c8a5",
    "AVAX": "#e84142",
    "ICP": "#29abe2",
    "KSM": "#e6007a",
    "GRAM": "#0088cc",
    "ARB": "#1b4add",
    "MOVR": "#53cbc9",
    "GLMR": "#e1147b",
    "OP": "#ff0420",
    "WLD": "#191c1f",
    "PYTH": "#6b4ede",
    "JUP": "#a855f7",
    "RENDER": "#e74c3c",
    "QNT": "#1a1a2e",
    "HBAR": "#222222",
    "DOGE": "#c2a633",
    "MON": "#8b5cf6",
    "CRO": "#002d74",
    "XDC": "#f9a825",
    "DOT": "#e6007a",
    "LINK": "#2a5ada",
    "ENS": "#5284ff",
    "STRK": "#ff4f00",
    "ONDO": "#3b82f6",
    "AVAIL": "#4f46e5",
    "KAVA": "#ff564f",
    "PONS": "https://assets.coingecko.com/coins/images/102174571/standard/jhitvkisdq8fhxvimdkpcw7y3dx5.?1784093932",
    "MNT": "#000",
    "FLR": "https://assets.coingecko.com/coins/images/28624/standard/FLR-icon200x200.png?1696527609",
    "KAS": "#49eacb",
    "POL": "#8247e5",
    "VTHO": "https://assets.coingecko.com/coins/images/5230/standard/VTHO_Circle_Crop__Reference_.png?1751980206",
    "VET": "#15bdff",
    "NIGHT": "#1a1a2e",
    "XPL": "#3b82f6",
  };
  var ICONS = {
    "BTC": "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
    "ETH": "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
    "SOL": "https://assets.coingecko.com/coins/images/4128/large/solana.png",
    "BNB": "https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
    "NEAR": "https://assets.coingecko.com/coins/images/10365/large/near.jpg",
    "TAO": "https://assets.coingecko.com/coins/images/28452/large/ARUsPeNQ_400x400.jpeg",
    "ICP": "https://assets.coingecko.com/coins/images/14495/large/Internet_Computer_logo.png",
    "AVAX": "https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png",
    "LINK": "https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png",
    "HBAR": "https://assets.coingecko.com/coins/images/3688/large/hbar.png",
    "ATOM": "https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png",
    "SEI": "https://assets.coingecko.com/coins/images/28205/large/Sei_Logo_-_Transparent.png",
    "APT": "https://assets.coingecko.com/coins/images/26455/large/aptos_round.png",
    "SUI": "https://assets.coingecko.com/coins/images/26375/large/sui_asset.jpeg",
    "KSM": "https://assets.coingecko.com/coins/images/9568/large/m4zRhP5e_400x400.jpg",
    "ARB": "https://assets.coingecko.com/coins/images/16547/large/photo_2023-03-29_21.47.00.jpeg",
    "MOVR": "https://assets.coingecko.com/coins/images/17984/large/9285.png",
    "GLMR": "https://assets.coingecko.com/coins/images/22459/large/glmr.png",
    "OP": "https://assets.coingecko.com/coins/images/25244/standard/Token.png?1774456081",
    "WLD": "https://assets.coingecko.com/coins/images/31069/large/worldcoin.jpeg",
    "PYTH": "https://assets.coingecko.com/coins/images/31924/standard/pyth.png?1701245725",
    "JUP": "https://assets.coingecko.com/coins/images/34188/large/jup.png",
    "RENDER": "https://assets.coingecko.com/coins/images/11636/large/rndr.png",
    "QNT": "https://assets.coingecko.com/coins/images/3370/large/5ZOu7brX_400x400.jpg",
    "DOGE": "https://assets.coingecko.com/coins/images/5/large/dogecoin.png",
    "ENS": "https://assets.coingecko.com/coins/images/19785/large/acatxTm8_400x400.jpg",
    "STRK": "https://assets.coingecko.com/coins/images/26433/large/starknet.png",
    "ONDO": "https://assets.coingecko.com/coins/images/26580/large/ONDO.png",
    "AVAIL": "https://assets.coingecko.com/coins/images/37372/standard/avail-logo-200-200.png?1761925657",
    "KAVA": "https://assets.coingecko.com/coins/images/9761/large/kava.png",
    "MNT": "https://assets.coingecko.com/coins/images/30980/standard/MNT_Token_Logo.png?1765516974",
    "FLR": "https://assets.coingecko.com/coins/images/28624/standard/FLR-icon200x200.png?1696527609",
    "KAS": "https://assets.coingecko.com/coins/images/25751/large/kaspa-icon-exchanges.png",
    "POL": "https://assets.coingecko.com/coins/images/32440/standard/pol.png?1759114181",
    "VET": "https://assets.coingecko.com/coins/images/1167/standard/VET.png?1742383283",
    "VTHO": "https://assets.coingecko.com/coins/images/5230/standard/VTHO_Circle_Crop__Reference_.png?1751980206",
    "CRO": "https://assets.coingecko.com/coins/images/7310/large/cro_token_logo.png",
    "XDC": "https://assets.coingecko.com/coins/images/2912/large/xdc-icon.png",
    "DOT": "https://assets.coingecko.com/coins/images/12171/large/polkadot.png",
    "GRAM": "https://assets.coingecko.com/coins/images/17980/large/ton_symbol.png",
    "MON": "https://assets.coingecko.com/coins/images/38927/standard/mon.png?1766029057",
    "NIGHT": "https://s2.coinmarketcap.com/static/img/coins/200x200/39064.png",
    "XPL": "https://assets.coingecko.com/coins/images/66489/standard/Plasma-symbol-green-1.png?1755142558",
    "PONS": "https://assets.coingecko.com/coins/images/102174571/standard/jhitvkisdq8fhxvimdkpcw7y3dx5.?1784093932",
  };
  var NAMES = {
    "BTC": "Bitcoin",
    "SOL": "Solana",
    "NEAR": "NEAR Protocol",
    "TAO": "Bittensor",
    "ICP": "Internet Computer",
    "AVAX": "Avalanche",
    "LINK": "Chainlink",
    "HBAR": "Hedera",
    "ATOM": "Cosmos",
    "SEI": "Sei Network",
    "APT": "Aptos",
    "KSM": "Kusama",
    "ARB": "Arbitrum",
    "MOVR": "Moonriver",
    "GLMR": "Moonbeam",
    "MNT": "Mantle",
    "FLR": "Flare",
    "KAS": "Kaspa",
    "POL": "Polygon",
    "XPL": "Plasma",
    "VTHO": "VeThor",
    "VET": "VeChain",
    "DOGE": "Dogecoin",
    "ENS": "ENS Domains",
    "ONDO": "Ondo Finance",
    "STRK": "Starknet",
    "NIGHT": "Midnight",
    "MON": "Monad",
    "CRO": "Cronos",
    "XDC": "XDC Network",
    "KAVA": "Kava",
    "GRAM": "Telegram TON",
    "PONS": "Pons",
    "AVAIL": "Avail",
    "PYTH": "Pyth Network",
    "JUP": "Jupiter DEX",
    "RENDER": "Render",
    "QNT": "Quant",
    "OP": "Optimism",
    "WLD": "Worldcoin",
    "DOT": "Polkadot",
    "BNB": "BNB Chain",
    "ETH": "Ethereum (All Networks)",
    "SUI": "Sui",
  };
  var CG_IDS = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "SOL": "solana",
    "BNB": "binancecoin",
    "TAO": "bittensor",
    "SUI": "sui",
    "NEAR": "near",
    "SEI": "sei-network",
    "ATOM": "cosmos",
    "APT": "aptos",
    "AVAX": "avalanche-2",
    "ICP": "internet-computer",
    "KSM": "kusama",
    "GRAM": "the-open-network",
    "NIGHT": "midnight-3",
    "ARB": "arbitrum",
    "MOVR": "moonriver",
    "GLMR": "moonbeam",
    "OP": "optimism",
    "WLD": "worldcoin-wld",
    "PYTH": "pyth-network",
    "JUP": "jupiter-exchange-solana",
    "RENDER": "render-token",
    "QNT": "quant-network",
    "HBAR": "hedera-hashgraph",
    "DOGE": "dogecoin",
    "CRO": "crypto-com-chain",
    "XDC": "xdce-crowd-sale",
    "DOT": "polkadot",
    "LINK": "chainlink",
    "ENS": "ethereum-name-service",
    "STRK": "starknet",
    "ONDO": "ondo-finance",
    "AVAIL": "avail",
    "KAVA": "kava",
    "MNT": "mantle",
    "FLR": "flare-networks",
    "KAS": "kaspa",
    "POL": "polygon-ecosystem-token",
    "VTHO": "vethor-token",
    "VET": "vechain",
    "MON": "monad",
    "PONS": "pons-2",
    "XPL": "plasma",
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // CoinGecko page slug when it differs from the price-API id (checked against coingecko.com)
  var PAGE_SLUGS = { PONS: 'pons' };
  function coingeckoUrl(sym, cgId) {
    if (cgId && !/^[a-z0-9][a-z0-9-]{0,99}$/.test(cgId)) cgId = null;   // only plain CoinGecko slugs
    var id = PAGE_SLUGS[sym] || cgId || CG_IDS[sym]; return id ? 'https://www.coingecko.com/en/coins/' + encodeURIComponent(id) : null;
  }
  // ── Coin pages open on CoinMarketCap (prices still come from CoinGecko's free feed) ──
  // CoinMarketCap page names, each checked on coinmarketcap.com (Oct 2026).
  var CMC_SLUGS = {
    BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'bnb', TAO: 'bittensor', SUI: 'sui', NEAR: 'near-protocol', SEI: 'sei',
    ATOM: 'cosmos', APT: 'aptos', AVAX: 'avalanche', ICP: 'internet-computer', KSM: 'kusama', GRAM: 'toncoin', ARB: 'arbitrum',
    MOVR: 'moonriver', GLMR: 'moonbeam', OP: 'optimism-ethereum', WLD: 'worldcoin-org', PYTH: 'pyth-network', JUP: 'jupiter-ag',
    RENDER: 'render', QNT: 'quant', HBAR: 'hedera', DOGE: 'dogecoin', MON: 'monad', CRO: 'cronos', XDC: 'xdc-network',
    DOT: 'polkadot-new', LINK: 'chainlink', ENS: 'ethereum-name-service', STRK: 'starknet-token', ONDO: 'ondo-finance',
    AVAIL: 'avail', KAVA: 'kava', PONS: 'pons', MNT: 'mantle', FLR: 'flare', KAS: 'kaspa', POL: 'polygon-ecosystem-token',
    VTHO: 'vethor-token', VET: 'vechain', NIGHT: 'midnight-network', XPL: 'plasma-xpl', XRP: 'xrp',
  };
  var META = {};   // per coin, from the cloud: { cmcSlug, name }
  function registerCoin(sym, m) { sym = String(sym || '').toUpperCase(); if (sym) META[sym] = { cmcSlug: m && m.cmcSlug, name: m && m.name }; }
  // CoinMarketCap names most pages after the coin's name: "NEAR Protocol" → near-protocol
  function cmcGuess(name) {
    return String(name || '').toLowerCase().replace(/\([^)]*\)/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || null;
  }
  function cmcSlug(sym, opts) {
    opts = opts || {}; var S = String(sym || '').toUpperCase(), m = META[S] || {};
    var ok = function (x) { return x && /^[a-z0-9][a-z0-9-]{0,99}$/.test(x) ? x : null; };
    return ok(opts.cmcSlug) || ok(m.cmcSlug) || CMC_SLUGS[S] || ok(cmcGuess(opts.name || m.name || NAMES[S]));
  }
  function cmcUrl(sym, opts) { var s = cmcSlug(sym, opts); return s ? 'https://coinmarketcap.com/currencies/' + encodeURIComponent(s) + '/' : null; }
  // Every "open this coin" link in the app (name, symbol, logo) — kept under its old name so all pages follow.
  function cgUrl(sym, cgId, opts) { return cmcUrl(sym, opts) || coingeckoUrl(sym, cgId); }
  function fallback(sym, size) {
    size = size || 36; var color = COLORS[sym] || '#6b7280';
    if (/^https?:/.test(color)) color = '#6b7280';
    return '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:' + color + ';display:flex;align-items:center;justify-content:center;font-size:' + Math.round(size * 0.32) + 'px;font-weight:700;color:#fff;flex-shrink:0;letter-spacing:-.5px">' + esc(String(sym).slice(0, 3)) + '</div>';
  }
  // opts: { logoUrl, cgId } from the coin record when known
  function icon(sym, size, opts) {
    size = size || 36; opts = opts || {};
    var url = (opts.logoUrl && /^https:\/\//.test(opts.logoUrl) ? opts.logoUrl : null) || ICONS[sym];
    if (!url) return fallback(sym, size);
    return '<img src="' + esc(url) + '" width="' + size + '" height="' + size + '" alt="' + esc(sym) + '" data-sym="' + esc(sym) + '" data-size="' + size + '" style="border-radius:50%;flex-shrink:0;object-fit:contain;background:transparent" onerror="SamsamCoins.imgErr(this)">';
  }
  function imgErr(el) { if (!el.parentNode) return; el.outerHTML = fallback(el.getAttribute('data-sym'), parseInt(el.getAttribute('data-size')) || 36); }
  var LINK = 'target="_blank" rel="noopener" style="text-decoration:none;color:inherit;transition:opacity .15s" onmouseover="this.style.opacity=\'0.7\'" onmouseout="this.style.opacity=\'1\'"';
  function iconLinked(sym, size, opts) {
    var u = cgUrl(sym, opts && opts.cgId), i = icon(sym, size, opts);
    return u ? '<a href="' + u + '" ' + LINK.replace('text-decoration:none', 'display:inline-flex;flex-shrink:0;border-radius:50%;text-decoration:none') + ' title="Open ' + esc(sym) + ' on CoinMarketCap">' + i + '</a>' : i;
  }
  // Symbol (bold) + name, linked to CoinGecko — same look as the main page
  function nameLinked(sym, opts) {
    opts = opts || {};
    var name = opts.name || NAMES[sym] || '';
    var inner = '<div class="coin-sym" style="font-weight:700;font-size:' + (opts.symSize || '0.85rem') + ';line-height:1.2">' + esc(sym) + (opts.badge || '') + '</div><div style="font-size:0.72rem;color:var(--fg2);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(name) + '</div>';
    var u = cgUrl(sym, opts.cgId);
    return u ? '<a href="' + u + '" ' + LINK.replace('text-decoration:none', 'display:block;min-width:0;text-decoration:none') + ' title="Open ' + esc(sym) + ' on CoinMarketCap">' + inner + '</a>' : '<div style="min-width:0">' + inner + '</div>';
  }
  // CoinGlass liquidation heatmap for a coin (opens in a new tab). Symbol differs on CoinGlass for a few coins.
  var LIQ_SYMS = { GRAM: 'TON' };
  function liqMapUrl(sym) { var s = LIQ_SYMS[sym] || String(sym || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return 'https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=' + encodeURIComponent(s); }
  // CoinCodex price prediction. CoinCodex uses its own page names (checked against its API, Oct 2026);
  // a coin added later stores its CoinCodex name as coin.ccSlug (looked up when it is added).
  var CC_SLUGS = {
    BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binance-coin', TAO: 'bittensor', SUI: 'sui', NEAR: 'near-protocol',
    SEI: 'sei', ATOM: 'cosmos', APT: 'aptos', AVAX: 'avalanche', ICP: 'internet-computer', KSM: 'kusama', GRAM: 'toncoin',
    ARB: 'arbitrum', MOVR: 'moonriver', GLMR: 'moonbeam', OP: 'optimism', WLD: 'worldcoin-org', PYTH: 'pyth-network',
    JUP: 'jupiter-coin', RENDER: 'render-token', QNT: 'quant-network', HBAR: 'hedera-hashgraph', DOGE: 'dogecoin',
    MON: 'monad-xyz', CRO: 'cronos', XDC: 'xdc-network', DOT: 'polkadot', LINK: 'chainlink', ENS: 'ethereum-name-service',
    STRK: 'starknet', ONDO: 'ondo-finance', AVAIL: 'avail-network', KAVA: 'kava', PONS: 'pons', MNT: 'mantle',
    FLR: 'spark-token', KAS: 'kaspa', POL: 'polygon-ecosystem-token', VTHO: 'vethor-token', VET: 'vechain-token',
    NIGHT: 'midnight-network', XPL: 'xpl-token', XRP: 'ripple',
  };
  var SLUG_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;
  function ccSlug(sym, opts) {
    opts = opts || {}; var s = String(sym || '').toUpperCase();
    if (opts.ccSlug && SLUG_RE.test(opts.ccSlug)) return opts.ccSlug;
    return CC_SLUGS[s] || null;
  }
  // Direct page when the CoinCodex name is known; otherwise a search that always finds the right page.
  function predictionUrl(sym, opts) {
    opts = opts || {}; var slug = ccSlug(sym, opts);
    if (slug) return 'https://coincodex.com/crypto/' + encodeURIComponent(slug) + '/price-prediction/';
    var name = opts.name && opts.name !== sym ? opts.name + ' ' : '';
    return 'https://www.google.com/search?q=' + encodeURIComponent('site:coincodex.com ' + name + String(sym || '').toUpperCase() + ' price prediction');
  }
  // Look up a coin's CoinCodex page name (used when a coin is added). Matches the ticker AND the CoinGecko id
  // or the name — CoinCodex reuses tickers for different coins. Resolves null when unsure (search fallback).
  function findCcSlug(sym, opts) {
    opts = opts || {}; var S = String(sym || '').toUpperCase();
    if (CC_SLUGS[S]) return Promise.resolve(CC_SLUGS[S]);
    var guesses = [opts.cgId, String(opts.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')].filter(function (g) { return g && SLUG_RE.test(g); });
    var base = 'https://coincodex.com/api/v1/assets/get_asset_list?';
    var get = function (q) { return fetch(base + q).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
    return Promise.all([guesses.length ? get('select_byslug=' + guesses.map(encodeURIComponent).join(',')) : null, get('select_bysymbol=' + encodeURIComponent(S))])
      .then(function (res) {
        var list = [];
        res.forEach(function (j) { var a = j && (j.data || j.assets || j.result || j); if (Array.isArray(a)) list = list.concat(a); else if (a && typeof a === 'object') Object.keys(a).forEach(function (k) { if (a[k] && a[k].slug) list.push(a[k]); }); });
        var ok = list.filter(function (x) {
          var ds = String(x.display_symbol || x.symbol || '').toUpperCase();
          return x && x.slug && SLUG_RE.test(x.slug) && ds === S && !x.not_trading_anymore;
        });
        var named = ok.filter(function (x) { return guesses.indexOf(x.slug) >= 0 || (opts.name && String(x.name || '').toLowerCase() === String(opts.name).toLowerCase()); });
        var pick = named.sort(function (a, b) { return (+b.market_cap_usd || 0) - (+a.market_cap_usd || 0); })[0];
        return pick ? pick.slug : null;
      }).catch(function () { return null; });
  }
  // ── Best / worst performer cards (main page: 24h · Performance: since purchase and vs BTC) ──
  // rows: [{ sym, value, score, ... }] — coins worth < $1 or < 0.1% of the whole portfolio are left out
  // (a 30-cent coin up 40% is not your best performer). Returns { best, worst } or null when nothing qualifies.
  function pickMovers(rows, portfolioTotal) {
    var min = Math.max(1, (portfolioTotal || 0) * 0.001);
    var ok = (rows || []).filter(function (r) { return r && r.value >= min && typeof r.score === 'number' && isFinite(r.score); });
    if (!ok.length) return null;
    ok.sort(function (a, b) { return b.score - a.score; });
    return { best: ok[0], worst: ok.length > 1 ? ok[ok.length - 1] : null, count: ok.length };
  }
  var mvCss = false;
  function moversCss() {
    if (mvCss) return; mvCss = true;
    var st = document.createElement('style');
    st.textContent = '.mv-card{display:grid;grid-template-columns:1fr 1px 1fr;align-items:stretch;background:var(--card-solid,var(--bg2,#111827));border:1px solid var(--border,#334155);border-radius:16px;padding:14px 4px;box-sizing:border-box}' +
      '.mv-sep{background:var(--border,#334155);margin:6px 0}' +
      '.mv-half{display:flex;flex-direction:column;gap:6px;min-width:0;padding:4px 16px;border:none;background:none;color:inherit;font:inherit;text-align:left;border-radius:12px;cursor:pointer;text-decoration:none;-webkit-tap-highlight-color:transparent}' +
      '@media (hover:hover){.mv-half:hover{background:rgba(148,163,184,.08)}}.mv-half:active{background:rgba(148,163,184,.1)}.mv-half:focus-visible{outline:2px solid #a78bfa;outline-offset:-2px}.mv-half[aria-disabled=true]{cursor:default;background:none}' +
      '.mv-label{font-size:.78rem;color:var(--label,var(--fg2,#94a3b8));font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.mv-coin{display:flex;align-items:center;gap:10px;min-width:0}.mv-coin .mv-sym{font-size:1.25rem;font-weight:800;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.mv-val{display:block;font-weight:700;font-size:1rem;line-height:1.35;font-variant-numeric:tabular-nums;min-width:0;overflow-wrap:anywhere}.mv-val svg{display:inline-block;vertical-align:1px;margin-right:6px}.mv-val .mv-t1,.mv-val .mv-t2{white-space:nowrap}.mv-val .mv-t2{opacity:.92}.mv-val.up{color:#34d399}.mv-val.down{color:#f87171}.mv-val.flat{color:var(--fg2,#94a3b8)}' +
      '.mv-sub{font-size:.76rem;color:var(--fg2,#94a3b8);line-height:1.35;font-variant-numeric:tabular-nums}' +
      '.mv-empty{grid-column:1/-1;padding:6px 16px;color:var(--fg2,#94a3b8);font-size:.85rem}' +
      '.mv-head{grid-column:1/-1;display:flex;align-items:center;gap:8px;padding:0 16px 10px;font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--label,var(--fg2,#94a3b8))}' +
      '.mv-logo{width:18px;height:18px;border-radius:5px;flex-shrink:0}' +
      '.mv-badge{font-size:.66rem;font-weight:700;letter-spacing:.02em;text-transform:none;padding:2px 8px;border-radius:999px;background:rgba(148,163,184,.14);color:#cbd5e1}' +
      '[data-theme=light] .mv-badge{color:#475569;background:#f1f5f9}' +
      '.btc-compare-subtext{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;font-size:.75rem;color:#94a3b8;margin-top:4px;border-top:1px solid rgba(148,163,184,.14);padding-top:6px;font-variant-numeric:tabular-nums}' +
      '@container (max-width: 190px){.btc-compare-subtext .bcs-sep{display:none}.btc-compare-subtext{flex-direction:column;align-items:flex-start;gap:2px}}' +
      '.mv-half{container-type:inline-size}' +
      '.btc-compare-subtext b{font-weight:600;color:#cbd5e1}[data-theme=light] .btc-compare-subtext{color:#64748b}[data-theme=light] .btc-compare-subtext b{color:#334155}' +
      '@media (max-width:420px){.mv-half{padding:4px 10px}.mv-coin{gap:8px}.mv-coin .mv-sym{font-size:1.08rem}.mv-val{font-size:.92rem}}';
    document.head.appendChild(st);
  }
  function arrow(dir) {
    if (dir === 'flat') return '';
    return '<svg width="11" height="9" viewBox="0 0 11 9" aria-hidden="true"><path d="' + (dir === 'up' ? 'M5.5 0L11 9H0z' : 'M5.5 9L0 0h11z') + '" fill="currentColor"/></svg>';
  }
  // half: { label, row: {sym, logoUrl, cgId}, pct (number, signed), text (main value), sub (optional), onClickJs (string) }
  function moverHalf(h) {
    if (!h.row) return '<div class="mv-half" aria-disabled="true"><div class="mv-label">' + esc(h.label) + '</div><div class="mv-sub">—</div></div>';
    var dir = h.pct > 0.005 ? 'up' : h.pct < -0.005 ? 'down' : 'flat';
    var name = h.label + ': ' + h.row.sym + ' ' + h.text + (h.text2 ? ' ' + h.text2 : '') + (h.sub ? ', ' + h.sub : '') + (h.split ? ', ' + h.split.map(function (x) { return x[0] + ' ' + x[1]; }).join(', ') : '');
    return '<button type="button" class="mv-half" onclick="' + esc(h.onClickJs || '') + '" title="' + esc(name) + '" aria-label="' + esc(name) + '">' +
      '<span class="mv-label">' + esc(h.label) + '</span>' +
      '<span class="mv-coin">' + icon(h.row.sym, 30, { logoUrl: h.row.logoUrl }) + '<span class="mv-sym">' + esc(h.row.sym) + '</span></span>' +
      '<span class="mv-val ' + dir + '">' + arrow(dir) + '<span class="mv-t1">' + esc(h.text) + '</span>' + (h.text2 ? ' <span class="mv-t2">' + esc(h.text2) + '</span>' : '') + '</span>' + (h.sub ? '<span class="mv-sub">' + esc(h.sub) + '</span>' : '') +
      (h.split ? '<span class="btc-compare-subtext">' + h.split.map(function (x) { return '<span class="bcs-i">' + esc(x[0]) + ': <b>' + esc(x[1]) + '</b></span>'; }).join('<span class="bcs-sep" aria-hidden="true">|</span>') + '</span>' : '') + '</button>';
  }
  // pair: { best: half, worst: half, empty: 'message' }
  function moversCard(pair) {
    moversCss();
    var head = pair.head ? '<div class="mv-head">' + (pair.head.logo ? '<img class="mv-logo" src="' + esc(pair.head.logo) + '" alt="" width="18" height="18">' : '') + '<span>' + esc(pair.head.title) + '</span>' + (pair.head.badge ? '<span class="mv-badge">' + esc(pair.head.badge) + '</span>' : '') + '</div>' : '';
    if (pair.empty) return '<div class="mv-card">' + head + '<div class="mv-empty">' + esc(pair.empty) + '</div></div>';
    return '<div class="mv-card">' + head + moverHalf(pair.best) + '<div class="mv-sep" aria-hidden="true"></div>' + moverHalf(pair.worst) + '</div>';
  }
  function signedPct(p, d) { d = d == null ? 2 : d; return (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p).toFixed(d) + '%'; }
  window.SamsamCoins = { esc: esc, pickMovers: pickMovers, moversCard: moversCard, signedPct: signedPct, cmcUrl: cmcUrl, cmcSlug: cmcSlug, cmcGuess: cmcGuess, registerCoin: registerCoin, CMC_SLUGS: CMC_SLUGS, coingeckoUrl: coingeckoUrl, liqMapUrl: liqMapUrl, predictionUrl: predictionUrl, ccSlug: ccSlug, findCcSlug: findCcSlug, CC_SLUGS: CC_SLUGS, COLORS: COLORS, ICONS: ICONS, NAMES: NAMES, CG_IDS: CG_IDS, cgUrl: cgUrl, icon: icon, iconLinked: iconLinked, nameLinked: nameLinked, fallback: fallback, imgErr: imgErr };
})();
