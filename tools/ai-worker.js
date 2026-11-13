// tools/ai-worker.js — the Cloudflare Worker behind "AI Analysis" (samsam-analysis.<you>.workers.dev/analyze).
// Since the Telegram bot shares this Worker, what you paste is the BUILT file tools/dist/samsam-worker.js (this file + the bot),
// made by `node tools/build-worker.mjs` (Cloudflare dashboard → Workers & Pages → samsam-analysis → Edit code → paste → Deploy).
//
// What it does, in order, for every request:
//   1. Only POST from the app's own site (CORS allow-list) — anything else is refused.
//   2. Checks the Firebase ID token the app sends (proof the person is signed in with Google):
//      signature (Google's public keys), project, issuer, expiry, verified e-mail — and, while the app is private,
//      that the e-mail is on the allow-list.
//   3. Counts reports per account per day (Workers KV) and refuses past the daily limit (HTTP 429).
//   4. Only then calls Claude with your Anthropic key, and returns { report, model, remaining }.
// No key or secret is in this file: they live in the Worker's settings (below).
//
// ── Settings (Worker → Settings → Variables and Secrets) ──
//   ANTHROPIC_API_KEY  Secret   your Anthropic API key (already there)
//   FIREBASE_PROJECT   Text     samsam-portfolio
//   ALLOWED_EMAILS     Text     dr.samir.saad.1981@gmail.com      (comma-separated; leave EMPTY to allow any signed-in Google account)
//   ALLOWED_ORIGINS    Text     https://drsamirsaad1981-design.github.io
//   DAILY_LIMIT        Text     5                                  (reports per account per day, UTC)
//   MODEL              Text     claude-opus-4-5                    (optional — the Claude model to use)
// ── Binding (Worker → Settings → Bindings → Add → KV namespace) ──
//   Variable name RATE  →  a KV namespace, e.g. "samsam-ai-rate" (Workers & Pages → KV → Create)
//   Without it the Worker still runs, but the daily limit is only kept per server instance (weaker).

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const MAX_BODY = 200 * 1024;        // the app's request is ~5–20 KB
let jwksCache = { keys: null, until: 0 };
const memCount = new Map();         // fallback counter when no KV binding

// the Telegram bot's members (tools/worker/who.mjs) — set by tools/worker/index.mjs; absent when this file runs alone
let memberCheck = null;
export function setMemberCheck(fn) { memberCheck = fn; }
let adminHandler = null;   // /admin — the owner's dashboard in the app (tools/worker/admin.mjs)
export function setAdminHandler(fn) { adminHandler = fn; }
let keyHandler = null;   // /key — a member's own Claude key (tools/worker/byok.mjs), set by index.mjs
export function setKeyHandler(fn) { keyHandler = fn; }

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = list(env.ALLOWED_ORIGINS || 'https://drsamirsaad1981-design.github.io');
    const okOrigin = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) && env.ALLOW_LOCAL === '1';
    const cors = {
      'Access-Control-Allow-Origin': okOrigin ? origin : allowed[0] || '',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    const reply = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: okOrigin ? 204 : 403, headers: cors });
    if (!okOrigin) return reply(403, { error: 'This service only answers the Cute Portfolio app.' });
    const path = new URL(request.url).pathname, isKey = /\/key\/?$/.test(path), isAdmin = /\/admin\/?$/.test(path);
    if (request.method !== 'POST' || !(path.endsWith('/analyze') || isKey || isAdmin)) return reply(404, { error: 'Not found.' });

    // body (size-capped)
    const raw = await request.text();
    if (raw.length > MAX_BODY) return reply(413, { error: 'Request too large.' });
    let body; try { body = JSON.parse(raw); } catch (_) { return reply(400, { error: 'Bad request.' }); }

    // 2. who is asking
    const token = body.idToken || (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    let user;
    try { user = await verifyFirebaseToken(token, env.FIREBASE_PROJECT || 'samsam-portfolio'); }
    catch (e) { return reply(401, { error: 'Please sign in again, then retry. (' + e.message + ')' }); }
    const emails = list(env.ALLOWED_EMAILS || ''), em = String(user.email || '').toLowerCase();
    if (isAdmin) {   // 🛠 the owner's dashboard: only the owner's account (checked again inside)
      if (!adminHandler) return reply(404, { error: 'Not found.' });
      const r = await adminHandler(env, { email: em, uid: user.uid, owners: emails }, body).catch(e => ({ status: 500, error: 'Something went wrong — ' + String(e && e.message || e).slice(0, 120) }));
      return reply(r.status || 200, r);
    }
    if (isKey) {   // 🔑 status / set / delete the signed-in member's own Claude key
      if (!keyHandler) return reply(404, { error: 'Not found.' });
      const r = await keyHandler(env, em, body).catch(() => ({ status: 500, error: 'Something went wrong — try again.' }));
      return reply(r.status || 200, r);
    }
    let apiKey = env.ANTHROPIC_API_KEY;
    let limit = Math.max(1, parseInt(env.DAILY_LIMIT || '5', 10) || 5), model = env.MODEL || 'claude-opus-4-5';
    if (emails.length && !emails.includes(em)) {
      // someone the owner invited through the Telegram bot (their e-mail approved there): their own limit (default 1 a day)
      // and the lighter model (MEMBER_MODEL, else Claude Sonnet 5.5)
      const m = memberCheck ? await memberCheck(env, em).catch(() => null) : null;
      if (!m) return reply(403, { error: 'This account is not allowed to use the AI analysis.' });
      limit = m.limit; model = m.model; if (m.apiKey) apiKey = m.apiKey;   // 🔑 their own key → their bill
      if (!(limit > 0)) return reply(429, { error: 'The quick report needs your own Claude key (Settings → My Claude key). The free way — with the Claude app — works for everyone.', remaining: 0 });
    }

    // 3. daily limit per account
    const day = new Date().toISOString().slice(0, 10);
    const key = `ai:${user.uid}:${day}`;
    const used = await getCount(env, key);
    if (used >= limit) return reply(429, { error: `You have used today's ${limit} AI reports. New reports are available tomorrow (00:00 UTC).`, remaining: 0 });

    // 4. Claude
    if (!apiKey) return reply(500, { error: 'The Worker has no ANTHROPIC_API_KEY secret.' });
    const lang = body.language === 'ar' ? 'ar' : 'en';
    const data = body.portfolioData && typeof body.portfolioData === 'object' ? body.portfolioData : null;
    if (!data) return reply(400, { error: 'No portfolio data in the request.' });
    const extra = typeof body.accumContext === 'string' ? body.accumContext.slice(0, 20000) : '';

    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 4000, system: systemPrompt(lang), messages: [{ role: 'user', content: userPrompt(data, extra, lang) }] }),
      });
    } catch (_) { return reply(502, { error: 'Could not reach Claude. Please try again.' }); }
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return reply(502, { error: (out.error && out.error.message) || `Claude returned ${res.status}.` });
    const report = (out.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!report) return reply(502, { error: 'Claude returned an empty report.' });

    await setCount(env, key, used + 1);   // counted only when a report was delivered
    return reply(200, { report, model: out.model || model, remaining: limit - used - 1 });
  },
};

