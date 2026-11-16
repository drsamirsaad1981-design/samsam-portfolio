// samsam-hints.js — one way to explain things, on every page.
//
//   <button type="button" class="cp-hint" data-hint="baseline" aria-label="What is the baseline?"></button>
//
// Tapping an ⓘ opens a small panel (bottom sheet on a phone, a popover beside the ⓘ on a computer) with a title,
// a few lines on what the thing does and — when there is a calculation — the formula exactly as the app computes it.
// ALL hint texts live in HINTS below, so a change in how something works is explained in one place.
(function () {
  'use strict';
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var money = function (n) { return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var fmtDay = function (iso) { var d = new Date(String(iso) + 'T00:00:00'); return isNaN(d) ? String(iso) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
  function baseline() {
    try { if (window.Samsam && Samsam.getBaseline) return Samsam.getBaseline(); } catch (_) {}
    return { date: '2026-10-15', btcPrice: 81162, isDefault: true };
  }

  // ── The texts ────────────────────────────────────────────────────────────────
  // title: string · body(): HTML string (only our own text + escaped values) · actions(): [{ label, onClick }]
  var HINTS = {
    baseline: {
      title: function () { return 'Baseline Date: ' + fmtDay(baseline().date); },
      body: function () {
        var b = baseline();
        return '<p>The day your coins are compared with Bitcoin.</p>' +
          '<p>It sets the <b>BTC reference price</b>, which is BTC\'s price on that date: <b>' + esc(money(b.btcPrice)) + '</b>' +
          (b.source === 'manual' ? ' (entered by hand)' : '') + '.</p>' +
          '<p>It is used for the coins you <b>already held</b> on that date (your opening positions): when they are compared with Bitcoin, that money counts as BTC bought on the baseline date at this price. Your own BTC is always compared with itself.</p>' +
          '<p>The price can be the market\'s daily price (looked up automatically) or <b>the price you actually paid</b> for your BTC that day — a daily price is an average of the whole day, while a buy at a given hour can be higher or lower. The ' + SamsamUI.ic('pencil') + 'editor offers your own price.</p>' +
          '<p>Changing it changes:</p>' +
          '<ul><li><b>Portfolio vs BTC</b> for those coins (cards, table, sorting and CSV)</li><li>the <b>VS Bitcoin</b> best / worst on Performance</li><li>the <b>BTC Trend</b> line on the charts</li></ul>' +
          '<p>Coins you bought later are compared with BTC at the moment you bought them, so the baseline doesn\'t affect them.</p>' +
          '<p class="cph-ok">Your holdings, transactions, All Time Profit and the Hold / Reinforce / Sell signals <b>don\'t change</b>.</p>';
      },
      actions: function () { return typeof window.openBaselineEdit === 'function' ? [{ label: 'Change date', primary: true, onClick: window.openBaselineEdit }] : []; },
    },
    // ── main page ──
    totalPortfolio: { title: 'Total Portfolio', body: function () { return '<p>What all your coins are worth right now.</p>' +
      '<div class="cph-f"><b>Total Portfolio</b><code>Σ (Amount × Current Price) for every coin</code></div>' +
      '<p>In brackets: the same value in BTC (÷ BTC price).</p>'; } },
    btcAccum: { title: 'BTC Accumulated', body: function () { return '<p>How much Bitcoin you hold.</p><div class="cph-f"><b>Below it</b><code>BTC Amount × BTC price</code></div>'; } },
    altAccum: { title: 'Altcoins Accumulated', body: function () { return '<p>What all your coins except Bitcoin are worth.</p>' +
      '<div class="cph-f"><b>Altcoins</b><code>Σ (Amount × Current Price), every coin except BTC</code></div><p>In brackets: the same value in BTC.</p>'; } },
    movers24h: { title: "Today's Movers", body: function () { return '<p>The coin that went up the most and the one that went down the most in the <b>last 24 hours</b> (price change from CoinGecko).</p>' +
      '<p>Coins worth less than $1 or less than 0.1% of your portfolio are left out, so a tiny holding can\'t win. It follows the category you picked.</p>'; } },
    avgBuy: { title: 'Avg. Buy Price', body: function () { return '<p>The average price you paid per coin, buying fees included. It changes on every buy; sells don\'t change it.</p>' +
      '<div class="cph-f"><b>After a buy</b><code>(Amount held × Avg Buy Price + Buy Price × Amount Bought + Buying Fee) ÷ (Amount held + Amount Bought)</code></div>'; } },
    costBasis: { title: 'Cost Basis', body: function () { return '<p>What the coins you hold now cost you (fees included).</p><div class="cph-f"><b>Cost Basis</b><code>Avg Buy Price × Amount held</code></div>'; } },
    signal: { title: 'Signal', body: function () {
      var r = window.Samsam && Samsam.getSignalRules ? Samsam.getSignalRules() : { reinforce: -5, sell: -20, isDefault: true };
      var p = function (n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n) + '%'; };
      return '<p>A simple reminder based on the price now compared with your <b>Avg. Buy Price</b>:</p>' +
      '<ul><li><b>' + SamsamUI.dot('grey') + 'Hold</b> — above ' + p(r.reinforce) + '</li><li><b>' + SamsamUI.dot('green') + 'Reinforce</b> — from ' + p(r.reinforce) + ' down to ' + p(r.sell) + ': cheaper than you paid, a chance to add</li><li><b>' + SamsamUI.dot('red') + 'Sell / Convert</b> — below ' + p(r.sell) + ': consider moving it into BTC</li></ul>' +
      '<div class="cph-f"><b>Change</b><code>(Current Price ÷ Avg Buy Price − 1) × 100</code></div><p>BTC is always Hold. It is a reminder, not advice.' + (r.isDefault ? '' : ' <b>Your own thresholds.</b>') + '</p>' +
      (typeof window.openSignalEdit === 'function' ? '<p><button type="button" class="sg-hint-btn" onclick="CPHint.close();openSignalEdit()">' + SamsamUI.ic('pencil') + 'Change the thresholds</button></p>' : ''); } },
    manualPrice: { title: 'Manual Price', body: function () { return '<p>Set a price by hand for a coin the live price service doesn\'t cover. It is used <b>only when there is no live market price</b>; as soon as a live price arrives, that one is used.</p>'; } },
    holdingsChange: { title: 'Holdings Change', body: function () { return '<p>How much your holdings moved in the period you picked — split into what <b>prices</b> did and the <b>money you added or took out</b>.</p>' +
      '<div class="cph-f"><b>From prices (the number and %)</b><code>All Time Profit at the end − All Time Profit at the start</code></div>' +
      '<div class="cph-f"><b>Added / taken out</b><code>(buys + fees − sells) in the period</code></div>' +
      '<p>Value change = from prices + added. Green / red follows the price part only. The chart line itself is the value, so a buy shows as a step up.</p>'; } },
    external: { title: 'Links That Leave the App', body: function () { return '<p>Anything marked ' + SamsamUI.ic('ext', { solo: true }) + ' opens another website in a new tab: <b>CoinMarketCap</b> (coin page), <b>CoinGlass</b> (liquidation heatmap) and <b>CoinCodex</b> (price prediction). Their numbers are theirs, not calculated by this app.</p>'; } },
    // ── Performance / Allocation ──
    sincePurchase: { title: 'Top Performers · USD', body: function () { return '<p>Your best and worst coin by <b>All Time Profit in dollars</b> — sells included. The % under it is that profit against the coin\'s cost.</p>' +
      '<div class="cph-f"><b>$</b><code>Coin\'s Realized + Unrealized profit</code></div><div class="cph-f"><b>%</b><code>Coin\'s All Time Profit ÷ its Cost Basis × 100</code></div><p>Switch to <b>vs BTC</b> to rank every coin against the same money in Bitcoin instead. Coins worth less than $1 or less than 0.1% of your portfolio are left out.</p>'; } },
    allocation: { title: 'Allocation', body: function () { return '<p>How your money is spread across categories.</p><div class="cph-f"><b>Share</b><code>Category value ÷ Total Portfolio × 100</code></div><p>Category value = Σ (Amount × Current Price) of its coins.</p>'; } },
    // ── Accumulation plan ──
    targetAmount: { title: 'Target Amount', body: function () { return '<p>How many coins you want to hold <b>in total</b> — not how many more to buy.</p>'; } },
    pendingAmount: { title: 'Pending Amount', body: function () { return '<div class="cph-f"><b>Pending</b><code>Target Amount − Amount held (0 when the target is reached)</code></div>'; } },
    costToTarget: { title: 'Cost to Target', body: function () { return '<p>What the pending amount would cost at today\'s price.</p><div class="cph-f"><b>Cost to Target</b><code>Pending Amount × Current Price</code></div>'; } },
    coinProgress: { title: 'Progress', body: function () { return '<div class="cph-f"><b>Progress</b><code>Amount held ÷ Target Amount × 100, capped at 100%</code></div><p>Anything above the target still shows in your holdings; it just doesn\'t count past 100%.</p>'; } },
    buyAt: { title: 'Buy at %', body: function () { return '<p>A buy target relative to the price <b>on the day you set it</b>. That price is saved as the <b>base</b>, so the target stays fixed until you change the % — it doesn\'t move with the market.</p>' +
      '<div class="cph-f"><b>Target price</b><code>Base price × (1 + Buy at % ÷ 100)</code></div>' +
      '<ul><li>−10% from a $100 base → buy at <b>$90</b>: <b>BUY NOW</b> when the price is at or below $90</li><li>+10% → buy at <b>$110</b> (a breakout): <b>BUY NOW</b> at or above $110</li></ul><p>Changing the % saves today\'s price as the new base.</p>'; } },
    priceAlert: { title: 'Price Alert', body: function () { return '<p>A price you want to hear about. When the current price is <b>at or below</b> it, the coin shows <b>Hit</b> and your Telegram bot sends you one message (again only after the price went 3% back above it). Turn it on or off in Settings → Telegram alerts → Buy-price alerts.</p>'; } },
    overallProgress: { title: 'Overall Progress', body: function () { return '<p>How far you are with the whole plan.</p>' +
      '<div class="cph-f"><b>Overall Progress</b><code>Average of every coin\'s Progress (each capped at 100%)</code></div>' +
      '<p>Only coins with a target count. A coin above its target counts as 100%: the extra never makes up for coins still below target.</p>'; } },
    planTotals: { title: 'Plan Totals', body: function () { return '<ul><li><b>Total Target Value</b> = Σ Target Amount × Current Price</li><li><b>Current Holdings</b> = Σ Amount held × Current Price (amounts above target included)</li>' +
      '<li><b>Total Pending Cost</b> = Σ Cost to Target</li><li><b>Coins Completed</b> = coins at or above their target</li></ul>'; } },
    // ── cards that had no ⓘ yet (Performance, Allocation, Plan, Exit Strategy, Market Hub) ──
    profitBreakdown: { title: 'All Time Profit Breakdown', body: function () { return '<p>Where your profit or loss comes from, for all coins or one category.</p>' +
      '<div class="cph-f"><b>Unrealized</b><code>Value of the coins you still hold − their Cost Basis</code></div>' +
      '<div class="cph-f"><b>Realized</b><code>What your sells brought in − the cost of the coins sold − selling fees</code></div>' +
      '<div class="cph-f"><b>All Time Profit</b><code>Realized + Unrealized</code></div>' +
      '<p>Unrealized moves with today\'s prices; Realized is locked in and changes only when you sell.</p>'; } },
    rewards: { title: 'Rewards & mining', body: function () { return '<p>Coins you got <b>without buying</b>: staking rewards, mined coins and airdrops.</p>' +
      '<p>They come in at <b>$0 cost</b>, so your holdings go up and your average buy price goes down — they are already part of your All Time Profit.</p>' +
      '<p>The card shows what they are worth at today\'s price. Tap it for the list by coin and by month.</p>' +
      '<p>Add one from a coin\'s page: <b>+ Add Transaction → Reward</b> (staking can also be booked automatically from an APY).</p>'; } },
    walletsCheck: { title: 'Wallets & exchanges', body: function () { return '<p><b>Wallets &amp; check</b> compares what the app says you hold with what is really in your wallets.</p>' +
      '<ul><li>You add each wallet\'s <b>public address</b> only — never a seed phrase or a private key.</li><li>The app reads the balances from the public blockchain and lists coins where the wallet has <b>more</b> or <b>less</b> than the app.</li><li>Nothing is changed by itself: you decide what to correct.</li></ul>' +
      '<p><b>Import from exchange</b> reads a CSV file of your trades (Binance, Gate and others) and adds the buys and sells. Trades you already entered are recognised and not added twice.</p>'; } },
    targets: { title: 'Target allocation', body: function () { return '<p>The share of your portfolio you want in each category (Bitcoin included). The shares add up to 100%.</p>' +
      '<div class="cph-f"><b>Now → target</b><code>Category value ÷ portfolio value × 100, next to the share you chose</code></div>' +
      '<p>The <b>band</b> (± points) is how far a category may drift. Inside the band it is <b>✓ on target</b>; outside, the card says how much to buy (or trim) to get back, and which of your coins fit.</p>' +
      '<p class="cph-ok">It is a guide only — nothing is bought or sold for you.</p>'; } },
    dca: { title: 'DCA schedule (regular buys)', body: function () { return '<p>A fixed amount you buy on a fixed day — every week, every two weeks or every month — whatever the price.</p>' +
      '<ul><li><b>Today</b>: the buy is due today.</li><li><b>Missed · N days</b>: the day passed and no Buy of that coin was recorded.</li><li><b>✓ Bought</b>: you recorded the Buy for this round.</li><li>A date: the next buy day.</li></ul>' +
      '<p><b>Kept x of y</b> counts your last rounds (up to 6). <b>Target in N buys</b>: how many more buys reach the coin\'s target.</p>' +
      '<p><b>➕ Regular buy</b> works for any coin: one that isn\'t in your plan joins it without a target (set one later on its row). Telegram reminds you on the day.</p>'; } },
    planAlloc: { title: 'Plan vs target allocation', body: function () { return '<p>If you bought everything this plan still needs, at today\'s prices — would your categories match your <b>target allocation</b>?</p>' +
      '<p>It compares today with "after the plan", category by category, inside your band.</p>' +
      '<p>Each plan coin gets a chip for its category today:</p><ul><li><b>↓ Priority</b>: the category is below its target — buying this coin moves you toward it.</li><li><b>↑ Over target</b>: already above — it can wait.</li><li><b>✓ On target</b>.</li></ul>'; } },
    macroExit: { title: 'Macro Exit Indicators', body: function () { return '<p>Three whole-market signs that a cycle top may be near — with <b>your own levels</b>:</p>' +
      '<ul><li><b>BTC Dominance</b> at or under your level (money has moved from Bitcoin into altcoins).</li><li><b>USDT Dominance</b> inside your range (little cash left on the side).</li><li><b>ETH / BTC</b> at or over your level (altcoins are beating Bitcoin).</li></ul>' +
      '<p><b>Reached</b> = at the level · <b>Close</b> = within 10% of it · <b>Waiting</b> = not yet. "Signals Hit" counts the ones reached.</p>' +
      '<p class="cph-ok">The page compares — it doesn\'t predict the top. Change the levels with Edit targets.</p>'; } },
    cashOut: { title: 'Cash-out Progress', body: function () { return '<p>How much of your portfolio already sits in stablecoins.</p>' +
      '<div class="cph-f"><b>% in stablecoins</b><code>Value of your stablecoins ÷ value of the whole portfolio × 100</code></div>' +
      '<p><b>Realized profit</b> is the profit locked in by all your sells. <b>Exit steps done</b> counts the take-profit steps your recorded sells have covered.</p>'; } },
    exitSteps: { title: 'Exit plan steps', body: function () { return '<p>Each coin in the exit plan is sold in <b>three steps</b>, as its price reaches a multiple of your average buy price.</p>' +
      '<div class="cph-f"><b>Default</b><code>×2 → sell 25% · ×3 → sell 50% · ×5 → sell 25%</code></div>' +
      '<p>The sliders button changes your default multiples and shares; any coin can have its own prices.</p>' +
      '<ul><li><b>Moonbag</b>: 10% of the coin stays out of the plan, to keep.</li><li>A step turns <b>✓ Done</b> by itself when the sells you record (after the coin joined the plan) cover it — steps fill in order.</li><li>Buying more later raises the plan amount.</li></ul>'; } },
    mcap: { title: 'Total Market Cap', body: function () { return '<p>The value of all coins together, and how it changed in 24 hours.</p>' +
      '<ul><li><b>Volume 24h</b>: how much was traded in the last 24 hours.</li><li><b>BTC / ETH</b>: price and 24h change.</li><li><b>ETF money, last 7 days</b>: net money into (+) or out of (−) the US spot Bitcoin and Ethereum ETFs.</li></ul>' +
      '<p>Sources: CoinGecko (market), SoSoValue (ETFs).</p>'; } },
    fng: { title: 'Fear & Greed', body: function () { return '<p>A 0–100 reading of the market\'s mood — <b>CoinMarketCap\'s</b> index (the one CoinMarketCap and Binance show), updated through the day.</p>' +
      '<ul><li><b>Low (fear)</b>: people are scared and selling — prices are often cheap.</li><li><b>High (greed)</b>: people are buying eagerly — prices are often stretched.</li></ul>' +
      '<p>Yesterday and last week show which way the mood is moving.</p>'; } },
    altSeason: { title: 'Altcoin Season', body: function () { return '<p>Are altcoins beating Bitcoin?</p>' +
      '<div class="cph-f"><b>Index</b><code>How many of CoinMarketCap\'s top 100 coins did better than BTC over the last 90 days</code></div>' +
      '<p>The number is <b>CoinMarketCap\'s official Altcoin Season Index</b> (the one CoinMarketCap and CoinGlass show). Stablecoins, wrapped and staked coins are left out. <b>75 or more</b> = Altcoin Season; a low number means Bitcoin is leading.</p>' +
      '<p>Tap the card for the full page: the coins that beat BTC and the history.</p>'; } },
    dominance: { title: 'Market Dominance', body: function () { return '<p>Each coin\'s share of the total market cap: Bitcoin, Ethereum, USDT, the next three biggest coins, and all the others together.</p>' +
      '<div class="cph-f"><b>Dominance</b><code>Coin\'s market cap ÷ total market cap × 100</code></div>' +
      '<p>The % are <b>CoinMarketCap\'s</b> (the ones most sites show), refreshed about every 30 minutes; the total market cap above is live from CoinGecko.</p>' +
      '<p><b>ETH / BTC</b> is the price of 1 ETH in BTC — rising means Ethereum (and usually altcoins) is beating Bitcoin.</p>'; } },
    etf: { title: 'ETF Flows (US spot)', body: function () { return '<p>Money going into (+, green) or out of (−, red) the US spot Bitcoin or Ethereum ETFs, per trading day.</p>' +
      '<p>Big steady inflows mean institutions are buying; outflows mean they are selling. The totals show the last 7 days, the last 30 days and since launch.</p><p>Source: SoSoValue.</p>'; } },
    // ── cloud menu ──
    recover: { title: 'Recover Data', body: function () { return '<p>Compares another copy of your portfolio — data the older app version left on this device, your old JSONBin, or a backup file — with the cloud, coin by coin, and lists the transactions the cloud is missing. You choose what to add; nothing is replaced.</p>'; } },
    backup: { title: 'Encrypted Backup', body: function () { return '<p>Downloads your whole portfolio as a file locked with a password you choose (AES-256). Keep the password safe: <b>it can\'t be recovered</b>, and without it the file can\'t be opened.</p>'; } },
    vsBtc: {
      title: 'Portfolio vs BTC',
      body: function () {
        var b = baseline();
        return '<p>Did this coin do better than <b>the same money in Bitcoin</b>?</p>' +
          '<p>Every time you bought the coin, the app pretends you bought BTC with the same dollars at that moment\'s BTC price; every sell, that you sold BTC for the same dollars. Coins you already held on the baseline date (' + esc(fmtDay(b.date)) + ') count as BTC bought that day at ' + esc(money(b.btcPrice)) + '.</p>' +
          '<div class="cph-f"><b>Coin %</b><code>Coin\'s All Time Profit ÷ Cost Basis × 100</code></div>' +
          '<div class="cph-f"><b>BTC Benchmark %</b><code>(that BTC × BTC price now − net invested) ÷ Cost Basis × 100 — what the same money made in Bitcoin</code></div>' +
          '<div class="cph-f"><b>Portfolio vs BTC</b><code>Coin % − BTC Benchmark %</code></div>' +
          '<p>Your BTC is compared with itself, so it always shows 0.</p>';
      },
    },
    perfChart: {
      title: 'Performance (cumulative)',
      body: function () {
        var b = baseline();
        return '<p><b>Blue — All Time Profit %</b>: your total profit on the coins in your portfolio, at every point in time.</p>' +
          '<div class="cph-f"><b>All Time Profit</b><code>Holdings × latest price + selling proceeds − buying costs − fees</code></div>' +
          '<div class="cph-f"><b>%</b><code>All Time Profit ÷ Cost Basis × 100</code></div>' +
          '<p><b>Orange — BTC Trend</b>: the same money in Bitcoin. Every buy, sell and transfer you made is replayed as buying or selling BTC at that moment\'s price (what you held on the baseline date, ' + esc(fmtDay(b.date)) + ', at ' + esc(money(b.btcPrice)) + ').</p>' +
          '<div class="cph-f"><b>BTC Trend</b><code>(BTC bought with the same money × BTC price now − net invested) ÷ Cost Basis × 100</code></div>' +
          '<div class="cph-f"><b>Net invested</b><code>buying costs + fees − selling proceeds</code></div>' +
          '<p>So both lines use the same money and the same scale: the gap between them is how much better or worse your coins did than Bitcoin.</p>' +
          '<p>Both lines are measured from the start, so 24h / 7d / 30d / 90d only zoom in. The last point is right now and matches the All Time Profit card.</p>' +
          '<p>Buying more doesn\'t count as profit, but it does add to Cost Basis, so both % can step a little at that moment. A single point saved while prices were still loading is left out.</p>';
      },
    },
  };

  // ── The panel ────────────────────────────────────────────────────────────────
  // It always opens above everything else — including windows that have their own ⓘ (Baseline editor, dialogs).
  var css = false, open = null;
  function addCss() {
    if (css) return; css = true;
    var st = document.createElement('style'); st.id = 'cpHintCss';
    st.textContent =
      // the ⓘ itself — same everywhere
      '.cp-hint{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;margin:0 0 0 4px;padding:0;border:none;border-radius:50%;background:none;color:var(--fg2,#94a3b8);opacity:.8;cursor:pointer;vertical-align:middle;line-height:0;flex-shrink:0;-webkit-tap-highlight-color:transparent;transition:color .15s,opacity .15s,background .15s}' +
      '.cp-hint svg{width:15px;height:15px}.cp-hint:active,.cp-hint[aria-expanded=true]{color:#a78bfa;opacity:1;background:rgba(124,58,237,.14)}' +
      '@media (hover:hover){.cp-hint:hover{color:#a78bfa;opacity:1}}.cp-hint:focus-visible{outline:2px solid #a78bfa;outline-offset:1px;opacity:1}' +
      // the panel
      '.cph-back{position:fixed;inset:0;z-index:100190;background:transparent}.cph-back.sheet{background:rgba(2,6,23,.55);animation:cphFade .15s ease}' +
      '.cph{position:fixed;z-index:100191;width:min(340px,calc(100vw - 16px));box-sizing:border-box;background:var(--card-solid,var(--bg2,#111827));color:var(--fg,#e5e7eb);border:1px solid var(--border,#334155);border-radius:14px;padding:14px 16px;box-shadow:0 18px 40px rgba(0,0,0,.4);font-size:.86rem;line-height:1.5;animation:cphPop .15s ease}' +
      '.cph.sheet{left:0!important;right:0!important;bottom:0!important;top:auto!important;width:auto;max-height:80vh;overflow:auto;border-radius:18px 18px 0 0;padding:10px 18px calc(16px + env(safe-area-inset-bottom,0px));animation:cphSheet .2s ease}' +
      '.cph.sheet::before{content:"";display:block;width:36px;height:4px;border-radius:2px;background:#475569;margin:0 auto 10px}' +
      '.cph-h{display:flex;align-items:center;gap:8px;margin-bottom:6px}.cph-h h3{flex:1;margin:0;font-size:.98rem;font-weight:800}' +
      '.cph-x{width:30px;height:30px;border-radius:9px;border:1px solid var(--border,#334155);background:none;color:inherit;font-size:1.05rem;line-height:1;cursor:pointer}' +
      '.cph p{margin:0 0 8px;color:var(--fg2,#cbd5e1)}.cph p b,.cph li b{color:var(--fg,#e5e7eb)}.cph ul{margin:0 0 8px;padding-left:18px;color:var(--fg2,#cbd5e1)}.cph li{margin:2px 0}' +
      '.cph-f{margin:4px 0 10px;font-size:.8rem}.cph-f code{display:block;margin-top:3px;padding:7px 9px;border-radius:8px;background:var(--bg3,rgba(148,163,184,.1));font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.75rem;white-space:normal;color:var(--fg,#e5e7eb)}' +
      '.cph-ok{padding:8px 10px;border-radius:9px;background:rgba(34,197,94,.10);color:var(--fg,#e5e7eb)!important}' +
      '.cph-acts{display:flex;gap:8px;margin-top:12px}.cph-acts button{flex:1;min-height:40px;border-radius:10px;border:1px solid var(--border,#334155);background:var(--bg3,#1f2937);color:var(--fg,#e5e7eb);font:inherit;font-weight:700;cursor:pointer}' +
      '.cph-acts button.primary{background:linear-gradient(135deg,#7c3aed,#6d28d9);border-color:#6d28d9;color:#fff}' +
      '@keyframes cphFade{from{opacity:0}}@keyframes cphPop{from{opacity:0;transform:translateY(-4px)}}@keyframes cphSheet{from{transform:translateY(100%)}}' +
      '@media (prefers-reduced-motion:reduce){.cph,.cph.sheet,.cph-back{animation:none}}@media print{.cp-hint,.cph,.cph-back{display:none!important}}';
    (document.head || document.documentElement).appendChild(st);
  }
  var INFO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6"/><path d="M12 7.5h.01"/></svg>';
  function close(refocus) {
    if (!open) return; var o = open; open = null;
    document.removeEventListener('keydown', o.key, true); window.removeEventListener('resize', o.onResize);
    o.el.remove(); o.back.remove(); if (o.anchor) { o.anchor.setAttribute('aria-expanded', 'false'); if (refocus) try { o.anchor.focus(); } catch (_) {} }
  }
  function show(key, anchor) {
    var h = HINTS[key]; if (!h) return;
    if (open && open.anchor === anchor) { close(true); return; }
    close(false); addCss();
    var sheet = window.matchMedia('(max-width: 600px)').matches;
    var back = document.createElement('div'); back.className = 'cph-back' + (sheet ? ' sheet' : '');
    var el = document.createElement('div'); el.className = 'cph' + (sheet ? ' sheet' : ''); el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', sheet ? 'true' : 'false');
    var title = typeof h.title === 'function' ? h.title() : h.title;
    el.setAttribute('aria-label', title);
    el.innerHTML = '<div class="cph-h"><h3></h3><button type="button" class="cph-x" aria-label="Close">×</button></div><div class="cph-b"></div>';
    el.querySelector('h3').textContent = title;
    el.querySelector('.cph-b').innerHTML = typeof h.body === 'function' ? h.body() : h.body;
    var acts = h.actions ? h.actions() : [];
    if (acts.length) {
      var row = document.createElement('div'); row.className = 'cph-acts';
      acts.forEach(function (a) { var b = document.createElement('button'); b.type = 'button'; b.textContent = a.label; if (a.primary) b.className = 'primary'; b.onclick = function () { close(false); a.onClick(); }; row.appendChild(b); });
      el.appendChild(row);
    }
    document.body.append(back, el);
    var place = function () {
      if (sheet || !anchor) { if (!sheet) { el.style.left = Math.max(8, (innerWidth - el.offsetWidth) / 2) + 'px'; el.style.top = '80px'; } return; }
      var r = anchor.getBoundingClientRect(), w = el.offsetWidth, hh = el.offsetHeight;
      var left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
      var top = r.bottom + 8; if (top + hh > innerHeight - 8) top = Math.max(8, r.top - hh - 8);
      el.style.left = left + 'px'; el.style.top = top + 'px';
    };
    place();
    var key2 = function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); } };
    open = { el: el, back: back, anchor: anchor, key: key2, onResize: function () { close(false); } };
    if (anchor) anchor.setAttribute('aria-expanded', 'true');
    back.addEventListener('click', function () { close(false); });
    el.querySelector('.cph-x').onclick = function () { close(true); };
    document.addEventListener('keydown', key2, true); window.addEventListener('resize', open.onResize);
    setTimeout(function () { var x = el.querySelector('.cph-x'); if (x) x.focus(); }, 0);
    return el;
  }
  // Every .cp-hint[data-hint] gets the ⓘ drawing and opens its text — including ones added later.
  function paint(root) {
    var list = (root || document).querySelectorAll('.cp-hint[data-hint]:not([data-hint-ready])');
    for (var i = 0; i < list.length; i++) {
      var b = list[i]; b.setAttribute('data-hint-ready', ''); if (!b.innerHTML.trim()) b.innerHTML = INFO;
      if (!b.getAttribute('aria-label')) { var h = HINTS[b.getAttribute('data-hint')]; b.setAttribute('aria-label', 'About ' + (h ? String(typeof h.title === 'function' ? h.title() : h.title).split(':')[0] : 'this')); }
      b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false'); if (!b.type) b.type = 'button';
    }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.cp-hint[data-hint]');
    if (!b) return; e.preventDefault(); e.stopPropagation(); paint(b.parentNode); show(b.getAttribute('data-hint'), b);
  }, true);
  // an ⓘ inside a card that is itself a button / link is a <span role="button">: Enter / Space open it too
  document.addEventListener('keydown', function (e) {
    var b = e.target && e.target.matches && e.target.matches('span.cp-hint[data-hint]') ? e.target : null;
    if (!b || (e.key !== 'Enter' && e.key !== ' ')) return; e.preventDefault(); e.stopPropagation(); show(b.getAttribute('data-hint'), b);
  }, true);
  addCss();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { paint(); }); else paint();
  var queued = false;   // lists re-render often: paint new ⓘ at most once per frame
  new MutationObserver(function () { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; paint(); }); })
    .observe(document.documentElement, { childList: true, subtree: true });

  window.CPHint = { open: show, close: close, paint: paint, HINTS: HINTS, add: function (key, def) { HINTS[key] = def; } };
})();
