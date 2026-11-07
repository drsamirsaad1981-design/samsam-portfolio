// Telegram alerts (tools/alerts-core.mjs): the numbers, each alert once, quiet hours, the brief / weekly timing,
// English + Arabic, and text Telegram accepts (HTML with only <b> <i> <code>, every & < > escaped).
import { summarize, evaluate, settings, priceSeries, brief } from '../tools/alerts-core.mjs';
import { signalFor, strengthMap } from '../samsam-core.js';
let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' -> ' + JSON.stringify(d).slice(0, 300))); };
const H = 3600e3, DAY = 24 * H;
const T0 = Date.parse('2026-11-07T05:40:00Z');   // 08:40 in Riyadh, a Saturday
const ser = (id, now, price, p24, p7) => { const n = 24 * 8, t0 = now - (n - 1) * H, p = Array.from({ length: n }, (_, i) => i === n - 1 ? price : i === n - 25 ? p24 : i === n - 1 - 24 * 7 ? p7 : price); return { id, t0, step: H, p }; };
function mk({ now = T0, btc = 80000, sei = 0.05, link = 20, fng = 50, alt = 50, dom = 59, ethbtc = 0.03, etfBtc = -100e6 } = {}) {
  const series = { bitcoin: priceSeries(ser('bitcoin', now, btc, btc / 1.02, btc / 1.05)), sei: priceSeries(ser('sei', now, sei, sei / 1.04, sei)), chainlink: priceSeries(ser('chainlink', now, link, link, link)) };
  return { top: [{ id: 'bitcoin', sym: 'BTC', price: btc, ch24: 2, ch7: 5 }], top500: [], series, cgIds: { BTC: 'bitcoin', SEI: 'sei', LINK: 'chainlink' },
    global: { dom: { btc: dom, usdt: 6.5 } }, fng: { value: fng, label: fng <= 20 ? 'Extreme Fear' : 'Neutral', prev: 50 }, alt: { value: alt, label: 'Leaning Altcoins' },
    altPage: { ethbtc: [[1, ethbtc]] }, etf: { updated: new Date(now).toISOString(), btc: { days: [['2026-11-05', etfBtc, 0, 9e10, 0]] }, eth: { days: [['2026-11-05', -50e6, 0, 1e10, 0]] } },
    parts: { top: new Date(now - 600e3).toISOString() }, priceT: now - 1800e3, btc: { price: btc, ch24: 2 } };
}
const user = (meta = {}) => ({
  coins: [{ sym: 'BTC', cgId: 'bitcoin', opening: { qty: 0.1, avg: 70000 } }, { sym: 'SEI', opening: { qty: 5000, avg: 0.06 } }, { sym: 'LINK', cgId: 'chainlink', opening: { qty: 10, avg: 15 } }],
  txs: [], accum: [{ sym: 'SEI', targetQty: 6000 }, { sym: 'LINK', targetQty: 10 }],
  meta: { baseline: { btcPrice: 70000 }, exitPlan: [{ sym: 'LINK', tps: [{ price: 25, pct: 25, lock: true }, { price: 0, pct: 50, lock: false }, { price: 0, pct: 25, lock: false }] }], ...meta },
});
const okHtml = t => !/&(?!amp;|lt;|gt;)/.test(t) && !/<(?!\/?(b|i|code)>)/.test(t);
const cfg = settings({});

// the numbers
const s = summarize(user(), mk(), T0);
check('value = 0.1 BTC × 80k + 5000 SEI × 0.05 + 10 LINK × 20', Math.abs(s.value - (8000 + 250 + 200)) < 1e-6, s.value);
check('profit = value − cost (7000 + 300 + 150)', Math.abs(s.total - (8450 - 7450)) < 1e-6, s.total);
check('24h change of what you hold (BTC +2%, SEI +4%)', Math.abs(s.d24 - (8000 - 8000 / 1.02 + 250 - 250 / 1.04)) < 1e-6, s.d24);
check('signals: BTC Hold, SEI −16.7% Reinforce, LINK +33% Hold', s.signal.BTC === 'hold' && s.signal.SEI === 'reinforce' && s.signal.LINK === 'hold', s.signal);
check('plan: LINK met, SEI 5000/6000', s.prog.completed === 1 && Math.abs(s.prog.pct - (100 + 5000 / 6000 * 100) / 2) < 1e-9, s.prog);
check('take-profit levels: LINK TP1 $25 (fixed), TP2 = 3× avg $45', s.tps.find(x => x.n === 1).level === 25 && s.tps.find(x => x.n === 2).level === 45, s.tps);

