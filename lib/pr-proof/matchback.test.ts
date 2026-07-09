import { describe, it, expect } from 'vitest'
import { computePlacementMatchback, normHost } from './matchback'
import type { PRPlacement } from './types'
import type { UrlCitation } from '@/lib/peec/url-citations'
import type { CitationDateIndex } from '@/lib/peec/citation-dates'

// ── Fixture factories ────────────────────────────────────────────────────────
function placement(over: Partial<PRPlacement> = {}): PRPlacement {
  return {
    client: 'Avenue Z',
    outlet: "O'Dwyer's PR",
    headline: 'On the Move: McGinnis Joins Board of Penta Group',
    publicationDate: '2026-01-27',
    link: 'https://odwyerpr.com/story/123',
    domain: 'odwyerpr.com',
    impact: '',
    dateAdded: '',
    ...over,
  }
}

function citation(over: Partial<UrlCitation> = {}): UrlCitation {
  return {
    url: 'https://odwyerpr.com/story/123',
    urlKey: 'odwyerpr.com/story/123',
    domain: 'odwyerpr.com',
    classification: 'editorial',
    title: null,
    citationCount: 3,
    citationRate: 1,
    citationAvg: 1,
    engines: ['ChatGPT'],
    mentionedBrandIds: [],
    competitorBrandNames: [],
    mentionsYourBrand: false,
    ...over,
  }
}

describe('normHost', () => {
  it('lowercases, trims, and strips a leading www.', () => {
    expect(normHost('  WWW.OdwyerPR.com ')).toBe('odwyerpr.com')
  })
  it('is idempotent on already-normalized hosts', () => {
    expect(normHost('odwyerpr.com')).toBe('odwyerpr.com')
  })
})

