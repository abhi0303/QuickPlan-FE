import { addMinutes, parseISO } from 'date-fns'
import { api } from './api'
import type { Reminder } from './reminders'

/**
 * Handing a reminder to the phone's own calendar.
 *
 * A web push cannot ring — a service worker has no audio and the notification
 * `sound` option was dropped from the spec — so the way to make a reminder fire
 * with the app closed is to give it to the operating system. Once the event is
 * in the native calendar it alerts on a locked phone with QuickPlan shut, at no
 * cost and with nothing to keep alive.
 *
 * It is a copy, not a sync: editing the reminder here does not follow it there.
 */

/** How long the event occupies in a calendar. A reminder is really a point. */
const EVENT_MINUTES = 15

export type CalendarLink = { url: string, expiresAt: string | null }

/**
 * The file has to come from a real URL rather than a blob: iOS in an installed
 * PWA does not reliably open blob downloads, and a navigation cannot carry our
 * Authorization header — so the link authorises itself with a short-lived
 * token, minted here.
 */
export async function getCalendarLink(reminderId: string): Promise<CalendarLink> {
  const { data } = await api.post(`/api/reminders/${reminderId}/calendar-link`)
  const body = (data ?? {}) as Record<string, unknown>
  const nested = (body.data ?? {}) as Record<string, unknown>

  // The endpoint publishes no response schema, so the field name is not
  // something to assume: take the first string that looks like the link.
  const url = [body.url, body.icsUrl, body.calendarUrl, body.link, nested.url, nested.icsUrl]
    .find((value): value is string => typeof value === 'string' && value.length > 0)

  if (!url) {
    throw new Error(`The calendar link was missing from the response (got: ${Object.keys(body).join(', ') || 'nothing'}).`)
  }

  const expiresAt = [body.expiresAt, nested.expiresAt]
    .find((value): value is string => typeof value === 'string')

  return { url, expiresAt: expiresAt ?? null }
}

/** `20260827T081500Z` — the only date format these URLs accept. */
function stamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
}

const RECURRENCE: Record<string, string> = {
  DAILY: 'RRULE:FREQ=DAILY',
  WEEKLY: 'RRULE:FREQ=WEEKLY',
  MONTHLY: 'RRULE:FREQ=MONTHLY',
  WEEKDAYS: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
}

/**
 * The Google Calendar composer, built entirely here — no backend involved.
 *
 * On Android this opens the Google Calendar app pre-filled, which is one tap
 * instead of the download-then-open dance the .ics file needs.
 */
export function googleCalendarUrl(reminder: Reminder): string | null {
  if (!reminder.dueAt) return null
  const start = parseISO(reminder.dueAt)
  if (Number.isNaN(start.getTime())) return null

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: reminder.title,
    dates: `${stamp(start)}/${stamp(addMinutes(start, EVENT_MINUTES))}`,
    details: 'Reminder from QuickPlan',
  })

  const rule = reminder.recurrenceRule ? RECURRENCE[reminder.recurrenceRule] : undefined
  if (rule) params.set('recur', rule)

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/**
 * Which option to offer first.
 *
 * Safari and the installed PWA show the Add-to-Calendar sheet straight from the
 * .ics, so that goes first there. Chrome on iOS downloads it and needs an extra
 * "open in" step, and Android needs the same, so Google leads on both.
 */
export function prefersGoogleFirst(): boolean {
  const ua = navigator.userAgent
  const isIos = /iPad|iPhone|iPod/.test(ua)
  const isIosChrome = isIos && /CriOS|FxiOS|EdgiOS/.test(ua)
  const isAndroid = /Android/.test(ua)
  return isAndroid || isIosChrome
}
