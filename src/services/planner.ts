import { api } from './api'
import { sendOrQueue } from './offline/mutate'

/**
 * The budget planner: income in, commitments and an estimate out, and the
 * number left over.
 *
 * Every figure arrives computed — the cadence conversions, the three-month
 * averages, the savings rate, the suggestions. The client does no arithmetic on
 * purpose: two places working out "what you can save" will eventually disagree,
 * and the one on screen would be the wrong one. See docs/budget-planner.md §5.2.
 */

export type PlanItemSource = 'AVERAGE' | 'OVERRIDE' | 'BUDGET'

export type CommittedItem = {
  id: string
  recurringId?: string
  label: string
  category?: string | null
  cadence: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  /** Every `interval` × cadence; absent means 1. */
  interval?: number
  /** As entered on the schedule. */
  amount: number
  /** The same thing per month — the only figure the page adds up. */
  monthly: number
  included: boolean
  paused?: boolean
}

/** The expense that makes a category's average unrepresentative. */
export type Outlier = {
  expenseId: string
  title: string
  amount: number
  date: string
}

export type EstimatedItem = {
  id: string
  category: string
  monthly: number
  source: PlanItemSource
  included: boolean
  amountOverride: number | null
  /** What a typical month looks like, for "is this normal?". */
  median: number
  lastMonth: number
  outlier: Outlier | null
}

export type Suggestion = {
  id: string
  rule: string
  category: string
  /** What following it would be worth per month. */
  saves: number
  headline: string
  evidence: string
}

export type Plan = {
  monthlyIncome: number
  savingsTarget: number | null
  committed: { total: number, items: CommittedItem[] }
  estimated: {
    total: number
    /** Which months the averages came from — the page says so out loud. */
    basis: { months: number, from: string, to: string, complete: boolean } | null
    items: EstimatedItem[]
  }
  canSave: number
  savingsRate: number
  suggestions: Suggestion[]
}

const num = (value: unknown, fallback = 0) =>
  (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

function toPlan(raw: unknown): Plan | null {
  const body = (raw ?? {}) as Partial<Plan> & { data?: Partial<Plan> }
  const plan = (body.data ?? body) as Partial<Plan>
  // no income means no plan yet, which the page treats as its one question
  if (typeof plan.monthlyIncome !== 'number') return null

  const committed = plan.committed ?? { total: 0, items: [] }
  const estimated = plan.estimated ?? { total: 0, basis: null, items: [] }

  return {
    monthlyIncome: num(plan.monthlyIncome),
    savingsTarget: typeof plan.savingsTarget === 'number' ? plan.savingsTarget : null,
    committed: {
      total: num(committed.total),
      items: Array.isArray(committed.items) ? committed.items : [],
    },
    estimated: {
      total: num(estimated.total),
      basis: estimated.basis ?? null,
      items: Array.isArray(estimated.items) ? estimated.items : [],
    },
    canSave: num(plan.canSave),
    savingsRate: num(plan.savingsRate),
    suggestions: Array.isArray(plan.suggestions) ? plan.suggestions : [],
  }
}

/** Null when no income has been set — the page has nothing to compute yet. */
export async function getPlan(): Promise<Plan | null> {
  const { data } = await api.get('/api/planner')
  return toPlan(data)
}

export async function setIncome(monthlyIncome: number, savingsTarget?: number | null): Promise<Plan | null> {
  const { data } = await api.put('/api/planner', {
    monthlyIncome,
    ...(savingsTarget !== undefined && savingsTarget !== null ? { savingsTarget } : {}),
  })
  return toPlan(data)
}

/**
 * Switching a line off, or replacing its estimate.
 *
 * Queued like every other write, so the planner keeps working with no
 * connection — which is most of the point of a page you open to think.
 */
export async function updatePlanItem(
  id: string,
  patch: { included?: boolean, amountOverride?: number | null },
): Promise<void> {
  await sendOrQueue<unknown>({
    entity: 'plan',
    method: 'PATCH',
    url: `/api/planner/items/${id}`,
    body: patch,
    send: async () => (await api.patch(`/api/planner/items/${id}`, patch)).data,
  })
}

/** Re-reads the estimates from history rather than waiting for the next period. */
export async function recalculatePlan(): Promise<Plan | null> {
  const { data } = await api.post('/api/planner/recalculate')
  return toPlan(data)
}

export async function archivePlan(): Promise<void> {
  await api.delete('/api/planner')
}
