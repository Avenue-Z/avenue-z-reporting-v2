import type { DashboardConfig, PersistedBlock } from './types'

// Static header sentinel binding (matches scripts/seed-kind-patches-dashboard.ts):
// header/narrative blocks carry a binding that must never reach a real resolver.
const STATIC = { source: 'supermetrics', dsId: '__static__', metricField: '__static__', account: '__static__' } as const

/**
 * Client-agnostic TripleWhale-only starter dashboard. The TripleWhale adapter
 * resolves the shop ID per request from the client's `triplewhaleShopId`, so the
 * same template renders for every client. Metrics are the ones verified to return
 * real data in the TW audit (ad_spend, blended_roas, revenue, purchases, cpa,
 * conv_rate, sessions, clicks).
 */
export function buildStarterTemplate(): DashboardConfig {
  const blocks: PersistedBlock[] = [
    { id: 'st-h-overview', name: 'Paid Media Overview', kind: 'header', headerLevel: 1, format: 'number', range: null, layout: { x: 0, y: 0, w: 12, h: 1 }, binding: { ...STATIC } },

    { id: 'st-spend',    name: 'Total Ad Spend',   kind: 'kpi', format: 'currency', range: null, layout: { x: 0, y: 1, w: 3, h: 2 }, binding: { source: 'triplewhale', metric: 'ad_spend' } },
    { id: 'st-roas',     name: 'Blended ROAS',     kind: 'kpi', format: 'multiple', range: null, layout: { x: 3, y: 1, w: 3, h: 2 }, binding: { source: 'triplewhale', metric: 'blended_roas' } },
    { id: 'st-revenue',  name: 'Revenue',          kind: 'kpi', format: 'currency', range: null, layout: { x: 6, y: 1, w: 3, h: 2 }, binding: { source: 'triplewhale', metric: 'revenue' } },
    { id: 'st-purch',    name: 'Purchases',        kind: 'kpi', format: 'count',    range: null, layout: { x: 9, y: 1, w: 3, h: 2 }, binding: { source: 'triplewhale', metric: 'purchases' } },
    { id: 'st-cpa',      name: 'CPA',              kind: 'kpi', format: 'currency', range: null, layout: { x: 0, y: 3, w: 3, h: 2 }, binding: { source: 'triplewhale', metric: 'cpa' } },
    { id: 'st-convrate', name: 'Conversion Rate',  kind: 'kpi', format: 'percent',  range: null, layout: { x: 3, y: 3, w: 3, h: 2 }, binding: { source: 'triplewhale', metric: 'conv_rate' } },
    { id: 'st-sessions', name: 'Sessions',         kind: 'kpi', format: 'count',    range: null, layout: { x: 6, y: 3, w: 3, h: 2 }, binding: { source: 'triplewhale', metric: 'sessions' } },
    { id: 'st-clicks',   name: 'Clicks',           kind: 'kpi', format: 'count',    range: null, layout: { x: 9, y: 3, w: 3, h: 2 }, binding: { source: 'triplewhale', metric: 'clicks' } },

    { id: 'st-h-channel', name: 'Spend by Channel', kind: 'header', headerLevel: 2, format: 'number', range: null, layout: { x: 0, y: 5, w: 12, h: 1 }, binding: { ...STATIC } },
    { id: 'st-spend-by-channel', name: 'Spend by Channel', kind: 'bar', format: 'currency', range: null, layout: { x: 0, y: 6, w: 6, h: 4 }, binding: { source: 'triplewhale', metric: 'ad_spend', dimensions: ['channel'] } },

    { id: 'st-h-perf', name: 'Channel Performance', kind: 'header', headerLevel: 2, format: 'number', range: null, layout: { x: 0, y: 10, w: 12, h: 1 }, binding: { ...STATIC } },
    { id: 'st-channel-roas', name: 'Channel ROAS', kind: 'table', format: 'multiple', range: null, layout: { x: 0, y: 11, w: 6, h: 5 }, binding: { source: 'triplewhale', metric: 'blended_roas', dimensions: ['channel'] } },
  ]
  return { defaultRange: { dateRange: 'last_30_days', compareRange: 'previous_period' }, blocks }
}
