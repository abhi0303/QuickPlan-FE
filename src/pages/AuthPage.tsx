import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FormEvent, KeyboardEvent } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BellRing,
  CalendarCheck,
  Check,
  CircleAlert,
  CircleCheckBig,
  Circle,
  ClipboardList,
  Eye,
  EyeOff,
  Flame,
  IndianRupee,
  ListTodo,
  LoaderCircle,
  Mic,
  NotebookPen,
  PenLine,
  ShieldCheck,
  Sparkles,
  SquareCheckBig,
  StickyNote,
  TriangleAlert,
  Wallet,
} from 'lucide-react'
import { getApiErrorMessage } from '../services/api'
import { login, register } from '../services/auth'
import { useAppStore } from '../store/useAppStore'
import './AuthPage.scss'

type Mode = 'login' | 'signup'
type Field = 'name' | 'email' | 'password' | 'confirmPassword'

const PASSWORD_MIN_LENGTH = 8
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong']

/* Decorative notes/tasks drifting behind the page. Positions are hand-placed
   to stay clear of the headline and the form card. */
const FLOATERS = [
  { Icon: StickyNote, accent: '', left: '4%', top: '14%', size: 58, dur: 17, delay: 0, rot: -8 },
  { Icon: SquareCheckBig, accent: 'periwinkle', left: '13%', top: '68%', size: 48, dur: 21, delay: -3, rot: 7 },
  { Icon: ListTodo, accent: '', left: '31%', top: '88%', size: 52, dur: 19, delay: -7, rot: 5 },
  { Icon: CalendarCheck, accent: 'tangerine', left: '46%', top: '9%', size: 46, dur: 23, delay: -5, rot: -6 },
  { Icon: NotebookPen, accent: '', left: '62%', top: '78%', size: 54, dur: 18, delay: -2, rot: 9 },
  { Icon: ClipboardList, accent: 'periwinkle', left: '88%', top: '22%', size: 50, dur: 22, delay: -9, rot: -5 },
  { Icon: BellRing, accent: 'tangerine', left: '93%', top: '62%', size: 44, dur: 20, delay: -4, rot: 8 },
  { Icon: PenLine, accent: '', left: '76%', top: '40%', size: 42, dur: 24, delay: -11, rot: -9 },
]

const HEADLINE_WORDS = ['planned.', 'sorted.', 'on track.']
const WORD_INTERVAL_MS = 2400

function passwordChecks(password: string) {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH,
    letter: /[a-zA-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^a-zA-Z0-9]/.test(password),
  }
}

