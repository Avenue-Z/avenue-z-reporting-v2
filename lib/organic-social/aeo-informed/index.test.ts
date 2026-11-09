// lib/organic-social/aeo-informed/index.test.ts
import { describe, it, expect } from 'vitest'
import { getAeoInformedSocial, AeoPullError, PeecSelectorError, PeecBrandError, UNVERIFIED } from './index'
import { PeecHttpError } from './peec-read'
import type { PeecReader } from './peec-read'

type Filter = { field: string; operator?: string; values?: unknown[]; value?: unknown }
type Body = { start_date: string; end_date: string; filters?: Filter[]; dimensions?: string[]; [k: string]: unknown }
type Row = Record<string, unknown> & { date: string }
const OWN = 'b_own', GLOBEX = 'b_globex'
const urlRow = (url: string, date: string, o: Record<string, unknown> = {}) => ({
  url, date, classification: 'ARTICLE', title: 'T ' + url.slice(-6), channel_title: null, citation_count: 0, retrieval_count: 1, citation_rate: 0,
  citation_position: null, citation_position_sum: 0, citation_position_count: 0, mentioned_brands: [], ...o,
})
const OWN_URL = 'https://www.linkedin.com/pulse/own-1'
const THIRD = 'https://www.linkedin.com/pulse/third'
const GLOBEX_URL = 'https://www.linkedin.com/company/globex'
const BY_DAY = [
  urlRow(OWN_URL, '2026-09-04', { channel_title: 'Example Life', retrieval_count: 10, citation_count: 5, mentioned_brands: [{ id: GLOBEX }] }),
  urlRow(OWN_URL, '2026-09-20', { channel_title: 'Example Life', retrieval_count: 3, citation_count: 1 }),
  urlRow(OWN_URL, '2026-10-10', { channel_title: 'Example Life', retrieval_count: 20, citation_count: 8, citation_position_sum: 6, citation_position_count: 3, mentioned_brands: [{ id: OWN }] }),
  urlRow(THIRD, '2026-10-12', { channel_title: 'Some Author', retrieval_count: 7, citation_count: 2 }),
  urlRow(GLOBEX_URL, '2026-10-15', { channel_title: 'Globex', retrieval_count: 4, citation_count: 1 }),
]
const GAP_ROWS = [
  urlRow(THIRD, '2026-09-10', { channel_title: 'Some Author', retrieval_count: 6, citation_count: 3, citation_position_sum: 9, citation_position_count: 3, mentioned_brands: [{ id: GLOBEX }] }),
  urlRow(THIRD, '2026-08-20', { channel_title: 'Some Author', retrieval_count: 2, citation_count: 1, mentioned_brands: [{ id: GLOBEX }] }),
]
const CHAT_ROWS = [
  urlRow(OWN_URL, '2026-09-04', { channel_title: 'Example Life', chat: { id: 'c1' } }),
  urlRow(OWN_URL, '2026-09-05', { channel_title: 'Example Life', chat: { id: 'c2' } }),
]

function world(over: { brands?: Record<string, unknown>[]; classes?: { name: string }[]; tags?: { id: string; name: string }[]; failOn?: (path: string, body?: Body) => boolean; chatsPerDay?: number; byDay?: Row[]; chatDaysMissing?: string[]; gapRows?: Row[]; failStatus?: number } = {}) {
  const calls: { method: string; path: string; body?: Body; label?: string }[] = []
  let inFlight = 0, maxInFlight = 0
  const brands = over.brands ?? [{ id: OWN, name: 'Example', is_own: true }, { id: GLOBEX, name: 'Globex', is_own: false }]
  const reader: PeecReader = {
    async get(path, query, label) {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight)
      calls.push({ method: 'GET', path, body: query as Body, label })
      await Promise.resolve(); inFlight--
      if (over.failOn?.(path)) throw new PeecHttpError(over.failStatus ?? 500, path, 'boom', label)
      if (path === '/brands') return { data: brands }
      if (path === '/brands/social-channels') return { data: [{ brand_id: OWN, platform: 'linkedin', channel_handle: 'company/examplebenefits' }, { brand_id: GLOBEX, platform: 'linkedin', channel_handle: 'company/globex' }] }
      if (path === '/classifications/domains') return { data: over.classes ?? [{ name: 'Organic Social' }, { name: 'Editorial - Trade' }] }
      if (path === '/source-tags') return { data: over.tags ?? [{ id: 'stg_1', name: 'Organic Social' }] }
      throw new Error('unexpected GET ' + path)
    },
    async post(path, rawBody, label) {
      const body = rawBody as Body
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight)
      calls.push({ method: 'POST', path, body, label })
      await Promise.resolve(); inFlight--
      if (over.failOn?.(path, body)) throw new PeecHttpError(over.failStatus ?? 500, path, 'boom', label)
      const within = (d: string) => d >= body.start_date && d <= body.end_date
      if (path === '/reports/brands') {
        const out: Record<string, unknown>[] = []
        for (let t = Date.parse(body.start_date + 'T00:00:00Z'); t <= Date.parse(body.end_date + 'T00:00:00Z'); t += 86_400_000) { const dd = new Date(t).toISOString().slice(0, 10); if (!over.chatDaysMissing?.includes(dd)) out.push({ date: dd, visibility_total: over.chatsPerDay ?? 100 }) }
        return { data: out }
      }
      const hasGap = (body.filters ?? []).some((f) => f.field === 'gap')
      const isChat = (body.dimensions ?? []).includes('chat_id')
      const src = isChat ? CHAT_ROWS : hasGap ? (over.gapRows ?? GAP_ROWS) : (over.byDay ?? BY_DAY)
      return { data: src.filter((r) => within(r.date)) }
    },
  }
  return { reader, calls, maxInFlight: () => maxInFlight }
}

