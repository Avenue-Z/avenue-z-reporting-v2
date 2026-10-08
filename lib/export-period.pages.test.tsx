import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { findElements, runRoute } from '@/lib/test-utils/element-tree'

/**
 * The Export PDF stamp states a reporting period only where the page's date range applies. The page
 * header already says where that is: it shows a date picker exactly for the sections that honour
 * ?dateRange. Executive Overview, for one, hard-codes its own window, so a dateRange carried over in
 * the URL must not be stamped on it. This walks the real routes and holds stamp ⇔ picker.
 * Same harness as lib/organic-social/locked-months-parity.test.tsx: nothing renders or fetches.
 */
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getClientBySlug }))
vi.mock('@/components/report-sections/organic-social', () => ({
  OrganicSocialReport: function OrganicSocialReport() { return null },
}))
vi.mock('@/lib/auth/page-access', async (orig) => ({ ...(await orig<object>()), requireStaff: vi.fn(async () => undefined) }))

import PortalSpa from '@/app/portal/[clientSlug]/reports/page'
import DashboardSpa from '@/app/dashboard/[clientSlug]/reports/page'
import { auth } from '@/auth'

const SECTIONS = ['ga4', 'inbound-funnel', 'paid-media', 'organic-social', 'peec-ai', 'executive-overview', 'request-a-report']
const CASES: [string, string | undefined][] = [
  ['ga4', undefined], ['ga4', 'pacing'], ['ga4', 'search-console'],
  ['inbound-funnel', undefined], ['inbound-funnel', 'pacing'],
  ['paid-media', undefined], ['paid-media', 'meta'],
  ['organic-social', undefined],
  ['peec-ai', undefined], ['peec-ai', 'technical-audit'],
  ['executive-overview', undefined], ['request-a-report', undefined],
]
const ROUTES = { portal: PortalSpa, dashboard: DashboardSpa } as const
const PICKERS = new Set(['GA4DatePicker', 'OrganicRangeControl'])
const nameOf = (t: unknown) => (typeof t === 'function' ? (t as { name: string }).name : String(t))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-05T12:00:00Z'))
  getClientBySlug.mockResolvedValue({
    name: 'Client', slug: 'c', logoUrl: null, enabledReports: SECTIONS, hiddenReports: [],
    dashSocialConfig: { brandId: 1 }, reportSectionConfig: {},
  })
  vi.mocked(auth).mockResolvedValue({ user: { role: 'INTERNAL_ADMIN', email: 'someone@example.com', clientSlug: 'c' } } as never)
})
afterEach(() => vi.useRealTimers())

for (const [routeName, Route] of Object.entries(ROUTES)) {
  test.each(CASES)(`${routeName}: %s / %s stamps a period exactly when the header shows a date picker`, async (section, subsection) => {
    const r = await runRoute(Route({ params: Promise.resolve({ clientSlug: 'c' }),
      searchParams: Promise.resolve({ section, dateRange: 'last_month', ...(subsection ? { subsection } : {}) }) } as never))
    if ('redirect' in r) return // a subsection this route doesn't serve: nothing is exported from it
    const picker = findElements(r.element, (e) => PICKERS.has(nameOf(e.type))).length > 0
    const [button] = findElements(r.element, (e) => nameOf(e.type) === 'ExportPdfButton')
    expect(button, 'Export PDF button').toBeDefined()
    expect(button.props.periodLabel !== null).toBe(picker)
  })

  test(`${routeName}: Executive Overview ignores ?dateRange, so its export states no period`, async () => {
    const r = await runRoute(Route({ params: Promise.resolve({ clientSlug: 'c' }),
      searchParams: Promise.resolve({ section: 'executive-overview', dateRange: 'last_month' }) } as never))
    if ('redirect' in r) throw new Error('unexpected redirect')
    const [button] = findElements(r.element, (e) => nameOf(e.type) === 'ExportPdfButton')
    expect(button.props.periodLabel).toBeNull()
  })
}
