// lib/organic-social/aeo-informed/index.test.ts
import { describe, it, expect } from 'vitest'
import { getAeoInformedSocial, AeoPullError, PeecSelectorError, PeecBrandError, UNVERIFIED } from './index'
import { PeecHttpError } from './peec-read'
import { OWN, GLOBEX, urlRow, OWN_URL, THIRD, GLOBEX_URL, GAP_B, GAP_C, BY_DAY, world, views, input } from './test-world'
import { inspectAeoInformedSocial } from './inspect'
import { AeoGateError } from './gate'
import type { Body } from './test-world'

describe('getAeoInformedSocial: the full flow', () => {
  it('builds the tables with deltas against the previous window and chats from the brands report', async () => {
    const w = world()
    const r = await getAeoInformedSocial(input(w.reader))
    expect(r.socialsAll.map((x) => [x.rank, x.url, x.retrievals, x.retrievalsDelta])).toEqual([
      [1, OWN_URL, 20, 17], [2, THIRD, 7, null], [3, GLOBEX_URL, 4, null],
    ])
    expect(r.socialsAll[0].retrievedPct).toBeCloseTo(20 / 3000, 12)
    expect(r.socialsAll[0].retrievedPctDelta).toBeCloseTo(20 / 3000 - 3 / 3000, 12)
    expect(r.socialsAll[0]).toMatchObject({ isOwnChannel: true, ownBrandMentioned: true, domainType: 'Organic Social', totalCitations: 8, totalCitationsDelta: 7 })
    expect(r.socialsOwn.map((x) => x.url)).toEqual([OWN_URL])
    expect(r.socialsCompetitor.map((x) => x.url)).toEqual([GLOBEX_URL])
  })

  it('builds URL Gaps from the gap-filtered pull for its own window, ties broken by URL', async () => {
    const r = await getAeoInformedSocial(input(world().reader))
    expect(r.urlGaps.map((g) => [g.rank, g.url, g.retrievals])).toEqual([[1, GAP_B, 6], [2, THIRD, 6], [3, GAP_C, 2]])
    expect(r.urlGaps[1]).toMatchObject({ retrievalsDelta: 4, totalCitations: 3, totalCitationsDelta: 2, mentionedBrandNames: 'Globex' })
    expect(r.urlGaps[1].citationPosition).toBe(3)
    expect(r.urlGaps.map((g) => g.citationShare)).toEqual([0.4, 0.6, 0])
    expect(r.urlGaps[2].citationPosition).toBeNull()
  })

  it('builds the four graphs, each from its own start date', async () => {
    const r = await getAeoInformedSocial(input(world().reader))
    const g = (id: string) => r.graphs.filter((p) => p.graphId === id)
    expect(g('citations_all')).toHaveLength(12)
    expect(g('citations_all')[0].weekStart).toBe('2026-08-14')
    expect(g('citations_linkedin').map((p) => p.value)).toEqual([5, 0, 1, 0])
    expect(g('citations_instagram').every((p) => p.value === null)).toBe(true)
    expect(g('used_as_source_all')).toHaveLength(4)
    expect(g('used_as_source_all')[0].value).toBeCloseTo(2 / 700, 12)
    expect(r.graphs.map((p) => p.graphId)).toEqual([...r.graphs.map((p) => p.graphId)].sort((a, b) => ['used_as_source_all', 'citations_all', 'citations_linkedin', 'citations_instagram'].indexOf(a) - ['used_as_source_all', 'citations_all', 'citations_linkedin', 'citations_instagram'].indexOf(b)))
  })

  it('fills meta: windows, ids, chats, counts, the four unverified ids, and never the api key', async () => {
    const r = await getAeoInformedSocial(input(world().reader))
    expect(r.meta.windows).toEqual({ socials: views.socials, socialsPrior: { start: '2026-09-07', end: '2026-10-06' }, gaps: views.gaps, gapsPrior: { start: '2026-08-02', end: '2026-08-31' } })
    expect(r.meta).toMatchObject({ ownBrandId: OWN, ownBrandName: 'Example', selector: { name: 'Organic Social', via: 'classification', id: null } })
    expect(r.meta.chats).toEqual({ socials: 3000, socialsPrior: 3000, gaps: 3000, gapsPrior: 3000 })
    expect(r.meta.counts).toMatchObject({ socialsAll: 3, socialsOwn: 1, socialsCompetitor: 1, urlGaps: 3 })
    expect(r.meta.unverified).toEqual(['url_gaps_item_count', 'url_gaps_sort_order', 'competitor_table_definition', 'own_channel_non_linkedin_and_competitor_matching', 'pdf_columns_cropped'])
    expect(r.meta.unverified).toEqual([...UNVERIFIED])
    expect(UNVERIFIED).toHaveLength(5)
    expect(JSON.stringify(r)).not.toContain('SECRET')
  })
})

