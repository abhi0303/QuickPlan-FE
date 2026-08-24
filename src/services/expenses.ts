import { api } from './api'

/**
 * Group expenses, balances and settlements.
 *
 * An expense is never "mine" — it belongs to a group, has one payer, and splits
 * into shares that always sum to the total. Who owes whom is derived from those
 * plus recorded settlements; a debt is never set directly.
 */

export const SPLIT_TYPES = ['EQUAL', 'EXACT', 'PERCENTAGE'] as const
export type SplitType = (typeof SPLIT_TYPES)[number]

export type ExpenseShare = {
  id: string
  userId: string
  name: string
  /** Render as given — see the rounding note below. */
  amount: number
}

export type Expense = {
  id: string
  groupId: string
  title: string
  description?: string | null
  totalAmount: number
  currency: string
  paidById: string
  createdById: string
  splitType: SplitType
  category?: string | null
  date: string
  paidBy?: { id: string; name: string; email: string }
  createdBy?: { id: string; name: string; email: string }
  shares: ExpenseShare[]
  /** The caller's own share, supplied by the API. */
  myShare?: number
  /** True when the caller fronted the money. */
  iPaid?: boolean
}

export type ExpenseListPage = {
  total: number
  limit: number
  offset: number
  items: Expense[]
}

export type CreateExpensePayload = {
  title: string
  totalAmount: number
  description?: string
  category?: string
  paidById?: string
  date?: string
  splitType?: SplitType
  /**
   * EQUAL: pass ids only to limit who it splits across (value ignored).
   * EXACT: values must sum to totalAmount. PERCENTAGE: must sum to 100.
   */
  shares?: { userId: string; value: number }[]
}

export type ExpenseFilters = {
  category?: string
  paidById?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

/**
 * Newest first, by when the expense happened rather than when it was typed in.
 *
 * The API documents no ordering, and a backdated expense should sit in its own
 * place in the timeline, so the order is settled here for every caller. Ties
 * fall back to the id, which keeps the order stable between renders.
 */
export function byDateDesc(a: Expense, b: Expense) {
  const left = new Date(a.date).getTime()
  const right = new Date(b.date).getTime()
  if (Number.isNaN(left) || Number.isNaN(right) || left === right) return b.id.localeCompare(a.id)
  return right - left
}

export async function listGroupExpenses(groupId: string, filters: ExpenseFilters = {}): Promise<ExpenseListPage> {
  const { data } = await api.get(`/api/groups/${groupId}/expenses`, { params: filters })
  const page = (data ?? {}) as Partial<ExpenseListPage>
  return {
    total: page.total ?? 0,
    limit: page.limit ?? 50,
    offset: page.offset ?? 0,
    items: (Array.isArray(page.items) ? page.items : []).sort(byDateDesc),
  }
}

/** Hard stop so a runaway group cannot spin the client forever. */
const ALL_PAGE_SIZE = 100
const ALL_CAP = 2000

/**
 * Every expense in a group, walked page by page.
 *
 * The analytics endpoints publish no response schema yet (see
 * docs/analytics-api.md), so the charts are computed from the raw list. Returns
 * `truncated` when the group is larger than the cap, and the page says so
 * rather than quietly charting a subset.
 */
export async function listAllGroupExpenses(
  groupId: string,
  filters: Omit<ExpenseFilters, 'limit' | 'offset'> = {},
): Promise<{ items: Expense[]; total: number; truncated: boolean }> {
  const first = await listGroupExpenses(groupId, { ...filters, limit: ALL_PAGE_SIZE, offset: 0 })
  const items = [...first.items]

  while (items.length < Math.min(first.total, ALL_CAP)) {
    const page = await listGroupExpenses(groupId, { ...filters, limit: ALL_PAGE_SIZE, offset: items.length })
    if (page.items.length === 0) break
    items.push(...page.items)
  }

  // each page arrived sorted; the concatenation of pages is not, so sort again
  return { items: items.sort(byDateDesc), total: first.total, truncated: first.total > items.length }
}

export async function createExpense(groupId: string, payload: CreateExpensePayload): Promise<Expense> {
  const { data } = await api.post(`/api/groups/${groupId}/expenses`, payload)
  return data as Expense
}

/** Detail is not nested under the group. */
export async function getExpense(id: string): Promise<Expense> {
  const { data } = await api.get(`/api/expenses/${id}`)
  return data as Expense
}

/** Changing amount, splitType or shares rebuilds every share server-side. */
export async function updateExpense(id: string, patch: Partial<CreateExpensePayload>): Promise<Expense> {
  const { data } = await api.patch(`/api/expenses/${id}`, patch)
  return data as Expense
}

export async function deleteExpense(id: string): Promise<void> {
  await api.delete(`/api/expenses/${id}`)
}

/* ------------------------------------------------------------- balances -- */

export type MemberBalance = {
  userId: string
  name: string
  role: string
  paid: number
  owed: number
  settlementsSent: number
  settlementsReceived: number
  /** Positive: owed to them. Negative: they owe. */
  net: number
}

export type SuggestedSettlement = {
  fromUserId: string
  fromName: string
  toUserId: string
  toName: string
  amount: number
}

export type GroupBalances = {
  members: MemberBalance[]
  /** The fewest payments that clear the group — each maps onto a settlement POST. */
  suggestedSettlements: SuggestedSettlement[]
  myNetBalance: number
}

export async function getGroupBalances(groupId: string): Promise<GroupBalances> {
  const { data } = await api.get(`/api/groups/${groupId}/balances`)
  const body = (data ?? {}) as Partial<GroupBalances>
  return {
    members: Array.isArray(body.members) ? body.members : [],
    suggestedSettlements: Array.isArray(body.suggestedSettlements) ? body.suggestedSettlements : [],
    myNetBalance: body.myNetBalance ?? 0,
  }
}

/* ---------------------------------------------------------- settlements -- */

export type Settlement = {
  id: string
  groupId: string
  fromUserId: string
  toUserId: string
  amount: number
  note?: string | null
  settledAt: string
  createdById: string
  from?: { id: string; name: string; email: string }
  to?: { id: string; name: string; email: string }
}

export type CreateSettlementPayload = {
  toUserId: string
  amount: number
  /** Defaults to the caller. */
  fromUserId?: string
  note?: string
  settledAt?: string
}

export async function listSettlements(groupId: string): Promise<Settlement[]> {
  const { data } = await api.get(`/api/groups/${groupId}/settlements`)
  return Array.isArray(data) ? data : []
}

/**
 * Records a payment rather than flipping a flag, so partial payments work and
 * the history survives. There is no "mark as settled" on an expense.
 */
export async function createSettlement(groupId: string, payload: CreateSettlementPayload): Promise<Settlement> {
  const { data } = await api.post(`/api/groups/${groupId}/settlements`, payload)
  return data as Settlement
}

export async function deleteSettlement(id: string): Promise<void> {
  await api.delete(`/api/settlements/${id}`)
}