describe('computePlacementMatchback', () => {
  it('includes a placement whose domain is cited in the period, with its engines', () => {
    const res = computePlacementMatchback(
      [placement()],
      [citation({ engines: ['ChatGPT', 'Google'] })],
      null,
      {},
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].citedByAI).toBe(true)
    expect(res.rows[0].outlet).toBe("O'Dwyer's PR")
    expect(res.rows[0].aiEnginesCiting.sort()).toEqual(['ChatGPT', 'Google'])
    expect(res.citedCount).toBe(1)
    expect(res.totalPlacements).toBe(1)
  })

  it('excludes a placement whose domain has no citation in the period', () => {
    const res = computePlacementMatchback(
      [placement({ domain: 'techround.co.uk' })],
      [citation({ domain: 'odwyerpr.com' })],
      null,
      {},
    )
    expect(res.rows).toHaveLength(0)
    expect(res.citedCount).toBe(0)
    // M is still the all-time count even when nothing is cited.
    expect(res.totalPlacements).toBe(1)
  })

  it('THE TINA CASE: a January-secured placement cited in the current window is shown (secured date is irrelevant)', () => {
    const res = computePlacementMatchback(
      [placement({ publicationDate: '2026-01-27', domain: 'odwyerpr.com' })],
      [citation({ domain: 'odwyerpr.com' })], // urlCitations is already the selected window
      null,
      {},
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].publicationDate).toBe('2026-01-27')
  })

  it('shows a period-cited placement with no engine data under all-models, with empty engines', () => {
    const res = computePlacementMatchback(
      [placement()],
      [citation({ engines: [] })],
      null,
      {},
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].aiEnginesCiting).toEqual([])
    expect(res.rows[0].citedByAI).toBe(true)
  })

  it('drops a period-cited placement with no engine data when a model filter is active', () => {
    const res = computePlacementMatchback(
      [placement()],
      [citation({ engines: [] })],
      ['ChatGPT'],
      {},
    )
    expect(res.rows).toHaveLength(0)
    expect(res.citedCount).toBe(0)
    expect(res.totalPlacements).toBe(1)
  })

  it('under a model filter, keeps only placements cited by a selected engine', () => {
    const res = computePlacementMatchback(
      [
        placement({ domain: 'odwyerpr.com', outlet: 'ODwyer' }),
        placement({ domain: 'prweek.com', outlet: 'PRWeek' }),
      ],
      [
        citation({ domain: 'odwyerpr.com', engines: ['ChatGPT'] }),
        citation({ domain: 'prweek.com', engines: ['Google'] }),
      ],
      ['ChatGPT'],
      {},
    )
    expect(res.rows.map((r) => r.outlet)).toEqual(['ODwyer'])
  })

  it('under a multi-model filter, keeps placements cited by any selected engine (union)', () => {
    const res = computePlacementMatchback(
      [
        placement({ domain: 'odwyerpr.com', outlet: 'ODwyer' }),
        placement({ domain: 'prweek.com', outlet: 'PRWeek' }),
      ],
      [
        citation({ domain: 'odwyerpr.com', engines: ['ChatGPT'] }),
        citation({ domain: 'prweek.com', engines: ['Google'] }),
      ],
      ['ChatGPT', 'Google'],
      {},
    )
    expect(res.rows.map((r) => r.outlet).sort()).toEqual(['ODwyer', 'PRWeek'])
  })

  it('displays the FULL engine set for a kept row, not only the selected engine', () => {
    const res = computePlacementMatchback(
      [placement()],
      [citation({ engines: ['Google', 'ChatGPT', 'Perplexity'] })],
      ['ChatGPT'],
      {},
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].aiEnginesCiting.sort()).toEqual(['ChatGPT', 'Google', 'Perplexity'])
  })

  it('returns an empty table but the correct all-time denominator when nothing is cited in the period', () => {
    const res = computePlacementMatchback(
      [placement(), placement({ domain: 'prweek.com' }), placement({ domain: 'techround.co.uk' })],
      [], // no citations in this period
      null,
      {},
    )
    expect(res.rows).toHaveLength(0)
    expect(res.citedCount).toBe(0)
    expect(res.totalPlacements).toBe(3)
  })

  it('matches domains case-insensitively and ignoring a leading www. on either side', () => {
    const res = computePlacementMatchback(
      [placement({ domain: 'WWW.ODWYERPR.COM' })],
      [citation({ domain: 'odwyerpr.com' })],
      null,
      {},
    )
    expect(res.rows).toHaveLength(1)
  })

  it('counts a placement once and unions engines when the domain has multiple cited URLs', () => {
    const res = computePlacementMatchback(
      [placement({ domain: 'odwyerpr.com' })],
      [
        citation({ urlKey: 'odwyerpr.com/a', url: 'https://odwyerpr.com/a', engines: ['ChatGPT'] }),
        citation({ urlKey: 'odwyerpr.com/b', url: 'https://odwyerpr.com/b', engines: ['Google'] }),
      ],
      null,
      {},
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].aiEnginesCiting.sort()).toEqual(['ChatGPT', 'Google'])
  })

  it('includes both placements when two placements share a cited domain (domain-level)', () => {
    const res = computePlacementMatchback(
      [
        placement({ domain: 'odwyerpr.com', link: 'https://odwyerpr.com/a', outlet: 'A' }),
        placement({ domain: 'odwyerpr.com', link: 'https://odwyerpr.com/b', outlet: 'B' }),
      ],
      [citation({ domain: 'odwyerpr.com', engines: ['ChatGPT'] })],
      null,
      {},
    )
    expect(res.rows.map((r) => r.outlet).sort()).toEqual(['A', 'B'])
  })

  it('does not invent rows for cited domains that match no placement', () => {
    const res = computePlacementMatchback(
      [placement({ domain: 'odwyerpr.com' })],
      [
        citation({ domain: 'odwyerpr.com', engines: ['ChatGPT'] }),
        citation({ domain: 'forbes.com', engines: ['Google'] }),
      ],
      null,
      {},
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].outlet).toBe("O'Dwyer's PR")
  })

  it('passes through outlet, headline, link, and publicationDate to the row', () => {
    const res = computePlacementMatchback(
      [placement({ outlet: 'PRWeek', headline: 'Big News', link: 'https://prweek.com/x', publicationDate: '2025-06-25', domain: 'prweek.com' })],
      [citation({ domain: 'prweek.com' })],
      null,
      {},
    )
    expect(res.rows[0]).toMatchObject({
      outlet: 'PRWeek',
      headline: 'Big News',
      link: 'https://prweek.com/x',
      publicationDate: '2025-06-25',
    })
  })

  it('citedCount always equals rows.length (invariant)', () => {
    const res = computePlacementMatchback(
      [placement({ domain: 'odwyerpr.com' }), placement({ domain: 'prweek.com' }), placement({ domain: 'nomatch.com' })],
      [citation({ domain: 'odwyerpr.com' }), citation({ domain: 'prweek.com' })],
      null,
      {},
    )
    expect(res.citedCount).toBe(res.rows.length)
    expect(res.citedCount).toBe(2)
    expect(res.totalPlacements).toBe(3)
  })

  it('treats models: [] the same as null (no filter): a period-cited placement is included with its engines', () => {
    const res = computePlacementMatchback(
      [placement()],
      [citation({ engines: ['ChatGPT'] })],
      [],
      {},
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].aiEnginesCiting).toEqual(['ChatGPT'])
  })

  it('with models: [] (no filter), still includes a period-cited placement that has no engine data', () => {
    const res = computePlacementMatchback(
      [placement()],
      [citation({ engines: [] })],
      [],
      {},
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].aiEnginesCiting).toEqual([])
  })

  it('handles an empty placement list', () => {
    const res = computePlacementMatchback([], [citation()], null, {})
    expect(res.rows).toHaveLength(0)
    expect(res.totalPlacements).toBe(0)
  })
})

