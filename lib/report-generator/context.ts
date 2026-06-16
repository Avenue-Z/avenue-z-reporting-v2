/**
 * Report Generator — live data snapshot
 *
 * Fetches a lightweight summary from every connected channel in parallel.
 * Each fetch is individually try/caught — a missing env var or API error
 * on one channel never blocks the others.
 *
 * Server-side only. Never import from a Client Component.
 */

import { ga4Totals, parseDateRange } from '@/lib/ga4/client'
import {
  getContactStatsForRange,
  getPipelineDeals,
} from '@/lib/hubspot/client'
import { getPeecOverview } from '@/lib/peec/client'
import { getClientBySlug } from '@/lib/db/queries'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GA4Snapshot = {
  sessions:       number
  sessionsDelta:  number   // % vs prior period
  users:          number
  usersDelta:     number
  bounceRate:     number   // 0–100
  bounceDelta:    number
  startDate:      string
  endDate:        string
}

export type InboundSnapshot = {
  total:     number
  icp:       number
  mcp:       number
  icpRate:   number        // 0–100
  totalDelta: number       // % vs prior 30 days
  startDate:  string
  endDate:    string
}

export type PipelineSnapshot = {
  openDeals:    number
  totalValue:   number     // USD
  avgDealValue: number
}

export type PeecSnapshot = {
  ownVisibility:  number   // 0–100
  ownSov:         number   // 0–100
  trackedPrompts: number
  totalCitations: number
  topLLM:         string
}

