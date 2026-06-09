// lib/aeo/period-change.test.ts
// Run: npx tsx lib/aeo/period-change.test.ts
import { strict as assert } from 'node:assert'
import { buildPeriodChange } from './period-change'

const change = buildPeriodChange({
  brandsCurrent: [
    { name: 'You',  visibility: 40, isYou: true },
    { name: 'CompA', visibility: 30, isYou: false },
    { name: 'CompB', visibility: 22, isYou: false },
  ],
  brandsPrior: [
    { name: 'You',  visibility: 35, isYou: true },  // +5
    { name: 'CompA', visibility: 18, isYou: false }, // +12 (biggest abs mover + biggest competitor gain)
    { name: 'CompB', visibility: 25, isYou: false }, // -3
  ],
  domainsCurrent: [{ domain: 'a.com', share: 20 }, { domain: 'b.com', share: 5 }],
  domainsPrior:   [{ domain: 'a.com', share: 8 },  { domain: 'b.com', share: 9 }], // a +12, b -4
  prompts: [
    { text: 'high', visibility: 50 },
    { text: 'low',  visibility: 4 },   // lowest visibility = opportunity
  ],
})

assert.equal(change.visibilityMover?.label, 'CompA')
assert.equal(change.visibilityMover?.delta, 12)
assert.equal(change.competitorShift?.label, 'CompA')
assert.equal(change.competitorShift?.delta, 12)
assert.equal(change.domainMover?.label, 'a.com')
assert.equal(change.domainMover?.delta, 12)
assert.equal(change.promptOpportunity?.text, 'low')
assert.equal(change.promptOpportunity?.visibility, 4)

// graceful empties
const empty = buildPeriodChange({ brandsCurrent: [], brandsPrior: [], domainsCurrent: [], domainsPrior: [], prompts: [] })
assert.equal(empty.visibilityMover, null)
assert.equal(empty.promptOpportunity, null)

console.log('period-change.test.ts: all assertions passed')
