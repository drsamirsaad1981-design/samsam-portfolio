// tools/worker/stars.mjs — ⭐ Premium and 💛 Support, paid with Telegram Stars (Telegram's own in-app coins).
//
// Everything in Cute Portfolio stays free. Premium only adds what costs money to run (the AI): voice notes, more AI
// questions, quick AI Analysis reports. It is a Telegram Stars SUBSCRIPTION (renews every 30 days by itself; the member
// cancels in Telegram → Settings → My Stars and keeps it until the paid month ends). Support is a one-time thank-you of
// any size: a Supporter 💛 badge, nothing else changes. All payments happen inside Telegram (Telegram's rule for digital
// goods); this Worker never sees a card or a wallet — only Telegram's "paid" message. Samir withdraws the Stars himself.
//
// Kept with the member (KV tg:users): premium, premUntil (ms), premSrc ('stars' | 'gift'), subCharge, premRemind,
// supporter, starsPaid. A log of payments (tg:stars:log) feeds /stats.

import { bidiBody } from './bidi.mjs';
import { asChat, chatOf, isOwner, members, member, setMember, langOf, DEF_AI, DEF_REPORTS, PREM_AI, PREM_REPORTS } from './who.mjs';
import { esc, local } from '../alerts-core.mjs';

const DAY = 864e5, MONTH = 30 * DAY;
export const price = env => Math.max(1, Math.min(10000, parseInt(env.PREMIUM_STARS || '350', 10) || 350));   // 350 = the smallest Stars pack Telegram sells
export const SUPPORT = [50, 100, 250, 500];
const usdOf = n => '$' + Math.max(1, Math.round(n * 0.02));   // what the member pays, roughly (≈ 2 cents a Star)

async function tg(env, method, body) {
  body = bidiBody(body);   // Arabic lines read right-to-left (bidi.mjs)
  try { const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return await r.json(); }
  catch (_) { return { ok: false }; }
}
const cb = (text, data) => ({ text, callback_data: data });
const day = ms => local(ms, { day: 'numeric', month: 'short', year: 'numeric' });

// ── is this member premium right now? (a gift without an end date counts until removed) ──
export const premiumNow = (x, now = Date.now()) => !!(x && x.premium && (!x.premUntil || x.premUntil > now));
export async function grant(env, chat, until, src, charge) {
  const x = await member(env, chat); if (!x) return null;
  return setMember(env, chat, { premium: true, premUntil: until || undefined, premSrc: src, subCharge: charge || x.subCharge, premRemind: undefined,
    ai: Math.max(PREM_AI, Number.isFinite(x.ai) ? x.ai : 0), reports: Math.max(PREM_REPORTS, Number.isFinite(x.reports) ? x.reports : 0) });
}
export async function revoke(env, chat) {
  return setMember(env, chat, { premium: undefined, premUntil: undefined, premSrc: undefined, subCharge: undefined, premRemind: undefined, ai: DEF_AI, reports: DEF_REPORTS });
}

