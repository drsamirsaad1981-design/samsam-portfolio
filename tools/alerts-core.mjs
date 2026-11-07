// tools/alerts-core.mjs — the Telegram alerts' brain: no network, no secrets. tools/alerts.mjs feeds it your portfolio
// (from Firebase) and the market files (from the prices branch); it returns the messages to send and the new state.
//
//   summarize(user, market)            → the numbers: value, profit, vs BTC, movers, signals, plan, exit levels…
//   evaluate(sum, market, state, cfg, now) → { messages: [{ key, text, buttons, urgent }], state }
//
// Every alert is sent once: the state remembers what was already said (a signal, a target met, a level crossed),
// and a condition can alert again only after it went away. Quiet hours hold non-urgent alerts until morning.

import * as C from '../samsam-core.js';

export const APP = 'https://drsamirsaad1981-design.github.io/samsam-portfolio/';
export const TZ = 'Asia/Riyadh';
export const DEFAULTS = Object.freeze({
  lang: 'en', brief: true, briefTime: '08:30', weekly: true, moves: true, movePct: 5, signals: true, plan: true,
  tp: true, macro: true, sentiment: true, etf: true, etfMin: 500, quiet: true, health: true,
});
const DEFAULT_SIGNAL = { reinforce: -5, sell: -20 };
const DEFAULT_EXIT_TARGETS = { btcD: 45.9, usdtHi: 3.73, usdtLo: 1.914, ethBtc: 0.085 };
const DEFAULT_EXIT_STEPS = { mults: [2, 3, 5], pcts: [25, 50, 25] };
const H = 3600e3, DAY = 24 * H;

export function settings(meta) {
  const a = (meta && meta.alerts) || {}, d = DEFAULTS, out = { ...d };
  for (const k of Object.keys(d)) if (k in a && typeof a[k] === typeof d[k]) out[k] = a[k];
  out.lang = a.lang === 'ar' ? 'ar' : 'en';
  out.movePct = Math.min(50, Math.max(1, +out.movePct || d.movePct));
  out.etfMin = Math.min(10000, Math.max(50, +out.etfMin || d.etfMin));
  if (!/^\d{2}:\d{2}$/.test(out.briefTime)) out.briefTime = d.briefTime;
  return out;
}

