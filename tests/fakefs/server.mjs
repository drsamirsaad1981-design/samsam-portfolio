// Minimal stand-in for the Firestore backend (the real emulator can't be downloaded here).
// Atomic batched commits, optimistic-concurrency preconditions, long-poll change feed.
import http from 'node:http';
const port = +process.argv[2] || 8787;
let docs = new Map();        // path -> { data, version }
let log = [];                // { seq, path }
let seq = 0;
let failNext = 0;            // inject commit failures
let waiters = [];

function deepMerge(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b)) {
    out[k] = (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) ? deepMerge(out[k], v) : v;
  }
  return out;
}
function body(req) { return new Promise(r => { let s = ''; req.on('data', c => s += c); req.on('end', () => r(s ? JSON.parse(s) : {})); }); }
function send(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }); res.end(JSON.stringify(obj)); }
function wake() { const w = waiters; waiters = []; w.forEach(f => f()); }
function changesSince(n) {
  const paths = [...new Set(log.filter(e => e.seq > n).map(e => e.path))];
  return { seq, docs: paths.map(p => ({ path: p, data: docs.has(p) ? docs.get(p).data : null, version: docs.has(p) ? docs.get(p).version : 0 })) };
}

const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (u.pathname === '/commit') {
    const b = await body(req);
    if (failNext > 0) { failNext--; return send(res, 500, { error: 'injected failure' }); }
    for (const p of b.pre || []) { const cur = docs.has(p.path) ? docs.get(p.path).version : 0; if (cur !== p.version) return send(res, 409, { error: 'precondition' }); }
    seq++;
    for (const op of b.ops) {
      if (op.op === 'delete') docs.delete(op.path);
      else {
        const prev = docs.has(op.path) ? docs.get(op.path).data : null;
        const data = op.merge ? deepMerge(prev, op.data) : op.data;
        docs.set(op.path, { data, version: seq });
      }
      log.push({ seq, path: op.path });
    }
    wake();
    return send(res, 200, { seq });
  }
  if (u.pathname === '/changes') {
    const since = +u.searchParams.get('since') || 0;
    if (seq > since) return send(res, 200, changesSince(since));
    const t = setTimeout(() => { waiters = waiters.filter(f => f !== go); send(res, 200, changesSince(since)); }, 15000);
    const go = () => { clearTimeout(t); send(res, 200, changesSince(since)); };
    waiters.push(go); return;
  }
  if (u.pathname === '/get') { const p = u.searchParams.get('path'); const d = docs.get(p); return send(res, 200, d ? { data: d.data, version: d.version } : { data: null, version: 0 }); }
  if (u.pathname === '/dump') return send(res, 200, Object.fromEntries([...docs].map(([k, v]) => [k, v.data])));
  if (u.pathname === '/fail') { failNext = +u.searchParams.get('n') || 1; return send(res, 200, { failNext }); }
  if (u.pathname === '/reset') { docs = new Map(); log = []; seq++; log.push({ seq, path: '__reset__' }); wake(); return send(res, 200, {}); }
  send(res, 404, {});
});
srv.listen(port, () => console.log('fake firestore on', port));
// extra ports for shell iframes (each gets its own socket pool; same shared state)
for (let i = 1; i <= 5; i++) http.createServer((q, r) => srv.emit('request', q, r)).listen(+port + i);
