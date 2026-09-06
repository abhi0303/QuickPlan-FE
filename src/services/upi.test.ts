import { describe, expect, it } from 'vitest'
import { afterEach, vi } from 'vitest'
import { buildAppLink, buildUpiLink, isValidUpiId, normalizeUpiId, upiLaunchMode } from './upi'

describe('isValidUpiId', () => {
  it('accepts the shapes providers actually issue', () => {
    expect(isValidUpiId('rishi@okhdfcbank')).toBe(true)
    expect(isValidUpiId('9871234567@ybl')).toBe(true)
    expect(isValidUpiId('abhi.sharma-1@oksbi')).toBe(true)
  })

  it('rejects anything that is not an address', () => {
    expect(isValidUpiId('rishi')).toBe(false)
    expect(isValidUpiId('@okhdfcbank')).toBe(false)
    expect(isValidUpiId('rishi@')).toBe(false)
    expect(isValidUpiId('rishi@@okhdfcbank')).toBe(false)
    expect(isValidUpiId('rishi okhdfcbank')).toBe(false)
  })

  it('ignores surrounding whitespace, which pasting brings along', () => {
    expect(isValidUpiId('  rishi@okhdfcbank ')).toBe(true)
  })
})

describe('buildUpiLink', () => {
  it('carries payee, amount and currency', () => {
    const link = buildUpiLink({ vpa: 'rishi@okhdfcbank', name: 'Rishi', amount: 1000 })
    expect(link).toBe('upi://pay?pa=rishi%40okhdfcbank&pn=Rishi&am=1000.00&cu=INR')
  })

  it('always sends two decimals, so 1000 is not read as ten rupees', () => {
    expect(buildUpiLink({ vpa: 'a@b', amount: 1000 })).toContain('am=1000.00')
    expect(buildUpiLink({ vpa: 'a@b', amount: 99.5 })).toContain('am=99.50')
  })

  it('encodes a space as %20 rather than +', () => {
    const link = buildUpiLink({ vpa: 'a@b', amount: 10, note: 'Dinner split' })
    expect(link).toContain('tn=Dinner%20split')
    expect(link).not.toContain('+')
  })

  it('truncates a long note instead of letting the app cut it', () => {
    const link = buildUpiLink({ vpa: 'a@b', amount: 10, note: 'x'.repeat(80) })
    expect(link).toContain(`tn=${'x'.repeat(50)}&`.replace('&', ''))
    expect(link).not.toContain('x'.repeat(51))
  })

  it('omits a transaction reference, which a retry would repeat', () => {
    expect(buildUpiLink({ vpa: 'a@b', amount: 10 })).not.toContain('tr=')
  })

  it('lower-cases the address, since UPI handles are case-insensitive', () => {
    expect(buildUpiLink({ vpa: 'Rishi@OKHDFCBank', amount: 10 })).toContain('pa=rishi%40okhdfcbank')
  })

  it('leaves out an empty name or note rather than sending blanks', () => {
    const link = buildUpiLink({ vpa: 'a@b', name: '  ', amount: 10, note: '  ' })
    expect(link).not.toContain('pn=')
    expect(link).not.toContain('tn=')
  })
})

describe('buildAppLink', () => {
  it('keeps every parameter, swapping only the scheme iOS needs', () => {
    const input = { vpa: 'rishi@okhdfcbank', name: 'Rishi', amount: 250 }
    expect(buildAppLink('phonepe://pay?', input))
      .toBe('phonepe://pay?pa=rishi%40okhdfcbank&pn=Rishi&am=250.00&cu=INR')
  })
})

describe('normalizeUpiId', () => {
  it('is what gets stored, so the same address is never remembered twice', () => {
    expect(normalizeUpiId(' Rishi@OkHdfcBank ')).toBe('rishi@okhdfcbank')
  })
})

describe('upiLaunchMode', () => {
  function pretend(userAgent: string, maxTouchPoints = 0) {
    vi.stubGlobal('navigator', { userAgent, maxTouchPoints })
  }

  afterEach(() => { vi.unstubAllGlobals() })

  it('lets Android resolve the link into its own chooser', () => {
    pretend('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36')
    expect(upiLaunchMode()).toBe('chooser')
  })

  it('names the apps on an iPhone, which has no resolver', () => {
    pretend('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15')
    expect(upiLaunchMode()).toBe('apps')
  })

  it('catches an iPad pretending to be a Mac', () => {
    pretend('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5)
    expect(upiLaunchMode()).toBe('apps')
  })

  it('offers no button on a desktop, where the scheme has no handler at all', () => {
    pretend('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140')
    expect(upiLaunchMode()).toBe('none')
  })
})
