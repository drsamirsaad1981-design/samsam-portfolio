import * as C from '../samsam-core.js';
import assert from 'node:assert/strict';
const close=(a,b,m)=>assert.ok(Math.abs(a-b)<1e-9*Math.max(1,Math.abs(b)),`${m}: ${a} vs ${b}`);
// Opening BTC 0.01304 @ 80980.29, buy 0.001 @ 100000, sell 0.002 @ 110000
const open={qty:0.01304,avg:80980.29};
const txs=[{id:'a',sym:'BTC',type:'buy',qty:0.001,price:100000,date:'2026-10-16T00:00:00Z'},
           {id:'b',sym:'BTC',type:'sell',qty:0.002,price:110000,date:'2026-10-17T00:00:00Z'}];
const r=C.replay(open,txs);
const avg1=(0.01304*80980.29+0.001*100000)/0.01404;
close(r.qty,0.01204,'qty'); close(r.avg,avg1,'avg'); close(r.realized,(110000-avg1)*0.002,'realized');
// Bug 6: delete the buy → keep opening position
const r2=C.replay(open,[txs[1]]); close(r2.qty,0.01104,'qty after delete'); close(r2.avg,80980.29,'avg after delete');
// Bug 7: sell of opening coin with no buys — realized uses opening avg, not 0
close(r2.realized,(110000-80980.29)*0.002,'realized vs opening');
// Migration: backward replay reproduces current exactly
const m=C.deriveOpening({qty:r.qty,avg:r.avg},txs); assert.ok(m.exact,'exact'); close(m.opening.qty,0.01304,'open qty'); close(m.opening.avg,80980.29,'open avg');
// Manual edit in between → needs adjust
const m2=C.deriveOpening({qty:5,avg:1},txs); assert.ok(m2.needAdjust,'adjust needed');
const withAdj=[...txs,{id:'z',sym:'BTC',type:'adjust',setQty:5,setAvg:1,date:'2026-10-18T00:00:00Z'}];
const r3=C.replay(m2.opening,withAdj); close(r3.qty,5,'adj qty'); close(r3.avg,1,'adj avg');
// derivePortfolio: removed hidden, price fallback chain
const coins=[{sym:'BTC',opening:open,order:0,cat:'btc'},{sym:'X',opening:{qty:1,avg:2},removed:true}];
const pf=C.derivePortfolio(coins,txs,{BTC:{usd:120000,ch24:1.5,t:Date.now()}});
assert.equal(pf.length,1); assert.equal(pf[0].currentPrice,120000); close(pf[0].qty,0.01204,'pf qty');
// Snapshot buckets merge from two devices without duplicates
const fl=C.flattenSnaps([{id:'2026-10-18',p:{[C.bucket(1e12,C.HOUR)]:{t:1e12,v:5,b:1}},h:{}}]); assert.equal(fl.perf.length,1);
console.log('core tests passed');
// Transfers
{
  const o={qty:10,avg:2};
  const tin=[{id:'i',sym:'X',type:'transfer_in',qty:5,price:4,fee:0.5,date:'2026-10-19'}];
  const r=C.replay(o,tin); close(r.qty,14.5,'tin qty'); close(r.avg,(10*2+5*4)/14.5,'tin avg'); close(r.realized,0,'tin no pnl');
  const tout=[{id:'o',sym:'X',type:'transfer_out',qty:3,fee:0.1,date:'2026-10-19'}];
  const r2=C.replay(o,tout); close(r2.qty,6.9,'tout qty'); close(r2.avg,2,'tout avg'); close(r2.realized,0,'tout no pnl');
  const m=C.deriveOpening({qty:r.qty,avg:r.avg},tin); assert.ok(m.exact,'tin backward exact'); close(m.opening.qty,10,'tin open qty');
  const m2=C.deriveOpening({qty:r2.qty,avg:r2.avg},tout); assert.ok(m2.exact,'tout backward exact'); close(m2.opening.qty,10,'tout open qty');
  console.log('transfer tests passed');
}
