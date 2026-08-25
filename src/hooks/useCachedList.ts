import { useCallback, useRef, useState } from 'react'
import { cacheKey, readCache, writeCache } from '../services/offline/cache'
import { useAppStore } from '../store/useAppStore'

/**
 * Last-known data first, fresh data when it arrives.
 *
 * The API sleeps on a free tier and phones have bad minutes, so a list that was
 * read successfully once is kept and shown immediately — labelled with when it
 * was read — while the network is asked again. Nothing here decides what is
 * *correct*: the moment the request answers, its result wins.
 */
export function useCachedList<T>(name: string) {
  const userId = useAppStore((state) => state.session?.userId)
  const key = cacheKey(userId, name)
  const [staleAt, setStaleAt] = useState<number | null>(null)
  /** Set once the network has answered, so a slow cache read cannot overwrite it. */
  const fresh = useRef(false)

  /** Reads the cache and hands it over only if nothing newer has arrived. */
  const hydrate = useCallback((apply: (data: T) => void) => {
    fresh.current = false
    void readCache<T>(key).then((hit) => {
      if (!hit || fresh.current) return
      apply(hit.data)
      setStaleAt(hit.at)
    })
  }, [key])

  const store = useCallback((data: T) => {
    fresh.current = true
    setStaleAt(null)
    void writeCache(key, data)
  }, [key])

  return { hydrate, store, staleAt }
}
