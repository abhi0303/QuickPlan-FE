import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getApiErrorMessage } from '../services/api'
import { deleteTask, listTasks, setTaskCompleted } from '../services/tasks'
import type { Task, TaskView } from '../services/tasks'
import { useAppStore } from '../store/useAppStore'
import { useCachedList } from './useCachedList'
import { pendingCreates } from '../services/offline/queue'

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
  const celebrate = useAppStore((state) => state.celebrate)

  // All three are real query params on GET /api/tasks, so filtering happens
  // server-side rather than on the page.
  const [filters, setFiltersState] = useState<TaskFilters>({ view: initialView })
  const [tasks, setTasks] = useState<Task[]>([])
  const cache = useCachedList<Task[]>(`tasks:${initialView ?? 'all'}`)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    let cancelled = false

    // show what was here last time while the network is asked again
    cache.hydrate((cached) => {
      if (!cancelled) {
        setTasks(cached)
        setLoading(false)
      }
    })

    listTasks(filters)
      .then((data) => {
        if (cancelled) return
        setTasks(data)
        cache.store(data)
        setError('')
      })
      .catch((fetchError) => {
        if (!cancelled) setError(getApiErrorMessage(fetchError, 'Could not load your tasks.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
    // `cache` is keyed by view and user; re-running on its identity would loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const completing = !task.isCompleted
    // Decided here, from the click, rather than by watching the progress value.
    // Watching it would also fire on first load and when switching to the
    // Completed filter, neither of which the user just achieved.
    const clearsTheList =
      completing && tasks.length > 0 && tasks.every((item) => item.id === task.id || item.isCompleted)

    setBusyId(task.id)
    try {
      await setTaskCompleted(task.id, completing)
      bumpTasksVersion()
      if (clearsTheList) celebrate()
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

  /*
   * A task created without a connection exists only in the outbox until it
   * syncs. Merging it in means it does not vanish from the list the moment it
   * is typed — which is the whole point of queueing it.
   */
  const queued = pendingCreates('task')
    .map((row) => row.preview as unknown as Task | undefined)
    .filter((task): task is Task => Boolean(task?.id))
    .filter((task) => !tasks.some((existing) => existing.id === task.id))

  const merged = queued.length ? [...queued, ...tasks] : tasks

  return {
    filters,
    view: filters.view,
    setView,
    setFilter,
    tasks: merged,
    loading,
    error,
    busyId,
    retry,
    toggle,
    remove,
    /** When the shown list was read, if it came from the cache. */
    staleAt: cache.staleAt,
  }
}
