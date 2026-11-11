// tools/worker/bot.mjs — the Telegram bot that answers you (phase 1), running in the same Cloudflare Worker as AI Analysis.
//
//   POST /tg          Telegram's webhook. Only Telegram (it sends the secret header) and only your chat get an answer —
//                     anyone else is ignored silently.
//   GET  /tg/setup?key=<TG_SECRET>
//                     one-time setup: points Telegram at this Worker, sets the "/" menu, sends you a welcome message.
//
// What it can do now: your portfolio, a coin (any coin), the market, your plan, best / worst, signals — each with
// buttons that redraw the same message in place (🔄 = fresh numbers). Type a ticker ("btc", "sol eth") for its price.
// The numbers are the app's own (tools/alerts-core.mjs → summarize, samsam-core.js), with live prices on top.
//
// Worker secrets (Settings → Variables and Secrets): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, FIREBASE_SERVICE_ACCOUNT,
// TG_SECRET (any long random text of letters, digits, _ and -). Nothing secret is in this file.

import { summarize, settings, W, esc, usd, usd2, pct, dot, signed, local, isStable, etfDay, flow, APP } from '../alerts-core.mjs';
import { loadMarket, loadUser, findCoin, cgIdOf, serviceAccount } from './data.mjs';

const H = 3600e3;
const LIQ = 'https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=';