describe('computePlacementMatchback: citation dates (FB-068)', () => {
  it('no model filter: firstCitedDate/lastCitedDate come from the "*" any-engine roll-up', () => {
    const citationDates: CitationDateIndex = {
      'a.com': {
        '*': { first: '2026-01-01', last: '2026-03-15' },
        ChatGPT: { first: '2026-02-01', last: '2026-02-20' },
      },
    }
    const res = computePlacementMatchback(
      [placement({ domain: 'a.com' })],
      [citation({ domain: 'a.com' })],
      null,
      citationDates,
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].firstCitedDate).toBe('2026-01-01')
    expect(res.rows[0].lastCitedDate).toBe('2026-03-15')
  })

  it('single-engine filter [ChatGPT]: dates come from that engine only, not the "*" roll-up', () => {
    const citationDates: CitationDateIndex = {
      'a.com': {
        '*': { first: '2026-01-01', last: '2026-03-15' },
        ChatGPT: { first: '2026-02-01', last: '2026-02-20' },
      },
    }
    const res = computePlacementMatchback(
      [placement({ domain: 'a.com' })],
      [citation({ domain: 'a.com', engines: ['ChatGPT'] })],
      ['ChatGPT'],
      citationDates,
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].firstCitedDate).toBe('2026-02-01')
    expect(res.rows[0].lastCitedDate).toBe('2026-02-20')
  })

  it('two-engine filter [ChatGPT,Perplexity]: firstCitedDate is the min of both firsts, lastCitedDate is the max of both lasts', () => {
    const citationDates: CitationDateIndex = {
      'a.com': {
        '*': { first: '2025-12-01', last: '2026-04-01' },
        ChatGPT: { first: '2026-02-01', last: '2026-02-20' },
        Perplexity: { first: '2026-01-10', last: '2026-03-05' },
        Gemini: { first: '2025-06-01', last: '2025-06-01' },
      },
    }
    const res = computePlacementMatchback(
      [placement({ domain: 'a.com' })],
      [citation({ domain: 'a.com', engines: ['ChatGPT', 'Perplexity'] })],
      ['ChatGPT', 'Perplexity'],
      citationDates,
    )
    expect(res.rows).toHaveLength(1)
    // min(2026-02-01, 2026-01-10) = 2026-01-10
    expect(res.rows[0].firstCitedDate).toBe('2026-01-10')
    // max(2026-02-20, 2026-03-05) = 2026-03-05
    expect(res.rows[0].lastCitedDate).toBe('2026-03-05')
  })

  it('host absent from the citation-date index: both dates default to empty string ("N/A")', () => {
    const res = computePlacementMatchback(
      [placement({ domain: 'a.com' })],
      [citation({ domain: 'a.com' })],
      null,
      {}, // no entry for a.com at all
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].firstCitedDate).toBe('')
    expect(res.rows[0].lastCitedDate).toBe('')
  })

  it('model filter selects engines absent from the index: both dates default to empty string', () => {
    const citationDates: CitationDateIndex = {
      'a.com': { '*': { first: '2026-01-01', last: '2026-01-01' } },
    }
    const res = computePlacementMatchback(
      [placement({ domain: 'a.com' })],
      [citation({ domain: 'a.com', engines: ['ChatGPT'] })],
      ['ChatGPT'], // present in urlCitations engines but not in citationDates for a.com
      citationDates,
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].firstCitedDate).toBe('')
    expect(res.rows[0].lastCitedDate).toBe('')
  })

  it('invariant: firstCitedDate <= lastCitedDate whenever both are non-empty, across all rows', () => {
    const citationDates: CitationDateIndex = {
      'odwyerpr.com': {
        '*': { first: '2026-01-05', last: '2026-06-30' },
        ChatGPT: { first: '2026-02-10', last: '2026-05-01' },
        Google: { first: '2026-01-05', last: '2026-06-30' },
      },
      'prweek.com': {
        '*': { first: '2026-03-01', last: '2026-03-01' },
      },
    }
    const res = computePlacementMatchback(
      [
        placement({ domain: 'odwyerpr.com', outlet: 'ODwyer' }),
        placement({ domain: 'prweek.com', outlet: 'PRWeek' }),
      ],
      [
        citation({ domain: 'odwyerpr.com', engines: ['ChatGPT', 'Google'] }),
        citation({ domain: 'prweek.com', engines: [] }),
      ],
      null,
      citationDates,
    )
    expect(res.rows.length).toBeGreaterThan(0)
    for (const row of res.rows) {
      if (row.firstCitedDate && row.lastCitedDate) {
        expect(row.firstCitedDate <= row.lastCitedDate).toBe(true)
      }
    }
  })
})
