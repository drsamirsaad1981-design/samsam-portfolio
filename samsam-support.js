// samsam-support.js — 💛 "Support Cute Portfolio & Channel" (Settings, and the line at the bottom of every page).
// The app is free; support is optional. ⭐ Premium (a monthly Stars subscription — it also makes you a supporter) and
// 💛 a one-time thank-you; each button opens Telegram's own payment for THIS member (the Worker makes the link: /key
// action "invoice"). Members who haven't linked the bot yet are shown how (Stars are paid from a Telegram account).
// The status (premium / supporter) is kept on this device (cp-support-st) so the footer line can say thank you.
(function () {
  'use strict';
  var URL_KEY = 'https://samsam-analysis.dr-samir-saad-1981.workers.dev/key', BOT = 'https://t.me/samsam_portfolio_bot';
  var doc = document, st = null;
  var $ = function (id) { return doc.getElementById(id); };
  var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var IC = function (n) { return window.SamsamUI && SamsamUI.ic ? SamsamUI.ic(n, { solo: true, size: 16 }) : ''; };
  var day = function (ms) { return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
  var usd = function (n) { return '$' + Math.max(1, Math.round(n * 0.02)); };
  function S() { return window.Samsam; }
  function call(body) {
    return S().idToken().then(function (t) {
      if (!t) throw new Error('Sign in first.');
      return fetch(URL_KEY, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ idToken: t }, body)) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || ('Error ' + r.status)); e.code = j.error; throw e; } return j; }); });
    });
  }
  function keep(s) { try { localStorage.setItem('cp-support-st', JSON.stringify({ premium: !!s.premium, supporter: !!s.supporter, t: Date.now() })); } catch (_) {} }

  var CSS =
    '#cpSup{position:fixed;inset:0;z-index:99995;background:rgba(2,6,23,.55);display:flex;align-items:flex-end;justify-content:center}' +
    '@media (min-width:640px){#cpSup{align-items:center;padding:16px}}' +
    '#cpSup .sp-box{width:min(520px,100%);max-height:94vh;overflow:auto;background:var(--card-solid,var(--bg2,#111827));color:var(--fg,#e5e7eb);border:1px solid var(--border,#374151);border-radius:18px 18px 0 0;' +
      'padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));font:14px/1.5 system-ui,-apple-system,"Inter",sans-serif;box-shadow:0 -10px 40px rgba(0,0,0,.35);box-sizing:border-box}' +
    '@media (min-width:640px){#cpSup .sp-box{border-radius:18px}}' +
    '#cpSup .sp-h{display:flex;align-items:center;gap:10px;margin-bottom:6px}#cpSup .sp-h b{flex:1;font-size:1.05rem}#cpSup .sp-x{background:none;border:none;color:inherit;opacity:.75;cursor:pointer;padding:6px;line-height:0}' +
    '#cpSup .sp-hero{border-radius:14px;padding:12px 14px;background:linear-gradient(135deg,rgba(245,158,11,.16),rgba(124,58,237,.16));border:1px solid rgba(245,158,11,.35);margin:6px 0 10px}' +
    '#cpSup .sp-hero b{display:block;font-size:.95rem;margin-bottom:2px}#cpSup .sp-hero span{font-size:.84rem;color:var(--fg2,#94a3b8)}' +
    '#cpSup .sp-me{font-size:.86rem;font-weight:700;margin:0 0 8px;color:#f59e0b}' +
    '#cpSup .sp-card{border:1px solid var(--border,rgba(148,163,184,.22));border-radius:14px;padding:12px 14px;margin-top:10px}' +
    '#cpSup .sp-card h4{margin:0 0 4px;font-size:.95rem}#cpSup .sp-card p{margin:4px 0;font-size:.84rem;color:var(--fg2,#94a3b8)}#cpSup .sp-card ul{margin:6px 0;padding-inline-start:18px;font-size:.86rem}' +
    '#cpSup .sp-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}' +
    '#cpSup .sp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font:inherit;font-size:.86rem;font-weight:700;padding:9px 13px;border-radius:10px;border:1px solid var(--border,rgba(148,163,184,.3));background:transparent;color:inherit;cursor:pointer;text-decoration:none;flex:1 1 auto}' +
    '#cpSup .sp-btn.pri{background:#f59e0b;border-color:#f59e0b;color:#1f1300}#cpSup .sp-btn.vio{background:#7c3aed;border-color:#7c3aed;color:#fff}#cpSup .sp-btn:disabled{opacity:.55;cursor:default}' +
    '#cpSup .sp-msg{font-size:.82rem;margin-top:8px;color:var(--fg2,#94a3b8)}#cpSup .sp-err{color:#f87171}';

  function draw(msg, err) {
    var box = $('cpSupBody'); if (!box) return;
    var s = st || {}, price = s.price || 350, amts = s.amounts || [50, 100, 250, 500], comm = s.community || {};
    var me = [];
    if (s.premium) me.push('⭐ Premium' + (s.premUntil ? ' until ' + day(s.premUntil) : '') + (s.premSrc === 'stars' ? ' (renews by itself)' : ' (a gift)'));
    if (s.supporter) me.push('💛 Supporter · ' + (s.starsPaid || 0) + ' ⭐ — thank you!');
    var link = st && s.botLinked === false ? '<div class="sp-card"><h4>🔗 First, link the Telegram bot</h4><p>Stars are paid from a Telegram account, so the bot needs to know you. Settings → Telegram → Link your portfolio (one tap), then come back here.</p><div class="sp-row"><button type="button" class="sp-btn vio" data-link="1">🔗 Link the Telegram bot</button></div></div>' : '';
    box.innerHTML =
      '<div class="sp-hero"><b>Cute Portfolio is completely free and non-profit.</b><span>Support is optional — it helps keep the servers and the AI running and the project growing. Thank you 💛</span></div>' +
      (me.length ? '<p class="sp-me">' + me.map(E).join(' · ') + '</p>' : '') + link +
      '<div class="sp-card"><h4>⭐ Premium member &amp; supporter</h4><p>A monthly support that also unlocks:</p><ul><li>🎙 Voice notes — talk to the bot</li><li>🧠 20 AI questions a day (instead of 5)</li><li>📊 3 quick AI Analysis reports a day</li><li>💛 The Supporter badge</li></ul>' +
        '<p><b>' + price + ' ⭐ a month</b> (about ' + usd(price) + ') · renews every 30 days · cancel any time in Telegram → Settings → My Stars.</p>' +
        '<div class="sp-row">' + (s.premium && s.premSrc === 'stars' ? '<span class="sp-msg">✅ You\'re subscribed — thank you!</span>' : '<button type="button" class="sp-btn pri" data-pay="prem">⭐ Become premium — ' + price + ' ⭐ / month</button>') + '</div></div>' +
      '<div class="sp-card"><h4>💛 One-time support</h4><p>Any amount, once. Nothing changes in the features — you get the Supporter 💛 badge.</p><div class="sp-row">' +
        amts.map(function (n) { return '<button type="button" class="sp-btn" data-pay="sup" data-n="' + n + '">' + n + ' ⭐ <span style="opacity:.7;font-weight:600">≈' + usd(n) + '</span></button>'; }).join('') + '</div></div>' +
      '<div class="sp-card"><h4>📢 The channel &amp; 💬 the group</h4><p>The market pulse twice a day, the news, and a place to chat, suggest and report problems. You can give ⭐ to channel posts you like.</p><div class="sp-row">' +
        (comm.channel ? '<a class="sp-btn" href="' + E(comm.channel) + '" target="_blank" rel="noopener">📢 Join the channel</a>' : '') +
        (comm.group ? '<a class="sp-btn" href="' + E(comm.group) + '" target="_blank" rel="noopener">💬 Join the group</a>' : '') +
        (!comm.channel && !comm.group ? '<a class="sp-btn" href="' + BOT + '?start=community" target="_blank" rel="noopener">👥 Open in the bot</a>' : '') + '</div></div>' +
      '<p class="sp-msg">Payments happen inside Telegram with Telegram Stars (Telegram\'s own coins, bought in Telegram like any in-app purchase).</p>' +
      (msg ? '<p class="sp-msg' + (err ? ' sp-err' : '') + '">' + E(msg) + '</p>' : '');
  }
  function load() {
    draw('Loading…');
    call({ action: 'status' }).then(function (j) { st = j; keep(j); draw(); }).catch(function (e) { draw(String(e.message || e), true); });
  }
  function pay(kind, n, btn) {
    if (btn) btn.disabled = true;
    // open the window right away (inside the tap), then send it to Telegram's payment page once the link is made
    var w = null; try { w = window.open('', '_blank'); } catch (_) {}
    call({ action: 'invoice', kind: kind, n: n }).then(function (j) {
      if (w) { try { w.opener = null; w.location.href = j.link; } catch (_) { window.open(j.link, '_blank', 'noopener'); } } else window.open(j.link, '_blank', 'noopener');
      if (btn) btn.disabled = false;
      draw('Telegram opened — confirm there. Thank you 💛 (come back here to see your badge).');
    }).catch(function (e) {
      try { w && w.close(); } catch (_) {}
      if (btn) btn.disabled = false;
      if (e.code === 'link-bot') { st = Object.assign({}, st, { botLinked: false }); draw('Link the Telegram bot first (one tap above).', true); }
      else if (e.code === 'already') draw('You\'re subscribed already — thank you!');
      else draw(String(e.message || e), true);
    });
  }
  function close() { var b = $('cpSup'); if (b) b.remove(); doc.removeEventListener('keydown', esc, true); }
  function esc(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
  function open() {
    if (!S() || !S().isOwner || S().isOwner()) return;   // members only (Samir: /stats in the bot, the dashboard)
    if (!$('cpSupCss')) { var c = doc.createElement('style'); c.id = 'cpSupCss'; c.textContent = CSS; doc.head.appendChild(c); }
    close();
    var el = doc.createElement('div'); el.id = 'cpSup'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Support Cute Portfolio');
    el.innerHTML = '<div class="sp-box"><div class="sp-h"><span>💛</span><b>Support Cute Portfolio &amp; Channel</b><button type="button" class="sp-x" aria-label="Close">' + IC('x') + '</button></div><div id="cpSupBody"></div></div>';
    doc.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target === el || e.target.closest('.sp-x')) { close(); return; }
      var b = e.target.closest('[data-pay]'); if (b) { pay(b.dataset.pay, +b.dataset.n || 0, b); return; }
      if (e.target.closest('[data-link]')) { close(); if (window.SamsamSettings && SamsamSettings.run) SamsamSettings.run('tglink'); }
    });
    doc.addEventListener('keydown', esc, true);
    load();
  }
  window.SamsamSupport = { open: open, close: close };
})();
