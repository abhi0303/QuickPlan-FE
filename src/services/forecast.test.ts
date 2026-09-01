import { describe, expect, it } from 'vitest'
import { format } from 'date-fns'
import { buildForecast, chargeDays, rollForward } from './forecast'
import type { Recurring } from './recurring'

/**
 * The forecast exists to show what a monthly total hides, so the cases that
 * matter are the ones about *dates*: two EMIs on the same morning, a yearly
 * premium landing whole rather than in twelfths, and payday clamping.
 */

const TODAY = new Date(2026, 8, 2)

const schedule = (over: Partial<Recurring> & { title: string, amount: number }): Recurring => ({
  id: over.title,
  scope: 'PERSONAL',
  cadence: 'MONTHLY',
  nextRunAt: new Date(2026, 8, 5).toISOString(),
  pausedAt: null,
  ...over,
})

const on = (date: Date) => format(date, 'd MMM')

describe('the shape of a month', () => {
  const emis = [
    schedule({ title: 'Home Loan EMI', amount: 30000, dayOfMonth: 5 }),
    schedule({ title: 'Car EMI', amount: 18065, dayOfMonth: 5 }),
  ]

  it('puts both EMIs on the same morning rather than spreading them', () => {
    const forecast = buildForecast({
      openingBalance: 120000, monthlyIncome: 0, incomeDay: 1,
      schedules: emis, dailySpend: 0, days: 30, today: TODAY,
    })

    const heavy = forecast.heaviest
    expect(heavy && on(heavy.date)).toBe('5 Sep')
    expect(heavy?.charges.map((charge) => charge.amount)).toEqual([30000, 18065])
  })

  it('finds the low point, which is the whole question', () => {
    const forecast = buildForecast({
      openingBalance: 60000, monthlyIncome: 0, incomeDay: 1,
      schedules: emis, dailySpend: 0, days: 20, today: TODAY,
    })
    expect(forecast.low && on(forecast.low.date)).toBe('5 Sep')
    expect(forecast.low?.balance).toBe(60000 - 48065)
  })

  it('says which day the money runs out', () => {
    const forecast = buildForecast({
      openingBalance: 40000, monthlyIncome: 0, incomeDay: 1,
      schedules: emis, dailySpend: 0, days: 20, today: TODAY,
    })
    expect(forecast.shortfall && on(forecast.shortfall.date)).toBe('5 Sep')
  })

  /*
   * The case the planner cannot show: it reports a yearly premium as ₹1,000 a
   * month, and the account sees ₹12,000 in one morning — on top of the EMIs.
   */
  it('lands a yearly charge whole, on its day', () => {
    const forecast = buildForecast({
      openingBalance: 120000, monthlyIncome: 0, incomeDay: 1, dailySpend: 0, days: 40, today: TODAY,
      schedules: [...emis, schedule({
        title: 'Insurance', amount: 12000, cadence: 'YEARLY',
        nextRunAt: new Date(2026, 9, 5).toISOString(),
      })],
    })

    const october = forecast.days.find((day) => on(day.date) === '5 Oct')
    expect(october?.charges.reduce((sum, charge) => sum + charge.amount, 0)).toBe(60065)
  })
})

describe('income', () => {
  it('lands on its day and lifts the balance', () => {
    const forecast = buildForecast({
      openingBalance: 0, monthlyIncome: 120000, incomeDay: 5,
      schedules: [], dailySpend: 0, days: 10, today: TODAY,
    })
    expect(forecast.days.find((day) => on(day.date) === '5 Sep')?.income).toBe(120000)
    expect(forecast.days[forecast.days.length - 1].balance).toBe(120000)
  })

  it('clamps a payday the month is too short for', () => {
    const forecast = buildForecast({
      openingBalance: 0, monthlyIncome: 50000, incomeDay: 31,
      schedules: [], dailySpend: 0, days: 45, today: new Date(2027, 0, 20),
    })
    const paid = forecast.days.filter((day) => day.income > 0).map((day) => on(day.date))
    expect(paid).toEqual(['31 Jan', '28 Feb'])
  })

  // it is either already in the opening balance or the user knows it is coming
  it('does not credit today', () => {
    const forecast = buildForecast({
      openingBalance: 1000, monthlyIncome: 50000, incomeDay: 2,
      schedules: [], dailySpend: 0, days: 3, today: TODAY,
    })
    expect(forecast.days[0].income).toBe(0)
  })
})

