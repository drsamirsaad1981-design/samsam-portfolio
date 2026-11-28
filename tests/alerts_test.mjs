// Telegram alerts (tools/alerts-core.mjs): the numbers, each alert once, quiet hours, the brief / weekly timing,
// English + Arabic, and text Telegram accepts (HTML with only <b> <i> <code>, every & < > escaped).
import { summarize, evaluate, settings, priceSeries, brief, combine, NOW_KEYS, rainbowLines, macroLines, pct, W, exitGroups } from '../tools/alerts-core.mjs';
import { signalFor, strengthMap } from '../samsam-core.js';
import * as C from '../samsam-core.js';
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
const cfg = settings({ alerts: { digest: false } });   // (each alert at once: the digest has its own checks below)

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

// 🔔 the digest (on by default): what can wait is held and sent together at 12:00 · 16:00 · 20:00
{
  const dg = settings({}), d0 = evaluate(s, mk(), {}, dg, T0).state;
  let d = evaluate(s2, m2, d0, dg, t2);   // 10:40 — BTC +6%
  check('digest: BTC +6% at 10:40 → no message yet, held for the next slot', !d.messages.length && d.state.held.some(x => x.key === 'move-btc'), [d.messages.map(x => x.key), d.state.held.map(x => x.key)]);
  const nHeld = d.state.held.length;
  d = evaluate(s2, m2, d.state, dg, t2 + 1800e3);
  check('…still quiet at 11:10 (held once, not twice)', !d.messages.length && d.state.held.length === nHeld, d.state.held.map(x => x.key));
  const tn = T0 + 3.5 * H, mn = mk({ now: tn, btc: 84800 }); d = evaluate(summarize(user(), mn, tn), mn, d.state, dg, tn);   // 12:10
  const dm = d.messages.find(x => x.key === 'digest');
  check('…12:10 → ONE "Portfolio digest · 12:00" with the BTC move inside, nothing left held', d.messages.length === 1 && dm && /Portfolio digest<\/b> · 12:00/.test(dm.text) && /BTC \+6\.0%/.test(dm.text) && okHtml(dm.text) && !d.state.held.length, d.messages.map(x => x.key));
  { // held in Arabic, then the language changed → two digests, each in ONE language, the same button once
    const dAr = settings({ alerts: { lang: 'ar' } }), a0 = evaluate(s, mk(), {}, dAr, T0).state, a1 = evaluate(s2, m2, a0, dAr, t2).state;
    const mix = { ...a1, held: a1.held.concat({ key: 'x-en', text: '🔻 <b>Your portfolio −6.8% in 24h</b>', buttons: [[{ text: 'Open portfolio', url: a1.held[0].buttons ? a1.held[0].buttons[0][0].url : 'https://x/' }]], lang: 'en' }) };
    const dd = evaluate(summarize(user(), mn, tn), mn, mix, settings({}), tn).messages.filter(x => x.key.startsWith('digest'));
    const hasAr = x => /[\u0600-\u06FF]/.test(x.text);
    check('digest after a language change: one message per language (never a mixed one)', dd.length === 2 && dd.filter(hasAr).length === 1 && /ملخص المحفظة/.test(dd.find(hasAr).text) && /Portfolio digest/.test(dd.find(x => !hasAr(x)).text) && /Your portfolio/.test(dd.find(x => !hasAr(x)).text), dd.map(x => x.text.slice(0, 80)));
    const one = evaluate(summarize(user(), mn, tn), mn, { ...a1, held: [{ key: 'a', text: 'A', buttons: [[{ text: 'افتح المحفظة', url: 'https://x/p' }]], lang: 'en' }, { key: 'b', text: 'B', buttons: [[{ text: 'Open portfolio', url: 'https://x/p' }]], lang: 'en' }] }, settings({}), tn).messages.find(x => x.key === 'digest');
    check('digest buttons: the same target once, whatever its label', one && one.buttons[0].length === 1, one && one.buttons);
  }
  d = evaluate(summarize(user(), mn, tn), mn, d.state, dg, tn + 1800e3);
  check('…12:40 → nothing (the slot went)', !d.messages.length, d.messages.map(x => x.key));
  const t16 = T0 + 7.5 * H, m16 = mk({ now: t16, btc: 84800 }); d = evaluate(summarize(user(), m16, t16), m16, d.state, dg, t16);
  check('…16:10 with nothing held → no empty digest', !d.messages.length, d.messages.map(x => x.key));
  const tb = t16 + H, mb = mk({ now: tb, btc: 97000 }); d = evaluate(summarize(user(), mb, tb), mb, d.state, dg, tb);   // +14% from 84,800: twice the threshold
  check('…a violent move (≥ 2× your %) is not held — sent at once', d.messages.some(x => x.key === 'move-btc') && !(d.state.held || []).length, [d.messages.map(x => x.key), d.state.held]);
  check('…sent at once whatever the hour: a buy price, a take-profit, the exit conditions, the signals, DCA', ['buy-SOL', 'tp-LINK-1', 'macro-btcD', 'sig-day', 'dca-day'].every(k => NOW_KEYS.test(k)) && !['move-btc', 'plan-LINK', 'fng', 'season', 'etf', 'drift', 'health-top'].some(k => NOW_KEYS.test(k)));
}

// SEI falls under −20% → signal change Reinforce → Sell / Convert, with a button to the coin
const t3 = t2 + H, m3 = mk({ now: t3, btc: 84800, sei: 0.045 }), s3 = summarize(user(), m3, t3);
r = evaluate(s3, m3, st, cfg, t3);
const sg = r.messages.find(x => x.key === 'sig-day');
check('SEI Reinforce → Sell / Convert alert (one message for the day\'s changes, decided on the close, not advice)', sg && /SEI<\/b>  Reinforce → <b>Sell \/ Convert to BTC<\/b>/.test(sg.text) && /daily close/.test(sg.text) && /Not financial advice/.test(sg.text) && sg.buttons[0][0].url.endsWith('#holdings/SEI'), sg); st = r.state;
r = evaluate(s3, m3, st, cfg, t3 + 1800e3);
check('…only once', !r.messages.some(x => x.key === 'sig-day')); st = r.state;

