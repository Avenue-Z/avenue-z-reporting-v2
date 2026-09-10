import { awQuery, isLeadAction, pickTimeField } from './base'
import type { LeadBreakdown, LeadActionRow } from './types'
import type { PaidSearchConfig, LeadCategory } from '@/lib/db/schema'

export function transformLeads(
  actionRows: Record<string, string>[],
  trendRows: Record<string, string>[],
  cfg: PaidSearchConfig,
  dateField: 'Date' | 'Yearweekiso',
): LeadBreakdown {
  const counts = new Map<string, number>()
  for (const r of actionRows) {
    if (!isLeadAction(r.ConversionTypeName, cfg)) continue
    counts.set(r.ConversionTypeName, (counts.get(r.ConversionTypeName) ?? 0) + Number(r.Conversions || 0))
  }
  const byAction: LeadActionRow[] = cfg.leadActions.map((a) => ({ name: a.name, category: a.category, count: counts.get(a.name) ?? 0 }))
  const categoryTotals: Record<LeadCategory, number> = { employer: 0, broker: 0, contact: 0 }
  for (const a of byAction) categoryTotals[a.category] += a.count
  const totalLeads = byAction.reduce((s, a) => s + a.count, 0)

  const trend = new Map<string, number>()
  for (const r of trendRows) {
    if (!isLeadAction(r.ConversionTypeName, cfg)) continue
    trend.set(r[dateField], (trend.get(r[dateField]) ?? 0) + Number(r.Conversions || 0))
  }
  const trendPoints = [...trend.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([bucket, leads]) => ({ bucket, leads }))

  return { byAction, categoryTotals, trend: trendPoints, totalLeads }
}

export async function getLeadBreakdown(slug: string, dateRange: string): Promise<LeadBreakdown> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const cfg = (await getClientBySlug(slug))!.paidSearchConfig!
  const field = pickTimeField(dateRange)
  const [actionRows, trendRows] = await Promise.all([
    awQuery(slug, ['ConversionTypeName', 'Conversions'], dateRange),
    awQuery(slug, [field, 'ConversionTypeName', 'Conversions'], dateRange),
  ])
  return transformLeads(actionRows, trendRows, cfg, field)
}
