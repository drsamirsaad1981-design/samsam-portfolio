// tools/worker/voice.mjs — a voice note → text (Cloudflare Workers AI · Whisper), then the bot treats it as if you typed it.
// Needs the AI binding in wrangler.toml ([ai] binding = "AI"); no key. Arabic or English, detected per note.
// Free plan: 10,000 Neurons a day; Whisper turbo ≈ 47 per audio minute → about 200 minutes a day before it costs anything.

export const MAX_SEC = 120;
const MODEL = '@cf/openai/whisper-large-v3-turbo';
// words it should expect, one hint per language (a hint in the wrong language pulls the words into that language —
// an English note once came back as Arabic letters). So: first find the language, then transcribe with its own hint.
const HINT = {
  en: 'Bitcoin BTC, Ethereum ETH, Solana SOL, KAVA, LINK, funding, liquidation, alert me if, portfolio, take profit, paper buy.',
  ar: 'نبّهني لو، محفظتي، السعر، خطة الخروج، تصفيات، تمويل، تجريبي، بيتكوين BTC، إيثيريوم ETH، سولانا SOL، كافا KAVA.',
};
const score = o => { const s = (o && o.segments) || []; const v = s.map(x => +x.avg_logprob).filter(isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : -9; };
const clean = o => String((o && o.text) || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
const odd = t => /[^\p{Script=Latin}\p{Script=Arabic}\p{M}\p{N}\p{P}\p{S}\s]/u.test(t);   // letters from another script (e.g. Cyrillic) → a bad guess

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
    const a = b64(await audio.arrayBuffer());
    const run = (language, hint) => env.AI.run(MODEL, { audio: a, vad_filter: true, ...(language ? { language } : {}), ...(hint ? { initial_prompt: hint } : {}) });
    // 1) which language? (no hint)  2) sure it's English or Arabic → again in that language with its hint
    //    3) unsure → both, keep the one Whisper is more confident in (and never one in another script)
    const first = await run(null, null), info = (first && first.transcription_info) || {}, lang = info.language, prob = +info.language_probability || 0;
    let best;
    if ((lang === "en" || lang === "ar") && prob >= 0.7) best = { o: await run(lang, HINT[lang]), lang };
    else {
      const [en, ar] = await Promise.all([run('en', HINT.en), run('ar', HINT.ar)]);
      const c = [{ o: en, lang: 'en' }, { o: ar, lang: 'ar' }].filter(x => clean(x.o)).sort((x, y) => (odd(clean(x.o)) - odd(clean(y.o))) || (score(y.o) - score(x.o)));
      best = c[0] || { o: first, lang };
    }
    let text = clean(best.o);
    if (!text || odd(text)) { const t0 = clean(first); if (t0 && !odd(t0)) text = t0; }
    return text.replace(/[\p{P}\s]/gu, '').length < 2 ? { error: 'empty' } : { text, lang: best.lang };
  } catch (e) {
    console.log(JSON.stringify({ voice: 'fail', message: String(e && e.message).slice(0, 300) }));
    return { error: 'fail' };
  }
}
