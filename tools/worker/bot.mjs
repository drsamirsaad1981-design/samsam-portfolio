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

import { bidi, bidiBody, NOT_ADVICE } from './bidi.mjs';
import { markSeen } from './idle.mjs';
import { note } from './usage.mjs';
import { asChat, chatOf, K, allowed, migrateOwner, isOwner, members, useInvite, newInvite, removeMember, strangerOnce, MAX_MEMBERS, member, setMember, accessEmails, setPending, getPending, clearPending, DEF_AI, DEF_REPORTS, PREM_AI, PREM_REPORTS, isPremium, langOf, flood, forgetChat, maxMembers, moveAppMember , bump, STRANGER_MSGS_PER_HOUR, STRANGER_CODES_PER_HOUR } from './who.mjs';
import { summarize, settings, W, esc, usd, usd2, pct, dot, signed, local, localParts, isStable, etfDay, flow, APP, FNG_AR, SEASON_AR, arDay } from '../alerts-core.mjs';
import { chatUid, idTokenFor } from './data.mjs';
import { balancesFor } from './cex.mjs';
import { usMarket, US_STATE, METAL, UNIT, gramSar } from './usmarket.mjs';
import { forgetPortfolio, findLinkCode, syncAccess, loadMarket, loadUser, findCoin, exchangePrice, setStale, serviceAccount, resetBudget, coinsOf, withIds, derivatives, startTrace, stopTrace, clearCache } from './data.mjs';
import { ask, firstTime, forget, usage } from './ai.mjs';
import { viewAlerts, deleteAlert } from './watch.mjs';
import { transcribe, MAX_SEC } from './voice.mjs';
import { keyInfo, BYOK_AI, BYOK_REPORTS } from './byok.mjs';
import GUIDE from '../../guide.json' with { type: 'json' };
import { onMyChatMember, onJoinRequest, communityView, announce, setup as communitySetup, registerForward, guideCard, guideGroups } from './community.mjs';
import { premiumView, supportView, sendSupportInvoice, askGift, preCheckout, paid, statsView, addDays, revoke, premiumNow } from './stars.mjs';
import { keepTrades, tradeLines, confirmTrades, cancelTrades, money } from './trade.mjs';
import { viewDaily, setCfg, getCfg, morning, evening, pinUpdate, unpin } from './daily.mjs';
import { logEvent } from './watch.mjs';
import { viewPaper, viewRestart, undoLast, reset as paperReset, paperWords } from './paper.mjs';

const H = 3600e3;
const LIQ = 'https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=';

// ── words (Arabic / English) — the bot speaks the language you chose for the alerts in the app ──
const T = {
  en: {
    hi: 'Hi Samir 👋', hiAll: 'Hi 👋', menuTitle: 'What would you like to see?', pf: '💼 Portfolio', coin: '🪙 A coin', market: '🌍 Market', plan: '📋 Plan',
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
    aiNoKey: 'The AI is not set up (ANTHROPIC_API_KEY is missing in the Worker).', aiOwnKey: '🔑 Claude refused your own API key (wrong, removed, or out of credit). Fix it in the app: Settings → My Claude key.', aiBusy: 'Claude is busy right now — try again in a minute.',
    aiErr: "I couldn't answer that just now — try again, or rephrase.", newChat: '🆕 New chat', newDone: 'New chat — I forgot the earlier messages 🧹', aiLeft: (a, n) => `${a}/${n} left today`, data: 'Data',
    ownerOnly: 'Only the bot owner can do that.', noLink: 'Your portfolio isn\'t linked yet. In the app: Settings → Telegram → 🔗 Link your portfolio (no app yet? send /app with your e-mail). Meanwhile the market, any coin, alerts, paper trading and questions all work.',
    alertsB: '🔔 Alerts', alertGone: '🗑 Alert deleted', dailyB: '🗓 Daily', paperB: '🧪 Paper', report: '📊 Report', reportT: '📱 <b>Cute Portfolio</b> — the full app, right here in Telegram. You\'re signed in by Telegram.', working: '⏳ On it…', pinOff: 'Pinned message off — /pin brings it back.',
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
    hi: 'أهلاً سمير 👋', hiAll: 'أهلاً 👋', menuTitle: 'ماذا تريد أن ترى؟', pf: '💼 محفظتي', coin: '🪙 عملة', market: '🌍 السوق', plan: '📋 الخطة',
    movers: '🏆 الأفضل والأسوأ', signals: '🎯 الإشارات', refresh: '🔄 تحديث', back: '⬅️ القائمة', openApp: '📱 افتح التطبيق', liq: '🔥 Liq Map',
    chart: '📈 الرسم', inApp: '💼 في التطبيق', pfNow: 'محفظتك الآن', askCoin: 'أرسل رمز العملة أو اسمها — مثلاً <code>btc</code> أو <code>sol eth</code> أو <code>pendle</code>.',
    notFound: q => `لم أجد «${q}». جرّب الرمز (مثلاً <code>sol</code>) أو الاسم كاملاً.`,
    noUser: 'المحفظة غير متصلة بعد (FIREBASE_SERVICE_ACCOUNT غير موجود في الـ Worker).', soon: 'المحادثة الحرة قادمة في المرحلة التالية. الآن: اضغط زراً، أو أرسل رمز عملة مثل <code>btc</code>.',
    err: 'حدثت مشكلة لدي — حاول مرة أخرى بعد دقيقة.', rank: 'الترتيب', cap: 'القيمة السوقية', vol: 'التداول 24 س', h24: '24س', d7: '7 أيام', d30: '30 يوم',
    you: 'لديك', avg: 'متوسط شرائك', signal: 'الإشارة', noHold: 'ليست في محفظتك.', live: 'مباشر', snap: m => `منذ ${m} دقيقة`, src: 'CoinGecko',
    planT: 'خطة التجميع', overall: 'الإجمالي', done: 'تم', left: 'المتبقي', dca: 'الشراء الدوري (DCA)', next: 'التالي', buyAt: 'تنبيهات سعر الشراء', away: 'يبعد',
    noPlan: 'لا توجد أهداف في الخطة بعد — أضفها من صفحة خطة التجميع في التطبيق.', best24: 'الأفضل 24س', worst24: 'الأسوأ 24س', best7: 'الأفضل 7 أيام', worst7: 'الأسوأ 7 أيام',
    mvT: 'الأفضل والأسوأ في محفظتك', noStable: 'باستثناء المستقرة', sigT: 'الإشارات', reinforce: '🟢 تعزيز', sell: '🔴 بيع / تحويل إلى BTC', hold: '⚪ احتفاظ',
    vsAvg: 'مقارنة بمتوسط شرائك', mkT: 'السوق', topUp: n => `أعلى ${n} · الأفضل 24س`, topDn: n => `أعلى ${n} · الأسوأ 24س`, stUp: 'الأفضل في bStocks · 24س', stDn: 'الأسوأ في bStocks · 24س', stNote: 'أسهم أمريكية مرمّزة (Binance)', updated: 'تم التحديث', futures: 'Futures', yes: 'نعم', private: '',
    welcome: 'البوت متصل ✅\nيرد عليك هنا في أي وقت. اضغط زراً بالأسفل، أو أرسل رمز عملة مثل <code>btc</code>.',
    thinking: '🧠 أفكر…', aiLimit: n => `انتهت أسئلتك الـ ${n} لهذا اليوم — تتجدد غداً (12 منتصف الليل بتوقيت الرياض). الأزرار والرموز تعمل كالمعتاد.`,
    aiNoKey: 'الذكاء الاصطناعي غير مُعدّ (ANTHROPIC_API_KEY غير موجود في الـ Worker).', aiOwnKey: '🔑 رفض Claude مفتاحك (خاطئ، أو أُلغي، أو نفد الرصيد). أصلحه من التطبيق: الإعدادات ← مفتاح Claude الخاص بي.', aiBusy: 'Claude مشغول الآن — حاول بعد دقيقة.',
    aiErr: 'لم أستطع الإجابة الآن — حاول مرة أخرى أو اكتب السؤال بصيغة أخرى.', newChat: '🆕 محادثة جديدة', newDone: 'محادثة جديدة — نسيت الرسائل السابقة 🧹', aiLeft: (a, n) => `المتبقي ${a}/${n} اليوم`, data: 'البيانات',
    ownerOnly: 'هذا لمالك البوت فقط.', noLink: 'محفظتك غير مربوطة بعد. من التطبيق: الإعدادات ← تليجرام ← 🔗 ربط محفظتك ببوت تليجرام (ليس لديك التطبيق؟ أرسل /app مع بريدك). حتى ذلك الحين: السوق، وأي عملة، والتنبيهات، والتداول التجريبي، والأسئلة — كلها تعمل.',
    alertsB: '🔔 التنبيهات', alertGone: '🗑 حُذف التنبيه', dailyB: '🗓 اليومي', paperB: '🧪 تجريبي', report: '📊 التقرير', reportT: '📱 <b>Cute Portfolio</b> — التطبيق الكامل هنا داخل تليجرام. يتم تسجيل دخولك تلقائياً عبر تليجرام.', working: '⏳ لحظات…', pinOff: 'أُوقفت الرسالة المثبتة — /pin يعيدها.',
    other: '🌐 English', otherCode: 'en', langSet: 'اللغة: عربي ✅', exit: '🚪 خطة الخروج',
    today: 'اليوم', profit: 'إجمالي الربح', vsBtcS: 'مقابل البيتكوين', beat: (a, n) => `${a} من ${n} عملة تفوقت عليه`, bestT: 'الأفضل اليوم', worstT: 'الأسوأ اليوم',
    dom: 'الهيمنة', fng: 'الخوف والطمع', altS: 'موسم العملات البديلة', etf: 'ETF', planS: 'الخطة', allocS: 'التوزيع', onT: (a, n) => `${a} من ${n} على الهدف`,
    dcaS: (n, mo) => `${n === 1 ? 'عملية شراء دوري واحدة' : n === 2 ? 'عمليتا شراء دوري' : n + ' عمليات شراء دوري'} (DCA) · ${mo} شهرياً`, exitS: (n) => `الخروج ${n} من 3`, nearTp: 'أقرب هدف ربح',
    exitT: 'خطة الخروج', conds: 'مؤشرات الخروج', met3: n => `تحقق ${n} من 3`, btcD: 'هيمنة BTC', usdtD: 'هيمنة USDT', ethBtc: 'ETH/BTC',
    tpT: 'مستويات جني الأرباح', tpKey: 'السعر · المتبقي · البيع', more: n => `و${n} عملة أخرى في التطبيق`, toGo: 'المتبقي', sellP: p => `بيع ${p}%`, reached: 'وصل', noExit: 'لا توجد مستويات جني أرباح بعد — أضفها من صفحة استراتيجية الخروج في التطبيق.',
    openExit: '🚪 افتح استراتيجية الخروج', allExit: 'تحققت المؤشرات الثلاثة — منطقة الخروج',
    kb: { pf: '💼 محفظتي', mk: '🌍 السوق', pl: '📋 الخطة', ex: '🚪 الخروج', mv: '🏆 الأفضل', sg: '🎯 الإشارات' },
    kbOld: { mv: '🏆 الأفضل والأسوأ', ex: '🚪 خطة الخروج' },
    hidden: 'أُخفيت الأزرار ⌨️ — اضغط علامة ⌨️ في خانة الكتابة (أو أرسل /start) لإعادتها.',
    txOk: '✅ تأكيد', txNo: '❌ إلغاء', txOkAll: n => `✅ تأكيد الصفقات (${n})`,
    txSaved: n => `✅ <b>${n === 1 ? 'حُفظت الصفقة' : 'حُفظت ' + n + ' صفقات'}</b> في محفظتك — ستجدها في التطبيق الآن.`, txCancelled: '❌ أُلغيت — لم يُحفظ شيء.',
    txGone: 'هذه الصفقة حُفظت أو أُلغيت من قبل.', txExpired: '⌛ مرّت أكثر من 15 دقيقة — لم يُحفظ شيء. أرسل الصفقة مرة أخرى.',
    txChanged: why => `⚠️ لم تُحفظ — تغيّرت محفظتك: ${why}. أرسل الصفقة مرة أخرى.`, txNoUser: 'المحفظة غير متصلة — لم يُحفظ شيء.',
    txSaveErr: why => `⚠️ لم تُحفظ — رفض Firestore (${why}).${/403/.test(why) ? ' حساب الخدمة للقراءة فقط: من Google Cloud → IAM امنحه دور "Cloud Datastore User".' : ''}`,
    nowHold: 'الآن',
    listening: '🎙️ أستمع…', heard: '🎙️ سمعت:', vNoAi: 'الرسائل الصوتية غير مُعدّة بعد (الـ AI binding غير موجود في الـ Worker) — اكتبها من فضلك.',
    vLong: s => `الرسالة الصوتية حتى ${s / 60} دقيقة فقط — أو اكتبها.`, vEmpty: '🎙️ لم أسمع كلاماً واضحاً — حاول مرة أخرى أو اكتبها.', vFail: '🎙️ لم أستطع قراءة هذه الرسالة الصوتية — حاول مرة أخرى أو اكتبها.',
  },
};

