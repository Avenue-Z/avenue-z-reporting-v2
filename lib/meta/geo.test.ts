// Run: npx tsx --env-file=.env.local lib/meta/geo.test.ts
import { strict as assert } from 'node:assert'
import { transformMetaGeo } from './geo'

const rows = [
  { Region: 'Ohio', cost: '200', inline_link_clicks: '40', landing_page_views: '30', action_post_engagement: '90' },
  { Region: 'Texas', cost: '500', inline_link_clicks: '120', landing_page_views: '80', action_post_engagement: '210' },
]
const out = transformMetaGeo(rows)
assert.equal(out[0].region, 'Texas')   // spend desc
assert.equal(out[0].spend, 500)
console.log('ok')
