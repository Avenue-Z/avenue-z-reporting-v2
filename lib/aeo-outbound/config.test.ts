import { expect, test } from 'vitest'
import { DECISIONS, PAGE_WORDS_V1, SENTENCES_VERSION } from './config'

test("Ryan's answers of 2026-10-12 are the defaults (spec v1.1 §16.1)", () => {
  expect(DECISIONS.sectionTitles).toEqual(['Cited Sources', 'Competitive Visibility'])
  expect([PAGE_WORDS_V1.section_1_title, PAGE_WORDS_V1.section_2_title]).toEqual(['Category data', 'Competitive visibility'])
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

test('2026-10-20 amendment: the code-written sentences are version 2, since the source-mix rounding changed', () => {
  expect(SENTENCES_VERSION).toBe(2)
})
