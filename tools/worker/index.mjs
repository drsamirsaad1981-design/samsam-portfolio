// tools/worker/index.mjs — the one Cloudflare Worker: AI Analysis (/analyze, tools/ai-worker.js) + the Telegram bot (/tg).
// Built into a single file by tools/build-worker.mjs → tools/dist/samsam-worker.js (that file is what you paste).
import ai from '../ai-worker.js';
import { handleTelegram, setup, check } from './bot.mjs';
import { runWatch } from './watch.mjs';
import { runDaily } from './daily.mjs';
import { page, api, cardSend } from './miniapp.mjs';
import { resetBudget } from './data.mjs';

export default {
  async fetch(request, env, ctx) {
    const p = new URL(request.url).pathname.replace(/\/+$/, '');
    if (p.endsWith('/tg/setup')) return setup(request, env);
    if (p.endsWith('/tg/check')) return check(request, env);
    if (p.endsWith('/tg/app')) return page();          // the Mini App page (phase 7)
    if (p.endsWith('/tg/api')) return api(request, env); // its data, only with Telegram's signature for your account
    if (p.endsWith('/tg/card')) return cardSend(request, env); // 📸 an image card drawn in the Mini App → a photo in your chat
    if (p.endsWith('/tg')) return handleTelegram(request, env, ctx);
    return ai.fetch(request, env, ctx);
  },
  // every 5 minutes (tools/worker/wrangler.toml → crons): the alerts you set in words, then the bot's own messages (phase 5)
  async scheduled(event, env, ctx) {
    const now = event && event.scheduledTime ? +event.scheduledTime : Date.now(), log = (k, e) => console.log(JSON.stringify({ [k]: 'error', message: String(e && e.message).slice(0, 200) }));
    ctx.waitUntil((async () => {
      resetBudget();   // one allowance of outside calls for the whole run (Cloudflare counts per run)
      await runWatch(env).then(r => { if (r.fired) console.log(JSON.stringify({ watch: r })); }).catch(e => log('watch', e));
      await runDaily(env, now).then(r => { if (r.job) console.log(JSON.stringify({ daily: r })); }).catch(e => log('daily', e));   // phase 5: morning / evening / radars / pinned
    })());
  },
};
