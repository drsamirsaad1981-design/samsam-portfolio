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
  var CFG = { gap: 2500, retry: 30000, tries: 3, tonGap: 1100 };   // CoinGecko's free limit: one coin lookup at a time, a pause between, wait when busy
  var CG = 'https://api.coingecko.com/api/v3/coins/';
  var JUP = 'https://lite-api.jup.ag/tokens/v2/search?query=';
  var JUP_BAL = 'https://lite-api.jup.ag/ultra/v1/balances/';   // Jupiter: SOL + every token of a wallet   // Jupiter: what a Solana token (mint) is — up to 100 at a time
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
    { k: 'linea', name: 'Linea', rpc: 'https://linea-rpc.publicnode.com', id: 'ethereum', syms: ['ETH'] },
    { k: 'sei-v2', name: 'Sei EVM', rpc: ['https://sei-evm-rpc.publicnode.com', 'https://evm-rpc.sei-apis.com'], id: 'sei-network', syms: ['SEI'] },
    { k: 'kava', name: 'Kava EVM', rpc: ['https://kava-evm-rpc.publicnode.com', 'https://evm.kava.io'], id: 'kava', syms: ['KAVA'] },
    { k: 'cronos', name: 'Cronos', rpc: ['https://cronos-evm-rpc.publicnode.com', 'https://evm.cronos.org'], id: 'crypto-com-chain', syms: ['CRO'] },
    { k: 'mantle', name: 'Mantle', rpc: ['https://mantle-rpc.publicnode.com', 'https://rpc.mantle.xyz'], id: 'mantle', syms: ['MNT'] },
    { k: 'moonbeam', name: 'Moonbeam', rpc: ['https://moonbeam-rpc.publicnode.com', 'https://rpc.api.moonbeam.network', 'https://moonbeam.drpc.org', 'https://1rpc.io/glmr', 'https://moonbeam.public.blastapi.io'], id: 'moonbeam', syms: ['GLMR'] },
    { k: 'moonriver', name: 'Moonriver', rpc: ['https://moonriver-rpc.publicnode.com', 'https://rpc.api.moonriver.moonbeam.network', 'https://moonriver.drpc.org', 'https://moonriver.public.blastapi.io'], id: 'moonriver', syms: ['MOVR'] },
    { k: 'flare-network', name: 'Flare', rpc: ['https://flare-api.flare.network/ext/C/rpc'], id: 'flare-networks', syms: ['FLR'] },
    { k: 'monad', name: 'Monad', rpc: ['https://rpc.monad.xyz', 'https://rpc1.monad.xyz'], id: 'monad', syms: ['MON'] },
    { k: 'sonic', name: 'Sonic', rpc: ['https://sonic-rpc.publicnode.com', 'https://rpc.soniclabs.com'], id: 'sonic-3', syms: ['S'] },
    { k: 'celo', name: 'Celo', rpc: ['https://celo-rpc.publicnode.com', 'https://forno.celo.org'], id: 'celo', syms: ['CELO'] },
    { k: 'robinhood-chain', rx: /robinhood/i, name: 'Robinhood Chain', rpc: ['https://rpc.mainnet.chain.robinhood.com'], id: 'ethereum', syms: ['ETH'] },
    { k: 'xdai', name: 'Gnosis', rpc: ['https://gnosis-rpc.publicnode.com', 'https://rpc.gnosischain.com'], id: 'xdai', syms: ['XDAI'] },
  ];
  var KIND = { btc: 'Bitcoin', sol: 'Solana', evm: 'Ethereum & EVM chains', sui: 'Sui', near: 'NEAR', hbar: 'Hedera', kas: 'Kaspa', doge: 'Dogecoin', atom: 'Cosmos', sei: 'Sei', kava: 'Kava', apt: 'Aptos', ton: 'TON' };
  // networks with their own blockchain that can be read without a key: the coin, and staked coins counted with it
  var CHAIN = {
    ton: { id: 'the-open-network', syms: ['TON'] }, sui: { id: 'sui', syms: ['SUI'] }, apt: { id: 'aptos', syms: ['APT'] }, near: { id: 'near', syms: ['NEAR'] }, hbar: { id: 'hedera-hashgraph', syms: ['HBAR'] },
    kas: { id: 'kaspa', syms: ['KAS'] }, doge: { id: 'dogecoin', syms: ['DOGE'] },
    atom: { id: 'cosmos', syms: ['ATOM'], lcd: 'cosmoshub', denom: 'uatom' }, sei: { id: 'sei-network', syms: ['SEI'], lcd: 'sei', denom: 'usei' },
    kava: { id: 'kava', syms: ['KAVA'], lcd: 'kava', denom: 'ukava' },
  };
  var NEAR_RPC = ['https://rpc.mainnet.fastnear.com', 'https://rpc.mainnet.near.org'];
  // coins that live on their own blockchain (not Bitcoin / Solana / EVM): never looked up, listed as "can't be checked"
  var OWN = /^(DOT|KSM|ICP|VET|VTHO|TAO|FIL|XPL|XRP|ADA|TRX|XLM|ALGO|LTC|BCH|ETC|XMR|EGLD|TIA|OSMO|XTZ|EOS|ZEC|DASH|STX|MINA|FLOW|ROSE|HYPE|THETA|IOTA|NEO|AR|CKB|ONE|ZIL|RUNE|CFX|BSV|XDC|KDA|ICX|WAVES|CSPR)$/;
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
        return [{ sym: c.sym, q: sats / 1e8, where: 'Bitcoin', net: { k: 'btc', c: '' } }];
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
    var accts = {}, solQ = null;   // mint → amount
    // 1) Jupiter: SOL and every token in one answer (made for browsers, no key)
    try {
      var r = await fetch(JUP_BAL + encodeURIComponent(w.addr)); if (!r.ok) throw new Error('Jupiter');
      var j = await r.json(); if (!j || typeof j !== 'object' || Array.isArray(j) || j.error) throw new Error('Jupiter');
      Object.keys(j).forEach(function (k) {
        var v = j[k], q = v && v.uiAmount != null ? +v.uiAmount : NaN; if (!isFinite(q)) return;
        if (k === 'SOL') solQ = q; else accts[k] = (accts[k] || 0) + q;
      });
      if (solQ == null) solQ = 0;
    } catch (_) {
      // 2) the public Solana servers: SOL on its own, then the tokens (often refused to browsers — SOL is kept anyway)
      var b = await call('getBalance', [w.addr]); if (b.error) throw new Error('Solana');
      solQ = ((b.result && b.result.value) || 0) / 1e9;
      try {
        for (var i = 0; i < SPL.length; i++) {
          var t = await call('getTokenAccountsByOwner', [w.addr, { programId: SPL[i] }, { encoding: 'jsonParsed' }]);
          if (t.error) throw new Error('Solana');
          ((t.result && t.result.value) || []).forEach(function (a) {
            var inf = a && a.account && a.account.data && a.account.data.parsed && a.account.data.parsed.info; if (!inf || !inf.mint) return;
            var ta = inf.tokenAmount || {}; accts[inf.mint] = (accts[inf.mint] || 0) + (+(ta.uiAmountString != null ? ta.uiAmountString : ta.uiAmount) || 0);
          });
        }
      } catch (e) { info.solTokFail = true; accts = null; }
    }
    if (sol) out.push({ sym: sol.sym, q: solQ, where: 'Solana', net: { k: 'sol', c: '' } });
    if (!accts) return out;
    var bySym = {}, mintSym = {};
    held.forEach(function (c) { bySym[c.sym] = c; var p = plat[c.pk] && plat[c.pk].p && plat[c.pk].p.solana; if (p) mintSym[p[0]] = c.sym; });
    var unknown = Object.keys(accts).filter(function (m) { return !mintSym[m] && accts[m] > 0; });
    if (unknown.length) {
      try {
        (await jupTokens(unknown)).forEach(function (tk) {
          var m = tk && (tk.id || tk.address), sy = String((tk && tk.symbol) || '').toUpperCase();
          if (m && accts[m] != null && bySym[sy] && tk.isVerified !== false) mintSym[m] = sy;   // a look-alike (unverified) token is never counted
        });
      } catch (_) { info.jupFail = true; }
    }
    var got = {}, mint = {}; Object.keys(mintSym).forEach(function (m) { var sy = mintSym[m]; got[sy] = (got[sy] || 0) + (accts[m] || 0); if (accts[m] > 0 || !mint[sy]) mint[sy] = m; });
    Object.keys(got).forEach(function (sy) { out.push({ sym: sy, q: got[sy], where: 'Solana', net: { k: 'sol', c: mint[sy] } }); });
    return out;
  }
  async function evmWallet(w, held, plat, errs) {
    var out = [], pad = w.addr.slice(2).toLowerCase().padStart(64, '0');
    await Promise.all(EVM.map(async function (ch) {
      var calls = [], meta = [];
      held.forEach(function (c) {
        var nat = c.cgId === ch.id || (!c.cgId && ch.syms.indexOf(c.sym) >= 0) || (c.nets || []).some(function (n) { return n.k === 'evm:' + ch.k && !n.c; });
        if (nat) { calls.push({ method: 'eth_getBalance', params: [w.addr, 'latest'] }); meta.push({ sym: c.sym, dec: 18 }); return; }   // the chain's own coin: never again as a token there
        var P = plat[c.pk] && plat[c.pk].p, p = P && P[ch.k];
        if (P && !p && ch.rx) Object.keys(P).some(function (k) { if (ch.rx.test(k)) { p = P[k]; return true; } return false; });
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
        meta.forEach(function (m, i) { if (res[i] === undefined) { bad = true; out.push({ sym: m.sym, q: 0, fail: true, where: ch.name }); return; } out.push({ sym: m.sym, q: units(res[i], m.dec || 0), where: ch.name, net: { k: 'evm:' + ch.k, c: m.to || '' } }); });
        if (bad && errs.indexOf(ch.name) < 0) errs.push(ch.name);
      } catch (_) {
        if (errs.indexOf(ch.name) < 0) errs.push(ch.name);
        meta.forEach(function (m) { out.push({ sym: m.sym, q: 0, fail: true, where: ch.name }); });
      }
    }));
    var at = function (r) { for (var i = 0; i < EVM.length; i++) if (EVM[i].name === r.where) return i; return 99; };
    return out.sort(function (a, b) { return at(a) - at(b); });   // always Ethereum, BNB Chain, Arbitrum… in that order
  }
  async function getJ(url) { var r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); }
  function dec(str, d) { str = String(str || '0').replace(/^0+(?=\d)/, ''); if (!/^\d+$/.test(str)) return 0; str = str.padStart(d + 1, '0'); return Number(str.slice(0, -d) + '.' + str.slice(-d)); }
  // TON: the coin itself + jettons (GRAM…). toncenter answers about one question a second without a key.
  function tonRaw(addr) {   // EQ…/UQ… → 0:HEX (how toncenter names jettons)
    var a = String(addr || '').trim(); if (/^-?\d:[0-9a-fA-F]{64}$/.test(a)) return a.toUpperCase();
    try {
      var b = atob(a.replace(/-/g, '+').replace(/_/g, '/')); if (b.length !== 36) return '';
      var wc = b.charCodeAt(1); wc = wc > 127 ? wc - 256 : wc; var h = '';
      for (var i = 2; i < 34; i++) h += ('0' + b.charCodeAt(i).toString(16)).slice(-2);
      return (wc + ':' + h).toUpperCase();
    } catch (_) { return ''; }
  }
  async function tonWallet(w, held, plat) {
    var out = [], T = 'https://toncenter.com/api/', ton = held.filter(function (x) { return x.cgId === 'the-open-network' || x.sym === 'TON'; })[0];
    if (ton) { var b = await getJ(T + 'v2/getAddressBalance?address=' + encodeURIComponent(w.addr)); out.push({ sym: ton.sym, q: (+(b && b.result) || 0) / 1e9, where: 'TON', net: { k: 'ton', c: '' } }); await wait(CFG.tonGap); }
    var masters = {};   // raw jetton address → your coin (CoinGecko's TON contract)
    held.forEach(function (c) { var p = plat[c.pk] && plat[c.pk].p && plat[c.pk].p['the-open-network']; if (p) { var r = tonRaw(p[0]); if (r) masters[r] = { sym: c.sym, dec: p[1] }; } });
    var j = await getJ(T + 'v3/jetton/wallets?owner_address=' + encodeURIComponent(w.addr) + '&limit=100');
    var md = j.metadata || {}, bySym = {}, got = {}, mst = {};
    held.forEach(function (c) { if (!(plat[c.pk] && plat[c.pk].p && plat[c.pk].p['the-open-network'])) bySym[c.sym] = c; });
    (j.jetton_wallets || []).forEach(function (x) {
      var raw = String(x.jetton || '').toUpperCase(), m = masters[raw], ti = null;
      var meta = md[x.jetton] || md[raw]; if (meta && meta.token_info) ti = [].concat(meta.token_info)[0];
      if (!m && ti && bySym[String(ti.symbol || '').toUpperCase()]) m = { sym: String(ti.symbol).toUpperCase(), dec: null };   // a coin CoinGecko doesn't place on TON: by its name
      if (!m) return;
      var d = m.dec != null ? m.dec : ti && ti.extra && ti.extra.decimals != null ? +ti.extra.decimals : 9;
      got[m.sym] = (got[m.sym] || 0) + dec(x.balance, d); mst[m.sym] = raw;
    });
    Object.keys(masters).forEach(function (r) { var sy = masters[r].sym; if (!(sy in got)) got[sy] = 0; });
    Object.keys(got).forEach(function (sy) { out.push({ sym: sy, q: got[sy], where: 'TON', net: { k: 'ton', c: mst[sy] || '' } }); });
    return out;
  }
  // one coin per network: { q (free + staked), staked }
  async function chainWallet(w, held) {
    var ch = CHAIN[w.kind], c = held.filter(function (x) { return x.cgId === ch.id || ch.syms.indexOf(x.sym) >= 0; })[0];
    if (!c) return [];
    var a = w.addr, free = 0, staked = 0;
    if (w.kind === 'sui') {
      var rpc = function (m, p) { return post(['https://fullnode.mainnet.sui.io', 'https://sui-rpc.publicnode.com'], { jsonrpc: '2.0', id: 1, method: m, params: p }); };
      var b = null; try { b = await rpc('suix_getBalance', [a, '0x2::sui::SUI']); if (b.error || !b.result) b = null; } catch (_) { b = null; }
      if (b) {
        free = dec(b.result.totalBalance, 9);
        try { var st = await rpc('suix_getStakes', [a]); ((st && st.result) || []).forEach(function (v) { (v.stakes || []).forEach(function (x) { staked += dec(x.principal, 9) + dec(x.estimatedReward, 9); }); }); } catch (_) {}
      } else {   // Sui's newer GraphQL server (the old JSON-RPC is being switched off)
        var gq = function (q) { return post('https://graphql.mainnet.sui.io/graphql', { query: q, variables: { a: a } }); };
        var g = await gq('query($a:SuiAddress!){address(address:$a){balance(coinType:"0x2::sui::SUI"){totalBalance}}}');
        if (!(g && g.data && g.data.address)) g = await gq('query($a:SuiAddress!){address(address:$a){balance(type:"0x2::sui::SUI"){totalBalance}}}');
        if (!(g && g.data)) throw new Error('Sui');
        free = dec(g.data.address && g.data.address.balance && g.data.address.balance.totalBalance, 9);
        try {
          var sg = await gq('query($a:SuiAddress!){address(address:$a){stakedSuis{nodes{principal}}}}');
          (((sg.data && sg.data.address && sg.data.address.stakedSuis) || {}).nodes || []).forEach(function (x) { staked += dec(x.principal, 9); });
          if (!(sg.data && sg.data.address && sg.data.address.stakedSuis)) {
            var so = await gq('query($a:SuiAddress!){address(address:$a){objects(filter:{type:"0x3::staking_pool::StakedSui"}){nodes{contents{json}}}}}');
            (((so.data && so.data.address && so.data.address.objects) || {}).nodes || []).forEach(function (x) { var j = x.contents && x.contents.json; if (j) staked += dec(j.principal, 9); });
          }
        } catch (_) {}
      }
    } else if (w.kind === 'apt') {
      var AP = 'https://api.mainnet.aptoslabs.com/v1/accounts/' + encodeURIComponent(a);
      var ar = await fetch(AP + '/balance/0x1::aptos_coin::AptosCoin');
      if (ar.ok) free = (+(await ar.text()) || 0) / 1e8;
      else if (ar.status !== 404) {
        var rr = await fetch(AP + '/resource/' + encodeURIComponent('0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>'));
        if (rr.ok) { var rj = await rr.json(); free = (+(rj.data && rj.data.coin && rj.data.coin.value) || 0) / 1e8; }
        else if (rr.status !== 404) throw new Error('Aptos');
      }
    } else if (w.kind === 'near') {
      var n = await post(NEAR_RPC, { jsonrpc: '2.0', id: '1', method: 'query', params: { request_type: 'view_account', finality: 'final', account_id: a } });
      if (n.error || !n.result) throw new Error('NEAR');
      free = dec(n.result.amount, 24); staked = dec(n.result.locked, 24);
    } else if (w.kind === 'hbar') {
      var h = await getJ('https://mainnet-public.mirrornode.hedera.com/api/v1/accounts/' + encodeURIComponent(a));
      free = ((h.balance && h.balance.balance) || 0) / 1e8;   // staked HBAR never leaves the balance
    } else if (w.kind === 'kas') {
      var k = await getJ('https://api.kaspa.org/addresses/' + encodeURIComponent(a) + '/balance'); free = (+k.balance || 0) / 1e8;
    } else if (w.kind === 'doge') {
      var d = await getJ('https://api.blockcypher.com/v1/doge/main/addrs/' + encodeURIComponent(a) + '/balance'); free = (+d.final_balance || 0) / 1e8;
    } else if (ch.lcd) {   // Cosmos family: in the wallet + delegated (staked) + on its way back (unbonding)
      var base = 'https://rest.cosmos.directory/' + ch.lcd + '/cosmos/';
      var bal = await getJ(base + 'bank/v1beta1/balances/' + a);
      (bal.balances || []).forEach(function (x) { if (x.denom === ch.denom) free += dec(x.amount, 6); });
      try {
        var dl = await getJ(base + 'staking/v1beta1/delegations/' + a);
        (dl.delegation_responses || []).forEach(function (x) { if (x.balance && x.balance.denom === ch.denom) staked += dec(x.balance.amount, 6); });
        var ub = await getJ(base + 'staking/v1beta1/delegators/' + a + '/unbonding_delegations');
        (ub.unbonding_responses || []).forEach(function (x) { (x.entries || []).forEach(function (e) { staked += dec(e.balance, 6); }); });
      } catch (_) {}
    }
    return [{ sym: c.sym, q: free + staked, staked: staked, where: KIND[w.kind], net: { k: w.kind, c: '' } }];
  }
  // CoinGecko: where each token lives (contract + decimals per chain) — remembered 90 days
  async function platforms(ids, onStep) {
    var c = lsGet(K.plat, {}), now = Date.now(), failed = [], need = ids.filter(function (id) { return !(c[id] && now - c[id].at < 90 * 864e5); });
    if (need.length > 2) {   // one answer for every coin: CoinGecko's full list with contracts (only the coins you hold are kept)
      try {
        if (onStep) onStep(0, need.length);
        var LU = 'https://api.coingecko.com/api/v3/coins/list?include_platform=true', lr = await fetch(LU);
        if (lr.status === 429) { if (onStep) onStep(0, need.length, true); await wait(CFG.retry); lr = await fetch(LU); }
        if (lr.ok) {
          var want = {}; need.forEach(function (id) { want[id] = 1; });
          (await lr.json()).forEach(function (x) {
            if (!x || !want[x.id]) return; var p = {}, pl = x.platforms || {};
            Object.keys(pl).forEach(function (k) { if (k && pl[k]) p[k] = [String(pl[k]).trim(), null]; });
            c[x.id] = { p: p, at: now };
          });
          lsPut(K.plat, c);
          need = need.filter(function (id) { return !c[id]; });
        }
      } catch (_) {}
    }
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
    return c.cgId === 'bitcoin' || c.cgId === 'solana' || Object.keys(CHAIN).some(function (k) { return c.cgId === CHAIN[k].id; }) || EVM.some(function (ch) { return c.cgId === ch.id; }) || (!c.cgId && /^(BTC|SOL|ETH|BNB|POL|MATIC|AVAX)$/.test(c.sym));
  }
  // your saved networks: a contract you gave is used as is, and a coin with networks saved is read only there
  function withSaved(plat, held) {
    var out = Object.assign({}, plat);
    held.forEach(function (c) {
      if (!c.nets) return; var P = {};
      c.nets.forEach(function (n) { if (!n.c) return; var pk = n.k === 'sol' ? 'solana' : n.k === 'ton' ? 'the-open-network' : n.k.indexOf('evm:') === 0 ? n.k.slice(4) : null; if (pk) P[pk] = [n.c, null]; });
      out[c.pk] = { p: P, at: Date.now() };
    });
    return out;
  }
  function heldNow() {
    var st = S().getState() || {};
    var ids = (window.SamsamCoins && SamsamCoins.CG_IDS) || {};   // the starting coins carry no CoinGecko id of their own
    var docs = {}; (st.coins || []).forEach(function (d) { if (d && d.sym) docs[d.sym] = d; });
    return (st.portfolio || []).filter(function (c) { return c.qty > 0; }).map(function (c) {
      var d = docs[c.sym] || {}, cg = c.cgId || ids[c.sym] || '';
      return { sym: c.sym, qty: c.qty, currentPrice: c.currentPrice, cgId: cg, pk: cg || 'sym:' + c.sym, nets: Array.isArray(d.nets) && d.nets.length ? d.nets : null, at: Array.isArray(d.at) ? d.at : [] };
    });
  }

  // ── Check now ──
  var busy = false, LAST = lsGet(K.last, null), step = '';
  async function check() {
    if (busy) return LAST; busy = true; step = 'Reading your wallets…'; draw();
    try {
      var ws = S().getWallets(), held = heldNow(), kinds = {}, info = {};
      ws.forEach(function (w) { kinds[w.kind] = 1; });
      var found = {}, errs = [], checked = {}, unsure = {};
      var take = function (w, rows) {
        rows.forEach(function (r) {
          if (r.fail) { unsure[r.sym] = 1; return; }
          checked[r.sym] = 1; if (!(r.q > 0)) return;
          var f = found[r.sym] || (found[r.sym] = { q: 0, where: [], staked: 0 });
          f.nets = f.nets || []; if (r.net && !f.nets.some(function (n) { return n.k === r.net.k; })) f.nets.push(r.net);
          f.q += r.q; f.staked = (f.staked || 0) + (r.staked || 0); var lab = w.kind === 'evm' ? (w.label ? w.label + ' · ' : '') + r.where : (w.label || KIND[w.kind]);
          if (f.where.indexOf(lab) < 0) f.where.push(lab);
        });
      };
      var plat = withSaved(lsGet(K.plat, {}), held);
      // 1) Bitcoin, Solana and the networks with their own blockchain: read straight away (Solana lists its own tokens)
      step = 'Reading balances from the blockchain…'; draw();
      await Promise.all(ws.filter(function (w) { return w.kind !== 'evm'; }).map(async function (w) {
        try { take(w, w.kind === 'btc' ? await btcWallet(w, held) : w.kind === 'sol' ? await solWallet(w, held, plat, info) : w.kind === 'ton' ? await tonWallet(w, held, plat) : await chainWallet(w, held)); }
        catch (e) { errs.push((w.label || KIND[w.kind]) + ' (' + short(w.addr) + ')'); }
      }));
      // 2) EVM: a token is read by its contract on each chain — CoinGecko says where (once, then remembered)
      var failed = [];
      if (kinds.evm) {
        var look = held.filter(function (c) { return c.cgId && !c.nets && !isNative(c) && !OWN.test(c.sym); }).map(function (c) { return c.cgId; });
        if (look.length) {
          plat = await platforms(look, function (i, n, slow) { step = !i ? (slow ? 'CoinGecko is busy — waiting a moment…' : 'Finding token contracts on CoinGecko…') : slow ? 'CoinGecko is busy — waiting a moment… ' + i + ' / ' + n : 'Finding token contracts on CoinGecko… ' + i + ' / ' + n; draw(); });
          failed = plat.__failed || []; delete plat.__failed; plat = withSaved(plat, held);
        }
        step = 'Reading balances from the blockchain…'; draw();
        await Promise.all(ws.filter(function (w) { return w.kind === 'evm'; }).map(async function (w) {
          try { take(w, await evmWallet(w, held, plat, errs)); }
          catch (e) { errs.push((w.label || KIND[w.kind]) + ' (' + short(w.addr) + ')'); }
        }));
      }
      if (info.jupFail) errs.push('Solana token names (Jupiter)');
      if (info.solTokFail) errs.push('Solana tokens (SOL itself was read)');
      // why a coin wasn't checked
      var why = {};
      held.forEach(function (c) {
        if (checked[c.sym]) return;
        var bs = c.cgId === 'bitcoin' || c.sym === 'BTC' ? 'btc' : c.cgId === 'solana' || c.sym === 'SOL' ? 'sol' : '';
        Object.keys(CHAIN).forEach(function (k) { if (c.cgId === CHAIN[k].id || CHAIN[k].syms.indexOf(c.sym) >= 0) bs = k; });
        why[c.sym] = unsure[c.sym] ? 'readfail' : bs && !kinds[bs] ? 'nowallet' : OWN.test(c.sym) ? 'own' : failed.indexOf(c.cgId) >= 0 ? 'busy' : !kinds.evm ? 'noevm' : !c.cgId ? 'unknown' : 'other';
      });
      // read on one chain, but another chain of the same coin couldn't be read → not "nothing there"
      Object.keys(unsure).forEach(function (sy) { if (checked[sy] && !(found[sy] && found[sy].q > 0)) { delete checked[sy]; why[sy] = 'readfail'; } });
      LAST = { at: new Date().toISOString(), found: found, checked: Object.keys(checked), why: why, errs: errs };
      lsPut(K.last, LAST);
      // coins with no network / place saved yet: what the check found is saved on them (never over yours)
      var fill = {};
      held.forEach(function (c) {
        var f = found[c.sym]; if (!f || !(f.q > 0)) return;
        var v = {}; if (!c.nets && f.nets && f.nets.length) v.nets = f.nets; if (!c.at.length) v.at = ['wallet'];
        if (Object.keys(v).length) fill[c.sym] = v;
      });
      if (Object.keys(fill).length && S().setCoinPlaces) S().setCoinPlaces(fill).catch(function () {});
    } finally { busy = false; step = ''; draw(); }
    return LAST;
  }
  // every coin you hold: wallet vs app (with today's numbers in the app, so a Reward you just added shows as matched)
  function compare(last) {
    last = last || LAST; if (!last) return null;
    var held = heldNow(), out = { more: [], less: [], same: [], none: [], cant: [], kept: [] }, ck = {};
    var away = function (c) { return c.at.filter(function (p) { return p !== 'wallet'; }); };
    (last.checked || []).forEach(function (s) { ck[s] = 1; });
    held.forEach(function (c) {
      if (!ck[c.sym]) {
        if (away(c).length && c.at.indexOf('wallet') < 0) { out.kept.push({ sym: c.sym, wallet: null, app: c.qty, rest: c.qty, places: away(c), usd: c.qty * (c.currentPrice || 0) }); return; }
        out.cant.push({ sym: c.sym, why: (last.why || {})[c.sym] || 'other' }); return;
      }
      var f = (last.found || {})[c.sym], w = f ? f.q : 0, a = c.qty, d = w - a, p = c.currentPrice || 0;
      var row = { sym: c.sym, wallet: w, app: a, diff: d, usd: d * p, where: f ? f.where : [], staked: f ? f.staked || 0 : 0 };
      var same = p > 0 ? Math.abs(d) * p < 0.5 : Math.abs(d) <= Math.max(a, w) * 1e-4;
      if (d < 0 && away(c).length && (!same || !(w > 0))) { row.rest = -d; row.places = away(c); row.usd = -row.usd; out.kept.push(row); return; }   // the rest is where you said: Binance, staked…
      if (!(w > 0)) out.none.push(row); else if (same) out.same.push(row); else if (d > 0) out.more.push(row); else out.less.push(row);
    });
    out.more.sort(function (x, y) { return y.usd - x.usd; }); out.less.sort(function (x, y) { return x.usd - y.usd; }); out.kept.sort(function (x, y) { return y.usd - x.usd; });
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
    '#cpWal .wl-kb{border:1px solid rgba(124,58,237,.5);color:inherit;font-family:inherit;cursor:pointer}' +
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
    '#cpWal .wl-acts{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px}#cpWal .wl-as{font-size:.76rem;opacity:.75;flex-basis:100%}' +
    '#cpWal .wl-btn2.rw.main{background:rgba(168,85,247,.16)}' +
    '#cpWal .wl-ok{color:#22c55e}[data-theme="light"] #cpWal .wl-ok{color:#16a34a}' +
    '#cpWal .wl-syms{font-size:.8rem;padding:10px 12px;line-height:1.6}' +
    '#cpWal .wl-chip{display:inline-flex;align-items:center;gap:4px;margin:0 4px 6px 0;padding:4px 9px;border-radius:8px;border:1px solid var(--border,rgba(148,163,184,.3));background:rgba(148,163,184,.08);color:inherit;font:inherit;font-size:.82rem;font-weight:800;cursor:pointer}#cpWal .wl-chip span{font-weight:500;opacity:.8}' +
    '#cpWal .wl-r .wl-chip{margin:0;font-size:.92rem}' +
    '#cpWal .wl-syms+.wl-syms{border-top:1px solid var(--border,rgba(148,163,184,.15))}' +
    '#cpWal .wl-warn{color:#f59e0b;font-size:.8rem;margin-top:6px}';

  var form = { addr: '', label: '', err: '' };
  function walletsHtml() {
    var ws = S().getWallets();
    var list = ws.length ? '<div class="wl-list">' + ws.map(function (w) {
      return '<div class="wl-w" data-id="' + E(w.id) + '"><span class="wl-t"><b>' + E(w.label || KIND[w.kind]) + '</b><code title="' + E(w.addr) + '">' + E(w.addr) + '</code></span>' +
        ((S().walletKinds ? S().walletKinds(w.addr) : []).length > 1
          ? '<button type="button" class="wl-k wl-kb" data-kind="' + E(w.id) + '" title="Wrong network? Tap to switch (' + E(S().walletKinds(w.addr).map(function (k) { return KIND[k]; }).join(' / ')) + ')">' + E(KIND[w.kind]) + ' ⇄</button>'
          : '<span class="wl-k">' + E(w.kind === 'evm' ? 'EVM' : KIND[w.kind]) + '</span>') +
        '<button type="button" class="wl-del" data-del="' + E(w.id) + '" aria-label="Remove ' + E(w.label || short(w.addr)) + '" title="Remove">' + IC('trash', { solo: true }) + '</button></div>';
    }).join('') + '</div>' : '<div class="wl-note">No wallet yet. Add the public address of each wallet you keep coins in (Tangem: tap the coin → Receive → copy).</div>';
    // addresses the import marked as "My wallet"
    var have = {}; ws.forEach(function (w) { have[w.addr.toLowerCase()] = 1; });
    var imp = lsGet('samsam_imp_addr', {}), sug = Object.keys(imp || {}).filter(function (a) { return imp[a] === 'mine' && !have[a.toLowerCase()] && S().walletKind(a); }).slice(0, 6);
    return list +
      '<div class="wl-add"><input id="wlAddr" placeholder="Paste a public address" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + E(form.addr) + '">' +
      '<input id="wlLabel" placeholder="Name (optional)" maxlength="30" value="' + E(form.label) + '">' +
      '<button type="button" class="wl-btn" id="wlAddBtn">' + IC('plus') + 'Add</button></div>' +
      '<div class="wl-err" id="wlErr" role="alert">' + E(form.err) + '</div>' +
      (form.pick ? '<div class="wl-pick" id="wlPick"><div class="wl-note">This address shape is used by ' + form.pick.kinds.map(function (k) { return KIND[k]; }).join(' and ') + ' — which network is it?</div><div class="wl-sug">' +
        form.pick.kinds.map(function (k) { return '<button type="button" class="wl-btn2" data-pick="' + k + '">' + E(KIND[k]) + '</button>'; }).join('') + '</div></div>' : '') +
      (sug.length ? '<div class="wl-note">From your imported withdrawals:</div><div class="wl-sug">' + sug.map(function (a) { return '<button type="button" class="wl-btn2" data-sug="' + E(a) + '">' + IC('plus') + E(KIND[S().walletKind(a)]) + ' ' + E(short(a)) + '</button>'; }).join('') + '</div>' : '') +
      '<div class="wl-note">Networks: Bitcoin · Solana (+ its tokens) · 0x… = Ethereum, Base, Optimism, Arbitrum, Linea, BNB Chain, Polygon, Avalanche, Sei EVM, Kava EVM, Cronos, Mantle, Moonbeam, Moonriver, Flare, Monad, Sonic, Celo, Gnosis (+ their tokens) · Robinhood Chain · TON (+ jettons like GRAM) · Sui / Aptos (you pick) · NEAR · Hedera (0.0.…) · Kaspa · Dogecoin · Cosmos · Sei · Kava. Staked coins are counted on Sui and the Cosmos family (NEAR staked in a pool isn’t).</div>' +
      '<div class="wl-note">' + IC('lock') + 'Public addresses only — never type your recovery phrase or private key anywhere.</div>';
  }
  function rowHtml(r, kind) {
    var nums = 'Wallets <b>' + qf(r.wallet) + '</b> · App <b>' + qf(r.app) + '</b>' + (r.where.length ? ' · ' + E(r.where.join(', ')) : '') + (r.staked > 0 ? ' · incl. <b>' + qf(r.staked) + '</b> staked' : '');
    var d = (r.diff > 0 ? '+' : '−') + qf(Math.abs(r.diff)) + ' ' + r.sym + (r.usd ? ' <small>(' + usd(Math.abs(r.usd)) + ')</small>' : '');
    var acts = '';
    if (kind === 'more') {
      // the extra coins as a $0 Reward — from Mining, Staking or Airdrop (a mined coin like BTC shows Mining first)
      var srcs = POW.indexOf(r.sym) >= 0 ? ['mining', 'staking', 'airdrop'] : ['staking', 'mining', 'airdrop'];
      acts = '<div class="wl-acts"><span class="wl-as">Add +' + qf(r.diff) + ' as</span>' +
        srcs.map(function (k, i) { return '<button type="button" class="wl-btn2 rw' + (i ? '' : ' main') + '" data-rw="' + E(r.sym) + '" data-src="' + k + '" data-q="' + r.diff + '">' + (i ? '' : IC('coins')) + SRC[k] + '</button>'; }).join('') +
        (window.CPAdd && CPAdd.openTx ? '<button type="button" class="wl-btn2" data-tin="' + E(r.sym) + '" data-q="' + r.diff + '">' + IC('arrowDown') + 'Transfer In…</button>' : '') + '</div>';
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
    var chip = function (sym, extra) { return '<button type="button" class="wl-chip" data-net="' + E(sym) + '" title="Network & where held">' + E(sym) + (extra ? ' <span>' + extra + '</span>' : '') + '</button>'; };
    h += sec('Wallet has more', c.more, 'more') + sec('App has more', c.less, 'less');
    if (c.kept.length) h += '<div class="wl-sec">Where you said (' + c.kept.length + ')</div><div class="wl-list" id="wlRes-kept">' + c.kept.map(function (r) {
      return '<div class="wl-r" data-sym="' + E(r.sym) + '"><div class="wl-top">' + chip(r.sym) + '<span class="wl-d wl-ok">' + IC('check') + E(r.places.map(placeName).join(' + ')) + '</span></div>' +
        '<div class="wl-nums">' + (r.wallet > 0 ? 'Wallets <b>' + qf(r.wallet) + '</b> + ' : r.wallet === null ? 'Not read here · ' : '') + E(r.places.map(placeName).join(' + ')) + ' <b>' + qf(r.rest) + '</b> = App <b>' + qf(r.app) + '</b></div></div>';
    }).join('') + '</div>';
    h += sec('Match', c.same, 'same');
    if (c.none.length) h += '<div class="wl-sec">Not in these wallets (' + c.none.length + ')</div><div class="wl-list"><div class="wl-syms" id="wlRes-none">' + c.none.map(function (r) { return chip(r.sym, qf(r.app)); }).join(' ') + '<div class="wl-note">On an exchange, staked, or in a wallet you haven’t added. Tap a coin to say where it is (Binance, Gate.io, staked…) or which network it’s on.</div></div></div>';
    if (c.cant.length) {
      var WHY = [['readfail', 'Their network didn’t answer this time — tap Check now again.'], ['busy', 'CoinGecko was busy, so these weren’t looked up yet — tap Check now again (what was found is remembered).'],
        ['noevm', 'Ethereum-type coins (ETH, LINK, ONDO, ARB, USDT on Ethereum…): add your 0x… address — the same one covers Ethereum, Base, Optimism, Arbitrum, BNB Chain, Polygon and Avalanche. Not there? Then they’re on another chain or an exchange.'],
        ['nowallet', 'Add the wallet address of their network to check these (Bitcoin, Solana, TON, Sui, Aptos, NEAR, Hedera, Kaspa, Dogecoin; Sei and Kava: their 0x… or sei1… / kava1… address).'],
        ['other', 'Not found on the networks of your wallets — tap the coin to pick its network (and paste its contract if it’s a token).'], ['unknown', 'Not linked to CoinGecko.'], ['own', 'Their own blockchain (can’t be read here).']];
      h += '<div class="wl-sec">Not checked (' + c.cant.length + ')</div><div class="wl-list" id="wlRes-cant">' + WHY.map(function (g) {
        var l = c.cant.filter(function (x) { return x.why === g[0]; }); if (!l.length) return '';
        return '<div class="wl-syms" data-why="' + g[0] + '">' + l.map(function (x) { return chip(x.sym); }).join(' ') + '<div class="wl-note">' + E(g[1]) + '</div></div>';
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
  async function addWallet(addr, label, pick) {
    addr = String(addr || '').trim(); form.err = ''; form.pick = null;
    var setIn = function (a, l) { if ($('wlAddr')) $('wlAddr').value = a; if ($('wlLabel') && l != null) $('wlLabel').value = l; };
    if (addr.split(/\s+/).length >= 8) { setIn(''); form.err = 'That looks like a recovery phrase — never type it anywhere. Only a public address goes here.'; draw(); return; }
    var kinds = S().walletKinds ? S().walletKinds(addr) : [S().walletKind(addr)].filter(Boolean), kind = kinds[0];
    if (!kind) { form.err = 'Not an address of a network the check can read (see the list below).'; draw(); return; }
    var ws = S().getWallets();
    if (ws.some(function (w) { return w.addr.toLowerCase() === addr.toLowerCase(); })) { form.err = 'Already in the list.'; draw(); return; }
    if (kinds.length > 1) {   // the same address shape on two networks (Sui / Aptos): ask which one
      if (kinds.indexOf(pick) < 0) { form.pick = { addr: addr, label: String(label || '').trim(), kinds: kinds }; draw(); return; }
      kind = pick;
    }
    ws.push({ id: 'w' + Date.now().toString(36), kind: kind, addr: addr, label: String(label || '').trim() });
    setIn('', '');
    try { await S().setWallets(ws); } catch (e) { form.err = 'Not saved — ' + ((e && e.message) || e); }
    draw();
  }
  async function switchKind(id) {   // Sui ⇄ Aptos
    var ws = S().getWallets(), w = ws.filter(function (x) { return x.id === id; })[0]; if (!w) return;
    var ks = S().walletKinds(w.addr); w.kind = ks[(ks.indexOf(w.kind) + 1) % ks.length];
    await S().setWallets(ws).catch(function () {}); draw();
  }
  async function removeWallet(id) {
    var ws = S().getWallets(), w = ws.filter(function (x) { return x.id === id; })[0]; if (!w) return;
    var ok = window.CPDialog ? await CPDialog.confirm('Remove ' + (w.label || KIND[w.kind]) + ' (' + short(w.addr) + ') from the check? Your coins and transactions are not touched.', { title: 'Remove wallet', okText: 'Remove', danger: true }) : true;
    if (!ok) return;
    await S().setWallets(ws.filter(function (x) { return x.id !== id; })).catch(function () {});
    draw();
  }
  var SRC = { mining: 'Mining', staking: 'Staking', airdrop: 'Airdrop' }, SRC_NOTE = { mining: 'Mining reward', staking: 'Staking reward', airdrop: 'Airdrop' };
  var POW = ['BTC', 'LTC', 'DOGE', 'KAS', 'BCH', 'ETC', 'XMR', 'ZEC', 'DASH', 'RVN', 'BSV', 'ERG'];   // coins that are mined, not staked
  async function addReward(sym, q, src) {
    if (!(q > 0)) return;
    src = SRC[src] ? src : 'staking';
    var ok = window.CPDialog ? await CPDialog.confirm('Add +' + qf(q) + ' ' + sym + ' as ' + (src === 'airdrop' ? 'an Airdrop' : 'a ' + SRC[src] + ' reward') + ' at $0 cost? Your holdings go up and the average buy price goes down.', { title: 'Add ' + SRC[src], okText: 'Add ' + SRC[src] }) : true;
    if (!ok) return;
    try { await S().addTx(sym, 'transfer_in', q, 0, SRC_NOTE[src] + ' · wallet check', { kind: 'reward', src: src }); }
    catch (e) { if (window.CPDialog) CPDialog.alert('Not saved — ' + ((e && e.message) || e)); }
    draw();
  }
  var unsub = null;
  function close() { var b = $('cpWal'); if (b) b.remove(); doc.removeEventListener('keydown', esc, true); if (unsub) { unsub(); unsub = null; } }
  function esc(e) { if (e.key === 'Escape' && !doc.querySelector('#cpDialog,#cpNet')) { e.stopPropagation(); close(); } }
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
      b = t.closest('[data-pick]'); if (b && form.pick) { addWallet(form.pick.addr, form.pick.label, b.dataset.pick); return; }
      b = t.closest('[data-kind]'); if (b) { switchKind(b.dataset.kind); return; }
      b = t.closest('[data-net]'); if (b) { editCoin(b.dataset.net); return; }
      if (t.closest('#wlCheck')) { check(); return; }
      b = t.closest('[data-rw]'); if (b) { addReward(b.dataset.rw, +b.dataset.q, b.dataset.src); return; }
      b = t.closest('[data-tin]'); if (b) { var sym = b.dataset.tin, q = +b.dataset.q; close(); CPAdd.openTx('transfer_in', sym, { qty: q, note: 'Found by the wallet check' }); }
    });
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.target.id === 'wlAddr' || e.target.id === 'wlLabel')) { e.preventDefault(); addWallet($('wlAddr').value, $('wlLabel').value); } });
    doc.addEventListener('keydown', esc, true);
    unsub = s.onChange(function () { if ($('cpWal') && !busy) draw(); });
    setTimeout(function () { var f = $('wlAddr'); if (f && !s.getWallets().length) f.focus(); }, 0);
  }
  // ── Network & where held (one coin) — also used by Add Coin before the coin exists (opts.onSave) ──
  var PLACES = [['wallet', 'Your wallet'], ['binance', 'Binance'], ['gate', 'Gate.io'], ['staked', 'Staked'], ['other', 'Other']];
  function placeName(p) { for (var i = 0; i < PLACES.length; i++) if (PLACES[i][0] === p) return PLACES[i][1]; return p; }
  var NATIVE_NETS = [['btc', 'Bitcoin'], ['sol', 'Solana'], ['ton', 'TON'], ['sui', 'Sui'], ['apt', 'Aptos'], ['near', 'NEAR'], ['hbar', 'Hedera'], ['kas', 'Kaspa'], ['doge', 'Dogecoin'], ['atom', 'Cosmos'], ['sei', 'Sei'], ['kava', 'Kava']];
  function allNets() { return NATIVE_NETS.concat(EVM.map(function (ch) { return ['evm:' + ch.k, ch.name]; })); }
  function netName(k) { var l = allNets().filter(function (x) { return x[0] === k; })[0]; return l ? l[1] : k; }
  function tokenable(k) { return k === 'sol' || k === 'ton' || k.indexOf('evm:') === 0; }
  function platToNet(pk) {
    if (pk === 'solana') return 'sol'; if (pk === 'the-open-network') return 'ton';
    var ch = EVM.filter(function (x) { return x.k === pk || (x.rx && x.rx.test(pk)); })[0]; return ch ? 'evm:' + ch.k : null;
  }
  function nativeNet(cgId, sym) {
    if (cgId === 'bitcoin' || sym === 'BTC') return 'btc'; if (cgId === 'solana' || sym === 'SOL') return 'sol';
    var k = Object.keys(CHAIN).filter(function (x) { return CHAIN[x].id === cgId || (!cgId && CHAIN[x].syms.indexOf(sym) >= 0); })[0]; if (k) return k;
    var ch = EVM.filter(function (x) { return x.id === cgId || (!cgId && x.syms.indexOf(sym) >= 0); })[0]; return ch ? 'evm:' + ch.k : null;
  }
  // the networks CoinGecko knows for a coin: [{ k, c }] — the coin's own network first
  function suggest(cgId, sym, platforms) {
    var out = [], nn = nativeNet(cgId, sym); if (nn) out.push({ k: nn, c: '' });
    var P = platforms || {};
    if (!platforms && cgId) { var pc = lsGet(K.plat, {})[cgId]; if (pc && pc.p) Object.keys(pc.p).forEach(function (k) { P[k] = pc.p[k][0]; }); }
    Object.keys(P).forEach(function (pk) {
      var v = P[pk], c = String(v && typeof v === 'object' ? v.contract_address || '' : v || '').trim(), k = platToNet(pk);
      if (k && c && !out.some(function (x) { return x.k === k; })) out.push({ k: k, c: c });
    });
    return out;
  }
  function coinDoc(sym) { var st = S() && S().getState ? S().getState() : null; return st ? (st.coins || []).filter(function (d) { return d.sym === sym; })[0] || null : null; }
  function placeText(sym) {
    var d = coinDoc(sym) || {}, n = (d.nets || []).map(function (x) { return netName(x.k); }), a = (d.at || []).map(placeName);
    return [n.join(', '), a.join(' + ')].filter(Boolean).join(' · ');
  }
  var ed = null;   // { sym, cgId, nets, at, opts, sug, list }
  var ECSS =
    '#cpNet{position:fixed;inset:0;z-index:100100;background:rgba(2,6,23,.55);display:flex;align-items:flex-end;justify-content:center}' +
    '@media (min-width:640px){#cpNet{align-items:center;padding:16px}}' +
    '#cpNet .nt-box{width:min(480px,100%);max-height:92vh;overflow:auto;background:var(--card-solid,var(--bg2,#111827));color:var(--fg,#e5e7eb);border:1px solid var(--border,#374151);border-radius:18px 18px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));font:14px/1.45 system-ui,-apple-system,"Inter",sans-serif;box-sizing:border-box}' +
    '@media (min-width:640px){#cpNet .nt-box{border-radius:18px}}' +
    '#cpNet .nt-h{display:flex;align-items:center;gap:10px;margin-bottom:6px}#cpNet .nt-h b{flex:1;font-size:1.02rem}' +
    '#cpNet .nt-x{background:none;border:none;color:inherit;opacity:.7;cursor:pointer;padding:6px;line-height:0}' +
    '#cpNet .nt-sec{margin:14px 0 6px;font-size:.72rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--fg2,#94a3b8)}' +
    '#cpNet .nt-note{font-size:.78rem;color:var(--fg2,#94a3b8);margin:4px 0}' +
    '#cpNet .nt-row{display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--border,rgba(148,163,184,.2));border-radius:11px;margin-bottom:6px;cursor:pointer}' +
    '#cpNet .nt-row[aria-checked="true"]{border-color:#7c3aed;background:rgba(124,58,237,.1)}' +
    '#cpNet .nt-row .nt-t{flex:1;min-width:0;display:flex;flex-direction:column}#cpNet .nt-row b{font-size:.88rem}#cpNet .nt-row small{font-weight:500;opacity:.75}' +
    '#cpNet .nt-row code{font-size:.72rem;color:var(--fg2,#94a3b8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#cpNet .nt-box2{width:18px;height:18px;border-radius:5px;border:2px solid var(--border,rgba(148,163,184,.5));flex:none;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box}' +
    '#cpNet .nt-row[aria-checked="true"] .nt-box2{background:#7c3aed;border-color:#7c3aed;color:#fff}#cpNet .nt-box2 .ss-ic{margin:0;width:12px;height:12px}' +
    '#cpNet .nt-add{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}#cpNet select,#cpNet input{flex:1 1 140px;min-width:0;box-sizing:border-box;padding:9px 10px;border-radius:10px;border:1px solid var(--border,rgba(148,163,184,.3));background:var(--card-solid,rgba(148,163,184,.08));color:inherit;font:inherit;font-size:.84rem}' +
    '#cpNet .nt-pl{display:flex;gap:6px;flex-wrap:wrap}#cpNet .nt-pl button{border:1px solid var(--border,rgba(148,163,184,.35));background:transparent;color:inherit;font:inherit;font-size:.82rem;font-weight:700;padding:7px 12px;border-radius:999px;cursor:pointer}' +
    '#cpNet .nt-pl button[aria-pressed="true"]{background:#7c3aed;border-color:#7c3aed;color:#fff}' +
    '#cpNet .nt-btn{border:none;border-radius:10px;padding:9px 14px;font:inherit;font-size:.84rem;font-weight:700;cursor:pointer;background:#7c3aed;color:#fff;display:inline-flex;align-items:center;justify-content:center;gap:6px}' +
    '#cpNet .nt-btn2{border:1px solid var(--border,rgba(148,163,184,.35));border-radius:10px;padding:9px 12px;font:inherit;font-size:.82rem;font-weight:700;cursor:pointer;background:transparent;color:inherit}' +
    '#cpNet .nt-save{width:100%;margin-top:16px;padding:12px}#cpNet .nt-err{color:#f87171;font-size:.8rem;min-height:1em;margin-top:4px}[data-theme="light"] #cpNet .nt-err{color:#dc2626}';
  function same2(a, b) { return a.k === b.k && String(a.c).toLowerCase() === String(b.c).toLowerCase(); }
  function edDraw() {
    var el = $('cpNet'); if (!el || !ed) return;
    var sel = function (n) { return ed.nets.some(function (x) { return same2(x, n); }); };
    var list = ed.sug.slice(); ed.nets.forEach(function (n) { if (!list.some(function (x) { return same2(x, n); })) list.push(n); });
    ed.list = list;
    el.querySelector('.nt-body').innerHTML =
      '<div class="nt-sec">Network</div>' +
      (list.length ? list.map(function (n, i) {
        return '<div class="nt-row" role="checkbox" tabindex="0" data-i="' + i + '" aria-checked="' + sel(n) + '"><span class="nt-box2">' + (sel(n) ? IC('check', { solo: true }) : '') + '</span>' +
          '<span class="nt-t"><b>' + E(netName(n.k)) + (n.c ? '' : ' <small>(its own coin)</small>') + '</b>' + (n.c ? '<code title="' + E(n.c) + '">' + E(n.c) + '</code>' : '') + '</span></div>';
      }).join('') : '<div class="nt-note">CoinGecko doesn’t list a network for it — add it below.</div>') +
      '<div class="nt-note">Another network (e.g. Robinhood Chain): pick it and paste the token contract (from the explorer or your wallet app):</div>' +
      '<div class="nt-add"><select id="ntNet" aria-label="Network"><option value="">Network…</option>' + allNets().map(function (x) { return '<option value="' + E(x[0]) + '">' + E(x[1]) + '</option>'; }).join('') + '</select>' +
      '<input id="ntCon" aria-label="Token contract" placeholder="Token contract (empty = its own coin)" autocomplete="off" spellcheck="false"><button type="button" class="nt-btn2" id="ntAdd">' + IC('plus') + 'Add</button></div>' +
      '<div class="nt-err" id="ntErr" role="alert"></div>' +
      '<div class="nt-sec">Where you keep it</div><div class="nt-pl" role="group" aria-label="Where you keep it">' +
      PLACES.map(function (p) { return '<button type="button" data-pl="' + p[0] + '" aria-pressed="' + (ed.at.indexOf(p[0]) >= 0) + '">' + E(p[1]) + '</button>'; }).join('') + '</div>' +
      '<div class="nt-note">The wallet check reads the coin on the networks you tick, and counts the rest as held where you said.</div>' +
      '<button type="button" class="nt-btn nt-save" id="ntSave">' + IC('check') + (ed.opts.saveText || 'Save') + '</button>';
  }
  function editCoin(sym, opts) {
    opts = opts || {}; sym = String(sym || '').toUpperCase(); if (!sym) return;
    var d = coinDoc(sym) || {}, ids = (window.SamsamCoins && SamsamCoins.CG_IDS) || {}, cg = opts.cgId || d.cgId || ids[sym] || '';
    var nets = opts.nets || (Array.isArray(d.nets) && d.nets.length ? d.nets : null), at = opts.at || (Array.isArray(d.at) ? d.at : []);
    var sug = suggest(cg, sym, opts.platforms);
    if (!nets) { var f = LAST && LAST.found && LAST.found[sym]; nets = f && f.nets && f.nets.length ? f.nets.slice() : sug.length === 1 ? sug.slice() : []; }
    ed = { sym: sym, cgId: cg, nets: nets.map(function (n) { return { k: n.k, c: n.c || '' }; }), at: at.slice(), opts: opts, sug: sug, list: [] };
    if (!$('ntCss')) { var st = doc.createElement('style'); st.id = 'ntCss'; st.textContent = ECSS; doc.head.appendChild(st); }
    var old = $('cpNet'); if (old) old.remove();
    var el = doc.createElement('div'); el.id = 'cpNet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Network and where held — ' + sym);
    el.innerHTML = '<div class="nt-box"><div class="nt-h">' + IC('link') + '<b>Network &amp; where held — ' + E(sym) + '</b><button type="button" class="nt-x" aria-label="Close">' + IC('x') + '</button></div><div class="nt-body"></div></div>';
    doc.body.appendChild(el); edDraw();
    var toggle = function (i) {
      var n = ed.list[+i]; if (!n) return; var j = -1;
      ed.nets.forEach(function (x, k) { if (same2(x, n)) j = k; });
      if (j >= 0) ed.nets.splice(j, 1); else ed.nets.push({ k: n.k, c: n.c }); edDraw();
    };
    el.addEventListener('click', function (e) {
      var t = e.target;
      if (t === el || t.closest('.nt-x')) { edClose(); return; }
      var r = t.closest('.nt-row'); if (r) { toggle(r.dataset.i); return; }
      var pl = t.closest('[data-pl]'); if (pl) { var k = pl.dataset.pl, i = ed.at.indexOf(k); if (i >= 0) ed.at.splice(i, 1); else ed.at.push(k); edDraw(); return; }
      if (t.closest('#ntAdd')) {
        var k2 = $('ntNet').value, c2 = $('ntCon').value.trim(), er = $('ntErr');
        if (!k2) { er.textContent = 'Pick the network first.'; return; }
        if (c2 && !tokenable(k2)) { er.textContent = netName(k2) + ' tokens can’t be read here — leave the contract empty for its own coin.'; return; }
        if (c2 && k2.indexOf('evm:') === 0 && !/^0x[0-9a-fA-F]{40}$/.test(c2)) { er.textContent = 'An EVM token contract is 0x followed by 40 letters / digits.'; return; }
        if (c2 && !/^[A-Za-z0-9:_-]{20,120}$/.test(c2)) { er.textContent = 'That doesn’t look like a contract address.'; return; }
        if (!ed.nets.some(function (x) { return same2(x, { k: k2, c: c2 }); })) ed.nets.push({ k: k2, c: c2 });
        edDraw(); return;
      }
      if (t.closest('#ntSave')) {
        var v = { nets: ed.nets.slice(), at: PLACES.map(function (p) { return p[0]; }).filter(function (p) { return ed.at.indexOf(p) >= 0; }) }, o = ed.opts, sy = ed.sym;
        edClose();
        if (o.onSave) { o.onSave(v); return; }
        if (S() && S().updateCoin) S().updateCoin(sy, { nets: v.nets, at: v.at }).then(function () { if ($('cpWal')) draw(); }).catch(function () {});
      }
    });
    el.addEventListener('keydown', function (e) { var r = e.target.closest && e.target.closest('.nt-row'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(r.dataset.i); } });
    doc.addEventListener('keydown', edEsc, true);
  }
  function edEsc(e) { if (e.key === 'Escape' && $('cpNet') && !doc.querySelector('#cpDialog')) { e.stopPropagation(); edClose(); } }
  function edClose() { var b = $('cpNet'); if (b) b.remove(); ed = null; doc.removeEventListener('keydown', edEsc, true); }

  window.SamsamWallets = { open: open, close: close, check: check, compare: compare, last: function () { return LAST; }, _cfg: CFG, _units: units, _own: OWN,
    editCoin: editCoin, closeCoin: edClose, suggest: suggest, placeText: placeText, netName: netName, placeName: placeName };
})();
