import { describe, it, expect } from 'vitest'
import { buildCitationDateIndex, mergeAscDescIndexes } from './citation-dates'
import type { ApiDomainDateRow, CitationDateIndex } from './citation-dates'

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

describe('mergeAscDescIndexes', () => {
  it('takes first from the ascending pass and last from the descending pass', () => {
    const asc: CitationDateIndex = {
      'a.com': { '*': { first: '2026-06-10', last: '2026-06-10' } },
    }
    const desc: CitationDateIndex = {
      'a.com': { '*': { first: '2026-06-20', last: '2026-06-20' } },
    }
    const merged = mergeAscDescIndexes(asc, desc)
    expect(merged['a.com']['*']).toEqual({ first: '2026-06-10', last: '2026-06-20' })
  })

  it('merges per engine key, not just the * roll-up', () => {
    const asc: CitationDateIndex = {
      'a.com': {
        '*': { first: '2026-06-10', last: '2026-06-10' },
        'ChatGPT': { first: '2026-06-10', last: '2026-06-10' },
      },
    }
    const desc: CitationDateIndex = {
      'a.com': {
        '*': { first: '2026-06-25', last: '2026-06-25' },
        'ChatGPT': { first: '2026-06-25', last: '2026-06-25' },
      },
    }
    const merged = mergeAscDescIndexes(asc, desc)
    expect(merged['a.com']['ChatGPT']).toEqual({ first: '2026-06-10', last: '2026-06-25' })
    expect(merged['a.com']['*']).toEqual({ first: '2026-06-10', last: '2026-06-25' })
  })

  it('a host present only in the ascending pass still resolves (last falls back to asc)', () => {
    const asc: CitationDateIndex = {
      'a.com': { '*': { first: '2026-06-10', last: '2026-06-15' } },
    }
    const desc: CitationDateIndex = {}
    const merged = mergeAscDescIndexes(asc, desc)
    expect(merged['a.com']['*']).toEqual({ first: '2026-06-10', last: '2026-06-15' })
  })

  it('a host present only in the descending pass still resolves (first falls back to desc)', () => {
    const asc: CitationDateIndex = {}
    const desc: CitationDateIndex = {
      'b.com': { '*': { first: '2026-06-05', last: '2026-06-30' } },
    }
    const merged = mergeAscDescIndexes(asc, desc)
    expect(merged['b.com']['*']).toEqual({ first: '2026-06-05', last: '2026-06-30' })
  })

  it('an engine key present only in one pass still resolves independently', () => {
    const asc: CitationDateIndex = {
      'a.com': {
        '*': { first: '2026-06-01', last: '2026-06-01' },
        'Perplexity': { first: '2026-06-01', last: '2026-06-01' },
      },
    }
    const desc: CitationDateIndex = {
      'a.com': {
        '*': { first: '2026-06-28', last: '2026-06-28' },
        'ChatGPT': { first: '2026-06-28', last: '2026-06-28' },
      },
    }
    const merged = mergeAscDescIndexes(asc, desc)
    expect(merged['a.com']['Perplexity']).toEqual({ first: '2026-06-01', last: '2026-06-01' })
    expect(merged['a.com']['ChatGPT']).toEqual({ first: '2026-06-28', last: '2026-06-28' })
    expect(merged['a.com']['*']).toEqual({ first: '2026-06-01', last: '2026-06-28' })
  })

  it('both passes empty yields an empty index', () => {
    expect(mergeAscDescIndexes({}, {})).toEqual({})
  })
})
