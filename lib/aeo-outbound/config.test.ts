import { expect, test } from 'vitest'
import { DECISIONS, SENTENCES_VERSION } from './config'

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

test('2026-10-22: the code-written sentences are version 3, since the findings bullets follow Ryan\'s per-page wording', () => {
  expect(SENTENCES_VERSION).toBe(3)
})