// ── words (English / Arabic; numbers, tickers and $ stay Latin) ──
const W = {
  en: {
    brief: 'Morning brief', weekly: 'Weekly report', today: 'today', week: 'this week', profit: 'All Time Profit', vsBtc: 'vs holding BTC',
    best: 'Best today', worst: 'Worst today', bestW: 'Best this week', worstW: 'Worst this week', market: 'Market', dom: 'Dominance',
    fng: 'Fear & Greed', alt: 'Altcoin Season', etf: 'ETF flows', signals: 'Signals', plan: 'Plan', met: 'targets met',
    reinforce: 'Reinforce', sell: 'Sell / Convert to BTC', hold: 'Hold', open: 'Open portfolio', hub: 'Market Hub', planBtn: 'Open the plan',
    coinBtn: s => `Open ${s}`, seasonBtn: 'Altcoin Season', btcMove: (pct, h) => `BTC ${pct} in ${h}`, pfMove: (pct, h) => `Your portfolio ${pct} in ${h}`,
    since: 'since the last alert', yourPf: 'Your portfolio', h24: '24h', sig: s => `Signal change · ${s}`, vsAvg: 'vs your avg',
    holding: 'Holding', targetHit: s => `Plan target reached · ${s}`, planNow: 'Plan', tpHit: (n, s) => `Take-profit ${n} reached · ${s}`,
    tpLine: (n, p, x, pct) => `Price ${p} ≥ TP${n} ${x}${pct ? ` · your plan sells ${pct}% here` : ''}`, macro: 'Exit level reached',
    btcD: 'BTC dominance', usdtD: 'USDT dominance', ethBtc: 'ETH/BTC', of3: n => `${n} of 3 of your exit conditions are met`, allExit: 'All 3 exit conditions are met — your exit zone',
    xFear: 'Extreme Fear', xGreed: 'Extreme Greed', was: 'yesterday', altSeason: 'Altcoin Season', btcSeason: 'Bitcoin Season', idx: 'index',
    bigEtf: 'Big ETF day', health: 'Data warning', stale: (what, h) => `${what} not updated for ${h} h — the app may show old numbers.`,
    marketData: 'Market data', etfData: 'ETF flows', priceData: 'Price history', ok: 'Data back to normal', none: 'none', coins: 'coins',
    quietNote: 'held during quiet hours', welcome: 'Alerts are on. You will get the morning brief every day, the weekly report on Friday, and an alert whenever something important happens.',
    noData: 'no history yet', in7: '7 days', beatBtc: (a, n) => `${a} of ${n} coins beat BTC`,
    vsBtc30: (a, b) => `vs BTC ${a} pts (30d) · ${b} pts (90d)`, smartWeak: 'Smart: not adding, it keeps losing to BTC', smartStrong: 'Smart: holding, it is beating BTC',
  },
  ar: {
    brief: 'ملخص الصباح', weekly: 'التقرير الأسبوعي', today: 'اليوم', week: 'هذا الأسبوع', profit: 'إجمالي الربح', vsBtc: 'مقارنة بالاحتفاظ بـ BTC',
    best: 'الأفضل اليوم', worst: 'الأسوأ اليوم', bestW: 'الأفضل هذا الأسبوع', worstW: 'الأسوأ هذا الأسبوع', market: 'السوق', dom: 'السيطرة',
    fng: 'الخوف والطمع', alt: 'موسم العملات البديلة', etf: 'تدفقات ETF', signals: 'الإشارات', plan: 'الخطة', met: 'أهداف تحققت',
    reinforce: 'تعزيز', sell: 'بيع / تحويل لـ BTC', hold: 'احتفاظ', open: 'افتح المحفظة', hub: 'Market Hub', planBtn: 'افتح الخطة',
    coinBtn: s => `افتح ${s}`, seasonBtn: 'موسم العملات البديلة', btcMove: (pct, h) => `BTC ${pct} خلال ${h}`, pfMove: (pct, h) => `محفظتك ${pct} خلال ${h}`,
    since: 'منذ آخر تنبيه', yourPf: 'محفظتك', h24: '24 ساعة', sig: s => `تغيّر الإشارة · ${s}`, vsAvg: 'مقارنة بمتوسط شرائك',
    holding: 'قيمة ما تملكه', targetHit: s => `تحقق هدف الخطة · ${s}`, planNow: 'الخطة', tpHit: (n, s) => `وصل جني الأرباح ${n} · ${s}`,
    tpLine: (n, p, x, pct) => `السعر ${p} ≥ TP${n} ${x}${pct ? ` · خطتك تبيع ${pct}% هنا` : ''}`, macro: 'تحقق مستوى خروج',
    btcD: 'سيطرة BTC', usdtD: 'سيطرة USDT', ethBtc: 'ETH/BTC', of3: n => `تحقق ${n} من 3 من شروط الخروج`, allExit: 'تحققت شروط الخروج الثلاثة — منطقة الخروج',
    xFear: 'خوف شديد', xGreed: 'طمع شديد', was: 'أمس', altSeason: 'موسم العملات البديلة', btcSeason: 'موسم البيتكوين', idx: 'المؤشر',
    bigEtf: 'يوم كبير لصناديق ETF', health: 'تنبيه بيانات', stale: (what, h) => `${what} لم تتحدث منذ ${h} ساعة — قد يعرض التطبيق أرقامًا قديمة.`,
    marketData: 'بيانات السوق', etfData: 'تدفقات ETF', priceData: 'سجل الأسعار', ok: 'البيانات عادت طبيعية', none: 'لا شيء', coins: 'عملة',
    quietNote: 'أُجّل خلال ساعات الهدوء', welcome: 'التنبيهات تعمل. سيصلك ملخص الصباح يوميًا، والتقرير الأسبوعي يوم الجمعة، وتنبيه عند حدوث أي شيء مهم.',
    noData: 'لا يوجد سجل بعد', in7: '7 أيام', beatBtc: (a, n) => `${a} من ${n} عملة تفوقت على BTC`,
    vsBtc30: (a, b) => `مقارنة بـ BTC ${a} نقطة (30 يوم) · ${b} نقطة (90 يوم)`, smartWeak: 'ذكي: لا تعزيز، تخسر أمام BTC باستمرار', smartStrong: 'ذكي: احتفاظ، تتفوق على BTC',
  },
};

