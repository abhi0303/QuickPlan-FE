import { isAfter, startOfMonth, startOfYear, subMonths } from 'date-fns'
import type { Expense } from '../../services/expenses'

/**
 * Finding one expense among a year of them.
 *
 * Everything here is done on the rows already loaded, so typing is instant and
 * works with no connection. The matching is deliberately forgiving — somebody
 * looking for a laptop types "lap", not the exact title they used in July.
 */

export const RANGES = ['all', 'month', 'last', 'year'] as const
export type Range = (typeof RANGES)[number]

export const RANGE_LABEL: Record<Range, string> = {
  all: 'All time',
  month: 'This month',
  last: 'Last 3 months',
  year: 'This year',
}

export type LedgerFilters = {
  query: string
  category: string
  range: Range
}

export const EMPTY_FILTERS: LedgerFilters = { query: '', category: '', range: 'all' }

export const isFiltered = (filters: LedgerFilters) =>
  filters.query.trim() !== '' || filters.category !== '' || filters.range !== 'all'

function rangeStart(range: Range, today: Date): Date | null {
  if (range === 'month') return startOfMonth(today)
  if (range === 'last') return startOfMonth(subMonths(today, 2))
  if (range === 'year') return startOfYear(today)
  return null
}

export function applyFilters(expenses: Expense[], filters: LedgerFilters, today = new Date()): Expense[] {
  const needle = filters.query.trim().toLowerCase()
  const from = rangeStart(filters.range, today)

  return expenses.filter((expense) => {
    if (filters.category && (expense.category?.trim() || 'Uncategorised') !== filters.category) return false

    if (from) {
      const at = new Date(expense.date)
      if (Number.isNaN(at.getTime()) || !isAfter(at, from)) return false
    }

    if (!needle) return true

    // an amount is a thing people search for too: "1200" should find it
    const haystack = [
      expense.title,
      expense.notes ?? expense.description ?? '',
      expense.category ?? '',
      String(expense.totalAmount),
    ].join(' ').toLowerCase()

    return needle.split(/\s+/).every((word) => haystack.includes(word))
  })
}