// ── words (Arabic / English) — the bot speaks the language you chose for the alerts in the app ──
const T = {
  en: {
    hi: 'Hi Samir 👋', menuTitle: 'What would you like to see?', pf: '💼 Portfolio', coin: '🪙 A coin', market: '🌍 Market', plan: '📋 Plan',
    movers: '🏆 Best & worst', signals: '🎯 Signals', refresh: '🔄 Refresh', back: '⬅️ Menu', openApp: '📱 Open the app', liq: '🔥 Liq Map',
    chart: '📈 Chart', inApp: '💼 In the app', pfNow: 'Your portfolio now', askCoin: 'Send a ticker or a name — e.g. <code>btc</code>, <code>sol eth</code> or <code>pendle</code>.',
    notFound: q => `I couldn't find “${q}”. Try the ticker (e.g. <code>sol</code>) or the full name.`,
    noUser: 'Your portfolio is not connected yet (FIREBASE_SERVICE_ACCOUNT is missing in the Worker).', soon: 'Talking to me in plain words arrives in the next phase. For now: tap a button, or send a ticker like <code>btc</code>.',
    err: 'Something went wrong on my side — please try again in a minute.', rank: 'Rank', cap: 'Cap', vol: 'Vol 24h', h24: '24h', d7: '7d', d30: '30d',
    you: 'You hold', avg: 'avg', signal: 'Signal', noHold: "You don't hold it.", live: 'live', snap: m => `snapshot ${m} min old`, src: 'CoinGecko',
    planT: 'Accumulation plan', overall: 'Overall', done: 'done', left: 'left', dca: 'Regular buys (DCA)', next: 'next', buyAt: 'Buy-price alerts', away: 'away',
    noPlan: 'No plan targets yet — set them on the Accumulation page.', best24: 'Best 24h', worst24: 'Worst 24h', best7: 'Best 7d', worst7: 'Worst 7d',
    mvT: 'Best & worst (your coins)', noStable: 'stablecoins left out', sigT: 'Signals', reinforce: '🟢 Reinforce', sell: '🔴 Sell / convert to BTC', hold: '⚪ Hold',
    vsAvg: 'vs your avg', mkT: 'Market', topUp: 'Top 500 · best 24h', topDn: 'Top 500 · worst 24h', updated: 'Updated', futures: 'Futures', yes: 'yes', private: '',
    welcome: 'Your bot is connected ✅\nIt answers here any time. Tap a button below, or send a ticker like <code>btc</code>.',
    other: '🌐 عربي', otherCode: 'ar', langSet: 'Language: English ✅', exit: '🚪 Exit plan',
    today: 'today', profit: 'All Time Profit', vsBtcS: 'vs BTC', beat: (a, n) => `${a}/${n} coins beat BTC`, bestT: 'Best today', worstT: 'Worst today',
    dom: 'Dominance', fng: 'Fear & Greed', altS: 'Altcoin Season', etf: 'ETF', planS: 'Plan', allocS: 'Allocation', onT: (a, n) => `${a}/${n} on target`,
    dcaS: (n, mo) => `${n} buys · ${mo}/mo`, exitS: (n) => `Exit ${n}/3`, nearTp: 'next TP',
    exitT: 'Exit plan', conds: 'Exit conditions', met3: n => `${n} of 3 met`, btcD: 'BTC dominance', usdtD: 'USDT dominance', ethBtc: 'ETH/BTC',
    tpT: 'Take-profit levels', tpKey: 'level · to go · sell', more: n => `+${n} more coins in the app`, toGo: 'to go', sellP: p => `sell ${p}%`, reached: 'reached', noExit: 'No take-profit levels yet — set them on the Exit Strategy page.',
    openExit: '🚪 Open Exit Strategy', allExit: 'All 3 conditions met — your exit zone',
    kb: { pf: '💼 Portfolio', market: '🌍 Market', plan: '📋 Plan', movers: '🏆 Best & worst' },
  },
  ar: {
    hi: 'أهلاً سمير 👋', menuTitle: 'تحب تشوف إيه؟', pf: '💼 محفظتي', coin: '🪙 عملة', market: '🌍 السوق', plan: '📋 الخطة',
    movers: '🏆 الأفضل والأسوأ', signals: '🎯 الإشارات', refresh: '🔄 تحديث', back: '⬅️ القائمة', openApp: '📱 افتح التطبيق', liq: '🔥 Liq Map',
    chart: '📈 الرسم', inApp: '💼 في التطبيق', pfNow: 'محفظتك الآن', askCoin: 'ابعت رمز العملة أو اسمها — مثلاً <code>btc</code> أو <code>sol eth</code> أو <code>pendle</code>.',
    notFound: q => `ما لقيتش «${q}». جرّب الرمز (مثلاً <code>sol</code>) أو الاسم كامل.`,
    noUser: 'المحفظة لسه مش متوصلة (FIREBASE_SERVICE_ACCOUNT ناقص في الـ Worker).', soon: 'الكلام العادي معايا جاي في المرحلة الجاية. دلوقتي: اضغط زرار، أو ابعت رمز عملة زي <code>btc</code>.',
    err: 'حصلت مشكلة عندي — جرّب تاني بعد دقيقة.', rank: 'الترتيب', cap: 'القيمة السوقية', vol: 'التداول 24س', h24: '24س', d7: '7 أيام', d30: '30 يوم',
    you: 'معاك', avg: 'متوسطك', signal: 'الإشارة', noHold: 'مش معاك.', live: 'مباشر', snap: m => `من ${m} دقيقة`, src: 'CoinGecko',
    planT: 'خطة التجميع', overall: 'الإجمالي', done: 'تم', left: 'باقي', dca: 'الشراء المنتظم (DCA)', next: 'التالي', buyAt: 'تنبيهات سعر الشراء', away: 'بعيد',
    noPlan: 'مفيش أهداف في الخطة لسه — حطها من صفحة Accumulation.', best24: 'الأفضل 24س', worst24: 'الأسوأ 24س', best7: 'الأفضل 7 أيام', worst7: 'الأسوأ 7 أيام',
    mvT: 'الأفضل والأسوأ (عملاتك)', noStable: 'من غير الـ stablecoins', sigT: 'الإشارات', reinforce: '🟢 تعزيز', sell: '🔴 بيع / تحويل لـ BTC', hold: '⚪ احتفاظ',
    vsAvg: 'مقابل متوسطك', mkT: 'السوق', topUp: 'أعلى 500 · الأفضل 24س', topDn: 'أعلى 500 · الأسوأ 24س', updated: 'تحديث', futures: 'Futures', yes: 'أيوه', private: '',
    welcome: 'البوت اتوصل ✅\nبيرد عليك هنا في أي وقت. اضغط زرار تحت، أو ابعت رمز عملة زي <code>btc</code>.',
    other: '🌐 English', otherCode: 'en', langSet: 'اللغة: عربي ✅', exit: '🚪 خطة الخروج',
    today: 'اليوم', profit: 'إجمالي الربح', vsBtcS: 'مقابل BTC', beat: (a, n) => `${a}/${n} عملة سبقت BTC`, bestT: 'الأفضل اليوم', worstT: 'الأسوأ اليوم',
    dom: 'السيطرة', fng: 'الخوف والطمع', altS: 'موسم العملات', etf: 'ETF', planS: 'الخطة', allocS: 'التوزيع', onT: (a, n) => `${a}/${n} على الهدف`,
    dcaS: (n, mo) => `${n} شراء · ${mo}/شهر`, exitS: (n) => `الخروج ${n}/3`, nearTp: 'أقرب TP',
    exitT: 'خطة الخروج', conds: 'شروط الخروج', met3: n => `تحقق ${n} من 3`, btcD: 'سيطرة BTC', usdtD: 'سيطرة USDT', ethBtc: 'ETH/BTC',
    tpT: 'مستويات جني الأرباح', tpKey: 'السعر · الباقي · البيع', more: n => `+${n} عملة كمان في التطبيق`, toGo: 'باقي', sellP: p => `بيع ${p}%`, reached: 'وصل', noExit: 'مفيش مستويات جني أرباح لسه — حطها من صفحة Exit Strategy.',
    openExit: '🚪 افتح Exit Strategy', allExit: 'الشروط الـ 3 اتحققت — منطقة الخروج',
    kb: { pf: '💼 محفظتي', market: '🌍 السوق', plan: '📋 الخطة', movers: '🏆 الأفضل والأسوأ' },
  },
};

