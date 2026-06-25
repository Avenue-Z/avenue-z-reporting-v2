// Run: npx tsx lib/dashboard/adapters/shopify.test.ts
import { strict as assert } from 'node:assert'
import { groupRowsFromShopify, seriesPointsFromShopify } from './shopify'

const grouped = { columns: [{ name: 'sales_channel' }, { name: 'net_sales' }], rows: [
  { sales_channel: 'Online Store', net_sales: '100.5' },
  { sales_channel: 'TikTok', net_sales: '40' },
] }
assert.deepEqual(groupRowsFromShopify(grouped), [
  { dim: 'Online Store', value: 100.5 },
  { dim: 'TikTok', value: 40 },
])
assert.deepEqual(groupRowsFromShopify({ columns: [{ name: 'x' }, { name: 'v' }], rows: [{ x: 'A', v: 'n/a' }] }), [{ dim: 'A', value: 0 }])

const series = { columns: [{ name: 'day' }, { name: 'net_sales' }], rows: [
  { day: '2026-05-31 00:00:00', net_sales: '171768.789' },
  { day: '2026-05-29', net_sales: '162640.677' },
] }
assert.deepEqual(seriesPointsFromShopify(series), [
  { bucket: '2026-05-29', value: 162640.677 },
  { bucket: '2026-05-31', value: 171768.789 },
])
console.log('ok')
