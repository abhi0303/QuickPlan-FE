import { describe, expect, it } from 'vitest'
import { format } from 'date-fns'
import {
  buildColumns, byCategory, headingOf, previousWindow, step, trailOf, windowFor, withinWindow,
} from './expenseWindow'
import type { Expense } from '../services/expenses'

/**
 * The windowing is what every figure on both analysis pages is filtered by, so
 * an off-by-one here is wrong everywhere at once and visible nowhere.
 *
 * Dates are built with local constructors and asserted on local parts: the
 * windows are local calendar boundaries, and CI runs in UTC.
 */

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString()

const expense = (id: string, date: string, amount: number, category?: string): Expense => ({
  id,
  scope: 'PERSONAL',
  groupId: null,
  title: id,
  totalAmount: amount,
  currency: 'INR',
  paidById: null,
  createdById: 'u1',
  splitType: null,
  category: category ?? null,
  date,
  shares: [],
  myShare: amount,
})

/** A Tuesday in August 2026. August starts on a Saturday. */
const ANCHOR = new Date(2026, 7, 25, 10)

const day = (date: Date) => format(date, 'yyyy-MM-dd HH:mm')

describe('the window for each level', () => {
  it.each([
    ['year', '2026-01-01 00:00', '2026-12-31 23:59'],
    ['month', '2026-08-01 00:00', '2026-08-31 23:59'],
    // weeks start on Monday, so the 25th sits in the 24th–30th week
    ['week', '2026-08-24 00:00', '2026-08-30 23:59'],
    ['day', '2026-08-25 00:00', '2026-08-25 23:59'],
  ])('%s', (level, from, to) => {
    const window = windowFor(level as never, ANCHOR)
    expect(day(window.from)).toBe(from)
    expect(day(window.to)).toBe(to)
  })

  it('steps by its own unit, not by a fixed number of days', () => {
    expect(format(step('month', ANCHOR, -1), 'yyyy-MM')).toBe('2026-07')
    expect(format(step('year', ANCHOR, 1), 'yyyy')).toBe('2027')
    expect(format(step('week', ANCHOR, -1), 'd MMM')).toBe('18 Aug')
    expect(format(step('day', ANCHOR, 1), 'd MMM')).toBe('26 Aug')
  })

  it('compares a month against the month before it, not 30 days back', () => {
    const previous = previousWindow('month', ANCHOR)
    expect(day(previous.from)).toBe('2026-07-01 00:00')
    expect(day(previous.to)).toBe('2026-07-31 23:59')
  })

  it('names the window the way a person would', () => {
    expect(headingOf('year', ANCHOR)).toBe('2026')
    expect(headingOf('month', ANCHOR)).toBe('August 2026')
    expect(headingOf('day', ANCHOR)).toBe('Tuesday, 25 Aug 2026')
  })
})

describe('what falls inside it', () => {
  const list = [
    expense('early', at(2026, 7, 31, 23), 100),
    expense('first', at(2026, 8, 1, 0), 100),
    expense('last', at(2026, 8, 31, 23), 100),
    expense('after', at(2026, 9, 1, 0), 100),
  ]

  it('includes both edges of the month and nothing outside it', () => {
    const { from, to } = windowFor('month', ANCHOR)
    expect(withinWindow(list, from, to).map((e) => e.id)).toEqual(['first', 'last'])
  })

  it('drops an expense whose date will not parse rather than dating it now', () => {
    const { from, to } = windowFor('month', ANCHOR)
    expect(withinWindow([expense('junk', 'not-a-date', 50)], from, to)).toEqual([])
  })
})

