import { describe, expect, it } from 'vitest'
import { alertMomentsOf, formatCountdown, matchesFilter, nextOccurrence, sortByDue } from './reminderTime'
import type { Reminder } from '../../services/reminders'

/**
 * When a repeating reminder next fires, and what the countdown says. Both are
 * read at a glance and wrong by a whole day if the arithmetic slips.
 *
 * Dates are built with local constructors so the suite passes wherever it runs.
 */
const at = (y: number, m: number, d: number, h = 9, min = 0) => new Date(y, m - 1, d, h, min).toISOString()

function reminder(over: Partial<Reminder> = {}): Reminder {
  return { id: 'r1', title: 'Standup', dueAt: at(2026, 8, 25, 9), ...over }
}

describe('nextOccurrence', () => {
  const now = new Date(2026, 7, 25, 12, 0) // Tuesday, after a 09:00 reminder

  it('returns the moment itself when it has not passed', () => {
    const next = nextOccurrence(reminder({ dueAt: at(2026, 8, 25, 18) }), now)
    expect(next?.getHours()).toBe(18)
    expect(next?.getDate()).toBe(25)
  })

  it('leaves a passed one-off in the past rather than inventing a repeat', () => {
    const next = nextOccurrence(reminder(), now)
    expect(next?.getDate()).toBe(25)
    expect(next?.getTime()).toBeLessThan(now.getTime())
  })

  it('rolls a daily reminder to tomorrow', () => {
    const next = nextOccurrence(reminder({ recurrenceRule: 'DAILY' }), now)
    expect(next?.getDate()).toBe(26)
    expect(next?.getHours()).toBe(9)
  })

  it('skips the weekend for a weekday reminder', () => {
    const friday = new Date(2026, 7, 28, 12, 0)
    const next = nextOccurrence(reminder({ dueAt: at(2026, 8, 28, 9), recurrenceRule: 'WEEKDAYS' }), friday)
    expect(next?.getDay()).toBe(1) // Monday
    expect(next?.getDate()).toBe(31)
  })

  it('moves a weekly reminder seven days on, same weekday', () => {
    const next = nextOccurrence(reminder({ recurrenceRule: 'WEEKLY' }), now)
    expect(next?.getDate()).toBe(new Date(2026, 8, 1).getDate())
    expect(next?.getDay()).toBe(2) // still a Tuesday
  })

  it('moves a monthly reminder to the next month', () => {
    const next = nextOccurrence(reminder({ recurrenceRule: 'MONTHLY' }), now)
    expect(next?.getMonth()).toBe(8) // September
    expect(next?.getDate()).toBe(25)
  })

  it('has no answer for a reminder with no time', () => {
    expect(nextOccurrence(reminder({ dueAt: undefined }), now)).toBeNull()
  })
})

describe('alertMomentsOf', () => {
  it('fires at the lead-in and again when due', () => {
    const moments = alertMomentsOf(reminder({ dueAt: at(2026, 8, 25, 9), offsetMinutes: 15 }))
    expect(moments.map((moment) => moment.kind)).toEqual(['lead', 'due'])
    expect(moments[1].at.getTime() - moments[0].at.getTime()).toBe(15 * 60 * 1000)
  })

  it('fires once when there is no lead-in', () => {
    const moments = alertMomentsOf(reminder({ offsetMinutes: 0 }))
    expect(moments.map((moment) => moment.kind)).toEqual(['due'])
  })
})

describe('formatCountdown', () => {
  const now = new Date(2026, 7, 25, 12, 0).getTime()
  const inMs = (ms: number) => new Date(now + ms)

  it('counts hours, minutes and seconds under a day', () => {
    expect(formatCountdown(inMs(2 * 3600_000 + 5 * 60_000 + 9_000), now).text).toBe('02:05:09')
  })

  it('switches to days beyond a day', () => {
    expect(formatCountdown(inMs(50 * 3600_000), now).text).toMatch(/2d/)
  })

  it('marks the last few minutes as imminent', () => {
    expect(formatCountdown(inMs(4 * 60_000), now).imminent).toBe(true)
    expect(formatCountdown(inMs(60 * 60_000), now).imminent).toBe(false)
  })

  it('knows when the moment has gone', () => {
    expect(formatCountdown(inMs(-60_000), now).past).toBe(true)
  })
})

describe('filters and ordering', () => {
  const now = new Date(2026, 7, 25, 12, 0)

  it('sorts by when each one next fires', () => {
    const list = [
      reminder({ id: 'late', dueAt: at(2026, 8, 27, 9) }),
      reminder({ id: 'soon', dueAt: at(2026, 8, 25, 18) }),
      reminder({ id: 'later', dueAt: at(2026, 8, 26, 9) }),
    ]
    expect(sortByDue(list, now).map((item) => item.id)).toEqual(['soon', 'later', 'late'])
  })

  it.each([
    ['today', at(2026, 8, 25, 18), true],
    ['today', at(2026, 8, 27, 9), false],
    ['upcoming', at(2026, 8, 27, 9), true],
    ['past', at(2026, 8, 24, 9), true],
  ])('%s matches %s → %s', (filter, dueAt, expected) => {
    expect(matchesFilter(reminder({ dueAt }), filter as never, now)).toBe(expected)
  })

  it('treats a repeating reminder as repeating whenever it fires', () => {
    expect(matchesFilter(reminder({ recurrenceRule: 'DAILY' }), 'repeating', now)).toBe(true)
  })
})