// ── small helpers ──
const cb = (text, data) => ({ text, callback_data: data });
// 📊 the Mini App (phase 7): this Worker's own address + /tg/app (learnt from the webhook's request, kept in KV for the cron)
let ORIGIN = null;
// 📱 the full app inside Telegram (a Mini App button): the real Cute Portfolio, signed in by Telegram (login.mjs) — one app, not two
export const webApp = (text, page = 'index.html') => ({ text, web_app: { url: APP + page } });
export const appBtn = t => webApp(t.openApp);
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
const menuRows = t => [[cb(t.pf, 'pf'), cb(t.market, 'mk')], [cb(t.plan, 'pl'), cb(t.movers, 'mv')], [cb(t.signals, 'sg'), cb(t.exit, 'ex')], [cb(t.alertsB, 'al'), cb(t.coin, 'coin')], [cb(t.dailyB, 'dy'), cb(t.paperB, 'pp')], [appBtn(t), cb(t.other, 'lang:' + t.otherCode)].filter(Boolean)];
// the keyboard under the chat: 6 buttons, 3 rows. Each one is matched by its exact text (both languages), so a tap always works
// the keyboard under the chat: 6 short buttons in 2 rows. Not pinned: the ⌨️ icon in the message box hides / shows it,
// /hide hides it, /start brings it back. Each button is matched by its exact text (both languages, old names too).
const replyKb = t => ({ keyboard: [[{ text: t.kb.pf }, { text: t.kb.mk }, { text: t.kb.pl }], [{ text: t.kb.ex }, { text: t.kb.mv }, { text: t.kb.sg }]], resize_keyboard: true, is_persistent: false, input_field_placeholder: 'btc · sol eth · /menu' });
const KB_ACT = () => Object.fromEntries(Object.values(T).flatMap(L => [...Object.entries(L.kb), ...Object.entries(L.kbOld || {})].map(([act, text]) => [text, act])));

// ── language: English by default; 🌐 in the menu (or /lang) switches. Kept in the Worker's KV (RATE), else in memory ──
const memLang = new Map();   // per chat (each person has their own language)
export async function getLang(env) {
  return langOf(env, memLang.get(chatOf(env)));
}
const memRange = new Map();
async function getRange(env) { let v = memRange.get(chatOf(env)); try { if (env.RATE) v = +(await env.RATE.get(K(env, 'mk'))) || v; } catch (_) {} return RANGES.includes(+v) ? +v : 100; }
async function setRange(env, v) { memRange.set(chatOf(env), v); try { if (env.RATE) await env.RATE.put(K(env, 'mk'), String(v)); } catch (_) {} }
async function setLang(env, v) { memLang.set(chatOf(env), v); try { if (env.RATE) await env.RATE.put(K(env, 'lang'), v); } catch (_) {} if (!isOwner(env)) await setMember(env, chatOf(env), { lang: v }).catch(() => {}); }

// ── views: each returns { text, buttons } ──
export function viewMenu(t, owner = true, badge = '') { return { text: `${owner ? t.hi : badge ? t.hiAll.replace('👋', badge) : t.hiAll}\n${t.menuTitle}`, buttons: menuRows(t) }; }   // "Hi Samir" only for Samir

// short lines (they fit a phone without wrapping): money in bold, a dot for up / down, details after a ·
const hm = now => local(now, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const row = (sym, v, extra) => `<code>${esc(String(sym).toUpperCase().padEnd(6))}${pct(v, 1).padStart(7)}</code> ${extra}`;
function moverRows(sum, key, dir, n = 5) {
  return sum.coins.filter(c => c[key] != null && c.value >= 1 && !isStable(c.sym)).sort((a, b) => dir * (b[key] - a[key])).slice(0, n).filter(c => dir > 0 ? c[key] > 0 : c[key] < 0);
}
// Arabic: every part of a line starts with an Arabic word, so Telegram keeps the parts in order right-to-left
// (two Latin runs side by side — "BTC 59.8% · USDT 6.95%" — could swap places)
export { FNG_AR, SEASON_AR };   // (the words live in alerts-core.mjs: the GitHub brief uses them too)
function marketShort(t, m) {
  const g = m.global || {}, d = g.dom || {}, out = [], ar = isAr(t);
  if (m.btc) out.push(ar ? `البيتكوين <b>${usd(m.btc.price)}</b> · ${dot(m.btc.ch24)} ${pct(m.btc.ch24)}` : `BTC <b>${usd(m.btc.price)}</b> ${dot(m.btc.ch24)} ${pct(m.btc.ch24)}`);
  if (d.btc != null) out.push(ar ? `${t.dom}: البيتكوين ${d.btc.toFixed(1)}% · التيثر ${(d.usdt || 0).toFixed(2)}%` : `${t.dom} BTC ${d.btc.toFixed(1)}% · USDT ${(d.usdt || 0).toFixed(2)}%`);
  if (m.fng) out.push(`${esc(t.fng)} <b>${m.fng.value}</b> · ${esc(ar ? FNG_AR[m.fng.label] || m.fng.label : m.fng.label)}`);
  if (m.alt && m.alt.value != null) out.push(`${t.altS} <b>${m.alt.value}</b> · ${esc(ar ? SEASON_AR[m.alt.label] || m.alt.label : m.alt.label)}`);
  const e = etfDay(m.etf); if (e) out.push(ar ? `تدفقات ETF (${arDay(e.date)}):\n• BTC ${flow(e.btc)} · ETH ${flow(e.eth)}` : `${t.etf} ${e.label} · BTC ${flow(e.btc)} · ETH ${flow(e.eth)}`);
  return out;
}
const nearestTp = sum => (sum.tps || []).filter(x => x.price < x.level).map(x => ({ ...x, to: (x.level / x.price - 1) * 100 })).sort((a, b) => a.to - b.to)[0];
export function viewPortfolio(t, cfg, sum, m, now) {
  // Arabic: the value line starts with a label (a line that opens with "$" shows left-to-right in Telegram)
  const L = [`💼 <b>${t.pfNow}</b> · ${hm(now)}`, '', isAr(t) ? `💵 القيمة: <b>${usd2(sum.value)}</b>` : `<b>${usd2(sum.value)}</b>`];
  if (isAr(t)) {   // Arabic: every line "label: amount (percent)", like the value line — read right-to-left in one go
    if (sum.ch24 != null) L.push(`📅 اليوم: <b>${signed(sum.d24)}</b> (${pct(sum.ch24)}) ${dot(sum.ch24)}`);
    L.push(`💰 ${t.profit}: <b>${signed(sum.total)}</b> (${pct(sum.pctTotal, 1)})`);
    if (sum.vsBtc != null) L.push(`🆚 ${t.vsBtcS}: <b>${pct(sum.vsBtc)}</b> ${dot(sum.vsBtc)} · ${t.beat(sum.beat, sum.alts)}`);
  } else {
    if (sum.ch24 != null) L.push(`${dot(sum.ch24)} ${pct(sum.ch24)} · ${signed(sum.d24)} ${t.today}`);
    L.push(`${t.profit} <b>${signed(sum.total)}</b> · ${pct(sum.pctTotal, 1)}`);
    if (sum.vsBtc != null) L.push(`${t.vsBtcS} ${dot(sum.vsBtc)} ${pct(sum.vsBtc)} · ${t.beat(sum.beat, sum.alts)}`);
  }
  const up = moverRows(sum, 'ch24', 1), dn = moverRows(sum, 'ch24', -1);
  if (up.length) L.push('', `📈 <b>${t.bestT}</b>`, ...up.map(c => row(c.sym, c.ch24, usd(c.value))));
  if (dn.length) L.push('', `📉 <b>${t.worstT}</b>`, ...dn.map(c => row(c.sym, c.ch24, usd(c.value))));
  const mk = marketShort(t, m); if (mk.length) L.push('', `🌍 <b>${t.mkT}</b>`, ...mk);
  L.push('', `🎯 ${t.sigT} 🟢 ${sum.counts.reinforce} · 🔴 ${sum.counts.sell} · ⚪ ${sum.counts.hold}`);
  if (sum.plan.length) L.push(`📋 ${t.planS} <b>${sum.prog.pct.toFixed(1)}%</b> · ${isAr(t) ? `${sum.prog.completed} من ${sum.prog.counted}` : `${sum.prog.completed}/${sum.prog.counted}`} ✅`);
  if (sum.alloc) L.push(`⚖️ ${t.allocS} ${t.onT(sum.alloc.onTarget, sum.alloc.count)}`);
  if ((sum.dca || []).length) L.push(`🛒 ${isAr(t) ? '' : 'DCA '}${t.dcaS(sum.dca.length, usd(sum.dca.reduce((a, x) => a + x.s.perMonth, 0)))}`);
  const mc = sum.macro.filter(x => x.met).length, tp = nearestTp(sum);
  L.push(`🚪 ${t.exitS(mc)}${tp ? ` · ${t.nearTp} ${esc(tp.sym)} +${tp.to.toFixed(0)}%` : ''}`);
  return { text: L.join('\n'), buttons: [[cb(t.refresh, 'pf'), cb(t.movers, 'mv')], [cb(t.plan, 'pl'), cb(t.exit, 'ex')], [cb(t.signals, 'sg'), webApp(t.openApp)], [cb(t.back, 'menu')]] };
}

// 🚪 the exit plan: the 3 market conditions (BTC / USDT dominance, ETH/BTC) and your take-profit levels, nearest first
export function viewExit(t, sum, now) {
  const mc = sum.macro.filter(x => x.met).length, name = { btcD: t.btcD, usdtD: t.usdtD, ethBtc: t.ethBtc };
  const L = [`🚪 <b>${t.exitT}</b> · ${hm(now)}`, '', `🧭 <b>${t.conds}</b> · ${t.met3(mc)}`];
  for (const x of sum.macro) {
    const v = n => n == null ? '—' : n.toFixed(x.dp) + x.unit;
    L.push(`${x.met ? '✅' : '⏳'} ${name[x.k]}: ${v(x.now)} → ${x.op} ${v(x.lvl)}`);   // (one left-to-right piece in Arabic: "58.7% → ≤ 45.9%")
  }
  if (mc === 3) L.push(`🔔 <b>${t.allExit}</b>`);
  const tps = (sum.tps || []).map(x => ({ ...x, to: (x.level / x.price - 1) * 100 })).sort((a, b) => a.to - b.to);
  L.push('', `🎯 <b>${t.tpT}</b>`, `<i>${t.tpKey}</i>`);
  if (!tps.length) L.push(t.noExit);
  const bySym = new Map(); tps.forEach(x => { if (!bySym.has(x.sym)) bySym.set(x.sym, []); bySym.get(x.sym).push(x); });
  // one short line per level (fits a phone): ⬜ TP1 $0.5529 · +93% · 25%  — the 8 coins closest to a take-profit
  // Arabic: a line whose first visible letter is Latin shows left-to-right in Telegram whatever marks it carries (seen 20 Nov) —
  // so those rows start with a sign (• / 🔹 / ⏳), like the ⬜ / ✅ rows that always came out right
  // as many coins as fit: the Arabic marks (bidi.mjs) make a message longer, and past Telegram's 4,096 it would go out unmarked (scrambled)
  const block = ([sym, list]) => ['', isAr(t) ? `🔹 <b>${esc(sym)}</b>: ${price(list[0].price)}` : `<b>${esc(sym)}</b> · ${price(list[0].price)}`,
    ...list.sort((a, b) => a.n - b.n).map(x => `${x.to <= 0 ? '✅' : '⏳'} TP${x.n} ${price(x.level)} · ${x.to <= 0 ? t.reached : `+${x.to.toFixed(0)}%`}${x.pct ? ` · ${x.pct}%` : ''}`)];
  const all = [...bySym];
  let n = Math.min(8, all.length), text;
  for (;;) {
    const M = [...L, ...all.slice(0, n).flatMap(block)];
    if (all.length > n) M.push('', `<i>${t.more(all.length - n)}</i>`);
    text = M.join('\n');
    if (n <= 1 || bidi(text).length <= 4000) break;
    n--;
  }
  return { text, buttons: [[cb(t.refresh, 'ex'), url(t.openExit, APP + 'accumulation.html#exit')], [cb(t.pf, 'pf'), cb(t.back, 'menu')]] };
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
    const ar = isAr(t);
    L.push('', `<b>${t[k]}</b> (${by[k].length})${ar ? ' · <i>مقارنة بمتوسطك</i>' : ''}`);
    by[k].sort((a, b) => a.chg - b.chg).slice(0, 12).forEach(c => L.push(ar   // Arabic: no fixed-width block (it mixes with the Arabic word): "JUP −27.2% · متوسطك $0.309"
      ? `• <b>${esc(c.sym)}</b> ${pct(c.chg, 1)} · متوسطك ${price(c.avg)}${c.pending ? ' ⏳' : ''}`
      : `<code>${esc(c.sym.padEnd(6))} ${pct(c.chg, 1).padStart(7)}</code>  ${t.vsAvg} ${price(c.avg)}${c.pending ? ' ⏳' : ''}`));
    if (by[k].length > 12) L.push('…');
  }
  // ⏳ decided on the daily close; a coin whose live price says something else is marked, not moved
  if (sum.coins.some(c => c.pending)) L.push('', isAr(t) ? '<i>⏳ بانتظار تأكيد الإغلاق اليومي (03:00 بتوقيت الرياض)</i>' : '<i>⏳ waiting for the daily close to confirm (03:00 Riyadh)</i>');
  else L.push('', isAr(t) ? '<i>الإشارات على قفلة اليوم (03:00 بتوقيت الرياض)</i>' : '<i>Signals on the daily close (03:00 Riyadh)</i>');
  L.push('', isAr(t) ? NOT_ADVICE.ar : NOT_ADVICE.en);
  return { text: L.join('\n'), buttons: [[cb(t.refresh, 'sg'), cb(t.pf, 'pf')], [cb(t.back, 'menu')]] };
}

