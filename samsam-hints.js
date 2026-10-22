// samsam-hints.js — one way to explain things, on every page.
//
//   <button type="button" class="cp-hint" data-hint="baseline" aria-label="What is the baseline?"></button>
//
// Tapping an ⓘ opens a small panel (bottom sheet on a phone, a popover beside the ⓘ on a computer) with a title,
// a few lines on what the thing does and — when there is a calculation — the formula exactly as the app computes it.
// ALL hint texts live in HINTS below, so a change in how something works is explained in one place.
(function () {
  'use strict';
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var money = function (n) { return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var fmtDay = function (iso) { var d = new Date(String(iso) + 'T00:00:00'); return isNaN(d) ? String(iso) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
  function baseline() {
    try { if (window.Samsam && Samsam.getBaseline) return Samsam.getBaseline(); } catch (_) {}
    return { date: '2026-10-15', btcPrice: 81162, isDefault: true };
  }

  // ── The texts ────────────────────────────────────────────────────────────────
  // title: string · body(): HTML string (only our own text + escaped values) · actions(): [{ label, onClick }]
  var HINTS = {
    baseline: {
      title: function () { return 'Baseline date: ' + fmtDay(baseline().date); },
      body: function () {
        var b = baseline();
        return '<p>The day your coins are compared with Bitcoin.</p>' +
          '<p>It sets the <b>BTC reference price</b>, which is BTC\'s price on that date: <b>' + esc(money(b.btcPrice)) + '</b>' +
          (b.source === 'manual' ? ' (entered by hand)' : '') + '.</p>' +
          '<p>Changing the date changes this price, and with it:</p>' +
          '<ul><li><b>Portfolio vs BTC</b> on every coin (cards, table, sorting and CSV)</li><li>the <b>VS Bitcoin</b> best / worst on Performance</li></ul>' +
          '<div class="cph-f"><b>Portfolio vs BTC</b><code>(Current Price ÷ Avg Buy Price − 1) − (BTC Price ÷ BTC Reference Price − 1)</code></div>' +
          '<p class="cph-ok">Your holdings, transactions, All-Time Profit and the Hold / Reinforce / Sell signals <b>don\'t change</b>.</p>';
      },
      actions: function () { return typeof window.openBaselineEdit === 'function' ? [{ label: 'Change date', primary: true, onClick: window.openBaselineEdit }] : []; },
    },
    perfChart: {
      title: 'Performance (cumulative)',
      body: function () {
        var b = baseline();
        return '<p><b>Blue — All-Time Profit %</b>: your total profit on the coins in your portfolio, at every point in time.</p>' +
          '<div class="cph-f"><b>All-Time Profit</b><code>Holdings × latest price + selling proceeds − buying costs − fees</code></div>' +
          '<div class="cph-f"><b>%</b><code>All-Time Profit ÷ Cost Basis × 100</code></div>' +
          '<p><b>Orange — BTC trend</b>: how Bitcoin\'s price moved over your holding time, from the baseline date (' + esc(fmtDay(b.date)) + ', ' + esc(money(b.btcPrice)) + ').</p>' +
          '<div class="cph-f"><b>BTC trend</b><code>BTC price ÷ BTC reference price − 1</code></div>' +
          '<p>Both lines are measured from the start, so 24h / 7d / 30d / 90d only zoom in. The last point is right now and matches the All-Time Profit card.</p>' +
          '<p>Buying more doesn\'t count as profit, but it does add to Cost Basis, so the % can step a little at that moment. A manual correction of an amount or average price can also show as a step.</p>';
      },
    },
  };

  // ── The panel ────────────────────────────────────────────────────────────────
  var css = false, open = null;
  function addCss() {
    if (css) return; css = true;
    var st = document.createElement('style'); st.id = 'cpHintCss';
    st.textContent =
      // the ⓘ itself — same everywhere
      '.cp-hint{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;margin:0 0 0 4px;padding:0;border:none;border-radius:50%;background:none;color:var(--fg2,#94a3b8);opacity:.8;cursor:pointer;vertical-align:middle;line-height:0;flex-shrink:0;-webkit-tap-highlight-color:transparent;transition:color .15s,opacity .15s,background .15s}' +
      '.cp-hint svg{width:15px;height:15px}.cp-hint:active,.cp-hint[aria-expanded=true]{color:#a78bfa;opacity:1;background:rgba(124,58,237,.14)}' +
      '@media (hover:hover){.cp-hint:hover{color:#a78bfa;opacity:1}}.cp-hint:focus-visible{outline:2px solid #a78bfa;outline-offset:1px;opacity:1}' +
      // the panel
      '.cph-back{position:fixed;inset:0;z-index:100146;background:transparent}.cph-back.sheet{background:rgba(2,6,23,.55);animation:cphFade .15s ease}' +
      '.cph{position:fixed;z-index:100147;width:min(340px,calc(100vw - 16px));box-sizing:border-box;background:var(--card-solid,var(--bg2,#111827));color:var(--fg,#e5e7eb);border:1px solid var(--border,#334155);border-radius:14px;padding:14px 16px;box-shadow:0 18px 40px rgba(0,0,0,.4);font-size:.86rem;line-height:1.5;animation:cphPop .15s ease}' +
      '.cph.sheet{left:0!important;right:0!important;bottom:0!important;top:auto!important;width:auto;max-height:80vh;overflow:auto;border-radius:18px 18px 0 0;padding:10px 18px calc(16px + env(safe-area-inset-bottom,0px));animation:cphSheet .2s ease}' +
      '.cph.sheet::before{content:"";display:block;width:36px;height:4px;border-radius:2px;background:#475569;margin:0 auto 10px}' +
      '.cph-h{display:flex;align-items:center;gap:8px;margin-bottom:6px}.cph-h h3{flex:1;margin:0;font-size:.98rem;font-weight:800}' +
      '.cph-x{width:30px;height:30px;border-radius:9px;border:1px solid var(--border,#334155);background:none;color:inherit;font-size:1.05rem;line-height:1;cursor:pointer}' +
      '.cph p{margin:0 0 8px;color:var(--fg2,#cbd5e1)}.cph p b,.cph li b{color:var(--fg,#e5e7eb)}.cph ul{margin:0 0 8px;padding-left:18px;color:var(--fg2,#cbd5e1)}.cph li{margin:2px 0}' +
      '.cph-f{margin:4px 0 10px;font-size:.8rem}.cph-f code{display:block;margin-top:3px;padding:7px 9px;border-radius:8px;background:var(--bg3,rgba(148,163,184,.1));font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.75rem;white-space:normal;color:var(--fg,#e5e7eb)}' +
      '.cph-ok{padding:8px 10px;border-radius:9px;background:rgba(34,197,94,.10);color:var(--fg,#e5e7eb)!important}' +
      '.cph-acts{display:flex;gap:8px;margin-top:12px}.cph-acts button{flex:1;min-height:40px;border-radius:10px;border:1px solid var(--border,#334155);background:var(--bg3,#1f2937);color:var(--fg,#e5e7eb);font:inherit;font-weight:700;cursor:pointer}' +
      '.cph-acts button.primary{background:linear-gradient(135deg,#7c3aed,#6d28d9);border-color:#6d28d9;color:#fff}' +
      '@keyframes cphFade{from{opacity:0}}@keyframes cphPop{from{opacity:0;transform:translateY(-4px)}}@keyframes cphSheet{from{transform:translateY(100%)}}' +
      '@media (prefers-reduced-motion:reduce){.cph,.cph.sheet,.cph-back{animation:none}}@media print{.cp-hint,.cph,.cph-back{display:none!important}}';
    (document.head || document.documentElement).appendChild(st);
  }
  var INFO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6"/><path d="M12 7.5h.01"/></svg>';
  function close(refocus) {
    if (!open) return; var o = open; open = null;
    document.removeEventListener('keydown', o.key, true); window.removeEventListener('resize', o.onResize);
    o.el.remove(); o.back.remove(); if (o.anchor) { o.anchor.setAttribute('aria-expanded', 'false'); if (refocus) try { o.anchor.focus(); } catch (_) {} }
  }
  function show(key, anchor) {
    var h = HINTS[key]; if (!h) return;
    if (open && open.anchor === anchor) { close(true); return; }
    close(false); addCss();
    var sheet = window.matchMedia('(max-width: 600px)').matches;
    var back = document.createElement('div'); back.className = 'cph-back' + (sheet ? ' sheet' : '');
    var el = document.createElement('div'); el.className = 'cph' + (sheet ? ' sheet' : ''); el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', sheet ? 'true' : 'false');
    var title = typeof h.title === 'function' ? h.title() : h.title;
    el.setAttribute('aria-label', title);
    el.innerHTML = '<div class="cph-h"><h3></h3><button type="button" class="cph-x" aria-label="Close">×</button></div><div class="cph-b"></div>';
    el.querySelector('h3').textContent = title;
    el.querySelector('.cph-b').innerHTML = typeof h.body === 'function' ? h.body() : h.body;
    var acts = h.actions ? h.actions() : [];
    if (acts.length) {
      var row = document.createElement('div'); row.className = 'cph-acts';
      acts.forEach(function (a) { var b = document.createElement('button'); b.type = 'button'; b.textContent = a.label; if (a.primary) b.className = 'primary'; b.onclick = function () { close(false); a.onClick(); }; row.appendChild(b); });
      el.appendChild(row);
    }
    document.body.append(back, el);
    var place = function () {
      if (sheet || !anchor) { if (!sheet) { el.style.left = Math.max(8, (innerWidth - el.offsetWidth) / 2) + 'px'; el.style.top = '80px'; } return; }
      var r = anchor.getBoundingClientRect(), w = el.offsetWidth, hh = el.offsetHeight;
      var left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
      var top = r.bottom + 8; if (top + hh > innerHeight - 8) top = Math.max(8, r.top - hh - 8);
      el.style.left = left + 'px'; el.style.top = top + 'px';
    };
    place();
    var key2 = function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); } };
    open = { el: el, back: back, anchor: anchor, key: key2, onResize: function () { close(false); } };
    if (anchor) anchor.setAttribute('aria-expanded', 'true');
    back.addEventListener('click', function () { close(false); });
    el.querySelector('.cph-x').onclick = function () { close(true); };
    document.addEventListener('keydown', key2, true); window.addEventListener('resize', open.onResize);
    setTimeout(function () { var x = el.querySelector('.cph-x'); if (x) x.focus(); }, 0);
    return el;
  }
  // Every .cp-hint[data-hint] gets the ⓘ drawing and opens its text — including ones added later.
  function paint(root) {
    var list = (root || document).querySelectorAll('.cp-hint[data-hint]:not([data-hint-ready])');
    for (var i = 0; i < list.length; i++) {
      var b = list[i]; b.setAttribute('data-hint-ready', ''); if (!b.innerHTML.trim()) b.innerHTML = INFO;
      if (!b.getAttribute('aria-label')) { var h = HINTS[b.getAttribute('data-hint')]; b.setAttribute('aria-label', 'About ' + (h ? String(typeof h.title === 'function' ? h.title() : h.title).split(':')[0] : 'this')); }
      b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false'); if (!b.type) b.type = 'button';
    }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.cp-hint[data-hint]');
    if (!b) return; e.preventDefault(); e.stopPropagation(); paint(b.parentNode); show(b.getAttribute('data-hint'), b);
  }, true);
  addCss();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { paint(); }); else paint();
  var queued = false;   // lists re-render often: paint new ⓘ at most once per frame
  new MutationObserver(function () { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; paint(); }); })
    .observe(document.documentElement, { childList: true, subtree: true });

  window.CPHint = { open: show, close: close, paint: paint, HINTS: HINTS, add: function (key, def) { HINTS[key] = def; } };
})();
