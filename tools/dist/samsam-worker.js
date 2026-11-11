// samsam-worker.js — BUILT FILE (node tools/build-worker.mjs). Paste all of it into the Cloudflare Worker: AI Analysis (/analyze) + the Telegram bot (/tg).
// Sources: tools/ai-worker.js, tools/worker/*.mjs, tools/alerts-core.mjs, samsam-core.js. No keys or secrets in here — they live in the Worker settings.
// sources-hash: 877c410b2ef189c3

// tools/ai-worker.js
var JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
var MAX_BODY = 200 * 1024;
var jwksCache = { keys: null, until: 0 };
var memCount = /* @__PURE__ */ new Map();
var ai_worker_default = {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = list(env.ALLOWED_ORIGINS || "https://drsamirsaad1981-design.github.io");
    const okOrigin = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) && env.ALLOW_LOCAL === "1";
    const cors = {
      "Access-Control-Allow-Origin": okOrigin ? origin : allowed[0] || "",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };
    const reply = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    if (request.method === "OPTIONS") return new Response(null, { status: okOrigin ? 204 : 403, headers: cors });
    if (!okOrigin) return reply(403, { error: "This service only answers the Cute Portfolio app." });
    if (request.method !== "POST" || !new URL(request.url).pathname.endsWith("/analyze")) return reply(404, { error: "Not found." });
    const raw = await request.text();
    if (raw.length > MAX_BODY) return reply(413, { error: "Request too large." });
    let body;
    try {
      body = JSON.parse(raw);
    } catch (_) {
      return reply(400, { error: "Bad request." });
    }
    const token = body.idToken || (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let user;
    try {
      user = await verifyFirebaseToken(token, env.FIREBASE_PROJECT || "samsam-portfolio");
    } catch (e) {
      return reply(401, { error: "Please sign in again, then retry. (" + e.message + ")" });
    }
    const emails = list(env.ALLOWED_EMAILS || "");
    if (emails.length && !emails.includes(String(user.email || "").toLowerCase())) return reply(403, { error: "This account is not allowed to use the AI analysis." });
    const limit = Math.max(1, parseInt(env.DAILY_LIMIT || "5", 10) || 5);
    const day = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const key = `ai:${user.uid}:${day}`;
    const used = await getCount(env, key);
    if (used >= limit) return reply(429, { error: `You have used today's ${limit} AI reports. New reports are available tomorrow (00:00 UTC).`, remaining: 0 });
    if (!env.ANTHROPIC_API_KEY) return reply(500, { error: "The Worker has no ANTHROPIC_API_KEY secret." });
    const model = env.MODEL || "claude-opus-4-5";
    const lang = body.language === "ar" ? "ar" : "en";
    const data = body.portfolioData && typeof body.portfolioData === "object" ? body.portfolioData : null;
    if (!data) return reply(400, { error: "No portfolio data in the request." });
    const extra = typeof body.accumContext === "string" ? body.accumContext.slice(0, 2e4) : "";
    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 4e3, system: systemPrompt(lang), messages: [{ role: "user", content: userPrompt(data, extra, lang) }] })
      });
    } catch (_) {
      return reply(502, { error: "Could not reach Claude. Please try again." });
    }
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return reply(502, { error: out.error && out.error.message || `Claude returned ${res.status}.` });
    const report = (out.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (!report) return reply(502, { error: "Claude returned an empty report." });
    await setCount(env, key, used + 1);
    return reply(200, { report, model: out.model || model, remaining: limit - used - 1 });
  }
};
async function verifyFirebaseToken(token, projectId) {
  if (!token || typeof token !== "string" || token.split(".").length !== 3) throw new Error("no sign-in token");
  const [h, p, s] = token.split(".");
  const header = JSON.parse(b64urlText(h)), payload = JSON.parse(b64urlText(p));
  if (header.alg !== "RS256" || !header.kid) throw new Error("bad token");
  const now = Math.floor(Date.now() / 1e3);
  if (payload.aud !== projectId || payload.iss !== "https://securetoken.google.com/" + projectId) throw new Error("wrong project");
  if (!(payload.exp > now)) throw new Error("token expired");
  if (!(payload.iat <= now + 300) || !(payload.auth_time <= now + 300)) throw new Error("bad token time");
  if (!payload.sub || typeof payload.sub !== "string") throw new Error("no user");
  if (payload.email_verified !== true) throw new Error("e-mail not verified");
  const jwk = (await googleKeys()).find((k) => k.kid === header.kid) || (await googleKeys(true)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("unknown key");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok2 = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(s), new TextEncoder().encode(h + "." + p));
  if (!ok2) throw new Error("bad signature");
  return { uid: payload.sub, email: payload.email || "" };
}
async function googleKeys(force) {
  if (!force && jwksCache.keys && Date.now() < jwksCache.until) return jwksCache.keys;
  const r = await fetch(JWKS_URL);
  if (!r.ok) throw new Error("cannot load Google keys");
  const j = await r.json();
  const age = /max-age=(\d+)/.exec(r.headers.get("cache-control") || "");
  jwksCache = { keys: j.keys || [], until: Date.now() + (age ? +age[1] : 3600) * 1e3 };
  return jwksCache.keys;
}
function b64urlBytes(s) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
function b64urlText(s) {
  return new TextDecoder().decode(b64urlBytes(s));
}
async function getCount(env, key) {
  if (env.RATE) return parseInt(await env.RATE.get(key) || "0", 10) || 0;
  return memCount.get(key) || 0;
}
async function setCount(env, key, n) {
  if (env.RATE) return env.RATE.put(key, String(n), { expirationTtl: 2 * 86400 });
  memCount.set(key, n);
}
function list(v) {
  return String(v || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).map((x) => x.startsWith("http") ? x.replace(/\/$/, "") : x);
}
function systemPrompt(lang) {
  const L = lang === "ar" ? "Write the whole report in Arabic (Modern Standard Arabic, clear and direct). Keep coin tickers, numbers and $ amounts in Latin characters." : "Write the whole report in clear, direct English.";
  return [
    "You are a seasoned crypto portfolio analyst writing a private report for the portfolio owner.",
    "Base every statement on the data provided. Do not invent prices, news or numbers. Be specific: name coins, amounts and percentages.",
    "This is analysis, not financial advice; do not promise returns. Keep it practical and concise.",
    L,
    'Format: plain text with markdown bold (**\u2026**) and "- " bullets only. No tables, no code blocks, no HTML.',
    "Use exactly these numbered section headings, each on its own line, in this order:",
    "1. \u{1F4CA} Market Overview",
    "2. \u{1F967} Portfolio Overview & Allocation",
    "3. \u{1F3C6} Best & Worst Performers",
    "4. \u26A0\uFE0F Risks & Concentration",
    "5. \u{1F4B0} Accumulation Plan Progress",
    "6. \u{1F4A1} Recommendations (Buy / Hold / Reduce, per coin where it matters)",
    "7. \u{1F3AF} Action Plan for the Next 30 Days"
  ].join("\n");
}
function userPrompt(data, extra, lang) {
  return "PORTFOLIO DATA (JSON, USD):\n" + JSON.stringify(data).slice(0, 6e4) + (extra ? "\n" + extra : "") + "\n\nWrite the report now" + (lang === "ar" ? " (in Arabic)" : "") + ".";
}

