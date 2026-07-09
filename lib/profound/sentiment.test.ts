import { describe, it, expect } from 'vitest'
import {
  metricIndex,
  positiveShare,
  normalizeThemes,
  selectedProfoundModels,
  sumModelRows,
  collapseModelThemeRows,
  buildThemeSources,
  newThemeSourceState,
  accumulateThemeSources,
  finalizeThemeSources,
} from './sentiment-normalize'
import { shouldStopAnswerPaging } from './sentiment'

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
    expect(negativeThemes).toEqual([{ title: 'Premium Pricing', count: 81, urls: [] }])
    expect(positiveThemes).toEqual([{ title: 'Thought Leadership', count: 24, urls: [] }])
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
    expect(positiveThemes).toEqual([{ title: 'Mostly Positive', count: 9, urls: [] }])
    expect(negativeThemes).toEqual([{ title: 'Mostly Negative', count: 9, urls: [] }])
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
    expect(positiveThemes).toEqual([{ title: 'Real', count: 5, urls: [] }])
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
    expect(positiveThemes).toEqual([{ title: 'Thought Leadership', count: 15, urls: [] }])
    expect(negativeThemes).toEqual([{ title: 'Premium Pricing', count: 8, urls: [] }])
  })
  it('single model: counts reflect only that model (the Tina flag)', () => {
    const { positiveThemes, negativeThemes } = normalizeThemes(
      collapseModelThemeRows(resp, new Set(['ChatGPT'])),
    )
    // ChatGPT-only Thought Leadership is 10, not 15
    expect(positiveThemes).toEqual([{ title: 'Thought Leadership', count: 10, urls: [] }])
    expect(negativeThemes).toEqual([{ title: 'Premium Pricing', count: 8, urls: [] }])
  })

  it('missing info.query.metrics (#138 P4): themes are not dropped as 0/0 ties', () => {
    // Profound response with no query.metrics at all. Rows still carry real
    // positive/negative values in the default fallback order
    // (negative, occurrences, positive). Before the P4 fix, collapseModelThemeRows
    // defaulted metricNames for building `data` but returned the original
    // (still-empty) info, so readMetric/normalizeThemes could not resolve any
    // metric by name and every theme summed to 0/0 and was dropped as a tie.
    const noMetricsResp = {
      info: {},
      data: [
        mtRow('ChatGPT', 'Thought Leadership', 0, 10),
        mtRow('Perplexity', 'Thought Leadership', 0, 5),
        mtRow('ChatGPT', 'Premium Pricing', 8, 0),
      ],
    }
    const collapsed = collapseModelThemeRows(noMetricsResp, null)
    // the fallback must be rebuilt into info.query.metrics, not left absent
    expect(collapsed.info.query?.metrics).toEqual(['negative', 'occurrences', 'positive'])
    const { positiveThemes, negativeThemes } = normalizeThemes(collapsed)
    expect(positiveThemes).toEqual([{ title: 'Thought Leadership', count: 15, urls: [] }])
    expect(negativeThemes).toEqual([{ title: 'Premium Pricing', count: 8, urls: [] }])
  })
})

describe('shouldStopAnswerPaging (#138 P3)', () => {
  it('does NOT stop on a short-but-nonempty page (Profound page cap below requested limit)', () => {
    // Profound can cap page size below ANSWERS_PAGE; a short page still means
    // more rows may follow, so paging must continue.
    expect(shouldStopAnswerPaging(new Array(1))).toBe(false)
    expect(shouldStopAnswerPaging(new Array(4999))).toBe(false)
  })

  it('stops only on a zero-row page', () => {
    expect(shouldStopAnswerPaging([])).toBe(true)
  })
})

