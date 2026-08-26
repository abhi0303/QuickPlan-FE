import { useEffect, useState } from 'react'
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isWithinInterval,
  max as maxDate,
  min as minDate,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns'
import { getApiErrorMessage } from '../services/api'
import { getGroupBalances, listAllGroupExpenses } from '../services/expenses'
import type { Expense, GroupBalances } from '../services/expenses'

/** Year drills into months, a month into weeks, a week into days, a day into its expenses. */
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

export type Slice = { label: string, value: number, share: number }
export type MemberRow = { userId: string, name: string, paid: number, share: number, net: number }

export type Analytics = {
  totalSpent: number
  count: number
  average: number
  myShare: number
  myPaid: number
  largest: Expense | null
  perPerson: number
  byCategory: Slice[]
  byMember: MemberRow[]
  columns: Column[]
  topExpenses: Expense[]
}

const WEEK = { weekStartsOn: 1 } as const

function windowFor(level: Level, anchor: Date) {
  if (level === 'year') return { from: startOfYear(anchor), to: endOfYear(anchor) }
  if (level === 'month') return { from: startOfMonth(anchor), to: endOfMonth(anchor) }
  if (level === 'week') return { from: startOfWeek(anchor, WEEK), to: endOfWeek(anchor, WEEK) }
  return { from: startOfDay(anchor), to: endOfDay(anchor) }
}

/** How far one press of the arrows moves at each level. */
function step(level: Level, anchor: Date, delta: number) {
  if (level === 'year') return addYears(anchor, delta)
  if (level === 'month') return addMonths(anchor, delta)
  if (level === 'week') return addWeeks(anchor, delta)
  return addDays(anchor, delta)
}