// ── small helpers ──
const cb = (text, data) => ({ text, callback_data: data });
const url = (text, u) => ({ text, url: u });
const price = v => !(v > 0) ? '—' : v >= 1000 ? usd2(v).replace(/\.\d\d$/, '') : v >= 1 ? usd2(v) : '$' + (+v.toPrecision(4)).toString();
const big = v => !(v > 0) ? '—' : v >= 1e12 ? '$' + (v / 1e12).toFixed(2) + 'T' : v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : usd(v);
const qty = v => +Number(v).toPrecision(6) + '';
const BARS = '▁▂▃▄▅▆▇█';
export function spark(arr, n = 16) {   // a 7-day line drawn with block characters
  const a = (arr || []).filter(x => x > 0); if (a.length < 4) return '';
  const pts = Array.from({ length: n }, (_, i) => a[Math.round(i * (a.length - 1) / (n - 1))]);
  const lo = Math.min(...pts), hi = Math.max(...pts);
  return pts.map(v => BARS[hi > lo ? Math.round((v - lo) / (hi - lo) * 7) : 3]).join('');
}
const menuRows = t => [[cb(t.pf, 'pf'), cb(t.market, 'mk')], [cb(t.plan, 'pl'), cb(t.movers, 'mv')], [cb(t.signals, 'sg'), cb(t.exit, 'ex')], [cb(t.coin, 'coin'), cb(t.other, 'lang:' + t.otherCode)]];
const replyKb = t => ({ keyboard: [[{ text: t.kb.pf }, { text: t.kb.market }], [{ text: t.kb.plan }, { text: t.kb.movers }]], resize_keyboard: true, is_persistent: true });

// ── language: English by default; 🌐 in the menu (or /lang) switches. Kept in the Worker's KV (RATE), else in memory ──
let memLang = null;
export async function getLang(env) {
  let v = memLang;
  try { if (env.RATE) v = (await env.RATE.get('tg:lang')) || v; } catch (_) {}
  if (v === 'ar' || v === 'en') return v;
  return env.BOT_LANG === 'ar' ? 'ar' : 'en';
}
async function setLang(env, v) { memLang = v; try { if (env.RATE) await env.RATE.put('tg:lang', v); } catch (_) {} }

// ── views: each returns { text, buttons } ──
export function viewMenu(t) { return { text: `${t.hi}\n${t.menuTitle}`, buttons: menuRows(t) }; }

