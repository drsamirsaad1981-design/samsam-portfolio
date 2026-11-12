// samsam-worker.js — BUILT FILE (node tools/build-worker.mjs). Paste all of it into the Cloudflare Worker: AI Analysis (/analyze) + the Telegram bot (/tg).
// Sources: tools/ai-worker.js, tools/worker/*.mjs, tools/alerts-core.mjs, samsam-core.js. No keys or secrets in here — they live in the Worker settings.
// sources-hash: 4b0d5f438855647e

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
    const used2 = await getCount(env, key);
    if (used2 >= limit) return reply(429, { error: `You have used today's ${limit} AI reports. New reports are available tomorrow (00:00 UTC).`, remaining: 0 });
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
    await setCount(env, key, used2 + 1);
    return reply(200, { report, model: out.model || model, remaining: limit - used2 - 1 });
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
  const tg3 = (k) => targets && targets[k] ? num(targets[k].pct) / 100 : 0;
  const groups = keys.map((k) => {
    const v = Math.max(0, num(values[k])), now = total > 0 ? v / total * 100 : 0, target = tg3(k) * 100;
    return {
      key: k,
      value: v,
      now,
      target,
      drift: now - target,
      full: tg3(k) * total - v,
      need: Math.max(0, tg3(k) * T2 - v),
      add: 0,
      state: Math.abs(now - target) <= band ? "ok" : Math.abs(now - target) <= 2 * band ? "warn" : "off"
    };
  });
  const money2 = Math.max(0, num(cash)), need = groups.reduce((s, g) => s + g.need, 0);
  if (money2 > 0) {
    if (need >= money2) groups.forEach((g) => {
      g.add = need > 0 ? g.need / need * money2 : 0;
    });
    else {
      const rest = money2 - need;
      groups.forEach((g) => {
        g.add = g.need + tg3(g.key) * rest;
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
function dcaStatus(s, sym, txs, today2) {
  const c = cleanDca(s);
  if (!c) return null;
  const S = String(sym || "").toUpperCase();
  const buys = (txs || []).filter((t) => t && t.type === "buy" && String(t.sym || "").toUpperCase() === S && t.date).map((t) => String(t.date).slice(0, 10)).sort();
  const boughtFor = (d) => {
    const lo = isoD(dOf(d) - 2 * DAYMS), hi = dcaNextAfter(c, d) || "9999-12-31";
    return buys.some((b) => b >= lo && b < hi);
  };
  const past = dcaDue(c, c.since, today2), last = past.length ? past[past.length - 1] : null;
  const recent = past.slice(-6), kept = recent.filter(boughtFor).length;
  const done = last ? boughtFor(last) : false;
  const late = last && !done ? Math.round((dOf(today2) - dOf(last)) / DAYMS) : 0;
  const next = last === today2 && !done ? today2 : dcaNextAfter(c, today2);
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
    coinRows.push({ sym: c.sym, value: c.qty * c.currentPrice, price: c.currentPrice, avg: c.basePrice, chg, qty: c.qty, ch24: info[c.sym].ch24, ch7: info[c.sym].ch7, why: si.why, rs: si.rs, vs: vs[c.sym] || null });
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
  const today2 = localParts(now).date;
  const dca = (user.accum || []).filter((a) => a && a.sym && a.dca).map((a) => ({ sym: String(a.sym).toUpperCase(), s: dcaStatus(a.dca, a.sym, user.txs, today2) })).filter((x) => x.s);
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
  const tg3 = meta.targets && typeof meta.targets === "object" ? meta.targets : null;
  const tlist = tg3 && Array.isArray(tg3.list) ? tg3.list : [];
  if (tlist.length) {
    const cats = Object.fromEntries(tlist.filter((x) => x && x.g && x.pct > 0).map((x) => [x.g, { pct: +x.pct }]));
    const names = Object.fromEntries([...Array.isArray(tg3.names) ? tg3.names : [], ...tlist].filter((x) => x && x.g).map((x) => [x.g, x.label || x.g]));
    const vals = {};
    for (const c of pf) {
      const g2 = groupOf(c);
      vals[g2] = (vals[g2] || 0) + c.qty * c.currentPrice;
    }
    const plan2 = allocationPlan(vals, cats, { band: +tg3.band || 5 });
    const shown = plan2.groups.filter((g2) => g2.target > 0 || g2.now >= 0.05);
    alloc = { band: plan2.band, groups: shown, onTarget: shown.filter((g2) => g2.state === "ok").length, count: shown.length, names, key: JSON.stringify([tlist, tg3.band]) };
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
var STALE = 20 * 6e4;
var setStale = (ms) => {
  const old = STALE;
  STALE = ms;
  return old;
};
var cache = /* @__PURE__ */ new Map();
var inflight = /* @__PURE__ */ new Map();
async function cached(key, ms, make) {
  const hit = cache.get(key);
  if (hit && Date.now() < hit.until) return hit.value;
  if (inflight.has(key)) return inflight.get(key);
  const run2 = (async () => {
    const before = refused;
    const value = await make();
    if (!(refused > before && !value)) cache.set(key, { until: Date.now() + ms, value });
    return value;
  })();
  inflight.set(key, run2);
  try {
    return await run2;
  } finally {
    inflight.delete(key);
  }
}
var refused = 0;
function clearCache() {
  cache.clear();
  tokenCache = null;
}
var BUDGET = 42;
var used = 0;
function resetBudget(n = BUDGET) {
  used = BUDGET - n;
}
var RESERVE = 10;
var isFutures = (url2) => /okx\.com\/api\/v5\/(public|rubik)\/|fapi\.binance\.com\/|api\.hyperliquid\.xyz\//.test(String(url2));
async function xfetch(url2, init) {
  const cap = isFutures(url2) ? BUDGET : BUDGET - RESERVE;
  if (used >= cap) {
    refused++;
    throw new Error("budget");
  }
  used++;
  return fetch(url2, init);
}
var trace = null;
function startTrace() {
  trace = [];
}
function stopTrace() {
  const t = trace;
  trace = null;
  return t;
}
async function getJson(url2, init) {
  return (await getJsonS(url2, init)).j;
}
async function getJsonS(url2, init) {
  const tag = () => {
    try {
      const u = new URL(url2);
      return u.host + u.pathname;
    } catch (_) {
      return "?";
    }
  };
  try {
    const r = await xfetch(url2, init);
    if (trace) trace.push([tag(), r.status]);
    return { s: r.status, j: r.ok ? await r.json() : null };
  } catch (e) {
    if (trace) trace.push([tag(), String(e && e.message).slice(0, 60)]);
    return { s: 0, j: null };
  }
}
async function loadMarket(ids = [], coins = []) {
  const base = await cached("market", 6e4, async () => {
    const [m, t5, alt, etf] = await Promise.all(["m/market.json", "m/top500.json", "m/alt.json", "m/etf.json"].map((f) => getJson(RAW + f)));
    return m && t5 ? { m, t5, alt, etf } : null;
  }) || { m: {}, t5: {}, alt: null, etf: null };
  if (!base.m.top) cache.delete("market");
  const top = (base.m.top || []).map((r) => ({ ...r })), top500 = (base.t5.top || []).map((r) => ({ ...r }));
  const byId = /* @__PURE__ */ new Map(), bySym = {};
  for (const r of [...top, ...top500]) {
    if (!byId.has(r.id)) byId.set(r.id, r);
    const S = String(r.sym || "").toUpperCase();
    if (S && (!bySym[S] || (r.rank || 1e9) < (bySym[S].rank || 1e9))) bySym[S] = r;
  }
  const idOf = {};
  for (const c of coins) {
    const S = String(c.sym || "").toUpperCase();
    if (S) idOf[S] = c.id || cg_ids_default[S] || bySym[S] && bySym[S].id || null;
  }
  const all = [...new Set(["bitcoin", ...ids, ...Object.values(idOf)].filter(Boolean))];
  const series = {};
  const need = ["bitcoin", ...all.filter((id) => id !== "bitcoin" && !byId.has(id)).slice(0, 5)];
  await Promise.all(need.map(async (id) => {
    const s = await cached("p:" + id, 10 * 6e4, async () => priceSeries(await getJson(RAW + "p/" + id + ".json")) || false);
    if (s) series[id] = s;
  }));
  const market = { top, top500, global: base.m.global, fng: base.m.fng, alt: base.m.alt, parts: base.m.parts, series, altPage: base.alt, etf: base.etf, cgIds: cg_ids_default, live: {}, idOf, stocks: base.m.stocks || [] };
  await liveTopUp(market, all);
  const rows = new Map([...market.top, ...market.top500].map((r) => [r.id, r]));
  const missing = Object.entries(idOf).filter(([S, id]) => !(id && (market.live[id] || rows.get(id) && rows.get(id).price > 0 || series[id]))).slice(0, 3);
  await Promise.all(missing.map(async ([S, id]) => {
    const x = await exchangePrice(S);
    if (!x) return;
    const key = id || "x-" + S.toLowerCase(), r = rows.get(key);
    if (r) {
      r.price = x.price;
      if (x.ch24 != null) r.ch24 = x.ch24;
    } else market.top500.push({ id: key, sym: S, name: S, price: x.price, ch24: x.ch24, extra: true });
    market.live[key] = x.src;
    idOf[S] = key;
  }));
  const snapT = Date.parse(market.parts && market.parts.top) || 0;
  if (Date.now() - snapT > STALE) {
    const want = [.../* @__PURE__ */ new Set(["bitcoin", ...ids])].filter((id) => !market.live[id] && rows.get(id) && rows.get(id).price > 0).slice(0, 3);
    await Promise.all(want.map(async (id) => {
      const r = rows.get(id), S = String(r.sym || Object.keys(idOf).find((k) => idOf[k] === id) || "").toUpperCase();
      const x = S && await exchangePrice(S).catch(() => null);
      if (!x || !(x.price > r.price / 1.5 && x.price < r.price * 1.5)) return;
      r.price = x.price;
      if (x.ch24 != null) r.ch24 = x.ch24;
      market.live[id] = x.src;
    }));
  }
  const btc = market.top.find((r) => r.id === "bitcoin");
  market.btc = btc ? { price: btc.price, ch24: btc.ch24 } : series.bitcoin ? { price: series.bitcoin.last, ch24: null } : null;
  market.priceT = Date.now();
  return market;
}
var EX = [
  ["Binance", (S) => `https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${S}USDT`, (j) => j && j.lastPrice && { price: +j.lastPrice, ch24: +j.priceChangePercent }],
  ["OKX", (S) => `https://www.okx.com/api/v5/market/ticker?instId=${S}-USDT`, (j) => {
    const d = j && j.data && j.data[0];
    return d && { price: +d.last, ch24: +d.open24h > 0 ? (d.last / d.open24h - 1) * 100 : null };
  }],
  ["Gate", (S) => `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${S}_USDT`, (j) => {
    const d = Array.isArray(j) && j[0];
    return d && { price: +d.last, ch24: d.change_percentage != null ? +d.change_percentage : null };
  }]
];
async function exchangePrice(sym) {
  const S = String(sym || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!S || /^(USDT|USD)$/.test(S)) return null;
  const miss = cache.get("exmiss:" + S);
  if (miss && Date.now() < miss.until) return null;
  const x = await cached("ex:" + S, 45e3, async () => {
    for (const [src, url2, read] of EX) {
      const off = cache.get("ex-off:" + src);
      if (off && Date.now() < off.until) continue;
      const { s: st, j } = await getJsonS(url2(S));
      if (st === 403 || st === 451) cache.set("ex-off:" + src, { until: Date.now() + 30 * 6e4, value: 1 });
      const x2 = read(j);
      if (x2 && x2.price > 0 && isFinite(x2.price)) return { price: x2.price, ch24: isFinite(x2.ch24) ? x2.ch24 : null, src };
      if (used >= BUDGET) return null;
    }
    return "none";
  });
  if (x === "none") {
    cache.delete("ex:" + S);
    cache.set("exmiss:" + S, { until: Date.now() + 30 * 6e4, value: 1 });
    return null;
  }
  return x;
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
  if (c) return { id: c.id, sym: String(c.symbol || "").toUpperCase(), name: c.name, rank: c.market_cap_rank };
  return /^[A-Z0-9]{2,12}$/.test(S) ? { id: null, sym: S, name: "" } : null;
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
  const r = await xfetch(aud, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: body + "." + b64url(sig) }) });
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
    const r = await xfetch(url2, { ...init, headers: { authorization: "Bearer " + token, "content-type": "application/json", ...init.headers || {} } });
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
    },
    // new documents, all or nothing (each must not exist yet — never overwrites)
    async commit(docs) {
      const name = (p) => `projects/${sa.project_id}/databases/(default)/documents/${p}`;
      return call(base + ":commit", { method: "POST", body: JSON.stringify({ writes: docs.map((d) => ({ update: { name: name(d.path), fields: enc(d.data) }, currentDocument: { exists: false } })) }) });
    }
  };
}
function encV(v) {
  if (v == null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isSafeInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encV) } };
  return { mapValue: { fields: enc(v) } };
}
var enc = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, encV(v)]));
async function commitDocs(env, uid, docs) {
  const sa = serviceAccount(env);
  if (!sa) throw new Error("no service account");
  const db = await firestore(sa);
  await db.commit(docs.map((d) => ({ path: `users/${uid}/${d.path}`, data: d.data })));
  cache.delete("user");
  return { ok: true };
}
async function loadUser(env, fresh = false) {
  const sa = serviceAccount(env);
  if (!sa) return null;
  if (fresh) cache.delete("user");
  return cached("user", 12e4, async () => {
    const db = await firestore(sa), users = await db.users();
    if (!users.length) return null;
    const uid = env.FIREBASE_UID && users.includes(env.FIREBASE_UID) ? env.FIREBASE_UID : users[0];
    const [coins, txs, accum, meta] = await Promise.all([db.list(`users/${uid}/coins`), db.list(`users/${uid}/txs`), db.list(`users/${uid}/accum`), db.get(`users/${uid}/meta/info`)]);
    return { coins, txs, accum, meta: meta || {}, uid };
  });
}
var coinsOf = (user) => user ? [...(user.coins || []).filter((c) => c && !c.removed), ...(user.accum || []).filter((a) => a && +a.alertPrice > 0)].map((c) => ({ sym: String(c.sym || "").toUpperCase(), id: c.cgId || null })) : [];
var withIds = (user, m) => ({
  ...user,
  coins: (user.coins || []).map((c) => c && c.sym && m.idOf[String(c.sym).toUpperCase()] ? { ...c, cgId: m.idOf[String(c.sym).toUpperCase()] } : c),
  accum: (user.accum || []).map((a) => a && a.sym && m.idOf[String(a.sym).toUpperCase()] ? { ...a, cgId: m.idOf[String(a.sym).toUpperCase()] } : a)
});
async function loadFutures() {
  return cached("fut", 10 * 6e4, async () => {
    const j = await getJson(RAW + "m/links.json");
    return j && Array.isArray(j.fut) ? new Set(j.fut) : null;
  });
}
async function rawSeries(id) {
  if (!id || /^x-/.test(id)) return null;
  return cached("raw:" + id, 10 * 6e4, async () => await getJson(RAW + "p/" + id + ".json") || false);
}
var num2 = (v) => {
  const n = +v;
  return isFinite(n) ? n : null;
};
async function postJson(url2, body) {
  return getJson(url2, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
async function okxDeriv(S, now) {
  const O = "https://www.okx.com/api/v5", inst = `${S}-USDT-SWAP`;
  const [fr, oi, oih, ls, liq, ins] = await Promise.all([
    getJson(`${O}/public/funding-rate?instId=${inst}`),
    getJson(`${O}/public/open-interest?instType=SWAP&instId=${inst}`),
    getJson(`${O}/rubik/stat/contracts/open-interest-volume?ccy=${S}&period=1H`),
    getJson(`${O}/rubik/stat/contracts/long-short-account-ratio?ccy=${S}&period=1H`),
    getJson(`${O}/public/liquidation-orders?instType=SWAP&uly=${S}-USDT&state=filled&limit=100`),
    cached("okx-ins:" + S, 864e5, () => getJson(`${O}/public/instruments?instType=SWAP&instId=${inst}`))
  ]);
  const f = fr && fr.data && fr.data[0], o = oi && oi.data && oi.data[0];
  if (!f && !o) return null;
  const out = { source: "OKX" };
  if (f) {
    out.funding_8h_pct = num2(f.fundingRate) != null ? +(f.fundingRate * 100).toFixed(4) : null;
    out.next_funding = f.nextFundingTime ? (/* @__PURE__ */ new Date(+f.nextFundingTime)).toISOString() : null;
  }
  if (o) out.open_interest_usd = num2(o.oiUsd) != null ? Math.round(+o.oiUsd) : null;
  const h = oih && Array.isArray(oih.data) ? oih.data.map((x) => [+x[0], +x[1]]).sort((a, b) => a[0] - b[0]) : [];
  if (h.length > 2) {
    const last = h[h.length - 1], prev = h.find((x) => x[0] >= last[0] - 24 * 36e5) || h[0];
    if (prev[1] > 0) out.open_interest_change_24h_pct = +((last[1] / prev[1] - 1) * 100).toFixed(2);
  }
  const r = ls && Array.isArray(ls.data) && ls.data.length ? ls.data.map((x) => [+x[0], +x[1]]).sort((a, b) => b[0] - a[0])[0] : null;
  if (r && r[1] > 0) {
    out.long_short_accounts = +r[1].toFixed(2);
    out.long_accounts_pct = +(r[1] / (1 + r[1]) * 100).toFixed(1);
  }
  const ct = ins && ins.data && ins.data[0] ? num2(ins.data[0].ctVal) || 1 : 1, det = liq && liq.data && liq.data[0] && Array.isArray(liq.data[0].details) ? liq.data[0].details : [];
  if (det.length) {
    let longs = 0, shorts = 0, n = 0, oldest = now;
    for (const d of det) {
      const t = +d.ts;
      if (!(t > now - 24 * 36e5)) continue;
      const usd3 = (+d.sz || 0) * ct * (+d.bkPx || 0);
      n++;
      oldest = Math.min(oldest, t);
      if ((d.posSide || "") === "long" || d.side === "sell") longs += usd3;
      else shorts += usd3;
    }
    out.liquidations = { orders: n, longs_usd: Math.round(longs), shorts_usd: Math.round(shorts), since: new Date(oldest).toISOString(), note: "OKX only, its last 100 liquidation orders" };
  }
  return out;
}
async function binanceDeriv(S) {
  const F = "https://fapi.binance.com", p = `${S}USDT`;
  const off = cache.get("bn-off");
  if (off && Date.now() < off.until) return null;
  const pi = await getJson(`${F}/fapi/v1/premiumIndex?symbol=${p}`);
  if (!pi || pi.code) {
    if (!pi) cache.set("bn-off", { until: Date.now() + 30 * 6e4, value: 1 });
    return null;
  }
  const [oi, oih, ls, top] = await Promise.all([
    getJson(`${F}/fapi/v1/openInterest?symbol=${p}`),
    getJson(`${F}/futures/data/openInterestHist?symbol=${p}&period=1h&limit=25`),
    getJson(`${F}/futures/data/globalLongShortAccountRatio?symbol=${p}&period=1h&limit=1`),
    getJson(`${F}/futures/data/topLongShortPositionRatio?symbol=${p}&period=1h&limit=1`)
  ]);
  const out = { source: "Binance", funding_8h_pct: num2(pi.lastFundingRate) != null ? +(pi.lastFundingRate * 100).toFixed(4) : null, mark_price: num2(pi.markPrice) };
  if (oi && num2(oi.openInterest) != null && num2(pi.markPrice)) out.open_interest_usd = Math.round(oi.openInterest * pi.markPrice);
  if (Array.isArray(oih) && oih.length > 2) {
    const a = +oih[0].sumOpenInterestValue, b = +oih[oih.length - 1].sumOpenInterestValue;
    if (a > 0) out.open_interest_change_24h_pct = +((b / a - 1) * 100).toFixed(2);
  }
  if (Array.isArray(ls) && ls[0]) {
    out.long_short_accounts = num2(ls[0].longShortRatio);
    out.long_accounts_pct = num2(ls[0].longAccount) != null ? +(ls[0].longAccount * 100).toFixed(1) : null;
  }
  if (Array.isArray(top) && top[0]) out.top_traders_long_short_positions = num2(top[0].longShortRatio);
  return out;
}
async function hyperliquidDeriv(S) {
  const j = await cached("hl-ctx", 6e4, () => postJson("https://api.hyperliquid.xyz/info", { type: "metaAndAssetCtxs" }));
  if (!Array.isArray(j) || !j[0] || !Array.isArray(j[0].universe)) return null;
  const i = j[0].universe.findIndex((u) => String(u.name).toUpperCase() === S), c = i >= 0 && j[1] && j[1][i];
  if (!c) return null;
  const px = num2(c.markPx);
  return { source: "Hyperliquid", funding_8h_pct: num2(c.funding) != null ? +(c.funding * 8 * 100).toFixed(4) : null, open_interest_usd: num2(c.openInterest) != null && px ? Math.round(c.openInterest * px) : null, volume_24h_usd: num2(c.dayNtlVlm) != null ? Math.round(+c.dayNtlVlm) : null, mark_price: px };
}
async function derivatives(sym) {
  const S = String(sym || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!S) return null;
  return cached("deriv:" + S, 12e4, async () => {
    const now = Date.now(), [okx, bn, hl] = await Promise.all([okxDeriv(S, now), binanceDeriv(S), hyperliquidDeriv(S)]);
    const src = [okx, bn, hl].filter(Boolean);
    if (!src.length) return null;
    const fr = src.map((x) => x.funding_8h_pct).filter((v) => v != null), oi = src.map((x) => x.open_interest_usd).filter((v) => v > 0);
    const avgF = fr.length ? fr.reduce((a, b) => a + b, 0) / fr.length : null;
    return {
      coin: S,
      summary: {
        funding_8h_pct_avg: avgF != null ? +avgF.toFixed(4) : null,
        funding_annualized_pct: avgF != null ? +(avgF * 3 * 365).toFixed(1) : null,
        funding_reading: avgF == null ? null : avgF > 0.03 ? "longs paying a lot (crowded longs)" : avgF > 0 ? "longs paying (normal)" : avgF < -0.01 ? "shorts paying (crowded shorts)" : "about neutral",
        open_interest_usd_total: oi.length ? oi.reduce((a, b) => a + b, 0) : null,
        open_interest_note: "sum of the sources listed (not the whole market)",
        open_interest_change_24h_pct: (okx && okx.open_interest_change_24h_pct) ?? (bn && bn.open_interest_change_24h_pct) ?? null,
        long_accounts_pct: (bn && bn.long_accounts_pct) ?? (okx && okx.long_accounts_pct) ?? null,
        liquidations_24h: okx && okx.liquidations || null
      },
      sources: src
    };
  });
}

// tools/worker/watch.mjs
var KEY = "tg:alerts";
var MAX = 30;
var KINDS = {
  price_below: { what: "price", op: "\u2264" },
  price_above: { what: "price", op: "\u2265" },
  change_24h_below: { what: "change_24h", op: "\u2264" },
  change_24h_above: { what: "change_24h", op: "\u2265" },
  funding_below: { what: "funding", op: "\u2264" },
  funding_above: { what: "funding", op: "\u2265" },
  portfolio_below: { what: "portfolio", op: "\u2264" },
  portfolio_above: { what: "portfolio", op: "\u2265" }
};
var mem = /* @__PURE__ */ new Map();
async function kvGet(env, k) {
  try {
    if (env.RATE) return await env.RATE.get(k);
  } catch (_) {
  }
  return mem.has(k) ? mem.get(k) : null;
}
async function kvPut(env, k, v) {
  mem.set(k, v);
  try {
    if (env.RATE) await env.RATE.put(k, v);
  } catch (_) {
  }
}
var lock = Promise.resolve();
var locked = (fn) => {
  const run2 = lock.then(fn, fn);
  lock = run2.catch(() => {
  });
  return run2;
};
async function listAlerts(env) {
  try {
    const a = JSON.parse(await kvGet(env, KEY) || "[]");
    return Array.isArray(a) ? a : [];
  } catch (_) {
    return [];
  }
}
async function saveAlerts(env, list2) {
  await kvPut(env, KEY, JSON.stringify(list2.slice(0, MAX)));
}
var met = (kind, now, v) => now != null && (KINDS[kind].op === "\u2264" ? now <= v : now >= v);
async function currentValue(env, a, cache2 = {}) {
  const k = KINDS[a.kind];
  if (k.what === "portfolio") {
    if (cache2.pf === void 0) {
      const user = await loadUser(env).catch(() => null);
      if (!user) cache2.pf = null;
      else {
        const m = await loadMarket([], coinsOf(user));
        cache2.pf = summarize(withIds(user, m), m, Date.now()).value;
      }
    }
    return cache2.pf;
  }
  if (k.what === "funding") {
    const d = await derivatives(a.sym).catch(() => null);
    return d && d.summary ? d.summary.funding_8h_pct_avg : null;
  }
  const key = "p:" + a.sym;
  if (!(key in cache2)) {
    let x2 = await exchangePrice(a.sym).catch(() => null);
    if (!x2) {
      const m = await loadMarket(a.cg ? [a.cg] : [], [{ sym: a.sym, id: a.cg || null }]);
      const id = a.cg || m.idOf[a.sym], r = id && [...m.top, ...m.top500].find((z) => z.id === id);
      x2 = r && r.price > 0 ? { price: r.price, ch24: r.ch24, src: m.live[id] ? "CoinGecko" : "snapshot" } : null;
    }
    cache2[key] = x2;
  }
  const x = cache2[key];
  return !x ? null : k.what === "price" ? x.price : x.ch24;
}
async function addAlert(env, input, user) {
  const kind = String(input.kind || "");
  if (!KINDS[kind]) return { error: "kind must be one of " + Object.keys(KINDS).join(", ") };
  const value = +input.value;
  if (!isFinite(value)) return { error: "value must be a number" };
  const a = { id: Math.random().toString(36).slice(2, 8), kind, value, note: String(input.note || "").slice(0, 80), created: Date.now() };
  if (KINDS[kind].what !== "portfolio") {
    const q = String(input.coin || "").trim();
    if (!q) return { error: "coin is needed for this kind" };
    const m = await loadMarket([], user ? coinsOf(user) : []);
    const c = await findCoin(q, m, user);
    if (!c) return { error: `no coin found for "${q}"` };
    a.sym = c.sym;
    a.cg = c.id || null;
  }
  const now = await currentValue(env, a);
  if (now == null) return { error: `no live ${KINDS[kind].what} found for ${a.sym || "the portfolio"} \u2014 alert not set` };
  a.armed = !met(kind, now, value);
  return locked(async () => {
    const list2 = await listAlerts(env);
    if (list2.length >= MAX) return { error: `you already have ${MAX} alerts \u2014 delete some first` };
    list2.push(a);
    await saveAlerts(env, list2);
    return { ok: true, alert: describe(a), id: a.id, now, already_met: !a.armed };
  });
}
function deleteAlert(env, id) {
  return locked(async () => {
    const list2 = await listAlerts(env), next = list2.filter((a) => a.id !== id);
    if (next.length === list2.length) return false;
    await saveAlerts(env, next);
    return true;
  });
}
function describe(a) {
  const k = KINDS[a.kind], v = k.what === "price" ? usd(a.value) : k.what === "portfolio" ? usd(a.value) : k.what === "funding" ? a.value + "% / 8h" : pct(a.value, 1);
  const what = k.what === "price" ? `${a.sym} price` : k.what === "change_24h" ? `${a.sym} 24h change` : k.what === "funding" ? `${a.sym} funding` : "Portfolio value";
  return `${what} ${k.op} ${v}`;
}
async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false }));
}
async function runWatch(env, now = Date.now()) {
  const list2 = await listAlerts(env);
  if (!list2.length || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { checked: 0, fired: 0 };
  resetBudget();
  const cache2 = {}, keep = [], fired = [];
  for (const a of list2) {
    let now1 = null;
    try {
      now1 = await currentValue(env, a, cache2);
    } catch (_) {
    }
    if (now1 == null) {
      keep.push(a);
      continue;
    }
    const on = met(a.kind, now1, a.value);
    if (!a.armed) {
      keep.push(on ? a : { ...a, armed: true });
      continue;
    }
    if (!on) {
      keep.push(a);
      continue;
    }
    fired.push({ a, now: now1 });
  }
  for (const { a, now: v } of fired) {
    const k = KINDS[a.kind], up = k.op === "\u2265";
    const nowTxt = k.what === "price" || k.what === "portfolio" ? usd(v) : k.what === "funding" ? v + "% / 8h" : pct(v, 1);
    const head = k.what === "portfolio" ? `\u{1F4BC} <b>Portfolio ${up ? "above" : "below"} ${usd(a.value)}</b>` : `${up ? "\u{1F680}" : "\u{1F53B}"} <b>${esc(a.sym)} ${k.what === "price" ? (up ? "above" : "below") + " " + usd(a.value) : k.what === "funding" ? "funding " + k.op + " " + a.value + "%" : "24h " + k.op + " " + pct(a.value, 1)}</b>`;
    const text = `\u{1F514} ${head}
Now: <b>${nowTxt}</b>${a.note ? "\n<i>" + esc(a.note) + "</i>" : ""}
<i>Your alert from ${local(a.created, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} \u2014 done, removed.</i>`;
    const buttons = a.sym ? [[{ text: "\u{1FA99} " + a.sym, callback_data: "c:" + (a.cg || "x-" + a.sym.toLowerCase()).slice(0, 58) }, { text: "\u{1F525} Liq Map", url: "https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=" + encodeURIComponent(a.sym) }]] : [[{ text: "\u{1F4BC} Portfolio", callback_data: "pf" }]];
    const r = await tg(env, "sendMessage", { chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: { inline_keyboard: buttons } });
    if (!r.ok) keep.push(a);
  }
  await locked(async () => {
    const nowList = await listAlerts(env), seen = new Set(list2.map((a) => a.id));
    await saveAlerts(env, [...keep.filter((a) => nowList.some((b) => b.id === a.id)), ...nowList.filter((b) => !seen.has(b.id))]);
  });
  return { checked: list2.length, fired: fired.length };
}
async function viewAlerts(env, lang = "en") {
  const list2 = await listAlerts(env), ar = lang === "ar";
  if (!list2.length) return { text: ar ? "\u{1F514} \u0645\u0641\u064A\u0634 \u062A\u0646\u0628\u064A\u0647\u0627\u062A.\n\u0627\u0643\u062A\u0628 \u0645\u062B\u0644\u0627\u064B: <i>\u0646\u0628\u0651\u0647\u0646\u064A \u0644\u0648 SOL \u0646\u0632\u0644 \u062A\u062D\u062A 82</i>" : "\u{1F514} No alerts yet.\nWrite e.g. <i>tell me if SOL drops below 82</i>", buttons: [[{ text: ar ? "\u2B05\uFE0F \u0627\u0644\u0642\u0627\u0626\u0645\u0629" : "\u2B05\uFE0F Menu", callback_data: "menu" }]] };
  const L = [ar ? `\u{1F514} <b>\u062A\u0646\u0628\u064A\u0647\u0627\u062A\u0643</b> (${list2.length})` : `\u{1F514} <b>Your alerts</b> (${list2.length})`, ""];
  list2.forEach((a, i) => L.push(`${i + 1}. ${esc(describe(a))}${a.armed ? "" : ar ? " <i>(\u0645\u0633\u062A\u0646\u064A \u064A\u0631\u062C\u0639 \u0627\u0644\u0623\u0648\u0644)</i>" : " <i>(waits to reset first)</i>"}`));
  L.push("", ar ? "<i>\u0628\u064A\u062A\u0634\u064A\u0643 \u0643\u0644 5 \u062F\u0642\u0627\u064A\u0642 \xB7 \u0643\u0644 \u062A\u0646\u0628\u064A\u0647 \u0645\u0631\u0629 \u0648\u0627\u062D\u062F\u0629</i>" : "<i>Checked every 5 min \xB7 each fires once</i>");
  const buttons = [];
  for (let i = 0; i < list2.length; i += 3) buttons.push(list2.slice(i, i + 3).map((a, j) => ({ text: `\u{1F5D1} ${i + j + 1}`, callback_data: "ad:" + a.id })));
  buttons.push([{ text: ar ? "\u{1F504} \u062A\u062D\u062F\u064A\u062B" : "\u{1F504} Refresh", callback_data: "al" }, { text: ar ? "\u2B05\uFE0F \u0627\u0644\u0642\u0627\u0626\u0645\u0629" : "\u2B05\uFE0F Menu", callback_data: "menu" }]);
  return { text: L.join("\n"), buttons };
}

// tools/worker/trade.mjs
var TTL = 15 * 6e4;
var mem2 = /* @__PURE__ */ new Map();
async function kvGet2(env, k) {
  try {
    if (env.RATE) return await env.RATE.get(k);
  } catch (_) {
  }
  return mem2.has(k) ? mem2.get(k) : null;
}
async function kvPut2(env, k, v) {
  mem2.set(k, v);
  try {
    if (env.RATE) await env.RATE.put(k, v, { expirationTtl: 3600 });
  } catch (_) {
  }
}
async function kvDel(env, k) {
  mem2.delete(k);
  try {
    if (env.RATE) await env.RATE.delete(k);
  } catch (_) {
  }
}
var r6 = (v) => v == null || !isFinite(v) ? null : +Number(v).toPrecision(6);
var r2 = (v) => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
var cleanSym = (v) => String(v == null ? "" : v).toUpperCase().replace(/^\$/, "").replace(/[^A-Z0-9._-]/g, "").slice(0, 20);
var newId = () => "tx_" + Date.now() + "_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
var money = (v) => v == null || !isFinite(v) ? "\u2014" : Math.abs(v) >= 1e6 ? usd(v) : Math.abs(v) >= 1 || v === 0 ? usd2(v) : (v < 0 ? "\u2212" : "") + "$" + +Math.abs(v).toPrecision(4);
var amt = (q) => (+Number(q).toPrecision(8)).toLocaleString("en-US", { maximumFractionDigits: 8 });
function txDoc(sym, type, qty2, price2, note, extra = {}) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return JSON.parse(JSON.stringify({
    sym,
    type,
    qty: +qty2 || 0,
    price: +price2 || 0,
    total: (+qty2 || 0) * (+price2 || 0),
    date: extra.date || now,
    createdAt: now,
    note: String(note || "").slice(0, 500),
    device: "telegram-bot",
    ...extra.feeUsd > 0 ? { feeUsd: +extra.feeUsd } : {},
    ...extra.link ? { link: String(extra.link).slice(0, 60) } : {},
    ...type === "sell" && extra.kind === "pay" ? { kind: "pay" } : {}
  }));
}
function when(d, now) {
  if (d == null || d === "") return { iso: new Date(now).toISOString() };
  let s = String(d).trim(), t;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    t = Date.parse(s + "T12:00:00+03:00");
    if (t > now && t - now < 864e5) t = now;
  } else t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + "+03:00");
  if (!isFinite(t)) return { error: `date "${s}" not understood \u2014 use YYYY-MM-DD` };
  if (t > now + 5 * 6e4) return { error: "the date is in the future" };
  if (t < Date.parse("2009-01-03")) return { error: "the date is too early" };
  return { iso: new Date(t).toISOString() };
}
async function prepareTrade(ctx, input) {
  const now = Date.now(), i = input || {};
  const side = String(i.side || "").toLowerCase();
  if (side !== "buy" && side !== "sell") return { error: "side must be buy or sell" };
  const user = await ctx.user();
  if (!user) return { error: "portfolio not connected \u2014 nothing can be recorded" };
  if (!user.uid) return { error: "portfolio account not found" };
  const sym = cleanSym(i.coin);
  if (!sym) return { error: "coin is needed (its ticker)" };
  const held = (user.coins || []).find((c) => c && !c.removed && String(c.sym).toUpperCase() === sym);
  if (!held) return { error: `${sym} is not in the portfolio \u2014 add the coin in the app first (Add Coin), then record trades here` };
  const m = await loadMarket([], coinsOf(user)), sum = summarize(withIds(user, m), m, now);
  const row2 = sum.coins.find((c) => c.sym === sym), have = row2 ? row2.qty : 0, marketPrice = row2 && row2.price > 0 ? row2.price : null;
  let qty2 = +i.amount, price2 = +i.price_usd;
  const total = +i.total_usd, fee = +i.fee_usd > 0 ? +i.fee_usd : 0;
  if (!(price2 > 0) && i.at_market) price2 = marketPrice || NaN;
  if (!(price2 > 0) && qty2 > 0 && total > 0) price2 = total / qty2;
  if (!(qty2 > 0) && total > 0 && price2 > 0) qty2 = total / price2;
  if (!(price2 > 0)) return { error: i.at_market ? `no current price for ${sym}` : 'the price is missing \u2014 ask the user for the price (or the total paid), or set at_market if they said "at market price"' };
  if (!(qty2 > 0)) return { error: "the amount is missing \u2014 ask the user how much (coins, or the total in USD)" };
  if (!isFinite(qty2 * price2) || qty2 * price2 > 1e9) return { error: "amount \xD7 price is not a sane number" };
  if (side === "sell" && qty2 > have * (1 + 1e-9) + 1e-12) return { error: `only ${amt(have)} ${sym} held \u2014 can't sell ${amt(qty2)}` };
  if (marketPrice && (price2 > marketPrice * 5 || price2 < marketPrice / 5)) return { error: `price $${r6(price2)} is far from today's $${r6(marketPrice)} \u2014 check the price with the user (maybe a typo or a different unit)` };
  const w = when(i.date, now);
  if (w.error) return { error: w.error };
  const note = String(i.note || "").slice(0, 200);
  const stableSym = cleanSym(side === "buy" ? i.paid_with : i.received_in);
  let stable = null;
  if (stableSym) {
    if (!isStable(stableSym)) return { error: `${stableSym} is not a stablecoin \u2014 only stablecoins (USDT, USDC\u2026) can pay / receive` };
    if (stableSym === sym) return { error: "same coin on both sides" };
    const sc = (user.coins || []).find((c) => c && !c.removed && String(c.sym).toUpperCase() === stableSym);
    if (!sc) return { error: `${stableSym} is not in the portfolio \u2014 add it in the app first, or record the trade without it` };
    const sr = sum.coins.find((c) => c.sym === stableSym), sHave = sr ? sr.qty : 0;
    const cost = qty2 * price2 + fee;
    if (side === "buy" && cost > sHave * (1 + 1e-9) + 1e-9) return { error: `only ${amt(sHave)} ${stableSym} held \u2014 not enough to pay $${r2(cost)}` };
    stable = stableSym;
  }
  const id = newId(), docs = [[id, txDoc(sym, side, qty2, price2, note, { date: w.iso, feeUsd: fee })]];
  const t2 = new Date(Date.parse(w.iso) + 1).toISOString();
  if (stable && side === "buy") docs.push([newId() + "p", txDoc(stable, "sell", qty2 * price2 + fee, 1, "Paid for buying " + amt(qty2) + " " + sym, { date: t2, link: id, kind: "pay" })]);
  if (stable && side === "sell") {
    const cash = Math.max(0, qty2 * price2 - fee);
    if (cash > 0) docs.push([newId() + "s", txDoc(stable, "buy", cash, 1, "From selling " + amt(qty2) + " " + sym, { date: t2, link: id })]);
  }
  const after = summarize(withIds({ ...user, txs: [...user.txs || [], ...docs.map((d) => d[1])] }, m), m, now);
  const a = after.coins.find((c) => c.sym === sym), sa = stable ? after.coins.find((c) => c.sym === stable) : null;
  const trade = {
    side,
    sym,
    qty: r6(qty2),
    price: r6(price2),
    total: r2(qty2 * price2),
    fee: fee || 0,
    date: w.iso,
    note,
    stable,
    held_before: r6(have),
    held_after: r6(a ? a.qty : 0),
    avg_before: row2 ? r6(row2.avg) : null,
    avg_after: a ? r6(a.avg) : null,
    realized_usd: side === "sell" && row2 ? r2((price2 - row2.avg) * qty2 - fee) : null,
    stable_after: sa ? r6(sa.qty) : stable ? 0 : null,
    value_after: r2(after.value)
  };
  ctx.trades.push({ trade, docs });
  return { ok: true, prepared: trade, saved: false, note_for_you: 'NOT saved yet. The bot itself shows the full summary (amounts, average, realized profit) with \u2705 Confirm / \u274C Cancel under your answer \u2014 so reply in ONE short line only (e.g. "\u{1F9FE} Ready \u2014 check the summary below and tap \u2705 Confirm"), plus one line only if something needs his attention. Do not repeat the numbers. Never say it was saved.' };
}
async function keepTrades(env, trades, lang = "en") {
  const gid = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  await kvPut2(env, "tg:tx:" + gid, JSON.stringify({ created: Date.now(), trades, lang }));
  return gid;
}
function tradeLines(trades, ar) {
  const L = [ar ? "\u{1F9FE} <b>\u0644\u0644\u062D\u0641\u0638 \u2014 \u0631\u0627\u062C\u0639 \u0648\u0627\u0636\u063A\u0637 \u062A\u0623\u0643\u064A\u062F:</b>" : "\u{1F9FE} <b>To save \u2014 check, then Confirm:</b>"];
  trades.forEach(({ trade: t }, n) => {
    const d = local(Date.parse(t.date), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const buy = t.side === "buy";
    const head = `${trades.length > 1 ? n + 1 + ". " : ""}${buy ? "\u{1F7E2}" : "\u{1F534}"} `, cash = money(buy ? t.total + t.fee : Math.max(0, t.total - t.fee));
    if (ar) {
      L.push(`${head}<b>${buy ? "\u0634\u0631\u0627\u0621" : "\u0628\u064A\u0639"} ${amt(t.qty)} ${esc(t.sym)}</b> \u0628\u0633\u0639\u0631 ${money(t.price)} \u2014 \u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A <b>${money(t.total)}</b>`);
      L.push(`   \u0627\u0644\u062A\u0627\u0631\u064A\u062E: ${esc(d)}${t.fee ? ` \xB7 \u0627\u0644\u0631\u0633\u0648\u0645: ${money(t.fee)}` : ""}${t.note ? " \xB7 " + esc(t.note) : ""}`);
      if (t.stable) L.push(`   ${buy ? "\u0645\u062F\u0641\u0648\u0639 \u0645\u0646" : "\u0627\u0644\u0641\u0644\u0648\u0633 \u0631\u0627\u064A\u062D\u0629 \u0644\u0640"} ${esc(t.stable)}: ${buy ? "\u2212" : "+"}${cash}`);
      L.push(`   \u0627\u0644\u0643\u0645\u064A\u0629: \u0645\u0646 ${amt(t.held_before)} \u0644\u0640 <b>${amt(t.held_after)}</b> ${esc(t.sym)}`);
      if (buy && t.avg_after) L.push(`   \u0627\u0644\u0645\u062A\u0648\u0633\u0637: \u0645\u0646 ${money(t.avg_before)} \u0644\u0640 <b>${money(t.avg_after)}</b>`);
      if (t.realized_usd != null) L.push(`   \u0631\u0628\u062D \u0645\u062D\u0642\u0642: <b>${t.realized_usd >= 0 ? "+" : "\u2212"}${money(Math.abs(t.realized_usd))}</b>`);
      return;
    }
    L.push(`${head}<b>${buy ? "Buy" : "Sell"} ${amt(t.qty)} ${esc(t.sym)}</b> @ ${money(t.price)} = <b>${money(t.total)}</b>`);
    L.push(`   ${esc(d)}${t.fee ? ` \xB7 fee ${money(t.fee)}` : ""}${t.note ? " \xB7 " + esc(t.note) : ""}`);
    if (t.stable) L.push(`   ${buy ? "paid with" : "into"} ${esc(t.stable)} ${buy ? "\u2212" : "+"}${cash}`);
    L.push(`   ${esc(t.sym)} ${amt(t.held_before)} \u2192 <b>${amt(t.held_after)}</b>`);
    if (buy && t.avg_after) L.push(`   avg ${money(t.avg_before)} \u2192 <b>${money(t.avg_after)}</b>`);
    if (t.realized_usd != null) L.push(`   Realized: <b>${t.realized_usd >= 0 ? "+" : "\u2212"}${money(Math.abs(t.realized_usd))}</b>`);
  });
  return L.join("\n");
}
async function confirmTrades(env, gid) {
  const raw = await kvGet2(env, "tg:tx:" + gid);
  if (!raw) return { error: "gone" };
  const g = JSON.parse(raw), lang = g.lang;
  await kvDel(env, "tg:tx:" + gid);
  if (Date.now() - g.created > TTL) return { error: "expired", lang };
  const user = await loadUser(env, true);
  if (!user || !user.uid) return { error: "nouser", lang };
  const m = await loadMarket([], coinsOf(user)), sum = summarize(withIds(user, m), m, Date.now());
  for (const { trade: t } of g.trades) {
    if (!(user.coins || []).some((c) => c && !c.removed && String(c.sym).toUpperCase() === t.sym)) return { error: "changed", lang, why: t.sym + " is no longer in the portfolio" };
    const r = sum.coins.find((c) => c.sym === t.sym);
    if (t.side === "sell" && t.qty > (r ? r.qty : 0) * (1 + 1e-9) + 1e-12) return { error: "changed", lang, why: `only ${amt(r ? r.qty : 0)} ${t.sym} held now` };
  }
  const docs = g.trades.flatMap((x) => x.docs).map(([id, data]) => ({ path: "txs/" + id, data }));
  const ok2 = await commitDocs(env, user.uid, docs).catch((e) => ({ error: String(e && e.message) }));
  if (ok2 && ok2.error) {
    console.log(JSON.stringify({ trade: "save-failed", message: ok2.error.slice(0, 200) }));
    return { error: "save", lang, why: ok2.error };
  }
  const fresh = await loadUser(env, true).catch(() => null);
  const m2 = fresh ? await loadMarket([], coinsOf(fresh)) : null, s2 = fresh ? summarize(withIds(fresh, m2), m2, Date.now()) : null;
  return { ok: true, lang: g.lang, trades: g.trades.map((x) => x.trade), holdings: s2 ? g.trades.map(({ trade: t }) => {
    const c = s2.coins.find((z) => z.sym === t.sym);
    return { sym: t.sym, qty: c ? c.qty : 0, avg: c ? c.avg : null };
  }) : [] };
}
async function cancelTrades(env, gid) {
  const raw = await kvGet2(env, "tg:tx:" + gid);
  await kvDel(env, "tg:tx:" + gid);
  if (!raw) return false;
  try {
    return JSON.parse(raw).lang || "en";
  } catch (_) {
    return "en";
  }
}

// tools/worker/ai.mjs
var H2 = 36e5;
var DAY2 = 24 * H2;
var LIMIT = (env) => Math.max(1, Math.min(500, parseInt(env.AI_DAILY_LIMIT || "30", 10) || 30));
var MAX_ROUNDS = 8;
var HISTORY = 10;
var r22 = (v) => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
var r62 = (v) => v == null || !isFinite(v) ? null : +Number(v).toPrecision(6);
var mem3 = /* @__PURE__ */ new Map();
async function kvGet3(env, k) {
  try {
    if (env.RATE) return await env.RATE.get(k);
  } catch (_) {
  }
  return mem3.has(k) ? mem3.get(k) : null;
}
async function kvPut3(env, k, v, ttl) {
  mem3.set(k, v);
  try {
    if (env.RATE) await env.RATE.put(k, v, ttl ? { expirationTtl: ttl } : void 0);
  } catch (_) {
  }
}
async function kvDel2(env, k) {
  mem3.delete(k);
  try {
    if (env.RATE) await env.RATE.delete(k);
  } catch (_) {
  }
}
async function firstTime(env, updateId) {
  if (updateId == null) return true;
  const k = "tg:u:" + updateId;
  if (await kvGet3(env, k)) return false;
  await kvPut3(env, k, "1", 3600);
  return true;
}
var today = () => localParts(Date.now()).date;
async function usage(env) {
  const n = +await kvGet3(env, "tg:ai:" + today()) || 0;
  return { used: n, limit: LIMIT(env), left: Math.max(0, LIMIT(env) - n) };
}
async function countOne(env) {
  const u = await usage(env);
  await kvPut3(env, "tg:ai:" + today(), String(u.used + 1), 2 * 86400);
  return u.left - 1;
}
async function forget(env) {
  await kvDel2(env, "tg:hist");
}
async function history(env) {
  try {
    const h = JSON.parse(await kvGet3(env, "tg:hist") || "[]");
    return Array.isArray(h) ? h : [];
  } catch (_) {
    return [];
  }
}
async function remember(env, q, a) {
  const h = (await history(env)).concat([{ role: "user", content: q }, { role: "assistant", content: a }]).slice(-HISTORY);
  await kvPut3(env, "tg:hist", JSON.stringify(h), 6 * 3600);
}
var TOOLS = [
  {
    name: "get_coin",
    description: "Live data for one coin (any coin, by ticker or name): price, 24h / 7d / 30d change, market-cap rank, market cap, 24h volume, 7-day high / low, whether it has perpetual futures (a CoinGlass liquidation map), and \u2014 if the user holds it \u2014 amount, value, average buy price, profit %, the app's signal and its result vs holding BTC. Call once per coin; call it for every coin you mention with a number.",
    input_schema: { type: "object", properties: { coin: { type: "string", description: 'Ticker or name, e.g. "BTC", "sol", "pendle", "Render"' } }, required: ["coin"] }
  },
  {
    name: "get_portfolio",
    description: "The user's whole portfolio now: total value, 24h / 7d change, all-time profit, result vs holding BTC, and EVERY coin with value, share %, 24h / 7d change, profit vs average buy price, signal, vs_btc_pct (its result minus the same dollars in BTC since bought) and vs_btc_30d_pts / vs_btc_90d_pts (strength vs BTC over 30 / 90 days); signal counts; allocation vs targets. One call answers questions about all coins \u2014 no need to call get_coin for each.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "get_market",
    description: "The crypto market now: BTC price, BTC / USDT dominance, Fear & Greed (and its week-ago value), Altcoin Season index, total market cap, latest spot-ETF flows, the best / worst 24h coins of the Top N (stablecoins left out), and the best / worst 24h Binance bStocks (tokenized US stocks).",
    input_schema: { type: "object", properties: { top: { type: "integer", enum: [100, 200, 300, 500], description: "Rank range for best / worst (default 100)" } } }
  },
  {
    name: "get_plan",
    description: "The user's accumulation plan: per-coin target vs held (progress %), overall progress, regular buys (DCA: amount, schedule, next date, late or not), buy-price alerts (alert price vs current price).",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "get_exit",
    description: "The user's exit plan: the 3 market exit conditions (BTC dominance, USDT dominance, ETH/BTC \u2014 now vs target, met or not) and every take-profit level (coin, level, multiple of average, % still to go, % to sell there).",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "get_derivatives",
    description: `Futures (perpetuals) data for one coin, live from OKX, Binance and Hyperliquid (free public APIs): funding rate (per 8 h, average + annualized, and what it means), open interest in USD and its 24h change, % of accounts long (long / short ratio), top traders' long / short positions (Binance), and the liquidations OKX reported in the last 24 h (longs vs shorts in USD). Use it for liquidation, squeeze, leverage, funding or "where can price be pulled" questions, with get_coin / get_history for the price levels. It has no liquidation heatmap (CoinGlass's is private) \u2014 the Liq Map button opens it.`,
    input_schema: { type: "object", properties: { coin: { type: "string", description: 'Ticker, e.g. "SOL"' } }, required: ["coin"] }
  },
  {
    name: "set_alert",
    description: 'Save an alert the user asks for in words ("tell me if SOL drops below 82", "if BTC goes above 100k", "if ETH moves -8% in a day", "if SOL funding turns negative", "if my portfolio goes under 25k"). Checked every 5 minutes; fires once, then removed. kinds: price_below / price_above (USD), change_24h_below / change_24h_above (%), funding_below / funding_above (% per 8 h; "turns negative" = funding_below 0), portfolio_below / portfolio_above (USD, no coin). The result says the value now and already_met (then it waits for the next crossing \u2014 tell the user).',
    input_schema: { type: "object", properties: { coin: { type: "string" }, kind: { type: "string", enum: ["price_below", "price_above", "change_24h_below", "change_24h_above", "funding_below", "funding_above", "portfolio_below", "portfolio_above"] }, value: { type: "number" }, note: { type: "string", description: "Optional short reminder shown when it fires" } }, required: ["kind", "value"] }
  },
  { name: "list_alerts", description: "The user's saved alerts (id, what, armed).", input_schema: { type: "object", properties: {} } },
  { name: "delete_alert", description: "Delete an alert by its id (from list_alerts) \u2014 when the user asks to cancel / remove one.", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  {
    name: "what_if",
    description: `Simulate the user's portfolio at other prices and / or after trades, with the app's numbers: new total value, change, all-time profit, each changed coin, cash from sells, and which exit-plan take-profits would be reached. prices = {"BTC": 150000} (USD); moves_pct = {"SOL": -20}; alts_move_pct = a % applied to every other non-BTC, non-stable coin not given (e.g. "if alts follow BTC"); sell = [{coin, fraction 0\u20131}] at the new price; buy = [{coin, usd}] with new money at the new price. Coins not mentioned keep today's price.`,
    input_schema: { type: "object", properties: {
      prices: { type: "object", additionalProperties: { type: "number" } },
      moves_pct: { type: "object", additionalProperties: { type: "number" } },
      alts_move_pct: { type: "number" },
      sell: { type: "array", items: { type: "object", properties: { coin: { type: "string" }, fraction: { type: "number" } }, required: ["coin", "fraction"] } },
      buy: { type: "array", items: { type: "object", properties: { coin: { type: "string" }, usd: { type: "number" } }, required: ["coin", "usd"] } }
    } }
  },
  {
    name: "record_trade",
    description: 'PREPARE a trade the user says he made ("bought 0.01 BTC at 95k", "\u0627\u0634\u062A\u0631\u064A\u062A 5 SOL \u0628\u0640 140", "sold half my LINK at 18", "\u0628\u0639\u062A 100 \u062F\u0648\u0644\u0627\u0631 ETH \u0628\u0633\u0639\u0631 \u0627\u0644\u0633\u0648\u0642"). It is NOT saved: the bot shows it with \u2705 Confirm / \u274C Cancel buttons; only his tap saves it. Only for coins already in his portfolio. amount = coins (for "half my LINK" call get_portfolio first and pass the number); price_usd per coin, OR total_usd (with amount or price), OR at_market true when he says market / now price. fee_usd optional. date: YYYY-MM-DD (or with time) only when he says when ("yesterday" \u2192 that date), else leave it out (= now). paid_with (buy) / received_in (sell): a stablecoin he names ("with USDT", "into USDC") \u2014 that coin moves too, like the app. One call per trade. If the price or amount is missing and he did not say market price, ask him instead of guessing.',
    input_schema: { type: "object", properties: { side: { type: "string", enum: ["buy", "sell"] }, coin: { type: "string" }, amount: { type: "number" }, price_usd: { type: "number" }, total_usd: { type: "number" }, at_market: { type: "boolean" }, fee_usd: { type: "number" }, date: { type: "string" }, paid_with: { type: "string" }, received_in: { type: "string" }, note: { type: "string" } }, required: ["side", "coin"] }
  },
  {
    name: "get_history",
    description: "Hourly price history of a coin for the last N days (1\u201329): start, end, % change, high and low with their dates, and the daily closes. Only for coins GitHub keeps a price file for (the user's coins and the big ones); otherwise it says so.",
    input_schema: { type: "object", properties: { coin: { type: "string" }, days: { type: "integer", minimum: 1, maximum: 29 } }, required: ["coin"] }
  }
];
function context(env) {
  let user, base, sum, used2 = /* @__PURE__ */ new Set(), coins = /* @__PURE__ */ new Set();
  const ctx = {
    env,
    used: used2,
    coins,
    trades: [],
    async user() {
      if (user === void 0) user = loadUser(env).catch(() => null);
      return user;
    },
    // one read shared by every tool
    async market(extra = []) {
      const u = await ctx.user();
      const m = await loadMarket(extra.map((c) => c.id).filter(Boolean), [...coinsOf(u), ...extra]);
      if (!extra.length) base = m;
      return m;
    },
    async sum() {
      if (sum) return sum;
      const u = await ctx.user();
      if (!u) return null;
      const m = base || await ctx.market();
      sum = { s: summarize(withIds(u, m), m, Date.now()), m };
      return sum;
    }
  };
  return ctx;
}
var srcOf = (m, id) => typeof m.live[id] === "string" ? m.live[id] + " (live)" : m.live[id] ? "CoinGecko (live)" : "market snapshot" + (m.parts && m.parts.top ? " of " + local(Date.parse(m.parts.top), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) + " Riyadh" : "");
async function runTool(ctx, name, input) {
  const now = Date.now();
  if (name === "get_coin") {
    const q = String(input && input.coin || "").trim().slice(0, 40);
    if (!q) return { error: "no coin given" };
    const u = await ctx.user(), m0 = await ctx.market();
    const c = await findCoin(q, m0, u);
    if (!c) return { error: `no coin found for "${q}"` };
    const m = await ctx.market([{ sym: c.sym, id: c.id }]);
    const id = c.id || m.idOf[c.sym];
    if (!id) return { error: `no price found for "${q}" (not on CoinGecko or the big exchanges)` };
    const row2 = [...m.top, ...m.top500].find((r) => r.id === id) || {};
    const sym = (c.sym || row2.sym || "").toUpperCase();
    ctx.used.add(srcOf(m, id));
    ctx.coins.add(id + "|" + sym);
    const fut = await loadFutures().catch(() => null);
    const sp = (row2.spark || []).filter((x) => x > 0);
    const out = {
      coin: row2.name || c.name || sym,
      ticker: sym,
      price_usd: r62(row2.price),
      change_24h_pct: r22(row2.ch24),
      change_7d_pct: r22(row2.ch7),
      change_30d_pct: r22(row2.ch30),
      rank: row2.rank || c.rank || null,
      market_cap_usd: row2.mcap ? Math.round(row2.mcap) : null,
      volume_24h_usd: row2.vol ? Math.round(row2.vol) : null,
      high_7d: sp.length ? r62(Math.max(...sp)) : null,
      low_7d: sp.length ? r62(Math.min(...sp)) : null,
      perpetual_futures: fut ? fut.has(sym) : null,
      liquidation_map: `https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=${encodeURIComponent(sym)}`,
      price_source: srcOf(m, id),
      stablecoin: isStable(sym)
    };
    if (!(row2.price > 0)) {
      const s = m.series[id];
      if (s) out.price_usd = r62(s.last);
    }
    if (u) {
      const sum = summarize(withIds(u, m), m, now), h = sum.coins.find((x) => x.sym === sym);
      ctx.used.add("your portfolio (Firebase)");
      out.you_hold = h ? { amount: r62(h.qty), value_usd: r22(h.value), share_of_portfolio_pct: sum.value > 0 ? r22(h.value / sum.value * 100) : null, average_buy_usd: r62(h.avg), profit_vs_average_pct: r22(h.chg), signal: sum.signal[sym] || "hold", signal_reason: h.why || null } : "not held";
      if (!out.price_usd && h) out.price_usd = r62(h.price);
    }
    return out;
  }
  if (name === "get_portfolio") {
    const x = await ctx.sum();
    if (!x) return { error: "portfolio not connected" };
    const { s } = x;
    ctx.used.add("your portfolio (Firebase)");
    ctx.used.add(srcOf(x.m, "bitcoin"));
    return {
      total_value_usd: r22(s.value),
      change_24h_pct: r22(s.ch24),
      change_24h_usd: r22(s.d24),
      change_7d_pct: r22(s.ch7),
      change_7d_usd: r22(s.d7),
      all_time_profit_usd: r22(s.total),
      all_time_profit_pct: r22(s.pctTotal),
      invested_usd: r22(s.invested),
      vs_holding_btc_pct: r22(s.vsBtc),
      alts_beating_btc: `${s.beat} of ${s.alts}`,
      signals: s.counts,
      coins: [...s.coins].sort((a, b) => b.value - a.value).map((c) => ({ ticker: c.sym, value_usd: r22(c.value), share_pct: s.value > 0 ? r22(c.value / s.value * 100) : null, change_24h_pct: r22(c.ch24), change_7d_pct: r22(c.ch7), profit_vs_average_pct: r22(c.chg), signal: s.signal[c.sym], vs_btc_pct: c.vs ? r22(c.vs.pct) : null, vs_btc_30d_pts: c.rs ? r22(c.rs.d30) : null, vs_btc_90d_pts: c.rs ? r22(c.rs.d90) : null, stablecoin: isStable(c.sym) || void 0 })),
      allocation: s.alloc ? s.alloc.groups.map((g) => ({ group: s.alloc.names[g.key] || g.key, now_pct: r22(g.now), target_pct: r22(g.target), state: g.state })) : null
    };
  }
  if (name === "get_market") {
    const m = await ctx.market(), n = [100, 200, 300, 500].includes(+(input && input.top)) ? +input.top : 100;
    ctx.used.add(srcOf(m, "bitcoin"));
    ctx.used.add("market snapshot (CoinGecko, alternative.me, ETF flows)");
    const g = m.global || {}, d = g.dom || {}, e = etfDay(m.etf);
    const seen = /* @__PURE__ */ new Set(), list2 = [...m.top, ...m.top500].filter((r) => r.rank && r.rank <= n && r.ch24 != null && r.sym && !isStable(r.sym) && !seen.has(r.id) && seen.add(r.id));
    const pick = (a, dir) => [...a].sort((x, y) => dir * (y.ch24 - x.ch24)).slice(0, 5).map((r) => ({ ticker: String(r.sym).toUpperCase(), rank: r.rank, price_usd: r62(r.price), change_24h_pct: r22(r.ch24) }));
    const st = (m.stocks || []).filter((r) => r.ch24 != null);
    return {
      btc_price_usd: m.btc ? r62(m.btc.price) : null,
      btc_change_24h_pct: m.btc ? r22(m.btc.ch24) : null,
      total_market_cap_usd: g.mcap ? Math.round(g.mcap) : null,
      market_cap_change_24h_pct: r22(g.mcapCh24),
      btc_dominance_pct: r22(d.btc),
      eth_dominance_pct: r22(d.eth),
      usdt_dominance_pct: r22(d.usdt),
      fear_greed: m.fng ? { value: m.fng.value, label: m.fng.label, yesterday: m.fng.prev, week_ago: m.fng.week } : null,
      altcoin_season: m.alt ? { value: m.alt.value, label: m.alt.label } : null,
      etf_flows_latest_day: e ? { date: e.date, btc_usd: e.btc, eth_usd: e.eth } : null,
      [`top${n}_best_24h`]: pick(list2, 1),
      [`top${n}_worst_24h`]: pick(list2, -1),
      bstocks_best_24h: pick(st, 1).map(({ rank, ...x }) => x),
      bstocks_worst_24h: pick(st, -1).map(({ rank, ...x }) => x)
    };
  }
  if (name === "get_plan") {
    const x = await ctx.sum();
    if (!x) return { error: "portfolio not connected" };
    const { s } = x;
    ctx.used.add("your plan (Firebase)");
    return {
      overall_progress_pct: r22(s.prog.pct),
      targets_met: `${s.prog.completed} of ${s.prog.counted}`,
      coins: s.plan.map((p) => ({ ticker: p.sym, held: r62(p.actual), target: r62(p.target), progress_pct: p.target > 0 ? r22(p.actual / p.target * 100) : null })),
      regular_buys: (s.dca || []).map((dc) => ({ ticker: dc.sym, per_month_usd: r22(dc.s.perMonth), next: dc.s.next || null, state: dc.s.state })),
      buy_price_alerts: (s.buyAt || []).map((b) => ({ ticker: b.sym, alert_price_usd: r62(b.at), price_now_usd: r62(b.price), pct_above_alert: r22((b.price / b.at - 1) * 100), still_to_buy: r62(b.left) }))
    };
  }
  if (name === "get_exit") {
    const x = await ctx.sum();
    if (!x) return { error: "portfolio not connected" };
    const { s } = x;
    ctx.used.add("your exit plan (Firebase)");
    ctx.used.add("market snapshot");
    return {
      conditions: s.macro.map((c) => ({ name: { btcD: "BTC dominance", usdtD: "USDT dominance", ethBtc: "ETH/BTC" }[c.k], now: c.now, target: `${c.op} ${c.lvl}`, met: c.met })),
      take_profits: (s.tps || []).map((t) => ({ ticker: t.sym, tp: t.n, level_usd: r62(t.level), price_now_usd: r62(t.price), pct_to_go: r22((t.level / t.price - 1) * 100), multiple_of_average: t.mult || null, sell_pct: t.pct || null })).sort((a, b) => a.pct_to_go - b.pct_to_go)
    };
  }
  if (name === "get_derivatives") {
    const q = String(input && input.coin || "").trim(), u = await ctx.user(), m = await ctx.market(), c = await findCoin(q, m, u);
    const S = c ? c.sym : q.toUpperCase();
    const d = await derivatives(S);
    if (!d) return { error: `no futures data found for ${S} on OKX, Binance or Hyperliquid` };
    ctx.used.add("futures: " + d.sources.map((x) => x.source).join(", ") + " (live)");
    if (c && (c.id || m.idOf[c.sym])) ctx.coins.add((c.id || m.idOf[c.sym]) + "|" + S);
    return { ...d, liquidation_map: `https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=${encodeURIComponent(S)}` };
  }
  if (name === "set_alert") {
    ctx.used.add("alerts (checked every 5 min)");
    return addAlert(ctx.env, input || {}, await ctx.user());
  }
  if (name === "list_alerts") {
    const l = await listAlerts(ctx.env);
    return { alerts: l.map((a) => ({ id: a.id, alert: describe(a), armed: a.armed, note: a.note || void 0 })) };
  }
  if (name === "delete_alert") return { deleted: await deleteAlert(ctx.env, String(input && input.id || "")) };
  if (name === "record_trade") {
    ctx.used.add("your portfolio (Firebase)");
    return prepareTrade(ctx, input);
  }
  if (name === "what_if") {
    const x = await ctx.sum();
    if (!x) return { error: "portfolio not connected" };
    const { s } = x;
    ctx.used.add("your portfolio (Firebase)");
    ctx.used.add("what-if (the app's maths)");
    const up = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [String(k).toUpperCase(), +v]).filter(([, v]) => isFinite(v)));
    const prices = up(input && input.prices), moves = up(input && input.moves_pct), alts = isFinite(+(input && input.alts_move_pct)) ? +input.alts_move_pct : null;
    const rows = s.coins.map((c) => {
      let p = c.price;
      if (prices[c.sym] > 0) p = prices[c.sym];
      else if (c.sym in moves) p = c.price * (1 + moves[c.sym] / 100);
      else if (alts != null && c.sym !== "BTC" && !isStable(c.sym)) p = c.price * (1 + alts / 100);
      return { sym: c.sym, qty: c.qty, avg: c.avg, price: c.price, p, buyUsd: 0, sold: 0 };
    });
    const by = (sym) => rows.find((r) => r.sym === String(sym || "").toUpperCase());
    let cash = 0, newMoney = 0, realized = 0;
    const trades = [];
    for (const t of input && input.sell || []) {
      const r = by(t.coin), f = Math.max(0, Math.min(1, +t.fraction));
      if (!r || !f) {
        trades.push({ sell: t.coin, error: "not held" });
        continue;
      }
      const q = r.qty * f;
      cash += q * r.p;
      realized += q * (r.p - r.avg);
      r.qty -= q;
      r.sold += q;
      trades.push({ sell: r.sym, amount: r62(q), usd: r22(q * r.p), profit_usd: r22(q * (r.p - r.avg)) });
    }
    for (const t of input && input.buy || []) {
      const r = by(t.coin), u = +t.usd;
      if (!r || !(u > 0)) {
        trades.push({ buy: t.coin, error: !r ? "not held \u2014 ask about it with get_coin" : "bad amount" });
        continue;
      }
      const q = u / r.p;
      r.avg = (r.avg * r.qty + u) / (r.qty + q);
      r.qty += q;
      newMoney += u;
      r.buyUsd += u;
      trades.push({ buy: r.sym, amount: r62(q), usd: r22(u), new_average: r62(r.avg) });
    }
    const before = s.value, coinsAfter = rows.reduce((a, r) => a + r.qty * r.p, 0), after = coinsAfter + cash;
    const priceGain = s.coins.reduce((a, c) => {
      const r = by(c.sym);
      return a + c.qty * (r.p - c.price);
    }, 0);
    const tps = (s.tps || []).filter((t) => {
      const r = by(t.sym);
      return r && r.p >= t.level && t.price < t.level;
    }).map((t) => ({ coin: t.sym, tp: t.n, level_usd: r62(t.level), sell_pct: t.pct || null }));
    return {
      value_now_usd: r22(before),
      value_after_usd: r22(after),
      change_usd: r22(after - before - newMoney),
      change_pct: before > 0 ? r22((after - before - newMoney) / before * 100) : null,
      cash_from_sells_usd: r22(cash),
      new_money_usd: r22(newMoney),
      realized_profit_from_sells_usd: r22(realized),
      all_time_profit_now_usd: r22(s.total),
      all_time_profit_after_usd: r22(s.total + priceGain),
      all_time_profit_after_pct: s.invested + newMoney > 0 ? r22((s.total + priceGain) / (s.invested + newMoney) * 100) : null,
      changed_coins: rows.filter((r) => r.p !== r.price || r.sold || r.buyUsd).sort((a, b) => Math.abs(b.qty * b.p - b.qty * b.price) - Math.abs(a.qty * a.p - a.qty * a.price)).slice(0, 20).map((r) => ({ ticker: r.sym, price_now: r62(r.price), price_then: r62(r.p), value_then_usd: r22(r.qty * r.p), profit_vs_average_pct: r.avg > 0 ? r22((r.p / r.avg - 1) * 100) : null })),
      trades,
      exit_take_profits_reached: tps,
      note: "coins not mentioned keep today's price; sells go to cash (USD)"
    };
  }
  if (name === "get_history") {
    const q = String(input && input.coin || "").trim(), days = Math.max(1, Math.min(29, parseInt(input && input.days || 7, 10) || 7));
    const u = await ctx.user(), m = await ctx.market(), c = await findCoin(q, m, u);
    const id = c && (c.id || m.idOf[c.sym]);
    const f = id && await rawSeries(id);
    if (!f || !Array.isArray(f.p)) return { error: `no price history kept for "${q}" \u2014 use get_coin for its 7d / 30d change` };
    const from = now - days * DAY2, pts = f.p.map((p, i) => [f.t0 + i * f.step, p]).filter(([t, p]) => t >= from && p > 0);
    if (pts.length < 2) return { error: "not enough history" };
    ctx.used.add("hourly price history (GitHub prices branch)");
    let hi = pts[0], lo = pts[0];
    for (const x of pts) {
      if (x[1] > hi[1]) hi = x;
      if (x[1] < lo[1]) lo = x;
    }
    const day = (t) => local(t, { day: "numeric", month: "short" }), closes = {};
    for (const [t, p] of pts) closes[localParts(t).date] = r62(p);
    return {
      coin: c.sym,
      days,
      start_usd: r62(pts[0][1]),
      end_usd: r62(pts[pts.length - 1][1]),
      change_pct: r22((pts[pts.length - 1][1] / pts[0][1] - 1) * 100),
      high: { usd: r62(hi[1]), on: day(hi[0]) },
      low: { usd: r62(lo[1]), on: day(lo[0]) },
      daily_closes: closes
    };
  }
  return { error: "unknown tool" };
}
function system(now, lang, qLang) {
  return [
    "You are the Cute Portfolio assistant inside Telegram \u2014 a sharp, honest crypto analyst for one private user, Samir, who runs a long-term Bitcoin-first strategy (accumulation plan, DCA, an exit plan) in the Cute Portfolio app.",
    `Now: ${local(now, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} (Riyadh).`,
    "RULES",
    "- Every number you state (price, %, value, rank, flow\u2026) must come from a tool result in this conversation. Never use prices or market data from memory \u2014 call the tools first (several in one turn if needed). If a tool has no data, say so.",
    '- Each new question: call the tools again. Earlier answers in this chat may be stale or wrong \u2014 never repeat an earlier "no data" (or any earlier number) without calling the tool now.',
    "- For liquidation / squeeze / leverage / funding questions always call get_derivatives (with get_coin and get_history for the levels).",
    '- "Tell me / alert me / \u0646\u0628\u0651\u0647\u0646\u064A if \u2026" \u2192 set_alert (then confirm in one short line what was set, the value now, and if already_met that it waits for the next crossing). "What if / \u0644\u0648 \u2026" about prices or trades \u2192 what_if (with get_coin for a coin he does not hold).',
    `- "I bought / I sold / \u0627\u0634\u062A\u0631\u064A\u062A / \u0628\u0639\u062A \u2026" (a trade he MADE) \u2192 record_trade. It is only prepared, and the bot shows the full summary itself \u2014 so your whole answer is ONE short line ("\u{1F9FE} \u062C\u0627\u0647\u0632\u0629 \u2014 \u0631\u0627\u062C\u0639 \u0627\u0644\u0645\u0644\u062E\u0635 \u062A\u062D\u062A \u0648\u0627\u0636\u063A\u0637 \u2705 \u062A\u0623\u0643\u064A\u062F" / "\u{1F9FE} Ready \u2014 check the summary below and tap \u2705 Confirm"), plus at most one line if something needs attention (e.g. a price far from today's). No sections, no repeated numbers. Never say it is saved. A trade he is only thinking about ("should I / what if I sell") \u2192 what_if, not record_trade.`,
    "- General knowledge (what a project does, how something works, history) is fine without tools; say when it may be out of date.",
    '- About the future: give scenarios, levels and probabilities with reasons \u2014 never promises. Not financial advice, but do give a clear, practical view when asked "should I\u2026" (based on his plan and signals).',
    "STYLE \u2014 like the app's AI Analysis report, short and sharp, all in points:",
    "- Line 1: one emoji + a **bold one-line verdict**.",
    "- Then 2\u20134 short sections. Each section: a title line = emoji + **Title** (e.g. \u{1F4CA} **Market**, \u{1F4BC} **Your SOL**, \u26A1 **Futures**, \u{1F9F2} **Liquidation levels**, \u{1F4C8} **Scenarios**, \u{1F3AF} **My view**), then 2\u20134 bullets.",
    '- Bullets: "\u2022 label: **value** \u2014 3\u20136 word note". One idea per bullet. No paragraphs; any sentence \u2264 ~12 words.',
    "- A blank line between sections. ~16 lines in all unless asked for detail. Phone screen: short lines (aim \u2264 40 characters). No tables, no # headings.",
    "- **bold** only for numbers and verdicts; `code` for tickers in lists. No links (buttons under the answer open coins and the Liq Map).",
    "- Scenarios as bullets with a % each that adds to ~100, and the price level that triggers each.",
    `- Language: the user's latest message is in ${qLang === "ar" ? "Arabic \u2014 answer in Egyptian Arabic" : "English \u2014 answer in English"} (whatever language earlier messages were in). Numbers and tickers in Latin characters.`,
    "- Prefer one call that covers many coins (get_portfolio) over many get_coin calls; call independent tools together in one turn.",
    "- Do not write a sources line \u2014 the bot adds one."
  ].join("\n");
}
async function claude(env, model, body) {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model, ...body }) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}
function toHtml(text) {
  let s = String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  s = s.replace(/^#{1,6}\s*(.+)$/gm, "<b>$1</b>");
  s = s.replace(/\*\*([^*\n][^*]*?)\*\*/g, "<b>$1</b>").replace(/__([^_\n]+?)__/g, "<b>$1</b>");
  s = s.replace(/`([^`\n]+?)`/g, "<code>$1</code>");
  s = s.replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s).,!?:;]|$)/gm, "$1<i>$2</i>");
  s = s.replace(/^\s*[-*]\s+/gm, "\u2022 ");
  return s.trim();
}
async function ask(env, question, lang = "en") {
  if (!env.ANTHROPIC_API_KEY) return { error: "nokey" };
  const u = await usage(env);
  if (u.left <= 0) return { error: "limit", limit: u.limit };
  const now = Date.now(), ctx = context(env);
  const qLang = /[\u0600-\u06FF]/.test(String(question)) ? "ar" : "en";
  const messages = [...await history(env), { role: "user", content: String(question).slice(0, 2e3) + (qLang === "ar" ? "\n\n(\u062C\u0627\u0648\u0628 \u0628\u0627\u0644\u0639\u0631\u0628\u064A \u0627\u0644\u0645\u0635\u0631\u064A)" : "\n\n(Reply in English.)") }];
  let model = env.BOT_MODEL || "claude-sonnet-5-5", fellBack = false, text = "";
  for (let round = 0; round <= MAX_ROUNDS; round++) {
    const body = { max_tokens: 2e3, system: system(now, lang, qLang), tools: TOOLS, ...round === MAX_ROUNDS ? { tool_choice: { type: "none" } } : {}, messages };
    let r = await claude(env, model, body);
    if (!r.ok && !fellBack && (r.status === 404 || r.status === 400 && /model/i.test(JSON.stringify(r.j.error || {})))) {
      fellBack = true;
      model = env.MODEL || "claude-opus-4-5";
      r = await claude(env, model, body);
    }
    if (!r.ok) {
      console.log(JSON.stringify({ ai: "claude-error", round, status: r.status, type: r.j.error && r.j.error.type, message: String(r.j.error && r.j.error.message || "").slice(0, 300) }));
      return { error: r.status === 429 || r.status === 529 ? "busy" : "claude", detail: r.status };
    }
    const content = r.j.content || [];
    const calls = content.filter((b) => b.type === "tool_use");
    if (!calls.length || r.j.stop_reason !== "tool_use") {
      text = content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      break;
    }
    messages.push({ role: "assistant", content });
    const results = await Promise.all(calls.map(async (c) => {
      let out;
      try {
        out = await runTool(ctx, c.name, c.input || {});
      } catch (e) {
        console.log(JSON.stringify({ ai: "tool-error", tool: c.name, message: String(e && e.message).slice(0, 200) }));
        out = { error: "tool failed" };
      }
      return { type: "tool_result", tool_use_id: c.id, content: JSON.stringify(out).slice(0, 4e4) };
    }));
    messages.push({ role: "user", content: results });
  }
  if (!text) {
    console.log(JSON.stringify({ ai: "empty-answer", rounds: MAX_ROUNDS }));
    return { error: "empty" };
  }
  console.log(JSON.stringify({ ai: "ok", model, tools: [...ctx.used].length, ms: Date.now() - now }));
  const left = await countOne(env);
  await remember(env, String(question).slice(0, 2e3), text.slice(0, 3e3));
  const coins = [...ctx.coins].map((x) => x.split("|")).slice(0, 3);
  return { text: toHtml(text), sources: [...ctx.used], coins, left, limit: u.limit, model, trades: ctx.trades };
}

// tools/worker/voice.mjs
var MAX_SEC = 120;
var MODEL = "@cf/openai/whisper-large-v3-turbo";
var HINT = "Bitcoin BTC, ETH, SOL, LINK, PENDLE, funding, alert, portfolio, take profit. \u0646\u0628\u0651\u0647\u0646\u064A \u0644\u0648\u060C \u0645\u062D\u0641\u0638\u062A\u064A\u060C \u0627\u0644\u0633\u0639\u0631\u060C \u062E\u0637\u0629 \u0627\u0644\u062E\u0631\u0648\u062C.";
function b64(buf) {
  const u8 = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
  return btoa(s);
}
async function transcribe(env, voice) {
  if (!env.AI || typeof env.AI.run !== "function") return { error: "noai" };
  if (!voice || !voice.file_id) return { error: "fail" };
  if ((voice.duration || 0) > MAX_SEC || (voice.file_size || 0) > 1e7) return { error: "long" };
  try {
    const f = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ file_id: voice.file_id }) }).then((r) => r.json());
    const p = f && f.ok && f.result && f.result.file_path;
    if (!p) return { error: "fail" };
    const audio = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${p}`);
    if (!audio.ok) return { error: "fail" };
    const out = await env.AI.run(MODEL, { audio: b64(await audio.arrayBuffer()), vad_filter: true, initial_prompt: HINT });
    const text = String(out && out.text || "").replace(/\s+/g, " ").trim().slice(0, 1e3);
    return text.replace(/[\p{P}\s]/gu, "").length < 2 ? { error: "empty" } : { text };
  } catch (e) {
    console.log(JSON.stringify({ voice: "fail", message: String(e && e.message).slice(0, 300) }));
    return { error: "fail" };
  }
}

