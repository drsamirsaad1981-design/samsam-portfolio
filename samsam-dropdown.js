// samsam-dropdown.js — one custom dropdown used on mobile and desktop alike.
//   • Desktop: popover under the button, max-height 280px with scrolling
//   • Mobile (≤ 600px): bottom sheet with a dimmed backdrop
//   • Follows the app theme (dark cards in dark mode, light in light mode)
//   • Optional search box (filters by symbol and name)
//   • Keyboard: ↑ ↓ Home End to move, Enter to pick, Esc to close
//
// Usage:
//   const dd = SamsamDropdown.create(hostEl, {
//     options: [{ value, label, sub?, icon? (html) }], value, searchable, searchPlaceholder, maxHeight (desktop list, px),
//     ariaLabel, title (sheet title on mobile), onChange(value) });
//   dd.setOptions([...]); dd.setValue(v); dd.value; dd.open(); dd.close();
(function () {
  var css = document.createElement('style');
  css.textContent = [
    '.sdd{position:relative;display:inline-block}',
    '.sdd-btn{display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 12px;border-radius:10px;',
    '  background:var(--bg3,#1e293b);border:1px solid var(--border,#334155);color:var(--fg,#f1f5f9);',
    '  font:inherit;font-size:.88rem;font-weight:600;cursor:pointer;white-space:nowrap;-webkit-tap-highlight-color:transparent}',
    '.sdd-btn:hover{border-color:var(--fg2,#94a3b8)}',
    '.sdd-btn:focus-visible,.sdd.open .sdd-btn{border-color:#3b82f6;outline:none;box-shadow:0 0 0 3px rgba(59,130,246,.18)}',
    '.sdd-btn .sdd-chev{width:14px;height:14px;flex-shrink:0;opacity:.7;transition:transform .15s}',
    '.sdd.open .sdd-btn .sdd-chev{transform:rotate(180deg)}',
    '.sdd-ico{display:inline-flex;width:20px;height:20px;flex-shrink:0;align-items:center;justify-content:center}',
    '.sdd-ico img,.sdd-ico>div{width:20px!important;height:20px!important;font-size:.5rem!important}',
    '.sdd-ico[hidden]{display:none}',
    // panel (shared by popover + sheet)
    '.sdd-panel{position:fixed;z-index:100050;display:none;flex-direction:column;background:#1e293b;color:#f1f5f9;',
    '  border:1px solid #334155;border-radius:12px;box-shadow:0 18px 40px rgba(0,0,0,.45);overflow:hidden}',
    '[data-theme=light] .sdd-panel{background:#fff;color:#0f172a;border-color:#e2e8f0;box-shadow:0 18px 40px rgba(15,23,42,.18)}',
    '.sdd-panel.show{display:flex}',
    '.sdd-search{margin:8px;display:flex;align-items:center;gap:8px;padding:0 10px;height:38px;border-radius:9px;',
    '  background:rgba(255,255,255,.06);border:1px solid #334155}',
    '[data-theme=light] .sdd-search{background:#f1f5f9;border-color:#e2e8f0}',
    '.sdd-search:focus-within{border-color:#3b82f6}',
    '.sdd-search svg{width:16px;height:16px;opacity:.6;flex-shrink:0}',
    '.sdd-search input{flex:1;min-width:0;background:transparent;border:none;outline:none;color:inherit;font:inherit;font-size:.9rem}',
    '.sdd-search input::placeholder{color:#94a3b8}',
    '.sdd-list{list-style:none;margin:0;padding:4px;overflow-y:auto;overscroll-behavior:contain;max-height:280px}',
    '.sdd-opt{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer;font-size:.9rem;font-weight:600}',
    '.sdd-opt .sdd-sub{font-weight:500;font-size:.78rem;color:#94a3b8;margin-left:auto;padding-left:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.sdd-opt.active{background:rgba(59,130,246,.16)}',
    '[data-theme=light] .sdd-opt.active{background:#eff6ff}',
    '.sdd-opt[aria-selected=true]{color:#60a5fa}',
    '[data-theme=light] .sdd-opt[aria-selected=true]{color:#2563eb}',
    '.sdd-opt .sdd-check{width:16px;height:16px;margin-left:8px;flex-shrink:0;visibility:hidden}',
    '.sdd-opt[aria-selected=true] .sdd-check{visibility:visible}',
    '.sdd-opt .sdd-sub + .sdd-check{margin-left:8px}',
    '.sdd-opt:not(:has(.sdd-sub)) .sdd-check{margin-left:auto}',
    '.sdd-empty{padding:16px;text-align:center;color:#94a3b8;font-size:.85rem}',
    // mobile bottom sheet
    '.sdd-backdrop{position:fixed;inset:0;z-index:100049;background:rgba(2,6,23,.6);display:none}',
    '.sdd-backdrop.show{display:block}',
    '.sdd-panel.sheet{left:0!important;right:0!important;bottom:0!important;top:auto!important;width:auto!important;',
    '  border-radius:18px 18px 0 0;border-bottom:none;padding-bottom:env(safe-area-inset-bottom,0px);max-height:75vh}',
    '.sdd-panel.sheet .sdd-list{max-height:min(60vh,520px)}',
    '.sdd-panel.sheet .sdd-opt{padding:13px 12px;font-size:1rem}',
    '.sdd-sheet-head{display:none;align-items:center;justify-content:space-between;padding:14px 16px 4px;font-weight:700}',
    '.sdd-panel.sheet .sdd-sheet-head{display:flex}',
    '.sdd-sheet-head::before{content:"";position:absolute;top:6px;left:50%;width:36px;height:4px;margin-left:-18px;border-radius:2px;background:#475569}',
    '.sdd-close{background:none;border:none;color:inherit;font-size:1.4rem;line-height:1;cursor:pointer;padding:2px 6px;opacity:.7}',
    '@media (prefers-reduced-motion:no-preference){.sdd-panel.sheet.show{animation:sddUp .18s ease-out}}',
    '@keyframes sddUp{from{transform:translateY(24px);opacity:.6}to{transform:none;opacity:1}}'
  ].join('\n');
  (document.head || document.documentElement).appendChild(css);

  var CHEV = '<svg class="sdd-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  var CHECK = '<svg class="sdd-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>';
  var LENS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var openOne = null;
  var isSheet = function () { return window.matchMedia('(max-width: 600px)').matches; };

  function create(host, opts) {
    opts = opts || {};
    var id = 'sdd' + Math.random().toString(36).slice(2, 8);
    var state = { options: opts.options || [], value: opts.value, filtered: [], active: -1 };
    host.classList.add('sdd');
    host.innerHTML = '<button type="button" class="sdd-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="' + id +
      '"' + (opts.ariaLabel ? ' aria-label="' + esc(opts.ariaLabel) + '"' : '') + '><span class="sdd-ico" hidden></span><span class="sdd-label"></span>' + CHEV + '</button>';
    var btn = host.querySelector('.sdd-btn'), lbl = host.querySelector('.sdd-label'), ico = host.querySelector('.sdd-ico');
    var backdrop = document.createElement('div'); backdrop.className = 'sdd-backdrop';
    var panel = document.createElement('div'); panel.className = 'sdd-panel'; panel.setAttribute('data-sdd-for', host.id || id);
    panel.innerHTML = '<div class="sdd-sheet-head"><span>' + esc(opts.title || opts.ariaLabel || 'Select') + '</span><button type="button" class="sdd-close" aria-label="Close">×</button></div>' +
      (opts.searchable ? '<label class="sdd-search">' + LENS + '<input type="search" autocomplete="off" spellcheck="false" placeholder="' + esc(opts.searchPlaceholder || 'Search…') + '"></label>' : '') +
      '<ul class="sdd-list" role="listbox" id="' + id + '"></ul>';
    document.body.append(backdrop, panel);
    var list = panel.querySelector('.sdd-list'), search = panel.querySelector('.sdd-search input');

    function current() { for (var i = 0; i < state.options.length; i++) if (String(state.options[i].value) === String(state.value)) return state.options[i]; return null; }
    function paintButton() {
      var o = current();
      lbl.textContent = o ? o.label : (opts.placeholder || 'Select');
      if (o && o.icon) { ico.innerHTML = o.icon; ico.hidden = false; } else { ico.innerHTML = ''; ico.hidden = true; }
    }
    function renderList() {
      var q = search ? search.value.trim().toLowerCase() : '';
      // Rank: exact symbol → symbol starts with → symbol contains → name match (stable within each group)
      var rank = function (o) {
        var l = String(o.label).toLowerCase(), n = String(o.sub || '').toLowerCase();
        if (!q) return 0; if (l === q) return 1; if (l.indexOf(q) === 0) return 2; if (l.indexOf(q) >= 0) return 3;
        if (n.indexOf(q) === 0) return 4; if (n.indexOf(q) >= 0) return 5; return 0;
      };
      state.filtered = state.options.map(function (o, i) { return { o: o, r: rank(o), i: i }; })
        .filter(function (x) { return !q || x.r > 0; })
        .sort(function (a, b) { return (a.r - b.r) || (a.i - b.i); })
        .map(function (x) { return x.o; });
      if (!state.filtered.length) { list.innerHTML = '<li class="sdd-empty">No matches</li>'; state.active = -1; return; }
      list.innerHTML = state.filtered.map(function (o, i) {
        var sel = String(o.value) === String(state.value);
        return '<li class="sdd-opt" role="option" id="' + id + '-' + i + '" data-i="' + i + '" aria-selected="' + sel + '">' +
          (o.icon ? '<span class="sdd-ico">' + o.icon + '</span>' : '') + '<span>' + esc(o.label) + '</span>' +
          (o.sub ? '<span class="sdd-sub">' + esc(o.sub) + '</span>' : '') + CHECK + '</li>';
      }).join('');
      var si = -1; state.filtered.forEach(function (o, i) { if (String(o.value) === String(state.value)) si = i; });
      setActive(q ? 0 : Math.max(si, 0), true);
    }
    function setActive(i, center) {
      var items = list.querySelectorAll('.sdd-opt');
      if (!items.length) return;
      i = Math.max(0, Math.min(items.length - 1, i));
      if (items[state.active]) items[state.active].classList.remove('active');
      state.active = i; items[i].classList.add('active');
      (search || btn).setAttribute('aria-activedescendant', items[i].id);
      var it = items[i], top = it.offsetTop, bottom = top + it.offsetHeight;
      if (center) list.scrollTop = top - list.clientHeight / 2 + it.offsetHeight / 2;
      else if (top < list.scrollTop) list.scrollTop = top; else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
    }
    function place() {
      if (panel.classList.contains('sheet')) return;
      var r = btn.getBoundingClientRect(), w = Math.max(r.width, opts.minWidth || 220);
      var left = Math.min(r.left, window.innerWidth - w - 8);
      var below = window.innerHeight - r.bottom - 12, above = r.top - 12;
      var cap = opts.maxHeight || 280;
      list.style.maxHeight = cap + 'px';
      var chrome = panel.scrollHeight - list.offsetHeight;          // search box etc.
      var h = Math.min(panel.scrollHeight, cap + chrome);
      panel.style.width = w + 'px'; panel.style.left = Math.max(8, left) + 'px';
      var up = below < h && above > below;
      if (up) { panel.style.top = ''; panel.style.bottom = (window.innerHeight - r.top + 6) + 'px'; }
      else { panel.style.bottom = ''; panel.style.top = (r.bottom + 6) + 'px'; }
      // Fit the list to the space actually available; anything beyond scrolls
      var room = (up ? above : below) - chrome - 6;
      list.style.maxHeight = Math.max(120, Math.min(cap, room)) + 'px';
    }
    function open() {
      if (openOne && openOne !== api) openOne.close();
      openOne = api;
      var sheet = isSheet();
      panel.classList.toggle('sheet', sheet);
      panel.style.top = panel.style.bottom = panel.style.left = panel.style.width = ''; list.style.maxHeight = '';
      if (search) search.value = '';
      renderList();
      panel.classList.add('show'); backdrop.classList.toggle('show', sheet);
      host.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
      place();
      if (search && !sheet) search.focus(); else list.focus && panel.focus();
      var items = list.querySelectorAll('.sdd-opt'); if (items[state.active]) setActive(state.active, true);
    }
    function close(refocus) {
      if (!panel.classList.contains('show')) return;
      panel.classList.remove('show'); backdrop.classList.remove('show');
      host.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
      if (openOne === api) openOne = null;
      if (refocus) btn.focus();
    }
    function pick(i) {
      var o = state.filtered[i]; if (!o) return;
      var changed = String(o.value) !== String(state.value);
      state.value = o.value; paintButton(); close(true);
      if (changed && opts.onChange) opts.onChange(o.value);
    }
    function onKey(e) {
      var open_ = panel.classList.contains('show');
      if (!open_) { if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(state.active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(state.active - 1); }
      else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
      else if (e.key === 'End') { e.preventDefault(); setActive(1e9); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(state.active); }
      else if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); close(e.key === 'Escape'); }
    }
    btn.addEventListener('click', function () { panel.classList.contains('show') ? close(true) : open(); });
    btn.addEventListener('keydown', onKey);
    panel.addEventListener('keydown', onKey);
    panel.tabIndex = -1;
    if (search) search.addEventListener('input', renderList);
    list.addEventListener('mousemove', function (e) { var li = e.target.closest('.sdd-opt'); if (li && +li.dataset.i !== state.active) setActive(+li.dataset.i); });
    list.addEventListener('click', function (e) { var li = e.target.closest('.sdd-opt'); if (li) pick(+li.dataset.i); });
    backdrop.addEventListener('click', function () { close(false); });
    panel.querySelector('.sdd-close').addEventListener('click', function () { close(true); });
    document.addEventListener('pointerdown', function (e) { if (panel.classList.contains('show') && !panel.contains(e.target) && !host.contains(e.target)) close(false); }, true);
    window.addEventListener('resize', function () { if (panel.classList.contains('show')) { if (isSheet() !== panel.classList.contains('sheet')) close(false); else place(); } });
    window.addEventListener('scroll', function (e) { if (panel.classList.contains('show') && !panel.contains(e.target)) place(); }, true);

    var api = {
      get value() { return state.value; },
      setValue: function (v) { state.value = v; paintButton(); if (panel.classList.contains('show')) renderList(); },
      setOptions: function (o) { state.options = o || []; paintButton(); if (panel.classList.contains('show')) renderList(); },
      open: open, close: close, button: btn, panel: panel,
    };
    paintButton();
    return api;
  }
  window.SamsamDropdown = { create: create };
})();
