import { getPaidSearchKpis } from '@/lib/paid-search/kpis'
import { getMetaKpis } from '@/lib/meta/kpis'
import { getLinkedInKpis } from '@/lib/linkedin/kpis'
import type { Kpi } from '@/lib/paid-search/types'

export type ChannelKey = 'paid-search' | 'meta' | 'linkedin'

export interface ChannelMetrics {
  key: ChannelKey
  label: string
  spend: number | null
  clicks: number | null
  ok: boolean
}

export interface PaidMediaOverview {
  /** Per-channel breakdown — always lists all three (item 11b). */
  channels: ChannelMetrics[]
  /** null → render '—'. Unavailable unless ALL three channels report (item 4). */
  blendedSpend: number | null
  /** null → render '—'. Meta contributes link clicks, not all clicks (item 2). */
  blendedClicks: number | null
  /** Always null until HubSpot lead attribution is defined (Blocker 1 / Task 9). */
  leads: null
  /** Always null until Blocker 1 is answered. */
  costPerLead: null
}

/** Read a KPI value by key and coerce to a number (values may be number | string). */
function readKpi(kpis: Kpi[], key: string): number {
  const v = kpis.find((k) => k.key === key)?.value
  return typeof v === 'number' ? v : Number(v ?? 0)
}

const CHANNELS: Array<{ key: ChannelKey; label: string; spendKey: string; clicksKey: string }> = [
  // Paid Search: Spend key 'cost', Clicks key 'clicks'.
  { key: 'paid-search', label: 'Paid Search', spendKey: 'cost', clicksKey: 'clicks' },
  // Meta: Spend key 'spend', Clicks key 'linkClicks' (link clicks — item 2).
  { key: 'meta', label: 'Meta Advertising', spendKey: 'spend', clicksKey: 'linkClicks' },
  // LinkedIn: Spend key 'spend', Clicks key 'clicks'.
  { key: 'linkedin', label: 'LinkedIn Advertising', spendKey: 'spend', clicksKey: 'clicks' },
]

/**
 * Roll up blended Spend and Clicks across the three Paid Media channels.
 *
 * Missing-channel rule (item 4, comment [r], literal reading — see NEEDS ANSWER 2
 * in the spec): the blended Spend/Clicks totals are unavailable ('—' → null)
 * unless ALL three channels report. The per-channel breakdown still lists every
 * channel with its own ok flag so present channels are never hidden.
 *
 * Leads and Cost-per-lead are always null (Blocker 1): the doc requires blended
 * CPL = total spend ÷ HubSpot leads attributed to AVZ, but that figure is not
 * defined and no Paid Media client has HubSpot connected. Task 9 fills these
 * once the definition and a data path are provided.
 */
export async function getPaidMediaOverview(
  clientSlug: string,
  dateRange: string,
): Promise<PaidMediaOverview> {
  // No compare period needed for the rollup totals.
  const settled = await Promise.allSettled([
    getPaidSearchKpis(clientSlug, dateRange, null),
    getMetaKpis(clientSlug, dateRange, null),
    getLinkedInKpis(clientSlug, dateRange, null),
  ])

  const channels: ChannelMetrics[] = CHANNELS.map((c, i) => {
    const res = settled[i]
    if (res.status !== 'fulfilled') {
      return { key: c.key, label: c.label, spend: null, clicks: null, ok: false }
    }
    return {
      key: c.key,
      label: c.label,
      spend: readKpi(res.value, c.spendKey),
      clicks: readKpi(res.value, c.clicksKey),
      ok: true,
    }
  })

  const allOk = channels.every((c) => c.ok)
  const blendedSpend = allOk ? channels.reduce((s, c) => s + (c.spend ?? 0), 0) : null
  const blendedClicks = allOk ? channels.reduce((s, c) => s + (c.clicks ?? 0), 0) : null

  return { channels, blendedSpend, blendedClicks, leads: null, costPerLead: null }
}
