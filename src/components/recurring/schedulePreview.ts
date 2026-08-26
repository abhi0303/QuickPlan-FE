import { addDays, addMonths, addWeeks, addYears, getDaysInMonth, isAfter, isBefore, setDate, startOfDay } from 'date-fns'
import type { Cadence } from '../../services/recurring'

/**
 * The next few dates a schedule will actually fire on.
 *
 * A form can describe a rule — "every month, on the 5th, every other one" — and
 * still leave somebody unsure which months are in and which are out. Dates
 * cannot be misread. So the form shows them.
 *
 * Pure, and mirrors the scheduler's rules rather than approximating them:
 * counted from the anchor, clamped to short months, stopped at `endsOn`. When
 * the API grows `interval` (see docs/recurring-interval.md) this already
 * handles it, including which occurrences get skipped.
 */

export type ScheduleShape = {
  cadence: Cadence
  /** MONTHLY. Clamped to the last day in shorter months. */
  dayOfMonth?: number
  /** WEEKLY. 0 is Sunday. */
  weekday?: number
  /** The first run, and the origin every later one is counted from. */
  startsOn?: Date | null
  endsOn?: Date | null
  /** Every `interval` × cadence. 1 is every one. */
  interval?: number
}

/** The `dayOfMonth`th of this date's month, or its last day if it is shorter. */
function clampedDay(month: Date, dayOfMonth: number) {
  return setDate(month, Math.min(dayOfMonth, getDaysInMonth(month)))
}

/**
 * Occurrences are counted from the anchor, and an anchor may be in the past.
 *
 * "I paid in August, so it runs August, October, December" is the whole point
 * of choosing an entry month: August is gone, and it is still what decides
 * that the next one is October rather than September. So the series is walked
 * forward from the anchor and the dates that have already been are dropped —
 * never restarted from today, which would silently re-phase it.
 */
export function nextRuns(shape: ScheduleShape, count = 5, today = new Date()): Date[] {
  const { cadence, endsOn } = shape
  const interval = Math.max(1, Math.round(shape.interval ?? 1))
  const floor = startOfDay(today)

  let cursor = shape.startsOn
    ? firstRun(shape, startOfDay(shape.startsOn), today)
    : firstRun(shape, floor, today)

  // a far-past anchor with a long interval still converges quickly; the cap is
  // only here so a nonsensical shape cannot spin
  for (let guard = 0; cursor && isBefore(startOfDay(cursor), floor) && guard < 5000; guard += 1) {
    cursor = advance(cursor, cadence, interval, shape)
  }

  const runs: Date[] = []
  for (let i = 0; i < count; i += 1) {
    if (!cursor) break
    if (endsOn && isAfter(startOfDay(cursor), startOfDay(endsOn))) break
    runs.push(cursor)
    cursor = advance(cursor, cadence, interval, shape)
  }

  return runs
}

function firstRun(shape: ScheduleShape, from: Date, today: Date): Date | null {
  const { cadence, dayOfMonth, weekday } = shape

  if (cadence === 'MONTHLY') {
    const day = dayOfMonth && dayOfMonth >= 1 ? dayOfMonth : from.getDate()
    const thisMonth = clampedDay(from, day)
    // the day may already have passed in the starting month
    return isBefore(startOfDay(thisMonth), startOfDay(from))
      ? clampedDay(addMonths(from, 1), day)
      : thisMonth
  }

  if (cadence === 'WEEKLY') {
    const target = weekday ?? from.getDay()
    const ahead = (target - from.getDay() + 7) % 7
    return addDays(from, ahead)
  }

  // daily and yearly both simply begin where they are told to
  void today
  return from
}

function advance(current: Date, cadence: Cadence, interval: number, shape: ScheduleShape): Date {
  if (cadence === 'DAILY') return addDays(current, interval)
  if (cadence === 'WEEKLY') return addWeeks(current, interval)
  if (cadence === 'YEARLY') return addYears(current, interval)

  /*
   * Clamping must not re-anchor the series: a schedule on the 31st that lands
   * on 28 February is still "the 31st", so the month after is the 31st again
   * and not the 28th. Stepping from the requested day rather than from the
   * clamped one is what keeps that true.
   */
  const day = shape.dayOfMonth && shape.dayOfMonth >= 1 ? shape.dayOfMonth : current.getDate()
  return clampedDay(addMonths(setDate(current, 1), interval), day)
}
