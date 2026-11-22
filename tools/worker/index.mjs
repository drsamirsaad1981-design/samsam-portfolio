// tools/worker/index.mjs — the one Cloudflare Worker: AI Analysis (/analyze, tools/ai-worker.js) + the Telegram bot (/tg).
// Built into a single file by tools/build-worker.mjs → tools/dist/samsam-worker.js (that file is what you paste).
import ai, { setMemberCheck, setKeyHandler, setAdminHandler, setJoinHandler, setCexHandler, setUseHandler } from '../ai-worker.js';
import { bidiBody } from './bidi.mjs';
import { tgLogin } from './login.mjs';
import { note, noteApp, addWorkerReads, flush, readsAlert } from './usage.mjs';
import { cexHandler } from './cex.mjs';
setCexHandler(cexHandler);   // 🔌 live exchange balances (read-only keys)
import { adminHandler } from './admin.mjs';
setAdminHandler(adminHandler);   // 🛠 the owner's dashboard in the app
// 📱 an invite code opened in the app (?invite=CODE): that account is in — its e-mail joins the access list the rules read
setJoinHandler(async (env, who, body) => {
  const r = await useAppInvite(env, body && body.code, who.uid, who.email);
  if (r.error) return { status: r.error === 'full' ? 409 : 400, error: r.error === 'full' ? 'Cute Portfolio is full right now — ask Dr. Samir Saad.' : 'That invite code is not valid (or was already used).' };
  const okSync = await syncAccess(env, await accessEmails(env)).catch(() => false);
  if (!okSync) return { status: 502, error: 'Could not open the app for you — try again in a minute.' };
  if (!r.already) { const n = r.member.name; await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: `📱 ${n} (${who.email}) joined from the app with an invite.` }) }).catch(() => {}); }
  return { ok: true, already: !!r.already };
});
import { expireRound, premiumNow, invoiceLink, price as premPrice, SUPPORT } from './stars.mjs';
import { runChannel, getCommunity } from './community.mjs';
import { runXPost } from './xpost.mjs';
import { usage } from './ai.mjs';
// is this member in the channel / the group? (Telegram tells the bot, an admin there) → { channel, group }: true / false / null
async function inCommunity(env, chat) {
  if (!isTgChat(chat)) return { channel: null, group: null };
  const c = await getCommunity(env).catch(() => ({})), out = { channel: null, group: null };
  await Promise.all(['channel', 'group'].map(async k => {
    if (!c[k]) return;
    try {
      const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getChatMember`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: c[k].id, user_id: +chat }) }).then(x => x.json());
      out[k] = !!(r.ok && ['member', 'administrator', 'creator', 'restricted'].includes(r.result.status));
    } catch (_) {}
  }));
  return out;
}
import { saveKey, keyInfo, ownKey, deleteKey, validShape, keyWorks, BYOK_REPORTS } from './byok.mjs';
import { handleTelegram, setup, check, getLang } from './bot.mjs';
import { runWatch } from './watch.mjs';
import { runDaily, kickPrices } from './daily.mjs';
import { runStall } from './stall.mjs';
import { resetBudget, syncAccess, takeReads } from './data.mjs';
import { markSeen, idleState, noteIdle, addReads } from './idle.mjs';
import { asChat, activeChats, migrateOwner, memberByEmail, DEF_REPORTS, useAppInvite, accessEmails, isTgChat, members } from './who.mjs';

// AI Analysis in the app: people invited through the bot whose e-mail Samir approved — their own daily reports (/users), Sonnet
setMemberCheck(async (env, email) => {
  const x = await memberByEmail(env, email); if (!x) return null;
  await markSeen(env, x.chat).catch(() => {});   // 💤 used the app
  const apiKey = x.paused ? null : await asChat(x.chat, () => ownKey(env));   // 🔑 their own Claude key: their bill, 10 a day
  return { limit: x.paused ? 0 : apiKey ? BYOK_REPORTS : Number.isFinite(x.reports) ? x.reports : DEF_REPORTS, model: env.MEMBER_MODEL || 'claude-sonnet-5-5', apiKey };
});
// 🔑 the app's Settings → My Claude key: { action: 'status' | 'set' | 'delete', key } from a signed-in, approved member
setKeyHandler(async (env, email, body) => {
  const x = await memberByEmail(env, email);
  if (!x) return { status: 403, error: 'Only invited members can add their own key (the owner\'s key is already set).' };
  await markSeen(env, x.chat).catch(() => {});   // 💤 the app was opened → active
  return asChat(x.chat, async () => {
    const a = body && body.action;
    if (a === 'ping') return { ok: true };
    if (a === 'delete') { await deleteKey(env); return { has: false }; }
    if (a === 'set') {
      const k = String((body && body.key) || '').trim();
      if (!validShape(k)) return { status: 400, error: 'That does not look like a Claude API key (it starts with sk-ant).' };
      const w = await keyWorks(k);
      if (w === 'refused') return { status: 400, error: 'Claude refused this key — check it in console.anthropic.com.' };
      await saveKey(env, k); return { ...(await keyInfo(env)), checked: w === 'ok' };
    }
    if (a === 'invoice') {   // 💛⭐ from the app's Support card: a Telegram payment link for this member
      if (!isTgChat(x.chat)) return { status: 409, error: 'link-bot' };
      if (body.kind === 'prem' && premiumNow(x) && x.premSrc === 'stars') return { status: 409, error: 'already' };
      const r = await invoiceLink(env, x.chat, body.kind, body.n, x.lang);
      return r.ok && typeof r.result === 'string' ? { link: r.result } : { status: 502, error: 'Telegram did not make the payment link — try again.' };
    }
    const st = await keyInfo(env), day = new Date().toISOString().slice(0, 10);   // + the quick-report allowance for the AI Analysis screen
    const limit = x.paused ? 0 : st.has ? BYOK_REPORTS : Number.isFinite(x.reports) ? x.reports : DEF_REPORTS;
    let used = 0; try { used = x.uid && env.RATE ? +(await env.RATE.get(`ai:${x.uid}:${day}`)) || 0 : 0; } catch (_) {}
    return { ...st, reports: { limit, used, left: Math.max(0, limit - used) }, premium: premiumNow(x), premUntil: x.premUntil || null, premSrc: x.premSrc || null, supporter: !!x.supporter, starsPaid: x.starsPaid || 0, botLinked: isTgChat(x.chat), price: premPrice(env), amounts: SUPPORT,
      community: await getCommunity(env).then(c => ({ channel: (c.channel && c.channel.link) || null, group: null })).catch(() => ({})),   // one place: the channel (its comments are the group)
      questions: await usage(env).then(u => ({ used: u.used, limit: u.limit })).catch(() => null),   // 🧠 today's AI questions (bot)
      tgIn: await inCommunity(env, x.chat) };   // ✅ already in the channel / the group?
  });
});

// 📖📊 the app's report (at most every 3 hours per device): its Firebase reads today + which screens / actions were used
setUseHandler(async (env, who, body) => {
  const x = who.owners.includes(who.email) ? null : await memberByEmail(env, who.email);
  if (!who.owners.includes(who.email) && !x) return { status: 403, error: 'Not allowed.' };
  if (x) await markSeen(env, x.chat).catch(() => {});   // 💤 the app was opened → active
  noteApp(who.uid, body && body.reads, body && body.feats, body && body.dev);
  return { ok: true };
});

// the Worker's addresses: the bot, its Mini App, then the app's AI / key / admin / join / cex / use calls
async function route(request, env, ctx) {
  const p = new URL(request.url).pathname.replace(/\/+$/, '');
  if (p.endsWith('/tg/setup')) return setup(request, env);
  if (p.endsWith('/tg/check')) return check(request, env);
  if (p.endsWith('/tg/login')) return tgLogin(request, env);   // 📱 the full app inside Telegram: Telegram's signature → a sign-in for that account
  // (the old report page — /tg/app, /tg/api, /tg/card, /tg/logo — is gone since 20 Nov: 📱 opens the full app instead)
  if (p.endsWith('/tg')) return handleTelegram(request, env, ctx);
  return ai.fetch(request, env, ctx);
}

export default {
  async fetch(request, env, ctx) {
    const res = await route(request, env, ctx);
    // 📖📊 counts waited in memory; written at most every 10 minutes (Cloudflare's free plan: 1,000 KV writes a day)
    const job = flush(env, { reads: takeReads() }).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(job);
    return res;
  },
  // every 5 minutes (tools/worker/wrangler.toml → crons): the alerts you set in words, then the bot's own messages (phase 5)
  async scheduled(event, env, ctx) {
    const now = event && event.scheduledTime ? +event.scheduledTime : Date.now(), log = (k, e) => console.log(JSON.stringify({ [k]: 'error', message: String(e && e.message).slice(0, 200) }));
    ctx.waitUntil((async () => {
      resetBudget();   // one allowance of outside calls for the whole run (Cloudflare counts per run)
      await migrateOwner(env);
      const kick = await kickPrices(env).then(r => { if (r.kick === 'sent' || r.kick === 'refused') console.log(JSON.stringify(r)); return r; }).catch(e => { log('kick', e); return null; });   // GitHub late → run the market snapshot now
      await runStall(env, Date.now(), kick).then(r => { if (r.job) console.log(JSON.stringify(r)); }).catch(e => log('stall', e));   // 🛠 still stopped after 90 min → the owner is told
      await expireRound(env, Date.now()).catch(e => log('premium', e));
      await runChannel(env, now).then(r => { if (r.job) console.log(JSON.stringify(r)); }).catch(e => log('channel', e));
      await runXPost(env, now).then(r => { if (r.job) console.log(JSON.stringify(r)); }).catch(e => log('xpost', e));   // 📣 the owner's daily post for X (he posts it himself)   // 📢 the market pulse   // ⭐ a premium that ended → standard limits (3-day reminder before)
      const cenv = { ...env, PF_CHECK_MS: String(30 * 60e3) }, mem = await members(env), reads = {};
      addWorkerReads(takeReads());   // reads before the round (owner migration, channel…) → the Worker's own count
      for (const chat of await activeChats(env)) {   // each person in turn, as themselves: their alerts, then their daily messages
        resetBudget();
        const st = await idleState(env, chat, mem[chat], now);   // 💤 no bot / app use for 14 days → only the alerts they set
        await asChat(chat, async () => {
          const env = cenv;   // the round asks Firebase "anything new?" at most every 10 (owner) / 30 (members) minutes
          await runWatch(env, now).then(r => { if (r.fired) console.log(JSON.stringify({ watch: r })); }).catch(e => log('watch', e));
          if (st.idle) { if (isTgChat(chat)) await noteIdle(env, chat, mem[chat], text => fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bidiBody({ chat_id: chat, text })) }).then(r => r.json())).catch(e => log('idle', e)); return; }
          await runDaily(env, now).then(r => { if (r.job) console.log(JSON.stringify({ daily: r })); }).catch(e => log('daily', e));   // phase 5: morning / evening / radars / pinned
        });
        reads[chat] = takeReads();   // 📖 this member's Firebase reads in this round
      }
      await addReads(env, reads, now).catch(e => log('reads', e));
      await flush(env, { now }).catch(e => log('use', e));   // at most every 10 minutes
      // ⚠️ all of today's Firebase reads (round + bot + app) at 60% / 80% of the free allowance → one message to you
      const owner = env.TELEGRAM_CHAT_ID;
      if (owner) await asChat(owner, async () => readsAlert(env, async text => (await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bidiBody({ chat_id: owner, text, parse_mode: 'HTML' })) })).json(), await getLang(env), now))
        .then(r => { if (r.sent) console.log(JSON.stringify({ readsAlert: r.level, total: r.total })); }).catch(e => log('readsAlert', e));
    })());
  },
};
