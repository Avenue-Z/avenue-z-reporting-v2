import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cache', () => ({ cached: (_v: string, _n: string, fn: unknown) => fn }))
vi.mock('@/lib/db/queries', () => ({
  getClientBySlug: vi.fn(async () => ({ peecCustomerProjectId: 'or_test', peecYourBrand: 'Renaissance' })),
}))
vi.mock('./roster', () => ({ getPeecRoster: vi.fn() }))
vi.mock('./client', async (orig) => ({
  ...(await orig<typeof import('./client')>()),
  peecPost: vi.fn(),
  peecGet: vi.fn(),
  fetchAllRows: vi.fn(),
}))

import { buildPeecTopicsPrompts, getPeecTopicsPromptsV2 } from './topics-prompts-v2'
import { peecPromptTopic, peecGet, fetchAllRows, type ApiBrandRow } from './client'
import { getPeecRoster } from './roster'

function row(promptId: string, brand: string, model: string, count: number, total: number, posSum = 0, posCount = 0): ApiBrandRow {
  return {
    brand: { id: brand, name: brand }, prompt: { id: promptId }, model: { id: model },
    visibility: total ? count / total : 0, visibility_count: count, visibility_total: total,
    share_of_voice: 0, sentiment: 0, sentiment_sum: 0, sentiment_count: 0, position: 0, position_sum: posSum, position_count: posCount,
  } as ApiBrandRow
}

const prompts = [
  { id: 'P1', messages: [{ content: 'Is Renaissance credible?' }], tags: [{ id: 't-subj' }, { id: 't-facet' }] },
  { id: 'P2', messages: [{ content: 'best dental plan for brokers' }] },
]
const tags = [{ id: 't-subj', name: 'Credibility w/Brokers' }, { id: 't-facet', name: 'branded' }]
const rows = [
  row('P1', 'Renaissance', 'chatgpt-scraper', 4, 10, 8, 4),
  row('P1', 'Guardian', 'chatgpt-scraper', 6, 10, 6, 6),
  row('P1', 'Renaissance', 'gemini-scraper', 2, 10, 6, 2),
  row('P2', 'Renaissance', 'chatgpt-scraper', 1, 5, 3, 1),
  row('P2', 'Guardian', 'chatgpt-scraper', 3, 5, 3, 3),
  row('P1', 'Renaissance', 'unknown-scraper', 9, 9),
]
const rowsPrior = [row('P1', 'Renaissance', 'chatgpt-scraper', 3, 10, 9, 3), row('P1', 'Guardian', 'chatgpt-scraper', 5, 10, 5, 5)]

describe('peecPromptTopic', () => {
  const names = new Map(tags.map((t) => [t.id, t.name]))
  it('takes the first subject tag and ignores facets', () => {
    expect(peecPromptTopic([{ id: 't-facet' }, { id: 't-subj' }], 'x', names)).toEqual({ group: 'Credibility w/Brokers', topicSource: 'provider' })
  })
  it('infers from the text when only facet tags are present', () => {
    expect(peecPromptTopic([{ id: 't-facet' }], 'best dental plan for brokers', names)).toEqual({ group: 'Agency Selection', topicSource: 'inferred' })
  })
  it('infers from the text when the tag id is unknown', () => {
    expect(peecPromptTopic([{ id: 'nope' }], 'best dental plan for brokers', names).topicSource).toBe('inferred')
  })
})

