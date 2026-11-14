// tools/worker/who.mjs — phase 10, step 1: every person has their own space.
//
// Each Telegram message, Mini App call and cron round runs "as" one chat (asChat). Everything the bot keeps for a person
// lives under that chat's own keys: K(env, 'alerts') → "tg:<chat>:alerts" — alerts, the chat memory, the language, the daily
// switches, the pinned message, the radars, the paper portfolio, the AI counter. Nothing of one chat can be read by another.
// The owner (TELEGRAM_CHAT_ID) had everything under the old shared keys ("tg:alerts" …): migrateOwner copies them once.

import { AsyncLocalStorage } from 'node:async_hooks';
import { localParts } from '../alerts-core.mjs';

const als = new AsyncLocalStorage();
export const asChat = (chat, fn) => als.run({ chat: String(chat) }, fn);
export const chatOf = env => { const s = als.getStore(); return s ? s.chat : String(env.TELEGRAM_CHAT_ID); };
export const isOwner = env => chatOf(env) === String(env.TELEGRAM_CHAT_ID);
export const K = (env, name) => `tg:${chatOf(env)}:${name}`;

// ── who may use the bot: the owner + the people they invited (step 2). KV tg:users = { chat: { name, user, joined } } ──
const memKV = new Map();
const kget = async (env, k) => { if (env.RATE) { try { return await env.RATE.get(k); } catch (_) {} } return memKV.has(k) ? memKV.get(k) : null; };   // KV is the truth when there is one
const kput = async (env, k, v, ttl) => { memKV.set(k, v); try { if (env.RATE) await env.RATE.put(k, v, ttl ? { expirationTtl: ttl } : undefined); } catch (_) {} };
const kdel = async (env, k) => { memKV.delete(k); try { if (env.RATE) await env.RATE.delete(k); } catch (_) {} };
export const MAX_MEMBERS = 20;   // the default; the owner can choose 20 / 50 / 100 in the app's dashboard (KV tg:max)
export const MAX_CHOICES = [20, 50, 100];
export async function maxMembers(env) { const v = +(await kget(env, 'tg:max')); return MAX_CHOICES.includes(v) ? v : MAX_MEMBERS; }
export async function setMaxMembers(env, n) { if (!MAX_CHOICES.includes(+n)) return false; await kput(env, 'tg:max', String(+n)); return true; }
// a member who joined from the app (an invite link opened there) has no Telegram chat yet: kept under "a:<their uid>" until
// they link the bot (then their record moves to their chat). Only real chats get messages / the 5-minute round.
export const isTgChat = c => /^-?\d+$/.test(String(c));
export async function members(env) { try { const m = JSON.parse((await kget(env, 'tg:users')) || '{}'); return m && typeof m === 'object' ? m : {}; } catch (_) { return {}; } }
export async function chats(env) { return env.TELEGRAM_CHAT_ID ? [String(env.TELEGRAM_CHAT_ID), ...Object.keys(await members(env)).filter(c => c !== String(env.TELEGRAM_CHAT_ID) && isTgChat(c))] : []; }
export async function allowed(env, chat) { return (await chats(env)).includes(String(chat)); }