// LINK reaches TP1 $25 → take-profit alert once; macro: BTC.D under your 45.9 → exit level alert
const t4 = t3 + H, m4 = mk({ now: t4, btc: 84800, sei: 0.045, link: 25.5, dom: 45 }), s4 = summarize(user(), m4, t4);
r = evaluate(s4, m4, st, cfg, t4);
check('LINK ≥ TP1 → take-profit alert with your 25%', r.messages.some(x => x.key === 'tp-LINK:1' && /25%/.test(x.text)), r.messages.map(m => m.key));
check('BTC dominance 45% ≤ 45.9% → exit level alert, with the two groups counted apart (market structure 1/3 · Bitcoin valuation 0/3)', r.messages.some(x => x.key === 'macro-btcD' && /\nMarket structure 1\/3 · Bitcoin valuation 0\/3$/.test(x.text)), r.messages.map(m => m.key)); st = r.state;

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
check('07:10 → the held signal change is sent', r.messages.some(x => x.key === 'sig-day'), r.messages.map(m => m.key));
const mh = mk({ now: tq, btc: 95000, sei: 0.06, link: 25.5, dom: 45, fng: 15, alt: 80 }); mh.etf.btc.days[0][0] = '2026-11-06';
r = evaluate(summarize(u5, mh, tq), mh, st, cfg, tq);
check('quiet hours: BTC +12% (≥ 2× 5%) still alerts', r.messages.some(x => x.key === 'move-btc' && x.urgent), r.messages.map(m => m.key));

// brief: once a day, at your time; weekly on Friday
const fri = Date.parse('2026-11-13T06:10:00Z');   // Friday 09:10 Riyadh
r = evaluate(s, mk({ now: fri }), { ...st, briefDay: '2026-11-12' }, cfg, fri);
check('Friday 09:10 → morning brief + weekly report', r.messages.some(x => x.key === 'brief') && r.messages.some(x => x.key === 'weekly' && /Weekly report/.test(x.text)), r.messages.map(m => m.key));
// weekly: rewards & mining of the last 7 days (staking Reward + mined BTC), not older ones, not the daily brief
const uf = user(); uf.txs = [
  { id: 'r1', sym: 'LINK', type: 'transfer_in', qty: 0.5, price: 0, kind: 'reward', date: '2026-11-10T08:00:00Z' },
  { id: 'r2', sym: 'BTC', type: 'transfer_in', qty: 0.001, price: 0, note: 'Mined BTC sent to your wallet (cost $0)', date: '2026-11-11T08:00:00Z' },
  { id: 'r3', sym: 'LINK', type: 'transfer_in', qty: 9, price: 0, kind: 'reward', date: '2026-10-01T08:00:00Z' },
  { id: 'r4', sym: 'SEI', type: 'transfer_in', qty: 100, price: 0.05, date: '2026-11-11T09:00:00Z' }];
const sf = summarize(uf, mk({ now: fri }), fri);
check('summary: rewards & mining this week = LINK +0.5, BTC +0.001 (not the old one, not a paid Transfer In)', sf.free.length === 2 && sf.free.some(f => f.sym === 'LINK' && f.qty === 0.5) && sf.free.some(f => f.sym === 'BTC' && f.qty === 0.001), sf.free);
r = evaluate(sf, mk({ now: fri }), { ...st, briefDay: '2026-11-12' }, cfg, fri);
const wk = r.messages.find(x => x.key === 'weekly'), bf = r.messages.find(x => x.key === 'brief');
check('weekly report: "🎁 Rewards & mining this week +… BTC · +0.5 LINK (≈ $…)"', wk && /🎁 <b>Rewards &amp; mining this week<\/b>|🎁 <b>Rewards & mining this week<\/b>/.test(wk.text) && /\+0\.5 LINK/.test(wk.text) && /\+0\.001 BTC/.test(wk.text) && okHtml(wk.text), wk && wk.text);
check('…not in the daily brief', bf && !/🎁/.test(bf.text));
const rar = evaluate(sf, mk({ now: fri }), { ...st, briefDay: '2026-11-12' }, settings({ alerts: { digest: false, lang: 'ar' } }), fri).messages.find(x => x.key === 'weekly');
check('weekly report in Arabic: "المكافآت والتعدين هذا الأسبوع"', rar && rar.text.includes('المكافآت والتعدين هذا الأسبوع'));
const early = Date.parse('2026-11-13T04:00:00Z');   // 07:00 — before 08:30
r = evaluate(s, mk({ now: early }), { ...st, briefDay: '2026-11-12' }, cfg, early);
check('07:00 → no brief yet', !r.messages.some(x => x.key === 'brief'));

// switched off in the settings → silent
r = evaluate(s3, m3, { ...st, sig: { ...st.sig, SEI: 'hold' } }, settings({ alerts: { digest: false, signals: false } }), t3);
check('signals switched off → no signal alert', !r.messages.some(x => x.key.startsWith('sig-')));

