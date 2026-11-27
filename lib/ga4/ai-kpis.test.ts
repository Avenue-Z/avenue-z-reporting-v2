import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ga4/client', () => ({ ga4Query: vi.fn() }))

import { ga4Query } from '@/lib/ga4/client'
import { AI_REFERRER_DOMAINS } from '@/lib/constants'
import { AI_SOURCE_FILTER, fetchAiKpiWindow, summarizeAiKpis, type AiKpiWindow } from './ai-kpis'

const mockQuery = vi.mocked(ga4Query)

const SOURCE_ROWS = [
  { sessionSource: 'chatgpt.com', sessions: 225, keyEvents: 195 },
  { sessionSource: 'gemini.google.com', sessions: 9, keyEvents: 3 },
]

const res = (rows: unknown[]) => ({ rows, rowCount: rows.length, metadata: {} })

function dispatch(leadRows: unknown[] = []) {
  mockQuery.mockImplementation((async (params: { dimensions?: string[]; metrics: string[] }) => {
    if (!params.dimensions) return res([{ sessions: 28785 }])
    if (params.dimensions.includes('eventName')) return res(leadRows)
    return res(SOURCE_ROWS)
  }) as never)
}

beforeEach(() => {
  mockQuery.mockReset()
})

describe('AI_SOURCE_FILTER', () => {
  it('has one case-insensitive CONTAINS expression per referrer domain', () => {
    const exprs = (AI_SOURCE_FILTER as { orGroup: { expressions: { filter: { fieldName: string; stringFilter: { matchType: string; value: string; caseSensitive: boolean } } }[] } }).orGroup.expressions
    expect(exprs).toHaveLength(14)
    expect(exprs.map((e) => e.filter.stringFilter.value)).toEqual([...AI_REFERRER_DOMAINS])
    for (const e of exprs) {
      expect(e.filter.fieldName).toBe('sessionSource')
      expect(e.filter.stringFilter.matchType).toBe('CONTAINS')
      expect(e.filter.stringFilter.caseSensitive).toBe(false)
    }
  })
})

describe('fetchAiKpiWindow', () => {
  it('without an allowlist makes two requests', async () => {
    dispatch()
    const w = await fetchAiKpiWindow('acme', '2026-10-01,2026-10-30', null)
    expect(mockQuery).toHaveBeenCalledTimes(2)
    expect(w).toEqual({
      totalSessions: 28785,
      bySource: [
        { source: 'chatgpt.com', sessions: 225, keyEvents: 195 },
        { source: 'gemini.google.com', sessions: 9, keyEvents: 3 },
      ],
      leadsBySource: null,
    })
  })

  it('with an allowlist adds a lead-event request summed per source', async () => {
    dispatch([
      { sessionSource: 'chatgpt.com', eventName: 'contact_individual_lead', eventCount: 2 },
      { sessionSource: 'chatgpt.com', eventName: 'via_form', eventCount: 1 },
    ])
    const cfg = { leadEvents: [{ name: 'lead', sourceEvents: ['contact_individual_lead', 'via_form'] }] }
    const w = await fetchAiKpiWindow('acme', '2026-10-01,2026-10-30', cfg as never)
    expect(mockQuery).toHaveBeenCalledTimes(3)
    const third = mockQuery.mock.calls.map((c) => c[0]).find((p) => p.dimensions?.includes('eventName'))!
    const exprs = (third.dimensionFilter as { andGroup: { expressions: unknown[] } }).andGroup.expressions
    expect(exprs[0]).toBe(AI_SOURCE_FILTER)
    expect(exprs[1]).toEqual({
      filter: { fieldName: 'eventName', inListFilter: { values: ['contact_individual_lead', 'via_form'] } },
    })
    expect(w.leadsBySource).toEqual([{ source: 'chatgpt.com', leads: 3 }])
  })

  it('rejects when any request fails', async () => {
    mockQuery.mockImplementation((async (params: { dimensions?: string[] }) => {
      if (!params.dimensions) throw new Error('boom')
      return res(SOURCE_ROWS)
    }) as never)
    await expect(fetchAiKpiWindow('acme', '2026-10-01,2026-10-30', null)).rejects.toThrow('boom')
  })
})

describe('summarizeAiKpis', () => {
  const w: AiKpiWindow = {
    totalSessions: 28785,
    bySource: [
      { source: 'chatgpt.com', sessions: 225, keyEvents: 195 },
      { source: 'gemini.google.com', sessions: 9, keyEvents: 3 },
    ],
    leadsBySource: null,
  }
  it('uses key events when there is no allowlist', () => {
    expect(summarizeAiKpis(w, null)).toEqual({ sessions: 234, leads: 198, totalSessions: 28785, leadBasis: 'key-events' })
  })
  it('uses lead events when the allowlist ran', () => {
    const s = summarizeAiKpis({ ...w, leadsBySource: [{ source: 'chatgpt.com', leads: 4 }] }, null)
    expect(s.leads).toBe(4)
    expect(s.leadBasis).toBe('lead-events')
  })
  it('filters by model', () => {
    expect(summarizeAiKpis(w, ['Gemini']).sessions).toBe(9)
  })
})
