import { describe, expect, it } from 'vitest'
import { applyFilters, EMPTY_FILTERS, isFiltered } from './ledgerFilter'
import type { Expense } from '../../services/expenses'

const TODAY = new Date(2026, 8, 2)

const spend = (title: string, amount: number, iso: string, category: string | null = 'Food', notes?: string): Expense => ({
  id: `${title}-${iso}`,
  scope: 'PERSONAL',
  groupId: null,
  title,
  totalAmount: amount,
  currency: 'INR',
  paidById: null,
  createdById: 'u1',
  splitType: null,
  category,
  notes: notes ?? null,
  date: new Date(iso).toISOString(),
  shares: [],
  myShare: amount,
})

const ROWS = [
  spend('Headphones', 2499, '2026-08-12', 'Shopping'),
  spend('Dinner at Toit', 1860, '2026-08-17'),
  spend('Petrol', 1200, '2026-09-01', 'Fuel', 'Indian Oil, Sector 18'),
  spend('Old laptop stand', 900, '2026-02-03', 'Shopping'),
]

const titles = (rows: Expense[]) => rows.map((row) => row.title)

describe('finding one expense', () => {
  it('matches a partial word in the title', () => {
    expect(titles(applyFilters(ROWS, { ...EMPTY_FILTERS, query: 'lap' }, TODAY))).toEqual(['Old laptop stand'])
  })

  it('ignores case and stray spaces', () => {
    expect(titles(applyFilters(ROWS, { ...EMPTY_FILTERS, query: '  HEADphones ' }, TODAY))).toEqual(['Headphones'])
  })

  // people look for the number they remember, not the words
  it('matches on the amount', () => {
    expect(titles(applyFilters(ROWS, { ...EMPTY_FILTERS, query: '1860' }, TODAY))).toEqual(['Dinner at Toit'])
  })

  it('searches the note as well as the title', () => {
    expect(titles(applyFilters(ROWS, { ...EMPTY_FILTERS, query: 'sector' }, TODAY))).toEqual(['Petrol'])
  })

  it('needs every word to match, so a second word narrows', () => {
    expect(applyFilters(ROWS, { ...EMPTY_FILTERS, query: 'old stand' }, TODAY)).toHaveLength(1)
    expect(applyFilters(ROWS, { ...EMPTY_FILTERS, query: 'old headphones' }, TODAY)).toEqual([])
  })
})

describe('narrowing', () => {
  it('filters by category, uncategorised included', () => {
    expect(titles(applyFilters(ROWS, { ...EMPTY_FILTERS, category: 'Shopping' }, TODAY)))
      .toEqual(['Headphones', 'Old laptop stand'])
  })

  it('limits to this month', () => {
    expect(titles(applyFilters(ROWS, { ...EMPTY_FILTERS, range: 'month' }, TODAY))).toEqual(['Petrol'])
  })

  it('limits to the last three months', () => {
    expect(applyFilters(ROWS, { ...EMPTY_FILTERS, range: 'last' }, TODAY)).toHaveLength(3)
  })

  it('combines a search with a range', () => {
    expect(applyFilters(ROWS, { ...EMPTY_FILTERS, query: 'stand', range: 'month' }, TODAY)).toEqual([])
  })

  it('knows when nothing is being filtered', () => {
    expect(isFiltered(EMPTY_FILTERS)).toBe(false)
    expect(isFiltered({ ...EMPTY_FILTERS, query: '  ' })).toBe(false)
    expect(isFiltered({ ...EMPTY_FILTERS, range: 'year' })).toBe(true)
  })
})
