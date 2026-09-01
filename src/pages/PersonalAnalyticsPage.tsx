import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  ArrowLeft, CalendarOff, ChevronLeft, ChevronRight, CircleAlert, Info,
  Receipt, TrendingDown, TrendingUp, Wallet,
} from 'lucide-react'
import { BarList, ChartLegend, ColumnChart, DonutChart } from '../components/charts/Charts'
import { categoryLook } from '../data/expenseCategories'
import { LEVEL_LABEL, LEVELS, usePersonalAnalytics } from '../hooks/usePersonalAnalytics'
import { sharePercent } from '../utils/share'
import '../styles/analytics.scss'
import './PersonalAnalyticsPage.scss'

/**
 * Where your own money went.
 *
 * The group analysis answers "who owes whom". This one answers "am I spending
 * more than I was, and on what", so everything on it is a comparison: the
 * window against the one before it, a category against its own past, and the
 * current month against the rate it is running at. A total on its own is
 * trivia — it only means something next to another number.
 */

const money = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`
const exact = (value: number) => `₹${value.toFixed(2)}`

/** "up 18%" reads better than "+18%", and needs no sign to be understood. */
function deltaLabel(delta: number, share: number, previous: number) {
  if (previous <= 0) return delta > 0 ? 'nothing to compare with' : 'no spending either way'
  if (Math.abs(share) < 1) return 'about the same'
  return `${delta > 0 ? 'up' : 'down'} ${Math.abs(Math.round(share))}% · ${money(Math.abs(delta))}`
}

export function PersonalAnalyticsPage() {
  const {
    analytics, expenses, loading, error, truncated, retry,
    level, heading, trail, goTo, shift, jumpToNow, drillInto, canDrill, isNow, hasHistory,
  } = usePersonalAnalytics()

  if (error) {
    return (
      <section className="analytics-page">
        <Link to="/expenses" className="back-link"><ArrowLeft size={16} /> Back to Money</Link>
        <div className="panel-state">
          <CircleAlert size={22} />
          <p>{error}</p>
          <button className="text-button" onClick={retry}>Try again</button>
        </div>
      </section>
    )
  }

  /** The expenses behind one slice, newest first. */
  function detailsFor(label: string) {
    return expenses
      .filter((expense) => (expense.category?.trim() || 'Uncategorised') === label)
      .map((expense) => ({
        id: expense.id,
        title: expense.title,
        sub: format(parseISO(expense.date), 'd MMM, h:mm a'),
        value: expense.totalAmount,
      }))
  }

  const spendingMore = analytics.delta > 0
  const previousLabel = level === 'year' ? 'last year'
    : level === 'month' ? 'last month'
      : level === 'week' ? 'last week' : 'the day before'

  return (
    <section className="analytics-page">
      <Link to="/expenses" className="back-link"><ArrowLeft size={16} /> Back to Money</Link>

      <div className="page-head">
        <div>
          <p className="eyebrow">Personal analysis</p>
          <h1>Where your money went</h1>
          <p className="muted">Your own spending over time, by category, and against what you spent before.</p>
        </div>
      </div>

      <div className="range-row">
        <div className="segmented">
          {LEVELS.map((option) => (
            <button key={option} type="button" className={level === option ? 'active' : ''}
              onClick={() => goTo(option)}>
              {LEVEL_LABEL[option]}
            </button>
          ))}
        </div>

        <div className="window-pager">
          <button type="button" onClick={() => shift(-1)} aria-label={`Previous ${level}`}>
            <ChevronLeft size={17} />
          </button>
          <strong>{heading}</strong>
          <button type="button" onClick={() => shift(1)} aria-label={`Next ${level}`}>
            <ChevronRight size={17} />
          </button>
          {!isNow && <button type="button" className="window-now" onClick={jumpToNow}>Today</button>}
        </div>
      </div>

      {/* the trail doubles as the way back up: each crumb is the level above */}
      <nav className="drill-trail" aria-label="Time range">
        {trail.map((crumb, index) => (
          <span key={crumb.level}>
            {index > 0 && <i>›</i>}
            <button type="button" className={crumb.level === level ? 'active' : ''}
              onClick={() => goTo(crumb.level)}>
              {crumb.label}
            </button>
          </span>
        ))}
      </nav>

      {truncated && (
        <p className="analytics-note">
          <Info size={14} /> You have more expenses than the app charts at once — the figures
          below cover the most recent 2,000.
        </p>
      )}

      {loading && <div className="analytics-loading" />}

      {!loading && !hasHistory && (
        <div className="panel">
          <div className="panel-state">
            <Receipt size={22} />
            <p>Nothing recorded yet. Add a few expenses and this page fills in.</p>
            <Link className="text-button" to="/expenses">Go to Money</Link>
          </div>
        </div>
      )}

      {!loading && hasHistory && (
        <>
          <section className="panel">
            <div className="panel-heading"><h2>{heading}</h2></div>
            <p className="muted">
              {analytics.count === 0
                ? 'Nothing spent in this window.'
                : canDrill
                  ? 'Each bar opens the level below it.'
                  : 'One bar per expense on this day.'}
            </p>
            <ColumnChart
              columns={analytics.columns}
              format={money}
              onOpen={canDrill ? drillInto : undefined}
            />
          </section>

          {analytics.count === 0 ? (
            <div className="panel">
              <div className="panel-state">
                <CalendarOff size={22} />
                <p>No spending in this {level}.</p>
                <button className="text-button" onClick={() => goTo('year')}>Look at the whole year</button>
              </div>
            </div>
          ) : (
            <>
              <section className="analytics-tiles">
                <div className="a-tile wide">
                  <span className="a-icon"><Wallet size={20} /></span>
                  <div>
                    <small>Spent</small>
                    <strong>{money(analytics.spent)}</strong>
                    <span className={`a-sub ${spendingMore ? 'up' : 'down'}`}>
                      {spendingMore ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      {deltaLabel(analytics.delta, analytics.deltaShare, analytics.previousSpent)}
                      {analytics.previousSpent > 0 && <em> vs {previousLabel}</em>}
                    </span>
                  </div>
                </div>

                <div className="a-tile">
                  <span className="a-icon periwinkle"><Receipt size={20} /></span>
                  <div>
                    <small>Expenses</small>
                    <strong>{analytics.count}</strong>
                    <span className="a-sub">{money(analytics.average)} each on average</span>
                  </div>
                </div>

                <div className="a-tile">
                  <span className="a-icon tangerine"><TrendingUp size={20} /></span>
                  <div>
                    <small>Per day</small>
                    <strong>{money(analytics.perDay)}</strong>
                    <span className="a-sub">
                      {analytics.elapsedDays} day{analytics.elapsedDays === 1 ? '' : 's'} counted
                    </span>
                  </div>
                </div>

                <div className="a-tile">
                  <span className="a-icon"><CalendarOff size={20} /></span>
                  <div>
                    <small>No-spend days</small>
                    <strong>{analytics.quietDays}</strong>
                    <span className="a-sub">of {analytics.elapsedDays} so far</span>
                  </div>
                </div>
              </section>

              {/* Only while the window is still running: a rate is the point of
                  it, and a finished month needs no forecast. */}
              {analytics.projected !== null && (
                <p className="projection">
                  <TrendingUp size={15} />
                  {/* one flex child, or the emphasised figure becomes its own
                      column and the sentence is torn into pieces */}
                  <span>
                    At this rate you will spend <strong>{money(analytics.projected)}</strong> by the
                    end of this {level} — {analytics.previousSpent > 0
                      ? `${analytics.projected > analytics.previousSpent ? 'more' : 'less'} than the ${money(analytics.previousSpent)} you spent ${previousLabel}`
                      : 'with nothing to compare it against yet'}.
                  </span>
                </p>
              )}

              <div className="analytics-grid">
                <section className="panel">
                  <div className="panel-heading"><h2>By category</h2></div>
                  <p className="muted">What you spend on.</p>

                  <div className="category-split">
                    <DonutChart slices={analytics.categories} total={analytics.spent} caption="total" format={money} />
                    {/* the page already added these up to draw the donut, so
                        opening a slice costs nothing but the click */}
                    <ChartLegend slices={analytics.categories} format={money} detailsFor={detailsFor} />
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-heading"><h2>Against {previousLabel}</h2></div>
                  <p className="muted">Where the change actually came from.</p>

                  <div className="delta-list">
                    {analytics.categories.map((row) => {
                      const look = categoryLook(row.label)
                      const Icon = look.icon
                      return (
                        <div className="delta-row" key={row.label}>
                          <span className={`delta-icon ${look.tone}`}><Icon size={15} /></span>
                          <div className="delta-copy">
                            <strong>{row.label}</strong>
                            <small>{row.count} expense{row.count === 1 ? '' : 's'} · {sharePercent(row.share)} of the total</small>
                          </div>
                          <div className="delta-values">
                            <strong>{money(row.value)}</strong>
                            {row.previous > 0 ? (
                              <small className={row.delta > 0 ? 'up' : row.delta < 0 ? 'down' : ''}>
                                {row.delta === 0 ? 'unchanged'
                                  : `${row.delta > 0 ? '+' : '−'}${money(Math.abs(row.delta))}`}
                              </small>
                            ) : <small className="new">new</small>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              </div>

              <div className="analytics-grid">
                <section className="panel">
                  <div className="panel-heading"><h2>By day of the week</h2></div>
                  <p className="muted">
                    {analytics.busiestDay
                      ? `Heaviest single day: ${format(analytics.busiestDay.at, 'EEEE d MMM')}, ${money(analytics.busiestDay.value)}.`
                      : 'Which days the money goes.'}
                  </p>
                  <BarList rows={analytics.weekdays} format={money} />
                </section>

                <section className="panel">
                  <div className="panel-heading"><h2>Biggest expenses</h2></div>
                  <p className="muted">The five that moved the total most.</p>

                  <div className="top-list">
                    {analytics.topExpenses.map((expense, index) => {
                      const look = categoryLook(expense.category)
                      const Icon = look.icon
                      return (
                        <div className="top-row" key={expense.id}>
                          <span className="top-rank">{index + 1}</span>
                          <span className={`delta-icon ${look.tone}`}><Icon size={15} /></span>
                          <div className="top-copy">
                            <strong>{expense.title}</strong>
                            <small>
                              {expense.category ?? 'Uncategorised'} · {format(parseISO(expense.date), 'd MMM, h:mm a')}
                            </small>
                          </div>
                          <strong className="top-amount">{exact(expense.totalAmount)}</strong>
                        </div>
                      )
                    })}
                  </div>
                </section>
              </div>

              <p className="analytics-foot">
                {expenses.length} expense{expenses.length === 1 ? '' : 's'} in this {level}
                {analytics.largest && <> · largest was {analytics.largest.title} at {exact(analytics.largest.totalAmount)}</>}
              </p>
            </>
          )}
        </>
      )}
    </section>
  )
}
