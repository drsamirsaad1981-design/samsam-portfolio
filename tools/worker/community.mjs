// tools/worker/community.mjs — 📢 the members' channel, with 💬 comments under each post (since 20 Nov: one place, not two).
//
// Samir adds the bot as an admin to the channel and to its discussion group (the group Telegram uses for the comments —
// linked in the channel's settings → Discussion). The bot notices (my_chat_member), remembers them, makes a join link that
// needs approval, posts a pinned 📘 guide post (its button opens the full guide in the bot), and from then on:
//   • approves a join request only from a member of the bot (strangers are declined) — /community gives members the link
//   • posts a market pulse to the channel twice a day (09:00 and 21:05 Riyadh) and pins the latest; a "big move" post
//     when BTC moves ±5% in 24 h (once a day) — members discuss each one in its comments
//   • a new release changed the guide → one short 🆕 post listing the parts that changed
//   • /announce <text> (Samir): posted to the channel
// Suggestions and bug reports go to the bot (/feedback), not to a group topic. The old forum topics (💬 Chat · 💡 · 🐞 · 📘)
// are gone: a forum group can't be a channel's discussion group.
// Channel readers can send ⭐ Star reactions to posts (Samir turns them on in the channel's settings).

import { usMarket, US_STATE } from './usmarket.mjs';
import { bidiBody } from './bidi.mjs';
import { members } from './who.mjs';
import { loadMarket, derivatives, resetBudget } from './data.mjs';
import { whaleLines } from './daily.mjs';
import { localParts, local, esc, usd, pct, dot, isStable, etfDay, flow, APP } from '../alerts-core.mjs';
import GUIDE from '../../guide.json' with { type: 'json' };

const KEY = 'tg:community';
// Telegram allows ~20 messages a minute in a group: on "Too Many Requests" wait what it says (≤ 15 s) and try once more
async function tg(env, method, body) {
  body = bidiBody(body, 'lines');   // Arabic lines read right-to-left (bidi.mjs); the English halves stay as they are
  let r = await tg1(env, method, body);
  if (r && r.error_code === 429) { const w = Math.min(15, (r.parameters && r.parameters.retry_after) || 3); await new Promise(z => setTimeout(z, w * 1000)); r = await tg1(env, method, body); }
  return r;
}
async function tg1(env, method, body) {
  try { const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return await r.json(); }
  catch (_) { return { ok: false }; }
}
export async function getCommunity(env) { try { return JSON.parse((env.RATE && await env.RATE.get(KEY)) || '{}') || {}; } catch (_) { return {}; } }
async function putCommunity(env, c) { try { if (env.RATE) await env.RATE.put(KEY, JSON.stringify(c)); } catch (_) {} }
const owner = env => String(env.TELEGRAM_CHAT_ID);
const say = (env, text) => tg(env, 'sendMessage', { chat_id: owner(env), text, parse_mode: 'HTML', disable_web_page_preview: true });


const NOTE = { en: 'Not financial advice — for information only.', ar: 'ليست نصيحة مالية — للمعلومة فقط.' };


// ── the bot was added / removed / promoted somewhere ──
export async function onMyChatMember(env, u) {
  const m = u.my_chat_member, chat = m && m.chat; if (!chat) return;
  const by = String(m.from && m.from.id), isAdmin = m.new_chat_member && m.new_chat_member.status === 'administrator';
  const gone = m.new_chat_member && ['left', 'kicked'].includes(m.new_chat_member.status);
  if (chat.type === 'private') return;
  if (by !== owner(env) && !gone) {   // only Samir may put the bot in a channel / group: anyone else → it leaves
    await tg(env, 'leaveChat', { chat_id: chat.id }); return;
  }
  const c = await getCommunity(env), kind = chat.type === 'channel' ? 'channel' : 'group';
  if (gone) { if (c[kind] && String(c[kind].id) === String(chat.id)) { delete c[kind]; await putCommunity(env, c); await say(env, `ℹ️ The bot left ${esc(chat.title || '')}.`); } return; }
  if (!isAdmin) { await say(env, `ℹ️ I'm in <b>${esc(chat.title || '')}</b> — make me an <b>admin</b> there to finish the setup.`); return; }
  c[kind] = { id: chat.id, title: chat.title || '', at: Date.now() };
  await putCommunity(env, c);
  await setup(env, kind);
}

