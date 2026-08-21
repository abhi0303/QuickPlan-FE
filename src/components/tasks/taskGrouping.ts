import { differenceInCalendarDays, isPast, parseISO } from 'date-fns'
import type { Task, TaskPriority } from '../../services/tasks'

export type Bucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none' | 'done'

export const BUCKET_LABELS: Record<Bucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This week',
  later: 'Later',
  none: 'No date',
  done: 'Completed',
}

/** Fixed display order — buckets with no tasks are skipped. */
export const BUCKET_ORDER: Bucket[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'none', 'done']

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

function dueDateOf(task: Task): Date | null {
  if (!task.dueDate) return null
  const parsed = parseISO(task.dueDate)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function bucketOf(task: Task, now: Date): Bucket {
  if (task.isCompleted) return 'done'

  const due = dueDateOf(task)
  if (!due) return 'none'

  const days = differenceInCalendarDays(due, now)
  if (days < 0 || (days === 0 && isPast(due))) return days < 0 ? 'overdue' : 'today'
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days <= 7) return 'week'
  return 'later'
}

export type SortKey = 'due' | 'priority' | 'title'

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'due', label: 'Due date' },
  { value: 'priority', label: 'Priority' },
  { value: 'title', label: 'A–Z' },
]

export function sortTasks(tasks: Task[], key: SortKey): Task[] {
  const sorted = [...tasks]
  sorted.sort((a, b) => {
    if (key === 'priority') {
      const delta = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]
      if (delta !== 0) return delta
    }
    if (key === 'title') return a.title.localeCompare(b.title)

    // default and tie-break: soonest first, undated last
    const aDue = dueDateOf(a)?.getTime() ?? Number.POSITIVE_INFINITY
    const bDue = dueDateOf(b)?.getTime() ?? Number.POSITIVE_INFINITY
    if (aDue !== bDue) return aDue - bDue
    return a.title.localeCompare(b.title)
  })
  return sorted
}

export function groupTasks(tasks: Task[], now: Date, sort: SortKey) {
  const groups = new Map<Bucket, Task[]>()
  for (const task of tasks) {
    const bucket = bucketOf(task, now)
    const list = groups.get(bucket)
    if (list) list.push(task)
    else groups.set(bucket, [task])
  }
  return BUCKET_ORDER
    .filter((bucket) => groups.has(bucket))
    .map((bucket) => ({ bucket, label: BUCKET_LABELS[bucket], tasks: sortTasks(groups.get(bucket) ?? [], sort) }))
}

/** Case-insensitive match across title, notes and category. */
export function searchTasks(tasks: Task[], query: string): Task[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return tasks
  return tasks.filter((task) =>
    [task.title, task.notes, task.category].some((field) => field?.toLowerCase().includes(needle)),
  )
}
