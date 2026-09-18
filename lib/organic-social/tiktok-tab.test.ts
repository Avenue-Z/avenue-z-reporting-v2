import { expect, test } from 'vitest'
import { organicSocialSubsections, resolveOrganicSubsection } from '@/lib/constants'
import { isCommentaryViewKey, orgSocialChannelViewKey } from '@/lib/commentary/views'
import type { Client } from '@/lib/db/schema'

// Each client's tabs follow its outline. Overview is still listed until its removal is built.
const client = (channels?: string[], hidden: string[] = []): Client =>
  ({ dashSocialConfig: { brandId: 1, channels }, hiddenReports: hidden } as unknown as Client)
const tabs = (c: Client) => organicSocialSubsections(c).map((s) => s.id)

test("Joy of Life's outline: Instagram, Facebook, TikTok, in that order", () => {
  expect(tabs(client(['instagram', 'facebook', 'tiktok'])))
    .toEqual([null, 'organic-instagram', 'organic-facebook', 'organic-tiktok'])
})

test('the TikTok tab shows the TikTok channel under the label TikTok', () => {
  const tab = resolveOrganicSubsection(client(['instagram', 'facebook', 'tiktok']), 'organic-tiktok')
  expect(tab).toEqual({ id: 'organic-tiktok', label: 'TikTok', channel: 'TIKTOK' })
})

test("A Place For Mom's and Kenect's outlines get exactly their tabs, no TikTok", () => {
  expect(tabs(client(['instagram', 'facebook', 'linkedin'])))
    .toEqual([null, 'organic-instagram', 'organic-facebook', 'organic-linkedin'])
  expect(tabs(client(['instagram']))).toEqual([null, 'organic-instagram'])
})

// THE RENAISSANCE GUARD FOR THE TAB. No allowlist resolves to the four original channels, so
// the TikTok tab is never offered, and a hand-typed URL for it falls back to Overview.
test('a client with no allowlist is never offered the TikTok tab, even by URL', () => {
  expect(tabs(client())).not.toContain('organic-tiktok')
  expect(resolveOrganicSubsection(client(), 'organic-tiktok').channel).toBeNull()
})

test('the TikTok tab can be hidden per client, like any other tab', () => {
  expect(tabs(client(['instagram', 'facebook', 'tiktok']))).toContain('organic-tiktok')
  expect(tabs(client(['instagram', 'facebook', 'tiktok'], ['organic-tiktok']))).not.toContain('organic-tiktok')
})

// The outlines put Commentary on every tab.
test('the TikTok tab has a Commentary view', () => {
  expect(isCommentaryViewKey(orgSocialChannelViewKey('TIKTOK'))).toBe(true)
})
