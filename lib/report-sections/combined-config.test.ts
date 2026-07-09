import { expect, test, vi } from 'vitest'

// Importing PR_INFLUENCE_PARTS transitively pulls in lib/db/client, which throws at
// module init without DATABASE_URL. Placeholder only, same pattern used elsewhere
// in the repo (e.g. pr-influence/ctx.snapshot.test.ts).
vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgresql://user:password@host.tld/dbname'
})

// SHARED_PARTS imports CommentarySection, which imports '@/auth' (next-auth), which
// vitest's node resolver cannot load outside a Next.js runtime ("Cannot find module
// next/server"). Stub the module out; this test only needs the SHARED_PARTS registry
// shape (id/version keys), not the real render function.
vi.mock('@/components/report-sections/commentary', () => ({ CommentarySection: () => null }))

import { parseReportSectionConfig } from './validate'
import { resolveSection } from './resolve'
import { PR_INFLUENCE_PARTS } from '@/components/report-sections/peec-ai/pr-influence/parts/registry'
import { PR_INFLUENCE_TEMPLATE } from '@/components/report-sections/peec-ai/pr-influence/template'
import { SHARED_PARTS } from '@/components/report-sections/shared/parts/registry'

const KEY = 'peec-ai:pr-influence'
const registries = { [KEY]: PR_INFLUENCE_PARTS as never }
const combined = { [KEY]: { hidden: ['sentiment-insights'], sharedParts: [{ id: 'commentary', version: 1 }] } }

test('validate: one key carries both body hidden and sharedParts, each against its own registry', () => {
  const cfg = parseReportSectionConfig(combined, registries, {}, SHARED_PARTS as never)
  expect(cfg[KEY].hidden).toEqual(['sentiment-insights'])
  expect(cfg[KEY].sharedParts).toEqual([{ id: 'commentary', version: 1 }])
})

test('validate: an unknown shared pin is rejected even alongside valid body config', () => {
  const bad = { [KEY]: { hidden: ['sentiment-insights'], sharedParts: [{ id: 'nope', version: 1 }] } }
  expect(() => parseReportSectionConfig(bad, registries, {}, SHARED_PARTS as never)).toThrow()
})

test('resolveSection drops the hidden body part and ignores sharedParts', () => {
  const resolved = resolveSection(PR_INFLUENCE_TEMPLATE, combined[KEY] as never)
  const ids = resolved.map((r) => r.id)
  expect(ids).toEqual(['pr-synopsis', 'pr-placement-matchback', 'editorial-and-clusters', 'brand-absent-editorial'])
  expect(ids).not.toContain('sentiment-insights')
})