const views = {
  socials: { start: '2026-10-07', end: '2026-11-05' },
  gaps: { start: '2026-09-01', end: '2026-09-30' },
  graphs: {
    citations_all: { from: '2026-08-14', weeks: 12 }, citations_linkedin: { from: '2026-09-03', weeks: 4 },
    citations_instagram: { from: '2026-09-03', weeks: 4 }, used_as_source_all: { from: '2026-09-03', weeks: 4 },
  },
}
const input = (reader: PeecReader, o: Record<string, unknown> = {}) => ({ apiKey: 'skc-SECRET-KEY', projectId: 'or_p', asOf: '2026-11-08', views, reader, ...o }) as Parameters<typeof getAeoInformedSocial>[0]

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

  it('builds URL Gaps from the gap-filtered pull for its own window', async () => {
    const r = await getAeoInformedSocial(input(world().reader))
    expect(r.urlGaps).toHaveLength(1)
    expect(r.urlGaps[0]).toMatchObject({ url: THIRD, retrievals: 6, retrievalsDelta: 4, totalCitations: 3, totalCitationsDelta: 2, citationShare: 1, mentionedBrandNames: 'Globex' })
    expect(r.urlGaps[0].citationPosition).toBe(3)
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
    expect(r.meta.counts).toMatchObject({ socialsAll: 3, socialsOwn: 1, socialsCompetitor: 1, urlGaps: 1 })
    expect(r.meta.unverified).toEqual(['url_gaps_item_count', 'competitor_table_definition', 'own_channel_non_linkedin_and_competitor_matching', 'pdf_columns_cropped'])
    expect(r.meta.unverified).toEqual([...UNVERIFIED])
    expect(UNVERIFIED).toHaveLength(4)
    expect(JSON.stringify(r)).not.toContain('SECRET')
  })
})

describe('getAeoInformedSocial: what it asks Peec', () => {
  it('runs one request at a time through one reader, in a fixed order', async () => {
    const w = world()
    await getAeoInformedSocial(input(w.reader))
    expect(w.maxInFlight()).toBe(1)
    const order = w.calls.map((c) => c.label?.split(' ')[0])
    const steps = ['brands', 'social-channels', 'domain-classifications', 'socials-by-day', 'gaps-by-day', 'used-chat-level', 'chats-by-day']
    const first = steps.map((x) => order.indexOf(x))
    expect(first.every((i) => i >= 0)).toBe(true)
    expect([...first].sort((x, y) => x - y)).toEqual(first)
  })

  it('pulls the selector by-day over the span of every window it needs, in 31-day chunks', async () => {
    const w = world()
    await getAeoInformedSocial(input(w.reader))
    const sel = w.calls.filter((c) => c.label?.startsWith('socials-by-day'))
    expect(sel.map((c) => [c.body!.start_date, c.body!.end_date])).toEqual([['2026-08-14', '2026-09-13'], ['2026-09-14', '2026-10-14'], ['2026-10-15', '2026-11-05']])
    expect(sel[0].body).toMatchObject({ dimensions: ['date'], filters: [{ field: 'domain_classification', operator: 'in', values: ['Organic Social'] }], limit: 10000, offset: 0 })
  })

  it('adds the gap filter for URL Gaps, the chat id dimension for used-as-source, and the own brand filter for chats', async () => {
    const w = world()
    await getAeoInformedSocial(input(w.reader))
    const gap = w.calls.find((c) => c.label?.startsWith('gaps-by-day'))!
    expect(gap.body!.filters).toEqual([{ field: 'domain_classification', operator: 'in', values: ['Organic Social'] }, { field: 'gap', operator: 'gte', value: 1 }])
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
  it('warns when days in a window have no chats row (before the first data, or an outage)', async () => {
    const r = await getAeoInformedSocial(input(world({ chatDaysMissing: ['2026-09-10', '2026-09-11'] }).reader))
    expect(r.meta.warnings).toContain('days with no chats data in window: socialsPrior (2)')
  })
  it('warns when the used-as-source window has days with no chats data, because its percentages would be inflated', async () => {
    const r = await getAeoInformedSocial(input(world({ chatDaysMissing: ['2026-09-12'] }).reader))
    expect(r.meta.warnings).toContain('days with no chats data in window: usedAsSource (1)')
  })
  it('counts the by-day rows, the gap rows, the chat-level rows and the chat-day rows separately', async () => {
    const r = await getAeoInformedSocial(input(world().reader))
    expect(r.meta.counts).toMatchObject({ selectorRowsByDay: 5, gapRowsByDay: 2, usedChatRows: 2 })
    expect(r.meta.counts.chatDayRows).toBeGreaterThan(80)
    expect(r.meta.counts.requests).toBeGreaterThan(8)
  })
})

describe('getAeoInformedSocial: window edges are inclusive and nothing leaks across them', () => {
  const edge = (date: string, n: number) => urlRow('https://www.linkedin.com/pulse/edge', date, { channel_title: 'Example Life', retrieval_count: n, citation_count: n })
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
    expect(e.label).toBe('gaps-by-day')
    expect(e.message).toContain('gaps-by-day')
    expect(e.message).toContain('2026-08-02')
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
    const r = await getAeoInformedSocial(input(w.reader))
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
