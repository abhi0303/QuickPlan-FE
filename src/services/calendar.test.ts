import { describe, expect, it, afterEach } from 'vitest'
import { googleCalendarUrl, prefersGoogleFirst } from './calendar'
import type { Reminder } from './reminders'

const reminder = (over: Partial<Reminder> = {}): Reminder => ({
  id: 'r1',
  title: 'Dentist appointment',
  dueAt: '2026-08-27T08:15:00.000Z',
  ...over,
})

const params = (url: string) => new URL(url).searchParams

describe('googleCalendarUrl', () => {
  it('carries the title and a fifteen minute window', () => {
    const query = params(googleCalendarUrl(reminder()) as string)
    expect(query.get('text')).toBe('Dentist appointment')
    expect(query.get('dates')).toBe('20260827T081500Z/20260827T083000Z')
  })

  it.each([
    ['DAILY', 'RRULE:FREQ=DAILY'],
    ['WEEKLY', 'RRULE:FREQ=WEEKLY'],
    ['MONTHLY', 'RRULE:FREQ=MONTHLY'],
    ['WEEKDAYS', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'],
  ])('turns %s into %s', (rule, expected) => {
    expect(params(googleCalendarUrl(reminder({ recurrenceRule: rule })) as string).get('recur')).toBe(expected)
  })

  it('leaves out the rule when the reminder does not repeat', () => {
    expect(params(googleCalendarUrl(reminder()) as string).get('recur')).toBeNull()
  })

  it('escapes a title that would otherwise break the query', () => {
    const url = googleCalendarUrl(reminder({ title: 'Pay rent, then call Amit & Co' })) as string
    expect(params(url).get('text')).toBe('Pay rent, then call Amit & Co')
  })

  it('has nothing to offer without a time', () => {
    expect(googleCalendarUrl(reminder({ dueAt: undefined }))).toBeNull()
  })

  it('has nothing to offer for an unparseable time', () => {
    expect(googleCalendarUrl(reminder({ dueAt: 'not a date' }))).toBeNull()
  })
})

describe('prefersGoogleFirst', () => {
  const as = (userAgent: string) => {
    Object.defineProperty(globalThis, 'navigator', { value: { userAgent }, configurable: true })
    return prefersGoogleFirst()
  }

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', { value: { userAgent: '' }, configurable: true })
  })

  it.each([
    // Safari opens an .ics straight into the Add sheet, so the file leads there
    ['iOS Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1', false],
    ['iPad Safari', 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Version/18.0 Safari/604.1', false],
    ['macOS Chrome', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128 Safari/537.36', false],
    // these download the file and need a second "open in", so Google is shorter
    ['Android Chrome', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/128 Mobile Safari/537.36', true],
    ['iOS Chrome', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/128 Mobile/15E148', true],
    ['iOS Edge', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) EdgiOS/128 Mobile/15E148', true],
  ])('%s → google first: %s', (_name, userAgent, expected) => {
    expect(as(userAgent)).toBe(expected)
  })
})
