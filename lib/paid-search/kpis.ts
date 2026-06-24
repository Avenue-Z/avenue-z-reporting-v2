import { awQuery, isLeadAction, resolveCompareIso } from './base'
import type { Kpi } from './types'
import type { PaidSearchConfig } from '@/lib/db/schema'

function scopedLeads(actionRows: Record<string, string>[], cfg: PaidSearchConfig): number {
  return actionRows.filter((r) => isLeadAction(r.ConversionTypeName, cfg)).reduce((s, r) => s + Number(r.Conversions || 0), 0)
}

function delta(cur: number, prev: number | undefined): number | undefined {
  if (prev == null || prev === 0) return undefined
  return ((cur - prev) / prev) * 100
}

export function transformKpis(
  totals: Record<string, string>,
  actionRows: Record<string, string>[],
  compareTotals: Record<string, string> | null,
  compareActionRows: Record<string, string>[] | null,
  cfg: PaidSearchConfig,
): Kpi[] {
  const cost = Number(totals.Cost || 0), clicks = Number(totals.Clicks || 0), impressions = Number(totals.Impressions || 0)
  const leads = scopedLeads(actionRows, cfg)

  const cCost = compareTotals ? Number(compareTotals.Cost || 0) : undefined
  const cClicks = compareTotals ? Number(compareTotals.Clicks || 0) : undefined
  const cImpressions = compareTotals ? Number(compareTotals.Impressions || 0) : undefined
  const cLeads = compareActionRows ? scopedLeads(compareActionRows, cfg) : undefined

  // Derived ratios for the current and compare periods (delta off raw ratio, not the rounded display value).
  const ratio = (n: number, d: number) => (d ? (n / d) : undefined)
  const ctr = impressions ? (clicks / impressions) * 100 : 0
  const cpc = clicks ? cost / clicks : 0
  const cpl = leads ? cost / leads : 0
  const convRate = clicks ? (leads / clicks) * 100 : 0
  const cCtr = cImpressions ? ((cClicks ?? 0) / cImpressions) * 100 : undefined
  const cConvRate = cClicks ? ((cLeads ?? 0) / cClicks) * 100 : undefined

  return [
    { key: 'cost', label: 'Cost', value: Math.round(cost), prefix: '$', delta: delta(cost, cCost) },
    { key: 'clicks', label: 'Clicks', value: clicks, delta: delta(clicks, cClicks) },
    { key: 'impressions', label: 'Impressions', value: impressions, delta: delta(impressions, cImpressions) },
    { key: 'ctr', label: 'CTR', value: +ctr.toFixed(1), suffix: '%', delta: delta(ctr, cCtr) },
    { key: 'cpc', label: 'Avg. CPC', value: +cpc.toFixed(2), prefix: '$', delta: delta(cpc, cClicks ? ratio(cCost ?? 0, cClicks) : undefined) },
    { key: 'leads', label: 'Leads', value: leads, delta: delta(leads, cLeads) },
    { key: 'cpl', label: 'Cost / Lead', value: leads ? Math.round(cost / leads) : 0, prefix: '$', delta: delta(cpl, cLeads ? ratio(cCost ?? 0, cLeads) : undefined) },
    { key: 'convRate', label: 'Conversion Rate', value: +convRate.toFixed(1), suffix: '%', delta: delta(convRate, cConvRate) },
  ]
}

export async function getPaidSearchKpis(slug: string, dateRange: string, compareRange: string | null): Promise<Kpi[]> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const cfg = (await getClientBySlug(slug))!.paidSearchConfig!
  const compareIso = resolveCompareIso(dateRange, compareRange)
  const [totals, actionRows, cTotals, cActions] = await Promise.all([
    awQuery(slug, ['Cost', 'Clicks', 'Impressions'], dateRange).then((r) => r[0] ?? {}),
    awQuery(slug, ['ConversionTypeName', 'Conversions'], dateRange),
    compareIso ? awQuery(slug, ['Cost', 'Clicks', 'Impressions'], compareIso).then((r) => r[0] ?? {}) : Promise.resolve(null),
    compareIso ? awQuery(slug, ['ConversionTypeName', 'Conversions'], compareIso) : Promise.resolve(null),
  ])
  return transformKpis(totals, actionRows, cTotals, cActions, cfg)
}
