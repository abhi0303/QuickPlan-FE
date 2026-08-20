import { useState } from 'react'
import type { FormEvent } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { getApiErrorMessage } from '../services/api'
import { login, register } from '../services/auth'
import { useAppStore } from '../store/useAppStore'

type Mode = 'login' | 'signup'

const PASSWORD_MIN_LENGTH = 8

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const signIn = useAppStore((state) => state.signIn)
  const navigate = useNavigate()

  const isSignup = mode === 'signup'

  function switchMode(next: Mode) {
    setMode(next)
    setError('')
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
  }

  function validate() {
    if (isSignup && name.trim().length < 2) return 'Please enter your name.'
    if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`
    if (isSignup && password !== confirmPassword) return 'Both passwords need to match.'
    return ''
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setLoading(true)
    try {
      const session = isSignup
        ? await register({ name: name.trim(), email: email.trim(), password })
        : await login({ email: email.trim(), password })
      signIn(session)
      toast.success(isSignup ? `Welcome to Quickplan, ${session.name}!` : `Welcome back, ${session.name}!`)
      navigate('/', { replace: true })
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, 'Unable to continue right now. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-brand"><span className="brand-mark">✦</span><span>quickplan</span></div>
      <div className="auth-layout">
        <section className="auth-intro">
          <p className="eyebrow">A calmer way to get things done</p>
          <h1>Your day,<br /><em>thoughtfully planned.</em></h1>
          <p className="auth-copy">Capture tasks, reminders, and money notes in one simple space. Type it, say it, and Quickplan will help organize the rest.</p>
          <div className="auth-proof"><span className="proof-avatars"><i>A</i><i>R</i><i>N</i></span><span>Built for everyday momentum</span></div>
        </section>

        <section className="auth-card">
          <div className="auth-card-heading">
            <p className="eyebrow">{isSignup ? 'Get started' : 'Welcome back'}</p>
            <h2>{isSignup ? 'Create your account' : 'Sign in to Quickplan'}</h2>
            <p className="muted">{isSignup ? 'Your personal planning space is one step away.' : 'Pick up right where you left off.'}</p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            {isSignup && (
              <label>Your name
                <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Abhishek Sharma" autoComplete="name" disabled={loading} />
              </label>
            )}

            <label>Email address
              <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" disabled={loading} />
            </label>

            <label>Password
              <span className="input-with-action">
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={isSignup ? `At least ${PASSWORD_MIN_LENGTH} characters` : '••••••••'}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  minLength={PASSWORD_MIN_LENGTH}
                  disabled={loading}
                />
                <button type="button" className="input-action" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  <span className="material-symbols-outlined">{showPassword ? 'visibility_off' : 'visibility'}</span>
                </button>
              </span>
            </label>

            {isSignup && (
              <label>Confirm password
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  disabled={loading}
                />
              </label>
            )}

            {error && <p className="form-error" role="alert">{error}</p>}

            <button className="auth-submit" disabled={loading}>
              {loading ? 'Please wait...' : isSignup ? 'Create account' : 'Continue to Quickplan'}
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </form>

          <div className="auth-switch">
            {isSignup ? <>Already have an account? <button type="button" onClick={() => switchMode('login')}>Sign in</button></>
              : <>New to Quickplan? <button type="button" onClick={() => switchMode('signup')}>Create an account</button></>}
          </div>

          <p className="auth-terms">By continuing, you agree to keep your planning space personal and private.</p>
        </section>
      </div>
    </main>
  )
}