// Arabic
const ar = settings({ alerts: { digest: false, lang: 'ar' } });
const ba = brief(s, mk(), ar, T0).text;
check('Arabic brief: Arabic words, Latin numbers, safe HTML', /ملخص الصباح/.test(ba) && /إجمالي الربح/.test(ba) && /\$8,450\.00/.test(ba) && okHtml(ba), ba);
r = evaluate(s3, m3, { ...st, sig: { ...st.sig, SEI: 'reinforce' } }, ar, t3);
check('Arabic signal alert', r.messages.some(x => x.key === 'sig-day' && /تأكدت على قفلة اليوم/.test(x.text) && /بيع \/ تحويل إلى BTC/.test(x.text)), r.messages.map(m => m.text));

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
check('calm off (the default): a falling coin still gets Reinforce', signalFor({ sym: 'SEI', chg: -10, rules: R, rs: { d30: 0, d90: 0, c7: -12 } }).action === 'reinforce');
check('calm on: Reinforce on a coin down more than 5% in 7 days → Hold (falling)', (x => x.action === 'hold' && x.base === 'reinforce' && x.why === 'falling')(signalFor({ sym: 'SEI', chg: -10, rules: R, rs: { d30: 0, d90: 0, c7: -5.1 }, calm: true })));
check('calm on: a steady coin (−5% or better in 7 days) keeps Reinforce', signalFor({ sym: 'SEI', chg: -10, rules: R, rs: { d30: 0, d90: 0, c7: -5 }, calm: true }).action === 'reinforce' && signalFor({ sym: 'SEI', chg: -10, rules: R, rs: { d30: 0, d90: 0, c7: 3 }, calm: true }).action === 'reinforce');
check('calm on: Sell / Convert is untouched', signalFor({ sym: 'SEI', chg: -25, rules: R, rs: { d30: -1, d90: -1, c7: -30 }, calm: true }).action === 'convert');
check('calm on: no 7-day data → the usual signal', signalFor({ sym: 'SEI', chg: -10, rules: R, rs: { d30: 0, d90: 0 }, calm: true }).action === 'reinforce' && signalFor({ sym: 'SEI', chg: -10, rules: R, rs: null, calm: true }).action === 'reinforce');
check('calm on, Smart off: still waits on a falling coin', signalFor({ sym: 'SEI', chg: -10, rules: R, rs: { d30: 0, d90: 0, c7: -9 }, smart: false, calm: true }).why === 'falling');
check('calm + Smart: a weak coin keeps the Smart reason', signalFor({ sym: 'SEI', chg: -10, rules: R, rs: { d30: -20, d90: -30, c7: -9 }, calm: true }).why === 'weak');
check('BTC is always Hold', signalFor({ sym: 'BTC', chg: -40, rules: R, rs: { d30: -50, d90: -50 } }).action === 'hold');
const sm = strengthMap({ btc: [1, -10, 20], coins: [{ id: 'sei', p: [0, -30, -5] }], mine: { kava: [0, 5, 30] } });
{ // ⏳ decided on the close: the map uses the changes as of the last daily close when the file has them, not the moving ones
  const live = { btc: [1, -10, 20], coins: [{ id: 'sei', p: [-5.5, -30, -5] }], mine: { kava: [0, 5, 30] } };
  const cm = strengthMap({ ...live, closed: { day: 1, btc: [0, -8, 18], p: { sei: [-4.9, -20, -2], kava: [1, 2, 20] } } });
  check('strength map: as of the daily close when the file has it (a 7-day change hovering at −5% no longer flips the signal)', cm.sei.c7 === -4.9 && cm.sei.d30 === -12 && cm.sei.d90 === -20 && cm.kava.d30 === 10 && cm.__btc.c30 === -8, cm);
  check('strength map: an old file (no close) → the live numbers', strengthMap(live).sei.c7 === -5.5 && strengthMap({ ...live, closed: null }).sei.d30 === -20);
}
check('strength map: carries the coin\'s own 7-day change', strengthMap({ btc: [1, -10, 20], coins: [{ id: 'sei', p: [-7.5, -30, -5] }] }).sei.c7 === -7.5);
check('strength map: points vs BTC from the Altcoin Season file', sm.sei.d30 === -20 && sm.sei.d90 === -25 && sm.kava.d30 === 15 && sm.kava.d90 === 10, sm);
// in the alerts: SEI −16.7% (Reinforce) but far behind BTC → Hold, with the reason in the alert
const mS = mk(); mS.altPage = { ethbtc: [[1, 0.03]], btc: [0, 0, 0], coins: [{ id: 'sei', p: [0, -30, -40] }] };
const sS = summarize(user(), mS, T0);
check('alerts use Smart: SEI Reinforce → Hold (behind BTC)', sS.signal.SEI === 'hold' && sS.coins.find(c => c.sym === 'SEI').why === 'weak', sS.signal);
const r1 = evaluate(summarize(user(), mk(), T0), mk(), {}, cfg, T0).state;
const r2 = evaluate(sS, mS, { ...r1, sigMode: r1.sigMode }, cfg, T0 + 1800e3);
check('signal turned by Smart → a signal alert with the vs BTC points', r2.messages.some(x => x.key === 'sig-day' && /vs BTC −30 pts \(30d\)/.test(x.text) && /Smart: not adding/.test(x.text)), r2.messages.map(m => m.text));
// 🌙 Calm mode (meta.signalCalm, off unless switched on): Reinforce waits while the coin is down 5%+ over 7 days
const mC = mk(); mC.altPage = { ethbtc: [[1, 0.03]], btc: [0, 0, 0], coins: [{ id: 'sei', p: [-12, 0, 0] }] };
const mC0 = mk(); mC0.altPage = { ethbtc: [[1, 0.03]], btc: [0, 0, 0], coins: [{ id: 'sei', p: [1, 0, 0] }] };
const uC = user({ signalCalm: true });
check('calm is off by default: the falling SEI stays Reinforce', summarize(user(), mC, T0).signal.SEI === 'reinforce', summarize(user(), mC, T0).signal);
const sC = summarize(uC, mC, T0);
check('calm on: SEI Reinforce → Hold (falling); a steady week keeps Reinforce', sC.signal.SEI === 'hold' && sC.coins.find(c => c.sym === 'SEI').why === 'falling' && summarize(uC, mC0, T0).signal.SEI === 'reinforce', sC.signal);
check('calm changes the signal mode (so switching it never floods alerts)', sC.sigMode !== summarize(user(), mC, T0).sigMode && summarize(user(), mk(), T0).sigMode === r1.sigMode);
const rc1 = evaluate(summarize(uC, mC0, T0), mC0, {}, cfg, T0).state;
const rc2 = evaluate(sC, mC, rc1, cfg, T0 + 1800e3);
check('signal turned by Calm mode → the alert says why', rc2.messages.some(x => x.key === 'sig-day' && /Calm mode: not adding yet, −12\.0% in 7 days/.test(x.text)), rc2.messages.map(m => m.text));
const rc3 = evaluate(summarize(uC, mC, T0), mC, rc1, { ...cfg, lang: 'ar' }, T0 + 1800e3);
check('… and in Arabic', rc3.messages.some(x => x.key === 'sig-day' && /الوضع الهادئ: لا تعزيز الآن، −12\.0% في 7 أيام/.test(x.text)), rc3.messages.map(m => m.text));
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
check('DCA reminders switched off → nothing', !evaluate(sD, mk(), { ...fD.state, dcaDay: {} }, settings({ alerts: { digest: false, dca: false } }), T0).messages.some(x => x.key.startsWith('dca-')));

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
const arBP = evaluate(sBP, mBP(), { ...fBP.state, buy: {} }, settings({ alerts: { digest: false, lang: 'ar' } }), T0).messages.find(x => x.key === 'buy-SEI:0.055');
check('Arabic', arBP && /وصلت لسعر الشراء/.test(arBP.text) && /المتبقي للخطة/.test(arBP.text), arBP && arBP.text);
check('switched off → nothing', !evaluate(sBP, mBP(), { ...fBP.state, buy: {} }, settings({ alerts: { digest: false, buy: false } }), T0).messages.some(x => x.key.startsWith('buy-')));
check('a new alert price → a new alert (old one forgotten)', (() => { const u2 = JSON.parse(JSON.stringify(uBP)); u2.accum[0].alertPrice = 0.052; const r = evaluate(summarize(u2, mBP(), T0), mBP(), eBP.state, cfg, T0 + 900e3); return r.messages.some(x => x.key === 'buy-SEI:0.052') && !r.state.buy['SEI:0.055']; })());

// ⏳ decided on the daily close: SEI's live price 25% under its average, but its close at the average → still Reinforce?
{ const mc = mk({ now: t3, btc: 84800, sei: 0.045 }), avg = summarize(user(), mc, t3).coins.find(c => c.sym === 'SEI').avg;
  mc.close = { sei: avg };   // (the test market's id for SEI)
  const sc = summarize(user(), mc, t3), row = sc.coins.find(c => c.sym === 'SEI');
  check('⏳ a wick 25% under the average with the close at it → the Signal on the close (Hold), "pending: sell" is noted', sc.signal.SEI === 'hold' && sc.pending.SEI === 'sell' && row.pending === 'sell' && Math.abs(row.chgClose) < 1e-6, [sc.signal.SEI, sc.pending, row.chgClose]);
  mc.close = null; const sl = summarize(user(), mc, t3);
  check('⏳ …no close file → the live price decides (as before)', sl.signal.SEI === 'sell' && !sl.pending.SEI, [sl.signal.SEI, sl.pending]); }
