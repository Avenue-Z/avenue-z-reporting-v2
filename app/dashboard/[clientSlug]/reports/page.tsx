import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { auth } from '@/auth'
import { getClientBySlug } from '@/lib/db/queries'
import { resolveDemoMode } from '@/lib/demo-data/resolve'
import { REPORT_NAMES, NAV_SLUG_ORDER } from '@/lib/constants'
import { StickyReportHeader } from '@/components/layout/sticky-report-header'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'
import { GA4Report } from '@/components/report-sections/ga4'
import { ConversionJourneyReport } from '@/components/report-sections/ga4/conversion-journey'
import { GoogleSearchConsoleReport } from '@/components/report-sections/google-search-console'
import { MetaAdsReport } from '@/components/report-sections/meta-ads'
import { PaidSearchReport } from '@/components/report-sections/paid-search'
import { LinkedInAdsReport } from '@/components/report-sections/linkedin-ads'
import { HubSpotPerformanceReport } from '@/components/report-sections/hubspot-performance'
import { InboundFunnelReport } from '@/components/report-sections/inbound-funnel'
import { PeecAIReport } from '@/components/report-sections/peec-ai'
import { PRInfluenceReport } from '@/components/report-sections/peec-ai/pr-influence'
import { ContentImpactReport } from '@/components/report-sections/peec-ai/content-impact'
import { TechnicalAuditReport } from '@/components/report-sections/peec-ai/technical-audit'
import { DemandOverviewReport } from '@/components/report-sections/demand-overview'
import { OrganicSocialReport } from '@/components/report-sections/organic-social'
import { AISummariesReport } from '@/components/report-sections/ai-summaries'
import { ReportGeneratorReport } from '@/components/report-sections/report-generator'
import { RequestAReportReport } from '@/components/report-sections/request-a-report'
import type { SummaryPeriod } from '@/components/report-sections/ai-summaries/period-selector'
import { GA4DatePicker } from '@/components/report-sections/ga4/date-picker'
import { ModelFilter } from '@/components/report-sections/peec-ai/model-filter'
import type { ReportSlug } from '@/lib/db/schema'
import { TooltipProvider } from '@/components/ui/tooltip'
import { parseModelsParam } from '@/lib/peec/models'
import { SectionSkeleton } from './section-skeleton'

function getReportComponent(
  slug: ReportSlug,
  clientSlug: string,
  dateRange: string,
  compareRange: string | null,
  subsection?: string,
  period?: SummaryPeriod,
  submittedBy?: string,
  demoMode?: boolean,
  models?: import('@/lib/peec/models').AEOModel[] | null,
) {
  switch (slug) {
    case 'request-a-report':
      return <RequestAReportReport clientSlug={clientSlug} submittedBy={submittedBy} />
    case 'ai-summaries':
      return <AISummariesReport clientSlug={clientSlug} period={period} />
    case 'report-generator':
      return <ReportGeneratorReport clientSlug={clientSlug} />
    case 'demand-overview':
      return <DemandOverviewReport clientSlug={clientSlug} />
    case 'ga4':
      if (subsection === 'conversion-journey') {
        return <ConversionJourneyReport clientSlug={clientSlug} dateRange={dateRange} />
      }
      if (subsection === 'search-console') {
        return <GoogleSearchConsoleReport clientSlug={clientSlug} />
      }
      return <GA4Report clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
    case 'google-search-console':
      return <GoogleSearchConsoleReport clientSlug={clientSlug} />
    case 'hubspot-performance':
      return <HubSpotPerformanceReport clientSlug={clientSlug} />
    case 'inbound-funnel':
      return <InboundFunnelReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} subsection={subsection} />
    case 'peec-ai':
      if (subsection === 'pr-influence')    return <PRInfluenceReport clientSlug={clientSlug} dateRange={dateRange} demoMode={demoMode} models={models} />
      if (subsection === 'content-impact')  return <ContentImpactReport clientSlug={clientSlug} dateRange={dateRange} demoMode={demoMode} models={models} />
      if (subsection === 'technical-audit') return <TechnicalAuditReport clientSlug={clientSlug} dateRange={dateRange} demoMode={demoMode} />
      return <PeecAIReport clientSlug={clientSlug} dateRange={dateRange} demoMode={demoMode} models={models} />
    case 'paid-media':
      if (subsection === 'meta')     return <MetaAdsReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      if (subsection === 'linkedin') return <LinkedInAdsReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      return <PaidSearchReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
    case 'organic-social':
      return <OrganicSocialReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
    default:
      return null
  }
}

const GA4_SUBSECTION_NAMES: Record<string, string> = {
  'conversion-journey': 'Conversion Journey',
  'search-console':     'Search Console',
}

const INBOUND_FUNNEL_SUBSECTION_NAMES: Record<string, string> = {
  'forms':  'Forms',
  'pacing': 'Pacing',
}

const AEO_SUBSECTION_NAMES: Record<string, string> = {
  'pr-influence':    'PR Influence',
  'content-impact':  'Content Impact',
  'technical-audit': 'Technical Performance',
}

