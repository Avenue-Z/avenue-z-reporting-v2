// lib/peec/pr-influence-synopsis.test.ts
// Run: npx tsx lib/peec/pr-influence-synopsis.test.ts
// FB-031: unit tests for the grounding validator. Locks the contract so any
// regression in pattern matching is caught immediately. The bug this fix
// addresses (synopsis prose claiming "0 editorial domains where brand
// absent" while the context said brandAbsentCount = 5) is the FIRST test
// below — keep it green forever.
import { strict as assert } from 'node:assert'
import { validateSynopsisGrounding } from './pr-influence-synopsis'
import type { PRInfluenceSynopsisContext } from './pr-influence-synopsis'

function makeContext(over: Partial<PRInfluenceSynopsisContext> = {}): PRInfluenceSynopsisContext {
  return {
    aiVisibility: 42.3,
    aiVisibilityDelta: 6.1,
    avgAiPosition: 2.4,
    avgAiPositionDelta: 0,
    totalAiCitations: 3247,
    totalPlacements: 12,
    placementsCitedByAI: 7,
    aiReferralSessions: 1724,
    aiReferralSessionsDelta: 43,
    totalEditorialDomains: 8,
    brandAbsentCount: 5,
    topBrandAbsentDomains: [],
    topOpportunityClusters: [],
    ...over,
  }
}

// --- THE REGRESSION TEST: the exact bug observed in production ---
{
  const ctx = makeContext({ brandAbsentCount: 5 })
  const prose = 'AI cited 8 editorial domains, and there were 0 editorial domains where the brand was absent during the period.'
  const v = validateSynopsisGrounding(prose, ctx)
  assert.equal(v.ok, false, 'must flag prose claiming 0 when context.brandAbsentCount = 5')
  assert.ok(v.violations.some(s => s.includes('brandAbsentCount')), 'violation must mention brandAbsentCount')
}

// --- brand-absent count: variants ---

// "no editorial domains where brand absent" with brandAbsentCount > 0 → violation
{
  const ctx = makeContext({ brandAbsentCount: 3 })
  const prose = 'There were no editorial domains where the brand is absent.'
  const v = validateSynopsisGrounding(prose, ctx)
  assert.equal(v.ok, false)
}

// "zero editorial hosts where brand was absent" with brandAbsentCount > 0 → violation
{
  const ctx = makeContext({ brandAbsentCount: 4 })
  const prose = 'During the period, zero editorial hosts where the brand was absent appeared.'
  const v = validateSynopsisGrounding(prose, ctx)
  assert.equal(v.ok, false)
}

// "5 editorial domains where brand is absent" with brandAbsentCount = 5 → OK
{
  const ctx = makeContext({ brandAbsentCount: 5 })
  const prose = 'There are 5 editorial domains where the brand is absent.'
  const v = validateSynopsisGrounding(prose, ctx)
  assert.equal(v.ok, true)
  assert.deepEqual(v.violations, [])
}

// brandAbsentCount = 0 + prose says "0 editorial domains where brand absent" → OK
{
  const ctx = makeContext({ brandAbsentCount: 0 })
  const prose = '0 editorial domains where the brand was absent in the period.'
  const v = validateSynopsisGrounding(prose, ctx)
  assert.equal(v.ok, true)
}

// brandAbsentCount = 0 + prose says "8 editorial domains where brand absent" → violation (the inverse failure mode)
{
  const ctx = makeContext({ brandAbsentCount: 0 })
  const prose = 'There are 8 editorial domains where the brand is absent.'
  const v = validateSynopsisGrounding(prose, ctx)
  assert.equal(v.ok, false)
}

// --- total editorial domains cited ---

// prose claims "AI cited 4 editorial domains" but context.totalEditorialDomains = 8 → violation
{
  const ctx = makeContext({ totalEditorialDomains: 8 })
  const prose = 'AI cited 4 editorial domains during the period.'
  const v = validateSynopsisGrounding(prose, ctx)
  assert.equal(v.ok, false)
  assert.ok(v.violations.some(s => s.includes('totalEditorialDomains')))
}

// prose claims "AI cited 8 editorial domains" matching context → OK
{
  const ctx = makeContext({ totalEditorialDomains: 8 })
  const prose = 'In total, AI cited 8 editorial domains.'
  const v = validateSynopsisGrounding(prose, ctx)
  assert.equal(v.ok, true)
}

// --- placement counts "N of M" ---

// prose says "7 of 12 placements" matching context → OK
{
  const ctx = makeContext({ placementsCitedByAI: 7, totalPlacements: 12 })
  const prose = '7 of 12 placements were cited by AI.'
  const v = validateSynopsisGrounding(prose, ctx)
  assert.equal(v.ok, true)
}

// prose says "3 of 12 placements" but context = 7 of 12 → violation
{
  const ctx = makeContext({ placementsCitedByAI: 7, totalPlacements: 12 })
  const prose = 'Only 3 of 12 placements were cited by AI engines this period.'
  const v = validateSynopsisGrounding(prose, ctx)
  assert.equal(v.ok, false)
  assert.ok(v.violations.some(s => s.includes('placement count')))
}

// prose says "7 of 10 placements" with context = 7 of 12 → violation (wrong total)
{
  const ctx = makeContext({ placementsCitedByAI: 7, totalPlacements: 12 })
  const prose = '7 of 10 placements landed AI citations.'
  const v = validateSynopsisGrounding(prose, ctx)
  assert.equal(v.ok, false)
}

// --- empty prose ---
{
  const ctx = makeContext({ brandAbsentCount: 5 })
  const v = validateSynopsisGrounding('', ctx)
  assert.equal(v.ok, true, 'empty prose makes no numeric claims; no violations')
}

// --- prose with no matching patterns ---
{
  const ctx = makeContext({ brandAbsentCount: 5 })
  const prose = 'The brand is showing strong momentum across editorial coverage and AI citations this period.'
  const v = validateSynopsisGrounding(prose, ctx)
  assert.equal(v.ok, true, 'no patterns matched; no violations')
}

console.log('lib/peec/pr-influence-synopsis.test.ts: all assertions passed')
