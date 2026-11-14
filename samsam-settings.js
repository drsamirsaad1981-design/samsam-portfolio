// samsam-settings.js — one Settings screen (⚙️ in every page header) for every setting the app has.
//
// Nothing is rebuilt here: each line shows the setting's current value and opens the same window you already know
// (Telegram alerts, Signal thresholds, Target allocation…). The editors that live on the main page are opened there —
// inside the app the screen always opens on the main page; a page opened on its own goes to the main page first.
// To add a setting later (e.g. the app language, AI), add one line to SECTIONS.
(function () {
  'use strict';
  var doc = document, $ = function (id) { return doc.getElementById(id); };
  var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var IC = function (n) { return window.SamsamUI ? SamsamUI.ic(n) : ''; };
  var GEAR = '<svg class="ss-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
  var CHEV = '<svg class="st-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  var K = { range: 'samsam_chart_range', view: 'samsam_view_pref', viewPhone: 'samsam_view_phone', exitView: 'samsam_exit_view', fee: 'samsam_buyfee_unit' };
  var phone = function () { return innerWidth <= 640; };
  function get(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function S() { return window.Samsam; }
  function ready() { return !!(S() && S().isReady && S().isReady() && S().user && S().user()); }
  // inside the app (a page in a frame of the main page) → the main page does everything
  function top() { try { return window.parent !== window && window.parent.SamsamSettings && window.parent.cpShell ? window.parent : null; } catch (_) { return null; } }
  var onMain = function () { return !!window.cpShell; };

  // ── the app on your phone (PWA): home-screen icon, opens without internet (sw.js) ──
  var installEvt = null;
  addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; if ($('cpSet')) draw(); });
  addEventListener('appinstalled', function () { installEvt = null; if ($('cpSet')) draw(); });
  function standalone() { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (_) { return false; } }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  if ('serviceWorker' in navigator && window.parent === window && (location.protocol === 'https:' || get('samsam_sw_test', '') === '1')) {
    var reg = function () { navigator.serviceWorker.register('./sw.js').catch(function () {}); };
    if (doc.readyState === 'complete') reg(); else addEventListener('load', reg);
  }
  // how to add the app to the home screen in THIS browser (each one hides it somewhere else)
  function installHow() {
    var ua = navigator.userAgent || '';
    if (isIOS()) return /CriOS|FxiOS|EdgiOS|DuckDuckGo|OPiOS/.test(ua)
      ? 'On iPhone: tap Share (the square with the arrow — in the address bar or the menu) → “Add to Home Screen” → Add. (If you don\'t see it, open this page in Safari.)'
      : 'In Safari: tap Share (the square with the arrow) → “Add to Home Screen” → Add.';
    if (/DuckDuckGo/i.test(ua)) return 'In DuckDuckGo: open the menu (top right) → “Add to Home Screen”.';
    if (/SamsungBrowser/i.test(ua)) return 'In Samsung Internet: tap ☰ (menu, bottom right) → “Add page to” → “Home screen”.';
    if (/Firefox|FxA/i.test(ua)) return 'In Firefox: tap ⋮ (menu) → “Add app to Home screen” (or “Install”).';
    if (/EdgA|Edg\//.test(ua)) return 'In Edge: tap ⋯ (menu, bottom) → “Add to phone” → “Install”.';
    if (/OPR|Opera/.test(ua)) return 'In Opera: tap ⋮ (menu) → “Add to → Home screen”.';
    if (/Chrome/.test(ua)) return 'In Chrome: tap ⋮ (menu) → “Install app” or “Add to Home screen”.';
    return 'In your browser\'s menu, look for “Add to Home screen” (or “Install app”). Chrome and Samsung Internet support it best.';
  }
  function installApp() {
    if (installEvt) { var ev = installEvt; ev.prompt(); (ev.userChoice || Promise.resolve()).then(function () { installEvt = null; draw(); }); return; }
    var msg = standalone() ? 'Cute Portfolio is already on your home screen — it opens like an app, also without internet (with your last numbers).' : installHow();
    if (window.CPDialog) CPDialog.alert(msg, { title: 'Install the app' });
  }

  // ── what each line opens ──
  function goMain(act) {   // a page opened on its own: the editor is on the main page
    location.href = 'index.html#set=' + encodeURIComponent(act);
  }
  function goPlan(tab) {
    var s = S(); if (s && s.saveExit) s.saveExit({ tab: tab }).catch(function () {});
    if (window.cpShell) { window.cpShell.go('accumulation'); return; }
    if (/accumulation\.html/.test(location.pathname)) { location.reload(); return; }
    location.href = 'accumulation.html';
  }
  // the Worker (/key): a member's own Claude key, and their ⭐ premium / 💛 supporter status
  var WORKER_KEY = 'https://samsam-analysis.dr-samir-saad-1981.workers.dev/key', BOT = 'https://t.me/samsam_portfolio_bot';
  function workerCall(body) {
    return S().idToken().then(function (t) {
      if (!t) throw new Error('Sign in first.');
      return fetch(WORKER_KEY, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ idToken: t }, body)) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ('Error ' + r.status)); return j; }); });
    });
  }
  var memberSt = null, memberAsked = false;   // { premium, premUntil, premSrc, supporter, starsPaid, has, tail }
  function isMember() { var s = S(); return !!(s && s.isOwner && !s.isOwner()); }
  function loadMemberSt() {
    if (memberAsked || !isMember()) return; memberAsked = true;
    workerCall({ action: 'status' }).then(function (st) { memberSt = st; try { localStorage.setItem('cp-support-st', JSON.stringify({ premium: !!st.premium, supporter: !!st.supporter, t: Date.now() })); } catch (_) {} draw(); }).catch(function () { memberAsked = false; });
  }
  function untilTxt(ms) { return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  var ACT = {
    guide: function () {   // 📘 the guide (loaded only when opened)
      if (window.SamsamGuide) { SamsamGuide.open(); return; }
      var me = doc.querySelector('script[src*="samsam-settings.js"]'), v = me && (me.getAttribute('src').split('?')[1] || '');
      var sc = doc.createElement('script'); sc.src = 'samsam-guide.js' + (v ? '?' + v : ''); sc.onload = function () { window.SamsamGuide && SamsamGuide.open(); };
      doc.head.appendChild(sc);
    },
    admin: function () {   // 🛠 the owner's dashboard (loaded only when opened)
      if (window.SamsamAdmin) { SamsamAdmin.open(); return; }
      var me = doc.querySelector('script[src*="samsam-settings.js"]'), v = me && (me.getAttribute('src').split('?')[1] || '');
      var sc = doc.createElement('script'); sc.src = 'samsam-admin.js' + (v ? '?' + v : ''); sc.onload = function () { window.SamsamAdmin && SamsamAdmin.open(); };
      doc.head.appendChild(sc);
    },
    support: function () {   // 💛 Support Cute Portfolio & Channel (loaded only when opened)
      if (window.SamsamSupport) { SamsamSupport.open(); return; }
      var me = doc.querySelector('script[src*="samsam-settings.js"]'), v = me && (me.getAttribute('src').split('?')[1] || '');
      var sc = doc.createElement('script'); sc.src = 'samsam-support.js' + (v ? '?' + v : ''); sc.onload = function () { window.SamsamSupport && SamsamSupport.open(); };
      doc.head.appendChild(sc);
    },
    alerts: function () { S().openAlerts(); },
    tglink: function () {   // a one-time code → send it to the bot (or open the bot with it)
      S().linkTelegram().then(function (r) {
        var msg = 'Your code (10 minutes): ' + r.code + '\n\nSend it to the bot as  /link ' + r.code + '  — or tap “Open the bot”. The bot then reads this portfolio for you (only you).';
        var ask = window.CPDialog ? CPDialog.confirm(msg, { title: 'Link the Telegram bot', icon: 'link', okText: 'Open the bot' }) : Promise.resolve(false);
        return ask.then(function (go) { if (go) window.open('https://t.me/samsam_portfolio_bot?start=L' + r.code, '_blank', 'noopener'); });
      }).catch(function (e) { if (window.CPDialog) CPDialog.alert('Could not make a code — ' + ((e && e.message) || e)); });
    },
    claudekey: function () {   // 🔑 an invited member's own Claude API key → the Worker (sent once, kept encrypted there, never shown again)
      var D = window.CPDialog, call = workerCall;
      call({ action: 'status' }).then(function (st) {
        if (st.has) {
          return D.confirm('Your own Claude key (…' + st.tail + ') is on: your questions, voice notes and AI Analysis run on it — on your Anthropic bill — with high limits.\n\nRemove it?', { title: 'My Claude key', icon: 'key', okText: 'Remove', danger: true })
            .then(function (go) { if (go) return call({ action: 'delete' }).then(function () { return D.alert('Removed — you are back on the standard limits.', { title: 'My Claude key', icon: 'key' }); }); });
        }
        return D.prompt('Paste your Claude API key (from console.anthropic.com → API keys). It is sent once, checked with Claude, then kept encrypted — nobody can see it again, and you can remove it any time.\n\nWith it: 100 questions a day, voice notes, and 10 AI Analysis reports — billed to your Anthropic account.', { title: 'My Claude key', icon: 'key', okText: 'Save', placeholder: 'sk-ant-…', secret: true })
          .then(function (k) {
            if (!k || !String(k).trim()) return;
            return call({ action: 'set', key: String(k).trim() }).then(function (r) { return D.alert('Saved ✅ (…' + r.tail + '). The bot and AI Analysis use your key now.', { title: 'My Claude key', icon: 'key' }); });
          });
      }).catch(function (e) { if (D) D.alert(String((e && e.message) || e), { title: 'My Claude key', icon: 'key' }); });
    },
    import: function () { window.SamsamImport && SamsamImport.open(); },
    rewards: function () { if (window.SamsamRewards) SamsamRewards.open(); else goMain('rewards'); },
    wallets: function () { if (window.SamsamWallets) SamsamWallets.open(); else goMain('wallets'); },
    backup: function () { S().downloadBackup().catch(function () {}); },
    recover: function () { location.href = 'recover.html'; },
    install: function () { installApp(); },
    signout: function () { S().signOut(); },
    signal: function () { if (window.openSignalEdit) openSignalEdit(); else goMain('signal'); },
    targets: function () { if (window.openTargets) openTargets(); else goMain('targets'); },
    baseline: function () { if (window.openBaselineEdit) openBaselineEdit(); else goMain('baseline'); },
    cats: function () { if (window.openCatManager && onMain()) openCatManager(); else if (window.openCatManager) openCatManager(); else goMain('cats'); },
    exit: function () { goPlan('exit'); },
    dca: function () { goPlan('accum'); },
  };

  // the window each line opens: when it closes again, Settings comes back
  var OPENS = { alerts: '#cpAlerts', signal: '#sgModal', targets: '#tgModal', baseline: '#blModal', cats: '#catMgrModal', import: '#impBd', wallets: '#cpWal', rewards: '#cpRew' };
  function shownNow(sel) {
    var e = doc.querySelector(sel); if (!e) return false;
    var cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && e.getClientRects().length > 0;
  }
  function backAfter(act) {
    var sel = OPENS[act]; if (!sel) return;
    var seen = false, n = 0, iv = setInterval(function () {
      var on = shownNow(sel); if (on) seen = true;
      if ((seen && !on) || (!seen && ++n > 20)) { clearInterval(iv); if (seen && !$('cpSet') && !doc.querySelector('#ssPw,#cpDialog')) open(); }
    }, 250);
  }
  // ── the current values ──
  function lastBackup() {
    var at = Date.parse(S().lastBackupAt && S().lastBackupAt()) || 0;
    if (!at) return { text: 'Never', old: true };
    var days = Math.floor((Date.now() - at) / 864e5);
    return { text: days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days + ' days ago', old: days >= 30 };
  }
  function val(k) {
    var s = S(), st = s.getState() || {};
    try {
      if (k === 'account') { var u = s.user(); return (u ? u.email || 'Signed in' : 'Not signed in') + (memberSt && memberSt.premium ? ' · ⭐ Premium' : '') + (memberSt && memberSt.supporter ? ' · 💛 Supporter' : ''); }
      if (k === 'support') { var m2 = memberSt; return m2 && (m2.premium || m2.supporter) ? (m2.premium ? '⭐ Premium' + (m2.premUntil ? ' until ' + untilTxt(m2.premUntil) : '') + ' · ' : '') + '💛 thank you!' : 'Free & non-profit · optional support · ⭐ Premium'; }
      if (k === 'backup') { var b = lastBackup(); return '<span' + (b.old ? ' class="st-warn"' : '') + '>Last backup: ' + b.text + '</span>'; }
      if (k === 'alerts') {
        var a = s.getAlerts(), keys = ['brief', 'weekly', 'moves', 'signals', 'plan', 'buy', 'tp', 'macro', 'drift', 'dca', 'sentiment', 'etf', 'health'];
        var on = keys.filter(function (x) { return a[x]; }).length;
        return (a.lang === 'ar' ? 'العربية' : 'English') + ' · ' + on + ' of ' + keys.length + ' on' + (a.brief ? ' · brief ' + a.briefTime : '');
      }
      if (k === 'signal') { var r = s.getSignalRules(); return 'Reinforce ' + r.reinforce + '% · Sell ' + r.sell + '%' + (r.smart ? ' · Smart on' : ''); }
      if (k === 'targets') { var t = s.getTargets(); return t ? Object.keys(t.cats).length + ' categories · ±' + t.band + '%' : 'Not set'; }
      if (k === 'baseline') { var bl = s.getBaseline(); return bl && bl.date ? new Date(bl.date + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'; }
      if (k === 'cats') { var T = window.SamsamTaxonomy, n = T ? Object.keys(T.labels).filter(function (x) { return !T.isRemoved(x); }).length : 0; return n ? n + ' categories · names & colours' : ''; }
      if (k === 'exit') { var ex = st.exit || (s.getExit && s.getExit()), steps = ex && ex.steps; return steps ? 'Sell at ×' + steps.mults.join(' / ×') + ' · ' + ((ex.plan || []).length) + ' coin' + ((ex.plan || []).length === 1 ? '' : 's') : ''; }
      if (k === 'wallets') {
        var ws = s.getWallets ? s.getWallets() : [], L = window.SamsamWallets && SamsamWallets.last(), c = L && SamsamWallets.compare(L);
        if (!ws.length) return 'Compare your real wallets with the app';
        return ws.length + ' wallet' + (ws.length === 1 ? '' : 's') + (c ? ' · ' + (c.more.length + c.less.length ? (c.more.length + c.less.length) + ' to look at' : 'all match') : ' · not checked yet');
      }
      if (k === 'rewards') {
        var R = window.SamsamRewards && SamsamRewards.data('all');
        return R && R.rows.length ? (window.SamsamFmt ? SamsamFmt.usd(R.tot.all) : '') + ' · staking, mining, airdrops' : 'Staking rewards, mined BTC, airdrops';
      }
      if (k === 'install') {
        var off = 'serviceWorker' in navigator && navigator.serviceWorker.controller ? ' · works offline' : '';
        return standalone() ? 'On your home screen' + off : installEvt ? 'Add it to your home screen — opens like an app' : isIOS() ? 'Safari: Share → Add to Home Screen' : 'Browser menu → Install app';
      }
      if (k === 'guide') return 'How the app and the bot work · English / العربية';
      if (k === 'dca') { var n2 = (st.accumPlan || []).filter(function (x) { return x.dca && x.dca.usd > 0; }).length; return n2 ? n2 + ' coin' + (n2 === 1 ? '' : 's') + ' with a regular buy' : 'None yet'; }
    } catch (_) {}
    return '';
  }
  function version() {
    var sc = [].slice.call(doc.scripts).map(function (x) { return x.src; }).filter(function (x) { return /samsam-settings\.js\?v=\d{12}/.test(x); })[0];
    var v = sc && sc.match(/v=(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)/);
    if (!v) return '—';
    var d = new Date(+v[1], +v[2] - 1, +v[3], +v[4], +v[5]);
    return v[1] + v[2] + v[3] + '.' + v[4] + v[5] + ' · ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // ── the screen ──
  // a line: [key, icon, title, action]  ·  a choice: { seg: key, title, opts: [[value, label]], get(), set(v) }
  var SECTIONS = [
    ['Account & data', [['account', 'cloud', 'Account', 'signout', 'Sign out'], ['backup', 'lock', 'Backup', 'backup', 'Back up now'], ['recover', 'lifebuoy', 'Recover Data', 'recover'], ['import', 'upload', 'Import from exchange', 'import'], ['wallets', 'wallet', 'Wallets & check', 'wallets'], ['rewards', 'coins', 'Rewards & mining', 'rewards']]],
    ['Alerts', [['alerts', 'bell', 'Telegram alerts', 'alerts'], ['tglink', 'link', 'Link the Telegram bot', 'tglink'], ['claudekey', 'key', 'My Claude key', 'claudekey']]],
    ['Admin', [['admin', 'shield', 'Admin dashboard', 'admin']]],
    ['Support', [['support', 'heart', 'Support Cute Portfolio & Channel 💛', 'support']]],
    ['Investing rules', [['signal', 'sliders', 'Signal thresholds', 'signal'], ['targets', 'target', 'Target allocation', 'targets'], ['cats', 'note', 'Categories', 'cats'],
      ['baseline', 'history', 'Baseline', 'baseline'], ['exit', 'exit', 'Exit plan', 'exit'], ['dca', 'calc', 'DCA (regular buys)', 'dca']]],
    ['Display', [
      { seg: 'theme', title: 'Theme', opts: [['light', 'Light'], ['dark', 'Dark']], get: function () { return window.SamsamUI ? SamsamUI.currentTheme() : 'dark'; },
        set: function (v) { if (window.SamsamUI && SamsamUI.currentTheme() !== v) SamsamUI.toggleTheme(); } },
      { seg: 'range', title: 'Charts open on', opts: [['24h', '24h'], ['7d', '7d'], ['30d', '30d'], ['90d', '90d'], ['all', 'All']], get: function () { return get(K.range, 'all'); },
        set: function (v) { put(K.range, v); if (window.setHoldingsRange) setHoldingsRange(v); } },
      // the coin list (main page) and the Exit Strategy list — phones keep their own choice
      { seg: 'view', title: 'Lists shown as', opts: [['cards', 'Cards'], ['table', 'Table']], get: function () { return get(phone() ? K.viewPhone : K.view, 'cards') === 'table' ? 'table' : 'cards'; },
        set: function (v) { put(phone() ? K.viewPhone : K.view, v); put(K.exitView, v); if (window.applyView) applyView(v); } },
      { seg: 'fee', title: 'Buying fee in', opts: [['usd', 'USD'], ['coin', 'The coin']], get: function () { return get(K.fee, 'usd') === 'coin' ? 'coin' : 'usd'; },
        set: function (v) { put(K.fee, v); } },
    ]],
    ['About', [['guide', 'book', 'Guide', 'guide'], ['install', 'download', 'Install the app', 'install'], ['version', 'sparkles', 'Version', null]]],
  ];
  var CSS =
    '#cpSet{position:fixed;inset:0;z-index:99994;background:rgba(2,6,23,.55);display:flex;align-items:flex-end;justify-content:center}' +
    '@media (min-width:640px){#cpSet{align-items:center;padding:16px}}' +
    '#cpSet .st-box{width:min(520px,100%);max-height:92vh;overflow:auto;background:var(--card-solid,var(--bg2,#111827));color:var(--fg,#e5e7eb);border:1px solid var(--border,#374151);border-radius:18px 18px 0 0;' +
      'padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));font:14px/1.45 system-ui,-apple-system,"Inter",sans-serif;box-shadow:0 -10px 40px rgba(0,0,0,.35);box-sizing:border-box}' +
    '@media (min-width:640px){#cpSet .st-box{border-radius:18px}}' +
    '#cpSet .st-h{display:flex;align-items:center;gap:10px;position:sticky;top:-16px;z-index:3;margin:-16px -16px 4px;padding:16px 16px 10px;background:inherit;border-radius:inherit;border-bottom:1px solid var(--border,rgba(148,163,184,.15))}' +
    '#cpSet .st-h b{font-size:1.05rem;flex:1}' +
    '#cpSet .st-hic{width:36px;height:36px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:rgba(124,58,237,.15);color:#a78bfa}' +
    '[data-theme="light"] #cpSet .st-hic{color:#7c3aed}' +
    '#cpSet .st-x{background:none;border:none;color:inherit;opacity:.7;cursor:pointer;padding:6px;line-height:0}' +
    '#cpSet .st-sec{margin:16px 0 4px;font-size:.72rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--fg2,#94a3b8)}' +
    '#cpSet .st-list{border:1px solid var(--border,rgba(148,163,184,.2));border-radius:14px;overflow:hidden}' +
    '#cpSet .st-row{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:12px;width:100%;padding:11px 12px;border-top:1px solid var(--border,rgba(148,163,184,.15));cursor:pointer;min-height:52px}' +
    '#cpSet .st-list>:first-child{border-top:none}' +
    '#cpSet .st-row:focus-visible{outline:2px solid #7c3aed;outline-offset:-2px}' +
    '@media (hover:hover){#cpSet .st-go:hover{background:rgba(148,163,184,.08)}}' +
    '#cpSet .st-t b .cp-hint{vertical-align:-2px}' +
    '#cpSet .st-row.st-static{cursor:default}' +
    '#cpSet .st-ic{width:30px;height:30px;flex:none;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;background:rgba(148,163,184,.12)}#cpSet .st-ic .ss-ic{margin:0}' +
    '#cpSet .st-t{flex:1;min-width:0;display:flex;flex-direction:column}#cpSet .st-t b{font-weight:700;font-size:.92rem}' +
    '#cpSet .st-t span{font-size:.78rem;color:var(--fg2,#94a3b8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#cpSet .st-warn{color:#f59e0b!important}' +
    '#cpSet .st-chev{width:16px;height:16px;flex:none;opacity:.5}' +
    '#cpSet .st-act{flex:none;font-size:.76rem;font-weight:700;padding:6px 10px;border-radius:8px;border:1px solid var(--border,rgba(148,163,184,.3));background:transparent;color:inherit;cursor:pointer;font-family:inherit}' +
    '#cpSet .st-seg-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 12px;border-top:1px solid var(--border,rgba(148,163,184,.15))}' +
    '#cpSet .st-seg-row b{font-weight:700;font-size:.9rem}' +
    '#cpSet .st-seg{display:inline-flex;gap:3px;background:rgba(148,163,184,.12);padding:3px;border-radius:10px;flex-wrap:wrap}' +
    '#cpSet .st-seg button{border:none;background:transparent;color:inherit;font:inherit;font-size:.78rem;font-weight:700;padding:6px 11px;border-radius:8px;cursor:pointer;opacity:.7}' +
    '#cpSet .st-seg button[aria-checked="true"]{opacity:1;background:#7c3aed;color:#fff}' +
    '#cpSet .st-later{margin-top:14px;font-size:.74rem;color:var(--fg2,#94a3b8);text-align:center}' +
    '.ss-set-hdr .ss-icon{width:18px;height:18px}' +
    '@media print{.ss-set-hdr,#cpSet{display:none!important}}';

  var HINT = function (k) { return ' <button type="button" class="cp-hint" data-hint="' + k + '" aria-label="About ' + k + '"></button>'; };
  function line(r) {
    var k = r[0], v = k === 'version' ? version() : val(k), act = r[3], extra = r[4];
    if (k === 'account' || k === 'backup') {   // a value + a small button
      return '<div class="st-row st-static"><span class="st-ic">' + IC(r[1]) + '</span><span class="st-t"><b>' + E(r[2]) + (k === 'backup' ? HINT('backup') : '') + '</b><span>' + (k === 'backup' ? v : E(v)) + '</span></span>' +
        '<button type="button" class="st-act" data-act="' + act + '" id="stAct_' + k + '">' + E(extra) + '</button></div>';
    }
    if (!act) return '<div class="st-row st-static"><span class="st-ic">' + IC(r[1]) + '</span><span class="st-t"><b>' + E(r[2]) + '</b><span>' + E(v) + '</span></span></div>';
    return '<div role="button" tabindex="0" class="st-row st-go" data-act="' + act + '" id="stRow_' + k + '"><span class="st-ic">' + IC(r[1]) + '</span><span class="st-t"><b>' + E(r[2]) + (k === 'recover' ? HINT('recover') : '') + '</b>' +
      (v ? '<span>' + E(v) + '</span>' : '') + '</span>' + CHEV + '</div>';
  }
  function choice(c) {
    var cur = c.get();
    return '<div class="st-seg-row"><b>' + E(c.title) + '</b><span class="st-seg" role="radiogroup" aria-label="' + E(c.title) + '">' +
      c.opts.map(function (o) { return '<button type="button" role="radio" data-seg="' + c.seg + '" data-v="' + o[0] + '" aria-checked="' + (o[0] === cur) + '">' + E(o[1]) + '</button>'; }).join('') + '</span></div>';
  }
  function draw() {
    var box = $('cpSet'); if (!box) return;
    var hasImport = !!window.SamsamImport;
    loadMemberSt();
    box.querySelector('.st-body').innerHTML = SECTIONS.map(function (s) {
      var member = !!(S() && S().isOwner && !S().isOwner());   // 🔑 only invited members bring their own key
      var rows = s[1].filter(function (r) { return r.seg || ((r[0] !== 'import' || hasImport) && (r[0] !== 'claudekey' || member) && (r[0] !== 'alerts' || !member)); });   // 🔔 Telegram alerts (GitHub) reach Samir only: hidden for members
      if (!member) rows = rows.filter(function (r) { return r.seg || r[0] !== 'support'; });
      else rows = rows.filter(function (r) { return r.seg || r[0] !== 'admin'; });   // 🛠 the dashboard: Samir only   // ⭐💛 for invited members (Samir: /stats in the bot)
      if (!rows.length) return '';
      return '<div class="st-sec">' + E(s[0]) + '</div><div class="st-list">' + rows.map(function (r) { return r.seg ? choice(r) : line(r); }).join('') + '</div>';
    }).join('') + '<div class="st-later">More settings (app language, AI) will be added here.</div>';
  }
  function run(act) {
    var keep = act === 'backup' || act === 'install';
    if (!keep) close();
    ACT[act]();
    if (keep) setTimeout(draw, 1500); else backAfter(act);
  }
  function close() { var b = $('cpSet'); if (b) b.remove(); doc.removeEventListener('keydown', esc, true); }
  function esc(e) { if (e.key === 'Escape' && !doc.querySelector('#cpAlerts,#ssPw,#cpDialog,#impBd.show,#cpWal,.cph')) { e.stopPropagation(); close(); } }
  function open() {
    var t = top(); if (t) { t.SamsamSettings.open(); return; }
    if (!ready()) return;
    if (!$('stCss')) { var st = doc.createElement('style'); st.id = 'stCss'; st.textContent = CSS; doc.head.appendChild(st); }
    close();
    var el = doc.createElement('div'); el.id = 'cpSet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Settings');
    el.innerHTML = '<div class="st-box"><div class="st-h"><span class="st-hic">' + GEAR + '</span><b>Settings</b><button type="button" class="st-x" aria-label="Close">' + IC('x') + '</button></div><div class="st-body"></div></div>';
    doc.body.appendChild(el); draw();
    el.addEventListener('click', function (e) {
      if (e.target === el || e.target.closest('.st-x')) { close(); return; }
      var sg = e.target.closest('[data-seg]');
      if (sg) { var c = SECTIONS.reduce(function (all, sec) { return all.concat(sec[1]); }, []).filter(function (x) { return x.seg === sg.dataset.seg; })[0]; if (c) { c.set(sg.dataset.v); draw(); } return; }
      if (e.target.closest('.cp-hint')) return;   // ⓘ explains, it doesn't open the line
      var a = e.target.closest('[data-act]'); if (!a || !ACT[a.dataset.act]) return;
      run(a.dataset.act);
    });
    el.addEventListener('keydown', function (e) {
      var a = e.target.closest && e.target.closest('.st-go'); if (!a || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault(); run(a.dataset.act);
    });
    doc.addEventListener('keydown', esc, true);
    setTimeout(function () { var f = el.querySelector('.st-row,button'); if (f) f.focus(); }, 0);
  }

  // ⚙️ in every page header, just left of ☁️ (samsam-cloud.js adds ☁️ next to each light/dark button)
  function addGear(cloud) {
    if (!cloud || cloud.__ssSet) return; cloud.__ssSet = true;
    var b = doc.createElement('button'); b.type = 'button'; b.className = 'ss-theme-btn ss-set-hdr'; b.title = 'Settings'; b.setAttribute('aria-label', 'Settings'); b.innerHTML = GEAR;
    b.addEventListener('click', function (e) { e.stopPropagation(); open(); });
    cloud.parentNode.insertBefore(b, cloud);
    var cs = getComputedStyle(cloud);
    if (cs.position === 'absolute') Object.assign(b.style, { position: 'absolute', top: cs.top, right: (parseFloat(cs.right) + cloud.offsetWidth + 8) + 'px', zIndex: cs.zIndex });
  }
  function scan() { [].forEach.call(doc.querySelectorAll('.ss-sync-hdr'), addGear); }
  new MutationObserver(function () { scan(); }).observe(doc.documentElement, { childList: true, subtree: true });
  if (doc.readyState !== 'loading') scan(); else doc.addEventListener('DOMContentLoaded', scan);

  // the main page opened with #set=… (from a page opened on its own) → open that editor once the portfolio is ready
  var want = (location.hash.match(/^#set=([a-z]+)/) || [])[1];
  if (want && ACT[want]) {
    history.replaceState(null, '', location.pathname + location.search);
    var tries = 0, iv = setInterval(function () { if (ready() || ++tries > 60) { clearInterval(iv); if (ready()) { ACT[want](); backAfter(want); } } }, 250);
  }
  window.SamsamSettings = { open: open, close: close, run: function (a) { var t = top(); if (t) { t.SamsamSettings.run(a); return; } if (ACT[a]) ACT[a](); } };
})();
