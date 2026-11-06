// tools/update-etf.mjs — runs with the price history job (.github/workflows/prices.yml).
// Daily net flows of the US spot Bitcoin and Ether ETFs for the Market Hub's ETF Flows card, from SoSoValue's open API
// (free key, kept as the repository secret SOSO_API_KEY — never in the code). Farside's public tables can't be read by
// GitHub (Cloudflare check), so SoSoValue is the source.
//
//   node tools/update-etf.mjs <dir>     <dir> = a checkout of the prices branch (writes <dir>/m/etf.json)
//
// etf.json: { updated, btc: { days: [[date, net, cum, assets, traded], …] oldest first (kept ~400 trading days),
//                             funds: { date, list: [{ t, name, net, cum, assets }] } },  eth: { … } }   — USD
// The summary only reaches back a month per call, so the file keeps every day it has seen. The per-fund numbers are
// asked once per new trading day (one call per fund, paced for the 20-a-minute limit).
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] || 'out', 'm');
const FILE = path.join(OUT, 'etf.json');
const BASE = process.env.SOSO_API || 'https://openapi.sosovalue.com/openapi/v1';
const KEY = process.env.SOSO_API_KEY || '';
const sleep = ms => new Promise(r => setTimeout(r, process.env.CG_FAST ? 20 : ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), '[etf]', ...a);
const num = v => v == null || v === '' ? null : +v;
const day = v => typeof v === 'number' || /^\d{10,}$/.test(String(v)) ? new Date(+v).toISOString().slice(0, 10) : String(v).slice(0, 10);

async function soso(p) {
  for (let i = 0; i < 3; i++) {
    let r; try { r = await fetch(BASE + p, { headers: { 'x-soso-api-key': KEY, accept: 'application/json' } }); } catch (e) { log('network', p); await sleep(5e3); continue; }
    if (r.status === 429) { log('busy, waiting'); await sleep(30e3); continue; }
    const j = await r.json().catch(() => null);
    if (!j) throw new Error('HTTP ' + r.status);
    if (j.code !== 0 && j.code !== '0') throw new Error((j.code || r.status) + ' ' + (j.message || ''));
    const d = j.data; return Array.isArray(d) ? d : d && Array.isArray(d.list) ? d.list : d;
  }
  throw new Error('no answer');
}

async function main() {
  if (!KEY) { log('no SOSO_API_KEY secret yet — skipped'); return; }
  fs.mkdirSync(OUT, { recursive: true });
  let old = {}; try { old = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) {}
  const out = { updated: new Date().toISOString(), btc: old.btc || { days: [] }, eth: old.eth || { days: [] } };
  let changed = false;
  for (const sym of ['BTC', 'ETH']) {
    const k = sym.toLowerCase(), cur = out[k];
    try {
      const rows = await soso(`/etfs/summary-history?symbol=${sym}&country_code=US&limit=300`);
      const m = new Map((cur.days || []).map(r => [r[0], r]));
      for (const r of rows || []) {
        const net = num(r.total_net_inflow); if (net == null) continue;   // today's row before the numbers are in
        m.set(day(r.date), [day(r.date), Math.round(net), Math.round(num(r.cum_net_inflow) || 0), Math.round(num(r.total_net_assets) || 0), Math.round(num(r.total_value_traded) || 0)]);
      }
      cur.days = [...m.values()].sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-400);
      changed = true;
      const latest = cur.days.length ? cur.days[cur.days.length - 1][0] : null;
      log(sym, cur.days.length, 'days, latest', latest);
      // each fund's numbers for the newest day — only when that day is new
      if (latest && (!cur.funds || cur.funds.date !== latest)) {
        const list = await soso(`/etfs?symbol=${sym}&country_code=US`);
        const funds = [];
        for (const f of list || []) {
          await sleep(3500);
          try {
            const s = await soso(`/etfs/${encodeURIComponent(f.ticker)}/market-snapshot`);
            if (s && num(s.net_inflow) != null) funds.push({ t: f.ticker, name: f.name || '', net: Math.round(num(s.net_inflow)), cum: Math.round(num(s.cum_inflow) || 0), assets: Math.round(num(s.net_assets) || 0), date: day(s.date) });
          } catch (e) { log(sym, f.ticker, e.message); }
        }
        const same = funds.filter(f => f.date === latest);
        if (same.length) { cur.funds = { date: latest, list: same.map(({ date, ...f }) => f).sort((a, b) => b.assets - a.assets) }; log(sym, same.length, 'funds for', latest); }
        else log(sym, 'funds not updated yet for', latest);
      }
    } catch (e) { log(sym, 'failed:', e.message, '— kept the last one'); }
    await sleep(3500);
  }
  if (changed) { fs.writeFileSync(FILE, JSON.stringify(out)); log('wrote', FILE); }
}
main().catch(e => { console.error(e); process.exit(0); });   // never fail the price job
