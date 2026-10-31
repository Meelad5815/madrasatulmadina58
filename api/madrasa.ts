import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID } from 'node:crypto'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore'

const MADRASA_ID = 'mrk-madrasa-58'

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function services() {
  const existing = getApps()[0]
  if (existing) return { auth: getAuth(existing), db: getFirestore(existing) }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  const projectId = process.env.FIREBASE_PROJECT_ID
  if (!raw || !projectId) throw new ApiError(503, 'Firebase server configuration is missing.')
  let serviceAccount: Record<string, unknown>
  try { serviceAccount = JSON.parse(raw) as Record<string, unknown> }
  catch { throw new ApiError(503, 'Firebase service account JSON is invalid.') }
  const app = initializeApp({ credential: cert(serviceAccount as never), projectId })
  return { auth: getAuth(app), db: getFirestore(app) }
}

function requiredString(value: unknown, field: string, max = 160): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > max) {
    throw new ApiError(400, `غلط یا نامکمل فیلڈ: ${field}`)
  }
  return value.trim()
}

function validateDate(value: unknown, field: string): string {
  const date = requiredString(value, field, 10)
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) throw new ApiError(400, 'تاریخ YYYY-MM-DD فارمیٹ میں درج کریں۔')
  return date
}

async function audit(db: Firestore, actorUid: string, action: string, recordType: string, recordId: string) {
  await db.collection('audit_logs').add({
    madrasaId: MADRASA_ID,
    actorUid,
    action,
    recordType,
    recordId,
    createdAt: FieldValue.serverTimestamp(),
  })
}

function requireAdmin(user: { uid: string; role: unknown; madrasaId: unknown }) {
  if (user.role !== 'admin' || user.madrasaId !== MADRASA_ID) throw new ApiError(403, 'صرف مجاز مدرسہ منتظم یہ کارروائی کر سکتا ہے۔')
}

function requireStaff(user: { uid: string; role: unknown; madrasaId: unknown }) {
  if (!['admin', 'qari'].includes(String(user.role)) || user.madrasaId !== MADRASA_ID) {
    throw new ApiError(403, 'اس کارروائی کی اجازت نہیں ہے۔')
  }
}

async function ensureStudent(db: FirebaseFirestore.Firestore, studentId: string, activeOnly = false) {
  const snap = await db.collection('students').doc(studentId).get()
  if (!snap.exists || snap.data()?.madrasaId !== MADRASA_ID) throw new ApiError(404, 'طالب علم کا ریکارڈ نہیں ملا۔')
  if (activeOnly && snap.data()?.status !== 'active') throw new ApiError(409, 'طالب علم فعال نہیں ہے۔')
  return snap
}

async function ensureQariAssignment(db: FirebaseFirestore.Firestore, qariUid: string, studentId: string) {
  const snap = await db.collection('student_assignments').doc(`${qariUid}_${studentId}`).get()
  if (!snap.exists || snap.data()?.status !== 'active' || snap.data()?.madrasaId !== MADRASA_ID) {
    throw new ApiError(403, 'یہ طالب علم آپ کے سپرد نہیں ہے۔')
  }
}

