import { describe, it, expect, vi } from 'vitest'
import { toNumber, toBool, parseBool } from './num'

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

describe('toBool vocabulary', () => {
  it.each([
    ['Yes', true], ['yes', true], ['Y', true], [' YES ', true],
    ['No', false], ['no', false], ['N', false], [' no ', false],
  ])('resolves %s without warning', (input, expected) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(toBool(input, 'opportunity_is_closed')).toBe(expected)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('still warns and fails closed on a value it does not recognise', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(toBool('Closed', 'opportunity_is_closed')).toBe(true)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('opportunity_is_closed'),
      'Closed',
    )
    warn.mockRestore()
  })
})

describe('parseBool', () => {
  it('returns undefined for an unrecognised value, so callers can count it', () => {
    expect(parseBool('Closed')).toBeUndefined()
    expect(parseBool('')).toBeUndefined()
    expect(parseBool(null)).toBeUndefined()
  })

  it('resolves every recognised shape', () => {
    expect(parseBool(true)).toBe(true)
    expect(parseBool(0)).toBe(false)
    expect(parseBool('TRUE')).toBe(true)
    expect(parseBool('no')).toBe(false)
  })
})
