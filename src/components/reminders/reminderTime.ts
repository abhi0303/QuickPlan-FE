import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { Reminder } from '../../services/reminders'

/** The four moods a reminder card can wear, chosen by the hour it fires. */
export type Slot = 'dawn' | 'day' | 'dusk' | 'night'

export const SLOT_LABEL: Record<Slot, string> = {
  dawn: 'Morning',
  day: 'Afternoon',
  dusk: 'Evening',
  night: 'Night',
}

export function parseDue(reminder: Reminder): Date | null {
  if (!reminder.dueAt) return null
  const parsed = parseISO(reminder.dueAt)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function slotOf(due: Date | null): Slot {
  if (!due) return 'day'
  const hour = due.getHours()
  if (hour < 11) return 'dawn'
  if (hour < 16) return 'day'
  if (hour < 20) return 'dusk'
  return 'night'
}

/** The moment the lead-in alert fires: due time minus offsetMinutes. */
export function notifyAtOf(reminder: Reminder): Date | null {
  const due = parseDue(reminder)
  if (!due) return null
  return new Date(due.getTime() - (reminder.offsetMinutes ?? 0) * 60_000)
}

export type AlertMoment = { key: string; at: Date; kind: 'lead' | 'due' }

/**
 * Every moment a reminder should sound.
 *
 * Both the lead-in and the due time count. Alerting only at the lead-in meant a
 * reminder with the default 15 minute offset went silent at the time actually
 * printed on the card, which is the moment the user is watching.
 */
export function alertMomentsOf(reminder: Reminder): AlertMoment[] {
  const due = parseDue(reminder)
  if (!due) return []

  const moments: AlertMoment[] = [{ key: `${reminder.id}:due`, at: due, kind: 'due' }]

  const offset = reminder.offsetMinutes ?? 0
  if (offset > 0) {
    moments.unshift({
      key: `${reminder.id}:lead`,
      at: new Date(due.getTime() - offset * 60_000),
      kind: 'lead',
    })
  }
  return moments
}

const pad = (value: number) => String(Math.floor(value)).padStart(2, '0')

export type Countdown = { text: string; past: boolean; imminent: boolean }

/**
 * Ticking countdown.
 *   under a day  -> HH:MM:SS
 *   a day or more -> days, plus hours so it still moves
 * Past reminders count up instead, so a missed one keeps reading sensibly.
 */
export function formatCountdown(target: Date | null, nowMs: number): Countdown {
  if (!target) return { text: 'No time set', past: false, imminent: false }

  const diff = target.getTime() - nowMs
  const past = diff < 0
  const total = Math.floor(Math.abs(diff) / 1000)

  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60

  const text = days >= 1
    ? `${days}d ${pad(hours)}h`
    : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`

  return { text, past, imminent: !past && diff <= 5 * 60_000 }
}

/** "in 2h 15m", "in 3 days", "2 hours ago" — the headline on each card. */
export function countdown(due: Date | null, now: Date): string {
  if (!due) return 'No time set'

  const ms = due.getTime() - now.getTime()
  const past = ms < 0
  const mins = Math.round(Math.abs(ms) / 60000)

  if (mins < 1) return past ? 'Just now' : 'Now'
  if (mins < 60) return past ? `${mins}m ago` : `in ${mins}m`

  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  if (hours < 24) {
    const label = rest ? `${hours}h ${rest}m` : `${hours}h`
    return past ? `${label} ago` : `in ${label}`
  }

  const days = Math.abs(differenceInCalendarDays(due, now))
  if (days < 7) return past ? `${days}d ago` : `in ${days}d`
  return format(due, 'd MMM')
}

/**
 * When a repeating reminder next fires.
 *
 * A repeating reminder is never "in the past" — its stored dueAt is only the
 * first occurrence, so the card should count down to the next one instead of
 * counting up from a date that has already been and gone.
 */
export function nextOccurrence(reminder: Reminder, now: Date): Date | null {
  const due = parseDue(reminder)
  if (!due) return null

  const rule = reminder.recurrenceRule?.toUpperCase()
  if (!rule || due > now) return due

  const next = new Date(due)
  let guard = 0
  while (next <= now && guard < 1000) {
    guard += 1
    if (rule === 'DAILY') next.setDate(next.getDate() + 1)
    else if (rule === 'WEEKLY') next.setDate(next.getDate() + 7)
    else if (rule === 'MONTHLY') next.setMonth(next.getMonth() + 1)
    else if (rule === 'WEEKDAYS') {
      do { next.setDate(next.getDate() + 1) } while (next.getDay() === 0 || next.getDay() === 6)
    } else {
      return due   // unknown rule — treat it as one-off rather than looping
    }
  }
  return next
}

/**
 * A missed reminder gets a plain statement of when it was due, not a counter.
 * Watching "00:01:11 ago" climb tells the user nothing they can act on.
 */
export function describePast(due: Date | null, now: Date): string {
  if (!due) return 'No time set'
  const days = differenceInCalendarDays(now, due)
  const time = format(due, 'h:mm a')
  if (days <= 0) return `Earlier today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  if (days < 7) return `${days} days ago, ${time}`
  return format(due, 'EEE d MMM, h:mm a')
}

export type ReminderFilter = 'all' | 'today' | 'upcoming' | 'repeating' | 'past'

export function matchesFilter(reminder: Reminder, filter: ReminderFilter, now: Date): boolean {
  // a repeating reminder is judged by when it next fires, not by its first run
  const when = nextOccurrence(reminder, now)
  // Compared against the `now` that was passed in, not the wall clock: with
  // date-fns' isPast the two could disagree, and a reminder would then be
  // neither today nor past.
  const gone = Boolean(when) && (when as Date).getTime() < now.getTime()
  switch (filter) {
    case 'today':
      return Boolean(when) && differenceInCalendarDays(when as Date, now) === 0 && !gone
    case 'upcoming':
      return Boolean(when) && !gone
    case 'repeating':
      return Boolean(reminder.recurrenceRule)
    case 'past':
      return gone && !reminder.recurrenceRule
    default:
      return true
  }
}

/** Soonest first; undated last. */
export function sortByDue(reminders: Reminder[], now: Date = new Date()): Reminder[] {
  return [...reminders].sort((a, b) => {
    const at = nextOccurrence(a, now)?.getTime() ?? Number.POSITIVE_INFINITY
    const bt = nextOccurrence(b, now)?.getTime() ?? Number.POSITIVE_INFINITY
    return at - bt
  })
}
