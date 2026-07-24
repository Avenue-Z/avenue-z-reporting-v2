import { expect, test, vi } from 'vitest'

// Isolate fetchTopContent's async orchestration by mocking the client/context seam (./base).
const { getContent } = vi.hoisted(() => ({ getContent: vi.fn() }))

vi.mock('./base', () => ({
  dashClientFor: vi.fn(async () => ({
    client: { getContent },
    brandId: 26952,
    channels: ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TWITTER'],
  })),
  isoRange: () => ({ start: '2026-06-01', end: '2026-06-30' }),
  displayChannel: (s: string) =>
    ({ INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', LINKEDIN: 'LinkedIn', TWITTER: 'X' } as Record<string, string>)[s] ?? s,
  num: (v: number) => String(v),
  pct: (v: number) => String(v),
}))

import { fetchTopContent } from './top-content'

const SUB_KEY: Record<string, string> = { INSTAGRAM: 'instagram', FACEBOOK: 'facebook', LINKEDIN: 'linkedin', TWITTER: 'twitter' }
const ENG_FIELD: Record<string, string> = { INSTAGRAM: 'engagements_public', FACEBOOK: 'total_engagements_public', LINKEDIN: 'engagements', TWITTER: 'engagements' }

function contentRes(channel: string, engagements: number, id: number) {
  // The Instagram-UGC surface is queried in addition to the owned channels; return no UGC
  // posts by default so these owned-channel assertions stay deterministic.
  if (channel === 'INSTAGRAM_UGC') return { data: { content: [] } }
  return { data: { content: [{ id, source: channel, type: 'IMAGE', [SUB_KEY[channel]]: { [ENG_FIELD[channel]]: engagements } }] } }
}

test('Overview fans out to all channels and sorts across them by engagements desc', async () => {
  getContent.mockReset()
  const eng: Record<string, number> = { INSTAGRAM: 10, FACEBOOK: 5, LINKEDIN: 483, TWITTER: 13 }
  const ids: Record<string, number> = { INSTAGRAM: 1, FACEBOOK: 2, LINKEDIN: 3, TWITTER: 4 }
  getContent.mockImplementation(async (a: { channel: string }) => contentRes(a.channel, eng[a.channel], ids[a.channel]))
  const posts = await fetchTopContent('renaissance', 'june', null)
  expect(getContent).toHaveBeenCalledTimes(5) // 4 owned channels + Instagram UGC
  expect(posts.map((p) => p.metrics.engagements)).toEqual([483, 13, 10, 5]) // cross-channel sort desc
})

test('Overview also queries the Instagram-UGC surface with a UGC metric', async () => {
  getContent.mockReset()
  getContent.mockImplementation(async (a: { channel: string }) => contentRes(a.channel, 1, 1))
  await fetchTopContent('renaissance', 'june', null)
  const ugcCall = getContent.mock.calls.find((c) => c[0]?.channel === 'INSTAGRAM_UGC')
  expect(ugcCall?.[0]).toMatchObject({ channel: 'INSTAGRAM_UGC', metric: 'UGC_TOTAL_ENGAGEMENTS', limit: 500 })
})

test('Overview drops a channel whose getContent throws (returns [])', async () => {
  getContent.mockReset()
  getContent.mockImplementation(async (a: { channel: string }) => {
    if (a.channel === 'LINKEDIN') throw new Error('403 topics required')
    return contentRes(a.channel, 1, 9)
  })
  const posts = await fetchTopContent('renaissance', 'june', null)
  expect(posts.some((p) => p.channel === 'LINKEDIN')).toBe(false)
  expect(posts).toHaveLength(3)
})

test('Scoped (single-channel) view re-throws the error instead of dropping it', async () => {
  getContent.mockReset()
  getContent.mockImplementation(async () => { throw new Error('boom') })
  await expect(fetchTopContent('renaissance', 'june', 'LINKEDIN')).rejects.toThrow('boom')
})

test('Scoped view queries only that channel, with its CONTENT metric + limit', async () => {
  getContent.mockReset()
  getContent.mockImplementation(async (a: { channel: string }) => contentRes(a.channel, 5, 1))
  await fetchTopContent('renaissance', 'june', 'LINKEDIN')
  expect(getContent).toHaveBeenCalledTimes(1)
  expect(getContent.mock.calls[0][0]).toMatchObject({ channel: 'LINKEDIN', metric: 'ENGAGEMENTS_BY_POST', limit: 500 })
})
