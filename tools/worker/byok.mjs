// tools/worker/byok.mjs — 🔑 a member's own Claude API key ("bring your own key").
//
// The member pastes it in the app (Settings → My Claude key); the app sends it once to this Worker (/key, signed in with
// Firebase). It is checked with Anthropic, then kept ENCRYPTED in the Worker's KV under that member's chat
// (tg:<chat>:byok): AES-256-GCM with a key derived (HKDF) from the Worker's own Firebase service-account secret — nobody,
// Samir included, ever sees it again; only its last 4 characters are shown. Their questions, voice notes and AI Analysis
// reports then run on their key (their Anthropic bill), with high limits. /forget and 🗑 Remove delete it.

import { K } from './who.mjs';

export const BYOK_AI = 100, BYOK_REPORTS = 10;
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = u => btoa(String.fromCharCode(...u)), unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function aesKey(env) {
  let secret = '';
  try { secret = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT || '{}').private_key || ''; } catch (_) {}
  secret = secret || env.TG_SECRET || '';
  if (secret.length < 16) throw new Error('no secret to encrypt with');
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('samsam-byok'), info: enc.encode('claude-key-v1') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(env, plain) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), enc.encode(plain)));
  return b64(iv) + '.' + b64(ct);
}
async function unseal(env, sealed) {
  const [iv, ct] = String(sealed).split('.');
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(env), unb64(ct)));
}

const SHAPE = /^sk-a[n]t-[A-Za-z0-9_\-]{20,200}$/;   // ([n]: the built file must never hold a key-like text)
export const validShape = k => SHAPE.test(String(k || '').trim());
// Anthropic says whether the key works (listing models costs nothing)
export async function keyWorks(key) {
  try { const r = await fetch('https://api.anthropic.com/v1/models?limit=1', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } }); return r.ok ? 'ok' : r.status === 401 || r.status === 403 ? 'refused' : 'unsure'; }
  catch (_) { return 'unsure'; }
}

// all of these run as the member's chat (asChat)
export async function saveKey(env, key) {
  const k = String(key).trim();
  await env.RATE.put(K(env, 'byok'), JSON.stringify({ v: await seal(env, k), tail: k.slice(-4), at: new Date().toISOString() }));
}
export async function keyInfo(env) {
  try { const x = JSON.parse((env.RATE && await env.RATE.get(K(env, 'byok'))) || 'null'); return x && x.v ? { has: true, tail: x.tail, at: x.at } : { has: false }; } catch (_) { return { has: false }; }
}
const mem = new Map();   // sealed text → the key (decrypting once; KV is read every time, so a new / removed key counts at once)
export async function ownKey(env) {
  let x = null; try { x = JSON.parse((env.RATE && await env.RATE.get(K(env, 'byok'))) || 'null'); } catch (_) { x = null; }
  if (!x || !x.v) return null;
  if (mem.has(x.v)) return mem.get(x.v);
  let key = null; try { key = await unseal(env, x.v); } catch (_) { key = null; }
  if (mem.size > 50) mem.clear();
  mem.set(x.v, key);
  return key;
}
export async function deleteKey(env) { try { if (env.RATE) await env.RATE.delete(K(env, 'byok')); } catch (_) {} }
