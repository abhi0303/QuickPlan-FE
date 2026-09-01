import { describe, expect, it } from 'vitest'
import { sharePercent } from './share'

describe('sharePercent', () => {
  it.each([
    [57, '57%'],
    [0.29, '<1%'],
    [0.996, '<1%'],
    [99.6, '>99%'],
    [100, '100%'],
    [0, '0%'],
  ])('%s → %s', (share, expected) => {
    expect(sharePercent(share)).toBe(expected)
  })

  /*
   * The bug this exists for: a category holding real money reported 0%, because
   * a fraction of a percent rounds to none of it.
   */
  it('never reports a share with money behind it as nothing', () => {
    expect(sharePercent((130 / 44129) * 100)).toBe('<1%')
  })

  it('does not round a category up to the whole total', () => {
    expect(sharePercent((44000 / 44129) * 100)).toBe('>99%')
  })

  it('survives a total of zero rather than rendering NaN', () => {
    expect(sharePercent(Number.NaN)).toBe('0%')
  })
})
