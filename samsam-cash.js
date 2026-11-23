// samsam-cash.js — 🏦 Cash & certificates: bank balances and investment certificates, in US dollars, Egyptian pounds or
// Saudi riyals, next to the portfolio — and one "Net worth" line (portfolio + cash) above them.
//
// Entered by hand: a balance (currency, amount, a name you choose) or a certificate (amount, yearly return, start date,
// term, how the return is paid). Nothing connects to a bank and no account number is ever asked for. The math is
// samsam-core.js (cashFacts / cashTotals): simple interest, a certificate's maturity date, each value in US dollars at the
// OFFICIAL rate (how many EGP / SAR one dollar buys: Yahoo Finance EGP=X / SAR=X, saved with the market snapshot every
// ~30 min; the last rates are kept on the device, so the card also draws at once and offline).
// The portfolio's own totals and profit never include these: they only add up in "Net worth".
// Saved in the cloud (meta/info.cash), in every backup and automatic copy. Edited from the card; a new entry also from
// ➕ Add → the "Cash & certificate" tab (the same form, shown inside that window: SamsamCash.embed).
(function () {
  'use strict';
  var doc = document, $ = function (id) { return doc.getElementById(id); };
  var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function S() { return window.Samsam; }
  function AR() { return !!(window.CPLang && CPLang.ar); }
  var FXKEY = 'cp-fx', fx = null, fxAt = 0, asked = 0;
  var CUR = { USD: { flag: '🇺🇸', en: 'US dollar', ar: 'دولار أمريكي', sym: '$' }, EGP: { flag: '🇪🇬', en: 'Egyptian pound', ar: 'جنيه مصري', sym: 'EGP' }, SAR: { flag: '🇸🇦', en: 'Saudi riyal', ar: 'ريال سعودي', sym: 'SAR' } };
  var PAY = { month: ['Monthly', 'شهرياً'], quarter: ['Every 3 months', 'كل 3 شهور'], year: ['Yearly', 'سنوياً'], end: ['At maturity', 'عند الاستحقاق'] };
  var T = function (en, ar) { return AR() ? ar : en; };
  var num = function (v, d) { return (+v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d == null ? 0 : d }); };
  var money = function (v, cur) { return cur === 'USD' ? '$' + (+v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : num(v, 0) + ' ' + cur; };
  var usd = function (v) { return window.SamsamFmt ? SamsamFmt.usd(v) : '$' + num(v, 2); };
  var LTR = function (s) { return '⁦' + s + '⁩'; };   // a number kept left-to-right inside Arabic
  function dateTxt(iso) { try { return new Date(iso + 'T00:00:00Z').toLocaleDateString(AR() ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); } catch (_) { return iso; } }

  // ── the official rates: the device's last ones at once, then the snapshot's ──
  try { var k = JSON.parse(localStorage.getItem(FXKEY) || 'null'); if (k && k.fx) { fx = k.fx; fxAt = k.t || 0; } } catch (_) {}
  function loadFx() {
    var M = window.SamsamMarket; if (!M || !M.fx || Date.now() - asked < 10 * 60e3) return;
    asked = Date.now();
    M.fx().then(function (r) {
      if (!r || !r.data) return;
      var o = {}; Object.keys(r.data).forEach(function (c) { var v = r.data[c] && +r.data[c].rate; if (v > 0) o[c] = v; });
      if (!Object.keys(o).length) return;
      fx = o; fxAt = r.t || Date.now();
      try { localStorage.setItem(FXKEY, JSON.stringify({ fx: fx, t: fxAt })); } catch (_) {}
      render();
    }, function () {});
  }

  // ── the card and the Net worth line ──
  var lastTotal = null;
  function render(portfolioTotal) {
    if (portfolioTotal != null) lastTotal = +portfolioTotal;
    var card = $('cashCard'), nw = $('netWorthLine'), s = S();
    if (!card || !s || !s.isReady || !s.isReady() || !s.core || !s.core.cashTotals) { if (card) card.hidden = true; if (nw) nw.hidden = true; return; }
    var list = s.getCash();
    card.hidden = !list.length; if (nw) nw.hidden = !list.length;
    if (!list.length) return;
    loadFx();
    var t = s.core.cashTotals(list, fx || {}, Date.now()), ar = AR();
    var tt = card.querySelector('[data-cash-t]'), ta = card.querySelector('[data-cash-a]'); if (tt) tt.textContent = T('Cash & certificates', 'نقد وشهادات'); if (ta) ta.textContent = T('Add', 'إضافة');
    $('cashUsd').textContent = t.usd > 0 || !t.missing.length ? usd(t.usd) : '$—';
    var rateLine = ['EGP', 'SAR'].filter(function (c) { return t.byCur[c] && fx && fx[c] > 0; }).map(function (c) { return '$1 = ' + num(fx[c], c === 'SAR' ? 4 : 2) + ' ' + c; }).join(' · ');
    var rows = t.items.map(function (x) {
      var c = CUR[x.cur], name = x.label || (x.kind === 'cert' ? T('Certificate', 'شهادة') : T('Balance', 'رصيد'));
      var right = x.cur === 'USD' ? '' : x.usd == null ? '<span class="ch-usd">' + T('rate not loaded yet', 'السعر لم يُحمَّل بعد') + '</span>' : '<span class="ch-usd">≈ ' + LTR(usd(x.usd)) + '</span>';
      var sub = '';
      if (x.kind === 'cert') {
        var bits = [LTR(num(x.rate, 2) + '%') + ' ' + T('a year', 'سنوياً')];
        if (x.income != null) bits.push(LTR('+' + money(x.income, x.cur)) + ' ' + (ar ? PAY[x.pay][1] : PAY[x.pay][0].toLowerCase()));
        if (x.earned > 0) bits.push(T('return so far', 'العائد حتى الآن') + ' ' + LTR('+' + money(x.earned, x.cur)) + ' ' + (x.count ? T('(counted)', '(محسوب)') : T('(not counted)', '(غير محسوب)')));
        if (x.maturity) bits.push(x.matured ? '<b class="ch-due">' + T('matured', 'استحقت') + ' ' + E(dateTxt(x.maturity)) + '</b>'
          : T('matures', 'تستحق') + ' ' + E(dateTxt(x.maturity)) + ' (' + (ar ? 'بعد ' + LTR(x.daysLeft) + ' يوم' : 'in ' + x.daysLeft + ' days') + ')');
        sub = '<span class="ch-sub">' + bits.join(' · ') + '</span>';
      }
      return '<button type="button" class="ch-row" data-cash="' + E(x.id) + '" title="' + T('Edit or delete', 'تعديل أو حذف') + '"><span class="ch-main">' + c.flag + ' ' + E(name) + ' <b>' + LTR(money(x.value, x.cur)) + '</b>' +
        (x.kind === 'cert' ? ' <i class="ch-tag">' + T('certificate', 'شهادة') + '</i>' : '') + '</span>' + right + ' ›' + sub + '</button>';
    }).join('');
    $('cashSub').innerHTML = (rateLine ? '<div class="ch-rate">' + T('Official rate', 'السعر الرسمي') + ': ' + LTR(rateLine) + '</div>' : '') +
      (t.missing.length ? '<div class="ch-rate ch-warn">' + T('No rate yet for ', 'لا يوجد سعر بعد لـ ') + t.missing.join(', ') + T(' — not in the total.', ' — غير محسوب في الإجمالي.') + '</div>' : '') +
      '<div class="ch-rows">' + rows + '</div>';
    if (nw) {
      var have = lastTotal != null && lastTotal >= 0;
      nw.innerHTML = '💼 ' + T('Net worth', 'صافي الثروة') + ' <b>' + LTR(have ? usd(lastTotal + t.usd) : '$—') + '</b> <span>= ' + T('portfolio', 'المحفظة') + ' ' + LTR(have ? usd(lastTotal) : '$—') + ' + ' + T('cash', 'النقد') + ' ' + LTR(usd(t.usd)) + '</span>';
    }
  }

  // ── the editor (add / change / delete one entry) ──
  var CSS =
    '#cpCash{position:fixed;inset:0;z-index:99990;background:rgba(2,6,23,.6);display:flex;align-items:flex-end;justify-content:center}' +
    '@media (min-width:640px){#cpCash{align-items:center;padding:16px}}' +
    '#cpCash .cc-box{width:min(460px,100%);max-height:92vh;overflow:auto;background:var(--card-solid,var(--bg2,#111827));color:var(--fg,#e5e7eb);border:1px solid var(--border,#374151);border-radius:18px 18px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));box-sizing:border-box}' +
    '@media (min-width:640px){#cpCash .cc-box{border-radius:18px}}' +
    '.cc-form h3{margin:0 0 12px;font-size:1.05rem;display:flex;align-items:center;gap:8px}.cc-form h3 span{flex:1}' +
    '.cc-form .cc-x{border:0;background:transparent;color:inherit;font-size:1.3rem;cursor:pointer;width:36px;height:36px;border-radius:10px}' +
    '.cc-form .cc-seg{display:flex;gap:6px;background:var(--bg3,#1f2937);padding:4px;border-radius:12px;margin-bottom:10px}' +
    '.cc-form .cc-seg button{flex:1;height:38px;border:0;border-radius:9px;background:transparent;color:var(--fg2,#94a3b8);font:inherit;font-weight:700;cursor:pointer}' +
    '.cc-form .cc-seg button[aria-pressed=true]{background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff}' +
    '.cc-form label{display:block;font-size:.78rem;font-weight:600;color:var(--fg2,#94a3b8);margin:10px 0 4px}' +
    '.cc-form input,.cc-form select{width:100%;box-sizing:border-box;height:44px;padding:0 12px;border-radius:10px;border:1px solid var(--border,#334155);background:var(--bg3,#1f2937);color:inherit;font:inherit}' +
    '.cc-form input:focus,.cc-form select:focus{outline:none;border-color:#3b82f6}' +
    '.cc-form label.cc-chk{display:flex;align-items:center;gap:10px;margin:14px 0 0;font-size:.9rem;color:inherit;cursor:pointer}.cc-form label.cc-chk input{width:20px;height:20px;flex:0 0 auto;accent-color:#7c3aed}' +
    '.cc-form .cc-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.cc-form .cc-cert[hidden]{display:none}' +
    '.cc-form .cc-note{font-size:.76rem;color:var(--fg2,#94a3b8);margin-top:10px;line-height:1.5}.cc-form .cc-err{color:#f87171;font-size:.82rem;min-height:1.2em;margin-top:8px}' +
    '.cc-form .cc-btns{display:flex;gap:10px;margin-top:12px}.cc-form .cc-btns button{flex:1;height:46px;border-radius:12px;border:1px solid var(--border,#334155);background:var(--metric-bg,#1f2937);color:inherit;font:inherit;font-weight:700;cursor:pointer}' +
    '.cc-form .cc-save{background:linear-gradient(135deg,#7c3aed,#6d28d9)!important;border-color:#6d28d9!important;color:#fff!important}.cc-form .cc-del{flex:0 0 auto!important;padding:0 14px;color:#f87171!important}';
  var cssDone = false, editing = null;
  function close() { var m = $('cpCash'); if (m) m.remove(); var e = doc.querySelector('.cc-form.cc-embed'); if (e) { e.innerHTML = ''; e.classList.remove('cc-form', 'cc-embed'); } editing = null; }
  // its own window (from the card: add or edit one entry)
  function open(id) {
    var s = S(); if (!s || !s.isReady || !s.isReady()) return;
    close();
    var w = doc.createElement('div'); w.id = 'cpCash'; w.setAttribute('data-no-tr', '');
    w.innerHTML = '<div class="cc-box" role="dialog" aria-modal="true" aria-labelledby="ccT"></div>';
    doc.body.appendChild(w);
    w.addEventListener('click', function (e) { if (e.target === w) close(); });
    form(w.firstChild, id, { onClose: close });
  }
  // inside another window (➕ Add → the "Cash & certificate" tab): the same form, a new entry; opts.onDone after a save
  function embed(el, opts) {
    var s = S(); if (!el || !s || !s.isReady || !s.isReady()) return false;
    close(); el.setAttribute('data-no-tr', ''); el.classList.add('cc-embed');
    form(el, null, { embed: true, onClose: function (saved) { if (saved && opts && opts.onDone) opts.onDone(); } });
    return true;
  }
  function form(root, id, o) {
    var s = S();
    if (!cssDone) { cssDone = true; var st = doc.createElement('style'); st.textContent = CSS; doc.head.appendChild(st); }
    root.classList.add('cc-form');
    var done = function (saved) { if (o.embed) { root.innerHTML = ''; root.classList.remove('cc-form', 'cc-embed'); editing = null; } o.onClose(saved); };
    var list = s.getCash(), it = id ? list.filter(function (x) { return x.id === id; })[0] : null, ar = AR();
    editing = it ? it.id : null;
    var today = new Date().toISOString().slice(0, 10);
    var v = it || { kind: 'cash', cur: 'EGP', amount: '', label: '', rate: '', start: today, months: 36, pay: 'month' };
    var opt = function (list2, cur) { return list2.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === cur ? ' selected' : '') + '>' + E(o[1]) + '</option>'; }).join(''); };
    var w = root;
    w.innerHTML = (o.embed ? '' : '<h3><span id="ccT">🏦 ' + (it ? T('Edit', 'تعديل') : T('Cash & certificates', 'نقد وشهادات')) + '</span><button type="button" class="cc-x" id="ccX" aria-label="' + T('Close', 'إغلاق') + '">✕</button></h3>') +
      '<div class="cc-seg" role="group"><button type="button" data-kind="cash" aria-pressed="' + (v.kind !== 'cert') + '">' + T('Balance', 'رصيد') + '</button><button type="button" data-kind="cert" aria-pressed="' + (v.kind === 'cert') + '">' + T('Certificate', 'شهادة') + '</button></div>' +
      '<div class="cc-two"><div><label for="ccCur">' + T('Currency', 'العملة') + '</label><select id="ccCur">' + opt(['EGP', 'USD', 'SAR'].map(function (c) { return [c, CUR[c].flag + ' ' + c + ' · ' + (ar ? CUR[c].ar.split(' ')[0] : CUR[c].en.split(' ').pop())]; }), v.cur) + '</select></div>' +
      '<div><label for="ccAmt">' + T('Amount', 'المبلغ') + '</label><input id="ccAmt" inputmode="decimal" autocomplete="off" dir="ltr" value="' + E(v.amount === '' ? '' : String(v.amount)) + '" placeholder="100000"></div></div>' +
      '<label for="ccLabel">' + T('Name (your choice — never an account number)', 'الاسم (كما تحب — ليس رقم الحساب أبداً)') + '</label><input id="ccLabel" maxlength="40" autocomplete="off" value="' + E(v.label || '') + '" placeholder="' + T('e.g. CIB savings', 'مثال: توفير البنك الأهلي') + '">' +
      '<div class="cc-cert" id="ccCert"' + (v.kind === 'cert' ? '' : ' hidden') + '>' +
        '<div class="cc-two"><div><label for="ccRate">' + T('Return, % a year', 'العائد السنوي %') + '</label><input id="ccRate" inputmode="decimal" autocomplete="off" dir="ltr" value="' + E(v.rate === '' || v.rate == null ? '' : String(v.rate)) + '" placeholder="20"></div>' +
        '<div><label for="ccPay">' + T('Return is paid', 'صرف العائد') + '</label><select id="ccPay">' + opt(['month', 'quarter', 'year', 'end'].map(function (p) { return [p, ar ? PAY[p][1] : PAY[p][0]]; }), v.pay || 'month') + '</select></div></div>' +
        '<div class="cc-two"><div><label for="ccStart">' + T('Start date', 'تاريخ البداية') + '</label><input id="ccStart" type="date" value="' + E(v.start || today) + '"></div>' +
        '<div><label for="ccMonths">' + T('Term, months', 'المدة بالشهور') + '</label><input id="ccMonths" inputmode="numeric" autocomplete="off" dir="ltr" value="' + E(v.months == null ? '' : String(v.months)) + '" placeholder="36"></div></div>' +
        '<label class="cc-chk"><input type="checkbox" id="ccCount"' + ((typeof v.count === 'boolean' ? v.count : (v.pay || 'month') === 'end') ? ' checked' : '') + '><span>' + T('Count the return so far in its value', 'احسب العائد حتى الآن ضمن قيمتها') + '</span></label>' +
        '<div class="cc-note" id="ccCountNote">' + T('On: value = the amount + the return since the start date. Turn it off when the payments reach an account you already enter here as a balance — otherwise they are counted twice.', 'مفعّل: القيمة = المبلغ + العائد منذ تاريخ البداية. أوقفه إذا كان العائد ينزل على حساب تُدخله هنا كرصيد — وإلا حُسب مرتين.') + '</div>' +
      '</div>' +
      '<div class="cc-note">' + T('Counted in Net worth only — your portfolio\'s totals and profit stay as they are. Valued in US dollars at the official rate.', 'يُحسب في صافي الثروة فقط — وإجمالي محفظتك وأرباحها تبقى كما هي. القيمة بالدولار بالسعر الرسمي.') + '</div>' +
      '<div class="cc-err" id="ccErr" role="alert"></div>' +
      '<div class="cc-btns">' + (it ? '<button type="button" class="cc-del" id="ccDel">' + T('Delete', 'حذف') + '</button>' : '') + (o.embed ? '' : '<button type="button" id="ccNo">' + T('Cancel', 'إلغاء') + '</button>') + '<button type="button" class="cc-save" id="ccSave">' + T('Save', 'حفظ') + '</button></div>';
    var kind = v.kind === 'cert' ? 'cert' : 'cash';
    w.querySelectorAll('[data-kind]').forEach(function (b) { b.onclick = function () { kind = b.dataset.kind; w.querySelectorAll('[data-kind]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); $('ccCert').hidden = kind !== 'cert'; }; });
    if ($('ccX')) $('ccX').onclick = function () { done(false); }; if ($('ccNo')) $('ccNo').onclick = function () { done(false); };
    // the switch follows "Return is paid" (at maturity → on, paid out → off) until you set it yourself
    var touched = !!it; $('ccCount').onchange = function () { touched = true; };
    $('ccPay').onchange = function () { if (!touched) $('ccCount').checked = $('ccPay').value === 'end'; };
    var n = function (el) { return parseFloat(String($(el).value || '').replace(/,/g, '').replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }).trim()); };
    var err = function (t) { $('ccErr').textContent = t; };
    $('ccSave').onclick = function () {
      var amount = n('ccAmt');
      if (!(amount > 0)) return err(T('Enter the amount.', 'اكتب المبلغ.'));
      var x = { id: editing || ('c' + Date.now().toString(36)), kind: kind, cur: $('ccCur').value, amount: amount, label: $('ccLabel').value };
      if (kind === 'cert') {
        var rate = n('ccRate'), months = n('ccMonths'), start = $('ccStart').value;
        if (!(rate >= 0 && rate <= 100)) return err(T('Enter the yearly return, 0 to 100%.', 'اكتب العائد السنوي، من 0 إلى 100%.'));
        if (!/^\d{4}-\d\d-\d\d$/.test(start)) return err(T('Choose the start date.', 'اختر تاريخ البداية.'));
        if (!(months >= 1 && months <= 600)) return err(T('Enter the term in months (1 to 600).', 'اكتب المدة بالشهور (من 1 إلى 600).'));
        x.rate = rate; x.months = months; x.start = start; x.pay = $('ccPay').value; x.count = !!$('ccCount').checked;
      }
      var now = S().getCash(), next = editing ? now.map(function (o) { return o.id === editing ? x : o; }) : now.concat([x]);
      if (next.length > 40) return err(T('That is the most entries (40).', 'هذا أقصى عدد (40).'));
      $('ccSave').disabled = true;
      S().setCash(next).then(function () { done(true); render(); }, function (e) { $('ccSave').disabled = false; err(String((e && e.message) || e)); });
    };
    if (it) $('ccDel').onclick = function () {
      var D = window.CPDialog, go = D ? D.confirm(T('Delete this entry?', 'حذف هذا البند؟'), { title: T('Cash & certificates', 'نقد وشهادات'), okText: T('Delete', 'حذف'), danger: true }) : Promise.resolve(true);
      go.then(function (ok) { if (!ok) return; S().setCash(S().getCash().filter(function (o) { return o.id !== editing; })).then(function () { done(true); render(); }, function (e) { err(String((e && e.message) || e)); }); });
    };
    if (!o.embed) setTimeout(function () { try { $('ccAmt').focus(); } catch (_) {} }, 50);
  }

  doc.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-cash],[data-cash-add]') : null;
    if (!t || !t.closest('#cashCard')) return;
    e.preventDefault(); open(t.hasAttribute('data-cash-add') ? null : t.getAttribute('data-cash'));
  });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('cpCash') && !doc.getElementById('cpDialog')) { e.stopPropagation(); close(); } }, true);

  window.SamsamCash = { render: render, open: open, embed: embed, close: close, rates: function () { return fx ? Object.assign({ t: fxAt }, fx) : null; } };
})();
