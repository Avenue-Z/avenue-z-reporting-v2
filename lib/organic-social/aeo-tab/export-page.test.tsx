import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { findElements, runRoute } from '@/lib/test-utils/element-tree'

/** The PDF export page for the AEO Informed Social tab (plan Task 10): it renders the tab with the request's range and min and the export's
 *  30 s limit, and stamps the window it rendered. Every other export page and stamp is as before. */
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getClientBySlug }))
vi.mock('@/components/report-sections/organic-social', () => ({ OrganicSocialReport: function OrganicSocialReport() { return null } }))
vi.mock('@/lib/auth/page-access', async (orig) => ({ ...(await orig<object>()), requirePortalAccess: vi.fn(async () => ({ user: { role: 'INTERNAL_ADMIN' } })) }))

import ReportExportPage from '@/app/export/[clientSlug]/[section]/page'
import { OrganicSocialReport } from '@/components/report-sections/organic-social'
import { exportPeriodLabel } from '@/lib/export-period'

const CLIENT = {
  name: 'Client', slug: 'c', logoUrl: null, enabledReports: ['organic-social'], hiddenReports: [] as string[], peecCustomerProjectId: 'or_p',
  dashSocialConfig: { brandId: 1, channels: ['instagram'], aeoInformedSocial: { enabled: true, allTimeFrom: '2026-01-22' } },
}
const OCT = 'custom:2026-10-01,2026-10-31'
const open = async (q: Record<string, string>) => {
  const r = await runRoute(ReportExportPage({ params: Promise.resolve({ clientSlug: 'c', section: 'organic-social' }), searchParams: Promise.resolve({ dateRange: OCT, tz: 'UTC', ...q }) } as never))
  if (!('element' in r)) throw new Error('unexpected redirect')
  const report = findElements(r.element, (e) => e.type === OrganicSocialReport)[0]?.props as Record<string, unknown>
  const stamp = findElements(r.element, (e) => e.type === 'p' && typeof (e.props as { children?: unknown }).children === 'string' && String((e.props as { children: string }).children).includes('Exported'))[0]
  return { report, stamp: String((stamp?.props as { children?: string } | undefined)?.children ?? '') }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-12T15:00:00Z'))
  getClientBySlug.mockResolvedValue(CLIENT)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

test('the AEO tab renders with the request\'s range and min and the export\'s 30 s limit', async () => {
  const { report } = await open({ subsection: 'organic-aeo-informed', aeo: 'ytd', aeomin: '3' })
  expect(report).toMatchObject({ view: 'aeo-informed', aeo: 'ytd', aeoMin: 3, aeoDeadlineMs: 30_000, dateRange: OCT })
})
test('missing or unreadable values are Month and 2', async () => {
  const { report } = await open({ subsection: 'organic-aeo-informed', aeo: 'year', aeomin: '9' })
  expect(report).toMatchObject({ aeo: 'month', aeoMin: 2, aeoDeadlineMs: 30_000 })
})
test('the stamp names the range and the window it rendered', async () => {
  expect((await open({ subsection: 'organic-aeo-informed', aeo: 'ytd' })).stamp).toContain(`YTD, ${exportPeriodLabel('custom:2026-01-01,2026-10-31')}`)
  expect((await open({ subsection: 'organic-aeo-informed' })).stamp).toContain(`Month, ${exportPeriodLabel(OCT)}`)
})
test('every other tab: no aeo props and the same stamp as before', async () => {
  const { report, stamp } = await open({ subsection: 'organic-instagram', aeo: 'ytd', aeomin: '3' })
  expect(Object.keys(report).sort()).toEqual(['channel', 'clientSlug', 'compareRange', 'dateRange', 'view'])
  expect(stamp).toContain(exportPeriodLabel(OCT))
  expect(stamp).not.toContain('YTD')
})
