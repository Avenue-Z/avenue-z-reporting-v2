// lib/ga4/content-derive.test.ts
// Run: npx tsx lib/ga4/content-derive.test.ts
import { strict as assert } from 'node:assert'
import {
  classifyTrajectory,
  tallyTrajectories,
  median,
  daysBetween,
  computeUrlTiming,
  type Trajectory,
} from './content-derive'

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

// ── median ──
assert.equal(median([]), null)
assert.equal(median([5]), 5)
assert.equal(median([3, 1, 2]), 2) // sorts first
assert.equal(median([1, 2, 3, 4]), 2.5) // even → mean of middle two

// ── daysBetween ──
assert.equal(daysBetween('2026-01-01', '2026-01-01'), 0)
assert.equal(daysBetween('2026-01-01', '2026-01-15'), 14)
assert.equal(daysBetween('2026-01-15', '2026-01-01'), -14)
assert.equal(daysBetween('2026-02-28', '2026-03-01'), 1) // 2026 not a leap year

// ── computeUrlTiming ──
const t1 = computeUrlTiming({
  publishDate: '2026-01-01',
  days: [
    { date: '2026-01-01', sessions: 0, aiSessions: 0 },
    { date: '2026-01-05', sessions: 3, aiSessions: 0 }, // first traffic = +4d
    { date: '2026-01-09', sessions: 7, aiSessions: 2 }, // first AI = +8d
  ],
})
assert.equal(t1.daysToFirstTraffic, 4)
assert.equal(t1.daysToFirstAi, 8)

// no AI ever → null AI, traffic still measured
const t2 = computeUrlTiming({
  publishDate: '2026-01-01',
  days: [{ date: '2026-01-02', sessions: 5, aiSessions: 0 }],
})
assert.equal(t2.daysToFirstTraffic, 1)
assert.equal(t2.daysToFirstAi, null)

// days before publish are ignored; same-day event clamps to 0
const t3 = computeUrlTiming({
  publishDate: '2026-01-10',
  days: [
    { date: '2026-01-05', sessions: 99, aiSessions: 99 }, // pre-publish, ignored
    { date: '2026-01-10', sessions: 1, aiSessions: 1 }, // publish day → 0
  ],
})
assert.equal(t3.daysToFirstTraffic, 0)
assert.equal(t3.daysToFirstAi, 0)

console.log('content-derive.test.ts: all assertions passed')
