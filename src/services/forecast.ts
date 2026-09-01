import { addDays, addMonths, format, getDaysInMonth, isSameDay, setDate, startOfDay, startOfMonth } from 'date-fns'
import { nextRuns } from '../components/recurring/schedulePreview'
import type { Recurring } from './recurring'

/**
 * What the next two months look like, day by day.
 *
 * Every other screen in Money aggregates by month, and a month has no shape: it
 * cannot show that ₹48,065 leaves on one morning, or that a yearly premium the
 * planner reports as "₹1,000 a month" is really ₹12,000 landing on a single
 * day. This puts each charge on the date it actually happens and runs the
 * balance forward, so the question stops being "will the month balance" and
 * becomes "which day am I short".
 *
 * Pure. Everything it needs already exists — the schedules, their dates from
 * `nextRuns`, the income, and how fast money usually goes out.
 */

export type ForecastCharge = {
  id: string
  label: string
  amount: number
  category: string | null
}

export type ForecastDay = {
  date: Date
  /** Scheduled money leaving on this day. */
  charges: ForecastCharge[]
  /** Income landing on this day. */
  income: number
  /** The usual day's spending, carried forward from history. */
  spend: number
  /** What is left at the end of this day. */
  balance: number
}

export type Forecast = {
  days: ForecastDay[]
  /** The day the balance is lowest — the whole point of the exercise. */
  low: ForecastDay | null
  /** The first day the balance goes below zero, if it does. */
  shortfall: ForecastDay | null
  /** The heaviest single day of scheduled charges. */
  heaviest: ForecastDay | null
  /** Everything scheduled to leave inside the window. */
  totalOut: number
  /** True when a real opening balance was supplied, so figures are absolute. */
  absolute: boolean
}

export type ForecastInput = {
  /** What is in the account today. Null runs the forecast as a change from now. */
  openingBalance: number | null
  monthlyIncome: number
  /** Day of the month income lands. Clamped in shorter months. */
  incomeDay: number
  schedules: Recurring[]
  /** Everyday spending, per day, from history and excluding scheduled charges. */
  dailySpend: number
  days?: number
  today?: Date
}

/** Occurrences of one schedule inside the window, as charges keyed by day. */
function chargesFor(schedule: Recurring, from: Date, to: Date, horizon: number) {
  if (schedule.pausedAt) return []

  const runs = nextRuns({
    cadence: schedule.cadence,
    dayOfMonth: schedule.dayOfMonth ?? undefined,
    weekday: schedule.weekday ?? undefined,
    startsOn: schedule.nextRunAt ? new Date(schedule.nextRunAt) : null,
    endsOn: schedule.endsOn ? new Date(schedule.endsOn) : null,
    interval: schedule.interval,
  }, horizon, from)

  return runs
    .filter((run) => run >= startOfDay(from) && run <= to)
    .map((run) => ({
      date: run,
      charge: {
        id: `${schedule.id}-${format(run, 'yyyy-MM-dd')}`,
        label: schedule.title,
        amount: schedule.amount,
        category: schedule.category ?? null,
      },
    }))
}

export function buildForecast(input: ForecastInput): Forecast {
  const { openingBalance, monthlyIncome, incomeDay, schedules, dailySpend } = input
  const horizon = input.days ?? 60
  const today = startOfDay(input.today ?? new Date())
  const last = addDays(today, horizon - 1)

  // a daily schedule can fire every day of the window, so ask for that many
  const upcoming = schedules.flatMap((schedule) => chargesFor(schedule, today, last, horizon))

  const days: ForecastDay[] = []
  let balance = openingBalance ?? 0

  for (let offset = 0; offset < horizon; offset += 1) {
    const date = addDays(today, offset)
    const charges = upcoming.filter((item) => isSameDay(item.date, date)).map((item) => item.charge)

    /*
     * Income lands on its day, clamped: a salary on the 31st still arrives in
     * February. Today itself is skipped — if it had already arrived it is in
     * the opening balance, and if it has not the user knows.
     */
    const payDay = Math.min(incomeDay, getDaysInMonth(date))
    const income = offset > 0 && monthlyIncome > 0 && date.getDate() === payDay ? monthlyIncome : 0

    const spend = dailySpend
    const out = charges.reduce((sum, charge) => sum + charge.amount, 0)
    balance = balance + income - out - spend

    days.push({ date, charges, income, spend, balance })
  }

  const low = days.reduce<ForecastDay | null>(
    (lowest, day) => (!lowest || day.balance < lowest.balance ? day : lowest), null)

  const shortfall = days.find((day) => day.balance < 0) ?? null

  const heaviest = days.reduce<ForecastDay | null>((worst, day) => {
    const out = day.charges.reduce((sum, charge) => sum + charge.amount, 0)
    const worstOut = worst ? worst.charges.reduce((sum, charge) => sum + charge.amount, 0) : 0
    return out > worstOut ? day : worst
  }, null)

  return {
    days,
    low,
    shortfall,
    heaviest: heaviest && heaviest.charges.length > 0 ? heaviest : null,
    totalOut: upcoming.reduce((sum, item) => sum + item.charge.amount, 0),
    absolute: openingBalance !== null,
  }
}

/**
 * A balance the user gave once, carried forward to today.
 *
 * "₹82,000, as of the 2nd" stays true for exactly one day unless something
 * keeps it up to date. So it is treated as an anchor rather than a fact about
 * now: every payday since it was set adds income, every expense recorded since
 * takes some away, and next month it is still right without being touched.
 *
 * That is also what makes leftovers carry. End September with ₹40,000 unspent
 * and October opens with ₹40,000 plus the salary — which a per-cycle estimate
 * can never do, because it forgets everything before the last payday.
 *
 * Expenses dated *before* the anchor are ignored: whatever the user was looking
 * at when they typed the figure already had them in it.
 */
export function rollForward(input: {
  anchor: number
  anchorAt: Date
  monthlyIncome: number
  incomeDay: number
  /** Every recorded expense; only those after the anchor count. */
  expenses: { date: string, totalAmount: number }[]
  today?: Date
}): number {
  const today = startOfDay(input.today ?? new Date())
  const anchorAt = input.anchorAt

  let balance = input.anchor

  if (input.monthlyIncome > 0) {
    // walk the paydays between the anchor and today, adding each one once
    let month = startOfMonth(anchorAt)
    const guard = addMonths(startOfMonth(today), 1)
    while (month < guard) {
      const payday = setDate(month, Math.min(input.incomeDay, getDaysInMonth(month)))
      if (payday > anchorAt && payday <= today) balance += input.monthlyIncome
      month = addMonths(month, 1)
    }
  }

  for (const expense of input.expenses) {
    const at = new Date(expense.date)
    if (Number.isNaN(at.getTime())) continue
    if (at > anchorAt && at <= addDays(today, 1)) balance -= expense.totalAmount
  }

  return balance
}

/** Days with something scheduled, for the list under the chart. */
export function chargeDays(forecast: Forecast): ForecastDay[] {
  return forecast.days.filter((day) => day.charges.length > 0)
}
