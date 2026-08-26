import { format, isToday, parseISO } from 'date-fns'
import { HandCoins, Pencil, Trash2 } from 'lucide-react'
import { categoryLook } from '../../data/expenseCategories'
import { isPersonal } from '../../services/expenses'
import { isTempId } from '../../services/offline/queue'
import type { Expense } from '../../services/expenses'
import './ExpenseRow.scss'

/**
 * One expense, in either shape.
 *
 * A group expense reads as *who paid, and what it cost you*; a personal one has
 * no answer to the first half, so the payer line and the "your share" label
 * come off and the amount stands on its own. That is the only difference — the
 * server returns `myShare` equal to the total on a personal expense precisely
 * so the rest of this stays branch-free.
 */

const money = (value: number) => `₹${Math.abs(value).toFixed(2)}`

function whenLabel(iso: string, timeOnly: boolean) {
  const at = parseISO(iso)
  if (Number.isNaN(at.getTime())) return ''
  return timeOnly || isToday(at) ? format(at, 'h:mm a') : format(at, 'd MMM')
}

type Props = {
  expense: Expense
  canEdit: boolean
  busy?: boolean
  /** For a list already grouped by day: repeating the date would say nothing. */
  timeOnly?: boolean
  /**
   * Offered when somebody else fronted this one and you still owe your share of
   * it. Absent on a personal expense and on anything you paid for yourself.
   */
  onSettle?: (expense: Expense) => void
  onEdit: (expense: Expense) => void
  onDelete: (expense: Expense) => void
}

export function ExpenseRow({ expense, canEdit, busy, timeOnly = false, onEdit, onDelete, onSettle }: Props) {
  const look = categoryLook(expense.category)
  const CategoryIcon = look.icon
  const personal = isPersonal(expense)
  const queued = isTempId(expense.id)

  return (
    <div className={`expense-row ${busy ? 'is-busy' : ''} ${queued ? 'is-queued' : ''}`}>
      <span className={`expense-icon ${look.tone}`} title={expense.category ?? 'Uncategorised'}>
        <CategoryIcon size={18} />
      </span>

      <strong className="expense-title">{expense.title}</strong>

      <div className="expense-meta">
        {/* first name only: the full one pushes this line onto a second row on
            a phone, and the row already names them nowhere else */}
        {!personal && (
          <span>
            {expense.iPaid ? 'You' : expense.paidBy?.name?.split(' ')[0] ?? 'Someone'} paid {money(expense.totalAmount)}
          </span>
        )}
        {expense.category && <span className="expense-cat-text">{expense.category}</span>}
        <span>{whenLabel(expense.date, timeOnly)}</span>
        {personal && expense.notes && <span className="expense-note">{expense.notes}</span>}
        {/* posted by a recurring schedule rather than typed by anyone */}
        {expense.createdVia === 'SYSTEM' && <span className="expense-auto">auto</span>}
      </div>

      <div className="expense-share">
        {!personal && <small>your share</small>}
        {/* rendered as returned — the server assigns the rounding remainder */}
        <strong>{money(expense.myShare ?? expense.totalAmount)}</strong>
      </div>

      {/* the slot is always rendered, empty when this member may not touch the
          expense, so the columns stay aligned down the list */}
      <div className="expense-actions">
        {onSettle && (
          <button className="expense-settle" onClick={() => onSettle(expense)}
            aria-label={`Record a payment for ${expense.title}`}
            title={`Pay your share of ${expense.title}`}>
            <HandCoins size={15} />
          </button>
        )}
        {canEdit && (
          <>
            <button className="expense-edit" onClick={() => onEdit(expense)}
              aria-label={`Edit ${expense.title}`}>
              <Pencil size={15} />
            </button>
            <button className="expense-delete" onClick={() => onDelete(expense)}
              aria-label={`Delete ${expense.title}`}>
              <Trash2 size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
