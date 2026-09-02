import { useEffect, useState } from 'react'

/**
 * Tuck the floating buttons away while somebody is reading downwards.
 *
 * They sit over the bottom-right corner, which is exactly where a list keeps
 * its own row controls — so on a long page they cover the thing being reached
 * for. Moving them by hand was the obvious fix and a poor one: it makes the
 * user solve a layout problem, once per device, and remember where they put it.
 *
 * Direction is the better signal. Scrolling *down* is reading and acting, and
 * the buttons are not wanted; scrolling *up*, or sitting near the top, is
 * looking for something to press. They come back the moment the gesture
 * reverses, so nothing is ever more than a short flick away.
 */

/** Ignore the first stretch, where the buttons are not covering anything yet. */
const ARM_AFTER = 140
/** Enough movement to be a decision rather than a wobble. */
const SLOP = 12

export function useHideOnScroll() {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let last = window.scrollY
    let ticking = false

    function read() {
      ticking = false
      const y = window.scrollY
      const moved = y - last

      if (Math.abs(moved) < SLOP) return
      last = y

      // near the top there is nothing underneath them to uncover
      if (y < ARM_AFTER) { setHidden(false); return }
      setHidden(moved > 0)
    }

    function onScroll() {
      if (ticking) return
      ticking = true
      requestAnimationFrame(read)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return hidden
}
