import { expect, test } from 'vitest'
import { assertReferencedPinsPublished, collectReferencedPins, mergeRegistries } from '@/lib/report-sections/registry'
import { PEEC_PARTS } from './parts/registry'
import { BESPOKE_PARTS } from './parts/bespoke/registry'
import { PEEC_TEMPLATE } from './template'

test('every AEO template pin exists and is published (core + bespoke)', () => {
  const reg = mergeRegistries(PEEC_PARTS, BESPOKE_PARTS)
  const violations = assertReferencedPinsPublished(reg, collectReferencedPins(PEEC_TEMPLATE, []))
  expect(violations).toEqual([])
})