// ── the words (short and plain — what it is, what it costs, why) ──
const W = {
  en: {
    pTitle: '⭐ <b>Cute Portfolio Premium</b>',
    pBody: p => `Everything stays <b>free</b> for everyone. Premium adds:\n• 🎙 Voice notes — just talk to the bot\n• 🧠 ${PREM_AI} AI questions a day (instead of ${DEF_AI})\n• 📊 ${PREM_REPORTS} quick AI Analysis reports a day in the app\n\n<b>Price:</b> ${p} ⭐ a month (about ${usdOf(p)}), paid with Telegram Stars.\n• Renews every 30 days by itself — cancel any time in Telegram → Settings → My Stars. You keep it until the paid month ends.\n• Why it costs anything: the AI is paid per question. This only covers that — Cute Portfolio is non-profit.\n\n<i>Telegram Stars are Telegram's own coins: you buy them inside Telegram, like any in-app purchase.</i>`,
    isPrem: u => u ? `✅ <b>You're premium until ${u}.</b>` : '✅ <b>You\'re premium</b> (a gift from Dr. Samir Saad).',
    renews: 'It renews by itself — to stop: Telegram → Settings → My Stars.',
    subscribe: p => `⭐ Subscribe — ${p} ⭐ / month`, extend: p => `⭐ Subscribe — ${p} ⭐ / month (after the gift)`,
    supportInstead: '💛 Support instead', ask: '🎁 Ask Dr. Samir Saad', back: '⬅️ Menu',
    sTitle: '💛 <b>Support Cute Portfolio</b>',
    sBody: '<b>Optional</b> — a one-time thank-you of any size. Nothing changes in the features: everything stays free.\nIt helps pay for the servers and the AI. You get a <b>Supporter 💛</b> badge in the bot and the app.\n\nPick an amount (Telegram Stars):',
    sThanksBadge: n => `You've given ${n} ⭐ so far — thank you!`,
    invTitle: 'Cute Portfolio Premium', invDesc: `Voice notes, ${PREM_AI} AI questions and ${PREM_REPORTS} AI Analysis reports a day. Renews every 30 days; cancel any time.`,
    supTitle: 'Support Cute Portfolio 💛', supDesc: 'A one-time thank-you — helps pay for the servers and the AI. You get a Supporter 💛 badge.',
    paidPrem: u => `⭐ <b>Thank you — you're premium now!</b>\nVoice notes 🎙 are on, with ${PREM_AI} AI questions and ${PREM_REPORTS} AI Analysis reports a day.\nUntil ${u} — it renews by itself (stop any time: Telegram → Settings → My Stars).`,
    renewed: u => `⭐ Premium renewed — until ${u}. Thank you!`,
    paidSup: n => `💛 <b>Thank you!</b> Your ${n} ⭐ help keep Cute Portfolio free. You're a <b>Supporter 💛</b> now.`,
    remind: u => `⭐ Your premium ends on ${u}. If your Stars subscription is on, it renews by itself; if not: /premium.`,
    ended: '⭐ Your premium has ended — back to the standard limits. To renew: /premium',
    ownerPrem: (n, s, u) => `⭐ <b>${n}</b> subscribed to Premium — ${s} ⭐ (until ${u}).`,
    ownerRenew: (n, s, u) => `⭐ <b>${n}</b> renewed Premium — ${s} ⭐ (until ${u}).`,
    ownerSup: (n, s) => `💛 <b>${n}</b> supported the project with ${s} ⭐.`,
    ownerAsk: n => `🎁 <b>${n}</b> asks you for premium as a gift.`, asked: '🎁 Sent to Dr. Samir Saad — you\'ll hear here.',
    ownerP: 'You are premium already ⭐ — this is what members see:',
  },
  ar: {
    pTitle: '⭐ <b>Cute Portfolio المميز</b>',
    pBody: p => `كل شيء يبقى <b>مجانياً</b> للجميع. العضوية المميزة تضيف:\n• 🎙 الرسائل الصوتية — تحدّث مع البوت بصوتك\n• 🧠 ${PREM_AI} سؤال AI يومياً (بدلاً من ${DEF_AI})\n• 📊 ${PREM_REPORTS} تقارير AI Analysis سريعة يومياً في التطبيق\n\n<b>السعر:</b> ${p} ⭐ شهرياً (حوالي ${usdOf(p)})، عبر Telegram Stars.\n• تتجدد تلقائياً كل 30 يوماً — يمكنك إلغاؤها في أي وقت من تليجرام ← الإعدادات ← My Stars، وتبقى فعّالة حتى نهاية الشهر المدفوع.\n• لماذا بمقابل: الذكاء الاصطناعي يُحاسب على كل سؤال، وهذا المبلغ يغطي تلك التكلفة فقط — Cute Portfolio غير ربحي.\n\n<i>Telegram Stars هي عملة تليجرام نفسه: تشتريها من داخل تليجرام مثل أي شراء داخل التطبيق.</i>`,
    isPrem: u => u ? `✅ <b>أنت عضو مميز حتى ${u}.</b>` : '✅ <b>أنت عضو مميز</b> (هدية من Dr. Samir Saad).',
    renews: 'تتجدد تلقائياً — لإيقافها: تليجرام ← الإعدادات ← My Stars.',
    subscribe: p => `⭐ اشترك — ${p} ⭐ شهرياً`, extend: p => `⭐ اشترك — ${p} ⭐ شهرياً (بعد الهدية)`,
    supportInstead: '💛 ادعم بدلاً من ذلك', ask: '🎁 اطلب من Dr. Samir Saad', back: '⬅️ القائمة',
    sTitle: '💛 <b>ادعم Cute Portfolio</b>',
    sBody: '<b>اختياري</b> — شكر لمرة واحدة بأي مبلغ. المزايا لا تتغير: كل شيء يبقى مجانياً.\nيساعد في تكلفة الخوادم والذكاء الاصطناعي، وتحصل على شارة <b>Supporter 💛</b> في البوت والتطبيق.\n\nاختر المبلغ (Telegram Stars):',
    sThanksBadge: n => `قدّمت ${n} ⭐ حتى الآن — شكراً لك!`,
    invTitle: 'Cute Portfolio المميز', invDesc: `رسائل صوتية، و${PREM_AI} سؤال AI و${PREM_REPORTS} تقارير AI Analysis يومياً. تتجدد كل 30 يوماً، ويمكنك إلغاؤها في أي وقت.`,
    supTitle: 'ادعم Cute Portfolio 💛', supDesc: 'شكر لمرة واحدة — يساعد في تكلفة الخوادم والذكاء الاصطناعي. وتحصل على شارة Supporter 💛.',
    paidPrem: u => `⭐ <b>شكراً — أصبحت عضواً مميزاً!</b>\nفُعّلت الرسائل الصوتية 🎙، و${PREM_AI} سؤال AI و${PREM_REPORTS} تقارير AI Analysis يومياً.\nحتى ${u} — وتتجدد تلقائياً (أوقفها في أي وقت: تليجرام ← الإعدادات ← My Stars).`,
    renewed: u => `⭐ تجددت العضوية المميزة — حتى ${u}. شكراً لك!`,
    paidSup: n => `💛 <b>شكراً لك!</b> نجومك الـ ${n} ⭐ تساعد Cute Portfolio على البقاء مجانياً. أصبحت <b>Supporter 💛</b>.`,
    remind: u => `⭐ تنتهي عضويتك المميزة يوم ${u}. إن كان اشتراك Stars فعّالاً فستتجدد تلقائياً؛ وإلا: /premium`,
    ended: '⭐ انتهت العضوية المميزة — عدت إلى الحدود العادية. للتجديد: /premium',
    ownerPrem: (n, s, u) => `⭐ <b>${n}</b> اشترك في العضوية المميزة — ${s} ⭐ (حتى ${u}).`,
    ownerRenew: (n, s, u) => `⭐ <b>${n}</b> جدّد العضوية المميزة — ${s} ⭐ (حتى ${u}).`,
    ownerSup: (n, s) => `💛 <b>${n}</b> دعم المشروع بـ ${s} ⭐.`,
    ownerAsk: n => `🎁 <b>${n}</b> يطلب منك العضوية المميزة هديةً.`, asked: '🎁 أُرسل الطلب إلى Dr. Samir Saad — سيصلك الرد هنا.',
    ownerP: 'أنت عضو مميز بالفعل ⭐ — هذا ما يراه الأعضاء:',
  },
};
export const words = lang => W[lang === 'ar' ? 'ar' : 'en'];

