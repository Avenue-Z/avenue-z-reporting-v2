import { expect, test, vi } from 'vitest'

const { fetchTopContentFrozen, writeSnapshot } = vi.hoisted(() => ({
  fetchTopContentFrozen: vi.fn(async (_slug: string, _dateRange: string, _channel: string | null, _injected?: unknown) => []),
  writeSnapshot: vi.fn(),
}))
vi.mock('./frozen', () => ({ fetchTopContentFrozen }))
vi.mock('./snapshot', () => ({ writeSnapshot, readSnapshot: vi.fn() }))

import { graphPosts } from './graph-posts'

test('the graphs read a frozen window when there is one, and never write one', async () => {
  await graphPosts('client-a', 'custom:2026-08-01,2026-08-31', 'INSTAGRAM')
  expect(fetchTopContentFrozen).toHaveBeenCalledTimes(1)
  const [slug, range, channel, injected] = fetchTopContentFrozen.mock.calls[0] as unknown as [string, string, string, { writeSnapshot: (...a: unknown[]) => Promise<void> }]
  expect([slug, range, channel]).toEqual(['client-a', 'custom:2026-08-01,2026-08-31', 'INSTAGRAM'])
  // Only Top Content freezes a window. If the graphs froze one first, it would be captured without
  // post authors, silently disabling the collab rule that top-content@3 depends on.
  await injected.writeSnapshot('c1', 'INSTAGRAM', '2026-08-01', '2026-08-31', [])
  expect(writeSnapshot).not.toHaveBeenCalled()
})

test('both graphs ask with the same arguments, so React caches one fetch per render', async () => {
  const a = graphPosts('client-a', 'custom:2026-08-01,2026-08-31', 'INSTAGRAM')
  const b = graphPosts('client-a', 'custom:2026-08-01,2026-08-31', 'INSTAGRAM')
  await Promise.all([a, b])
  expect(fetchTopContentFrozen.mock.calls.every((c) => c[0] === 'client-a' && c[1] === 'custom:2026-08-01,2026-08-31' && c[2] === 'INSTAGRAM')).toBe(true)
})
