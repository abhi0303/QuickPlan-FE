import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { format } from 'date-fns'
import { createPortal } from 'react-dom'
import { CalendarDays, CircleAlert, IndianRupee, LoaderCircle, Plus, Repeat, Save, X } from 'lucide-react'
import { getApiErrorMessage } from '../../services/api'
import { CADENCES, CADENCE_LABEL } from '../../services/recurring'
import type { Cadence, CreateRecurringPayload, Recurring } from '../../services/recurring'
import { EXPENSE_CATEGORIES } from '../../data/expenseCategories'
import './RecurringModal.scss'

/**
 * Scheduling an expense that repeats.
 *
 * Rent, an EMI, three subscriptions — perfectly predictable, and exactly the
 * chore that makes people stop using an expense tracker in week three.
 *
 * The day-of-month field is the one with a trap in it: a rent set for the 31st
 * has to fall on the 28th in February rather than skip the month. The server
 * clamps it, and the hint says so, because otherwise picking 31 looks unsafe.
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

type Props = {
  open: boolean
  /** Present when editing. The cadence of a running schedule cannot be changed. */
  item?: Recurring | null
  onClose: () => void
  onSave: (payload: CreateRecurringPayload) => Promise<unknown>
  onEdit: (id: string, patch: { title?: string, amount?: number, category?: string, endsOn?: string }) => Promise<unknown>
}

export function RecurringModal({ open, item, ...rest }: Props) {
  if (!open) return null
  return <RecurringDialog key={item?.id ?? 'new'} item={item} {...rest} />
}

type DialogProps = Omit<Props, 'open'>

function RecurringDialog({ item, onClose, onSave, onEdit }: DialogProps) {
  const editing = Boolean(item)
  const today = new Date()

  const [title, setTitle] = useState(item?.title ?? '')
  const [amount, setAmount] = useState(item ? String(item.amount) : '')
  const [category, setCategory] = useState(item?.category ?? '')
  const [cadence, setCadence] = useState<Cadence>(item?.cadence ?? 'MONTHLY')
  const [dayOfMonth, setDayOfMonth] = useState(String(item?.dayOfMonth ?? today.getDate()))
  const [weekday, setWeekday] = useState(String(item?.weekday ?? today.getDay()))
  const [endsOn, setEndsOn] = useState(item?.endsOn ? item.endsOn.slice(0, 10) : '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.select()
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
    const trimmed = title.trim()
    const value = Number(amount) || 0

    if (!trimmed) return setError('Give it a name — "Rent", "Netflix".')
    if (value <= 0) return setError('Enter an amount greater than zero.')

    setSaving(true)
    try {
      if (item) {
        await onEdit(item.id, {
          ...(trimmed !== item.title ? { title: trimmed } : {}),
          ...(value !== item.amount ? { amount: value } : {}),
          ...((category || undefined) !== (item.category ?? undefined) ? { category: category || undefined } : {}),
          ...(endsOn !== (item.endsOn?.slice(0, 10) ?? '') ? { endsOn: endsOn || undefined } : {}),
        })
      } else {
        await onSave({
          title: trimmed,
          amount: value,
          cadence,
          category: category || undefined,
          ...(cadence === 'MONTHLY' ? { dayOfMonth: Number(dayOfMonth) || today.getDate() } : {}),
          ...(cadence === 'WEEKLY' ? { weekday: Number(weekday) } : {}),
          ...(endsOn ? { endsOn } : {}),
        })
      }
      onClose()
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, 'Could not save that schedule.'))
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal recurring-modal" role="dialog" aria-modal="true" aria-labelledby="recurring-title"
        onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 id="recurring-title">{editing ? 'Edit this schedule' : 'Schedule a repeating expense'}</h2>
            <p className="muted">Rent, an EMI, a subscription — recorded for you when it comes round.</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="rec-title">What is it?</label>
            <input id="rec-title" className="control" ref={titleRef} value={title}
              onChange={(e) => { setTitle(e.target.value); setError('') }}
              placeholder="Rent" disabled={saving} autoComplete="off" />
          </div>

          <div className="rec-pair">
            <div className="field">
              <label className="field-label" htmlFor="rec-amount">How much?</label>
              <span className="control adorned">
                <IndianRupee size={17} />
                <input id="rec-amount" type="number" min="0" step="any" inputMode="decimal" value={amount}
                  onChange={(e) => { setAmount(e.target.value); setError('') }}
                  placeholder="18000" disabled={saving} />
              </span>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="rec-category">Category</label>
              <select id="rec-category" value={category} onChange={(e) => setCategory(e.target.value)} disabled={saving}>
                <option value="">None</option>
                {EXPENSE_CATEGORIES.map((option) => (
                  <option key={option.label} value={option.label}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Changing how often a running schedule fires would leave its next
              run meaningless, so it is set once and then only stopped. */}
          {editing ? (
            <p className="field-hint rec-fixed">
              <Repeat size={13} /> {CADENCE_LABEL[item?.cadence ?? 'MONTHLY'].toLowerCase()} — to change that,
              stop this one and schedule a new one.
            </p>
          ) : (
            <>
              <div className="field">
                <span className="field-label">How often?</span>
                <div className="segmented">
                  {CADENCES.map((option) => (
                    <button key={option} type="button" className={cadence === option ? 'active' : ''}
                      onClick={() => setCadence(option)} disabled={saving}>
                      {option.charAt(0) + option.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>

              {cadence === 'MONTHLY' && (
                <div className="field">
                  <label className="field-label" htmlFor="rec-dom">Day of the month</label>
                  <input id="rec-dom" className="control" type="number" min="1" max="31" value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(e.target.value)} disabled={saving} />
                  {Number(dayOfMonth) > 28 && (
                    <p className="field-hint">
                      Months without a {dayOfMonth}th use their last day, so February still gets it.
                    </p>
                  )}
                </div>
              )}

              {cadence === 'WEEKLY' && (
                <div className="field">
                  <label className="field-label" htmlFor="rec-weekday">Day of the week</label>
                  <select id="rec-weekday" value={weekday} onChange={(e) => setWeekday(e.target.value)} disabled={saving}>
                    {WEEKDAYS.map((name, index) => (
                      <option key={name} value={index}>{name}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          <div className="field">
            <label className="field-label" htmlFor="rec-ends">
              Stop after <span className="field-optional">optional</span>
            </label>
            <span className="control adorned">
              <CalendarDays size={17} />
              <input id="rec-ends" type="date" value={endsOn} min={format(today, 'yyyy-MM-dd')}
                onChange={(e) => setEndsOn(e.target.value)} disabled={saving} />
            </span>
            <p className="field-hint">Leave it empty and it runs until you stop it.</p>
          </div>

          {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}

          <footer className="modal-actions">
            <button type="button" className="voice-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="modal-submit" disabled={saving}>
              {saving
                ? <><LoaderCircle size={18} className="spin" /> Saving...</>
                : editing ? <><Save size={18} /> Save changes</> : <><Plus size={18} /> Schedule it</>}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  )
}