// ── formatting ──
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function usd(v) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
  if (a >= 100) return s + '$' + a.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (a >= 1) return s + '$' + a.toFixed(2);
  if (a === 0) return '$0';
  return s + '$' + a.toPrecision(3);
}
const usd2 = v => (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v, d = 2) => v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%';
const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + usd(Math.abs(v)).replace('−', '');
const dot = v => v > 0 ? '🟢' : v < 0 ? '🔴' : '⚪';
const flow = v => (v < 0 ? '−' : '+') + (Math.abs(v) >= 1e9 ? '$' + (Math.abs(v) / 1e9).toFixed(2) + 'B' : '$' + Math.round(Math.abs(v) / 1e6) + 'M');
export function local(now, opt) { return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opt }).format(new Date(now)); }
export function localParts(now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(new Date(now)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, hour: +p.hour, weekday: p.weekday };
}
const isoWeek = d => { const t = new Date(d + 'T00:00:00Z'); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return t.getUTCFullYear() + '-W' + (1 + Math.round(((t - y) / DAY - 3 + ((y.getUTCDay() + 6) % 7)) / 7)); };

// ── market helpers ──
export function priceSeries(file) {   // p/<id>.json → { at(t), last, lastT }
  if (!file || !Array.isArray(file.p)) return null;
  let li = file.p.length - 1; while (li >= 0 && !(file.p[li] > 0)) li--;
  if (li < 0) return null;
  return { last: file.p[li], lastT: file.t0 + li * file.step,
    at: t => { const i = Math.round((t - file.t0) / file.step); for (let k = Math.min(i, li); k >= 0 && k >= i - 6; k--) if (file.p[k] > 0) return file.p[k]; return null; } };
}

