import { useEffect, useState, type FormEvent } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowUpLeft, BookOpen, CalendarCheck, CheckCircle2, ChevronLeft,
  ClipboardList, GraduationCap, HeartHandshake, Home, LockKeyhole, LogIn,
  Mail, Menu, MessageCircle, ShieldCheck, Sparkles, Users, X, Building2,
  BookMarked, FileCheck2, Image, Megaphone, Phone, MapPin, Globe2, LogOut,
  LayoutDashboard, UserRound, Settings, ChartNoAxesCombined, Clock3
} from 'lucide-react'
import { auth, isFirebaseConfigured } from './lib/firebase'
import type { UserRole } from './types'

type Session = { user: User; role: UserRole | null; madrasaId: string | null }

const programs = [
  { icon: BookOpen, title: 'حفظ القرآن کریم', description: 'تجوید و قواعد کے ساتھ حفظِ قرآن کی منظم تعلیم۔' },
  { icon: BookMarked, title: 'ناظرہ قرآن کریم', description: 'درست مخارج اور تجوید کے ساتھ قرآنِ پاک کی تلاوت۔' },
  { icon: GraduationCap, title: 'قاعدہ و بنیادی تعلیم', description: 'قرآنِ کریم سیکھنے کے لیے مضبوط ابتدائی بنیاد۔' },
]

const publicLinks = [
  { label: 'تعارف', href: '#about' },
  { label: 'تعلیمی شعبے', href: '#programs' },
  { label: 'خصوصیات', href: '#features' },
  { label: 'رابطہ', href: '#contact' },
]

function Header({ onLogin }: { onLogin: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a href="#home" className="brand" aria-label="MRK Madrasa home">
          <span className="brand-mark"><BookOpen size={25} /></span>
          <span className="brand-copy"><strong>MRK Madrasa 58</strong><small>مدرسۃ المدینہ مینجمنٹ سسٹم</small></span>
        </a>
        <nav className={menuOpen ? 'main-nav open' : 'main-nav'}>
          {publicLinks.map((link) => <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>{link.label}</a>)}
          <button className="nav-login mobile-login" onClick={() => { setMenuOpen(false); onLogin() }}><LogIn size={16} /> پورٹل لاگ اِن</button>
        </nav>
        <div className="header-actions">
          <button className="nav-login desktop-login" onClick={onLogin}><LockKeyhole size={16} /> پورٹل لاگ اِن</button>
          <button className="menu-toggle" aria-label="مینو کھولیں" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        </div>
      </div>
    </header>
  )
}

function LoginPanel({ onBack, onSignedIn }: { onBack: () => void; onSignedIn: (session: Session) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!auth) {
      setError('Firebase ابھی کنفیگر نہیں ہے۔ منتظم کو Firebase کی ترتیبات مکمل کرنا ہوں گی۔')
      return
    }
    setBusy(true)
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password)
      const token = await credential.user.getIdTokenResult(true)
      const roleValue = token.claims.role
      const role = roleValue === 'admin' || roleValue === 'qari' || roleValue === 'parent' ? roleValue : null
      const madrasaId = typeof token.claims.madrasaId === 'string' ? token.claims.madrasaId : null
      if (!role || !madrasaId) {
        await signOut(auth)
        setError('اس اکاؤنٹ کے لیے مجاز کردار مقرر نہیں۔ براہِ کرم مدرسہ انتظامیہ سے رابطہ کریں۔')
        return
      }
      onSignedIn({ user: credential.user, role, madrasaId })
      navigate('/portal')
    } catch {
      setError('لاگ اِن نہیں ہو سکا۔ ای میل اور پاس ورڈ چیک کریں یا منتظم سے رابطہ کریں۔')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-screen">
      <div className="login-decoration decor-one" /><div className="login-decoration decor-two" />
      <div className="login-card">
        <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> ویب سائٹ پر واپس جائیں</button>
        <div className="login-emblem"><ShieldCheck size={31} /></div>
        <p className="eyebrow">SECURE ACCESS</p>
        <h1>محفوظ پورٹل میں خوش آمدید</h1>
        <p className="muted center">Admin، قاری اور والدین اپنے مجاز اکاؤنٹ سے لاگ اِن کریں۔</p>
        {!isFirebaseConfigured && <div className="config-notice"><LockKeyhole size={17} /><span>Firebase کنفیگریشن درکار ہے۔ اس وقت لاگ اِن دستیاب نہیں۔</span></div>}
        <form className="login-form" onSubmit={handleSubmit}>
          <label>ای میل ایڈریس<input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" dir="ltr" /></label>
          <label>پاس ورڈ<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="اپنا پاس ورڈ درج کریں" /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-btn full-btn" type="submit" disabled={busy || !isFirebaseConfigured}>{busy ? 'لاگ اِن ہو رہا ہے…' : 'محفوظ لاگ اِن'} <LogIn size={17} /></button>
        </form>
        <div className="login-foot"><ShieldCheck size={15} /> آپ کا ڈیٹا صرف مجاز صارفین کے لیے ہے۔</div>
      </div>
    </main>
  )
}

