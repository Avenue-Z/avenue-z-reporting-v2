import { describe, it, expect } from 'vitest'
import {
  metricIndex,
  positiveShare,
  normalizeThemes,
  selectedProfoundModels,
  sumModelRows,
  collapseModelThemeRows,
} from './sentiment-normalize'

// Profound echoes the resolved metric order in info.query.metrics; rows align
// to it. These fixtures use the real observed order (alphabetical).
const INFO = { query: { metrics: ['negative', 'occurrences', 'positive'] } }
// row metric order therefore = [negative, occurrences, positive]
const row = (title: string, negative: number, positive: number) => ({
  metrics: [negative, negative + positive, positive],
  dimensions: [title],
})
const modelRow = (model: string, negative: number, positive: number) => ({
  metrics: [negative, negative + positive, positive],
  dimensions: [model],
})
const mtRow = (model: string, theme: string, negative: number, positive: number) => ({
  metrics: [negative, negative + positive, positive],
  dimensions: [model, theme],
})

describe('metricIndex', () => {
  it('resolves each metric by name regardless of position', () => {
    expect(metricIndex(INFO, 'negative')).toBe(0)
    expect(metricIndex(INFO, 'occurrences')).toBe(1)
    expect(metricIndex(INFO, 'positive')).toBe(2)
  })
  it('returns -1 for an absent metric', () => {
    expect(metricIndex(INFO, 'sentiment')).toBe(-1)
    expect(metricIndex({}, 'positive')).toBe(-1)
  })
})

describe('positiveShare', () => {
  it('computes the positive share of classified sentiment', () => {
    // real Avenue Z aggregate: positive 5157, negative 2937 -> 63.7%
    expect(positiveShare(5157, 2937)).toBeCloseTo(63.7, 1)
    expect(positiveShare(10, 0)).toBe(100)
    expect(positiveShare(0, 10)).toBe(0)
  })
  it('returns null (not 0) when nothing is classified', () => {
    expect(positiveShare(0, 0)).toBeNull()
  })
})

describe('normalizeThemes', () => {
  it('folds case-variant duplicate labels and sums their counts', () => {
    const resp = {
      info: INFO,
      data: [
        row('Premium Pricing', 64, 0),
        row('PREMIUM PRICING', 17, 0), // same theme, different casing
        row('Thought Leadership', 0, 24),
      ],
    }
    const { positiveThemes, negativeThemes } = normalizeThemes(resp)
    // the two "premium pricing" rows fold into one negative theme, count 64+17=81,
    // displayed with the casing of the higher-occurrence variant ("Premium Pricing")
    expect(negativeThemes).toEqual([{ title: 'Premium Pricing', count: 81 }])
    expect(positiveThemes).toEqual([{ title: 'Thought Leadership', count: 24 }])
  })

  it('classifies by dominant polarity and drops exact ties as ambiguous', () => {
    const resp = {
      info: INFO,
      data: [
        row('Mostly Positive', 2, 9),
        row('Mostly Negative', 9, 2),
        row('Ambiguous', 5, 5), // tie -> dropped
      ],
    }
    const { positiveThemes, negativeThemes } = normalizeThemes(resp)
    expect(positiveThemes).toEqual([{ title: 'Mostly Positive', count: 9 }])
    expect(negativeThemes).toEqual([{ title: 'Mostly Negative', count: 9 }])
  })

  it('sorts each polarity by count desc and caps to topN', () => {
    const resp = {
      info: INFO,
      data: [
        row('Pos A', 0, 5),
        row('Pos B', 0, 30),
        row('Pos C', 0, 12),
      ],
    }
    const { positiveThemes } = normalizeThemes(resp, 2)
    expect(positiveThemes.map((t) => t.title)).toEqual(['Pos B', 'Pos C'])
  })

  it('ignores blank theme labels', () => {
    const resp = { info: INFO, data: [row('', 5, 0), row('Real', 0, 5)] }
    const { positiveThemes, negativeThemes } = normalizeThemes(resp)
    expect(negativeThemes).toEqual([])
    expect(positiveThemes).toEqual([{ title: 'Real', count: 5 }])
  })
})

describe('selectedProfoundModels', () => {
  it('returns null (all models) for no filter', () => {
    expect(selectedProfoundModels(null)).toBeNull()
    expect(selectedProfoundModels([])).toBeNull()
  })
  it('maps AEO models to Profound model names', () => {
    expect(selectedProfoundModels(['ChatGPT'])).toEqual(new Set(['ChatGPT']))
    expect(selectedProfoundModels(['Gemini', 'Google'])).toEqual(
      new Set(['Google Gemini', 'Google AI Overviews']),
    )
  })
  it('yields an EMPTY set (not all) when only untracked models are selected', () => {
    // Profound has no Claude/Copilot sentiment for this account; selecting them
    // must NOT silently widen back to all models.
    expect(selectedProfoundModels(['Claude', 'Copilot'])).toEqual(new Set())
  })
})

describe('sumModelRows', () => {
  const resp = {
    info: INFO,
    data: [modelRow('ChatGPT', 10, 30), modelRow('Perplexity', 5, 5), modelRow('Google Gemini', 2, 8)],
  }
  it('sums all models when selection is null', () => {
    expect(sumModelRows(resp, null)).toEqual({ positive: 43, negative: 17 })
  })
  it('sums only the selected models', () => {
    expect(sumModelRows(resp, new Set(['ChatGPT']))).toEqual({ positive: 30, negative: 10 })
    expect(sumModelRows(resp, new Set(['ChatGPT', 'Google Gemini']))).toEqual({
      positive: 38,
      negative: 12,
    })
  })
  it('returns zeroes for an empty selection (untracked-only models)', () => {
    expect(sumModelRows(resp, new Set())).toEqual({ positive: 0, negative: 0 })
  })
})

describe('collapseModelThemeRows + normalizeThemes (model reactivity)', () => {
  const resp = {
    info: INFO,
    data: [
      mtRow('ChatGPT', 'Thought Leadership', 0, 10),
      mtRow('Perplexity', 'Thought Leadership', 0, 5),
      mtRow('ChatGPT', 'Premium Pricing', 8, 0),
    ],
  }
  it('all models: sums a theme across every model', () => {
    const { positiveThemes, negativeThemes } = normalizeThemes(collapseModelThemeRows(resp, null))
    expect(positiveThemes).toEqual([{ title: 'Thought Leadership', count: 15 }])
    expect(negativeThemes).toEqual([{ title: 'Premium Pricing', count: 8 }])
  })
  it('single model: counts reflect only that model (the Tina flag)', () => {
    const { positiveThemes, negativeThemes } = normalizeThemes(
      collapseModelThemeRows(resp, new Set(['ChatGPT'])),
    )
    // ChatGPT-only Thought Leadership is 10, not 15
    expect(positiveThemes).toEqual([{ title: 'Thought Leadership', count: 10 }])
    expect(negativeThemes).toEqual([{ title: 'Premium Pricing', count: 8 }])
  })
})
