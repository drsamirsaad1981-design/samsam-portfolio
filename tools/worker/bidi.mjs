// tools/worker/bidi.mjs — Arabic messages read right-to-left in Telegram.
//
// Telegram picks a line's direction from its FIRST strong letter: "✅ QNT 2.237 — التطبيق: 2.2" starts with a Latin
// letter, so the whole line runs left-to-right and the Arabic in it comes out scrambled; "114% أبعد" turns into "% 114".
// For every line that has Arabic in it:
//   · it starts with an RLM (right-to-left mark) → the line is right-to-left;
//   · each run of Latin letters / digits / $ % . , : + − (a ticker, a price, "Fear & Greed: 12") is held between two LRMs
//     (left-to-right marks), so "$64,950" and "-1.78%" keep their shape inside the Arabic sentence (Telegram's apps ignore
//     the newer isolate marks, LRI / PDI — seen on Android, 17 Nov);
//   · after each run an RLM, so a bracket or space after it stays with the Arabic ("BTC (39)", not "(39) BTC");
//   · after each " · " (and after a 🟢 / 🔴 dot) an RLM, so a list ("Binance · Gate · now") runs right-to-left item by item;
//   · "−$29M" gets a word joiner after the sign, so the line never breaks between "−" and "$".
// HTML tags are left alone; a line already marked (the guide's cards) is not touched again. Lines with no Arabic
// (English messages, the English half of the group's posts) are not touched at all.
const AR = /[\u0600-\u06FF]/, RLM = '\u200F', LRM = '\u200E', LRI = '\u2066';
const RUN = /[A-Za-z0-9$€£%+\-−.,:/_#@×'’]+(?:&amp;|&lt;|&gt;)?(?:[  ]+(?:&amp;|&lt;|&gt;|[A-Za-z0-9$€£%+\-−.,:/_#@×'’→←≤≥])+)*/g;   // (→ ≤ ≥ inside a run: "58.7% → ≤ 45.9%" stays one left-to-right piece)
const hasWord = s => /[A-Za-z0-9]/.test(s);
export function bidiLine(line, all = false) {
  if (!(all ? /[A-Za-z0-9\u0600-\u06FF]/.test(line) : AR.test(line)) || line.startsWith(RLM) || line.includes(LRI)) return line;   // (LRI: the guide's own cards)
  const out = line.split(/(<[^>]+>)/).map(part => part.startsWith('<') ? part
    : part.replace(RUN, m => {
      const t = m.replace(/[  ]+$/, ''), tail = m.slice(t.length);
      const core = t.replace(/^[.,:\s\u00A0]+|[.,:\s\u00A0]+$/g, '');   // a full stop / colon at the edge belongs to the Arabic sentence
      if (!hasWord(core)) return m;
      const i = t.indexOf(core);
      let glued = core.length <= 24 ? core.replace(/ /g, '\u00A0') : core;   // a short run ("BABYDOGE 0.45") never breaks across two lines
      glued = glued.replace(/([+\-−])\$/g, '$1\u2060$');   // "−$29M": no line break between the sign and the $ (a word joiner)
      return t.slice(0, i) + LRM + glued + LRM + RLM + t.slice(i + core.length) + tail;   // RLM after: a bracket / space that follows belongs to the Arabic ("BTC (39)" never turns into "(39) BTC")
    }).replace(/ · /g, ' ·' + RLM + ' ').replace(/([🟢🔴⚪🟡]) /gu, '$1 ' + RLM)).join('');   // after a 🟢 / 🔴 dot too: "$63,129 🔴 −1.09%" stays two parts, not one left-to-right run   // a list "Binance · Gate · now" runs right-to-left, item by item
  return RLM + out;
}
// an Arabic message (Arabic letters at least a third of the Latin ones, tags left out): EVERY line runs right-to-left, so the rows
// that are only a ticker and numbers ("✅ QNT 2.237 · $341") line up with the Arabic ones. Otherwise (English), and always for the
// group's English + Arabic posts (mode 'lines'), only the lines with Arabic in them.
export function bidi(text, mode = 'auto') {
  if (typeof text !== 'string' || !AR.test(text)) return text;
  const plain = text.replace(/<[^>]+>/g, ''), ar = (plain.match(/[\u0600-\u06FF]/g) || []).length, la = (plain.match(/[A-Za-z]/g) || []).length;
  const all = mode !== 'lines' && ar * 3 >= la;   // Arabic is the language (a list of tickers can outnumber its letters)
  return text.split('\n').map(l => bidiLine(l, all)).join('\n');
}
// a Telegram API body: its text / caption made right-to-left where Arabic (nothing else changes)
// money: the sign goes before the $ — "$-1,392" / "$-582M" (as Claude's own words may write it) → "−$1,392" / "−$582M"
export const signFirst = s => typeof s === 'string' ? s.replace(/\$\s?[-−](?=\d)/g, '−$') : s;
export function bidiBody(body, mode = 'auto') {
  if (!body || typeof body !== 'object') return body;
  const b = { ...body };
  if (typeof b.text === 'string') b.text = signFirst(b.text);
  if (typeof b.caption === 'string') b.caption = signFirst(b.caption);
  if (typeof b.text === 'string') { const x = bidi(b.text, mode); if (x.length <= 4096) b.text = x; }   // Telegram's limit: never longer than it allows
  if (typeof b.caption === 'string') { const x = bidi(b.caption, mode); if (x.length <= 1024) b.caption = x; }
  return b;
}

// ⚠️ under the signals and the daily messages: they follow your own plan — not financial advice
export const NOT_ADVICE = { en: '<i>⚠️ Not financial advice — reminders of your own plan.</i>', ar: '<i>⚠️ ليست نصيحة مالية — تذكير بخطتك أنت.</i>' };
