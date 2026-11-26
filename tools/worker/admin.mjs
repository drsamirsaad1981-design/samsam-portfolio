// tools/worker/admin.mjs — 🛠 the owner's dashboard in the app (Settings → Admin dashboard), the same powers as the bot's
// /users, /invite and /stats: the numbers, every member (search, limits, ⭐ gift / end, ⏸ pause, 🗑 remove), app requests
// waiting for a ✅, new invite codes, and the Stars log. Only the owner's account (checked here, server-side) can call it.

import { bidiBody } from './bidi.mjs';
import { asChat, members, member, setMember, removeMember, newInvite, accessEmails, getPending, clearPending, maxMembers, setMaxMembers, MAX_CHOICES, isTgChat, DEF_AI, DEF_REPORTS, removedList, undoRemove } from './who.mjs';
import { premiumNow, addDays, revoke, price } from './stars.mjs';
import { keyInfo } from './byok.mjs';
import { idleState, readsToday, IDLE_DAYS, REMOVE_HINT_DAYS } from './idle.mjs';
import { isOwnerAccount, syncAccess } from './data.mjs';
import { readsTotal, features } from './usage.mjs';
import { localParts, local, APP } from '../alerts-core.mjs';

async function tg(env, method, body) {
  body = bidiBody(body);   // Arabic lines read right-to-left (bidi.mjs)
  try { const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return await r.json(); }
  catch (_) { return { ok: false }; }
}
const kv = async (env, k) => { try { return env.RATE ? await env.RATE.get(k) : null; } catch (_) { return null; } };
const tell = (env, chat, en, ar, lang) => !isTgChat(chat) ? null : tg(env, 'sendMessage', { chat_id: chat, text: lang === 'ar' ? ar : en, parse_mode: 'HTML' }).catch(() => {});
const day = ms => local(ms, { day: 'numeric', month: 'short', year: 'numeric' });

async function botLink(env, code) {
  let bot = await kv(env, 'tg:botname');
  if (!bot) { const me = await tg(env, 'getMe', {}); bot = me && me.ok && me.result && me.result.username; if (bot) try { await env.RATE.put('tg:botname', bot); } catch (_) {} }
  return bot ? `https://t.me/${bot}?start=${code}` : null;
}

async function overview(env, now = Date.now()) {
  const m = await members(env), rDay = localParts(now).date, uDay = new Date(now).toISOString().slice(0, 10), reads = await readsToday(env, now);
  const list = await Promise.all(Object.entries(m).map(async ([chat, x]) => {
    const st = await idleState(env, chat, x, now);
    const q = +(await kv(env, `tg:${chat}:ai:${rDay}`)) || 0, r = x.uid ? +(await kv(env, `ai:${x.uid}:${uDay}`)) || 0 : 0;
    const k = await asChat(chat, () => keyInfo(env)), pend = await getPending(env, chat);
    return { chat, appOnly: !isTgChat(chat), name: x.name, user: x.user || '', joined: x.joined, email: x.email || '', pending: pend || '', linked: !!x.uid, paused: !!x.paused,
      premium: premiumNow(x, now), premUntil: x.premUntil || null, premSrc: x.premSrc || null, supporter: !!x.supporter, starsPaid: x.starsPaid || 0,
      ai: Number.isFinite(x.ai) ? x.ai : DEF_AI, reports: Number.isFinite(x.reports) ? x.reports : DEF_REPORTS, usedQ: q, usedR: r, ownKey: k.has ? k.tail : null, lang: x.lang || '',
      seen: st.seen, idle: st.idle, idleDays: st.days, removeHint: !!st.removeHint, reads: reads[chat] || 0 };
  }));
  let log = []; try { log = JSON.parse((await kv(env, 'tg:stars:log')) || '[]'); } catch (_) {}
  const month = new Date(now).toISOString().slice(0, 7), sum = f => log.filter(f).reduce((s, x) => s + (+x.stars || 0), 0);
  const names = Object.fromEntries(Object.entries(m).map(([c, x]) => [c, x.name]));
  return {
    max: await maxMembers(env), maxChoices: MAX_CHOICES, price: price(env),
    idleDays: IDLE_DAYS, removeHintDays: REMOVE_HINT_DAYS, readsOwner: reads[String(env.TELEGRAM_CHAT_ID)] || 0,
    fsReads: await readsTotal(env, now),   // 📖 all of today's Firebase reads (round + bot + app) against the free allowance
    use: await features(env, now),          // 📊 which commands / buttons / screens were used (today · 7 days)
    stats: { members: list.length, paused: list.filter(x => x.paused).length, idle: list.filter(x => x.idle).length, readsToday: Object.values(reads).reduce((a, b) => a + b, 0), premium: list.filter(x => x.premium).length, premiumStars: list.filter(x => x.premium && x.premSrc === 'stars').length,
      supporters: list.filter(x => x.supporter).length, starsMonth: sum(x => new Date(x.t).toISOString().slice(0, 7) === month), starsAll: sum(() => true),
      starsMonthPremium: sum(x => x.kind === 'prem' && new Date(x.t).toISOString().slice(0, 7) === month), starsMonthSupport: sum(x => x.kind === 'sup' && new Date(x.t).toISOString().slice(0, 7) === month) },
    members: list.sort((a, b) => (b.joined || 0) - (a.joined || 0)),
    removed: (await removedList(env)).map(x => ({ chat: x.chat, name: x.name, email: x.email || '', removedAt: x.removedAt, premium: !!x.premium, supporter: !!x.supporter })),
    payments: log.slice(-50).reverse().map(x => ({ t: x.t, chat: x.chat, name: names[x.chat] || x.chat, kind: x.kind, stars: x.stars, renew: !!x.renew })),
  };
}