describe('getAeoInformedSocial: what it asks Peec', () => {
  it('runs one request at a time through one reader, in a fixed order', async () => {
    const w = world()
    await getAeoInformedSocial(input(w.reader))
    expect(w.maxInFlight()).toBe(1)
    const order = w.calls.map((c) => c.label?.split(' ')[0])
    const steps = ['brands', 'social-channels', 'domain-classifications', 'socials-by-day', 'gaps-current', 'gaps-prior', 'used-chat-level', 'chats-by-day']
    const first = steps.map((x) => order.indexOf(x))
    expect(first.every((i) => i >= 0)).toBe(true)
    expect([...first].sort((x, y) => x - y)).toEqual(first)
  })

  it('pulls the selector by-day over the span of every window it needs, in 31-day chunks', async () => {
    const w = world()
    await getAeoInformedSocial(input(w.reader))
    const sel = w.calls.filter((c) => c.label?.startsWith('socials-by-day'))
    expect(sel.map((c) => [c.body!.start_date, c.body!.end_date])).toEqual([['2026-08-14', '2026-09-13'], ['2026-09-14', '2026-10-14'], ['2026-10-15', '2026-11-08']])
    expect(sel[0].body).toMatchObject({ dimensions: ['date'], filters: [{ field: 'domain_classification', operator: 'in', values: ['Organic Social'] }], limit: 10000, offset: 0 })
  })

  it('adds the gap filter for URL Gaps, the chat id dimension for used-as-source, and the own brand filter for chats', async () => {
    const w = world()
    await getAeoInformedSocial(input(w.reader))
    const gaps = w.calls.filter((c) => c.label?.startsWith('gaps-'))
    // the outline's table lists Peec's own rows for the window, so each window is its own request with no date dimension (a by-day pull splits rows by day)
    expect(gaps.map((c) => [c.label, c.body!.start_date, c.body!.end_date])).toEqual([['gaps-current 2026-09-01..2026-09-30', '2026-09-01', '2026-09-30'], ['gaps-prior 2026-08-02..2026-08-31', '2026-08-02', '2026-08-31']])
    for (const gap of gaps) {
      expect(gap.body!.filters).toEqual([{ field: 'domain_classification', operator: 'in', values: ['Organic Social'] }, { field: 'gap', operator: 'gte', value: 1 }])
      expect(gap.body!.dimensions).toBeUndefined()
      expect(gap.body).toMatchObject({ limit: 10000, offset: 0 })
    }
    const chat = w.calls.find((c) => c.label?.startsWith('used-chat-level'))!
    expect(chat.body).toMatchObject({ dimensions: ['date', 'chat_id'], start_date: '2026-09-03', end_date: '2026-09-16' })
    const brands = w.calls.find((c) => c.path === '/reports/brands')!
    expect(brands.body).toMatchObject({ dimensions: ['date'], filters: [{ field: 'brand_id', operator: 'in', values: [OWN] }] })
  })

  it('never calls anything but the allowlisted reads', async () => {
    const w = world()
    await getAeoInformedSocial(input(w.reader))
    const ok = new Set(['GET /brands', 'GET /brands/social-channels', 'GET /classifications/domains', 'POST /reports/urls', 'POST /reports/brands'])
    expect(w.calls.every((c) => ok.has(`${c.method} ${c.path}`))).toBe(true)
  })
})

