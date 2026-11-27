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
    vi.spyOn(console, 'warn').mockImplementation(() => {})
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
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveYou([{ name: 'A', isOwn: false }], 'Z')).toBeNull()
    expect(resolveYou([{ name: 'A', isOwn: false }], '')).toBeNull()
    expect(resolveYou([{ name: 'A', isOwn: false }], '   ')).toBeNull()
  })
  // Final review I3 (security): a configured brand name is the only authority; the own flag is used only without one.
  it('with a configured name, ignores the own flag and warns when no brand has that name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveYou([{ name: 'Avenue Z', isOwn: true }, { name: 'iPullRank', isOwn: false }], ' Rank ')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toBe('[aeo-v2] no tracked brand is named "Rank"')
  })
  it('with a configured name, picks the exact match over an own-flag brand', () => {
    expect(resolveYou([{ name: 'Other', isOwn: true }, { name: 'Renaissance', isOwn: false }], 'renaissance')).toBe('Renaissance')
  })
  it('with a configured name, takes the first of several exact matches and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveYou([{ name: 'Acme', isOwn: false }, { name: ' acme ', isOwn: true }], 'ACME')).toBe('Acme')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('[aeo-v2] several brands match the client: Acme,  acme ; using Acme')
  })
})
