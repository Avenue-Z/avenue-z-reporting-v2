import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { getClientBySlug } from '@/lib/db/queries'
import { auth } from '@/auth'
import { REPORT_NAMES, NAV_SLUG_ORDER, SHOW_AI_NARRATIVE } from '@/lib/constants'
import { StickyReportHeader } from '@/components/layout/sticky-report-header'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'
import { ExecSummary } from '@/components/report-sections/exec-summary'
import { GA4Report } from '@/components/report-sections/ga4'
import { ConversionJourneyReport } from '@/components/report-sections/ga4/conversion-journey'
import { MetaAdsReport } from '@/components/report-sections/meta-ads'
import { PaidSearchReport } from '@/components/report-sections/paid-search'
import { EmailMarketingReport } from '@/components/report-sections/email-marketing'
import { BlendedPerformanceReport } from '@/components/report-sections/blended-performance'
import { LinkedInAdsReport } from '@/components/report-sections/linkedin-ads'
import { SnapchatAdsReport } from '@/components/report-sections/snapchat-ads'
import { TikTokAdsReport } from '@/components/report-sections/tiktok-ads'
import { ShopifyPerformanceReport } from '@/components/report-sections/shopify-performance'
import { HubSpotPerformanceReport } from '@/components/report-sections/hubspot-performance'
import { RedditAdsReport } from '@/components/report-sections/reddit-ads'
import { BingAdsReport } from '@/components/report-sections/bing-ads'
import { FFCIReport } from '@/components/report-sections/ffci'
import { TikTokShopReport } from '@/components/report-sections/tiktok-shop'
import { PRPlacementsReport } from '@/components/report-sections/pr-placements'
import { GoHighLevelReport } from '@/components/report-sections/gohighlevel'
import { TicketSalesReport } from '@/components/report-sections/ticket-sales'
import { InboundFunnelReport } from '@/components/report-sections/inbound-funnel'
import { DemandOverviewReport } from '@/components/report-sections/demand-overview'
import { RequestAReportReport } from '@/components/report-sections/request-a-report'
import { PeecAIReport } from '@/components/report-sections/peec-ai'
import { PRInfluenceReport } from '@/components/report-sections/peec-ai/pr-influence'
import { ContentImpactReport } from '@/components/report-sections/peec-ai/content-impact'
import { TechnicalAuditReport } from '@/components/report-sections/peec-ai/technical-audit'
import { OrganicSocialReport } from '@/components/report-sections/organic-social'
import { GA4DatePicker } from '@/components/report-sections/ga4/date-picker'
import { ModelFilter } from '@/components/report-sections/peec-ai/model-filter'
import { parseModelsParam, type AEOModel } from '@/lib/peec/models'
import { ExportPdfButton } from '@/components/export-pdf-button'
import { DataChat } from '@/components/data-chat'
import { TooltipProvider } from '@/components/ui/tooltip'
import { resolveCommentaryView } from '@/lib/commentary/views'
import { CommentarySection } from '@/components/report-sections/commentary'

import type { ReportSlug } from '@/lib/db/schema'

function SectionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-lg border border-white/[0.06] bg-bg-surface"
          />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-lg border border-white/[0.06] bg-bg-surface" />
    </div>
  )
}

