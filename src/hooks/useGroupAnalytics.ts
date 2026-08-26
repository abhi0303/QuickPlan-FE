import { useEffect, useState } from 'react'
import { isWithinInterval } from 'date-fns'
import { getApiErrorMessage } from '../services/api'
import { getGroupBalances, listAllGroupExpenses } from '../services/expenses'
import type { Expense, GroupBalances } from '../services/expenses'

import {
  buildColumns, byCategory, headingOf, LEVELS, step, trailOf, windowFor, withinWindow,
} from './expenseWindow'
import type { Column, Level, Slice } from './expenseWindow'

export { LEVELS, LEVEL_LABEL } from './expenseWindow'
export type { Column, Level, Slice } from './expenseWindow'

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
  const inRange = withinWindow(expenses, from, to)

  const totalSpent = inRange.reduce((sum, expense) => sum + expense.totalAmount, 0)
  const myShare = inRange.reduce((sum, expense) => sum + (expense.myShare ?? 0), 0)
  const myPaid = inRange.reduce((sum, expense) => sum + (expense.iPaid ? expense.totalAmount : 0), 0)

  // ---- by category ----
  const byCategorySlices = byCategory(inRange, totalSpent)

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

  const columns = buildColumns(level, from, to, inRange)

  const largest = inRange.reduce<Expense | null>(
    (biggest, expense) => (!biggest || expense.totalAmount > biggest.totalAmount ? expense : biggest), null)

  const topExpenses = [...inRange].sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 5)

  const trail = trailOf(level, anchor)
  const heading = headingOf(level, anchor)

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
    byCategory: byCategorySlices,
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
    isNow: isWithinInterval(new Date(), { start: from, end: to }),
    hasHistory: expenses.length > 0,
  }
}
