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

## Configure Firebase (required before live use)
1. Create or select the Firebase project that will own this Madrasa system.
2. Enable Email/Password under Firebase Authentication.
3. Create Firestore and Firebase Storage in the same project.
4. Copy `.env.example` to `.env.local` and fill in the Firebase Web App configuration.
5. Install Firebase CLI and authenticate with an authorized project administrator.
6. Deploy the rules, indexes, functions and hosting configuration:
   ```bash
   firebase use YOUR_FIREBASE_PROJECT_ID
   firebase deploy --only firestore:rules,firestore:indexes,storage,functions
   npm install
   npm run build
   firebase deploy --only hosting
   ```

## One-time initial Admin bootstrap
A first Admin cannot be created from the public website. Use a trusted machine with a Firebase service account or Application Default Credentials. Do not commit the credential file.
```bash
cd functions
npm install
export GOOGLE_APPLICATION_CREDENTIALS="/secure/path/service-account.json"
export FIREBASE_PROJECT_ID="YOUR_FIREBASE_PROJECT_ID"
export ADMIN_EMAIL="the-admin-email@example.com"
npm run bootstrap:admin
```
After bootstrapping, the Admin must sign out and sign in again so the ID token receives the new custom claims. The system's fixed tenant claim is `mrk-madrasa-58`.

## Important limitations before production
- Firebase project credentials and the first Admin identity have not been supplied or connected, so live authentication, data storage, rules deployment, Cloud Functions deployment, and Hosting deployment have not been verified.
- Parent account creation and verified child linking are implemented server-side; the complete Admin user-management interface is still in progress.
- Hifz/Nazra history, examination reports, certificate uploads/downloads, activity moderation, construction updates, and parent progress-history screens still need their full user interfaces and end-to-end tests.
- Run the GitHub Actions build and Firebase Emulator security tests before entering real student information.
