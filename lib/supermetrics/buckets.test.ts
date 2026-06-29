// lib/supermetrics/buckets.test.ts
// Run: npx tsx lib/supermetrics/buckets.test.ts
import { strict as assert } from 'node:assert'
import { normalizeSmBucket } from './buckets'

// day: already ISO → passthrough.
assert.equal(normalizeSmBucket('2026-06-24', 'day'), '2026-06-24')

// day: ISO datetime → date portion only.
assert.equal(normalizeSmBucket('2026-06-24T00:00:00', 'day'), '2026-06-24')

// week: SM "Week 26, 2026" → ISO Monday of that ISO week.
//   ISO week 26 of 2026 starts on Mon 2026-06-22.
assert.equal(normalizeSmBucket('Week 26, 2026', 'week'), '2026-06-22')

// week: SM alternative "2026-W26" → same Monday.
assert.equal(normalizeSmBucket('2026-W26', 'week'), '2026-06-22')

// month: SM "Jan 2026" → 2026-01-01.
assert.equal(normalizeSmBucket('Jan 2026', 'month'), '2026-01-01')
assert.equal(normalizeSmBucket('Dec 2025', 'month'), '2025-12-01')

// month: SM "2026-01" → 2026-01-01.
assert.equal(normalizeSmBucket('2026-01', 'month'), '2026-01-01')

// Unparseable → throws (caller maps to invalid-metric).
assert.throws(() => normalizeSmBucket('garbage', 'week'), /normalizeSmBucket/)
assert.throws(() => normalizeSmBucket('', 'month'),       /normalizeSmBucket/)

console.log('ok')
