// lib/organic-social/aeo-informed/gate.test.ts
// The gate runs on every result, against the raw Peec rows the result was built from. These tests corrupt a known-good result (or its raw rows) one rule at a time
// and assert the gate catches it, and a final test fails if any rule in the catalog has no test here, so a rule cannot be added or kept without being proven to fire.
import { describe, it, expect } from 'vitest'
import { getAeoInformedSocial, AeoGateError } from './index'
import { inspectAeoInformedSocial } from './inspect'
import { runGate, GATE_RULES, type GateInput, type GateRaw } from './gate'
import { world, input, urlRow, BY_DAY } from './test-world'

type Ctx = { r: GateInput; raw: GateRaw }
type Mut = (c: Ctx) => void
const good = async (over: Parameters<typeof world>[0] = {}): Promise<Ctx> => {
  const i = await inspectAeoInformedSocial(input(world(over).reader))
  return { r: i.result, raw: i.raw }
}
const clone = <T>(x: T): T => structuredClone(x)
const codes = (c: Ctx) => runGate(c.r, c.raw).map((v) => v.code)
const pt = (c: Ctx, id: string, i = 0) => c.r.graphs.filter((p) => p.graphId === id)[i]

// code -> corruptions, each of which must make exactly that rule fire (several where one corruption would leave a branch of the rule untested)
const MUTATIONS: Record<string, Mut[]> = {
  'meta.windows': [
    (c) => { c.r.meta.windows.socialsPrior!.start = '2026-01-01' },
    (c) => { c.r.meta.windows.gapsPrior!.start = '2026-01-01' },
    (c) => { c.r.meta.windows.socialsPrior = null }, // comparing, but no previous window (issue 451)
  ],
  'meta.as-of': [(c) => { c.r.meta.windows.socials.end = '2026-11-09' }, (c) => { c.r.meta.windows.gaps.end = '2026-11-09' }, (c) => { c.raw.today = c.r.meta.asOf }],
  'meta.counts': [(c) => { c.r.meta.counts.socialsAll += 1 }, (c) => { c.r.meta.counts.requests = 1 }],
  'meta.chats': [(c) => { c.r.meta.chats.socials = -1 }, (c) => { c.r.meta.chats.gaps = 10.5 }, (c) => { c.r.meta.chats.socialsPrior = null }], // comparing needs the previous count
  'meta.unverified': [(c) => { c.r.meta.unverified = [] }],
  'meta.identity': [(c) => { c.r.meta.ownBrandId = '' }, (c) => { c.r.meta.selector = { name: 'Organic Social', via: 'tag', id: null } }],
  'oracle.chats': [(c) => { c.r.meta.chats.socials += 1 }],
  'oracle.rows': [
    (c) => { c.raw.selRows.push(urlRow('https://www.linkedin.com/pulse/never-tabled', '2026-10-10', { retrieval_count: 1 })) },
    (c) => { c.raw.gapCurrentRows.push(urlRow('https://www.linkedin.com/pulse/never-tabled-gap', '', { retrieval_count: 1, mentioned_brands: [{ id: 'b_globex' }] })) }, // a gap row Peec returned that the table lacks
    (c) => { c.r.urlGaps.pop() }, // a table row Peec did not return
  ],
  'oracle.totals': [(c) => { c.raw.selRows.find((x) => x.date === '2026-10-10')!.retrieval_count += 5 }, (c) => { c.raw.gapCurrentRows[0].citation_count += 4 }],
  'oracle.deltas': [
    (c) => { c.r.socialsAll[0].totalCitationsDelta = -(c.r.socialsAll[0].totalCitationsDelta as number) },
    (c) => { c.r.urlGaps.find((g) => g.retrievalsDelta !== null)!.retrievalsDelta = 999 },
    (c) => { c.r.socialsAll[0].retrievals += 1 },
  ],
  'no-nan': [(c) => { c.r.socialsAll[0].retrievedPct = NaN }, (c) => { c.r.totals.citationRate = NaN }, (c) => { c.r.totals.prior!.citationRate = Infinity }],
  'socials-all.rank': [(c) => { c.r.socialsAll[0].rank = 5 }],
  'socials-all.order': [(c) => { c.r.socialsAll[0].retrievals = 0 }, (c) => { const [a, b] = [c.r.socialsAll[0], c.r.socialsAll[1]]; a.retrievals = b.retrievals; a.url = 'https://www.linkedin.com/pulse/zzz' }],
  'socials-all.own-flag': [(c) => { c.r.socialsAll[0].isOwnChannel = !c.r.socialsAll[0].isOwnChannel }],
  'socials-all.retrieved-pct': [(c) => { c.r.socialsAll[0].retrievedPct += 0.01 }],
  'socials-all.pct-delta': [
    (c) => { c.r.socialsAll[0].retrievedPctDelta = 0.5 },
    (c) => { c.r.socialsAll.find((x) => x.retrievalsDelta === null)!.retrievedPctDelta = 0.1 },
    (c) => { c.r.meta.chats.socialsPrior = 0 },
  ],
  'socials-all.citation-rate': [
    (c) => { c.r.socialsAll[0].citationRate = (c.r.socialsAll[0].citationRate as number) + 0.01 },
    (c) => { c.r.socialsAll[0].citationRateDelta = 0.9 },
    (c) => { c.r.socialsAll.find((x) => x.retrievalsDelta === null)!.citationRateDelta = 0.1 },
  ],
  'url-gaps.citation-rate': [
    (c) => { c.r.urlGaps[0].citationRate = (c.r.urlGaps[0].citationRate as number) + 0.01 },
    (c) => { c.r.urlGaps.find((g) => g.retrievalsDelta !== null)!.citationRateDelta = 0.9 },
  ],
  'socials-all.new-url-deltas': [(c) => { c.r.socialsAll[0].retrievalsDelta = null }],
  'socials-all.mentions': [
    (c) => { c.r.socialsAll.find((x) => x.mentionedBrandCount === 0)!.ownBrandMentioned = true },
    (c) => { c.r.socialsAll.find((x) => x.mentionedBrandCount === 0)!.mentionedBrandNames = 'Someone' },
  ],
  'totals.recount': [
    (c) => { c.r.totals.retrievals += 1 },
    (c) => { c.r.totals.citations += 1 },
    (c) => { c.r.totals.urlsCited += 1 },
    (c) => { c.r.totals.citationRate = 0.99 },
  ],
  'totals.prior-recount': [
    (c) => { c.r.totals.prior!.retrievals += 1 },
    (c) => { c.r.totals.prior!.urlsCited = 0 },
    (c) => { c.r.totals.prior!.citationRate = null },
    (c) => { c.r.totals.prior = null },
    (c) => { c.r.meta.chats.socialsPrior = 0 }, // a previous window with no chats has no totals to compare with
  ],
  'socials-split.subset': [(c) => { c.r.socialsOwn[0].url = 'https://x.example/not-in-all' }, (c) => { c.r.socialsOwn[0].retrievals += 1 }],
  'socials-own.membership': [(c) => { c.r.socialsOwn[0].ownerBrandId = 'someone-else' }],
  'socials-competitor.membership': [(c) => { c.r.socialsCompetitor[0].ownerBrandId = c.r.meta.ownBrandId }],
  'socials-split.complete': [(c) => { c.r.socialsOwn = [] }, (c) => { c.r.socialsCompetitor.push({ ...c.r.socialsOwn[0], rank: 2 }) }],
  'socials-split.rank': [(c) => { c.r.socialsOwn[0].rank = 3 }],
  'url-gaps.rank-order': [
    (c) => { c.r.urlGaps[0].rank = 4 },
    (c) => { const [a, b] = [c.r.urlGaps[0], c.r.urlGaps[1]]; c.r.urlGaps[0] = { ...b, rank: 1 }; c.r.urlGaps[1] = { ...a, rank: 2 } }, // the 6 and 6 tie, URL order reversed
    (c) => { c.r.urlGaps[0].mentionedBrandCount = 0; c.r.urlGaps[1].mentionedBrandCount = 9 }, // competitors x retrievals no longer descending
  ],
  'url-gaps.share': [(c) => { c.r.urlGaps[0].citationShare = 0.5 }],
  'url-gaps.min-competitors': [
    (c) => { c.r.meta.minCompetitors = 2 }, // Peec returned rows mentioned by one competitor for a min of two
    (c) => { c.r.meta.minCompetitors = 0 },
  ],
  'url-gaps.competitor-mentioned': [(c) => { c.r.urlGaps[0].mentionedBrandCount = 0 }],
  'url-gaps.own-absent': [(c) => { c.raw.gapCurrentRows[0].mentioned_brands.push({ id: c.r.meta.ownBrandId }) }, (c) => { c.raw.gapPriorRows[0].mentioned_brands.push({ id: c.r.meta.ownBrandId }) }],
  'url-gaps.new-url-deltas': [(c) => { c.r.urlGaps.find((g) => g.retrievalsDelta !== null)!.retrievalsDelta = null }],
  'graphs.complete': [
    (c) => { c.r.graphs = c.r.graphs.filter((p) => p.graphId !== 'citations_all') },
    (c) => { c.r.graphs = [...c.r.graphs].reverse() },
    (c) => { const last = c.r.graphs.map((p, i) => [p, i] as const).filter(([p]) => p.graphId === 'citations_instagram').pop()!; c.r.graphs.splice(last[1], 1) },
    (c) => { c.r.meta.fourthGraph = 'tiktok' }, // the fourth graph drawn is not the one asked for
  ],
  'graphs.buckets': [(c) => { pt(c, 'citations_linkedin').weekStart = '2026-09-04' }, (c) => { pt(c, 'citations_linkedin').weekEnd = '2026-09-10' }],
  'graphs.partial': [(c) => { pt(c, 'citations_linkedin').partial = true }, (c) => { const p = c.r.graphs.filter((q) => q.graphId === 'citations_instagram').find((q) => q.partial)!; p.partial = false }],
  'graphs.series-unit': [(c) => { pt(c, 'citations_linkedin').series = 'Someone Else' }, (c) => { pt(c, 'citations_linkedin').unit = 'percent' }],
  'graphs.percent-range': [(c) => { pt(c, 'used_as_source_all').value = 1.5 }],
  'graphs.citation-integer': [(c) => { c.r.graphs.find((p) => p.graphId === 'citations_linkedin' && p.value !== null)!.value = 0.5 }],
  'graphs.null-pattern': [(c) => { pt(c, 'citations_linkedin').value = null }],
  'graphs.bounds': [
    (c) => { c.r.graphs.find((p) => p.graphId === 'citations_linkedin' && p.value !== null)!.value = 1_000_000 },
    (c) => { pt(c, 'used_as_source_all', 2).value = 1 },
    (c) => { pt(c, 'citations_all', 4).value = 1_000_000 },
  ],
  'graphs.source-present': [(c) => { for (const p of c.r.graphs.filter((q) => q.graphId === 'citations_linkedin')) p.value = null }],
  'view.no-chats': [(c) => { c.r.meta.warnings.push('no chats in window: socials') }],
  'view.chat-days': [(c) => { c.raw.dayRows = c.raw.dayRows.filter((d) => d.date !== '2026-10-20') }],
}