const PAID_MEDIA_SUBSECTION_NAMES: Record<string, string> = {
  'meta':     'Meta Advertising',
  'linkedin': 'LinkedIn Advertising',
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientSlug: string }>
  searchParams: Promise<{ section?: string; subsection?: string; dateRange?: string; compareRange?: string; period?: string; models?: string }>
}) {
  const { clientSlug } = await params
  const { section, subsection, dateRange: dateRangeParam, compareRange: compareRangeParam, period: periodParam, models: modelsParam } = await searchParams
  const client = await getClientBySlug(clientSlug)
  if (!client) notFound()

  const session = await auth()
  const submittedBy = session?.user?.email ?? undefined
  // See lib/demo-data/resolve.ts for the resolution rules. Demo mode
  // is strictly gated by users.demoMode; the sidebar toggle's cookie
  // can only turn it off, not on.
  const cookieStore = await cookies()
  const demoMode = resolveDemoMode({
    userDemoFlag: session?.user?.demoMode === true,
    cookieValue:  cookieStore.get('demoMode')?.value,
  })

  // Default landing: open the first enabled report in sidebar (NAV_GROUPS)
  // order so it matches the first visible nav item — not enabledReports[0],
  // which can lead with a legacy/empty slug.
  const defaultSection =
    NAV_SLUG_ORDER.find((s) => client.enabledReports.includes(s as ReportSlug)) ??
    client.enabledReports[0]

  // The sidebar derives its highlighted item from the URL's `section` param, so
  // a bare /reports (no section) renders content but highlights nothing.
  // Redirect to the canonical URL so the page and sidebar share one source of
  // truth — both read the same `section`.
  if (!section && defaultSection) {
    const sp = new URLSearchParams()
    if (dateRangeParam)    sp.set('dateRange', dateRangeParam)
    if (compareRangeParam) sp.set('compareRange', compareRangeParam)
    if (periodParam)       sp.set('period', periodParam)
    if (modelsParam)       sp.set('models', modelsParam)
    sp.set('section', defaultSection)
    redirect(`/dashboard/${clientSlug}/reports?${sp.toString()}`)
  }

  const activeSection = (
    client.enabledReports.includes(section as ReportSlug)
      ? section
      : defaultSection
  ) as ReportSlug

  const dateRange    = dateRangeParam  ?? 'last_30_days'
  const compareRange = compareRangeParam ?? null
  const models       = parseModelsParam(modelsParam)
  const period       = (['weekly', 'monthly', 'quarterly'].includes(periodParam ?? '')
    ? periodParam
    : 'monthly') as SummaryPeriod

  // Title: subsection name takes precedence, then section name
  const pageTitle =
    (activeSection === 'ga4' && subsection && GA4_SUBSECTION_NAMES[subsection])
      ? GA4_SUBSECTION_NAMES[subsection]
    : (activeSection === 'inbound-funnel' && subsection && INBOUND_FUNNEL_SUBSECTION_NAMES[subsection])
      ? INBOUND_FUNNEL_SUBSECTION_NAMES[subsection]
    : (activeSection === 'peec-ai' && subsection && AEO_SUBSECTION_NAMES[subsection])
      ? AEO_SUBSECTION_NAMES[subsection]
    : (activeSection === 'paid-media')
      ? (subsection && PAID_MEDIA_SUBSECTION_NAMES[subsection] ? PAID_MEDIA_SUBSECTION_NAMES[subsection] : 'Paid Search')
    : (REPORT_NAMES[activeSection] ?? activeSection)

  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={50}>
      <StickyReportHeader title={pageTitle} subtitle={client.name} logoUrl={client.logoUrl ?? undefined}>
        {((activeSection === 'ga4' || activeSection === 'inbound-funnel') && subsection !== 'pacing' && subsection !== 'search-console') && (
          <Suspense fallback={null}>
            <GA4DatePicker dateRange={dateRange} compareRange={compareRange} />
          </Suspense>
        )}
        {/* All AEO pages (Overview + PR Influence, Content Impact, Technical
            Audit) honor the page date range, comparing against the previous
            period of equal length. */}
        {activeSection === 'peec-ai' && (!subsection || AEO_SUBSECTION_NAMES[subsection]) && (
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
        {activeSection === 'peec-ai' && (!subsection || subsection === 'pr-influence' || subsection === 'content-impact') && (
          <Suspense fallback={null}>
            <ModelFilter selected={models} />
          </Suspense>
        )}
      </StickyReportHeader>

      <div className="h-8" />

      <ReportErrorBoundary sectionName={pageTitle}>
        {/* Key on section+subsection so switching reports in the sidebar (a
            same-route ?section= change) remounts this boundary and shows the
            skeleton immediately, instead of holding the old section on screen
            for the duration of the new section's server-side data fetch. */}
        <Suspense key={`${activeSection}:${subsection ?? ''}:${dateRange}:${compareRange ?? ''}:${modelsParam ?? ''}`} fallback={<SectionSkeleton />}>
          {getReportComponent(activeSection, clientSlug, dateRange, compareRange, subsection, period, submittedBy, demoMode, models)}
        </Suspense>
      </ReportErrorBoundary>
    </TooltipProvider>
  )
}
