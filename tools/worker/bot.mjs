// tools/worker/bot.mjs — the Telegram bot that answers you, running in the same Cloudflare Worker as AI Analysis.
//
//   POST /tg          Telegram's webhook. Only Telegram (it sends the secret header) and only your chat get an answer —
//                     anyone else is ignored silently.
//   GET  /tg/setup?key=<TG_SECRET>
//                     one-time setup: points Telegram at this Worker, sets the "/" menu, sends you a welcome message.
//
// What it can do now: your portfolio, a coin (any coin), the market, your plan, best / worst, signals — each with
// buttons that redraw the same message in place (🔄 = fresh numbers). Type a ticker ("btc", "sol eth") for its price.
// Anything else you write is a question for Claude (tools/worker/ai.mjs — phase 2).
// The numbers are the app's own (tools/alerts-core.mjs → summarize, samsam-core.js), with live prices on top.
//
// Worker secrets (Settings → Variables and Secrets): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, FIREBASE_SERVICE_ACCOUNT,
// TG_SECRET (any long random text of letters, digits, _ and -). Nothing secret is in this file.

import { summarize, settings, W, esc, usd, usd2, pct, dot, signed, local, isStable, etfDay, flow, APP } from '../alerts-core.mjs';
import { loadMarket, loadUser, findCoin, exchangePrice, setStale, serviceAccount, resetBudget, coinsOf, withIds, derivatives, startTrace, stopTrace, clearCache } from './data.mjs';
import { ask, firstTime, forget, usage } from './ai.mjs';
import { viewAlerts, deleteAlert } from './watch.mjs';
import { transcribe, MAX_SEC } from './voice.mjs';
import { keepTrades, tradeLines, confirmTrades, cancelTrades, money } from './trade.mjs';
import { viewDaily, setCfg, getCfg, morning, evening, pinUpdate, unpin } from './daily.mjs';
import { logEvent } from './watch.mjs';

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
    vsAvg: 'vs your avg', mkT: 'Market', topUp: n => `Top ${n} · best 24h`, topDn: n => `Top ${n} · worst 24h`, stUp: 'bStocks · best 24h', stDn: 'bStocks · worst 24h', stNote: 'tokenized US stocks (Binance)', updated: 'Updated', futures: 'Futures', yes: 'yes', private: '',
    welcome: 'Your bot is connected ✅\nAsk me anything in plain words, tap a button below, or send a ticker like <code>btc</code>.',
    thinking: '🧠 Thinking…', aiLimit: n => `You've used today's ${n} questions — more tomorrow (midnight Riyadh). Buttons and tickers still work.`,
    aiNoKey: 'The AI is not set up (ANTHROPIC_API_KEY is missing in the Worker).', aiBusy: 'Claude is busy right now — try again in a minute.',
    aiErr: "I couldn't answer that just now — try again, or rephrase.", newChat: '🆕 New chat', newDone: 'New chat — I forgot the earlier messages 🧹', aiLeft: (a, n) => `${a}/${n} left today`, data: 'Data',
    alertsB: '🔔 Alerts', alertGone: '🗑 Alert deleted', dailyB: '🗓 Daily', working: '⏳ On it…', pinOff: 'Pinned message off — /pin brings it back.',
    other: '🌐 عربي', otherCode: 'ar', langSet: 'Language: English ✅', exit: '🚪 Exit plan',
    today: 'today', profit: 'All Time Profit', vsBtcS: 'vs BTC', beat: (a, n) => `${a}/${n} coins beat BTC`, bestT: 'Best today', worstT: 'Worst today',
    dom: 'Dominance', fng: 'Fear & Greed', altS: 'Altcoin Season', etf: 'ETF', planS: 'Plan', allocS: 'Allocation', onT: (a, n) => `${a}/${n} on target`,
    dcaS: (n, mo) => `${n} buys · ${mo}/mo`, exitS: (n) => `Exit ${n}/3`, nearTp: 'next TP',
    exitT: 'Exit plan', conds: 'Exit conditions', met3: n => `${n} of 3 met`, btcD: 'BTC dominance', usdtD: 'USDT dominance', ethBtc: 'ETH/BTC',
    tpT: 'Take-profit levels', tpKey: 'level · to go · sell', more: n => `+${n} more coins in the app`, toGo: 'to go', sellP: p => `sell ${p}%`, reached: 'reached', noExit: 'No take-profit levels yet — set them on the Exit Strategy page.',
    openExit: '🚪 Open Exit Strategy', allExit: 'All 3 conditions met — your exit zone',
    kb: { pf: '💼 Portfolio', mk: '🌍 Market', pl: '📋 Plan', ex: '🚪 Exit', mv: '🏆 Movers', sg: '🎯 Signals' },
    kbOld: { mv: '🏆 Best & worst', ex: '🚪 Exit plan' },
    hidden: 'Buttons hidden ⌨️ — tap the ⌨️ icon in the message box (or send /start) to bring them back.',
    txOk: '✅ Confirm', txNo: '❌ Cancel', txOkAll: n => `✅ Confirm all ${n}`,
    txSaved: n => `✅ <b>Saved ${n === 1 ? 'the trade' : n + ' trades'}</b> to your portfolio — the app shows it now.`, txCancelled: '❌ Cancelled — nothing was saved.',
    txGone: 'This trade was already saved or cancelled.', txExpired: '⌛ Over 15 minutes old — nothing saved. Tell me the trade again.',
    txChanged: why => `⚠️ Not saved — your portfolio changed since: ${why}. Tell me the trade again.`, txNoUser: 'Your portfolio is not connected — nothing saved.',
    txSaveErr: why => `⚠️ Not saved — Firestore refused it (${why}).${/403/.test(why) ? ' The service account can only read: in Google Cloud → IAM give it the role "Cloud Datastore User".' : ''}`,
    nowHold: 'now',
    listening: '🎙️ Listening…', heard: '🎙️ I heard:', vNoAi: 'Voice notes are not set up yet (the AI binding is missing in the Worker) — please type it.',
    vLong: s => `Voice notes up to ${s / 60} min, please — or type it.`, vEmpty: "🎙️ I couldn't make out any words — try again, or type it.", vFail: "🎙️ I couldn't read that voice note — try again, or type it.",
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
    vsAvg: 'مقابل متوسطك', mkT: 'السوق', topUp: n => `أعلى ${n} · الأفضل 24س`, topDn: n => `أعلى ${n} · الأسوأ 24س`, stUp: 'bStocks · الأفضل 24س', stDn: 'bStocks · الأسوأ 24س', stNote: 'أسهم أمريكية مرمّزة (Binance)', updated: 'اتحدّث', futures: 'Futures', yes: 'أيوه', private: '',
    welcome: 'البوت اتوصل ✅\nبيرد عليك هنا في أي وقت. اضغط زرار تحت، أو ابعت رمز عملة زي <code>btc</code>.',
    thinking: '🧠 بفكّر…', aiLimit: n => `خلصت الـ ${n} سؤال بتوع النهارده — بكرة يتجددوا (12 بالليل بتوقيت الرياض). الأزرار والرموز شغالة عادي.`,
    aiNoKey: 'الـ AI مش متظبط (ANTHROPIC_API_KEY ناقص في الـ Worker).', aiBusy: 'Claude مشغول دلوقتي — جرّب كمان دقيقة.',
    aiErr: 'ما قدرتش أجاوب دلوقتي — جرّب تاني أو اكتب السؤال بشكل تاني.', newChat: '🆕 محادثة جديدة', newDone: 'محادثة جديدة — نسيت الكلام اللي فات 🧹', aiLeft: (a, n) => `باقي ${a}/${n} النهارده`, data: 'البيانات',
    alertsB: '🔔 التنبيهات', alertGone: '🗑 اتمسح التنبيه', dailyB: '🗓 اليومي', working: '⏳ ثواني…', pinOff: 'الرسالة المتثبتة اتقفلت — /pin ترجّعها.',
    other: '🌐 English', otherCode: 'en', langSet: 'اللغة: عربي ✅', exit: '🚪 خطة الخروج',
    today: 'اليوم', profit: 'إجمالي الربح', vsBtcS: 'مقابل BTC', beat: (a, n) => `${a}/${n} عملة سبقت BTC`, bestT: 'الأفضل اليوم', worstT: 'الأسوأ اليوم',
    dom: 'السيطرة', fng: 'الخوف والطمع', altS: 'موسم العملات', etf: 'ETF', planS: 'الخطة', allocS: 'التوزيع', onT: (a, n) => `${a}/${n} على الهدف`,
    dcaS: (n, mo) => `${n} شراء · ${mo}/شهر`, exitS: (n) => `الخروج ${n}/3`, nearTp: 'أقرب TP',
    exitT: 'خطة الخروج', conds: 'شروط الخروج', met3: n => `تحقق ${n} من 3`, btcD: 'سيطرة BTC', usdtD: 'سيطرة USDT', ethBtc: 'ETH/BTC',
    tpT: 'مستويات جني الأرباح', tpKey: 'السعر · الباقي · البيع', more: n => `+${n} عملة كمان في التطبيق`, toGo: 'باقي', sellP: p => `بيع ${p}%`, reached: 'وصل', noExit: 'مفيش مستويات جني أرباح لسه — حطها من صفحة Exit Strategy.',
    openExit: '🚪 افتح Exit Strategy', allExit: 'الشروط الـ 3 اتحققت — منطقة الخروج',
    kb: { pf: '💼 محفظتي', mk: '🌍 السوق', pl: '📋 الخطة', ex: '🚪 الخروج', mv: '🏆 الأفضل', sg: '🎯 الإشارات' },
    kbOld: { mv: '🏆 الأفضل والأسوأ', ex: '🚪 خطة الخروج' },
    hidden: 'الأزرار اتخفت ⌨️ — اضغط علامة ⌨️ في خانة الكتابة (أو ابعت /start) عشان ترجع.',
    txOk: '✅ تأكيد', txNo: '❌ إلغاء', txOkAll: n => `✅ تأكيد الـ ${n}`,
    txSaved: n => `✅ <b>اتحفظ${n === 1 ? 'ت الصفقة' : 'ت ' + n + ' صفقات'}</b> في محفظتك — هتلاقيها في التطبيق دلوقتي.`, txCancelled: '❌ اتلغت — ما اتحفظش حاجة.',
    txGone: 'الصفقة دي اتحفظت أو اتلغت قبل كده.', txExpired: '⌛ عدّى أكتر من 15 دقيقة — ما اتحفظش حاجة. قولّي الصفقة تاني.',
    txChanged: why => `⚠️ ما اتحفظش — محفظتك اتغيرت: ${why}. قولّي الصفقة تاني.`, txNoUser: 'المحفظة مش متوصلة — ما اتحفظش حاجة.',
    txSaveErr: why => `⚠️ ما اتحفظش — Firestore رفض (${why}).${/403/.test(why) ? ' حساب الخدمة بيقرا بس: من Google Cloud → IAM اديله دور "Cloud Datastore User".' : ''}`,
    nowHold: 'دلوقتي',
    listening: '🎙️ بسمع…', heard: '🎙️ سمعت:', vNoAi: 'الرسايل الصوتية لسه مش متظبطة (الـ AI binding ناقص في الـ Worker) — اكتبها لو سمحت.',
    vLong: s => `الفويس لحد ${s / 60} دقيقة بس — أو اكتبها.`, vEmpty: '🎙️ ما سمعتش كلام واضح — جرّب تاني أو اكتبها.', vFail: '🎙️ ما قدرتش أقرا الفويس ده — جرّب تاني أو اكتبها.',
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
const menuRows = t => [[cb(t.pf, 'pf'), cb(t.market, 'mk')], [cb(t.plan, 'pl'), cb(t.movers, 'mv')], [cb(t.signals, 'sg'), cb(t.exit, 'ex')], [cb(t.alertsB, 'al'), cb(t.coin, 'coin')], [cb(t.dailyB, 'dy'), cb(t.other, 'lang:' + t.otherCode)]];
// the keyboard under the chat: 6 buttons, 3 rows. Each one is matched by its exact text (both languages), so a tap always works
// the keyboard under the chat: 6 short buttons in 2 rows. Not pinned: the ⌨️ icon in the message box hides / shows it,
// /hide hides it, /start brings it back. Each button is matched by its exact text (both languages, old names too).
const replyKb = t => ({ keyboard: [[{ text: t.kb.pf }, { text: t.kb.mk }, { text: t.kb.pl }], [{ text: t.kb.ex }, { text: t.kb.mv }, { text: t.kb.sg }]], resize_keyboard: true, is_persistent: false, input_field_placeholder: 'btc · sol eth · /menu' });
const KB_ACT = () => Object.fromEntries(Object.values(T).flatMap(L => [...Object.entries(L.kb), ...Object.entries(L.kbOld || {})].map(([act, text]) => [text, act])));

