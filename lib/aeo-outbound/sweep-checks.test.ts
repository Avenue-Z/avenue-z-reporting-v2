import { expect, test } from 'vitest'
import { LIVE_SHAPE_PULL } from './__fixtures__/sentences-live-shape'
import { buildSnapshotData } from './metrics'
import { checkReport, wordingProblems } from './sweep-checks'
import type { PeecPull } from './pull'

const AT = '2026-10-22T13:00:00Z'
const DECISIONS = { rankAmong: null, competitorSiteGaps: true, sourceMixWeight: 'usage_rate' } as const
const USED = { peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, fixedNextStep: null }
const data = (p: PeecPull = LIVE_SHAPE_PULL) => buildSnapshotData(p, AT, DECISIONS, USED)

test('the live-shape fixture passes every check', () => {
  expect(checkReport(data())).toEqual([])
})

// Each pattern the any-client sweep of 2026-10-22 found on a real project, plus the tokens a broken template prints.
test('wording problems a prospect would read are named', () => {
  expect(wordingProblems(['emsculpt.me at 1 retrievals.'], [])).toEqual(['plural after 1: "1 retrievals"'])
  expect(wordingProblems(['two brands compared and 1 prompts tracked.'], [])).toEqual(['plural after 1: "1 prompts"'])
  expect(wordingProblems(['Moonfare sits within a 8.7-point visibility range.'], [])).toEqual(['"a" before a vowel sound: "a 8.7-point"'])
  expect(wordingProblems(['alongside Banded and Lost Hat Co..'], [])).toEqual(['double period: "Co.."'])
  expect(wordingProblems([" Stablecoin Development 's own site."], [])).toEqual(['stray space'])
  expect(wordingProblems(['Own  appears in 0.3% of tracked answers.'], [])).toEqual(['stray space'])
  expect(wordingProblems(['Own appears in undefined of answers.'], [])).toEqual(['broken value: "undefined"'])
  expect(wordingProblems(['Own.com appears in approximately 1.4K citations.'], [])).toEqual(['broken value: "approximately"'])
  expect(wordingProblems([`Strong ${String.fromCharCode(0x2014)} for now.`], [])).toEqual(['long dash'])
})

test('clean sentences, an ellipsis and a dash inside a brand name are not problems', () => {
  expect(wordingProblems([
    'PocketGuard sits within a 7.8-point visibility range alongside Quicken and You Need A Budget.',
    'Moonfare sits within an 8.7-point visibility range alongside CAIS and Fundrise.',
    'The largest gaps include emsculpt.me at 1 retrieval.',
    'Crocs.com appears in 1,421 retrieved citations.',
    'Wait for it...',
  ], [])).toEqual([])
  const dash = String.fromCharCode(0x2013)
  expect(wordingProblems([`Alpha${dash}Beta leads.`], [`Alpha${dash}Beta`])).toEqual([])
})

test('a padded Peec name reaching the sentences is caught end to end', () => {
  const padded = { ...LIVE_SHAPE_PULL.ownBrand, name: ' Example Senior Living ' }
  const pull: PeecPull = {
    ...LIVE_SHAPE_PULL,
    ownBrand: padded,
    roster: LIVE_SHAPE_PULL.roster.map((r) => (r.id === padded.id ? padded : r)),
    brands: LIVE_SHAPE_PULL.brands.map((r) => (r.brand.id === padded.id ? { ...r, brand: { ...r.brand, name: padded.name } } : r)),
  }
  expect(checkReport(data(pull)).some((p) => p.startsWith('stray space'))).toBe(true)
})
