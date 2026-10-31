export type UserRole = 'admin' | 'qari' | 'parent'
export type StudentStatus = 'active' | 'inactive' | 'transferred' | 'completed'
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'leave' | 'holiday'

export interface AppUser {
  uid: string
  displayName: string
  email: string
  role: UserRole
  madrasaId: string
}

export interface Student {
  id: string
  studentCode: string
  fullName: string
  guardianName: string
  program: 'hifz' | 'nazra' | 'qaida'
  status: StudentStatus
  admissionDate: string
  assignedTeacherIds: string[]
}

export interface DailyProgress {
  studentId: string
  qariId: string
  date: string
  sabaq?: string
  sabqi?: string
  manzil?: string
  quality?: 'excellent' | 'good' | 'needs_attention'
  parentVisible: boolean
}