// /invite → a one-time code (8 letters, no look-alikes), good for 7 days
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export async function newInvite(env, note = '') {
  const b = crypto.getRandomValues(new Uint8Array(8)), code = [...b].map(x => ABC[x % ABC.length]).join('');
  await kput(env, 'tg:inv:' + code, JSON.stringify({ created: Date.now(), note: String(note).slice(0, 40) }), 7 * 86400);
  return code;
}
// a stranger sends a code → joins (once; the code is gone). → { ok, member } | { error: 'bad' | 'full' }
export async function useInvite(env, code, chat, from) {
  const C = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (C.length !== 8) return { error: 'bad' };
  const raw = await kget(env, 'tg:inv:' + C);
  if (!raw) return { error: 'bad' };
  const m = await members(env);
  if (Object.keys(m).length >= await maxMembers(env)) return { error: 'full' };
  await kdel(env, 'tg:inv:' + C);   // first: a code works once
  const name = [from && from.first_name, from && from.last_name].filter(Boolean).join(' ').slice(0, 40) || 'Friend';
  m[String(chat)] = { name, user: from && from.username ? String(from.username).slice(0, 32) : '', joined: Date.now(), note: (() => { try { return JSON.parse(raw).note || ''; } catch (_) { return ''; } })() };
  await kput(env, 'tg:users', JSON.stringify(m));
  const back = await restoreRecord(env, chat);   // removed before? their premium / supporter / e-mail come back
  return { ok: true, member: (await members(env))[String(chat)], restored: back };
}
// 📱 an invite code opened in the APP: that signed-in account (a checked e-mail) becomes a member at once — the invite is
// Samir's yes, so no second approval. → { ok, member, already } | { error: 'bad' | 'full' }
export async function useAppInvite(env, code, uid, email) {
  const C = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), e = String(email || '').toLowerCase();
  if (!uid || !e) return { error: 'bad' };
  const m = await members(env), had = Object.entries(m).find(([, x]) => x.email === e || x.uid === uid);
  if (had) return { ok: true, already: true, member: had[1] };   // already in (from the bot or an earlier link)
  if (C.length !== 8) return { error: 'bad' };
  const raw = await kget(env, 'tg:inv:' + C);
  if (!raw) return { error: 'bad' };
  if (Object.keys(m).length >= await maxMembers(env)) return { error: 'full' };
  await kdel(env, 'tg:inv:' + C);
  m['a:' + uid] = { name: e.split('@')[0].slice(0, 40), user: '', joined: Date.now(), email: e, uid, appOnly: true, note: (() => { try { return JSON.parse(raw).note || ''; } catch (_) { return ''; } })() };
  await kput(env, 'tg:users', JSON.stringify(m));
  return { ok: true, member: m['a:' + uid] };
}
// …and later, from Telegram: the app's "Link the Telegram bot" code from that account → their record moves to their chat
export async function moveAppMember(env, uid, chat, from) {
  const m = await members(env), key = 'a:' + uid, x = m[key];
  if (!x || m[String(chat)]) return null;
  const name = [from && from.first_name, from && from.last_name].filter(Boolean).join(' ').slice(0, 40) || x.name;
  m[String(chat)] = { ...x, name, user: from && from.username ? String(from.username).slice(0, 32) : '', appOnly: undefined };
  delete m[String(chat)].appOnly; delete m[key];
  await kput(env, 'tg:users', JSON.stringify(m));
  const k = await kget(env, `tg:${key}:byok`); if (k) { await kput(env, `tg:${chat}:byok`, k); await kdel(env, `tg:${key}:byok`); }   // their own Claude key comes along
  await restoreRecord(env, chat);
  return (await members(env))[String(chat)];
}
export async function removeMember(env, chat) {
  const m = await members(env);
  if (!m[String(chat)]) return false;
  const had = m[String(chat)];
  delete m[String(chat)]; await kput(env, 'tg:users', JSON.stringify(m)); await kdel(env, `tg:${chat}:byok`);   // their Claude key goes too
  await kput(env, 'tg:removed:' + chat, JSON.stringify({ ...had, removedAt: Date.now() }), 60 * 86400);   // kept 60 days: ↩️ restore, or comes back by itself if they rejoin
  return had;   // the record (its e-mail leaves the app's access list — the caller syncs it)
}
// someone removed (by mistake?) comes back — their old record (premium, supporter, limits, e-mail, linked portfolio) returns;
// with no record kept, their Stars payments (tg:stars:log) still say who supported and who paid for premium this month
export async function restoreRecord(env, chat) {
  const m = await members(env), c = String(chat); if (!m[c]) return null;
  let old = null; try { old = JSON.parse((await kget(env, 'tg:removed:' + c)) || 'null'); } catch (_) {}
  const back = {};
  if (old) { for (const k of ['email', 'uid', 'ai', 'reports', 'premium', 'premUntil', 'premSrc', 'subCharge', 'supporter', 'starsPaid', 'lang', 'note']) if (old[k] !== undefined && m[c][k] === undefined) back[k] = old[k]; await kdel(env, 'tg:removed:' + c); }
  else {
    let log = []; try { log = JSON.parse((await kget(env, 'tg:stars:log')) || '[]'); } catch (_) {}
    const mine = log.filter(x => x.chat === c);
    if (mine.length) {
      back.supporter = true; back.starsPaid = mine.reduce((s, x) => s + (+x.stars || 0), 0);
      const p = mine.filter(x => x.kind === 'prem').sort((a, b) => b.t - a.t)[0];
      if (p && p.t + 30 * 864e5 > Date.now()) Object.assign(back, { premium: true, premUntil: p.t + 30 * 864e5, premSrc: 'stars', ai: Math.max(PREM_AI_, m[c].ai || 0), reports: Math.max(PREM_REPORTS_, m[c].reports || 0) });
    }
  }
  if (!Object.keys(back).length) return null;
  m[c] = { ...m[c], ...back }; await kput(env, 'tg:users', JSON.stringify(m));
  return back;
}
export async function removedList(env) {
  const out = [];
  if (env.RATE && env.RATE.list) { try { const r = await env.RATE.list({ prefix: 'tg:removed:' }); for (const k of r.keys) { try { out.push({ chat: k.name.slice(11), ...JSON.parse(await env.RATE.get(k.name)) }); } catch (_) {} } } catch (_) {} }
  return out.sort((a, b) => (b.removedAt || 0) - (a.removedAt || 0));
}
export async function undoRemove(env, chat) {   // ↩️ from the dashboard: back exactly as they were
  const c = String(chat); let old = null; try { old = JSON.parse((await kget(env, 'tg:removed:' + c)) || 'null'); } catch (_) {}
  if (!old) return null;
  const m = await members(env); if (Object.keys(m).length >= await maxMembers(env)) return { error: 'full' };
  const { removedAt, ...rec } = old; m[c] = rec; await kput(env, 'tg:users', JSON.stringify(m)); await kdel(env, 'tg:removed:' + c);
  return rec;
}
// ⏸ a member the owner paused: still a member (their app and portfolio stay theirs) — the bot answers nothing, sends nothing
export async function activeChats(env) { const m = await members(env); return (await chats(env)).filter(c => !(m[c] && m[c].paused)); }
// 🌊 too many messages: a member may send 20 a minute (the owner: no limit). The 21st gets one "wait a minute", the rest nothing.
export const FLOOD_PER_MIN = 20;
export async function flood(env, chat) {
  if (String(chat) === String(env.TELEGRAM_CHAT_ID)) return 'ok';
  const k = `tg:rl:${chat}:${Math.floor(Date.now() / 60e3)}`, n = (+(await kget(env, k)) || 0) + 1;
  await kput(env, k, String(n), 120);
  return n <= FLOOD_PER_MIN ? 'ok' : n === FLOOD_PER_MIN + 1 ? 'warn' : 'drop';
}
// /forget: everything the bot keeps for this chat (alerts, chat memory, language, daily switches, pinned message, radars,
// paper portfolio…) — not today's AI counter (a fresh start must not mean fresh questions)
export async function forgetChat(env, chat) {
  const pre = `tg:${chat}:`; let names = [];
  if (env.RATE && env.RATE.list) { let cursor; do { const r = await env.RATE.list({ prefix: pre, cursor }); names.push(...r.keys.map(x => x.name)); cursor = r.list_complete ? null : r.cursor; } while (cursor); }
  for (const k of memKV.keys()) if (k.startsWith(pre)) names.push(k);
  names = [...new Set(names)].filter(n => !/:ai:\d{4}-\d\d-\d\d$/.test(n));
  for (const n of names) await kdel(env, n);
  await kdel(env, 'tg:appreq:' + chat);
  return names.length;
}
// a stranger gets one polite answer a day, no more (so the bot can't be used to spam)
export async function strangerOnce(env, chat) {
  const k = 'tg:nope:' + chat;
  if (await kget(env, k)) return false;
  await kput(env, k, '1', 86400); return true;
}

