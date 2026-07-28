import { expect, test, vi } from 'vitest'

// @/auth is stubbed globally in vitest.setup.ts (index.tsx -> parts registry -> top-content
// display -> DataTable -> next-auth landmine); no per-file @/auth mock needed here.
vi.mock('@/lib/organic-social/headlines', () => import('./parts/__mocks__/headlines'))
vi.mock('@/lib/organic-social/trends', () => import('./parts/__mocks__/trends'))
vi.mock('@/lib/organic-social/top-content', () => import('./parts/__mocks__/top-content'))

// The two DB lookups the thin view awaits. Spread the real module so any transitive
// importer keeps its other exports; override only these two so we can make them throw.
// vi.hoisted: the mock factory is hoisted above the file, so the fns must be too.
const { getSectionTemplate, getClientBySlug } = vi.hoisted(() => ({
  getSectionTemplate: vi.fn(),
  getClientBySlug: vi.fn(),
}))
vi.mock('@/lib/db/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/queries')>()),
  getSectionTemplate,
  getClientBySlug,
}))

import { OrganicSocialReport, OrganicSocialBody } from './index'
import { buildOrganicSocialCtx } from './ctx'

const ctx = buildOrganicSocialCtx({ clientSlug: 'renaissance', channel: null })

// R1 #6: the outer report is synchronous so the section skeletons paint before the template
// resolves. The template/config resolution + resilience now lives in the async OrganicSocialBody.
test('the outer report is synchronous — first paint is not gated on the DB template lookup', () => {
  const el = OrganicSocialReport({ clientSlug: 'renaissance' })
  expect(el).toBeTruthy()
  expect(el).not.toHaveProperty('then') // a React element, not a promise
})

test('OrganicSocialBody: a template/config lookup failure degrades to the code template (does NOT blank the section) and logs a signal', async () => {
  getSectionTemplate.mockRejectedValue(new Error('DB down'))
  getClientBySlug.mockRejectedValue(new Error('DB down'))
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  // Before the defensive resolution this await rejected, taking the entire Organic Social
  // section to the route error boundary. It must now resolve so each part renders behind its
  // own Suspense/safe() boundary — and the silent degrade must leave a signal in the log.
  await expect(OrganicSocialBody({ ctx })).resolves.toBeTruthy()
  expect(err).toHaveBeenCalledWith(expect.stringContaining('template/config lookup failed'), expect.any(Error))
  err.mockRestore()
})

test('OrganicSocialBody: happy path resolves with no DB row (code-template fallback) and a present client config', async () => {
  getSectionTemplate.mockResolvedValue(null) // no seeded row yet (M4) -> code template
  getClientBySlug.mockResolvedValue({ reportSectionConfig: {} })
  await expect(OrganicSocialBody({ ctx })).resolves.toBeTruthy()
})
