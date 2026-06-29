// Run: npx tsx components/dashboard/optimistic-blocks.test.ts
import { strict as assert } from 'node:assert'
import { optimisticBlocksReducer } from './optimistic-blocks'
import type { PersistedBlock } from '@/lib/dashboard/types'

const mk = (id: string): PersistedBlock => ({
  id, name: id, format: 'number', range: null, kind: 'kpi',
  binding: { source: 'triplewhale', metric: 'ad_spend' },
})
const a = mk('a'), b = mk('b')

// add appends
assert.deepEqual(optimisticBlocksReducer([a], { type: 'add', block: b }).map((x) => x.id), ['a', 'b'])
// remove filters by id, leaves others
assert.deepEqual(optimisticBlocksReducer([a, b], { type: 'remove', id: 'a' }).map((x) => x.id), ['b'])
// remove of an absent id is a no-op
assert.deepEqual(optimisticBlocksReducer([a, b], { type: 'remove', id: 'zzz' }).map((x) => x.id), ['a', 'b'])
// does not mutate the input array
{
  const input = [a]
  optimisticBlocksReducer(input, { type: 'add', block: b })
  assert.equal(input.length, 1, 'input not mutated')
}
console.log('ok')
