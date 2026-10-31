import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  collection, doc, getDoc, getDocs, limit, query, where,
} from 'firebase/firestore'
import { BookOpen, CalendarCheck, CheckCircle2, ClipboardList, LoaderCircle, Plus, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import { db } from '../lib/firebase'
import { createStudent, createManagedAccount, assignStudentToQari, verifyParentChildLink, recordAttendance, recordDailyProgress, recordCourseProgress, updateStudent, setProgressParentVisibility } from '../services/madrasa'

type AccountRow = { uid: string; displayName: string; email: string }
type ParentUpdate = { id: string; studentName: string; date: string; title: string; detail: string }
type PendingProgress = { id: string; studentName: string; date: string; sabaq: string; sabqi: string; manzil: string }

type StudentRow = {
  id: string
  studentCode: string
  fullName: string
  program: 'hifz' | 'nazra' | 'qaida'
  status: string
  admissionDate: string
}

type Session = { user: { uid: string; email: string | null }; role: 'admin' | 'qari' | 'parent' | null; madrasaId: string | null }

const programNames = { hifz: 'حفظ', nazra: 'ناظرہ', qaida: 'قاعدہ' }
const statusNames: Record<string, string> = { active: 'فعال', inactive: 'غیرفعال', transferred: 'منتقل', completed: 'تعلیم مکمل' }

function pakistanDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export default function PortalWorkspace({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [students, setStudents] = useState<StudentRow[]>([])
  const [parentUpdates, setParentUpdates] = useState<ParentUpdate[]>([])
  const [pendingProgress, setPendingProgress] = useState<PendingProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showStudentForm, setShowStudentForm] = useState(false)
  const [showProgressForm, setShowProgressForm] = useState(false)
  const [qariAccounts, setQariAccounts] = useState<AccountRow[]>([])
  const [parentAccounts, setParentAccounts] = useState<AccountRow[]>([])
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [showAssignmentForm, setShowAssignmentForm] = useState(false)
  const [showParentLinkForm, setShowParentLinkForm] = useState(false)
  const [accountForm, setAccountForm] = useState({ displayName: '', email: '', role: 'qari' as 'qari' | 'parent' })
  const [assignmentForm, setAssignmentForm] = useState({ studentId: '', qariUid: '' })
  const [parentLinkForm, setParentLinkForm] = useState({ studentId: '', parentUid: '' })
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [selectedStudent, setSelectedStudent] = useState('')
  const [studentForm, setStudentForm] = useState({ fullName: '', guardianName: '', guardianPhone: '', program: 'hifz' as 'hifz' | 'nazra' | 'qaida', admissionDate: pakistanDate() })
  const [progressForm, setProgressForm] = useState({ date: pakistanDate(), session: 'morning' as 'morning' | 'afternoon' | 'evening', status: 'present' as 'present' | 'absent' | 'late' | 'leave', sabaq: '', sabqi: '', manzil: '' })
  const [courseForm, setCourseForm] = useState({ program: 'hifz' as 'hifz' | 'nazra', completedParas: '0', currentPara: '1', notes: '' })
  const [busy, setBusy] = useState(false)

  const loadStudents = useCallback(async () => {
    if (!db || !session.madrasaId) { setError('Firebase ڈیٹا بیس کنفیگر نہیں ہے۔'); setLoading(false); return }
    const firestore = db
    setLoading(true); setError('')
    try {
      let ids: string[] = []
      if (session.role === 'admin') {
        const [snap, qariSnap, parentSnap, progressSnap] = await Promise.all([
          getDocs(query(collection(firestore, 'students'), where('madrasaId', '==', session.madrasaId), limit(100))),
          getDocs(query(collection(firestore, 'teachers'), where('madrasaId', '==', session.madrasaId), limit(100))),
          getDocs(query(collection(firestore, 'parents'), where('madrasaId', '==', session.madrasaId), limit(100))),
          getDocs(query(collection(firestore, 'progress_logs'), where('madrasaId', '==', session.madrasaId), where('visibilityStatus', '==', 'pending'), limit(50))),
        ])
        const studentRows = snap.docs.map(item => ({ id: item.id, ...(item.data() as Omit<StudentRow, 'id'>) })).sort((a,b) => b.admissionDate.localeCompare(a.admissionDate))
        setStudents(studentRows)
        setQariAccounts(qariSnap.docs.map(item => ({ uid: item.id, displayName: String(item.data().displayName ?? ''), email: String(item.data().email ?? '') })))
        setParentAccounts(parentSnap.docs.map(item => ({ uid: item.id, displayName: String(item.data().displayName ?? ''), email: String(item.data().email ?? '') })))
        const names = new Map(studentRows.map(student => [student.id, student.fullName]))
        setPendingProgress(progressSnap.docs.map(item => ({ id: item.id, studentName: names.get(String(item.data().studentId)) ?? 'طالب علم', date: String(item.data().date ?? ''), sabaq: String(item.data().sabaq ?? ''), sabqi: String(item.data().sabqi ?? ''), manzil: String(item.data().manzil ?? '') })))
        setLoading(false); return
      }
      if (session.role === 'qari') {
        const assignments = await getDocs(query(collection(firestore, 'student_assignments'), where('madrasaId', '==', session.madrasaId), where('qariUid', '==', session.user.uid), where('status', '==', 'active'), limit(100)))
        ids = assignments.docs.map(item => String(item.data().studentId))
      } else if (session.role === 'parent') {
        const links = await getDocs(query(collection(firestore, 'student_parent_links'), where('madrasaId', '==', session.madrasaId), where('parentUid', '==', session.user.uid), where('verified', '==', true), limit(30)))
        ids = links.docs.map(item => String(item.data().studentId))
      }
      const rows = await Promise.all(ids.map(async id => {
        const snap = await getDoc(doc(firestore, 'students', id))
        if (!snap.exists()) return null
        const data = snap.data()
        if (data.madrasaId !== session.madrasaId) return null
        return { id: snap.id, studentCode: String(data.studentCode ?? ''), fullName: String(data.fullName ?? ''), program: data.program === 'nazra' || data.program === 'qaida' ? data.program : 'hifz', status: String(data.status ?? 'active'), admissionDate: String(data.admissionDate ?? '') } as StudentRow
      }))
      const validRows = rows.filter((row): row is StudentRow => row !== null)
      setStudents(validRows)
      if (session.role === 'parent') {
        const history = await Promise.all(validRows.map(async (student) => {
          const [attendanceSnap, progressSnap] = await Promise.all([
            getDocs(query(collection(firestore, 'attendance'), where('madrasaId', '==', session.madrasaId), where('studentId', '==', student.id), limit(10))),
            getDocs(query(collection(firestore, 'progress_logs'), where('madrasaId', '==', session.madrasaId), where('studentId', '==', student.id), where('parentVisible', '==', true), limit(10))),
          ])
          const attendanceItems = attendanceSnap.docs.map(item => {
            const data = item.data()
            return { id: item.id, studentName: student.fullName, date: String(data.date ?? ''), title: 'حاضری', detail: data.status === 'present' ? 'حاضر' : data.status === 'absent' ? 'غیر حاضر' : data.status === 'late' ? 'تاخیر' : 'چھٹی' }
          })
          const progressItems = progressSnap.docs.map(item => {
            const data = item.data()
            const detail = [data.sabaq ? `سبق: ${data.sabaq}` : '', data.sabqi ? `سبقی: ${data.sabqi}` : '', data.manzil ? `منزل: ${data.manzil}` : ''].filter(Boolean).join(' • ')
            return { id: item.id, studentName: student.fullName, date: String(data.date ?? ''), title: 'تعلیمی پیش رفت', detail: detail || 'استاد نے پیش رفت درج کی ہے۔' }
          })
          return [...attendanceItems, ...progressItems]
        }))
        setParentUpdates(history.flat().sort((a,b) => b.date.localeCompare(a.date)).slice(0,30))
      }
    } catch {
      setError('ریکارڈ لوڈ نہیں ہو سکا۔ براہِ کرم اجازتوں اور Firebase کنفیگریشن کو چیک کریں۔')
    } finally { setLoading(false) }
  }, [session.madrasaId, session.role, session.user.uid])

  useEffect(() => { void loadStudents() }, [loadStudents])

  async function submitStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(''); setError('')
    try {
      const result = await createStudent(studentForm)
      setNotice(`طالب علم محفوظ ہو گیا۔ شناختی نمبر: ${result.studentCode}`)
      setStudentForm({ fullName: '', guardianName: '', guardianPhone: '', program: 'hifz', admissionDate: pakistanDate() })
      setShowStudentForm(false)
      await loadStudents()
    } catch (e) { setError(e instanceof Error ? e.message : 'طالب علم محفوظ نہیں ہو سکا۔') }
    finally { setBusy(false) }
  }

  async function approveProgress(recordId: string, visible: boolean) {
    setBusy(true); setError(''); setNotice('')
    try {
      await setProgressParentVisibility({ recordId, visible })
      setPendingProgress(previous => previous.filter(item => item.id !== recordId))
      setNotice(visible ? 'تعلیمی پیش رفت والدین کے لیے منظور کر دی گئی۔' : 'ریکارڈ والدین سے پوشیدہ رکھا گیا۔')
    } catch (e) { setError(e instanceof Error ? e.message : 'منظوری محفوظ نہیں ہو سکی۔') }
    finally { setBusy(false) }
  }

  async function changeStudentStatus(studentId: string, status: 'active' | 'inactive' | 'transferred' | 'completed') {
    setBusy(true); setError(''); setNotice('')
    try {
      await updateStudent({ studentId, status })
      setStudents(previous => previous.map(student => student.id === studentId ? { ...student, status } : student))
      setNotice('طالب علم کی حیثیت اپ ڈیٹ کر دی گئی ہے۔ سابقہ ریکارڈ محفوظ ہے۔')
    } catch (e) { setError(e instanceof Error ? e.message : 'حیثیت تبدیل نہیں ہو سکی۔') }
    finally { setBusy(false) }
  }

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice(''); setTemporaryPassword('')
    try {
      const result = await createManagedAccount(accountForm)
      setNotice(`${result.role === 'qari' ? 'قاری' : 'والدین'} کا اکاؤنٹ بنا دیا گیا: ${result.email}`)
      setTemporaryPassword(result.temporaryPassword)
      setAccountForm({ displayName: '', email: '', role: 'qari' })
      setShowAccountForm(false)
      await loadStudents()
    } catch (e) { setError(e instanceof Error ? e.message : 'اکاؤنٹ نہیں بن سکا۔') }
    finally { setBusy(false) }
  }

  async function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      await assignStudentToQari(assignmentForm)
      setNotice('طالب علم قاری کو تفویض کر دیا گیا ہے۔ سابقہ فعال تفویض بند کر دی گئی ہے۔')
      setShowAssignmentForm(false); setAssignmentForm({ studentId: '', qariUid: '' })
    } catch (e) { setError(e instanceof Error ? e.message : 'قاری تفویض نہیں ہو سکا۔') }
    finally { setBusy(false) }
  }

  async function submitParentLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      await verifyParentChildLink(parentLinkForm)
      setNotice('والدین اور بچے کا تعلق تصدیق کرکے فعال کر دیا گیا ہے۔')
      setShowParentLinkForm(false); setParentLinkForm({ studentId: '', parentUid: '' })
    } catch (e) { setError(e instanceof Error ? e.message : 'والدین کا تعلق تصدیق نہیں ہو سکا۔') }
    finally { setBusy(false) }
  }

  async function submitAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(''); setError('')
    try {
      await recordAttendance({ studentId: selectedStudent, date: progressForm.date, session: progressForm.session, status: progressForm.status })
      setNotice('حاضری کامیابی سے درج ہو گئی۔')
    } catch (e) { setError(e instanceof Error ? e.message : 'حاضری درج نہیں ہو سکی۔') }
    finally { setBusy(false) }
  }

  async function submitProgress() {
    setBusy(true); setNotice(''); setError('')
    try {
      await recordDailyProgress({ studentId: selectedStudent, date: progressForm.date, session: progressForm.session, sabaq: progressForm.sabaq, sabqi: progressForm.sabqi, manzil: progressForm.manzil })
      setNotice('روزانہ تعلیمی پیش رفت محفوظ ہو گئی۔ والدین کو دکھانے سے پہلے ایڈمن کی منظوری ضروری ہے۔')
      setProgressForm(prev => ({ ...prev, sabaq: '', sabqi: '', manzil: '' }))
    } catch (e) { setError(e instanceof Error ? e.message : 'پیش رفت محفوظ نہیں ہو سکی۔') }
    finally { setBusy(false) }
  }

  async function submitCourseProgress() {
    setBusy(true); setError(''); setNotice('')
    try {
      await recordCourseProgress({
        studentId: selectedStudent,
        program: courseForm.program,
        completedParas: Number(courseForm.completedParas),
        currentPara: Number(courseForm.currentPara),
        notes: courseForm.notes,
      })
      setNotice('حفظ / ناظرہ کی پیش رفت محفوظ ہو گئی۔ والدین کو دکھانے کے لیے ایڈمن کی منظوری ضروری ہے۔')
    } catch (e) { setError(e instanceof Error ? e.message : 'تعلیمی ریکارڈ محفوظ نہیں ہو سکا۔') }
    finally { setBusy(false) }
  }

  const roleTitle = session.role === 'admin' ? 'ایڈمن ڈیش بورڈ' : session.role === 'qari' ? 'قاری پورٹل' : 'والدین پورٹل'

  return (
    <main className="portal-page">
      <div className="portal-top">
        <a href="/" className="brand"><span className="brand-mark"><BookOpen size={23} /></span><span className="brand-copy"><strong>MRK Madrasa 58</strong><small>محفوظ انتظامی نظام</small></span></a>
        <button className="outline-btn" onClick={onLogout}>لاگ آؤٹ</button>
      </div>
      <div className="container portal-content">
        <div className="portal-welcome"><div><p className="eyebrow">MRK MADRASA MANAGEMENT SYSTEM 58</p><h1>{roleTitle}</h1><p className="muted">{session.user.email}</p></div><div className="portal-badge"><ShieldCheck size={18} /> محفوظ سیشن</div></div>
        <div className="secure-banner"><ShieldCheck size={19} /><span>آپ کو صرف اپنے کردار اور اجازت کے مطابق معلومات تک رسائی حاصل ہے۔</span></div>
        {notice && <div className="success-notice"><CheckCircle2 size={18} />{notice}</div>}
        {error && <div className="error-notice" role="alert">{error}</div>}
        <div className="workspace-toolbar">
          <div><h2>طلبہ کا ریکارڈ</h2><p>اس اکاؤنٹ کو اجازت یافتہ طلبہ کی فہرست</p></div>
          <button className="outline-btn" onClick={() => void loadStudents()}><RefreshCw size={15} /> تازہ کریں</button>
        </div>
        {session.role === 'admin' && <div className="admin-actions">
          <button className="outline-btn" onClick={() => setShowAccountForm(!showAccountForm)}><Plus size={15}/> قاری / والدین اکاؤنٹ</button>
          <button className="outline-btn" onClick={() => setShowAssignmentForm(!showAssignmentForm)}>قاری تفویض کریں</button>
          <button className="outline-btn" onClick={() => setShowParentLinkForm(!showParentLinkForm)}>والدین کا اکاؤنٹ لنک کریں</button>
        </div>}
        {temporaryPassword && <div className="success-notice password-notice"><span>عارضی پاس ورڈ (صرف ایک بار محفوظ کریں):</span><code dir="ltr">{temporaryPassword}</code><button type="button" className="small-action" onClick={() => void navigator.clipboard?.writeText(temporaryPassword)}>کاپی</button></div>}
        {showAccountForm && session.role === 'admin' && <form className="workspace-form" onSubmit={submitAccount}>
          <h3>نیا صارف اکاؤنٹ</h3><div className="form-grid">
            <label>نام<input required value={accountForm.displayName} onChange={e => setAccountForm(p => ({...p,displayName:e.target.value}))}/></label>
            <label>ای میل<input type="email" required dir="ltr" value={accountForm.email} onChange={e => setAccountForm(p => ({...p,email:e.target.value}))}/></label>
            <label>کردار<select value={accountForm.role} onChange={e => setAccountForm(p => ({...p,role:e.target.value as 'qari'|'parent'}))}><option value="qari">قاری</option><option value="parent">والدین</option></select></label>
          </div><div className="form-actions"><button className="primary-btn" disabled={busy}>اکاؤنٹ بنائیں</button><button type="button" className="outline-btn" onClick={() => setShowAccountForm(false)}>منسوخ</button></div>
        </form>}
        {showAssignmentForm && session.role === 'admin' && <form className="workspace-form" onSubmit={submitAssignment}>
          <h3>طالب علم کو قاری کے سپرد کریں</h3><div className="form-grid">
            <label>طالب علم<select required value={assignmentForm.studentId} onChange={e => setAssignmentForm(p => ({...p,studentId:e.target.value}))}><option value="">منتخب کریں</option>{students.map(s => <option key={s.id} value={s.id}>{s.fullName} — {s.studentCode}</option>)}</select></label>
            <label>قاری<select required value={assignmentForm.qariUid} onChange={e => setAssignmentForm(p => ({...p,qariUid:e.target.value}))}><option value="">منتخب کریں</option>{qariAccounts.map(q => <option key={q.uid} value={q.uid}>{q.displayName} ({q.email})</option>)}</select></label>
          </div><div className="form-actions"><button className="primary-btn" disabled={busy || !students.length || !qariAccounts.length}>تفویض محفوظ کریں</button><button type="button" className="outline-btn" onClick={() => setShowAssignmentForm(false)}>منسوخ</button></div>
        </form>}
        {showParentLinkForm && session.role === 'admin' && <form className="workspace-form" onSubmit={submitParentLink}>
          <h3>والدین اور بچے کا تعلق تصدیق کریں</h3><div className="form-grid">
            <label>طالب علم<select required value={parentLinkForm.studentId} onChange={e => setParentLinkForm(p => ({...p,studentId:e.target.value}))}><option value="">منتخب کریں</option>{students.map(s => <option key={s.id} value={s.id}>{s.fullName} — {s.studentCode}</option>)}</select></label>
            <label>والدین کا اکاؤنٹ<select required value={parentLinkForm.parentUid} onChange={e => setParentLinkForm(p => ({...p,parentUid:e.target.value}))}><option value="">منتخب کریں</option>{parentAccounts.map(p => <option key={p.uid} value={p.uid}>{p.displayName} ({p.email})</option>)}</select></label>
          </div><div className="form-actions"><button className="primary-btn" disabled={busy || !students.length || !parentAccounts.length}>تعلق تصدیق کریں</button><button type="button" className="outline-btn" onClick={() => setShowParentLinkForm(false)}>منسوخ</button></div>
        </form>}
        {session.role === 'admin' && pendingProgress.length > 0 && <section className="approval-section">
          <div className="workspace-toolbar"><div><h2>والدین کے لیے منظوری کے منتظر ریکارڈ</h2><p>قاری کی درج کردہ پیش رفت کو جانچ کر والدین کے ساتھ شیئر کریں۔</p></div><span className="approval-count">{pendingProgress.length}</span></div>
          <div className="approval-list">{pendingProgress.map(item => <article className="approval-item" key={item.id}><div><strong>{item.studentName}</strong><span dir="ltr">{item.date}</span></div><p>{[item.sabaq ? `سبق: ${item.sabaq}` : '', item.sabqi ? `سبقی: ${item.sabqi}` : '', item.manzil ? `منزل: ${item.manzil}` : ''].filter(Boolean).join(' • ') || 'روزانہ پیش رفت درج کی گئی ہے۔'}</p><div className="approval-buttons"><button className="small-action" disabled={busy} onClick={() => void approveProgress(item.id,true)}>والدین کو دکھائیں</button><button className="small-action reject-action" disabled={busy} onClick={() => void approveProgress(item.id,false)}>منظور نہ کریں</button></div></article>)}</div>
        </section>}
        {session.role === 'admin' && <button className="primary-btn workspace-action" onClick={() => setShowStudentForm(!showStudentForm)}><Plus size={17} /> نیا طالب علم شامل کریں</button>}
        {showStudentForm && session.role === 'admin' && <form className="workspace-form" onSubmit={submitStudent}>
          <h3>نئے طالب علم کا داخلہ</h3>
          <div className="form-grid"><label>طالب علم کا نام<input required value={studentForm.fullName} onChange={e => setStudentForm(p => ({...p,fullName:e.target.value}))} /></label><label>والد / سرپرست کا نام<input required value={studentForm.guardianName} onChange={e => setStudentForm(p => ({...p,guardianName:e.target.value}))} /></label><label>سرپرست کا فون نمبر<input value={studentForm.guardianPhone} onChange={e => setStudentForm(p => ({...p,guardianPhone:e.target.value}))} dir="ltr" /></label><label>تعلیمی شعبہ<select value={studentForm.program} onChange={e => setStudentForm(p => ({...p,program:e.target.value as 'hifz'|'nazra'|'qaida'}))}><option value="hifz">حفظ</option><option value="nazra">ناظرہ</option><option value="qaida">قاعدہ</option></select></label><label>داخلہ کی تاریخ<input type="date" required value={studentForm.admissionDate} onChange={e => setStudentForm(p => ({...p,admissionDate:e.target.value}))} /></label></div>
          <div className="form-actions"><button className="primary-btn" disabled={busy}>{busy ? 'محفوظ ہو رہا ہے…' : 'ریکارڈ محفوظ کریں'}</button><button type="button" className="outline-btn" onClick={() => setShowStudentForm(false)}>منسوخ</button></div>
        </form>}
        {session.role === 'qari' && <div className="qari-actions"><button className="primary-btn" disabled={!students.length} onClick={() => {setSelectedStudent(students[0]?.id ?? '');setShowProgressForm(true)}}><CalendarCheck size={16}/> حاضری / سبق درج کریں</button><span>صرف اپنے سپرد طلبہ کے لیے</span></div>}
        {loading ? <div className="loading-panel"><LoaderCircle className="spin" /> ریکارڈ لوڈ ہو رہا ہے…</div> : students.length === 0 ? <div className="empty-panel"><Users size={30}/><h3>ابھی کوئی طالب علم دستیاب نہیں</h3><p>{session.role === 'admin' ? 'نیا داخلہ شامل کرکے طلبہ کا ریکارڈ شروع کریں۔' : session.role === 'qari' ? 'منتظم سے طلبہ تفویض کروائیں۔' : 'منتظم سے اپنے بچے کا اکاؤنٹ لنک اور تصدیق کروائیں۔'}</p></div> : <div className="student-table-wrap"><table className="student-table"><thead><tr><th>شناختی نمبر</th><th>طالب علم</th><th>شعبہ</th><th>حیثیت</th><th>داخلہ تاریخ</th>{(session.role === 'qari' || session.role === 'admin') && <th>کارروائی</th>}</tr></thead><tbody>{students.map(student => <tr key={student.id}><td dir="ltr">{student.studentCode || '—'}</td><td><strong>{student.fullName}</strong></td><td>{programNames[student.program]}</td><td><span className={student.status === 'active' ? 'status-active' : 'status-muted'}>{statusNames[student.status] ?? student.status}</span></td><td dir="ltr">{student.admissionDate || '—'}</td>{session.role === 'qari' && <td><button className="small-action" onClick={() => {setSelectedStudent(student.id);setShowProgressForm(true)}}>حاضری / سبق</button></td>}{session.role === 'admin' && <td><select className="status-select" value={student.status} disabled={busy} onChange={e => void changeStudentStatus(student.id,e.target.value as 'active'|'inactive'|'transferred'|'completed')}><option value="active">فعال</option><option value="inactive">غیرفعال</option><option value="transferred">منتقل</option><option value="completed">تعلیم مکمل</option></select></td>}</tr>)}</tbody></table></div>}
        {showProgressForm && session.role === 'qari' && <form className="workspace-form progress-form" onSubmit={submitAttendance}>
          <h3>روزانہ حاضری</h3><div className="form-grid"><label>طالب علم<select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)}>{students.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}</select></label><label>تاریخ<input type="date" value={progressForm.date} onChange={e => setProgressForm(p => ({...p,date:e.target.value}))}/></label><label>نشست<select value={progressForm.session} onChange={e => setProgressForm(p => ({...p,session:e.target.value as 'morning'|'afternoon'|'evening'}))}><option value="morning">صبح</option><option value="afternoon">دوپہر</option><option value="evening">شام</option></select></label><label>حاضری<select value={progressForm.status} onChange={e => setProgressForm(p => ({...p,status:e.target.value as 'present'|'absent'|'late'|'leave'}))}><option value="present">حاضر</option><option value="absent">غیر حاضر</option><option value="late">تاخیر</option><option value="leave">چھٹی</option></select></label></div>
          <div className="form-actions"><button className="primary-btn" disabled={busy || !selectedStudent}>{busy ? 'محفوظ ہو رہا ہے…' : 'حاضری محفوظ کریں'}</button><button type="button" className="outline-btn" onClick={() => setShowProgressForm(false)}>بند کریں</button></div>
          <div className="form-divider" /><h3>سبق، سبقی اور منزل</h3>
          <div className="form-grid"><label>سبق<input value={progressForm.sabaq} onChange={e => setProgressForm(p => ({...p,sabaq:e.target.value}))} placeholder="مثلاً سورۃ البقرہ، آیات..." /></label><label>سبقی<input value={progressForm.sabqi} onChange={e => setProgressForm(p => ({...p,sabqi:e.target.value}))} /></label><label>منزل<input value={progressForm.manzil} onChange={e => setProgressForm(p => ({...p,manzil:e.target.value}))} /></label></div>
          <button type="button" className="primary-btn" disabled={busy || !selectedStudent} onClick={() => void submitProgress()}><ClipboardList size={16}/> روزانہ پیش رفت محفوظ کریں</button>
          <div className="form-divider" /><h3>حفظ / ناظرہ کا مجموعی ریکارڈ</h3>
          <div className="form-grid">
            <label>تعلیمی شعبہ<select value={courseForm.program} onChange={e => setCourseForm(p => ({...p,program:e.target.value as 'hifz'|'nazra'}))}><option value="hifz">حفظ</option><option value="nazra">ناظرہ</option></select></label>
            <label>مکمل شدہ پارے<input type="number" min="0" max="30" value={courseForm.completedParas} onChange={e => setCourseForm(p => ({...p,completedParas:e.target.value}))}/></label>
            <label>موجودہ پارہ<input type="number" min="1" max="30" value={courseForm.currentPara} onChange={e => setCourseForm(p => ({...p,currentPara:e.target.value}))}/></label>
            <label>اضافی نوٹس<input value={courseForm.notes} onChange={e => setCourseForm(p => ({...p,notes:e.target.value}))}/></label>
          </div>
          <button type="button" className="primary-btn" disabled={busy || !selectedStudent} onClick={() => void submitCourseProgress()}><BookOpen size={16}/> حفظ / ناظرہ ریکارڈ محفوظ کریں</button>
        </form>}
        {session.role === 'parent' && <section className="parent-history">
          <div className="workspace-toolbar"><div><h2>بچوں کی تازہ کارکردگی</h2><p>صرف استاد یا انتظامیہ کی جانب سے والدین کے لیے منظور شدہ معلومات</p></div></div>
          {parentUpdates.length === 0 ? <div className="empty-panel"><ClipboardList size={28}/><p>ابھی کوئی تازہ حاضری یا منظور شدہ تعلیمی پیش رفت موجود نہیں۔</p></div> : <div className="updates-list">{parentUpdates.map(item => <article className="update-item" key={item.id}><div><strong>{item.studentName}</strong><span>{item.title}</span></div><p>{item.detail}</p><time dir="ltr">{item.date}</time></article>)}</div>}
        </section>}
        <div className="portal-note"><ShieldCheck size={18}/><p><strong>نجی معلومات محفوظ ہیں۔</strong><br/>سرپرست کے رابطے اور دیگر حساس معلومات الگ محفوظ رکھی جاتی ہیں۔ والدین کا تعلق صرف منتظم کی تصدیق کے بعد فعال ہوتا ہے۔</p></div>
      </div>
    </main>
  )
}
