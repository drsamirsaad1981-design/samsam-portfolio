// tools/worker/miniapp.mjs — phase 7: the Telegram Mini App ("📊 Report" opens a full page inside Telegram).
//
//   GET  /tg/app   the page (tools/worker/miniapp.html, built into the Worker) — it holds no data
//   POST /tg/api   the report as JSON, only for a request signed by Telegram for YOUR account:
//                  the page sends Telegram.WebApp.initData; we check its signature with the bot token (HMAC-SHA256,
//                  key = HMAC("WebAppData", bot token)), that it is less than 24 h old, and that the user is TELEGRAM_CHAT_ID.
// The numbers are the bot's own (summarize = the app's maths), plus the morning's "today" list, alerts and the paper portfolio.

import { summarize, isStable, etfDay } from '../alerts-core.mjs';
import { loadMarket, loadUser, coinsOf, withIds, resetBudget } from './data.mjs';
import { listAlerts, describe } from './watch.mjs';
import { todo } from './daily.mjs';
import { paperFacts } from './paper.mjs';
import PAGE from './miniapp.html';

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

const r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
const r6 = v => v == null || !isFinite(v) ? null : +Number(v).toPrecision(6);

export async function report(env, now = Date.now()) {
  const user = await loadUser(env).catch(() => null);
  let lang = null; try { if (env.RATE) lang = await env.RATE.get('tg:lang'); } catch (_) {}
  lang = lang === 'ar' || lang === 'en' ? lang : env.BOT_LANG === 'ar' ? 'ar' : 'en';
  const m = await loadMarket([], coinsOf(user));
  const g = m.global || {}, d = g.dom || {}, e = etfDay(m.etf);
  const market = { btc: m.btc ? { price: r6(m.btc.price), ch24: r2(m.btc.ch24) } : null, fng: m.fng || null, dom: { btc: r2(d.btc), eth: r2(d.eth), usdt: r2(d.usdt) }, mcap: g.mcap || null, mcapCh24: r2(g.mcapCh24),
    alt: m.alt && m.alt.value != null ? { value: m.alt.value, label: m.alt.label } : null, etf: e ? { day: e.label, btc: Math.round(e.btc), eth: Math.round(e.eth) } : null,
    snapshot: m.parts && m.parts.top || null, sectors: (m.sectors || []).filter(s => s.mcap >= 1e9).sort((a, b) => b.ch24 - a.ch24).filter((s, i, a) => i < 3 || i >= a.length - 3).map(s => ({ name: s.name, ch24: s.ch24 })) };
  const alerts = (await listAlerts(env)).map(a => ({ what: describe(a), armed: a.armed, note: a.note || '' }));
  const paper = await paperFacts(env).catch(() => null);
  if (!user) return { t: now, lang, connected: false, market, alerts, paper };
  const sum = summarize(withIds(user, m), m, now), names = Object.fromEntries((user.coins || []).map(c => [String(c.sym).toUpperCase(), c.name || '']));
  const coins = sum.coins.filter(c => c.value >= 0.01).sort((a, b) => b.value - a.value).map(c => ({ sym: c.sym, name: names[c.sym] || '', qty: r6(c.qty), price: r6(c.price), avg: r6(c.avg), value: r2(c.value),
    share: sum.value > 0 ? r2(c.value / sum.value * 100) : 0, ch24: r2(c.ch24), ch7: r2(c.ch7), pnl: r2(c.chg), signal: sum.signal[c.sym] || 'hold', stable: isStable(c.sym), vsBtc: c.vs ? r2(c.vs.pct) : null }));
  const tps = (sum.tps || []).map(t => ({ sym: t.sym, n: t.n, level: r6(t.level), price: r6(t.price), to: r2((t.level / t.price - 1) * 100), sell: t.pct })).sort((a, b) => a.to - b.to).slice(0, 10);
  return {
    t: now, lang, connected: true,
    pf: { value: r2(sum.value), ch24: r2(sum.ch24), d24: r2(sum.d24), ch7: r2(sum.ch7), d7: r2(sum.d7), profit: r2(sum.total), profitPct: r2(sum.pctTotal), invested: r2(sum.invested), vsBtc: r2(sum.vsBtc), beat: sum.beat, alts: sum.alts },
    coins, counts: sum.counts,
    plan: { pct: r2(sum.prog && sum.prog.pct), completed: sum.prog && sum.prog.completed, counted: sum.prog && sum.prog.counted, items: sum.plan.map(p => ({ sym: p.sym, actual: r6(p.actual), target: r6(p.target), pct: p.target > 0 ? r2(Math.min(100, p.actual / p.target * 100)) : 0 })) },
    dca: (sum.dca || []).map(x => ({ sym: x.sym, usd: r2(x.s.usd), next: x.s.next || null, state: x.s.state, perMonth: r2(x.s.perMonth) })),
    buyAt: (sum.buyAt || []).map(x => ({ sym: x.sym, at: r6(x.at), price: r6(x.price), away: r2((x.price / x.at - 1) * 100) })),
    exit: { macro: sum.macro.map(x => ({ k: x.k, now: x.now != null ? +Number(x.now).toFixed(x.dp) : null, lvl: x.lvl, met: x.met, op: x.op, unit: x.unit })), tps },
    alloc: sum.alloc ? sum.alloc.groups.map(g2 => ({ name: sum.alloc.names[g2.key] || g2.key, now: r2(g2.now), target: r2(g2.target), state: g2.state })) : null,
    todo: todo(sum, now), market, alerts, paper,
  };
}

const CSP = "default-src 'none'; script-src 'self' 'unsafe-inline' https://telegram.org; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors https://web.telegram.org https://*.telegram.org";
export function page() {
  return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': CSP, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' } });
}
export async function api(request, env) {
  const json = (s, o) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  if (request.method !== 'POST') return json(405, { ok: false });
  const body = await request.json().catch(() => ({}));
  const v = await verifyInitData(String(body.initData || '').slice(0, 4096), env.TELEGRAM_BOT_TOKEN);
  if (!v.ok) return json(401, { ok: false, error: v.why });
  if (String(v.user.id) !== String(env.TELEGRAM_CHAT_ID)) return json(403, { ok: false, error: 'private' });
  resetBudget();
  try { return json(200, { ok: true, report: await report(env) }); }
  catch (e) { console.log(JSON.stringify({ miniapp: 'error', message: String(e && e.message).slice(0, 200) })); return json(500, { ok: false, error: 'report failed' }); }
}
