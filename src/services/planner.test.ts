import { describe, expect, it } from 'vitest'
import { splitCommitted } from './planner'
import type { CommittedItem } from './planner'

function commitment(over: Partial<CommittedItem> & { label: string; amount: number }): CommittedItem {
  return {
    id: over.label,
    label: over.label,
    // `??` would swallow an explicit null, which one of the cases below needs
    category: 'category' in over ? over.category : over.label,
    cadence: 'MONTHLY',
    amount: over.amount,
    monthly: over.monthly ?? over.amount,
    included: over.included ?? true,
    paused: over.paused,
  }
}

describe('splitCommitted', () => {
  it('treats a commitment as due when nothing has been charged for it', () => {
    const split = splitCommitted([commitment({ label: 'EMI', amount: 30000 })], [])
    expect(split).toEqual({ due: 30000, paid: 0, paidCash: 0, paidIds: [] })
  })

  it('treats it as paid once a matching outflow exists', () => {
    const split = splitCommitted(
      [commitment({ label: 'EMI', amount: 30000 })],
      [{ category: 'EMI', amount: 30000 }],
    )
    expect(split.due).toBe(0)
    expect(split.paid).toBe(30000)
    expect(split.paidCash).toBe(30000)
  })

  /* The reported bug, in numbers: every commitment already charged, and the
     month reported as short of an income it was well inside. */
  it('does not count a charged commitment twice', () => {
    const items = [
      commitment({ label: 'Home Loan EMI', category: 'EMI', amount: 30000 }),
      commitment({ label: 'Car EMI', category: 'EMI', amount: 18065 }),
      commitment({ label: 'SIP', category: 'Investments', amount: 2000 }),
      commitment({ label: 'RD', category: 'Investments', amount: 20000 }),
      commitment({ label: 'Car wash', category: 'Bills', amount: 500 }),
    ]
    const outflows = [
      { category: 'EMI', amount: 30000 },
      { category: 'EMI', amount: 18065 },
      { category: 'Investments', amount: 2000 },
      { category: 'Investments', amount: 20000 },
      { category: 'Bills', amount: 500 },
      { category: 'Food', amount: 36987 },
    ]

    const split = splitCommitted(items, outflows)
    expect(split.due).toBe(0)
    expect(split.paid).toBe(70565)

    const income = 166000
    const spent = outflows.reduce((sum, row) => sum + row.amount, 0)
    // before the fix this was 166000 - 70565 - 107552 = -12117
    expect(income - split.due - spent).toBe(58448)
  })

  it('consumes each outflow once, so two identical schedules need two charges', () => {
    const items = [
      commitment({ label: 'Rent A', category: 'Rent', amount: 18000 }),
      commitment({ label: 'Rent B', category: 'Rent', amount: 18000 }),
    ]
    const split = splitCommitted(items, [{ category: 'Rent', amount: 18000 }])
    expect(split.paid).toBe(18000)
    expect(split.due).toBe(18000)
  })

  it('ignores a commitment that is switched off — it is not in the total either', () => {
    const items = [commitment({ label: 'Electric Bill', category: 'Bills', amount: 3700, included: false })]
    const split = splitCommitted(items, [{ category: 'Bills', amount: 3700 }])
    expect(split).toEqual({ due: 0, paid: 0, paidCash: 0, paidIds: [] })
  })

  it('ignores a paused schedule, which is not going to charge', () => {
    const items = [commitment({ label: 'Gym', category: 'Health', amount: 1200, paused: true })]
    expect(splitCommitted(items, []).due).toBe(0)
  })

  it('needs the category to agree, not just the amount', () => {
    const split = splitCommitted(
      [commitment({ label: 'EMI', category: 'EMI', amount: 2000 })],
      [{ category: 'Food', amount: 2000 }],
    )
    expect(split.due).toBe(2000)
    expect(split.paid).toBe(0)
  })

  it('matches regardless of case and padding on the category', () => {
    const split = splitCommitted(
      [commitment({ label: 'Rent', category: 'Rent', amount: 18000 })],
      [{ category: '  rent ', amount: 18000 }],
    )
    expect(split.paid).toBe(18000)
  })

  /* A yearly premium takes its whole amount out of one month while only ever
     contributing a twelfth to the monthly plan. */
  it('keeps the monthly figure and the cash apart', () => {
    const items = [commitment({ label: 'Insurance', category: 'Health', amount: 12000, monthly: 1000 })]
    const split = splitCommitted(items, [{ category: 'Health', amount: 12000 }])
    expect(split.paid).toBe(1000)
    expect(split.paidCash).toBe(12000)
    expect(split.due).toBe(0)
  })

  it('tolerates a rounding difference of less than a paisa', () => {
    const split = splitCommitted(
      [commitment({ label: 'EMI', category: 'EMI', amount: 18065 })],
      [{ category: 'EMI', amount: 18065.004 }],
    )
    expect(split.paid).toBe(18065)
  })

  it('handles a commitment with no category against an uncategorised outflow', () => {
    const split = splitCommitted(
      [commitment({ label: 'Misc', category: null, amount: 900 })],
      [{ category: null, amount: 900 }],
    )
    expect(split.paid).toBe(900)
  })
})
