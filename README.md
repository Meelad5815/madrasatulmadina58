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
