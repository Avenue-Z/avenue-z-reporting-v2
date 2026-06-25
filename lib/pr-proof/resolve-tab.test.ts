// lib/pr-proof/resolve-tab.test.ts
// Run: npx tsx --env-file=.env.local lib/pr-proof/resolve-tab.test.ts
// (env-file only satisfies the DB module-load guard; this test never hits the DB)
//
// Hardens pr-proof against the content-calendar incident: read the data tab by
// NAME (default "Master Library", overridable via prProofColumnMap.tab) instead
// of by position, so a newly-inserted tab at index 0 can't hide the data.
import { strict as assert } from 'node:assert'
import { resolveTabName } from './client'

// Named tab present → selected regardless of position.
assert.equal(resolveTabName(['Master Library']), 'Master Library')
assert.equal(
  resolveTabName(['Intro / Notes', 'Master Library']),
  'Master Library',
  'picks the named tab even when it is not first',
)

// No "Master Library" and no override → fall back to the first tab (current behavior).
assert.equal(
  resolveTabName(['Placements', 'Archive']),
  'Placements',
  'falls back to first tab when the default name is absent',
)

// Explicit per-client override wins.
assert.equal(resolveTabName(['A', 'B'], 'B'), 'B', 'override selects the named tab')
assert.equal(
  resolveTabName(['Sheet1', 'Master Library'], 'Sheet1'),
  'Sheet1',
  'override beats the default name',
)

// Override that does not exist, default also absent → first tab (no crash).
assert.equal(
  resolveTabName(['A', 'B'], 'Nonexistent'),
  'A',
  'unknown override falls back to first tab',
)

console.log('resolve-tab.test.ts: all assertions passed')
