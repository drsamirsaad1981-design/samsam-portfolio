// samsam-guide.js — 📘 the guide (Settings → Guide): the same text as the bot's /guide (guide.json), English / العربية,
// every part closed until tapped. Loaded only when opened.
(function () {
  'use strict';
  var doc = document, GS = {}, G = null, lang = null, which = 'app';   // two guides: 📱 the app (guide-app.json) · 🤖 the bot (guide.json)
  var FILE = { app: 'guide-app.json', bot: 'guide.json' };
  var $ = function (id) { return doc.getElementById(id); };
  var IC = function (n) { return window.SamsamUI && SamsamUI.ic ? SamsamUI.ic(n, { solo: true, size: 16 }) : ''; };
  var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var CSS =
    '#cpGuide{position:fixed;inset:0;z-index:99995;background:rgba(2,6,23,.55);display:flex;align-items:flex-end;justify-content:center}' +
    '@media (min-width:640px){#cpGuide{align-items:center;padding:16px}}' +
    '#cpGuide .gd-box{width:min(600px,100%);max-height:94vh;overflow:auto;background:var(--card-solid,var(--bg2,#111827));color:var(--fg,#e5e7eb);border:1px solid var(--border,#374151);border-radius:18px 18px 0 0;' +
      'padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));font:14px/1.5 system-ui,-apple-system,"Inter",sans-serif;box-shadow:0 -10px 40px rgba(0,0,0,.35);box-sizing:border-box}' +
    '@media (min-width:640px){#cpGuide .gd-box{border-radius:18px}}' +
    '#cpGuide .gd-h{display:flex;align-items:center;gap:10px;position:sticky;top:-16px;z-index:3;margin:-16px -16px 8px;padding:16px 16px 10px;background:inherit;border-radius:inherit;border-bottom:1px solid var(--border,rgba(148,163,184,.15))}' +
    '#cpGuide .gd-h b{font-size:1.05rem;flex:1}#cpGuide .gd-x{background:none;border:none;color:inherit;opacity:.75;cursor:pointer;padding:6px;line-height:0}' +
    '#cpGuide .gd-lang{display:inline-flex;gap:3px;background:rgba(148,163,184,.12);padding:3px;border-radius:10px}#cpGuide .gd-lang button{border:none;background:transparent;color:inherit;font:inherit;font-size:.78rem;font-weight:700;padding:5px 10px;border-radius:8px;cursor:pointer;opacity:.7}' +
    '#cpGuide .gd-lang button[aria-pressed="true"]{opacity:1;background:#7c3aed;color:#fff}' +
    '#cpGuide .gd-tabs{display:flex;gap:6px;margin:4px 0 6px}#cpGuide .gd-tabs button{flex:1;border:1px solid var(--border,rgba(148,163,184,.3));background:transparent;color:inherit;font:inherit;font-size:.86rem;font-weight:700;padding:8px;border-radius:10px;cursor:pointer;opacity:.75}' +
    '#cpGuide .gd-tabs button[aria-pressed="true"]{opacity:1;border-color:#7c3aed;background:rgba(124,58,237,.15)}' +
    '#cpGuide .gd-intro{color:var(--fg2,#94a3b8);font-size:.86rem;margin:4px 0 8px}' +
    '#cpGuide details{border:1px solid var(--border,rgba(148,163,184,.2));border-radius:12px;margin-top:8px;overflow:hidden}' +
    '#cpGuide summary{list-style:none;cursor:pointer;padding:11px 12px;font-weight:700}#cpGuide summary::-webkit-details-marker{display:none}' +
    '#cpGuide .gd-body{padding:0 12px 12px;font-size:.88rem}#cpGuide .gd-body p{margin:6px 0}#cpGuide .gd-body ul{margin:4px 0;padding-inline-start:18px}#cpGuide .gd-body li{margin:7px 0;line-height:1.55}#cpGuide .gd-body li.sub{list-style:circle;margin-inline-start:14px}#cpGuide .gd-grp{margin:14px 2px 2px;font-size:.74rem;font-weight:800;letter-spacing:.04em;color:var(--fg2,#94a3b8)}' +
    '#cpGuide .gd-sum{font-style:italic;color:var(--fg2,#94a3b8)}#cpGuide .gd-body ol{margin:6px 0;padding:0;list-style:none;counter-reset:gd}#cpGuide .gd-body ol li{margin:8px 0;line-height:1.55;counter-increment:gd;display:flex;gap:8px;align-items:flex-start}' +
    '#cpGuide .gd-body ol li::before{content:counter(gd);flex:0 0 20px;height:20px;margin-top:1px;border-radius:50%;background:#7c3aed;color:#fff;font-size:.72rem;font-weight:800;display:flex;align-items:center;justify-content:center}' +
    '#cpGuide .gd-tip{margin:10px 0 2px;padding:8px 10px;border-radius:10px;background:rgba(124,58,237,.12);border-inline-start:3px solid #7c3aed}#cpGuide code{font-size:.85em;padding:1px 5px;border-radius:5px;background:rgba(148,163,184,.15)}';

  function draw() {
    var box = $('cpGuideBody'); if (!box) return;
    G = GS[which] || null;
    doc.querySelectorAll('#cpGuide .gd-tabs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.w === which)); b.textContent = b.dataset.w === 'app' ? (lang === 'ar' ? '📱 التطبيق' : '📱 The app') : (lang === 'ar' ? '🤖 البوت' : '🤖 The bot'); });
    if (!G) { box.innerHTML = '<p class="gd-intro">' + (lang === 'ar' ? 'جارٍ التحميل…' : 'Loading…') + '</p>'; load(which); return; }
    var L = lang, ar = L === 'ar';
    box.setAttribute('dir', ar ? 'rtl' : 'ltr'); box.setAttribute('lang', L);
    if (ar) box.removeAttribute('data-no-tr'); else box.setAttribute('data-no-tr', '');   // the English guide stays English inside the Arabic app
    var isl = function (h) { return ar ? h.replace(/<(code|b|i)>([^<]*)<\/\1>/g, function (m, t, x) { return /[\u0600-\u06FF]/.test(x) ? m : '<bdi>' + m + '</bdi>'; })
      .replace(/(^|[\s(])(\/[a-z]+(?: CODE)?)(?=$|[\s),.؛،])/g, function (m, a, c) { return a + '<bdi>' + c + '</bdi>'; }) : h; };   // English islands in Arabic
    var part = function (s) {   // the guide's own text (from this site), not user input
      return '<details data-k="' + E(s.k) + '"><summary>' + s.e + ' ' + E(s.t[L]) + '</summary><div class="gd-body">' +
        (s.s ? '<p class="gd-sum">' + isl(s.s[L]) + '</p>' : '') +
        '<ol>' + s[L].map(function (line) { return '<li><span>' + isl(line) + '</span></li>'; }).join('') + '</ol>' +
        (s.tip ? '<p class="gd-tip">💡 <b>' + (ar ? 'نصيحة' : 'Tip') + ':</b> ' + isl(s.tip[L]) + '</p>' : '') + '</div></details>';
    };
    var groups = G.groups ? G.groups.map(function (g) { return { g: g, items: G.sections.filter(function (s) { return s.g === g.k; }) }; }).filter(function (x) { return x.items.length; }) : [{ g: null, items: G.sections }];
    box.innerHTML = '<p class="gd-intro">' + E(G.intro[L]) + '</p>' + groups.map(function (x) {
      return (x.g ? '<div class="gd-grp">' + x.g.e + ' ' + E(x.g.t[L]) + '</div>' : '') + x.items.map(part).join('');
    }).join('');
    var t = $('cpGuideTitle'); if (t) t.textContent = ar ? 'الدليل' : 'Guide';
    doc.querySelectorAll('#cpGuide .gd-lang button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.l === L)); });
  }
  function close() { var b = $('cpGuide'); if (b) b.remove(); doc.removeEventListener('keydown', esc, true); }
  function esc(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
  function load(w) {
    if (GS[w] || load[w]) return; load[w] = true;
    var me = doc.querySelector('script[src*="samsam-settings.js"]'), v = me && (me.getAttribute('src').split('?')[1] || '');
    fetch(FILE[w] + (v ? '?' + v : '')).then(function (r) { return r.json(); }).then(function (j) { GS[w] = j; load[w] = false; draw(); })
      .catch(function () { load[w] = false; var bx = $('cpGuideBody'); if (bx && which === w) bx.innerHTML = '<p class="gd-intro">' + (lang === 'ar' ? 'تعذّر تحميل الدليل — تحقق من الإنترنت وحاول مرة أخرى.' : 'Could not load the guide — check the internet and try again.') + '</p>'; });
  }
  function open(l, w) {
    if (w === 'app' || w === 'bot') which = w;
    lang = l || lang || ((doc.documentElement.lang || navigator.language || 'en').slice(0, 2) === 'ar' ? 'ar' : 'en');
    if (!$('cpGuideCss')) { var st = doc.createElement('style'); st.id = 'cpGuideCss'; st.textContent = CSS; doc.head.appendChild(st); }
    close();
    var el = doc.createElement('div'); el.id = 'cpGuide'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Guide');
    el.innerHTML = '<div class="gd-box"><div class="gd-h"><span>📘</span><b id="cpGuideTitle">Guide</b><span class="gd-lang"><button type="button" data-l="en">English</button><button type="button" data-l="ar">العربية</button></span>' +
      '<button type="button" class="gd-x" aria-label="Close">' + IC('x') + '</button></div>' +
      '<div class="gd-tabs" role="tablist" data-no-tr><button type="button" data-w="app"></button><button type="button" data-w="bot"></button></div><div id="cpGuideBody"></div></div>';
    doc.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target === el || e.target.closest('.gd-x')) { close(); return; }
      var b = e.target.closest('[data-l]'); if (b) { lang = b.dataset.l; draw(); }
      var w = e.target.closest('[data-w]'); if (w) { which = w.dataset.w; draw(); var bx = $('cpGuide').querySelector('.gd-box'); if (bx) bx.scrollTop = 0; }
    });
    doc.addEventListener('keydown', esc, true);
    draw();
  }
  window.SamsamGuide = { open: open, close: close };
})();
