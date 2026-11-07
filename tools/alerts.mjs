// tools/alerts.mjs — Telegram alerts, run by .github/workflows/prices.yml twice an hour right after the market + price update.
//
//   node tools/alerts.mjs <prices-dir>                 the real run (needs the three secrets below)
//   node tools/alerts.mjs <prices-dir> --dry --user user.json [--state state.json] [--now 2026-11-07T05:40:00Z]
//                                                      prints the messages instead of sending (local testing only)
//
// Secrets (GitHub → Settings → Secrets and variables → Actions):
//   TELEGRAM_BOT_TOKEN        the bot's token from @BotFather
//   TELEGRAM_CHAT_ID          your chat id (from @userinfobot)
//   FIREBASE_SERVICE_ACCOUNT  the Firebase service-account key (JSON) — read access to your portfolio, and the alerts' memory
//                             is saved next to it (users/{uid}/meta/alerts)
// Your settings (language, which alerts, thresholds) live in users/{uid}/meta/info.alerts — the app's Alerts settings.
//
// The repo is public, and so are its Actions logs: this script never prints a value, a coin or a message — only counts.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { summarize, evaluate, settings, priceSeries } from './alerts-core.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const DIR = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : 'out');
const DRY = args.includes('--dry');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), 'alerts:', ...a);
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; } };

// ── Firebase (service account → OAuth token → Firestore REST) ──
async function googleToken(sa) {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url'), now = Math.floor(Date.now() / 1000);
  const body = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const jwt = body + '.' + crypto.sign('RSA-SHA256', Buffer.from(body), sa.private_key).toString('base64url');
  const r = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Firebase sign-in refused (' + r.status + ')');
  return j.access_token;
}
function dec(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) return fields(v.mapValue.fields);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  return null;
}
const fields = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, dec(v)]));
function firestore(sa, token) {
  const base = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;
  const call = async (url, init = {}) => {
    const r = await fetch(url, { ...init, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', ...(init.headers || {}) } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('Firestore ' + r.status);
    return r.json();
  };
  return {
    async users() {
      const rows = await call(base + ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'meta', allDescendants: true }], limit: 200 } }) }) || [];
      return [...new Set(rows.map(x => x.document && x.document.name).filter(n => n && /\/users\/[^/]+\/meta\/info$/.test(n)).map(n => n.match(/\/users\/([^/]+)\/meta\/info$/)[1]))];
    },
    async list(p) {
      const out = []; let tok = '';
      do {
        const j = await call(`${base}/${p}?pageSize=300${tok ? '&pageToken=' + encodeURIComponent(tok) : ''}`);
        if (!j) break; (j.documents || []).forEach(d => out.push(fields(d.fields))); tok = j.nextPageToken || '';
      } while (tok);
      return out;
    },
    async get(p) { const j = await call(`${base}/${p}`); return j ? fields(j.fields) : null; },
    async setState(p, state) {
      await call(`${base}/${p}`, { method: 'PATCH', body: JSON.stringify({ fields: { state: { stringValue: JSON.stringify(state) }, updatedAt: { timestampValue: new Date().toISOString() } } }) });
    },
  };
}

// ── Telegram ──
async function send(token, chat, msg) {
  const body = { chat_id: chat, text: msg.text.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true };
  if (msg.buttons) body.reply_markup = { inline_keyboard: msg.buttons };
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { ok: !!j.ok, status: r.status, retry: r.status === 429 || r.status >= 500 };
}

