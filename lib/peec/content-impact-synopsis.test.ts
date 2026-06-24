// lib/peec/content-impact-synopsis.test.ts
import assert from 'node:assert/strict'
import { validateContentImpactSynopsisGrounding, type ContentImpactSynopsisContext } from './content-impact-synopsis'

function baseContext(over: Partial<ContentImpactSynopsisContext> = {}): ContentImpactSynopsisContext {
  return {
    plannedUrlsInScope: 130,
    liveUrls: 117,
    totalSessions: 48210,
    totalAiCitations: 1407,
    aiReferredSessions: 1243,
    ownedUrlsWithAiActivity: 56,
    unmatchedPct: 10,
    ownedDomainsCited: 4,
    topOwnedDomainsByCitations: [
      { domain: 'example.com', citationCount: 412 },
    ],
    topCompetitorDomainsByCitations: [
      { domain: 'competitor.com', citationCount: 240 },
    ],
    topBrandAbsentCompetitorUrls: [
      { url: 'https://outlet.com/post', host: 'outlet.com', citationCount: 18 },
    ],
    brandAbsentCompetitorUrlCount: 5,
    ...over,
  }
}

// FB-033 REGRESSION (FB-031 analog), production-shaped bug.
// Context says 5 competitor URLs where the brand is absent; if Glean writes
// "0 URLs where the brand was absent", the validator MUST flag it. This is
// the exact failure mode FB-031 fixed on PR Influence, ported to Content
// Impact's analog metric.
{
  const result = validateContentImpactSynopsisGrounding(
    'During the period, AI cited many competitor URLs across the editorial set, and there were 0 URLs where the brand was absent during the period.',
    baseContext({ brandAbsentCompetitorUrlCount: 5 }),
  )
  assert.equal(result.ok, false, 'validator must reject prose claiming 0 brand-absent URLs when context = 5')
  assert.ok(
    result.violations.some(v => v.includes('brandAbsentCompetitorUrlCount mismatch')),
    `expected brandAbsentCompetitorUrlCount mismatch violation, got: ${result.violations.join(' | ')}`,
  )
}

console.log('content-impact-synopsis.test.ts: Task 1 regression assertion passed.')

// Rule 1, positive variants (validator must accept matching counts).
{
  const result = validateContentImpactSynopsisGrounding(
    'There are 5 competitor URLs where the brand was absent during the period.',
    baseContext({ brandAbsentCompetitorUrlCount: 5 }),
  )
  assert.equal(result.ok, true, `expected ok=true, got violations: ${result.violations.join(' | ')}`)
}

// Rule 1, "no" / "zero" wording when context = 0 (validator must accept).
{
  const result = validateContentImpactSynopsisGrounding(
    'No competitor URLs where the brand is absent in this window.',
    baseContext({ brandAbsentCompetitorUrlCount: 0 }),
  )
  assert.equal(result.ok, true, `expected ok=true for "no" + context 0, got: ${result.violations.join(' | ')}`)
}

// Rule 1, third-party phrasing variant.
{
  const result = validateContentImpactSynopsisGrounding(
    'AI surfaced 3 third-party URLs where the brand is absent.',
    baseContext({ brandAbsentCompetitorUrlCount: 7 }),
  )
  assert.equal(result.ok, false, 'validator must reject third-party variant with wrong count')
  assert.ok(result.violations[0].includes('brandAbsentCompetitorUrlCount mismatch'))
}

// Rule 2, AI citations match (validator must accept).
{
  const result = validateContentImpactSynopsisGrounding(
    'Brand-owned domains earned 1,407 AI citations in the period.',
    baseContext({ totalAiCitations: 1407 }),
  )
  assert.equal(result.ok, true, `expected ok=true, got: ${result.violations.join(' | ')}`)
}

// Rule 2, AI citations mismatch (validator must reject).
{
  const result = validateContentImpactSynopsisGrounding(
    'Brand-owned domains earned 800 AI citations in the period.',
    baseContext({ totalAiCitations: 1407 }),
  )
  assert.equal(result.ok, false, 'validator must reject citation-count mismatch')
  assert.ok(result.violations.some(v => v.includes('totalAiCitations mismatch')))
}

// Rule 3, owned domains cited match.
{
  const result = validateContentImpactSynopsisGrounding(
    'During the window, 4 owned domains were cited by AI engines.',
    baseContext({ ownedDomainsCited: 4 }),
  )
  assert.equal(result.ok, true, `expected ok=true, got: ${result.violations.join(' | ')}`)
}

// Rule 3, owned domains cited rounded to zero (validator must reject).
{
  const result = validateContentImpactSynopsisGrounding(
    'No owned domains were cited by AI engines during the period.',
    baseContext({ ownedDomainsCited: 3 }),
  )
  assert.equal(result.ok, false, 'validator must reject "no owned domains cited" when context > 0')
  assert.ok(result.violations.some(v => v.includes('ownedDomainsCited mismatch')))
}

// Empty prose, no patterns triggered, ok = true (validator only enforces
// claims that ARE made; absence of a metric is allowed).
{
  const result = validateContentImpactSynopsisGrounding('', baseContext())
  assert.equal(result.ok, true, 'empty prose triggers no rules')
  assert.equal(result.violations.length, 0)
}

// Prose with no matching patterns at all, ok = true.
{
  const result = validateContentImpactSynopsisGrounding(
    'Performance trended upward across owned content. The team should publish more.',
    baseContext(),
  )
  assert.equal(result.ok, true, `expected ok=true, got: ${result.violations.join(' | ')}`)
}

console.log('content-impact-synopsis.test.ts: all Task 2 validator assertions passed.')
