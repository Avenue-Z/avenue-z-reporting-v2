import { describe, it, expect } from 'vitest'
import { buildCitationDateIndex } from './citation-dates'
import type { ApiDomainDateRow } from './citation-dates'

// ── Fixture factory ──────────────────────────────────────────────────────────
function row(over: Partial<ApiDomainDateRow> = {}): ApiDomainDateRow {
  return {
    domain: 'a.com',
    date: '2026-06-10',
    model: { id: 'chatgpt-scraper' },
    citation_count: 1,
    ...over,
  }
}

describe('buildCitationDateIndex', () => {
  it('multi-day host: rolls up first/last for the engine and for the * key', () => {
    const idx = buildCitationDateIndex([
      row({ domain: 'a.com', date: '2026-06-10', model: { id: 'chatgpt-scraper' } }),
      row({ domain: 'a.com', date: '2026-06-20', model: { id: 'chatgpt-scraper' } }),
    ])
    expect(idx['a.com']['ChatGPT']).toEqual({ first: '2026-06-10', last: '2026-06-20' })
    expect(idx['a.com']['*']).toEqual({ first: '2026-06-10', last: '2026-06-20' })
  })

  it('two engines: tracks each engine independently and the * key spans both', () => {
    const idx = buildCitationDateIndex([
      row({ domain: 'a.com', date: '2026-06-10', model: { id: 'chatgpt-scraper' } }),
      row({ domain: 'a.com', date: '2026-06-15', model: { id: 'perplexity-scraper' } }),
    ])
    expect(idx['a.com']['ChatGPT']).toEqual({ first: '2026-06-10', last: '2026-06-10' })
    expect(idx['a.com']['Perplexity']).toEqual({ first: '2026-06-15', last: '2026-06-15' })
    expect(idx['a.com']['*']).toEqual({ first: '2026-06-10', last: '2026-06-15' })
  })

  it('host normalization: www.A.com and a.com fold to one key', () => {
    const idx = buildCitationDateIndex([
      row({ domain: 'www.A.com', date: '2026-06-10', model: { id: 'chatgpt-scraper' } }),
      row({ domain: 'a.com', date: '2026-06-20', model: { id: 'chatgpt-scraper' } }),
    ])
    expect(Object.keys(idx)).toEqual(['a.com'])
    expect(idx['a.com']['ChatGPT']).toEqual({ first: '2026-06-10', last: '2026-06-20' })
  })

  it('single-day host: first equals last', () => {
    const idx = buildCitationDateIndex([
      row({ domain: 'a.com', date: '2026-06-10', model: { id: 'chatgpt-scraper' } }),
    ])
    expect(idx['a.com']['ChatGPT']).toEqual({ first: '2026-06-10', last: '2026-06-10' })
    expect(idx['a.com']['*']).toEqual({ first: '2026-06-10', last: '2026-06-10' })
  })

  it('empty rows yields an empty index', () => {
    expect(buildCitationDateIndex([])).toEqual({})
  })

  it('an unmappable model id still contributes to * but not to any engine key', () => {
    const idx = buildCitationDateIndex([
      row({ domain: 'a.com', date: '2026-06-10', model: { id: 'some-unknown-scraper' } }),
    ])
    expect(idx['a.com']['*']).toEqual({ first: '2026-06-10', last: '2026-06-10' })
    expect(Object.keys(idx['a.com'])).toEqual(['*'])
  })
})
