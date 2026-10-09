import { expect, test, vi } from 'vitest'

// Pre-change record for the outline fixes: fetchTopContent's default output (Overview and the
// Instagram tab), with owned Instagram posts that carry an author. The default path must never
// gain an `author` key. Mock seam as in fetch-top-content.orchestration.test.ts, with an invented
// brand id.
const { getContent } = vi.hoisted(() => ({ getContent: vi.fn() }))

vi.mock('./base', () => ({
  dashClientFor: vi.fn(async () => ({
    client: { getContent },
    brandId: 1,
    channels: ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TWITTER'],
  })),
  isoRange: () => ({ start: '2026-06-01', end: '2026-06-30' }),
  displayChannel: (s: string) =>
    ({ INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', LINKEDIN: 'LinkedIn', TWITTER: 'X' } as Record<string, string>)[s] ?? s,
  num: (v: number) => String(v),
  pct: (v: number) => String(v),
}))

import { fetchTopContent } from './top-content'

// Invented UGC posts (no client data): one carries a user field, to show UGC never gets an author.
const UGC = [
  { id: 51, source: 'INSTAGRAM', type: 'VIDEO', source_created_at: '2026-06-05T12:00:00Z', instagram_user: { handle: 'creator_two' },
    instagram: { caption: 'collab post #ad', sum_total_engagements: 30, views: 300, engagement: 0.1, effectiveness_engagements: 7 } },
  { id: 52, source: 'INSTAGRAM', type: 'IMAGE', source_created_at: '2026-06-06T12:00:00Z',
    instagram: { caption: 'tagged us', sum_total_engagements: 8, views: 80 } },
]

const SUB_KEY: Record<string, string> = { FACEBOOK: 'facebook', LINKEDIN: 'linkedin', TWITTER: 'twitter' }
const ENG_FIELD: Record<string, string> = { FACEBOOK: 'total_engagements_public', LINKEDIN: 'engagements', TWITTER: 'engagements' }

function answer(channel: string) {
  if (channel === 'INSTAGRAM') return { data: { content: [
    { id: 11, source: 'INSTAGRAM', type: 'IMAGE', instagram_user: { handle: 'brand_handle' }, instagram: { sum_total_engagements: 10, views: 100 } },
    { id: 12, source: 'INSTAGRAM', type: 'IMAGE', instagram_user: { handle: 'creator_one' }, instagram: { sum_total_engagements: 20, views: 50 } },
  ] } }
  if (channel === 'INSTAGRAM_UGC') return { data: { content: UGC } }
  const id = { FACEBOOK: 21, LINKEDIN: 31, TWITTER: 41 }[channel as 'FACEBOOK' | 'LINKEDIN' | 'TWITTER']
  return { data: { content: [{ id, source: channel, type: 'IMAGE', [SUB_KEY[channel]]: { [ENG_FIELD[channel]]: 5 } }] } }
}

test("today's fetchTopContent output (Overview and Instagram) is pinned, with no author key anywhere", async () => {
  getContent.mockReset()
  getContent.mockImplementation(async (a: { channel: string }) => answer(a.channel))
  const overview = await fetchTopContent('c', 'june', null)
  const instagram = await fetchTopContent('c', 'june', 'INSTAGRAM')
  for (const p of [...overview, ...instagram]) expect('author' in p).toBe(false)
  expect({ overview, instagram }).toMatchSnapshot()
})