// Samir forwards a post from the channel (or a message from the group) to the bot → that chat is registered, if the bot
// is an admin there (for when the bot was made admin before it listened for that)
export async function registerForward(env, msg) {
  const o = msg.forward_origin, ch = (o && (o.chat || o.sender_chat)) || msg.forward_from_chat; if (!ch || !ch.id) return false;
  const me = await tg(env, 'getMe', {}), st = me.ok ? await tg(env, 'getChatMember', { chat_id: ch.id, user_id: me.result.id }) : null;
  if (!st || !st.ok || st.result.status !== 'administrator') { await say(env, `ℹ️ I'm not an admin in <b>${esc(ch.title || '')}</b> yet — add me as admin there first.`); return true; }
  const c = await getCommunity(env), kind = ch.type === 'channel' ? 'channel' : 'group';
  c[kind] = { ...(c[kind] && String(c[kind].id) === String(ch.id) ? c[kind] : {}), id: ch.id, title: ch.title || '', at: Date.now() };
  await putCommunity(env, c); await setup(env, kind);
  return true;
}

// the channel: a join link (requests approved by the bot) + the pinned 📘 guide post. The group: is it the channel's
// discussion (its comments)? — Telegram says so in the channel's linked_chat_id.
export async function setup(env, kind, opt = {}) {
  const c = await getCommunity(env), x = c[kind]; if (!x) return { ok: false };
  const notes = [];
  if (kind === 'channel') {
    if (!x.link) {   // one join link, kept: a new one on every setup would leave old links alive beside it
      const link = await tg(env, 'createChatInviteLink', { chat_id: x.id, name: 'Cute Portfolio members', creates_join_request: true });
      if (link.ok) x.link = link.result.invite_link; else notes.push('⚠️ No join link — give me "Invite users via link".');
    }
    if (!x.guideMsg || opt.reguide) {
      const id = await postGuidePost(env, x);
      if (id) { x.guideMsg = id; x.guideSig = guideSigs(); x.guideV = GUIDE.v || 1; x.guidePostV = POST_V; } else notes.push('⚠️ The 📘 guide post did not go — let me post and pin messages.');
    }
  }
  const ch = c.channel, g = c.group;
  if (ch && g) {
    const info = await tg(env, 'getChat', { chat_id: ch.id });
    g.linked = !!(info.ok && info.result && String(info.result.linked_chat_id) === String(g.id));
    if (g.linked) { delete g.topics; delete g.strays; }   // the forum of before: forgotten
    notes.push(g.linked ? '💬 Comments are on — members talk under each channel post.'
      : `⚠️ Link the group to the channel: channel → ✏️ Edit → <b>Discussion</b> → pick <b>${esc(g.title)}</b> (if Telegram refuses, turn <b>Topics</b> off in the group first). Then /community setup.`);
  } else if (kind === 'group') notes.push('ℹ️ Add me to the channel too, and link this group to it (channel → Edit → Discussion).');
  c[kind] = x; await putCommunity(env, c);
  await say(env, `✅ <b>${esc(x.title)}</b> is set up (${kind === 'channel' ? '📢 channel' : '💬 comments group'}).` + (kind === 'channel' && x.link ? `\nJoin link (members only — I approve each request): ${x.link}` : '') + (notes.length ? '\n' + notes.join('\n') : ''));
  return { ok: true };
}
// ⚠️ channel posts carry their links IN the text, never as buttons: Telegram shows no "Leave a comment" under a post that
// has buttons (seen 20 Nov — the guide post had no comments). The bot's own link to the guide: t.me/<bot>?start=guide
async function guideLink(env) {
  const me = await tg(env, 'getMe', {}); const u = me.ok && me.result && me.result.username;
  return u ? `📘 <a href="https://t.me/${u}?start=guide">Open the guide</a>\n📘 <a href="https://t.me/${u}?start=guide">افتح الدليل</a>` : '';   // two lines: English and Arabic never share one
}
// 📘 the channel's guide post (pinned): what is in the guide, in both languages; its link opens it in the bot.
// Posted again (/community guide): the old one is unpinned and deleted
async function postGuidePost(env, ch) {
  const text = `<b>${GUIDE.title.en}</b>\n${GUIDE.intro.en}\n\n<b>${GUIDE.title.ar}</b>\n${GUIDE.intro.ar}\n\n`   // each language: its title, then its line (never both titles on one line)
    + guideGroups().map(g => g.items.map(s => `${s.e} ${esc((s.b || s.t).en)} · ${esc((s.b || s.t).ar)}`).join('\n')).join('\n\n')
    + '\n\n💡 <i>Ideas or a bug? Send /feedback to the bot.</i>\n💡 <i>اقتراح أو مشكلة؟ أرسل /feedback للبوت.</i>';
  const link = await guideLink(env);
  const r = await tg(env, 'sendMessage', { chat_id: ch.id, text: text + (link ? '\n\n' + link : ''), parse_mode: 'HTML', disable_web_page_preview: true });
  if (!r.ok) return null;
  if (ch.guideMsg && ch.guideMsg !== r.result.message_id) { await tg(env, 'unpinChatMessage', { chat_id: ch.id, message_id: ch.guideMsg }); await tg(env, 'deleteMessage', { chat_id: ch.id, message_id: ch.guideMsg }); }
  await tg(env, 'pinChatMessage', { chat_id: ch.id, message_id: r.result.message_id, disable_notification: true });
  return r.result.message_id;
}

