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
  delete m[String(chat)]; await kput(env, 'tg:users', JSON.stringify(m));
  return true;
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
