// samsam-rewards.js — Rewards & mining: the coins you got without buying them (Transfer In at $0 cost).
//   Staking = transactions marked Reward · Mining = the note says mined / mining (imported mined BTC) · Free = airdrops, other $0 coins
// One window (SamsamRewards.open({ sym })): totals, by coin (how much of each coin came free), by month — valued at today's price.
// The Performance page shows a small card that opens it (#freeCard); the coin page's "rewards +…" line opens it for that coin.
(function () {
  'use strict';
  var doc = document, $ = function (id) { return doc.getElementById(id); };
  var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var IC = function (n, o) { return window.SamsamUI ? SamsamUI.ic(n, o) : ''; };
  function S() { return window.Samsam; }
  function ready() { return !!(S() && S().isReady && S().isReady() && S().core && S().core.freeCoins); }
  var KINDS = [['reward', 'Staking rewards', '#a855f7', 'Staking'], ['mining', 'Mining', '#f59e0b', 'Mining'], ['free', 'Airdrops & other free coins', '#22c55e', 'Airdrops']];
  var RANGES = [['all', 'All'], ['365', '12 months'], ['30', '30 days']];
  function usd(n) { return window.SamsamFmt ? SamsamFmt.usd(n) : '$' + Number(n || 0).toFixed(2); }
  function qf(n) { return parseFloat(Number(n).toPrecision(8)).toLocaleString('en-US', { maximumFractionDigits: 8 }); }
  function monthName(ym) { var d = new Date(ym + '-01T00:00:00Z'); return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }); }

  // ── the numbers ──
  function data(range, sym) {
    var st = S().getState() || {}, from = range === 'all' ? null : new Date(Date.now() - (+range) * 864e5).toISOString();
    var rows = S().core.freeCoins(st.transactions || [], from).filter(function (r) { return !sym || r.sym === sym; });
    var px = {}, have = {}; (st.portfolio || []).forEach(function (c) { px[c.sym] = c.currentPrice || 0; have[c.sym] = c.qty || 0; });
    var tot = { all: 0 }, coins = {}, months = {};
    KINDS.forEach(function (k) { tot[k[0]] = 0; });
    rows.forEach(function (r) {
      var v = r.qty * (px[r.sym] || 0); tot.all += v; tot[r.kind] += v;
      var c = coins[r.sym] || (coins[r.sym] = { sym: r.sym, qty: 0, usd: 0, kinds: {}, n: 0, last: '' });
      c.qty += r.qty; c.usd += v; c.kinds[r.kind] = 1; c.n++; if (r.date > c.last) c.last = r.date;
      var ym = r.date.slice(0, 7), m = months[ym] || (months[ym] = { ym: ym, usd: 0, coins: {} });
      m.usd += v; m.coins[r.sym] = (m.coins[r.sym] || 0) + r.qty;
    });
    var list = Object.keys(coins).map(function (k) { var c = coins[k]; c.share = have[k] > 0 ? Math.min(100, c.qty / have[k] * 100) : null; return c; }).sort(function (a, b) { return b.usd - a.usd; });
    var ml = Object.keys(months).sort().reverse().map(function (k) { return months[k]; });
    return { rows: rows, tot: tot, coins: list, months: ml };
  }

  // ── the window ──
  var CSS =
    '#cpRew{position:fixed;inset:0;z-index:99995;background:rgba(2,6,23,.55);display:flex;align-items:flex-end;justify-content:center}' +
    '@media (min-width:640px){#cpRew{align-items:center;padding:16px}}' +
    '#cpRew .rw-box{width:min(560px,100%);max-height:92vh;overflow:auto;background:var(--card-solid,var(--bg2,#111827));color:var(--fg,#e5e7eb);border:1px solid var(--border,#374151);border-radius:18px 18px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));font:14px/1.45 system-ui,-apple-system,"Inter",sans-serif;box-sizing:border-box}' +
    '@media (min-width:640px){#cpRew .rw-box{border-radius:18px}}' +
    '#cpRew .rw-h{display:flex;align-items:center;gap:10px;position:sticky;top:-16px;z-index:3;margin:-16px -16px 8px;padding:16px 16px 10px;background:inherit;border-radius:inherit;border-bottom:1px solid var(--border,rgba(148,163,184,.15))}' +
    '#cpRew .rw-h b{flex:1;font-size:1.05rem}#cpRew .rw-hic{width:36px;height:36px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:rgba(168,85,247,.15);color:#c084fc}#cpRew .rw-hic .ss-ic{margin:0}' +
    '[data-theme="light"] #cpRew .rw-hic{color:#9333ea}' +
    '#cpRew .rw-x{background:none;border:none;color:inherit;opacity:.7;cursor:pointer;padding:6px;line-height:0}' +
    '#cpRew .rw-seg{display:inline-flex;gap:3px;background:rgba(148,163,184,.12);padding:3px;border-radius:10px;flex-wrap:wrap}' +
    '#cpRew .rw-seg button{border:none;background:transparent;color:inherit;font:inherit;font-size:.78rem;font-weight:700;padding:6px 11px;border-radius:8px;cursor:pointer;opacity:.7}' +
    '#cpRew .rw-seg button[aria-checked="true"]{opacity:1;background:#7c3aed;color:#fff}' +
    '#cpRew .rw-top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}' +
    '#cpRew .rw-big{margin:12px 0 4px}#cpRew .rw-big b{font-size:1.6rem;font-weight:800}#cpRew .rw-big span{display:block;font-size:.78rem;color:var(--fg2,#94a3b8)}' +
    '#cpRew .rw-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}' +
    '#cpRew .rw-tile{border:1px solid var(--border,rgba(148,163,184,.2));border-radius:12px;padding:9px 10px;min-width:0}' +
    '#cpRew .rw-tile i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}#cpRew .rw-tile small{display:block;font-size:.7rem;color:var(--fg2,#94a3b8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#cpRew .rw-tile b{font-size:.95rem}' +
    '@media (max-width:420px){#cpRew .rw-tile{padding:8px}#cpRew .rw-tile b{font-size:.86rem}}' +
    '#cpRew .rw-sec{margin:16px 0 6px;font-size:.72rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--fg2,#94a3b8)}' +
    '#cpRew .rw-list{border:1px solid var(--border,rgba(148,163,184,.2));border-radius:14px;overflow:hidden}' +
    '#cpRew .rw-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border-top:1px solid var(--border,rgba(148,163,184,.15))}#cpRew .rw-list>:first-child{border-top:none}' +
    '#cpRew .rw-row .rw-t{flex:1;min-width:0}#cpRew .rw-row b{font-size:.92rem}#cpRew .rw-row small{display:block;font-size:.76rem;color:var(--fg2,#94a3b8)}' +
    '#cpRew .rw-row .rw-v{text-align:right;white-space:nowrap}#cpRew .rw-row .rw-v b{color:#22c55e}[data-theme="light"] #cpRew .rw-row .rw-v b{color:#16a34a}' +
    '#cpRew .rw-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-left:4px;vertical-align:1px}' +
    '#cpRew .rw-bar{height:4px;border-radius:3px;background:rgba(148,163,184,.15);margin-top:5px;overflow:hidden}#cpRew .rw-bar i{display:block;height:100%;background:#a855f7;border-radius:3px}' +
    '#cpRew .rw-note{font-size:.76rem;color:var(--fg2,#94a3b8);margin-top:12px}' +
    '#cpRew .rw-empty{padding:18px 4px;color:var(--fg2,#94a3b8);font-size:.86rem;line-height:1.55}' +
    '#cpRew .rw-all{background:none;border:none;color:#a78bfa;font:inherit;font-size:.8rem;font-weight:700;cursor:pointer;padding:0}' +
    // the card on the Performance page
    '.free-card[hidden]{display:none!important}.free-card{grid-column:1/-1;display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;margin-top:12px;padding:12px 14px;border-radius:14px;border:1px solid rgba(168,85,247,.3);background:rgba(168,85,247,.07);color:inherit;font:inherit;text-align:left;cursor:pointer}' +
    '.free-card .fc-ic{width:34px;height:34px;flex:none;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:rgba(168,85,247,.16);color:#c084fc}.free-card .fc-ic .ss-ic{margin:0}' +
    '[data-theme="light"] .free-card .fc-ic{color:#9333ea}' +
    '.free-card .fc-t{flex:1;min-width:0}.free-card .fc-t b{display:block;font-size:.9rem}.free-card .fc-t small{display:block;font-size:.76rem;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.free-card .fc-v{font-weight:800;color:#22c55e;white-space:nowrap}[data-theme="light"] .free-card .fc-v{color:#16a34a}.free-card .fc-go{opacity:.5;font-size:1.2rem}';
  function css() { if (!$('rwCss')) { var st = doc.createElement('style'); st.id = 'rwCss'; st.textContent = CSS; doc.head.appendChild(st); } }
  var view = { range: 'all', sym: null };
  function kindDots(c) { return KINDS.filter(function (k) { return c.kinds[k[0]]; }).map(function (k) { return '<span class="rw-dot" title="' + E(k[1]) + '" style="background:' + k[2] + '"></span>'; }).join(''); }
  function draw() {
    var el = $('cpRew'); if (!el || !ready()) return;
    var d = data(view.range, view.sym);
    var h = '<div class="rw-top"><span class="rw-seg" role="radiogroup" aria-label="Period">' + RANGES.map(function (r) { return '<button type="button" role="radio" data-r="' + r[0] + '" aria-checked="' + (view.range === r[0]) + '">' + r[1] + '</button>'; }).join('') + '</span>' +
      (view.sym ? '<button type="button" class="rw-all" data-allc="1">‹ All coins</button>' : '') + '</div>';
    if (!d.rows.length) {
      el.querySelector('.rw-body').innerHTML = h + '<div class="rw-empty">' + (view.sym ? 'No ' + E(view.sym) + ' rewards' : 'No rewards or mined coins') + (view.range === 'all' ? ' yet.' : ' in this period.') +
        '<br>Add them with <b>Add Transaction → Reward</b> (staking, at $0 cost), or from <b>Wallets &amp; check → Add as Reward</b> when your wallet has more. Mined BTC imported from Binance counts here too.</div>';
      return;
    }
    h += '<div class="rw-big"><b>' + usd(d.tot.all) + '</b><span>' + (view.sym ? E(view.sym) + ' you got without buying' : 'coins you got without buying') + ' · ' + d.rows.length + ' time' + (d.rows.length === 1 ? '' : 's') + ' · at today’s prices</span></div>';
    h += '<div class="rw-tiles">' + KINDS.map(function (k) { return '<div class="rw-tile" data-k="' + k[0] + '" title="' + E(k[1]) + '"><small><i style="background:' + k[2] + '"></i>' + E(k[3]) + '</small><b>' + usd(d.tot[k[0]]) + '</b></div>'; }).join('') + '</div>';
    if (!view.sym) {
      h += '<div class="rw-sec">By coin</div><div class="rw-list" id="rwCoins">' + d.coins.map(function (c) {
        return '<div class="rw-row" data-sym="' + E(c.sym) + '"><span class="rw-t"><b>' + E(c.sym) + '</b>' + kindDots(c) +
          '<small>' + (c.share != null ? c.share.toFixed(c.share < 10 ? 1 : 0) + '% of your ' + E(c.sym) + ' came free' : 'you hold none now') + ' · last ' + new Date(c.last).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + '</small>' +
          (c.share != null ? '<div class="rw-bar"><i style="width:' + Math.max(2, c.share).toFixed(1) + '%"></i></div>' : '') + '</span>' +
          '<span class="rw-v"><b>+' + qf(c.qty) + ' ' + E(c.sym) + '</b><small>' + usd(c.usd) + '</small></span></div>';
      }).join('') + '</div>';
    }
    h += '<div class="rw-sec">By month</div><div class="rw-list" id="rwMonths">' + d.months.map(function (m) {
      var cs = Object.keys(m.coins).map(function (s) { return '+' + qf(m.coins[s]) + ' ' + E(s); }).join(' · ');
      return '<div class="rw-row" data-ym="' + m.ym + '"><span class="rw-t"><b>' + monthName(m.ym) + '</b><small>' + cs + '</small></span><span class="rw-v"><b>' + usd(m.usd) + '</b></span></div>';
    }).join('') + '</div>';
    h += '<div class="rw-note">Values use today’s price. Rewards come in at $0 cost, so they lower your average buy price — they’re already part of your All Time Profit.</div>';
    el.querySelector('.rw-body').innerHTML = h;
  }
  var unsub = null;
  function close() { var b = $('cpRew'); if (b) b.remove(); doc.removeEventListener('keydown', esc, true); if (unsub) { unsub(); unsub = null; } }
  function esc(e) { if (e.key === 'Escape' && !doc.querySelector('#cpDialog')) { e.stopPropagation(); close(); } }
  function open(opts) {
    if (!ready()) return; opts = opts || {}; css(); close();
    view = { range: opts.range || 'all', sym: opts.sym ? String(opts.sym).toUpperCase() : null };
    var el = doc.createElement('div'); el.id = 'cpRew'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Rewards & mining');
    el.innerHTML = '<div class="rw-box"><div class="rw-h"><span class="rw-hic">' + IC('coins', { solo: true }) + '</span><b>Rewards &amp; mining</b><button type="button" class="rw-x" aria-label="Close">' + IC('x') + '</button></div><div class="rw-body"></div></div>';
    doc.body.appendChild(el); draw();
    el.addEventListener('click', function (e) {
      var t = e.target;
      if (t === el || t.closest('.rw-x')) { close(); return; }
      var r = t.closest('[data-r]'); if (r) { view.range = r.dataset.r; draw(); return; }
      if (t.closest('[data-allc]')) { view.sym = null; draw(); return; }
      var c = t.closest('#rwCoins .rw-row'); if (c) { view.sym = c.dataset.sym; draw(); }
    });
    doc.addEventListener('keydown', esc, true);
    unsub = S().onChange(function () { if ($('cpRew')) draw(); });
  }
  // the Performance page card (shown once you have any)
  function card() {
    var host = $('freeCard'); if (!host || !ready()) return;
    var d = data('all'), m = data('30');
    css(); host.hidden = false;
    if (!d.rows.length) {   // always there, so you know where it is — tap shows how to add them
      host.innerHTML = '<span class="fc-ic">' + IC('coins', { solo: true }) + '</span><span class="fc-t"><b>Rewards &amp; mining</b><small>None yet — staking rewards, mined BTC and airdrops show here</small></span><span class="fc-v">$0</span><span class="fc-go">›</span>';
      return;
    }
    var top = d.coins.slice(0, 3).map(function (c) { return '+' + qf(c.qty) + ' ' + c.sym; }).join(' · ');
    host.innerHTML = '<span class="fc-ic">' + IC('coins', { solo: true }) + '</span><span class="fc-t"><b>Rewards &amp; mining</b><small>' + E(top) + (m.tot.all > 0 ? ' · ' + usd(m.tot.all) + ' in 30 days' : '') + '</small></span><span class="fc-v">' + usd(d.tot.all) + '</span><span class="fc-go">›</span>';
  }
  function hook() {
    var host = $('freeCard'); if (!host || host.__rw) return; host.__rw = true;
    host.addEventListener('click', function () { open(); });
    var tick = function () { if (ready()) { card(); S().onChange(card); } else setTimeout(tick, 300); }; tick();
  }
  if (doc.readyState !== 'loading') hook(); else doc.addEventListener('DOMContentLoaded', hook);
  window.SamsamRewards = { open: open, close: close, data: function (r, s) { return ready() ? data(r || 'all', s) : null; }, card: card };
})();