// 📘 one part of the guide as a card: the title, a one-line summary, numbered steps, a 💡 tip (bot + group, same look).
// In Arabic every line starts right-to-left (RLM), and English words / commands stay their own left-to-right island
// (else "/alerts" shows as "alerts/"). Commands stay plain text, so Telegram makes them tappable.
const LRI = '\u200E', PDI = '\u200E', RLM = '\u200F';   // LRM marks: Telegram's apps ignore the isolate marks (LRI / PDI)
const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
export function gLine(l, ar) {
  if (!ar) return l;
  l = l.replace(/<(code|b|i)>([^<]*)<\/\1>/g, (m, t, x) => /[\u0600-\u06FF]/.test(x) ? m : `${LRI}<${t}>${x}</${t}>${PDI}`);
  l = l.replace(/(^|[\s(])(\/[a-z]+(?: CODE)?)(?=$|[\s),.؛،])/g, (m, a, c) => `${a}${LRI}${c}${PDI}`);
  return RLM + l;
}
export function guideCard(s, L) {
  const ar = L === 'ar';
  return [`${s.e} <b>${s.t[L]}</b>`, s.s ? gLine(`<i>${s.s[L]}</i>`, ar) : null, '',
    ...s[L].map((l, i) => gLine(`${NUM[i] || '•'} ${l}`, ar)),
    ...(s.tip ? ['', gLine(`💡 <b>${ar ? 'نصيحة' : 'Tip'}:</b> ${s.tip[L]}`, ar)] : [])].filter(x => x != null).join('\n');
}
// the guide's index, by group (🚀 Start · 📅 Daily use · ✨ Extras · 👤 Account)
export function guideGroups() {
  const gs = GUIDE.groups || [{ k: null, e: '', t: { en: '', ar: '' } }];
  return gs.map(g => ({ ...g, items: GUIDE.sections.filter(s => !GUIDE.groups || s.g === g.k) })).filter(g => g.items.length);
}
// 📘 the guide changed (a new release): ONE short post in the channel naming the parts that changed (🆕 new / ✏️ updated),
// with the button to read them in the bot — run from the cron
const sig = s => { let h = 0; for (const ch of JSON.stringify([s.t, s.s, s.en, s.ar, s.tip])) h = (h * 31 + ch.charCodeAt(0)) | 0; return String(h); };
const guideSigs = () => Object.fromEntries(GUIDE.sections.map(s => [s.k, sig(s)]));
const POST_V = 2;   // the layout of the channel's guide post (2: the two titles on their own lines)
export async function guideUpdates(env) {
  const c = await getCommunity(env), x = c.channel; if (!x || !x.guideMsg) return { posted: 0 };
  if ((x.guidePostV || 1) !== POST_V) {   // the guide post's own layout changed → posted again once (the old one deleted), pinned
    const id = await postGuidePost(env, x); if (id) { x.guideMsg = id; x.guidePostV = POST_V; c.channel = x; await putCommunity(env, c); }
    return { posted: 'post' };
  }
  const now = guideSigs(), edition = (x.guideV || 1) !== (GUIDE.v || 1);
  if (!x.guideSig) { x.guideSig = now; x.guideV = GUIDE.v || 1; c.channel = x; await putCommunity(env, c); return { posted: 0 }; }
  const changed = GUIDE.sections.filter(s => x.guideSig[s.k] !== now[s.k]);
  if (!changed.length && !edition) return { posted: 0 };
  const lines = edition ? ['📘 <b>A new edition of the guide</b>', '📘 <b>نسخة جديدة من الدليل</b>']
    : ['🆕 <b>New in the guide</b>', '🆕 <b>جديد في الدليل</b>', '', ...changed.slice(0, 10).flatMap(s => { const mk = s.k in x.guideSig ? '✏️' : '🆕'; return [`${mk} ${s.e} ${esc(s.t.en)}`, `${mk} ${s.e} ${esc(s.t.ar)}`]; })];
  const link = await guideLink(env); if (link) lines.push('', link);
  const r = await tg(env, 'sendMessage', { chat_id: x.id, text: lines.join('\n'), parse_mode: 'HTML', disable_web_page_preview: true });
  if (!r.ok) return { posted: 0 };
  x.guideSig = now; x.guideV = GUIDE.v || 1; c.channel = x; await putCommunity(env, c);
  return { posted: edition ? 'all' : changed.length };
}

