import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { CalendarPlus, Check, LoaderCircle } from 'lucide-react'
import { useUnlocked } from '../../hooks/useUnlocked'
import { getApiErrorMessage } from '../../services/api'
import { getCalendarLink, googleCalendarUrl, prefersGoogleFirst } from '../../services/calendar'
import type { Reminder } from '../../services/reminders'
import './AddToCalendar.scss'

/** Roughly what the menu occupies; used to decide which way it opens. */
const MENU_HEIGHT = 210
const MENU_WIDTH = 268
const EDGE = 12
const GAP = 6

type Placement = { left: number, top?: number, bottom?: number, up: boolean }

/**
 * Hands a reminder to the phone's calendar.
 *
 * Two routes because two calendars: an .ics file, which every calendar app
 * understands, and the Google composer, which is one tap on Android. Which is
 * listed first depends on where the shortest path is — see `prefersGoogleFirst`.
 *
 * The menu is rendered through a portal and positioned in viewport coordinates.
 * Its trigger sits inside a reminder card, and that card clips its overflow to
 * hold its own decoration — an absolutely positioned menu simply vanished
 * inside it.
 */
export function AddToCalendar({ reminder, compact }: { reminder: Reminder, compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState(false)
  const [place, setPlace] = useState<Placement | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const unlocked = useUnlocked('CALENDAR_ADD')
  const google = googleCalendarUrl(reminder)
  const googleFirst = prefersGoogleFirst()

  /** Where the menu goes: under the button, or above it when that would fall off. */
  function measure(): Placement | null {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return null

    const below = window.innerHeight - rect.bottom
    const up = below < MENU_HEIGHT && rect.top > below

    return {
      // right-aligned to the button, then kept inside the screen
      left: Math.min(
        Math.max(EDGE, rect.right - MENU_WIDTH),
        Math.max(EDGE, window.innerWidth - MENU_WIDTH - EDGE),
      ),
      top: up ? undefined : rect.bottom + GAP,
      bottom: up ? window.innerHeight - rect.top + GAP : undefined,
      up,
    }
  }

  useEffect(() => {
    if (!open) return

    function reposition() {
      setPlace(measure())
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false) }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    // the page behind can still move; follow the button rather than drift off it
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    setPlace(measure())
    setOpen(true)
  }

  async function openIcs() {
    setBusy(true)
    try {
      const link = await getCalendarLink(reminder.id)
      setOpen(false)
      setAdded(true)
      /*
       * A navigation, not a download: the browser sees text/calendar and offers
       * to add the event. A blob would be simpler but iOS in an installed PWA
       * often does nothing with one.
       */
      window.location.href = link.url

      // nothing visible happens on a desktop — the file lands in Downloads and
      // the page stays put — so say so, or the button looks dead
      if (!/iPad|iPhone|iPod/.test(navigator.userAgent)) {
        toast.success('Calendar file downloaded — open it to add the reminder')
      }
    } catch (error) {
      // the real reason, not a shrug: this is the one step that can fail
      toast.error(getApiErrorMessage(error, 'Could not build the calendar file.'))
    } finally {
      setBusy(false)
    }
  }

  function openGoogle() {
    if (!google) return
    setOpen(false)
    setAdded(true)

    /*
     * A link click rather than window.open: with `noopener` the call always
     * returns null by specification, so testing the result to detect a blocked
     * popup navigated this page away every time. An anchor click from a real
     * user gesture is not blocked, and carries the same opener protection.
     */
    const link = document.createElement('a')
    link.href = google
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  // a reminder with no time has nothing to put in a calendar, and the whole
  // action arrives at level 3
  if (!reminder.dueAt || !unlocked) return null

  const icsOption = (
    <button type="button" onClick={openIcs} disabled={busy}>
      {busy ? <LoaderCircle size={15} className="spin" /> : <CalendarPlus size={15} />}
      <span>
        <strong>Apple or other calendar</strong>
        <small>Downloads an .ics the calendar app opens</small>
      </span>
    </button>
  )

  const googleOption = google ? (
    <button type="button" onClick={openGoogle}>
      <CalendarPlus size={15} />
      <span>
        <strong>Google Calendar</strong>
        <small>Opens it pre-filled, ready to save</small>
      </span>
    </button>
  ) : null

  return (
    <div className="add-cal">
      <button
        type="button"
        ref={triggerRef}
        className={`add-cal-trigger ${compact ? 'is-compact' : ''} ${added ? 'is-added' : ''}`}
        onClick={toggle}
        aria-expanded={open}
        aria-label={`Add "${reminder.title}" to your calendar`}
        title="Add to your phone's calendar"
      >
        {added ? <Check size={15} /> : <CalendarPlus size={15} />}
        {!compact && <span>{added ? 'Added' : 'Add to calendar'}</span>}
      </button>

      {open && place && createPortal(
        <div
          ref={menuRef}
          className={`add-cal-menu ${place.up ? 'is-up' : ''}`}
          role="menu"
          style={{ left: place.left, top: place.top, bottom: place.bottom }}
        >
          <p className="add-cal-note">
            Your phone alerts you even with QuickPlan closed. It is a copy —
            changing the reminder here will not update it there.
          </p>
          {googleFirst ? <>{googleOption}{icsOption}</> : <>{icsOption}{googleOption}</>}
        </div>,
        document.body,
      )}
    </div>
  )
}
