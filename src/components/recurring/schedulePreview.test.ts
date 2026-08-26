import { describe, expect, it } from 'vitest'
import { format } from 'date-fns'
import { nextRuns } from './schedulePreview'

/**
 * These dates are what the form promises the user. If they disagree with the
 * scheduler, the form is lying — so the awkward cases are pinned here.
 */

const TODAY = new Date(2026, 7, 26, 10)
const on = (runs: Date[]) => runs.map((run) => format(run, 'd MMM yyyy'))

describe('monthly', () => {
  it('starts at the next matching day when this month has already passed it', () => {
    expect(on(nextRuns({ cadence: 'MONTHLY', dayOfMonth: 5 }, 3, TODAY)))
      .toEqual(['5 Sep 2026', '5 Oct 2026', '5 Nov 2026'])
  })

  it('uses this month when the day is still ahead', () => {
    expect(on(nextRuns({ cadence: 'MONTHLY', dayOfMonth: 30 }, 2, TODAY)))
      .toEqual(['30 Aug 2026', '30 Sep 2026'])
  })

  it('skips a month at a time when the interval is two', () => {
    expect(on(nextRuns({ cadence: 'MONTHLY', dayOfMonth: 5, interval: 2 }, 4, TODAY)))
      .toEqual(['5 Sep 2026', '5 Nov 2026', '5 Jan 2027', '5 Mar 2027'])
  })

  /*
   * The trap. A schedule on the 31st falls on 28 February — and must then go
   * back to the 31st, not carry the 28th forward for the rest of its life.
   */
  it('clamps a short month without re-anchoring the series', () => {
    const runs = nextRuns(
      { cadence: 'MONTHLY', dayOfMonth: 31, startsOn: new Date(2026, 11, 31) },
      4, new Date(2026, 11, 1),
    )
    expect(on(runs)).toEqual(['31 Dec 2026', '31 Jan 2027', '28 Feb 2027', '31 Mar 2027'])
  })

  /*
   * The case the entry-month picker exists for: paid on 5 August, so the
   * series is August/October/December. August is behind us and still decides
   * that the next one is October — restarting from today would give September
   * and quietly invert the whole schedule.
   */
  it('keeps the phase of an anchor that has already passed', () => {
    const runs = nextRuns(
      { cadence: 'MONTHLY', dayOfMonth: 5, interval: 2, startsOn: new Date(2026, 7, 5) },
      3, TODAY,
    )
    expect(on(runs)).toEqual(['5 Oct 2026', '5 Dec 2026', '5 Feb 2027'])
  })

  it('does not list a run that has already happened', () => {
    const runs = nextRuns({ cadence: 'MONTHLY', dayOfMonth: 5, startsOn: new Date(2026, 5, 5) }, 2, TODAY)
    expect(on(runs)).toEqual(['5 Sep 2026', '5 Oct 2026'])
  })

  it('starts from the anchor when one is given, not from today', () => {
    expect(on(nextRuns({ cadence: 'MONTHLY', dayOfMonth: 5, startsOn: new Date(2027, 0, 2) }, 2, TODAY)))
      .toEqual(['5 Jan 2027', '5 Feb 2027'])
  })
})

describe('weekly', () => {
  it('finds the next matching weekday, then steps a week', () => {
    // the 26th is a Wednesday; weekday 1 is Monday
    expect(on(nextRuns({ cadence: 'WEEKLY', weekday: 1 }, 3, TODAY)))
      .toEqual(['31 Aug 2026', '7 Sep 2026', '14 Sep 2026'])
  })

  it('is fortnightly at an interval of two', () => {
    expect(on(nextRuns({ cadence: 'WEEKLY', weekday: 1, interval: 2 }, 3, TODAY)))
      .toEqual(['31 Aug 2026', '14 Sep 2026', '28 Sep 2026'])
  })
})

describe('daily and yearly', () => {
  it('counts days, every one or every other', () => {
    expect(on(nextRuns({ cadence: 'DAILY' }, 3, TODAY))).toEqual(['26 Aug 2026', '27 Aug 2026', '28 Aug 2026'])
    expect(on(nextRuns({ cadence: 'DAILY', interval: 2 }, 3, TODAY)))
      .toEqual(['26 Aug 2026', '28 Aug 2026', '30 Aug 2026'])
  })

  it('counts years from the anchor', () => {
    expect(on(nextRuns({ cadence: 'YEARLY', startsOn: new Date(2026, 8, 15) }, 3, TODAY)))
      .toEqual(['15 Sep 2026', '15 Sep 2027', '15 Sep 2028'])
  })
})

describe('stopping', () => {
  it('returns fewer dates rather than running past the end', () => {
    const runs = nextRuns(
      { cadence: 'MONTHLY', dayOfMonth: 5, endsOn: new Date(2026, 10, 1) }, 5, TODAY,
    )
    expect(on(runs)).toEqual(['5 Sep 2026', '5 Oct 2026'])
  })

  it('returns nothing at all when the end is before the first run', () => {
    expect(nextRuns({ cadence: 'MONTHLY', dayOfMonth: 5, endsOn: new Date(2026, 7, 1) }, 5, TODAY)).toEqual([])
  })
})
