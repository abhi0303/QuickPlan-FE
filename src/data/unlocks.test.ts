import { describe, expect, it } from 'vitest'
import { isUnlocked, nextUnlock, UNLOCKS, unlocksAt } from './unlocks'

describe('the reward ladder', () => {
  it('is ordered by level, which the roadmap dialog relies on', () => {
    const levels = UNLOCKS.map((unlock) => unlock.level)
    expect(levels).toEqual([...levels].sort((a, b) => a - b))
  })

  it('has no two rewards on the same level', () => {
    const levels = UNLOCKS.map((unlock) => unlock.level)
    expect(new Set(levels).size).toBe(levels.length)
  })
})

describe('isUnlocked', () => {
  it.each([
    [2, false],
    [3, true],   // the boundary: earned *at* the level, not after it
    [4, true],
  ])('level %s → %s', (level, expected) => {
    expect(isUnlocked('CALENDAR_ADD', level)).toBe(expected)
  })

  it('is locked while the level is still unknown', () => {
    // gamification has not loaded yet; showing nothing beats flashing it away
    expect(isUnlocked('CALENDAR_ADD', undefined)).toBe(false)
  })

  it('does not gate an id it has never heard of', () => {
    // a perk removed from the catalogue should not silently disable its feature
    expect(isUnlocked('NOT_A_REWARD' as never, 1)).toBe(true)
  })
})

describe('what a level opens', () => {
  it('names the reward that arrives exactly at that level', () => {
    expect(unlocksAt(3).map((unlock) => unlock.id)).toEqual(['CALENDAR_ADD'])
  })

  it('names nothing for a level in between', () => {
    expect(unlocksAt(4)).toEqual([])
  })

  it('points at the next one still ahead', () => {
    expect(nextUnlock(3)?.level).toBe(5)
    expect(nextUnlock(4)?.level).toBe(5)
  })

  it('runs out at the top of the ladder', () => {
    expect(nextUnlock(100)).toBeNull()
  })
})