// ── language: English by default; 🌐 in the menu (or /lang) switches. Kept in the Worker's KV (RATE), else in memory ──
let memLang = null;
export async function getLang(env) {
  let v = memLang;
  try { if (env.RATE) v = (await env.RATE.get('tg:lang')) || v; } catch (_) {}
  if (v === 'ar' || v === 'en') return v;
  return env.BOT_LANG === 'ar' ? 'ar' : 'en';
}
let memRange = null;
async function getRange(env) { let v = memRange; try { if (env.RATE) v = +(await env.RATE.get('tg:mk')) || v; } catch (_) {} return RANGES.includes(+v) ? +v : 100; }
async function setRange(env, v) { memRange = v; try { if (env.RATE) await env.RATE.put('tg:mk', String(v)); } catch (_) {} }
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

// 🌍 the market: BTC, dominance, Fear & Greed…, then the best / worst 5 of the Top 100 · 200 · 300 · 500 (the buttons
// switch; the choice is remembered), then the best / worst 5 Binance bStocks (tokenized US stocks)
export const RANGES = [100, 200, 300, 500];
export function viewMarket(t, m, now, range = 100) {
  const L = [`🌍 <b>${t.mkT}</b> · ${hm(now)}`, '', ...marketShort(t, m)];
  const seen = new Set(), top = [...(m.top || []), ...(m.top500 || [])].filter(r => r.rank && r.rank <= range && r.ch24 != null && r.sym && !isStable(r.sym) && !seen.has(r.id) && seen.add(r.id));   // the top N by market cap, once each
  const line = r => row(r.sym, r.ch24, price(r.price));
  const up = [...top].sort((a, b) => b.ch24 - a.ch24).slice(0, 5), dn = [...top].sort((a, b) => a.ch24 - b.ch24).slice(0, 5);
  if (up.length) L.push('', `📈 <b>${t.topUp(range)}</b>`, ...up.map(line));
  if (dn.length) L.push('', `📉 <b>${t.topDn(range)}</b>`, ...dn.map(line));
  const st = (m.stocks || []).filter(r => r.ch24 != null && r.price > 0);
  if (st.length) {
    const sUp = [...st].sort((a, b) => b.ch24 - a.ch24).slice(0, 5), sDn = [...st].sort((a, b) => a.ch24 - b.ch24).slice(0, 5);
    L.push('', `🏦 <b>${t.stUp}</b>`, ...sUp.map(line), '', `🏦 <b>${t.stDn}</b>`, ...sDn.map(line), `<i>${t.stNote}</i>`);
  }
  return { text: L.join('\n'), buttons: [RANGES.map(n => cb((n === range ? '✓ ' : '') + 'Top ' + n, 'mk:' + n)), [cb(t.refresh, 'mk:' + range), url('🧭 Market Hub', APP + 'market.html')], [cb(t.back, 'menu')]] };
}

