import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CircleAlert, LoaderCircle, MailCheck, Send, Sparkles } from 'lucide-react'
import { getApiErrorMessage, getApiStatus, getRetryAfterSeconds } from '../services/api'
import { RESEND_COOLDOWN_SECONDS, RESEND_SENT_MESSAGE, resendVerification, verifyEmail } from '../services/auth'
import { useCountdown } from '../hooks/useCountdown'
import './AuthPage.scss'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Where the confirmation link in the email lands. Reached signed out, so it
 * sits outside the guard — and reached by people who clicked the same link
 * twice, which the server treats as a success rather than an error.
 */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  // captured once: the token is stripped from the address bar on mount, and
  // the request still needs it after that
  const [token] = useState(() => searchParams.get('token'))
  const [state, setState] = useState<'working' | 'done' | 'failed'>(token ? 'working' : 'failed')
  const [message, setMessage] = useState(
    token ? '' : 'That link is missing its code. Open the most recent email, or ask for a new link below.',
  )
  const [email, setEmail] = useState('')
  const [resendWait, startResendWait] = useCountdown()
  const started = useRef(false)

  useEffect(() => {
    if (!token || started.current) return
    started.current = true

    /* A live token in the address bar is a credential waiting to be
       screenshotted or pasted into a chat. It has been read already, so it can
       go before the request even answers. */
    window.history.replaceState(null, '', window.location.pathname)

    verifyEmail(token)
      .then((text) => {
        setState('done')
        setMessage(text)
      })
      .catch((error) => {
        setState('failed')
        setMessage(getApiErrorMessage(error, 'This confirmation link is invalid or has expired. Ask for a new one.'))
      })
  }, [token])

  async function handleResend() {
    if (resendWait > 0 || !EMAIL_PATTERN.test(email.trim())) return
    startResendWait(RESEND_COOLDOWN_SECONDS)
    try {
      await resendVerification(email.trim())
      toast.success(RESEND_SENT_MESSAGE)
    } catch (resendError) {
      if (getApiStatus(resendError) === 429) startResendWait(getRetryAfterSeconds(resendError, 900))
      setMessage(getApiErrorMessage(resendError, 'Could not send that link right now. Please try again.'))
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
            <h2>
              {state === 'working' ? 'Confirming your email' : state === 'done' ? 'Email confirmed' : 'That link did not work'}
            </h2>
          </div>

          <div className="auth-notice">
            {state === 'working' && (
              <>
                <span className="auth-notice-mark"><LoaderCircle size={26} className="spin" /></span>
                <p>One moment.</p>
              </>
            )}

            {state === 'done' && (
              <>
                <span className="auth-notice-mark"><MailCheck size={26} /></span>
                <p>{message}</p>
                <Link className="auth-submit" to="/auth">Go to sign in</Link>
              </>
            )}

            {state === 'failed' && (
              <>
                <span className="auth-notice-mark is-warn"><CircleAlert size={26} /></span>
                <p>{message}</p>

                <label className="auth-inline-field" htmlFor="resend-email">
                  Your email address
                  <input
                    id="resend-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>

                <button
                  type="button"
                  className="auth-submit"
                  onClick={handleResend}
                  disabled={resendWait > 0 || !EMAIL_PATTERN.test(email.trim())}
                >
                  <Send size={17} /> {resendWait > 0 ? `Send again in ${resendWait}s` : 'Send a new link'}
                </button>
                <Link className="text-button auth-back" to="/auth">Back to sign in</Link>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
