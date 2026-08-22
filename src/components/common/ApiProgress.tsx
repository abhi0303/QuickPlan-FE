import { useEffect, useState } from 'react'
import { subscribeApiActivity } from '../../services/api'
import './ApiProgress.scss'

/** Long enough that a fast reply never flashes a bar at the user. */
const SHOW_AFTER = 180
/** Once it is on screen it stays put long enough to be read as progress. */
const MIN_VISIBLE = 450

/**
 * A single indicator for every request the app makes. Individual screens still
 * own their skeletons and button spinners; this is what tells the user the app
 * is talking to the server when nothing else on screen would.
 */
export function ApiProgress() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | undefined
    let hideTimer: ReturnType<typeof setTimeout> | undefined
    let shownAt = 0
    let onScreen = false

    const unsubscribe = subscribeApiActivity((busy) => {
      if (busy) {
        clearTimeout(hideTimer)
        if (onScreen || showTimer) return
        showTimer = setTimeout(() => {
          showTimer = undefined
          onScreen = true
          shownAt = performance.now()
          setVisible(true)
        }, SHOW_AFTER)
        return
      }

      clearTimeout(showTimer)
      showTimer = undefined
      if (!onScreen) return
      const left = Math.max(0, MIN_VISIBLE - (performance.now() - shownAt))
      hideTimer = setTimeout(() => {
        onScreen = false
        setVisible(false)
      }, left)
    })

    return () => {
      unsubscribe()
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [])

  if (!visible) return null
  return (
    <div className="api-progress" role="status" aria-live="polite">
      <i />
      <span className="sr-only">Loading</span>
    </div>
  )
}
