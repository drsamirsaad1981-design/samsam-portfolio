// tools/worker/index.mjs — the one Cloudflare Worker: AI Analysis (/analyze, tools/ai-worker.js) + the Telegram bot (/tg).
// Built into a single file by tools/build-worker.mjs → tools/dist/samsam-worker.js (that file is what you paste).
import ai, { setMemberCheck } from '../ai-worker.js';
import { handleTelegram, setup, check } from './bot.mjs';
import { runWatch } from './watch.mjs';
import { runDaily, kickPrices } from './daily.mjs';
import { page, api, cardSend, logo } from './miniapp.mjs';
import { resetBudget } from './data.mjs';
import { asChat, activeChats, migrateOwner, memberByEmail, DEF_REPORTS } from './who.mjs';

// AI Analysis in the app: people invited through the bot whose e-mail Samir approved — their own daily reports (/users), Sonnet
setMemberCheck(async (env, email) => { const x = await memberByEmail(env, email); return x ? { limit: x.paused ? 0 : Number.isFinite(x.reports) ? x.reports : DEF_REPORTS, model: env.MEMBER_MODEL || 'claude-sonnet-5-5' } : null; });

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
      for (const chat of await activeChats(env)) {   // each person in turn, as themselves: their alerts, then their daily messages
        resetBudget();
        await asChat(chat, async () => {
          await runWatch(env).then(r => { if (r.fired) console.log(JSON.stringify({ watch: r })); }).catch(e => log('watch', e));
          await runDaily(env, now).then(r => { if (r.job) console.log(JSON.stringify({ daily: r })); }).catch(e => log('daily', e));   // phase 5: morning / evening / radars / pinned
        });
      }
    })());
  },
};
