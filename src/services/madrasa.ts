import { auth } from '../lib/firebase'

type ApiResult<T> = { data: T }

async function call<TInput, TOutput>(action: string, input: TInput): Promise<TOutput> {
  const user = auth?.currentUser
  if (!user) throw new Error('لاگ اِن سیشن ختم ہو گیا ہے۔ دوبارہ لاگ اِن کریں۔')
  const token = await user.getIdToken()
  const response = await fetch('/api/madrasa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, input }),
  })
  const payload = await response.json() as ApiResult<TOutput> | { error?: string }
  if (!response.ok) throw new Error('error' in payload && payload.error ? payload.error : 'درخواست مکمل نہیں ہو سکی۔')
  return (payload as ApiResult<TOutput>).data
}

export interface CreateStudentInput {
  fullName: string
  guardianName: string
  guardianPhone?: string
  program: 'hifz' | 'nazra' | 'qaida'
  admissionDate: string
}
export interface CreateStudentResult { studentId: string; studentCode: string }
export interface ManagedAccountInput { email: string; displayName: string; role: 'qari' | 'parent' }
export interface ManagedAccountResult { uid: string; email: string; displayName: string; role: 'qari' | 'parent'; temporaryPassword: string }

export function createStudent(input: CreateStudentInput) {
  return call<CreateStudentInput, CreateStudentResult>('createStudent', input)
}
export function createManagedAccount(input: ManagedAccountInput) {
  return call<ManagedAccountInput, ManagedAccountResult>('createManagedAccount', input)
}
export function assignStudentToQari(input: { studentId: string; qariUid: string }) {
  return call<typeof input, { assignmentId: string; studentId: string; qariUid: string }>('assignStudentToQari', input)
}
export function verifyParentChildLink(input: { parentUid: string; studentId: string }) {
  return call<typeof input, { linkId: string; verified: boolean }>('verifyParentChildLink', input)
}
export function recordAttendance(input: {
  studentId: string; date: string; session?: 'morning' | 'afternoon' | 'evening';
  status: 'present' | 'absent' | 'late' | 'leave'
}) {
  return call<typeof input, { recordId: string; status: string }>('recordAttendance', input)
}
export function recordDailyProgress(input: {
  studentId: string; date: string; session?: 'morning' | 'afternoon' | 'evening';
  sabaq?: string; sabqi?: string; manzil?: string;
  quality?: 'excellent' | 'good' | 'needs_attention'
}) {
  return call<typeof input, { recordId: string }>('recordDailyProgress', input)
}
export function recordCourseProgress(input: {
  studentId: string; program: 'hifz' | 'nazra'; completedParas: number;
  currentPara: number; notes?: string; parentVisible?: boolean
}) {
  return call<typeof input, { studentId: string; program: string; completedParas: number; currentPara: number }>('recordCourseProgress', input)
}
export function updateStudent(input: {
  studentId: string; fullName?: string; program?: 'hifz' | 'nazra' | 'qaida';
  status?: 'active' | 'inactive' | 'transferred' | 'completed'; admissionDate?: string
}) {
  return call<typeof input, { studentId: string; updated: string[] }>('updateStudent', input)
}
export function setProgressParentVisibility(input: { recordId: string; visible: boolean }) {
  return call<typeof input, { recordId: string; parentVisible: boolean }>('setProgressParentVisibility', input)
}
