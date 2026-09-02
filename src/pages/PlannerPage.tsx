import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  ArrowDownLeft, ArrowLeft, CircleAlert, IndianRupee, Lightbulb, Lock, Pencil, Wallet, X,
} from 'lucide-react'
import { categoryLook } from '../data/expenseCategories'
import { useMonthSpending } from '../hooks/useMonthSpending'
import { usePlanner } from '../hooks/usePlanner'
import { cadenceLabel } from '../services/recurring'
import { sharePercent } from '../utils/share'
import type { Plan } from '../services/planner'
import './PlannerPage.scss'

/**
 * What is left of this month.
 *
 * Income, minus what is already committed, minus what has actually been spent
 * since the 1st. One subtraction nobody can do in their head, because the
 * second half is scattered across a rent schedule and three weeks of receipts.
 *
 * **This is a running balance, not a forecast.** It used to average the last
 * three months, which is the wrong answer for somebody asking where *this*
 * month is going and no answer at all for somebody two weeks into using the
 * app. Real expenses, added up, with the month's pace stated underneath so the
 * number cannot be mistaken for a whole-month figure on the 4th.
 *
 * The commitments and their switches still come from the server computed. The
 * month's spending is added up here, from the expenses themselves.
 */

const money = (value: number) => `₹${Math.round(Math.abs(value)).toLocaleString('en-IN')}`

