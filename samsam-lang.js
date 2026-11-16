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
    'html.cp-ar .brand-name,html.cp-ar .cp-brand-n{direction:ltr}' +
    'html.cp-ar code,html.cp-ar pre{direction:ltr;unicode-bidi:isolate}';
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
    var c = s.replace(/\s+/g, ' ').trim(), lead = /^\s/.test(s) ? ' ' : '', tail = /\s$/.test(s) ? ' ' : '', v = look(c);
    if (v != null) return lead + v + tail;
    var m = c.match(SPLIT); if (!m || !m[2] || (m[1] === '' && m[3] === '')) return null;
    v = look(m[2]); if (v == null) return null;
    return lead + m[1] + v + m[3] + tail;
  }

  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1, PRE: 1, NOSCRIPT: 1, CANVAS: 1, svg: 1 };
  function skipEl(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (SKIP[e.nodeName] || e.isContentEditable) return true;
      if (e.hasAttribute('data-no-tr') || (e.classList && (e.classList.contains('notranslate') || e.classList.contains('brand-name') || e.classList.contains('cp-brand-n')))) return true;
    }
    return false;
  }
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
    if (root.nodeType === 1) { if (skipEl(root)) return; doAttrs(root); }
    var it = document.createTreeWalker(root, 5 /* elements + text */, {
      acceptNode: function (n) { return n.nodeType === 1 && (SKIP[n.nodeName] || n.hasAttribute('data-no-tr') || n.classList.contains('notranslate') || n.classList.contains('brand-name') || n.classList.contains('cp-brand-n')) ? 2 /* reject subtree */ : 1; }
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
        else if (m.type === 'attributes' && m.target.nodeType === 1 && !skipEl(m.target)) doAttrs(m.target);
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
