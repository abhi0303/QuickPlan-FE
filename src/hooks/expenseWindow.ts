import {
  addDays, addMonths, addWeeks, addYears,
  eachDayOfInterval, eachMonthOfInterval, eachWeekOfInterval,
  endOfDay, endOfMonth, endOfWeek, endOfYear,
  format, isWithinInterval,
  max as maxDate, min as minDate, parseISO,
  startOfDay, startOfMonth, startOfWeek, startOfYear,
} from 'date-fns'
import type { Expense } from '../services/expenses'

/**
 * The time window an analysis page is looking at, and the buckets it draws.
 *
 * Pure functions, shared by the group and personal analyses: a year drills into
 * months, a month into weeks, a week into days, and a day into its own
 * expenses. Keeping it out of both hooks means the two pages cannot drift into
 * disagreeing about what "this week" is.
 */

export const LEVELS = ['year', 'month', 'week', 'day'] as const
export type Level = (typeof LEVELS)[number]

export const LEVEL_LABEL: Record<Level, string> = {
  year: 'Year',
  month: 'Month',
  week: 'Week',
  day: 'Day',
}

export type Column = {
  /** Start of the bucket, or the expense id at day level. */
  key: string
  label: string
  sub?: string
  value: number
  /** Present when the column can be opened one level down. */
  at?: Date
  /** True for the bucket containing today. */
  now?: boolean
}

/** Weeks start on Monday, which is how a week is spoken about here. */
export const WEEK = { weekStartsOn: 1 } as const

export function windowFor(level: Level, anchor: Date) {
  if (level === 'year') return { from: startOfYear(anchor), to: endOfYear(anchor) }
  if (level === 'month') return { from: startOfMonth(anchor), to: endOfMonth(anchor) }
  if (level === 'week') return { from: startOfWeek(anchor, WEEK), to: endOfWeek(anchor, WEEK) }
  return { from: startOfDay(anchor), to: endOfDay(anchor) }
}

/** How far one press of the arrows moves at each level. */
export function step(level: Level, anchor: Date, delta: number) {
  if (level === 'year') return addYears(anchor, delta)
  if (level === 'month') return addMonths(anchor, delta)
  if (level === 'week') return addWeeks(anchor, delta)
  return addDays(anchor, delta)
}

export const dateOf = (expense: Expense) => {
  const parsed = parseISO(expense.date)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function withinWindow(expenses: Expense[], from: Date, to: Date) {
  return expenses.filter((expense) => {
    const at = dateOf(expense)
    return at !== null && isWithinInterval(at, { start: from, end: to })
  })
}

/**
 * One bar per bucket.
 *
 * Empty buckets keep their column: a week with no spending is a fact about the
 * week, and dropping it would silently compress the timeline.
 */
export function buildColumns(level: Level, from: Date, to: Date, inRange: Expense[], today = new Date()): Column[] {
  function sumBetween(start: Date, end: Date) {
    return inRange.reduce((sum, expense) => {
      const at = dateOf(expense)
      return at && at >= start && at <= end ? sum + expense.totalAmount : sum
    }, 0)
  }

  if (level === 'year') {
    return eachMonthOfInterval({ start: from, end: to }).map((month) => ({
      key: String(month.getTime()),
      label: format(month, 'MMM'),
      value: sumBetween(startOfMonth(month), endOfMonth(month)),
      at: month,
      now: format(month, 'yyyy-MM') === format(today, 'yyyy-MM'),
    }))
  }

  if (level === 'month') {
    // weeks are clipped to the month, so the first and last bars only count the
    // days that actually belong to it
    return eachWeekOfInterval({ start: from, end: to }, WEEK).map((weekStart) => {
      const start = maxDate([startOfWeek(weekStart, WEEK), from])
      const end = minDate([endOfWeek(weekStart, WEEK), to])
      return {
        key: String(weekStart.getTime()),
        label: `${format(start, 'd')}–${format(end, 'd')}`,
        sub: format(start, 'MMM'),
        value: sumBetween(start, end),
        at: weekStart,
        now: isWithinInterval(today, { start, end }),
      }
    })
  }

  if (level === 'week') {
    return eachDayOfInterval({ start: from, end: to }).map((day) => ({
      key: String(day.getTime()),
      label: format(day, 'EEE'),
      sub: format(day, 'd'),
      value: sumBetween(startOfDay(day), endOfDay(day)),
      at: day,
      now: format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd'),
    }))
  }

  // the day itself has no smaller bucket, so each expense is its own bar
  return [...inRange]
    .sort((a, b) => (dateOf(a)?.getTime() ?? 0) - (dateOf(b)?.getTime() ?? 0))
    .map((expense) => ({
      key: expense.id,
      label: expense.title,
      sub: dateOf(expense) ? format(dateOf(expense) as Date, 'h:mm a') : undefined,
      value: expense.totalAmount,
    }))
}

/** Breadcrumb: every level above this one, plus the current window's own name. */
export function trailOf(level: Level, anchor: Date) {
  return [
    { level: 'year' as Level, label: format(anchor, 'yyyy') },
    { level: 'month' as Level, label: format(anchor, 'MMMM') },
    { level: 'week' as Level, label: `${format(startOfWeek(anchor, WEEK), 'd')}–${format(endOfWeek(anchor, WEEK), 'd MMM')}` },
    { level: 'day' as Level, label: format(anchor, 'd MMM') },
  ].slice(0, LEVELS.indexOf(level) + 1)
}

export function headingOf(level: Level, anchor: Date) {
  if (level === 'year') return format(anchor, 'yyyy')
  if (level === 'month') return format(anchor, 'MMMM yyyy')
  if (level === 'week') {
    return `${format(startOfWeek(anchor, WEEK), 'd MMM')} – ${format(endOfWeek(anchor, WEEK), 'd MMM yyyy')}`
  }
  return format(anchor, 'EEEE, d MMM yyyy')
}

/** The window immediately before this one — what "up from last month" compares against. */
export function previousWindow(level: Level, anchor: Date) {
  return windowFor(level, step(level, anchor, -1))
}

export type Slice = { label: string, value: number, share: number }

export function byCategory(expenses: Expense[], total: number): Slice[] {
  const totals = new Map<string, number>()
  for (const expense of expenses) {
    const key = expense.category?.trim() || 'Uncategorised'
    totals.set(key, (totals.get(key) ?? 0) + expense.totalAmount)
  }
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value, share: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
}
