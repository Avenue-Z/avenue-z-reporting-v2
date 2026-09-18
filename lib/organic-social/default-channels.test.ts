import { expect, test, vi } from 'vitest'

// The client lookup is the only database touch on this path; each test hands it a config.
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))

import { CHANNELS, DEFAULT_CHANNELS, resolveChannels } from './metrics'
import { dashClientFor } from './base'
import { organicSocialSubsections } from '@/lib/constants'
import type { Client } from '@/lib/db/schema'

const FOUR = ['INSTAGRAM', 'FACEBOOK', 'TWITTER', 'LINKEDIN']

// THE RENAISSANCE GUARD FOR CHANNELS. Renaissance is the only client with no channel
// allowlist (prod, staging and dev, read 2026-09-18). Whatever is added to CHANNELS, a
// client with no allowlist keeps exactly these four. Putting a channel into the default
// changes Renaissance's live report, so it has to be a deliberate edit to this test.
test('the default is exactly the four original channels, in order', () => {
  expect([...DEFAULT_CHANNELS]).toEqual(FOUR)
})

test('every default is a supported channel, and TikTok is not a default', () => {
  for (const c of DEFAULT_CHANNELS) expect(CHANNELS).toContain(c)
  expect(DEFAULT_CHANNELS).not.toContain('TIKTOK')
})

test("a client that names TikTok gets it, in CHANNELS order (Joy of Life's allowlist)", () => {
  expect(resolveChannels(['instagram', 'facebook', 'tiktok'])).toEqual(['INSTAGRAM', 'FACEBOOK', 'TIKTOK'])
})

test('a client with no allowlist gets the four through the real client lookup', async () => {
  process.env.DASH_API_TOKEN ??= 'test-token'
  getClientBySlug.mockResolvedValueOnce({ dashSocialConfig: { brandId: 1 } })
  expect((await dashClientFor('no-allowlist-client')).channels).toEqual(FOUR)
})

test('a client that names TikTok gets it through the real client lookup', async () => {
  process.env.DASH_API_TOKEN ??= 'test-token'
  getClientBySlug.mockResolvedValueOnce({ dashSocialConfig: { brandId: 2, channels: ['instagram', 'facebook', 'tiktok'] } })
  expect((await dashClientFor('names-tiktok-client')).channels).toEqual(['INSTAGRAM', 'FACEBOOK', 'TIKTOK'])
})

// Also guards the TikTok tab that comes next: it must never appear for a client
// with no allowlist.
test('a client with no allowlist keeps exactly the tabs it has today', () => {
  const client = { dashSocialConfig: { brandId: 1 }, hiddenReports: [] } as unknown as Client
  expect(organicSocialSubsections(client).map((s) => s.id))
    .toEqual([null, 'organic-instagram', 'organic-facebook', 'organic-linkedin', 'organic-x'])
})
