// lib/organic-social/aeo-informed/ownership.test.ts
import { describe, it, expect } from 'vitest'
import { ownerOf, handleSlug, normalizeName, buildBrandChannels } from './ownership'
import type { BrandChannels } from './ownership'

const ren: BrandChannels = { id: 'b_ren', name: 'Renaissance', isOwn: true, slugs: ['renaissancebenefits', 'renbenefits'] }
const unum: BrandChannels = { id: 'b_unum', name: 'Unum', isOwn: false, slugs: ['unum'] }
const guardian: BrandChannels = { id: 'b_g', name: 'Guardian', isOwn: false, slugs: ['guardianlife'] }
const guardianLife: BrandChannels = { id: 'b_gl', name: 'Guardian Life Insurance', isOwn: false, slugs: [] }
const U = (url: string, channelTitle: string | null = null) => ({ url, channelTitle })

describe('normalizeName and handleSlug', () => {
  it('normalizes case, punctuation and spacing', () => {
    expect(normalizeName('  Renaissance Life & Health  ')).toBe('renaissance life health')
  })
  it('strips the @ and the company/ prefix and lowercases', () => {
    expect(handleSlug('@RenBenefits')).toBe('renbenefits')
    expect(handleSlug('company/renaissancebenefits')).toBe('renaissancebenefits')
    expect(handleSlug('company/the-guardian-life-insurance-company-of-america_164085')).toBe('the-guardian-life-insurance-company-of-america_164085')
  })
})

describe('ownerOf: channel title', () => {
  it('matches a title that starts with the brand name at a word boundary', () => {
    expect(ownerOf(U('https://www.linkedin.com/pulse/some-article', 'Renaissance Life & Health Insurance Company of America'), [ren, unum])).toBe('b_ren')
  })
  it('matches a title that is exactly the brand name', () => {
    expect(ownerOf(U('https://www.instagram.com/p/abc', 'Renaissance'), [ren])).toBe('b_ren')
  })
  it('does not match a longer word that merely starts with the name', () => {
    expect(ownerOf(U('https://www.linkedin.com/pulse/x', 'Renaissancer Co'), [ren])).toBeNull()
  })
  it('does not match when the name is not at the start', () => {
    expect(ownerOf(U('https://www.linkedin.com/pulse/x', 'Not Renaissance'), [ren])).toBeNull()
  })
  it('a /pulse/ article with no channel title has no owner', () => {
    expect(ownerOf(U('https://www.linkedin.com/pulse/brokers-guide', null), [ren])).toBeNull()
  })
  it('the longer matching brand name wins', () => {
    expect(ownerOf(U('https://www.youtube.com/x', 'Guardian Life Insurance Limited'), [guardian, guardianLife])).toBe('b_gl')
  })
  it('two different brands with the same normalized name tie, so there is no owner', () => {
    const a: BrandChannels = { id: 'a', name: 'Acme', isOwn: false, slugs: [] }
    const b: BrandChannels = { id: 'b', name: 'ACME', isOwn: false, slugs: [] }
    expect(ownerOf(U('https://x.com/y', 'Acme Corp'), [a, b])).toBeNull()
  })
  it('a brand with an empty name never matches', () => {
    const blank: BrandChannels = { id: 'x', name: '  ', isOwn: false, slugs: [] }
    expect(ownerOf(U('https://x.com/y', 'Anything'), [blank])).toBeNull()
  })
})

describe('ownerOf: registered handle in the path', () => {
  it('matches a LinkedIn post path that carries the handle, with no channel title', () => {
    expect(ownerOf(U('https://www.linkedin.com/posts/renaissancebenefits_some-title-activity-123', null), [ren, unum])).toBe('b_ren')
  })
  it('matches an Instagram handle path', () => {
    expect(ownerOf(U('https://www.instagram.com/renbenefits/p/Dbs_LqNGzSu', null), [ren])).toBe('b_ren')
  })
  it('matches a YouTube @handle path', () => {
    const yt: BrandChannels = { ...ren, slugs: ['renaissancebenefits'] }
    expect(ownerOf(U('https://www.youtube.com/@renaissancebenefits/videos', null), [yt])).toBe('b_ren')
  })
  it('matches a company page that ends with the handle', () => {
    expect(ownerOf(U('https://www.linkedin.com/company/unum', null), [ren, unum])).toBe('b_unum')
  })
  it('does not match the handle inside a longer word', () => {
    expect(ownerOf(U('https://www.linkedin.com/company/unumberone', null), [unum])).toBeNull()
    expect(ownerOf(U('https://www.linkedin.com/posts/superunum_x', null), [unum])).toBeNull()
  })
  it('ignores handles shorter than 4 characters', () => {
    const tiny: BrandChannels = { id: 't', name: 'Tiny', isOwn: false, slugs: ['ren'] }
    expect(ownerOf(U('https://www.instagram.com/ren/p/abc', null), [tiny])).toBeNull()
  })
  it('does not look at the host', () => {
    expect(ownerOf(U('https://renbenefits.example.com/page', null), [ren])).toBeNull()
  })
  it('a handle match wins over a title match for a different brand', () => {
    expect(ownerOf(U('https://www.linkedin.com/posts/unum_something', 'Renaissance Benefits'), [ren, unum])).toBe('b_unum')
  })
  it('the longer handle wins when two brands match by handle, and an equal length is a tie', () => {
    const a: BrandChannels = { id: 'a', name: 'A', isOwn: false, slugs: ['acme'] }
    const b: BrandChannels = { id: 'b', name: 'B', isOwn: false, slugs: ['acmecorp'] }
    expect(ownerOf(U('https://www.linkedin.com/company/acmecorp', null), [a, b])).toBe('b')
    const c: BrandChannels = { id: 'c', name: 'C', isOwn: false, slugs: ['acme'] }
    expect(ownerOf(U('https://www.linkedin.com/company/acme', null), [a, c])).toBeNull()
  })
  it('falls back to a string check when the URL cannot be parsed', () => {
    expect(ownerOf(U('/posts/renbenefits_x', null), [ren])).toBe('b_ren')
  })
})

describe('buildBrandChannels', () => {
  it('joins brands to their registered channel handles', () => {
    const out = buildBrandChannels(
      [{ id: 'b1', name: 'Renaissance', is_own: true }, { id: 'b2', name: 'Unum', is_own: false }, { id: 'b3', name: 'NoChannels', is_own: false }],
      [
        { brand_id: 'b1', platform: 'linkedin', channel_handle: 'company/renaissancebenefits' },
        { brand_id: 'b1', platform: 'instagram', channel_handle: '@renbenefits' },
        { brand_id: 'b2', platform: 'linkedin', channel_handle: 'company/unum' },
      ],
    )
    expect(out.find((b) => b.id === 'b1')).toEqual({ id: 'b1', name: 'Renaissance', isOwn: true, slugs: ['renaissancebenefits', 'renbenefits'] })
    expect(out.find((b) => b.id === 'b3')?.slugs).toEqual([])
    expect(out).toHaveLength(3)
  })
})
