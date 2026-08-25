import { api } from './api'
import { sendOrQueue } from './offline/mutate'
import type { CreatedVia } from './createdVia'

export const RECURRENCE_RULES = ['DAILY', 'WEEKDAYS', 'WEEKLY', 'MONTHLY'] as const
export type RecurrenceRule = (typeof RECURRENCE_RULES)[number]

/** Mirrors CreateReminderDto in swagger/api.json. */
export type CreateReminderPayload = {
  title: string
  /** Omitted means MANUAL on the server. */
  createdVia?: CreatedVia
  dueAt: string
  taskId?: string
  offsetMinutes?: number
  recurrenceRule?: string
}

export type Reminder = {
  id: string
  title: string
  dueAt?: string
  offsetMinutes?: number
  recurrenceRule?: string
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** The spec documents no response bodies, so responses are normalized defensively. */
function normalizeReminder(raw: unknown): Reminder | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  const id = asString(source.id) ?? asString(source._id)
  const title = asString(source.title)
  if (!id || !title) return null
  return {
    id,
    title,
    dueAt: asString(source.dueAt) ?? asString(source.dueDate),
    offsetMinutes: typeof source.offsetMinutes === 'number' ? source.offsetMinutes : undefined,
    recurrenceRule: asString(source.recurrenceRule),
  }
}

function unwrapList(payload: unknown): unknown[] {
  const candidates = [payload, (payload as { data?: unknown })?.data, (payload as { reminders?: unknown })?.reminders]
  return (candidates.find(Array.isArray) as unknown[]) ?? []
}

export async function listReminders(): Promise<Reminder[]> {
  const { data } = await api.get('/api/reminders')
  return unwrapList(data).map(normalizeReminder).filter((item): item is Reminder => item !== null)
}

export async function createReminder(payload: CreateReminderPayload): Promise<Reminder | null> {
  const sent = await sendOrQueue<Reminder | null>({
    entity: 'reminder',
    method: 'POST',
    url: '/api/reminders',
    body: payload,
    optimistic: (tempId) => ({
      id: tempId,
      title: payload.title,
      dueAt: payload.dueAt,
      offsetMinutes: payload.offsetMinutes,
      recurrenceRule: payload.recurrenceRule,
    }),
    send: async () => {
      const { data } = await api.post('/api/reminders', payload)
      return normalizeReminder(data) ?? normalizeReminder((data as { data?: unknown })?.data)
    },
  })
  return sent.data
}

export async function deleteReminder(id: string): Promise<void> {
  await sendOrQueue<void>({
    entity: 'reminder',
    method: 'DELETE',
    url: `/api/reminders/${id}`,
    send: async () => { await api.delete(`/api/reminders/${id}`) },
  })
}

/** Mirrors UpdateReminderDto — a partial of the create payload. */
export type UpdateReminderPayload = Partial<CreateReminderPayload>

/**
 * Real in-place update. Replaces the earlier create-then-delete workaround,
 * which existed only because no PATCH endpoint was available; that changed the
 * reminder's id on every edit.
 */
export async function updateReminder(id: string, patch: UpdateReminderPayload): Promise<Reminder | null> {
  const { data } = await api.patch(`/api/reminders/${id}`, patch)
  return normalizeReminder(data) ?? normalizeReminder((data as { data?: unknown })?.data)
}