function Portal({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const roleNames: Record<UserRole, string> = { admin: 'ایڈمن پورٹل', qari: 'قاری پورٹل', parent: 'والدین پورٹل' }
  const roleItems = session.role === 'admin'
    ? [{ icon: Users, title: 'طلبہ کا ریکارڈ', desc: 'داخلہ، پروفائل اور تعلیمی تاریخ' }, { icon: UserRound, title: 'قراء و اساتذہ', desc: 'اساتذہ کی معلومات اور ذمہ داریاں' }, { icon: CalendarCheck, title: 'حاضری کا نظام', desc: 'روزانہ اور ماہانہ حاضری' }, { icon: BookOpen, title: 'حفظ و ناظرہ', desc: 'تعلیمی پیش رفت اور تکمیل' }, { icon: FileCheck2, title: 'اسناد و رپورٹس', desc: 'محفوظ اسناد اور کارکردگی رپورٹس' }, { icon: Settings, title: 'نظام کی ترتیبات', desc: 'صارفین اور اجازتوں کا انتظام' }]
    : session.role === 'qari'
      ? [{ icon: Users, title: 'میرے طلبہ', desc: 'صرف آپ کو تفویض کردہ طلبہ' }, { icon: CalendarCheck, title: 'حاضری درج کریں', desc: 'اپنی کلاس کی حاضری' }, { icon: BookOpen, title: 'روزانہ سبق', desc: 'سبق، سبقی اور منزل' }, { icon: ChartNoAxesCombined, title: 'تعلیمی پیش رفت', desc: 'طلبہ کی کارکردگی کا جائزہ' }]
      : [{ icon: Users, title: 'میرے بچے', desc: 'صرف تصدیق شدہ بچوں کا ریکارڈ' }, { icon: CalendarCheck, title: 'حاضری', desc: 'حاضری کی تفصیل' }, { icon: BookOpen, title: 'سبق اور کارکردگی', desc: 'منظور شدہ تعلیمی پیش رفت' }, { icon: Megaphone, title: 'اعلانات', desc: 'مدرسے کی اہم معلومات' }]

  return (
    <main className="portal-page">
      <div className="portal-top"><a href="/" className="brand"><span className="brand-mark"><BookOpen size={23} /></span><span className="brand-copy"><strong>MRK Madrasa 58</strong><small>محفوظ انتظامی نظام</small></span></a><button className="outline-btn" onClick={onLogout}><LogOut size={16} /> لاگ آؤٹ</button></div>
      <div className="container portal-content">
        <div className="portal-welcome"><div><p className="eyebrow">MRK MADRASA MANAGEMENT SYSTEM 58</p><h1>{roleNames[session.role ?? 'parent']}</h1><p className="muted">السلام علیکم، {session.user.email}</p></div><div className="portal-badge"><ShieldCheck size={18} /> تصدیق شدہ سیشن</div></div>
        <div className="secure-banner"><LockKeyhole size={19} /><span>آپ کو صرف اپنے کردار اور اجازت کے مطابق معلومات تک رسائی حاصل ہے۔</span></div>
        <div className="portal-grid">{roleItems.map(item => <div className="portal-tile" key={item.title}><span className="tile-icon"><item.icon size={22} /></span><h3>{item.title}</h3><p>{item.desc}</p><span className="coming-label">اگلے مرحلے میں فعال ہوگا <ChevronLeft size={14} /></span></div>)}</div>
        <div className="portal-note"><Clock3 size={18} /><p><strong>ڈیٹا ماڈیولز کی تیاری جاری ہے۔</strong><br />یہ ابتدائی محفوظ پورٹل فریم ورک ہے۔ طلبہ کا حقیقی ریکارڈ شامل کرنے سے پہلے Firebase ڈیٹا بیس، رولز اور ایڈمن اکاؤنٹ کی تصدیق مکمل کرنا ضروری ہے۔</p></div>
      </div>
    </main>
  )
}

function HomePage({ onLogin }: { onLogin: () => void }) {
  return (
    <>
      <Header onLogin={onLogin} />
      <main>
        <section className="hero" id="home">
          <div className="hero-pattern" />
          <div className="container hero-grid">
            <div className="hero-copy">
              <span className="hero-tag"><Sparkles size={15} /> جدید تعلیمی و انتظامی نظام</span>
              <h1>قرآن کی تعلیم،<br /><em>بہتر نظم و نگرانی</em></h1>
              <p>MRK Madrasa Management System 58 — مدرسۃ المدینہ کے تعلیمی، انتظامی اور والدین کے رابطے کے نظام کو ایک محفوظ ڈیجیٹل پلیٹ فارم پر یکجا کرنے کا منصوبہ۔</p>
              <div className="hero-actions"><button className="primary-btn" onClick={onLogin}>پورٹل میں داخل ہوں <ArrowUpLeft size={18} /></button><a className="secondary-btn" href="#about">مزید جانیں <ChevronLeft size={17} /></a></div>
              <div className="hero-trust"><span><ShieldCheck size={16} /> محفوظ رسائی</span><span><Globe2 size={16} /> اردو و انگریزی</span><span><HeartHandshake size={16} /> والدین سے رابطہ</span></div>
            </div>
            <div className="hero-art">
              <div className="art-glow" />
              <div className="arch-frame"><div className="arch-inner"><div className="quran-symbol"><BookOpen size={76} strokeWidth={1.15} /></div><div className="arch-calligraphy">وَقُل رَّبِّ زِدْنِي عِلْمًا</div><div className="arch-translation">اے میرے رب! میرے علم میں اضافہ فرما</div><div className="arch-rule" /><span className="arch-caption">علم • تربیت • رہنمائی</span></div></div>
              <div className="floating-seal seal-top"><CheckCircle2 size={18} /><span>منظم تعلیمی ریکارڈ</span></div>
              <div className="floating-seal seal-bottom"><LockKeyhole size={18} /><span>محفوظ ڈیجیٹل نظام</span></div>
            </div>
          </div>
          <div className="hero-bottom"><span>MRK MADRASA MANAGEMENT SYSTEM</span><span>58 <i>•</i> LOCAL MADRASA</span></div>
        </section>

        <section className="intro-section section-pad" id="about">
          <div className="container intro-grid"><div><p className="eyebrow">OUR PURPOSE</p><h2>مدرسے کے انتظام کو<br /><em>آسان اور مربوط بنائیں</em></h2></div><div className="intro-text"><p>یہ پلیٹ فارم ایک مقامی مدرسۃ المدینہ کے لیے تیار کیا جا رہا ہے، جہاں طلبہ کا تعلیمی ریکارڈ، قراء کی ذمہ داریاں، روزانہ حاضری اور والدین کے لیے ضروری معلومات ایک منظم نظام میں دستیاب ہوں گی۔</p><p className="muted">ابتدائی مقصد کاغذی ریکارڈ کو محفوظ، قابلِ تلاش اور بروقت رپورٹنگ کے قابل بنانا ہے۔</p></div></div>
        </section>

        <section className="program-section section-pad" id="programs">
          <div className="container"><div className="section-heading"><p className="eyebrow">EDUCATION PROGRAMS</p><h2>تعلیمی شعبے</h2><p>مدرسے میں فعال تعلیمی پروگرام انتظامیہ کی ترتیبات کے مطابق درج کیے جا سکیں گے۔</p></div>
            <div className="program-grid">{programs.map((item, index) => <article className="program-card" key={item.title}><span className="program-number">0{index + 1}</span><div className="program-icon"><item.icon size={27} /></div><h3>{item.title}</h3><p>{item.description}</p><span className="card-line" /></article>)}</div>
          </div>
        </section>

        <section className="features-section section-pad" id="features">
          <div className="container"><div className="section-heading"><p className="eyebrow">ONE CONNECTED SYSTEM</p><h2>چار سطحوں پر مربوط سہولت</h2><p>ہر صارف کو صرف اسی نوعیت کی معلومات ملیں گی جس کی اسے اجازت دی گئی ہو۔</p></div>
            <div className="features-grid">
              <div className="feature-card"><span><LayoutDashboard size={23} /></span><div><h3>ایڈمن پورٹل</h3><p>طلبہ، قراء، داخلے، حاضری، اسناد، رپورٹس اور صارفین کا انتظام۔</p></div></div>
              <div className="feature-card"><span><BookOpen size={23} /></span><div><h3>قاری پورٹل</h3><p>مقرر کردہ طلبہ کی حاضری اور سبق، سبقی، منزل کی روزانہ پیش رفت۔</p></div></div>
              <div className="feature-card"><span><Users size={23} /></span><div><h3>والدین پورٹل</h3><p>اپنے تصدیق شدہ بچوں کی حاضری، کارکردگی اور اہم اعلانات۔</p></div></div>
              <div className="feature-card"><span><Globe2 size={23} /></span><div><h3>عوامی ویب سائٹ</h3><p>مدرسے کا تعارف، تعلیمی شعبے، منظور شدہ سرگرمیاں اور رابطہ۔</p></div></div>
            </div>
          </div>
        </section>

        <section className="privacy-band"><div className="container privacy-inner"><div className="privacy-icon"><ShieldCheck size={29} /></div><div><h2>طلبہ کی معلومات، ہماری امانت</h2><p>طلبہ اور والدین کا نجی ریکارڈ عوامی ویب سائٹ سے الگ رکھا جائے گا۔ والدین صرف اپنے تصدیق شدہ بچوں کی معلومات دیکھ سکیں گے۔</p></div><span className="privacy-stamp">PRIVACY<br />FIRST</span></div></section>

        <section className="contact-section section-pad" id="contact"><div className="container contact-grid"><div><p className="eyebrow">GET IN TOUCH</p><h2>رابطہ اور رہنمائی</h2><p className="muted">مدرسے کے تعارف، داخلے یا انتظامی معلومات کے لیے مقامی انتظامیہ سے رابطہ کریں۔</p></div><div className="contact-card"><div><MapPin size={19} /><span>مقامی مدرسۃ المدینہ — تفصیلات منتظم شامل کرے گا</span></div><div><Phone size={19} /><span>رابطہ نمبر ابھی شامل نہیں کیا گیا</span></div><div><Mail size={19} /><span>سرکاری ای میل ابھی شامل نہیں کی گئی</span></div><button className="primary-btn" onClick={onLogin}>مجاز صارف لاگ اِن <LogIn size={17} /></button></div></div></section>
      </main>
      <footer className="site-footer"><div className="container footer-inner"><a href="#home" className="brand"><span className="brand-mark"><BookOpen size={22} /></span><span className="brand-copy"><strong>MRK Madrasa 58</strong><small>علم و تربیت کا ڈیجیٹل سفر</small></span></a><span>© {new Date().getFullYear()} MRK Madrasa Management System 58</span><a href="#home">اوپر جائیں ↑</a></div></footer>
    </>
  )
}

export default function App() {
  const [view, setView] = useState<'home' | 'login'>('home')
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    if (!auth) { setChecking(false); return }
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) { setSession(null); setChecking(false); return }
      try {
        const token = await user.getIdTokenResult()
        const roleValue = token.claims.role
        const role = roleValue === 'admin' || roleValue === 'qari' || roleValue === 'parent' ? roleValue : null
        const madrasaId = typeof token.claims.madrasaId === 'string' ? token.claims.madrasaId : null
        if (role && madrasaId) setSession({ user, role, madrasaId })
        else setSession(null)
      } finally { setChecking(false) }
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (window.location.pathname === '/portal' && !session && !checking) {
      navigate('/login', { replace: true })
      setView('login')
    }
    if (window.location.pathname === '/login') setView('login')
    if (window.location.pathname === '/') setView('home')
  }, [navigate, session, checking])

  async function logout() {
    if (auth) await signOut(auth)
    setSession(null)
    setView('home')
    navigate('/')
  }

  if (checking) return <div className="app-loading"><span className="loader-mark"><BookOpen /></span><p>نظام تیار ہو رہا ہے…</p></div>
  if (session && window.location.pathname === '/portal') return <Portal session={session} onLogout={logout} />
  if (view === 'login' || window.location.pathname === '/login') return <LoginPanel onBack={() => { setView('home'); navigate('/') }} onSignedIn={setSession} />
  return <HomePage onLogin={() => { setView('login'); navigate('/login') }} />
}