export function viewCoin(t, coin, m, sum, now) {
  const row = [...m.top, ...m.top500].find(r => r.id === coin.id) || {}, s = m.series[coin.id];
  const symU = (coin.sym || row.sym || '').toUpperCase(), held = sum && sum.coins.find(c => c.sym === symU);
  const p = row.price > 0 ? row.price : s ? s.last : held && held.price > 0 ? held.price : null;
  const ch7 = row.ch7 != null ? row.ch7 : (s && p && s.at(now - 7 * 24 * H) ? (p / s.at(now - 7 * 24 * H) - 1) * 100 : null);
  const sym = (coin.sym || row.sym || '').toUpperCase(), name = coin.name || row.name || sym;
  const L = [`🪙 <b>${esc(name)}</b> (${esc(sym)})${row.rank ? ` · #${row.rank}` : ''}`, '',
    `💲 <b>${price(p)}</b>   ${dot(row.ch24)} ${pct(row.ch24, 1)} ${t.h24} · ${dot(ch7)} ${pct(ch7, 1)} ${t.d7}`];
  const sp = spark(row.spark); if (sp) L.push(`<code>${sp}</code>  ${t.d7}`);
  if (row.mcap || row.vol) L.push(`📊 ${t.cap} ${big(row.mcap)} · ${t.vol} ${big(row.vol)}`);
  const mine = sum && sum.coins.find(c => c.sym === sym);
  if (mine) L.push('', `👛 ${t.you} <b>${qty(mine.qty)} ${esc(sym)}</b> = ${usd2(mine.value)}`, `${t.avg} ${price(mine.avg)} · ${dot(mine.chg)} ${pct(mine.chg, 1)} · ${t.signal}: ${t[sum.signal[sym]] || t.hold}`);
  else if (sum) L.push('', `👛 ${t.noHold}`);
  const lv = m.live[coin.id], src = typeof lv === 'string' ? lv : t.src;   // CoinGecko, or the exchange that answered
  const age = lv ? t.live : (m.parts && m.parts.top ? t.snap(Math.max(1, Math.round((now - Date.parse(m.parts.top)) / 60e3))) : '');
  L.push('', `<i>${src}${age ? ' · ' + age : ''}</i>`);
  const btns = [[cb(t.refresh, 'c:' + coin.id.slice(0, 58)), url(t.liq, LIQ + encodeURIComponent(sym))], [url(t.chart, /^x-/.test(coin.id) ? 'https://www.tradingview.com/symbols/' + encodeURIComponent(sym) + 'USDT/' : 'https://www.coingecko.com/en/coins/' + encodeURIComponent(coin.id))]];
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
  [/^\/?(hide|اخفي|إخفاء|اخفاء)$/i, 'hide'], [/^\/(new|reset|clear)$|^محادثة جديدة$/i, 'new'],
  [/^\/?(alerts|al)$|^التنبيهات$|^تنبيهاتي$/i, 'al'],
  [/^\/(daily|settings)$|^اليومي$/i, 'dy'], [/^\/morning$/i, 'dy:now:m'], [/^\/evening$/i, 'dy:now:e'], [/^\/pin$/i, 'pin:on'], [/^\/unpin$/i, 'pin:off'],
  [/^\/?(lang|language|لغة|اللغة)$/i, 'lang'], [/^(عربي|arabic)$/i, 'lang:ar'], [/^(english|انجليزي|إنجليزي)$/i, 'lang:en'],
  [/^\/?(exit|ex)$|خطة الخروج|الخروج/i, 'ex'],
  [/^\/?(movers|mv|best)$|الأفضل/i, 'mv'], [/^\/?(signals|sg)$|الإشارات/i, 'sg'], [/^\/?(coin|price)$/i, 'coin'],
];
export function parse(text) {
  const kb = KB_ACT()[String(text || '').trim()];
  if (kb) return { act: kb };
  const s = String(text || '').trim().replace(/@\w+/, '').replace(/^[^\p{L}\p{N}\/$]+/u, '').trim();   // "💼 Portfolio" → "Portfolio"
  const m = /^\/(price|p|coin)\s+(.+)$/i.exec(s);
  if (m) return { act: 'coins', q: m[2].split(/[\s,]+/).filter(Boolean).slice(0, 5) };
  for (const [rx, act] of WORDS) if (rx.test(s)) return { act };
  if (/^\$?[A-Za-z][A-Za-z0-9]{1,11}([\s,]+\$?[A-Za-z][A-Za-z0-9]{1,11}){0,4}$/.test(s)) return { act: 'coins', q: s.split(/[\s,]+/).filter(Boolean), guess: String(text || '').trim() };   // tickers? (checked: else a question)
  return { act: 'ai', q: String(text || '').trim() };   // anything else: a question for Claude
}