// first run: the welcome + brief, nothing else (everything else just remembered)
let r = evaluate(s, mk(), {}, cfg, T0);
check('first run: one message — the welcome + morning brief', r.messages.length === 1 && r.messages[0].key === 'brief' && /Alerts are on/.test(r.messages[0].text), r.messages.map(m => m.key));
check('first run remembers signals, plan, exits', r.state.sig.SEI === 'reinforce' && r.state.plan.LINK === 1 && r.state.briefDay === '2026-11-07', r.state);
const b = r.messages[0].text;
check('brief has value, profit, vs BTC, movers, market, signals, plan', ['$8,450.00', 'All Time Profit', 'vs holding BTC', 'Best today', 'Market', 'Fear &amp; Greed', 'ETF flows', 'Signals', 'Plan'].every(x => b.includes(x)), b);
check('brief: Telegram-safe HTML', okHtml(b), b.match(/&(?!amp;|lt;|gt;)|<(?!\/?(b|i|code)>)[^>]*>/g));
check('brief buttons open the app', r.messages[0].buttons.flat().every(x => x.url.startsWith('https://drsamirsaad1981-design.github.io/samsam-portfolio/')));
let st = r.state;

// 30 min later, nothing new → silence; the brief isn't repeated
r = evaluate(s, mk({ now: T0 + 1800e3 }), st, cfg, T0 + 1800e3);
check('nothing new → no message', r.messages.length === 0, r.messages.map(m => m.key)); st = r.state;

// BTC +6% → one move alert, then silence at the same price
const t2 = T0 + 2 * H, m2 = mk({ now: t2, btc: 84800 }), s2 = summarize(user(), m2, t2);
r = evaluate(s2, m2, st, cfg, t2);
const mv = r.messages.find(x => x.key === 'move-btc');
check('BTC +6% → a move alert', mv && /BTC \+6\.0%/.test(mv.text) && okHtml(mv.text), r.messages.map(m => m.key)); st = r.state;
r = evaluate(s2, m2, st, cfg, t2 + 1800e3);
check('same price later → not again', !r.messages.some(x => x.key === 'move-btc')); st = r.state;

// SEI falls under −20% → signal change Reinforce → Sell / Convert, with a button to the coin
const t3 = t2 + H, m3 = mk({ now: t3, btc: 84800, sei: 0.045 }), s3 = summarize(user(), m3, t3);
r = evaluate(s3, m3, st, cfg, t3);
const sg = r.messages.find(x => x.key === 'sig-SEI');
check('SEI Reinforce → Sell / Convert alert', sg && /Reinforce → <b>Sell \/ Convert to BTC<\/b>/.test(sg.text) && sg.buttons[0][0].url.endsWith('#holdings/SEI'), sg); st = r.state;
r = evaluate(s3, m3, st, cfg, t3 + 1800e3);
check('…only once', !r.messages.some(x => x.key === 'sig-SEI')); st = r.state;

// LINK reaches TP1 $25 → take-profit alert once; macro: BTC.D under your 45.9 → exit level alert
const t4 = t3 + H, m4 = mk({ now: t4, btc: 84800, sei: 0.045, link: 25.5, dom: 45 }), s4 = summarize(user(), m4, t4);
r = evaluate(s4, m4, st, cfg, t4);
check('LINK ≥ TP1 → take-profit alert with your 25%', r.messages.some(x => x.key === 'tp-LINK:1' && /25%/.test(x.text)), r.messages.map(m => m.key));
check('BTC dominance 45% ≤ 45.9% → exit level alert (1 of 3)', r.messages.some(x => x.key === 'macro-btcD' && /1 of 3/.test(x.text)), r.messages.map(m => m.key)); st = r.state;

// SEI target reached (a buy) → plan alert
const u5 = user(); u5.txs = [{ id: 'x', sym: 'SEI', type: 'buy', qty: 1500, price: 0.045, date: new Date(t4).toISOString() }];
const s5 = summarize(u5, m4, t4 + 1800e3);
r = evaluate(s5, m4, st, cfg, t4 + 1800e3);
check('SEI 6500/6000 → plan target alert', r.messages.some(x => x.key === 'plan-SEI' && /6500 \/ 6000 SEI/.test(x.text)), r.messages.map(m => [m.key, m.text])); st = r.state;

