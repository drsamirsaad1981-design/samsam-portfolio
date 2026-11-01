// samsam-market.js — Market Hub data (no API keys): CoinGecko public API + alternative.me Fear & Greed.
//   SamsamMarket.global()        → { mcap, mcapCh24, vol, dom: { btc, eth, usdt }, coins, t }
//   SamsamMarket.fng()           → { value, label, prev, t }
//   SamsamMarket.top()           → top 100 coins by market cap (price, 24h %, 30d %, 7d sparkline)
//   SamsamMarket.byIds(ids)      → the same rows for any CoinGecko ids (your watchlist)
//   SamsamMarket.altSeason(rows) → { value 0–100, label, n } — share of the top-50 coins (no stablecoins /
//                                   wrapped / staked) that beat BTC over 30 days
// Everything is cached for a few minutes in this browser (shared by the Home card and the Market tab), so the
// free CoinGecko limit is never hit and the page opens instantly with the last numbers.
(function () {
  if (window.SamsamMarket) return;
  var CG = 'https://api.coingecko.com/api/v3';
  var TTL = { global: 3 * 60e3, top: 3 * 60e3, ids: 3 * 60e3, fng: 30 * 60e3 };
  var mem = {}, inflight = {};
  function get(k) {
    if (mem[k]) return mem[k];
    try { var v = JSON.parse(localStorage.getItem('samsam_mkt_' + k)); if (v && v.t) return (mem[k] = v); } catch (_) {}
    return null;
  }
  function put(k, data) {
    var v = { t: Date.now(), data: data }; mem[k] = v;
    try { localStorage.setItem('samsam_mkt_' + k, JSON.stringify(v)); } catch (_) {}
    return v;
  }
  // cached(key, ttl, loader, force): fresh cache → it; otherwise load (one request at a time per key);
  // on failure fall back to the last numbers we had, marked stale.
  function cached(k, ttl, load, force) {
    var c = get(k);
    if (c && !force && Date.now() - c.t < ttl) return Promise.resolve({ data: c.data, t: c.t, stale: false });
    if (inflight[k]) return inflight[k];
    var p = load().then(function (d) { var v = put(k, d); return { data: v.data, t: v.t, stale: false }; }, function (e) {
      if (c) return { data: c.data, t: c.t, stale: true, error: e };
      throw e;
    });
    inflight[k] = p; p.then(function () { delete inflight[k]; }, function () { delete inflight[k]; });
    return p;
  }
  function json(url) {
    return fetch(url).then(function (r) {
      if (r.status === 429) { var e = new Error('CoinGecko is busy (free limit) — showing the last numbers, retrying soon.'); e.rate = true; throw e; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, function () { throw new Error(navigator.onLine === false ? 'You are offline.' : 'Network error.'); });
  }
  function row(c) {
    var sp = (c.sparkline_in_7d && c.sparkline_in_7d.price) || [];
    // keep ~42 points (every 4th hour) — enough for a mini chart, small to cache
    var step = Math.max(1, Math.floor(sp.length / 42)), s = [];
    for (var i = 0; i < sp.length; i += step) s.push(+(+sp[i]).toPrecision(6));
    if (sp.length && (sp.length - 1) % step) s.push(+(+sp[sp.length - 1]).toPrecision(6));
    return {
      id: c.id, sym: String(c.symbol || '').toUpperCase(), name: c.name || '', img: c.image || '', rank: c.market_cap_rank || null,
      price: c.current_price, mcap: c.market_cap, vol: c.total_volume,
      ch24: c.price_change_percentage_24h_in_currency != null ? c.price_change_percentage_24h_in_currency : c.price_change_percentage_24h,
      ch30: c.price_change_percentage_30d_in_currency, spark: s
    };
  }
  var MK = CG + '/coins/markets?vs_currency=usd&sparkline=true&price_change_percentage=24h%2C30d';
  var API = {
    global: function (force) {
      return cached('global', TTL.global, function () {
        return json(CG + '/global').then(function (j) {
          var d = j && j.data; if (!d || !d.total_market_cap) throw new Error('No market data');
          var p = d.market_cap_percentage || {};
          return { mcap: d.total_market_cap.usd, vol: (d.total_volume || {}).usd, mcapCh24: d.market_cap_change_percentage_24h_usd,
            dom: { btc: p.btc || 0, eth: p.eth || 0, usdt: p.usdt || 0 }, coins: d.active_cryptocurrencies || null };
        });
      }, force);
    },
    fng: function (force) {
      return cached('fng', TTL.fng, function () {
        return json('https://api.alternative.me/fng/?limit=2').then(function (j) {
          var a = (j && j.data) || []; if (!a.length) throw new Error('No Fear & Greed data');
          return { value: +a[0].value, label: a[0].value_classification, prev: a[1] ? +a[1].value : null };
        });
      }, force);
    },
    top: function (force) {
      return cached('top', TTL.top, function () {
        return json(MK + '&order=market_cap_desc&per_page=100&page=1').then(function (a) { return (a || []).map(row); });
      }, force);
    },
    byIds: function (ids, force) {
      ids = (ids || []).filter(Boolean).slice(0, 200); if (!ids.length) return Promise.resolve({ data: [], t: Date.now(), stale: false });
      var key = 'ids_' + ids.slice().sort().join(',').slice(0, 300);
      return cached(key, TTL.ids, function () {
        return json(MK + '&ids=' + ids.map(encodeURIComponent).join('%2C') + '&per_page=250&page=1').then(function (a) { return (a || []).map(row); });
      }, force);
    },
    search: function (q) {
      return json(CG + '/search?query=' + encodeURIComponent(q)).then(function (j) {
        return ((j && j.coins) || []).slice(0, 12).map(function (c) { return { id: c.id, sym: String(c.symbol || '').toUpperCase(), name: c.name, rank: c.market_cap_rank, img: c.large || c.thumb || '' }; });
      });
    },
    // not counted: stablecoins, wrapped / bridged / staked copies, exchange-backed USD tokens, BTC itself
    isExcluded: function (c) {
      var s = c.sym, n = (c.name || '').toLowerCase(), id = c.id || '';
      if (id === 'bitcoin') return true;
      if (/^(USDT|USDC|DAI|FDUSD|USDE|TUSD|PYUSD|USDS|BUSD|USD1|RLUSD|FRAX|USDD|GUSD|EURC|USDX|USDF|USDG|USDTB|BFUSD|SUSDE|SUSDS|USD0|LUSD|CRVUSD|GHO|XAUT|PAXG|BSC-USD)$/.test(s)) return true;
      if (/wrapped|bridged|staked|restaked|liquid staking|binance-peg|\busd\b|dollar|tether gold|pax gold/.test(n)) return true;
      if (/^(W|ST|WST|CB|R|WE|M|B|J|S|O)?(BTC|ETH|SOL|BNB)$/.test(s) && !/^(BTC|ETH|SOL|BNB)$/.test(s)) return true;   // wBTC, stETH, cbBTC, rETH, weETH, mSOL, JitoSOL…
      if (/staked-|wrapped-|-staked|bridged-|-bridged/.test(id)) return true;
      return false;
    },
    altSeason: function (rows) {
      var btc = (rows || []).filter(function (c) { return c.id === 'bitcoin'; })[0];
      if (!btc || btc.ch30 == null) return null;
      var alts = rows.filter(function (c) { return !API.isExcluded(c) && c.ch30 != null; }).slice(0, 50);
      if (alts.length < 20) return null;
      var beat = alts.filter(function (c) { return c.ch30 > btc.ch30; }).length;
      var v = Math.round(beat / alts.length * 100);
      return { value: v, n: alts.length, beat: beat, btc30: btc.ch30, label: v >= 75 ? 'Altcoin Season' : v <= 25 ? 'Bitcoin Season' : v >= 50 ? 'Leaning Altcoins' : 'Leaning Bitcoin' };
    },
    fngColor: function (v) { return v < 25 ? '#ef4444' : v < 45 ? '#f97316' : v <= 55 ? '#eab308' : v <= 75 ? '#84cc16' : '#22c55e'; },
    fmtBig: function (v) {
      if (!(v > 0)) return '—';
      if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
      if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
      if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
      if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
      return '$' + v.toFixed(0);
    },
    // a tiny line chart (SVG string); green when the period ended up, red when down
    spark: function (pts, w, h) {
      w = w || 96; h = h || 32;
      if (!pts || pts.length < 2) return '<svg class="mk-spark" width="' + w + '" height="' + h + '" aria-hidden="true"></svg>';
      var mn = Math.min.apply(null, pts), mx = Math.max.apply(null, pts), r = mx - mn || 1, n = pts.length - 1;
      var d = pts.map(function (v, i) { return (i ? 'L' : 'M') + (i / n * (w - 2) + 1).toFixed(1) + ' ' + (h - 2 - (v - mn) / r * (h - 4)).toFixed(1); }).join('');
      var up = pts[n] >= pts[0], col = up ? '#22c55e' : '#ef4444';
      return '<svg class="mk-spark" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true" preserveAspectRatio="none">' +
        '<path d="' + d + 'L' + (w - 1) + ' ' + h + 'L1 ' + h + 'Z" fill="' + col + '" opacity=".12"/><path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>';
    }
  };
  window.SamsamMarket = API;
})();