describe('buildThemeSources + normalizeThemes (accordion sources)', () => {
  const answers = {
    data: [
      { model: 'ChatGPT', themes: ['Thought Leadership', 'Premium Pricing'], citations: ['https://a.com', 'https://b.com'] },
      { model: 'Perplexity', themes: ['Thought Leadership'], citations: ['https://c.com', 'https://a.com'] },
      { model: 'ChatGPT', themes: ['Premium Pricing'], citations: ['https://d.com'] },
    ],
  }

  it('attributes an answer\'s citations to each of its themes, ranked by frequency', () => {
    const map = buildThemeSources(answers, null)
    // Thought Leadership: a cited by answers 1 + 2 (count 2), b + c once each.
    // Ranked most-cited first, ties by first-seen => a, b, c.
    expect(map.get('thought leadership')).toEqual(['https://a.com', 'https://b.com', 'https://c.com'])
    // Premium Pricing: a, b, d each cited once (tie) => first-seen order a, b, d.
    expect(map.get('premium pricing')).toEqual(['https://a.com', 'https://b.com', 'https://d.com'])
  })

  it('filters sources by the selected model', () => {
    const map = buildThemeSources(answers, new Set(['ChatGPT']))
    // Perplexity answer excluded; Thought Leadership only from answer 1 => a,b
    expect(map.get('thought leadership')).toEqual(['https://a.com', 'https://b.com'])
  })

  it('normalizes a raw answers-endpoint model id before the filter check (#138 P1)', () => {
    // The /v1/prompts/answers payload can tag an answer with a raw model id
    // (e.g. 'openai') instead of the Profound display name ('ChatGPT') that
    // `selected` is built from. Without normalization this raw id never
    // matches a display name, so every source is wrongly dropped under a
    // model filter.
    const rawAnswers = {
      data: [
        { model: 'openai', themes: ['T'], citations: ['https://raw-id-source.com'] },
      ],
    }
    const map = buildThemeSources(rawAnswers, new Set(['ChatGPT']))
    expect(map.get('t')).toEqual(['https://raw-id-source.com'])
  })

  it('still excludes an answer whose normalized model is not in the selection', () => {
    const rawAnswers = {
      data: [
        { model: 'gemini', themes: ['T'], citations: ['https://excluded-source.com'] },
      ],
    }
    const map = buildThemeSources(rawAnswers, new Set(['ChatGPT']))
    expect(map.get('t')).toBeUndefined()
  })

  it('ranks by citation frequency, NOT first-seen order', () => {
    // x is seen first (answer 1) but cited once; y is seen second but cited
    // twice. Frequency must win: y before x.
    const freqAnswers = {
      data: [
        { model: 'ChatGPT', themes: ['T'], citations: ['https://x.com'] },
        { model: 'ChatGPT', themes: ['T'], citations: ['https://y.com'] },
        { model: 'ChatGPT', themes: ['T'], citations: ['https://y.com'] },
      ],
    }
    expect(buildThemeSources(freqAnswers, null).get('t')).toEqual(['https://y.com', 'https://x.com'])
  })

  it('breaks frequency ties by first-seen order (deterministic)', () => {
    // All cited once; order must be the order first encountered, every time.
    const tie = {
      data: [
        { model: 'ChatGPT', themes: ['T'], citations: ['https://p.com'] },
        { model: 'ChatGPT', themes: ['T'], citations: ['https://q.com'] },
        { model: 'ChatGPT', themes: ['T'], citations: ['https://r.com'] },
      ],
    }
    expect(buildThemeSources(tie, null).get('t')).toEqual(['https://p.com', 'https://q.com', 'https://r.com'])
  })

  it('counts a URL at most once per answer (per-answer dedupe)', () => {
    // x listed twice in ONE answer must count as 1, not 2. y is cited by two
    // separate answers (count 2), so y must outrank x.
    const dupeInAnswer = {
      data: [
        { model: 'ChatGPT', themes: ['T'], citations: ['https://x.com', 'https://x.com'] },
        { model: 'ChatGPT', themes: ['T'], citations: ['https://y.com'] },
        { model: 'ChatGPT', themes: ['T'], citations: ['https://y.com'] },
      ],
    }
    expect(buildThemeSources(dupeInAnswer, null).get('t')).toEqual(['https://y.com', 'https://x.com'])
  })

  it('dedupes case-variant theme labels within one answer (#138 P5)', () => {
    // One answer tagged with the same theme in two casings must attribute its
    // citation to that folded key ONCE, not once per casing variant.
    const state = newThemeSourceState()
    accumulateThemeSources(
      state,
      { data: [{ model: 'ChatGPT', themes: ['Pricing', 'pricing'], citations: ['x.com'] }] },
      null,
    )
    expect(state.counts.get('pricing')?.get('x.com')).toBe(1)
  })

  it('caps URLs per theme after ranking', () => {
    const many = { data: [{ model: 'ChatGPT', themes: ['T'], citations: ['u1', 'u2', 'u3', 'u4'] }] }
    // all count 1 (one answer), tie -> first-seen, cap 2 => u1, u2
    expect(buildThemeSources(many, null, 2).get('t')).toEqual(['u1', 'u2'])
  })

  it('ranks by frequency across page boundaries (paginated fetch)', () => {
    // simulates the paginated fetch: two pages folded, then finalized.
    const state = newThemeSourceState()
    accumulateThemeSources(state, { data: [{ model: 'ChatGPT', themes: ['T'], citations: ['a', 'b'] }] }, null)
    accumulateThemeSources(state, { data: [{ model: 'ChatGPT', themes: ['T'], citations: ['b', 'c', 'd'] }] }, null)
    // counts across pages: b=2, a=1, c=1, d=1. Ranked (ties first-seen), cap 3 => b, a, c
    expect(finalizeThemeSources(state, 3).get('t')).toEqual(['b', 'a', 'c'])
  })

  it('attaches sources onto the normalized themes by title', () => {
    const sources = buildThemeSources(answers, null)
    const { positiveThemes, negativeThemes } = normalizeThemes(
      { info: INFO, data: [row('Thought Leadership', 0, 20), row('Premium Pricing', 12, 0)] },
      8,
      sources,
    )
    expect(positiveThemes[0]).toEqual({
      title: 'Thought Leadership',
      count: 20,
      urls: ['https://a.com', 'https://b.com', 'https://c.com'],
    })
    expect(negativeThemes[0].urls).toEqual(['https://a.com', 'https://b.com', 'https://d.com'])
  })
})
