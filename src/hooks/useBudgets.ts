import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getApiErrorMessage } from '../services/api'
import { archiveBudget, createBudget, getBudgetStatus, listBudgets, updateBudget } from '../services/budgets'
import type { Budget, BudgetScope, BudgetStatusReport, CreateBudgetPayload } from '../services/budgets'
import { useAppStore } from '../store/useAppStore'

/**
 * The budgets themselves and how they are doing, loaded together.
 *
 * Two requests rather than one because they answer different questions: the
 * list is what you set, the status is where you stand. Editing needs the first
 * and every ring needs the second.
 */
export function useBudgets() {
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [status, setStatus] = useState<BudgetStatusReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [version, setVersion] = useState(0)
  // recording an expense moves every ring it belongs to
  const expensesVersion = useAppStore((state) => state.expensesVersion)

  useEffect(() => {
    let cancelled = false

    Promise.all([listBudgets(), getBudgetStatus()])
      .then(([list, report]) => {
        if (cancelled) return
        setBudgets(list)
        setStatus(report)
        setError('')
      })
      .catch((fetchError) => {
        if (!cancelled) setError(getApiErrorMessage(fetchError, 'Could not load your budgets.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [version, expensesVersion])

  const reload = useCallback(() => setVersion((token) => token + 1), [])

  function retry() {
    setLoading(true)
    setError('')
    reload()
  }

  async function create(payload: CreateBudgetPayload) {
    await createBudget(payload)
    reload()
    toast.success('Budget set')
  }

  async function edit(id: string, patch: { amount?: number, scope?: BudgetScope }) {
    setBusyId(id)
    try {
      await updateBudget(id, patch)
      reload()
      toast.success('Budget updated')
    } finally {
      setBusyId('')
    }
  }

  async function archive(budget: Budget) {
    setBusyId(budget.id)
    try {
      await archiveBudget(budget.id)
      reload()
      // "removed" would be a lie: past periods keep the limit that was in force
      toast.success('Budget archived')
    } catch (archiveError) {
      toast.error(getApiErrorMessage(archiveError, 'Could not archive that budget.'))
    } finally {
      setBusyId('')
    }
  }

  return { budgets, status, loading, error, busyId, retry, reload, create, edit, archive }
}
