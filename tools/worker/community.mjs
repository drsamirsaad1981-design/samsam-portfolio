// tools/worker/community.mjs — 📢 the members' channel + 💬 their discussion group (Telegram forum with topics).
//
// Samir creates both in Telegram and adds the bot as an admin; the bot notices (my_chat_member), remembers them, makes
// join links that need approval, creates the group's topics (💬 Chat · 💡 Suggestions · 🐞 Bugs & notes · 📘 Guide ·
// 🛠 Updates), posts the guide there, and from then on:
//   • approves a join request only from a member of the bot (strangers are declined) — /community gives members the links
//   • posts a market pulse to the channel twice a day (09:00 and 21:05 Riyadh) and pins the latest; a "big move" post
//     when BTC moves ±5% in 24 h (once a day)
//   • /announce <text> (Samir): posted to the channel and the 🛠 Updates topic
// Channel readers can send ⭐ Star reactions to posts (Samir turns them on in the channel's settings).

import { members } from './who.mjs';
import { loadMarket } from './data.mjs';
import { localParts, local, esc, usd, pct, dot, isStable, etfDay, flow, APP } from '../alerts-core.mjs';
import GUIDE from '../../guide.json' with { type: 'json' };

const KEY = 'tg:community';
async function tg(env, method, body) {
  try { const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return await r.json(); }
  catch (_) { return { ok: false }; }
}
export async function getCommunity(env) { try { return JSON.parse((env.RATE && await env.RATE.get(KEY)) || '{}') || {}; } catch (_) { return {}; } }
async function putCommunity(env, c) { try { if (env.RATE) await env.RATE.put(KEY, JSON.stringify(c)); } catch (_) {} }
const owner = env => String(env.TELEGRAM_CHAT_ID);
const say = (env, text) => tg(env, 'sendMessage', { chat_id: owner(env), text, parse_mode: 'HTML', disable_web_page_preview: true });

const TOPICS = [
  ['chat', '💬 Chat · دردشة', 7322096], ['ideas', '💡 Suggestions · اقتراحات', 16766590], ['bugs', '🐞 Bugs & notes · ملاحظات', 16478047],
  ['guide', '📘 Guide · الدليل', 9367192], ['updates', '🛠 Updates · التحديثات', 13338331],
];
const NOTE = { en: 'Not financial advice — for information only.', ar: 'مش نصيحة مالية — للمعلومة بس.' };

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

// make the join link (requests approved by the bot), and for the group: topics + the guide
export async function setup(env, kind) {
  const c = await getCommunity(env), x = c[kind]; if (!x) return { ok: false };
  const notes = [];
  const link = await tg(env, 'createChatInviteLink', { chat_id: x.id, name: 'Cute Portfolio members', creates_join_request: true });
  if (link.ok) x.link = link.result.invite_link; else notes.push('⚠️ No join link — give me "Invite users via link".');
  if (kind === 'group') {
    const info = await tg(env, 'getChat', { chat_id: x.id });
    if (info.ok && info.result.is_forum) {
      x.topics = x.topics || {};
      for (const [k, name, color] of TOPICS) {
        if (x.topics[k]) continue;
        const r = await tg(env, 'createForumTopic', { chat_id: x.id, name, icon_color: color });
        if (r.ok) x.topics[k] = r.result.message_thread_id; else { notes.push('⚠️ Topics not made — give me "Manage topics".'); break; }
      }
      if (x.topics.guide && !x.guidePosted) { await postGuide(env, x); x.guidePosted = true; }
      if (x.topics.chat && !x.helloPosted) {
        await tg(env, 'sendMessage', { chat_id: x.id, message_thread_id: x.topics.chat, parse_mode: 'HTML', text: '👋 <b>Welcome to the Cute Portfolio community!</b>\nChat here · ideas in 💡 · problems in 🐞 · how-to in 📘 · news in 🛠.\n\n👋 <b>أهلاً بيكم في مجتمع Cute Portfolio!</b>\nالدردشة هنا · الأفكار في 💡 · المشاكل في 🐞 · الشرح في 📘 · الجديد في 🛠.' });
        x.helloPosted = true;
      }
    } else notes.push('⚠️ Turn on <b>Topics</b> in the group\'s settings, then send /community setup.');
  }
  c[kind] = x; await putCommunity(env, c);
  await say(env, `✅ <b>${esc(x.title)}</b> is set up (${kind === 'channel' ? '📢 channel' : '💬 group'}).` + (x.link ? `\nJoin link (members only — I approve each request): ${x.link}` : '') + (notes.length ? '\n' + notes.join('\n') : ''));
  return { ok: true };
}

