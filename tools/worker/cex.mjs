// tools/worker/cex.mjs — 🔌 live balances from the member's own exchange accounts, with READ-ONLY API keys.
//
// The member makes a read-only key on the exchange and pastes it in the app (Performance → Wallets & Exchanges →
// Exchanges). The app sends it once to this Worker (/cex, signed in with Firebase). Here it is:
//   · checked with the exchange (Binance also says what the key may do: a key that can trade, withdraw or move money
//     is REFUSED — only "reading" is accepted);
//   · kept ENCRYPTED in KV under the account (cex:<uid>), the same AES-256-GCM sealing as the Claude key (byok.mjs) —
//     nobody, Samir included, ever sees it again; only its last 4 characters are shown;
//   · used only to READ balances (spot, funding, earn). Nothing is ever bought, sold, moved or saved in the portfolio.
// Balances are cached for a minute per account so a busy page doesn't call the exchange every few seconds.
import { seal, unseal } from './byok.mjs';
import { memberByEmail } from './who.mjs';

export const EXCHANGES = { binance: 'Binance', gate: 'Gate' };
const SHAPE = /^[A-Za-z0-9]{16,128}$/;
const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
async function hmac(hash, secret, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
const sha512 = async s => hex(await crypto.subtle.digest('SHA-512', enc.encode(s)));
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const KEY = uid => `cex:${uid}`, BAL = uid => `cex:${uid}:bal`;

// ── Binance ──
const BN = ['https://api.binance.com', 'https://api-gcp.binance.com', 'https://api1.binance.com'];
async function bn(k, path, params = {}, method = 'GET') {
  const qs = new URLSearchParams({ ...params, recvWindow: '10000', timestamp: String(Date.now()) }).toString();
  const sig = await hmac('SHA-256', k.s, qs);
  let last = null;
  for (const base of BN) {
    let r; try { r = await fetch(`${base}${path}?${qs}&signature=${sig}`, { method, headers: { 'X-MBX-APIKEY': k.k } }); } catch (e) { last = { status: 0, msg: 'network' }; continue; }
    const j = await r.json().catch(() => null);
    if (r.ok) return j;
    last = { status: r.status, msg: (j && j.msg) || '', code: j && j.code };
    if (r.status !== 451 && r.status < 500) break;   // a real answer (bad key…) — another server says the same
  }
  const e = new Error(last && last.msg || 'binance'); e.status = last && last.status; e.code = last && last.code; throw e;
}
const BN_WRITE = ['enableWithdrawals', 'enableInternalTransfer', 'permitsUniversalTransfer', 'enableVanillaOptions', 'enableFutures', 'enableMargin', 'enableSpotAndMarginTrading', 'enablePortfolioMarginTrading', 'enableFixApiTrade'];
async function binancePerms(k) {
  const r = await bn(k, '/sapi/v1/account/apiRestrictions');
  const extra = BN_WRITE.filter(x => r && r[x] === true);
  return { readOnly: !extra.length, extra, reading: !!(r && r.enableReading) };
}
async function binanceBalances(k) {
  const out = {}, notes = [];
  const add = (sym, part, q) => { q = num(q); if (!(q > 0) || !sym) return; sym = String(sym).toUpperCase(); const o = out[sym] || (out[sym] = { sym, spot: 0, funding: 0, earn: 0 }); o[part] += q; };
  const acc = await bn(k, '/api/v3/account', { omitZeroBalances: 'true' });   // must work: a key that can't read the account is refused
  const flex = await bn(k, '/sapi/v1/simple-earn/flexible/position', { size: '100' }).catch(() => { notes.push('earn'); return null; });
  const locked = await bn(k, '/sapi/v1/simple-earn/locked/position', { size: '100' }).catch(() => null);
  const fund = await bn(k, '/sapi/v1/asset/get-funding-asset', {}, 'POST').catch(() => { notes.push('funding'); return null; });
  const inEarn = new Set(((flex && flex.rows) || []).map(x => String(x.asset).toUpperCase()));
  for (const b of (acc && acc.balances) || []) {
    const a = String(b.asset || '').toUpperCase();
    if (/^LD/.test(a) && a !== 'LDO' && inEarn.has(a.slice(2))) continue;   // LDBTC = BTC in Simple Earn: counted from Earn below
    add(a, 'spot', num(b.free) + num(b.locked));
  }
  for (const x of (flex && flex.rows) || []) add(x.asset, 'earn', x.totalAmount);
  for (const x of (locked && locked.rows) || []) add(x.asset, 'earn', x.amount);
  for (const x of fund || []) add(x.asset, 'funding', num(x.free) + num(x.locked) + num(x.freeze) + num(x.withdrawing));
  return { assets: Object.values(out), notes };
}

// ── Gate (API v4) ──
const GATE = 'https://api.gateio.ws', GP = '/api/v4';
async function gate(k, path, query = '') {
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = await hmac('SHA-512', k.s, ['GET', GP + path, query, await sha512(''), ts].join('\n'));
  const r = await fetch(`${GATE}${GP}${path}${query ? '?' + query : ''}`, { headers: { KEY: k.k, Timestamp: ts, SIGN: sig, Accept: 'application/json' } });
  const j = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error((j && (j.message || j.label)) || 'gate'); e.status = r.status; throw e; }
  return j;
}
async function gateBalances(k) {
  const out = {}, notes = [];
  const add = (sym, part, q) => { q = num(q); if (!(q > 0) || !sym) return; sym = String(sym).toUpperCase(); const o = out[sym] || (out[sym] = { sym, spot: 0, funding: 0, earn: 0 }); o[part] += q; };
  const spot = await gate(k, '/spot/accounts');
  const lend = await gate(k, '/earn/uni/lends').catch(() => { notes.push('earn'); return null; });
  for (const b of spot || []) add(b.currency, 'spot', num(b.available) + num(b.locked));
  for (const x of lend || []) add(x.currency, 'earn', x.amount);
  return { assets: Object.values(out), notes };
}

