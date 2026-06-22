import { metaQuery, resolveCompareIso } from './base'
import type { Kpi } from '@/lib/paid-search/types'

function n(row: Record<string, string>, id: string): number {
  return Number(row[id] || 0)
}

function delta(cur: number, prev: number | undefined): number | undefined {
  if (prev == null || prev === 0) return undefined
  return ((cur - prev) / prev) * 100
}

export function transformMetaKpis(
  totals: Record<string, string>,
  compare: Record<string, string> | null,
): Kpi[] {
  const engRate = (t: Record<string, string>) =>
    n(t, 'impressions') ? (n(t, 'action_post_engagement') / n(t, 'impressions')) * 100 : 0

  const d = (id: string) => delta(n(totals, id), compare ? n(compare, id) : undefined)

  return [
    { key: 'spend', label: 'Spend', value: Math.round(n(totals, 'cost')), prefix: '$', delta: d('cost') },
    { key: 'impressions', label: 'Impressions', value: n(totals, 'impressions'), delta: d('impressions') },
    { key: 'reach', label: 'Reach', value: n(totals, 'reach'), delta: d('reach') },
    {
      key: 'frequency',
      label: 'Frequency',
      value: +n(totals, 'Frequency').toFixed(1),
      suffix: 'x',
    },
    {
      key: 'linkClicks',
      label: 'Link Clicks',
      value: n(totals, 'inline_link_clicks'),
      delta: d('inline_link_clicks'),
    },
    // Meta returns CTR as a 0-1 fraction — scale to percent.
    { key: 'ctr', label: 'CTR', value: +(n(totals, 'CTR') * 100).toFixed(1), suffix: '%', delta: d('CTR') },
    { key: 'cpm', label: 'CPM', value: +n(totals, 'CPM').toFixed(2), prefix: '$', delta: d('CPM') },
    { key: 'cpc', label: 'CPC', value: +n(totals, 'CPC').toFixed(2), prefix: '$', delta: d('CPC') },
    {
      key: 'lpv',
      label: 'Landing Page Views',
      value: n(totals, 'landing_page_views'),
      delta: d('landing_page_views'),
    },
    {
      key: 'costPerLpv',
      label: 'Cost / LPV',
      value: Math.round(n(totals, 'cost_per_landing_page_view')),
      prefix: '$',
    },
    {
      key: 'postEng',
      label: 'Post Engagement',
      value: n(totals, 'action_post_engagement'),
      delta: d('action_post_engagement'),
    },
    {
      key: 'engRate',
      label: 'Engagement Rate',
      value: +engRate(totals).toFixed(1),
      suffix: '%',
      delta: delta(engRate(totals), compare ? engRate(compare) : undefined),
    },
  ]
}

export async function getMetaKpis(
  slug: string,
  dateRange: string,
  compareRange: string | null,
): Promise<Kpi[]> {
  const fields = [
    'cost',
    'impressions',
    'reach',
    'Frequency',
    'inline_link_clicks',
    'CTR',
    'CPM',
    'CPC',
    'landing_page_views',
    'cost_per_landing_page_view',
    'action_post_engagement',
  ]

  const compareIso = resolveCompareIso(dateRange, compareRange)

  const [main, cmp] = await Promise.all([
    metaQuery(slug, fields, dateRange).then((r) => r[0] ?? {}),
    compareIso ? metaQuery(slug, fields, compareIso).then((r) => r[0] ?? {}) : Promise.resolve(null),
  ])

  return transformMetaKpis(main, cmp)
}
