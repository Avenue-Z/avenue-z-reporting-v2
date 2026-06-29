// Run: npx tsx components/dashboard/add-block/multi-select-combobox.test.ts
import { strict as assert } from 'node:assert'
import { toggleValue } from './multi-select-combobox'

assert.deepEqual(toggleValue([], 'a'), ['a'])              // add to empty
assert.deepEqual(toggleValue(['a'], 'b'), ['a', 'b'])      // add new
assert.deepEqual(toggleValue(['a', 'b'], 'a'), ['b'])      // remove existing
assert.deepEqual(toggleValue(['a'], 'a'), [])              // remove last
console.log('ok')
