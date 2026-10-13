import { beforeEach, expect, test, vi } from 'vitest'
import { findElements, runRoute } from '@/lib/test-utils/element-tree'

/**
 * What the Export PDF button sends once a section is switched on (AEO and Paid Media are, in their own PRs). The
 * button must send the tab the page resolved, not the raw URL param: the route accepts only a slug-shaped tab, so a
 * raw `?subsection=Technical-Audit` (which the page shows as Overview) would fail the export with a 400 (final review
 * of PR 1, Important 1). Here every section is switched on, so the payload is pinned before PRs 2 and 3 flip the list.
 */
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getClientBySlug }))
vi.mock('@/lib/auth/page-access', async (orig) => ({ ...(await orig<object>()), requireStaff: vi.fn(async () => undefined), requirePortalAccess: vi.fn(async () => undefined) }))
vi.mock('@/lib/export/sections', async (orig) => {
  const all = ['organic-social', 'peec-ai', 'paid-media'] as const
  return { ...(await orig<object>()), SERVER_EXPORT_SECTIONS: all, isServerExportSection: (s: unknown) => (all as readonly unknown[]).includes(s) }
})
const { stub } = vi.hoisted(() => ({ stub: (name: string) => ({ [name]: { [name]: () => null }[name] }) }))
vi.mock('@/components/report-sections/organic-social', () => stub('OrganicSocialReport'))
vi.mock('@/components/report-sections/peec-ai', () => stub('PeecAIReport'))
vi.mock('@/components/report-sections/peec-ai/pr-influence', () => stub('PRInfluenceReport'))
vi.mock('@/components/report-sections/peec-ai/content-impact', () => stub('ContentImpactReport'))
vi.mock('@/components/report-sections/peec-ai/technical-audit', () => stub('TechnicalAuditReport'))
vi.mock('@/components/report-sections/paid-media/overview', () => stub('PaidMediaOverviewReport'))
vi.mock('@/components/report-sections/paid-search', () => stub('PaidSearchReport'))
vi.mock('@/components/report-sections/meta-ads', () => stub('MetaAdsReport'))
vi.mock('@/components/report-sections/linkedin-ads', () => stub('LinkedInAdsReport'))

import PortalSpa from '@/app/portal/[clientSlug]/reports/page'
import DashboardSpa from '@/app/dashboard/[clientSlug]/reports/page'
import { auth } from '@/auth'
import { parseExportRequest } from '@/lib/export/request'

const CLIENT = {
  name: 'Client', slug: 'c', logoUrl: null, enabledReports: ['organic-social', 'peec-ai', 'paid-media'], hiddenReports: ['meta'],
  dashSocialConfig: { brandId: 1 }, reportSectionConfig: {},
}
const nameOf = (t: unknown) => (typeof t === 'function' ? (t as { name: string }).name : String(t))

beforeEach(() => {
  getClientBySlug.mockResolvedValue(CLIENT)
  vi.mocked(auth).mockResolvedValue({ user: { role: 'INTERNAL_ADMIN', email: 'someone@example.com', clientSlug: 'c' } } as never)
})

for (const [routeName, Route] of Object.entries({ portal: PortalSpa, dashboard: DashboardSpa })) {
  test.each([
    ['peec-ai', 'pr-influence', 'pr-influence'],
    ['peec-ai', 'Technical-Audit', null], // not a tab id: the page shows Overview
    ['peec-ai', 'pr_influence', null],
    ['peec-ai', 'not-a-tab', null],
    ['paid-media', 'linkedin', 'linkedin'],
    ['paid-media', 'meta', null], // hidden for this client: the page shows Overview
  ])(`${routeName}: %s tab %s is sent as the tab the page resolved (%s), and the route accepts it`, async (section, subsection, sent) => {
    const r = await runRoute(Route({ params: Promise.resolve({ clientSlug: 'c' }),
      searchParams: Promise.resolve({ section, subsection, dateRange: 'last_30_days', models: 'Claude,ChatGPT' }) } as never))
    if ('redirect' in r) throw new Error(`unexpected redirect to ${r.redirect}`)
    const [button] = findElements(r.element, (e) => nameOf(e.type) === 'ExportPdfButton')
    const payload = button.props.serverExport as Record<string, unknown>
    expect(payload).toMatchObject({ section, subsection: sent })
    expect(payload.models).toBe(section === 'peec-ai' ? 'ChatGPT,Claude' : null)
    expect(parseExportRequest({ ...payload, tz: 'UTC' })).not.toBeNull()
  })
}
