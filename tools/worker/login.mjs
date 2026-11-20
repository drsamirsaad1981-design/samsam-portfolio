// tools/worker/login.mjs — 📱 the full app inside Telegram (the Mini App opens the real Cute Portfolio, not a copy).
//
//   POST /tg/login  { initData }  → { token }  a Firebase custom token for the account linked to this Telegram user
//
// Google's sign-in page does not open inside Telegram, so the app signs in with Telegram instead:
//   1. Telegram gives the Mini App its initData, signed with the bot token — checked here (verifyInitData, ≤ 30 min old);
//   2. the Telegram user must be Samir (→ his pinned account) or a member of the bot with a linked portfolio (/link);
//   3. the Worker signs a 1-hour custom token for THAT account only; the app calls signInWithCustomToken with it.
// Nobody else gets a token: not linked → { error: 'not-linked' } (the app shows how to link), paused → 'paused'.
// At most 20 tries an hour per Telegram user. Only the app's own site may call it (CORS, as the app's other calls).
import { verifyInitData } from './tginit.mjs';
import { asChat, members, bump } from './who.mjs';
import { chatUid, customTokenFor } from './data.mjs';

const MAX_AGE = 30 * 60;   // seconds: initData older than this is refused (the Mini App was opened that long ago)
export async function tgLogin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || 'https://drsamirsaad1981-design.github.io').split(',').map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) && env.ALLOW_LOCAL === '1');
  const cors = { 'Access-Control-Allow-Origin': ok ? origin : allowed[0] || '', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
  const reply = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (request.method === 'OPTIONS') return new Response(null, { status: ok ? 204 : 403, headers: cors });
  if (!ok) return reply(403, { error: 'origin' });
  if (request.method !== 'POST') return reply(405, { error: 'method' });
  const raw = await request.text(); if (raw.length > 8000) return reply(413, { error: 'big' });
  let body; try { body = JSON.parse(raw); } catch (_) { return reply(400, { error: 'bad' }); }
  const v = await verifyInitData(String(body.initData || ''), env.TELEGRAM_BOT_TOKEN, Date.now(), MAX_AGE);
  if (!v.ok) return reply(401, { error: v.why === 'too old' ? 'expired' : 'signature' });
  const tgId = String(v.user.id);
  if (await bump('tglogin', tgId, 3600e3) > 20) return reply(429, { error: 'busy' });
  const isOwner = tgId === String(env.TELEGRAM_CHAT_ID), m = isOwner ? null : (await members(env))[tgId];
  if (!isOwner && !m) return reply(403, { error: 'not-member' });
  if (m && m.paused) return reply(403, { error: 'paused' });
  const uid = await asChat(tgId, () => chatUid(env)).catch(() => null);
  if (!uid) return reply(403, { error: 'not-linked' });
  const token = await customTokenFor(env, uid);
  if (!token) return reply(503, { error: 'token' });
  console.log(JSON.stringify({ tglogin: isOwner ? 'owner' : 'member' }));
  return reply(200, { token });
}