// 🔔 one message per run: the alerts of a run put together, the morning brief on its own
{ const c = combine([{ key: 'brief', text: '☀️ brief' }, { key: 'move-btc', text: 'A', buttons: [[{ text: 'Open', url: 'u1' }]] }, { key: 'tp-LINK:1', text: 'B', buttons: [[{ text: 'Open', url: 'u1' }, { text: 'Plan', url: 'u2' }]] }]);
  check('🔔 combine: brief stays on its own; the other alerts become one message with both texts and no button twice', c.length === 2 && c[0].key === 'brief' && /A[\s\S]*━[\s\S]*B/.test(c[1].text) && c[1].buttons.flat().map(b => b.text).join() === 'Open,Plan', c);
  check('🔔 combine: a single alert is sent as it is', combine([{ key: 'x', text: 'only' }]).length === 1 && combine([{ key: 'x', text: 'only' }])[0].key === 'x'); }
// every message ever made here is Telegram-safe
const all = [b, ba, mv.text, sg.text, bSP.text, bDP.text, arBP.text];
check('all texts Telegram-safe', all.every(okHtml));
// 🌐 Arabic alerts: Arabic units, dates and button names (no "2h", no "Nov 6", no "Market Hub")
{
  const { arCount, AR_DAYS, AR_HOURS, localL } = await import('../tools/alerts-core.mjs');
  check('Arabic counts: يوم واحد · يومين · 5 أيام · 12 يوماً · ساعتين · 5 ساعات', [1, 2, 5, 12].map(n => arCount(n, AR_DAYS)).join('|') === 'يوم واحد|يومين|5 أيام|12 يوماً' && arCount(2, AR_HOURS) === 'ساعتين' && arCount(5, AR_HOURS) === '5 ساعات');
  check('a date in an Arabic message: "7 نوفمبر" with Latin digits (and English stays "7 Nov")', /^7 نوفمبر/.test(localL(T0, { day: 'numeric', month: 'short' }, true)) && /7 Nov/.test(localL(T0, { day: 'numeric', month: 'short' }, false)), localL(T0, { day: 'numeric', month: 'short' }, true));
  const arCfg = settings({ alerts: { lang: 'ar', digest: false } }), a0 = evaluate(s, mk(), {}, arCfg, T0).state;
  const mvA = evaluate(s2, m2, a0, arCfg, t2).messages.find(x => x.key === 'move-btc');
  check('Arabic BTC move: "خلال ساعتين" (not "2h"), the button "مركز السوق" (not "Market Hub")', mvA && /خلال ساعتين/.test(mvA.text) && !/\dh\b/.test(mvA.text) && mvA.buttons.flat().some(b => b.text === 'مركز السوق') && !mvA.buttons.flat().some(b => /Market Hub/.test(b.text)), mvA && [mvA.text, mvA.buttons.flat().map(b => b.text)]);
}

