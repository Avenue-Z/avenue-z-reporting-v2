/**
 * Seed the Kind Patches "Paid Media Mix Overview" dashboard programmatically,
 * mapped from the Paid Media Reporting CSV + deck. Run:
 *   npx tsx --env-file=.env.local scripts/seed-kind-patches-dashboard.ts
 *   npx tsx --env-file=.env.local scripts/seed-kind-patches-dashboard.ts clear
 */
import { db } from '@/lib/db/client'
import { clients } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { parseDashboardConfig } from '@/lib/dashboard/persistence'
import type { DashboardConfig, LeafBinding, PersistedBlock } from '@/lib/dashboard/types'

const SLUG = 'kind-patches'
const SHOP = 'gid://shopify/Shop/59952431244' // Supermetrics Shopify account
const GA4 = '373193153' // Supermetrics GA4 account
const CHANNELS = ['facebook-ads', 'google-ads', 'applovin', 'snapchat-ads'] // exclude tiktok per CSV
const channelFilter = [{ column: 'channel', values: CHANNELS }]

// Shopify (Supermetrics SHP) leaf, optionally filtered to one shipping country.
const shp = (metricField: string, country?: string): LeafBinding => ({
  source: 'supermetrics', dsId: 'SHP', account: SHOP, metricField,
  ...(country ? { filters: [{ column: 'order_shipping_country', values: [country] }] } : {}),
})
// Per-country net revenue formula: total_sales − tax.
const netRevenue = (country: string) => ({
  source: 'formula' as const, expr: '@t - @tax',
  operands: { t: { kind: 'metric' as const, leaf: shp('total_sales', country) }, tax: { kind: 'metric' as const, leaf: shp('tax', country) } },
})
const block = (b: PersistedBlock): PersistedBlock => b

