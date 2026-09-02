import { useMemo } from 'react'
import { differenceInCalendarDays, endOfMonth, parseISO, startOfMonth } from 'date-fns'
import { useCashFlow } from './useCashFlow'
import type { Movement } from '../services/cashflow'

/**
 * What has actually moved this month, by category.
 *
 * Cash rather than spending, and for the same reason the ledger is: a ₹4,000
 * dinner you fronted left the account this month whoever it was for, and a
 * settlement arriving put money back. A planner that counted only personal
 * expenses would tell somebody who uses groups that they have money they have
 * already spent.
 *
 * Budgets and the analysis stay share-based — see docs/cash-flow.md §2.
 */

export type CategorySpend = {
  category: string
  total: number
  count: number
  /** The single largest movement in it, for "where did that go?". */
  largest: Movement | null
}

/** Settlements have no category of their own, and lumping them under one is honest. */
const SETTLED = 'Settled up'

export function useMonthSpending() {
  const { items, loading, error, reload } = useCashFlow()

  const now = new Date()
  const from = startOfMonth(now)
  const to = endOfMonth(now)

  const month = useMemo(() => {
    const inMonth = items.filter((movement) => {
      const at = parseISO(movement.at)
      return !Number.isNaN(at.getTime()) && at >= from && at <= to
    })

    const buckets = new Map<string, CategorySpend>()
    let received = 0

    for (const movement of inMonth) {
      if (movement.direction === 'IN') {
        received += movement.amount
        continue
      }

      const key = movement.kind === 'SETTLEMENT_PAID'
        ? SETTLED
        : movement.category?.trim() || 'Uncategorised'

      const bucket = buckets.get(key) ?? { category: key, total: 0, count: 0, largest: null }
      bucket.total += movement.amount
      bucket.count += 1
      if (!bucket.largest || movement.amount > bucket.largest.amount) bucket.largest = movement
      buckets.set(key, bucket)
    }

    const categories = [...buckets.values()].sort((a, b) => b.total - a.total)
    return {
      categories,
      total: categories.reduce((sum, row) => sum + row.total, 0),
      received,
      count: inMonth.length,
    }
    // `from`/`to` are derived from today and stable within a render pass
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  return {
    ...month,
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
