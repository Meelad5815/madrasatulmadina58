# MRK Madrasa Management System 58

A secure, Urdu-first digital management platform for one local Madrasa-tul-Madina.

## Product scope
- Public information website
- Admin portal
- Qari/teacher portal
- Verified parent portal

## Technology
- React 19, TypeScript, Vite
- Responsive custom CSS with Urdu RTL and English LTR support
- Firebase Authentication, Cloud Firestore and Firebase Storage
- Vercel serverless API with Firebase Admin SDK for privileged operations
- Node.js 22 for the Vercel application

## Implemented foundation
- Responsive Urdu public website with education programs, purpose, privacy section and contact placeholders.
- Firebase email/password sign-in and custom-claim role detection.
- Admin student admission form and student lifecycle status updates.
- Admin Qari/Parent account creation, one-time temporary password display, Qari assignment and verified parent-child linking.
- Qari portal for assigned students, attendance, daily sabaq/sabqi/manzil and Hifz/Nazra progress entry.
- Parent portal for verified linked children and parent-approved attendance/progress summaries.
- Admin review queue for Qari progress before it becomes visible to parents.
- Vercel API verifies Firebase ID tokens and validates privileged actions server-side.
- Firestore and Storage rules deny private access by default.
- Firestore indexes and Firebase Emulator security-rule tests are included.
- GitHub Actions workflow checks frontend build, Cloud Functions legacy package build and Firestore security rules tests.

## Privacy and safety
Student and parent records are private by default. Public pages only display content explicitly approved for public release. Parent-child links require administrator verification. Qaris may access only actively assigned students. Role claims are issued by a trusted server-side bootstrap process, never by a public registration form. Do not enter real student information until Firebase configuration and security-rule tests are complete.

## Local development
1. Use Node.js 22.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and fill in the Firebase Web App values.
4. Run `npm run dev`.
5. Run `npm run typecheck` and `npm run build`.

Do not commit Firebase service-account credentials. Do not put server secrets in variables prefixed with `VITE_`.

## Configure Firebase and Vercel
1. Create or select a Firebase project.
2. Enable Email/Password in Firebase Authentication.
3. Create Firestore and Firebase Storage in the same project.
4. Add the Firebase Web App configuration to Vercel Environment Variables:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
5. Create a Firebase service account and add these server-only variables to Vercel:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_SERVICE_ACCOUNT_JSON` — paste the full JSON directly into Vercel; never commit it or send it in chat.
   - `MRK_INITIAL_ADMIN_EMAIL` — an email address already registered in Firebase Authentication.
   - `MRK_ADMIN_BOOTSTRAP_SECRET` — a long, random one-time secret.
6. Deploy Firestore rules, indexes and Storage rules:
   ```bash
   firebase use YOUR_FIREBASE_PROJECT_ID
   firebase deploy --only firestore:rules,firestore:indexes,storage
   ```
7. Push to `main`. Vercel builds the public website and authenticated serverless API from this repository.

## One-time Admin bootstrap
After configuring the four server-only Vercel variables, call the bootstrap endpoint from a secure terminal:
```bash
curl -X POST "https://YOUR-VERCEL-DOMAIN/api/madrasa" \
  -H "Content-Type: application/json" \
  -H "x-mrk-bootstrap-secret: YOUR_ONE_TIME_SECRET" \
  -d '{"action":"bootstrapAdmin"}'
```
The configured Firebase Auth user receives the Admin custom claims. Immediately remove `MRK_ADMIN_BOOTSTRAP_SECRET` and `MRK_INITIAL_ADMIN_EMAIL` from Vercel Environment Variables and redeploy. The endpoint refuses to run again after successful initialization.

## Backend architecture
Firebase Authentication, Firestore and Storage hold identity, records and files. Vercel serverless API routes use Firebase Admin SDK for validated privileged operations, avoiding the Firebase Cloud Functions billing-plan prerequisite. The API verifies Firebase ID tokens and role claims on each protected request. The service-account JSON is only read by server-side code.

## Deployment
- GitHub repository: https://github.com/Meelad5815/madrasatulmadina58
- Vercel project: `mrk-madrasa-management-system-58`
- Public deployment domain: https://mrk-madrasa-management-system-58.vercel.app

## Remaining work before real production records
- Firebase Web App configuration and server-side service account have not yet been connected.
- Initial Admin bootstrap has not been run.
- The current UI covers core student, account, assignment, attendance and daily progress workflows; complete Hifz/Nazra examination history, certificates and QR verification, full report exports, activity/gallery moderation, construction management, password-change flow and complete profile editing still require implementation.
- Parent and Qari flows need end-to-end tests against a configured Firebase project.
- Run the GitHub Actions build and Firebase Emulator security-rule tests before entering real student information.
