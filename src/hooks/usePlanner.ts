import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getApiErrorMessage } from '../services/api'
import { getPlan, recalculatePlan, setIncome, updatePlanItem } from '../services/planner'
import type { Plan } from '../services/planner'
import { useAppStore } from '../store/useAppStore'

/**
 * The plan, and the switches that change it.
 *
 * Toggling a line applies to the local copy first and reconciles with the
 * server afterwards. The server owns the arithmetic, but waiting a round trip
 * to see a switch move makes the page feel broken — so the headline is
 * recomputed from the numbers already on screen, then replaced by the real one.
 */
export function usePlanner() {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [saving, setSaving] = useState(false)
  const [version, setVersion] = useState(0)
  // a new expense or schedule changes what the estimates are built from
  const expensesVersion = useAppStore((state) => state.expensesVersion)

  useEffect(() => {
    let cancelled = false

    getPlan()
      .then((next) => {
        if (cancelled) return
        setPlan(next)
        setError('')
      })
      .catch((fetchError) => {
        if (!cancelled) setError(getApiErrorMessage(fetchError, 'Could not load your plan.'))
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

  async function saveIncome(monthlyIncome: number, savingsTarget?: number | null) {
    setSaving(true)
    try {
      const next = await setIncome(monthlyIncome, savingsTarget)
      if (next) setPlan(next)
      else reload()
      toast.success('Income saved')
    } catch (saveError) {
      toast.error(getApiErrorMessage(saveError, 'Could not save that.'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Applies the change locally so the headline moves at once, then asks the
   * server for the authoritative figures. On failure the reload puts the real
   * state back — there is no separate rollback to get wrong.
   */
  async function patchItem(id: string, patch: { included?: boolean, amountOverride?: number | null }) {
    setBusyId(id)
    setPlan((current) => (current ? applyLocally(current, id, patch) : current))
    try {
      await updatePlanItem(id, patch)
    } catch (patchError) {
      toast.error(getApiErrorMessage(patchError, 'Could not change that line.'))
    } finally {
      setBusyId('')
      reload()
    }
  }

  async function recalculate() {
    setSaving(true)
    try {
      const next = await recalculatePlan()
      if (next) setPlan(next)
      else reload()
      toast.success('Estimates refreshed')
    } catch (recalcError) {
      toast.error(getApiErrorMessage(recalcError, 'Could not refresh the estimates.'))
    } finally {
      setSaving(false)
    }
  }

  return { plan, loading, error, busyId, saving, retry, reload, saveIncome, patchItem, recalculate }
}

/**
 * The same subtraction the server does, on the copy already in hand.
 *
 * Only ever a stand-in for the few hundred milliseconds before the real answer
 * arrives — see the reload in `patchItem`.
 */
function applyLocally(plan: Plan, id: string, patch: { included?: boolean, amountOverride?: number | null }): Plan {
  const apply = <T extends { id: string, included: boolean }>(item: T): T =>
    (item.id === id ? { ...item, ...patch } : item)

  const committed = { ...plan.committed, items: plan.committed.items.map(apply) }
  const estimated = { ...plan.estimated, items: plan.estimated.items.map(apply) }

  committed.total = committed.items
    .filter((item) => item.included && !item.paused)
    .reduce((sum, item) => sum + item.monthly, 0)

  estimated.total = estimated.items
    .filter((item) => item.included)
    .reduce((sum, item) => sum + (item.amountOverride ?? item.monthly), 0)

  const canSave = plan.monthlyIncome - committed.total - estimated.total
  return {
    ...plan,
    committed,
    estimated,
    canSave,
    savingsRate: plan.monthlyIncome > 0 ? (canSave / plan.monthlyIncome) * 100 : 0,
  }
}
