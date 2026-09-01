import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { Expense } from './expenses'
import type { Recurring } from './recurring'

/**
 * Repeats worth turning into a schedule.
 *
 * Rent, an EMI and three subscriptions are the same number on roughly the same
 * day every month, and typing them in is the chore the recurring feature
 * exists to remove — but only if somebody remembers to set it up. The history
 * already says which ones they are.
 *
 * The rules are deliberately strict, because a wrong suggestion is worse than
 * none: it asks the user to check the app's arithmetic. Petrol every month is a
 * habit, not a subscription, and the amount tolerance is what tells them apart.
 */

export type RecurringCandidate = {
  /** Stable across renders: the normalised title. */
  key: string
  title: string
  category: string | null
  /** The typical amount — the median, so one odd month cannot drag it. */
  amount: number
  /** The typical day it lands on. */
  dayOfMonth: number
  /** Calendar months it was seen in, oldest first. */
  months: string[]
  lastSeen: string
}

/** At least this many months before a repeat counts as a pattern. */
const MIN_MONTHS = 3
/** How far the amount may wander and still be "the same bill". */
const AMOUNT_TOLERANCE = 0.05
/** How far the date may wander. A bill on the 3rd and the 6th is the same bill. */
const DAY_TOLERANCE = 4
/** Older than this and it is a schedule that ended, not one waiting to be made. */
const STALE_DAYS = 45

const normalise = (title: string) => title.trim().toLowerCase().replace(/\s+/g, ' ')

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function detectRecurring(
  expenses: Expense[],
  existing: Recurring[] = [],
  today = new Date(),
): RecurringCandidate[] {
  const alreadyScheduled = new Set(existing.map((item) => normalise(item.title)))
  const groups = new Map<string, Expense[]>()

  for (const expense of expenses) {
    // a schedule already created this one; suggesting it back would be a loop
    if (expense.createdVia === 'SYSTEM') continue
    const key = normalise(expense.title)
    if (!key || alreadyScheduled.has(key)) continue
    groups.set(key, [...(groups.get(key) ?? []), expense])
  }

  const candidates: RecurringCandidate[] = []

  for (const [key, group] of groups) {
    const dated = group
      .map((expense) => ({ expense, at: parseISO(expense.date) }))
      .filter((row) => !Number.isNaN(row.at.getTime()))
      .sort((a, b) => a.at.getTime() - b.at.getTime())

    // one per month: twice in a month is a habit, not a subscription
    const byMonth = new Map<string, { expense: Expense, at: Date }>()
    let duplicated = false
    for (const row of dated) {
      const month = format(row.at, 'yyyy-MM')
      if (byMonth.has(month)) { duplicated = true; break }
      byMonth.set(month, row)
    }
    if (duplicated || byMonth.size < MIN_MONTHS) continue

    const rows = [...byMonth.values()]
    const amounts = rows.map((row) => row.expense.totalAmount)
    const typicalAmount = median(amounts)
    if (typicalAmount <= 0) continue
    if (amounts.some((amount) => Math.abs(amount - typicalAmount) / typicalAmount > AMOUNT_TOLERANCE)) continue

    const days = rows.map((row) => row.at.getDate())
    const typicalDay = Math.round(median(days))
    if (days.some((day) => Math.abs(day - typicalDay) > DAY_TOLERANCE)) continue

    const last = rows[rows.length - 1]
    if (differenceInCalendarDays(today, last.at) > STALE_DAYS) continue

    candidates.push({
      key,
      // the exact wording of the most recent one, not the normalised key
      title: last.expense.title,
      category: last.expense.category ?? null,
      amount: typicalAmount,
      dayOfMonth: typicalDay,
      months: [...byMonth.keys()],
      lastSeen: last.expense.date,
    })
  }

  // the biggest commitment is the one worth automating first
  return candidates.sort((a, b) => b.amount - a.amount)
}
