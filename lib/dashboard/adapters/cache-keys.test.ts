// Run: npx tsx lib/dashboard/adapters/cache-keys.test.ts
import { strict as assert } from 'node:assert'
import { smDataKey } from './supermetrics'
import { twDataKey, buildTwGroupedKey, buildTwSeriesKey } from './triplewhale'

// SM key: stable, ordered, raw apiKey never present
{
  const k = smDataKey('SECRET_KEY', 'AW', '123', 'cost', '2026-05-01,2026-05-30', '')
  assert.deepEqual(k.slice(0, 6), ['sm-data', 'AW', '123', 'cost', '2026-05-01,2026-05-30', ''])
  assert.equal(k.length, 7)            // + keyHash
  assert.ok(!k.includes('SECRET_KEY')) // raw key never in the key
  // different filter / range produce different keys
  assert.notDeepEqual(smDataKey('SECRET_KEY', 'AW', '123', 'cost', '2026-05-01,2026-05-30', 'channel == x'), k)
}

// TW key: stable, ordered, raw apiKey never present
{
  const k = twDataKey('SECRET_KEY', 'shop1', 'SELECT 1 AS value', '2026-05-01,2026-05-30')
  assert.deepEqual(k.slice(0, 4), ['tw-data', 'shop1', 'SELECT 1 AS value', '2026-05-01,2026-05-30'])
  assert.equal(k.length, 5)            // + keyHash
  assert.ok(!k.includes('SECRET_KEY'))
}

// TW grouped/series keys: must be scoped per-shop (no cross-client cache collision)
// and never embed the raw apiKey.
{
  const b = { source: 'triplewhale' as const, metric: 'ad_spend', dimensions: ['channel'] }
  const a = buildTwGroupedKey(b, 'channel', '2026-05-01,2026-05-30', 'shopA', 'SECRET_KEY')
  const z = buildTwGroupedKey(b, 'channel', '2026-05-01,2026-05-30', 'shopZ', 'SECRET_KEY')
  assert.notDeepEqual(a, z)               // different shops → different keys (no collision)
  assert.ok(a.includes('shopA') && !a.includes('SECRET_KEY'))

  const s1 = buildTwSeriesKey(b, 'day', '2026-05-01,2026-05-30', 'shopA', 'SECRET_KEY')
  const s2 = buildTwSeriesKey(b, 'day', '2026-05-01,2026-05-30', 'shopZ', 'SECRET_KEY')
  assert.notDeepEqual(s1, s2)
  assert.ok(s1.includes('shopA') && !s1.includes('SECRET_KEY'))
}
console.log('ok')
