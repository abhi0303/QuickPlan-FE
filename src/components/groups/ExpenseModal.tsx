import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { CircleAlert, IndianRupee, LoaderCircle, Plus, Save, X } from 'lucide-react'
import { MultiSelect } from '../common/MultiSelect'
import { getApiErrorMessage } from '../../services/api'
import { createExpense, SPLIT_TYPES, updateExpense } from '../../services/expenses'
import type { CreateExpensePayload, Expense, SplitType } from '../../services/expenses'
import type { GroupMember } from '../../services/groups'
import './ExpenseModal.scss'

const SPLIT_LABEL: Record<SplitType, string> = {
  EQUAL: 'Equally',
  EXACT: 'Exact amounts',
  PERCENTAGE: 'Percentages',
}

const CATEGORIES = ['Food', 'Travel', 'Stay', 'Shopping', 'Bills', 'Other']

type Props = {
  open: boolean
  groupId: string
  members: GroupMember[]
  currentUserId: string
  /** Present when editing; absent when adding. */
  expense?: Expense | null
  onClose: () => void
  onSaved: () => void
}

/**
 * Mounts the dialog only while it is open and keys it on the expense, so every
 * open starts from fresh state instead of carrying over the last draft.
 */
export function ExpenseModal({ open, expense, ...rest }: Props) {
  if (!open) return null
  return <ExpenseDialog key={expense?.id ?? 'new'} expense={expense} {...rest} />
}

type DialogProps = Omit<Props, 'open'>

