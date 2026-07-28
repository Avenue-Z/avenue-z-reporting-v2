import { expect, test } from 'vitest'

// @/auth is stubbed globally in vitest.setup.ts (importing the registry reaches the real
// top-content part's DataTable display chain -> next-auth landmine); no per-file mock needed.
import { assertReferencedPinsPublished, collectReferencedPins } from '@/lib/report-sections/registry'
import { ORGANIC_SOCIAL_PARTS } from './parts/registry'
import { ORGANIC_SOCIAL_TEMPLATE, ORGANIC_SOCIAL_PLATFORM_TEMPLATE } from './template'

test('every organic-social template pin exists and is published', () => {
  for (const template of [ORGANIC_SOCIAL_TEMPLATE, ORGANIC_SOCIAL_PLATFORM_TEMPLATE]) {
    const violations = assertReferencedPinsPublished(ORGANIC_SOCIAL_PARTS, collectReferencedPins(template, []))
    expect(violations).toEqual([])
  }
})
