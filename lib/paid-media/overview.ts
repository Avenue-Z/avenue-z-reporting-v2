import { getPaidSearchKpis } from '@/lib/paid-search/kpis'
import { getMetaKpis } from '@/lib/meta/kpis'
import { getLinkedInKpis } from '@/lib/linkedin/kpis'
import { getClientBySlug } from '@/lib/db/queries'
import type { Kpi } from '@/lib/paid-search/types'

export type ChannelKey = 'paid-search' | 'meta' | 'linkedin'

export interface ChannelMetrics {
  key: ChannelKey
  label: string
  /** Does this client run the channel? Non-configured channels are excluded from the blend. */
  configured: boolean
  spend: number | null
  clicks: number | null
  /**
   * Per-channel leads. Paid Search and LinkedIn expose a `leads` KPI; Meta does
   * not — Meta lead conversions are unavailable to us (a data-source gap), and
   * the team has decided to drop anything relating to Meta leads, so Meta's leads
   * is always null → renders '—'. A channel that failed to report (ok:false) or
   * one the client does not run (configured:false) is also null.
   */
  leads: number | null
  ok: boolean
}

export interface PaidMediaOverview {
  /** Per-channel breakdown — always lists all three (item 11b). */
  channels: ChannelMetrics[]
  /**
   * null → render '—'. Blended over the channels the client actually runs, and
   * blank unless every *configured* channel reports (item 4, Dianna's scoped
   * reading: only a configured channel that fails blanks the total — a channel
   * the client does not run never blanks or lowers the blend).
   */
  blendedSpend: number | null
  /** null → render '—'. Meta contributes link clicks, not all clicks (item 2). */
  blendedClicks: number | null
}

/**
 * Read a KPI value by key (values may be number | string), or `null` when the
 * key is ABSENT. A missing key means the channel's KPI shape drifted from what
 * this rollup expects (e.g. a metric was renamed) — the caller must treat that
 * as a channel failure and blank the blend rather than silently contributing 0,
 * which would understate the top line (item 4). A present-but-empty value still
 * coerces to 0 — that's genuine data, not a shape mismatch.
 */
function readKpi(kpis: Kpi[], key: string): number | null {
  const entry = kpis.find((k) => k.key === key)
  if (!entry) return null
  return typeof entry.value === 'number' ? entry.value : Number(entry.value ?? 0)
}

const CHANNELS: Array<{
  key: ChannelKey
  label: string
  spendKey: string
  clicksKey: string
  /** KPI key for per-channel leads. Omitted for Meta — no Meta lead data (data gap). */
  leadsKey?: string
}> = [
  // Paid Search: Spend key 'cost', Clicks key 'clicks', Leads key 'leads'.
  { key: 'paid-search', label: 'Paid Search', spendKey: 'cost', clicksKey: 'clicks', leadsKey: 'leads' },
  // Meta: Spend key 'spend', Clicks key 'linkClicks' (link clicks — item 2). No leads key (data gap).
  { key: 'meta', label: 'Meta Advertising', spendKey: 'spend', clicksKey: 'linkClicks' },
  // LinkedIn: Spend key 'spend', Clicks key 'clicks', Leads key 'leads' (LinkedIn oneClickLeads).
  { key: 'linkedin', label: 'LinkedIn Advertising', spendKey: 'spend', clicksKey: 'clicks', leadsKey: 'leads' },
]

/**
 * Roll up blended Spend and Clicks across the Paid Media channels the client runs.
 *
 * Missing-channel rule (item 4, comment [r] — Dianna's scoped reading): the
 * blended Spend/Clicks totals are unavailable ('—' → null) unless every channel
 * the client is *configured* for reports. A channel the client does not run is
 * excluded from the blend and the gate entirely, so its absence never blanks or
 * lowers the total; only a configured channel that fails to load blanks it. The
 * per-channel breakdown still lists all three (non-run channels render '—').
 *
 * There is no blended Leads / Cost-per-lead: those would need Meta lead data,
 * which is unavailable, and the team has dropped anything relating to or
 * influenced by Meta leads. Per-channel Leads are still shown for Paid Search and
 * LinkedIn in the breakdown; Meta shows '—'.
 */
export async function getPaidMediaOverview(
  clientSlug: string,
  dateRange: string,
): Promise<PaidMediaOverview> {
  const client = await getClientBySlug(clientSlug)
  const configured: Record<ChannelKey, boolean> = {
    'paid-search': !!client?.paidSearchConfig,
    meta: !!client?.metaConfig,
    linkedin: !!client?.linkedinConfig,
  }

  // Fetch only the channels the client runs. No compare period needed for totals.
  const settled = await Promise.allSettled([
    configured['paid-search'] ? getPaidSearchKpis(clientSlug, dateRange, null) : Promise.resolve(null),
    configured.meta ? getMetaKpis(clientSlug, dateRange, null) : Promise.resolve(null),
    configured.linkedin ? getLinkedInKpis(clientSlug, dateRange, null) : Promise.resolve(null),
  ])

  const channels: ChannelMetrics[] = CHANNELS.map((c, i) => {
    if (!configured[c.key]) {
      // Not run by this client — listed but excluded from the gate and the blend.
      return { key: c.key, label: c.label, configured: false, spend: null, clicks: null, leads: null, ok: false }
    }
    const res = settled[i]
    const failed = { key: c.key, label: c.label, configured: true, spend: null, clicks: null, leads: null, ok: false }
    if (res.status !== 'fulfilled' || res.value == null) {
      return failed
    }
    const spend = readKpi(res.value, c.spendKey)
    const clicks = readKpi(res.value, c.clicksKey)
    // Only channels with a leadsKey report leads; Meta has none (data gap) → null → '—'.
    const leads = c.leadsKey ? readKpi(res.value, c.leadsKey) : null
    // A channel that reported but is missing one of its expected KPI keys is a
    // shape drift — fail it (blank the blend) rather than reading a silent 0. A
    // Meta null-leads is expected (no leadsKey), so it is not a drift.
    if (spend === null || clicks === null || (c.leadsKey != null && leads === null)) {
      return failed
    }
    return { key: c.key, label: c.label, configured: true, spend, clicks, leads, ok: true }
  })

  // Blend over the configured channels only; blank if any configured channel failed.
  const runs = channels.filter((c) => c.configured)
  const allOk = runs.length > 0 && runs.every((c) => c.ok)
  const blendedSpend = allOk ? runs.reduce((s, c) => s + (c.spend ?? 0), 0) : null
  const blendedClicks = allOk ? runs.reduce((s, c) => s + (c.clicks ?? 0), 0) : null

  return { channels, blendedSpend, blendedClicks }
}
