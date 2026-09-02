import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Calculator, CalendarClock, ChartPie, ChevronRight, CircleAlert, HandCoins, Repeat, Search,
  TrendingUp, Wallet, X,
} from 'lucide-react'
import { format, parseISO, startOfMonth, subDays } from 'date-fns'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { ExpenseRow } from './ExpenseRow'
import { PersonalExpenseModal } from './PersonalExpenseModal'
import { BudgetStrip } from '../budgets/BudgetStrip'
import { applyFilters, EMPTY_FILTERS, isFiltered, RANGE_LABEL, RANGES } from './ledgerFilter'
import { MovementRow } from './MovementRow'
import { useCashFlow } from '../../hooks/useCashFlow'
import { usePersonalExpenses } from '../../hooks/usePersonalExpenses'
import { useBudgets } from '../../hooks/useBudgets'
import { useAppStore } from '../../store/useAppStore'
import type { Expense } from '../../services/expenses'
import type { Movement } from '../../services/cashflow'
import './PersonalLedger.scss'

/**
 * Your own ledger.
 *
 * Grouped by day rather than listed flat: spending reads as a sequence of days,
 * and a day's total is the number people actually check. The month summary on
 * top answers the same question at the other scale.
 */

const money = (value: number) => `₹${value.toFixed(2)}`

/**
 * The local calendar day, which is the only one a person means.
 *
 * `date.slice(0, 10)` would read the UTC day out of the ISO string, and in
 * IST that is the *previous* day for anything before 05:30 — so a 1 AM coffee
 * would open its own group and inherit the wrong heading.
 */
function dayKey(iso: string) {
  const at = parseISO(iso)
  return Number.isNaN(at.getTime()) ? 'undated' : format(at, 'yyyy-MM-dd')
}

function dayLabel(key: string) {
  if (key === 'undated') return 'Undated'
  const today = format(new Date(), 'yyyy-MM-dd')
  if (key === today) return 'Today'
  if (key === format(subDays(new Date(), 1), 'yyyy-MM-dd')) return 'Yesterday'
  return format(parseISO(key), 'EEEE, d MMM')
}