// 🌈 the Bitcoin rainbow: a line in the weekly report, an alert when the band that holds changes (two daily closes), the
// exit band you chose as the 4th exit condition. The file's maths has its own test (rainbow_test.mjs); here: the messages.
{
  const RBF = { a: -16.1839, b: 5.5943, lo: -0.746, hi: 1.216, share: [0.8, 11.8, 33.5, 24.8, 14.5, 9.8, 2.8, 1.7, 0.2], to: '2026-11-01' }, W9 = (RBF.hi - RBF.lo) / 9;
  // the file as it stands on the morning of `now`: one band per close (the last one = yesterday's), the band that holds
  const rbFile = (now, bands, held, since) => { const today = Math.floor(now / DAY); return { v: 1, fit: RBF, held: { band: held, since },
    closes: bands.map((b, i) => { const d = today - (bands.length - i); return [C.rainbowIso(d), C.rainbowLine(RBF, d) * 10 ** (RBF.lo + (b - 0.5) * W9)]; }) }; };
  const withRb = (now, bands, held, since, o = {}) => { const m = mk({ now, ...o }); m.rainbow = rbFile(now, bands, held, since); const mid = m.rainbow.closes.at(-1)[1]; m.btc = { price: mid, ch24: 0 }; return m; };
  const D0 = Date.parse('2026-11-10T06:00:00Z');   // 09:00 in Riyadh, a Tuesday
  const run = (m, st, now, c = cfg, meta = {}) => evaluate(summarize(user(meta), m, now), m, st, c, now);
  let m = withRb(D0, [2, 2, 2], 2, '2026-10-20'), s0 = summarize(user(), m, D0);
  check('🌈 the exit conditions come in two groups: market structure (3) and Bitcoin valuation — the rainbow band against band 6 until you choose, then the Pi Cycle, then MVRV', s0.macro.map(x => x.k + ':' + x.g).join() === 'btcD:s,usdtD:s,ethBtc:s,rainbow:v,pi:v,mvrv:v' && s0.macro[3].now === 2 && s0.macro[3].lvl === 6 && s0.macro[3].met === false, s0.macro);
  check('🌈 your own band is read from the Exit page\'s targets (1–9)', summarize(user({ exitTargets: { rainbow: 4 } }), m, D0).macro[3].lvl === 4 && summarize(user({ exitTargets: { rainbow: 40 } }), m, D0).macro[3].lvl === 9 && summarize(user({ exitTargets: { rainbow: 'x' } }), m, D0).macro[3].lvl === 6);
  // an account that already had alerts: the band is remembered quietly, nothing is sent
  let base = evaluate(s0, mk({ now: D0 }), {}, cfg, D0).state;   // (a state from before the rainbow existed)
  let q = run(m, base, D0 + H);
  check('🌈 the first time the band is seen: remembered, no message', !q.messages.some(x => /^rb-/.test(x.key)) && q.state.rb.b === 2 && q.state.rb.d === '2026-10-20', q.messages.map(x => x.key));
  let stR = q.state;
  // one close in band 3: pending — nothing sent, the line says one more close confirms
  m = withRb(D0 + DAY, [2, 2, 3], 2, '2026-10-20'); q = run(m, stR, D0 + DAY);
  check('🌈 one close in the next band: no alert', !q.messages.some(x => /^rb-/.test(x.key)) && q.state.rb.b === 2, q.messages.map(x => x.key)); stR = q.state;
  const ln = rainbowLines(W.en, m, D0 + DAY), lnA = rainbowLines(W.ar, m, D0 + DAY);
  check('🌈 the line: band, name, percent against the line — and the pending close', ln.length === 3 && ln[0] === '🌈 Bitcoin rainbow  <b>band 2 of 9</b>' && /^Deep discount · −\d+% vs the line$/.test(ln[1]) && ln[2] === '<i>Last close: band 3 · one more confirms</i>', ln);
  check('🌈 the Arabic line starts with Arabic words and names the band in Arabic', lnA[0] === '🌈 قوس قزح البيتكوين: <b>النطاق 2 من 9</b>' && /^خصم عميق · أقل من الخط بـ \d+%$/.test(lnA[1]) && lnA[2] === '<i>آخر إغلاق: النطاق 3 · إغلاق آخر يؤكده</i>', lnA);
  // the second close in band 3: the alert, at once (not held for the digest), once
  m = withRb(D0 + 2 * DAY, [2, 3, 3], 3, '2026-11-10'); q = run(m, stR, D0 + 2 * DAY, settings({ alerts: { digest: true } }));
  const up = q.messages.find(x => x.key === 'rb-3'), eod = C.rainbowRead(m.rainbow, D0 + 2 * DAY);
  check('🌈 two closes in band 3 → one alert, sent at once', !!up && NOW_KEYS.test('rb-3') && !(q.state.held || []).some(x => /^rb-/.test(x.key)), q.messages.map(x => x.key));
  check('🌈 the alert: up to band 3 and its name, the close against the line, the band\'s edges, what it was before and since when', up && /^🌈 <b>Bitcoin moved up to band 3 of 9 · Accumulation zone<\/b>\n/.test(up.text) && up.text.includes(`Close $${Math.round(eod.close).toLocaleString('en-US')} · `) && /% under the trend line \(\$[\d,]+\)\n/.test(up.text)
    && up.text.includes(`Band 3: $${Math.round(eod.lo).toLocaleString('en-US')} – $${Math.round(eod.hi).toLocaleString('en-US')}`) && /Before: band 2 · Deep discount since 20 Oct\n/.test(up.text) && /<i>Counted after two daily closes in the new band\. It describes the past; it is not a forecast\.<\/i>$/.test(up.text) && okHtml(up.text), up && up.text);
  check('🌈 the alert opens the Market Hub at the rainbow; no word telling you to buy or sell', up && up.buttons.flat().some(b => /market\.html#rainbow$/.test(b.url || '')) && !/\b(buy|sell)\b/i.test(up.text), up && up.buttons);
  check('🌈 the new band is remembered with its first day', q.state.rb.b === 3 && q.state.rb.d === '2026-11-10'); stR = q.state;
  q = run(m, stR, D0 + 2 * DAY + H); check('🌈 the same band an hour later: nothing again', !q.messages.some(x => /^rb-/.test(x.key))); stR = q.state;
  // back down, in Arabic
  const arC = settings({ alerts: { lang: 'ar', digest: false } });
  m = withRb(D0 + 5 * DAY, [3, 2, 2], 2, '2026-11-13'); q = run(m, stR, D0 + 5 * DAY, arC);
  const dn = q.messages.find(x => x.key === 'rb-2');
  check('🌈 Arabic, down: "نزل إلى النطاق 2 من 9 · خصم عميق", the edges "من … إلى …", "قبلها: النطاق 3 · منطقة تجميع منذ 10 نوفمبر"', dn && /^🌈 <b>البيتكوين نزل إلى النطاق 2 من 9 · خصم عميق<\/b>\n/.test(dn.text) && /\nالإغلاق \$[\d,]+ · تحت خط الاتجاه بـ \d+% \(\$[\d,]+\)\n/.test(dn.text) && /\nحدود النطاق 2: من \$[\d,]+ إلى \$[\d,]+\n/.test(dn.text) && /\nقبلها: النطاق 3 · منطقة تجميع منذ 10 نوفمبر\n/.test(dn.text) && /وصف للماضي، وليس توقعاً/.test(dn.text) && dn.buttons.flat().some(b => b.text === 'مركز السوق') && okHtml(dn.text), dn && dn.text);
  // 03:10 in Riyadh (the close has just come): kept for after 07:00, then sent
  const N3 = Date.parse('2026-11-20T00:10:00Z'); m = withRb(N3, [2, 3, 3], 3, '2026-11-18'); q = run(m, q.state, N3);
  check('🌈 quiet hours (03:10 Riyadh): not sent, not forgotten', !q.messages.some(x => /^rb-/.test(x.key)) && q.state.rb.b === 2, q.messages.map(x => x.key));
  m = withRb(N3 + 4 * H, [2, 3, 3], 3, '2026-11-18'); q = run(m, q.state, N3 + 4 * H);
  check('🌈 …and it comes after 07:00', q.messages.some(x => x.key === 'rb-3') && q.state.rb.b === 3, q.messages.map(x => x.key));
  // the exit band you chose (3 here): the same message says so — no second "exit level" message
  const X0 = Date.parse('2026-12-01T06:00:00Z'), ex = { exitTargets: { rainbow: 3 } };
  let sx = run(withRb(X0, [2, 2, 2], 2, '2026-11-25'), run(withRb(X0 - DAY, [2, 2, 2], 2, '2026-11-25'), {}, X0 - DAY, cfg, ex).state, X0, cfg, ex).state;
  m = withRb(X0 + DAY, [2, 3, 3], 3, '2026-11-30'); q = run(m, sx, X0 + DAY, cfg, ex);
  const hit = q.messages.find(x => x.key === 'rb-3');
  check('🌈 the move reaches your exit band: one message with "Your exit band (3) is reached" and the two counts, and the Exit page\'s button', hit && /\n🧭 <b>Your exit band \(3\) is reached<\/b>\nMarket structure 0\/3 · Bitcoin valuation 1\/3\n/.test(hit.text) && hit.buttons.flat().length === 2 && !q.messages.some(x => x.key === 'macro-rainbow') && q.state.macro.rainbow === 1, q.messages.map(x => [x.key, x.text]));
  q = run(m, q.state, X0 + DAY + H, cfg, ex); check('🌈 …and no exit-level message for it an hour later', !q.messages.some(x => /rainbow|^rb-/.test(x.key)));
  // the rainbow alert switched off: the band is followed quietly; your exit band still alerts, as an exit level
  const off = settings({ alerts: { digest: false, rainbow: false } });
  q = run(m, sx, X0 + DAY, off, ex);
  const mx = q.messages.find(x => x.key === 'macro-rainbow');
  check('🌈 switched off: no band message, the exit band still alerts as an exit level', !q.messages.some(x => /^rb-/.test(x.key)) && q.state.rb.b === 3 && mx && /Exit level reached · Rainbow band<\/b>\nband 3 of 9 · Accumulation zone · 3 ≥ 3\nMarket structure 0\/3 · Bitcoin valuation 1\/3$/.test(mx.text), q.messages.map(x => [x.key, x.text]));
  // an old file (the job stopped): nothing is said, nothing counts as met
  const old = withRb(X0 + DAY, [2, 3, 3], 3, '2026-11-30'), late = X0 + 6 * DAY; const mo = mk({ now: late }); mo.rainbow = old.rainbow;
  q = run(mo, sx, late, cfg, ex);
  check('🌈 a file over 4 days old: no line, no alert, the exit band not met', rainbowLines(W.en, mo, late).length === 0 && !q.messages.some(x => /rainbow|^rb-/.test(x.key)) && summarize(user(ex), mo, late).macro[3].now === null && q.state.rb.b === 2);
  check('🌈 no file at all: no line, the fourth condition waits', rainbowLines(W.en, mk({ now: D0 }), D0).length === 0 && summarize(user(), mk({ now: D0 }), D0).macro[3].met === false);
  // Pi Cycle: the second reading of the Bitcoin valuation group — your level (100 = the cross), its own alert, off until you turn it on
  {
    const piM = (now, ratio) => { const f = withRb(now, [2, 2, 2], 2, '2026-10-20'); f.rainbow.pi = { day: f.rainbow.closes.at(-1)[0], ratio, d111: 70000, d350x2: 70000 / ratio * 100, peaks: [[2021, 101.9, '2021-04-12'], [2025, 78.4, '2025-01-21']], crosses: ['2021-04-12'] }; f.rainbow.w200 = { ma: 48000, day: '2026-11-08', under: { days: 310, pct: 6.8, last: '2023-03-12' } }; return f; };
    const P0 = Date.parse('2026-12-10T06:00:00Z'), lv = { exitTargets: { pi: 95 } }, onC = settings({ alerts: { digest: false, pi: true } });
    const sp = summarize(user(), piM(P0, 61.37), P0).macro[4];
    check('Pi Cycle: read from the file, against 100 (the cross) until you choose', sp.k === 'pi' && sp.g === 'v' && sp.now === 61.37 && sp.lvl === 100 && sp.met === false && summarize(user(lv), piM(P0, 96), P0).macro[4].lvl === 95 && summarize(user(lv), piM(P0, 96), P0).macro[4].met === true && summarize(user({ exitTargets: { pi: 400 } }), piM(P0, 96), P0).macro[4].lvl === 100, sp);
    check('Pi Cycle: no file → the row waits', summarize(user(), mk({ now: P0 }), P0).macro[4].now === null && summarize(user(), mk({ now: P0 }), P0).macro[4].met === false);
    check('the alert switch is off until you turn it on', settings({}).pi === false && settings({ alerts: { pi: true } }).pi === true);
    const b0 = run(piM(P0, 90), run(piM(P0 - DAY, 90), {}, P0 - DAY, cfg, lv).state, P0, cfg, lv).state;
    let q = run(piM(P0 + DAY, 96.2), b0, P0 + DAY, cfg, lv);
    check('Pi Cycle reaches your level with its switch off: no message (the other exit alerts stay on), remembered quietly', !q.messages.some(x => x.key === 'macro-pi') && q.state.macro.pi === 1, q.messages.map(x => x.key));
    q = run(piM(P0 + DAY, 96.2), b0, P0 + DAY, onC, lv);
    const pm = q.messages.find(x => x.key === 'macro-pi');
    check('…switched on: one message — what it measures, your level, the two counts', pm && /^🧭 <b>Exit level reached · Pi Cycle<\/b>\nThe 111-day average is 96\.2% of twice the 350-day one · your level 95%\nMarket structure 0\/3 · Bitcoin valuation 1\/3$/.test(pm.text) && okHtml(pm.text) && NOW_KEYS.test('macro-pi'), pm && pm.text);
    let stP = q.state; q = run(piM(P0 + 2 * DAY, 96.5), stP, P0 + 2 * DAY, onC, lv);
    check('…once', !q.messages.some(x => x.key === 'macro-pi')); stP = q.state;
    q = run(piM(P0 + 3 * DAY, 94.1), stP, P0 + 3 * DAY, onC, lv); stP = q.state; q = run(piM(P0 + 4 * DAY, 95.3), stP, P0 + 4 * DAY, onC, lv);
    check('…a dip of under 2 points and back sends nothing again', !q.messages.some(x => x.key === 'macro-pi'), q.messages.map(x => x.key)); stP = q.state;
    q = run(piM(P0 + 5 * DAY, 92), stP, P0 + 5 * DAY, onC, lv); stP = q.state; q = run(piM(P0 + 6 * DAY, 95.4), stP, P0 + 6 * DAY, onC, lv);
    check('…after a fall of 2 points under your level, reaching it again alerts again', q.messages.some(x => x.key === 'macro-pi'), q.messages.map(x => x.key));
    const arP = run(piM(P0 + DAY, 96.2), b0, P0 + DAY, settings({ alerts: { lang: 'ar', digest: false, pi: true } }), lv).messages.find(x => x.key === 'macro-pi');
    check('…in Arabic', arP && /^🧭 <b>تحقق مستوى خروج · مؤشر Pi Cycle<\/b>\nمتوسط 111 يوماً يساوي 96\.2% من ضعف متوسط 350 يوماً · مستواك 95%\nهيكل السوق 0 من 3 · تقييم البيتكوين 1 من 3$/.test(arP.text), arP && arP.text);
    // every condition of both groups met: "your exit zone"
    const allM = piM(P0 + DAY, 96.2); allM.global.dom = { btc: 40, usdt: 3 }; allM.altPage = { ethbtc: [[1, 0.09]] }; allM.rainbow.held.band = 7; allM.rainbow.closes = rbFile(P0 + DAY, [7, 7, 7], 7, '2026-11-01').closes; allM.mvrv = { v: 1, day: new Date(P0).toISOString().slice(0, 10), now: 3.2, realized: 30000, src: 'Coin Metrics' };
    const sa = summarize(user(lv), allM, P0 + DAY), ea = exitGroups(sa);
    check('both groups full → "every exit condition is met"', ea.all && ea.s.join() === '3,3' && ea.v.join() === '3,3' && /🧭 Every exit condition is met — your exit zone/.test(brief(sa, allM, cfg, P0 + DAY, false).text), ea);
    check('the morning brief counts the groups apart', /🧭 Market structure 0\/3 · Bitcoin valuation 1\/3/.test(brief(summarize(user(lv), piM(P0, 96), P0), piM(P0, 96), cfg, P0, false).text) && !/🧭/.test(brief(summarize(user(lv), piM(P0, 60), P0), piM(P0, 60), cfg, P0, false).text));
  }
  // MVRV: the third reading of the Bitcoin valuation group — Coin Metrics' daily ratio against your level (3.0 until you
  // choose), its own alert, off until you turn it on; the message names the source
  {
    const M0 = Date.parse('2026-12-10T06:00:00Z'), day = t => new Date(t - DAY).toISOString().slice(0, 10);
    const mvM = (now, v) => { const f = withRb(now, [2, 2, 2], 2, '2026-10-20'); f.mvrv = { v: 1, day: day(now), now: v, price: 60000, realized: Math.round(60000 / v), peaks: [[2021, 3.96, '2021-02-21'], [2024, 2.74, '2024-11-21']], src: 'Coin Metrics' }; return f; };
    const lv = { exitTargets: { mvrv: 2.5 } }, onC = settings({ alerts: { digest: false, mvrv: true } }), x0 = summarize(user(), mvM(M0, 1.14), M0).macro[5];
    check('MVRV: read from the snapshot, against 3.0 until you choose (1 … 10, else 3.0)', x0.k === 'mvrv' && x0.g === 'v' && x0.now === 1.14 && x0.lvl === 3 && x0.met === false && summarize(user(lv), mvM(M0, 2.6), M0).macro[5].lvl === 2.5 && summarize(user(lv), mvM(M0, 2.6), M0).macro[5].met === true && summarize(user({ exitTargets: { mvrv: 40 } }), mvM(M0, 2.6), M0).macro[5].lvl === 3, x0);
    check('MVRV: no part, or a ratio five days old → the row waits (never a stale number)', summarize(user(), mk({ now: M0 }), M0).macro[5].now === null && summarize(user(lv), mvM(M0 - 6 * DAY, 2.9), M0).macro[5].now === null && summarize(user(lv), mvM(M0 - 6 * DAY, 2.9), M0).macro[5].met === false);
    check('MVRV: the alert switch is off until you turn it on', settings({}).mvrv === false && settings({ alerts: { mvrv: true } }).mvrv === true);
    const b0 = run(mvM(M0, 2.3), run(mvM(M0 - DAY, 2.3), {}, M0 - DAY, cfg, lv).state, M0, cfg, lv).state;
    let q = run(mvM(M0 + DAY, 2.55), b0, M0 + DAY, cfg, lv);
    check('MVRV reaches your level with its switch off: no message, remembered quietly', !q.messages.some(x => x.key === 'macro-mvrv') && q.state.macro.mvrv === 1, q.messages.map(x => x.key));
    q = run(mvM(M0 + DAY, 2.55), b0, M0 + DAY, onC, lv); const mm = q.messages.find(x => x.key === 'macro-mvrv');
    check('…switched on: one message — the ratio, your level, the market\'s average cost, the source, the two counts', mm && /^🧭 <b>Exit level reached · MVRV<\/b>\nMarket value ÷ realized value: 2\.55 · your level 2\.50\nBitcoin's realized market cost: \$23,529\n<i>Source: Coin Metrics<\/i>\nMarket structure 0\/3 · Bitcoin valuation 1\/3$/.test(mm.text) && okHtml(mm.text) && NOW_KEYS.test('macro-mvrv'), mm && mm.text);
    const q2 = run(mvM(M0 + 2 * DAY, 2.45), q.state, M0 + 2 * DAY, onC, lv), q3 = run(mvM(M0 + 3 * DAY, 2.52), q2.state, M0 + 3 * DAY, onC, lv);
    check('…a dip of less than 0.1 under the level and back: no second message', !q2.messages.some(x => x.key === 'macro-mvrv') && !q3.messages.some(x => x.key === 'macro-mvrv'), [q2.state.macro, q3.messages.map(x => x.key)]);
    const q4 = run(mvM(M0 + 4 * DAY, 2.35), q3.state, M0 + 4 * DAY, onC, lv), q5 = run(mvM(M0 + 5 * DAY, 2.6), q4.state, M0 + 5 * DAY, onC, lv);
    check('…after a fall of 0.1 under it, the next reach alerts again', !q4.state.macro.mvrv && q5.messages.some(x => x.key === 'macro-mvrv'), q5.messages.map(x => x.key));
    const arM = run(mvM(M0 + DAY, 2.55), b0, M0 + DAY, settings({ alerts: { lang: 'ar', digest: false, mvrv: true } }), lv).messages.find(x => x.key === 'macro-mvrv');
    check('…in Arabic, with the source', arM && /^🧭 <b>تحقق مستوى خروج · مؤشر MVRV<\/b>\nالقيمة السوقية ÷ القيمة المحققة: 2\.55 · مستواك 2\.50\nمتوسط تكلفة البيتكوين المحققة للسوق: \$23,529\n<i>المصدر: Coin Metrics<\/i>\nهيكل السوق 0 من 3 · تقييم البيتكوين 1 من 3$/.test(arM.text), arM && arM.text);
  }
  // 💵 the dollar index and ⚖️ BTC funding in /market: the number, the state, and what the mix is made of
  {
    const T0 = Date.parse('2026-11-27T13:20:00Z'), at = new Date(T0 - 20 * 60e3).toISOString(), plain = x => x.replace(/<[^>]+>/g, '');
    const fm = (rate, missing = ['Binance', 'Bybit'], n = 5) => ({ v: 1, rate, m7: 0.002, oi: 9.3e9, n, venues: [{ k: 'OKX', rate, oi: 2e9 }], missing, at });
    const f = mk({ now: T0 }); f.dxy = { v: 1, price: 103.872, ch24: 0.19, ch7: -0.03, lo52: 96.22, hi52: 104.32, at, src: 'Yahoo Finance (DX-Y.NYB)' }; f.funding = fm(0.0044);
    const en = macroLines(W.en, f, T0), ar = macroLines(W.ar, f, T0);
    check('💵 the dollar index: the number and the day\'s change', en[0] === '💵 Dollar index  <b>103.87</b> 🟢 +0.19%' && /^مؤشر الدولار: <b>103\.87<\/b> 🟢 \+0\.19%$/.test(ar[0]), [en[0], ar[0]]);
    check('⚖️ BTC funding: the rate and its state, then per 8 h, how many venues, and the big ones that are NOT in it', en[1] === '⚖️ BTC funding <b>+0.0044%</b> · calm' && en[2] === '<i>per 8 h · 5 venues · no Binance, Bybit</i>' && ar[1] === 'تمويل البيتكوين: <b>+0.0044%</b> · هادئ' && ar[2] === '<i>5 منصات بدون Binance و Bybit · لكل 8س</i>', [en, ar]);
    f.funding = fm(0.0061, ['Bybit'], 6);
    check('…when Binance joins through the relay the note changes by itself', macroLines(W.en, f, T0)[2] === '<i>per 8 h · 6 venues · no Bybit</i>' && macroLines(W.ar, f, T0)[2] === '<i>6 منصات بدون Bybit · لكل 8س</i>', macroLines(W.en, f, T0));
    f.funding = fm(-0.0123, [], 7);
    check('…nobody missing: no "no …"; a negative rate keeps its sign and its word', macroLines(W.en, f, T0)[1] === '⚖️ BTC funding <b>−0.0123%</b> · crowded shorts' && macroLines(W.en, f, T0)[2] === '<i>per 8 h · 7 venues</i>' && macroLines(W.ar, f, T0)[2] === '<i>7 منصات · لكل 8س</i>', macroLines(W.ar, f, T0));
    let worst = 0, which = ''; for (const lang of ['en', 'ar']) for (const rate of [0.1234, 0.0123, 0.0044, -0.0044, -0.1234]) { f.funding = fm(rate); f.dxy.ch24 = -1.23; f.dxy.price = 103.872; for (const l of macroLines(W[lang], f, T0)) { const k = [...plain(l)].length; if (k > worst) { worst = k; which = l; } } }
    check(`…every line fits a phone in every state and both languages (longest ${worst} ≤ 40)`, worst <= 40 && macroLines(W.en, f, T0).every(okHtml), which);
    check('…a funding part over 6 hours old, or a dollar quote over 5 days old, is not shown', macroLines(W.en, f, T0 + 7 * 36e5).length === 1 && macroLines(W.en, f, T0 + 6 * DAY).length === 0 && macroLines(W.en, mk({ now: T0 }), T0).length === 0);
    { // 🪙 the dollar-pegged supply: after the dollar and funding lines; hidden when the part is old or missing
      const g = mk({ now: T0 }), day = new Date(T0).toISOString().slice(0, 10), part = (total, d7, d30) => ({ v: 1, day, total, tot: Array.from({ length: 31 }, (_, i) => i === 0 ? total - d30 : i === 23 ? total - d7 : i === 30 ? total : null), y1: null, top: [], src: 'DefiLlama' });
      g.dxy = f.dxy; g.funding = fm(0.0044); g.stables = part(281.57e9, -1.25e9, -16.38e9);
      const en = macroLines(W.en, g, T0), ar = macroLines(W.ar, g, T0);
      check('🪙 stablecoin supply in /market: the total with its source, then the net change of 7 and 30 days — after the dollar and funding lines', en.length === 5 && en[3] === '🪙 Stablecoins <b>$281.57B</b> · DefiLlama' && en[4] === '<i>7 days −$1.25B · 30 days −$16.38B</i>' && /^💵/.test(en[0]) && /^⚖️/.test(en[1]), en);
      check('…Arabic: each line opens with an Arabic word (never a digit)', ar[3] === 'العملات المستقرة: <b>$281.57B</b> · DefiLlama' && ar[4] === '<i>آخر 7 أيام −$1.25B · 30 يوماً −$16.38B</i>', ar);
      g.stables = part(1281.57e9, 250e6, 0.4e6); const sm = macroLines(W.en, g, T0);
      check('…a rise has its plus, under a billion it is in millions, and a change that rounds to nothing has no sign', sm[3] === '🪙 Stablecoins <b>$1281.57B</b> · DefiLlama' && sm[4] === '<i>7 days +$250M · 30 days $0M</i>', sm);
      let w2 = 0, wl = ''; for (const lang of ['en', 'ar']) for (const [tt, a, b] of [[1281.57e9, -116.38e9, -216.38e9], [281.57e9, -1.25e9, -16.38e9], [99e9, 999e6, -999e6]]) { g.stables = part(tt, a, b); for (const l of macroLines(W[lang], g, T0).slice(3)) { const k = [...plain(l)].length; if (k > w2) { w2 = k; wl = l; } } }
      check(`…both lines fit a phone in both languages, even with a trillion and hundred-billion moves (longest ${w2} ≤ 40)`, w2 <= 40 && macroLines(W.ar, g, T0).every(okHtml), wl);
      g.stables = { ...part(281.57e9, -1.25e9, -16.38e9), day: new Date(T0 - 6 * DAY).toISOString().slice(0, 10) };
      check('…a part 6 days old, or none, adds no line; a missing 7-day figure leaves the 30-day one', macroLines(W.en, g, T0).length === 3 && (() => { const p = part(281.57e9, -1.25e9, -16.38e9); p.tot[23] = null; g.stables = p; return macroLines(W.en, g, T0)[4] === '<i>30 days −$16.38B</i>'; })(), macroLines(W.en, g, T0));
    }
    f.dxy.ch24 = -0.003; const z = macroLines(W.en, f, T0)[0]; f.dxy.ch24 = -0.006; const z2 = macroLines(W.en, f, T0)[0];
    check('…a change that rounds to 0.00 has no sign and a white dot (never "🔴 −0.00%"); −0.006 is −0.01', z === '💵 Dollar index  <b>103.87</b> ⚪ 0.00%' && z2 === '💵 Dollar index  <b>103.87</b> 🔴 −0.01%' && pct(-0.004) === '0.00%' && pct(0.004) === '0.00%' && pct(-0.04, 1) === '0.0%' && pct(-1.234) === '−1.23%' && pct(2) === '+2.00%' && pct(null) === '—', [z, z2, pct(-0.004)]);
    check('…/market only: neither the morning brief nor the weekly report carries them', !/Dollar index|BTC funding/.test(brief(summarize(user(), f, T0), f, cfg, T0, true).text + brief(summarize(user(), f, T0), f, cfg, T0, false).text));
  }
  // the weekly report carries the line; the morning brief does not
  m = withRb(D0, [2, 2, 2], 2, '2026-10-20'); const sw = summarize(user(), m, D0);
  check('🌈 the weekly report has the rainbow line under the market; the morning brief does not', /\n🌈 Bitcoin rainbow  <b>band 2 of 9<\/b>\nDeep discount · −\d+% vs the line\n/.test(brief(sw, m, cfg, D0, true).text) && !/🌈/.test(brief(sw, m, cfg, D0, false).text) && okHtml(brief(sw, m, cfg, D0, true).text));
  check('🌈 the weekly report in Arabic', /\n🌈 قوس قزح البيتكوين: <b>النطاق 2 من 9<\/b>\nخصم عميق · أقل من الخط بـ \d+%\n/.test(brief(sw, m, arC, D0, true).text));
  // exactly on the line
  const onL = mk({ now: D0 }); onL.rainbow = rbFile(D0, [4, 4, 4], 4, '2026-01-01'); onL.btc = { price: C.rainbowLine(RBF, Math.floor(D0 / DAY)), ch24: 0 };
  check('🌈 a price on the line reads "on the line"', rainbowLines(W.en, onL, D0)[1] === 'Around the trend line · on the line');
  // every band, at both of its edges and far beyond: each line fits a phone (40 characters), in both languages
  { const plain = x => x.replace(/<[^>]+>/g, ''); let worst = 0, which = '';
    for (const lang of ['en', 'ar']) for (let b = 1; b <= 9; b++) for (const k of [0.001, 0.999]) { const f = mk({ now: D0 }), d = Math.floor(D0 / DAY); f.rainbow = rbFile(D0, [b, b, b === 9 ? 8 : b + 1], b, '2026-01-01');
      f.btc = { price: C.rainbowLine(RBF, d) * 10 ** (RBF.lo + (b - 1 + k) * W9) }; for (const l of rainbowLines(W[lang], f, D0)) { const n = [...plain(l)].length; if (n > worst) { worst = n; which = l; } } }
    check(`🌈 the lines fit a phone in every band (longest ${worst} ≤ 40)`, worst <= 40, which); }
}
console.log(`${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