// ── a join request: members of the bot (and Samir) in, everyone else declined ──
export async function onJoinRequest(env, u) {
  const r = u.chat_join_request, c = await getCommunity(env);
  const ours = [c.channel, c.group].some(x => x && String(x.id) === String(r.chat.id)); if (!ours) return;
  const who = String(r.from.id), m = await members(env), ok = who === owner(env) || (m[who] && !m[who].paused);
  await tg(env, ok ? 'approveChatJoinRequest' : 'declineChatJoinRequest', { chat_id: r.chat.id, user_id: r.from.id });
  if (ok && who !== owner(env)) {
    const ar = m[who].lang === 'ar';
    await tg(env, 'sendMessage', { chat_id: who, text: ar ? `✅ تم قبولك في ${r.chat.title} — أهلاً بك 👋` : `✅ You're in ${r.chat.title} — welcome 👋` });
  }
}

// 🧹 /community revoke <links…> (Samir): old join links of the channel made by the bot are switched off — only the bot
// can revoke its own links (Telegram refuses the owner in its apps), and it has no way to list them, so they are given.
// The current join link (the one /community hands out) is never revoked.
export async function revokeLinks(env, text) {
  const c = await getCommunity(env), ch = c.channel;
  if (!ch || !ch.id) { await say(env, 'ℹ️ No channel is set up yet.'); return { done: 0 }; }
  const cur = String(ch.link || '').split('+').pop();
  const codes = [...new Set((String(text || '').match(/\+[A-Za-z0-9_-]{10,}/g) || []).map(s => s.slice(1)))].slice(0, 20);
  if (!codes.length) { await say(env, 'ℹ️ Send the old links after the command: <code>/community revoke https://t.me/+… https://t.me/+…</code>'); return { done: 0 }; }
  const lines = []; let done = 0;
  for (const code of codes) {
    const tail = '…' + esc(code.slice(-4));
    if (cur && code === cur) { lines.push(`⏭ ${tail} — the current join link, kept`); continue; }
    const r = await tg(env, 'revokeChatInviteLink', { chat_id: ch.id, invite_link: 'https://t.me/+' + code });
    if (r.ok) { done++; lines.push(`✅ ${tail} — switched off`); } else lines.push(`⚠️ ${tail} — ${esc(String(r.description || 'not revoked').slice(0, 80))}`);
  }
  await say(env, `🧹 <b>Old join links</b>\n${lines.join('\n')}`);
  return { done };
}