// ── Firebase ID token check (RS256, Google's rotating public keys) ──
async function verifyFirebaseToken(token, projectId) {
  if (!token || typeof token !== 'string' || token.split('.').length !== 3) throw new Error('no sign-in token');
  const [h, p, s] = token.split('.');
  const header = JSON.parse(b64urlText(h)), payload = JSON.parse(b64urlText(p));
  if (header.alg !== 'RS256' || !header.kid) throw new Error('bad token');
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId || payload.iss !== 'https://securetoken.google.com/' + projectId) throw new Error('wrong project');
  if (!(payload.exp > now)) throw new Error('token expired');
  if (!(payload.iat <= now + 300) || !(payload.auth_time <= now + 300)) throw new Error('bad token time');
  if (!payload.sub || typeof payload.sub !== 'string') throw new Error('no user');
  if (payload.email_verified !== true) throw new Error('e-mail not verified');
  const jwk = (await googleKeys()).find(k => k.kid === header.kid) || (await googleKeys(true)).find(k => k.kid === header.kid);
  if (!jwk) throw new Error('unknown key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(s), new TextEncoder().encode(h + '.' + p));
  if (!ok) throw new Error('bad signature');
  return { uid: payload.sub, email: payload.email || '' };
}
async function googleKeys(force) {
  if (!force && jwksCache.keys && Date.now() < jwksCache.until) return jwksCache.keys;
  const r = await fetch(JWKS_URL);
  if (!r.ok) throw new Error('cannot load Google keys');
  const j = await r.json();
  const age = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  jwksCache = { keys: j.keys || [], until: Date.now() + (age ? +age[1] : 3600) * 1000 };
  return jwksCache.keys;
}
function b64urlBytes(s) { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); }
function b64urlText(s) { return new TextDecoder().decode(b64urlBytes(s)); }

// ── daily counter ──
async function getCount(env, key) {
  if (env.RATE) return parseInt((await env.RATE.get(key)) || '0', 10) || 0;
  return memCount.get(key) || 0;
}
async function setCount(env, key, n) {
  if (env.RATE) return env.RATE.put(key, String(n), { expirationTtl: 2 * 86400 });
  memCount.set(key, n);
}
function list(v) { return String(v || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean).map(x => x.startsWith('http') ? x.replace(/\/$/, '') : x); }

// ── the report (same shape the app renders: numbered sections with an emoji each) ──
function systemPrompt(lang) {
  const L = lang === 'ar'
    ? 'Write the whole report in Arabic (Modern Standard Arabic, clear and direct). Keep coin tickers, numbers and $ amounts in Latin characters.'
    : 'Write the whole report in clear, direct English.';
  return [
    'You are a seasoned crypto portfolio analyst writing a private report for the portfolio owner.',
    'Base every statement on the data provided. Do not invent prices, news or numbers. Be specific: name coins, amounts and percentages.',
    'This is analysis, not financial advice; do not promise returns. Keep it practical and concise.',
    L,
    'Format: plain text with markdown bold (**…**) and "- " bullets only. No tables, no code blocks, no HTML.',
    'Use exactly these numbered section headings, each on its own line, in this order:',
    '1. 📊 Market Overview',
    '2. 🥧 Portfolio Overview & Allocation',
    '3. 🏆 Best & Worst Performers',
    '4. ⚠️ Risks & Concentration',
    '5. 💰 Accumulation Plan Progress',
    '6. 💡 Recommendations (Buy / Hold / Reduce, per coin where it matters)',
    '7. 🎯 Action Plan for the Next 30 Days',
  ].join('\n');
}
function userPrompt(data, extra, lang) {
  return 'PORTFOLIO DATA (JSON, USD):\n' + JSON.stringify(data).slice(0, 60000) + (extra ? '\n' + extra : '') +
    '\n\nWrite the report now' + (lang === 'ar' ? ' (in Arabic)' : '') + '.';
}
