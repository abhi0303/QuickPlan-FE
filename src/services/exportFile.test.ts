import { describe, expect, it } from 'vitest'
import { slug, toCsv } from './exportFile'

/**
 * A CSV is read by a spreadsheet, not by us, so the rules that matter are the
 * ones that decide whether a file opens correctly at all: quoting, the byte
 * order mark, CRLF, and not handing Excel something it will run as a formula.
 */
describe('toCsv', () => {
  it('starts with a BOM so a rupee sign survives Excel', () => {
    expect(toCsv([['a']]).charCodeAt(0)).toBe(0xfeff)
  })

  it('ends every row with CRLF', () => {
    expect(toCsv([['a'], ['b']])).toBe('\ufeffa\r\nb\r\n')
  })

  it.each([
    ['plain', 'plain'],
    ['Pay rent, then call Amit', '"Pay rent, then call Amit"'],
    ['He said "hi"', '"He said ""hi"""'],
    ['line one\nline two', '"line one\nline two"'],
    ['semi; colon', 'semi; colon'],
  ])('quotes %s only when it has to', (input, expected) => {
    expect(toCsv([[input]])).toBe(`\ufeff${expected}\r\n`)
  })

  it.each(['=2+2', '+1', '-1', '@cmd'])('defuses %s, which Excel would run', (input) => {
    expect(toCsv([[input]])).toContain(`'${input}`)
  })

  it('writes empty cells for null and undefined', () => {
    expect(toCsv([[null, undefined, 0]])).toBe('\ufeff,,0\r\n')
  })
})

describe('slug', () => {
  it.each([
    ['Goa Trip', 'goa-trip'],
    ['  Flat  Rent  ', 'flat-rent'],
    ['Bala & Co.', 'bala-co'],
    ['!!!', 'export'],
    ['', 'export'],
  ])('%s → %s', (input, expected) => {
    expect(slug(input)).toBe(expected)
  })
})