// the old shared keys → the owner's own keys (once; the old ones are left as they were)
const LEGACY = ['alerts', 'hist', 'lang', 'mk', 'daily', 'daily:sent', 'pin', 'radar:i', 'radar:seen', 'sector:seen', 'paper'];
let migrated = false;
export async function migrateOwner(env) {
  if (migrated || !env.RATE || !env.TELEGRAM_CHAT_ID) return;
  try {
    if (await env.RATE.get('tg:migrated')) { migrated = true; return; }
    const o = String(env.TELEGRAM_CHAT_ID), day = localParts(Date.now()).date;
    for (const n of [...LEGACY, 'ai:' + day, 'snap:' + day, 'log:' + day]) {
      const v = await env.RATE.get('tg:' + n);
      if (v != null && (await env.RATE.get(`tg:${o}:${n}`)) == null) await env.RATE.put(`tg:${o}:${n}`, v, /^(ai|snap|log):/.test(n) ? { expirationTtl: 3 * 86400 } : undefined);
    }
    await env.RATE.put('tg:migrated', String(Date.now()));
    migrated = true;
  } catch (_) {}
}

// ── a member's details (step 3–4): { email (allowed into the app), uid (their linked portfolio), ai, reports (per-day limits) } ──
export async function member(env, chat = null) { const m = await members(env); return m[String(chat || chatOf(env))] || null; }
export async function setMember(env, chat, patch) {
  const m = await members(env), c = String(chat);
  if (!m[c]) return null;
  m[c] = { ...m[c], ...patch };
  for (const k of Object.keys(m[c])) if (m[c][k] === undefined) delete m[c][k];
  await kput(env, 'tg:users', JSON.stringify(m));
  return m[c];
}
export async function memberByEmail(env, email) {
  const e = String(email || '').toLowerCase(), m = await members(env);
  const hit = Object.entries(m).find(([, x]) => x.email && x.email === e);
  return hit ? { chat: hit[0], ...hit[1] } : null;
}
// the e-mails allowed into the app = the members' approved e-mails (the owner's is in the rules themselves)
export async function accessEmails(env) { return Object.values(await members(env)).map(x => x.email).filter(Boolean).sort(); }
// limits: the owner's from the Worker settings; a member's own (set in /users) or the defaults: 5 questions, 1 report
const PREM_AI_ = 20, PREM_REPORTS_ = 3;
export const DEF_AI = 5, DEF_REPORTS = 0,   // a member's quick AI Analysis report: off until they add their own Claude key (or the owner gives some in /users)
  PREM_AI = 20, PREM_REPORTS = 3;
