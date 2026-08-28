/* ============================================================
   DayNote — Firebase configuration
   ------------------------------------------------------------
   Fill this in with YOUR OWN Firebase project's values before
   deploying. You get these from:

   Firebase Console → your project → Project settings (gear icon)
   → scroll to "Your apps" → the web app you registered.

   These values are not secret — they identify which Firebase
   project to talk to, not a password. It's normal and expected
   for them to be visible in your deployed site's source code.
   Security instead comes from what you configure in the Firebase
   Console (which sign-in methods are enabled, which domains are
   authorized, and later, Firestore/Storage security rules).
   ============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyBARB0mb6GaXmVMmtAGOvWwHFSLj7_LXxo",
  authDomain: "daynote-a0860.firebaseapp.com",
  projectId: "daynote-a0860",
  storageBucket: "daynote-a0860.firebasestorage.app",
  messagingSenderId: "20258130416",
  appId: "1:20258130416:web:66eb42da8d1dd1eecb7535",
  measurementId: "G-B5WDB39PS0",
};

firebase.initializeApp(firebaseConfig);
