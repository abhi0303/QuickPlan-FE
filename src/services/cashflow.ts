import { api } from './api'

/**
 * Everything that actually moved money, in one list.
 *
 * Distinct from spending on purpose. A ₹4,000 dinner you fronted and split four
 * ways *cost* you ₹1,000 and *took* ₹4,000 out of the account that evening;
 * budgets and the analysis want the first, the ledger and the forecast want the
 * second. See docs/cash-flow.md §2.
 *
 * Nothing here is stored anywhere — it is a view over expenses and settlements,
 * so a deleted expense simply stops appearing.
 */

export const MOVEMENT_KINDS = [
  'PERSONAL_EXPENSE',
  'GROUP_EXPENSE_PAID',
  'SETTLEMENT_PAID',
  'SETTLEMENT_RECEIVED',
] as const

export type MovementKind = (typeof MOVEMENT_KINDS)[number]

export type Movement = {
  id: string
  kind: MovementKind
  at: string
  direction: 'IN' | 'OUT'
  amount: number
  title: string
  category?: string | null
  groupId?: string | null
  groupName?: string | null
  /** What of it was actually yours — group expenses only. */
  myShare?: number | null
  counterparty?: { id: string, name: string } | null
}

export type CashFlow = {
  total: number
  totals: { out: number, in: number, net: number }
  items: Movement[]
}

/** Money of yours currently sitting with other people. */
export type Outstanding = {
  total: number
  people: { userId: string, name: string, amount: number, groupId?: string | null, groupName?: string | null }[]
}

const num = (value: unknown, fallback = 0) =>
  (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

function toMovement(raw: unknown): Movement | null {
  const row = (raw ?? {}) as Partial<Movement>
  if (!row.id || !row.at) return null

  const amount = num(row.amount)
  return {
    id: String(row.id),
    kind: (MOVEMENT_KINDS as readonly string[]).includes(row.kind ?? '')
      ? row.kind as MovementKind
      : 'PERSONAL_EXPENSE',
    at: row.at,
    // direction is stated, but the kind implies it — trust the kind if they disagree
    direction: row.kind === 'SETTLEMENT_RECEIVED' ? 'IN' : row.direction === 'IN' ? 'IN' : 'OUT',
    amount,
    title: row.title || 'Untitled',
    category: row.category ?? null,
    groupId: row.groupId ?? null,
    groupName: row.groupName ?? null,
    myShare: typeof row.myShare === 'number' ? row.myShare : null,
    counterparty: row.counterparty ?? null,
  }
}

export type CashFlowFilters = { from?: string, to?: string, limit?: number, offset?: number }

export async function getCashFlow(filters: CashFlowFilters = {}): Promise<CashFlow> {
  const { data } = await api.get('/api/cashflow', { params: filters })
  const body = (data ?? {}) as Partial<CashFlow>
  const items = (Array.isArray(body.items) ? body.items : [])
    .map(toMovement)
    .filter((movement): movement is Movement => movement !== null)

  return {
    total: num(body.total, items.length),
    totals: {
      out: num(body.totals?.out),
      in: num(body.totals?.in),
      // computed server-side, but a missing field should not render as ₹NaN
      net: num(body.totals?.net, num(body.totals?.in) - num(body.totals?.out)),
    },
    items,
  }
}

/** The whole window, walked page by page — the ledger shows all of it. */
const PAGE = 200
const CAP = 2000

export async function getAllCashFlow(filters: Omit<CashFlowFilters, 'limit' | 'offset'> = {}) {
  const first = await getCashFlow({ ...filters, limit: PAGE, offset: 0 })
  const items = [...first.items]

  while (items.length < Math.min(first.total, CAP)) {
    const page = await getCashFlow({ ...filters, limit: PAGE, offset: items.length })
    if (page.items.length === 0) break
    items.push(...page.items)
  }

  return { ...first, items, truncated: first.total > items.length }
}

export async function getOutstanding(): Promise<Outstanding> {
  const { data } = await api.get('/api/cashflow/outstanding')
  const body = (data ?? {}) as Partial<Outstanding>
  const people = Array.isArray(body.people) ? body.people : []
  return {
    total: num(body.total, people.reduce((sum, person) => sum + num(person.amount), 0)),
    people: people.map((person) => ({
      userId: String(person.userId ?? ''),
      name: person.name || 'Someone',
      amount: num(person.amount),
      groupId: person.groupId ?? null,
      groupName: person.groupName ?? null,
    })),
  }
}
