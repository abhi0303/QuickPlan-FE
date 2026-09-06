import { useEffect, useRef, useState } from 'react'

/**
 * Whole seconds left on a wait, for buttons that have to stay disabled for a
 * while — a rate limit's Retry-After, or the cooldown the server keeps on a
 * mail route. Counts against a deadline rather than by decrementing, so a
 * backgrounded tab that missed a few ticks comes back with the right number
 * instead of a stale one.
 */
export function useCountdown() {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const deadline = useRef(0)

  useEffect(() => {
    if (secondsLeft <= 0) return
    const id = window.setTimeout(() => {
      const left = Math.ceil((deadline.current - Date.now()) / 1000)
      setSecondsLeft(left > 0 ? left : 0)
    }, 1000)
    return () => window.clearTimeout(id)
  }, [secondsLeft])

  function start(seconds: number) {
    deadline.current = Date.now() + seconds * 1000
    setSecondsLeft(Math.max(0, Math.ceil(seconds)))
  }

  return [secondsLeft, start] as const
}
