import { useEffect, useRef, useState } from 'react'

/**
 * Pull down at the top of the page to refresh, on touch devices.
 *
 * An installed app has no reload button, and a button in the header is one
 * more thing crowding it at the width where that is least affordable. The
 * gesture is the one people already try.
 *
 * Deliberately narrow about when it engages: only on a coarse pointer, only
 * from the very top of the page, only when the drag is clearly vertical, and
 * never while a dialog has the body locked — pulling a page that cannot scroll
 * behind an open form is a mis-swipe, not a refresh.
 */

/** How far to pull before letting go actually refreshes. */
export const PULL_THRESHOLD = 72
/** Past this the pull stops following the finger, so it cannot be hauled open. */
const MAX_PULL = 110
/** Below this it is a tap or the start of a scroll, not a pull. */
const START_SLOP = 8

export type PullState = 'idle' | 'pulling' | 'ready' | 'refreshing'

export function usePullToRefresh(onRefresh: () => Promise<void> | void) {
  const [distance, setDistance] = useState(0)
  const [state, setState] = useState<PullState>('idle')

  /* Written only from effects and touch handlers, never during a render. */
  const gesture = useRef({ startY: 0, startX: 0, tracking: false, active: false, pulled: 0 })
  const refresh = useRef(onRefresh)

  useEffect(() => {
    refresh.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.matchMedia('(pointer: coarse)').matches) return

    const g = gesture.current
    const locked = () => document.body.style.overflow === 'hidden'

    const reset = () => {
      g.tracking = false
      g.active = false
      g.pulled = 0
    }

    function onStart(event: TouchEvent) {
      if (locked() || window.scrollY > 0 || event.touches.length !== 1) return
      g.startY = event.touches[0].clientY
      g.startX = event.touches[0].clientX
      g.tracking = true
      g.active = false
      g.pulled = 0
    }

    function onMove(event: TouchEvent) {
      if (!g.tracking) return

      const dy = event.touches[0].clientY - g.startY
      const dx = Math.abs(event.touches[0].clientX - g.startX)

      // upward or sideways is somebody scrolling or swiping, not pulling
      if (!g.active) {
        if (dy < 0 || dx > Math.abs(dy)) { g.tracking = false; return }
        if (dy < START_SLOP) return
        g.active = true
      }

      // resistance, so the sheet slows as it comes
      g.pulled = Math.min(MAX_PULL, (dy - START_SLOP) * 0.5)
      setDistance(g.pulled)
      setState(g.pulled >= PULL_THRESHOLD ? 'ready' : 'pulling')

      // only once we have taken over, or the page could never scroll at all
      if (event.cancelable) event.preventDefault()
    }

    async function onEnd() {
      if (!g.tracking || !g.active) { reset(); return }

      const shouldRefresh = g.pulled >= PULL_THRESHOLD
      reset()

      if (!shouldRefresh) {
        setDistance(0)
        setState('idle')
        return
      }

      setState('refreshing')
      setDistance(PULL_THRESHOLD)
      try {
        await refresh.current()
      } finally {
        setDistance(0)
        setState('idle')
      }
    }

    // non-passive: preventDefault is what stops the browser's own rubber-band
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', onEnd)

    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  return { distance, state }
}
