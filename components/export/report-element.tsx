// The live report component the export page renders for a view, with the props the report pages pass it
// (getReportComponent in app/{portal,dashboard}/[clientSlug]/reports/page.tsx; pinned by report-views.pages.test.tsx).
// Server-only: it imports the report components, so the export route (which only needs resolveExportView) never does.
import type { ReactElement } from 'react'
import type { AEOModel } from '@/lib/peec/models'
import type { ExportView } from '@/lib/export/report-view'
import { OrganicSocialReport } from '@/components/report-sections/organic-social'
import { PeecAIReport } from '@/components/report-sections/peec-ai'
import { PRInfluenceReport } from '@/components/report-sections/peec-ai/pr-influence'
import { ContentImpactReport } from '@/components/report-sections/peec-ai/content-impact'
import { TechnicalAuditReport } from '@/components/report-sections/peec-ai/technical-audit'
import { PaidMediaOverviewReport } from '@/components/report-sections/paid-media/overview'
import { PaidSearchReport } from '@/components/report-sections/paid-search'
import { MetaAdsReport } from '@/components/report-sections/meta-ads'
import { LinkedInAdsReport } from '@/components/report-sections/linkedin-ads'
import { ExecutiveOverviewReport } from '@/components/report-sections/executive-overview'

export interface ExportViewParams {
  clientSlug: string
  dateRange: string
  compareRange: string | null
  models: AEOModel[] | null
}

export function exportReportElement(view: ExportView, { clientSlug, dateRange, compareRange, models }: ExportViewParams): ReactElement {
  switch (view.section) {
    case 'organic-social':
      // Locked months resolve inside OrganicSocialReport from the raw range, as on the page.
      return <OrganicSocialReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} channel={view.channel} view={view.view} />
    case 'peec-ai':
      if (view.subsectionId === 'pr-influence')    return <PRInfluenceReport clientSlug={clientSlug} dateRange={dateRange} models={models} />
      if (view.subsectionId === 'content-impact')  return <ContentImpactReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange ?? undefined} models={models} />
      if (view.subsectionId === 'technical-audit') return <TechnicalAuditReport clientSlug={clientSlug} dateRange={dateRange} />
      return <PeecAIReport clientSlug={clientSlug} dateRange={dateRange} models={models} />
    case 'paid-media':
      if (view.subsectionId === 'meta')        return <MetaAdsReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      if (view.subsectionId === 'linkedin')    return <LinkedInAdsReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      if (view.subsectionId === 'paid-search') return <PaidSearchReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      // As the portal route; the dashboard route drops compareRange here (a live-page drift, PR 1 review record).
      return <PaidMediaOverviewReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
    case 'executive-overview':
      // It resolves its own windows (last 30 days, year to date, as of today); the page passes it only the slug.
      // A deadline for the CRM fetches, under the 40 s ready budget: Salesforce's own timeout is 60 s, and a slow CRM
      // must print its "Couldn't load" card rather than leave the export "still loading" (Thomas, #354).
      return <ExecutiveOverviewReport clientSlug={clientSlug} crmDeadlineMs={25_000} />
  }
}
