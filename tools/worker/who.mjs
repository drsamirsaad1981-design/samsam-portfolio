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

// the chats the bot serves (step 1: only the owner; invites come in step 2)
export async function chats(env) { return env.TELEGRAM_CHAT_ID ? [String(env.TELEGRAM_CHAT_ID)] : []; }
export async function allowed(env, chat) { return (await chats(env)).includes(String(chat)); }

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
