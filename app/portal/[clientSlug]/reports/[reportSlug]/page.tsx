import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { getClientBySlug } from '@/lib/db/queries'
import { REPORT_NAMES } from '@/lib/constants'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'
import { ExecSummary } from '@/components/report-sections/exec-summary'
import { GA4Report } from '@/components/report-sections/ga4'
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
import { DemandOverviewReport } from '@/components/report-sections/demand-overview'
import { PeecAIReport } from '@/components/report-sections/peec-ai'
import { InboundFunnelReport } from '@/components/report-sections/inbound-funnel'
import { RequestAReportReport } from '@/components/report-sections/request-a-report'
import { OrganicSocialReport } from '@/components/report-sections/organic-social'
import { PortalReportDateRange } from './report-date-range'
import { HealthProbe } from '@/lib/health/probe'

function ReportSkeleton() {
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

function getReportSection(
  reportSlug: string,
  clientSlug: string,
  dateRange: string,
  compareRange: string | null,
  submittedBy: string | undefined,
) {
  switch (reportSlug) {
    case 'exec-summary':
      return <ExecSummary clientSlug={clientSlug} />
    case 'ga4':
      return <GA4Report clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
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
    case 'demand-overview':
      return <DemandOverviewReport clientSlug={clientSlug} />
    case 'peec-ai':
      return <PeecAIReport clientSlug={clientSlug} />
    case 'inbound-funnel':
      return <InboundFunnelReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
    case 'request-a-report':
      return <RequestAReportReport clientSlug={clientSlug} submittedBy={submittedBy} />
    case 'organic-social':
      return <OrganicSocialReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
    default:
      return null
  }
}

export default async function PortalReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientSlug: string; reportSlug: string }>
  searchParams: Promise<{ dateRange?: string; compareRange?: string; health?: string }>
}) {
  const { clientSlug, reportSlug } = await params
  const { dateRange: dateRangeParam, compareRange: compareRangeParam, health: healthParam } = await searchParams
  const client = await getClientBySlug(clientSlug)
  if (!client) notFound()

  if (!client.enabledReports.includes(reportSlug as typeof client.enabledReports[number])) {
    notFound()
  }

  const session = await auth()
  const submittedBy = session?.user?.email ?? undefined

  const reportName = REPORT_NAMES[reportSlug] ?? reportSlug
  const dateRange = dateRangeParam ?? 'last_30_days'
  const compareRange = compareRangeParam ?? null

  if (healthParam === '1') {
    const element = getReportSection(reportSlug, clientSlug, dateRange, compareRange, submittedBy)
    return (
      <HealthProbe
        surface="portal"
        clientSlug={clientSlug}
        section={reportSlug}
        element={element ?? <></>}
      />
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
            {client.name}
          </p>
          <h1 className="text-3xl font-extrabold uppercase text-white">
            {reportName}
          </h1>
        </div>
        <Suspense fallback={null}>
          <PortalReportDateRange value={dateRange} />
        </Suspense>
      </div>

      <div className="divider-full mb-8" />

      <ReportErrorBoundary sectionName={reportName}>
        <Suspense fallback={<ReportSkeleton />}>
          {getReportSection(reportSlug, clientSlug, dateRange, compareRange, submittedBy)}
        </Suspense>
      </ReportErrorBoundary>
    </div>
  )
}
