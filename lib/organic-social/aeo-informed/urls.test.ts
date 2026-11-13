// lib/organic-social/aeo-informed/urls.test.ts
import { describe, it, expect } from 'vitest'
import { aggregateByUrl, citationPosition } from './urls'
import type { PeecUrlRow } from './types'

const row = (url: string, o: Partial<PeecUrlRow> = {}): PeecUrlRow => ({
  url, classification: 'ARTICLE', title: null, channel_title: null,
  citation_count: 0, retrieval_count: 0, citation_position: null, citation_position_sum: 0, citation_position_count: 0,
  mentioned_brands: [], ...o,
})

describe('aggregateByUrl', () => {
  it('groups by the exact URL string, so two YouTube videos stay two rows', () => {
    const out = aggregateByUrl([row('https://www.youtube.com/watch?v=aaa'), row('https://www.youtube.com/watch?v=bbb')])
    expect(out.map((u) => u.url)).toEqual(['https://www.youtube.com/watch?v=aaa', 'https://www.youtube.com/watch?v=bbb'])
  })

  it('treats a trailing-slash variant as a different URL (Peec already normalized what it returns)', () => {
    const out = aggregateByUrl([row('https://x.com/a'), row('https://x.com/a/')])
    expect(out).toHaveLength(2)
  })

  it('sums retrievals, citations and the position sums across rows of the same URL', () => {
    const [u] = aggregateByUrl([
      row('https://x.com/a', { retrieval_count: 3, citation_count: 2, citation_position_sum: 5, citation_position_count: 2 }),
      row('https://x.com/a', { retrieval_count: 4, citation_count: 1, citation_position_sum: 4, citation_position_count: 1 }),
    ])
    expect(u).toMatchObject({ retrievals: 7, citations: 3, positionSum: 9, positionCount: 3 })
  })

  it('unions mentioned brand ids, sorted and unique', () => {
    const [u] = aggregateByUrl([
      row('https://x.com/a', { mentioned_brands: [{ id: 'b2' }, { id: 'b1' }] }),
      row('https://x.com/a', { mentioned_brands: [{ id: 'b1' }, { id: 'b3' }] }),
    ])
    expect(u.brandIds).toEqual(['b1', 'b2', 'b3'])
  })

  it('takes title, channel and classification from the row with the most retrievals that has a value', () => {
    const [u] = aggregateByUrl([
      row('https://x.com/a', { retrieval_count: 9, title: null, channel_title: null, classification: null }),
      row('https://x.com/a', { retrieval_count: 1, title: 'low', channel_title: 'low', classification: 'OTHER' }),
      row('https://x.com/a', { retrieval_count: 5, title: 'T', channel_title: 'C', classification: 'LISTICLE' }),
    ])
    expect(u).toMatchObject({ title: 'T', channelTitle: 'C', classification: 'LISTICLE' })
  })

  it('breaks a retrieval tie with the alphabetically smallest value', () => {
    const [u] = aggregateByUrl([
      row('https://x.com/a', { retrieval_count: 2, title: 'b' }),
      row('https://x.com/a', { retrieval_count: 2, title: 'a' }),
    ])
    expect(u.title).toBe('a')
  })

  it('gives the same answer whatever order Peec returns the rows in', () => {
    const rows = [
      row('https://x.com/a', { retrieval_count: 1, title: 'x', channel_title: 'q' }),
      row('https://x.com/a', { retrieval_count: 4, title: 'y', channel_title: 'r' }),
      row('https://x.com/a', { retrieval_count: 4, title: 'w', channel_title: null }),
    ]
    expect(aggregateByUrl(rows)).toEqual(aggregateByUrl([...rows].reverse()))
  })

  it('keeps nulls when no row has a value', () => {
    const [u] = aggregateByUrl([row('https://x.com/a', { classification: null })])
    expect(u).toMatchObject({ title: null, channelTitle: null, classification: null })
  })

  it('returns [] for no rows', () => {
    expect(aggregateByUrl([])).toEqual([])
  })

  it('keeps first-seen order of URLs', () => {
    const out = aggregateByUrl([row('https://x.com/b'), row('https://x.com/a'), row('https://x.com/b')])
    expect(out.map((u) => u.url)).toEqual(['https://x.com/b', 'https://x.com/a'])
  })
})

describe('citationPosition', () => {
  it('is the position sum over the count of chats that cited it inline', () => {
    const [u] = aggregateByUrl([
      row('https://x.com/a', { citation_position_sum: 7, citation_position_count: 2 }),
      row('https://x.com/a', { citation_position_sum: 3, citation_position_count: 1 }),
    ])
    expect(citationPosition(u)).toBeCloseTo(10 / 3)
  })

  it('is null when no chat cited it inline, even if it has citations', () => {
    const [u] = aggregateByUrl([row('https://x.com/a', { citation_count: 5 })])
    expect(citationPosition(u)).toBeNull()
  })
})
