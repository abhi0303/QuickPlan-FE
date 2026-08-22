import { api } from './api'

export const NOTIFICATION_TYPES = [
  'FRIEND_ADDED',
  'GROUP_MEMBER_ADDED',
  'GROUP_MEMBER_REMOVED',
  'GROUP_ROLE_CHANGED',
  'GROUP_DELETED',
  'EXPENSE_ADDED',
  'EXPENSE_UPDATED',
  'EXPENSE_DELETED',
  'SETTLEMENT_RECORDED',
  'REMINDER_LEAD',
  'REMINDER_DUE',
  'TASK_DUE',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export type NotificationActor = {
  id: string
  name: string | null
}

/** Mirrors NotificationDto in swagger/api.json. */
export type AppNotification = {
  id: string
  type: NotificationType
  title: string
  body: string
  /** App path with no origin, e.g. "/groups/7c9e". */
  url: string
  actor: NotificationActor | null
  groupId?: string
  entityId?: string
  data: Record<string, unknown>
  readAt?: string
  createdAt: string
}

export type NotificationPage = {
  unreadCount: number
  items: AppNotification[]
  /** null on the last page. */
  nextCursor: string | null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * These are the first endpoints to publish response schemas, so this could be a
 * plain cast. It stays defensive about the two fields the UI cannot render
 * without — a row with no id or no timestamp is dropped rather than shown
 * blank — and about `type`, which will grow as the backend adds events.
 */
function normalizeNotification(raw: unknown): AppNotification | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>

  const id = asString(source.id)
  const createdAt = asString(source.createdAt)
  if (!id || !createdAt) return null

  const actorSource = source.actor as Record<string, unknown> | null | undefined
  const actorId = actorSource ? asString(actorSource.id) : undefined

  return {
    id,
    // an unknown type still renders: the server writes the copy, and the icon
    // falls back to a neutral one
    type: (asString(source.type) ?? 'FRIEND_ADDED') as NotificationType,
    title: asString(source.title) ?? 'Notification',
    body: asString(source.body) ?? '',
    url: asString(source.url) ?? '/',
    actor: actorId ? { id: actorId, name: asString(actorSource?.name) ?? null } : null,
    groupId: asString(source.groupId),
    entityId: asString(source.entityId),
    data: (source.data && typeof source.data === 'object' ? source.data : {}) as Record<string, unknown>,
    readAt: asString(source.readAt),
    createdAt,
  }
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export type ListParams = {
  limit?: number
  cursor?: string
  status?: 'all' | 'unread'
}

export async function listNotifications(params: ListParams = {}): Promise<NotificationPage> {
  const { data } = await api.get('/api/notifications', { params })
  const payload = (data ?? {}) as Record<string, unknown>
  const items = Array.isArray(payload.items) ? payload.items : []
  return {
    unreadCount: asCount(payload.unreadCount),
    items: items.map(normalizeNotification).filter((item): item is AppNotification => item !== null),
    nextCursor: asString(payload.nextCursor) ?? null,
  }
}

/** Returns the unread total left after the change. */
export async function markNotificationsRead(target: { ids: string[] } | { all: true }): Promise<number> {
  const { data } = await api.patch('/api/notifications/read', target)
  return asCount((data as Record<string, unknown>)?.unreadCount)
}

export async function getUnreadCount(): Promise<number> {
  const { data } = await api.get('/api/notifications/unread-count')
  return asCount((data as Record<string, unknown>)?.unreadCount)
}

export async function dismissNotification(id: string): Promise<number> {
  const { data } = await api.delete(`/api/notifications/${id}`)
  return asCount((data as Record<string, unknown>)?.unreadCount)
}
