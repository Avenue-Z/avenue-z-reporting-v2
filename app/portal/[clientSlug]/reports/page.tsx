import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getClientBySlug } from '@/lib/db/queries'
import { REPORT_NAMES } from '@/lib/constants'
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
import { OrganicSocialReport } from '@/components/report-sections/organic-social'
import { GA4DatePicker } from '@/components/report-sections/ga4/date-picker'
import { ExportPdfButton } from '@/components/export-pdf-button'
import { DataChat } from '@/components/data-chat'

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

function getReportComponent(slug: ReportSlug, clientSlug: string, dateRange: string, compareRange: string | null, subsection?: string) {
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

export default async function PortalReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientSlug: string }>
  searchParams: Promise<{ dateRange?: string; compareRange?: string; section?: string; subsection?: string }>
}) {
  const { clientSlug } = await params
  const { dateRange: dateRangeParam, compareRange: compareRangeParam, section, subsection } = await searchParams
  const client = await getClientBySlug(clientSlug)
  if (!client) notFound()

  const dateRange    = dateRangeParam  ?? 'last_30_days'
  const compareRange = compareRangeParam ?? null

  // Portal: default to first non-internal report (skip meeting-prep)
  const portalReports: ReportSlug[] = client.enabledReports
  const activeSection = (
    portalReports.includes(section as ReportSlug)
      ? section
      : portalReports[0]
  ) as ReportSlug

  const pageTitle =
    (activeSection === 'ga4' && subsection && GA4_SUBSECTION_NAMES[subsection])
      ? GA4_SUBSECTION_NAMES[subsection]
    : (activeSection === 'inbound-funnel' && subsection && INBOUND_FUNNEL_SUBSECTION_NAMES[subsection])
      ? INBOUND_FUNNEL_SUBSECTION_NAMES[subsection]
    : (activeSection === 'paid-media')
      ? (subsection && PAID_MEDIA_SUBSECTION_NAMES[subsection] ? PAID_MEDIA_SUBSECTION_NAMES[subsection] : 'Paid Search')
    : (REPORT_NAMES[activeSection] ?? activeSection)

  return (
    <>
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
        <ExportPdfButton />
      </StickyReportHeader>

      <div className="h-8" />

      <ReportErrorBoundary sectionName={pageTitle}>
        <Suspense fallback={<SectionSkeleton />}>
          {getReportComponent(activeSection, clientSlug, dateRange, compareRange, subsection)}
        </Suspense>
      </ReportErrorBoundary>

      <DataChat clientName={client.name} />
    </>
  )
}
