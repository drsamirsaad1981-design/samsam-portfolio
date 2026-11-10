// samsam-analysis.js — the main page's AI analysis: the report (Claude through the Cloudflare Worker), the free way
// through the Claude app (copy the prompt, paste the reply), Copy / PDF. Loaded right after samsam-home.js, whose
// functions and data (portfolio, calcStats…) it uses when a report is made. Moved out of samsam-home.js as it was.
// ── Analysis Report ───────────────────────────────────
// IMPORTANT: Replace this URL with YOUR deployed Cloudflare Worker URL after setup
const ANALYSIS_WORKER_URL = 'https://samsam-analysis.dr-samir-saad-1981.workers.dev/analyze';

let analysisLang = 'en';
let analysisRunning = false;

function openAnalysis() {
  document.getElementById('analysisModal').classList.add('active');
  // No report yet: the start screen (quick report with API credit, or free with the Claude app) — nothing is spent until you choose
  if (!aiLast && !analysisRunning) renderAiStart();
  aiPrepApp();
}

function closeAnalysis() {
  document.getElementById('analysisModal').classList.remove('active');
}

function setAnalysisLang(lang) {
  analysisLang = lang;
  document.getElementById('langEnBtn').classList.toggle('active', lang === 'en');
  document.getElementById('langArBtn').classList.toggle('active', lang === 'ar');
  aiPrepApp();
  if (analysisRunning) return;
  // a report written here (API) is written again in the new language; otherwise back to the start screen
  if (aiLast && aiLast.src === 'api') runAnalysis(); else renderAiStart();
}

function buildPortfolioPayload() {
  // Compute per-coin stats using actual portfolio data
  const coins = portfolio.map(c => {
    const avgCost     = c.basePrice || 0;   // basePrice = avg cost basis
    const currentVal  = c.qty * (c.currentPrice || c.basePrice);
    const costBasis   = c.qty * avgCost;
    return {
      sym:          c.sym,
      name:         COIN_NAMES[c.sym] || c.sym,
      qty:          +c.qty.toFixed(8),
      avgCost:      +avgCost.toFixed(8),
      currentPrice: +(c.currentPrice || c.basePrice),
      currentValue: +currentVal.toFixed(2),
      costBasis:    +costBasis.toFixed(2),
      pnlUsd:       +(currentVal - costBasis).toFixed(2),
      pnlPct:       avgCost > 0 ? +((c.currentPrice - avgCost) / avgCost * 100).toFixed(2) : 0,
      cat:          c.cat || 'other',
    };
  });

  const { btcQty, btcValue, altTotal, total } = calcStats();
  const totalCost   = coins.reduce((s, c) => s + c.costBasis, 0);
  const totalPnl    = total - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost * 100) : 0;
  const lastUpdate  = lastFetchTime
    ? lastFetchTime.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Not yet fetched this session';

  // Build accumulation plan summary
  let accumPlanData = [];
  try {
    const raw = accumPlanState || [];
    accumPlanData = raw.map(entry => {
      const coin = portfolio.find(c => c.sym && c.sym.toUpperCase() === (entry.sym||'').toUpperCase());
      const actualQty    = coin ? (coin.qty || 0) : 0;
      const targetQty    = entry.targetQty || 0;
      const currentPrice = coin ? (coin.currentPrice || coin.basePrice || 0) : 0;
      const progress     = targetQty > 0 ? Math.min(actualQty / targetQty * 100, 100) : 0;
      const costToTarget = Math.max(targetQty - actualQty, 0) * currentPrice;
      return {
        sym:          entry.sym,
        name:         entry.name || entry.sym,
        targetQty:    +targetQty,
        actualQty:    +actualQty.toFixed(8),
        pendingQty:   +Math.max(targetQty - actualQty, 0).toFixed(8),
        currentPrice: +currentPrice,
        costToTarget: +costToTarget.toFixed(2),
        progressPct:  +progress.toFixed(1),
        met:          targetQty > 0 && actualQty >= targetQty,
      };
    });
  } catch(_) {}

  const accumMet     = accumPlanData.filter(e => e.met).length;
  const accumTotal   = accumPlanData.length;
  const accumWgtAct  = accumPlanData.reduce((s, e) => s + e.actualQty   * e.currentPrice, 0);
  const accumWgtTgt  = accumPlanData.reduce((s, e) => s + e.targetQty   * e.currentPrice, 0);
  const accumOverall = accumWgtTgt > 0 ? Math.min(accumWgtAct / accumWgtTgt * 100, 100) : 0;

  return {
    coins,
    stats: {
      total:       +total.toFixed(2),
      totalCost:   +totalCost.toFixed(2),
      totalPnl:    +totalPnl.toFixed(2),
      totalPnlPct: +totalPnlPct.toFixed(2),
      btcQty:      +btcQty.toFixed(8),
      btcValue:    +btcValue.toFixed(2),
      altTotal:    +altTotal.toFixed(2),
      btcPrice:    +btcPrice,
      numCoins:    coins.length,
      lastUpdate,
    },
    accumPlan: {
      entries:        accumPlanData,
      totalTargets:   accumTotal,
      metTargets:     accumMet,
      overallPct:     +accumOverall.toFixed(1),
      totalCostToMeet:+accumPlanData.reduce((s,e)=>s+e.costToTarget,0).toFixed(2),
    }
  };
}

