import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getClientBySlug } from '@/lib/db/queries'
import { REPORT_NAMES } from '@/lib/constants'
import { Header } from '@/components/layout/header'
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
import { InboundFunnelReport } from '@/components/report-sections/inbound-funnel'
import { RedditAdsReport } from '@/components/report-sections/reddit-ads'
import { BingAdsReport } from '@/components/report-sections/bing-ads'
import { OrganicSocialReport } from '@/components/report-sections/organic-social'
import { ReportDateRange } from './report-date-range'

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

function getReportSection(reportSlug: string, clientSlug: string, dateRange: string, compareRange: string | null) {
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
    case 'inbound-funnel':
      return <InboundFunnelReport clientSlug={clientSlug} />
    case 'reddit-ads':
      return <RedditAdsReport clientSlug={clientSlug} />
    case 'bing-ads':
      return <BingAdsReport clientSlug={clientSlug} />
    case 'organic-social':
      return <OrganicSocialReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
    default:
      return null
  }
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientSlug: string; reportSlug: string }>
  searchParams: Promise<{ dateRange?: string; compareRange?: string }>
}) {
  const { clientSlug, reportSlug } = await params
  const { dateRange: dateRangeParam, compareRange: compareRangeParam } = await searchParams
  const client = await getClientBySlug(clientSlug)
  if (!client) notFound()

  if (!client.enabledReports.includes(reportSlug as typeof client.enabledReports[number])) {
    notFound()
  }

  const reportName = REPORT_NAMES[reportSlug] ?? reportSlug
  const dateRange = dateRangeParam ?? 'last_30_days'
  const compareRange = compareRangeParam ?? null

  return (
    <>
      <Header title={reportName} subtitle={client.name}>
        <Suspense fallback={null}>
          <ReportDateRange value={dateRange} compareValue={compareRange} />
        </Suspense>
      </Header>

      <div className="divider-full mb-8" />

      <ReportErrorBoundary sectionName={reportName}>
        <Suspense fallback={<ReportSkeleton />}>
          {getReportSection(reportSlug, clientSlug, dateRange, compareRange)}
        </Suspense>
      </ReportErrorBoundary>
    </>
  )
}
