import { expect, test } from 'vitest'
import { hasInfluencerTab, influencerRulesFor, withoutTabbedInfluencer } from './influencer-tab'
import { ORGANIC_SOCIAL_PLATFORM_TEMPLATE } from '@/components/report-sections/organic-social/template'

const c = (channels: string[] | undefined, hidden: string[] = [], influencerSection?: unknown) =>
  ({ dashSocialConfig: { channels, ...(influencerSection === undefined ? {} : { influencerSection }) }, hiddenReports: hidden })

test('the tab exists when the Instagram tab is shown and the Instagram influencer section is not hidden', () => {
  expect(hasInfluencerTab(c(['instagram', 'facebook', 'linkedin']))).toBe(true)
  expect(hasInfluencerTab(c(undefined))).toBe(true) // no allowlist: the four defaults include Instagram
  expect(hasInfluencerTab(c(['instagram'], [], { INSTAGRAM: { label: 'Partnership Posts' } }))).toBe(true)
})

test('no tab without Instagram, with the Instagram tab hidden, or with the section hidden', () => {
  expect(hasInfluencerTab(c(['linkedin']))).toBe(false)
  expect(hasInfluencerTab(c(['instagram'], ['organic-instagram']))).toBe(false)
  expect(hasInfluencerTab(c(['instagram'], [], { INSTAGRAM: { hidden: true } }))).toBe(false)
  expect(hasInfluencerTab(c(['instagram'], [], { FACEBOOK: { hidden: true } }))).toBe(true)
  expect(hasInfluencerTab(c(['instagram'], [], 'nonsense'))).toBe(true) // invalid setting: today's section shows, so the tab does too
  expect(hasInfluencerTab({ dashSocialConfig: null, hiddenReports: [] })).toBe(true)
})

test('the split rule follows the pinned Top Content version of the platform composition', () => {
  expect(influencerRulesFor(ORGANIC_SOCIAL_PLATFORM_TEMPLATE, undefined)).toBe('designations') // @2 from the template
  expect(influencerRulesFor(ORGANIC_SOCIAL_PLATFORM_TEMPLATE, { versions: { 'top-content': 3 } })).toBe('outline')
  expect(influencerRulesFor({ order: [], labels: {}, thresholds: {} }, undefined)).toBe('designations') // no Top Content at all
})

test("a version 2 pin with a saved Instagram handle uses the author rule; everything else is unchanged (spec 2026-10-09 section 6)", () => {
  const handle = { ownHandles: { instagram: 'renbenefits' } }
  expect(influencerRulesFor(ORGANIC_SOCIAL_PLATFORM_TEMPLATE, undefined, handle)).toBe('author')
  expect(influencerRulesFor(ORGANIC_SOCIAL_PLATFORM_TEMPLATE, undefined, { ownHandles: { instagram: '  ' } })).toBe('designations')
  expect(influencerRulesFor(ORGANIC_SOCIAL_PLATFORM_TEMPLATE, undefined, {})).toBe('designations')
  expect(influencerRulesFor(ORGANIC_SOCIAL_PLATFORM_TEMPLATE, { versions: { 'top-content': 3 } }, handle)).toBe('outline')
  expect(influencerRulesFor(ORGANIC_SOCIAL_PLATFORM_TEMPLATE, { versions: { 'top-content': 1 } }, handle)).toBe('designations')
  expect(influencerRulesFor({ order: [], labels: {}, thresholds: {} }, undefined, handle)).toBe('designations')
})

// Paul, #334 review item 1: hiding the tab the usual way (hidden_reports) removed the tab while both galleries still
// dropped the Instagram influencer row, so those posts appeared nowhere.
test('hiding the Influencer tab through hidden_reports turns the tab rule off', () => {
  expect(hasInfluencerTab(c(['instagram'], ['organic-influencer']))).toBe(false)
})

// Item 12: one helper for the two galleries, keyed on the channel label, so the rule cannot drift between them.
test('withoutTabbedInfluencer drops the Instagram group only for a client with the tab', () => {
  const groups = [{ platform: 'Instagram', posts: [] }, { platform: 'Facebook', posts: [] }]
  expect(withoutTabbedInfluencer(groups, c(['instagram', 'facebook'])).map((g) => g.platform)).toEqual(['Facebook'])
  expect(withoutTabbedInfluencer(groups, c(['instagram', 'facebook'], ['organic-influencer'])).map((g) => g.platform)).toEqual(['Instagram', 'Facebook'])
  expect(withoutTabbedInfluencer(groups, null).map((g) => g.platform)).toEqual(['Instagram', 'Facebook'])
})