// short lines (they fit a phone without wrapping): money in bold, a dot for up / down, details after a ·
const hm = now => local(now, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const row = (sym, v, extra) => `<code>${esc(String(sym).toUpperCase().padEnd(6))}${pct(v, 1).padStart(7)}</code> ${extra}`;
function moverRows(sum, key, dir, n = 5) {
  return sum.coins.filter(c => c[key] != null && c.value >= 1 && !isStable(c.sym)).sort((a, b) => dir * (b[key] - a[key])).slice(0, n).filter(c => dir > 0 ? c[key] > 0 : c[key] < 0);
}
function marketShort(t, m) {
  const g = m.global || {}, d = g.dom || {}, out = [];
  if (m.btc) out.push(`BTC <b>${usd(m.btc.price)}</b> ${dot(m.btc.ch24)} ${pct(m.btc.ch24)}`);
  if (d.btc != null) out.push(`${t.dom} BTC ${d.btc.toFixed(1)}% · USDT ${(d.usdt || 0).toFixed(2)}%`);
  if (m.fng) out.push(`${esc(t.fng)} <b>${m.fng.value}</b> · ${esc(m.fng.label)}`);
  if (m.alt && m.alt.value != null) out.push(`${t.altS} <b>${m.alt.value}</b> · ${esc(m.alt.label)}`);
  const e = etfDay(m.etf); if (e) out.push(`${t.etf} ${e.label} · BTC ${flow(e.btc)} · ETH ${flow(e.eth)}`);
  return out;
}
const nearestTp = sum => (sum.tps || []).filter(x => x.price < x.level).map(x => ({ ...x, to: (x.level / x.price - 1) * 100 })).sort((a, b) => a.to - b.to)[0];
export function viewPortfolio(t, cfg, sum, m, now) {
  const L = [`💼 <b>${t.pfNow}</b> · ${hm(now)}`, '', `<b>${usd2(sum.value)}</b>`];
  if (sum.ch24 != null) L.push(`${dot(sum.ch24)} ${pct(sum.ch24)} · ${signed(sum.d24)} ${t.today}`);
  L.push(`${t.profit} <b>${signed(sum.total)}</b> · ${pct(sum.pctTotal, 1)}`);
  if (sum.vsBtc != null) L.push(`${t.vsBtcS} ${dot(sum.vsBtc)} ${pct(sum.vsBtc)} · ${t.beat(sum.beat, sum.alts)}`);
  const up = moverRows(sum, 'ch24', 1), dn = moverRows(sum, 'ch24', -1);
  if (up.length) L.push('', `📈 <b>${t.bestT}</b>`, ...up.map(c => row(c.sym, c.ch24, usd(c.value))));
  if (dn.length) L.push('', `📉 <b>${t.worstT}</b>`, ...dn.map(c => row(c.sym, c.ch24, usd(c.value))));
  const mk = marketShort(t, m); if (mk.length) L.push('', `🌍 <b>${t.mkT}</b>`, ...mk);
  L.push('', `🎯 ${t.sigT} 🟢 ${sum.counts.reinforce} · 🔴 ${sum.counts.sell} · ⚪ ${sum.counts.hold}`);
  if (sum.plan.length) L.push(`📋 ${t.planS} <b>${sum.prog.pct.toFixed(1)}%</b> · ${sum.prog.completed}/${sum.prog.counted} ✅`);
  if (sum.alloc) L.push(`⚖️ ${t.allocS} ${t.onT(sum.alloc.onTarget, sum.alloc.count)}`);
  if ((sum.dca || []).length) L.push(`🛒 DCA ${t.dcaS(sum.dca.length, usd(sum.dca.reduce((a, x) => a + x.s.perMonth, 0)))}`);
  const mc = sum.macro.filter(x => x.met).length, tp = nearestTp(sum);
  L.push(`🚪 ${t.exitS(mc)}${tp ? ` · ${t.nearTp} ${esc(tp.sym)} +${tp.to.toFixed(0)}%` : ''}`);
  return { text: L.join('\n'), buttons: [[cb(t.refresh, 'pf'), cb(t.movers, 'mv')], [cb(t.plan, 'pl'), cb(t.exit, 'ex')], [cb(t.signals, 'sg'), url(t.openApp, APP)], [cb(t.back, 'menu')]] };
}

// 🚪 the exit plan: the 3 market conditions (BTC / USDT dominance, ETH/BTC) and your take-profit levels, nearest first
export function viewExit(t, sum, now) {
  const mc = sum.macro.filter(x => x.met).length, name = { btcD: t.btcD, usdtD: t.usdtD, ethBtc: t.ethBtc };
  const L = [`🚪 <b>${t.exitT}</b> · ${hm(now)}`, '', `🧭 <b>${t.conds}</b> · ${t.met3(mc)}`];
  for (const x of sum.macro) {
    const v = n => n == null ? '—' : n.toFixed(x.dp) + x.unit;
    L.push(`${x.met ? '✅' : '⬜'} ${name[x.k]} ${v(x.now)} → ${x.op} ${v(x.lvl)}`);
  }
  if (mc === 3) L.push(`🔔 <b>${t.allExit}</b>`);
  const tps = (sum.tps || []).map(x => ({ ...x, to: (x.level / x.price - 1) * 100 })).sort((a, b) => a.to - b.to);
  L.push('', `🎯 <b>${t.tpT}</b>`, `<i>${t.tpKey}</i>`);
  if (!tps.length) L.push(t.noExit);
  const bySym = new Map(); tps.forEach(x => { if (!bySym.has(x.sym)) bySym.set(x.sym, []); bySym.get(x.sym).push(x); });
  // one short line per level (fits a phone): ⬜ TP1 $0.5529 · +93% · 25%  — the 8 coins closest to a take-profit
  for (const [sym, list] of [...bySym].slice(0, 8)) {
    L.push('', `<b>${esc(sym)}</b> · ${price(list[0].price)}`);
    list.sort((a, b) => a.n - b.n).forEach(x => L.push(`${x.to <= 0 ? '✅' : '⬜'} TP${x.n} ${price(x.level)} · ${x.to <= 0 ? t.reached : `+${x.to.toFixed(0)}%`}${x.pct ? ` · ${x.pct}%` : ''}`));
  }
  if (bySym.size > 8) L.push('', `<i>${t.more(bySym.size - 8)}</i>`);
  return { text: L.join('\n'), buttons: [[cb(t.refresh, 'ex'), url(t.openExit, APP + 'accumulation.html#exit')], [cb(t.pf, 'pf'), cb(t.back, 'menu')]] };
}

export function viewMovers(t, sum) {
  const list = sum.coins.filter(c => c.value >= 1 && !isStable(c.sym));
  const block = (key, title, dir) => {
    const rows = list.filter(c => c[key] != null).sort((a, b) => dir * (b[key] - a[key])).slice(0, 5).filter(c => dir > 0 ? c[key] > 0 : c[key] < 0);
    return rows.length ? [``, `${dir > 0 ? '📈' : '📉'} <b>${title}</b>`, ...rows.map(c => `<code>${esc(c.sym.padEnd(6))} ${pct(c[key], 1).padStart(7)}</code>  ${usd(c.value)}`)] : [];
  };
  const L = [`🏆 <b>${esc(t.mvT)}</b>  <i>(${t.noStable})</i>`, ...block('ch24', t.best24, 1), ...block('ch24', t.worst24, -1), ...block('ch7', t.best7, 1), ...block('ch7', t.worst7, -1)];
  return { text: L.join('\n'), buttons: [[cb(t.refresh, 'mv'), cb(t.pf, 'pf')], [cb(t.back, 'menu')]] };
}

export function viewSignals(t, sum) {
  const by = { reinforce: [], sell: [], hold: [] };
  for (const c of sum.coins) (by[sum.signal[c.sym]] || by.hold).push(c);
  const L = [`🎯 <b>${t.sigT}</b>`];
  for (const k of ['reinforce', 'sell', 'hold']) {
    if (!by[k].length) continue;
    L.push('', `<b>${t[k]}</b> (${by[k].length})`);
    by[k].sort((a, b) => a.chg - b.chg).slice(0, 12).forEach(c => L.push(`<code>${esc(c.sym.padEnd(6))} ${pct(c.chg, 1).padStart(7)}</code>  ${t.vsAvg} ${price(c.avg)}`));
    if (by[k].length > 12) L.push('…');
  }
  return { text: L.join('\n'), buttons: [[cb(t.refresh, 'sg'), cb(t.pf, 'pf')], [cb(t.back, 'menu')]] };
}

export function viewPlan(t, sum, now) {
  if (!sum.plan.length && !(sum.dca || []).length && !(sum.buyAt || []).length) return { text: `📋 <b>${t.planT}</b>\n\n${t.noPlan}`, buttons: [[url(t.openApp, APP + 'accumulation.html'), cb(t.back, 'menu')]] };
  const L = [`📋 <b>${t.planT}</b>`];
  if (sum.plan.length) {
    L.push(`${t.overall}: <b>${sum.prog.pct.toFixed(1)}%</b> · ${sum.prog.completed}/${sum.prog.counted} ✅`, '');
    const bar = p => { const n = Math.round(Math.min(1, p) * 10); return '▰'.repeat(n) + '▱'.repeat(10 - n); };
    [...sum.plan].sort((a, b) => b.actual / b.target - a.actual / a.target).forEach(p => {
      const f = p.target > 0 ? p.actual / p.target : 0;
      L.push(`<code>${esc(p.sym.padEnd(6))}</code> ${bar(f)} ${Math.min(999, f * 100).toFixed(0)}%${f >= 1 ? ' ✅' : `  ${t.left} ${qty(p.target - p.actual)}`}`);
    });
  }
  if ((sum.dca || []).length) {
    L.push('', `🛒 <b>${t.dca}</b>`);
    sum.dca.forEach(x => L.push(`<code>${esc(x.sym.padEnd(6))}</code> ${usd(x.s.perMonth)}/mo${x.s.next ? ` · ${t.next} ${x.s.next}` : ''}${x.s.state === 'today' ? ' · ⏰' : ''}`));
  }
  if ((sum.buyAt || []).length) {
    L.push('', `🔔 <b>${t.buyAt}</b>`);
    sum.buyAt.forEach(x => { const d = (x.price / x.at - 1) * 100; L.push(`<code>${esc(x.sym.padEnd(6))}</code> ${price(x.at)} · ${price(x.price)} ${d > 0 ? `(${pct(d, 1)} ${t.away})` : '✅'}`); });
  }
  return { text: L.join('\n'), buttons: [[cb(t.refresh, 'pl'), url(t.openApp, APP + 'accumulation.html')], [cb(t.back, 'menu')]] };
}

export function viewMarket(t, m, now) {
  const L = [`🌍 <b>${t.mkT}</b> · ${hm(now)}`, '', ...marketShort(t, m)];
  const seen = new Set(), top = [...(m.top || []), ...(m.top500 || [])].filter(r => r.rank && r.rank <= 500 && r.ch24 != null && r.sym && !isStable(r.sym) && !seen.has(r.id) && seen.add(r.id));   // the top 500 by market cap, once each
  const line = r => row(r.sym, r.ch24, price(r.price));
  const up = [...top].sort((a, b) => b.ch24 - a.ch24).slice(0, 5), dn = [...top].sort((a, b) => a.ch24 - b.ch24).slice(0, 5);
  if (up.length) L.push('', `📈 <b>${t.topUp}</b>`, ...up.map(line));
  if (dn.length) L.push('', `📉 <b>${t.topDn}</b>`, ...dn.map(line));
  return { text: L.join('\n'), buttons: [[cb(t.refresh, 'mk'), url('🧭 Market Hub', APP + 'market.html')], [cb(t.back, 'menu')]] };
}

export function viewCoin(t, coin, m, sum, now) {
  const row = [...m.top, ...m.top500].find(r => r.id === coin.id) || {}, s = m.series[coin.id];
  const p = row.price > 0 ? row.price : s ? s.last : null;
  const ch7 = row.ch7 != null ? row.ch7 : (s && p && s.at(now - 7 * 24 * H) ? (p / s.at(now - 7 * 24 * H) - 1) * 100 : null);
  const sym = (coin.sym || row.sym || '').toUpperCase(), name = coin.name || row.name || sym;
  const L = [`🪙 <b>${esc(name)}</b> (${esc(sym)})${row.rank ? ` · #${row.rank}` : ''}`, '',
    `💲 <b>${price(p)}</b>   ${dot(row.ch24)} ${pct(row.ch24, 1)} ${t.h24} · ${dot(ch7)} ${pct(ch7, 1)} ${t.d7}`];
  const sp = spark(row.spark); if (sp) L.push(`<code>${sp}</code>  ${t.d7}`);
  if (row.mcap || row.vol) L.push(`📊 ${t.cap} ${big(row.mcap)} · ${t.vol} ${big(row.vol)}`);
  const mine = sum && sum.coins.find(c => c.sym === sym);
  if (mine) L.push('', `👛 ${t.you} <b>${qty(mine.qty)} ${esc(sym)}</b> = ${usd2(mine.value)}`, `${t.avg} ${price(mine.avg)} · ${dot(mine.chg)} ${pct(mine.chg, 1)} · ${t.signal}: ${t[sum.signal[sym]] || t.hold}`);
  else if (sum) L.push('', `👛 ${t.noHold}`);
  const age = m.live[coin.id] ? t.live : (m.parts && m.parts.top ? t.snap(Math.max(1, Math.round((now - Date.parse(m.parts.top)) / 60e3))) : '');
  L.push('', `<i>${t.src}${age ? ' · ' + age : ''}</i>`);
  const btns = [[cb(t.refresh, 'c:' + coin.id.slice(0, 58)), url(t.liq, LIQ + encodeURIComponent(sym))], [url(t.chart, 'https://www.coingecko.com/en/coins/' + encodeURIComponent(coin.id))]];
  if (mine) btns[1].push(url(t.inApp, APP + 'index.html#holdings/' + encodeURIComponent(sym)));
  btns.push([cb(t.back, 'menu')]);
  return { text: L.join('\n'), buttons: btns };
}

// ── Telegram ──
async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false }));
}
const send = (env, chat, v, extra = {}) => tg(env, 'sendMessage', { chat_id: chat, text: v.text.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true, ...(v.buttons ? { reply_markup: { inline_keyboard: v.buttons } } : {}), ...extra });
const edit = (env, chat, msgId, v) => tg(env, 'editMessageText', { chat_id: chat, message_id: msgId, text: v.text.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true, ...(v.buttons ? { reply_markup: { inline_keyboard: v.buttons } } : {}) });