// rules proven in their own tests, keyed by code so deleting one fails the catalog test below
const SEPARATE: Record<string, () => Promise<void>> = {
  'view.empty-socials': async () => {
    const v = runGate((await good({ byDay: [], gapRows: [] })).r, (await good({ byDay: [], gapRows: [] })).raw)
    expect(v.filter((x) => x.severity === 'error')).toEqual([])
    expect(v.map((x) => x.code)).toContain('view.empty-socials')
  },
  'view.empty-gaps': async () => {
    const c = await good({ gapRows: [] })
    const v = runGate(c.r, c.raw)
    expect(v.filter((x) => x.severity === 'error')).toEqual([])
    expect(v.map((x) => x.code)).toContain('view.empty-gaps')
  },
  'view.warning': async () => {
    const c = await good({ chatDaysMissing: ['2026-08-02', '2026-08-03'] })
    const v = runGate(c.r, c.raw)
    expect(v.filter((x) => x.severity === 'error')).toEqual([])
    expect(v.some((x) => x.code === 'view.warning' && x.message.includes('gapsPrior'))).toBe(true)
  },
  'view.no-chats-previous': async () => {
    const c = clone(await good())
    c.r.meta.warnings.push('no chats in window: socialsPrior')
    const v = runGate(c.r, c.raw).filter((x) => x.code === 'view.no-chats-previous')
    expect(v).toHaveLength(1)
    expect(v[0].severity).toBe('warning')
  },
}

