import { describe, it, expect } from 'vitest'
import { metricIndex, positiveShare, normalizeThemes } from './sentiment-normalize'

// Profound echoes the resolved metric order in info.query.metrics; rows align
// to it. These fixtures use the real observed order (alphabetical).
const INFO = { query: { metrics: ['negative', 'occurrences', 'positive'] } }
// row metric order therefore = [negative, occurrences, positive]
const row = (title: string, negative: number, positive: number) => ({
  metrics: [negative, negative + positive, positive],
  dimensions: [title],
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
