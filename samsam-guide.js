// samsam-guide.js — 📘 the guide (Settings → Guide): the same text as the bot's /guide (guide.json), English / العربية,
// every part closed until tapped. Loaded only when opened.
(function () {
  'use strict';
  var doc = document, G = null, lang = null;
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
    '#cpGuide .gd-intro{color:var(--fg2,#94a3b8);font-size:.86rem;margin:4px 0 8px}' +
    '#cpGuide details{border:1px solid var(--border,rgba(148,163,184,.2));border-radius:12px;margin-top:8px;overflow:hidden}' +
    '#cpGuide summary{list-style:none;cursor:pointer;padding:11px 12px;font-weight:700}#cpGuide summary::-webkit-details-marker{display:none}' +
    '#cpGuide .gd-body{padding:0 12px 12px;font-size:.88rem}#cpGuide .gd-body p{margin:6px 0}#cpGuide .gd-body ul{margin:4px 0;padding-inline-start:18px}#cpGuide .gd-body li{margin:7px 0;line-height:1.55}#cpGuide .gd-body li.sub{list-style:circle;margin-inline-start:14px}#cpGuide code{font-size:.85em;padding:1px 5px;border-radius:5px;background:rgba(148,163,184,.15)}';

  function draw() {
    var box = $('cpGuideBody'); if (!box) return;
    if (!G) { box.innerHTML = '<p class="gd-intro">Loading…</p>'; return; }
    var L = lang, ar = L === 'ar';
    box.setAttribute('dir', ar ? 'rtl' : 'ltr'); box.setAttribute('lang', L);
    box.innerHTML = '<p class="gd-intro">' + E(G.intro[L]) + '</p>' + G.sections.map(function (s) {
      return '<details data-k="' + E(s.k) + '"><summary>' + s.e + ' ' + E(s.t[L]) + '</summary><div class="gd-body">' +
        '<ul>' + s[L].map(function (line) { var sub = /^•\s/.test(line); line = sub ? line.slice(2) : line;
          if (ar) line = line.replace(/<(code|b|i)>([^<]*)<\/\1>/g, function (m, t, x) { return /[\u0600-\u06FF]/.test(x) ? m : '<bdi>' + m + '</bdi>'; });   // English islands in Arabic
          return '<li' + (sub ? ' class="sub"' : '') + '>' + line + '</li>'; }).join('') + '</ul></div></details>';   // the guide's own text (from this site), not user input
    }).join('');
    var t = $('cpGuideTitle'); if (t) t.textContent = G.title[L].replace(/^📘\s*/, '');
    doc.querySelectorAll('#cpGuide .gd-lang button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.l === L)); });
  }
  function close() { var b = $('cpGuide'); if (b) b.remove(); doc.removeEventListener('keydown', esc, true); }
  function esc(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
  function open(l) {
    lang = l || lang || ((doc.documentElement.lang || navigator.language || 'en').slice(0, 2) === 'ar' ? 'ar' : 'en');
    if (!$('cpGuideCss')) { var st = doc.createElement('style'); st.id = 'cpGuideCss'; st.textContent = CSS; doc.head.appendChild(st); }
    close();
    var el = doc.createElement('div'); el.id = 'cpGuide'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Guide');
    el.innerHTML = '<div class="gd-box"><div class="gd-h"><span>📘</span><b id="cpGuideTitle">Guide</b><span class="gd-lang"><button type="button" data-l="en">English</button><button type="button" data-l="ar">العربية</button></span>' +
      '<button type="button" class="gd-x" aria-label="Close">' + IC('x') + '</button></div><div id="cpGuideBody"></div></div>';
    doc.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target === el || e.target.closest('.gd-x')) { close(); return; }
      var b = e.target.closest('[data-l]'); if (b) { lang = b.dataset.l; draw(); }
    });
    doc.addEventListener('keydown', esc, true);
    draw();
    if (!G) {
      var me = doc.querySelector('script[src*="samsam-settings.js"]'), v = me && (me.getAttribute('src').split('?')[1] || '');
      fetch('guide.json' + (v ? '?' + v : '')).then(function (r) { return r.json(); }).then(function (j) { G = j; draw(); })
        .catch(function () { var bx = $('cpGuideBody'); if (bx) bx.innerHTML = '<p class="gd-intro">Could not load the guide — check the internet and try again.</p>'; });
    }
  }
  window.SamsamGuide = { open: open, close: close };
})();
