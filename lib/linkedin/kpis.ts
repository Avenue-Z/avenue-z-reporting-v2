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

  return [
    { key: 'spend', label: 'Spend', value: Math.round(n(totals, 'spend')), prefix: '$', delta: d('spend') },
    { key: 'impressions', label: 'Impressions', value: n(totals, 'impressions'), delta: d('impressions') },
    { key: 'reach', label: 'Reach', value: n(totals, 'approximateUniqueImpressions'), delta: d('approximateUniqueImpressions') },
    { key: 'clicks', label: 'Clicks', value: n(totals, 'clicks'), delta: d('clicks') },
    // LinkedIn returns ctr / leadFormCompletionRate as 0-1 fractions — scale to percent.
    { key: 'ctr', label: 'CTR', value: +(n(totals, 'ctr') * 100).toFixed(2), suffix: '%', delta: d('ctr') },
    { key: 'cpm', label: 'CPM', value: +n(totals, 'cpm').toFixed(2), prefix: '$', delta: d('cpm') },
    { key: 'cpc', label: 'CPC', value: +n(totals, 'cpc').toFixed(2), prefix: '$', delta: d('cpc') },
    {
      key: 'frequency',
      label: 'Frequency',
      value: +frequency(totals).toFixed(1),
      suffix: 'x',
      delta: delta(frequency(totals), compare ? frequency(compare) : undefined),
    },
    { key: 'landingPageClicks', label: 'Landing Page Clicks', value: n(totals, 'landingPageClicks'), delta: d('landingPageClicks') },
    {
      key: 'costPerVisit',
      label: 'Cost / Visit',
      value: +costPerVisit(totals).toFixed(2),
      prefix: '$',
      delta: delta(costPerVisit(totals), compare ? costPerVisit(compare) : undefined),
    },
    { key: 'leads', label: 'Leads', value: n(totals, 'oneClickLeads'), delta: d('oneClickLeads') },
    { key: 'costPerLead', label: 'Cost / Lead', value: +n(totals, 'oneClickLeadsCost').toFixed(2), prefix: '$', delta: d('oneClickLeadsCost') },
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
  // Reach (approximateUniqueImpressions) only resolves under the ad_analytics_campaign
  // report type. Bundled with the lead fields, Supermetrics resolves to a report type
  // where Reach is unavailable and returns null — so fetch it in its own query and merge.
  const reachFields = ['approximateUniqueImpressions']

  const compareIso = resolveCompareIso(dateRange, compareRange)

  const [main, mainReach, cmp, cmpReach] = await Promise.all([
    linkedinQuery(slug, fields, dateRange).then((r) => r[0] ?? {}),
    linkedinQuery(slug, reachFields, dateRange).then((r) => r[0] ?? {}),
    compareIso ? linkedinQuery(slug, fields, compareIso).then((r) => r[0] ?? {}) : Promise.resolve(null),
    compareIso ? linkedinQuery(slug, reachFields, compareIso).then((r) => r[0] ?? {}) : Promise.resolve(null),
  ])

  return transformLinkedInKpis({ ...main, ...mainReach }, cmp ? { ...cmp, ...cmpReach } : null)
}
