// tools/worker/index.mjs — the one Cloudflare Worker: AI Analysis (/analyze, tools/ai-worker.js) + the Telegram bot (/tg).
// Built into a single file by tools/build-worker.mjs → tools/dist/samsam-worker.js (that file is what you paste).
import ai from '../ai-worker.js';
import { handleTelegram, setup, check } from './bot.mjs';
import { runWatch } from './watch.mjs';

export default {
  async fetch(request, env, ctx) {
    const p = new URL(request.url).pathname.replace(/\/+$/, '');
    if (p.endsWith('/tg/setup')) return setup(request, env);
    if (p.endsWith('/tg/check')) return check(request, env);
    if (p.endsWith('/tg')) return handleTelegram(request, env, ctx);
    return ai.fetch(request, env, ctx);
  },
  // every 5 minutes (tools/worker/wrangler.toml → crons): the alerts you set in words
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runWatch(env).then(r => { if (r.fired) console.log(JSON.stringify({ watch: r })); }).catch(e => console.log(JSON.stringify({ watch: 'error', message: String(e && e.message).slice(0, 200) }))));
  },
};
