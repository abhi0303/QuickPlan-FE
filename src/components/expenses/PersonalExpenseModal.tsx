import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { format, parseISO } from 'date-fns'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { CalendarDays, CircleAlert, Clock3, IndianRupee, LoaderCircle, Plus, Save, X } from 'lucide-react'
import { getApiErrorMessage } from '../../services/api'
import { createPersonalExpense, updateExpense } from '../../services/expenses'
import type { Expense } from '../../services/expenses'
import { EXPENSE_CATEGORIES } from '../../data/expenseCategories'
import './PersonalExpenseModal.scss'

/**
 * Recording your own spending.
 *
 * Deliberately not the group dialog with fields hidden: there is no payer, no
 * split and nobody to choose, so three quarters of that form would be dead
 * weight. What is left is the four things worth typing — what, how much, when,
 * and which kind — plus a note for the detail you will want in six months.
 */

/** An expense that happened is dated; only the clock time is ever guessed at. */
function splitWhen(iso?: string) {
  const parsed = iso ? parseISO(iso) : new Date()
  const at = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  return { day: format(at, 'yyyy-MM-dd'), time: format(at, 'HH:mm') }
}

type Props = {
  open: boolean
  /** Present when editing; absent when adding. */
  expense?: Expense | null
  /** Prefilled by voice — the parser already heard the amount and the category. */
  draft?: { title?: string; amount?: number; category?: string; createdVia?: 'VOICE' } | null
  onClose: () => void
  onSaved: () => void
}

/** Keyed on the expense so every open starts fresh rather than carrying a draft. */
export function PersonalExpenseModal({ open, expense, ...rest }: Props) {
  if (!open) return null
  return <PersonalExpenseDialog key={expense?.id ?? 'new'} expense={expense} {...rest} />
}

type DialogProps = Omit<Props, 'open'>

function PersonalExpenseDialog({ expense, draft, onClose, onSaved }: DialogProps) {
  const editing = Boolean(expense)

  const [title, setTitle] = useState(expense?.title ?? draft?.title ?? '')
  const [amount, setAmount] = useState(
    expense ? String(expense.totalAmount) : draft?.amount !== undefined ? String(draft.amount) : '',
  )
  const [category, setCategory] = useState(expense?.category ?? draft?.category ?? '')
  const [notes, setNotes] = useState(expense?.notes ?? expense?.description ?? '')

  const when = splitWhen(expense?.date)
  const [day, setDay] = useState(when.day)
  const [time, setTime] = useState(when.time)

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

  /** The chosen moment as an ISO string, or undefined if the date is cleared. */
  function whenIso() {
    if (!day) return undefined
    const combined = new Date(`${day}T${time || '12:00'}`)
    return Number.isNaN(combined.getTime()) ? undefined : combined.toISOString()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    const total = Number(amount) || 0

    if (!trimmed) return setError('Give it a name so you recognise it later.')
    if (total <= 0) return setError('Enter an amount greater than zero.')

    setSaving(true)
    try {
      if (expense) {
        const nextDate = whenIso()
        const dateChanged = Boolean(nextDate)
          && new Date(nextDate as string).getTime() !== new Date(expense.date).getTime()

        await updateExpense(expense.id, {
          ...(trimmed !== expense.title ? { title: trimmed } : {}),
          ...(total !== expense.totalAmount ? { totalAmount: total } : {}),
          ...(dateChanged ? { date: nextDate } : {}),
          ...((category || undefined) !== (expense.category ?? undefined) ? { category: category || undefined } : {}),
          ...(notes !== (expense.notes ?? expense.description ?? '') ? { notes } : {}),
        })
        toast.success('Expense updated')
      } else {
        await createPersonalExpense({
          title: trimmed,
          totalAmount: total,
          category: category || undefined,
          date: whenIso(),
          notes: notes.trim() || undefined,
          createdVia: draft?.createdVia ?? 'MANUAL',
        })
        toast.success('Expense recorded')
      }
      onSaved()
      onClose()
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, 'Could not save that expense.'))
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal personal-expense-modal is-framed" role="dialog" aria-modal="true"
        aria-labelledby="personal-expense-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 id="personal-expense-title">{editing ? 'Edit expense' : 'Add expense'}</h2>
            <p className="muted">Just yours — nothing to split, nobody to settle with.</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <form onSubmit={handleSubmit}>
          {/* only the fields scroll; the title and the buttons stay put */}
          <div className="modal-body">
          <div className="field">
            <label className="field-label" htmlFor="pex-title">What was it for?</label>
            <input id="pex-title" className="control" ref={titleRef} value={title}
              onChange={(e) => { setTitle(e.target.value); setError('') }}
              placeholder="Petrol" disabled={saving} autoComplete="off" />
          </div>

          <div className="pex-pair">
            <div className="field">
              <label className="field-label" htmlFor="pex-amount">Amount</label>
              <span className="control adorned">
                <IndianRupee size={17} />
                <input id="pex-amount" type="number" min="0" step="any" inputMode="decimal" value={amount}
                  onChange={(e) => { setAmount(e.target.value); setError('') }}
                  placeholder="400" disabled={saving} />
              </span>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="pex-category">Category</label>
              <select id="pex-category" value={category} onChange={(e) => setCategory(e.target.value)} disabled={saving}>
                <option value="">None</option>
                {EXPENSE_CATEGORIES.map((option) => (
                  <option key={option.label} value={option.label}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <span className="field-label">When</span>
            <div className="pex-pair">
              <span className="control adorned">
                <CalendarDays size={17} />
                <input type="date" aria-label="Date of the expense" value={day}
                  onChange={(e) => { setDay(e.target.value); setError('') }} disabled={saving} />
              </span>
              <span className="control adorned">
                <Clock3 size={17} />
                <input type="time" aria-label="Time of the expense" value={time}
                  onChange={(e) => setTime(e.target.value)} disabled={saving} />
              </span>
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="pex-notes">
              Note <span className="field-optional">optional</span>
            </label>
            <input id="pex-notes" className="control" value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Indian Oil, Sector 18" disabled={saving} autoComplete="off" />
          </div>

          {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}

          </div>

          <footer className="modal-actions">
            <button type="button" className="voice-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="modal-submit" disabled={saving}>
              {saving
                ? <><LoaderCircle size={18} className="spin" /> Saving...</>
                : editing ? <><Save size={18} /> Save changes</> : <><Plus size={18} /> Add expense</>}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  )
}
