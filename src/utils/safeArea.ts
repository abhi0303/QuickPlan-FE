/**
 * Safe-area insets that are actually needed, rather than the ones reported.
 *
 * A home-screen app on iOS is laid out *below* the status bar and *above* the
 * home indicator — and still reports both insets. Honouring them there adds
 * the allowance a second time, which is the band of empty header and empty
 * footer that shows up on an iPhone and not on Android, where the viewport
 * really does run under the system bars.
 *
 * Rather than guess which platform does what, ask: a viewport shorter than
 * the screen has already had the insets taken out of it. Only in a home-screen
 * app, since a browser's own chrome shortens the viewport too and its insets
 * are real; and only in portrait, because iOS reports `screen` in portrait
 * terms whichever way the phone is held, so the comparison means nothing on
 * its side. Both fall back to honouring the insets, which can waste a band but
 * can never hide anything under the clock.
 */
const TOLERANCE = 4

function insetsAlreadyTaken(): boolean {
  if (!window.matchMedia('(display-mode: standalone)').matches) return false
  if (window.innerHeight <= window.innerWidth) return false
  return window.innerHeight < Math.max(window.screen.width, window.screen.height) - TOLERANCE
}

/** Reads the situation now, and again whenever the viewport changes. */
export function watchSafeArea(): void {
  const root = document.documentElement

  function apply() {
    if (insetsAlreadyTaken()) {
      root.style.setProperty('--inset-top', '0px')
      root.style.setProperty('--inset-bottom', '0px')
      // nothing overlays the viewport either, so the fallback clearance for a
      // platform that reports no inset is not needed here
      root.style.setProperty('--inset-floor', '0px')
    } else {
      // back to the stylesheet's own env() values and per-place clearances
      root.style.removeProperty('--inset-top')
      root.style.removeProperty('--inset-bottom')
      root.style.removeProperty('--inset-floor')
    }
  }

  apply()
  window.addEventListener('resize', apply)
  window.addEventListener('orientationchange', apply)
}