// 📘 the guide in its topic: an index message (pinned) + one message per part, in both languages
async function postGuide(env, x) {
  const t = x.topics.guide, send = text => tg(env, 'sendMessage', { chat_id: x.id, message_thread_id: t, text, parse_mode: 'HTML', disable_web_page_preview: true });
  const idx = await send(`<b>${GUIDE.title.en}</b>\n${GUIDE.intro.en}\n\n<b>${GUIDE.title.ar}</b>\n${GUIDE.intro.ar}\n\n` + GUIDE.sections.map(s => `${s.e} ${esc((s.b || s.t).en)} · ${esc((s.b || s.t).ar)}`).join('\n'));
  if (idx.ok) await tg(env, 'pinChatMessage', { chat_id: x.id, message_id: idx.result.message_id, disable_notification: true });
  for (const s of GUIDE.sections) {
    await send(`${s.e} <b>${s.t.en}</b>\n` + s.en.map(l => (/^•\s/.test(l) ? '   ◦ ' + l.slice(2) : '• ' + l)).join('\n') + `\n\n${s.e} <b>${s.t.ar}</b>\n` + s.ar.map(l => (/^•\s/.test(l) ? '   ◦ ' + l.slice(2) : '• ' + l)).join('\n'));
  }
}

// ── a join request: members of the bot (and Samir) in, everyone else declined ──
export async function onJoinRequest(env, u) {
  const r = u.chat_join_request, c = await getCommunity(env);
  const ours = [c.channel, c.group].some(x => x && String(x.id) === String(r.chat.id)); if (!ours) return;
  const who = String(r.from.id), m = await members(env), ok = who === owner(env) || (m[who] && !m[who].paused);
  await tg(env, ok ? 'approveChatJoinRequest' : 'declineChatJoinRequest', { chat_id: r.chat.id, user_id: r.from.id });
  if (ok && who !== owner(env)) {
    const ar = m[who].lang === 'ar';
    await tg(env, 'sendMessage', { chat_id: who, text: ar ? `✅ اتقبلت في ${r.chat.title} — أهلاً بيك 👋` : `✅ You're in ${r.chat.title} — welcome 👋` });
  }
}

// ── /community (members): the two links ──
export async function communityView(env, lang) {
  const c = await getCommunity(env), ar = lang === 'ar', b = [];
  if (c.channel && c.channel.link) b.push([{ text: ar ? '📢 قناة الإشارات' : '📢 Signals channel', url: c.channel.link }]);
  if (c.group && c.group.link) b.push([{ text: ar ? '💬 جروب الأعضاء' : '💬 Members\' group', url: c.group.link }]);
  b.push([{ text: ar ? '⬅️ القائمة' : '⬅️ Menu', callback_data: 'menu' }]);
  const text = b.length > 1
    ? (ar ? '👥 <b>مجتمع Cute Portfolio</b> — للأعضاء بس\n\n📢 <b>القناة</b>: نبض السوق مرتين في اليوم والتحركات الكبيرة. تقدر تدّي ⭐ على البوست اللي يعجبك.\n💬 <b>الجروب</b>: دردشة · 💡 اقتراحات · 🐞 ملاحظات · 📘 الدليل · 🛠 التحديثات.\n\nاضغط وابعت طلب الانضمام — البوت بيقبلك على طول.'
          : '👥 <b>The Cute Portfolio community</b> — members only\n\n📢 <b>The channel</b>: the market pulse twice a day and big moves. You can give ⭐ to posts you like.\n💬 <b>The group</b>: chat · 💡 suggestions · 🐞 bugs & notes · 📘 guide · 🛠 updates.\n\nTap, send the join request — the bot lets you in at once.')
    : (ar ? '👥 المجتمع لسه بيتجهز — قريب.' : '👥 The community is being set up — soon.');
  return { text, buttons: b };
}

