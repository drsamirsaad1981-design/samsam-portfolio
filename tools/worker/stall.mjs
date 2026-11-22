// tools/worker/stall.mjs — 🛠 "price updates stopped" → a message to the owner (Samir only).
//
// GitHub saves the market snapshot twice an hour, and the Worker already asks it to run again when it is 25 minutes late
// (daily.mjs → kickPrices). This is the next step, for when that did not help: the snapshot is over 90 minutes old (three
// requests went unanswered) → ONE message to the owner with how old it is, what the bot tried, and a button to the runs
// on GitHub; a reminder every 6 hours while it lasts; and one "back" message when a fresh snapshot arrives. The same when
// the snapshot cannot be read at all for 90 minutes. The Worker's clock does not depend on GitHub, so this arrives even
// when GitHub's schedule (which sends the other "data warning") is the thing that stopped. Members never get it.
// KV tg:stall = { unk?: first time unreadable, at?: last message, from?: the last good snapshot, n?: messages sent }.
import { loadMarket } from './data.mjs';

const KEY = 'tg:stall', LIMIT = 90 * 60e3, AGAIN = 6 * 3600e3, FRESH = 45 * 60e3;
const RUNS = 'https://github.com/drsamirsaad1981-design/samsam-portfolio/actions/workflows/prices.yml';
const kv = { get: async env => { try { return JSON.parse((env.RATE && await env.RATE.get(KEY)) || '{}') || {}; } catch (_) { return {}; } }, put: async (env, v) => { try { if (env.RATE) await env.RATE.put(KEY, JSON.stringify(v)); } catch (_) {} } };
const tg = async (env, method, body) => { try { const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return await r.json(); } catch (_) { return { ok: false }; } };

// "1 h 35 min" / "ساعة و35 دقيقة"
export function span(ms, ar) {
  const min = Math.max(1, Math.round(ms / 60e3)), h = Math.floor(min / 60), m = min % 60;
  if (!ar) return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min';
  const hs = h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : h <= 10 ? h + ' ساعات' : h + ' ساعة';
  return h ? hs + (m ? ' و' + m + ' دقيقة' : '') : m + ' دقيقة';
}
// what the bot's own "run it now" request came to (kickPrices' answer)
const tried = (kick, ar) => kick === 'no token' ? (ar ? 'البوت لا يستطيع إعادة تشغيله بنفسه: مفتاح GitHub غير موجود عنده.' : 'The bot cannot restart it by itself: it has no GitHub key.')
  : kick === 'refused' ? (ar ? 'البوت طلب من GitHub تشغيله الآن، وGitHub رفض الطلب (راجع صلاحية المفتاح).' : 'The bot asked GitHub to run it now, and GitHub refused (check the key).')
  : (ar ? 'البوت يطلب من GitHub تشغيله كل 20 دقيقة، ولم يصل شيء بعد.' : 'The bot has been asking GitHub to run it every 20 minutes; nothing has come back yet.');
export function stallMessage({ age, unread, kick, again }, lang) {
  const ar = lang === 'ar';
  const text = ar ? [
    '🛠 <b>' + (again ? 'تحديث الأسعار ما زال متوقفاً' : 'تحديث الأسعار توقف') + '</b>',
    unread ? 'لقطة السوق لا تُقرأ منذ ' + span(age, true) + '.' : 'آخر لقطة للسوق عمرها ' + span(age, true) + ' (المعتاد: كل 30 دقيقة).',
    '', '• ' + tried(kick, true), '• الأسعار المباشرة تعمل. الذي ينتظر اللقطة: صفحات السوق، وسجل الأسعار بالساعة، والتنبيهات المجدولة.',
    '', 'افتح سجل التشغيل لترى سبب التوقف.',
  ] : [
    '🛠 <b>' + (again ? 'Price updates are still stopped' : 'Price updates stopped') + '</b>',
    unread ? 'The market snapshot has been unreadable for ' + span(age) + '.' : 'The last market snapshot is ' + span(age) + ' old (normally: every 30 minutes).',
    '', '• ' + tried(kick), '• Live prices still work. What waits for the snapshot: the market pages, the hourly price history and the scheduled alerts.',
    '', 'Open the runs to see what stopped it.',
  ];
  return { text: text.join('\n'), buttons: [[{ text: ar ? '🛠 سجل التشغيل على GitHub' : '🛠 The runs on GitHub', url: RUNS }]] };
}
export const backMessage = (ms, lang) => lang === 'ar' ? '✅ <b>تحديث الأسعار عاد</b>\nوصلت لقطة جديدة للسوق بعد توقف ' + span(ms, true) + '.' : '✅ <b>Price updates are back</b>\nA fresh market snapshot arrived after ' + span(ms) + ' without one.';

// the cron (every 5 minutes). seen = kickPrices' answer: { kick, t } — t = the snapshot's time when it could be read
export async function runStall(env, now = Date.now(), seen = null) {
  if (!env.TELEGRAM_CHAT_ID || !env.RATE) return { job: null };
  let t = seen && seen.t;
  if (t === undefined) { const m = await loadMarket([], []).catch(() => null); t = m && m.parts && Date.parse(m.parts.top); }
  t = t > 0 ? t : 0;
  const s = await kv.get(env);
  if (!t && !s.unk) { s.unk = now; await kv.put(env, s); return { job: null }; }   // unreadable: the clock starts
  if (t && s.unk && !s.at) { await kv.put(env, {}); return { job: null }; }       // …and it was only a moment
  const age = t ? now - t : now - s.unk;
  const send = async v => {
    let lang = null; try { lang = await env.RATE.get(`tg:${env.TELEGRAM_CHAT_ID}:lang`); } catch (_) {}
    lang = lang === 'ar' || lang === 'en' ? lang : env.BOT_LANG === 'ar' ? 'ar' : 'en';   // the owner's own bot language
    const x = v(lang), r = await tg(env, 'sendMessage', { chat_id: env.TELEGRAM_CHAT_ID, text: x.text, parse_mode: 'HTML', disable_web_page_preview: true, ...(x.buttons ? { reply_markup: { inline_keyboard: x.buttons } } : {}) });
    return !!(r && r.ok);
  };
  if (age > LIMIT) {
    if (s.at && now - s.at < AGAIN) return { job: null };
    const ok = await send(lang => stallMessage({ age, unread: !t, kick: seen && seen.kick, again: !!s.at }, lang));
    if (ok) await kv.put(env, { ...s, at: now, from: s.from || t || s.unk, n: (s.n || 0) + 1 });
    return { job: 'stall', ok, age_min: Math.round(age / 60e3) };
  }
  if (s.at && t && now - t < FRESH) {   // it was reported, and a fresh snapshot is here
    const ok = await send(lang => ({ text: backMessage(Math.max(0, t - (s.from || s.at)), lang) }));
    if (ok) await kv.put(env, {});
    return { job: 'stall-back', ok };
  }
  return { job: null };
}