describe('getAeoInformedSocial: chunk sizes, as-of and warnings', () => {
  it('pulls the chat-level rows in 14-day chunks, because they are denser than by-day rows', async () => {
    const w = world()
    await getAeoInformedSocial(input(w.reader))
    const chunks = w.calls.filter((c) => c.label?.startsWith('used-chat-level')).map((c) => [c.body!.start_date, c.body!.end_date])
    expect(chunks).toEqual([['2026-09-03', '2026-09-16'], ['2026-09-17', '2026-09-30']])
  })
  it('rejects, before any call, a socials or gaps window that ends after asOf', async () => {
    for (const v of [{ ...views, socials: { start: '2026-10-07', end: '2026-11-09' } }, { ...views, gaps: { start: '2026-09-01', end: '2026-11-09' } }]) {
      const w = world()
      await expect(getAeoInformedSocial(input(w.reader, { views: v }))).rejects.toBeInstanceOf(RangeError)
      expect(w.calls).toHaveLength(0)
    }
  })
  it('days before the project\'s first chat data only warn', async () => {
    const r = await getAeoInformedSocial(input(world({ chatDaysMissing: ['2026-08-02', '2026-08-03'] }).reader))
    expect(r.meta.warnings).toContain('days with no chats data in window: gapsPrior (2)')
    expect(r.meta.gate.errors).toEqual([])
  })
  it('a day with no chat count inside a window, once the project has chat data, is refused: it would shrink the denominator', async () => {
    const e = (await getAeoInformedSocial(input(world({ chatDaysMissing: ['2026-09-12'] }).reader)).catch((x) => x)) as AeoGateError
    expect(e).toBeInstanceOf(AeoGateError)
    expect(e.report.errors.some((v) => v.code === 'view.chat-days')).toBe(true)
  })
  it('counts the by-day rows, the gap rows, the chat-level rows and the chat-day rows separately', async () => {
    const r = await getAeoInformedSocial(input(world().reader))
    expect(r.meta.counts).toMatchObject({ selectorRowsByDay: 5, gapRows: 4, usedChatRows: 2 })
    expect(r.meta.counts.chatDayRows).toBeGreaterThan(80)
    expect(r.meta.counts.requests).toBeGreaterThan(8)
  })
})

describe('getAeoInformedSocial: window edges are inclusive and nothing leaks across them', () => {
  const edge = (date: string, n: number) => urlRow('https://www.linkedin.com/pulse/edge', date, { channel_title: 'Example Life', retrieval_count: n, citation_count: n, mentioned_brands: [{ id: GLOBEX }] })
  it('counts the first and last day of the current and previous windows, and nothing outside them', async () => {
    const byDay = [edge('2026-09-06', 1), edge('2026-09-07', 2), edge('2026-10-06', 4), edge('2026-10-07', 8), edge('2026-11-05', 16), edge('2026-11-06', 32)]
    const r = await getAeoInformedSocial(input(world({ byDay }).reader))
    expect(r.socialsAll).toHaveLength(1)
    expect(r.socialsAll[0]).toMatchObject({ retrievals: 24, retrievalsDelta: 18, totalCitations: 24, totalCitationsDelta: 18 })
  })
  it('does the same for the gaps window and its previous window', async () => {
    const gapRows = [edge('2026-08-01', 1), edge('2026-08-02', 2), edge('2026-08-31', 4), edge('2026-09-01', 8), edge('2026-09-30', 16), edge('2026-10-01', 32)]
    const r = await getAeoInformedSocial(input(world({ gapRows }).reader))
    expect(r.urlGaps[0]).toMatchObject({ retrievals: 24, retrievalsDelta: 18 })
  })
})

describe('getAeoInformedSocial: URL gaps are pulled per window', () => {
  it('the previous window is its own pull, so a URL keeps its own prior numbers and the counts add both pulls', async () => {
    const r = await getAeoInformedSocial(input(world().reader))
    const third = r.urlGaps.find((g) => g.url === THIRD)!
    expect(third).toMatchObject({ retrievals: 6, totalCitations: 3, retrievalsDelta: 4, totalCitationsDelta: 2 })
    expect(r.meta.counts.gapRows).toBe(3 + 1)
  })
  it('a URL cited on several days of the window is one row with the days added', async () => {
    const day = (d: string, n: number) => urlRow(GAP_B, d, { channel_title: 'Some Author', retrieval_count: n, citation_count: n, mentioned_brands: [{ id: GLOBEX }] })
    const r = await getAeoInformedSocial(input(world({ gapRows: [day('2026-09-02', 1), day('2026-09-09', 2), day('2026-09-20', 4)] }).reader))
    expect(r.urlGaps).toHaveLength(1)
    expect(r.urlGaps[0]).toMatchObject({ retrievals: 7, totalCitations: 7, retrievalsDelta: null })
  })
})

