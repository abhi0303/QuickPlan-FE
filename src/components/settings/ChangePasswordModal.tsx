import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import {
  Check, Circle, CircleAlert, CircleCheckBig, Eye, EyeOff, KeyRound, LoaderCircle, TriangleAlert, X,
} from 'lucide-react'
import { getApiErrorMessage } from '../../services/api'
import { changePassword } from '../../services/auth'
import { PASSWORD_MIN_LENGTH, STRENGTH_LABELS, passwordChecks, passwordScore } from '../../utils/password'
import './ChangePasswordModal.scss'

/**
 * Changing the password from Settings.
 *
 * The same reveal toggle, strength meter and rule list as sign-up, so a
 * password that was good enough to open the account is judged the same way
 * when it is replaced.
 */

type Field = 'currentPassword' | 'password' | 'confirmPassword'

type Props = {
  open: boolean
  onClose: () => void
}

export function ChangePasswordModal({ open, onClose }: Props) {
  // remounted per opening, so a half-typed password is never left in memory
  // behind a closed dialog
  if (!open) return null
  return <ChangePasswordDialog onClose={onClose} />
}

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [values, setValues] = useState({ currentPassword: '', password: '', confirmPassword: '' })
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({})
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [serverError, setServerError] = useState('')
  const [saving, setSaving] = useState(false)
  const currentRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    currentRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const checks = passwordChecks(values.password)
  const score = passwordScore(values.password)

  const errors = useMemo(() => {
    const next: Partial<Record<Field, string>> = {}
    if (!values.currentPassword) next.currentPassword = 'Enter the password you use today.'
    if (!values.password) next.password = 'Choose a new password.'
    else if (values.password.length < PASSWORD_MIN_LENGTH) next.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`
    else if (values.password === values.currentPassword) next.password = 'Your new password needs to be different from the current one.'
    if (values.confirmPassword !== values.password) next.confirmPassword = 'Both passwords need to match.'
    return next
  }, [values])

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

  function trackCapsLock(event: ReactKeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState?.('CapsLock') ?? false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const fields: Field[] = ['currentPassword', 'password', 'confirmPassword']
    setTouched(Object.fromEntries(fields.map((field) => [field, true])))

    const firstInvalid = fields.find((field) => errors[field])
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus()
      return
    }

    setServerError('')
    setSaving(true)
    try {
      await changePassword({ currentPassword: values.currentPassword, password: values.password })
      toast.success('Your password has been changed.')
      onClose()
    } catch (submitError) {
      setServerError(getApiErrorMessage(submitError, 'Could not change your password. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const confirmMatches = values.confirmPassword.length > 0 && values.confirmPassword === values.password
  const reveal = showPassword ? 'text' : 'password'

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal change-password-modal is-framed"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2 id="change-password-title">Change your password</h2>
            <p className="muted">Confirm the password you use now, then choose the one you want instead.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            <div className="field">
              <label className="field-label" htmlFor="currentPassword">Current password</label>
              <span className="input-with-action">
                <input
                  id="currentPassword"
                  ref={currentRef}
                  type={reveal}
                  className={`control ${errorFor('currentPassword') ? 'invalid' : ''}`}
                  value={values.currentPassword}
                  onChange={(event) => setValue('currentPassword', event.target.value)}
                  onBlur={() => markTouched('currentPassword')}
                  onKeyUp={trackCapsLock}
                  placeholder="Enter your current password"
                  autoComplete="current-password"
                  aria-invalid={Boolean(errorFor('currentPassword'))}
                  disabled={saving}
                />
                <button
                  type="button"
                  className="input-action"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
              {errorFor('currentPassword') && (
                <span className="field-error"><CircleAlert size={13} /> {errorFor('currentPassword')}</span>
              )}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="password">New password</label>
              <span className="input-with-action">
                <input
                  id="password"
                  type={reveal}
                  className={`control ${errorFor('password') ? 'invalid' : ''}`}
                  value={values.password}
                  onChange={(event) => setValue('password', event.target.value)}
                  onBlur={() => markTouched('password')}
                  onKeyUp={trackCapsLock}
                  placeholder="Create a new password"
                  autoComplete="new-password"
                  aria-invalid={Boolean(errorFor('password'))}
                  disabled={saving}
                />
                <button
                  type="button"
                  className="input-action"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
              {errorFor('password') && <span className="field-error"><CircleAlert size={13} /> {errorFor('password')}</span>}

              {values.password.length > 0 && (
                <span className="strength" data-level={score}>
                  <span className="strength-bars">
                    {[1, 2, 3, 4].map((step) => <i key={step} className={step <= score ? 'on' : ''} />)}
                  </span>
                  <span className="strength-label">{STRENGTH_LABELS[score]} password</span>
                </span>
              )}

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
            </div>

            <div className="field">
              <label className="field-label" htmlFor="confirmPassword">Confirm new password</label>
              <span className="input-with-action">
                <input
                  id="confirmPassword"
                  type={reveal}
                  className={`control ${errorFor('confirmPassword') ? 'invalid' : ''} ${confirmMatches ? 'has-check' : ''}`}
                  value={values.confirmPassword}
                  onChange={(event) => setValue('confirmPassword', event.target.value)}
                  onBlur={() => markTouched('confirmPassword')}
                  onKeyUp={trackCapsLock}
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                  aria-invalid={Boolean(errorFor('confirmPassword'))}
                  disabled={saving}
                />
                {confirmMatches && (
                  <span className="input-ok" aria-label="Passwords match"><Check size={17} strokeWidth={3} /></span>
                )}
                <button
                  type="button"
                  className="input-action"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
              {errorFor('confirmPassword') && (
                <span className="field-error"><CircleAlert size={13} /> {errorFor('confirmPassword')}</span>
              )}
            </div>

            {capsLock && <span className="caps-hint"><TriangleAlert size={13} /> Caps Lock is on</span>}

            {serverError && <p className="form-error" role="alert"><CircleAlert size={16} /> {serverError}</p>}
          </div>

          <footer className="modal-actions">
            <button type="button" className="voice-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="modal-submit" disabled={saving}>
              {saving
                ? <><LoaderCircle size={18} className="spin" /> Changing...</>
                : <><KeyRound size={18} /> Change password</>}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  )
}