export function PersonalLedger() {
  const { expenses, spent, loading, error, busyId, retry, reload, remove } = usePersonalExpenses()
  const { status: budgetStatus } = useBudgets()
  /*
   * Group money is part of the personal record: pay ₹4,000 for a dinner and the
   * account is ₹4,000 lighter that evening, whoever it was for. Settlements
   * appear as they happen — money in when somebody pays you back, money out
   * when you clear a share. See docs/cash-flow.md.
   */
  const cash = useCashFlow()

  // the dialog lives in the store so the app shell's mobile FAB can open it
  const adding = useAppStore((state) => state.moneyComposerOpen)
  const setAdding = useAppStore((state) => state.setMoneyComposerOpen)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null)
  const [filters, setFilters] = useState(EMPTY_FILTERS)

  // leaving the page with the dialog open would otherwise reopen it on return
  useEffect(() => () => setAdding(false), [setAdding])

  const searching = isFiltered(filters)
  const visible = useMemo(() => applyFilters(expenses, filters), [expenses, filters])
  const shownTotal = useMemo(
    () => visible.reduce((sum, expense) => sum + expense.totalAmount, 0),
    [visible],
  )

  /** Categories that actually appear, so the filter never offers an empty one. */
  const usedCategories = useMemo(
    () => [...new Set(expenses.map((expense) => expense.category?.trim() || 'Uncategorised'))].sort(),
    [expenses],
  )

  /*
   * Cash, not spending: the list holds a ₹4,000 dinner you fronted, so a total
   * that counted only your ₹1,000 share would not match the rows above it.
   */
  const month = useMemo(() => {
    const from = startOfMonth(new Date()).getTime()
    const since = (at: string) => new Date(at).getTime() >= from

    const own = expenses
      .filter((expense) => since(expense.date))
      .reduce((sum, expense) => sum + expense.totalAmount, 0)

    const group = cash.items
      .filter((movement) => movement.kind !== 'PERSONAL_EXPENSE' && since(movement.at))
      .reduce((totals, movement) => (movement.direction === 'IN'
        ? { ...totals, in: totals.in + movement.amount }
        : { ...totals, out: totals.out + movement.amount }), { out: 0, in: 0 })

    return { out: own + group.out, in: group.in }
  }, [expenses, cash.items])

  /**
   * One timeline of everything, newest first.
   *
   * A personal expense and a group movement are different rows but the same
   * day, and splitting them into two lists would make the day's total a lie.
   */
  const entries = useMemo(() => {
    const own = visible.map((expense) => ({
      key: `e-${expense.id}`, at: expense.date, expense, movement: null as Movement | null,
    }))

    // group movements are not searchable text, so a filtered view drops them
    const group = searching ? [] : cash.items
      .filter((movement) => movement.kind !== 'PERSONAL_EXPENSE')
      .map((movement) => ({ key: `m-${movement.id}`, at: movement.at, expense: null, movement }))

    return [...own, ...group].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  }, [visible, cash.items, searching])

  /** Consecutive runs of the same day, in the order the list already has. */
  const days = useMemo(() => {
    const out: { key: string; label: string; total: number; items: typeof entries }[] = []
    for (const entry of entries) {
      const key = dayKey(entry.at)
      // money arriving lifts the day's total rather than adding to it
      const delta = entry.expense
        ? entry.expense.totalAmount
        : entry.movement?.direction === 'IN' ? -entry.movement.amount : entry.movement?.amount ?? 0

      const last = out[out.length - 1]
      if (last?.key === key) {
        last.items.push(entry)
        last.total += delta
      } else {
        out.push({ key, label: dayLabel(key), total: delta, items: [entry] })
      }
    }
    return out
  }, [entries])

  return (
    <>
      {!loading && !error && expenses.length > 0 && (
        <div className="balance-summary">
          {/* Neither number is good or bad news — this is just what you spent —
              so the group side's green-for-owed and red-for-owing would say
              something untrue here. Only the headline figure is tinted. */}
          <div className="balance-card up">
            <span>Out this month</span>
            <strong>{money(month.out)}</strong>
          </div>
          {/* only worth a card when money has actually come back */}
          {month.in > 0 ? (
            <div className="balance-card">
              <span>Back in this month</span>
              <strong>{money(month.in)}</strong>
            </div>
          ) : (
            <div className="balance-card">
              <span>All recorded</span>
              <strong>{money(spent)}</strong>
            </div>
          )}
        </div>
      )}

      {/* Money of yours sitting with other people. It is not spending and it is
          not a balance — it is the thing a group app never tells you. */}
      {cash.outstanding && cash.outstanding.total > 0.5 && (
        <div className="ledger-outstanding">
          <span className="analysis-icon out"><HandCoins size={18} /></span>
          <div>
            <strong>{money(cash.outstanding.total)} is out with other people</strong>
            <small>
              {cash.outstanding.people.slice(0, 3).map((person) => person.name.split(' ')[0]).join(', ')}
              {cash.outstanding.people.length > 3 && ` and ${cash.outstanding.people.length - 3} more`}
              {' '}owe you from group expenses you paid.
            </small>
          </div>
        </div>
      )}

      <BudgetStrip status={budgetStatus} />

      {!loading && !error && expenses.length > 0 && (
        <div className="ledger-links">
          <Link to="/expenses/analysis" className="ledger-analysis">
            <span className="analysis-icon"><ChartPie size={18} /></span>
            <div>
              <strong>See the analysis</strong>
              <small>By year, month, week or day — and against what you spent before.</small>
            </div>
            <ChevronRight size={18} />
          </Link>

          <Link to="/expenses/recurring" className="ledger-analysis">
            <span className="analysis-icon alt"><Repeat size={18} /></span>
            <div>
              <strong>Recurring</strong>
              <small>Rent, EMIs and subscriptions record themselves.</small>
            </div>
            <ChevronRight size={18} />
          </Link>

          <Link to="/expenses/forecast" className="ledger-analysis">
            <span className="analysis-icon fore"><CalendarClock size={18} /></span>
            <div>
              <strong>What's coming</strong>
              <small>Which day you'll be short, once the EMIs and bills land.</small>
            </div>
            <ChevronRight size={18} />
          </Link>

          <Link to="/expenses/planner" className="ledger-analysis">
            <span className="analysis-icon plan"><Calculator size={18} /></span>
            <div>
              <strong>Budget planner</strong>
              <small>Your income, minus what is already committed — and what is left to save.</small>
            </div>
            <ChevronRight size={18} />
          </Link>
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

      {!loading && !error && expenses.length > 0 && (
        <div className="ledger-filter">
          <label className="ledger-search">
            <Search size={16} />
            <input
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="Find an expense — a word, or the amount"
              aria-label="Search your expenses"
            />
            {filters.query && (
              <button type="button" aria-label="Clear search"
                onClick={() => setFilters((current) => ({ ...current, query: '' }))}>
                <X size={14} />
              </button>
            )}
          </label>

          <select value={filters.category} aria-label="Category"
            onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
            <option value="">Every category</option>
            {usedCategories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>

          <select value={filters.range} aria-label="Time"
            onChange={(event) => setFilters((current) => ({ ...current, range: event.target.value as typeof RANGES[number] }))}>
            {RANGES.map((range) => <option key={range} value={range}>{RANGE_LABEL[range]}</option>)}
          </select>
        </div>
      )}

      {/* What the filter is showing, so a short list never looks like a short
          ledger — and one tap back to everything. */}
      {!loading && !error && searching && (
        <p className="ledger-result">
          <strong>{visible.length}</strong> of {expenses.length} expense{expenses.length === 1 ? '' : 's'}
          {visible.length > 0 && <> · {money(shownTotal)}</>}
          <button className="text-button" onClick={() => setFilters(EMPTY_FILTERS)}>Clear</button>
        </p>
      )}

      {!loading && !error && searching && visible.length === 0 && (
        <div className="groups-empty">
          <span className="empty-wallet"><Search size={30} /></span>
          <p>Nothing matches that. Try a shorter word, or a wider date range.</p>
        </div>
      )}

      {!loading && !error && days.length > 0 && (
        <div className="ledger">
          {days.map((day) => (
            <section className="ledger-day" key={day.key}>
              <header>
                <h3>{day.label}</h3>
                <span className="ledger-total"><small>total</small> {money(day.total)}</span>
              </header>
              <div className="expense-list">
                {day.items.map((entry) => (entry.expense ? (
                  <ExpenseRow
                    key={entry.key}
                    expense={entry.expense}
                    // it is your own ledger; there is nobody else it could belong to
                    canEdit
                    busy={busyId === entry.expense.id}
                    // the day heading above already says which day this is
                    timeOnly
                    onEdit={setEditing}
                    onDelete={setPendingDelete}
                  />
                ) : (
                  <MovementRow key={entry.key} movement={entry.movement as Movement} />
                )))}
              </div>
            </section>
          ))}

          <p className="ledger-foot">
            <TrendingUp size={14} />
            {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} · what moved, not what it cost you
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
