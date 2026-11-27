import { describe, it, expect } from 'vitest'
import type { PromptV2, TopicAnswers, TopicCell, TopicsPromptsV2 } from '@/lib/aeo/v2/types'
import { promptChange, promptPerformanceRows, topicMatrix, visPct, type PromptPerfRow } from './topics'

const c = (topic: string, brand: string, model: TopicCell['model'], mentions: number, answers: number): TopicCell => ({
  topic, brand, model, mentions, answers,
})
const t = (topic: string, model: TopicAnswers['model'], answers: number): TopicAnswers => ({ topic, model, answers })

const data: TopicsPromptsV2 = {
  you: 'Renaissance',
  cells: [
    c('A', 'Renaissance', 'ChatGPT', 2, 10),
    c('A', 'Renaissance', 'Gemini', 4, 10),
    c('A', 'Guardian', 'ChatGPT', 5, 10),
    c('A', 'Guardian', 'Gemini', 1, 10),
    c('B', 'Renaissance', 'ChatGPT', 1, 4),
    c('B', 'Renaissance', 'Gemini', 3, 4),
    c('B', 'Other', 'ChatGPT', 0, 4),
    c('B', 'Other', 'Gemini', 0, 4),
  ],
  cellsPrior: [
    c('A', 'Renaissance', 'ChatGPT', 1, 10),
    c('A', 'Renaissance', 'Gemini', 1, 10),
    c('A', 'Guardian', 'ChatGPT', 1, 10),
  ],
  topicAnswers: [t('A', 'ChatGPT', 10), t('A', 'Gemini', 10), t('B', 'ChatGPT', 4), t('B', 'Gemini', 4), t('Z', 'ChatGPT', 0)],
  topicAnswersPrior: [t('A', 'ChatGPT', 10), t('A', 'Gemini', 10)],
  prompts: [],
}
const at = (m: ReturnType<typeof topicMatrix>, topic: string, brand: string) => m.byBrand.get(topic)?.get(brand)

describe('visPct', () => {
  it('is null without answers', () => {
    expect(visPct(undefined)).toBeNull()
    expect(visPct({ mentions: 0, answers: 0 })).toBeNull()
    expect(visPct({ mentions: 1, answers: 4 })).toBe(25)
  })
})

describe('topicMatrix', () => {
  it('sums all models when null, dividing by the topic total answers', () => {
    const m = topicMatrix(data, null)
    expect(at(m, 'A', 'Renaissance')?.value).toBe(30)
    expect(at(m, 'A', 'Renaissance')?.delta).toBe(20)
    expect(at(m, 'A', 'Guardian')?.value).toBe(30)
    // Prior: 1 mention out of the topic's 20 prior answers, not out of Guardian's own 10.
    expect(at(m, 'A', 'Guardian')?.delta).toBe(25)
    expect(at(m, 'B', 'Renaissance')?.value).toBe(50)
    expect(at(m, 'B', 'Renaissance')?.delta).toBeNull()
    expect(at(m, 'B', 'Other')?.value).toBe(0)
  })
  it('divides a brand mentioned on one model by every selected model answer on the topic (the review probe)', () => {
    const probe: TopicsPromptsV2 = {
      you: 'You', cells: [c('T', 'Solo', 'ChatGPT', 50, 100)], cellsPrior: [],
      topicAnswers: [t('T', 'ChatGPT', 100), t('T', 'Gemini', 100)], topicAnswersPrior: [], prompts: [],
    }
    expect(at(topicMatrix(probe, null), 'T', 'Solo')?.value).toBe(25)
    expect(at(topicMatrix(probe, ['ChatGPT']), 'T', 'Solo')?.value).toBe(50)
  })
  it('gives 0 to a brand with no cell in a topic that has answers', () => {
    expect(at(topicMatrix(data, null), 'B', 'Guardian')?.value).toBe(0)
  })
  it('a prior cell missing on a topic with prior answers is 0, so the delta is real', () => {
    const m = topicMatrix(data, null)
    // Guardian had no prior Gemini cell but the topic had 20 prior answers: prior = 1/20 = 5%, delta 30 - 5.
    expect(at(m, 'A', 'Guardian')?.delta).toBe(25)
    const only = topicMatrix({ ...data, cellsPrior: [] }, null)
    expect(at(only, 'A', 'Renaissance')?.delta).toBe(30)
  })
  it('keeps a topic where the client has no cell as a row with client 0', () => {
    const d: TopicsPromptsV2 = { ...data, cells: [...data.cells, c('C', 'Guardian', 'ChatGPT', 3, 6)], topicAnswers: [...data.topicAnswers, t('C', 'ChatGPT', 6)] }
    const m = topicMatrix(d, null)
    expect(m.topics).toEqual(['B', 'A', 'C'])
    expect(at(m, 'C', 'Renaissance')?.value).toBe(0)
    expect(m.byModel.get('C')?.ChatGPT?.value).toBe(0)
  })
  it('always has a client column, even with no client cells', () => {
    const m = topicMatrix({ ...data, cells: data.cells.filter((x) => x.brand !== 'Renaissance') }, null)
    expect(at(m, 'A', 'Renaissance')?.value).toBe(0)
  })
  it('drops topics with zero answers and sorts by client value desc, then name', () => {
    const m = topicMatrix(data, null)
    expect(m.topics).toEqual(['B', 'A'])
    expect(m.byBrand.get('Z')).toBeUndefined()
    const tie: TopicsPromptsV2 = { ...data, cells: [], cellsPrior: [], topicAnswers: [t('b', 'ChatGPT', 1), t('a', 'ChatGPT', 1)] }
    expect(topicMatrix(tie, null).topics).toEqual(['a', 'b'])
  })
  it('recomputes from the selected models only', () => {
    const m = topicMatrix(data, ['Gemini'])
    expect(at(m, 'A', 'Renaissance')?.value).toBe(40)
    expect(at(m, 'A', 'Renaissance')?.delta).toBe(30)
    expect(m.modelsPresent).toEqual(['Gemini'])
    expect(m.byModel.get('A')?.Gemini?.value).toBe(40)
    expect(m.byModel.get('A')?.ChatGPT).toBeUndefined()
  })
  it('lists models present in AEO_MODELS order, with per-model cells for the client', () => {
    const m = topicMatrix(data, null)
    expect(m.modelsPresent).toEqual(['ChatGPT', 'Gemini'])
    expect(m.byModel.get('A')?.ChatGPT).toEqual({ value: 20, delta: 10 })
  })
  it('Platforms: 0 when the topic x model has answers and the client no cell; null when it has no answers', () => {
    const d: TopicsPromptsV2 = {
      ...data,
      cells: [c('A', 'Renaissance', 'ChatGPT', 2, 10), c('B', 'Guardian', 'Gemini', 1, 4)],
      topicAnswers: [t('A', 'ChatGPT', 10), t('B', 'Gemini', 4)],
    }
    const m = topicMatrix(d, null)
    expect(m.byModel.get('B')?.Gemini).toEqual({ value: 0, delta: null })
    expect(m.byModel.get('A')?.Gemini).toEqual({ value: null, delta: null })
    // The prior ChatGPT figure for A is 1/10.
    expect(m.byModel.get('A')?.ChatGPT).toEqual({ value: 20, delta: 10 })
  })
  it('has no topics when there is no client', () => {
    expect(topicMatrix({ ...data, you: null }, null).topics).toEqual([])
  })
  it('takes the client from the caller when given', () => {
    const m = topicMatrix(data, null, 'Guardian')
    expect(m.topics).toEqual(['A', 'B'])
  })
  it('aggregates a topic named __proto__ and a brand named constructor', () => {
    const d: TopicsPromptsV2 = {
      you: 'constructor',
      cells: [c('__proto__', 'constructor', 'ChatGPT', 3, 4), c('__proto__', 'hasOwnProperty', 'ChatGPT', 1, 4)],
      cellsPrior: [c('__proto__', 'constructor', 'ChatGPT', 1, 4)],
      topicAnswers: [t('__proto__', 'ChatGPT', 4)],
      topicAnswersPrior: [t('__proto__', 'ChatGPT', 4)],
      prompts: [],
    }
    const m = topicMatrix(d, null)
    expect(m.topics).toEqual(['__proto__'])
    expect(at(m, '__proto__', 'constructor')).toEqual({ value: 75, delta: 50 })
    expect(at(m, '__proto__', 'hasOwnProperty')?.value).toBe(25)
    expect(m.byModel.get('__proto__')?.ChatGPT).toEqual({ value: 75, delta: 50 })
  })
})

