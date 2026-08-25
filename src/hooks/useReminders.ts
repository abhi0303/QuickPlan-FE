import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getApiErrorMessage } from '../services/api'
import { deleteReminder, listReminders } from '../services/reminders'
import type { Reminder } from '../services/reminders'
import { useAppStore } from '../store/useAppStore'
import { useCachedList } from './useCachedList'
import { pendingCreates } from '../services/offline/queue'

/**
 * GET /api/reminders takes no query parameters, so the whole list is fetched
 * once and every filter is applied on the client.
 */
export function useReminders() {
  const tasksVersion = useAppStore((state) => state.tasksVersion)
  const bumpTasksVersion = useAppStore((state) => state.bumpTasksVersion)

  const [reminders, setReminders] = useState<Reminder[]>([])
  const cache = useCachedList<Reminder[]>('reminders')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    cache.hydrate((cached) => {
      if (!cancelled) {
        setReminders(cached)
        setLoading(false)
      }
    })

    listReminders()
      .then((data) => {
        if (cancelled) return
        setReminders(data)
        cache.store(data)
        setError('')
      })
      .catch((fetchError) => {
        if (!cancelled) setError(getApiErrorMessage(fetchError, 'Could not load your reminders.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasksVersion, retryToken])

  function retry() {
    setLoading(true)
    setError('')
    setRetryToken((token) => token + 1)
  }

  async function remove(reminder: Reminder) {
    setBusyId(reminder.id)
    try {
      await deleteReminder(reminder.id)
      bumpTasksVersion()
      toast.success('Reminder deleted')
    } catch (deleteError) {
      toast.error(getApiErrorMessage(deleteError, 'Could not delete that reminder.'))
    } finally {
      setBusyId('')
    }
  }

  // a reminder set without a connection still belongs on the list
  const queued = pendingCreates('reminder')
    .map((row) => row.preview as unknown as Reminder | undefined)
    .filter((reminder): reminder is Reminder => Boolean(reminder?.id))
    .filter((reminder) => !reminders.some((existing) => existing.id === reminder.id))

  return {
    reminders: queued.length ? [...queued, ...reminders] : reminders,
    loading,
    error,
    busyId,
    retry,
    remove,
    staleAt: cache.staleAt,
  }
}
