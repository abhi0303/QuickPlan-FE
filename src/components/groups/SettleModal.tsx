import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { format } from 'date-fns'
import { createPortal } from 'react-dom'
import { CalendarDays, CircleAlert, Clock3, HandCoins, IndianRupee, LoaderCircle, X } from 'lucide-react'
import { avatarStyle } from '../../utils/avatar'
import type { CreateSettlementPayload } from '../../services/expenses'
import './SettleModal.scss'

/**
 * Recording a payment to somebody in the group.
 *
 * The amount is editable, which is the whole point: owing two people ₹60,600
 * between four expenses does not mean you pay it in one go. A settlement is a
 * payment between two people, not a flag on an expense — so paying off one
 * expense is really "pay them what my share of it was", and the note is what
 * makes that legible later.
 */

const money = (value: number) => `₹${value.toFixed(2)}`

export type SettleSeed = {
  toUserId: string
  toName: string
  /** Prefilled amount — one expense's share, or everything owed. */
  amount: number
  /** What the whole balance with this person is, for the "everything" shortcut. */
  owed: number
  note?: string
}

type Props = {
  seed: SettleSeed | null
  busy?: boolean
  onClose: () => void
  onConfirm: (payload: CreateSettlementPayload) => void
}

export function SettleModal({ seed, busy, onClose, onConfirm }: Props) {
  if (!seed) return null
  return <SettleDialog key={`${seed.toUserId}-${seed.note ?? ''}`} seed={seed} busy={busy} onClose={onClose} onConfirm={onConfirm} />
}

function SettleDialog({ seed, busy, onClose, onConfirm }: Props & { seed: SettleSeed }) {
  const [amount, setAmount] = useState(String(seed.amount.toFixed(2)))
  const [note, setNote] = useState(seed.note ?? '')
  const [day, setDay] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [time, setTime] = useState(format(new Date(), 'HH:mm'))
  const [error, setError] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    amountRef.current?.select()
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

  const value = Number(amount) || 0
  const leftOver = seed.owed - value

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (value <= 0) return setError('Enter an amount greater than zero.')

    const at = day ? new Date(`${day}T${time || '12:00'}`) : null
    onConfirm({
      toUserId: seed.toUserId,
      amount: value,
      note: note.trim() || undefined,
      settledAt: at && !Number.isNaN(at.getTime()) ? at.toISOString() : undefined,
    })
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal settle-modal" role="dialog" aria-modal="true" aria-labelledby="settle-title"
        onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 id="settle-title">Record a payment</h2>
            <p className="muted">Pay off part of what you owe, or all of it.</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="settle-who">
          <span className="friend-avatar" style={avatarStyle(seed.toName)}>
            {seed.toName.charAt(0).toUpperCase()}
          </span>
          <div>
            <strong>Paying {seed.toName}</strong>
            <small>
              {seed.owed > 0.005
                ? `You owe them ${money(seed.owed)} in this group`
                : 'Your balance with them is already square'}
            </small>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="settle-amount">How much are you paying?</label>
            <span className="control adorned">
              <IndianRupee size={17} />
              <input id="settle-amount" ref={amountRef} type="number" min="0" step="any" inputMode="decimal"
                value={amount} onChange={(e) => { setAmount(e.target.value); setError('') }}
                disabled={busy} />
            </span>

            {seed.owed > 0.005 && (
              <div className="chip-row">
                {Math.abs(seed.amount - seed.owed) > 0.005 && (
                  <button type="button" className="chip" disabled={busy}
                    onClick={() => setAmount(seed.amount.toFixed(2))}>
                    This expense · {money(seed.amount)}
                  </button>
                )}
                <button type="button" className="chip" disabled={busy}
                  onClick={() => setAmount(seed.owed.toFixed(2))}>
                  Everything · {money(seed.owed)}
                </button>
              </div>
            )}

            {/* A part payment is the normal case here, so say what is left
                rather than treating it as an error. */}
            {value > 0 && seed.owed > 0.005 && (
              <p className="field-hint">
                {leftOver > 0.005
                  ? `${money(leftOver)} would still be owed after this.`
                  : leftOver < -0.005
                    ? `That is ${money(-leftOver)} more than you owe them — they would owe you the difference.`
                    : 'That clears what you owe them.'}
              </p>
            )}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="settle-note">
              What for? <span className="field-optional">optional</span>
            </label>
            <input id="settle-note" className="control" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Rice Amount" disabled={busy} autoComplete="off" />
            {/* the API records a payment between two people, not against a row */}
            <p className="field-hint">
              Payments are recorded against the person, not a single expense — the note is what
              makes this one recognisable later.
            </p>
          </div>

          <div className="field">
            <span className="field-label">When</span>
            <div className="settle-pair">
              <span className="control adorned">
                <CalendarDays size={17} />
                <input type="date" aria-label="Date of the payment" value={day}
                  onChange={(e) => setDay(e.target.value)} disabled={busy} />
              </span>
              <span className="control adorned">
                <Clock3 size={17} />
                <input type="time" aria-label="Time of the payment" value={time}
                  onChange={(e) => setTime(e.target.value)} disabled={busy} />
              </span>
            </div>
          </div>

          {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}

          <footer className="modal-actions">
            <button type="button" className="voice-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="modal-submit" disabled={busy}>
              {busy
                ? <><LoaderCircle size={18} className="spin" /> Recording...</>
                : <><HandCoins size={18} /> Record payment</>}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  )
}
