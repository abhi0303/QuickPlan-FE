import { useCallback, useEffect, useRef, useState } from 'react'
import {
  completeTour,
  getTour,
  restartTour,
  saveTourProgress,
  skipTour,
} from '../services/onboarding'
import type { TourState, TourStep } from '../services/onboarding'
import { useAppStore } from '../store/useAppStore'

/**
 * Runs the guided tour.
 *
 * The server decides whether it should play and where to resume; this holds the
 * position while it does. Every move is reported, but nothing waits on the
 * response — progress only moves forward server-side, so a dropped request
 * costs nothing worse than resuming a step earlier.
 */
export function useTour() {
  const session = useAppStore((state) => state.session)
  const signedIn = Boolean(session)
  const request = useAppStore((state) => state.tourRequest)

  const [state, setState] = useState<TourState | null>(null)
  const [index, setIndex] = useState(0)
  const [active, setActive] = useState(false)
  const started = useRef(false)

  // ask once per sign-in whether the tour is due
  useEffect(() => {
    if (!signedIn || started.current) return
    started.current = true
    let cancelled = false

    getTour()
      .then((tour) => {
        if (cancelled || tour.steps.length === 0) return
        setState(tour)
        if (tour.shouldShow) {
          // resume where they stopped; currentStep is 1-based and 0 means "not begun"
          setIndex(Math.min(Math.max(tour.currentStep - 1, 0), tour.steps.length - 1))
          setActive(true)
        }
      })
      .catch(() => { /* a tour that cannot load simply does not play */ })

    return () => { cancelled = true }
  }, [signedIn])

  // Settings → Guide asks for it again
  useEffect(() => {
    if (request === 0 || !signedIn) return
    let cancelled = false

    restartTour()
      .then((tour) => {
        if (cancelled) return
        if (tour.steps.length) setState(tour)
        setIndex(0)
        setActive(true)
      })
      .catch(() => { /* leave the app as it was */ })

    return () => { cancelled = true }
  }, [request, signedIn])

  const steps = state?.steps ?? []
  const step: TourStep | null = steps[index] ?? null

  const report = useCallback((position: number) => {
    void saveTourProgress(position + 1).catch(() => undefined)
  }, [])

  function next() {
    if (index + 1 >= steps.length) {
      finish()
      return
    }
    const position = index + 1
    setIndex(position)
    report(position)
  }

  function back() {
    setIndex((current) => Math.max(0, current - 1))
  }

  function finish() {
    setActive(false)
    void completeTour().catch(() => undefined)
  }

  function skip() {
    setActive(false)
    void skipTour().catch(() => undefined)
  }

  return { active, step, index, total: steps.length, next, back, finish, skip }
}