// ── 📢 the market pulse (twice a day) and a big BTC move ──
function pulseText(m, now, kind) {
  const g = m.global || {}, d = g.dom || {}, btc = m.btc || {}, e = etfDay(m.etf);
  const seen = new Set(), top = [...(m.top || [])].filter(r => r.rank && r.rank <= 100 && r.ch24 != null && r.sym && !isStable(r.sym) && !seen.has(r.id) && seen.add(r.id));
  const up = [...top].sort((a, b) => b.ch24 - a.ch24).slice(0, 3), dn = [...top].sort((a, b) => a.ch24 - b.ch24).slice(0, 3);
  const head = kind === 'move' ? `🚨 <b>BTC ${btc.ch24 > 0 ? '+' : ''}${pct(btc.ch24, 1)} in 24h</b>` : `${kind === 'am' ? '☀️' : '🌙'} <b>Market pulse · نبض السوق</b> · ${local(now, { day: 'numeric', month: 'short' })}`;
  const L = [head, '',
    `₿ BTC <b>${usd(btc.price)}</b> ${dot(btc.ch24)} ${pct(btc.ch24, 2)}`,
    g.mcap ? `🌐 Market cap <b>$${(g.mcap / 1e12).toFixed(2)}T</b> ${dot(g.mcapCh24)} ${pct(g.mcapCh24, 2)}` : null,
    d.btc != null ? `👑 BTC dominance <b>${d.btc.toFixed(1)}%</b>${d.usdt != null ? ` · USDT ${d.usdt.toFixed(2)}%` : ''}` : null,
    m.fng ? `😨 Fear &amp; Greed <b>${m.fng.value}</b> — ${esc(m.fng.label || '')}` : null,
    m.alt && m.alt.value != null ? `🌀 Altcoin season <b>${m.alt.value}</b>` : null,
    e ? `🏦 ETF ${esc(e.label)}: BTC ${flow(e.btc)} · ETH ${flow(e.eth)}` : null,
    up.length ? '' : null, up.length ? `📈 ${up.map(r => `${esc(r.sym)} ${pct(r.ch24, 1)}`).join(' · ')}` : null,
    dn.length ? `📉 ${dn.map(r => `${esc(r.sym)} ${pct(r.ch24, 1)}`).join(' · ')}` : null,
    '', `<i>${NOTE.en} · ${NOTE.ar}</i>`].filter(x => x != null);
  return L.join('\n');
}
export async function runChannel(env, now = Date.now()) {
  const c = await getCommunity(env), ch = c.channel; if (!ch) return { job: null };
  const lp = localParts(now), today = lp.date, hm = lp.hour * 60 + (+lp.hm.slice(3) || 0), sent = c.sent || {};
  let kind = null;
  if (hm >= 9 * 60 && hm < 9 * 60 + 20 && sent.am !== today) kind = 'am';
  else if (hm >= 21 * 60 + 5 && hm < 21 * 60 + 25 && sent.pm !== today) kind = 'pm';
  const m = kind || sent.move !== today ? await loadMarket([], []).catch(() => null) : null;
  if (!kind && m && m.btc && Math.abs(m.btc.ch24 || 0) >= 5 && sent.move !== today) kind = 'move';
  if (!kind || !m) return { job: null };
  const r = await tg(env, 'sendMessage', { chat_id: ch.id, text: pulseText(m, now, kind), parse_mode: 'HTML', disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: '🧭 Market Hub', url: APP + 'market.html' }]] } });
  if (r.ok) {
    if (kind !== 'move') { if (ch.pinned) await tg(env, 'unpinChatMessage', { chat_id: ch.id, message_id: ch.pinned }); await tg(env, 'pinChatMessage', { chat_id: ch.id, message_id: r.result.message_id, disable_notification: true }); ch.pinned = r.result.message_id; }
    sent[kind] = today; c.sent = sent; c.channel = ch; await putCommunity(env, c);
  }
  return { job: 'channel:' + kind, ok: !!r.ok };
}

// ── /announce <text> (Samir): to the channel and the 🛠 Updates topic ──
export async function announce(env, text) {
  const c = await getCommunity(env), out = [];
  const body = `🛠 <b>What's new · الجديد</b>\n\n${esc(text)}`;
  if (c.channel) out.push((await tg(env, 'sendMessage', { chat_id: c.channel.id, text: body, parse_mode: 'HTML' })).ok ? '📢' : '⚠️📢');
  if (c.group && c.group.topics && c.group.topics.updates) out.push((await tg(env, 'sendMessage', { chat_id: c.group.id, message_thread_id: c.group.topics.updates, text: body, parse_mode: 'HTML' })).ok ? '💬' : '⚠️💬');
  return out;
}
export const isCommunityChat = async (env, id) => { const c = await getCommunity(env); return [c.channel, c.group].some(x => x && String(x.id) === String(id)); };
