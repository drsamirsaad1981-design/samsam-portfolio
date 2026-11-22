// tools/worker/xpost.mjs — 📣 the owner's daily post for X, ready to send (Samir only).
//
// Once a day (10:00 Riyadh) the bot sends Samir ONE message: today's post in Arabic and in English, each with a button
// that opens X with the text already written — he reads it, taps Post, done. The bot never posts on X itself (no X
// keys here): every post goes out by his own tap. The text is numbers from the same market data as the channel's pulse
// (never a signal, never advice), and each day takes a different angle so the account does not repeat itself:
//   0 the market pulse · 1 Bitcoin, gold and silver · 2 ETF flows and the market cap · 3 one thing the app does.
// /xpost → today's post now · /xpost off · /xpost on. KV tg:xpost = { off, day }.
import { loadMarket } from './data.mjs';
import { localParts, usd, pct, flow, etfDay, FNG_AR } from '../alerts-core.mjs';

const KEY = 'tg:xpost', PAGE = 'https://drsamirsaad1981-design.github.io/samsam-portfolio/welcome/';
const NOTE = { ar: 'للمعلومة فقط، وليست توصية.', en: 'For information only, not advice.' };
const FEATURES = [
  { ar: 'هل قراراتك في العملات أفضل من وضع المبلغ نفسه في البيتكوين أو الذهب؟ Cute Portfolio يجيبك بالأرقام من صفقاتك أنت.', en: 'Are your crypto decisions better than putting the same money in Bitcoin or gold? Cute Portfolio answers in numbers, from your own trades.' },
  { ar: 'خطة خروج تضعها وأنت هادئ: مستويات جني أرباح عند مضاعفات متوسط شرائك، وتنبيه حين يتحقق الهدف.', en: 'An exit plan you set while you are calm: take-profit levels at multiples of your average buy price, and an alert when a target is hit.' },
  { ar: 'ذهبك وفضتك بالغرام في المحفظة نفسها مع عملاتك، وزكاتها محسوبة بنصابها.', en: 'Your gold and silver, in grams, in the same portfolio as your coins, with zakat calculated by its own threshold.' },
  { ar: 'سجّل صفقتك بالكلام في تيليجرام: «اشتريت 0.01 BTC بسعر 95 ألف»، فتظهر في محفظتك بعد تأكيدك.', en: 'Record a trade in plain words on Telegram: "bought 0.01 BTC at 95k", and it is in your portfolio once you confirm.' },
  { ar: 'إشارات انضباط من قواعدك أنت: احتفاظ، تعزيز، أو تحويل. تذكير بخطتك، وليست توصيات.', en: 'Discipline signals from your own rules: Hold, Reinforce or Convert. A reminder of your plan, not tips.' },
];
const kv = { get: async env => { try { return JSON.parse((env.RATE && await env.RATE.get(KEY)) || '{}') || {}; } catch (_) { return {}; } }, put: async (env, v) => { try { if (env.RATE) await env.RATE.put(KEY, JSON.stringify(v)); } catch (_) {} } };
const tg = async (env, method, body) => { try { const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return await r.json(); } catch (_) { return { ok: false }; } };
const ch = v => v == null || !isFinite(v) ? '' : ` (${pct(v, 1)})`;