// Market data for the AI report: cached / snapshot numbers (no extra CoinGecko calls), at most ~4 seconds.
// Live overview + the trends GitHub saves (m/alt.json: dominance, ETH/BTC, breadth; m/etf.json: ETF flows).
async function marketContext(lang) {
  const M = window.SamsamMarket; if (!M) return '';
  const wait = p => Promise.race([Promise.resolve(p).then(r => r, () => null), new Promise(r => setTimeout(() => r(null), 4000))]);
  const quiet = p => wait(Promise.resolve(p).then(r => r && 'data' in r ? r.data : r));
  const [g, f, top, a90, ap, etf] = await Promise.all([quiet(M.global()), quiet(M.fng()), quiet(M.top()), quiet(M.alt90()), wait(M.altPage && M.altPage()), wait(M.etf && M.etf())]);
  aiAltPage = ap;
  if (!g && !f && !top && !ap) return '';
  const pc = v => v == null || isNaN(v) ? 'n/a' : (v >= 0 ? '+' : '') + (+v).toFixed(2) + '%';
  const usd = v => v >= 1000 ? '$' + Math.round(v).toLocaleString('en-US') : '$' + (+v).toPrecision(4);
  const flow = v => (v < 0 ? '-' : '+') + (Math.abs(v) >= 1e9 ? '$' + (Math.abs(v) / 1e9).toFixed(2) + 'B' : '$' + (Math.abs(v) / 1e6).toFixed(1) + 'M');
  // a saved daily series ([day, value], day = days since 1970): its value `days` days before today
  const back = (ser, days) => { if (!ap || !Array.isArray(ser)) return null; const d = ap.today - days; let v = null; ser.forEach(p => { if (p[0] <= d) v = p[1]; }); return v; };
  const last = ser => Array.isArray(ser) && ser.length ? ser[ser.length - 1][1] : null;
  const L = ['', '', lang === 'ar' ? 'بيانات السوق (السوق الحي — نفس أرقام Market Hub في التطبيق؛ البيانات بالإنجليزية كما هي):' : 'MARKET DATA (the live crypto market — the same numbers as the app\'s Market Hub):'];
  if (g) L.push(`- Total market cap ${M.fmtBig(g.mcap)} (${pc(g.mcapCh24)} in 24h), 24h volume ${M.fmtBig(g.vol)}`);
  if (top && top.length) {
    const by = id => top.find(r => r.id === id);
    [['bitcoin', 'BTC'], ['ethereum', 'ETH']].forEach(([id, s]) => { const c = by(id); if (c && c.price) L.push(`- ${s} price ${usd(c.price)} (${pc(c.ch24)} 24h${c.ch7 != null ? `, ${pc(c.ch7)} 7d` : ''}${c.ch30 != null ? `, ${pc(c.ch30)} 30d` : ''})`); });
  }
  if (ap && Array.isArray(ap.btc)) L.push(`- BTC trend: ${pc(ap.btc[0])} over 7 days, ${pc(ap.btc[1])} over 30 days, ${pc(ap.btc[2])} over 90 days`);
  const trend = (name, now, ser, dp, unit) => {
    if (now == null) return; const w = back(ser, 7), m = back(ser, 30), f2 = v => v == null ? 'n/a' : (+v).toFixed(dp) + unit;
    L.push(`- ${name}: ${f2(now)} now, ${f2(w)} 7 days ago, ${f2(m)} 30 days ago`);
  };
  if (g) L.push(`- Dominance now: BTC ${g.dom.btc.toFixed(1)}%, ETH ${g.dom.eth.toFixed(1)}%, USDT ${g.dom.usdt.toFixed(1)}%, others ${Math.max(0, 100 - g.dom.btc - g.dom.eth - g.dom.usdt).toFixed(1)}%`);
  if (ap) {
    trend('BTC dominance', g ? g.dom.btc : last(ap.domEst), ap.domEst, 1, '%');
    trend('USDT dominance (stablecoin cash waiting on the side)', g ? g.dom.usdt : last(ap.usdtEst), ap.usdtEst, 2, '%');
    trend('ETH/BTC ratio', last(ap.ethbtc), ap.ethbtc, 5, '');
  }
  if (f) L.push(`- Fear & Greed: ${f.value}/100 (${f.label})${f.prev != null ? `, yesterday ${f.prev}` : ''}${f.week != null ? `, a week ago ${f.week}` : ''}`);
  const alt = a90 || (top && M.altSeason(top));
  if (alt) {
    const was = ap && Array.isArray(ap.idx) ? back(ap.idx.map(r => [r[0], r[1]]), 30) : null;
    L.push(`- Altcoin Season index: ${alt.value}/100 (${alt.label}) — ${alt.beat}/${alt.n} top coins beat BTC over ${alt.period || '30d'}${was != null ? `; it was ${was}/100 30 days ago` : ''}`);
  }
  if (ap && ap.breadth) L.push('- Top 100 coins vs BTC: ' + ['7', '30', '90'].filter(k => ap.breadth[k]).map(k => { const b = ap.breadth[k]; return `${k} days: ${b.beat}/${b.n} beat BTC (BTC ${pc(b.btc)}, median coin ${pc(b.med)})`; }).join('; '));
  if (etf) ['btc', 'eth'].forEach(k => {
    const e = etf[k], d = e && e.days; if (!d || !d.length) return;
    const sum = n => d.slice(-n).reduce((s, r) => s + r[1], 0), z = d[d.length - 1];
    L.push(`- US spot ${k.toUpperCase()} ETF flows: ${flow(z[1])} on ${z[0]}, ${flow(sum(5))} over the last 5 trading days, ${flow(sum(d.length))} over the last ${d.length} trading days; net assets ${M.fmtBig(z[3])}`);
    const fl = e.funds && e.funds.list;
    if (fl && fl.length) L.push(`  Biggest moves on ${e.funds.date}: ` + fl.slice().sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 3).map(x => `${x.t} ${flow(x.net)}`).join(', '));
  });
  if (top && top.length) {
    const ok = top.filter(r => r.ch24 != null && !M.isExcluded(r)).sort((a, b) => b.ch24 - a.ch24);
    if (ok.length >= 10) {
      L.push(`- Top 24h gainers (top 100): ${ok.slice(0, 5).map(r => `${r.sym} ${pc(r.ch24)}`).join(', ')}`);
      L.push(`- Top 24h losers (top 100): ${ok.slice(-5).reverse().map(r => `${r.sym} ${pc(r.ch24)}`).join(', ')}`);
    }
  }
  return L.join('\n');
}
let aiAltPage = null;

