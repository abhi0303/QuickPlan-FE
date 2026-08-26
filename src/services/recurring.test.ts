import { describe, expect, it } from 'vitest'
import { byNextRun } from './recurring'
import type { Recurring } from './recurring'

const item = (id: string, nextRunAt: string, pausedAt?: string): Recurring => ({
  id,
  scope: 'PERSONAL',
  title: id,
  amount: 100,
  cadence: 'MONTHLY',
  nextRunAt,
  pausedAt: pausedAt ?? null,
})

/**
 * The list is really answering "what is about to come out of my account", so
 * the order is the feature.
 */
describe('recurring order', () => {
  it('puts the soonest run first', () => {
    const rows = [
      item('later', '2026-09-15T00:00:00.000Z'),
      item('soon', '2026-08-27T00:00:00.000Z'),
      item('middle', '2026-09-01T00:00:00.000Z'),
    ]
    expect(rows.sort(byNextRun).map((row) => row.id)).toEqual(['soon', 'middle', 'later'])
  })

  // paused is a state, not a deletion: still listed, just not imminent
  it('sinks paused schedules below every active one, however soon they were due', () => {
    const rows = [
      item('paused-tomorrow', '2026-08-27T00:00:00.000Z', '2026-08-20T00:00:00.000Z'),
      item('active-next-year', '2027-01-01T00:00:00.000Z'),
    ]
    expect(rows.sort(byNextRun).map((row) => row.id)).toEqual(['active-next-year', 'paused-tomorrow'])
  })

  it('falls back to the title so the order does not shuffle between renders', () => {
    const rows = [
      item('Netflix', '2026-09-01T00:00:00.000Z'),
      item('Gym', '2026-09-01T00:00:00.000Z'),
    ]
    expect(rows.sort(byNextRun).map((row) => row.id)).toEqual(['Gym', 'Netflix'])
  })

  it('does not throw the list into a random order when a date will not parse', () => {
    const rows = [item('broken', 'not-a-date'), item('fine', '2026-09-01T00:00:00.000Z')]
    expect(rows.sort(byNextRun)).toHaveLength(2)
  })
})