// samsam-core.js
var EPS = 1e-12;
function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function txSortKey(t) {
  return [String(t.date || ""), String(t.createdAt || ""), String(t.id || "")];
}
function compareTx(a, b) {
  const ka = txSortKey(a), kb = txSortKey(b);
  for (let i = 0; i < 3; i++) {
    if (ka[i] < kb[i]) return -1;
    if (ka[i] > kb[i]) return 1;
  }
  return 0;
}
function freeCoins(txs, from = null, to = null) {
  const out = [];
  for (const t of txs || []) {
    if (!t || t.type !== "transfer_in" || num(t.price) > 0) continue;
    const q = netQty(t);
    if (!(q > 0)) continue;
    const d = String(t.date || "");
    if (from && d < from || to && d >= to) continue;
    out.push({ id: t.id, sym: t.sym, date: d, qty: q, kind: t.src === "mining" ? "mining" : t.src === "airdrop" ? "free" : t.kind === "reward" ? "reward" : /min(ed|ing)\b/i.test(String(t.note || "")) ? "mining" : "free" });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
var STAKE_WEEK = 7 * 864e5;
function netQty(t) {
  const q = num(t && t.qty);
  return t && (t.type === "buy" || t.type === "transfer_in") ? Math.max(0, q - Math.max(0, num(t.fee))) : q;
}
function applyTx(pos, t) {
  let qty2 = pos.qty, avg = pos.avg, realized = 0, sellQty = 0, sellFee = 0;
  const q = num(t.qty), p = num(t.price);
  if (t.type === "buy") {
    if (q > 0) {
      const net = q - Math.min(q, Math.max(0, num(t.fee))), nq = qty2 + net, feeUsd = Math.max(0, num(t.feeUsd));
      if (net > 0) {
        avg = nq > EPS ? (qty2 * avg + q * p + feeUsd) / nq : 0;
        qty2 = nq;
      }
    }
  } else if (t.type === "sell") {
    sellQty = Math.min(q, Math.max(qty2, 0));
    sellFee = Math.max(0, num(t.feeUsd));
    realized = (p - avg) * sellQty - sellFee;
    qty2 = Math.max(0, qty2 - q);
    if (qty2 < EPS) qty2 = 0;
  } else if (t.type === "transfer_in") {
    const f = Math.max(0, num(t.fee)), net = q - f;
    if (net > 0) {
      const nq = qty2 + net;
      avg = nq > EPS ? (qty2 * avg + q * p) / nq : 0;
      qty2 = nq;
    }
  } else if (t.type === "transfer_out") {
    const f = Math.max(0, num(t.fee));
    qty2 = Math.max(0, qty2 - q - f);
    if (qty2 < EPS) qty2 = 0;
  } else if (t.type === "adjust") {
    if (t.setQty !== void 0 && t.setQty !== null) qty2 = Math.max(0, num(t.setQty, qty2));
    if (t.setAvg !== void 0 && t.setAvg !== null) avg = Math.max(0, num(t.setAvg, avg));
  }
  return { qty: qty2, avg, realized, sellQty, sellFee };
}
function replay(opening, txs) {
  let pos = { qty: Math.max(0, num(opening && opening.qty)), avg: Math.max(0, num(opening && opening.avg)) };
  let realized = 0, sellCount = 0, sellFees = 0, soldCost = 0;
  const perTx = {};
  const sorted = [...txs || []].sort(compareTx);
  for (const t of sorted) {
    const avgBefore = pos.avg;
    const r = applyTx(pos, t);
    pos = { qty: r.qty, avg: r.avg };
    if (t.type === "sell") {
      realized += r.realized;
      sellCount++;
      sellFees += r.sellFee;
      soldCost += r.sellQty * avgBefore;
    }
    perTx[t.id] = { realized: t.type === "sell" ? r.realized : null, avgBefore, qtyAfter: pos.qty };
  }
  return { qty: pos.qty, avg: pos.avg, realized, sellCount, sellFees, soldCost, perTx };
}
function groupTxBySym(txs) {
  const m = /* @__PURE__ */ new Map();
  for (const t of txs || []) {
    if (!m.has(t.sym)) m.set(t.sym, []);
    m.get(t.sym).push(t);
  }
  return m;
}
function derivePortfolio(coins, txs, prices = {}, fallbackPrices = {}) {
  const bySym = groupTxBySym(txs);
  return (coins || []).filter((c) => c && c.sym && !c.removed).sort((a, b) => num(a.order, 1e9) - num(b.order, 1e9) || String(a.sym).localeCompare(String(b.sym))).map((c) => {
    const r = replay(c.opening, bySym.get(c.sym) || []);
    const pr = prices[c.sym];
    const currentPrice = pr && pr.usd > 0 ? pr.usd : num(c.lastPrice) > 0 ? num(c.lastPrice) : num(fallbackPrices[c.sym]) > 0 ? num(fallbackPrices[c.sym]) : r.avg;
    return {
      sym: c.sym,
      name: c.name || void 0,
      cat: c.cat || "other",
      catLocked: !!c.catLocked,
      catLabel: c.catLabel || void 0,
      cgId: c.cgId || void 0,
      ccSlug: c.ccSlug || void 0,
      cmcSlug: c.cmcSlug || void 0,
      logoUrl: c.logoUrl || void 0,
      notes: c.notes || "",
      isCustom: !!c.isCustom,
      qty: r.qty,
      basePrice: r.avg,
      walletValue: r.qty * r.avg,
      currentPrice,
      change24h: pr && pr.ch24 != null ? pr.ch24 : void 0,
      action: "hold",
      lastUpdate: pr && pr.t ? new Date(pr.t).toISOString().slice(0, 10) : c.lastUpdate || ""
    };
  });
}
function realizedPnl(coins, txs) {
  const bySym = groupTxBySym(txs);
  const openBySym = new Map((coins || []).map((c) => [c.sym, c.opening]));
  let total = 0, sellCount = 0, sellFees = 0, soldCost = 0;
  const perTx = {}, bySymTotal = {};
  for (const [sym, list2] of bySym) {
    const r = replay(openBySym.get(sym) || { qty: 0, avg: 0 }, list2);
    total += r.realized;
    sellCount += r.sellCount;
    sellFees += r.sellFees;
    soldCost += r.soldCost;
    bySymTotal[sym] = { realized: r.realized, sellCount: r.sellCount, sellFees: r.sellFees, soldCost: r.soldCost };
    Object.assign(perTx, r.perTx);
  }
  return { total, sellCount, sellFees, soldCost, perTx, bySym: bySymTotal };
}
function vsBtcByCoin(coins, txs, { prices = {}, btcNow = 0, btcAt = null, baselineBtc = 0 } = {}) {
  const out = {};
  const bySym = groupTxBySym(txs);
  for (const c of coins || []) {
    if (!c || !c.sym || c.removed) continue;
    let pos = { qty: Math.max(0, num(c.opening && c.opening.qty)), avg: Math.max(0, num(c.opening && c.opening.avg)) };
    let realized = 0, shadow = c.sym === "BTC" ? pos.qty : baselineBtc > 0 ? pos.qty * pos.avg / baselineBtc : 0;
    let N = pos.qty * pos.avg;
    for (const x of [...bySym.get(c.sym) || []].sort(compareTx)) {
      const before = pos.qty, r = applyTx(pos, x);
      pos = { qty: r.qty, avg: r.avg };
      if (x.type === "sell") realized += r.realized;
      const n2 = pos.qty * pos.avg - realized, dN = n2 - N;
      N = n2;
      if (c.sym === "BTC") {
        shadow += pos.qty - before;
        continue;
      }
      const t = Date.parse(x.date) || 0, bp = btcAt && btcAt(t) || baselineBtc;
      if (dN && bp > 0) shadow += dN / bp;
    }
    const cost = pos.qty * pos.avg, price2 = num(prices[c.sym]), value = pos.qty * price2;
    if (!(cost > 0) || !(price2 > 0) || !(btcNow > 0)) {
      out[c.sym] = null;
      continue;
    }
    const coinProfit = value - cost + realized, btcProfit = shadow * btcNow - N;
    const coinPct = coinProfit / cost * 100, btcPct = btcProfit / cost * 100;
    out[c.sym] = { pct: coinPct - btcPct, coinPct, btcPct };
  }
  return out;
}
var SMART_WEAK = 15;
function signalFor({ sym, chg, rules, rs = null, smart = true }) {
  const r = rules || { reinforce: -5, sell: -20 };
  const base = sym === "BTC" ? "hold" : chg < r.sell ? "convert" : chg <= r.reinforce ? "reinforce" : "hold";
  const ok2 = smart && sym !== "BTC" && rs && Number.isFinite(rs.d30) && Number.isFinite(rs.d90);
  if (!ok2) return { action: base, base, why: null, rs: rs || null };
  const weak = rs.d30 <= -SMART_WEAK && rs.d90 <= -SMART_WEAK, strong = rs.d30 > 0 && rs.d90 > 0;
  if (base === "reinforce" && weak) return { action: "hold", base, why: "weak", rs };
  if (base === "convert" && strong) return { action: "hold", base, why: "strong", rs };
  return { action: base, base, why: base !== "hold" && (weak || strong) ? "confirmed" : null, rs };
}
function strengthMap(alt) {
  const out = {}, b = alt && alt.btc;
  if (!b || !Number.isFinite(b[1]) || !Number.isFinite(b[2])) return out;
  const put = (id, p) => {
    if (id && Array.isArray(p) && Number.isFinite(p[1]) && Number.isFinite(p[2])) out[id] = { d30: p[1] - b[1], d90: p[2] - b[2], c30: p[1], c90: p[2] };
  };
  (alt.coins || []).forEach((c) => put(c.id, c.p));
  Object.entries(alt.mine || {}).forEach(([id, p]) => put(id, p));
  out.__btc = { c30: b[1], c90: b[2] };
  return out;
}
function groupOf(c) {
  if (!c) return "other";
  if (String(c.sym || "").toUpperCase() === "BTC" && !c.catLocked && (!c.cat || c.cat === "layer1" || c.cat === "other")) return "btc";
  return c.cat || "other";
}
function allocationPlan(values, targets, { band = 5, cash = 0 } = {}) {
  const keys = [.../* @__PURE__ */ new Set([...Object.keys(values || {}), ...Object.keys(targets || {})])];
  const total = keys.reduce((s, k) => s + Math.max(0, num(values[k])), 0), T2 = total + Math.max(0, num(cash));
  const tg2 = (k) => targets && targets[k] ? num(targets[k].pct) / 100 : 0;
  const groups = keys.map((k) => {
    const v = Math.max(0, num(values[k])), now = total > 0 ? v / total * 100 : 0, target = tg2(k) * 100;
    return {
      key: k,
      value: v,
      now,
      target,
      drift: now - target,
      full: tg2(k) * total - v,
      need: Math.max(0, tg2(k) * T2 - v),
      add: 0,
      state: Math.abs(now - target) <= band ? "ok" : Math.abs(now - target) <= 2 * band ? "warn" : "off"
    };
  });
  const money = Math.max(0, num(cash)), need = groups.reduce((s, g) => s + g.need, 0);
  if (money > 0) {
    if (need >= money) groups.forEach((g) => {
      g.add = need > 0 ? g.need / need * money : 0;
    });
    else {
      const rest = money - need;
      groups.forEach((g) => {
        g.add = g.need + tg2(g.key) * rest;
      });
    }
  }
  groups.sort((a, b) => b.target - a.target || b.value - a.value);
  const off = groups.filter((g) => g.state !== "ok" && (g.target > 0 || g.value > 0));
  return { total, groups, band, onTarget: groups.length - off.length, count: groups.length, off };
}
var DAYMS = 864e5;
var dOf = (d) => Date.parse(d + "T00:00:00Z");
var isoD = (t) => new Date(t).toISOString().slice(0, 10);
var DCA_PER_MONTH = { week: 52 / 12, "2weeks": 26 / 12, month: 1 };
function cleanDca(s) {
  if (!s || typeof s !== "object") return null;
  const usd3 = num(s.usd), every = ["week", "2weeks", "month"].includes(s.every) ? s.every : null, day = Math.round(num(s.day, -1));
  if (!(usd3 > 0 && usd3 <= 1e9) || !every) return null;
  if (every === "month" ? !(day >= 1 && day <= 28) : !(day >= 0 && day <= 6)) return null;
  const since = typeof s.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.since) ? s.since : isoD(Date.now());
  return { usd: Math.round(usd3 * 100) / 100, every, day, since };
}
function dcaDue(s, from, to) {
  const c = cleanDca(s);
  if (!c) return [];
  const out = [], a = Math.max(dOf(c.since), dOf(from)), b = dOf(to);
  if (c.every === "month") {
    const d0 = new Date(a);
    let y = d0.getUTCFullYear(), m = d0.getUTCMonth();
    for (let i = 0; i < 1200; i++) {
      const t2 = Date.UTC(y, m, c.day);
      if (t2 > b) break;
      if (t2 >= a) out.push(isoD(t2));
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
    return out;
  }
  let t = dOf(c.since);
  while (new Date(t).getUTCDay() !== c.day) t += DAYMS;
  const step = (c.every === "week" ? 7 : 14) * DAYMS;
  if (t < a) t += Math.ceil((a - t) / step) * step;
  for (; t <= b && out.length < 2e3; t += step) out.push(isoD(t));
  return out;
}
function dcaNextAfter(c, d) {
  const n = dcaDue(c, isoD(dOf(d) + DAYMS), isoD(dOf(d) + 40 * DAYMS));
  return n[0] || null;
}
function dcaStatus(s, sym, txs, today) {
  const c = cleanDca(s);
  if (!c) return null;
  const S = String(sym || "").toUpperCase();
  const buys = (txs || []).filter((t) => t && t.type === "buy" && String(t.sym || "").toUpperCase() === S && t.date).map((t) => String(t.date).slice(0, 10)).sort();
  const boughtFor = (d) => {
    const lo = isoD(dOf(d) - 2 * DAYMS), hi = dcaNextAfter(c, d) || "9999-12-31";
    return buys.some((b) => b >= lo && b < hi);
  };
  const past = dcaDue(c, c.since, today), last = past.length ? past[past.length - 1] : null;
  const recent = past.slice(-6), kept = recent.filter(boughtFor).length;
  const done = last ? boughtFor(last) : false;
  const late = last && !done ? Math.round((dOf(today) - dOf(last)) / DAYMS) : 0;
  const next = last === today && !done ? today : dcaNextAfter(c, today);
  return { ...c, last, done, next, state: !last ? "upcoming" : done ? "done" : late === 0 ? "today" : "missed", late, kept, of: recent.length, perMonth: c.usd * DCA_PER_MONTH[c.every] };
}
function overallProgress(rows) {
  const valid = (rows || []).filter((r) => num(r && r.target) > 0);
  if (!valid.length) return { pct: 0, counted: 0, completed: 0 };
  const each = valid.map((r) => Math.min(Math.max(num(r.actual), 0) / num(r.target), 1));
  return { pct: each.reduce((a, b) => a + b, 0) / valid.length * 100, counted: valid.length, completed: each.filter((x) => x >= 1).length };
}

// tools/alerts-core.mjs
var APP = "https://drsamirsaad1981-design.github.io/samsam-portfolio/";
var TZ = "Asia/Riyadh";
var DEFAULTS = Object.freeze({
  lang: "en",
  brief: true,
  briefTime: "08:30",
  weekly: true,
  moves: true,
  movePct: 5,
  signals: true,
  plan: true,
  tp: true,
  macro: true,
  sentiment: true,
  etf: true,
  etfMin: 500,
  quiet: true,
  health: true,
  drift: true,
  dca: true,
  buy: true
});
var DEFAULT_SIGNAL = { reinforce: -5, sell: -20 };
var DEFAULT_EXIT_TARGETS = { btcD: 45.9, usdtHi: 3.73, usdtLo: 1.914, ethBtc: 0.085 };
var DEFAULT_EXIT_STEPS = { mults: [2, 3, 5], pcts: [25, 50, 25] };
var H = 36e5;
var DAY = 24 * H;
function settings(meta) {
  const a = meta && meta.alerts || {}, d = DEFAULTS, out = { ...d };
  for (const k of Object.keys(d)) if (k in a && typeof a[k] === typeof d[k]) out[k] = a[k];
  out.lang = a.lang === "ar" ? "ar" : "en";
  out.movePct = Math.min(50, Math.max(1, +out.movePct || d.movePct));
  out.etfMin = Math.min(1e4, Math.max(50, +out.etfMin || d.etfMin));
  if (!/^\d{2}:\d{2}$/.test(out.briefTime)) out.briefTime = d.briefTime;
  return out;
}
var esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function usd(v) {
  if (v == null || !isFinite(v)) return "\u2014";
  const a = Math.abs(v), s = v < 0 ? "\u2212" : "";
  if (a >= 1e9) return s + "$" + (a / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1) + "M";
  if (a >= 100) return s + "$" + a.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (a >= 1) return s + "$" + a.toFixed(2);
  if (a === 0) return "$0";
  return s + "$" + a.toPrecision(3);
}
var usd2 = (v) => (v < 0 ? "\u2212" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
var pct = (v, d = 2) => v == null || !isFinite(v) ? "\u2014" : (v > 0 ? "+" : v < 0 ? "\u2212" : "") + Math.abs(v).toFixed(d) + "%";
var signed = (v) => (v > 0 ? "+" : v < 0 ? "\u2212" : "") + usd(Math.abs(v)).replace("\u2212", "");
var dot = (v) => v > 0 ? "\u{1F7E2}" : v < 0 ? "\u{1F534}" : "\u26AA";
var flow = (v) => (v < 0 ? "\u2212" : "+") + (Math.abs(v) >= 1e9 ? "$" + (Math.abs(v) / 1e9).toFixed(2) + "B" : "$" + Math.round(Math.abs(v) / 1e6) + "M");
function local(now, opt) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opt }).format(new Date(now));
}
function localParts(now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, hour: +p.hour, weekday: p.weekday };
}
function priceSeries(file) {
  if (!file || !Array.isArray(file.p)) return null;
  let li = file.p.length - 1;
  while (li >= 0 && !(file.p[li] > 0)) li--;
  if (li < 0) return null;
  return {
    last: file.p[li],
    lastT: file.t0 + li * file.step,
    at: (t) => {
      const i = Math.round((t - file.t0) / file.step);
      for (let k = Math.min(i, li); k >= 0 && k >= i - 6; k--) if (file.p[k] > 0) return file.p[k];
      return null;
    }
  };
}
function summarize(user, market, now = Date.now()) {
  const meta = user.meta || {}, rows = [...market.top || [], ...market.top500 || []];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const idOf = (c) => c.cgId || (market.cgIds || {})[c.sym] || null;
  const prices = {}, info = {};
  for (const c of user.coins || []) {
    if (!c || !c.sym || c.removed) continue;
    const id = idOf(c), r = id && byId.get(id), s = id && market.series && market.series[id];
    const price2 = r && r.price > 0 ? r.price : s ? s.last : c.lastPrice > 0 ? c.lastPrice : null;
    const p24 = s && s.at(now - DAY), p7 = s && s.at(now - 7 * DAY);
    const ch24 = r && r.ch24 != null ? r.ch24 : price2 && p24 ? (price2 / p24 - 1) * 100 : null;
    const ch7 = r && r.ch7 != null ? r.ch7 : price2 && p7 ? (price2 / p7 - 1) * 100 : null;
    if (price2) prices[c.sym] = { usd: price2, ch24 };
    info[c.sym] = { id, ch24, ch7, p24: ch24 != null && price2 ? price2 / (1 + ch24 / 100) : null, p7: ch7 != null && price2 ? price2 / (1 + ch7 / 100) : null };
  }
  const pf = derivePortfolio(user.coins, user.txs, prices).filter((c) => c.qty > 1e-12);
  const rz = realizedPnl(user.coins, user.txs);
  const value = pf.reduce((s, c) => s + c.qty * c.currentPrice, 0), cost = pf.reduce((s, c) => s + c.qty * c.basePrice, 0);
  const value24 = pf.reduce((s, c) => s + c.qty * (info[c.sym].p24 || c.currentPrice), 0);
  const value7 = pf.reduce((s, c) => s + c.qty * (info[c.sym].p7 || c.currentPrice), 0);
  const total = value - cost + rz.total, invested = cost + rz.soldCost;
  const btcRow = byId.get("bitcoin"), btcSer = market.series && market.series.bitcoin;
  const btcNow = btcRow && btcRow.price || btcSer && btcSer.last || 0;
  const baselineBtc = meta.baseline && meta.baseline.btcPrice || 81162;
  const vs = vsBtcByCoin(user.coins, user.txs, { prices: Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, v.usd])), btcNow, btcAt: btcSer ? (t) => btcSer.at(t) : null, baselineBtc });
  let cp = 0, bp = 0, cb2 = 0, beat = 0, alts = 0;
  for (const c of pf) {
    const v = vs[c.sym];
    if (!v) continue;
    const k = c.qty * c.basePrice;
    cp += v.coinPct * k / 100;
    bp += v.btcPct * k / 100;
    cb2 += k;
    if (c.sym !== "BTC") {
      alts++;
      if (v.pct > 0) beat++;
    }
  }
  const rule = meta.signal && isFinite(meta.signal.reinforce) && isFinite(meta.signal.sell) ? meta.signal : DEFAULT_SIGNAL;
  const smart = meta.signalSmart !== false, rsMap = strengthMap(market.altPage);
  const signal = {}, coinRows = [];
  for (const c of pf) {
    const chg = c.basePrice > 0 ? (c.currentPrice / c.basePrice - 1) * 100 : 0;
    const si = signalFor({ sym: c.sym, chg, rules: rule, rs: info[c.sym].id ? rsMap[info[c.sym].id] : null, smart });
    signal[c.sym] = si.action === "convert" ? "sell" : si.action;
    coinRows.push({ sym: c.sym, value: c.qty * c.currentPrice, price: c.currentPrice, avg: c.basePrice, chg, qty: c.qty, ch24: info[c.sym].ch24, ch7: info[c.sym].ch7, why: si.why, rs: si.rs });
  }
  const sigMode = JSON.stringify({ r: rule.reinforce, s: rule.sell, smart });
  const counts = { reinforce: 0, sell: 0, hold: 0 };
  Object.values(signal).forEach((s) => counts[s]++);
  const held = Object.fromEntries(pf.map((c) => [c.sym.toUpperCase(), c.qty]));
  const plan = (user.accum || []).filter((a) => a && a.sym && a.targetQty > 0).map((a) => ({ sym: a.sym.toUpperCase(), target: +a.targetQty, actual: held[a.sym.toUpperCase()] || 0 }));
  const prog = overallProgress(plan.map((p) => ({ actual: p.actual, target: p.target })));
  const steps = meta.exitSteps && Array.isArray(meta.exitSteps.mults) ? meta.exitSteps : DEFAULT_EXIT_STEPS;
  const tps = [];
  for (const e of Array.isArray(meta.exitPlan) ? meta.exitPlan : []) {
    const c = pf.find((x) => x.sym === String(e.sym || "").toUpperCase());
    if (!c) continue;
    (e.tps || []).slice(0, 3).forEach((t, i) => {
      const auto = c.basePrice * (steps.mults[i] || DEFAULT_EXIT_STEPS.mults[i]);
      const lvl = t.lock === true ? +t.price : t.lock === false ? auto : +t.price > 0 ? +t.price : auto;
      if (lvl > 0) tps.push({ sym: c.sym, n: i + 1, level: lvl, price: c.currentPrice, pct: t.pct, mult: t.lock === true ? null : steps.mults[i] || null });
    });
  }
  const T2 = { ...DEFAULT_EXIT_TARGETS, ...meta.exitTargets || {} };
  const g = market.global || {}, d = g.dom || {};
  const ethbtc = market.altPage && Array.isArray(market.altPage.ethbtc) && market.altPage.ethbtc.length ? market.altPage.ethbtc[market.altPage.ethbtc.length - 1][1] : null;
  const macro = [
    { k: "btcD", now: d.btc, lvl: T2.btcD, met: d.btc != null && d.btc <= T2.btcD, op: "\u2264", dp: 1, unit: "%" },
    { k: "usdtD", now: d.usdt, lvl: T2.usdtHi, met: d.usdt != null && d.usdt <= T2.usdtHi, op: "\u2264", dp: 2, unit: "%" },
    { k: "ethBtc", now: ethbtc, lvl: T2.ethBtc, met: ethbtc != null && ethbtc >= T2.ethBtc, op: "\u2265", dp: 4, unit: "" }
  ];
  const today = localParts(now).date;
  const dca = (user.accum || []).filter((a) => a && a.sym && a.dca).map((a) => ({ sym: String(a.sym).toUpperCase(), s: dcaStatus(a.dca, a.sym, user.txs, today) })).filter((x) => x.s);
  const buyAt = (user.accum || []).filter((a) => a && a.sym && +a.alertPrice > 0).map((a) => {
    const sym = String(a.sym).toUpperCase();
    let price2 = prices[sym] && prices[sym].usd;
    if (!(price2 > 0)) {
      const id = a.cgId || (market.cgIds || {})[sym], r = id && byId.get(id), s = id && market.series && market.series[id];
      price2 = r && r.price > 0 ? r.price : s ? s.last : null;
    }
    const p = plan.find((x) => x.sym === sym), dc = dca.find((x) => x.sym === sym);
    return { sym, at: +a.alertPrice, price: price2, left: p ? Math.max(0, p.target - p.actual) : null, dcaToday: !!(dc && dc.s.state === "today") };
  }).filter((x) => x.price > 0);
  let alloc = null;
  const tg2 = meta.targets && typeof meta.targets === "object" ? meta.targets : null;
  const tlist = tg2 && Array.isArray(tg2.list) ? tg2.list : [];
  if (tlist.length) {
    const cats = Object.fromEntries(tlist.filter((x) => x && x.g && x.pct > 0).map((x) => [x.g, { pct: +x.pct }]));
    const names = Object.fromEntries([...Array.isArray(tg2.names) ? tg2.names : [], ...tlist].filter((x) => x && x.g).map((x) => [x.g, x.label || x.g]));
    const vals = {};
    for (const c of pf) {
      const g2 = groupOf(c);
      vals[g2] = (vals[g2] || 0) + c.qty * c.currentPrice;
    }
    const plan2 = allocationPlan(vals, cats, { band: +tg2.band || 5 });
    const shown = plan2.groups.filter((g2) => g2.target > 0 || g2.now >= 0.05);
    alloc = { band: plan2.band, groups: shown, onTarget: shown.filter((g2) => g2.state === "ok").length, count: shown.length, names, key: JSON.stringify([tlist, tg2.band]) };
  }
  const free7 = {};
  for (const r of freeCoins(user.txs, new Date(now - 7 * DAY).toISOString())) {
    const f = free7[r.sym] || (free7[r.sym] = { sym: r.sym, qty: 0, usd: 0 });
    f.qty += r.qty;
    f.usd += r.qty * (prices[r.sym] && prices[r.sym].usd || 0);
  }
  const free = Object.values(free7).sort((a, b) => b.usd - a.usd);
  return {
    alloc,
    dca,
    free,
    value,
    cost,
    total,
    invested,
    pctTotal: invested > 0 ? total / invested * 100 : 0,
    ch24: value24 > 0 ? (value / value24 - 1) * 100 : null,
    d24: value - value24,
    ch7: value7 > 0 ? (value / value7 - 1) * 100 : null,
    d7: value - value7,
    vsBtc: cb2 > 0 ? (cp - bp) / cb2 * 100 : null,
    beat,
    alts,
    coins: coinRows,
    signal,
    sigMode,
    counts,
    plan,
    prog,
    tps,
    macro,
    btcNow,
    buyAt,
    btc24: btcRow ? btcRow.ch24 : null,
    btc7: btcRow ? btcRow.ch7 : null
  };
}
var STABLE_RX = /^(USDT|USDC|DAI|FDUSD|USDE|TUSD|PYUSD|USDS|BUSD|USD1|RLUSD|FRAX|USDD|GUSD|EURC|EURS|USDX|USDF|USDG|USDTB|BFUSD|SUSDE|SUSDS|USD0|LUSD|CRVUSD|GHO|XAUT|PAXG|BSC-USD|USDP|USDB|USDA|DOLA|USDL|USDY|BUIDL|USTB|USYC|OUSG|FDIT|USX|AUSD|DEUSD|USR|RUSD)$/;
var isStable = (sym) => STABLE_RX.test(String(sym || "").toUpperCase());
function etfDay(etf) {
  if (!etf || !etf.btc || !etf.btc.days || !etf.btc.days.length) return null;
  const b = etf.btc.days[etf.btc.days.length - 1], e = etf.eth && etf.eth.days && etf.eth.days.find((x) => x[0] === b[0]);
  return { date: b[0], label: (/* @__PURE__ */ new Date(b[0] + "T12:00:00Z")).toLocaleDateString("en-US", { month: "short", day: "numeric" }), btc: b[1], eth: e ? e[1] : 0 };
}

