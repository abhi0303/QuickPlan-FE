import { useEffect, useRef, useState } from 'react'
import { getApiErrorMessage } from '../services/api'
import { getGamification, getMissionCatalogue } from '../services/gamification'
import type { MissionCatalogue } from '../services/gamification'
import { useAppStore } from '../store/useAppStore'

/** Focus and visibilitychange both fire on a tab switch; one read is enough. */
const MIN_GAP_MS = 20_000

/**
 * The catalogue is static configuration and never changes between reads, so it
 * is fetched once per page load and shared by every consumer.
 */
let cataloguePromise: Promise<MissionCatalogue> | null = null

function loadCatalogue() {
  cataloguePromise ??= getMissionCatalogue().catch((error) => {
    cataloguePromise = null
    throw error
  })
  return cataloguePromise
}

/**
 * XP, level, rank and the three current missions.
 *
 * Nothing polls. It is read when the app opens, whenever activity could have
 * moved a mission — any task mutation bumps `tasksVersion` — and when the
 * window comes back to the foreground, since progress can be earned on another
 * device. There is nothing to write: a mission completes through real activity
 * and the next read shows it.
 */
export function useGamification() {
  const session = useAppStore((state) => state.session)
  const signedIn = Boolean(session)
  const tasksVersion = useAppStore((state) => state.tasksVersion)
  const setSeenLevel = useAppStore((state) => state.setSeenLevel)
  const tick = useAppStore((state) => state.gamificationTick)
  const setGamification = useAppStore((state) => state.setGamification)
  const setGamificationStatus = useAppStore((state) => state.setGamificationStatus)

  /** Set when a read shows a higher level than the last one acknowledged. */
  const [levelUp, setLevelUp] = useState<{ from: number, to: number, rankName: string } | null>(null)
  const lastLoadAt = useRef(0)
  const lastVersion = useRef(tasksVersion)

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false

    function load() {
      lastLoadAt.current = performance.now()
      Promise.all([getGamification(), loadCatalogue().catch(() => null)])
        .then(([next, definitions]) => {
          if (cancelled) return
          setGamification(next, definitions)
          setGamificationStatus(false, '')

          /*
           * Read at the moment of comparison rather than captured with the
           * effect: the listeners below outlive many renders, and a stale
           * "last level seen" made every later refetch re-announce a level-up
           * that had already been shown and acknowledged.
           */
          const seen = useAppStore.getState().seenLevel

          if (seen === null) {
            setSeenLevel(next.level)
            return
          }

          // and never stack a second celebration on top of one still showing
          if (next.level > seen) {
            setLevelUp((current) => current ?? { from: seen, to: next.level, rankName: next.rankName })
          }
        })
        .catch((fetchError) => {
          if (!cancelled) {
            setGamificationStatus(false, getApiErrorMessage(fetchError, 'Could not load your missions.'))
          }
        })
    }

    load()

    /*
     * Mission progress is computed from an event the create call does not wait
     * for, so a read fired the instant a task is saved can still report the old
     * count. One follow-up read settles it — the alternative, polling, is what
     * we just took out.
     */
    let followUp: number | undefined
    if (lastVersion.current !== tasksVersion) {
      lastVersion.current = tasksVersion
      followUp = window.setTimeout(load, 2500)
    }

    function onServiceWorkerMessage(event: MessageEvent) {
      // MISSION_COMPLETED and LEVEL_UP arrive this way; both change this state
      if (event.data?.type === 'PUSH_RECEIVED') load()
    }

    function onFocus() {
      if (document.visibilityState !== 'visible') return
      if (performance.now() - lastLoadAt.current < MIN_GAP_MS) return
      load()
    }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage)

    return () => {
      cancelled = true
      if (followUp !== undefined) window.clearTimeout(followUp)
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
      navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, tasksVersion, tick])

  /** Called when the level-up celebration is dismissed. */
  function acknowledgeLevelUp() {
    if (levelUp) setSeenLevel(levelUp.to)
    setLevelUp(null)
  }

  return { levelUp, acknowledgeLevelUp }
}

/**
 * Read-only view for anything that displays missions.
 *
 * The shell owns the single fetch; asking for a refresh here bumps the tick it
 * watches, so a countdown running out costs one request rather than one per
 * component that noticed.
 */
export function useGamificationView() {
  return {
    state: useAppStore((store) => store.gamification),
    catalogue: useAppStore((store) => store.missionCatalogue),
    loading: useAppStore((store) => store.gamificationLoading),
    error: useAppStore((store) => store.gamificationError),
    refresh: useAppStore((store) => store.refreshGamification),
  }
}