export function viewPlan(t, sum, now) {
  if (!sum.plan.length && !(sum.dca || []).length && !(sum.buyAt || []).length) return { text: `📋 <b>${t.planT}</b>\n\n${t.noPlan}`, buttons: [[webApp(t.openApp, 'accumulation.html'), cb(t.back, 'menu')]] };
  const L = [`📋 <b>${t.planT}</b>`];
  if (sum.plan.length) {
    L.push(`${t.overall}: <b>${sum.prog.pct.toFixed(1)}%</b> · ${sum.prog.completed}/${sum.prog.counted} ✅`, '');
    const BL = isAr(t) ? 7 : 10, bar = p => { const n = Math.round(Math.min(1, p) * BL); return '▰'.repeat(n) + '▱'.repeat(BL - n); };   // Arabic: a shorter bar, so "باقي 9.82" fits the line
    [...sum.plan].sort((a, b) => b.actual / b.target - a.actual / a.target).forEach(p => {
      const f = p.target > 0 ? p.actual / p.target : 0;
      L.push(isAr(t)   // Arabic: no fixed-width block next to Arabic words (it reads backwards right-to-left)
        ? `• <b>${esc(p.sym)}</b> ${bar(f)} ${Math.min(999, f * 100).toFixed(0)}%${f >= 1 ? ' ✅' : ` · باقي ${+Number(p.target - p.actual).toPrecision(4)}`}`
        : `<code>${esc(p.sym.padEnd(6))}</code> ${bar(f)} ${Math.min(999, f * 100).toFixed(0)}%${f >= 1 ? ' ✅' : `  ${t.left} ${qty(p.target - p.actual)}`}`);
    });
  }
  if ((sum.dca || []).length) {
    L.push('', `🛒 <b>${t.dca}</b>`);
    sum.dca.forEach(x => L.push(isAr(t)   // Arabic: "BTC: $3,000 شهرياً · القادم 2026-12-01" (no padded code block: it reads backwards right-to-left)
      ? `• ${esc(x.sym)}: ${usd(x.s.perMonth)} شهرياً${x.s.next ? ` · القادم: ${x.s.next}` : ''}${x.s.state === 'today' ? ' · ⏰' : ''}`
      : `<code>${esc(x.sym.padEnd(6))}</code> ${usd(x.s.perMonth)}/mo${x.s.next ? ` · ${t.next} ${x.s.next}` : ''}${x.s.state === 'today' ? ' · ⏰' : ''}`));
  }
  if ((sum.buyAt || []).length) {
    L.push('', `🔔 <b>${t.buyAt}</b>`);
    sum.buyAt.forEach(x => { const d = (x.price / x.at - 1) * 100; L.push(`${isAr(t) ? `• <b>${esc(x.sym)}</b>` : `<code>${esc(x.sym.padEnd(6))}</code>`} ${price(x.at)} · ${price(x.price)} ${d > 0 ? `(${pct(d, 1)} ${t.away})` : '✅'}`); });
  }
  return { text: L.join('\n'), buttons: [[cb(t.refresh, 'pl'), webApp(t.openApp, 'accumulation.html')], [cb(t.back, 'menu')]] };
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
  return { text: L.join('\n'), buttons: [mkTabs(t, 'c'), RANGES.map(n => cb((n === range ? '✓ ' : '') + 'Top ' + n, 'mk:' + n)), [cb(t.refresh, 'mk:' + range), url('🧭 Market Hub', APP + 'market.html')], [cb(t.back, 'menu')]] };
}
// 🌍 the market's three sections, like the app's Market Hub: 🪙 Crypto · 📈 bStocks · 🥇 Metals (a tap redraws the message)
const isAr = t => t.otherCode === 'en';
const mkTabs = (t, on) => [['c', '🪙 ' + (isAr(t) ? 'كريبتو' : 'Crypto'), 'mk'], ['s', '📈 bStocks', 'mks'], ['m', '🥇 ' + (isAr(t) ? 'المعادن' : 'Metals'), 'mkm']].map(([k, l, d]) => cb((k === on ? '✓ ' : '') + l, d));
const riyadh = (ms, ar) => new Date(ms).toLocaleString(ar ? 'ar-SA-u-nu-latn' : 'en-GB', { timeZone: 'Asia/Riyadh', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
export function viewStocks(t, m, now) {
  const ar = isAr(t), st = (m.stocks || []).filter(r => r.price > 0), ch = st.filter(r => r.ch24 != null), us = usMarket(now);
  const L = [`📈 <b>${ar ? 'الأسهم المرمّزة (bStocks)' : 'bStocks'}</b> · ${hm(now)}`, ''];
  if (!st.length) L.push(ar ? 'لا توجد بيانات bStocks الآن — حاول لاحقاً.' : 'No bStocks data right now — try again later.');
  else {
    const up = ch.filter(r => r.ch24 > 0).length, dn = ch.filter(r => r.ch24 < 0).length, avg = ch.length ? ch.reduce((s, r) => s + r.ch24, 0) / ch.length : null;
    const cap = st.reduce((s, r) => s + (r.mcap || 0), 0), line = r => row(r.sym, r.ch24, price(r.price));
    L.push(`🇺🇸 ${ar ? 'السوق الأمريكي' : 'US market'}: <b>${US_STATE[ar ? 'ar' : 'en'][us.state]}</b> · ${us.state === 'open' ? (ar ? 'يُغلق' : 'closes') : (ar ? 'يفتح' : 'opens')} ${riyadh(us.next, ar)} ${ar ? 'بتوقيت الرياض' : 'Riyadh'}`,
      ar ? `📊 عدد الأسهم ${st.length}${cap > 0 ? ` · القيمة السوقية ${big(cap)}` : ''}\n🟢 صاعد ${up} · 🔴 هابط ${dn} · المتوسط ${pct(avg, 2)}`
        : `📊 ${st.length} stocks${cap > 0 ? ` · ${big(cap)}` : ''} · 🟢 ${up} / 🔴 ${dn} · avg ${pct(avg, 2)}`);
    const sUp = [...ch].sort((a, b) => b.ch24 - a.ch24).slice(0, 5), sDn = [...ch].sort((a, b) => a.ch24 - b.ch24).slice(0, 5);
    L.push('', `📈 <b>${t.stUp}</b>`, ...sUp.map(line), '', `📉 <b>${t.stDn}</b>`, ...sDn.map(line), '',
      `<i>${t.stNote} · ${ar ? 'التوكن يُتداول 24/7، والسهم الحقيقي وقت سوق نيويورك فقط.' : 'the token trades 24/7, the real share only while New York is open.'}</i>`);
  }
  return { text: L.join('\n'), buttons: [mkTabs(t, 's'), [cb(t.refresh, 'mks'), url('🧭 Market Hub', APP + 'market.html#stocks')], [cb(t.back, 'menu')]] };
}
export function viewMetals(t, m, now) {
  const ar = isAr(t), list = (m.metals || []).filter(x => x.k !== 'brent');   // metals only (no oil)
  const L = [`🥇 <b>${ar ? 'المعادن' : 'Metals'}</b> · ${hm(now)}`, ''];
  if (!list.length) L.push(ar ? 'لا توجد بيانات للمعادن الآن — حاول لاحقاً.' : 'No metals data right now — try again later.');
  for (const x of list) {
    const d = METAL[x.k] || ['•', x.k, x.k], u = UNIT[x.unit] || ['', ''];
    // Arabic: no unit on the line (it is said once below) and "أسبوع" — so the line fits a phone without wrapping
    // (and no 🟢 / 🔴 dot, one decimal: "البلاتين $1,364 · اليوم −4.3% · أسبوع −11.3%" still fits)
    const gram = ['gold', 'silver', 'platinum'].includes(x.k) && x.unit === 'oz';
    if (ar) {   // two short lines: the price and today; then the week and the gram (a phone fits each on one line)
      L.push(`${d[0]} <b>${d[2]}</b> ${price(x.price)} · اليوم ${pct(x.ch24, 1)}`);
      const l2 = [x.ch7 != null ? `أسبوع ${pct(x.ch7, 1)}` : null, gram ? `الجرام <b>${gramSar(x.price).toFixed(2)} ريال</b>` : null].filter(Boolean);
      if (l2.length) L.push('      ' + l2.join(' · '));
    } else {
      L.push(`${d[0]} <b>${d[1]}</b> ${price(x.price)} / ${u[0]} · ${dot(x.ch24)} ${pct(x.ch24, 2)}${x.ch7 != null ? ` · 7d ${pct(x.ch7, 1)}` : ''}`);
      if (gram) L.push(`      1 gram: <b>${gramSar(x.price).toFixed(2)} SAR</b> · ${usd2(x.price / 31.1034768)}`);
    }
  }
  const g = list.find(x => x.k === 'gold'), s = list.find(x => x.k === 'silver');
  if (g && s && s.price > 0) L.push('', `⚖️ ${ar ? 'نسبة الذهب إلى الفضة' : 'Gold / silver ratio'}: <b>${(g.price / s.price).toFixed(1)}</b>`);
  const at = m.parts && m.parts.metals ? Math.max(1, Math.round((now - Date.parse(m.parts.metals)) / 60e3)) : null;
  L.push('', `<i>${ar ? 'العقود الآجلة — Yahoo Finance، بتأخير ~15 دقيقة' : 'Futures — Yahoo Finance, ~15 min delayed'}${at ? ` · ${t.snap(at)}` : ''}. ${ar ? 'الأسعار للأونصة (النحاس للرطل). الجرام: عيار 24 دون مصنعية.' : 'Gram: pure 24k, no making charge.'}</i>`);
  return { text: L.join('\n'), buttons: [mkTabs(t, 'm'), [cb(t.refresh, 'mkm'), url('🧭 Market Hub', APP + 'market.html#metals')], [cb(t.back, 'menu')]] };
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
  L.push('', `<i>${isAr(t) ? 'المصدر: ' : ''}${src}${age ? ' · ' + age : ''}</i>`);   // (Arabic: the line starts with an Arabic word, not "CoinGecko")
  const btns = [[cb(t.refresh, 'c:' + coin.id.slice(0, 58)), url(t.liq, LIQ + encodeURIComponent(sym))], [url(t.chart, /^x-/.test(coin.id) ? 'https://www.tradingview.com/symbols/' + encodeURIComponent(sym) + 'USDT/' : 'https://www.coingecko.com/en/coins/' + encodeURIComponent(coin.id))]];
  if (mine) btns[1].push(url(t.inApp, APP + 'index.html#holdings/' + encodeURIComponent(sym)));
  btns.push([cb(t.back, 'menu')]);
  return { text: L.join('\n'), buttons: btns };
}

// ── Telegram ──
async function tg(env, method, body) {
  body = bidiBody(body);   // Arabic lines read right-to-left (bidi.mjs)
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false }));
}
const send = (env, chat, v, extra = {}) => tg(env, 'sendMessage', { chat_id: chat, text: v.text.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true, ...(v.buttons ? { reply_markup: { inline_keyboard: v.buttons } } : {}), ...extra });
const edit = (env, chat, msgId, v) => tg(env, 'editMessageText', { chat_id: chat, message_id: msgId, text: v.text.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true, ...(v.buttons ? { reply_markup: { inline_keyboard: v.buttons } } : {}) });