// tools/worker/bot.mjs
var H3 = 36e5;
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
    topUp: (n) => `Top ${n} \xB7 best 24h`,
    topDn: (n) => `Top ${n} \xB7 worst 24h`,
    stUp: "bStocks \xB7 best 24h",
    stDn: "bStocks \xB7 worst 24h",
    stNote: "tokenized US stocks (Binance)",
    updated: "Updated",
    futures: "Futures",
    yes: "yes",
    private: "",
    welcome: "Your bot is connected \u2705\nAsk me anything in plain words, tap a button below, or send a ticker like <code>btc</code>.",
    thinking: "\u{1F9E0} Thinking\u2026",
    aiLimit: (n) => `You've used today's ${n} questions \u2014 more tomorrow (midnight Riyadh). Buttons and tickers still work.`,
    aiNoKey: "The AI is not set up (ANTHROPIC_API_KEY is missing in the Worker).",
    aiBusy: "Claude is busy right now \u2014 try again in a minute.",
    aiErr: "I couldn't answer that just now \u2014 try again, or rephrase.",
    newChat: "\u{1F195} New chat",
    newDone: "New chat \u2014 I forgot the earlier messages \u{1F9F9}",
    aiLeft: (a, n) => `${a}/${n} left today`,
    data: "Data",
    alertsB: "\u{1F514} Alerts",
    alertGone: "\u{1F5D1} Alert deleted",
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
    tpKey: "level \xB7 to go \xB7 sell",
    more: (n) => `+${n} more coins in the app`,
    toGo: "to go",
    sellP: (p) => `sell ${p}%`,
    reached: "reached",
    noExit: "No take-profit levels yet \u2014 set them on the Exit Strategy page.",
    openExit: "\u{1F6AA} Open Exit Strategy",
    allExit: "All 3 conditions met \u2014 your exit zone",
    kb: { pf: "\u{1F4BC} Portfolio", mk: "\u{1F30D} Market", pl: "\u{1F4CB} Plan", ex: "\u{1F6AA} Exit", mv: "\u{1F3C6} Movers", sg: "\u{1F3AF} Signals" },
    kbOld: { mv: "\u{1F3C6} Best & worst", ex: "\u{1F6AA} Exit plan" },
    hidden: "Buttons hidden \u2328\uFE0F \u2014 tap the \u2328\uFE0F icon in the message box (or send /start) to bring them back.",
    txOk: "\u2705 Confirm",
    txNo: "\u274C Cancel",
    txOkAll: (n) => `\u2705 Confirm all ${n}`,
    txSaved: (n) => `\u2705 <b>Saved ${n === 1 ? "the trade" : n + " trades"}</b> to your portfolio \u2014 the app shows it now.`,
    txCancelled: "\u274C Cancelled \u2014 nothing was saved.",
    txGone: "This trade was already saved or cancelled.",
    txExpired: "\u231B Over 15 minutes old \u2014 nothing saved. Tell me the trade again.",
    txChanged: (why) => `\u26A0\uFE0F Not saved \u2014 your portfolio changed since: ${why}. Tell me the trade again.`,
    txNoUser: "Your portfolio is not connected \u2014 nothing saved.",
    txSaveErr: (why) => `\u26A0\uFE0F Not saved \u2014 Firestore refused it (${why}).${/403/.test(why) ? ' The service account can only read: in Google Cloud \u2192 IAM give it the role "Cloud Datastore User".' : ""}`,
    nowHold: "now",
    listening: "\u{1F399}\uFE0F Listening\u2026",
    heard: "\u{1F399}\uFE0F I heard:",
    vNoAi: "Voice notes are not set up yet (the AI binding is missing in the Worker) \u2014 please type it.",
    vLong: (s) => `Voice notes up to ${s / 60} min, please \u2014 or type it.`,
    vEmpty: "\u{1F399}\uFE0F I couldn't make out any words \u2014 try again, or type it.",
    vFail: "\u{1F399}\uFE0F I couldn't read that voice note \u2014 try again, or type it."
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
    topUp: (n) => `\u0623\u0639\u0644\u0649 ${n} \xB7 \u0627\u0644\u0623\u0641\u0636\u0644 24\u0633`,
    topDn: (n) => `\u0623\u0639\u0644\u0649 ${n} \xB7 \u0627\u0644\u0623\u0633\u0648\u0623 24\u0633`,
    stUp: "bStocks \xB7 \u0627\u0644\u0623\u0641\u0636\u0644 24\u0633",
    stDn: "bStocks \xB7 \u0627\u0644\u0623\u0633\u0648\u0623 24\u0633",
    stNote: "\u0623\u0633\u0647\u0645 \u0623\u0645\u0631\u064A\u0643\u064A\u0629 \u0645\u0631\u0645\u0651\u0632\u0629 (Binance)",
    updated: "\u0627\u062A\u062D\u062F\u0651\u062B",
    futures: "Futures",
    yes: "\u0623\u064A\u0648\u0647",
    private: "",
    welcome: "\u0627\u0644\u0628\u0648\u062A \u0627\u062A\u0648\u0635\u0644 \u2705\n\u0628\u064A\u0631\u062F \u0639\u0644\u064A\u0643 \u0647\u0646\u0627 \u0641\u064A \u0623\u064A \u0648\u0642\u062A. \u0627\u0636\u063A\u0637 \u0632\u0631\u0627\u0631 \u062A\u062D\u062A\u060C \u0623\u0648 \u0627\u0628\u0639\u062A \u0631\u0645\u0632 \u0639\u0645\u0644\u0629 \u0632\u064A <code>btc</code>.",
    thinking: "\u{1F9E0} \u0628\u0641\u0643\u0651\u0631\u2026",
    aiLimit: (n) => `\u062E\u0644\u0635\u062A \u0627\u0644\u0640 ${n} \u0633\u0624\u0627\u0644 \u0628\u062A\u0648\u0639 \u0627\u0644\u0646\u0647\u0627\u0631\u062F\u0647 \u2014 \u0628\u0643\u0631\u0629 \u064A\u062A\u062C\u062F\u062F\u0648\u0627 (12 \u0628\u0627\u0644\u0644\u064A\u0644 \u0628\u062A\u0648\u0642\u064A\u062A \u0627\u0644\u0631\u064A\u0627\u0636). \u0627\u0644\u0623\u0632\u0631\u0627\u0631 \u0648\u0627\u0644\u0631\u0645\u0648\u0632 \u0634\u063A\u0627\u0644\u0629 \u0639\u0627\u062F\u064A.`,
    aiNoKey: "\u0627\u0644\u0640 AI \u0645\u0634 \u0645\u062A\u0638\u0628\u0637 (ANTHROPIC_API_KEY \u0646\u0627\u0642\u0635 \u0641\u064A \u0627\u0644\u0640 Worker).",
    aiBusy: "Claude \u0645\u0634\u063A\u0648\u0644 \u062F\u0644\u0648\u0642\u062A\u064A \u2014 \u062C\u0631\u0651\u0628 \u0643\u0645\u0627\u0646 \u062F\u0642\u064A\u0642\u0629.",
    aiErr: "\u0645\u0627 \u0642\u062F\u0631\u062A\u0634 \u0623\u062C\u0627\u0648\u0628 \u062F\u0644\u0648\u0642\u062A\u064A \u2014 \u062C\u0631\u0651\u0628 \u062A\u0627\u0646\u064A \u0623\u0648 \u0627\u0643\u062A\u0628 \u0627\u0644\u0633\u0624\u0627\u0644 \u0628\u0634\u0643\u0644 \u062A\u0627\u0646\u064A.",
    newChat: "\u{1F195} \u0645\u062D\u0627\u062F\u062B\u0629 \u062C\u062F\u064A\u062F\u0629",
    newDone: "\u0645\u062D\u0627\u062F\u062B\u0629 \u062C\u062F\u064A\u062F\u0629 \u2014 \u0646\u0633\u064A\u062A \u0627\u0644\u0643\u0644\u0627\u0645 \u0627\u0644\u0644\u064A \u0641\u0627\u062A \u{1F9F9}",
    aiLeft: (a, n) => `\u0628\u0627\u0642\u064A ${a}/${n} \u0627\u0644\u0646\u0647\u0627\u0631\u062F\u0647`,
    data: "\u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A",
    alertsB: "\u{1F514} \u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A",
    alertGone: "\u{1F5D1} \u0627\u062A\u0645\u0633\u062D \u0627\u0644\u062A\u0646\u0628\u064A\u0647",
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
    tpKey: "\u0627\u0644\u0633\u0639\u0631 \xB7 \u0627\u0644\u0628\u0627\u0642\u064A \xB7 \u0627\u0644\u0628\u064A\u0639",
    more: (n) => `+${n} \u0639\u0645\u0644\u0629 \u0643\u0645\u0627\u0646 \u0641\u064A \u0627\u0644\u062A\u0637\u0628\u064A\u0642`,
    toGo: "\u0628\u0627\u0642\u064A",
    sellP: (p) => `\u0628\u064A\u0639 ${p}%`,
    reached: "\u0648\u0635\u0644",
    noExit: "\u0645\u0641\u064A\u0634 \u0645\u0633\u062A\u0648\u064A\u0627\u062A \u062C\u0646\u064A \u0623\u0631\u0628\u0627\u062D \u0644\u0633\u0647 \u2014 \u062D\u0637\u0647\u0627 \u0645\u0646 \u0635\u0641\u062D\u0629 Exit Strategy.",
    openExit: "\u{1F6AA} \u0627\u0641\u062A\u062D Exit Strategy",
    allExit: "\u0627\u0644\u0634\u0631\u0648\u0637 \u0627\u0644\u0640 3 \u0627\u062A\u062D\u0642\u0642\u062A \u2014 \u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u062E\u0631\u0648\u062C",
    kb: { pf: "\u{1F4BC} \u0645\u062D\u0641\u0638\u062A\u064A", mk: "\u{1F30D} \u0627\u0644\u0633\u0648\u0642", pl: "\u{1F4CB} \u0627\u0644\u062E\u0637\u0629", ex: "\u{1F6AA} \u0627\u0644\u062E\u0631\u0648\u062C", mv: "\u{1F3C6} \u0627\u0644\u0623\u0641\u0636\u0644", sg: "\u{1F3AF} \u0627\u0644\u0625\u0634\u0627\u0631\u0627\u062A" },
    kbOld: { mv: "\u{1F3C6} \u0627\u0644\u0623\u0641\u0636\u0644 \u0648\u0627\u0644\u0623\u0633\u0648\u0623", ex: "\u{1F6AA} \u062E\u0637\u0629 \u0627\u0644\u062E\u0631\u0648\u062C" },
    hidden: "\u0627\u0644\u0623\u0632\u0631\u0627\u0631 \u0627\u062A\u062E\u0641\u062A \u2328\uFE0F \u2014 \u0627\u0636\u063A\u0637 \u0639\u0644\u0627\u0645\u0629 \u2328\uFE0F \u0641\u064A \u062E\u0627\u0646\u0629 \u0627\u0644\u0643\u062A\u0627\u0628\u0629 (\u0623\u0648 \u0627\u0628\u0639\u062A /start) \u0639\u0634\u0627\u0646 \u062A\u0631\u062C\u0639.",
    txOk: "\u2705 \u062A\u0623\u0643\u064A\u062F",
    txNo: "\u274C \u0625\u0644\u063A\u0627\u0621",
    txOkAll: (n) => `\u2705 \u062A\u0623\u0643\u064A\u062F \u0627\u0644\u0640 ${n}`,
    txSaved: (n) => `\u2705 <b>\u0627\u062A\u062D\u0641\u0638${n === 1 ? "\u062A \u0627\u0644\u0635\u0641\u0642\u0629" : "\u062A " + n + " \u0635\u0641\u0642\u0627\u062A"}</b> \u0641\u064A \u0645\u062D\u0641\u0638\u062A\u0643 \u2014 \u0647\u062A\u0644\u0627\u0642\u064A\u0647\u0627 \u0641\u064A \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u062F\u0644\u0648\u0642\u062A\u064A.`,
    txCancelled: "\u274C \u0627\u062A\u0644\u063A\u062A \u2014 \u0645\u0627 \u0627\u062A\u062D\u0641\u0638\u0634 \u062D\u0627\u062C\u0629.",
    txGone: "\u0627\u0644\u0635\u0641\u0642\u0629 \u062F\u064A \u0627\u062A\u062D\u0641\u0638\u062A \u0623\u0648 \u0627\u062A\u0644\u063A\u062A \u0642\u0628\u0644 \u0643\u062F\u0647.",
    txExpired: "\u231B \u0639\u062F\u0651\u0649 \u0623\u0643\u062A\u0631 \u0645\u0646 15 \u062F\u0642\u064A\u0642\u0629 \u2014 \u0645\u0627 \u0627\u062A\u062D\u0641\u0638\u0634 \u062D\u0627\u062C\u0629. \u0642\u0648\u0644\u0651\u064A \u0627\u0644\u0635\u0641\u0642\u0629 \u062A\u0627\u0646\u064A.",
    txChanged: (why) => `\u26A0\uFE0F \u0645\u0627 \u0627\u062A\u062D\u0641\u0638\u0634 \u2014 \u0645\u062D\u0641\u0638\u062A\u0643 \u0627\u062A\u063A\u064A\u0631\u062A: ${why}. \u0642\u0648\u0644\u0651\u064A \u0627\u0644\u0635\u0641\u0642\u0629 \u062A\u0627\u0646\u064A.`,
    txNoUser: "\u0627\u0644\u0645\u062D\u0641\u0638\u0629 \u0645\u0634 \u0645\u062A\u0648\u0635\u0644\u0629 \u2014 \u0645\u0627 \u0627\u062A\u062D\u0641\u0638\u0634 \u062D\u0627\u062C\u0629.",
    txSaveErr: (why) => `\u26A0\uFE0F \u0645\u0627 \u0627\u062A\u062D\u0641\u0638\u0634 \u2014 Firestore \u0631\u0641\u0636 (${why}).${/403/.test(why) ? ' \u062D\u0633\u0627\u0628 \u0627\u0644\u062E\u062F\u0645\u0629 \u0628\u064A\u0642\u0631\u0627 \u0628\u0633: \u0645\u0646 Google Cloud \u2192 IAM \u0627\u062F\u064A\u0644\u0647 \u062F\u0648\u0631 "Cloud Datastore User".' : ""}`,
    nowHold: "\u062F\u0644\u0648\u0642\u062A\u064A",
    listening: "\u{1F399}\uFE0F \u0628\u0633\u0645\u0639\u2026",
    heard: "\u{1F399}\uFE0F \u0633\u0645\u0639\u062A:",
    vNoAi: "\u0627\u0644\u0631\u0633\u0627\u064A\u0644 \u0627\u0644\u0635\u0648\u062A\u064A\u0629 \u0644\u0633\u0647 \u0645\u0634 \u0645\u062A\u0638\u0628\u0637\u0629 (\u0627\u0644\u0640 AI binding \u0646\u0627\u0642\u0635 \u0641\u064A \u0627\u0644\u0640 Worker) \u2014 \u0627\u0643\u062A\u0628\u0647\u0627 \u0644\u0648 \u0633\u0645\u062D\u062A.",
    vLong: (s) => `\u0627\u0644\u0641\u0648\u064A\u0633 \u0644\u062D\u062F ${s / 60} \u062F\u0642\u064A\u0642\u0629 \u0628\u0633 \u2014 \u0623\u0648 \u0627\u0643\u062A\u0628\u0647\u0627.`,
    vEmpty: "\u{1F399}\uFE0F \u0645\u0627 \u0633\u0645\u0639\u062A\u0634 \u0643\u0644\u0627\u0645 \u0648\u0627\u0636\u062D \u2014 \u062C\u0631\u0651\u0628 \u062A\u0627\u0646\u064A \u0623\u0648 \u0627\u0643\u062A\u0628\u0647\u0627.",
    vFail: "\u{1F399}\uFE0F \u0645\u0627 \u0642\u062F\u0631\u062A\u0634 \u0623\u0642\u0631\u0627 \u0627\u0644\u0641\u0648\u064A\u0633 \u062F\u0647 \u2014 \u062C\u0631\u0651\u0628 \u062A\u0627\u0646\u064A \u0623\u0648 \u0627\u0643\u062A\u0628\u0647\u0627."
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
var menuRows = (t) => [[cb(t.pf, "pf"), cb(t.market, "mk")], [cb(t.plan, "pl"), cb(t.movers, "mv")], [cb(t.signals, "sg"), cb(t.exit, "ex")], [cb(t.alertsB, "al"), cb(t.coin, "coin")], [cb(t.other, "lang:" + t.otherCode)]];
var replyKb = (t) => ({ keyboard: [[{ text: t.kb.pf }, { text: t.kb.mk }, { text: t.kb.pl }], [{ text: t.kb.ex }, { text: t.kb.mv }, { text: t.kb.sg }]], resize_keyboard: true, is_persistent: false, input_field_placeholder: "btc \xB7 sol eth \xB7 /menu" });
var KB_ACT = () => Object.fromEntries(Object.values(T).flatMap((L) => [...Object.entries(L.kb), ...Object.entries(L.kbOld || {})].map(([act, text]) => [text, act])));
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
var memRange = null;
async function getRange(env) {
  let v = memRange;
  try {
    if (env.RATE) v = +await env.RATE.get("tg:mk") || v;
  } catch (_) {
  }
  return RANGES.includes(+v) ? +v : 100;
}
async function setRange(env, v) {
  memRange = v;
  try {
    if (env.RATE) await env.RATE.put("tg:mk", String(v));
  } catch (_) {
  }
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
  L.push("", `\u{1F3AF} <b>${t.tpT}</b>`, `<i>${t.tpKey}</i>`);
  if (!tps.length) L.push(t.noExit);
  const bySym = /* @__PURE__ */ new Map();
  tps.forEach((x) => {
    if (!bySym.has(x.sym)) bySym.set(x.sym, []);
    bySym.get(x.sym).push(x);
  });
  for (const [sym, list2] of [...bySym].slice(0, 8)) {
    L.push("", `<b>${esc(sym)}</b> \xB7 ${price(list2[0].price)}`);
    list2.sort((a, b) => a.n - b.n).forEach((x) => L.push(`${x.to <= 0 ? "\u2705" : "\u2B1C"} TP${x.n} ${price(x.level)} \xB7 ${x.to <= 0 ? t.reached : `+${x.to.toFixed(0)}%`}${x.pct ? ` \xB7 ${x.pct}%` : ""}`));
  }
  if (bySym.size > 8) L.push("", `<i>${t.more(bySym.size - 8)}</i>`);
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
var RANGES = [100, 200, 300, 500];
function viewMarket(t, m, now, range = 100) {
  const L = [`\u{1F30D} <b>${t.mkT}</b> \xB7 ${hm(now)}`, "", ...marketShort(t, m)];
  const seen = /* @__PURE__ */ new Set(), top = [...m.top || [], ...m.top500 || []].filter((r) => r.rank && r.rank <= range && r.ch24 != null && r.sym && !isStable(r.sym) && !seen.has(r.id) && seen.add(r.id));
  const line = (r) => row(r.sym, r.ch24, price(r.price));
  const up = [...top].sort((a, b) => b.ch24 - a.ch24).slice(0, 5), dn = [...top].sort((a, b) => a.ch24 - b.ch24).slice(0, 5);
  if (up.length) L.push("", `\u{1F4C8} <b>${t.topUp(range)}</b>`, ...up.map(line));
  if (dn.length) L.push("", `\u{1F4C9} <b>${t.topDn(range)}</b>`, ...dn.map(line));
  const st = (m.stocks || []).filter((r) => r.ch24 != null && r.price > 0);
  if (st.length) {
    const sUp = [...st].sort((a, b) => b.ch24 - a.ch24).slice(0, 5), sDn = [...st].sort((a, b) => a.ch24 - b.ch24).slice(0, 5);
    L.push("", `\u{1F3E6} <b>${t.stUp}</b>`, ...sUp.map(line), "", `\u{1F3E6} <b>${t.stDn}</b>`, ...sDn.map(line), `<i>${t.stNote}</i>`);
  }
  return { text: L.join("\n"), buttons: [RANGES.map((n) => cb((n === range ? "\u2713 " : "") + "Top " + n, "mk:" + n)), [cb(t.refresh, "mk:" + range), url("\u{1F9ED} Market Hub", APP + "market.html")], [cb(t.back, "menu")]] };
}
function viewCoin(t, coin, m, sum, now) {
  const row2 = [...m.top, ...m.top500].find((r) => r.id === coin.id) || {}, s = m.series[coin.id];
  const symU = (coin.sym || row2.sym || "").toUpperCase(), held = sum && sum.coins.find((c) => c.sym === symU);
  const p = row2.price > 0 ? row2.price : s ? s.last : held && held.price > 0 ? held.price : null;
  const ch7 = row2.ch7 != null ? row2.ch7 : s && p && s.at(now - 7 * 24 * H3) ? (p / s.at(now - 7 * 24 * H3) - 1) * 100 : null;
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
  const lv = m.live[coin.id], src = typeof lv === "string" ? lv : t.src;
  const age = lv ? t.live : m.parts && m.parts.top ? t.snap(Math.max(1, Math.round((now - Date.parse(m.parts.top)) / 6e4))) : "";
  L.push("", `<i>${src}${age ? " \xB7 " + age : ""}</i>`);
  const btns = [[cb(t.refresh, "c:" + coin.id.slice(0, 58)), url(t.liq, LIQ + encodeURIComponent(sym))], [url(t.chart, /^x-/.test(coin.id) ? "https://www.tradingview.com/symbols/" + encodeURIComponent(sym) + "USDT/" : "https://www.coingecko.com/en/coins/" + encodeURIComponent(coin.id))]];
  if (mine) btns[1].push(url(t.inApp, APP + "index.html#holdings/" + encodeURIComponent(sym)));
  btns.push([cb(t.back, "menu")]);
  return { text: L.join("\n"), buttons: btns };
}
async function tg2(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false }));
}
var send = (env, chat, v, extra = {}) => tg2(env, "sendMessage", { chat_id: chat, text: v.text.slice(0, 4e3), parse_mode: "HTML", disable_web_page_preview: true, ...v.buttons ? { reply_markup: { inline_keyboard: v.buttons } } : {}, ...extra });
var edit = (env, chat, msgId, v) => tg2(env, "editMessageText", { chat_id: chat, message_id: msgId, text: v.text.slice(0, 4e3), parse_mode: "HTML", disable_web_page_preview: true, ...v.buttons ? { reply_markup: { inline_keyboard: v.buttons } } : {} });
var WORDS = [
  [/^\/?(start|menu|help|القائمة|مساعدة|ابدأ)$/i, "menu"],
  [/^\/?(portfolio|pf|wallet)$|محفظتي|المحفظة/i, "pf"],
  [/^\/?(market|mk)$|السوق/i, "mk"],
  [/^\/?(plan|pl)$|الخطة/i, "pl"],
  [/^\/?(hide|اخفي|إخفاء|اخفاء)$/i, "hide"],
  [/^\/(new|reset|clear)$|^محادثة جديدة$/i, "new"],
  [/^\/?(alerts|al)$|^التنبيهات$|^تنبيهاتي$/i, "al"],
  [/^\/?(lang|language|لغة|اللغة)$/i, "lang"],
  [/^(عربي|arabic)$/i, "lang:ar"],
  [/^(english|انجليزي|إنجليزي)$/i, "lang:en"],
  [/^\/?(exit|ex)$|خطة الخروج|الخروج/i, "ex"],
  [/^\/?(movers|mv|best)$|الأفضل/i, "mv"],
  [/^\/?(signals|sg)$|الإشارات/i, "sg"],
  [/^\/?(coin|price)$/i, "coin"]
];
function parse(text) {
  const kb = KB_ACT()[String(text || "").trim()];
  if (kb) return { act: kb };
  const s = String(text || "").trim().replace(/@\w+/, "").replace(/^[^\p{L}\p{N}\/$]+/u, "").trim();
  const m = /^\/(price|p|coin)\s+(.+)$/i.exec(s);
  if (m) return { act: "coins", q: m[2].split(/[\s,]+/).filter(Boolean).slice(0, 5) };
  for (const [rx, act] of WORDS) if (rx.test(s)) return { act };
  if (/^\$?[A-Za-z][A-Za-z0-9]{1,11}([\s,]+\$?[A-Za-z][A-Za-z0-9]{1,11}){0,4}$/.test(s)) return { act: "coins", q: s.split(/[\s,]+/).filter(Boolean), guess: String(text || "").trim() };
  return { act: "ai", q: String(text || "").trim() };
}
async function buildView(env, act, arg, guess) {
  const now = Date.now();
  const user = act === "menu" || act === "coin" ? null : await loadUser(env).catch(() => null);
  const cfg = settings(user && user.meta), lang = await getLang(env), t = T[lang];
  if (act === "menu") return { t, views: [viewMenu(t)] };
  if (act === "lang") return { t, views: [{ text: "\u{1F310} English / \u0639\u0631\u0628\u064A", buttons: [[cb("\u{1F1EC}\u{1F1E7} English", "lang:en"), cb("\u{1F1F8}\u{1F1E6} \u0639\u0631\u0628\u064A", "lang:ar")]] }] };
  if (act === "coin") return { t, views: [{ text: `\u{1FA99} ${t.askCoin}`, buttons: [[cb(t.back, "menu")]] }] };
  if (act === "soon") return { t, views: [{ text: t.soon, buttons: menuRows(t) }] };
  const needUser = ["pf", "pl", "mv", "sg", "ex"].includes(act);
  if (needUser && !user) return { t, views: [{ text: t.noUser, buttons: [[cb(t.market, "mk"), cb(t.back, "menu")]] }] };
  const mine = coinsOf(user);
  if (act === "coins") {
    const m0 = await loadMarket([], mine);
    if (guess) {
      const known = (w) => {
        const W2 = String(w).toUpperCase().replace(/^\$/, ""), lw = String(w).toLowerCase();
        return mine.some((c) => c.sym === W2) || !!m0.cgIds[W2] || [...m0.top, ...m0.top500].some((r) => String(r.sym || "").toUpperCase() === W2 || String(r.name || "").toLowerCase() === lw || r.id === lw);
      };
      if (!arg.every(known)) return { t, ai: guess };
    }
    const found = [], miss = [];
    for (const q of arg) {
      const c = await findCoin(q, m0, user);
      if (c) found.push(c);
      else miss.push(q);
    }
    const m2 = await loadMarket(found.map((c) => c.id).filter(Boolean), [...mine, ...found.map((c) => ({ sym: c.sym, id: c.id }))]);
    const sum2 = user ? summarize(withIds(user, m2), m2, now) : null;
    const views = [];
    for (const c of found) {
      const id = c.id || m2.idOf[c.sym];
      if (id) views.push(viewCoin(t, { ...c, id }, m2, sum2, now));
      else miss.push(c.sym);
    }
    miss.forEach((q) => views.push({ text: t.notFound(esc(q)), buttons: [[cb(t.back, "menu")]] }));
    return { t, views };
  }
  const m = await loadMarket([], mine);
  if (act === "mk") return { t, views: [viewMarket(t, m, now, await getRange(env))] };
  const sum = summarize(withIds(user, m), m, now);
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
  resetBudget();
  const u = await request.json().catch(() => null);
  if (!u) return ok();
  const msg = u.message || u.edited_message, q = u.callback_query;
  const chat = msg ? msg.chat && msg.chat.id : q && q.message && q.message.chat && q.message.chat.id;
  if (chat == null || String(chat) !== String(env.TELEGRAM_CHAT_ID)) return ok();
  if (!await firstTime(env, u.update_id)) return ok();
  try {
    if (q) {
      const d = String(q.data || "");
      const done = (text) => tg2(env, "answerCallbackQuery", { callback_query_id: q.id, ...text ? { text } : {} }).catch(() => {
      });
      if (/^lang:(ar|en)$/.test(d)) {
        await switchLang(env, chat, d.slice(5), q.message.message_id);
        await done();
        return ok();
      }
      if (/^tx:(ok|no):\w+$/.test(d)) {
        const lang = await getLang(env), t2 = T[lang], gid = d.slice(6);
        const kb = ((q.message.reply_markup || {}).inline_keyboard || []).map((r4) => r4.filter((b) => !/^tx:/.test(b.callback_data || ""))).filter((r4) => r4.length);
        await tg2(env, "editMessageReplyMarkup", { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: kb } }).catch(() => {
        });
        if (d.startsWith("tx:no:")) {
          const was = await cancelTrades(env, gid);
          const tl = T[was || lang];
          await send(env, chat, { text: was ? tl.txCancelled : tl.txGone });
          await done(was ? "\u274C" : null);
          return ok();
        }
        const r0 = await confirmTrades(env, gid), r3 = r0, t22 = T[r0.lang || lang];
        if (r3.ok) {
          const L = [t22.txSaved(r3.trades.length)];
          for (const h of r3.holdings) L.push(`\u2022 ${esc(h.sym)} ${t22.nowHold}: <b>${(+Number(h.qty).toPrecision(8)).toLocaleString("en-US", { maximumFractionDigits: 8 })}</b>${h.avg ? ` \xB7 ${t22.avg} ${money(h.avg)}` : ""}`);
          await send(env, chat, { text: L.join("\n"), buttons: [[cb(t22.pf, "pf"), cb(t22.back, "menu")]] });
          await done("\u2705");
        } else {
          await send(env, chat, { text: r3.error === "gone" ? t22.txGone : r3.error === "expired" ? t22.txExpired : r3.error === "changed" ? t22.txChanged(esc(r3.why)) : r3.error === "nouser" ? t22.txNoUser : t22.txSaveErr(esc(String(r3.why || "").slice(0, 80))) });
          await done("\u26A0\uFE0F");
        }
        return ok();
      }
      if (d === "new") {
        await forget(env);
        await done(T[await getLang(env)].newDone);
        return ok();
      }
      if (d === "al" || d.startsWith("ad:")) {
        const lang = await getLang(env);
        if (d.startsWith("ad:")) await deleteAlert(env, d.slice(3));
        await edit(env, chat, q.message.message_id, await viewAlerts(env, lang));
        await done(d.startsWith("ad:") ? T[lang].alertGone : null);
        return ok();
      }
      if (/^mk:\d+$/.test(d) && RANGES.includes(+d.slice(3))) await setRange(env, +d.slice(3));
      const { t, views } = d.startsWith("c:") ? await run(env, "coinById", d.slice(2)) : await run(env, /^mk:/.test(d) ? "mk" : d);
      const r = await edit(env, chat, q.message.message_id, views[0]);
      if (!r.ok && !/not modified/i.test(r.description || "")) await send(env, chat, views[0]);
      await done(`\u2705 ${t.updated} ${local(Date.now(), { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })}`);
      return ok();
    }
    if (msg && (msg.voice || msg.audio)) {
      await onVoice(env, chat, msg.voice || msg.audio);
      return ok();
    }
    if (!msg || typeof msg.text !== "string") return ok();
    await onText(env, chat, msg.text);
  } catch (e) {
    await send(env, chat, { text: T[await getLang(env).catch(() => "en")].err }).catch(() => {
    });
  }
  return ok();
}
async function onVoice(env, chat, voice) {
  const t = T[await getLang(env)];
  const ph = await send(env, chat, { text: t.listening });
  const id = ph && ph.result && ph.result.message_id;
  const show = (v) => id ? edit(env, chat, id, v).then((r3) => r3.ok ? r3 : send(env, chat, v)) : send(env, chat, v);
  const r = await transcribe(env, voice);
  if (r.error) return show({ text: r.error === "noai" ? t.vNoAi : r.error === "long" ? t.vLong(MAX_SEC) : r.error === "empty" ? t.vEmpty : t.vFail });
  const head = `${t.heard} <i>${esc(r.text)}</i>`;
  if (!id) await send(env, chat, { text: head });
  return onText(env, chat, r.text, 32, id ? { id, head } : null);
}
async function onText(env, chat, text, budget = 36, into = null) {
  const p = parse(text);
  tg2(env, "sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {
  });
  if (into && p.act !== "ai") {
    if (!["menu", "coin", "coins", "pf", "mk", "pl", "mv", "sg", "ex"].includes(p.act)) await edit(env, chat, into.id, { text: into.head });
    else {
      const { views: views2, ai: ai2 } = await run(env, p.act, p.q, p.guess);
      if (ai2) {
        await answer(env, chat, ai2, budget, into);
        return;
      }
      const [v0, ...rest] = views2, both = v0 && { ...v0, text: into.head + "\n\n" + v0.text };
      const r = both && both.text.length <= 4e3 ? await edit(env, chat, into.id, both) : null;
      if (!r || !r.ok) {
        await edit(env, chat, into.id, { text: into.head });
        if (v0) await send(env, chat, v0);
      }
      for (const v of rest) await send(env, chat, v);
      return;
    }
    into = null;
  }
  if (/^lang:(ar|en)$/.test(p.act)) {
    await switchLang(env, chat, p.act.slice(5));
    return;
  }
  if (p.act === "al") {
    await send(env, chat, await viewAlerts(env, await getLang(env)));
    return;
  }
  if (p.act === "new") {
    await forget(env);
    await send(env, chat, { text: T[await getLang(env)].newDone });
    return;
  }
  if (p.act === "ai") {
    await answer(env, chat, p.q, budget, into);
    return;
  }
  if (p.act === "hide") {
    const t2 = T[await getLang(env)];
    await send(env, chat, { text: t2.hidden }, { reply_markup: { remove_keyboard: true } });
    return;
  }
  const { t, views, ai } = await run(env, p.act, p.q, p.guess);
  if (ai) {
    await answer(env, chat, ai, budget);
    return;
  }
  if (/^\/start/.test(text)) {
    await send(env, chat, { text: t.welcome }, { reply_markup: replyKb(t) });
    await tg2(env, "setMyCommands", { commands: cmds(await getLang(env)) }).catch(() => {
    });
  }
  for (const v of views) await send(env, chat, v);
}
async function answer(env, chat, question, budget = 36, into = null) {
  const lang = await getLang(env), t = T[lang];
  resetBudget(budget);
  const top = into ? into.head + "\n\n" : "";
  let id;
  if (into) {
    id = into.id;
    await edit(env, chat, id, { text: into.head + "\n" + t.thinking });
  } else {
    const ph = await send(env, chat, { text: t.thinking });
    id = ph && ph.result && ph.result.message_id;
  }
  const show0 = (v) => id ? edit(env, chat, id, v).then((r3) => r3.ok ? r3 : send(env, chat, v)) : send(env, chat, v);
  const show = (v) => show0({ ...v, text: top + v.text });
  const r = await ask(env, question, lang).catch((e) => {
    console.log(JSON.stringify({ ai: "crash", message: String(e && e.message).slice(0, 300) }));
    return { error: "claude" };
  });
  if (r.error) return show({ text: r.error === "limit" ? t.aiLimit(r.limit) : r.error === "nokey" ? t.aiNoKey : r.error === "busy" ? t.aiBusy : t.aiErr, buttons: [[cb(t.back, "menu")]] });
  const foot = `<i>\u{1F4E1} ${t.data}: ${esc(r.sources.length ? r.sources.join(" \xB7 ") : "general knowledge")}
${t.aiLeft(r.left, r.limit)}</i>`;
  const btns = [];
  if (r.coins.length) btns.push(r.coins.map(([cid, sym]) => cb("\u{1FA99} " + sym, "c:" + cid.slice(0, 58))));
  if (r.coins.length === 1) btns[0].push(url("\u{1F525} Liq Map", LIQ + encodeURIComponent(r.coins[0][1])));
  btns.push([cb(t.newChat, "new"), cb(t.back, "menu")]);
  let tx = "";
  if (r.trades && r.trades.length) {
    const ql = /[\u0600-\u06FF]/.test(question) ? "ar" : "en", tq = T[ql];
    const gid = await keepTrades(env, r.trades, ql);
    tx = tradeLines(r.trades, ql === "ar") + "\n\n";
    btns.unshift([cb(r.trades.length > 1 ? tq.txOkAll(r.trades.length) : tq.txOk, "tx:ok:" + gid), cb(tq.txNo, "tx:no:" + gid)]);
  }
  let text = r.text + "\n\n" + tx + foot;
  if (top.length + text.length > 4e3) text = r.text.slice(0, Math.max(200, 3900 - foot.length - tx.length - top.length)) + "\u2026\n\n" + tx + foot;
  return show({ text, buttons: btns });
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
  const lang = await getLang(env), t = T[lang];
  const xs = /^x-/.test(id) ? id.slice(2).toUpperCase() : null;
  const mine = coinsOf(user);
  const m = await loadMarket(xs ? [] : [id], xs ? [...mine, { sym: xs }] : mine);
  const row2 = [...m.top, ...m.top500].find((r) => r.id === id) || {};
  const ownSym = Object.keys(m.idOf).find((S) => m.idOf[S] === id);
  const own = user && ownSym && (user.coins || []).find((c) => c && !c.removed && String(c.sym).toUpperCase() === ownSym);
  const coin = { id: xs ? m.idOf[xs] || id : id, sym: xs || ownSym || row2.sym || "", name: row2.name || own && own.name || "" };
  return { t, views: [viewCoin(t, coin, m, user ? summarize(withIds(user, m), m, now) : null, now)] };
}
var run = (env, act, arg, guess) => act === "coinById" ? buildById(env, arg) : buildView(env, act, arg, guess);
var cmds = (lang) => [
  ["portfolio", lang === "ar" ? "\u0645\u062D\u0641\u0638\u062A\u064A" : "My portfolio"],
  ["price", lang === "ar" ? "\u0633\u0639\u0631 \u0639\u0645\u0644\u0629 \u2014 /price btc" : "A coin \u2014 /price btc"],
  ["market", lang === "ar" ? "\u0627\u0644\u0633\u0648\u0642" : "Market"],
  ["plan", lang === "ar" ? "\u062E\u0637\u0629 \u0627\u0644\u062A\u062C\u0645\u064A\u0639" : "Accumulation plan"],
  ["movers", lang === "ar" ? "\u0627\u0644\u0623\u0641\u0636\u0644 \u0648\u0627\u0644\u0623\u0633\u0648\u0623" : "Best & worst"],
  ["signals", lang === "ar" ? "\u0627\u0644\u0625\u0634\u0627\u0631\u0627\u062A" : "Signals"],
  ["exit", lang === "ar" ? "\u062E\u0637\u0629 \u0627\u0644\u062E\u0631\u0648\u062C" : "Exit plan"],
  ["menu", lang === "ar" ? "\u0627\u0644\u0642\u0627\u0626\u0645\u0629" : "Menu"],
  ["lang", "English / \u0639\u0631\u0628\u064A"],
  ["alerts", lang === "ar" ? "\u062A\u0646\u0628\u064A\u0647\u0627\u062A\u0643" : "Your alerts"],
  ["hide", lang === "ar" ? "\u0625\u062E\u0641\u0627\u0621 \u0627\u0644\u0623\u0632\u0631\u0627\u0631" : "Hide the buttons"],
  ["new", lang === "ar" ? "\u0645\u062D\u0627\u062F\u062B\u0629 \u062C\u062F\u064A\u062F\u0629 \u0645\u0639 \u0627\u0644\u0640 AI" : "New AI chat"]
].map(([command, description]) => ({ command, description }));
async function setup(request, env) {
  const u = new URL(request.url), json = (s, o) => new Response(JSON.stringify(o, null, 2), { status: s, headers: { "content-type": "application/json" } });
  if (!env.TG_SECRET || u.searchParams.get("key") !== env.TG_SECRET) return json(403, { ok: false, error: "Wrong or missing key." });
  const missing = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "TG_SECRET"].filter((k) => !env[k]);
  if (missing.length) return json(400, { ok: false, missing });
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(env.TG_SECRET)) return json(400, { ok: false, error: "TG_SECRET must be 16+ letters, digits, _ or - (Telegram rule)." });
  const hook = u.origin + u.pathname.replace(/\/setup$/, "");
  const a = await tg2(env, "setWebhook", { url: hook, secret_token: env.TG_SECRET, allowed_updates: ["message", "edited_message", "callback_query"], drop_pending_updates: true });
  resetBudget();
  const user = await loadUser(env).catch(() => null), lang = await getLang(env), t = T[lang];
  const b = await tg2(env, "setMyCommands", { commands: cmds(lang) });
  const c = await send(env, env.TELEGRAM_CHAT_ID, { text: t.welcome }, { reply_markup: replyKb(t) });
  await send(env, env.TELEGRAM_CHAT_ID, viewMenu(t));
  return json(a.ok && b.ok && c.ok ? 200 : 502, { ok: !!(a.ok && b.ok && c.ok), webhook: a.ok ? "set" : a.description, menu: b.ok ? "set" : b.description, welcome: c.ok ? "sent" : c.description, portfolio: serviceAccount(env) ? user ? "connected" : "not found" : "FIREBASE_SERVICE_ACCOUNT missing" });
}
async function check(request, env) {
  const u = new URL(request.url), json = (s, o) => new Response(JSON.stringify(o, null, 2), { status: s, headers: { "content-type": "application/json" } });
  if (!env.TG_SECRET || u.searchParams.get("key") !== env.TG_SECRET) return json(403, { ok: false, error: "Wrong or missing key." });
  const sym = String(u.searchParams.get("coin") || "BTC").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  clearCache();
  resetBudget();
  startTrace();
  if (u.searchParams.get("what") === "price") {
    const t02 = Date.now(), m0 = await loadMarket([], []), c = await findCoin(sym, m0, null);
    const old = u.searchParams.get("stale") === "1" ? setStale(0) : null;
    const m = c ? await loadMarket(c.id ? [c.id] : [], [{ sym: c.sym, id: c.id }]).finally(() => {
      if (old != null) setStale(old);
    }) : null, id = c && (c.id || m.idOf[c.sym]);
    const row2 = m && [...m.top, ...m.top500].find((r) => r.id === id);
    return json(200, { coin: sym, found: c, ms: Date.now() - t02, snapshot: m0.parts, snapshot_age_min: Math.round((Date.now() - Date.parse(m0.parts && m0.parts.top)) / 6e4), price: row2 ? row2.price : null, ch24: row2 ? row2.ch24 : null, source: m && id ? m.live[id] || "snapshot" : null, exchange: await exchangePrice(sym).catch((e) => String(e && e.message)), calls: stopTrace() });
  }
  const t0 = Date.now(), d = await derivatives(sym).catch((e) => ({ error: String(e && e.message) }));
  return json(200, { coin: sym, ms: Date.now() - t0, colo: request.cf && request.cf.colo || null, country: request.cf && request.cf.country || null, result: d, calls: stopTrace() });
}

// tools/worker/index.mjs
var worker_default = {
  async fetch(request, env, ctx) {
    const p = new URL(request.url).pathname.replace(/\/+$/, "");
    if (p.endsWith("/tg/setup")) return setup(request, env);
    if (p.endsWith("/tg/check")) return check(request, env);
    if (p.endsWith("/tg")) return handleTelegram(request, env, ctx);
    return ai_worker_default.fetch(request, env, ctx);
  },
  // every 5 minutes (tools/worker/wrangler.toml → crons): the alerts you set in words
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runWatch(env).then((r) => {
      if (r.fired) console.log(JSON.stringify({ watch: r }));
    }).catch((e) => console.log(JSON.stringify({ watch: "error", message: String(e && e.message).slice(0, 200) }))));
  }
};
export {
  worker_default as default
};
