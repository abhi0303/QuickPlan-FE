import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getApiErrorMessage } from '../services/api'
import { byDateDesc, deleteExpense, listPersonalExpenses } from '../services/expenses'
import type { Expense, ExpenseFilters } from '../services/expenses'
import { pendingCreates } from '../services/offline/queue'
import { useAppStore } from '../store/useAppStore'
import { useCachedList } from './useCachedList'

/**
 * Your own ledger — the expenses that belong to nobody but you.
 *
 * Same shape as the group list on purpose: the rows are identical objects, so
 * the row component and the analytics both work on either without asking which
 * kind they were handed.
 */
export function usePersonalExpenses(filters: ExpenseFilters = {}) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [version, setVersion] = useState(0)
  // Quick Add can record an expense from any page, so the ledger listens for it
  const expensesVersion = useAppStore((state) => state.expensesVersion)
  const cache = useCachedList<Expense[]>('expenses:personal')

  // an inline object literal would be a new value every render
  const { from, to, category, limit } = filters
  const query = useCallback(
    (): ExpenseFilters => ({ from, to, category, limit }),
    [from, to, category, limit],
  )

  useEffect(() => {
    let cancelled = false

    cache.hydrate((cached) => {
      if (!cancelled) {
        setExpenses(cached)
        setLoading(false)
      }
    })

    listPersonalExpenses(query())
      .then((page) => {
        if (cancelled) return
        setExpenses(page.items)
        setTotal(page.total)
        cache.store(page.items)
        setError('')
      })
      .catch((fetchError) => {
        if (!cancelled) setError(getApiErrorMessage(fetchError, 'Could not load your expenses.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
    // `cache` is keyed by user; re-running on its identity would loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, version, expensesVersion])

  const reload = useCallback(() => setVersion((token) => token + 1), [])

  function retry() {
    setLoading(true)
    setError('')
    reload()
  }

  async function remove(expense: Expense) {
    setBusyId(expense.id)
    try {
      await deleteExpense(expense.id)
      reload()
      toast.success('Expense deleted')
    } catch (deleteError) {
      toast.error(getApiErrorMessage(deleteError, 'Could not delete that expense.'))
    } finally {
      setBusyId('')
    }
  }

  /*
   * An expense recorded without a connection lives in the outbox until it
   * syncs. Only the personal ones belong here — a queued group expense is
   * somebody else's list.
   */
  const queued = pendingCreates('expense')
    .map((row) => row.preview as unknown as Expense | undefined)
    .filter((expense): expense is Expense => Boolean(expense?.id) && expense?.scope === 'PERSONAL')
    .filter((expense) => !expenses.some((existing) => existing.id === expense.id))

  const merged = queued.length ? [...queued, ...expenses].sort(byDateDesc) : expenses
  const spent = merged.reduce((sum, expense) => sum + expense.totalAmount, 0)

  return {
    expenses: merged,
    total: total + queued.length,
    spent,
    loading,
    error,
    busyId,
    retry,
    reload,
    remove,
    staleAt: cache.staleAt,
  }
}