function ExpenseDialog({ groupId, members, currentUserId, expense, onClose, onSaved }: DialogProps) {
  const editing = Boolean(expense)

  const [title, setTitle] = useState(expense?.title ?? '')
  const [amount, setAmount] = useState(expense ? String(expense.totalAmount) : '')
  const [category, setCategory] = useState(expense?.category ?? '')
  const [paidById, setPaidById] = useState(expense?.paidById ?? currentUserId)
  const [splitType, setSplitType] = useState<SplitType>(expense?.splitType ?? 'EQUAL')

  const [included, setIncluded] = useState<string[]>(
    expense ? expense.shares.map((s) => s.userId) : members.map((m) => m.id),
  )

  // The API stores every share as an amount, so a PERCENTAGE expense is
  // converted back to percentages for editing.
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (!expense) return {}
    const entries = expense.shares.map((share) => {
      const value = expense.splitType === 'PERCENTAGE' && expense.totalAmount > 0
        ? (share.amount / expense.totalAmount) * 100
        : share.amount
      return [share.userId, String(Number(value.toFixed(2)))]
    })
    return Object.fromEntries(entries)
  })

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

  const total = Number(amount) || 0

  const options = useMemo(
    () => members.map((member) => ({
      id: member.id,
      label: member.id === currentUserId ? 'You' : member.name,
      sublabel: member.email,
    })),
    [members, currentUserId],
  )

  // Preview only — the server computes the real split and assigns the rounding
  // remainder, so its numbers are the ones that count.
  const preview = useMemo(
    () => (splitType === 'EQUAL' && included.length ? (total / included.length).toFixed(2) : null),
    [splitType, included.length, total],
  )

  const enteredSum = useMemo(
    () => included.reduce((sum, id) => sum + (Number(values[id]) || 0), 0),
    [included, values],
  )

  function buildShares(): CreateExpensePayload['shares'] | undefined {
    if (splitType === 'EQUAL') {
      // Omitted means "everyone". Otherwise the ids must be listed, and although
      // value is ignored for EQUAL the validator still demands a positive
      // number — so the equal share is sent rather than 0.
      return included.length === members.length
        ? undefined
        : included.map((id) => ({ userId: id, value: total / included.length }))
    }
    return included.map((id) => ({ userId: id, value: Number(values[id]) }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return setError('Give the expense a title.')
    if (!(total > 0)) return setError('Enter an amount greater than zero.')
    if (included.length === 0) return setError('Pick at least one person to split between.')

    if (splitType !== 'EQUAL' && included.some((id) => !(Number(values[id]) > 0))) {
      return setError(
        splitType === 'EXACT'
          ? 'Give everyone an amount greater than zero, or remove them from the split.'
          : 'Give everyone a percentage greater than zero, or remove them from the split.',
      )
    }

    setSaving(true)
    try {
      if (expense) {
        // Changing the amount, split type or shares rebuilds every share, so
        // those three always travel together to stay coherent.
        const splitChanged =
          total !== expense.totalAmount
          || splitType !== expense.splitType
          || included.length !== expense.shares.length
          || included.some((id) => !expense.shares.some((s) => s.userId === id))
          || splitType !== 'EQUAL'

        await updateExpense(expense.id, {
          ...(trimmed !== expense.title ? { title: trimmed } : {}),
          ...((category || undefined) !== (expense.category ?? undefined) ? { category: category || undefined } : {}),
          ...(paidById !== expense.paidById ? { paidById } : {}),
          ...(splitChanged ? { totalAmount: total, splitType, shares: buildShares() } : {}),
        })
        toast.success('Expense updated')
      } else {
        await createExpense(groupId, {
          title: trimmed,
          totalAmount: total,
          category: category || undefined,
          paidById,
          splitType,
          shares: buildShares(),
        })
        toast.success('Expense added')
      }
      onSaved()
      onClose()
    } catch (submitError) {
      // the API explains sum mismatches in plain language — show it verbatim
      setError(getApiErrorMessage(submitError, 'Could not save that expense.'))
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal expense-modal" role="dialog" aria-modal="true" aria-labelledby="expense-title"
        onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 id="expense-title">{editing ? 'Edit expense' : 'Add expense'}</h2>
            <p className="muted">
              {editing ? 'Changing the amount or split recalculates everyone’s balance.' : 'Split between the people who shared it.'}
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="exp-title">What was it for?</label>
            <input id="exp-title" className="control" ref={titleRef} value={title}
              onChange={(e) => { setTitle(e.target.value); setError('') }}
              placeholder="Dinner" disabled={saving} autoComplete="off" />
          </div>

          <div className="field-pair">
            <div className="field">
              <label className="field-label" htmlFor="exp-amount">Amount</label>
              <span className="control adorned">
                <IndianRupee size={17} />
                <input id="exp-amount" type="number" min="0" step="any" inputMode="decimal" value={amount}
                  onChange={(e) => { setAmount(e.target.value); setError('') }}
                  placeholder="1200" disabled={saving} />
              </span>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="exp-payer">Paid by</label>
              <select id="exp-payer" value={paidById} onChange={(e) => setPaidById(e.target.value)} disabled={saving}>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.id === currentUserId ? 'You' : member.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field-pair">
            <div className="field">
              <label className="field-label" htmlFor="exp-category">Category</label>
              <select id="exp-category" value={category} onChange={(e) => setCategory(e.target.value)} disabled={saving}>
                <option value="">None</option>
                {CATEGORIES.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="exp-split">Split</label>
              <select id="exp-split" value={splitType} disabled={saving}
                onChange={(e) => { setSplitType(e.target.value as SplitType); setError('') }}>
                {SPLIT_TYPES.map((type) => <option key={type} value={type}>{SPLIT_LABEL[type]}</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <span className="field-label">
              Between
              {splitType === 'EQUAL' && preview && total > 0 && (
                <span className="field-optional">about ₹{preview} each</span>
              )}
              {splitType === 'EXACT' && (
                <span className={`field-optional ${Math.abs(enteredSum - total) > 0.005 ? 'off' : ''}`}>
                  ₹{enteredSum.toFixed(2)} of ₹{total.toFixed(2)}
                </span>
              )}
              {splitType === 'PERCENTAGE' && (
                <span className={`field-optional ${Math.abs(enteredSum - 100) > 0.005 ? 'off' : ''}`}>
                  {enteredSum.toFixed(2)}% of 100%
                </span>
              )}
            </span>

            <MultiSelect
              options={options}
              selected={included}
              onChange={(next) => { setIncluded(next); setError('') }}
              placeholder="Pick who shared it"
              searchPlaceholder="Search members..."
              disabled={saving}
              label="Split between"
            />

            {/* Only the chosen people need a box, so an unequal split stays as
                short as the number of people actually in it. */}
            {splitType !== 'EQUAL' && included.length > 0 && (
              <div className="share-list">
                {included.map((id) => {
                  const member = members.find((m) => m.id === id)
                  const name = member ? (id === currentUserId ? 'You' : member.name) : id
                  return (
                    <div className="share-row" key={id}>
                      <span className="share-name">{name}</span>
                      <input
                        className="split-value"
                        type="number" min="0" step="any" inputMode="decimal"
                        value={values[id] ?? ''}
                        onChange={(e) => setValues((v) => ({ ...v, [id]: e.target.value }))}
                        placeholder={splitType === 'PERCENTAGE' ? '%' : '₹'}
                        disabled={saving}
                        aria-label={`${name} ${splitType === 'PERCENTAGE' ? 'percentage' : 'amount'}`}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}

          <footer className="modal-actions">
            <button type="button" className="voice-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="modal-submit" disabled={saving}>
              {saving
                ? <><LoaderCircle size={18} className="spin" /> Saving...</>
                : editing
                  ? <><Save size={18} /> Save changes</>
                  : <><Plus size={18} /> Add expense</>}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  )
}
