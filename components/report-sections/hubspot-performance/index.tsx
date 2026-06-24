import { getPipelineDeals, getOwnerMap } from '@/lib/hubspot/client'
import { KpiCard } from '@/components/charts/kpi-card'
import { PipelineStageAccordion } from './pipeline-stage-accordion'
import { LeadSourceChart } from './lead-source-chart'
import type { LeadSourceEntry } from './lead-source-chart'
import type { StageData } from './pipeline-stage-accordion'

interface HubSpotPerformanceProps {
  clientSlug: string
}

const STAGE_LABELS: Record<string, string> = {
  '1043842406': 'Discovery',
  '1043842407': 'Qualified Opportunity',
  '1121402756': 'Audit',
  '1043842408': 'Proposal Sent',
  '1043842409': 'Positive Proposal Feedback',
  '1043842410': 'Verbal',
  '1046812298': 'Contract Review / Redlines',
  '1043842411': 'Closed Won',
  '1043842412': 'Closed Lost',
  '1047007274': 'Not Ready at This Time',
}

const STAGE_ORDER = [
  '1043842406',
  '1043842407',
  '1121402756',
  '1043842408',
  '1043842409',
  '1043842410',
  '1046812298',
]

const CLOSED_STAGE_IDS = new Set(['1043842411', '1043842412'])
const HIDDEN_STAGE_IDS = new Set(['1043842411', '1043842412', '1047007274'])

function fmtUSD(n: number): string {
  if (isNaN(n)) return '—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function fmtUSDStr(val: string | null): string {
  if (!val) return '—'
  const n = parseFloat(val)
  return isNaN(n) ? '—' : fmtUSD(n)
}

function fmtDate(val: string | null): string {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDaysOld(createdate: string | null): string {
  if (!createdate) return '—'
  const created = new Date(createdate)
  if (isNaN(created.getTime())) return '—'
  const days = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24))
  if (days === 1) return '1 day'
  return `${days} days`
}

function fmtTimeInStage(enteredAt: string | null): string {
  if (!enteredAt) return '—'
  const entered = new Date(enteredAt)
  if (isNaN(entered.getTime())) return '—'
  const days = Math.floor((Date.now() - entered.getTime()) / (1000 * 60 * 60 * 24))
  if (days < 1) return '< 1 day'
  if (days === 1) return '1 day'
  if (days < 30) return `${days} days`
  const months = Math.floor(days / 30)
  const rem = days % 30
  const mo = months === 1 ? '1 mo' : `${months} mo`
  return rem === 0 ? mo : `${mo} ${rem}d`
}

function yoyDelta(current: number, prior: number): number | undefined {
  if (prior === 0) return undefined
  return ((current - prior) / prior) * 100
}

