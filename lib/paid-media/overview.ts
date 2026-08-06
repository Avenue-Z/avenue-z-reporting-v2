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
  /** Per-channel % change vs the prior period (undefined = no comparison). */
  spendDelta?: number
  clicksDelta?: number
  leadsDelta?: number
}

export interface PaidMediaOverview {
  /** Per-channel breakdown — always lists all three (item 11b). */
  channels: ChannelMetrics[]
  /**
   * null → render '—'. Blended over the lead-bearing channels (Paid Search +
   * LinkedIn) only — Meta is excluded from every blended figure. Blank unless
   * every *configured* lead-bearing channel reports; a channel the client does
   * not run (or Meta, ever) never blanks or lowers the blend.
   */
  blendedSpend: number | null
  /** null → render '—'. Blended over Paid Search + LinkedIn (Meta excluded). */
  blendedClicks: number | null
  /**
   * null → render '—'. Blended over Paid Search + LinkedIn (the lead-bearing
   * channels). Meta has no leads data and is excluded. Same gate/base as
   * blendedSpend/blendedClicks, so the tiles reconcile.
   */
  blendedLeads: number | null
  /** null → render '—'. blendedSpend / blendedLeads (both PS+LinkedIn). Null when blendedLeads is 0. */
  blendedCostPerLead: number | null
  /** Blended % change vs the prior period; undefined unless every channel feeding the blend has a prior (same all-or-nothing gate as the value). */
  blendedSpendDelta?: number
  blendedClicksDelta?: number
  blendedLeadsDelta?: number
  blendedCostPerLeadDelta?: number
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

function readKpiDelta(kpis: Kpi[], key: string): number | undefined {
  return kpis.find((k) => k.key === key)?.delta
}
function readKpiCompare(kpis: Kpi[], key: string): number | undefined {
  return kpis.find((k) => k.key === key)?.compareValue
}
/** % change vs prior; undefined when prior is 0 or absent (matches the channels' rule). */
function pct(cur: number, prev: number | undefined): number | undefined {
  if (prev == null || prev === 0) return undefined
  return ((cur - prev) / prev) * 100
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
 * Roll up blended Spend, Clicks, Leads, and Cost-per-lead across the Paid Media
 * channels the client runs.
 *
 * Missing-channel rule (item 4, comment [r] — Dianna's scoped reading): the
 * blended Spend/Clicks totals are unavailable ('—' → null) unless every channel
 * the client is *configured* for reports. A channel the client does not run is
 * excluded from the blend and the gate entirely, so its absence never blanks or
 * lowers the total; only a configured channel that fails to load blanks it. The
 * per-channel breakdown still lists all three (non-run channels render '—').
 *
 * Blended Leads / Cost-per-lead are gated independently, scoped to the
 * lead-bearing channels only (Paid Search + LinkedIn — those with a `leadsKey`).
 * Meta has no leads data (data gap) and is excluded entirely, so a failed or
 * non-configured Meta never blanks Leads/CPL. Per-channel Leads are still shown
 * for Paid Search and LinkedIn in the breakdown; Meta shows '—'.
 */
export async function getPaidMediaOverview(
  clientSlug: string,
  dateRange: string,
  compareRange: string | null = null,
): Promise<PaidMediaOverview> {
  const client = await getClientBySlug(clientSlug)
  const configured: Record<ChannelKey, boolean> = {
    'paid-search': !!client?.paidSearchConfig,
    meta: !!client?.metaConfig,
    linkedin: !!client?.linkedinConfig,
  }

  const effectiveCompare = compareRange ?? 'previous_period'

  // Fetch only the channels the client runs.
  const settled = await Promise.allSettled([
    configured['paid-search'] ? getPaidSearchKpis(clientSlug, dateRange, effectiveCompare) : Promise.resolve(null),
    configured.meta ? getMetaKpis(clientSlug, dateRange, effectiveCompare) : Promise.resolve(null),
    configured.linkedin ? getLinkedInKpis(clientSlug, dateRange, effectiveCompare) : Promise.resolve(null),
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
    return {
      key: c.key, label: c.label, configured: true, spend, clicks, leads, ok: true,
      spendDelta: readKpiDelta(res.value, c.spendKey),
      clicksDelta: readKpiDelta(res.value, c.clicksKey),
      leadsDelta: c.leadsKey ? readKpiDelta(res.value, c.leadsKey) : undefined,
    }
  })

  // Prior-period absolutes per channel, for blended deltas. Only for channels that
  // reported (ok) with a defined compareValue on the blended key; undefined otherwise.
  const priorOf = (key: ChannelKey) => {
    const i = CHANNELS.findIndex((c) => c.key === key)
    const cfg = CHANNELS[i]
    const res = settled[i]
    if (!configured[key] || res.status !== 'fulfilled' || res.value == null) return null
    return {
      spend: readKpiCompare(res.value, cfg.spendKey),
      clicks: readKpiCompare(res.value, cfg.clicksKey),
      leads: cfg.leadsKey ? readKpiCompare(res.value, cfg.leadsKey) : undefined,
    }
  }

  // The blended top line covers the LEAD-BEARING channels only (Paid Search +
  // LinkedIn — those with a leadsKey). Meta is excluded from EVERY blended figure:
  // it has no lead data and the team wants the blend to aggregate just these two
  // channels (Meta's reporting is handled separately). Meta still appears in the
  // per-channel breakdown. Because Spend, Clicks, Leads and CPL all use the same
  // PS+LinkedIn base, the tiles reconcile (Spend ÷ Leads = Cost per Lead).
  // Gate: blank the blend unless every CONFIGURED lead-bearing channel reports; a
  // channel the client doesn't run (or Meta, ever) never blanks or lowers it.
  const blendKeys = new Set(CHANNELS.filter((c) => c.leadsKey).map((c) => c.key))
  const blendRuns = channels.filter((c) => c.configured && blendKeys.has(c.key))
  const blendOk = blendRuns.length > 0 && blendRuns.every((c) => c.ok)
  const blendedSpend = blendOk ? blendRuns.reduce((s, c) => s + (c.spend ?? 0), 0) : null
  const blendedClicks = blendOk ? blendRuns.reduce((s, c) => s + (c.clicks ?? 0), 0) : null
  const blendedLeads = blendOk ? blendRuns.reduce((s, c) => s + (c.leads ?? 0), 0) : null
  const blendedCostPerLead =
    blendOk && blendedLeads != null && blendedLeads > 0 ? (blendedSpend as number) / blendedLeads : null

  // Blended deltas: sum priors over the same PS+LinkedIn base. Blank (undefined)
  // unless the value is available AND every contributing channel has a defined prior.
  const priorsFor = (rows: ChannelMetrics[], field: 'spend' | 'clicks' | 'leads') => {
    const vals = rows.map((c) => priorOf(c.key)?.[field])
    return vals.every((v) => v != null) ? (vals as number[]).reduce((s, v) => s + v, 0) : undefined
  }

  const blendedSpendPrior = blendOk ? priorsFor(blendRuns, 'spend') : undefined
  const blendedClicksPrior = blendOk ? priorsFor(blendRuns, 'clicks') : undefined
  const blendedLeadsPrior = blendOk ? priorsFor(blendRuns, 'leads') : undefined

  const blendedSpendDelta = blendedSpend != null ? pct(blendedSpend, blendedSpendPrior) : undefined
  const blendedClicksDelta = blendedClicks != null ? pct(blendedClicks, blendedClicksPrior) : undefined
  const blendedLeadsDelta = blendedLeads != null ? pct(blendedLeads, blendedLeadsPrior) : undefined
  const priorCpl =
    blendedSpendPrior != null && blendedLeadsPrior != null && blendedLeadsPrior > 0
      ? blendedSpendPrior / blendedLeadsPrior
      : undefined
  const blendedCostPerLeadDelta =
    blendedCostPerLead != null ? pct(blendedCostPerLead, priorCpl) : undefined

  return {
    channels, blendedSpend, blendedClicks, blendedLeads, blendedCostPerLead,
    blendedSpendDelta, blendedClicksDelta, blendedLeadsDelta, blendedCostPerLeadDelta,
  }
}