// ── the market, from the prices branch (written minutes ago by the same job) ──
function market(ids) {
  const m = readJson(path.join(DIR, 'm', 'market.json')) || {}, t5 = readJson(path.join(DIR, 'm', 'top500.json')) || {};
  const series = {};
  for (const id of new Set(['bitcoin', ...ids])) { const s = priceSeries(readJson(path.join(DIR, 'p', id + '.json'))); if (s) series[id] = s; }
  const btc = (m.top || []).find(r => r.id === 'bitcoin');
  return { top: m.top || [], top500: t5.top || [], global: m.global, fng: m.fng, alt: m.alt, parts: m.parts, series,
    altPage: readJson(path.join(DIR, 'm', 'alt.json')), etf: readJson(path.join(DIR, 'm', 'etf.json')),
    btc: btc ? { price: btc.price, ch24: btc.ch24 } : series.bitcoin ? { price: series.bitcoin.last, ch24: null } : null,
    priceT: series.bitcoin ? series.bitcoin.lastT : null };
}
function cgIds() {   // samsam-coins.js → { SYM: coingecko id }
  const out = {};
  try { const m = fs.readFileSync(path.join(ROOT, 'samsam-coins.js'), 'utf8').match(/var CG_IDS = \{([\s\S]*?)\};/); if (m) for (const x of m[1].matchAll(/"([^"]+)"\s*:\s*"([a-z0-9-]+)"/g)) out[x[1].toUpperCase()] = x[2]; } catch (_) {}
  return out;
}

async function main() {
  const now = opt('--now') ? Date.parse(opt('--now')) : Date.now();
  let user, state, db, uid, tg = null;
  if (DRY) {
    user = readJson(opt('--user')); state = readJson(opt('--state')) || {};
    if (!user) throw new Error('--dry needs --user <file.json> ({ coins, txs, accum, meta })');
  } else {
    const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID, saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!token || !chat || !saRaw) { log('not set up yet (needs TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, FIREBASE_SERVICE_ACCOUNT) — skipped'); return; }
    let sa; try { sa = JSON.parse(saRaw); } catch (_) { throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON — paste the whole key file'); }
    db = firestore(sa, await googleToken(sa));
    const users = await db.users();
    if (!users.length) { log('no portfolio found in Firebase — skipped'); return; }
    uid = users[0];
    if (users.length > 1) log(users.length, 'accounts found; alerts go to the first one');
    const [coins, txs, accum, meta, st] = await Promise.all([db.list(`users/${uid}/coins`), db.list(`users/${uid}/txs`), db.list(`users/${uid}/accum`), db.get(`users/${uid}/meta/info`), db.get(`users/${uid}/meta/alerts`)]);
    user = { coins, txs, accum, meta: meta || {} };
    try { state = st && st.state ? JSON.parse(st.state) : {}; } catch (_) { state = {}; }
    tg = { token, chat };
  }
  const cfg = settings(user.meta);
  const ids = cgIds(), need = [...user.coins || [], ...(user.accum || []).filter(a => a && +a.alertPrice > 0)]   // + plan coins with a buy-price alert
    .map(c => c.cgId || ids[String(c.sym || '').toUpperCase()]).filter(Boolean);
  const m = market(need); m.cgIds = ids;
  if (!m.top.length && !m.series.bitcoin) throw new Error('no market data in ' + DIR);
  const sum = summarize(user, m, now);
  const { messages, state: next } = evaluate(sum, m, state, cfg, now);

  if (DRY) {
    messages.forEach(x => { console.log('\n────────', x.key, x.urgent ? '(urgent)' : ''); console.log(x.text); if (x.buttons) console.log('[ ' + x.buttons.flat().map(b => b.text).join(' ] [ ') + ' ]'); });
    if (opt('--save')) fs.writeFileSync(opt('--save'), JSON.stringify(next));
    return;
  }
  let sent = 0, failed = 0, retry = false;
  for (const x of messages) {
    const r = await send(tg.token, tg.chat, x);
    if (r.ok) sent++; else { failed++; if (r.retry) retry = true; log('a message was refused by Telegram (' + r.status + ')'); }
    await new Promise(res => setTimeout(res, 400));
  }
  if (!retry) await db.setState(`users/${uid}/meta/alerts`, next);   // a temporary Telegram problem → keep the old memory, so the next run tries again
  const kinds = [...new Set(messages.map(x => x.key.split('-')[0]))];
  log(`${sent} sent${failed ? `, ${failed} failed` : ''}${kinds.length ? ' (' + kinds.join(', ') + ')' : ''}`);
}

main().catch(e => { log('error —', e.message); process.exit(1); });
