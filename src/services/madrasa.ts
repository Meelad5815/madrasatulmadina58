import { httpsCallable } from 'firebase/functions'
import { functions } from '../lib/firebase'

type CallableResponse<T> = { data: T }

async function call<TInput, TOutput>(name: string, input: TInput): Promise<TOutput> {
  if (!functions) throw new Error('Firebase configuration is missing.')
  const callable = httpsCallable<TInput, TOutput>(functions, name)
  const result: CallableResponse<TOutput> = await callable(input)
  return result.data
}

export interface CreateStudentInput {
  fullName: string
  guardianName: string
  guardianPhone?: string
  program: 'hifz' | 'nazra' | 'qaida'
  admissionDate: string
}

export interface CreateStudentResult {
  studentId: string
  studentCode: string
}

export interface ManagedAccountInput {
  email: string
  displayName: string
  role: 'qari' | 'parent'
}

export interface ManagedAccountResult {
  uid: string
  email: string
  displayName: string
  role: 'qari' | 'parent'
  temporaryPassword: string
}

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
  studentId: string
  date: string
  session?: 'morning' | 'afternoon' | 'evening'
  status: 'present' | 'absent' | 'late' | 'leave'
}) {
  return call<typeof input, { recordId: string; status: string }>('recordAttendance', input)
}

export function recordDailyProgress(input: {
  studentId: string
  date: string
  session?: 'morning' | 'afternoon' | 'evening'
  sabaq?: string
  sabqi?: string
  manzil?: string
  quality?: 'excellent' | 'good' | 'needs_attention'
}) {
  return call<typeof input, { recordId: string }>('recordDailyProgress', input)
}
