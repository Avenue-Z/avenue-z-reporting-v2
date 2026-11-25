// The check behind entering a delivered report's media counts and top authors (plan 2026-11-24, Unit D). Made-up names
// and numbers only (the repo is public).
import { describe, expect, test } from 'vitest'
import { checkReportEntry } from './report-entry'
import type { SlExport } from './types'

const upload: SlExport = {
  version: 1, topic: 'brand', month: '2026-10', results: 30, daily: [], sentiment: { pos: 20, neu: 5, neg: 5 }, themes: [],
  sentimentByMedia: [
    { media: 'Facebook', pos: 8, neu: 1, neg: 1 }, { media: 'Online News Other', pos: 9, neu: 1, neg: 0 }, { media: 'Other', pos: 3, neu: 3, neg: 4 },
  ],
  influencers: [
    { authorId: 'id-ig', name: 'madeupbrand', network: 'SOCIALMEDIA_INSTAGRAM', posts: 9, pos: 9, neu: 0, neg: 0, reach: 1, engagement: 1 },
    { authorId: 'id-fb', name: 'Made Up Brand', network: 'SOCIALMEDIA_FACEBOOK', posts: 7, pos: 7, neu: 0, neg: 0, reach: 1, engagement: 1 },
    { authorId: 'id-li', name: 'Made Up Brand', network: 'SOCIALMEDIA_LINKEDIN', posts: 3, pos: 3, neu: 0, neg: 0, reach: 1, engagement: 1 },
  ],
}

describe('checkReportEntry', () => {
  test('media names that are in the upload, and authors matched by name and network, pass with their ids', () => {
    const r = checkReportEntry({
      media: [{ media: 'Facebook', count: 12 }, { media: 'Online News Other', count: 40 }],
      authors: [{ name: 'Made Up Brand', network: 'Facebook', posts: 9 }, { name: 'madeupbrand', network: 'Instagram', posts: 11 }],
    }, upload)
    expect(r).toEqual({
      ok: true,
      media: [{ media: 'Facebook', count: 12 }, { media: 'Online News Other', count: 40 }],
      authors: [{ authorId: 'id-fb', name: 'Made Up Brand', network: 'Facebook', posts: 9 }, { authorId: 'id-ig', name: 'madeupbrand', network: 'Instagram', posts: 11 }],
    })
  })

  test('a media name the upload does not have is refused and named, so a misspelling never becomes a silent n/a', () => {
    const r = checkReportEntry({ media: [{ media: 'Facebok', count: 1 }], authors: [] }, upload)
    expect(r).toEqual({ ok: false, errors: ['media "Facebok" is not a media type in the 2026-10 upload'] })
  })

  test('an author with no single match by name and network is refused and named', () => {
    const r = checkReportEntry({ media: [], authors: [{ name: 'Made Up Brand', network: 'YouTube', posts: 1 }] }, upload)
    expect(r).toEqual({ ok: false, errors: ['author "Made Up Brand" on YouTube is not in the 2026-10 upload'] })
  })

  test.each([
    [{ media: [{ media: 'Facebook', count: -1 }], authors: [] }, 'media "Facebook" needs a whole count of 0 or more'],
    [{ media: [{ media: 'Facebook', count: 1.5 }], authors: [] }, 'media "Facebook" needs a whole count of 0 or more'],
    [{ media: [{ media: 'Facebook', count: 1 }, { media: 'Facebook', count: 2 }], authors: [] }, 'media "Facebook" is listed twice'],
    [{ media: [], authors: [{ name: 'madeupbrand', network: 'Instagram', posts: 0.5 }] }, 'author "madeupbrand" needs a whole post count of 0 or more'],
    [{ media: 'x', authors: [] }, 'media must be a list'],
  ])('a malformed entry is refused: %j', (entry, error) => {
    expect(checkReportEntry(entry as never, upload)).toEqual({ ok: false, errors: [error] })
  })

  test('every problem is listed at once, so one run shows them all', () => {
    const r = checkReportEntry({ media: [{ media: 'Nope', count: 1 }, { media: 'Facebook', count: -1 }], authors: [{ name: 'Nobody', network: 'X', posts: 1 }] }, upload)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors).toHaveLength(3)
  })
})
