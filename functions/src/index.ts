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
  const profileCollection = role === 'qari' ? 'teachers' : 'parents';
  await db.collection(profileCollection).doc(user.uid).set({
    uid: user.uid,
    email,
    displayName,
    madrasaId: MADRASA_ID,
    status: 'active',
    joinedAt: FieldValue.serverTimestamp(),
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
  const oldAssignments = await db.collection('student_assignments').where('madrasaId', '==', MADRASA_ID).where('studentId', '==', studentId).where('status', '==', 'active').get();
  const batch = db.batch();
  oldAssignments.docs.forEach((old) => {
    if (old.id !== assignmentId) batch.update(old.ref, { status: 'inactive', unassignedBy: actorUid, unassignedAt: FieldValue.serverTimestamp() });
  });
  batch.set(db.collection('student_assignments').doc(assignmentId), {
    madrasaId: MADRASA_ID, studentId, qariUid, assignedBy: actorUid,
    assignedAt: FieldValue.serverTimestamp(), status: 'active',
  });
  await batch.commit();
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


export const createStudent = onCall({ region: REGION }, async (request) => {
  const actorUid = requireAdmin(request);
  const fullName = requiredString(request.data?.fullName, 'fullName', 120);
  const guardianName = requiredString(request.data?.guardianName, 'guardianName', 120);
  const program = request.data?.program;
  const admissionDate = requiredString(request.data?.admissionDate, 'admissionDate', 10);
  if (!['hifz', 'nazra', 'qaida'].includes(program)) {
    throw new HttpsError('invalid-argument', 'تعلیمی شعبہ منتخب کریں۔');
  }
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(admissionDate)) {
    throw new HttpsError('invalid-argument', 'داخلے کی تاریخ درست درج کریں۔');
  }
  const studentRef = db.collection('students').doc();
  const studentCode = `MRK58-${randomUUID().slice(0, 8).toUpperCase()}`;
  await db.runTransaction(async (tx) => {
    tx.create(studentRef, {
      madrasaId: MADRASA_ID,
      studentCode,
      fullName,
      program,
      status: 'active',
      admissionDate,
      assignedTeacherIds: [],
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actorUid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(db.collection('student_private').doc(studentRef.id), {
      madrasaId: MADRASA_ID,
      studentId: studentRef.id,
      guardianName,
      guardianPhone: typeof request.data?.guardianPhone === 'string' ? request.data.guardianPhone.trim().slice(0, 30) : '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  await writeAudit(actorUid, 'student.created', 'student', studentRef.id);
  return { studentId: studentRef.id, studentCode };
});

export const recordAttendance = onCall({ region: REGION }, async (request) => {
  const caller = request.auth;
  if (!caller || caller.token.madrasaId !== MADRASA_ID
    || !['admin', 'qari'].includes(String(caller.token.role))) {
    throw new HttpsError('permission-denied', 'حاضری درج کرنے کی اجازت نہیں۔');
  }
  const studentId = requiredString(request.data?.studentId, 'studentId', 128);
  const date = requiredString(request.data?.date, 'date', 10);
  const session = requiredString(request.data?.session ?? 'morning', 'session', 30);
  const status = request.data?.status;
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)
    || !['morning', 'afternoon', 'evening'].includes(session)
    || !['present', 'absent', 'late', 'leave'].includes(status)) {
    throw new HttpsError('invalid-argument', 'حاضری کی تاریخ، وقت یا حیثیت درست نہیں۔');
  }
  const studentSnap = await db.collection('students').doc(studentId).get();
  if (!studentSnap.exists || studentSnap.data()?.madrasaId !== MADRASA_ID
    || studentSnap.data()?.status !== 'active') {
    throw new HttpsError('not-found', 'فعال طالب علم کا ریکارڈ نہیں ملا۔');
  }
  if (caller.token.role === 'qari') {
    const assignment = await db.collection('student_assignments').doc(`${caller.uid}_${studentId}`).get();
    if (!assignment.exists || assignment.data()?.status !== 'active') {
      throw new HttpsError('permission-denied', 'یہ طالب علم آپ کے سپرد نہیں ہے۔');
    }
  }
  const recordId = `${studentId}_${date}_${session}`;
  const ref = db.collection('attendance').doc(recordId);
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      throw new HttpsError('already-exists', 'اس طالب علم کی اس تاریخ اور نشست کی حاضری پہلے درج ہو چکی ہے۔');
    }
    tx.create(ref, {
      madrasaId: MADRASA_ID,
      studentId,
      date,
      session,
      status,
      qariUid: caller.uid,
      createdBy: caller.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  await writeAudit(caller.uid, 'attendance.recorded', 'attendance', recordId);
  return { recordId, status };
});

export const recordDailyProgress = onCall({ region: REGION }, async (request) => {
  const caller = request.auth;
  if (!caller || caller.token.madrasaId !== MADRASA_ID
    || !['admin', 'qari'].includes(String(caller.token.role))) {
    throw new HttpsError('permission-denied', 'تعلیمی پیش رفت درج کرنے کی اجازت نہیں۔');
  }
  const studentId = requiredString(request.data?.studentId, 'studentId', 128);
  const date = requiredString(request.data?.date, 'date', 10);
  const session = requiredString(request.data?.session ?? 'morning', 'session', 30);
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) {
    throw new HttpsError('invalid-argument', 'تاریخ درست درج کریں۔');
  }
  const studentSnap = await db.collection('students').doc(studentId).get();
  if (!studentSnap.exists || studentSnap.data()?.madrasaId !== MADRASA_ID) {
    throw new HttpsError('not-found', 'طالب علم کا ریکارڈ نہیں ملا۔');
  }
  if (caller.token.role === 'qari') {
    const assignment = await db.collection('student_assignments').doc(`${caller.uid}_${studentId}`).get();
    if (!assignment.exists || assignment.data()?.status !== 'active') {
      throw new HttpsError('permission-denied', 'یہ طالب علم آپ کے سپرد نہیں ہے۔');
    }
  }
  const recordId = `${studentId}_${date}_${session}`;
  const ref = db.collection('progress_logs').doc(recordId);
  const progress = {
    madrasaId: MADRASA_ID,
    studentId,
    date,
    session,
    sabaq: typeof request.data?.sabaq === 'string' ? request.data.sabaq.trim().slice(0, 500) : '',
    sabqi: typeof request.data?.sabqi === 'string' ? request.data.sabqi.trim().slice(0, 500) : '',
    manzil: typeof request.data?.manzil === 'string' ? request.data.manzil.trim().slice(0, 500) : '',
    quality: ['excellent', 'good', 'needs_attention'].includes(request.data?.quality) ? request.data.quality : 'good',
    parentVisible: caller.token.role === 'admin' && request.data?.parentVisible === true,
    visibilityStatus: caller.token.role === 'admin' && request.data?.parentVisible === true ? 'approved' : 'pending',
    qariUid: caller.uid,
    createdBy: caller.uid,
    createdAt: FieldValue.serverTimestamp(),
  };
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      throw new HttpsError('already-exists', 'اس تاریخ اور نشست کی پیش رفت پہلے درج ہو چکی ہے۔');
    }
    tx.create(ref, progress);
  });
  await writeAudit(caller.uid, 'progress.recorded', 'progress_log', recordId);
  return { recordId };
});


export const updateStudent = onCall({ region: REGION }, async (request) => {
  const actorUid = requireAdmin(request);
  const studentId = requiredString(request.data?.studentId, 'studentId', 128);
  const ref = db.collection('students').doc(studentId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.madrasaId !== MADRASA_ID) {
    throw new HttpsError('not-found', 'طالب علم کا ریکارڈ نہیں ملا۔');
  }
  const patch: Record<string, unknown> = {};
  if (request.data?.fullName !== undefined) patch.fullName = requiredString(request.data.fullName, 'fullName', 120);
  if (request.data?.program !== undefined) {
    if (!['hifz', 'nazra', 'qaida'].includes(request.data.program)) throw new HttpsError('invalid-argument', 'تعلیمی شعبہ درست نہیں۔');
    patch.program = request.data.program;
  }
  if (request.data?.status !== undefined) {
    if (!['active', 'inactive', 'transferred', 'completed'].includes(request.data.status)) throw new HttpsError('invalid-argument', 'طالب علم کی حیثیت درست نہیں۔');
    patch.status = request.data.status;
  }
  if (request.data?.admissionDate !== undefined) {
    const date = requiredString(request.data.admissionDate, 'admissionDate', 10);
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) throw new HttpsError('invalid-argument', 'داخلے کی تاریخ درست نہیں۔');
    patch.admissionDate = date;
  }
  if (Object.keys(patch).length === 0) throw new HttpsError('invalid-argument', 'تبدیلی کے لیے کوئی درست فیلڈ نہیں دی گئی۔');
  await ref.update({ ...patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: actorUid });
  await writeAudit(actorUid, 'student.updated', 'student', studentId);
  return { studentId, updated: Object.keys(patch) };
});

export const correctAttendance = onCall({ region: REGION }, async (request) => {
  const actorUid = requireAdmin(request);
  const recordId = requiredString(request.data?.recordId, 'recordId', 256);
  const status = request.data?.status;
  const reason = requiredString(request.data?.reason, 'reason', 300);
  if (!['present', 'absent', 'late', 'leave'].includes(status)) {
    throw new HttpsError('invalid-argument', 'حاضری کی حیثیت درست نہیں۔');
  }
  const ref = db.collection('attendance').doc(recordId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.madrasaId !== MADRASA_ID) {
    throw new HttpsError('not-found', 'حاضری کا ریکارڈ نہیں ملا۔');
  }
  await ref.update({
    status,
    correctionReason: reason,
    correctedBy: actorUid,
    correctedAt: FieldValue.serverTimestamp(),
  });
  await writeAudit(actorUid, 'attendance.corrected', 'attendance', recordId);
  return { recordId, status };
});

export const setProgressParentVisibility = onCall({ region: REGION }, async (request) => {
  const actorUid = requireAdmin(request);
  const recordId = requiredString(request.data?.recordId, 'recordId', 256);
  const visible = request.data?.visible;
  if (typeof visible !== 'boolean') throw new HttpsError('invalid-argument', 'Visibility must be true or false.');
  const ref = db.collection('progress_logs').doc(recordId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.madrasaId !== MADRASA_ID) {
    throw new HttpsError('not-found', 'تعلیمی پیش رفت کا ریکارڈ نہیں ملا۔');
  }
  await ref.update({
    parentVisible: visible,
    visibilityStatus: visible ? 'approved' : 'rejected',
    visibilityApprovedBy: actorUid,
    visibilityApprovedAt: FieldValue.serverTimestamp(),
  });
  await writeAudit(actorUid, visible ? 'progress.shared_with_parent' : 'progress.hidden_from_parent', 'progress_log', recordId);
  return { recordId, parentVisible: visible };
});


export const recordCourseProgress = onCall({ region: REGION }, async (request) => {
  const caller = request.auth;
  if (!caller || caller.token.madrasaId !== MADRASA_ID
    || !['admin', 'qari'].includes(String(caller.token.role))) {
    throw new HttpsError('permission-denied', 'تعلیمی پیش رفت درج کرنے کی اجازت نہیں۔');
  }
  const studentId = requiredString(request.data?.studentId, 'studentId', 128);
  const program = request.data?.program;
  if (program !== 'hifz' && program !== 'nazra') {
    throw new HttpsError('invalid-argument', 'حفظ یا ناظرہ منتخب کریں۔');
  }
  const studentSnap = await db.collection('students').doc(studentId).get();
  if (!studentSnap.exists || studentSnap.data()?.madrasaId !== MADRASA_ID) {
    throw new HttpsError('not-found', 'طالب علم کا ریکارڈ نہیں ملا۔');
  }
  if (caller.token.role === 'qari') {
    const assignment = await db.collection('student_assignments').doc(`${caller.uid}_${studentId}`).get();
    if (!assignment.exists || assignment.data()?.status !== 'active') {
      throw new HttpsError('permission-denied', 'یہ طالب علم آپ کے سپرد نہیں ہے۔');
    }
  }
  const completedParas = Number(request.data?.completedParas ?? 0);
  const currentPara = Number(request.data?.currentPara ?? 1);
  if (!Number.isInteger(completedParas) || completedParas < 0 || completedParas > 30
    || !Number.isInteger(currentPara) || currentPara < 1 || currentPara > 30) {
    throw new HttpsError('invalid-argument', 'پاروں کی تعداد 0 سے 30 اور موجودہ پارہ 1 سے 30 کے درمیان درج کریں۔');
  }
  const summaryRef = db.collection(program === 'hifz' ? 'hifz_records' : 'nazra_records').doc(studentId);
  const historyRef = db.collection('course_progress_history').doc();
  const payload = {
    madrasaId: MADRASA_ID,
    studentId,
    program,
    completedParas,
    currentPara,
    notes: typeof request.data?.notes === 'string' ? request.data.notes.trim().slice(0, 500) : '',
    parentVisible: caller.token.role === 'admin' && request.data?.parentVisible === true,
    updatedBy: caller.uid,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await db.runTransaction(async (tx) => {
    tx.set(summaryRef, { ...payload, createdAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.create(historyRef, {
      ...payload,
      createdAt: FieldValue.serverTimestamp(),
      actorUid: caller.uid,
    });
  });
  await writeAudit(caller.uid, `${program}.progress.updated`, program, studentId);
  return { studentId, program, completedParas, currentPara };
});
