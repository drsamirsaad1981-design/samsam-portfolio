/* samsam-add.js — the Add Coin and Add Transaction forms, shared by every page that adds to the portfolio
   (main page, Holdings, Accumulation). Same fields, same checks, same cloud write everywhere, so a coin
   added on any page shows up on every page at once.

   CPAdd.openCoin(prefill?)   new coin (CoinGecko search) — prefill { sym, name, cgId, logoUrl, cmcSlug, cat } skips the search
   CPAdd.openTx(type, sym)    Buy / Sell / Transfer In / Transfer Out for a coin you hold
   CPAdd.buy(sym, prefill?)   the right one of the two: Add Transaction (Buy) if you hold the coin, else Add Coin
   CPAdd.search(query)        CoinGecko coin search → [{ id, sym, name, rank, thumb }]
   CPAdd.editCategory(sym, { current, catLabel, onSave(key, label) })  Change category — a coin you hold is saved on the coin
                              (every page); one you don't hold yet calls onSave (the plan keeps it)
   CPAdd.on('coin' | 'tx' | 'cat', fn)  called after a save, with { sym, ... }
   CPAdd.defaultTxSym         () => symbol used by openTx() when none is given (the main page sets it to the open coin)

   The old global names (openAddCoin, applyAddCoin, openAddTx, saveAddTx, …) still work. */
