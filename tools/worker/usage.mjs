// tools/worker/usage.mjs — 📖 every Firebase read (bot round + bot commands + the app) and 📊 which features get used.
//
// Firestore's free daily allowance (50,000 reads) is for the whole project and starts again at midnight Pacific time
// (11:00 Riyadh), so "today" here is the Pacific day. Three sources, added together:
//   · the 5-minute round  → tg:reads:<day> (per member, idle.mjs — one KV write per round, as before)
//   · the Worker's other reads (bot commands, Mini App, dashboard) → counted in memory, written here
//   · the app's own reads (each device counts its listeners and sends the day's total — at most every 3 hours)
// Cloudflare's free plan allows 1,000 KV writes a day, so nothing here writes on every message: counts wait in
// memory and are written at most once every 10 minutes per Worker copy (FLUSH_MS). A copy that shuts down before
// that loses its last few counts — the numbers are close, not exact.
//
// KV: use:<day> = { wr, app: { uid: reads }, f: { feature: n } } (8 days) · tg:rdalert:<day> = '60' | '80' (alert sent)

export const READ_LIMIT = 50000, FLUSH_MS = 10 * 60e3, ALERT_AT = [60, 80];
const FEAT_OK = /^[a-z0-9_:]{1,24}$/, MAX_FEATS = 150;
const kget = async (env, k) => { try { return env.RATE ? await env.RATE.get(k) : null; } catch (_) { return null; } };
const kput = async (env, k, v, ttl) => { try { if (env.RATE) await env.RATE.put(k, v, ttl ? { expirationTtl: ttl } : undefined); } catch (_) {} };
const jget = async (env, k) => { try { return JSON.parse((await kget(env, k)) || '{}') || {}; } catch (_) { return {}; } };

// the Pacific day (YYYY-MM-DD) — when Firestore's free allowance starts again
export const pday = (ms = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
export const limitOf = env => Math.max(1000, +(env && env.FS_READ_LIMIT) || READ_LIMIT);

let P = { wr: 0, app: {}, f: {} }, lastFlush = 0;
const empty = () => !P.wr && !Object.keys(P.app).length && !Object.keys(P.f).length;

// 📊 one use of a feature ('cmd:portfolio', 'btn:pf', 'voice', 'app:market', …) — in memory only
export function note(name, n = 1) {
  name = String(name || '').toLowerCase().replace(/[^a-z0-9_:]/g, '').slice(0, 24);
  if (!FEAT_OK.test(name) || !(n > 0)) return;
  if (!(name in P.f) && Object.keys(P.f).length >= MAX_FEATS) return;
  P.f[name] = (P.f[name] || 0) + Math.min(n, 1000);
}
export function addWorkerReads(n) { if (n > 0) P.wr += n; }
// 📱 the app's report: { day: reads } for this account on this device (it sends the whole day's count — keep the biggest)
export function noteApp(uid, reads, feats, dev) {
  const today = pday();
  if (uid) uid = String(uid).slice(0, 40) + ':' + (/^[a-z0-9]{1,12}$/.test(String(dev || '')) ? dev : 'x');
  if (uid && reads && typeof reads === 'object') {
    const n = +reads[today];
    if (Number.isFinite(n) && n > 0) P.app[uid] = Math.max(P.app[uid] || 0, Math.min(Math.round(n), 200000));
  }
  if (feats && typeof feats === 'object') for (const [k, v] of Object.entries(feats).slice(0, 60)) note('app:' + k, Math.round(+v) || 0);
}

// write what waited in memory (at most every 10 minutes, unless force) — returns true when it wrote
export async function flush(env, { force = false, now = Date.now(), reads = 0 } = {}) {
  addWorkerReads(reads);
  if (empty() || (!force && now - lastFlush < FLUSH_MS)) return false;
  lastFlush = now;
  const take = P; P = { wr: 0, app: {}, f: {} };
  const k = 'use:' + pday(now), cur = await jget(env, k);
  cur.wr = (+cur.wr || 0) + take.wr;
  cur.app = cur.app || {}; for (const [u, n] of Object.entries(take.app)) cur.app[u] = Math.max(+cur.app[u] || 0, n);
  cur.f = cur.f || {}; for (const [f, n] of Object.entries(take.f)) if (f in cur.f || Object.keys(cur.f).length < MAX_FEATS) cur.f[f] = (+cur.f[f] || 0) + n;
  await kput(env, k, JSON.stringify(cur), 8 * 86400);
  return true;
}

// today's reads, all sources: { round, worker, app, total, limit, pct }
export async function readsTotal(env, now = Date.now()) {
  const d = pday(now), round = Object.values(await jget(env, 'tg:reads:' + d)).reduce((a, b) => a + (+b || 0), 0);
  const u = await jget(env, 'use:' + d), worker = (+u.wr || 0) + P.wr;
  const appMap = { ...(u.app || {}) }; for (const [x, n] of Object.entries(P.app)) appMap[x] = Math.max(+appMap[x] || 0, n);
  const app = Object.values(appMap).reduce((a, b) => a + (+b || 0), 0), total = round + worker + app, limit = limitOf(env);
  return { day: d, round, worker, app, total, limit, pct: Math.round(total / limit * 100) };
}

// 📊 feature use: today and the last 7 days, biggest first
export async function features(env, now = Date.now()) {
  const days = [...new Set(Array.from({ length: 7 }, (_, i) => pday(now - i * 864e5)))];
  const maps = await Promise.all(days.map(d => jget(env, 'use:' + d).then(u => u.f || {})));
  const add = (o, m) => { for (const [k, v] of Object.entries(m)) o[k] = (o[k] || 0) + (+v || 0); return o; };
  const today = add({}, maps[0]); add(today, P.f);
  const week = maps.reduce(add, {}); add(week, P.f);
  const sort = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
  return { today: sort(today), week: sort(week) };
}

// ⚠️ 60% / 80% of the daily allowance → one message to the owner (each level once a day). send(text) → Telegram.
export async function readsAlert(env, send, lang = 'en', now = Date.now()) {
  const t = await readsTotal(env, now), key = 'tg:rdalert:' + t.day, done = +(await kget(env, key)) || 0;
  const lvl = [...ALERT_AT].reverse().find(a => t.pct >= a);
  if (!lvl || lvl <= done) return { sent: false, ...t };
  const ar = lang === 'ar', n = x => x.toLocaleString('en-US');
  const text = ar
    ? `⚠️ <b>قراءات Firebase وصلت ${t.pct}% من حد اليوم</b>\n${n(t.total)} من ${n(t.limit)}\n📱 التطبيق ${n(t.app)} · 🤖 جولة البوت ${n(t.round)} · ⚙️ باقي البوت ${n(t.worker)}\nيبدأ الحد من جديد الساعة 11:00 صباحاً بتوقيت الرياض.`
    : `⚠️ <b>Firebase reads at ${t.pct}% of today's allowance</b>\n${n(t.total)} of ${n(t.limit)}\n📱 app ${n(t.app)} · 🤖 bot round ${n(t.round)} · ⚙️ rest of the bot ${n(t.worker)}\nThe allowance starts again at 11:00 Riyadh time.`;
  const r = await send(text).catch(() => null);
  if (r && r.ok !== false) await kput(env, key, String(lvl), 2 * 86400);
  return { sent: !!(r && r.ok !== false), level: lvl, ...t };
}

export const _reset = () => { P = { wr: 0, app: {}, f: {} }; lastFlush = 0; };   // tests
