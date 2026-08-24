import { useEffect, useMemo, useState } from 'react'
import { differenceInCalendarDays, isWithinInterval, parseISO, startOfWeek, subWeeks } from 'date-fns'
import { getApiErrorMessage } from '../services/api'
import { listTasks } from '../services/tasks'
import type { Task } from '../services/tasks'
import { useAppStore } from '../store/useAppStore'

export type DashboardData = {
  completed: Task[]
  upcoming: Task[]
  overdue: Task[]
}

const EMPTY: DashboardData = { completed: [], upcoming: [], overdue: [] }

/** When a task was finished, from whichever field the API happens to send. */
function finishedAt(task: Task): Date | null {
  const raw = task.completedAt ?? task.updatedAt
  if (!raw) return null
  const parsed = parseISO(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * The dashboard's three server-side views, fetched together.
 *
 * Each one is a documented `view` on GET /api/tasks, so what counts as
 * upcoming or overdue stays the server's decision rather than being guessed at
 * from due dates on the client.
 */
export function useDashboard() {
  const tasksVersion = useAppStore((state) => state.tasksVersion)

  const [data, setData] = useState<DashboardData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      listTasks({ view: 'completed' }),
      listTasks({ view: 'upcoming' }),
      listTasks({ view: 'overdue' }),
    ])
      .then(([completed, upcoming, overdue]) => {
        if (cancelled) return
        setData({ completed, upcoming, overdue })
        setError('')
      })
      .catch((fetchError) => {
        if (!cancelled) setError(getApiErrorMessage(fetchError, 'Could not load your week.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [tasksVersion, retryToken])

  const stats = useMemo(() => {
    const stamped = data.completed
      .map(finishedAt)
      .filter((date): date is Date => date !== null)

    // Without a completion timestamp there is no way to say when something was
    // finished, so the week figures are withheld rather than invented.
    if (stamped.length === 0) {
      return {
        dated: false,
        doneThisWeek: data.completed.length,
        trend: null as number | null,
      }
    }

    const now = new Date()
    // a real calendar week, so "this week" on the card means what it says
    const weekStart = startOfWeek(now, { weekStartsOn: 1 })
    const prevStart = subWeeks(weekStart, 1)

    const inRange = (date: Date, start: Date, end: Date) => isWithinInterval(date, { start, end })
    const doneThisWeek = stamped.filter((date) => inRange(date, weekStart, now)).length
    const donePrevWeek = stamped.filter((date) => inRange(date, prevStart, weekStart)).length

    return {
      dated: true,
      doneThisWeek,
      trend: donePrevWeek > 0 ? Math.round(((doneThisWeek - donePrevWeek) / donePrevWeek) * 100) : null,
    }
  }, [data.completed])

  /** Days until the nearest overdue task slipped, for the insight line. */
  const oldestOverdueDays = useMemo(() => {
    const dates = data.overdue
      .map((task) => (task.dueDate ? parseISO(task.dueDate) : null))
      .filter((date): date is Date => date !== null && !Number.isNaN(date.getTime()))
    if (dates.length === 0) return null
    const oldest = dates.reduce((a, b) => (a < b ? a : b))
    return Math.max(0, differenceInCalendarDays(new Date(), oldest))
  }, [data.overdue])

  function retry() {
    setLoading(true)
    setError('')
    setRetryToken((token) => token + 1)
  }

  return { ...data, loading, error, retry, stats, oldestOverdueDays }
}
