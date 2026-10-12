import { expect, test } from 'vitest'
import { notesOn } from './enabled'

test('on for a client on locked months, whatever chartNotes says', () => {
  expect(notesOn({ dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } } })).toBe(true)
  expect(notesOn({ dashSocialConfig: { brandId: 1, reportingMonths: 'broken', chartNotes: false } })).toBe(true)
})
test('on for a live client only when chartNotes is exactly true', () => {
  expect(notesOn({ dashSocialConfig: { brandId: 1, chartNotes: true } })).toBe(true)
  for (const v of [undefined, false, 'true', 1, {}, null]) expect(notesOn({ dashSocialConfig: { brandId: 1, chartNotes: v } })).toBe(false)
})
test('off for anything without a usable config', () => {
  for (const c of [undefined, null, 'x', {}, { dashSocialConfig: null }, { dashSocialConfig: [] }]) expect(notesOn(c)).toBe(false)
})
