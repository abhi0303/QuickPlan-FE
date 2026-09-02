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

export type SettlePerson = { userId: string, name: string, owed: number }

export type SettleSeed = {
  /**
   * Who moved the money. `pay` is you clearing what you owe; `receive` is
   * recording that somebody has paid you — the same settlement seen from the
   * other end, which the person who fronted the expense is often the one to
   * know about.
   */
  mode: 'pay' | 'receive'
  /** One when paying; the people who owe you when receiving. */
  people: SettlePerson[]
  personId: string
  /** Prefilled amount — one expense's share, or everything owed. */
  amount: number
  note?: string
}

type Props = {
  seed: (SettleSeed & { meId: string }) | null
  busy?: boolean
  onClose: () => void
  onConfirm: (payload: CreateSettlementPayload) => void
}

export function SettleModal({ seed, busy, onClose, onConfirm }: Props) {
  if (!seed) return null
  return (
    <SettleDialog
      key={`${seed.mode}-${seed.personId}-${seed.note ?? ''}`}
      seed={seed} busy={busy} onClose={onClose} onConfirm={onConfirm}
    />
  )
}

function SettleDialog({ seed, busy, onClose, onConfirm }: Props & { seed: SettleSeed & { meId: string } }) {
  const receiving = seed.mode === 'receive'
  const [personId, setPersonId] = useState(seed.personId)
  const person = seed.people.find((row) => row.userId === personId) ?? seed.people[0]
  const owed = person?.owed ?? 0

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
  const leftOver = owed - value

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (value <= 0) return setError('Enter an amount greater than zero.')
    /*
     * This dialog clears a debt; it is not for lending. Letting somebody pay
     * more than they owe is how a settled balance ends up owing them money —
     * which is exactly what happened when the prefill was wrong.
     */
    if (owed > 0.005 && value > owed + 0.005) {
      const who = person?.name.split(' ')[0] ?? 'they'
      return setError(receiving
        ? `${who} only owes you ${money(owed)}.`
        : `You only owe ${who} ${money(owed)}.`)
    }

    const at = day ? new Date(`${day}T${time || '12:00'}`) : null
    onConfirm({
      // receiving records the other person as the payer; the API defaults
      // `fromUserId` to the caller, which is only right when you are paying
      ...(receiving ? { fromUserId: personId, toUserId: seed.meId } : { toUserId: personId }),
      amount: value,
      note: note.trim() || undefined,
      settledAt: at && !Number.isNaN(at.getTime()) ? at.toISOString() : undefined,
    })
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal settle-modal is-framed" role="dialog" aria-modal="true" aria-labelledby="settle-title"
        onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 id="settle-title">{receiving ? 'Record money you received' : 'Record a payment'}</h2>
            <p className="muted">
              {receiving
                ? 'They paid you back — part of what they owe, or all of it.'
                : 'Pay off part of what you owe, or all of it.'}
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        {/* who you are paying is context for the whole dialog, so it stays
            with the header rather than scrolling away from the amount */}
        <div className="settle-who">
          <span className="friend-avatar" style={avatarStyle(person?.name ?? '')}>
            {(person?.name ?? '?').charAt(0).toUpperCase()}
          </span>
          <div>
            <strong>{receiving ? `${person?.name ?? 'They'} paid you` : `Paying ${person?.name ?? ''}`}</strong>
            <small>
              {owed > 0.005
                ? receiving
                  ? `They owe you ${money(owed)} in this group`
                  : `You owe them ${money(owed)} in this group`
                : 'Your balance with them is already square'}
            </small>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* only the fields scroll; the title and the buttons stay put */}
          <div className="modal-body">
          {/* more than one person can owe you for the same expense */}
          {receiving && seed.people.length > 1 && (
            <div className="field">
              <label className="field-label" htmlFor="settle-who">Who paid you?</label>
              <select id="settle-who" value={personId} disabled={busy}
                onChange={(event) => {
                  setPersonId(event.target.value)
                  const next = seed.people.find((row) => row.userId === event.target.value)
                  if (next) setAmount(next.owed.toFixed(2))
                  setError('')
                }}>
                {seed.people.map((row) => (
                  <option key={row.userId} value={row.userId}>{row.name} · {money(row.owed)}</option>
                ))}
              </select>
            </div>
          )}

          <div className="field">
            <label className="field-label" htmlFor="settle-amount">
              {receiving ? 'How much did they pay you?' : 'How much are you paying?'}
            </label>
            <span className="control adorned">
              <IndianRupee size={17} />
              <input id="settle-amount" ref={amountRef} type="number" min="0" step="any" inputMode="decimal"
                max={owed > 0.005 ? owed : undefined}
                value={amount} onChange={(e) => { setAmount(e.target.value); setError('') }}
                disabled={busy} />
            </span>

            {owed > 0.005 && (
              <div className="chip-row">
                {Math.abs(seed.amount - owed) > 0.005 && (
                  <button type="button" className="chip" disabled={busy}
                    onClick={() => setAmount(seed.amount.toFixed(2))}>
                    This expense · {money(seed.amount)}
                  </button>
                )}
                <button type="button" className="chip" disabled={busy}
                  onClick={() => setAmount(owed.toFixed(2))}>
                  Everything · {money(owed)}
                </button>
              </div>
            )}

            {/* A part payment is the normal case here, so say what is left
                rather than treating it as an error. */}
            {value > 0 && owed > 0.005 && (
              <p className="field-hint">
                {leftOver > 0.005
                  ? `${money(leftOver)} would still be owed after this.`
                  : receiving ? 'That clears what they owe you.' : 'That clears what you owe them.'}
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

          </div>

          <footer className="modal-actions">
            <button type="button" className="voice-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="modal-submit" disabled={busy}>
              {busy
                ? <><LoaderCircle size={18} className="spin" /> Recording...</>
                : <><HandCoins size={18} /> {receiving ? 'Record it' : 'Record payment'}</>}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  )
}
