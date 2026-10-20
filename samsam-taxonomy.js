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

  // A category you chose yourself for a coin (locked) always wins over the default list above.
  function categoryOf(sym, savedCat, locked) {
    var s = String(sym || '').toUpperCase();
    if (locked && savedCat && LABELS[savedCat]) return savedCat;
    if (BY_SYM[s]) return BY_SYM[s];
    if (savedCat && LABELS[savedCat]) return savedCat;
    return LEGACY[savedCat] || 'other';
  }
  // ── Your own categories (made by choosing "Other" and typing a name) ──
  // Saved on each coin as cat = 'x-…' + catLabel; every page registers them from the cloud data.
  var ORDER = ['layer1', 'layer2', 'ai', 'layer0', 'oracle', 'defi', 'meme', 'launchpad', 'web3'];
  var PALETTE = ['#14b8a6', '#e879f9', '#facc15', '#60a5fa', '#fb7185', '#a3e635', '#c084fc', '#38bdf8', '#fdba74', '#4ade80'];
  var CUSTOM = {};
  function isCustom(key) { return /^x-[a-z0-9-]{1,27}$/.test(String(key || '')); }
  function cleanLabel(l) { return String(l == null ? '' : l).replace(/[<>"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40); }
  function hash(str) { var h = 5381; for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h; }
  function register(key, label) {
    label = cleanLabel(label);
    if (!isCustom(key) || !label) return false;
    if (CUSTOM[key] === label) return false;
    CUSTOM[key] = label; LABELS[key] = label; COLORS[key] = PALETTE[hash(key) % PALETTE.length];
    return true;
  }
  // Same name → same category (case-insensitive), so a name typed twice never makes two filters.
  function customKey(label) {
    label = cleanLabel(label); if (!label) return null;
    var want = label.toLowerCase();
    for (var k in CUSTOM) if (CUSTOM[k].toLowerCase() === want) return k;
    var slug = want.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 18);
    return 'x-' + (slug ? slug + '-' : '') + hash(want).toString(36).slice(0, 6);
  }
  function customs() { return Object.keys(CUSTOM).sort(function (a, b) { return CUSTOM[a].localeCompare(CUSTOM[b]); }).map(function (k) { return { key: k, label: CUSTOM[k], color: COLORS[k] }; }); }
  // Filter lists: the built-in order, then your own categories that have coins, then Other.
  function pickerKeys(totals) {
    totals = totals || {};
    return ORDER.concat(customs().map(function (c) { return c.key; }).filter(function (k) { return totals[k] != null; }), totals.other ? ['other'] : []);
  }
  window.SamsamTaxonomy = Object.freeze({
    list: CATS.concat([OTHER]).map(function (c) { return { key: c.key, label: c.label, color: c.color, coins: c.coins.slice() }; }),
    labels: LABELS, colors: COLORS,   // live maps: your own categories are added to them
    ORDER: ORDER.slice(), isCustom: isCustom, register: register, customKey: customKey, customs: customs, pickerKeys: pickerKeys,
    defaultOf: function (sym) { return BY_SYM[String(sym || '').toUpperCase()] || null; },
    categoryOf: categoryOf,
    label: function (key) { return LABELS[key] || LABELS.other; },
    color: function (key) { return COLORS[key] || COLORS.other; },
    // Same shape as the snippet in the request: ASSET_TAXONOMY + getCoinCategory(symbol) → label
    ASSET_TAXONOMY: Object.freeze(CATS.reduce(function (o, c) { o[c.label] = c.coins.slice(); return o; }, {})),
    getCoinCategory: function (sym) { return LABELS[categoryOf(sym)]; },
  });
})();