// ── /premium ──
export async function premiumView(env, lang, now = Date.now()) {
  const w = words(lang), p = price(env), own = isOwner(env), x = own ? null : await member(env);
  const on = premiumNow(x, now), lines = [w.pTitle, '', w.pBody(p)];
  if (own) lines.unshift(`<i>${w.ownerP}</i>`, '');
  if (on) lines.push('', w.isPrem(x.premUntil ? day(x.premUntil) : null), ...(x.premSrc === 'stars' ? [w.renews] : []));
  const b = [];
  if (!own && !(on && x.premSrc === 'stars')) {
    const link = await tg(env, 'createInvoiceLink', { title: w.invTitle, description: w.invDesc, payload: `prem:${chatOf(env)}`, currency: 'XTR',
      prices: [{ label: w.invTitle, amount: p }], subscription_period: 30 * 86400 });
    if (link.ok && typeof link.result === 'string') b.push([{ text: on ? w.extend(p) : w.subscribe(p), url: link.result }]);
  }
  b.push([cb(w.supportInstead, 'sp')]);
  if (!own && !on) b.push([cb(w.ask, 'pm:ask')]);   // its own row: the full name fits
  b.push([cb(w.back, 'menu')]);
  return { text: lines.join('\n'), buttons: b };
}
// 💳 a payment link for the app's Support card: Telegram's own invoice for THIS member (they pay in Telegram, as in the bot)
export async function invoiceLink(env, chat, kind, n, lang = 'en') {
  const w = words(lang);
  if (kind === 'prem') return tg(env, 'createInvoiceLink', { title: w.invTitle, description: w.invDesc, payload: `prem:${chat}`, currency: 'XTR', prices: [{ label: w.invTitle, amount: price(env) }], subscription_period: 30 * 86400 });
  if (kind === 'sup' && SUPPORT.includes(+n)) return tg(env, 'createInvoiceLink', { title: w.supTitle, description: w.supDesc, payload: `sup:${chat}:${+n}`, currency: 'XTR', prices: [{ label: w.supTitle, amount: +n }] });
  return { ok: false };
}
// ── /support ──
export async function supportView(env, lang) {
  const w = words(lang), x = isOwner(env) ? null : await member(env);
  return { text: [w.sTitle, '', w.sBody, ...(x && x.starsPaid ? ['', `<i>${w.sThanksBadge(x.starsPaid)}</i>`] : [])].join('\n'),
    buttons: [SUPPORT.slice(0, 2).map(n => cb(`${n} ⭐ (≈${usdOf(n)})`, 'sp:' + n)), SUPPORT.slice(2).map(n => cb(`${n} ⭐ (≈${usdOf(n)})`, 'sp:' + n)), [cb(w.back, 'menu')]] };
}
export async function sendSupportInvoice(env, chat, n, lang) {
  const w = words(lang);
  if (!SUPPORT.includes(n)) return { ok: false };
  return tg(env, 'sendInvoice', { chat_id: chat, title: w.supTitle, description: w.supDesc, payload: `sup:${chat}:${n}`, currency: 'XTR', prices: [{ label: w.supTitle, amount: n }] });
}
// 🎁 ask Samir for a gift
export async function askGift(env, chat, lang) {
  const x = await member(env), w = words(lang);
  await tg(env, 'sendMessage', { chat_id: chat, text: w.asked });
  await asChat(env.TELEGRAM_CHAT_ID, async () => {
    const L = await langOf(env), o = words(L);
    await tg(env, 'sendMessage', { chat_id: env.TELEGRAM_CHAT_ID, text: o.ownerAsk(esc(x ? x.name : chat)), parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[cb(L === 'ar' ? '🎁 ⭐ +30 يوم' : '🎁 ⭐ +30 days', `us:pd:30:${chat}`), cb(L === 'ar' ? '🎁 ⭐ +365 يوم' : '🎁 ⭐ +365 days', `us:pd:365:${chat}`)], [cb(L === 'ar' ? '👤 البطاقة' : '👤 Their card', 'us:m:' + chat)]] } });
  });
}