describe('a good result', () => {
  it('passes the gate with no errors and no warnings', async () => {
    const c = await good()
    expect(runGate(c.r, c.raw)).toEqual([])
  })
  it('the world fixture exercises every table, a tie, and a graph that crosses the as-of date (so the mutations below mean something)', async () => {
    const c = await good()
    expect(c.r.socialsAll.length).toBeGreaterThan(1)
    expect(c.r.socialsOwn.length).toBeGreaterThan(0)
    expect(c.r.socialsCompetitor.length).toBeGreaterThan(0)
    expect(c.r.urlGaps.length).toBeGreaterThanOrEqual(3)
    expect(c.r.urlGaps[0].retrievals).toBe(c.r.urlGaps[1].retrievals)
    expect(c.r.graphs.some((p) => p.partial)).toBe(true)
    expect(c.r.graphs.filter((p) => p.graphId === 'citations_instagram').length).toBe(3) // the fourth bucket starts after the as-of date and is dropped
  })
  it('a URL with no title, no type and no channel is a legitimate row and passes', async () => {
    const c = await good({ byDay: [...BY_DAY, urlRow('https://www.linkedin.com/pulse/untitled', '2026-10-11', { title: null, classification: null, channel_title: null, retrieval_count: 2 })] })
    expect(runGate(c.r, c.raw).filter((v) => v.severity === 'error')).toEqual([])
    expect(c.r.socialsAll.some((x) => x.title === null && x.urlType === null && x.channelTitle === null)).toBe(true)
  })
  it('a week with no chats at all is empty and allowed, while the other weeks keep their values', async () => {
    const w = world()
    const orig = w.reader.post
    w.reader.post = async (p, b, l) => {
      const out = (await orig(p, b, l)) as { data: { date: string; visibility_total: number }[] }
      if (p === '/reports/brands') out.data = out.data.map((d) => (d.date >= '2026-09-10' && d.date <= '2026-09-16' ? { ...d, visibility_total: 0 } : d))
      return out
    }
    const i = await inspectAeoInformedSocial(input(w.reader))
    const used = i.result.graphs.filter((p) => p.graphId === 'used_as_source_all')
    expect(used[1].value).toBeNull()
    expect(used[0].value).not.toBeNull()
    expect(i.violations.filter((v) => v.severity === 'error')).toEqual([])
  })
})

