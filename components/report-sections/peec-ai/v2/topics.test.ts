import { describe, it, expect } from 'vitest'
import type { PromptV2, TopicCell, TopicsPromptsV2 } from '@/lib/aeo/v2/types'
import { promptChange, promptPerformanceRows, topicMatrix, visPct, type PromptPerfRow } from './topics'

const c = (topic: string, brand: string, model: TopicCell['model'], mentions: number, answers: number): TopicCell => ({
  topic, brand, model, mentions, answers,
})

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
    c('Z', 'Renaissance', 'ChatGPT', 0, 0),
  ],
  cellsPrior: [
    c('A', 'Renaissance', 'ChatGPT', 1, 10),
    c('A', 'Renaissance', 'Gemini', 1, 10),
    c('A', 'Guardian', 'ChatGPT', 1, 10),
  ],
  prompts: [],
}

describe('visPct', () => {
  it('is null without answers', () => {
    expect(visPct(undefined)).toBeNull()
    expect(visPct({ mentions: 0, answers: 0 })).toBeNull()
    expect(visPct({ mentions: 1, answers: 4 })).toBe(25)
  })
})

describe('topicMatrix', () => {
  it('sums all models when null', () => {
    const m = topicMatrix(data, null)
    expect(m.byBrand.A.Renaissance.value).toBe(30)
    expect(m.byBrand.A.Renaissance.delta).toBe(20)
    expect(m.byBrand.A.Guardian.value).toBe(30)
    expect(m.byBrand.B.Renaissance.value).toBe(50)
    expect(m.byBrand.B.Renaissance.delta).toBeNull()
    expect(m.byBrand.B.Other.value).toBe(0)
  })
  it('gives 0 to a brand with no cell in a topic that has answers', () => {
    expect(topicMatrix(data, null).byBrand.B.Guardian.value).toBe(0)
  })
  it('drops topics with zero answers and sorts by client value desc', () => {
    const m = topicMatrix(data, null)
    expect(m.topics).toEqual(['B', 'A'])
    expect(m.byBrand.Z).toBeUndefined()
  })
  it('recomputes from the selected models only', () => {
    const m = topicMatrix(data, ['Gemini'])
    expect(m.byBrand.A.Renaissance.value).toBe(40)
    expect(m.byBrand.A.Renaissance.delta).toBe(30)
    expect(m.modelsPresent).toEqual(['Gemini'])
    expect(m.byModel.A.Gemini?.value).toBe(40)
    expect(m.byModel.A.ChatGPT).toBeUndefined()
  })
  it('lists models present in AEO_MODELS order, with per-model cells for the client', () => {
    const m = topicMatrix(data, null)
    expect(m.modelsPresent).toEqual(['ChatGPT', 'Gemini'])
    expect(m.byModel.A.ChatGPT).toEqual({ value: 20, delta: 10 })
  })
  it('has no topics when there is no client', () => {
    expect(topicMatrix({ ...data, you: null }, null).topics).toEqual([])
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
