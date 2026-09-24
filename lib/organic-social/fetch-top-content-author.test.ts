import { expect, test, vi } from 'vitest'

// fetchTopContent with { withAuthor: true }: owned Instagram posts carry their author, UGC posts
// never do, even with a user field (UGC author fields are unproven); with { markUgc: true } UGC posts
// carry ugc: true instead, which the outline rule reads (never an owned post). Nothing else moves.
// Mock seam as in fetch-top-content-parity.test.ts.
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
const UGC_IDS = new Set(UGC.map((p) => p.id))

function answer(channel: string) {
  if (channel === 'INSTAGRAM') return { data: { content: [
    { id: 11, source: 'INSTAGRAM', type: 'IMAGE', instagram_user: { handle: 'brand_handle' }, instagram: { sum_total_engagements: 10, views: 100 } },
    { id: 12, source: 'INSTAGRAM', type: 'IMAGE', instagram_user: { handle: '@Creator_One' }, instagram: { sum_total_engagements: 20, views: 50 } },
  ] } }
  if (channel === 'INSTAGRAM_UGC') return { data: { content: UGC } }
  const id = { FACEBOOK: 21, LINKEDIN: 31, TWITTER: 41 }[channel as 'FACEBOOK' | 'LINKEDIN' | 'TWITTER']
  return { data: { content: [{ id, source: channel, type: 'IMAGE', [SUB_KEY[channel]]: { [ENG_FIELD[channel]]: 5 } }] } }
}
const strip = <T extends object>(posts: T[]) => posts.map(({ author: _a, ...rest }: T & { author?: string }) => rest)

test('asked for authors: owned Instagram posts carry theirs; UGC and other channels carry none', async () => {
  getContent.mockReset()
  getContent.mockImplementation(async (a: { channel: string }) => answer(a.channel))
  for (const channel of [null, 'INSTAGRAM'] as const) {
    const posts = await fetchTopContent('c', 'june', channel, { withAuthor: true })
    const owned = posts.filter((p) => p.channel === 'INSTAGRAM' && !UGC_IDS.has(p.id))
    expect(owned.map((p) => [p.id, p.author])).toEqual([[12, 'creator_one'], [11, 'brand_handle']])
    for (const p of posts.filter((q) => UGC_IDS.has(q.id) || q.channel !== 'INSTAGRAM')) expect('author' in p).toBe(false)
  }
})

test('the author is the only difference, and not asking (or asking false) is the default output', async () => {
  getContent.mockReset()
  getContent.mockImplementation(async (a: { channel: string }) => answer(a.channel))
  for (const channel of [null, 'INSTAGRAM'] as const) {
    const plain = await fetchTopContent('c', 'june', channel)
    for (const p of plain) expect('author' in p).toBe(false)
    expect(await fetchTopContent('c', 'june', channel, { withAuthor: false })).toEqual(plain)
    expect(strip(await fetchTopContent('c', 'june', channel, { withAuthor: true }))).toEqual(plain)
  }
})

// Plan 2026-09-24-qa-fixes §4 (F1).
test('asked to mark UGC: every UGC post carries ugc: true and no owned post does', async () => {
  getContent.mockReset()
  getContent.mockImplementation(async (a: { channel: string }) => answer(a.channel))
  for (const channel of [null, 'INSTAGRAM'] as const) {
    const posts = await fetchTopContent('c', 'june', channel, { withAuthor: true, markUgc: true })
    expect(posts.filter((p) => p.ugc).map((p) => p.id).sort()).toEqual([51, 52])
    for (const p of posts.filter((q) => !UGC_IDS.has(q.id))) expect('ugc' in p).toBe(false)
  }
})
// Guard: breaks if the field were always present (e.g. ugc: Boolean(opts.markUgc)).
test('not asked to mark UGC, no post has the key at all: the path Renaissance uses', async () => {
  getContent.mockReset()
  getContent.mockImplementation(async (a: { channel: string }) => answer(a.channel))
  for (const channel of [null, 'INSTAGRAM'] as const) {
    for (const opts of [undefined, { withAuthor: true }, { markUgc: false }]) {
      for (const p of await fetchTopContent('c', 'june', channel, opts)) expect('ugc' in p).toBe(false)
    }
  }
})
