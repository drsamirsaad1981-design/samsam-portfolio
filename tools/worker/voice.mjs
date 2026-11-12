// tools/worker/voice.mjs — a voice note → text (Cloudflare Workers AI · Whisper), then the bot treats it as if you typed it.
// Needs the AI binding in wrangler.toml ([ai] binding = "AI"); no key. Arabic or English, detected per note.
// Free plan: 10,000 Neurons a day; Whisper turbo ≈ 47 per audio minute → about 200 minutes a day before it costs anything.

export const MAX_SEC = 120;
const MODEL = '@cf/openai/whisper-large-v3-turbo';
// words it should expect (helps with tickers and crypto terms; it does not force a language)
const HINT = 'Bitcoin BTC, ETH, SOL, LINK, PENDLE, funding, alert, portfolio, take profit. نبّهني لو، محفظتي، السعر، خطة الخروج.';

function b64(buf) {
  const u8 = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

// voice = Telegram's message.voice / message.audio → { text } or { error: 'noai' | 'long' | 'empty' | 'fail' }
export async function transcribe(env, voice) {
  if (!env.AI || typeof env.AI.run !== 'function') return { error: 'noai' };
  if (!voice || !voice.file_id) return { error: 'fail' };
  if ((voice.duration || 0) > MAX_SEC || (voice.file_size || 0) > 10e6) return { error: 'long' };
  try {
    const f = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file_id: voice.file_id }) }).then(r => r.json());
    const p = f && f.ok && f.result && f.result.file_path;
    if (!p) return { error: 'fail' };
    const audio = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${p}`);
    if (!audio.ok) return { error: 'fail' };
    const out = await env.AI.run(MODEL, { audio: b64(await audio.arrayBuffer()), vad_filter: true, initial_prompt: HINT });
    const text = String((out && out.text) || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
    return text.replace(/[\p{P}\s]/gu, '').length < 2 ? { error: 'empty' } : { text };
  } catch (e) {
    console.log(JSON.stringify({ voice: 'fail', message: String(e && e.message).slice(0, 300) }));
    return { error: 'fail' };
  }
}