const config: DashboardConfig = {
  defaultRange: { dateRange: 'last_30_days', compareRange: 'previous_period' },
  blocks: [
    // ── § Paid Media Mix Overview ──────────────────────────────
    block({ id: 'kp-h-overview', name: 'Paid Media Mix Overview', kind: 'header', headerLevel: 1, format: 'number', range: null, layout: { x: 0, y: 0, w: 12, h: 1 },
      binding: { source: 'supermetrics', dsId: '__static__', metricField: '__static__', account: '__static__' } }),

    block({ id: 'kp-spend', name: 'Total Ad Spend', kind: 'kpi', format: 'currency', range: null, layout: { x: 0, y: 1, w: 3, h: 2 },
      binding: { source: 'triplewhale', metric: 'ad_spend', filters: channelFilter } }),

    block({ id: 'kp-roas', name: 'Blended ROAS', kind: 'kpi', format: 'multiple', range: null, layout: { x: 3, y: 1, w: 3, h: 2 },
      binding: { source: 'formula', expr: '@rev / @spend', operands: { rev: { kind: 'ref', blockId: 'kp-revenue' }, spend: { kind: 'ref', blockId: 'kp-spend' } } } }),

    block({ id: 'kp-revenue', name: 'Total Adj Revenue', kind: 'kpi', format: 'currency', range: null, layout: { x: 6, y: 1, w: 3, h: 2 },
      binding: { source: 'formula', expr: '@us + @uk + @ca + @mx + @au + @row',
        operands: {
          us: { kind: 'ref', blockId: 'kp-rev-us' }, uk: { kind: 'ref', blockId: 'kp-rev-uk' },
          ca: { kind: 'ref', blockId: 'kp-rev-ca' }, mx: { kind: 'ref', blockId: 'kp-rev-mx' },
          au: { kind: 'ref', blockId: 'kp-rev-au' }, row: { kind: 'ref', blockId: 'kp-rev-row' },
        } } }),

    block({ id: 'kp-subs', name: 'New Subscriptions', kind: 'kpi', format: 'count', range: null, layout: { x: 9, y: 1, w: 3, h: 2 },
      binding: { source: 'shopify', query: "FROM sales SHOW orders_first_time WHERE subscription_or_one_time = 'subscription'" } }),

    block({ id: 'kp-cac', name: 'New Subscription CAC', kind: 'kpi', format: 'currency', range: null, layout: { x: 0, y: 3, w: 3, h: 2 },
      binding: { source: 'formula', expr: '@spend / @subs', operands: { spend: { kind: 'ref', blockId: 'kp-spend' }, subs: { kind: 'ref', blockId: 'kp-subs' } } } }),

    block({ id: 'kp-orders', name: 'Orders', kind: 'kpi', format: 'count', range: null, layout: { x: 3, y: 3, w: 3, h: 2 },
      binding: shp('sm_order_count') }),

    block({ id: 'kp-sessions', name: 'Sessions', kind: 'kpi', format: 'count', range: null, layout: { x: 6, y: 3, w: 3, h: 2 },
      binding: { source: 'supermetrics', dsId: 'GAWA', account: GA4, metricField: 'sessions' } }),

    // ── § Spend by Channel (near top) ──────────────────────────
    block({ id: 'kp-h-channel-spend', name: 'Spend by Channel', kind: 'header', headerLevel: 2, format: 'number', range: null, layout: { x: 0, y: 5, w: 12, h: 1 },
      binding: { source: 'supermetrics', dsId: '__static__', metricField: '__static__', account: '__static__' } }),

    block({ id: 'kp-spend-by-channel', name: 'Spend by Channel', kind: 'bar', format: 'currency', range: null, layout: { x: 0, y: 6, w: 6, h: 4 },
      binding: { source: 'triplewhale', metric: 'ad_spend', dimensions: ['channel'], filters: channelFilter } }),

    // ── § Revenue by Shipping Country ──────────────────────────
    block({ id: 'kp-h-revenue', name: 'Revenue by Shipping Country', kind: 'header', headerLevel: 2, format: 'number', range: null, layout: { x: 0, y: 10, w: 12, h: 1 },
      binding: { source: 'supermetrics', dsId: '__static__', metricField: '__static__', account: '__static__' } }),

    block({ id: 'kp-rev-us', name: 'US Revenue', kind: 'kpi', format: 'currency', range: null, layout: { x: 0, y: 11, w: 3, h: 2 }, binding: netRevenue('United States') }),
    block({ id: 'kp-rev-uk', name: 'UK Revenue', kind: 'kpi', format: 'currency', range: null, layout: { x: 3, y: 11, w: 3, h: 2 }, binding: netRevenue('United Kingdom') }),
    block({ id: 'kp-rev-ca', name: 'Canada Revenue', kind: 'kpi', format: 'currency', range: null, layout: { x: 6, y: 11, w: 3, h: 2 }, binding: netRevenue('Canada') }),
    block({ id: 'kp-rev-mx', name: 'Mexico Revenue', kind: 'kpi', format: 'currency', range: null, layout: { x: 9, y: 11, w: 3, h: 2 }, binding: netRevenue('Mexico') }),
    block({ id: 'kp-rev-au', name: 'Australia Revenue', kind: 'kpi', format: 'currency', range: null, layout: { x: 0, y: 13, w: 3, h: 2 }, binding: shp('total_sales', 'Australia') }),
    block({ id: 'kp-rev-row', name: 'Rest of World', kind: 'kpi', format: 'currency', range: null, layout: { x: 3, y: 13, w: 3, h: 2 },
      binding: { source: 'formula', expr: '0.8 * (@site - @us - @uk - @ca - @mx - @au)',
        operands: {
          site: { kind: 'metric', leaf: shp('total_sales') },
          us: { kind: 'metric', leaf: shp('total_sales', 'United States') },
          uk: { kind: 'metric', leaf: shp('total_sales', 'United Kingdom') },
          ca: { kind: 'metric', leaf: shp('total_sales', 'Canada') },
          mx: { kind: 'metric', leaf: shp('total_sales', 'Mexico') },
          au: { kind: 'metric', leaf: shp('total_sales', 'Australia') },
        } } }),

    // ── § Channel Performance (bottom) ─────────────────────────
    block({ id: 'kp-h-channel-perf', name: 'Channel Performance', kind: 'header', headerLevel: 2, format: 'number', range: null, layout: { x: 0, y: 15, w: 12, h: 1 },
      binding: { source: 'supermetrics', dsId: '__static__', metricField: '__static__', account: '__static__' } }),

    block({ id: 'kp-channel-roas', name: 'Channel ROAS (Pixel)', kind: 'table', format: 'multiple', range: null, layout: { x: 0, y: 16, w: 6, h: 5 },
      binding: { source: 'triplewhale', metric: 'blended_roas', dimensions: ['channel'], filters: channelFilter } }),
  ],
}

async function main() {
  if (process.argv[2] === 'clear') {
    await db.update(clients).set({ dashboardConfig: null, updatedAt: new Date() }).where(eq(clients.slug, SLUG))
    console.log(`cleared dashboardConfig for ${SLUG}`)
    return
  }
  const parsed = parseDashboardConfig(config)
  if (!parsed.ok) { console.error('INVALID CONFIG:', parsed.error); process.exit(1) }
  await db.update(clients).set({ dashboardConfig: parsed.config, updatedAt: new Date() }).where(eq(clients.slug, SLUG))
  console.log(`seeded dashboardConfig for ${SLUG}: ${parsed.config.blocks.length} blocks`)
}
main().catch((e) => { console.error(e); process.exit(1) })
