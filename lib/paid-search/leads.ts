import { awQuery, isLeadAction } from './base'
import type { LeadBreakdown, LeadActionRow } from './types'
import type { PaidSearchConfig, LeadCategory } from '@/lib/db/schema'

export function transformLeads(
  actionRows: Record<string, string>[],
  weeklyRows: Record<string, string>[],
  cfg: PaidSearchConfig,
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

  const weekMap = new Map<string, number>()
  for (const r of weeklyRows) {
    if (!isLeadAction(r.ConversionTypeName, cfg)) continue
    weekMap.set(r.Yearweekiso, (weekMap.get(r.Yearweekiso) ?? 0) + Number(r.Conversions || 0))
  }
  const weekly = [...weekMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, leads]) => ({ week, leads }))

  return { byAction, categoryTotals, weekly, totalLeads }
}

export async function getLeadBreakdown(slug: string, dateRange: string): Promise<LeadBreakdown> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const cfg = (await getClientBySlug(slug))!.paidSearchConfig!
  const [actionRows, weeklyRows] = await Promise.all([
    awQuery(slug, ['ConversionTypeName', 'Conversions'], dateRange),
    awQuery(slug, ['Yearweekiso', 'ConversionTypeName', 'Conversions'], dateRange),
  ])
  return transformLeads(actionRows, weeklyRows, cfg)
}
