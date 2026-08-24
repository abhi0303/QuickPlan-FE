import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from 'lucide-react'
import { useTour } from '../../hooks/useTour'
import { findTarget, TOUR_TARGETS } from './tourTargets'
import './Tour.scss'

type Spot = { top: number, left: number, width: number, height: number } | null

const PAD = 10
const CARD_WIDTH = 330
const GAP = 14

/**
 * The guided tour: a dimmed screen with a hole cut over whatever the current
 * step is about, and a card explaining it.
 *
 * The hole is drawn with an enormous box-shadow rather than four panels or an
 * SVG mask — one element, one rounded rectangle, and the dimming follows it as
 * it moves. When a step has no target, or its element is not on this screen,
 * the card simply centres and nothing is highlighted.
 */
export function Tour() {
  const { active, step, index, total, next, back, skip } = useTour()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [spot, setSpot] = useState<Spot>(null)

  const target = step ? TOUR_TARGETS[step.id] : undefined
  const wantedRoute = target?.route

  // walk to the page this step is about, so the tour tours
  useEffect(() => {
    if (!active || !wantedRoute || pathname === wantedRoute) return
    navigate(wantedRoute)
  }, [active, wantedRoute, pathname, navigate])

  // measure the element this step points at, and keep the hole on it
  useEffect(() => {
    if (!active || !step) return

    let frame = 0

    function measure() {
      const element = findTarget(step.id)
      if (!element) {
        setSpot(null)
        return
      }
      const rect = element.getBoundingClientRect()
      setSpot({
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      })
    }

    // the page may still be arriving from the navigation above, so look again
    // over the next few frames rather than once
    const timers = [0, 120, 320, 700].map((delay) => window.setTimeout(() => {
      const element = findTarget(step.id)
      element?.scrollIntoView({ block: 'center', behavior: delay ? 'smooth' : 'auto' })
      frame = requestAnimationFrame(measure)
    }, delay))

    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [active, step, pathname])

  useEffect(() => {
    if (!active) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') skip()
      if (event.key === 'ArrowRight' || event.key === 'Enter') next()
      if (event.key === 'ArrowLeft') back()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  if (!active || !step) return null

  const last = index + 1 >= total
  const centred = !spot || target?.prefer === 'center'

  // below the hole when there is room, above when there is not
  const below = spot ? spot.top + spot.height + GAP : 0
  const roomBelow = spot ? window.innerHeight - below > 240 : false
  const cardStyle = centred || !spot
    ? undefined
    : {
      top: roomBelow ? below : undefined,
      bottom: roomBelow ? undefined : window.innerHeight - spot.top + GAP,
      left: Math.min(
        Math.max(12, spot.left + spot.width / 2 - CARD_WIDTH / 2),
        Math.max(12, window.innerWidth - CARD_WIDTH - 12),
      ),
    }

  return createPortal(
    <div className="tour" role="dialog" aria-modal="true" aria-label={step.title}>
      {spot && !centred ? (
        <div
          className="tour-hole"
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
        />
      ) : (
        <div className="tour-dim" />
      )}

      <div className={`tour-card ${centred ? 'is-centred' : ''}`} style={cardStyle}>
        <div className="tour-top">
          <span className="tour-badge"><Sparkles size={14} /> {index + 1} of {total}</span>
          <button className="tour-skip" onClick={skip}>
            Skip <X size={13} />
          </button>
        </div>

        <h2>{step.title}</h2>
        <p>{step.body}</p>

        <div className="tour-dots" aria-hidden="true">
          {Array.from({ length: total }, (_, dot) => (
            <i key={dot} className={dot === index ? 'on' : dot < index ? 'done' : ''} />
          ))}
        </div>

        <div className="tour-actions">
          <button className="tour-back" onClick={back} disabled={index === 0}>
            <ArrowLeft size={15} /> Back
          </button>
          <button className="tour-next" onClick={next}>
            {last ? <>Start using it <Check size={16} /></> : <>Next <ArrowRight size={16} /></>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
