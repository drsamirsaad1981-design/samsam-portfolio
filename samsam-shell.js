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
  // An old Holdings link or bookmark (opened fresh, not a refresh of the Allocation screen) → Performance, which has its list
  if (location.hash === '#holdings' && !history.state) history.replaceState({ view: 'performance' }, '', '#performance');
  function route() {
    if (location.hash === '#allocation') {   // Allocation links → the Allocation screen
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
    // One at a time, and only while you are not using the page: each tab is a whole page (its scripts, its data), and
    // loading three of them right after the start made a phone stutter for the first seconds. The next one starts when
    // the one before has loaded AND nothing was touched / scrolled for a moment. Data saver on → none (a tab loads when opened).
    preload() {
      const todo = Object.keys(VIEWS).filter(k => k !== 'altseason');   // Altcoin Season opens when asked
      const conn = navigator.connection || {}; if (conn.saveData) return;
      let last = Date.now(); const touch = () => { last = Date.now(); };
      ['touchstart', 'pointerdown', 'scroll', 'keydown', 'wheel'].forEach(ev => window.addEventListener(ev, touch, { passive: true, capture: true }));
      const QUIET = 1500, idle = cb => (window.requestIdleCallback ? requestIdleCallback(cb, { timeout: 4000 }) : setTimeout(cb, 300));
      const next = () => {
        const k = todo.find(n => !frames[n]); if (!k) return;
        if (document.hidden || navigator.onLine === false || Date.now() - last < QUIET) { setTimeout(next, 700); return; }
        idle(() => {
          if (frames[k]) return next();
          if (navigator.onLine === false) { setTimeout(next, 700); return; }
          const f = frame(k); let went = false; const on = () => { if (went) return; went = true; loading = null; setTimeout(next, QUIET); };
          loading = k; f.addEventListener('load', () => { f.dataset.ready = '1'; on(); }, { once: true }); setTimeout(on, 12000);   // (a tab that never finishes doesn't hold the others)
        });
      };
      // the connection dropped while a tab was still loading in the background: a half-loaded page is worse than none —
      // it is taken away (unless you are looking at it) and loaded again when the connection is back
      let loading = null;
      window.addEventListener('offline', () => { const k = loading, f = k && frames[k]; if (f && !f.dataset.ready && shell.cur !== k) { f.remove(); delete frames[k]; loading = null; setTimeout(next, 700); } });
      next();
    },
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
    // the "Accumulation Plan" card on Overview opens the Accumulation tab — also when Exit Strategy was the tab used last
    if (m[1] === 'accumulation' && a.id === 'accumProgressBar') { try { localStorage.setItem('cp-plan-focus', JSON.stringify({ k: 'plan', t: Date.now() })); } catch (_) {} if (window.Samsam && Samsam.saveExit) Samsam.saveExit({ tab: 'accum' }).catch(() => {}); }
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
