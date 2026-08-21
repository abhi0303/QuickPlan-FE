import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type Props = {
  children: ReactNode
  /** Applied to the scrolling track, so existing row styles keep working. */
  className?: string
  label?: string
  role?: string
}

const STEP = 180

/**
 * A single-line horizontal strip that scrolls instead of wrapping, with edge
 * fades and arrows that appear only when there is more to see. Inert when the
 * content already fits, so the same markup works on desktop.
 */
export function ScrollRow({ children, className = '', label, role }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    // Deferred via rAF / observers rather than measured inline, so state is
    // never set synchronously during the effect.
    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = track
      setCanLeft(scrollLeft > 4)
      setCanRight(scrollLeft + clientWidth < scrollWidth - 4)
    }

    const frame = requestAnimationFrame(update)
    track.addEventListener('scroll', update, { passive: true })

    const observer = new ResizeObserver(update)
    observer.observe(track)
    for (const child of Array.from(track.children)) observer.observe(child)

    return () => {
      cancelAnimationFrame(frame)
      track.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [children])

  function nudge(direction: -1 | 1) {
    trackRef.current?.scrollBy({ left: direction * STEP, behavior: 'smooth' })
  }

  return (
    <div className={`scroll-row ${canLeft ? 'can-left' : ''} ${canRight ? 'can-right' : ''}`}>
      {canLeft && (
        <button type="button" className="scroll-row-arrow left" onClick={() => nudge(-1)} aria-label="Scroll left" tabIndex={-1}>
          <ChevronLeft size={16} />
        </button>
      )}

      <div className={`scroll-row-track ${className}`} ref={trackRef} role={role} aria-label={label}>
        {children}
      </div>

      {canRight && (
        <button type="button" className="scroll-row-arrow right" onClick={() => nudge(1)} aria-label="Scroll right" tabIndex={-1}>
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  )
}
