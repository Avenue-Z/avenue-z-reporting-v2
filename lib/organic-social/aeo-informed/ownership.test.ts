// lib/organic-social/aeo-informed/ownership.test.ts
import { describe, it, expect } from 'vitest'
import { ownerOf, normalizeName, buildBrandChannels } from './ownership'
import type { BrandChannels } from './ownership'

const ren: BrandChannels = { id: 'b_own', name: 'Example', isOwn: true, platforms: ['linkedin', 'instagram', 'youtube'] }
const globex: BrandChannels = { id: 'b_globex', name: 'Globex', isOwn: false, platforms: ['linkedin'] }
const acme: BrandChannels = { id: 'b_a', name: 'Acme', isOwn: false, platforms: ['linkedin', 'youtube', 'instagram'] }
const acmeLife: BrandChannels = { id: 'b_al', name: 'Acme Life Insurance', isOwn: false, platforms: ['youtube'] }
const U = (url: string, channelTitle: string | null = null) => ({ url, channelTitle })
const LI = 'https://www.linkedin.com/pulse/some-article'

describe('normalizeName', () => {
  it('lowercases, turns every run of punctuation into one space, and trims', () => {
    expect(normalizeName('  Example Life & Health  ')).toBe('example life health')
  })
})

describe('names that are not plain ASCII', () => {
  it('keeps letters and digits from any alphabet when normalizing', () => {
    expect(normalizeName('Ärzte & Co')).toBe('ärzte co')
    expect(normalizeName('株式会社 Example')).toBe('株式会社 example')
  })
  it('a brand named in another alphabet can own a channel', () => {
    const jp: BrandChannels = { id: 'b_jp', name: '株式会社', isOwn: false, platforms: ['linkedin'] }
    expect(ownerOf({ url: 'https://www.linkedin.com/company/x', channelTitle: '株式会社 Example' }, [jp])).toBe('b_jp')
  })
})

describe('ownerOf: the channel title, on a platform the brand registered', () => {
  it('matches a title that starts with the brand name at a word boundary', () => {
    expect(ownerOf(U(LI, 'Example Co Insurance Group'), [ren, globex])).toBe('b_own')
  })
  it('matches a title that is exactly the brand name', () => {
    expect(ownerOf(U('https://www.instagram.com/p/abc', 'Example'), [ren])).toBe('b_own')
  })
  it('does not match a longer word that merely starts with the name', () => {
    expect(ownerOf(U(LI, 'Exampler Co'), [ren])).toBeNull()
  })
  it('does not match when the name is not at the start', () => {
    expect(ownerOf(U(LI, 'Not Example'), [ren])).toBeNull()
  })
  it('a row with no channel title has no owner, even if its URL carries the brand handle (Peec attributes by channel)', () => {
    expect(ownerOf(U('https://www.linkedin.com/posts/examplebenefits_x', null), [ren])).toBeNull()
    expect(ownerOf(U(LI, null), [ren])).toBeNull()
  })
  it('the brand must have registered a channel on that URL\'s platform', () => {
    expect(ownerOf(U('https://www.youtube.com/watch?v=a', 'Globex'), [globex])).toBeNull()
    expect(ownerOf(U(LI, 'Globex'), [globex])).toBe('b_globex')
  })
  it('a URL on a host that is not a social platform has no owner', () => {
    expect(ownerOf(U('https://example.com/x', 'Example'), [ren])).toBeNull()
  })
  it('the longer matching brand name wins when both are registered on the platform', () => {
    const both: BrandChannels = { ...acmeLife, platforms: ['youtube'] }
    expect(ownerOf(U('https://www.youtube.com/watch?v=a', 'Acme Life Insurance Limited'), [acme, both])).toBe('b_al')
  })
  it('only brands registered on the platform compete: a longer name registered elsewhere does not win', () => {
    expect(ownerOf(U('https://www.youtube.com/watch?v=a', 'Acme Life Insurance Limited'), [acme, { ...acmeLife, platforms: ['linkedin'] }])).toBe('b_a')
  })
  it('two different brands with the same normalized name tie, so there is no owner', () => {
    const a: BrandChannels = { id: 'a', name: 'Acme', isOwn: false, platforms: ['linkedin'] }
    const b: BrandChannels = { id: 'b', name: 'ACME', isOwn: false, platforms: ['linkedin'] }
    expect(ownerOf(U(LI, 'Acme Corp'), [a, b])).toBeNull()
  })
  it('a brand with an empty name never matches', () => {
    expect(ownerOf(U(LI, 'Anything'), [{ id: 'x', name: '  ', isOwn: false, platforms: ['linkedin'] }])).toBeNull()
  })
  it('records a known over-match: a different channel whose title starts with a competitor name is still attributed to it', () => {
    expect(ownerOf(U(LI, 'Acme Cyber'), [acme])).toBe('b_a')
  })
})

describe('buildBrandChannels', () => {
  it('lists, for each brand, the distinct platforms it registered a channel on', () => {
    const out = buildBrandChannels(
      [{ id: 'b1', name: 'Example', is_own: true, color: null }, { id: 'b2', name: 'Globex', is_own: false, color: null }, { id: 'b3', name: 'NoChannels', is_own: false, color: null }],
      [
        { brand_id: 'b1', platform: 'linkedin', channel_handle: 'company/examplebenefits' },
        { brand_id: 'b1', platform: 'LinkedIn', channel_handle: 'company/other' },
        { brand_id: 'b1', platform: 'instagram', channel_handle: '@exbenefits' },
        { brand_id: 'b2', platform: 'linkedin', channel_handle: 'company/globex' },
      ],
    )
    expect(out.find((b) => b.id === 'b1')).toEqual({ id: 'b1', name: 'Example', isOwn: true, platforms: ['instagram', 'linkedin'] })
    expect(out.find((b) => b.id === 'b3')?.platforms).toEqual([])
    expect(out).toHaveLength(3)
  })
})
