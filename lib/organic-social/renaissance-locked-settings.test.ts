import { expect, test } from 'vitest'
import { resolveSection } from '@/lib/report-sections/resolve'
import { validateSectionOverride } from '@/lib/report-sections/mutations'
import { REGISTRIES } from '@/lib/report-sections/registries'
import { SHARED_PARTS } from '@/components/report-sections/shared/parts/registry'
import type { PartRegistry, SectionOverride, SectionTemplate } from '@/lib/report-sections/types'
import { clockFor, hasReportingMonths, resolveLockedRange } from './reporting-months'

// Renaissance's production rows, verbatim (read-only probe, 2026-10-12): its organic-social:platform override and the
// organic-social:platform section_templates row. Neither holds an id or a secret.
const PROD_OVERRIDE: SectionOverride = { order: ['ytd-review', 'platform-headlines', 'follower-graph', 'engagement-trend', 'top-content'], versions: { 'follower-graph': 2, 'engagement-trend': 2 }, extraParts: [{ id: 'ytd-review', version: 3 }] }
const PROD_TEMPLATE: SectionTemplate = { order: [{ id: 'platform-headlines', version: 1 }, { id: 'follower-graph', version: 1 }, { id: 'engagement-trend', version: 1 }, { id: 'top-content', version: 2 }], labels: {}, thresholds: {} }
// The switch (spec 4.1): the YTD pin moves to @4 and reportingMonths is added. Nothing else changes.
const AFTER: SectionOverride = { ...PROD_OVERRIDE, extraParts: [{ id: 'ytd-review', version: 4 }] }
const RM = { firstMonth: '2026-07', clientMonths: 1 }
const pins = (o: SectionOverride) => resolveSection(PROD_TEMPLATE, o).map((r) => `${r.id}@${r.version}`)

test('the production override resolves to @3 today and to @4 after the switch, nothing else moving', () => {
  expect(pins(PROD_OVERRIDE)).toEqual(['ytd-review@3', 'platform-headlines@1', 'follower-graph@2', 'engagement-trend@2', 'top-content@2'])
  expect(pins(AFTER)).toEqual(['ytd-review@4', 'platform-headlines@1', 'follower-graph@2', 'engagement-trend@2', 'top-content@2'])
})

test('the swap only works because the override has no versions pin for ytd-review (resolve.ts:43-45)', () => {
  expect(PROD_OVERRIDE.versions).not.toHaveProperty('ytd-review')
  expect(pins({ ...AFTER, versions: { ...AFTER.versions, 'ytd-review': 3 } })[0]).toBe('ytd-review@3')
})

test('the switched override passes validateSectionOverride', () => {
  expect(() => validateSectionOverride('organic-social:platform', AFTER, REGISTRIES, PROD_TEMPLATE.order.map((p) => p.id), SHARED_PARTS as unknown as PartRegistry<unknown>)).not.toThrow()
})

test('with reportingMonths the month picker serves the expected months on 2026-10-13', () => {
  const clock = clockFor(new Date('2026-10-13T15:00:00Z'))
  expect(hasReportingMonths({ dashSocialConfig: { brandId: 1, reportingMonths: RM } })).toBe(true)
  expect(resolveLockedRange(RM, 'team', clock, undefined).months.map((m) => m.key)).toEqual(['2026-10', '2026-09', '2026-08', '2026-07'])
  expect(resolveLockedRange(RM, 'client', clock, undefined).months.map((m) => m.key)).toEqual(['2026-09'])
})