// Extreme Fear, Altcoin Season, a big ETF day
const t6 = t4 + 2 * H, m6 = mk({ now: t6, btc: 84800, sei: 0.045, link: 25.5, dom: 45, fng: 15, alt: 80, etfBtc: -900e6 });
m6.etf.btc.days[0][0] = '2026-11-06';
r = evaluate(summarize(u5, m6, t6), m6, st, cfg, t6);
const keys = r.messages.map(x => x.key);
check('Extreme Fear, Altcoin Season, big ETF day alerts', keys.includes('fng') && keys.includes('season') && keys.includes('etf'), keys); st = r.state;

// quiet hours: 01:00 Riyadh — a signal change waits, a huge move (≥ 2× your %) still comes
const tq = Date.parse('2026-11-07T22:00:00Z'), mq = mk({ now: tq, btc: 84800, sei: 0.06, link: 25.5, dom: 45, fng: 15, alt: 80 });
mq.etf.btc.days[0][0] = '2026-11-06';
r = evaluate(summarize(u5, mq, tq), mq, st, cfg, tq);
check('quiet hours: the signal change waits', !r.messages.some(x => x.key.startsWith('sig-')) && r.state.sig.SEI === st.sig.SEI, r.messages.map(m => m.key));
const tw = Date.parse('2026-11-08T04:10:00Z'), mw = mk({ now: tw, btc: 84800, sei: 0.06, link: 25.5, dom: 45, fng: 15, alt: 80 }); mw.etf.btc.days[0][0] = '2026-11-06';
r = evaluate(summarize(u5, mw, tw), mw, r.state, cfg, tw);
check('07:10 → the held signal change is sent', r.messages.some(x => x.key === 'sig-SEI'), r.messages.map(m => m.key));
const mh = mk({ now: tq, btc: 95000, sei: 0.06, link: 25.5, dom: 45, fng: 15, alt: 80 }); mh.etf.btc.days[0][0] = '2026-11-06';
r = evaluate(summarize(u5, mh, tq), mh, st, cfg, tq);
check('quiet hours: BTC +12% (≥ 2× 5%) still alerts', r.messages.some(x => x.key === 'move-btc' && x.urgent), r.messages.map(m => m.key));

// brief: once a day, at your time; weekly on Friday
const fri = Date.parse('2026-11-13T06:10:00Z');   // Friday 09:10 Riyadh
r = evaluate(s, mk({ now: fri }), { ...st, briefDay: '2026-11-12' }, cfg, fri);
check('Friday 09:10 → morning brief + weekly report', r.messages.some(x => x.key === 'brief') && r.messages.some(x => x.key === 'weekly' && /Weekly report/.test(x.text)), r.messages.map(m => m.key));
const early = Date.parse('2026-11-13T04:00:00Z');   // 07:00 — before 08:30
r = evaluate(s, mk({ now: early }), { ...st, briefDay: '2026-11-12' }, cfg, early);
check('07:00 → no brief yet', !r.messages.some(x => x.key === 'brief'));

// switched off in the settings → silent
r = evaluate(s3, m3, { ...st, sig: { ...st.sig, SEI: 'hold' } }, settings({ alerts: { signals: false } }), t3);
check('signals switched off → no signal alert', !r.messages.some(x => x.key.startsWith('sig-')));

// Arabic
const ar = settings({ alerts: { lang: 'ar' } });
const ba = brief(s, mk(), ar, T0).text;
check('Arabic brief: Arabic words, Latin numbers, safe HTML', /ملخص الصباح/.test(ba) && /إجمالي الربح/.test(ba) && /\$8,450\.00/.test(ba) && okHtml(ba), ba);
r = evaluate(s3, m3, { ...st, sig: { ...st.sig, SEI: 'reinforce' } }, ar, t3);
check('Arabic signal alert', r.messages.some(x => x.key === 'sig-SEI' && /تغيّر الإشارة/.test(x.text) && /بيع \/ تحويل لـ BTC/.test(x.text)), r.messages.map(m => m.text));

// data health: market file 5 h old → one warning a day
const mo = mk({ now: T0 + 3 * H }); mo.parts.top = new Date(T0 - 2 * H).toISOString();
r = evaluate(s, mo, st, cfg, T0 + 3 * H);
check('market data 5 h old → a data warning', r.messages.some(x => x.key === 'health-market' && /5 h/.test(x.text)), r.messages.map(m => m.key));
r = evaluate(s, mo, r.state, cfg, T0 + 3.5 * H);
check('…once that day', !r.messages.some(x => x.key === 'health-market'));