export async function HubSpotPerformanceReport({ clientSlug }: HubSpotPerformanceProps) {
  // Concurrent — deals search is throttled by the client's rate limiter and
  // the owners lookup is a separate (unthrottled) endpoint.
  const [deals, ownerMap] = await Promise.all([
    getPipelineDeals(clientSlug),
    getOwnerMap(clientSlug),
  ])

  const closeYear = (d: { properties: { closedate: string | null } }, yr: number) => {
    const cd = d.properties.closedate
    return cd ? new Date(cd).getFullYear() === yr : false
  }
  const is2026Close = (d: { properties: { closedate: string | null } }) => closeYear(d, 2026)
  const is2025Close = (d: { properties: { closedate: string | null } }) => closeYear(d, 2025)

  // ── 2026 (current year) ───────────────────────────────────────────────────
  const openDeals = deals.filter((d) => !HIDDEN_STAGE_IDS.has(d.properties.dealstage ?? '') && is2026Close(d))
  const wonDeals  = deals.filter((d) => d.properties.dealstage === '1043842411' && is2026Close(d))

  const totalOpenValue = openDeals.reduce((sum, d) => sum + (parseFloat(d.properties.amount ?? '') || 0), 0)
  const totalWonValue  = wonDeals.reduce((sum, d) => sum + (parseFloat(d.properties.amount ?? '') || 0), 0)
  const weightedValue  = openDeals.reduce((sum, d) => {
    const amount = parseFloat(d.properties.amount ?? '') || 0
    const prob   = parseFloat(d.properties.hs_deal_stage_probability ?? '') || 0
    return sum + amount * prob
  }, 0)

  // ── 2025 (prior year, for YoY) ────────────────────────────────────────────
  const openDeals2025 = deals.filter((d) => !HIDDEN_STAGE_IDS.has(d.properties.dealstage ?? '') && is2025Close(d))
  const wonDeals2025  = deals.filter((d) => d.properties.dealstage === '1043842411' && is2025Close(d))

  const totalOpenValue2025 = openDeals2025.reduce((sum, d) => sum + (parseFloat(d.properties.amount ?? '') || 0), 0)
  const totalWonValue2025  = wonDeals2025.reduce((sum, d) => sum + (parseFloat(d.properties.amount ?? '') || 0), 0)
  const weightedValue2025  = openDeals2025.reduce((sum, d) => {
    const amount = parseFloat(d.properties.amount ?? '') || 0
    const prob   = parseFloat(d.properties.hs_deal_stage_probability ?? '') || 0
    return sum + amount * prob
  }, 0)

  const closeDateYear = (d: { properties: { closedate: string | null } }) => {
    const cd = d.properties.closedate
    return cd ? new Date(cd).getFullYear() : null
  }

  const buildStageData = (yearFilter: number): StageData[] => {
    const byStage: Record<string, typeof deals> = {}
    for (const deal of deals) {
      if (HIDDEN_STAGE_IDS.has(deal.properties.dealstage ?? '')) continue
      if (closeDateYear(deal) !== yearFilter) continue
      const s = deal.properties.dealstage ?? 'unknown'
      if (!byStage[s]) byStage[s] = []
      byStage[s].push(deal)
    }
    return STAGE_ORDER
      .filter((s) => byStage[s])
      .map((s) => {
        const stageDeals = byStage[s]
        const totalVal    = stageDeals.reduce((sum, d) => sum + (parseFloat(d.properties.amount ?? '') || 0), 0)
        const weightedVal = stageDeals.reduce((sum, d) => {
          const amount = parseFloat(d.properties.amount ?? '') || 0
          const prob   = parseFloat(d.properties.hs_deal_stage_probability ?? '') || 0
          return sum + amount * prob
        }, 0)
        const sortedDeals = [...stageDeals].sort((a, b) => {
          const aDate = a.properties.closedate ? new Date(a.properties.closedate).getTime() : 0
          const bDate = b.properties.closedate ? new Date(b.properties.closedate).getTime() : 0
          return aDate - bDate
        })
        return {
          id: s,
          label: STAGE_LABELS[s] ?? s,
          count: stageDeals.length,
          totalValue: fmtUSD(totalVal),
          weightedValue: fmtUSD(weightedVal),
          deals: sortedDeals.map((d) => ({
            id: d.id,
            dealname: d.properties.dealname ?? '',
            amount: fmtUSDStr(d.properties.amount),
            closedate: fmtDate(d.properties.closedate),
            owner: d.properties.hubspot_owner_id
              ? (ownerMap[d.properties.hubspot_owner_id] ?? d.properties.hubspot_owner_id)
              : '—',
            timeInStage: fmtTimeInStage(d.properties['hs_v2_date_entered_current_stage']),
            daysOld: fmtDaysOld(d.properties.createdate),
          })),
        }
      })
  }

  const stageData     = buildStageData(2026)
  const graveyardData = buildStageData(2025)

  // Pipeline by owner — active 2026 deals grouped by owner, sorted by total value desc
  const byOwner: Record<string, typeof deals> = {}
  for (const deal of deals) {
    if (HIDDEN_STAGE_IDS.has(deal.properties.dealstage ?? '')) continue
    if (closeDateYear(deal) !== 2026) continue
    const ownerId = deal.properties.hubspot_owner_id ?? 'unassigned'
    if (!byOwner[ownerId]) byOwner[ownerId] = []
    byOwner[ownerId].push(deal)
  }

  const ownerData: StageData[] = Object.entries(byOwner)
    .map(([ownerId, ownerDeals]) => {
      const totalVal    = ownerDeals.reduce((sum, d) => sum + (parseFloat(d.properties.amount ?? '') || 0), 0)
      const weightedVal = ownerDeals.reduce((sum, d) => {
        const amount = parseFloat(d.properties.amount ?? '') || 0
        const prob   = parseFloat(d.properties.hs_deal_stage_probability ?? '') || 0
        return sum + amount * prob
      }, 0)
      const sortedDeals = [...ownerDeals].sort((a, b) => {
        const aDate = a.properties.closedate ? new Date(a.properties.closedate).getTime() : 0
        const bDate = b.properties.closedate ? new Date(b.properties.closedate).getTime() : 0
        return aDate - bDate
      })
      const ownerName = ownerId === 'unassigned' ? 'Unassigned' : (ownerMap[ownerId] ?? ownerId)
      return {
        id: ownerId,
        label: ownerName,
        count: ownerDeals.length,
        totalValue: fmtUSD(totalVal),
        weightedValue: fmtUSD(weightedVal),
        deals: sortedDeals.map((d) => ({
          id: d.id,
          dealname: d.properties.dealname ?? '',
          amount: fmtUSDStr(d.properties.amount),
          closedate: fmtDate(d.properties.closedate),
          owner: STAGE_LABELS[d.properties.dealstage ?? ''] ?? d.properties.dealstage ?? '—',
          timeInStage: fmtTimeInStage(d.properties['hs_v2_date_entered_current_stage']),
          daysOld: fmtDaysOld(d.properties.createdate),
        })),
      }
    })
    .sort((a, b) => {
      const aVal = parseFloat(a.totalValue.replace(/[^0-9.-]/g, '')) || 0
      const bVal = parseFloat(b.totalValue.replace(/[^0-9.-]/g, '')) || 0
      return bVal - aVal
    })

  // Lead source breakdown — open 2026 deals grouped by deal_source_1
  const leadSourceGroups: Record<string, typeof openDeals> = {}
  for (const deal of openDeals) {
    const src = deal.properties['deal_source_1'] ?? 'Unknown'
    if (!leadSourceGroups[src]) leadSourceGroups[src] = []
    leadSourceGroups[src].push(deal)
  }
  const leadSourceData = Object.entries(leadSourceGroups)
    .map(([source, groupDeals]) => ({
      source,
      count: groupDeals.length,
      deals: [...groupDeals]
        .sort((a, b) => {
          const aDate = a.properties.closedate ? new Date(a.properties.closedate).getTime() : 0
          const bDate = b.properties.closedate ? new Date(b.properties.closedate).getTime() : 0
          return aDate - bDate
        })
        .map((d) => ({
          id: d.id,
          dealname: d.properties.dealname ?? '',
          amount: fmtUSDStr(d.properties.amount),
          closedate: fmtDate(d.properties.closedate),
          owner: d.properties.hubspot_owner_id
            ? (ownerMap[d.properties.hubspot_owner_id] ?? d.properties.hubspot_owner_id)
            : '—',
          timeInStage: fmtTimeInStage(d.properties['hs_v2_date_entered_current_stage']),
          daysOld: fmtDaysOld(d.properties.createdate),
        })),
    }))
    .sort((a, b) => b.count - a.count)

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Pipeline Performance
        </p>
        <h2 className="text-3xl font-extrabold uppercase text-white">
          New Business
        </h2>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <KpiCard
          title="Open Deals"
          value={openDeals.length}
          delta={yoyDelta(openDeals.length, openDeals2025.length)}
          deltaLabel="vs 2025"
          subValue={openDeals2025.length > 0 ? `${openDeals2025.length} in 2025` : undefined}
          tooltip="Count of deals in active pipeline stages (excludes Closed Won, Closed Lost, and Not Ready) with a 2026 close date."
        />
        <KpiCard
          title="Total Pipeline"
          value={fmtUSD(totalOpenValue)}
          delta={yoyDelta(totalOpenValue, totalOpenValue2025)}
          deltaLabel="vs 2025"
          subValue={totalOpenValue2025 > 0 ? `${fmtUSD(totalOpenValue2025)} in 2025` : undefined}
          tooltip="Sum of deal amounts for active-stage deals with a 2026 close date. Excludes Closed Won, Closed Lost, and Not Ready at This Time."
        />
        <KpiCard
          title="Closed Won"
          value={fmtUSD(totalWonValue)}
          delta={yoyDelta(totalWonValue, totalWonValue2025)}
          deltaLabel="vs 2025"
          subValue={totalWonValue2025 > 0 ? `${fmtUSD(totalWonValue2025)} in 2025` : undefined}
          tooltip="Sum of deal amounts where the stage is Closed Won and the close date falls in 2026 (current fiscal year)."
        />
        <KpiCard
          title="Weighted Pipeline"
          value={fmtUSD(weightedValue)}
          delta={yoyDelta(weightedValue, weightedValue2025)}
          deltaLabel="vs 2025"
          subValue={weightedValue2025 > 0 ? `${fmtUSD(weightedValue2025)} in 2025` : undefined}
          tooltip="Sum of (deal amount × stage probability) for active-stage deals with a 2026 close date. Reflects expected revenue adjusted for win likelihood."
        />
      </div>

      {/* Open deals by lead source */}
      {leadSourceData.length > 0 && (
        <div>
          <h3 className="mb-4 text-lg font-bold text-white">Open Deals by Lead Source</h3>
          <LeadSourceChart data={leadSourceData} />
        </div>
      )}

      {/* Pipeline by stage — accordion */}
      <div>
        <h3 className="mb-4 text-lg font-bold text-white">Pipeline by Stage</h3>
        <PipelineStageAccordion stages={stageData} />
      </div>

      {/* Pipeline by owner — accordion */}
      <div>
        <h3 className="mb-4 text-lg font-bold text-white">Pipeline by Owner</h3>
        <PipelineStageAccordion stages={ownerData} dealColumnLabel="Stage" />
      </div>

      {/* Graveyard — 2025 close dates */}
      {graveyardData.length > 0 && (
        <div>
          <div className="mb-4">
            <h3 className="text-lg font-bold text-white">Graveyard</h3>
            <p className="text-xs text-text-muted">Deals with a 2025 close date still in active stages</p>
          </div>
          <PipelineStageAccordion stages={graveyardData} />
        </div>
      )}

      <p className="text-xs text-text-muted">
        Live data from HubSpot CRM
      </p>
    </div>
  )
}
