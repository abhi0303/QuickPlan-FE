import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { CircleAlert, IndianRupee, LoaderCircle, Plus, Save, Sparkles, X } from 'lucide-react'
import { getApiErrorMessage } from '../../services/api'
import { BUDGET_PERIODS, suggestBudget } from '../../services/budgets'
import type { Budget, BudgetPeriod, BudgetScope, CreateBudgetPayload } from '../../services/budgets'
import { EXPENSE_CATEGORIES } from '../../data/expenseCategories'
import './BudgetModal.scss'

/**
 * Setting a budget.
 *
 * The hard part is not the form, it is the number: nobody knows what their food
 * budget should be, and everybody recognises last month's. So the amount is
 * offered rather than demanded — `GET /api/budgets/suggest` is asked as soon as
 * a category is picked.
 */

const money = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`

const PERIOD_LABEL: Record<BudgetPeriod, string> = { MONTHLY: 'Each month', WEEKLY: 'Each week' }

type Props = {
  open: boolean
  /** Present when editing an existing budget. */
  budget?: Budget | null
  /** Categories that already have one, so the same budget cannot be set twice. */
  taken: string[]
  onClose: () => void
  onSave: (payload: CreateBudgetPayload) => Promise<unknown>
  onEdit: (id: string, patch: { amount: number, scope: BudgetScope }) => Promise<unknown>
}

export function BudgetModal({ open, budget, ...rest }: Props) {
  if (!open) return null
  return <BudgetDialog key={budget?.id ?? 'new'} budget={budget} {...rest} />
}

type DialogProps = Omit<Props, 'open'>

function BudgetDialog({ budget, taken, onClose, onSave, onEdit }: DialogProps) {
  const editing = Boolean(budget)

  const [category, setCategory] = useState(budget?.category ?? '')
  const [amount, setAmount] = useState(budget ? String(budget.amount) : '')
  const [period, setPeriod] = useState<BudgetPeriod>(budget?.period ?? 'MONTHLY')
  const [scope, setScope] = useState<BudgetScope>(budget?.scope ?? 'PERSONAL')
  /*
   * Carries the shape it was fetched for, so a suggestion for Food cannot be
   * left on screen after the category changes to Fuel. Clearing it up front
   * instead would mean a setState in the effect body — a cascading render, and
   * a flicker every time the form is touched.
   */
  const [suggestion, setSuggestion] = useState<{ key: string, amount: number } | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    amountRef.current?.focus()
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

  // asked again whenever the shape of the budget changes, since the answer does
  const shape = `${category}|${period}|${scope}`

  useEffect(() => {
    if (editing) return
    let cancelled = false
    suggestBudget(category || undefined, period, scope)
      .then((value) => {
        if (!cancelled && value !== null && value > 0) setSuggestion({ key: shape, amount: value })
      })
      .catch(() => { /* a suggestion is a nicety; its absence is not an error */ })
    return () => { cancelled = true }
  }, [category, period, scope, editing, shape])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const value = Number(amount) || 0
    if (value <= 0) return setError('Enter an amount greater than zero.')

    setSaving(true)
    try {
      if (budget) await onEdit(budget.id, { amount: value, scope })
      else await onSave({ category: category || undefined, amount: value, period, scope })
      onClose()
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, 'Could not save that budget.'))
    } finally {
      setSaving(false)
    }
  }

  const options = EXPENSE_CATEGORIES.filter(
    (option) => option.label === budget?.category || !taken.includes(option.label),
  )

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal budget-modal is-framed" role="dialog" aria-modal="true" aria-labelledby="budget-title"
        onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 id="budget-title">{editing ? `Edit the ${budget?.category ?? 'overall'} budget` : 'Set a budget'}</h2>
            <p className="muted">A limit you can see yourself approaching, rather than one you find out about later.</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <form onSubmit={handleSubmit}>
          {/* only the fields scroll; the title and the buttons stay put */}
          <div className="modal-body">
          {!editing && (
            <div className="field">
              <label className="field-label" htmlFor="budget-category">What for?</label>
              <select id="budget-category" value={category} disabled={saving}
                onChange={(e) => { setCategory(e.target.value); setError('') }}>
                <option value="">Everything — one overall budget</option>
                {options.map((option) => (
                  <option key={option.label} value={option.label}>{option.label}</option>
                ))}
              </select>
              {taken.includes('') && category === '' && (
                <p className="field-hint">You already have an overall budget — pick a category instead.</p>
              )}
            </div>
          )}

          <div className="field">
            <label className="field-label" htmlFor="budget-amount">How much?</label>
            <span className="control adorned">
              <IndianRupee size={17} />
              <input id="budget-amount" ref={amountRef} type="number" min="0" step="any" inputMode="decimal"
                value={amount} onChange={(e) => { setAmount(e.target.value); setError('') }}
                placeholder="8000" disabled={saving} />
            </span>

            {suggestion?.key === shape && (
              <button type="button" className="budget-suggest" disabled={saving}
                onClick={() => setAmount(String(Math.round(suggestion.amount)))}>
                <Sparkles size={14} />
                You spent {money(suggestion.amount)} last {period === 'WEEKLY' ? 'week' : 'month'} — use that
              </button>
            )}
          </div>

          {!editing && (
            <div className="field">
              <span className="field-label">Period</span>
              <div className="segmented">
                {BUDGET_PERIODS.map((option) => (
                  <button key={option} type="button" className={period === option ? 'active' : ''}
                    onClick={() => setPeriod(option)} disabled={saving}>
                    {PERIOD_LABEL[option]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="field">
            <span className="field-label">Counts</span>
            <div className="segmented">
              <button type="button" className={scope === 'PERSONAL' ? 'active' : ''}
                onClick={() => setScope('PERSONAL')} disabled={saving}>
                My own spending
              </button>
              <button type="button" className={scope === 'ALL' ? 'active' : ''}
                onClick={() => setScope('ALL')} disabled={saving}>
                Groups too
              </button>
            </div>
            {/* the default is the one people mean: a group dinner in Goa is not
                what "₹8,000 on food" was about */}
            <p className="field-hint">
              {scope === 'PERSONAL'
                ? 'Only expenses in your own ledger count towards this.'
                : 'Your share of group expenses counts towards this as well.'}
            </p>
          </div>

          {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}

          </div>

          <footer className="modal-actions">
            <button type="button" className="voice-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="modal-submit" disabled={saving}>
              {saving
                ? <><LoaderCircle size={18} className="spin" /> Saving...</>
                : editing ? <><Save size={18} /> Save changes</> : <><Plus size={18} /> Set budget</>}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  )
}
