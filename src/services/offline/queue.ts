import { api } from '../api'
import { idbAll, idbDelete, idbPut, QUEUE_STORE, storageAvailable } from './db'

/**
 * The outbox.
 *
 * Every write the app makes goes in here first and is sent from here, so a
 * mutation survives a dead connection, a killed tab and a reboot. The rules
 * that keep it honest:
 *
 * 1. **The queue decides whether something happened**, not React state.
 * 2. **Each row carries an idempotency key, generated once at enqueue.** A
 *    retry reuses it, so a request that succeeded while its response was lost
 *    cannot create a second row. This is the part that makes "exactly once"
 *    possible at all — see docs/offline-sync.md §4.1.
 * 3. **Order is preserved.** A create must land before the edit that follows
 *    it, so the queue is flushed oldest first and stops at the first failure.
 */

export type QueuedEntity = 'task' | 'reminder' | 'expense' | 'plan'

export type QueuedMutation = {
  /** Also the Idempotency-Key sent with the request. */
  id: string
  method: 'POST' | 'PATCH' | 'DELETE'
  url: string
  body?: unknown
  entity: QueuedEntity
  /** For a create: the placeholder id the UI is already showing. */
  tempId?: string
  /** What the UI renders while this is pending — a create only. */
  preview?: Record<string, unknown>
  attempts: number
  queuedAt: number
  /**
   * Position in line. `queuedAt` alone is not enough: two mutations made in the
   * same millisecond — a create and the edit right after it — would sort
   * arbitrarily, and the edit could be sent first.
   */
  seq: number
  lastError?: string
  /** Set when the server refused it outright; retrying will not help. */
  failed?: boolean
}

const TEMP_PREFIX = 'tmp_'
const BACKOFF_MS = [1_000, 5_000, 30_000, 120_000, 600_000]

export const isTempId = (id: string) => id.startsWith(TEMP_PREFIX)
export const newTempId = () => `${TEMP_PREFIX}${crypto.randomUUID()}`

/* ------------------------------------------------------------ listeners -- */

type Listener = () => void
const listeners = new Set<Listener>()

/** In-memory mirror so React can render the queue without awaiting IndexedDB. */
let snapshot: QueuedMutation[] = []
let loaded = false
/** Continues from whatever is already stored, so order survives a reload. */
let nextSeq = 0

export function subscribeQueue(listener: Listener) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function announce() {
  for (const listener of listeners) listener()
}

export function queueSnapshot(): QueuedMutation[] {
  return snapshot
}

function inOrder(a: QueuedMutation, b: QueuedMutation) {
  return a.seq - b.seq
}

async function refresh() {
  snapshot = (await idbAll<QueuedMutation>(QUEUE_STORE)).sort(inOrder)
  nextSeq = snapshot.reduce((highest, row) => Math.max(highest, row.seq + 1), nextSeq)
  loaded = true
  announce()
}

/** Everything queued for one entity — the UI merges these into its lists. */
export function pendingCreates(entity: QueuedEntity): QueuedMutation[] {
  return snapshot.filter((row) => row.entity === entity && row.method === 'POST' && !row.failed)
}

/* -------------------------------------------------------------- queueing -- */

export type EnqueueInput = Omit<QueuedMutation, 'id' | 'attempts' | 'queuedAt' | 'seq'>

export async function enqueue(input: EnqueueInput): Promise<QueuedMutation> {
  // a stored row may be ahead of this session's counter after a reload
  if (!loaded) await refresh()

  const row: QueuedMutation = {
    ...input,
    id: crypto.randomUUID(),
    attempts: 0,
    queuedAt: Date.now(),
    seq: nextSeq++,
  }
  await idbPut(QUEUE_STORE, row)
  await refresh()
  requestBackgroundSync()
  return row
}

/**
 * A create that has not landed has no server id, so anything queued against
 * its placeholder is rewritten once the real id arrives.
 */
async function adoptRealId(tempId: string, realId: string) {
  const affected = snapshot.filter((row) => row.url.includes(tempId) || JSON.stringify(row.body ?? '').includes(tempId))
  for (const row of affected) {
    await idbPut(QUEUE_STORE, {
      ...row,
      url: row.url.replaceAll(tempId, realId),
      body: row.body ? JSON.parse(JSON.stringify(row.body).replaceAll(tempId, realId)) : row.body,
    })
  }
  if (affected.length) await refresh()
}

