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