// ── the numbers ──
// user: { coins, txs, accum, meta }; market: { top: [rows], top500: [rows], series: { id: priceSeries }, global, fng, alt, altPage, etf, parts, cgIds }
export function summarize(user, market, now = Date.now()) {
  const meta = user.meta || {}, rows = [...(market.top || []), ...(market.top500 || [])];
  const byId = new Map(rows.map(r => [r.id, r]));
  const idOf = c => c.cgId || (market.cgIds || {})[c.sym] || null;
  const prices = {}, info = {};
  for (const c of user.coins || []) {
    if (!c || !c.sym || c.removed) continue;
    const id = idOf(c), r = id && byId.get(id), s = id && market.series && market.series[id];
    const price = r && r.price > 0 ? r.price : s ? s.last : (c.lastPrice > 0 ? c.lastPrice : null);
    const p24 = s && s.at(now - DAY), p7 = s && s.at(now - 7 * DAY);
    const ch24 = r && r.ch24 != null ? r.ch24 : (price && p24 ? (price / p24 - 1) * 100 : null);
    const ch7 = r && r.ch7 != null ? r.ch7 : (price && p7 ? (price / p7 - 1) * 100 : null);
    if (price) prices[c.sym] = { usd: price, ch24 };
    info[c.sym] = { id, ch24, ch7, p24: ch24 != null && price ? price / (1 + ch24 / 100) : null, p7: ch7 != null && price ? price / (1 + ch7 / 100) : null };
  }
  const pf = C.derivePortfolio(user.coins, user.txs, prices).filter(c => c.qty > 1e-12);
  const rz = C.realizedPnl(user.coins, user.txs);
  const value = pf.reduce((s, c) => s + c.qty * c.currentPrice, 0), cost = pf.reduce((s, c) => s + c.qty * c.basePrice, 0);
  const value24 = pf.reduce((s, c) => s + c.qty * (info[c.sym].p24 || c.currentPrice), 0);
  const value7 = pf.reduce((s, c) => s + c.qty * (info[c.sym].p7 || c.currentPrice), 0);
  const total = value - cost + rz.total, invested = cost + rz.soldCost;
  // vs holding BTC (the app's Portfolio vs BTC, summed over your coins)
  const btcRow = byId.get('bitcoin'), btcSer = market.series && market.series.bitcoin;
  const btcNow = (btcRow && btcRow.price) || (btcSer && btcSer.last) || 0;
  const baselineBtc = (meta.baseline && meta.baseline.btcPrice) || 81162;
  const vs = C.vsBtcByCoin(user.coins, user.txs, { prices: Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, v.usd])), btcNow, btcAt: btcSer ? (t => btcSer.at(t)) : null, baselineBtc });
  let cp = 0, bp = 0, cb = 0, beat = 0, alts = 0;
  for (const c of pf) { const v = vs[c.sym]; if (!v) continue; const k = c.qty * c.basePrice; cp += v.coinPct * k / 100; bp += v.btcPct * k / 100; cb += k; if (c.sym !== 'BTC') { alts++; if (v.pct > 0) beat++; } }
  // signals (the app's rule: price vs your average buy price; BTC is always Hold)
  // (the app's rule, samsam-core.js → signalFor: price vs your average buy price, Smart-checked vs BTC over 30 / 90 days)
  const rule = meta.signal && isFinite(meta.signal.reinforce) && isFinite(meta.signal.sell) ? meta.signal : DEFAULT_SIGNAL;
  const smart = meta.signalSmart !== false, rsMap = C.strengthMap(market.altPage);
  const signal = {}, coinRows = [];
  for (const c of pf) {
    const chg = c.basePrice > 0 ? (c.currentPrice / c.basePrice - 1) * 100 : 0;
    const si = C.signalFor({ sym: c.sym, chg, rules: rule, rs: info[c.sym].id ? rsMap[info[c.sym].id] : null, smart });
    signal[c.sym] = si.action === 'convert' ? 'sell' : si.action;
    coinRows.push({ sym: c.sym, value: c.qty * c.currentPrice, price: c.currentPrice, avg: c.basePrice, chg, qty: c.qty, ch24: info[c.sym].ch24, ch7: info[c.sym].ch7, why: si.why, rs: si.rs });
  }
  const sigMode = JSON.stringify({ r: rule.reinforce, s: rule.sell, smart });
  const counts = { reinforce: 0, sell: 0, hold: 0 }; Object.values(signal).forEach(s => counts[s]++);
  // accumulation plan
  const held = Object.fromEntries(pf.map(c => [c.sym.toUpperCase(), c.qty]));
  const plan = (user.accum || []).filter(a => a && a.sym && a.targetQty > 0).map(a => ({ sym: a.sym.toUpperCase(), target: +a.targetQty, actual: held[a.sym.toUpperCase()] || 0 }));
  const prog = C.overallProgress(plan.map(p => ({ actual: p.actual, target: p.target })));
  // exit plan take-profit levels (a fixed price you typed, or your average × the step's multiplier)
  const steps = meta.exitSteps && Array.isArray(meta.exitSteps.mults) ? meta.exitSteps : DEFAULT_EXIT_STEPS;
  const tps = [];
  for (const e of Array.isArray(meta.exitPlan) ? meta.exitPlan : []) {
    const c = pf.find(x => x.sym === String(e.sym || '').toUpperCase()); if (!c) continue;
    (e.tps || []).slice(0, 3).forEach((t, i) => {
      const auto = c.basePrice * (steps.mults[i] || DEFAULT_EXIT_STEPS.mults[i]);
      const lvl = t.lock === true ? +t.price : t.lock === false ? auto : (+t.price > 0 ? +t.price : auto);
      if (lvl > 0) tps.push({ sym: c.sym, n: i + 1, level: lvl, price: c.currentPrice, pct: t.pct, mult: t.lock === true ? null : (steps.mults[i] || null) });
    });
  }
  // macro exit levels
  const T = { ...DEFAULT_EXIT_TARGETS, ...(meta.exitTargets || {}) };
  const g = market.global || {}, d = g.dom || {};
  const ethbtc = market.altPage && Array.isArray(market.altPage.ethbtc) && market.altPage.ethbtc.length ? market.altPage.ethbtc[market.altPage.ethbtc.length - 1][1] : null;
  const macro = [
    { k: 'btcD', now: d.btc, lvl: T.btcD, met: d.btc != null && d.btc <= T.btcD, op: '≤', dp: 1, unit: '%' },
    { k: 'usdtD', now: d.usdt, lvl: T.usdtHi, met: d.usdt != null && d.usdt <= T.usdtHi, op: '≤', dp: 2, unit: '%' },
    { k: 'ethBtc', now: ethbtc, lvl: T.ethBtc, met: ethbtc != null && ethbtc >= T.ethBtc, op: '≥', dp: 4, unit: '' },
  ];
  return {
    value, cost, total, invested, pctTotal: invested > 0 ? total / invested * 100 : 0,
    ch24: value24 > 0 ? (value / value24 - 1) * 100 : null, d24: value - value24, ch7: value7 > 0 ? (value / value7 - 1) * 100 : null, d7: value - value7,
    vsBtc: cb > 0 ? (cp - bp) / cb * 100 : null, beat, alts, coins: coinRows, signal, sigMode, counts, plan, prog, tps, macro, btcNow,
    btc24: btcRow ? btcRow.ch24 : null, btc7: btcRow ? btcRow.ch7 : null,
  };
}

