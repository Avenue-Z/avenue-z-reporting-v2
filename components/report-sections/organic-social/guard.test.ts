import { expect, test, vi } from 'vitest'

// Importing the registry pulls in the real top-content part, whose display component
// chains through DataTable -> EditableText -> app/actions/dashboard -> '@/auth'. Under
// Vitest's ESM resolver, next-auth's `next/server` import breaks (Next 16's package.json
// has no `exports` map). Real Next builds never hit this (RSC compiler strips 'use server'
// actions from client bundles); this mock only isolates the test from that unrelated chain.
vi.mock('@/auth', () => ({ auth: vi.fn() }))

import { assertReferencedPinsPublished, collectReferencedPins } from '@/lib/report-sections/registry'
import { ORGANIC_SOCIAL_PARTS } from './parts/registry'
import { ORGANIC_SOCIAL_TEMPLATE, ORGANIC_SOCIAL_PLATFORM_TEMPLATE } from './template'

test('every organic-social template pin exists and is published', () => {
  for (const template of [ORGANIC_SOCIAL_TEMPLATE, ORGANIC_SOCIAL_PLATFORM_TEMPLATE]) {
    const violations = assertReferencedPinsPublished(ORGANIC_SOCIAL_PARTS, collectReferencedPins(template, []))
    expect(violations).toEqual([])
  }
})
