import { Link } from 'react-router-dom'
import { ChevronRight, Target, TriangleAlert } from 'lucide-react'
import { BudgetRing } from './BudgetRing'
import type { BudgetStatusReport } from '../../services/budgets'
import './BudgetStrip.scss'

/**
 * The budgets, on the page where the spending is.
 *
 * A budget answers "where am I now", which is the question that changes a
 * decision *before* the money is spent — so it belongs above the ledger rather
 * than on a page you have to remember to visit.
 */

const money = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`

export function BudgetStrip({ status }: { status: BudgetStatusReport | null }) {
  if (!status) return null

  const { overall, categories, period } = status
  const lines = [...(overall ? [overall] : []), ...categories]
  if (lines.length === 0) return null

  // how far through the period we are, which is what the rings mark
  const pace = period.daysTotal > 0 ? Math.min(1, period.daysElapsed / period.daysTotal) : 0
  const overspent = lines.filter((line) => line.status === 'EXCEEDED')

  const headline = overall ?? null
  const projection = headline && headline.projected > headline.amount && pace > 0 && pace < 1

  return (
    <section className="budget-strip">
      <header>
        <h2><Target size={15} /> Budgets</h2>
        <Link to="/expenses/budgets" className="budget-manage">
          Manage <ChevronRight size={15} />
        </Link>
      </header>

      {/* Said as a sentence, because a ring cannot say "at this rate". */}
      {projection && (
        <p className="budget-warn">
          <TriangleAlert size={14} />
          At this rate you will finish the period at {money(headline.projected)} against
          a {money(headline.amount)} budget.
        </p>
      )}

      {!projection && overspent.length > 0 && (
        <p className="budget-warn">
          <TriangleAlert size={14} />
          {overspent.length === 1
            ? `${overspent[0].category ?? 'Your overall budget'} is ${money(-overspent[0].remaining)} over.`
            : `${overspent.length} budgets are over their limit.`}
        </p>
      )}

      <div className="budget-rings">
        {lines.map((line) => <BudgetRing key={line.budgetId || line.category || 'overall'} line={line} pace={pace} />)}
      </div>
    </section>
  )
}