// one action on a member — the member is told, like from the bot
async function act(env, chat, op) {
  const x = await member(env, chat); if (!x) return { status: 404, error: 'No such member.' };
  const L = x.lang === 'ar' ? 'ar' : 'en';
  if (op === 'gift30' || op === 'gift365') {
    const y = await addDays(env, chat, op === 'gift30' ? 30 : 365), u = day(y.premUntil);
    await tell(env, chat, `🎁 Dr. Samir Saad gave you premium as a gift — until ${u}!`, `🎁 د. سمير سعد منحك العضوية المميزة هديةً حتى ${u}!`, L);
  } else if (op === 'endPrem') {
    await revoke(env, chat); await tell(env, chat, 'Premium is off — back to the standard limits.', 'أُلغيت العضوية المميزة — عدت إلى الحدود العادية.', L);
  } else if (op === 'pause' || op === 'resume') {
    await setMember(env, chat, { paused: op === 'pause' ? true : undefined });
    await tell(env, chat, op === 'pause' ? '⏸ The bot is paused for you for now.' : '▶️ The bot is back on for you.', op === 'pause' ? '⏸ تم إيقاف البوت لديك مؤقتاً.' : '▶️ عاد البوت للعمل لديك.', L);
  } else if (/^(ai|rp)[+-]$/.test(op)) {
    const f = op.startsWith('ai') ? 'ai' : 'reports', cur = Number.isFinite(x[f]) ? x[f] : (f === 'ai' ? DEF_AI : DEF_REPORTS), max = f === 'ai' ? 50 : 10;
    await setMember(env, chat, { [f]: Math.max(0, Math.min(max, cur + (op.endsWith('+') ? 1 : -1))) });
  } else if (op === 'approve' || op === 'refuse') {   // 📱 an /app request waiting
    const email = await getPending(env, chat); if (!email) return { status: 404, error: 'No request waiting.' };
    await clearPending(env, chat);
    if (op === 'approve') { await setMember(env, chat, { email }); await syncAccess(env, await accessEmails(env)).catch(() => {}); await tell(env, chat, `✅ You can open the app now with <b>${email}</b>.`, `✅ يمكنك الآن فتح التطبيق بـ <b>${email}</b>.`, L); }
    else await tell(env, chat, 'Your app request was not approved.', 'لم تتم الموافقة على طلب التطبيق.', L);
  } else if (op === 'remove') {
    const had = await removeMember(env, chat);
    if (had && had.email) await syncAccess(env, await accessEmails(env)).catch(() => {});
    await tell(env, chat, 'Your access to this bot was removed.', 'تم إيقاف وصولك للبوت.', L);
  } else return { status: 400, error: 'Unknown action.' };
  return { ok: true };
}

export async function adminHandler(env, who, body) {
  if (!(await isOwnerAccount(env, who))) return { status: 403, error: 'Only the owner can open the dashboard.' };
  const a = body && body.action;
  if (a === 'overview') return overview(env);
  if (a === 'invite') { const code = await newInvite(env, String((body && body.note) || '').slice(0, 40)); return { code, link: await botLink(env, code), appLink: APP.replace(/\/?$/, '/') + '?invite=' + code, days: 7 }; }
  if (a === 'setMax') { if (!(await setMaxMembers(env, body && body.max))) return { status: 400, error: 'Pick 20, 50 or 100.' }; return overview(env); }
  if (a === 'restore') {
    const r = await undoRemove(env, String(body.chat || ''));
    if (!r) return { status: 404, error: 'Nothing to restore.' }; if (r.error) return { status: 409, error: 'Full — raise the maximum first.' };
    if (r.email) await syncAccess(env, await accessEmails(env)).catch(() => {});
    await tell(env, String(body.chat), '↩️ Your access is back — welcome back!', '↩️ أُعيد وصولك — أهلاً بك من جديد!', r.lang);
    return { ok: true, overview: await overview(env) };
  }
  if (a === 'member') { const r = await act(env, String(body.chat || ''), String(body.op || '')); return r.ok ? { ...r, overview: await overview(env) } : r; }
  return { status: 400, error: 'Unknown action.' };
}
