import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getClientBySlug } from '@/lib/clients.config'
import { REPORT_NAMES } from '@/lib/constants'
import { StickyReportHeader } from '@/components/layout/sticky-report-header'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'
import { GA4Report } from '@/components/report-sections/ga4'
import { ConversionJourneyReport } from '@/components/report-sections/ga4/conversion-journey'
import { GoogleSearchConsoleReport } from '@/components/report-sections/google-search-console'
import { HubSpotPerformanceReport } from '@/components/report-sections/hubspot-performance'
import { InboundFunnelReport } from '@/components/report-sections/inbound-funnel'
import { PeecAIReport } from '@/components/report-sections/peec-ai'
import { PRInfluenceReport } from '@/components/report-sections/peec-ai/pr-influence'
import { ContentImpactReport } from '@/components/report-sections/peec-ai/content-impact'
import { TechnicalAuditReport } from '@/components/report-sections/peec-ai/technical-audit'
import { ProfoundAIReport } from '@/components/report-sections/profound-ai'
import { DemandOverviewReport } from '@/components/report-sections/demand-overview'
import { AISummariesReport } from '@/components/report-sections/ai-summaries'
import { ReportGeneratorReport } from '@/components/report-sections/report-generator'
import type { SummaryPeriod } from '@/components/report-sections/ai-summaries/period-selector'
import { GA4DatePicker } from '@/components/report-sections/ga4/date-picker'
import type { ReportSlug } from '@/lib/clients.config'

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

function getReportComponent(
  slug: ReportSlug,
  clientSlug: string,
  dateRange: string,
  compareRange: string | null,
  subsection?: string,
  period?: SummaryPeriod,
) {
  switch (slug) {
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
      return <GA4Report clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
    case 'google-search-console':
      return <GoogleSearchConsoleReport clientSlug={clientSlug} />
    case 'hubspot-performance':
      return <HubSpotPerformanceReport clientSlug={clientSlug} />
    case 'inbound-funnel':
      return <InboundFunnelReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} subsection={subsection} />
    case 'peec-ai':
      if (subsection === 'pr-influence')    return <PRInfluenceReport />
      if (subsection === 'content-impact')  return <ContentImpactReport />
      if (subsection === 'technical-audit') return <TechnicalAuditReport clientSlug={clientSlug} />
      return <PeecAIReport />
    case 'profound-ai':
      return <ProfoundAIReport />
    default:
      return null
  }
}

const GA4_SUBSECTION_NAMES: Record<string, string> = {
  'conversion-journey': 'Conversion Journey',
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

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientSlug: string }>
  searchParams: Promise<{ section?: string; subsection?: string; dateRange?: string; compareRange?: string; period?: string }>
}) {
  const { clientSlug } = await params
  const { section, subsection, dateRange: dateRangeParam, compareRange: compareRangeParam, period: periodParam } = await searchParams
  const client = getClientBySlug(clientSlug)
  if (!client) notFound()

  const activeSection = (
    client.enabledReports.includes(section as ReportSlug)
      ? section
      : client.enabledReports[0]
  ) as ReportSlug

  const dateRange    = dateRangeParam  ?? 'last_30_days'
  const compareRange = compareRangeParam ?? null
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
    : (REPORT_NAMES[activeSection] ?? activeSection)

  return (
    <>
      <StickyReportHeader title={pageTitle} subtitle={client.name} logoUrl={client.logoUrl}>
        {(activeSection === 'ga4' || activeSection === 'inbound-funnel') && subsection !== 'pacing' && (
          <Suspense fallback={null}>
            <GA4DatePicker dateRange={dateRange} compareRange={compareRange} />
          </Suspense>
        )}
      </StickyReportHeader>

      <div className="h-8" />

      <ReportErrorBoundary sectionName={pageTitle}>
        <Suspense fallback={<SectionSkeleton />}>
          {getReportComponent(activeSection, clientSlug, dateRange, compareRange, subsection, period)}
        </Suspense>
      </ReportErrorBoundary>
    </>
  )
}