// ── Telegram asks "may this payment go through?" (within 10 s) — only a member paying for themselves ──
export async function preCheckout(env, q) {
  const m = /^(prem|sup):(-?\d+)(?::(\d+))?$/.exec(String(q.invoice_payload || '')), all = await members(env);
  const okPay = !!m && String(m[2]) === String(q.from && q.from.id) && (all[m[2]] || String(m[2]) === String(env.TELEGRAM_CHAT_ID)) && q.currency === 'XTR'
    && (m[1] === 'prem' ? q.total_amount === price(env) : SUPPORT.includes(q.total_amount));
  await tg(env, 'answerPreCheckoutQuery', { pre_checkout_query_id: q.id, ok: okPay, ...(okPay ? {} : { error_message: 'This payment is not valid any more — open /premium or /support again.' }) });
  return okPay;
}

// ── the payment went through (Telegram's "successful_payment" message, also every monthly renewal) ──
export async function paid(env, chat, sp, lang, now = Date.now()) {
  const w = words(lang), [kind, , n] = String(sp.invoice_payload || '').split(':'), stars = +sp.total_amount || 0, x = await member(env, chat);
  await log(env, { t: now, chat: String(chat), kind, stars, charge: sp.telegram_payment_charge_id, renew: !!(sp.is_recurring && !sp.is_first_recurring) });
  const name = esc((x && x.name) || String(chat)), owner = String(chat) === String(env.TELEGRAM_CHAT_ID);
  const tellOwner = async text => { if (!owner) await tg(env, 'sendMessage', { chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }); };
  const O = words(await asChat(env.TELEGRAM_CHAT_ID, () => langOf(env)));
  if (kind === 'prem') {
    const until = sp.subscription_expiration_date ? sp.subscription_expiration_date * 1000 : now + MONTH;
    if (!owner) { await grant(env, chat, until, 'stars', sp.telegram_payment_charge_id); await setMember(env, chat, { supporter: true, starsPaid: ((x && x.starsPaid) || 0) + stars }); }   // a premium member is a supporter too
    const renew = !!(sp.is_recurring && !sp.is_first_recurring);
    await tg(env, 'sendMessage', { chat_id: chat, text: renew ? w.renewed(day(until)) : w.paidPrem(day(until)), parse_mode: 'HTML' });
    await tellOwner(renew ? O.ownerRenew(name, stars, day(until)) : O.ownerPrem(name, stars, day(until)));
    return { kind, until };
  }
  if (kind === 'sup') {
    if (!owner) await setMember(env, chat, { supporter: true, starsPaid: ((x && x.starsPaid) || 0) + stars });
    await tg(env, 'sendMessage', { chat_id: chat, text: w.paidSup(stars), parse_mode: 'HTML' });
    await tellOwner(O.ownerSup(name, stars));
    return { kind, stars, n };
  }
  return { kind: 'unknown' };
}

