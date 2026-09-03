import { useEffect } from 'react'

/**
 * The tab bar's five destinations. Each page is its own chunk, so the first
 * tap on a tab pays for a network round trip — every time, since the service
 * worker is a pass-through and caches nothing. That is the wait people read as
 * the app being slow, and it is entirely avoidable: the chunks are small, and
 * by the time anyone taps a tab the browser has been idle for seconds.
 *
 * The imports are the same ones the router uses, so these resolve to the very
 * same chunks — this warms them rather than duplicating them.
 */
const TABS = [
  () => import('../pages/DashboardPage'),
  () => import('../pages/TasksPage'),
  () => import('../pages/RemindersPage'),
  () => import('../pages/MoneyPage'),
  () => import('../pages/FriendsPage'),
]

type Connection = { saveData?: boolean; effectiveType?: string }

/** Idle time if the browser offers it, a plain delay if it does not. */
function whenIdle(run: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(run, { timeout: 2500 })
    return () => cancelIdleCallback(handle)
  }
  const handle = setTimeout(run, 1200)
  return () => clearTimeout(handle)
}

/**
 * Fetches the tab chunks in the background so the first tap on each is
 * instant. One at a time and only while the browser is idle, so it never
 * competes with the request the page you are actually looking at is making.
 */
export function useRoutePrefetch() {
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: Connection }).connection
    // not on somebody's data plan, and not on a connection where these would
    // be queued ahead of the request that matters
    if (connection?.saveData) return
    if (connection?.effectiveType?.includes('2g')) return

    let cancelled = false
    let cancelPending = () => {}
    let next = 0

    function step() {
      if (cancelled || next >= TABS.length) return
      const load = TABS[next++]
      // a chunk that fails to arrive is not worth reporting: the route will
      // ask for it again itself, and show its own loading state then
      load().then(queue, queue)
    }

    function queue() {
      if (cancelled) return
      cancelPending = whenIdle(step)
    }

    cancelPending = whenIdle(step)
    return () => {
      cancelled = true
      cancelPending()
    }
  }, [])
}
