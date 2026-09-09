import { describe, expect, it } from 'vitest'
import { CURRENT_TERMS_VERSION, needsReacceptance } from './legal'

describe('needsReacceptance', () => {
  it('is false only for the exact current version', () => {
    expect(needsReacceptance(CURRENT_TERMS_VERSION)).toBe(false)
  })

  it('catches everyone backfilled as legacy', () => {
    expect(needsReacceptance('legacy')).toBe(true)
  })

  it('catches an older published version', () => {
    expect(needsReacceptance('2026-01-01')).toBe(true)
  })

  /* A profile that predates the column, or an API that has not been asked yet:
     both mean "we do not know that they agreed", which is the same as no. */
  it('treats absent as not accepted', () => {
    expect(needsReacceptance(null)).toBe(true)
    expect(needsReacceptance(undefined)).toBe(true)
    expect(needsReacceptance('')).toBe(true)
  })
})
