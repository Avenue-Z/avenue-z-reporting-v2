import { beforeEach, expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { elementTree, runRoute, type RouteResult } from '@/lib/test-utils/element-tree'

/**
 * Pre-change record for locked months (spec section 8). For clients WITHOUT `reportingMonths`, the
 * four real route modules must return exactly the same element tree after the build as before it.
 * The section is stubbed with a named component so its props are what the route passed; nothing
 * renders and nothing fetches. Each case is stored as a digest of the whole serialised tree, plus
 * one full tree per route and fixture for reading.
 */
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getClientBySlug }))
vi.mock('@/components/report-sections/organic-social', () => ({
  OrganicSocialReport: function OrganicSocialReport() { return null },
}))

import PortalSpa from '@/app/portal/[clientSlug]/reports/page'
import DashboardSpa from '@/app/dashboard/[clientSlug]/reports/page'
import PortalDeepLink from '@/app/portal/[clientSlug]/reports/[reportSlug]/page'
import DashboardDeepLink from '@/app/dashboard/[clientSlug]/reports/[reportSlug]/page'
import { auth } from '@/auth'

const serialise = (r: RouteResult) => ('redirect' in r ? r : { tree: elementTree(r.element) })
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16)

// Shapes, not values. Keys mirror the production baseline (~/.claude/renaissance-baseline).
const FIXTURES = {
  'renaissance-shaped': {
    name: 'Client', slug: 'c', logoUrl: null,
    enabledReports: ['organic-social', 'paid-media', 'peec-ai', 'request-a-report', 'executive-overview'],
    hiddenReports: ['technical-audit', 'content-impact'],
    dashSocialConfig: { brandId: 1 },
    reportSectionConfig: { 'organic-social': { sharedParts: [{ id: 'commentary', version: 1 }] } },
  },
  // hiddenReports deliberately omits 'organic-overview': PR 255 changes that shape's landing tab on
  // purpose, so pinning it here would tie this record to whether 255 merged first. The lock gates
  // only on reportingMonths, so this shape exercises the same path.
  'new-client-shaped, no reportingMonths': {
    name: 'Client', slug: 'c', logoUrl: null,
    enabledReports: ['organic-social'],
    hiddenReports: [],
    dashSocialConfig: { brandId: 1, channels: ['instagram', 'facebook', 'linkedin'] },
    reportSectionConfig: { 'organic-social': { sharedParts: [{ id: 'commentary', version: 1 }] } },
  },
} as const

const RANGES: (string | string[] | undefined)[] = [
  undefined, 'last_30_days', 'last_month', 'custom:2026-08-01,2026-08-31', 'custom:2026-08-01,2026-08-15', 'junk', ['last_30_days', 'x'],
]
const COMPARES: (string | undefined)[] = [undefined, 'previous_year']
const ROLES = ['INTERNAL_ADMIN', 'CLIENT_VIEWER'] as const

const sp = (o: Record<string, unknown>) => Promise.resolve(Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)))
const ROUTES: Record<string, (q: Record<string, unknown>) => Promise<unknown>> = {
  'portal spa': (q) => PortalSpa({ params: Promise.resolve({ clientSlug: 'c' }), searchParams: sp({ section: 'organic-social', ...q }) } as never),
  'dashboard spa': (q) => DashboardSpa({ params: Promise.resolve({ clientSlug: 'c' }), searchParams: sp({ section: 'organic-social', ...q }) } as never),
  'portal deep link': (q) => PortalDeepLink({ params: Promise.resolve({ clientSlug: 'c', reportSlug: 'organic-social' }), searchParams: sp(q) } as never),
  'dashboard deep link': (q) => DashboardDeepLink({ params: Promise.resolve({ clientSlug: 'c', reportSlug: 'organic-social' }), searchParams: sp(q) } as never),
}

beforeEach(() => vi.mocked(auth).mockReset())

for (const [fixtureName, fixture] of Object.entries(FIXTURES)) {
  for (const [routeName, route] of Object.entries(ROUTES)) {
    test(`${routeName}, ${fixtureName}: returned tree is unchanged`, async () => {
      getClientBySlug.mockResolvedValue(fixture)
      const digests: Record<string, string> = {}
      let representative: unknown = null
      for (const role of ROLES) {
        vi.mocked(auth).mockResolvedValue({ user: { role, email: 'someone@example.com' } } as never)
        for (const dateRange of RANGES) {
          for (const compareRange of COMPARES) {
            const out = serialise(await runRoute(route({ dateRange, compareRange })))
            digests[`${role} ${JSON.stringify(dateRange)} ${compareRange ?? '-'}`] = digest(out)
            if (role === 'INTERNAL_ADMIN' && dateRange === undefined && compareRange === undefined) representative = out
          }
        }
        if (routeName === 'dashboard spa' || routeName === 'portal deep link') {
          digests[`${role} health`] = digest(serialise(await runRoute(route({ dateRange: 'last_30_days', health: '1' }))))
        }
      }
      expect({ digests, representative }).toMatchSnapshot()
    })
  }
}

test('renaissance-shaped: another section on the SPA routes is unchanged', async () => {
  getClientBySlug.mockResolvedValue(FIXTURES['renaissance-shaped'])
  vi.mocked(auth).mockResolvedValue({ user: { role: 'INTERNAL_ADMIN', email: 'someone@example.com' } } as never)
  const q = sp({ section: 'paid-media', dateRange: 'last_30_days' })
  const portal = serialise(await runRoute(PortalSpa({ params: Promise.resolve({ clientSlug: 'c' }), searchParams: q } as never)))
  const dash = serialise(await runRoute(DashboardSpa({ params: Promise.resolve({ clientSlug: 'c' }), searchParams: q } as never)))
  expect({ portal: digest(portal), dash: digest(dash) }).toMatchSnapshot()
})