// Smart signal (samsam-core.js → signalFor), the same in the app and here
const R = { reinforce: -5, sell: -20 };
check('smart: Reinforce on a coin behind BTC on 30d and 90d → Hold (weak)', (x => x.action === 'hold' && x.base === 'reinforce' && x.why === 'weak')(signalFor({ sym: 'SEI', chg: -10, rules: R, rs: { d30: -20, d90: -30 } })));
check('smart: Sell / Convert on a coin ahead of BTC on both → Hold (strong)', (x => x.action === 'hold' && x.base === 'convert' && x.why === 'strong')(signalFor({ sym: 'SEI', chg: -25, rules: R, rs: { d30: 5, d90: 2 } })));
check('smart: Sell / Convert on a weak coin → stays, confirmed', (x => x.action === 'convert' && x.why === 'confirmed')(signalFor({ sym: 'SEI', chg: -25, rules: R, rs: { d30: -20, d90: -30 } })));
check('smart: mixed (30d behind, 90d ahead) → the classic signal', signalFor({ sym: 'SEI', chg: -10, rules: R, rs: { d30: -20, d90: 5 } }).action === 'reinforce');
check('smart: no 30 / 90-day data → the classic signal', signalFor({ sym: 'SEI', chg: -10, rules: R, rs: null }).action === 'reinforce');
check('smart off → the classic signal', signalFor({ sym: 'SEI', chg: -10, rules: R, rs: { d30: -20, d90: -30 }, smart: false }).action === 'reinforce');
check('BTC is always Hold', signalFor({ sym: 'BTC', chg: -40, rules: R, rs: { d30: -50, d90: -50 } }).action === 'hold');
const sm = strengthMap({ btc: [1, -10, 20], coins: [{ id: 'sei', p: [0, -30, -5] }], mine: { kava: [0, 5, 30] } });
check('strength map: points vs BTC from the Altcoin Season file', sm.sei.d30 === -20 && sm.sei.d90 === -25 && sm.kava.d30 === 15 && sm.kava.d90 === 10, sm);
// in the alerts: SEI −16.7% (Reinforce) but far behind BTC → Hold, with the reason in the alert
const mS = mk(); mS.altPage = { ethbtc: [[1, 0.03]], btc: [0, 0, 0], coins: [{ id: 'sei', p: [0, -30, -40] }] };
const sS = summarize(user(), mS, T0);
check('alerts use Smart: SEI Reinforce → Hold (behind BTC)', sS.signal.SEI === 'hold' && sS.coins.find(c => c.sym === 'SEI').why === 'weak', sS.signal);
const r1 = evaluate(summarize(user(), mk(), T0), mk(), {}, cfg, T0).state;
const r2 = evaluate(sS, mS, { ...r1, sigMode: r1.sigMode }, cfg, T0 + 1800e3);
check('signal turned by Smart → a signal alert with the vs BTC points', r2.messages.some(x => x.key === 'sig-SEI' && /vs BTC −30 pts \(30d\)/.test(x.text) && /Smart: not adding/.test(x.text)), r2.messages.map(m => m.text));
const u3 = user({ signal: { reinforce: -2, sell: -30 } });
const r3 = evaluate(summarize(u3, mk(), T0), mk(), r1, cfg, T0 + 1800e3);
check('you change the thresholds → no flood of signal alerts (memory starts again)', !r3.messages.some(x => x.key.startsWith('sig-')) && r3.state.sigMode !== r1.sigMode, r3.messages.map(m => m.key));

