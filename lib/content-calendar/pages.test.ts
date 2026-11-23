import { describe, it, expect } from 'vitest'
import type { ContentCalendarRow } from './types'
import { resolveCalendarUrl, toCalendarPages } from './pages'

const DOMAIN = 'renaissance.example'

function row(over: Partial<ContentCalendarRow>): ContentCalendarRow {
  return {
    topic: 'T',
    url: 'https://renaissance.example/a',
    contentType: 'Blog',
    status: 'Published',
    contentAction: 'new',
    publishDate: null,
    updateDate: null,
    matchStatus: 'unknown',
    aiCitations: null,
    aiBotVisits: null,
    ...over,
  }
}

describe('resolveCalendarUrl', () => {
  it('resolves bare path against owned domain', () => {
    expect(resolveCalendarUrl('/blog/x', 'renaissance.example')).toBe(
      'https://renaissance.example/blog/x',
    )
  })
  it('leaves absolute URLs unchanged and null as null', () => {
    expect(resolveCalendarUrl('https://a.com/x', DOMAIN)).toBe('https://a.com/x')
    expect(resolveCalendarUrl(null, DOMAIN)).toBeNull()
  })
  it('returns null for a bare path with no owned domain', () => {
    expect(resolveCalendarUrl('/blog/x', null)).toBeNull()
  })
})

describe('toCalendarPages', () => {
  it('merges New and Optimized rows for one URL', () => {
    const pages = toCalendarPages(
      [
        row({ contentAction: 'new', publishDate: '2026-03-04' }),
        row({ contentAction: 'optimized', publishDate: '2026-06-12' }),
      ],
      DOMAIN,
    )
    expect(pages).toHaveLength(1)
    expect(pages[0]).toMatchObject({
      badge: 'new-optimized',
      publishDate: '2026-03-04',
      lastOptimizedDate: '2026-06-12',
      published: true,
    })
  })

  it('keeps the latest Optimized date; optimized-only page has null publishDate', () => {
    const pages = toCalendarPages(
      [
        row({ contentAction: 'optimized', publishDate: '2026-02-01' }),
        row({ contentAction: 'optimized', publishDate: '2026-05-01' }),
      ],
      DOMAIN,
    )
    expect(pages).toHaveLength(1)
    expect(pages[0]).toMatchObject({
      badge: 'optimized',
      publishDate: null,
      lastOptimizedDate: '2026-05-01',
    })
  })

  it('merges trailing slash, www and bare-path variants', () => {
    const pages = toCalendarPages(
      [
        row({ url: 'https://renaissance.example/a' }),
        row({ url: 'https://www.renaissance.example/a/' }),
        row({ url: '/a' }),
      ],
      DOMAIN,
    )
    expect(pages).toHaveLength(1)
  })

  it('treats status "Live" as unpublished and " published " as published', () => {
    const live = toCalendarPages([row({ status: 'Live' })], DOMAIN)
    const pub = toCalendarPages([row({ status: ' published ' })], DOMAIN)
    expect(live[0].published).toBe(false)
    expect(pub[0].published).toBe(true)
  })

  it('drops rows without a URL', () => {
    expect(toCalendarPages([row({ url: null })], DOMAIN)).toEqual([])
  })

  it('keeps a bare path as an unlinked page when there is no owned domain (M4)', () => {
    const pages = toCalendarPages([row({ url: '/Blog/X/' }), row({ url: '/blog/x', contentAction: 'optimized' })], null)
    expect(pages).toHaveLength(1)
    expect(pages[0]).toMatchObject({ urlKey: '/blog/x', url: null, badge: 'new-optimized' })
  })

  it('takes topic/contentType from the latest-dated row, ties to the last row', () => {
    const pages = toCalendarPages(
      [
        row({ topic: 'Old', contentType: 'A', publishDate: '2026-01-01' }),
        row({ topic: 'New', contentType: 'B', publishDate: '2026-04-01', contentAction: 'optimized' }),
        row({ topic: 'Tie', contentType: 'C', publishDate: '2026-04-01', contentAction: 'optimized' }),
      ],
      DOMAIN,
    )
    expect(pages[0]).toMatchObject({ topic: 'Tie', contentType: 'C' })
  })

  it('badge is other when only unclassified rows; new when new + other', () => {
    expect(toCalendarPages([row({ contentAction: 'other' })], DOMAIN)[0].badge).toBe('other')
    expect(
      toCalendarPages([row({ contentAction: 'other' }), row({ contentAction: 'new' })], DOMAIN)[0].badge,
    ).toBe('new')
  })

  it('ignores updateDate (D-19)', () => {
    const p = toCalendarPages(
      [row({ contentAction: 'optimized', publishDate: null, updateDate: '2026-09-09' })],
      DOMAIN,
    )[0]
    expect(p.lastOptimizedDate).toBeNull()
  })
})

