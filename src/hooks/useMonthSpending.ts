import { useCallback, useEffect, useState } from 'react'
import { differenceInCalendarDays, endOfMonth, format, startOfMonth } from 'date-fns'
import { getApiErrorMessage } from '../services/api'
import { listAllPersonalExpenses } from '../services/expenses'
import type { Expense } from '../services/expenses'
import { useAppStore } from '../store/useAppStore'

/**
 * What you have actually spent this month, by category.
 *
 * Not an estimate and not a forecast — the real expenses, added up. An average
 * of past months is the wrong answer for somebody who wants to know where this
 * month is going, and it is no answer at all for somebody who has been using
 * the app for a fortnight.
 *
 * Only personal expenses count: a group expense is somebody else's list until
 * it is settled, and the group half of Money already tracks it.
 */

export type CategorySpend = {
  category: string
  total: number
  count: number
  /** The single largest expense in it, for "where did that go?". */
  largest: Expense | null
}

export function useMonthSpending() {
  const [categories, setCategories] = useState<CategorySpend[]>([])
  const [total, setTotal] = useState(0)
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const expensesVersion = useAppStore((state) => state.expensesVersion)

  const now = new Date()
  const from = startOfMonth(now)
  const to = endOfMonth(now)
  const fromKey = format(from, 'yyyy-MM-dd')
  const toKey = format(to, 'yyyy-MM-dd')

  useEffect(() => {
    let cancelled = false

    listAllPersonalExpenses({ from: fromKey, to: toKey })
      .then((page) => {
        if (cancelled) return
        setCategories(groupByCategory(page.items))
        setTotal(page.items.reduce((sum, expense) => sum + expense.totalAmount, 0))
        setCount(page.items.length)
        setError('')
      })
      .catch((fetchError) => {
        if (!cancelled) setError(getApiErrorMessage(fetchError, 'Could not load this month’s spending.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [fromKey, toKey, version, expensesVersion])

  const reload = useCallback(() => setVersion((token) => token + 1), [])

  return {
    categories,
    total,
    count,
    loading,
    error,
    reload,
    period: {
      from,
      to,
      /** Today counts: it is a day you have already had the chance to spend on. */
      daysElapsed: Math.min(differenceInCalendarDays(now, from) + 1, differenceInCalendarDays(to, from) + 1),
      daysTotal: differenceInCalendarDays(to, from) + 1,
    },
  }
}

/** Biggest first — the point of the list is to find where the money went. */
function groupByCategory(expenses: Expense[]): CategorySpend[] {
  const buckets = new Map<string, CategorySpend>()

  for (const expense of expenses) {
    const key = expense.category?.trim() || 'Uncategorised'
    const bucket = buckets.get(key) ?? { category: key, total: 0, count: 0, largest: null }
    bucket.total += expense.totalAmount
    bucket.count += 1
    if (!bucket.largest || expense.totalAmount > bucket.largest.totalAmount) bucket.largest = expense
    buckets.set(key, bucket)
  }

  return [...buckets.values()].sort((a, b) => b.total - a.total)
}
