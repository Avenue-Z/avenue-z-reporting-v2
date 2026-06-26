// Run: npx tsx lib/dashboard/adapters/cache-keys.test.ts
import { strict as assert } from 'node:assert'
import { smDataKey } from './supermetrics'
import { twDataKey } from './triplewhale'

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
console.log('ok')
