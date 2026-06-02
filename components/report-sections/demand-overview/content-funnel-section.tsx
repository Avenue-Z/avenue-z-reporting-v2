/**
 * ContentFunnel section — citations → organic sessions → contacts → ICP.
 * Mixes Peec citations, GA4 channel breakdown, and HubSpot contact-source data.
 */
import { ga4Query, parseDateRange } from '@/lib/ga4/client'
import { getPeecOverview } from '@/lib/peec/client'
import { getContactBreakdown } from '@/lib/hubspot/client'
import { CHART_COLORS } from '@/lib/constants'
import { ContentFunnel } from './content-funnel'
import type { ContentFunnelStage } from './content-funnel'

interface Props {
  clientSlug: string
}

export async function ContentFunnelSection({ clientSlug }: Props) {
  const resolved = parseDateRange('last_30_days')
  const mainIso  = `${resolved.startDate},${resolved.endDate}`

  const [peecRes, channelRes, breakdownRes] = await Promise.allSettled([
    getPeecOverview(clientSlug),
    ga4Query({
      clientSlug, dateRange: mainIso,
      metrics: ['sessions'],
      dimensions: ['sessionDefaultChannelGroup'],
      limit: 20,
    }),
    getContactBreakdown(clientSlug),
  ])

  const peec = peecRes.status === 'fulfilled' ? peecRes.value : null
  const totalCitations = peec?.totalCitationsByRange?.['YTD']
    ?? peec?.totalCitationsByRange?.['Last 30 Days']
    ?? 0

  const channelRows = channelRes.status === 'fulfilled' ? (channelRes.value?.rows ?? []) : []
  const organicSessions = channelRows
    .filter((r) => {
      const ch = String(r.sessionDefaultChannelGroup ?? '').toLowerCase()
      return ch.includes('organic') || ch === 'organic search' || ch === 'organic social'
    })
    .reduce((sum, r) => sum + ((r.sessions as number) ?? 0), 0)

  const breakdown = breakdownRes.status === 'fulfilled' ? breakdownRes.value : []
  const organicRow = breakdown.find((b) => {
    const s = b.source.toLowerCase()
    return s.includes('organic') || s === 'organic search' || s === 'organic social'
  })
  const organicContacts    = organicRow ? organicRow.icp + organicRow.mcp + organicRow.unidentified : null
  const organicIcpContacts = organicRow?.icp ?? null

  const stages: ContentFunnelStage[] = [
    {
      label:          'AI Citations',
      source:         'AEO · Peec AI',
      value:          totalCitations,
      formattedValue: totalCitations.toLocaleString(),
      detail:         'times cited in AI answers (YTD)',
      color:          CHART_COLORS.primary,
      skipConversion: false,
    },
    {
      label:          'Organic Sessions',
      source:         'Web Analytics · GA4',
      value:          organicSessions,
      formattedValue: organicSessions.toLocaleString(),
      detail:         'sessions from organic channels (last 30d)',
      color:          CHART_COLORS.ga4,
      skipConversion: true,
    },
    {
      label:          'Organic Contacts',
      source:         'Inbound · HubSpot',
      value:          organicContacts ?? 0,
      formattedValue: organicContacts != null ? organicContacts.toLocaleString() : '—',
      detail:         'contacts from organic sources (YTD)',
      color:          CHART_COLORS.hubspot,
      skipConversion: false,
    },
    {
      label:          'ICP Contacts',
      source:         'Inbound · HubSpot',
      value:          organicIcpContacts ?? 0,
      formattedValue: organicIcpContacts != null ? organicIcpContacts.toLocaleString() : '—',
      detail:         'ideal customer profile fit (YTD)',
      color:          CHART_COLORS.positive,
      skipConversion: false,
    },
  ]

  return <ContentFunnel stages={stages} />
}
