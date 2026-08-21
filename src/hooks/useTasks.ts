import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getApiErrorMessage } from '../services/api'
import { deleteTask, listTasks, setTaskCompleted } from '../services/tasks'
import type { Task, TaskView } from '../services/tasks'
import { useAppStore } from '../store/useAppStore'

/**
 * Shared task loading + mutation logic.
 *
 * `view` lives inside the hook so switching filters can flip `loading` from an
 * event handler; setting it inside the fetch effect would mean updating state
 * before the first await.
 */
export type TaskFilters = {
  view?: TaskView
  category?: string
  priority?: string
}

export function useTasks(initialView?: TaskView) {
  const tasksVersion = useAppStore((state) => state.tasksVersion)
  const bumpTasksVersion = useAppStore((state) => state.bumpTasksVersion)

  // All three are real query params on GET /api/tasks, so filtering happens
  // server-side rather than on the page.
  const [filters, setFiltersState] = useState<TaskFilters>({ view: initialView })
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    listTasks(filters)
      .then((data) => {
        if (cancelled) return
        setTasks(data)
        setError('')
      })
      .catch((fetchError) => {
        if (!cancelled) setError(getApiErrorMessage(fetchError, 'Could not load your tasks.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [filters, tasksVersion, retryToken])

  /** Loading is flipped here, in the event handler, not inside the fetch effect. */
  function setFilter<K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) {
    if (filters[key] === value) return
    setLoading(true)
    setError('')
    setFiltersState((current) => ({ ...current, [key]: value }))
  }

  function setView(next?: TaskView) {
    setFilter('view', next)
  }

  function retry() {
    setLoading(true)
    setError('')
    setRetryToken((token) => token + 1)
  }

  async function toggle(task: Task) {
    setBusyId(task.id)
    try {
      await setTaskCompleted(task.id, !task.isCompleted)
      bumpTasksVersion()
    } catch (toggleError) {
      toast.error(getApiErrorMessage(toggleError, 'Could not update that task.'))
    } finally {
      setBusyId('')
    }
  }

  async function remove(task: Task) {
    setBusyId(task.id)
    try {
      await deleteTask(task.id)
      bumpTasksVersion()
      toast.success('Task deleted')
    } catch (deleteError) {
      toast.error(getApiErrorMessage(deleteError, 'Could not delete that task.'))
    } finally {
      setBusyId('')
    }
  }

  return { filters, view: filters.view, setView, setFilter, tasks, loading, error, busyId, retry, toggle, remove }
}
