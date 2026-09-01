import { describe, expect, it } from 'vitest'
import { detectRecurring } from './recurringSuggestions'
import type { Expense } from './expenses'
import type { Recurring } from './recurring'

/**
 * A wrong suggestion is worse than none — it asks the user to check the app's
 * arithmetic. These pin the line between "a bill" and "a habit".
 */

const TODAY = new Date(2026, 8, 2)

const spend = (title: string, amount: number, iso: string, extra: Partial<Expense> = {}): Expense => ({
  id: `${title}-${iso}`,
  scope: 'PERSONAL',
  groupId: null,
  title,
  totalAmount: amount,
  currency: 'INR',
  paidById: null,
  createdById: 'u1',
  splitType: null,
  category: 'Bills',
  date: new Date(iso).toISOString(),
  shares: [],
  myShare: amount,
  ...extra,
})

const schedule = (title: string): Recurring => ({
  id: title, scope: 'PERSONAL', title, amount: 1, cadence: 'MONTHLY',
  nextRunAt: TODAY.toISOString(), pausedAt: null,
})

describe('what counts as a repeat', () => {
  it('finds the same amount on the same day three months running', () => {
    const found = detectRecurring([
      spend('Netflix', 649, '2026-06-05'),
      spend('Netflix', 649, '2026-07-05'),
      spend('Netflix', 649, '2026-08-05'),
    ], [], TODAY)

    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ title: 'Netflix', amount: 649, dayOfMonth: 5 })
    expect(found[0].months).toEqual(['2026-06', '2026-07', '2026-08'])
  })

  it('needs three months, not two', () => {
    expect(detectRecurring([
      spend('Netflix', 649, '2026-07-05'),
      spend('Netflix', 649, '2026-08-05'),
    ], [], TODAY)).toEqual([])
  })

  it('tolerates a few days of drift in when it lands', () => {
    expect(detectRecurring([
      spend('Broadband', 1200, '2026-06-03'),
      spend('Broadband', 1200, '2026-07-06'),
      spend('Broadband', 1200, '2026-08-04'),
    ], [], TODAY)).toHaveLength(1)
  })

  /*
   * The distinction the whole thing rests on. Petrol every month is a habit —
   * suggesting a fixed schedule for it would create wrong expenses every month.
   */
  it('does not mistake a monthly habit for a bill', () => {
    expect(detectRecurring([
      spend('Petrol', 1000, '2026-06-08'),
      spend('Petrol', 1450, '2026-07-11'),
      spend('Petrol', 900, '2026-08-06'),
    ], [], TODAY)).toEqual([])
  })

  it('ignores something bought twice in one month', () => {
    expect(detectRecurring([
      spend('Coffee beans', 500, '2026-06-05'),
      spend('Coffee beans', 500, '2026-06-20'),
      spend('Coffee beans', 500, '2026-07-05'),
      spend('Coffee beans', 500, '2026-08-05'),
    ], [], TODAY)).toEqual([])
  })

  it('leaves alone what a schedule already covers', () => {
    const rows = [
      spend('Netflix', 649, '2026-06-05'),
      spend('Netflix', 649, '2026-07-05'),
      spend('Netflix', 649, '2026-08-05'),
    ]
    expect(detectRecurring(rows, [schedule('netflix ')], TODAY)).toEqual([])
  })

  it('never suggests what a schedule itself created', () => {
    expect(detectRecurring([
      spend('Rent', 18000, '2026-06-01', { createdVia: 'SYSTEM' }),
      spend('Rent', 18000, '2026-07-01', { createdVia: 'SYSTEM' }),
      spend('Rent', 18000, '2026-08-01', { createdVia: 'SYSTEM' }),
    ], [], TODAY)).toEqual([])
  })

  it('drops a pattern that stopped months ago', () => {
    expect(detectRecurring([
      spend('Old gym', 1200, '2026-01-05'),
      spend('Old gym', 1200, '2026-02-05'),
      spend('Old gym', 1200, '2026-03-05'),
    ], [], TODAY)).toEqual([])
  })

  it('puts the biggest commitment first', () => {
    const found = detectRecurring([
      spend('Netflix', 649, '2026-06-05'), spend('Netflix', 649, '2026-07-05'), spend('Netflix', 649, '2026-08-05'),
      spend('Rent', 18000, '2026-06-01'), spend('Rent', 18000, '2026-07-01'), spend('Rent', 18000, '2026-08-01'),
    ], [], TODAY)
    expect(found.map((item) => item.title)).toEqual(['Rent', 'Netflix'])
  })

  it('reads a title as the same whatever its spacing and case', () => {
    expect(detectRecurring([
      spend('Netflix', 649, '2026-06-05'),
      spend('  netflix', 649, '2026-07-05'),
      spend('NETFLIX', 649, '2026-08-05'),
    ], [], TODAY)).toHaveLength(1)
  })
})