// ── messages ──
const btn = (text, path) => ({ text, url: APP + (path || '') });
function movers(sum, key, n = 3) {
  const list = sum.coins.filter(c => c[key] != null && c.value >= 1);
  const up = [...list].sort((a, b) => b[key] - a[key]).slice(0, n).filter(c => c[key] > 0);
  const dn = [...list].sort((a, b) => a[key] - b[key]).slice(0, n).filter(c => c[key] < 0);
  const line = c => `<code>${esc(c.sym.padEnd(6))} ${pct(c[key], 1).padStart(7)}</code>  ${usd(c.value)}`;
  return { up: up.map(line), dn: dn.map(line) };
}
function marketLines(t, m) {
  const g = m.global || {}, d = g.dom || {}, out = [];
  if (m.btc) out.push(`BTC  <b>${usd(m.btc.price)}</b>  ${dot(m.btc.ch24)} ${pct(m.btc.ch24)}`);
  if (d.btc != null) out.push(`${t.dom}  BTC ${d.btc.toFixed(1)}% · USDT ${(d.usdt || 0).toFixed(2)}%`);
  if (m.fng) out.push(`${esc(t.fng)}  <b>${m.fng.value}</b> · ${esc(m.fng.label)}`);
  if (m.alt && m.alt.value != null) out.push(`${t.alt}  <b>${m.alt.value}</b> · ${esc(m.alt.label)}`);
  const e = etfDay(m.etf);
  if (e) out.push(`${t.etf} (${e.label})  BTC ${flow(e.btc)} · ETH ${flow(e.eth)}`);
  return out;
}
function etfDay(etf) {
  if (!etf || !etf.btc || !etf.btc.days || !etf.btc.days.length) return null;
  const b = etf.btc.days[etf.btc.days.length - 1], e = etf.eth && etf.eth.days && etf.eth.days.find(x => x[0] === b[0]);
  return { date: b[0], label: new Date(b[0] + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), btc: b[1], eth: e ? e[1] : 0 };
}
export function brief(sum, m, cfg, now, weekly = false) {
  const t = W[cfg.lang], key = weekly ? 'ch7' : 'ch24', mv = movers(sum, key);
  const head = `${weekly ? '🗓' : '☀️'} <b>${weekly ? t.weekly : t.brief}</b> · ${local(now, { weekday: 'short', day: 'numeric', month: 'short' })}`;
  const ch = weekly ? sum.ch7 : sum.ch24, dv = weekly ? sum.d7 : sum.d24;
  const L = [head, '',
    `💼 <b>${usd2(sum.value)}</b>   ${dot(ch)} ${pct(ch)} (${signed(dv)}) ${weekly ? t.week : t.today}`,
    `${t.profit}  <b>${signed(sum.total)}</b> (${pct(sum.pctTotal, 1)})`];
  if (sum.vsBtc != null) L.push(`${t.vsBtc}  ${dot(sum.vsBtc)} ${pct(sum.vsBtc)} · ${t.beatBtc(sum.beat, sum.alts)}`);
  if (mv.up.length) L.push('', `📈 <b>${weekly ? t.bestW : t.best}</b>`, ...mv.up);
  if (mv.dn.length) L.push('', `📉 <b>${weekly ? t.worstW : t.worst}</b>`, ...mv.dn);
  const ml = marketLines(t, m); if (ml.length) L.push('', `🌍 <b>${t.market}</b>`, ...ml);
  L.push('', `🎯 <b>${t.signals}</b>  ${sum.counts.reinforce} ${t.reinforce} · ${sum.counts.sell} ${t.sell.split(' /')[0]} · ${sum.counts.hold} ${t.hold}`);
  if (sum.plan.length) L.push(`📋 <b>${t.plan}</b>  ${sum.prog.pct.toFixed(1)}% · ${sum.prog.completed}/${sum.prog.counted} ${t.met}`);
  const mc = sum.macro.filter(x => x.met).length; if (mc) L.push(`🧭 ${t.of3(mc)}`);
  return { key: weekly ? 'weekly' : 'brief', text: L.join('\n'), buttons: [[btn(t.open, 'index.html'), btn(t.hub, 'market.html')]] };
}

