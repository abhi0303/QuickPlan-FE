import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { format } from 'date-fns'
import { createPortal } from 'react-dom'
import {
  ArrowRight, CalendarDays, Check, CircleAlert, Clock3, Copy, HandCoins, IndianRupee,
  LoaderCircle, NotebookPen, Smartphone, X,
} from 'lucide-react'
import { avatarStyle } from '../../utils/avatar'
import type { CreateSettlementPayload } from '../../services/expenses'
import { UPI_APPS, buildAppLink, buildUpiLink, isValidUpiId, normalizeUpiId, upiLaunchMode } from '../../services/upi'
import { useAppStore } from '../../store/useAppStore'
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

/* What a settlement between two people is usually for. Typing the same few
   words every time is the sort of friction that ends with everything left
   blank, but the list can never cover it — hence the last option. */
const REASONS = ['Settling up', 'Food & drinks', 'Groceries', 'Rent', 'Travel', 'Bills']

export type SettlePerson = {
  userId: string
  name: string
  owed: number
  /** From the API, best first. The payer can still type a different one. */
  upiIds?: string[]
}

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
  const seededNote = (seed.note ?? '').trim()
  const [reason, setReason] = useState(() => {
    if (!seededNote) return REASONS[0]
    return REASONS.includes(seededNote) ? seededNote : 'other'
  })
  const [customNote, setCustomNote] = useState(REASONS.includes(seededNote) ? '' : seededNote)
  const note = reason === 'other' ? customNote : reason
  /* Paying somebody has two shapes: the money already moved and this is
     bookkeeping, or it has not moved yet and the app can start it. Money you
     have received only ever has the first shape, so it skips the question. */
  const [step, setStep] = useState<'choose' | 'form'>(receiving ? 'form' : 'choose')
  const [viaUpi, setViaUpi] = useState(false)
  const rememberedUpi = useAppStore((state) => state.upiIds[personId] ?? '')
  const rememberUpiId = useAppStore((state) => state.rememberUpiId)
  const [typedUpi, setTypedUpi] = useState('')
  /* Which of their addresses to pay. 'other' hands over to the text field,
     which is also where somebody with none of them saved starts. */
  const [upiChoice, setUpiChoice] = useState(() => person?.upiIds?.[0] || rememberedUpi || 'other')
  const [copied, setCopied] = useState(false)
  /* Nothing reports back that a upi:// link went nowhere, so this is inferred
     from still being the visible page a moment after the tap. */
  const [nothingOpened, setNothingOpened] = useState(false)
  // a fact about the device, read once — state rather than a ref because it
  // decides what renders
  const [launch] = useState(upiLaunchMode)
  const launchTimer = useRef(0)
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
      window.clearTimeout(launchTimer.current)
    }
  }, [onClose])

  const value = Number(amount) || 0
  const leftOver = owed - value

  /* Theirs first, in the order they chose, then whatever this device last paid
     them at — that one is only a memory of a typed address, so it goes last. */
  const known = person?.upiIds ?? []
  const choices = rememberedUpi && !known.includes(rememberedUpi) ? [...known, rememberedUpi] : known
  const payee = (upiChoice === 'other' ? typedUpi : upiChoice).trim()
  const payeeIsValid = isValidUpiId(payee)
  const linkInput = {
    vpa: payee,
    name: person?.name,
    amount: value,
    note: note.trim() || 'QuickPlan settle-up',
  }
  const canPay = payeeIsValid && value > 0

  function handOff() {
    if (!canPay) return
    setNothingOpened(false)
    /* A link the phone can open takes the page into the background. Still
       being visible a couple of seconds later means no app took it — usually
       because none is installed. */
    window.clearTimeout(launchTimer.current)
    launchTimer.current = window.setTimeout(() => {
      if (document.visibilityState === 'visible') setNothingOpened(true)
    }, 1800)
  }

  async function copyPayee() {
    try {
      await navigator.clipboard.writeText(payee)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* a denied clipboard is not worth an error: the address is on screen */
    }
  }

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

    /*
     * Remembered here rather than when the UPI app was opened. Opening one
     * proves nothing — the address can be wrong, the app can be missing, the
     * payment can be abandoned — and an address kept from a failed hand-off
     * comes back as a prefill that looks like fact. Recording the payment is
     * the moment somebody says the money moved.
     */
    if (viaUpi && payeeIsValid && !known.includes(payee)) {
      rememberUpiId(personId, normalizeUpiId(payee))
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
            <h2 id="settle-title">
              {receiving ? 'Record money you received' : step === 'choose' ? 'Settle up' : 'Record a payment'}
            </h2>
            <p className="muted">
              {receiving
                ? 'They paid you back — part of what they owe, or all of it.'
                : step === 'choose'
                  ? 'Two ways to do this.'
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

        {step === 'choose' ? (
          <div className="modal-body settle-choice">
            <button type="button" className="choice" onClick={() => { setViaUpi(true); setStep('form') }}>
              <span className="choice-mark is-pay"><Smartphone size={20} /></span>
              <span className="choice-copy">
                <strong>Pay &amp; settle</strong>
                <small>Open your UPI app with the amount filled in, then record it here.</small>
              </span>
              <ArrowRight size={17} className="choice-go" />
            </button>

            <button type="button" className="choice" onClick={() => { setViaUpi(false); setStep('form') }}>
              <span className="choice-mark"><NotebookPen size={20} /></span>
              <span className="choice-copy">
                <strong>Record a payment</strong>
                <small>You already paid them — cash, bank transfer, anything.</small>
              </span>
              <ArrowRight size={17} className="choice-go" />
            </button>

            <p className="choice-note">
              QuickPlan never touches the money. Paying opens your own UPI app, and the
              settlement is recorded from what you tell it happened.
            </p>
          </div>
        ) : (
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
              {/* filling in the whole debt is the common case, so it lives in
                  the field rather than on a line of its own below it */}
              {owed > 0.005 && (
                <button type="button" className="in-field" disabled={busy}
                  onClick={() => { setAmount(owed.toFixed(2)); setError('') }}>
                  Everything
                </button>
              )}
            </span>

            {owed > 0.005 && Math.abs(seed.amount - owed) > 0.005 && (
              <div className="chip-row">
                <button type="button" className="chip" disabled={busy}
                  onClick={() => setAmount(seed.amount.toFixed(2))}>
                  This expense · {money(seed.amount)}
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

          {viaUpi && (
            <div className="pay-panel">
              <div className="pay-head">
                <Smartphone size={15} />
                <strong>
                  {launch === 'none' ? 'Pay from your phone' : `Pay ${person?.name?.split(' ')[0] ?? 'them'} ${money(value)}`}
                </strong>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="settle-upi">
                  {choices.length > 1 ? 'Which of their UPI IDs?' : 'Their UPI ID'}
                </label>

                {/* one address needs no choosing; several do, and the one they
                    put first is the one they would rather be paid at */}
                {choices.length > 1 && (
                  <select id="settle-upi" value={upiChoice} disabled={busy}
                    onChange={(event) => setUpiChoice(event.target.value)}>
                    {choices.map((option, index) => (
                      <option key={option} value={option}>
                        {option}{index === 0 ? ' · their default' : ''}
                      </option>
                    ))}
                    <option value="other">Something else...</option>
                  </select>
                )}

                {(choices.length <= 1 || upiChoice === 'other') && (
                  <span className={`control adorned ${choices.length > 1 ? 'settle-upi-custom' : ''}`}>
                    <input
                      id={choices.length > 1 ? undefined : 'settle-upi'}
                      inputMode="email" autoComplete="off" spellCheck={false}
                      placeholder="name@bank"
                      value={upiChoice === 'other' ? typedUpi : payee}
                      onChange={(event) => { setTypedUpi(event.target.value); setUpiChoice('other') }}
                      disabled={busy}
                    />
                    <button type="button" className="in-field is-icon" onClick={copyPayee}
                      disabled={busy || !payee} aria-label="Copy UPI ID">
                      {copied ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                  </span>
                )}

                {payee.length > 0 && !payeeIsValid && (
                  <p className="field-hint is-warn">That does not look like a UPI ID — they read like <code>name@bank</code>.</p>
                )}

                {/* A remembered address is a note to self, not something they
                    published — saying so is the difference between a helpful
                    prefill and one that reads as fact. */}
                {payee.length > 0 && payee === rememberedUpi && !known.includes(payee) && (
                  <p className="field-hint">
                    <span>You paid them here last time — they have not saved a UPI ID.</span>{' '}
                    <button type="button" className="text-button is-inline" disabled={busy}
                      onClick={() => { rememberUpiId(personId, ''); setTypedUpi(''); setUpiChoice('other') }}>
                      Forget it
                    </button>
                  </p>
                )}
              </div>

              {canPay && (
                <>
                  {/* the last moment anybody can catch a mistyped address, which
                      sends money to a stranger and cannot be undone */}
                  <p className="pay-line">
                    Paying <strong>{payee}</strong> · <strong>{money(value)}</strong>
                  </p>

                  <div className="pay-actions">
                    {launch === 'chooser' && (
                      <a className="pay-open" href={buildUpiLink(linkInput)} onClick={handOff}>
                        Open UPI app <ArrowRight size={16} />
                      </a>
                    )}

                    {/* iOS has no chooser for a bare upi:// link, so each app
                        has to be offered by name */}
                    {launch === 'apps' && (
                      <div className="pay-apps">
                        {UPI_APPS.map((app) => (
                          <a key={app.id} className="pay-app" href={buildAppLink(app.scheme, linkInput)} onClick={handOff}>
                            {app.label}
                          </a>
                        ))}
                      </div>
                    )}

                  </div>

                  {launch === 'none' ? (
                    <p className="field-hint">
                      UPI apps live on a phone, so there is nothing here to open. Copy the
                      address, pay from your phone, then record it below.
                    </p>
                  ) : nothingOpened ? (
                    <p className="field-hint is-warn">
                      Nothing opened — you may not have a UPI app on this device. Copy the
                      address and pay from wherever you normally do.
                    </p>
                  ) : (
                    <p className="field-hint">
                      Nothing comes back from the UPI app, so recording it is the step that
                      counts. Come back here once it has gone through.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="field">
            <label className="field-label" htmlFor="settle-note">
              What for? <span className="field-optional">optional</span>
            </label>
            <select id="settle-note" value={reason} disabled={busy}
              onChange={(event) => setReason(event.target.value)}>
              {REASONS.map((option) => <option key={option} value={option}>{option}</option>)}
              <option value="other">Something else...</option>
            </select>

            {reason === 'other' && (
              <input className="control settle-note-custom" value={customNote} autoFocus
                onChange={(event) => setCustomNote(event.target.value)}
                placeholder="Rice amount" disabled={busy} autoComplete="off" />
            )}
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
            <button type="button" className="voice-ghost" disabled={busy}
              onClick={() => (receiving ? onClose() : setStep('choose'))}>
              {receiving ? 'Cancel' : 'Back'}
            </button>
            <button className="modal-submit" disabled={busy}>
              {busy
                ? <><LoaderCircle size={18} className="spin" /> Recording...</>
                : <><HandCoins size={18} /> {receiving ? 'Record it' : viaUpi ? "I've paid — record it" : 'Record payment'}</>}
            </button>
          </footer>
        </form>
        )}
      </div>
    </div>,
    document.body,
  )
}
