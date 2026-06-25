// Run: npx tsx lib/organic-social/synopsis-context.test.ts
import { strict as assert } from 'node:assert'
import { buildSocialContext } from './synopsis'
import type { PlatformHeadline } from './types'

const headlines: PlatformHeadline[] = [{
  channel: 'INSTAGRAM', label: 'Instagram', exposureLabel: 'Views',
  followers: 12400, netNewFollowers: 320, exposure: 88000, engagements: 5400,
  engagementRate: 4.2, deltas: { followers: 2.6 },
}]
const ctx = buildSocialContext({
  headlines,
  trend: { points: [], channels: ['Instagram'] },
  top: [{ platform: 'Instagram', rows: [] }],
  dateRange: 'last_30_days',
})

assert.ok(ctx.includes('Instagram'), 'names the channel')
assert.ok(ctx.includes('12,400') || ctx.includes('12400'), 'includes follower count')
assert.ok(ctx.includes('last_30_days'), 'includes the period')
console.log('synopsis-context: all assertions passed')
