import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowRight, CircleAlert, Eye, EyeOff, LoaderCircle, Sparkles } from 'lucide-react'
import { getApiErrorMessage, getApiStatus, getRetryAfterSeconds } from '../services/api'
import { resetPassword } from '../services/auth'
import { useAppStore } from '../store/useAppStore'
import { useCountdown } from '../hooks/useCountdown'
import { PASSWORD_MIN_LENGTH, STRENGTH_LABELS, passwordScore } from '../utils/password'
import './AuthPage.scss'

/**
 * Where the reset link in the email lands. Reached signed out, and sometimes
 * signed in — on a device whose token this reset is about to kill — so it sits
 * outside the guard and signs that session out on the way past.
 */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  // captured once: the token is stripped from the address bar on mount
  const [token] = useState(() => searchParams.get('token'))
  const [values, setValues] = useState({ password: '', confirmPassword: '' })
  const [touched, setTouched] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState('')
  const [saving, setSaving] = useState(false)
  const [lockout, startLockout] = useCountdown()
  const navigate = useNavigate()
  const signOut = useAppStore((state) => state.signOut)

  useEffect(() => {
    /* A live reset token in the address bar is a password waiting to be
       screenshotted. It has been read into state already. */
    if (token) window.history.replaceState(null, '', window.location.pathname)
  }, [token])

  const score = passwordScore(values.password)

  const errors = useMemo(() => {
    const next: { password?: string; confirmPassword?: string } = {}
    if (!values.password) next.password = 'Choose a new password.'
    else if (values.password.length < PASSWORD_MIN_LENGTH) next.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`
    if (values.confirmPassword !== values.password) next.confirmPassword = 'Both passwords need to match.'
    return next
  }, [values])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTouched(true)
    if (!token || errors.password || errors.confirmPassword) return

    setServerError('')
    setSaving(true)
    try {
      const message = await resetPassword({ token, password: values.password })
      /* Every token issued before now is dead, this device's included, so the
         stored one is cleared here rather than left to fail on the next call. */
      signOut()
      toast.success(message)
      navigate('/auth', { replace: true })
    } catch (submitError) {
      if (getApiStatus(submitError) === 429) startLockout(getRetryAfterSeconds(submitError, 900))
      setServerError(getApiErrorMessage(submitError, 'This reset link is invalid or has expired. Request a new one.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="brand">
        <span className="brand-mark"><Sparkles size={19} strokeWidth={2.4} /></span>
        <span>Quickplan</span>
      </div>

      <div className="auth-layout is-single">
        <section className="auth-card">
          <div className="auth-card-heading">
            <h2>Choose a new password</h2>
            <p className="muted">You will be asked to sign in with it straight after.</p>
          </div>

          {token ? (
            <form onSubmit={handleSubmit} noValidate>
              <label htmlFor="password">
                <span className="field-top">
                  New password
                  <span className="field-hint">{PASSWORD_MIN_LENGTH}+ characters</span>
                </span>
                <span className="input-with-action">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className={touched && errors.password ? 'invalid' : ''}
                    value={values.password}
                    onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))}
                    autoComplete="new-password"
                    disabled={saving}
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
                {touched && errors.password && (
                  <span className="field-error"><CircleAlert size={13} /> {errors.password}</span>
                )}
                {values.password.length > 0 && (
                  <span className="strength" data-level={score}>
                    <span className="strength-bars">
                      {[1, 2, 3, 4].map((step) => <i key={step} className={step <= score ? 'on' : ''} />)}
                    </span>
                    <span className="strength-label">{STRENGTH_LABELS[score]} password</span>
                  </span>
                )}
              </label>

              <label htmlFor="confirmPassword">
                Confirm new password
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  className={touched && errors.confirmPassword ? 'invalid' : ''}
                  value={values.confirmPassword}
                  onChange={(event) => setValues((current) => ({ ...current, confirmPassword: event.target.value }))}
                  autoComplete="new-password"
                  disabled={saving}
                />
                {touched && errors.confirmPassword && (
                  <span className="field-error"><CircleAlert size={13} /> {errors.confirmPassword}</span>
                )}
              </label>

              {serverError && (
                <p className="form-error" role="alert">
                  <CircleAlert size={16} />
                  {serverError}
                </p>
              )}

              <button className="auth-submit" disabled={saving || lockout > 0}>
                {saving ? (
                  <><LoaderCircle size={18} className="spin" /> Saving your password...</>
                ) : lockout > 0 ? (
                  <>Try again in {lockout}s</>
                ) : (
                  <>Save new password <ArrowRight size={18} /></>
                )}
              </button>

              <Link className="text-button auth-back" to="/auth">Back to sign in</Link>
            </form>
          ) : (
            <div className="auth-notice">
              <span className="auth-notice-mark is-warn"><CircleAlert size={26} /></span>
              <p>That link is missing its code. Open the most recent email, or ask for a new link from the sign-in screen.</p>
              <Link className="auth-submit" to="/auth">Back to sign in</Link>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
