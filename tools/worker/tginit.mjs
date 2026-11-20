// tools/worker/tginit.mjs — is this Mini App data really from Telegram? (used by the Mini App's report and by /tg/login)
const enc = new TextEncoder();
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}
const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');

// Telegram's rule (core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) → { ok, user } or { ok: false, why }
export async function verifyInitData(initData, token, now = Date.now(), maxAge = 86400) {
  if (!initData || !token) return { ok: false, why: 'missing' };
  const p = new URLSearchParams(initData), hash = p.get('hash');
  if (!hash) return { ok: false, why: 'no hash' };
  p.delete('hash');
  const check = [...p.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => k + '=' + v).join('\n');
  const want = hex(await hmac(await hmac('WebAppData', token), check));
  if (want.length !== hash.length) return { ok: false, why: 'bad signature' };
  let diff = 0; for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ hash.charCodeAt(i);   // same time whatever matches
  if (diff) return { ok: false, why: 'bad signature' };
  const at = +p.get('auth_date') * 1000;
  if (!(at > 0) || now - at > maxAge * 1000) return { ok: false, why: 'too old' };
  let user = null; try { user = JSON.parse(p.get('user') || 'null'); } catch (_) {}
  return user && user.id ? { ok: true, user } : { ok: false, why: 'no user' };
}