// ── the log of payments (for /stats) ──
async function log(env, e) {
  if (!env.RATE) return;
  let a = []; try { a = JSON.parse((await env.RATE.get('tg:stars:log')) || '[]'); } catch (_) {}
  if (e.charge && a.some(x => x.charge === e.charge)) return;   // Telegram sent it twice
  a.push(e); try { await env.RATE.put('tg:stars:log', JSON.stringify(a.slice(-1000))); } catch (_) {}
}
export async function statsView(env, lang, now = Date.now()) {
  const ar = lang === 'ar', m = await members(env), list = Object.values(m);
  let a = []; try { a = JSON.parse((env.RATE && await env.RATE.get('tg:stars:log')) || '[]'); } catch (_) {}
  const month = new Date(now).toISOString().slice(0, 7), sum = f => a.filter(f).reduce((s, x) => s + (+x.stars || 0), 0);
  const prem = list.filter(x => premiumNow(x, now)), paidP = prem.filter(x => x.premSrc === 'stars').length;
  const L = [ar ? '📈 <b>الإحصائيات</b>' : '📈 <b>Stats</b>', '',
    `👥 ${ar ? 'الأعضاء' : 'Members'}: <b>${list.length}</b>${list.some(x => x.paused) ? ` · ⏸ ${list.filter(x => x.paused).length}` : ''}`,
    `⭐ ${ar ? 'المميزون الآن' : 'Premium now'}: <b>${prem.length}</b> (${ar ? 'Stars' : 'Stars'} ${paidP} · ${ar ? 'هدية' : 'gift'} ${prem.length - paidP})`,
    `💛 ${ar ? 'الداعمون' : 'Supporters'}: <b>${list.filter(x => x.supporter).length}</b>`, '',
    `⭐ ${ar ? 'هذا الشهر' : 'This month'}: <b>${sum(x => new Date(x.t).toISOString().slice(0, 7) === month)}</b> ⭐ (${ar ? 'مميز' : 'premium'} ${sum(x => x.kind === 'prem' && new Date(x.t).toISOString().slice(0, 7) === month)} · ${ar ? 'دعم' : 'support'} ${sum(x => x.kind === 'sup' && new Date(x.t).toISOString().slice(0, 7) === month)})`,
    `⭐ ${ar ? 'منذ البداية' : 'All time'}: <b>${sum(() => true)}</b> ⭐ (≈ ${usdOf(sum(() => true))} ${ar ? 'دفعها الأعضاء' : 'paid by members'})`, '',
    `<i>${ar ? 'السحب: من رصيد البوت عبر Fragment (بنفسك).' : 'Withdraw: from the bot\'s balance via Fragment (yourself).'}</i>`];
  return { text: L.join('\n'), buttons: [[cb(ar ? '👥 الأعضاء' : '👥 Members', 'us'), cb(ar ? '⬅️ القائمة' : '⬅️ Menu', 'menu')]] };
}

// ── each 5-minute round: a reminder 3 days before the end, and the end itself ──
export async function expireRound(env, now = Date.now()) {
  const m = await members(env); let ended = 0;
  for (const [chat, x] of Object.entries(m)) {
    if (!x.premium || !x.premUntil) continue;
    const L = x.lang === 'ar' ? 'ar' : 'en', w = words(L);
    if (x.premUntil <= now) { await revoke(env, chat); await tg(env, 'sendMessage', { chat_id: chat, text: w.ended }); ended++; continue; }
    if (x.premUntil - now < 3 * DAY && !x.premRemind && x.premSrc !== 'stars') {   // a Stars subscription renews by itself: no nagging
      await setMember(env, chat, { premRemind: true });
      await tg(env, 'sendMessage', { chat_id: chat, text: w.remind(day(x.premUntil)) });
    }
  }
  return { ended };
}
// 🎁 the owner adds days (a gift): from the later of now / the current end
export async function addDays(env, chat, days, now = Date.now()) {
  const x = await member(env, chat); if (!x) return null;
  const from = premiumNow(x, now) && x.premUntil ? x.premUntil : now;
  return grant(env, chat, from + days * DAY, x.premSrc === 'stars' && premiumNow(x, now) ? 'stars' : 'gift', x.subCharge);
}
