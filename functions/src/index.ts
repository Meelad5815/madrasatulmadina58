import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();
const auth = getAuth();
const db = getFirestore();
const REGION = 'asia-south1';
const MADRASA_ID = 'mrk-madrasa-58';

function requireAdmin(request: { auth?: { uid: string; token: Record<string, unknown> } }) {
  if (!request.auth || request.auth.token.role !== 'admin' || request.auth.token.madrasaId !== MADRASA_ID) {
    throw new HttpsError('permission-denied', 'صرف مجاز مدرسہ منتظم یہ کارروائی کر سکتا ہے۔');
  }
  return request.auth.uid;
}

function requiredString(value: unknown, field: string, max = 160): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > max) {
    throw new HttpsError('invalid-argument', `غلط یا نامکمل فیلڈ: ${field}`);
  }
  return value.trim();
}

async function writeAudit(actorUid: string, action: string, recordType: string, recordId: string) {
  await db.collection('audit_logs').add({
    madrasaId: MADRASA_ID,
    actorUid,
    action,
    recordType,
    recordId,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export const createManagedAccount = onCall({ region: REGION }, async (request) => {
  const actorUid = requireAdmin(request);
  const email = requiredString(request.data?.email, 'email', 254).toLowerCase();
  const displayName = requiredString(request.data?.displayName, 'displayName', 100);
  const role = request.data?.role;
  if (role !== 'qari' && role !== 'parent') {
    throw new HttpsError('invalid-argument', 'اس کارروائی سے صرف قاری یا والدین کا اکاؤنٹ بنایا جا سکتا ہے۔');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'درست ای میل ایڈریس درج کریں۔');
  }

  const temporaryPassword = randomUUID() + 'Aa9!';
  let user;
  try {
    user = await auth.createUser({ email, displayName, password: temporaryPassword, disabled: false });
  } catch (error) {
    throw new HttpsError('already-exists', 'یہ ای میل پہلے سے رجسٹرڈ ہو سکتی ہے۔', String(error));
  }

  await auth.setCustomUserClaims(user.uid, { role, madrasaId: MADRASA_ID });
  await db.collection('users').doc(user.uid).set({
    uid: user.uid,
    email,
    displayName,
    role,
    madrasaId: MADRASA_ID,
    status: 'active',
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actorUid,
  });
  await writeAudit(actorUid, 'account.created', 'user', user.uid);
  return { uid: user.uid, email, displayName, role, temporaryPassword };
});

export const assignStudentToQari = onCall({ region: REGION }, async (request) => {
  const actorUid = requireAdmin(request);
  const studentId = requiredString(request.data?.studentId, 'studentId', 128);
  const qariUid = requiredString(request.data?.qariUid, 'qariUid', 128);
  const studentRef = db.collection('students').doc(studentId);
  const qariRef = db.collection('users').doc(qariUid);
  const [studentSnap, qariSnap] = await Promise.all([studentRef.get(), qariRef.get()]);
  if (!studentSnap.exists || studentSnap.data()?.madrasaId !== MADRASA_ID) {
    throw new HttpsError('not-found', 'طالب علم کا ریکارڈ نہیں ملا۔');
  }
  if (!qariSnap.exists || qariSnap.data()?.role !== 'qari' || qariSnap.data()?.madrasaId !== MADRASA_ID) {
    throw new HttpsError('failed-precondition', 'منتخب قاری کا فعال اکاؤنٹ موجود نہیں۔');
  }
  const assignmentId = `${qariUid}_${studentId}`;
  await db.collection('student_assignments').doc(assignmentId).set({
    madrasaId: MADRASA_ID,
    studentId,
    qariUid,
    assignedBy: actorUid,
    assignedAt: FieldValue.serverTimestamp(),
    status: 'active',
  });
  await writeAudit(actorUid, 'student.assigned', 'student_assignment', assignmentId);
  return { assignmentId, studentId, qariUid };
});

export const verifyParentChildLink = onCall({ region: REGION }, async (request) => {
  const actorUid = requireAdmin(request);
  const parentUid = requiredString(request.data?.parentUid, 'parentUid', 128);
  const studentId = requiredString(request.data?.studentId, 'studentId', 128);
  const [parentSnap, studentSnap] = await Promise.all([
    db.collection('users').doc(parentUid).get(),
    db.collection('students').doc(studentId).get(),
  ]);
  if (!parentSnap.exists || parentSnap.data()?.role !== 'parent' || parentSnap.data()?.madrasaId !== MADRASA_ID) {
    throw new HttpsError('failed-precondition', 'والدین کا تصدیق شدہ اکاؤنٹ درکار ہے۔');
  }
  if (!studentSnap.exists || studentSnap.data()?.madrasaId !== MADRASA_ID) {
    throw new HttpsError('not-found', 'طالب علم کا ریکارڈ نہیں ملا۔');
  }
  const linkId = `${parentUid}_${studentId}`;
  await db.collection('student_parent_links').doc(linkId).set({
    madrasaId: MADRASA_ID,
    parentUid,
    studentId,
    verified: true,
    verifiedBy: actorUid,
    verifiedAt: FieldValue.serverTimestamp(),
  });
  await writeAudit(actorUid, 'parent_child.verified', 'student_parent_link', linkId);
  return { linkId, verified: true };
});
