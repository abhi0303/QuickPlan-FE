import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CircleAlert, Pencil, Plus, Target, Trash2, TrendingUp } from 'lucide-react'
import { BudgetRing } from '../components/budgets/BudgetRing'
import { BudgetModal } from '../components/budgets/BudgetModal'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { categoryLook } from '../data/expenseCategories'
import { useBudgets } from '../hooks/useBudgets'
import type { Budget } from '../services/budgets'
import './BudgetsPage.scss'

/**
 * Setting and keeping budgets.
 *
 * The rings answer "where am I"; the list under them answers "what did I say I
 * would spend", and the unbudgeted section answers the question nobody thinks
 * to ask — which of the things you actually spend on has no limit at all.
 */

const money = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`

const STATUS_COPY = {
  ON_TRACK: 'On track',
  WARNING: 'Getting close',
  EXCEEDED: 'Over budget',
} as const

export function BudgetsPage() {
  const { budgets, status, loading, error, busyId, retry, create, edit, archive } = useBudgets()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [pendingArchive, setPendingArchive] = useState<Budget | null>(null)

  const lines = [...(status?.overall ? [status.overall] : []), ...(status?.categories ?? [])]
  const pace = status && status.period.daysTotal > 0
    ? Math.min(1, status.period.daysElapsed / status.period.daysTotal)
    : 0

  // '' stands for the overall budget, which can only exist once
  const taken = budgets.map((budget) => budget.category ?? '')

  return (
    <section className="budgets-page">
      <Link to="/expenses" className="back-link"><ArrowLeft size={16} /> Back to Money</Link>

      <div className="page-head">
        <div>
          <p className="eyebrow">Budgets</p>
          <h1>What you meant to spend</h1>
          <p className="muted">
            {status && status.period.daysTotal > 0
              ? `Day ${status.period.daysElapsed} of ${status.period.daysTotal} in this period.`
              : 'A limit you can see yourself approaching, rather than one you find out about later.'}
          </p>
        </div>
        <button className="quick-add solid" onClick={() => setAdding(true)}>
          <Plus size={18} strokeWidth={2.4} /> Set a budget
        </button>
      </div>

      {loading && <div className="budgets-loading" />}

      {!loading && error && (
        <div className="panel-state">
          <CircleAlert size={22} />
          <p>{error}</p>
          <button className="text-button" onClick={retry}>Try again</button>
        </div>
      )}

      {!loading && !error && budgets.length === 0 && (
        <div className="groups-empty">
          <span className="empty-wallet"><Target size={30} /></span>
          <p>No budgets yet. Set one and the rest of Money starts telling you where you stand.</p>
          <button className="text-button" onClick={() => setAdding(true)}>Set your first budget</button>
        </div>
      )}

      {!loading && !error && lines.length > 0 && (
        <>
          <div className="budget-rings">
            {lines.map((line) => (
              <BudgetRing key={line.budgetId || line.category || 'overall'} line={line} pace={pace} />
            ))}
          </div>

          <section className="panel">
            <div className="panel-heading"><h2>Where each one stands</h2></div>

            <div className="budget-list">
              {lines.map((line) => {
                const budget = budgets.find((row) => row.id === line.budgetId)
                const look = categoryLook(line.category)
                const Icon = look.icon
                return (
                  <div className={`budget-row ${busyId === line.budgetId ? 'is-busy' : ''}`} key={line.budgetId || 'overall'}>
                    <span className={`delta-icon ${look.tone}`}><Icon size={15} /></span>

                    <div className="budget-copy">
                      <strong>{line.category ?? 'Everything'}</strong>
                      <small>
                        {money(line.spent)} of {money(line.amount)}
                        {line.remaining >= 0
                          ? ` · ${money(line.remaining)} left`
                          : ` · ${money(-line.remaining)} over`}
                      </small>
                    </div>

                    {/* the projection is the number that makes a budget useful
                        on the 9th, so it is shown, not just the bar */}
                    <div className="budget-figures">
                      <span className={`budget-status is-${line.status.toLowerCase().replace('_', '-')}`}>
                        {STATUS_COPY[line.status]}
                      </span>
                      {line.projected > 0 && pace > 0 && pace < 1 && (
                        <small><TrendingUp size={12} /> heading for {money(line.projected)}</small>
                      )}
                    </div>

                    <div className="budget-actions">
                      {budget && (
                        <>
                          <button onClick={() => setEditing(budget)} aria-label={`Edit the ${line.category ?? 'overall'} budget`}>
                            <Pencil size={15} />
                          </button>
                          <button className="danger" onClick={() => setPendingArchive(budget)}
                            aria-label={`Archive the ${line.category ?? 'overall'} budget`}>
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}

      {/* Spending with no limit behind it. This list is how somebody discovers
          the budget they should have set. */}
      {!loading && !error && (status?.unbudgeted.length ?? 0) > 0 && (
        <section className="panel">
          <div className="panel-heading"><h2>No budget yet</h2></div>
          <p className="muted">You spend on these and have set no limit for them.</p>

          <div className="unbudgeted">
            {status?.unbudgeted.map((row) => (
              <button key={row.category} className="unbudgeted-chip" onClick={() => setAdding(true)}>
                {row.category} <em>{money(row.spent)}</em>
              </button>
            ))}
          </div>
        </section>
      )}

      <BudgetModal
        open={adding || editing !== null}
        budget={editing}
        taken={taken}
        onClose={() => { setAdding(false); setEditing(null) }}
        onSave={create}
        onEdit={edit}
      />

      <ConfirmDialog
        open={pendingArchive !== null}
        busy={busyId === pendingArchive?.id}
        title="Archive this budget?"
        confirmLabel="Archive it"
        busyLabel="Archiving..."
        message={`The ${pendingArchive?.category ?? 'overall'} budget stops applying from now on. Periods that have already happened keep the limit that was in force, so your history does not change.`}
        onCancel={() => setPendingArchive(null)}
        onConfirm={async () => {
          if (pendingArchive) await archive(pendingArchive)
          setPendingArchive(null)
        }}
      />
    </section>
  )
}
