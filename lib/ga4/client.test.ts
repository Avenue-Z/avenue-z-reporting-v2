// lib/ga4/client.test.ts
// Run: DATABASE_URL=postgres://test:test@localhost/test npx tsx lib/ga4/client.test.ts
// (the dummy DATABASE_URL is only to satisfy the top-level db import in
//  ./client.ts; this test exercises only pure date-math helpers.)
//
// Regression test seeded by the FB-035 hotfix (2026-06-24): content-impact.tsx
// was calling parseDateRange(compareRange) directly, which silently produced the
// default last-30-days window for the magic strings 'previous_period' and
// 'previous_year'. The downstream effect was every comparison-period delta
// computing to 0. These assertions pin both the canary (parseDateRange does
// NOT handle compare-mode strings) and the correct helper (deriveCompareRange).
import { strict as assert } from 'node:assert'
import { parseDateRange, deriveCompareRange } from './client'

// ---------------------------------------------------------------------------
// Canary: parseDateRange does NOT understand compare-mode strings. Both
// 'previous_period' and 'previous_year' fall through to the default last-30
// branch, which is identical to any unrecognized input. If this assertion
// ever fails, parseDateRange grew compare-mode awareness and content-impact
// can simplify; until then, deriveCompareRange is mandatory.
// ---------------------------------------------------------------------------
const defaultBucket    = parseDateRange('some_unrecognized_string_xyz')
const prevPeriodBucket = parseDateRange('previous_period')
const prevYearBucket   = parseDateRange('previous_year')
assert.deepEqual(prevPeriodBucket, defaultBucket, 'parseDateRange("previous_period") must equal the unrecognized-input fallthrough')
assert.deepEqual(prevYearBucket,   defaultBucket, 'parseDateRange("previous_year") must equal the unrecognized-input fallthrough')

// ---------------------------------------------------------------------------
// deriveCompareRange(null) returns null. No comparison requested.
// ---------------------------------------------------------------------------
assert.equal(deriveCompareRange('last_30_days', null),      null)
assert.equal(deriveCompareRange('last_30_days', undefined), null)
assert.equal(deriveCompareRange('last_30_days', ''),        null)

// ---------------------------------------------------------------------------
// deriveCompareRange('last_30_days', 'previous_period') shifts the window
// back by its own width. End date is the day BEFORE main start; start date
// keeps the window length identical.
// ---------------------------------------------------------------------------
const mainLast30  = parseDateRange('last_30_days')
const priorPeriod = deriveCompareRange('last_30_days', 'previous_period')
assert.ok(priorPeriod !== null, 'previous_period must produce a window')
const expectedPriorEnd = new Date(mainLast30.startDate)
expectedPriorEnd.setDate(expectedPriorEnd.getDate() - 1)
const expectedPriorEndIso = expectedPriorEnd.toISOString().slice(0, 10)
assert.equal(priorPeriod!.endDate, expectedPriorEndIso, 'previous_period end is the day before main start')
const priorStart = new Date(priorPeriod!.startDate)
const priorEnd   = new Date(priorPeriod!.endDate)
const priorWidth = Math.round((priorEnd.getTime() - priorStart.getTime()) / 86_400_000) + 1
const mainStart  = new Date(mainLast30.startDate)
const mainEnd    = new Date(mainLast30.endDate)
const mainWidth  = Math.round((mainEnd.getTime() - mainStart.getTime()) / 86_400_000) + 1
assert.equal(priorWidth, mainWidth, 'previous_period width equals main width')

// ---------------------------------------------------------------------------
// deriveCompareRange('last_30_days', 'previous_year') shifts both endpoints
// back by exactly one calendar year.
// ---------------------------------------------------------------------------
const priorYear = deriveCompareRange('last_30_days', 'previous_year')
assert.ok(priorYear !== null, 'previous_year must produce a window')
const expectedPyStart = new Date(mainLast30.startDate)
expectedPyStart.setFullYear(expectedPyStart.getFullYear() - 1)
const expectedPyEnd   = new Date(mainLast30.endDate)
expectedPyEnd.setFullYear(expectedPyEnd.getFullYear() - 1)
assert.equal(priorYear!.startDate, expectedPyStart.toISOString().slice(0, 10))
assert.equal(priorYear!.endDate,   expectedPyEnd.toISOString().slice(0, 10))

// ---------------------------------------------------------------------------
// custom: passthrough. deriveCompareRange hands the string back to
// parseDateRange when it starts with 'custom:', which DOES understand it.
// ---------------------------------------------------------------------------
const priorCustom = deriveCompareRange('last_30_days', 'custom:2025-01-01,2025-01-15')
assert.deepEqual(priorCustom, { startDate: '2025-01-01', endDate: '2025-01-15' })

// ---------------------------------------------------------------------------
// Unknown compare mode (anything not null, not 'previous_period', not
// 'previous_year', not 'custom:...') returns null. content-impact.tsx and
// every other consumer will then correctly hide deltas rather than show
// fake zeros.
// ---------------------------------------------------------------------------
assert.equal(deriveCompareRange('last_30_days', 'unrecognized_mode'), null)
assert.equal(deriveCompareRange('last_30_days', 'last_7_days'),       null)

console.log('client.test.ts: all assertions passed')
