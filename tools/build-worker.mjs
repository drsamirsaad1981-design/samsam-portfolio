// tools/build-worker.mjs — builds the Cloudflare Worker (AI Analysis + the Telegram bot) into ONE file to paste:
//   node tools/build-worker.mjs          → tools/dist/samsam-worker.js
// It first writes tools/worker/cg-ids.json (the app's ticker → CoinGecko id list, from samsam-coins.js), then bundles
// tools/worker/index.mjs with esbuild. The test (tests/tg_bot_test.mjs) checks the built file is up to date.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = fs.readFileSync(path.join(ROOT, 'samsam-coins.js'), 'utf8').match(/var CG_IDS = \{([\s\S]*?)\};/);
const ids = {};
if (src) for (const x of src[1].matchAll(/"([^"]+)"\s*:\s*"([a-z0-9-]+)"/g)) ids[x[1].toUpperCase()] = x[2];
fs.writeFileSync(path.join(ROOT, 'tools/worker/cg-ids.json'), JSON.stringify(ids, Object.keys(ids).sort(), 0) + '\n');
const out = path.join(ROOT, 'tools/dist/samsam-worker.js');
export const SOURCES = ['tools/ai-worker.js', 'tools/alerts-core.mjs', 'samsam-core.js', 'tools/worker/index.mjs', 'tools/worker/bot.mjs', 'tools/worker/data.mjs', 'tools/worker/cg-ids.json', 'tools/worker/ai.mjs', 'tools/worker/watch.mjs', 'tools/worker/voice.mjs', 'tools/worker/trade.mjs', 'tools/worker/daily.mjs', 'tools/worker/paper.mjs', 'tools/worker/miniapp.mjs', 'tools/worker/miniapp.html', 'tools/worker/who.mjs', 'tools/worker/byok.mjs', 'tools/worker/stars.mjs', 'tools/worker/admin.mjs', 'guide.json'];
const hash = crypto.createHash('sha256'); for (const f of SOURCES) hash.update(fs.readFileSync(path.join(ROOT, f)));
const H = hash.digest('hex').slice(0, 16);
fs.mkdirSync(path.dirname(out), { recursive: true });
execFileSync('npx', ['-y', 'esbuild@0.24.0', path.join(ROOT, 'tools/worker/index.mjs'), '--bundle', '--format=esm', '--platform=neutral', '--target=es2022',
  '--outfile=' + out, '--loader:.html=text', '--external:node:async_hooks', '--legal-comments=none', '--log-level=warning',
  '--banner:js=// samsam-worker.js — BUILT FILE (node tools/build-worker.mjs). Paste all of it into the Cloudflare Worker: AI Analysis (/analyze) + the Telegram bot (/tg).\n// Sources: tools/ai-worker.js, tools/worker/*.mjs, tools/alerts-core.mjs, samsam-core.js. No keys or secrets in here — they live in the Worker settings.\n// sources-hash: ' + H],
  { stdio: 'inherit', cwd: ROOT });
console.log('built', path.relative(ROOT, out), Math.round(fs.statSync(out).size / 1024) + ' KB', Object.keys(ids).length + ' coin ids');