const READ = { binance: binanceBalances, gate: gateBalances };
async function load(env, uid) { try { return JSON.parse((await env.RATE.get(KEY(uid))) || '{}') || {}; } catch (_) { return {}; } }
async function keyOf(env, x) { try { return JSON.parse(await unseal(env, x.v)); } catch (_) { return null; } }
const why = e => e && e.status === 451 ? 'blocked' : e && (e.status === 401 || e.status === 403 || e.code === -2014 || e.code === -2015 || e.code === -1022) ? 'refused' : e && e.status === 429 ? 'busy' : 'failed';
const list = all => Object.keys(EXCHANGES).filter(ex => all[ex]).map(ex => ({ ex, name: EXCHANGES[ex], tail: all[ex].tail, at: all[ex].at, readOnly: all[ex].readOnly }));

// /cex — { action: 'status' | 'set' | 'delete' | 'balances', ex, key, secret, fresh } from a signed-in owner or member
export async function cexHandler(env, who, body) {
  const owner = (who.owners || []).includes(who.email);
  if (!owner && !(await memberByEmail(env, who.email).catch(() => null))) return { status: 403, error: 'Only Cute Portfolio members can connect an exchange.' };
  if (!env.RATE || !who.uid) return { status: 500, error: 'Storage is not set up.' };
  const a = body && body.action, ex = body && body.ex, all = await load(env, who.uid);
  if (a === 'set') {
    if (!EXCHANGES[ex]) return { status: 400, error: 'Pick Binance or Gate.' };
    const k = { k: String(body.key || '').trim(), s: String(body.secret || '').trim() };
    if (!SHAPE.test(k.k) || !SHAPE.test(k.s)) return { status: 400, error: 'That does not look like an API key and secret (letters and digits only).' };
    let perms = { readOnly: null };
    try {
      if (ex === 'binance') { perms = await binancePerms(k); if (!perms.readOnly) return { status: 400, error: 'refused-perms', extra: perms.extra }; }
      await READ[ex](k);
    } catch (e) { const w = why(e); return { status: w === 'refused' ? 400 : 502, error: w }; }
    all[ex] = { v: await seal(env, JSON.stringify(k)), tail: k.k.slice(-4), at: new Date().toISOString(), readOnly: perms.readOnly };
    await env.RATE.put(KEY(who.uid), JSON.stringify(all)); await env.RATE.delete(BAL(who.uid)).catch(() => {});
    return { ok: true, exchanges: list(all) };
  }
  if (a === 'delete') {
    if (all[ex]) { delete all[ex]; if (Object.keys(all).length) await env.RATE.put(KEY(who.uid), JSON.stringify(all)); else await env.RATE.delete(KEY(who.uid)); await env.RATE.delete(BAL(who.uid)).catch(() => {}); }
    return { ok: true, exchanges: list(all) };
  }
  if (a === 'balances') {
    if (!Object.keys(all).length) return { exchanges: [], balances: [] };
    let c = null; try { c = JSON.parse((await env.RATE.get(BAL(who.uid))) || 'null'); } catch (_) {}
    if (c && Date.now() - c.t < (body.fresh ? 60e3 : 5 * 60e3)) return { exchanges: list(all), balances: c.b, at: c.t, cached: true };
    const b = await Promise.all(Object.keys(EXCHANGES).filter(x => all[x]).map(async x => {
      const k = await keyOf(env, all[x]); if (!k) return { ex: x, name: EXCHANGES[x], ok: false, error: 'refused' };
      try { const r = await READ[x](k); return { ex: x, name: EXCHANGES[x], ok: true, assets: r.assets, notes: r.notes }; }
      catch (e) { return { ex: x, name: EXCHANGES[x], ok: false, error: why(e) }; }
    }));
    const t = Date.now();
    if (b.some(x => x.ok)) await env.RATE.put(BAL(who.uid), JSON.stringify({ t, b }), { expirationTtl: 600 }).catch(() => {});
    return { exchanges: list(all), balances: b, at: t };
  }
  return { exchanges: list(all) };
}
