// Test double for Firebase Auth: a signed-in Google user stored per browser profile.
const KEY = '__fake_user';
const subs = new Set();
const cur = () => { try { const u = JSON.parse(localStorage.getItem(KEY)); if (u) u.getIdToken = async () => 'fake-id-token.' + u.uid; return u; } catch (_) { return null; } };
const fire = () => subs.forEach(cb => cb(cur()));
export function getAuth() { return {}; }
export class GoogleAuthProvider { setCustomParameters() {} }
export async function signInWithPopup() {
  localStorage.setItem(KEY, JSON.stringify({ uid: 'uid_samir', email: window.__FAKE_EMAIL || 'owner@example.com' })); fire();
}
export const signInWithRedirect = signInWithPopup;
export async function getRedirectResult() { return null; }
export function onAuthStateChanged(auth, cb) { subs.add(cb); setTimeout(() => cb(cur()), 10); return () => subs.delete(cb); }
export async function signOut() { localStorage.removeItem(KEY); fire(); }
