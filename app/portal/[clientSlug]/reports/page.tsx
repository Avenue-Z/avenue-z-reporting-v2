import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { getClientBySlug } from '@/lib/db/queries'
import { auth } from '@/auth'
import { REPORT_NAMES, NAV_SLUG_ORDER, SHOW_AI_NARRATIVE, resolveOrganicSubsection, type OrganicView } from '@/lib/constants'
import { parseAeoMin, parseAeoRange, type AeoRange } from '@/lib/organic-social/aeo-tab/params'
import { parseSlPreview, parseSlTopic } from '@/lib/organic-social/social-listening/params'
import type { SlTopic } from '@/lib/organic-social/social-listening/types'
import { StickyReportHeader } from '@/components/layout/sticky-report-header'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'
import { ExecSummary } from '@/components/report-sections/exec-summary'
import { GA4Report } from '@/components/report-sections/ga4'
import { ConversionJourneyReport } from '@/components/report-sections/ga4/conversion-journey'
import { MetaAdsReport } from '@/components/report-sections/meta-ads'
import { PaidSearchReport } from '@/components/report-sections/paid-search'
import { PaidMediaOverviewReport } from '@/components/report-sections/paid-media/overview'
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
import { ExecutiveOverviewReport } from '@/components/report-sections/executive-overview'
import { RequestAReportReport } from '@/components/report-sections/request-a-report'
import { PeecAIReport } from '@/components/report-sections/peec-ai'
import { PRInfluenceReport } from '@/components/report-sections/peec-ai/pr-influence'
import { ContentImpactReport } from '@/components/report-sections/peec-ai/content-impact'
import { TechnicalAuditReport } from '@/components/report-sections/peec-ai/technical-audit'
import { OrganicSocialReport } from '@/components/report-sections/organic-social'
import { GA4DatePicker } from '@/components/report-sections/ga4/date-picker'
import { ModelFilter } from '@/components/report-sections/peec-ai/model-filter'
import { parseModelsParam, serializeModelsParam, type AEOModel } from '@/lib/peec/models'
import { isServerExportSection } from '@/lib/export/sections'
import { exportableAeoGauge, exportableAeoMatrix, exportableAeoTrend } from '@/lib/export/request'
import { resolveExportView } from '@/lib/export/report-view'
import { exportablePages } from '@/lib/export/pages'
import { ExportPdfButton } from '@/components/export-pdf-button'
import { exportPeriodLabel } from '@/lib/export-period'
import { DataChat } from '@/components/data-chat'
import { TooltipProvider } from '@/components/ui/tooltip'

