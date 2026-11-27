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
    XAU: 'Gold (24k)', XAG: 'Silver (999)', XPT: 'Platinum', XCU: 'Copper',
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
    "XAU": "pax-gold",          // 🥇 physical gold (24k), priced as PAX Gold (1 token = 1 troy ounce); held in grams
    "XAG": "kinesis-silver",    // 🥈 physical silver (999), priced as Kinesis Silver (1 token = 1 troy ounce); held in grams
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
    "PONS": "pons",   // (CoinGecko's id today — its markets list and our price files use it; "pons-2" was its first id and no longer answers)
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
    XAU: 'pax-gold', XAG: 'kinesis-silver',
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
  // ── Page names checked every half hour by GitHub (tools/update-market.mjs → prices/m/links.json):
  //    CoinMarketCap's own page names (top ~1500), CoinCodex pages, and which coins have futures (Liq.Map).
  //    Kept in this browser; until it arrives the links use the names below / a guess, as before.
  var LINKS = null;
  (function loadLinks() {
    // the copy kept here is used at once; a fresh one is fetched when it is over 30 minutes old (GitHub refreshes the
    // list every half hour) or from before the futures came from every exchange (no futBy) — then every page redraws
    try { var c = JSON.parse(localStorage.getItem('samsam_links') || 'null'); if (c && c.data && c.data.cmc) { LINKS = c.data; if (Date.now() - c.t < 30 * 60e3 && c.data.futBy) return; } } catch (_) {}
    if (typeof fetch !== 'function' || typeof location === 'undefined') return;
    var m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname || ''), repo = (location.pathname || '/').split('/')[1];
    var url = window.__linksUrl || 'https://raw.githubusercontent.com/' + (m ? m[1] : 'drsamirsaad1981-design') + '/' + (m && repo ? repo : 'samsam-portfolio') + '/prices/m/links.json';
    fetch(url, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.cmc) return;
      LINKS = j; try { localStorage.setItem('samsam_links', JSON.stringify({ t: Date.now(), data: j })); } catch (_) {}
      try { window.dispatchEvent(new Event('samsam-links')); } catch (_) {}
    }).catch(function () {});
  })();
  // CoinMarketCap page from the checked list: same ticker, then the same name, else the closest market cap, else the biggest
  function cmcFromList(S, name, mcap) {
    var list = LINKS && LINKS.cmc && LINKS.cmc[S]; if (!list || !list.length) return null;
    if (list.length === 1) return list[0][0];
    var n = String(name || '').toLowerCase().trim();
    var byName = n && list.filter(function (x) { return String(x[1]).toLowerCase() === n; })[0]; if (byName) return byName[0];
    if (mcap > 0) return list.slice().sort(function (a, b) { return Math.abs(Math.log((a[2] || 1) / mcap)) - Math.abs(Math.log((b[2] || 1) / mcap)); })[0][0];
    return list[0][0];
  }
  function cmcSlug(sym, opts) {
    opts = opts || {}; var S = String(sym || '').toUpperCase(), m = META[S] || {};
    var ok = function (x) { return x && /^[a-z0-9][a-z0-9-]{0,99}$/.test(x) ? x : null; };
    if (ok(opts.cmcSlug) && !S) return opts.cmcSlug;
    var name = opts.name || m.name || NAMES[S];
    var list = S && LINKS && LINKS.cmc && LINKS.cmc[S];
    // a page name saved with the coin (often a guess typed when it was added) is kept only if CoinMarketCap has it
    var saved = ok(opts.cmcSlug) || ok(m.cmcSlug);
    if (saved && (!list || list.some(function (x) { return x[0] === saved; }))) return saved;
    if (CMC_SLUGS[S]) return CMC_SLUGS[S];   // checked by hand
    return (S && cmcFromList(S, name, +opts.mcap || 0)) || CMC_SLUGS[S] || saved || ok(cmcGuess(name));
  }
  // null = not known yet (list not loaded), true / false = has / has no perpetual futures (CoinGlass maps only those)
  function hasFutures(sym) {
    if (!LINKS || !LINKS.fut || !LINKS.fut.length) return null;
    var raw = String(sym || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), s = LIQ_SYMS[raw] || raw;
    return LINKS.fut.indexOf(s) >= 0 || LINKS.fut.indexOf(raw) >= 0;   // exchanges list TON as GRAM now, CoinGlass still as TON
  }
  function ccFromList(cgId) { return cgId && LINKS && LINKS.cc && LINKS.cc[cgId] || null; }
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
  // ↗ next to a coin's symbol = opens CoinMarketCap in a new tab (outside the app). Same mark on every page.
  var EXT = '<span class="ext-go" aria-hidden="true">' + (window.SamsamUI && SamsamUI.ic ? SamsamUI.ic('ext', { solo: true, sw: 2.4 }) : '↗') + '</span>';
  (function extCss() {
    if (document.getElementById('extGoCss')) return;
    var st = document.createElement('style'); st.id = 'extGoCss';
    st.textContent = '.ext-go{display:inline-block;margin-inline-start:5px;font-size:.72em;font-weight:700;color:var(--fg2,#94a3b8);opacity:.75;vertical-align:1px;transition:color .15s,opacity .15s,transform .15s;text-decoration:none}' +
      '@media (hover:hover){.ext-link:hover .ext-go,a:hover>.ext-go,a:hover .coin-sym .ext-go{color:#a78bfa;opacity:1;transform:translate(1px,-1px)}}@media print{.ext-go{display:none!important}}';
    (document.head || document.documentElement).appendChild(st);
  })();
  var LINK = 'target="_blank" rel="noopener" style="text-decoration:none;color:inherit;transition:opacity .15s" onmouseover="this.style.opacity=\'0.7\'" onmouseout="this.style.opacity=\'1\'"';
  function iconLinked(sym, size, opts) {
    var u = cgUrl(sym, opts && opts.cgId), i = icon(sym, size, opts);
    return u ? '<a href="' + u + '" ' + LINK.replace('text-decoration:none', 'display:inline-flex;flex-shrink:0;border-radius:50%;text-decoration:none') + ' title="Open ' + esc(sym) + ' on CoinMarketCap">' + i + '</a>' : i;
  }
  // Symbol (bold) + name, linked to CoinGecko — same look as the main page
  function nameLinked(sym, opts) {
    opts = opts || {};
    var name = opts.name || NAMES[sym] || '';
    var inner = '<div class="coin-sym" style="font-weight:700;font-size:' + (opts.symSize || '0.85rem') + ';line-height:1.2">' + esc(sym) + (cgUrl(sym, opts.cgId) ? EXT : '') + (opts.badge || '') + '</div><div style="font-size:0.72rem;color:var(--fg2);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(name) + '</div>';
    var u = cgUrl(sym, opts.cgId);
    return u ? '<a class="ext-link" href="' + u + '" ' + LINK.replace('text-decoration:none', 'display:block;min-width:0;text-decoration:none') + ' title="Open ' + esc(sym) + ' on CoinMarketCap">' + inner + '</a>' : '<div style="min-width:0">' + inner + '</div>';
  }
  // ── One Asset column for every page (same as Performance) ──
  //   logo · SYMBOL ↗            (logo + symbol open CoinMarketCap unless link:false; full name on hover)
  //          $price • ±24h%       (o.after = extra HTML after it, e.g. a ✏️; o.below = a line under it, e.g. a category tag)
  // assetText = the text part alone (for layouts that keep the logo in its own column); assetCell = logo + text.
  var astCss = false;
  function assetCss() {
    if (astCss || document.getElementById('astCss')) return; astCss = true;
    var st = document.createElement('style'); st.id = 'astCss';
    st.textContent = '.ast{display:flex;align-items:center;gap:10px;min-width:0}.ast-ic{display:inline-flex;flex-shrink:0;border-radius:50%}' +
      '.ast-t{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0;max-width:100%}.ast-top{display:flex;align-items:center;flex-wrap:wrap;gap:4px 6px;max-width:100%}' +
      '.ast-sym{display:inline-block;font-size:.92rem;font-weight:800;line-height:1.2;color:var(--fg,inherit);text-decoration:none;white-space:nowrap;max-width:100%}' +
      'a.ast-sym{text-decoration:underline transparent;text-underline-offset:3px;transition:color .15s,text-decoration-color .15s}a.ast-sym:active{color:#60a5fa}@media (hover:hover){a.ast-sym:hover{color:#60a5fa;text-decoration-color:currentColor}}[data-theme=light] a.ast-sym:hover,[data-theme=light] a.ast-sym:active{color:#2563eb}' +
      '.ast-line{display:flex;flex-wrap:wrap;align-items:center;column-gap:4px;row-gap:1px;font-size:.72rem;font-weight:600;color:var(--fg2,#94a3b8);font-variant-numeric:tabular-nums;line-height:1.3;text-align:start}' +
      '.ast-chg{display:inline-flex;align-items:center;white-space:nowrap}.ast-dot{opacity:.6;margin-inline-end:3px}.ast-chg .up{color:var(--green,#22c55e);font-weight:700}.ast-chg .down{color:var(--red,#ef4444);font-weight:700}' +
      '.ast-line .val-cell{display:inline-flex;align-items:center}' +
      '.hold{display:flex;flex-direction:column;align-items:flex-end;gap:2px;min-width:0;text-align:end;font-variant-numeric:tabular-nums}.hold-center{align-items:center;text-align:center}.hold-left{align-items:flex-start;text-align:start}' +
      '.hold-val{font-size:.92rem;font-weight:700;color:var(--fg,inherit);white-space:nowrap;line-height:1.2}.hold-qty{font-size:.72rem;font-weight:600;color:var(--fg2,#94a3b8);white-space:nowrap;line-height:1.3}';
    document.head.appendChild(st);
  }
  function assetText(sym, o) {
    o = o || {}; assetCss();
    // ↗ on every page; o.link:false only unlinks the logo
    var u = o.symLink === false ? null : cgUrl(sym, o.cgId), name = o.name || NAMES[sym] || '';
    var title = esc(name ? name + ' (' + sym + ')' : sym) + (u ? ' — open on CoinMarketCap' : '');
    var symHtml = u ? '<a class="ast-sym ext-link" href="' + u + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="' + title + '">' + esc(sym) + EXT + '</a>'
                    : '<span class="ast-sym" title="' + title + '">' + esc(sym) + '</span>';
    var p = +o.price || 0, ch = typeof o.change24h === 'number' && isFinite(o.change24h) ? o.change24h : null;
    var metal = !!METALS[String(sym || '').toUpperCase()]; if (metal) p = p / GPO;   // 🥇 metals: per gram, like the amount and the average beside it
    var priceHtml = p > 0 ? '<span class="ast-price">' + (window.SamsamFmt ? SamsamFmt.price(p) : '$' + p) + (metal ? '/g' : '') + '</span>' : '<span class="ast-price">—</span>';
    var chg = ch === null ? '' : '<span class="ast-dot">•</span><span class="' + (ch >= 0 ? 'up' : 'down') + '">' + signedPct(ch, 2) + '</span>';
    // the % (and a ✏️) stay together: on a narrow row they drop under the price as one piece
    var tail = chg ? '<span class="ast-chg">' + chg + (o.after || '') + '</span>' : (o.after || '');
    return '<div class="ast-t"><div class="ast-top">' + symHtml + (o.badge || '') + '</div><div class="ast-line">' + priceHtml + tail + '</div>' + (o.below || '') + '</div>';
  }
  function assetIcon(sym, o) {
    o = o || {}; assetCss();
    var size = o.size || 36;   // one logo size on every page
    return o.link === false ? '<span class="ast-ic">' + icon(sym, size, o) + '</span>' : '<span class="ast-ic">' + iconLinked(sym, size, o) + '</span>';
  }
  // ── One Holdings column for every page: value (bold) over the full amount + symbol ──
  function fmtAmount(q) {
    q = +q || 0; var a = Math.abs(q);
    if (a >= 1000) return q.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (a >= 1) return q.toLocaleString('en-US', { maximumFractionDigits: 4 });
    if (a === 0) return '0';
    return q.toLocaleString('en-US', { maximumFractionDigits: Math.min(10, 4 - Math.floor(Math.log10(a))) });   // 4 significant digits: 0.01204, 0.0006003
  }
  // 🥇 gold / 🥈 silver are held in troy ounces inside the app (their price is per ounce) and shown in grams
  var GPO = 31.1034768, METALS = { XAU: 'Gold (24k)', XAG: 'Silver (999)', XPT: 'Platinum', XCU: 'Copper' };
  // 🪙 platinum and copper have no coin to price them on CoinGecko: their price is the world price (Yahoo Finance futures PL=F per
  // troy ounce, HG=F per pound — copper turned into $ per troy ounce here) from the market snapshot, every 10 minutes while
  // you hold or plan them. Zakat: not counted (only gold and silver have a nisab here).
  var SNAP_METAL = { XPT: { k: 'platinum', per: 1 }, XCU: { k: 'copper', per: GPO / 453.59237 } }, metalT = 0;
  function feedSnapMetals(now) {
    var S = window.Samsam, M = window.SamsamMarket; if (!S || !S.isReady || !S.isReady() || !M || !M.metals || !S.updatePrices) return;
    var st = S.getState(), want = Object.keys(SNAP_METAL).filter(function (m) { return (st.coins || []).some(function (c) { return c.sym === m; }) || (st.accum || st.accumPlan || []).some(function (e) { return e && e.sym === m; }); });
    if (!want.length || (!now && Date.now() - metalT < 10 * 60e3)) return;
    metalT = Date.now();
    M.metals().then(function (r) {
      var rows = (r && r.data) || [], map = {};
      want.forEach(function (m) { var x = rows.filter(function (y) { return y && y.k === SNAP_METAL[m].k; })[0]; if (x && x.price > 0) map[m] = { usd: x.price * SNAP_METAL[m].per, ch24: x.ch24 == null ? null : +x.ch24 }; });
      if (Object.keys(map).length) S.updatePrices(map);
    }, function () { metalT = 0; });
  }
  setTimeout(feedSnapMetals, 2500); setInterval(feedSnapMetals, 60e3);
  function isMetal(sym) { return !!METALS[String(sym || '').toUpperCase()]; }
  function grams(qty) { return parseFloat(((+qty || 0) * GPO).toFixed(3)).toLocaleString('en-US', { maximumFractionDigits: 3 }) + ' g'; }
  // Where your gold / silver is kept (coin.vault, coin.vaultLabel for "Other") — instead of a network
  var VAULTS = [
    { k: 'home', e: '🏠', en: 'Home safe', ar: 'خزنة المنزل' },
    { k: 'bank', e: '🏦', en: 'Bank safe box', ar: 'خزنة البنك' },
    { k: 'dealer', e: '🏪', en: 'With the dealer', ar: 'عند التاجر' },
    { k: 'digital', e: '📱', en: 'Digital (app / token)', ar: 'رقمي (تطبيق / توكن)' },
    { k: 'carry', e: '👜', en: 'With me', ar: 'معي' },
    { k: 'other', e: '📍', en: 'Other', ar: 'مكان آخر' }];
  function vaultOf(doc, ar) {
    var v = doc && VAULTS.filter(function (x) { return x.k === doc.vault; })[0]; if (!v) return null;
    return { k: v.k, e: v.e, label: v.k === 'other' && doc.vaultLabel ? doc.vaultLabel : (ar ? v.ar : v.en) };
  }
  // 🕌 Zakat — ONE date a year and ONE pool: a hijri day you choose (1 Ramadan by default; Umm al-Qura, Riyadh's day). On that
  //   day, 2.5% of everything together — every coin (stablecoins too), every metal at market value, cash & certificates, and
  //   shares if you count them — when the pool is worth at least 85 g of gold (samsam-core.js → zakatPool / zakatYear).
  // It stays due until ✓ Paid; before the day: how many days are left, and an estimate at today's value.
  // An estimate, not a ruling — the app says so next to it.
  var NISAB = { XAU: 85 };   // grams of gold: the one nisab
  // the day is yours to choose (Samsam.getZakatDay — a hijri day and month; 1 Ramadan when not set): samsam-core.js → zakatWhen
  function zakatWhen(now) { var S = window.Samsam; return S && S.core && S.core.zakatWhen ? S.core.zakatWhen(now || Date.now(), S.getZakatDay ? S.getZakatDay() : null) : null; }
  function zakatDayLabel(ar, day) { var S = window.Samsam, z = day || (S && S.getZakatDay ? S.getZakatDay() : { m: 9, d: 1 }), M = S && S.core && S.core.HIJRI_MONTHS; return z.d + ' ' + (M ? M[ar ? 'ar' : 'en'][z.m - 1] : 'Ramadan'); }
  // all the crypto together: goldOz = the price of an ounce of gold now; snap = the value kept on 1 Ramadan ({ hy, value, nisabUsd, date })
  // — while due, that kept value is the one that counts (not today's price)
  // o: { cashUsd: cash & certificates in dollars, stocks: count the shares (Samsam.getZakatStocks) } — samsam-core.js → zakatPool
  function zakatCrypto(st, goldOz, now, snap, o) {
    now = now || Date.now(); var w = zakatWhen(now); if (!w || !st) return null; o = o || {};
    var C = st.core || (window.Samsam && Samsam.core);
    // 🕌 ONE pool: every coin, every metal (gold, silver, platinum, copper — at market value), cash & certificates, shares if counted
    var rows = (st.portfolio || []).map(function (c) { return { sym: c.sym, cgId: c.cgId, cls: c.cls, value: (+c.qty || 0) * (+c.currentPrice || 0) }; });
    var pool = C && C.zakatPool ? C.zakatPool(rows, { cashUsd: o.cashUsd || 0, stocks: o.stocks !== false }) : { value: rows.reduce(function (a, r) { return a + r.value; }, 0), crypto: 0, stock: 0, metal: 0, cash: 0 };
    var nisabUsd = goldOz > 0 ? NISAB.XAU / GPO * goldOz : null;
    if (!(nisabUsd > 0) || !C || !C.zakatYear) return null;
    var paid = o.paid || (window.Samsam && Samsam.getZakatPaid ? Samsam.getZakatPaid() : []);
    var since = o.since != null ? o.since : (C.firstSeen ? C.firstSeen((st.coins || []).concat(st.archivedCoins || [])) : 0);   // a zakat day before the account began is not owed
    var y = C.zakatYear(w, { value: pool.value, nisabUsd: nisabUsd }, snap, paid, { since: since }); if (!y) return null;
    var open = y.state === 'due' || y.state === 'paid' || y.state === 'below';   // about the year that ended on the last zakat day
    return Object.assign({}, y, { pool: pool, today: pool.value, todayNisab: nisabUsd, inWindow: w.due, yearHy: w.hy, due: y.state === 'due', meets: y.value >= y.nisabUsd,
      daysLeft: w.daysLeft, date: open ? w.lastDate : w.nextDate, hy: open ? w.hy : w.nextHy });
  }
  // ✨ Gold / Silver Trend: the metal's price over time, per troy ounce — from the shared hourly files on GitHub (PAX Gold,
  // Kinesis Silver); if those don't cover it: gold from Binance PAXGUSDT, then CoinGecko; each kept 1 hour on this device
  var MH = { XAU: { key: 'samsam_gold_hist', bn: 'PAXGUSDT', cg: 'pax-gold' }, XAG: { key: 'samsam_silver_hist', bn: null, cg: 'kinesis-silver' } };
  // one CoinGecko price-history request per coin and period, shared by everything on this page that asks within a minute
  // (the charts' history and the Gold / Silver Trend — also in the Performance / Plan frames — can want the same one) → Promise of CoinGecko's JSON; an error has .status
  var cgAsked = {};
  function cgChart(id, days) {
    // a page inside the app (Performance, Plan… in their frames): the main page keeps the one list for all of them
    try { if (window.top !== window && window.top.SamsamCoins && window.top.SamsamCoins.cgChart) return window.top.SamsamCoins.cgChart(id, days); } catch (_) {}
    var k = id + '|' + days, c = cgAsked[k];
    if (c && Date.now() - c.t < 60e3) return c.p;
    var p = fetch('https://api.coingecko.com/api/v3/coins/' + encodeURIComponent(id) + '/market_chart?vs_currency=usd&days=' + days)
      .then(function (r) { if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; } return r.json(); });
    cgAsked[k] = { t: Date.now(), p: p };
    p.catch(function () { if (cgAsked[k] && cgAsked[k].p === p) delete cgAsked[k]; });   // a failure is not kept: the next ask tries again
    return p;
  }
  var mhMem = {}, mhWait = {}, mhAsked = {};
  var SHARED_P = window.__sharedPrices || (function () {
    var m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname), repo = location.pathname.split('/')[1];
    return 'https://raw.githubusercontent.com/' + (m ? m[1] : 'drsamirsaad1981-design') + '/' + (m && repo ? repo : 'samsam-portfolio') + '/prices/p/';
  })();
  function ghLookup(list) {
    var w = (list || []).filter(function (x) { return x && x[1] > 0; });
    return function (t) {
      if (!w.length) return 0; var lo = 0, hi = w.length - 1;
      while (lo < hi) { var m = (lo + hi) >> 1; if (w[m][0] < t) lo = m + 1; else hi = m; }
      var a = w[Math.max(0, lo - 1)], b = w[lo]; return Math.abs(a[0] - t) <= Math.abs(b[0] - t) ? a[1] : b[1];
    };
  }
  function mem(sym) {
    if (!(sym in mhMem)) { try { mhMem[sym] = JSON.parse(localStorage.getItem(MH[sym].key) || 'null'); } catch (_) { mhMem[sym] = null; } }
    return mhMem[sym];
  }
  function metalCached(sym, from) {   // the lookup now (null if nothing saved that covers `from`)
    var m = MH[sym] && mem(sym);
    return m && m.list && m.list.length && m.list[0][0] <= from + 864e5 ? ghLookup(m.list) : null;
  }
  function metalHistory(sym, from) {   // → Promise of a lookup t → $ per ounce (or null)
    var M = MH[sym]; if (!M) return Promise.resolve(null);
    from = Math.max(0, +from || 0);
    var m = mem(sym), fresh = m && Date.now() - m.at < 3600e3 && metalCached(sym, from);
    if (fresh) return Promise.resolve(fresh);
    if (mhWait[sym] && mhWait[sym].from <= from) return mhWait[sym];   // a request already on its way covers this
    var span = Date.now() - from, iv = span <= 40 * 864e5 ? '1h' : span <= 160 * 864e5 ? '4h' : '1d';
    var save = function (list) { if (!list || !list.length) return null; mhMem[sym] = { at: Date.now(), list: list }; try { localStorage.setItem(M.key, JSON.stringify(mhMem[sym])); } catch (_) {} return ghLookup(list); };
    var cg = function () {
      var days = Math.min(365, Math.max(2, Math.ceil(span / 864e5) + 1));
      return cgChart(M.cg, days)
        .then(function (d) { return save((d.prices || []).map(function (x) { return [+x[0], +x[1]]; })); })
        .catch(function () { return metalCached(sym, from); });
    };
    var bn = function () {
      return M.bn ? fetch('https://data-api.binance.vision/api/v3/klines?symbol=' + M.bn + '&interval=' + iv + '&limit=1000&startTime=' + Math.floor(from - 864e5))
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (k) { return save(k.map(function (x) { return [+x[0], +x[4]]; })); })
        .catch(cg) : cg();
    };
    // 1st: the shared hourly file GitHub keeps for every coin (prices branch) — one small file, nothing asked of
    // CoinGecko or Binance; only when it doesn't reach back far enough (or isn't there) → Binance, then CoinGecko
    var p = fetch(SHARED_P + M.cg + '.json?h=' + Math.floor(Date.now() / 36e5), { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (f) {
        var t0 = +f.t0, step = +f.step || 36e5, list = [];
        (f.p || []).forEach(function (v, i) { if (+v > 0) list.push([t0 + i * step, +v]); });
        if (!list.length || list[0][0] > from + 864e5 || Date.now() - list[list.length - 1][0] > 6 * 36e5) throw new Error('short');
        return save(list);
      })
      .catch(bn);
    mhWait[sym] = p.then(function (f) { mhWait[sym] = null; return f; });
    mhWait[sym].from = from;
    return mhWait[sym];
  }
  // for the charts: the lookup to draw with now, and (once) a request for the history the chart still lacks → redraw
  function metalFor(sym, from, redraw) {
    if (!MH[sym]) return null;
    var f = metalCached(sym, from), m = mem(sym), asked = sym in mhAsked ? mhAsked[sym] : Infinity;
    if (!f && from >= asked && !mhWait[sym] && m && m.list && m.list.length) f = ghLookup(m.list);   // asked already: draw with what there is
    if (!f && from < asked) { mhAsked[sym] = from; metalHistory(sym, from).then(function (g) { if (g && redraw) try { redraw(); } catch (_) {} }); }
    return f;
  }
  function goldFor(from, redraw) { return metalFor('XAU', from, redraw); }
  function goldCached(from) { return metalCached('XAU', from); }
  function goldHistory(from) { return metalHistory('XAU', from); }
  // which comparison lines the Portfolio vs BTC charts show (tap a legend row) — remembered on this device
  var TL_KEY = 'samsam_trend_lines', TL_DEF = { btc: true, gold: true, silver: false };
  function trendLines() { var o = {}; try { o = JSON.parse(localStorage.getItem(TL_KEY) || '{}') || {}; } catch (_) {} return { btc: o.btc !== undefined ? !!o.btc : TL_DEF.btc, gold: o.gold !== undefined ? !!o.gold : TL_DEF.gold, silver: o.silver !== undefined ? !!o.silver : TL_DEF.silver }; }
  function toggleTrend(k) { var o = trendLines(); o[k] = !o[k]; try { localStorage.setItem(TL_KEY, JSON.stringify(o)); } catch (_) {} return o; }
  // Portfolio vs BTC: the whole portfolio, or the altcoins only (no BTC, gold or silver) — remembered on this device
  var SC_KEY = 'samsam_perf_scope';
  function perfScope() { try { return localStorage.getItem(SC_KEY) === 'alt' ? 'alt' : 'all'; } catch (_) { return 'all'; } }
  function setPerfScope(v) { try { localStorage.setItem(SC_KEY, v === 'alt' ? 'alt' : 'all'); } catch (_) {} }
  // "Altcoins only": the saved points with your BTC, gold and silver taken out, and the coins / transactions without them
  // (the Performance chart's blue line and the Holdings card's value both use it)
  function altSnaps(pts, st, redraw) {
    var mp = {}, now = { BTC: st.btcPrice };
    (st.portfolio || []).forEach(function (c) { now[c.sym] = c.currentPrice; });
    ['XAU', 'XAG'].forEach(function (m) { if ((st.transactions || []).some(function (t) { return t.sym === m; })) { var f = metalFor(m, pts[0].t, redraw); if (f) mp[m] = f; } });
    return Samsam.core.altOnly(pts, st.coins, st.transactions, { prices: mp, now: now });
  }
  // the chart's lines for both pages: pts = saved points ending on "now", st = Samsam.getState()
  function trendSeries(pts, st, o) {
    var C = window.Samsam && Samsam.core, TL = trendLines(), sc = perfScope(), redraw = o.redraw, P = pts, coins = st.coins, txs = st.transactions;
    if (sc === 'alt') { var a = altSnaps(pts, st, redraw); P = a.snaps; coins = a.coins; txs = a.txs; }
    var goldAt = TL.gold ? metalFor('XAU', pts[0].t, redraw) : null, silverAt = TL.silver ? metalFor('XAG', pts[0].t, redraw) : null;
    var full = C.perfChartSeries(P, coins, txs, { baselineBtc: o.baselineBtc, goldAt: goldAt, silverAt: silverAt });
    return { full: full, TL: TL, scope: sc };
  }
  function holdCell(sym, value, qty, o) {
    o = o || {}; assetCss();
    if (isMetal(sym)) { var vm = window.SamsamFmt ? SamsamFmt.usd(value) : '$' + (+value || 0).toFixed(2); return '<div class="hold' + (o.align ? ' hold-' + o.align : '') + '"><div class="hold-val">' + (o.noValue ? '—' : vm) + '</div><div class="hold-qty" title="' + esc(grams(qty) + ' · ' + fmtAmount(qty) + ' oz') + '">' + grams(qty) + '</div></div>'; }
    var v = window.SamsamFmt ? SamsamFmt.usd(value) : '$' + (+value || 0).toFixed(2);
    return '<div class="hold' + (o.align ? ' hold-' + o.align : '') + '"><div class="hold-val">' + (o.noValue ? '—' : v) + '</div><div class="hold-qty" title="' + esc(fmtAmount(qty) + ' ' + sym) + '">' + fmtAmount(qty) + ' ' + esc(sym) + '</div>' + (o.below || '') + '</div>';
  }
  function assetCell(sym, o) { return '<div class="ast">' + assetIcon(sym, o) + assetText(sym, o) + '</div>'; }
  // CoinGlass liquidation heatmap for a coin (opens in a new tab). Symbol differs on CoinGlass for a few coins.
  var LIQ_SYMS = { GRAM: 'TON', XAU: 'XAUT', XAG: 'XAG' };   // gold: CoinGlass's tokenized-gold futures map (XAUT), silver: XAG
  var LIQ_MAYBE = 'no futures found on the exchanges we check (OKX, Gate, Bitget, KuCoin, MEXC, BingX, Hyperliquid) — CoinGlass may have no map for it, open it to see';
  function liqMapUrl(sym) { var s = LIQ_SYMS[sym] || String(sym || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return 'https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=' + encodeURIComponent(s); }
  // CoinCodex price prediction. CoinCodex uses its own page names (checked against its API, Oct 2026);
  // a coin added later stores its CoinCodex name as coin.ccSlug (looked up when it is added).
  var CC_SLUGS = {
    XAU: 'pax-gold', XAG: 'kinesis-silver',
    BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binance-coin', TAO: 'bittensor', SUI: 'sui', NEAR: 'near-protocol',
    SEI: 'sei', ATOM: 'cosmos', APT: 'aptos', AVAX: 'avalanche', ICP: 'internet-computer', KSM: 'kusama', GRAM: 'toncoin',
    ARB: 'arbitrum', MOVR: 'moonriver', GLMR: 'moonbeam', OP: 'optimism', WLD: 'worldcoin-org', PYTH: 'pyth-network',
    JUP: 'jupiter-coin', RENDER: 'render-token', QNT: 'quant-network', HBAR: 'hedera-hashgraph', DOGE: 'dogecoin',
    MON: 'monad-xyz', CRO: 'cronos', XDC: 'xdc-network', DOT: 'polkadot', LINK: 'chainlink', ENS: 'ethereum-name-service',
    STRK: 'starknet', ONDO: 'ondo-finance', AVAIL: 'avail-network', KAVA: 'kava', PONS: 'pons', MNT: 'mantle',
    FLR: 'spark-token', KAS: 'kaspa', POL: 'polygon-ecosystem-token', VTHO: 'vethor-token', VET: 'vechain-token',
    NIGHT: 'midnight-network', XPL: 'xpl-token', XRP: 'ripple', USDT: 'tether', USDC: 'usd-coin',
    PI: 'pi-network',   // CoinCodex lists Pi Network under the ticker IOU
  };
  var SLUG_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;
  function ccSlug(sym, opts) {
    opts = opts || {}; var s = String(sym || '').toUpperCase();
    if (opts.ccSlug && SLUG_RE.test(opts.ccSlug)) return opts.ccSlug;
    return CC_SLUGS[s] || ccFromList(opts.cgId || CG_IDS[s]) || null;
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
  // Stablecoins (pegged to the dollar / euro / gold) never count as a "performer" — they don't move like crypto, so one would
  // only show up as the best coin in a falling market (or beat BTC whenever BTC drops). Same list as the Market page.
  var STABLE_RX = /^(USDT|USDC|DAI|FDUSD|USDE|TUSD|PYUSD|USDS|BUSD|USD1|RLUSD|FRAX|USDD|GUSD|EURC|EURS|USDX|USDF|USDG|USDTB|BFUSD|SUSDE|SUSDS|USD0|LUSD|CRVUSD|GHO|XAUT|PAXG|BSC-USD|USDP|USDB|USDA|DOLA|USDL|USDY|BUIDL|USTB|USYC|OUSG|FDIT|USX|AUSD|DEUSD|USR|RUSD|FIGR_HELOC)$/;
  function isStable(sym, name) {
    var s = String(sym || '').toUpperCase(), n = String(name || '').toLowerCase();
    if (STABLE_RX.test(s)) return true;
    return /stablecoin|\busd\b|dollar|tether gold|pax gold|\beuro\b/.test(n) && !/wrapped|staked/.test(n);
  }
  function pickMovers(rows, portfolioTotal) {
    var min = Math.max(1, (portfolioTotal || 0) * 0.001);
    var ok = (rows || []).filter(function (r) { return r && r.value >= min && typeof r.score === 'number' && isFinite(r.score) && !isStable(r.sym, r.name); });
    if (!ok.length) return null;
    ok.sort(function (a, b) { return b.score - a.score; });
    return { best: ok[0], worst: ok.length > 1 ? ok[ok.length - 1] : null, count: ok.length };
  }
  var mvCss = false;
  function moversCss() {
    if (mvCss) return; mvCss = true;
    var st = document.createElement('style');
    st.textContent = '.mv-card{display:grid;grid-template-columns:1fr 1px 1fr;align-items:stretch;background:var(--bg2,#111827);border:1px solid var(--border,#334155);border-radius:16px;padding:14px 4px;box-sizing:border-box}' +
      '.mv-sep{background:var(--border,#334155);margin:6px 0}' +
      '.mv-half{display:flex;flex-direction:column;gap:6px;min-width:0;padding:4px 16px;border:none;background:none;color:inherit;font:inherit;text-align:start;border-radius:12px;cursor:pointer;text-decoration:none;-webkit-tap-highlight-color:transparent}' +
      '@media (hover:hover){.mv-half:hover{background:rgba(148,163,184,.08)}}.mv-half:active{background:rgba(148,163,184,.1)}.mv-half:focus-visible{outline:2px solid #a78bfa;outline-offset:-2px}.mv-half[aria-disabled=true]{cursor:default;background:none}' +
      '.mv-label{font-size:.78rem;color:var(--label,var(--fg2,#94a3b8));font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.mv-coin{display:flex;align-items:center;gap:10px;min-width:0}.mv-coin .mv-sym{font-size:1.25rem;font-weight:800;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.mv-val{display:block;font-weight:700;font-size:1rem;line-height:1.35;font-variant-numeric:tabular-nums;min-width:0;overflow-wrap:anywhere}.mv-val svg{display:inline-block;vertical-align:1px;margin-inline-end:6px}.mv-val .mv-t1,.mv-val .mv-t2{white-space:nowrap}.mv-val .mv-t2{opacity:.92}.mv-val.up{color:var(--green,#22c55e)}.mv-val.down{color:var(--red,#f87171)}.mv-val.flat{color:var(--fg2,#94a3b8)}' +
      '.mv-sub{font-size:.76rem;color:var(--fg2,#94a3b8);line-height:1.35;font-variant-numeric:tabular-nums}' +
      '.mv-empty{grid-column:1/-1;padding:6px 16px;color:var(--fg2,#94a3b8);font-size:.85rem}' +
      '.mv-head{grid-column:1/-1;display:flex;align-items:center;gap:8px;padding:0 16px 10px;font-size:.78rem;font-weight:700;letter-spacing: .01em;text-transform: none;color:var(--label,var(--fg2,#94a3b8))}' +
      '.mv-logo{width:18px;height:18px;flex-shrink:0}' +
      '.mv-badge{font-size:.66rem;font-weight:700;letter-spacing:.02em;text-transform:none;padding:2px 8px;border-radius:999px;background:rgba(148,163,184,.14);color:#cbd5e1}' +
      '[data-theme=light] .mv-badge{color:#475569;background:#f1f5f9}' +
      '.btc-compare-subtext{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;font-size:.75rem;color:#94a3b8;margin-top:4px;border-top:1px solid rgba(148,163,184,.14);padding-top:6px;font-variant-numeric:tabular-nums}' +
      '@container (max-width: 190px){.btc-compare-subtext .bcs-sep{display:none}.btc-compare-subtext{flex-direction:column;align-items:flex-start;gap:2px}}' +
      '.mv-half{container-type:inline-size}' +
      // small › on each tappable row (opens the coin) — grey, purple on hover
      '.mv-go{margin-inline-start:auto;flex-shrink:0;display:flex;color:var(--fg2,#94a3b8);opacity:.7;transition:color .15s,opacity .15s,transform .15s}' +
      '@media (hover:hover){.mv-half:hover .mv-go{color:#a78bfa;opacity:1;transform:translateX(2px)}}.mv-half:active .mv-go,.mv-half:focus-visible .mv-go{color:#a78bfa;opacity:1}' +
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
      '<span class="mv-coin">' + icon(h.row.sym, 30, { logoUrl: h.row.logoUrl }) + '<span class="mv-sym">' + esc(h.row.sym) + '</span>' +
        (h.onClickJs ? '<span class="mv-go" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></span>' : '') + '</span>' +
      '<span class="mv-val ' + dir + '">' + arrow(dir) + '<span class="mv-t1">' + esc(h.text) + '</span>' + (h.text2 ? ' <span class="mv-t2">' + esc(h.text2) + '</span>' : '') + '</span>' + (h.sub ? '<span class="mv-sub">' + esc(h.sub) + '</span>' : '') +
      (h.split ? '<span class="btc-compare-subtext">' + h.split.map(function (x) { return '<span class="bcs-i">' + esc(x[0]) + ': <b>' + esc(x[1]) + '</b></span>'; }).join('<span class="bcs-sep" aria-hidden="true">|</span>') + '</span>' : '') + '</button>';
  }
  // pair: { best: half, worst: half, empty: 'message' }
  function moversCard(pair) {
    moversCss();
    var head = pair.head ? '<div class="mv-head">' + (pair.head.logo ? '<img class="mv-logo" src="' + esc(pair.head.logo) + '" alt="" width="18" height="18">' : '') + '<span>' + esc(pair.head.title) + '</span>' + (pair.head.badge ? '<span class="mv-badge">' + esc(pair.head.badge) + '</span>' : '') +
      (pair.head.hint ? '<button type="button" class="cp-hint" data-hint="' + esc(pair.head.hint) + '"></button>' : '') + (pair.head.extra || '') + '</div>' : '';
    if (pair.empty) return '<div class="mv-card">' + head + '<div class="mv-empty">' + esc(pair.empty) + '</div></div>';
    return '<div class="mv-card">' + head + moverHalf(pair.best) + '<div class="mv-sep" aria-hidden="true"></div>' + moverHalf(pair.worst) + '</div>';
  }
  function signedPct(p, d) { d = d == null ? 2 : d; return (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p).toFixed(d) + '%'; }
  // other CoinGecko ids a coin is also listed under (the first one may lack price history)
  var CG_ALT = { PONS: ['pons-2'] };
  // The three outside links of a coin (same as the coin page): Liq.Map (CoinGlass) · Prediction (CoinCodex) · CMC.
  // A coin without futures / without a CoinCodex page gets a plain note instead of a link to nowhere.
  var QL_CSS = '.ql-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:2px 0 4px}' +
    '.ql{display:flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 8px;border-radius:9px;border:1px solid var(--border,rgba(148,163,184,.3));font-size:.8rem;font-weight:700;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}' +
    '.ql .ss-ic{margin-inline-end:0}.ql .ql-x{opacity:.6;display:inline-flex}' +
    '.ql-liq{color:var(--c-orange,#fb923c);border-color:rgba(251,146,60,.45)}.ql-pred{color:var(--c-violet,#a78bfa);border-color:rgba(167,139,250,.45)}.ql-cmc{color:var(--c-link,#60a5fa);border-color:rgba(96,165,250,.45)}' +
    '[data-theme="light"] .ql-liq{color:#ea580c}[data-theme="light"] .ql-pred{color:#7c3aed}[data-theme="light"] .ql-cmc{color:#2563eb}' +
    '@media (hover:hover){.ql-liq:hover{background:#f97316;color:#fff}.ql-pred:hover{background:#8b5cf6;color:#fff}.ql-cmc:hover{background:#3b82f6;color:#fff}}' +
    '.ql-off{color:var(--fg2,#94a3b8);border-style:dashed;cursor:default;font-weight:600}.ql-liq.ql-maybe{border-style:dashed;opacity:.85}';
  function quickLinks(sym, o) {
    o = o || {}; sym = String(sym || '').toUpperCase();
    if (!document.getElementById('qlCss')) { var st = document.createElement('style'); st.id = 'qlCss'; st.textContent = QL_CSS; document.head.appendChild(st); }
    var I = function (n, z) { return window.SamsamUI ? SamsamUI.ic(n, { solo: true, size: z || 15 }) : ''; }, X = '<span class="ql-x">' + I('ext', 11) + '</span>';
    var a = function (cls, href, icon, label, title) { return '<a class="ql ' + cls + '" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" title="' + esc(title) + '">' + I(icon) + label + X + '</a>'; };
    var off = function (icon, label, title) { return '<span class="ql ql-off" title="' + esc(title) + '">' + I(icon) + label + '</span>'; };
    // no futures found → still a link (Binance / Bybit can't be asked from GitHub, so CoinGlass may still have it), marked "Try"
    var liq = sym !== 'XAU' && (sym === 'XAG' || hasFutures(sym) === false) ?   // gold: CoinGlass's XAUT map; silver: may have none
      a('ql-liq ql-maybe', liqMapUrl(sym), 'flame', 'Try Liq.Map', sym + ': ' + LIQ_MAYBE)
      : a('ql-liq', liqMapUrl(sym), 'flame', 'Liq.Map', 'Open the ' + sym + ' liquidation heatmap on CoinGlass (new tab)');
    var pred = ccSlug(sym, o) ? a('ql-pred', predictionUrl(sym, o), 'sparkles', 'Prediction', 'Open the ' + sym + ' price prediction on CoinCodex (new tab)')
      : off('sparkles', 'No prediction', 'CoinCodex has no price prediction page for ' + sym);
    var u = cgUrl(sym, o.cgId), cg = /coingecko\.com/.test(u || '');
    var cmc = u ? a('ql-cmc', u, 'bar', cg ? 'CoinGecko' : 'CMC', cg ? sym + ' isn\'t listed on CoinMarketCap — open it on CoinGecko (new tab)' : 'Open ' + sym + ' on CoinMarketCap (new tab)') : off('bar', 'No page', 'No market page for ' + sym);
    return '<div class="ql-row">' + liq + pred + cmc + '</div>';
  }
  window.SamsamCoins = { feedSnapMetals: feedSnapMetals, zakatWhen: zakatWhen, zakatCrypto: zakatCrypto, zakatDayLabel: zakatDayLabel, cgChart: cgChart, perfScope: perfScope, setPerfScope: setPerfScope, altSnaps: altSnaps, trendSeries: trendSeries, metalFor: metalFor, metalHistory: metalHistory, trendLines: trendLines, toggleTrend: toggleTrend, goldFor: goldFor, goldHistory: goldHistory, goldCached: goldCached, GPO: GPO, METALS: METALS, VAULTS: VAULTS, vaultOf: vaultOf, NISAB: NISAB, isMetal: isMetal, grams: grams, quickLinks: quickLinks, hasFutures: hasFutures, links: function () { return LINKS; }, holdCell: holdCell, fmtAmount: fmtAmount, assetCell: assetCell, assetText: assetText, assetIcon: assetIcon, CG_ALT: CG_ALT, EXT: EXT, esc: esc, pickMovers: pickMovers, isStable: isStable, moversCard: moversCard, signedPct: signedPct, cmcUrl: cmcUrl, cmcSlug: cmcSlug, cmcGuess: cmcGuess, registerCoin: registerCoin, CMC_SLUGS: CMC_SLUGS, coingeckoUrl: coingeckoUrl, liqMapUrl: liqMapUrl, LIQ_MAYBE: LIQ_MAYBE, predictionUrl: predictionUrl, ccSlug: ccSlug, findCcSlug: findCcSlug, CC_SLUGS: CC_SLUGS, COLORS: COLORS, ICONS: ICONS, NAMES: NAMES, CG_IDS: CG_IDS, cgUrl: cgUrl, icon: icon, iconLinked: iconLinked, nameLinked: nameLinked, fallback: fallback, imgErr: imgErr };
})();
