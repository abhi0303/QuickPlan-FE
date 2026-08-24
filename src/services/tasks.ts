import { api } from './api'
import type { CreatedVia } from './createdVia'

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
export const TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED'] as const

export type TaskPriority = (typeof TASK_PRIORITIES)[number]
export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskView = 'today' | 'upcoming' | 'overdue' | 'completed'

/** Mirrors CreateTaskDto in the API spec. */
export type CreateTaskPayload = {
  title: string
  /** Omitted means MANUAL on the server. */
  createdVia?: CreatedVia
  notes?: string
  status?: TaskStatus
  priority?: TaskPriority
  category?: string
  dueDate?: string
  isCompleted?: boolean
}

export type Task = {
  id: string
  title: string
  notes?: string
  status: TaskStatus
  priority: TaskPriority
  category?: string
  dueDate?: string
  isCompleted: boolean
  /**
   * When the task was finished. The API publishes no schemas, so this may be
   * absent entirely — anything derived from it has to cope with that.
   */
  completedAt?: string
  updatedAt?: string
  createdAt?: string
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asOneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/**
 * The API documents no response schemas (28/28 operations), so responses are
 * normalized defensively rather than trusted. Once the backend publishes a Task
 * schema this can collapse into a plain cast.
 */
function normalizeTask(raw: unknown): Task | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>

  const id = asString(source.id) ?? asString(source._id) ?? asString(source.taskId)
  const title = asString(source.title) ?? asString(source.name)
  if (!id || !title) return null

  const status = asOneOf(source.status, TASK_STATUSES, 'PENDING')
  const isCompleted = typeof source.isCompleted === 'boolean' ? source.isCompleted : status === 'COMPLETED'

  return {
    id,
    title,
    notes: asString(source.notes),
    status,
    priority: asOneOf(source.priority, TASK_PRIORITIES, 'MEDIUM'),
    category: asString(source.category),
    dueDate: asString(source.dueDate) ?? asString(source.dueAt),
    isCompleted,
    completedAt: asString(source.completedAt) ?? asString(source.completed_at),
    updatedAt: asString(source.updatedAt) ?? asString(source.updated_at),
    createdAt: asString(source.createdAt) ?? asString(source.created_at),
  }
}

/** Accepts a bare array, or a wrapper such as { data: [...] } / { tasks: [...] }. */
function normalizeTaskList(payload: unknown): Task[] {
  const candidates = [payload, (payload as { data?: unknown })?.data, (payload as { tasks?: unknown })?.tasks, (payload as { items?: unknown })?.items]
  const list = candidates.find(Array.isArray) as unknown[] | undefined
  return (list ?? []).map(normalizeTask).filter((task): task is Task => task !== null)
}

function normalizeSingle(payload: unknown): Task | null {
  return normalizeTask(payload) ?? normalizeTask((payload as { data?: unknown })?.data) ?? normalizeTask((payload as { task?: unknown })?.task)
}

export async function listTasks(params: { view?: TaskView; category?: string; priority?: string } = {}): Promise<Task[]> {
  const { data } = await api.get('/api/tasks', { params })
  return normalizeTaskList(data)
}

export async function createTask(payload: CreateTaskPayload): Promise<Task | null> {
  const { data } = await api.post('/api/tasks', payload)
  return normalizeSingle(data)
}

/**
 * Partial update. UpdateTaskDto is a PartialType of CreateTaskDto and the spec
 * documents no properties, so only fields the form actually changed are sent.
 */
export async function updateTask(id: string, patch: Partial<CreateTaskPayload>): Promise<Task | null> {
  const { data } = await api.patch(`/api/tasks/${id}`, patch)
  return normalizeSingle(data)
}

export async function setTaskCompleted(id: string, isCompleted: boolean): Promise<Task | null> {
  const { data } = await api.patch(`/api/tasks/${id}`, {
    isCompleted,
    status: isCompleted ? 'COMPLETED' : 'PENDING',
  })
  return normalizeSingle(data)
}

export async function deleteTask(id: string): Promise<void> {
  await api.delete(`/api/tasks/${id}`)
}
