import { format } from 'date-fns'
import { DonutChart } from '../charts/Charts'
import { colorFor } from '../charts/palette'
import type { Expense } from '../../services/expenses'
import type { Analytics } from '../../hooks/useGroupAnalytics'
import './SpendReport.scss'

const money = (value: number) =>
  `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * The printable report.
 *
 * Hidden on screen and laid out for paper — the browser's own "Save as PDF" is
 * the export, which keeps a PDF library (larger than this whole bundle) out of
 * the app and makes the output selectable text rather than a picture of text.
 *
 * What it adds over the screen: every member crossed against every category, so
 * you can see what one person spent on travel rather than only the group total.
 */
export function SpendReport({
  groupName, heading, analytics, expenses,
}: {
  groupName: string
  heading: string
  analytics: Analytics
  expenses: Expense[]
}) {
  const categories = analytics.byCategory.map((slice) => slice.label)

  // member × category, summed from the shares themselves so the table always
  // agrees with the balances rather than re-deriving a split
  const perPerson = analytics.byMember.map((member) => {
    const cells = new Map<string, number>()
    for (const expense of expenses) {
      const share = expense.shares.find((row) => row.userId === member.userId)
      if (!share) continue
      const key = expense.category?.trim() || 'Uncategorised'
      cells.set(key, (cells.get(key) ?? 0) + share.amount)
    }
    return { member, cells, total: [...cells.values()].reduce((sum, value) => sum + value, 0) }
  })

  return (
    <div className="spend-report">
      <header className="report-head">
        <div>
          <p className="report-kicker">QuickPlan · spend report</p>
          <h1>{groupName}</h1>
          <p className="report-window">{heading}</p>
        </div>
        <p className="report-printed">Prepared {format(new Date(), 'd MMM yyyy, h:mm a')}</p>
      </header>

      <section className="report-totals">
        <div><small>Total spent</small><strong>{money(analytics.totalSpent)}</strong></div>
        <div><small>Expenses</small><strong>{analytics.count}</strong></div>
        <div><small>Average</small><strong>{money(analytics.average)}</strong></div>
        <div><small>Per head</small><strong>{money(analytics.perPerson)}</strong></div>
      </section>

      <section className="report-block">
        <h2>Where it went</h2>
        <div className="report-split">
          <DonutChart slices={analytics.byCategory} total={analytics.totalSpent} caption="total" format={money} />
          <table className="report-table">
            <thead><tr><th>Category</th><th>Total</th><th>Share</th></tr></thead>
            <tbody>
              {analytics.byCategory.map((slice, index) => (
                <tr key={slice.label}>
                  <td><i className="report-swatch" style={{ background: colorFor(slice.label, index) }} /> {slice.label}</td>
                  <td>{money(slice.value)}</td>
                  <td>{slice.share.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="report-block">
        <h2>Who paid, who owes</h2>
        <table className="report-table">
          <thead><tr><th>Person</th><th>Paid</th><th>Their share</th><th>Net</th></tr></thead>
          <tbody>
            {analytics.byMember.map((member) => (
              <tr key={member.userId}>
                <td>{member.name}</td>
                <td>{money(member.paid)}</td>
                <td>{money(member.share)}</td>
                <td className={member.net >= 0 ? 'up' : 'down'}>
                  {member.net >= 0 ? '+' : '−'}{money(Math.abs(member.net))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="report-block">
        <h2>Each person, by category</h2>
        <table className="report-table">
          <thead>
            <tr>
              <th>Person</th>
              {categories.map((category) => <th key={category}>{category}</th>)}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {perPerson.map(({ member, cells, total }) => (
              <tr key={member.userId}>
                <td>{member.name}</td>
                {categories.map((category) => (
                  <td key={category}>{cells.get(category) ? money(cells.get(category) as number) : '—'}</td>
                ))}
                <td><strong>{money(total)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="report-foot">
        Built in the browser from this group's own expenses. Every figure is a share recorded on an
        expense, so the report and the balances cannot disagree.
      </footer>
    </div>
  )
}