async function buildView(env, act, arg, guess) {
  const now = Date.now();
  const user = act === 'menu' || act === 'coin' ? null : await loadUser(env).catch(() => null);
  const cfg = settings(user && user.meta), lang = await getLang(env), t = T[lang];
  if (act === 'menu') return { t, views: [viewMenu(t)] };
  if (act === 'lang') return { t, views: [{ text: '🌐 English / عربي', buttons: [[cb('🇬🇧 English', 'lang:en'), cb('🇸🇦 عربي', 'lang:ar')]] }] };
  if (act === 'coin') return { t, views: [{ text: `🪙 ${t.askCoin}`, buttons: [[cb(t.back, 'menu')]] }] };
  if (act === 'soon') return { t, views: [{ text: t.soon, buttons: menuRows(t) }] };
  const needUser = ['pf', 'pl', 'mv', 'sg', 'ex'].includes(act);
  if (needUser && !user) return { t, views: [{ text: t.noUser, buttons: [[cb(t.market, 'mk'), cb(t.back, 'menu')]] }] };
  const mine = coinsOf(user);
  if (act === 'coins') {
    const m0 = await loadMarket([], mine);
    if (guess) {   // typed words that look like tickers: cards only when every word is a coin the bot knows — else it's a question
      const known = w => { const W = String(w).toUpperCase().replace(/^\$/, ''), lw = String(w).toLowerCase();
        return mine.some(c => c.sym === W) || !!m0.cgIds[W] || [...m0.top, ...m0.top500].some(r => String(r.sym || '').toUpperCase() === W || String(r.name || '').toLowerCase() === lw || r.id === lw); };
      if (!arg.every(known)) return { t, ai: guess };
    }
    const found = [], miss = [];
    for (const q of arg) { const c = await findCoin(q, m0, user); if (c) found.push(c); else miss.push(q); }
    const m = await loadMarket(found.map(c => c.id).filter(Boolean), [...mine, ...found.map(c => ({ sym: c.sym, id: c.id }))]);
    const sum = user ? summarize(withIds(user, m), m, now) : null;
    const views = [];
    for (const c of found) {
      const id = c.id || m.idOf[c.sym];
      if (id) views.push(viewCoin(t, { ...c, id }, m, sum, now)); else miss.push(c.sym);
    }
    miss.forEach(q => views.push({ text: t.notFound(esc(q)), buttons: [[cb(t.back, 'menu')]] }));
    return { t, views };
  }
  const m = await loadMarket([], mine);
  if (act === 'mk') return { t, views: [viewMarket(t, m, now, await getRange(env))] };
  const sum = summarize(withIds(user, m), m, now);
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
  resetBudget();   // a fresh allowance of outside calls for this message
  const u = await request.json().catch(() => null);
  if (!u) return ok();
  const msg = u.message || u.edited_message, q = u.callback_query;
  const chat = msg ? msg.chat && msg.chat.id : q && q.message && q.message.chat && q.message.chat.id;
  if (chat == null || String(chat) !== String(env.TELEGRAM_CHAT_ID)) return ok();   // a private bot: nobody else gets an answer
  if (!(await firstTime(env, u.update_id))) return ok();   // Telegram re-sent it (a slow answer): already handled
  try {
    if (q) {
      const d = String(q.data || '');
      // the button keeps its little spinner while the numbers load; when done, a short note says so — so one tap is enough,
      // even when nothing changed (the message is the same → Telegram would show no change at all)
      const done = text => tg(env, 'answerCallbackQuery', { callback_query_id: q.id, ...(text ? { text } : {}) }).catch(() => {});
      if (/^lang:(ar|en)$/.test(d)) { await switchLang(env, chat, d.slice(5), q.message.message_id); await done(); return ok(); }
      if (d === 'dy' || /^dy:/.test(d) || d === 'pin:r') {   // 🗓 the daily messages: toggles, "now" buttons; 🔄 on the pinned message
        const lang = await getLang(env);
        if (d === 'pin:r') { await pinUpdate(env, Date.now(), true); await done(`✅ ${T[lang].updated}`); return ok(); }
        if (/^dy:now:[me]$/.test(d)) { await done(T[lang].working); await (d.endsWith('m') ? morning(env) : evening(env)); return ok(); }
        if (/^dy:(morning|evening|radar|sectors|pin)$/.test(d)) {
          const k = d.slice(3), c = await getCfg(env), on = !c[k];
          await setCfg(env, { [k]: on });
          if (k === 'pin') { if (on) await pinUpdate(env, Date.now(), true); else await unpin(env); }
        }
        await edit(env, chat, q.message.message_id, await viewDaily(env)); await done(); return ok();
      }
      if (/^tx:(ok|no):\w+$/.test(d)) {   // 🧾 a trade: ✅ saves it (all or nothing), ❌ forgets it
        const lang = await getLang(env), t = T[lang], gid = d.slice(6);
        const kb = ((q.message.reply_markup || {}).inline_keyboard || []).map(r => r.filter(b => !/^tx:/.test(b.callback_data || ''))).filter(r => r.length);
        await tg(env, 'editMessageReplyMarkup', { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: kb } }).catch(() => {});   // the buttons go at once (no second tap)
        if (d.startsWith('tx:no:')) { const was = await cancelTrades(env, gid); const tl = T[was || lang]; await send(env, chat, { text: was ? tl.txCancelled : tl.txGone }); await done(was ? '❌' : null); return ok(); }
        const r0 = await confirmTrades(env, gid), r = r0, t2 = T[r0.lang || lang];
        if (r.ok) {
          const L = [t2.txSaved(r.trades.length)];
          for (const h of r.holdings) L.push(`• ${esc(h.sym)} ${t2.nowHold}: <b>${(+Number(h.qty).toPrecision(8)).toLocaleString('en-US', { maximumFractionDigits: 8 })}</b>${h.avg ? ` · ${t2.avg} ${money(h.avg)}` : ''}`);
          await send(env, chat, { text: L.join('\n'), buttons: [[cb(t2.pf, 'pf'), cb(t2.back, 'menu')]] });
          for (const x of r.trades) await logEvent(env, 'trade', `${x.side} ${x.qty} ${x.sym} @ $${x.price}`);   // the smart evening tells it
          await done('✅');
        } else {
          await send(env, chat, { text: r.error === 'gone' ? t2.txGone : r.error === 'expired' ? t2.txExpired : r.error === 'changed' ? t2.txChanged(esc(r.why)) : r.error === 'nouser' ? t2.txNoUser : t2.txSaveErr(esc(String(r.why || '').slice(0, 80))) });
          await done('⚠️');
        }
        return ok();
      }
      if (d === 'new') { await forget(env); await done(T[await getLang(env)].newDone); return ok(); }
      if (d === 'al' || d.startsWith('ad:')) {   // 🔔 the alerts list; 🗑 n deletes one and redraws the list
        const lang = await getLang(env);
        if (d.startsWith('ad:')) await deleteAlert(env, d.slice(3));
        await edit(env, chat, q.message.message_id, await viewAlerts(env, lang));
        await done(d.startsWith('ad:') ? T[lang].alertGone : null); return ok();
      }
      if (/^mk:\d+$/.test(d) && RANGES.includes(+d.slice(3))) await setRange(env, +d.slice(3));   // Top 100 · 200 · 300 · 500
      const { t, views } = d.startsWith('c:') ? await run(env, 'coinById', d.slice(2)) : await run(env, /^mk:/.test(d) ? 'mk' : d);
      const r = await edit(env, chat, q.message.message_id, views[0]);
      if (!r.ok && !/not modified/i.test(r.description || '')) await send(env, chat, views[0]);
      await done(`✅ ${t.updated} ${local(Date.now(), { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })}`);
      return ok();
    }
    if (msg && (msg.voice || msg.audio)) { await onVoice(env, chat, msg.voice || msg.audio); return ok(); }
    if (!msg || typeof msg.text !== 'string') return ok();
    await onText(env, chat, msg.text);
  } catch (e) {
    await send(env, chat, { text: T[await getLang(env).catch(() => 'en')].err }).catch(() => {});
  }
  return ok();
}

