import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  ArrowLeft, CircleAlert, IndianRupee, Lightbulb, Lock, Pencil, RefreshCw, TriangleAlert, Wallet, X,
} from 'lucide-react'
import { categoryLook } from '../data/expenseCategories'
import { usePlanner } from '../hooks/usePlanner'
import { CADENCE_LABEL } from '../services/recurring'
import type { EstimatedItem, Plan } from '../services/planner'
import './PlannerPage.scss'

/**
 * What is actually left to save.
 *
 * Income, minus what is already committed, minus what history says the rest of
 * the month costs. One subtraction nobody can do in their head, because the
 * second half is scattered across a rent schedule, four subscriptions and three
 * months of dinners.
 *
 * Every figure here comes from the server computed — see docs/budget-planner.md
 * §5.2. The page's job is to make the subtraction legible and every line of it
 * traceable, not to do the maths again.
 */

const money = (value: number) => `₹${Math.round(Math.abs(value)).toLocaleString('en-IN')}`

export function PlannerPage() {
  const { plan, loading, error, busyId, saving, retry, saveIncome, patchItem, recalculate } = usePlanner()
  const [editingIncome, setEditingIncome] = useState(false)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [editingItem, setEditingItem] = useState<EstimatedItem | null>(null)

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

  const short = plan.canSave < 0
  const suggestions = plan.suggestions.filter((item) => !dismissed.includes(item.id))
  const targetGap = plan.savingsTarget !== null ? plan.canSave - plan.savingsTarget : null

  return (
    <section className="planner-page">
      <Link to="/expenses" className="back-link"><ArrowLeft size={16} /> Back to Money</Link>

      {/* The number. Everything else on the page explains or improves it. */}
      <section className={`planner-headline ${short ? 'is-short' : ''}`}>
        <p className="eyebrow">{short ? 'This month does not balance' : 'You can save'}</p>
        <strong>{short ? `${money(plan.canSave)} short` : `${money(plan.canSave)}`}</strong>
        <p className="planner-sub">
          {short
            ? 'Your commitments and usual spending come to more than you earn.'
            : <>{Math.round(plan.savingsRate)}% of what you earn
                {targetGap !== null && (
                  targetGap >= 0
                    ? <> · {money(targetGap)} past your {money(plan.savingsTarget as number)} target</>
                    : <> · {money(targetGap)} short of your {money(plan.savingsTarget as number)} target</>
                )}
              </>}
        </p>
      </section>

      <Waterfall plan={plan} />

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
                    {CADENCE_LABEL[item.cadence]}
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
          <h2>Everything else</h2>
          <span className="planner-total">{money(plan.estimated.total)}</span>
        </div>
        <p className="muted">
          {plan.estimated.basis
            ? plan.estimated.basis.complete
              ? `Averaged from your last ${plan.estimated.basis.months} complete months.`
              : `Based on the ${plan.estimated.basis.months} month${plan.estimated.basis.months === 1 ? '' : 's'} of history you have so far.`
            : 'Estimated from your spending history.'}
        </p>

        <div className="plan-list">
          {plan.estimated.items.map((item) => {
            const look = categoryLook(item.category)
            const Icon = look.icon
            return (
              <div className={`plan-row ${item.included ? '' : 'is-off'} ${busyId === item.id ? 'is-busy' : ''}`} key={item.id}>
                <span className={`delta-icon ${look.tone}`}><Icon size={15} /></span>

                <div className="plan-copy">
                  <strong>{item.category}</strong>
                  <small>
                    {item.source === 'OVERRIDE' ? 'Your figure'
                      : item.source === 'BUDGET' ? 'From the budget you set'
                        : `Usually ${money(item.median)} · last month ${money(item.lastMonth)}`}
                  </small>

                  {/* Named, not silently removed: the app does not get to decide
                      which of somebody's spending was real. */}
                  {item.outlier && item.source === 'AVERAGE' && (
                    <p className="plan-outlier">
                      <TriangleAlert size={12} />
                      {money(item.outlier.amount)} of this is “{item.outlier.title}” on{' '}
                      {format(parseISO(item.outlier.date), 'd MMM')}.
                      <button onClick={() => patchItem(item.id, { amountOverride: item.median })}>
                        Use your usual {money(item.median)}
                      </button>
                    </p>
                  )}
                </div>

                <button className="plan-amount is-editable" onClick={() => setEditingItem(item)}
                  title="Type your own figure">
                  {money(item.amountOverride ?? item.monthly)}
                  <Pencil size={12} />
                </button>

                <label className="plan-switch" title={item.included ? 'Counted in the plan' : 'Left out'}>
                  <input
                    type="checkbox"
                    checked={item.included}
                    onChange={(event) => patchItem(item.id, { included: event.target.checked })}
                  />
                  <span />
                </label>
              </div>
            )
          })}

          {plan.estimated.items.length === 0 && (
            <p className="plan-empty">No spending history yet, so there is nothing to estimate from.</p>
          )}
        </div>

        <button className="text-button planner-recalc" onClick={recalculate} disabled={saving}>
          <RefreshCw size={14} /> Refresh from my latest spending
        </button>
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

      {editingItem && (
        <OverrideDialog
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={async (value) => {
            await patchItem(editingItem.id, { amountOverride: value })
            setEditingItem(null)
          }}
        />
      )}
    </section>
  )
}

