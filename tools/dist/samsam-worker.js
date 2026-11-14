// samsam-worker.js — BUILT FILE (node tools/build-worker.mjs). Paste all of it into the Cloudflare Worker: AI Analysis (/analyze) + the Telegram bot (/tg).
// Sources: tools/ai-worker.js, tools/worker/*.mjs, tools/alerts-core.mjs, samsam-core.js. No keys or secrets in here — they live in the Worker settings.
// sources-hash: 1a813a3bf439814a

// tools/ai-worker.js
var JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
var MAX_BODY = 200 * 1024;
var jwksCache = { keys: null, until: 0 };
var memCount = /* @__PURE__ */ new Map();
var memberCheck = null;
function setMemberCheck(fn) {
  memberCheck = fn;
}
var joinHandler = null;
function setJoinHandler(fn) {
  joinHandler = fn;
}
var adminHandler = null;
function setAdminHandler(fn) {
  adminHandler = fn;
}
var keyHandler = null;
function setKeyHandler(fn) {
  keyHandler = fn;
}
var ai_worker_default = {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed2 = list(env.ALLOWED_ORIGINS || "https://drsamirsaad1981-design.github.io");
    const okOrigin = allowed2.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) && env.ALLOW_LOCAL === "1";
    const cors = {
      "Access-Control-Allow-Origin": okOrigin ? origin : allowed2[0] || "",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };
    const reply = (status2, obj) => new Response(JSON.stringify(obj), { status: status2, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    if (request.method === "OPTIONS") return new Response(null, { status: okOrigin ? 204 : 403, headers: cors });
    if (!okOrigin) return reply(403, { error: "This service only answers the Cute Portfolio app." });
    const path = new URL(request.url).pathname, isKey = /\/key\/?$/.test(path), isAdmin = /\/admin\/?$/.test(path), isJoin = /\/join\/?$/.test(path);
    if (request.method !== "POST" || !(path.endsWith("/analyze") || isKey || isAdmin || isJoin)) return reply(404, { error: "Not found." });
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
    const emails = list(env.ALLOWED_EMAILS || ""), em = String(user.email || "").toLowerCase();
    if (isJoin) {
      if (!joinHandler) return reply(404, { error: "Not found." });
      const r = await joinHandler(env, { email: em, uid: user.uid }, body).catch(() => ({ status: 500, error: "Something went wrong \u2014 try again." }));
      return reply(r.status || 200, r);
    }
    if (isAdmin) {
      if (!adminHandler) return reply(404, { error: "Not found." });
      const r = await adminHandler(env, { email: em, uid: user.uid, owners: emails }, body).catch((e) => ({ status: 500, error: "Something went wrong \u2014 " + String(e && e.message || e).slice(0, 120) }));
      return reply(r.status || 200, r);
    }
    if (isKey) {
      if (!keyHandler) return reply(404, { error: "Not found." });
      const r = await keyHandler(env, em, body).catch(() => ({ status: 500, error: "Something went wrong \u2014 try again." }));
      return reply(r.status || 200, r);
    }
    let apiKey = env.ANTHROPIC_API_KEY;
    let limit = Math.max(1, parseInt(env.DAILY_LIMIT || "5", 10) || 5), model = env.MODEL || "claude-opus-4-5";
    if (emails.length && !emails.includes(em)) {
      const m = memberCheck ? await memberCheck(env, em).catch(() => null) : null;
      if (!m) return reply(403, { error: "This account is not allowed to use the AI analysis." });
      limit = m.limit;
      model = m.model;
      if (m.apiKey) apiKey = m.apiKey;
      if (!(limit > 0)) return reply(429, { error: "The quick report needs your own Claude key (Settings \u2192 My Claude key). The free way \u2014 with the Claude app \u2014 works for everyone.", remaining: 0 });
    }
    const day3 = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const key = `ai:${user.uid}:${day3}`;
    const used2 = await getCount(env, key);
    if (used2 >= limit) return reply(429, { error: `You have used today's ${limit} AI reports. New reports are available tomorrow (00:00 UTC).`, remaining: 0 });
    if (!apiKey) return reply(500, { error: "The Worker has no ANTHROPIC_API_KEY secret." });
    const lang2 = body.language === "ar" ? "ar" : "en";
    const data = body.portfolioData && typeof body.portfolioData === "object" ? body.portfolioData : null;
    if (!data) return reply(400, { error: "No portfolio data in the request." });
    const extra = typeof body.accumContext === "string" ? body.accumContext.slice(0, 2e4) : "";
    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 4e3, system: systemPrompt(lang2), messages: [{ role: "user", content: userPrompt(data, extra, lang2) }] })
      });
    } catch (_) {
      return reply(502, { error: "Could not reach Claude. Please try again." });
    }
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return reply(502, { error: out.error && out.error.message || `Claude returned ${res.status}.` });
    const report2 = (out.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (!report2) return reply(502, { error: "Claude returned an empty report." });
    await setCount(env, key, used2 + 1);
    return reply(200, { report: report2, model: out.model || model, remaining: limit - used2 - 1 });
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
function systemPrompt(lang2) {
  const L = lang2 === "ar" ? "Write the whole report in Arabic (Modern Standard Arabic, clear and direct). Keep coin tickers, numbers and $ amounts in Latin characters." : "Write the whole report in clear, direct English.";
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
function userPrompt(data, extra, lang2) {
  return "PORTFOLIO DATA (JSON, USD):\n" + JSON.stringify(data).slice(0, 6e4) + (extra ? "\n" + extra : "") + "\n\nWrite the report now" + (lang2 === "ar" ? " (in Arabic)" : "") + ".";
}

// tools/worker/who.mjs
import { AsyncLocalStorage } from "node:async_hooks";

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
function derivePortfolio(coins, txs, prices2 = {}, fallbackPrices = {}) {
  const bySym = groupTxBySym(txs);
  return (coins || []).filter((c) => c && c.sym && !c.removed).sort((a, b) => num(a.order, 1e9) - num(b.order, 1e9) || String(a.sym).localeCompare(String(b.sym))).map((c) => {
    const r = replay(c.opening, bySym.get(c.sym) || []);
    const pr = prices2[c.sym];
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
function vsBtcByCoin(coins, txs, { prices: prices2 = {}, btcNow = 0, btcAt = null, baselineBtc = 0 } = {}) {
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
    const cost = pos.qty * pos.avg, price3 = num(prices2[c.sym]), value = pos.qty * price3;
    if (!(cost > 0) || !(price3 > 0) || !(btcNow > 0)) {
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
  const tg7 = (k) => targets && targets[k] ? num(targets[k].pct) / 100 : 0;
  const groups = keys.map((k) => {
    const v = Math.max(0, num(values[k])), now = total > 0 ? v / total * 100 : 0, target = tg7(k) * 100;
    return {
      key: k,
      value: v,
      now,
      target,
      drift: now - target,
      full: tg7(k) * total - v,
      need: Math.max(0, tg7(k) * T2 - v),
      add: 0,
      state: Math.abs(now - target) <= band ? "ok" : Math.abs(now - target) <= 2 * band ? "warn" : "off"
    };
  });
  const money3 = Math.max(0, num(cash)), need = groups.reduce((s, g) => s + g.need, 0);
  if (money3 > 0) {
    if (need >= money3) groups.forEach((g) => {
      g.add = need > 0 ? g.need / need * money3 : 0;
    });
    else {
      const rest = money3 - need;
      groups.forEach((g) => {
        g.add = g.need + tg7(g.key) * rest;
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
  const usd3 = num(s.usd), every = ["week", "2weeks", "month"].includes(s.every) ? s.every : null, day3 = Math.round(num(s.day, -1));
  if (!(usd3 > 0 && usd3 <= 1e9) || !every) return null;
  if (every === "month" ? !(day3 >= 1 && day3 <= 28) : !(day3 >= 0 && day3 <= 6)) return null;
  const since = typeof s.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.since) ? s.since : isoD(Date.now());
  return { usd: Math.round(usd3 * 100) / 100, every, day: day3, since };
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
  const prices2 = {}, info = {};
  for (const c of user.coins || []) {
    if (!c || !c.sym || c.removed) continue;
    const id = idOf(c), r = id && byId.get(id), s = id && market.series && market.series[id];
    const price3 = r && r.price > 0 ? r.price : s ? s.last : c.lastPrice > 0 ? c.lastPrice : null;
    const p24 = s && s.at(now - DAY), p7 = s && s.at(now - 7 * DAY);
    const ch24 = r && r.ch24 != null ? r.ch24 : price3 && p24 ? (price3 / p24 - 1) * 100 : null;
    const ch7 = r && r.ch7 != null ? r.ch7 : price3 && p7 ? (price3 / p7 - 1) * 100 : null;
    if (price3) prices2[c.sym] = { usd: price3, ch24 };
    info[c.sym] = { id, ch24, ch7, p24: ch24 != null && price3 ? price3 / (1 + ch24 / 100) : null, p7: ch7 != null && price3 ? price3 / (1 + ch7 / 100) : null };
  }
  const pf = derivePortfolio(user.coins, user.txs, prices2).filter((c) => c.qty > 1e-12);
  const rz = realizedPnl(user.coins, user.txs);
  const value = pf.reduce((s, c) => s + c.qty * c.currentPrice, 0), cost = pf.reduce((s, c) => s + c.qty * c.basePrice, 0);
  const since = now - DAY, txT = (t) => Date.parse(t.date) || 0, coinDoc = Object.fromEntries((user.coins || []).filter((c) => c && c.sym).map((c) => [c.sym, c]));
  const dayPnl = pf.reduce((s, c) => {
    const p = c.currentPrice, p24 = info[c.sym].p24 || p, doc = coinDoc[c.sym] || {}, o = doc.opening || {};
    const oT = Date.parse(o.date || doc.addedAt || "") || 0;
    const buys = (user.txs || []).filter((t) => t && t.sym === c.sym && t.type === "buy" && txT(t) > since).map((t) => [+t.qty || 0, +t.price || 0]);
    if (oT > since && +o.qty > 0) buys.push([+o.qty, +o.avg || p]);
    const sells = (user.txs || []).filter((t) => t && t.sym === c.sym && t.type === "sell" && txT(t) > since).map((t) => [+t.qty || 0, +t.price || 0]);
    const B = buys.reduce((a, [q]) => a + q, 0);
    return s + Math.max(0, c.qty - B) * (p - p24) + buys.reduce((a, [q, bp2]) => a + q * (p - bp2), 0) + sells.reduce((a, [q, sp]) => a + q * (sp - p24), 0);
  }, 0);
  const value24 = value - dayPnl;
  const value7 = pf.reduce((s, c) => s + c.qty * (info[c.sym].p7 || c.currentPrice), 0);
  const total = value - cost + rz.total, invested = cost + rz.soldCost;
  const btcRow = byId.get("bitcoin"), btcSer = market.series && market.series.bitcoin;
  const btcNow = btcRow && btcRow.price || btcSer && btcSer.last || 0;
  const baselineBtc = meta.baseline && meta.baseline.btcPrice || 81162;
  const vs = vsBtcByCoin(user.coins, user.txs, { prices: Object.fromEntries(Object.entries(prices2).map(([k, v]) => [k, v.usd])), btcNow, btcAt: btcSer ? (t) => btcSer.at(t) : null, baselineBtc });
  let cp = 0, bp = 0, cb4 = 0, beat = 0, alts = 0;
  for (const c of pf) {
    const v = vs[c.sym];
    if (!v) continue;
    const k = c.qty * c.basePrice;
    cp += v.coinPct * k / 100;
    bp += v.btcPct * k / 100;
    cb4 += k;
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
    let price3 = prices2[sym] && prices2[sym].usd;
    if (!(price3 > 0)) {
      const id = a.cgId || (market.cgIds || {})[sym], r = id && byId.get(id), s = id && market.series && market.series[id];
      price3 = r && r.price > 0 ? r.price : s ? s.last : null;
    }
    const p = plan.find((x) => x.sym === sym), dc = dca.find((x) => x.sym === sym);
    return { sym, at: +a.alertPrice, price: price3, left: p ? Math.max(0, p.target - p.actual) : null, dcaToday: !!(dc && dc.s.state === "today") };
  }).filter((x) => x.price > 0);
  let alloc = null;
  const tg7 = meta.targets && typeof meta.targets === "object" ? meta.targets : null;
  const tlist = tg7 && Array.isArray(tg7.list) ? tg7.list : [];
  if (tlist.length) {
    const cats = Object.fromEntries(tlist.filter((x) => x && x.g && x.pct > 0).map((x) => [x.g, { pct: +x.pct }]));
    const names = Object.fromEntries([...Array.isArray(tg7.names) ? tg7.names : [], ...tlist].filter((x) => x && x.g).map((x) => [x.g, x.label || x.g]));
    const vals = {};
    for (const c of pf) {
      const g2 = groupOf(c);
      vals[g2] = (vals[g2] || 0) + c.qty * c.currentPrice;
    }
    const plan2 = allocationPlan(vals, cats, { band: +tg7.band || 5 });
    const shown = plan2.groups.filter((g2) => g2.target > 0 || g2.now >= 0.05);
    alloc = { band: plan2.band, groups: shown, onTarget: shown.filter((g2) => g2.state === "ok").length, count: shown.length, names, key: JSON.stringify([tlist, tg7.band]) };
  }
  const free7 = {};
  for (const r of freeCoins(user.txs, new Date(now - 7 * DAY).toISOString())) {
    const f = free7[r.sym] || (free7[r.sym] = { sym: r.sym, qty: 0, usd: 0 });
    f.qty += r.qty;
    f.usd += r.qty * (prices2[r.sym] && prices2[r.sym].usd || 0);
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
    vsBtc: cb4 > 0 ? (cp - bp) / cb4 * 100 : null,
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

// tools/worker/who.mjs
var als = new AsyncLocalStorage();
var asChat = (chat, fn) => als.run({ chat: String(chat) }, fn);
var chatOf = (env) => {
  const s = als.getStore();
  return s ? s.chat : String(env.TELEGRAM_CHAT_ID);
};
var isOwner = (env) => chatOf(env) === String(env.TELEGRAM_CHAT_ID);
var K = (env, name) => `tg:${chatOf(env)}:${name}`;
var memKV = /* @__PURE__ */ new Map();
var kget = async (env, k) => {
  if (env.RATE) {
    try {
      return await env.RATE.get(k);
    } catch (_) {
    }
  }
  return memKV.has(k) ? memKV.get(k) : null;
};
var kput = async (env, k, v, ttl) => {
  memKV.set(k, v);
  try {
    if (env.RATE) await env.RATE.put(k, v, ttl ? { expirationTtl: ttl } : void 0);
  } catch (_) {
  }
};
var kdel = async (env, k) => {
  memKV.delete(k);
  try {
    if (env.RATE) await env.RATE.delete(k);
  } catch (_) {
  }
};
var MAX_MEMBERS = 20;
var MAX_CHOICES = [20, 50, 100];
async function maxMembers(env) {
  const v = +await kget(env, "tg:max");
  return MAX_CHOICES.includes(v) ? v : MAX_MEMBERS;
}
async function setMaxMembers(env, n) {
  if (!MAX_CHOICES.includes(+n)) return false;
  await kput(env, "tg:max", String(+n));
  return true;
}
var isTgChat = (c) => /^-?\d+$/.test(String(c));
async function members(env) {
  try {
    const m = JSON.parse(await kget(env, "tg:users") || "{}");
    return m && typeof m === "object" ? m : {};
  } catch (_) {
    return {};
  }
}
async function chats(env) {
  return env.TELEGRAM_CHAT_ID ? [String(env.TELEGRAM_CHAT_ID), ...Object.keys(await members(env)).filter((c) => c !== String(env.TELEGRAM_CHAT_ID) && isTgChat(c))] : [];
}
async function allowed(env, chat) {
  return (await chats(env)).includes(String(chat));
}
var ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
async function newInvite(env, note = "") {
  const b = crypto.getRandomValues(new Uint8Array(8)), code = [...b].map((x) => ABC[x % ABC.length]).join("");
  await kput(env, "tg:inv:" + code, JSON.stringify({ created: Date.now(), note: String(note).slice(0, 40) }), 7 * 86400);
  return code;
}
async function useInvite(env, code, chat, from) {
  const C = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (C.length !== 8) return { error: "bad" };
  const raw = await kget(env, "tg:inv:" + C);
  if (!raw) return { error: "bad" };
  const m = await members(env);
  if (Object.keys(m).length >= await maxMembers(env)) return { error: "full" };
  await kdel(env, "tg:inv:" + C);
  const name = [from && from.first_name, from && from.last_name].filter(Boolean).join(" ").slice(0, 40) || "Friend";
  m[String(chat)] = { name, user: from && from.username ? String(from.username).slice(0, 32) : "", joined: Date.now(), note: (() => {
    try {
      return JSON.parse(raw).note || "";
    } catch (_) {
      return "";
    }
  })() };
  await kput(env, "tg:users", JSON.stringify(m));
  return { ok: true, member: m[String(chat)] };
}
async function useAppInvite(env, code, uid, email) {
  const C = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, ""), e = String(email || "").toLowerCase();
  if (!uid || !e) return { error: "bad" };
  const m = await members(env), had = Object.entries(m).find(([, x]) => x.email === e || x.uid === uid);
  if (had) return { ok: true, already: true, member: had[1] };
  if (C.length !== 8) return { error: "bad" };
  const raw = await kget(env, "tg:inv:" + C);
  if (!raw) return { error: "bad" };
  if (Object.keys(m).length >= await maxMembers(env)) return { error: "full" };
  await kdel(env, "tg:inv:" + C);
  m["a:" + uid] = { name: e.split("@")[0].slice(0, 40), user: "", joined: Date.now(), email: e, uid, appOnly: true, note: (() => {
    try {
      return JSON.parse(raw).note || "";
    } catch (_) {
      return "";
    }
  })() };
  await kput(env, "tg:users", JSON.stringify(m));
  return { ok: true, member: m["a:" + uid] };
}
async function moveAppMember(env, uid, chat, from) {
  const m = await members(env), key = "a:" + uid, x = m[key];
  if (!x || m[String(chat)]) return null;
  const name = [from && from.first_name, from && from.last_name].filter(Boolean).join(" ").slice(0, 40) || x.name;
  m[String(chat)] = { ...x, name, user: from && from.username ? String(from.username).slice(0, 32) : "", appOnly: void 0 };
  delete m[String(chat)].appOnly;
  delete m[key];
  await kput(env, "tg:users", JSON.stringify(m));
  const k = await kget(env, `tg:${key}:byok`);
  if (k) {
    await kput(env, `tg:${chat}:byok`, k);
    await kdel(env, `tg:${key}:byok`);
  }
  return m[String(chat)];
}
async function removeMember(env, chat) {
  const m = await members(env);
  if (!m[String(chat)]) return false;
  const had = m[String(chat)];
  delete m[String(chat)];
  await kput(env, "tg:users", JSON.stringify(m));
  await kdel(env, `tg:${chat}:byok`);
  return had;
}
async function activeChats(env) {
  const m = await members(env);
  return (await chats(env)).filter((c) => !(m[c] && m[c].paused));
}
var FLOOD_PER_MIN = 20;
async function flood(env, chat) {
  if (String(chat) === String(env.TELEGRAM_CHAT_ID)) return "ok";
  const k = `tg:rl:${chat}:${Math.floor(Date.now() / 6e4)}`, n = (+await kget(env, k) || 0) + 1;
  await kput(env, k, String(n), 120);
  return n <= FLOOD_PER_MIN ? "ok" : n === FLOOD_PER_MIN + 1 ? "warn" : "drop";
}
async function forgetChat(env, chat) {
  const pre = `tg:${chat}:`;
  let names = [];
  if (env.RATE && env.RATE.list) {
    let cursor;
    do {
      const r = await env.RATE.list({ prefix: pre, cursor });
      names.push(...r.keys.map((x) => x.name));
      cursor = r.list_complete ? null : r.cursor;
    } while (cursor);
  }
  for (const k of memKV.keys()) if (k.startsWith(pre)) names.push(k);
  names = [...new Set(names)].filter((n) => !/:ai:\d{4}-\d\d-\d\d$/.test(n));
  for (const n of names) await kdel(env, n);
  await kdel(env, "tg:appreq:" + chat);
  return names.length;
}
async function strangerOnce(env, chat) {
  const k = "tg:nope:" + chat;
  if (await kget(env, k)) return false;
  await kput(env, k, "1", 86400);
  return true;
}
var LEGACY = ["alerts", "hist", "lang", "mk", "daily", "daily:sent", "pin", "radar:i", "radar:seen", "sector:seen", "paper"];
var migrated = false;
async function migrateOwner(env) {
  if (migrated || !env.RATE || !env.TELEGRAM_CHAT_ID) return;
  try {
    if (await env.RATE.get("tg:migrated")) {
      migrated = true;
      return;
    }
    const o = String(env.TELEGRAM_CHAT_ID), day3 = localParts(Date.now()).date;
    for (const n of [...LEGACY, "ai:" + day3, "snap:" + day3, "log:" + day3]) {
      const v = await env.RATE.get("tg:" + n);
      if (v != null && await env.RATE.get(`tg:${o}:${n}`) == null) await env.RATE.put(`tg:${o}:${n}`, v, /^(ai|snap|log):/.test(n) ? { expirationTtl: 3 * 86400 } : void 0);
    }
    await env.RATE.put("tg:migrated", String(Date.now()));
    migrated = true;
  } catch (_) {
  }
}
async function member(env, chat = null) {
  const m = await members(env);
  return m[String(chat || chatOf(env))] || null;
}
async function setMember(env, chat, patch) {
  const m = await members(env), c = String(chat);
  if (!m[c]) return null;
  m[c] = { ...m[c], ...patch };
  for (const k of Object.keys(m[c])) if (m[c][k] === void 0) delete m[c][k];
  await kput(env, "tg:users", JSON.stringify(m));
  return m[c];
}
async function memberByEmail(env, email) {
  const e = String(email || "").toLowerCase(), m = await members(env);
  const hit = Object.entries(m).find(([, x]) => x.email && x.email === e);
  return hit ? { chat: hit[0], ...hit[1] } : null;
}
async function accessEmails(env) {
  return Object.values(await members(env)).map((x) => x.email).filter(Boolean).sort();
}
var DEF_AI = 5;
var DEF_REPORTS = 0;
var PREM_AI = 20;
var PREM_REPORTS = 3;
async function isPremium(env) {
  if (isOwner(env)) return true;
  const x = await member(env);
  return !!(x && x.premium && (!x.premUntil || x.premUntil > Date.now()));
}
async function aiLimitFor(env) {
  if (isOwner(env)) return Math.max(1, Math.min(500, parseInt(env.AI_DAILY_LIMIT || "30", 10) || 30));
  const x = await member(env);
  return x && Number.isFinite(x.ai) ? x.ai : Math.max(0, parseInt(env.MEMBER_AI_LIMIT || String(DEF_AI), 10) || DEF_AI);
}
async function langOf(env, mem7 = null) {
  let v = null;
  try {
    if (env.RATE) v = await env.RATE.get(K(env, "lang"));
  } catch (_) {
  }
  if (v === "ar" || v === "en") return v;
  if (mem7 === "ar" || mem7 === "en") return mem7;
  if (isOwner(env)) return env.BOT_LANG === "ar" ? "ar" : "en";
  const x = await member(env);
  return x && (x.lang === "ar" || x.lang === "en") ? x.lang : "en";
}
async function getPending(env, chat) {
  return kget(env, "tg:appreq:" + chat);
}
async function clearPending(env, chat) {
  await kdel(env, "tg:appreq:" + chat);
}

// tools/worker/stars.mjs
var DAY2 = 864e5;
var MONTH = 30 * DAY2;
var price = (env) => Math.max(1, Math.min(1e4, parseInt(env.PREMIUM_STARS || "350", 10) || 350));
var SUPPORT = [50, 100, 250, 500];
var usdOf = (n) => "$" + Math.max(1, Math.round(n * 0.02));
async function tg(env, method, body) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return await r.json();
  } catch (_) {
    return { ok: false };
  }
}
var cb = (text, data) => ({ text, callback_data: data });
var day = (ms) => local(ms, { day: "numeric", month: "short", year: "numeric" });
var premiumNow = (x, now = Date.now()) => !!(x && x.premium && (!x.premUntil || x.premUntil > now));
async function grant(env, chat, until, src, charge) {
  const x = await member(env, chat);
  if (!x) return null;
  return setMember(env, chat, {
    premium: true,
    premUntil: until || void 0,
    premSrc: src,
    subCharge: charge || x.subCharge,
    premRemind: void 0,
    ai: Math.max(PREM_AI, Number.isFinite(x.ai) ? x.ai : 0),
    reports: Math.max(PREM_REPORTS, Number.isFinite(x.reports) ? x.reports : 0)
  });
}
async function revoke(env, chat) {
  return setMember(env, chat, { premium: void 0, premUntil: void 0, premSrc: void 0, subCharge: void 0, premRemind: void 0, ai: DEF_AI, reports: DEF_REPORTS });
}
var W = {
  en: {
    pTitle: "\u2B50 <b>Cute Portfolio Premium</b>",
    pBody: (p) => `Everything stays <b>free</b> for everyone. Premium adds:
\u2022 \u{1F399} Voice notes \u2014 just talk to the bot
\u2022 \u{1F9E0} ${PREM_AI} AI questions a day (instead of ${DEF_AI})
\u2022 \u{1F4CA} ${PREM_REPORTS} quick AI Analysis reports a day in the app

<b>Price:</b> ${p} \u2B50 a month (about ${usdOf(p)}), paid with Telegram Stars.
\u2022 Renews every 30 days by itself \u2014 cancel any time in Telegram \u2192 Settings \u2192 My Stars. You keep it until the paid month ends.
\u2022 Why it costs anything: the AI is paid per question. This only covers that \u2014 Cute Portfolio is non-profit.

<i>Telegram Stars are Telegram's own coins: you buy them inside Telegram, like any in-app purchase.</i>`,
    isPrem: (u) => u ? `\u2705 <b>You're premium until ${u}.</b>` : "\u2705 <b>You're premium</b> (a gift from Dr. Samir Saad).",
    renews: "It renews by itself \u2014 to stop: Telegram \u2192 Settings \u2192 My Stars.",
    subscribe: (p) => `\u2B50 Subscribe \u2014 ${p} \u2B50 / month`,
    extend: (p) => `\u2B50 Subscribe \u2014 ${p} \u2B50 / month (after the gift)`,
    supportInstead: "\u{1F49B} Support instead",
    ask: "\u{1F381} Ask Dr. Samir Saad",
    back: "\u2B05\uFE0F Menu",
    sTitle: "\u{1F49B} <b>Support Cute Portfolio</b>",
    sBody: "<b>Optional</b> \u2014 a one-time thank-you of any size. Nothing changes in the features: everything stays free.\nIt helps pay for the servers and the AI. You get a <b>Supporter \u{1F49B}</b> badge in the bot and the app.\n\nPick an amount (Telegram Stars):",
    sThanksBadge: (n) => `You've given ${n} \u2B50 so far \u2014 thank you!`,
    invTitle: "Cute Portfolio Premium",
    invDesc: `Voice notes, ${PREM_AI} AI questions and ${PREM_REPORTS} AI Analysis reports a day. Renews every 30 days; cancel any time.`,
    supTitle: "Support Cute Portfolio \u{1F49B}",
    supDesc: "A one-time thank-you \u2014 helps pay for the servers and the AI. You get a Supporter \u{1F49B} badge.",
    paidPrem: (u) => `\u2B50 <b>Thank you \u2014 you're premium now!</b>
Voice notes \u{1F399} are on, with ${PREM_AI} AI questions and ${PREM_REPORTS} AI Analysis reports a day.
Until ${u} \u2014 it renews by itself (stop any time: Telegram \u2192 Settings \u2192 My Stars).`,
    renewed: (u) => `\u2B50 Premium renewed \u2014 until ${u}. Thank you!`,
    paidSup: (n) => `\u{1F49B} <b>Thank you!</b> Your ${n} \u2B50 help keep Cute Portfolio free. You're a <b>Supporter \u{1F49B}</b> now.`,
    remind: (u) => `\u2B50 Your premium ends on ${u}. If your Stars subscription is on, it renews by itself; if not: /premium.`,
    ended: "\u2B50 Your premium has ended \u2014 back to the standard limits. To renew: /premium",
    ownerPrem: (n, s, u) => `\u2B50 <b>${n}</b> subscribed to Premium \u2014 ${s} \u2B50 (until ${u}).`,
    ownerRenew: (n, s, u) => `\u2B50 <b>${n}</b> renewed Premium \u2014 ${s} \u2B50 (until ${u}).`,
    ownerSup: (n, s) => `\u{1F49B} <b>${n}</b> supported the project with ${s} \u2B50.`,
    ownerAsk: (n) => `\u{1F381} <b>${n}</b> asks you for premium as a gift.`,
    asked: "\u{1F381} Sent to Dr. Samir Saad \u2014 you'll hear here.",
    ownerP: "You are premium already \u2B50 \u2014 this is what members see:"
  },
  ar: {
    pTitle: "\u2B50 <b>Cute Portfolio \u0627\u0644\u0645\u0645\u064A\u0632</b>",
    pBody: (p) => `\u0643\u0644 \u062D\u0627\u062C\u0629 \u0628\u062A\u0641\u0636\u0644 <b>\u0645\u062C\u0627\u0646\u064A\u0629</b> \u0644\u0644\u0643\u0644. \u0627\u0644\u0645\u0645\u064A\u0632 \u0628\u064A\u0632\u0648\u0651\u062F:
\u2022 \u{1F399} \u0627\u0644\u0631\u0633\u0627\u064A\u0644 \u0627\u0644\u0635\u0648\u062A\u064A\u0629 \u2014 \u0643\u0644\u0651\u0645 \u0627\u0644\u0628\u0648\u062A \u0628\u0635\u0648\u062A\u0643
\u2022 \u{1F9E0} ${PREM_AI} \u0633\u0624\u0627\u0644 AI \u0641\u064A \u0627\u0644\u064A\u0648\u0645 (\u0628\u062F\u0644 ${DEF_AI})
\u2022 \u{1F4CA} ${PREM_REPORTS} \u062A\u0642\u0627\u0631\u064A\u0631 AI Analysis \u0633\u0631\u064A\u0639\u0629 \u0641\u064A \u0627\u0644\u064A\u0648\u0645 \u0641\u064A \u0627\u0644\u062A\u0637\u0628\u064A\u0642

<b>\u0627\u0644\u0633\u0639\u0631:</b> ${p} \u2B50 \u0641\u064A \u0627\u0644\u0634\u0647\u0631 (\u062D\u0648\u0627\u0644\u064A ${usdOf(p)})\u060C \u0628\u0627\u0644\u0640 Telegram Stars.
\u2022 \u0628\u064A\u062A\u062C\u062F\u062F \u0644\u0648\u062D\u062F\u0647 \u0643\u0644 30 \u064A\u0648\u0645 \u2014 \u062A\u0642\u062F\u0631 \u062A\u0644\u063A\u064A\u0647 \u0641\u064A \u0623\u064A \u0648\u0642\u062A \u0645\u0646 \u062A\u0644\u062C\u0631\u0627\u0645 \u2190 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u2190 My Stars\u060C \u0648\u064A\u0641\u0636\u0644 \u0645\u0639\u0627\u0643 \u0644\u0622\u062E\u0631 \u0627\u0644\u0634\u0647\u0631 \u0627\u0644\u0645\u062F\u0641\u0648\u0639.
\u2022 \u0644\u064A\u0647 \u0628\u0641\u0644\u0648\u0633 \u0623\u0635\u0644\u0627\u064B: \u0627\u0644\u0640 AI \u0628\u064A\u062A\u062D\u0627\u0633\u0628 \u0639\u0644\u0649 \u0643\u0644 \u0633\u0624\u0627\u0644\u060C \u0648\u0627\u0644\u0645\u0628\u0644\u063A \u062F\u0647 \u0628\u064A\u063A\u0637\u064A \u0627\u0644\u062A\u0643\u0644\u0641\u0629 \u062F\u064A \u0628\u0633 \u2014 Cute Portfolio \u0645\u0634 \u0647\u0627\u062F\u0641 \u0644\u0644\u0631\u0628\u062D.

<i>\u0627\u0644\u0640 Telegram Stars \u0639\u0645\u0644\u0629 \u062A\u0644\u062C\u0631\u0627\u0645 \u0646\u0641\u0633\u0647: \u0628\u062A\u0634\u062A\u0631\u064A\u0647\u0627 \u0645\u0646 \u062C\u0648\u0647 \u062A\u0644\u062C\u0631\u0627\u0645 \u0632\u064A \u0623\u064A \u0634\u0631\u0627\u0621 \u0645\u0646 \u0627\u0644\u062A\u0637\u0628\u064A\u0642.</i>`,
    isPrem: (u) => u ? `\u2705 <b>\u0627\u0646\u062A \u0645\u0645\u064A\u0632 \u0644\u062D\u062F ${u}.</b>` : "\u2705 <b>\u0627\u0646\u062A \u0645\u0645\u064A\u0632</b> (\u0647\u062F\u064A\u0629 \u0645\u0646 Dr. Samir Saad).",
    renews: "\u0628\u064A\u062A\u062C\u062F\u062F \u0644\u0648\u062D\u062F\u0647 \u2014 \u0639\u0634\u0627\u0646 \u062A\u0648\u0642\u0641\u0647: \u062A\u0644\u062C\u0631\u0627\u0645 \u2190 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u2190 My Stars.",
    subscribe: (p) => `\u2B50 \u0627\u0634\u062A\u0631\u0643 \u2014 ${p} \u2B50 \u0641\u064A \u0627\u0644\u0634\u0647\u0631`,
    extend: (p) => `\u2B50 \u0627\u0634\u062A\u0631\u0643 \u2014 ${p} \u2B50 \u0641\u064A \u0627\u0644\u0634\u0647\u0631 (\u0628\u0639\u062F \u0627\u0644\u0647\u062F\u064A\u0629)`,
    supportInstead: "\u{1F49B} \u0627\u062F\u0639\u0645 \u0628\u062F\u0644 \u0643\u062F\u0647",
    ask: "\u{1F381} \u0627\u0637\u0644\u0628 \u0645\u0646 Dr. Samir Saad",
    back: "\u2B05\uFE0F \u0627\u0644\u0642\u0627\u0626\u0645\u0629",
    sTitle: "\u{1F49B} <b>\u0627\u062F\u0639\u0645 Cute Portfolio</b>",
    sBody: "<b>\u0627\u062E\u062A\u064A\u0627\u0631\u064A</b> \u2014 \u0634\u0643\u0631 \u0644\u0645\u0631\u0629 \u0648\u0627\u062D\u062F\u0629 \u0628\u0623\u064A \u0645\u0628\u0644\u063A. \u0627\u0644\u0645\u0632\u0627\u064A\u0627 \u0645\u0627 \u0628\u062A\u062A\u063A\u064A\u0631\u0634: \u0643\u0644 \u062D\u0627\u062C\u0629 \u0628\u062A\u0641\u0636\u0644 \u0645\u062C\u0627\u0646\u064A\u0629.\n\u0628\u064A\u0633\u0627\u0639\u062F \u0641\u064A \u062A\u0643\u0644\u0641\u0629 \u0627\u0644\u0633\u064A\u0631\u0641\u0631\u0627\u062A \u0648\u0627\u0644\u0640 AI\u060C \u0648\u0628\u062A\u0627\u062E\u062F \u0648\u0633\u0627\u0645 <b>Supporter \u{1F49B}</b> \u0641\u064A \u0627\u0644\u0628\u0648\u062A \u0648\u0627\u0644\u062A\u0637\u0628\u064A\u0642.\n\n\u0627\u062E\u062A\u0627\u0631 \u0627\u0644\u0645\u0628\u0644\u063A (Telegram Stars):",
    sThanksBadge: (n) => `\u0627\u062F\u0651\u064A\u062A ${n} \u2B50 \u0644\u062D\u062F \u062F\u0644\u0648\u0642\u062A\u064A \u2014 \u0634\u0643\u0631\u0627\u064B!`,
    invTitle: "Cute Portfolio \u0627\u0644\u0645\u0645\u064A\u0632",
    invDesc: `\u0631\u0633\u0627\u064A\u0644 \u0635\u0648\u062A\u064A\u0629\u060C \u0648${PREM_AI} \u0633\u0624\u0627\u0644 AI \u0648${PREM_REPORTS} \u062A\u0642\u0627\u0631\u064A\u0631 AI Analysis \u0641\u064A \u0627\u0644\u064A\u0648\u0645. \u0628\u064A\u062A\u062C\u062F\u062F \u0643\u0644 30 \u064A\u0648\u0645\u060C \u0648\u062A\u0642\u062F\u0631 \u062A\u0644\u063A\u064A\u0647 \u0641\u064A \u0623\u064A \u0648\u0642\u062A.`,
    supTitle: "\u0627\u062F\u0639\u0645 Cute Portfolio \u{1F49B}",
    supDesc: "\u0634\u0643\u0631 \u0644\u0645\u0631\u0629 \u0648\u0627\u062D\u062F\u0629 \u2014 \u0628\u064A\u0633\u0627\u0639\u062F \u0641\u064A \u062A\u0643\u0644\u0641\u0629 \u0627\u0644\u0633\u064A\u0631\u0641\u0631\u0627\u062A \u0648\u0627\u0644\u0640 AI. \u0648\u0628\u062A\u0627\u062E\u062F \u0648\u0633\u0627\u0645 Supporter \u{1F49B}.",
    paidPrem: (u) => `\u2B50 <b>\u0634\u0643\u0631\u0627\u064B \u2014 \u0628\u0642\u064A\u062A \u0639\u0636\u0648 \u0645\u0645\u064A\u0632!</b>
\u0627\u0644\u0631\u0633\u0627\u064A\u0644 \u0627\u0644\u0635\u0648\u062A\u064A\u0629 \u{1F399} \u0627\u0634\u062A\u063A\u0644\u062A\u060C \u0648${PREM_AI} \u0633\u0624\u0627\u0644 AI \u0648${PREM_REPORTS} \u062A\u0642\u0627\u0631\u064A\u0631 AI Analysis \u0641\u064A \u0627\u0644\u064A\u0648\u0645.
\u0644\u062D\u062F ${u} \u2014 \u0648\u0628\u064A\u062A\u062C\u062F\u062F \u0644\u0648\u062D\u062F\u0647 (\u062A\u0648\u0642\u0641\u0647 \u0641\u064A \u0623\u064A \u0648\u0642\u062A: \u062A\u0644\u062C\u0631\u0627\u0645 \u2190 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u2190 My Stars).`,
    renewed: (u) => `\u2B50 \u0627\u0644\u0645\u0645\u064A\u0632 \u0627\u062A\u062C\u062F\u062F \u2014 \u0644\u062D\u062F ${u}. \u0634\u0643\u0631\u0627\u064B!`,
    paidSup: (n) => `\u{1F49B} <b>\u0634\u0643\u0631\u0627\u064B!</b> \u0627\u0644\u0640 ${n} \u2B50 \u0628\u062A\u0648\u0639\u0643 \u0628\u064A\u0633\u0627\u0639\u062F\u0648\u0627 Cute Portfolio \u064A\u0641\u0636\u0644 \u0645\u062C\u0627\u0646\u064A. \u0628\u0642\u064A\u062A <b>Supporter \u{1F49B}</b>.`,
    remind: (u) => `\u2B50 \u0627\u0644\u0645\u0645\u064A\u0632 \u0628\u062A\u0627\u0639\u0643 \u0628\u064A\u062E\u0644\u0635 \u064A\u0648\u0645 ${u}. \u0644\u0648 \u0627\u0634\u062A\u0631\u0627\u0643 \u0627\u0644\u0640 Stars \u0634\u063A\u0627\u0644 \u0647\u064A\u062A\u062C\u062F\u062F \u0644\u0648\u062D\u062F\u0647\u061B \u0644\u0648 \u0644\u0623: /premium`,
    ended: "\u2B50 \u0627\u0644\u0645\u0645\u064A\u0632 \u062E\u0644\u0635 \u2014 \u0631\u062C\u0639\u062A \u0644\u0644\u062D\u062F\u0648\u062F \u0627\u0644\u0639\u0627\u062F\u064A\u0629. \u0639\u0634\u0627\u0646 \u062A\u062C\u062F\u062F\u0647: /premium",
    ownerPrem: (n, s, u) => `\u2B50 <b>${n}</b> \u0627\u0634\u062A\u0631\u0643 \u0641\u064A \u0627\u0644\u0645\u0645\u064A\u0632 \u2014 ${s} \u2B50 (\u0644\u062D\u062F ${u}).`,
    ownerRenew: (n, s, u) => `\u2B50 <b>${n}</b> \u062C\u062F\u062F \u0627\u0644\u0645\u0645\u064A\u0632 \u2014 ${s} \u2B50 (\u0644\u062D\u062F ${u}).`,
    ownerSup: (n, s) => `\u{1F49B} <b>${n}</b> \u062F\u0639\u0645 \u0627\u0644\u0645\u0634\u0631\u0648\u0639 \u0628\u0640 ${s} \u2B50.`,
    ownerAsk: (n) => `\u{1F381} <b>${n}</b> \u0628\u064A\u0637\u0644\u0628 \u0645\u0646\u0643 \u0627\u0644\u0645\u0645\u064A\u0632 \u0647\u062F\u064A\u0629.`,
    asked: "\u{1F381} \u0627\u062A\u0628\u0639\u062A \u0644\u0640 Dr. Samir Saad \u2014 \u0647\u064A\u0648\u0635\u0644\u0643 \u0631\u062F \u0647\u0646\u0627.",
    ownerP: "\u0627\u0646\u062A \u0645\u0645\u064A\u0632 \u0623\u0635\u0644\u0627\u064B \u2B50 \u2014 \u062F\u0647 \u0627\u0644\u0644\u064A \u0627\u0644\u0623\u0639\u0636\u0627\u0621 \u0628\u064A\u0634\u0648\u0641\u0648\u0647:"
  }
};
var words = (lang2) => W[lang2 === "ar" ? "ar" : "en"];
async function premiumView(env, lang2, now = Date.now()) {
  const w = words(lang2), p = price(env), own = isOwner(env), x = own ? null : await member(env);
  const on = premiumNow(x, now), lines = [w.pTitle, "", w.pBody(p)];
  if (own) lines.unshift(`<i>${w.ownerP}</i>`, "");
  if (on) lines.push("", w.isPrem(x.premUntil ? day(x.premUntil) : null), ...x.premSrc === "stars" ? [w.renews] : []);
  const b = [];
  if (!own && !(on && x.premSrc === "stars")) {
    const link = await tg(env, "createInvoiceLink", {
      title: w.invTitle,
      description: w.invDesc,
      payload: `prem:${chatOf(env)}`,
      currency: "XTR",
      prices: [{ label: w.invTitle, amount: p }],
      subscription_period: 30 * 86400
    });
    if (link.ok && typeof link.result === "string") b.push([{ text: on ? w.extend(p) : w.subscribe(p), url: link.result }]);
  }
  b.push([cb(w.supportInstead, "sp")]);
  if (!own && !on) b.push([cb(w.ask, "pm:ask")]);
  b.push([cb(w.back, "menu")]);
  return { text: lines.join("\n"), buttons: b };
}
async function invoiceLink(env, chat, kind, n, lang2 = "en") {
  const w = words(lang2);
  if (kind === "prem") return tg(env, "createInvoiceLink", { title: w.invTitle, description: w.invDesc, payload: `prem:${chat}`, currency: "XTR", prices: [{ label: w.invTitle, amount: price(env) }], subscription_period: 30 * 86400 });
  if (kind === "sup" && SUPPORT.includes(+n)) return tg(env, "createInvoiceLink", { title: w.supTitle, description: w.supDesc, payload: `sup:${chat}:${+n}`, currency: "XTR", prices: [{ label: w.supTitle, amount: +n }] });
  return { ok: false };
}
async function supportView(env, lang2) {
  const w = words(lang2), x = isOwner(env) ? null : await member(env);
  return {
    text: [w.sTitle, "", w.sBody, ...x && x.starsPaid ? ["", `<i>${w.sThanksBadge(x.starsPaid)}</i>`] : []].join("\n"),
    buttons: [SUPPORT.slice(0, 2).map((n) => cb(`${n} \u2B50 (\u2248${usdOf(n)})`, "sp:" + n)), SUPPORT.slice(2).map((n) => cb(`${n} \u2B50 (\u2248${usdOf(n)})`, "sp:" + n)), [cb(w.back, "menu")]]
  };
}
async function sendSupportInvoice(env, chat, n, lang2) {
  const w = words(lang2);
  if (!SUPPORT.includes(n)) return { ok: false };
  return tg(env, "sendInvoice", { chat_id: chat, title: w.supTitle, description: w.supDesc, payload: `sup:${chat}:${n}`, currency: "XTR", prices: [{ label: w.supTitle, amount: n }] });
}
async function askGift(env, chat, lang2) {
  const x = await member(env), w = words(lang2);
  await tg(env, "sendMessage", { chat_id: chat, text: w.asked });
  await asChat(env.TELEGRAM_CHAT_ID, async () => {
    const L = await langOf(env), o = words(L);
    await tg(env, "sendMessage", {
      chat_id: env.TELEGRAM_CHAT_ID,
      text: o.ownerAsk(esc(x ? x.name : chat)),
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[cb(L === "ar" ? "\u{1F381} \u2B50 +30 \u064A\u0648\u0645" : "\u{1F381} \u2B50 +30 days", `us:pd:30:${chat}`), cb(L === "ar" ? "\u{1F381} \u2B50 +365 \u064A\u0648\u0645" : "\u{1F381} \u2B50 +365 days", `us:pd:365:${chat}`)], [cb(L === "ar" ? "\u{1F464} \u0627\u0644\u0643\u0627\u0631\u062A" : "\u{1F464} Their card", "us:m:" + chat)]] }
    });
  });
}
async function preCheckout(env, q) {
  const m = /^(prem|sup):(-?\d+)(?::(\d+))?$/.exec(String(q.invoice_payload || "")), all = await members(env);
  const okPay = !!m && String(m[2]) === String(q.from && q.from.id) && (all[m[2]] || String(m[2]) === String(env.TELEGRAM_CHAT_ID)) && q.currency === "XTR" && (m[1] === "prem" ? q.total_amount === price(env) : SUPPORT.includes(q.total_amount));
  await tg(env, "answerPreCheckoutQuery", { pre_checkout_query_id: q.id, ok: okPay, ...okPay ? {} : { error_message: "This payment is not valid any more \u2014 open /premium or /support again." } });
  return okPay;
}
async function paid(env, chat, sp, lang2, now = Date.now()) {
  const w = words(lang2), [kind, , n] = String(sp.invoice_payload || "").split(":"), stars = +sp.total_amount || 0, x = await member(env, chat);
  await log(env, { t: now, chat: String(chat), kind, stars, charge: sp.telegram_payment_charge_id, renew: !!(sp.is_recurring && !sp.is_first_recurring) });
  const name = esc(x && x.name || String(chat)), owner2 = String(chat) === String(env.TELEGRAM_CHAT_ID);
  const tellOwner = async (text) => {
    if (!owner2) await tg(env, "sendMessage", { chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML" });
  };
  const O = words(await asChat(env.TELEGRAM_CHAT_ID, () => langOf(env)));
  if (kind === "prem") {
    const until = sp.subscription_expiration_date ? sp.subscription_expiration_date * 1e3 : now + MONTH;
    if (!owner2) {
      await grant(env, chat, until, "stars", sp.telegram_payment_charge_id);
      await setMember(env, chat, { supporter: true, starsPaid: (x && x.starsPaid || 0) + stars });
    }
    const renew = !!(sp.is_recurring && !sp.is_first_recurring);
    await tg(env, "sendMessage", { chat_id: chat, text: renew ? w.renewed(day(until)) : w.paidPrem(day(until)), parse_mode: "HTML" });
    await tellOwner(renew ? O.ownerRenew(name, stars, day(until)) : O.ownerPrem(name, stars, day(until)));
    return { kind, until };
  }
  if (kind === "sup") {
    if (!owner2) await setMember(env, chat, { supporter: true, starsPaid: (x && x.starsPaid || 0) + stars });
    await tg(env, "sendMessage", { chat_id: chat, text: w.paidSup(stars), parse_mode: "HTML" });
    await tellOwner(O.ownerSup(name, stars));
    return { kind, stars, n };
  }
  return { kind: "unknown" };
}
async function log(env, e) {
  if (!env.RATE) return;
  let a = [];
  try {
    a = JSON.parse(await env.RATE.get("tg:stars:log") || "[]");
  } catch (_) {
  }
  if (e.charge && a.some((x) => x.charge === e.charge)) return;
  a.push(e);
  try {
    await env.RATE.put("tg:stars:log", JSON.stringify(a.slice(-1e3)));
  } catch (_) {
  }
}
async function statsView(env, lang2, now = Date.now()) {
  const ar = lang2 === "ar", m = await members(env), list2 = Object.values(m);
  let a = [];
  try {
    a = JSON.parse(env.RATE && await env.RATE.get("tg:stars:log") || "[]");
  } catch (_) {
  }
  const month = new Date(now).toISOString().slice(0, 7), sum = (f) => a.filter(f).reduce((s, x) => s + (+x.stars || 0), 0);
  const prem = list2.filter((x) => premiumNow(x, now)), paidP = prem.filter((x) => x.premSrc === "stars").length;
  const L = [
    ar ? "\u{1F4C8} <b>\u0627\u0644\u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A</b>" : "\u{1F4C8} <b>Stats</b>",
    "",
    `\u{1F465} ${ar ? "\u0627\u0644\u0623\u0639\u0636\u0627\u0621" : "Members"}: <b>${list2.length}</b>${list2.some((x) => x.paused) ? ` \xB7 \u23F8 ${list2.filter((x) => x.paused).length}` : ""}`,
    `\u2B50 ${ar ? "\u0627\u0644\u0645\u0645\u064A\u0632\u064A\u0646 \u062F\u0644\u0648\u0642\u062A\u064A" : "Premium now"}: <b>${prem.length}</b> (${ar ? "Stars" : "Stars"} ${paidP} \xB7 ${ar ? "\u0647\u062F\u064A\u0629" : "gift"} ${prem.length - paidP})`,
    `\u{1F49B} ${ar ? "\u0627\u0644\u062F\u0627\u0639\u0645\u064A\u0646" : "Supporters"}: <b>${list2.filter((x) => x.supporter).length}</b>`,
    "",
    `\u2B50 ${ar ? "\u0627\u0644\u0634\u0647\u0631 \u062F\u0647" : "This month"}: <b>${sum((x) => new Date(x.t).toISOString().slice(0, 7) === month)}</b> \u2B50 (${ar ? "\u0645\u0645\u064A\u0632" : "premium"} ${sum((x) => x.kind === "prem" && new Date(x.t).toISOString().slice(0, 7) === month)} \xB7 ${ar ? "\u062F\u0639\u0645" : "support"} ${sum((x) => x.kind === "sup" && new Date(x.t).toISOString().slice(0, 7) === month)})`,
    `\u2B50 ${ar ? "\u0645\u0646 \u0627\u0644\u0623\u0648\u0644" : "All time"}: <b>${sum(() => true)}</b> \u2B50 (\u2248 ${usdOf(sum(() => true))} ${ar ? "\u062F\u0641\u0639\u0647\u0627 \u0627\u0644\u0623\u0639\u0636\u0627\u0621" : "paid by members"})`,
    "",
    `<i>${ar ? "\u0627\u0644\u0633\u062D\u0628: \u0645\u0646 \u062D\u0633\u0627\u0628 \u0627\u0644\u0628\u0648\u062A \u0641\u064A Fragment (\u0627\u0646\u062A \u0628\u0646\u0641\u0633\u0643)." : "Withdraw: from the bot's balance via Fragment (yourself)."}</i>`
  ];
  return { text: L.join("\n"), buttons: [[cb(ar ? "\u{1F465} \u0627\u0644\u0623\u0639\u0636\u0627\u0621" : "\u{1F465} Members", "us"), cb(ar ? "\u2B05\uFE0F \u0627\u0644\u0642\u0627\u0626\u0645\u0629" : "\u2B05\uFE0F Menu", "menu")]] };
}
async function expireRound(env, now = Date.now()) {
  const m = await members(env);
  let ended = 0;
  for (const [chat, x] of Object.entries(m)) {
    if (!x.premium || !x.premUntil) continue;
    const L = x.lang === "ar" ? "ar" : "en", w = words(L);
    if (x.premUntil <= now) {
      await revoke(env, chat);
      await tg(env, "sendMessage", { chat_id: chat, text: w.ended });
      ended++;
      continue;
    }
    if (x.premUntil - now < 3 * DAY2 && !x.premRemind && x.premSrc !== "stars") {
      await setMember(env, chat, { premRemind: true });
      await tg(env, "sendMessage", { chat_id: chat, text: w.remind(day(x.premUntil)) });
    }
  }
  return { ended };
}
async function addDays(env, chat, days, now = Date.now()) {
  const x = await member(env, chat);
  if (!x) return null;
  const from = premiumNow(x, now) && x.premUntil ? x.premUntil : now;
  return grant(env, chat, from + days * DAY2, x.premSrc === "stars" && premiumNow(x, now) ? "stars" : "gift", x.subCharge);
}

// tools/worker/byok.mjs
var BYOK_AI = 100;
var BYOK_REPORTS = 10;
var enc = new TextEncoder();
var dec = new TextDecoder();
var b64 = (u) => btoa(String.fromCharCode(...u));
var unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function aesKey(env) {
  let secret = "";
  try {
    secret = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT || "{}").private_key || "";
  } catch (_) {
  }
  secret = secret || env.TG_SECRET || "";
  if (secret.length < 16) throw new Error("no secret to encrypt with");
  const base = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode("samsam-byok"), info: enc.encode("claude-key-v1") }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function seal(env, plain) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(env), enc.encode(plain)));
  return b64(iv) + "." + b64(ct);
}
async function unseal(env, sealed) {
  const [iv, ct] = String(sealed).split(".");
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(env), unb64(ct)));
}
var SHAPE = /^sk-a[n]t-[A-Za-z0-9_\-]{20,200}$/;
var validShape = (k) => SHAPE.test(String(k || "").trim());
async function keyWorks(key) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } });
    return r.ok ? "ok" : r.status === 401 || r.status === 403 ? "refused" : "unsure";
  } catch (_) {
    return "unsure";
  }
}
async function saveKey(env, key) {
  const k = String(key).trim();
  await env.RATE.put(K(env, "byok"), JSON.stringify({ v: await seal(env, k), tail: k.slice(-4), at: (/* @__PURE__ */ new Date()).toISOString() }));
}
async function keyInfo(env) {
  try {
    const x = JSON.parse(env.RATE && await env.RATE.get(K(env, "byok")) || "null");
    return x && x.v ? { has: true, tail: x.tail, at: x.at } : { has: false };
  } catch (_) {
    return { has: false };
  }
}
var mem = /* @__PURE__ */ new Map();
async function ownKey(env) {
  let x = null;
  try {
    x = JSON.parse(env.RATE && await env.RATE.get(K(env, "byok")) || "null");
  } catch (_) {
    x = null;
  }
  if (!x || !x.v) return null;
  if (mem.has(x.v)) return mem.get(x.v);
  let key = null;
  try {
    key = await unseal(env, x.v);
  } catch (_) {
    key = null;
  }
  if (mem.size > 50) mem.clear();
  mem.set(x.v, key);
  return key;
}
async function deleteKey(env) {
  try {
    if (env.RATE) await env.RATE.delete(K(env, "byok"));
  } catch (_) {
  }
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
var isFutures = (url3) => /okx\.com\/api\/v5\/(public|rubik)\/|fapi\.binance\.com\/|api\.hyperliquid\.xyz\//.test(String(url3));
async function xfetch(url3, init) {
  const cap = isFutures(url3) ? BUDGET : BUDGET - RESERVE;
  if (used >= cap) {
    refused++;
    throw new Error("budget");
  }
  used++;
  return fetch(url3, init);
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
async function getJson(url3, init) {
  return (await getJsonS(url3, init)).j;
}
async function getJsonS(url3, init) {
  const tag = () => {
    try {
      const u = new URL(url3);
      return u.host + u.pathname;
    } catch (_) {
      return "?";
    }
  };
  try {
    const r = await xfetch(url3, init);
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
  const market = { top, top500, global: base.m.global, fng: base.m.fng, alt: base.m.alt, parts: base.m.parts, series, altPage: base.alt, etf: base.etf, cgIds: cg_ids_default, live: {}, idOf, stocks: base.m.stocks || [], sectors: base.m.sectors || [] };
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
    for (const [src, url3, read] of EX) {
      const off = cache.get("ex-off:" + src);
      if (off && Date.now() < off.until) continue;
      const { s: st, j } = await getJsonS(url3(S));
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
var KVS = null;
async function googleToken(sa) {
  if (tokenCache && tokenCache.until > Date.now() && tokenCache.email === sa.client_email) return tokenCache.token;
  if (KVS) {
    try {
      const k = JSON.parse(await KVS.get("fs:gtok") || "null");
      if (k && k.until > Date.now() && k.email === sa.client_email) {
        tokenCache = k;
        return k.token;
      }
    } catch (_) {
    }
  }
  const now = Math.floor(Date.now() / 1e3), aud = sa.token_uri || "https://oauth2.googleapis.com/token";
  const body = b64urlJson({ alg: "RS256", typ: "JWT" }) + "." + b64urlJson({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore", aud, iat: now, exp: now + 3600 });
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig2 = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(body));
  const r = await xfetch(aud, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: body + "." + b64url(sig2) }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Firebase sign-in refused (" + r.status + ")");
  tokenCache = { token: j.access_token, until: Date.now() + 50 * 6e4, email: sa.client_email };
  if (KVS) {
    try {
      await KVS.put("fs:gtok", JSON.stringify(tokenCache), { expirationTtl: 50 * 60 });
    } catch (_) {
    }
  }
  return j.access_token;
}
function dec2(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return fields(v.mapValue.fields);
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(dec2);
  return null;
}
var fields = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, dec2(v)]));
function serviceAccount(env) {
  if (env && env.RATE) KVS = env.RATE;
  try {
    const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT || "");
    return sa && sa.client_email && sa.private_key && sa.project_id ? sa : null;
  } catch (_) {
    return null;
  }
}
async function firestore(sa) {
  const token = await googleToken(sa), base = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;
  const call = async (url3, init = {}) => {
    const r = await xfetch(url3, { ...init, headers: { authorization: "Bearer " + token, "content-type": "application/json", ...init.headers || {} } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("Firestore " + r.status);
    return r.json();
  };
  return {
    async metaDocs() {
      const rows = await call(base + ":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "meta", allDescendants: true }], limit: 1e3 } }) }) || [];
      return rows.filter((x) => x.document && x.document.name).map((x) => ({ name: x.document.name, data: fields(x.document.fields) }));
    },
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
    // how many documents a collection has — a count costs 1 read per 1000 documents (not 1 per document)
    async count(parent, coll) {
      const j = await call(`${base}/${parent}:runAggregationQuery`, { method: "POST", body: JSON.stringify({ structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: coll }] }, aggregations: [{ alias: "n", count: {} }] } }) });
      const v = j && j[0] && j[0].result && j[0].result.aggregateFields && j[0].result.aggregateFields.n;
      return v && v.integerValue != null ? +v.integerValue : null;
    },
    // is any document of the collection newer than `since` (its updatedAt — the app stamps every coin / plan change)? 1 read
    async changedSince(parent, coll, since) {
      const rows = await call(`${base}/${parent}:runQuery`, { method: "POST", body: JSON.stringify({ structuredQuery: { from: [{ collectionId: coll }], where: { fieldFilter: { field: { fieldPath: "updatedAt" }, op: "GREATER_THAN", value: { stringValue: since } } }, limit: 1 } }) });
      return !Array.isArray(rows) || rows.some((x) => x.document);
    },
    async set(p, data) {
      return call(`${base}/${p}`, { method: "PATCH", body: JSON.stringify({ fields: enc2(data) }) });
    },
    // new documents, all or nothing (each must not exist yet — never overwrites)
    async commit(docs) {
      const name = (p) => `projects/${sa.project_id}/databases/(default)/documents/${p}`;
      return call(base + ":commit", { method: "POST", body: JSON.stringify({ writes: docs.map((d) => ({ update: { name: name(d.path), fields: enc2(d.data) }, currentDocument: { exists: false } })) }) });
    }
  };
}
function encV(v) {
  if (v == null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isSafeInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encV) } };
  return { mapValue: { fields: enc2(v) } };
}
var enc2 = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, encV(v)]));
async function commitDocs(env, uid, docs) {
  const sa = serviceAccount(env);
  if (!sa) throw new Error("no service account");
  const db = await firestore(sa);
  await db.commit(docs.map((d) => ({ path: `users/${uid}/${d.path}`, data: d.data })));
  cache.delete("user");
  cache.delete("user:" + uid);
  await forgetPortfolio(env, uid);
  return { ok: true };
}
var PF_FULL_MS = 6 * 36e5;
var pfStats = { full: 0, probe: 0 };
var maxUpd = (rows) => rows.reduce((m, r) => r && typeof r.updatedAt === "string" && r.updatedAt > m ? r.updatedAt : m, "");
async function readPortfolio(env, db, uid, fresh) {
  const kvKey = "fs:pf:" + uid, parent = "users/" + uid;
  let kept = null;
  if (!fresh && env.RATE) {
    try {
      kept = JSON.parse(await env.RATE.get(kvKey) || "null");
    } catch (_) {
      kept = null;
    }
  }
  const quiet = +env.PF_CHECK_MS ? isOwner(env) ? Math.min(+env.PF_CHECK_MS, 10 * 6e4) : +env.PF_CHECK_MS : 0;
  if (kept && kept.data && quiet && Date.now() - (kept.checked || kept.at) < quiet && Date.now() - kept.at < PF_FULL_MS) {
    pfStats.skip = (pfStats.skip || 0) + 1;
    return kept.data;
  }
  if (kept && kept.data && Date.now() - kept.at < PF_FULL_MS) {
    try {
      const [nt, nc, na, cc, ca, meta2] = await Promise.all([
        db.count(parent, "txs"),
        db.count(parent, "coins"),
        db.count(parent, "accum"),
        kept.seen ? db.changedSince(parent, "coins", kept.seen) : true,
        kept.seen ? db.changedSince(parent, "accum", kept.seen) : true,
        db.get(parent + "/meta/info")
      ]);
      if (nt === kept.n.txs && nc === kept.n.coins && na === kept.n.accum && !cc && !ca) {
        pfStats.probe++;
        const m = meta2 || {};
        kept.data.meta = m;
        kept.checked = Date.now();
        try {
          await env.RATE.put(kvKey, JSON.stringify(kept));
        } catch (_) {
        }
        return kept.data;
      }
    } catch (_) {
    }
  }
  const [coins, txs, accum, meta] = await Promise.all([db.list(`${parent}/coins`), db.list(`${parent}/txs`), db.list(`${parent}/accum`), db.get(`${parent}/meta/info`)]);
  pfStats.full++;
  const data = { coins, txs, accum, meta: meta || {}, uid };
  if (env.RATE) {
    try {
      await env.RATE.put(kvKey, JSON.stringify({ at: Date.now(), checked: Date.now(), seen: maxUpd([...coins, ...accum]), n: { txs: txs.length, coins: coins.length, accum: accum.length }, data }));
    } catch (_) {
    }
  }
  return data;
}
async function forgetPortfolio(env, uid) {
  try {
    if (env.RATE && uid) await env.RATE.delete("fs:pf:" + uid);
  } catch (_) {
  }
}
async function loadMemberUser(env, sa, fresh) {
  const me = await member(env);
  if (!me || !me.uid) return null;
  const key = "user:" + me.uid;
  if (fresh) cache.delete(key);
  return cached(key, 12e4, async () => {
    const db = await firestore(sa);
    return readPortfolio(env, db, me.uid, fresh);
  });
}
async function findLinkCode(env, code) {
  const sa = serviceAccount(env);
  if (!sa) return null;
  const db = await firestore(sa), C = String(code || "").toUpperCase();
  const hit = (await db.metaDocs()).find((d) => /\/users\/[^/]+\/meta\/tglink$/.test(d.name) && d.data.code === C);
  if (!hit || !(Date.parse(hit.data.exp) > Date.now())) return null;
  const uid = hit.name.match(/\/users\/([^/]+)\/meta\/tglink$/)[1];
  await db.set(`users/${uid}/meta/tglink`, { linked: "telegram", at: (/* @__PURE__ */ new Date()).toISOString() }).catch(() => {
  });
  return { uid, email: String(hit.data.email || "").toLowerCase() };
}
async function syncAccess(env, emails) {
  const sa = serviceAccount(env);
  if (!sa) return false;
  const db = await firestore(sa);
  await db.set("config/access", { emails, at: (/* @__PURE__ */ new Date()).toISOString() });
  return true;
}
var ownerMem = null;
async function ownerUid(env, db) {
  if (env.FIREBASE_UID) return env.FIREBASE_UID;
  if (ownerMem) return ownerMem;
  const pin = await db.get("config/owner").catch(() => null);
  if (pin && pin.uid) return ownerMem = pin.uid;
  const users = await db.users();
  if (users.length !== 1) {
    console.log(JSON.stringify({ owner: "not pinned", accounts: users.length }));
    return null;
  }
  await db.set("config/owner", { uid: users[0], at: (/* @__PURE__ */ new Date()).toISOString() }).catch(() => {
  });
  return ownerMem = users[0];
}
async function isOwnerAccount(env, { email, uid, owners }) {
  if (owners && owners.length) return owners.includes(String(email || "").toLowerCase());
  const sa = serviceAccount(env);
  if (!sa) return false;
  try {
    const db = await firestore(sa);
    return !!uid && uid === await ownerUid(env, db);
  } catch (_) {
    return false;
  }
}
async function loadUser(env, fresh = false) {
  const sa = serviceAccount(env);
  if (!sa) return null;
  if (!isOwner(env)) return loadMemberUser(env, sa, fresh);
  if (fresh) cache.delete("user");
  return cached("user", 12e4, async () => {
    const db = await firestore(sa);
    const uid = await ownerUid(env, db);
    if (!uid) return null;
    return readPortfolio(env, db, uid, fresh);
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
async function postJson(url3, body) {
  return getJson(url3, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
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

// tools/worker/admin.mjs
async function tg2(env, method, body) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return await r.json();
  } catch (_) {
    return { ok: false };
  }
}
var kv = async (env, k) => {
  try {
    return env.RATE ? await env.RATE.get(k) : null;
  } catch (_) {
    return null;
  }
};
var tell = (env, chat, en, ar, lang2) => !isTgChat(chat) ? null : tg2(env, "sendMessage", { chat_id: chat, text: lang2 === "ar" ? ar : en, parse_mode: "HTML" }).catch(() => {
});
var day2 = (ms) => local(ms, { day: "numeric", month: "short", year: "numeric" });
async function botLink(env, code) {
  let bot = await kv(env, "tg:botname");
  if (!bot) {
    const me = await tg2(env, "getMe", {});
    bot = me && me.ok && me.result && me.result.username;
    if (bot) try {
      await env.RATE.put("tg:botname", bot);
    } catch (_) {
    }
  }
  return bot ? `https://t.me/${bot}?start=${code}` : null;
}
async function overview(env, now = Date.now()) {
  const m = await members(env), rDay = localParts(now).date, uDay = new Date(now).toISOString().slice(0, 10);
  const list2 = await Promise.all(Object.entries(m).map(async ([chat, x]) => {
    const q = +await kv(env, `tg:${chat}:ai:${rDay}`) || 0, r = x.uid ? +await kv(env, `ai:${x.uid}:${uDay}`) || 0 : 0;
    const k = await asChat(chat, () => keyInfo(env)), pend = await getPending(env, chat);
    return {
      chat,
      appOnly: !isTgChat(chat),
      name: x.name,
      user: x.user || "",
      joined: x.joined,
      email: x.email || "",
      pending: pend || "",
      linked: !!x.uid,
      paused: !!x.paused,
      premium: premiumNow(x, now),
      premUntil: x.premUntil || null,
      premSrc: x.premSrc || null,
      supporter: !!x.supporter,
      starsPaid: x.starsPaid || 0,
      ai: Number.isFinite(x.ai) ? x.ai : DEF_AI,
      reports: Number.isFinite(x.reports) ? x.reports : DEF_REPORTS,
      usedQ: q,
      usedR: r,
      ownKey: k.has ? k.tail : null,
      lang: x.lang || ""
    };
  }));
  let log2 = [];
  try {
    log2 = JSON.parse(await kv(env, "tg:stars:log") || "[]");
  } catch (_) {
  }
  const month = new Date(now).toISOString().slice(0, 7), sum = (f) => log2.filter(f).reduce((s, x) => s + (+x.stars || 0), 0);
  const names = Object.fromEntries(Object.entries(m).map(([c, x]) => [c, x.name]));
  return {
    max: await maxMembers(env),
    maxChoices: MAX_CHOICES,
    price: price(env),
    stats: {
      members: list2.length,
      paused: list2.filter((x) => x.paused).length,
      premium: list2.filter((x) => x.premium).length,
      premiumStars: list2.filter((x) => x.premium && x.premSrc === "stars").length,
      supporters: list2.filter((x) => x.supporter).length,
      starsMonth: sum((x) => new Date(x.t).toISOString().slice(0, 7) === month),
      starsAll: sum(() => true),
      starsMonthPremium: sum((x) => x.kind === "prem" && new Date(x.t).toISOString().slice(0, 7) === month),
      starsMonthSupport: sum((x) => x.kind === "sup" && new Date(x.t).toISOString().slice(0, 7) === month)
    },
    members: list2.sort((a, b) => (b.joined || 0) - (a.joined || 0)),
    payments: log2.slice(-50).reverse().map((x) => ({ t: x.t, chat: x.chat, name: names[x.chat] || x.chat, kind: x.kind, stars: x.stars, renew: !!x.renew }))
  };
}
async function act(env, chat, op) {
  const x = await member(env, chat);
  if (!x) return { status: 404, error: "No such member." };
  const L = x.lang === "ar" ? "ar" : "en";
  if (op === "gift30" || op === "gift365") {
    const y = await addDays(env, chat, op === "gift30" ? 30 : 365), u = day2(y.premUntil);
    await tell(env, chat, `\u{1F381} Dr. Samir Saad gave you premium as a gift \u2014 until ${u}!`, `\u{1F381} Dr. Samir Saad \u0627\u062F\u0651\u0627\u0644\u0643 \u0627\u0644\u0645\u0645\u064A\u0632 \u0647\u062F\u064A\u0629 \u0644\u062D\u062F ${u}!`, L);
  } else if (op === "endPrem") {
    await revoke(env, chat);
    await tell(env, chat, "Premium is off \u2014 back to the standard limits.", "\u0627\u0644\u0639\u0636\u0648\u064A\u0629 \u0627\u0644\u0645\u0645\u064A\u0632\u0629 \u0627\u062A\u0634\u0627\u0644\u062A \u2014 \u0631\u062C\u0639\u062A \u0644\u0644\u062D\u062F\u0648\u062F \u0627\u0644\u0639\u0627\u062F\u064A\u0629.", L);
  } else if (op === "pause" || op === "resume") {
    await setMember(env, chat, { paused: op === "pause" ? true : void 0 });
    await tell(env, chat, op === "pause" ? "\u23F8 The bot is paused for you for now." : "\u25B6\uFE0F The bot is back on for you.", op === "pause" ? "\u23F8 \u0627\u0644\u0628\u0648\u062A \u0627\u062A\u0648\u0642\u0641 \u0639\u0646\u062F\u0643 \u0645\u0624\u0642\u062A\u0627\u064B." : "\u25B6\uFE0F \u0627\u0644\u0628\u0648\u062A \u0631\u062C\u0639 \u064A\u0634\u062A\u063A\u0644 \u0639\u0646\u062F\u0643.", L);
  } else if (/^(ai|rp)[+-]$/.test(op)) {
    const f = op.startsWith("ai") ? "ai" : "reports", cur = Number.isFinite(x[f]) ? x[f] : f === "ai" ? DEF_AI : DEF_REPORTS, max = f === "ai" ? 50 : 10;
    await setMember(env, chat, { [f]: Math.max(0, Math.min(max, cur + (op.endsWith("+") ? 1 : -1))) });
  } else if (op === "approve" || op === "refuse") {
    const email = await getPending(env, chat);
    if (!email) return { status: 404, error: "No request waiting." };
    await clearPending(env, chat);
    if (op === "approve") {
      await setMember(env, chat, { email });
      await syncAccess(env, await accessEmails(env)).catch(() => {
      });
      await tell(env, chat, `\u2705 You can open the app now with <b>${email}</b>.`, `\u2705 \u062A\u0642\u062F\u0631 \u062A\u0641\u062A\u062D \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u062F\u0644\u0648\u0642\u062A\u064A \u0628\u0640 <b>${email}</b>.`, L);
    } else await tell(env, chat, "Your app request was not approved.", "\u0637\u0644\u0628 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0645\u0627 \u0627\u062A\u0648\u0627\u0641\u0642\u0634 \u0639\u0644\u064A\u0647.", L);
  } else if (op === "remove") {
    const had = await removeMember(env, chat);
    if (had && had.email) await syncAccess(env, await accessEmails(env)).catch(() => {
    });
    await tell(env, chat, "Your access to this bot was removed.", "\u062A\u0645 \u0625\u064A\u0642\u0627\u0641 \u0648\u0635\u0648\u0644\u0643 \u0644\u0644\u0628\u0648\u062A.", L);
  } else return { status: 400, error: "Unknown action." };
  return { ok: true };
}
async function adminHandler2(env, who, body) {
  if (!await isOwnerAccount(env, who)) return { status: 403, error: "Only the owner can open the dashboard." };
  const a = body && body.action;
  if (a === "overview") return overview(env);
  if (a === "invite") {
    const code = await newInvite(env, String(body && body.note || "").slice(0, 40));
    return { code, link: await botLink(env, code), appLink: APP.replace(/\/?$/, "/") + "?invite=" + code, days: 7 };
  }
  if (a === "setMax") {
    if (!await setMaxMembers(env, body && body.max)) return { status: 400, error: "Pick 20, 50 or 100." };
    return overview(env);
  }
  if (a === "member") {
    const r = await act(env, String(body.chat || ""), String(body.op || ""));
    return r.ok ? { ...r, overview: await overview(env) } : r;
  }
  return { status: 400, error: "Unknown action." };
}

// guide.json
var guide_default = {
  v: 1,
  title: {
    en: "\u{1F4D8} Cute Portfolio \u2014 the guide",
    ar: "\u{1F4D8} \u062F\u0644\u064A\u0644 Cute Portfolio"
  },
  intro: {
    en: "Everything the app and the bot can do, in short steps. Tap a part to open it.",
    ar: "\u0643\u0644 \u0627\u0644\u0644\u064A \u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062C \u0648\u0627\u0644\u0628\u0648\u062A \u0628\u064A\u0639\u0645\u0644\u0648\u0647\u060C \u0628\u062E\u0637\u0648\u0627\u062A \u0642\u0635\u064A\u0631\u0629. \u0627\u0636\u063A\u0637 \u0639\u0644\u0649 \u0623\u064A \u062C\u0632\u0621 \u064A\u0641\u062A\u062D\u0644\u0643."
  },
  sections: [
    {
      k: "start",
      e: "\u{1F680}",
      t: {
        en: "Getting started",
        ar: "\u0627\u0644\u0628\u062F\u0627\u064A\u0629"
      },
      en: [
        "You join with an invite from Dr. Samir Saad \u2014 one code, two ways in:",
        "\u{1F4F1} <b>The app link</b> \u2192 sign in with Google or any e-mail (a sign-in link, no password) \u2192 <b>Start my portfolio</b>.",
        "\u{1F916} <b>The bot link</b> \u2192 you're in the bot at once; send <code>/app</code> with your e-mail to open the app too.",
        "Then link the two (see <b>Link the app and the bot</b>) so the bot sees your portfolio.",
        "Language: \u{1F310} in the bot's menu (English / \u0639\u0631\u0628\u064A); the app's AI report has its own English / \u0627\u0644\u0639\u0631\u0628\u064A\u0629 switch."
      ],
      ar: [
        "\u0628\u062A\u062F\u062E\u0644 \u0628\u062F\u0639\u0648\u0629 \u0645\u0646 Dr. Samir Saad \u2014 \u0643\u0648\u062F \u0648\u0627\u062D\u062F \u0648\u0637\u0631\u064A\u0642\u062A\u064A\u0646:",
        "\u{1F4F1} <b>\u0644\u064A\u0646\u0643 \u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062C</b> \u2190 \u0627\u062F\u062E\u0644 \u0628\u0640 Google \u0623\u0648 \u0623\u064A \u0625\u064A\u0645\u064A\u0644 (\u0644\u064A\u0646\u0643 \u062F\u062E\u0648\u0644 \u0645\u0646 \u063A\u064A\u0631 \u0628\u0627\u0633\u0648\u0631\u062F) \u2190 <b>Start my portfolio</b>.",
        "\u{1F916} <b>\u0644\u064A\u0646\u0643 \u0627\u0644\u0628\u0648\u062A</b> \u2190 \u0628\u062A\u062F\u062E\u0644 \u0627\u0644\u0628\u0648\u062A \u0639\u0644\u0649 \u0637\u0648\u0644\u061B \u0627\u0628\u0639\u062A <code>/app</code> \u0628\u0625\u064A\u0645\u064A\u0644\u0643 \u0639\u0634\u0627\u0646 \u062A\u0641\u062A\u062D \u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062C \u0643\u0645\u0627\u0646.",
        "\u0648\u0628\u0639\u062F\u064A\u0646 \u0627\u0631\u0628\u0637 \u0627\u0644\u0627\u062A\u0646\u064A\u0646 (\u0634\u0648\u0641 <b>\u0631\u0628\u0637 \u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062C \u0628\u0627\u0644\u0628\u0648\u062A</b>) \u0639\u0634\u0627\u0646 \u0627\u0644\u0628\u0648\u062A \u064A\u0634\u0648\u0641 \u0645\u062D\u0641\u0638\u062A\u0643.",
        "\u0627\u0644\u0644\u063A\u0629: \u{1F310} \u0641\u064A \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0628\u0648\u062A (English / \u0639\u0631\u0628\u064A)\u061B \u0648\u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u0640 AI \u0641\u064A \u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062C \u0644\u064A\u0647 \u0632\u0631\u0627\u0631 English / \u0627\u0644\u0639\u0631\u0628\u064A\u0629."
      ],
      b: {
        en: "Getting started",
        ar: "\u0627\u0644\u0628\u062F\u0627\u064A\u0629"
      }
    },
    {
      k: "app",
      e: "\u{1F4F1}",
      t: {
        en: "The app",
        ar: "\u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062C"
      },
      en: [
        "<b>Portfolio</b>: your coins, value, profit, charts. Add a coin with <b>+</b>, or bring trades from an exchange: Settings \u2192 Import from exchange.",
        "<b>Plan</b>: the accumulation plan (targets, DCA) and the <b>Exit Strategy</b> (take-profit steps).",
        "<b>Market Hub</b>: market cap, Fear &amp; Greed, Altcoin Season, dominance, movers.",
        "<b>AI Analysis</b> (\u{1F916} button): a full report \u2014 <i>free</i> with your Claude app (copy \u2192 paste), or a quick report here for \u2B50 premium members / your own Claude key.",
        "<b>Settings</b> (\u2699\uFE0F): backup, wallets, baseline, signals, targets, theme, install the app on your phone.",
        "Your data is private: stored in the cloud under your own account \u2014 nobody else can read it."
      ],
      ar: [
        "<b>Portfolio</b>: \u0639\u0645\u0644\u0627\u062A\u0643\u060C \u0627\u0644\u0642\u064A\u0645\u0629\u060C \u0627\u0644\u0631\u0628\u062D\u060C \u0627\u0644\u0631\u0633\u0648\u0645. \u0636\u064A\u0641 \u0639\u0645\u0644\u0629 \u0628\u0640 <b>+</b>\u060C \u0623\u0648 \u0647\u0627\u062A \u0635\u0641\u0642\u0627\u062A\u0643 \u0645\u0646 \u0645\u0646\u0635\u0629: \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u2190 Import from exchange.",
        "<b>Plan</b>: \u062E\u0637\u0629 \u0627\u0644\u062A\u062C\u0645\u064A\u0639 (\u0627\u0644\u0623\u0647\u062F\u0627\u0641 \u0648\u0627\u0644\u0640 DCA) \u0648<b>\u062E\u0637\u0629 \u0627\u0644\u062E\u0631\u0648\u062C</b> (\u0645\u0631\u0627\u062D\u0644 \u062C\u0646\u064A \u0627\u0644\u0631\u0628\u062D).",
        "<b>Market Hub</b>: \u062D\u062C\u0645 \u0627\u0644\u0633\u0648\u0642\u060C \u0627\u0644\u062E\u0648\u0641 \u0648\u0627\u0644\u0637\u0645\u0639\u060C \u0645\u0648\u0633\u0645 \u0627\u0644\u0639\u0645\u0644\u0627\u062A \u0627\u0644\u0628\u062F\u064A\u0644\u0629\u060C \u0627\u0644\u0633\u064A\u0637\u0631\u0629\u060C \u0627\u0644\u0623\u0643\u062A\u0631 \u062D\u0631\u0643\u0629.",
        "<b>AI Analysis</b> (\u0632\u0631\u0627\u0631 \u{1F916}): \u062A\u0642\u0631\u064A\u0631 \u0643\u0627\u0645\u0644 \u2014 <i>\u0645\u062C\u0627\u0646\u0627\u064B</i> \u0645\u0639 \u062A\u0637\u0628\u064A\u0642 Claude \u0628\u062A\u0627\u0639\u0643 (\u0627\u0646\u0633\u062E \u2190 \u0627\u0644\u0635\u0642)\u060C \u0623\u0648 \u062A\u0642\u0631\u064A\u0631 \u0633\u0631\u064A\u0639 \u0647\u0646\u0627 \u0644\u0644\u0623\u0639\u0636\u0627\u0621 \u0627\u0644\u0645\u0645\u064A\u0632\u064A\u0646 \u2B50 \u0623\u0648 \u0628\u0645\u0641\u062A\u0627\u062D Claude \u0628\u062A\u0627\u0639\u0643.",
        "<b>\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A</b> (\u2699\uFE0F): \u0646\u0633\u062E\u0629 \u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629\u060C \u0627\u0644\u0645\u062D\u0627\u0641\u0638\u060C \u0627\u0644\u0640 Baseline\u060C \u0627\u0644\u0625\u0634\u0627\u0631\u0627\u062A\u060C \u0627\u0644\u0623\u0647\u062F\u0627\u0641\u060C \u0627\u0644\u062B\u064A\u0645\u060C \u0648\u062A\u062B\u0628\u064A\u062A \u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062C \u0639\u0644\u0649 \u0627\u0644\u0645\u0648\u0628\u0627\u064A\u0644.",
        "\u0628\u064A\u0627\u0646\u0627\u062A\u0643 \u062E\u0627\u0635\u0629: \u0645\u062D\u0641\u0648\u0638\u0629 \u0641\u064A \u0627\u0644\u0633\u062D\u0627\u0628\u0629 \u0639\u0644\u0649 \u062D\u0633\u0627\u0628\u0643 \u0627\u0646\u062A \u0628\u0633 \u2014 \u0645\u062D\u062F\u0634 \u063A\u064A\u0631\u0643 \u064A\u0642\u062F\u0631 \u064A\u0634\u0648\u0641\u0647\u0627."
      ],
      b: {
        en: "The app",
        ar: "\u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062C"
      }
    },
    {
      k: "link",
      e: "\u{1F517}",
      t: {
        en: "Link the app and the bot",
        ar: "\u0631\u0628\u0637 \u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062C \u0628\u0627\u0644\u0628\u0648\u062A"
      },
      en: [
        "In the app: Settings \u2192 <b>Link the Telegram bot</b> \u2192 <b>Open the bot</b>. That's it \u2014 one tap.",
        "Or copy the 8-letter code and send <code>/link CODE</code> to the bot (the code works for 10 minutes).",
        "Once linked: your portfolio, plan and exit plan show in the bot \u2014 only to you \u2014 and the morning, evening and pinned messages start."
      ],
      ar: [
        "\u0641\u064A \u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062C: \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u2190 <b>Link the Telegram bot</b> \u2190 <b>Open the bot</b>. \u062E\u0644\u0627\u0635 \u2014 \u062F\u0648\u0633\u0629 \u0648\u0627\u062D\u062F\u0629.",
        "\u0623\u0648 \u0627\u0646\u0633\u062E \u0627\u0644\u0643\u0648\u062F (8 \u062D\u0631\u0648\u0641) \u0648\u0627\u0628\u0639\u062A \u0644\u0644\u0628\u0648\u062A <code>/link CODE</code> (\u0627\u0644\u0643\u0648\u062F \u0634\u063A\u0627\u0644 10 \u062F\u0642\u0627\u064A\u0642).",
        "\u0628\u0639\u062F \u0627\u0644\u0631\u0628\u0637: \u0645\u062D\u0641\u0638\u062A\u0643 \u0648\u062E\u0637\u062A\u0643 \u0648\u062E\u0637\u0629 \u0627\u0644\u062E\u0631\u0648\u062C \u0628\u062A\u0638\u0647\u0631 \u0641\u064A \u0627\u0644\u0628\u0648\u062A \u2014 \u0644\u064A\u0643 \u0627\u0646\u062A \u0628\u0633 \u2014 \u0648\u0627\u0644\u0635\u0628\u0627\u062D \u0648\u0627\u0644\u0645\u0633\u0627\u0621 \u0648\u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u0645\u062A\u062B\u0628\u062A\u0629 \u0628\u064A\u0634\u062A\u063A\u0644\u0648\u0627."
      ],
      b: {
        en: "Linking",
        ar: "\u0627\u0644\u0631\u0628\u0637"
      }
    },
    {
      k: "ask",
      e: "\u{1F9E0}",
      t: {
        en: "Ask anything",
        ar: "\u0627\u0633\u0623\u0644 \u0623\u064A \u062D\u0627\u062C\u0629"
      },
      en: [
        "Write to the bot in plain words, English or Arabic \u2014 it answers with live data:",
        "\u2022 <i>How is my portfolio today?</i>",
        "\u2022 <i>Is SOL a good buy now?</i>",
        "\u2022 <i>What if BTC hits 150k?</i>",
        "\u2022 <i>What if I sell half my ETH?</i>",
        "Each answer says where its numbers came from, and how many questions you have left today (5 a day; \u2B50 premium 20).",
        "<code>/new</code> starts a fresh chat (the bot forgets the last messages)."
      ],
      ar: [
        "\u0627\u0643\u062A\u0628 \u0644\u0644\u0628\u0648\u062A \u0639\u0627\u062F\u064A\u060C \u0639\u0631\u0628\u064A \u0623\u0648 \u0625\u0646\u062C\u0644\u064A\u0632\u064A \u2014 \u0628\u064A\u0631\u062F \u0628\u0623\u0631\u0642\u0627\u0645 \u0644\u062D\u0638\u064A\u0629:",
        "\u2022 <i>\u0645\u062D\u0641\u0638\u062A\u064A \u0639\u0627\u0645\u0644\u0629 \u0625\u064A\u0647 \u0627\u0644\u0646\u0647\u0627\u0631\u062F\u0647\u061F</i>",
        "\u2022 <i>SOL \u064A\u0646\u0641\u0639 \u0623\u0634\u062A\u0631\u064A \u062F\u0644\u0648\u0642\u062A\u064A\u061F</i>",
        "\u2022 <i>\u0644\u0648 BTC \u0648\u0635\u0644 150 \u0623\u0644\u0641\u061F</i>",
        "\u2022 <i>\u0644\u0648 \u0628\u0639\u062A \u0646\u0635 \u0627\u0644\u0640 ETH\u061F</i>",
        "\u0643\u0644 \u0631\u062F \u0628\u064A\u0642\u0648\u0644 \u0627\u0644\u0623\u0631\u0642\u0627\u0645 \u062C\u0627\u064A\u0629 \u0645\u0646\u064A\u0646\u060C \u0648\u0641\u0627\u0636\u0644\u0643 \u0643\u0627\u0645 \u0633\u0624\u0627\u0644 \u0627\u0644\u0646\u0647\u0627\u0631\u062F\u0647 (5 \u0641\u064A \u0627\u0644\u064A\u0648\u0645\u061B \u0627\u0644\u0645\u0645\u064A\u0632 \u2B50 20).",
        "<code>/new</code> \u064A\u0628\u062F\u0623 \u0645\u062D\u0627\u062F\u062B\u0629 \u062C\u062F\u064A\u062F\u0629 (\u0627\u0644\u0628\u0648\u062A \u064A\u0646\u0633\u0649 \u0622\u062E\u0631 \u0627\u0644\u0631\u0633\u0627\u064A\u0644)."
      ],
      b: {
        en: "Ask anything",
        ar: "\u0627\u0633\u0623\u0644 \u0623\u064A \u062D\u0627\u062C\u0629"
      }
    },
    {
      k: "voice",
      e: "\u{1F399}",
      t: {
        en: "Voice notes",
        ar: "\u0627\u0644\u0631\u0633\u0627\u064A\u0644 \u0627\u0644\u0635\u0648\u062A\u064A\u0629"
      },
      en: [
        "Hold the \u{1F399} in Telegram and just talk \u2014 Arabic or English. The bot shows <i>I heard: \u2026</i> and answers as if you typed it.",
        "Voice notes are for \u2B50 premium members (or with your own Claude key). Up to 2 minutes each."
      ],
      ar: [
        "\u062F\u0648\u0633 \u0639\u0644\u0649 \u{1F399} \u0641\u064A \u062A\u0644\u062C\u0631\u0627\u0645 \u0648\u0627\u062A\u0643\u0644\u0645 \u2014 \u0639\u0631\u0628\u064A \u0623\u0648 \u0625\u0646\u062C\u0644\u064A\u0632\u064A. \u0627\u0644\u0628\u0648\u062A \u0628\u064A\u0643\u062A\u0628 <i>I heard: \u2026</i> \u0648\u0628\u064A\u0631\u062F \u0643\u0623\u0646\u0643 \u0643\u062A\u0628\u062A.",
        "\u0627\u0644\u0631\u0633\u0627\u064A\u0644 \u0627\u0644\u0635\u0648\u062A\u064A\u0629 \u0644\u0644\u0623\u0639\u0636\u0627\u0621 \u0627\u0644\u0645\u0645\u064A\u0632\u064A\u0646 \u2B50 (\u0623\u0648 \u0628\u0645\u0641\u062A\u0627\u062D Claude \u0628\u062A\u0627\u0639\u0643). \u0644\u062D\u062F \u062F\u0642\u064A\u0642\u062A\u064A\u0646 \u0644\u0644\u0631\u0633\u0627\u0644\u0629."
      ],
      b: {
        en: "Voice notes",
        ar: "\u0627\u0644\u0635\u0648\u062A"
      }
    },
    {
      k: "coins",
      e: "\u{1FA99}",
      t: {
        en: "Coins and the market",
        ar: "\u0627\u0644\u0639\u0645\u0644\u0627\u062A \u0648\u0627\u0644\u0633\u0648\u0642"
      },
      en: [
        "Send a ticker \u2014 <code>btc</code>, <code>sol eth</code> \u2014 for the live price, trend, futures and funding.",
        "Buttons / commands: <code>/market</code> (BTC, dominance, Fear &amp; Greed, ETF), <code>/movers</code> (best &amp; worst), <code>/signals</code> (hold / add / sell for your coins), <code>/portfolio</code>, <code>/plan</code>, <code>/exit</code>.",
        "\u{1F504} on any message refreshes it in place."
      ],
      ar: [
        "\u0627\u0628\u0639\u062A \u0631\u0645\u0632 \u0627\u0644\u0639\u0645\u0644\u0629 \u2014 <code>btc</code>\u060C <code>sol eth</code> \u2014 \u0644\u0644\u0633\u0639\u0631 \u0627\u0644\u0644\u062D\u0638\u064A \u0648\u0627\u0644\u0627\u062A\u062C\u0627\u0647 \u0648\u0627\u0644\u0639\u0642\u0648\u062F \u0648\u0627\u0644\u0640 funding.",
        "\u0627\u0644\u0623\u0632\u0631\u0627\u0631 \u0648\u0627\u0644\u0623\u0648\u0627\u0645\u0631: <code>/market</code> (BTC\u060C \u0627\u0644\u0633\u064A\u0637\u0631\u0629\u060C \u0627\u0644\u062E\u0648\u0641 \u0648\u0627\u0644\u0637\u0645\u0639\u060C \u0627\u0644\u0640 ETF)\u060C <code>/movers</code> (\u0627\u0644\u0623\u0641\u0636\u0644 \u0648\u0627\u0644\u0623\u0633\u0648\u0623)\u060C <code>/signals</code> (\u0627\u062D\u062A\u0641\u0638 / \u0632\u0648\u0651\u062F / \u0628\u064A\u0639 \u0644\u0639\u0645\u0644\u0627\u062A\u0643)\u060C <code>/portfolio</code>\u060C <code>/plan</code>\u060C <code>/exit</code>.",
        "\u{1F504} \u0639\u0644\u0649 \u0623\u064A \u0631\u0633\u0627\u0644\u0629 \u0628\u064A\u062D\u062F\u0651\u062B\u0647\u0627 \u0645\u0643\u0627\u0646\u0647\u0627."
      ],
      b: {
        en: "Coins & market",
        ar: "\u0627\u0644\u0639\u0645\u0644\u0627\u062A \u0648\u0627\u0644\u0633\u0648\u0642"
      }
    },
    {
      k: "alerts",
      e: "\u{1F514}",
      t: {
        en: "Alerts in words",
        ar: "\u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0628\u0627\u0644\u0643\u0644\u0627\u0645"
      },
      en: [
        "Just say it: <i>tell me if ETH drops below 3000</i> \xB7 <i>alert me if SOL is up 10% in a day</i> \xB7 <i>if my portfolio passes $30k</i>.",
        "Checked every 5 minutes; each alert fires once. <code>/alerts</code> lists them, \u{1F5D1} removes one."
      ],
      ar: [
        "\u0642\u0648\u0644\u0647\u0627 \u0639\u0627\u062F\u064A: <i>\u0646\u0628\u0651\u0647\u0646\u064A \u0644\u0648 ETH \u0646\u0632\u0644 \u062A\u062D\u062A 3000</i> \xB7 <i>\u0646\u0628\u0651\u0647\u0646\u064A \u0644\u0648 SOL \u0637\u0644\u0639 10% \u0641\u064A \u064A\u0648\u0645</i> \xB7 <i>\u0644\u0648 \u0645\u062D\u0641\u0638\u062A\u064A \u0639\u062F\u0651\u062A 30 \u0623\u0644\u0641 \u062F\u0648\u0644\u0627\u0631</i>.",
        "\u0628\u064A\u062A\u0634\u064A\u0651\u0643 \u0643\u0644 5 \u062F\u0642\u0627\u064A\u0642\u060C \u0648\u0643\u0644 \u062A\u0646\u0628\u064A\u0647 \u0628\u064A\u062A\u0628\u0639\u062A \u0645\u0631\u0629 \u0648\u0627\u062D\u062F\u0629. <code>/alerts</code> \u0628\u064A\u0639\u0631\u0636\u0647\u0645\u060C \u0648\u{1F5D1} \u064A\u0645\u0633\u062D \u0648\u0627\u062D\u062F."
      ],
      b: {
        en: "Alerts",
        ar: "\u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A"
      }
    },
    {
      k: "trades",
      e: "\u{1F9FE}",
      t: {
        en: "Record a trade in words",
        ar: "\u0633\u062C\u0651\u0644 \u0635\u0641\u0642\u0629 \u0628\u0627\u0644\u0643\u0644\u0627\u0645"
      },
      en: [
        "Write <i>bought 0.01 BTC at 95k</i> or <i>sold 5 SOL at 180</i> \u2014 the bot shows what will change (amount, average, profit).",
        "Nothing is saved until you tap <b>\u2705 Confirm</b> (15 minutes). Then it's in your app too."
      ],
      ar: [
        "\u0627\u0643\u062A\u0628 <i>\u0627\u0634\u062A\u0631\u064A\u062A 0.01 BTC \u0628\u0640 95 \u0623\u0644\u0641</i> \u0623\u0648 <i>\u0628\u0639\u062A 5 SOL \u0628\u0640 180</i> \u2014 \u0627\u0644\u0628\u0648\u062A \u0628\u064A\u0648\u0631\u064A\u0643 \u0627\u0644\u0644\u064A \u0647\u064A\u062A\u063A\u064A\u0631 (\u0627\u0644\u0643\u0645\u064A\u0629\u060C \u0627\u0644\u0645\u062A\u0648\u0633\u0637\u060C \u0627\u0644\u0631\u0628\u062D).",
        "\u0645\u0641\u064A\u0634 \u062D\u0627\u062C\u0629 \u0628\u062A\u062A\u062D\u0641\u0638 \u063A\u064A\u0631 \u0644\u0645\u0627 \u062A\u062F\u0648\u0633 <b>\u2705 Confirm</b> (\u062E\u0644\u0627\u0644 15 \u062F\u0642\u064A\u0642\u0629). \u0648\u0628\u0639\u062F\u0647\u0627 \u0628\u062A\u0628\u0627\u0646 \u0641\u064A \u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062C \u0643\u0645\u0627\u0646."
      ],
      b: {
        en: "Record a trade",
        ar: "\u0633\u062C\u0651\u0644 \u0635\u0641\u0642\u0629"
      }
    },
    {
      k: "daily",
      e: "\u{1F5D3}",
      t: {
        en: "Daily messages and radars",
        ar: "\u0627\u0644\u0631\u0633\u0627\u064A\u0644 \u0627\u0644\u064A\u0648\u0645\u064A\u0629 \u0648\u0627\u0644\u0631\u0627\u062F\u0627\u0631\u0627\u062A"
      },
      en: [
        "\u2600\uFE0F <b>Smart morning</b> (08:45 Riyadh): 3 things to do today. \u{1F319} <b>Smart evening</b> (21:00): what happened and what to watch.",
        "\u{1F9F2} <b>Leverage radar</b>: crowded longs / shorts on BTC and your biggest coins. \u{1F525} <b>Sector radar</b>: a big sector moving fast.",
        "\u{1F4CC} <b>Live pinned message</b> at the top of the chat (every 15 min). <code>/pin</code> brings it back, <code>/unpin</code> removes it.",
        "<code>/daily</code> switches each one on or off."
      ],
      ar: [
        "\u2600\uFE0F <b>\u0627\u0644\u0635\u0628\u0627\u062D \u0627\u0644\u0630\u0643\u064A</b> (8:45 \u0628\u062A\u0648\u0642\u064A\u062A \u0627\u0644\u0631\u064A\u0627\u0636): 3 \u062D\u0627\u062C\u0627\u062A \u062A\u0639\u0645\u0644\u0647\u0627 \u0627\u0644\u0646\u0647\u0627\u0631\u062F\u0647. \u{1F319} <b>\u0627\u0644\u0645\u0633\u0627\u0621 \u0627\u0644\u0630\u0643\u064A</b> (9 \u0628\u0627\u0644\u0644\u064A\u0644): \u0627\u0644\u0644\u064A \u062D\u0635\u0644 \u0648\u062A\u0631\u0627\u0642\u0628 \u0625\u064A\u0647.",
        "\u{1F9F2} <b>\u0631\u0627\u062F\u0627\u0631 \u0627\u0644\u0631\u0627\u0641\u0639\u0629</b>: \u0632\u062D\u0645\u0629 \u0644\u0648\u0646\u062C \u0623\u0648 \u0634\u0648\u0631\u062A \u0639\u0644\u0649 BTC \u0648\u0623\u0643\u0628\u0631 \u0639\u0645\u0644\u0627\u062A\u0643. \u{1F525} <b>\u0631\u0627\u062F\u0627\u0631 \u0627\u0644\u0642\u0637\u0627\u0639\u0627\u062A</b>: \u0642\u0637\u0627\u0639 \u0643\u0628\u064A\u0631 \u0628\u064A\u062A\u062D\u0631\u0643 \u0628\u0633\u0631\u0639\u0629.",
        "\u{1F4CC} <b>\u0631\u0633\u0627\u0644\u0629 \u0645\u062A\u062B\u0628\u062A\u0629 \u0645\u0628\u0627\u0634\u0631\u0629</b> \u0641\u0648\u0642 \u0627\u0644\u0634\u0627\u062A (\u0643\u0644 15 \u062F\u0642\u064A\u0642\u0629). <code>/pin</code> \u064A\u0631\u062C\u0651\u0639\u0647\u0627\u060C \u0648<code>/unpin</code> \u064A\u0634\u064A\u0644\u0647\u0627.",
        "<code>/daily</code> \u0628\u064A\u0634\u063A\u0651\u0644 \u0623\u0648 \u064A\u0642\u0641\u0644 \u0643\u0644 \u0648\u0627\u062D\u062F\u0629."
      ],
      b: {
        en: "Daily & radars",
        ar: "\u0627\u0644\u064A\u0648\u0645\u064A \u0648\u0627\u0644\u0631\u0627\u062F\u0627\u0631\u0627\u062A"
      }
    },
    {
      k: "paper",
      e: "\u{1F9EA}",
      t: {
        en: "Paper trading",
        ar: "\u0627\u0644\u062A\u062F\u0627\u0648\u0644 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A"
      },
      en: [
        "Practice with pretend money at real prices: <code>/paper</code> \u2192 pick $1k / $10k / $100k.",
        "Say <i>paper buy 0.1 BTC</i> or <i>paper sell half SOL</i>. \u21A9\uFE0F undoes the last one. You see how you'd do against simply holding BTC."
      ],
      ar: [
        "\u0627\u062A\u0645\u0631\u0651\u0646 \u0628\u0641\u0644\u0648\u0633 \u0648\u0647\u0645\u064A\u0629 \u0628\u0623\u0633\u0639\u0627\u0631 \u062D\u0642\u064A\u0642\u064A\u0629: <code>/paper</code> \u2190 \u0627\u062E\u062A\u0627\u0631 $1k / $10k / $100k.",
        "\u0642\u0648\u0644 <i>\u062A\u062C\u0631\u064A\u0628\u064A \u0627\u0634\u062A\u0631\u064A 0.1 BTC</i> \u0623\u0648 <i>\u062A\u062C\u0631\u064A\u0628\u064A \u0628\u064A\u0639 \u0646\u0635 SOL</i>. \u21A9\uFE0F \u064A\u0644\u063A\u064A \u0622\u062E\u0631 \u0648\u0627\u062D\u062F\u0629. \u0648\u0628\u062A\u0634\u0648\u0641 \u0646\u062A\u064A\u062C\u062A\u0643 \u0645\u0642\u0627\u0631\u0646\u0629 \u0628\u0625\u0646\u0643 \u062A\u062D\u062A\u0641\u0638 \u0628\u0640 BTC \u0628\u0633."
      ],
      b: {
        en: "Paper trading",
        ar: "\u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A"
      }
    },
    {
      k: "report",
      e: "\u{1F4CA}",
      t: {
        en: "Full report and image cards",
        ar: "\u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u0643\u0627\u0645\u0644 \u0648\u0643\u0631\u0648\u062A \u0627\u0644\u0635\u0648\u0631"
      },
      en: [
        "\u{1F4CA} <b>Report</b> (in the menu, or <code>/report</code>) opens a page inside Telegram: value, coins, plan, exit, market, paper, alerts.",
        `\u{1F4F8} on a card makes a share-ready image (portfolio, a coin, the market) \u2014 with "hide $" if you'd rather not show amounts.`
      ],
      ar: [
        "\u{1F4CA} <b>Report</b> (\u0641\u064A \u0627\u0644\u0642\u0627\u0626\u0645\u0629\u060C \u0623\u0648 <code>/report</code>) \u0628\u064A\u0641\u062A\u062D \u0635\u0641\u062D\u0629 \u062C\u0648\u0647 \u062A\u0644\u062C\u0631\u0627\u0645: \u0627\u0644\u0642\u064A\u0645\u0629\u060C \u0627\u0644\u0639\u0645\u0644\u0627\u062A\u060C \u0627\u0644\u062E\u0637\u0629\u060C \u0627\u0644\u062E\u0631\u0648\u062C\u060C \u0627\u0644\u0633\u0648\u0642\u060C \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A\u060C \u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A.",
        '\u{1F4F8} \u0639\u0644\u0649 \u0623\u064A \u0643\u0627\u0631\u062A \u0628\u064A\u0639\u0645\u0644 \u0635\u0648\u0631\u0629 \u062C\u0627\u0647\u0632\u0629 \u0644\u0644\u0645\u0634\u0627\u0631\u0643\u0629 (\u0627\u0644\u0645\u062D\u0641\u0638\u0629\u060C \u0639\u0645\u0644\u0629\u060C \u0627\u0644\u0633\u0648\u0642) \u2014 \u0648\u0645\u0639\u0627\u0647\u0627 "\u0625\u062E\u0641\u0627\u0621 $" \u0644\u0648 \u0645\u0634 \u0639\u0627\u064A\u0632 \u062A\u0628\u064A\u0651\u0646 \u0627\u0644\u0645\u0628\u0627\u0644\u063A.'
      ],
      b: {
        en: "Report & cards",
        ar: "\u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u0648\u0627\u0644\u0643\u0631\u0648\u062A"
      }
    },
    {
      k: "premium",
      e: "\u2B50",
      t: {
        en: "Premium and support",
        ar: "\u0627\u0644\u0645\u0645\u064A\u0632 \u0648\u0627\u0644\u062F\u0639\u0645"
      },
      en: [
        "Everything stays free. \u2B50 <b>Premium</b> adds voice notes, 20 AI questions and 3 quick AI reports a day \u2014 <code>/premium</code> (350 Telegram Stars a month, renews by itself, cancel any time in Telegram \u2192 Settings \u2192 My Stars).",
        "\u{1F49B} <b>Support</b> is optional: a one-time thank-you of 50\u2013500 Stars \u2014 <code>/support</code> \u2014 and a Supporter \u{1F49B} badge.",
        "Why it costs anything: the AI is paid per question; this only covers that. Cute Portfolio is non-profit."
      ],
      ar: [
        "\u0643\u0644 \u062D\u0627\u062C\u0629 \u0628\u062A\u0641\u0636\u0644 \u0645\u062C\u0627\u0646\u064A\u0629. \u2B50 <b>\u0627\u0644\u0645\u0645\u064A\u0632</b> \u0628\u064A\u0632\u0648\u0651\u062F \u0627\u0644\u0631\u0633\u0627\u064A\u0644 \u0627\u0644\u0635\u0648\u062A\u064A\u0629\u060C \u064820 \u0633\u0624\u0627\u0644 AI\u060C \u06483 \u062A\u0642\u0627\u0631\u064A\u0631 \u0633\u0631\u064A\u0639\u0629 \u0641\u064A \u0627\u0644\u064A\u0648\u0645 \u2014 <code>/premium</code> (350 Telegram Stars \u0641\u064A \u0627\u0644\u0634\u0647\u0631\u060C \u0628\u064A\u062A\u062C\u062F\u062F \u0644\u0648\u062D\u062F\u0647\u060C \u0648\u062A\u0644\u063A\u064A\u0647 \u0641\u064A \u0623\u064A \u0648\u0642\u062A \u0645\u0646 \u062A\u0644\u062C\u0631\u0627\u0645 \u2190 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u2190 My Stars).",
        "\u{1F49B} <b>\u0627\u0644\u062F\u0639\u0645</b> \u0627\u062E\u062A\u064A\u0627\u0631\u064A: \u0634\u0643\u0631 \u0644\u0645\u0631\u0629 \u0648\u0627\u062D\u062F\u0629 \u0645\u0646 50 \u0644\u0640 500 Star \u2014 <code>/support</code> \u2014 \u0648\u0648\u0633\u0627\u0645 Supporter \u{1F49B}.",
        "\u0644\u064A\u0647 \u0628\u0641\u0644\u0648\u0633 \u0623\u0635\u0644\u0627\u064B: \u0627\u0644\u0640 AI \u0628\u064A\u062A\u062D\u0627\u0633\u0628 \u0639\u0644\u0649 \u0643\u0644 \u0633\u0624\u0627\u0644\u060C \u0648\u062F\u0647 \u0628\u064A\u063A\u0637\u064A \u0627\u0644\u062A\u0643\u0644\u0641\u0629 \u062F\u064A \u0628\u0633. Cute Portfolio \u0645\u0634 \u0647\u0627\u062F\u0641 \u0644\u0644\u0631\u0628\u062D."
      ],
      b: {
        en: "Premium & support",
        ar: "\u0627\u0644\u0645\u0645\u064A\u0632 \u0648\u0627\u0644\u062F\u0639\u0645"
      }
    },
    {
      k: "key",
      e: "\u{1F511}",
      t: {
        en: "Your own Claude key",
        ar: "\u0645\u0641\u062A\u0627\u062D Claude \u0628\u062A\u0627\u0639\u0643"
      },
      en: [
        "Have an Anthropic API key? App \u2192 Settings \u2192 <b>My Claude key</b>. It's checked, then kept encrypted \u2014 nobody can see it again.",
        "With it: 100 questions a day, voice notes and 10 quick AI reports \u2014 billed to your own Anthropic account. Remove it any time."
      ],
      ar: [
        "\u0645\u0639\u0627\u0643 \u0645\u0641\u062A\u0627\u062D Anthropic API\u061F \u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062C \u2190 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u2190 <b>My Claude key</b>. \u0628\u064A\u062A\u0623\u0643\u062F \u0645\u0646\u0647\u060C \u0648\u0628\u0639\u062F\u064A\u0646 \u0628\u064A\u062A\u062E\u0632\u0646 \u0645\u062A\u0634\u0641\u0651\u0631 \u2014 \u0645\u062D\u062F\u0634 \u064A\u0642\u062F\u0631 \u064A\u0634\u0648\u0641\u0647 \u062A\u0627\u0646\u064A.",
        "\u0628\u064A\u0647: 100 \u0633\u0624\u0627\u0644 \u0641\u064A \u0627\u0644\u064A\u0648\u0645\u060C \u0648\u0627\u0644\u0631\u0633\u0627\u064A\u0644 \u0627\u0644\u0635\u0648\u062A\u064A\u0629\u060C \u064810 \u062A\u0642\u0627\u0631\u064A\u0631 \u0633\u0631\u064A\u0639\u0629 \u2014 \u0639\u0644\u0649 \u062D\u0633\u0627\u0628\u0643 \u0627\u0646\u062A \u0641\u064A Anthropic. \u0648\u062A\u0642\u062F\u0631 \u062A\u0634\u064A\u0644\u0647 \u0641\u064A \u0623\u064A \u0648\u0642\u062A."
      ],
      b: {
        en: "Claude key",
        ar: "\u0645\u0641\u062A\u0627\u062D Claude"
      }
    },
    {
      k: "privacy",
      e: "\u{1F512}",
      t: {
        en: "Privacy and your data",
        ar: "\u0627\u0644\u062E\u0635\u0648\u0635\u064A\u0629 \u0648\u0628\u064A\u0627\u0646\u0627\u062A\u0643"
      },
      en: [
        "Your portfolio is yours alone \u2014 the bot reads it only for you, never for anyone else.",
        "<code>/forget</code> deletes everything the bot keeps about you (alerts, chat memory, settings, the link) \u2014 your app portfolio stays.",
        "To keep things fair, the bot takes up to 20 messages a minute."
      ],
      ar: [
        "\u0645\u062D\u0641\u0638\u062A\u0643 \u0644\u064A\u0643 \u0627\u0646\u062A \u0628\u0633 \u2014 \u0627\u0644\u0628\u0648\u062A \u0628\u064A\u0642\u0631\u0627\u0647\u0627 \u0639\u0634\u0627\u0646\u0643 \u0627\u0646\u062A\u060C \u0648\u0644\u0627 \u0644\u062D\u062F \u062A\u0627\u0646\u064A \u0623\u0628\u062F\u0627\u064B.",
        "<code>/forget</code> \u0628\u064A\u0645\u0633\u062D \u0643\u0644 \u062D\u0627\u062C\u0629 \u0627\u0644\u0628\u0648\u062A \u0634\u0627\u064A\u0644\u0647\u0627 \u0639\u0646\u0643 (\u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A\u060C \u0630\u0627\u0643\u0631\u0629 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629\u060C \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A\u060C \u0627\u0644\u0631\u0628\u0637) \u2014 \u0648\u0645\u062D\u0641\u0638\u062A\u0643 \u0641\u064A \u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062C \u0628\u062A\u0641\u0636\u0644 \u0632\u064A \u0645\u0627 \u0647\u064A.",
        "\u0639\u0634\u0627\u0646 \u0627\u0644\u0639\u062F\u0644 \u0644\u0644\u0643\u0644\u060C \u0627\u0644\u0628\u0648\u062A \u0628\u064A\u0627\u062E\u062F \u0644\u062D\u062F 20 \u0631\u0633\u0627\u0644\u0629 \u0641\u064A \u0627\u0644\u062F\u0642\u064A\u0642\u0629."
      ],
      b: {
        en: "Privacy",
        ar: "\u0627\u0644\u062E\u0635\u0648\u0635\u064A\u0629"
      }
    },
    {
      k: "help",
      e: "\u{1F4AC}",
      t: {
        en: "Help",
        ar: "\u0627\u0644\u0645\u0633\u0627\u0639\u062F\u0629"
      },
      en: [
        "Stuck? Ask the bot in plain words \u2014 <i>how do I add a coin?</i> \u2014 or write to Dr. Samir Saad.",
        "<code>/guide</code> opens this guide again any time; in the app: Settings \u2192 Guide."
      ],
      ar: [
        "\u0648\u0642\u0641\u062A \u0641\u064A \u062D\u0627\u062C\u0629\u061F \u0627\u0633\u0623\u0644 \u0627\u0644\u0628\u0648\u062A \u0639\u0627\u062F\u064A \u2014 <i>\u0625\u0632\u0627\u064A \u0623\u0636\u064A\u0641 \u0639\u0645\u0644\u0629\u061F</i> \u2014 \u0623\u0648 \u0643\u0644\u0651\u0645 Dr. Samir Saad.",
        "<code>/guide</code> \u064A\u0641\u062A\u062D \u0627\u0644\u062F\u0644\u064A\u0644 \u062F\u0647 \u062A\u0627\u0646\u064A \u0641\u064A \u0623\u064A \u0648\u0642\u062A\u061B \u0648\u0641\u064A \u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062C: \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u2190 Guide."
      ],
      b: {
        en: "Help",
        ar: "\u0627\u0644\u0645\u0633\u0627\u0639\u062F\u0629"
      }
    }
  ]
};

// tools/worker/community.mjs
var KEY = "tg:community";
async function tg3(env, method, body) {
  let r = await tg1(env, method, body);
  if (r && r.error_code === 429) {
    const w = Math.min(15, r.parameters && r.parameters.retry_after || 3);
    await new Promise((z) => setTimeout(z, w * 1e3));
    r = await tg1(env, method, body);
  }
  return r;
}
async function tg1(env, method, body) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return await r.json();
  } catch (_) {
    return { ok: false };
  }
}
async function getCommunity(env) {
  try {
    return JSON.parse(env.RATE && await env.RATE.get(KEY) || "{}") || {};
  } catch (_) {
    return {};
  }
}
async function putCommunity(env, c) {
  try {
    if (env.RATE) await env.RATE.put(KEY, JSON.stringify(c));
  } catch (_) {
  }
}
var owner = (env) => String(env.TELEGRAM_CHAT_ID);
var say = (env, text) => tg3(env, "sendMessage", { chat_id: owner(env), text, parse_mode: "HTML", disable_web_page_preview: true });
var TOPICS = [
  ["chat", "\u{1F4AC} Chat \xB7 \u062F\u0631\u062F\u0634\u0629", 7322096],
  ["ideas", "\u{1F4A1} Suggestions \xB7 \u0627\u0642\u062A\u0631\u0627\u062D\u0627\u062A", 16766590],
  ["bugs", "\u{1F41E} Bugs & notes \xB7 \u0645\u0644\u0627\u062D\u0638\u0627\u062A", 16478047],
  ["guide", "\u{1F4D8} Guide \xB7 \u0627\u0644\u062F\u0644\u064A\u0644", 9367192],
  ["updates", "\u{1F6E0} Updates \xB7 \u0627\u0644\u062A\u062D\u062F\u064A\u062B\u0627\u062A", 13338331]
];
var NOTE = { en: "Not financial advice \u2014 for information only.", ar: "\u0645\u0634 \u0646\u0635\u064A\u062D\u0629 \u0645\u0627\u0644\u064A\u0629 \u2014 \u0644\u0644\u0645\u0639\u0644\u0648\u0645\u0629 \u0628\u0633." };
async function onMyChatMember(env, u) {
  const m = u.my_chat_member, chat = m && m.chat;
  if (!chat) return;
  const by = String(m.from && m.from.id), isAdmin = m.new_chat_member && m.new_chat_member.status === "administrator";
  const gone = m.new_chat_member && ["left", "kicked"].includes(m.new_chat_member.status);
  if (chat.type === "private") return;
  if (by !== owner(env) && !gone) {
    await tg3(env, "leaveChat", { chat_id: chat.id });
    return;
  }
  const c = await getCommunity(env), kind = chat.type === "channel" ? "channel" : "group";
  if (gone) {
    if (c[kind] && String(c[kind].id) === String(chat.id)) {
      delete c[kind];
      await putCommunity(env, c);
      await say(env, `\u2139\uFE0F The bot left ${esc(chat.title || "")}.`);
    }
    return;
  }
  if (!isAdmin) {
    await say(env, `\u2139\uFE0F I'm in <b>${esc(chat.title || "")}</b> \u2014 make me an <b>admin</b> there to finish the setup.`);
    return;
  }
  c[kind] = { id: chat.id, title: chat.title || "", at: Date.now() };
  await putCommunity(env, c);
  await setup(env, kind);
}
async function registerForward(env, msg) {
  const o = msg.forward_origin, ch = o && (o.chat || o.sender_chat) || msg.forward_from_chat;
  if (!ch || !ch.id) return false;
  const me = await tg3(env, "getMe", {}), st = me.ok ? await tg3(env, "getChatMember", { chat_id: ch.id, user_id: me.result.id }) : null;
  if (!st || !st.ok || st.result.status !== "administrator") {
    await say(env, `\u2139\uFE0F I'm not an admin in <b>${esc(ch.title || "")}</b> yet \u2014 add me as admin there first.`);
    return true;
  }
  const c = await getCommunity(env), kind = ch.type === "channel" ? "channel" : "group";
  c[kind] = { ...c[kind] && String(c[kind].id) === String(ch.id) ? c[kind] : {}, id: ch.id, title: ch.title || "", at: Date.now() };
  await putCommunity(env, c);
  await setup(env, kind);
  return true;
}
async function setup(env, kind, opt = {}) {
  const c = await getCommunity(env), x = c[kind];
  if (!x) return { ok: false };
  if (opt.reguide) x.reguide = true;
  const notes = [];
  const link = await tg3(env, "createChatInviteLink", { chat_id: x.id, name: "Cute Portfolio members", creates_join_request: true });
  if (link.ok) x.link = link.result.invite_link;
  else notes.push('\u26A0\uFE0F No join link \u2014 give me "Invite users via link".');
  if (kind === "group" && !x.v2) {
    if (x.guidePosted === true) x.guidePosted = 14;
    x.helloPosted = false;
    x.v2 = true;
  }
  if (kind === "group" && x.reguide) {
    x.guidePosted = -1;
    delete x.reguide;
  }
  if (kind === "group") {
    const info = await tg3(env, "getChat", { chat_id: x.id });
    if (info.ok && info.result.is_forum) {
      x.topics = x.topics || {};
      for (const [k, name, color] of TOPICS) {
        if (x.topics[k]) continue;
        const r = await tg3(env, "createForumTopic", { chat_id: x.id, name, icon_color: color });
        if (r.ok) x.topics[k] = r.result.message_thread_id;
        else {
          notes.push('\u26A0\uFE0F Topics not made \u2014 give me "Manage topics".');
          break;
        }
      }
      if (x.topics.chat && !x.helloPosted) {
        const hr = await tg3(env, "sendMessage", { chat_id: x.id, message_thread_id: x.topics.chat, parse_mode: "HTML", text: "\u{1F44B} <b>Welcome to the Cute Portfolio community!</b>\nChat here \xB7 ideas in \u{1F4A1} \xB7 problems in \u{1F41E} \xB7 how-to in \u{1F4D8} \xB7 news in \u{1F6E0}.\n\n\u{1F44B} <b>\u0623\u0647\u0644\u0627\u064B \u0628\u064A\u0643\u0645 \u0641\u064A \u0645\u062C\u062A\u0645\u0639 Cute Portfolio!</b>\n\u0627\u0644\u062F\u0631\u062F\u0634\u0629 \u0647\u0646\u0627 \xB7 \u0627\u0644\u0623\u0641\u0643\u0627\u0631 \u0641\u064A \u{1F4A1} \xB7 \u0627\u0644\u0645\u0634\u0627\u0643\u0644 \u0641\u064A \u{1F41E} \xB7 \u0627\u0644\u0634\u0631\u062D \u0641\u064A \u{1F4D8} \xB7 \u0627\u0644\u062C\u062F\u064A\u062F \u0641\u064A \u{1F6E0}." });
        x.helloPosted = !!(hr && hr.ok);
        if (!x.helloPosted) notes.push("\u26A0\uFE0F The welcome in \u{1F4AC} Chat didn't go \u2014 send /community setup in a minute.");
      }
      if (x.topics.guide && x.guidePosted !== true) {
        const done = await postGuide(env, x);
        x.guidePosted = done === true ? true : done;
        if (done !== true) notes.push(`\u26A0\uFE0F The guide stopped at part ${done + 1} (Telegram's limit) \u2014 send /community setup in a minute to finish it.`);
      }
      if (x.guidePosted === true && !x.guideSig) x.guideSig = guideSigs();
      if (!x.tidy && !await tidy(env, x)) notes.push('\u26A0\uFE0F Could not close \u{1F6E0} / \u{1F4D8} or hide # General \u2014 check that I can "Manage topics".');
    } else notes.push("\u26A0\uFE0F Turn on <b>Topics</b> in the group's settings, then send /community setup.");
  }
  c[kind] = x;
  await putCommunity(env, c);
  await say(env, `\u2705 <b>${esc(x.title)}</b> is set up (${kind === "channel" ? "\u{1F4E2} channel" : "\u{1F4AC} group"}).` + (x.link ? `
Join link (members only \u2014 I approve each request): ${x.link}` : "") + (notes.length ? "\n" + notes.join("\n") : ""));
  return { ok: true };
}
async function tidy(env, x) {
  let okAll = true;
  for (const k of ["updates", "guide"]) if (x.topics && x.topics[k]) {
    const r = await tg3(env, "closeForumTopic", { chat_id: x.id, message_thread_id: x.topics[k] });
    if (!r.ok && !/TOPIC_NOT_MODIFIED/.test(r.description || "")) okAll = false;
  }
  const h = await tg3(env, "hideGeneralForumTopic", { chat_id: x.id });
  if (!h.ok && !/not modified|TOPIC_NOT_MODIFIED/i.test(h.description || "")) okAll = false;
  if (okAll) x.tidy = true;
  return okAll;
}
var sig = (s) => {
  let h = 0;
  for (const ch of JSON.stringify([s.t, s.en, s.ar])) h = h * 31 + ch.charCodeAt(0) | 0;
  return String(h);
};
var guideSigs = () => Object.fromEntries(guide_default.sections.map((s) => [s.k, sig(s)]));
async function guideUpdates(env) {
  const c = await getCommunity(env), x = c.group;
  if (!x || !x.topics || !x.topics.guide || x.guidePosted !== true) return { posted: 0 };
  if (!x.tidy && !x.tidyTried) {
    x.tidyTried = true;
    await tidy(env, x);
    c.group = x;
    await putCommunity(env, c);
  }
  if (!x.guideSig) {
    x.guideSig = guideSigs();
    c.group = x;
    await putCommunity(env, c);
    return { posted: 0 };
  }
  const now = guideSigs(), changed = guide_default.sections.filter((s) => x.guideSig[s.k] !== now[s.k]);
  if (!changed.length) return { posted: 0 };
  const line = (l) => /^•\s/.test(l) ? "   \u25E6 " + l.slice(2) : "\u2022 " + l;
  let n = 0;
  for (const s of changed.slice(0, 5)) {
    const isNew = !(s.k in x.guideSig);
    const r = await tg3(env, "sendMessage", {
      chat_id: x.id,
      message_thread_id: x.topics.guide,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      text: `\u{1F195} <b>${isNew ? "New in the guide \xB7 \u062C\u062F\u064A\u062F \u0641\u064A \u0627\u0644\u062F\u0644\u064A\u0644" : "Updated \xB7 \u0627\u062A\u062D\u062F\u0651\u062B"}</b>

${s.e} <b>${s.t.en}</b>
` + s.en.map(line).join("\n") + `

${s.e} <b>${s.t.ar}</b>
` + s.ar.map(line).join("\n")
    });
    if (!r.ok) break;
    x.guideSig[s.k] = now[s.k];
    n++;
  }
  c.group = x;
  await putCommunity(env, c);
  return { posted: n };
}
async function postGuide(env, x) {
  const t = x.topics.guide, send3 = (text) => tg3(env, "sendMessage", { chat_id: x.id, message_thread_id: t, text, parse_mode: "HTML", disable_web_page_preview: true });
  let from = typeof x.guidePosted === "number" ? x.guidePosted : -1;
  if (from < 0) {
    const idx = await send3(`<b>${guide_default.title.en}</b>
${guide_default.intro.en}

<b>${guide_default.title.ar}</b>
${guide_default.intro.ar}

` + guide_default.sections.map((s) => `${s.e} ${esc((s.b || s.t).en)} \xB7 ${esc((s.b || s.t).ar)}`).join("\n"));
    if (!idx.ok) return 0;
    await tg3(env, "pinChatMessage", { chat_id: x.id, message_id: idx.result.message_id, disable_notification: true });
    from = 0;
  }
  const line = (l) => /^•\s/.test(l) ? "   \u25E6 " + l.slice(2) : "\u2022 " + l;
  for (let i = from; i < guide_default.sections.length; i++) {
    const s = guide_default.sections[i];
    const r = await send3(`${s.e} <b>${s.t.en}</b>
` + s.en.map(line).join("\n") + `

${s.e} <b>${s.t.ar}</b>
` + s.ar.map(line).join("\n"));
    if (!r.ok) return i;
  }
  return true;
}
async function onJoinRequest(env, u) {
  const r = u.chat_join_request, c = await getCommunity(env);
  const ours = [c.channel, c.group].some((x) => x && String(x.id) === String(r.chat.id));
  if (!ours) return;
  const who = String(r.from.id), m = await members(env), ok2 = who === owner(env) || m[who] && !m[who].paused;
  await tg3(env, ok2 ? "approveChatJoinRequest" : "declineChatJoinRequest", { chat_id: r.chat.id, user_id: r.from.id });
  if (ok2 && who !== owner(env)) {
    const ar = m[who].lang === "ar";
    await tg3(env, "sendMessage", { chat_id: who, text: ar ? `\u2705 \u0627\u062A\u0642\u0628\u0644\u062A \u0641\u064A ${r.chat.title} \u2014 \u0623\u0647\u0644\u0627\u064B \u0628\u064A\u0643 \u{1F44B}` : `\u2705 You're in ${r.chat.title} \u2014 welcome \u{1F44B}` });
  }
}
async function communityView(env, lang2) {
  const c = await getCommunity(env), ar = lang2 === "ar", b = [];
  if (c.channel && c.channel.link) b.push([{ text: ar ? "\u{1F4E2} \u0642\u0646\u0627\u0629 \u0627\u0644\u0625\u0634\u0627\u0631\u0627\u062A" : "\u{1F4E2} Signals channel", url: c.channel.link }]);
  if (c.group && c.group.link) b.push([{ text: ar ? "\u{1F4AC} \u062C\u0631\u0648\u0628 \u0627\u0644\u0623\u0639\u0636\u0627\u0621" : "\u{1F4AC} Members' group", url: c.group.link }]);
  b.push([{ text: ar ? "\u2B05\uFE0F \u0627\u0644\u0642\u0627\u0626\u0645\u0629" : "\u2B05\uFE0F Menu", callback_data: "menu" }]);
  const text = b.length > 1 ? ar ? "\u{1F465} <b>\u0645\u062C\u062A\u0645\u0639 Cute Portfolio</b> \u2014 \u0644\u0644\u0623\u0639\u0636\u0627\u0621 \u0628\u0633\n\n\u{1F4E2} <b>\u0627\u0644\u0642\u0646\u0627\u0629</b>: \u0646\u0628\u0636 \u0627\u0644\u0633\u0648\u0642 \u0645\u0631\u062A\u064A\u0646 \u0641\u064A \u0627\u0644\u064A\u0648\u0645 \u0648\u0627\u0644\u062A\u062D\u0631\u0643\u0627\u062A \u0627\u0644\u0643\u0628\u064A\u0631\u0629. \u062A\u0642\u062F\u0631 \u062A\u062F\u0651\u064A \u2B50 \u0639\u0644\u0649 \u0627\u0644\u0628\u0648\u0633\u062A \u0627\u0644\u0644\u064A \u064A\u0639\u062C\u0628\u0643.\n\u{1F4AC} <b>\u0627\u0644\u062C\u0631\u0648\u0628</b>: \u062F\u0631\u062F\u0634\u0629 \xB7 \u{1F4A1} \u0627\u0642\u062A\u0631\u0627\u062D\u0627\u062A \xB7 \u{1F41E} \u0645\u0644\u0627\u062D\u0638\u0627\u062A \xB7 \u{1F4D8} \u0627\u0644\u062F\u0644\u064A\u0644 \xB7 \u{1F6E0} \u0627\u0644\u062A\u062D\u062F\u064A\u062B\u0627\u062A.\n\n\u0627\u0636\u063A\u0637 \u0648\u0627\u0628\u0639\u062A \u0637\u0644\u0628 \u0627\u0644\u0627\u0646\u0636\u0645\u0627\u0645 \u2014 \u0627\u0644\u0628\u0648\u062A \u0628\u064A\u0642\u0628\u0644\u0643 \u0639\u0644\u0649 \u0637\u0648\u0644." : "\u{1F465} <b>The Cute Portfolio community</b> \u2014 members only\n\n\u{1F4E2} <b>The channel</b>: the market pulse twice a day and big moves. You can give \u2B50 to posts you like.\n\u{1F4AC} <b>The group</b>: chat \xB7 \u{1F4A1} suggestions \xB7 \u{1F41E} bugs & notes \xB7 \u{1F4D8} guide \xB7 \u{1F6E0} updates.\n\nTap, send the join request \u2014 the bot lets you in at once." : ar ? "\u{1F465} \u0627\u0644\u0645\u062C\u062A\u0645\u0639 \u0644\u0633\u0647 \u0628\u064A\u062A\u062C\u0647\u0632 \u2014 \u0642\u0631\u064A\u0628." : "\u{1F465} The community is being set up \u2014 soon.";
  return { text, buttons: b };
}
function pulseText(m, now, kind) {
  const g = m.global || {}, d = g.dom || {}, btc = m.btc || {}, e = etfDay(m.etf);
  const seen = /* @__PURE__ */ new Set(), top = [...m.top || []].filter((r) => r.rank && r.rank <= 100 && r.ch24 != null && r.sym && !isStable(r.sym) && !seen.has(r.id) && seen.add(r.id));
  const up = [...top].sort((a, b) => b.ch24 - a.ch24).slice(0, 3), dn = [...top].sort((a, b) => a.ch24 - b.ch24).slice(0, 3);
  const head = kind === "move" ? `\u{1F6A8} <b>BTC ${btc.ch24 > 0 ? "+" : ""}${pct(btc.ch24, 1)} in 24h</b>` : `${kind === "am" ? "\u2600\uFE0F" : "\u{1F319}"} <b>Market pulse \xB7 \u0646\u0628\u0636 \u0627\u0644\u0633\u0648\u0642</b> \xB7 ${local(now, { day: "numeric", month: "short" })}`;
  const L = [
    head,
    "",
    `\u20BF BTC <b>${usd(btc.price)}</b> ${dot(btc.ch24)} ${pct(btc.ch24, 2)}`,
    g.mcap ? `\u{1F310} Market cap <b>$${(g.mcap / 1e12).toFixed(2)}T</b> ${dot(g.mcapCh24)} ${pct(g.mcapCh24, 2)}` : null,
    d.btc != null ? `\u{1F451} BTC dominance <b>${d.btc.toFixed(1)}%</b>${d.usdt != null ? ` \xB7 USDT ${d.usdt.toFixed(2)}%` : ""}` : null,
    m.fng ? `\u{1F628} Fear &amp; Greed <b>${m.fng.value}</b> \u2014 ${esc(m.fng.label || "")}` : null,
    m.alt && m.alt.value != null ? `\u{1F300} Altcoin season <b>${m.alt.value}</b>` : null,
    e ? `\u{1F3E6} ETF ${esc(e.label)}: BTC ${flow(e.btc)} \xB7 ETH ${flow(e.eth)}` : null,
    up.length ? "" : null,
    up.length ? `\u{1F4C8} ${up.map((r) => `${esc(r.sym)} ${pct(r.ch24, 1)}`).join(" \xB7 ")}` : null,
    dn.length ? `\u{1F4C9} ${dn.map((r) => `${esc(r.sym)} ${pct(r.ch24, 1)}`).join(" \xB7 ")}` : null,
    "",
    `<i>${NOTE.en} \xB7 ${NOTE.ar}</i>`
  ].filter((x) => x != null);
  return L.join("\n");
}
function discussUrl(c) {
  const g = c && c.group;
  return g && g.topics && g.topics.chat ? `https://t.me/c/${String(g.id).replace(/^-100/, "")}/${g.topics.chat}` : null;
}
var channelButtons = (c, extra = []) => {
  const d = discussUrl(c);
  return { inline_keyboard: [[...extra, ...d ? [{ text: "\u{1F4AC} Discuss \xB7 \u0646\u0627\u0642\u0634\u0647\u0627", url: d }] : []]].filter((r) => r.length) };
};
async function runChannel(env, now = Date.now()) {
  await guideUpdates(env).catch(() => {
  });
  const c = await getCommunity(env), ch = c.channel;
  if (!ch) return { job: null };
  const lp = localParts(now), today2 = lp.date, hm2 = lp.hour * 60 + (+lp.hm.slice(3) || 0), sent = c.sent || {};
  let kind = null;
  if (hm2 >= 9 * 60 && hm2 < 9 * 60 + 20 && sent.am !== today2) kind = "am";
  else if (hm2 >= 21 * 60 + 5 && hm2 < 21 * 60 + 25 && sent.pm !== today2) kind = "pm";
  const m = kind || sent.move !== today2 ? await loadMarket([], []).catch(() => null) : null;
  if (!kind && m && m.btc && Math.abs(m.btc.ch24 || 0) >= 5 && sent.move !== today2) kind = "move";
  if (!kind || !m) return { job: null };
  const r = await tg3(env, "sendMessage", {
    chat_id: ch.id,
    text: pulseText(m, now, kind),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: channelButtons(c, [{ text: "\u{1F9ED} Market Hub", url: APP + "market.html" }])
  });
  if (r.ok) {
    if (kind !== "move") {
      if (ch.pinned) await tg3(env, "unpinChatMessage", { chat_id: ch.id, message_id: ch.pinned });
      await tg3(env, "pinChatMessage", { chat_id: ch.id, message_id: r.result.message_id, disable_notification: true });
      ch.pinned = r.result.message_id;
    }
    sent[kind] = today2;
    c.sent = sent;
    c.channel = ch;
    await putCommunity(env, c);
  }
  return { job: "channel:" + kind, ok: !!r.ok };
}
async function announce(env, text) {
  const c = await getCommunity(env), out = [];
  const body = `\u{1F6E0} <b>What's new \xB7 \u0627\u0644\u062C\u062F\u064A\u062F</b>

${esc(text)}`;
  if (c.channel) out.push((await tg3(env, "sendMessage", { chat_id: c.channel.id, text: body, parse_mode: "HTML", reply_markup: channelButtons(c) })).ok ? "\u{1F4E2}" : "\u26A0\uFE0F\u{1F4E2}");
  if (c.group && c.group.topics && c.group.topics.updates) out.push((await tg3(env, "sendMessage", { chat_id: c.group.id, message_thread_id: c.group.topics.updates, text: body, parse_mode: "HTML" })).ok ? "\u{1F4AC}" : "\u26A0\uFE0F\u{1F4AC}");
  return out;
}

// tools/worker/watch.mjs
var KEY2 = (env) => K(env, "alerts");
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
var mem2 = /* @__PURE__ */ new Map();
async function kvGet(env, k) {
  try {
    if (env.RATE) return await env.RATE.get(k);
  } catch (_) {
  }
  return mem2.has(k) ? mem2.get(k) : null;
}
async function kvPut(env, k, v) {
  mem2.set(k, v);
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
    const a = JSON.parse(await kvGet(env, KEY2(env)) || "[]");
    return Array.isArray(a) ? a : [];
  } catch (_) {
    return [];
  }
}
async function saveAlerts(env, list2) {
  await kvPut(env, KEY2(env), JSON.stringify(list2.slice(0, MAX)));
}
async function logEvent(env, type, text, now = Date.now()) {
  const k = K(env, "log:" + localParts(now).date);
  let a = [];
  try {
    a = JSON.parse(await kvGet(env, k) || "[]");
  } catch (_) {
  }
  a.push({ t: now, type, text: String(text).replace(/<[^>]+>/g, "").slice(0, 200) });
  const v = JSON.stringify(a.slice(-30));
  mem2.set(k, v);
  try {
    if (env.RATE) await env.RATE.put(k, v, { expirationTtl: 3 * 86400 });
  } catch (_) {
  }
}
async function todayLog(env, now = Date.now()) {
  try {
    return JSON.parse(await kvGet(env, K(env, "log:" + localParts(now).date)) || "[]");
  } catch (_) {
    return [];
  }
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
    const same = list2.find((b) => b.kind === a.kind && b.value === a.value && (b.sym || null) === (a.sym || null));
    if (same) return { ok: true, alert: describe(same), id: same.id, now, already_set: true, note: "This exact alert already exists \u2014 nothing added. Tell the user it was already set." };
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
async function tg4(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false }));
}
async function runWatch(env, now = Date.now()) {
  const list2 = await listAlerts(env);
  if (!list2.length || !env.TELEGRAM_BOT_TOKEN || !chatOf(env)) return { checked: 0, fired: 0 };
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
    const r = await tg4(env, "sendMessage", { chat_id: chatOf(env), text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: { inline_keyboard: buttons } });
    if (!r.ok) keep.push(a);
    else await logEvent(env, "alert", describe(a) + " \u2014 now " + nowTxt);
  }
  await locked(async () => {
    const nowList = await listAlerts(env), seen = new Set(list2.map((a) => a.id));
    await saveAlerts(env, [...keep.filter((a) => nowList.some((b) => b.id === a.id)), ...nowList.filter((b) => !seen.has(b.id))]);
  });
  return { checked: list2.length, fired: fired.length };
}
async function viewAlerts(env, lang2 = "en") {
  const list2 = await listAlerts(env), ar = lang2 === "ar";
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
var mem3 = /* @__PURE__ */ new Map();
async function kvGet2(env, k) {
  try {
    if (env.RATE) return await env.RATE.get(k);
  } catch (_) {
  }
  return mem3.has(k) ? mem3.get(k) : null;
}
async function kvPut2(env, k, v) {
  mem3.set(k, v);
  try {
    if (env.RATE) await env.RATE.put(k, v, { expirationTtl: 3600 });
  } catch (_) {
  }
}
async function kvDel(env, k) {
  mem3.delete(k);
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
function txDoc(sym, type, qty2, price3, note, extra = {}) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return JSON.parse(JSON.stringify({
    sym,
    type,
    qty: +qty2 || 0,
    price: +price3 || 0,
    total: (+qty2 || 0) * (+price3 || 0),
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
  let qty2 = +i.amount, price3 = +i.price_usd;
  const total = +i.total_usd, fee = +i.fee_usd > 0 ? +i.fee_usd : 0;
  if (!(price3 > 0) && i.at_market) price3 = marketPrice || NaN;
  if (!(price3 > 0) && qty2 > 0 && total > 0) price3 = total / qty2;
  if (!(qty2 > 0) && total > 0 && price3 > 0) qty2 = total / price3;
  if (!(price3 > 0)) return { error: i.at_market ? `no current price for ${sym}` : 'the price is missing \u2014 ask the user for the price (or the total paid), or set at_market if they said "at market price"' };
  if (!(qty2 > 0)) return { error: "the amount is missing \u2014 ask the user how much (coins, or the total in USD)" };
  if (!isFinite(qty2 * price3) || qty2 * price3 > 1e9) return { error: "amount \xD7 price is not a sane number" };
  if (side === "sell" && qty2 > have * (1 + 1e-9) + 1e-12) return { error: `only ${amt(have)} ${sym} held \u2014 can't sell ${amt(qty2)}` };
  if (marketPrice && (price3 > marketPrice * 5 || price3 < marketPrice / 5)) return { error: `price $${r6(price3)} is far from today's $${r6(marketPrice)} \u2014 check the price with the user (maybe a typo or a different unit)` };
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
    const cost = qty2 * price3 + fee;
    if (side === "buy" && cost > sHave * (1 + 1e-9) + 1e-9) return { error: `only ${amt(sHave)} ${stableSym} held \u2014 not enough to pay $${r2(cost)}` };
    stable = stableSym;
  }
  const id = newId(), docs = [[id, txDoc(sym, side, qty2, price3, note, { date: w.iso, feeUsd: fee })]];
  const t2 = new Date(Date.parse(w.iso) + 1).toISOString();
  if (stable && side === "buy") docs.push([newId() + "p", txDoc(stable, "sell", qty2 * price3 + fee, 1, "Paid for buying " + amt(qty2) + " " + sym, { date: t2, link: id, kind: "pay" })]);
  if (stable && side === "sell") {
    const cash = Math.max(0, qty2 * price3 - fee);
    if (cash > 0) docs.push([newId() + "s", txDoc(stable, "buy", cash, 1, "From selling " + amt(qty2) + " " + sym, { date: t2, link: id })]);
  }
  const after = summarize(withIds({ ...user, txs: [...user.txs || [], ...docs.map((d) => d[1])] }, m), m, now);
  const a = after.coins.find((c) => c.sym === sym), sa = stable ? after.coins.find((c) => c.sym === stable) : null;
  const trade = {
    side,
    sym,
    qty: r6(qty2),
    price: r6(price3),
    total: r2(qty2 * price3),
    fee: fee || 0,
    date: w.iso,
    note,
    stable,
    held_before: r6(have),
    held_after: r6(a ? a.qty : 0),
    avg_before: row2 ? r6(row2.avg) : null,
    avg_after: a ? r6(a.avg) : null,
    realized_usd: side === "sell" && row2 ? r2((price3 - row2.avg) * qty2 - fee) : null,
    stable_after: sa ? r6(sa.qty) : stable ? 0 : null,
    value_after: r2(after.value)
  };
  ctx.trades.push({ trade, docs });
  return { ok: true, prepared: trade, saved: false, note_for_you: 'NOT saved yet. The bot itself shows the full summary (amounts, average, realized profit) with \u2705 Confirm / \u274C Cancel under your answer \u2014 so reply in ONE short line only (e.g. "\u{1F9FE} Ready \u2014 check the summary below and tap \u2705 Confirm"), plus one line only if something needs his attention. Do not repeat the numbers. Never say it was saved.' };
}
async function keepTrades(env, trades, lang2 = "en") {
  const gid = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  await kvPut2(env, "tg:tx:" + gid, JSON.stringify({ created: Date.now(), trades, lang: lang2, chat: chatOf(env) }));
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
  const g = JSON.parse(raw), lang2 = g.lang;
  if (g.chat && g.chat !== chatOf(env)) return { error: "gone" };
  await kvDel(env, "tg:tx:" + gid);
  if (Date.now() - g.created > TTL) return { error: "expired", lang: lang2 };
  const user = await loadUser(env, true);
  if (!user || !user.uid) return { error: "nouser", lang: lang2 };
  const m = await loadMarket([], coinsOf(user)), sum = summarize(withIds(user, m), m, Date.now());
  for (const { trade: t } of g.trades) {
    if (!(user.coins || []).some((c) => c && !c.removed && String(c.sym).toUpperCase() === t.sym)) return { error: "changed", lang: lang2, why: t.sym + " is no longer in the portfolio" };
    const r = sum.coins.find((c) => c.sym === t.sym);
    if (t.side === "sell" && t.qty > (r ? r.qty : 0) * (1 + 1e-9) + 1e-12) return { error: "changed", lang: lang2, why: `only ${amt(r ? r.qty : 0)} ${t.sym} held now` };
  }
  const docs = g.trades.flatMap((x) => x.docs).map(([id, data]) => ({ path: "txs/" + id, data }));
  const ok2 = await commitDocs(env, user.uid, docs).catch((e) => ({ error: String(e && e.message) }));
  if (ok2 && ok2.error) {
    console.log(JSON.stringify({ trade: "save-failed", message: ok2.error.slice(0, 200) }));
    return { error: "save", lang: lang2, why: ok2.error };
  }
  const s2 = summarize(withIds({ ...user, txs: [...user.txs || [], ...docs.map((d) => d.data)] }, m), m, Date.now());
  return { ok: true, lang: g.lang, trades: g.trades.map((x) => x.trade), holdings: s2 ? g.trades.map(({ trade: t }) => {
    const c = s2.coins.find((z) => z.sym === t.sym);
    return { sym: t.sym, qty: c ? c.qty : 0, avg: c ? c.avg : null };
  }) : [] };
}
async function cancelTrades(env, gid) {
  const raw = await kvGet2(env, "tg:tx:" + gid);
  if (!raw) return false;
  try {
    const g0 = JSON.parse(raw);
    if (g0.chat && g0.chat !== chatOf(env)) return false;
  } catch (_) {
  }
  await kvDel(env, "tg:tx:" + gid);
  try {
    return JSON.parse(raw).lang || "en";
  } catch (_) {
    return "en";
  }
}

// tools/worker/paper.mjs
var KEY3 = (env) => K(env, "paper");
var FEE = 1e-3;
var START = 1e4;
var mem4 = /* @__PURE__ */ new Map();
async function kvGet3(env, k) {
  try {
    if (env.RATE) {
      const v = await env.RATE.get(k);
      if (v != null) return v;
    }
  } catch (_) {
  }
  return mem4.has(k) ? mem4.get(k) : null;
}
async function kvPut3(env, k, v) {
  mem4.set(k, v);
  try {
    if (env.RATE) await env.RATE.put(k, v);
  } catch (_) {
  }
}
var r22 = (v) => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
var r8 = (v) => v == null || !isFinite(v) ? null : +Number(v).toPrecision(8);
var amt2 = (q) => (+Number(q).toPrecision(8)).toLocaleString("en-US", { maximumFractionDigits: 8 });
var money2 = (v) => v == null || !isFinite(v) ? "\u2014" : Math.abs(v) >= 1 || v === 0 ? usd2(v) : "$" + +v.toPrecision(4);
var lock2 = Promise.resolve();
var locked2 = (fn) => {
  const run2 = lock2.then(fn, fn);
  lock2 = run2.catch(() => {
  });
  return run2;
};
async function load(env) {
  try {
    const p = JSON.parse(await kvGet3(env, KEY3(env)) || "null");
    return p && p.pos ? p : null;
  } catch (_) {
    return null;
  }
}
var save = (env, p) => kvPut3(env, KEY3(env), JSON.stringify(p));
async function prices(coins) {
  const list2 = coins.filter((c) => c && c.sym);
  const m = await loadMarket(list2.map((c) => c.id).filter(Boolean), list2.map((c) => ({ sym: c.sym, id: c.id || null })));
  const rows = [...m.top, ...m.top500], out = {};
  for (const c of list2) {
    const id = c.id || m.idOf[c.sym], r = id && rows.find((x) => x.id === id), s = id && m.series[id];
    const p = r && r.price > 0 ? r.price : s ? s.last : null;
    if (p > 0) out[c.sym] = { price: p, ch24: r ? r.ch24 : null, id: id || null, src: typeof m.live[id] === "string" ? m.live[id] : m.live[id] ? "CoinGecko" : "snapshot" };
  }
  if (m.btc && m.btc.price > 0) out.BTC = out.BTC || { price: m.btc.price, ch24: m.btc.ch24, id: "bitcoin", src: m.live.bitcoin ? typeof m.live.bitcoin === "string" ? m.live.bitcoin : "CoinGecko" : "snapshot" };
  return out;
}
async function reset(env, cash = START) {
  const c = [1e3, 1e4, 1e5].includes(+cash) ? +cash : START;
  const px = await prices([{ sym: "BTC", id: "bitcoin" }]);
  if (!px.BTC) return { error: "no BTC price right now \u2014 try again in a minute" };
  return locked2(async () => {
    const p = { start: Date.now(), startCash: c, btcStart: px.BTC.price, cash: c, pos: {}, trades: [] };
    await save(env, p);
    return { ok: true, paper: p };
  });
}
async function status(env) {
  let p = await load(env);
  if (!p) {
    const r = await reset(env);
    if (r.error) return r;
    p = r.paper;
  }
  const px = await prices([{ sym: "BTC", id: "bitcoin" }, ...Object.entries(p.pos).map(([sym, x]) => ({ sym, id: x.id }))]);
  const coins = Object.entries(p.pos).map(([sym, x]) => {
    const q = px[sym];
    const price3 = q ? q.price : x.avg;
    return { sym, qty: x.qty, avg: x.avg, price: price3, value: x.qty * price3, pnl_pct: x.avg > 0 ? (price3 / x.avg - 1) * 100 : 0, ch24: q ? q.ch24 : null, priced: !!q };
  }).sort((a, b) => b.value - a.value);
  const value = p.cash + coins.reduce((a, c) => a + c.value, 0), btcNow = px.BTC ? px.BTC.price : null;
  const hodl = btcNow && p.btcStart ? p.startCash * btcNow / p.btcStart : null;
  return { p, coins, value, profit: value - p.startCash, profitPct: (value / p.startCash - 1) * 100, hodl, vsBtcPts: hodl ? (value / p.startCash - hodl / p.startCash) * 100 : null, btcNow };
}
async function paperTrade(env, input) {
  const i = input || {}, side = String(i.side || "").toLowerCase();
  if (side !== "buy" && side !== "sell") return { error: "side must be buy or sell" };
  const q = String(i.coin || "").trim();
  if (!q) return { error: "coin is needed" };
  let p = await load(env);
  if (!p) {
    const r = await reset(env);
    if (r.error) return r;
    p = r.paper;
  }
  const m0 = await loadMarket([], []), c = await findCoin(q, m0, null);
  if (!c) return { error: `no coin found for "${q}"` };
  const sym = c.sym.toUpperCase();
  if (isStable(sym)) return { error: "stablecoins are the cash here \u2014 buy or sell another coin" };
  const px = await prices([{ sym, id: c.id }]), x = px[sym];
  if (!x) return { error: `no live price for ${sym} right now` };
  return locked2(async () => {
    p = await load(env) || p;
    const held = p.pos[sym] || { qty: 0, avg: 0, id: x.id };
    let qty2 = +i.amount;
    if (!(qty2 > 0) && +i.usd > 0) qty2 = side === "buy" ? +i.usd / (x.price * (1 + FEE)) : +i.usd / x.price;
    if (!(qty2 > 0) && side === "sell" && +i.fraction > 0) qty2 = held.qty * Math.min(1, +i.fraction);
    if (!(qty2 > 0)) return { error: "how much? give amount (coins), usd, or (to sell) fraction" };
    const gross = qty2 * x.price, fee = gross * FEE;
    if (side === "buy") {
      if (gross + fee > p.cash + 1e-6) return { error: `only ${money2(p.cash)} pretend cash left \u2014 that costs ${money2(gross + fee)}` };
      p.cash -= gross + fee;
      held.avg = (held.qty * held.avg + gross + fee) / (held.qty + qty2);
      held.qty += qty2;
      held.id = held.id || x.id;
      p.pos[sym] = held;
    } else {
      if (qty2 > held.qty * (1 + 1e-9) + 1e-12) return { error: `only ${amt2(held.qty)} ${sym} in the paper portfolio` };
      qty2 = Math.min(qty2, held.qty);
      p.cash += gross - fee;
      held.qty -= qty2;
      if (held.qty * x.price < 0.01) delete p.pos[sym];
      else p.pos[sym] = held;
    }
    const t = { t: Date.now(), side, sym, qty: r8(qty2), price: r8(x.price), fee: r22(fee), realized: side === "sell" ? r22((x.price - (held.avg || 0)) * qty2 - fee) : null };
    p.trades = [...p.trades || [], t].slice(-50);
    p.undo = { t: t.t, side, sym, qty: qty2, gross, fee, avgBefore: side === "buy" ? null : held.avg };
    await save(env, p);
    return { ok: true, done: t, price_source: x.src, cash_left_usd: r22(p.cash), now_held: r8((p.pos[sym] || { qty: 0 }).qty), note: "Pretend money only \u2014 the real portfolio is untouched. Done at once; the user can tap \u21A9\uFE0F Undo last." };
  });
}
async function undoLast(env) {
  return locked2(async () => {
    const p = await load(env);
    if (!p || !p.trades || !p.trades.length || !p.undo) return { error: "nothing to undo" };
    const u = p.undo, t = p.trades[p.trades.length - 1];
    const h = p.pos[u.sym] || { qty: 0, avg: u.avgBefore || 0, id: null };
    if (u.side === "buy") {
      const q = h.qty - u.qty;
      if (q < -1e-12) return { error: "nothing to undo" };
      h.avg = q > 1e-12 ? (h.qty * h.avg - u.gross - u.fee) / q : 0;
      h.qty = q;
      p.cash += u.gross + u.fee;
      if (h.qty <= 1e-12) delete p.pos[u.sym];
      else p.pos[u.sym] = h;
    } else {
      if (p.cash < u.gross - u.fee - 1e-6) return { error: "nothing to undo" };
      p.cash -= u.gross - u.fee;
      h.qty += u.qty;
      h.avg = u.avgBefore || h.avg;
      p.pos[u.sym] = h;
    }
    p.trades = p.trades.slice(0, -1);
    delete p.undo;
    await save(env, p);
    return { ok: true, undone: t };
  });
}
async function paperFacts(env) {
  const s = await status(env);
  if (s.error) return s;
  return {
    started: new Date(s.p.start).toISOString().slice(0, 10),
    start_cash_usd: s.p.startCash,
    value_usd: r22(s.value),
    cash_usd: r22(s.p.cash),
    profit_usd: r22(s.profit),
    profit_pct: r22(s.profitPct),
    same_money_in_btc_usd: r22(s.hodl),
    vs_btc_pts: r22(s.vsBtcPts),
    coins: s.coins.map((c) => ({ coin: c.sym, amount: r8(c.qty), avg_usd: r8(c.avg), price_usd: r8(c.price), value_usd: r22(c.value), profit_pct: r22(c.pnl_pct) })),
    last_trades: (s.p.trades || []).slice(-5).map((t) => ({ when: new Date(t.t).toISOString(), side: t.side, coin: t.sym, amount: t.qty, price_usd: t.price, realized_usd: t.realized })),
    fee_pct: FEE * 100
  };
}
var PW = {
  en: {
    title: "\u{1F9EA} <b>Paper trading</b>",
    sub: "pretend money \xB7 real prices",
    value: "Value",
    cash: "Cash",
    profit: "Profit",
    btc: "Same money in BTC",
    beat: "vs BTC",
    since: "since",
    none: "No coins yet \u2014 write e.g. <i>paper buy 0.05 BTC</i> or <i>paper buy SOL for $500</i>.",
    last: "Last",
    undo: "\u21A9\uFE0F Undo last",
    restart: "\u{1F501} Start again",
    back: "\u2B05\uFE0F Menu",
    refresh: "\u{1F504}",
    fee: "fee 0.1% / trade",
    pick: "Start again with how much pretend cash? (the current paper portfolio is cleared)",
    undone: "\u21A9\uFE0F Undone",
    nothing: "Nothing to undo"
  },
  ar: {
    title: "\u{1F9EA} <b>\u0627\u0644\u062A\u062F\u0627\u0648\u0644 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A</b>",
    sub: "\u0641\u0644\u0648\u0633 \u0648\u0647\u0645\u064A\u0629 \xB7 \u0623\u0633\u0639\u0627\u0631 \u062D\u0642\u064A\u0642\u064A\u0629",
    value: "\u0627\u0644\u0642\u064A\u0645\u0629",
    cash: "\u0627\u0644\u0643\u0627\u0634",
    profit: "\u0627\u0644\u0631\u0628\u062D",
    btc: "\u0646\u0641\u0633 \u0627\u0644\u0641\u0644\u0648\u0633 \u0641\u064A BTC",
    beat: "\u0645\u0642\u0627\u0628\u0644 BTC",
    since: "\u0645\u0646",
    none: "\u0645\u0641\u064A\u0634 \u0639\u0645\u0644\u0627\u062A \u0644\u0633\u0647 \u2014 \u0627\u0643\u062A\u0628 \u0645\u062B\u0644\u0627\u064B <i>\u062A\u062C\u0631\u064A\u0628\u064A \u0627\u0634\u062A\u0631\u064A 0.05 BTC</i> \u0623\u0648 <i>\u062A\u062C\u0631\u064A\u0628\u064A \u0627\u0634\u062A\u0631\u064A SOL \u0628\u0640 500 \u062F\u0648\u0644\u0627\u0631</i>.",
    last: "\u0622\u062E\u0631 \u0635\u0641\u0642\u0629",
    undo: "\u21A9\uFE0F \u062A\u0631\u0627\u062C\u0639",
    restart: "\u{1F501} \u0627\u0628\u062F\u0623 \u0645\u0646 \u062C\u062F\u064A\u062F",
    back: "\u2B05\uFE0F \u0627\u0644\u0642\u0627\u0626\u0645\u0629",
    refresh: "\u{1F504}",
    fee: "\u0631\u0633\u0648\u0645 0.1% \u0644\u0644\u0635\u0641\u0642\u0629",
    pick: "\u062A\u0628\u062F\u0623 \u0645\u0646 \u062C\u062F\u064A\u062F \u0628\u0643\u0627\u0645 \u0641\u0644\u0648\u0633 \u0648\u0647\u0645\u064A\u0629\u061F (\u0627\u0644\u0645\u062D\u0641\u0638\u0629 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u0647\u062A\u062A\u0645\u0633\u062D)",
    undone: "\u21A9\uFE0F \u0627\u062A\u0644\u063A\u062A",
    nothing: "\u0645\u0641\u064A\u0634 \u062D\u0627\u062C\u0629 \u062A\u062A\u0644\u063A\u064A"
  }
};
var paperWords = PW;
async function viewPaper(env, lang2 = "en") {
  const w = PW[lang2] || PW.en, s = await status(env);
  if (s.error) return { text: "\u26A0\uFE0F " + esc(s.error), buttons: [[{ text: w.back, callback_data: "menu" }]] };
  const { p } = s, L = [
    `${w.title} \xB7 <i>${w.sub}</i>`,
    `<i>${w.since} ${esc(local(p.start, { day: "numeric", month: "short", year: "numeric" }))} \xB7 ${usd(p.startCash)}</i>`,
    "",
    `\u{1F4BC} ${w.value}: <b>${usd2(s.value)}</b>`,
    `\u{1F4B5} ${w.cash}: ${usd2(p.cash)}`,
    `${dot(s.profit)} ${w.profit}: <b>${s.profit >= 0 ? "+" : "\u2212"}${usd2(Math.abs(s.profit))}</b> (${pct(s.profitPct)})`
  ];
  if (s.hodl) L.push(`\u{1F7E0} ${w.btc}: ${usd2(s.hodl)} \xB7 ${w.beat} <b>${s.vsBtcPts >= 0 ? "+" : "\u2212"}${Math.abs(s.vsBtcPts).toFixed(1)}</b> pts`);
  L.push("");
  if (!s.coins.length) L.push(w.none);
  for (const c of s.coins.slice(0, 12)) L.push(`<code>${esc(c.sym.padEnd(6))}</code> ${amt2(c.qty)} \xB7 ${usd2(c.value)} \xB7 ${dot(c.pnl_pct)} ${pct(c.pnl_pct, 1)}`);
  const t = (p.trades || []).slice(-1)[0];
  if (t) L.push("", `<i>${w.last}: ${t.side === "buy" ? "\u{1F7E2}" : "\u{1F534}"} ${t.side} ${amt2(t.qty)} ${esc(t.sym)} @ ${money2(t.price)} \xB7 ${esc(local(t.t, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }))}</i>`);
  L.push(`<i>${w.fee}</i>`);
  const b = [[{ text: w.refresh, callback_data: "pp" }, ...p.undo ? [{ text: w.undo, callback_data: "pp:undo" }] : [], { text: w.restart, callback_data: "pp:new" }], [{ text: w.back, callback_data: "menu" }]];
  return { text: L.join("\n"), buttons: b };
}
function viewRestart(lang2 = "en") {
  const w = PW[lang2] || PW.en;
  return { text: "\u{1F501} " + w.pick, buttons: [[{ text: "$1,000", callback_data: "pp:new:1000" }, { text: "$10,000", callback_data: "pp:new:10000" }, { text: "$100,000", callback_data: "pp:new:100000" }], [{ text: "\u2716\uFE0F", callback_data: "pp" }]] };
}

// tools/worker/ai.mjs
var H2 = 36e5;
var DAY3 = 24 * H2;
var MAX_ROUNDS = 8;
var HISTORY = 10;
var r23 = (v) => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
var r62 = (v) => v == null || !isFinite(v) ? null : +Number(v).toPrecision(6);
var mem5 = /* @__PURE__ */ new Map();
async function kvGet4(env, k) {
  try {
    if (env.RATE) return await env.RATE.get(k);
  } catch (_) {
  }
  return mem5.has(k) ? mem5.get(k) : null;
}
async function kvPut4(env, k, v, ttl) {
  mem5.set(k, v);
  try {
    if (env.RATE) await env.RATE.put(k, v, ttl ? { expirationTtl: ttl } : void 0);
  } catch (_) {
  }
}
async function kvDel2(env, k) {
  mem5.delete(k);
  try {
    if (env.RATE) await env.RATE.delete(k);
  } catch (_) {
  }
}
async function firstTime(env, updateId) {
  if (updateId == null) return true;
  const k = "tg:u:" + updateId;
  if (await kvGet4(env, k)) return false;
  await kvPut4(env, k, "1", 3600);
  return true;
}
var today = () => localParts(Date.now()).date;
async function usage(env) {
  const n = +await kvGet4(env, K(env, "ai:" + today())) || 0, lim = !isOwner(env) && (await keyInfo(env)).has ? BYOK_AI : await aiLimitFor(env);
  return { used: n, limit: lim, left: Math.max(0, lim - n) };
}
async function countOne(env) {
  const u = await usage(env);
  await kvPut4(env, K(env, "ai:" + today()), String(u.used + 1), 2 * 86400);
  return u.left - 1;
}
async function forget(env) {
  await kvDel2(env, K(env, "hist"));
}
async function history(env) {
  try {
    const h = JSON.parse(await kvGet4(env, K(env, "hist")) || "[]");
    return Array.isArray(h) ? h : [];
  } catch (_) {
    return [];
  }
}
async function remember(env, q, a) {
  const h = (await history(env)).concat([{ role: "user", content: q }, { role: "assistant", content: a }]).slice(-HISTORY);
  await kvPut4(env, K(env, "hist"), JSON.stringify(h), 6 * 3600);
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
    name: "paper_trade",
    description: 'PAPER (pretend) trading \u2014 a separate practice portfolio at real prices, never the real one. Use ONLY when the user says paper / practice / pretend / \u062A\u062C\u0631\u064A\u0628\u064A / \u0648\u0647\u0645\u064A / \u062A\u062C\u0631\u0628\u0629 ("paper buy 0.1 BTC", "\u062A\u062C\u0631\u064A\u0628\u064A \u0627\u0634\u062A\u0631\u064A SOL \u0628\u0640 500 \u062F\u0648\u0644\u0627\u0631", "paper sell half my ETH"). Done at once at the live price (0.1% fee). amount = coins, or usd = dollars, or (sell) fraction 0\u20131. Any coin. The user can tap \u21A9\uFE0F Undo.',
    input_schema: { type: "object", properties: { side: { type: "string", enum: ["buy", "sell"] }, coin: { type: "string" }, amount: { type: "number" }, usd: { type: "number" }, fraction: { type: "number" } }, required: ["side", "coin"] }
  },
  { name: "get_paper", description: "The PAPER (pretend) portfolio: value, cash, profit, vs the same money in BTC since the start, each coin, the last trades.", input_schema: { type: "object", properties: {} } },
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
    paper: false,
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
      change_24h_pct: r23(row2.ch24),
      change_7d_pct: r23(row2.ch7),
      change_30d_pct: r23(row2.ch30),
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
      out.you_hold = h ? { amount: r62(h.qty), value_usd: r23(h.value), share_of_portfolio_pct: sum.value > 0 ? r23(h.value / sum.value * 100) : null, average_buy_usd: r62(h.avg), profit_vs_average_pct: r23(h.chg), signal: sum.signal[sym] || "hold", signal_reason: h.why || null } : "not held";
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
      total_value_usd: r23(s.value),
      change_24h_pct: r23(s.ch24),
      change_24h_usd: r23(s.d24),
      change_7d_pct: r23(s.ch7),
      change_7d_usd: r23(s.d7),
      all_time_profit_usd: r23(s.total),
      all_time_profit_pct: r23(s.pctTotal),
      invested_usd: r23(s.invested),
      vs_holding_btc_pct: r23(s.vsBtc),
      alts_beating_btc: `${s.beat} of ${s.alts}`,
      signals: s.counts,
      coins: [...s.coins].sort((a, b) => b.value - a.value).map((c) => ({ ticker: c.sym, value_usd: r23(c.value), share_pct: s.value > 0 ? r23(c.value / s.value * 100) : null, change_24h_pct: r23(c.ch24), change_7d_pct: r23(c.ch7), profit_vs_average_pct: r23(c.chg), signal: s.signal[c.sym], vs_btc_pct: c.vs ? r23(c.vs.pct) : null, vs_btc_30d_pts: c.rs ? r23(c.rs.d30) : null, vs_btc_90d_pts: c.rs ? r23(c.rs.d90) : null, stablecoin: isStable(c.sym) || void 0 })),
      allocation: s.alloc ? s.alloc.groups.map((g) => ({ group: s.alloc.names[g.key] || g.key, now_pct: r23(g.now), target_pct: r23(g.target), state: g.state })) : null
    };
  }
  if (name === "get_market") {
    const m = await ctx.market(), n = [100, 200, 300, 500].includes(+(input && input.top)) ? +input.top : 100;
    ctx.used.add(srcOf(m, "bitcoin"));
    ctx.used.add("market snapshot (CoinGecko, alternative.me, ETF flows)");
    const g = m.global || {}, d = g.dom || {}, e = etfDay(m.etf);
    const seen = /* @__PURE__ */ new Set(), list2 = [...m.top, ...m.top500].filter((r) => r.rank && r.rank <= n && r.ch24 != null && r.sym && !isStable(r.sym) && !seen.has(r.id) && seen.add(r.id));
    const pick = (a, dir) => [...a].sort((x, y) => dir * (y.ch24 - x.ch24)).slice(0, 5).map((r) => ({ ticker: String(r.sym).toUpperCase(), rank: r.rank, price_usd: r62(r.price), change_24h_pct: r23(r.ch24) }));
    const st = (m.stocks || []).filter((r) => r.ch24 != null);
    return {
      btc_price_usd: m.btc ? r62(m.btc.price) : null,
      btc_change_24h_pct: m.btc ? r23(m.btc.ch24) : null,
      total_market_cap_usd: g.mcap ? Math.round(g.mcap) : null,
      market_cap_change_24h_pct: r23(g.mcapCh24),
      btc_dominance_pct: r23(d.btc),
      eth_dominance_pct: r23(d.eth),
      usdt_dominance_pct: r23(d.usdt),
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
      overall_progress_pct: r23(s.prog.pct),
      targets_met: `${s.prog.completed} of ${s.prog.counted}`,
      coins: s.plan.map((p) => ({ ticker: p.sym, held: r62(p.actual), target: r62(p.target), progress_pct: p.target > 0 ? r23(p.actual / p.target * 100) : null })),
      regular_buys: (s.dca || []).map((dc) => ({ ticker: dc.sym, per_month_usd: r23(dc.s.perMonth), next: dc.s.next || null, state: dc.s.state })),
      buy_price_alerts: (s.buyAt || []).map((b) => ({ ticker: b.sym, alert_price_usd: r62(b.at), price_now_usd: r62(b.price), pct_above_alert: r23((b.price / b.at - 1) * 100), still_to_buy: r62(b.left) }))
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
      take_profits: (s.tps || []).map((t) => ({ ticker: t.sym, tp: t.n, level_usd: r62(t.level), price_now_usd: r62(t.price), pct_to_go: r23((t.level / t.price - 1) * 100), multiple_of_average: t.mult || null, sell_pct: t.pct || null })).sort((a, b) => a.pct_to_go - b.pct_to_go)
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
  if (name === "paper_trade") {
    ctx.used.add("paper portfolio (live prices)");
    ctx.paper = true;
    return paperTrade(ctx.env, input);
  }
  if (name === "get_paper") {
    ctx.used.add("paper portfolio (live prices)");
    ctx.paper = true;
    return paperFacts(ctx.env);
  }
  if (name === "what_if") {
    const x = await ctx.sum();
    if (!x) return { error: "portfolio not connected" };
    const { s } = x;
    ctx.used.add("your portfolio (Firebase)");
    ctx.used.add("what-if (the app's maths)");
    const up = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [String(k).toUpperCase(), +v]).filter(([, v]) => isFinite(v)));
    const prices2 = up(input && input.prices), moves = up(input && input.moves_pct), alts = isFinite(+(input && input.alts_move_pct)) ? +input.alts_move_pct : null;
    const rows = s.coins.map((c) => {
      let p = c.price;
      if (prices2[c.sym] > 0) p = prices2[c.sym];
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
      trades.push({ sell: r.sym, amount: r62(q), usd: r23(q * r.p), profit_usd: r23(q * (r.p - r.avg)) });
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
      trades.push({ buy: r.sym, amount: r62(q), usd: r23(u), new_average: r62(r.avg) });
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
      value_now_usd: r23(before),
      value_after_usd: r23(after),
      change_usd: r23(after - before - newMoney),
      change_pct: before > 0 ? r23((after - before - newMoney) / before * 100) : null,
      cash_from_sells_usd: r23(cash),
      new_money_usd: r23(newMoney),
      realized_profit_from_sells_usd: r23(realized),
      all_time_profit_now_usd: r23(s.total),
      all_time_profit_after_usd: r23(s.total + priceGain),
      all_time_profit_after_pct: s.invested + newMoney > 0 ? r23((s.total + priceGain) / (s.invested + newMoney) * 100) : null,
      changed_coins: rows.filter((r) => r.p !== r.price || r.sold || r.buyUsd).sort((a, b) => Math.abs(b.qty * b.p - b.qty * b.price) - Math.abs(a.qty * a.p - a.qty * a.price)).slice(0, 20).map((r) => ({ ticker: r.sym, price_now: r62(r.price), price_then: r62(r.p), value_then_usd: r23(r.qty * r.p), profit_vs_average_pct: r.avg > 0 ? r23((r.p / r.avg - 1) * 100) : null })),
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
    const from = now - days * DAY3, pts = f.p.map((p, i) => [f.t0 + i * f.step, p]).filter(([t, p]) => t >= from && p > 0);
    if (pts.length < 2) return { error: "not enough history" };
    ctx.used.add("hourly price history (GitHub prices branch)");
    let hi = pts[0], lo = pts[0];
    for (const x of pts) {
      if (x[1] > hi[1]) hi = x;
      if (x[1] < lo[1]) lo = x;
    }
    const day3 = (t) => local(t, { day: "numeric", month: "short" }), closes = {};
    for (const [t, p] of pts) closes[localParts(t).date] = r62(p);
    return {
      coin: c.sym,
      days,
      start_usd: r62(pts[0][1]),
      end_usd: r62(pts[pts.length - 1][1]),
      change_pct: r23((pts[pts.length - 1][1] / pts[0][1] - 1) * 100),
      high: { usd: r62(hi[1]), on: day3(hi[0]) },
      low: { usd: r62(lo[1]), on: day3(lo[0]) },
      daily_closes: closes
    };
  }
  return { error: "unknown tool" };
}
function system(now, lang2, qLang, owner2 = true) {
  return [
    owner2 ? "You are the Cute Portfolio assistant inside Telegram \u2014 a sharp, honest crypto analyst for one private user, Samir, who runs a long-term Bitcoin-first strategy (accumulation plan, DCA, an exit plan) in the Cute Portfolio app." : "You are the Cute Portfolio assistant inside Telegram \u2014 a sharp, honest crypto analyst for a user the owner invited. Their portfolio may not be linked yet: if a portfolio / plan / exit tool says it is not connected, tell them how in one line: send /app with their e-mail (Samir approves it), sign in to the app, then Settings \u2192 Link the Telegram bot (or /link CODE). Never say linking is coming soon; and help with the market, coins, alerts and paper trading.",
    `Now: ${local(now, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} (Riyadh).`,
    "RULES",
    "- Every number you state (price, %, value, rank, flow\u2026) must come from a tool result in this conversation. Never use prices or market data from memory \u2014 call the tools first (several in one turn if needed). If a tool has no data, say so.",
    '- Each new question: call the tools again. Earlier answers in this chat may be stale or wrong \u2014 never repeat an earlier "no data" (or any earlier number) without calling the tool now.',
    "- For liquidation / squeeze / leverage / funding questions always call get_derivatives (with get_coin and get_history for the levels).",
    '- "Tell me / alert me / \u0646\u0628\u0651\u0647\u0646\u064A if \u2026" \u2192 set_alert (then confirm in one short line what was set, the value now, and if already_met that it waits for the next crossing). "What if / \u0644\u0648 \u2026" about prices or trades \u2192 what_if (with get_coin for a coin he does not hold).',
    `- "I bought / I sold / \u0627\u0634\u062A\u0631\u064A\u062A / \u0628\u0639\u062A \u2026" (a trade he MADE) \u2192 record_trade. It is only prepared, and the bot shows the full summary itself \u2014 so your whole answer is ONE short line ("\u{1F9FE} \u062C\u0627\u0647\u0632\u0629 \u2014 \u0631\u0627\u062C\u0639 \u0627\u0644\u0645\u0644\u062E\u0635 \u062A\u062D\u062A \u0648\u0627\u0636\u063A\u0637 \u2705 \u062A\u0623\u0643\u064A\u062F" / "\u{1F9FE} Ready \u2014 check the summary below and tap \u2705 Confirm"), plus at most one line if something needs attention (e.g. a price far from today's). No sections, no repeated numbers. Never say it is saved. A trade he is only thinking about ("should I / what if I sell") \u2192 what_if, not record_trade.`,
    "- paper / practice / pretend / \u062A\u062C\u0631\u064A\u0628\u064A / \u0648\u0647\u0645\u064A \u2192 paper_trade or get_paper (the pretend portfolio) \u2014 never record_trade or the real portfolio. Confirm a paper trade in 1\u20132 lines (done, price, cash left).",
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
async function claude(env, model, body, key = null) {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": key || env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model, ...body }) });
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
async function ask(env, question, lang2 = "en") {
  const own = isOwner(env) ? null : await ownKey(env);
  if (!env.ANTHROPIC_API_KEY && !own) return { error: "nokey" };
  const u = await usage(env);
  if (u.left <= 0) return { error: "limit", limit: u.limit };
  const now = Date.now(), ctx = context(env);
  const qLang = /[\u0600-\u06FF]/.test(String(question)) ? "ar" : "en";
  const messages = [...await history(env), { role: "user", content: String(question).slice(0, 2e3) + (qLang === "ar" ? "\n\n(\u062C\u0627\u0648\u0628 \u0628\u0627\u0644\u0639\u0631\u0628\u064A \u0627\u0644\u0645\u0635\u0631\u064A)" : "\n\n(Reply in English.)") }];
  let model = env.BOT_MODEL || "claude-sonnet-5-5", fellBack = false, text = "";
  for (let round = 0; round <= MAX_ROUNDS; round++) {
    const body = { max_tokens: 2e3, system: system(now, lang2, qLang, isOwner(env)), tools: TOOLS, ...round === MAX_ROUNDS ? { tool_choice: { type: "none" } } : {}, messages };
    let r = await claude(env, model, body, own);
    if (!r.ok && own && (r.status === 401 || r.status === 403 || /credit|billing|balance/i.test(JSON.stringify(r.j.error || {})))) return { error: "ownkey" };
    if (!r.ok && !fellBack && (r.status === 404 || r.status === 400 && /model/i.test(JSON.stringify(r.j.error || {})))) {
      fellBack = true;
      model = env.MODEL || "claude-opus-4-5";
      r = await claude(env, model, body, own);
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
  return { text: toHtml(text), sources: [...ctx.used], coins, left, limit: u.limit, model, trades: ctx.trades, paper: ctx.paper };
}
async function compose(env, kind, lang2, facts) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const ar = lang2 === "ar";
  const sys = [
    `You write Samir's ${kind === "morning" ? "SMART MORNING" : "SMART EVENING"} message in Telegram for his Cute Portfolio app (long-term, Bitcoin-first: accumulation plan, DCA, exit plan).`,
    "Every number must come from FACTS (JSON). Never invent a number, price or event. If something is missing, leave it out.",
    kind === "morning" ? 'Shape: line 1 = one emoji + **bold one-line verdict for today**. Then \u{1F3AF} **Today** \u2014 exactly 3 numbered actions (1. 2. 3.) picked from FACTS.todo (most useful first; "nothing to do \u2014 hold" is a valid action when the list is short), each one line with its number. Then \u{1F30D} **Market mood** \u2014 2 bullets. Then \u{1F440} **Watch today** \u2014 1\u20132 bullets (levels / alerts closest to triggering).' : "Shape: line 1 = one emoji + **bold one-line verdict on the day**. Then \u{1F4CA} **Today** \u2014 2\u20133 bullets (portfolio change since the morning, best / worst coin, trades or alerts that happened). Then \u{1F504} **What changed** \u2014 2 bullets (BTC, Fear & Greed, dominance, futures, sectors \u2014 vs the morning when FACTS has it). Then \u{1F440} **Tonight & tomorrow** \u2014 2\u20133 bullets (closest levels / alerts, tomorrow's DCA if any).",
    'Bullets: "\u2022 label: **value** \u2014 3\u20136 word note". Short lines (\u2264 40 characters when possible), ~14 lines in all, no tables, no headings with #, no links, no sources line.',
    ar ? "Write in Egyptian Arabic; numbers and tickers in Latin characters." : "Write in English."
  ].join("\n");
  const body = { max_tokens: 3e3, system: sys, messages: [{ role: "user", content: "FACTS:\n" + JSON.stringify(facts).slice(0, 12e3) }] };
  let model = env.BOT_MODEL || "claude-sonnet-5-5";
  let r = await claude(env, model, body).catch(() => ({ ok: false, status: 0, j: {} }));
  if (!r.ok && (r.status === 404 || r.status === 400 && /model/i.test(JSON.stringify(r.j.error || {})))) {
    model = env.MODEL || "claude-opus-4-5";
    r = await claude(env, model, body).catch(() => ({ ok: false, j: {} }));
  }
  if (!r.ok) {
    console.log(JSON.stringify({ daily: "claude-error", kind, status: r.status }));
    return null;
  }
  const text = (r.j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (r.j.stop_reason === "max_tokens" || text.length < 20) {
    console.log(JSON.stringify({ daily: "claude-short", kind, stop: r.j.stop_reason, chars: text.length }));
    return null;
  }
  return toHtml(text);
}

// tools/worker/voice.mjs
var MAX_SEC = 120;
var MODEL = "@cf/openai/whisper-large-v3-turbo";
var HINT = {
  en: "Bitcoin BTC, Ethereum ETH, Solana SOL, KAVA, LINK, funding, liquidation, alert me if, portfolio, take profit, paper buy.",
  ar: "\u0646\u0628\u0651\u0647\u0646\u064A \u0644\u0648\u060C \u0645\u062D\u0641\u0638\u062A\u064A\u060C \u0627\u0644\u0633\u0639\u0631\u060C \u062E\u0637\u0629 \u0627\u0644\u062E\u0631\u0648\u062C\u060C \u062A\u0635\u0641\u064A\u0627\u062A\u060C \u062A\u0645\u0648\u064A\u0644\u060C \u062A\u062C\u0631\u064A\u0628\u064A\u060C \u0628\u064A\u062A\u0643\u0648\u064A\u0646 BTC\u060C \u0625\u064A\u062B\u064A\u0631\u064A\u0648\u0645 ETH\u060C \u0633\u0648\u0644\u0627\u0646\u0627 SOL\u060C \u0643\u0627\u0641\u0627 KAVA."
};
var score = (o) => {
  const s = o && o.segments || [];
  const v = s.map((x) => +x.avg_logprob).filter(isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : -9;
};
var clean = (o) => String(o && o.text || "").replace(/\s+/g, " ").trim().slice(0, 1e3);
var odd = (t) => /[^\p{Script=Latin}\p{Script=Arabic}\p{M}\p{N}\p{P}\p{S}\s]/u.test(t);
function b642(buf) {
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
    const a = b642(await audio.arrayBuffer());
    const run2 = (language, hint) => env.AI.run(MODEL, { audio: a, vad_filter: true, ...language ? { language } : {}, ...hint ? { initial_prompt: hint } : {} });
    const first = await run2(null, null), info = first && first.transcription_info || {}, lang2 = info.language, prob = +info.language_probability || 0;
    let best;
    if ((lang2 === "en" || lang2 === "ar") && prob >= 0.7) best = { o: await run2(lang2, HINT[lang2]), lang: lang2 };
    else {
      const [en, ar] = await Promise.all([run2("en", HINT.en), run2("ar", HINT.ar)]);
      const c = [{ o: en, lang: "en" }, { o: ar, lang: "ar" }].filter((x) => clean(x.o)).sort((x, y) => odd(clean(x.o)) - odd(clean(y.o)) || score(y.o) - score(x.o));
      best = c[0] || { o: first, lang: lang2 };
    }
    let text = clean(best.o);
    if (!text || odd(text)) {
      const t0 = clean(first);
      if (t0 && !odd(t0)) text = t0;
    }
    return text.replace(/[\p{P}\s]/gu, "").length < 2 ? { error: "empty" } : { text, lang: best.lang };
  } catch (e) {
    console.log(JSON.stringify({ voice: "fail", message: String(e && e.message).slice(0, 300) }));
    return { error: "fail" };
  }
}

// tools/worker/daily.mjs
var H3 = 36e5;
var DAY4 = 24 * H3;
var DEF = { morning: true, evening: true, radar: true, sectors: true, pin: true, morningAt: "08:45", eveningAt: "21:00" };
var mem6 = /* @__PURE__ */ new Map();
async function kvGet5(env, k) {
  try {
    if (env.RATE) {
      const v = await env.RATE.get(k);
      if (v != null) return v;
    }
  } catch (_) {
  }
  return mem6.has(k) ? mem6.get(k) : null;
}
async function kvPut5(env, k, v, ttl) {
  mem6.set(k, v);
  try {
    if (env.RATE) await env.RATE.put(k, v, ttl ? { expirationTtl: ttl } : void 0);
  } catch (_) {
  }
}
var jget = async (env, k, d) => {
  try {
    const v = JSON.parse(await kvGet5(env, k) || "null");
    return v == null ? d : v;
  } catch (_) {
    return d;
  }
};
var jput = (env, k, v, ttl) => kvPut5(env, k, JSON.stringify(v), ttl);
var lang = (env) => langOf(env);
async function tg5(env, method, body) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return await r.json();
  } catch (_) {
    return { ok: false };
  }
}
var send = (env, v, extra = {}) => tg5(env, "sendMessage", { chat_id: chatOf(env), text: v.text.slice(0, 4e3), parse_mode: "HTML", disable_web_page_preview: true, ...v.buttons ? { reply_markup: { inline_keyboard: v.buttons } } : {}, ...extra });
var cb2 = (text, data) => ({ text, callback_data: data });
var url = (text, u) => ({ text, url: u });
var LIQ = "https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=";
var r24 = (v) => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
var r63 = (v) => v == null || !isFinite(v) ? null : +Number(v).toPrecision(6);
var mins = (hm2) => {
  const [h, m] = String(hm2).split(":").map(Number);
  return h * 60 + m;
};
async function getCfg(env) {
  return { ...DEF, ...isOwner(env) ? {} : { morning: false, evening: false, pin: false, radar: false, sectors: false }, ...await jget(env, K(env, "daily"), {}) };
}
async function setCfg(env, patch) {
  const c = { ...await getCfg(env), ...patch };
  await jput(env, K(env, "daily"), c);
  return c;
}
var WD = {
  en: {
    morning: "Smart morning",
    evening: "Smart evening",
    radar: "Leverage radar",
    sectors: "Sector radar",
    pin: "Live pinned message",
    on: "on",
    off: "off",
    dailyT: "\u{1F5D3} <b>The bot speaks first</b>",
    dailyNote: "Tap to turn on / off.",
    nowM: "\u2600\uFE0F Morning now",
    nowE: "\u{1F319} Evening now",
    back: "\u2B05\uFE0F Menu",
    plan: "\u{1F4CB} Plan",
    pf: "\u{1F4BC} Portfolio",
    mk: "\u{1F30D} Market",
    live: "Live",
    today: "today",
    alerts: (n) => `${n} alert${n === 1 ? "" : "s"}`,
    nearest: "nearest",
    away: "away",
    nextDca: "Next DCA",
    exit: "Exit",
    planS: "Plan",
    fng: "F&amp;G",
    updated: "updated",
    noUser: "Portfolio not connected.",
    refresh: "\u{1F504}",
    report: "\u{1F4CA} Full report"
  },
  ar: {
    morning: "\u0627\u0644\u0635\u0628\u0627\u062D \u0627\u0644\u0630\u0643\u064A",
    evening: "\u0627\u0644\u0645\u0633\u0627\u0621 \u0627\u0644\u0630\u0643\u064A",
    radar: "\u0631\u0627\u062F\u0627\u0631 \u0627\u0644\u0631\u0627\u0641\u0639\u0629",
    sectors: "\u0631\u0627\u062F\u0627\u0631 \u0627\u0644\u0642\u0637\u0627\u0639\u0627\u062A",
    pin: "\u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u0645\u062A\u062B\u0628\u062A\u0629",
    on: "\u0634\u063A\u0627\u0644",
    off: "\u0645\u0642\u0641\u0648\u0644",
    dailyT: "\u{1F5D3} <b>\u0627\u0644\u0628\u0648\u062A \u0628\u064A\u0628\u062F\u0623 \u0627\u0644\u0643\u0644\u0627\u0645</b>",
    dailyNote: "\u0627\u0636\u063A\u0637 \u0639\u0634\u0627\u0646 \u062A\u0634\u063A\u0651\u0644 / \u062A\u0642\u0641\u0644.",
    nowM: "\u2600\uFE0F \u0627\u0644\u0635\u0628\u0627\u062D \u062F\u0644\u0648\u0642\u062A\u064A",
    nowE: "\u{1F319} \u0627\u0644\u0645\u0633\u0627\u0621 \u062F\u0644\u0648\u0642\u062A\u064A",
    back: "\u2B05\uFE0F \u0627\u0644\u0642\u0627\u0626\u0645\u0629",
    plan: "\u{1F4CB} \u0627\u0644\u062E\u0637\u0629",
    pf: "\u{1F4BC} \u0645\u062D\u0641\u0638\u062A\u064A",
    mk: "\u{1F30D} \u0627\u0644\u0633\u0648\u0642",
    live: "\u0645\u0628\u0627\u0634\u0631",
    today: "\u0627\u0644\u064A\u0648\u0645",
    alerts: (n) => `${n} \u062A\u0646\u0628\u064A\u0647`,
    nearest: "\u0627\u0644\u0623\u0642\u0631\u0628",
    away: "\u0628\u0627\u0642\u064A",
    nextDca: "\u0627\u0644\u0640 DCA \u0627\u0644\u062C\u0627\u064A",
    exit: "\u0627\u0644\u062E\u0631\u0648\u062C",
    planS: "\u0627\u0644\u062E\u0637\u0629",
    fng: "\u0627\u0644\u062E\u0648\u0641/\u0627\u0644\u0637\u0645\u0639",
    updated: "\u0627\u062A\u062D\u062F\u0651\u062B",
    noUser: "\u0627\u0644\u0645\u062D\u0641\u0638\u0629 \u0645\u0634 \u0645\u062A\u0648\u0635\u0644\u0629.",
    refresh: "\u{1F504}",
    report: "\u{1F4CA} \u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u0643\u0627\u0645\u0644"
  }
};
async function gather(env, now) {
  const user = await loadUser(env).catch(() => null);
  if (!user) return null;
  const m = await loadMarket([], coinsOf(user));
  return { user, m, sum: summarize(withIds(user, m), m, now), cfg: settings(user.meta) };
}
function marketFacts(m, sum) {
  const g = m.global || {}, d = g.dom || {}, e = etfDay(m.etf);
  return {
    btc_usd: m.btc ? r63(m.btc.price) : null,
    btc_24h_pct: m.btc ? r24(m.btc.ch24) : null,
    fear_greed: m.fng ? { value: m.fng.value, label: m.fng.label, yesterday: m.fng.prev, week_ago: m.fng.week } : null,
    btc_dominance_pct: r24(d.btc),
    usdt_dominance_pct: r24(d.usdt),
    total_mcap_24h_pct: r24(g.mcapCh24),
    altcoin_season: m.alt && m.alt.value != null ? m.alt.value : null,
    etf_flows: e ? { day: e.label, btc_usd: Math.round(e.btc), eth_usd: Math.round(e.eth) } : null
  };
}
var pfFacts = (sum) => ({ value_usd: r24(sum.value), change_24h_pct: r24(sum.ch24), change_24h_usd: r24(sum.d24), all_time_profit_usd: r24(sum.total), all_time_profit_pct: r24(sum.pctTotal), vs_holding_btc_pct: r24(sum.vsBtc) });
function todo(sum, now) {
  const out = [], add = (prio, o) => out.push({ prio, ...o });
  const tomorrow = localParts(now + DAY4).date;
  for (const x of sum.dca || []) {
    if (x.s.state === "today") add(100, { what: "dca_today", coin: x.sym, buy_usd: r24(x.s.usd) });
    else if (x.s.state === "missed") add(90, { what: "dca_missed", coin: x.sym, buy_usd: r24(x.s.usd), days_late: x.s.late });
    else if (x.s.next === tomorrow) add(20, { what: "dca_tomorrow", coin: x.sym, buy_usd: r24(x.s.usd) });
  }
  for (const x of sum.buyAt || []) {
    const away = (x.price / x.at - 1) * 100;
    if (away <= 3) add(away <= 0 ? 95 : 85, { what: away <= 0 ? "at_buy_price" : "near_buy_price", coin: x.sym, price_usd: r63(x.price), your_buy_price_usd: r63(x.at), pct_above_buy_price: r24(away), still_to_buy: x.left != null ? r63(x.left) : null });
  }
  for (const t of sum.tps || []) {
    const to = (t.level / t.price - 1) * 100;
    if (to <= 0) add(92, { what: "take_profit_reached", coin: t.sym, tp: t.n, level_usd: r63(t.level), price_usd: r63(t.price), sell_pct: t.pct });
    else if (to <= 7) add(80, { what: "take_profit_close", coin: t.sym, tp: t.n, level_usd: r63(t.level), price_usd: r63(t.price), pct_to_go: r24(to), sell_pct: t.pct });
  }
  const met2 = (sum.macro || []).filter((x) => x.met).length;
  if (met2 >= 2) add(75, { what: "exit_conditions", met_of_3: met2 });
  if (sum.alloc) for (const g of sum.alloc.groups.filter((g2) => g2.state !== "ok").sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift)).slice(0, 1))
    add(50, { what: g.drift > 0 ? "allocation_over" : "allocation_under", group: sum.alloc.names[g.key] || g.key, now_pct: r24(g.now), target_pct: r24(g.target), usd_to_fix: Math.round(Math.abs(g.full)) });
  const rows = sum.coins.filter((c) => !isStable(c.sym) && c.value >= 5);
  rows.filter((c) => sum.signal[c.sym] === "reinforce").sort((a, b) => a.chg - b.chg).slice(0, 2).forEach((c) => add(40, { what: "reinforce_signal", coin: c.sym, pct_vs_your_avg: r24(c.chg), price_usd: r63(c.price), your_avg_usd: r63(c.avg) }));
  rows.filter((c) => sum.signal[c.sym] === "sell").sort((a, b) => b.chg - a.chg).slice(0, 2).forEach((c) => add(45, { what: "sell_signal", coin: c.sym, pct_vs_your_avg: r24(c.chg), price_usd: r63(c.price) }));
  return out.sort((a, b) => b.prio - a.prio).slice(0, 8).map(({ prio, ...o }) => o);
}
function nearest(alerts, m, sum) {
  const rows = [...m.top, ...m.top500], priceOf = (sym, cg) => {
    const r = cg && rows.find((x) => x.id === cg) || rows.find((x) => String(x.sym || "").toUpperCase() === sym);
    return r && r.price > 0 ? r.price : null;
  };
  const out = [];
  for (const a of alerts) {
    if (KINDS[a.kind].what !== "price") continue;
    const p = priceOf(a.sym, a.cg);
    if (!p) continue;
    out.push({ alert: describe(a), price_usd: r63(p), pct_away: r24(Math.abs(p / a.value - 1) * 100) });
  }
  for (const t of sum.tps || []) if (t.level > t.price) out.push({ level: `${t.sym} TP${t.n} ${usd(t.level)}`, price_usd: r63(t.price), pct_away: r24((t.level / t.price - 1) * 100) });
  for (const x of sum.buyAt || []) if (x.price > x.at) out.push({ level: `${x.sym} buy price ${usd(x.at)}`, price_usd: r63(x.price), pct_away: r24((x.price / x.at - 1) * 100) });
  return out.sort((a, b) => a.pct_away - b.pct_away).slice(0, 4);
}
async function morning(env, now = Date.now(), L = null) {
  L = L || await lang(env);
  const w = WD[L];
  const g = await gather(env, now);
  if (!g) return send(env, { text: w.noUser });
  const { m, sum } = g, tasks = todo(sum, now), alerts = await listAlerts(env);
  const facts = {
    time_riyadh: local(now, { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    portfolio: pfFacts(sum),
    market: marketFacts(m, sum),
    todo: tasks,
    closest_levels: nearest(alerts, m, sum),
    signals: sum.counts,
    plan_progress_pct: r24(sum.prog && sum.prog.pct)
  };
  await jput(env, K(env, "snap:" + localParts(now).date), { t: now, value: sum.value, btc: m.btc && m.btc.price, fng: m.fng && m.fng.value, dom: m.global && m.global.dom && m.global.dom.btc }, 2 * 86400);
  const body = await compose(env, "morning", L, facts) || plainMorning(L, facts);
  const head = `\u2600\uFE0F <b>${w.morning}</b> \xB7 ${esc(local(now, { weekday: "short", day: "numeric", month: "short" }))}`;
  return send(env, { text: head + "\n\n" + body, buttons: [[cb2(w.plan, "pl"), cb2(w.pf, "pf"), cb2(w.mk, "mk")]] });
}
async function evening(env, now = Date.now(), L = null) {
  L = L || await lang(env);
  const w = WD[L];
  const g = await gather(env, now);
  if (!g) return send(env, { text: w.noUser });
  const { user, m, sum } = g, day3 = localParts(now).date;
  const snap = await jget(env, K(env, "snap:" + day3), null), alerts = await listAlerts(env), log2 = await todayLog(env, now);
  const movers = sum.coins.filter((c) => !isStable(c.sym) && c.value >= 5 && c.ch24 != null).sort((a, b) => b.ch24 - a.ch24);
  const trades = (user.txs || []).filter((t) => t && t.date && localParts(Date.parse(t.date)).date === day3 && t.kind !== "pay" && ["buy", "sell"].includes(t.type)).slice(0, 6).map((t) => ({ type: t.type, coin: t.sym, amount: r63(t.qty), price_usd: r63(t.price) }));
  const d = await derivatives("BTC").catch(() => null);
  const sectors = (m.sectors || []).filter((s) => s.mcap >= 1e9 && s.ch24 != null);
  const facts = {
    time_riyadh: local(now, { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    portfolio: pfFacts(sum),
    since_morning: snap ? {
      portfolio_change_usd: r24(sum.value - snap.value),
      portfolio_change_pct: snap.value > 0 ? r24((sum.value / snap.value - 1) * 100) : null,
      btc_morning_usd: r63(snap.btc),
      btc_change_pct: snap.btc > 0 && m.btc ? r24((m.btc.price / snap.btc - 1) * 100) : null,
      fear_greed_morning: snap.fng,
      btc_dominance_morning: r24(snap.dom)
    } : null,
    best_coins_24h: movers.slice(0, 3).map((c) => ({ coin: c.sym, pct: r24(c.ch24) })),
    worst_coins_24h: movers.slice(-3).reverse().filter((c) => c.ch24 < 0).map((c) => ({ coin: c.sym, pct: r24(c.ch24) })),
    market: marketFacts(m, sum),
    btc_futures: d && d.summary ? { funding_8h_pct: d.summary.funding_8h_pct_avg, funding_reading: d.summary.funding_reading, open_interest_24h_pct: d.summary.open_interest_change_24h_pct, long_accounts_pct: d.summary.long_accounts_pct } : null,
    sectors_24h: sectors.length ? { best: sectors.filter((s) => s.ch24 > 0).sort((a, b) => b.ch24 - a.ch24).slice(0, 3).map((s) => ({ name: s.name, pct: r24(s.ch24) })), worst: sectors.filter((s) => s.ch24 < 0).sort((a, b) => a.ch24 - b.ch24).slice(0, 3).map((s) => ({ name: s.name, pct: r24(s.ch24) })) } : null,
    trades_today: trades,
    events_today: log2.map((e) => ({ time: local(e.t, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }), type: e.type, what: e.text })),
    closest_levels: nearest(alerts, m, sum),
    tomorrow: todo(sum, now).filter((x) => /dca_tomorrow|near_buy|take_profit_close/.test(x.what))
  };
  const body = await compose(env, "evening", L, facts) || plainEvening(L, facts);
  const head = `\u{1F319} <b>${w.evening}</b> \xB7 ${esc(local(now, { weekday: "short", day: "numeric", month: "short" }))}`;
  return send(env, { text: head + "\n\n" + body, buttons: [[cb2(w.pf, "pf"), cb2(w.mk, "mk")]] });
}
var TODO_TXT = {
  en: (x) => ({
    dca_today: `\u{1F6D2} DCA day: buy ${usd(x.buy_usd)} of ${x.coin}`,
    dca_missed: `\u23F0 DCA ${x.coin} ${x.days_late} days late (${usd(x.buy_usd)})`,
    dca_tomorrow: `\u{1F6D2} Tomorrow: DCA ${x.coin} ${usd(x.buy_usd)}`,
    at_buy_price: `\u{1F3AF} ${x.coin} ${usd(x.price_usd)} \u2014 at your buy price ${usd(x.your_buy_price_usd)}`,
    near_buy_price: `\u{1F3AF} ${x.coin} ${pct(x.pct_above_buy_price, 1)} above your buy price ${usd(x.your_buy_price_usd)}`,
    take_profit_reached: `\u{1F4B0} ${x.coin} reached TP${x.tp} ${usd(x.level_usd)} \u2014 sell ${x.sell_pct}%`,
    take_profit_close: `\u{1F4B0} ${x.coin} ${r24(x.pct_to_go)}% from TP${x.tp} ${usd(x.level_usd)}`,
    exit_conditions: `\u{1F6AA} Exit: ${x.met_of_3}/3 conditions met`,
    allocation_over: `\u2696\uFE0F ${x.group} ${x.now_pct}% vs ${x.target_pct}% \u2014 trim ${usd(x.usd_to_fix)}`,
    allocation_under: `\u2696\uFE0F ${x.group} ${x.now_pct}% vs ${x.target_pct}% \u2014 add ${usd(x.usd_to_fix)}`,
    reinforce_signal: `\u{1F7E2} ${x.coin} ${pct(x.pct_vs_your_avg, 1)} vs your avg \u2014 Reinforce`,
    sell_signal: `\u{1F534} ${x.coin} ${pct(x.pct_vs_your_avg, 1)} vs your avg \u2014 Sell / convert`
  })[x.what],
  ar: (x) => ({
    dca_today: `\u{1F6D2} \u064A\u0648\u0645 \u0627\u0644\u0640 DCA: \u0627\u0634\u062A\u0631\u064A ${x.coin} \u0628\u0640 ${usd(x.buy_usd)}`,
    dca_missed: `\u23F0 DCA ${x.coin} \u0645\u062A\u0623\u062E\u0631 ${x.days_late} \u064A\u0648\u0645 (${usd(x.buy_usd)})`,
    dca_tomorrow: `\u{1F6D2} \u0628\u0643\u0631\u0629: DCA ${x.coin} ${usd(x.buy_usd)}`,
    at_buy_price: `\u{1F3AF} ${x.coin} ${usd(x.price_usd)} \u2014 \u0648\u0635\u0644 \u0633\u0639\u0631 \u0627\u0644\u0634\u0631\u0627\u0621 \u0628\u062A\u0627\u0639\u0643 ${usd(x.your_buy_price_usd)}`,
    near_buy_price: `\u{1F3AF} ${x.coin} \u0641\u0648\u0642 \u0633\u0639\u0631 \u0627\u0644\u0634\u0631\u0627\u0621 ${usd(x.your_buy_price_usd)} \u0628\u0640 ${pct(x.pct_above_buy_price, 1)}`,
    take_profit_reached: `\u{1F4B0} ${x.coin} \u0648\u0635\u0644 TP${x.tp} ${usd(x.level_usd)} \u2014 \u0628\u064A\u0639 ${x.sell_pct}%`,
    take_profit_close: `\u{1F4B0} ${x.coin} \u0628\u0627\u0642\u064A ${r24(x.pct_to_go)}% \u0639\u0644\u0649 TP${x.tp} ${usd(x.level_usd)}`,
    exit_conditions: `\u{1F6AA} \u0627\u0644\u062E\u0631\u0648\u062C: ${x.met_of_3}/3 \u0634\u0631\u0648\u0637 \u0627\u062A\u062D\u0642\u0642\u062A`,
    allocation_over: `\u2696\uFE0F ${x.group} ${x.now_pct}% \u0648\u0627\u0644\u0647\u062F\u0641 ${x.target_pct}% \u2014 \u0642\u0644\u0651\u0644 ${usd(x.usd_to_fix)}`,
    allocation_under: `\u2696\uFE0F ${x.group} ${x.now_pct}% \u0648\u0627\u0644\u0647\u062F\u0641 ${x.target_pct}% \u2014 \u0632\u0648\u0651\u062F ${usd(x.usd_to_fix)}`,
    reinforce_signal: `\u{1F7E2} ${x.coin} ${pct(x.pct_vs_your_avg, 1)} \u0645\u0646 \u0645\u062A\u0648\u0633\u0637\u0643 \u2014 \u062A\u0639\u0632\u064A\u0632`,
    sell_signal: `\u{1F534} ${x.coin} ${pct(x.pct_vs_your_avg, 1)} \u0645\u0646 \u0645\u062A\u0648\u0633\u0637\u0643 \u2014 \u0628\u064A\u0639 / \u062A\u062D\u0648\u064A\u0644`
  })[x.what]
};
function plainMorning(L, f) {
  const ar = L === "ar", p = f.portfolio, mk = f.market;
  const t = f.todo.slice(0, 3).map((x, i) => `${i + 1}. ${esc(TODO_TXT[L](x))}`);
  if (!t.length) t.push(ar ? "1. \u0645\u0641\u064A\u0634 \u062D\u0627\u062C\u0629 \u0645\u0637\u0644\u0648\u0628\u0629 \u0627\u0644\u0646\u0647\u0627\u0631\u062F\u0647 \u2014 \u0627\u062D\u062A\u0641\u0638 \u2705" : "1. Nothing to do today \u2014 hold \u2705");
  return [
    `\u{1F4BC} <b>${usd2(p.value_usd)}</b> ${dot(p.change_24h_pct)} ${pct(p.change_24h_pct)}`,
    "",
    `\u{1F3AF} <b>${ar ? "\u0627\u0644\u0646\u0647\u0627\u0631\u062F\u0647" : "Today"}</b>`,
    ...t,
    "",
    `\u{1F30D} BTC <b>${usd(mk.btc_usd)}</b> ${pct(mk.btc_24h_pct)}${mk.fear_greed ? ` \xB7 F&amp;G <b>${mk.fear_greed.value}</b>` : ""}`
  ].join("\n");
}
function plainEvening(L, f) {
  const ar = L === "ar", p = f.portfolio, s = f.since_morning, out = [`\u{1F4BC} <b>${usd2(p.value_usd)}</b> ${dot(p.change_24h_pct)} ${pct(p.change_24h_pct)} 24h`];
  if (s) out.push(`${ar ? "\u0645\u0646 \u0627\u0644\u0635\u0628\u062D" : "Since the morning"}: <b>${s.portfolio_change_usd >= 0 ? "+" : "\u2212"}${usd2(Math.abs(s.portfolio_change_usd))}</b>`);
  if (f.best_coins_24h.length) out.push(`\u{1F4C8} ${f.best_coins_24h.map((c) => `${esc(c.coin)} ${pct(c.pct, 1)}`).join(" \xB7 ")}`);
  if (f.worst_coins_24h.length) out.push(`\u{1F4C9} ${f.worst_coins_24h.map((c) => `${esc(c.coin)} ${pct(c.pct, 1)}`).join(" \xB7 ")}`);
  if (f.closest_levels.length) out.push("", `\u{1F440} <b>${ar ? "\u0631\u0627\u0642\u0628" : "Watch"}</b>`, ...f.closest_levels.slice(0, 3).map((x) => `\u2022 ${esc(x.alert || x.level)} \u2014 ${x.pct_away}%`));
  return out.join("\n");
}
var RADAR_TXT = {
  en: {
    hot_longs: "Crowded longs \u2014 funding very positive",
    hot_shorts: "Crowded shorts \u2014 funding negative",
    oi_up: "Leverage piling up \u2014 open interest jumped",
    oi_down: "Leverage flushed out \u2014 open interest fell",
    crowd_long: "Most accounts are long",
    crowd_short: "Most accounts are short",
    fund: "Funding",
    yr: "yr",
    oi: "Open interest 24h",
    longs: "Long accounts",
    liq: "Liquidations (OKX)",
    longsW: "longs",
    shortsW: "shorts",
    noteL: "One-sided longs: a dip can cascade (long squeeze). Check the Liq Map.",
    noteS: "One-sided shorts: a pump can cascade (short squeeze). Check the Liq Map.",
    noteN: "Leverage changed fast \u2014 volatility likely. Check the Liq Map."
  },
  ar: {
    hot_longs: "\u0644\u0648\u0646\u062C\u0627\u062A \u0632\u062D\u0645\u0629 \u2014 \u0627\u0644\u062A\u0645\u0648\u064A\u0644 \u0645\u0648\u062C\u0628 \u062C\u062F\u0627\u064B",
    hot_shorts: "\u0634\u0648\u0631\u062A\u0627\u062A \u0632\u062D\u0645\u0629 \u2014 \u0627\u0644\u062A\u0645\u0648\u064A\u0644 \u0633\u0627\u0644\u0628",
    oi_up: "\u0627\u0644\u0631\u0627\u0641\u0639\u0629 \u0628\u062A\u0632\u064A\u062F \u2014 \u0627\u0644\u0640 OI \u0642\u0641\u0632",
    oi_down: "\u0627\u0644\u0631\u0627\u0641\u0639\u0629 \u0627\u062A\u0645\u0633\u062D\u062A \u2014 \u0627\u0644\u0640 OI \u0646\u0632\u0644",
    crowd_long: "\u0623\u063A\u0644\u0628 \u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A \u0644\u0648\u0646\u062C",
    crowd_short: "\u0623\u063A\u0644\u0628 \u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A \u0634\u0648\u0631\u062A",
    fund: "\u0627\u0644\u062A\u0645\u0648\u064A\u0644",
    yr: "\u0633\u0646\u0648\u064A",
    oi: "\u0627\u0644\u0640 OI \u0641\u064A 24\u0633",
    longs: "\u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0644\u0648\u0646\u062C",
    liq: "\u0627\u0644\u062A\u0635\u0641\u064A\u0627\u062A (OKX)",
    longsW: "\u0644\u0648\u0646\u062C",
    shortsW: "\u0634\u0648\u0631\u062A",
    noteL: "\u0627\u0644\u0644\u0648\u0646\u062C\u0627\u062A \u0645\u062A\u0643\u062F\u0633\u0629: \u0623\u064A \u0646\u0632\u0648\u0644 \u0645\u0645\u0643\u0646 \u064A\u0639\u0645\u0644 \u062A\u0635\u0641\u064A\u0627\u062A \u0645\u062A\u062A\u0627\u0644\u064A\u0629. \u0634\u0648\u0641 \u0627\u0644\u0640 Liq Map.",
    noteS: "\u0627\u0644\u0634\u0648\u0631\u062A\u0627\u062A \u0645\u062A\u0643\u062F\u0633\u0629: \u0623\u064A \u0635\u0639\u0648\u062F \u0645\u0645\u0643\u0646 \u064A\u0639\u0645\u0644 \u062A\u0635\u0641\u064A\u0627\u062A \u0645\u062A\u062A\u0627\u0644\u064A\u0629. \u0634\u0648\u0641 \u0627\u0644\u0640 Liq Map.",
    noteN: "\u0627\u0644\u0631\u0627\u0641\u0639\u0629 \u0627\u062A\u063A\u064A\u0631\u062A \u0628\u0633\u0631\u0639\u0629 \u2014 \u0645\u062A\u0648\u0642\u0639 \u062A\u0630\u0628\u0630\u0628. \u0634\u0648\u0641 \u0627\u0644\u0640 Liq Map."
  }
};
function radarFindings(s) {
  const f = [];
  if (s.funding_annualized_pct != null) {
    if (s.funding_annualized_pct >= 40) f.push("hot_longs");
    else if (s.funding_annualized_pct <= -15) f.push("hot_shorts");
  }
  if (s.open_interest_change_24h_pct != null) {
    if (s.open_interest_change_24h_pct >= 15) f.push("oi_up");
    else if (s.open_interest_change_24h_pct <= -15) f.push("oi_down");
  }
  if (s.long_accounts_pct != null) {
    if (s.long_accounts_pct >= 75) f.push("crowd_long");
    else if (s.long_accounts_pct <= 35) f.push("crowd_short");
  }
  return f;
}
async function radar(env, now = Date.now()) {
  const user = await loadUser(env).catch(() => null), fut = await loadFutures().catch(() => null);
  let list2 = ["BTC"], idOf = { BTC: "bitcoin" };
  if (user) {
    const m = await loadMarket([], coinsOf(user)), sum = summarize(withIds(user, m), m, now);
    idOf = { ...m.idOf, BTC: "bitcoin" };
    list2 = [.../* @__PURE__ */ new Set(["BTC", ...sum.coins.filter((c) => !isStable(c.sym) && (!fut || fut.has(c.sym))).sort((a, b) => b.value - a.value).slice(0, 3).map((c) => c.sym)])];
  }
  const i = (+await kvGet5(env, K(env, "radar:i")) || 0) % list2.length, sym = list2[i];
  await kvPut5(env, K(env, "radar:i"), String(i + 1));
  const d = await derivatives(sym).catch(() => null);
  if (!d || !d.summary) return { sym, sent: 0 };
  const s = d.summary, seen = await jget(env, K(env, "radar:seen"), {});
  for (const k of Object.keys(seen)) if (now - seen[k] > 2 * DAY4) delete seen[k];
  const fresh = radarFindings(s).filter((k) => !(now - (seen[sym + ":" + k] || 0) < 12 * H3));
  if (!fresh.length) {
    await jput(env, K(env, "radar:seen"), seen);
    return { sym, sent: 0 };
  }
  const L = await lang(env), w = RADAR_TXT[L], ww = WD[L];
  const lines = [`\u{1F9F2} <b>${ww.radar} \xB7 ${esc(sym)}</b>`, ...fresh.map((k) => `\u26A0\uFE0F <b>${w[k]}</b>`), ""];
  if (s.funding_8h_pct_avg != null) lines.push(`\u2022 ${w.fund}: <b>${s.funding_8h_pct_avg > 0 ? "+" : ""}${s.funding_8h_pct_avg}%</b> / 8h (\u2248 ${s.funding_annualized_pct > 0 ? "+" : ""}${s.funding_annualized_pct}% ${w.yr})`);
  if (s.open_interest_change_24h_pct != null) lines.push(`\u2022 ${w.oi}: <b>${pct(s.open_interest_change_24h_pct, 1)}</b>${s.open_interest_usd_total ? " (" + usd(s.open_interest_usd_total) + ")" : ""}`);
  if (s.long_accounts_pct != null) lines.push(`\u2022 ${w.longs}: <b>${r24(s.long_accounts_pct)}%</b>`);
  if (s.liquidations_24h) lines.push(`\u2022 ${w.liq}: ${w.longsW} ${usd(s.liquidations_24h.longs_usd)} \xB7 ${w.shortsW} ${usd(s.liquidations_24h.shorts_usd)}`);
  const longSide = fresh.some((k) => /hot_longs|crowd_long/.test(k)), shortSide = fresh.some((k) => /hot_shorts|crowd_short/.test(k));
  lines.push("", `<i>${longSide && !shortSide ? w.noteL : shortSide && !longSide ? w.noteS : w.noteN}</i>`);
  const r = await send(env, { text: lines.join("\n"), buttons: [[url("\u{1F525} Liq Map", LIQ + encodeURIComponent(sym)), cb2("\u{1FA99} " + sym, "c:" + String(idOf[sym] || "x-" + sym.toLowerCase()).slice(0, 58))]] });
  if (r && r.ok) {
    fresh.forEach((k) => {
      seen[sym + ":" + k] = now;
    });
    await logEvent(env, "radar", sym + ": " + fresh.map((k) => RADAR_TXT.en[k]).join(", "), now);
  }
  await jput(env, K(env, "radar:seen"), seen);
  return { sym, sent: r && r.ok ? 1 : 0 };
}
async function sectorRadar(env, now = Date.now()) {
  const user = await loadUser(env).catch(() => null);
  const m = await loadMarket([], user ? coinsOf(user) : []);
  const big2 = (m.sectors || []).filter((s) => s && s.mcap >= 1e9 && s.ch24 != null && Math.abs(s.ch24) >= 10);
  if (!big2.length) return { sent: 0 };
  const day3 = localParts(now).date, seen = await jget(env, K(env, "sector:seen"), {});
  const fresh = big2.filter((s) => seen[s.id] !== day3).sort((a, b) => Math.abs(b.ch24) - Math.abs(a.ch24)).slice(0, 3);
  if (!fresh.length) return { sent: 0 };
  const mine = new Set(user ? Object.values(m.idOf).filter(Boolean) : []), symOf = (id) => (Object.entries(m.idOf).find(([, v]) => v === id) || [])[0];
  const L = await lang(env), ar = L === "ar", w = WD[L];
  const lines = [`\u{1F525} <b>${w.sectors}</b>`, ""];
  for (const s of fresh) {
    const held = (s.top || []).filter((id) => mine.has(id)).map(symOf).filter(Boolean);
    lines.push(`${s.ch24 > 0 ? "\u{1F680}" : "\u{1F53B}"} <b>${esc(s.name)}</b> ${pct(s.ch24, 1)} \xB7 ${usd(s.mcap)}${held.length ? `
   ${ar ? "\u0645\u0639\u0627\u0643 \u0645\u0646 \u0642\u0627\u062F\u062A\u0647" : "you hold its leaders"}: <b>${esc(held.join(", "))}</b>` : ""}`);
  }
  const r = await send(env, { text: lines.join("\n"), buttons: [[cb2(w.mk, "mk"), cb2(w.pf, "pf")]] });
  if (r && r.ok) {
    fresh.forEach((s) => {
      seen[s.id] = day3;
    });
    for (const k of Object.keys(seen)) if (seen[k] !== day3) delete seen[k];
    await jput(env, K(env, "sector:seen"), seen);
    await logEvent(env, "sector", fresh.map((s) => s.name + " " + pct(s.ch24, 1)).join(", "), now);
  }
  return { sent: r && r.ok ? 1 : 0 };
}
async function pinView(env, now = Date.now()) {
  const L = await lang(env), w = WD[L], g = await gather(env, now);
  if (!g) return null;
  const { m, sum } = g, alerts = await listAlerts(env), near = nearest(alerts, m, sum).filter((x) => x.alert)[0];
  const dca = (sum.dca || []).filter((x) => x.s.next).sort((a, b) => a.s.next.localeCompare(b.s.next))[0];
  const met2 = (sum.macro || []).filter((x) => x.met).length;
  const me = isOwner(env) ? null : await member(env), star = me && premiumNow(me) ? " \u2B50" : "", heart = me && me.supporter ? " \u{1F49B}" : "";
  const L1 = [
    `\u{1F4CC} <b>${w.live}</b>${star}${heart} \xB7 ${w.updated} ${local(now, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`,
    `\u{1F4BC} <b>${usd2(sum.value)}</b>  ${dot(sum.ch24)} ${pct(sum.ch24)} ${w.today}`,
    m.btc ? `\u{1FA99} BTC <b>${usd(m.btc.price)}</b>  ${dot(m.btc.ch24)} ${pct(m.btc.ch24)}${m.fng ? ` \xB7 ${w.fng} <b>${m.fng.value}</b>` : ""}` : null,
    `\u{1F4CB} ${w.planS} <b>${sum.prog ? sum.prog.pct.toFixed(1) : "0"}%</b> \xB7 \u{1F6AA} ${w.exit} <b>${met2}/3</b>`,
    dca ? `\u{1F6D2} ${w.nextDca}: <b>${esc(dca.sym)}</b> \xB7 ${esc((/* @__PURE__ */ new Date(dca.s.next + "T12:00:00Z")).toLocaleDateString("en-US", { month: "short", day: "numeric" }))}` : null,
    alerts.length ? `\u{1F514} ${w.alerts(alerts.length)}${near ? ` \xB7 ${w.nearest}: ${esc(near.alert)} (${near.pct_away}% ${w.away})` : ""}` : null
  ].filter(Boolean);
  const origin = await kvGet5(env, "tg:origin");
  return { text: L1.join("\n"), buttons: [[cb2(w.pf, "pf"), cb2(w.mk, "mk"), cb2(w.refresh, "pin:r")], ...origin ? [[{ text: w.report, web_app: { url: origin + "/tg/app" } }]] : []] };
}
async function pinUpdate(env, now = Date.now(), force = false, fresh = false) {
  const v = await pinView(env, now);
  if (!v) return { ok: false };
  const st = await jget(env, K(env, "pin"), {});
  const body = v.text.split("\n").slice(1).join("\n");
  if (!force && st.id && st.body === body && now - (st.t || 0) < H3) return { ok: true, same: true };
  if (st.id && !fresh) {
    const r3 = await tg5(env, "editMessageText", { chat_id: chatOf(env), message_id: st.id, text: v.text, parse_mode: "HTML", reply_markup: { inline_keyboard: v.buttons } });
    if ((r3.ok || /not modified/i.test(r3.description || "")) && force) await tg5(env, "pinChatMessage", { chat_id: chatOf(env), message_id: st.id, disable_notification: true }).catch(() => {
    });
    if (r3.ok || /not modified/i.test(r3.description || "")) {
      await jput(env, K(env, "pin"), { id: st.id, body, t: now });
      return { ok: true, id: st.id };
    }
  }
  const r = await send(env, v, { disable_notification: true });
  const id = r && r.ok && r.result && r.result.message_id;
  if (!id) return { ok: false };
  await tg5(env, "pinChatMessage", { chat_id: chatOf(env), message_id: id, disable_notification: true });
  if (st.id) {
    await tg5(env, "unpinChatMessage", { chat_id: chatOf(env), message_id: st.id }).catch(() => {
    });
    if (fresh) await tg5(env, "deleteMessage", { chat_id: chatOf(env), message_id: st.id }).catch(() => {
    });
  }
  await jput(env, K(env, "pin"), { id, body, t: now });
  return { ok: true, id, new: true };
}
async function unpin(env) {
  const st = await jget(env, K(env, "pin"), {});
  if (st.id) await tg5(env, "unpinChatMessage", { chat_id: chatOf(env), message_id: st.id });
  await jput(env, K(env, "pin"), {});
}
async function viewDaily(env) {
  const L = await lang(env), w = WD[L], c = await getCfg(env);
  const row2 = (k) => cb2(`${c[k] ? "\u2705" : "\u2B1C"} ${w[k]}`, "dy:" + k);
  const at = { morning: c.morningAt, evening: c.eveningAt, radar: L === "ar" ? "\u0643\u0644 30 \u062F\u0642\u064A\u0642\u0629" : "every 30 min", sectors: L === "ar" ? "\u0643\u0644 \u0633\u0627\u0639\u0629" : "hourly", pin: L === "ar" ? "\u0643\u0644 15 \u062F\u0642\u064A\u0642\u0629" : "every 15 min" };
  const lines = [w.dailyT, "", ...["morning", "evening", "radar", "sectors", "pin"].map((k) => `${c[k] ? "\u2705" : "\u2B1C"} ${w[k]} \xB7 <i>${at[k]}</i>`), "", `<i>${w.dailyNote}</i>`];
  return { text: lines.join("\n"), buttons: [[row2("morning"), row2("evening")], [row2("radar"), row2("sectors")], [row2("pin")], [cb2(w.nowM, "dy:now:m"), cb2(w.nowE, "dy:now:e")], [cb2(w.back, "menu")]] };
}
async function runDaily(env, now = Date.now()) {
  if (!env.TELEGRAM_BOT_TOKEN || !chatOf(env)) return { job: null };
  const c = await getCfg(env), lp = localParts(now), sent = await jget(env, K(env, "daily:sent"), {}), min = new Date(now).getUTCMinutes();
  const due = (on, at, k) => {
    const late = mins(lp.hm) - mins(at);
    return on && late >= 0 && late < 180 && sent[k] !== lp.date;
  };
  const done = async (k) => {
    sent[k] = lp.date;
    await jput(env, K(env, "daily:sent"), sent);
  };
  if (due(c.morning, c.morningAt, "morning")) {
    await done("morning");
    await morning(env, now);
    return { job: "morning" };
  }
  if (due(c.evening, c.eveningAt, "evening")) {
    await done("evening");
    await evening(env, now);
    return { job: "evening" };
  }
  if (c.pin && min % 15 === 0) {
    await pinUpdate(env, now);
    return { job: "pin" };
  }
  if (c.radar && min % 30 === 10) return { job: "radar", ...await radar(env, now) };
  if (c.sectors && min % 60 === 25) return { job: "sectors", ...await sectorRadar(env, now) };
  return { job: null };
}
var REPO = "drsamirsaad1981-design/samsam-portfolio";
async function kickPrices(env, now = Date.now()) {
  if (!env.GH_DISPATCH_TOKEN) return { kick: "no token" };
  const m = await loadMarket([], []).catch(() => null), t = m && m.parts && Date.parse(m.parts.top);
  if (!t || now - t < 25 * 6e4) return { kick: "fresh" };
  const last = +await kvGet5(env, "tg:kick") || 0;
  if (now - last < 20 * 6e4) return { kick: "waiting" };
  await kvPut5(env, "tg:kick", String(now), 3600);
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/prices.yml/dispatches`, {
    method: "POST",
    headers: { authorization: "Bearer " + env.GH_DISPATCH_TOKEN, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "samsam-worker", "content-type": "application/json" },
    body: JSON.stringify({ ref: "main" })
  }).catch(() => null);
  const ok2 = !!(r && r.status === 204);
  if (!ok2) console.log(JSON.stringify({ kick: "refused", status: r && r.status }));
  return { kick: ok2 ? "sent" : "refused", age_min: Math.round((now - t) / 6e4) };
}

// tools/worker/bot.mjs
var H4 = 36e5;
var LIQ2 = "https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=";
var T = {
  en: {
    hi: "Hi Samir \u{1F44B}",
    hiAll: "Hi \u{1F44B}",
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
    aiOwnKey: "\u{1F511} Claude refused your own API key (wrong, removed, or out of credit). Fix it in the app: Settings \u2192 My Claude key.",
    aiBusy: "Claude is busy right now \u2014 try again in a minute.",
    aiErr: "I couldn't answer that just now \u2014 try again, or rephrase.",
    newChat: "\u{1F195} New chat",
    newDone: "New chat \u2014 I forgot the earlier messages \u{1F9F9}",
    aiLeft: (a, n) => `${a}/${n} left today`,
    data: "Data",
    ownerOnly: "Only the bot owner can do that.",
    noLink: "Your portfolio isn't linked yet. In the app: Settings \u2192 \u{1F517} Link the Telegram bot (no app yet? send /app with your e-mail). Meanwhile the market, any coin, alerts, paper trading and questions all work.",
    alertsB: "\u{1F514} Alerts",
    alertGone: "\u{1F5D1} Alert deleted",
    dailyB: "\u{1F5D3} Daily",
    paperB: "\u{1F9EA} Paper",
    report: "\u{1F4CA} Report",
    reportT: "\u{1F4CA} <b>Your full report</b> \u2014 opens inside Telegram.",
    working: "\u23F3 On it\u2026",
    pinOff: "Pinned message off \u2014 /pin brings it back.",
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
    hiAll: "\u0623\u0647\u0644\u0627\u064B \u{1F44B}",
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
    aiOwnKey: "\u{1F511} Claude \u0631\u0641\u0636 \u0645\u0641\u062A\u0627\u062D\u0643 (\u063A\u0644\u0637\u060C \u0623\u0648 \u0627\u062A\u0634\u0627\u0644\u060C \u0623\u0648 \u0627\u0644\u0631\u0635\u064A\u062F \u062E\u0644\u0635). \u0635\u0644\u0651\u062D\u0647 \u0645\u0646 \u0627\u0644\u062A\u0637\u0628\u064A\u0642: \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u2190 My Claude key.",
    aiBusy: "Claude \u0645\u0634\u063A\u0648\u0644 \u062F\u0644\u0648\u0642\u062A\u064A \u2014 \u062C\u0631\u0651\u0628 \u0643\u0645\u0627\u0646 \u062F\u0642\u064A\u0642\u0629.",
    aiErr: "\u0645\u0627 \u0642\u062F\u0631\u062A\u0634 \u0623\u062C\u0627\u0648\u0628 \u062F\u0644\u0648\u0642\u062A\u064A \u2014 \u062C\u0631\u0651\u0628 \u062A\u0627\u0646\u064A \u0623\u0648 \u0627\u0643\u062A\u0628 \u0627\u0644\u0633\u0624\u0627\u0644 \u0628\u0634\u0643\u0644 \u062A\u0627\u0646\u064A.",
    newChat: "\u{1F195} \u0645\u062D\u0627\u062F\u062B\u0629 \u062C\u062F\u064A\u062F\u0629",
    newDone: "\u0645\u062D\u0627\u062F\u062B\u0629 \u062C\u062F\u064A\u062F\u0629 \u2014 \u0646\u0633\u064A\u062A \u0627\u0644\u0643\u0644\u0627\u0645 \u0627\u0644\u0644\u064A \u0641\u0627\u062A \u{1F9F9}",
    aiLeft: (a, n) => `\u0628\u0627\u0642\u064A ${a}/${n} \u0627\u0644\u0646\u0647\u0627\u0631\u062F\u0647`,
    data: "\u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A",
    ownerOnly: "\u062F\u0647 \u0644\u0635\u0627\u062D\u0628 \u0627\u0644\u0628\u0648\u062A \u0628\u0633.",
    noLink: "\u0645\u062D\u0641\u0638\u062A\u0643 \u0644\u0633\u0647 \u0645\u0634 \u0645\u0631\u0628\u0648\u0637\u0629. \u0645\u0646 \u0627\u0644\u062A\u0637\u0628\u064A\u0642: \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u2190 \u{1F517} Link the Telegram bot (\u0644\u0633\u0647 \u0645\u0639\u0646\u062F\u0643\u0634 \u0627\u0644\u062A\u0637\u0628\u064A\u0642\u061F \u0627\u0628\u0639\u062A /app \u0648\u0627\u0644\u0625\u064A\u0645\u064A\u0644). \u0644\u062D\u062F \u0643\u062F\u0647 \u0627\u0644\u0633\u0648\u0642\u060C \u0648\u0623\u064A \u0639\u0645\u0644\u0629\u060C \u0648\u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A\u060C \u0648\u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A\u060C \u0648\u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0643\u0644\u0647\u0627 \u0634\u063A\u0627\u0644\u0629.",
    alertsB: "\u{1F514} \u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A",
    alertGone: "\u{1F5D1} \u0627\u062A\u0645\u0633\u062D \u0627\u0644\u062A\u0646\u0628\u064A\u0647",
    dailyB: "\u{1F5D3} \u0627\u0644\u064A\u0648\u0645\u064A",
    paperB: "\u{1F9EA} \u062A\u062C\u0631\u064A\u0628\u064A",
    report: "\u{1F4CA} \u0627\u0644\u062A\u0642\u0631\u064A\u0631",
    reportT: "\u{1F4CA} <b>\u062A\u0642\u0631\u064A\u0631\u0643 \u0627\u0644\u0643\u0627\u0645\u0644</b> \u2014 \u0628\u064A\u0641\u062A\u062D \u062C\u0648\u0647 \u062A\u0644\u064A\u062C\u0631\u0627\u0645.",
    working: "\u23F3 \u062B\u0648\u0627\u0646\u064A\u2026",
    pinOff: "\u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u0645\u062A\u062B\u0628\u062A\u0629 \u0627\u062A\u0642\u0641\u0644\u062A \u2014 /pin \u062A\u0631\u062C\u0651\u0639\u0647\u0627.",
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
var cb3 = (text, data) => ({ text, callback_data: data });
var ORIGIN = null;
var appBtn = (t, origin = ORIGIN) => origin ? { text: t.report, web_app: { url: origin + "/tg/app" } } : null;
var url2 = (text, u) => ({ text, url: u });
var price2 = (v) => !(v > 0) ? "\u2014" : v >= 1e3 ? usd2(v).replace(/\.\d\d$/, "") : v >= 1 ? usd2(v) : "$" + (+v.toPrecision(4)).toString();
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
var menuRows = (t) => [[cb3(t.pf, "pf"), cb3(t.market, "mk")], [cb3(t.plan, "pl"), cb3(t.movers, "mv")], [cb3(t.signals, "sg"), cb3(t.exit, "ex")], [cb3(t.alertsB, "al"), cb3(t.coin, "coin")], [cb3(t.dailyB, "dy"), cb3(t.paperB, "pp")], [appBtn(t), cb3(t.other, "lang:" + t.otherCode)].filter(Boolean)];
var replyKb = (t) => ({ keyboard: [[{ text: t.kb.pf }, { text: t.kb.mk }, { text: t.kb.pl }], [{ text: t.kb.ex }, { text: t.kb.mv }, { text: t.kb.sg }]], resize_keyboard: true, is_persistent: false, input_field_placeholder: "btc \xB7 sol eth \xB7 /menu" });
var KB_ACT = () => Object.fromEntries(Object.values(T).flatMap((L) => [...Object.entries(L.kb), ...Object.entries(L.kbOld || {})].map(([act2, text]) => [text, act2])));
var memLang = /* @__PURE__ */ new Map();
async function getLang(env) {
  return langOf(env, memLang.get(chatOf(env)));
}
var memRange = /* @__PURE__ */ new Map();
async function getRange(env) {
  let v = memRange.get(chatOf(env));
  try {
    if (env.RATE) v = +await env.RATE.get(K(env, "mk")) || v;
  } catch (_) {
  }
  return RANGES.includes(+v) ? +v : 100;
}
async function setRange(env, v) {
  memRange.set(chatOf(env), v);
  try {
    if (env.RATE) await env.RATE.put(K(env, "mk"), String(v));
  } catch (_) {
  }
}
async function setLang(env, v) {
  memLang.set(chatOf(env), v);
  try {
    if (env.RATE) await env.RATE.put(K(env, "lang"), v);
  } catch (_) {
  }
  if (!isOwner(env)) await setMember(env, chatOf(env), { lang: v }).catch(() => {
  });
}
function viewMenu(t, owner2 = true, badge = "") {
  return { text: `${owner2 ? t.hi : badge ? t.hiAll.replace("\u{1F44B}", badge) : t.hiAll}
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
  return { text: L.join("\n"), buttons: [[cb3(t.refresh, "pf"), cb3(t.movers, "mv")], [cb3(t.plan, "pl"), cb3(t.exit, "ex")], [cb3(t.signals, "sg"), url2(t.openApp, APP)], [cb3(t.back, "menu")]] };
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
    L.push("", `<b>${esc(sym)}</b> \xB7 ${price2(list2[0].price)}`);
    list2.sort((a, b) => a.n - b.n).forEach((x) => L.push(`${x.to <= 0 ? "\u2705" : "\u2B1C"} TP${x.n} ${price2(x.level)} \xB7 ${x.to <= 0 ? t.reached : `+${x.to.toFixed(0)}%`}${x.pct ? ` \xB7 ${x.pct}%` : ""}`));
  }
  if (bySym.size > 8) L.push("", `<i>${t.more(bySym.size - 8)}</i>`);
  return { text: L.join("\n"), buttons: [[cb3(t.refresh, "ex"), url2(t.openExit, APP + "accumulation.html#exit")], [cb3(t.pf, "pf"), cb3(t.back, "menu")]] };
}
function viewMovers(t, sum) {
  const list2 = sum.coins.filter((c) => c.value >= 1 && !isStable(c.sym));
  const block = (key, title, dir) => {
    const rows = list2.filter((c) => c[key] != null).sort((a, b) => dir * (b[key] - a[key])).slice(0, 5).filter((c) => dir > 0 ? c[key] > 0 : c[key] < 0);
    return rows.length ? [``, `${dir > 0 ? "\u{1F4C8}" : "\u{1F4C9}"} <b>${title}</b>`, ...rows.map((c) => `<code>${esc(c.sym.padEnd(6))} ${pct(c[key], 1).padStart(7)}</code>  ${usd(c.value)}`)] : [];
  };
  const L = [`\u{1F3C6} <b>${esc(t.mvT)}</b>  <i>(${t.noStable})</i>`, ...block("ch24", t.best24, 1), ...block("ch24", t.worst24, -1), ...block("ch7", t.best7, 1), ...block("ch7", t.worst7, -1)];
  return { text: L.join("\n"), buttons: [[cb3(t.refresh, "mv"), cb3(t.pf, "pf")], [cb3(t.back, "menu")]] };
}
function viewSignals(t, sum) {
  const by = { reinforce: [], sell: [], hold: [] };
  for (const c of sum.coins) (by[sum.signal[c.sym]] || by.hold).push(c);
  const L = [`\u{1F3AF} <b>${t.sigT}</b>`];
  for (const k of ["reinforce", "sell", "hold"]) {
    if (!by[k].length) continue;
    L.push("", `<b>${t[k]}</b> (${by[k].length})`);
    by[k].sort((a, b) => a.chg - b.chg).slice(0, 12).forEach((c) => L.push(`<code>${esc(c.sym.padEnd(6))} ${pct(c.chg, 1).padStart(7)}</code>  ${t.vsAvg} ${price2(c.avg)}`));
    if (by[k].length > 12) L.push("\u2026");
  }
  return { text: L.join("\n"), buttons: [[cb3(t.refresh, "sg"), cb3(t.pf, "pf")], [cb3(t.back, "menu")]] };
}
function viewPlan(t, sum, now) {
  if (!sum.plan.length && !(sum.dca || []).length && !(sum.buyAt || []).length) return { text: `\u{1F4CB} <b>${t.planT}</b>

${t.noPlan}`, buttons: [[url2(t.openApp, APP + "accumulation.html"), cb3(t.back, "menu")]] };
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
      L.push(`<code>${esc(x.sym.padEnd(6))}</code> ${price2(x.at)} \xB7 ${price2(x.price)} ${d > 0 ? `(${pct(d, 1)} ${t.away})` : "\u2705"}`);
    });
  }
  return { text: L.join("\n"), buttons: [[cb3(t.refresh, "pl"), url2(t.openApp, APP + "accumulation.html")], [cb3(t.back, "menu")]] };
}
var RANGES = [100, 200, 300, 500];
function viewMarket(t, m, now, range = 100) {
  const L = [`\u{1F30D} <b>${t.mkT}</b> \xB7 ${hm(now)}`, "", ...marketShort(t, m)];
  const seen = /* @__PURE__ */ new Set(), top = [...m.top || [], ...m.top500 || []].filter((r) => r.rank && r.rank <= range && r.ch24 != null && r.sym && !isStable(r.sym) && !seen.has(r.id) && seen.add(r.id));
  const line = (r) => row(r.sym, r.ch24, price2(r.price));
  const up = [...top].sort((a, b) => b.ch24 - a.ch24).slice(0, 5), dn = [...top].sort((a, b) => a.ch24 - b.ch24).slice(0, 5);
  if (up.length) L.push("", `\u{1F4C8} <b>${t.topUp(range)}</b>`, ...up.map(line));
  if (dn.length) L.push("", `\u{1F4C9} <b>${t.topDn(range)}</b>`, ...dn.map(line));
  const st = (m.stocks || []).filter((r) => r.ch24 != null && r.price > 0);
  if (st.length) {
    const sUp = [...st].sort((a, b) => b.ch24 - a.ch24).slice(0, 5), sDn = [...st].sort((a, b) => a.ch24 - b.ch24).slice(0, 5);
    L.push("", `\u{1F3E6} <b>${t.stUp}</b>`, ...sUp.map(line), "", `\u{1F3E6} <b>${t.stDn}</b>`, ...sDn.map(line), `<i>${t.stNote}</i>`);
  }
  return { text: L.join("\n"), buttons: [RANGES.map((n) => cb3((n === range ? "\u2713 " : "") + "Top " + n, "mk:" + n)), [cb3(t.refresh, "mk:" + range), url2("\u{1F9ED} Market Hub", APP + "market.html")], [cb3(t.back, "menu")]] };
}
function viewCoin(t, coin, m, sum, now) {
  const row2 = [...m.top, ...m.top500].find((r) => r.id === coin.id) || {}, s = m.series[coin.id];
  const symU = (coin.sym || row2.sym || "").toUpperCase(), held = sum && sum.coins.find((c) => c.sym === symU);
  const p = row2.price > 0 ? row2.price : s ? s.last : held && held.price > 0 ? held.price : null;
  const ch7 = row2.ch7 != null ? row2.ch7 : s && p && s.at(now - 7 * 24 * H4) ? (p / s.at(now - 7 * 24 * H4) - 1) * 100 : null;
  const sym = (coin.sym || row2.sym || "").toUpperCase(), name = coin.name || row2.name || sym;
  const L = [
    `\u{1FA99} <b>${esc(name)}</b> (${esc(sym)})${row2.rank ? ` \xB7 #${row2.rank}` : ""}`,
    "",
    `\u{1F4B2} <b>${price2(p)}</b>   ${dot(row2.ch24)} ${pct(row2.ch24, 1)} ${t.h24} \xB7 ${dot(ch7)} ${pct(ch7, 1)} ${t.d7}`
  ];
  const sp = spark(row2.spark);
  if (sp) L.push(`<code>${sp}</code>  ${t.d7}`);
  if (row2.mcap || row2.vol) L.push(`\u{1F4CA} ${t.cap} ${big(row2.mcap)} \xB7 ${t.vol} ${big(row2.vol)}`);
  const mine = sum && sum.coins.find((c) => c.sym === sym);
  if (mine) L.push("", `\u{1F45B} ${t.you} <b>${qty(mine.qty)} ${esc(sym)}</b> = ${usd2(mine.value)}`, `${t.avg} ${price2(mine.avg)} \xB7 ${dot(mine.chg)} ${pct(mine.chg, 1)} \xB7 ${t.signal}: ${t[sum.signal[sym]] || t.hold}`);
  else if (sum) L.push("", `\u{1F45B} ${t.noHold}`);
  const lv = m.live[coin.id], src = typeof lv === "string" ? lv : t.src;
  const age = lv ? t.live : m.parts && m.parts.top ? t.snap(Math.max(1, Math.round((now - Date.parse(m.parts.top)) / 6e4))) : "";
  L.push("", `<i>${src}${age ? " \xB7 " + age : ""}</i>`);
  const btns = [[cb3(t.refresh, "c:" + coin.id.slice(0, 58)), url2(t.liq, LIQ2 + encodeURIComponent(sym))], [url2(t.chart, /^x-/.test(coin.id) ? "https://www.tradingview.com/symbols/" + encodeURIComponent(sym) + "USDT/" : "https://www.coingecko.com/en/coins/" + encodeURIComponent(coin.id))]];
  if (mine) btns[1].push(url2(t.inApp, APP + "index.html#holdings/" + encodeURIComponent(sym)));
  btns.push([cb3(t.back, "menu")]);
  return { text: L.join("\n"), buttons: btns };
}
async function tg6(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false }));
}
var send2 = (env, chat, v, extra = {}) => tg6(env, "sendMessage", { chat_id: chat, text: v.text.slice(0, 4e3), parse_mode: "HTML", disable_web_page_preview: true, ...v.buttons ? { reply_markup: { inline_keyboard: v.buttons } } : {}, ...extra });
var edit = (env, chat, msgId, v) => tg6(env, "editMessageText", { chat_id: chat, message_id: msgId, text: v.text.slice(0, 4e3), parse_mode: "HTML", disable_web_page_preview: true, ...v.buttons ? { reply_markup: { inline_keyboard: v.buttons } } : {} });
var WORDS = [
  [/^\/?(start|menu|help|القائمة|مساعدة|ابدأ)$/i, "menu"],
  [/^\/?(portfolio|pf|wallet)$|محفظتي|المحفظة/i, "pf"],
  [/^\/?(market|mk)$|السوق/i, "mk"],
  [/^\/?(plan|pl)$|الخطة/i, "pl"],
  [/^\/?(hide|اخفي|إخفاء|اخفاء)$/i, "hide"],
  [/^\/(new|reset|clear)$|^محادثة جديدة$/i, "new"],
  [/^\/(forget|delete)$|^امسح بياناتي$/i, "fg"],
  [/^\/?(alerts|al)$|^التنبيهات$|^تنبيهاتي$/i, "al"],
  [/^\/invite$/i, "inv"],
  [/^\/(users|members)$/i, "us"],
  [/^\/(link|start\s+L)\s*[A-Za-z0-9]{8}$/i, "link"],
  [/^\/app(\s+\S+)?$/i, "app"],
  [/^\/(start\s+)?premium$|^المميز$/i, "prem"],
  [/^\/(start\s+)?support$|^ادعم$/i, "sup"],
  [/^\/stats$/i, "stats"],
  [/^\/guide$|^الدليل$|^دليل$/i, "gd"],
  [/^\/(community|group|channel)$|^المجتمع$|^الجروب$/i, "cm"],
  [/^\/community setup$/i, "cm:setup"],
  [/^\/community guide$/i, "cm:guide"],
  [/^\/announce\s+[\s\S]+$/i, "ann"],
  [/^\/start\s+\S+$/i, "menu"],
  [/^\/(report|app)$|^التقرير$/i, "rp"],
  [/^\/(daily|settings)$|^اليومي$/i, "dy"],
  [/^\/(paper|practice)$|^تجريبي$/i, "pp"],
  [/^\/morning$/i, "dy:now:m"],
  [/^\/evening$/i, "dy:now:e"],
  [/^\/pin$/i, "pin:on"],
  [/^\/unpin$/i, "pin:off"],
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
  if (/^[^@\s/]+@[^@\s]+\.[^@\s]+$/.test(String(text || "").trim())) return { act: "app" };
  const s = String(text || "").trim().replace(/@\w+/, "").replace(/^[^\p{L}\p{N}\/$]+/u, "").trim();
  const m = /^\/(price|p|coin)\s+(.+)$/i.exec(s);
  if (m) return { act: "coins", q: m[2].split(/[\s,]+/).filter(Boolean).slice(0, 5) };
  for (const [rx, act2] of WORDS) if (rx.test(s)) return { act: act2 };
  if (/^\$?[A-Za-z][A-Za-z0-9]{1,11}([\s,]+\$?[A-Za-z][A-Za-z0-9]{1,11}){0,4}$/.test(s)) return { act: "coins", q: s.split(/[\s,]+/).filter(Boolean), guess: String(text || "").trim() };
  return { act: "ai", q: String(text || "").trim() };
}
async function buildView(env, act2, arg, guess) {
  const now = Date.now();
  const user = act2 === "menu" || act2 === "coin" ? null : await loadUser(env).catch(() => null);
  const cfg = settings(user && user.meta), lang2 = await getLang(env), t = T[lang2];
  if (act2 === "menu") return { t, views: [viewMenu(t, isOwner(env), await badgeOf(env, t))] };
  if (act2 === "lang") return { t, views: [{ text: "\u{1F310} English / \u0639\u0631\u0628\u064A", buttons: [[cb3("\u{1F1EC}\u{1F1E7} English", "lang:en"), cb3("\u{1F1F8}\u{1F1E6} \u0639\u0631\u0628\u064A", "lang:ar")]] }] };
  if (act2 === "coin") return { t, views: [{ text: `\u{1FA99} ${t.askCoin}`, buttons: [[cb3(t.back, "menu")]] }] };
  if (act2 === "soon") return { t, views: [{ text: t.soon, buttons: menuRows(t) }] };
  const needUser = ["pf", "pl", "mv", "sg", "ex"].includes(act2);
  if (needUser && !user) return { t, views: [{ text: isOwner(env) ? t.noUser : t.noLink, buttons: [[cb3(t.market, "mk"), cb3(t.back, "menu")]] }] };
  const mine = coinsOf(user);
  if (act2 === "coins") {
    const m0 = await loadMarket([], mine);
    if (guess) {
      const known = (w) => {
        const W3 = String(w).toUpperCase().replace(/^\$/, ""), lw = String(w).toLowerCase();
        return mine.some((c) => c.sym === W3) || !!m0.cgIds[W3] || [...m0.top, ...m0.top500].some((r) => String(r.sym || "").toUpperCase() === W3 || String(r.name || "").toLowerCase() === lw || r.id === lw);
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
    miss.forEach((q) => views.push({ text: t.notFound(esc(q)), buttons: [[cb3(t.back, "menu")]] }));
    return { t, views };
  }
  const m = await loadMarket([], mine);
  if (act2 === "mk") return { t, views: [viewMarket(t, m, now, await getRange(env))] };
  const sum = summarize(withIds(user, m), m, now);
  if (act2 === "pf") return { t, views: [viewPortfolio(t, cfg, sum, m, now)] };
  if (act2 === "mv") return { t, views: [viewMovers(t, sum)] };
  if (act2 === "sg") return { t, views: [viewSignals(t, sum)] };
  if (act2 === "pl") return { t, views: [viewPlan(t, sum, now)] };
  if (act2 === "ex") return { t, views: [viewExit(t, sum, now)] };
  return { t, views: [viewMenu(t, isOwner(env), await badgeOf(env, t))] };
}
var ok = () => new Response("ok", { headers: { "content-type": "text/plain" } });
async function handleTelegram(request, env) {
  if (request.method !== "POST") return new Response("Not found", { status: 404 });
  if (!env.TG_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TG_SECRET) return new Response("Forbidden", { status: 403 });
  resetBudget();
  const origin = new URL(request.url).origin;
  if (ORIGIN !== origin) {
    ORIGIN = origin;
    try {
      if (env.RATE) await env.RATE.put("tg:origin", origin);
    } catch (_) {
    }
  }
  const u = await request.json().catch(() => null);
  if (!u) return ok();
  await ensureHook(env, request);
  if (u.pre_checkout_query) {
    await preCheckout(env, u.pre_checkout_query);
    return ok();
  }
  if (u.my_chat_member) {
    await onMyChatMember(env, u);
    return ok();
  }
  if (u.chat_join_request) {
    await onJoinRequest(env, u);
    return ok();
  }
  const msg = u.message || u.edited_message, q = u.callback_query;
  const chat = msg ? msg.chat && msg.chat.id : q && q.message && q.message.chat && q.message.chat.id;
  if (chat == null) return ok();
  if (!await allowed(env, chat)) return stranger(env, u, msg, chat);
  if (String(chat) !== String(env.TELEGRAM_CHAT_ID)) {
    const x = (await members(env))[String(chat)] || {}, ar = x.lang === "ar";
    const quiet = () => q ? tg6(env, "answerCallbackQuery", { callback_query_id: q.id }).catch(() => {
    }) : null;
    if (x.paused) {
      await quiet();
      if (await strangerOnce(env, chat)) await tg6(env, "sendMessage", { chat_id: chat, text: ar ? "\u23F8 \u0627\u0644\u0628\u0648\u062A \u0645\u062A\u0648\u0642\u0641 \u0639\u0646\u062F\u0643 \u0645\u0624\u0642\u062A\u0627\u064B \u2014 \u0643\u0644\u0651\u0645 Dr. Samir Saad." : "\u23F8 The bot is paused for you for now \u2014 ask Dr. Samir Saad." }).catch(() => {
      });
      return ok();
    }
    const f = await flood(env, chat);
    if (f !== "ok") {
      await quiet();
      if (f === "warn") await tg6(env, "sendMessage", { chat_id: chat, text: ar ? "\u{1F30A} \u0631\u0633\u0627\u064A\u0644 \u0643\u062A\u064A\u0631 \u0648\u0631\u0627 \u0628\u0639\u0636 \u2014 \u0627\u0633\u062A\u0646\u0649 \u062F\u0642\u064A\u0642\u0629 \u0648\u0643\u0645\u0651\u0644 \u{1F642}" : "\u{1F30A} That's a lot of messages at once \u2014 wait a minute, then carry on \u{1F642}" }).catch(() => {
      });
      return ok();
    }
  }
  await migrateOwner(env);
  return asChat(chat, () => onUpdate(env, u, msg, q, chat));
}
var STR = {
  en: {
    private: "\u{1F512} This bot is private. If you have an invite code, send it here.",
    bad: "\u274C That invite code is not valid (or was already used).",
    full: "The bot is full right now \u2014 ask the owner.",
    welcome: (n) => `\u{1F44B} Welcome, ${n}! You're in \u2705
Ask me anything about crypto in plain words, tap a button below, or send a ticker like <code>btc</code>.
Your portfolio isn't linked yet \u2014 that comes next.
\u{1F4D8} <code>/guide</code> \u2014 everything the bot and the app can do.`,
    joined: (n, u) => `\u{1F464} <b>${n}</b>${u ? " (@" + u + ")" : ""} joined with your invite.`
  },
  ar: {
    private: "\u{1F512} \u0627\u0644\u0628\u0648\u062A \u062F\u0647 \u062E\u0627\u0635. \u0644\u0648 \u0645\u0639\u0627\u0643 \u0643\u0648\u062F \u062F\u0639\u0648\u0629 \u0627\u0628\u0639\u062A\u0647 \u0647\u0646\u0627.",
    bad: "\u274C \u0643\u0648\u062F \u0627\u0644\u062F\u0639\u0648\u0629 \u062F\u0647 \u0645\u0634 \u0635\u0627\u0644\u062D (\u0623\u0648 \u0627\u062A\u0633\u062A\u0639\u0645\u0644 \u0642\u0628\u0644 \u0643\u062F\u0647).",
    full: "\u0627\u0644\u0628\u0648\u062A \u0645\u0644\u064A\u0627\u0646 \u062F\u0644\u0648\u0642\u062A\u064A \u2014 \u0643\u0644\u0651\u0645 \u0635\u0627\u062D\u0628\u0647.",
    welcome: (n) => `\u{1F44B} \u0623\u0647\u0644\u0627\u064B ${n}! \u062F\u062E\u0644\u062A \u2705
\u0627\u0633\u0623\u0644\u0646\u064A \u0623\u064A \u062D\u0627\u062C\u0629 \u0639\u0646 \u0627\u0644\u0643\u0631\u064A\u0628\u062A\u0648 \u0628\u0627\u0644\u0643\u0644\u0627\u0645\u060C \u0623\u0648 \u0627\u0636\u063A\u0637 \u0632\u0631\u0627\u0631 \u062A\u062D\u062A\u060C \u0623\u0648 \u0627\u0628\u0639\u062A \u0631\u0645\u0632 \u0632\u064A <code>btc</code>.
\u0645\u062D\u0641\u0638\u062A\u0643 \u0644\u0633\u0647 \u0645\u0634 \u0645\u0631\u0628\u0648\u0637\u0629 \u2014 \u062F\u064A \u0627\u0644\u062E\u0637\u0648\u0629 \u0627\u0644\u062C\u0627\u064A\u0629.
\u{1F4D8} <code>/guide</code> \u2014 \u0643\u0644 \u0627\u0644\u0644\u064A \u0627\u0644\u0628\u0648\u062A \u0648\u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062C \u0628\u064A\u0639\u0645\u0644\u0648\u0647.`,
    joined: (n, u) => `\u{1F464} <b>${n}</b>${u ? " (@" + u + ")" : ""} \u062F\u062E\u0644 \u0628\u062F\u0639\u0648\u062A\u0643.`
  }
};
async function stranger(env, u, msg, chat) {
  if (!msg || !msg.chat || msg.chat.type !== "private" || typeof msg.text !== "string") return ok();
  if (!await firstTime(env, u.update_id)) return ok();
  const L = /^ar/.test(msg.from && msg.from.language_code || "") ? "ar" : "en", w = STR[L];
  const lk = (/^\/(?:start\s+L|link\s*)([A-Za-z0-9]{8})$/i.exec(msg.text.trim()) || [])[1];
  if (lk) {
    const hit = await findLinkCode(env, lk.toUpperCase()), x = hit && await moveAppMember(env, hit.uid, chat, msg.from);
    if (x) {
      await asChat(chat, async () => {
        await setLang(env, L);
        await setCfg(env, { morning: true, evening: true, pin: true, radar: true, sectors: true });
        const t = T[L];
        await send2(env, chat, { text: w.welcome(esc(x.name)).split("\n").slice(0, 2).join("\n") + "\n" + AW[L].linked }, { reply_markup: replyKb(t) });
        await send2(env, chat, viewMenu(t, false));
      });
      await asChat(env.TELEGRAM_CHAT_ID, async () => send2(env, env.TELEGRAM_CHAT_ID, { text: STR[await getLang(env)].joined(esc(x.name), esc(x.user)) + " \xB7 \u{1F4F1}\u2192\u{1F916}", buttons: [[cb3("\u{1F465} /users", "us")]] }));
      return ok();
    }
  }
  const code = (/^\/start\s+([A-Za-z0-9]{8})\b/.exec(msg.text.trim()) || /^([A-Za-z0-9]{8})$/.exec(msg.text.trim()) || [])[1];
  if (code) {
    const r = await useInvite(env, code, chat, msg.from);
    if (r.ok) {
      await asChat(chat, async () => {
        await setLang(env, L);
        const t = T[L];
        await send2(env, chat, { text: w.welcome(esc(r.member.name)) }, { reply_markup: replyKb(t) });
        await send2(env, chat, viewMenu(t, isOwner(env)));
      });
      await asChat(env.TELEGRAM_CHAT_ID, async () => send2(env, env.TELEGRAM_CHAT_ID, { text: STR[await getLang(env)].joined(esc(r.member.name), esc(r.member.user)), buttons: [[cb3("\u{1F465} /users", "us")]] }));
      return ok();
    }
    if (await strangerOnce(env, chat)) await send2(env, chat, { text: r.error === "full" ? w.full : w.bad });
    return ok();
  }
  if (await strangerOnce(env, chat)) await send2(env, chat, { text: w.private });
  return ok();
}
async function viewUsers(env, lang2) {
  const m = await members(env), ar = lang2 === "ar", list2 = Object.entries(m);
  const mx = await maxMembers(env), L = [ar ? `\u{1F465} <b>\u0627\u0644\u0623\u0639\u0636\u0627\u0621</b> (${list2.length}/${mx})` : `\u{1F465} <b>Members</b> (${list2.length}/${mx})`, ""];
  if (!list2.length) L.push(ar ? "\u0644\u0633\u0647 \u0645\u0641\u064A\u0634 \u062D\u062F. \u0627\u0636\u063A\u0637 \u2795 \u0644\u0643\u0648\u062F \u062F\u0639\u0648\u0629." : "Nobody yet. Tap \u2795 for an invite code.");
  const used2 = await Promise.all(list2.map(([c, x]) => usedToday(env, c, x)));
  list2.forEach(([c, x], i) => L.push(`${i + 1}. ${x.paused ? "\u23F8 " : ""}${premiumNow(x) ? "\u2B50 " : ""}${x.supporter ? "\u{1F49B} " : ""}<b>${esc(x.name)}</b>${x.user ? " @" + esc(x.user) : ""} \xB7 <i>${esc(local(x.joined, { day: "numeric", month: "short" }))}</i>${x.email ? " \xB7 \u{1F4F1}" : ""}${x.uid ? " \xB7 \u{1F517}" : ""}
    ${ar ? "\u0627\u0644\u0646\u0647\u0627\u0631\u062F\u0647" : "today"} \u{1F9E0} ${used2[i].q}/${Number.isFinite(x.ai) ? x.ai : DEF_AI} \xB7 \u{1F4CA} ${used2[i].r}/${Number.isFinite(x.reports) ? x.reports : DEF_REPORTS}`));
  if (list2.length) L.push("", ar ? "<i>\u0627\u0636\u063A\u0637 \u0639\u0644\u0649 \u0627\u0633\u0645 \u0639\u0634\u0627\u0646 \u062A\u063A\u064A\u0651\u0631 \u062D\u062F\u0648\u062F\u0647 \u0623\u0648 \u062A\u0634\u064A\u0644\u0647 \xB7 \u{1F4F1} \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \xB7 \u{1F517} \u0627\u0644\u0645\u062D\u0641\u0638\u0629 \u0645\u0631\u0628\u0648\u0637\u0629</i>" : "<i>Tap a name to change their limits or remove them \xB7 \u{1F4F1} app \xB7 \u{1F517} portfolio linked</i>");
  const b = [];
  for (let i = 0; i < list2.length; i += 3) b.push(list2.slice(i, i + 3).map(([c, x], j) => cb3(`${i + j + 1}. ${x.name.split(" ")[0].slice(0, 12)}${x.uid ? " \u{1F517}" : x.email ? " \u{1F4F1}" : ""}`, "us:m:" + c)));
  b.push([cb3(ar ? "\u2795 \u062F\u0639\u0648\u0629 \u062C\u062F\u064A\u062F\u0629" : "\u2795 New invite", "us:inv"), cb3(T[lang2].back, "menu")]);
  return { text: L.join("\n"), buttons: b };
}
async function inviteMsg(env, lang2) {
  const code = await newInvite(env), ar = lang2 === "ar";
  let bot = null;
  try {
    bot = env.RATE ? await env.RATE.get("tg:botname") : null;
  } catch (_) {
  }
  if (!bot) {
    const me = await tg6(env, "getMe", {}).catch(() => null);
    bot = me && me.ok && me.result && me.result.username;
    if (bot) try {
      if (env.RATE) await env.RATE.put("tg:botname", bot);
    } catch (_) {
    }
  }
  const link = bot ? `https://t.me/${bot}?start=${code}` : null;
  return { text: (ar ? `\u{1F39F} <b>\u0643\u0648\u062F \u062F\u0639\u0648\u0629</b> \u2014 \u0645\u0631\u0629 \u0648\u0627\u062D\u062F\u0629\u060C \u0635\u0627\u0644\u062D 7 \u0623\u064A\u0627\u0645:

<code>${code}</code>` : `\u{1F39F} <b>Invite code</b> \u2014 works once, for 7 days:

<code>${code}</code>`) + (link ? ar ? `

\u0623\u0648 \u0627\u0628\u0639\u062A\u0644\u0647 \u0627\u0644\u0644\u064A\u0646\u0643 \u062F\u0647 (\u064A\u0641\u062A\u062D \u0627\u0644\u0628\u0648\u062A \u0648\u064A\u062F\u062E\u0644 \u0639\u0644\u0649 \u0637\u0648\u0644):
${link}` : `

Or send this link (opens the bot and lets them in):
${link}` : ""), buttons: [[cb3(ar ? "\u{1F465} \u0627\u0644\u0623\u0639\u0636\u0627\u0621" : "\u{1F465} Members", "us")]] };
}
var FG = {
  en: {
    ask: "\u{1F9F9} <b>Delete everything the bot keeps for you?</b>\nYour alerts, chat memory, language, daily settings, pinned message, radars and paper portfolio \u2014 and the link to your portfolio.\n\nYour portfolio in the app is NOT touched (it stays yours). You can link again any time.",
    yes: "\u2705 Yes, delete",
    no: "\u274C Cancel",
    done: "\u{1F9F9} Done \u2014 the bot has forgotten everything about you. Your app portfolio is untouched.\nTo link again: the app \u2192 Settings \u2192 Link the Telegram bot.",
    kept: "OK \u2014 nothing was deleted.",
    owner: "That is for invited members. For you: /new clears the AI chat; your settings stay."
  },
  ar: {
    ask: "\u{1F9F9} <b>\u0623\u0645\u0633\u062D \u0643\u0644 \u062D\u0627\u062C\u0629 \u0627\u0644\u0628\u0648\u062A \u0634\u0627\u064A\u0644\u0647\u0627 \u0639\u0646\u0643\u061F</b>\n\u062A\u0646\u0628\u064A\u0647\u0627\u062A\u0643\u060C \u0648\u0630\u0627\u0643\u0631\u0629 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629\u060C \u0648\u0627\u0644\u0644\u063A\u0629\u060C \u0648\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u064A\u0648\u0645\u064A\u060C \u0648\u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u0645\u062A\u062B\u0628\u062A\u0629\u060C \u0648\u0627\u0644\u0631\u0627\u062F\u0627\u0631\u0627\u062A\u060C \u0648\u0627\u0644\u062A\u062F\u0627\u0648\u0644 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A \u2014 \u0648\u0631\u0628\u0637 \u0645\u062D\u0641\u0638\u062A\u0643.\n\n\u0645\u062D\u0641\u0638\u062A\u0643 \u0641\u064A \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0645\u0627 \u062A\u062A\u0644\u0645\u0633\u0634 (\u0641\u0627\u0636\u0644\u0629 \u0628\u062A\u0627\u0639\u062A\u0643). \u0648\u062A\u0642\u062F\u0631 \u062A\u0631\u0628\u0637 \u062A\u0627\u0646\u064A \u0641\u064A \u0623\u064A \u0648\u0642\u062A.",
    yes: "\u2705 \u0623\u064A\u0648\u0647 \u0627\u0645\u0633\u062D",
    no: "\u274C \u0644\u0623",
    done: "\u{1F9F9} \u062E\u0644\u0627\u0635 \u2014 \u0627\u0644\u0628\u0648\u062A \u0646\u0633\u064A \u0643\u0644 \u062D\u0627\u062C\u0629 \u0639\u0646\u0643. \u0645\u062D\u0641\u0638\u062A\u0643 \u0641\u064A \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0632\u064A \u0645\u0627 \u0647\u064A.\n\u0639\u0634\u0627\u0646 \u062A\u0631\u0628\u0637 \u062A\u0627\u0646\u064A: \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u2190 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u2190 Link the Telegram bot.",
    kept: "\u062A\u0645\u0627\u0645 \u2014 \u0645\u0627 \u0627\u062A\u0645\u0633\u062D\u0634 \u062D\u0627\u062C\u0629.",
    owner: "\u062F\u0647 \u0644\u0644\u0623\u0639\u0636\u0627\u0621. \u0644\u064A\u0643 \u0627\u0646\u062A: /new \u064A\u0645\u0633\u062D \u0645\u062D\u0627\u062F\u062B\u0629 \u0627\u0644\u0640 AI\u060C \u0648\u0625\u0639\u062F\u0627\u062F\u0627\u062A\u0643 \u0632\u064A \u0645\u0627 \u0647\u064A."
  }
};
async function usedToday(env, c, x) {
  let q = 0, r = 0;
  try {
    if (env.RATE) {
      q = +await env.RATE.get(`tg:${c}:ai:${localParts(Date.now()).date}`) || 0;
      if (x.uid) r = +await env.RATE.get(`ai:${x.uid}:${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`) || 0;
    }
  } catch (_) {
  }
  return { q, r };
}
var LRI = "\u2066";
var PDI = "\u2069";
function gLine(l, ar) {
  let s = /^•\s/.test(l) ? "\u25E6 " + l.slice(2) : "\u2022 " + l;
  if (ar) s = s.replace(/<(code|b|i)>([^<]*)<\/\1>/g, (m, t, x) => /[\u0600-\u06FF]/.test(x) ? m : `${LRI}<${t}>${x}</${t}>${PDI}`);
  return s;
}
function guideView(lang2, k = null) {
  const L = lang2 === "ar" ? "ar" : "en", ar = L === "ar", s = k && guide_default.sections.find((x) => x.k === k);
  if (s) return { text: `${s.e} <b>${s.t[L]}</b>

` + s[L].map((l) => gLine(l, ar)).join("\n\n"), buttons: [[cb3(ar ? "\u{1F4D8} \u0627\u0644\u062F\u0644\u064A\u0644" : "\u{1F4D8} Guide", "gd"), cb3(ar ? "\u2B05\uFE0F \u0627\u0644\u0642\u0627\u0626\u0645\u0629" : "\u2B05\uFE0F Menu", "menu")]] };
  const b = [];
  for (let i = 0; i < guide_default.sections.length; i += 2) b.push(guide_default.sections.slice(i, i + 2).map((x) => cb3(`${x.e} ${(x.b || x.t)[L]}`, "gd:" + x.k)));
  b.push([cb3(ar ? "\u2B05\uFE0F \u0627\u0644\u0642\u0627\u0626\u0645\u0629" : "\u2B05\uFE0F Menu", "menu")]);
  return { text: `<b>${guide_default.title[L]}</b>

${guide_default.intro[L]}`, buttons: b };
}
async function badgeOf(env, t) {
  if (isOwner(env)) return "";
  const x = await member(env);
  if (!x) return "";
  const ar = t === T.ar, p = premiumNow(x), s = !!x.supporter;
  if (!p && !s) return "";
  return [p ? ar ? "\u2B50 \u2014 \u0639\u0636\u0648 \u0645\u0645\u064A\u0632" : "\u2B50 \u2014 premium member" : "\u{1F44B}", s ? "\u{1F49B} Supporter" : ""].filter(Boolean).join(" \xB7 ");
}
var AW = {
  en: {
    ask: "Send the e-mail you will sign in with, like:\n<code>/app you@example.com</code>\n(Google, or any e-mail with a sign-in link.)",
    sent: "\u{1F4E8} Sent to Dr. Samir Saad for approval \u2014 you'll get a message here.",
    owner: "\u{1F4F1} You already have the app \u{1F642}",
    req: (n, e) => `\u{1F4F1} <b>${n}</b> asks to open the app with
<code>${e}</code>`,
    ok: (e) => `\u2705 You can open the app now with <b>${e}</b>:
${APP}
Then Settings \u2192 \u{1F517} Link the Telegram bot, to see your portfolio here.`,
    no: "Your app request was not approved.",
    linked: "\u{1F517} Linked \u2705 \u2014 your portfolio, plan and exit plan now show here (only to you).",
    badCode: "\u274C That code is not valid or is over 10 minutes old \u2014 make a new one in the app (Settings \u2192 Link the Telegram bot).",
    notYou: "\u274C That code was made by another e-mail than the one approved for you.",
    ownerLink: "Your portfolio is already the bot's \u{1F642}"
  },
  ar: {
    ask: "\u0627\u0628\u0639\u062A \u0627\u0644\u0625\u064A\u0645\u064A\u0644 \u0627\u0644\u0644\u064A \u0647\u062A\u062F\u062E\u0644 \u0628\u064A\u0647\u060C \u0643\u062F\u0647:\n<code>/app you@example.com</code>\n(Google\u060C \u0623\u0648 \u0623\u064A \u0625\u064A\u0645\u064A\u0644 \u0628\u0644\u064A\u0646\u0643 \u062F\u062E\u0648\u0644.)",
    sent: "\u{1F4E8} \u0627\u062A\u0628\u0639\u062A \u0644\u0640 Dr. Samir Saad \u064A\u0648\u0627\u0641\u0642 \u2014 \u0647\u064A\u0648\u0635\u0644\u0643 \u0631\u062F \u0647\u0646\u0627.",
    owner: "\u{1F4F1} \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0645\u0639\u0627\u0643 \u0623\u0635\u0644\u0627\u064B \u{1F642}",
    req: (n, e) => `\u{1F4F1} <b>${n}</b> \u0639\u0627\u064A\u0632 \u064A\u0641\u062A\u062D \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0628\u0640
<code>${e}</code>`,
    ok: (e) => `\u2705 \u062A\u0642\u062F\u0631 \u062A\u0641\u062A\u062D \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u062F\u0644\u0648\u0642\u062A\u064A \u0628\u0640 <b>${e}</b>:
${APP}
\u0648\u0628\u0639\u062F\u064A\u0646 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u2190 \u{1F517} Link the Telegram bot \u0639\u0634\u0627\u0646 \u0645\u062D\u0641\u0638\u062A\u0643 \u062A\u0638\u0647\u0631 \u0647\u0646\u0627.`,
    no: "\u0637\u0644\u0628 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0645\u0627 \u0627\u062A\u0648\u0627\u0641\u0642\u0634 \u0639\u0644\u064A\u0647.",
    linked: "\u{1F517} \u0627\u062A\u0631\u0628\u0637\u062A \u2705 \u2014 \u0645\u062D\u0641\u0638\u062A\u0643 \u0648\u062E\u0637\u062A\u0643 \u0648\u062E\u0637\u0629 \u0627\u0644\u062E\u0631\u0648\u062C \u0628\u0642\u062A \u062A\u0638\u0647\u0631 \u0647\u0646\u0627 (\u0644\u064A\u0643 \u0627\u0646\u062A \u0628\u0633).",
    badCode: "\u274C \u0627\u0644\u0643\u0648\u062F \u062F\u0647 \u0645\u0634 \u0635\u0627\u0644\u062D \u0623\u0648 \u0639\u062F\u0651\u0649 \u0639\u0644\u064A\u0647 10 \u062F\u0642\u0627\u064A\u0642 \u2014 \u0627\u0639\u0645\u0644 \u0648\u0627\u062D\u062F \u062C\u062F\u064A\u062F \u0645\u0646 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 (\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u2190 Link the Telegram bot).",
    notYou: "\u274C \u0627\u0644\u0643\u0648\u062F \u062F\u0647 \u0627\u062A\u0639\u0645\u0644 \u0628\u0625\u064A\u0645\u064A\u0644 \u063A\u064A\u0631 \u0627\u0644\u0625\u064A\u0645\u064A\u0644 \u0627\u0644\u0644\u064A \u0627\u062A\u0648\u0627\u0641\u0642 \u0639\u0644\u064A\u0647 \u0644\u064A\u0643.",
    ownerLink: "\u0645\u062D\u0641\u0638\u062A\u0643 \u0647\u064A \u0627\u0644\u0644\u064A \u0641\u064A \u0627\u0644\u0628\u0648\u062A \u0623\u0635\u0644\u0627\u064B \u{1F642}"
  }
};
async function appRequest(env, chat, text) {
  const lang2 = await getLang(env), w = AW[lang2];
  if (isOwner(env)) {
    await send2(env, chat, { text: w.owner });
    return;
  }
  const email = (/([^@\s/]+@[^@\s]+\.[^@\s]+)/.exec(text) || [])[1];
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    await send2(env, chat, { text: w.ask });
    return;
  }
  const e = email.toLowerCase().slice(0, 120), me = await member(env);
  await setMember(env, chat, { email: e });
  await clearPending(env, chat);
  const okSync = await syncAccess(env, await accessEmails(env)).catch(() => false);
  await send2(env, chat, { text: okSync ? w.ok(esc(e)) : lang2 === "ar" ? "\u26A0\uFE0F \u062D\u0635\u0644 \u0645\u0634\u0643\u0644\u0629 \u2014 \u062C\u0631\u0651\u0628 \u062A\u0627\u0646\u064A \u0628\u0639\u062F \u062F\u0642\u064A\u0642\u0629." : "\u26A0\uFE0F Something went wrong \u2014 try again in a minute." });
  await asChat(env.TELEGRAM_CHAT_ID, async () => {
    const L = await getLang(env);
    await send2(env, env.TELEGRAM_CHAT_ID, { text: L === "ar" ? `\u{1F4F1} <b>${esc(me ? me.name : chat)}</b> \u0641\u062A\u062D \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0628\u0640
<code>${esc(e)}</code>` : `\u{1F4F1} <b>${esc(me ? me.name : chat)}</b> opened the app with
<code>${esc(e)}</code>`, buttons: [[cb3(L === "ar" ? "\u{1F464} \u0627\u0644\u0643\u0627\u0631\u062A" : "\u{1F464} Their card", "us:m:" + chat)]] });
  });
}
async function linkPortfolio(env, chat, text) {
  const lang2 = await getLang(env), w = AW[lang2], code = (/([A-Za-z0-9]{8})\s*$/.exec(text) || [])[1];
  if (isOwner(env)) {
    await send2(env, chat, { text: w.ownerLink });
    return;
  }
  const hit = code && await findLinkCode(env, code.toUpperCase());
  if (!hit) {
    await send2(env, chat, { text: w.badCode });
    return;
  }
  const me = await member(env);
  if (me && me.email && hit.email && hit.email !== me.email) {
    await send2(env, chat, { text: w.notYou });
    return;
  }
  await setMember(env, chat, { uid: hit.uid, ...me && !me.email && hit.email ? { email: hit.email } : {} });
  await setCfg(env, { morning: true, evening: true, pin: true, radar: true, sectors: true });
  await send2(env, chat, { text: w.linked, buttons: [[cb3(T[lang2].pf, "pf"), cb3(T[lang2].back, "menu")]] });
}
async function viewMember(env, lang2, c) {
  const x = await member(env, c), ar = lang2 === "ar";
  if (!x) return viewUsers(env, lang2);
  const ai = Number.isFinite(x.ai) ? x.ai : DEF_AI, rp = Number.isFinite(x.reports) ? x.reports : DEF_REPORTS;
  const u = await usedToday(env, c, x), kk = await asChat(c, () => keyInfo(env));
  const L = [
    `\u{1F464} ${x.paused ? "\u23F8 " : ""}${premiumNow(x) ? "\u2B50 " : ""}<b>${esc(x.name)}</b>${x.user ? " @" + esc(x.user) : ""}${x.paused ? ar ? " \u2014 <b>\u0645\u062A\u0648\u0642\u0641</b>" : " \u2014 <b>paused</b>" : ""}${premiumNow(x) ? (ar ? " \u2014 <b>\u0645\u0645\u064A\u0632</b>" : " \u2014 <b>premium</b>") + (x.premUntil ? ` ${ar ? "\u0644\u062D\u062F" : "until"} ${esc(local(x.premUntil, { day: "numeric", month: "short", year: "numeric" }))}${x.premSrc === "stars" ? " (Stars)" : ar ? " (\u0647\u062F\u064A\u0629)" : " (gift)"}` : "") : ""}${x.supporter ? ` \xB7 \u{1F49B} ${x.starsPaid || ""}\u2B50` : ""}`,
    `${ar ? "\u0645\u0646" : "Since"} ${esc(local(x.joined, { day: "numeric", month: "short", year: "numeric" }))}`,
    ...kk.has ? [`\u{1F511} ${ar ? "\u0628\u064A\u0633\u062A\u0639\u0645\u0644 \u0645\u0641\u062A\u0627\u062D Claude \u0628\u062A\u0627\u0639\u0647" : "Uses their own Claude key"} (\u2026${esc(kk.tail)}) \u2014 ${ar ? "\u062A\u0643\u0644\u0641\u062A\u0647 \u0639\u0644\u064A\u0647" : "on their bill"}`] : [],
    `\u{1F4F1} ${ar ? "\u0627\u0644\u062A\u0637\u0628\u064A\u0642" : "App"}: ${x.email ? "<code>" + esc(x.email) + "</code>" : ar ? "\u0644\u0633\u0647" : "not yet"}`,
    `\u{1F517} ${ar ? "\u0627\u0644\u0645\u062D\u0641\u0638\u0629" : "Portfolio"}: ${x.uid ? ar ? "\u0645\u0631\u0628\u0648\u0637\u0629 \u2705" : "linked \u2705" : ar ? "\u0645\u0634 \u0645\u0631\u0628\u0648\u0637\u0629" : "not linked"}`,
    "",
    `\u{1F9E0} ${ar ? "\u0623\u0633\u0626\u0644\u0629 AI \u0641\u064A \u0627\u0644\u064A\u0648\u0645" : "AI questions a day"}: <b>${ai}</b> \xB7 ${ar ? "\u0627\u0644\u0646\u0647\u0627\u0631\u062F\u0647" : "today"} ${u.q}`,
    `\u{1F4CA} ${ar ? "\u062A\u0642\u0627\u0631\u064A\u0631 AI Analysis \u0641\u064A \u0627\u0644\u064A\u0648\u0645" : "AI Analysis reports a day"}: <b>${rp}</b> \xB7 ${ar ? "\u0627\u0644\u0646\u0647\u0627\u0631\u062F\u0647" : "today"} ${u.r}`
  ];
  return { text: L.join("\n"), buttons: [
    [cb3("\u{1F9E0} \u2212", `us:ai:-:${c}`), cb3("\u{1F9E0} +", `us:ai:+:${c}`), cb3("\u{1F4CA} \u2212", `us:rp:-:${c}`), cb3("\u{1F4CA} +", `us:rp:+:${c}`)],
    [cb3(ar ? "\u{1F381} \u2B50 +30 \u064A\u0648\u0645" : "\u{1F381} \u2B50 +30 days", `us:pd:30:${c}`), cb3(ar ? "\u{1F381} \u2B50 +365 \u064A\u0648\u0645" : "\u{1F381} \u2B50 +365 days", `us:pd:365:${c}`)],
    [...premiumNow(x) ? [cb3(ar ? "\u2606 \u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0645\u0645\u064A\u0632" : "\u2606 End premium", "us:pr:" + c)] : [], cb3(x.paused ? ar ? "\u25B6\uFE0F \u0631\u062C\u0651\u0639\u0647" : "\u25B6\uFE0F Resume" : ar ? "\u23F8 \u0648\u0642\u0651\u0641\u0647" : "\u23F8 Pause", "us:pz:" + c)],
    [cb3("\u{1F5D1} " + (ar ? "\u0634\u064A\u0644 \u0627\u0644\u0639\u0636\u0648" : "Remove member"), "us:del:" + c), cb3(ar ? "\u2B05\uFE0F \u0627\u0644\u0623\u0639\u0636\u0627\u0621" : "\u2B05\uFE0F Members", "us")]
  ] };
}
async function onUpdate(env, u, msg, q, chat) {
  if (!await firstTime(env, u.update_id)) return ok();
  await ensureCmds(env);
  await ensureDesc(env);
  await ensureCmdScope(env);
  try {
    if (q) {
      const d = String(q.data || "");
      const done = (text) => tg6(env, "answerCallbackQuery", { callback_query_id: q.id, ...text ? { text } : {} }).catch(() => {
      });
      if (d === "gd" || /^gd:[a-z]+$/.test(d)) {
        const v = guideView(await getLang(env), d.slice(3) || null), r3 = await edit(env, chat, q.message.message_id, v);
        if (!r3.ok && !/not modified/i.test(r3.description || "")) await send2(env, chat, v);
        await done();
        return ok();
      }
      if (d === "sp" || /^sp:\d+$/.test(d) || d === "pm:ask" || d === "pm") {
        const lang2 = await getLang(env);
        if (d === "sp") await send2(env, chat, await supportView(env, lang2));
        else if (d === "pm") await send2(env, chat, await premiumView(env, lang2));
        else if (d === "pm:ask") {
          if (!isOwner(env)) await askGift(env, chat, lang2);
        } else await sendSupportInvoice(env, chat, +d.slice(3), lang2);
        await done();
        return ok();
      }
      if (d === "fg:yes" || d === "fg:no") {
        const lang2 = await getLang(env), w = FG[lang2];
        if (d === "fg:no" || isOwner(env)) {
          await edit(env, chat, q.message.message_id, { text: w.kept });
          await done();
          return ok();
        }
        try {
          const st = env.RATE ? JSON.parse(await env.RATE.get(K(env, "pin")) || "{}") : {};
          await unpin(env).catch(() => {
          });
          if (st.id) await tg6(env, "deleteMessage", { chat_id: chat, message_id: st.id });
        } catch (_) {
        }
        const me = await member(env);
        if (me && me.uid) await forgetPortfolio(env, me.uid);
        await forgetChat(env, chat);
        await forget(env).catch(() => {
        });
        await setMember(env, chat, { uid: void 0, lang: void 0 });
        memLang.delete(String(chat));
        cmdMem.delete(String(chat));
        await edit(env, chat, q.message.message_id, { text: w.done });
        await done("\u{1F9F9}");
        return ok();
      }
      if (/^lang:(ar|en)$/.test(d)) {
        await switchLang(env, chat, d.slice(5), q.message.message_id);
        await done();
        return ok();
      }
      if (/^ap:(ok|no):/.test(d)) {
        const lang2 = await getLang(env), who = d.slice(6);
        if (!isOwner(env)) {
          await done();
          return ok();
        }
        const email = await getPending(env, who);
        await tg6(env, "editMessageReplyMarkup", { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {
        });
        if (!email || !await member(env, who)) {
          await done("\u2014");
          return ok();
        }
        await clearPending(env, who);
        if (d.startsWith("ap:ok:")) {
          await setMember(env, who, { email });
          const okSync = await syncAccess(env, await accessEmails(env)).catch(() => false);
          await asChat(who, async () => {
            const L = await getLang(env);
            await send2(env, who, { text: AW[L].ok(esc(email)) });
          });
          await done(okSync ? "\u2705" : "\u26A0\uFE0F Firestore");
          return ok();
        }
        await asChat(who, async () => {
          const L = await getLang(env);
          await send2(env, who, { text: AW[L].no });
        });
        await done("\u274C");
        return ok();
      }
      if (d === "us" || /^us:/.test(d)) {
        const lang2 = await getLang(env);
        if (!isOwner(env)) {
          await done();
          return ok();
        }
        if (d === "us:inv") {
          await send2(env, chat, await inviteMsg(env, lang2));
          await done();
          return ok();
        }
        let note = null;
        if (d.startsWith("us:m:")) {
          await edit(env, chat, q.message.message_id, await viewMember(env, lang2, d.slice(5)));
          await done();
          return ok();
        }
        const lim = /^us:(ai|rp):([+-]):(.+)$/.exec(d);
        if (lim) {
          const x = await member(env, lim[3]);
          if (x) {
            const f = lim[1] === "ai" ? "ai" : "reports", cur = Number.isFinite(x[f]) ? x[f] : f === "ai" ? DEF_AI : DEF_REPORTS, max = f === "ai" ? 50 : 10;
            await setMember(env, lim[3], { [f]: Math.max(0, Math.min(max, cur + (lim[2] === "+" ? 1 : -1))) });
          }
          await edit(env, chat, q.message.message_id, await viewMember(env, lang2, lim[3]));
          await done("\u2705");
          return ok();
        }
        if (d.startsWith("us:pr:") || /^us:pd:\d+:/.test(d)) {
          const pd = /^us:pd:(\d+):(.+)$/.exec(d), who = pd ? pd[2] : d.slice(6), x = await member(env, who);
          let note2 = "\u2B50";
          if (x) {
            if (!pd && premiumNow(x)) {
              await revoke(env, who);
              note2 = "\u2606";
              await tg6(env, "sendMessage", { chat_id: who, text: x.lang === "ar" ? "\u0627\u0644\u0639\u0636\u0648\u064A\u0629 \u0627\u0644\u0645\u0645\u064A\u0632\u0629 \u0627\u062A\u0634\u0627\u0644\u062A \u2014 \u0631\u062C\u0639\u062A \u0644\u0644\u062D\u062F\u0648\u062F \u0627\u0644\u0639\u0627\u062F\u064A\u0629." : "Premium is off \u2014 back to the standard limits." }).catch(() => {
              });
            } else {
              const y = await addDays(env, who, pd ? Math.min(3650, +pd[1]) : 30), until = y && y.premUntil ? local(y.premUntil, { day: "numeric", month: "short", year: "numeric" }) : "";
              await tg6(env, "sendMessage", { chat_id: who, parse_mode: "HTML", text: x.lang === "ar" ? `\u{1F381} Dr. Samir Saad \u0627\u062F\u0651\u0627\u0644\u0643 \u0627\u0644\u0645\u0645\u064A\u0632 \u0647\u062F\u064A\u0629 \u0644\u062D\u062F ${until}!
\u0627\u0644\u0631\u0633\u0627\u064A\u0644 \u0627\u0644\u0635\u0648\u062A\u064A\u0629 \u{1F399} \u0627\u0634\u062A\u063A\u0644\u062A\u060C \u0648${PREM_AI} \u0633\u0624\u0627\u0644 AI \u0648${PREM_REPORTS} \u062A\u0642\u0627\u0631\u064A\u0631 AI Analysis \u0641\u064A \u0627\u0644\u064A\u0648\u0645.` : `\u{1F381} Dr. Samir Saad gave you premium as a gift \u2014 until ${until}!
Voice notes \u{1F399} are on, with ${PREM_AI} AI questions and ${PREM_REPORTS} AI Analysis reports a day.` }).catch(() => {
              });
            }
          }
          const v = await viewMember(env, lang2, who), r3 = await edit(env, chat, q.message.message_id, v);
          if (!r3.ok && !/not modified/i.test(r3.description || "")) await send2(env, chat, v);
          await done(note2);
          return ok();
        }
        if (d.startsWith("us:pz:")) {
          const who = d.slice(6), x = await member(env, who);
          if (x) {
            await setMember(env, who, { paused: x.paused ? void 0 : true });
            const ar2 = x.lang === "ar";
            await tg6(env, "sendMessage", { chat_id: who, text: x.paused ? ar2 ? "\u25B6\uFE0F \u0627\u0644\u0628\u0648\u062A \u0631\u062C\u0639 \u064A\u0634\u062A\u063A\u0644 \u0639\u0646\u062F\u0643." : "\u25B6\uFE0F The bot is back on for you." : ar2 ? "\u23F8 \u0627\u0644\u0628\u0648\u062A \u0627\u062A\u0648\u0642\u0641 \u0639\u0646\u062F\u0643 \u0645\u0624\u0642\u062A\u0627\u064B." : "\u23F8 The bot is paused for you for now." }).catch(() => {
            });
          }
          await edit(env, chat, q.message.message_id, await viewMember(env, lang2, who));
          await done(x && x.paused ? "\u25B6\uFE0F" : "\u23F8");
          return ok();
        }
        if (d.startsWith("us:del:")) {
          const who = d.slice(7), had = await removeMember(env, who);
          if (had) {
            note = "\u{1F5D1}";
            if (had.email) await syncAccess(env, await accessEmails(env)).catch(() => {
            });
            await tg6(env, "sendMessage", { chat_id: who, text: lang2 === "ar" ? "\u062A\u0645 \u0625\u064A\u0642\u0627\u0641 \u0648\u0635\u0648\u0644\u0643 \u0644\u0644\u0628\u0648\u062A." : "Your access to this bot was removed." }).catch(() => {
            });
          }
        }
        await edit(env, chat, q.message.message_id, await viewUsers(env, lang2));
        await done(note);
        return ok();
      }
      if (d === "pp" || /^pp:/.test(d)) {
        const lang2 = await getLang(env), w = paperWords[lang2];
        if (d === "pp:new") {
          await edit(env, chat, q.message.message_id, viewRestart(lang2));
          await done();
          return ok();
        }
        let note = null;
        if (d === "pp:undo") {
          const r4 = await undoLast(env);
          note = r4.ok ? w.undone : w.nothing;
        }
        if (/^pp:new:\d+$/.test(d)) {
          const r4 = await reset(env, +d.slice(7));
          note = r4.ok ? "\u{1F501} " + usd(+d.slice(7)) : "\u26A0\uFE0F";
        }
        const v = await viewPaper(env, lang2), r3 = await edit(env, chat, q.message.message_id, v);
        if (!r3.ok && !/not modified/i.test(r3.description || "")) await send2(env, chat, v);
        await done(note || `\u2705 ${T[lang2].updated}`);
        return ok();
      }
      if (d === "dy" || /^dy:/.test(d) || d === "pin:r") {
        const lang2 = await getLang(env);
        if (d === "pin:r") {
          await pinUpdate(env, Date.now(), true);
          await done(`\u2705 ${T[lang2].updated}`);
          return ok();
        }
        if (/^dy:now:[me]$/.test(d)) {
          await done(T[lang2].working);
          await (d.endsWith("m") ? morning(env) : evening(env));
          return ok();
        }
        if (/^dy:(morning|evening|radar|sectors|pin)$/.test(d)) {
          const k = d.slice(3), c = await getCfg(env), on = !c[k];
          await setCfg(env, { [k]: on });
          if (k === "pin") {
            if (on) await pinUpdate(env, Date.now(), true, true);
            else await unpin(env);
          }
        }
        await edit(env, chat, q.message.message_id, await viewDaily(env));
        await done();
        return ok();
      }
      if (/^tx:(ok|no):\w+$/.test(d)) {
        const lang2 = await getLang(env), t2 = T[lang2], gid = d.slice(6);
        const kb = ((q.message.reply_markup || {}).inline_keyboard || []).map((r4) => r4.filter((b) => !/^tx:/.test(b.callback_data || ""))).filter((r4) => r4.length);
        await tg6(env, "editMessageReplyMarkup", { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: kb } }).catch(() => {
        });
        if (d.startsWith("tx:no:")) {
          const was = await cancelTrades(env, gid);
          const tl = T[was || lang2];
          await send2(env, chat, { text: was ? tl.txCancelled : tl.txGone });
          await done(was ? "\u274C" : null);
          return ok();
        }
        const r0 = await confirmTrades(env, gid), r3 = r0, t22 = T[r0.lang || lang2];
        if (r3.ok) {
          const L = [t22.txSaved(r3.trades.length)];
          for (const h of r3.holdings) L.push(`\u2022 ${esc(h.sym)} ${t22.nowHold}: <b>${(+Number(h.qty).toPrecision(8)).toLocaleString("en-US", { maximumFractionDigits: 8 })}</b>${h.avg ? ` \xB7 ${t22.avg} ${money(h.avg)}` : ""}`);
          await send2(env, chat, { text: L.join("\n"), buttons: [[cb3(t22.pf, "pf"), cb3(t22.back, "menu")]] });
          for (const x of r3.trades) await logEvent(env, "trade", `${x.side} ${x.qty} ${x.sym} @ $${x.price}`);
          await done("\u2705");
        } else {
          await send2(env, chat, { text: r3.error === "gone" ? t22.txGone : r3.error === "expired" ? t22.txExpired : r3.error === "changed" ? t22.txChanged(esc(r3.why)) : r3.error === "nouser" ? t22.txNoUser : t22.txSaveErr(esc(String(r3.why || "").slice(0, 80))) });
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
        const lang2 = await getLang(env);
        if (d.startsWith("ad:")) await deleteAlert(env, d.slice(3));
        await edit(env, chat, q.message.message_id, await viewAlerts(env, lang2));
        await done(d.startsWith("ad:") ? T[lang2].alertGone : null);
        return ok();
      }
      if (/^mk:\d+$/.test(d) && RANGES.includes(+d.slice(3))) await setRange(env, +d.slice(3));
      const { t, views } = d.startsWith("c:") ? await run(env, "coinById", d.slice(2)) : await run(env, /^mk:/.test(d) ? "mk" : d);
      const r = await edit(env, chat, q.message.message_id, views[0]);
      if (!r.ok && !/not modified/i.test(r.description || "")) await send2(env, chat, views[0]);
      await done(`\u2705 ${t.updated} ${local(Date.now(), { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })}`);
      return ok();
    }
    if (msg && isOwner(env) && (msg.forward_origin || msg.forward_from_chat) && await registerForward(env, msg)) return ok();
    if (msg && msg.successful_payment) {
      await paid(env, chat, msg.successful_payment, await getLang(env));
      return ok();
    }
    if (msg && (msg.voice || msg.audio)) {
      if (!await isPremium(env) && !(await keyInfo(env)).has) {
        const ar = await getLang(env) === "ar";
        await send2(env, chat, { text: ar ? "\u{1F399} \u0627\u0644\u0631\u0633\u0627\u064A\u0644 \u0627\u0644\u0635\u0648\u062A\u064A\u0629 \u0644\u0644\u0623\u0639\u0636\u0627\u0621 \u0627\u0644\u0645\u0645\u064A\u0632\u064A\u0646 \u2B50 \u2014 \u0627\u0643\u062A\u0628\u0647\u0627 \u0643\u062A\u0627\u0628\u0629\u060C \u0623\u0648 \u0627\u0637\u0644\u0628 \u0645\u0646 Dr. Samir Saad." : "\u{1F399} Voice notes are for \u2B50 premium members \u2014 type it instead, or ask Dr. Samir Saad." });
        return ok();
      }
      await onVoice(env, chat, msg.voice || msg.audio);
      return ok();
    }
    if (!msg || typeof msg.text !== "string") return ok();
    await onText(env, chat, msg.text);
  } catch (e) {
    await send2(env, chat, { text: T[await getLang(env).catch(() => "en")].err }).catch(() => {
    });
  }
  return ok();
}
async function onVoice(env, chat, voice) {
  const t = T[await getLang(env)];
  const ph = await send2(env, chat, { text: t.listening });
  const id = ph && ph.result && ph.result.message_id;
  const show = (v) => id ? edit(env, chat, id, v).then((r3) => r3.ok ? r3 : send2(env, chat, v)) : send2(env, chat, v);
  const r = await transcribe(env, voice);
  if (r.error) return show({ text: r.error === "noai" ? t.vNoAi : r.error === "long" ? t.vLong(MAX_SEC) : r.error === "empty" ? t.vEmpty : t.vFail });
  const head = `${t.heard} <i>${esc(r.text)}</i>`;
  if (!id) await send2(env, chat, { text: head });
  return onText(env, chat, r.text, 32, id ? { id, head } : null);
}
async function onText(env, chat, text, budget = 36, into = null) {
  const p = parse(text);
  tg6(env, "sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {
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
        if (v0) await send2(env, chat, v0);
      }
      for (const v of rest) await send2(env, chat, v);
      return;
    }
    into = null;
  }
  if (/^lang:(ar|en)$/.test(p.act)) {
    await switchLang(env, chat, p.act.slice(5));
    return;
  }
  if (p.act === "al") {
    await send2(env, chat, await viewAlerts(env, await getLang(env)));
    return;
  }
  if (p.act === "dy") {
    await send2(env, chat, await viewDaily(env));
    return;
  }
  if (p.act === "rp") {
    const t2 = T[await getLang(env)], b = appBtn(t2);
    await send2(env, chat, { text: t2.reportT, buttons: b ? [[b]] : [[cb3(t2.back, "menu")]] });
    return;
  }
  if (p.act === "pp") {
    await send2(env, chat, await viewPaper(env, await getLang(env)));
    return;
  }
  if (p.act === "app") {
    await appRequest(env, chat, text);
    return;
  }
  if (p.act === "link") {
    await linkPortfolio(env, chat, text);
    return;
  }
  if (p.act === "inv" || p.act === "us") {
    if (!isOwner(env)) {
      const t2 = T[await getLang(env)];
      await send2(env, chat, { text: t2.ownerOnly });
      return;
    }
    await send2(env, chat, p.act === "inv" ? await inviteMsg(env, await getLang(env)) : await viewUsers(env, await getLang(env)));
    return;
  }
  if (p.act === "dy:now:m") {
    await morning(env);
    return;
  }
  if (p.act === "dy:now:e") {
    await evening(env);
    return;
  }
  if (p.act === "pin:on") {
    await setCfg(env, { pin: true });
    const r = await pinUpdate(env, Date.now(), true, true).catch(() => null);
    if (!r || !r.ok) await send2(env, chat, { text: await getLang(env) === "ar" ? "\u26A0\uFE0F \u0645\u0627 \u0642\u062F\u0631\u062A\u0634 \u0623\u062B\u0628\u0651\u062A \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u062F\u0644\u0648\u0642\u062A\u064A \u2014 \u062C\u0631\u0651\u0628 \u062A\u0627\u0646\u064A \u0628\u0639\u062F \u062F\u0642\u064A\u0642\u0629." : "\u26A0\uFE0F I couldn't pin it right now \u2014 try again in a minute." });
    return;
  }
  if (p.act === "pin:off") {
    await setCfg(env, { pin: false });
    await unpin(env);
    await send2(env, chat, { text: T[await getLang(env)].pinOff });
    return;
  }
  if (p.act === "new") {
    await forget(env);
    await send2(env, chat, { text: T[await getLang(env)].newDone });
    return;
  }
  if (p.act === "cm") {
    await send2(env, chat, await communityView(env, await getLang(env)));
    return;
  }
  if (p.act === "cm:setup" || p.act === "ann" || p.act === "cm:guide") {
    if (!isOwner(env)) {
      await send2(env, chat, { text: T[await getLang(env)].ownerOnly });
      return;
    }
    if (p.act === "cm:setup") {
      await setup(env, "channel");
      await setup(env, "group");
      return;
    }
    if (p.act === "cm:guide") {
      await setup(env, "group", { reguide: true });
      return;
    }
    const out = await announce(env, String(text).replace(/^\/announce\s+/i, "").slice(0, 3500));
    await send2(env, chat, { text: out.length ? "\u{1F4E3} " + out.join(" ") : "\u2139\uFE0F No channel / group yet." });
    return;
  }
  if (p.act === "gd") {
    await send2(env, chat, guideView(await getLang(env)));
    return;
  }
  if (p.act === "prem") {
    await send2(env, chat, await premiumView(env, await getLang(env)));
    return;
  }
  if (p.act === "sup") {
    await send2(env, chat, await supportView(env, await getLang(env)));
    return;
  }
  if (p.act === "stats") {
    const lang2 = await getLang(env);
    await send2(env, chat, isOwner(env) ? await statsView(env, lang2) : { text: T[lang2].ownerOnly });
    return;
  }
  if (p.act === "fg") {
    const lang2 = await getLang(env), w = FG[lang2];
    if (isOwner(env)) {
      await send2(env, chat, { text: w.owner });
      return;
    }
    await send2(env, chat, { text: w.ask, buttons: [[cb3(w.yes, "fg:yes"), cb3(w.no, "fg:no")]] });
    return;
  }
  if (p.act === "ai") {
    await answer(env, chat, p.q, budget, into);
    return;
  }
  if (p.act === "hide") {
    const t2 = T[await getLang(env)];
    await send2(env, chat, { text: t2.hidden }, { reply_markup: { remove_keyboard: true } });
    return;
  }
  const { t, views, ai } = await run(env, p.act, p.q, p.guess);
  if (ai) {
    await answer(env, chat, ai, budget);
    return;
  }
  if (/^\/start/.test(text)) {
    await send2(env, chat, { text: t.welcome }, { reply_markup: replyKb(t) });
    await privateCmds(env);
  }
  for (const v of views) await send2(env, chat, v);
}
async function answer(env, chat, question, budget = 36, into = null) {
  const lang2 = await getLang(env), t = T[lang2];
  resetBudget(budget);
  const top = into ? into.head + "\n\n" : "";
  let id;
  if (into) {
    id = into.id;
    await edit(env, chat, id, { text: into.head + "\n" + t.thinking });
  } else {
    const ph = await send2(env, chat, { text: t.thinking });
    id = ph && ph.result && ph.result.message_id;
  }
  const show0 = (v) => id ? edit(env, chat, id, v).then((r3) => r3.ok ? r3 : send2(env, chat, v)) : send2(env, chat, v);
  const show = (v) => show0({ ...v, text: top + v.text });
  const r = await ask(env, question, lang2).catch((e) => {
    console.log(JSON.stringify({ ai: "crash", message: String(e && e.message).slice(0, 300) }));
    return { error: "claude" };
  });
  if (r.error) return show({ text: r.error === "limit" ? t.aiLimit(r.limit) : r.error === "nokey" ? t.aiNoKey : r.error === "ownkey" ? t.aiOwnKey : r.error === "busy" ? t.aiBusy : t.aiErr, buttons: [[cb3(t.back, "menu")]] });
  const foot = `<i>\u{1F4E1} ${t.data}: ${esc(r.sources.length ? r.sources.join(" \xB7 ") : "general knowledge")}
${t.aiLeft(r.left, r.limit)}</i>`;
  const btns = [];
  if (r.coins.length) btns.push(r.coins.map(([cid, sym]) => cb3("\u{1FA99} " + sym, "c:" + cid.slice(0, 58))));
  if (r.coins.length === 1) btns[0].push(url2("\u{1F525} Liq Map", LIQ2 + encodeURIComponent(r.coins[0][1])));
  if (r.paper) btns.push([cb3(t.paperB, "pp"), cb3(paperWords[lang2].undo, "pp:undo")]);
  btns.push([cb3(t.newChat, "new"), cb3(t.back, "menu")]);
  let tx = "";
  if (r.trades && r.trades.length) {
    const ql = /[\u0600-\u06FF]/.test(question) ? "ar" : "en", tq = T[ql];
    const gid = await keepTrades(env, r.trades, ql);
    tx = tradeLines(r.trades, ql === "ar") + "\n\n";
    btns.unshift([cb3(r.trades.length > 1 ? tq.txOkAll(r.trades.length) : tq.txOk, "tx:ok:" + gid), cb3(tq.txNo, "tx:no:" + gid)]);
  }
  let text = r.text + "\n\n" + tx + foot;
  if (top.length + text.length > 4e3) text = r.text.slice(0, Math.max(200, 3900 - foot.length - tx.length - top.length)) + "\u2026\n\n" + tx + foot;
  return show({ text, buttons: btns });
}
async function switchLang(env, chat, lang2, msgId) {
  await setLang(env, lang2);
  await ensureCmds(env);
  const t = T[lang2];
  await send2(env, chat, { text: t.langSet }, { reply_markup: replyKb(t) });
  const bd = await badgeOf(env, t);
  if (msgId) await edit(env, chat, msgId, viewMenu(t, isOwner(env), bd));
  else await send2(env, chat, viewMenu(t, isOwner(env), bd));
  let hasPin = false;
  try {
    hasPin = !!(env.RATE && JSON.parse(await env.RATE.get(K(env, "pin")) || "{}").id);
  } catch (_) {
  }
  if (hasPin && (await getCfg(env)).pin) await pinUpdate(env, Date.now(), true).catch(() => {
  });
}
async function buildById(env, id) {
  const user = await loadUser(env).catch(() => null), now = Date.now();
  const lang2 = await getLang(env), t = T[lang2];
  const xs = /^x-/.test(id) ? id.slice(2).toUpperCase() : null;
  const mine = coinsOf(user);
  const m = await loadMarket(xs ? [] : [id], xs ? [...mine, { sym: xs }] : mine);
  const row2 = [...m.top, ...m.top500].find((r) => r.id === id) || {};
  const ownSym = Object.keys(m.idOf).find((S) => m.idOf[S] === id);
  const own = user && ownSym && (user.coins || []).find((c) => c && !c.removed && String(c.sym).toUpperCase() === ownSym);
  const coin = { id: xs ? m.idOf[xs] || id : id, sym: xs || ownSym || row2.sym || "", name: row2.name || own && own.name || "" };
  return { t, views: [viewCoin(t, coin, m, user ? summarize(withIds(user, m), m, now) : null, now)] };
}
var run = (env, act2, arg, guess) => act2 === "coinById" ? buildById(env, arg) : buildView(env, act2, arg, guess);
var cmds = (lang2, owner2 = true) => {
  const a = lang2 === "ar";
  return [
    ...owner2 ? [] : [["app", a ? "\u0627\u0641\u062A\u062D \u0627\u0644\u062A\u0637\u0628\u064A\u0642" : "Open the app"], ["link", a ? "\u0627\u0631\u0628\u0637 \u0645\u062D\u0641\u0638\u062A\u0643 \u2014 /link \u0627\u0644\u0643\u0648\u062F" : "Link your portfolio \u2014 /link CODE"], ["premium", a ? "\u0627\u0644\u0639\u0636\u0648\u064A\u0629 \u0627\u0644\u0645\u0645\u064A\u0632\u0629 \u2B50" : "Premium \u2B50"], ["support", a ? "\u0627\u062F\u0639\u0645 \u0627\u0644\u0645\u0634\u0631\u0648\u0639 \u{1F49B}" : "Support the project \u{1F49B}"], ["forget", a ? "\u0627\u0645\u0633\u062D \u0628\u064A\u0627\u0646\u0627\u062A\u064A \u0645\u0646 \u0627\u0644\u0628\u0648\u062A" : "Delete my data from the bot"]],
    ...owner2 ? [["invite", a ? "\u0643\u0648\u062F \u062F\u0639\u0648\u0629 \u0644\u0635\u0627\u062D\u0628\u0643" : "Invite code for a friend"], ["users", a ? "\u0627\u0644\u0623\u0639\u0636\u0627\u0621" : "Members"], ["stats", a ? "\u0627\u0644\u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A \u0648\u0627\u0644\u0640 Stars" : "Stats & Stars"]] : [],
    ["start", a ? "\u0627\u0628\u062F\u0623 \u2014 \u0627\u0644\u0623\u0632\u0631\u0627\u0631 \u062A\u062D\u062A \u0627\u0644\u0634\u0627\u062A" : "Start \u2014 the buttons under the chat"],
    ["menu", a ? "\u0627\u0644\u0642\u0627\u0626\u0645\u0629" : "Menu"],
    ["report", a ? "\u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u0643\u0627\u0645\u0644 (\u0635\u0641\u062D\u0629)" : "Full report (a page)"],
    ["portfolio", a ? "\u0645\u062D\u0641\u0638\u062A\u064A" : "My portfolio"],
    ["price", a ? "\u0633\u0639\u0631 \u0639\u0645\u0644\u0629 \u2014 /price btc" : "A coin \u2014 /price btc"],
    ["market", a ? "\u0627\u0644\u0633\u0648\u0642" : "Market"],
    ["plan", a ? "\u062E\u0637\u0629 \u0627\u0644\u062A\u062C\u0645\u064A\u0639" : "Accumulation plan"],
    ["exit", a ? "\u062E\u0637\u0629 \u0627\u0644\u062E\u0631\u0648\u062C" : "Exit plan"],
    ["movers", a ? "\u0627\u0644\u0623\u0641\u0636\u0644 \u0648\u0627\u0644\u0623\u0633\u0648\u0623" : "Best & worst"],
    ["signals", a ? "\u0627\u0644\u0625\u0634\u0627\u0631\u0627\u062A" : "Signals"],
    ["alerts", a ? "\u062A\u0646\u0628\u064A\u0647\u0627\u062A\u0643" : "Your alerts"],
    ["paper", a ? "\u0627\u0644\u062A\u062F\u0627\u0648\u0644 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A" : "Paper trading"],
    ["daily", a ? "\u0627\u0644\u0635\u0628\u0627\u062D \u0648\u0627\u0644\u0645\u0633\u0627\u0621 \u0648\u0627\u0644\u0631\u0627\u062F\u0627\u0631\u0627\u062A" : "Morning, evening, radars"],
    ["morning", a ? "\u0627\u0644\u0635\u0628\u0627\u062D \u0627\u0644\u0630\u0643\u064A \u062F\u0644\u0648\u0642\u062A\u064A" : "Smart morning now"],
    ["evening", a ? "\u0627\u0644\u0645\u0633\u0627\u0621 \u0627\u0644\u0630\u0643\u064A \u062F\u0644\u0648\u0642\u062A\u064A" : "Smart evening now"],
    ["pin", a ? "\u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u0645\u062A\u062B\u0628\u062A\u0629" : "Live pinned message"],
    ["unpin", a ? "\u0634\u064A\u0644 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u0645\u062A\u062B\u0628\u062A\u0629" : "Remove the pinned message"],
    ["guide", a ? "\u0627\u0644\u062F\u0644\u064A\u0644 \u0627\u0644\u0643\u0627\u0645\u0644 \u{1F4D8}" : "The full guide \u{1F4D8}"],
    ["community", a ? "\u0627\u0644\u0642\u0646\u0627\u0629 \u0648\u0627\u0644\u062C\u0631\u0648\u0628 \u{1F465}" : "Channel & group \u{1F465}"],
    ["new", a ? "\u0645\u062D\u0627\u062F\u062B\u0629 \u062C\u062F\u064A\u062F\u0629 \u0645\u0639 \u0627\u0644\u0640 AI" : "New AI chat"],
    ["lang", "English / \u0639\u0631\u0628\u064A"],
    ["hide", a ? "\u0625\u062E\u0641\u0627\u0621 \u0627\u0644\u0623\u0632\u0631\u0627\u0631" : "Hide the buttons"]
  ].map(([command, description]) => ({ command, description }));
};
async function ensureCmds(env) {
  const lang2 = await getLang(env), own = isOwner(env), v = lang2 + ":" + cmds(lang2, own).map((c2) => c2.command).join(","), c = chatOf(env);
  if (cmdMem.get(c) === v) return;
  let had = null;
  try {
    if (env.RATE) had = await env.RATE.get(K(env, "cmdv"));
  } catch (_) {
  }
  if (had === v) {
    cmdMem.set(c, v);
    return;
  }
  const r = await tg6(env, "setMyCommands", { commands: cmds(lang2, own), scope: { type: "chat", chat_id: +c || c } }).catch(() => ({}));
  if (r && r.ok) {
    cmdMem.set(c, v);
    try {
      if (env.RATE) await env.RATE.put(K(env, "cmdv"), v);
    } catch (_) {
    }
  }
}
var cmdMem = /* @__PURE__ */ new Map();
async function privateCmds(env, lang2 = null) {
  lang2 = lang2 || await getLang(env);
  await tg6(env, "deleteMyCommands", {}).catch(() => {
  });
  return tg6(env, "setMyCommands", { commands: cmds(lang2, false), scope: { type: "all_private_chats" } }).catch(() => ({ ok: false }));
}
var cmdScopeDone = false;
async function ensureCmdScope(env) {
  if (cmdScopeDone) return;
  let v = null;
  try {
    v = env.RATE ? await env.RATE.get("tg:cmdscope") : null;
  } catch (_) {
  }
  if (v !== "1") {
    const r = await privateCmds(env);
    if (r && r.ok) try {
      if (env.RATE) await env.RATE.put("tg:cmdscope", "1");
    } catch (_) {
    }
  }
  cmdScopeDone = true;
}
var DESC_V = "2";
var DESC = {
  en: ["Your private crypto assistant (by invitation). Ask anything in plain words or by voice, live coins and market, alerts in words, smart morning & evening, radars, paper trading, image cards and a full report page. Have an invite code? Send it here.", "Private crypto assistant \xB7 by invitation"],
  ar: ["\u0645\u0633\u0627\u0639\u062F\u0643 \u0627\u0644\u062E\u0627\u0635 \u0641\u064A \u0627\u0644\u0643\u0631\u064A\u0628\u062A\u0648 (\u0628\u062F\u0639\u0648\u0629). \u0627\u0633\u0623\u0644 \u0623\u064A \u062D\u0627\u062C\u0629 \u0628\u0627\u0644\u0643\u0644\u0627\u0645 \u0623\u0648 \u0628\u0627\u0644\u0641\u0648\u064A\u0633\u060C \u0627\u0644\u0639\u0645\u0644\u0627\u062A \u0648\u0627\u0644\u0633\u0648\u0642 \u0645\u0628\u0627\u0634\u0631\u060C \u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0628\u0627\u0644\u0643\u0644\u0627\u0645\u060C \u0635\u0628\u0627\u062D \u0648\u0645\u0633\u0627\u0621 \u0630\u0643\u064A\u060C \u0631\u0627\u062F\u0627\u0631\u0627\u062A\u060C \u062A\u062F\u0627\u0648\u0644 \u062A\u062C\u0631\u064A\u0628\u064A\u060C \u0643\u0631\u0648\u062A \u0635\u0648\u0631\u060C \u0648\u062A\u0642\u0631\u064A\u0631 \u0643\u0627\u0645\u0644. \u0645\u0639\u0627\u0643 \u0643\u0648\u062F \u062F\u0639\u0648\u0629\u061F \u0627\u0628\u0639\u062A\u0647 \u0647\u0646\u0627.", "\u0645\u0633\u0627\u0639\u062F \u0643\u0631\u064A\u0628\u062A\u0648 \u062E\u0627\u0635 \xB7 \u0628\u062F\u0639\u0648\u0629"]
};
async function ensureDesc(env) {
  let had = null;
  try {
    if (env.RATE) had = await env.RATE.get("tg:desc");
  } catch (_) {
  }
  if (had === DESC_V || descMem === DESC_V) return;
  descMem = DESC_V;
  for (const [lc, [long, short]] of Object.entries(DESC)) {
    await tg6(env, "setMyDescription", { description: long, ...lc === "en" ? {} : { language_code: lc } }).catch(() => {
    });
    await tg6(env, "setMyShortDescription", { short_description: short, ...lc === "en" ? {} : { language_code: lc } }).catch(() => {
    });
  }
  try {
    if (env.RATE) await env.RATE.put("tg:desc", DESC_V);
  } catch (_) {
  }
}
var descMem = null;
var HOOK_UPDATES = ["message", "edited_message", "callback_query", "pre_checkout_query", "my_chat_member", "chat_join_request"];
var HOOK_V = "3";
var hookMem = null;
async function ensureHook(env, request) {
  if (hookMem === HOOK_V) return;
  let had = null;
  try {
    had = env.RATE ? await env.RATE.get("tg:hookv") : null;
  } catch (_) {
  }
  if (had === HOOK_V) {
    hookMem = HOOK_V;
    return;
  }
  const u = new URL(request.url), r = await tg6(env, "setWebhook", { url: u.origin + u.pathname, secret_token: env.TG_SECRET, allowed_updates: HOOK_UPDATES, drop_pending_updates: false });
  if (r && r.ok) {
    hookMem = HOOK_V;
    try {
      if (env.RATE) await env.RATE.put("tg:hookv", HOOK_V);
    } catch (_) {
    }
  }
}
async function setup2(request, env) {
  const u = new URL(request.url), json = (s, o) => new Response(JSON.stringify(o, null, 2), { status: s, headers: { "content-type": "application/json" } });
  if (!env.TG_SECRET || u.searchParams.get("key") !== env.TG_SECRET) return json(403, { ok: false, error: "Wrong or missing key." });
  const missing = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "TG_SECRET"].filter((k) => !env[k]);
  if (missing.length) return json(400, { ok: false, missing });
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(env.TG_SECRET)) return json(400, { ok: false, error: "TG_SECRET must be 16+ letters, digits, _ or - (Telegram rule)." });
  const hook = u.origin + u.pathname.replace(/\/setup$/, "");
  const a = await tg6(env, "setWebhook", { url: hook, secret_token: env.TG_SECRET, allowed_updates: HOOK_UPDATES, drop_pending_updates: true });
  resetBudget();
  return asChat(env.TELEGRAM_CHAT_ID, async () => {
    const user = await loadUser(env).catch(() => null), lang2 = await getLang(env), t = T[lang2];
    const b = await privateCmds(env, lang2);
    const c = await send2(env, env.TELEGRAM_CHAT_ID, { text: t.welcome }, { reply_markup: replyKb(t) });
    await send2(env, env.TELEGRAM_CHAT_ID, viewMenu(t, isOwner(env)));
    return json(a.ok && b.ok && c.ok ? 200 : 502, { ok: !!(a.ok && b.ok && c.ok), webhook: a.ok ? "set" : a.description, menu: b.ok ? "set" : b.description, welcome: c.ok ? "sent" : c.description, portfolio: serviceAccount(env) ? user ? "connected" : "not found" : "FIREBASE_SERVICE_ACCOUNT missing" });
  });
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

// tools/worker/miniapp.html
var miniapp_default = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Cute Portfolio \xB7 Report</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  /* tools/worker/miniapp.html \u2014 the Mini App page (served by the Worker at /tg/app). It holds no data: it asks /tg/api
     with Telegram's signed initData. Colours follow Telegram's theme, with the app's purple / green / red. */
  :root {
    --bg: var(--tg-theme-secondary-bg-color, #f2f2f7); --card: var(--tg-theme-bg-color, #ffffff); --text: var(--tg-theme-text-color, #111114);
    --mut: var(--tg-theme-hint-color, #8a8a93); --acc: #7c3aed; --acc2: #a78bfa; --up: #16a34a; --dn: #dc2626; --warn: #f59e0b; --line: rgba(127,127,140,.18);
    --r: 18px;
  }
  @media (prefers-color-scheme: dark) { :root:not([data-tg]) { --bg: #0e0e12; --card: #1a1a21; --text: #f2f2f5; --mut: #9a9aa6; } }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Arabic", sans-serif; -webkit-font-smoothing: antialiased; }
  body { padding: 12px 14px calc(28px + env(safe-area-inset-bottom)); max-width: 640px; margin: 0 auto; }
  [dir=rtl] body { font-family: "Noto Sans Arabic", -apple-system, "Segoe UI", sans-serif; }
  .num { font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: isolate; }
  .card { background: var(--card); border-radius: var(--r); padding: 16px; margin: 0 0 12px; box-shadow: 0 1px 0 var(--line); }
  .hero { background: linear-gradient(135deg, #6d28d9, #9333ea 55%, #c026d3); color: #fff; position: relative; overflow: hidden; }
  .hero::after { content: ""; position: absolute; inset: auto -40px -60px auto; width: 180px; height: 180px; border-radius: 50%; background: rgba(255,255,255,.08); }
  .hero .lbl { opacity: .8; font-size: 13px; }
  .hero .big { font-size: 34px; font-weight: 800; letter-spacing: -.5px; margin: 2px 0 10px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { background: rgba(255,255,255,.16); border-radius: 999px; padding: 4px 10px; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
  .verdict { margin-top: 12px; font-weight: 600; font-size: 14px; display: flex; gap: 8px; align-items: flex-start; }
  h2 { font-size: 15px; margin: 0 0 10px; display: flex; align-items: center; gap: 8px; }
  h2 .sub { margin-inline-start: auto; color: var(--mut); font-weight: 500; font-size: 12.5px; }
  .up { color: var(--up); } .dn { color: var(--dn); } .mut { color: var(--mut); }
  .row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--line); }
  .row:first-of-type { border-top: 0; }
  .row .grow { flex: 1; min-width: 0; }
  .row .t1 { font-weight: 650; } .row .t2 { font-size: 12.5px; color: var(--mut); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row .end { text-align: end; } .row .end .t2 { white-space: nowrap; }
  .ic.logo { background: var(--bg); padding: 3px; } .ic.logo img { width: 100%; height: 100%; object-fit: contain; border-radius: 50%; display: block; }
  .ic { width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; font-weight: 800; font-size: 12px; color: #fff; flex: none; }
  .pill { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; display: inline-block; }
  .p-reinforce { background: rgba(22,163,74,.14); color: var(--up); } .p-sell { background: rgba(220,38,38,.13); color: var(--dn); } .p-hold { background: var(--line); color: var(--mut); }
  .todo { display: flex; gap: 10px; padding: 9px 0; border-top: 1px solid var(--line); }
  .todo:first-of-type { border-top: 0; } .todo .n { width: 24px; height: 24px; border-radius: 8px; background: var(--acc); color: #fff; font-weight: 800; font-size: 12px; display: grid; place-items: center; flex: none; }
  .bar { height: 8px; border-radius: 99px; background: var(--line); overflow: hidden; } .bar > i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--acc), var(--acc2)); }
  .stack { display: flex; height: 12px; border-radius: 99px; overflow: hidden; margin: 2px 0 10px; }
  .grow-row .grow { flex: 1; min-width: 0; } .grow-row .end { text-align: end; min-width: 64px; } .grow-row .t1 { font-weight: 650; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; } .grow-row .t2 { font-size: 12.5px; color: var(--mut); white-space: nowrap; }
  .grow-row .end .t1 { justify-content: flex-end; }
  .grow-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--line); } .stack + .grow-row { border-top: 0; }
  .gbar { position: relative; height: 6px; border-radius: 99px; background: var(--line); margin-top: 6px; } .gbar > i { display: block; height: 100%; border-radius: 99px; }
  .tmark { position: absolute; top: -3px; width: 2px; height: 12px; background: var(--text); border-radius: 2px; opacity: .55; }
  .p-warn { background: rgba(245,158,11,.16); color: #b45309; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 12px; color: var(--mut); } .legend b { color: var(--text); font-weight: 650; } .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-inline-end: 5px; }
  .tabs { position: sticky; top: 0; z-index: 5; display: flex; gap: 6px; overflow-x: auto; padding: 8px 2px; margin: 0 -2px 8px; background: var(--bg); scrollbar-width: none; }
  .tabs::-webkit-scrollbar { display: none; }
  .tab { border: 0; background: var(--card); color: var(--text); border-radius: 999px; padding: 8px 14px; font: inherit; font-size: 13.5px; font-weight: 650; white-space: nowrap; cursor: pointer; }
  .tab[aria-selected=true] { background: var(--acc); color: #fff; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .kpi { background: var(--bg); border-radius: 14px; padding: 10px 12px; } .kpi .l { font-size: 12px; color: var(--mut); } .kpi .v { font-size: 18px; font-weight: 750; margin-top: 2px; }
  .cond { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--line); } .cond:first-of-type { border-top: 0; }
  .cic { position: relative; flex: none; } .badge { position: absolute; bottom: -4px; inset-inline-end: -4px; width: 18px; height: 18px; border-radius: 50%; background: var(--mut); color: #fff; font-size: 10px; font-weight: 800; display: grid; place-items: center; border: 2px solid var(--card); } .badge.on { background: var(--up); }
  .cond .t2 { margin-bottom: 6px; }
  .ok { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; flex: none; background: var(--line); }
  .ok.on { background: var(--up); color: #fff; }
  .gauge { display: block; margin: 0 auto; }
  .empty { color: var(--mut); text-align: center; padding: 18px 6px; }
  .foot { text-align: center; color: var(--mut); font-size: 12px; margin-top: 6px; }
  .btn { display: block; width: 100%; border: 0; border-radius: 14px; padding: 12px; font: inherit; font-weight: 700; background: var(--acc); color: #fff; margin-top: 10px; cursor: pointer; }
  .sk { height: 90px; border-radius: var(--r); margin-bottom: 12px; background: linear-gradient(90deg, var(--card), var(--line), var(--card)); background-size: 200% 100%; animation: sk 1.2s infinite linear; }
  @keyframes sk { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  .hide { display: none !important; }
  .foot.stale { color: var(--warn); font-weight: 600; }
  .cam { position: absolute; top: 12px; inset-inline-end: 12px; z-index: 2; border: 0; background: rgba(255,255,255,.18); color: #fff; width: 40px; height: 40px; border-radius: 12px; font-size: 18px; cursor: pointer; }
  h2 .cam { position: static; background: var(--bg); color: var(--text); width: 34px; height: 34px; font-size: 16px; margin-inline-start: auto; }
  h2 .sub .cam { margin: 0; }
  .row.tap { cursor: pointer; } .row.tap:active { opacity: .6; }
  .sheet { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,.45); display: flex; align-items: flex-end; justify-content: center; animation: fade .2s; }
  .sheet-in { background: var(--card); width: 100%; max-width: 640px; border-radius: 22px 22px 0 0; padding: 16px 16px calc(16px + env(safe-area-inset-bottom)); max-height: 92vh; overflow-y: auto; animation: up .25s ease; }
  .sheet .prev { display: block; width: 100%; max-width: 360px; margin: 12px auto; border-radius: 16px; box-shadow: 0 6px 24px rgba(0,0,0,.18); aspect-ratio: 4 / 5; background: var(--bg); }
  .sheet-st { text-align: center; min-height: 20px; margin-top: 6px; font-size: 13px; }
  @keyframes up { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } } @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  .fold { overflow: hidden; transition: max-height .3s ease; }
  .fold > div > .row:first-child, .fold > div > .grow-row:first-child { border-top: 1px solid var(--line); }
  .more { display: block; width: 100%; margin-top: 6px; border: 0; background: var(--bg); color: var(--acc); font: inherit; font-weight: 700; font-size: 13.5px; padding: 9px; border-radius: 12px; cursor: pointer; }
</style>
</head>
<body>
<div id="app"><div class="sk" style="height:170px"></div><div class="sk"></div><div class="sk"></div></div>
<script>
(function () {
  'use strict';
  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { try { tg.ready(); tg.expand(); document.documentElement.setAttribute('data-tg', '1'); } catch (_) {} }
  var A = document.getElementById('app'), R = null, TAB = 'coins';
  try { TAB = localStorage.getItem('cp-tab') || 'coins'; } catch (_) {}
  var W = {
    en: { total: 'Total value', today: 'today', week: '7d', profit: 'All-time', vsBtc: 'vs BTC', todayT: 'Today', coins: 'Coins', plan: 'Plan', exit: 'Exit', market: 'Market', paper: 'Paper', alerts: 'Alerts',
      alloc: 'Allocation', holdings: 'Holdings', onT: 'on target', now: 'now', add: 'add', trim: 'trim', target: 'target', less: 'Show less', minsOld: function (n) { return n + ' min old'; }, imgT: 'Image card', sendChat: 'Send to the chat', close: 'Close', hidden: '$ amounts hidden', shown: '$ amounts shown', sending: 'Sending\u2026', sent: 'Sent to the chat', sendErr: 'Could not send \u2014 try again', showAll: function (n) { return 'Show all ' + n; }, doneN: function (n) { return n + ' targets met'; }, share: 'of portfolio', avg: 'avg', reinforce: 'Reinforce', sell: 'Sell', hold: 'Hold', overall: 'Overall', done: 'targets met', dca: 'Regular buys (DCA)', next: 'next',
      buyAt: 'Buy-price alerts', above: 'above', conds: 'Exit conditions', met: 'met', tps: 'Take-profit levels', toGo: 'to go', sellP: 'sell', btcD: 'BTC dominance', usdtD: 'USDT dominance', ethBtc: 'ETH/BTC',
      fng: 'Fear & Greed', dom: 'Dominance', altS: 'Altcoin Season', etf: 'ETF flows', sectors: 'Sectors 24h', cash: 'Cash', sameBtc: 'Same money in BTC', pts: 'pts', noPaper: 'No paper portfolio yet \u2014 /paper in the chat.',
      noAlerts: 'No alerts \u2014 write in the chat: "tell me if SOL drops below 80".', waits: 'waits to reset', nothing: 'Nothing to do today \u2014 hold \u2705', updated: 'Updated', refresh: 'Refresh', notConn: 'Portfolio not connected.',
      err: 'Could not load the report.', onlyTg: 'Open this from the bot in Telegram.', snapshot: 'market snapshot', beat: function (a, n) { return a + '/' + n + ' coins beat BTC'; },
      vUp: 'Up today \u2014 your plan is on track', vDn: 'Down today \u2014 stick to the plan', vFlat: 'Quiet day', acts: function (n) { return n + ' thing' + (n === 1 ? '' : 's') + ' to do today'; } },
    ar: { total: '\u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0643\u0644\u064A\u0629', today: '\u0627\u0644\u064A\u0648\u0645', week: '7 \u0623\u064A\u0627\u0645', profit: '\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0631\u0628\u062D', vsBtc: '\u0645\u0642\u0627\u0628\u0644 BTC', todayT: '\u0627\u0644\u0646\u0647\u0627\u0631\u062F\u0647', coins: '\u0627\u0644\u0639\u0645\u0644\u0627\u062A', plan: '\u0627\u0644\u062E\u0637\u0629', exit: '\u0627\u0644\u062E\u0631\u0648\u062C', market: '\u0627\u0644\u0633\u0648\u0642', paper: '\u062A\u062C\u0631\u064A\u0628\u064A', alerts: '\u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A',
      alloc: '\u0627\u0644\u062A\u0648\u0632\u064A\u0639', holdings: '\u0627\u0644\u0645\u062D\u0641\u0638\u0629', onT: '\u0639\u0644\u0649 \u0627\u0644\u0647\u062F\u0641', now: '\u062F\u0644\u0648\u0642\u062A\u064A', add: '\u0632\u0648\u0651\u062F', trim: '\u0642\u0644\u0651\u0644', target: '\u0627\u0644\u0647\u062F\u0641', less: '\u0639\u0631\u0636 \u0623\u0642\u0644', minsOld: function (n) { return '\u0645\u0646 ' + n + ' \u062F\u0642\u064A\u0642\u0629'; }, imgT: '\u0643\u0627\u0631\u062A \u0635\u0648\u0631\u0629', sendChat: '\u0627\u0628\u0639\u062A\u0647\u0627 \u0641\u064A \u0627\u0644\u0634\u0627\u062A', close: '\u0642\u0641\u0644', hidden: '\u0627\u0644\u0645\u0628\u0627\u0644\u063A \u0645\u062E\u0641\u064A\u0629', shown: '\u0627\u0644\u0645\u0628\u0627\u0644\u063A \u0638\u0627\u0647\u0631\u0629', sending: '\u0628\u062A\u062A\u0628\u0639\u062A\u2026', sent: '\u0627\u062A\u0628\u0639\u062A\u062A \u0641\u064A \u0627\u0644\u0634\u0627\u062A', sendErr: '\u0645\u0627 \u0627\u062A\u0628\u0639\u062A\u062A\u0634 \u2014 \u062C\u0631\u0651\u0628 \u062A\u0627\u0646\u064A', showAll: function (n) { return '\u0639\u0631\u0636 \u0627\u0644\u0643\u0644 ' + n; }, doneN: function (n) { return n + ' \u0647\u062F\u0641 \u0627\u062A\u062D\u0642\u0642'; }, share: '\u0645\u0646 \u0627\u0644\u0645\u062D\u0641\u0638\u0629', avg: '\u0645\u062A\u0648\u0633\u0637', reinforce: '\u062A\u0639\u0632\u064A\u0632', sell: '\u0628\u064A\u0639', hold: '\u0627\u062D\u062A\u0641\u0627\u0638', overall: '\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A', done: '\u0623\u0647\u062F\u0627\u0641 \u0627\u062A\u062D\u0642\u0642\u062A', dca: '\u0627\u0644\u0634\u0631\u0627\u0621 \u0627\u0644\u0645\u0646\u062A\u0638\u0645 (DCA)', next: '\u0627\u0644\u062C\u0627\u064A',
      buyAt: '\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0633\u0639\u0631 \u0627\u0644\u0634\u0631\u0627\u0621', above: '\u0641\u0648\u0642', conds: '\u0634\u0631\u0648\u0637 \u0627\u0644\u062E\u0631\u0648\u062C', met: '\u0627\u062A\u062D\u0642\u0642', tps: '\u0645\u0633\u062A\u0648\u064A\u0627\u062A \u062C\u0646\u064A \u0627\u0644\u0623\u0631\u0628\u0627\u062D', toGo: '\u0628\u0627\u0642\u064A', sellP: '\u0628\u064A\u0639', btcD: '\u0633\u064A\u0637\u0631\u0629 BTC', usdtD: '\u0633\u064A\u0637\u0631\u0629 USDT', ethBtc: 'ETH/BTC',
      fng: '\u0627\u0644\u062E\u0648\u0641 \u0648\u0627\u0644\u0637\u0645\u0639', dom: '\u0627\u0644\u0633\u064A\u0637\u0631\u0629', altS: '\u0645\u0648\u0633\u0645 \u0627\u0644\u0639\u0645\u0644\u0627\u062A', etf: '\u062A\u062F\u0641\u0642\u0627\u062A ETF', sectors: '\u0627\u0644\u0642\u0637\u0627\u0639\u0627\u062A 24\u0633', cash: '\u0627\u0644\u0643\u0627\u0634', sameBtc: '\u0646\u0641\u0633 \u0627\u0644\u0641\u0644\u0648\u0633 \u0641\u064A BTC', pts: '\u0646\u0642\u0637\u0629', noPaper: '\u0645\u0641\u064A\u0634 \u0645\u062D\u0641\u0638\u0629 \u062A\u062C\u0631\u064A\u0628\u064A\u0629 \u0644\u0633\u0647 \u2014 /paper \u0641\u064A \u0627\u0644\u0634\u0627\u062A.',
      noAlerts: '\u0645\u0641\u064A\u0634 \u062A\u0646\u0628\u064A\u0647\u0627\u062A \u2014 \u0627\u0643\u062A\u0628 \u0641\u064A \u0627\u0644\u0634\u0627\u062A: \xAB\u0646\u0628\u0651\u0647\u0646\u064A \u0644\u0648 SOL \u0646\u0632\u0644 \u062A\u062D\u062A 80\xBB.', waits: '\u0645\u0633\u062A\u0646\u064A \u064A\u0631\u062C\u0639 \u0627\u0644\u0623\u0648\u0644', nothing: '\u0645\u0641\u064A\u0634 \u062D\u0627\u062C\u0629 \u0627\u0644\u0646\u0647\u0627\u0631\u062F\u0647 \u2014 \u0627\u062D\u062A\u0641\u0638 \u2705', updated: '\u0627\u062A\u062D\u062F\u0651\u062B', refresh: '\u062A\u062D\u062F\u064A\u062B', notConn: '\u0627\u0644\u0645\u062D\u0641\u0638\u0629 \u0645\u0634 \u0645\u062A\u0648\u0635\u0644\u0629.',
      err: '\u0645\u0627 \u0642\u062F\u0631\u062A\u0634 \u0623\u062D\u0645\u0651\u0644 \u0627\u0644\u062A\u0642\u0631\u064A\u0631.', onlyTg: '\u0627\u0641\u062A\u062D\u0647\u0627 \u0645\u0646 \u0627\u0644\u0628\u0648\u062A \u0641\u064A \u062A\u0644\u064A\u062C\u0631\u0627\u0645.', snapshot: '\u0644\u0642\u0637\u0629 \u0627\u0644\u0633\u0648\u0642', beat: function (a, n) { return a + '/' + n + ' \u0639\u0645\u0644\u0629 \u0633\u0628\u0642\u062A BTC'; },
      vUp: '\u0637\u0627\u0644\u0639 \u0627\u0644\u0646\u0647\u0627\u0631\u062F\u0647 \u2014 \u062E\u0637\u062A\u0643 \u0645\u0627\u0634\u064A\u0629', vDn: '\u0646\u0627\u0632\u0644 \u0627\u0644\u0646\u0647\u0627\u0631\u062F\u0647 \u2014 \u0627\u0645\u0634\u064A \u0639\u0644\u0649 \u0627\u0644\u062E\u0637\u0629', vFlat: '\u064A\u0648\u0645 \u0647\u0627\u062F\u064A', acts: function (n) { return n + ' \u062D\u0627\u062C\u0629 \u062A\u0639\u0645\u0644\u0647\u0627 \u0627\u0644\u0646\u0647\u0627\u0631\u062F\u0647'; } },
  };
  var w = W.en;
  // \u2500\u2500 tiny DOM helpers (text only: nothing from the data is ever parsed as HTML) \u2500\u2500
  function h(tag, cls, kids) { var e = document.createElement(tag); if (cls) e.className = cls; (kids || []).forEach(function (k) { if (k == null || k === false) return; e.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k); }); return e; }
  function N(s, cls) { return h('span', 'num' + (cls ? ' ' + cls : ''), [s]); }
  function usd(v, d) { if (v == null || !isFinite(v)) return '\u2014'; var a = Math.abs(v), s = v < 0 ? '\u2212' : ''; if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(2) + 'B'; if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(1) + 'M';
    if (a >= 1 || a === 0) return s + '$' + a.toLocaleString('en-US', { minimumFractionDigits: d == null ? (a >= 1000 ? 0 : 2) : d, maximumFractionDigits: d == null ? (a >= 1000 ? 0 : 2) : d }); return s + '$' + (+a.toPrecision(4)); }
  function pct(v, d) { if (v == null || !isFinite(v)) return '\u2014'; d = d == null ? 2 : d; var r = +Number(v).toFixed(d); return (r > 0 ? '+' : r < 0 ? '\u2212' : '') + Math.abs(r).toFixed(d) + '%'; }   // \u22120.00 \u2192 0.00
  function cls(v) { return v >= 0.05 ? 'up' : v <= -0.05 ? 'dn' : 'mut'; }
  function qty(q) { return (+Number(q).toPrecision(8)).toLocaleString('en-US', { maximumFractionDigits: 8 }); }
  var PAL = ['#7c3aed', '#10b981', '#ec4899', '#3b82f6', '#14b8a6', '#eab308', '#8b5cf6', '#f43f5e', '#64748b'];
  var CMAP = {};   // each coin its own colour (BTC orange, ETH blue, the rest in order of size \u2014 never two the same in a row)
  function setColors(syms) { CMAP = { BTC: '#f7931a', ETH: '#627eea' }; var k = 0; syms.forEach(function (s) { if (!CMAP[s]) CMAP[s] = PAL[k++ % PAL.length]; }); }
  function color(sym) { if (CMAP[sym]) return CMAP[sym]; var x = 0; for (var i = 0; i < sym.length; i++) x = (x * 31 + sym.charCodeAt(i)) >>> 0; return PAL[x % PAL.length]; }
  function letters(sym) { var e = h('div', 'ic', [sym.slice(0, 4)]); e.style.background = color(sym); if (sym.length > 3) e.style.fontSize = '10px'; return e; }
  // the coin's real logo (CoinGecko / your saved one); if it doesn't load, its letters on its colour
  function icon(sym) {
    var u = R && R.logos && R.logos[sym]; if (!u) return letters(sym);
    var box = h('div', 'ic logo'), img = document.createElement('img');
    img.alt = ''; img.referrerPolicy = 'no-referrer'; img.loading = 'lazy'; img.decoding = 'async'; img.src = u;
    img.addEventListener('error', function () { box.replaceWith(letters(sym)); });
    box.appendChild(img); return box;
  }
  // a long list: the first n rows, the rest slides open with a tap (and stays open while you switch tabs / refresh)
  var OPEN = {};
  function fold(key, rows, n, label) {
    if (rows.length <= n + 1) return rows;
    var more = rows.slice(n), box = h('div', 'fold'), inner = h('div', '', more), btn = h('button', 'more');
    box.appendChild(inner);
    function set(open, anim) {
      OPEN[key] = open; btn.textContent = open ? '\u25B4 ' + w.less : '\u25BE ' + (label ? label(more.length) : w.showAll(rows.length));
      btn.setAttribute('aria-expanded', String(open));
      if (!anim) { box.style.maxHeight = open ? 'none' : '0px'; return; }
      if (open) { box.style.maxHeight = inner.scrollHeight + 'px'; setTimeout(function () { if (OPEN[key]) box.style.maxHeight = 'none'; }, 320); }
      else { box.style.maxHeight = inner.scrollHeight + 'px'; box.offsetHeight; box.style.maxHeight = '0px'; }
    }
    btn.onclick = function () { set(!OPEN[key], true); if (tg && tg.HapticFeedback) try { tg.HapticFeedback.impactOccurred('light'); } catch (_) {} };
    set(!!OPEN[key], false);
    return rows.slice(0, n).concat([box, btn]);
  }
  function card(title, sub, kids) { return h('section', 'card', [h('h2', '', [title, sub ? h('span', 'sub', [sub]) : null])].concat(kids)); }

  function todoText(x) {
    var ar = w === W.ar;
    switch (x.what) {
      case 'dca_today': return ar ? '\u064A\u0648\u0645 \u0627\u0644\u0640 DCA: \u0627\u0634\u062A\u0631\u064A ' + x.coin + ' \u0628\u0640 ' + usd(x.buy_usd) : 'DCA day: buy ' + usd(x.buy_usd) + ' of ' + x.coin;
      case 'dca_missed': return ar ? 'DCA ' + x.coin + ' \u0645\u062A\u0623\u062E\u0631 ' + x.days_late + ' \u064A\u0648\u0645' : 'DCA ' + x.coin + ' is ' + x.days_late + ' days late';
      case 'dca_tomorrow': return ar ? '\u0628\u0643\u0631\u0629: DCA ' + x.coin + ' ' + usd(x.buy_usd) : 'Tomorrow: DCA ' + x.coin + ' ' + usd(x.buy_usd);
      case 'at_buy_price': return ar ? x.coin + ' \u0648\u0635\u0644 \u0633\u0639\u0631 \u0627\u0644\u0634\u0631\u0627\u0621 ' + usd(x.your_buy_price_usd) : x.coin + ' is at your buy price ' + usd(x.your_buy_price_usd);
      case 'near_buy_price': return ar ? x.coin + ' \u0641\u0648\u0642 \u0633\u0639\u0631 \u0627\u0644\u0634\u0631\u0627\u0621 ' + usd(x.your_buy_price_usd) + ' \u0628\u0640 ' + pct(x.pct_above_buy_price, 1) : x.coin + ' ' + pct(x.pct_above_buy_price, 1) + ' above your buy price ' + usd(x.your_buy_price_usd);
      case 'take_profit_reached': return ar ? x.coin + ' \u0648\u0635\u0644 TP' + x.tp + ' \u2014 \u0628\u064A\u0639 ' + x.sell_pct + '%' : x.coin + ' reached TP' + x.tp + ' \u2014 sell ' + x.sell_pct + '%';
      case 'take_profit_close': return ar ? x.coin + ' \u0628\u0627\u0642\u064A ' + x.pct_to_go + '% \u0639\u0644\u0649 TP' + x.tp : x.coin + ' is ' + x.pct_to_go + '% from TP' + x.tp;
      case 'exit_conditions': return ar ? '\u0627\u0644\u062E\u0631\u0648\u062C: ' + x.met_of_3 + '/3 \u0634\u0631\u0648\u0637 \u0627\u062A\u062D\u0642\u0642\u062A' : 'Exit: ' + x.met_of_3 + '/3 conditions met';
      case 'allocation_over': return (ar ? '\u0642\u0644\u0651\u0644 ' : 'Trim ') + x.group + ' ' + usd(x.usd_to_fix) + ' (' + x.now_pct + '% \u2192 ' + x.target_pct + '%)';
      case 'allocation_under': return (ar ? '\u0632\u0648\u0651\u062F ' : 'Add to ') + x.group + ' ' + usd(x.usd_to_fix) + ' (' + x.now_pct + '% \u2192 ' + x.target_pct + '%)';
      case 'reinforce_signal': return ar ? x.coin + ' ' + pct(x.pct_vs_your_avg, 1) + ' \u0645\u0646 \u0645\u062A\u0648\u0633\u0637\u0643 \u2014 \u062A\u0639\u0632\u064A\u0632' : x.coin + ' ' + pct(x.pct_vs_your_avg, 1) + ' vs your avg \u2014 Reinforce';
      case 'sell_signal': return ar ? x.coin + ' ' + pct(x.pct_vs_your_avg, 1) + ' \u0645\u0646 \u0645\u062A\u0648\u0633\u0637\u0643 \u2014 \u0628\u064A\u0639' : x.coin + ' ' + pct(x.pct_vs_your_avg, 1) + ' vs your avg \u2014 Sell';
    }
    return x.what;
  }
  function todoIcon(x) { return /dca/.test(x.what) ? '\u{1F6D2}' : /buy_price/.test(x.what) ? '\u{1F3AF}' : /take_profit/.test(x.what) ? '\u{1F4B0}' : /exit/.test(x.what) ? '\u{1F6AA}' : /allocation/.test(x.what) ? '\u2696\uFE0F' : /reinforce/.test(x.what) ? '\u{1F7E2}' : '\u{1F534}'; }

  function hero(r) {
    var p = r.pf, v = p.ch24 > 0.3 ? '\u{1F7E2} ' + w.vUp : p.ch24 < -0.3 ? '\u{1F534} ' + w.vDn : '\u26AA ' + w.vFlat;
    return h('section', 'card hero', [camBtn('pf'), h('div', 'lbl', [w.total]), h('div', 'big num', [usd(p.value, 2)]),
      h('div', 'chips', [h('span', 'chip', [N(pct(p.ch24) + ' (' + (p.d24 >= 0 ? '+' : '\u2212') + usd(Math.abs(p.d24), 0) + ')'), ' ' + w.today]), h('span', 'chip', [N(pct(p.ch7)), ' ' + w.week]),
        h('span', 'chip', [w.profit + ' ', N((p.profit >= 0 ? '+' : '\u2212') + usd(Math.abs(p.profit), 0) + ' (' + pct(p.profitPct, 1) + ')')]), p.vsBtc != null ? h('span', 'chip', [w.vsBtc + ' ', N(pct(p.vsBtc, 1))]) : null]),
      h('div', 'verdict', [v + ' \xB7 ' + w.acts(Math.min(3, r.todo.length))])]);
  }
  function todayCard(r) {
    var list = r.todo.slice(0, 3);
    return card('\u{1F3AF} ' + w.todayT, null, list.length ? list.map(function (x, i) { return h('div', 'todo', [h('div', 'n', [String(i + 1)]), h('div', 'grow', [todoIcon(x) + ' ' + todoText(x)])]); }) : [h('div', 'empty', [w.nothing])]);
  }
  var GPAL = ['#7c3aed', '#10b981', '#3b82f6', '#ec4899', '#14b8a6', '#eab308', '#8b5cf6', '#f43f5e', '#64748b', '#0ea5e9', '#a3e635'];
  function gcolor(g, i) { return g.key === 'btc' ? '#f7931a' : /stable/.test(g.key) ? '#26a17b' : GPAL[i % GPAL.length]; }
  function allocCard(r) {
    var a = r.alloc; if (!a || !a.groups.length) return null;
    var stack = h('div', 'stack'), rows = [];
    a.groups.forEach(function (g, i) {
      var c = gcolor(g, i), seg = h('i'); seg.style.cssText = 'display:block;height:100%;width:' + Math.max(0, g.now) + '%;background:' + c; stack.appendChild(seg);
      var bar = h('div', 'gbar', [h('i')]); bar.firstChild.style.cssText = 'width:' + Math.min(100, g.now) + '%;background:' + c;
      if (a.targets && g.target != null) { var mk = h('b', 'tmark'); mk.style[document.documentElement.dir === 'rtl' ? 'right' : 'left'] = Math.min(100, g.target) + '%'; bar.appendChild(mk); }
      var st = !a.targets ? null : g.state === 'ok' ? h('span', 'pill p-reinforce', ['\u2713 ' + w.onT]) : h('span', 'pill ' + (g.state === 'off' ? 'p-sell' : 'p-warn'), [(g.fix > 0 ? '\u2191 ' + w.add + ' ' : '\u2193 ' + w.trim + ' ') + usd(Math.abs(g.fix), 0)]);
      var dotE = h('span', 'dot'); dotE.style.background = c;
      rows.push(h('div', 'grow-row', [h('div', 'grow', [h('div', 't1', [dotE, g.name, ' ', st]), bar]),
        h('div', 'end', [h('div', 't1', [N(g.now.toFixed(1) + '%')]), a.targets && g.target != null ? h('div', 't2', [w.target + ' ', N(g.target.toFixed(0) + '%')]) : h('div', 't2', [N(usd(g.usd, 0))])])]));
    });
    var on = a.targets ? a.groups.filter(function (g) { return g.state === 'ok'; }).length + '/' + a.groups.length + ' ' + w.onT : null;
    return card('\u{1F9E9} ' + w.alloc, on, [stack].concat(fold('alloc', rows, 6)));
  }
  function coinsTab(r) {
    var cs = r.coins.filter(function (c) { return c.value >= 1; });
    var c1 = allocCard(r);
    var rows = cs.map(function (c) {
      var el = h('div', 'row tap', [icon(c.sym), h('div', 'grow', [h('div', 't1', [c.sym, ' ', c.stable ? null : h('span', 'pill p-' + c.signal, [w[c.signal]])]), h('div', 't2', c.stable ? [N(qty(c.qty))] : [N(qty(c.qty)), ' \xB7 ', w.avg + ' ', N(usd(c.avg))])]),
        h('div', 'end', [h('div', 't1', [N(usd(c.value, c.value >= 1000 ? 0 : 2))]), h('div', 't2', c.stable ? [N(pct(c.ch24, 2), 'mut')] : [N(pct(c.ch24, 1), cls(c.ch24)), ' \xB7 ', N(pct(c.pnl, 1), cls(c.pnl))])])]);
      el.onclick = function () { share('coin', c.sym); };   // tap a coin \u2192 its image card
      return el;
    });
    return [c1, card('\u{1F4BC} ' + w.holdings, (r.pf.beat != null ? w.beat(r.pf.beat, r.pf.alts) + ' \xB7 ' : '') + r.coins.length, fold('hold', rows, 8))].filter(Boolean);
  }
  function planTab(r) {
    var out = [], pl = r.plan;
    if (pl && pl.items.length) {
      // still to buy first (furthest from the target on top); the targets already met fold into one line
      var row = function (x) { var b = h('div', 'bar', [h('i')]); b.firstChild.style.width = x.pct + '%'; return h('div', 'row', [icon(x.sym), h('div', 'grow', [h('div', 't2', [N(qty(x.actual) + ' / ' + qty(x.target)), ' ' + x.sym]), b]), h('div', 'end t1', [N(Math.round(x.pct) + '%')])]); };
      var todoP = pl.items.filter(function (x) { return x.pct < 100; }).sort(function (a, b) { return a.pct - b.pct; }), doneP = pl.items.filter(function (x) { return x.pct >= 100; });
      var head = h('div', 'row', [h('div', 'grow', [h('div', 't1', [w.overall]), (function () { var b = h('div', 'bar', [h('i')]); b.firstChild.style.width = Math.min(100, pl.pct) + '%'; return b; })()]), h('div', 'end t1', [N(pl.pct.toFixed(1) + '%')])]);
      var kids = [head].concat(fold('plan', todoP.map(row), 8));
      if (doneP.length) { var dr = doneP.map(row), f = fold('planDone', [h('div', 'hide')].concat(dr), 0, function () { return '\u2705 ' + w.doneN(doneP.length); }); kids = kids.concat(f); }
      out.push(card('\u{1F4CB} ' + w.plan, pl.completed + '/' + pl.counted + ' ' + w.done, kids));
    }
    if (r.dca && r.dca.length) out.push(card('\u{1F6D2} ' + w.dca, null, fold('dca', r.dca.map(function (x) { return h('div', 'row', [icon(x.sym), h('div', 'grow', [h('div', 't1', [x.sym + ' ', N(usd(x.usd))]), h('div', 't2', [w.next + ' ', N(x.next || '\u2014')])]), h('div', 'end t2', [x.state === 'today' ? '\u{1F7E2}' : x.state === 'missed' ? '\u23F0' : '\u{1F5D3}'])]); }), 5)));
    if (r.buyAt && r.buyAt.length) out.push(card('\u{1F3AF} ' + w.buyAt, null, fold('buyAt', r.buyAt.map(function (x) { return h('div', 'row', [icon(x.sym), h('div', 'grow', [h('div', 't1', [x.sym + ' ', N(usd(x.at))]), h('div', 't2', [N(usd(x.price))])]), h('div', 'end t1', [N(pct(x.away, 1), x.away <= 0 ? 'up' : x.away <= 5 ? '' : 'mut')])]); }), 5)));
    if (!out.length) out.push(h('div', 'card empty', ['\u2014']));
    return out;
  }
  function exitTab(r) {
    var nm = { btcD: w.btcD, usdtD: w.usdtD, ethBtc: w.ethBtc }, met = r.exit.macro.filter(function (x) { return x.met; }).length;
    var symOf = { btcD: 'BTC', usdtD: 'USDT', ethBtc: 'ETH' };
    var c1 = card('\u{1F6AA} ' + w.conds, met + '/3 ' + w.met, r.exit.macro.map(function (x) {
      // how far along: "\u2264" levels (dominance) \u2192 target / now; "\u2265" (ETH/BTC) \u2192 now / target
      var prog = x.now == null ? 0 : x.met ? 100 : x.op === '\u2264' ? Math.max(0, Math.min(100, x.lvl / x.now * 100)) : Math.max(0, Math.min(100, x.now / x.lvl * 100));
      var b = h('div', 'bar', [h('i')]); b.firstChild.style.width = prog.toFixed(0) + '%'; if (x.met) b.firstChild.style.background = 'var(--up)';
      var ic = h('div', 'cic', [icon(symOf[x.k] || 'BTC'), h('span', 'badge' + (x.met ? ' on' : ''), [x.met ? '\u2713' : '\u2026'])]);
      return h('div', 'cond', [ic, h('div', 'grow', [h('div', 't1', [nm[x.k] || x.k, ' ', h('span', 'pill ' + (x.met ? 'p-reinforce' : 'p-hold'), [x.met ? '\u2713 ' + w.met : N(prog.toFixed(0) + '%')])]),
        h('div', 't2', [w.now + ' ', N(x.now == null ? '\u2014' : x.now + x.unit), ' \xB7 ' + w.target + ' ', N(x.op + ' ' + x.lvl + x.unit)]), b])]);
    }));
    var c2 = card('\u{1F4B0} ' + w.tps, null, r.exit.tps.length ? fold('tps', r.exit.tps.map(function (t) { var b = h('div', 'bar', [h('i')]); b.firstChild.style.width = Math.max(2, Math.min(100, 100 - t.to)) + '%'; return h('div', 'row', [icon(t.sym), h('div', 'grow', [h('div', 't1', ['TP' + t.n + ' ', N(usd(t.level))]), b]), h('div', 'end', [h('div', 't1', [N(t.to <= 0 ? '\u2713' : pct(t.to, 1))]), h('div', 't2', [w.sellP + ' ' + t.sell + '%'])])]); }), 4) : [h('div', 'empty', ['\u2014'])]);
    return [c1, c2];
  }
  function gauge(v) {
    var ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', '0 0 200 112'); s.setAttribute('width', '210'); s.setAttribute('class', 'gauge');
    var cols = ['#dc2626', '#f97316', '#eab308', '#84cc16', '#16a34a'];
    for (var i = 0; i < 5; i++) { var a0 = Math.PI * (1 - i / 5), a1 = Math.PI * (1 - (i + 1) / 5) + 0.02, p = document.createElementNS(ns, 'path');
      p.setAttribute('d', 'M' + (100 + 84 * Math.cos(a0)) + ' ' + (100 - 84 * Math.sin(a0)) + ' A84 84 0 0 1 ' + (100 + 84 * Math.cos(a1)) + ' ' + (100 - 84 * Math.sin(a1)));
      p.setAttribute('stroke', cols[i]); p.setAttribute('stroke-width', '16'); p.setAttribute('fill', 'none'); p.setAttribute('stroke-linecap', 'round'); s.appendChild(p); }
    var a = Math.PI * (1 - Math.max(0, Math.min(100, v)) / 100), n = document.createElementNS(ns, 'line');
    n.setAttribute('x1', '100'); n.setAttribute('y1', '100'); n.setAttribute('x2', String(100 + 64 * Math.cos(a))); n.setAttribute('y2', String(100 - 64 * Math.sin(a)));
    n.setAttribute('stroke', 'currentColor'); n.setAttribute('stroke-width', '5'); n.setAttribute('stroke-linecap', 'round'); s.appendChild(n);
    var c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', '100'); c.setAttribute('cy', '100'); c.setAttribute('r', '7'); c.setAttribute('fill', 'currentColor'); s.appendChild(c);
    return s;
  }
  function marketTab(r) {
    var m = r.market, out = [];
    out.push(card('\u{1F30D} ' + w.market, camBtn('market'), [h('div', 'grid2', [
      h('div', 'kpi', [h('div', 'l', ['BTC']), h('div', 'v', [N(m.btc ? usd(m.btc.price, 0) : '\u2014')]), h('div', '', [N(m.btc ? pct(m.btc.ch24) : '', m.btc ? cls(m.btc.ch24) : '')])]),
      h('div', 'kpi', [h('div', 'l', [w.dom]), h('div', 'v', [N(m.dom.btc != null ? m.dom.btc.toFixed(1) + '%' : '\u2014')]), h('div', 'mut', ['USDT ', N(m.dom.usdt != null ? m.dom.usdt.toFixed(2) + '%' : '\u2014')])]),
      h('div', 'kpi', [h('div', 'l', [w.altS]), h('div', 'v', [N(m.alt ? String(m.alt.value) : '\u2014')]), h('div', 'mut', [m.alt ? m.alt.label : ''])]),
      h('div', 'kpi', [h('div', 'l', [w.etf + (m.etf ? ' \xB7 ' + m.etf.day : '')]), h('div', 'v', [N(m.etf ? (m.etf.btc >= 0 ? '+' : '\u2212') + usd(Math.abs(m.etf.btc), 0) : '\u2014', m.etf ? cls(m.etf.btc) : '')]), h('div', 'mut', ['ETH ', N(m.etf ? (m.etf.eth >= 0 ? '+' : '\u2212') + usd(Math.abs(m.etf.eth), 0) : '\u2014')])])])]));
    if (m.fng) out.push(card('\u{1F628} ' + w.fng, null, [gauge(m.fng.value), h('div', '', [h('div', 't1', [N(String(m.fng.value))]), h('div', 'mut', [m.fng.label])])]));
    if (m.fng) { var last = out[out.length - 1]; last.lastChild.style.textAlign = 'center'; last.lastChild.firstChild.style.cssText = 'font-size:26px;font-weight:800'; }
    if (m.sectors && m.sectors.length) out.push(card('\u{1F525} ' + w.sectors, null, m.sectors.map(function (s) { return h('div', 'row', [h('div', 'grow t1', [s.name]), h('div', 'end t1', [N(pct(s.ch24, 1), cls(s.ch24))])]); })));
    return out;
  }
  function paperTab(r) {
    var p = r.paper; if (!p || p.error) return [h('div', 'card empty', [w.noPaper])];
    return [card('\u{1F9EA} ' + w.paper, usd(p.start_cash_usd, 0), [h('div', 'grid2', [
      h('div', 'kpi', [h('div', 'l', [w.total]), h('div', 'v', [N(usd(p.value_usd, 2))])]), h('div', 'kpi', [h('div', 'l', [w.cash]), h('div', 'v', [N(usd(p.cash_usd, 2))])]),
      h('div', 'kpi', [h('div', 'l', [w.profit]), h('div', 'v', [N(pct(p.profit_pct), cls(p.profit_pct))])]), h('div', 'kpi', [h('div', 'l', [w.vsBtc]), h('div', 'v', [N((p.vs_btc_pts >= 0 ? '+' : '\u2212') + Math.abs(p.vs_btc_pts || 0).toFixed(1) + ' ' + w.pts, cls(p.vs_btc_pts))])])])]
      .concat(fold('paper', p.coins.map(function (c) { return h('div', 'row', [icon(c.coin), h('div', 'grow', [h('div', 't1', [c.coin]), h('div', 't2', [N(qty(c.amount))])]), h('div', 'end', [h('div', 't1', [N(usd(c.value_usd))]), h('div', 't2', [N(pct(c.profit_pct, 1), cls(c.profit_pct))])])]); }), 6)))];
  }
  function alertsTab(r) {
    return [card('\u{1F514} ' + w.alerts, r.alerts.length ? String(r.alerts.length) : null, r.alerts.length ? fold('alerts', r.alerts.map(function (a) { return h('div', 'row', [h('div', 'grow', [h('div', 't1', [N(a.what)]), a.note ? h('div', 't2', [a.note]) : null]), a.armed ? null : h('span', 'pill p-hold', [w.waits])]); }), 6) : [h('div', 'empty', [w.noAlerts])])];
  }
  var TABS = [['coins', function () { return '\u{1F4BC} ' + w.coins; }, coinsTab], ['plan', function () { return '\u{1F4CB} ' + w.plan; }, planTab], ['exit', function () { return '\u{1F6AA} ' + w.exit; }, exitTab],
    ['market', function () { return '\u{1F30D} ' + w.market; }, marketTab], ['paper', function () { return '\u{1F9EA} ' + w.paper; }, paperTab], ['alerts', function () { return '\u{1F514} ' + w.alerts; }, alertsTab]];


  // \u2500\u2500 \u{1F4F8} image cards (phase 6): drawn here on a canvas (the phone does the work, not the Worker), previewed, then sent to
  // the chat as a photo you can save or forward. "Hide $" keeps only percentages \u2014 for sharing.
  var LOGO = {};
  function logoImg(sym) {
    if (LOGO[sym] !== undefined) return Promise.resolve(LOGO[sym]);
    var u = R && R.logos && R.logos[sym]; if (!u) return Promise.resolve(LOGO[sym] = null);
    return new Promise(function (res) {
      var im = new Image(), done = function (v) { LOGO[sym] = v; res(v); };   // through the Worker (/tg/logo): same site, so the canvas can use it
      var t = setTimeout(function () { done(null); }, 3000);
      im.onload = function () { clearTimeout(t); try { var c = document.createElement('canvas'); c.width = c.height = 4; c.getContext('2d').drawImage(im, 0, 0, 4, 4); c.toDataURL(); done(im); } catch (_) { done(null); } };   // tainted (no CORS) \u2192 letters
      im.onerror = function () { clearTimeout(t); done(null); }; im.src = 'logo?u=' + encodeURIComponent(u);
    });
  }
  var F = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Arabic", sans-serif';
  function rr(x, c, X, Y, W2, H2, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W2, Y, X + W2, Y + H2, r); x.arcTo(X + W2, Y + H2, X, Y + H2, r); x.arcTo(X, Y + H2, X, Y, r); x.arcTo(X, Y, X + W2, Y, r); x.closePath(); if (c) { x.fillStyle = c; x.fill(); } }
  function txt(x, t, X, Y, size, weight, color, align) { x.font = (weight || 600) + ' ' + size + 'px ' + F; x.fillStyle = color || '#fff'; x.textAlign = align || 'left'; x.fillText(String(t), X, Y); return x.measureText(String(t)).width; }
  function coinMark(x, sym, img, X, Y, d) {
    x.save(); x.beginPath(); x.arc(X + d / 2, Y + d / 2, d / 2, 0, Math.PI * 2); x.closePath();
    if (img) { x.fillStyle = '#fff'; x.fill(); x.clip(); x.drawImage(img, X + d * 0.08, Y + d * 0.08, d * 0.84, d * 0.84); }
    else { x.fillStyle = color(sym); x.fill(); x.font = '800 ' + Math.round(d * (sym.length > 3 ? 0.26 : 0.34)) + 'px ' + F; x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(sym.slice(0, 4), X + d / 2, Y + d / 2 + 1); x.textBaseline = 'alphabetic'; }
    x.restore();
  }
  function bg(x, Wd, Hd) {
    var g = x.createLinearGradient(0, 0, Wd, Hd); g.addColorStop(0, '#4c1d95'); g.addColorStop(0.55, '#7e22ce'); g.addColorStop(1, '#c026d3'); x.fillStyle = g; x.fillRect(0, 0, Wd, Hd);
    x.fillStyle = 'rgba(255,255,255,.07)'; x.beginPath(); x.arc(Wd - 80, 140, 260, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(60, Hd - 120, 200, 0, Math.PI * 2); x.fill();
  }
  function stamp(x, Wd, Hd, rtl) {
    var d = new Date(R.t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' });
    txt(x, '\u{1F49C} Cute Portfolio', 64, 92, 34, 800, '#fff'); txt(x, d, Wd - 64, 92, 28, 500, 'rgba(255,255,255,.75)', 'right');
  }
  function chip(x, t, X, Y, col) { x.font = '700 30px ' + F; var tw = x.measureText(t).width; rr(x, 'rgba(255,255,255,.16)', X, Y - 34, tw + 36, 50, 25); txt(x, t, X + 18, Y, 30, 700, col || '#fff'); return tw + 36 + 12; }
  var UPC = '#4ade80', DNC = '#fca5a5';
  function pc(v) { return v >= 0.05 ? UPC : v <= -0.05 ? DNC : '#fff'; }
  function cardPortfolio(hideUsd) {
    var r = R, p = r.pf, Wd = 1080, Hd = 1350, c = document.createElement('canvas'); c.width = Wd; c.height = Hd; var x = c.getContext('2d'), ar = r.lang === 'ar';
    var top = r.coins.filter(function (k) { return k.value >= 1; }).slice(0, 5);
    return Promise.all(top.map(function (k) { return logoImg(k.sym); })).then(function (imgs) {
      bg(x, Wd, Hd); stamp(x, Wd, Hd);
      txt(x, w.total, 64, 200, 34, 600, 'rgba(255,255,255,.8)');
      txt(x, hideUsd ? '$ \u2022 \u2022 \u2022 \u2022 \u2022' : usd(p.value, 2), 64, 300, 104, 800, '#fff');
      var X = 64; X += chip(x, pct(p.ch24) + ' ' + w.today, X, 390, pc(p.ch24)); X += chip(x, pct(p.ch7) + ' ' + w.week, X, 390, pc(p.ch7));
      X = 64; X += chip(x, w.profit + ' ' + pct(p.profitPct, 1), X, 462, pc(p.profitPct)); if (p.vsBtc != null) chip(x, w.vsBtc + ' ' + pct(p.vsBtc, 1), X, 462, pc(p.vsBtc));
      // panel
      rr(x, '#ffffff', 40, 530, Wd - 80, Hd - 570, 40);
      txt(x, '\u{1F3C6} ' + (ar ? '\u0623\u0643\u0628\u0631 \u0627\u0644\u0639\u0645\u0644\u0627\u062A' : 'Top holdings'), 88, 610, 36, 800, '#111114');
      top.forEach(function (k, i) {
        var Y = 660 + i * 104; coinMark(x, k.sym, imgs[i], 88, Y, 72);
        txt(x, k.sym, 184, Y + 34, 34, 800, '#111114'); txt(x, (hideUsd ? '' : usd(k.value, 0) + ' \xB7 ') + k.share.toFixed(1) + '%', 184, Y + 70, 26, 500, '#6b7280');
        rr(x, '#eef0f4', 560, Y + 26, 260, 16, 8); rr(x, color(k.sym), 560, Y + 26, Math.max(12, 260 * Math.min(100, k.share) / 100), 16, 8);
        txt(x, pct(k.ch24, 1), Wd - 88, Y + 46, 32, 800, k.ch24 >= 0.05 ? '#16a34a' : k.ch24 <= -0.05 ? '#dc2626' : '#6b7280', 'right');
      });
      // allocation bar (groups)
      var a = r.alloc, Y2 = 1200;
      if (a && a.groups.length) { var X2 = 88, Wb = Wd - 176; x.save(); rr(x, null, 88, Y2, Wb, 22, 11); x.clip();   // the bar's rounded ends
        a.groups.forEach(function (g, i) { var wseg = Wb * g.now / 100; x.fillStyle = gcolor(g, i); x.fillRect(X2, Y2, Math.max(0, wseg), 22); X2 += wseg; }); x.restore();
        var lg = a.groups.slice(0, 3).map(function (g) { return g.name + ' ' + g.now.toFixed(0) + '%'; }).join('  \xB7  '); txt(x, lg, 88, Y2 + 62, 24, 600, '#6b7280'); }
      return c;
    });
  }
  function cardCoin(sym, hideUsd) {
    var r = R, k = r.coins.filter(function (z) { return z.sym === sym; })[0], Wd = 1080, Hd = 1350, c = document.createElement('canvas'); c.width = Wd; c.height = Hd; var x = c.getContext('2d'), ar = r.lang === 'ar';
    return logoImg(sym).then(function (img) {
      bg(x, Wd, Hd); stamp(x, Wd, Hd);
      coinMark(x, sym, img, 64, 160, 150);
      txt(x, sym, 250, 235, 76, 800, '#fff'); if (k.name) txt(x, k.name, 252, 290, 32, 500, 'rgba(255,255,255,.8)');
      txt(x, usd(k.price), 64, 430, 96, 800, '#fff');
      var X = 64; X += chip(x, pct(k.ch24, 1) + ' 24h', X, 520, pc(k.ch24)); chip(x, pct(k.ch7, 1) + ' 7d', X, 520, pc(k.ch7));
      rr(x, '#ffffff', 40, 600, Wd - 80, Hd - 640, 40);
      var sig = { reinforce: ['#16a34a', w.reinforce], sell: ['#dc2626', w.sell], hold: ['#6b7280', w.hold] }[k.signal] || ['#6b7280', ''];
      txt(x, ar ? '\u0645\u0631\u0643\u0632\u064A' : 'My position', 88, 690, 36, 800, '#111114');
      rr(x, sig[0], Wd - 88 - 200, 652, 200, 54, 27); txt(x, sig[1], Wd - 88 - 100, 690, 28, 800, '#fff', 'center');
      var rows = [[ar ? '\u0627\u0644\u0643\u0645\u064A\u0629' : 'Amount', hideUsd ? '\u2022\u2022\u2022' : qty(k.qty)], [ar ? '\u0627\u0644\u0642\u064A\u0645\u0629' : 'Value', hideUsd ? '$ \u2022\u2022\u2022' : usd(k.value, 2)], [ar ? '\u0645\u062A\u0648\u0633\u0637 \u0627\u0644\u0634\u0631\u0627\u0621' : 'Avg buy price', usd(k.avg)],
        [ar ? '\u0627\u0644\u0631\u0628\u062D \u0645\u0646 \u0627\u0644\u0645\u062A\u0648\u0633\u0637' : 'vs my average', pct(k.pnl, 1)], [ar ? '\u0645\u0646 \u0627\u0644\u0645\u062D\u0641\u0638\u0629' : 'Of portfolio', k.share.toFixed(1) + '%']];
      if (k.vsBtc != null) rows.push([ar ? '\u0645\u0642\u0627\u0628\u0644 BTC' : 'vs holding BTC', pct(k.vsBtc, 1)]);
      rows.forEach(function (rw, i) { var Y = 790 + i * 84; x.fillStyle = '#eef0f4'; x.fillRect(88, Y - 58, Wd - 176, 2); txt(x, rw[0], 88, Y, 32, 500, '#6b7280');
        var col = /^[+\u2212]/.test(rw[1]) ? (rw[1][0] === '+' ? '#16a34a' : '#dc2626') : '#111114'; txt(x, rw[1], Wd - 88, Y, 36, 800, col, 'right'); });
      return c;
    });
  }
  function cardMarket() {
    var m = R.market, Wd = 1080, Hd = 1350, c = document.createElement('canvas'); c.width = Wd; c.height = Hd; var x = c.getContext('2d'), ar = R.lang === 'ar';
    bg(x, Wd, Hd); stamp(x, Wd, Hd);
    txt(x, '\u{1F30D} ' + w.market, 64, 200, 44, 800, '#fff');
    txt(x, 'BTC', 64, 280, 34, 600, 'rgba(255,255,255,.8)'); txt(x, m.btc ? usd(m.btc.price, 0) : '\u2014', 64, 380, 100, 800, '#fff'); if (m.btc) chip(x, pct(m.btc.ch24) + ' 24h', 64, 470, pc(m.btc.ch24));
    rr(x, '#ffffff', 40, 540, Wd - 80, Hd - 580, 40);
    if (m.fng) { var cx = Wd / 2, cy = 885, R2 = 210, cols = ['#dc2626', '#f97316', '#eab308', '#84cc16', '#16a34a'];
      x.lineWidth = 46; x.lineCap = 'round'; for (var i = 0; i < 5; i++) { x.strokeStyle = cols[i]; x.beginPath(); x.arc(cx, cy, R2, Math.PI + i * Math.PI / 5 + 0.03, Math.PI + (i + 1) * Math.PI / 5 - 0.03); x.stroke(); }
      var a = Math.PI + Math.PI * Math.max(0, Math.min(100, m.fng.value)) / 100; x.strokeStyle = '#111114'; x.lineWidth = 12; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + 160 * Math.cos(a), cy + 160 * Math.sin(a)); x.stroke();
      x.fillStyle = '#111114'; x.beginPath(); x.arc(cx, cy, 18, 0, Math.PI * 2); x.fill();
      txt(x, w.fng, cx, 605, 34, 800, '#111114', 'center'); txt(x, String(m.fng.value), cx, 975, 76, 800, '#111114', 'center'); txt(x, m.fng.label, cx, 1018, 32, 600, '#6b7280', 'center'); }
    var stats = [[w.dom + ' BTC', m.dom.btc != null ? m.dom.btc.toFixed(1) + '%' : '\u2014'], ['USDT', m.dom.usdt != null ? m.dom.usdt.toFixed(2) + '%' : '\u2014'], [w.altS, m.alt ? String(m.alt.value) : '\u2014'], ['ETF BTC', m.etf ? (m.etf.btc >= 0 ? '+' : '\u2212') + usd(Math.abs(m.etf.btc), 0) : '\u2014']];
    stats.forEach(function (s2, i) { var X = 88 + (i % 2) * 470, Y = 1090 + Math.floor(i / 2) * 96; txt(x, s2[0], X, Y, 28, 500, '#6b7280'); txt(x, s2[1], X, Y + 44, 38, 800, /^\\+/.test(s2[1]) ? '#16a34a' : /^\u2212/.test(s2[1]) ? '#dc2626' : '#111114'); });
    return Promise.resolve(c);
  }
  var SHEET = null, PRIV = false;
  try { PRIV = localStorage.getItem('cp-priv') === '1'; } catch (_) {}
  function closeSheet() { if (SHEET) { SHEET.remove(); SHEET = null; } }
  function share(kind, sym) {
    closeSheet();
    var make = function () { return kind === 'coin' ? cardCoin(sym, PRIV) : kind === 'market' ? cardMarket() : cardPortfolio(PRIV); };
    var img = h('img', 'prev'), st = h('div', 'mut sheet-st'), send = h('button', 'btn', ['\u{1F4E4} ' + w.sendChat]), priv = h('button', 'more', ['']), cls2 = h('button', 'more', ['\u2716\uFE0F ' + w.close]);
    var box = h('div', 'sheet', [h('div', 'sheet-in', [h('div', 't1', ['\u{1F4F8} ' + w.imgT]), img, kind === 'market' ? null : priv, send, st, cls2])]);
    var canvas = null;
    function draw() { priv.textContent = (PRIV ? '\u{1F648} ' : '\u{1F441} ') + (PRIV ? w.hidden : w.shown); st.textContent = '\u2026'; make().then(function (c) { canvas = c; img.src = c.toDataURL('image/png'); st.textContent = ''; }); }
    priv.onclick = function () { PRIV = !PRIV; try { localStorage.setItem('cp-priv', PRIV ? '1' : '0'); } catch (_) {} draw(); };
    cls2.onclick = closeSheet; box.onclick = function (e) { if (e.target === box) closeSheet(); };
    send.onclick = function () {
      if (!canvas) return; send.disabled = true; st.textContent = '\u23F3 ' + w.sending;
      var data = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
      fetch('card', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: tg && tg.initData, jpg: data, kind: kind, sym: sym || null }) })
        .then(function (r) { return r.json(); }).then(function (j) { if (!j.ok) throw new Error(); st.textContent = '\u2705 ' + w.sent; if (tg && tg.HapticFeedback) try { tg.HapticFeedback.notificationOccurred('success'); } catch (_) {} setTimeout(closeSheet, 900); })
        .catch(function () { st.textContent = '\u26A0\uFE0F ' + w.sendErr; send.disabled = false; });
    };
    document.body.appendChild(box); SHEET = box; draw();
  }
  function camBtn(kind, sym) { var b = h('button', 'cam', ['\u{1F4F8}']); b.setAttribute('aria-label', w.imgT); b.onclick = function (e) { e.stopPropagation(); share(kind, sym); }; return b; }

  function render() {
    var r = R; w = W[r.lang] || W.en; setColors((r.coins || []).map(function (c) { return c.sym; }));
    document.documentElement.lang = r.lang; document.documentElement.dir = r.lang === 'ar' ? 'rtl' : 'ltr';
    A.textContent = '';
    if (!r.connected) { A.appendChild(h('div', 'card empty', [w.notConn])); }
    else { A.appendChild(hero(r)); A.appendChild(todayCard(r)); }
    var tabs = h('nav', 'tabs'), body = h('div');
    TABS.forEach(function (t) { if (!r.connected && /coins|plan|exit/.test(t[0])) return; var b = h('button', 'tab', [t[1]()]); b.setAttribute('aria-selected', String(t[0] === TAB)); b.onclick = function () { TAB = t[0]; try { localStorage.setItem('cp-tab', TAB); } catch (_) {} render(); if (tg && tg.HapticFeedback) try { tg.HapticFeedback.selectionChanged(); } catch (_) {} }; tabs.appendChild(b); });
    var cur = TABS.filter(function (t) { return t[0] === TAB && (r.connected || !/coins|plan|exit/.test(t[0])); })[0] || TABS[3];
    cur[2](r).forEach(function (e) { body.appendChild(e); });
    A.appendChild(tabs); A.appendChild(body);
    var when = new Date(r.t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' });
    var btn = h('button', 'btn', ['\u{1F504} ' + w.refresh]); btn.onclick = load;
    A.appendChild(btn);
    var age = r.market && r.market.snapshot ? Math.round((r.t - Date.parse(r.market.snapshot)) / 60000) : null, stale = age != null && age > 30;
    A.appendChild(h('div', 'foot' + (stale ? ' stale' : ''), [w.updated + ' ' + when + (age != null ? ' \xB7 ' + w.snapshot + ' ' + new Date(r.market.snapshot).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' }) + (stale ? ' \xB7 \u26A0\uFE0F ' + w.minsOld(age) : '') : '')]));
  }
  function fail(msg) { A.textContent = ''; A.appendChild(h('div', 'card empty', [msg])); var b = h('button', 'btn', ['\u{1F504}']); b.onclick = load; A.appendChild(b); }
  function load() {
    var init = tg && tg.initData;
    if (!init) { fail(W.en.onlyTg + ' \xB7 ' + W.ar.onlyTg); return; }
    fetch('api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: init }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j || !j.ok) throw new Error(j && j.error || 'x'); R = j.report; render(); })
      .catch(function () { fail(W.en.err + ' \xB7 ' + W.ar.err); });
  }
  load();
})();
</script>
</body>
</html>
`;

// tools/worker/miniapp.mjs
var LOGO_HOSTS = /^https:\/\/(assets\.coingecko\.com|coin-images\.coingecko\.com|s2\.coinmarketcap\.com|raw\.githubusercontent\.com)\//;
var NICE = { btc: "Bitcoin", layer1: "Layer 1", layer2: "Layer 2", defi: "DeFi", stable: "Stablecoins", stables: "Stablecoins", ai: "AI", meme: "Meme", gaming: "Gaming", rwa: "RWA", infra: "Infrastructure", exchange: "Exchange", privacy: "Privacy", storage: "Storage", oracle: "Oracle", other: "Other" };
var enc3 = new TextEncoder();
async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", typeof key === "string" ? enc3.encode(key) : key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc3.encode(data)));
}
var hex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
async function verifyInitData(initData, token, now = Date.now(), maxAge = 86400) {
  if (!initData || !token) return { ok: false, why: "missing" };
  const p = new URLSearchParams(initData), hash = p.get("hash");
  if (!hash) return { ok: false, why: "no hash" };
  p.delete("hash");
  const check2 = [...p.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => k + "=" + v).join("\n");
  const want = hex(await hmac(await hmac("WebAppData", token), check2));
  if (want.length !== hash.length) return { ok: false, why: "bad signature" };
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ hash.charCodeAt(i);
  if (diff) return { ok: false, why: "bad signature" };
  const at = +p.get("auth_date") * 1e3;
  if (!(at > 0) || now - at > maxAge * 1e3) return { ok: false, why: "too old" };
  let user = null;
  try {
    user = JSON.parse(p.get("user") || "null");
  } catch (_) {
  }
  return user && user.id ? { ok: true, user } : { ok: false, why: "no user" };
}
var r25 = (v) => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
var r64 = (v) => v == null || !isFinite(v) ? null : +Number(v).toPrecision(6);
async function report(env, now = Date.now()) {
  const user = await loadUser(env).catch(() => null);
  const lang2 = await langOf(env);
  const m = await loadMarket([], coinsOf(user));
  const g = m.global || {}, d = g.dom || {}, e = etfDay(m.etf);
  const market = {
    btc: m.btc ? { price: r64(m.btc.price), ch24: r25(m.btc.ch24) } : null,
    fng: m.fng || null,
    dom: { btc: r25(d.btc), eth: r25(d.eth), usdt: r25(d.usdt) },
    mcap: g.mcap || null,
    mcapCh24: r25(g.mcapCh24),
    alt: m.alt && m.alt.value != null ? { value: m.alt.value, label: m.alt.label } : null,
    etf: e ? { day: e.label, btc: Math.round(e.btc), eth: Math.round(e.eth) } : null,
    snapshot: m.parts && m.parts.top || null,
    sectors: (m.sectors || []).filter((s) => s.mcap >= 1e9).sort((a, b) => b.ch24 - a.ch24).filter((s, i, a) => i < 3 || i >= a.length - 3).map((s) => ({ name: s.name, ch24: s.ch24 }))
  };
  const alerts = (await listAlerts(env)).map((a) => ({ what: describe(a), armed: a.armed, note: a.note || "" }));
  const paper = await paperFacts(env).catch(() => null);
  if (!user) return { t: now, lang: lang2, connected: false, market, alerts, paper };
  const sum = summarize(withIds(user, m), m, now), names = Object.fromEntries((user.coins || []).map((c) => [String(c.sym).toUpperCase(), c.name || ""]));
  const coins = sum.coins.filter((c) => c.value >= 0.01).sort((a, b) => b.value - a.value).map((c) => ({
    sym: c.sym,
    name: names[c.sym] || "",
    qty: r64(c.qty),
    price: r64(c.price),
    avg: r64(c.avg),
    value: r25(c.value),
    share: sum.value > 0 ? r25(c.value / sum.value * 100) : 0,
    ch24: r25(c.ch24),
    ch7: r25(c.ch7),
    pnl: r25(c.chg),
    signal: sum.signal[c.sym] || "hold",
    stable: isStable(c.sym),
    vsBtc: c.vs ? r25(c.vs.pct) : null
  }));
  const rows = [...m.top, ...m.top500], logos = {};
  const want = /* @__PURE__ */ new Set(["BTC", "USDT", "ETH", ...coins.map((c) => c.sym), ...sum.plan.map((p) => p.sym), ...paper && paper.coins ? paper.coins.map((c) => c.coin) : []]);
  for (const S of want) {
    const own = (user.coins || []).find((c) => c && String(c.sym).toUpperCase() === S), id = own && own.cgId || m.idOf[S];
    const r = id && rows.find((x) => x.id === id) || rows.find((x) => String(x.sym || "").toUpperCase() === S);
    const u = [own && own.logoUrl, r && r.img].find((x) => typeof x === "string" && LOGO_HOSTS.test(x));
    if (u) logos[S] = u.slice(0, 300);
  }
  let alloc;
  if (sum.alloc) alloc = { band: sum.alloc.band, targets: true, groups: sum.alloc.groups.map((g2) => ({ key: g2.key, name: sum.alloc.names[g2.key] || NICE[g2.key] || g2.key, now: r25(g2.now), target: r25(g2.target), drift: r25(g2.drift), usd: r25(g2.value), fix: Math.round(g2.full), state: g2.state })).sort((a, b) => b.now - a.now) };
  else {
    const vals = {};
    for (const c of coins) {
      const own = (user.coins || []).find((x) => x && String(x.sym).toUpperCase() === c.sym);
      const k = groupOf(own || { sym: c.sym });
      vals[k] = (vals[k] || 0) + c.value;
    }
    alloc = { targets: false, groups: Object.entries(vals).map(([k, v]) => ({ key: k, name: NICE[k] || k, now: sum.value > 0 ? r25(v / sum.value * 100) : 0, usd: r25(v) })).sort((a, b) => b.now - a.now) };
  }
  const tps = (sum.tps || []).map((t) => ({ sym: t.sym, n: t.n, level: r64(t.level), price: r64(t.price), to: r25((t.level / t.price - 1) * 100), sell: t.pct })).sort((a, b) => a.to - b.to).slice(0, 10);
  return {
    t: now,
    lang: lang2,
    connected: true,
    pf: { value: r25(sum.value), ch24: r25(sum.ch24), d24: r25(sum.d24), ch7: r25(sum.ch7), d7: r25(sum.d7), profit: r25(sum.total), profitPct: r25(sum.pctTotal), invested: r25(sum.invested), vsBtc: r25(sum.vsBtc), beat: sum.beat, alts: sum.alts },
    coins,
    counts: sum.counts,
    plan: { pct: r25(sum.prog && sum.prog.pct), completed: sum.prog && sum.prog.completed, counted: sum.prog && sum.prog.counted, items: sum.plan.map((p) => ({ sym: p.sym, actual: r64(p.actual), target: r64(p.target), pct: p.target > 0 ? r25(Math.min(100, p.actual / p.target * 100)) : 0 })) },
    dca: (sum.dca || []).map((x) => ({ sym: x.sym, usd: r25(x.s.usd), next: x.s.next || null, state: x.s.state, perMonth: r25(x.s.perMonth) })),
    buyAt: (sum.buyAt || []).map((x) => ({ sym: x.sym, at: r64(x.at), price: r64(x.price), away: r25((x.price / x.at - 1) * 100) })),
    exit: { macro: sum.macro.map((x) => ({ k: x.k, now: x.now != null ? +Number(x.now).toFixed(x.dp) : null, lvl: x.lvl, met: x.met, op: x.op, unit: x.unit })), tps },
    alloc,
    logos,
    todo: todo(sum, now),
    market,
    alerts,
    paper
  };
}
var CSP = "default-src 'none'; script-src 'self' 'unsafe-inline' https://telegram.org; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data: https://assets.coingecko.com https://coin-images.coingecko.com https://s2.coinmarketcap.com https://raw.githubusercontent.com; base-uri 'none'; frame-ancestors https://web.telegram.org https://*.telegram.org";
function page() {
  return new Response(miniapp_default, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": CSP, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } });
}
async function api(request, env) {
  const json = (s, o) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  if (request.method !== "POST") return json(405, { ok: false });
  const body = await request.json().catch(() => ({}));
  const v = await verifyInitData(String(body.initData || "").slice(0, 4096), env.TELEGRAM_BOT_TOKEN);
  if (!v.ok) return json(401, { ok: false, error: v.why });
  if (!await allowed(env, v.user.id)) return json(403, { ok: false, error: "private" });
  resetBudget();
  try {
    return json(200, { ok: true, report: await asChat(v.user.id, () => report(env)) });
  } catch (e) {
    console.log(JSON.stringify({ miniapp: "error", message: String(e && e.message).slice(0, 200) }));
    return json(500, { ok: false, error: "report failed" });
  }
}
async function cardSend(request, env) {
  const json = (s, o) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  if (request.method !== "POST") return json(405, { ok: false });
  const body = await request.json().catch(() => ({}));
  const v = await verifyInitData(String(body.initData || "").slice(0, 4096), env.TELEGRAM_BOT_TOKEN);
  if (!v.ok) return json(401, { ok: false, error: v.why });
  if (!await allowed(env, v.user.id)) return json(403, { ok: false, error: "private" });
  const b643 = String(body.jpg || "");
  if (!b643 || b643.length > 7e6 || !/^[A-Za-z0-9+/=]+$/.test(b643)) return json(400, { ok: false, error: "no image" });
  const bin = atob(b643), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (!(bytes[0] === 255 && bytes[1] === 216)) return json(400, { ok: false, error: "not a jpeg" });
  const kind = ["pf", "coin", "market"].includes(body.kind) ? body.kind : "pf", sym = String(body.sym || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  const caption = kind === "coin" && sym ? `\u{1FA99} ${sym} \xB7 Cute Portfolio` : kind === "market" ? "\u{1F30D} Market \xB7 Cute Portfolio" : "\u{1F4BC} Cute Portfolio";
  const fd = new FormData();
  fd.append("chat_id", String(v.user.id));
  fd.append("caption", caption);
  fd.append("photo", new Blob([bytes], { type: "image/jpeg" }), "cute-portfolio.jpg");
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ ok: false }));
  return json(r.ok ? 200 : 502, { ok: !!r.ok });
}
async function logo(request) {
  const u = new URL(request.url).searchParams.get("u") || "";
  if (!LOGO_HOSTS.test(u) || u.length > 400) return new Response("no", { status: 400 });
  const cache2 = typeof caches !== "undefined" ? caches.default : null, key = new Request("https://logo.cache/" + encodeURIComponent(u));
  const hit = cache2 && await cache2.match(key).catch(() => null);
  if (hit) return hit;
  const r = await fetch(u, { cf: { cacheTtl: 604800, cacheEverything: true } }).catch(() => null);
  const type = r && r.ok ? r.headers.get("content-type") || "" : "";
  if (!/^image\/(png|jpeg|jpg|webp|gif|svg\+xml)/.test(type)) return new Response("no", { status: 404 });
  const buf = await r.arrayBuffer();
  if (buf.byteLength > 4e5) return new Response("too big", { status: 413 });
  const out = new Response(buf, { headers: { "content-type": type, "cache-control": "public, max-age=604800", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } });
  if (cache2) await cache2.put(key, out.clone()).catch(() => {
  });
  return out;
}

// tools/worker/index.mjs
setAdminHandler(adminHandler2);
setJoinHandler(async (env, who, body) => {
  const r = await useAppInvite(env, body && body.code, who.uid, who.email);
  if (r.error) return { status: r.error === "full" ? 409 : 400, error: r.error === "full" ? "Cute Portfolio is full right now \u2014 ask Dr. Samir Saad." : "That invite code is not valid (or was already used)." };
  const okSync = await syncAccess(env, await accessEmails(env)).catch(() => false);
  if (!okSync) return { status: 502, error: "Could not open the app for you \u2014 try again in a minute." };
  if (!r.already) {
    const n = r.member.name;
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: `\u{1F4F1} ${n} (${who.email}) joined from the app with an invite.` })
    }).catch(() => {
    });
  }
  return { ok: true, already: !!r.already };
});
setMemberCheck(async (env, email) => {
  const x = await memberByEmail(env, email);
  if (!x) return null;
  const apiKey = x.paused ? null : await asChat(x.chat, () => ownKey(env));
  return { limit: x.paused ? 0 : apiKey ? BYOK_REPORTS : Number.isFinite(x.reports) ? x.reports : DEF_REPORTS, model: env.MEMBER_MODEL || "claude-sonnet-5-5", apiKey };
});
setKeyHandler(async (env, email, body) => {
  const x = await memberByEmail(env, email);
  if (!x) return { status: 403, error: "Only invited members can add their own key (the owner's key is already set)." };
  return asChat(x.chat, async () => {
    const a = body && body.action;
    if (a === "delete") {
      await deleteKey(env);
      return { has: false };
    }
    if (a === "set") {
      const k = String(body && body.key || "").trim();
      if (!validShape(k)) return { status: 400, error: "That does not look like a Claude API key (it starts with sk-ant)." };
      const w = await keyWorks(k);
      if (w === "refused") return { status: 400, error: "Claude refused this key \u2014 check it in console.anthropic.com." };
      await saveKey(env, k);
      return { ...await keyInfo(env), checked: w === "ok" };
    }
    if (a === "invoice") {
      if (!isTgChat(x.chat)) return { status: 409, error: "link-bot" };
      if (body.kind === "prem" && premiumNow(x) && x.premSrc === "stars") return { status: 409, error: "already" };
      const r = await invoiceLink(env, x.chat, body.kind, body.n, x.lang);
      return r.ok && typeof r.result === "string" ? { link: r.result } : { status: 502, error: "Telegram did not make the payment link \u2014 try again." };
    }
    const st = await keyInfo(env), day3 = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const limit = x.paused ? 0 : st.has ? BYOK_REPORTS : Number.isFinite(x.reports) ? x.reports : DEF_REPORTS;
    let used2 = 0;
    try {
      used2 = x.uid && env.RATE ? +await env.RATE.get(`ai:${x.uid}:${day3}`) || 0 : 0;
    } catch (_) {
    }
    return {
      ...st,
      reports: { limit, used: used2, left: Math.max(0, limit - used2) },
      premium: premiumNow(x),
      premUntil: x.premUntil || null,
      premSrc: x.premSrc || null,
      supporter: !!x.supporter,
      starsPaid: x.starsPaid || 0,
      botLinked: isTgChat(x.chat),
      price: price(env),
      amounts: SUPPORT,
      community: await getCommunity(env).then((c) => ({ channel: c.channel && c.channel.link || null, group: c.group && c.group.link || null })).catch(() => ({}))
    };
  });
});
var worker_default = {
  async fetch(request, env, ctx) {
    const p = new URL(request.url).pathname.replace(/\/+$/, "");
    if (p.endsWith("/tg/setup")) return setup2(request, env);
    if (p.endsWith("/tg/check")) return check(request, env);
    if (p.endsWith("/tg/app")) return page();
    if (p.endsWith("/tg/api")) return api(request, env);
    if (p.endsWith("/tg/logo")) return logo(request);
    if (p.endsWith("/tg/card")) return cardSend(request, env);
    if (p.endsWith("/tg")) return handleTelegram(request, env, ctx);
    return ai_worker_default.fetch(request, env, ctx);
  },
  // every 5 minutes (tools/worker/wrangler.toml → crons): the alerts you set in words, then the bot's own messages (phase 5)
  async scheduled(event, env, ctx) {
    const now = event && event.scheduledTime ? +event.scheduledTime : Date.now(), log2 = (k, e) => console.log(JSON.stringify({ [k]: "error", message: String(e && e.message).slice(0, 200) }));
    ctx.waitUntil((async () => {
      resetBudget();
      await migrateOwner(env);
      await kickPrices(env).then((r) => {
        if (r.kick === "sent" || r.kick === "refused") console.log(JSON.stringify(r));
      }).catch((e) => log2("kick", e));
      await expireRound(env, Date.now()).catch((e) => log2("premium", e));
      await runChannel(env, now).then((r) => {
        if (r.job) console.log(JSON.stringify(r));
      }).catch((e) => log2("channel", e));
      const cenv = { ...env, PF_CHECK_MS: String(30 * 6e4) };
      for (const chat of await activeChats(env)) {
        resetBudget();
        await asChat(chat, async () => {
          const env2 = cenv;
          await runWatch(env2).then((r) => {
            if (r.fired) console.log(JSON.stringify({ watch: r }));
          }).catch((e) => log2("watch", e));
          await runDaily(env2, now).then((r) => {
            if (r.job) console.log(JSON.stringify({ daily: r }));
          }).catch((e) => log2("daily", e));
        });
      }
    })());
  }
};
export {
  worker_default as default
};
