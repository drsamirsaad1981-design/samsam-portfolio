// samsam-ui.js — shared UI pieces used by every page, so they look and behave the same:
//   • theme (dark / light): applied before first paint, one toggle style, synced across tabs
//   • the green "Live" status dot
//   • icons (calendar, sun, moon) as inline SVG — identical on every device, unlike emoji;
//     add data-icon="calendar" to any element to prefix it with that icon
// Load it in <head> WITHOUT defer/async: <script src="samsam-ui.js"></script>
(function () {
  var KEY = 'samsam_theme';
  var svg = function (body) {
    return '<svg class="ss-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';
  };
  var ICONS = {
    // Calendar outline with a plain grid — deliberately no printed day number.
    calendar: svg('<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>' +
      '<path d="M7.5 13.5h.01M12 13.5h.01M16.5 13.5h.01M7.5 17h.01M12 17h.01" stroke-width="2.6"/>'),
    moon: svg('<path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z"/>'),
    // One pencil for every "edit" in the app (category, manual price, opening position, Edit entries) — no box around it
    pencil: '<svg class="ss-pencil" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    sun: svg('<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/>'),
  };

  function saved() {
    try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'; } catch (e) { return 'dark'; }
  }
  function current() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }
  // Every theme button shows the CURRENT theme (moon = dark, sun = light); tapping switches it.
  function paintButtons() {
    var t = current();
    var label = t === 'dark' ? 'Dark mode on — switch to light mode' : 'Light mode on — switch to dark mode';
    var btns = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      b.innerHTML = t === 'dark' ? ICONS.moon : ICONS.sun;
      b.setAttribute('title', label);
      b.setAttribute('aria-label', label);
      b.setAttribute('data-current-theme', t);
    }
  }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
    paintButtons();
    try { window.dispatchEvent(new CustomEvent('samsam-theme', { detail: current() })); } catch (e) {}
  }
  function toggleTheme() {
    var next = current() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch (e) {}
    applyTheme(next);
  }

  // Live status dot. state: 'ok' (green), 'loading' (amber pulse), 'error' (red), 'idle' (grey)
  // pulse=true adds a soft expanding ring (used where the dot marks a live feed, e.g. the BTC ticker)
  function liveDot(state, pulse) {
    return '<span class="ss-live' + (pulse ? ' ss-pulse' : '') + '" data-state="' + (state || 'ok') + '" aria-hidden="true"></span>';
  }

  // Apply the saved theme immediately (this file runs in <head>, before the page paints).
  document.documentElement.setAttribute('data-theme', saved());

  var css = document.createElement('style');
  css.id = 'samsam-ui-css';
  css.textContent =
    '.ss-icon{display:inline-block;width:1.15em;height:1.15em;flex-shrink:0;vertical-align:-0.2em}' +
    // Theme toggle — one size and style on every page
    '.ss-theme-btn{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;min-width:36px;padding:0;' +
      'border-radius:10px;border:1px solid var(--border,rgba(148,163,184,.35));background:var(--bg3,var(--card,transparent));' +
      'color:var(--fg,currentColor);cursor:pointer;font:inherit;line-height:1;flex-shrink:0;transition:background .15s,border-color .15s,color .15s;' +
      '-webkit-tap-highlight-color:transparent}' +
    '@media (hover:hover){.ss-theme-btn:hover{background:var(--border,rgba(148,163,184,.25))}}' +
    '.ss-theme-btn:focus-visible{outline:2px solid #3b82f6;outline-offset:2px}' +
    '.ss-theme-btn .ss-icon{width:18px;height:18px;vertical-align:0}' +
    // Live dot — same green everywhere, regardless of each page's own colour variables
    '.ss-live{display:inline-block;width:8px;height:8px;border-radius:50%;flex-shrink:0;vertical-align:middle;background:#94a3b8}' +
    '.ss-live[data-state=ok]{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.18)}' +
    '[data-theme=light] .ss-live[data-state=ok]{background:#16a34a;box-shadow:0 0 0 3px rgba(22,163,74,.16)}' +
    '.ss-live[data-state=loading]{background:#f59e0b;animation:ssLivePulse 1s ease-in-out infinite}' +
    '.ss-live[data-state=error]{background:#ef4444}' +
    '.ss-live-label{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}' +
    '.ss-date-label{display:inline-flex;align-items:center;gap:6px}' +
    '@keyframes ssLivePulse{0%,100%{opacity:1}50%{opacity:.35}}' +
    '.ss-live.ss-pulse[data-state=ok]{animation:ssLiveRing 2s ease-out infinite}' +
    '@keyframes ssLiveRing{0%{box-shadow:0 0 0 0 rgba(34,197,94,.55)}70%{box-shadow:0 0 0 7px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}' +
    '@media (prefers-reduced-motion:reduce){.ss-live[data-state=loading],.ss-live.ss-pulse{animation:none}}' +
    // Under every chart while its real price history is still downloading (samsam-history.js)
    '.hist-note{margin:6px 2px 0;font-size:.74rem;font-weight:600;color:var(--fg2,#94a3b8);display:flex;align-items:center;gap:6px;line-height:1.35}.hist-note[hidden]{display:none}' +
    '.hist-note::before{content:"";width:10px;height:10px;flex-shrink:0;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:histSpin .9s linear infinite}' +
    '@keyframes histSpin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.hist-note::before{animation:none}}' +
    // ➕ Add — one button on every page (main toolbar, Holdings, a coin's Transactions, Accumulation):
    // brand-violet gradient, the + in a soft chip (like Back's chevron), lifts on hover, presses in on tap.
    // .sm = 36px (page header, next to Back) · .cp-add-iconly = square icon button (phone toolbar)
    '.cp-add{display:inline-flex;align-items:center;justify-content:center;gap:8px;box-sizing:border-box;height:40px;padding:0 16px 0 6px;flex-shrink:0;border:none;border-radius:12px;' +
      'background:linear-gradient(135deg,#8b5cf6 0%,#7c3aed 55%,#6d28d9 100%);color:#fff;font:inherit;font-size:.88rem;font-weight:700;letter-spacing:.01em;line-height:1;white-space:nowrap;' +
      'cursor:pointer;-webkit-tap-highlight-color:transparent;box-shadow:0 4px 14px rgba(124,58,237,.32),inset 0 1px 0 rgba(255,255,255,.18);transition:transform .12s,box-shadow .2s,filter .2s}' +
    '.cp-add-ic{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex-shrink:0;border-radius:9px;background:rgba(255,255,255,.2);transition:transform .25s}' +
    '@media (hover:hover){.cp-add:hover{filter:brightness(1.08);transform:translateY(-1px);box-shadow:0 8px 22px rgba(124,58,237,.42),inset 0 1px 0 rgba(255,255,255,.22)}.cp-add:hover .cp-add-ic{transform:rotate(90deg)}}' +
    '.cp-add:active{transform:scale(.96);box-shadow:0 2px 8px rgba(124,58,237,.3)}' +
    '.cp-add:focus-visible{outline:2px solid #c4b5fd;outline-offset:2px}' +
    '[data-theme=light] .cp-add{box-shadow:0 4px 12px rgba(124,58,237,.25),inset 0 1px 0 rgba(255,255,255,.22)}' +
    '.cp-add.sm{height:36px;padding:0 13px 0 4px;gap:7px;font-size:.84rem;border-radius:10px}.cp-add.sm .cp-add-ic{width:28px;height:28px;border-radius:8px}' +
    '.cp-add.cp-add-iconly{padding:0;gap:0;width:44px}.cp-add.cp-add-iconly .cp-add-ic{background:transparent;width:auto;height:auto}.cp-add.cp-add-iconly .cp-add-ic svg{width:20px;height:20px}' +
    '@media (prefers-reduced-motion:reduce){.cp-add,.cp-add-ic{transition:none}.cp-add:hover,.cp-add:active{transform:none}.cp-add:hover .cp-add-ic{transform:none}}' +
    // Table · Cards switch — one look on every page that has both views (main page, Accumulation).
    // Compact under 768px, roomier above; the view on screen is lit (.btn-toggle-active).
    '.cp-vseg{display:inline-grid;grid-template-columns:1fr 1fr;flex:0 0 auto;box-sizing:border-box;background:var(--bg3);border:1px solid var(--border);border-radius:9px;padding:2px;gap:2px}' +
    '.cp-vseg>button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:7px 10px;border-radius:7px;' +
      'font:inherit;font-size:.78rem;font-weight:600;line-height:1.2;white-space:nowrap;color:var(--fg);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .15s,color .15s}' +
    '@media (hover:hover){.cp-vseg>button:not(.btn-toggle-active):hover{background:var(--border)}}' +
    '.cp-vseg>button.btn-toggle-active{background:var(--accent);color:#000;box-shadow:0 1px 3px rgba(0,0,0,.25)}' +
    '.cp-vseg>button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}' +
    '@media (min-width:768px){.cp-vseg{min-width:240px;border-radius:10px;padding:3px;gap:3px}.cp-vseg>button{padding:9px 12px;font-size:.82rem;border-radius:8px}}' +
    // Back button — one look on every page: same height and corners as the theme button, a purple chevron chip
    '.cp-back{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px 0 5px;box-sizing:border-box;flex-shrink:0;border-radius:10px;' +
      'border:1px solid var(--border,rgba(148,163,184,.35));background:var(--bg3,var(--card,transparent));color:var(--fg,currentColor);' +
      'font:inherit;font-size:.86rem;font-weight:700;letter-spacing:.01em;line-height:1;text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent;' +
      'transition:background .15s,border-color .15s,color .15s,transform .12s}' +
    '.cp-back-ic{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;background:rgba(124,58,237,.16);color:#a78bfa;transition:background .15s,color .15s}' +
    '.cp-back-ic svg{transition:transform .15s}' +
    '[data-theme=light] .cp-back-ic{background:rgba(124,58,237,.10);color:#6d28d9}' +
    '@media (hover:hover){.cp-back:hover{border-color:rgba(124,58,237,.5)}.cp-back:hover .cp-back-ic{background:#7c3aed;color:#fff}.cp-back:hover .cp-back-ic svg{transform:translateX(-2px)}}' +
    '.cp-back:active{transform:scale(.96)}.cp-back:active .cp-back-ic{background:#7c3aed;color:#fff}' +
    '.cp-back:focus-visible{outline:2px solid #a78bfa;outline-offset:2px}' +
    '@media (prefers-reduced-motion:reduce){.cp-back:active{transform:none}.cp-back:hover .cp-back-ic svg{transform:none}}' +
    // Page header — one bar for every inner page: Back on the left, title centred, page status on the right.
    // Frosted, sticky, respects the notch. (Theme + cloud live only on the main page.)
    '.cp-head{position:sticky;top:0;z-index:60;display:grid;grid-template-columns:1fr minmax(0,auto) 1fr;align-items:center;column-gap:10px;box-sizing:border-box;min-height:60px;' +
      'padding:max(10px,env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) 10px max(16px,env(safe-area-inset-left,0px));' +
      'background:color-mix(in srgb,var(--header-bg,var(--bg,#0b0f17)) 80%,transparent);-webkit-backdrop-filter:saturate(1.6) blur(16px);backdrop-filter:saturate(1.6) blur(16px);' +
      'border-bottom:1px solid var(--border,rgba(148,163,184,.2));transition:box-shadow .2s}' +
    '.cp-head.scrolled{box-shadow:0 6px 18px rgba(2,6,23,.12)}' +
    // 1fr | title | 1fr: the title is exactly centred whenever it fits, and only slides over when space runs out
    '.cp-head-l{justify-self:start;display:flex;align-items:center}' +
    '.cp-head-r{justify-self:end;display:flex;align-items:center;justify-content:flex-end;gap:8px}' +
    '.cp-head-title{margin:0;display:flex;align-items:center;justify-content:center;gap:8px;min-width:0;font:inherit;font-size:1.02rem;font-weight:800;letter-spacing:-.01em;line-height:1.2;color:var(--fg,inherit);white-space:nowrap}' +
    '.cp-head-title .t{overflow:hidden;text-overflow:ellipsis}.cp-head-ic{font-size:1.1rem;line-height:1;flex-shrink:0}' +
    '@media (min-width:768px){.cp-head{padding-left:max(24px,env(safe-area-inset-left,0px));padding-right:max(24px,env(safe-area-inset-right,0px))}}' +
    '@media (max-width:380px){.cp-head-title{font-size:.95rem}.cp-head{column-gap:8px}}' +
    '@media print{.ss-theme-btn,.cp-back,.cp-head{display:none!important}}';
  (document.head || document.documentElement).appendChild(css);

  // Wire up buttons once the page exists; keep tabs in sync when the theme changes elsewhere.
  function init() {
    var btns = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < btns.length; i++) {
      if (!btns[i].__ssBound) { btns[i].__ssBound = true; btns[i].addEventListener('click', toggleTheme); }
    }
    // Any element with data-icon="calendar" (etc.) gets that shared icon in front of its text.
    var tagged = document.querySelectorAll('[data-icon]');
    for (var j = 0; j < tagged.length; j++) {
      var el = tagged[j];
      if (!el.__ssIcon && ICONS[el.getAttribute('data-icon')]) { el.__ssIcon = true; el.insertAdjacentHTML('afterbegin', ICONS[el.getAttribute('data-icon')]); }
    }
    paintButtons();
  }
  // Header gets a soft shadow once the page scrolls under it
  // (the page itself, or a full-screen view that scrolls on its own such as Holdings)
  document.addEventListener('scroll', function (e) {
    var box = e.target === document ? document.scrollingElement : e.target;
    if (!box || !box.querySelectorAll) return;
    var h = box.querySelectorAll('.cp-head'); if (!h.length) return;
    var y = box.scrollTop > 4;
    for (var i = 0; i < h.length; i++) if (h[i].classList.contains('scrolled') !== y) h[i].classList.toggle('scrolled', y);
  }, { capture: true, passive: true });
  // Back: return to the page you came from inside the app (keeps its scroll and filters);
  // opened directly (bookmark, new tab)? then go to the link's own target (the main page).
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('a.cp-back[data-back]');
    if (!b || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var same = false; try { same = !!document.referrer && new URL(document.referrer).origin === location.origin && new URL(document.referrer).pathname !== location.pathname; } catch (_) {}
    if (same && history.length > 1) { e.preventDefault(); history.back(); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.addEventListener('storage', function (e) { if (e.key === KEY) applyTheme(saved()); });

  // One USD formatter for every money amount in the app: thousands separators + exactly 2 decimals.
  // (Unit prices of sub-$1 coins keep extra decimals elsewhere — $0.0004 can't be shown as $0.00.)
  var usdFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // ── Dark mode: ONE palette for every page and window (the deep navy / midnight violet of the main header) ──
  // Every page's own colour names (--bg, --bg2, --bg3, --card, --card-solid, --metric-bg, --border, --header-bg) are set
  // from these tokens, so Main, Holdings / Transactions, Performance, Allocation, Accumulation, Recover and every
  // window look like one app. Light mode is unchanged.
  (function darkTheme() {
    if (document.getElementById('cpThemeCss')) return;
    var st = document.createElement('style'); st.id = 'cpThemeCss';
    var D = 'html:root[data-theme="dark"]:not([data-theme-lock])';
    st.textContent =
      // Midnight Indigo — the main header's gradient (navy → deep indigo → midnight blue, 135°) behind every page.
      // Cards are see-through like the header's own cards, so the flow of colour shows through everywhere;
      // windows, menus and sticky headers stay solid so text never mixes with what's behind them.
      D + '{--mi-navy:#0a0e1a;--mi-indigo:#1a1040;--mi-blue:#0a2040;' +
        '--bg-app:#0e0d21;--bg-app-gradient:linear-gradient(135deg,#0a0e1a 0%,#1a1040 50%,#0a2040 100%);' +
        '--bg-card:#161339;--bg-card-secondary:#1e1b40;--border-card:rgba(255,255,255,.08);' +
        '--accent-primary:#7c3aed;--accent-glow:rgba(124,58,237,.35);' +
        '--bg:#0e0d21;--bg2:rgba(255,255,255,.045);--card:rgba(255,255,255,.045);--bg3:rgba(255,255,255,.07);' +
        '--card-solid:#161339;--metric-bg:rgba(4,6,22,.38);--border:rgba(255,255,255,.08);--header-bg:rgba(13,14,38,.72);background:#0a0e1a}' +
      // the gradient stays put while the page scrolls (a fixed layer behind everything — works on phones too)
      'html[data-theme="dark"] body{background:transparent;min-height:100vh}' +
      'html[data-theme="dark"] body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:var(--bg-app-gradient)}' +
      // Holdings / Transactions screen: same gradient, fixed behind its scrolling content
      'html[data-theme="dark"] #holdingsOverlay{--bg:#0e0d21;--bg2:rgba(255,255,255,.045);--card:rgba(255,255,255,.045);--bg3:rgba(255,255,255,.07);' +
        '--border:rgba(255,255,255,.08);--header-bg:rgba(13,14,38,.72);background:#0a0e1a var(--bg-app-gradient) no-repeat !important;background-attachment:scroll !important}' +
      // solid where something sits on top of other content
      'html[data-theme="dark"] .modal,html[data-theme="dark"] #samsamSyncPill,html[data-theme="dark"] #samsamSyncMenu,' +
        'html[data-theme="dark"] .sum{background:var(--card-solid) !important}' +
      'html[data-theme="dark"] thead,html[data-theme="dark"] thead th{background:#141238 !important}' +
      // loading screen
      'html[data-theme="dark"] #cpSplash{background:#0a0e1a var(--bg-app-gradient) !important}';
    (document.head || document.documentElement).appendChild(st);
    var m = document.querySelector('meta[name="theme-color"]');
    function bar() { if (m) m.setAttribute('content', document.documentElement.getAttribute('data-theme') === 'light' ? '#f0f4f8' : '#0d0f22'); }
    bar(); window.addEventListener('samsam-theme', bar);
  })();
  // Charts: "Building from real prices… 7 / 20 coins" while samsam-history.js downloads the price history
  window.addEventListener('samsam-history', function (e) {
    var d = e.detail || {}, busy = !!d.building && d.total > 0 && d.done < d.total;   // the hourly refresh of the last 2 days stays silent
    var txt = busy ? 'Building charts from real prices… ' + d.done + ' / ' + d.total + ' coins' + (d.waiting ? ' · CoinGecko is busy, waiting a moment' : '') : '';
    document.querySelectorAll('[data-hist-note]').forEach(function (n) { n.hidden = !busy; n.textContent = txt; });
  });
  window.SamsamFmt = {
    usd: function (n) { n = +n || 0; var a = Math.abs(n); if (a > 0 && a < 0.005) return (n < 0 ? '-' : '') + '<$0.01'; return (n < 0 && a >= 0.005 ? '-' : '') + '$' + usdFmt.format(a); },
    usdSigned: function (n) { n = +n || 0; return (n >= 0 ? '+' : '-') + window.SamsamFmt.usd(Math.abs(n)); },
    // Unit price / average price, one rule everywhere:
    // >= $10 → 2 decimals ($82,577.00) · $0.01–$10 → 4 decimals ($4.7450, $1.0188) · < $0.01 → 4 significant digits ($0.0006003)
    price: function (n) {
      n = +n || 0; var a = Math.abs(n), s = n < 0 ? '-' : '';
      if (a === 0) return '$0.00';
      if (a >= 10) return s + '$' + usdFmt.format(a);
      if (a >= 0.01) return s + '$' + a.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
      // 4 significant digits written out in full (never 1.000e-8), up to 18 decimals
      var d = Math.min(18, 3 - Math.floor(Math.log10(a)));
      return s + '$' + a.toFixed(d).replace(/(\.\d*?[1-9])0+$/, '$1');
    },
    num2: function (n) { return usdFmt.format(+n || 0); },
  };
  // ── In-app dialogs (replace the browser's alert / confirm / prompt, which show the website address
  //    "…github.io says" as their title). Same look on every page; titled "Cute Portfolio".
  //    CPDialog.alert(msg, opts) · CPDialog.confirm(msg, opts) → true/false · CPDialog.prompt(msg, opts) → text/null
  //    opts: { title, okText, cancelText, danger, value, placeholder, inputMode }
  var dlgCss = false;
  function dialog(kind, msg, o) {
    o = o || {};
    if (typeof window.__cpAutoAnswer === 'function') {   // automated tests only
      return Promise.resolve(window.__cpAutoAnswer(kind, String(msg), o));
    }
    if (!dlgCss) {
      dlgCss = true;
      var st = document.createElement('style');
      st.textContent = '#cpDialog{position:fixed;inset:0;z-index:100150;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(2,6,23,.62);animation:cpFade .15s ease}' +
        '#cpDialog .cpd{width:min(400px,100%);background:var(--card-solid,var(--bg2,#111827));color:var(--fg,#e5e7eb);border:1px solid var(--border,#334155);border-radius:16px;padding:20px;box-shadow:0 22px 50px rgba(0,0,0,.45);font-family:inherit;animation:cpPop .18s ease}' +
        '#cpDialog .cpd-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}#cpDialog .cpd-head img{width:28px;height:28px}' +
        '#cpDialog h3{margin:0;font-size:1rem;font-weight:700}#cpDialog p{margin:0;white-space:pre-line;line-height:1.5;font-size:.9rem;color:var(--fg2,#cbd5e1)}' +
        '#cpDialog input{width:100%;box-sizing:border-box;height:44px;margin-top:12px;padding:0 12px;border-radius:10px;border:1px solid var(--border,#334155);background:var(--bg3,#1f2937);color:inherit;font:inherit}' +
        '#cpDialog input:focus{outline:none;border-color:#3b82f6}#cpDialog .cpd-btns{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}#cpDialog .cpd-btns.one{grid-template-columns:1fr}' +
        '#cpDialog button{height:44px;border-radius:10px;border:1px solid var(--border,#334155);background:var(--metric-bg,#1f2937);color:var(--fg,#e5e7eb);font:inherit;font-weight:700;cursor:pointer}' +
        '#cpDialog .cpd-ok{background:linear-gradient(135deg,#7c3aed,#6d28d9);border-color:#6d28d9;color:#fff}#cpDialog .cpd-ok.danger{background:#dc2626;border-color:#dc2626}' +
        '#cpDialog button:focus-visible{outline:3px solid #a78bfa;outline-offset:2px}' +
        '@keyframes cpFade{from{opacity:0}}@keyframes cpPop{from{transform:scale(.96);opacity:0}}@media (prefers-reduced-motion:reduce){#cpDialog,#cpDialog .cpd{animation:none}}';
      document.head.appendChild(st);
    }
    return new Promise(function (resolve) {
      var prev = document.getElementById('cpDialog'); if (prev) prev.remove();
      var back = document.activeElement;
      var w = document.createElement('div'); w.id = 'cpDialog';
      w.innerHTML = '<div class="cpd" role="' + (kind === 'alert' ? 'alertdialog' : 'dialog') + '" aria-modal="true" aria-labelledby="cpdT" aria-describedby="cpdM">' +
        '<div class="cpd-head"><img src="./logo-mark.svg?v=1" alt=""><h3 id="cpdT"></h3></div><p id="cpdM"></p>' +
        (kind === 'prompt' ? '<input id="cpdI" autocomplete="off">' : '') +
        '<div class="cpd-btns' + (kind === 'alert' ? ' one' : '') + '">' + (kind === 'alert' ? '' : '<button type="button" class="cpd-no"></button>') + '<button type="button" class="cpd-ok"></button></div></div>';
      w.querySelector('#cpdT').textContent = o.title || 'Cute Portfolio';
      w.querySelector('#cpdM').textContent = String(msg);
      var ok = w.querySelector('.cpd-ok'), no = w.querySelector('.cpd-no'), inp = w.querySelector('#cpdI');
      ok.textContent = o.okText || 'OK'; if (o.danger) ok.classList.add('danger');
      if (no) no.textContent = o.cancelText || 'Cancel';
      if (inp) { inp.value = o.value == null ? '' : String(o.value); if (o.placeholder) inp.placeholder = o.placeholder; if (o.inputMode) inp.inputMode = o.inputMode; }
      var done = function (v) { document.removeEventListener('keydown', key, true); w.remove(); try { back && back.focus && back.focus(); } catch (_) {} resolve(v); };
      var yes = function () { done(kind === 'prompt' ? inp.value : true); }, cancel = function () { done(kind === 'prompt' ? null : kind === 'alert' ? undefined : false); };
      var key = function (e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
        else if (e.key === 'Enter' && (kind === 'prompt' || document.activeElement === ok || document.activeElement === document.body)) { e.preventDefault(); yes(); }
        else if (e.key === 'Tab') { var f = [inp, no, ok].filter(Boolean), i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus(); }
      };
      ok.onclick = yes; if (no) no.onclick = cancel;
      w.addEventListener('click', function (e) { if (e.target === w) cancel(); });
      document.addEventListener('keydown', key, true);
      document.body.appendChild(w);
      setTimeout(function () { (inp || (o.danger && no) || ok).focus(); if (inp) inp.select(); }, 0);
    });
  }
  // ── Action menu ("⋯" on coin cards / table rows) ──
  //    Desktop: small popover under the button · Phone (≤ 600px): bottom sheet with a dimmed backdrop.
  //    CPMenu.open(anchorButton, title, items) — items: { label, icon, onClick | href, danger, divider }
  var menuCss = false, menuOpen = null;
  function closeMenu(refocus) {
    if (!menuOpen) return;
    var m = menuOpen; menuOpen = null;
    document.removeEventListener('keydown', m.key, true); window.removeEventListener('resize', m.close); window.removeEventListener('scroll', m.onScroll, true);
    m.el.remove(); m.back.remove(); m.anchor.setAttribute('aria-expanded', 'false');
    if (refocus) try { m.anchor.focus(); } catch (_) {}
  }
  function openMenu(anchor, title, items) {
    if (menuOpen && menuOpen.anchor === anchor) { closeMenu(true); return; }
    closeMenu(false);
    if (!menuCss) {
      menuCss = true;
      var st = document.createElement('style');
      st.textContent = '.cpm-back{position:fixed;inset:0;z-index:100140;background:transparent}.cpm-back.sheet{background:rgba(2,6,23,.6);animation:cpFade .15s ease}' +
        '.cpm{position:fixed;z-index:100141;min-width:220px;max-width:calc(100vw - 16px);background:var(--card-solid,var(--bg2,#111827));color:var(--fg,#e5e7eb);border:1px solid var(--border,#334155);border-radius:12px;box-shadow:0 18px 40px rgba(0,0,0,.45);padding:6px;animation:cpPop .14s ease}' +
        '.cpm.sheet{left:0!important;right:0!important;bottom:0!important;top:auto!important;width:auto;max-width:none;border-radius:18px 18px 0 0;padding:8px 10px calc(10px + env(safe-area-inset-bottom,0px));animation:cpSheet .2s ease}' +
        '.cpm-title{display:none;padding:10px 8px 6px;font-weight:700;font-size:.95rem}.cpm.sheet .cpm-title{display:block}' +
        '.cpm.sheet::before{content:"";display:block;width:36px;height:4px;border-radius:2px;background:#475569;margin:2px auto 4px}' +
        '.cpm-item{display:flex;align-items:center;gap:10px;width:100%;min-height:40px;padding:0 10px;border:none;border-radius:8px;background:none;color:inherit;font:inherit;font-size:.9rem;font-weight:600;text-align:left;text-decoration:none;cursor:pointer;box-sizing:border-box}' +
        '.cpm.sheet .cpm-item{min-height:48px;font-size:1rem}.cpm-item:hover,.cpm-item:focus-visible{background:rgba(59,130,246,.14);outline:none}' +
        '.cpm-item .cpm-ic{width:22px;text-align:center;flex-shrink:0}.cpm-item .cpm-ext{margin-left:auto;color:var(--fg2,#94a3b8);font-size:.8rem}' +
        '.cpm-item.danger{color:#f87171}.cpm-item.danger:hover{background:rgba(239,68,68,.14)}.cpm-div{height:1px;margin:4px 6px;background:var(--border,#334155)}' +
        '@keyframes cpSheet{from{transform:translateY(100%)}}@keyframes cpFade{from{opacity:0}}@keyframes cpPop{from{transform:scale(.96);opacity:0}}@media (prefers-reduced-motion:reduce){.cpm,.cpm.sheet,.cpm-back{animation:none}}';
      document.head.appendChild(st);
    }
    var sheet = window.matchMedia('(max-width: 600px)').matches;
    var back = document.createElement('div'); back.className = 'cpm-back' + (sheet ? ' sheet' : '');
    var el = document.createElement('div'); el.className = 'cpm' + (sheet ? ' sheet' : ''); el.setAttribute('role', 'menu'); el.setAttribute('aria-label', title || 'Actions');
    var t = document.createElement('div'); t.className = 'cpm-title'; t.textContent = title || ''; el.appendChild(t);
    var focusables = [];
    items.forEach(function (it) {
      if (it.divider) { var d = document.createElement('div'); d.className = 'cpm-div'; el.appendChild(d); return; }
      var b = document.createElement(it.href ? 'a' : 'button');
      b.className = 'cpm-item' + (it.danger ? ' danger' : ''); b.setAttribute('role', 'menuitem'); b.tabIndex = -1;
      if (it.href) { b.href = it.href; b.target = '_blank'; b.rel = 'noopener noreferrer'; } else b.type = 'button';
      var ic = document.createElement('span'); ic.className = 'cpm-ic'; ic.setAttribute('aria-hidden', 'true'); ic.textContent = it.icon || '';
      var lb = document.createElement('span'); lb.textContent = it.label;
      b.append(ic, lb);
      if (it.href) { var x = document.createElement('span'); x.className = 'cpm-ext'; x.textContent = '↗'; x.setAttribute('aria-hidden', 'true'); b.appendChild(x); }
      b.addEventListener('click', function (e) { if (!it.href) e.preventDefault(); closeMenu(false); if (it.onClick) it.onClick(); });
      el.appendChild(b); focusables.push(b);
    });
    document.body.append(back, el);
    if (!sheet) {
      var r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
      var left = Math.min(Math.max(8, r.right - w), innerWidth - w - 8);
      var top = r.bottom + 6; if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);
      el.style.left = left + 'px'; el.style.top = top + 'px';
    }
    anchor.setAttribute('aria-expanded', 'true');
    var idx = 0;
    var move = function (i) { idx = (i + focusables.length) % focusables.length; focusables[idx].focus(); };
    var key = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); move(idx + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(idx - 1); }
      else if (e.key === 'Home') { e.preventDefault(); move(0); }
      else if (e.key === 'End') { e.preventDefault(); move(focusables.length - 1); }
      else if (e.key === 'Tab') closeMenu(false);
    };
    // Scrolling the page closes the popover — but not a scroll still finishing from just before the tap
    // (scroll events arrive a frame late, and momentum scrolling on touch screens keeps going briefly).
    var openedAt = Date.now();
    var onScroll = function (e) { if (Date.now() - openedAt > 250 && !el.contains(e.target)) closeMenu(false); };
    menuOpen = { el: el, back: back, anchor: anchor, key: key, close: function () { closeMenu(false); }, onScroll: onScroll };
    back.addEventListener('click', function () { closeMenu(false); });
    document.addEventListener('keydown', key, true); window.addEventListener('resize', menuOpen.close);
    if (!sheet) window.addEventListener('scroll', onScroll, true);
    setTimeout(function () { if (focusables[0]) focusables[0].focus(); }, 0);
  }

  // ── All-Time Profit — ONE definition for every page ──────────────────────────
  //    CPProfit.calc({ value, cost, realized, sellCount, sellFees }) → the numbers every card shows
  //    CPProfit.open(data, { title, scope }) → details sheet (phone: bottom sheet · desktop: centered panel)
  //    The formulas in "How is it calculated?" are the ones samsam-core.js applies to the ledger.
  // The round "open" button (›) used on every tappable card. small = 26px for compact cards.
  function goHtml(small) {
    return '<span class="card-go' + (small ? ' sm' : '') + '" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></span>';
  }
  function profitCalc(o) {
    o = o || {};
    var value = +o.value || 0, cost = +o.cost || 0, realized = +o.realized || 0;
    var unrealized = value - cost, total = realized + unrealized;
    return { value: value, cost: cost, realized: realized, unrealized: unrealized, total: total,
      pct: cost > 0 ? total / cost * 100 : 0, sellCount: +o.sellCount || 0, sellFees: +o.sellFees || 0 };
  }
  var profCss = false, profOpen = null;
  function profClose() {
    if (!profOpen) return; var p = profOpen; profOpen = null;
    document.removeEventListener('keydown', p.key, true); p.el.remove();
    try { p.back && p.back.focus && p.back.focus(); } catch (_) {}
  }
  function profOpenFn(d, o) {
    o = o || {}; d = d && 'total' in d ? d : profitCalc(d);
    profClose();
    if (!profCss) {
      profCss = true;
      var st = document.createElement('style');
      st.textContent = '#cpProfit{position:fixed;inset:0;z-index:100145;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(2,6,23,.62);animation:cpFade .15s ease}' +
        '#cpProfit .cpp{width:min(440px,100%);max-height:calc(100vh - 32px);overflow:auto;background:var(--card-solid,var(--bg2,#111827));color:var(--fg,#e5e7eb);border:1px solid var(--border,#334155);border-radius:18px;padding:18px 18px 16px;box-shadow:0 22px 50px rgba(0,0,0,.45);font-family:inherit;box-sizing:border-box;animation:cpPop .18s ease}' +
        '#cpProfit.sheet{align-items:flex-end;padding:0}#cpProfit.sheet .cpp{width:100%;max-height:88vh;border-radius:20px 20px 0 0;padding:10px 16px calc(16px + env(safe-area-inset-bottom,0px));animation:cpSheet .2s ease}' +
        '#cpProfit.sheet .cpp::before{content:"";display:block;width:36px;height:4px;border-radius:2px;background:#475569;margin:0 auto 10px}' +
        '.cpp-head{display:flex;align-items:center;gap:10px}.cpp-head img{width:26px;height:26px}.cpp-head h3{margin:0;font-size:1rem;font-weight:700;flex:1}' +
        '.cpp-scope{font-size:.75rem;color:var(--fg2,#94a3b8);font-weight:600}' +
        '.cpp-x{width:34px;height:34px;border-radius:10px;border:1px solid var(--border,#334155);background:none;color:inherit;font-size:1.1rem;line-height:1;cursor:pointer}' +
        '.cpp-hero{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:14px 0 14px}.cpp-big{font-size:1.9rem;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}' +
        '.cpp-badge{font-size:.85rem;font-weight:700;padding:4px 10px;border-radius:999px}' +
        '.cpp-pos{color:#22c55e}.cpp-neg{color:#ef4444}.cpp-badge.cpp-pos{background:rgba(34,197,94,.14)}.cpp-badge.cpp-neg{background:rgba(239,68,68,.14)}' +
        '.cpp-rows{display:grid;gap:8px}.cpp-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:12px;background:var(--bg3,rgba(148,163,184,.08))}' +
        '.cpp-row b{display:block;font-size:.9rem}.cpp-row small{display:block;font-size:.74rem;color:#94a3b8;margin-top:2px}.cpp-row .v{font-weight:700;font-size:1rem;white-space:nowrap;font-variant-numeric:tabular-nums}' +
        '.cpp-sum{margin:10px 2px 0;font-size:.78rem;color:#94a3b8;text-align:center;font-variant-numeric:tabular-nums}' +
        '.cpp-how{margin-top:14px;border:1px solid var(--border,#334155);border-radius:12px;padding:0 14px}.cpp-how summary{cursor:pointer;padding:12px 0;font-weight:700;font-size:.9rem;list-style:none}' +
        '.cpp-how summary::-webkit-details-marker{display:none}.cpp-how summary::after{content:"▾";float:right;color:#94a3b8;transition:transform .15s}.cpp-how[open] summary::after{transform:rotate(180deg)}' +
        '.cpp-f{margin:0 0 10px;font-size:.8rem;line-height:1.5}.cpp-f code{display:block;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.76rem;background:var(--bg3,rgba(148,163,184,.1));border-radius:8px;padding:7px 9px;margin-top:3px;white-space:normal;color:var(--fg,#e5e7eb)}' +
        '.cpp-f span{color:#94a3b8}.cpp-note{font-size:.74rem;color:#94a3b8;margin:4px 0 12px;line-height:1.45}' +
        '@keyframes cpSheet{from{transform:translateY(100%)}}@keyframes cpFade{from{opacity:0}}@keyframes cpPop{from{transform:scale(.96);opacity:0}}' +
        '@media (prefers-reduced-motion:reduce){#cpProfit,#cpProfit .cpp{animation:none}}';
      document.head.appendChild(st);
    }
    var F = window.SamsamFmt, sg = function (n) { return F.usdSigned(n); }, cls = function (n) { return n >= 0 ? 'cpp-pos' : 'cpp-neg'; };
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var sheet = window.matchMedia('(max-width: 600px)').matches;
    var w = document.createElement('div'); w.id = 'cpProfit'; if (sheet) w.className = 'sheet';
    var sells = d.sellCount ? d.sellCount + ' sell' + (d.sellCount > 1 ? 's' : '') : 'No sells yet';
    var realSub = sells + (d.sellFees > 0 ? ' · after ' + F.usd(d.sellFees) + ' selling fees' : '');
    w.innerHTML = '<div class="cpp" role="dialog" aria-modal="true" aria-labelledby="cppT">' +
      '<div class="cpp-head"><img src="./logo-mark.svg?v=1" alt=""><h3 id="cppT">' + esc(o.title || 'All-Time Profit') + (o.scope ? ' <span class="cpp-scope">· ' + esc(o.scope) + '</span>' : '') + '</h3>' +
      '<button type="button" class="cpp-x" aria-label="Close">×</button></div>' +
      '<div class="cpp-hero"><span class="cpp-big ' + cls(d.total) + '" id="cppTotal">' + sg(d.total) + '</span>' +
      '<span class="cpp-badge ' + cls(d.total) + '" id="cppPct">' + (d.total >= 0 ? '▲ ' : '▼ ') + Math.abs(d.pct).toFixed(2) + '%</span></div>' +
      '<div class="cpp-rows">' +
      '<div class="cpp-row"><div><b>Realized Profit</b><small>' + esc(realSub) + '</small></div><span class="v ' + cls(d.realized) + '" id="cppRealized">' + (d.sellCount ? sg(d.realized) : '$0.00') + '</span></div>' +
      '<div class="cpp-row"><div><b>Unrealized Profit</b><small>Coins you still hold, at today’s price</small></div><span class="v ' + cls(d.unrealized) + '" id="cppUnrealized">' + sg(d.unrealized) + '</span></div>' +
      '<div class="cpp-row"><div><b>Cost Basis</b><small>What the coins you hold cost (fees included)</small></div><span class="v" id="cppCost">' + F.usd(d.cost) + '</span></div>' +
      '</div>' +
      '<div class="cpp-sum" id="cppCheck">' + sg(d.realized) + ' realized ' + (d.unrealized >= 0 ? '+' : '−') + ' ' + F.usd(Math.abs(d.unrealized)) + ' unrealized = ' + sg(d.total) + '</div>' +
      '<details class="cpp-how"' + (o.howOpen ? ' open' : '') + '><summary>How is it calculated?</summary>' +
      '<p class="cpp-f"><b>All-Time Profit</b><code>Realized Profit + Unrealized Profit</code></p>' +
      '<p class="cpp-f"><b>Realized Profit</b> <span>(added up over every sell)</span><code>(Sell Price − Avg Buy Price) × Amount Sold − Selling Fee</code></p>' +
      '<p class="cpp-f"><b>Unrealized Profit</b><code>(Current Price − Avg Buy Price) × Amount Held</code></p>' +
      '<p class="cpp-f"><b>Cost Basis</b><code>Avg Buy Price × Amount Held</code></p>' +
      '<p class="cpp-f"><b>Avg Buy Price</b> <span>(updated on every buy)</span><code>(Amount Held × Avg Buy Price + Buy Price × Amount Bought + Buying Fee) ÷ (Amount Held + Amount Bought)</code></p>' +
      '<p class="cpp-f"><b>%</b><code>All-Time Profit ÷ Cost Basis × 100</code></p>' +
      '<p class="cpp-note">Sells don’t change the Avg Buy Price. Transfers in add coins at the price you enter; transfers out and network fees only lower the amount held.</p>' +
      '</details></div>';
    var back = document.activeElement;
    var key = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); profClose(); }
      else if (e.key === 'Tab') {
        var f = Array.prototype.slice.call(w.querySelectorAll('button,summary')), i = f.indexOf(document.activeElement);
        e.preventDefault(); f[(i + (e.shiftKey ? f.length - 1 : 1) + f.length) % f.length].focus();
      }
    };
    profOpen = { el: w, key: key, back: back };
    w.addEventListener('click', function (e) { if (e.target === w) profClose(); });
    w.querySelector('.cpp-x').onclick = profClose;
    document.addEventListener('keydown', key, true);
    document.body.appendChild(w);
    setTimeout(function () { var x = w.querySelector('.cpp-x'); if (x) x.focus(); }, 0);
    return w;
  }
  // Make any card open the sheet on click / Enter / Space. getData() is read at the moment of the tap.
  function profBind(el, getData, opts) {
    if (!el || el.dataset.cpProfit) return; el.dataset.cpProfit = '1';
    el.setAttribute('role', 'button'); el.tabIndex = 0; el.classList.add('cp-profit-tap', 'card-tap');
    if (!el.querySelector(':scope > .card-go')) el.insertAdjacentHTML('beforeend', goHtml(true));
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', 'All-Time Profit — show details');
    var go = function () { var o = typeof opts === 'function' ? opts() : (opts || {}); profOpenFn(getData(), o); };
    el.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a,button:not(.cp-profit-tap)')) return; go(); });
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  }
  if (!document.getElementById('cpProfitTapCss')) {
    var tc = document.createElement('style'); tc.id = 'cpProfitTapCss';
    tc.textContent =
      // ── one "open" button for every tappable card: same circle, same corner, on every page ──
      '.card-tap{position:relative;cursor:pointer;transition:border-color .2s,background .2s,transform .12s;-webkit-tap-highlight-color:transparent}' +
      '.card-go{position:absolute;top:14px;right:14px;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-sizing:border-box;' +
        'background:rgba(124,58,237,.14);color:#a78bfa;border:1px solid rgba(124,58,237,.28);transition:background .18s,color .18s,border-color .18s;pointer-events:none;z-index:1}' +
      '.card-go.sm{top:10px;right:10px;width:26px;height:26px}.card-go.sm svg{width:13px;height:13px}.card-go svg{transition:transform .18s}' +
      '.card-tap:focus-visible .card-go,.card-tap:active .card-go{background:#7c3aed;border-color:#7c3aed;color:#fff}' +
      '@media (hover:hover){.card-tap:hover .card-go{background:#7c3aed;border-color:#7c3aed;color:#fff}.card-tap:hover .card-go svg{transform:translateX(2px)}.cp-profit-tap:hover{border-color:rgba(124,58,237,.55)!important}}' +
      '.card-tap:active{transform:scale(.985)}.card-tap:focus-visible{outline:3px solid #a78bfa;outline-offset:2px}' +
      '[data-theme="light"] .card-go{background:rgba(124,58,237,.10);color:#6d28d9}' +
      '.cp-profit-tap .sum-label,.cp-profit-tap .htx-label{padding-right:30px}.cp-profit-tap .sum-card-icon{display:none}' +
      // compact centred cards (header stats, P/L breakdown): smaller button level with the label, label kept centred
      '.stat-card.cp-profit-tap .card-go,.pnl-bd-stat.cp-profit-tap .card-go{top:5px;right:7px;width:22px;height:22px}.stat-card.cp-profit-tap .card-go svg,.pnl-bd-stat.cp-profit-tap .card-go svg{width:12px;height:12px}' +
      '.cp-profit-tap .stat-label,.cp-profit-tap .pnl-bd-stat-label{padding-left:24px;padding-right:24px}' +
      '@media (prefers-reduced-motion:reduce){.card-tap:active{transform:none}.card-tap:hover .card-go svg{transform:none}}' +
      // ✎ next to a value you can change — always visible (not only on hover), same on every page and in cards and tables
      '.val-edit{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin-left:4px;padding:3px;border:none;border-radius:6px;background:none;color:var(--fg2,#94a3b8);opacity:.75;cursor:pointer;line-height:0;-webkit-tap-highlight-color:transparent;transition:opacity .15s,color .15s,background .15s}' +
      '.val-edit .ss-pencil{width:13px;height:13px}.val-edit:active{background:rgba(124,58,237,.14)}.val-edit:focus-visible{outline:2px solid #a78bfa;outline-offset:1px;opacity:1}' +
      '@media (hover:hover){.val-edit:hover{opacity:1;color:#a78bfa}}' +
      '.val-cell{display:inline-flex;align-items:center;gap:0;white-space:nowrap}' +
      '@media print{.card-go,.mv-go,.ext-go,.val-edit{display:none!important}}';
    (document.head || document.documentElement).appendChild(tc);
  }
  window.CPProfit = { calc: profitCalc, open: profOpenFn, bind: profBind, close: profClose };
  window.CPMenu = { open: openMenu, close: function () { closeMenu(false); } };
  window.CPDialog = {
    alert: function (m, o) { return dialog('alert', m, o); },
    confirm: function (m, o) { return dialog('confirm', m, o); },
    prompt: function (m, o) { return dialog('prompt', m, o); },
  };
  // ── Bottom navigation: Home · Holdings · Performance · Allocation · Accumulation (every main page) ──
  // Phones / tablets: a bar at the bottom (labels hide on ≤ 360px screens, except the open page).
  // Computer: the same bar floats as a small dock at the bottom centre. The open page has a violet pill.
  var NAV = [
    { k: 'home', label: 'Home', href: 'index.html', ic: '<path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/>' },
    { k: 'holdings', label: 'Holdings', href: 'index.html#holdings', ic: '<rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M3 10h18M16 14.5h2"/><path d="M6 6V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/>' },
    { k: 'performance', label: 'Performance', href: 'performance.html', ic: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>' },
    { k: 'allocation', label: 'Allocation', href: 'allocation.html', ic: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>' },
    { k: 'accumulation', label: 'Accumulation', href: 'accumulation.html', ic: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>' },
  ];
  function navPage() {
    var f = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (f === '' || f === 'index.html' || f === 'portfolio.html') {
      var ov = document.getElementById('holdingsOverlay');
      return (ov && ov.style.display === 'flex') || /^#holdings/.test(location.hash) ? 'holdings' : 'home';
    }
    var m = /^(performance|allocation|accumulation)\.html$/.exec(f);
    return m ? m[1] : null;
  }
  function navCss() {
    if (document.getElementById('cpNavCss')) return;
    var st = document.createElement('style'); st.id = 'cpNavCss';
    st.textContent =
      '.cp-bnav{position:fixed;left:0;right:0;bottom:0;z-index:10010;display:flex;justify-content:space-around;align-items:stretch;gap:2px;box-sizing:border-box;' +
        'height:calc(62px + env(safe-area-inset-bottom,0px));padding:6px max(6px,env(safe-area-inset-right,0px)) env(safe-area-inset-bottom,0px) max(6px,env(safe-area-inset-left,0px));' +
        'background:rgba(23,21,51,.85);-webkit-backdrop-filter:blur(16px) saturate(1.3);backdrop-filter:blur(16px) saturate(1.3);border-top:1px solid rgba(255,255,255,.08);box-shadow:0 -10px 28px rgba(0,0,0,.35);font-family:inherit}' +
      '[data-theme="light"] .cp-bnav{background:rgba(255,255,255,.88);border-top-color:#e2e8f0;box-shadow:0 -8px 24px rgba(15,23,42,.08)}' +
      '.cp-bnav a{flex:1 1 0;min-width:48px;min-height:48px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border-radius:14px;text-decoration:none;color:#b8c2d3;font-size:11px;font-weight:600;line-height:1.1;-webkit-tap-highlight-color:transparent;transition:color .15s,background .15s}' +
      '.cp-bnav a svg{width:24px;height:24px;flex-shrink:0}' +
      '.cp-bnav a span{white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}' +
      '.cp-bnav a[aria-current="page"]{color:#c4b5fd;background:rgba(124,58,237,.2)}' +
      '[data-theme="light"] .cp-bnav a{color:#64748b}[data-theme="light"] .cp-bnav a[aria-current="page"]{color:#6d28d9;background:#ede9fe}' +
      '@media (hover:hover){.cp-bnav a:hover{color:#e2e8f0}[data-theme="light"] .cp-bnav a:hover{color:#0f172a}}' +
      '.cp-bnav a:focus-visible{outline:2px solid #a78bfa;outline-offset:-2px}' +
      '@media (max-width:360px){.cp-bnav a:not([aria-current="page"]) span{display:none}.cp-bnav a[aria-current="page"]{flex-grow:1.6}}' +
      // computer: a floating dock at the bottom centre
      '@media (min-width:1024px){.cp-bnav{left:50%;right:auto;bottom:14px;transform:translateX(-50%);width:auto;height:auto;padding:6px;gap:4px;border:1px solid rgba(255,255,255,.1);border-radius:20px;box-shadow:0 12px 32px rgba(0,0,0,.35)}' +
        '.cp-bnav a{flex:0 0 auto;flex-direction:row;gap:8px;min-height:40px;padding:0 16px;font-size:.84rem}.cp-bnav a svg{width:20px;height:20px}' +
        '[data-theme="light"] .cp-bnav{border-color:#e2e8f0;box-shadow:0 12px 32px rgba(15,23,42,.12)}}' +
      // room under the content; the bar replaces the page Back buttons (inner screens keep theirs)
      'body.has-bnav{padding-bottom:calc(76px + env(safe-area-inset-bottom,0px)) !important}' +
      'body.has-bnav #holdingsOverlay{padding-bottom:calc(76px + env(safe-area-inset-bottom,0px))}' +
      'body.has-bnav a.cp-back[data-back]{visibility:hidden}' +
      'body.has-bnav #holdingsOverlay:not([data-view="tx"]) .hov-back-btn{visibility:hidden}' +
      // older pop-ups sit above the bar
      '.modal-overlay,.overlay,.dca-overlay{z-index:100030 !important}' +
      '@media print{.cp-bnav{display:none !important}body.has-bnav{padding-bottom:0 !important}}';
    document.head.appendChild(st);
  }
  function navPaint() {
    var bar = document.getElementById('cpBnav'); if (!bar) return;
    var cur = navPage();
    [].forEach.call(bar.querySelectorAll('a'), function (a) { if (a.dataset.k === cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }
  function navGo(e, k) {
    var here = navPage(), onIndex = here === 'home' || here === 'holdings';
    if (!onIndex || e.metaKey || e.ctrlKey || e.shiftKey) return;   // other pages: a normal link
    if (k === 'holdings' && typeof window.openHoldingsView === 'function') {
      e.preventDefault();
      var ov = document.getElementById('holdingsOverlay'); if ((ov && ov.getAttribute('data-view') === 'tx') || here !== 'holdings') { history.pushState({ hov: 'list' }, '', '#holdings'); if (window.applyHoldingsRoute) window.applyHoldingsRoute(); }
      setTimeout(navPaint, 0);
    } else if (k === 'home' && here === 'holdings' && typeof window.closeHoldingsView === 'function') {
      e.preventDefault(); window.closeHoldingsView(); setTimeout(navPaint, 0);
    } else if (k === 'home') { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }
  function navMount() {
    if (!navPage() || document.getElementById('cpBnav') || !document.body) return;
    navCss();
    var html = '<nav class="cp-bnav" id="cpBnav" aria-label="Main">' + NAV.map(function (n) {
      return '<a href="./' + n.href + '" data-k="' + n.k + '" title="' + n.label + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + n.ic + '</svg><span>' + n.label + '</span></a>';
    }).join('') + '</nav>';
    document.body.insertAdjacentHTML('beforeend', html);
    document.body.classList.add('has-bnav');
    document.getElementById('cpBnav').addEventListener('click', function (e) { var a = e.target.closest('a[data-k]'); if (a) navGo(e, a.dataset.k); });
    navPaint();
    window.addEventListener('hashchange', navPaint); window.addEventListener('popstate', function () { setTimeout(navPaint, 0); });
    var ov = document.getElementById('holdingsOverlay');
    if (ov && window.MutationObserver) new MutationObserver(navPaint).observe(ov, { attributes: true, attributeFilter: ['style'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', navMount); else navMount();
  // Open a coin's Transactions screen (main page) from another page; its Back comes back here.
  function openCoin(sym) {
    try { sessionStorage.setItem('cpReturn', JSON.stringify({ sym: String(sym).toUpperCase(), t: Date.now() })); } catch (_) {}
    location.href = 'index.html#holdings/' + encodeURIComponent(sym);
  }
  window.SamsamUI = { goHtml: goHtml, openCoin: openCoin, icons: ICONS, icon: function (n) { return ICONS[n] || ''; }, liveDot: liveDot,
    toggleTheme: toggleTheme, applyTheme: applyTheme, currentTheme: current, refresh: init };
})();
