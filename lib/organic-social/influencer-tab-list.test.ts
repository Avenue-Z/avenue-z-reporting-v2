import { expect, test } from 'vitest'
import { ORGANIC_SOCIAL_SUBSECTIONS, organicSocialSubsections, resolveOrganicSubsection, type OrganicTabsClient } from '@/lib/constants'
import { toPortalSidebarClient } from '@/lib/portal/sidebar-client'
import type { Client } from '@/lib/db/schema'

const client = (channels: string[] | undefined, hidden: string[] = [], influencerSection?: unknown): Client =>
  ({ dashSocialConfig: { brandId: 1, channels, ...(influencerSection === undefined ? {} : { influencerSection }) }, hiddenReports: hidden } as unknown as Client)
const ids = (c: OrganicTabsClient) => organicSocialSubsections(c).map((s) => s.id)

test('the Influencer tab sits directly under Instagram, with no channel and the influencer view', () => {
  const at = ORGANIC_SOCIAL_SUBSECTIONS.findIndex((s) => s.id === 'organic-instagram')
  expect(ORGANIC_SOCIAL_SUBSECTIONS[at + 1]).toEqual({ id: 'organic-influencer', label: 'Influencer', channel: null, view: 'influencer' })
})

test.each([
  ['three channels, no setting', client(['instagram', 'facebook', 'linkedin'], ['organic-overview']), true],
  ['no allowlist, no setting', client(undefined), true],
  ['Instagram with a label', client(['instagram'], ['organic-overview'], { INSTAGRAM: { label: 'Partnership Posts' } }), true],
  ['Instagram hidden by setting', client(['instagram', 'facebook', 'twitter', 'linkedin'], ['organic-overview'], { INSTAGRAM: { hidden: true } }), false],
  ['LinkedIn only', client(['linkedin'], ['organic-overview']), false],
  ['Instagram tab hidden, Overview shown', client(['instagram', 'facebook'], ['organic-instagram']), false],
])('%s', (_, c, expected) => {
  expect(ids(c).includes('organic-influencer')).toBe(expected)
  expect(ids(toPortalSidebarClient(c)).includes('organic-influencer')).toBe(expected)
  expect(ids(c)).toEqual(ids(toPortalSidebarClient(c)))
})

test('a hand-typed influencer subsection resolves to the first tab when the client has no tab', () => {
  const c = client(['instagram'], ['organic-overview'], { INSTAGRAM: { hidden: true } })
  expect(resolveOrganicSubsection(c, 'organic-influencer').id).toBe('organic-instagram')
})

test('with Overview hidden the report still opens on Instagram, with the Influencer tab under it', () => {
  expect(resolveOrganicSubsection(client(['instagram', 'facebook'], ['organic-overview'])).id).toBe('organic-instagram')
  expect(ids(client(['instagram', 'facebook'], ['organic-overview']))).toEqual(['organic-instagram', 'organic-influencer', 'organic-facebook'])
})
