import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-mrk-madrasa',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'students', 'student-a'), {
      madrasaId: 'mrk-madrasa-58',
      studentCode: 'MRK58-TEST0001',
      fullName: 'Test Student A',
      program: 'hifz',
      status: 'active',
      admissionDate: '2026-10-31',
    })
    await setDoc(doc(db, 'students', 'student-b'), {
      madrasaId: 'mrk-madrasa-58',
      studentCode: 'MRK58-TEST0002',
      fullName: 'Test Student B',
      program: 'nazra',
      status: 'active',
      admissionDate: '2026-10-31',
    })
    await setDoc(doc(db, 'student_parent_links', 'parent-a_student-a'), {
      madrasaId: 'mrk-madrasa-58',
      parentUid: 'parent-a',
      studentId: 'student-a',
      verified: true,
    })
    await setDoc(doc(db, 'student_assignments', 'qari-a_student-a'), {
      madrasaId: 'mrk-madrasa-58',
      qariUid: 'qari-a',
      studentId: 'student-a',
      status: 'active',
    })
    await setDoc(doc(db, 'student_private', 'student-a'), {
      madrasaId: 'mrk-madrasa-58',
      studentId: 'student-a',
      guardianName: 'Private Guardian',
      guardianPhone: '03000000000',
    })
    await setDoc(doc(db, 'public_content', 'about'), {
      madrasaId: 'mrk-madrasa-58',
      status: 'published',
      visibility: 'public',
      title: 'About the Madrasa',
    })
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

describe('MRK Madrasa Firestore security rules', () => {
  it('allows a verified parent to read only their linked child profile', async () => {
    const db = testEnv.authenticatedContext('parent-a', {
      role: 'parent',
      madrasaId: 'mrk-madrasa-58',
    }).firestore()
    await assertSucceeds(getDoc(doc(db, 'students', 'student-a')))
    await assertFails(getDoc(doc(db, 'students', 'student-b')))
    await assertFails(getDoc(doc(db, 'student_private', 'student-a')))
  })

  it('allows a Qari to read only actively assigned student profiles', async () => {
    const db = testEnv.authenticatedContext('qari-a', {
      role: 'qari',
      madrasaId: 'mrk-madrasa-58',
    }).firestore()
    await assertSucceeds(getDoc(doc(db, 'students', 'student-a')))
    await assertFails(getDoc(doc(db, 'students', 'student-b')))
    await assertFails(getDoc(doc(db, 'student_private', 'student-a')))
  })

  it('denies unauthenticated access to student records', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'students', 'student-a')))
    await assertFails(getDoc(doc(db, 'student_private', 'student-a')))
  })

  it('allows public visitors to read published public content only', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertSucceeds(getDoc(doc(db, 'public_content', 'about')))
    await assertFails(getDoc(doc(db, 'students', 'student-a')))
  })

  it('denies client-side attendance writes even to authenticated parents', async () => {
    const db = testEnv.authenticatedContext('parent-a', {
      role: 'parent',
      madrasaId: 'mrk-madrasa-58',
    }).firestore()
    await assertFails(setDoc(doc(db, 'attendance', 'student-a_2026-10-31_morning'), {
      madrasaId: 'mrk-madrasa-58',
      studentId: 'student-a',
      date: '2026-10-31',
      session: 'morning',
      status: 'present',
    }))
  })
})
