import { useState } from 'react'
import { Link } from 'react-router-dom'
import { differenceInCalendarDays, format } from 'date-fns'
import {
  ArrowLeft, CalendarClock, CircleAlert, CircleHelp, IndianRupee, Landmark, Pencil, RotateCcw,
  TrendingDown, TriangleAlert, Wallet,
} from 'lucide-react'
import { ForecastChart } from '../components/forecast/ForecastChart'
import { categoryLook } from '../data/expenseCategories'
import { useForecast } from '../hooks/useForecast'
import { chargeDays } from '../services/forecast'
import { useAppStore } from '../store/useAppStore'
import './ForecastPage.scss'

/**
 * What is coming, day by day.
 *
 * Every other screen in Money answers "what happened" or "how is the month
 * going". This one answers the question those cannot: **which day am I short**.
 * A month has no shape — it cannot show that two EMIs land on the same morning,
 * or that a yearly premium the planner reports as ₹1,000 a month is really
 * ₹12,000 on one day.
 *
 * A new reader arrives here with no idea what they are looking at, so the page
 * leads with a sentence rather than a chart, and says out loud which three
 * numbers it is built from.
 */

const money = (value: number) => `₹${Math.round(Math.abs(value)).toLocaleString('en-IN')}`

export function ForecastPage() {
  const {
    forecast, dailySpend, daysOfHistory, monthlyIncome, balance, estimate, estimated,
    incomeDay, loading, error,
  } = useForecast()
  const setBalance = useAppStore((state) => state.setForecastBalance)
  const setIncomeDay = useAppStore((state) => state.setIncomeDay)
  const [editing, setEditing] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  const upcoming = chargeDays(forecast)
  const daysToLow = forecast.low ? differenceInCalendarDays(forecast.low.date, new Date()) : 0
  const nextWeekOut = forecast.days.slice(0, 10)
    .reduce((sum, day) => sum + day.charges.reduce((inner, charge) => inner + charge.amount, 0), 0)

  return (
    <section className="forecast-page">
      <Link to="/expenses" className="back-link"><ArrowLeft size={16} /> Back to Money</Link>

      <div className="page-head">
        <div>
          <p className="eyebrow">What's coming</p>
          <h1>Which day you'll be short</h1>
          <p className="muted">
            Your schedules land on real dates, not in monthly averages. This is the next 60 days.
          </p>
        </div>
        <button className="head-link" onClick={() => setHelpOpen(true)}>
          <CircleHelp size={16} /> How this works
        </button>
      </div>

      {loading && <div className="forecast-loading" />}

      {!loading && error && (
        <div className="panel-state">
          <CircleAlert size={22} />
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && upcoming.length === 0 && monthlyIncome === 0 && (
        <div className="groups-empty">
          <span className="empty-wallet"><CalendarClock size={30} /></span>
          <p>
            Nothing to forecast yet. Add your rent or an EMI under Recurring, and set your income
            in the planner — then this page can tell you which days are tight.
          </p>
          <Link className="text-button" to="/expenses/recurring">Add a schedule</Link>
        </div>
      )}

      {!loading && !error && (upcoming.length > 0 || monthlyIncome > 0) && (
        <>
          {/* The sentence first. A chart nobody has read the caption for is
              decoration, and this page's whole value is one claim. */}
          <section className={`forecast-headline ${forecast.shortfall ? 'is-short' : ''}`}>
            {forecast.absolute && forecast.low ? (
              <>
                <p className="eyebrow">
                  {forecast.shortfall ? 'You run out on' : 'Tightest day'}
                </p>
                <strong>{format((forecast.shortfall ?? forecast.low).date, 'EEEE d MMMM')}</strong>
                <p className="forecast-sub">
                  {forecast.shortfall
                    ? <>{inWords(differenceInCalendarDays(forecast.shortfall.date, new Date()))} Something needs to move before then.</>
                    : <>{money(forecast.low.balance)} left, {daysToLow === 0 ? 'today' : `${daysToLow} day${daysToLow === 1 ? '' : 's'} from now`}.</>}
                </p>
              </>
            ) : (
              <>
                <p className="eyebrow">Going out in the next 10 days</p>
                <strong>{money(nextWeekOut)}</strong>
                <p className="forecast-sub">
                  Add what is in your account and this becomes “you are tightest on the 6th”.
                </p>
              </>
            )}
          </section>

          {/* The three inputs, editable, so nobody has to guess where the line
              came from — and so a wrong number is obvious and fixable. */}
          <section className="forecast-inputs">
            <button className={`fi-card ${balance === null ? 'is-empty' : ''}`} onClick={() => setEditing(true)}>
              <span className="fi-icon"><Wallet size={17} /></span>
              <div>
                {/* the two labels are the whole difference: one counts this
                    month, the other counts everything you have. A tag saying so
                    as well only squeezed the words that already said it. */}
                <small>{estimated ? 'Left of this month' : 'In your account'}</small>
                <strong>{balance === null ? 'Add your income first' : money(balance)}</strong>
              </div>
              <Pencil size={13} />
            </button>

            <Link className="fi-card" to="/expenses/planner">
              <span className="fi-icon"><Landmark size={17} /></span>
              <div>
                <small>Income, on the {incomeDay}{ordinal(incomeDay)}</small>
                <strong>{monthlyIncome > 0 ? money(monthlyIncome) : 'Not set'}</strong>
              </div>
              <Pencil size={13} />
            </Link>

            <div className="fi-card is-static">
              <span className="fi-icon"><TrendingDown size={17} /></span>
              <div>
                <small>Everyday spending</small>
                <strong>{money(dailySpend)}<em> a day</em></strong>
              </div>
            </div>
          </section>

          {daysOfHistory > 0 && daysOfHistory < 21 && (
            <p className="forecast-note">
              <TriangleAlert size={14} />
              Only {daysOfHistory} days of spending history so far, so the daily figure is a rough
              guess. It sharpens as you record more.
            </p>
          )}

          <section className="panel">
            <div className="panel-heading"><h2>The next 60 days</h2></div>
            <p className="muted">
              Each dot is a day something is scheduled. The dip is where they land together.
            </p>
            <ForecastChart forecast={forecast} />
          </section>

          {forecast.heaviest && forecast.heaviest.charges.length > 1 && (
            <div className="forecast-insight">
              <span className="fi-icon"><CalendarClock size={17} /></span>
              <div>
                <strong>
                  {money(forecast.heaviest.charges.reduce((sum, c) => sum + c.amount, 0))} leaves
                  on {format(forecast.heaviest.date, 'd MMMM')}
                </strong>
                <small>
                  {forecast.heaviest.charges.length} schedules on the same morning. Move one later in
                  the month to flatten the dip.
                </small>
              </div>
            </div>
          )}

          {upcoming.length > 0 && (
            <section className="panel">
              <div className="panel-heading"><h2>What is scheduled</h2></div>
              <p className="muted">In order, with what is left after each one.</p>

              <div className="charge-list">
                {upcoming.map((day) => (
                  <div className={`charge-day ${day.balance < 0 ? 'is-short' : ''}`} key={day.date.toISOString()}>
                    <div className="charge-date">
                      <strong>{format(day.date, 'd')}</strong>
                      <small>{format(day.date, 'MMM')}</small>
                    </div>

                    <div className="charge-items">
                      {day.charges.map((charge) => {
                        const look = categoryLook(charge.category)
                        const Icon = look.icon
                        return (
                          <div className="charge-item" key={charge.id}>
                            <span className={`delta-icon ${look.tone}`}><Icon size={14} /></span>
                            <span className="charge-label">{charge.label}</span>
                            <strong>−{money(charge.amount)}</strong>
                          </div>
                        )
                      })}
                    </div>

                    {forecast.absolute && (
                      <div className="charge-after">
                        <small>left</small>
                        <strong>{day.balance < 0 ? '−' : ''}{money(day.balance)}</strong>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {editing && (
        <BalanceDialog
          balance={estimated ? null : balance}
          estimate={estimate}
          incomeDay={incomeDay}
          onClose={() => setEditing(false)}
          onSave={(nextBalance, nextDay) => {
            setBalance(nextBalance)
            setIncomeDay(nextDay)
            setEditing(false)
          }}
        />
      )}

      {helpOpen && <ForecastHelp onClose={() => setHelpOpen(false)} />}
    </section>
  )
}

/** "That is 0 days away" is not something a person says. */
function inWords(days: number) {
  if (days <= 0) return 'That is today.'
  if (days === 1) return 'That is tomorrow.'
  return `That is ${days} days away.`
}

/** 1st, 2nd, 3rd — the 11th–13th are the exceptions. */
function ordinal(day: number) {
  if (day >= 11 && day <= 13) return 'th'
  return ['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'
}

function BalanceDialog({
  balance, estimate, incomeDay, onClose, onSave,
}: {
  balance: number | null
  /** What the app worked out, shown as the fallback. */
  estimate: number | null
  incomeDay: number
  onClose: () => void
  onSave: (balance: number | null, incomeDay: number) => void
}) {
  const [value, setValue] = useState(balance === null ? '' : String(Math.round(balance)))
  const [day, setDay] = useState(String(incomeDay))

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal balance-modal" role="dialog" aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          {/* the reasoning lives in "How this works"; this is a form */}
          <div><h2>Your balance</h2></div>
        </header>

        <form onSubmit={(event) => {
          event.preventDefault()
          onSave(value.trim() === '' ? null : Number(value) || 0, Math.min(31, Math.max(1, Number(day) || 1)))
        }}>
          <div className="field">
            <label className="field-label" htmlFor="fc-balance">In your account today</label>
            <span className="control adorned">
              <IndianRupee size={17} />
              <input id="fc-balance" type="number" step="any" inputMode="decimal" autoFocus
                value={value} onChange={(event) => setValue(event.target.value)}
                placeholder={estimate === null ? '42000' : String(Math.round(estimate))} />
            </span>
            {/* the one thing worth saying here: you will not have to do this
                again next month */}
            <p className="field-hint">
              Set it once — paydays add, expenses subtract. Stays on this device.
            </p>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="fc-day">Salary lands on</label>
            <input id="fc-day" className="control" type="number" min="1" max="31"
              value={day} onChange={(event) => setDay(event.target.value)} />
          </div>

          <footer className="modal-actions">
            {/* the way back to counting only this month, so a figure typed once
                is never a trap and last month's leftovers can be dropped */}
            {estimate !== null && (
              <button type="button" className="reset-link" onClick={() => onSave(null, Number(day) || 1)}>
                <RotateCcw size={14} /> Reset to this month only
              </button>
            )}
            <button type="button" className="voice-ghost" onClick={onClose}>Cancel</button>
            <button className="modal-submit">Save</button>
          </footer>
        </form>
      </div>
    </div>
  )
}

function ForecastHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal help-modal" role="dialog" aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>What this page is for</h2>
            <p className="muted">
              The planner tells you what is left this month. This tells you <em>when</em> it runs out.
            </p>
          </div>
        </header>

        <div className="help-list">
          <div className="help-row">
            <span className="help-icon"><CalendarClock size={17} /></span>
            <div>
              <strong>A month has no shape</strong>
              <p>
                “₹35,000 left this month” sounds comfortable. It does not tell you that ₹48,000
                leaves on the 5th, and every screen you have aggregates by month.
              </p>
            </div>
          </div>

          <div className="help-row">
            <span className="help-icon"><TriangleAlert size={17} /></span>
            <div>
              <strong>Averages hide dates</strong>
              <p>
                A ₹12,000 yearly premium is reported as ₹1,000 a month everywhere else. Your account
                sees ₹12,000 on one morning — and if that is also EMI day, the month still balances
                while the card still gets declined.
              </p>
            </div>
          </div>

          <div className="help-row">
            <span className="help-icon"><Wallet size={17} /></span>
            <div>
              <strong>What it is built from</strong>
              <p>
                Your recurring schedules and the dates they actually fall on, your income and its
                day, and what a normal day of spending costs you — averaged from the last month.
              </p>
            </div>
          </div>
        </div>

        <p className="help-foot">
          <CircleHelp size={14} />
          <span>
            Use it to decide <em>when</em>: buy the thing now or after payday, move a schedule off a
            crowded date, or spot that your salary arrives after your biggest bills leave.
          </span>
        </p>

        <footer className="modal-actions">
          <button type="button" className="modal-submit" onClick={onClose}>Got it</button>
        </footer>
      </div>
    </div>
  )
}