async function bootstrapAdmin(req: VercelRequest, db: FirebaseFirestore.Firestore, adminAuth: ReturnType<typeof getAuth>) {
  const expected = process.env.MRK_ADMIN_BOOTSTRAP_SECRET
  const email = process.env.MRK_INITIAL_ADMIN_EMAIL
  const supplied = req.headers['x-mrk-bootstrap-secret']
  if (!expected || typeof supplied !== 'string' || supplied !== expected) throw new ApiError(403, 'Bootstrap authorization failed.')
  if (!email) throw new ApiError(503, 'Initial Admin email is not configured.')
  const marker = db.collection('system').doc('admin-bootstrap')
  const existing = await marker.get()
  if (existing.exists && existing.data()?.status === 'completed') throw new ApiError(409, 'Initial Admin has already been bootstrapped.')
  const user = await adminAuth.getUserByEmail(email)
  await marker.set({ status: 'in_progress', uid: user.uid, startedAt: FieldValue.serverTimestamp() }, { merge: true })
  try {
    await adminAuth.setCustomUserClaims(user.uid, { role: 'admin', madrasaId: MADRASA_ID })
    await db.collection('users').doc(user.uid).set({
      uid: user.uid,
      email,
      displayName: user.displayName ?? 'Madrasa Administrator',
      role: 'admin',
      madrasaId: MADRASA_ID,
      status: 'active',
      bootstrappedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    await marker.set({ status: 'completed', completedAt: FieldValue.serverTimestamp() }, { merge: true })
    return { uid: user.uid, email, bootstrapped: true }
  } catch (error) {
    await marker.set({ status: 'failed', failedAt: FieldValue.serverTimestamp() }, { merge: true })
    throw error
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { auth: adminAuth, db } = services()
    const body = (req.body ?? {}) as Record<string, unknown>
    const action = requiredString(body.action, 'action', 80)
    if (action === 'bootstrapAdmin') {
      const result = await bootstrapAdmin(req, db, adminAuth)
      return res.status(200).json({ data: result })
    }

    const authHeader = req.headers.authorization
    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) throw new ApiError(401, 'لاگ اِن درکار ہے۔')
    let caller
    try { caller = await adminAuth.verifyIdToken(authHeader.slice(7)) }
    catch { throw new ApiError(401, 'لاگ اِن سیشن درست نہیں۔ دوبارہ لاگ اِن کریں۔') }
    const user = { uid: caller.uid, role: caller.role, madrasaId: caller.madrasaId }
    const input = (body.input ?? {}) as Record<string, unknown>

    switch (action) {
      case 'createStudent': {
        requireAdmin(user)
        const fullName = requiredString(input.fullName, 'fullName', 120)
        const guardianName = requiredString(input.guardianName, 'guardianName', 120)
        const program = input.program
        if (!['hifz', 'nazra', 'qaida'].includes(String(program))) throw new ApiError(400, 'تعلیمی شعبہ منتخب کریں۔')
        const admissionDate = validateDate(input.admissionDate, 'admissionDate')
        const studentRef = db.collection('students').doc()
        const studentCode = `MRK58-${randomUUID().slice(0, 8).toUpperCase()}`
        const batch = db.batch()
        batch.create(studentRef, {
          madrasaId: MADRASA_ID, studentCode, fullName, program, status: 'active', admissionDate,
          assignedTeacherIds: [], createdAt: FieldValue.serverTimestamp(), createdBy: user.uid,
          updatedAt: FieldValue.serverTimestamp(),
        })
        batch.create(db.collection('student_private').doc(studentRef.id), {
          madrasaId: MADRASA_ID, studentId: studentRef.id, guardianName,
          guardianPhone: typeof input.guardianPhone === 'string' ? input.guardianPhone.trim().slice(0, 30) : '',
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        })
        await batch.commit()
        await audit(db, user.uid, 'student.created', 'student', studentRef.id)
        return res.status(200).json({ data: { studentId: studentRef.id, studentCode } })
      }

      case 'updateStudent': {
        requireAdmin(user)
        const studentId = requiredString(input.studentId, 'studentId', 128)
        const ref = db.collection('students').doc(studentId)
        const snap = await ensureStudent(db, studentId)
        const patch: Record<string, unknown> = {}
        if (input.fullName !== undefined) patch.fullName = requiredString(input.fullName, 'fullName', 120)
        if (input.program !== undefined) {
          if (!['hifz', 'nazra', 'qaida'].includes(String(input.program))) throw new ApiError(400, 'تعلیمی شعبہ درست نہیں۔')
          patch.program = input.program
        }
        if (input.status !== undefined) {
          if (!['active', 'inactive', 'transferred', 'completed'].includes(String(input.status))) throw new ApiError(400, 'طالب علم کی حیثیت درست نہیں۔')
          patch.status = input.status
        }
        if (input.admissionDate !== undefined) patch.admissionDate = validateDate(input.admissionDate, 'admissionDate')
        if (!Object.keys(patch).length) throw new ApiError(400, 'تبدیلی کے لیے کوئی درست فیلڈ نہیں دی گئی۔')
        await ref.update({ ...patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid })
        await audit(db, user.uid, 'student.updated', 'student', studentId)
        return res.status(200).json({ data: { studentId, updated: Object.keys(patch), previousStatus: snap.data()?.status } })
      }

      case 'createManagedAccount': {
        requireAdmin(user)
        const email = requiredString(input.email, 'email', 254).toLowerCase()
        const displayName = requiredString(input.displayName, 'displayName', 100)
        const role = input.role
        if (role !== 'qari' && role !== 'parent') throw new ApiError(400, 'صرف قاری یا والدین کا اکاؤنٹ بنایا جا سکتا ہے۔')
        if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) throw new ApiError(400, 'درست ای میل ایڈریس درج کریں۔')
        const temporaryPassword = randomUUID() + 'Aa9!'
        let created
        try { created = await adminAuth.createUser({ email, displayName, password: temporaryPassword, disabled: false }) }
        catch { throw new ApiError(409, 'یہ ای میل پہلے سے رجسٹرڈ ہو سکتی ہے۔') }
        await adminAuth.setCustomUserClaims(created.uid, { role, madrasaId: MADRASA_ID })
        await db.collection('users').doc(created.uid).set({
          uid: created.uid, email, displayName, role, madrasaId: MADRASA_ID,
          status: 'active', createdAt: FieldValue.serverTimestamp(), createdBy: user.uid,
        })
        await db.collection(role === 'qari' ? 'teachers' : 'parents').doc(created.uid).set({
          uid: created.uid, email, displayName, madrasaId: MADRASA_ID, status: 'active',
          joinedAt: FieldValue.serverTimestamp(), createdBy: user.uid,
        })
        await audit(db, user.uid, 'account.created', 'user', created.uid)
        return res.status(200).json({ data: { uid: created.uid, email, displayName, role, temporaryPassword } })
      }

      case 'assignStudentToQari': {
        requireAdmin(user)
        const studentId = requiredString(input.studentId, 'studentId', 128)
        const qariUid = requiredString(input.qariUid, 'qariUid', 128)
        await ensureStudent(db, studentId)
        const qari = await db.collection('users').doc(qariUid).get()
        if (!qari.exists || qari.data()?.role !== 'qari' || qari.data()?.madrasaId !== MADRASA_ID) throw new ApiError(409, 'منتخب قاری کا فعال اکاؤنٹ موجود نہیں۔')
        const assignmentId = `${qariUid}_${studentId}`
        const old = await db.collection('student_assignments').where('madrasaId', '==', MADRASA_ID).where('studentId', '==', studentId).where('status', '==', 'active').get()
        const batch = db.batch()
        old.docs.forEach(item => { if (item.id !== assignmentId) batch.update(item.ref, { status: 'inactive', unassignedBy: user.uid, unassignedAt: FieldValue.serverTimestamp() }) })
        batch.set(db.collection('student_assignments').doc(assignmentId), {
          madrasaId: MADRASA_ID, studentId, qariUid, assignedBy: user.uid,
          assignedAt: FieldValue.serverTimestamp(), status: 'active',
        })
        await batch.commit()
        await audit(db, user.uid, 'student.assigned', 'student_assignment', assignmentId)
        return res.status(200).json({ data: { assignmentId, studentId, qariUid } })
      }

      case 'verifyParentChildLink': {
        requireAdmin(user)
        const parentUid = requiredString(input.parentUid, 'parentUid', 128)
        const studentId = requiredString(input.studentId, 'studentId', 128)
        const [parent, student] = await Promise.all([
          db.collection('users').doc(parentUid).get(),
          ensureStudent(db, studentId),
        ])
        if (!parent.exists || parent.data()?.role !== 'parent' || parent.data()?.madrasaId !== MADRASA_ID) throw new ApiError(409, 'والدین کا اکاؤنٹ موجود نہیں۔')
        const linkId = `${parentUid}_${studentId}`
        await db.collection('student_parent_links').doc(linkId).set({
          madrasaId: MADRASA_ID, parentUid, studentId, verified: true,
          verifiedBy: user.uid, verifiedAt: FieldValue.serverTimestamp(),
        })
        await audit(db, user.uid, 'parent_child.verified', 'student_parent_link', linkId)
        return res.status(200).json({ data: { linkId, verified: true } })
      }

      case 'recordAttendance': {
        requireStaff(user)
        const studentId = requiredString(input.studentId, 'studentId', 128)
        const date = validateDate(input.date, 'date')
        const session = requiredString(input.session ?? 'morning', 'session', 30)
        const status = input.status
        if (!['morning', 'afternoon', 'evening'].includes(session) || !['present', 'absent', 'late', 'leave'].includes(String(status))) throw new ApiError(400, 'حاضری کی تاریخ، وقت یا حیثیت درست نہیں۔')
        await ensureStudent(db, studentId, true)
        if (user.role === 'qari') await ensureQariAssignment(db, user.uid, studentId)
        const recordId = `${studentId}_${date}_${session}`
        const ref = db.collection('attendance').doc(recordId)
        await db.runTransaction(async tx => {
          const existing = await tx.get(ref)
          if (existing.exists) throw new ApiError(409, 'اس طالب علم کی اس تاریخ اور نشست کی حاضری پہلے درج ہو چکی ہے۔')
          tx.create(ref, { madrasaId: MADRASA_ID, studentId, date, session, status, qariUid: user.uid, createdBy: user.uid, createdAt: FieldValue.serverTimestamp() })
        })
        await audit(db, user.uid, 'attendance.recorded', 'attendance', recordId)
        return res.status(200).json({ data: { recordId, status } })
      }

      case 'recordDailyProgress': {
        requireStaff(user)
        const studentId = requiredString(input.studentId, 'studentId', 128)
        const date = validateDate(input.date, 'date')
        const session = requiredString(input.session ?? 'morning', 'session', 30)
        if (!['morning', 'afternoon', 'evening'].includes(session)) throw new ApiError(400, 'نشست درست منتخب کریں۔')
        await ensureStudent(db, studentId)
        if (user.role === 'qari') await ensureQariAssignment(db, user.uid, studentId)
        const recordId = `${studentId}_${date}_${session}`
        const ref = db.collection('progress_logs').doc(recordId)
        const progress = {
          madrasaId: MADRASA_ID, studentId, date, session,
          sabaq: typeof input.sabaq === 'string' ? input.sabaq.trim().slice(0, 500) : '',
          sabqi: typeof input.sabqi === 'string' ? input.sabqi.trim().slice(0, 500) : '',
          manzil: typeof input.manzil === 'string' ? input.manzil.trim().slice(0, 500) : '',
          quality: ['excellent', 'good', 'needs_attention'].includes(String(input.quality)) ? input.quality : 'good',
          parentVisible: false, visibilityStatus: 'pending',
          qariUid: user.uid, createdBy: user.uid, createdAt: FieldValue.serverTimestamp(),
        }
        await db.runTransaction(async tx => {
          const existing = await tx.get(ref)
          if (existing.exists) throw new ApiError(409, 'اس تاریخ اور نشست کی پیش رفت پہلے درج ہو چکی ہے۔')
          tx.create(ref, progress)
        })
        await audit(db, user.uid, 'progress.recorded', 'progress_log', recordId)
        return res.status(200).json({ data: { recordId } })
      }

      case 'recordCourseProgress': {
        requireStaff(user)
        const studentId = requiredString(input.studentId, 'studentId', 128)
        const program = input.program
        if (program !== 'hifz' && program !== 'nazra') throw new ApiError(400, 'حفظ یا ناظرہ منتخب کریں۔')
        await ensureStudent(db, studentId)
        if (user.role === 'qari') await ensureQariAssignment(db, user.uid, studentId)
        const completedParas = Number(input.completedParas ?? 0)
        const currentPara = Number(input.currentPara ?? 1)
        if (!Number.isInteger(completedParas) || completedParas < 0 || completedParas > 30 || !Number.isInteger(currentPara) || currentPara < 1 || currentPara > 30) {
          throw new ApiError(400, 'پاروں کی تعداد 0 سے 30 اور موجودہ پارہ 1 سے 30 کے درمیان درج کریں۔')
        }
        const summaryRef = db.collection(program === 'hifz' ? 'hifz_records' : 'nazra_records').doc(studentId)
        const historyRef = db.collection('course_progress_history').doc()
        const payload = {
          madrasaId: MADRASA_ID, studentId, program, completedParas, currentPara,
          notes: typeof input.notes === 'string' ? input.notes.trim().slice(0, 500) : '',
          parentVisible: false, updatedBy: user.uid, updatedAt: FieldValue.serverTimestamp(),
        }
        await db.runTransaction(async tx => {
          const existing = await tx.get(summaryRef)
          tx.set(summaryRef, { ...payload, ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true })
          tx.create(historyRef, { ...payload, createdAt: FieldValue.serverTimestamp(), actorUid: user.uid })
        })
        await audit(db, user.uid, `${program}.progress.updated`, program, studentId)
        return res.status(200).json({ data: { studentId, program, completedParas, currentPara } })
      }

      case 'correctAttendance': {
        requireAdmin(user)
        const recordId = requiredString(input.recordId, 'recordId', 256)
        const status = input.status
        const reason = requiredString(input.reason, 'reason', 300)
        if (!['present', 'absent', 'late', 'leave'].includes(String(status))) throw new ApiError(400, 'حاضری کی حیثیت درست نہیں۔')
        const ref = db.collection('attendance').doc(recordId)
        const snap = await ref.get()
        if (!snap.exists || snap.data()?.madrasaId !== MADRASA_ID) throw new ApiError(404, 'حاضری کا ریکارڈ نہیں ملا۔')
        await ref.update({ status, correctionReason: reason, correctedBy: user.uid, correctedAt: FieldValue.serverTimestamp() })
        await audit(db, user.uid, 'attendance.corrected', 'attendance', recordId)
        return res.status(200).json({ data: { recordId, status } })
      }

      case 'setProgressParentVisibility': {
        requireAdmin(user)
        const recordId = requiredString(input.recordId, 'recordId', 256)
        if (typeof input.visible !== 'boolean') throw new ApiError(400, 'Visibility must be true or false.')
        const ref = db.collection('progress_logs').doc(recordId)
        const snap = await ref.get()
        if (!snap.exists || snap.data()?.madrasaId !== MADRASA_ID) throw new ApiError(404, 'تعلیمی پیش رفت کا ریکارڈ نہیں ملا۔')
        await ref.update({
          parentVisible: input.visible,
          visibilityStatus: input.visible ? 'approved' : 'rejected',
          visibilityApprovedBy: user.uid,
          visibilityApprovedAt: FieldValue.serverTimestamp(),
        })
        await audit(db, user.uid, input.visible ? 'progress.shared_with_parent' : 'progress.hidden_from_parent', 'progress_log', recordId)
        return res.status(200).json({ data: { recordId, parentVisible: input.visible } })
      }

      default:
        throw new ApiError(400, 'Unknown operation.')
    }
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500
    const message = error instanceof Error ? error.message : 'Internal server error'
    return res.status(status).json({ error: message })
  }
}
