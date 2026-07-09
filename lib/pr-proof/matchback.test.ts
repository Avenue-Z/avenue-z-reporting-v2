import { describe, it, expect } from 'vitest'
import { computePlacementMatchback, normHost } from './matchback'
import type { PRPlacement } from './types'
import type { UrlCitation } from '@/lib/peec/url-citations'

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
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].publicationDate).toBe('2026-01-27')
  })

  it('shows a period-cited placement with no engine data under all-models, with empty engines', () => {
    const res = computePlacementMatchback(
      [placement()],
      [citation({ engines: [] })],
      null,
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
    )
    expect(res.rows.map((r) => r.outlet).sort()).toEqual(['ODwyer', 'PRWeek'])
  })

  it('displays the FULL engine set for a kept row, not only the selected engine', () => {
    const res = computePlacementMatchback(
      [placement()],
      [citation({ engines: ['Google', 'ChatGPT', 'Perplexity'] })],
      ['ChatGPT'],
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].aiEnginesCiting.sort()).toEqual(['ChatGPT', 'Google', 'Perplexity'])
  })

  it('returns an empty table but the correct all-time denominator when nothing is cited in the period', () => {
    const res = computePlacementMatchback(
      [placement(), placement({ domain: 'prweek.com' }), placement({ domain: 'techround.co.uk' })],
      [], // no citations in this period
      null,
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
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].outlet).toBe("O'Dwyer's PR")
  })

  it('passes through outlet, headline, link, and publicationDate to the row', () => {
    const res = computePlacementMatchback(
      [placement({ outlet: 'PRWeek', headline: 'Big News', link: 'https://prweek.com/x', publicationDate: '2025-06-25', domain: 'prweek.com' })],
      [citation({ domain: 'prweek.com' })],
      null,
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
    )
    expect(res.citedCount).toBe(res.rows.length)
    expect(res.citedCount).toBe(2)
    expect(res.totalPlacements).toBe(3)
  })

  it('handles an empty placement list', () => {
    const res = computePlacementMatchback([], [citation()], null)
    expect(res.rows).toHaveLength(0)
    expect(res.totalPlacements).toBe(0)
  })
})
