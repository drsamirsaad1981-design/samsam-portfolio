// samsam-market.js — Market Hub data (no API keys): CoinGecko public API; Fear & Greed and the Altcoin Season Index are
// CoinMarketCap's own (saved by GitHub with the snapshot), alternative.me's Fear & Greed only as a fallback.
//   SamsamMarket.global()        → { mcap, mcapCh24, vol, dom: { btc, eth, usdt }, coins, t }
//   SamsamMarket.fng()           → { value, label, prev, t }
//   SamsamMarket.top()           → top 150 coins by market cap (the page shows 100 without stablecoins) (price, 24h %, 30d %, 7d + 24h sparklines)
//   SamsamMarket.byIds(ids)      → the same rows for any CoinGecko ids (your watchlist)
//   SamsamMarket.altSeason(rows) → { value 0–100, label, n } — share of the top-50 coins (no stablecoins /
//                                   wrapped / staked) that beat BTC over 30 days
// Everything is cached for a few minutes in this browser (shared by the Home card and the Market tab).
// Behind that sits a market snapshot saved by GitHub every ~30 minutes (tools/update-market.mjs → prices branch,
// read from raw.githubusercontent.com — no limit). CoinGecko's free API is only a live top-up: when it is busy
// (free limit) or unreachable, the app waits a couple of minutes before asking again and quietly shows the newest
// numbers it has (snapshot or last live answer) with their time — never an error while there are numbers to show.
(function () {
  if (window.SamsamMarket) return;
  var CG = 'https://api.coingecko.com/api/v3';
  var TTL = { global: 3 * 60e3, top: 3 * 60e3, ids: 3 * 60e3, fng: 30 * 60e3 };
  var mem = {}, inflight = {};
  // the last 24 hours of a coin (hourly); older saved rows only have the 7-day line → its last day (~7 points)
  function day(c) { return c.spark24 && c.spark24.length > 1 ? c.spark24 : (c.spark || []).slice(-7); }
  var SNAP = window.__marketSnap || (function () {
    var m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname), repo = location.pathname.split('/')[1];
    return 'https://raw.githubusercontent.com/' + (m ? m[1] : 'drsamirsaad1981-design') + '/' + (m && repo ? repo : 'samsam-portfolio') + '/prices/m/market.json';
  })();
  var COOL = 2 * 60e3;   // after CoinGecko says no, wait this long before asking it again (all pages share it)
  function coolUntil() { try { return +localStorage.getItem('samsam_mkt_cool') || 0; } catch (_) { return 0; } }
  function cool() { try { localStorage.setItem('samsam_mkt_cool', String(Date.now() + COOL)); } catch (_) {} }
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
  // cached(key, ttl, loader, force, backup): fresh cache → it; otherwise load (one request at a time per key);
  // on failure: the newest of the last numbers we had and backup() (the GitHub snapshot), marked stale.
  function cached(k, ttl, load, force, backup) {
    var c = get(k);
    if (c && !force && Date.now() - c.t < ttl) return Promise.resolve({ data: c.data, t: c.t, stale: false });
    if (inflight[k]) return inflight[k];
    var p = load().then(function (d) { var v = put(k, d); return { data: v.data, t: v.t, stale: false }; }, function (e) {
      return Promise.resolve(backup ? backup().catch(function () { return null; }) : null).then(function (b) {
        var best = c && (!b || c.t >= b.t) ? c : b;
        if (best) return { data: best.data, t: best.t, stale: true, error: e, source: best === c ? 'cache' : 'snapshot' };
        throw e;
      });
    });
    inflight[k] = p; p.then(function () { delete inflight[k]; }, function () { delete inflight[k]; });
    return p;
  }
  function json(url) {
    return fetch(url).then(function (r) {
      if (r.status === 429) { var e = new Error('CoinGecko is busy (free limit).'); e.rate = true; throw e; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, function () {
      // CoinGecko's "too many requests" answer has no CORS header, so the browser reports it as a network error
      var e = new Error(navigator.onLine === false ? 'You are offline.' : 'CoinGecko is busy (free limit).'); e.rate = navigator.onLine !== false; throw e;
    });
  }
  // a live CoinGecko call — skipped while cooling down after a refusal (the snapshot / last numbers are used)
  function live(url) {
    if (Date.now() < coolUntil()) { var e = new Error('CoinGecko is busy (free limit).'); e.rate = true; e.cooling = true; return Promise.reject(e); }
    return json(url).catch(function (e) { cool(); throw e; });
  }
  // the GitHub snapshot (every ~30 min); kept 5 minutes in memory
  var snapMem = null;
  function snapshot() {
    if (snapMem && Date.now() - snapMem.at < 5 * 60e3) return snapMem.p;
    var p = fetch(SNAP, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { if (!j || !j.updated) throw new Error('No snapshot'); j.t = Date.parse(j.updated) || 0; return j; });
    snapMem = { at: Date.now(), p: p }; p.catch(function () { snapMem = null; });
    return p;
  }
  function snapPart(name) {
    return function () {
      return snapshot().then(function (j) {
        var v = j[name]; if (!v || (Array.isArray(v) && !v.length)) return null;
        return { data: v, t: Date.parse((j.parts && j.parts[name]) || j.updated) || j.t };
      });
    };
  }
  function row(c) {
    var sp = (c.sparkline_in_7d && c.sparkline_in_7d.price) || [];
    // keep ~42 points (every 4th hour) — enough for a mini chart, small to cache
    var step = Math.max(1, Math.floor(sp.length / 42)), s = [];
    for (var i = 0; i < sp.length; i += step) s.push(+(+sp[i]).toPrecision(6));
    if (sp.length && (sp.length - 1) % step) s.push(+(+sp[sp.length - 1]).toPrecision(6));
    var d1 = sp.slice(-25).map(function (v) { return +(+v).toPrecision(6); });   // last 24 hours, hourly (phone chart)
    return {
      id: c.id, sym: String(c.symbol || '').toUpperCase(), name: c.name || '', img: c.image || '', rank: c.market_cap_rank || null,
      price: c.current_price, mcap: c.market_cap, vol: c.total_volume,
      ch24: c.price_change_percentage_24h_in_currency != null ? c.price_change_percentage_24h_in_currency : c.price_change_percentage_24h,
      ch7: c.price_change_percentage_7d_in_currency != null ? c.price_change_percentage_7d_in_currency : null,
      ch30: c.price_change_percentage_30d_in_currency, spark: s, spark24: d1
    };
  }
  var MK = CG + '/coins/markets?vs_currency=usd&sparkline=true&price_change_percentage=24h%2C7d%2C30d';
  var API = {
    global: function (force) {
      return cached('global', TTL.global, function () {
        return live(CG + '/global').then(function (j) {
          var d = j && j.data; if (!d || !d.total_market_cap) throw new Error('No market data');
          var p = d.market_cap_percentage || {};
          return { mcap: d.total_market_cap.usd, vol: (d.total_volume || {}).usd, mcapCh24: d.market_cap_change_percentage_24h_usd,
            dom: { btc: p.btc || 0, eth: p.eth || 0, usdt: p.usdt || 0 }, coins: d.active_cryptocurrencies || null };
        });
      }, force, snapPart('global')).then(function (r) {
        // CoinMarketCap's numbers (the ones most sites show), saved by GitHub with the snapshot every ~30 min: dominance as
        // saved (it moves slowly); the total market cap, volume and 24h change moved live by how much CoinGecko's moved since
        return snapshot().then(function (j) {
          var sg = j && j.global, at = Date.parse((j.parts && (j.parts.dom || j.parts.global)) || j.updated) || 0;
          if (!r || !r.data || !sg || sg.src !== 'cmc' || Date.now() - at > 3 * 3600e3) return r;
          var d = r.data, out = Object.assign({}, d, { dom: sg.dom || d.dom, domTop: sg.domTop || null, domSrc: sg.domSrc || null, src: 'cmc' });
          var cg = sg.cg || {};
          if (d === sg || d.src === 'cmc' || !(cg.mcap > 0) || !(d.mcap > 0)) { out.mcap = sg.mcap; out.vol = sg.vol; out.mcapCh24 = sg.mcapCh24; }   // (the snapshot itself)
          else {
            var k = d.mcap / cg.mcap;   // how CoinGecko's total moved since the snapshot
            out.mcap = sg.mcap * k;
            out.vol = cg.vol > 0 && d.vol > 0 ? sg.vol * (d.vol / cg.vol) : sg.vol;
            out.mcapCh24 = sg.mcapCh24 != null ? ((1 + sg.mcapCh24 / 100) * k - 1) * 100 : d.mcapCh24;
          }
          return { data: out, t: r.t, stale: r.stale };
        }, function () { return r; });
      });
    },
    // Fear & Greed: CoinMarketCap's (the number CoinMarketCap and Binance show), saved by GitHub with each snapshot (every
    // ~30 min; when CoinMarketCap is busy the snapshot keeps its last one up to 6 h). alternative.me's only past that.
    fng: function (force) {
      return snapPart('fng')().catch(function () { return null; }).then(function (s) {
        if (s && s.data && s.data.src === 'cmc' && Date.now() - (Date.parse(s.data.at) || s.t) < 6.5 * 3600e3) return { data: s.data, t: s.t, stale: false };   // CoinMarketCap's, up to ~6 h old (it moves slowly)
        return API._fngLive(force);
      });
    },
    _fngLive: function (force) {
      return cached('fng', TTL.fng, function () {
        return json('https://api.alternative.me/fng/?limit=8').then(function (j) {
          var a = (j && j.data) || []; if (!a.length) throw new Error('No Fear & Greed data');
          return { value: +a[0].value, label: a[0].value_classification, prev: a[1] ? +a[1].value : null, week: a[7] ? +a[7].value : null };
        });
      }, force, snapPart('fng'));
    },
    top: function (force) {
      return cached('top', TTL.top, function () {
        // 150, so the list still has 100 coins after the stablecoins are left out
        return live(MK + '&order=market_cap_desc&per_page=150&page=1').then(function (a) { return (a || []).map(row); });
      }, force, snapPart('top'));
    },
    byIds: function (ids, force) {
      ids = (ids || []).filter(Boolean).slice(0, 200); if (!ids.length) return Promise.resolve({ data: [], t: Date.now(), stale: false });
      var key = 'ids_' + ids.slice().sort().join(',').slice(0, 300);
      return cached(key, TTL.ids, function () {
        return live(MK + '&ids=' + ids.map(encodeURIComponent).join('%2C') + '&per_page=250&page=1').then(function (a) { return (a || []).map(row); });
      }, force, function () {   // watched coins that are in the Top 100 (snapshot or last list) still get numbers
        var c = get('top');
        return snapPart('top')().catch(function () { return null; }).then(function (s) {
          var src = c && (!s || c.t >= s.t) ? c : s; if (!src) return null;
          var rows = src.data.filter(function (r) { return ids.indexOf(r.id) >= 0; });
          return rows.length ? { data: rows, t: src.t } : null;
        });
      });
    },
    // Altcoin Season the CoinMarketCap way (top 100 vs BTC, 90 days), worked out by GitHub with each snapshot.
    // Resolves null while its 90-day history is still filling — the page then uses altSeason(rows) (30 days).
    alt90: function () {
      return snapshot().then(function (j) { var a = j.alt; return a && a.ready && a.value != null ? a : null; }, function () { return null; });
    },
    // The Altcoin Season page's data (m/alt.json, written by GitHub with each snapshot): a year of the index, ETH/BTC,
    // the top 100 coins' 7 / 30 / 90-day change. Kept in this browser for 10 minutes; the last copy is used offline.
    altPage: function (force) {
      var k = 'samsam_mkt_altpage', c = null;
      try { c = JSON.parse(localStorage.getItem(k)); } catch (_) {}
      if (c && c.data && !force && Date.now() - c.t < 10 * 60e3) return Promise.resolve(c.data);
      return fetch(SNAP.replace(/market\.json$/, 'alt.json'), { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) { if (!j || !j.updated) throw new Error('No data'); try { localStorage.setItem(k, JSON.stringify({ t: Date.now(), data: j })); } catch (_) {} return j; },
          function (e) { if (c && c.data) return c.data; throw e; });
    },
    // Coins 101–500 (m/top500.json, saved by GitHub every ~30 min) — read only when the list is set to Top 200…500
    top500: function (force) {
      if (!force && mem.top500 && Date.now() - mem.top500.t < 10 * 60e3) return Promise.resolve(mem.top500.data);
      return fetch(SNAP.replace(/market\.json$/, 'top500.json'), { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) { if (!j || !Array.isArray(j.top)) throw new Error('No data'); j.t = Date.parse(j.updated) || Date.now(); mem.top500 = { t: Date.now(), data: j }; return j; },
          function (e) { if (mem.top500) return mem.top500.data; throw e; });
    },
    // When CoinGecko is busy: fresher prices from Binance's public market data (no key) for coins it trades against
    // USDT. 24h % is worked out from the saved row (its price 24 h ago) and the new price. A coin is only touched
    // when Binance's price is within 25% of the saved one (tickers are reused by different coins). Returns how many.
    // Live prices every few seconds from Binance's public market data (no key) for the coins you hold that trade against
    // USDT: { SYM: price }. The first call learns which USDT pairs exist (once a session); then only those are asked for.
    // Which coins trade against USDT on Binance: the full list (thousands of pairs) is downloaded once a day per device
    // and kept here (just the tickers), not on every page open. → Promise of { SYM: 1 }
    bnPairs: function () {
      if (API._bnPairs) return API._bnPairs;
      var K = 'samsam_bn_pairs', DAYMS = 864e5;
      try { var c = JSON.parse(localStorage.getItem(K) || 'null'); if (c && c.s && Date.now() - c.t < DAYMS) { var set0 = {}; c.s.split(',').forEach(function (x) { if (x) set0[x] = 1; }); return (API._bnPairs = Promise.resolve(set0)); } } catch (_) {}
      return (API._bnPairs = fetch('https://data-api.binance.vision/api/v3/ticker/price').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (list) {
          var set = {}; (list || []).forEach(function (t) { if (/USDT$/.test(t.symbol) && +t.price > 0) set[t.symbol.slice(0, -4)] = 1; });
          try { localStorage.setItem(K, JSON.stringify({ t: Date.now(), s: Object.keys(set).join(',') })); } catch (_) {}
          return set;
        }, function (e) { API._bnPairs = null; throw e; }));
    },
    // Binance prices for just these tickers (only the ones it trades), ≤100 per request; each price is reused for 50 s
    // by every list that asks. → Promise of { SYM: price }
    bnPrices: function (syms) {
      var want = {}; (syms || []).forEach(function (s) { s = String(s || '').toUpperCase(); if (/^[A-Z0-9]{2,15}$/.test(s)) want[s] = 1; });
      var keys = Object.keys(want); if (!keys.length) return Promise.resolve({});
      var C = API._bnPx || (API._bnPx = {}), now = Date.now();
      return API.bnPairs().then(function (set) {
        var px = {}, ask = [];
        keys.forEach(function (s) { if (!set[s]) return; var c = C[s]; if (c && now - c.t < 50e3) px[s] = c.p; else ask.push(s); });
        var batches = []; for (var i = 0; i < ask.length; i += 100) batches.push(ask.slice(i, i + 100));
        return Promise.all(batches.map(function (b) {
          return fetch('https://data-api.binance.vision/api/v3/ticker/price?symbols=' + encodeURIComponent(JSON.stringify(b.map(function (s) { return s + 'USDT'; }))), { cache: 'no-store' })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (list) { (list || []).forEach(function (t) { var p = +t.price; if (p > 0) { var k = t.symbol.slice(0, -4); px[k] = p; C[k] = { p: p, t: Date.now() }; } }); }, function () {});
        })).then(function () { return px; });
      }).catch(function () { return {}; });
    },
    // Live prices every few seconds from Binance's public market data (no key) for the coins you hold that trade against
    // USDT: { SYM: price }.
    fastPrices: function (syms) {
      var want = (syms || []).map(function (s) { return String(s || '').toUpperCase(); }).filter(function (s) { return /^[A-Z0-9]{2,15}$/.test(s) && !API.isStable({ sym: s, name: '' }); });
      if (!want.length) return Promise.resolve({});
      return API.bnPrices(want.slice(0, 100));
    },
    // ⚡ A live line to Binance (WebSocket, market data only): each coin's price as it trades, about once a second,
    // over one connection — instead of asking every 15 s. onTick({ SYM: { price, ch24, high, low } }) at most every
    // `every` ms. Stops while the page is hidden and comes back when it is shown; after a drop it reconnects (2 s → 1 min);
    // after 6 failed tries in a row it stops for this visit (the 15-second asking takes over). → { set(syms), alive(), stop() }
    stream: function (onTick, every) {
      every = every || 2000;
      var WS = window.__bnWs || 'wss://data-stream.binance.vision/stream?streams=';
      var syms = [], ws = null, last = 0, buf = {}, timer = null, retry = 0, wait = null, stopped = false, key = '';
      var DELAY = [2e3, 5e3, 15e3, 30e3, 60e3, 60e3];
      function flush() { timer = null; var b = buf; buf = {}; if (Object.keys(b).length) try { onTick(b); } catch (_) {} }
      function close() { if (ws) { var w = ws; ws = null; try { w.onclose = w.onerror = w.onmessage = null; w.close(); } catch (_) {} } clearTimeout(wait); wait = null; }
      function open() {
        close();
        if (stopped || document.hidden || !syms.length || !window.WebSocket || retry >= DELAY.length) return;
        try { ws = new WebSocket(WS + syms.map(function (s) { return s.toLowerCase() + 'usdt@miniTicker'; }).join('/')); } catch (_) { ws = null; return; }
        ws.onmessage = function (ev) {
          var d; try { d = JSON.parse(ev.data); d = d && d.data || d; } catch (_) { return; }
          if (!d || !d.s || !/USDT$/.test(d.s)) return;
          var c = +d.c, o = +d.o; if (!(c > 0)) return;
          last = Date.now(); retry = 0;
          buf[d.s.slice(0, -4)] = { price: c, ch24: o > 0 ? (c / o - 1) * 100 : null, high: +d.h || null, low: +d.l || null };
          if (!timer) timer = setTimeout(flush, every);
        };
        ws.onclose = ws.onerror = function () { var w = ws; ws = null; if (w) try { w.onclose = w.onerror = null; } catch (_) {} if (stopped || document.hidden) return; clearTimeout(wait); wait = setTimeout(open, DELAY[Math.min(retry++, DELAY.length - 1)]); };
      }
      document.addEventListener('visibilitychange', function () { if (document.hidden) close(); else if (!ws) { retry = Math.min(retry, DELAY.length - 1); open(); } });
      window.addEventListener('online', function () { if (!ws) { retry = 0; open(); } });
      return {
        set: function (list) {   // the tickers to follow (only the ones Binance trades, ≤ 60); reconnects only when they change
          var want = (list || []).map(function (s) { return String(s || '').toUpperCase(); }).filter(function (s, i, a) { return /^[A-Z0-9]{2,15}$/.test(s) && a.indexOf(s) === i && !API.isStable({ sym: s, name: '' }); });
          return API.bnPairs().then(function (set) {
            var next = want.filter(function (s) { return set[s]; }).sort().slice(0, 60), k = next.join(',');
            if (k === key) return; key = k; syms = next; retry = 0; open();
          }).catch(function () {});
        },
        alive: function () { return !!ws && Date.now() - last < 20e3; },   // a price came in the last 20 s
        stop: function () { stopped = true; close(); },
      };
    },
    // ⏳ every coin's last daily close (00:00 UTC), written by GitHub each hour (prices branch, p/close.json) — the Signals
    // are decided on it. Kept on this device; asked again only after the next close is due (and at most every 20 min).
    closes: function () {
      var K = 'samsam_close', c = null; try { c = JSON.parse(localStorage.getItem(K) || 'null'); } catch (_) {}
      var day = new Date(Math.floor(Date.now() / 864e5) * 864e5).toISOString().slice(0, 10);
      if (c && c.p && c.day === day) return Promise.resolve(c);
      if (c && c.p && Date.now() - (c.at || 0) < 20 * 60e3) return Promise.resolve(c);   // today's not written yet: yesterday's stands
      if (API._closeP) return API._closeP;
      return (API._closeP = fetch(SNAP.replace(/m\/market\.json$/, 'p/close.json'), { cache: 'no-cache' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) { API._closeP = null; if (!j || !j.p) return c; j.at = Date.now(); try { localStorage.setItem(K, JSON.stringify(j)); } catch (_) {} return j; },
              function () { API._closeP = null; return c; }));
    },
    binanceTopUp: function (rows) {
      var now = Date.now(), syms = [];
      (rows || []).forEach(function (c) { if (c && c.sym && c.price > 0 && !API.isStable(c)) syms.push(String(c.sym).toUpperCase()); });
      // only the tickers in these rows (≤100 per request), not Binance's whole list; shared for 50 s by every list
      return API.bnPrices(syms).then(function (px) {
        var n = 0;
        (rows || []).forEach(function (c) {
          var p = px[String(c.sym || '').toUpperCase()]; if (!(p > 0) || !(c.price > 0)) return;
          if (Math.abs(p / c.price - 1) > 0.25 || API.isStable(c)) return;
          var ago = c.ch24 != null ? c.price / (1 + c.ch24 / 100) : null;
          c.price = p; if (ago > 0) c.ch24 = (p / ago - 1) * 100; c.bn = now; n++;
        });
        return n;
      }, function () { return 0; });
    },
    // US spot BTC / ETH ETF flows (m/etf.json, written by GitHub once a trading day from SoSoValue). null until it exists.
    etf: function (force) {
      var k = 'samsam_mkt_etf', c = null;
      try { c = JSON.parse(localStorage.getItem(k)); } catch (_) {}
      if (c && c.data && !force && Date.now() - c.t < 15 * 60e3) return Promise.resolve(c.data);
      return fetch(SNAP.replace(/market\.json$/, 'etf.json'), { cache: 'no-cache' }).then(function (r) { if (r.status === 404) return null; if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) { if (j && j.updated) { try { localStorage.setItem(k, JSON.stringify({ t: Date.now(), data: j })); } catch (_) {} } return j && j.updated ? j : null; },
          function (e) { if (c && c.data) return c.data; throw e; });
    },
    // 🌈 the Bitcoin rainbow (written by GitHub once a day, tools/update-rainbow.mjs). rainbow(): its small part, riding in
    // the snapshot — { fit, closes, held, peaks } for samsam-core.js → rainbowRead; null until it exists.
    // rainbowFull(): m/rainbow.json — the same plus one close a week since 2010 (the Market Hub's chart), the moves, the years.
    rainbow: function () { return snapshot().then(function (j) { return j.rainbow || null; }, function () { return null; }); },
    rainbowFull: function () {
      var k = 'rainbowFull', c = mem[k]; if (c && Date.now() - c.t < 30 * 60e3) return Promise.resolve(c.data);
      if (inflight[k]) return inflight[k];
      return inflight[k] = fetch(SNAP.replace(/market\.json$/, 'rainbow.json'), { cache: 'no-cache' }).then(function (r) { if (r.status === 404) return null; if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) { delete inflight[k]; mem[k] = { data: j, t: Date.now() }; return j; }, function (e) { delete inflight[k]; throw e; });
    },
    // first paint: whatever this browser has, else the GitHub snapshot — no CoinGecko call
    peek: function () {
      var g = get('global'), f = get('fng'), t = get('top');
      if (g && f && t) return Promise.resolve({ global: g.data, fng: f.data, top: t.data, t: Math.min(g.t, t.t) });
      return snapshot().then(function (j) {
        var pick = function (c, n) { var s = j[n], st = Date.parse((j.parts && j.parts[n]) || j.updated) || j.t; return c && (!s || c.t >= st) ? c.data : s; };
        return { global: pick(g, 'global'), fng: pick(f, 'fng'), top: pick(t, 'top'), t: j.t };
      }, function () { return { global: g && g.data, fng: f && f.data, top: t && t.data, t: t ? t.t : 0 }; });
    },
    // the user typed it, so it goes even while cooling down (a refusal still starts the cool-down)
    search: function (q) {
      return json(CG + '/search?query=' + encodeURIComponent(q)).catch(function (e) { if (e.rate) cool(); throw e; }).then(function (j) {
        return ((j && j.coins) || []).slice(0, 12).map(function (c) { return { id: c.id, sym: String(c.symbol || '').toUpperCase(), name: c.name, rank: c.market_cap_rank, img: c.large || c.thumb || '' }; });
      });
    },
    // stablecoins: pegged to the dollar (or euro) or to gold — they don't move like crypto
    isStable: function (c) {
      var s = String(c.sym || '').toUpperCase(), n = (c.name || '').toLowerCase();
      if (/^(USDT|USDC|DAI|FDUSD|USDE|TUSD|PYUSD|USDS|BUSD|USD1|RLUSD|FRAX|USDD|GUSD|EURC|EURS|USDX|USDF|USDG|USDTB|BFUSD|SUSDE|SUSDS|USD0|LUSD|CRVUSD|GHO|XAUT|PAXG|BSC-USD|USDP|USDB|USDA|DOLA|USDL|USDY|BUIDL|USTB|USYC|OUSG|FDIT|USX|AUSD|DEUSD|USR|RUSD)$/.test(s)) return true;
      if (/stablecoin|\busd\b|dollar|tether gold|pax gold|\beuro\b/.test(n) && !/wrapped|staked/.test(n)) return true;
      if (/\bgold\b/.test(n) && API.flat(c, 0.08)) return true;   // gold tokens (Kinesis Gold…) follow gold, not crypto
      // tied to a currency by its ticker (EURSAFO, EURQ, GBPT, XSGD, CHFX…)
      if (/^(EUR|GBP|CHF|JPY|SGD|AUD|CAD|TRY|BRL|MXN|XSGD|XCHF|XAU)[A-Z0-9]{0,4}$|^[A-Z]{0,4}(EUR|GBP|CHF|SGD)$/.test(s) && API.flat(c, 0.03)) return true;
      // a dollar token by its ticker (APXUSD, XUSD…: "…USD" + a price close to $1)
      if (/USD[A-Z0-9]?$/.test(s) && +c.price >= 0.9 && +c.price <= 1.1) return true;
      // anything whose price hardly moved all week (< 1.5% from low to high) is pegged — no real crypto is that still
      return API.flat(c, 0.015);
    },
    // true when the 7-day line stays within `band` (low → high) — a peg, not a market
    flat: function (c, band) {
      var sp = (c && c.spark) || [], lo = Infinity, hi = 0;
      for (var i = 0; i < sp.length; i++) { var v = +sp[i]; if (v > 0) { if (v < lo) lo = v; if (v > hi) hi = v; } }
      return sp.length >= 20 && hi > 0 && lo < Infinity && hi / lo - 1 < band;
    },
    // not counted: stablecoins, wrapped / bridged / staked copies, exchange-backed USD tokens, BTC itself
    isExcluded: function (c) {
      var s = c.sym, n = (c.name || '').toLowerCase(), id = c.id || '';
      if (id === 'bitcoin') return true;
      if (API.isStable(c)) return true;
      if (/wrapped|bridged|staked|restaked|liquid staking|binance-peg/.test(n)) return true;
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
    day: day,
    stocks: snapPart('stocks'),   // 📈 Binance bStocks (tokenized US stocks), from the GitHub snapshot
    fx: snapPart('fx'),   // 💱 how many EGP / SAR one US dollar buys (official rate, Yahoo Finance), from the snapshot — Cash & certificates
    metals: snapPart('metals'),   // 🥇 gold, silver, platinum, copper, Brent (Yahoo Finance futures), from the snapshot
    // 7-day change; older saved rows don't have it → from the 7-day line
    ch7: function (c) { if (c.ch7 != null) return c.ch7; var s = c.spark || []; return s.length > 1 && s[0] > 0 ? (s[s.length - 1] / s[0] - 1) * 100 : null; },
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
