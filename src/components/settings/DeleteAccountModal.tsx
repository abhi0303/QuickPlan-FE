import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { CircleAlert, LoaderCircle, Trash2, TriangleAlert, X } from 'lucide-react'
import { getApiErrorMessage } from '../../services/api'
import { deleteAccount } from '../../services/auth'
import { useAppStore } from '../../store/useAppStore'
import './DeleteAccountModal.scss'

/**
 * Closing the account.
 *
 * The copy has to be honest that this is not a full erasure: personal records
 * go, but group expenses and settlements stay, with the person shown as
 * "Removed user". Deleting those would silently rewrite what other people are
 * owed — a stranger's debt changing without them touching anything is worse for
 * them than a row with no name on it.
 *
 * Somebody expecting their share of the trip to vanish should learn that before
 * they tap, not after.
 */
export function DeleteAccountModal({ open, onClose }: { open: boolean, onClose: () => void }) {
  if (!open) return null
  return <DeleteAccountDialog onClose={onClose} />
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)
  const signOut = useAppStore((state) => state.signOut)

  useEffect(() => {
    passwordRef.current?.focus()
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!password) return setError('Enter your password to confirm.')

    setBusy(true)
    setError('')
    try {
      await deleteAccount(password)
      /* The token is dead the moment that returns, so this is a sign-out
         rather than a response to act on. */
      onClose()
      signOut()
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, 'Could not delete the account. Please try again.'))
      setBusy(false)
    }
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal delete-modal is-framed" role="dialog" aria-modal="true"
        aria-labelledby="delete-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 id="delete-title">Delete your account</h2>
            <p className="muted">This cannot be undone.</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="delete-what">
              <p className="delete-goes"><strong>What goes</strong></p>
              <p>
                Your tasks, reminders, personal expenses, budgets, plans and recurring
                schedules. Your friendships. Your name and email. Every signed-in device.
              </p>

              <p className="delete-stays"><TriangleAlert size={15} /> <strong>What stays</strong></p>
              <p>
                Expenses and settlements inside your groups remain, shown against
                <strong> “Removed user”</strong>. What other people owe each other does not
                change. We keep them because removing them would rewrite the balances of
                people who had no say in this.
              </p>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="delete-password">Your password</label>
              <input
                id="delete-password" ref={passwordRef} className="control" type="password"
                autoComplete="current-password" value={password} disabled={busy}
                onChange={(event) => { setPassword(event.target.value); setError('') }}
              />
              <p className="field-hint">Asked for because this cannot be undone.</p>
            </div>

            {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}
          </div>

          <footer className="modal-actions">
            <button type="button" className="voice-ghost" onClick={onClose} disabled={busy}>Keep my account</button>
            <button className="modal-submit is-danger" disabled={busy}>
              {busy
                ? <><LoaderCircle size={18} className="spin" /> Deleting...</>
                : <><Trash2 size={17} /> Delete for good</>}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  )
}
