import { api } from './api'

export const EXPENSE_DIRECTIONS = ['PAYABLE', 'RECEIVABLE'] as const
export type ExpenseDirection = (typeof EXPENSE_DIRECTIONS)[number]

/** Mirrors CreateIOUDto — used when a specific person is named. */
export type CreateIOUPayload = {
  personName: string
  amount: number
  direction: ExpenseDirection
  reason?: string
}

/** Mirrors SplitExpenseDto — used when the cost is shared, or kept to yourself. */
export type SplitExpensePayload = {
  title: string
  totalAmount: number
  participantsCount: number
  paidByMe?: boolean
  names?: string[]
}

export type Expense = {
  id: string
  title: string
  amount?: number
  direction?: ExpenseDirection
  personName?: string
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function normalizeExpense(raw: unknown): Expense | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  const id = asString(source.id) ?? asString(source._id)
  if (!id) return null
  return {
    id,
    title: asString(source.title) ?? asString(source.reason) ?? 'Expense',
    amount: typeof source.amount === 'number' ? source.amount
      : typeof source.totalAmount === 'number' ? source.totalAmount : undefined,
    direction: source.direction === 'PAYABLE' || source.direction === 'RECEIVABLE' ? source.direction : undefined,
    personName: asString(source.personName),
  }
}

export async function createIOU(payload: CreateIOUPayload): Promise<Expense | null> {
  const { data } = await api.post('/api/expenses/iou', payload)
  return normalizeExpense(data) ?? normalizeExpense((data as { data?: unknown })?.data)
}

export async function createSplitExpense(payload: SplitExpensePayload): Promise<Expense | null> {
  const { data } = await api.post('/api/expenses/split', payload)
  return normalizeExpense(data) ?? normalizeExpense((data as { data?: unknown })?.data)
}

export async function listExpenses(): Promise<Expense[]> {
  const { data } = await api.get('/api/expenses')
  const candidates = [data, (data as { data?: unknown })?.data, (data as { expenses?: unknown })?.expenses]
  const list = (candidates.find(Array.isArray) as unknown[]) ?? []
  return list.map(normalizeExpense).filter((item): item is Expense => item !== null)
}