// target allocation: off-band group → one alert with what to do; the brief shows how many are on target
const uT = user({ targets: { list: [{ g: 'btc', pct: 60, label: 'Bitcoin' }, { g: 'other', pct: 40, label: 'Other' }], band: 5, names: [{ g: 'other', label: 'Other' }] } });
const sT = summarize(uT, mk(), T0);
check('allocation: Bitcoin 94.7% vs 60% target → off', sT.alloc && sT.alloc.groups.find(g => g.key === 'btc').state === 'off' && sT.alloc.onTarget === 0, sT.alloc);
const fT = evaluate(sT, mk(), {}, cfg, T0);
check('first run: no drift alert, just remembered; the brief has the Allocation line', !fT.messages.some(x => x.key.startsWith('drift-')) && /Allocation<\/b>  0 of 2 categories on target/.test(fT.messages[0].text), fT.messages[0].text);
const st2 = { ...fT.state, drift: {} };
const dT = evaluate(sT, mk(), st2, cfg, T0 + 1800e3);
const dm = dT.messages.find(x => x.key === 'drift-btc');
check('Bitcoin outside the band → "Allocation off target", how much, Open Allocation', dm && /Allocation off target · Bitcoin/.test(dm.text) && /trim about \$2,930/.test(dm.text) && dm.buttons[0][0].url.endsWith('#allocation') && okHtml(dm.text), dT.messages.map(m => m.text));
check('…and Other (below target): "add about"', dT.messages.some(x => x.key === 'drift-other' && /add about \$2,930/.test(x.text)));
const again = evaluate(sT, mk(), dT.state, cfg, T0 + 3600e3);
check('…once', !again.messages.some(x => x.key.startsWith('drift-')));
const uT2 = user({ targets: { list: [{ g: 'btc', pct: 90, label: 'Bitcoin' }, { g: 'other', pct: 10, label: 'Other' }], band: 5 } });
const nT = evaluate(summarize(uT2, mk(), T0), mk(), again.state, cfg, T0 + 5400e3);
check('new targets → memory starts again silently', !nT.messages.some(x => x.key.startsWith('drift-')) && nT.state.allocKey !== again.state.allocKey);

// DCA: a weekly Saturday buy of SEI ($100) — reminder on the day (at the brief time), a nudge 2 days late, nothing once bought
const uD = user(); uD.accum = [{ sym: 'SEI', targetQty: 6000, dca: { usd: 100, every: 'week', day: 6, since: '2026-10-01' } }, { sym: 'LINK', targetQty: 10 }];
const sD = summarize(uD, mk(), T0);
check('DCA status: Saturday = today, not bought', sD.dca.length === 1 && sD.dca[0].s.state === 'today' && sD.dca[0].s.last === '2026-11-07', sD.dca);
const fD = evaluate(sD, mk(), {}, cfg, T0);
check('first run: no DCA message, the brief has the DCA line', !fD.messages.some(x => x.key.startsWith('dca-')) && /🛒 <b>DCA<\/b>  1 regular buy · \$433\/mo/.test(fD.messages[0].text), fD.messages[0].text.slice(-300));
const dD = evaluate(sD, mk(), { ...fD.state, dcaDay: {} }, cfg, T0);
const dm2 = dD.messages.find(x => x.key === 'dca-day');
check('buy day → "DCA day" with SEI $100 and a button to the plan', dm2 && /SEI  <b>\$100<\/b>/.test(dm2.text) && dm2.buttons[0][0].url.endsWith('accumulation.html') && okHtml(dm2.text), dD.messages.map(m => m.key));
check('…once that day', !evaluate(sD, mk(), dD.state, cfg, T0 + 1800e3).messages.some(x => x.key === 'dca-day'));
const earlyD = Date.parse('2026-11-07T04:00:00Z');   // 07:00 in Riyadh — before the 08:30 brief time
check('before the brief time → not yet', !evaluate(summarize(uD, mk({ now: earlyD }), earlyD), mk({ now: earlyD }), { ...fD.state, dcaDay: {} }, cfg, earlyD).messages.some(x => x.key === 'dca-day'));
const mon = Date.parse('2026-11-09T06:00:00Z'), sM = summarize(uD, mk({ now: mon }), mon);
const lD = evaluate(sM, mk({ now: mon }), dD.state, cfg, mon);
check('Monday, not bought (2 days late) → one DCA reminder', sM.dca[0].s.state === 'missed' && lD.messages.some(x => x.key === 'dca-late' && /was due Nov 7 \(2 days ago\)/.test(x.text)), [sM.dca[0].s, lD.messages.map(m => m.key)]);
check('…once', !evaluate(sM, mk({ now: mon }), lD.state, cfg, mon + 1800e3).messages.some(x => x.key === 'dca-late'));
const uB = user(); uB.accum = uD.accum; uB.txs = [{ id: 'b1', sym: 'SEI', type: 'buy', qty: 2000, price: 0.05, date: '2026-11-07T09:00:00Z' }];
const sB = summarize(uB, mk({ now: mon }), mon);
check('bought on Saturday → done, no reminder', sB.dca[0].s.state === 'done' && !evaluate(sB, mk({ now: mon }), dD.state, cfg, mon).messages.some(x => x.key.startsWith('dca-')), sB.dca[0].s);
check('DCA reminders switched off → nothing', !evaluate(sD, mk(), { ...fD.state, dcaDay: {} }, settings({ alerts: { dca: false } }), T0).messages.some(x => x.key.startsWith('dca-')));

