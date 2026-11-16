import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { findElements, redirectOf, runRoute } from '@/lib/test-utils/element-tree'

/** The AEO Informed Social tab on the real report routes (plan Task 9, Review Focus 1 and 2): the routes read aeo= and aeomin=, keep them
 *  through their redirects, hand them to the section on the AEO tab only, and key its Suspense by them. Every other tab's props and key are
 *  exactly as before. Modelled on locked-months-routes.test.tsx: a fixed clock, the section stubbed with a named component. */
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getClientBySlug }))
vi.mock('@/components/report-sections/organic-social', () => ({ OrganicSocialReport: function OrganicSocialReport() { return null } }))
vi.mock('@/lib/auth/page-access', async (orig) => ({ ...(await orig<object>()), requireStaff: vi.fn(async () => undefined) }))

import PortalSpa from '@/app/portal/[clientSlug]/reports/page'
import DashboardSpa from '@/app/dashboard/[clientSlug]/reports/page'
import { OrganicSocialReport } from '@/components/report-sections/organic-social'
import { auth } from '@/auth'

const AEO_CLIENT = {
  name: 'Client', slug: 'c', logoUrl: null, enabledReports: ['organic-social'], hiddenReports: [] as string[], peecCustomerProjectId: 'or_p',
  dashSocialConfig: { brandId: 1, channels: ['instagram'], reportingMonths: { firstMonth: '2026-08' }, aeoInformedSocial: { enabled: true, allTimeFrom: '2026-01-22' } },
}
const SEP = 'custom:2026-09-01,2026-09-30'
const AUG = 'custom:2026-08-01,2026-08-31'
const LIVE = 'custom:2026-10-01,2026-10-19'
const ENC_SEP = encodeURIComponent(SEP)

type Route = (a: never) => Promise<unknown>
const spa = (Route: Route, q: Record<string, unknown>) =>
  Route({ params: Promise.resolve({ clientSlug: 'c' }), searchParams: Promise.resolve(q) } as never)
const as = (role: string) => vi.mocked(auth).mockResolvedValue({ user: { role, email: 'someone@example.com', clientSlug: 'c' } } as never)
const sectionOf = (tree: unknown) => findElements(tree, (e) => e.type === OrganicSocialReport)[0]?.props as Record<string, unknown> | undefined
const keyOf = (tree: unknown) => findElements(tree, (e) => typeof e.key === 'string' && e.key.startsWith('organic-social:'))[0]?.key

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-20T14:00:00Z'))
  getClientBySlug.mockResolvedValue(AEO_CLIENT)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.useRealTimers(); vi.mocked(auth).mockReset(); vi.restoreAllMocks() })

const ROUTES = [['portal', PortalSpa as Route, '/portal/c/reports'], ['dashboard', DashboardSpa as Route, '/dashboard/c/reports']] as const
for (const [name, Route, base] of ROUTES) {
  describe(`${name}`, () => {
    test('the AEO tab gets aeo and aeomin, parsed, and its Suspense key carries them', async () => {
      as('CLIENT_VIEWER')
      const r = await runRoute(spa(Route, { section: 'organic-social', subsection: 'organic-aeo-informed', dateRange: SEP, aeo: 'ytd', aeomin: '3' }))
      if (!('element' in r)) throw new Error(`unexpected redirect ${r.redirect}`)
      expect(sectionOf(r.element)).toMatchObject({ view: 'aeo-informed', dateRange: SEP, aeo: 'ytd', aeoMin: 3 })
      expect(keyOf(r.element)).toBe(`organic-social:organic-aeo-informed:${SEP}:${AUG}::aeo=ytd:3`)
    })
    test('unknown or missing values are Month and 2', async () => {
      as('CLIENT_VIEWER')
      const r = await runRoute(spa(Route, { section: 'organic-social', subsection: 'organic-aeo-informed', dateRange: SEP, aeo: 'YEAR', aeomin: '9' }))
      if (!('element' in r)) throw new Error('unexpected redirect')
      expect(sectionOf(r.element)).toMatchObject({ aeo: 'month', aeoMin: 2 })
      expect(keyOf(r.element)).toBe(`organic-social:organic-aeo-informed:${SEP}:${AUG}::aeo=month:2`)
    })
    test('every other tab: no aeo props and exactly today\'s Suspense key (Review Focus 2)', async () => {
      as('CLIENT_VIEWER')
      const r = await runRoute(spa(Route, { section: 'organic-social', subsection: 'organic-instagram', dateRange: SEP, aeo: 'ytd', aeomin: '3' }))
      if (!('element' in r)) throw new Error('unexpected redirect')
      const props = sectionOf(r.element)!
      expect(Object.keys(props).sort()).toEqual(['channel', 'clientSlug', 'compareRange', 'dateRange', 'view'])
      expect(keyOf(r.element)).toBe(`organic-social:organic-instagram:${SEP}:${AUG}:`)
    })
    test('the locked-month redirect keeps aeo and aeomin (Review Focus 1)', async () => {
      as('CLIENT_VIEWER')
      expect(await redirectOf(spa(Route, { section: 'organic-social', subsection: 'organic-aeo-informed', dateRange: LIVE, aeo: 'all', aeomin: '1' })))
        .toBe(`${base}?section=organic-social&subsection=organic-aeo-informed&aeo=all&aeomin=1&dateRange=${ENC_SEP}`)
    })
    test('the locked-month redirect drops default and unknown values, so the URL stays canonical', async () => {
      as('CLIENT_VIEWER')
      expect(await redirectOf(spa(Route, { section: 'organic-social', subsection: 'organic-aeo-informed', dateRange: LIVE, aeo: 'month', aeomin: '2' })))
        .toBe(`${base}?section=organic-social&subsection=organic-aeo-informed&dateRange=${ENC_SEP}`)
      expect(await redirectOf(spa(Route, { section: 'organic-social', subsection: 'organic-aeo-informed', dateRange: LIVE, aeo: ['ytd', 'all'], aeomin: 'x' })))
        .toBe(`${base}?section=organic-social&subsection=organic-aeo-informed&dateRange=${ENC_SEP}`)
    })
    test('a client without the tab: the subsection resolves to Overview and nothing AEO is passed', async () => {
      as('CLIENT_VIEWER')
      getClientBySlug.mockResolvedValue({ ...AEO_CLIENT, dashSocialConfig: { brandId: 1, channels: ['instagram'], reportingMonths: { firstMonth: '2026-08' } } })
      const r = await runRoute(spa(Route, { section: 'organic-social', subsection: 'organic-aeo-informed', dateRange: SEP, aeo: 'ytd' }))
      if (!('element' in r)) throw new Error('unexpected redirect')
      expect(sectionOf(r.element)).not.toHaveProperty('aeo')
      expect(sectionOf(r.element)).toMatchObject({ view: null, channel: null })
    })
  })
}

test('portal: the no-section redirect keeps the AEO tab\'s aeo and aeomin with its subsection', async () => {
  as('CLIENT_VIEWER')
  expect(await redirectOf(spa(PortalSpa as Route, { subsection: 'organic-aeo-informed', dateRange: SEP, aeo: 'ytd', aeomin: '4' })))
    .toBe(`/portal/c/reports?dateRange=${ENC_SEP}&subsection=organic-aeo-informed&aeo=ytd&aeomin=4&section=organic-social`)
})
