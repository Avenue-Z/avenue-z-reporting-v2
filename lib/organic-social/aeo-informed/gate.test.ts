// lib/organic-social/aeo-informed/gate.test.ts
// The gate runs on every result. These tests corrupt a known-good result one rule at a time and assert the gate catches exactly that, and a final test
// fails if any rule in the catalog has no mutation here, so a rule cannot be added or kept without being proven to fire.
import { describe, it, expect } from 'vitest'
import { getAeoInformedSocial, AeoGateError, type AeoInformedResult } from './index'
import { runGate, GATE_RULES } from './gate'
import { world, input, BY_DAY } from './test-world'

type Mut = (r: AeoInformedResult) => void
const good = async (over: Parameters<typeof world>[0] = {}) => getAeoInformedSocial(input(world(over).reader, { gate: 'report' }))
const clone = <T>(x: T): T => structuredClone(x)
const codes = (r: AeoInformedResult) => runGate(r).map((v) => v.code)

// code -> a mutation that must make exactly that rule fire
const MUTATIONS: Record<string, Mut> = {
  'meta.windows': (r) => { r.meta.windows.socialsPrior.start = '2026-01-01' },
  'meta.as-of': (r) => { r.meta.windows.socials.end = '2026-11-09' },
  'meta.counts': (r) => { r.meta.counts.socialsAll += 1 },
  'meta.chats': (r) => { r.meta.chats.socials = -1 },
  'meta.unverified': (r) => { r.meta.unverified = [] },
  'meta.identity': (r) => { r.meta.ownBrandId = '' },
  'no-nan': (r) => { r.socialsAll[0].retrievedPct = NaN },
  'socials-all.rank': (r) => { r.socialsAll[0].rank = 5 },
  'socials-all.order': (r) => { r.socialsAll[0].retrievals = 0 },
  'socials-all.own-flag': (r) => { r.socialsAll[0].isOwnChannel = !r.socialsAll[0].isOwnChannel },
  'socials-all.retrieved-pct': (r) => { r.socialsAll[0].retrievedPct += 0.01 },
  'socials-all.pct-delta': (r) => { r.socialsAll[0].retrievedPctDelta = 0.5 },
  'socials-all.new-url-deltas': (r) => { r.socialsAll[0].retrievalsDelta = null },
  'socials-all.mentions': (r) => { const row = r.socialsAll.find((x) => x.mentionedBrandCount === 0)!; row.ownBrandMentioned = true },
  'socials-split.subset': (r) => { r.socialsOwn[0].url = 'https://x.example/not-in-all' },
  'socials-own.membership': (r) => { r.socialsOwn[0].ownerBrandId = 'someone-else' },
  'socials-competitor.membership': (r) => { r.socialsCompetitor[0].ownerBrandId = r.meta.ownBrandId },
  'socials-split.complete': (r) => { r.socialsOwn = [] },
  'socials-split.rank': (r) => { r.socialsOwn[0].rank = 3 },
  'url-gaps.rank-order': (r) => { r.urlGaps[0].rank = 4 },
  'url-gaps.share': (r) => { r.urlGaps[0].citationShare = 0.5 },
  'url-gaps.competitor-mentioned': (r) => { r.urlGaps[0].mentionedBrandCount = 0 },
  'url-gaps.new-url-deltas': (r) => { r.urlGaps[0].retrievalsDelta = null },
  'graphs.complete': (r) => { r.graphs = r.graphs.filter((p) => p.graphId !== 'citations_all') },
  'graphs.buckets': (r) => { r.graphs.find((p) => p.graphId === 'citations_linkedin')!.weekStart = '2026-09-04' },
  'graphs.partial': (r) => { r.graphs.find((p) => p.graphId === 'citations_linkedin')!.partial = true },
  'graphs.series-unit': (r) => { r.graphs.find((p) => p.graphId === 'citations_linkedin')!.series = 'Someone Else' },
  'graphs.percent-range': (r) => { r.graphs.find((p) => p.graphId === 'used_as_source_all')!.value = 1.5 },
  'graphs.citation-integer': (r) => { r.graphs.find((p) => p.graphId === 'citations_linkedin' && p.value !== null)!.value = 0.5 },
  'graphs.null-pattern': (r) => { r.graphs.find((p) => p.graphId === 'citations_linkedin')!.value = null },
  'view.no-chats': (r) => { r.meta.warnings.push('no chats in window: socials') },
}
// rules that are not a simple corruption of one good result, proven in their own tests below
const SEPARATE = ['view.empty-socials', 'view.empty-gaps', 'view.warning', 'view.no-chats-previous']

