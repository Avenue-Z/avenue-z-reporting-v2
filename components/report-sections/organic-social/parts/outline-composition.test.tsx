import { expect, test, vi } from 'vitest'

vi.mock('@/lib/organic-social/headlines', () => import('./__mocks__/headlines'))
vi.mock('@/lib/organic-social/trends', () => import('./__mocks__/trends'))
vi.mock('@/lib/organic-social/top-content', () => import('./__mocks__/top-content'))

import { resolveSection } from '@/lib/report-sections/resolve'
import { REGISTRIES } from '@/lib/report-sections/registries'
import { promotionViolations, validateSectionOverride } from '@/lib/report-sections/mutations'
import { ORGANIC_SOCIAL_PLATFORM_TEMPLATE } from '../template'
import type { SectionOverride } from '@/lib/report-sections/types'

const KEY = 'organic-social:platform'
const optIn = (v: 2 | 3) => ({
  versions: { 'platform-headlines': v },
  extraParts: [{ id: 'engagement-breakdown', version: 1 }],
  order: ['platform-headlines', 'follower-graph', 'engagement-trend', 'engagement-breakdown', 'top-content'],
})
const pins = (o?: SectionOverride) => resolveSection(ORGANIC_SOCIAL_PLATFORM_TEMPLATE, o).map((p) => `${p.id}@${p.version}`)

test("Renaissance's config (Commentary only, no platform entry) resolves to exactly today's parts", () => {
  const renaissanceShaped = { 'organic-social': { sharedParts: [{ id: 'commentary', version: 1 }] } } as Record<string, SectionOverride>
  expect(pins(renaissanceShaped[KEY])).toEqual(['platform-headlines@1', 'follower-graph@1', 'engagement-trend@1', 'top-content@2'])
})

test('the opt-in resolves to the outline order, the breakdown directly after the engagement graph', () => {
  expect(pins(optIn(2))).toEqual(['platform-headlines@2', 'follower-graph@1', 'engagement-trend@1', 'engagement-breakdown@1', 'top-content@2'])
  expect(pins(optIn(3))[0]).toBe('platform-headlines@3')
})

test("the opt-in passes the app's own validator with the real registries", () => {
  const ids = ORGANIC_SOCIAL_PLATFORM_TEMPLATE.order.map((p) => p.id)
  for (const v of [2, 3] as const) {
    expect(() => validateSectionOverride(KEY, optIn(v), REGISTRIES, ids)).not.toThrow()
  }
})

test('the new parts can never be promoted into the shared template Renaissance reads', () => {
  const next = { ...ORGANIC_SOCIAL_PLATFORM_TEMPLATE, order: [
    { id: 'platform-headlines', version: 2 }, { id: 'platform-headlines', version: 3 }, { id: 'engagement-breakdown', version: 1 },
  ] }
  expect(promotionViolations(next, REGISTRIES[KEY])).toEqual([
    'referenced part platform-headlines@2 is not published',
    'referenced part platform-headlines@3 is not published',
    'referenced part engagement-breakdown@1 is not published',
  ])
})
