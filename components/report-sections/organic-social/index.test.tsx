import { expect, test, vi } from 'vitest'

// index.tsx -> parts registry -> top-content display -> DataTable -> '@/auth' (next-auth's
// `next/server` import breaks under Vitest's ESM resolver; real Next builds never hit this).
vi.mock('@/auth', () => ({ auth: vi.fn() }))
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

import { OrganicSocialReport } from './index'

test('a template/config lookup failure degrades to the code template — it does NOT reject and blank the whole section', async () => {
  getSectionTemplate.mockRejectedValue(new Error('DB down'))
  getClientBySlug.mockRejectedValue(new Error('DB down'))
  // Before the defensive resolution this top-level await rejected, taking the entire
  // Organic Social section to the route error boundary. It must now resolve so each part
  // renders behind its own Suspense/safe() boundary.
  await expect(OrganicSocialReport({ clientSlug: 'renaissance' })).resolves.toBeTruthy()
})

test('happy path resolves with no DB row (code-template fallback) and a present client config', async () => {
  getSectionTemplate.mockResolvedValue(null) // no seeded row yet (M4) -> code template
  getClientBySlug.mockResolvedValue({ reportSectionConfig: {} })
  await expect(OrganicSocialReport({ clientSlug: 'renaissance' })).resolves.toBeTruthy()
})
