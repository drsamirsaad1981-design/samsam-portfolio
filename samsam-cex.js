// samsam-cex.js — 🔌 Exchanges: live balances straight from your exchange account, with a READ-ONLY API key.
//
// Performance → Wallets & Exchanges → Exchanges. You make a read-only key on Binance or Gate and paste it here once; it goes
// straight to the Cute Portfolio server (the Worker's /cex), is checked with the exchange — a Binance key that can trade,
// withdraw or move money is refused — and is kept there ENCRYPTED. It is never stored in the app or the cloud portfolio,
// never shown again (only its last 4 characters), and you can remove it any time.
// The balances (spot + funding + earn) are put next to the app's amount for every coin: with the last Wallets & check,
// "exchanges + wallets" vs the app. Nothing is changed in your portfolio: you decide what to correct.
(function () {
  'use strict';
  var doc = document, $ = function (id) { return doc.getElementById(id); };
  var URL_CEX = 'https://samsam-analysis.dr-samir-saad-1981.workers.dev/cex';
  var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var IC = function (n, o) { return window.SamsamUI ? SamsamUI.ic(n, o) : ''; };
  var ar = function () { return !!(window.CPLang && CPLang.ar); };
  var T = function (en, a) { return ar() ? a : en; };
  var LRI = '⁦', PDI = '⁩', iso = function (s) { return LRI + s + PDI; };
  function S() { return window.Samsam; }
  function qf(n) { return parseFloat(Number(n).toPrecision(10)).toLocaleString('en-US', { maximumFractionDigits: 8 }); }
  function usd(n) { return window.SamsamFmt ? SamsamFmt.usd(n) : '$' + Number(n).toFixed(2); }
  var NAMES = { binance: 'Binance', gate: 'Gate' };

  var st = { exchanges: null, balances: null, at: 0, busy: false, err: '', form: { ex: 'binance', err: '', busy: false }, loading: false };

  function call(body) {
    var s = S(); if (!s || !s.idToken) return Promise.reject(new Error('signin'));
    return s.idToken().then(function (t) {
      return fetch(URL_CEX, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ idToken: t }, body)) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; }); });
    });
  }
  function why(code, extra) {
    if (code === 'refused-perms') return T('This key can do more than read (' + (extra || []).map(function (x) { return x.replace(/^enable|^permits/, ''); }).join(', ') + '). For your safety it was not saved. Make a new key with only “Enable Reading” on, then paste it.',
      'هذا المفتاح يملك صلاحيات أكثر من القراءة (' + iso((extra || []).map(function (x) { return x.replace(/^enable|^permits/, ''); }).join(', ')) + '). لم يُحفظ حفاظاً على أمانك. أنشئ مفتاحاً جديداً بصلاحية «Enable Reading» فقط، ثم الصقه.');
    if (code === 'refused') return T('The exchange refused this key — check that the key and the secret were copied whole, and that the key has no IP restriction.', 'رفضت المنصة هذا المفتاح — تأكد من نسخ المفتاح والسر كاملين، وأن المفتاح بدون تقييد عناوين IP.');
    if (code === 'blocked') return T('Binance doesn\'t answer the Cute Portfolio server from its location right now, so the balances can\'t be read from here. Try again later — the CSV import still works.', 'لا تستجيب Binance لخادم Cute Portfolio من موقعه حالياً، لذا لا يمكن قراءة الأرصدة من هنا. حاول لاحقاً — ويبقى استيراد ملف CSV متاحاً.');
    if (code === 'busy') return T('The exchange is busy — try again in a minute.', 'المنصة مشغولة — حاول بعد دقيقة.');
    if (code === 'signin') return T('Sign in first.', 'سجّل الدخول أولاً.');
    if (code && !/^[a-z-]+$/.test(code)) return code;
    return T('Could not reach the exchange — try again.', 'تعذّر الوصول إلى المنصة — حاول مرة أخرى.');
  }

  // every coin: exchanges (+ the last wallet check) vs the app
  function rows() {
    var s = S(), state = s && s.getState ? s.getState() : {}, app = {}, price = {};
    (state.portfolio || []).forEach(function (c) { if (c && c.sym) { app[c.sym] = (app[c.sym] || 0) + (c.qty > 0 ? c.qty : 0); if (c.currentPrice > 0) price[c.sym] = c.currentPrice; } });
    var L = window.SamsamWallets && SamsamWallets.last ? SamsamWallets.last() : null, wal = {};
    if (L && L.found) Object.keys(L.found).forEach(function (k) { if (L.found[k] && L.found[k].q > 0) wal[k] = L.found[k].q; });
    var ex = {};
    (st.balances || []).forEach(function (b) { if (!b.ok) return; (b.assets || []).forEach(function (a) {
      var t = (a.spot || 0) + (a.funding || 0) + (a.earn || 0); if (!(t > 0)) return;
      var o = ex[a.sym] || (ex[a.sym] = { sym: a.sym, q: 0, by: [] }); o.q += t; o.by.push({ ex: b.ex, q: t, earn: a.earn || 0, funding: a.funding || 0 });
    }); });
    var out = [], small = 0;
    Object.keys(ex).forEach(function (sym) {
      var r = ex[sym], p = price[sym] || 0, a = app[sym] || 0, w = wal[sym] || 0, seen = r.q + w, d = seen - a;
      r.app = a; r.wal = w; r.usd = r.q * p; r.p = p;
      if (!a && p === 0 && /^(USD|USDT|USDC|FDUSD|BUSD|DAI|TUSD)$/.test(sym)) { r.p = 1; r.usd = r.q; }
      if (!a && r.usd < 1 && (p > 0 || r.q < 1e-6)) { small++; return; }   // dust that isn't in the app
      r.st = !a ? 'new' : (p > 0 ? Math.abs(d) * p < 0.5 : Math.abs(d) <= Math.max(a, seen) * 1e-4) ? 'same' : d > 0 ? 'more' : 'rest';
      r.diff = d; out.push(r);
    });
    out.sort(function (x, y) { return (y.usd || 0) - (x.usd || 0) || y.q - x.q; });
    return { list: out, small: small, walChecked: !!(L && L.found) };
  }

  var CSS =
    '#cpCex{position:fixed;inset:0;z-index:99995;background:rgba(2,6,23,.55);display:flex;align-items:flex-end;justify-content:center}' +
    '@media (min-width:640px){#cpCex{align-items:center;padding:16px}}' +
    '#cpCex .cx-box{width:min(560px,100%);max-height:92vh;overflow:auto;background:var(--card-solid,var(--bg2,#111827));color:var(--fg,#e5e7eb);border:1px solid var(--border,#374151);border-radius:18px 18px 0 0;' +
      'padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));font:14px/1.45 system-ui,-apple-system,"Inter",sans-serif;box-shadow:0 -10px 40px rgba(0,0,0,.35);box-sizing:border-box}' +
    '@media (min-width:640px){#cpCex .cx-box{border-radius:18px}}' +
    '#cpCex .cx-h{display:flex;align-items:center;gap:10px;position:sticky;top:-16px;z-index:3;margin:-16px -16px 6px;padding:16px 16px 10px;background:inherit;border-radius:inherit;border-bottom:1px solid var(--border,rgba(148,163,184,.15))}' +
    '#cpCex .cx-h b{font-size:1.05rem;flex:1}#cpCex .cx-hic{width:36px;height:36px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:rgba(124,58,237,.15);font-size:1.1rem}' +
    '#cpCex .cx-x{background:none;border:none;color:inherit;opacity:.7;cursor:pointer;padding:6px;line-height:0}' +
    '#cpCex .cx-sec{margin:14px 0 6px;font-size:.72rem;font-weight:800;letter-spacing:.05em;color:var(--fg2,#94a3b8);display:flex;align-items:center;gap:8px}#cpCex .cx-sec span{flex:1}' +
    '#cpCex .cx-note{font-size:.8rem;color:var(--fg2,#94a3b8);margin:4px 0}' +
    '#cpCex .cx-safe{font-size:.8rem;padding:9px 11px;border-radius:12px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);margin:4px 0 2px}' +
    '#cpCex .cx-list{border:1px solid var(--border,rgba(148,163,184,.2));border-radius:14px;overflow:hidden}' +
    '#cpCex .cx-w{display:flex;align-items:center;gap:10px;padding:10px 12px;border-top:1px solid var(--border,rgba(148,163,184,.15))}#cpCex .cx-list>:first-child{border-top:none}' +
    '#cpCex .cx-w .cx-t{flex:1;min-width:0;display:flex;flex-direction:column}#cpCex .cx-w b{font-size:.92rem}#cpCex .cx-w small{font-size:.76rem;color:var(--fg2,#94a3b8)}' +
    '#cpCex .cx-ok{color:#22c55e}#cpCex .cx-warn{color:#f59e0b}[data-theme="light"] #cpCex .cx-ok{color:#16a34a}[data-theme="light"] #cpCex .cx-warn{color:#d97706}' +
    '#cpCex .cx-btn{border:none;border-radius:10px;padding:10px 14px;font:inherit;font-size:.84rem;font-weight:700;cursor:pointer;background:#7c3aed;color:#fff;display:inline-flex;align-items:center;gap:6px}#cpCex .cx-btn[disabled]{opacity:.55;cursor:default}' +
    '#cpCex .cx-btn2{border:1px solid var(--border,rgba(148,163,184,.35));border-radius:9px;padding:6px 10px;font:inherit;font-size:.76rem;font-weight:700;cursor:pointer;background:transparent;color:inherit}#cpCex .cx-btn2[disabled]{opacity:.55}' +
    '#cpCex .cx-form{display:flex;flex-direction:column;gap:8px;margin-top:6px}' +
    '#cpCex .cx-form input,#cpCex .cx-form select{box-sizing:border-box;width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border,rgba(148,163,184,.3));background:rgba(148,163,184,.08);color:inherit;font:inherit;font-size:.85rem}' +
    '#cpCex .cx-form input{font-family:ui-monospace,Menlo,monospace;direction:ltr}' +
    '#cpCex .cx-seg{display:inline-flex;gap:3px;background:rgba(148,163,184,.12);padding:3px;border-radius:10px}#cpCex .cx-seg button{border:none;background:transparent;color:inherit;font:inherit;font-size:.82rem;font-weight:700;padding:6px 14px;border-radius:8px;cursor:pointer;opacity:.7}' +
    '#cpCex .cx-seg button[aria-pressed="true"]{opacity:1;background:#7c3aed;color:#fff}' +
    '#cpCex .cx-how{font-size:.8rem;margin:0;padding-inline-start:20px}#cpCex .cx-how li{margin:3px 0}' +
    '#cpCex .cx-err{color:#f87171;font-size:.8rem;min-height:1em}[data-theme="light"] #cpCex .cx-err{color:#dc2626}' +
    '#cpCex .cx-r{padding:9px 12px;border-top:1px solid var(--border,rgba(148,163,184,.15))}#cpCex .cx-top{display:flex;align-items:center;gap:8px;justify-content:space-between}#cpCex .cx-top b{font-size:.92rem}' +
    '#cpCex .cx-nums{font-size:.78rem;color:var(--fg2,#94a3b8);margin-top:2px}#cpCex .cx-d{font-weight:800;font-size:.8rem;white-space:nowrap}' +
    '#cpCex .cx-tot{display:flex;justify-content:space-between;align-items:baseline;padding:10px 12px;font-weight:800}';

  function draw() {
    var box = $('cxBody'); if (!box) return;
    var keep = { k: $('cxKey') ? $('cxKey').value : '', s: $('cxSecret') ? $('cxSecret').value : '', ex: st.form.ex };   // a redraw keeps what you typed (not after a connect)
    var h = '<div class="cx-safe">🔒 ' + T('<b>Read-only.</b> The app can only <b>read</b> your balances — it can\'t trade, withdraw or move anything. Your key is kept encrypted on the Cute Portfolio server and never shown again.',
      '<b>قراءة فقط.</b> يستطيع التطبيق <b>قراءة</b> أرصدتك فقط — لا يمكنه التداول أو السحب أو تحويل أي شيء. يُحفظ مفتاحك مشفّراً على خادم Cute Portfolio ولا يُعرض مرة أخرى.') + '</div>';
    var exs = st.exchanges;
    if (exs === null) { box.innerHTML = h + '<p class="cx-note">' + (st.err ? '<span class="cx-err">' + E(st.err) + '</span>' : T('Loading…', 'جارٍ التحميل…')) + '</p>'; return; }
    if (exs.length) {
      h += '<div class="cx-sec"><span>' + T('CONNECTED', 'المنصات المربوطة') + '</span></div><div class="cx-list">' + exs.map(function (x) {
        return '<div class="cx-w"><span class="cx-t"><b>' + E(x.name) + ' <span style="font-weight:500;opacity:.7">' + iso('••••' + E(x.tail)) + '</span></b><small>' +
          (x.readOnly === true ? '<span class="cx-ok">✓ ' + T('read-only (checked with Binance)', 'قراءة فقط (تحققت منه Binance)') + '</span>' : T('Make sure the key is read-only — Gate doesn\'t say what a key may do.', 'تأكد أن المفتاح للقراءة فقط — Gate لا توضح صلاحيات المفتاح.')) +
          '</small></span><button type="button" class="cx-btn2" data-del="' + E(x.ex) + '">' + T('Remove', 'إزالة') + '</button></div>';
      }).join('') + '</div>';
      // balances
      h += '<div class="cx-sec"><span>' + T('BALANCES', 'الأرصدة') + (st.at ? ' · ' + ago(st.at) : '') + '</span><button type="button" class="cx-btn2" id="cxRefresh"' + (st.loading ? ' disabled' : '') + '>🔄 ' + (st.loading ? T('Reading…', 'جارٍ القراءة…') : T('Refresh', 'تحديث')) + '</button></div>';
      (st.balances || []).forEach(function (b) { if (!b.ok) h += '<p class="cx-err">' + E(b.name) + ': ' + E(why(b.error)) + '</p>'; });
      if (st.balances) {
        var R = rows();
        if (!R.list.length) h += '<p class="cx-note">' + T('No coins on these exchanges.', 'لا توجد عملات على هذه المنصات.') + '</p>';
        else {
          var tot = R.list.reduce(function (s, r) { return s + (r.usd || 0); }, 0);
          h += '<div class="cx-list"><div class="cx-tot"><span>' + T('On exchanges', 'على المنصات') + '</span><span>' + iso(usd(tot)) + '</span></div>' + R.list.map(function (r) {
            var by = r.by.map(function (x) { return NAMES[x.ex] + ' ' + iso(qf(x.q)) + (x.earn ? ' (' + T('earn', 'Earn') + ' ' + iso(qf(x.earn)) + ')' : ''); }).join(' · ');
            var stt = r.st === 'same' ? '<span class="cx-d cx-ok">✓ ' + T('matches', 'مطابق') + '</span>'
              : r.st === 'new' ? '<span class="cx-d cx-warn">' + T('not in the app', 'غير موجودة في التطبيق') + '</span>'
              : r.st === 'more' ? '<span class="cx-d cx-warn">' + iso('+' + qf(r.diff)) + ' ' + T('more than the app', 'أكثر من التطبيق') + '</span>'
              : '<span class="cx-d" style="opacity:.75">' + iso(qf(-r.diff)) + ' ' + T('elsewhere', 'في مكان آخر') + '</span>';
            return '<div class="cx-r"><div class="cx-top"><b>' + E(r.sym) + (r.usd ? ' <span style="font-weight:500;opacity:.7">' + iso(usd(r.usd)) + '</span>' : '') + '</b>' + stt + '</div>' +
              '<div class="cx-nums">' + by + (r.wal ? ' · ' + T('wallets', 'المحافظ') + ' ' + iso(qf(r.wal)) : '') + ' · ' + T('app', 'التطبيق') + ' ' + iso(qf(r.app)) + '</div></div>';
          }).join('') + '</div>';
          h += '<p class="cx-note">' + (R.walChecked ? T('“Elsewhere” = the app holds more than these exchanges + your checked wallets (another exchange, staking, or a sell not recorded).', '«في مكان آخر» = التطبيق يسجل أكثر مما في هذه المنصات ومحافظك المفحوصة (منصة أخرى، أو Staking، أو بيع لم يُسجَّل).')
            : T('Tip: run Wallets & check too — then exchanges + wallets are compared with the app together.', 'نصيحة: شغّل «المحافظ والمطابقة» أيضاً — لتُقارَن المنصات والمحافظ معاً بالتطبيق.')) +
            (R.small ? ' ' + T(R.small + ' tiny balance' + (R.small > 1 ? 's' : '') + ' under $1 not shown.', 'لم تُعرض ' + iso(R.small) + ' أرصدة صغيرة أقل من 1$.') : '') + ' ' + T('Nothing is changed in your portfolio — you decide what to correct.', 'لا يتغير شيء في محفظتك — أنت تقرر ما تصححه.') + '</p>';
        }
      }
    }
    // connect
    var f = st.form, left = Object.keys(NAMES).filter(function (k) { return !(exs || []).some(function (x) { return x.ex === k; }); });
    if (left.length) {
      if (left.indexOf(f.ex) < 0) f.ex = left[0];
      h += '<div class="cx-sec"><span>' + T('CONNECT AN EXCHANGE', 'ربط منصة') + '</span></div>' +
        '<div class="cx-seg" role="group">' + left.map(function (k) { return '<button type="button" data-ex="' + k + '" aria-pressed="' + (f.ex === k) + '">' + NAMES[k] + '</button>'; }).join('') + '</div>' +
        '<ol class="cx-how">' + (f.ex === 'binance'
          ? T('<li>Binance → Account → <b>API Management</b> → <b>Create API</b> → System generated.</li><li>Leave only <b>Enable Reading</b> on — no trading, no withdrawals, no transfers.</li><li>IP access: <b>Unrestricted</b> (read-only keys are safe without it).</li><li>Copy the <b>API Key</b> and the <b>Secret Key</b> here.</li>',
            '<li>Binance ← الحساب ← <b>API Management</b> ← <b>Create API</b> ← System generated.</li><li>اترك <b>Enable Reading</b> فقط مفعّلاً — بدون تداول أو سحب أو تحويل.</li><li>الوصول عبر IP: <b>Unrestricted</b> (مفاتيح القراءة آمنة بدونه).</li><li>انسخ <b>API Key</b> و<b>Secret Key</b> هنا.</li>')
          : T('<li>Gate → Profile → <b>API Management</b> → <b>Create API Key</b> (APIv4).</li><li>Give <b>Read Only</b> to Spot and Earn — nothing else.</li><li>No IP whitelist (the server\'s address isn\'t fixed).</li><li>Copy the <b>Key</b> and the <b>Secret</b> here.</li>',
            '<li>Gate ← الملف الشخصي ← <b>API Management</b> ← <b>Create API Key</b> (APIv4).</li><li>امنح صلاحية <b>Read Only</b> للـ Spot والـ Earn فقط — ولا شيء غيرها.</li><li>بدون قائمة IP (عنوان الخادم غير ثابت).</li><li>انسخ <b>Key</b> و<b>Secret</b> هنا.</li>')) + '</ol>' +
        '<div class="cx-form"><input id="cxKey" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + E(T('API key', 'مفتاح API')) + '" aria-label="API key">' +
        '<input id="cxSecret" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="' + E(T('Secret key', 'المفتاح السري')) + '" aria-label="Secret key">' +
        '<div><button type="button" class="cx-btn" id="cxAdd"' + (f.busy ? ' disabled' : '') + '>🔌 ' + (f.busy ? T('Checking with ' + NAMES[f.ex] + '…', 'جارٍ التحقق مع ' + NAMES[f.ex] + '…') : T('Connect ' + NAMES[f.ex], 'ربط ' + NAMES[f.ex])) + '</button></div>' +
        '<div class="cx-err" id="cxErr">' + E(f.err || '') + '</div></div>' +
        '<p class="cx-note">⚠️ ' + T('Never make a key that can trade or withdraw for any app. Cute Portfolio refuses such Binance keys.', 'لا تنشئ أبداً مفتاحاً يسمح بالتداول أو السحب لأي تطبيق. يرفض Cute Portfolio مثل هذه المفاتيح من Binance.') + '</p>';
    }
    box.innerHTML = h;
    if (!st.form.clear && keep.ex === st.form.ex) { if ($('cxKey')) $('cxKey').value = keep.k; if ($('cxSecret')) $('cxSecret').value = keep.s; }
    st.form.clear = false;
  }
  function ago(t) { var m = Math.round((Date.now() - t) / 60000); return m < 1 ? T('just now', 'الآن') : T(m + ' min ago', 'منذ ' + iso(m) + ' دقيقة'); }

  function status() { return call({ action: 'status' }).then(function (j) { if (j._status >= 400) throw new Error(j.error || 'failed'); st.exchanges = j.exchanges || []; st.err = ''; }).catch(function (e) { st.err = why(e.message); st.exchanges = st.exchanges || null; }); }
  function balances(fresh) {
    if (!(st.exchanges || []).length) { draw(); return Promise.resolve(); }
    st.loading = true; draw();
    return call({ action: 'balances', fresh: !!fresh }).then(function (j) { if (j._status >= 400) throw new Error(j.error || 'failed'); st.balances = j.balances || []; st.at = j.at || Date.now(); st.exchanges = j.exchanges || st.exchanges; })
      .catch(function (e) { st.balances = [{ ok: false, name: '', error: e.message }]; })
      .then(function () { st.loading = false; draw(); paintCard(); });
  }
  function connect() {
    var f = st.form, k = ($('cxKey') || {}).value || '', s = ($('cxSecret') || {}).value || '';
    if (!k.trim() || !s.trim()) { f.err = T('Paste both the API key and the secret.', 'الصق مفتاح API والمفتاح السري معاً.'); draw(); return; }
    f.busy = true; f.err = ''; draw();
    call({ action: 'set', ex: f.ex, key: k.trim(), secret: s.trim() }).then(function (j) {
      f.busy = false;
      if (j._status >= 400 || !j.ok) { f.err = why(j.error, j.extra); draw(); return; }
      st.exchanges = j.exchanges; st.balances = null; f.err = ''; f.clear = true; draw(); balances(true);
    }).catch(function () { f.busy = false; f.err = why('failed'); draw(); });
  }
  function remove(ex) {
    var go = function () { call({ action: 'delete', ex: ex }).then(function (j) { st.exchanges = j.exchanges || []; st.balances = null; draw(); balances(); paintCard(); }); };
    if (window.CPDialog && CPDialog.confirm) CPDialog.confirm(T('Remove ' + NAMES[ex] + '? Its key is deleted from the server. (You can also delete the key on ' + NAMES[ex] + '.)', 'إزالة ' + NAMES[ex] + '؟ يُحذف مفتاحها من الخادم. (ويمكنك أيضاً حذف المفتاح من ' + NAMES[ex] + '.)'), { okText: T('Remove', 'إزالة'), danger: true, title: T('Remove ' + NAMES[ex] + '?', 'إزالة ' + NAMES[ex] + '؟') }).then(function (y) { if (y) go(); });
    else go();
  }

  function close() { var b = $('cpCex'); if (b) b.remove(); doc.removeEventListener('keydown', esc, true); }
  function esc(e) { if (e.key === 'Escape' && !doc.querySelector('#cpDialog')) { e.stopPropagation(); close(); } }
  function open() {
    if (!$('cxCss')) { var c = doc.createElement('style'); c.id = 'cxCss'; c.textContent = CSS; doc.head.appendChild(c); }
    close(); st.form.err = '';
    var el = doc.createElement('div'); el.id = 'cpCex'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('data-no-tr', '');
    el.setAttribute('aria-label', T('Exchanges', 'المنصات')); if (ar()) el.setAttribute('dir', 'rtl');
    el.innerHTML = '<div class="cx-box"><div class="cx-h"><span class="cx-hic">🔌</span><b>' + T('Exchanges · live balances', 'المنصات · الأرصدة المباشرة') + '</b><button type="button" class="cx-x" aria-label="Close">' + IC('x') + '</button></div><div id="cxBody"></div></div>';
    doc.body.appendChild(el); draw();
    el.addEventListener('click', function (e) {
      var t = e.target, b;
      if (t === el || t.closest('.cx-x')) { close(); return; }
      if (t.closest('#cxAdd')) { connect(); return; }
      if (t.closest('#cxRefresh')) { balances(true); return; }
      b = t.closest('[data-del]'); if (b) { remove(b.dataset.del); return; }
      b = t.closest('[data-ex]'); if (b) { st.form.ex = b.dataset.ex; st.form.err = ''; draw(); }
    });
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.target.id === 'cxKey' || e.target.id === 'cxSecret')) { e.preventDefault(); connect(); } });
    doc.addEventListener('keydown', esc, true);
    status().then(function () { draw(); return st.balances ? null : balances(); });
  }
  // the row on the Wallets & Exchanges card
  function paintCard() {
    var sub = $('wxCexSub'); if (!sub) return;
    var n = (st.exchanges || []).length;
    sub.textContent = !n ? T('Binance · Gate — live balances with a read-only key', 'Binance · Gate — أرصدة مباشرة بمفتاح قراءة فقط')
      : iso(st.exchanges.map(function (x) { return x.name; }).join(' · ')) + (st.balances ? ' · ' + iso(rows().list.length) + ' ' + T('coins', 'عملة') : '');
  }
  window.SamsamCex = { open: open, close: close, paint: paintCard, _rows: rows, _st: st };
})();
