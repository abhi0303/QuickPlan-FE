import { differenceInCalendarDays, format, isPast, parseISO } from 'date-fns'
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

export type ReminderFilter = 'all' | 'today' | 'upcoming' | 'repeating' | 'past'

export function matchesFilter(reminder: Reminder, filter: ReminderFilter, now: Date): boolean {
  const due = parseDue(reminder)
  switch (filter) {
    case 'today':
      return Boolean(due) && differenceInCalendarDays(due as Date, now) === 0 && !isPast(due as Date)
    case 'upcoming':
      return Boolean(due) && !isPast(due as Date)
    case 'repeating':
      return Boolean(reminder.recurrenceRule)
    case 'past':
      return Boolean(due) && isPast(due as Date) && !reminder.recurrenceRule
    default:
      return true
  }
}

/** Soonest first; undated last. */
export function sortByDue(reminders: Reminder[]): Reminder[] {
  return [...reminders].sort((a, b) => {
    const at = parseDue(a)?.getTime() ?? Number.POSITIVE_INFINITY
    const bt = parseDue(b)?.getTime() ?? Number.POSITIVE_INFINITY
    return at - bt
  })
}
