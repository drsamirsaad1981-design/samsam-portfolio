// Samsam Portfolio — the one asset taxonomy (9 categories + Other) used by every page:
// allocation donut, category filter cards, P&L breakdowns, table/card tags, Add coin form.
// To move a coin, change its line here — the cloud copy of each coin's category follows automatically.
(function () {
  var CATS = [
    { key: 'ai',        label: 'AI & DePIN',                 color: '#a855f7', coins: ['TAO', 'NEAR', 'ICP', 'RENDER', 'WLD'] },
    { key: 'layer1',    label: 'Layer 1 Blockchains',        color: '#3b82f6', coins: ['BTC', 'ETH', 'SOL', 'SUI', 'APT', 'SEI', 'AVAX', 'KAS', 'HBAR', 'VET', 'XDC', 'FLR', 'NIGHT', 'KAVA', 'CRO', 'XPL', 'MON', 'MOVR', 'GLMR', 'GRAM'] },
    { key: 'layer2',    label: 'Layer 2 Blockchains',        color: '#06b6d4', coins: ['ARB', 'OP', 'STRK', 'POL', 'MNT'] },
    { key: 'layer0',    label: 'Layer 0 & Interoperability', color: '#f59e0b', coins: ['DOT', 'ATOM', 'KSM', 'QNT'] },
    { key: 'oracle',    label: 'Oracles & Middleware',       color: '#ec4899', coins: ['LINK', 'PYTH', 'AVAIL'] },
    { key: 'defi',      label: 'DeFi & RWA',                 color: '#10b981', coins: ['ONDO', 'JUP'] },
    { key: 'launchpad', label: 'Launchpad',                  color: '#f97316', coins: ['PONS'] },
    { key: 'web3',      label: 'Web3 & Gaming',              color: '#84cc16', coins: ['ENS'] },
    { key: 'meme',      label: 'Meme & Utility Tokens',      color: '#ef4444', coins: ['DOGE', 'VTHO'] },
  ];
  var OTHER = { key: 'other', label: 'Other', color: '#6b7280', coins: [] };
  var BY_SYM = {}, LABELS = {}, COLORS = {};
  CATS.concat([OTHER]).forEach(function (c) {
    LABELS[c.key] = c.label; COLORS[c.key] = c.color;
    c.coins.forEach(function (s) { BY_SYM[s] = c.key; });
  });
  // Categories saved by older versions of the app → nearest new category (only for coins not listed above)
  var LEGACY = { btc: 'layer1', infra: 'other', layer1: 'layer1', layer2: 'layer2', defi: 'defi', ai: 'ai', meme: 'meme' };

  function categoryOf(sym, savedCat) {
    var s = String(sym || '').toUpperCase();
    if (BY_SYM[s]) return BY_SYM[s];
    if (savedCat && LABELS[savedCat]) return savedCat;
    return LEGACY[savedCat] || 'other';
  }
  window.SamsamTaxonomy = Object.freeze({
    list: CATS.concat([OTHER]).map(function (c) { return { key: c.key, label: c.label, color: c.color, coins: c.coins.slice() }; }),
    labels: Object.freeze(LABELS), colors: Object.freeze(COLORS),
    categoryOf: categoryOf,
    label: function (key) { return LABELS[key] || LABELS.other; },
    color: function (key) { return COLORS[key] || COLORS.other; },
    // Same shape as the snippet in the request: ASSET_TAXONOMY + getCoinCategory(symbol) → label
    ASSET_TAXONOMY: Object.freeze(CATS.reduce(function (o, c) { o[c.label] = c.coins.slice(); return o; }, {})),
    getCoinCategory: function (sym) { return LABELS[categoryOf(sym)]; },
  });
})();