describe('everyday spending', () => {
  it('carries the daily rate forward', () => {
    const forecast = buildForecast({
      openingBalance: 10000, monthlyIncome: 0, incomeDay: 1,
      schedules: [], dailySpend: 500, days: 10, today: TODAY,
    })
    expect(forecast.days[9].balance).toBe(10000 - 5000)
  })
})

describe('what is listed', () => {
  it('skips a paused schedule entirely', () => {
    const forecast = buildForecast({
      openingBalance: 0, monthlyIncome: 0, incomeDay: 1, dailySpend: 0, days: 30, today: TODAY,
      schedules: [schedule({ title: 'Gym', amount: 1200, dayOfMonth: 5, pausedAt: TODAY.toISOString() })],
    })
    expect(forecast.totalOut).toBe(0)
    expect(chargeDays(forecast)).toEqual([])
  })

  it('lists only the days something happens', () => {
    const forecast = buildForecast({
      openingBalance: 0, monthlyIncome: 0, incomeDay: 1, dailySpend: 0, days: 40, today: TODAY,
      schedules: [schedule({ title: 'Rent', amount: 18000, dayOfMonth: 5 })],
    })
    expect(chargeDays(forecast).map((day) => on(day.date))).toEqual(['5 Sep', '5 Oct'])
  })

  it('reports relative figures when no balance was given', () => {
    const forecast = buildForecast({
      openingBalance: null, monthlyIncome: 0, incomeDay: 1, dailySpend: 0, days: 10, today: TODAY,
      schedules: [schedule({ title: 'Rent', amount: 18000, dayOfMonth: 5 })],
    })
    expect(forecast.absolute).toBe(false)
    expect(forecast.low?.balance).toBe(-18000)
  })
})

describe('carrying a balance forward', () => {
  const expenses = (rows: [string, number][]) =>
    rows.map(([date, totalAmount]) => ({ date: new Date(date).toISOString(), totalAmount }))

  it('adds each payday since the figure was given', () => {
    // anchored 2 Sep, payday the 3rd: September's and October's have both landed
    expect(rollForward({
      anchor: 10000, anchorAt: new Date(2026, 8, 2), monthlyIncome: 50000, incomeDay: 3,
      expenses: [], today: new Date(2026, 9, 10),
    })).toBe(110000)
  })

  it('does not re-add a payday that had already happened', () => {
    expect(rollForward({
      anchor: 10000, anchorAt: new Date(2026, 8, 5), monthlyIncome: 50000, incomeDay: 3,
      expenses: [], today: new Date(2026, 8, 20),
    })).toBe(10000)
  })

  it('subtracts what has been recorded since', () => {
    expect(rollForward({
      anchor: 20000, anchorAt: new Date(2026, 8, 2), monthlyIncome: 0, incomeDay: 3,
      expenses: expenses([['2026-09-04', 1200], ['2026-09-06', 800]]), today: new Date(2026, 8, 10),
    })).toBe(18000)
  })

  /*
   * Whatever the user was looking at when they typed the figure already had
   * these in it; counting them again would take the same money twice.
   */
  it('ignores expenses dated before the anchor', () => {
    expect(rollForward({
      anchor: 20000, anchorAt: new Date(2026, 8, 10), monthlyIncome: 0, incomeDay: 3,
      expenses: expenses([['2026-09-01', 5000]]), today: new Date(2026, 8, 20),
    })).toBe(20000)
  })

  // the whole point: what is left over does not vanish at month end
  it('carries a leftover into the next month', () => {
    const left = rollForward({
      anchor: 40000, anchorAt: new Date(2026, 8, 30), monthlyIncome: 166000, incomeDay: 3,
      expenses: [], today: new Date(2026, 9, 4),
    })
    expect(left).toBe(206000)
  })

  it('carries a shortfall too, rather than pretending the month reset it', () => {
    expect(rollForward({
      anchor: -10000, anchorAt: new Date(2026, 8, 30), monthlyIncome: 166000, incomeDay: 3,
      expenses: [], today: new Date(2026, 9, 4),
    })).toBe(156000)
  })

  it('clamps a payday the month is too short for', () => {
    expect(rollForward({
      anchor: 0, anchorAt: new Date(2027, 0, 1), monthlyIncome: 1000, incomeDay: 31,
      expenses: [], today: new Date(2027, 2, 1),
    })).toBe(2000)
  })
})
