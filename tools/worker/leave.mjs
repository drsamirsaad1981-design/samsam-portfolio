// tools/worker/leave.mjs — 🗑 /leave: a member deletes their own account from the app (Settings → Delete my account).
//
// The app first deletes every document of the portfolio itself (it is the member's own data, and the rules let only them
// do it), then calls this with its sign-in: the bot forgets everything it keeps for that person — the member record (not
// kept for "restore": this is their own wish, so it is final), the chat's alerts / memory / settings / Claude key, the
// read-only exchange keys, the portfolio cache — and their e-mail leaves the app's access list, and the sign-in itself is deleted
// (deleteSignIn), so nothing of the account is left. Coming back needs a new invitation. The owner is told (name only matters to him); the owner's own
// account can never be deleted here. The log of Stars payments (tg:stars:log — a financial record) stays, as the privacy page says.
import { members, accessEmails, forgetChat, isTgChat, removeMember } from './who.mjs';
import { syncAccess, forgetPortfolio, deleteSignIn } from './data.mjs';

const kdel = async (env, k) => { try { if (env.RATE) await env.RATE.delete(k); } catch (_) {} };
const tg = async (env, body) => { try { await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); } catch (_) {} };
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function leaveHandler(env, who, body) {
  if (!who || !who.uid || !who.email) return { status: 400, error: 'Bad request.' };
  if ((who.owners || []).includes(who.email)) return { status: 403, error: 'The owner account cannot be deleted from the app.' };
  if (!body || body.confirm !== 'DELETE') return { status: 400, error: 'Not confirmed.' };
  const m = await members(env), hit = Object.entries(m).find(([, x]) => x && (x.uid === who.uid || (x.email && x.email === who.email)));
  let name = who.email, chat = null, lang = 'en';
  if (hit) {
    chat = hit[0]; name = hit[1].name || who.email; lang = hit[1].lang === 'ar' ? 'ar' : 'en';
    if (isTgChat(chat)) { try { const l = env.RATE && await env.RATE.get(`tg:${chat}:lang`); if (l === 'ar' || l === 'en') lang = l; } catch (_) {} await forgetChat(env, chat); }
    if (!(await removeMember(env, chat))) return { status: 500, error: 'Could not remove the membership — try again.' };
    await kdel(env, 'tg:removed:' + chat);   // removeMember keeps the record 60 days for "restore" — not here: their own wish is final
    await syncAccess(env, await accessEmails(env)).catch(() => {});
  }
  await kdel(env, `cex:${who.uid}`); await kdel(env, `cex:${who.uid}:bal`); await forgetPortfolio(env, who.uid);
  if (chat && isTgChat(chat)) await tg(env, { chat_id: chat, text: lang === 'ar' ? '🗑 حُذف حسابك وكل بياناتك بطلبك. شكراً لأنك جرّبت Cute Portfolio — وللعودة يوماً ما تحتاج دعوة جديدة.' : '🗑 Your account and all your data were deleted, as you asked. Thank you for trying Cute Portfolio — coming back one day needs a new invitation.' });
  if (env.TELEGRAM_CHAT_ID) {
    let ol = null; try { ol = env.RATE && await env.RATE.get(`tg:${env.TELEGRAM_CHAT_ID}:lang`); } catch (_) {}
    await tg(env, { chat_id: env.TELEGRAM_CHAT_ID, parse_mode: 'HTML', text: ol === 'ar' ? `🗑 <b>عضو حذف حسابه بنفسه</b>\n${esc(name)}${hit ? '' : ' (لم يكن في قائمة الأعضاء)'}\nحُذفت بياناته من التطبيق والبوت، وخرج بريده من قائمة الدخول.` : `🗑 <b>A member deleted their own account</b>\n${esc(name)}${hit ? '' : ' (was not in the members list)'}\nTheir data is gone from the app and the bot, and their e-mail left the access list.` });
  }
  const signin = await deleteSignIn(env, who.uid).catch(() => false);   // the sign-in itself (the app then only signs out)
  return { ok: true, member: !!hit, signin };
}