// what you typed → an action
const WORDS = [
  [/^\/(feedback|bug|idea)(@\w+)?(\s+[\s\S]+)?$/i, 'fb'],   // first: its text may hold any word ("/feedback المحفظة …")
  [/^\/?(start|menu|help|القائمة|مساعدة|ابدأ)$/i, 'menu'],
  [/^\/?(portfolio|pf|wallet)$|محفظتي|المحفظة/i, 'pf'], [/^\/?(market|mk)$|السوق/i, 'mk'], [/^\/(stocks|bstocks)$|^الأسهم$/i, 'mks'], [/^\/(metals|gold)$|^المعادن$|^الذهب$/i, 'mkm'], [/^\/?(plan|pl)$|الخطة/i, 'pl'],
  [/^\/?(hide|اخفي|إخفاء|اخفاء)$/i, 'hide'], [/^\/(new|reset|clear)$|^محادثة جديدة$/i, 'new'], [/^\/(forget|delete)$|^امسح بياناتي$/i, 'fg'],
  [/^\/?(alerts|al)$|^التنبيهات$|^تنبيهاتي$/i, 'al'],
  [/^\/(balances|exchanges|cex)$|^أرصدتي$|^المنصات$|^أرصدة المنصات$/i, 'bal'],
  [/^\/invite$/i, 'inv'], [/^\/(users|members)$/i, 'us'], [/^\/(link|start\s+L)\s*[A-Za-z0-9]{8}$/i, 'link'], [/^\/app(\s+\S+)?$/i, 'app'], [/^\/(start\s+)?premium$|^المميز$/i, 'prem'], [/^\/(start\s+)?support$|^ادعم$/i, 'sup'], [/^\/stats$/i, 'stats'], [/^\/guide$|^الدليل$|^دليل$/i, 'gd'], [/^\/(community|group|channel)$|^المجتمع$|^الجروب$/i, 'cm'], [/^\/community setup$/i, 'cm:setup'], [/^\/community guide$/i, 'cm:guide'], [/^\/announce\s+[\s\S]+$/i, 'ann'], [/^\/start\s+guide$/i, 'gd'], [/^\/start\s+\S+$/i, 'menu'], [/^\/(report|app)$|^التقرير$/i, 'rp'], [/^\/(daily|settings)$|^اليومي$/i, 'dy'], [/^\/(paper|practice)$|^تجريبي$/i, 'pp'], [/^\/morning$/i, 'dy:now:m'], [/^\/evening$/i, 'dy:now:e'], [/^\/pin$/i, 'pin:on'], [/^\/unpin$/i, 'pin:off'],
  [/^\/?(lang|language|لغة|اللغة)$/i, 'lang'], [/^(عربي|arabic)$/i, 'lang:ar'], [/^(english|انجليزي|إنجليزي)$/i, 'lang:en'],
  [/^\/?(exit|ex)$|خطة الخروج|الخروج/i, 'ex'],
  [/^\/?(movers|mv|best)$|الأفضل/i, 'mv'], [/^\/?(signals|sg)$|الإشارات/i, 'sg'], [/^\/?(coin|price)$/i, 'coin'],
];
export function parse(text) {
  const kb = KB_ACT()[String(text || '').trim()];
  if (kb) return { act: kb };
  if (/^[^@\s/]+@[^@\s]+\.[^@\s]+$/.test(String(text || '').trim())) return { act: 'app' };   // a bare e-mail (after "/app" asked for one) = the app request
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
  if (act === 'menu') return { t, views: [viewMenu(t, isOwner(env), await badgeOf(env, t))] };
  if (act === 'lang') return { t, views: [{ text: '🌐 English / عربي', buttons: [[cb('🇬🇧 English', 'lang:en'), cb('🇸🇦 عربي', 'lang:ar')]] }] };
  if (act === 'coin') return { t, views: [{ text: `🪙 ${t.askCoin}`, buttons: [[cb(t.back, 'menu')]] }] };
  if (act === 'soon') return { t, views: [{ text: t.soon, buttons: menuRows(t) }] };
  const needUser = ['pf', 'pl', 'mv', 'sg', 'ex'].includes(act);
  if (needUser && !user) return { t, views: [{ text: isOwner(env) ? t.noUser : t.noLink, buttons: [[cb(t.market, 'mk'), cb(t.back, 'menu')]] }] };
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
  if (act === 'mks') return { t, views: [viewStocks(t, m, now)] };
  if (act === 'mkm') return { t, views: [viewMetals(t, m, now)] };
  const sum = summarize(withIds(user, m), m, now);
  if (act === 'pf') return { t, views: [viewPortfolio(t, cfg, sum, m, now)] };
  if (act === 'mv') return { t, views: [viewMovers(t, sum)] };
  if (act === 'sg') return { t, views: [viewSignals(t, sum)] };
  if (act === 'pl') return { t, views: [viewPlan(t, sum, now)] };
  if (act === 'ex') return { t, views: [viewExit(t, sum, now)] };
  return { t, views: [viewMenu(t, isOwner(env), await badgeOf(env, t))] };
}

// ── the webhook ──
const ok = () => new Response('ok', { headers: { 'content-type': 'text/plain' } });
// a secret compared in the same time whatever its first letters are (nothing to learn from how long a wrong one takes)
function same(a, b) { a = String(a || ''); b = String(b || ''); let d = a.length ^ b.length; for (let i = 0; i < b.length; i++) d |= (a.charCodeAt(i) || 0) ^ b.charCodeAt(i); return d === 0; }
export async function handleTelegram(request, env) {
  if (request.method !== 'POST') return new Response('Not found', { status: 404 });
  if (!env.TG_SECRET || !same(request.headers.get('X-Telegram-Bot-Api-Secret-Token'), env.TG_SECRET)) return new Response('Forbidden', { status: 403 });
  resetBudget();   // a fresh allowance of outside calls for this message
  const origin = new URL(request.url).origin;
  if (ORIGIN !== origin) { ORIGIN = origin; try { if (env.RATE) await env.RATE.put('tg:origin', origin); } catch (_) {} }
  const u = await request.json().catch(() => null);
  if (!u) return ok();
  await ensureHook(env, request);
  if (u.pre_checkout_query) { await preCheckout(env, u.pre_checkout_query); return ok(); }
  if (u.my_chat_member) { await onMyChatMember(env, u); return ok(); }           // 📢💬 added to the channel / the group
  if (u.chat_join_request) { await onJoinRequest(env, u); return ok(); }         // members in, strangers out   // ⭐💛 a Stars payment: Telegram asks first
  const msg = u.message || u.edited_message, q = u.callback_query;
  const chat = msg ? msg.chat && msg.chat.id : q && q.message && q.message.chat && q.message.chat.id;
  if (chat == null) return ok();
  if (!(await allowed(env, chat))) {   // not (yet) invited: only an invite code works
    // 🛡 a stranger can't make the bot work for them: 20 messages an hour, then nothing at all (no KV, no Firebase)
    if ((await bump('stranger', chat, 3600e3)) > STRANGER_MSGS_PER_HOUR) return ok();
    return stranger(env, u, msg, chat);
  }
  if (String(chat) !== String(env.TELEGRAM_CHAT_ID)) {   // a member: ⏸ paused → nothing (one note a day); 🌊 too many messages → wait
    const x = (await members(env))[String(chat)] || {}, ar = x.lang === 'ar';
    const quiet = () => q ? tg(env, 'answerCallbackQuery', { callback_query_id: q.id }).catch(() => {}) : null;
    if (x.paused) { await quiet(); if (await strangerOnce(env, chat)) await tg(env, 'sendMessage', { chat_id: chat, text: ar ? '⏸ البوت متوقف لديك مؤقتاً — تواصل مع Dr. Samir Saad.' : '⏸ The bot is paused for you for now — ask Dr. Samir Saad.' }).catch(() => {}); return ok(); }
    const f = await flood(env, chat);
    if (f !== 'ok') { await quiet(); if (f === 'warn') await tg(env, 'sendMessage', { chat_id: chat, text: ar ? '🌊 رسائل كثيرة متتالية — انتظر دقيقة ثم تابع 🙂' : '🌊 That\'s a lot of messages at once — wait a minute, then carry on 🙂' }).catch(() => {}); return ok(); }
  }
  await migrateOwner(env);
  await markSeen(env, chat).catch(() => {});   // 💤 any message or button tap → active again (idle.mjs)
  note(featureOf(msg, q));   // 📊 which command / button / kind of message (counts only — usage.mjs)
  return asChat(chat, () => onUpdate(env, u, msg, q, chat));   // everything below runs as this chat: its own alerts, memory, language…
}
// 📊 a short name for what this update used: cmd:<command> · btn:<button group> · voice · photo · text (a question or a ticker)
export function featureOf(msg, q) {
  if (q) return 'btn:' + String(q.data || '').split(':')[0].slice(0, 16);
  if (!msg) return 'other';
  if (msg.voice || msg.audio) return 'voice';
  if (msg.photo || msg.document) return 'photo';
  const t = typeof msg.text === 'string' ? msg.text.trim() : '';
  const c = /^\/([A-Za-z_]{1,16})/.exec(t);
  if (c) return 'cmd:' + c[1].toLowerCase();
  const kb = t && KB_ACT()[t];   // a button of the keyboard under the chat
  return kb ? 'kb:' + String(kb).slice(0, 16) : t ? 'text' : 'other';
}
// 👋 someone who isn't invited: a valid code (typed, or via the t.me/<bot>?start=CODE link) lets them in; anything else gets
// one polite answer a day. Only private chats (no groups).
const STR = {
  en: { private: '🔒 This bot is private. If you have an invite code, send it here.', bad: '❌ That invite code is not valid (or was already used).', full: 'The bot is full right now — ask the owner.',
    welcome: n => `👋 Welcome, ${n}! You're in ✅\nAsk me anything about crypto in plain words, tap a button below, or send a ticker like <code>btc</code>.\nYour portfolio isn't linked yet — that comes next.\n📘 <code>/guide</code> — everything the bot and the app can do.`, joined: (n, u) => `👤 <b>${n}</b>${u ? ' (@' + u + ')' : ''} joined with your invite.` },
  ar: { private: '🔒 هذا البوت خاص. إن كان لديك رمز دعوة فأرسله هنا.', bad: '❌ رمز الدعوة غير صالح (أو استُخدم من قبل).', full: 'البوت ممتلئ حالياً — تواصل مع مالكه.',
    welcome: n => `👋 أهلاً ${n}! تم دخولك ✅\nاسألني أي سؤال عن الكريبتو بكلماتك، أو اضغط زراً بالأسفل، أو أرسل رمزاً مثل <code>btc</code>.\nمحفظتك غير مربوطة بعد — هذه هي الخطوة التالية.\n📘 <code>/guide</code> — كل ما يقدمه البوت والتطبيق.`, joined: (n, u) => `👤 <b>${n}</b>${u ? ' (@' + u + ')' : ''} انضم بدعوتك.` },
};
async function stranger(env, u, msg, chat) {
  if (!msg || !msg.chat || msg.chat.type !== 'private' || typeof msg.text !== 'string') return ok();
  if (u.update_id != null && (await bump('upd', u.update_id, 3600e3)) > 1) return ok();   // Telegram sent it twice (no KV write for a stranger)
  const L = /^ar/.test((msg.from && msg.from.language_code) || '') ? 'ar' : 'en', w = STR[L];
  const lk = (/^\/(?:start\s+L|link\s*)([A-Za-z0-9]{8})$/i.exec(msg.text.trim()) || [])[1];
  const anyCode = lk || /^\/start\s+[A-Za-z0-9]{8}\b|^[A-Za-z0-9]{8}$/.test(msg.text.trim());
  // 🛡 codes (invite / link) — 5 tries an hour per chat: a link code is checked against Firebase, and guessing must
  // never be able to use up the free daily reads (or the KV writes)
  if (anyCode && (await bump('code', chat, 3600e3)) > STRANGER_CODES_PER_HOUR) return ok();
  if (lk) {   // 📱 someone who joined from the APP links the bot: their app's code → they're in, portfolio linked, in one step
    const hit = await findLinkCode(env, lk.toUpperCase()), x = hit && await moveAppMember(env, hit.uid, chat, msg.from);
    if (x) {
      await asChat(chat, async () => { await setLang(env, L); await setCfg(env, { morning: true, evening: true, pin: true, radar: true, sectors: true }); const t = T[L];
        await send(env, chat, { text: w.welcome(esc(x.name)).split('\n').slice(0, 2).join('\n') + '\n' + AW[L].linked }, { reply_markup: replyKb(t) }); await send(env, chat, viewMenu(t, false)); });
      await asChat(env.TELEGRAM_CHAT_ID, async () => send(env, env.TELEGRAM_CHAT_ID, { text: STR[await getLang(env)].joined(esc(x.name), esc(x.user)) + ' · 📱→🤖', buttons: [[cb('👥 /users', 'us')]] }));
      return ok();
    }
  }
  const code = (/^\/start\s+([A-Za-z0-9]{8})\b/.exec(msg.text.trim()) || /^([A-Za-z0-9]{8})$/.exec(msg.text.trim()) || [])[1];
  if (code) {
    const r = await useInvite(env, code, chat, msg.from);
    if (r.ok) {
      await asChat(chat, async () => { await setLang(env, L); const t = T[L]; await send(env, chat, { text: w.welcome(esc(r.member.name)) + (r.restored ? (L === 'ar' ? '\n\n↩️ أهلاً بعودتك — ' + [r.restored.premium ? 'العضوية المميزة ⭐' : '', r.restored.supporter ? 'شارة الداعم 💛' : ''].filter(Boolean).join(' و') + ' عادت إليك كما كانت.' : '\n\n↩️ Welcome back — ' + (r.restored.premium ? 'your ⭐ premium' : '') + (r.restored.premium && r.restored.supporter ? ' and ' : '') + (r.restored.supporter ? 'your 💛 supporter badge' : '') + ' came back with you.') : '') }, { reply_markup: replyKb(t) }); await send(env, chat, viewMenu(t, isOwner(env))); });
      await asChat(env.TELEGRAM_CHAT_ID, async () => send(env, env.TELEGRAM_CHAT_ID, { text: STR[await getLang(env)].joined(esc(r.member.name), esc(r.member.user)), buttons: [[cb('👥 /users', 'us')]] }));
      return ok();
    }
    if (await strangerOnce(env, chat)) await send(env, chat, { text: r.error === 'full' ? w.full : w.bad });
    return ok();
  }
  if (await strangerOnce(env, chat)) await send(env, chat, { text: w.private });
  return ok();
}