// TECH DEBT: this section switch + the report header controls in the return below
// are duplicated in the internal dashboard route
// (app/dashboard/[clientSlug]/reports/page.tsx). The two have drifted before — that
// gap is exactly why AEO's date/model pickers were missing here until they were
// hand-ported. TODO: extract a single shared report-render module that both the
// dashboard and portal routes import, so they can't diverge again.
function getReportComponent(slug: ReportSlug, clientSlug: string, dateRange: string, compareRange: string | null, subsection?: string, models?: AEOModel[] | null, submittedBy?: string) {
  switch (slug) {
    case 'exec-summary':
      return <ExecSummary clientSlug={clientSlug} />
    case 'ga4':
      if (subsection === 'conversion-journey') {
        return <ConversionJourneyReport clientSlug={clientSlug} dateRange={dateRange} />
      }
      return <GA4Report clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
    case 'inbound-funnel':
      return <InboundFunnelReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} subsection={subsection} />
    case 'meta-ads':
      return <MetaAdsReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
    case 'google-ads':
      return <PaidSearchReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
    case 'email-marketing':
      return <EmailMarketingReport clientSlug={clientSlug} />
    case 'blended-performance':
      return <BlendedPerformanceReport clientSlug={clientSlug} />
    case 'linkedin-ads':
      return <LinkedInAdsReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
    case 'paid-media':
      if (subsection === 'meta')     return <MetaAdsReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      if (subsection === 'linkedin') return <LinkedInAdsReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      return <PaidSearchReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
    case 'snapchat-ads':
      return <SnapchatAdsReport clientSlug={clientSlug} />
    case 'tiktok-ads':
      return <TikTokAdsReport clientSlug={clientSlug} />
    case 'shopify-performance':
      return <ShopifyPerformanceReport clientSlug={clientSlug} />
    case 'hubspot-performance':
      return <HubSpotPerformanceReport clientSlug={clientSlug} />
    case 'reddit-ads':
      return <RedditAdsReport clientSlug={clientSlug} />
    case 'bing-ads':
      return <BingAdsReport clientSlug={clientSlug} />
    case 'ffci':
      return <FFCIReport clientSlug={clientSlug} />
    case 'tiktok-shop':
      return <TikTokShopReport clientSlug={clientSlug} />
    case 'pr-placements':
      return <PRPlacementsReport clientSlug={clientSlug} />
    case 'gohighlevel':
      return <GoHighLevelReport clientSlug={clientSlug} />
    case 'ticket-sales':
      return <TicketSalesReport clientSlug={clientSlug} />
    case 'organic-social':
      return <OrganicSocialReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
    case 'demand-overview':
      return <DemandOverviewReport clientSlug={clientSlug} />
    case 'request-a-report':
      return <RequestAReportReport clientSlug={clientSlug} submittedBy={submittedBy} />
    case 'peec-ai':
      if (subsection === 'pr-influence')    return <PRInfluenceReport clientSlug={clientSlug} dateRange={dateRange} models={models} />
      if (subsection === 'content-impact')  return <ContentImpactReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange ?? undefined} models={models} />
      if (subsection === 'technical-audit') return <TechnicalAuditReport clientSlug={clientSlug} dateRange={dateRange} />
      return <PeecAIReport clientSlug={clientSlug} dateRange={dateRange} models={models} />
  }
}

const GA4_SUBSECTION_NAMES: Record<string, string> = {
  'conversion-journey': 'Conversion Journey',
}

const INBOUND_FUNNEL_SUBSECTION_NAMES: Record<string, string> = {
  'forms':  'Forms',
  'pacing': 'Pacing',
}

const PAID_MEDIA_SUBSECTION_NAMES: Record<string, string> = {
  'meta':     'Meta Advertising',
  'linkedin': 'LinkedIn Advertising',
}

const AEO_SUBSECTION_NAMES: Record<string, string> = {
  'pr-influence':    'PR Influence',
  'content-impact':  'Content Impact',
  'technical-audit': 'Technical Performance',
}

