// samsam-import.js — Import from an exchange file (CSV): trade history + withdraw history.
//
// Nothing is automatic: you pick the files, the screen shows every transaction it would add (and why others are skipped),
// and only what you tick is saved. Known layouts (Binance) are read directly; any other exchange is read by its column
// names, and when a column isn't clear you choose it once — the choice is remembered for that layout.
//
// How the money is counted:
//   · fills of one order → one transaction (average price)
//   · trading fee in the coin → fewer coins arrive (cost unchanged); in USDT → added to the cost; in BNB etc. → its dollar value
//   · a withdrawal to YOUR wallet → its network fee comes off the coins of the last buy (fee in coins, cost unchanged)
//   · a withdrawal to another exchange / not yours (e.g. USDT to Gate.io) → nothing changes
//   · BTC sold on the exchange = mining income (optional, on by default) → not taken from your wallet
//   · more coins sent to your wallet than these files bought → offered as "Transfer In" (mined BTC: cost $0)
//   · already in your portfolio (same coin, ±2 days, same amount or dollars) or before your newest entry → not ticked
// Pure logic is in SamsamImport.core (also loaded by the tests in Node).
(function (root) {
  'use strict';
  var STABLE = { USDT: 1, USDC: 1, FDUSD: 1, BUSD: 1, TUSD: 1, USD: 1, DAI: 1, USDP: 1, PYUSD: 1, USD1: 1, USDE: 1, RLUSD: 1 };
  var QUOTES = ['FDUSD', 'USDT', 'USDC', 'BUSD', 'TUSD', 'USD1', 'USDE', 'DAI', 'USD', 'BTC', 'ETH', 'BNB', 'EUR', 'TRY', 'BRL'];
  function isStable(s) { return !!STABLE[String(s || '').toUpperCase()]; }
  function low(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }

  // ── CSV ──
  function parseCsv(text) {
    text = String(text || '').replace(/^﻿/, '');
    var first = text.split(/\r?\n/, 1)[0] || '';
    var sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.indexOf('\t') >= 0 && first.indexOf(',') < 0 ? '\t' : ',');
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
      if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(function (c) { return c.trim() !== ''; })) rows.push(row); row = []; }
      else cell += ch;
    }
    row.push(cell); if (row.some(function (c) { return c.trim() !== ''; })) rows.push(row);
    return rows.map(function (r) { return r.map(function (c) { return c.trim(); }); });
  }
  // "0.03015BTC" → {n: 0.03015, asset: 'BTC'} · "1,234.5" → {n: 1234.5, asset: ''}
  function amt(v) {
    var s = String(v == null ? '' : v).trim().replace(/\s+/g, '');
    var m = s.match(/^([-+]?(?:\d[\d,]*)?\.?\d+(?:[eE][-+]?\d+)?)([A-Za-z][A-Za-z0-9]*)?$/);
    if (!m) { var n2 = parseFloat(s.replace(/,/g, '')); return { n: isFinite(n2) ? n2 : NaN, asset: '' }; }
    return { n: parseFloat(m[1].replace(/,/g, '')), asset: (m[2] || '').toUpperCase() };
  }
  function splitPair(p, base) {
    p = String(p || '').toUpperCase().replace(/\s+/g, '');
    var m = p.split(/[_\/\-:]/);
    if (m.length === 2 && m[0] && m[1]) return { base: m[0], quote: m[1] };
    if (base && p.indexOf(base) === 0 && p.length > base.length) return { base: base, quote: p.slice(base.length) };
    for (var i = 0; i < QUOTES.length; i++) { var qq = QUOTES[i]; if (p.length > qq.length && p.slice(-qq.length) === qq) return { base: p.slice(0, -qq.length), quote: qq }; }
    return { base: base || p, quote: '' };
  }
  // Time zone of the file's times: "Date(UTC)" / "Time(UTC+8)" in the header, or "…UTC3…" in a Binance file name; null = this device's time
  function tzOf(headers, fileName) {
    var h = (headers || []).join(' '), m = h.match(/UTC\s*([+-]\s*\d{1,2})?(?::?(\d{2}))?/i);
    if (m) return (m[1] ? parseInt(m[1].replace(/\s/g, ''), 10) : 0) * 60 + (m[2] ? (m[1] && m[1].indexOf('-') >= 0 ? -1 : 1) * parseInt(m[2], 10) : 0);
    var f = String(fileName || '').match(/UTC([+-]?\d{1,2})(?!\d)/i);
    return f ? parseInt(f[1], 10) * 60 : null;
  }
  function toIso(v, tz) {
    var s = String(v || '').trim(), m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) { m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/); if (m) m = [m[0], m[3], m[1], m[2], m[4], m[5], m[6]]; }   // MM/DD/YYYY
    if (m) {
      var y = +m[1], mo = +m[2] - 1, d = +m[3], hh = +m[4], mi = +m[5], ss = +(m[6] || 0);
      var t = tz == null ? new Date(y, mo, d, hh, mi, ss).getTime() : Date.UTC(y, mo, d, hh, mi, ss) - tz * 60e3;
      return isFinite(t) ? new Date(t).toISOString() : null;
    }
    if (/^\d{10,13}$/.test(s)) { var n = +s; return new Date(s.length === 10 ? n * 1000 : n).toISOString(); }
    var p = Date.parse(s); return isFinite(p) ? new Date(p).toISOString() : null;
  }

  // ── Layouts: which column is which ──
  var FIELDS = {
    trade: [
      { k: 'time', label: 'Date & time', req: true, names: ['time', 'date(utc)', 'date', 'trade time', 'create time', 'created at', 'datetime', 'timestamp', 'filled time', 'order time'] },
      { k: 'pair', label: 'Pair / market', req: true, names: ['pair', 'market', 'symbol', 'trading pair', 'currency pair', 'instrument'] },
      { k: 'side', label: 'Buy / Sell', req: true, names: ['side', 'direction', 'trade type', 'type', 'buy/sell', 'order side'] },
      { k: 'price', label: 'Price', req: false, names: ['price', 'avg price', 'average price', 'deal price', 'filled price', 'avg. price', 'execution price'] },
      { k: 'qty', label: 'Amount of the coin', req: true, names: ['executed', 'filled', 'quantity', 'qty', 'deal amount', 'filled amount', 'executed amount', 'size', 'amount'] },
      { k: 'total', label: 'Total (USDT)', req: false, names: ['total', 'turnover', 'deal total', 'value', 'volume', 'filled total', 'executed value', 'amount'] },
      { k: 'fee', label: 'Fee', req: false, names: ['fee', 'commission', 'trading fee', 'fees'] },
      { k: 'feeAsset', label: 'Fee coin', req: false, names: ['fee coin', 'fee currency', 'fee asset', 'commission asset', 'fee unit', 'fee ccy'] },
      { k: 'order', label: 'Order no.', req: false, names: ['order no', 'order no.', 'order id', 'orderid', 'order number', 'trade id', 'id'] },
    ],
    withdraw: [
      { k: 'time', label: 'Date & time', req: true, names: ['time', 'date(utc)', 'date', 'create time', 'created at', 'datetime', 'timestamp', 'completed time'] },
      { k: 'coin', label: 'Coin', req: true, names: ['coin', 'currency', 'asset', 'token', 'crypto'] },
      { k: 'amount', label: 'Amount', req: true, names: ['amount', 'quantity', 'qty', 'withdrawal amount', 'size'] },
      { k: 'fee', label: 'Network fee', req: false, names: ['fee', 'network fee', 'transaction fee', 'withdrawal fee', 'fees'] },
      { k: 'address', label: 'Address', req: true, names: ['address', 'to address', 'destination', 'withdrawal address', 'wallet address', 'to'] },
      { k: 'network', label: 'Network', req: false, names: ['network', 'chain', 'blockchain'] },
      { k: 'txid', label: 'Transaction id', req: false, names: ['txid', 'tx id', 'transaction id', 'txhash', 'tx hash', 'hash'] },
      { k: 'status', label: 'Status', req: false, names: ['status', 'state'] },
    ],
  };
  function kindOf(headers) {
    var h = headers.map(low), has = function (n) { return h.indexOf(n) >= 0; };
    if (h.some(function (x) { return /address|destination/.test(x); }) && h.some(function (x) { return /^(coin|currency|asset|token)$/.test(x); })) return 'withdraw';
    if (h.some(function (x) { return /side|direction|buy\/sell|trade type/.test(x); }) || (has('type') && h.some(function (x) { return /pair|market|symbol/.test(x); }))) return 'trade';
    return null;
  }
  function sig(headers) { return headers.map(low).join('|'); }
  // Guess every column from its name; {map, missing} — Binance's layout matches without asking
  function guess(headers, kind) {
    var h = headers.map(low), used = {}, map = {}, missing = [];
    (FIELDS[kind] || []).forEach(function (f) {
      var at = -1;
      for (var i = 0; i < f.names.length && at < 0; i++) { var j = h.indexOf(f.names[i]); if (j >= 0 && !used[j]) at = j; }
      if (at < 0) for (var k = 0; k < h.length && at < 0; k++) if (!used[k] && f.names.some(function (n) { return n.length > 3 && h[k].indexOf(n) === 0; })) at = k;
      if (at >= 0) { map[f.k] = at; used[at] = 1; } else if (f.req) missing.push(f.k);
    });
    return { map: map, missing: missing };
  }
  function exchangeOf(headers, fileName) {
    var h = sig(headers), f = String(fileName || '');
    if (/binance/i.test(f) || h === 'order no|time|pair|side|price|executed|amount|fee|aor conversion pair|aor conversion rate' || h === 'time|coin|network|amount|fee|address|txid|status' ||
      /^date\(utc\)\|pair\|side\|price\|executed\|amount\|fee/.test(h)) return 'Binance';
    if (/gate/i.test(f)) return 'Gate.io';
    var m = f.match(/^([A-Za-z]+)[-_ ]/); return m && !/^(export|history|trade|withdraw|spot|order|my)$/i.test(m[1]) ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : '';
  }

  // A file → { kind, exchange, headers, map, missing, records, rows }
  function readFile(text, fileName, savedMaps) {
    var rows = parseCsv(text); if (!rows.length) return { error: 'The file is empty.' };
    var hi = 0; while (hi < Math.min(rows.length, 8) && !kindOf(rows[hi])) hi++;   // a title line above the header
    if (hi >= Math.min(rows.length, 8)) hi = 0;
    var headers = rows[hi], kind = kindOf(headers), body = rows.slice(hi + 1);
    var saved = savedMaps && savedMaps[sig(headers)];
    if (saved && saved.kind) kind = saved.kind;
    var g = kind ? guess(headers, kind) : { map: {}, missing: [] };
    if (saved && saved.map) { g.map = saved.map; g.missing = (FIELDS[kind] || []).filter(function (f) { return f.req && saved.map[f.k] == null; }).map(function (f) { return f.k; }); }
    var out = { name: fileName || 'file.csv', kind: kind, exchange: exchangeOf(headers, fileName), headers: headers, body: body, map: g.map, missing: kind ? g.missing : ['kind'], tz: tzOf(headers, fileName) };
    out.records = out.missing.length ? [] : records(out);
    return out;
  }
  function records(f) {
    var m = f.map, col = function (r, k) { return m[k] == null ? '' : (r[m[k]] == null ? '' : r[m[k]]); }, src = (f.exchange || 'csv').toLowerCase().replace(/[^a-z0-9]/g, '');
    var out = [];
    f.body.forEach(function (r, i) {
      var t = toIso(col(r, 'time'), f.tz); if (!t) return;
      if (f.kind === 'trade') {
        var q = amt(col(r, 'qty')), tot = amt(col(r, 'total')), pr = amt(col(r, 'price')), fe = amt(col(r, 'fee'));
        var sideRaw = low(col(r, 'side')), side = /^(buy|b|bid|long)/.test(sideRaw) || sideRaw === '买入' ? 'buy' : /^(sell|s|ask|short)/.test(sideRaw) || sideRaw === '卖出' ? 'sell' : '';
        var pp = splitPair(col(r, 'pair'), q.asset);
        if (!(q.n > 0) || !side) return;
        var total = tot.n > 0 && (m.total !== m.qty) ? tot.n : (pr.n > 0 ? pr.n * q.n : NaN);
        out.push({ src: src, row: i, t: t, order: col(r, 'order'), side: side, base: (q.asset || pp.base).toUpperCase(), quote: (tot.asset || pp.quote).toUpperCase(),
          qty: q.n, total: total, fee: fe.n > 0 ? fe.n : 0, feeAsset: (fe.asset || String(col(r, 'feeAsset')).toUpperCase()).replace(/[^A-Z0-9]/g, '') });
      } else if (f.kind === 'withdraw') {
        var a = amt(col(r, 'amount')), w = amt(col(r, 'fee')), st = low(col(r, 'status'));
        if (!(a.n > 0)) return;
        out.push({ src: src, row: i, t: t, coin: (String(col(r, 'coin')) || a.asset).toUpperCase().replace(/[^A-Z0-9._-]/g, ''), amount: a.n, fee: w.n > 0 ? w.n : 0,
          address: String(col(r, 'address')), network: String(col(r, 'network')), txid: String(col(r, 'txid')),
          ok: !st || /complete|success|succeed|done|finish|confirmed|成功/.test(st) });
      }
    });
    return out;
  }

  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  function day(t) {   // the calendar day where you are (the file's 00:06 at UTC+3 is still that day for you)
    var d = new Date(t); if (isNaN(d)) return String(t || '').slice(0, 10);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function near(a, b, tol) { return Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b), 1e-12); }
  function shortAddr(a) { a = String(a || ''); return a.length > 14 ? a.slice(0, 6) + '…' + a.slice(-4) : a; }

  // Every file together → what would be added. ctx: { txs, held: {SYM:1}, prices: {SYM: usd}, mining, addr: {address: 'mine'|'out'}, from: 'YYYY-MM-DD' }
  function plan(files, ctx) {
    ctx = ctx || {};
    var fills = [], wds = [], items = [];
    (files || []).forEach(function (f) { (f.records || []).forEach(function (r) { (f.kind === 'trade' ? fills : wds).push(r); }); });
    // one order → one transaction
    var groups = {}, order = [];
    fills.forEach(function (r) {
      var k = r.order ? r.src + '|' + r.order + '|' + r.side + '|' + r.base : r.src + '|' + r.t + '|' + r.base + r.quote + '|' + r.side;
      var g = groups[k];
      if (!g) { g = groups[k] = { k: k, src: r.src, order: r.order, side: r.side, base: r.base, quote: r.quote, t: r.t, qty: 0, total: 0, fees: {}, n: 0, badTotal: false }; order.push(g); }
      g.qty += r.qty; if (isFinite(r.total)) g.total += r.total; else g.badTotal = true;
      if (r.t < g.t) g.t = r.t;
      if (r.fee > 0) g.fees[r.feeAsset || ''] = (g.fees[r.feeAsset || ''] || 0) + r.fee;
      g.n++;
    });
    order.forEach(function (g) {
      var it = { key: g.src + '_' + (g.order ? 'o' + g.order : 'h' + hash(g.k)) + '_' + g.side[0], type: g.side, sym: g.base, date: g.t, qty: g.qty, fills: g.n,
        price: g.qty > 0 ? g.total / g.qty : 0, fee: 0, tradeFee: 0, netFee: 0, feeUsd: 0, notes: [], src: g.src, order: g.order };
      if (!isStable(g.quote)) { it.status = 'skip'; it.reason = g.quote ? 'Paid in ' + g.quote + ', not dollars' : 'Unknown pair'; items.push(it); return; }
      if (isStable(g.base)) { it.status = 'skip'; it.reason = 'Stablecoin swap'; items.push(it); return; }
      if (g.badTotal || !(it.price > 0)) { it.status = 'skip'; it.reason = 'No price in the file'; items.push(it); return; }
      Object.keys(g.fees).forEach(function (a) {
        var n = g.fees[a];
        if (a === g.base || (!a && g.side === 'buy')) { if (g.side === 'buy') it.tradeFee += n; else it.feeUsd += n * it.price; }
        else if (!a || a === g.quote || isStable(a)) it.feeUsd += n;
        else { var px = +(ctx.prices || {})[a] || 0; if (px > 0) { it.feeUsd += n * px; it.notes.push('fee paid in ' + a + ' (' + (+n.toPrecision(6)) + ')'); } else it.notes.push('fee ' + (+n.toPrecision(6)) + ' ' + a + ' not counted (no price)'); }
      });
      it.fee = it.tradeFee;
      if (g.side === 'sell' && g.base === 'BTC' && ctx.mining) { it.status = 'skip'; it.reason = 'Mining BTC — not from your wallet'; }
      items.push(it);
    });
    // withdrawals
    var addrs = {}, wItems = [];
    wds.forEach(function (w) {
      var a = addrs[w.address] || (addrs[w.address] = { address: w.address, short: shortAddr(w.address), coins: {}, n: 0, stableOnly: true });
      a.coins[w.coin] = 1; a.n++; if (!isStable(w.coin)) a.stableOnly = false;
    });
    Object.keys(addrs).forEach(function (k) { var a = addrs[k], set = (ctx.addr || {})[k]; a.kind = set === 'mine' || set === 'out' ? set : (a.stableOnly ? 'out' : 'mine'); a.coins = Object.keys(a.coins); });
    wds.forEach(function (w) {
      var a = addrs[w.address], key = w.src + '_w' + (w.txid ? hash(w.txid) : hash(w.t + w.coin + w.amount));
      var base = { key: key, type: 'transfer_in', sym: w.coin, date: w.t, qty: 0, price: 0, fee: 0, feeUsd: 0, netFee: 0, notes: [], src: w.src, wd: w };
      if (!w.ok) { base.status = 'skip'; base.reason = 'Withdrawal not completed'; base.qty = w.amount; items.push(base); return; }
      if (a.kind === 'out' || isStable(w.coin)) { base.status = 'skip'; base.reason = 'Sent to ' + a.short + (a.kind === 'out' ? ' (another exchange / not your wallet)' : ' — stablecoin'); base.qty = w.amount; items.push(base); return; }
      wItems.push({ w: w, it: base });
    });
    // per coin, in time order: the network fee comes off the last buy; coins sent beyond what was bought → Transfer In
    var bySym = {};
    items.forEach(function (it) { if ((it.type === 'buy' || it.type === 'sell') && it.status !== 'skip') (bySym[it.sym] = bySym[it.sym] || []).push({ t: it.date, it: it }); });
    wItems.forEach(function (x) { (bySym[x.w.coin] = bySym[x.w.coin] || []).push({ t: x.w.t, w: x.w, wi: x.it }); });
    Object.keys(bySym).forEach(function (sym) {
      var ev = bySym[sym].sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : (a.w ? 1 : -1); });
      var win = 0, last = null;
      ev.forEach(function (e) {
        if (e.it) { if (e.it.type === 'buy') { win += e.it.qty - e.it.tradeFee; last = e.it; } else win = Math.max(0, win - e.it.qty); return; }
        var w = e.w, sent = w.amount + w.fee, attached = false;
        if (last && w.fee > 0 && last.qty - last.fee > w.fee) { last.netFee += w.fee; last.fee += w.fee; attached = true; last.toWallet = true; }
        var extra = sent - Math.max(0, win);
        win = Math.max(0, win - sent);
        if (extra > Math.max(1e-10, sent * 1e-4)) {
          var it = e.wi; it.qty = extra; it.fee = attached ? 0 : Math.min(w.fee, extra * 0.999);
          it.extra = true;
          if (sym === 'BTC' && ctx.mining) { it.reason = 'Mined BTC sent to your wallet (cost $0)'; it.mined = true; }
          else { it.reason = 'More ' + sym + ' sent to your wallet than these files bought — probably bought earlier (cost $0 if you tick it)'; it.status = 'check'; }
          items.push(it);
        }
      });
    });
    items.forEach(function (it) {
      if (it.type === 'buy' && it.toWallet) it.notes.unshift('network fee ' + (+it.netFee.toPrecision(6)) + ' ' + it.sym + ' to your wallet');
    });
    // already there? (an earlier import, or your own entry: same coin & type, ±2 days, same amount — as bought or as arrived — or same dollars)
    var mine = (ctx.txs || []).filter(function (t) { return t && t.sym && !(String(t.id || '').indexOf('imp_') === 0); }), used = {};
    var ids = {}; (ctx.txs || []).forEach(function (t) { if (t && t.id) ids[t.id] = 1; });
    var newest = '';
    mine.forEach(function (t) { if ((t.type === 'buy' || t.type === 'sell' || t.type === 'transfer_in') && t.date > newest) newest = t.date; });
    var from = ctx.from != null ? ctx.from : day(newest);
    items.forEach(function (it) {
      if (it.status === 'skip') return;
      if (ids['imp_' + it.key.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120)]) { it.status = 'dupe'; it.reason = 'Already imported'; return; }
      var tt = Date.parse(it.date), usd = it.qty * it.price;
      var qs = [it.qty, it.qty - it.tradeFee, it.qty - it.fee];
      for (var i = 0; i < mine.length; i++) {
        var e = mine[i]; if (used[i] || e.sym !== it.sym) continue;
        var okType = e.type === it.type || (it.type === 'transfer_in' && e.type === 'buy');
        if (!okType || Math.abs((Date.parse(e.date) || 0) - tt) > 2.5 * 864e5) continue;
        var eq = [+e.qty || 0, (+e.qty || 0) - (+e.fee || 0)], eu = (+e.qty || 0) * (+e.price || 0);
        var hit = qs.some(function (a) { return eq.some(function (b) { return b > 0 && near(a, b, 0.01); }); }) || (usd > 0 && eu > 0 && near(usd, eu, 0.01));
        if (hit) { used[i] = 1; it.status = 'dupe'; it.reason = 'Already in your portfolio (' + day(e.date) + ', ' + (+(+e.qty).toPrecision(8)) + ' ' + e.sym + ')'; return; }
      }
      if (from && day(it.date) < from) { it.status = 'before'; it.reason = 'Before ' + from + ' (your newest entry)'; return; }
      if (!it.status) it.status = 'new';
    });
    items.forEach(function (it) { it.on = it.status === 'new'; });
    items.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    var held = ctx.held || {};
    return { items: items, addrs: Object.keys(addrs).map(function (k) { return addrs[k]; }), from: from, newest: day(newest),
      newCoins: function () { var s = {}; items.forEach(function (it) { if (it.on && !held[it.sym]) s[it.sym] = 1; }); return Object.keys(s).sort(); } };
  }
  // What gets saved for one ticked line
  function txOf(it) {
    var note = [(it.src === 'binance' ? 'Binance' : it.src ? it.src[0].toUpperCase() + it.src.slice(1) : 'Exchange') + ' import' + (it.order ? ' · order ' + it.order : ''),
      it.type === 'transfer_in' ? (it.mined ? 'mined BTC to your wallet' : 'sent to your wallet') : ''].concat(it.notes || []).filter(Boolean).join(' · ');
    return { key: it.key, sym: it.sym, type: it.type, qty: +it.qty.toPrecision(12), price: it.type === 'transfer_in' ? 0 : +it.price.toPrecision(12), date: it.date,
      fee: it.fee > 0 ? +it.fee.toPrecision(12) : 0, feeUsd: it.feeUsd > 0 ? +it.feeUsd.toFixed(6) : 0, netFee: it.netFee > 0 ? +it.netFee.toPrecision(12) : 0, note: note.slice(0, 480) };
  }
  var core = { parseCsv: parseCsv, amt: amt, splitPair: splitPair, tzOf: tzOf, toIso: toIso, kindOf: kindOf, guess: guess, readFile: readFile, records: records, plan: plan, txOf: txOf, FIELDS: FIELDS, sig: sig, isStable: isStable };
  if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }

  // ───────────────────────────── the screen ─────────────────────────────
  var doc = root.document, $ = function (id) { return doc.getElementById(id); };
  var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var IC = function (n) { return root.SamsamUI ? SamsamUI.ic(n) : ''; };
  var K = { addr: 'samsam_imp_addr', mining: 'samsam_imp_mining', maps: 'samsam_imp_maps' };
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (_) { return d; } }
  function keep(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  var files = [], P = null, view = 'new', from = null, saving = false;

  var CSS =
    '.imp-bd{position:fixed;inset:0;z-index:100045;background:rgba(2,6,23,.6);display:none;align-items:flex-end;justify-content:center}.imp-bd.show{display:flex}' +
    'body.imp-open #samsamSyncPill,body.imp-open #samsamSyncMenu{display:none!important}' +
    '.imp-m{width:100%;max-width:680px;max-height:94vh;overflow-y:auto;box-sizing:border-box;background:var(--bg-card,#1e293b);color:#f1f5f9;border:1px solid var(--border-card,#334155);border-radius:18px 18px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));font-family:inherit;text-align:left}' +
    '[data-theme="light"] .imp-m{background:#fff;color:#0f172a;border-color:#e2e8f0}' +
    '@media (min-width:601px){.imp-bd{align-items:center}.imp-m{border-radius:16px}}' +
    '.imp-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}.imp-head h3{margin:0;font-size:1.05rem;display:flex;align-items:center;gap:8px}' +
    '.imp-x{background:none;border:none;color:inherit;font-size:1.5rem;line-height:1;opacity:.7;cursor:pointer;padding:2px 6px}' +
    '.imp-sub{font-size:.8rem;color:#94a3b8;margin:0 0 12px;line-height:1.45}' +
    '.imp-drop{display:flex;align-items:center;justify-content:center;gap:8px;position:relative;border:1.5px dashed #475569;border-radius:12px;padding:14px;font-weight:700;font-size:.88rem;cursor:pointer}' +
    '[data-theme="light"] .imp-drop{border-color:#cbd5e1}.imp-drop input{position:absolute;inset:0;opacity:0;cursor:pointer}' +
    '.imp-files{margin:10px 0 4px;display:grid;gap:6px}.imp-file{display:flex;align-items:center;gap:8px;font-size:.8rem;padding:8px 10px;border-radius:10px;background:rgba(148,163,184,.1)}' +
    '.imp-file b{font-weight:700}.imp-file small{color:#94a3b8;margin-left:auto;white-space:nowrap}.imp-file button{background:none;border:none;color:inherit;opacity:.6;cursor:pointer;font-size:1.1rem;padding:0 2px}' +
    '.imp-file.bad{box-shadow:inset 0 0 0 1px #f59e0b}' +
    '.imp-map{margin:4px 0 8px;padding:10px;border-radius:10px;background:rgba(245,158,11,.08);font-size:.78rem}.imp-map p{margin:0 0 8px}' +
    '.imp-map-g{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px}.imp-map label{display:flex;flex-direction:column;gap:3px;font-weight:600}' +
    '.imp-map select,.imp-opts input[type=date]{height:34px;border-radius:8px;border:1px solid #334155;background:transparent;color:inherit;font:inherit;padding:0 8px}' +
    '[data-theme="light"] .imp-map select,[data-theme="light"] .imp-opts input[type=date]{border-color:#cbd5e1}' +
    '.imp-map select option{background:var(--bg-card,#1e293b);color:#f1f5f9}[data-theme="light"] .imp-map select option{background:#fff;color:#0f172a}' +
    '.imp-sec{margin:14px 0 6px;font-size:.74rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#94a3b8}' +
    '.imp-opts{display:grid;gap:8px;font-size:.82rem}.imp-opt{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.imp-opt input[type=checkbox]{width:18px;height:18px;accent-color:#16a34a}' +
    '.imp-addr{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.8rem;padding:7px 0;border-top:1px solid rgba(148,163,184,.15)}.imp-addr:first-child{border-top:none}' +
    '.imp-addr code{font-size:.78rem}.imp-addr small{color:#94a3b8;flex:1 1 140px;min-width:0}' +
    '.imp-seg{display:inline-flex;gap:3px;background:rgba(148,163,184,.12);padding:3px;border-radius:9px}.imp-seg button{border:none;background:transparent;color:inherit;font:inherit;font-size:.74rem;font-weight:700;padding:5px 9px;border-radius:7px;cursor:pointer;opacity:.7;white-space:nowrap}' +
    '.imp-seg button[aria-checked="true"]{opacity:1;background:var(--bg-card-secondary,#334155);box-shadow:inset 0 0 0 1px #16a34a}[data-theme="light"] .imp-seg button[aria-checked="true"]{background:#fff}' +
    '.imp-sum{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 8px}.imp-sum button{border:1px solid rgba(148,163,184,.3);background:transparent;color:inherit;font:inherit;font-size:.76rem;font-weight:700;padding:5px 10px;border-radius:999px;cursor:pointer}' +
    '.imp-sum button[aria-pressed="true"]{background:rgba(22,163,74,.15);border-color:#16a34a}' +
    '.imp-list{display:grid;gap:0;border-radius:12px;overflow:hidden;border:1px solid rgba(148,163,184,.18)}' +
    '.imp-row{display:grid;grid-template-columns:auto 1fr auto;gap:4px 10px;align-items:center;padding:9px 10px;border-top:1px solid rgba(148,163,184,.12);font-size:.8rem}.imp-row:first-child{border-top:none}' +
    '.imp-row input{width:18px;height:18px;accent-color:#16a34a}.imp-row .imp-t{display:flex;align-items:center;gap:6px;font-weight:700;min-width:0;flex-wrap:wrap}' +
    '.imp-row .imp-v{text-align:right;font-weight:700;white-space:nowrap}.imp-row .imp-n{grid-column:2 / -1;color:#94a3b8;font-size:.74rem;line-height:1.35}' +
    '.imp-row.off{opacity:.62}.imp-dot{width:8px;height:8px;border-radius:50%;display:inline-block}.imp-buy{background:#22c55e}.imp-sell{background:#ef4444}.imp-in{background:#3b82f6}.imp-skip{background:#94a3b8}' +
    '.imp-new{margin:10px 0 0;font-size:.8rem;padding:9px 10px;border-radius:10px;background:rgba(59,130,246,.1)}' +
    '.imp-foot{position:sticky;bottom:calc(-16px - env(safe-area-inset-bottom,0px));margin:12px -16px calc(-16px - env(safe-area-inset-bottom,0px));padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));background:inherit;border-top:1px solid rgba(148,163,184,.18)}' +
    '.imp-save{width:100%;height:48px;border:none;border-radius:12px;background:#16a34a;color:#fff;font:inherit;font-weight:800;font-size:.95rem;cursor:pointer}.imp-save:disabled{opacity:.5;cursor:default}' +
    '.imp-msg{font-size:.8rem;margin-top:8px;text-align:center}.imp-msg.err{color:#ef4444}.imp-empty{padding:16px;text-align:center;color:#94a3b8;font-size:.8rem}';

  var HTML =
    '<div class="imp-bd" id="impBd" onclick="if(event.target===this)SamsamImport.close()"><div class="imp-m" id="impModal" role="dialog" aria-modal="true" aria-labelledby="impTitle">' +
      '<div class="imp-head"><h3 id="impTitle">' + '<span id="impIc"></span>Import from an exchange</h3><button type="button" class="imp-x" onclick="SamsamImport.close()" aria-label="Close">×</button></div>' +
      '<p class="imp-sub">Add your exchange\'s <b>trade history</b> and <b>withdraw history</b> (CSV). Nothing is saved until you tap Add — you see every line first, and anything already in your portfolio is left out.</p>' +
      '<label class="imp-drop"><span id="impUpIc"></span><span>Choose CSV files</span><input type="file" id="impFile" accept=".csv,text/csv" multiple></label>' +
      '<div class="imp-files" id="impFiles"></div><div id="impMaps"></div>' +
      '<div id="impBody"></div>' +
      '<div class="imp-foot" id="impFoot" hidden><button type="button" class="imp-save" id="impSave">Add</button><div class="imp-msg" id="impMsg" role="status"></div></div>' +
    '</div></div>';

  function mount() {
    if (!$('impCss')) { var s = doc.createElement('style'); s.id = 'impCss'; s.textContent = CSS; doc.head.appendChild(s); }
    if (!$('impBd')) {
      doc.body.insertAdjacentHTML('beforeend', HTML);
      $('impIc').innerHTML = IC('upload'); $('impUpIc').innerHTML = IC('file');
      $('impFile').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
      $('impModal').addEventListener('click', onClick);
      $('impModal').addEventListener('change', onChange);
      $('impSave').addEventListener('click', save);
    }
  }
  function st() { return root.Samsam && Samsam.getState ? Samsam.getState() : null; }
  function open() {
    mount(); files = []; P = null; view = 'new'; from = null; saving = false;
    $('impFiles').innerHTML = ''; $('impMaps').innerHTML = ''; $('impBody').innerHTML = ''; $('impFoot').hidden = true; $('impMsg').textContent = '';
    $('impBd').classList.add('show'); doc.body.classList.add('imp-open');
  }
  function close() { var b = $('impBd'); if (b) b.classList.remove('show'); doc.body.classList.remove('imp-open'); }
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('impBd') && $('impBd').classList.contains('show')) close(); });

  function addFiles(list) {
    var arr = [].slice.call(list || []); if (!arr.length) return;
    Promise.all(arr.map(function (f) { return f.text().then(function (t) { return { name: f.name, text: t }; }); })).then(function (got) {
      got.forEach(function (g) {
        var r = readFile(g.text, g.name, load(K.maps, {}));
        files = files.filter(function (f) { return f.name !== g.name; }); r.text = g.text; files.push(r);
      });
      refresh();
    });
  }
  function fileLine(f, i) {
    var what = f.error ? f.error : !f.kind ? 'Not a trade or withdraw history' : (f.exchange ? f.exchange + ' · ' : '') + (f.kind === 'trade' ? 'Trades' : 'Withdrawals');
    var n = f.records ? f.records.length : 0;
    return '<div class="imp-file' + (f.missing && f.missing.length || f.error ? ' bad' : '') + '">' + IC('file') + '<span><b>' + E(f.name) + '</b><br>' + E(what) + '</span>' +
      '<small>' + (f.missing && f.missing.length ? 'choose columns ↓' : n + ' row' + (n === 1 ? '' : 's')) + '</small><button type="button" data-rm="' + i + '" aria-label="Remove ' + E(f.name) + '">×</button></div>';
  }
  function mapBox(f, i) {
    var opts = function (sel) { return '<option value="">—</option>' + f.headers.map(function (h, j) { return '<option value="' + j + '"' + (sel === j ? ' selected' : '') + '>' + E(h || 'column ' + (j + 1)) + '</option>'; }).join(''); };
    var kind = f.kind;
    return '<div class="imp-map" data-map="' + i + '"><p><b>' + E(f.name) + '</b> — which column is which? (asked once for this layout)</p>' +
      '<div class="imp-opt" style="margin-bottom:8px">This file is <span class="imp-seg" role="radiogroup"><button type="button" role="radio" data-kind="trade" aria-checked="' + (kind === 'trade') + '">Trade history</button><button type="button" role="radio" data-kind="withdraw" aria-checked="' + (kind === 'withdraw') + '">Withdraw history</button></span></div>' +
      (kind ? '<div class="imp-map-g">' + FIELDS[kind].map(function (fd) { return '<label>' + E(fd.label) + (fd.req ? ' *' : '') + '<select data-f="' + fd.k + '">' + opts(f.map[fd.k]) + '</select></label>'; }).join('') + '</div>' : '') +
      '</div>';
  }
  function ctx() {
    var s = st() || { transactions: [], portfolio: [], coins: [] }, held = {}, prices = {};
    (s.coins || []).forEach(function (c) { if (!c.removed) held[c.sym] = 1; });
    (s.portfolio || []).forEach(function (c) { held[c.sym] = 1; if (c.currentPrice > 0) prices[c.sym] = c.currentPrice; });
    if (!prices.BNB) prices.BNB = 0;
    return { txs: s.transactions || [], held: held, prices: prices, mining: load(K.mining, true) !== false, addr: load(K.addr, {}), from: from };
  }
  function refresh() {
    $('impFiles').innerHTML = files.map(fileLine).join('');
    $('impMaps').innerHTML = files.map(function (f, i) { return f.missing && f.missing.length && !f.error ? mapBox(f, i) : ''; }).join('');
    var ok = files.filter(function (f) { return f.records && f.records.length; });
    if (!ok.length) { P = null; $('impBody').innerHTML = files.length ? '<div class="imp-empty">Nothing to read yet.</div>' : ''; $('impFoot').hidden = true; return; }
    var c = ctx(); P = plan(ok, c); if (from == null) from = P.from;
    draw();
  }
  function counts() {
    var n = { new: 0, dupe: 0, before: 0, skip: 0, check: 0, all: P.items.length, on: 0 };
    P.items.forEach(function (it) { n[it.status] = (n[it.status] || 0) + 1; if (it.on) n.on++; });
    return n;
  }
  function q(v) { return root.SamsamFmt && SamsamFmt.qty ? SamsamFmt.qty(v) : String(+(+v).toPrecision(8)); }
  function usd(v) { return root.SamsamFmt ? SamsamFmt.usd(v) : '$' + (+v).toFixed(2); }
  function row(it, i) {
    var cls = it.status === 'skip' ? 'imp-skip' : it.type === 'buy' ? 'imp-buy' : it.type === 'sell' ? 'imp-sell' : 'imp-in';
    var lbl = it.type === 'buy' ? 'Buy' : it.type === 'sell' ? 'Sell' : 'Transfer In';
    var arrive = it.type === 'buy' ? it.qty - it.fee : it.type === 'transfer_in' ? it.qty - it.fee : it.qty;
    var val = it.type === 'transfer_in' ? (it.status === 'skip' ? '' : '$0 cost') : usd(it.qty * it.price + (it.type === 'buy' ? it.feeUsd : -it.feeUsd));
    var d = new Date(it.date), when = isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    var note = [when, it.type !== 'transfer_in' && it.price > 0 ? '@ ' + (root.SamsamFmt ? SamsamFmt.price(it.price) : it.price) : '', it.fills > 1 ? it.fills + ' fills' : '',
      it.type === 'buy' && it.fee > 0 ? 'arrives ' + q(arrive) + ' ' + it.sym + ' (fees ' + q(it.fee) + ')' : '', it.feeUsd > 0 ? 'fee ' + usd(it.feeUsd) : '']
      .concat(it.type === 'buy' ? (it.notes || []).filter(function (n) { return n.indexOf('network fee') !== 0; }) : it.notes || []).concat(it.reason ? [it.reason] : []).filter(Boolean).join(' · ');
    return '<label class="imp-row' + (it.on ? '' : ' off') + '"><input type="checkbox" data-i="' + i + '"' + (it.on ? ' checked' : '') + (it.status === 'skip' ? ' disabled' : '') + ' aria-label="' + E(lbl + ' ' + it.sym) + '">' +
      '<span class="imp-t"><span class="imp-dot ' + cls + '"></span>' + lbl + ' ' + E(q(it.type === 'transfer_in' ? arrive : it.qty)) + ' ' + E(it.sym) + '</span><span class="imp-v">' + E(val) + '</span>' +
      '<span class="imp-n">' + E(note) + '</span></label>';
  }
  function draw() {
    var n = counts(), mining = load(K.mining, true) !== false;
    var hasBtcSell = P.items.some(function (it) { return it.sym === 'BTC' && it.type === 'sell'; });
    var opts = '<div class="imp-sec">Options</div><div class="imp-opts">' +
      (hasBtcSell ? '<label class="imp-opt" style="flex-wrap:nowrap;align-items:flex-start"><input type="checkbox" id="impMining"' + (mining ? ' checked' : '') + ' style="flex:none;margin-top:1px"><span style="flex:1;min-width:0">BTC sold on the exchange is mining income (not from your wallet)</span></label>' : '') +
      '<label class="imp-opt">Add only from <input type="date" id="impFrom" value="' + E(from || '') + '"><small style="color:#94a3b8">' + (P.newest ? 'your newest entry: ' + E(P.newest) : 'empty = everything') + '</small></label></div>';
    var addr = P.addrs.length ? '<div class="imp-sec">Where did your withdrawals go?</div><div>' + P.addrs.map(function (a) {
      return '<div class="imp-addr"><code>' + E(a.short) + '</code><small>' + E(a.coins.slice(0, 8).join(', ') + (a.coins.length > 8 ? ' +' + (a.coins.length - 8) : '')) + ' · ' + a.n + '×</small>' +
        '<span class="imp-seg" role="radiogroup" aria-label="' + E(a.short) + '"><button type="button" role="radio" data-addr="' + E(a.address) + '" data-k="mine" aria-checked="' + (a.kind === 'mine') + '">My wallet</button><button type="button" role="radio" data-addr="' + E(a.address) + '" data-k="out" aria-checked="' + (a.kind === 'out') + '">Exchange / other</button></span></div>';
    }).join('') + '</div>' : '';
    var tabs = [['new', 'To add', n.on], ['dupe', 'Already there', n.dupe], ['before', 'Before date', n.before], ['check', 'Check', n.check], ['skip', 'Skipped', n.skip], ['all', 'All', n.all]]
      .filter(function (t) { return t[0] === 'new' || t[0] === 'all' || t[2] > 0; });
    var shown = P.items.map(function (it, i) { return [it, i]; }).filter(function (x) { var it = x[0]; return view === 'all' || (view === 'new' ? it.on : it.status === view); });
    var nc = P.newCoins();
    $('impBody').innerHTML = opts + addr + '<div class="imp-sec">Preview</div>' +
      '<div class="imp-sum" role="group" aria-label="Show">' + tabs.map(function (t) { return '<button type="button" data-view="' + t[0] + '" aria-pressed="' + (view === t[0]) + '">' + t[1] + ' · ' + t[2] + '</button>'; }).join('') + '</div>' +
      '<div class="imp-list">' + (shown.length ? shown.map(function (x) { return row(x[0], x[1]); }).join('') : '<div class="imp-empty">Nothing here.</div>') + '</div>' +
      (nc.length ? '<div class="imp-new">' + IC('plus') + 'New coins added to your portfolio: <b>' + E(nc.join(', ')) + '</b></div>' : '');
    $('impFoot').hidden = false;
    $('impSave').disabled = !n.on || saving;
    $('impSave').textContent = n.on ? 'Add ' + n.on + ' transaction' + (n.on === 1 ? '' : 's') : 'Nothing ticked';
  }
  function onClick(e) {
    var t = e.target.closest && e.target.closest('button'); if (!t) return;
    if (t.dataset.rm != null) { files.splice(+t.dataset.rm, 1); from = null; refresh(); return; }
    if (t.dataset.view) { view = t.dataset.view; draw(); return; }
    if (t.dataset.addr != null) { var a = load(K.addr, {}); a[t.dataset.addr] = t.dataset.k; keep(K.addr, a); refresh(); return; }
    if (t.dataset.kind) {
      var box = t.closest('[data-map]'), f = files[+box.dataset.map]; f.kind = t.dataset.kind; var g = guess(f.headers, f.kind); f.map = g.map; f.missing = g.missing; refresh(); return;
    }
  }
  function onChange(e) {
    var el = e.target;
    if (el.dataset.i != null) { var it = P.items[+el.dataset.i]; it.on = el.checked; draw(); return; }
    if (el.id === 'impMining') { keep(K.mining, el.checked); refresh(); return; }
    if (el.id === 'impFrom') { from = el.value || ''; refresh(); return; }
    if (el.dataset.f) {
      var box = el.closest('[data-map]'), f = files[+box.dataset.map];
      if (el.value === '') delete f.map[el.dataset.f]; else f.map[el.dataset.f] = +el.value;
      f.missing = FIELDS[f.kind].filter(function (fd) { return fd.req && f.map[fd.k] == null; }).map(function (fd) { return fd.k; });
      if (!f.missing.length) { var m = load(K.maps, {}); m[sig(f.headers)] = { kind: f.kind, map: f.map }; keep(K.maps, m); f.records = records(f); }
      refresh();
    }
  }
  // A new coin: its CoinGecko id, name and logo from the market lists the app already reads (no extra calls when it's there)
  function coinInfo(syms) {
    var M = root.SamsamMarket, T = root.SamsamTaxonomy;
    var lists = M ? [M.top ? M.top().catch(function () { return []; }) : Promise.resolve([]), M.top500 ? M.top500().then(function (j) { return j.top || []; }).catch(function () { return []; }) : Promise.resolve([])] : [];
    return Promise.all(lists).then(function (got) {
      var all = [].concat.apply([], got.map(function (g) { return Array.isArray(g) ? g : (g && (g.rows || g.top)) || []; }));
      return syms.map(function (sym) {
        var hit = all.filter(function (c) { return String(c.sym || c.symbol || '').toUpperCase() === sym; }).sort(function (a, b) { return (a.rank || 1e9) - (b.rank || 1e9); })[0];
        return { sym: sym, name: hit ? hit.name : sym, cgId: hit ? hit.id : null, logoUrl: hit ? (hit.img || hit.image || null) : null, cat: (T && T.defaultOf && T.defaultOf(sym)) || 'other' };
      });
    });
  }
  function save() {
    if (!P || saving) return;
    var list = P.items.filter(function (it) { return it.on; }); if (!list.length) return;
    saving = true; $('impSave').disabled = true; $('impMsg').className = 'imp-msg'; $('impMsg').textContent = 'Saving…';
    coinInfo(P.newCoins()).then(function (coins) { return Samsam.importTxs({ coins: coins, txs: list.map(txOf) }); }).then(function (n) {
      saving = false; $('impMsg').textContent = 'Added ' + n + ' transaction' + (n === 1 ? '' : 's') + '.';
      setTimeout(function () { close(); if (root.SamsamUI && SamsamUI.toast) SamsamUI.toast('Imported ' + n + ' transactions'); }, 900);
    }, function (err) { saving = false; $('impSave').disabled = false; $('impMsg').className = 'imp-msg err'; $('impMsg').textContent = 'Could not save: ' + (err && err.message || err); });
  }
  root.SamsamImport = { open: open, close: close, core: core };
})(typeof window !== 'undefined' ? window : globalThis);
