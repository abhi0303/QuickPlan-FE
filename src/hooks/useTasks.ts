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
export function useTasks(initialView?: TaskView) {
  const tasksVersion = useAppStore((state) => state.tasksVersion)
  const bumpTasksVersion = useAppStore((state) => state.bumpTasksVersion)

  const [view, setViewState] = useState<TaskView | undefined>(initialView)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    listTasks(view ? { view } : {})
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
  }, [view, tasksVersion, retryToken])

  function setView(next?: TaskView) {
    if (next === view) return
    setLoading(true)
    setError('')
    setViewState(next)
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

  return { view, setView, tasks, loading, error, busyId, retry, toggle, remove }
}
