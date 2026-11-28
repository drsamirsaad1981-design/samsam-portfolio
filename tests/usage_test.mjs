// tools/worker/usage.mjs — 📖 all of today's Firebase reads (round + bot + app) and 📊 feature counts, with a fake KV.
// Counts wait in memory and are written at most every 10 minutes (Cloudflare's free plan: 1,000 KV writes a day);
// 60% / 80% of the 50,000 free reads → one message to the owner per level per (Pacific) day.
import { fileURLToPath } from 'node:url'; import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const U = await import(path.join(ROOT, 'tools/worker/usage.mjs'));
const I = await import(path.join(ROOT, 'tools/worker/idle.mjs'));
const B = await import(path.join(ROOT, 'tools/worker/bot.mjs'));
let pass = 0, fail = 0; const check = (n, c, d = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' -> ' + JSON.stringify(d))); };

const store = new Map(); let puts = 0;
const env = { TELEGRAM_CHAT_ID: '1', RATE: { get: async k => store.has(k) ? store.get(k) : null, put: async (k, v) => { puts++; store.set(k, v); }, delete: async k => store.delete(k) } };

// the Pacific day: 18 Nov 2026 10:59 Riyadh = 17 Nov 23:59 Pacific; 11:01 Riyadh = 18 Nov
check('Pacific day before 11:00 Riyadh is still yesterday', U.pday(Date.parse('2026-11-18T07:59:00Z')) === '2026-11-17', U.pday(Date.parse('2026-11-18T07:59:00Z')));
check('Pacific day after 11:00 Riyadh is today', U.pday(Date.parse('2026-11-18T08:01:00Z')) === '2026-11-18');

// (the steps below run up to 50 minutes "later"; in the last hour of the Pacific day that crossed midnight and the app's
//  reads were written under the next day — the test failed between 10:10 and 11:00 Riyadh. The made-up clock now starts
//  an hour back in that hour, so every step stays in the real day that noteApp reads.)
const real = Date.now(), t0 = U.pday(real + 3600e3) === U.pday(real) ? real : real - 3600e3, day = U.pday(real);
U._reset();
U.note('cmd:portfolio'); U.note('cmd:portfolio'); U.note('btn:pf'); U.note('Bad Name!!'); U.note('x'.repeat(40));
check('first flush writes once', await U.flush(env, { now: t0, reads: 5 }) === true && puts === 1, puts);
U.note('voice'); U.addWorkerReads(3);
check('a second flush within 10 minutes waits (no KV write)', await U.flush(env, { now: t0 + 60e3 }) === false && puts === 1, puts);
let tot = await U.readsTotal(env, t0);
check('…but what waits in memory is already in the totals', tot.worker === 8, tot);
check('after 10 minutes it writes', await U.flush(env, { now: t0 + 11 * 60e3 }) === true && puts === 2, puts);
check('nothing new → no write even after 10 minutes', await U.flush(env, { now: t0 + 30 * 60e3 }) === false && puts === 2);
let f = await U.features(env, t0);
const fm = Object.fromEntries(f.today.map(x => [x.name, x.n]));
check('feature counts: names cleaned, biggest first', f.today[0].name === 'cmd:portfolio' && fm['cmd:portfolio'] === 2 && fm['btn:pf'] === 1 && fm.voice === 1 && fm.badname === 1, f.today);
check('feature names longer than 24 letters are cut, never stored whole', !f.today.some(x => x.name.length > 24));

// the app: each device sends its whole day's count — the biggest is kept per device, devices add up
U.noteApp('UID', { [day]: 400 }, { 'page:index': 3 }, 'dev1');
U.noteApp('UID', { [day]: 350 }, null, 'dev1');            // an older report from the same device → not lower
U.noteApp('UID', { [day]: 100, '2020-01-01': 999 }, null, 'dev2');
U.noteApp('UID', { [day]: 'lots' }, { '<b>': 9 }, 'BAD DEV');
await U.flush(env, { now: t0 + 50 * 60e3 });
tot = await U.readsTotal(env, t0);
check('app reads: biggest per device, devices added (400 + 100)', tot.app === 500, tot);
f = await U.features(env, t0);
check('app screens counted as app:page:…', f.today.some(x => x.name === 'app:page:index' && x.n === 3), f.today);

// the round's per-member reads (idle.mjs) now use the Pacific day too, and are part of the total
await I.addReads(env, { '1': 1000, '2': 200 }, t0);
tot = await U.readsTotal(env, t0);
check('total = round + bot + app', tot.round === 1200 && tot.total === 1200 + 8 + 500 && tot.limit === 50000, tot);
check('readsToday (dashboard per member) reads the same Pacific day', (await I.readsToday(env, t0))['1'] === 1000);

// ⚠️ alerts: under 60% nothing; 60% once; still 60% → not again; 80% once more
const sent = []; const send = async text => { sent.push(text); return { ok: true }; };
let r = await U.readsAlert(env, send, 'ar', t0);
check('under 60% → no message', !r.sent && sent.length === 0, r);
await I.addReads(env, { '1': 29000 }, t0);
r = await U.readsAlert(env, send, 'ar', t0);
check('60% → one message, in Arabic, with the parts', r.sent && r.level === 60 && sent.length === 1 && /قراءات Firebase وصلت 6\d%/.test(sent[0]) && sent[0].includes('11:00'), sent);
r = await U.readsAlert(env, send, 'ar', t0 + 5 * 60e3);
check('still 60% → not sent again', !r.sent && sent.length === 1);
await I.addReads(env, { '2': 10000 }, t0);
r = await U.readsAlert(env, send, 'en', t0);
check('80% → one more message', r.sent && r.level === 80 && sent.length === 2 && /at 8\d% of today/.test(sent[1]), sent[1]);
r = await U.readsAlert(env, send, 'en', t0);
check('80% again → nothing', !r.sent && sent.length === 2);
const fails = async () => ({ ok: false });
store.delete('tg:rdalert:' + day);
r = await U.readsAlert(env, fails, 'en', t0);
check('Telegram failed → not marked sent (tries again next round)', !r.sent && !store.has('tg:rdalert:' + day));
check('FS_READ_LIMIT can change the allowance', (await U.readsTotal({ ...env, FS_READ_LIMIT: '100000' }, t0)).limit === 100000);

// the bot's names for what was used
check('featureOf: command, button, voice, text', B.featureOf({ text: '/Market 7d' }) === 'cmd:market' && B.featureOf(null, { data: 'us:m:5' }) === 'btn:us' && B.featureOf({ voice: {} }) === 'voice' && B.featureOf({ text: 'btc' }) === 'text');

console.log(`usage_test: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
