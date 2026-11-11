// tools/worker/index.mjs — the one Cloudflare Worker: AI Analysis (/analyze, tools/ai-worker.js) + the Telegram bot (/tg).
// Built into a single file by tools/build-worker.mjs → tools/dist/samsam-worker.js (that file is what you paste).
import ai from '../ai-worker.js';
import { handleTelegram, setup } from './bot.mjs';

export default {
  async fetch(request, env, ctx) {
    const p = new URL(request.url).pathname.replace(/\/+$/, '');
    if (p.endsWith('/tg/setup')) return setup(request, env);
    if (p.endsWith('/tg')) return handleTelegram(request, env, ctx);
    return ai.fetch(request, env, ctx);
  },
};