/* --------------------------------------------------------------- sending -- */

let flushing = false

function readyAt(row: QueuedMutation): number {
  if (row.attempts === 0) return 0
  const wait = BACKOFF_MS[Math.min(row.attempts - 1, BACKOFF_MS.length - 1)]
  return row.queuedAt + wait
}

/**
 * Sends what it can, oldest first.
 *
 * Stops at the first row that cannot go yet: a later mutation may depend on an
 * earlier one, and sending an edit before its create would 404.
 */
export async function flushQueue(): Promise<{ sent: number, left: number }> {
  if (flushing || !storageAvailable() || !navigator.onLine) {
    return { sent: 0, left: snapshot.length }
  }
  flushing = true
  let sent = 0

  try {
    if (!loaded) await refresh()

    for (const row of [...snapshot]) {
      if (row.failed) continue
      if (Date.now() < readyAt(row)) break

      try {
        const response = await api.request({
          method: row.method,
          url: row.url,
          data: row.body,
          headers: { 'Idempotency-Key': row.id },
        })

        if (row.tempId) {
          const realId = (response.data as { id?: string } | undefined)?.id
          if (realId) await adoptRealId(row.tempId, realId)
        }

        await idbDelete(QUEUE_STORE, row.id)
        sent += 1
      } catch (error) {
        const status = (error as { response?: { status?: number } }).response?.status

        // The thing this edits or deletes is already gone — from another
        // device, usually. The intent is satisfied either way, so drop the row
        // rather than showing the user a failure they cannot act on.
        if (status === 404 && row.method !== 'POST') {
          await idbDelete(QUEUE_STORE, row.id)
          continue
        }

        // 4xx that is not a conflict will never succeed on a retry; keep the
        // row so the user can see it, but stop hammering the endpoint.
        // 408, 409 and 429 are the exceptions: a timeout, a conflict and a rate
        // limit all say "later", not "never".
        const retryable = status === 408 || status === 409 || status === 429
        const terminal = status !== undefined && status >= 400 && status < 500 && !retryable
        await idbPut(QUEUE_STORE, {
          ...row,
          attempts: row.attempts + 1,
          queuedAt: terminal ? row.queuedAt : Date.now(),
          lastError: describe(error),
          failed: terminal,
        })
        await refresh()
        if (!terminal) break
      }
    }

    await refresh()
    return { sent, left: snapshot.filter((row) => !row.failed).length }
  } finally {
    flushing = false
  }
}

function describe(error: unknown): string {
  const response = (error as { response?: { status?: number, data?: { message?: string | string[] } } }).response
  const message = response?.data?.message
  if (Array.isArray(message)) return message.join('. ')
  if (typeof message === 'string') return message
  if (response?.status) return `Request failed (${response.status})`
  return 'No connection'
}

/** Drop a mutation the server refused; the user has seen the reason. */
export async function discard(id: string) {
  await idbDelete(QUEUE_STORE, id)
  await refresh()
}

/** Give a failed row another chance — after fixing the cause, usually. */
export async function retry(id: string) {
  const row = snapshot.find((item) => item.id === id)
  if (!row) return
  await idbPut(QUEUE_STORE, { ...row, failed: false, attempts: 0, queuedAt: Date.now() })
  await refresh()
  void flushQueue()
}

/* ---------------------------------------------------------------- wiring -- */

/**
 * Background Sync flushes even if the app was closed — but it is Chromium
 * only. Safari and iOS never fire it, which is why the queue also flushes when
 * the app is opened and when the connection returns. It is an optimisation,
 * not the mechanism.
 */
function requestBackgroundSync() {
  navigator.serviceWorker?.ready
    .then((registration) => (registration as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> }
    }).sync?.register('quickplan-mutations'))
    .catch(() => { /* not supported here; the online listener covers it */ })
}

let started = false

/** Called once from the shell. */
export function startQueue() {
  if (started || !storageAvailable()) return
  started = true

  void refresh().then(() => flushQueue())

  window.addEventListener('online', () => { void flushQueue() })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushQueue()
  })
  navigator.serviceWorker?.addEventListener('message', (event: MessageEvent) => {
    if (event.data?.type === 'FLUSH_QUEUE') void flushQueue()
  })
}
