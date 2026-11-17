// tools/worker/usmarket.mjs — the US stock market's hours and the metals' names, shared by the bot's 📈 bStocks / 🥇 Metals
// views, the smart morning / evening and the channel's market pulse (the app has the same rule in samsam-assets.js).
// New York, Mon–Fri: pre-market 4:00, open 9:30–16:00, after-hours to 20:00. US holidays are not counted.
function ny(d) {
  const o = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(d).forEach(x => { o[x.type] = x.value; });
  return { wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday), m: (+o.hour % 24) * 60 + +o.minute };
}
export function usMarket(now = Date.now()) {
  const p = ny(new Date(now)), wk = p.wd >= 1 && p.wd <= 5, OPEN = 570, CLOSE = 960;
  const state = !wk ? 'closed' : p.m >= OPEN && p.m < CLOSE ? 'open' : p.m >= 240 && p.m < OPEN ? 'pre' : p.m >= CLOSE && p.m < 1200 ? 'after' : 'closed';
  const target = state === 'open' ? CLOSE : OPEN;
  let t = now;
  for (let i = 0; i < 4 * 24 * 6; i++) { t += 15 * 60e3; const q = ny(new Date(t)); if (q.wd >= 1 && q.wd <= 5 && q.m >= target && q.m < target + 15) { t -= (q.m - target) * 60e3; break; } }
  return { state, next: Math.floor(t / 60e3) * 60e3 };
}
export const US_STATE = { en: { open: '🟢 Open', pre: '🟡 Pre-market', after: '🟡 After hours', closed: '⚪ Closed' }, ar: { open: '🟢 مفتوح', pre: '🟡 ما قبل الافتتاح', after: '🟡 بعد الإغلاق', closed: '⚪ مغلق' } };
export const METAL = { gold: ['🥇', 'Gold', 'الذهب'], silver: ['🥈', 'Silver', 'الفضة'], platinum: ['⚪', 'Platinum', 'البلاتين'], copper: ['🟠', 'Copper', 'النحاس'], brent: ['🛢️', 'Brent oil', 'نفط برنت'] };
export const UNIT = { oz: ['oz', 'أونصة'], lb: ['lb', 'رطل'], bbl: ['barrel', 'برميل'] };
export const gramSar = ozUsd => ozUsd / 31.1034768 * 3.75;
