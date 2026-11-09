// samsam-wallets.js — Wallets & check: compare what your own wallets really hold (read from the blockchain) with the app.
//
// You save PUBLIC addresses only (Tangem or any wallet): Bitcoin, Solana, and one 0x… address for Ethereum and the chains
// that share it (BNB Chain, Arbitrum, Optimism, Base, Polygon, Avalanche). "Check now" reads the balances straight from
// public blockchain servers — no account, no key — and puts them next to the app's amount for every coin you hold:
//   · the same            → ✓
//   · the wallet has more → e.g. a staking reward arrived: add the difference as a Reward ($0 cost) in one tap, or as a Transfer In
//   · the app has more    → the rest is on an exchange, staked, or a sell / transfer wasn't recorded
// Solana tokens are listed by the blockchain itself (named by Jupiter's verified list). EVM token contracts (USDT on Ethereum…)
// come from CoinGecko, looked up once and remembered on this device for 90 days.
// Saved in the cloud (meta/info.wallets) and in your backups. A seed phrase or private key is never accepted.
(function () {
  'use strict';
  var doc = document, $ = function (id) { return doc.getElementById(id); };
  var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var IC = function (n, o) { return window.SamsamUI ? SamsamUI.ic(n, o) : ''; };
  function S() { return window.Samsam; }
  var CFG = { gap: 2500, retry: 30000, tries: 3 };   // CoinGecko's free limit: one coin lookup at a time, a pause between, wait when busy
  var CG = 'https://api.coingecko.com/api/v3/coins/';
  var JUP = 'https://lite-api.jup.ag/tokens/v2/search?query=';   // Jupiter: what a Solana token (mint) is — up to 100 at a time
  var BTC_API = ['https://mempool.space/api/address/', 'https://blockstream.info/api/address/'];
  var SOL_RPC = ['https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'];
  var SPL = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];
  // EVM chains: CoinGecko platform key · name · public server · the chain's own coin (CoinGecko id + symbols)
  var EVM = [
    { k: 'ethereum', name: 'Ethereum', rpc: 'https://ethereum-rpc.publicnode.com', id: 'ethereum', syms: ['ETH'] },
    { k: 'binance-smart-chain', name: 'BNB Chain', rpc: 'https://bsc-rpc.publicnode.com', id: 'binancecoin', syms: ['BNB'] },
    { k: 'arbitrum-one', name: 'Arbitrum', rpc: 'https://arbitrum-one-rpc.publicnode.com', id: 'ethereum', syms: ['ETH'] },
    { k: 'optimistic-ethereum', name: 'Optimism', rpc: 'https://optimism-rpc.publicnode.com', id: 'ethereum', syms: ['ETH'] },
    { k: 'base', name: 'Base', rpc: 'https://base-rpc.publicnode.com', id: 'ethereum', syms: ['ETH'] },
    { k: 'polygon-pos', name: 'Polygon', rpc: 'https://polygon-bor-rpc.publicnode.com', id: 'polygon-ecosystem-token', syms: ['POL', 'MATIC'] },
    { k: 'avalanche', name: 'Avalanche', rpc: 'https://avalanche-c-chain-rpc.publicnode.com', id: 'avalanche-2', syms: ['AVAX'] },
  ];
  var KIND = { btc: 'Bitcoin', sol: 'Solana', evm: 'Ethereum & EVM chains' };
  // coins that live on their own blockchain (not Bitcoin / Solana / EVM): never looked up, listed as "can't be checked"
  var OWN = /^(ATOM|DOT|KSM|NEAR|APT|SUI|ICP|HBAR|TON|VET|DOGE|TAO|FIL|XPL|SEI|KAVA|XRP|ADA|TRX|XLM|ALGO|LTC|BCH|ETC|XMR|EGLD|TIA|OSMO|XTZ|EOS|ZEC|DASH|KAS|STX|MINA|FLOW|ROSE|HYPE|THETA|IOTA|NEO|QNT|AR|CKB|ONE|ZIL|RUNE|CFX|BSV|XDC|KDA|ICX|WAVES|CSPR)$/;
  var K = { plat: 'samsam_platforms', last: 'samsam_wal_last' };
  function lsGet(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (_) { return d; } }
  function lsPut(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function short(a) { return a.length > 16 ? a.slice(0, 7) + '…' + a.slice(-5) : a; }
  function qf(n) { return parseFloat(Number(n).toPrecision(10)).toLocaleString('en-US', { maximumFractionDigits: 8 }); }
  function usd(n) { return window.SamsamFmt ? SamsamFmt.usd(n) : '$' + Number(n).toFixed(2); }

  // ── reading the blockchain ──
  function units(hex, dec) {   // 0x… integer → a number with `dec` decimals
    if (!hex || hex === '0x') return 0;
    var s = BigInt(hex).toString(); dec = dec || 0;
    if (!dec) return Number(s);
    s = s.padStart(dec + 1, '0');
    return Number(s.slice(0, -dec) + '.' + s.slice(-dec));
  }
  async function post(urls, body) {
    var last = null; urls = [].concat(urls);
    for (var i = 0; i < urls.length; i++) {
      try { var r = await fetch(urls[i], { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (r.ok) return await r.json(); last = new Error(r.status); }
      catch (e) { last = e; }
    }
    throw last || new Error('no answer');
  }
  async function batch(url, calls) {   // JSON-RPC, 20 at a time; a server without batches → one by one
    var out = new Array(calls.length), body = calls.map(function (c, i) { return { jsonrpc: '2.0', id: i + 1, method: c.method, params: c.params }; });
    for (var i = 0; i < body.length; i += 20) {
      var part = body.slice(i, i + 20), j = await post(url, part);
      if (!Array.isArray(j)) { for (var k = 0; k < part.length; k++) { var one = await post(url, part[k]); out[part[k].id - 1] = one && !one.error ? one.result : undefined; } continue; }
      j.forEach(function (r) { if (r && r.id) out[r.id - 1] = r.error ? undefined : r.result; });
    }
    return out;
  }
  async function btcWallet(w, held) {
    var c = held.filter(function (x) { return x.cgId === 'bitcoin' || x.sym === 'BTC'; })[0]; if (!c) return [];
    for (var i = 0; i < BTC_API.length; i++) {
      try {
        var r = await fetch(BTC_API[i] + encodeURIComponent(w.addr)); if (!r.ok) continue;
        var j = await r.json(), a = j.chain_stats || {}, m = j.mempool_stats || {};
        var sats = (a.funded_txo_sum || 0) - (a.spent_txo_sum || 0) + (m.funded_txo_sum || 0) - (m.spent_txo_sum || 0);
        return [{ sym: c.sym, q: sats / 1e8, where: 'Bitcoin' }];
      } catch (_) {}
    }
    throw new Error('Bitcoin');
  }
  // Solana: every token the wallet holds is listed by the blockchain itself, so nothing has to be looked up first.
  // A token is matched to your coin by its mint: CoinGecko's (if remembered) or Jupiter's verified token list.
  async function jupTokens(mints) {
    var out = [];
    for (var i = 0; i < mints.length; i += 100) {
      var r = await fetch(JUP + encodeURIComponent(mints.slice(i, i + 100).join(','))); if (!r.ok) throw new Error('Jupiter');
      var j = await r.json(); out = out.concat(Array.isArray(j) ? j : (j && j.tokens) || []);
    }
    return out;
  }
  async function solWallet(w, held, plat, info) {
    var out = [], call = function (m, p) { return post(SOL_RPC, { jsonrpc: '2.0', id: 1, method: m, params: p }); };
    var sol = held.filter(function (x) { return x.cgId === 'solana' || x.sym === 'SOL'; })[0];
    if (sol) { var b = await call('getBalance', [w.addr]); if (b.error) throw new Error('Solana'); out.push({ sym: sol.sym, q: ((b.result && b.result.value) || 0) / 1e9, where: 'Solana' }); }
    var accts = {};   // mint → amount
    for (var i = 0; i < SPL.length; i++) {
      var t = await call('getTokenAccountsByOwner', [w.addr, { programId: SPL[i] }, { encoding: 'jsonParsed' }]);
      if (t.error) throw new Error('Solana');
      ((t.result && t.result.value) || []).forEach(function (a) {
        var inf = a && a.account && a.account.data && a.account.data.parsed && a.account.data.parsed.info; if (!inf || !inf.mint) return;
        var ta = inf.tokenAmount || {}; accts[inf.mint] = (accts[inf.mint] || 0) + (+(ta.uiAmountString != null ? ta.uiAmountString : ta.uiAmount) || 0);
      });
    }
    var bySym = {}, mintSym = {};
    held.forEach(function (c) { bySym[c.sym] = c; var p = c.cgId && plat[c.cgId] && plat[c.cgId].p && plat[c.cgId].p.solana; if (p) mintSym[p[0]] = c.sym; });
    var unknown = Object.keys(accts).filter(function (m) { return !mintSym[m] && accts[m] > 0; });
    if (unknown.length) {
      try {
        (await jupTokens(unknown)).forEach(function (tk) {
          var m = tk && (tk.id || tk.address), sy = String((tk && tk.symbol) || '').toUpperCase();
          if (m && accts[m] != null && bySym[sy] && tk.isVerified !== false) mintSym[m] = sy;   // a look-alike (unverified) token is never counted
        });
      } catch (_) { info.jupFail = true; }
    }
    var got = {}; Object.keys(mintSym).forEach(function (m) { var sy = mintSym[m]; got[sy] = (got[sy] || 0) + (accts[m] || 0); });
    Object.keys(got).forEach(function (sy) { out.push({ sym: sy, q: got[sy], where: 'Solana' }); });
    return out;
  }
  async function evmWallet(w, held, plat, errs) {
    var out = [], pad = w.addr.slice(2).toLowerCase().padStart(64, '0');
    await Promise.all(EVM.map(async function (ch) {
      var calls = [], meta = [];
      held.forEach(function (c) {
        if (c.cgId === ch.id || (!c.cgId && ch.syms.indexOf(c.sym) >= 0)) { calls.push({ method: 'eth_getBalance', params: [w.addr, 'latest'] }); meta.push({ sym: c.sym, dec: 18 }); }
        var p = c.cgId && plat[c.cgId] && plat[c.cgId].p && plat[c.cgId].p[ch.k];
        if (p && /^0x[0-9a-fA-F]{40}$/.test(p[0])) { calls.push({ method: 'eth_call', params: [{ to: p[0], data: '0x70a08231' + pad }, 'latest'] }); meta.push({ sym: c.sym, dec: p[1], to: p[0] }); }
      });
      if (!calls.length) return;
      try {
        var res = await batch(ch.rpc, calls);
        var need = []; meta.forEach(function (m, i) { if (m.dec == null && res[i] && res[i] !== '0x' && BigInt(res[i]) > BigInt(0)) need.push(i); });
        if (need.length) {
          var d = await batch(ch.rpc, need.map(function (i) { return { method: 'eth_call', params: [{ to: meta[i].to, data: '0x313ce567' }, 'latest'] }; }));
          need.forEach(function (i, k) { meta[i].dec = d[k] && d[k] !== '0x' ? Number(BigInt(d[k])) : 18; });
        }
        var bad = false;
        meta.forEach(function (m, i) { if (res[i] === undefined) { bad = true; return; } out.push({ sym: m.sym, q: units(res[i], m.dec || 0), where: ch.name }); });
        if (bad) errs.push(ch.name + ' (some coins)');
      } catch (_) { errs.push(ch.name); }
    }));
    var at = function (r) { for (var i = 0; i < EVM.length; i++) if (EVM[i].name === r.where) return i; return 99; };
    return out.sort(function (a, b) { return at(a) - at(b); });   // always Ethereum, BNB Chain, Arbitrum… in that order
  }
  // CoinGecko: where each token lives (contract + decimals per chain) — remembered 90 days
  async function platforms(ids, onStep) {
    var c = lsGet(K.plat, {}), now = Date.now(), failed = [], need = ids.filter(function (id) { return !(c[id] && now - c[id].at < 90 * 864e5); });
    for (var i = 0; i < need.length; i++) {
      if (onStep) onStep(i + 1, need.length);
      var id = need[i], d = null;
      for (var n = 0; n < CFG.tries && !d; n++) {
        try {
          var r = await fetch(CG + encodeURIComponent(id) + '?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false');
          if (r.status === 429) { if (onStep) onStep(i + 1, need.length, true); await wait(CFG.retry); continue; }
          if (!r.ok) break; d = await r.json();
        } catch (_) { break; }
      }
      if (d) {
        var p = {}, dp = d.detail_platforms || {}, pl = d.platforms || {};
        Object.keys(dp).forEach(function (k) { var x = dp[k]; if (k && x && x.contract_address) p[k] = [String(x.contract_address).trim(), x.decimal_place == null ? null : +x.decimal_place]; });
        Object.keys(pl).forEach(function (k) { if (k && pl[k] && !p[k]) p[k] = [String(pl[k]).trim(), null]; });
        c[id] = { p: p, at: now }; lsPut(K.plat, c);   // saved coin by coin: a check stopped half-way goes on from there next time
      } else failed.push(id);
      if (i < need.length - 1 && CFG.gap) await wait(CFG.gap);
    }
    c.__failed = failed; return c;
  }
  function isNative(c) {
    return c.cgId === 'bitcoin' || c.cgId === 'solana' || EVM.some(function (ch) { return c.cgId === ch.id; }) || (!c.cgId && /^(BTC|SOL|ETH|BNB|POL|MATIC|AVAX)$/.test(c.sym));
  }
  function heldNow() {
    var st = S().getState() || {};
    var ids = (window.SamsamCoins && SamsamCoins.CG_IDS) || {};   // the starting coins carry no CoinGecko id of their own
    return (st.portfolio || []).filter(function (c) { return c.qty > 0; }).map(function (c) { return { sym: c.sym, qty: c.qty, currentPrice: c.currentPrice, cgId: c.cgId || ids[c.sym] || '' }; });
  }

  // ── Check now ──
  var busy = false, LAST = lsGet(K.last, null), step = '';
  async function check() {
    if (busy) return LAST; busy = true; step = 'Reading your wallets…'; draw();
    try {
      var ws = S().getWallets(), held = heldNow(), kinds = {}, info = {};
      ws.forEach(function (w) { kinds[w.kind] = 1; });
      var found = {}, errs = [], checked = {};
      var take = function (w, rows) {
        rows.forEach(function (r) {
          checked[r.sym] = 1; if (!(r.q > 0)) return;
          var f = found[r.sym] || (found[r.sym] = { q: 0, where: [] });
          f.q += r.q; var lab = w.kind === 'evm' ? (w.label ? w.label + ' · ' : '') + r.where : (w.label || KIND[w.kind]);
          if (f.where.indexOf(lab) < 0) f.where.push(lab);
        });
      };
      var plat = lsGet(K.plat, {});
      // 1) Bitcoin + Solana: read straight away (Solana lists its own tokens)
      step = 'Reading balances from the blockchain…'; draw();
      await Promise.all(ws.filter(function (w) { return w.kind !== 'evm'; }).map(async function (w) {
        try { take(w, w.kind === 'btc' ? await btcWallet(w, held) : await solWallet(w, held, plat, info)); }
        catch (e) { errs.push((w.label || KIND[w.kind]) + ' (' + short(w.addr) + ')'); }
      }));
      // 2) EVM: a token is read by its contract on each chain — CoinGecko says where (once, then remembered)
      var failed = [];
      if (kinds.evm) {
        var look = held.filter(function (c) { return c.cgId && !isNative(c) && !OWN.test(c.sym); }).map(function (c) { return c.cgId; });
        if (look.length) {
          plat = await platforms(look, function (i, n, slow) { step = slow ? 'CoinGecko is busy — waiting a moment… ' + i + ' / ' + n : 'Finding token contracts on CoinGecko… ' + i + ' / ' + n; draw(); });
          failed = plat.__failed || []; delete plat.__failed;
        }
        step = 'Reading balances from the blockchain…'; draw();
        await Promise.all(ws.filter(function (w) { return w.kind === 'evm'; }).map(async function (w) {
          try { take(w, await evmWallet(w, held, plat, errs)); }
          catch (e) { errs.push((w.label || KIND[w.kind]) + ' (' + short(w.addr) + ')'); }
        }));
      }
      if (info.jupFail) errs.push('Solana token names (Jupiter)');
      // why a coin wasn't checked
      var why = {};
      held.forEach(function (c) {
        if (checked[c.sym]) return;
        var bs = c.cgId === 'bitcoin' || c.sym === 'BTC' ? 'btc' : c.cgId === 'solana' || c.sym === 'SOL' ? 'sol' : '';
        why[c.sym] = bs && !kinds[bs] ? 'nowallet' : OWN.test(c.sym) ? 'own' : failed.indexOf(c.cgId) >= 0 ? 'busy' : !kinds.evm ? 'noevm' : !c.cgId ? 'unknown' : 'other';
      });
      LAST = { at: new Date().toISOString(), found: found, checked: Object.keys(checked), why: why, errs: errs };
      lsPut(K.last, LAST);
    } finally { busy = false; step = ''; draw(); }
    return LAST;
  }
  // every coin you hold: wallet vs app (with today's numbers in the app, so a Reward you just added shows as matched)
  function compare(last) {
    last = last || LAST; if (!last) return null;
    var held = heldNow(), out = { more: [], less: [], same: [], none: [], cant: [] }, ck = {};
    (last.checked || []).forEach(function (s) { ck[s] = 1; });
    held.forEach(function (c) {
      if (!ck[c.sym]) { out.cant.push({ sym: c.sym, why: (last.why || {})[c.sym] || 'other' }); return; }
      var f = (last.found || {})[c.sym], w = f ? f.q : 0, a = c.qty, d = w - a, p = c.currentPrice || 0;
      var row = { sym: c.sym, wallet: w, app: a, diff: d, usd: d * p, where: f ? f.where : [] };
      var same = p > 0 ? Math.abs(d) * p < 0.5 : Math.abs(d) <= Math.max(a, w) * 1e-4;
      if (!(w > 0)) out.none.push(row); else if (same) out.same.push(row); else if (d > 0) out.more.push(row); else out.less.push(row);
    });
    out.more.sort(function (x, y) { return y.usd - x.usd; }); out.less.sort(function (x, y) { return x.usd - y.usd; });
    return out;
  }

  // ── the window ──
  var CSS =
    '#cpWal{position:fixed;inset:0;z-index:99995;background:rgba(2,6,23,.55);display:flex;align-items:flex-end;justify-content:center}' +
    '@media (min-width:640px){#cpWal{align-items:center;padding:16px}}' +
    '#cpWal .wl-box{width:min(560px,100%);max-height:92vh;overflow:auto;background:var(--card-solid,var(--bg2,#111827));color:var(--fg,#e5e7eb);border:1px solid var(--border,#374151);border-radius:18px 18px 0 0;' +
      'padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));font:14px/1.45 system-ui,-apple-system,"Inter",sans-serif;box-shadow:0 -10px 40px rgba(0,0,0,.35);box-sizing:border-box}' +
    '@media (min-width:640px){#cpWal .wl-box{border-radius:18px}}' +
    '#cpWal .wl-h{display:flex;align-items:center;gap:10px;position:sticky;top:-16px;z-index:3;margin:-16px -16px 6px;padding:16px 16px 10px;background:inherit;border-radius:inherit;border-bottom:1px solid var(--border,rgba(148,163,184,.15))}' +
    '#cpWal .wl-h b{font-size:1.05rem;flex:1}' +
    '#cpWal .wl-hic{width:36px;height:36px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:rgba(124,58,237,.15);color:#a78bfa}#cpWal .wl-hic .ss-ic{margin:0}' +
    '[data-theme="light"] #cpWal .wl-hic{color:#7c3aed}' +
    '#cpWal .wl-x{background:none;border:none;color:inherit;opacity:.7;cursor:pointer;padding:6px;line-height:0}' +
    '#cpWal .wl-sec{margin:14px 0 6px;font-size:.72rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--fg2,#94a3b8)}' +
    '#cpWal .wl-note{font-size:.78rem;color:var(--fg2,#94a3b8);margin:4px 0}' +
    '#cpWal .wl-list{border:1px solid var(--border,rgba(148,163,184,.2));border-radius:14px;overflow:hidden}' +
    '#cpWal .wl-w{display:flex;align-items:center;gap:10px;padding:10px 12px;border-top:1px solid var(--border,rgba(148,163,184,.15))}#cpWal .wl-list>:first-child{border-top:none}' +
    '#cpWal .wl-w .wl-t{flex:1;min-width:0;display:flex;flex-direction:column}#cpWal .wl-w b{font-size:.9rem}' +
    '#cpWal .wl-w code{font-size:.74rem;color:var(--fg2,#94a3b8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#cpWal .wl-k{font-size:.66rem;font-weight:800;padding:2px 7px;border-radius:6px;background:rgba(148,163,184,.14);white-space:nowrap}' +
    '#cpWal .wl-del{background:none;border:none;color:inherit;opacity:.6;cursor:pointer;padding:6px;line-height:0}' +
    '#cpWal .wl-add{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}' +
    '#cpWal .wl-add input{flex:1 1 220px;min-width:0;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid var(--border,rgba(148,163,184,.3));background:rgba(148,163,184,.08);color:inherit;font:inherit;font-size:.85rem}' +
    '#cpWal .wl-add input#wlLabel{flex:0 1 130px}' +
    '#cpWal .wl-btn{border:none;border-radius:10px;padding:10px 14px;font:inherit;font-size:.84rem;font-weight:700;cursor:pointer;background:#7c3aed;color:#fff;display:inline-flex;align-items:center;gap:6px}' +
    '#cpWal .wl-btn[disabled]{opacity:.55;cursor:default}' +
    '#cpWal .wl-btn2{border:1px solid var(--border,rgba(148,163,184,.35));border-radius:9px;padding:6px 10px;font:inherit;font-size:.76rem;font-weight:700;cursor:pointer;background:transparent;color:inherit}' +
    '#cpWal .wl-btn2.rw{border-color:rgba(168,85,247,.55);color:#c084fc}[data-theme="light"] #cpWal .wl-btn2.rw{color:#7e22ce}' +
    '#cpWal .wl-err{color:#f87171;font-size:.8rem;margin-top:6px;min-height:1em}[data-theme="light"] #cpWal .wl-err{color:#dc2626}' +
    '#cpWal .wl-sug{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}#cpWal .wl-sug button{font-size:.74rem}' +
    '#cpWal .wl-run{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px}#cpWal .wl-step{font-size:.8rem;color:var(--fg2,#94a3b8)}' +
    '#cpWal .wl-r{padding:10px 12px;border-top:1px solid var(--border,rgba(148,163,184,.15))}' +
    '#cpWal .wl-r .wl-top{display:flex;align-items:center;gap:8px;justify-content:space-between}#cpWal .wl-r .wl-top b{font-size:.92rem}' +
    '#cpWal .wl-nums{font-size:.78rem;color:var(--fg2,#94a3b8);margin-top:2px}' +
    '#cpWal .wl-d{font-weight:800;font-size:.86rem;white-space:nowrap}#cpWal .wl-d.up{color:#22c55e}#cpWal .wl-d.dn{color:#f59e0b}' +
    '[data-theme="light"] #cpWal .wl-d.up{color:#16a34a}[data-theme="light"] #cpWal .wl-d.dn{color:#d97706}' +
    '#cpWal .wl-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}' +
    '#cpWal .wl-ok{color:#22c55e}[data-theme="light"] #cpWal .wl-ok{color:#16a34a}' +
    '#cpWal .wl-syms{font-size:.8rem;padding:10px 12px;line-height:1.6}' +
    '#cpWal .wl-syms+.wl-syms{border-top:1px solid var(--border,rgba(148,163,184,.15))}' +
    '#cpWal .wl-warn{color:#f59e0b;font-size:.8rem;margin-top:6px}';

  var form = { addr: '', label: '', err: '' };
  function walletsHtml() {
    var ws = S().getWallets();
    var list = ws.length ? '<div class="wl-list">' + ws.map(function (w) {
      return '<div class="wl-w" data-id="' + E(w.id) + '"><span class="wl-t"><b>' + E(w.label || KIND[w.kind]) + '</b><code title="' + E(w.addr) + '">' + E(w.addr) + '</code></span>' +
        '<span class="wl-k">' + E(w.kind === 'evm' ? 'EVM' : KIND[w.kind]) + '</span>' +
        '<button type="button" class="wl-del" data-del="' + E(w.id) + '" aria-label="Remove ' + E(w.label || short(w.addr)) + '" title="Remove">' + IC('trash', { solo: true }) + '</button></div>';
    }).join('') + '</div>' : '<div class="wl-note">No wallet yet. Add the public address of each wallet you keep coins in (Tangem: tap the coin → Receive → copy).</div>';
    // addresses the import marked as "My wallet"
    var have = {}; ws.forEach(function (w) { have[w.addr.toLowerCase()] = 1; });
    var imp = lsGet('samsam_imp_addr', {}), sug = Object.keys(imp || {}).filter(function (a) { return imp[a] === 'mine' && !have[a.toLowerCase()] && S().walletKind(a); }).slice(0, 6);
    return list +
      '<div class="wl-add"><input id="wlAddr" placeholder="Paste a public address (bc1… · 0x… · Solana)" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + E(form.addr) + '">' +
      '<input id="wlLabel" placeholder="Name (optional)" maxlength="30" value="' + E(form.label) + '">' +
      '<button type="button" class="wl-btn" id="wlAddBtn">' + IC('plus') + 'Add</button></div>' +
      '<div class="wl-err" id="wlErr" role="alert">' + E(form.err) + '</div>' +
      (sug.length ? '<div class="wl-note">From your imported withdrawals:</div><div class="wl-sug">' + sug.map(function (a) { return '<button type="button" class="wl-btn2" data-sug="' + E(a) + '">' + IC('plus') + E(KIND[S().walletKind(a)]) + ' ' + E(short(a)) + '</button>'; }).join('') + '</div>' : '') +
      '<div class="wl-note">' + IC('lock') + 'Public addresses only — never type your recovery phrase or private key anywhere.</div>';
  }
  function rowHtml(r, kind) {
    var nums = 'Wallets <b>' + qf(r.wallet) + '</b> · App <b>' + qf(r.app) + '</b>' + (r.where.length ? ' · ' + E(r.where.join(', ')) : '');
    var d = (r.diff > 0 ? '+' : '−') + qf(Math.abs(r.diff)) + ' ' + r.sym + (r.usd ? ' <small>(' + usd(Math.abs(r.usd)) + ')</small>' : '');
    var acts = '';
    if (kind === 'more') {
      acts = '<div class="wl-acts"><button type="button" class="wl-btn2 rw" data-rw="' + E(r.sym) + '" data-q="' + r.diff + '">' + IC('coins') + 'Add +' + qf(r.diff) + ' as Reward</button>' +
        (window.SamsamAdd && SamsamAdd.openTx ? '<button type="button" class="wl-btn2" data-tin="' + E(r.sym) + '" data-q="' + r.diff + '">' + IC('arrowDown') + 'Transfer In…</button>' : '') + '</div>';
    }
    return '<div class="wl-r" data-sym="' + E(r.sym) + '"><div class="wl-top"><b>' + E(r.sym) + '</b>' +
      (kind === 'same' ? '<span class="wl-d wl-ok">' + IC('check') + 'Match</span>' : '<span class="wl-d ' + (r.diff > 0 ? 'up' : 'dn') + '">' + d + '</span>') + '</div>' +
      '<div class="wl-nums">' + nums + '</div>' +
      (kind === 'less' ? '<div class="wl-nums">The rest is on an exchange, staked, or a sell / transfer wasn’t recorded.</div>' : '') + acts + '</div>';
  }
  function resultsHtml() {
    var c = compare(); if (!c) return '';
    var when = new Date(LAST.at), ago = Math.round((Date.now() - when) / 60e3);
    var h = '<div class="wl-note">Checked ' + (ago < 1 ? 'just now' : ago < 60 ? ago + ' min ago' : when.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + '</div>';
    if ((LAST.errs || []).length) h += '<div class="wl-warn">' + IC('alert') + 'Couldn’t read: ' + E(LAST.errs.join(', ')) + ' — try again in a minute.</div>';
    var sec = function (title, rows, kind) { return rows.length ? '<div class="wl-sec">' + title + ' (' + rows.length + ')</div><div class="wl-list" id="wlRes-' + kind + '">' + rows.map(function (r) { return rowHtml(r, kind); }).join('') + '</div>' : ''; };
    h += sec('Wallet has more', c.more, 'more') + sec('App has more', c.less, 'less') + sec('Match', c.same, 'same');
    if (c.none.length) h += '<div class="wl-sec">Not in these wallets (' + c.none.length + ')</div><div class="wl-list"><div class="wl-syms" id="wlRes-none">' + c.none.map(function (r) { return '<b>' + E(r.sym) + '</b> ' + qf(r.app); }).join(' · ') + '<div class="wl-note">On an exchange, staked, or in a wallet you haven’t added.</div></div></div>';
    if (c.cant.length) {
      var WHY = [['busy', 'CoinGecko was busy, so these weren’t looked up yet — tap Check now again (what was found is remembered).'],
        ['noevm', 'Ethereum-type coins (ETH, LINK, ONDO, ARB, USDT on Ethereum…): add your 0x… address — the same one covers Ethereum, Base, Optimism, Arbitrum, BNB Chain, Polygon and Avalanche. Not there? Then they’re on another chain or an exchange.'],
        ['nowallet', 'Add your Bitcoin / Solana address to check these.'],
        ['other', 'Not on Bitcoin, Solana or the EVM chains of your wallets.'], ['unknown', 'Not linked to CoinGecko.'], ['own', 'Their own blockchain (can’t be read here).']];
      h += '<div class="wl-sec">Not checked (' + c.cant.length + ')</div><div class="wl-list" id="wlRes-cant">' + WHY.map(function (g) {
        var l = c.cant.filter(function (x) { return x.why === g[0]; }); if (!l.length) return '';
        return '<div class="wl-syms" data-why="' + g[0] + '">' + l.map(function (x) { return '<b>' + E(x.sym) + '</b>'; }).join(' · ') + '<div class="wl-note">' + E(g[1]) + '</div></div>';
      }).join('') + '</div>';
    }
    return h;
  }
  function draw() {
    var el = $('cpWal'); if (!el) return;
    var keep = $('wlAddr') && doc.activeElement === $('wlAddr');
    if ($('wlAddr')) { form.addr = $('wlAddr').value; form.label = $('wlLabel').value; }
    var n = S().getWallets().length;
    el.querySelector('.wl-body').innerHTML =
      '<div class="wl-sec">Your wallets</div>' + walletsHtml() +
      '<div class="wl-run"><button type="button" class="wl-btn" id="wlCheck"' + (n && !busy ? '' : ' disabled') + '>' + IC('refresh') + (busy ? 'Checking…' : 'Check now') + '</button>' +
      '<span class="wl-step" id="wlStep">' + E(step || (n ? 'Compares every coin you hold with these wallets.' : '')) + '</span></div>' +
      '<div id="wlResults">' + (busy ? '' : resultsHtml()) + '</div>';
    if (keep) { var a = $('wlAddr'); a.focus(); a.setSelectionRange(a.value.length, a.value.length); }
  }
  async function addWallet(addr, label) {
    addr = String(addr || '').trim(); form.err = '';
    var setIn = function (a, l) { if ($('wlAddr')) $('wlAddr').value = a; if ($('wlLabel') && l != null) $('wlLabel').value = l; };
    if (addr.split(/\s+/).length >= 8) { setIn(''); form.err = 'That looks like a recovery phrase — never type it anywhere. Only a public address goes here.'; draw(); return; }
    var kind = S().walletKind(addr);
    if (!kind) { form.err = 'Not a Bitcoin, Solana or 0x… address.'; draw(); return; }
    var ws = S().getWallets();
    if (ws.some(function (w) { return w.addr.toLowerCase() === addr.toLowerCase(); })) { form.err = 'Already in the list.'; draw(); return; }
    ws.push({ id: 'w' + Date.now().toString(36), kind: kind, addr: addr, label: String(label || '').trim() });
    setIn('', '');
    try { await S().setWallets(ws); } catch (e) { form.err = 'Not saved — ' + ((e && e.message) || e); }
    draw();
  }
  async function removeWallet(id) {
    var ws = S().getWallets(), w = ws.filter(function (x) { return x.id === id; })[0]; if (!w) return;
    var ok = window.CPDialog ? await CPDialog.confirm('Remove ' + (w.label || KIND[w.kind]) + ' (' + short(w.addr) + ') from the check? Your coins and transactions are not touched.', { title: 'Remove wallet', okText: 'Remove', danger: true }) : true;
    if (!ok) return;
    await S().setWallets(ws.filter(function (x) { return x.id !== id; })).catch(function () {});
    draw();
  }
  async function addReward(sym, q) {
    if (!(q > 0)) return;
    var ok = window.CPDialog ? await CPDialog.confirm('Add +' + qf(q) + ' ' + sym + ' as a staking Reward at $0 cost? Your holdings go up and the average buy price goes down.', { title: 'Add Reward', okText: 'Add Reward' }) : true;
    if (!ok) return;
    try { await S().addTx(sym, 'transfer_in', q, 0, 'Staking reward · wallet check', { kind: 'reward' }); }
    catch (e) { if (window.CPDialog) CPDialog.alert('Not saved — ' + ((e && e.message) || e)); }
    draw();
  }
  var unsub = null;
  function close() { var b = $('cpWal'); if (b) b.remove(); doc.removeEventListener('keydown', esc, true); if (unsub) { unsub(); unsub = null; } }
  function esc(e) { if (e.key === 'Escape' && !doc.querySelector('#cpDialog')) { e.stopPropagation(); close(); } }
  function open() {
    var s = S(); if (!s || !s.isReady || !s.isReady() || !s.getWallets) return;
    if (!$('wlCss')) { var st = doc.createElement('style'); st.id = 'wlCss'; st.textContent = CSS; doc.head.appendChild(st); }
    close(); form = { addr: '', label: '', err: '' };
    var el = doc.createElement('div'); el.id = 'cpWal'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Wallets & check');
    el.innerHTML = '<div class="wl-box"><div class="wl-h"><span class="wl-hic">' + IC('wallet', { solo: true }) + '</span><b>Wallets &amp; check</b><button type="button" class="wl-x" aria-label="Close">' + IC('x') + '</button></div><div class="wl-body"></div></div>';
    doc.body.appendChild(el); draw();
    el.addEventListener('click', function (e) {
      var t = e.target;
      if (t === el || t.closest('.wl-x')) { close(); return; }
      if (t.closest('#wlAddBtn')) { addWallet($('wlAddr').value, $('wlLabel').value); return; }
      var b = t.closest('[data-sug]'); if (b) { addWallet(b.dataset.sug, ''); return; }
      b = t.closest('[data-del]'); if (b) { removeWallet(b.dataset.del); return; }
      if (t.closest('#wlCheck')) { check(); return; }
      b = t.closest('[data-rw]'); if (b) { addReward(b.dataset.rw, +b.dataset.q); return; }
      b = t.closest('[data-tin]'); if (b) { var sym = b.dataset.tin, q = +b.dataset.q; close(); SamsamAdd.openTx('transfer_in', sym, { qty: q, note: 'Found by the wallet check' }); }
    });
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.target.id === 'wlAddr' || e.target.id === 'wlLabel')) { e.preventDefault(); addWallet($('wlAddr').value, $('wlLabel').value); } });
    doc.addEventListener('keydown', esc, true);
    unsub = s.onChange(function () { if ($('cpWal') && !busy) draw(); });
    setTimeout(function () { var f = $('wlAddr'); if (f && !s.getWallets().length) f.focus(); }, 0);
  }
  window.SamsamWallets = { open: open, close: close, check: check, compare: compare, last: function () { return LAST; }, _cfg: CFG, _units: units, _own: OWN };
})();
