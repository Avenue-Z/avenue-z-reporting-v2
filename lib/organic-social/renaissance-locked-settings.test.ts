import { expect, test } from 'vitest'
import { resolveSection } from '@/lib/report-sections/resolve'
import { validateSectionOverride } from '@/lib/report-sections/mutations'
import { REGISTRIES } from '@/lib/report-sections/registries'
import { SHARED_PARTS } from '@/components/report-sections/shared/parts/registry'
import type { PartRegistry, SectionOverride, SectionTemplate } from '@/lib/report-sections/types'
import { clockFor, hasReportingMonths, resolveLockedRange } from './reporting-months'
import { lockedRangeFor } from './locked-range'
import { lockedFrom, settledThrough } from './lock-day'
import { notesOn } from './chart-notes/enabled'
import { ytdConfig } from './ytd'
import { ytdSheetFor } from './ytd-sheet'
import { toPortalSidebarClient } from '@/lib/portal/sidebar-client'
import type { Client } from '@/lib/db/schema'

// Renaissance's production rows, verbatim (read-only probe, 2026-10-12): its organic-social:platform override and the
// organic-social:platform section_templates row. Neither holds an id or a secret.
const PROD_OVERRIDE: SectionOverride = { order: ['ytd-review', 'platform-headlines', 'follower-graph', 'engagement-trend', 'top-content'], versions: { 'follower-graph': 2, 'engagement-trend': 2 }, extraParts: [{ id: 'ytd-review', version: 3 }] }
const PROD_TEMPLATE: SectionTemplate = { order: [{ id: 'platform-headlines', version: 1 }, { id: 'follower-graph', version: 1 }, { id: 'engagement-trend', version: 1 }, { id: 'top-content', version: 2 }], labels: {}, thresholds: {} }
// The switch (spec 4.1): the YTD pin moves to @4 and reportingMonths is added. Nothing else changes.
const AFTER: SectionOverride = { ...PROD_OVERRIDE, extraParts: [{ id: 'ytd-review', version: 4 }] }
const RM = { firstMonth: '2026-07', clientMonths: 1 }
// Renaissance's production dash_social_config, by shape (read-only probe 2026-10-13: brandId number, ytdSheets per year
// with tab and sheetId, chartNotes true, ownHandles.instagram), with every identifier replaced by a placeholder.
const PROD_DSC = { brandId: 1, ytdSheets: { 2026: { tab: 'Tab', sheetId: 'TESTSHEETID_abcdefghij0123' } }, chartNotes: true, ownHandles: { instagram: 'own-handle' } }
const AFTER_DSC = { ...PROD_DSC, reportingMonths: RM }
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

test("with Renaissance's real config shape: not locked today; after the switch every reader sees the same months and the rest of the config still works", () => {
  const clock = clockFor(new Date('2026-10-13T15:00:00Z'))
  const before = { slug: 'renaissance', dashSocialConfig: PROD_DSC }
  const after = { slug: 'renaissance', dashSocialConfig: AFTER_DSC }
  // Today: not on locked months, notes on through chartNotes (PR #306).
  expect(hasReportingMonths(before)).toBe(false)
  expect(lockedRangeFor(before, 'INTERNAL_ADMIN', undefined, clock)).toBeNull()
  expect(notesOn(before)).toBe(true)
  // After: locked, and the other keys do not get in the way.
  expect(hasReportingMonths(after)).toBe(true)
  expect(lockedRangeFor(after, 'INTERNAL_ADMIN', undefined, clock)!.months.map((m) => m.key)).toEqual(['2026-10', '2026-09', '2026-08', '2026-07'])
  expect(lockedRangeFor(after, 'CLIENT_VIEWER', undefined, clock)!.months.map((m) => m.key)).toEqual(['2026-09'])
  expect(lockedFrom(AFTER_DSC.reportingMonths)).toBe('2026-07-01')
  expect(settledThrough(AFTER_DSC.reportingMonths, clock.today)).toBe('2026-09-30')
  expect(notesOn(after)).toBe(true)
  expect(ytdConfig(AFTER_DSC.reportingMonths)).toEqual({ firstMonth: '2026-07', comparison: 'previous-month' })
  expect(ytdSheetFor(AFTER_DSC.ytdSheets, '2026').kind).toBe('ok')
})

test("the portal sidebar gets lockedMonths for the real config shape, and none of the config's identifiers", () => {
  const row = { slug: 'renaissance', name: 'Renaissance', logoUrl: null, enabledReports: ['organic-social', 'paid-media', 'peec-ai', 'request-a-report', 'executive-overview'], hiddenReports: ['technical-audit', 'content-impact'], dashSocialConfig: AFTER_DSC } as unknown as Client
  const out = toPortalSidebarClient(row)
  expect(out.lockedMonths).toBe(true)
  for (const id of ['TESTSHEETID', 'own-handle', 'reportingMonths', 'ytdSheets']) expect(JSON.stringify(out)).not.toContain(id)
})
