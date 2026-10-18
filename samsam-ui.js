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
    '@media print{.ss-theme-btn{display:none!important}}';
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
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.addEventListener('storage', function (e) { if (e.key === KEY) applyTheme(saved()); });

  window.SamsamUI = { icons: ICONS, icon: function (n) { return ICONS[n] || ''; }, liveDot: liveDot,
    toggleTheme: toggleTheme, applyTheme: applyTheme, currentTheme: current, refresh: init };
})();