// what you typed → an action
const WORDS = [
  [/^\/?(start|menu|help|القائمة|مساعدة|ابدأ)$/i, 'menu'],
  [/^\/?(portfolio|pf|wallet)$|محفظتي|المحفظة/i, 'pf'], [/^\/?(market|mk)$|السوق/i, 'mk'], [/^\/?(plan|pl)$|الخطة/i, 'pl'],
  [/^\/?(lang|language|لغة|اللغة)$/i, 'lang'], [/^(عربي|arabic)$/i, 'lang:ar'], [/^(english|انجليزي|إنجليزي)$/i, 'lang:en'],
  [/^\/?(exit|ex)$|خطة الخروج|الخروج/i, 'ex'],
  [/^\/?(movers|mv|best)$|الأفضل/i, 'mv'], [/^\/?(signals|sg)$|الإشارات/i, 'sg'], [/^\/?(coin|price)$/i, 'coin'],
];
export function parse(text) {
  const s = String(text || '').trim().replace(/@\w+/, '').replace(/^[^\p{L}\p{N}\/$]+/u, '').trim();   // "💼 Portfolio" → "Portfolio"
  const m = /^\/(price|p|coin)\s+(.+)$/i.exec(s);
  if (m) return { act: 'coins', q: m[2].split(/[\s,]+/).filter(Boolean).slice(0, 5) };
  for (const [rx, act] of WORDS) if (rx.test(s)) return { act };
  if (/^\$?[A-Za-z][A-Za-z0-9]{1,11}([\s,]+\$?[A-Za-z][A-Za-z0-9]{1,11}){0,4}$/.test(s)) return { act: 'coins', q: s.split(/[\s,]+/).filter(Boolean) };
  return { act: 'soon' };
}