// 👥 /users (owner): who's in, 🗑 to remove someone; ➕ a new invite
async function viewUsers(env, lang) {
  const m = await members(env), ar = lang === 'ar', list = Object.entries(m);
  const mx = await maxMembers(env), L = [ar ? `👥 <b>الأعضاء</b> (${list.length}/${mx})` : `👥 <b>Members</b> (${list.length}/${mx})`, ''];
  if (!list.length) L.push(ar ? 'لا يوجد أعضاء بعد. اضغط ➕ لإنشاء رمز دعوة.' : 'Nobody yet. Tap ➕ for an invite code.');
  const used = await Promise.all(list.map(([c, x]) => usedToday(env, c, x)));
  const keys = await Promise.all(list.map(([c]) => asChat(c, () => keyInfo(env))));   // 🔑 their own Claude key
  list.forEach(([c, x], i) => L.push(`${i + 1}. ${x.paused ? '⏸ ' : ''}${premiumNow(x) ? '⭐ ' : ''}${x.supporter ? '💛 ' : ''}${keys[i].has ? '🔑 ' : ''}<b>${esc(x.name)}</b>${x.user ? ' @' + esc(x.user) : ''} · <i>${esc(local(x.joined, { day: 'numeric', month: 'short' }))}</i>${x.email ? ' · 📱' : ''}${x.uid ? ' · 🔗' : ''}\n    ${ar ? 'اليوم' : 'today'} 🧠 ${used[i].q}/${keys[i].has ? BYOK_AI : Number.isFinite(x.ai) ? x.ai : DEF_AI} · 📊 ${used[i].r}/${keys[i].has ? BYOK_REPORTS : Number.isFinite(x.reports) ? x.reports : DEF_REPORTS}`));
  if (list.length) L.push('', ar ? '<i>اضغط على الاسم لتغيير حدوده أو إزالته · 📱 التطبيق · 🔗 المحفظة مربوطة · 🔑 مفتاح Claude الخاص به</i>' : '<i>Tap a name to change their limits or remove them · 📱 app · 🔗 portfolio linked · 🔑 own Claude key</i>');
  const b = []; for (let i = 0; i < list.length; i += 3) b.push(list.slice(i, i + 3).map(([c, x], j) => cb(`${i + j + 1}. ${x.name.split(' ')[0].slice(0, 12)}${x.uid ? ' 🔗' : x.email ? ' 📱' : ''}`, 'us:m:' + c)));
  b.push([cb(ar ? '➕ دعوة جديدة' : '➕ New invite', 'us:inv'), cb(T[lang].back, 'menu')]);
  return { text: L.join('\n'), buttons: b };
}
async function inviteMsg(env, lang) {
  const code = await newInvite(env), ar = lang === 'ar';
  let bot = null; try { bot = env.RATE ? await env.RATE.get('tg:botname') : null; } catch (_) {}
  if (!bot) { const me = await tg(env, 'getMe', {}).catch(() => null); bot = me && me.ok && me.result && me.result.username; if (bot) try { if (env.RATE) await env.RATE.put('tg:botname', bot); } catch (_) {} }
  const link = bot ? `https://t.me/${bot}?start=${code}` : null;
  return { text: (ar ? `🎟 <b>رمز دعوة</b> — لمرة واحدة، صالح 7 أيام:\n\n<code>${code}</code>` : `🎟 <b>Invite code</b> — works once, for 7 days:\n\n<code>${code}</code>`) +
    (link ? (ar ? `\n\nأو أرسل له هذا الرابط (يفتح البوت ويدخله مباشرة):\n${link}` : `\n\nOr send this link (opens the bot and lets them in):\n${link}`) : ''), buttons: [[cb(ar ? '👥 الأعضاء' : '👥 Members', 'us')]] };
}

// 🧹 /forget
const FG = {
  en: { ask: '🧹 <b>Delete everything the bot keeps for you?</b>\nYour alerts, chat memory, language, daily settings, pinned message, radars and paper portfolio — and the link to your portfolio.\n\nYour portfolio in the app is NOT touched (it stays yours). You can link again any time.', yes: '✅ Yes, delete', no: '❌ Cancel',
    done: '🧹 Done — the bot has forgotten everything about you. Your app portfolio is untouched.\nTo link again: the app → Settings → Telegram → Link your portfolio.', kept: 'OK — nothing was deleted.', owner: 'That is for invited members. For you: /new clears the AI chat; your settings stay.' },
  ar: { ask: '🧹 <b>هل تريد حذف كل ما يحفظه البوت عنك؟</b>\nتنبيهاتك، وذاكرة المحادثة، واللغة، وإعدادات الرسائل اليومية، والرسالة المثبتة، والرادارات، والتداول التجريبي — وربط محفظتك.\n\nمحفظتك في التطبيق لن تُمس (تبقى لك). ويمكنك الربط مرة أخرى في أي وقت.', yes: '✅ نعم، احذف', no: '❌ لا',
    done: '🧹 تم — نسي البوت كل شيء عنك. محفظتك في التطبيق كما هي.\nللربط مرة أخرى: التطبيق ← الإعدادات ← تليجرام ← ربط محفظتك ببوت تليجرام.', kept: 'حسناً — لم يُحذف شيء.', owner: 'هذا للأعضاء. بالنسبة لك: /new يمسح محادثة الذكاء الاصطناعي، وتبقى إعداداتك كما هي.' },
};
// what a member used today: AI questions (Riyadh day) and AI Analysis reports (UTC day, counted per app account)
async function usedToday(env, c, x) {
  let q = 0, r = 0;
  try { if (env.RATE) { q = +(await env.RATE.get(`tg:${c}:ai:${localParts(Date.now()).date}`)) || 0; if (x.uid) r = +(await env.RATE.get(`ai:${x.uid}:${new Date().toISOString().slice(0, 10)}`)) || 0; } } catch (_) {}
  return { q, r };
}

// 🔌 /balances — your exchanges' live balances (read-only keys connected in the app: Performance → Wallets & Exchanges),
// next to the app's amounts. Binance goes through the relay, which wants a signed-in token: the Worker makes one for
// this chat's own account (idTokenFor). Nothing is changed in the portfolio.
async function viewBalances(env, lang, fresh = false) {
  const ar = lang === 'ar', back = [cb(ar ? '⬅️ القائمة' : '⬅️ Menu', 'menu')], open = webApp(ar ? '📱 افتح في التطبيق' : '📱 Open in the app', 'performance.html');
  const uid = await chatUid(env);
  if (!uid) return { text: ar ? '🔌 اربط محفظتك أولاً (التطبيق ← الإعدادات ← تليجرام)، ثم اربط منصاتك من التطبيق: الأداء ← المحافظ والمنصات ← المنصات.' : '🔌 Link your portfolio first (app → Settings → Telegram), then connect your exchanges in the app: Performance → Wallets & Exchanges → Exchanges.', buttons: [back] };
  const r = await balancesFor(env, uid, await idTokenFor(env, uid), fresh).catch(() => null);
  if (!r || !r.exchanges.length) return { text: ar ? '🔌 <b>المنصات · الأرصدة المباشرة</b>\n\nلم تربط أي منصة بعد. من التطبيق: الأداء ← المحافظ والمنصات ← <b>المنصات</b> — بمفتاح API للقراءة فقط (Binance · Gate).' : '🔌 <b>Exchanges · live balances</b>\n\nNo exchange connected yet. In the app: Performance → Wallets & Exchanges → <b>Exchanges</b> — with a read-only API key (Binance · Gate).', buttons: [[open], back] };
  const user = await loadUser(env).catch(() => null), app = {}, price = {};
  if (user) { const m = await loadMarket([], coinsOf(user)).catch(() => null); if (m) { const sum = summarize(withIds(user, m), m, Date.now()); for (const c of sum.coins || []) { app[c.sym] = c.qty; if (c.price > 0) price[c.sym] = c.price; } } }
  const ex = {};
  for (const b of r.balances || []) if (b.ok) for (const a of b.assets || []) { const q = (a.spot || 0) + (a.funding || 0) + (a.earn || 0); if (q > 0) { const o = ex[a.sym] || (ex[a.sym] = { sym: a.sym, q: 0 }); o.q += q; } }
  const fq = n => parseFloat(Number(n).toPrecision(8)).toLocaleString('en-US', { maximumFractionDigits: 8 });
  const rows = [], other = [];
  let tot = 0;
  for (const o of Object.values(ex)) {
    const p = price[o.sym] || (/^(USDT|USDC|FDUSD|DAI)$/.test(o.sym) ? 1 : 0), a = app[o.sym] || 0, usdv = o.q * p; tot += usdv;
    if (!a) { if (!(p > 0 && usdv < 1)) other.push(o); continue; }
    const d = o.q - a, same = p > 0 ? Math.abs(d) * p < 0.5 : Math.abs(d) <= Math.max(a, o.q) * 1e-4;
    rows.push({ usdv, line: `${same ? '✅' : d > 0 ? '➕' : '▫️'} <b>${esc(o.sym)}</b> ${fq(o.q)}${usdv ? ` · ${usd(usdv)}` : ''}` + (same ? '' : `\n      ${d > 0 ? (ar ? 'أكثر من التطبيق' : 'more than the app') + ' · ' : ''}${ar ? 'التطبيق' : 'app'}: ${fq(a)}`) });   // the app's amount on its own line (reads cleanly in Arabic too)
  }
  rows.sort((x, y) => y.usdv - x.usdv);
  const errs = (r.balances || []).filter(b => !b.ok).map(b => `⚠️ ${esc(b.name)}: ${b.error === 'blocked' ? (ar ? 'لا تستجيب الآن' : 'not answering now') : b.error === 'refused' || b.error === 'noperm' ? (ar ? 'رفضت المفتاح — راجعه في التطبيق' : 'refused the key — check it in the app') : (ar ? 'تعذّرت القراءة' : 'could not read')}`);
  const mins = Math.max(0, Math.round((Date.now() - (r.at || Date.now())) / 60000));
  const L = [ar ? '🔌 <b>المنصات · الأرصدة المباشرة</b>' : '🔌 <b>Exchanges · live balances</b>',
    `<i>${esc(r.exchanges.map(x => x.name).join(' · '))} · ${mins ? (ar ? `منذ ${mins} دقيقة` : `${mins} min ago`) : (ar ? 'الآن' : 'just now')}</i>`, '',
    `💰 ${ar ? 'على المنصات' : 'On exchanges'}: <b>${usd(tot)}</b>`, '', ...rows.slice(0, 25).map(x => x.line),
    ...(other.length ? ['', ar ? `🆕 <b>غير موجودة في التطبيق</b> (${other.length})` : `🆕 <b>Not in the app</b> (${other.length})`,
      ...(o => { const r = []; for (let i = 0; i < o.length; i += 2) r.push('▪️ ' + o.slice(i, i + 2).map(x => `${esc(x.sym)}\u00A0${fq(x.q)}`).join(' · '));   /* a mark first: a line that starts with a ticker came out left-to-right on Android */ return r; })(other.sort((x, y) => y.q - x.q).slice(0, 16))] : []),   // 2 a line, a ticker never apart from its amount
    ...(errs.length ? ['', ...errs] : []),
    '', ar ? '<i>✅ مطابق · ➕ أكثر من التطبيق · ▫️ الباقي في محافظك أو مكان آخر. قراءة فقط — لا يتغير شيء في محفظتك.</i>' : '<i>✅ matches · ➕ more than the app · ▫️ the rest is in your wallets or elsewhere. Read-only — nothing is changed in your portfolio.</i>'];
  return { text: L.join('\n'), buttons: [[cb(ar ? '🔄 تحديث' : '🔄 Refresh', 'bal:r'), open], back] };
}

// 📘 /guide — the same guide as the app's (guide.json): a grouped index of buttons; each part opens in place as a card,
// with ◀️ Previous · 📘 Index · Next ▶️
export function guideView(lang, k = null) {
  const L = lang === 'ar' ? 'ar' : 'en', ar = L === 'ar', S = GUIDE.sections, i = k ? S.findIndex(x => x.k === k) : -1;
  if (i >= 0) {
    const nav = [i > 0 ? cb(ar ? '◀️ السابق' : '◀️ Previous', 'gd:' + S[i - 1].k) : null, cb(ar ? '📘 الفهرس' : '📘 Index', 'gd'), i < S.length - 1 ? cb(ar ? 'التالي ▶️' : 'Next ▶️', 'gd:' + S[i + 1].k) : null].filter(Boolean);
    return { text: guideCard(S[i], L), buttons: [nav, [cb(ar ? '⬅️ القائمة' : '⬅️ Menu', 'menu')]] };
  }
  const gs = guideGroups(), b = [];
  for (const g of gs) for (let j = 0; j < g.items.length; j += 2) b.push(g.items.slice(j, j + 2).map(x => cb(`${x.e} ${(x.b || x.t)[L]}`, 'gd:' + x.k)));   // short names: two fit in a row; each group starts a row
  b.push([cb(ar ? '⬅️ القائمة' : '⬅️ Menu', 'menu')]);
  const list = gs.map(g => (g.e ? `${g.e} <b>${g.t[L]}</b>: ` : '') + g.items.map(x => (x.b || x.t)[L]).join(' · ')).join('\n');
  return { text: `<b>${GUIDE.title[L]}</b>\n\n${GUIDE.intro[L]}\n\n${list}`, buttons: b };
}

// ⭐ / 💛 next to a member's hello: "Hi ⭐ — premium member · 💛 Supporter"
async function badgeOf(env, t) {
  if (isOwner(env)) return '';
  const x = await member(env); if (!x) return '';
  const ar = t === T.ar, p = premiumNow(x), s = !!x.supporter, k = (await keyInfo(env)).has;   // 🔑 own Claude key: its own badge (not premium, not supporter)
  if (!p && !s && !k) return '';
  return [p ? (ar ? '⭐ — عضو مميز' : '⭐ — premium member') : '👋', k ? (ar ? '🔑 مفتاح Claude الخاص بك' : '🔑 Your own Claude key') : '', s ? '💛 Supporter' : ''].filter(Boolean).join(' · ');
}

