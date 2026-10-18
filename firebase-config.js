// Firebase web settings for Samsam Portfolio.
//
// These values identify the Firebase project; they are NOT secrets and grant no access
// by themselves (Google designs them to be public). Your data is protected by Google
// sign-in plus the rules in firestore.rules, which only allow the account(s) below.

export const FIREBASE_CONFIG = {
  apiKey: 'PASTE_FROM_FIREBASE_CONSOLE',
  authDomain: 'PASTE_FROM_FIREBASE_CONSOLE',
  projectId: 'PASTE_FROM_FIREBASE_CONSOLE',
  storageBucket: 'PASTE_FROM_FIREBASE_CONSOLE',
  messagingSenderId: 'PASTE_FROM_FIREBASE_CONSOLE',
  appId: 'PASTE_FROM_FIREBASE_CONSOLE',
};

// Google accounts allowed to open the portfolio (must match firestore.rules).
export const ALLOWED_EMAILS = [
  'PASTE_YOUR_GOOGLE_EMAIL',
];
