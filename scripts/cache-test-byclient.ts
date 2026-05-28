/**
 * Verifies the byClient extractor returns the expected shape.
 * Run with: npx tsx scripts/cache-test-byclient.ts
 */
import { strict as assert } from 'node:assert'
import { byClient } from '../lib/perf'

const tags1 = byClient(['avenue-z'])
assert.deepEqual(tags1, { client: 'avenue-z' })

// Tolerates trailing args
const tags2 = byClient(['renaissance', { dateRange: 'last_30_days' }, 42])
assert.deepEqual(tags2, { client: 'renaissance' })

console.log('cache-test-byclient: passed')