export function PlannerPage() {
  const { plan, loading, error, busyId, saving, retry, saveIncome, patchItem } = usePlanner()
  const month = useMonthSpending()
  const [editingIncome, setEditingIncome] = useState(false)
  const [dismissed, setDismissed] = useState<string[]>([])

  if (loading) {
    return (
      <section className="planner-page">
        <Link to="/expenses" className="back-link"><ArrowLeft size={16} /> Back to Money</Link>
        <div className="planner-loading" />
      </section>
    )
  }

  if (error) {
    return (
      <section className="planner-page">
        <Link to="/expenses" className="back-link"><ArrowLeft size={16} /> Back to Money</Link>
        <div className="panel-state">
          <CircleAlert size={22} />
          <p>{error}</p>
          <button className="text-button" onClick={retry}>Try again</button>
        </div>
      </section>
    )
  }

  // Until income is known nothing below it means anything, so the page is one
  // question rather than a form with an empty answer at the top.
  if (!plan || editingIncome) {
    return (
      <section className="planner-page">
        <Link to="/expenses" className="back-link"><ArrowLeft size={16} /> Back to Money</Link>
        <IncomeForm
          current={plan}
          saving={saving}
          onCancel={plan ? () => setEditingIncome(false) : undefined}
          onSave={async (income, target) => {
            await saveIncome(income, target)
            setEditingIncome(false)
          }}
        />
      </section>
    )
  }

  /*
   * Computed here rather than taken from `plan.canSave`, because the server's
   * figure is built on a three-month average and this page is now showing the
   * month as it actually stands. Two different questions; only one is on
   * screen. See docs/budget-planner.md — the basis belongs server-side
   * eventually, and that is a one-parameter change to GET /api/planner.
   */
  const left = plan.monthlyIncome - plan.committed.total - month.total + month.received
  const short = left < 0
  const suggestions = plan.suggestions.filter((item) => !dismissed.includes(item.id))
  const targetGap = plan.savingsTarget !== null ? left - plan.savingsTarget : null

  const { daysElapsed, daysTotal } = month.period
  // spending to date, carried forward at the same rate
  const projected = daysElapsed > 0 ? (month.total / daysElapsed) * daysTotal : 0
  const projectedLeft = plan.monthlyIncome - plan.committed.total - projected + month.received
  const midMonth = daysElapsed > 2 && daysElapsed < daysTotal

  return (
    <section className="planner-page">
      <Link to="/expenses" className="back-link"><ArrowLeft size={16} /> Back to Money</Link>

      {/* The number. Everything else on the page explains or improves it. */}
      <section className={`planner-headline ${short ? 'is-short' : ''}`}>
        <p className="eyebrow">{short ? 'This month does not balance' : 'Left of this month'}</p>
        <strong>{short ? `${money(left)} short` : money(left)}</strong>
        <p className="planner-sub">
          {short
            ? 'Your commitments and what you have spent come to more than you earn.'
            : <>{Math.round((left / Math.max(plan.monthlyIncome, 1)) * 100)}% of what you earn
                {targetGap !== null && (
                  targetGap >= 0
                    ? <> · {money(targetGap)} past your {money(plan.savingsTarget as number)} target</>
                    : <> · {money(targetGap)} short of your {money(plan.savingsTarget as number)} target</>
                )}
              </>}
        </p>

        {/* A running balance read on the 4th would flatter you badly, so the
            pace is stated beside it rather than left to be inferred. */}
        {midMonth && month.total > 0 && (
          <p className="planner-pace">
            Day {daysElapsed} of {daysTotal}. At this rate the month ends
            at {money(projected)} spent, leaving {money(projectedLeft)}.
          </p>
        )}
      </section>

      <Waterfall plan={plan} spent={month.total} received={month.received} />

      <section className="panel planner-income">
        <div>
          <small>Monthly income</small>
          <strong>{money(plan.monthlyIncome)}</strong>
        </div>
        <button className="text-button" onClick={() => setEditingIncome(true)}>
          <Pencil size={14} /> Change
        </button>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Already committed</h2>
          <span className="planner-total">{money(plan.committed.total)}</span>
        </div>
        {/* said once, quietly, so the absence of suggestions here reads as
            deliberate rather than as the page having missed something */}
        <p className="muted"><Lock size={13} /> Fixed costs. The planner never suggests cutting these.</p>

        <div className="plan-list">
          {plan.committed.items.map((item) => {
            const look = categoryLook(item.category)
            const Icon = look.icon
            const off = !item.included || item.paused
            return (
              <div className={`plan-row ${off ? 'is-off' : ''} ${busyId === item.id ? 'is-busy' : ''}`} key={item.id}>
                <span className={`delta-icon ${look.tone}`}><Icon size={15} /></span>
                <div className="plan-copy">
                  <strong>{item.label}</strong>
                  <small>
                    {cadenceLabel(item.cadence, item.interval)}
                    {item.cadence !== 'MONTHLY' && <> · {money(item.amount)} each time</>}
                    {item.paused && ' · paused'}
                  </small>
                </div>
                <strong className="plan-amount">{money(item.monthly)}</strong>
                <label className="plan-switch" title={item.included ? 'Counted in the plan' : 'Left out'}>
                  <input
                    type="checkbox"
                    checked={item.included && !item.paused}
                    disabled={item.paused}
                    onChange={(event) => patchItem(item.id, { included: event.target.checked })}
                  />
                  <span />
                </label>
              </div>
            )
          })}

          {plan.committed.items.length === 0 && (
            <p className="plan-empty">
              Nothing scheduled yet. <Link to="/expenses/recurring">Add your rent or a subscription</Link> and
              it lands here.
            </p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Out so far this month</h2>
          <span className="planner-total">{money(month.total)}</span>
        </div>
        <p className="muted">
          {format(month.period.from, 'd MMM')} – {format(new Date(), 'd MMM')} · everything that left
          the account, including what you fronted in groups.
          {month.received > 0 && <> {money(month.received)} came back.</>}
        </p>

        {month.error && (
          <p className="plan-empty">{month.error} <button className="text-button" onClick={month.reload}>Try again</button></p>
        )}

        <div className="plan-list">
          {month.categories.map((row) => {
            const look = categoryLook(row.category)
            const Icon = look.icon
            // what this category is of everything spent — the comparison that
            // makes the list worth reading rather than just a set of totals
            const share = month.total > 0 ? (row.total / month.total) * 100 : 0
            return (
              <div className="plan-row is-static" key={row.category}>
                <span className={`delta-icon ${look.tone}`}><Icon size={15} /></span>
                <div className="plan-copy">
                  <strong>{row.category}</strong>
                  <small>
                    {row.count} expense{row.count === 1 ? '' : 's'} · {sharePercent(share)} of the month
                    {row.largest && row.count > 1 && <> · biggest {money(row.largest.amount)}</>}
                  </small>
                  <span className="plan-bar"><i style={{ width: `${Math.max(2, share)}%`, background: look.color }} /></span>
                </div>
                <strong className="plan-amount">{money(row.total)}</strong>
              </div>
            )
          })}

          {month.received > 0 && (
            <div className="plan-row is-static is-credit">
              <span className="delta-icon tone-stay"><ArrowDownLeft size={15} /></span>
              <div className="plan-copy">
                <strong>Came back to you</strong>
                <small>Settlements from group expenses you paid for</small>
              </div>
              <strong className="plan-amount">+{money(month.received)}</strong>
            </div>
          )}

          {!month.loading && month.categories.length === 0 && month.received === 0 && (
            <p className="plan-empty">
              Nothing has moved yet this month. Anything you record in{' '}
              <Link to="/expenses">Money</Link> lands here.
            </p>
          )}
        </div>
      </section>

      {suggestions.length > 0 && (
        <section className="panel">
          <div className="panel-heading"><h2>Where it could go further</h2></div>
          <p className="muted">Biggest first. Each one says where the number came from.</p>

          <div className="suggestion-list">
            {suggestions.map((item) => (
              <div className="suggestion" key={item.id}>
                <span className="suggestion-icon"><Lightbulb size={16} /></span>
                <div>
                  <strong>{item.headline}</strong>
                  <small>{item.evidence}</small>
                </div>
                <span className="suggestion-saves">{money(item.saves)}<i>a month</i></span>
                <button className="suggestion-dismiss" aria-label="Dismiss"
                  onClick={() => setDismissed((current) => [...current, item.id])}>
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

    </section>
  )
}

/**
 * Income at the left, each step landing where the one before it ended, savings
 * standing at the right.
 *
 * Bars span between two running values rather than growing from the floor, so a
 * step can go *up* as well as down — which is what money coming back from a
 * group does, and a chart that could only subtract would have to hide it.
 */
function Waterfall({ plan, spent, received }: { plan: Plan, spent: number, received: number }) {
  const income = plan.monthlyIncome
  const afterCommitted = income - plan.committed.total
  const afterSpent = afterCommitted - spent
  const left = afterSpent + received

  const steps = [
    { key: 'income', label: 'Income', value: income, from: 0, to: income, tone: 'income' },
    { key: 'committed', label: 'Committed', value: plan.committed.total, from: afterCommitted, to: income, tone: 'committed' },
    { key: 'spent', label: 'Out', value: spent, from: afterSpent, to: afterCommitted, tone: 'estimated' },
    ...(received > 0
      ? [{ key: 'received', label: 'Back in', value: received, from: afterSpent, to: left, tone: 'received' }]
      : []),
    {
      key: 'left',
      label: left < 0 ? 'Short' : 'Left',
      value: left,
      from: Math.min(0, left),
      to: Math.max(0, left),
      tone: left < 0 ? 'short' : 'save',
    },
  ]

  const bounds = steps.flatMap((step) => [step.from, step.to]).concat(0)
  const min = Math.min(...bounds)
  const max = Math.max(...bounds)
  const span = max - min || 1

  const pct = (value: number) => ((value - min) / span) * 100

  return (
    <div className="waterfall" aria-hidden="true">
      {steps.map((step) => (
        <div className={`fall-step is-${step.tone}`} key={step.key}>
          <span className="fall-value">{money(step.value)}</span>
          <span className="fall-track">
            <i style={{
              bottom: `${pct(step.from)}%`,
              height: `${Math.max(2, pct(step.to) - pct(step.from))}%`,
            }} />
          </span>
          <span className="fall-label">{step.label}</span>
        </div>
      ))}
    </div>
  )
}

function IncomeForm({
  current, saving, onSave, onCancel,
}: {
  current: Plan | null
  saving: boolean
  onSave: (income: number, target: number | null) => void
  onCancel?: () => void
}) {
  const [income, setIncomeValue] = useState(current ? String(current.monthlyIncome) : '')
  const [target, setTarget] = useState(current?.savingsTarget ? String(current.savingsTarget) : '')
  const [error, setError] = useState('')

  return (
    <section className="panel planner-ask">
      <h1>What do you take home each month?</h1>
      <p className="muted">
        The only thing the app cannot work out for itself. Everything below it comes from your
        schedules and your spending.
      </p>

      <form onSubmit={(event) => {
        event.preventDefault()
        const value = Number(income) || 0
        if (value <= 0) return setError('Enter what actually reaches your account.')
        onSave(value, target ? Number(target) : null)
      }}>
        <div className="field">
          <label className="field-label" htmlFor="planner-income">Monthly income</label>
          <span className="control adorned">
            <IndianRupee size={17} />
            <input id="planner-income" type="number" min="0" step="any" inputMode="decimal" autoFocus
              value={income} onChange={(event) => { setIncomeValue(event.target.value); setError('') }}
              placeholder="85000" disabled={saving} />
          </span>
          <p className="field-hint">Take-home pay, after tax and deductions.</p>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="planner-target">
            Savings target <span className="field-optional">optional</span>
          </label>
          <span className="control adorned">
            <IndianRupee size={17} />
            <input id="planner-target" type="number" min="0" step="any" inputMode="decimal"
              value={target} onChange={(event) => setTarget(event.target.value)}
              placeholder="20000" disabled={saving} />
          </span>
        </div>

        {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}

        <footer className="modal-actions">
          {onCancel && <button type="button" className="voice-ghost" onClick={onCancel} disabled={saving}>Cancel</button>}
          <button className="modal-submit" disabled={saving}>
            <Wallet size={18} /> {current ? 'Save' : 'Work it out'}
          </button>
        </footer>
      </form>
    </section>
  )
}