describe('every rule fires on the corruption it exists for', () => {
  for (const [code, muts] of Object.entries(MUTATIONS)) {
    muts.forEach((mutate, k) => {
      it(`${code} (${k + 1} of ${muts.length})`, async () => {
        const c = clone(await good())
        mutate(c)
        expect(codes(c), `${code} did not fire`).toContain(code)
      })
    })
  }
})

describe('contract rules, from the typed field specs', () => {
  it('a value outside its range, a wrong type, an unknown value and an extra field are all caught', async () => {
    const c = clone(await good())
    c.r.socialsAll[0].retrievals = -1
    ;(c.r.urlGaps[0] as unknown as Record<string, unknown>).citationShare = 'x'
    ;(c.r.graphs[0] as unknown as Record<string, unknown>).graphId = 'made_up'
    ;(c.r.socialsOwn[0] as unknown as Record<string, unknown>).surprise = 1
    ;(c.r.totals as unknown as Record<string, unknown>).surprise = 1
    const k = codes(c)
    expect(k).toContain('contract.socials_table.min')
    expect(k).toContain('contract.url_gaps_table.type')
    expect(k).toContain('contract.totals.extra')
    expect(k).toContain('contract.graph_points.oneOf')
    expect(k).toContain('contract.socials_table.extra')
  })
})

describe('the separate rules', () => {
  for (const [code, run] of Object.entries(SEPARATE)) it(code, run)
  it('no chats in the current window is an error', async () => {
    const c = clone(await good())
    c.r.meta.warnings.push('no chats in window: gaps')
    expect(runGate(c.r, c.raw).some((x) => x.code === 'view.no-chats' && x.severity === 'error')).toBe(true)
  })
  it('an adapter warning with anything but a window name and a count is withheld, never passed on verbatim', async () => {
    const c = clone(await good())
    c.r.meta.warnings.push('something about https://client.example/secret-page')
    const v = runGate(c.r, c.raw).find((x) => x.code === 'view.warning')!
    expect(v.message).not.toContain('client.example')
  })
})

describe('the catalog', () => {
  it('has a unique code per rule, a severity and a plain-English sentence', () => {
    expect(new Set(GATE_RULES.map((r) => r.code)).size).toBe(GATE_RULES.length)
    for (const r of GATE_RULES) { expect(['error', 'warning']).toContain(r.severity); expect(r.plain.length).toBeGreaterThan(20) }
  })
  it('every rule has a mutation or a separate test, and the severities in the catalog are the ones the gate emits', () => {
    const covered = new Set([...Object.keys(MUTATIONS), ...Object.keys(SEPARATE), 'contract'])
    for (const r of GATE_RULES) expect(covered.has(r.code), `${r.code} has no test`).toBe(true)
  })
  it('every mutation and separate test names a rule that is in the catalog', () => {
    const known = new Set(GATE_RULES.map((r) => r.code))
    for (const code of [...Object.keys(MUTATIONS), ...Object.keys(SEPARATE)]) expect(known.has(code), code).toBe(true)
  })
  it('a rule is an error exactly when the gate emits it as an error', async () => {
    const sev = new Map(GATE_RULES.map((r) => [r.code, r.severity]))
    for (const [code, muts] of Object.entries(MUTATIONS)) {
      const c = clone(await good())
      muts[0](c)
      for (const v of runGate(c.r, c.raw).filter((x) => x.code === code)) expect(v.severity, code).toBe(sev.get(code))
    }
  })
})