describe('the bars', () => {
  const list = [
    expense('a', at(2026, 8, 3), 300),
    expense('b', at(2026, 8, 4), 200),
    expense('c', at(2026, 8, 20), 500),
  ]

  it('gives a year twelve months, empty ones included', () => {
    const { from, to } = windowFor('year', ANCHOR)
    const columns = buildColumns('year', from, to, withinWindow(list, from, to), ANCHOR)
    expect(columns).toHaveLength(12)
    expect(columns.map((column) => column.label)).toContain('Aug')
    expect(columns.find((column) => column.label === 'Aug')?.value).toBe(1000)
    // a month with no spending keeps its bar — the gap is the information
    expect(columns.find((column) => column.label === 'Jan')?.value).toBe(0)
  })

  /*
   * The trap: August 2026 starts on a Saturday, so its first week runs from
   * Monday 27 July. That bar must count only the 1st and 2nd, or the month's
   * bars sum to more than the month.
   */
  it('clips the first and last week to the month they belong to', () => {
    const { from, to } = windowFor('month', ANCHOR)
    const inRange = withinWindow(list, from, to)
    const columns = buildColumns('month', from, to, inRange, ANCHOR)

    expect(columns[0].label).toBe('1–2')
    expect(columns[columns.length - 1].label).toBe('31–31')

    const charted = columns.reduce((sum, column) => sum + column.value, 0)
    const actual = inRange.reduce((sum, item) => sum + item.totalAmount, 0)
    expect(charted).toBe(actual)
  })

  it('gives a week seven days, Monday first', () => {
    const { from, to } = windowFor('week', new Date(2026, 7, 5))
    const columns = buildColumns('week', from, to, list, ANCHOR)
    expect(columns.map((column) => column.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(columns[0].value).toBe(300)
  })

  it('marks the bucket containing today, and only that one', () => {
    const { from, to } = windowFor('year', ANCHOR)
    const columns = buildColumns('year', from, to, [], ANCHOR)
    expect(columns.filter((column) => column.now).map((column) => column.label)).toEqual(['Aug'])
  })

  it('turns a day into one bar per expense, oldest first, with no drill target', () => {
    const sameDay = [expense('evening', at(2026, 8, 25, 20), 100), expense('morning', at(2026, 8, 25, 8), 40)]
    const { from, to } = windowFor('day', ANCHOR)
    const columns = buildColumns('day', from, to, sameDay, ANCHOR)
    expect(columns.map((column) => column.label)).toEqual(['morning', 'evening'])
    expect(columns.every((column) => column.at === undefined)).toBe(true)
  })
})

describe('categories', () => {
  it('sums by category, biggest first, with shares that add up', () => {
    const list = [
      expense('a', at(2026, 8, 3), 300, 'Food'),
      expense('b', at(2026, 8, 4), 100, 'Fuel'),
      expense('c', at(2026, 8, 5), 100, 'Food'),
    ]
    const slices = byCategory(list, 500)
    expect(slices.map((slice) => [slice.label, slice.value])).toEqual([['Food', 400], ['Fuel', 100]])
    expect(slices.reduce((sum, slice) => sum + slice.share, 0)).toBeCloseTo(100)
  })

  it('gathers everything uncategorised under one name rather than several', () => {
    const list = [
      expense('a', at(2026, 8, 3), 100),
      expense('b', at(2026, 8, 4), 100, '   '),
      expense('c', at(2026, 8, 5), 100, ''),
    ]
    expect(byCategory(list, 300)).toEqual([{ label: 'Uncategorised', value: 300, share: 100 }])
  })

  it('does not divide by zero when nothing was spent', () => {
    expect(byCategory([expense('a', at(2026, 8, 3), 0, 'Food')], 0)).toEqual([
      { label: 'Food', value: 0, share: 0 },
    ])
  })
})

describe('the breadcrumb', () => {
  it('shows only the levels at or above the current one', () => {
    expect(trailOf('year', ANCHOR).map((crumb) => crumb.level)).toEqual(['year'])
    expect(trailOf('week', ANCHOR).map((crumb) => crumb.level)).toEqual(['year', 'month', 'week'])
    expect(trailOf('day', ANCHOR)).toHaveLength(4)
  })
})
