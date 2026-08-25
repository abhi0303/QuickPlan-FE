/**
 * A very small IndexedDB wrapper.
 *
 * Two stores and no library: `cache` holds the last successful read of a list
 * so a slow network shows something rather than a spinner, and `queue` holds
 * mutations that have not reached the server yet.
 *
 * The queue is the source of truth for "did this happen" — React state dies
 * with the tab, and a task typed on the metro has to survive that.
 */

const DB_NAME = 'quickplan'
const DB_VERSION = 1

export const CACHE_STORE = 'cache'
export const QUEUE_STORE = 'queue'

let handle: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  handle ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE)
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const queue = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' })
        // flushed in the order they were made: a create must land before its edit
        queue.createIndex('queuedAt', 'queuedAt')
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return handle
}

/** Whether this browser can store anything at all — private windows may not. */
export function storageAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

function run<T>(store: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(store, mode)
    const request = work(transaction.objectStore(store))
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
  }))
}

export const idbGet = <T>(store: string, key: IDBValidKey) => run<T | undefined>(store, 'readonly', (s) => s.get(key))
export const idbPut = (store: string, value: unknown, key?: IDBValidKey) =>
  run<IDBValidKey>(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key)))
export const idbDelete = (store: string, key: IDBValidKey) =>
  run<undefined>(store, 'readwrite', (s) => s.delete(key))
export const idbAll = <T>(store: string) => run<T[]>(store, 'readonly', (s) => s.getAll())
export const idbClear = (store: string) => run<undefined>(store, 'readwrite', (s) => s.clear())
