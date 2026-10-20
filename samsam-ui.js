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

  // One USD formatter for every money amount in the app: thousands separators + exactly 2 decimals.
  // (Unit prices of sub-$1 coins keep extra decimals elsewhere — $0.0004 can't be shown as $0.00.)
  var usdFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
        '#cpDialog .cpd-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}#cpDialog .cpd-head img{width:28px;height:28px;border-radius:8px}' +
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
        '<div class="cpd-head"><img src="./icon-192.png" alt=""><h3 id="cpdT"></h3></div><p id="cpdM"></p>' +
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
  window.CPDialog = {
    alert: function (m, o) { return dialog('alert', m, o); },
    confirm: function (m, o) { return dialog('confirm', m, o); },
    prompt: function (m, o) { return dialog('prompt', m, o); },
  };
  window.SamsamUI = { icons: ICONS, icon: function (n) { return ICONS[n] || ''; }, liveDot: liveDot,
    toggleTheme: toggleTheme, applyTheme: applyTheme, currentTheme: current, refresh: init };
})();
