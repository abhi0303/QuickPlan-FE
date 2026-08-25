import { CACHE_STORE, idbGet, idbPut, storageAvailable } from './db'

/**
 * The last successful read of a list, kept so the app can render immediately
 * and correct itself when the network answers.
 *
 * Render's free tier can take thirty seconds to wake, and a phone on a bad
 * connection is worse — showing yesterday's list, labelled, beats an empty
 * screen and a spinner.
 */
export type CacheHit<T> = { data: T, at: number }

/** Bumped when a cached shape changes, so old entries are ignored not misread. */
const SHAPE = 1

type Entry<T> = { shape: number, at: number, data: T }

export async function readCache<T>(key: string): Promise<CacheHit<T> | null> {
  if (!storageAvailable()) return null
  try {
    const entry = await idbGet<Entry<T>>(CACHE_STORE, key)
    if (!entry || entry.shape !== SHAPE) return null
    return { data: entry.data, at: entry.at }
  } catch {
    return null
  }
}

export async function writeCache<T>(key: string, data: T): Promise<void> {
  if (!storageAvailable()) return
  try {
    await idbPut(CACHE_STORE, { shape: SHAPE, at: Date.now(), data } satisfies Entry<T>, key)
  } catch {
    // a full or unavailable store must never break a working page
  }
}

/** Cache keys are per user: signing out must not reveal the last account's data. */
export function cacheKey(userId: string | undefined, name: string): string {
  return `${userId ?? 'anon'}:${name}`
}
