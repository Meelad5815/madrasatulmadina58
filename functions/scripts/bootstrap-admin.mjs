import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const email = process.env.ADMIN_EMAIL;
const madrasaId = 'mrk-madrasa-58';
if (!projectId || !email) {
  throw new Error('Set FIREBASE_PROJECT_ID and ADMIN_EMAIL before running this one-time bootstrap.');
}
initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
const db = getFirestore();
const user = await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid, { role: 'admin', madrasaId });
await db.collection('users').doc(user.uid).set({
  uid: user.uid,
  email: user.email,
  displayName: user.displayName ?? 'Madrasa Administrator',
  role: 'admin',
  madrasaId,
  status: 'active',
  bootstrappedAt: FieldValue.serverTimestamp(),
}, { merge: true });
console.log(`Admin role bootstrapped for ${email} (${user.uid}). Sign out and sign in again to refresh the ID token.`);
