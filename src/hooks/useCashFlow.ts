import { useCallback, useEffect, useState } from 'react'
import { getApiErrorMessage } from '../services/api'
import { getAllCashFlow, getOutstanding } from '../services/cashflow'
import type { CashFlow, Movement, Outstanding } from '../services/cashflow'
import { useAppStore } from '../store/useAppStore'
import { useCachedList } from './useCachedList'

/**
 * Everything that moved money, and what of it is still out with other people.
 *
 * Cached and hydrated like the other lists: this is the ledger's own data now,
 * so it has to be there on a cold open rather than after a round trip.
 */
export function useCashFlow(enabled = true) {
  const [items, setItems] = useState<Movement[]>([])
  const [totals, setTotals] = useState<CashFlow['totals']>({ out: 0, in: 0, net: 0 })
  const [outstanding, setOutstanding] = useState<Outstanding | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const expensesVersion = useAppStore((state) => state.expensesVersion)
  const cache = useCachedList<Movement[]>('cashflow')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    cache.hydrate((cached) => {
      if (!cancelled) {
        setItems(cached)
        setLoading(false)
      }
    })

    // outstanding is small and always current; it is not worth caching
    Promise.all([getAllCashFlow(), getOutstanding().catch(() => null)])
      .then(([flow, owed]) => {
        if (cancelled) return
        setItems(flow.items)
        setTotals(flow.totals)
        setOutstanding(owed)
        cache.store(flow.items)
        setError('')
      })
      .catch((fetchError) => {
        if (!cancelled) setError(getApiErrorMessage(fetchError, 'Could not load your money movements.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
    // `cache` is keyed by user; re-running on its identity would loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, version, expensesVersion])

  const reload = useCallback(() => setVersion((token) => token + 1), [])

  return { items, totals, outstanding, loading, error, reload, staleAt: cache.staleAt }
}