describe('buildPeecTopicsPrompts', () => {
  const out = buildPeecTopicsPrompts({ prompts, tags, rows, rowsPrior, yourBrand: 'Renaissance' })
  it('assigns topics: the first subject tag, else Other (v1 infers one; v2 does not)', () => {
    const by = Object.fromEntries(out.prompts.map((p) => [p.id, p.topic]))
    expect(by.P1).toBe('Credibility w/Brokers')
    expect(by.P2).toBe('Other')
    expect(out.cells.filter((c) => c.topic === 'Other').map((c) => c.brand).sort()).toEqual(['Guardian', 'Renaissance'])
  })
  it('counts each topic x model total once per prompt x model, not once per brand row', () => {
    expect(out.topicAnswers).toEqual([
      { topic: 'Credibility w/Brokers', model: 'ChatGPT', answers: 10 },
      { topic: 'Credibility w/Brokers', model: 'Gemini', answers: 10 },
      { topic: 'Other', model: 'ChatGPT', answers: 5 },
    ])
    expect(out.topicAnswersPrior).toEqual([{ topic: 'Credibility w/Brokers', model: 'ChatGPT', answers: 10 }])
  })
  it('sums topic totals over the topic prompts', () => {
    const p3 = { id: 'P3', messages: [{ content: 'x' }], tags: [{ id: 't-subj' }] }
    const extra = [row('P3', 'Renaissance', 'chatgpt-scraper', 1, 7), row('P3', 'Guardian', 'chatgpt-scraper', 0, 7)]
    const o = buildPeecTopicsPrompts({ prompts: [...prompts, p3], tags, rows: [...rows, ...extra], rowsPrior: [], yourBrand: 'Renaissance' })
    expect(o.topicAnswers.find((t) => t.topic === 'Credibility w/Brokers' && t.model === 'ChatGPT')?.answers).toBe(17)
  })
  it('sums one cell per topic, brand and model, Guardian included', () => {
    const c = out.cells.find((x) => x.topic === 'Credibility w/Brokers' && x.brand === 'Guardian' && x.model === 'ChatGPT')
    expect(c).toEqual({ topic: 'Credibility w/Brokers', brand: 'Guardian', model: 'ChatGPT', mentions: 6, answers: 10 })
    expect(out.cells).toHaveLength(5)
    expect(out.cellsPrior).toHaveLength(2)
  })
  it('gives the client brand per-model stats and a null prior when the prompt had no prior rows', () => {
    const p1 = out.prompts.find((p) => p.id === 'P1')!
    expect(p1.text).toBe('Is Renaissance credible?')
    expect(p1.current.ChatGPT).toEqual({ mentions: 4, answers: 10, posSum: 8, posCount: 4 })
    expect(p1.prior?.ChatGPT).toEqual({ mentions: 3, answers: 10, posSum: 9, posCount: 3 })
    expect(out.prompts.find((p) => p.id === 'P2')!.prior).toBeNull()
  })
  it('ignores rows with an unrecognised model', () => {
    expect(out.cells.some((c) => c.mentions === 9)).toBe(false)
    expect(Object.keys(out.prompts.find((p) => p.id === 'P1')!.current).sort()).toEqual(['ChatGPT', 'Gemini'])
  })
  it('resolves you by exact name, using the roster own flag only without a configured name', () => {
    expect(out.you).toBe('Renaissance')
    const own = buildPeecTopicsPrompts({ prompts, tags, rows, rowsPrior, yourBrand: '', ownByName: new Map([['Guardian', true]]) })
    expect(own.you).toBe('Guardian')
  })
  it('resolves you over brands in visibility-rank order, so a tie goes to the best-ranked brand', () => {
    // Both own and no configured name: Guardian (9 of 15) outranks Renaissance (7 of 25) though Renaissance is seen first.
    const tie = buildPeecTopicsPrompts({ prompts, tags, rows, rowsPrior, yourBrand: '', ownByName: new Map([['Renaissance', true], ['Guardian', true]]) })
    expect(tie.you).toBe('Guardian')
  })
  it('drops a prompt with no current rows', () => {
    const o = buildPeecTopicsPrompts({ prompts, tags, rows: rows.slice(0, 2), rowsPrior, yourBrand: 'Renaissance' })
    expect(o.prompts.map((p) => p.id)).toEqual(['P1'])
  })
})

describe('getPeecTopicsPromptsV2', () => {
  beforeEach(() => {
    vi.mocked(getPeecRoster).mockResolvedValue([{ id: 'r', name: 'Renaissance', isOwn: true, domains: [] }])
    vi.mocked(peecGet).mockImplementation((async (path: string) => (path === '/tags' ? { data: tags } : { data: prompts })) as never)
    vi.mocked(fetchAllRows).mockReset()
    vi.mocked(fetchAllRows).mockResolvedValueOnce(rows).mockResolvedValueOnce(rowsPrior)
  })
  it('pages both windows by prompt, model channel and model with the large caps', async () => {
    const out = await getPeecTopicsPromptsV2('renaissance', 'last_30_days', 'previous_period')
    expect(out.you).toBe('Renaissance')
    const calls = vi.mocked(fetchAllRows).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0][0]).toMatchObject({ dimensions: ['prompt_id', 'model_channel_id', 'model_id'] })
    expect(calls[0].slice(1)).toEqual(['or_test', 50_000, 5_000])
  })
  it('fails closed without a configured project', async () => {
    const q = await import('@/lib/db/queries')
    vi.mocked(q.getClientBySlug).mockResolvedValueOnce({ peecCustomerProjectId: null } as never)
    await expect(getPeecTopicsPromptsV2('x', 'last_30_days', 'previous_period')).rejects.toThrow('[peec] no Peec project configured for x')
  })
})
