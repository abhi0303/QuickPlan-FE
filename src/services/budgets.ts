import { api } from './api'

/**
 * Budgets — what you meant to spend, against what you have.
 *
 * The arithmetic is deliberately all server-side. `spent`, `remaining`,
 * `projected` and the status thresholds arrive computed, so the client cannot
 * quietly disagree with the notification that fires off the same numbers. This
 * module normalises the envelope and does nothing else to it.
 */

export const BUDGET_PERIODS = ['MONTHLY', 'WEEKLY'] as const
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number]

export const BUDGET_SCOPES = ['PERSONAL', 'ALL'] as const
export type BudgetScope = (typeof BUDGET_SCOPES)[number]

/** ON_TRACK under 80%, WARNING to 100%, EXCEEDED beyond. Decided server-side. */
export type BudgetStatus = 'ON_TRACK' | 'WARNING' | 'EXCEEDED'

export type Budget = {
  id: string
  /** Null is the overall budget covering everything, not a special row type. */
  category: string | null
  amount: number
  period: BudgetPeriod
  scope: BudgetScope
  startsOn?: string
  archivedAt?: string | null
}

export type BudgetLine = {
  budgetId: string
  category: string | null
  amount: number
  spent: number
  remaining: number
  percentage: number
  /** Spend to date extrapolated over the whole period. */
  projected: number
  status: BudgetStatus
}

export type BudgetStatusReport = {
  period: { key: string, from: string, to: string, daysElapsed: number, daysTotal: number }
  overall: BudgetLine | null
  categories: BudgetLine[]
  /** Real spending with no budget behind it — how you find the one you should set. */
  unbudgeted: { category: string, spent: number }[]
}

export type CreateBudgetPayload = {
  /** Omit for the overall budget. */
  category?: string
  amount: number
  period?: BudgetPeriod
  scope?: BudgetScope
  startsOn?: string
}

const num = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

function toLine(raw: unknown): BudgetLine {
  const row = (raw ?? {}) as Partial<BudgetLine>
  const amount = num(row.amount)
  const spent = num(row.spent)
  return {
    budgetId: String(row.budgetId ?? ''),
    category: row.category ?? null,
    amount,
    spent,
    // computed server-side, but a missing field should not render as ₹NaN
    remaining: num(row.remaining, amount - spent),
    percentage: num(row.percentage, amount > 0 ? (spent / amount) * 100 : 0),
    projected: num(row.projected, spent),
    status: row.status ?? 'ON_TRACK',
  }
}

export async function listBudgets(): Promise<Budget[]> {
  const { data } = await api.get('/api/budgets')
  const rows = Array.isArray(data) ? data : (data as { items?: unknown[] })?.items ?? []
  return (rows as Budget[]).filter((row) => !row.archivedAt)
}

/**
 * Everything the rings draw, for one period.
 *
 * `period` is a key like "2026-08"; omitting it asks for the current one.
 */
export async function getBudgetStatus(period?: string, periodType: BudgetPeriod = 'MONTHLY'): Promise<BudgetStatusReport> {
  const { data } = await api.get('/api/budgets/status', { params: { period, periodType } })
  const body = (data ?? {}) as Partial<BudgetStatusReport>
  return {
    period: {
      key: body.period?.key ?? period ?? '',
      from: body.period?.from ?? '',
      to: body.period?.to ?? '',
      daysElapsed: num(body.period?.daysElapsed),
      daysTotal: num(body.period?.daysTotal),
    },
    overall: body.overall ? toLine(body.overall) : null,
    categories: Array.isArray(body.categories) ? body.categories.map(toLine) : [],
    unbudgeted: Array.isArray(body.unbudgeted)
      ? body.unbudgeted.map((row) => ({ category: String(row.category ?? ''), spent: num(row.spent) }))
      : [],
  }
}

/**
 * What this category cost last period.
 *
 * Nobody knows what their food budget should be; everybody recognises last
 * month's number. The response shape is not published, so several plausible
 * keys are accepted rather than assuming one.
 */
export async function suggestBudget(
  category?: string,
  period: BudgetPeriod = 'MONTHLY',
  scope: BudgetScope = 'PERSONAL',
): Promise<number | null> {
  const { data } = await api.get('/api/budgets/suggest', { params: { category, period, scope } })
  const body = (data ?? {}) as Record<string, unknown> & { data?: Record<string, unknown> }
  const nested = (body.data ?? body) as Record<string, unknown>
  for (const key of ['suggested', 'amount', 'spent', 'lastPeriodSpent', 'total']) {
    const value = nested[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

export async function createBudget(payload: CreateBudgetPayload): Promise<Budget> {
  const { data } = await api.post('/api/budgets', payload)
  return data as Budget
}

export async function updateBudget(id: string, patch: { amount?: number, scope?: BudgetScope }): Promise<Budget> {
  const { data } = await api.patch(`/api/budgets/${id}`, patch)
  return data as Budget
}

/** Archives rather than deletes: past periods keep the limit that was in force. */
export async function archiveBudget(id: string): Promise<void> {
  await api.delete(`/api/budgets/${id}`)
}
