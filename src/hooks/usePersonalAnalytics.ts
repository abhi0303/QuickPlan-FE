import { useEffect, useState } from 'react'
import {
  differenceInCalendarDays, eachDayOfInterval, endOfDay, format, isWithinInterval, startOfDay,
} from 'date-fns'
import { getApiErrorMessage } from '../services/api'
import { listAllPersonalExpenses } from '../services/expenses'
import type { Expense } from '../services/expenses'
import { useAppStore } from '../store/useAppStore'
import {
  buildColumns, byCategory, dateOf, headingOf, LEVELS, previousWindow, step,
  trailOf, windowFor, withinWindow,
} from './expenseWindow'
import type { Column, Level, Slice } from './expenseWindow'

export { LEVELS, LEVEL_LABEL } from './expenseWindow'
export type { Column, Level, Slice } from './expenseWindow'

/**
 * Your own spending, for one window at a time.
 *
 * The group analysis answers "who owes whom". This one answers a different
 * question — *am I spending more than I did, and on what* — so it is built
 * around comparison rather than around people:
 *
 * - every figure is shown against the **same window one step back**, because a
 *   number with nothing to compare it to is trivia;
 * - a window containing today is **projected forward**, since "₹2,100 of
 *   ₹8,000" on the 9th sounds fine and is not;
 * - days with no spending are counted, because they are the thing that
 *   actually moves a monthly total.
 */

export type CategoryRow = Slice & {
  count: number
  /** Change against the same category one window back. */
  delta: number
  previous: number
}

export type PersonalAnalytics = {
  spent: number
  count: number
  average: number
  /** Spend per calendar day of the window — comparable across a week and a month. */
  perDay: number
  /** Days in the window that have already happened and had no expense at all. */
  quietDays: number
  elapsedDays: number
  windowDays: number
  largest: Expense | null
  busiestDay: { at: Date; value: number } | null
  /** The same window, one step back. */
  previousSpent: number
  delta: number
  deltaShare: number
  /** Only when the window contains today: this window's total at this rate. */
  projected: number | null
  categories: CategoryRow[]
  weekdays: { label: string; value: number }[]
  columns: Column[]
  topExpenses: Expense[]
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function usePersonalAnalytics() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryToken, setRetryToken] = useState(0)
  const expensesVersion = useAppStore((state) => state.expensesVersion)

  const [level, setLevel] = useState<Level>('month')
  // a number, not a Date: state compared by value survives re-renders cleanly
  const [anchorMs, setAnchorMs] = useState(() => Date.now())
  const anchor = new Date(anchorMs)

  useEffect(() => {
    let cancelled = false

    listAllPersonalExpenses()
      .then((all) => {
        if (cancelled) return
        setExpenses(all.items)
        setTruncated(all.truncated)
        setError('')
      })
      .catch((fetchError) => {
        if (!cancelled) setError(getApiErrorMessage(fetchError, 'Could not load your spending history.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [retryToken, expensesVersion])

  const today = new Date()
  const { from, to } = windowFor(level, anchor)
  const inRange = withinWindow(expenses, from, to)

  const previous = previousWindow(level, anchor)
  const inPrevious = withinWindow(expenses, previous.from, previous.to)

  const spent = inRange.reduce((sum, expense) => sum + expense.totalAmount, 0)
  const previousSpent = inPrevious.reduce((sum, expense) => sum + expense.totalAmount, 0)

  // ---- how the window sits against the calendar ----
  const windowDays = differenceInCalendarDays(to, from) + 1
  const isNow = isWithinInterval(today, { start: from, end: to })
  // a window in the past is fully elapsed; the current one only up to today
  const elapsedDays = isNow
    ? Math.min(windowDays, differenceInCalendarDays(today, from) + 1)
    : today > to ? windowDays : 0

  const spentPerDay = new Map<string, number>()
  for (const expense of inRange) {
    const at = dateOf(expense)
    if (!at) continue
    const key = format(at, 'yyyy-MM-dd')
    spentPerDay.set(key, (spentPerDay.get(key) ?? 0) + expense.totalAmount)
  }

  const elapsedInterval = elapsedDays > 0
    ? eachDayOfInterval({ start: from, end: isNow ? endOfDay(today) : to })
    : []
  const quietDays = elapsedInterval.filter((day) => !spentPerDay.has(format(day, 'yyyy-MM-dd'))).length

  const busiestDay = [...spentPerDay.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({ at: startOfDay(new Date(key)), value }))[0] ?? null

  // ---- categories, each against its own past ----
  const previousByCategory = new Map(
    byCategory(inPrevious, previousSpent).map((slice) => [slice.label, slice.value]),
  )
  const counts = new Map<string, number>()
  for (const expense of inRange) {
    const key = expense.category?.trim() || 'Uncategorised'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const categories: CategoryRow[] = byCategory(inRange, spent).map((slice) => {
    const was = previousByCategory.get(slice.label) ?? 0
    return { ...slice, count: counts.get(slice.label) ?? 0, previous: was, delta: slice.value - was }
  })

  // ---- which days of the week the money goes ----
  const weekdayTotals = new Array<number>(7).fill(0)
  for (const expense of inRange) {
    const at = dateOf(expense)
    if (!at) continue
    // getDay() is Sunday-first; this list starts on Monday
    weekdayTotals[(at.getDay() + 6) % 7] += expense.totalAmount
  }
  const weekdays = WEEKDAY_LABELS.map((label, index) => ({ label, value: weekdayTotals[index] }))

  const largest = inRange.reduce<Expense | null>(
    (biggest, expense) => (!biggest || expense.totalAmount > biggest.totalAmount ? expense : biggest), null)

  const analytics: PersonalAnalytics = {
    spent,
    count: inRange.length,
    average: inRange.length ? spent / inRange.length : 0,
    perDay: elapsedDays > 0 ? spent / elapsedDays : 0,
    quietDays,
    elapsedDays,
    windowDays,
    largest,
    busiestDay,
    previousSpent,
    delta: spent - previousSpent,
    deltaShare: previousSpent > 0 ? ((spent - previousSpent) / previousSpent) * 100 : 0,
    // a rate needs days behind it, and one day is not a rate
    projected: isNow && elapsedDays > 0 && windowDays > 1 ? (spent / elapsedDays) * windowDays : null,
    categories,
    weekdays,
    columns: buildColumns(level, from, to, inRange, today),
    topExpenses: [...inRange].sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 5),
  }

  /** Opening a bar moves down a level onto the moment it represents. */
  function drillInto(column: Column) {
    if (!column.at) return
    const next = LEVELS[LEVELS.indexOf(level) + 1]
    if (!next) return
    setAnchorMs(column.at.getTime())
    setLevel(next)
  }

  function retry() {
    setLoading(true)
    setError('')
    setRetryToken((token) => token + 1)
  }

  return {
    analytics,
    /** The window's own expenses, for the list underneath the charts. */
    expenses: inRange,
    window: { from, to },
    loading,
    error,
    truncated,
    retry,
    level,
    heading: headingOf(level, anchor),
    trail: trailOf(level, anchor),
    goTo: (next: Level) => setLevel(next),
    shift: (delta: number) => setAnchorMs(step(level, anchor, delta).getTime()),
    jumpToNow: () => setAnchorMs(Date.now()),
    drillInto,
    canDrill: level !== 'day',
    isNow,
    hasHistory: expenses.length > 0,
  }
}