// today's two texts (plain text, ≤ 250 characters before the link) — null when the market data has nothing to say
export function xDraft(m, now) {
  const dayN = Math.floor((now + 3 * 3600e3) / 86400e3), angle = dayN % 4;
  const g = (m && m.global) || {}, d = g.dom || {}, btc = (m && m.btc) || {}, met = (m && m.metals) || [], f = k => met.find(x => x.k === k), e = m && etfDay(m.etf);
  let ar = null, en = null;
  if (angle === 0 && btc.price > 0) {
    ar = ['نبض السوق اليوم 📊', `• البيتكوين ${usd(btc.price)}${ch(btc.ch24)}`, m.fng ? `• الخوف والطمع: ${m.fng.value} (${FNG_AR[m.fng.label] || m.fng.label})` : null, m.alt && m.alt.value != null ? `• موسم العملات البديلة: ${m.alt.value}/100` : null, d.btc != null ? `• هيمنة البيتكوين: ${d.btc.toFixed(1)}%` : null];
    en = ['Market pulse today 📊', `• Bitcoin ${usd(btc.price)}${ch(btc.ch24)}`, m.fng ? `• Fear & Greed: ${m.fng.value} (${m.fng.label})` : null, m.alt && m.alt.value != null ? `• Altcoin season: ${m.alt.value}/100` : null, d.btc != null ? `• BTC dominance: ${d.btc.toFixed(1)}%` : null];
  } else if (angle === 1 && btc.price > 0 && f('gold') && f('gold').price > 0) {
    const go = f('gold'), si = f('silver');
    ar = ['البيتكوين والذهب والفضة اليوم 🥇', `• البيتكوين ${usd(btc.price)}${ch(btc.ch24)}`, `• الذهب ${usd(go.price)} للأونصة${ch(go.ch24)}`, si && si.price > 0 ? `• الفضة ${usd(si.price)}${ch(si.ch24)}` : null, 'هل تعرف كيف كان أداء محفظتك أمامها؟'];
    en = ['Bitcoin, gold and silver today 🥇', `• Bitcoin ${usd(btc.price)}${ch(btc.ch24)}`, `• Gold ${usd(go.price)} an ounce${ch(go.ch24)}`, si && si.price > 0 ? `• Silver ${usd(si.price)}${ch(si.ch24)}` : null, 'Do you know how your portfolio has done against them?'];
  } else if (angle === 2 && e && g.mcap) {
    ar = ['أين تتحرك السيولة؟ 🏦', `• صناديق ETF (${e.label}): البيتكوين ${flow(e.btc)} · الإيثيريوم ${flow(e.eth)}`, `• القيمة السوقية: $${(g.mcap / 1e12).toFixed(2)}T${ch(g.mcapCh24)}`, d.usdt != null ? `• هيمنة USDT: ${d.usdt.toFixed(2)}%` : null];
    en = ['Where is the money moving? 🏦', `• ETFs (${e.label}): BTC ${flow(e.btc)} · ETH ${flow(e.eth)}`, `• Market cap: $${(g.mcap / 1e12).toFixed(2)}T${ch(g.mcapCh24)}`, d.usdt != null ? `• USDT dominance: ${d.usdt.toFixed(2)}%` : null];
  }
  if (!ar) { const x = FEATURES[Math.floor(dayN / 4) % FEATURES.length]; return { angle: 3, ar: `${x.ar}\n\nمجاني وغير ربحي، والدخول بدعوة:\n${PAGE}`, en: `${x.en}\n\nFree and non-profit, by invitation:\n${PAGE}en.html` }; }
  return { angle, ar: [...ar.filter(Boolean), '', NOTE.ar, `Cute Portfolio: ${PAGE}`].join('\n'), en: [...en.filter(Boolean), '', NOTE.en, `Cute Portfolio: ${PAGE}en.html`].join('\n') };
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const intent = t => 'https://x.com/intent/post?text=' + encodeURIComponent(t);
export function xMessage(dr, lang) {
  const ar = lang === 'ar';
  return { text: [ar ? '📣 <b>منشور X لليوم</b> — اضغط الزر، راجع النص، ثم Post' : '📣 <b>Today\'s post for X</b> — tap a button, read it, then Post', '', '🇸🇦', esc(dr.ar), '', '🇬🇧', esc(dr.en), '', ar ? '<i>لا يُنشر شيء إلا بضغطتك. /xpost off لإيقاف هذه الرسالة.</i>' : '<i>Nothing is posted without your tap. /xpost off stops this message.</i>'].join('\n'),
    buttons: [[{ text: ar ? '🇸🇦 انشر العربي' : '🇸🇦 Post the Arabic', url: intent(dr.ar) }], [{ text: ar ? '🇬🇧 انشر الإنجليزي' : '🇬🇧 Post the English', url: intent(dr.en) }]] };
}
async function sendDraft(env, now, lang) {
  const m = await loadMarket([], []).catch(() => null), dr = xDraft(m, now), v = xMessage(dr, lang);
  return tg(env, 'sendMessage', { chat_id: env.TELEGRAM_CHAT_ID, text: v.text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: { inline_keyboard: v.buttons } });
}
// the cron: once a day in the 10:00–10:20 window (Riyadh), unless turned off
export async function runXPost(env, now = Date.now()) {
  if (!env.TELEGRAM_CHAT_ID) return { job: null };
  const lp = localParts(now), hm = lp.hour * 60 + (+lp.hm.slice(3) || 0); if (hm < 10 * 60 || hm >= 10 * 60 + 20) return { job: null };
  const s = await kv.get(env); if (s.off || s.day === lp.date) return { job: null };
  let lang = null; try { lang = env.RATE && await env.RATE.get(`tg:${env.TELEGRAM_CHAT_ID}:lang`); } catch (_) {}
  lang = lang === 'ar' || lang === 'en' ? lang : env.BOT_LANG === 'ar' ? 'ar' : 'en';   // the owner's own bot language
  const r = await sendDraft(env, now, lang); if (r && r.ok) { s.day = lp.date; await kv.put(env, s); }
  return { job: 'xpost', ok: !!(r && r.ok) };
}
// /xpost · /xpost on · /xpost off (the owner)
export async function xCommand(env, text, lang, now = Date.now()) {
  const a = (/^\/xpost\s+(on|off)$/i.exec(String(text).trim()) || [])[1], ar = lang === 'ar';
  if (a) { const s = await kv.get(env); s.off = a.toLowerCase() === 'off'; await kv.put(env, s); return { text: s.off ? (ar ? '📣 أوقفت منشور X اليومي. /xpost on يعيده.' : '📣 The daily X post is off. /xpost on brings it back.') : (ar ? '📣 منشور X اليومي يعمل: يصلك كل يوم 10:00 بتوقيت الرياض.' : '📣 The daily X post is on: every day at 10:00 Riyadh.') }; }
  const r = await sendDraft(env, now, lang); return r && r.ok ? null : { text: ar ? 'تعذّر تجهيز المنشور الآن — حاول بعد قليل.' : 'Could not prepare the post right now — try again shortly.' };
}
