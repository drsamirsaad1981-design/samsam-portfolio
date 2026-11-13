// tools/worker/index.mjs — the one Cloudflare Worker: AI Analysis (/analyze, tools/ai-worker.js) + the Telegram bot (/tg).
// Built into a single file by tools/build-worker.mjs → tools/dist/samsam-worker.js (that file is what you paste).
import ai, { setMemberCheck, setKeyHandler, setAdminHandler, setJoinHandler } from '../ai-worker.js';
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
import { expireRound, premiumNow } from './stars.mjs';
import { saveKey, keyInfo, ownKey, deleteKey, validShape, keyWorks, BYOK_REPORTS } from './byok.mjs';
import { handleTelegram, setup, check } from './bot.mjs';
import { runWatch } from './watch.mjs';
import { runDaily, kickPrices } from './daily.mjs';
import { page, api, cardSend, logo } from './miniapp.mjs';
import { resetBudget, syncAccess } from './data.mjs';
import { asChat, activeChats, migrateOwner, memberByEmail, DEF_REPORTS, useAppInvite, accessEmails } from './who.mjs';

// AI Analysis in the app: people invited through the bot whose e-mail Samir approved — their own daily reports (/users), Sonnet
setMemberCheck(async (env, email) => {
  const x = await memberByEmail(env, email); if (!x) return null;
  const apiKey = x.paused ? null : await asChat(x.chat, () => ownKey(env));   // 🔑 their own Claude key: their bill, 10 a day
  return { limit: x.paused ? 0 : apiKey ? BYOK_REPORTS : Number.isFinite(x.reports) ? x.reports : DEF_REPORTS, model: env.MEMBER_MODEL || 'claude-sonnet-5-5', apiKey };
});
// 🔑 the app's Settings → My Claude key: { action: 'status' | 'set' | 'delete', key } from a signed-in, approved member
setKeyHandler(async (env, email, body) => {
  const x = await memberByEmail(env, email);
  if (!x) return { status: 403, error: 'Only invited members can add their own key (the owner\'s key is already set).' };
  return asChat(x.chat, async () => {
    const a = body && body.action;
    if (a === 'delete') { await deleteKey(env); return { has: false }; }
    if (a === 'set') {
      const k = String((body && body.key) || '').trim();
      if (!validShape(k)) return { status: 400, error: 'That does not look like a Claude API key (it starts with sk-ant).' };
      const w = await keyWorks(k);
      if (w === 'refused') return { status: 400, error: 'Claude refused this key — check it in console.anthropic.com.' };
      await saveKey(env, k); return { ...(await keyInfo(env)), checked: w === 'ok' };
    }
    const st = await keyInfo(env), day = new Date().toISOString().slice(0, 10);   // + the quick-report allowance for the AI Analysis screen
    const limit = x.paused ? 0 : st.has ? BYOK_REPORTS : Number.isFinite(x.reports) ? x.reports : DEF_REPORTS;
    let used = 0; try { used = x.uid && env.RATE ? +(await env.RATE.get(`ai:${x.uid}:${day}`)) || 0 : 0; } catch (_) {}
    return { ...st, reports: { limit, used, left: Math.max(0, limit - used) }, premium: premiumNow(x), premUntil: x.premUntil || null, premSrc: x.premSrc || null, supporter: !!x.supporter, starsPaid: x.starsPaid || 0 };
  });
});

export default {
  async fetch(request, env, ctx) {
    const p = new URL(request.url).pathname.replace(/\/+$/, '');
    if (p.endsWith('/tg/setup')) return setup(request, env);
    if (p.endsWith('/tg/check')) return check(request, env);
    if (p.endsWith('/tg/app')) return page();          // the Mini App page (phase 7)
    if (p.endsWith('/tg/api')) return api(request, env); // its data, only with Telegram's signature for your account
    if (p.endsWith('/tg/logo')) return logo(request);   // a coin logo from this site (the image cards draw it)
    if (p.endsWith('/tg/card')) return cardSend(request, env); // 📸 an image card drawn in the Mini App → a photo in your chat
    if (p.endsWith('/tg')) return handleTelegram(request, env, ctx);
    return ai.fetch(request, env, ctx);
  },
  // every 5 minutes (tools/worker/wrangler.toml → crons): the alerts you set in words, then the bot's own messages (phase 5)
  async scheduled(event, env, ctx) {
    const now = event && event.scheduledTime ? +event.scheduledTime : Date.now(), log = (k, e) => console.log(JSON.stringify({ [k]: 'error', message: String(e && e.message).slice(0, 200) }));
    ctx.waitUntil((async () => {
      resetBudget();   // one allowance of outside calls for the whole run (Cloudflare counts per run)
      await migrateOwner(env);
      await kickPrices(env).then(r => { if (r.kick === 'sent' || r.kick === 'refused') console.log(JSON.stringify(r)); }).catch(e => log('kick', e));   // GitHub late → run the market snapshot now
      await expireRound(env, Date.now()).catch(e => log('premium', e));   // ⭐ a premium that ended → standard limits (3-day reminder before)
      const cenv = { ...env, PF_CHECK_MS: String(30 * 60e3) };
      for (const chat of await activeChats(env)) {   // each person in turn, as themselves: their alerts, then their daily messages
        resetBudget();
        await asChat(chat, async () => {
          const env = cenv;   // the round asks Firebase "anything new?" at most every 10 (owner) / 30 (members) minutes
          await runWatch(env).then(r => { if (r.fired) console.log(JSON.stringify({ watch: r })); }).catch(e => log('watch', e));
          await runDaily(env, now).then(r => { if (r.job) console.log(JSON.stringify({ daily: r })); }).catch(e => log('daily', e));   // phase 5: morning / evening / radars / pinned
        });
      }
    })());
  },
};
