import { useCallback, useEffect, useRef, useState } from 'react'
import { getApiErrorMessage } from '../services/api'
import {
  dismissNotification,
  getUnreadCount,
  listNotifications,
  markNotificationsRead,
} from '../services/notifications'
import type { AppNotification } from '../services/notifications'
import { useAppStore } from '../store/useAppStore'

const PAGE_SIZE = 20
/**
 * A tab switch fires both `focus` and `visibilitychange`, and a quick flick
 * between windows should not cost two requests either — so a refresh inside
 * this window is skipped.
 */
const MIN_GAP_MS = 20_000

/**
 * The notification feed behind the bell.
 *
 * Nothing polls. The badge refreshes when the app opens, when the window comes
 * back to the foreground, when the service worker reports a push, and when the
 * panel itself is opened — a tab left sitting there costs nothing. Push is what
 * makes this immediate; without it the count catches up on the next focus.
 */
export function useNotifications() {
  const session = useAppStore((state) => state.session)
  const signedIn = Boolean(session)

  const [items, setItems] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  /** When the count was last asked for, so repeat triggers can be ignored. */
  const lastCountAt = useRef(0)

  const refreshCount = useCallback((force = false) => {
    if (!signedIn) return
    const now = performance.now()
    if (!force && now - lastCountAt.current < MIN_GAP_MS) return
    lastCountAt.current = now
    getUnreadCount().then(setUnreadCount).catch(() => { /* the badge is not worth a toast */ })
  }, [signedIn])

  const refresh = useCallback(async () => {
    if (!signedIn) return
    setLoading(true)
    try {
      const page = await listNotifications({ limit: PAGE_SIZE })
      // the list carries the total, so opening the panel is also a count refresh
      lastCountAt.current = performance.now()
      setItems(page.items)
      setCursor(page.nextCursor)
      setUnreadCount(page.unreadCount)
      setError('')
    } catch (fetchError) {
      setError(getApiErrorMessage(fetchError, 'Could not load your notifications.'))
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [signedIn])

  async function loadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await listNotifications({ limit: PAGE_SIZE, cursor })
      setItems((current) => [...current, ...page.items])
      setCursor(page.nextCursor)
      setUnreadCount(page.unreadCount)
    } catch (fetchError) {
      setError(getApiErrorMessage(fetchError, 'Could not load more.'))
    } finally {
      setLoadingMore(false)
    }
  }

  /** Marks read locally first — the badge should not lag behind the tap. */
  async function markRead(ids: string[]) {
    const unread = ids.filter((id) => !items.find((item) => item.id === id)?.readAt)
    if (unread.length === 0) return
    const stamp = new Date().toISOString()
    setItems((current) => current.map((item) => (unread.includes(item.id) ? { ...item, readAt: stamp } : item)))
    setUnreadCount((current) => Math.max(0, current - unread.length))
    try {
      setUnreadCount(await markNotificationsRead({ ids: unread }))
    } catch {
      refreshCount()
    }
  }

  async function markAllRead() {
    if (unreadCount === 0) return
    const stamp = new Date().toISOString()
    setItems((current) => current.map((item) => (item.readAt ? item : { ...item, readAt: stamp })))
    setUnreadCount(0)
    try {
      setUnreadCount(await markNotificationsRead({ all: true }))
    } catch {
      refreshCount()
    }
  }

  async function dismiss(id: string) {
    const removed = items.find((item) => item.id === id)
    setItems((current) => current.filter((item) => item.id !== id))
    if (removed && !removed.readAt) setUnreadCount((current) => Math.max(0, current - 1))
    try {
      setUnreadCount(await dismissNotification(id))
    } catch {
      refresh()
    }
  }

  // badge upkeep: on sign-in, on returning to the app, and when a push lands
  useEffect(() => {
    if (!signedIn) return

    refreshCount(true)

    function onFocus() {
      if (document.visibilityState === 'visible') refreshCount()
    }
    function onServiceWorkerMessage(event: MessageEvent) {
      // a push means something definitely changed, so this one is not throttled
      if (event.data?.type === 'PUSH_RECEIVED') refreshCount(true)
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage)

    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
      navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage)
    }
  }, [signedIn, refreshCount])

  // signing out empties the feed by derivation rather than by clearing state in
  // an effect, so a stale count can never flash on the next account
  return {
    items: signedIn ? items : [],
    unreadCount: signedIn ? unreadCount : 0,
    loaded: signedIn && loaded,
    loading, loadingMore, error,
    hasMore: signedIn && cursor !== null,
    refresh, refreshCount, loadMore, markRead, markAllRead, dismiss,
  }
}
