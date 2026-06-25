// lib/peec/owned-prompt-coverage.test.ts
// Run: npx tsx --env-file=.env.local lib/peec/owned-prompt-coverage.test.ts
// (env-file only satisfies the DB module-load guard; this test never hits the DB)
//
// Section A "Prompt Coverage" KPI: % of tracked prompts citing an owned domain.
// Extracted so current + prior periods share one definition, enabling the
// period-over-period delta the card was missing.
import { strict as assert } from 'node:assert'
import { ownedPromptCoveragePct, type DomainCoverage } from './url-citations'

const cov: DomainCoverage = {
  promptIdsByDomain: {
    'renaissancebenefits.com':      ['p1', 'p2'],
    'blog.renaissancebenefits.com': ['p2', 'p3'], // p2 overlaps → union {p1,p2,p3}
    'competitor.com':               ['p4', 'p5'], // not owned → ignored
  },
  tagIdsByDomain: {}, tagIdsByUrlKey: {}, promptIdsByUrlKey: {}, tagNameById: {},
}
const owned = ['renaissancebenefits.com', 'blog.renaissancebenefits.com']

// Union of prompt ids across owned domains, deduped: {p1,p2,p3} = 3 of 10 → 30%.
assert.equal(ownedPromptCoveragePct(cov, owned, 10, true), 30)

// A prompt citing two owned domains counts once (30, not 40).
assert.equal(ownedPromptCoveragePct(cov, owned, 10, true), 30, 'dedups across owned domains')

// Host normalization: "www." + mixed case still matches the lowercased key.
assert.equal(
  ownedPromptCoveragePct(cov, ['WWW.RenaissanceBenefits.com'], 10, true),
  20,
  'normalizes www/case → {p1,p2} = 2/10',
)

// No owned domains cited → real 0 (not null) when data is available.
assert.equal(ownedPromptCoveragePct(cov, [], 10, true), 0)

// Unavailable coverage → null (distinguishes "missing" from a real 0).
assert.equal(ownedPromptCoveragePct(cov, owned, 10, false), null)

// No tracked prompts → null (avoid divide-by-zero).
assert.equal(ownedPromptCoveragePct(cov, owned, 0, true), null)

console.log('owned-prompt-coverage.test.ts: all assertions passed')