// buy-price alerts: the alert price on a plan coin (owned or not), once, again after 3% back above, DCA day noted, Arabic, off switch
const uBP = user(); uBP.accum = [{ sym: 'SEI', targetQty: 6000, alertPrice: 0.055, dca: { usd: 100, every: 'week', day: 6, since: '2026-10-01' } },
  { sym: 'DOT', cgId: 'polkadot', targetQty: 100, alertPrice: 5 }, { sym: 'LINK', targetQty: 10, alertPrice: 10 }];
const mBP = (sei = 0.05) => { const m = mk({ sei }); m.top.push({ id: 'polkadot', sym: 'DOT', price: 4, ch24: 0, ch7: 0 }); return m; };
const sBP = summarize(uBP, mBP(), T0);
check('buy levels: SEI 0.05 vs 0.055, DOT (not owned) 4 vs 5, LINK 20 vs 10', sBP.buyAt.length === 3 && sBP.buyAt.find(x => x.sym === 'DOT').price === 4 && sBP.buyAt.find(x => x.sym === 'SEI').left === 1000, sBP.buyAt);
const fBP = evaluate(sBP, mBP(), null, cfg, T0);
check('first run: no buy-price message (no burst on the first run)', !fBP.messages.some(x => x.key.startsWith('buy-')));
const eBP = evaluate(sBP, mBP(), { ...fBP.state, buy: {} }, cfg, T0);
const bSP = eBP.messages.find(x => x.key === 'buy-SEI:0.055'), bDP = eBP.messages.find(x => x.key === 'buy-DOT:5');
check('SEI and DOT at / under their alert → one message each, LINK (20 > 10) none', bSP && bDP && !eBP.messages.some(x => x.key.startsWith('buy-LINK')), eBP.messages.map(x => x.key));
check('the message: price ≤ alert, still to buy for the plan, DCA day noted, plan + coin buttons', /SEI reached your buy price/.test(bSP.text) && /Price \$0\.05\d* ≤ your alert \$0\.055/.test(bSP.text) && /Still to buy for the plan: 1000 SEI/.test(bSP.text) && /DCA/.test(bSP.text) && bSP.buttons[0].length === 2 && !/DCA/.test(bDP.text), bSP.text);
check('…not again while it stays there', !evaluate(sBP, mBP(), eBP.state, cfg, T0 + 1800e3).messages.some(x => x.key.startsWith('buy-SEI')));
const up = evaluate(summarize(uBP, mBP(0.0575), T0), mBP(0.0575), eBP.state, cfg, T0 + 3600e3);
check('3% back above → re-armed', !up.state.buy['SEI:0.055']);
check('…drops again → a new message', evaluate(sBP, mBP(), up.state, cfg, T0 + 7200e3).messages.some(x => x.key === 'buy-SEI:0.055'));
const arBP = evaluate(sBP, mBP(), { ...fBP.state, buy: {} }, settings({ alerts: { lang: 'ar' } }), T0).messages.find(x => x.key === 'buy-SEI:0.055');
check('Arabic', arBP && /وصلت لسعر الشراء/.test(arBP.text) && /المتبقي للخطة/.test(arBP.text), arBP && arBP.text);
check('switched off → nothing', !evaluate(sBP, mBP(), { ...fBP.state, buy: {} }, settings({ alerts: { buy: false } }), T0).messages.some(x => x.key.startsWith('buy-')));
check('a new alert price → a new alert (old one forgotten)', (() => { const u2 = JSON.parse(JSON.stringify(uBP)); u2.accum[0].alertPrice = 0.052; const r = evaluate(summarize(u2, mBP(), T0), mBP(), eBP.state, cfg, T0 + 900e3); return r.messages.some(x => x.key === 'buy-SEI:0.052') && !r.state.buy['SEI:0.055']; })());

// every message ever made here is Telegram-safe
const all = [b, ba, mv.text, sg.text, bSP.text, bDP.text, arBP.text];
check('all texts Telegram-safe', all.every(okHtml));
console.log(`${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