// 🎙️ a voice note → ONE message: "Listening…" → "I heard: … / 🧠 Thinking…" → "I heard: …" + the answer
// (handled exactly as if you had typed the words; what it heard stays on top, so you can see it understood you)
async function onVoice(env, chat, voice) {
  const t = T[await getLang(env)];
  const ph = await send(env, chat, { text: t.listening });
  const id = ph && ph.result && ph.result.message_id;
  const show = v => id ? edit(env, chat, id, v).then(r => r.ok ? r : send(env, chat, v)) : send(env, chat, v);
  const r = await transcribe(env, voice);
  if (r.error) return show({ text: r.error === 'noai' ? t.vNoAi : r.error === 'long' ? t.vLong(MAX_SEC) : r.error === 'empty' ? t.vEmpty : t.vFail });
  const head = `${t.heard} <i>${esc(r.text)}</i>`;
  if (!id) await send(env, chat, { text: head });
  return onText(env, chat, r.text, 32, id ? { id, head } : null);   // 4 calls went on the voice note → a little less for the data
}

// a typed message (or a voice note's words) → a view, or a question for Claude
// into = { id, head }: a voice note's message — the answer goes into it, under what it heard
async function onText(env, chat, text, budget = 36, into = null) {
  const p = parse(text);
  tg(env, 'sendChatAction', { chat_id: chat, action: 'typing' }).catch(() => {});   // "typing…" while the numbers load
  if (into && p.act !== 'ai') {   // a view: it is drawn into the voice note's message (lists / settings: the heard line stays alone)
    if (!['menu', 'coin', 'coins', 'pf', 'mk', 'pl', 'mv', 'sg', 'ex'].includes(p.act)) await edit(env, chat, into.id, { text: into.head });
    else {
      const { views, ai } = await run(env, p.act, p.q, p.guess);
      if (ai) { await answer(env, chat, ai, budget, into); return; }
      const [v0, ...rest] = views, both = v0 && { ...v0, text: into.head + '\n\n' + v0.text };
      const r = both && both.text.length <= 4000 ? await edit(env, chat, into.id, both) : null;
      if (!r || !r.ok) { await edit(env, chat, into.id, { text: into.head }); if (v0) await send(env, chat, v0); }
      for (const v of rest) await send(env, chat, v);
      return;
    }
    into = null;
  }
  if (/^lang:(ar|en)$/.test(p.act)) { await switchLang(env, chat, p.act.slice(5)); return; }
  if (p.act === 'al') { await send(env, chat, await viewAlerts(env, await getLang(env))); return; }
  if (p.act === 'dy') { await send(env, chat, await viewDaily(env)); return; }
  if (p.act === 'dy:now:m') { await morning(env); return; }
  if (p.act === 'dy:now:e') { await evening(env); return; }
  if (p.act === 'pin:on') { await setCfg(env, { pin: true }); await pinUpdate(env, Date.now(), true); return; }
  if (p.act === 'pin:off') { await setCfg(env, { pin: false }); await unpin(env); await send(env, chat, { text: T[await getLang(env)].pinOff }); return; }
  if (p.act === 'new') { await forget(env); await send(env, chat, { text: T[await getLang(env)].newDone }); return; }
  if (p.act === 'ai') { await answer(env, chat, p.q, budget, into); return; }
  if (p.act === 'hide') { const t = T[await getLang(env)]; await send(env, chat, { text: t.hidden }, { reply_markup: { remove_keyboard: true } }); return; }
  const { t, views, ai } = await run(env, p.act, p.q, p.guess);
  if (ai) { await answer(env, chat, ai, budget); return; }
  if (/^\/start/.test(text)) { await send(env, chat, { text: t.welcome }, { reply_markup: replyKb(t) }); await tg(env, 'setMyCommands', { commands: cmds(await getLang(env)) }).catch(() => {}); }   // the keyboard under the chat + the "/" menu
  for (const v of views) await send(env, chat, v);
}

