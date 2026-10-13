import { expect, test } from 'vitest'
import { carriesRange, isOrganicSocialView } from './section-range'

test('in Organic Social: ?section=organic-social on the reports page, or the deep-link route', () => {
  expect(isOrganicSocialView('/dashboard/c/reports', 'organic-social')).toBe(true)
  expect(isOrganicSocialView('/portal/c/reports', 'organic-social')).toBe(true)
  expect(isOrganicSocialView('/dashboard/c/reports/organic-social', null)).toBe(true)
  expect(isOrganicSocialView('/portal/c/reports/organic-social', null)).toBe(true)
  expect(isOrganicSocialView('/dashboard/c/reports', 'paid-media')).toBe(false)
  expect(isOrganicSocialView('/portal/c/reports', null)).toBe(false)
  expect(isOrganicSocialView('/portal/c/reports/peec-ai', null)).toBe(false)
  expect(isOrganicSocialView('/portal/c/team', 'organic-social')).toBe(false)
})

test('a locked client drops the range only on a link that crosses the Organic Social boundary; everyone else keeps it', () => {
  expect(carriesRange(true, true, 'paid-media')).toBe(false)
  expect(carriesRange(true, false, 'organic-social')).toBe(false)
  expect(carriesRange(true, true, 'organic-social')).toBe(true)
  expect(carriesRange(true, false, 'peec-ai')).toBe(true)
  for (const inOrganic of [true, false]) for (const t of ['organic-social', 'paid-media']) expect(carriesRange(false, inOrganic, t)).toBe(true)
})