async function buildView(env, act, arg) {
  const now = Date.now();
  const user = act === 'menu' || act === 'coin' ? null : await loadUser(env).catch(() => null);
  const cfg = settings(user && user.meta), lang = await getLang(env), t = T[lang];
  if (act === 'menu') return { t, views: [viewMenu(t)] };
  if (act === 'lang') return { t, views: [{ text: '🌐 English / عربي', buttons: [[cb('🇬🇧 English', 'lang:en'), cb('🇸🇦 عربي', 'lang:ar')]] }] };
  if (act === 'coin') return { t, views: [{ text: `🪙 ${t.askCoin}`, buttons: [[cb(t.back, 'menu')]] }] };
  if (act === 'soon') return { t, views: [{ text: t.soon, buttons: menuRows(t) }] };
  const needUser = ['pf', 'pl', 'mv', 'sg', 'ex'].includes(act);
  if (needUser && !user) return { t, views: [{ text: t.noUser, buttons: [[cb(t.market, 'mk'), cb(t.back, 'menu')]] }] };
  const ids = user ? [...(user.coins || []).filter(c => c && !c.removed), ...(user.accum || []).filter(a => a && +a.alertPrice > 0)].map(c => cgIdOf(c, { cgIds: null })) : [];
  if (act === 'coins') {
    const m0 = await loadMarket(ids);
    const coins = []; const miss = [];
    for (const q of arg) { const c = await findCoin(q, m0, user); if (c) coins.push(c); else miss.push(q); }
    const m = coins.some(c => !m0.series[c.id] || !m0.live[c.id]) ? await loadMarket([...ids, ...coins.map(c => c.id)]) : m0;
    const sum = user ? summarize(user, m, now) : null;
    const views = coins.map(c => viewCoin(t, c, m, sum, now));
    miss.forEach(q => views.push({ text: t.notFound(esc(q)), buttons: [[cb(t.back, 'menu')]] }));
    return { t, views };
  }
  const m = await loadMarket(ids);
  if (act === 'mk') return { t, views: [viewMarket(t, m, now)] };
  const sum = summarize(user, m, now);
  if (act === 'pf') return { t, views: [viewPortfolio(t, cfg, sum, m, now)] };
  if (act === 'mv') return { t, views: [viewMovers(t, sum)] };
  if (act === 'sg') return { t, views: [viewSignals(t, sum)] };
  if (act === 'pl') return { t, views: [viewPlan(t, sum, now)] };
  if (act === 'ex') return { t, views: [viewExit(t, sum, now)] };
  return { t, views: [viewMenu(t)] };
}

