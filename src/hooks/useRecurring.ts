import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getApiErrorMessage } from '../services/api'
import {
  createRecurring, deleteRecurring, listRecurring, runNow, skipNext, updateRecurring,
} from '../services/recurring'
import type { CreateRecurringPayload, Recurring } from '../services/recurring'
import { useAppStore } from '../store/useAppStore'

/** The schedules that post expenses on your behalf. */
export function useRecurring() {
  const [items, setItems] = useState<Recurring[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [version, setVersion] = useState(0)
  const bumpExpenses = useAppStore((state) => state.bumpExpensesVersion)

  useEffect(() => {
    let cancelled = false

    listRecurring()
      .then((rows) => {
        if (cancelled) return
        setItems(rows)
        setError('')
      })
      .catch((fetchError) => {
        if (!cancelled) setError(getApiErrorMessage(fetchError, 'Could not load your recurring expenses.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [version])

  const reload = useCallback(() => setVersion((token) => token + 1), [])

  function retry() {
    setLoading(true)
    setError('')
    reload()
  }

  async function create(payload: CreateRecurringPayload) {
    await createRecurring(payload)
    reload()
    toast.success('Scheduled')
  }

  /** One wrapper: every row action is "do the thing, reload, say what happened". */
  async function act(item: Recurring, run: () => Promise<unknown>, done: string, failed: string) {
    setBusyId(item.id)
    try {
      await run()
      reload()
      toast.success(done)
    } catch (actionError) {
      toast.error(getApiErrorMessage(actionError, failed))
    } finally {
      setBusyId('')
    }
  }

  const edit = (
    item: Recurring,
    patch: { title?: string, amount?: number, category?: string, endsOn?: string },
  ) => act(item, () => updateRecurring(item.id, patch), 'Schedule updated', 'Could not update that schedule.')

  const pause = (item: Recurring) => act(
    item,
    () => updateRecurring(item.id, { paused: !item.pausedAt }),
    item.pausedAt ? 'Resumed' : 'Paused',
    'Could not change that schedule.',
  )

  const skip = (item: Recurring) => act(
    item, () => skipNext(item.id), 'Skipped this one', 'Could not skip that run.',
  )

  const runItNow = (item: Recurring) => act(
    item,
    async () => { await runNow(item.id); bumpExpenses() },
    'Expense created',
    'Could not create that expense.',
  )

  const remove = (item: Recurring) => act(
    item,
    () => deleteRecurring(item.id),
    // the expenses it already created stay, so "stopped" not "deleted"
    'Schedule stopped',
    'Could not stop that schedule.',
  )

  return { items, loading, error, busyId, retry, reload, create, edit, pause, skip, runItNow, remove }
}
