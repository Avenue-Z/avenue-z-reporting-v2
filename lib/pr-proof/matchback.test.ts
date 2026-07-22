import { describe, it, expect } from 'vitest'
import { computePlacementMatchback, normHost } from './matchback'
import type { PRPlacement } from './types'
import type { UrlCitation } from '@/lib/peec/url-citations'
import type { CitationDateIndex } from '@/lib/peec/citation-dates'

// ── Fixture factories ────────────────────────────────────────────────────────
// FB-069: link/url/urlKey default to the same article path on whatever `domain`
// the caller passes, so `placement({domain:'x.com'})` and `citation({domain:'x.com'})`
// still describe the same article. Override `link`/`url`/`urlKey` explicitly to
// test the case where a publication is cited but our specific article is not.
const ARTICLE_PATH = '/story/123'

function placement(over: Partial<PRPlacement> = {}): PRPlacement {
  const domain = over.domain ?? 'odwyerpr.com'
  return {
    client: 'Avenue Z',
    outlet: "O'Dwyer's PR",
    headline: 'On the Move: McGinnis Joins Board of Penta Group',
    publicationDate: '2026-01-27',
    link: `https://${domain}${ARTICLE_PATH}`,
    domain,
    impact: '',
    dateAdded: '',
    ...over,
  }
}

function citation(over: Partial<UrlCitation> = {}): UrlCitation {
  const domain = over.domain ?? 'odwyerpr.com'
  return {
    url: `https://${domain}${ARTICLE_PATH}`,
    urlKey: `${domain.toLowerCase().replace(/^www\./, '')}${ARTICLE_PATH}`,
    domain,
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

  it('counts a placement once and unions engines when the same article is cited on several rows', () => {
    const res = computePlacementMatchback(
      [placement({ domain: 'odwyerpr.com' })],
      [
        citation({ domain: 'odwyerpr.com', engines: ['ChatGPT'] }),
        citation({ domain: 'odwyerpr.com', engines: ['Google'] }),
      ],
      null,
      {},
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].aiEnginesCiting.sort()).toEqual(['ChatGPT', 'Google'])
  })

  // FB-069 REVERSAL. This assertion used to read `.toEqual(['A', 'B'])` and was
  // named "(domain-level)", encoding Tina's 2026-07-09 direction that any URL on
  // a placement's domain counted as citing it. Bristol's 2026-07-20 report showed
  // that overstates: only placement A's article was cited, yet B was reported as
  // cited too. Matching is now on the article URL, so B is correctly excluded.
  it('excludes a placement sharing a cited domain when its own article is not cited', () => {
    const res = computePlacementMatchback(
      [
        placement({ domain: 'odwyerpr.com', link: 'https://odwyerpr.com/a', outlet: 'A' }),
        placement({ domain: 'odwyerpr.com', link: 'https://odwyerpr.com/b', outlet: 'B' }),
      ],
      [citation({ url: 'https://odwyerpr.com/a', urlKey: 'odwyerpr.com/a', engines: ['ChatGPT'] })],
      null,
      {},
    )
    expect(res.rows.map((r) => r.outlet)).toEqual(['A'])
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
      [citation({ domain: 'prweek.com', url: 'https://prweek.com/x', urlKey: 'prweek.com/x' })],
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

// ── FB-069: article-URL matchback ────────────────────────────────────────────
// Tina 2026-07-09 specified domain-level matching. Bristol's 2026-07-20 report
// showed why that overstates: a dig-in.com placement was reported as cited in
// ChatGPT when only *other* dig-in.com articles appeared in Peec. The rule is
// now an intersection on the article URL itself.
describe('computePlacementMatchback: article-URL matching (FB-069)', () => {
  it('excludes a placement whose domain is cited but whose own article is not', () => {
    const res = computePlacementMatchback(
      [placement({
        domain: 'dig-in.com',
        link: 'https://www.dig-in.com/opinion/why-insurance-ai-needs-clean-workflows-and-accountability',
      })],
      [citation({
        domain: 'dig-in.com',
        url: 'https://www.dig-in.com/news/a-completely-different-article',
        urlKey: 'dig-in.com/news/a-completely-different-article',
      })],
      null,
      {},
    )
    expect(res.rows).toHaveLength(0)
    expect(res.citedCount).toBe(0)
    expect(res.totalPlacements).toBe(1)
  })

  it('includes a placement whose own article URL is cited', () => {
    const res = computePlacementMatchback(
      [placement({ domain: 'dig-in.com', link: 'https://www.dig-in.com/opinion/our-piece' })],
      [citation({ domain: 'dig-in.com', url: 'https://www.dig-in.com/opinion/our-piece', urlKey: 'dig-in.com/opinion/our-piece' })],
      null,
      {},
    )
    expect(res.rows).toHaveLength(1)
  })

  it('matches when the sheet URL carries www. and the Peec URL does not', () => {
    // The one genuine Renaissance match differs only by "www.".
    const res = computePlacementMatchback(
      [placement({
        domain: 'benefitnews.com',
        link: 'https://www.benefitnews.com/news/building-a-benefits-dream-team',
      })],
      [citation({
        domain: 'benefitnews.com',
        url: 'https://benefitnews.com/news/building-a-benefits-dream-team',
        urlKey: 'benefitnews.com/news/building-a-benefits-dream-team',
      })],
      null,
      {},
    )
    expect(res.rows).toHaveLength(1)
  })

  it('ignores a trailing slash and a query string when matching', () => {
    const res = computePlacementMatchback(
      [placement({ domain: 'benefitspro.com', link: 'https://benefitspro.com/2026/05/04/story/?utm_source=newsletter' })],
      [citation({ domain: 'benefitspro.com', url: 'https://benefitspro.com/2026/05/04/story', urlKey: 'benefitspro.com/2026/05/04/story' })],
      null,
      {},
    )
    expect(res.rows).toHaveLength(1)
  })

  it('includes only the placement whose own article is cited when two share a domain', () => {
    const res = computePlacementMatchback(
      [
        placement({ domain: 'odwyerpr.com', link: 'https://odwyerpr.com/a', outlet: 'A' }),
        placement({ domain: 'odwyerpr.com', link: 'https://odwyerpr.com/b', outlet: 'B' }),
      ],
      [citation({ url: 'https://odwyerpr.com/a', urlKey: 'odwyerpr.com/a', engines: ['ChatGPT'] })],
      null,
      {},
    )
    expect(res.rows.map((r) => r.outlet)).toEqual(['A'])
  })

  it('scopes engine chips to the cited article, not every citation on the domain', () => {
    const res = computePlacementMatchback(
      [placement({ domain: 'odwyerpr.com', link: 'https://odwyerpr.com/a' })],
      [
        citation({ url: 'https://odwyerpr.com/a', urlKey: 'odwyerpr.com/a', engines: ['ChatGPT'] }),
        citation({ url: 'https://odwyerpr.com/b', urlKey: 'odwyerpr.com/b', engines: ['Google', 'Perplexity'] }),
      ],
      null,
      {},
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].aiEnginesCiting).toEqual(['ChatGPT'])
  })

  it('excludes a placement with no link at all', () => {
    const res = computePlacementMatchback(
      [placement({ domain: 'odwyerpr.com', link: '' })],
      [citation()],
      null,
      {},
    )
    expect(res.rows).toHaveLength(0)
  })
})
