// lib/ga4/content-derive.test.ts
// Run: npx tsx lib/ga4/content-derive.test.ts
import { strict as assert } from 'node:assert'
import { classifyTrajectory, tallyTrajectories, type Trajectory } from './content-derive'

const c = (cur: number, prior: number, cited: boolean): Trajectory =>
  classifyTrajectory({ cur, prior, cited })

// No Activity: no traffic either period, not cited
assert.equal(c(0, 0, false), 'No Activity')

// High AI / Low Traffic: cited but at/below the low-traffic floor — checked
// before growth so a cited 0→5 page is "low traffic", not "compounding".
assert.equal(c(5, 0, true), 'High AI / Low Traffic')
assert.equal(c(10, 8, true), 'High AI / Low Traffic')
assert.equal(c(0, 0, true), 'High AI / Low Traffic') // cited with zero traffic

// High Traffic / No AI: lots of traffic, not cited
assert.equal(c(100, 90, false), 'High Traffic / No AI')
assert.equal(c(500, 600, false), 'High Traffic / No AI') // even while declining

// Compounding: growing >10% and cited (above low-traffic floor)
assert.equal(c(50, 30, true), 'Compounding URLs')

// Decaying: declining >10%, not cited, below the high-traffic ceiling
assert.equal(c(50, 80, false), 'Decaying URLs')

// Stable: roughly flat
assert.equal(c(50, 48, true), 'Stable URLs')
assert.equal(c(50, 52, false), 'Stable URLs')
// Cited + declining is not "Decaying" (decay requires not-cited) → Stable
assert.equal(c(50, 80, true), 'Stable URLs')

// tally
const counts = tallyTrajectories([
  { cur: 0, prior: 0, cited: false }, // No Activity
  { cur: 50, prior: 30, cited: true }, // Compounding
  { cur: 50, prior: 80, cited: false }, // Decaying
  { cur: 5, prior: 0, cited: true }, // High AI / Low Traffic
])
assert.equal(counts['No Activity'], 1)
assert.equal(counts['Compounding URLs'], 1)
assert.equal(counts['Decaying URLs'], 1)
assert.equal(counts['High AI / Low Traffic'], 1)
assert.equal(counts['Stable URLs'], 0)

console.log('content-derive.test.ts: all assertions passed')
