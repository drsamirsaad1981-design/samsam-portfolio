// A made-up Bitcoin history for the browser tests of the 🌈 rainbow (exit_rainbow / market_rainbow): the published line with
// a four-year wave on it whose swing shrinks from cycle to cycle (as the real one did), ending yesterday (UTC).
//   node tests/rainbow_fixture.mjs            → { full: m/rainbow.json, small: its part inside market.json }
// The numbers are NOT Bitcoin's: only their shape is. The file is built by the real job's own code (update-rainbow → build).
import * as C from '../samsam-core.js';
import { build } from '../tools/update-rainbow.mjs';
const now = Date.now(), DAY = 864e5, FROM = C.rainbowDay(C.RAINBOW_FROM), last = Math.floor(now / DAY) - 1, s = new Map();
for (let d = FROM; d <= last; d++) {
  const t = (d - FROM) / 1461, amp = 1.05 * Math.exp(-t / 2.6) + 0.12, wave = Math.sin(2 * Math.PI * (t - 0.1)), spike = Math.max(0, wave) ** 3;   // sharp tops, long flat lows
  s.set(d, 10 ** (-16.1839 + 5.5943 * Math.log10(d - C.RAINBOW_GENESIS) + amp * (spike - 0.42) + 0.012 * Math.sin(d / 9) + 0.006 * Math.sin(d / 2.3)));
}
const full = build(s, null, now);
console.log(JSON.stringify({ full, small: { v: 1, fit: full.fit, closes: full.closes, held: full.held, peaks: full.peaks,   // (as update-market.mjs copies it)
  w200: { ma: full.w200.ma, day: full.w200.day, under: { days: full.w200.under.days, pct: full.w200.under.pct, last: full.w200.under.last } }, pi: full.pi } }));
