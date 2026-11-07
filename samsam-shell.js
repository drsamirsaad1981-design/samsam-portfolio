// samsam-shell.js — the main page's view switcher: Performance / Plan / Market… open in frames over the page.
(function () {
  const VIEWS = { performance: 'performance.html', accumulation: 'accumulation.html', market: 'market.html', altseason: 'altseason.html' };   // altseason: opened from Market's Altcoin Season card   // (Allocation lives inside Holdings)
  const TITLES = { home: 'Cute Portfolio', performance: 'Performance — Cute Portfolio', accumulation: 'Accumulation Plan — Cute Portfolio', market: 'Market Hub — Cute Portfolio', altseason: 'Altcoin Season — Cute Portfolio' };
  const box = document.getElementById('cpViews'), frames = {};
  const baseTitle = document.title;
  function frame(k) {
    if (frames[k]) return frames[k];
    const f = document.createElement('iframe');
    f.src = VIEWS[k] + '?shell=1'; f.title = TITLES[k]; f.dataset.view = k;
    box.appendChild(f); frames[k] = f; return f;
  }
  function show(k) {
    shell.cur = VIEWS[k] ? k : 'home';
    if (VIEWS[shell.cur]) frame(shell.cur);
    Object.keys(frames).forEach(n => frames[n].classList.toggle('on', n === shell.cur));
    box.classList.toggle('on', !!VIEWS[shell.cur]);
    document.documentElement.classList.toggle('view-open', !!VIEWS[shell.cur]);
    document.title = VIEWS[shell.cur] ? TITLES[shell.cur] : baseTitle;
    if (window.SamsamUI && SamsamUI.navPaint) SamsamUI.navPaint();
  }
  function route() {
    if (location.hash === '#allocation') {   // old Allocation links → Holdings on its Allocation switch
      if (typeof setHovMode === 'function') setHovMode('alloc', true);
      history.replaceState({ hov: 'list' }, '', '#holdings');
      if (typeof applyHoldingsRoute === 'function') applyHoldingsRoute();
    }
    const m = /^#(performance|accumulation|market|altseason)$/.exec(location.hash);
    if (m) return show(m[1]);
    if (/^#holdings/.test(location.hash)) {   // Holdings opens on top; the tab you came from stays underneath
      const ret = history.state && history.state.ret;
      if (VIEWS[ret]) show(ret);
      else if (window.SamsamUI && SamsamUI.navPaint) SamsamUI.navPaint();
      return;
    }
    show('home');
  }
  const shell = window.cpShell = {
    cur: 'home', frames,
    go(k) {
      if (k === 'allocation') { if (typeof setHovMode === 'function') setHovMode('alloc', true); k = 'holdings'; }
      if (k === 'holdings') { if (typeof openHoldingsView === 'function') openHoldingsView(); if (window.SamsamUI && SamsamUI.navPaint) SamsamUI.navPaint(); return; }
      const same = shell.cur === (VIEWS[k] ? k : 'home') && !/^#holdings/.test(location.hash);   // tapped the tab you're on
      const hash = VIEWS[k] ? '#' + k : '';
      if (location.hash !== hash) history.pushState(VIEWS[k] ? { view: k } : null, '', hash || location.pathname + location.search);
      if (typeof applyHoldingsRoute === 'function') applyHoldingsRoute();   // leaving Holdings / a coin: close it
      route();
      // a tab opened from the bar (or a card) always starts at the top; tapping the open tab again scrolls up smoothly.
      // (Back from a coin's Transactions uses history instead, so that tab comes back exactly where you left it.)
      const w = VIEWS[k] ? frames[k] && frames[k].contentWindow : window;
      const smooth = same && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      try { if (w) w.scrollTo({ top: 0, left: 0, behavior: smooth ? 'smooth' : 'instant' }); } catch (_) { try { w.scrollTo(0, 0); } catch (__) {} }
    },
    // a coin's Transactions over the current tab; its Back returns to that tab (as it was)
    openCoin(sym) {
      history.pushState({ hov: 'tx', ret: shell.cur }, '', '#holdings/' + encodeURIComponent(sym));
      if (typeof ensureHtxDropdowns === 'function') { ensureHtxDropdowns(); htxTypeDD.setValue('all'); }
      applyHoldingsRoute(); if (window.SamsamUI) SamsamUI.navPaint();
    },
    // open the other tabs quietly in the background, one after another
    preload() { Object.keys(VIEWS).filter(k => k !== 'altseason').forEach((k, i) => setTimeout(() => frame(k), i * 1500)); },   // Altcoin Season opens when asked
  };
  window.addEventListener('popstate', route);
  // closing Holdings (Home on the bar, its Back) shows whatever is under it
  const closeHV = window.closeHoldingsView;
  window.closeHoldingsView = function () { closeHV(); route(); };
  // main-page cards that link to a page open it inside the app
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.target === '_blank' || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const m = /(?:^|\/)(performance|allocation|accumulation|market|altseason)\.html$/.exec(a.getAttribute('href') || '');
    if (!m) return;
    e.preventDefault(); shell.go(m[1]);
  });
  route();
  // index.html#ai (the floating AI button on a page opened on its own) → open the AI report once the data is in
  if (location.hash === '#ai') {
    history.replaceState(null, '', location.pathname + location.search);
    whenSamsam(S => { const go = () => S.isReady() ? openAnalysis() : setTimeout(go, 300); go(); });
  }
  // once the main page has your data, warm up the other tabs
  let warmed = false;
  whenSamsam(S => S.onChange(() => { if (warmed || !S.isReady()) return; warmed = true; setTimeout(() => shell.preload(), 1200); }));
})();
