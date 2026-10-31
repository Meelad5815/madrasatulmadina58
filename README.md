# MRK Madrasa Management System 58

A secure, Urdu-first management platform for one local Madrasa-tul-Madina.

## Product scope
- Public information website
- Admin management portal
- Qari/teacher portal
- Verified parent portal

## Technology
React, TypeScript, Vite, Tailwind CSS, Firebase Authentication, Cloud Firestore, Firebase Storage, and Cloud Functions when required.

## Privacy and safety
Student and parent records are private by default. Public pages must only display content explicitly approved for public release. Parent-child links require administrator verification. Qaris may access only assigned students. Privileged roles must be granted through a trusted administrative process, never by client-side form input.

## Setup
1. Install Node.js 20 or later.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and fill in Firebase web configuration.
4. Run `npm run dev`.
5. Run `npm run build` before deployment.

Do not add Firebase service-account keys to frontend environment variables or commit secrets.

## Firebase deployment
Review `firestore.rules`, `storage.rules`, and `firestore.indexes.json` before deploying. The initial admin must be bootstrapped through a trusted process. Never enable public writes or broad public reads of student records.

## Status
Initial secure application foundation. Firebase project credentials, initial admin identity, and production hosting still require owner-side configuration.


## Current implementation
- Urdu-first RTL public landing website and responsive navigation.
- Firebase email/password sign-in with custom-claim role checks.
- Role-scoped portal shell for Admin, Qari, and Parents.
- Admin student admission form backed by a callable Cloud Function.
- Qari student list, attendance recording, and daily progress recording through validated callable functions.
- Parent portal reads only verified linked student profiles.
- Trusted Cloud Functions for creating Qari/Parent accounts, assigning a student to a Qari, verifying parent-child links, recording attendance/progress, correcting attendance, and approving parent-visible progress.
- Firestore and Storage rules deny private access by default. Sensitive writes are routed through server-side functions where implemented.
- GitHub Actions build workflow for the frontend and Cloud Functions.

## Configure Firebase and Vercel (required before live use)
1. Create or select a Firebase project.
2. Enable Email/Password under Firebase Authentication.
3. Create Firestore and Firebase Storage in the same project.
4. Add the Firebase Web App configuration to Vercel Project Environment Variables:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
5. Create a Firebase service account and add these server-only variables to Vercel:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_SERVICE_ACCOUNT_JSON` (paste the complete JSON directly into Vercel; never commit it or send it in chat)
   - `MRK_INITIAL_ADMIN_EMAIL` (the email of a user already created in Firebase Authentication)
   - `MRK_ADMIN_BOOTSTRAP_SECRET` (a long random one-time secret)
6. Deploy Firestore rules and indexes:
   ```bash
   firebase use YOUR_FIREBASE_PROJECT_ID
   firebase deploy --only firestore:rules,firestore:indexes,storage
   ```
7. Push to `main`; Vercel builds the public site and the authenticated serverless API from the same repository.

## One-time initial Admin bootstrap
After setting the four server-side Vercel variables above and deploying, call the one-time endpoint from a secure terminal:
```bash
curl -X POST "https://YOUR-VERCEL-DOMAIN/api/madrasa" \
  -H "Content-Type: application/json" \
  -H "x-mrk-bootstrap-secret: YOUR_ONE_TIME_SECRET" \
  -d '{"action":"bootstrapAdmin"}'
```
The configured Firebase Auth user receives the Admin custom claims. Immediately remove `MRK_ADMIN_BOOTSTRAP_SECRET` and `MRK_INITIAL_ADMIN_EMAIL` from Vercel Environment Variables and redeploy. The bootstrap endpoint refuses to run again after successful initialization.

## Backend architecture
- Firebase Authentication, Firestore and Storage hold the identity, records and files.
- Vercel serverless API routes use Firebase Admin SDK for privileged, validated operations. This avoids requiring Firebase Cloud Functions deployment and its billing-plan prerequisite.
- The API verifies Firebase ID tokens and role claims on every protected request.
- Firestore and Storage rules remain default-deny for private records. The API service account is stored only in Vercel server-side environment variables.

## Important limitations before production
- Firebase project credentials and the first Admin identity have not been supplied or connected, so live authentication, data storage, rules deployment, Cloud Functions deployment, and Hosting deployment have not been verified.
- Parent account creation and verified child linking are implemented server-side; the complete Admin user-management interface is still in progress.
- Hifz/Nazra history, examination reports, certificate uploads/downloads, activity moderation, construction updates, and parent progress-history screens still need their full user interfaces and end-to-end tests.
- Run the GitHub Actions build and Firebase Emulator security tests before entering real student information.
