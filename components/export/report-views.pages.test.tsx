import { beforeEach, expect, test, vi } from 'vitest'
import { findElements, runRoute } from '@/lib/test-utils/element-tree'

/**
 * The export renders the live report: for every section and tab the export can render, the element
 * exportReportElement builds is the one each real report route renders (same component, same props),
 * and resolveExportView's title is the page's title. Spec 2026-10-08-pdf-export-all-reports-design §4.
 * Report components are stubbed by name, so nothing fetches.
 */
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getClientBySlug }))
vi.mock('@/lib/auth/page-access', async (orig) => ({ ...(await orig<object>()), requireStaff: vi.fn(async () => undefined), requirePortalAccess: vi.fn(async () => undefined) }))
// vi.mock factories are hoisted above the file, so the helper they call must be too.
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
import { parseModelsParam } from '@/lib/peec/models'
import { resolveExportView, type ExportViewClient } from '@/lib/export/report-view'
import { exportReportElement } from './report-element'
import type { ServerExportSection } from '@/lib/export/sections'

const REPORTS = new Set(['OrganicSocialReport', 'PeecAIReport', 'PRInfluenceReport', 'ContentImpactReport', 'TechnicalAuditReport',
  'PaidMediaOverviewReport', 'PaidSearchReport', 'MetaAdsReport', 'LinkedInAdsReport'])
const CLIENT = {
  name: 'Client', slug: 'c', logoUrl: null, enabledReports: ['organic-social', 'peec-ai', 'paid-media'], hiddenReports: [] as string[],
  dashSocialConfig: { brandId: 1 }, reportSectionConfig: {},
}
const Q = { dateRange: 'custom:2026-09-01,2026-09-30', compareRange: 'previous_period', models: 'ChatGPT,Claude' }
const CASES: [ServerExportSection, (string | undefined)[]][] = [
  ['organic-social', [undefined, 'organic-linkedin', 'organic-influencer', 'not-a-tab']],
  ['peec-ai', [undefined, 'pr-influence', 'content-impact', 'technical-audit', 'not-a-tab']],
  ['paid-media', [undefined, 'paid-search', 'meta', 'linkedin', 'not-a-tab']],
]
const nameOf = (t: unknown) => (typeof t === 'function' ? (t as { name: string }).name : String(t))
const params = { clientSlug: 'c', dateRange: Q.dateRange, compareRange: Q.compareRange, models: parseModelsParam(Q.models) }

async function onPage(Route: typeof PortalSpa, client: typeof CLIENT, section: string, subsection?: string) {
  getClientBySlug.mockResolvedValue(client)
  const r = await runRoute(Route({ params: Promise.resolve({ clientSlug: 'c' }),
    searchParams: Promise.resolve({ section, ...Q, ...(subsection ? { subsection } : {}) }) } as never))
  if ('redirect' in r) throw new Error(`unexpected redirect to ${r.redirect}`)
  const [report] = findElements(r.element, (e) => REPORTS.has(nameOf(e.type)))
  const [button] = findElements(r.element, (e) => nameOf(e.type) === 'ExportPdfButton')
  return { report, button }
}

beforeEach(() => {
  vi.mocked(auth).mockResolvedValue({ user: { role: 'INTERNAL_ADMIN', email: 'someone@example.com', clientSlug: 'c' } } as never)
})

for (const [routeName, Route] of Object.entries({ portal: PortalSpa, dashboard: DashboardSpa })) {
  for (const [section, tabs] of CASES) {
    test.each(tabs)(`${routeName}: ${section} tab %s exports the report the page renders, titled as the page titles it`, async (subsection) => {
      const { report, button } = await onPage(Route, CLIENT, section, subsection)
      const view = resolveExportView(CLIENT as ExportViewClient, section, subsection ?? null)
      const element = exportReportElement(view, params)
      expect(nameOf(element.type)).toBe(nameOf(report.type))
      // Known drift, named rather than hidden: the dashboard route drops Paid Media Overview's compareRange; the
      // portal passes it, and the export follows the portal. Recorded in PR 1's review record.
      const drift = routeName === 'dashboard' && nameOf(report.type) === 'PaidMediaOverviewReport'
      expect(element.props).toEqual(drift ? { ...report.props, compareRange: Q.compareRange } : report.props)
      expect(view.pageTitle).toBe(button.props.pageTitle)
      // Every resolved tab of these sections uses the page range, so the export always stamps a period.
      if (subsection !== 'not-a-tab') expect(button.props.periodLabel).not.toBeNull()
    })
  }

  test(`${routeName}: a tab the client has hidden exports its section's Overview, as the page renders it`, async () => {
    const hidden = { ...CLIENT, hiddenReports: ['technical-audit'] }
    const { report, button } = await onPage(Route, hidden, 'peec-ai', 'technical-audit')
    const view = resolveExportView(hidden as ExportViewClient, 'peec-ai', 'technical-audit')
    expect(view.subsectionId).toBeNull()
    expect(nameOf(exportReportElement(view, params).type)).toBe(nameOf(report.type))
    expect(nameOf(report.type)).toBe('PeecAIReport')
    expect(view.pageTitle).toBe(button.props.pageTitle)
  })
}

test('one lookup gives the tab, its channel, its view and its title; an unknown tab is Overview', () => {
  const c = CLIENT as ExportViewClient
  expect(resolveExportView(c, 'organic-social', 'organic-linkedin')).toEqual({ section: 'organic-social', subsectionId: 'organic-linkedin', channel: 'LINKEDIN', view: null, pageTitle: 'LinkedIn' })
  expect(resolveExportView(c, 'organic-social', null)).toEqual({ section: 'organic-social', subsectionId: null, channel: null, view: null, pageTitle: 'Organic Social' })
  expect(resolveExportView(c, 'organic-social', 'not-a-tab')).toEqual({ section: 'organic-social', subsectionId: null, channel: null, view: null, pageTitle: 'Organic Social' })
  expect(resolveExportView(c, 'peec-ai', 'pr-influence')).toEqual({ section: 'peec-ai', subsectionId: 'pr-influence', channel: null, view: null, pageTitle: 'PR Influence' })
  expect(resolveExportView(c, 'peec-ai', 'not-a-tab')).toEqual({ section: 'peec-ai', subsectionId: null, channel: null, view: null, pageTitle: 'Answer Engine Optimization' })
  expect(resolveExportView(c, 'paid-media', null)).toEqual({ section: 'paid-media', subsectionId: null, channel: null, view: null, pageTitle: 'Overview' })
  expect(resolveExportView(c, 'paid-media', 'meta')).toEqual({ section: 'paid-media', subsectionId: 'meta', channel: null, view: null, pageTitle: 'Meta Advertising' })
})

// #334 (task B7): the Influencer tab has no channel but a view, so the export must carry the view, or it would print
// Overview under the title "Organic Social".
test('the Influencer tab resolves to its id, no channel, the influencer view and the title Influencer', () => {
  expect(resolveExportView(CLIENT as ExportViewClient, 'organic-social', 'organic-influencer'))
    .toEqual({ section: 'organic-social', subsectionId: 'organic-influencer', channel: null, view: 'influencer', pageTitle: 'Influencer' })
})
