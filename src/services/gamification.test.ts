import { describe, expect, it } from 'vitest'
import { describeMission, rankIconUrl, rankTier } from './gamification'
import type { Mission, MissionCatalogue } from './gamification'

const mission = (over: Partial<Mission> = {}): Mission => ({
  id: 'm1',
  type: 'EXPENSE_COUNT',
  target: 5,
  progress: 0,
  status: 'ACTIVE',
  xp: 100,
  createdAt: '2026-08-25T00:00:00.000Z',
  expiresAt: '2026-08-27T00:00:00.000Z',
  ...over,
})

const catalogue: MissionCatalogue = {
  xpPerMission: 100,
  missionsPerCycle: 3,
  cycleDurationDays: 2,
  missions: [
    { type: 'EXPENSE_COUNT', target: 3, xp: 100, area: 'EXPENSE', title: 'Log Your Spending', description: 'Add 3 expenses' },
    { type: 'EXPENSE_COUNT', target: 5, xp: 100, area: 'EXPENSE', title: 'Track Your Spending', description: 'Add 5 expenses' },
    { type: 'TASK_COUNT', target: 3, xp: 100, area: 'TASK', title: 'Get Things Done', description: 'Create 3 tasks' },
  ],
}

describe('describeMission', () => {
  // the catalogue holds several variants per type, so type alone is not enough
  it('matches on type and target together', () => {
    expect(describeMission(mission({ target: 5 }), catalogue).title).toBe('Track Your Spending')
    expect(describeMission(mission({ target: 3 }), catalogue).title).toBe('Log Your Spending')
  })

  it('falls back to the same type when the target is unknown', () => {
    const described = describeMission(mission({ target: 8 }), catalogue)
    expect(described.area).toBe('EXPENSE')
    expect(described.title).toBe('Log Your Spending')
  })

  it('still renders a mission type the client has never seen', () => {
    const described = describeMission(mission({ type: 'REMINDER_STREAK', target: 4 }), catalogue)
    expect(described.title).toBe('Mission')
    expect(described.description).toContain('4')
    expect(described.area).toBe('REMINDER')
  })

  it('survives the catalogue failing to load', () => {
    expect(describeMission(mission(), null).title).toBe('Mission')
  })
})

describe('rank art', () => {
  it.each([
    [1, 'level-001.svg'],
    [25, 'level-025.svg'],
    [100, 'level-100.svg'],
  ])('level %s uses %s', (level, file) => {
    expect(rankIconUrl(level)).toContain(file)
  })

  it('clamps a level outside the ladder rather than 404ing', () => {
    expect(rankIconUrl(0)).toContain('level-001.svg')
    expect(rankIconUrl(150)).toContain('level-100.svg')
  })

  it.each([
    [1, 'beginner'], [20, 'beginner'],
    [21, 'saving'], [40, 'saving'],
    [41, 'growth'], [60, 'growth'],
    [61, 'mastery'], [80, 'mastery'],
    [81, 'legendary'], [99, 'legendary'],
    [100, 'ultimate'],
  ])('level %s is in the %s tier', (level, tier) => {
    expect(rankTier(level)).toBe(tier)
  })
})