const dateOf = (expense: Expense) => {
  const parsed = parseISO(expense.date)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Everything the analysis page draws, for one window at a time.
 *
 * The window is a level plus an anchor date, so the same page answers "this
 * year", "this month", "that week" and "that day" — and clicking a bar moves
 * down a level rather than opening anything new. Every figure on the page,
 * not just the chart, follows the window.
 *
 * `GET /api/analytics/groups/{id}` exists but documents no response body, so
 * nothing can be written against it yet — see docs/analytics-api.md. Doing the
 * arithmetic here means the page is exact and available now.
 */
export function useGroupAnalytics(groupId: string, memberCount: number) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [balances, setBalances] = useState<GroupBalances | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryToken, setRetryToken] = useState(0)

  const [level, setLevel] = useState<Level>('month')
  // a number, not a Date: state compared by value survives re-renders cleanly
  const [anchorMs, setAnchorMs] = useState(() => Date.now())
  const anchor = new Date(anchorMs)

  useEffect(() => {
    if (!groupId) return
    let cancelled = false

    Promise.all([listAllGroupExpenses(groupId), getGroupBalances(groupId)])
      .then(([all, groupBalances]) => {
        if (cancelled) return
        setExpenses(all.items)
        setTruncated(all.truncated)
        setBalances(groupBalances)
        setError('')
      })
      .catch((fetchError) => {
        if (!cancelled) setError(getApiErrorMessage(fetchError, 'Could not load this group’s history.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [groupId, retryToken])

  const { from, to } = windowFor(level, anchor)
  const inRange = expenses.filter((expense) => {
    const at = dateOf(expense)
    return at !== null && isWithinInterval(at, { start: from, end: to })
  })

  const totalSpent = inRange.reduce((sum, expense) => sum + expense.totalAmount, 0)
  const myShare = inRange.reduce((sum, expense) => sum + (expense.myShare ?? 0), 0)
  const myPaid = inRange.reduce((sum, expense) => sum + (expense.iPaid ? expense.totalAmount : 0), 0)

  // ---- by category ----
  const categoryTotals = new Map<string, number>()
  for (const expense of inRange) {
    const key = expense.category?.trim() || 'Uncategorised'
    categoryTotals.set(key, (categoryTotals.get(key) ?? 0) + expense.totalAmount)
  }
  const byCategory: Slice[] = [...categoryTotals.entries()]
    .map(([label, value]) => ({ label, value, share: totalSpent > 0 ? (value / totalSpent) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)

  // ---- by member: what they fronted against what they owe ----
  const paidBy = new Map<string, number>()
  const shareOf = new Map<string, number>()
  const names = new Map<string, string>()
  for (const expense of inRange) {
    // a personal expense names no payer, and has nobody to break down by
    if (expense.paidById) {
      paidBy.set(expense.paidById, (paidBy.get(expense.paidById) ?? 0) + expense.totalAmount)
      if (expense.paidBy) names.set(expense.paidBy.id, expense.paidBy.name)
    }
    for (const share of expense.shares) {
      shareOf.set(share.userId, (shareOf.get(share.userId) ?? 0) + share.amount)
      if (share.name) names.set(share.userId, share.name)
    }
  }
  for (const member of balances?.members ?? []) names.set(member.userId, member.name)

  const byMember: MemberRow[] = [...new Set([...paidBy.keys(), ...shareOf.keys()])]
    .map((userId) => {
      const paid = paidBy.get(userId) ?? 0
      const share = shareOf.get(userId) ?? 0
      return { userId, name: names.get(userId) ?? 'Someone', paid, share, net: paid - share }
    })
    .sort((a, b) => b.paid - a.paid)

  // ---- the columns for this level ----
  const today = new Date()

  function sumBetween(start: Date, end: Date) {
    return inRange.reduce((sum, expense) => {
      const at = dateOf(expense)
      return at && at >= start && at <= end ? sum + expense.totalAmount : sum
    }, 0)
  }

  const columns: Column[] = ((): Column[] => {
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
      // weeks are clipped to the month, so the first and last bars only count
      // the days that actually belong to it
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
  })()

  const largest = inRange.reduce<Expense | null>(
    (biggest, expense) => (!biggest || expense.totalAmount > biggest.totalAmount ? expense : biggest), null)

  const topExpenses = [...inRange].sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 5)

  /** Breadcrumb: every level above this one, plus the current window's own name. */
  const trail = [
    { level: 'year' as Level, label: format(anchor, 'yyyy') },
    { level: 'month' as Level, label: format(anchor, 'MMMM') },
    { level: 'week' as Level, label: `${format(startOfWeek(anchor, WEEK), 'd')}–${format(endOfWeek(anchor, WEEK), 'd MMM')}` },
    { level: 'day' as Level, label: format(anchor, 'd MMM') },
  ].slice(0, LEVELS.indexOf(level) + 1)

  const heading = level === 'year' ? format(anchor, 'yyyy')
    : level === 'month' ? format(anchor, 'MMMM yyyy')
      : level === 'week' ? `${format(startOfWeek(anchor, WEEK), 'd MMM')} – ${format(endOfWeek(anchor, WEEK), 'd MMM yyyy')}`
        : format(anchor, 'EEEE, d MMM yyyy')

  /** Opening a bar moves down a level onto the moment it represents. */
  function drillInto(column: Column) {
    if (!column.at) return
    const next = LEVELS[LEVELS.indexOf(level) + 1]
    if (!next) return
    setAnchorMs(column.at.getTime())
    setLevel(next)
  }

  function goTo(nextLevel: Level) {
    setLevel(nextLevel)
  }

  function shift(delta: number) {
    setAnchorMs(step(level, anchor, delta).getTime())
  }

  function jumpToNow() {
    setAnchorMs(Date.now())
  }

  function retry() {
    setLoading(true)
    setError('')
    setRetryToken((token) => token + 1)
  }

  const analytics: Analytics = {
    totalSpent,
    count: inRange.length,
    average: inRange.length ? totalSpent / inRange.length : 0,
    myShare,
    myPaid,
    largest,
    perPerson: memberCount > 0 ? totalSpent / memberCount : 0,
    byCategory,
    byMember,
    columns,
    topExpenses,
  }

  return {
    analytics,
    /** The window's own expenses, for the printable report. */
    expenses: inRange,
    window: { from, to },
    loading,
    error,
    retry,
    truncated,
    balances,
    level,
    heading,
    trail,
    goTo,
    shift,
    jumpToNow,
    drillInto,
    canDrill: level !== 'day',
    isNow: isWithinInterval(today, { start: from, end: to }),
    hasHistory: expenses.length > 0,
  }
}
