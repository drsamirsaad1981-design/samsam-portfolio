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
export const MAX_MEMBERS = 20;
export async function members(env) { try { const m = JSON.parse((await kget(env, 'tg:users')) || '{}'); return m && typeof m === 'object' ? m : {}; } catch (_) { return {}; } }
export async function chats(env) { return env.TELEGRAM_CHAT_ID ? [String(env.TELEGRAM_CHAT_ID), ...Object.keys(await members(env)).filter(c => c !== String(env.TELEGRAM_CHAT_ID))] : []; }
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
  if (Object.keys(m).length >= MAX_MEMBERS) return { error: 'full' };
  await kdel(env, 'tg:inv:' + C);   // first: a code works once
  const name = [from && from.first_name, from && from.last_name].filter(Boolean).join(' ').slice(0, 40) || 'Friend';
  m[String(chat)] = { name, user: from && from.username ? String(from.username).slice(0, 32) : '', joined: Date.now(), note: (() => { try { return JSON.parse(raw).note || ''; } catch (_) { return ''; } })() };
  await kput(env, 'tg:users', JSON.stringify(m));
  return { ok: true, member: m[String(chat)] };
}
export async function removeMember(env, chat) {
  const m = await members(env);
  if (!m[String(chat)]) return false;
  const had = m[String(chat)];
  delete m[String(chat)]; await kput(env, 'tg:users', JSON.stringify(m)); await kdel(env, `tg:${chat}:byok`);   // their Claude key goes too
  return had;   // the record (its e-mail leaves the app's access list — the caller syncs it)
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
export const DEF_AI = 5, DEF_REPORTS = 1, PREM_AI = 20, PREM_REPORTS = 3;
// ⭐ premium (the owner switches it in /users): voice notes + more questions / reports. The owner counts as premium.
export async function isPremium(env) { if (isOwner(env)) return true; const x = await member(env); return !!(x && x.premium); }
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