// tools/worker/cg-ids.json
var cg_ids_default = { APT: "aptos", ARB: "arbitrum", ATOM: "cosmos", AVAIL: "avail", AVAX: "avalanche-2", BNB: "binancecoin", BTC: "bitcoin", CRO: "crypto-com-chain", DOGE: "dogecoin", DOT: "polkadot", ENS: "ethereum-name-service", ETH: "ethereum", FLR: "flare-networks", GLMR: "moonbeam", GRAM: "the-open-network", HBAR: "hedera-hashgraph", ICP: "internet-computer", JUP: "jupiter-exchange-solana", KAS: "kaspa", KAVA: "kava", KSM: "kusama", LINK: "chainlink", MNT: "mantle", MON: "monad", MOVR: "moonriver", NEAR: "near", NIGHT: "midnight-3", ONDO: "ondo-finance", OP: "optimism", POL: "polygon-ecosystem-token", PONS: "pons-2", PYTH: "pyth-network", QNT: "quant-network", RENDER: "render-token", SEI: "sei-network", SOL: "solana", STRK: "starknet", SUI: "sui", TAO: "bittensor", VET: "vechain", VTHO: "vethor-token", WLD: "worldcoin-wld", XDC: "xdce-crowd-sale", XPL: "plasma" };

// tools/worker/data.mjs
var RAW = "https://raw.githubusercontent.com/drsamirsaad1981-design/samsam-portfolio/prices/";
var CG = "https://api.coingecko.com/api/v3";
var cache = /* @__PURE__ */ new Map();
async function cached(key, ms, make) {
  const hit = cache.get(key);
  if (hit && Date.now() < hit.until) return hit.value;
  const value = await make();
  cache.set(key, { until: Date.now() + ms, value });
  return value;
}
async function getJson(url2, init) {
  try {
    const r = await fetch(url2, init);
    if (!r.ok) return null;
    return await r.json();
  } catch (_) {
    return null;
  }
}
async function loadMarket(ids = []) {
  const base = await cached("market", 6e4, async () => {
    const [m, t5, alt, etf] = await Promise.all(["m/market.json", "m/top500.json", "m/alt.json", "m/etf.json"].map((f) => getJson(RAW + f)));
    return { m: m || {}, t5: t5 || {}, alt, etf };
  });
  const want = [.../* @__PURE__ */ new Set(["bitcoin", ...ids.filter(Boolean)])];
  const series = {};
  await Promise.all(want.map(async (id) => {
    const s = await cached("p:" + id, 10 * 6e4, async () => priceSeries(await getJson(RAW + "p/" + id + ".json")));
    if (s) series[id] = s;
  }));
  const top = (base.m.top || []).map((r) => ({ ...r })), top500 = (base.t5.top || []).map((r) => ({ ...r }));
  const market = { top, top500, global: base.m.global, fng: base.m.fng, alt: base.m.alt, parts: base.m.parts, series, altPage: base.alt, etf: base.etf, cgIds: cg_ids_default, live: {} };
  await liveTopUp(market, want);
  const btc = market.top.find((r) => r.id === "bitcoin");
  market.btc = btc ? { price: btc.price, ch24: btc.ch24 } : series.bitcoin ? { price: series.bitcoin.last, ch24: null } : null;
  market.priceT = Date.now();
  return market;
}
async function liveTopUp(market, ids) {
  if (!ids.length) return;
  const key = "live:" + ids.slice().sort().join(",");
  const j = await cached(key, 45e3, () => getJson(`${CG}/simple/price?ids=${encodeURIComponent(ids.slice(0, 250).join(","))}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`, { headers: { accept: "application/json" } }));
  if (!j) {
    market.liveOk = false;
    return;
  }
  market.liveOk = true;
  const rows = new Map([...market.top, ...market.top500].map((r) => [r.id, r]));
  for (const [id, v] of Object.entries(j)) {
    if (!v || !(v.usd > 0)) continue;
    market.live[id] = true;
    const r = rows.get(id);
    if (r) {
      r.price = v.usd;
      if (v.usd_24h_change != null) r.ch24 = v.usd_24h_change;
      if (v.usd_market_cap) r.mcap = v.usd_market_cap;
      if (v.usd_24h_vol) r.vol = v.usd_24h_vol;
    } else market.top500.push({ id, sym: "", name: "", price: v.usd, ch24: v.usd_24h_change, mcap: v.usd_market_cap, vol: v.usd_24h_vol, extra: true });
  }
}
async function findCoin(q, market, user) {
  const s = String(q || "").trim(), S = s.toUpperCase().replace(/^\$/, "");
  if (!S) return null;
  const mine = (user && user.coins || []).find((c2) => c2 && String(c2.sym || "").toUpperCase() === S && !c2.removed);
  if (mine && (mine.cgId || cg_ids_default[S])) return { id: mine.cgId || cg_ids_default[S], sym: S, name: mine.name || "" };
  const rows = [...market.top, ...market.top500].filter((r) => r.sym);
  const bySym = rows.filter((r) => String(r.sym).toUpperCase() === S).sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9))[0];
  if (cg_ids_default[S]) {
    const r = rows.find((x) => x.id === cg_ids_default[S]);
    return { id: cg_ids_default[S], sym: S, name: r ? r.name : "" };
  }
  if (bySym) return { id: bySym.id, sym: S, name: bySym.name };
  const byName = rows.find((r) => String(r.name || "").toLowerCase() === s.toLowerCase() || r.id === s.toLowerCase());
  if (byName) return { id: byName.id, sym: String(byName.sym).toUpperCase(), name: byName.name };
  const j = await cached("search:" + s.toLowerCase(), 36e5, () => getJson(`${CG}/search?query=${encodeURIComponent(s)}`));
  const c = j && (j.coins || []).sort((a, b) => (String(b.symbol).toUpperCase() === S) - (String(a.symbol).toUpperCase() === S) || (a.market_cap_rank || 1e9) - (b.market_cap_rank || 1e9))[0];
  return c ? { id: c.id, sym: String(c.symbol || "").toUpperCase(), name: c.name, rank: c.market_cap_rank } : null;
}
var tokenCache = null;
var b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
var b64urlJson = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
function pemBytes(pem) {
  const b = atob(String(pem).replace(/-----[^-]+-----/g, "").replace(/\\n/g, "").replace(/\s+/g, ""));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
async function googleToken(sa) {
  if (tokenCache && tokenCache.until > Date.now() && tokenCache.email === sa.client_email) return tokenCache.token;
  const now = Math.floor(Date.now() / 1e3), aud = sa.token_uri || "https://oauth2.googleapis.com/token";
  const body = b64urlJson({ alg: "RS256", typ: "JWT" }) + "." + b64urlJson({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore", aud, iat: now, exp: now + 3600 });
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(body));
  const r = await fetch(aud, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: body + "." + b64url(sig) }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Firebase sign-in refused (" + r.status + ")");
  tokenCache = { token: j.access_token, until: Date.now() + 50 * 6e4, email: sa.client_email };
  return j.access_token;
}
function dec(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return fields(v.mapValue.fields);
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(dec);
  return null;
}
var fields = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, dec(v)]));
function serviceAccount(env) {
  try {
    const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT || "");
    return sa && sa.client_email && sa.private_key && sa.project_id ? sa : null;
  } catch (_) {
    return null;
  }
}
async function firestore(sa) {
  const token = await googleToken(sa), base = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;
  const call = async (url2, init = {}) => {
    const r = await fetch(url2, { ...init, headers: { authorization: "Bearer " + token, "content-type": "application/json", ...init.headers || {} } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("Firestore " + r.status);
    return r.json();
  };
  return {
    async users() {
      const rows = await call(base + ":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "meta", allDescendants: true }], limit: 200 } }) }) || [];
      return [...new Set(rows.map((x) => x.document && x.document.name).filter((n) => n && /\/users\/[^/]+\/meta\/info$/.test(n)).map((n) => n.match(/\/users\/([^/]+)\/meta\/info$/)[1]))];
    },
    async list(p) {
      const out = [];
      let tok = "";
      do {
        const j = await call(`${base}/${p}?pageSize=300${tok ? "&pageToken=" + encodeURIComponent(tok) : ""}`);
        if (!j) break;
        (j.documents || []).forEach((d) => out.push(fields(d.fields)));
        tok = j.nextPageToken || "";
      } while (tok);
      return out;
    },
    async get(p) {
      const j = await call(`${base}/${p}`);
      return j ? fields(j.fields) : null;
    }
  };
}
async function loadUser(env, fresh = false) {
  const sa = serviceAccount(env);
  if (!sa) return null;
  if (fresh) cache.delete("user");
  return cached("user", 6e4, async () => {
    const db = await firestore(sa), users = await db.users();
    if (!users.length) return null;
    const uid = env.FIREBASE_UID && users.includes(env.FIREBASE_UID) ? env.FIREBASE_UID : users[0];
    const [coins, txs, accum, meta] = await Promise.all([db.list(`users/${uid}/coins`), db.list(`users/${uid}/txs`), db.list(`users/${uid}/accum`), db.get(`users/${uid}/meta/info`)]);
    return { coins, txs, accum, meta: meta || {} };
  });
}
var cgIdOf = (c, market) => c.cgId || (market.cgIds || cg_ids_default)[String(c.sym || "").toUpperCase()] || null;

// tools/worker/bot.mjs
var H2 = 36e5;
var LIQ = "https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=";
var T = {
  en: {
    hi: "Hi Samir \u{1F44B}",
    menuTitle: "What would you like to see?",
    pf: "\u{1F4BC} Portfolio",
    coin: "\u{1FA99} A coin",
    market: "\u{1F30D} Market",
    plan: "\u{1F4CB} Plan",
    movers: "\u{1F3C6} Best & worst",
    signals: "\u{1F3AF} Signals",
    refresh: "\u{1F504} Refresh",
    back: "\u2B05\uFE0F Menu",
    openApp: "\u{1F4F1} Open the app",
    liq: "\u{1F525} Liq Map",
    chart: "\u{1F4C8} Chart",
    inApp: "\u{1F4BC} In the app",
    pfNow: "Your portfolio now",
    askCoin: "Send a ticker or a name \u2014 e.g. <code>btc</code>, <code>sol eth</code> or <code>pendle</code>.",
    notFound: (q) => `I couldn't find \u201C${q}\u201D. Try the ticker (e.g. <code>sol</code>) or the full name.`,
    noUser: "Your portfolio is not connected yet (FIREBASE_SERVICE_ACCOUNT is missing in the Worker).",
    soon: "Talking to me in plain words arrives in the next phase. For now: tap a button, or send a ticker like <code>btc</code>.",
    err: "Something went wrong on my side \u2014 please try again in a minute.",
    rank: "Rank",
    cap: "Cap",
    vol: "Vol 24h",
    h24: "24h",
    d7: "7d",
    d30: "30d",
    you: "You hold",
    avg: "avg",
    signal: "Signal",
    noHold: "You don't hold it.",
    live: "live",
    snap: (m) => `snapshot ${m} min old`,
    src: "CoinGecko",
    planT: "Accumulation plan",
    overall: "Overall",
    done: "done",
    left: "left",
    dca: "Regular buys (DCA)",
    next: "next",
    buyAt: "Buy-price alerts",
    away: "away",
    noPlan: "No plan targets yet \u2014 set them on the Accumulation page.",
    best24: "Best 24h",
    worst24: "Worst 24h",
    best7: "Best 7d",
    worst7: "Worst 7d",
    mvT: "Best & worst (your coins)",
    noStable: "stablecoins left out",
    sigT: "Signals",
    reinforce: "\u{1F7E2} Reinforce",
    sell: "\u{1F534} Sell / convert to BTC",
    hold: "\u26AA Hold",
    vsAvg: "vs your avg",
    mkT: "Market",
    topUp: "Top 500 \xB7 best 24h",
    topDn: "Top 500 \xB7 worst 24h",
    updated: "Updated",
    futures: "Futures",
    yes: "yes",
    private: "",
    welcome: "Your bot is connected \u2705\nIt answers here any time. Tap a button below, or send a ticker like <code>btc</code>.",
    other: "\u{1F310} \u0639\u0631\u0628\u064A",
    otherCode: "ar",
    langSet: "Language: English \u2705",
    exit: "\u{1F6AA} Exit plan",
    today: "today",
    profit: "All Time Profit",
    vsBtcS: "vs BTC",
    beat: (a, n) => `${a}/${n} coins beat BTC`,
    bestT: "Best today",
    worstT: "Worst today",
    dom: "Dominance",
    fng: "Fear & Greed",
    altS: "Altcoin Season",
    etf: "ETF",
    planS: "Plan",
    allocS: "Allocation",
    onT: (a, n) => `${a}/${n} on target`,
    dcaS: (n, mo) => `${n} buys \xB7 ${mo}/mo`,
    exitS: (n) => `Exit ${n}/3`,
    nearTp: "next TP",
    exitT: "Exit plan",
    conds: "Exit conditions",
    met3: (n) => `${n} of 3 met`,
    btcD: "BTC dominance",
    usdtD: "USDT dominance",
    ethBtc: "ETH/BTC",
    tpT: "Take-profit levels",
    toGo: "to go",
    sellP: (p) => `sell ${p}%`,
    reached: "reached",
    noExit: "No take-profit levels yet \u2014 set them on the Exit Strategy page.",
    openExit: "\u{1F6AA} Open Exit Strategy",
    allExit: "All 3 conditions met \u2014 your exit zone",
    kb: { pf: "\u{1F4BC} Portfolio", market: "\u{1F30D} Market", plan: "\u{1F4CB} Plan", movers: "\u{1F3C6} Best & worst" }
  },
  ar: {
    hi: "\u0623\u0647\u0644\u0627\u064B \u0633\u0645\u064A\u0631 \u{1F44B}",
    menuTitle: "\u062A\u062D\u0628 \u062A\u0634\u0648\u0641 \u0625\u064A\u0647\u061F",
    pf: "\u{1F4BC} \u0645\u062D\u0641\u0638\u062A\u064A",
    coin: "\u{1FA99} \u0639\u0645\u0644\u0629",
    market: "\u{1F30D} \u0627\u0644\u0633\u0648\u0642",
    plan: "\u{1F4CB} \u0627\u0644\u062E\u0637\u0629",
    movers: "\u{1F3C6} \u0627\u0644\u0623\u0641\u0636\u0644 \u0648\u0627\u0644\u0623\u0633\u0648\u0623",
    signals: "\u{1F3AF} \u0627\u0644\u0625\u0634\u0627\u0631\u0627\u062A",
    refresh: "\u{1F504} \u062A\u062D\u062F\u064A\u062B",
    back: "\u2B05\uFE0F \u0627\u0644\u0642\u0627\u0626\u0645\u0629",
    openApp: "\u{1F4F1} \u0627\u0641\u062A\u062D \u0627\u0644\u062A\u0637\u0628\u064A\u0642",
    liq: "\u{1F525} Liq Map",
    chart: "\u{1F4C8} \u0627\u0644\u0631\u0633\u0645",
    inApp: "\u{1F4BC} \u0641\u064A \u0627\u0644\u062A\u0637\u0628\u064A\u0642",
    pfNow: "\u0645\u062D\u0641\u0638\u062A\u0643 \u0627\u0644\u0622\u0646",
    askCoin: "\u0627\u0628\u0639\u062A \u0631\u0645\u0632 \u0627\u0644\u0639\u0645\u0644\u0629 \u0623\u0648 \u0627\u0633\u0645\u0647\u0627 \u2014 \u0645\u062B\u0644\u0627\u064B <code>btc</code> \u0623\u0648 <code>sol eth</code> \u0623\u0648 <code>pendle</code>.",
    notFound: (q) => `\u0645\u0627 \u0644\u0642\u064A\u062A\u0634 \xAB${q}\xBB. \u062C\u0631\u0651\u0628 \u0627\u0644\u0631\u0645\u0632 (\u0645\u062B\u0644\u0627\u064B <code>sol</code>) \u0623\u0648 \u0627\u0644\u0627\u0633\u0645 \u0643\u0627\u0645\u0644.`,
    noUser: "\u0627\u0644\u0645\u062D\u0641\u0638\u0629 \u0644\u0633\u0647 \u0645\u0634 \u0645\u062A\u0648\u0635\u0644\u0629 (FIREBASE_SERVICE_ACCOUNT \u0646\u0627\u0642\u0635 \u0641\u064A \u0627\u0644\u0640 Worker).",
    soon: "\u0627\u0644\u0643\u0644\u0627\u0645 \u0627\u0644\u0639\u0627\u062F\u064A \u0645\u0639\u0627\u064A\u0627 \u062C\u0627\u064A \u0641\u064A \u0627\u0644\u0645\u0631\u062D\u0644\u0629 \u0627\u0644\u062C\u0627\u064A\u0629. \u062F\u0644\u0648\u0642\u062A\u064A: \u0627\u0636\u063A\u0637 \u0632\u0631\u0627\u0631\u060C \u0623\u0648 \u0627\u0628\u0639\u062A \u0631\u0645\u0632 \u0639\u0645\u0644\u0629 \u0632\u064A <code>btc</code>.",
    err: "\u062D\u0635\u0644\u062A \u0645\u0634\u0643\u0644\u0629 \u0639\u0646\u062F\u064A \u2014 \u062C\u0631\u0651\u0628 \u062A\u0627\u0646\u064A \u0628\u0639\u062F \u062F\u0642\u064A\u0642\u0629.",
    rank: "\u0627\u0644\u062A\u0631\u062A\u064A\u0628",
    cap: "\u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0633\u0648\u0642\u064A\u0629",
    vol: "\u0627\u0644\u062A\u062F\u0627\u0648\u0644 24\u0633",
    h24: "24\u0633",
    d7: "7 \u0623\u064A\u0627\u0645",
    d30: "30 \u064A\u0648\u0645",
    you: "\u0645\u0639\u0627\u0643",
    avg: "\u0645\u062A\u0648\u0633\u0637\u0643",
    signal: "\u0627\u0644\u0625\u0634\u0627\u0631\u0629",
    noHold: "\u0645\u0634 \u0645\u0639\u0627\u0643.",
    live: "\u0645\u0628\u0627\u0634\u0631",
    snap: (m) => `\u0645\u0646 ${m} \u062F\u0642\u064A\u0642\u0629`,
    src: "CoinGecko",
    planT: "\u062E\u0637\u0629 \u0627\u0644\u062A\u062C\u0645\u064A\u0639",
    overall: "\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A",
    done: "\u062A\u0645",
    left: "\u0628\u0627\u0642\u064A",
    dca: "\u0627\u0644\u0634\u0631\u0627\u0621 \u0627\u0644\u0645\u0646\u062A\u0638\u0645 (DCA)",
    next: "\u0627\u0644\u062A\u0627\u0644\u064A",
    buyAt: "\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0633\u0639\u0631 \u0627\u0644\u0634\u0631\u0627\u0621",
    away: "\u0628\u0639\u064A\u062F",
    noPlan: "\u0645\u0641\u064A\u0634 \u0623\u0647\u062F\u0627\u0641 \u0641\u064A \u0627\u0644\u062E\u0637\u0629 \u0644\u0633\u0647 \u2014 \u062D\u0637\u0647\u0627 \u0645\u0646 \u0635\u0641\u062D\u0629 Accumulation.",
    best24: "\u0627\u0644\u0623\u0641\u0636\u0644 24\u0633",
    worst24: "\u0627\u0644\u0623\u0633\u0648\u0623 24\u0633",
    best7: "\u0627\u0644\u0623\u0641\u0636\u0644 7 \u0623\u064A\u0627\u0645",
    worst7: "\u0627\u0644\u0623\u0633\u0648\u0623 7 \u0623\u064A\u0627\u0645",
    mvT: "\u0627\u0644\u0623\u0641\u0636\u0644 \u0648\u0627\u0644\u0623\u0633\u0648\u0623 (\u0639\u0645\u0644\u0627\u062A\u0643)",
    noStable: "\u0645\u0646 \u063A\u064A\u0631 \u0627\u0644\u0640 stablecoins",
    sigT: "\u0627\u0644\u0625\u0634\u0627\u0631\u0627\u062A",
    reinforce: "\u{1F7E2} \u062A\u0639\u0632\u064A\u0632",
    sell: "\u{1F534} \u0628\u064A\u0639 / \u062A\u062D\u0648\u064A\u0644 \u0644\u0640 BTC",
    hold: "\u26AA \u0627\u062D\u062A\u0641\u0627\u0638",
    vsAvg: "\u0645\u0642\u0627\u0628\u0644 \u0645\u062A\u0648\u0633\u0637\u0643",
    mkT: "\u0627\u0644\u0633\u0648\u0642",
    topUp: "\u0623\u0639\u0644\u0649 500 \xB7 \u0627\u0644\u0623\u0641\u0636\u0644 24\u0633",
    topDn: "\u0623\u0639\u0644\u0649 500 \xB7 \u0627\u0644\u0623\u0633\u0648\u0623 24\u0633",
    updated: "\u062A\u062D\u062F\u064A\u062B",
    futures: "Futures",
    yes: "\u0623\u064A\u0648\u0647",
    private: "",
    welcome: "\u0627\u0644\u0628\u0648\u062A \u0627\u062A\u0648\u0635\u0644 \u2705\n\u0628\u064A\u0631\u062F \u0639\u0644\u064A\u0643 \u0647\u0646\u0627 \u0641\u064A \u0623\u064A \u0648\u0642\u062A. \u0627\u0636\u063A\u0637 \u0632\u0631\u0627\u0631 \u062A\u062D\u062A\u060C \u0623\u0648 \u0627\u0628\u0639\u062A \u0631\u0645\u0632 \u0639\u0645\u0644\u0629 \u0632\u064A <code>btc</code>.",
    other: "\u{1F310} English",
    otherCode: "en",
    langSet: "\u0627\u0644\u0644\u063A\u0629: \u0639\u0631\u0628\u064A \u2705",
    exit: "\u{1F6AA} \u062E\u0637\u0629 \u0627\u0644\u062E\u0631\u0648\u062C",
    today: "\u0627\u0644\u064A\u0648\u0645",
    profit: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0631\u0628\u062D",
    vsBtcS: "\u0645\u0642\u0627\u0628\u0644 BTC",
    beat: (a, n) => `${a}/${n} \u0639\u0645\u0644\u0629 \u0633\u0628\u0642\u062A BTC`,
    bestT: "\u0627\u0644\u0623\u0641\u0636\u0644 \u0627\u0644\u064A\u0648\u0645",
    worstT: "\u0627\u0644\u0623\u0633\u0648\u0623 \u0627\u0644\u064A\u0648\u0645",
    dom: "\u0627\u0644\u0633\u064A\u0637\u0631\u0629",
    fng: "\u0627\u0644\u062E\u0648\u0641 \u0648\u0627\u0644\u0637\u0645\u0639",
    altS: "\u0645\u0648\u0633\u0645 \u0627\u0644\u0639\u0645\u0644\u0627\u062A",
    etf: "ETF",
    planS: "\u0627\u0644\u062E\u0637\u0629",
    allocS: "\u0627\u0644\u062A\u0648\u0632\u064A\u0639",
    onT: (a, n) => `${a}/${n} \u0639\u0644\u0649 \u0627\u0644\u0647\u062F\u0641`,
    dcaS: (n, mo) => `${n} \u0634\u0631\u0627\u0621 \xB7 ${mo}/\u0634\u0647\u0631`,
    exitS: (n) => `\u0627\u0644\u062E\u0631\u0648\u062C ${n}/3`,
    nearTp: "\u0623\u0642\u0631\u0628 TP",
    exitT: "\u062E\u0637\u0629 \u0627\u0644\u062E\u0631\u0648\u062C",
    conds: "\u0634\u0631\u0648\u0637 \u0627\u0644\u062E\u0631\u0648\u062C",
    met3: (n) => `\u062A\u062D\u0642\u0642 ${n} \u0645\u0646 3`,
    btcD: "\u0633\u064A\u0637\u0631\u0629 BTC",
    usdtD: "\u0633\u064A\u0637\u0631\u0629 USDT",
    ethBtc: "ETH/BTC",
    tpT: "\u0645\u0633\u062A\u0648\u064A\u0627\u062A \u062C\u0646\u064A \u0627\u0644\u0623\u0631\u0628\u0627\u062D",
    toGo: "\u0628\u0627\u0642\u064A",
    sellP: (p) => `\u0628\u064A\u0639 ${p}%`,
    reached: "\u0648\u0635\u0644",
    noExit: "\u0645\u0641\u064A\u0634 \u0645\u0633\u062A\u0648\u064A\u0627\u062A \u062C\u0646\u064A \u0623\u0631\u0628\u0627\u062D \u0644\u0633\u0647 \u2014 \u062D\u0637\u0647\u0627 \u0645\u0646 \u0635\u0641\u062D\u0629 Exit Strategy.",
    openExit: "\u{1F6AA} \u0627\u0641\u062A\u062D Exit Strategy",
    allExit: "\u0627\u0644\u0634\u0631\u0648\u0637 \u0627\u0644\u0640 3 \u0627\u062A\u062D\u0642\u0642\u062A \u2014 \u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u062E\u0631\u0648\u062C",
    kb: { pf: "\u{1F4BC} \u0645\u062D\u0641\u0638\u062A\u064A", market: "\u{1F30D} \u0627\u0644\u0633\u0648\u0642", plan: "\u{1F4CB} \u0627\u0644\u062E\u0637\u0629", movers: "\u{1F3C6} \u0627\u0644\u0623\u0641\u0636\u0644 \u0648\u0627\u0644\u0623\u0633\u0648\u0623" }
  }
};
var cb = (text, data) => ({ text, callback_data: data });
var url = (text, u) => ({ text, url: u });
var price = (v) => !(v > 0) ? "\u2014" : v >= 1e3 ? usd2(v).replace(/\.\d\d$/, "") : v >= 1 ? usd2(v) : "$" + (+v.toPrecision(4)).toString();
var big = (v) => !(v > 0) ? "\u2014" : v >= 1e12 ? "$" + (v / 1e12).toFixed(2) + "T" : v >= 1e9 ? "$" + (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : usd(v);
var qty = (v) => +Number(v).toPrecision(6) + "";
var BARS = "\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588";
function spark(arr, n = 16) {
  const a = (arr || []).filter((x) => x > 0);
  if (a.length < 4) return "";
  const pts = Array.from({ length: n }, (_, i) => a[Math.round(i * (a.length - 1) / (n - 1))]);
  const lo = Math.min(...pts), hi = Math.max(...pts);
  return pts.map((v) => BARS[hi > lo ? Math.round((v - lo) / (hi - lo) * 7) : 3]).join("");
}
var menuRows = (t) => [[cb(t.pf, "pf"), cb(t.market, "mk")], [cb(t.plan, "pl"), cb(t.movers, "mv")], [cb(t.signals, "sg"), cb(t.exit, "ex")], [cb(t.coin, "coin"), cb(t.other, "lang:" + t.otherCode)]];
var replyKb = (t) => ({ keyboard: [[{ text: t.kb.pf }, { text: t.kb.market }], [{ text: t.kb.plan }, { text: t.kb.movers }]], resize_keyboard: true, is_persistent: true });
var memLang = null;
async function getLang(env) {
  let v = memLang;
  try {
    if (env.RATE) v = await env.RATE.get("tg:lang") || v;
  } catch (_) {
  }
  if (v === "ar" || v === "en") return v;
  return env.BOT_LANG === "ar" ? "ar" : "en";
}
async function setLang(env, v) {
  memLang = v;
  try {
    if (env.RATE) await env.RATE.put("tg:lang", v);
  } catch (_) {
  }
}
function viewMenu(t) {
  return { text: `${t.hi}
${t.menuTitle}`, buttons: menuRows(t) };
}
var hm = (now) => local(now, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
var row = (sym, v, extra) => `<code>${esc(String(sym).toUpperCase().padEnd(6))}${pct(v, 1).padStart(7)}</code> ${extra}`;
function moverRows(sum, key, dir, n = 5) {
  return sum.coins.filter((c) => c[key] != null && c.value >= 1 && !isStable(c.sym)).sort((a, b) => dir * (b[key] - a[key])).slice(0, n).filter((c) => dir > 0 ? c[key] > 0 : c[key] < 0);
}
function marketShort(t, m) {
  const g = m.global || {}, d = g.dom || {}, out = [];
  if (m.btc) out.push(`BTC <b>${usd(m.btc.price)}</b> ${dot(m.btc.ch24)} ${pct(m.btc.ch24)}`);
  if (d.btc != null) out.push(`${t.dom} BTC ${d.btc.toFixed(1)}% \xB7 USDT ${(d.usdt || 0).toFixed(2)}%`);
  if (m.fng) out.push(`${esc(t.fng)} <b>${m.fng.value}</b> \xB7 ${esc(m.fng.label)}`);
  if (m.alt && m.alt.value != null) out.push(`${t.altS} <b>${m.alt.value}</b> \xB7 ${esc(m.alt.label)}`);
  const e = etfDay(m.etf);
  if (e) out.push(`${t.etf} ${e.label} \xB7 BTC ${flow(e.btc)} \xB7 ETH ${flow(e.eth)}`);
  return out;
}
var nearestTp = (sum) => (sum.tps || []).filter((x) => x.price < x.level).map((x) => ({ ...x, to: (x.level / x.price - 1) * 100 })).sort((a, b) => a.to - b.to)[0];
function viewPortfolio(t, cfg, sum, m, now) {
  const L = [`\u{1F4BC} <b>${t.pfNow}</b> \xB7 ${hm(now)}`, "", `<b>${usd2(sum.value)}</b>`];
  if (sum.ch24 != null) L.push(`${dot(sum.ch24)} ${pct(sum.ch24)} \xB7 ${signed(sum.d24)} ${t.today}`);
  L.push(`${t.profit} <b>${signed(sum.total)}</b> \xB7 ${pct(sum.pctTotal, 1)}`);
  if (sum.vsBtc != null) L.push(`${t.vsBtcS} ${dot(sum.vsBtc)} ${pct(sum.vsBtc)} \xB7 ${t.beat(sum.beat, sum.alts)}`);
  const up = moverRows(sum, "ch24", 1), dn = moverRows(sum, "ch24", -1);
  if (up.length) L.push("", `\u{1F4C8} <b>${t.bestT}</b>`, ...up.map((c) => row(c.sym, c.ch24, usd(c.value))));
  if (dn.length) L.push("", `\u{1F4C9} <b>${t.worstT}</b>`, ...dn.map((c) => row(c.sym, c.ch24, usd(c.value))));
  const mk = marketShort(t, m);
  if (mk.length) L.push("", `\u{1F30D} <b>${t.mkT}</b>`, ...mk);
  L.push("", `\u{1F3AF} ${t.sigT} \u{1F7E2} ${sum.counts.reinforce} \xB7 \u{1F534} ${sum.counts.sell} \xB7 \u26AA ${sum.counts.hold}`);
  if (sum.plan.length) L.push(`\u{1F4CB} ${t.planS} <b>${sum.prog.pct.toFixed(1)}%</b> \xB7 ${sum.prog.completed}/${sum.prog.counted} \u2705`);
  if (sum.alloc) L.push(`\u2696\uFE0F ${t.allocS} ${t.onT(sum.alloc.onTarget, sum.alloc.count)}`);
  if ((sum.dca || []).length) L.push(`\u{1F6D2} DCA ${t.dcaS(sum.dca.length, usd(sum.dca.reduce((a, x) => a + x.s.perMonth, 0)))}`);
  const mc = sum.macro.filter((x) => x.met).length, tp = nearestTp(sum);
  L.push(`\u{1F6AA} ${t.exitS(mc)}${tp ? ` \xB7 ${t.nearTp} ${esc(tp.sym)} +${tp.to.toFixed(0)}%` : ""}`);
  return { text: L.join("\n"), buttons: [[cb(t.refresh, "pf"), cb(t.movers, "mv")], [cb(t.plan, "pl"), cb(t.exit, "ex")], [cb(t.signals, "sg"), url(t.openApp, APP)], [cb(t.back, "menu")]] };
}
function viewExit(t, sum, now) {
  const mc = sum.macro.filter((x) => x.met).length, name = { btcD: t.btcD, usdtD: t.usdtD, ethBtc: t.ethBtc };
  const L = [`\u{1F6AA} <b>${t.exitT}</b> \xB7 ${hm(now)}`, "", `\u{1F9ED} <b>${t.conds}</b> \xB7 ${t.met3(mc)}`];
  for (const x of sum.macro) {
    const v = (n) => n == null ? "\u2014" : n.toFixed(x.dp) + x.unit;
    L.push(`${x.met ? "\u2705" : "\u2B1C"} ${name[x.k]} ${v(x.now)} \u2192 ${x.op} ${v(x.lvl)}`);
  }
  if (mc === 3) L.push(`\u{1F514} <b>${t.allExit}</b>`);
  const tps = (sum.tps || []).map((x) => ({ ...x, to: (x.level / x.price - 1) * 100 })).sort((a, b) => a.to - b.to);
  L.push("", `\u{1F3AF} <b>${t.tpT}</b>`);
  if (!tps.length) L.push(t.noExit);
  const bySym = /* @__PURE__ */ new Map();
  tps.forEach((x) => {
    if (!bySym.has(x.sym)) bySym.set(x.sym, []);
    bySym.get(x.sym).push(x);
  });
  for (const [sym, list2] of [...bySym].slice(0, 12)) {
    L.push(`<b>${esc(sym)}</b> \xB7 ${price(list2[0].price)}`);
    list2.sort((a, b) => a.n - b.n).forEach((x) => L.push(`  ${x.to <= 0 ? "\u2705" : "\u2B1C"} TP${x.n} ${price(x.level)}${x.mult ? ` (\xD7${x.mult})` : ""} \xB7 ${x.to <= 0 ? t.reached : `+${x.to.toFixed(0)}% ${t.toGo}`}${x.pct ? ` \xB7 ${t.sellP(x.pct)}` : ""}`));
  }
  if (bySym.size > 12) L.push("\u2026");
  return { text: L.join("\n"), buttons: [[cb(t.refresh, "ex"), url(t.openExit, APP + "accumulation.html#exit")], [cb(t.pf, "pf"), cb(t.back, "menu")]] };
}
function viewMovers(t, sum) {
  const list2 = sum.coins.filter((c) => c.value >= 1 && !isStable(c.sym));
  const block = (key, title, dir) => {
    const rows = list2.filter((c) => c[key] != null).sort((a, b) => dir * (b[key] - a[key])).slice(0, 5).filter((c) => dir > 0 ? c[key] > 0 : c[key] < 0);
    return rows.length ? [``, `${dir > 0 ? "\u{1F4C8}" : "\u{1F4C9}"} <b>${title}</b>`, ...rows.map((c) => `<code>${esc(c.sym.padEnd(6))} ${pct(c[key], 1).padStart(7)}</code>  ${usd(c.value)}`)] : [];
  };
  const L = [`\u{1F3C6} <b>${esc(t.mvT)}</b>  <i>(${t.noStable})</i>`, ...block("ch24", t.best24, 1), ...block("ch24", t.worst24, -1), ...block("ch7", t.best7, 1), ...block("ch7", t.worst7, -1)];
  return { text: L.join("\n"), buttons: [[cb(t.refresh, "mv"), cb(t.pf, "pf")], [cb(t.back, "menu")]] };
}
function viewSignals(t, sum) {
  const by = { reinforce: [], sell: [], hold: [] };
  for (const c of sum.coins) (by[sum.signal[c.sym]] || by.hold).push(c);
  const L = [`\u{1F3AF} <b>${t.sigT}</b>`];
  for (const k of ["reinforce", "sell", "hold"]) {
    if (!by[k].length) continue;
    L.push("", `<b>${t[k]}</b> (${by[k].length})`);
    by[k].sort((a, b) => a.chg - b.chg).slice(0, 12).forEach((c) => L.push(`<code>${esc(c.sym.padEnd(6))} ${pct(c.chg, 1).padStart(7)}</code>  ${t.vsAvg} ${price(c.avg)}`));
    if (by[k].length > 12) L.push("\u2026");
  }
  return { text: L.join("\n"), buttons: [[cb(t.refresh, "sg"), cb(t.pf, "pf")], [cb(t.back, "menu")]] };
}
function viewPlan(t, sum, now) {
  if (!sum.plan.length && !(sum.dca || []).length && !(sum.buyAt || []).length) return { text: `\u{1F4CB} <b>${t.planT}</b>

${t.noPlan}`, buttons: [[url(t.openApp, APP + "accumulation.html"), cb(t.back, "menu")]] };
  const L = [`\u{1F4CB} <b>${t.planT}</b>`];
  if (sum.plan.length) {
    L.push(`${t.overall}: <b>${sum.prog.pct.toFixed(1)}%</b> \xB7 ${sum.prog.completed}/${sum.prog.counted} \u2705`, "");
    const bar = (p) => {
      const n = Math.round(Math.min(1, p) * 10);
      return "\u25B0".repeat(n) + "\u25B1".repeat(10 - n);
    };
    [...sum.plan].sort((a, b) => b.actual / b.target - a.actual / a.target).forEach((p) => {
      const f = p.target > 0 ? p.actual / p.target : 0;
      L.push(`<code>${esc(p.sym.padEnd(6))}</code> ${bar(f)} ${Math.min(999, f * 100).toFixed(0)}%${f >= 1 ? " \u2705" : `  ${t.left} ${qty(p.target - p.actual)}`}`);
    });
  }
  if ((sum.dca || []).length) {
    L.push("", `\u{1F6D2} <b>${t.dca}</b>`);
    sum.dca.forEach((x) => L.push(`<code>${esc(x.sym.padEnd(6))}</code> ${usd(x.s.perMonth)}/mo${x.s.next ? ` \xB7 ${t.next} ${x.s.next}` : ""}${x.s.state === "today" ? " \xB7 \u23F0" : ""}`));
  }
  if ((sum.buyAt || []).length) {
    L.push("", `\u{1F514} <b>${t.buyAt}</b>`);
    sum.buyAt.forEach((x) => {
      const d = (x.price / x.at - 1) * 100;
      L.push(`<code>${esc(x.sym.padEnd(6))}</code> ${price(x.at)} \xB7 ${price(x.price)} ${d > 0 ? `(${pct(d, 1)} ${t.away})` : "\u2705"}`);
    });
  }
  return { text: L.join("\n"), buttons: [[cb(t.refresh, "pl"), url(t.openApp, APP + "accumulation.html")], [cb(t.back, "menu")]] };
}
function viewMarket(t, m, now) {
  const L = [`\u{1F30D} <b>${t.mkT}</b> \xB7 ${hm(now)}`, "", ...marketShort(t, m)];
  const seen = /* @__PURE__ */ new Set(), top = [...m.top || [], ...m.top500 || []].filter((r) => r.rank && r.rank <= 500 && r.ch24 != null && r.sym && !isStable(r.sym) && !seen.has(r.id) && seen.add(r.id));
  const line = (r) => row(r.sym, r.ch24, price(r.price));
  const up = [...top].sort((a, b) => b.ch24 - a.ch24).slice(0, 5), dn = [...top].sort((a, b) => a.ch24 - b.ch24).slice(0, 5);
  if (up.length) L.push("", `\u{1F4C8} <b>${t.topUp}</b>`, ...up.map(line));
  if (dn.length) L.push("", `\u{1F4C9} <b>${t.topDn}</b>`, ...dn.map(line));
  return { text: L.join("\n"), buttons: [[cb(t.refresh, "mk"), url("\u{1F9ED} Market Hub", APP + "market.html")], [cb(t.back, "menu")]] };
}
function viewCoin(t, coin, m, sum, now) {
  const row2 = [...m.top, ...m.top500].find((r) => r.id === coin.id) || {}, s = m.series[coin.id];
  const p = row2.price > 0 ? row2.price : s ? s.last : null;
  const ch7 = row2.ch7 != null ? row2.ch7 : s && p && s.at(now - 7 * 24 * H2) ? (p / s.at(now - 7 * 24 * H2) - 1) * 100 : null;
  const sym = (coin.sym || row2.sym || "").toUpperCase(), name = coin.name || row2.name || sym;
  const L = [
    `\u{1FA99} <b>${esc(name)}</b> (${esc(sym)})${row2.rank ? ` \xB7 #${row2.rank}` : ""}`,
    "",
    `\u{1F4B2} <b>${price(p)}</b>   ${dot(row2.ch24)} ${pct(row2.ch24, 1)} ${t.h24} \xB7 ${dot(ch7)} ${pct(ch7, 1)} ${t.d7}`
  ];
  const sp = spark(row2.spark);
  if (sp) L.push(`<code>${sp}</code>  ${t.d7}`);
  if (row2.mcap || row2.vol) L.push(`\u{1F4CA} ${t.cap} ${big(row2.mcap)} \xB7 ${t.vol} ${big(row2.vol)}`);
  const mine = sum && sum.coins.find((c) => c.sym === sym);
  if (mine) L.push("", `\u{1F45B} ${t.you} <b>${qty(mine.qty)} ${esc(sym)}</b> = ${usd2(mine.value)}`, `${t.avg} ${price(mine.avg)} \xB7 ${dot(mine.chg)} ${pct(mine.chg, 1)} \xB7 ${t.signal}: ${t[sum.signal[sym]] || t.hold}`);
  else if (sum) L.push("", `\u{1F45B} ${t.noHold}`);
  const age = m.live[coin.id] ? t.live : m.parts && m.parts.top ? t.snap(Math.max(1, Math.round((now - Date.parse(m.parts.top)) / 6e4))) : "";
  L.push("", `<i>${t.src}${age ? " \xB7 " + age : ""}</i>`);
  const btns = [[cb(t.refresh, "c:" + coin.id.slice(0, 58)), url(t.liq, LIQ + encodeURIComponent(sym))], [url(t.chart, "https://www.coingecko.com/en/coins/" + encodeURIComponent(coin.id))]];
  if (mine) btns[1].push(url(t.inApp, APP + "index.html#holdings/" + encodeURIComponent(sym)));
  btns.push([cb(t.back, "menu")]);
  return { text: L.join("\n"), buttons: btns };
}
async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false }));
}
var send = (env, chat, v, extra = {}) => tg(env, "sendMessage", { chat_id: chat, text: v.text.slice(0, 4e3), parse_mode: "HTML", disable_web_page_preview: true, ...v.buttons ? { reply_markup: { inline_keyboard: v.buttons } } : {}, ...extra });
var edit = (env, chat, msgId, v) => tg(env, "editMessageText", { chat_id: chat, message_id: msgId, text: v.text.slice(0, 4e3), parse_mode: "HTML", disable_web_page_preview: true, ...v.buttons ? { reply_markup: { inline_keyboard: v.buttons } } : {} });
var WORDS = [
  [/^\/?(start|menu|help|القائمة|مساعدة|ابدأ)$/i, "menu"],
  [/^\/?(portfolio|pf|wallet)$|محفظتي|المحفظة/i, "pf"],
  [/^\/?(market|mk)$|السوق/i, "mk"],
  [/^\/?(plan|pl)$|الخطة/i, "pl"],
  [/^\/?(lang|language|لغة|اللغة)$/i, "lang"],
  [/^(عربي|arabic)$/i, "lang:ar"],
  [/^(english|انجليزي|إنجليزي)$/i, "lang:en"],
  [/^\/?(exit|ex)$|خطة الخروج|الخروج/i, "ex"],
  [/^\/?(movers|mv|best)$|الأفضل/i, "mv"],
  [/^\/?(signals|sg)$|الإشارات/i, "sg"],
  [/^\/?(coin|price)$/i, "coin"]
];
function parse(text) {
  const s = String(text || "").trim().replace(/@\w+/, "").replace(/^[^\p{L}\p{N}\/$]+/u, "").trim();
  const m = /^\/(price|p|coin)\s+(.+)$/i.exec(s);
  if (m) return { act: "coins", q: m[2].split(/[\s,]+/).filter(Boolean).slice(0, 5) };
  for (const [rx, act] of WORDS) if (rx.test(s)) return { act };
  if (/^\$?[A-Za-z][A-Za-z0-9]{1,11}([\s,]+\$?[A-Za-z][A-Za-z0-9]{1,11}){0,4}$/.test(s)) return { act: "coins", q: s.split(/[\s,]+/).filter(Boolean) };
  return { act: "soon" };
}
async function buildView(env, act, arg) {
  const now = Date.now();
  const user = act === "menu" || act === "coin" ? null : await loadUser(env).catch(() => null);
  const cfg = settings(user && user.meta), lang = await getLang(env), t = T[lang];
  if (act === "menu") return { t, views: [viewMenu(t)] };
  if (act === "lang") return { t, views: [{ text: "\u{1F310} English / \u0639\u0631\u0628\u064A", buttons: [[cb("\u{1F1EC}\u{1F1E7} English", "lang:en"), cb("\u{1F1F8}\u{1F1E6} \u0639\u0631\u0628\u064A", "lang:ar")]] }] };
  if (act === "coin") return { t, views: [{ text: `\u{1FA99} ${t.askCoin}`, buttons: [[cb(t.back, "menu")]] }] };
  if (act === "soon") return { t, views: [{ text: t.soon, buttons: menuRows(t) }] };
  const needUser = ["pf", "pl", "mv", "sg", "ex"].includes(act);
  if (needUser && !user) return { t, views: [{ text: t.noUser, buttons: [[cb(t.market, "mk"), cb(t.back, "menu")]] }] };
  const ids = user ? [...(user.coins || []).filter((c) => c && !c.removed), ...(user.accum || []).filter((a) => a && +a.alertPrice > 0)].map((c) => cgIdOf(c, { cgIds: null })) : [];
  if (act === "coins") {
    const m0 = await loadMarket(ids);
    const coins = [];
    const miss = [];
    for (const q of arg) {
      const c = await findCoin(q, m0, user);
      if (c) coins.push(c);
      else miss.push(q);
    }
    const m2 = coins.some((c) => !m0.series[c.id] || !m0.live[c.id]) ? await loadMarket([...ids, ...coins.map((c) => c.id)]) : m0;
    const sum2 = user ? summarize(user, m2, now) : null;
    const views = coins.map((c) => viewCoin(t, c, m2, sum2, now));
    miss.forEach((q) => views.push({ text: t.notFound(esc(q)), buttons: [[cb(t.back, "menu")]] }));
    return { t, views };
  }
  const m = await loadMarket(ids);
  if (act === "mk") return { t, views: [viewMarket(t, m, now)] };
  const sum = summarize(user, m, now);
  if (act === "pf") return { t, views: [viewPortfolio(t, cfg, sum, m, now)] };
  if (act === "mv") return { t, views: [viewMovers(t, sum)] };
  if (act === "sg") return { t, views: [viewSignals(t, sum)] };
  if (act === "pl") return { t, views: [viewPlan(t, sum, now)] };
  if (act === "ex") return { t, views: [viewExit(t, sum, now)] };
  return { t, views: [viewMenu(t)] };
}
var ok = () => new Response("ok", { headers: { "content-type": "text/plain" } });
async function handleTelegram(request, env) {
  if (request.method !== "POST") return new Response("Not found", { status: 404 });
  if (!env.TG_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TG_SECRET) return new Response("Forbidden", { status: 403 });
  const u = await request.json().catch(() => null);
  if (!u) return ok();
  const msg = u.message || u.edited_message, q = u.callback_query;
  const chat = msg ? msg.chat && msg.chat.id : q && q.message && q.message.chat && q.message.chat.id;
  if (chat == null || String(chat) !== String(env.TELEGRAM_CHAT_ID)) return ok();
  try {
    if (q) {
      const d = String(q.data || "");
      await tg(env, "answerCallbackQuery", { callback_query_id: q.id }).catch(() => {
      });
      if (/^lang:(ar|en)$/.test(d)) {
        await switchLang(env, chat, d.slice(5), q.message.message_id);
        return ok();
      }
      const { views: views2 } = d.startsWith("c:") ? await run(env, "coinById", d.slice(2)) : await run(env, d);
      const r = await edit(env, chat, q.message.message_id, views2[0]);
      if (!r.ok && !/not modified/i.test(r.description || "")) await send(env, chat, views2[0]);
      return ok();
    }
    if (!msg || typeof msg.text !== "string") return ok();
    const p = parse(msg.text);
    if (/^lang:(ar|en)$/.test(p.act)) {
      await switchLang(env, chat, p.act.slice(5));
      return ok();
    }
    const { t, views } = await run(env, p.act, p.q);
    if (/^\/start/.test(msg.text)) await send(env, chat, { text: t.welcome }, { reply_markup: replyKb(t) });
    for (const v of views) await send(env, chat, v);
  } catch (e) {
    await send(env, chat, { text: T[await getLang(env).catch(() => "en")].err }).catch(() => {
    });
  }
  return ok();
}
async function switchLang(env, chat, lang, msgId) {
  await setLang(env, lang);
  const t = T[lang];
  await send(env, chat, { text: t.langSet }, { reply_markup: replyKb(t) });
  if (msgId) await edit(env, chat, msgId, viewMenu(t));
  else await send(env, chat, viewMenu(t));
}
async function buildById(env, id) {
  const user = await loadUser(env).catch(() => null), now = Date.now();
  const cfg = settings(user && user.meta), lang = await getLang(env), t = T[lang];
  const ids = user ? (user.coins || []).filter((c) => c && !c.removed).map((c) => cgIdOf(c, { cgIds: null })) : [];
  const m = await loadMarket([...ids, id]);
  const row2 = [...m.top, ...m.top500].find((r) => r.id === id) || {};
  const own = user && (user.coins || []).find((c) => c && !c.removed && cgIdOf(c, m) === id);
  const coin = { id, sym: own && own.sym || row2.sym || "", name: row2.name || own && own.name || "" };
  return { t, views: [viewCoin(t, coin, m, user ? summarize(user, m, now) : null, now)] };
}
var run = (env, act, arg) => act === "coinById" ? buildById(env, arg) : buildView(env, act, arg);
async function setup(request, env) {
  const u = new URL(request.url), json = (s, o) => new Response(JSON.stringify(o, null, 2), { status: s, headers: { "content-type": "application/json" } });
  if (!env.TG_SECRET || u.searchParams.get("key") !== env.TG_SECRET) return json(403, { ok: false, error: "Wrong or missing key." });
  const missing = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "TG_SECRET"].filter((k) => !env[k]);
  if (missing.length) return json(400, { ok: false, missing });
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(env.TG_SECRET)) return json(400, { ok: false, error: "TG_SECRET must be 16+ letters, digits, _ or - (Telegram rule)." });
  const hook = u.origin + u.pathname.replace(/\/setup$/, "");
  const a = await tg(env, "setWebhook", { url: hook, secret_token: env.TG_SECRET, allowed_updates: ["message", "edited_message", "callback_query"], drop_pending_updates: true });
  const cmds = (lang2) => [
    ["portfolio", lang2 === "ar" ? "\u0645\u062D\u0641\u0638\u062A\u064A" : "My portfolio"],
    ["price", lang2 === "ar" ? "\u0633\u0639\u0631 \u0639\u0645\u0644\u0629 \u2014 /price btc" : "A coin \u2014 /price btc"],
    ["market", lang2 === "ar" ? "\u0627\u0644\u0633\u0648\u0642" : "Market"],
    ["plan", lang2 === "ar" ? "\u062E\u0637\u0629 \u0627\u0644\u062A\u062C\u0645\u064A\u0639" : "Accumulation plan"],
    ["movers", lang2 === "ar" ? "\u0627\u0644\u0623\u0641\u0636\u0644 \u0648\u0627\u0644\u0623\u0633\u0648\u0623" : "Best & worst"],
    ["signals", lang2 === "ar" ? "\u0627\u0644\u0625\u0634\u0627\u0631\u0627\u062A" : "Signals"],
    ["exit", lang2 === "ar" ? "\u062E\u0637\u0629 \u0627\u0644\u062E\u0631\u0648\u062C" : "Exit plan"],
    ["menu", lang2 === "ar" ? "\u0627\u0644\u0642\u0627\u0626\u0645\u0629" : "Menu"],
    ["lang", "English / \u0639\u0631\u0628\u064A"]
  ].map(([command, description]) => ({ command, description }));
  const user = await loadUser(env).catch(() => null), lang = await getLang(env), t = T[lang];
  const b = await tg(env, "setMyCommands", { commands: cmds(lang) });
  const c = await send(env, env.TELEGRAM_CHAT_ID, { text: t.welcome }, { reply_markup: replyKb(t) });
  await send(env, env.TELEGRAM_CHAT_ID, viewMenu(t));
  return json(a.ok && b.ok && c.ok ? 200 : 502, { ok: !!(a.ok && b.ok && c.ok), webhook: a.ok ? "set" : a.description, menu: b.ok ? "set" : b.description, welcome: c.ok ? "sent" : c.description, portfolio: serviceAccount(env) ? user ? "connected" : "not found" : "FIREBASE_SERVICE_ACCOUNT missing" });
}

// tools/worker/index.mjs
var worker_default = {
  async fetch(request, env, ctx) {
    const p = new URL(request.url).pathname.replace(/\/+$/, "");
    if (p.endsWith("/tg/setup")) return setup(request, env);
    if (p.endsWith("/tg")) return handleTelegram(request, env, ctx);
    return ai_worker_default.fetch(request, env, ctx);
  }
};
export {
  worker_default as default
};