// 🧠 a question in plain words → "Thinking…" at once, then the same message becomes Claude's answer, with where its numbers
// came from, how many questions are left today, and buttons for the coins it looked at
async function answer(env, chat, question, budget = 36, into = null) {
  const lang = await getLang(env), t = T[lang];
  resetBudget(budget);   // data calls; Claude's own (usually 2–4, at most 9) + Telegram's 3 keep the total inside Cloudflare's 50
  const top = into ? into.head + '\n\n' : '';   // a voice note: what it heard stays above the answer, in the same message
  let id;
  if (into) { id = into.id; await edit(env, chat, id, { text: into.head + '\n' + t.thinking }); }
  else { const ph = await send(env, chat, { text: t.thinking }); id = ph && ph.result && ph.result.message_id; }
  const show0 = v => id ? edit(env, chat, id, v).then(r => r.ok ? r : send(env, chat, v)) : send(env, chat, v);
  const show = v => show0({ ...v, text: top + v.text });
  const r = await ask(env, question, lang).catch(e => { console.log(JSON.stringify({ ai: 'crash', message: String(e && e.message).slice(0, 300) })); return { error: 'claude' }; });
  if (r.error) return show({ text: r.error === 'limit' ? t.aiLimit(r.limit) : r.error === 'nokey' ? t.aiNoKey : r.error === 'busy' ? t.aiBusy : t.aiErr, buttons: [[cb(t.back, 'menu')]] });
  const foot = `<i>📡 ${t.data}: ${esc(r.sources.length ? r.sources.join(' · ') : 'general knowledge')}\n${t.aiLeft(r.left, r.limit)}</i>`;
  const btns = [];
  if (r.coins.length) btns.push(r.coins.map(([cid, sym]) => cb('🪙 ' + sym, 'c:' + cid.slice(0, 58))));
  if (r.coins.length === 1) btns[0].push(url('🔥 Liq Map', LIQ + encodeURIComponent(r.coins[0][1])));
  btns.push([cb(t.newChat, 'new'), cb(t.back, 'menu')]);
  let tx = '';
  if (r.trades && r.trades.length) {   // 🧾 trades Claude prepared: the bot's own summary + ✅ / ❌ (nothing saved before the tap)
    const ql = /[\u0600-\u06FF]/.test(question) ? 'ar' : 'en', tq = T[ql];   // in the language of THIS message, like Claude's answer
    const gid = await keepTrades(env, r.trades, ql);
    tx = tradeLines(r.trades, ql === 'ar') + '\n\n';
    btns.unshift([cb(r.trades.length > 1 ? tq.txOkAll(r.trades.length) : tq.txOk, 'tx:ok:' + gid), cb(tq.txNo, 'tx:no:' + gid)]);
  }
  let text = r.text + '\n\n' + tx + foot;
  if (top.length + text.length > 4000) text = r.text.slice(0, Math.max(200, 3900 - foot.length - tx.length - top.length)) + '…\n\n' + tx + foot;
  return show({ text, buttons: btns });
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
  const lang = await getLang(env), t = T[lang];
  const xs = /^x-/.test(id) ? id.slice(2).toUpperCase() : null;   // a coin priced by the exchanges (no CoinGecko id)
  const mine = coinsOf(user);
  const m = await loadMarket(xs ? [] : [id], xs ? [...mine, { sym: xs }] : mine);
  const row = [...m.top, ...m.top500].find(r => r.id === id) || {};
  const ownSym = Object.keys(m.idOf).find(S => m.idOf[S] === id);
  const own = user && ownSym && (user.coins || []).find(c => c && !c.removed && String(c.sym).toUpperCase() === ownSym);
  const coin = { id: xs ? (m.idOf[xs] || id) : id, sym: xs || ownSym || row.sym || '', name: row.name || (own && own.name) || '' };
  return { t, views: [viewCoin(t, coin, m, user ? summarize(withIds(user, m), m, now) : null, now)] };
}
export const run = (env, act, arg, guess) => act === 'coinById' ? buildById(env, arg) : buildView(env, act, arg, guess);