// 📱 /app you@example.com — an invited person asks to open the app with that e-mail; the owner taps ✅ (or ❌)
const AW = {
  en: { ask: 'Send the e-mail you will sign in with, like:\n<code>/app you@example.com</code>\n(Google, or any e-mail with a sign-in link.)', sent: '📨 Sent to Dr. Samir Saad for approval — you\'ll get a message here.', owner: '📱 You already have the app 🙂',
    req: (n, e) => `📱 <b>${n}</b> asks to open the app with\n<code>${e}</code>`, ok: e => `✅ You can open the app now with <b>${e}</b>:\n${APP}\nThen Settings → Telegram → 🔗 Link your portfolio, to see your portfolio here.`, no: 'Your app request was not approved.',
    linked: '🔗 Linked ✅ — your portfolio, plan and exit plan now show here (only to you).', badCode: '❌ That code is not valid or is over 10 minutes old — make a new one in the app (Settings → Telegram → Link your portfolio).', notYou: '❌ That code was made by another e-mail than the one approved for you.', ownerLink: 'Your portfolio is already the bot\'s 🙂' },
  ar: { ask: 'أرسل البريد الإلكتروني الذي ستدخل به، هكذا:\n<code>/app you@example.com</code>\n(حساب Google، أو أي بريد برابط دخول.)', sent: '📨 أُرسل الطلب إلى Dr. Samir Saad للموافقة — سيصلك الرد هنا.', owner: '📱 لديك التطبيق بالفعل 🙂',
    req: (n, e) => `📱 <b>${n}</b> يريد فتح التطبيق بـ\n<code>${e}</code>`, ok: e => `✅ يمكنك الآن فتح التطبيق بـ <b>${e}</b>:\n${APP}\nثم الإعدادات ← تليجرام ← 🔗 ربط محفظتك ببوت تليجرام لتظهر محفظتك هنا.`, no: 'لم تتم الموافقة على طلب التطبيق.',
    linked: '🔗 تم الربط ✅ — تظهر الآن محفظتك وخطتك وخطة الخروج هنا (لك وحدك).', badCode: '❌ هذا الرمز غير صالح أو مرّت عليه 10 دقائق — أنشئ رمزاً جديداً من التطبيق (الإعدادات ← تليجرام ← ربط محفظتك ببوت تليجرام).', notYou: '❌ هذا الرمز أُنشئ ببريد غير البريد الذي تمت الموافقة عليه لك.', ownerLink: 'محفظتك هي المربوطة بالبوت بالفعل 🙂' },
};
async function appRequest(env, chat, text) {
  const lang = await getLang(env), w = AW[lang];
  if (isOwner(env)) { await send(env, chat, { text: w.owner }); return; }
  const email = (/([^@\s/]+@[^@\s]+\.[^@\s]+)/.exec(text) || [])[1];
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { await send(env, chat, { text: w.ask }); return; }
  const e = email.toLowerCase().slice(0, 120), me = await member(env);
  // the invite was Samir's yes: the app opens for that e-mail at once (he gets a note, and can remove them any time)
  await setMember(env, chat, { email: e }); await clearPending(env, chat);
  const okSync = await syncAccess(env, await accessEmails(env)).catch(() => false);
  await send(env, chat, { text: okSync ? w.ok(esc(e)) : (lang === 'ar' ? '⚠️ حدثت مشكلة — حاول مرة أخرى بعد دقيقة.' : '⚠️ Something went wrong — try again in a minute.') });
  await asChat(env.TELEGRAM_CHAT_ID, async () => { const L = await getLang(env); await send(env, env.TELEGRAM_CHAT_ID, { text: L === 'ar' ? `📱 <b>${esc(me ? me.name : chat)}</b> فتح التطبيق بـ\n<code>${esc(e)}</code>` : `📱 <b>${esc(me ? me.name : chat)}</b> opened the app with\n<code>${esc(e)}</code>`, buttons: [[cb(L === 'ar' ? '👤 البطاقة' : '👤 Their card', 'us:m:' + chat)]] }); });
}
// /link CODE (or the app's "Open the bot" → /start LCODE): this chat now reads that account's portfolio
async function linkPortfolio(env, chat, text) {
  const lang = await getLang(env), w = AW[lang], code = (/([A-Za-z0-9]{8})\s*$/.exec(text) || [])[1];
  if (isOwner(env)) { await send(env, chat, { text: w.ownerLink }); return; }
  const hit = code && await findLinkCode(env, code.toUpperCase());
  if (!hit) { await send(env, chat, { text: w.badCode }); return; }
  const me = await member(env);
  if (me && me.email && hit.email && hit.email !== me.email) { await send(env, chat, { text: w.notYou }); return; }
  await setMember(env, chat, { uid: hit.uid, ...(me && !me.email && hit.email ? { email: hit.email } : {}) });
  await setCfg(env, { morning: true, evening: true, pin: true, radar: true, sectors: true });   // their portfolio is here now: the daily messages come on
  await send(env, chat, { text: w.linked, buttons: [[cb(T[lang].pf, 'pf'), cb(T[lang].back, 'menu')]] });
}
// a member's card in /users: limits − / +, remove
async function viewMember(env, lang, c) {
  const x = await member(env, c), ar = lang === 'ar';
  if (!x) return viewUsers(env, lang);
  const ai = Number.isFinite(x.ai) ? x.ai : DEF_AI, rp = Number.isFinite(x.reports) ? x.reports : DEF_REPORTS;
  const u = await usedToday(env, c, x), kk = await asChat(c, () => keyInfo(env));
  const L = [`👤 ${x.paused ? '⏸ ' : ''}${premiumNow(x) ? '⭐ ' : ''}<b>${esc(x.name)}</b>${x.user ? ' @' + esc(x.user) : ''}${x.paused ? (ar ? ' — <b>متوقف</b>' : ' — <b>paused</b>') : ''}${premiumNow(x) ? (ar ? ' — <b>مميز</b>' : ' — <b>premium</b>') + (x.premUntil ? ` ${ar ? 'حتى' : 'until'} ${esc(local(x.premUntil, { day: 'numeric', month: 'short', year: 'numeric' }))}${x.premSrc === 'stars' ? ' (Stars)' : ar ? ' (هدية)' : ' (gift)'}` : '') : ''}${x.supporter ? ` · 💛 ${x.starsPaid || ''}⭐` : ''}`, `${ar ? 'من' : 'Since'} ${esc(local(x.joined, { day: 'numeric', month: 'short', year: 'numeric' }))}`,
    ...(kk.has ? [`🔑 ${ar ? 'يستخدم مفتاح Claude الخاص به' : 'Uses their own Claude key'} (…${esc(kk.tail)}) — ${ar ? 'التكلفة على حسابه' : 'on their bill'}`] : []),
    `📱 ${ar ? 'التطبيق' : 'App'}: ${x.email ? '<code>' + esc(x.email) + '</code>' : (ar ? 'ليس بعد' : 'not yet')}`, `🔗 ${ar ? 'المحفظة' : 'Portfolio'}: ${x.uid ? (ar ? 'مربوطة ✅' : 'linked ✅') : (ar ? 'غير مربوطة' : 'not linked')}`, '',
    `🧠 ${ar ? 'أسئلة AI في اليوم' : 'AI questions a day'}: <b>${kk.has ? BYOK_AI : ai}</b>${kk.has ? ' 🔑' : ''} · ${ar ? 'اليوم' : 'today'} ${u.q}`, `📊 ${ar ? 'تقارير AI Analysis في اليوم' : 'AI Analysis reports a day'}: <b>${kk.has ? BYOK_REPORTS : rp}</b>${kk.has ? ' 🔑' : ''} · ${ar ? 'اليوم' : 'today'} ${u.r}`,
    ...(kk.has ? [ar ? `<i>🔑 ما دام مفتاحه موجوداً فحدوده ${BYOK_AI} سؤال و${BYOK_REPORTS} تقارير (على حسابه) — أزرار − / + تغيّر حدوده بدون مفتاح.</i>` : `<i>🔑 While their key is set: ${BYOK_AI} questions and ${BYOK_REPORTS} reports (their bill) — − / + change the limits without a key.</i>`] : []), '',
    ar ? '<i>☆ إلغاء المميز: يزيل المزايا فقط — يبقى في البوت والتطبيق كالمعتاد.\n⏸ إيقاف: يتوقف البوت عنده (التطبيق يعمل) — ▶️ يعيده.\n🗑 إزالة العضو: يخرج من البوت والتطبيق — ↩️ يمكن إعادته خلال 60 يوماً.</i>'
       : '<i>☆ End premium: removes the extras only — stays in the bot and the app.\n⏸ Pause: the bot goes quiet for them (the app still works) — ▶️ to resume.\n🗑 Remove member: out of the bot and the app — ↩️ back within 60 days.</i>'];
  return { text: L.join('\n'), buttons: [[cb('🧠 −', `us:ai:-:${c}`), cb('🧠 +', `us:ai:+:${c}`), cb('📊 −', `us:rp:-:${c}`), cb('📊 +', `us:rp:+:${c}`)],
    [cb(ar ? '🎁 ⭐ +30 يوم' : '🎁 ⭐ +30 days', `us:pd:30:${c}`), cb(ar ? '🎁 ⭐ +365 يوم' : '🎁 ⭐ +365 days', `us:pd:365:${c}`)],
    [...(premiumNow(x) ? [cb(ar ? '☆ إلغاء المميز' : '☆ End premium', 'us:pr:' + c)] : []), cb(x.paused ? (ar ? '▶️ إعادة تشغيل' : '▶️ Resume') : (ar ? '⏸ إيقاف' : '⏸ Pause'), 'us:pz:' + c)],
    [cb('🗑 ' + (ar ? 'إزالة العضو' : 'Remove member'), 'us:del:' + c), cb(ar ? '⬅️ الأعضاء' : '⬅️ Members', 'us')]] };
}

