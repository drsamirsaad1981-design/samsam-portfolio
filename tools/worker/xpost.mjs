// tools/worker/xpost.mjs — 📣 the owner's daily post for X, ready to send (Samir only).
//
// Once a day (10:00 Riyadh) the bot sends Samir ONE message: today's post — Arabic and English together in one post — with
// a button that opens X with the text already written — he reads it, taps Post, done. The bot never posts on X itself (no X
// keys here): every post goes out by his own tap. The text is numbers from the same market data as the channel's pulse
// (never a signal, never advice), and each day takes a different angle so the account does not repeat itself:
//   0 the market pulse · 1 Bitcoin, gold and silver · 2 ETF flows and the market cap · 3 one thing the app does.
// /xpost → today's post now · /xpost off · /xpost on. KV tg:xpost = { off, day }.
import { loadMarket } from './data.mjs';
import { localParts, usd, pct, flow, etfDay, FNG_AR } from '../alerts-core.mjs';

const KEY = 'tg:xpost', PAGE = 'https://drsamirsaad1981-design.github.io/samsam-portfolio/welcome';   // (no closing slash: beside Arabic text it jumps to the wrong end of the line)
// one post, both languages: the Arabic lines, then the English lines (never one line with both), then one link
const FEATURES = [
  { ar: 'هل قراراتك في العملات أفضل من وضع المبلغ نفسه في البيتكوين أو الذهب؟ الجواب بالأرقام من صفقاتك.', en: 'Are your crypto decisions better than the same money in Bitcoin or gold? The answer, in numbers, from your own trades.' },
  { ar: 'خطة خروج تضعها وأنت هادئ: جني أرباح عند مضاعفات متوسط شرائك، وتنبيه عند الهدف.', en: 'An exit plan set while you are calm: take profit at multiples of your average buy price, with an alert at each target.' },
  { ar: 'ذهبك وفضتك بالغرام في المحفظة نفسها مع عملاتك، وزكاتها محسوبة بنصابها.', en: 'Your gold and silver, in grams, in the same portfolio as your coins, with zakat by its own threshold.' },
  { ar: 'سجّل صفقتك بالكلام في تيليجرام، فتظهر في محفظتك بعد تأكيدك.', en: 'Record a trade in plain words on Telegram; it is in your portfolio once you confirm.' },
  { ar: 'إشارات انضباط من قواعدك أنت: احتفاظ، تعزيز، أو تحويل. تذكير بخطتك، وليست توصيات.', en: 'Discipline signals from your own rules: Hold, Reinforce or Convert. A reminder of your plan, not tips.' },
];
const kv = { get: async env => { try { return JSON.parse((env.RATE && await env.RATE.get(KEY)) || '{}') || {}; } catch (_) { return {}; } }, put: async (env, v) => { try { if (env.RATE) await env.RATE.put(KEY, JSON.stringify(v)); } catch (_) {} } };
const tg = async (env, method, body) => { try { const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return await r.json(); } catch (_) { return { ok: false }; } };
const ch = v => v == null || !isFinite(v) ? '' : ` (${pct(v, 1)})`;
const dotJoin = a => a.filter(Boolean).join(' · ');
// X's own count: a link is 23, an emoji 2, every other character here 1 — a post holds 280
export const xLen = t => [...String(t).replace(/https?:\/\/\S+/g, 'x'.repeat(23))].reduce((n, c) => n + (c.codePointAt(0) > 0x2000 && !(c.codePointAt(0) >= 0x2010 && c.codePointAt(0) <= 0x201F) ? 2 : 1), 0);

// today's post (plain text, within 280 by X's count): { angle, text }
export function xDraft(m, now) {
  const dayN = Math.floor((now + 3 * 3600e3) / 86400e3), angle = dayN % 4;
  const g = (m && m.global) || {}, d = g.dom || {}, btc = (m && m.btc) || {}, met = (m && m.metals) || [], f = k => met.find(x => x.k === k), e = m && etfDay(m.etf);
  let ar = null, en = null;
  if (angle === 0 && btc.price > 0) {
    ar = ['نبض السوق اليوم 📊', `البيتكوين ${usd(btc.price)}${ch(btc.ch24)}`, dotJoin([m.fng ? `الخوف والطمع ${m.fng.value}` : null, m.alt && m.alt.value != null ? `موسم البدائل ${m.alt.value}` : null, d.btc != null ? `الهيمنة ${d.btc.toFixed(1)}%` : null])];
    en = ['Market pulse today', `Bitcoin ${usd(btc.price)}${ch(btc.ch24)}`, dotJoin([m.fng ? `Fear & Greed ${m.fng.value}` : null, m.alt && m.alt.value != null ? `Altseason ${m.alt.value}` : null, d.btc != null ? `Dominance ${d.btc.toFixed(1)}%` : null])];
  } else if (angle === 1 && btc.price > 0 && f('gold') && f('gold').price > 0) {
    const go = f('gold'), si = f('silver');
    ar = ['البيتكوين والذهب والفضة 🥇', dotJoin([`البيتكوين ${usd(btc.price)}`, `الذهب ${usd(go.price)}`, si && si.price > 0 ? `الفضة ${usd(si.price)}` : null]), 'وكيف أداء محفظتك أمامها؟'];
    en = ['Bitcoin, gold and silver', dotJoin([`Bitcoin ${usd(btc.price)}`, `Gold ${usd(go.price)}`, si && si.price > 0 ? `Silver ${usd(si.price)}` : null]), 'And your portfolio against them?'];
  } else if (angle === 2 && e && g.mcap) {
    ar = ['أين تتحرك السيولة؟ 🏦', `صناديق ETF: البيتكوين ${flow(e.btc)} · الإيثيريوم ${flow(e.eth)}`, `القيمة السوقية $${(g.mcap / 1e12).toFixed(2)}T${ch(g.mcapCh24)}`];
    en = ['Where is the money moving?', `ETFs: BTC ${flow(e.btc)} · ETH ${flow(e.eth)}`, `Market cap $${(g.mcap / 1e12).toFixed(2)}T${ch(g.mcapCh24)}`];
  }
  if (!ar) { const x = FEATURES[Math.floor(dayN / 4) % FEATURES.length]; return { angle: 3, text: [x.ar, '', x.en, '', PAGE].join('\n') }; }
  // within 280 whatever the numbers: the full post, else without each language's last line, else without the notes too
  const build = (n, note) => [...ar.filter(Boolean).slice(0, n), ...(note ? ['للمعلومة فقط، ليست توصية.'] : []), '', ...en.filter(Boolean).slice(0, n), ...(note ? ['For information only, not advice.'] : []), '', PAGE].join('\n');
  const text = [build(3, true), build(2, true), build(2, false)].find(t => xLen(t) <= 280) || build(1, false);
  return { angle, text };
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const intent = t => 'https://x.com/intent/post?text=' + encodeURIComponent(t);
export function xMessage(dr, lang) {
  const ar = lang === 'ar';
  return { text: [ar ? '📣 <b>منشور X لليوم</b> (عربي وإنجليزي معاً) — اضغط الزر، راجع النص، ثم Post' : '📣 <b>Today\'s post for X</b> (Arabic and English together) — tap the button, read it, then Post', '', esc(dr.text), '', ar ? '<i>لا يُنشر شيء إلا بضغطتك. /xpost off لإيقاف هذه الرسالة.</i>' : '<i>Nothing is posted without your tap. /xpost off stops this message.</i>'].join('\n'),
    buttons: [[{ text: ar ? '📣 انشر على X' : '📣 Post on X', url: intent(dr.text) }]] };
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
