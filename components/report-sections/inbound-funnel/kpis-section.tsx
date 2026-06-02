/**
 * KPIs section — top 4 cards plus the Lead Quality Mix bar. Both
 * derive from the same two HubSpot range fetches.
 */
import { getContactStatsForRange } from '@/lib/hubspot/client'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { KpiCard } from '@/components/charts/kpi-card'
import { LeadQualityMix } from './quality-mix'
import { rangeDelta, fmtISODate } from './_utils'

interface Props {
  clientSlug:    string
  dateRange:     string
  compareRange:  string | null
}

export async function KpisSection({ clientSlug, dateRange, compareRange }: Props) {
  const main    = parseDateRange(dateRange)
  const compare = deriveCompareRange(dateRange, compareRange)

  // Sequential within this section to respect HubSpot's 4 req/s ceiling.
  const rangeStats   = await getContactStatsForRange(clientSlug, main.startDate, main.endDate)
  const compareStats = compare
    ? await getContactStatsForRange(clientSlug, compare.startDate, compare.endDate)
    : null

  const fmt          = (n: number | null) => n === null ? '—' : n.toLocaleString()
  const unidentified = rangeStats.online - rangeStats.icp - rangeStats.mcp
  const deltaLabel   = compare ? `${fmtISODate(compare.startDate)} – ${fmtISODate(compare.endDate)}` : undefined

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <KpiCard
          title="Online Contacts"
          value={fmt(rangeStats.online)}
          delta={rangeDelta(rangeStats.online, compareStats?.online)}
          deltaLabel={deltaLabel}
          subValue={compareStats != null ? `${compareStats.online.toLocaleString()} prior` : undefined}
          tooltip="Inbound contacts created from online sources in the selected date range. Excludes Offline contacts (events, cold outreach, etc.)."
        />
        <KpiCard
          title="ICP Contacts"
          value={fmt(rangeStats.icp)}
          delta={rangeDelta(rangeStats.icp, compareStats?.icp)}
          deltaLabel={deltaLabel}
          subValue={compareStats != null ? `${compareStats.icp.toLocaleString()} prior` : undefined}
          tooltip="Contacts in the selected date range with their Profile property set to ICP (Ideal Customer Profile)."
        />
        <KpiCard
          title="MCP Contacts"
          value={fmt(rangeStats.mcp)}
          delta={rangeDelta(rangeStats.mcp, compareStats?.mcp)}
          deltaLabel={deltaLabel}
          subValue={compareStats != null ? `${compareStats.mcp.toLocaleString()} prior` : undefined}
          tooltip="Contacts in the selected date range with their Profile property set to MCP (Most Compatible Profile)."
        />
        <KpiCard
          title="Offline Contacts"
          value={fmt(rangeStats.offline)}
          delta={rangeDelta(rangeStats.offline ?? 0, compareStats?.offline)}
          deltaLabel={deltaLabel}
          subValue={compareStats?.offline != null ? `${compareStats.offline.toLocaleString()} prior` : undefined}
          tooltip="Contacts in the selected date range whose original source is Offline — events, trade shows, cold outreach, and other non-digital channels."
        />
      </div>

      <LeadQualityMix
        icp={rangeStats.icp}
        mcp={rangeStats.mcp}
        unidentified={unidentified}
      />
    </div>
  )
}