async function onUpdate(env, u, msg, q, chat) {
  if (!(await firstTime(env, u.update_id))) return ok();   // Telegram re-sent it (a slow answer): already handled
  await ensureCmds(env); await ensureDesc(env); await ensureCmdScope(env);
  try {
    if (q) {
      const d = String(q.data || '');
      // the button keeps its little spinner while the numbers load; when done, a short note says so — so one tap is enough,
      // even when nothing changed (the message is the same → Telegram would show no change at all)
      const done = text => tg(env, 'answerCallbackQuery', { callback_query_id: q.id, ...(text ? { text } : {}) }).catch(() => {});
      if (d === 'gd' || /^gd:[a-z]+$/.test(d)) {   // 📘 the guide: index ↔ a part, in place
        const v = guideView(await getLang(env), d.slice(3) || null), r = await edit(env, chat, q.message.message_id, v);
        if (!r.ok && !/not modified/i.test(r.description || '')) await send(env, chat, v);
        await done(); return ok();
      }
      if (d === 'sp' || /^sp:\d+$/.test(d) || d === 'pm:ask' || d === 'pm') {   // 💛 support amounts · 🎁 ask for a gift · ⭐ premium page
        const lang = await getLang(env);
        if (d === 'sp') await send(env, chat, await supportView(env, lang));
        else if (d === 'pm') await send(env, chat, await premiumView(env, lang));
        else if (d === 'pm:ask') { if (!isOwner(env)) await askGift(env, chat, lang); }
        else await sendSupportInvoice(env, chat, +d.slice(3), lang);
        await done(); return ok();
      }
      if (d === 'fg:yes' || d === 'fg:no') {   // 🧹 /forget — confirmed (members only)
        const lang = await getLang(env), w = FG[lang];
        if (d === 'fg:no' || isOwner(env)) { await edit(env, chat, q.message.message_id, { text: w.kept }); await done(); return ok(); }
        try { const st = env.RATE ? JSON.parse((await env.RATE.get(K(env, 'pin'))) || '{}') : {}; await unpin(env).catch(() => {}); if (st.id) await tg(env, 'deleteMessage', { chat_id: chat, message_id: st.id }); } catch (_) {}
        const me = await member(env); if (me && me.uid) await forgetPortfolio(env, me.uid);
        await forgetChat(env, chat); await forget(env).catch(() => {});
        await setMember(env, chat, { uid: undefined, lang: undefined }); memLang.delete(String(chat)); cmdMem.delete(String(chat));
        await edit(env, chat, q.message.message_id, { text: w.done }); await done('🧹'); return ok();
      }
      if (/^lang:(ar|en)$/.test(d)) { await switchLang(env, chat, d.slice(5), q.message.message_id); await done(); return ok(); }
      if (/^ap:(ok|no):/.test(d)) {   // 📱 owner: allow / refuse a member's app e-mail
        const lang = await getLang(env), who = d.slice(6);
        if (!isOwner(env)) { await done(); return ok(); }
        const email = await getPending(env, who);
        await tg(env, 'editMessageReplyMarkup', { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
        if (!email || !(await member(env, who))) { await done('—'); return ok(); }
        await clearPending(env, who);
        if (d.startsWith('ap:ok:')) {
          await setMember(env, who, { email });
          const okSync = await syncAccess(env, await accessEmails(env)).catch(() => false);
          await asChat(who, async () => { const L = await getLang(env); await send(env, who, { text: AW[L].ok(esc(email)) }); });
          await done(okSync ? '✅' : '⚠️ Firestore'); return ok();
        }
        await asChat(who, async () => { const L = await getLang(env); await send(env, who, { text: AW[L].no }); });
        await done('❌'); return ok();
      }
      if (d === 'us' || /^us:/.test(d)) {   // 👥 owner only: members, remove, new invite
        const lang = await getLang(env);
        if (!isOwner(env)) { await done(); return ok(); }
        if (d === 'us:inv') { await send(env, chat, await inviteMsg(env, lang)); await done(); return ok(); }
        let note = null;
        if (d.startsWith('us:m:')) { await edit(env, chat, q.message.message_id, await viewMember(env, lang, d.slice(5))); await done(); return ok(); }
        const lim = /^us:(ai|rp):([+-]):(.+)$/.exec(d);
        if (lim) {   // − / + a member's daily limit (questions 0–50, reports 0–10)
          const x = await member(env, lim[3]);
          if (x) { const f = lim[1] === 'ai' ? 'ai' : 'reports', cur = Number.isFinite(x[f]) ? x[f] : (f === 'ai' ? DEF_AI : DEF_REPORTS), max = f === 'ai' ? 50 : 10;
            await setMember(env, lim[3], { [f]: Math.max(0, Math.min(max, cur + (lim[2] === '+' ? 1 : -1))) }); }
          await edit(env, chat, q.message.message_id, await viewMember(env, lang, lim[3])); await done('✅'); return ok();
        }
        if (d.startsWith('us:pr:') || /^us:pd:\d+:/.test(d)) {   // ⭐ a gift: +30 / +365 days (us:pr: on → 30 days, off → remove)
          const pd = /^us:pd:(\d+):(.+)$/.exec(d), who = pd ? pd[2] : d.slice(6), x = await member(env, who);
          let note = '⭐';
          if (x) {
            if (!pd && premiumNow(x)) { await revoke(env, who); note = '☆'; await tg(env, 'sendMessage', { chat_id: who, text: x.lang === 'ar' ? 'أُلغيت العضوية المميزة — عدت إلى الحدود العادية.' : 'Premium is off — back to the standard limits.' }).catch(() => {}); }
            else { const y = await addDays(env, who, pd ? Math.min(3650, +pd[1]) : 30), until = y && y.premUntil ? local(y.premUntil, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
              await tg(env, 'sendMessage', { chat_id: who, parse_mode: 'HTML', text: x.lang === 'ar' ? `🎁 Dr. Samir Saad منحك العضوية المميزة هديةً حتى ${until}!\nفُعّلت الرسائل الصوتية 🎙، و${PREM_AI} سؤال AI و${PREM_REPORTS} تقارير AI Analysis يومياً.` : `🎁 Dr. Samir Saad gave you premium as a gift — until ${until}!\nVoice notes 🎙 are on, with ${PREM_AI} AI questions and ${PREM_REPORTS} AI Analysis reports a day.` }).catch(() => {}); }
          }
          const v = await viewMember(env, lang, who), r = await edit(env, chat, q.message.message_id, v);
          if (!r.ok && !/not modified/i.test(r.description || '')) await send(env, chat, v);
          await done(note); return ok();
        }
        if (d.startsWith('us:pz:')) {   // ⏸ / ▶️ a member
          const who = d.slice(6), x = await member(env, who);
          if (x) { await setMember(env, who, { paused: x.paused ? undefined : true });
            const ar2 = x.lang === 'ar';
            await tg(env, 'sendMessage', { chat_id: who, text: x.paused ? (ar2 ? '▶️ عاد البوت للعمل لديك.' : '▶️ The bot is back on for you.') : (ar2 ? '⏸ تم إيقاف البوت لديك مؤقتاً.' : '⏸ The bot is paused for you for now.') }).catch(() => {}); }
          await edit(env, chat, q.message.message_id, await viewMember(env, lang, who)); await done(x && x.paused ? '▶️' : '⏸'); return ok();
        }
        if (d.startsWith('us:del:')) { const who = d.slice(7), had = await removeMember(env, who); if (had) { note = '🗑'; if (had.email) await syncAccess(env, await accessEmails(env)).catch(() => {}); await tg(env, 'sendMessage', { chat_id: who, text: lang === 'ar' ? 'تم إيقاف وصولك للبوت.' : 'Your access to this bot was removed.' }).catch(() => {}); } }
        await edit(env, chat, q.message.message_id, await viewUsers(env, lang)); await done(note); return ok();
      }
      if (d === 'pp' || /^pp:/.test(d)) {   // 🧪 the paper portfolio: 🔄, ↩️ undo, 🔁 start again
        const lang = await getLang(env), w = paperWords[lang];
        if (d === 'pp:new') { await edit(env, chat, q.message.message_id, viewRestart(lang)); await done(); return ok(); }
        let note = null;
        if (d === 'pp:undo') { const r = await undoLast(env); note = r.ok ? w.undone : w.nothing; }
        if (/^pp:new:\d+$/.test(d)) { const r = await paperReset(env, +d.slice(7)); note = r.ok ? '🔁 ' + usd(+d.slice(7)) : '⚠️'; }
        const v = await viewPaper(env, lang), r = await edit(env, chat, q.message.message_id, v);
        if (!r.ok && !/not modified/i.test(r.description || '')) await send(env, chat, v);
        await done(note || `✅ ${T[lang].updated}`); return ok();
      }
      if (d === 'dy' || /^dy:/.test(d) || d === 'pin:r') {   // 🗓 the daily messages: toggles, "now" buttons; 🔄 on the pinned message
        const lang = await getLang(env);
        if (d === 'pin:r') { await pinUpdate(env, Date.now(), true); await done(`✅ ${T[lang].updated}`); return ok(); }
        if (/^dy:now:[me]$/.test(d)) { await done(T[lang].working); await (d.endsWith('m') ? morning(env) : evening(env)); return ok(); }
        if (/^dy:(morning|evening|radar|sectors|pin)$/.test(d)) {
          const k = d.slice(3), c = await getCfg(env), on = !c[k];
          await setCfg(env, { [k]: on });
          if (k === 'pin') { if (on) await pinUpdate(env, Date.now(), true, true); else await unpin(env); }
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
      if (d === 'bal' || d === 'bal:r') {   // 🔌 the exchanges' live balances; 🔄 reads them again
        const lang = await getLang(env);
        await edit(env, chat, q.message.message_id, await viewBalances(env, lang, d === 'bal:r'));
        await done(null); return ok();
      }
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
    if (msg && isOwner(env) && (msg.forward_origin || msg.forward_from_chat) && await registerForward(env, msg)) return ok();   // 📢 a channel / group post forwarded by Samir → set it up
    if (msg && msg.successful_payment) { await paid(env, chat, msg.successful_payment, await getLang(env)); return ok(); }   // ⭐💛 paid (also each monthly renewal)
    if (msg && (msg.voice || msg.audio)) {
      if (!(await isPremium(env)) && !(await keyInfo(env)).has) { const ar = (await getLang(env)) === 'ar'; await send(env, chat, { text: ar ? '🎙 الرسائل الصوتية للأعضاء المميزين ⭐ — اكتب رسالتك، أو اطلبها من Dr. Samir Saad.' : '🎙 Voice notes are for ⭐ premium members — type it instead, or ask Dr. Samir Saad.' }); return ok(); }
      await onVoice(env, chat, msg.voice || msg.audio); return ok();
    }
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

// 💡 /feedback <text> — an idea or a bug, straight to Samir (the group's 💡 / 🐞 topics before 20 Nov)
async function feedback(env, chat, text) {
  const ar = (await getLang(env)) === 'ar', body = String(text || '').replace(/^\/(feedback|bug|idea)(@\w+)?/i, '').trim().slice(0, 2000);
  if (!body) return { text: ar ? '💡 اكتب <code>/feedback</code> ثم اقتراحك أو المشكلة في نفس الرسالة — تصل لسمير مباشرة.' : '💡 Send <code>/feedback</code> and your idea or the bug in the same message — it goes straight to Samir.' };
  if (isOwner(env)) return { text: 'ℹ️ That\'s for members — their /feedback comes to you here.' };
  const m = (await members(env))[String(chat)] || {};
  const r = await tg(env, 'sendMessage', { chat_id: env.TELEGRAM_CHAT_ID, parse_mode: 'HTML', disable_web_page_preview: true,
    text: `💡 <b>Feedback</b> · ${esc(m.name || 'member')}${m.user ? ' @' + esc(m.user) : ''} (<code>${esc(String(chat))}</code>)\n\n${esc(body)}` });
  return { text: r && r.ok ? (ar ? '✅ وصلت رسالتك لسمير — شكراً لك 💛' : '✅ Sent to Samir — thank you 💛') : (ar ? '⚠️ لم تصل الرسالة — حاول بعد قليل.' : '⚠️ It did not go — try again in a moment.') };
}
// a typed message (or a voice note's words) → a view, or a question for Claude
// into = { id, head }: a voice note's message — the answer goes into it, under what it heard
async function onText(env, chat, text, budget = 36, into = null) {
  const p = parse(text);
  tg(env, 'sendChatAction', { chat_id: chat, action: 'typing' }).catch(() => {});   // "typing…" while the numbers load
  if (into && p.act !== 'ai') {   // a view: it is drawn into the voice note's message (lists / settings: the heard line stays alone)
    if (!['menu', 'coin', 'coins', 'pf', 'mk', 'mks', 'mkm', 'pl', 'mv', 'sg', 'ex'].includes(p.act)) await edit(env, chat, into.id, { text: into.head });
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
  if (p.act === 'bal') { await tg(env, 'sendChatAction', { chat_id: chat, action: 'typing' }).catch(() => {}); await send(env, chat, await viewBalances(env, await getLang(env))); return; }
  if (p.act === 'dy') { await send(env, chat, await viewDaily(env)); return; }
  if (p.act === 'rp') { const t = T[await getLang(env)], b = appBtn(t); await send(env, chat, { text: t.reportT, buttons: b ? [[b]] : [[cb(t.back, 'menu')]] }); return; }
  if (p.act === 'pp') { await send(env, chat, await viewPaper(env, await getLang(env))); return; }
  if (p.act === 'app') { await appRequest(env, chat, text); return; }
  if (p.act === 'link') { await linkPortfolio(env, chat, text); return; }
  if (p.act === 'inv' || p.act === 'us') {   // owner only
    if (!isOwner(env)) { const t = T[await getLang(env)]; await send(env, chat, { text: t.ownerOnly }); return; }
    await send(env, chat, p.act === 'inv' ? await inviteMsg(env, await getLang(env)) : await viewUsers(env, await getLang(env))); return;
  }
  if (p.act === 'dy:now:m') { await morning(env); return; }
  if (p.act === 'dy:now:e') { await evening(env); return; }
  if (p.act === 'pin:on') { await setCfg(env, { pin: true }); const r = await pinUpdate(env, Date.now(), true, true).catch(() => null); if (!r || !r.ok) await send(env, chat, { text: (await getLang(env)) === 'ar' ? '⚠️ لم أستطع تثبيت الرسالة الآن — حاول مرة أخرى بعد دقيقة.' : '⚠️ I couldn\'t pin it right now — try again in a minute.' }); return; }
  if (p.act === 'pin:off') { await setCfg(env, { pin: false }); await unpin(env); await send(env, chat, { text: T[await getLang(env)].pinOff }); return; }
  if (p.act === 'new') { await forget(env); await send(env, chat, { text: T[await getLang(env)].newDone }); return; }
  if (p.act === 'cm') { await send(env, chat, await communityView(env, await getLang(env))); return; }
  if (p.act === 'fb') { await send(env, chat, await feedback(env, chat, text)); return; }
  if (p.act === 'cm:setup' || p.act === 'ann' || p.act === 'cm:guide') {   // Samir only
    if (!isOwner(env)) { await send(env, chat, { text: T[await getLang(env)].ownerOnly }); return; }
    if (p.act === 'cm:setup') { await communitySetup(env, 'channel'); await communitySetup(env, 'group'); return; }
    if (p.act === 'cm:guide') { await communitySetup(env, 'channel', { reguide: true }); return; }   // the 📘 guide post again (pinned)
    const out = await announce(env, String(text).replace(/^\/announce\s+/i, '').slice(0, 3500));
    await send(env, chat, { text: out.length ? '📣 ' + out.join(' ') : 'ℹ️ No channel yet.' }); return;
  }
  if (p.act === 'gd') { await send(env, chat, guideView(await getLang(env))); return; }
  if (p.act === 'prem') { await send(env, chat, await premiumView(env, await getLang(env))); return; }   // ⭐ what premium is, the price, Subscribe
  if (p.act === 'sup') { await send(env, chat, await supportView(env, await getLang(env))); return; }      // 💛 support (optional)
  if (p.act === 'stats') { const lang = await getLang(env); await send(env, chat, isOwner(env) ? await statsView(env, lang) : { text: T[lang].ownerOnly }); return; }
  if (p.act === 'fg') { const lang = await getLang(env), w = FG[lang];
    if (isOwner(env)) { await send(env, chat, { text: w.owner }); return; }
    await send(env, chat, { text: w.ask, buttons: [[cb(w.yes, 'fg:yes'), cb(w.no, 'fg:no')]] }); return; }
  if (p.act === 'ai') { await answer(env, chat, p.q, budget, into); return; }
  if (p.act === 'hide') { const t = T[await getLang(env)]; await send(env, chat, { text: t.hidden }, { reply_markup: { remove_keyboard: true } }); return; }
  const { t, views, ai } = await run(env, p.act, p.q, p.guess);
  if (ai) { await answer(env, chat, ai, budget); return; }
  if (/^\/start/.test(text)) { await send(env, chat, { text: t.welcome }, { reply_markup: replyKb(t) }); await privateCmds(env); }   // the keyboard under the chat + the "/" menu
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
  if (r.error) return show({ text: r.error === 'limit' ? t.aiLimit(r.limit) : r.error === 'nokey' ? t.aiNoKey : r.error === 'ownkey' ? t.aiOwnKey : r.error === 'busy' ? t.aiBusy : t.aiErr, buttons: [[cb(t.back, 'menu')]] });
  const srcAr = x => !isAr(t) ? x : String(x).replace(/^alerts \(checked every 5 min\)$/, 'التنبيهات (تُفحص كل 5 دقائق)').replace(/^your portfolio \(Firebase\)$/, 'محفظتك (Firebase)').replace(/^your plan \(Firebase\)$/, 'خطتك (Firebase)')
    .replace(/^your exit plan \(Firebase\)$/, 'خطة الخروج (Firebase)').replace(/^paper portfolio \(live prices\)$/, 'المحفظة التجريبية (أسعار مباشرة)').replace(/^what-if \(the app's maths\)$/, 'حساب «ماذا لو» (حسابات التطبيق)')
    .replace(/^hourly price history \(GitHub prices branch\)$/, 'سجل الأسعار بالساعة (GitHub)').replace(/^market snapshot \(CoinGecko, alternative\.me, ETF flows\)$/, 'لقطة السوق (CoinGecko و alternative.me وتدفقات ETF)')
    .replace(/^market snapshot( of .*)?$/, (m0, w) => 'لقطة السوق' + (w ? ' ' + w.replace(/^ of /, '') : '')).replace(/ \(live\)$/, ' (مباشر)').replace(/^futures: /, 'العقود الآجلة: ');
  const foot = `<i>📡 ${t.data}: ${esc(r.sources.length ? r.sources.map(srcAr).join(' · ') : (isAr(t) ? 'معرفة عامة' : 'general knowledge'))}\n${t.aiLeft(r.left, r.limit)}</i>`;
  const btns = [];
  if (r.coins.length) btns.push(r.coins.map(([cid, sym]) => cb('🪙 ' + sym, 'c:' + cid.slice(0, 58))));
  if (r.coins.length === 1) btns[0].push(url('🔥 Liq Map', LIQ + encodeURIComponent(r.coins[0][1])));
  if (r.paper) btns.push([cb(t.paperB, 'pp'), cb(paperWords[lang].undo, 'pp:undo')]);   // 🧪 a paper trade: see it / undo it
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
  await setLang(env, lang); await ensureCmds(env);   // the "/" menu in the new language
  const t = T[lang];
  await send(env, chat, { text: t.langSet }, { reply_markup: replyKb(t) });
  const bd = await badgeOf(env, t);
  if (msgId) await edit(env, chat, msgId, viewMenu(t, isOwner(env), bd)); else await send(env, chat, viewMenu(t, isOwner(env), bd));
  let hasPin = false; try { hasPin = !!(env.RATE && JSON.parse((await env.RATE.get(K(env, 'pin'))) || '{}').id); } catch (_) {}
  if (hasPin && (await getCfg(env)).pin) await pinUpdate(env, Date.now(), true).catch(() => {});   // the pinned message follows the new language now
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
const cmds = (lang, owner = true) => { const a = lang === 'ar'; return [
    ...(owner ? [] : [['app', a ? 'افتح التطبيق' : 'Open the app'], ['link', a ? 'اربط محفظتك — /link الرمز' : 'Link your portfolio — /link CODE'], ['premium', a ? 'العضوية المميزة ⭐' : 'Premium ⭐'], ['support', a ? 'ادعم المشروع 💛' : 'Support the project 💛'], ['forget', a ? 'احذف بياناتي من البوت' : 'Delete my data from the bot']]),
    ...(owner ? [['invite', a ? 'رمز دعوة لصديقك' : 'Invite code for a friend'], ['users', a ? 'الأعضاء' : 'Members'], ['stats', a ? 'الإحصائيات والـ Stars' : 'Stats & Stars']] : []),
    ['start', a ? 'ابدأ — الأزرار أسفل المحادثة' : 'Start — the buttons under the chat'], ['menu', a ? 'القائمة' : 'Menu'],
    ['report', a ? 'افتح التطبيق داخل تليجرام 📱' : 'Open the app in Telegram 📱'], ['portfolio', a ? 'محفظتي' : 'My portfolio'], ['price', a ? 'سعر عملة — /price btc' : 'A coin — /price btc'], ['market', a ? 'السوق' : 'Market'],
    ['stocks', a ? 'الأسهم المرمّزة (bStocks)' : 'Tokenized US stocks (bStocks)'], ['metals', a ? 'الذهب والمعادن' : 'Gold & metals'], ['plan', a ? 'خطة التجميع' : 'Accumulation plan'], ['exit', a ? 'خطة الخروج' : 'Exit plan'], ['movers', a ? 'الأفضل والأسوأ' : 'Best & worst'], ['signals', a ? 'الإشارات' : 'Signals'],
    ['alerts', a ? 'تنبيهاتك' : 'Your alerts'], ['balances', a ? 'أرصدة المنصات (Binance · Gate)' : 'Exchange balances (Binance · Gate)'], ['paper', a ? 'التداول التجريبي' : 'Paper trading'], ['daily', a ? 'الصباح والمساء والرادارات' : 'Morning, evening, radars'],
    ['morning', a ? 'الصباح الذكي الآن' : 'Smart morning now'], ['evening', a ? 'المساء الذكي الآن' : 'Smart evening now'],
    ['pin', a ? 'الرسالة المثبتة' : 'Live pinned message'], ['unpin', a ? 'إزالة الرسالة المثبتة' : 'Remove the pinned message'],
    ['guide', a ? 'الدليل الكامل 📘' : 'The full guide 📘'], ['community', a ? 'القناة والنقاش 👥' : 'Channel & comments 👥'], ['feedback', a ? 'اقتراح أو مشكلة 💡' : 'An idea or a bug 💡'], ['new', a ? 'محادثة جديدة مع الذكاء الاصطناعي' : 'New AI chat'], ['lang', 'English / عربي'], ['hide', a ? 'إخفاء الأزرار' : 'Hide the buttons'],
  ].map(([command, description]) => ({ command, description })); };
// the "/" menu follows the code: when the list (or the language) changed since it was last sent, it is sent again — no /start needed
async function ensureCmds(env) {
  const lang = await getLang(env), own = isOwner(env), v = lang + ':' + cmds(lang, own).map(c => c.command).join(','), c = chatOf(env);
  if (cmdMem.get(c) === v) return;
  let had = null; try { if (env.RATE) had = await env.RATE.get(K(env, 'cmdv')); } catch (_) {}
  if (had === v) { cmdMem.set(c, v); return; }
  const r = await tg(env, 'setMyCommands', { commands: cmds(lang, own), scope: { type: 'chat', chat_id: +c || c } }).catch(() => ({}));   // this chat's own "/" menu, in its language
  if (r && r.ok) { cmdMem.set(c, v); try { if (env.RATE) await env.RATE.put(K(env, 'cmdv'), v); } catch (_) {} }
}
const cmdMem = new Map();
// the general "/" menu: private chats only — in the members' group (and any group) the bot shows no commands at all
async function privateCmds(env, lang = null) {
  lang = lang || await getLang(env);
  await tg(env, 'deleteMyCommands', {}).catch(() => {});   // the old "everywhere" list (it showed in the group)
  return tg(env, 'setMyCommands', { commands: cmds(lang, false), scope: { type: 'all_private_chats' } }).catch(() => ({ ok: false }));
}
let cmdScopeDone = false;
async function ensureCmdScope(env) {   // once: move the general list to private chats
  if (cmdScopeDone) return;
  let v = null; try { v = env.RATE ? await env.RATE.get('tg:cmdscope') : null; } catch (_) {}
  if (v !== '1') { const r = await privateCmds(env); if (r && r.ok) try { if (env.RATE) await env.RATE.put('tg:cmdscope', '1'); } catch (_) {} }
  cmdScopeDone = true;
}
// the "What can this bot do?" text (shown before /start) and the short one on the bot's profile — set once per version
const DESC_V = '2';
const DESC = {
  en: ['Your private crypto assistant (by invitation). Ask anything in plain words or by voice, live coins and market, alerts in words, smart morning & evening, radars, paper trading, image cards and a full report page. Have an invite code? Send it here.', 'Private crypto assistant · by invitation'],
  ar: ['مساعدك الخاص في الكريبتو (بدعوة). اسأل أي سؤال كتابةً أو صوتاً، العملات والسوق مباشرة، تنبيهات بالكلام، صباح ومساء ذكي، رادارات، تداول تجريبي، بطاقات صور، وتقرير كامل. لديك رمز دعوة؟ أرسله هنا.', 'مساعد كريبتو خاص · بدعوة'],
};
async function ensureDesc(env) {
  let had = null; try { if (env.RATE) had = await env.RATE.get('tg:desc'); } catch (_) {}
  if (had === DESC_V || descMem === DESC_V) return;
  descMem = DESC_V;
  for (const [lc, [long, short]] of Object.entries(DESC)) {
    await tg(env, 'setMyDescription', { description: long, ...(lc === 'en' ? {} : { language_code: lc }) }).catch(() => {});
    await tg(env, 'setMyShortDescription', { short_description: short, ...(lc === 'en' ? {} : { language_code: lc }) }).catch(() => {});
  }
  try { if (env.RATE) await env.RATE.put('tg:desc', DESC_V); } catch (_) {}
}
let descMem = null;

// the webhook must also receive Telegram's payment checks (pre_checkout_query) — an older setup didn't ask for them: set once
const HOOK_UPDATES = ['message', 'edited_message', 'callback_query', 'pre_checkout_query', 'my_chat_member', 'chat_join_request'], HOOK_V = '3';
let hookMem = null;
async function ensureHook(env, request) {
  if (hookMem === HOOK_V) return;
  let had = null; try { had = env.RATE ? await env.RATE.get('tg:hookv') : null; } catch (_) {}
  if (had === HOOK_V) { hookMem = HOOK_V; return; }
  const u = new URL(request.url), r = await tg(env, 'setWebhook', { url: u.origin + u.pathname, secret_token: env.TG_SECRET, allowed_updates: HOOK_UPDATES, drop_pending_updates: false });
  if (r && r.ok) { hookMem = HOOK_V; try { if (env.RATE) await env.RATE.put('tg:hookv', HOOK_V); } catch (_) {} }
}

// ── one-time setup: GET /tg/setup?key=<TG_SECRET> ──
export async function setup(request, env) {
  const u = new URL(request.url), json = (s, o) => new Response(JSON.stringify(o, null, 2), { status: s, headers: { 'content-type': 'application/json' } });
  if (!env.TG_SECRET || !same(u.searchParams.get('key'), env.TG_SECRET)) return json(403, { ok: false, error: 'Wrong or missing key.' });
  const missing = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TG_SECRET'].filter(k => !env[k]);
  if (missing.length) return json(400, { ok: false, missing });
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(env.TG_SECRET)) return json(400, { ok: false, error: 'TG_SECRET must be 16+ letters, digits, _ or - (Telegram rule).' });
  const hook = u.origin + u.pathname.replace(/\/setup$/, '');
  const a = await tg(env, 'setWebhook', { url: hook, secret_token: env.TG_SECRET, allowed_updates: HOOK_UPDATES, drop_pending_updates: true });
  resetBudget();
  return asChat(env.TELEGRAM_CHAT_ID, async () => {   // the owner's chat
  const user = await loadUser(env).catch(() => null), lang = await getLang(env), t = T[lang];
  const b = await privateCmds(env, lang);
  const c = await send(env, env.TELEGRAM_CHAT_ID, { text: t.welcome }, { reply_markup: replyKb(t) });
  await send(env, env.TELEGRAM_CHAT_ID, viewMenu(t, isOwner(env)));
  return json(a.ok && b.ok && c.ok ? 200 : 502, { ok: !!(a.ok && b.ok && c.ok), webhook: a.ok ? 'set' : a.description, menu: b.ok ? 'set' : b.description, welcome: c.ok ? 'sent' : c.description, portfolio: serviceAccount(env) ? (user ? 'connected' : 'not found') : 'FIREBASE_SERVICE_ACCOUNT missing' });
  });
}

// ── a check you open in the browser: GET /tg/check?key=<TG_SECRET>&coin=SOL — the futures data for a coin, fresh, and
// every outside call it made (host, path, status). Shows no keys and no portfolio data.
export async function check(request, env) {
  const u = new URL(request.url), json = (s, o) => new Response(JSON.stringify(o, null, 2), { status: s, headers: { 'content-type': 'application/json' } });
  if (!env.TG_SECRET || !same(u.searchParams.get('key'), env.TG_SECRET)) return json(403, { ok: false, error: 'Wrong or missing key.' });
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