import type { ReportSlug } from '@/lib/db/schema'
import type { DashChannel } from '@/lib/organic-social/metrics'
import { hasReportingMonths } from '@/lib/organic-social/reporting-months'
import { lockedRangeFor, logHiddenMonthAttempt, requestClock } from '@/lib/organic-social/locked-range'
import { OrganicRangeControl } from '@/components/report-sections/organic-social/range-control'
import { requirePortalAccess } from '@/lib/auth/page-access'

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
function getReportComponent(slug: ReportSlug, clientSlug: string, dateRange: string, compareRange: string | null, subsection?: string, models?: AEOModel[] | null, submittedBy?: string, channel: DashChannel | null = null, view: OrganicView = null, aeo: AeoRange = 'month', aeoMin = 2, sl: SlTopic = 'brand', slPreview = false, deltas: string | null = null) {
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
      if (subsection === 'meta')        return <MetaAdsReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      if (subsection === 'linkedin')    return <LinkedInAdsReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      if (subsection === 'paid-search') return <PaidSearchReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      return <PaidMediaOverviewReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
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
      // aeo and aeoMin reach the section on the AEO Informed Social tab only; every other tab's props are unchanged.
      return <OrganicSocialReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} channel={channel} view={view} {...(view === 'aeo-informed' ? { aeo, aeoMin } : {})} {...(view === 'social-listening' ? { sl, ...(slPreview ? { slPreview: true } : {}) } : {})} />
    case 'demand-overview':
      return <DemandOverviewReport clientSlug={clientSlug} />
    case 'executive-overview':
      return <ExecutiveOverviewReport clientSlug={clientSlug} />
    case 'request-a-report':
      return <RequestAReportReport clientSlug={clientSlug} submittedBy={submittedBy} />
    case 'peec-ai':
      if (subsection === 'pr-influence')    return <PRInfluenceReport clientSlug={clientSlug} dateRange={dateRange} models={models} />
      if (subsection === 'content-impact')  return <ContentImpactReport audience="client" clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange ?? undefined} models={models} />
      if (subsection === 'technical-audit') return <TechnicalAuditReport clientSlug={clientSlug} dateRange={dateRange} />
      return <PeecAIReport audience="client" clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} deltas={deltas} models={models} />
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
  'paid-search': 'Paid Search',
  'meta':        'Meta Advertising',
  'linkedin':    'LinkedIn Advertising',
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
  searchParams: Promise<{ dateRange?: string; compareRange?: string; section?: string; subsection?: string; models?: string; aeo?: string; aeomin?: string; sl?: string; slview?: string; deltas?: string; aeoTrend?: string; aeoMatrix?: string; aeoGauge?: string }>
}) {
  const { clientSlug } = await params
  await requirePortalAccess(clientSlug)
  const { dateRange: dateRangeParam, compareRange: compareRangeParam, section, subsection: subsectionParam, models: modelsParam, aeo: aeoParam, aeomin: aeoMinParam, sl: slParam, slview: slViewParam, deltas: deltasParam, aeoTrend: aeoTrendParam, aeoMatrix: aeoMatrixParam, aeoGauge: aeoGaugeParam } = await searchParams
  // The AEO Informed Social tab's range and min competitors (spec 2026-11-12 sections 2 and 3): anything unreadable is Month and 2.
  const aeo = parseAeoRange(aeoParam)
  const aeoMin = parseAeoMin(aeoMinParam)
  const sl = parseSlTopic(slParam)
  const slPreview = parseSlPreview(slViewParam)
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
    if (aeo !== 'month')   sp.set('aeo', aeo)
    if (aeoMin !== 2)      sp.set('aeomin', String(aeoMin))
    if (sl !== 'brand') sp.set('sl', sl)
    if (slPreview) sp.set('slview', 'client')
    sp.set('section', defaultSection)
    redirect(`/portal/${clientSlug}/reports?${sp.toString()}`)
  }

  const portalReports: ReportSlug[] = client.enabledReports
  const activeSection = (
    portalReports.includes(section as ReportSlug)
      ? section
      : defaultSection
  ) as ReportSlug

  // Organic Social: resolve the platform subsection from the RAW param — the resolver does its own
  // hidden/allowlist filtering and never returns null (unknown/hidden/unconfigured → Overview, §5.1).
  const organicEntry = activeSection === 'organic-social'
    ? resolveOrganicSubsection(client, subsectionParam)
    : null

  // Locked months, opted-in clients only (spec docs/superpowers/specs/2026-09-21-locked-months-design.md,
  // 4.5). For everyone else `locked` is null and the served range is exactly the requested one.
  const locked = activeSection === 'organic-social' && hasReportingMonths(client)
    ? lockedRangeFor(client, session?.user?.role, dateRangeParam, requestClock())
    : null
  if (locked?.month && locked.outcome === 'replaced') {
    if (locked.hiddenMonthAttempt) logHiddenMonthAttempt(clientSlug, dateRangeParam, locked.month.dateRange)
    const sp = new URLSearchParams()
    if (section)         sp.set('section', section)
    if (subsectionParam) sp.set('subsection', subsectionParam)
    if (modelsParam)     sp.set('models', modelsParam)
    // Kept through the redirect, so a viewer's YTD or min is not reset to the default (Review Focus 1); a default value is left out.
    if (aeo !== 'month') sp.set('aeo', aeo)
    if (aeoMin !== 2)    sp.set('aeomin', String(aeoMin))
    if (sl !== 'brand') sp.set('sl', sl)
    if (slPreview) sp.set('slview', 'client')
    sp.set('dateRange', locked.month.dateRange)
    redirect(`/portal/${clientSlug}/reports?${sp.toString()}`)
  }
  const servedDateRange    = locked?.month?.dateRange ?? dateRange
  const servedCompareRange = locked?.month ? locked.month.compareRange : compareRange
  // AEO Overview: the trend chart's selection for the PDF, when the export accepts it (a hand-edited value prints the default chart).
  const exportAeoTrend = activeSection === 'peec-ai' && !subsection ? exportableAeoTrend(aeoTrendParam) : null
  // AEO Overview: the topic matrix's mode for the PDF, when it is not the default (Competitors).
  const exportAeoMatrix = activeSection === 'peec-ai' && !subsection ? exportableAeoMatrix(aeoMatrixParam) : null
  // AEO Overview: the model gauges' metric for the PDF, when it is not the default (Visibility).
  const exportAeoGauge = activeSection === 'peec-ai' && !subsection ? exportableAeoGauge(aeoGaugeParam) : null

  const pageTitle =
    (activeSection === 'organic-social' && organicEntry)
      ? (organicEntry.view != null ? organicEntry.label : organicEntry.channel == null ? (REPORT_NAMES['organic-social'] ?? 'Organic Social') : organicEntry.label)
    : (activeSection === 'ga4' && subsection && GA4_SUBSECTION_NAMES[subsection])
      ? GA4_SUBSECTION_NAMES[subsection]
    : (activeSection === 'inbound-funnel' && subsection && INBOUND_FUNNEL_SUBSECTION_NAMES[subsection])
      ? INBOUND_FUNNEL_SUBSECTION_NAMES[subsection]
    : (activeSection === 'paid-media')
      ? (subsection && PAID_MEDIA_SUBSECTION_NAMES[subsection] ? PAID_MEDIA_SUBSECTION_NAMES[subsection] : 'Overview')
    : (activeSection === 'peec-ai' && subsection && AEO_SUBSECTION_NAMES[subsection])
      ? AEO_SUBSECTION_NAMES[subsection]
    : (REPORT_NAMES[activeSection] ?? activeSection)

  // The Export PDF stamp states a period only where the page range applies, which is exactly where
  // the header below shows a date picker: Executive Overview, Pacing etc. keep their own window, so a
  // ?dateRange carried over in the URL must not be stamped on them. Mirrors the picker conditions;
  // lib/export-period.pages.test.tsx holds stamp ⇔ picker.
  const usesPageRange =
    ((activeSection === 'ga4' || activeSection === 'inbound-funnel') && subsection !== 'pacing') ||
    activeSection === 'paid-media' || activeSection === 'organic-social' ||
    (activeSection === 'peec-ai' && (!subsection || !!AEO_SUBSECTION_NAMES[subsection]))

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
            {locked
              ? <OrganicRangeControl client={client} requested={dateRangeParam} role={session?.user?.role ?? null} />
              : <GA4DatePicker dateRange={dateRange} compareRange={compareRange} />}
          </Suspense>
        )}
        {/* AEO honors the page date range; the model filter applies to Overview,
            PR Influence and Content Impact (not Technical Performance). */}
        {activeSection === 'peec-ai' && (!subsection || AEO_SUBSECTION_NAMES[subsection]) && (
          <Suspense fallback={null}>
            {subsection
              ? <GA4DatePicker dateRange={dateRange} compareRange={compareRange} />
              : <GA4DatePicker dateRange={dateRange} compareRange={compareRange} defaultCompare="previous_period" explicitNone />}
          </Suspense>
        )}
        {activeSection === 'peec-ai' && (!subsection || subsection === 'pr-influence' || subsection === 'content-impact') && (
          <Suspense fallback={null}>
            <ModelFilter selected={models} />
          </Suspense>
        )}
        <ExportPdfButton clientName={client.name} pageTitle={pageTitle} periodLabel={usesPageRange ? exportPeriodLabel(servedDateRange) : null}
          {...(isServerExportSection(activeSection)
            ? { serverExport: {
                clientSlug,
                section: activeSection,
                // The tab the page resolved, never the raw param: the route accepts only a slug-shaped tab.
                subsection: resolveExportView(client, activeSection, subsectionParam ?? null).subsectionId,
                // The Executive Overview ignores ranges: it posts its fixed ones, so a stale ?compareRange= the request
                // validator refuses can't turn its export into a 400.
                dateRange: activeSection === 'executive-overview' ? 'last_30_days' : servedDateRange,
                compareRange: activeSection === 'executive-overview' ? null : servedCompareRange,
                models: activeSection === 'peec-ai' && models ? serializeModelsParam(models) : null,
                // AEO Overview with Show deltas off: the PDF follows the page (every other body is unchanged).
                ...(activeSection === 'peec-ai' && !subsection && deltasParam === 'off' ? { deltas: 'off' as const } : {}),
                // The trend chart's selection, read back by the chart from the export page's URL.
                ...(exportAeoTrend ? { aeoTrend: exportAeoTrend } : {}),
                // The topic matrix's mode, read back by the matrix from the export page's URL.
                ...(exportAeoMatrix ? { aeoMatrix: exportAeoMatrix } : {}),
                // The model gauges' metric, read back by the gauge grid from the export page's URL.
                ...(exportAeoGauge ? { aeoGauge: exportAeoGauge } : {}),
                // The AEO Informed Social tab's range and min, on that tab only (every other body is unchanged).
                ...(organicEntry?.view === 'aeo-informed' ? { aeo, aeoMin } : {}),
              } }
            : {})}
          // Bulk export (spec 2026-10-14-bulk-pdf-export-design): the client's exportable pages, this one pre-selected,
          // with the page's raw ranges; lib/export/bulk.ts applies each page's own (B5).
          bulk={{
            pages: exportablePages(client),
            currentKey: isServerExportSection(activeSection)
              ? `${activeSection}:${resolveExportView(client, activeSection, subsectionParam ?? null).subsectionId ?? ''}`
              : null,
            clientSlug, dateRange, compareRange,
            models: models ? serializeModelsParam(models) : null,
            fromSection: activeSection,
            lockedMonths: hasReportingMonths(client),
            // Started from the AEO tab: its page in the bulk export takes the same range and min (lib/export/bulk.ts).
            ...(organicEntry?.view === 'aeo-informed' ? { aeo, aeoMin } : {}),
            // Started from the AEO Overview: its page in the bulk export takes the Show deltas switch and the trend selection.
            ...(activeSection === 'peec-ai' && !subsection && deltasParam === 'off' ? { deltas: 'off' as const } : {}),
            ...(exportAeoTrend ? { aeoTrend: exportAeoTrend } : {}),
            ...(exportAeoMatrix ? { aeoMatrix: exportAeoMatrix } : {}),
            ...(exportAeoGauge ? { aeoGauge: exportAeoGauge } : {}),
          }} />
      </StickyReportHeader>

      <div className="h-8" />

      <ReportErrorBoundary sectionName={pageTitle}>
        {/* Organic Social keys on the RESOLVED subsection (organicEntry.id), not the raw
            param — a disallowed/bogus subsection degrades to Overview and must key
            identically to a plain Overview visit, or it forces a needless remount
            (PR #174 review). The key also gives each tab and month its own trend chart:
            the chart seeds its legend once per instance (organic-social/trends.tsx). */}
        <Suspense key={`${activeSection}:${activeSection === 'organic-social' ? (organicEntry?.id ?? '') : (subsection ?? '')}:${servedDateRange}:${servedCompareRange ?? ''}:${modelsParam ?? ''}${organicEntry?.view === 'aeo-informed' ? `:aeo=${aeo}:${aeoMin}` : ''}${organicEntry?.view === 'social-listening' ? `:sl=${sl}:${slPreview ? 'client' : 'staff'}` : ''}`} fallback={<SectionSkeleton />}>
          {getReportComponent(activeSection, clientSlug, servedDateRange, servedCompareRange, subsection, models, submittedBy, organicEntry?.channel ?? null, organicEntry?.view ?? null, aeo, aeoMin, sl, slPreview, deltasParam ?? null)}
        </Suspense>
      </ReportErrorBoundary>

      {SHOW_AI_NARRATIVE && <DataChat clientName={client.name} />}
    </TooltipProvider>
  )
}
