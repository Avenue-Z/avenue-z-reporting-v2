import { expect, test } from 'vitest'
import { toPayload, fromSnapshot, encodeSnapshotRows, decodeSnapshot } from './snapshot'
import type { TopContentPost } from './content-types'

const post: TopContentPost = {
  id: 7, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-06-01',
  caption: 'hi', url: 'https://x/y', mediaType: 'VIDEO', mediaGroup: null,
  creative: { kind: 'video', src: 'https://cdn/y.mp4', poster: 'https://cdn/p.jpg' },
  metrics: { effectiveness: 12, engagementRate: 0.04, engagements: 33, impressions: 900 }, sourceType: 'influencer',
}

test('toPayload drops sourceType but keeps creative URLs + metrics', () => {
  const payload = toPayload(post)
  expect('sourceType' in payload).toBe(false)
  expect(payload.creative).toEqual(post.creative)
  expect(payload.metrics.engagements).toBe(33)
  expect(payload.metrics.impressions).toBe(900)
})

test('fromSnapshot reconstructs a TopContentPost with the live sourceType', () => {
  const back = fromSnapshot(toPayload(post), 'organic')
  expect(back.id).toBe(7)
  expect(back.sourceType).toBe('organic') // NOT the frozen influencer — designations stay live
  expect(back.creative).toEqual(post.creative)
})

const at = (id: number): TopContentPost => ({ ...post, id })

test('decodeSnapshot: no rows → not frozen (absent, caller freezes)', () => {
  expect(decodeSnapshot([])).toEqual({ frozen: false, posts: [] })
})

test('encode/decode round-trip: an EMPTY window freezes with a marker and decodes to frozen []', () => {
  const rows = encodeSnapshotRows('c1', 'INSTAGRAM', '2026-06-01', '2026-06-30', [])
  expect(rows).toHaveLength(1)
  expect(rows[0].rank).toBe(-1) // out-of-band marker, not a post id
  const decoded = decodeSnapshot(rows)
  expect(decoded.frozen).toBe(true) // captured, so no live re-hit
  expect(decoded.posts).toEqual([]) // marker stripped
})

test('encode/decode round-trip: real posts survive at ranks 0..N in order', () => {
  const rows = encodeSnapshotRows('c1', 'INSTAGRAM', '2026-06-01', '2026-06-30', [at(11), at(22)])
  expect(rows.map((r) => r.rank)).toEqual([0, 1])
  const decoded = decodeSnapshot(rows)
  expect(decoded.frozen).toBe(true)
  expect(decoded.posts.map((p) => p.id)).toEqual([11, 22])
})

test('decodeSnapshot: a genuine post at id 0 is NOT mistaken for the marker (rank-based, not id)', () => {
  const rows = encodeSnapshotRows('c1', 'INSTAGRAM', '2026-06-01', '2026-06-30', [at(0)])
  expect(rows[0].rank).toBe(0) // real post → rank 0, distinct from the -1 marker
  expect(decodeSnapshot(rows).posts.map((p) => p.id)).toEqual([0]) // survives, not filtered
})