describe('getAeoInformedSocial: URL gaps keep the rows Peec returns', () => {
  it('a URL that comes back as two rows is two table rows, and the gate accepts it', async () => {
    const mk = (d: string, n: number, who: string) => urlRow(GAP_B, d, { channel_title: 'Some Author', retrieval_count: n, citation_count: 0, mentioned_brands: [{ id: who }] })
    const r = await getAeoInformedSocial(input(world({ gapRows: [mk('2026-09-02', 9, GLOBEX), mk('2026-09-09', 5, 'b_initech'), mk('2026-09-10', 3, GLOBEX)], brands: [{ id: OWN, name: 'Example', is_own: true }, { id: GLOBEX, name: 'Globex', is_own: false }, { id: 'b_initech', name: 'Initech', is_own: false }] }).reader))
    expect(r.urlGaps.map((g) => [g.url, g.retrievals])).toEqual([[GAP_B, 12], [GAP_B, 5]])
    expect(r.urlGaps.map((g) => g.rank)).toEqual([1, 2])
    expect(r.meta.gate.errors).toEqual([])
  })
})

describe('getAeoInformedSocial: the selector', () => {
  it('by tag looks up the source tag id and filters on domain_tag_id', async () => {
    const w = world()
    const r = await getAeoInformedSocial(input(w.reader, { selector: { name: 'Organic Social', via: 'tag' } }))
    expect(w.calls.some((c) => c.path === '/source-tags')).toBe(true)
    expect(w.calls.find((c) => c.label?.startsWith('socials-by-day'))!.body!.filters![0]).toEqual({ field: 'domain_tag_id', operator: 'in', values: ['stg_1'] })
    expect(r.meta.selector).toEqual({ name: 'Organic Social', via: 'tag', id: 'stg_1' })
  })
  it('a missing name throws a selector error that lists what exists, and nothing is pulled after it', async () => {
    const w = world({ classes: [{ name: 'Editorial - Trade' }] })
    const e = (await getAeoInformedSocial(input(w.reader)).catch((x) => x)) as PeecSelectorError
    expect(e).toBeInstanceOf(PeecSelectorError)
    expect(e.message).toContain('Organic Social')
    expect(e.message).toContain('Editorial - Trade')
    expect(w.calls.some((c) => c.path === '/reports/urls')).toBe(false)
  })
})

describe('getAeoInformedSocial: brands', () => {
  it('no own brand is an error', async () => {
    const w = world({ brands: [{ id: GLOBEX, name: 'Globex', is_own: false }] })
    await expect(getAeoInformedSocial(input(w.reader))).rejects.toBeInstanceOf(PeecBrandError)
  })
  it('two own brands is an error', async () => {
    const w = world({ brands: [{ id: 'a', name: 'A', is_own: true }, { id: 'b', name: 'B', is_own: true }] })
    await expect(getAeoInformedSocial(input(w.reader))).rejects.toBeInstanceOf(PeecBrandError)
  })
  it('a classifications or source-tag list that exactly fills its limit may be truncated, so it throws', async () => {
    const classes = Array.from({ length: 1000 }, (_, i) => ({ name: 'C' + i }))
    await expect(getAeoInformedSocial(input(world({ classes }).reader))).rejects.toThrow(/1000/)
    const tags = Array.from({ length: 1000 }, (_, i) => ({ id: 'stg_' + i, name: 'T' + i }))
    await expect(getAeoInformedSocial(input(world({ tags }).reader, { selector: { name: 'T1', via: 'tag' } }))).rejects.toThrow(/1000/)
  })
  it('a 401 on the first call comes back as an AeoPullError that wraps the 401 and names the pull', async () => {
    const w = world({ failOn: (p) => p === '/brands', failStatus: 401 })
    const e = (await getAeoInformedSocial(input(w.reader)).catch((x) => x)) as AeoPullError
    expect(e).toBeInstanceOf(AeoPullError)
    expect(e.label).toBe('brands')
    expect((e.cause as PeecHttpError).status).toBe(401)
    expect(w.calls).toHaveLength(1)
  })
  it('a brands list that exactly fills its limit may be truncated, so it throws', async () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({ id: 'x' + i, name: 'N' + i, is_own: i === 0 }))
    await expect(getAeoInformedSocial(input(world({ brands: many }).reader))).rejects.toThrow(/1000/)
  })
})

