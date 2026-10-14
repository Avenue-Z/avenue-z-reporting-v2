import { expect, test } from 'vitest'
import { DECISIONS } from './config'

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