describe('toCalendarPages dates come from Published rows only (M1)', () => {
  it('a planned row\'s date is neither Published nor Last optimized', () => {
    const [p] = toCalendarPages(
      [
        row({ contentAction: 'new', publishDate: '2026-01-01', status: 'Planned' }),
        row({ contentAction: 'new', publishDate: '2026-02-01', status: 'Published' }),
        row({ contentAction: 'optimized', publishDate: '2026-09-01', status: 'In progress' }),
        row({ contentAction: 'optimized', publishDate: '2026-05-01', status: 'Published' }),
      ],
      DOMAIN,
    )
    expect(p.publishDate).toBe('2026-02-01')
    expect(p.lastOptimizedDate).toBe('2026-05-01')
  })
  it('a page with no Published row has no dates', () => {
    const [p] = toCalendarPages(
      [row({ publishDate: '2026-01-01', status: 'Planned' }), row({ contentAction: 'optimized', publishDate: '2026-02-01', status: 'Live' })],
      DOMAIN,
    )
    expect(p.publishDate).toBeNull()
    expect(p.lastOptimizedDate).toBeNull()
  })
})

describe('toCalendarPages badge and topic follow Published rows (review #482)', () => {
  it('Published New + In progress Optimized: badge new, no optimized date', () => {
    const [p] = toCalendarPages(
      [
        row({ contentAction: 'new', publishDate: '2026-02-01', status: 'Published' }),
        row({ contentAction: 'optimized', publishDate: '2026-09-01', status: 'In progress' }),
      ],
      DOMAIN,
    )
    expect(p.badge).toBe('new')
    expect(p.publishDate).toBe('2026-02-01')
    expect(p.lastOptimizedDate).toBeNull()
  })
  it('Planned New + Published Optimized: badge optimized, no Published date', () => {
    const [p] = toCalendarPages(
      [
        row({ contentAction: 'new', publishDate: '2026-01-01', status: 'Planned' }),
        row({ contentAction: 'optimized', publishDate: '2026-05-01', status: 'Published' }),
      ],
      DOMAIN,
    )
    expect(p.badge).toBe('optimized')
    expect(p.publishDate).toBeNull()
    expect(p.lastOptimizedDate).toBe('2026-05-01')
  })
  it('both Published: new-optimized', () => {
    const [p] = toCalendarPages(
      [
        row({ contentAction: 'new', publishDate: '2026-02-01' }),
        row({ contentAction: 'optimized', publishDate: '2026-05-01' }),
      ],
      DOMAIN,
    )
    expect(p.badge).toBe('new-optimized')
  })
  it('topic/contentType come from the latest Published row, not a later unpublished one', () => {
    const [p] = toCalendarPages(
      [
        row({ topic: 'Live', contentType: 'Blog', publishDate: '2026-02-01', status: 'Published' }),
        row({ topic: 'Draft', contentType: 'Guide', publishDate: '2026-09-01', status: 'Planned' }),
      ],
      DOMAIN,
    )
    expect(p).toMatchObject({ topic: 'Live', contentType: 'Blog' })
  })
  it('with no Published row, topic falls back to the latest row of any status', () => {
    const [p] = toCalendarPages(
      [
        row({ topic: 'A', publishDate: '2026-01-01', status: 'Planned' }),
        row({ topic: 'B', publishDate: '2026-03-01', status: 'In progress' }),
      ],
      DOMAIN,
    )
    expect(p).toMatchObject({ topic: 'B', published: false })
  })
})
