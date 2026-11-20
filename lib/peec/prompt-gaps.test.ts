import { describe, it, expect } from 'vitest'
import { computePromptGaps, DEFAULT_DECLINE_THRESHOLD } from './prompt-gaps'
import { EMPTY_COVERAGE_PROJECTION, type CoverageProjection } from './coverage-projection'
import type { TrackedPrompt } from './client'

const cov = (o: Partial<CoverageProjection> = {}): CoverageProjection => ({ ...EMPTY_COVERAGE_PROJECTION, ...o })
const prompt = (id: string, o: Partial<TrackedPrompt> = {}): TrackedPrompt => ({
  id, text: `prompt ${id}`, sources: [], visibility: 0, sov: 0, position: 0,
  positionByModel: {}, priorPositionByModel: {}, group: 'T', topicSource: 'provider',
  ...o,
})
const run = (o: Partial<Parameters<typeof computePromptGaps>[0]>) =>
  computePromptGaps({
    prompts: [], coverage: cov(), coveragePrevious: cov(), models: null,
    declineThreshold: DEFAULT_DECLINE_THRESHOLD, ...o,
  })
const rows = (r: ReturnType<typeof computePromptGaps>) => {
  if (!r.ok) throw new Error('not ok')
  return r.rows
}

describe('computePromptGaps', () => {
  it('flags not-cited, lost, declining', () => {
    const r = run({
      prompts: [
        prompt('a'),
        prompt('b'),
        prompt('c', { positionByModel: { ChatGPT: 4 }, priorPositionByModel: { ChatGPT: 2 } }),
        prompt('d'),
      ],
      coverage: cov({ ownedPromptIds: ['c', 'd'] }),
      coveragePrevious: cov({ ownedPromptIds: ['b', 'c', 'd'] }),
    })
    expect(rows(r).map((x) => [x.promptId, x.status])).toEqual([
      ['a', 'not-cited'], ['b', 'lost'], ['c', 'declining'],
    ])
  })
  it('incomplete coverage -> ok:false incomplete', () => {
    expect(run({ coverage: cov({ complete: false }) })).toEqual({ ok: false, reason: 'incomplete' })
    expect(run({ coveragePrevious: cov({ complete: false }) })).toEqual({ ok: false, reason: 'incomplete' })
  })
  it('duplicateRows > 0 with complete true still renders rows', () => {
    const r = run({ prompts: [prompt('a')], coverage: cov({ duplicateRows: 5 }) })
    expect(rows(r)).toHaveLength(1)
  })
  it('position 0 / missing prior is not declining', () => {
    const r = run({
      prompts: [
        prompt('a', { positionByModel: { ChatGPT: 5 }, priorPositionByModel: { ChatGPT: 0 } }),
        prompt('b', { positionByModel: { ChatGPT: 0 }, priorPositionByModel: { ChatGPT: 1 } }),
        prompt('c', { positionByModel: { ChatGPT: 5 } }),
      ],
      coverage: cov({ ownedPromptIds: ['a', 'b', 'c'] }),
      coveragePrevious: cov({ ownedPromptIds: ['a', 'b', 'c'] }),
    })
    expect(rows(r)).toEqual([])
  })
  it('threshold boundary: exactly 1 rank worse is declining, less is not', () => {
    const mk = (now: number) => run({
      prompts: [prompt('a', { positionByModel: { ChatGPT: now }, priorPositionByModel: { ChatGPT: 2 } })],
      coverage: cov({ ownedPromptIds: ['a'] }), coveragePrevious: cov({ ownedPromptIds: ['a'] }),
    })
    expect(rows(mk(3))).toHaveLength(1)
    expect(rows(mk(2.9))).toHaveLength(0)
  })
  it('model filter restricts both periods', () => {
    const base = {
      prompts: [prompt('a', {
        positionByModel: { ChatGPT: 5, Gemini: 1 }, priorPositionByModel: { ChatGPT: 1, Gemini: 1 },
      })],
      coverage: cov({ ownedPromptIds: ['a'], ownedPromptIdsByModel: { ChatGPT: [], Gemini: ['a'] } }),
      coveragePrevious: cov({ ownedPromptIds: ['a'], ownedPromptIdsByModel: { ChatGPT: ['a'], Gemini: ['a'] } }),
    }
    // ChatGPT only: lost (owned before on ChatGPT, not now)
    expect(rows(run({ ...base, models: ['ChatGPT'] })).map((x) => x.status)).toEqual(['lost'])
    // Gemini only: owned both, position flat -> nothing
    expect(rows(run({ ...base, models: ['Gemini'] }))).toEqual([])
  })
  it('passes otherSites through with otherSitesMore', () => {
    const r = run({
      prompts: [prompt('a'), prompt('b')],
      coverage: cov({
        otherSitesByPrompt: {
          a: { urls: [{ urlKey: 'k', url: 'https://x.com/p', citationCount: 3, namesCompetitor: true }], more: 2 },
        },
      }),
    })
    const [a, b] = rows(r)
    expect(a.otherSites).toEqual([{ url: 'https://x.com/p', namesCompetitor: true }])
    expect(a.otherSitesMore).toBe(2)
    expect(b.otherSites).toEqual([])
    expect(b.otherSitesMore).toBe(0)
  })
})
