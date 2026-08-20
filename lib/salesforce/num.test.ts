import { describe, it, expect, vi } from 'vitest'
import { toNumber } from './num'

describe('toNumber missing-value handling', () => {
  it.each([['empty string', ''], ['null', null], ['whitespace', '   ']])(
    'treats %s as a warned missing value, not a silent zero',
    (_label, input) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(toNumber(input, 'opportunity_amount')).toBe(0)
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('opportunity_amount'),
        input,
      )
      warn.mockRestore()
    },
  )

  it('does not warn on a real zero', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(toNumber('0', 'opportunity_amount')).toBe(0)
    expect(toNumber(0, 'opportunity_amount')).toBe(0)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('parses a padded number without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(toNumber('  42 ', 'opportunity_count')).toBe(42)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