const stat = (mentions: number, answers: number, posSum: number, posCount: number) => ({ mentions, answers, posSum, posCount })
const prompt = (over: Partial<PromptV2>): PromptV2 => ({ id: 'p', text: 't', topic: 'A', current: {}, prior: null, ...over })

describe('promptPerformanceRows', () => {
  it('ranks by posSum / posCount across models', () => {
    const [r] = promptPerformanceRows(
      [prompt({ current: { ChatGPT: stat(2, 2, 2, 2), Gemini: stat(6, 6, 18, 6) } })],
      null,
    )
    expect(r.rank).toBe(2.5)
    expect(r.visibility).toBe(100)
  })
  it('never mentioned gives rank null, visibility 0', () => {
    const [r] = promptPerformanceRows([prompt({ current: { ChatGPT: stat(0, 5, 0, 0) } })], null)
    expect(r.rank).toBeNull()
    expect(r.visibility).toBe(0)
  })
  it('drops prompts with no answers on the selected models', () => {
    const p = prompt({ current: { ChatGPT: stat(1, 1, 1, 1) } })
    expect(promptPerformanceRows([p], ['Gemini'])).toEqual([])
  })
  it('prior null is New', () => {
    const [r] = promptPerformanceRows([prompt({ current: { ChatGPT: stat(1, 1, 1, 1) } })], null)
    expect(r.isNew).toBe(true)
    expect(r.rankDelta).toBeNull()
    expect(r.visibilityPrior).toBeNull()
  })
  it('computes rank and visibility deltas against the prior', () => {
    const [r] = promptPerformanceRows(
      [prompt({
        current: { ChatGPT: stat(2, 2, 5, 2) },
        prior: { ChatGPT: stat(1, 4, 3, 1) },
      })],
      null,
    )
    expect(r.rank).toBe(2.5)
    expect(r.priorRank).toBe(3)
    expect(r.rankDelta).toBe(0.5)
    expect(r.isNew).toBe(false)
    expect(r.visibilityPrior).toBe(25)
    expect(r.visibilityDelta).toBe(75)
  })
  it('prior {} is not New and not ranked', () => {
    const [r] = promptPerformanceRows([prompt({ current: { ChatGPT: stat(1, 1, 1, 1) }, prior: {} })], null)
    expect(r.isNew).toBe(false)
    expect(r.priorRank).toBeNull()
    expect(r.rankDelta).toBeNull()
  })
})

describe('promptChange', () => {
  const row = (rankDelta: number | null) => ({ rankDelta }) as PromptPerfRow
  it('classifies', () => {
    expect(promptChange(row(0.5))).toBe('gained')
    expect(promptChange(row(-0.5))).toBe('lost')
    expect(promptChange(row(0.4))).toBe('same')
    expect(promptChange(row(null))).toBeNull()
  })
})