export type DataSnapshot = {
  fetchedAt:  string
  dateLabel:  string        // e.g. "Last 30 days"
  ga4?:       GA4Snapshot
  inbound?:   InboundSnapshot
  pipeline?:  PipelineSnapshot
  peec?:      PeecSnapshot
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function pct(current: number, prior: number): number {
  if (prior === 0) return 0
  return ((current - prior) / prior) * 100
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function fmtDelta(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

export function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

export { fmt, fmtDelta }

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

async function fetchGA4(clientSlug: string, days: number): Promise<GA4Snapshot | undefined> {
  try {
    const dateRangeStr = `last_${days}_days`
    const { startDate, endDate } = parseDateRange(dateRangeStr)

    // Prior period: same window length ending the day before the current window
    const priorEnd   = new Date(startDate); priorEnd.setUTCDate(priorEnd.getUTCDate() - 1)
    const priorStart = new Date(priorEnd);  priorStart.setUTCDate(priorEnd.getUTCDate() - (days - 1))
    const priorRange = `custom:${toISO(priorStart)},${toISO(priorEnd)}`

    const [cur, prior] = await Promise.all([
      ga4Totals(clientSlug, ['sessions', 'activeUsers', 'bounceRate'], dateRangeStr),
      ga4Totals(clientSlug, ['sessions', 'activeUsers', 'bounceRate'], priorRange),
    ])

    const sessions   = Number(cur.sessions   ?? 0)
    const users      = Number(cur.activeUsers ?? 0)
    // GA4 returns bounceRate as a ratio (0.0–1.0)
    const bounceRate = Number(cur.bounceRate  ?? 0) * 100

    const pSessions   = Number(prior.sessions   ?? 0)
    const pUsers      = Number(prior.activeUsers ?? 0)
    const pBounceRate = Number(prior.bounceRate  ?? 0) * 100

    return {
      sessions,
      sessionsDelta: pct(sessions, pSessions),
      users,
      usersDelta:    pct(users, pUsers),
      bounceRate,
      bounceDelta:   pct(bounceRate, pBounceRate),
      startDate,
      endDate,
    }
  } catch {
    return undefined
  }
}

async function fetchInbound(clientSlug: string, days: number): Promise<InboundSnapshot | undefined> {
  try {
    const today    = new Date()
    const curEnd   = toISO(today)
    const curStart = new Date(today); curStart.setUTCDate(today.getUTCDate() - (days - 1))
    const curStartStr = toISO(curStart)

    const priorEnd   = new Date(curStart); priorEnd.setUTCDate(curStart.getUTCDate() - 1)
    const priorStart = new Date(priorEnd); priorStart.setUTCDate(priorEnd.getUTCDate() - (days - 1))

    const [cur, prior] = await Promise.all([
      getContactStatsForRange(clientSlug, curStartStr,       curEnd),
      getContactStatsForRange(clientSlug, toISO(priorStart), toISO(priorEnd)),
    ])

    const total   = cur.online
    const icp     = cur.icp
    const mcp     = cur.mcp
    const icpRate = total > 0 ? (icp / total) * 100 : 0

    return {
      total,
      icp,
      mcp,
      icpRate,
      totalDelta: pct(total, prior.online),
      startDate:  curStartStr,
      endDate:    curEnd,
    }
  } catch {
    return undefined
  }
}

async function fetchPipeline(clientSlug: string): Promise<PipelineSnapshot | undefined> {
  try {
    const deals = await getPipelineDeals(clientSlug)

    // Only count open deals (exclude closed-won / closed-lost)
    const open = deals.filter((d) => {
      const stage = d.properties.dealstage ?? ''
      return !stage.toLowerCase().includes('closed')
    })

    const totalValue = open.reduce((sum, d) => {
      const amt = parseFloat(d.properties.amount ?? '0')
      return sum + (isNaN(amt) ? 0 : amt)
    }, 0)

    return {
      openDeals:    open.length,
      totalValue,
      avgDealValue: open.length > 0 ? totalValue / open.length : 0,
    }
  } catch {
    return undefined
  }
}

async function fetchPeec(clientSlug: string): Promise<PeecSnapshot | undefined> {
  try {
    const data = await getPeecOverview(clientSlug, 'year_to_date')
    const youBrand = data.brandRankings.find((b) => b.isYou)
    const topLLM   = data.llmBreakdown.length > 0
      ? data.llmBreakdown.reduce((a, b) => a.visibility > b.visibility ? a : b).model
      : 'Unknown'
    const totalCitations = data.totalCitations ?? 0

    return {
      ownVisibility:  youBrand ? youBrand.visibility * 100 : 0,
      ownSov:         youBrand ? youBrand.sov * 100 : 0,
      trackedPrompts: data.trackedPrompts.length,
      totalCitations,
      topLLM,
    }
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export type SummaryPeriod = 'weekly' | 'monthly' | 'quarterly'

const PERIOD_CONFIG: Record<SummaryPeriod, { days: number; label: string }> = {
  weekly:    { days: 7,  label: 'Last 7 days'  },
  monthly:   { days: 30, label: 'Last 30 days' },
  quarterly: { days: 90, label: 'Last 90 days' },
}

export async function fetchDataSnapshot(
  clientSlug: string,
  period: SummaryPeriod = 'monthly',
): Promise<DataSnapshot> {
  const client = await getClientBySlug(clientSlug)
  if (!client) return { fetchedAt: new Date().toISOString(), dateLabel: 'Last 30 days' }

  const { days, label } = PERIOD_CONFIG[period]
  const enabled = new Set(client.enabledReports)

  const [ga4, inbound, pipeline, peec] = await Promise.all([
    enabled.has('ga4')                ? fetchGA4(clientSlug, days)      : Promise.resolve(undefined),
    enabled.has('inbound-funnel')     ? fetchInbound(clientSlug, days)  : Promise.resolve(undefined),
    enabled.has('hubspot-performance') ? fetchPipeline(clientSlug)      : Promise.resolve(undefined),
    enabled.has('peec-ai')            ? fetchPeec(clientSlug)           : Promise.resolve(undefined),
  ])

  return {
    fetchedAt: new Date().toISOString(),
    dateLabel: label,
    ga4:      ga4      ?? undefined,
    inbound:  inbound  ?? undefined,
    pipeline: pipeline ?? undefined,
    peec:     peec     ?? undefined,
  }
}
