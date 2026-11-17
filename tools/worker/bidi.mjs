// tools/worker/bidi.mjs — Arabic messages read right-to-left in Telegram.
//
// Telegram picks a line's direction from its FIRST strong letter: "✅ QNT 2.237 — التطبيق: 2.2" starts with a Latin
// letter, so the whole line runs left-to-right and the Arabic in it comes out scrambled; "114% أبعد" turns into "% 114".
// For every line that has Arabic in it:
//   · it starts with an RLM (right-to-left mark) → the line is right-to-left;
//   · each run of Latin letters / digits / $ % . , : + − (a ticker, a price, "Fear & Greed: 12") becomes its own
//     left-to-right island (LRI … PDI), so "$64,950" and "-1.78%" keep their shape inside the Arabic sentence.
// HTML tags are left alone; a line already marked (the guide's cards) is not touched again. Lines with no Arabic
// (English messages, the English half of the group's posts) are not touched at all.
const AR = /[؀-ۿ]/, RLM = '‏', LRI = '⁦', PDI = '⁩';
const RUN = /[A-Za-z0-9$€£%+\-−.,:/_#@×'’]+(?:&amp;|&lt;|&gt;)?(?:[  ]+(?:&amp;|&lt;|&gt;|[A-Za-z0-9$€£%+\-−.,:/_#@×'’])+)*/g;
const hasWord = s => /[A-Za-z0-9]/.test(s);
export function bidiLine(line, all = false) {
  if (!(all ? /[A-Za-z0-9\u0600-\u06FF]/.test(line) : AR.test(line)) || line.startsWith(RLM) || line.includes(LRI)) return line;
  const out = line.split(/(<[^>]+>)/).map(part => part.startsWith('<') ? part
    : part.replace(RUN, m => {
      const t = m.replace(/[  ]+$/, ''), tail = m.slice(t.length);
      const core = t.replace(/^[.,:\s\u00A0]+|[.,:\s\u00A0]+$/g, '');   // a full stop / colon at the edge belongs to the Arabic sentence
      if (!hasWord(core)) return m;
      const i = t.indexOf(core);
      return t.slice(0, i) + LRI + core + PDI + t.slice(i + core.length) + tail;
    })).join('');
  return RLM + out;
}
// a mostly-Arabic message (more Arabic letters than Latin ones, tags left out): EVERY line runs right-to-left, so the rows
// that are only a ticker and numbers ("✅ QNT 2.237 · $341") line up with the Arabic ones. Otherwise (English, or the
// group's English + Arabic posts) only the lines with Arabic in them.
export function bidi(text) {
  if (typeof text !== 'string' || !AR.test(text)) return text;
  const plain = text.replace(/<[^>]+>/g, ''), ar = (plain.match(/[\u0600-\u06FF]/g) || []).length, la = (plain.match(/[A-Za-z]/g) || []).length;
  const all = ar > la;
  return text.split('\n').map(l => bidiLine(l, all)).join('\n');
}
// a Telegram API body: its text / caption made right-to-left where Arabic (nothing else changes)
export function bidiBody(body) {
  if (!body || typeof body !== 'object') return body;
  const b = { ...body };
  if (typeof b.text === 'string') { const x = bidi(b.text); if (x.length <= 4096) b.text = x; }   // Telegram's limit: never longer than it allows
  if (typeof b.caption === 'string') { const x = bidi(b.caption); if (x.length <= 1024) b.caption = x; }
  return b;
}