(function () {
  'use strict';
  if (window.CPAdd) return;
  var $ = function (id) { return document.getElementById(id); };
  var E = function (s) { return window.SamsamCoins ? SamsamCoins.esc(s) : String(s == null ? '' : s); };
  function state() { return window.Samsam && Samsam.isReady && Samsam.isReady() ? Samsam.getState() : null; }
  function portfolio() { var s = state(); return s ? s.portfolio : []; }
  function held(sym) { return portfolio().find(function (c) { return c.sym === sym; }) || null; }
  var hooks = { coin: [], tx: [], cat: [] };
  function emit(k, d) { hooks[k].forEach(function (f) { try { f(d); } catch (e) { console.error('[Add]', e); } }); }
  function write(p) { if (p && p.catch) p.catch(function (e) { console.error('[Add] save failed', e); }); return p; }
  function requireCloud() {
    if (!window.Samsam || !Samsam.isReady || !Samsam.isReady()) { CPDialog.alert('Your portfolio is still loading from the cloud. Please try again in a moment.'); return false; }
    return true;
  }
  function fmtInput(n) { n = Number(n) || 0; return parseFloat(n.toPrecision(12)).toString(); }
  function fmtQty(n) { return parseFloat((Number(n) || 0).toFixed(8)).toLocaleString('en-US', { maximumFractionDigits: 8 }); }
  function coinName(sym) { var c = held(sym); return (c && c.name && c.name !== sym ? c.name : '') || (SamsamCoins.NAMES && SamsamCoins.NAMES[sym]) || ''; }
  function icon(sym, size, logoUrl) { var c = held(sym); return SamsamCoins.icon(sym, size, { logoUrl: logoUrl || (c && c.logoUrl) || '' }); }

  // ── styles (one look on every page; colours fall back when a page has no theme variable) ──
  var CSS =
    '.atx-backdrop{position:fixed;inset:0;z-index:100040;background:rgba(2,6,23,.6);display:none;align-items:flex-end;justify-content:center}' +
    '.atx-backdrop.show{display:flex}' +
    'body.atx-open #samsamSyncPill,body.atx-open #samsamSyncMenu{display:none!important}' +
    '.atx-modal{width:100%;max-width:480px;max-height:92vh;overflow-y:auto;box-sizing:border-box;background:var(--bg-card,#1e293b);color:#f1f5f9;border:1px solid var(--border-card,#334155);text-align:left;' +
      'border-radius:18px 18px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 40px rgba(0,0,0,.4);font-family:inherit}' +
    '[data-theme="light"] .atx-modal{background:#fff;color:#0f172a;border-color:#e2e8f0}' +
    '@media (min-width:601px){.atx-backdrop{align-items:center}.atx-modal{border-radius:16px}}' +
    '.atx-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}' +
    '.atx-head h3{margin:0;font-size:1.05rem}' +
    '.atx-x{background:none;border:none;color:inherit;font-size:1.5rem;line-height:1;opacity:.7;cursor:pointer;padding:2px 6px}' +
    '.atx-types{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;background:rgba(148,163,184,.12);padding:4px;border-radius:12px;margin-bottom:12px}' +
    '.atx-types button{border:none;background:transparent;color:inherit;font:inherit;font-size:.8rem;font-weight:700;padding:9px 4px;border-radius:9px;cursor:pointer;white-space:nowrap;display:flex;align-items:center;justify-content:center;opacity:.75}' +
    '.atx-types button[aria-checked="true"]{opacity:1;background:var(--bg-card-secondary,#334155);box-shadow:inset 0 0 0 1px var(--atx-c,#64748b)}' +
    '[data-theme="light"] .atx-types button[aria-checked="true"]{background:#fff}' +
    '@media (max-width:380px){.atx-types button{font-size:.72rem;padding:9px 2px}}' +
    '.htx-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px;vertical-align:1px}.atx-types button .htx-dot{margin-right:5px}' +
    '.htx-dot-buy{background:#22c55e}.htx-dot-sell{background:#ef4444}.htx-dot-transfer_in{background:#3b82f6}.htx-dot-transfer_out{background:#f59e0b}.htx-dot-adjust{background:#94a3b8}' +
    '.atx-coin{display:flex;align-items:center;gap:8px;font-weight:700;margin:2px 0 10px}.atx-coin small{font-weight:500;color:#94a3b8}' +
    '.atx-coin img{background:transparent!important;border-radius:50%}' +
    '.atx-field{display:block;margin-bottom:10px;font-size:.8rem;font-weight:600;color:#cbd5e1;min-width:0}' +
    '[data-theme="light"] .atx-field{color:#475569}' +
    '.atx-field small{font-weight:500;color:#94a3b8}' +
    '.atx-field input,.atx-field select{display:block;width:100%;box-sizing:border-box;margin-top:5px;height:44px;padding:0 12px;border-radius:10px;border:1px solid #334155;' +
      'background:rgba(255,255,255,.05);color:inherit;font:inherit;font-size:1rem;color-scheme:dark}' +
    '.atx-field select option,.atx-field select optgroup{background:var(--bg-card,#1e293b);color:#f1f5f9}' +
    '[data-theme="light"] .atx-field input,[data-theme="light"] .atx-field select{background:#f8fafc;border-color:#e2e8f0;color-scheme:light}' +
    '[data-theme="light"] .atx-field select option,[data-theme="light"] .atx-field select optgroup{background:#fff;color:#0f172a}' +
    '.atx-field input:focus,.atx-field select:focus{outline:none;border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.2)}' +
    '.atx-field input.bad{border-color:#ef4444}' +
    '.atx-hint{font-size:.75rem;color:#94a3b8;margin:-2px 0 8px;line-height:1.45}' +
    '.atx-preview{font-size:.82rem;background:rgba(148,163,184,.1);border-radius:10px;padding:10px 12px;margin-bottom:10px;line-height:1.6}' +
    '.atx-preview:empty{display:none}' +
    '.atx-err{color:#ef4444;font-size:.82rem;min-height:0;margin-bottom:8px}.atx-err:empty{display:none}' +
    '.atx-save{width:100%;height:48px;border:none;border-radius:12px;color:#fff;font:inherit;font-weight:800;font-size:1rem;cursor:pointer;background:var(--atx-c,#2563eb)}' +
    '.atx-save:disabled{opacity:.5;cursor:default}' +
    // Add Coin: two columns of fields, search with suggestions
    '#addCoinModal .atx-modal{--atx-c:#7c3aed}' +
    '.ac-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:10px}.ac-grid .ac-full{grid-column:1/-1}' +
    '.ac-find{position:relative}' +
    '.ac-suggest{position:absolute;left:0;right:0;top:100%;z-index:30;margin:4px 0 0;padding:4px;list-style:none;max-height:300px;overflow-y:auto;background:var(--bg-app,#0f172a);border:1px solid var(--border-card,#334155);border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.4)}' +
    '[data-theme="light"] .ac-suggest{background:#fff;border-color:#e2e8f0}' +
    '.ac-suggest[hidden]{display:none}' +
    '.ac-suggest [role=option]{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer;min-width:0;font-weight:500}' +
    '.ac-suggest [role=option][aria-selected=true],.ac-suggest [role=option]:hover{background:rgba(59,130,246,.16)}' +
    '.ac-suggest img,.ac-noimg{width:24px;height:24px;border-radius:50%;flex-shrink:0;background:transparent}' +
    '.ac-noimg{background:rgba(148,163,184,.25)}' +
    '.ac-sym{font-weight:700}.ac-name{color:#94a3b8;font-size:.85rem;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.ac-rank{margin-left:auto;color:#94a3b8;font-size:.75rem;font-variant-numeric:tabular-nums}' +
    '.ac-own{color:#a78bfa;font-size:.72rem;font-weight:700;white-space:nowrap}.ac-name+.ac-own{margin-left:auto}' +
    '.ac-msg{padding:10px;color:#94a3b8;font-size:.82rem}' +
    '.ac-linked{margin-top:6px;font-size:.78rem;color:#34d399;line-height:1.4;font-weight:500}.ac-linked[hidden]{display:none}' +
    '.ac-linked.own{color:#a78bfa}' +
    '.ac-cmc{display:flex;align-items:center;margin-top:5px;border:1px solid #334155;border-radius:10px;background:rgba(255,255,255,.05);min-width:0}' +
    '[data-theme="light"] .ac-cmc{background:#f8fafc;border-color:#e2e8f0}' +
    '.ac-cmc:focus-within{border-color:#3b82f6}' +
    '.ac-cmc-pre{padding:0 2px 0 12px;color:#94a3b8;font-size:.78rem;font-weight:500;white-space:nowrap;flex-shrink:1;overflow:hidden;text-overflow:ellipsis}' +
    '.atx-field .ac-cmc input{border:none;background:transparent;margin:0;height:42px;padding-left:2px;min-width:70px;flex:1;box-shadow:none}' +
    '.ac-cmc-check{padding:0 12px;color:#60a5fa;font-size:.8rem;font-weight:600;text-decoration:none;white-space:nowrap}.ac-cmc-check[hidden]{display:none}' +
    '@media (max-width:420px){.ac-cmc-pre{display:none}.atx-field .ac-cmc input{padding-left:12px}}' +
    '.cat-custom[hidden]{display:none}.cat-custom-hint{font-size:.75rem;color:#94a3b8;margin-top:5px;font-weight:500}' +
    '#catEditModal .atx-modal,#catMgrModal .atx-modal{max-width:440px;--atx-c:#7c3aed}' +
    // Change category: a dark list (not the phone's white system picker) — colour dot, name, ✓
    '.ce-list{display:flex;flex-direction:column;gap:2px;max-height:min(52vh,420px);overflow-y:auto;margin:0 0 10px;padding:4px;border:1px solid var(--border-card,#334155);border-radius:12px;background:rgba(255,255,255,.03)}' +
    '.ce-opt{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:8px 12px;border:none;border-radius:9px;background:none;color:inherit;font:inherit;font-size:.92rem;font-weight:600;text-align:left;cursor:pointer}' +
    '.ce-opt:hover{background:rgba(148,163,184,.1)}.ce-opt[aria-checked="true"]{background:rgba(124,58,237,.18);color:#c4b5fd}' +
    '.ce-opt .ce-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0}.ce-opt .ce-name{flex:1;min-width:0}.ce-opt .ce-ck{visibility:hidden;font-weight:800}.ce-opt[aria-checked="true"] .ce-ck{visibility:visible}' +
    '.ce-group{font-size:.7rem;font-weight:700;color:#94a3b8;padding:8px 12px 2px}' +
    '.ce-new{color:#a78bfa}[data-theme="light"] .ce-opt[aria-checked="true"]{background:#ede9fe;color:#5b21b6}' +
    '.ce-manage{display:inline-flex;align-items:center;gap:6px;margin:0 0 12px;padding:0;border:none;background:none;color:#a78bfa;font:inherit;font-size:.84rem;font-weight:700;cursor:pointer}' +
    '#ceCat{display:none}' +
    // Manage Categories
    '.cm-row{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid var(--border-card,#334155)}' +
    '.cm-dot{width:26px;height:26px;border-radius:50%;border:2px solid rgba(255,255,255,.18);cursor:pointer;padding:0}' +
    '.cm-name{font-weight:700;font-size:.92rem;min-width:0;overflow-wrap:anywhere}.cm-sub{font-size:.72rem;color:#94a3b8;font-weight:600;margin-top:2px}' +
    '.cm-acts{display:flex;gap:4px}.cm-acts button{height:32px;min-width:32px;padding:0 8px;border:1px solid var(--border-card,#334155);border-radius:8px;background:rgba(255,255,255,.04);color:inherit;font:inherit;font-size:.8rem;font-weight:700;cursor:pointer}' +
    '.cm-acts .cm-del{color:#f87171;border-color:rgba(248,113,113,.4)}' +
    '.cm-pal{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;padding:6px 0 4px}.cm-pal[hidden]{display:none}' +
    '.cm-pal button{width:28px;height:28px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0}.cm-pal button[aria-pressed="true"]{border-color:#fff;box-shadow:0 0 0 2px #7c3aed}' +
    '.cm-group{font-size:.72rem;font-weight:800;color:#94a3b8;margin:14px 0 2px}.cm-note{font-size:.76rem;color:#94a3b8;margin:4px 0 12px;line-height:1.45}' +
    '.cat-reset{display:block;margin:0 0 10px;padding:0;border:none;background:none;color:#60a5fa;font:inherit;font-size:.82rem;font-weight:600;cursor:pointer}.cat-reset[hidden]{display:none}';

  var HTML_COIN =
    '<div class="atx-backdrop" id="addCoinModal" onclick="if(event.target===this)closeAddCoin()">' +
    '<form class="atx-modal" id="acForm" onsubmit="event.preventDefault();applyAddCoin()" role="dialog" aria-modal="true" aria-labelledby="acTitle" novalidate>' +
      '<div class="atx-head"><h3 id="acTitle">➕ Add New Coin</h3><button type="button" class="atx-x" onclick="closeAddCoin()" aria-label="Close">×</button></div>' +
      '<div class="ac-grid">' +
        '<div class="atx-field ac-find ac-full"><label for="acSym">Coin <span style="color:#ef4444">*</span> <small class="form-sub">— search by symbol or name</small></label>' +
          '<input type="text" id="acSym" placeholder="e.g. XRP or Ripple" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="acSuggest"' +
          ' oninput="this.value=this.value.toUpperCase().replace(/\\s+/g,\' \').trimStart(); acSearchInput()" onkeydown="acSearchKey(event)">' +
          '<ul class="ac-suggest" id="acSuggest" role="listbox" hidden></ul><div class="ac-linked" id="acLinked" hidden></div></div>' +
        '<label class="atx-field ac-full"><span>Full Name</span><input type="text" id="acName" placeholder="Filled by search"></label>' +
        '<label class="atx-field"><span>Amount <span style="color:#ef4444">*</span></span><input type="number" id="acQty" placeholder="0.00" step="any" min="0" inputmode="decimal" oninput="previewAddCoin()"></label>' +
        '<label class="atx-field"><span>Avg. Buy Price <span style="color:#ef4444">*</span></span><input type="number" id="acPrice" placeholder="USD" step="any" min="0" inputmode="decimal" oninput="previewAddCoin()"></label>' +
        '<label class="atx-field"><span>Fee (USD)</span><input type="number" id="acFeeUsd" placeholder="Optional" step="any" min="0" inputmode="decimal" oninput="previewAddCoin()"></label>' +
        '<label class="atx-field"><span>CoinGecko ID</span><input type="text" id="acCgId" placeholder="Auto" autocomplete="off" spellcheck="false"></label>' +
        '<div class="atx-field ac-full"><label for="acCmc">CoinMarketCap Page</label><div class="ac-cmc"><span class="ac-cmc-pre">coinmarketcap.com/currencies/</span>' +
          '<input type="text" id="acCmc" placeholder="auto" autocomplete="off" spellcheck="false" oninput="this.value=this.value.toLowerCase().replace(/[^a-z0-9-]/g,\'\');acCmcCheck()">' +
          '<a id="acCmcCheck" class="ac-cmc-check" href="#" target="_blank" rel="noopener noreferrer" hidden>Check ↗</a></div></div>' +
        '<label class="atx-field ac-full"><span>Category</span><select id="acCat" onchange="syncCatCustom(this,\'acCatCustomBox\')"></select></label>' +
        '<div class="atx-field ac-full cat-custom" id="acCatCustomBox" hidden><label for="acCatCustom">New Category Name</label>' +
          '<input type="text" id="acCatCustom" maxlength="40" placeholder="Enter Custom Category..." autocomplete="off"><div class="cat-custom-hint">Saved for this coin and added to the category filters.</div></div>' +
      '</div>' +
      '<div class="atx-preview" id="acPreview"></div>' +
      '<div class="atx-err" id="acError" role="alert"></div>' +
      '<button type="submit" class="atx-save" id="acSave">➕ Add to Portfolio</button>' +
    '</form></div>';

  var HTML_TX =
    '<div class="atx-backdrop" id="atxBackdrop" onclick="if(event.target===this)closeAddTx()">' +
    '<form class="atx-modal" id="atxForm" onsubmit="event.preventDefault();saveAddTx()" role="dialog" aria-modal="true" aria-labelledby="atxTitle" novalidate>' +
      '<div class="atx-head"><h3 id="atxTitle">Add Transaction</h3><button type="button" class="atx-x" onclick="closeAddTx()" aria-label="Close">×</button></div>' +
      '<div class="atx-types" role="radiogroup" aria-label="Transaction type">' +
        '<button type="button" data-t="buy" role="radio"><span class="htx-dot htx-dot-buy"></span>Buy</button>' +
        '<button type="button" data-t="sell" role="radio"><span class="htx-dot htx-dot-sell"></span>Sell</button>' +
        '<button type="button" data-t="transfer_in" role="radio"><span class="htx-dot htx-dot-transfer_in"></span>Transfer In</button>' +
        '<button type="button" data-t="transfer_out" role="radio"><span class="htx-dot htx-dot-transfer_out"></span>Transfer Out</button>' +
      '</div>' +
      '<div class="atx-coin" id="atxCoin"></div>' +
      '<label class="atx-field"><span id="atxQtyLabel">Amount</span><input type="number" inputmode="decimal" step="any" min="0" id="atxQty" placeholder="0.00" oninput="previewAddTx()"></label>' +
      '<label class="atx-field" id="atxPriceRow"><span id="atxPriceLabel">Price per coin (USD)</span><input type="number" inputmode="decimal" step="any" min="0" id="atxPrice" placeholder="0.00" oninput="previewAddTx()"></label>' +
      '<label class="atx-field" id="atxFeeUsdRow"><span id="atxFeeUsdLabel">Buying fee <small>(USD, optional — added to Cost Basis)</small></span><input type="number" inputmode="decimal" step="any" min="0" id="atxFeeUsd" placeholder="0.00" oninput="previewAddTx()"></label>' +
      '<label class="atx-field" id="atxFeeRow"><span>Transfer fee <small id="atxFeeUnit">(in coin, optional)</small></span><input type="number" inputmode="decimal" step="any" min="0" id="atxFee" placeholder="0" oninput="previewAddTx()"></label>' +
      '<label class="atx-field"><span>Date &amp; time</span><input type="datetime-local" id="atxDate" oninput="previewAddTx()"></label>' +
      '<label class="atx-field"><span>Note <small>(optional)</small></span><input type="text" id="atxNote" maxlength="120" placeholder="e.g. from Binance, to cold wallet"></label>' +
      '<div class="atx-hint" id="atxHint"></div><div class="atx-preview" id="atxPreview"></div><div class="atx-err" id="atxErr" role="alert"></div>' +
      '<button type="submit" class="atx-save" id="atxSave">Add Transaction</button>' +
    '</form></div>';

  var HTML_MGR =
    '<div class="atx-backdrop" id="catMgrModal" onclick="if(event.target===this)closeCatManager()">' +
    '<div class="atx-modal" role="dialog" aria-modal="true" aria-labelledby="cmTitle">' +
      '<div class="atx-head"><h3 id="cmTitle">✏️ Manage Categories</h3><button type="button" class="atx-x" onclick="closeCatManager()" aria-label="Close">×</button></div>' +
      '<div class="cm-note">Changes apply everywhere at once — every page, filter, chart and device.</div>' +
      '<div id="cmList"></div>' +
      '<div class="atx-err" id="cmError" role="alert"></div>' +
      '<button type="button" class="atx-save" onclick="cmNew()">➕ New Category</button>' +
    '</div></div>';

  var HTML_CAT =
    '<div class="atx-backdrop" id="catEditModal" onclick="if(event.target===this)closeCatEdit()">' +
    '<form class="atx-modal" id="ceForm" onsubmit="event.preventDefault();saveCatEdit()" role="dialog" aria-modal="true" aria-labelledby="ceTitle" novalidate>' +
      '<div class="atx-head"><h3 id="ceTitle">Category</h3><button type="button" class="atx-x" onclick="closeCatEdit()" aria-label="Close">×</button></div>' +
      '<div class="atx-coin" id="ceCoin"></div>' +
      '<div class="atx-field"><span>Category</span><select id="ceCat" onchange="syncCatCustom(this,\'ceCustomBox\');ceDrawList()" aria-hidden="true" tabindex="-1"></select>' +
        '<div class="ce-list" id="ceList" role="radiogroup" aria-label="Category"></div></div>' +
      '<button type="button" class="ce-manage" onclick="openCatManager()">✏️ Manage Categories <small style="color:#94a3b8;font-weight:600">— rename, colour, add, delete</small></button>' +
      '<div class="atx-field cat-custom" id="ceCustomBox" hidden><label for="ceCustom">New Category Name</label>' +
        '<input type="text" id="ceCustom" maxlength="40" placeholder="Enter Custom Category..." autocomplete="off"><div class="cat-custom-hint">Saved for this coin and added to the category filters.</div></div>' +
      '<button type="button" class="cat-reset" id="ceReset" hidden onclick="saveCatEdit(true)"></button>' +
      '<div class="atx-err" id="ceError" role="alert"></div>' +
      '<button type="submit" class="atx-save btn-primary" id="ceSave">Save</button>' +
    '</form></div>';

  function mount() {
    if (!document.getElementById('cpAddCss')) { var s = document.createElement('style'); s.id = 'cpAddCss'; s.textContent = CSS; document.head.appendChild(s); }
    if (!document.body) return false;
    if (!$('addCoinModal')) document.body.insertAdjacentHTML('beforeend', HTML_COIN);
    if (!$('atxBackdrop')) document.body.insertAdjacentHTML('beforeend', HTML_TX);
    if (!$('catEditModal')) document.body.insertAdjacentHTML('beforeend', HTML_CAT);
    if (!$('catMgrModal')) document.body.insertAdjacentHTML('beforeend', HTML_MGR);
    return true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  function anyOpen() { return !!document.querySelector('#addCoinModal.show, #atxBackdrop.show, #catEditModal.show, #catMgrModal.show'); }
  function setOpen(el, on) { el.classList.toggle('show', on); document.body.classList.toggle('atx-open', on || anyOpen()); }

  // ── Category choice (Add Coin + Change category): built-in list, your own categories, and "Other" ──
  function fillCatSelect(sel, current) {
    var T = SamsamTaxonomy;
    var builtIn = T.list.filter(function (c) { return c.key !== 'other'; }), mine = T.customs();
    sel.innerHTML = builtIn.map(function (c) { return '<option value="' + c.key + '">' + E(c.label) + '</option>'; }).join('') +
      (mine.length ? '<optgroup label="Your categories">' + mine.map(function (c) { return '<option value="' + c.key + '">' + E(c.label) + '</option>'; }).join('') + '</optgroup>' : '') +
      '<option value="other">Other — type a new category…</option>';
    sel.value = current && [].some.call(sel.options, function (o) { return o.value === current; }) ? current : (current ? 'other' : 'layer1');
  }
  function syncCatCustom(sel, boxId) {
    var box = $(boxId); if (!box) return;
    var show = sel.value === 'other';
    box.hidden = !show;
    if (show) setTimeout(function () { box.querySelector('input').focus(); }, 0);
  }
  function readCatChoice(sel, inputId) {
    // one of your own categories picked from the list keeps its name (so every device shows it)
    if (sel.value !== 'other') return { key: sel.value, label: SamsamTaxonomy.isCustom(sel.value) ? SamsamTaxonomy.label(sel.value) : null };
    var name = ($(inputId).value || '').replace(/\s+/g, ' ').trim();
    if (!name) return { key: 'other', label: null };
    return { key: SamsamTaxonomy.customKey(name), label: name };
  }

  // ── CoinGecko search ──
  var CG_CAT_RULES = [   // CoinGecko category names → our taxonomy (first match wins)
    [/meme/i, 'meme'], [/oracle|middleware|data availability/i, 'oracle'], [/launchpad/i, 'launchpad'],
    [/layer 2|layer-2|rollup|zk|optimistic/i, 'layer2'], [/layer 0|interoperab|cross-chain|bridge/i, 'layer0'],
    [/artificial intelligence|\bai\b|depin|machine learning/i, 'ai'],
    [/gaming|metaverse|web3|nft|play to earn|name service/i, 'web3'],
    [/decentralized finance|defi|real world asset|\brwa\b|exchange|lending|yield|stablecoin/i, 'defi'],
    [/layer 1|smart contract platform/i, 'layer1']
  ];
  function categoryFrom(cats) {
    var list = (cats || []).filter(Boolean).join(' | ');
    for (var i = 0; i < CG_CAT_RULES.length; i++) if (CG_CAT_RULES[i][0].test(list)) return CG_CAT_RULES[i][1];
    return null;
  }
  async function search(q) {
    var r = await fetch('https://api.coingecko.com/api/v3/search?query=' + encodeURIComponent(q));
    if (!r.ok) throw new Error(r.status === 429 ? 'CoinGecko is busy — wait a few seconds and type again.' : 'CoinGecko answered ' + r.status);
    var j = await r.json(), Q = String(q).trim().toUpperCase();
    return (j.coins || []).filter(function (c) { return c && c.id && c.symbol; })
      .map(function (c) { return { id: String(c.id), sym: String(c.symbol).toUpperCase(), name: String(c.name || c.symbol), rank: c.market_cap_rank || null, thumb: c.large || c.thumb || null }; })
      .sort(function (a, b) { return (b.sym === Q) - (a.sym === Q) || (a.rank || 1e9) - (b.rank || 1e9); }).slice(0, 8);
  }
  // Live USD price (and 24h change, logo, categories) of one coin by its CoinGecko id
  async function coinInfo(cgId) {
    var r = await fetch('https://api.coingecko.com/api/v3/coins/' + encodeURIComponent(cgId) + '?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false');
    if (!r.ok) throw new Error('CoinGecko answered ' + r.status);
    var d = await r.json(), md = d.market_data || {};
    return { usd: md.current_price && md.current_price.usd || 0, ch24: md.price_change_percentage_24h != null ? md.price_change_percentage_24h : null,
      logo: d.image && (d.image.small || d.image.thumb) || null, categories: d.categories || [] };
  }

  // ── Add Coin form ──
  var acResults = [], acActive = -1, acTimer = null, acSeq = 0, acLogo = null;
  function acSearchInput() {
    acLink(null);
    var q = $('acSym').value.trim();
    clearTimeout(acTimer);
    if (q.length < 2) { acShow([]); return; }
    acTimer = setTimeout(function () { acSearch(q); }, 280);
  }
  async function acSearch(q) {
    var seq = ++acSeq, box = $('acSuggest');
    box.hidden = false; box.innerHTML = '<li class="ac-msg">Searching CoinGecko…</li>';
    try {
      var coins = await search(q); if (seq !== acSeq) return;
      acShow(coins, coins.length ? '' : 'No coin found. Check the spelling, or fill the CoinGecko ID by hand.');
    } catch (e) {
      if (seq === acSeq) acShow([], navigator.onLine ? (e.message || 'Search failed') : 'You are offline — search needs internet.');
    }
  }
  function acShow(list, msg) {
    acResults = list; acActive = list.length ? 0 : -1;
    var box = $('acSuggest'), inp = $('acSym');
    if (!box) return;
    if (!list.length && !msg) { box.hidden = true; box.innerHTML = ''; inp.setAttribute('aria-expanded', 'false'); return; }
    box.innerHTML = list.map(function (c, i) {
      return '<li role="option" id="acOpt' + i + '" data-i="' + i + '" aria-selected="' + (i === acActive) + '">' +
        (c.thumb && /^https:\/\//.test(c.thumb) ? '<img src="' + E(c.thumb) + '" alt="" width="24" height="24" loading="lazy">' : '<span class="ac-noimg"></span>') +
        '<span class="ac-sym">' + E(c.sym) + '</span><span class="ac-name">' + E(c.name) + '</span>' +
        (c.rank ? '<span class="ac-rank">#' + c.rank + '</span>' : '') + (held(c.sym) ? '<span class="ac-own">In Portfolio</span>' : '') + '</li>';
    }).join('') + (msg ? '<li class="ac-msg">' + E(msg) + '</li>' : '');
    box.hidden = false; inp.setAttribute('aria-expanded', String(!!list.length));
    if (acActive >= 0) inp.setAttribute('aria-activedescendant', 'acOpt' + acActive); else inp.removeAttribute('aria-activedescendant');
  }
  function acSearchKey(e) {
    var box = $('acSuggest');
    if (box.hidden || !acResults.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); acActive = (acActive + (e.key === 'ArrowDown' ? 1 : -1) + acResults.length) % acResults.length;
      box.querySelectorAll('[role=option]').forEach(function (li, i) { li.setAttribute('aria-selected', String(i === acActive)); });
      $('acSym').setAttribute('aria-activedescendant', 'acOpt' + acActive);
    } else if (e.key === 'Enter') { e.preventDefault(); acPick(acActive); }
    else if (e.key === 'Escape') { e.stopPropagation(); acShow([]); }
  }
  async function acPick(i) {
    var c = acResults[i]; if (!c) return;
    $('acSym').value = c.sym; $('acName').value = c.name; $('acCgId').value = c.id;
    acLogo = c.thumb && /^https:\/\//.test(c.thumb) ? c.thumb : null;
    acShow([]); acLink(c);
    $('acCmc').value = SamsamCoins.CMC_SLUGS[c.sym] || SamsamCoins.cmcGuess(c.name) || ''; acCmcCheck();
    $('acQty').focus();
    try {   // category suggestion from CoinGecko's own categories (you can still change it) + today's price
      var d = await coinInfo(c.id);
      if ($('acCgId').value !== c.id) return;
      var known = SamsamTaxonomy.categoryOf(c.sym, null), key = known !== 'other' ? known : categoryFrom(d.categories);
      if (key) { $('acCat').value = key; syncCatCustom($('acCat'), 'acCatCustomBox'); }
      if (d.usd > 0) { var el = $('acLinkedPrice'); if (el) el.textContent = ' · now ' + SamsamFmt.price(d.usd); }
    } catch (_) { /* category stays as chosen */ }
  }
  function acCmcCheck() {
    var v = $('acCmc').value, a = $('acCmcCheck');
    a.hidden = !v; if (v) a.href = 'https://coinmarketcap.com/currencies/' + encodeURIComponent(v) + '/';
  }
  function acLink(c) {
    var el = $('acLinked');
    if (!c) { el.hidden = true; el.innerHTML = ''; el.classList.remove('own'); acLogo = null; $('acCgId').value = ''; $('acCmc').value = ''; acCmcCheck(); return; }
    var own = held(c.sym);
    el.classList.toggle('own', !!own);
    el.innerHTML = own
      ? '★ <strong>' + E(c.sym) + '</strong> is already in your portfolio — saving adds this as a <strong>Buy</strong>.'
      : '✓ Linked to CoinGecko: <strong>' + E(c.name) + '</strong> (' + E(c.id) + ')<span id="acLinkedPrice"></span> — live price, logo, CoinMarketCap link, Liquidation Map and Price Prediction ready';
    el.hidden = false;
  }
  document.addEventListener('click', function (e) {
    var li = e.target.closest && e.target.closest('#acSuggest [role=option]');
    if (li) { acPick(+li.dataset.i); return; }
    if (!e.target.closest || !e.target.closest('.ac-find')) { if ($('acSuggest')) acShow([]); }
  });

  function openAddCoin(prefill) {
    if (!mount()) return;
    ['acSym', 'acName', 'acQty', 'acPrice', 'acFeeUsd', 'acCgId'].forEach(function (id) { $(id).value = ''; });
    acShow([]); acLink(null);
    var p = prefill && typeof prefill === 'object' ? prefill : null;
    var catSel = $('acCat');
    fillCatSelect(catSel, (p && p.cat) || 'layer1');
    $('acCatCustom').value = p && p.catLabel && SamsamTaxonomy.isCustom(p.cat) && catSel.value === 'other' ? p.catLabel : '';
    syncCatCustom(catSel, 'acCatCustomBox');
    $('acPreview').innerHTML = ''; $('acError').textContent = '';
    if (p && p.sym) {   // coming from a plan / a coin you picked elsewhere: already linked, just add the amount
      $('acSym').value = String(p.sym).toUpperCase(); $('acName').value = p.name || '';
      if (p.cgId) {
        acLink({ sym: $('acSym').value, name: p.name || p.sym, id: p.cgId });
        $('acCgId').value = p.cgId;
        acLogo = p.logoUrl && /^https:\/\//.test(p.logoUrl) ? p.logoUrl : null;
        coinInfo(p.cgId).then(function (d) { var el = $('acLinkedPrice'); if (d.usd > 0 && el && $('acCgId').value === p.cgId) el.textContent = ' · now ' + SamsamFmt.price(d.usd); }).catch(function () {});
      }
      $('acCmc').value = p.cmcSlug || SamsamCoins.CMC_SLUGS[$('acSym').value] || SamsamCoins.cmcGuess(p.name || '') || ''; acCmcCheck();
    }
    setOpen($('addCoinModal'), true);
    setTimeout(function () { focusFirst('acForm', p && p.sym ? 'acQty' : 'acSym'); }, 50);
  }
  // put the cursor in the first field — unless you've already started typing somewhere in the form
  function focusFirst(formId, fieldId) {
    var f = $(formId), a = document.activeElement;
    if (f && a && f.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;
    $(fieldId).focus();
  }
  function closeAddCoin() { var m = $('addCoinModal'); if (m) setOpen(m, false); }
  function previewAddCoin() {
    var qty = parseFloat($('acQty').value), price = parseFloat($('acPrice').value);
    var fee = Math.max(0, parseFloat($('acFeeUsd').value) || 0);
    $('acPreview').innerHTML = qty > 0 && price > 0 ? 'Cost Basis: <b>' + SamsamFmt.usd(qty * price + fee) + '</b>' : '';
  }
  function acErr(msg) { $('acError').textContent = msg; }
  async function applyAddCoin() {
    var sym = $('acSym').value.trim().toUpperCase();
    var qty = parseFloat($('acQty').value), price = parseFloat($('acPrice').value);
    acErr('');
    if (!sym) return acErr('Symbol is required.');
    if (!/^[A-Z0-9._-]{1,20}$/.test(sym)) return acErr('Pick the coin from the search list (or type only its symbol, e.g. XRP).');
    if (!qty || qty <= 0) return acErr('Enter a valid quantity.');
    if (!price || price <= 0) return acErr('Enter a valid buy price.');
    if (!requireCloud()) return;
    var feeUsd = Math.max(0, parseFloat($('acFeeUsd').value) || 0);
    if (held(sym)) {   // one Add button for everything: a coin you already hold gets this as a Buy
      if (!(await CPDialog.confirm(sym + ' is already in your portfolio.\nAdd ' + fmtQty(qty) + ' ' + sym + ' at ' + SamsamFmt.price(price) + ' as a Buy?', { title: 'Add as a Buy?', okText: 'Add Buy' }))) return;
      write(Samsam.addTx(sym, 'buy', qty, price, '', { date: new Date().toISOString(), fee: 0, feeUsd: feeUsd }));
      closeAddCoin(); emit('tx', { sym: sym, type: 'buy' }); return;
    }
    // A coin you removed earlier starts again from zero (Samsam.addCoin closes the old position); its past history stays
    var cgId = $('acCgId').value.trim().toLowerCase() || null;
    if (cgId && !/^[a-z0-9][a-z0-9-]{0,99}$/.test(cgId)) return acErr('CoinGecko ID looks wrong — pick the coin from the search list.');
    var cmcSlug = $('acCmc').value.trim() || null;
    if (cmcSlug && !/^[a-z0-9][a-z0-9-]{0,99}$/.test(cmcSlug)) return acErr('CoinMarketCap page: use lowercase letters, digits and dashes only.');
    if (!cgId && !SamsamCoins.CG_IDS[sym] && !(await CPDialog.confirm(sym + ' is not linked to CoinGecko, so it will have no live price or logo.\n\nTip: type its name in the Coin box and pick it from the list.', { title: 'Add without live price?', okText: 'Add anyway' }))) return;
    var name = $('acName').value.trim() || sym;
    var catCh = readCatChoice($('acCat'), 'acCatCustom'), cat = catCh.key;
    if (catCh.label) SamsamTaxonomy.register(cat, catCh.label);
    SamsamCoins.registerCoin(sym, { cmcSlug: cmcSlug, name: name });
    // One atomic cloud write: coin settings + its opening buy
    write(Samsam.addCoin({ sym: sym, name: name, cat: cat, catLabel: catCh.label, catLocked: true, cgId: cgId, cmcSlug: cmcSlug, logoUrl: acLogo }, { qty: qty, price: price, feeUsd: feeUsd }));
    linkCodex(sym, { cgId: cgId, name: name });
    closeAddCoin();
    if (cgId) fetchLogoAndPrice(sym, cgId);
    emit('coin', { sym: sym, name: name, cgId: cgId });
  }
  // Price Prediction: find the coin's CoinCodex page once and keep it on the coin (all devices use it)
  function linkCodex(sym, opts) {
    if (SamsamCoins.CC_SLUGS[sym]) return;
    SamsamCoins.findCcSlug(sym, opts).then(function (slug) { if (slug) write(Samsam.updateCoin(sym, { ccSlug: slug })); });
  }
  // Logo + live price of a new coin right away (the regular price refresh picks it up after that)
  async function fetchLogoAndPrice(sym, cgId) {
    try {
      var d = await coinInfo(cgId);
      if (d.logo) write(Samsam.updateCoin(sym, { logoUrl: d.logo }));
      if (d.usd > 0) { var m = {}; m[sym] = { usd: d.usd, ch24: d.ch24 }; Samsam.updatePrices(m); }
    } catch (_) { /* the next price refresh fills it */ }
  }

  // ── Add Transaction form (Buy / Sell / Transfer In / Transfer Out) ──
  var ATX = {
    buy:          { color: '#16a34a', qty: 'Amount bought', price: 'Price per coin (USD)', priceReq: true, fee: false,
                    hint: 'Raises your holdings and updates the average buy price.' },
    sell:         { color: '#dc2626', qty: 'Amount sold', price: 'Sell price per coin (USD)', priceReq: true, fee: false,
                    hint: 'Lowers your holdings at the current average cost and records realized profit/loss.' },
    transfer_in:  { color: '#2563eb', qty: 'Amount transferred in', price: 'Cost / value per coin at transfer (USD)', priceReq: true, fee: true,
                    hint: 'Coins arriving from outside this portfolio. The cost per coin goes into your average buy price (use your original purchase price, or 0 for mined/free coins). The fee is deducted from the amount received.' },
    transfer_out: { color: '#d97706', qty: 'Amount transferred out', price: '', priceReq: false, fee: true,
                    hint: 'Coins leaving this portfolio (e.g. to another wallet you don’t track). Average buy price is unchanged and no profit/loss is recorded. The fee is also deducted.' }
  };
  var atxType = 'buy', atxSaving = false, atxSym = null;
  function localDateTimeValue(d) { var p = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function openAddTx(type, sym) {
    if (!mount()) return;
    atxSym = sym || (API.defaultTxSym && API.defaultTxSym()) || null;
    if (!atxSym || !requireCloud()) return;
    var coin = held(atxSym);
    $('atxCoin').innerHTML = icon(atxSym, 24) + '<span>' + E(atxSym) + '</span><small>' + E(coinName(atxSym)) + (coin ? ' · holding ' + parseFloat(coin.qty.toFixed(8)) : '') + '</small>';
    ['atxQty', 'atxFee', 'atxNote'].forEach(function (id) { var el = $(id); el.value = ''; el.classList.remove('bad'); });
    $('atxDate').value = localDateTimeValue(new Date());
    $('atxDate').max = localDateTimeValue(new Date(Date.now() + 60e3));
    delete $('atxPrice').dataset.touched; delete $('atxDate').dataset.touched;
    setAddTxType(type || 'buy');
    setOpen($('atxBackdrop'), true);
    setTimeout(function () { focusFirst('atxForm', 'atxQty'); }, 50);
  }
  function closeAddTx() { var m = $('atxBackdrop'); if (m) setOpen(m, false); }
  function setAddTxType(t) {
    atxType = t; var cfg = ATX[t];
    document.querySelectorAll('.atx-types button').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.t === t)); });
    $('atxForm').style.setProperty('--atx-c', cfg.color);
    $('atxQtyLabel').textContent = cfg.qty;
    $('atxPriceRow').style.display = cfg.price ? '' : 'none';
    $('atxPriceLabel').textContent = cfg.price;
    $('atxFeeRow').style.display = cfg.fee ? '' : 'none';
    $('atxFeeUsdRow').style.display = (t === 'buy' || t === 'sell') ? '' : 'none';
    $('atxFeeUsdLabel').innerHTML = t === 'sell' ? 'Selling fee <small>(USD, optional — subtracted from Realized Profit)</small>' : 'Buying fee <small>(USD, optional — added to Cost Basis)</small>';
    $('atxFeeUnit').textContent = '(in ' + atxSym + ', optional)';
    $('atxHint').textContent = cfg.hint;
    var LB = window.SAMSAM_LABELS || { BUY: 'Buy', SELL: 'Sell', TRANSFER_IN: 'Transfer In', TRANSFER_OUT: 'Transfer Out' };
    $('atxSave').textContent = 'Add ' + { buy: LB.BUY, sell: LB.SELL, transfer_in: LB.TRANSFER_IN, transfer_out: LB.TRANSFER_OUT }[t];
    var coin = held(atxSym), pr = $('atxPrice');
    if (cfg.price && !pr.dataset.touched) pr.value = coin && coin.currentPrice ? fmtInput(coin.currentPrice) : '';
    previewAddTx();
  }
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.atx-types button'); if (b && b.closest('#atxForm')) setAddTxType(b.dataset.t); });
  document.addEventListener('input', function (e) { if (e.target && (e.target.id === 'atxPrice' || e.target.id === 'atxDate')) e.target.dataset.touched = '1'; });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if ($('atxBackdrop') && $('atxBackdrop').classList.contains('show')) closeAddTx();
    else if ($('catMgrModal') && $('catMgrModal').classList.contains('show')) closeCatManager();
    else if ($('catEditModal') && $('catEditModal').classList.contains('show')) closeCatEdit();
    else if ($('addCoinModal') && $('addCoinModal').classList.contains('show') && ($('acSuggest').hidden)) closeAddCoin();
  });
  // Validate + preview the result using the same ledger maths as the rest of the app
  function readAddTx() {
    var cfg = ATX[atxType], v = function (id) { return $(id).value.trim(); };
    var qty = parseFloat(v('atxQty')), price = cfg.price ? parseFloat(v('atxPrice')) : 0, fee = cfg.fee ? (parseFloat(v('atxFee')) || 0) : 0;
    var feeUsd = (atxType === 'buy' || atxType === 'sell') ? (parseFloat(v('atxFeeUsd')) || 0) : 0;
    // Date left as it was → the exact moment you save (even if the minute changed while the form was open), so the entry
    // always comes after what you just recorded. A date you picked (minute precision) → that minute, or "now" if it's this one.
    var dateStr = v('atxDate'), picked = !!$('atxDate').dataset.touched;
    var date = picked && dateStr ? new Date(dateStr) : new Date();
    if (!isNaN(date.getTime()) && Math.floor(date.getTime() / 60e3) >= Math.floor(Date.now() / 60e3)) date = new Date();
    var errs = {};
    if (!(qty > 0)) errs.atxQty = 'Enter a quantity greater than 0.';
    if (cfg.priceReq && !(price >= 0 && v('atxPrice') !== '')) errs.atxPrice = 'Enter a price (0 is allowed for free/mined coins).';
    if ((atxType === 'buy' || atxType === 'sell') && !(price > 0)) errs.atxPrice = 'Enter a price greater than 0.';
    if (fee < 0) errs.atxFee = 'Fee cannot be negative.';
    if (feeUsd < 0) errs.atxFeeUsd = 'Fee cannot be negative.';
    if (atxType === 'transfer_in' && qty > 0 && fee >= qty) errs.atxFee = 'Fee must be smaller than the amount transferred in.';
    if (isNaN(date.getTime())) errs.atxDate = 'Enter a valid date.';
    else if (dateStr && new Date(dateStr).getTime() > Date.now() + 60e3) errs.atxDate = 'Date cannot be in the future.';
    var after = null;
    if (!Object.keys(errs).length && state()) {   // replay the ledger with this transaction at its date
      var st = state(), doc = st.coins.find(function (c) { return c.sym === atxSym; });
      var t = { id: '__new__', sym: atxSym, type: atxType, qty: qty, price: price, fee: fee, feeUsd: feeUsd, date: date.toISOString(), createdAt: new Date().toISOString() };
      var all = st.transactions.filter(function (x) { return x.sym === atxSym; }).concat([t]).sort(Samsam.core.compareTx);
      var pos = { qty: doc && doc.opening ? doc.opening.qty : 0, avg: doc && doc.opening ? doc.opening.avg : 0 }, short = false;
      all.forEach(function (x) {
        var need = x.type === 'sell' ? x.qty : x.type === 'transfer_out' ? x.qty + (+x.fee || 0) : 0;
        if (need > pos.qty * (1 + 1e-9) + 1e-12 && (x.id === '__new__' || x.type !== 'adjust')) short = x.id === '__new__' ? 'new' : (short || 'later');
        var r = Samsam.core.applyTx(pos, x); pos = { qty: r.qty, avg: r.avg };
        if (x.id === '__new__') t._realized = r.realized;
      });
      if (short === 'new') errs.atxQty = (atxType === 'sell' ? 'You can’t sell' : 'You can’t transfer out') + ' more than you held on that date.';
      after = { qty: pos.qty, avg: pos.avg, realized: t._realized, short: short };
    }
    return { qty: qty, price: price, fee: fee, feeUsd: feeUsd, date: date, errs: errs, after: after };
  }
  function previewAddTx() {
    var r = readAddTx(), pv = $('atxPreview');
    ['atxQty', 'atxPrice', 'atxFee', 'atxFeeUsd', 'atxDate'].forEach(function (id) { $(id).classList.toggle('bad', !!r.errs[id] && $(id).value !== ''); });
    $('atxErr').textContent = '';
    if (!r.after) { pv.innerHTML = ''; return; }
    var usd = function (n) { return SamsamFmt.usd(n); }, q = function (n) { return fmtQty(n); }, lines = [];
    if (atxType === 'buy') lines.push('Total cost: <b>' + usd(r.qty * r.price + r.feeUsd) + '</b>' + (r.feeUsd > 0 ? ' <small>(' + usd(r.qty * r.price) + ' + fee ' + usd(r.feeUsd) + ')</small>' : ''));
    if (atxType === 'sell') lines.push('Proceeds: <b>' + usd(r.qty * r.price - r.feeUsd) + '</b>' + (r.feeUsd > 0 ? ' <small>(' + usd(r.qty * r.price) + ' − fee ' + usd(r.feeUsd) + ')</small>' : '') + (r.after.realized != null ? ' · ' + (r.after.realized >= 0 ? 'profit' : 'loss') + ' <b>' + usd(Math.abs(r.after.realized)) + '</b>' : ''));
    if (atxType === 'transfer_in') lines.push('Received after fee: <b>' + q(r.qty - r.fee) + ' ' + atxSym + '</b> · cost added <b>' + usd(r.qty * r.price) + '</b>');
    if (atxType === 'transfer_out') lines.push('Leaves portfolio incl. fee: <b>' + q(r.qty + r.fee) + ' ' + atxSym + '</b>');
    lines.push('Holdings after: <b>' + q(r.after.qty) + ' ' + atxSym + '</b> · ' + ((window.SAMSAM_LABELS && SAMSAM_LABELS.AVG_BUY_PRICE) || 'Avg. Buy Price') + ' <b>' + SamsamFmt.price(r.after.avg) + '</b>');
    if (r.after.short === 'later') lines.push('<span style="color:#f59e0b">⚠️ A later sell/transfer would then exceed your holdings.</span>');
    pv.innerHTML = lines.join('<br>');
  }
  function saveAddTx() {
    if (atxSaving) return;
    var r = readAddTx(), firstErr = Object.keys(r.errs)[0];
    if (firstErr) {
      $('atxErr').textContent = r.errs[firstErr];
      Object.keys(r.errs).forEach(function (id) { $(id).classList.add('bad'); });
      $(firstErr).focus(); return;
    }
    atxSaving = true; $('atxSave').disabled = true;
    var note = $('atxNote').value.trim(), sym = atxSym, type = atxType;
    // Saved instantly on this device and synced to the cloud; every screen recalculates from the ledger
    write(Samsam.addTx(sym, type, r.qty, r.price, note, { date: r.date.toISOString(), fee: r.fee, feeUsd: r.feeUsd }));
    setTimeout(function () { atxSaving = false; $('atxSave').disabled = false; }, 400);
    delete $('atxPrice').dataset.touched;
    $('atxFeeUsd').value = '';
    closeAddTx();
    emit('tx', { sym: sym, type: type });
  }

  // ── Change category ──
  var ceSym = null, ceOpts = {};
  function openCatEdit(sym, opts) {
    if (!mount()) return;
    sym = String(sym || '').toUpperCase(); ceOpts = opts || {};
    var c = held(sym); if (!c && !ceOpts.onSave) return;
    ceSym = sym;
    var T = SamsamTaxonomy, def = T.defaultOf(sym), cur = c ? (c.cat || 'other') : (ceOpts.current || def || 'other');
    if (!c && ceOpts.catLabel && T.isCustom(cur)) T.register(cur, ceOpts.catLabel);
    $('ceTitle').textContent = 'Category — ' + sym;
    $('ceCoin').innerHTML = icon(sym, 24, ceOpts.logoUrl) + '<span>' + E(sym) + '</span><small>' + E(coinName(sym) || ceOpts.name || '') + (c ? '' : ' · not owned yet — saved with your plan') + '</small>';
    var sel = $('ceCat');
    fillCatSelect(sel, cur);
    $('ceCustom').value = ''; syncCatCustom(sel, 'ceCustomBox'); ceDrawList();
    var reset = $('ceReset');
    reset.hidden = !(def && (c ? c.catLocked : cur !== def));
    if (def) reset.textContent = '↺ Use default (' + T.label(def) + ')';
    $('ceError').textContent = '';
    setOpen($('catEditModal'), true);
    setTimeout(function () { var on = document.querySelector('#ceList .ce-opt[aria-checked="true"]'); if (on) { on.focus(); on.scrollIntoView({ block: 'nearest' }); } }, 0);
  }
  // The dark list mirrors the (hidden) select: same options, same value
  function ceDrawList() {
    var sel = $('ceCat'), list = $('ceList'); if (!sel || !list) return;
    var T = SamsamTaxonomy, html = '', lastGroup = null;
    [].forEach.call(sel.options, function (o) {
      var g = o.parentNode && o.parentNode.tagName === 'OPTGROUP' ? o.parentNode.label : null;
      if (g !== lastGroup && g) html += '<div class="ce-group">' + E(g) + '</div>';
      lastGroup = g;
      var isNew = o.value === 'other';
      html += '<button type="button" role="radio" class="ce-opt' + (isNew ? ' ce-new' : '') + '" data-v="' + E(o.value) + '" aria-checked="' + (sel.value === o.value) + '" onclick="cePick(this.dataset.v)">' +
        (isNew ? '<span class="ce-dot" style="background:none;text-align:center;line-height:12px">＋</span><span class="ce-name">New category…</span>'
               : '<span class="ce-dot" style="background:' + T.color(o.value) + '"></span><span class="ce-name">' + E(o.textContent) + '</span>') +
        '<span class="ce-ck">✓</span></button>';
    });
    list.innerHTML = html;
  }
  function cePick(v) { var sel = $('ceCat'); sel.value = v; syncCatCustom(sel, 'ceCustomBox'); ceDrawList(); }

  // ── Manage Categories: rename, colour, add, delete (saved once in the cloud → every page and device) ──
  var cmOpenPal = null;
  function openCatManager() {
    if (!mount()) return;
    if (!window.Samsam || !Samsam.renameCategory) return;
    $('cmError').textContent = ''; cmOpenPal = null; cmDraw();
    setOpen($('catMgrModal'), true);
  }
  function closeCatManager() {
    var m = $('catMgrModal'); if (m) setOpen(m, false);
    if ($('catEditModal') && $('catEditModal').classList.contains('show')) { var v = $('ceCat').value; fillCatSelect($('ceCat'), v); syncCatCustom($('ceCat'), 'ceCustomBox'); ceDrawList(); }
  }
  function cmCounts() {
    var n = {}, T = SamsamTaxonomy, st = Samsam.getState ? Samsam.getState() : null;
    (st ? st.portfolio : []).forEach(function (c) { var k = c.cat || 'other'; n[k] = (n[k] || 0) + 1; });
    return n;
  }
  function cmDraw() {
    var T = SamsamTaxonomy, n = cmCounts(), list = $('cmList'); if (!list) return;
    var row = function (key, label, color, custom) {
      var changed = !custom && (label !== T.defaultLabel(key) || color !== T.defaultColor(key));
      var sub = (n[key] || 0) + ' coin' + ((n[key] || 0) === 1 ? '' : 's') + (changed ? ' · was “' + E(T.defaultLabel(key)) + '”' : '');
      var pal = T.PALETTE.filter(function (c, i, a) { return a.indexOf(c) === i; }).map(function (c) {
        return '<button type="button" style="background:' + c + '" aria-label="Colour ' + c + '" aria-pressed="' + (c === color) + '" onclick="cmColor(\'' + key + '\',\'' + c + '\')"></button>'; }).join('');
      return '<div class="cm-row" data-k="' + key + '">' +
        '<button type="button" class="cm-dot" style="background:' + color + '" title="Change colour" aria-label="Change the colour of ' + E(label) + '" onclick="cmPal(\'' + key + '\')"></button>' +
        '<div><div class="cm-name">' + E(label) + '</div><div class="cm-sub">' + sub + '</div></div>' +
        '<div class="cm-acts"><button type="button" class="cm-ren" title="Rename" aria-label="Rename ' + E(label) + '" onclick="cmRename(\'' + key + '\')">✏️</button>' +
          (custom ? '<button type="button" class="cm-del" title="Delete" aria-label="Delete ' + E(label) + '" onclick="cmDelete(\'' + key + '\')">🗑</button>'
                  : (changed ? '<button type="button" class="cm-reset" title="Back to the original name and colour" aria-label="Reset ' + E(label) + '" onclick="cmReset(\'' + key + '\')">↺</button>' : '')) + '</div>' +
        '<div class="cm-pal"' + (cmOpenPal === key ? '' : ' hidden') + '>' + pal + '</div></div>';
    };
    var mine = T.customs();
    list.innerHTML = '<div class="cm-group">Built-in</div>' +
      T.list.filter(function (c) { return c.key !== 'other'; }).map(function (c) { return row(c.key, c.label, c.color, false); }).join('') +
      '<div class="cm-group">Your Categories</div>' +
      (mine.length ? mine.map(function (c) { return row(c.key, c.label, c.color, true); }).join('') : '<div class="cm-note">None yet — tap ➕ New Category.</div>');
  }
  function cmDone(p) {
    $('cmError').textContent = '';
    return Promise.resolve(p).then(function () { cmDraw(); emit('cat', {}); }, function (e) { $('cmError').textContent = '⚠️ ' + ((e && e.message) || e); });
  }
  function cmPal(key) { cmOpenPal = cmOpenPal === key ? null : key; cmDraw(); }
  function cmColor(key, c) { cmOpenPal = null; if (!requireCloud()) return; cmDone(Samsam.recolorCategory(key, c)); }
  function cmRename(key) {
    if (!requireCloud()) return;
    var T = SamsamTaxonomy, cur = T.label(key);
    var ask = window.CPDialog ? CPDialog.prompt('New name for this category — every coin in it, every filter and chart follow.', { title: '✏️ Rename “' + cur + '”', value: cur, okText: 'Save' }) : Promise.resolve(window.prompt('New name', cur));
    ask.then(function (v) { if (v == null) return; v = String(v).trim(); if (!v || v === cur) return; cmDone(Samsam.renameCategory(key, v)); });
  }
  function cmReset(key) { if (!requireCloud()) return; cmDone(Samsam.resetCategory(key)); }
  function cmDelete(key) {
    if (!requireCloud()) return;
    var T = SamsamTaxonomy, n = cmCounts()[key] || 0, name = T.label(key);
    var msg = n ? 'Its ' + n + ' coin' + (n === 1 ? '' : 's') + ' go back to their default category.' : 'It has no coins.';
    var ask = window.CPDialog ? CPDialog.confirm(msg, { title: '🗑 Delete “' + name + '”?', okText: 'Delete', danger: true }) : Promise.resolve(window.confirm(msg));
    ask.then(function (ok) { if (ok) cmDone(Samsam.deleteCategory(key)); });
  }
  function cmNew() {
    if (!requireCloud()) return;
    var ask = window.CPDialog ? CPDialog.prompt('Name of the new category. Move coins into it with Change Category.', { title: '➕ New Category', value: '', okText: 'Create' }) : Promise.resolve(window.prompt('New category'));
    ask.then(function (v) { if (v == null) return; v = String(v).trim(); if (!v) return; cmDone(Samsam.createCategory(v)); });
  }
  function closeCatEdit() { var m = $('catEditModal'); if (m) setOpen(m, false); ceSym = null; }
  function saveCatEdit(useDefault) {
    if (!ceSym) return;
    var sym = ceSym, c = held(sym), T = SamsamTaxonomy, p, ch;
    if (c) {   // saved on the coin → every page shows the new category
      if (!requireCloud()) return;
      if (useDefault) p = Samsam.setCategory(sym, null);
      else { ch = readCatChoice($('ceCat'), 'ceCustom'); p = Samsam.setCategory(sym, ch.key, ch.label); }
    } else {   // not owned yet: the plan keeps it (and Add Coin starts from it on your first Buy)
      ch = useDefault ? { key: T.defaultOf(sym) || 'other', label: null } : readCatChoice($('ceCat'), 'ceCustom');
      if (T.isCustom(ch.key) && !ch.label) { $('ceError').textContent = '⚠️ Type a name for the category'; return; }
      if (ch.label) { ch.label = ch.label.slice(0, 40); T.register(ch.key, ch.label); }
      p = Promise.resolve(ceOpts.onSave(ch.key, ch.label));
    }
    p.then(function () { closeCatEdit(); emit('cat', { sym: sym }); }, function (e) { $('ceError').textContent = '⚠️ ' + ((e && e.message) || e); });
  }

  // Buy a coin: Add Transaction if you hold it, otherwise Add Coin ready with what we know about it
  function buy(sym, prefill) {
    sym = String(sym || '').toUpperCase(); if (!sym) return;
    if (held(sym)) openAddTx('buy', sym);
    else openAddCoin(Object.assign({ sym: sym }, prefill || {}));
  }

  var API = {
    openCoin: openAddCoin, closeCoin: closeAddCoin, openTx: openAddTx, closeTx: closeAddTx, buy: buy, editCategory: openCatEdit, manageCategories: openCatManager,
    search: search, coinInfo: coinInfo, categoryFrom: categoryFrom, linkCodex: linkCodex, fetchLogoAndPrice: fetchLogoAndPrice,
    fillCatSelect: fillCatSelect, syncCatCustom: syncCatCustom, readCatChoice: readCatChoice,
    on: function (k, fn) { if (hooks[k]) hooks[k].push(fn); }, defaultTxSym: null
  };
  window.CPAdd = API;
  // the names the pages (and inline handlers) already use
  var G = { openAddCoin: function () { openAddCoin(); }, closeAddCoin: closeAddCoin, previewAddCoin: previewAddCoin, applyAddCoin: applyAddCoin,
    acSearchInput: acSearchInput, acSearchKey: acSearchKey, acPick: acPick, acCmcCheck: acCmcCheck,
    openAddTx: openAddTx, closeAddTx: closeAddTx, setAddTxType: setAddTxType, readAddTx: readAddTx, previewAddTx: previewAddTx, saveAddTx: saveAddTx,
    fillCatSelect: fillCatSelect, syncCatCustom: syncCatCustom, readCatChoice: readCatChoice,
    openCatEdit: function (sym) { openCatEdit(sym); }, closeCatEdit: closeCatEdit, saveCatEdit: saveCatEdit,
    ceDrawList: ceDrawList, cePick: cePick, openCatManager: openCatManager, closeCatManager: closeCatManager,
    cmPal: cmPal, cmColor: cmColor, cmRename: cmRename, cmReset: cmReset, cmDelete: cmDelete, cmNew: cmNew };
  Object.keys(G).forEach(function (k) { window[k] = G[k]; });
  Object.defineProperty(window, 'atxSym', { get: function () { return atxSym; }, configurable: true });
})();
