// Test double for Firebase Auth: a signed-in Google user stored per browser profile.
const KEY = '__fake_user';
const subs = new Set();
const cur = () => { try { const u = JSON.parse(localStorage.getItem(KEY)); if (u) u.getIdToken = async () => 'fake-id-token.' + u.uid; return u; } catch (_) { return null; } };
const fire = () => subs.forEach(cb => cb(cur()));
export function getAuth() { return { get currentUser() { return cur(); }, authStateReady: async () => {} }; }   // (a session kept on this device, as Firebase keeps it)
export class GoogleAuthProvider { setCustomParameters() {} }
export async function signInWithPopup() {
  localStorage.setItem(KEY, JSON.stringify({ uid: 'uid_samir', email: window.__FAKE_EMAIL || 'owner@example.com' })); fire();
}
export const signInWithRedirect = signInWithPopup;
export async function getRedirectResult() { return null; }
export function onAuthStateChanged(auth, cb) { subs.add(cb); setTimeout(() => cb(cur()), 10); return () => subs.delete(cb); }
export async function signOut() { localStorage.removeItem(KEY); fire(); }

// e-mail link sign-in (the app's "any e-mail" option) — never a link in the tests
export function isSignInWithEmailLink() { return false; }
export async function sendSignInLinkToEmail() {}
export async function signInWithEmailLink() { throw Object.assign(new Error('not in tests'), { code: 'auth/invalid-action-code' }); }
// 📱 inside Telegram: the Worker's custom token (tests: "fake-custom:<e-mail>") signs that account in
export async function signInWithCustomToken(auth, t) {
  const email = String(t || '').split(':')[1] || 'owner@example.com';
  localStorage.setItem(KEY, JSON.stringify({ uid: email === 'owner@example.com' ? 'uid_samir' : 'uid_tg', email })); fire();
}
// 🗑 Delete my account: the sign-in itself goes (tests can refuse it like Firebase does after an old sign-in: window.__FAKE_OLD_LOGIN)
export async function deleteUser() { if (window.__FAKE_OLD_LOGIN) throw Object.assign(new Error('recent login needed'), { code: 'auth/requires-recent-login' }); window.__fakeUserDeleted = true; localStorage.removeItem(KEY); fire(); }