// the "/" menu in Telegram (set by the setup link and again on /start, so new commands show up)
const cmds = lang => [['portfolio', lang === 'ar' ? 'محفظتي' : 'My portfolio'], ['price', lang === 'ar' ? 'سعر عملة — /price btc' : 'A coin — /price btc'], ['market', lang === 'ar' ? 'السوق' : 'Market'],
    ['plan', lang === 'ar' ? 'خطة التجميع' : 'Accumulation plan'], ['movers', lang === 'ar' ? 'الأفضل والأسوأ' : 'Best & worst'], ['signals', lang === 'ar' ? 'الإشارات' : 'Signals'], ['exit', lang === 'ar' ? 'خطة الخروج' : 'Exit plan'], ['menu', lang === 'ar' ? 'القائمة' : 'Menu'], ['lang', 'English / عربي'], ['alerts', lang === 'ar' ? 'تنبيهاتك' : 'Your alerts'], ['daily', lang === 'ar' ? 'الصباح والمساء والرادارات' : 'Morning, evening, radars'], ['morning', lang === 'ar' ? 'الصباح الذكي دلوقتي' : 'Smart morning now'], ['evening', lang === 'ar' ? 'المساء الذكي دلوقتي' : 'Smart evening now'], ['pin', lang === 'ar' ? 'الرسالة المتثبتة' : 'Live pinned message'], ['hide', lang === 'ar' ? 'إخفاء الأزرار' : 'Hide the buttons'], ['new', lang === 'ar' ? 'محادثة جديدة مع الـ AI' : 'New AI chat']]
    .map(([command, description]) => ({ command, description }));