// ── the webhook ──
const ok = () => new Response('ok', { headers: { 'content-type': 'text/plain' } });
export async function handleTelegram(request, env) {
  if (request.method !== 'POST') return new Response('Not found', { status: 404 });
  if (!env.TG_SECRET || request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TG_SECRET) return new Response('Forbidden', { status: 403 });
  const u = await request.json().catch(() => null);
  if (!u) return ok();
  const msg = u.message || u.edited_message, q = u.callback_query;
  const chat = msg ? msg.chat && msg.chat.id : q && q.message && q.message.chat && q.message.chat.id;
  if (chat == null || String(chat) !== String(env.TELEGRAM_CHAT_ID)) return ok();   // a private bot: nobody else gets an answer
  try {
    if (q) {
      const d = String(q.data || '');
      await tg(env, 'answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});   // stops the button's spinner
      if (/^lang:(ar|en)$/.test(d)) { await switchLang(env, chat, d.slice(5), q.message.message_id); return ok(); }
      const { views } = d.startsWith('c:') ? await run(env, 'coinById', d.slice(2)) : await run(env, d);
      const r = await edit(env, chat, q.message.message_id, views[0]);
      if (!r.ok && !/not modified/i.test(r.description || '')) await send(env, chat, views[0]);
      return ok();
    }
    if (!msg || typeof msg.text !== 'string') return ok();
    const p = parse(msg.text);
    if (/^lang:(ar|en)$/.test(p.act)) { await switchLang(env, chat, p.act.slice(5)); return ok(); }
    const { t, views } = await run(env, p.act, p.q);
    if (/^\/start/.test(msg.text)) await send(env, chat, { text: t.welcome }, { reply_markup: replyKb(t) });   // the keyboard under the chat
    for (const v of views) await send(env, chat, v);
  } catch (e) {
    await send(env, chat, { text: T[await getLang(env).catch(() => 'en')].err }).catch(() => {});
  }
  return ok();
}

// 🌐 → the other language: the menu redraws in it and the keyboard under the chat follows
async function switchLang(env, chat, lang, msgId) {
  await setLang(env, lang);
  const t = T[lang];
  await send(env, chat, { text: t.langSet }, { reply_markup: replyKb(t) });
  if (msgId) await edit(env, chat, msgId, viewMenu(t)); else await send(env, chat, viewMenu(t));
}

// a coin button carries the CoinGecko id → look it up by id (not by ticker)
async function buildById(env, id) {
  const user = await loadUser(env).catch(() => null), now = Date.now();
  const cfg = settings(user && user.meta), lang = await getLang(env), t = T[lang];
  const ids = user ? (user.coins || []).filter(c => c && !c.removed).map(c => cgIdOf(c, { cgIds: null })) : [];
  const m = await loadMarket([...ids, id]);
  const row = [...m.top, ...m.top500].find(r => r.id === id) || {};
  const own = user && (user.coins || []).find(c => c && !c.removed && cgIdOf(c, m) === id);
  const coin = { id, sym: (own && own.sym) || row.sym || '', name: row.name || (own && own.name) || '' };
  return { t, views: [viewCoin(t, coin, m, user ? summarize(user, m, now) : null, now)] };
}
export const run = (env, act, arg) => act === 'coinById' ? buildById(env, arg) : buildView(env, act, arg);

// ── one-time setup: GET /tg/setup?key=<TG_SECRET> ──
export async function setup(request, env) {
  const u = new URL(request.url), json = (s, o) => new Response(JSON.stringify(o, null, 2), { status: s, headers: { 'content-type': 'application/json' } });
  if (!env.TG_SECRET || u.searchParams.get('key') !== env.TG_SECRET) return json(403, { ok: false, error: 'Wrong or missing key.' });
  const missing = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TG_SECRET'].filter(k => !env[k]);
  if (missing.length) return json(400, { ok: false, missing });
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(env.TG_SECRET)) return json(400, { ok: false, error: 'TG_SECRET must be 16+ letters, digits, _ or - (Telegram rule).' });
  const hook = u.origin + u.pathname.replace(/\/setup$/, '');
  const a = await tg(env, 'setWebhook', { url: hook, secret_token: env.TG_SECRET, allowed_updates: ['message', 'edited_message', 'callback_query'], drop_pending_updates: true });
  const cmds = lang => [['portfolio', lang === 'ar' ? 'محفظتي' : 'My portfolio'], ['price', lang === 'ar' ? 'سعر عملة — /price btc' : 'A coin — /price btc'], ['market', lang === 'ar' ? 'السوق' : 'Market'],
    ['plan', lang === 'ar' ? 'خطة التجميع' : 'Accumulation plan'], ['movers', lang === 'ar' ? 'الأفضل والأسوأ' : 'Best & worst'], ['signals', lang === 'ar' ? 'الإشارات' : 'Signals'], ['exit', lang === 'ar' ? 'خطة الخروج' : 'Exit plan'], ['menu', lang === 'ar' ? 'القائمة' : 'Menu'], ['lang', 'English / عربي']]
    .map(([command, description]) => ({ command, description }));
  const user = await loadUser(env).catch(() => null), lang = await getLang(env), t = T[lang];
  const b = await tg(env, 'setMyCommands', { commands: cmds(lang) });
  const c = await send(env, env.TELEGRAM_CHAT_ID, { text: t.welcome }, { reply_markup: replyKb(t) });
  await send(env, env.TELEGRAM_CHAT_ID, viewMenu(t));
  return json(a.ok && b.ok && c.ok ? 200 : 502, { ok: !!(a.ok && b.ok && c.ok), webhook: a.ok ? 'set' : a.description, menu: b.ok ? 'set' : b.description, welcome: c.ok ? 'sent' : c.description, portfolio: serviceAccount(env) ? (user ? 'connected' : 'not found') : 'FIREBASE_SERVICE_ACCOUNT missing' });
}
