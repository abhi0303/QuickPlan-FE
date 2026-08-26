import { describe, expect, it } from 'vitest'
import { byDateDesc, isPersonal } from './expenses'
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

/**
 * Personal and group expenses arrive in the same envelope and render through
 * the same row, so telling them apart has exactly one place it can go wrong.
 */
describe('personal or group', () => {
  it('believes the scope when the server sends one', () => {
    expect(isPersonal({ ...expense('a', '2026-08-25T10:00:00.000Z'), scope: 'PERSONAL', groupId: null })).toBe(true)
    expect(isPersonal({ ...expense('b', '2026-08-25T10:00:00.000Z'), scope: 'GROUP' })).toBe(false)
  })

  // rows cached by a build that predates personal expenses have no scope at all
  it('falls back to the absence of a group', () => {
    expect(isPersonal({ ...expense('c', '2026-08-25T10:00:00.000Z'), groupId: null })).toBe(true)
    expect(isPersonal(expense('d', '2026-08-25T10:00:00.000Z'))).toBe(false)
  })

  /*
   * The trap: a scope of GROUP with a null groupId cannot happen — the database
   * check constraint forbids it — so scope wins rather than the fallback
   * quietly reclassifying it.
   */
  it('does not let the fallback override an explicit scope', () => {
    expect(isPersonal({ ...expense('e', '2026-08-25T10:00:00.000Z'), scope: 'GROUP', groupId: null })).toBe(false)
  })
})
