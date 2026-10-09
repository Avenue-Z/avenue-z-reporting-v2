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
import OrganicSocialExportPage from '@/app/export/[clientSlug]/organic-social/page'
import type { OrganicTabsClient } from '@/lib/constants'

const CLIENT = {
  name: 'Client', slug: 'c', logoUrl: null, enabledReports: ['organic-social', 'paid-media'], hiddenReports: [],
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
  test.each([undefined, 'organic-linkedin', 'organic-influencer', 'not-a-tab'])(`${routeName}: subsection %s is titled as the page titles it`, async (subsection) => {
    const r = await runRoute(Route({ params: Promise.resolve({ clientSlug: 'c' }),
      searchParams: Promise.resolve({ section: 'organic-social', dateRange: 'last_30_days', ...(subsection ? { subsection } : {}) }) } as never))
    if ('redirect' in r) throw new Error(`unexpected redirect to ${r.redirect}`)
    const [button] = findElements(r.element, (e) => nameOf(e.type) === 'ExportPdfButton')
    expect(organicSocialExportView(TABS, subsection ?? null).pageTitle).toBe(button.props.pageTitle)
  })
}

test('a platform tab resolves to its id; Overview and an unknown tab to none', () => {
  // One lookup gives the export page everything: the tab, its channel and its title (Thomas, #332 page.tsx:41).
  expect(organicSocialExportView(TABS, 'organic-linkedin')).toEqual({ subsectionId: 'organic-linkedin', channel: 'LINKEDIN', view: null, pageTitle: 'LinkedIn' })
  expect(organicSocialExportView(TABS, null)).toEqual({ subsectionId: null, channel: null, view: null, pageTitle: 'Organic Social' })
  expect(organicSocialExportView(TABS, 'not-a-tab')).toEqual({ subsectionId: null, channel: null, view: null, pageTitle: 'Organic Social' })
})

// #334 (task B7): the Influencer tab has no channel but a view, so the export must carry the view, or it would print
// Overview under the title "Organic Social".
test('the Influencer tab resolves to its id, no channel, the influencer view and the title Influencer', () => {
  expect(organicSocialExportView(TABS, 'organic-influencer')).toEqual({ subsectionId: 'organic-influencer', channel: null, view: 'influencer', pageTitle: 'Influencer' })
})

test('the export page hands the report the tab\'s view and channel', async () => {
  const reportProps = async (subsection: string) => {
    const r = await runRoute(OrganicSocialExportPage({ params: Promise.resolve({ clientSlug: 'c' }),
      searchParams: Promise.resolve({ subsection, dateRange: 'last_30_days' }) } as never))
    if ('redirect' in r) throw new Error(`unexpected redirect to ${r.redirect}`)
    return findElements(r.element, (e) => nameOf(e.type) === 'OrganicSocialReport')[0].props
  }
  expect(await reportProps('organic-influencer')).toMatchObject({ channel: null, view: 'influencer' })
  expect(await reportProps('organic-linkedin')).toMatchObject({ channel: 'LINKEDIN', view: null })
})

// Organic Social exports on the server (app/api/export/pdf); every other section still prints in the browser.
for (const [routeName, Route] of Object.entries({ portal: PortalSpa, dashboard: DashboardSpa })) {
  const button = async (q: Record<string, string>) => {
    const r = await runRoute(Route({ params: Promise.resolve({ clientSlug: 'c' }), searchParams: Promise.resolve(q) } as never))
    if ('redirect' in r) throw new Error(`unexpected redirect to ${r.redirect}`)
    return findElements(r.element, (e) => nameOf(e.type) === 'ExportPdfButton')[0]
  }

  test(`${routeName}: Organic Social's button exports the served view on the server`, async () => {
    const b = await button({ section: 'organic-social', subsection: 'organic-linkedin', dateRange: 'custom:2026-09-01,2026-09-30', compareRange: 'previous_period' })
    expect(b.props.serverExport).toEqual({ clientSlug: 'c', subsection: 'organic-linkedin', dateRange: 'custom:2026-09-01,2026-09-30', compareRange: 'previous_period' })
    expect((await button({ section: 'organic-social', dateRange: 'last_30_days' })).props.serverExport)
      .toEqual({ clientSlug: 'c', subsection: null, dateRange: 'last_30_days', compareRange: null })
  })

  test(`${routeName}: other sections keep the browser print`, async () => {
    expect((await button({ section: 'paid-media', dateRange: 'last_30_days' })).props.serverExport).toBeUndefined()
  })
}