function passwordScore(password: string) {
  if (!password) return 0
  const checks = passwordChecks(password)
  const met = Object.values(checks).filter(Boolean).length
  // a long password that ticks everything reads as strong; short ones cap at fair
  if (!checks.length) return Math.min(met, 2)
  return Math.max(1, met)
}

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [values, setValues] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({})
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)
  const [wordIndex, setWordIndex] = useState(0)
  const signIn = useAppStore((state) => state.signIn)
  const navigate = useNavigate()

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => {
      setWordIndex((current) => (current + 1) % HEADLINE_WORDS.length)
    }, WORD_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  const isSignup = mode === 'signup'
  const checks = passwordChecks(values.password)
  const score = passwordScore(values.password)

  const errors = useMemo(() => {
    const next: Partial<Record<Field, string>> = {}
    if (isSignup && values.name.trim().length < 2) next.name = 'Please enter your name (at least 2 characters).'
    if (!values.email.trim()) next.email = 'Email address is required.'
    else if (!EMAIL_PATTERN.test(values.email.trim())) next.email = 'That does not look like a valid email address.'
    if (!values.password) next.password = 'Password is required.'
    else if (values.password.length < PASSWORD_MIN_LENGTH) next.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`
    if (isSignup && values.confirmPassword !== values.password) next.confirmPassword = 'Both passwords need to match.'
    return next
  }, [isSignup, values])

  function setValue(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setServerError('')
  }

  function markTouched(field: Field) {
    setTouched((current) => ({ ...current, [field]: true }))
  }

  /** Only nag once the user has left the field (or tried to submit). */
  function errorFor(field: Field) {
    return touched[field] ? errors[field] : undefined
  }

  function switchMode(next: Mode) {
    if (next === mode) return
    setMode(next)
    setTouched({})
    setServerError('')
    setCapsLock(false)
    setShowPassword(false)
    // keep name/email so switching tabs never costs the user typing
    setValues((current) => ({ ...current, password: '', confirmPassword: '' }))
  }

  function trackCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState?.('CapsLock') ?? false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const fields: Field[] = isSignup ? ['name', 'email', 'password', 'confirmPassword'] : ['email', 'password']
    setTouched(Object.fromEntries(fields.map((field) => [field, true])))

    const firstInvalid = fields.find((field) => errors[field])
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus()
      return
    }

    setServerError('')
    setLoading(true)
    try {
      const session = isSignup
        ? await register({ name: values.name.trim(), email: values.email.trim(), password: values.password })
        : await login({ email: values.email.trim(), password: values.password })
      signIn(session)
      toast.success(isSignup ? `Welcome to Quickplan, ${session.name}!` : `Welcome back, ${session.name}!`)
      navigate('/', { replace: true })
    } catch (submitError) {
      setServerError(getApiErrorMessage(submitError, 'Unable to continue right now. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  const confirmMatches = isSignup && values.confirmPassword.length > 0 && values.confirmPassword === values.password

  return (
    <main className="auth-page">
      <div className="auth-bg" aria-hidden="true">
        {FLOATERS.map(({ Icon, accent, left, top, size, dur, delay, rot }, index) => (
          <span
            key={index}
            className={`floater ${accent}`}
            style={{
              left,
              top,
              '--size': `${size}px`,
              '--dur': `${dur}s`,
              '--delay': `${delay}s`,
              '--rot': `${rot}deg`,
            } as CSSProperties}
          >
            <Icon size={Math.round(size * 0.8)} strokeWidth={1.6} />
          </span>
        ))}
      </div>

      <div className="brand">
        <span className="brand-mark"><Sparkles size={19} strokeWidth={2.4} /></span>
        <span>Quickplan</span>
      </div>

      <div className="auth-layout">
        <section className="auth-intro">
          <p className="eyebrow">A calmer way to get things done</p>
          <h1>
            Your day,{' '}
            <span className="word-rotator">
              {HEADLINE_WORDS.map((word, index) => (
                <em key={word} className={index === wordIndex ? 'is-active' : ''}>{word}</em>
              ))}
            </span>
          </h1>
          <p className="auth-copy">
            Capture tasks, reminders, and money notes in one simple space. Type it, say it, and Quickplan will help
            organize the rest.
          </p>

          <div className="auth-chips">
            <span className="auth-chip"><Mic size={15} /> Hindi, English & Hinglish</span>
            <span className="auth-chip tangerine"><Wallet size={15} /> Split expenses</span>
            <span className="auth-chip periwinkle"><ShieldCheck size={15} /> Private by default</span>
          </div>

          {/* decorative product preview — purely visual, hidden from screen readers */}
          <div className="auth-visual" aria-hidden="true">
            <div className="preview-card">
              <div className="preview-head">
                <strong>Today</strong>
                <span className="preview-pill">4 tasks</span>
              </div>

              <div className="preview-row done">
                <i><Check size={12} strokeWidth={3.5} /></i>
                <span>Morning walk</span>
              </div>
              <div className="preview-row done">
                <i><Check size={12} strokeWidth={3.5} /></i>
                <span>Pay electricity bill</span>
              </div>
              <div className="preview-row">
                <i />
                <span>Call Rahul at 5:00 PM</span>
              </div>
              <div className="preview-row">
                <i />
                <span>Pick up groceries</span>
              </div>

              <div className="preview-progress">
                <span className="bar"><i /></span>
                <small>3 of 4 done — nearly there</small>
              </div>
            </div>

            <span className="preview-chip chip-streak"><Flame size={14} /> 5 day streak</span>
            <span className="preview-chip chip-money"><IndianRupee size={14} /> ₹2,450 to settle</span>
          </div>
        </section>

        <section className="auth-card">
          <div className="auth-tabs" role="tablist" aria-label="Sign in or create an account">
            <button type="button" role="tab" aria-selected={!isSignup} className={!isSignup ? 'active' : ''} onClick={() => switchMode('login')}>
              Sign in
            </button>
            <button type="button" role="tab" aria-selected={isSignup} className={isSignup ? 'active' : ''} onClick={() => switchMode('signup')}>
              Create account
            </button>
          </div>

          <div className="auth-card-heading">
            <h2>{isSignup ? 'Create your account' : 'Welcome back'}</h2>
            <p className="muted">
              {isSignup ? 'Your personal planning space is one step away.' : 'Pick up right where you left off.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            {isSignup && (
              <label htmlFor="name">
                Your name
                <input
                  id="name"
                  className={errorFor('name') ? 'invalid' : ''}
                  value={values.name}
                  onChange={(event) => setValue('name', event.target.value)}
                  onBlur={() => markTouched('name')}
                  placeholder="Abhishek Sharma"
                  autoComplete="name"
                  aria-invalid={Boolean(errorFor('name'))}
                  disabled={loading}
                />
                {errorFor('name') && <span className="field-error"><CircleAlert size={13} /> {errorFor('name')}</span>}
              </label>
            )}

            <label htmlFor="email">
              Email address
              <input
                id="email"
                type="email"
                inputMode="email"
                className={errorFor('email') ? 'invalid' : ''}
                value={values.email}
                onChange={(event) => setValue('email', event.target.value)}
                onBlur={() => markTouched('email')}
                placeholder="you@example.com"
                autoComplete="email"
                aria-invalid={Boolean(errorFor('email'))}
                disabled={loading}
              />
              {errorFor('email') && <span className="field-error"><CircleAlert size={13} /> {errorFor('email')}</span>}
            </label>

            <label htmlFor="password">
              <span className="field-top">
                Password
                {isSignup && <span className="field-hint">{PASSWORD_MIN_LENGTH}+ characters</span>}
              </span>
              <span className="input-with-action">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className={errorFor('password') ? 'invalid' : ''}
                  value={values.password}
                  onChange={(event) => setValue('password', event.target.value)}
                  onBlur={() => markTouched('password')}
                  onKeyUp={trackCapsLock}
                  placeholder={isSignup ? 'Create a password' : 'Enter your password'}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  aria-invalid={Boolean(errorFor('password'))}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="input-action"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>

              {capsLock && <span className="caps-hint"><TriangleAlert size={13} /> Caps Lock is on</span>}
              {errorFor('password') && <span className="field-error"><CircleAlert size={13} /> {errorFor('password')}</span>}

              {isSignup && values.password.length > 0 && (
                <span className="strength" data-level={score}>
                  <span className="strength-bars">
                    {[1, 2, 3, 4].map((step) => <i key={step} className={step <= score ? 'on' : ''} />)}
                  </span>
                  <span className="strength-label">{STRENGTH_LABELS[score]} password</span>
                </span>
              )}

              {isSignup && (
                <span className="req-list">
                  <span className={`req ${checks.length ? 'met' : ''}`}>
                    {checks.length ? <CircleCheckBig size={13} /> : <Circle size={13} />} {PASSWORD_MIN_LENGTH}+ characters
                  </span>
                  <span className={`req ${checks.letter ? 'met' : ''}`}>
                    {checks.letter ? <CircleCheckBig size={13} /> : <Circle size={13} />} A letter
                  </span>
                  <span className={`req ${checks.number ? 'met' : ''}`}>
                    {checks.number ? <CircleCheckBig size={13} /> : <Circle size={13} />} A number
                  </span>
                  <span className={`req ${checks.symbol ? 'met' : ''}`}>
                    {checks.symbol ? <CircleCheckBig size={13} /> : <Circle size={13} />} A symbol
                  </span>
                </span>
              )}
            </label>

            {isSignup && (
              <label htmlFor="confirmPassword">
                Confirm password
                <span className="input-with-action">
                  <input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    className={`${errorFor('confirmPassword') ? 'invalid' : ''} ${confirmMatches ? 'has-check' : ''}`}
                    value={values.confirmPassword}
                    onChange={(event) => setValue('confirmPassword', event.target.value)}
                    onBlur={() => markTouched('confirmPassword')}
                    onKeyUp={trackCapsLock}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    aria-invalid={Boolean(errorFor('confirmPassword'))}
                    disabled={loading}
                  />
                  {confirmMatches && (
                    <span className="input-ok" aria-label="Passwords match"><Check size={17} strokeWidth={3} /></span>
                  )}
                  <button
                    type="button"
                    className="input-action"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
                {errorFor('confirmPassword') && (
                  <span className="field-error"><CircleAlert size={13} /> {errorFor('confirmPassword')}</span>
                )}
              </label>
            )}

            {serverError && (
              <p className="form-error" role="alert">
                <CircleAlert size={16} />
                {serverError}
              </p>
            )}

            <button className="auth-submit" disabled={loading}>
              {loading ? (
                <><LoaderCircle size={18} className="spin" /> {isSignup ? 'Creating your account...' : 'Signing you in...'}</>
              ) : (
                <>{isSignup ? 'Create account' : 'Sign in'} <ArrowRight size={18} /></>
              )}
            </button>
          </form>

          <p className="auth-terms">
            <ShieldCheck size={14} />
            Your planning space stays personal and private.
          </p>
        </section>
      </div>
    </main>
  )
}
