// ⏳ tools/update-prices.mjs writes p/close.json — every coin's price at the last daily close (00:00 UTC) — next to the
// hourly files, against a fake CoinGecko: the price at that hour, for each coin, with the day it belongs to.
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0; const check = (n, c, d = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' -> ' + JSON.stringify(d))); };
const H = 3600e3, now = Date.now(), day = Math.floor(now / 864e5) * 864e5;
const priceAt = (id, t) => (id === 'bitcoin' ? 100000 : 2) + (t - day) / H * (id === 'bitcoin' ? 10 : 0.01);   // a straight line: exact at each hour
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname.endsWith('/coins/markets')) {
    const ids = u.searchParams.get('ids').split(',');
    const end = Math.floor(now / H) * H;
    r.end(JSON.stringify(ids.map(id => ({ id, current_price: priceAt(id, end), last_updated: new Date(end).toISOString(), sparkline_in_7d: { price: Array.from({ length: 168 }, (_, j) => priceAt(id, end - (167 - j) * H)) } }))));
  } else if (/market_chart/.test(u.pathname)) {
    const id = u.pathname.split('/')[2], from = day - 3 * 864e5, pts = []; for (let t = from; t <= now; t += H) pts.push([t, priceAt(id, t)]);
    r.end(JSON.stringify({ prices: pts }));
  } else { r.statusCode = 404; r.end('{}'); }
});
await new Promise(ok => srv.listen(0, ok));
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'close-'));
const p = spawn('node', [path.join(ROOT, 'tools/update-prices.mjs'), out], { env: { ...process.env, CG_API: `http://127.0.0.1:${srv.address().port}`, CG_FAST: '1' }, stdio: 'pipe' });
let log = ''; p.stdout.on('data', d => log += d); p.stderr.on('data', d => log += d);
await new Promise(ok => p.on('exit', ok)); srv.close();
const f = path.join(out, 'p', 'close.json'), c = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
check('p/close.json is written next to the hourly files', !!c, log.slice(-400));
if (c) {
  check('…for today (the day of the last 00:00 UTC)', c.day === new Date(day).toISOString().slice(0, 10) && c.t === day, [c.day, c.t]);
  check('…with BTC at its 00:00 UTC price', Math.abs(c.p.bitcoin - priceAt('bitcoin', day)) < 1e-6, c.p.bitcoin);
  check('…and every coin the app knows (not only BTC)', Object.keys(c.p).length > 10 && Math.abs(c.p.solana - priceAt('solana', day)) < 1e-6, [Object.keys(c.p).length, c.p.solana]);
}
console.log(`close_file_test: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