// ── /community (members): the channel's link — the comments under its posts are the members' place to talk ──
export async function communityView(env, lang) {
  const c = await getCommunity(env), ar = lang === 'ar', b = [];
  if (c.channel && c.channel.link) b.push([{ text: ar ? '📢 قناة Cute Portfolio' : '📢 The Cute Portfolio channel', url: c.channel.link }]);
  const has = b.length > 0;
  b.push([{ text: ar ? '⬅️ القائمة' : '⬅️ Menu', callback_data: 'menu' }]);
  const text = has
    ? (ar ? '👥 <b>مجتمع Cute Portfolio</b> — للأعضاء فقط\n\n📢 <b>القناة</b>: نبض السوق صباحاً ومساءً، وخريطة القطاعات (13:00)، والرافعة والحيتان (17:30)، والتحركات الكبيرة.\n💬 <b>النقاش</b>: علّق تحت أي منشور — التعليقات هي مكان المجتمع.\n💡 اقتراح أو 🐞 مشكلة؟ أرسل /feedback ثم رسالتك.\n\nاضغط وأرسل طلب الانضمام — يقبلك البوت فوراً.'
          : '👥 <b>The Cute Portfolio community</b> — members only\n\n📢 <b>The channel</b>: the market pulse morning and evening, the sector map (13:00), leverage &amp; whales (17:30) and big moves.\n💬 <b>Talk</b>: comment under any post — the comments are the community.\n💡 An idea or 🐞 a bug? Send /feedback and your message.\n\nTap, send the join request — the bot lets you in at once.')
    : (ar ? '👥 المجتمع قيد التجهيز — قريباً.' : '👥 The community is being set up — soon.');
  return { text, buttons: b };
}

