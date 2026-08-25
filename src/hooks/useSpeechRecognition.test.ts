import { describe, expect, it } from 'vitest'
import { mergeTranscripts } from './useSpeechRecognition'

/**
 * Android re-processes buffered audio when a recognition session restarts, so
 * one utterance can arrive as "set", "set an", "set an alarm". Concatenating
 * those gave "set an alarm set an alarm" — the bug this function exists for.
 */
describe('mergeTranscripts', () => {
  it.each([
    ['set an', 'set an alarm', 'set an alarm'],
    ['set an alarm', 'set an alarm', 'set an alarm'],
    ['remind me to call', 'to call Rahul', 'remind me to call Rahul'],
    ['call Rahul', 'tomorrow at 5', 'call Rahul tomorrow at 5'],
    ['', 'hello', 'hello'],
    ['hello', '', 'hello'],
  ])('%s + %s → %s', (carry, next, expected) => {
    expect(mergeTranscripts(carry, next)).toBe(expected)
  })

  it('matches the overlap regardless of case or punctuation', () => {
    expect(mergeTranscripts('Set an alarm.', 'set an alarm for 6')).toBe('Set an alarm. for 6')
  })

  it('keeps both halves when nothing overlaps', () => {
    expect(mergeTranscripts('buy milk', 'and eggs')).toBe('buy milk and eggs')
  })
})
