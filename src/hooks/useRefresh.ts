import { useCallback, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { flushQueue } from '../services/offline/queue'
import { useAppStore } from '../store/useAppStore'

/**
 * The refresh an installed app has no other way to reach.
 *
 * In a browser there is a reload button. In a PWA on a phone there is nothing,
 * so a stale screen means force-quitting the app and opening it again — which
 * is what people actually do.
 *
 * Two different staleness problems, and this handles both:
 *
 * 1. **Old data.** Every list refetches. No reload, so scroll position, open
 *    dialogs and anything half-typed survive.
 * 2. **Old app.** The service worker caches the shell, so a phone can sit on a
 *    build from last week. If an update is waiting, it is taken and the page
 *    reloads — the only case where a reload is the right answer.
 *
 * Anything queued offline is flushed first, so a refresh cannot show server
 * state that is about to be overwritten by a write still sitting in the outbox.
 */

/** A slow network must not leave the button spinning for ever. */
const UPDATE_TIMEOUT = 4000

const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))])

export function useRefresh() {
  const [refreshing, setRefreshing] = useState(false)
  const refreshAll = useAppStore((state) => state.refreshAll)
  /** Guards against a second press while the first is still running. */
  const running = useRef(false)

  const refresh = useCallback(async () => {
    if (running.current) return
    running.current = true
    setRefreshing(true)

    try {
      // anything waiting in the outbox goes first, or the refetch below would
      // show server state that is about to change
      await withTimeout(flushQueue(), UPDATE_TIMEOUT)

      const registration = 'serviceWorker' in navigator
        ? await withTimeout(navigator.serviceWorker.getRegistration(), UPDATE_TIMEOUT)
        : null

      if (registration) {
        await withTimeout(registration.update(), UPDATE_TIMEOUT)

        if (registration.waiting) {
          toast.success('New version — restarting')
          // the page reloads once the new worker takes over
          navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
          registration.waiting.postMessage('SKIP_WAITING')
          return
        }
      }

      refreshAll()
      toast.success('Up to date')
    } catch {
      // a failed update check is not worth an error: the refetch still ran
      refreshAll()
    } finally {
      running.current = false
      setRefreshing(false)
    }
  }, [refreshAll])

  return { refresh, refreshing }
}