describe('a good result', () => {
  it('passes the gate with no errors and no warnings', async () => {
    expect(runGate(await good())).toEqual([])
  })
  it('the world fixture really exercises every table (so the mutations below mean something)', async () => {
    const r = await good()
    expect(r.socialsAll.length).toBeGreaterThan(1)
    expect(r.socialsOwn.length).toBeGreaterThan(0)
    expect(r.socialsCompetitor.length).toBeGreaterThan(0)
    expect(r.urlGaps.length).toBeGreaterThan(0)
    expect(r.graphs.length).toBeGreaterThan(10)
  })
})

describe('every rule fires on the corruption it exists for', () => {
  for (const [code, mutate] of Object.entries(MUTATIONS)) {
    it(code, async () => {
      const r = clone(await good())
      mutate(r)
      expect(codes(r), `${code} did not fire`).toContain(code)
    })
  }
})

describe('contract rules, from the typed field specs', () => {
  it('a value outside its range, a wrong type, an unknown value and an extra field are all caught', async () => {
    const r = clone(await good())
    r.socialsAll[0].retrievals = -1
    ;(r.urlGaps[0] as unknown as Record<string, unknown>).citationShare = 'x'
    ;(r.graphs[0] as unknown as Record<string, unknown>).graphId = 'made_up'
    ;(r.socialsOwn[0] as unknown as Record<string, unknown>).surprise = 1
    const c = codes(r)
    expect(c).toContain('contract.socials_table.min')
    expect(c).toContain('contract.url_gaps_table.type')
    expect(c).toContain('contract.graph_points.oneOf')
    expect(c).toContain('contract.socials_table.extra')
  })
})

describe('the rules that are not a simple corruption', () => {
  it('an empty first table and an empty gaps table are warnings, not errors', async () => {
    const r = await good({ byDay: [], gapRows: [] })
    const v = runGate(r)
    expect(v.filter((x) => x.severity === 'error')).toEqual([])
    expect(v.map((x) => x.code)).toEqual(expect.arrayContaining(['view.empty-socials', 'view.empty-gaps']))
  })
  it('a warning the adapter raised (days with no chat data) is passed on as a warning', async () => {
    const r = await good({ chatDaysMissing: ['2026-09-12'] })
    const v = runGate(r)
    expect(v.filter((x) => x.severity === 'error')).toEqual([])
    expect(v.some((x) => x.code === 'view.warning' && x.message.includes('usedAsSource'))).toBe(true)
  })
  it('no chats in the previous window is a warning (the current window still stands)', async () => {
    const r = clone(await good())
    r.meta.warnings.push('no chats in window: socialsPrior')
    const v = runGate(r).filter((x) => x.code === 'view.no-chats-previous')
    expect(v).toHaveLength(1)
    expect(v[0].severity).toBe('warning')
  })
  it('no chats in the current window is an error', async () => {
    const r = clone(await good())
    r.meta.warnings.push('no chats in window: gaps')
    expect(runGate(r).some((x) => x.code === 'view.no-chats' && x.severity === 'error')).toBe(true)
  })
})

describe('the catalog', () => {
  it('has a unique code per rule, a severity and a plain-English sentence', () => {
    expect(new Set(GATE_RULES.map((r) => r.code)).size).toBe(GATE_RULES.length)
    for (const r of GATE_RULES) { expect(['error', 'warning']).toContain(r.severity); expect(r.plain.length).toBeGreaterThan(20) }
  })
  it('every rule has a mutation or a separate test: nothing is listed without being proven', () => {
    const covered = new Set([...Object.keys(MUTATIONS), ...SEPARATE, 'contract'])
    for (const r of GATE_RULES) expect(covered.has(r.code), `${r.code} has no test`).toBe(true)
  })
  it('every mutation names a rule that is in the catalog', () => {
    const known = new Set(GATE_RULES.map((r) => r.code))
    for (const code of Object.keys(MUTATIONS)) expect(known.has(code), code).toBe(true)
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
  it('in report mode the same result is returned with the violations in meta.gate', async () => {
    const r = await getAeoInformedSocial(input(world(impossible).reader, { gate: 'report' }))
    expect(r.meta.gate.mode).toBe('report')
    expect(r.meta.gate.errors.length).toBeGreaterThan(0)
  })
  it('a good result carries a clean gate report with the number of rules checked', async () => {
    const r = await getAeoInformedSocial(input(world().reader))
    expect(r.meta.gate).toMatchObject({ mode: 'enforce', errors: [], warnings: [] })
    expect(r.meta.gate.rulesChecked).toBe(GATE_RULES.length)
  })
  it('enforce is the default', async () => {
    const r = await getAeoInformedSocial(input(world().reader))
    expect(r.meta.gate.mode).toBe('enforce')
  })
})
