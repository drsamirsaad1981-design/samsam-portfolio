// samsam-admin.js — 🛠 the owner's dashboard (Settings → Admin dashboard). Only Samir's account sees the line; the Worker
// (/admin) checks again, server-side, and refuses anyone else. The same powers as the bot's /users, /invite and /stats:
// the numbers, every member (search; limits; ⭐ gift / end; ⏸ pause; 🗑 remove; an app request to ✅ / ❌), new invite
// codes, and the Stars log. Long lists open on a tap. No browser alert / confirm — CPDialog.
(function () {
  'use strict';
  var URL_ADMIN = 'https://samsam-analysis.dr-samir-saad-1981.workers.dev/admin';
  var doc = document, data = null, openChat = null, query = '', lastInvite = null, busy = false;
  var $ = function (id) { return doc.getElementById(id); };
  var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var IC = function (n) { return window.SamsamUI && SamsamUI.ic ? SamsamUI.ic(n, { solo: true, size: 16 }) : ''; };
  var day = function (ms) { return ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
  var usd = function (stars) { return '$' + Math.round((stars || 0) * 0.02); };

  function call(body) {
    return window.Samsam.idToken().then(function (t) {
      if (!t) throw new Error('Sign in first.');
      return fetch(URL_ADMIN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ idToken: t }, body)) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ('Error ' + r.status)); return j; }); });
    });
  }

  var CSS =
    '#cpAdm{position:fixed;inset:0;z-index:99995;background:rgba(2,6,23,.55);display:flex;align-items:flex-end;justify-content:center}' +
    '@media (min-width:640px){#cpAdm{align-items:center;padding:16px}}' +
    '#cpAdm .ad-box{width:min(640px,100%);max-height:94vh;overflow:auto;background:var(--card-solid,var(--bg2,#111827));color:var(--fg,#e5e7eb);border:1px solid var(--border,#374151);border-radius:18px 18px 0 0;' +
      'padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));font:14px/1.45 system-ui,-apple-system,"Inter",sans-serif;box-shadow:0 -10px 40px rgba(0,0,0,.35);box-sizing:border-box}' +
    '@media (min-width:640px){#cpAdm .ad-box{border-radius:18px}}' +
    '#cpAdm .ad-h{display:flex;align-items:center;gap:10px;position:sticky;top:-16px;z-index:3;margin:-16px -16px 8px;padding:16px 16px 10px;background:inherit;border-radius:inherit;border-bottom:1px solid var(--border,rgba(148,163,184,.15))}' +
    '#cpAdm .ad-h b{font-size:1.05rem;flex:1}#cpAdm .ad-hic{width:36px;height:36px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:rgba(124,58,237,.15);color:#a78bfa}' +
    '#cpAdm .ad-x,#cpAdm .ad-re{background:none;border:none;color:inherit;opacity:.75;cursor:pointer;padding:6px;line-height:0}' +
    '#cpAdm .ad-sec{margin:16px 0 6px;font-size:.72rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--fg2,#94a3b8)}' +
    '#cpAdm .ad-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}@media (min-width:560px){#cpAdm .ad-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}' +
    '#cpAdm .ad-card{border:1px solid var(--border,rgba(148,163,184,.2));border-radius:12px;padding:10px 12px;min-width:0}' +
    '#cpAdm .ad-card span{display:block;font-size:.74rem;color:var(--fg2,#94a3b8)}#cpAdm .ad-card b{display:block;font-size:1.25rem;margin-top:2px}#cpAdm .ad-card i{display:block;font-style:normal;font-size:.72rem;color:var(--fg2,#94a3b8);margin-top:2px}' +
    '#cpAdm .ad-btn{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:.8rem;font-weight:700;padding:7px 11px;border-radius:9px;border:1px solid var(--border,rgba(148,163,184,.3));background:transparent;color:inherit;cursor:pointer}' +
    '#cpAdm .ad-btn.pri{background:#7c3aed;border-color:#7c3aed;color:#fff}#cpAdm .ad-btn.warn{border-color:rgba(239,68,68,.6);color:#f87171}#cpAdm .ad-btn:disabled{opacity:.5;cursor:default}' +
    '#cpAdm .ad-inv{border:1px dashed rgba(124,58,237,.6);border-radius:12px;padding:10px 12px;margin-top:8px;word-break:break-all}#cpAdm .ad-inv code{font-size:1.1rem;font-weight:800;letter-spacing:.08em}' +
    '#cpAdm .ad-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}' +
    '#cpAdm input.ad-q{width:100%;box-sizing:border-box;font:inherit;padding:9px 11px;border-radius:10px;border:1px solid var(--border,rgba(148,163,184,.3));background:transparent;color:inherit}' +
    '#cpAdm details{border:1px solid var(--border,rgba(148,163,184,.2));border-radius:12px;margin-top:8px;overflow:hidden}' +
    '#cpAdm summary{list-style:none;cursor:pointer;padding:10px 12px;display:flex;flex-direction:column;gap:2px}#cpAdm summary::-webkit-details-marker{display:none}' +
    '#cpAdm summary b{font-size:.92rem}#cpAdm summary span{font-size:.76rem;color:var(--fg2,#94a3b8)}' +
    '#cpAdm .ad-body{padding:0 12px 12px;font-size:.84rem}#cpAdm .ad-body p{margin:6px 0}' +
    '#cpAdm .ad-pay{display:flex;justify-content:space-between;gap:8px;padding:7px 12px;border-top:1px solid var(--border,rgba(148,163,184,.12));font-size:.8rem}' +
    '#cpAdm .ad-max{font:inherit;font-size:.72rem;font-weight:700;padding:1px 6px;border-radius:6px;border:1px solid rgba(148,163,184,.35);background:transparent;color:inherit;cursor:pointer}#cpAdm .ad-max.on{background:#7c3aed;border-color:#7c3aed;color:#fff}' +
    '#cpAdm .ad-msg{font-size:.8rem;color:var(--fg2,#94a3b8);margin-top:6px}#cpAdm .ad-err{color:#f87171}';

  function badges(m) {
    return (m.appOnly ? '📱 app only ' : '') + (m.premium ? '⭐' : '') + (m.supporter ? '💛' : '') + (m.paused ? '⏸' : '') + (m.pending ? '⏳' : '') + (m.email ? '📱' : '') + (m.linked ? '🔗' : '') + (m.ownKey ? '🔑' : '');
  }
  function memberHtml(m) {
    var prem = m.premium ? '⭐ Premium' + (m.premUntil ? ' until ' + day(m.premUntil) : '') + (m.premSrc === 'stars' ? ' (Stars)' : ' (gift)') : 'Not premium';
    var b = function (op, label, cls) { return '<button type="button" class="ad-btn' + (cls ? ' ' + cls : '') + '" data-op="' + op + '" data-chat="' + E(m.chat) + '">' + label + '</button>'; };
    return '<details data-chat="' + E(m.chat) + '"' + (openChat === m.chat ? ' open' : '') + '><summary><b>' + E(m.name) + (m.user ? ' <span style="display:inline">@' + E(m.user) + '</span>' : '') + ' ' + badges(m) + '</b>' +
      '<span>today 🧠 ' + m.usedQ + '/' + m.ai + ' · 📊 ' + m.usedR + '/' + m.reports + ' · since ' + day(m.joined) + '</span></summary><div class="ad-body">' +
      '<p>📱 App: ' + (m.email ? E(m.email) : 'not yet') + (m.linked ? ' · 🔗 portfolio linked' : ' · not linked') + '</p>' +
      (m.pending ? '<p>⏳ Asks to open the app with <b>' + E(m.pending) + '</b></p><div class="ad-row">' + b('approve', '✅ Allow', 'pri') + b('refuse', '❌ No') + '</div>' : '') +
      '<p>' + prem + (m.supporter ? ' · 💛 Supporter (' + m.starsPaid + ' ⭐)' : '') + (m.ownKey ? ' · 🔑 own Claude key (…' + E(m.ownKey) + ')' : '') + (m.paused ? ' · ⏸ paused' : '') + '</p>' +
      '<div class="ad-row">' + b('ai-', '🧠 −') + b('ai+', '🧠 +') + b('rp-', '📊 −') + b('rp+', '📊 +') + '</div>' +
      '<div class="ad-row">' + b('gift30', '🎁 ⭐ +30 days') + b('gift365', '🎁 ⭐ +365 days') + (m.premium ? b('endPrem', '☆ End premium') : '') + '</div>' +
      '<div class="ad-row">' + (m.paused ? b('resume', '▶️ Resume') : b('pause', '⏸ Pause')) + b('remove', '🗑 Remove member', 'warn') + '</div></div></details>';
  }
  function draw(msg, err) {
    var box = $('cpAdmBody'); if (!box) return;
    if (!data) { box.innerHTML = '<p class="ad-msg' + (err ? ' ad-err' : '') + '">' + E(msg || 'Loading…') + '</p>'; return; }
    var s = data.stats, q = query.trim().toLowerCase();
    var list = data.members.filter(function (m) { return !q || [m.name, m.user, m.email, m.chat, m.pending].join(' ').toLowerCase().indexOf(q) >= 0; });
    box.innerHTML =
      '<div class="ad-grid">' +
        '<div class="ad-card"><span>👥 Members</span><b>' + s.members + '/' + data.max + '</b><i>' + (s.paused ? '⏸ ' + s.paused + ' paused · ' : '') + 'max: ' + (data.maxChoices || [20, 50, 100]).map(function (n) { return '<button type="button" class="ad-max' + (n === data.max ? ' on' : '') + '" data-max="' + n + '">' + n + '</button>'; }).join(' ') + '</i></div>' +
        '<div class="ad-card"><span>⭐ Premium now</span><b>' + s.premium + '</b><i>Stars ' + s.premiumStars + ' · gift ' + (s.premium - s.premiumStars) + '</i></div>' +
        '<div class="ad-card"><span>💛 Supporters</span><b>' + s.supporters + '</b><i>&nbsp;</i></div>' +
        '<div class="ad-card"><span>⭐ This month</span><b>' + s.starsMonth + '</b><i>premium ' + s.starsMonthPremium + ' · support ' + s.starsMonthSupport + '</i></div>' +
        '<div class="ad-card"><span>⭐ All time</span><b>' + s.starsAll + '</b><i>≈ ' + usd(s.starsAll) + ' paid by members</i></div>' +
        '<div class="ad-card"><span>💲 Premium price</span><b>' + data.price + ' ⭐</b><i>a month ≈ ' + usd(data.price) + '</i></div>' +
      '</div>' +
      '<div class="ad-sec">Invite</div><button type="button" class="ad-btn pri" data-inv="1">➕ New invite code</button>' +
      (lastInvite ? '<div class="ad-inv">Code: <code>' + E(lastInvite.code) + '</code>' +
        (lastInvite.appLink ? '<p style="margin:8px 0 2px"><b>📱 Open the app</b> <span class="ad-msg">(no Telegram needed)</span><br><span style="font-size:.8rem">' + E(lastInvite.appLink) + '</span></p><div class="ad-row"><button type="button" class="ad-btn" data-copy="app">Copy app link</button>' + (navigator.share ? '<button type="button" class="ad-btn" data-share="app">Share…</button>' : '') + '</div>' : '') +
        (lastInvite.link ? '<p style="margin:10px 0 2px"><b>🤖 Open the bot</b><br><span style="font-size:.8rem">' + E(lastInvite.link) + '</span></p><div class="ad-row"><button type="button" class="ad-btn" data-copy="bot">Copy bot link</button>' + (navigator.share ? '<button type="button" class="ad-btn" data-share="bot">Share…</button>' : '') + '</div>' : '') +
        '<p class="ad-msg">The same code works in both — one use, ' + lastInvite.days + ' days. They can link the other one later (Settings → Link the Telegram bot).</p></div>' : '') +
      '<div class="ad-sec">Members (' + data.members.length + ')</div><input class="ad-q" id="cpAdmQ" type="search" placeholder="Search name, @user or e-mail" value="' + E(query) + '">' +
      (list.length ? list.map(memberHtml).join('') : '<p class="ad-msg">' + (data.members.length ? 'No one matches.' : 'Nobody yet — make an invite code above.') + '</p>') +
      (data.removed && data.removed.length ? '<div class="ad-sec">Removed (kept 60 days)</div>' + data.removed.map(function (x) {
        return '<div class="ad-pay"><span>' + E(x.name) + (x.premium ? ' ⭐' : '') + (x.supporter ? ' 💛' : '') + ' · removed ' + day(x.removedAt) + '</span><button type="button" class="ad-btn" data-restore="' + E(x.chat) + '">↩️ Restore</button></div>'; }).join('') : '') +
      '<div class="ad-sec">Stars</div><details' + (openChat === '__pay' ? ' open' : '') + ' data-chat="__pay"><summary><b>Payments (' + data.payments.length + ')</b><span>premium subscriptions, renewals and support</span></summary>' +
        (data.payments.length ? data.payments.map(function (p) { return '<div class="ad-pay"><span>' + day(p.t) + ' · ' + E(p.name) + '</span><span>' + (p.kind === 'prem' ? (p.renew ? '⭐ renewal' : '⭐ premium') : '💛 support') + ' · <b>' + p.stars + ' ⭐</b></span></div>'; }).join('') : '<p class="ad-msg" style="padding:0 12px 10px">No payments yet.</p>') +
      '</details><p class="ad-msg">Withdraw the Stars yourself: the bot\'s balance → Fragment.</p>' + (msg ? '<p class="ad-msg' + (err ? ' ad-err' : '') + '">' + E(msg) + '</p>' : '');
    var qi = $('cpAdmQ'); if (qi && doc.activeElement !== qi && query) { /* keep the list filtered */ }
  }
  function load(msg) {
    draw(msg || 'Loading…');
    call({ action: 'overview' }).then(function (j) { data = j; draw(); }).catch(function (e) { data = null; draw(String(e.message || e), true); });
  }
  function op(chat, what) {
    if (busy) return; busy = true; openChat = chat;
    var go = function () {
      return call({ action: 'member', chat: chat, op: what }).then(function (j) { if (j.overview) data = j.overview; busy = false; draw(); })
        .catch(function (e) { busy = false; draw(String(e.message || e), true); });
    };
    if (what === 'remove') {
      var m = data && data.members.filter(function (x) { return x.chat === chat; })[0];
      CPDialog.confirm('Remove ' + (m ? m.name : 'this member') + '? They lose the bot AND the app (their e-mail leaves the access list). Their portfolio data stays in Firebase, and you can ↩️ restore them for 60 days.\n\nJust want to stop them for a while? Use ⏸ Pause instead.', { title: 'Remove member', okText: 'Remove', danger: true })
        .then(function (yes) { if (yes) go(); else busy = false; });
      return;
    }
    go();
  }
  function invite() {
    if (busy) return; busy = true;
    call({ action: 'invite' }).then(function (j) { lastInvite = j; busy = false; draw(); }).catch(function (e) { busy = false; draw(String(e.message || e), true); });
  }
  function close() { var b = $('cpAdm'); if (b) b.remove(); doc.removeEventListener('keydown', esc, true); }
  function esc(e) { if (e.key === 'Escape' && !doc.querySelector('#cpDialog')) { e.stopPropagation(); close(); } }
  function open() {
    if (!window.Samsam || !Samsam.isOwner || !Samsam.isOwner()) return;
    if (!$('cpAdmCss')) { var st = doc.createElement('style'); st.id = 'cpAdmCss'; st.textContent = CSS; doc.head.appendChild(st); }
    close();
    var el = doc.createElement('div'); el.id = 'cpAdm'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Admin dashboard');
    el.innerHTML = '<div class="ad-box"><div class="ad-h"><span class="ad-hic">' + IC('shield') + '</span><b>Admin dashboard</b><button type="button" class="ad-re" aria-label="Refresh">' + IC('refresh') + '</button><button type="button" class="ad-x" aria-label="Close">' + IC('x') + '</button></div><div id="cpAdmBody"></div></div>';
    doc.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target === el || e.target.closest('.ad-x')) { close(); return; }
      if (e.target.closest('.ad-re')) { load(); return; }
      var b = e.target.closest('[data-op]'); if (b) { op(b.dataset.chat, b.dataset.op); return; }
      if (e.target.closest('[data-inv]')) { invite(); return; }
      var rs = e.target.closest('[data-restore]');
      if (rs) { if (busy) return; busy = true; call({ action: 'restore', chat: rs.dataset.restore }).then(function (j) { data = j.overview || data; busy = false; draw('↩️ Restored — they\'re back as they were.'); }).catch(function (er) { busy = false; draw(String(er.message || er), true); }); return; }
      var cp = e.target.closest('[data-copy]'), sh = e.target.closest('[data-share]'), mx = e.target.closest('[data-max]');
      var linkOf = function (w) { return w === 'app' ? lastInvite.appLink : lastInvite.link || lastInvite.code; };
      if (cp && lastInvite) { try { navigator.clipboard.writeText(linkOf(cp.dataset.copy)); draw('Copied ✅'); } catch (_) {} return; }
      if (sh && lastInvite) { navigator.share({ title: 'Cute Portfolio', text: (sh.dataset.share === 'app' ? 'Join me on Cute Portfolio: ' : 'Join my Cute Portfolio bot: ') + linkOf(sh.dataset.share) }).catch(function () {}); return; }
      if (mx) { if (busy) return; busy = true; call({ action: 'setMax', max: +mx.dataset.max }).then(function (j) { data = j; busy = false; draw(); }).catch(function (er) { busy = false; draw(String(er.message || er), true); }); return; }
      var sm = e.target.closest('summary'); if (sm) { var d = sm.parentElement; openChat = d.open ? null : d.dataset.chat; }
    });
    el.addEventListener('input', function (e) { if (e.target.id === 'cpAdmQ') { query = e.target.value; var pos = e.target.selectionStart; draw(); var q = $('cpAdmQ'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (_) {} } } });
    doc.addEventListener('keydown', esc, true);
    load();
  }
  window.SamsamAdmin = { open: open, close: close };
})();
