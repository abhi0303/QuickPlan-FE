import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { flushQueue, queueSnapshot, startQueue, subscribeQueue } from '../services/offline/queue'
import type { QueuedMutation } from '../services/offline/queue'

/** Whether the browser thinks it has a connection. */
function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

const getOnline = () => navigator.onLine
const getOnlineServer = () => true

/**
 * Connection state and the outbox, for anything that needs to show either.
 *
 * `useSyncExternalStore` rather than an effect and some state: the queue is an
 * external store already, and this keeps every consumer showing the same thing
 * in the same render.
 */
export function useOffline() {
  const online = useSyncExternalStore(subscribeOnline, getOnline, getOnlineServer)
  const queued = useSyncExternalStore(subscribeQueue, queueSnapshot, () => [] as QueuedMutation[])

  useEffect(() => { startQueue() }, [])

  const flush = useCallback(() => { void flushQueue() }, [])

  const pending = queued.filter((row) => !row.failed)
  const failed = queued.filter((row) => row.failed)

  return { online, pending, failed, count: pending.length, flush }
}
