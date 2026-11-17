// tools/worker/idle.mjs — 💤 idle members and 📖 Firebase reads per member.
//
// A member who hasn't written to the bot or opened the app for IDLE_DAYS is idle: the 5-minute round skips their
// daily messages (morning / evening / radars / pinned — no Firebase reads for them). The alerts they set themselves
// keep working. They get ONE note ("paused while you're away"); any message or opening the app wakes them at once.
// The owner is never idle. After REMOVE_HINT_DAYS the dashboard suggests removing them (never done by itself).
//
// KV: tg:seen:<chat> = last activity (ms) · tg:idlenote:<chat> = the note was sent · tg:reads:<YYYY-MM-DD> = { chat: reads }

export const IDLE_DAYS = 14, REMOVE_HINT_DAYS = 60;
const DAY = 864e5;
const kget = async (env, k) => { try { return env.RATE ? await env.RATE.get(k) : null; } catch (_) { return null; } };
const kput = async (env, k, v, ttl) => { try { if (env.RATE) await env.RATE.put(k, v, ttl ? { expirationTtl: ttl } : undefined); } catch (_) {} };
const kdel = async (env, k) => { try { if (env.RATE) await env.RATE.delete(k); } catch (_) {} };
const isOwnerChat = (env, chat) => String(chat) === String(env.TELEGRAM_CHAT_ID);

// a message to the bot, a tap on its buttons, the app opening (or any app call to the Worker) → active again.
// Writes at most once an hour per member (KV writes are counted).
export async function markSeen(env, chat, now = Date.now()) {
  if (chat == null || isOwnerChat(env, chat)) return false;
  const k = 'tg:seen:' + chat, last = +(await kget(env, k)) || 0;
  const woke = !!(await kget(env, 'tg:idlenote:' + chat));
  if (woke) await kdel(env, 'tg:idlenote:' + chat);
  if (now - last < 3600e3 && !woke) return false;
  await kput(env, k, String(now));
  return woke;   // true: they were idle and are back
}
export async function lastSeen(env, chat, mem) {
  const v = +(await kget(env, 'tg:seen:' + chat)) || 0;
  return Math.max(v, (mem && +mem.joined) || 0) || null;
}
export async function idleState(env, chat, mem, now = Date.now()) {
  if (isOwnerChat(env, chat)) return { idle: false, seen: null, days: 0 };
  const seen = await lastSeen(env, chat, mem);
  const days = seen ? Math.floor((now - seen) / DAY) : 0;
  return { idle: !!seen && days >= IDLE_DAYS, seen, days, removeHint: !!seen && days >= REMOVE_HINT_DAYS };
}

// the one note to a member who just turned idle (in their language) — sent once until they come back
export async function noteIdle(env, chat, mem, send) {
  if (await kget(env, 'tg:idlenote:' + chat)) return false;
  const ar = mem && mem.lang === 'ar';
  const text = ar
    ? '💤 أوقفنا الرسائل اليومية مؤقتاً لأنك لم تستخدم البوت أو التطبيق منذ فترة.\nتنبيهات الأسعار التي ضبطتها ما زالت تعمل.\nأرسل أي رسالة أو افتح التطبيق، وكل شيء يعود فوراً 🙂'
    : '💤 Your daily messages are paused while you\'re away (no bot or app use for a while).\nThe price alerts you set still work.\nSend anything or open the app and everything comes back at once 🙂';
  const r = await send(text).catch(() => null);
  await kput(env, 'tg:idlenote:' + chat, String(Date.now()));
  return !!(r && r.ok);
}

// 📖 Firebase reads per member per day (the round's own reads), kept 3 days
export async function addReads(env, byChat, now = Date.now()) {
  const pos = Object.entries(byChat).filter(([, n]) => n > 0); if (!pos.length) return;
  const k = 'tg:reads:' + new Date(now).toISOString().slice(0, 10);
  let m = {}; try { m = JSON.parse((await kget(env, k)) || '{}') || {}; } catch (_) { m = {}; }
  for (const [c, n] of pos) m[c] = (m[c] || 0) + n;
  await kput(env, k, JSON.stringify(m), 3 * 86400);
}
export async function readsToday(env, now = Date.now()) {
  try { return JSON.parse((await kget(env, 'tg:reads:' + new Date(now).toISOString().slice(0, 10))) || '{}') || {}; } catch (_) { return {}; }
}