// What the report must look like — sent with every request (the Worker's 7 sections, each with fixed points),
// so the app can show it as clean cards in English or Arabic.
function aiLayout(lang) {
  const ar = lang === 'ar';
  const T = ar
    ? { sum: 'الخلاصة', btc: 'اتجاه BTC', dom: 'سيطرة BTC', eb: 'ETH/BTC', liq: 'السيولة', etf: 'تدفقات ETF', fng: 'المعنويات', alt: 'موسم العملات البديلة', ver: 'الحكم',
        val: 'القيمة والربح', vs: 'مقارنة بـ BTC', all: 'التوزيع', bs: 'حصة BTC', best: 'الأفضل', worst: 'الأسوأ', risk: 'التركّز، العملات الضعيفة، العملات المستقرة…',
        pr: 'التقدّم', cl: 'الأقرب للهدف', need: 'المتبقي', nx: 'الشراء القادم', buy: 'شراء', hold: 'احتفاظ', red: 'تقليل', wk: 'الأسبوع' }
    : { sum: 'Summary', btc: 'BTC trend', dom: 'BTC dominance', eb: 'ETH/BTC', liq: 'Liquidity', etf: 'ETF flows', fng: 'Sentiment', alt: 'Altcoin Season', ver: 'Verdict',
        val: 'Value & profit', vs: 'vs BTC', all: 'Allocation', bs: 'BTC share', best: 'Best', worst: 'Worst', risk: 'Concentration, Weak coins, Stablecoins…',
        pr: 'Progress', cl: 'Closest to target', need: 'Still needed', nx: 'Next buy', buy: 'Buy', hold: 'Hold', red: 'Reduce', wk: 'Week' };
  const b = s => `**${s}:**`;
  if (ar) return ['', '', 'شكل التقرير — التزم به تمامًا (يفصّل الأقسام السبعة المطلوبة):',
    '- في البداية سطر **الخلاصة** ثم 3 نقاط بالضبط تبدأ بـ "- ": مرحلة السوق، حالة المحفظة، أهم خطوة واحدة. بعدها الأقسام السبعة.',
    '- كل عنوان قسم في سطر وحده بالشكل "N. <إيموجي> <العنوان>" حيث N من 1 إلى 7 والعنوان بالعربية. لا يبدأ أي سطر آخر برقم بعده نقطة.',
    '- داخل الأقسام نقاط "- " فقط: فكرة واحدة في كل نقطة، جملتان قصيرتان على الأكثر، ودائمًا بالأرقام الحقيقية. كل نقطة تبدأ بعنوان صغير عريض ثم نقطتين، مثل "- **العنوان:** النص".',
    `- 1 السوق — نقطة لكل بند وبهذا الترتيب: ${b(T.btc)} خلال 7 و30 و90 يومًا · ${b(T.dom)} الآن مقارنة بقبل 7 و30 يومًا، صاعدة أم هابطة وماذا يعني ذلك · ${b(T.eb)} النسبة واتجاهها · ${b(T.liq)} اتجاه سيطرة USDT وحجم التداول · ${b(T.etf)} لـ BTC وETH، دخول أم خروج خلال آخر 5 أيام تداول · ${b(T.fng)} مؤشر Fear & Greed الآن مقارنة بقبل أسبوع · ${b(T.alt)} قيمة المؤشر وعدد العملات الكبرى التي تفوقت على BTC خلال 7 و30 و90 يومًا. آخر نقطة ${b(T.ver)} مرحلة السوق في جملة واحدة وماذا تعني لهذه المحفظة.`,
    `- 2 المحفظة — ${b(T.val)} · ${b(T.vs)} كم عملة تفوقت على وضع المبلغ نفسه في BTC (vsBtcPct) وأكبر الفروق · ${b(T.all)} كل فئة ونسبتها (وإن وُجد targetAllocation: بُعد كل مجموعة عن هدفها وما يجب شراؤه أو تخفيضه) · ${b(T.bs)}.`,
    `- 3 الأفضل والأسوأ — ${b(T.best)} و${b(T.worst)}: حتى 3 عملات لكل منهما مع تغيّر 24 ساعة و7 أيام ومنذ الشراء.`,
    `- 4 المخاطر — نقطة لكل خطر بعنوان عريض خاص به (${T.risk}) مع الأرقام.`,
    `- 5 خطة التجميع — ${b(T.pr)} · ${b(T.cl)} · ${b(T.need)} بالدولار · ${b(T.nx)}.`,
    `- 6 التوصيات — نقطة لكل عملة مهمة، تبدأ بـ BTC، و10 عملات على الأكثر: "- **SYM — ${T.buy}:** السبب"، باستخدام كلمة واحدة فقط من: ${T.buy} / ${T.hold} / ${T.red}. لكل عملة إشارة من التطبيق (signal)؛ اذكر متى تختلف معها ولماذا.`,
    `- 7 خطة العمل — 4 نقاط من "- **${T.wk} 1:** …" إلى "**${T.wk} 4:**"، كل منها خطوة عملية بمبلغ أو مستوى سعر عند الحاجة.`,
    '- اجعل التقرير كله في حدود 900 كلمة تقريبًا.'].join('\n');
  return ['', '', 'REPORT LAYOUT — follow it exactly (it details the 7 sections above):',
    `- First a line ${'**' + T.sum + '**'} and exactly 3 "- " bullets: the market phase, the state of the portfolio, the single most important action. Then the 7 sections.`,
    '- Each section heading on its own line as "N. <emoji> <title>" with N = 1 to 7' + (ar ? ' and the title in Arabic' : '') + '. No other line may start with a number followed by a dot.',
    '- Inside the sections only "- " bullets: one idea per bullet, at most 2 short sentences, always with the real numbers. Every bullet starts with a bold label and a colon, like "- **Label:** text".',
    `- 1 Market — one bullet each, in this order: ${b(T.btc)} 7 / 30 / 90 days · ${b(T.dom)} now vs 7 and 30 days ago, rising or falling, and what that says · ${b(T.eb)} the ratio and its direction · ${b(T.liq)} the USDT dominance trend and volume · ${b(T.etf)} BTC and ETH, inflow or outflow over the last 5 trading days · ${b(T.fng)} Fear & Greed now vs a week ago · ${b(T.alt)} the index and how many top coins beat BTC over 7 / 30 / 90 days. Last bullet ${b(T.ver)} the market phase in one sentence and what it means for this portfolio.`,
    `- 2 Portfolio — ${b(T.val)} · ${b(T.vs)} how many coins beat holding the same money in BTC (vsBtcPct), the biggest gaps · ${b(T.all)} each category with its % (and, if targetAllocation is given, how far each group is from its target and what to buy or trim) · ${b(T.bs)}.`,
    `- 3 Best & Worst — ${b(T.best)} and ${b(T.worst)}: up to 3 coins each, with their 24h, 7d and since-buy %.`,
    `- 4 Risks — one bullet per risk with its own bold label (${T.risk}) and the numbers.`,
    `- 5 Accumulation Plan — ${b(T.pr)} · ${b(T.cl)} · ${b(T.need)} in $ · ${b(T.nx)}.`,
    `- 6 Recommendations — one bullet per coin that matters, BTC first, at most 10: "- **SYM — ${T.buy}:** the reason", using exactly one of ${T.buy} / ${T.hold} / ${T.red}. Each coin has the app's Signal (signal); say when you disagree with it and why.`,
    `- 7 Action Plan — 4 bullets "- **${T.wk} 1:** …" to "**${T.wk} 4:**", each a concrete action with an amount or a price level where it helps.`,
    '- Keep the whole report under about 900 words.'].join('\n');
}

