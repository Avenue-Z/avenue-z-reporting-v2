import { expect, test, vi } from 'vitest'

// Importing PR_INFLUENCE_PARTS transitively pulls in lib/db/client, which throws at
// module init without DATABASE_URL. Placeholder only, same pattern used elsewhere
// in the repo (e.g. ctx.snapshot.test.ts).
vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgresql://user:password@host.tld/dbname'
})

import { assertReferencedPinsPublished, collectReferencedPins } from '@/lib/report-sections/registry'
import { PR_INFLUENCE_PARTS } from './parts/registry'
import { PR_INFLUENCE_TEMPLATE } from './template'

test('every PR Influence template pin exists and is published', () => {
  const violations = assertReferencedPinsPublished(PR_INFLUENCE_PARTS, collectReferencedPins(PR_INFLUENCE_TEMPLATE, []))
  expect(violations).toEqual([])
})