describe('getAeoInformedSocial: failure behavior', () => {
  it('rejects before any call on a bad window, a start after the end, or weeks below 1', async () => {
    for (const bad of [
      { ...views, socials: { start: '2026-11-05', end: '2026-10-07' } },
      { ...views, gaps: { start: '2026-9-1', end: '2026-09-30' } },
      { ...views, graphs: { ...views.graphs, citations_all: { from: '2026-08-14', weeks: 0 } } },
    ]) {
      const w = world()
      await expect(getAeoInformedSocial(input(w.reader, { views: bad }))).rejects.toBeInstanceOf(RangeError)
      expect(w.calls).toHaveLength(0)
    }
  })
  it('a failing pull rejects the whole call with an error that names the pull, the window and the cause; no partial result', async () => {
    const w = world({ failOn: (p, b) => p === '/reports/urls' && (b?.filters ?? []).some((f) => f.field === 'gap') })
    const e = (await getAeoInformedSocial(input(w.reader)).catch((x) => x)) as AeoPullError
    expect(e).toBeInstanceOf(AeoPullError)
    expect(e.label).toBe('gaps-current')
    expect(e.message).toContain('gaps-current')
    expect(e.message).toContain('2026-09-01')
    expect(e.message).toContain('PeecHttpError')
    expect(e.cause).toBeInstanceOf(PeecHttpError)
    expect(e.message).not.toContain('SECRET')
  })
  it('a shape error names the pull too', async () => {
    const w = world({ byDay: [{ ...BY_DAY[0], citation_count: 'x' }] })
    const e = (await getAeoInformedSocial(input(w.reader)).catch((x) => x)) as AeoPullError
    expect(e).toBeInstanceOf(AeoPullError)
    expect(e.message).toContain('citation_count')
    expect(e.label).toBe('socials-by-day')
  })
  it('zero chats in the previous window gives a null percentage change and a warning, not NaN', async () => {
    const w = world()
    const orig = w.reader.post
    w.reader.post = async (p, rb, l) => { const b = rb as Body; return (p === '/reports/brands' ? { data: Array.from({ length: 100 }, (_, i) => { const d = new Date(Date.parse(b.start_date + 'T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10); return d <= b.end_date ? { date: d, visibility_total: d >= '2026-10-07' ? 100 : 0 } : null }).filter(Boolean) } : orig(p, b, l)) }
    const r = (await inspectAeoInformedSocial(input(w.reader))).result
    expect(r.socialsAll[0].retrievedPctDelta).toBeNull()
    expect(r.socialsAll[0].retrievalsDelta).toBe(17)
    expect(r.meta.warnings.some((x) => x.includes('no chats in window: socialsPrior'))).toBe(true)
  })
  it('no rows after the selector is a valid empty result with zero counts', async () => {
    const r = await getAeoInformedSocial(input(world({ byDay: [] }).reader))
    expect(r.socialsAll).toEqual([])
    expect(r.socialsOwn).toEqual([])
    expect(r.meta.counts).toMatchObject({ socialsAll: 0, selectorRowsByDay: 0 })
    expect(r.graphs.filter((p) => p.graphId === 'citations_linkedin').every((p) => p.value === null)).toBe(true)
  })
})

describe('team feedback 2026-11-12: citation rate and brand colors', () => {
  it('meta.brands lists every brand with its color, null when Peec gives none', async () => {
    const w = world({ brands: [{ id: OWN, name: 'Example', is_own: true, color: '#60FDFF' }, { id: GLOBEX, name: 'Globex', is_own: false }] })
    const r = await getAeoInformedSocial(input(w.reader))
    expect(r.meta.brands).toEqual([
      { id: OWN, name: 'Example', color: '#60FDFF', isOwn: true },
      { id: GLOBEX, name: 'Globex', color: null, isOwn: false },
    ])
  })
  it('a socials row carries its citation rate and its change, and the result passes the gate', async () => {
    const r = await getAeoInformedSocial(input(world().reader))
    expect(r.socialsAll[0].citationRate).toBeCloseTo(8 / 20, 12)
    expect(r.socialsAll[0].citationRateDelta).toBeCloseTo(8 / 20 - 1 / 3, 12)
    expect(r.socialsAll[0].mentionedBrandIds).toBe(OWN)
  })
})

describe('team feedback 2026-11-12: totals over your channels', () => {
  it('totals are over the own table, with the previous window recounted from its own rows', async () => {
    const r = await getAeoInformedSocial(input(world().reader))
    expect(r.totals).toEqual({ urlsCited: 1, retrievals: 20, citations: 8, citationRate: 0.4, prior: { urlsCited: 1, retrievals: 3, citations: 1, citationRate: 1 / 3 } })
  })
  it('the previous window counts an own URL cited only then, and leaves out other brands\' URLs', async () => {
    const extra = [
      urlRow('https://www.linkedin.com/pulse/own-2', '2026-09-25', { channel_title: 'Example Life', retrieval_count: 4, citation_count: 2 }),
      urlRow('https://www.linkedin.com/company/globex/posts/1', '2026-09-26', { channel_title: 'Globex', retrieval_count: 9, citation_count: 9 }),
    ]
    const r = await getAeoInformedSocial(input(world({ byDay: [...BY_DAY, ...extra] }).reader))
    expect(r.totals.prior).toEqual({ urlsCited: 2, retrievals: 7, citations: 3, citationRate: 3 / 7 })
    expect(r.totals).toMatchObject({ urlsCited: 1, retrievals: 20, citations: 8 })
  })
  it('a URL whose rows disagree on the channel is owned by the title urls.ts picks, and the gate recount agrees (no gate error)', async () => {
    // own-3 in the previous window: a row with no title (skipped), then a tie on retrievals between Globex and Example Life, which goes to the smaller title
    const own3 = 'https://www.linkedin.com/pulse/own-3'
    const extra = [
      urlRow(own3, '2026-09-21', { channel_title: null, retrieval_count: 5, citation_count: 1 }),
      urlRow(own3, '2026-09-22', { channel_title: 'Globex', retrieval_count: 2, citation_count: 0 }),
      urlRow(own3, '2026-09-23', { channel_title: 'Example Life', retrieval_count: 2, citation_count: 0 }),
    ]
    const r = await getAeoInformedSocial(input(world({ byDay: [...BY_DAY, ...extra] }).reader))
    expect(r.totals.prior).toEqual({ urlsCited: 2, retrievals: 12, citations: 2, citationRate: 2 / 12 })
  })
})

describe('minCompetitors: the URL Gaps min competitors control', () => {
  const INITECH = 'b_initech'
  const threeBrands = [{ id: OWN, name: 'Example', is_own: true }, { id: GLOBEX, name: 'Globex', is_own: false }, { id: INITECH, name: 'Initech', is_own: false }]
  // GAP_B is mentioned by two competitors; THIRD and GAP_C by one.
  const gapRows = [
    urlRow(THIRD, '2026-09-10', { channel_title: 'Some Author', retrieval_count: 6, citation_count: 3, mentioned_brands: [{ id: GLOBEX }] }),
    urlRow(GAP_B, '2026-09-12', { channel_title: 'Some Author', retrieval_count: 6, citation_count: 2, mentioned_brands: [{ id: GLOBEX }, { id: INITECH }] }),
    urlRow(GAP_B, '2026-08-12', { channel_title: 'Some Author', retrieval_count: 1, citation_count: 1, mentioned_brands: [{ id: GLOBEX }, { id: INITECH }] }),
    urlRow(GAP_C, '2026-09-15', { channel_title: 'Some Author', retrieval_count: 2, citation_count: 0, mentioned_brands: [{ id: GLOBEX }] }),
  ]
  const gapValues = (w: ReturnType<typeof world>) => w.calls.flatMap((c) => (c.body?.filters ?? []).filter((f) => f.field === 'gap').map((f) => [f.operator, f.value]))

  it('default sends gap gte 1 in both gap pulls (today\'s request bodies unchanged)', async () => {
    const w = world()
    const r = await getAeoInformedSocial(input(w.reader))
    expect(gapValues(w)).toEqual([['gte', 1], ['gte', 1]])
    expect(r.meta.minCompetitors).toBe(1)
  })
  it('minCompetitors 2 sends gap gte 2 in both gap pulls, keeps only rows with two competitors, and passes the gate', async () => {
    const w = world({ brands: threeBrands, gapRows })
    const r = await getAeoInformedSocial(input(w.reader, { minCompetitors: 2 }))
    expect(gapValues(w)).toEqual([['gte', 2], ['gte', 2]])
    expect(r.urlGaps.map((g) => [g.url, g.mentionedBrandCount, g.citationShare])).toEqual([[GAP_B, 2, 1]])
    expect(r.urlGaps[0]).toMatchObject({ retrievals: 6, retrievalsDelta: 5 })
    expect(r.meta.minCompetitors).toBe(2)
  })
  it('minCompetitors 0, 6, 2.5 or a string is a RangeError before any request', async () => {
    for (const bad of [0, 6, 2.5, '2', null]) {
      const w = world()
      await expect(getAeoInformedSocial(input(w.reader, { minCompetitors: bad }))).rejects.toThrow(RangeError)
      expect(w.calls).toEqual([])
    }
  })
})

describe('fourthGraph: Instagram or TikTok as the fourth graph', () => {
  const TIKTOK_URL = 'https://www.tiktok.com/@example/video/1'
  const channels = [
    { brand_id: OWN, platform: 'linkedin', channel_handle: 'company/examplebenefits' },
    { brand_id: OWN, platform: 'tiktok', channel_handle: '@example' },
    { brand_id: GLOBEX, platform: 'linkedin', channel_handle: 'company/globex' },
  ]
  const byDay = [...BY_DAY, urlRow(TIKTOK_URL, '2026-10-26', { channel_title: 'Example Life', retrieval_count: 5, citation_count: 4 })]
  const tiktokViews = { ...views, graphs: { used_as_source_all: views.graphs.used_as_source_all, citations_all: views.graphs.citations_all, citations_linkedin: views.graphs.citations_linkedin, citations_tiktok: views.graphs.citations_instagram } }

  it('fourthGraph tiktok builds citations_tiktok fourth from TikTok rows, and no citations_instagram, and passes the gate', async () => {
    const r = await getAeoInformedSocial(input(world({ channels, byDay }).reader, { fourthGraph: 'tiktok', views: tiktokViews }))
    expect([...new Set(r.graphs.map((p) => p.graphId))]).toEqual(['used_as_source_all', 'citations_all', 'citations_linkedin', 'citations_tiktok'])
    const tt = r.graphs.filter((p) => p.graphId === 'citations_tiktok')
    expect(tt.map((p) => p.value)).toEqual([4, 0, 0])
    expect(r.meta.fourthGraph).toBe('tiktok')
  })
  it('the default is instagram', async () => {
    const r = await getAeoInformedSocial(input(world().reader))
    expect(r.meta.fourthGraph).toBe('instagram')
    expect(r.graphs.some((p) => p.graphId === 'citations_tiktok')).toBe(false)
  })
  it('fourthGraph linkedin (already graph 3), youtube or reddit is a RangeError before any request', async () => {
    for (const bad of ['linkedin', 'youtube', 'reddit', 'TikTok']) {
      const w = world()
      await expect(getAeoInformedSocial(input(w.reader, { fourthGraph: bad }))).rejects.toThrow(RangeError)
      expect(w.calls).toEqual([])
    }
  })
  it('views.graphs must hold exactly the four graphs drawn: a missing or an extra graph is a RangeError', async () => {
    await expect(getAeoInformedSocial(input(world().reader, { fourthGraph: 'tiktok' }))).rejects.toThrow(/citations_tiktok is missing/)
    await expect(getAeoInformedSocial(input(world().reader, { fourthGraph: 'tiktok', views: { ...tiktokViews, graphs: { ...tiktokViews.graphs, citations_instagram: views.graphs.citations_instagram } } }))).rejects.toThrow(/citations_instagram is not drawn/)
  })
})

describe('Review Focus 3: a window whose previous window lies before the project\'s first data day', () => {
  it('returns a result, with the previous window\'s no-chats as a warning, no changes and no previous totals', async () => {
    const allTime = { start: '2026-09-01', end: '2026-11-05' }
    const r = await getAeoInformedSocial(input(world({ chatsFrom: '2026-09-01' }).reader, { views: { ...views, socials: allTime, gaps: allTime } }))
    expect(r.meta.chats.socialsPrior).toBe(0)
    expect(r.meta.gate.warnings.map((v) => v.code)).toContain('view.no-chats-previous')
    expect(r.socialsAll.every((x) => x.retrievalsDelta === null && x.citationRateDelta === null)).toBe(true)
    expect(r.totals.prior).toBeNull()
  })
})

// Issue 451 (Paul, PR 444): YTD and All time never show a change (aeo-tab/params.ts, previousDays null), so the tab asks for no previous
// window. The views here are the tab's shape: both tables over one window and every graph from its start (aeo-tab/load.ts adapterInput).
describe('compare false: no previous window is pulled or returned', () => {
  const W = { start: '2026-10-07', end: '2026-11-05' }
  const G = { from: '2026-10-07', weeks: 5 }
  const tabViews = { socials: W, gaps: W, graphs: { used_as_source_all: G, citations_all: G, citations_linkedin: G, citations_instagram: G } }
  const run = async (compare?: boolean) => {
    const w = world()
    const r = await getAeoInformedSocial(input(w.reader, { views: tabViews, ...(compare === undefined ? {} : { compare }) }))
    const starts = (step: string) => w.calls.filter((c) => c.label?.startsWith(step)).map((c) => c.body!.start_date)
    return { r, w, starts }
  }
  const noChange = (rows: Record<string, unknown>[]) => rows.map((x) => Object.fromEntries(Object.entries(x).filter(([k]) => !k.endsWith('Delta'))))

  it('asks Peec for nothing before the window: no gaps-prior pull, and the by-day and chat pulls start at the window', async () => {
    const on = await run(true)
    expect(on.starts('gaps-prior')).toEqual(['2026-09-07'])
    expect(on.starts('socials-by-day')[0]).toBe('2026-09-07')
    expect(on.starts('chats-by-day')[0]).toBe('2026-09-07')
    const off = await run(false)
    expect(off.w.calls.some((c) => c.label?.startsWith('gaps-prior'))).toBe(false)
    expect(off.starts('socials-by-day')[0]).toBe('2026-10-07')
    expect(off.starts('chats-by-day')[0]).toBe('2026-10-07')
    expect(off.w.calls.length).toBeLessThan(on.w.calls.length)
    expect(off.r.meta.counts.requests).toBe(off.w.calls.length)
  })
  it('shows exactly what compare true shows, with every change, previous window, previous chat count and previous total empty', async () => {
    const on = (await run(true)).r
    const off = (await run(false)).r
    for (const k of ['socialsAll', 'socialsOwn', 'socialsCompetitor', 'urlGaps'] as const) {
      expect(noChange(off[k] as never)).toEqual(noChange(on[k] as never))
      expect((off[k] as Record<string, unknown>[]).every((x) => Object.entries(x).every(([key, v]) => !key.endsWith('Delta') || v === null))).toBe(true)
    }
    expect(off.graphs).toEqual(on.graphs)
    expect({ ...off.totals, prior: 'set aside' }).toEqual({ ...on.totals, prior: 'set aside' })
    expect(off.totals.prior).toBeNull()
    expect(off.meta.compare).toBe(false)
    expect(on.meta.compare).toBe(true)
    expect(off.meta.windows).toEqual({ socials: W, socialsPrior: null, gaps: W, gapsPrior: null })
    expect(off.meta.chats.socialsPrior).toBeNull()
    expect(off.meta.chats.gapsPrior).toBeNull()
    expect(off.meta.chats.socials).toBe(on.meta.chats.socials)
    expect(off.meta.gate.warnings.map((v) => v.code)).not.toContain('view.no-chats-previous')
  })
  it('compare is true when absent, exactly as before', async () => {
    const r = (await run()).r
    expect(r.meta.compare).toBe(true)
    expect(r.meta.windows.socialsPrior).toEqual({ start: '2026-09-07', end: '2026-10-06' })
  })
  it('a compare that is not true or false is a RangeError before any request', async () => {
    for (const bad of [null, 'false', 0]) {
      const w = world()
      await expect(getAeoInformedSocial(input(w.reader, { views: tabViews, compare: bad }))).rejects.toThrow(/compare must be true or false/)
      expect(w.calls).toEqual([])
    }
  })
})
