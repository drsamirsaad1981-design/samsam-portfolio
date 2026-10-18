// Firebase web settings for Samsam Portfolio.
//
// These values identify the Firebase project; they are NOT secrets and grant no access
// by themselves (Google designs them to be public). Your data is protected by Google
// sign-in plus the rules in firestore.rules, which only allow the account(s) below.

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCUvQh7cobgjGVVEYR8vcT76CGFDPsd5Vg',
  authDomain: 'samsam-portfolio.firebaseapp.com',
  projectId: 'samsam-portfolio',
  storageBucket: 'samsam-portfolio.firebasestorage.app',
  messagingSenderId: '683777710470',
  appId: '1:683777710470:web:bd0dc0a6b1d11a8389b407',
};

// Google accounts allowed to open the portfolio (must match firestore.rules).
export const ALLOWED_EMAILS = [
  'dr.samir.saad.1981@gmail.com',
];
