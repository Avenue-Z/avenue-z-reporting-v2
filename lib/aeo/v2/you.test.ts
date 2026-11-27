import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveYou } from './you'

afterEach(() => vi.restoreAllMocks())

describe('resolveYou', () => {
  it('own flag wins', () => {
    expect(resolveYou([{ name: 'A', isOwn: false }, { name: 'B', isOwn: true }], '')).toBe('B')
  })
  it('matches the exact name, ignoring case and whitespace, without an own flag', () => {
    expect(resolveYou([{ name: 'Guardian', isOwn: false }, { name: 'Renaissance', isOwn: false }], '  renaissance ')).toBe('Renaissance')
  })
  it('never matches by substring', () => {
    expect(resolveYou([{ name: 'Allstate', isOwn: false }, { name: 'Allstate Benefits', isOwn: false }], 'Allstate')).toBe('Allstate')
    expect(resolveYou([{ name: 'Allstate Benefits', isOwn: false }], 'Allstate')).toBeNull()
  })
  it('warns and takes the first of several matches', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveYou([{ name: 'A', isOwn: true }, { name: 'B', isOwn: true }], '')).toBe('A')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('[aeo-v2] several brands match the client: A, B; using A')
  })
  it('does not double count a brand that is own and name-matched', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveYou([{ name: 'A', isOwn: true }], 'a')).toBe('A')
    expect(warn).not.toHaveBeenCalled()
  })
  it('is null with no match, or an empty yourBrand and no own brand', () => {
    expect(resolveYou([{ name: 'A', isOwn: false }], 'Z')).toBeNull()
    expect(resolveYou([{ name: 'A', isOwn: false }], '')).toBeNull()
    expect(resolveYou([{ name: 'A', isOwn: false }], '   ')).toBeNull()
  })
})