/**
 * Income at the left, the two subtractions stepping down, savings standing at
 * the right.
 *
 * The middle two bars float: each starts where the one before it ended, so the
 * picture is the subtraction rather than four unrelated columns. That is the
 * whole reason this is not a pie — a pie cannot show something being taken away.
 */
function Waterfall({ plan }: { plan: Plan }) {
  const income = Math.max(plan.monthlyIncome, 1)
  const pct = (value: number) => (Math.abs(value) / income) * 100
  const clamp = (value: number) => Math.max(0, Math.min(100, value))

  const committed = pct(plan.committed.total)
  const estimated = pct(plan.estimated.total)
  const left = pct(plan.canSave)

  const steps = [
    { key: 'income', label: 'Income', value: plan.monthlyIncome, tone: 'income', bottom: 0, height: 100 },
    // hangs from the top of the income bar
    { key: 'committed', label: 'Committed', value: plan.committed.total, tone: 'committed', bottom: 100 - committed, height: committed },
    // and this one from the bottom of that
    { key: 'estimated', label: 'Spending', value: plan.estimated.total, tone: 'estimated', bottom: 100 - committed - estimated, height: estimated },
    {
      key: 'save',
      label: plan.canSave < 0 ? 'Short' : 'Left to save',
      value: plan.canSave,
      tone: plan.canSave < 0 ? 'short' : 'save',
      bottom: 0,
      height: left,
    },
  ]

  return (
    <div className="waterfall" aria-hidden="true">
      {steps.map((step) => (
        <div className={`fall-step is-${step.tone}`} key={step.key}>
          <span className="fall-value">{money(step.value)}</span>
          <span className="fall-track">
            <i style={{ bottom: `${clamp(step.bottom)}%`, height: `${Math.max(2, clamp(step.height))}%` }} />
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

function OverrideDialog({
  item, onClose, onSave,
}: {
  item: EstimatedItem
  onClose: () => void
  onSave: (value: number | null) => void
}) {
  const [value, setValue] = useState(String(Math.round(item.amountOverride ?? item.monthly)))

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal override-modal" role="dialog" aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>{item.category} each month</h2>
            <p className="muted">
              Averaged at {money(item.monthly)}. Your usual month is {money(item.median)}.
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <form onSubmit={(event) => { event.preventDefault(); onSave(Number(value) || 0) }}>
          <div className="field">
            <span className="control adorned">
              <IndianRupee size={17} />
              <input type="number" min="0" step="any" inputMode="decimal" autoFocus
                value={value} onChange={(event) => setValue(event.target.value)} />
            </span>
          </div>

          <footer className="modal-actions">
            {/* clearing it resumes tracking history rather than pinning zero */}
            {item.amountOverride !== null && (
              <button type="button" className="voice-ghost" onClick={() => onSave(null)}>
                Go back to the average
              </button>
            )}
            <button className="modal-submit">Use this figure</button>
          </footer>
        </form>
      </div>
    </div>
  )
}
