import { expect, test } from 'vitest'
import { DECISIONS, PILLARS, PILLARS_TITLE, SENTENCES_VERSION } from './config'

test("Ryan's answers of 2026-10-12 are the defaults (spec v1.1 §16.1)", () => {
  expect(DECISIONS.sectionTitles).toEqual(['Category data', 'Competitive visibility'])
  expect(DECISIONS.rankAmong).toBeNull()
  expect(DECISIONS.writeSpecificCategory).toBe(true)
  expect(DECISIONS.competitorSiteGaps).toBe(true)
  expect(DECISIONS.peecOpportunityRows).toBe(1)
  expect(DECISIONS.methodologyStatesPromptsAndModels).toBe(true)
  expect(DECISIONS.fixedNextStep).toBe('A comprehensive AEO audit can validate these patterns across prompt demand, citations, source influence, owned content, earned media, and technical readiness.')
  expect(DECISIONS.needsValidationBlocksApprove).toBe(true)
  expect(DECISIONS.pitchOnly).toBe(true)
  expect(DECISIONS.showAivxName).toBe(false)
})

test("2026-10-19 Peec parity: the source mix weights by usage_rate, the field Peec's Domain types chart sums", () => {
  expect(DECISIONS.sourceMixWeight).toBe('usage_rate')
})

test('2026-10-22: the code-written sentences are version 3, since the pillar lines say "citations", Ryan\'s word', () => {
  expect(SENTENCES_VERSION).toBe(3)
})

test('the three pillars (Ryan, round 3): the slide names in its order, descriptions and title in the slide\'s own casing', () => {
  expect(PILLARS.map((p) => p.name)).toEqual(['Earned & Affiliate Media', 'Content and Creative', 'Technical Optimizations'])
  expect(PILLARS.map((p) => p.description)).toEqual([
    'Quality Citations from Trusted Media Publications are a key factor in determining the credibility and authority of information.',
    'Publish high quality content that mimics natural language, rather than keyword stuffed blogs, to better influence how LLMs answer the questions buyers ask.',
    'Technical data structuring ensures your brand authority is optimized for AI crawlability and visibility across LLMs.',
  ])
  expect(PILLARS_TITLE).toBe('The Pillars of AI Search')
  for (const p of PILLARS) expect(`${p.name} ${p.description}`).not.toMatch(/[0-9\u2013\u2014]/)
  expect(SENTENCES_VERSION).toBe(3)
})