export default async function PortalReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientSlug: string }>
  searchParams: Promise<{ dateRange?: string; compareRange?: string; section?: string; subsection?: string; models?: string }>
}) {
  const { clientSlug } = await params
  const { dateRange: dateRangeParam, compareRange: compareRangeParam, section, subsection: subsectionParam, models: modelsParam } = await searchParams
  const client = await getClientBySlug(clientSlug)
  if (!client) notFound()

  const session = await auth()
  const submittedBy = session?.user?.email ?? undefined

  // A subsection the client has hidden (e.g. Technical Performance) is not reachable
  // via direct URL — fall back to the section overview.
  const subsection = subsectionParam && client.hiddenReports?.includes(subsectionParam as ReportSlug)
    ? undefined
    : subsectionParam

  const dateRange    = dateRangeParam  ?? 'last_30_days'
  const compareRange = compareRangeParam ?? null
  const models       = parseModelsParam(modelsParam)

  // Default landing: open the first enabled report in sidebar (NAV_GROUPS) order
  // so it matches the first visible nav item — not enabledReports[0], which can
  // lead with a granular/legacy slug the sidebar can't highlight.
  const defaultSection =
    NAV_SLUG_ORDER.find((s) => client.enabledReports.includes(s as ReportSlug)) ??
    client.enabledReports[0]

  // A bare /reports (no section) renders content but the sidebar — which reads the
  // `section` param — highlights nothing. Redirect to the canonical URL so the page
  // and sidebar share one source of truth.
  if (!section && defaultSection) {
    const sp = new URLSearchParams()
    if (dateRangeParam)    sp.set('dateRange', dateRangeParam)
    if (compareRangeParam) sp.set('compareRange', compareRangeParam)
    if (subsectionParam)   sp.set('subsection', subsectionParam)
    if (modelsParam)       sp.set('models', modelsParam)
    sp.set('section', defaultSection)
    redirect(`/portal/${clientSlug}/reports?${sp.toString()}`)
  }

  const portalReports: ReportSlug[] = client.enabledReports
  const activeSection = (
    portalReports.includes(section as ReportSlug)
      ? section
      : defaultSection
  ) as ReportSlug

  const pageTitle =
    (activeSection === 'ga4' && subsection && GA4_SUBSECTION_NAMES[subsection])
      ? GA4_SUBSECTION_NAMES[subsection]
    : (activeSection === 'inbound-funnel' && subsection && INBOUND_FUNNEL_SUBSECTION_NAMES[subsection])
      ? INBOUND_FUNNEL_SUBSECTION_NAMES[subsection]
    : (activeSection === 'paid-media')
      ? (subsection && PAID_MEDIA_SUBSECTION_NAMES[subsection] ? PAID_MEDIA_SUBSECTION_NAMES[subsection] : 'Paid Search')
    : (activeSection === 'peec-ai' && subsection && AEO_SUBSECTION_NAMES[subsection])
      ? AEO_SUBSECTION_NAMES[subsection]
    : (REPORT_NAMES[activeSection] ?? activeSection)

  const commentaryView = resolveCommentaryView(activeSection, subsection)

  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={50}>
      <StickyReportHeader title={pageTitle} subtitle={client.name} logoUrl={client.logoUrl ?? undefined}>
        {(activeSection === 'ga4' || activeSection === 'inbound-funnel') && subsection !== 'pacing' && (
          <Suspense fallback={null}>
            <GA4DatePicker dateRange={dateRange} compareRange={compareRange} />
          </Suspense>
        )}
        {activeSection === 'paid-media' && (
          <Suspense fallback={null}>
            <GA4DatePicker dateRange={dateRange} compareRange={compareRange} />
          </Suspense>
        )}
        {activeSection === 'organic-social' && (
          <Suspense fallback={null}>
            <GA4DatePicker dateRange={dateRange} compareRange={compareRange} />
          </Suspense>
        )}
        {/* AEO honors the page date range; the model filter applies to Overview,
            PR Influence and Content Impact (not Technical Performance). */}
        {activeSection === 'peec-ai' && (!subsection || AEO_SUBSECTION_NAMES[subsection]) && (
          <Suspense fallback={null}>
            <GA4DatePicker dateRange={dateRange} compareRange={compareRange} />
          </Suspense>
        )}
        {activeSection === 'peec-ai' && (!subsection || subsection === 'pr-influence' || subsection === 'content-impact') && (
          <Suspense fallback={null}>
            <ModelFilter selected={models} />
          </Suspense>
        )}
        <ExportPdfButton />
      </StickyReportHeader>

      <div className="h-8" />

      {commentaryView && (
        <ReportErrorBoundary sectionName="Commentary">
          <Suspense fallback={null}>
            <CommentarySection clientSlug={clientSlug} viewKey={commentaryView} />
          </Suspense>
        </ReportErrorBoundary>
      )}

      <ReportErrorBoundary sectionName={pageTitle}>
        <Suspense key={`${activeSection}:${subsection ?? ''}:${dateRange}:${compareRange ?? ''}:${modelsParam ?? ''}`} fallback={<SectionSkeleton />}>
          {getReportComponent(activeSection, clientSlug, dateRange, compareRange, subsection, models, submittedBy)}
        </Suspense>
      </ReportErrorBoundary>

      {SHOW_AI_NARRATIVE && <DataChat clientName={client.name} />}
    </TooltipProvider>
  )
}
