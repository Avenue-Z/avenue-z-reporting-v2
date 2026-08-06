import { linkedinQuery, resolveCompareIso } from './base'
import type { Kpi } from '@/lib/paid-search/types'

function n(row: Record<string, string>, id: string): number {
  return Number(row[id] || 0)
}

function delta(cur: number, prev: number | undefined): number | undefined {
  if (prev == null || prev === 0) return undefined
  return ((cur - prev) / prev) * 100
}

// Frequency and Cost per Visit have NO native LinkedIn field — derived here.
const frequency = (t: Record<string, string>) =>
  n(t, 'approximateUniqueImpressions') ? n(t, 'impressions') / n(t, 'approximateUniqueImpressions') : 0
const costPerVisit = (t: Record<string, string>) =>
  n(t, 'landingPageClicks') ? n(t, 'spend') / n(t, 'landingPageClicks') : 0

export function transformLinkedInKpis(
  totals: Record<string, string>,
  compare: Record<string, string> | null,
): Kpi[] {
  const d = (id: string) => delta(n(totals, id), compare ? n(compare, id) : undefined)
  const cv = (id: string) => (compare ? n(compare, id) : undefined)

  // LinkedIn only reports Reach (approximateUniqueImpressions) for date ranges up to
  // ~90 days; beyond that it returns null. Show "—" rather than a misleading 0, and
  // suppress the derived Frequency + deltas that depend on it.
  const reachRaw = totals['approximateUniqueImpressions']
  const reachAvailable = reachRaw != null && reachRaw !== ''
  const reachNote = 'LinkedIn only reports Reach for date ranges up to ~90 days.'

  const liLeads = n(totals, 'oneClickLeads')

  return [
    { key: 'spend', label: 'Spend', value: n(totals, 'spend'), format: 'money', delta: d('spend'), compareValue: cv('spend') },
    { key: 'impressions', label: 'Impressions', value: n(totals, 'impressions'), delta: d('impressions') },
    {
      key: 'reach',
      label: 'Reach',
      value: reachAvailable ? n(totals, 'approximateUniqueImpressions') : '—',
      delta: reachAvailable ? d('approximateUniqueImpressions') : undefined,
      tooltip: reachAvailable ? undefined : reachNote,
    },
    { key: 'clicks', label: 'Clicks', value: n(totals, 'clicks'), delta: d('clicks'), compareValue: cv('clicks') },
    // LinkedIn returns ctr / leadFormCompletionRate as 0-1 fractions — scale to percent.
    { key: 'ctr', label: 'CTR', value: +(n(totals, 'ctr') * 100).toFixed(2), suffix: '%', delta: d('ctr') },
    { key: 'cpm', label: 'CPM', value: n(totals, 'cpm'), format: 'money', delta: d('cpm'), invertDelta: true },
    { key: 'cpc', label: 'CPC', value: n(totals, 'cpc'), format: 'money', delta: d('cpc'), invertDelta: true },
    {
      key: 'frequency',
      label: 'Frequency',
      value: reachAvailable ? +frequency(totals).toFixed(1) : '—',
      suffix: reachAvailable ? 'x' : undefined,
      delta: reachAvailable ? delta(frequency(totals), compare ? frequency(compare) : undefined) : undefined,
      invertDelta: true,
      tooltip: reachAvailable ? undefined : reachNote,
    },
    { key: 'landingPageClicks', label: 'Landing Page Clicks', value: n(totals, 'landingPageClicks'), delta: d('landingPageClicks') },
    {
      key: 'costPerVisit',
      label: 'Cost / Visit',
      value: costPerVisit(totals),
      format: 'money',
      delta: delta(costPerVisit(totals), compare ? costPerVisit(compare) : undefined),
      invertDelta: true,
    },
    { key: 'leads', label: 'Leads', value: n(totals, 'oneClickLeads'), delta: d('oneClickLeads'), compareValue: cv('oneClickLeads') },
    { key: 'costPerLead', label: 'Cost / Lead', value: liLeads > 0 ? n(totals, 'oneClickLeadsCost') : null, format: 'money', delta: liLeads > 0 ? d('oneClickLeadsCost') : undefined, invertDelta: true },
    { key: 'leadFormOpens', label: 'Lead Form Opens', value: n(totals, 'oneClickLeadFormOpens'), delta: d('oneClickLeadFormOpens') },
    { key: 'leadFormCompletionRate', label: 'Lead Form Completion Rate', value: +(n(totals, 'leadFormCompletionRate') * 100).toFixed(1), suffix: '%', delta: d('leadFormCompletionRate') },
  ]
}

export async function getLinkedInKpis(
  slug: string,
  dateRange: string,
  compareRange: string | null,
): Promise<Kpi[]> {
  const fields = [
    'spend',
    'impressions',
    'approximateUniqueImpressions',
    'clicks',
    'ctr',
    'cpm',
    'cpc',
    'landingPageClicks',
    'oneClickLeads',
    'oneClickLeadsCost',
    'oneClickLeadFormOpens',
    'leadFormCompletionRate',
  ]

  const compareIso = resolveCompareIso(dateRange, compareRange)

  const [main, cmp] = await Promise.all([
    linkedinQuery(slug, fields, dateRange).then((r) => r[0] ?? {}),
    compareIso ? linkedinQuery(slug, fields, compareIso).then((r) => r[0] ?? {}) : Promise.resolve(null),
  ])

  return transformLinkedInKpis(main, cmp)
}