// ⭐ premium (the owner switches it in /users): voice notes + more questions / reports. The owner counts as premium.
export async function isPremium(env) { if (isOwner(env)) return true; const x = await member(env); return !!(x && x.premium && (!x.premUntil || x.premUntil > Date.now())); }
export async function aiLimitFor(env) {
  if (isOwner(env)) return Math.max(1, Math.min(500, parseInt(env.AI_DAILY_LIMIT || '30', 10) || 30));
  const x = await member(env);
  return x && Number.isFinite(x.ai) ? x.ai : Math.max(0, parseInt(env.MEMBER_AI_LIMIT || String(DEF_AI), 10) || DEF_AI);
}
// a chat's language: its own key, else the one saved with the member (kept in two places — a missing key once made a
// member's pinned message come out in the owner's language), else English (the owner: the Worker's BOT_LANG)
export async function langOf(env, mem = null) {
  let v = null; try { if (env.RATE) v = await env.RATE.get(K(env, 'lang')); } catch (_) {}
  if (v === 'ar' || v === 'en') return v;
  if (mem === 'ar' || mem === 'en') return mem;
  if (isOwner(env)) return env.BOT_LANG === 'ar' ? 'ar' : 'en';
  const x = await member(env); return x && (x.lang === 'ar' || x.lang === 'en') ? x.lang : 'en';
}
// a pending /app request (the e-mail waits for the owner's ✅)
export async function setPending(env, chat, email) { await kput(env, 'tg:appreq:' + chat, email, 7 * 86400); }
export async function getPending(env, chat) { return kget(env, 'tg:appreq:' + chat); }
export async function clearPending(env, chat) { await kdel(env, 'tg:appreq:' + chat); }
