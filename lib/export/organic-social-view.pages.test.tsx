import { beforeEach, expect, test, vi } from 'vitest'
import { findElements, runRoute } from '@/lib/test-utils/element-tree'

/**
 * The export's header and filename name the page exactly as the live report pages do. This walks both
 * real routes (same harness as lib/export-period.pages.test.tsx) and holds organicSocialExportView's
 * title equal to the page's for Overview, a platform tab, and a bogus tab that degrades to Overview.
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
import { organicSocialExportView } from './organic-social-view'
import type { OrganicTabsClient } from '@/lib/constants'

const CLIENT = {
  name: 'Client', slug: 'c', logoUrl: null, enabledReports: ['organic-social'], hiddenReports: [],
  dashSocialConfig: { brandId: 1 }, reportSectionConfig: {},
}
// The page reads the whole row; the view reads only its tabs.
const TABS = CLIENT as unknown as OrganicTabsClient
const nameOf = (t: unknown) => (typeof t === 'function' ? (t as { name: string }).name : String(t))

beforeEach(() => {
  getClientBySlug.mockResolvedValue(CLIENT)
  vi.mocked(auth).mockResolvedValue({ user: { role: 'INTERNAL_ADMIN', email: 'someone@example.com', clientSlug: 'c' } } as never)
})

for (const [routeName, Route] of Object.entries({ portal: PortalSpa, dashboard: DashboardSpa })) {
  test.each([undefined, 'organic-linkedin', 'not-a-tab'])(`${routeName}: subsection %s is titled as the page titles it`, async (subsection) => {
    const r = await runRoute(Route({ params: Promise.resolve({ clientSlug: 'c' }),
      searchParams: Promise.resolve({ section: 'organic-social', dateRange: 'last_30_days', ...(subsection ? { subsection } : {}) }) } as never))
    if ('redirect' in r) throw new Error(`unexpected redirect to ${r.redirect}`)
    const [button] = findElements(r.element, (e) => nameOf(e.type) === 'ExportPdfButton')
    expect(organicSocialExportView(TABS, subsection ?? null).pageTitle).toBe(button.props.pageTitle)
  })
}

test('a platform tab resolves to its id; Overview and an unknown tab to none', () => {
  expect(organicSocialExportView(TABS, 'organic-linkedin')).toEqual({ subsectionId: 'organic-linkedin', pageTitle: 'LinkedIn' })
  expect(organicSocialExportView(TABS, null)).toEqual({ subsectionId: null, pageTitle: 'Organic Social' })
  expect(organicSocialExportView(TABS, 'not-a-tab')).toEqual({ subsectionId: null, pageTitle: 'Organic Social' })
})
