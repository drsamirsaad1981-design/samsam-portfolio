// sw.js — lets Cute Portfolio open like an app, also without internet.
//   · pages (.html): the newest from the network; offline → the copy kept from your last visit
//   · the app's own files (js / css / icons, with ?v=…) and the Firebase library: kept once, used from the phone after that
//   · prices, CoinGecko, Firestore, Telegram… are never kept here (your portfolio itself is kept by Firestore on the device)
// VERSION is changed by stamp-version.py on every release, so old copies are cleared.
const VERSION = 'cp-202611101858';
const PAGES = ['./', './index.html', './portfolio.html', './accumulation.html', './performance.html', './market.html', './altseason.html', './recover.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(PAGES.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k.startsWith('cp-')).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const SAME = u => u.origin === self.location.origin;
const LIB = u => u.origin === 'https://www.gstatic.com' && u.pathname.startsWith('/firebasejs/');
const FILE = u => /\.(js|css|png|svg|ico|webp|woff2?|json)$/.test(u.pathname) && !u.pathname.includes('/prices/');

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (SAME(u) && (req.mode === 'navigate' || u.pathname.endsWith('.html') || u.pathname.endsWith('/'))) { e.respondWith(page(req)); return; }
  if ((SAME(u) && FILE(u)) || LIB(u)) { e.respondWith(kept(req)); return; }
  // anything else: straight to the network, untouched
});

async function page(req) {
  const c = await caches.open(VERSION);
  try {
    const r = await fetch(req);
    if (r && r.ok) c.put(stripQuery(req), r.clone());
    return r;
  } catch (_) {
    return (await c.match(stripQuery(req))) || (await c.match('./index.html')) || new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } });
  }
}
async function kept(req) {
  const c = await caches.open(VERSION), hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone());
  return r;
}
function stripQuery(req) { const u = new URL(req.url); u.search = ''; u.hash = ''; return new Request(u.href); }