// ── 📢 the market pulse (twice a day) and a big BTC move ──
function pulseText(m, now, kind) {
  const g = m.global || {}, d = g.dom || {}, btc = m.btc || {}, e = etfDay(m.etf);
  const seen = new Set(), top = [...(m.top || [])].filter(r => r.rank && r.rank <= 100 && r.ch24 != null && r.sym && !isStable(r.sym) && !seen.has(r.id) && seen.add(r.id));
  const up = [...top].sort((a, b) => b.ch24 - a.ch24).slice(0, 3), dn = [...top].sort((a, b) => a.ch24 - b.ch24).slice(0, 3);
  const head = kind === 'move' ? `🚨 <b>BTC ${btc.ch24 > 0 ? '+' : ''}${pct(btc.ch24, 1)} in 24h</b>\n🚨 <b>تحرك كبير للبيتكوين خلال 24 ساعة</b>` : `${kind === 'am' ? '☀️' : '🌙'} <b>Market pulse</b> · ${local(now, { day: 'numeric', month: 'short' })}\n${kind === 'am' ? '☀️' : '🌙'} <b>نبض السوق</b>`;
  const L = [head, '',
    `🪙 BTC <b>${usd(btc.price)}</b> ${dot(btc.ch24)} ${pct(btc.ch24, 2)}`,
    g.mcap ? `🌐 Market cap <b>$${(g.mcap / 1e12).toFixed(2)}T</b> ${dot(g.mcapCh24)} ${pct(g.mcapCh24, 2)}` : null,
    d.btc != null ? `👑 BTC dominance <b>${d.btc.toFixed(1)}%</b>${d.usdt != null ? ` · USDT ${d.usdt.toFixed(2)}%` : ''}` : null,
    m.fng ? `😨 Fear &amp; Greed <b>${m.fng.value}</b> — ${esc(m.fng.label || '')}` : null,
    m.alt && m.alt.value != null ? `🌀 Altcoin season <b>${m.alt.value}</b>` : null,
    e ? `🏦 ETF ${esc(e.label)}: BTC ${flow(e.btc)} · ETH ${flow(e.eth)}` : null,
    up.length ? '' : null, up.length ? `📈 ${up.map(r => `${esc(r.sym)} ${pct(r.ch24, 1)}`).join(' · ')}` : null,
    dn.length ? `📉 ${dn.map(r => `${esc(r.sym)} ${pct(r.ch24, 1)}`).join(' · ')}` : null,
    ...(kind === 'move' ? [] : otherMarkets(m, now)),
    '', `🧭 <a href="${APP}market.html">Market Hub</a>`,   // a link in the text, not a button: a button hides the post's comments
    '', `<i>${NOTE.en}</i>`, `<i>${NOTE.ar}</i>`].filter(x => x != null);   // two lines: the English and the Arabic never share one (their dots and dashes mixed)
  return L.join('\n');
}
// the pulse's two extra lines (not on a 🚨 BTC move): 🥇 gold · silver, and 🇺🇸 the US market (bStocks: best / worst)
function otherMarkets(m, now) {
  const out = [], met = m.metals || [], f = k => met.find(x => x.k === k);
  const mt = [['gold', 'Gold'], ['silver', 'Silver']].map(([k, n]) => { const x = f(k); return x && x.price > 0 ? `${n} <b>${usd(x.price)}</b> ${pct(x.ch24, 1)}` : null; }).filter(Boolean);
  if (mt.length) out.push(`🥇 ${mt.join(' · ')}`);
  const st = (m.stocks || []).filter(r => r.ch24 != null && r.price > 0);
  if (st.length) {
    const u = usMarket(now), b = [...st].sort((a, c) => c.ch24 - a.ch24)[0], w = [...st].sort((a, c) => a.ch24 - c.ch24)[0];
    out.push(`🇺🇸 US stocks ${US_STATE.en[u.state].replace(/^\S+ /, '')} · ${esc(b.sym)} ${pct(b.ch24, 1)} · ${esc(w.sym)} ${pct(w.ch24, 1)}`);
  }
  return out.length ? ['', ...out] : [];
}
// ── 🔥 13:00 the sector map: where the money moved in 24 h (CoinGecko's sectors ≥ $1B, with each one's leaders) ──
export function sectorText(m, now) {
  const all = (m.sectors || []).filter(x => x && x.mcap >= 1e9 && x.ch24 != null); if (all.length < 2) return null;
  const symOf = Object.fromEntries((m.top || []).filter(r => r && r.id && r.sym).map(r => [r.id, r.sym]));
  const row = x => { const lead = (x.top || []).map(id => symOf[id]).filter(Boolean).slice(0, 3); return `${x.ch24 > 0 ? '🚀' : '🔻'} <b>${esc(x.name)}</b> ${pct(x.ch24, 1)} · ${usd(x.mcap)}${lead.length ? ' · ' + esc(lead.join(', ')) : ''}`; };
  const up = [...all].sort((a, b) => b.ch24 - a.ch24).slice(0, 3).filter(x => x.ch24 > 0), dn = [...all].sort((a, b) => a.ch24 - b.ch24).slice(0, 3).filter(x => x.ch24 < 0);
  if (!up.length && !dn.length) return null;
  return [`🔥 <b>Sector map</b> · ${local(now, { day: 'numeric', month: 'short' })}`, '🔥 <b>خريطة القطاعات</b>', '',
    ...(up.length ? ['📈 <b>Strongest 24h</b>', '📈 <b>الأقوى خلال 24 ساعة</b>', ...up.map(row), ''] : []),
    ...(dn.length ? ['📉 <b>Weakest 24h</b>', '📉 <b>الأضعف خلال 24 ساعة</b>', ...dn.map(row), ''] : []),
    '<i>Where the money moved in the last 24 hours (sectors above $1B, with their leaders).</i>', '<i>أين تحركت السيولة خلال 24 ساعة (القطاعات فوق مليار دولار مع أبرز عملاتها).</i>',
    '', `<i>${NOTE.en}</i>`, `<i>${NOTE.ar}</i>`].join('\n');
}
// ── 🧲 17:30 leverage & whales: funding, open interest, the long share (everyone / the big accounts) for BTC · ETH · SOL,
// what the biggest winning traders on Hyperliquid hold, and the US market's state (it opens about then) ──
export async function leverageText(m, now) {
  const rows = [];
  for (const sym of ['BTC', 'ETH', 'SOL']) {
    resetBudget(); const d = await derivatives(sym).catch(() => null), x = d && d.summary; if (!x) continue;
    const p = [x.funding_8h_pct_avg != null ? `funding ${x.funding_8h_pct_avg > 0 ? '+' : x.funding_8h_pct_avg < 0 ? '−' : ''}${Math.abs(x.funding_8h_pct_avg)}%/8h` : null, x.open_interest_change_24h_pct != null ? `OI 24h ${pct(x.open_interest_change_24h_pct, 1)}` : null,
      x.long_accounts_pct != null ? `longs ${Math.round(x.long_accounts_pct)}%` : null, x.top_traders_long_pct != null ? `big accounts ${Math.round(x.top_traders_long_pct)}%` : null].filter(Boolean);
    if (p.length) rows.push(`<b>${sym}</b> · ${p.join(' · ')}`);
    if (sym === 'BTC' && x.liquidations_24h) rows.push(`💥 Liquidations 24h (OKX): longs ${usd(x.liquidations_24h.longs_usd)} · shorts ${usd(x.liquidations_24h.shorts_usd)}`);
  }
  const wl = whaleLines(m.whales, ['BTC', 'ETH', 'SOL'], false, now);
  if (!rows.length && !wl.length) return null;
  const u = usMarket(now);
  return [`🧲 <b>Leverage &amp; whales</b> · ${local(now, { day: 'numeric', month: 'short' })}`, '🧲 <b>الرافعة والحيتان</b>', '', ...rows,
    ...(wl.length ? ['', `🐋 <b>Whales</b> <i>(the ${m.whales.n} biggest winning traders on Hyperliquid)</i>`, `🐋 <b>الحيتان</b> <i>(أكبر ${m.whales.n} متداولاً رابحاً على المنصة)</i>`, ...wl] : []),
    '', `🇺🇸 US market: ${US_STATE.en[u.state].replace(/^\S+ /, '')}`,
    '', '<i>High positive funding and longs above 70% = crowded longs (a dip can cascade). Whales hedge, and lose too.</i>', '<i>تمويل موجب مرتفع ونسبة شراء فوق 70% = ازدحام في الشراء (أي هبوط قد يتسلسل). والحيتان يتحوّطون ويخسرون أيضاً.</i>',
    '', `<i>${NOTE.en}</i>`, `<i>${NOTE.ar}</i>`].join('\n');
}
export async function runChannel(env, now = Date.now()) {
  await guideUpdates(env).catch(() => {});   // 📘 a new release changed the guide → the changed parts in the guide topic
  const c = await getCommunity(env), ch = c.channel; if (!ch) return { job: null };
  const lp = localParts(now), today = lp.date, hm = lp.hour * 60 + (+lp.hm.slice(3) || 0), sent = c.sent || {};
  let kind = null;
  if (hm >= 9 * 60 && hm < 9 * 60 + 20 && sent.am !== today) kind = 'am';
  else if (hm >= 21 * 60 + 5 && hm < 21 * 60 + 25 && sent.pm !== today) kind = 'pm';
  else if (hm >= 13 * 60 && hm < 13 * 60 + 20 && sent.sec !== today) kind = 'sec';         // 🔥 the sector map
  else if (hm >= 17 * 60 + 30 && hm < 17 * 60 + 50 && sent.lev !== today) kind = 'lev';   // 🧲 leverage & whales
  const m = kind || sent.move !== today ? await loadMarket([], []).catch(() => null) : null;
  if (!kind && m && m.btc && Math.abs(m.btc.ch24 || 0) >= 5 && sent.move !== today) kind = 'move';
  if (!kind || !m) return { job: null };
  const text = kind === 'sec' ? sectorText(m, now) : kind === 'lev' ? await leverageText(m, now).catch(() => null) : pulseText(m, now, kind);
  if (!text) { sent[kind] = today; c.sent = sent; await putCommunity(env, c); return { job: 'channel:' + kind, ok: false, skipped: true }; }   // no data today: skipped, not retried all window
  const r = await tg(env, 'sendMessage', { chat_id: ch.id, text, parse_mode: 'HTML', disable_web_page_preview: true });   // (no buttons: they would hide the comments)
  if (r.ok) {
    if (kind === 'am' || kind === 'pm') { if (ch.pinned) await tg(env, 'unpinChatMessage', { chat_id: ch.id, message_id: ch.pinned }); await tg(env, 'pinChatMessage', { chat_id: ch.id, message_id: r.result.message_id, disable_notification: true }); ch.pinned = r.result.message_id; }
    sent[kind] = today; c.sent = sent; c.channel = ch; await putCommunity(env, c);
  }
  return { job: 'channel:' + kind, ok: !!r.ok };
}

// ── /announce <text> (Samir): to the channel ──
export async function announce(env, text) {
  const c = await getCommunity(env), out = [];
  const body = `🆕 <b>What's new</b>\n🆕 <b>الجديد</b>\n\n${esc(text)}`;
  if (c.channel) out.push((await tg(env, 'sendMessage', { chat_id: c.channel.id, text: body, parse_mode: 'HTML' })).ok ? '📢' : '⚠️📢');
  return out;
}
export const isCommunityChat = async (env, id) => { const c = await getCommunity(env); return [c.channel, c.group].some(x => x && String(x.id) === String(id)); };
