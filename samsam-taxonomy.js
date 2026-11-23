// Samsam Portfolio — the one asset taxonomy (10 categories + Other) used by every page:
// allocation donut, category filter cards, P&L breakdowns, table/card tags, Add coin form.
// To move a coin, change its line here — the cloud copy of each coin's category follows automatically.
(function () {
  var CATS = [
    { key: 'btc',       label: 'Bitcoin',                    color: '#f7931a', coins: ['BTC'] },   // its own category (the portfolio is built around it)
    { key: 'ai',        label: 'AI & DePIN',                 color: '#a855f7', coins: ['TAO', 'NEAR', 'ICP', 'RENDER', 'WLD'] },
    { key: 'layer1',    label: 'Layer 1 Blockchains',        color: '#3b82f6', coins: ['ETH', 'SOL', 'SUI', 'APT', 'SEI', 'AVAX', 'KAS', 'HBAR', 'VET', 'XDC', 'FLR', 'NIGHT', 'KAVA', 'CRO', 'XPL', 'MON', 'MOVR', 'GLMR', 'GRAM'] },
    { key: 'layer2',    label: 'Layer 2 Blockchains',        color: '#06b6d4', coins: ['ARB', 'OP', 'STRK', 'POL', 'MNT'] },
    { key: 'layer0',    label: 'Layer 0 & Interoperability', color: '#f59e0b', coins: ['DOT', 'ATOM', 'KSM', 'QNT'] },
    { key: 'oracle',    label: 'Oracles & Middleware',       color: '#ec4899', coins: ['LINK', 'PYTH', 'AVAIL'] },
    { key: 'defi',      label: 'DeFi & RWA',                 color: '#10b981', coins: ['ONDO', 'JUP'] },
    { key: 'launchpad', label: 'Launchpad',                  color: '#f97316', coins: ['PONS'] },
    { key: 'web3',      label: 'Web3 & Gaming',              color: '#84cc16', coins: ['ENS'] },
    { key: 'meme',      label: 'Meme & Utility Tokens',      color: '#ef4444', coins: ['DOGE', 'VTHO'] },
    { key: 'metals',    label: 'Precious Metals',            color: '#eab308', coins: ['XAU', 'XAG', 'PAXG', 'XAUT', 'KAG'] },   // physical gold / silver (grams) and gold tokens
    { key: 'stocks',    label: 'US Stocks (bStocks)',        color: '#38bdf8', coins: [] },   // 📈 tokenized US shares — the Add window's bStocks tab saves them here
  ];
  var OTHER = { key: 'other', label: 'Other', color: '#6b7280', coins: [] };
  var BY_SYM = {}, LABELS = {}, COLORS = {};
  CATS.concat([OTHER]).forEach(function (c) {
    LABELS[c.key] = c.label; COLORS[c.key] = c.color;
    c.coins.forEach(function (s) { BY_SYM[s] = c.key; });
  });
  // Categories saved by older versions of the app → nearest new category (only for coins not listed above)
  var LEGACY = { infra: 'other', layer1: 'layer1', layer2: 'layer2', defi: 'defi', ai: 'ai', meme: 'meme' };

  // A category you chose yourself for a coin (locked) always wins over the default list above.
  function categoryOf(sym, savedCat, locked) {
    var s = String(sym || '').toUpperCase();
    if (savedCat && SET.removed[savedCat]) { savedCat = null; locked = false; }   // a category you deleted → the coin's default
    if (locked && savedCat && LABELS[savedCat]) return savedCat;
    if (BY_SYM[s]) return BY_SYM[s];
    if (savedCat && LABELS[savedCat]) return savedCat;
    return LEGACY[savedCat] || 'other';
  }
  // ── Your own categories (made by choosing "Other" and typing a name) ──
  // Saved on each coin as cat = 'x-…' + catLabel; every page registers them from the cloud data.
  var ORDER = ['btc', 'metals', 'stocks', 'layer1', 'layer2', 'ai', 'layer0', 'oracle', 'defi', 'meme', 'launchpad', 'web3'];
  var PALETTE = ['#14b8a6', '#e879f9', '#facc15', '#60a5fa', '#fb7185', '#a3e635', '#c084fc', '#38bdf8', '#fdba74', '#4ade80'];
  var CUSTOM = {};
  // ── Your category settings (Manage Categories, saved once in the cloud: users/{uid}/meta/categories) ──
  //   labels / colors: new name or colour for any category (built-in ones too) · customs: categories you made
  //   (even before a coin is in them) · removed: categories you deleted. Every page applies the same settings.
  var DEF = {}; CATS.concat([OTHER]).forEach(function (c) { DEF[c.key] = { label: c.label, color: c.color }; });
  var SET = { labels: {}, colors: {}, customs: {}, removed: {} };
  function okColor(c) { return /^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toLowerCase() : null; }
  function isCustom(key) { return /^x-[a-z0-9-]{1,27}$/.test(String(key || '')); }
  function cleanLabel(l) { return String(l == null ? '' : l).replace(/[<>"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40); }
  function hash(str) { var h = 5381; for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h; }
  function register(key, label, fromSettings) {
    label = cleanLabel(label);
    if (!isCustom(key) || !label) return false;
    if (SET.removed[key] && !fromSettings) return false;
    if (!fromSettings && SET.customs[key]) label = SET.customs[key];   // the name in your settings wins over a coin's copy
    var color = okColor(SET.colors[key]) || PALETTE[hash(key) % PALETTE.length];
    if (CUSTOM[key] === label && COLORS[key] === color) return false;
    CUSTOM[key] = label; LABELS[key] = label; COLORS[key] = color;
    return true;
  }
  // Apply the saved settings (called by samsam-cloud.js whenever they change, on every page and device).
  function applySettings(cfg) {
    cfg = cfg && typeof cfg === 'object' ? cfg : {};
    var obj = function (o) { return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; };
    var removed = {}; (Array.isArray(cfg.removed) ? cfg.removed : []).forEach(function (k) { if (isCustom(k)) removed[k] = true; });
    SET = { labels: {}, colors: {}, customs: {}, removed: removed };
    Object.keys(obj(cfg.labels)).forEach(function (k) { var l = cleanLabel(cfg.labels[k]); if (DEF[k] && l) SET.labels[k] = l; });
    Object.keys(obj(cfg.colors)).forEach(function (k) { var c = okColor(cfg.colors[k]); if (c && (DEF[k] || isCustom(k))) SET.colors[k] = c; });
    Object.keys(obj(cfg.customs)).forEach(function (k) { var l = cleanLabel(cfg.customs[k]); if (isCustom(k) && l && !removed[k]) SET.customs[k] = l; });
    Object.keys(DEF).forEach(function (k) { LABELS[k] = SET.labels[k] || DEF[k].label; COLORS[k] = SET.colors[k] || DEF[k].color; });
    LIST.forEach(function (c) { c.label = LABELS[c.key]; c.color = COLORS[c.key]; });
    // start your own categories afresh from the settings; the coins / plan entries register theirs again right after
    Object.keys(CUSTOM).forEach(function (k) { delete CUSTOM[k]; delete LABELS[k]; delete COLORS[k]; });
    Object.keys(SET.customs).forEach(function (k) { register(k, SET.customs[k], true); });
  }
  function settings() { return JSON.parse(JSON.stringify({ labels: SET.labels, colors: SET.colors, customs: SET.customs, removed: Object.keys(SET.removed) })); }
  // Same name → same category (case-insensitive), so a name typed twice never makes two filters.
  function customKey(label) {
    label = cleanLabel(label); if (!label) return null;
    var want = label.toLowerCase();
    for (var k in CUSTOM) if (CUSTOM[k].toLowerCase() === want) return k;
    var slug = want.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 18);
    return 'x-' + (slug ? slug + '-' : '') + hash(want).toString(36).slice(0, 6);
  }
  var LIST = CATS.concat([OTHER]).map(function (c) { return { key: c.key, label: c.label, color: c.color, coins: c.coins.slice() }; });
  function customs() { return Object.keys(CUSTOM).sort(function (a, b) { return CUSTOM[a].localeCompare(CUSTOM[b]); }).map(function (k) { return { key: k, label: CUSTOM[k], color: COLORS[k] }; }); }
  // Filter lists: the built-in order, then your own categories that have coins, then Other.
  function pickerKeys(totals) {
    totals = totals || {};
    // US Stocks only when you hold a share in it (a crypto-only portfolio keeps its list as it was)
    return ORDER.filter(function (k) { return k !== 'stocks' || totals.stocks != null; }).concat(customs().map(function (c) { return c.key; }).filter(function (k) { return totals[k] != null; }), totals.other ? ['other'] : []);
  }
  // ── The level above categories: the asset class (Crypto · Stocks · Metals) ──
  // A holding's class comes from the asset itself (samsam-core assetClass: a bStock share → Stocks, gold / silver grams →
  // Metals); a gold token (PAXG, XAUT…) sits in Metals here too, by its category — it is gold you own, priced as a token.
  // Filters use 'c:<class>' for a whole class and the category key for one category.
  var CLASSES = [
    { key: 'crypto', label: 'Crypto', color: '#8b5cf6' },
    { key: 'stock',  label: 'Stocks', color: '#38bdf8' },
    { key: 'metal',  label: 'Metals', color: '#eab308' },
    { key: 'cash',   label: 'Cash & CDs', color: '#22c55e' },   // only the Plan has these rows (a savings goal)
  ];
  var CLS = {}; CLASSES.forEach(function (c) { CLS[c.key] = c; });
  function groupOf(sym, cat) {
    var core = window.Samsam && window.Samsam.core, k = core && core.assetClass ? core.assetClass(String(sym || '').toUpperCase()) : null;
    if (k === 'stock' || k === 'metal' || k === 'cash') return k;
    if (/^CASH-(USD|EGP|SAR)$/.test(String(sym || '').toUpperCase())) return 'cash';
    if (cat === 'metals') return 'metal';
    if (cat === 'stocks' && !k) return 'stock';
    return 'crypto';
  }
  // Inside Metals, each metal on its own (gold, silver — platinum / copper ready for later): grams and its tokens together
  var METAL_KINDS = [
    { key: 'gold',     label: 'Gold',     color: '#eab308', syms: ['XAU', 'PAXG', 'XAUT'] },
    { key: 'silver',   label: 'Silver',   color: '#cbd5e1', syms: ['XAG', 'KAG'] },
    { key: 'platinum', label: 'Platinum', color: '#a5b4fc', syms: ['XPT'] },
    { key: 'copper',   label: 'Copper',   color: '#ea580c', syms: ['XCU'] },
  ];
  var MK = {}, MK_SYM = {}; METAL_KINDS.forEach(function (m) { MK[m.key] = m; m.syms.forEach(function (s) { MK_SYM[s] = m.key; }); });
  function metalOf(sym) { return MK_SYM[String(sym || '').toUpperCase()] || null; }
  function isMetalKey(f) { return /^m:[a-z]+$/.test(String(f || '')) && !!MK[String(f).slice(2)]; }
  function isClassKey(f) { return /^c:(crypto|stock|metal|cash)$/.test(String(f || '')); }
  // does a holding pass the filter? '' → all · 'c:stock' → its class · else → its category
  function matches(filter, sym, cat) {
    if (!filter) return true;
    if (isClassKey(filter)) return groupOf(sym, cat) === filter.slice(2);
    if (isMetalKey(filter)) return metalOf(sym) === filter.slice(2);
    return (cat || 'other') === filter;
  }
  // rows: [{ sym, cat, v }] → the classes that hold something, each with its categories (in the usual order)
  function tree(rows) {
    var by = {}, all = 0;
    (rows || []).forEach(function (r) {
      var v = +r.v || 0, cat = r.cat || 'other', g = groupOf(r.sym, cat);
      if (g === 'metal' && metalOf(r.sym)) cat = 'm:' + metalOf(r.sym);   // Metals → Gold · Silver …
      var n = by[g] || (by[g] = { key: g, v: 0, cats: {} });
      n.v += v; if (g !== 'cash') n.cats[cat] = (n.cats[cat] || 0) + v; all += v;   // a savings goal has no categories
    });
    return { all: all, classes: CLASSES.filter(function (c) { return by[c.key]; }).map(function (c) {
      var n = by[c.key];
      return { key: c.key, label: c.label, color: c.color, v: n.v, cats: METAL_KINDS.map(function (m) { return 'm:' + m.key; }).concat(pickerKeys(n.cats)).filter(function (k) { return n.cats[k] != null; }).map(function (k) { return { key: k, v: n.cats[k] }; }) };
    }) };
  }
  // The category dropdown's options. One class only (most portfolios) → the same flat list as before;
  // more than one → each class (a line above it), then its categories indented under it.
  function pickerOptions(rows, o) {
    o = o || {};
    var t = tree(rows), sub = o.sub || function (v) { return String(v); }, dot = function (c) { return '<span class="cp-dot" style="background:' + c + '"></span>'; };
    var out = [];
    if (t.classes.length > 1) t.classes.forEach(function (c) {
      out.push({ value: 'c:' + c.key, label: c.label, sub: sub(c.v, t.all), icon: '<span class="cp-cls" style="--c:' + c.color + '"></span>', head: true });
      c.cats.forEach(function (k) { out.push({ value: k.key, label: label(k.key), sub: sub(k.v, t.all), icon: dot(color(k.key)), indent: true }); });
    });
    else {
      var cats = {}; (t.classes[0] ? t.classes[0].cats : []).forEach(function (k) { cats[k.key] = k.v; });
      var only = t.classes[0];
      (only && only.key === 'metal' ? only.cats.map(function (k) { return k.key; }) : pickerKeys(cats)).forEach(function (k) { out.push({ value: k, label: label(k), sub: sub(cats[k] || 0, t.all), icon: dot(color(k)) }); });
    }
    return { all: t.all, options: out, classes: t.classes };
  }
  function label(key) { return isClassKey(key) ? CLS[key.slice(2)].label : isMetalKey(key) ? MK[key.slice(2)].label : LABELS[key] || LABELS.other; }
  function color(key) { return isClassKey(key) ? CLS[key.slice(2)].color : isMetalKey(key) ? MK[key.slice(2)].color : COLORS[key] || COLORS.other; }

  window.SamsamTaxonomy = Object.freeze({
    list: LIST,   // live: names / colours follow your settings
    labels: LABELS, colors: COLORS,   // live maps: your own categories are added to them
    ORDER: ORDER.slice(), isCustom: isCustom, register: register, applySettings: applySettings, settings: settings,
    PALETTE: PALETTE.concat(['#3b82f6', '#a855f7', '#06b6d4', '#f59e0b', '#ec4899', '#10b981', '#f97316', '#84cc16', '#ef4444', '#6b7280']),
    defaultLabel: function (key) { return DEF[key] ? DEF[key].label : null; }, defaultColor: function (key) { return DEF[key] ? DEF[key].color : null; },
    isRemoved: function (key) { return !!SET.removed[key]; }, customKey: customKey, customs: customs, pickerKeys: pickerKeys,
    defaultOf: function (sym) { return BY_SYM[String(sym || '').toUpperCase()] || null; },
    categoryOf: categoryOf,
    label: label, color: color,
    CLASSES: CLASSES, groupOf: groupOf, isClassKey: isClassKey, METAL_KINDS: METAL_KINDS, metalOf: metalOf, isMetalKey: isMetalKey, matches: matches, tree: tree, pickerOptions: pickerOptions,
    // Same shape as the snippet in the request: ASSET_TAXONOMY + getCoinCategory(symbol) → label
    ASSET_TAXONOMY: Object.freeze(CATS.reduce(function (o, c) { o[c.label] = c.coins.slice(); return o; }, {})),
    getCoinCategory: function (sym) { return LABELS[categoryOf(sym)]; },
  });
})();
