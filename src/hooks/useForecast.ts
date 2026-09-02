import { useMemo } from 'react'
import { differenceInCalendarDays, getDaysInMonth, parseISO, setDate, startOfDay, subDays, subMonths } from 'date-fns'
import { buildForecast, rollForward } from '../services/forecast'
import { useCashFlow } from './useCashFlow'
import { usePersonalExpenses } from './usePersonalExpenses'
import { usePlanner } from './usePlanner'
import { useRecurring } from './useRecurring'
import { useAppStore } from '../store/useAppStore'

/** How far back to look when working out what a normal day costs. */
const RATE_WINDOW = 30

/**
 * The three inputs the forecast needs, from where they already live: the
 * schedules, the income, and how fast money usually goes out.
 */
export function useForecast(days = 60) {
  const { items: schedules, loading: schedulesLoading, error: schedulesError } = useRecurring()
  const { plan, loading: planLoading } = usePlanner()
  const { expenses, loading: expensesLoading } = usePersonalExpenses()
  /*
   * The balance has to count everything that moved, not just personal
   * expenses: a ₹4,000 dinner you fronted really did leave the account, and a
   * settlement coming back really did arrive. See docs/cash-flow.md.
   */
  const { items: movements } = useCashFlow()

  const balance = useAppStore((state) => state.forecastBalance)
  const balanceAt = useAppStore((state) => state.forecastBalanceAt)
  const incomeDay = useAppStore((state) => state.incomeDay)

  /*
   * What a normal day costs, from the last month of personal expenses.
   *
   * Deliberately not cash flow: a ₹4,000 dinner you fronted is lumpy and mostly
   * comes back, and averaging it into a daily rate would forecast a shortfall
   * that is not there. Scheduled charges are excluded for the same reason —
   * they are already counted on their own dates.
   */
  const dailySpend = useMemo(() => {
    const since = subDays(new Date(), RATE_WINDOW)
    const recent = expenses.filter((expense) => {
      if (expense.createdVia === 'SYSTEM') return false
      const at = parseISO(expense.date)
      return !Number.isNaN(at.getTime()) && at >= since && at <= new Date()
    })
    if (recent.length === 0) return 0
    const spent = recent.reduce((sum, expense) => sum + expense.totalAmount, 0)
    // divide by the window, not by the number of days that happened to have an
    // expense — days with no spending are the point
    return spent / RATE_WINDOW
  }, [expenses])

  /**
   * What is left of this pay cycle — the app can work this out, so it does.
   *
   * The cycle starts at the last payday on or before today: you received your
   * income then, and everything recorded since has left. Schedules that have
   * already fired this cycle are ordinary expenses by now, so they are counted
   * here and not again as future charges.
   *
   * It is an estimate, not a bank balance: it cannot see cash, another account,
   * or what carried over from last month. That is exactly why it can be
   * replaced by a real figure — but nobody should have to type one to see the
   * page work.
   */
  const derived = useMemo(() => {
    if (!plan || plan.monthlyIncome <= 0) return null

    const today = startOfDay(new Date())
    const payDay = (month: Date) => setDate(month, Math.min(incomeDay, getDaysInMonth(month)))
    const thisMonth = payDay(today)
    const cycleStart = thisMonth <= today ? thisMonth : payDay(subMonths(today, 1))

    const moved = movements.reduce((sum, movement) => {
      const at = parseISO(movement.at)
      if (Number.isNaN(at.getTime()) || at < cycleStart) return sum
      return sum + (movement.direction === 'IN' ? -movement.amount : movement.amount)
    }, 0)

    return plan.monthlyIncome - moved
  }, [plan, movements, incomeDay])

  /**
   * A figure the user gave is carried forward rather than frozen: paydays since
   * add income, expenses since take it away. So it keeps working next month,
   * and what is left over at the end of one month opens the next.
   */
  const tracked = useMemo(() => {
    if (balance === null) return null
    if (!balanceAt) return balance
    const anchorAt = parseISO(balanceAt)
    if (Number.isNaN(anchorAt.getTime())) return balance
    return rollForward({
      anchor: balance,
      anchorAt,
      monthlyIncome: plan?.monthlyIncome ?? 0,
      incomeDay,
      // signed, so a settlement arriving adds rather than subtracts
      expenses: movements.map((movement) => ({
        date: movement.at,
        totalAmount: movement.direction === 'IN' ? -movement.amount : movement.amount,
      })),
    })
  }, [balance, balanceAt, plan?.monthlyIncome, incomeDay, movements])

  const opening = tracked ?? derived

  const forecast = useMemo(() => buildForecast({
    openingBalance: opening,
    monthlyIncome: plan?.monthlyIncome ?? 0,
    incomeDay,
    schedules,
    dailySpend,
    days,
  }), [opening, plan?.monthlyIncome, incomeDay, schedules, dailySpend, days])

  const daysOfHistory = useMemo(() => {
    if (expenses.length === 0) return 0
    const oldest = expenses.reduce((earliest, expense) => {
      const at = parseISO(expense.date)
      return !Number.isNaN(at.getTime()) && at < earliest ? at : earliest
    }, new Date())
    return differenceInCalendarDays(new Date(), oldest)
  }, [expenses])

  return {
    forecast,
    schedules,
    dailySpend,
    daysOfHistory,
    monthlyIncome: plan?.monthlyIncome ?? 0,
    balance: opening,
    /** What the app worked out, offered even when a typed figure is in use. */
    estimate: derived,
    /** True while the figure is the app's own working-out rather than the user's. */
    estimated: balance === null && derived !== null,
    /** When the user's figure was true, if they gave one. */
    balanceAt,
    incomeDay,
    loading: schedulesLoading || planLoading || expensesLoading,
    error: schedulesError,
  }
}