// ── what happened since last time ──
export function evaluate(sum, m, state0, cfg, now = Date.now()) {
  const t = W[cfg.lang], st = JSON.parse(JSON.stringify(state0 || {})), out = [], lp = localParts(now);
  const first = !st.v;
  st.v = 1; st.sig = st.sig || {}; st.plan = st.plan || {}; st.tp = st.tp || {}; st.macro = st.macro || {}; st.health = st.health || {};
  const quiet = cfg.quiet && lp.hour < 7;
  const push = (msg, urgent = false) => { if (quiet && !urgent) return false; out.push({ ...msg, urgent }); return true; };

  // 1. moves (BTC, your portfolio): from the price at the last alert (or the first run), so a slow slide still alerts once per step
  if (cfg.moves) {
    for (const [k, nowV, title, extra] of [['btc', sum.btcNow, t.btcMove, () => `${t.yourPf}: ${usd2(sum.value)} (${pct(sum.ch24)} ${t.h24})`], ['pf', sum.value, t.pfMove, () => `BTC ${usd(sum.btcNow)} (${pct(sum.btc24)} ${t.h24})`]]) {
      if (!(nowV > 0)) continue;
      const ref = st[k + 'Ref'];
      if (!ref || !(ref.v > 0) || now - ref.t > 3 * DAY) { st[k + 'Ref'] = { v: nowV, t: now }; continue; }
      const ch = (nowV / ref.v - 1) * 100;
      if (Math.abs(ch) >= cfg.movePct) {
        const hrs = Math.max(1, Math.round((now - ref.t) / H)), span = hrs >= 20 && hrs <= 28 ? t.h24 : `${hrs}h`;
        const text = `${ch > 0 ? '🚀' : '🔻'} <b>${title(pct(ch, 1), span)}</b>\n${k === 'btc' ? `BTC <b>${usd(nowV)}</b>` : `${t.yourPf} <b>${usd2(nowV)}</b>`} · ${t.since}\n${extra()}`;
        if (push({ key: 'move-' + k, text, buttons: [[btn(t.hub, 'market.html'), btn(t.open, 'index.html')]] }, Math.abs(ch) >= 2 * cfg.movePct)) st[k + 'Ref'] = { v: nowV, t: now };
      }
    }
  }
  // 2. signals that changed
  if (cfg.signals) {
    const names = { reinforce: t.reinforce, sell: t.sell, hold: t.hold }, icon = { reinforce: '🟢', sell: '🔴', hold: '⚪' };
    const reset = st.sigMode !== sum.sigMode; st.sigMode = sum.sigMode;   // you changed the thresholds or Smart: start again, silently
    for (const c of sum.coins) {
      const now1 = sum.signal[c.sym], was = st.sig[c.sym];
      if (first || !was || reset) { st.sig[c.sym] = now1; continue; }
      if (was === now1) continue;
      const pts = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(0);
      const vsB = c.rs ? `\n${t.vsBtc30(pts(c.rs.d30), pts(c.rs.d90))}${c.why === 'weak' ? ' · ' + t.smartWeak : c.why === 'strong' ? ' · ' + t.smartStrong : ''}` : '';
      const text = `${icon[now1]} <b>${t.sig(esc(c.sym))}</b>\n${names[was]} → <b>${names[now1]}</b>\n${usd(c.price)} · ${pct(c.chg, 1)} ${t.vsAvg} ${usd(c.avg)}${vsB}\n${t.holding}: ${usd(c.value)}`;
      if (push({ key: 'sig-' + c.sym, text, buttons: [[btn(t.coinBtn(c.sym), 'index.html#holdings/' + encodeURIComponent(c.sym))]] })) st.sig[c.sym] = now1;
    }
    for (const s of Object.keys(st.sig)) if (!sum.signal[s]) delete st.sig[s];
  }
  // 3. plan targets reached
  if (cfg.plan) {
    for (const p of sum.plan) {
      const met = p.actual >= p.target;
      if (!met) { delete st.plan[p.sym]; continue; }
      if (st.plan[p.sym] || first) { st.plan[p.sym] = 1; continue; }
      const text = `🎯 <b>${t.targetHit(esc(p.sym))}</b>\n${+p.actual.toFixed(6)} / ${+p.target.toFixed(6)} ${esc(p.sym)} ✅\n${t.planNow}: ${sum.prog.pct.toFixed(1)}% · ${sum.prog.completed}/${sum.prog.counted} ${t.met}`;
      if (push({ key: 'plan-' + p.sym, text, buttons: [[btn(t.planBtn, 'accumulation.html')]] })) st.plan[p.sym] = 1;
    }
  }
  // 4. take-profit levels of your exit plan (alert when the price gets there; again only after it fell 10% below)
  if (cfg.tp) {
    for (const x of sum.tps) {
      const k = x.sym + ':' + x.n;
      if (x.price < x.level * 0.9) { delete st.tp[k]; continue; }
      if (x.price < x.level || st.tp[k]) continue;
      if (first) { st.tp[k] = 1; continue; }
      const lvl = usd(x.level) + (x.mult ? ` (${x.mult}×)` : '');
      const text = `💰 <b>${t.tpHit(x.n, esc(x.sym))}</b>\n${t.tpLine(x.n, usd(x.price), lvl, x.pct)}`;
      if (push({ key: 'tp-' + k, text, buttons: [[btn(t.planBtn, 'accumulation.html'), btn(t.coinBtn(x.sym), 'index.html#holdings/' + encodeURIComponent(x.sym))]] })) st.tp[k] = 1;
    }
  }
  // 5. your macro exit levels (BTC.D, USDT.D, ETH/BTC)
  if (cfg.macro) {
    const n = sum.macro.filter(x => x.met).length;
    for (const x of sum.macro) {
      if (!x.met) { delete st.macro[x.k]; continue; }
      if (st.macro[x.k] || first) { st.macro[x.k] = 1; continue; }
      const text = `🧭 <b>${t.macro} · ${t[x.k]}</b>\n${(+x.now).toFixed(x.dp)}${x.unit} ${x.op} ${(+x.lvl).toFixed(x.dp)}${x.unit}\n${n === 3 ? '🏁 <b>' + t.allExit + '</b>' : t.of3(n)}`;
      if (push({ key: 'macro-' + x.k, text, buttons: [[btn(t.planBtn, 'accumulation.html')]] }, n === 3)) st.macro[x.k] = 1;
    }
  }
  // 6. sentiment: Fear & Greed extremes, Altcoin / Bitcoin Season
  if (cfg.sentiment) {
    const f = m.fng && +m.fng.value, fz = f == null || isNaN(f) ? st.fz : f <= 20 ? 'fear' : f >= 80 ? 'greed' : 'mid';
    if (fz && fz !== st.fz) {
      if (!first && st.fz && fz !== 'mid') push({ key: 'fng', text: `${fz === 'fear' ? '😱' : '🤑'} <b>${fz === 'fear' ? t.xFear : t.xGreed}</b> · ${esc(t.fng)} <b>${f}</b>${m.fng.prev != null ? ` (${t.was} ${m.fng.prev})` : ''}`, buttons: [[btn(t.hub, 'market.html')]] });
      st.fz = fz;
    }
    const a = m.alt && +m.alt.value, az = a == null || isNaN(a) ? st.az : a >= 75 ? 'alt' : a <= 25 ? 'btc' : 'mid';
    if (az && az !== st.az) {
      if (!first && st.az && az !== 'mid') push({ key: 'season', text: `${az === 'alt' ? '🌈' : '🟠'} <b>${az === 'alt' ? t.altSeason : t.btcSeason}</b> · ${t.idx} <b>${a}</b>`, buttons: [[btn(t.seasonBtn, 'altseason.html')]] });
      st.az = az;
    }
  }
  // 7. a big ETF day
  if (cfg.etf) {
    const e = etfDay(m.etf);
    if (e && e.date !== st.etfDay) {
      const big = Math.abs(e.btc) >= cfg.etfMin * 1e6 || Math.abs(e.eth) >= cfg.etfMin * 1e6;
      if (big && !first) { if (push({ key: 'etf', text: `🏦 <b>${t.bigEtf} (${e.label})</b>\nBTC ${flow(e.btc)} · ETH ${flow(e.eth)}`, buttons: [[btn(t.hub, 'market.html')]] })) st.etfDay = e.date; }
      else st.etfDay = e.date;
    }
  }
  // 8. data health: a source that stopped updating
  if (cfg.health) {
    const ages = { market: m.parts && m.parts.top ? now - Date.parse(m.parts.top) : null, prices: m.priceT ? now - m.priceT : null, etf: m.etf && m.etf.updated ? now - Date.parse(m.etf.updated) : null };
    const lim = { market: 3 * H, prices: 4 * H, etf: 4 * DAY }, what = { market: t.marketData, prices: t.priceData, etf: t.etfData };
    for (const k of Object.keys(lim)) {
      const bad = ages[k] != null && ages[k] > lim[k];
      if (!bad) { if (st.health[k]) { delete st.health[k]; } continue; }
      if (st.health[k] === lp.date) continue;
      if (push({ key: 'health-' + k, text: `🛠 <b>${t.health}</b>\n${t.stale(what[k], Math.round(ages[k] / H))}` })) st.health[k] = lp.date;
    }
  }
  // 9. the morning brief (once a day, at your time) and the weekly report (Friday)
  if (first) { const b = brief(sum, m, cfg, now); b.text = `🔔 ${t.welcome}\n\n` + b.text; out.unshift({ ...b, urgent: true }); st.briefDay = lp.date; }
  else {
    if (cfg.brief && st.briefDay !== lp.date && lp.hm >= cfg.briefTime) { out.unshift({ ...brief(sum, m, cfg, now), urgent: true }); st.briefDay = lp.date; }
    if (cfg.weekly && lp.weekday === 'Fri' && st.weekDay !== isoWeek(lp.date) && lp.hm >= '09:00') { out.push({ ...brief(sum, m, cfg, now, true), urgent: true }); st.weekDay = isoWeek(lp.date); }
  }
  st.t = now;
  return { messages: out, state: st };
}