function renderAnalysisLoading() {
  aiAtStart(false);
  aiLast = null; aiOutButtons(false);
  document.getElementById('analysisBody').innerHTML = `
    <div class="analysis-loading">
      <div class="analysis-spinner"></div>
      <div style="font-size:0.85rem">Claude AI is reading the market and analyzing your portfolio…</div>
      <div style="font-size:0.72rem;opacity:0.6">This takes 10–30 seconds</div>
    </div>`;
}

function renderAnalysisError(msg, detail) {
  aiAtStart(false);
  aiLast = null; aiOutButtons(false);
  document.getElementById('analysisBody').innerHTML = `
    <div class="analysis-error">
      <strong>${SamsamUI.ic('alert')}${msg}</strong>
      ${detail ? `<div style="margin-top:6px;font-size:0.8rem;opacity:0.85">${detail}</div>` : ''}
      <div style="margin-top:10px;font-size:0.78rem">
        Click <strong>${SamsamUI.ic('refresh')}Regenerate</strong> to try again, or check the
        <a href="https://github.com/drsamirsaad1981-design/samsam-portfolio#analysis-setup" target="_blank" rel="noopener noreferrer">setup guide</a>.
      </div>
    </div>`;
}

// The report as cards: a summary, then the 7 sections — each with its SVG icon and its title in the report's language
// (whatever emoji / wording the AI used). Bullets with a bold label, numbered steps, Buy / Hold / Reduce badges.
// The AI's text is escaped first, so it can never put markup or script on the page.
const AI_SECS = [
  ['bar', 'Market Overview', 'نظرة على السوق', /market|السوق/i],
  ['briefcase', 'Portfolio & Allocation', 'المحفظة والتوزيع', /portfolio|allocation|المحفظة|التوزيع/i],
  ['star', 'Best & Worst Performers', 'الأفضل والأسوأ أداءً', /best|worst|perform|الأفضل|الأسوأ|أداء/i],
  ['alert', 'Risks & Concentration', 'المخاطر والتركّز', /risk|concentr|المخاطر|التركز|التركّز/i],
  ['target', 'Accumulation Plan', 'خطة التجميع', /accumul|التجميع/i],
  ['sparkles', 'Recommendations', 'التوصيات', /recommend|التوصيات|توصيات/i],
  ['zap', 'Action Plan — Next 30 Days', 'خطة العمل — الـ 30 يوم القادمة', /action|plan|30|خطة|العمل/i],
];
const AI_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
function aiReportHtml(text, lang) {
  const ar = lang === 'ar', ic = n => SamsamUI.ic(n, { solo: true, size: 16 });
  const lines = SamsamCoins.esc(String(text || '')).replace(/\r/g, '').split('\n');
  const secs = [{ n: 0, items: [] }]; let cur = secs[0], next = 1;
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || /^([-_*])\1{2,}$/.test(t)) { cur.items.push({ k: 'gap' }); continue; }
    const h = t.replace(/^#{1,4}\s*/, '').replace(/^\*\*(.*)\*\*:?$/, '$1').trim();
    const m = /^(\d)\s*[.)]\s*(.*)$/.exec(h);
    if (m && +m[1] === next && next <= 7 && (AI_EMOJI.test(h) || /^#/.test(t) || /^\*\*.*\*\*:?$/.test(t) || AI_SECS[next - 1][3].test(m[2]))) {
      cur = { n: next++, items: [] }; secs.push(cur); continue;
    }
    if (cur.n === 0 && /^(summary|tl;?dr|key takeaways|الخلاصة|ملخص|الملخص)\s*:?$/i.test(h.replace(AI_EMOJI, '').trim())) continue;
    let b = /^(\s*)[-•*·]\s+(.*)$/.exec(raw);
    if (b) { cur.items.push({ k: 'li', sub: b[1].replace(/\t/g, '  ').length >= 2, s: b[2] }); continue; }
    b = /^\s*(\d+)[.)]\s+(.*)$/.exec(raw);
    if (b) { cur.items.push({ k: 'step', s: b[2] }); continue; }
    cur.items.push({ k: 'p', s: t.replace(/^#{1,4}\s*/, '') });
  }
  // in Arabic, numbers like -2.96% / -$1.2B / 0.0331 keep their left-to-right order inside the right-to-left text
  const num = s => ar ? s.replace(/(?<![&#\w.])[+\-−]?\$?\d[\d,]*(\.\d+)?%?[KMBT]?(?![\w;])/g, m => `<bdi dir="ltr">${m}</bdi>`) : s;
  const bold = s => num(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*\*/g, '');
  const VERD = /^(verdict|bottom line|conclusion|الحكم|الخلاصة|النتيجة)$/i;
  const REC = [[/\b(buy|accumulate|add)\b|شراء|اشتر|تجميع|زيادة/i, 'buy'], [/\b(reduce|sell|trim|convert)\b|تقليل|بيع|خفض/i, 'reduce'], [/\b(hold|keep)\b|احتفاظ|احتفظ|انتظار/i, 'hold']];
  const li = (it, sec) => {
    const lm = /^\*\*(.+?)\*\*\s*:?\s*([\s\S]*)$/.exec(it.s);
    if (!lm) return `<li${it.sub ? ' class="sub"' : ''}>${bold(it.s)}</li>`;
    const key = lm[1].replace(/:\s*$/, '').trim(), rest = bold(lm[2]), keyH = ar ? key.replace(/[A-Za-z][\w/&.$-]*(\s+[A-Za-z][\w/&.$-]*)*/g, m => `<bdi dir="ltr">${m}</bdi>`) : key;
    if (sec === 6) {   // "SYM — Buy: reason"
      const parts = key.split(/\s*[—–\-:|]\s*/), word = parts.length > 1 ? parts.slice(1).join(' ') : '', kind = word && (REC.find(r => r[0].test(word)) || [])[1];
      if (kind) return `<li class="ai-rec"><span class="ai-sym">${parts[0]}</span><span class="ai-badge ai-${kind}">${word}</span><span class="ai-t">${rest}</span></li>`;
    }
    if (VERD.test(key)) return `<li class="ai-verdict"><span class="ai-k">${keyH}</span><span class="ai-t">${rest}</span></li>`;
    return `<li${it.sub ? ' class="sub"' : ''}><bdi class="ai-k">${keyH}:</bdi> ${rest}</li>`;
  };
  const body = sec => {
    let out = '', open = '';
    const close = () => { if (open) { out += `</${open}>`; open = ''; } };
    sec.items.forEach(it => {
      if (it.k === 'gap') return close();
      const want = it.k === 'li' ? 'ul' : it.k === 'step' ? 'ol' : '';
      if (want !== open) { close(); if (want) { out += `<${want}>`; open = want; } }
      out += it.k === 'li' ? li(it, sec.n) : it.k === 'step' ? `<li>${bold(it.s)}</li>` : `<p>${bold(it.s)}</p>`;
    });
    close(); return out;
  };
  const found = secs.length > 1;
  let html = '';
  secs.forEach(sec => {
    const inner = body(sec); if (!inner) return;
    if (sec.n === 0) { html += found ? `<section class="ai-sec ai-sum"><h3><span class="ai-ic">${ic('checkCircle')}</span><span>${ar ? 'الخلاصة' : 'Summary'}</span></h3>${inner}</section>` : `<section class="ai-sec">${inner}</section>`; return; }
    const S = AI_SECS[sec.n - 1];
    html += `<section class="ai-sec" data-sec="${sec.n}"><h3><span class="ai-ic">${ic(S[0])}</span><span><bdi dir="ltr">${sec.n}.</bdi> ${ar ? S[2] : S[1]}</span></h3>${inner}</section>`;
  });
  return html;
}

// The last report, for Copy / PDF
let aiLast = null;
function aiAtStart(on) { document.getElementById('analysisModal').classList.toggle('ai-at-start', on); }
function aiOutButtons(on) { ['aiCopyBtn', 'aiPdfBtn'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = !on; }); }
function aiTitle() {
  const ar = aiLast && aiLast.lang === 'ar';
  return (ar ? 'تقرير الذكاء الاصطناعي — Cute Portfolio' : 'Cute Portfolio — AI Analysis Report');
}
function aiSubtitle() { const m = aiLast.meta; return `${m.generatedAt}${m.model ? ' · Claude (' + m.model + ')' : ''} · ${m.numCoins} positions · prices ${m.lastUpdate}`; }
// Copy: the report as plain text (bold marks kept), with a title line — ready to paste into Claude or a note
async function copyAnalysis() {
  if (!aiLast) return;
  const text = `${aiTitle()}\n${aiSubtitle()}\n\n${String(aiLast.text).trim()}\n`;
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (_) {
    try { const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.appendChild(t); t.select(); ok = document.execCommand('copy'); t.remove(); } catch (_) {}
  }
  const b = document.getElementById('aiCopyBtn'), l = b.querySelector('span:last-child');
  l.textContent = ok ? 'Copied' : 'Copy failed'; b.classList.toggle('done', ok);
  clearTimeout(b._t); b._t = setTimeout(() => { l.textContent = 'Copy'; b.classList.remove('done'); }, 2200);
}
// PDF: print only the report (white page, every card), the browser's "Save as PDF"; the file is named after the date
function pdfAnalysis() {
  if (!aiLast) return;
  document.getElementById('aiPrintRoot')?.remove();
  const root = document.createElement('div'); root.id = 'aiPrintRoot';
  const dir = aiLast.lang === 'ar' ? 'rtl' : 'ltr';
  root.innerHTML = `<div class="ai-print-head" dir="${dir}"><b>${SamsamCoins.esc(aiTitle())}</b><span>${SamsamCoins.esc(aiSubtitle())}</span></div>` +
    document.getElementById('analysisBody').innerHTML;
  document.body.appendChild(root);
  const title = document.title, d = new Date();
  document.title = `AI Report ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  document.body.classList.add('ai-print');
  let done = false;
  const undo = () => { if (done) return; done = true; document.body.classList.remove('ai-print'); root.remove(); document.title = title;
    window.removeEventListener('afterprint', undo); document.removeEventListener('pointerdown', undo, true); };
  window.addEventListener('afterprint', undo);
  // phones may not wait for the print sheet: undo on the next tap back on the page as well
  setTimeout(() => { window.print(); setTimeout(() => document.addEventListener('pointerdown', undo, true), 800); }, 50);
}

function renderAnalysisReport(text, meta) {
  const lang = meta.lang || analysisLang;
  aiLast = { text, lang, meta, src: meta.src || 'api' }; aiOutButtons(true); aiAtStart(false);
  let html = '<div class="analysis-content" dir="' + (lang === 'ar' ? 'rtl' : 'ltr') + '" lang="' + lang + '">' + aiReportHtml(text, lang) + '</div>';
  html += `<div class="analysis-meta">
    <span>${SamsamUI.ic('bot')}Generated by Claude AI${meta.model ? ' (' + SamsamCoins.esc(meta.model) + ')' : ''}</span>${meta.left != null ? `<span>${SamsamUI.ic('clock')}${meta.left} report${meta.left === 1 ? '' : 's'} left today</span>` : ''}
    <span>${SamsamUI.ic('clock')}${meta.generatedAt}</span>
    <span>${SamsamUI.ic('activity')}Prices: ${meta.lastUpdate}</span>
    <span>${SamsamUI.ic('briefcase')}${meta.numCoins} positions</span>
  </div>`;

  document.getElementById('analysisBody').innerHTML = html;
}

// More about each coin for the AI: 24h / 7 / 30 / 90-day change, vs BTC, weight, the app's Signal; and the split by category.
function enrichPayload(pd) {
  const total = pd.stats.total || 0, mine = (aiAltPage && aiAltPage.mine) || {}, btc = aiAltPage && aiAltPage.btc;
  const r2 = v => v == null || isNaN(v) ? null : +(+v).toFixed(2);
  const cats = {};
  pd.coins.forEach(x => {
    const c = portfolio.find(p => p.sym === x.sym); if (!c) return;
    const id = c.cgId || (SamsamCoins.CG_IDS || {})[c.sym], tc = id && aiAltPage && (aiAltPage.coins || []).find(r => r.id === id), p = (c.sym === 'BTC' ? btc : id && (mine[id] || (tc && tc.p))) || [];
    x.ch24 = r2(c.change24h); x.ch7 = r2(p[0]); x.ch30 = r2(p[1]); x.ch90 = r2(p[2]);
    x.weightPct = total > 0 ? r2(x.currentValue / total * 100) : null;
    x.vsBtcPct = c.sym === 'BTC' ? 0 : r2(getPerf(c));
    x.signal = signalLabel(getAction(c.sym, 0, c), true);
    x.catLabel = (typeof CAT_LABELS !== 'undefined' && CAT_LABELS[x.cat]) || x.cat;
    const k = x.catLabel; cats[k] = (cats[k] || 0) + x.currentValue;
  });
  pd.stats.byCategory = Object.keys(cats).map(k => ({ cat: k, value: +cats[k].toFixed(2), pct: total > 0 ? +(cats[k] / total * 100).toFixed(1) : 0 })).sort((a, b) => b.value - a.value);
  const alts = pd.coins.filter(x => x.sym !== 'BTC' && x.qty > 0 && x.vsBtcPct != null);
  pd.stats.coinsBeatingBtc = `${alts.filter(x => x.vsBtcPct > 0).length} of ${alts.length}`;
  pd.stats.btcSharePct = total > 0 ? +(pd.stats.btcValue / total * 100).toFixed(1) : 0;
  const tg = Samsam.getTargets && Samsam.getTargets();   // your target allocation (Bitcoin on its own, then categories)
  if (tg && Samsam.core.allocationPlan) {
    const plan = Samsam.core.allocationPlan(tgGroups(), tg.cats, { band: tg.band });
    pd.stats.targetAllocation = { bandPts: tg.band, groups: plan.groups.filter(g => g.target > 0 || g.now >= 0.05).map(g => ({ group: tgLabel(g.key), nowPct: +g.now.toFixed(1), targetPct: +g.target.toFixed(1), driftPts: +g.drift.toFixed(1), toTargetUsd: Math.round(g.full) })) };
  }
  const rules = window.Samsam && Samsam.getSignalRules ? Samsam.getSignalRules() : { reinforce: -5, sell: -20 };
  pd.stats.signalRules = `Signal vs the coin's avg buy price: Reinforce at ${rules.reinforce}% or lower, Sell / Convert to BTC below ${rules.sell}%, otherwise Hold; BTC is always Hold`;
  return pd;
}

// Everything the report is written from — the same for the quick report (Worker) and the Claude app
async function aiRequestParts(lang) {
  const portfolioData = buildPortfolioPayload();
  let accumContext = '';
  if (portfolioData.accumPlan && portfolioData.accumPlan.entries.length > 0 && lang === 'ar') {
    const ap = portfolioData.accumPlan;
    accumContext  = `\n\nخطة التجميع (تحقق ${ap.metTargets} من ${ap.totalTargets} أهداف، الإنجاز الكلي ${ap.overallPct}%، المتبقي $${ap.totalCostToMeet}):\n`;
    accumContext += ap.entries.map(e =>
      `- ${e.sym}: الهدف ${e.targetQty}، المتوفر ${e.actualQty}، المتبقي ${e.pendingQty}، التقدّم ${e.progressPct}%، تكلفة الإكمال $${e.costToTarget}${e.met ? ' ✓ تحقق' : ''}`
    ).join('\n');
    accumContext += `\nعند التوصية بالشراء أو الاحتفاظ، خذ في الاعتبار العملات الموجودة في خطة التجميع ومدى قربها من أهدافها.`;
  } else if (portfolioData.accumPlan && portfolioData.accumPlan.entries.length > 0) {
    const ap = portfolioData.accumPlan;
    accumContext  = `\n\nACCUMULATION PLAN (${ap.metTargets}/${ap.totalTargets} targets met, overall ${ap.overallPct}% complete, $${ap.totalCostToMeet} still needed):\n`;
    accumContext += ap.entries.map(e =>
      `- ${e.sym}: target ${e.targetQty}, actual ${e.actualQty}, pending ${e.pendingQty}, progress ${e.progressPct}%, cost to complete $${e.costToTarget}${e.met ? ' ✓ MET' : ''}`
    ).join('\n');
    accumContext += `\nWhen making Buy/Hold recommendations, factor in which coins are part of the accumulation plan and how close they are to their targets.`;
  }
  // The market right now (same numbers as the Market Hub); it travels in the free-text context the Worker adds to the prompt
  accumContext += await marketContext(lang);
  enrichPayload(portfolioData);
  accumContext += aiLayout(lang);
  return { portfolioData, accumContext };
}

// ── Free: the Claude app ──
// The whole prompt (the same instructions the Worker gives Claude + your data) is copied; you paste it in the Claude app,
// copy its reply and paste it back here, where it shows as the same cards (Copy / PDF too). No API credit is used.
function aiAppSystem(lang) {
  if (lang === 'ar') return ['أنت محلل محترف لمحافظ العملات الرقمية، تكتب تقريرًا خاصًا لصاحب المحفظة.',
    'اعتمد في كل جملة على البيانات المرفقة فقط. لا تخترع أسعارًا أو أخبارًا أو أرقامًا. كن محددًا: اذكر العملات والمبالغ والنسب.',
    'هذا تحليل وليس نصيحة مالية؛ لا تَعِد بأرباح. اجعله عمليًا ومختصرًا.',
    'اكتب التقرير كله بالعربية الفصحى الواضحة والمباشرة، واترك رموز العملات والأرقام ومبالغ $ بالحروف اللاتينية.',
    'التنسيق: نص عادي مع خط عريض (**…**) ونقاط تبدأ بـ "- " فقط. بدون جداول أو كود أو HTML. اكتب التقرير فقط، بدون مقدمة قبله ولا أسئلة بعده.',
    'استخدم عناوين الأقسام المرقّمة هذه بالضبط، كل عنوان في سطر وحده، وبالترتيب نفسه:',
    '1. 📊 نظرة على السوق', '2. 🥧 المحفظة والتوزيع', '3. 🏆 الأفضل والأسوأ أداءً', '4. ⚠️ المخاطر والتركّز',
    '5. 💰 خطة التجميع', '6. 💡 التوصيات (شراء / احتفاظ / تقليل لكل عملة مهمة)', '7. 🎯 خطة العمل للـ 30 يومًا القادمة'].join('\n');
  const L = lang === 'ar'
    ? 'Write the whole report in Arabic (Modern Standard Arabic, clear and direct). Keep coin tickers, numbers and $ amounts in Latin characters.'
    : 'Write the whole report in clear, direct English.';
  return ['You are a seasoned crypto portfolio analyst writing a private report for the portfolio owner.',
    'Base every statement on the data provided. Do not invent prices, news or numbers. Be specific: name coins, amounts and percentages.',
    'This is analysis, not financial advice; do not promise returns. Keep it practical and concise.', L,
    'Format: plain text with markdown bold (**…**) and "- " bullets only. No tables, no code blocks, no HTML. Reply with the report only — no introduction before it and no questions after it.',
    'Use exactly these numbered section headings, each on its own line, in this order:',
    '1. 📊 Market Overview', '2. 🥧 Portfolio Overview & Allocation', '3. 🏆 Best & Worst Performers', '4. ⚠️ Risks & Concentration',
    '5. 💰 Accumulation Plan Progress', '6. 💡 Recommendations (Buy / Hold / Reduce, per coin where it matters)', '7. 🎯 Action Plan for the Next 30 Days'].join('\n');
}
let aiApp = null;   // { lang, text, t } — prepared when the report opens, so the copy happens right on your tap
async function aiPrepApp(force) {
  const lang = analysisLang;
  if (!force && aiApp && aiApp.lang === lang && Date.now() - aiApp.t < 10 * 60e3) return aiApp;
  if (!(window.Samsam && Samsam.isReady && Samsam.isReady())) return null;
  try {
    const { portfolioData, accumContext } = await aiRequestParts(lang);
    const at = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    const text = lang === 'ar'
      ? `${aiAppSystem(lang)}\n\n---\n\nبيانات المحفظة (JSON، بالدولار، ${at}):\n${JSON.stringify(portfolioData)}${accumContext}\n\nاكتب التقرير الآن بالعربية.`
      : `${aiAppSystem(lang)}\n\n---\n\nPORTFOLIO DATA (JSON, USD, ${at}):\n${JSON.stringify(portfolioData)}${accumContext}\n\nWrite the report now.`;
    aiApp = { lang, text, t: Date.now() };
    return aiApp;
  } catch (_) { return null; }
}
async function aiCopyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
  try { const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok; } catch (_) { return false; }
}
function aiFlash(id, txt, ok) {
  const b = document.getElementById(id); if (!b) return; const l = b.querySelector('span:last-child'), was = b.dataset.lbl || (b.dataset.lbl = l.textContent);
  l.textContent = txt; b.classList.toggle('done', !!ok); clearTimeout(b._t); b._t = setTimeout(() => { l.textContent = was; b.classList.remove('done'); }, 2600);
}
async function aiCopyForApp() {
  const ar = analysisLang === 'ar';
  const ready = aiApp && aiApp.lang === analysisLang && Date.now() - aiApp.t < 10 * 60e3;
  if (!ready) {
    aiFlash('aiAppCopy', ar ? 'جارٍ التجهيز…' : 'Preparing…');
    const a = await aiPrepApp(true);
    if (!a) { aiFlash('aiAppCopy', ar ? 'غير جاهز — حاول مرة أخرى' : 'Not ready — try again'); return; }
  }
  const ok = await aiCopyText(aiApp.text);
  if (!ok) { aiFlash('aiAppCopy', ar ? 'اضغط مرة أخرى للنسخ' : 'Tap again to copy'); return; }
  aiFlash('aiAppCopy', ar ? 'تم النسخ — الصقه في Claude' : 'Copied — paste it in Claude', true);
  document.getElementById('aiStep2')?.classList.add('on');
  try { window.open('https://claude.ai/new', '_blank', 'noopener'); } catch (_) {}
}
function renderAiStart() {
  if (analysisRunning) return;
  aiLast = null; aiOutButtons(false); aiAtStart(true);
  const ar = analysisLang === 'ar';
  const T = ar ? { free: 'مجانًا مع تطبيق Claude', freeD: 'نفس التقرير، يكتبه Claude في تطبيقك — بدون أي خصم من رصيد الـ API. لغة التقرير: العربية.',
      s1: 'انسخ بيانات محفظتك والسوق، ثم الصقها في محادثة جديدة مع Claude.', b1: 'نسخ لـ Claude',
      s2: 'بعد أن يكتب Claude التقرير، انسخ رده (زر النسخ أسفله) والصقه هنا.', b2: 'لصق التقرير',
      q: 'تقرير سريع هنا', qD: 'يُكتب في حوالي 20 ثانية بضغطة واحدة — يُخصم من رصيد Anthropic API (حوالي <bdi dir="ltr">$0.07–0.13</bdi> للتقرير).', qb: 'إنشاء التقرير' }
    : { free: 'Free with the Claude app', freeD: 'The same report, written in your Claude app — no API credit used. Report language: English.',
      s1: 'Copy your portfolio + market data, then paste it in a new Claude chat.', b1: 'Copy for Claude',
      s2: 'When Claude has written it, copy its reply (the copy button under it) and paste it here.', b2: 'Paste report',
      q: 'Quick report here', qD: 'Written in about 20 seconds with one tap — uses your Anthropic API credit (about $0.07–0.13 a report).', qb: 'Create report' };
  document.getElementById('analysisBody').innerHTML = `
    <div class="ai-start" dir="${ar ? 'rtl' : 'ltr'}" lang="${ar ? 'ar' : 'en'}">
      <div class="ai-opt">
        <div class="ai-opt-h"><span class="ai-ic">${SamsamUI.ic('sparkles', { solo: true, size: 16 })}</span><div><b>${T.free}</b><span>${T.freeD}</span></div></div>
        <ol class="ai-steps">
          <li id="aiStep1"><span>${T.s1}</span>
            <button class="btn-analysis" id="aiAppCopy" onclick="aiCopyForApp()"><span data-ic="file"></span><span>${T.b1}</span></button></li>
          <li id="aiStep2"><span>${T.s2}</span>
            <button class="btn-analysis" id="aiAppPaste" onclick="aiPasteReport()"><span data-ic="download"></span><span>${T.b2}</span></button></li>
        </ol>
      </div>
      <div class="ai-opt">
        <div class="ai-opt-h"><span class="ai-ic">${SamsamUI.ic('bot', { solo: true, size: 16 })}</span><div><b>${T.q}</b><span>${T.qD}</span></div></div>
        <button class="btn-analysis ai-quick" onclick="runAnalysis()"><span data-ic="refresh"></span><span>${T.qb}</span></button>
      </div>
    </div>`;
  aiPaintIcons();
}
function aiPaintIcons() { document.querySelectorAll('#analysisBody [data-ic]').forEach(e => { if (!e.firstChild) e.innerHTML = SamsamUI.ic(e.dataset.ic, { solo: true, size: 14 }); }); }
async function aiPasteReport() {
  let t = '';
  try { t = await navigator.clipboard.readText(); } catch (_) {}
  if (t && /(^|\n)\s*(#+\s*)?\**\s*[1-7]\s*[.)]/.test(t) && t.length > 200) return aiShowPasted(t);
  // the browser didn't hand over the clipboard (or it isn't a report): a box to paste into
  aiAtStart(true);
  const ar = analysisLang === 'ar';
  document.getElementById('analysisBody').innerHTML = `
    <div class="ai-paste" dir="${ar ? 'rtl' : 'ltr'}">
      <label for="aiPasteTxt">${ar ? 'الصق رد Claude هنا:' : "Paste Claude's reply here:"}</label>
      <textarea id="aiPasteTxt" rows="9" placeholder="${ar ? 'اضغط مطولًا ثم لصق' : 'Long-press → Paste'}" dir="auto"></textarea>
      <div class="ai-paste-b"><button class="btn-analysis" onclick="aiShowPasted(document.getElementById('aiPasteTxt').value)"><span data-ic="checkCircle"></span><span>${ar ? 'عرض التقرير' : 'Show report'}</span></button>
        <button class="btn-analysis" onclick="renderAiStart()"><span data-ic="x"></span><span>${ar ? 'رجوع' : 'Back'}</span></button></div>
      <div class="ai-paste-err" id="aiPasteErr" hidden>${ar ? 'هذا لا يبدو كالتقرير — الصق رد Claude كاملًا.' : "That doesn't look like the report — paste Claude's whole reply."}</div>
    </div>`;
  aiPaintIcons();
  document.getElementById('aiPasteTxt').focus();
}
function aiShowPasted(t) {
  t = String(t || '').trim();
  if (t.length < 120) { const e = document.getElementById('aiPasteErr'); if (e) e.hidden = false; return; }
  const lang = (t.match(/[\u0600-\u06FF]/g) || []).length > 80 ? 'ar' : 'en';
  const pd = (() => { try { return buildPortfolioPayload(); } catch (_) { return { stats: {} }; } })();
  renderAnalysisReport(t.slice(0, 40000), { lang, src: 'app', model: 'Claude app', left: null,
    generatedAt: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }), lastUpdate: pd.stats.lastUpdate || '—', numCoins: pd.stats.numCoins || 0 });
}

async function runAnalysis() {
  if (analysisRunning) return;

  // Check Worker URL is configured
  if (ANALYSIS_WORKER_URL.includes('YOUR-SUBDOMAIN')) {
    renderAnalysisError(
      'Worker not configured yet',
      'Replace <code>YOUR-SUBDOMAIN</code> in the code with your Cloudflare Worker URL. See setup instructions below.'
    );
    // Show setup instructions in the modal
    document.getElementById('analysisBody').innerHTML += `
      <div style="margin-top:16px;background:var(--bg3);border-radius:8px;padding:14px 16px;font-size:0.8rem;line-height:1.9;border:1px solid var(--border)">
        <strong style="color:var(--accent);font-size:0.88rem">${SamsamUI.ic('sliders')}One-Time Setup (5 minutes)</strong><br>
        <ol style="margin:8px 0 0 16px;padding:0">
          <li>Go to <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">dash.cloudflare.com</a> → Workers &amp; Pages → Create</li>
          <li>Paste the Worker code (see <code>worker.js</code> file shared below)</li>
          <li>Deploy → copy the <code>.workers.dev</code> URL</li>
          <li>In Worker Settings → Variables → add <strong>Secret: ANTHROPIC_API_KEY</strong></li>
          <li>In <code>index.html</code> replace <code>YOUR-SUBDOMAIN</code> in <code>ANALYSIS_WORKER_URL</code></li>
          <li>Push to GitHub → done ${SamsamUI.ic('checkCircle')}</li>
        </ol>
        <div style="margin-top:10px;color:var(--fg2)">Cost: Free tier (100,000 Worker requests/day + ~$0.01/report for Claude API)</div>
      </div>`;
    return;
  }

  analysisRunning = true;
  document.getElementById('regenBtn').disabled = true;
  renderAnalysisLoading();

  try {
    const lang = analysisLang;
    const { portfolioData, accumContext } = await aiRequestParts(lang);

    // Proof of sign-in: the Worker verifies this Firebase ID token and counts reports per account per day
    let idToken = null;
    try { idToken = window.Samsam && Samsam.idToken ? await Samsam.idToken() : null; } catch (_) {}
    if (!idToken) { renderAnalysisError('Sign in first', 'The AI report is only for signed-in accounts. Sign in, then try again.'); return; }

    const res = await fetch(ANALYSIS_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portfolioData, language: lang, accumContext, idToken }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      renderAnalysisError(
        res.status === 429 ? 'Daily limit reached' : res.status === 401 || res.status === 403 ? 'Not allowed' : 'Analysis failed',
        SamsamCoins.esc(err.error || `Server returned ${res.status}. Please try again.`)
      );
      return;
    }

    const data = await res.json();
    if (!data.report) {
      renderAnalysisError('Empty response from AI', 'Claude returned an empty report. Please try again.');
      return;
    }

    renderAnalysisReport(data.report, {
      lang, src: 'api',
      model:       typeof data.model === 'string' ? data.model : '',
      left:        Number.isFinite(data.remaining) ? data.remaining : null,
      generatedAt: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
      lastUpdate:  portfolioData.stats.lastUpdate,
      numCoins:    portfolioData.stats.numCoins,
    });

  } catch (err) {
    renderAnalysisError(
      'Connection error',
      'Could not reach the analysis service. Check your internet connection and try again.'
    );
  } finally {
    analysisRunning = false;
    document.getElementById('regenBtn').disabled = false;
  }
}

// Close modal on overlay click
document.getElementById('analysisModal').addEventListener('click', function(e) {
  if (e.target === this) closeAnalysis();
});
