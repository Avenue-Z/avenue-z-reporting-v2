import { expect, test, vi } from 'vitest'
const { fetchTopContentFrozen, fetchTopContent } = vi.hoisted(() => ({ fetchTopContentFrozen: vi.fn(async () => []), fetchTopContent: vi.fn(async () => []) }))
vi.mock('./frozen', () => ({ fetchTopContentFrozen }))
vi.mock('./top-content', () => ({ fetchTopContent }))
import { fetchTopContentFrozenWithAuthors } from './top-content-authors'

// Paul, #358 review: one helper for the request the Instagram tab, Overview and the Influencer tab must share, so the
// three can never drift apart under the same snapshot key.
test('the frozen fetch whose live read asks for post authors and UGC marks', async () => {
  await fetchTopContentFrozenWithAuthors('client-a', 'custom:2026-09-01,2026-09-30', 'INSTAGRAM')
  const [slug, range, ch, injected] = fetchTopContentFrozen.mock.calls[0] as unknown as [string, string, string, { fetchLive: (...a: unknown[]) => unknown }]
  expect([slug, range, ch]).toEqual(['client-a', 'custom:2026-09-01,2026-09-30', 'INSTAGRAM'])
  await injected.fetchLive('s', 'd', null)
  expect(fetchTopContent).toHaveBeenCalledWith('s', 'd', null, { withAuthor: true, markUgc: true })
})
