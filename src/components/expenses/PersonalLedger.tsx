import { useEffect, useMemo, useState } from 'react'
import { CircleAlert, TrendingUp, Wallet } from 'lucide-react'
import { format, parseISO, startOfMonth } from 'date-fns'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { ExpenseRow } from './ExpenseRow'
import { PersonalExpenseModal } from './PersonalExpenseModal'
import { usePersonalExpenses } from '../../hooks/usePersonalExpenses'
import { useAppStore } from '../../store/useAppStore'
import type { Expense } from '../../services/expenses'
import './PersonalLedger.scss'

/**
 * Your own ledger.
 *
 * Grouped by day rather than listed flat: spending reads as a sequence of days,
 * and a day's total is the number people actually check. The month summary on
 * top answers the same question at the other scale.
 */

const money = (value: number) => `₹${value.toFixed(2)}`

function dayLabel(iso: string) {
  const at = parseISO(iso)
  if (Number.isNaN(at.getTime())) return 'Undated'
  const today = new Date()
  if (format(at, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) return 'Today'
  return format(at, 'EEEE, d MMM')
}

export function PersonalLedger() {
  const { expenses, spent, loading, error, busyId, retry, reload, remove } = usePersonalExpenses()

  // the dialog lives in the store so the app shell's mobile FAB can open it
  const adding = useAppStore((state) => state.moneyComposerOpen)
  const setAdding = useAppStore((state) => state.setMoneyComposerOpen)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null)

  // leaving the page with the dialog open would otherwise reopen it on return
  useEffect(() => () => setAdding(false), [setAdding])

  const thisMonth = useMemo(() => {
    const from = startOfMonth(new Date()).getTime()
    return expenses
      .filter((expense) => new Date(expense.date).getTime() >= from)
      .reduce((sum, expense) => sum + expense.totalAmount, 0)
  }, [expenses])

  /** Consecutive runs of the same day, in the order the list already has. */
  const days = useMemo(() => {
    const out: { key: string; label: string; total: number; items: Expense[] }[] = []
    for (const expense of expenses) {
      const key = expense.date.slice(0, 10)
      const last = out[out.length - 1]
      if (last?.key === key) {
        last.items.push(expense)
        last.total += expense.totalAmount
      } else {
        out.push({ key, label: dayLabel(expense.date), total: expense.totalAmount, items: [expense] })
      }
    }
    return out
  }, [expenses])

  return (
    <>
      {!loading && !error && expenses.length > 0 && (
        <div className="balance-summary">
          {/* Neither number is good or bad news — this is just what you spent —
              so the group side's green-for-owed and red-for-owing would say
              something untrue here. Only the headline figure is tinted. */}
          <div className="balance-card up">
            <span>This month</span>
            <strong>{money(thisMonth)}</strong>
          </div>
          <div className="balance-card">
            <span>All recorded</span>
            <strong>{money(spent)}</strong>
          </div>
        </div>
      )}

      {loading && (
        <div className="ledger-skeletons">
          {[0, 1, 2, 3].map((i) => <div className="ledger-skeleton" key={i} />)}
        </div>
      )}

      {!loading && error && (
        <div className="panel-state">
          <CircleAlert size={22} />
          <p>{error}</p>
          <button className="text-button" onClick={retry}>Try again</button>
        </div>
      )}

      {!loading && !error && expenses.length === 0 && (
        <div className="groups-empty">
          <span className="empty-wallet"><Wallet size={30} /></span>
          <p>Nothing recorded yet. Your own spending lives here — a coffee needs no group.</p>
          <button className="text-button" onClick={() => setAdding(true)}>Add your first expense</button>
        </div>
      )}

      {!loading && !error && days.length > 0 && (
        <div className="ledger">
          {days.map((day) => (
            <section className="ledger-day" key={day.key}>
              <header>
                <h3>{day.label}</h3>
                <strong>{money(day.total)}</strong>
              </header>
              <div className="expense-list">
                {day.items.map((expense) => (
                  <ExpenseRow
                    key={expense.id}
                    expense={expense}
                    // it is your own ledger; there is nobody else it could belong to
                    canEdit
                    busy={busyId === expense.id}
                    onEdit={setEditing}
                    onDelete={setPendingDelete}
                  />
                ))}
              </div>
            </section>
          ))}

          <p className="ledger-foot">
            <TrendingUp size={14} />
            {expenses.length} expense{expenses.length === 1 ? '' : 's'} recorded
          </p>
        </div>
      )}

      <PersonalExpenseModal
        open={adding || editing !== null}
        expense={editing}
        onClose={() => { setAdding(false); setEditing(null) }}
        onSaved={reload}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        busy={busyId === pendingDelete?.id}
        title="Delete this expense?"
        message={`"${pendingDelete?.title ?? ''}" will be removed from your ledger. This cannot be undone.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) await remove(pendingDelete)
          setPendingDelete(null)
        }}
      />
    </>
  )
}
