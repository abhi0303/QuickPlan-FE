import { describe, expect, it } from 'vitest'
import { byDateDesc } from './expenses'
import type { Expense } from './expenses'

const expense = (id: string, date: string): Expense => ({
  id,
  groupId: 'g1',
  title: id,
  totalAmount: 100,
  currency: 'INR',
  paidById: 'u1',
  createdById: 'u1',
  splitType: 'EQUAL',
  date,
  shares: [],
})

/**
 * The list is ordered by when the expense happened, not when it was typed in —
 * a backdated expense belongs in its own place in the timeline. The API
 * documents no ordering, so this is settled client-side for every caller.
 */
describe('byDateDesc', () => {
  it('puts the most recent first', () => {
    const sorted = [
      expense('old', '2026-08-20T10:00:00.000Z'),
      expense('new', '2026-08-24T10:00:00.000Z'),
      expense('middle', '2026-08-22T10:00:00.000Z'),
    ].sort(byDateDesc)
    expect(sorted.map((row) => row.id)).toEqual(['new', 'middle', 'old'])
  })

  it('separates two expenses on the same day by their time', () => {
    const sorted = [
      expense('morning', '2026-08-24T04:00:00.000Z'),
      expense('evening', '2026-08-24T18:00:00.000Z'),
    ].sort(byDateDesc)
    expect(sorted.map((row) => row.id)).toEqual(['evening', 'morning'])
  })

  it('breaks an exact tie by id, so the order never flickers between renders', () => {
    const same = '2026-08-24T10:00:00.000Z'
    const first = [expense('a', same), expense('b', same)].sort(byDateDesc)
    const second = [expense('b', same), expense('a', same)].sort(byDateDesc)
    expect(first.map((row) => row.id)).toEqual(second.map((row) => row.id))
  })

  it('does not throw on an unparseable date', () => {
    const sorted = [expense('bad', 'not a date'), expense('good', '2026-08-24T10:00:00.000Z')].sort(byDateDesc)
    expect(sorted).toHaveLength(2)
  })
})
