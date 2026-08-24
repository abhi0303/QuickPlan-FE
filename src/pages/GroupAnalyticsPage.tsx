import { Link, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  ArrowLeft, ChartPie, ChevronLeft, ChevronRight, CircleAlert, Info, Receipt, TrendingUp, Users, Wallet,
} from 'lucide-react'
import { BarList, ChartLegend, ColumnChart, DonutChart } from '../components/charts/Charts'
import { Loader } from '../components/common/Loader'
import { LEVELS, LEVEL_LABEL, useGroupAnalytics } from '../hooks/useGroupAnalytics'
import { useGroupDetail } from '../hooks/useGroupDetail'
import { avatarStyle } from '../utils/avatar'
import './GroupAnalyticsPage.scss'

/** Whole rupees in the charts — the paise belong on the expense itself. */
const money = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`
const exact = (value: number) => `₹${value.toFixed(2)}`

export function GroupAnalyticsPage() {
  const { id = '' } = useParams()
  const { group } = useGroupDetail(id)
  const memberCount = group?.memberCount ?? group?.members.length ?? 0
  const {
    analytics, loading, error, retry, truncated,
    level, heading, trail, goTo, shift, jumpToNow, drillInto, canDrill, isNow,
  } = useGroupAnalytics(id, memberCount)

  if (loading) return <Loader label="Crunching the numbers..." />

  if (error) {
    return (
      <section className="analytics-page">
        <Link to={`/groups/${id}`} className="back-link"><ArrowLeft size={16} /> Back to group</Link>
        <div className="panel-state">
          <CircleAlert size={22} />
          <p>{error}</p>
          <button className="text-button" onClick={retry}>Try again</button>
        </div>
      </section>
    )
  }

  const empty = analytics.count === 0

  return (
    <section className="analytics-page">
      <Link to={`/groups/${id}`} className="back-link">
        <ArrowLeft size={16} /> {group?.name ?? 'Back to group'}
      </Link>

      <div className="page-head">
        <div>
          <p className="eyebrow">Group analysis</p>
          <h1>Where the money went</h1>
          <p className="muted">
            Every expense in {group?.name ?? 'this group'}, split by category, by person and over time.
          </p>
        </div>
      </div>

      <div className="range-row">
        <div className="segmented">
          {LEVELS.map((option) => (
            <button
              key={option}
              type="button"
              className={level === option ? 'active' : ''}
              onClick={() => goTo(option)}
            >
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
          {!isNow && (
            <button type="button" className="window-now" onClick={jumpToNow}>Today</button>
          )}
        </div>
      </div>

      {/* the trail doubles as the way back up: each crumb is the level above */}
      <nav className="drill-trail" aria-label="Time range">
        {trail.map((crumb, index) => (
          <span key={crumb.level}>
            {index > 0 && <i>›</i>}
            <button
              type="button"
              className={crumb.level === level ? 'active' : ''}
              onClick={() => goTo(crumb.level)}
            >
              {crumb.label}
            </button>
          </span>
        ))}
      </nav>

      {truncated && (
        <p className="analytics-note">
          <Info size={14} /> This group has more expenses than the app charts at once — the
          figures below cover the most recent 2,000.
        </p>
      )}

      <section className="panel">
        <div className="panel-heading"><h2>{heading}</h2></div>
        <p className="muted">
          {level === 'year' && (canDrill ? 'Each month — open one to see its weeks.' : '')}
          {level === 'month' && 'Each week — open one to see its days.'}
          {level === 'week' && 'Each day — open one to see what was spent.'}
          {level === 'day' && (analytics.count > 0
            ? 'Every expense on this day.'
            : 'Nothing was spent on this day.')}
        </p>

        <ColumnChart
          columns={analytics.columns}
          format={money}
          onOpen={canDrill ? drillInto : undefined}
        />
      </section>

      {empty ? (
        <div className="panel">
          <div className="panel-state">
            <ChartPie size={24} />
            <p>Nothing spent in {heading}.</p>
            {level !== 'year' && (
              <button className="text-button" onClick={() => goTo('year')}>Look at the whole year</button>
            )}
          </div>
        </div>
      ) : (
        <>
          <section className="analytics-tiles">
            <div className="a-tile wide">
              <span className="a-icon"><Wallet size={20} /></span>
              <div>
                <small>Group total</small>
                <strong>{money(analytics.totalSpent)}</strong>
                <span className="a-sub">
                  {analytics.count} expense{analytics.count === 1 ? '' : 's'}
                  {memberCount > 0 && <> · {money(analytics.perPerson)} a head</>}
                </span>
              </div>
            </div>

            <div className="a-tile">
              <span className="a-icon periwinkle"><Users size={20} /></span>
              <div>
                <small>Your share</small>
                <strong>{money(analytics.myShare)}</strong>
                <span className="a-sub">
                  {analytics.totalSpent > 0
                    ? `${((analytics.myShare / analytics.totalSpent) * 100).toFixed(0)}% of the total`
                    : 'nothing yet'}
                </span>
              </div>
            </div>

            <div className="a-tile">
              <span className="a-icon tangerine"><Receipt size={20} /></span>
              <div>
                <small>Average expense</small>
                <strong>{money(analytics.average)}</strong>
                <span className="a-sub">
                  {analytics.largest ? `largest ${money(analytics.largest.totalAmount)}` : ''}
                </span>
              </div>
            </div>

            <div className="a-tile">
              <span className="a-icon"><TrendingUp size={20} /></span>
              <div>
                <small>You fronted</small>
                <strong>{money(analytics.myPaid)}</strong>
                <span className="a-sub">
                  {analytics.myPaid >= analytics.myShare
                    ? `${money(analytics.myPaid - analytics.myShare)} above your share`
                    : `${money(analytics.myShare - analytics.myPaid)} below your share`}
                </span>
              </div>
            </div>
          </section>

          <div className="analytics-grid">
            <section className="panel">
              <div className="panel-heading"><h2>By category</h2></div>
              <p className="muted">What the group spends on.</p>

              <div className="category-split">
                <DonutChart
                  slices={analytics.byCategory}
                  total={analytics.totalSpent}
                  caption="total"
                  format={money}
                />
                <ChartLegend slices={analytics.byCategory} format={money} />
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading"><h2>By person</h2></div>
              <p className="muted">What each person paid, against what they actually owe.</p>

              <BarList
                rows={analytics.byMember.map((member) => ({
                  label: member.name,
                  value: member.paid,
                  secondary: member.share,
                  hint: member.net === 0
                    ? 'square'
                    : member.net > 0 ? `+${money(member.net)}` : `−${money(-member.net)}`,
                }))}
                format={money}
                primaryLabel="Paid"
                secondaryLabel="Their share"
              />
            </section>
          </div>

          <section className="panel">
            <div className="panel-heading"><h2>Biggest expenses</h2></div>

            <div className="top-list">
              {analytics.topExpenses.map((expense, index) => (
                <div className="top-row" key={expense.id}>
                  <span className="top-rank">{index + 1}</span>
                  <span
                    className="top-avatar"
                    style={avatarStyle(expense.paidBy?.name ?? expense.title)}
                    title={expense.paidBy?.name ?? ''}
                  >
                    {(expense.paidBy?.name ?? expense.title).charAt(0).toUpperCase()}
                  </span>
                  <div className="top-copy">
                    <strong>{expense.title}</strong>
                    <small>
                      {expense.iPaid ? 'You' : expense.paidBy?.name?.split(' ')[0] ?? 'Someone'} paid
                      {expense.category ? ` · ${expense.category}` : ''}
                      {' · '}{format(parseISO(expense.date), 'd MMM')}
                    </small>
                  </div>
                  <strong className="top-amount">{exact(expense.totalAmount)}</strong>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  )
}
