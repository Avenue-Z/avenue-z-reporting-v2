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
  const cLeads = compareActionRows ? scopedLeads(compareActionRows, cfg) : undefined
  const cCost = compareTotals ? Number(compareTotals.Cost || 0) : undefined
  return [
    { key: 'cost', label: 'Cost', value: Math.round(cost), prefix: '$', delta: delta(cost, cCost) },
    { key: 'clicks', label: 'Clicks', value: clicks, delta: delta(clicks, compareTotals ? Number(compareTotals.Clicks || 0) : undefined) },
    { key: 'impressions', label: 'Impressions', value: impressions },
    { key: 'ctr', label: 'CTR', value: impressions ? +((clicks / impressions) * 100).toFixed(1) : 0, suffix: '%' },
    { key: 'cpc', label: 'Avg. CPC', value: clicks ? +(cost / clicks).toFixed(2) : 0, prefix: '$' },
    { key: 'leads', label: 'Leads', value: leads, delta: delta(leads, cLeads) },
    { key: 'cpl', label: 'Cost / Lead', value: leads ? Math.round(cost / leads) : 0, prefix: '$' },
    { key: 'convRate', label: 'Conversion Rate', value: clicks ? +((leads / clicks) * 100).toFixed(1) : 0, suffix: '%' },
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
