import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  collection, doc, getDoc, getDocs, limit, query, where,
} from 'firebase/firestore'
import { BookOpen, CalendarCheck, CheckCircle2, ClipboardList, LoaderCircle, Plus, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import { signOut } from 'firebase/auth'
import { auth, db } from '../lib/firebase'
import { createStudent, recordAttendance, recordDailyProgress } from '../services/madrasa'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showStudentForm, setShowStudentForm] = useState(false)
  const [showProgressForm, setShowProgressForm] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState('')
  const [studentForm, setStudentForm] = useState({ fullName: '', guardianName: '', guardianPhone: '', program: 'hifz' as 'hifz' | 'nazra' | 'qaida', admissionDate: pakistanDate() })
  const [progressForm, setProgressForm] = useState({ date: pakistanDate(), session: 'morning' as 'morning' | 'afternoon' | 'evening', status: 'present' as 'present' | 'absent' | 'late' | 'leave', sabaq: '', sabqi: '', manzil: '' })
  const [busy, setBusy] = useState(false)

  const loadStudents = useCallback(async () => {
    if (!db || !session.madrasaId) { setError('Firebase ڈیٹا بیس کنفیگر نہیں ہے۔'); setLoading(false); return }
    setLoading(true); setError('')
    try {
      let ids: string[] = []
      if (session.role === 'admin') {
        const snap = await getDocs(query(collection(db, 'students'), where('madrasaId', '==', session.madrasaId), limit(100)))
        setStudents(snap.docs.map(item => ({ id: item.id, ...(item.data() as Omit<StudentRow, 'id'>) })).sort((a,b) => b.admissionDate.localeCompare(a.admissionDate)))
        setLoading(false); return
      }
      if (session.role === 'qari') {
        const assignments = await getDocs(query(collection(db, 'student_assignments'), where('madrasaId', '==', session.madrasaId), where('qariUid', '==', session.user.uid), where('status', '==', 'active'), limit(100)))
        ids = assignments.docs.map(item => String(item.data().studentId))
      } else if (session.role === 'parent') {
        const links = await getDocs(query(collection(db, 'student_parent_links'), where('madrasaId', '==', session.madrasaId), where('parentUid', '==', session.user.uid), where('verified', '==', true), limit(30)))
        ids = links.docs.map(item => String(item.data().studentId))
      }
      const rows = await Promise.all(ids.map(async id => {
        const snap = await getDoc(doc(db, 'students', id))
        if (!snap.exists()) return null
        const data = snap.data()
        if (data.madrasaId !== session.madrasaId) return null
        return { id: snap.id, studentCode: String(data.studentCode ?? ''), fullName: String(data.fullName ?? ''), program: data.program === 'nazra' || data.program === 'qaida' ? data.program : 'hifz', status: String(data.status ?? 'active'), admissionDate: String(data.admissionDate ?? '') } as StudentRow
      }))
      setStudents(rows.filter((row): row is StudentRow => row !== null))
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

  const roleTitle = session.role === 'admin' ? 'ایڈمن ڈیش بورڈ' : session.role === 'qari' ? 'قاری پورٹل' : 'والدین پورٹل'

  return (
    <main className="portal-page">
      <div className="portal-top">
        <a href="/" className="brand"><span className="brand-mark"><BookOpen size={23} /></span><span className="brand-copy"><strong>MRK Madrasa 58</strong><small>محفوظ انتظامی نظام</small></span></a>
        <button className="outline-btn" onClick={async () => { if (auth) await signOut(auth); onLogout() }}>لاگ آؤٹ</button>
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
        {session.role === 'admin' && <button className="primary-btn workspace-action" onClick={() => setShowStudentForm(!showStudentForm)}><Plus size={17} /> نیا طالب علم شامل کریں</button>}
        {showStudentForm && session.role === 'admin' && <form className="workspace-form" onSubmit={submitStudent}>
          <h3>نئے طالب علم کا داخلہ</h3>
          <div className="form-grid"><label>طالب علم کا نام<input required value={studentForm.fullName} onChange={e => setStudentForm(p => ({...p,fullName:e.target.value}))} /></label><label>والد / سرپرست کا نام<input required value={studentForm.guardianName} onChange={e => setStudentForm(p => ({...p,guardianName:e.target.value}))} /></label><label>سرپرست کا فون نمبر<input value={studentForm.guardianPhone} onChange={e => setStudentForm(p => ({...p,guardianPhone:e.target.value}))} dir="ltr" /></label><label>تعلیمی شعبہ<select value={studentForm.program} onChange={e => setStudentForm(p => ({...p,program:e.target.value as 'hifz'|'nazra'|'qaida'}))}><option value="hifz">حفظ</option><option value="nazra">ناظرہ</option><option value="qaida">قاعدہ</option></select></label><label>داخلہ کی تاریخ<input type="date" required value={studentForm.admissionDate} onChange={e => setStudentForm(p => ({...p,admissionDate:e.target.value}))} /></label></div>
          <div className="form-actions"><button className="primary-btn" disabled={busy}>{busy ? 'محفوظ ہو رہا ہے…' : 'ریکارڈ محفوظ کریں'}</button><button type="button" className="outline-btn" onClick={() => setShowStudentForm(false)}>منسوخ</button></div>
        </form>}
        {session.role === 'qari' && <div className="qari-actions"><button className="primary-btn" disabled={!students.length} onClick={() => {setSelectedStudent(students[0]?.id ?? '');setShowProgressForm(true)}}><CalendarCheck size={16}/> حاضری / سبق درج کریں</button><span>صرف اپنے سپرد طلبہ کے لیے</span></div>}
        {loading ? <div className="loading-panel"><LoaderCircle className="spin" /> ریکارڈ لوڈ ہو رہا ہے…</div> : students.length === 0 ? <div className="empty-panel"><Users size={30}/><h3>ابھی کوئی طالب علم دستیاب نہیں</h3><p>{session.role === 'admin' ? 'نیا داخلہ شامل کرکے طلبہ کا ریکارڈ شروع کریں۔' : session.role === 'qari' ? 'منتظم سے طلبہ تفویض کروائیں۔' : 'منتظم سے اپنے بچے کا اکاؤنٹ لنک اور تصدیق کروائیں۔'}</p></div> : <div className="student-table-wrap"><table className="student-table"><thead><tr><th>شناختی نمبر</th><th>طالب علم</th><th>شعبہ</th><th>حیثیت</th><th>داخلہ تاریخ</th>{session.role === 'qari' && <th>کارروائی</th>}</tr></thead><tbody>{students.map(student => <tr key={student.id}><td dir="ltr">{student.studentCode || '—'}</td><td><strong>{student.fullName}</strong></td><td>{programNames[student.program]}</td><td><span className={student.status === 'active' ? 'status-active' : 'status-muted'}>{statusNames[student.status] ?? student.status}</span></td><td dir="ltr">{student.admissionDate || '—'}</td>{session.role === 'qari' && <td><button className="small-action" onClick={() => {setSelectedStudent(student.id);setShowProgressForm(true)}}>حاضری / سبق</button></td>}</tr>)}</tbody></table></div>}
        {showProgressForm && session.role === 'qari' && <form className="workspace-form progress-form" onSubmit={submitAttendance}>
          <h3>روزانہ حاضری</h3><div className="form-grid"><label>طالب علم<select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)}>{students.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}</select></label><label>تاریخ<input type="date" value={progressForm.date} onChange={e => setProgressForm(p => ({...p,date:e.target.value}))}/></label><label>نشست<select value={progressForm.session} onChange={e => setProgressForm(p => ({...p,session:e.target.value as 'morning'|'afternoon'|'evening'}))}><option value="morning">صبح</option><option value="afternoon">دوپہر</option><option value="evening">شام</option></select></label><label>حاضری<select value={progressForm.status} onChange={e => setProgressForm(p => ({...p,status:e.target.value as 'present'|'absent'|'late'|'leave'}))}><option value="present">حاضر</option><option value="absent">غیر حاضر</option><option value="late">تاخیر</option><option value="leave">چھٹی</option></select></label></div>
          <div className="form-actions"><button className="primary-btn" disabled={busy || !selectedStudent}>{busy ? 'محفوظ ہو رہا ہے…' : 'حاضری محفوظ کریں'}</button><button type="button" className="outline-btn" onClick={() => setShowProgressForm(false)}>بند کریں</button></div>
          <div className="form-divider" /><h3>سبق، سبقی اور منزل</h3>
          <div className="form-grid"><label>سبق<input value={progressForm.sabaq} onChange={e => setProgressForm(p => ({...p,sabaq:e.target.value}))} placeholder="مثلاً سورۃ البقرہ، آیات..." /></label><label>سبقی<input value={progressForm.sabqi} onChange={e => setProgressForm(p => ({...p,sabqi:e.target.value}))} /></label><label>منزل<input value={progressForm.manzil} onChange={e => setProgressForm(p => ({...p,manzil:e.target.value}))} /></label></div>
          <button type="button" className="primary-btn" disabled={busy || !selectedStudent} onClick={() => void submitProgress()}><ClipboardList size={16}/> پیش رفت محفوظ کریں</button>
        </form>}
        <div className="portal-note"><ShieldCheck size={18}/><p><strong>نجی معلومات محفوظ ہیں۔</strong><br/>سرپرست کے رابطے اور دیگر حساس معلومات الگ محفوظ رکھی جاتی ہیں۔ والدین کا تعلق صرف منتظم کی تصدیق کے بعد فعال ہوتا ہے۔</p></div>
      </div>
    </main>
  )
}
