import { useSyncExternalStore } from 'react'

/**
 * One clock for the whole app.
 *
 * Every countdown subscribes to this single interval rather than owning a timer
 * each, so twenty cards on screen still cost one tick per second. The interval
 * stops entirely when nothing is subscribed.
 */

const listeners = new Set<() => void>()
let now = Date.now()
let timer: number | null = null

function tick() {
  now = Date.now()
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (timer === null) {
    // align to the next whole second so digits change together
    const delay = 1000 - (Date.now() % 1000)
    timer = window.setTimeout(() => {
      tick()
      timer = window.setInterval(tick, 1000)
    }, delay)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== null) {
      window.clearTimeout(timer)
      window.clearInterval(timer)
      timer = null
    }
  }
}

function getSnapshot() {
  return now
}

/** Milliseconds since epoch, refreshed every second. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
