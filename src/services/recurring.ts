import { api } from './api'

/**
 * Recurring expenses — rent, EMI, subscriptions.
 *
 * These post themselves. What arrives is an ordinary expense carrying
 * `createdVia: "SYSTEM"`, which keeps it out of the voice and manual mission
 * counts and earns it the "auto" chip in the list.
 */

export const CADENCES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const
export type Cadence = (typeof CADENCES)[number]

export const CADENCE_LABEL: Record<Cadence, string> = {
  DAILY: 'Every day',
  WEEKLY: 'Every week',
  MONTHLY: 'Every month',
  YEARLY: 'Every year',
}

const PLURAL: Record<Cadence, string> = {
  DAILY: 'days',
  WEEKLY: 'weeks',
  MONTHLY: 'months',
  YEARLY: 'years',
}

const EVERY_OTHER: Record<Cadence, string> = {
  DAILY: 'Every other day',
  WEEKLY: 'Every other week',
  MONTHLY: 'Every other month',
  YEARLY: 'Every other year',
}

/**
 * How often, in words.
 *
 * "Every other month" rather than "Every 2 months" for the commonest case,
 * because that is how people say it; anything longer counts.
 */
export function cadenceLabel(cadence: Cadence, interval?: number): string {
  const every = Math.max(1, Math.round(interval ?? 1))
  if (every === 1) return CADENCE_LABEL[cadence]
  if (every === 2) return EVERY_OTHER[cadence]
  return `Every ${every} ${PLURAL[cadence]}`
}

export type Recurring = {
  id: string
  /**
   * Every `interval` × cadence — 2 with MONTHLY is every other month.
   *
   * Absent until the API grows it; everything here reads it as 1, which is
   * what every existing schedule means.
   */
  interval?: number
  scope: 'PERSONAL' | 'GROUP'
  groupId?: string | null
  title: string
  amount: number
  category?: string | null
  cadence: Cadence
  /** MONTHLY only. Clamped to the last day in shorter months, server-side. */
  dayOfMonth?: number | null
  /** WEEKLY only. 0 is Sunday. */
  weekday?: number | null
  nextRunAt: string
  endsOn?: string | null
  /** Set while paused; the scheduler skips it. */
  pausedAt?: string | null
}

export type CreateRecurringPayload = {
  title: string
  amount: number
  cadence: Cadence
  /** Every `interval` × cadence. Needs the API change in docs/recurring-interval.md. */
  interval?: number
  category?: string
  scope?: 'PERSONAL' | 'GROUP'
  groupId?: string
  dayOfMonth?: number
  weekday?: number
  startsOn?: string
  endsOn?: string
}

/** Soonest first — the list is really "what is about to come out of my account". */
export function byNextRun(a: Recurring, b: Recurring) {
  const paused = Number(Boolean(a.pausedAt)) - Number(Boolean(b.pausedAt))
  if (paused !== 0) return paused
  const left = new Date(a.nextRunAt).getTime()
  const right = new Date(b.nextRunAt).getTime()
  if (Number.isNaN(left) || Number.isNaN(right) || left === right) return a.title.localeCompare(b.title)
  return left - right
}

export async function listRecurring(): Promise<Recurring[]> {
  const { data } = await api.get('/api/recurring')
  const rows = Array.isArray(data) ? data : (data as { items?: unknown[] })?.items ?? []
  return (rows as Recurring[]).sort(byNextRun)
}

export async function createRecurring(payload: CreateRecurringPayload): Promise<Recurring> {
  const { data } = await api.post('/api/recurring', payload)
  return data as Recurring
}

export async function updateRecurring(
  id: string,
  patch: { title?: string, amount?: number, category?: string, paused?: boolean, endsOn?: string },
): Promise<Recurring> {
  const { data } = await api.patch(`/api/recurring/${id}`, patch)
  return data as Recurring
}

/** Stops the schedule. The expenses it already created stay where they are. */
export async function deleteRecurring(id: string): Promise<void> {
  await api.delete(`/api/recurring/${id}`)
}

/** Moves the next run on by one cadence and creates nothing. */
export async function skipNext(id: string): Promise<Recurring> {
  const { data } = await api.post(`/api/recurring/${id}/skip-next`)
  return data as Recurring
}

/** Creates this period's expense now rather than waiting for the scheduler. */
export async function runNow(id: string): Promise<void> {
  await api.post(`/api/recurring/${id}/run-now`)
}