// ── one-time setup: GET /tg/setup?key=<TG_SECRET> ──
export async function setup(request, env) {
  const u = new URL(request.url), json = (s, o) => new Response(JSON.stringify(o, null, 2), { status: s, headers: { 'content-type': 'application/json' } });
  if (!env.TG_SECRET || u.searchParams.get('key') !== env.TG_SECRET) return json(403, { ok: false, error: 'Wrong or missing key.' });
  const missing = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TG_SECRET'].filter(k => !env[k]);
  if (missing.length) return json(400, { ok: false, missing });
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(env.TG_SECRET)) return json(400, { ok: false, error: 'TG_SECRET must be 16+ letters, digits, _ or - (Telegram rule).' });
  const hook = u.origin + u.pathname.replace(/\/setup$/, '');
  const a = await tg(env, 'setWebhook', { url: hook, secret_token: env.TG_SECRET, allowed_updates: ['message', 'edited_message', 'callback_query'], drop_pending_updates: true });
  resetBudget();
  const user = await loadUser(env).catch(() => null), lang = await getLang(env), t = T[lang];
  const b = await tg(env, 'setMyCommands', { commands: cmds(lang) });
  const c = await send(env, env.TELEGRAM_CHAT_ID, { text: t.welcome }, { reply_markup: replyKb(t) });
  await send(env, env.TELEGRAM_CHAT_ID, viewMenu(t));
  return json(a.ok && b.ok && c.ok ? 200 : 502, { ok: !!(a.ok && b.ok && c.ok), webhook: a.ok ? 'set' : a.description, menu: b.ok ? 'set' : b.description, welcome: c.ok ? 'sent' : c.description, portfolio: serviceAccount(env) ? (user ? 'connected' : 'not found') : 'FIREBASE_SERVICE_ACCOUNT missing' });
}

// ── a check you open in the browser: GET /tg/check?key=<TG_SECRET>&coin=SOL — the futures data for a coin, fresh, and
// every outside call it made (host, path, status). Shows no keys and no portfolio data.
export async function check(request, env) {
  const u = new URL(request.url), json = (s, o) => new Response(JSON.stringify(o, null, 2), { status: s, headers: { 'content-type': 'application/json' } });
  if (!env.TG_SECRET || u.searchParams.get('key') !== env.TG_SECRET) return json(403, { ok: false, error: 'Wrong or missing key.' });
  const sym = String(u.searchParams.get('coin') || 'BTC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  clearCache(); resetBudget(); startTrace();
  if (u.searchParams.get('what') === 'price') {   // /tg/check?key=…&coin=KAVA&what=price — where a coin's price comes from right now
    const t0 = Date.now(), m0 = await loadMarket([], []), c = await findCoin(sym, m0, null);
    const old = u.searchParams.get('stale') === '1' ? setStale(0) : null;   // act as if the snapshot were old
    const m = c ? await loadMarket(c.id ? [c.id] : [], [{ sym: c.sym, id: c.id }]).finally(() => { if (old != null) setStale(old); }) : null, id = c && (c.id || m.idOf[c.sym]);
    const row = m && [...m.top, ...m.top500].find(r => r.id === id);
    return json(200, { coin: sym, found: c, ms: Date.now() - t0, snapshot: m0.parts, snapshot_age_min: Math.round((Date.now() - Date.parse(m0.parts && m0.parts.top)) / 60e3), price: row ? row.price : null, ch24: row ? row.ch24 : null, source: m && id ? (m.live[id] || 'snapshot') : null, exchange: await exchangePrice(sym).catch(e => String(e && e.message)), calls: stopTrace() });
  }
  const t0 = Date.now(), d = await derivatives(sym).catch(e => ({ error: String(e && e.message) }));
  return json(200, { coin: sym, ms: Date.now() - t0, colo: (request.cf && request.cf.colo) || null, country: (request.cf && request.cf.country) || null, result: d, calls: stopTrace() });
}
