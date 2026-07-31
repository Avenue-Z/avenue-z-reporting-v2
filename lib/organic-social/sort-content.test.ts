import { describe, expect, test } from 'vitest'
import { sortPosts, SORT_METRICS, paginate } from './sort-content'
import type { TopContentPost } from './content-types'

// Minimal post factory — only the fields sortPosts reads.
const post = (
  id: number,
  metrics: Partial<TopContentPost['metrics']>,
  publishedAt = '2026-07-01',
): TopContentPost =>
  ({
    id,
    publishedAt,
    metrics: { effectiveness: null, engagementRate: null, engagements: 0, impressions: 0, ...metrics },
  }) as TopContentPost

const ids = (ps: TopContentPost[]) => ps.map((p) => p.id)

describe('sortPosts', () => {
  test('desc orders highest metric first', () => {
    const ps = [post(1, { engagements: 5 }), post(2, { engagements: 20 }), post(3, { engagements: 10 })]
    expect(ids(sortPosts(ps, 'engagements', 'desc'))).toEqual([2, 3, 1])
  })

  test('asc orders lowest metric first', () => {
    const ps = [post(1, { impressions: 5 }), post(2, { impressions: 20 }), post(3, { impressions: 10 })]
    expect(ids(sortPosts(ps, 'impressions', 'asc'))).toEqual([1, 3, 2])
  })

  test('nulls sort LAST in both directions (never float to the top)', () => {
    const ps = [post(1, { effectiveness: null }), post(2, { effectiveness: 0.5 }), post(3, { effectiveness: 0.1 })]
    expect(ids(sortPosts(ps, 'effectiveness', 'desc'))).toEqual([2, 3, 1])
    expect(ids(sortPosts(ps, 'effectiveness', 'asc'))).toEqual([3, 2, 1]) // 1 (null) still last, not first
  })

  test('ties break deterministically by engagements, then recency, then id', () => {
    const ps = [
      post(1, { impressions: 100, engagements: 3 }, '2026-07-01'),
      post(2, { impressions: 100, engagements: 9 }, '2026-07-01'),
      post(3, { impressions: 100, engagements: 3 }, '2026-07-05'),
    ]
    // Equal impressions → engagements desc (2), then more recent (3), then older (1).
    expect(ids(sortPosts(ps, 'impressions', 'desc'))).toEqual([2, 3, 1])
  })

  test('does not mutate the input array', () => {
    const ps = [post(1, { engagements: 1 }), post(2, { engagements: 2 })]
    const before = ids(ps)
    sortPosts(ps, 'engagements', 'desc')
    expect(ids(ps)).toEqual(before)
  })

  test('SORT_METRICS keys are all valid metric fields', () => {
    const valid = new Set(['effectiveness', 'engagementRate', 'engagements', 'impressions'])
    expect(SORT_METRICS.every((m) => valid.has(m.key))).toBe(true)
  })
})

describe('paginate', () => {
  const items = Array.from({ length: 18 }, (_, i) => i + 1) // 1..18

  test('page 0 returns the first `size` items with page metadata', () => {
    const r = paginate(items, 0, 15)
    expect(r.slice).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
    expect(r).toMatchObject({ page: 0, pageCount: 2, total: 18, start: 0, end: 15 })
  })

  test('next page returns the following slice (16..18) as a partial last page', () => {
    const r = paginate(items, 1, 15)
    expect(r.slice).toEqual([16, 17, 18])
    expect(r).toMatchObject({ page: 1, pageCount: 2, total: 18, start: 15, end: 18 })
  })

  test('a page past the end clamps to the last page', () => {
    const r = paginate(items, 9, 15)
    expect(r.page).toBe(1) // last page index, not 9
    expect(r.slice).toEqual([16, 17, 18])
  })

  test('a negative page clamps to 0', () => {
    const r = paginate(items, -3, 15)
    expect(r.page).toBe(0)
    expect(r.slice[0]).toBe(1)
  })

  test('total <= size is a single page with no second page', () => {
    const r = paginate([1, 2, 3, 4, 5, 6], 0, 15)
    expect(r.pageCount).toBe(1)
    expect(r.slice).toEqual([1, 2, 3, 4, 5, 6])
    expect(r).toMatchObject({ start: 0, end: 6, total: 6 })
  })

  test('empty input is a single empty page (pageCount 1, not 0)', () => {
    const r = paginate([], 0, 15)
    expect(r).toMatchObject({ slice: [], page: 0, pageCount: 1, total: 0, start: 0, end: 0 })
  })

  test('does not mutate the input array', () => {
    const src = [1, 2, 3]
    paginate(src, 0, 2)
    expect(src).toEqual([1, 2, 3])
  })
})
