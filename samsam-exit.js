/* Exit Strategy & Take-Profit Hub (Plan page → 🚪 Exit Strategy)
 *
 *  • Macro card: BTC.D, USDT.D and ETH/BTC against YOUR levels (saved in the cloud, editable). It only compares —
 *    it never predicts a top. Grey = waiting · amber = within 10 % of the level · green = level reached.
 *  • Cash bar: how much of the portfolio already sits in stablecoins, plus the profit already taken by selling.
 *  • One card per coin you add: TP1 / TP2 / TP3 (price + % to sell), optional 10 % moonbag that is never sold,
 *    quick fill 2× / 3× / 5× your average buy price, "Target hit — sell X" when the price gets there, and ✓ Done
 *    on its own when sells recorded in Holdings (after the coin joined the plan) cover a step — steps fill in order.
 *
 *  SamsamExit.calc — the maths, no page needed (tests use it).
 *  SamsamExit.mount(el) / .render(state) — the page.
 */
(function () {
  if (window.SamsamExit) return;
  var E = function (s) { return window.SamsamCoins ? SamsamCoins.esc(s) : String(s == null ? '' : s); };
  var F = function () { return window.SamsamFmt; };
  var MOON = 0.10, NEAR = 0.10, DEF_PCTS = [25, 50, 25], MULTS = [2, 3, 5];

  // ── maths ──────────────────────────────────────────────────────────────────
  var calc = {
    // state: 'hit' | 'near' | 'wait' | 'none'; progress 0–100 toward the level
    macro: function (g, ethBtc, t) {
      var rows = [], st = function (hit, near) { return hit ? 'hit' : near ? 'near' : 'wait'; };
      var b = g && g.dom ? +g.dom.btc : null;
      rows.push({ k: 'btcD', name: 'BTC Dominance', short: 'BTC.D', cur: b, rule: '≤ ' + t.btcD.toFixed(2) + '%',
        state: b == null ? 'none' : st(b <= t.btcD, (b - t.btcD) / t.btcD <= NEAR), progress: b ? Math.min(100, t.btcD / b * 100) : 0, fmt: function (v) { return v.toFixed(2) + '%'; } });
      var u = g && g.dom ? +g.dom.usdt : null;
      rows.push({ k: 'usdtD', name: 'USDT Dominance', short: 'USDT.D', cur: u, rule: t.usdtHi.toFixed(2) + '% – ' + t.usdtLo.toFixed(2) + '%',
        state: u == null ? 'none' : st(u <= t.usdtHi, (u - t.usdtHi) / t.usdtHi <= NEAR), progress: u ? Math.min(100, t.usdtHi / u * 100) : 0,
        below: u != null && u < t.usdtLo, fmt: function (v) { return v.toFixed(2) + '%'; } });
      var e = ethBtc > 0 ? ethBtc : null;
      rows.push({ k: 'ethBtc', name: 'ETH / BTC', short: 'ETH/BTC', cur: e, rule: '≥ ' + fmtRatio(t.ethBtc),
        state: e == null ? 'none' : st(e >= t.ethBtc, (t.ethBtc - e) / t.ethBtc <= NEAR), progress: e ? Math.min(100, e / t.ethBtc * 100) : 0, fmt: fmtRatio });
      return { rows: rows, hit: rows.filter(function (r) { return r.state === 'hit'; }).length };
    },
    // entry: { sym, baseQty, startedAt, moonbag, tps }, coin: { qty, basePrice, currentPrice }, txs: all transactions
    coin: function (entry, coin, txs) {
      coin = coin || {};
      var base = +entry.baseQty || 0, price = +coin.currentPrice || 0, avg = +coin.basePrice || 0;
      var moon = entry.moonbag ? base * MOON : 0, sellable = base - moon;
      var since = Date.parse(entry.startedAt) || 0;
      var sold = (txs || []).filter(function (x) { return x.sym === entry.sym && x.type === 'sell' && (Date.parse(x.createdAt || x.date) || 0) >= since; })   // recorded after the coin joined the plan
        .reduce(function (s, x) { return s + (+x.qty || 0); }, 0);
      var left = sold, pctSum = 0, cash = 0, profit = 0, cost = 0, done = 0;
      var steps = (entry.tps || []).map(function (tp, i) {
        var pct = +tp.pct || 0, tpPrice = +tp.price || 0, qty = sellable * pct / 100;
        pctSum += pct;
        var filled = Math.min(qty, Math.max(0, left)); left -= filled;
        var isDone = qty > 0 && filled >= qty * 0.999, part = qty > 0 && filled > 0 && !isDone;
        var hit = tpPrice > 0 && price >= tpPrice;
        var status = isDone ? 'done' : !(tpPrice > 0) || !(qty > 0) ? 'unset' : hit ? 'hit' : 'wait';
        if (isDone) done++;
        cash += qty * tpPrice; cost += qty * avg; profit += qty * (tpPrice - avg);
        return { i: i, name: 'TP' + (i + 1), price: tpPrice, pct: pct, qty: qty, filled: filled, part: part, status: status,
          toSell: Math.max(0, qty - filled), cash: qty * tpPrice, progress: tpPrice > 0 && price > 0 ? Math.min(100, price / tpPrice * 100) : 0,
          away: tpPrice > 0 && price > 0 ? (tpPrice / price - 1) * 100 : null };
      });
      return { base: base, moon: moon, sellable: sellable, sold: sold, steps: steps, pctSum: pctSum, cash: cash, profit: profit,
        profitPct: cost > 0 ? profit / cost * 100 : null, done: done, price: price, avg: avg, held: +coin.qty || 0 };
    },
    // the three steps from your average buy price
    quickFill: function (avg) { return avg > 0 ? MULTS.map(function (m, i) { return { price: +(avg * m).toPrecision(6), pct: DEF_PCTS[i] }; }) : null; },
    // stablecoins vs the rest (value at current prices) + profit already taken
    cashBar: function (portfolio, realized, isStable) {
      var total = 0, stable = 0, list = [];
      (portfolio || []).forEach(function (c) {
        var v = c.qty > 0 ? c.qty * (c.currentPrice || 0) : 0; if (!(v > 0)) return;
        total += v; if (isStable(c)) { stable += v; list.push(c.sym); }
      });
      return { total: total, stable: stable, market: total - stable, pct: total > 0 ? stable / total * 100 : 0, realized: +realized || 0, stables: list };
    },
  };
  function fmtRatio(v) { return v == null ? '—' : (+v).toFixed(v >= 1 ? 3 : 5).replace(/0+$/, '').replace(/\.$/, '') ; }
  function isStable(c) { return window.SamsamMarket ? SamsamMarket.isStable({ sym: c.sym, name: c.name || '' }) : /^(USDT|USDC|DAI|FDUSD|USDE|USDS)$/.test(c.sym); }

  // ── page ───────────────────────────────────────────────────────────────────
  var root = null, st = null, mkt = { g: null, ethBtc: null, t: 0 }, editTargets = false, draft = null, saveT = null, pickOpen = false;
  function S() { return window.Samsam; }
  function exitState() { return draft || (st && st.exit) || { targets: {}, plan: [] }; }
  function coinOf(sym) { return ((st && st.portfolio) || []).find(function (c) { return c.sym === sym; }); }

  function loadMarket(force) {
    var M = window.SamsamMarket; if (!M) return;
    var eb = function (top) {
      var P = S() && S().getPrices ? S().getPrices() : {}, b = P.BTC, e = P.ETH;
      if (b && e && b.usd > 0 && e.usd > 0 && Date.now() - Math.min(b.t || 0, e.t || 0) < 30 * 60e3) return e.usd / b.usd;
      var rb = (top || []).find(function (r) { return r.id === 'bitcoin'; }), re = (top || []).find(function (r) { return r.id === 'ethereum'; });
      return rb && re && rb.price > 0 ? re.price / rb.price : null;
    };
    M.peek().then(function (p) { if (p.global) mkt.g = p.global; mkt.ethBtc = eb(p.top); mkt.t = p.t || Date.now(); paint(); }).catch(function () {});
    M.global(force).then(function (r) { mkt.g = r.data; mkt.t = Math.max(mkt.t, r.t || 0); paint(); }).catch(function () {});
  }

  function save(part, now) {
    if (part.plan) draft = { tab: exitState().tab, targets: exitState().targets, plan: part.plan };
    clearTimeout(saveT);
    var go = function () { saveT = null; var d = draft; S().saveExit(part).catch(function () {}).then(function () { if (draft === d) draft = null; }); };
    if (now) go(); else saveT = setTimeout(go, 700);
  }
  function planCopy() { return JSON.parse(JSON.stringify(exitState().plan || [])); }

  function badge(s) {
    return s.status === 'done' ? '<span class="xs-badge done">✓ Done</span>'
      : s.status === 'hit' ? '<span class="xs-badge hit">🎯 Target hit — sell ' + SamsamCoins.fmtAmount(s.toSell) + (s.part ? ' more' : '') + '</span>'
      : s.part ? '<span class="xs-badge part">' + Math.round(s.filled / s.qty * 100) + '% sold</span>'
      : s.status === 'unset' ? '<span class="xs-badge">Set a price</span>'
      : '<span class="xs-badge wait">' + (s.away != null ? '+' + s.away.toFixed(1) + '% to go' : 'Waiting') + '</span>';
  }

  function macroHtml() {
    var t = exitState().targets, m = calc.macro(mkt.g, mkt.ethBtc, t);
    var rows = m.rows.map(function (r) {
      var cur = r.cur == null ? '—' : r.fmt(r.cur);
      var lbl = r.state === 'hit' ? (r.below ? 'Below range' : 'Reached') : r.state === 'near' ? 'Close' : r.state === 'none' ? '—' : 'Waiting';
      return '<div class="xm-row ' + r.state + '" data-k="' + r.k + '">' +
        '<div class="xm-top"><span class="xm-name">' + r.name + '</span><span class="xm-cur">' + cur + '</span></div>' +
        '<div class="xm-bar"><i style="width:' + r.progress.toFixed(1) + '%"></i></div>' +
        '<div class="xm-sub"><span>Target ' + r.rule + '</span><span class="xm-st">' + lbl + '</span></div></div>';
    }).join('');
    var ed = editTargets ? '<div class="xm-edit">' +
      field('btcD', 'BTC.D at or under (%)', t.btcD) + field('usdtHi', 'USDT.D range — from (%)', t.usdtHi) +
      field('usdtLo', 'USDT.D range — to (%)', t.usdtLo) + field('ethBtc', 'ETH / BTC at or over', t.ethBtc) +
      '<div class="xm-edit-btns"><button type="button" class="xs-btn" data-act="tg-reset">Reset to defaults</button><button type="button" class="xs-btn pri" data-act="tg-save">Save</button></div></div>' : '';
    return '<section class="xs-card xm-card" aria-label="Macro exit indicators">' +
      '<div class="xs-head"><div class="xs-title">Macro Exit Indicators</div>' +
      '<button type="button" class="xs-link" data-act="tg-edit">' + (editTargets ? 'Close' : 'Edit targets') + '</button></div>' +
      '<div class="xm-sum ' + (m.hit === 3 ? 'all' : m.hit ? 'some' : '') + '">Signals Hit: <b>' + m.hit + ' of 3</b></div>' +
      '<div class="xm-rows">' + rows + '</div>' + ed +
      '<div class="xs-note">Your own levels — the page compares, it doesn’t predict the top.</div></section>';
  }
  function field(k, label, v) { return '<label class="xm-f"><span>' + label + '</span><input type="number" inputmode="decimal" step="any" data-tg="' + k + '" value="' + v + '"></label>'; }

  function cashHtml() {
    var c = calc.cashBar(st.portfolio, st.realized && st.realized.total, isStable);
    var plan = exitState().plan, steps = 0, done = 0;
    plan.forEach(function (e) { var r = calc.coin(e, coinOf(e.sym), st.transactions); r.steps.forEach(function (s) { if (s.qty > 0) { steps++; if (s.status === 'done') done++; } }); });
    return '<section class="xs-card xc-card" aria-label="Cash and stablecoins">' +
      '<div class="xs-head"><div class="xs-title">Cash-out Progress</div><div class="xc-pct">' + c.pct.toFixed(1) + '% <small>in stablecoins</small></div></div>' +
      '<div class="xc-bar" role="img" aria-label="' + c.pct.toFixed(1) + '% of the portfolio in stablecoins"><i style="width:' + Math.min(100, c.pct).toFixed(2) + '%"></i></div>' +
      '<div class="xc-leg"><span><i class="s"></i>Stablecoins <b>' + F().usd(c.stable) + '</b></span><span><i class="m"></i>In the market <b>' + F().usd(c.market) + '</b></span></div>' +
      '<div class="xc-foot"><div>Realized profit <b class="' + (c.realized >= 0 ? 'up' : 'down') + '">' + F().usdSigned(c.realized) + '</b></div>' +
      '<div>Exit steps done <b>' + done + ' of ' + steps + '</b></div></div></section>';
  }

  function coinHtml(e, idx) {
    var pc = coinOf(e.sym), r = calc.coin(e, pc, st.transactions), sym = E(e.sym);
    var asset = SamsamCoins.assetCell(e.sym, { logoUrl: (pc && pc.logoUrl) || '', cgId: (pc && pc.cgId) || e.cgId || '', name: pc && pc.name, price: r.price, change24h: pc && pc.change24h });
    var steps = r.steps.map(function (s) {
      return '<div class="xt ' + s.status + (s.part ? ' part' : '') + '">' +
        '<div class="xt-top"><b>' + s.name + '</b>' + badge(s) + '</div>' +
        '<div class="xt-in"><label><span>Price</span><input type="number" inputmode="decimal" step="any" min="0" data-i="' + idx + '" data-tp="' + s.i + '" data-f="price" value="' + (s.price || '') + '" placeholder="$0.00"></label>' +
        '<label><span>Sell %</span><input type="number" inputmode="decimal" step="any" min="0" max="100" data-i="' + idx + '" data-tp="' + s.i + '" data-f="pct" value="' + s.pct + '"></label></div>' +
        '<div class="xt-bar"><i style="width:' + (s.status === 'done' ? 100 : s.progress).toFixed(1) + '%"></i></div>' +
        '<div class="xt-sub"><span>Sell ' + SamsamCoins.fmtAmount(s.qty) + ' ' + sym + '</span><span>→ <b>' + F().usd(s.cash) + '</b></span></div></div>';
    }).join('');
    var warn = Math.abs(r.pctSum - 100) > 0.01 ? '<div class="xs-warn">The three steps add up to ' + +r.pctSum.toFixed(2) + '% (not 100%).</div>' : '';
    var held = r.held < r.base - r.sold - 1e-9 ? '<div class="xs-warn">You now hold ' + SamsamCoins.fmtAmount(r.held) + ' ' + sym + ' — less than the plan still sells.</div>' : '';
    return '<article class="xs-card xk-card" data-sym="' + sym + '">' +
      '<div class="xk-head">' + asset + '<button type="button" class="xs-x" data-act="remove" data-i="' + idx + '" aria-label="Remove ' + sym + ' from the exit plan" title="Remove from the exit plan">' + SamsamUI.ic('x', { solo: true, size: 14 }) + '</button></div>' +
      '<div class="xk-info"><span>Plan amount <b>' + SamsamCoins.fmtAmount(r.base) + '</b></span><span>Avg buy <b>' + (r.avg > 0 ? F().price(r.avg) : '—') + '</b></span>' + (r.sold > 0 ? '<span>Sold since <b>' + SamsamCoins.fmtAmount(r.sold) + '</b></span>' : '') + '</div>' +
      '<div class="xk-opts"><label class="xk-moon"><input type="checkbox" data-act="moon" data-i="' + idx + '"' + (e.moonbag ? ' checked' : '') + '><span>Reserve 10% Moonbag</span></label>' +
      '<button type="button" class="xs-btn" data-act="quick" data-i="' + idx + '"' + (r.avg > 0 ? '' : ' disabled title="No average buy price for this coin"') + '>Quick fill 2× · 3× · 5×</button></div>' +
      '<div class="xk-steps">' + steps + '</div>' + warn + held +
      '<div class="xk-foot"><div><span>Projected cash-out</span><b>' + F().usd(r.cash) + '</b></div>' +
      '<div><span>Net profit</span><b class="' + (r.profit >= 0 ? 'up' : 'down') + '">' + F().usdSigned(r.profit) + (r.profitPct != null ? ' <small>(' + (r.profitPct >= 0 ? '+' : '') + r.profitPct.toFixed(1) + '%)</small>' : '') + '</b></div>' +
      (r.moon > 0 ? '<div><span>Moonbag kept</span><b>' + SamsamCoins.fmtAmount(r.moon) + ' ' + sym + '</b></div>' : '') + '</div></article>';
  }

  function pickHtml() {
    if (!pickOpen) return '';
    var inPlan = {}; exitState().plan.forEach(function (e) { inPlan[e.sym] = 1; });
    var list = (st.portfolio || []).filter(function (c) { return c.qty > 0 && !inPlan[c.sym] && !isStable(c); })
      .sort(function (a, b) { return b.qty * (b.currentPrice || 0) - a.qty * (a.currentPrice || 0); });
    return '<div class="xs-card xp-card"><div class="xs-head"><div class="xs-title">Add to Exit Plan</div><button type="button" class="xs-link" data-act="pick-close">Close</button></div>' +
      (list.length ? '<div class="xp-list">' + list.map(function (c) {
        return '<button type="button" class="xp-item" data-act="add" data-sym="' + E(c.sym) + '">' + SamsamCoins.assetIcon(c.sym, { logoUrl: c.logoUrl || '', cgId: c.cgId || '' }) +
          '<span class="xp-s">' + E(c.sym) + '</span><span class="xp-v">' + F().usd(c.qty * (c.currentPrice || 0)) + '</span></button>';
      }).join('') + '</div>' : '<div class="xs-note">Every coin you hold is already in the exit plan.</div>') + '</div>';
  }

  function paint() {
    if (!root || !st) return;
    var a = document.activeElement; if (a && root.contains(a) && a.tagName === 'INPUT' && a.type !== 'checkbox') return;   // never redraw under your typing
    var plan = exitState().plan;
    root.innerHTML = '<div class="xs-top">' + macroHtml() + cashHtml() + '</div>' +
      '<div class="xs-bar"><button type="button" class="cp-add" data-act="pick"><span class="cp-add-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span><span>Add to Exit Plan</span></button>' +
      '<span class="xs-count">' + plan.length + ' coin' + (plan.length === 1 ? '' : 's') + '</span></div>' + pickHtml() +
      (plan.length ? '<div class="xk-grid">' + plan.map(coinHtml).join('') + '</div>'
        : '<div class="xs-empty">No coins in your exit plan yet.<br>Tap <b>Add to Exit Plan</b> and choose the coins you want to take profit on.</div>') +
      '<div class="xs-note center">A tool to organise and follow your own plan — not financial advice.</div>';
  }

  function onClick(ev) {
    var b = ev.target.closest('[data-act]'); if (!b || !root.contains(b)) return;
    var act = b.dataset.act, i = +b.dataset.i, plan;
    if (act === 'tg-edit') { editTargets = !editTargets; paint(); }
    else if (act === 'tg-reset') { editTargets = false; S().saveExit({ targets: null }); paint(); }
    else if (act === 'tg-save') {
      var t = {}; root.querySelectorAll('[data-tg]').forEach(function (x) { t[x.dataset.tg] = +x.value; });
      editTargets = false; S().saveExit({ targets: t }); paint();
    }
    else if (act === 'pick') { pickOpen = !pickOpen; paint(); }
    else if (act === 'pick-close') { pickOpen = false; paint(); }
    else if (act === 'add') {
      var c = coinOf(b.dataset.sym); if (!c) return;
      plan = planCopy();
      plan.push({ sym: c.sym, cgId: c.cgId || '', baseQty: c.qty, startedAt: new Date().toISOString(), moonbag: true,
        tps: calc.quickFill(c.basePrice) || DEF_PCTS.map(function (p) { return { price: 0, pct: p }; }) });
      pickOpen = false; save({ plan: plan }, true); paint();
    }
    else if (act === 'remove') {
      var sym0 = (exitState().plan[i] || {}).sym; if (!sym0) return;
      var ask = window.CPDialog ? CPDialog.confirm('Your coins and transactions are not touched.', { title: 'Remove ' + sym0 + ' from the exit plan?', okText: 'Remove', danger: true }) : Promise.resolve(confirm('Remove ' + sym0 + ' from the exit plan?'));
      ask.then(function (ok) { if (!ok) return; var pl = planCopy().filter(function (x) { return x.sym !== sym0; }); save({ plan: pl }, true); paint(); });
    }
    else if (act === 'quick') {
      plan = planCopy(); var q = calc.quickFill((coinOf(plan[i].sym) || {}).basePrice); if (!q) return;
      plan[i].tps = q.map(function (x, k) { return { price: x.price, pct: (plan[i].tps[k] || {}).pct != null ? plan[i].tps[k].pct : x.pct }; });
      save({ plan: plan }, true); paint();
    }
  }
  function onChange(ev) {
    var x = ev.target;
    if (x.dataset.act === 'moon') { var plan = planCopy(); plan[+x.dataset.i].moonbag = x.checked; save({ plan: plan }, true); paint(); return; }
    if (x.dataset.tp != null) {
      var p = planCopy(), e = p[+x.dataset.i]; if (!e) return;
      var v = Math.max(0, +x.value || 0); if (x.dataset.f === 'pct') v = Math.min(100, v);
      e.tps[+x.dataset.tp][x.dataset.f] = v; save({ plan: p }); x.blur(); paint();
    }
  }

  window.SamsamExit = {
    calc: calc,
    mount: function (el) {
      if (root === el) return; root = el;
      root.addEventListener('click', onClick);
      root.addEventListener('change', onChange);
      root.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') ev.target.blur(); });
      root.addEventListener('focusout', function () { setTimeout(function () { var a = document.activeElement; if (!(a && root.contains(a) && a.tagName === 'INPUT')) paint(); }, 0); });
      loadMarket(false);
      setInterval(function () { if (!document.hidden && root.offsetParent) loadMarket(false); }, 3 * 60e3);
    },
    render: function (state) { st = state; paint(); },
    refreshMarket: loadMarket,
  };
})();
