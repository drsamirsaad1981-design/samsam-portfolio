// Samsam Portfolio — the app's language (English / العربية).
//  · The choice lives on this device (localStorage 'cp-lang'), like the theme. Settings → Display switches it.
//  · Arabic: the page turns right-to-left; numbers, prices and tickers stay as they are (Latin digits, left-to-right).
//  · The words: samsam-ar.js holds the Arabic for each English wording (CPLang.add({...})). Every text on screen whose
//    English is in that list is shown in Arabic — also text the app draws later (a MutationObserver watches the page).
//  · Code that builds a sentence with numbers inside can call CPLang.t('English') or add a pattern with CPLang.rx().
//  · Anything inside [data-no-tr] / .notranslate, inputs, code and scripts is never touched.
(function () {
  'use strict';
  var KEY = 'cp-lang', lang = 'en';
  // the Arabic page: right-to-left, with the few things that must stay left-to-right (charts, numbers, code)
  var RTL_CSS =
    'html.cp-ar body,html.cp-ar button,html.cp-ar input,html.cp-ar select,html.cp-ar textarea{font-family:"Inter","Cairo",system-ui,-apple-system,"Segoe UI",sans-serif}' +
    'html.cp-ar #cpSet .st-box{font-family:"Inter","Cairo",system-ui,sans-serif}' +
    'html.cp-ar body{direction:rtl}' +
    'html.cp-ar svg,html.cp-ar canvas{direction:ltr}' +                                   // charts read left → right (time axis), like every trading app
    'html.cp-ar input[type=number],html.cp-ar input[type=date],html.cp-ar input[type=datetime-local],html.cp-ar input[type=email],html.cp-ar input[inputmode=decimal]{direction:ltr;text-align:right}' +
    'html.cp-ar svg:has(>path[d="m9 6 6 6-6 6"]),html.cp-ar svg:has(>path[d="m15 18-6-6 6-6"]){scale:-1 1}' +   // › and ‹ point the other way
    'html.cp-ar #altV,html.cp-ar #asV,html.cp-ar strong:has(>.bt-of){direction:ltr;unicode-bidi:isolate}' +   // 50/100 reads 50/100, not 100/ 50
    'html.cp-ar .mk-k{white-space:normal;min-width:0}html.cp-ar .mk-k>.ss-ic,html.cp-ar .mk-k>.cp-hint,html.cp-ar .mk-chev{flex-shrink:0}' +   // longer Arabic card titles wrap instead of pushing › and ⓘ out of the card
    'html.cp-ar .mk-gauge,html.cp-ar .mk-gauge-l,html.cp-ar .as-gauge,html.cp-ar .as-gl{direction:ltr}' +   // a scale reads Bitcoin ← → Altcoin like its colours
    // corner icons and buttons that sit at one side: the other side in Arabic
    'html.cp-ar .sum-card-icon,html.cp-ar .card-go,html.cp-ar .as-tile .tch,html.cp-ar #portfolioTable .th-sort{right:auto;left:14px}html.cp-ar #portfolioTable .th-sort{left:3px}' +
    'html.cp-ar .ss-search .ss-search-ic{left:auto;right:12px}html.cp-ar .mk-topmenu{left:auto;right:4px}' +
    'html.cp-ar .brand-name,html.cp-ar .cp-brand-n,html.cp-ar .mini-name{direction:ltr}' +
    'html.cp-ar pre{direction:ltr;unicode-bidi:isolate}html.cp-ar code{unicode-bidi:plaintext;font-family:inherit;letter-spacing:0}';   // a formula reads in its own language's direction
  try { if (localStorage.getItem(KEY) === 'ar') lang = 'ar'; } catch (_) {}
  var AR = lang === 'ar', H = document.documentElement;
  if (AR) {
    H.setAttribute('lang', 'ar'); H.setAttribute('dir', 'rtl'); H.classList.add('cp-ar');
    // Arabic letters: Cairo (Latin letters and digits keep Inter, so numbers look the same in both languages)
    var f = document.createElement('link'); f.rel = 'stylesheet'; f.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap'; document.head.appendChild(f);
    var st = document.createElement('style'); st.id = 'cpRtl'; st.textContent = RTL_CSS; document.head.appendChild(st);
  }

  var D = Object.create(null), RX = [];
  // a wording without its leading marks (emoji, ·, spaces) and trailing marks (":", "…", spaces) — "📊 Overview:" → "Overview"
  var SPLIT = /^([^\p{L}\p{N}$]*)([\s\S]*?)([\s:：…›»·,.!?]*)$/u;
  function look(s) {
    var v = D[s]; if (v != null) return v;
    for (var i = 0; i < RX.length; i++) { var m = s.match(RX[i][0]); if (m) return typeof RX[i][1] === 'function' ? RX[i][1].apply(null, m) : s.replace(RX[i][0], RX[i][1]); }
    return null;
  }
  // a number, price or "0.5 BTC" (no Arabic in it) is kept left-to-right inside the Arabic page: "+$1,234.56" stays "+$1,234.56"
  var LRI = '\u2066', PDI = '\u2069', ARABIC = /[\u0600-\u06FF]/;
  function iso(s) {
    if (s.indexOf(LRI) >= 0 || !/\d/.test(s) || ARABIC.test(s) || !/\S/.test(s)) return null;
    var m = s.match(/^(\s*)([\s\S]*?)(\s*)$/); return m[1] + LRI + m[2] + PDI + m[3];
  }
  function tr(s) {
    var r = tr1(s); return r == null ? iso(s) : (iso(r) || r);
  }
  function tr1(s) {
    if (!s || !/[A-Za-z]/.test(s)) return null;
    var c = s.replace(/\s+/g, ' ').trim(), lead = /^\s/.test(s) ? ' ' : '', tail = /\s$/.test(s) ? ' ' : '', v = D[c];
    if (v != null) return lead + v + tail;
    if (c.indexOf(' · ') > 0) {   // every part known on its own → part by part (a pattern below could swallow the whole line)
      var ps = c.split(' · '), all = true, any = false;
      for (var k = 0; k < ps.length && all; k++) { if (!/[A-Za-z]/.test(ps[k])) continue; var q = tr1(ps[k]); if (q == null) all = false; else { ps[k] = q; any = true; } }
      if (all && any) return lead + ps.join(' · ') + tail;
    }
    v = look(c);
    if (v != null) return lead + v + tail;
    var m = c.match(SPLIT);
    if (m && m[2] && (m[1] !== '' || m[3] !== '')) { v = look(m[2]); if (v != null) return lead + m[1] + v + m[3] + tail; }
    // a line made of parts — "Next Dec 5 · kept 1 of 2 · target in 1 buy": each part on its own
    if (c.indexOf(' · ') > 0) {
      var parts = c.split(' · '), hit = false;
      for (var i = 0; i < parts.length; i++) { var w = tr1(parts[i]); if (w != null) { parts[i] = w; hit = true; } }
      if (hit) return lead + parts.join(' · ') + tail;
    }
    return null;
  }

  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, PRE: 1, NOSCRIPT: 1, CANVAS: 1, svg: 1 };
  function skipEl(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (SKIP[e.nodeName] || e.isContentEditable) return true;
      if (e.hasAttribute('data-no-tr') || (e.classList && (e.classList.contains('notranslate') || keepCls(e)))) return true;
    }
    return false;
  }
  // the name "Cute Portfolio" (big header, the small one when scrolled, page headers) is never translated
  var KEEP = ['brand-name', 'cp-brand-n', 'mini-name', 'nm'];   // (+ coin names in Market Hub / Altcoin Season lists: Bitcoin stays Bitcoin)
  function keepCls(e) { for (var i = 0; i < KEEP.length; i++) if (e.classList.contains(KEEP[i])) return true; return false; }
  var ATTRS = ['placeholder', 'title', 'aria-label', 'data-tip', 'alt'];
  function doText(n) { if (n.parentNode && !skipEl(n.parentNode)) { var v = tr(n.nodeValue); if (v != null && v !== n.nodeValue) n.nodeValue = v; } }
  function doAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) { var a = el.getAttribute(ATTRS[i]); if (a) { var v = tr1(a); if (v != null && v !== a) el.setAttribute(ATTRS[i], v); } }
    if (el.nodeName === 'INPUT' && (el.type === 'button' || el.type === 'submit') && el.value) { var w = tr1(el.value); if (w != null) el.value = w; }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (root.nodeName === 'TEXTAREA' && !skipEl(root.parentNode)) { doAttrs(root); return; } if (skipEl(root)) return; doAttrs(root); }
    var it = document.createTreeWalker(root, 5 /* elements + text */, {
      acceptNode: function (n) { if (n.nodeName === 'TEXTAREA') doAttrs(n);   // its placeholder yes, what you typed no
        return n.nodeType === 1 && (SKIP[n.nodeName] || n.hasAttribute('data-no-tr') || n.classList.contains('notranslate') || keepCls(n)) ? 2 /* reject subtree */ : 1; }
    }), n;
    while ((n = it.nextNode())) { if (n.nodeType === 3) { var v = tr(n.nodeValue); if (v != null && v !== n.nodeValue) n.nodeValue = v; } else doAttrs(n); }
  }
  var obs = null;
  function start() {
    if (document.title) { var tt = tr1(document.title); if (tt) document.title = tt; }
    walk(document.body);
    obs = new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i];
        if (m.type === 'childList') { for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]); }
        else if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes' && m.target.nodeType === 1 && !skipEl(m.target.nodeName === 'TEXTAREA' ? m.target.parentNode : m.target)) doAttrs(m.target);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  window.CPLang = {
    lang: lang, ar: AR,
    add: function (map) { for (var k in map) D[k] = map[k]; },
    rx: function (re, to) { RX.push([re, to]); },
    t: function (s) { if (!AR) return s; var v = tr1(s); return v == null ? s : v; },   // in code: CPLang.t('Buy')
    has: function (s) { return D[s] != null; },
    apply: function (root) { if (AR) walk(root || document.body); },
    set: function (l) {
      l = l === 'ar' ? 'ar' : 'en'; if (l === lang) return;
      try { localStorage.setItem(KEY, l); } catch (_) {}
      var w = window; try { while (w.parent && w.parent !== w && w.parent.CPLang) w = w.parent; } catch (_) {}
      w.location.reload();   // the main page and every page inside it start again in the new language
    },
    // a date in the app's language (Latin digits): CPLang.date(d, {day:'numeric', month:'short'})
    date: function (d, o) { return new Date(d).toLocaleDateString(AR ? 'ar-EG-u-nu-latn' : 'en-GB', o); },
  };
  if (!AR) return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
