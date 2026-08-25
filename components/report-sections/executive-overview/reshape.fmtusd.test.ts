import { describe, it, expect } from 'vitest'
import { fmtUsd } from './reshape'

describe('fmtUsd', () => {
  it('formats whole dollars with a thousands separator and no cents', () => {
    expect(fmtUsd(1234567)).toBe('$1,234,567')
  })

  it('rounds rather than truncating', () => {
    expect(fmtUsd(1234.6)).toBe('$1,235')
  })

  it('formats zero as $0, which is a real value here', () => {
    expect(fmtUsd(0)).toBe('$0')
  })

  it('returns the null glyph for null and undefined, matching fmtNum', () => {
    expect(fmtUsd(null)).toBe('—')
    expect(fmtUsd(undefined)).toBe('—')
  })

  it('formats a negative amount, which closed-won can genuinely be (credits, refunds)', () => {
    expect(fmtUsd(-5000)).toBe('-$5,000')
  })
})