describe('enforcement in getAeoInformedSocial', () => {
  // retrievals that exceed the chats in the window cannot be true: the gate must refuse the result
  const impossible = { byDay: [{ ...BY_DAY[2], retrieval_count: 50_000 }] }
  it('a result that fails the gate throws an AeoGateError that lists the broken rules, and returns nothing', async () => {
    const e = (await getAeoInformedSocial(input(world(impossible).reader)).catch((x) => x)) as AeoGateError
    expect(e).toBeInstanceOf(AeoGateError)
    expect(e.report.errors.length).toBeGreaterThan(0)
    expect(e.message).toContain('contract.socials_table.max')
    expect(e.message).not.toContain('SECRET')
  })
  it('a window with no chats at all is refused too', async () => {
    const e = (await getAeoInformedSocial(input(world({ chatsPerDay: 0 }).reader)).catch((x) => x)) as AeoGateError
    expect(e).toBeInstanceOf(AeoGateError)
    expect(e.report.errors.some((v) => v.code === 'view.no-chats')).toBe(true)
  })
  it('an as-of date that is not before today is refused, because the last day would be unfinished', async () => {
    const e = (await getAeoInformedSocial(input(world().reader, { now: () => Date.parse('2026-11-08T12:00:00Z') })).catch((x) => x)) as AeoGateError
    expect(e).toBeInstanceOf(AeoGateError)
    expect(e.report.errors.some((v) => v.code === 'meta.as-of')).toBe(true)
  })
  it('there is no way to get an ungated result from the production function: the gate option is gone', async () => {
    const r = await getAeoInformedSocial(input(world().reader, { gate: 'report' } as Record<string, unknown>))
    expect(r.meta.gate.errors).toEqual([])
    await expect(getAeoInformedSocial(input(world(impossible).reader, { gate: 'report' } as Record<string, unknown>))).rejects.toBeInstanceOf(AeoGateError)
  })
  it('a good result carries a clean gate report with the number of rules checked', async () => {
    const r = await getAeoInformedSocial(input(world().reader))
    expect(r.meta.gate).toMatchObject({ errors: [], warnings: [] })
    expect(r.meta.gate.rulesChecked).toBe(GATE_RULES.length)
  })
})

// Issue 451 (Paul, PR 444): a result asked for with compare false has no previous window. The gate must pass a good one and catch a result that
// still carries anything from a previous window, since nothing was pulled to back it.
describe('compare false', () => {
  const goodOff = async (): Promise<Ctx> => {
    const i = await inspectAeoInformedSocial(input(world().reader, { compare: false }))
    return { r: i.result, raw: i.raw }
  }
  it('a good compare false result passes the gate with no errors and no warnings', async () => {
    const c = await goodOff()
    expect(c.r.meta.compare).toBe(false)
    expect(runGate(c.r, c.raw)).toEqual([])
  })
  const OFF: Record<string, Mut[]> = {
    'meta.windows': [
      (c) => { c.r.meta.windows.socialsPrior = { start: '2026-09-07', end: '2026-10-06' } },
      (c) => { c.r.meta.windows.gapsPrior = { start: '2026-08-02', end: '2026-08-31' } },
      (c) => { c.r.meta.chats.socialsPrior = 0 },
      (c) => { c.r.meta.chats.gapsPrior = 5 },
    ],
    'oracle.deltas': [
      (c) => { c.r.socialsAll[0].retrievalsDelta = 1; c.r.socialsAll[0].totalCitationsDelta = 1 },
      (c) => { c.r.urlGaps[0].retrievalsDelta = 1; c.r.urlGaps[0].totalCitationsDelta = 1 },
    ],
    'oracle.rows': [(c) => { c.raw.gapPriorRows.push(structuredClone(c.raw.gapCurrentRows[0])) }],
    'totals.prior-recount': [(c) => { c.r.totals.prior = { urlsCited: 0, retrievals: 0, citations: 0, citationRate: null } }],
  }
  for (const [code, muts] of Object.entries(OFF)) {
    muts.forEach((mutate, k) => {
      it(`${code} fires on a compare false result that carries a previous window (${k + 1} of ${muts.length})`, async () => {
        const c = clone(await goodOff())
        mutate(c)
        expect(codes(c), `${code} did not fire`).toContain(code)
      })
    })
  }
})
