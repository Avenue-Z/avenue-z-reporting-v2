import { expect, test } from 'vitest'
import { SENTENCES_VERSION } from './config'
import vectors from './round.vectors.json'
import { buildSnapshotData, fmtDay, fmtEasternDateTime, fmtEasternDay, preparedDay, pyRound, titleClassification, V1_SETTINGS_USED } from './metrics'
import { chartedBrands } from './charted'
import type { MetricDecisions } from './metrics'
import type { PeecPull } from './pull'
import { dataBlock } from './prompt'
import type { Note, StoredNote } from './notes'
const texts = (ns: StoredNote[]) => ns.map((n) => (typeof n === 'string' ? n : n.text))

test('pyRound matches Python round on every vector', () => {
  for (const v of vectors as { x: number; dp: number; py: number }[]) expect(pyRound(v.x, v.dp)).toBe(v.py)
})
test('day and classification formatting', () => {
  expect(fmtDay('2026-10-01')).toBe('Oct 1, 2026')
  expect(fmtEasternDay(new Date('2026-10-09T02:30:00Z'))).toBe('Oct 8, 2026')
  expect(fmtEasternDay(new Date('2026-10-09T05:30:00Z'))).toBe('Oct 9, 2026')
  expect(titleClassification('OWN')).toBe('You')
  expect(titleClassification('UGC')).toBe('UGC')
  expect(titleClassification('Retailers')).toBe('Retailers')
})

const PULL: PeecPull = {
  project: { id: 'or_a', name: 'Example pitch', status: 'PITCH' },
  roster: [
    { id: 'kw_own', name: 'Example Co', is_own: true, domains: ['example.com'] },
    { id: 'kw_a', name: 'Alpha', is_own: false, domains: ['alpha.com'] },
    { id: 'kw_b', name: 'Beta', is_own: false, domains: ['beta.com'] },
  ],
  ownBrand: { id: 'kw_own', name: 'Example Co', is_own: true, domains: ['example.com'] },
  profile: { industry: 'Fintech', markets: ['United States'] },
  requested: { start: '2026-09-09', end: '2026-10-08' },
  rangePicked: true,
  window: { start: '2026-10-01', end: '2026-10-08' },
  pulledDay: '2026-10-09',
  brands: [
    { brand: { id: 'kw_b', name: 'Beta' }, visibility: 0.185, share_of_voice: 0.169, position: 3.1 },
    { brand: { id: 'kw_own', name: 'Example Co' }, visibility: 0.151, share_of_voice: 0.159, position: 3.06 },
    { brand: { id: 'kw_a', name: 'Alpha' }, visibility: 0.261, share_of_voice: 0.225, position: 2.4 },
  ],
  domains: [
    { domain: 'example.com', classification: 'OWN', retrieved_chat_count: 1989, retrieval_count: 3698, usage_rate: 3698, retrieved_percentage: 0.2236, mentioned_brands: [] },
    { domain: 'alpha.com', classification: 'COMPETITOR', retrieved_chat_count: 1250, retrieval_count: 5902, usage_rate: 5902, mentioned_brands: [{ id: 'kw_a' }] },
    { domain: 'news.com', classification: 'EDITORIAL', retrieved_chat_count: 900, retrieval_count: 1000, usage_rate: 1000, mentioned_brands: [{ id: 'kw_own' }, { id: 'kw_a' }] },
    { domain: 'forum.com', classification: 'UGC', retrieved_chat_count: 300, retrieval_count: 400, usage_rate: 400, mentioned_brands: [{ id: 'kw_b' }] },
    { domain: 'blank.com', classification: 'OTHER', retrieved_chat_count: 5, retrieval_count: 0, usage_rate: 0, mentioned_brands: [] },
  ],
  promptCount: 100,
  models: ['ChatGPT UI', 'Google AI Overview'],
  warnings: [],
}

test('ranks by visibility then id, and builds the KPIs his way', () => {
  const d = buildSnapshotData(PULL, '2026-10-08T15:00:00Z')
  expect(d.brands.map((b) => [b.name, b.rank])).toEqual([['Alpha', 1], ['Beta', 2], ['Example Co', 3]])
  expect(d.kpis).toEqual([
    { label: 'AI visibility', value: '15.1%' },
    { label: 'AI share of voice', value: '15.9%' },
    { label: 'Average answer position', value: '#3.1' },
    { label: 'Competitive rank', value: '#3 of 3 brands' },
  ])
  expect(d.windowLabel).toBe('Oct 1, 2026 to Oct 8, 2026')
  expect(d.category).toBe('Fintech')
  expect(d.market).toBe('United States')
  expect(d.leaderGaps).toEqual([{ name: 'Alpha', visibilityPoints: 11, sovPoints: 6.6 }, { name: 'Beta', visibilityPoints: 3.4, sovPoints: 1 }])
})

test('source mix weights by retrieval_count, drops zero weights, sorts by weight then label', () => {
  // Pinned to the pre-2026-10-19 weighting by name: its fixture rows carry the same value in usage_rate, so the default would pass too.
  const d = buildSnapshotData(PULL, '2026-10-08T15:00:00Z', { rankAmong: null, competitorSiteGaps: true, sourceMixWeight: 'retrieval_count' })
  expect(d.sourceMix.map((s) => [s.label, s.weight])).toEqual([['Competitor', 5902], ['You', 3698], ['Editorial', 1000], ['UGC', 400]])
  expect(d.sourceMix.reduce((t, s) => t + s.weight, 0)).toBe(11000)
})

test('competitor gap domains: a compared competitor\'s own site where the brand is absent is listed; a third-party site and one the brand appears on are not (Ryan, round 3)', () => {
  const d = buildSnapshotData(PULL, '2026-10-08T15:00:00Z')
  expect(d.gapDomains).toEqual([{ domain: 'alpha.com', retrievedChats: 1250 }])
})

test('own site with no rows: zero chats, null percent, and a note', () => {
  const d = buildSnapshotData({ ...PULL, domains: PULL.domains.filter((r) => r.domain !== 'example.com') }, '2026-10-08T15:00:00Z')
  expect(d.ownRetrievedChats).toBe(0)
  expect(d.ownRetrievedPct).toBeNull()
  expect(texts(d.notes).join(' ')).toContain('No retrievals of the brand\'s own site')
})

test('missing SOV or position drops that card (his three-card rule) and adds a note', () => {
  const brands = PULL.brands.map((b) => (b.brand.id === 'kw_own' ? { ...b, share_of_voice: null, position: null } : b))
  const d = buildSnapshotData({ ...PULL, brands }, '2026-10-08T15:00:00Z')
  expect(d.kpis.map((k) => k.label)).toEqual(['AI visibility', 'Competitive rank'])
  expect(texts(d.notes).join(' ')).toContain('share of voice')
})

test('only the own brand tracked: no rank card, a note, no competitor gaps', () => {
  const solo: PeecPull = { ...PULL, roster: [PULL.ownBrand], brands: [PULL.brands[1]] }
  const d = buildSnapshotData(solo, '2026-10-08T15:00:00Z')
  expect(d.competitorsTracked).toBe(0)
  expect(d.kpis.map((k) => k.label)).not.toContain('Competitive rank')
  expect(d.kpis.map((k) => k.label)).toEqual(['AI visibility', 'Average answer position'])
  expect(d.notes).toContainEqual({ kind: 'missing_metric', text: 'With no competitors tracked, share of voice is 100% by construction, so that card is left out.' })
  expect(texts(d.notes)).toContain('No competitors tracked in this Peec project')
})

test('no profile: category and market are null with a note', () => {
  const d = buildSnapshotData({ ...PULL, profile: null }, '2026-10-08T15:00:00Z')
  expect([d.category, d.market]).toEqual([null, null])
  expect(texts(d.notes).join(' ')).toContain('no project profile')
})

const DEFAULTS: MetricDecisions = { rankAmong: null, competitorSiteGaps: true, sourceMixWeight: 'usage_rate' }

test('two arguments read DECISIONS, whose defaults are every brand, site gaps on, usage_rate (2026-10-19)', () => {
  expect(buildSnapshotData(PULL, '2026-10-08T15:00:00Z')).toEqual(buildSnapshotData(PULL, '2026-10-08T15:00:00Z', DEFAULTS))
  expect(texts(buildSnapshotData(PULL, '2026-10-08T15:00:00Z').notes)).toContain('Rank is by visibility among the 3 brands tracked in Peec.')
})

test('Q2: rankAmong N keeps the brand and its N - 1 most visible competitors', () => {
  const d = buildSnapshotData(PULL, '2026-10-08T15:00:00Z', { ...DEFAULTS, rankAmong: 2 })
  expect(d.brands.map((b) => [b.name, b.rank])).toEqual([['Alpha', 1], ['Example Co', 2]])
  expect(d.kpis.at(-1)).toEqual({ label: 'Competitive rank', value: '#2 of 2 brands' })
  expect(d.leaderGaps).toEqual([{ name: 'Alpha', visibilityPoints: 11, sovPoints: 6.6 }])
  expect(texts(d.notes)).toContain('Rank is by visibility among 2 of the 3 brands tracked in Peec: the brand and the competitors with the highest visibility.')
})

test('Q2: rankAmong at or above the tracked count changes nothing', () => {
  // settingsUsed.rankAmong records the setting itself (3 vs null), so it is the one field that differs by design.
  const { settingsUsed: a, ...withThree } = buildSnapshotData(PULL, '2026-10-08T15:00:00Z', { ...DEFAULTS, rankAmong: 3 })
  const { settingsUsed: b, ...withNone } = buildSnapshotData(PULL, '2026-10-08T15:00:00Z', DEFAULTS)
  expect(withThree).toEqual(withNone)
  expect([a?.rankAmong, b?.rankAmong]).toEqual([3, null])
})

test('Q2: a brand ranked below the cut is still shown, last', () => {
  const brands = PULL.brands.map((b) => (b.brand.id === 'kw_own' ? { ...b, visibility: 0.05 } : b))
  const d = buildSnapshotData({ ...PULL, brands }, '2026-10-08T15:00:00Z', { ...DEFAULTS, rankAmong: 2 })
  expect(d.brands.map((b) => [b.name, b.rank])).toEqual([['Alpha', 1], ['Example Co', 2]])
})

test('Q2: rankAmong below 2 or not a whole number is refused', () => {
  for (const n of [1, 0, -3, 2.5]) expect(() => buildSnapshotData(PULL, '2026-10-08T15:00:00Z', { ...DEFAULTS, rankAmong: n })).toThrow('DECISIONS.rankAmong must be null or a whole number of 2 or more')
})

test('Q4: competitorSiteGaps off leaves no gap sites', () => {
  expect(buildSnapshotData(PULL, '2026-10-08T15:00:00Z', { ...DEFAULTS, competitorSiteGaps: false }).gapDomains).toEqual([])
})

test('source mix weighted by retrieved_chat_count (AIVx method)', () => {
  const d = buildSnapshotData(PULL, '2026-10-08T15:00:00Z', { ...DEFAULTS, sourceMixWeight: 'retrieved_chat_count' })
  expect(d.sourceMix.map((s) => [s.label, s.weight])).toEqual([['You', 1989], ['Competitor', 1250], ['Editorial', 900], ['UGC', 300], ['Other', 5]])
  expect(d.sourceMix.reduce((t, s) => t + s.weight, 0)).toBe(4444)
})

test('leader gaps are the difference of the printed percentages, as in Ryan\'s example (spec v1.1 §19.4, issue 383)', () => {
  const brands = [
    { brand: { id: 'kw_a', name: 'Alpha' }, visibility: 0.2614, share_of_voice: 0.2234, position: 2.4 },
    { brand: { id: 'kw_own', name: 'Example Co' }, visibility: 0.1516, share_of_voice: 0.1585, position: 3.06 },
  ]
  const d = buildSnapshotData({ ...PULL, brands }, '2026-10-08T15:00:00Z')
  // Printed: 26.1 - 15.2 = 10.9 (the exact ratios would give 11.0) and 22.3 - 15.8 = 6.5 (15.85 is 15.8499... in binary).
  expect(d.kpis.slice(0, 2).map((k) => k.value)).toEqual(['15.2%', '15.8%'])
  expect(d.leaderGaps).toEqual([{ name: 'Alpha', visibilityPoints: 10.9, sovPoints: 6.5 }])
})

test('a rival behind on share of voice gives a negative share-of-voice gap', () => {
  const brands = [
    { brand: { id: 'kw_a', name: 'Alpha' }, visibility: 0.30, share_of_voice: 0.10, position: 2 },
    { brand: { id: 'kw_own', name: 'Example Co' }, visibility: 0.20, share_of_voice: 0.15, position: 3 },
  ]
  expect(buildSnapshotData({ ...PULL, brands }, '2026-10-08T15:00:00Z').leaderGaps).toEqual([{ name: 'Alpha', visibilityPoints: 10, sovPoints: -5 }])
})

test('every gap in the fixture equals the printed difference to the tenth', () => {
  const d = buildSnapshotData(PULL, '2026-10-08T15:00:00Z')
  for (const g of d.leaderGaps) {
    const rival = d.brands.find((b) => b.name === g.name)!
    expect(g.visibilityPoints).toBe(Number((rival.visibilityPct - d.own.visibilityPct).toFixed(1)))
    expect(g.sovPoints).toBe(Number((rival.sovPct! - d.own.sovPct!).toFixed(1)))
  }
})

test('new rows carry the current SENTENCES_VERSION (spec v1.1 §19.5; 2 since 2026-10-20)', () => {
  expect(buildSnapshotData(PULL, '2026-10-08T15:00:00Z').sentences).toBe(SENTENCES_VERSION)
})

test('ownSiteRank: 1 plus the domains with more retrieved chats than the top own site, ties not counted, null with none', () => {
  expect(buildSnapshotData(PULL, '2026-10-08T15:00:00Z').ownSiteRank).toBe(1)
  const more = (n: number, chats: number) => Array.from({ length: n }, (_, i) => ({ domain: `big${i}.org`, classification: 'EDITORIAL', retrieved_chat_count: chats, retrieval_count: 1, usage_rate: 1, mentioned_brands: [] }))
  expect(buildSnapshotData({ ...PULL, domains: [...PULL.domains, ...more(11, 5000)] }, '2026-10-08T15:00:00Z').ownSiteRank).toBe(12)
  expect(buildSnapshotData({ ...PULL, domains: [...PULL.domains, ...more(3, 1989)] }, '2026-10-08T15:00:00Z').ownSiteRank).toBe(1)
  expect(buildSnapshotData({ ...PULL, domains: PULL.domains.filter((r) => r.domain !== 'example.com') }, '2026-10-08T15:00:00Z').ownSiteRank).toBeNull()
})

test('noDataBrands: the ranked roster brands with no Peec row, in rank order, never in brands', () => {
  expect(buildSnapshotData(PULL, '2026-10-08T15:00:00Z').noDataBrands).toEqual([])
  const roster = [REF('kw_own', 'Own', true), REF('kw_a', 'A'), REF('kw_z', 'Zed'), REF('kw_m', 'Mid')]
  const brands = [ROW('kw_a', 'A', 0.3), ROW('kw_own', 'Own', 0.2)]
  const d = buildSnapshotData({ ...PULL, roster, ownBrand: roster[0], brands }, '2026-10-08T15:00:00Z')
  expect(d.noDataBrands).toEqual(['Mid', 'Zed'])
  expect(d.brands.map((b) => b.name)).toEqual(['A', 'Own'])
})

test('preparedDay: the later of the Eastern day and the window end (spec v1.1 §19.8)', () => {
  // 23:30 Eastern on Oct 13 is Oct 14 in UTC, where a pitch run's data sits.
  expect(preparedDay(new Date('2026-10-14T03:30:00Z'), '2026-10-14')).toBe('Oct 14, 2026')
  expect(preparedDay(new Date('2026-10-14T03:30:00Z'), '2026-10-13')).toBe('Oct 13, 2026')
  expect(preparedDay(new Date('2026-10-14T16:00:00Z'), '2026-10-10')).toBe('Oct 14, 2026')
})

test('leader gap share of voice is null when either side has none', () => {
  const brands = PULL.brands.map((b) => (b.brand.id === 'kw_own' ? { ...b, share_of_voice: null } : b))
  const d = buildSnapshotData({ ...PULL, brands }, '2026-10-08T15:00:00Z')
  expect(d.leaderGaps.map((g) => g.sovPoints)).toEqual([null, null])
})

test('more than one own domain: each is listed with its own count and percentage, and the sum is never paired with one percentage', () => {
  const own = { ...PULL.ownBrand, domains: ['example.com', 'shop.example.com'] }
  const domains = [...PULL.domains, { domain: 'shop.example.com', classification: 'OWN', retrieved_chat_count: 11, retrieval_count: 20, usage_rate: 20, retrieved_percentage: 0.01, mentioned_brands: [] }]
  const d = buildSnapshotData({ ...PULL, ownBrand: own, domains }, '2026-10-08T15:00:00Z')
  expect(d.ownSites).toEqual([{ domain: 'example.com', retrievedChats: 1989, retrievedPct: 22.4 }, { domain: 'shop.example.com', retrievedChats: 11, retrievedPct: 1 }])
  expect(d.ownRetrievedChats).toBe(2000)
  expect(d.ownRetrievedPct).toBeNull()
  expect(d.notes).toContainEqual({ kind: 'own_domains', text: 'The brand has 2 own domains with retrievals; each is listed with its own count and percentage.' })
})

test('one own domain adds no own-domains note', () => {
  expect(texts(buildSnapshotData(PULL, '2026-10-08T15:00:00Z').notes).join(' ')).not.toContain('own domains')
})

test('an empty source mix says so in a note', () => {
  const domains = PULL.domains.map((r) => ({ ...r, retrieval_count: 0, usage_rate: 0 }))
  const d = buildSnapshotData({ ...PULL, domains }, '2026-10-08T15:00:00Z')
  expect(d.sourceMix).toEqual([])
  expect(texts(d.notes)).toContain('Peec reported no source weights for this window, so the source mix is empty.')
  expect(texts(buildSnapshotData(PULL, '2026-10-08T15:00:00Z').notes).join(' ')).not.toContain('no source weights')
})

test('competitor gap domains are capped at 4, the top by retrieved chats', () => {
  const gap = (n: number) => ({ domain: `gap${n}.com`, classification: 'COMPETITOR', retrieved_chat_count: 100 * n, retrieval_count: 1, usage_rate: 1, mentioned_brands: [{ id: 'kw_a' }] })
  const d = buildSnapshotData({ ...PULL, domains: [...PULL.domains.filter((r) => r.domain === 'example.com'), ...[1, 2, 3, 4, 5].map(gap)] }, '2026-10-08T15:00:00Z')
  expect(d.gapDomains.map((g) => g.domain)).toEqual(['gap5.com', 'gap4.com', 'gap3.com', 'gap2.com'])
})

const gapRow = (domain: string, classification: string, chats = 100, mentioned = ['kw_a']) => ({ domain, classification, retrieved_chat_count: chats, retrieval_count: 1, usage_rate: 1, mentioned_brands: mentioned.map((id) => ({ id })) })
const gapsOf = (p: PeecPull, decisions?: MetricDecisions) => buildSnapshotData(p, '2026-10-08T15:00:00Z', decisions).gapDomains.map((g) => g.domain)

test('a competitor site counts by its roster domain or a subdomain, whatever its class and mentions; a third-party site never does', () => {
  const domains = [
    gapRow('www.beta.com', 'CORPORATE', 90, []),
    gapRow('shop.alpha.com', 'EDITORIAL', 80, []),
    gapRow('notalpha.com', 'EDITORIAL', 70),
    gapRow('rival-site.com', 'COMPETITOR', 60),
    gapRow('forum.com', 'UGC', 50),
  ]
  expect(gapsOf({ ...PULL, domains })).toEqual(['www.beta.com', 'shop.alpha.com', 'rival-site.com'])
})

test('a roster domain matches with or without www. on either side, and a blank roster entry matches nothing', () => {
  const roster = PULL.roster.map((b) => (b.id === 'kw_b' ? { ...b, domains: ['www.beta.com', ' '] } : b))
  const domains = [gapRow('beta.com', 'CORPORATE', 90, []), gapRow('www.alpha.com', 'CORPORATE', 70, []), gapRow('trailing.com.', 'CORPORATE', 80, [])]
  expect(gapsOf({ ...PULL, roster, domains })).toEqual(['beta.com', 'www.alpha.com'])
})

test('the brand\'s own site never counts, and own wins when a competitor\'s roster shares its domain', () => {
  const roster = PULL.roster.map((b) => (b.id === 'kw_a' ? { ...b, domains: ['alpha.com', 'example.com'] } : b))
  // shop.alpha.com is a compared competitor's subdomain that Peec files as OWN: the class alone keeps it out.
  const domains = [gapRow('mine.com', 'OWN'), gapRow('blog.example.com', 'COMPETITOR', 90), gapRow('help.example.com', 'CORPORATE', 80, []), gapRow('shop.alpha.com', 'OWN', 70, []), gapRow('alpha.com', 'COMPETITOR', 50)]
  expect(gapsOf({ ...PULL, roster, domains })).toEqual(['alpha.com'])
})

test('a competitor site that mentions the brand is never a gap (decision D1)', () => {
  const domains = [gapRow('alpha.com', 'COMPETITOR', 100, ['kw_a', 'kw_own']), gapRow('beta.com', 'CORPORATE', 90, ['kw_own']), gapRow('compare.alpha.com', 'COMPETITOR', 10)]
  expect(gapsOf({ ...PULL, domains })).toEqual(['compare.alpha.com'])
})

test('a COMPETITOR site off every compared competitor\'s roster domains needs one in its mentions; a roster site with none still counts (decision D3)', () => {
  const domains = [gapRow('rival-site.com', 'COMPETITOR', 100, []), gapRow('other.com', 'COMPETITOR', 90, ['kw_x']), gapRow('alpha.com', 'CORPORATE', 10, [])]
  expect(gapsOf({ ...PULL, domains })).toEqual(['alpha.com'])
})

test('a compared brand with no roster row is matched by Peec\'s class only (spec §10 r2-3)', () => {
  const brands = [...PULL.brands, { brand: { id: 'kw_c', name: 'Gamma' }, visibility: 0.05, share_of_voice: 0.05, position: 4 }]
  const domains = [gapRow('gamma.com', 'COMPETITOR', 100, ['kw_c']), gapRow('gamma-news.com', 'EDITORIAL', 90, ['kw_c'])]
  expect(gapsOf({ ...PULL, brands, domains })).toEqual(['gamma.com'])
})

test('a competitor cut by rankAmong never counts, even on a COMPETITOR page that mentions a compared one (decision D4 (a))', () => {
  const domains = [gapRow('beta.com', 'CORPORATE', 100, []), gapRow('compare.beta.com', 'COMPETITOR', 90), gapRow('beta-vs.com', 'COMPETITOR', 80, ['kw_b']), gapRow('alpha.com', 'COMPETITOR', 70)]
  // rankAmong 2 keeps the brand and Alpha (26.1%); Beta (18.5%) is cut.
  expect(gapsOf({ ...PULL, domains }, { rankAmong: 2, competitorSiteGaps: true, sourceMixWeight: 'usage_rate' })).toEqual(['alpha.com'])
})

// Paul, #413 review: the closest roster domain decides whose site it is, so a cut competitor's parent domain never hides a
// kept competitor's subdomain, and a kept parent never claims a cut competitor's subdomain.
test('the closest roster domain decides between a kept and a cut competitor; a domain on both rosters goes to the charted one', () => {
  const roster = PULL.roster.map((b) => (b.id === 'kw_a' ? { ...b, domains: ['alpha.parent.com', 'parent2.com', 'both.com'] } : b.id === 'kw_b' ? { ...b, domains: ['parent.com', 'beta.parent2.com', 'both.com'] } : b))
  const domains = [
    gapRow('alpha.parent.com', 'CORPORATE', 100, []), gapRow('parent.com', 'CORPORATE', 90, []), gapRow('beta.parent2.com', 'CORPORATE', 85, []),
    gapRow('shop.parent.com', 'CORPORATE', 80, []), gapRow('parent2.com', 'CORPORATE', 70, []), gapRow('deep.alpha.parent.com', 'CORPORATE', 60, []),
    gapRow('both.com', 'CORPORATE', 50, []),
  ]
  // rankAmong 2 keeps the brand and Alpha (26.1%); Beta (18.5%) is cut. both.com is on both rosters: since the round 3 QA
  // review it goes to the charted competitor (Alpha), where it used to stay cut.
  expect(gapsOf({ ...PULL, roster, domains }, { rankAmong: 2, competitorSiteGaps: true, sourceMixWeight: 'usage_rate' })).toEqual(['alpha.parent.com', 'parent2.com', 'deep.alpha.parent.com', 'both.com'])
})

// Spec 2026-10-22 (round 3 QA) F1: the gaps list only the competitors the bar chart shows (the top 10 with the brand).
const wide = (n: number, ownIndex: number, extra: Partial<PeecPull> = {}): PeecPull => {
  const ids = Array.from({ length: n }, (_, i) => (i === ownIndex ? 'kw_own' : `kw_${i}`))
  return {
    ...PULL,
    roster: ids.map((id, i) => ({ id, name: id === 'kw_own' ? 'Example Co' : `Rival${i}`, is_own: id === 'kw_own', domains: [id === 'kw_own' ? 'example.com' : `rival${i}.com`] })),
    ownBrand: { id: 'kw_own', name: 'Example Co', is_own: true, domains: ['example.com'] },
    brands: ids.map((id, i) => ({ brand: { id, name: id === 'kw_own' ? 'Example Co' : `Rival${i}` }, visibility: (60 - i) / 100, share_of_voice: 0.05, position: 3 })),
    ...extra,
  }
}

test('F1: an 11th-ranked competitor\'s own site is not a gap; a charted competitor\'s is', () => {
  const domains = [gapRow('rival10.com', 'COMPETITOR', 100, ['kw_10']), gapRow('rival1.com', 'COMPETITOR', 50, ['kw_1']), gapRow('www.rival11.com', 'CORPORATE', 90, [])]
  expect(gapsOf(wide(12, 0, { domains }))).toEqual(['rival1.com'])
})

test('F1: with the brand ranked 12th, the nine charted competitors give the gaps', () => {
  const domains = [gapRow('rival9.com', 'CORPORATE', 100, []), gapRow('rival8.com', 'CORPORATE', 90, []), gapRow('rival10.com', 'CORPORATE', 80, [])]
  expect(gapsOf(wide(12, 11, { domains }))).toEqual(['rival8.com'])
})

test('F1: a competitor with no Peec row is not charted, so its site is not a gap', () => {
  const p = wide(3, 0)
  const roster = [...p.roster, { id: 'kw_nodata', name: 'Nodata', is_own: false, domains: ['nodata.com'] }]
  const domains = [gapRow('nodata.com', 'COMPETITOR', 100, ['kw_nodata']), gapRow('rival1.com', 'COMPETITOR', 50, ['kw_1'])]
  expect(gapsOf({ ...p, roster, domains })).toEqual(['rival1.com'])
})

test('F1: competitors tied at the 10th bar give the chart and the gaps the same set', () => {
  const p = wide(12, 0)
  // Rival9, Rival10 and Rival11 tie for the 10th bar; only one is charted. The two left off get the most retrievals.
  const brands = p.brands.map((b, i) => (i >= 9 ? { ...b, visibility: 0.4 } : b))
  const domains = p.roster.filter((r) => !r.is_own).map((r, i) => gapRow(r.domains![0], 'CORPORATE', 10 + i, []))
  const d = buildSnapshotData({ ...p, brands, domains }, '2026-10-08T15:00:00Z')
  const charted = chartedBrands(d.brands).filter((b) => !b.isOwn).map((b) => `${b.name.toLowerCase()}.com`)
  expect(charted).toHaveLength(9)
  expect(d.gapDomains).toHaveLength(4)
  for (const g of d.gapDomains) expect(charted).toContain(g.domain)
  expect(['rival9.com', 'rival10.com', 'rival11.com'].filter((x) => d.gapDomains.some((g) => g.domain === x))).toHaveLength(1)
})

// Round 3 QA final review: a domain on a charted and an uncharted competitor's roster is the charted one's site.
test('F1: a domain shared by a charted and an off-chart competitor is a gap', () => {
  const p = wide(12, 0)
  const roster = p.roster.map((r) => (r.id === 'kw_1' || r.id === 'kw_11' ? { ...r, domains: ['shared.com'] } : r))
  expect(gapsOf({ ...p, roster, domains: [gapRow('shared.com', 'CORPORATE', 100, [])] })).toEqual(['shared.com'])
})

// Round 3 QA final review: a COMPETITOR page off every roster counts only when every tracked competitor it mentions is
// charted, so an off-chart competitor's own page is never listed for mentioning a charted rival.
test('F1: a COMPETITOR page that mentions an off-chart competitor is not a gap; an untracked mention does not matter', () => {
  const p = wide(12, 0)
  const roster = p.roster.map((r) => (r.id === 'kw_11' ? { ...r, domains: [] } : r))
  const domains = [gapRow('vs-page.com', 'COMPETITOR', 100, ['kw_11', 'kw_1']), gapRow('compare.com', 'COMPETITOR', 90, ['kw_1', 'kw_untracked'])]
  expect(gapsOf({ ...p, roster, domains })).toEqual(['compare.com'])
})

// Adversarial review of #420 (I1): a COMPETITOR page off every roster belongs to the tracked competitor whose name its
// domain spells (ynab.com is YNAB), so a charted competitor with a missing roster domain keeps its site, whatever else
// the page mentions, and an off-chart competitor's site found by name is never listed.
test('F1: an off-roster COMPETITOR page goes to the competitor its domain names; mentions decide only when no name does', () => {
  const p = wide(12, 0)
  const roster = p.roster.map((r) => (r.id === 'kw_1' || r.id === 'kw_11' ? { ...r, domains: [] } : r))
  const domains = [
    gapRow('rival1.com', 'COMPETITOR', 100, ['kw_1', 'kw_11']),
    gapRow('www.rival11.com', 'COMPETITOR', 90, ['kw_2']),
    gapRow('vs-page.com', 'COMPETITOR', 80, ['kw_11', 'kw_2']),
    gapRow('compare.com', 'COMPETITOR', 70, ['kw_2']),
  ]
  expect(gapsOf({ ...p, roster, domains })).toEqual(['rival1.com', 'compare.com'])
})

test('F1: a cut parent domain never hides a charted competitor\'s subdomain', () => {
  const p = wide(12, 0)
  const roster = p.roster.map((r) => (r.id === 'kw_11' ? { ...r, domains: ['parent.com'] } : r.id === 'kw_1' ? { ...r, domains: ['one.parent.com'] } : r))
  expect(gapsOf({ ...p, roster, domains: [gapRow('one.parent.com', 'CORPORATE', 100, []), gapRow('parent.com', 'CORPORATE', 90, [])] })).toEqual(['one.parent.com'])
})

test('with no competitors tracked no site is listed, even a COMPETITOR site naming a brand Peec still reports', () => {
  const brands = [PULL.brands[1], { brand: { id: 'kw_s', name: 'Strayco' }, visibility: 0.3, share_of_voice: 0.2, position: 2 }]
  expect(gapsOf({ ...PULL, roster: [PULL.roster[0]], brands, domains: [gapRow('stray.com', 'COMPETITOR', 100, ['kw_s'])] })).toEqual([])
})

test('a domain with no retrieved chats is never a gap, so a sentence cannot list one "at 0" (final review M3)', () => {
  const domains = [gapRow('open.com', 'COMPETITOR', 40), gapRow('zero.com', 'COMPETITOR', 0), { ...gapRow('none.com', 'COMPETITOR'), retrieved_chat_count: null }]
  const d = buildSnapshotData({ ...PULL, domains }, '2026-10-08T15:00:00Z')
  expect(d.gapDomains).toEqual([{ domain: 'open.com', retrievedChats: 40 }])
})

const REF = (id: string, name: string, own = false) => ({ id, name, is_own: own, domains: [`${id}.example`] })
const ROW = (id: string, name: string, visibility: number) => ({ brand: { id, name }, visibility, share_of_voice: 0.1, position: 2 })

test('ties share a rank and the next brand skips one (1, 2, 2, 4)', () => {
  const roster = [REF('kw_own', 'Own', true), REF('kw_a', 'A'), REF('kw_b', 'B'), REF('kw_c', 'C')]
  const brands = [ROW('kw_a', 'A', 0.3), ROW('kw_own', 'Own', 0.2001), ROW('kw_b', 'B', 0.2004), ROW('kw_c', 'C', 0.1)]
  const d = buildSnapshotData({ ...PULL, roster, ownBrand: roster[0], brands }, '2026-10-08T15:00:00Z')
  expect(d.brands.map((b) => [b.name, b.rank])).toEqual([['A', 1], ['B', 2], ['Own', 2], ['C', 4]])
  expect(d.kpis.at(-1)).toEqual({ label: 'Competitive rank', value: '#2 of 4 brands' })
})

test('a rival tied with the brand on displayed visibility is not a leader gap', () => {
  const roster = [REF('kw_own', 'Own', true), REF('kw_a', 'A'), REF('kw_b', 'B')]
  const brands = [ROW('kw_a', 'A', 0.3), ROW('kw_own', 'Own', 0.2001), ROW('kw_b', 'B', 0.2004)]
  const d = buildSnapshotData({ ...PULL, roster, ownBrand: roster[0], brands }, '2026-10-08T15:00:00Z')
  expect(d.leaderGaps.map((g) => g.name)).toEqual(['A'])
})

test('a roster brand with no row counts in n and the k note, and is not in brands', () => {
  const roster = [REF('kw_own', 'Own', true), REF('kw_a', 'A'), REF('kw_z', 'Zed')]
  const brands = [ROW('kw_a', 'A', 0.3), ROW('kw_own', 'Own', 0.2)]
  const d = buildSnapshotData({ ...PULL, roster, ownBrand: roster[0], brands }, '2026-10-08T15:00:00Z')
  expect(d.brands.map((b) => b.name)).toEqual(['A', 'Own'])
  expect(d.rankN).toBe(3)
  expect(d.kpis.at(-1)).toEqual({ label: 'Competitive rank', value: '#2 of 3 brands' })
  expect(texts(d.notes)).toContain('Rank is by visibility among the 3 brands tracked in Peec.')
  expect(texts(d.notes)).toContain('1 tracked brand has no Peec data in this window and counts as zero visibility.')
})

test('worked example: roster 8, rows 6, rankAmong 7 gives n 7 and the first no-data competitor by id fills the last slot', () => {
  const roster = [REF('kw_own', 'Own', true), ...['a', 'b', 'c', 'd', 'e', 'y', 'x'].map((s) => REF(`kw_${s}`, s.toUpperCase()))]
  const brands = [ROW('kw_own', 'Own', 0.1), ROW('kw_a', 'A', 0.6), ROW('kw_b', 'B', 0.5), ROW('kw_c', 'C', 0.4), ROW('kw_d', 'D', 0.3), ROW('kw_e', 'E', 0.2)]
  const d = buildSnapshotData({ ...PULL, roster, ownBrand: roster[0], brands }, '2026-10-08T15:00:00Z', { ...DEFAULTS, rankAmong: 7 })
  expect(d.rankN).toBe(7)
  expect(d.brands.map((b) => b.name)).toEqual(['A', 'B', 'C', 'D', 'E', 'Own'])
  expect(d.kpis.at(-1)).toEqual({ label: 'Competitive rank', value: '#6 of 7 brands' })
  expect(texts(d.notes)).toContain('Rank is by visibility among 7 of the 8 brands tracked in Peec: the brand and the competitors with the highest visibility.')
  expect(texts(d.notes)).toContain('2 tracked brands have no Peec data in this window and count as zero visibility.')
})

test('a note says when the data covers fewer days than the range Ryan picked, and not when it covers them all', () => {
  expect(texts(buildSnapshotData(PULL, '2026-10-08T15:00:00Z').notes)).toContain('You asked for Sep 9, 2026 to Oct 8, 2026. Peec has data for Oct 1, 2026 to Oct 8, 2026, so the report covers those days.')
  const same = buildSnapshotData({ ...PULL, requested: { ...PULL.window } }, '2026-10-08T15:00:00Z')
  expect(texts(same.notes).join(' ')).not.toContain('You asked for')
  const dflt = buildSnapshotData({ ...PULL, rangePicked: false }, '2026-10-08T15:00:00Z')
  expect(texts(dflt.notes).join(' ')).not.toContain('You asked for')
})

test('spec 18.10 row 1: a higher displayed visibility whose exact gap rounds to 0.0 is listed at 0.1, so rank and gaps agree', () => {
  const roster = [REF('kw_own', 'Own', true), REF('kw_a', 'A'), REF('kw_b', 'B')]
  const brands = [ROW('kw_own', 'Own', 0.12349), ROW('kw_a', 'A', 0.12351), ROW('kw_b', 'B', 0.05)]
  const d = buildSnapshotData({ ...PULL, roster, ownBrand: roster[0], brands }, '2026-10-08T15:00:00Z')
  expect(d.brands.map((b) => [b.name, b.visibilityPct])).toEqual([['A', 12.4], ['Own', 12.3], ['B', 5]])
  expect(d.kpis.at(-1)).toEqual({ label: 'Competitive rank', value: '#2 of 3 brands' })
  expect(d.leaderGaps).toEqual([{ name: 'A', visibilityPoints: 0.1, sovPoints: 0 }])
})

test('spec 18.10 row 2: a rival that also shows 12.3% is not a leader gap and the brand ranks first', () => {
  const roster = [REF('kw_own', 'Own', true), REF('kw_a', 'A'), REF('kw_b', 'B')]
  const brands = [ROW('kw_own', 'Own', 0.1231), ROW('kw_a', 'A', 0.1234), ROW('kw_b', 'B', 0.05)]
  const d = buildSnapshotData({ ...PULL, roster, ownBrand: roster[0], brands }, '2026-10-08T15:00:00Z')
  expect(d.brands.filter((b) => b.name !== 'B').map((b) => [b.name, b.visibilityPct, b.rank])).toEqual([['A', 12.3, 1], ['Own', 12.3, 1]])
  expect(d.kpis.at(-1)).toEqual({ label: 'Competitive rank', value: '#1 of 3 brands' })
  expect(d.leaderGaps).toEqual([])
})

test('a one-day window reads as that day alone, a longer one as X to Y', () => {
  expect(buildSnapshotData({ ...PULL, window: { start: '2026-10-05', end: '2026-10-05' } }, '2026-10-08T15:00:00Z').windowLabel).toBe('Oct 5, 2026')
  expect(buildSnapshotData(PULL, '2026-10-08T15:00:00Z').windowLabel).toBe('Oct 1, 2026 to Oct 8, 2026')
})

const WARN = (name: string, v: string) => `${name} shows ${v}% AI visibility, which is unusually high. Check this brand's setup in Peec before sending: a name that is a common word can match unrelated answers.`
const withVis = (own: number, ...others: [string, number][]) => {
  const roster = [REF('kw_own', 'Own', true), ...others.map(([n]) => REF(`kw_${n}`, n))]
  const brands = [ROW('kw_own', 'Own', own), ...others.map(([n, v]) => ROW(`kw_${n}`, n, v))]
  return buildSnapshotData({ ...PULL, roster, ownBrand: roster[0], brands }, '2026-10-08T15:00:00Z')
}

test('a competitor above 90% displayed visibility adds the warning note, after the rank note and before the Requested note', () => {
  const d = withVis(0.2, ['Ace', 0.9051])
  expect(texts(d.notes)).toContain(WARN('Ace', '90.5'))
  const at = texts(d.notes).indexOf(WARN('Ace', '90.5'))
  const rank = texts(d.notes).findIndex((n) => n.startsWith('Rank is by visibility'))
  const requested = texts(d.notes).findIndex((n) => n.startsWith('You asked for '))
  expect(rank).toBeGreaterThanOrEqual(0)
  expect(requested).toBeGreaterThanOrEqual(0)
  expect(at).toBeGreaterThan(rank)
  expect(at).toBeLessThan(requested)
})

test('90.0% exactly does not warn, 90.1% does', () => {
  expect(texts(withVis(0.2, ['Ace', 0.9]).notes).filter((n) => n.includes('unusually high'))).toEqual([])
  expect(texts(withVis(0.2, ['Ace', 0.901]).notes)).toContain(WARN('Ace', '90.1'))
})

test('95 prints as 95.0, and the own brand is warned too', () => {
  const d = withVis(0.95, ['Ace', 0.3])
  expect(texts(d.notes)).toContain(WARN('Own', '95.0'))
  expect(texts(d.notes).filter((n) => n.includes('unusually high'))).toHaveLength(1)
})

test('two brands above 90% give two notes, each after the rank note and before the Requested note', () => {
  const d = withVis(0.95, ['Ace', 0.986])
  const warns = texts(d.notes).filter((n) => n.includes('unusually high'))
  expect(warns).toHaveLength(2)
  expect(warns).toContain(WARN('Own', '95.0'))
  expect(warns).toContain(WARN('Ace', '98.6'))
  const rank = texts(d.notes).findIndex((n) => n.startsWith('Rank is by visibility'))
  const requested = texts(d.notes).findIndex((n) => n.startsWith('You asked for '))
  expect(rank).toBeGreaterThanOrEqual(0)
  expect(requested).toBeGreaterThanOrEqual(0)
  for (const w of warns) {
    expect(texts(d.notes).indexOf(w)).toBeGreaterThan(rank)
    expect(texts(d.notes).indexOf(w)).toBeLessThan(requested)
  }
})

test('the warning stays out of the page data and the Data block', () => {
  const hot = withVis(0.95, ['Ace', 0.986])
  expect(JSON.stringify({ ...hot, notes: null })).not.toContain('unusually high')
  expect(dataBlock(hot)).not.toContain('unusually high')
})

test('data is schema version 2, with the project status and the settings this generation used', () => {
  const d = buildSnapshotData(PULL, '2026-10-08T15:00:00Z', { ...DEFAULTS, rankAmong: 3 }, { peecOpportunityRows: 2, methodologyStatesPromptsAndModels: false, fixedNextStep: 'Book a working session.' })
  expect(d.schemaVersion).toBe(2)
  expect(d.projectStatus).toBe('PITCH')
  expect(d.settingsUsed).toEqual({ rankAmong: 3, peecOpportunityRows: 2, methodologyStatesPromptsAndModels: false, fixedNextStep: 'Book a working session.' })
  expect(buildSnapshotData(PULL, '2026-10-08T15:00:00Z').settingsUsed).toEqual(V1_SETTINGS_USED)
})

test('every note is a structured Note with the kind its group needs, in the order v1.0 wrote them', () => {
  const d = buildSnapshotData({ ...PULL, profile: null, warnings: ["Peec's prompt count could not be loaded, so the methodology leaves it out."] }, '2026-10-08T15:00:00Z')
  expect(d.notes.every((n) => typeof n === 'object')).toBe(true)
  expect(d.notes.map((n) => (n as Note).kind)).toEqual(['rank_basis', 'requested_range', 'no_profile', 'peec_warning', 'project'])
  expect(d.notes).toContainEqual({ kind: 'peec_warning', text: "Peec's prompt count could not be loaded, so the methodology leaves it out." })
})

test('a missing share of voice or position is a missing_metric note; brands with no data are a no_data_brands note', () => {
  const brands = PULL.brands.map((b) => (b.brand.id === 'kw_own' ? { ...b, share_of_voice: null } : b))
  expect(buildSnapshotData({ ...PULL, brands }, '2026-10-08T15:00:00Z').notes).toContainEqual({ kind: 'missing_metric', text: 'Peec has no share of voice for the brand in this window, so that card is left out.' })
  const roster = [...PULL.roster, { id: 'kw_z', name: 'Zed', is_own: false, domains: [] }]
  expect(buildSnapshotData({ ...PULL, roster }, '2026-10-08T15:00:00Z').notes).toContainEqual({ kind: 'no_data_brands', text: '1 tracked brand has no Peec data in this window and counts as zero visibility.' })
})

test('V1_SETTINGS_USED is the four literal values v1.0 shipped with, frozen', () => {
  expect(V1_SETTINGS_USED).toEqual({ rankAmong: null, peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, fixedNextStep: null })
  expect(Object.isFrozen(V1_SETTINGS_USED)).toBe(true)
})

test('the kind of the remaining notes is pinned: no_competitors, high_visibility, empty_source_mix, own_domains with no rows', () => {
  const solo: PeecPull = { ...PULL, roster: [PULL.ownBrand], brands: [PULL.brands[1]] }
  expect(buildSnapshotData(solo, '2026-10-08T15:00:00Z').notes).toContainEqual(expect.objectContaining({ kind: 'no_competitors', text: 'No competitors tracked in this Peec project' }))
  expect(withVis(0.2, ['Ace', 0.9051]).notes).toContainEqual(expect.objectContaining({ kind: 'high_visibility', text: WARN('Ace', '90.5') }))
  const empty = buildSnapshotData({ ...PULL, domains: PULL.domains.map((r) => ({ ...r, retrieval_count: 0, usage_rate: 0 })) }, '2026-10-08T15:00:00Z')
  expect(empty.notes).toContainEqual(expect.objectContaining({ kind: 'empty_source_mix', text: 'Peec reported no source weights for this window, so the source mix is empty.' }))
  const none = buildSnapshotData({ ...PULL, domains: PULL.domains.filter((r) => r.domain !== 'example.com') }, '2026-10-08T15:00:00Z')
  expect(none.notes).toContainEqual(expect.objectContaining({ kind: 'own_domains', text: "No retrievals of the brand's own site in this window." }))
})

test('date and time in US Eastern, for the hub and the open list', () => {
  expect(fmtEasternDateTime(new Date('2026-10-02T15:00:00Z'))).toBe('Oct 2, 2026, 11:00 AM')
  expect(fmtEasternDateTime(new Date('2026-01-15T17:05:00Z'))).toBe('Jan 15, 2026, 12:05 PM')
})

test('spec 18.10 row 3: own rows are an own domain, its subdomain and an OWN row; a lookalike domain is not', () => {
  const ownBrand = { ...PULL.ownBrand, domains: ['Brand.com', ''] }
  const roster = [ownBrand, ...PULL.roster.slice(1)]
  const row = (domain: string, classification: string, chats: number) => ({ domain, classification, retrieved_chat_count: chats, retrieval_count: 1, usage_rate: 1, retrieved_percentage: chats / 1000, mentioned_brands: [] })
  const domains = [row('brand.com', 'EDITORIAL', 100), row('blog.brand.com', 'EDITORIAL', 40), row('other.com', 'OWN', 7), row('notbrand.com', 'EDITORIAL', 900)]
  const d = buildSnapshotData({ ...PULL, roster, ownBrand, domains }, '2026-10-08T15:00:00Z')
  expect(d.ownSites).toEqual([
    { domain: 'brand.com', retrievedChats: 100, retrievedPct: 10 },
    { domain: 'blog.brand.com', retrievedChats: 40, retrievedPct: 4 },
    { domain: 'other.com', retrievedChats: 7, retrievedPct: 0.7 },
  ])
  expect(d.ownRetrievedChats).toBe(147)
  expect(d.ownRetrievedPct).toBeNull()
  expect(d.notes).toContainEqual({ kind: 'own_domains', text: 'The brand has 3 own domains with retrievals; each is listed with its own count and percentage.' })
  expect(texts(d.notes).join(' ')).not.toContain("No retrievals of the brand's own site")
  expect(d.ownDomains).toEqual(['brand.com', ''])
})

test('an empty own domain matches nothing, so a brand with only that has no own rows', () => {
  const ownBrand = { ...PULL.ownBrand, domains: [''] }
  const roster = [ownBrand, ...PULL.roster.slice(1)]
  const domains = [{ domain: 'news.com', classification: 'EDITORIAL', retrieved_chat_count: 9, retrieval_count: 1, usage_rate: 1, mentioned_brands: [] }]
  const d = buildSnapshotData({ ...PULL, roster, ownBrand, domains }, '2026-10-08T15:00:00Z')
  expect(d.ownRetrievedChats).toBe(0)
  expect(d.ownSites).toEqual([])
  expect(texts(d.notes)).toContain("No retrievals of the brand's own site in this window.")
})

test("2026-10-19 Peec parity: the source mix weights by usage_rate, as Peec's dashboard does, and the row records it", () => {
  // PocketGuard's shape: by retrieval_count Competitor leads Editorial; by usage_rate Editorial leads.
  const domains = [
    { domain: 'cnbc.com', classification: 'EDITORIAL', retrieved_chat_count: 10, retrieval_count: 100, usage_rate: 0.9, mentioned_brands: [] },
    { domain: 'rival.com', classification: 'COMPETITOR', retrieved_chat_count: 10, retrieval_count: 200, usage_rate: 0.4, mentioned_brands: [] },
  ]
  const d = buildSnapshotData({ ...PULL, domains }, '2026-10-08T15:00:00Z')
  expect(d.sourceMix.map((s) => [s.label, s.pct])).toEqual([['Editorial', 69.2], ['Competitor', 30.8]])
  expect(d.sourceMixWeight).toBe('usage_rate')
  const old = buildSnapshotData({ ...PULL, domains }, '2026-10-08T15:00:00Z', { rankAmong: null, competitorSiteGaps: true, sourceMixWeight: 'retrieval_count' })
  expect(old.sourceMix.map((s) => [s.label, s.pct])).toEqual([['Competitor', 66.7], ['Editorial', 33.3]])
  expect(old.sourceMixWeight).toBe('retrieval_count')
})

test("2026-10-19 (Ryan): a report whose window ends on the pull's own UTC day says Peec can still update it, under Check these", () => {
  const same = buildSnapshotData({ ...PULL, pulledDay: '2026-10-08' }, '2026-10-08T15:00:00Z')
  const n = same.notes.filter((x) => typeof x !== 'string' && x.kind === 'same_day_data') as Note[]
  // Paul (#403): the advice must be true. A rerun keeps the dates, so it can warn again; leaving the day out is offered
  // only when the window has an earlier day with data. The day named is the window's own, as the report's Data window
  // prints it (UTC), never "the day it was generated", which a late-evening Eastern run would read as tomorrow.
  expect(n).toEqual([{ kind: 'same_day_data', text: "This report includes Oct 8, 2026, and Peec can still update that day's data, so these numbers may change. Rerun later to pick up Peec's latest numbers, or, to leave that day out, start a new report that ends Oct 7, 2026." }])
  const oneDay = buildSnapshotData({ ...PULL, window: { start: '2026-10-08', end: '2026-10-08' }, pulledDay: '2026-10-08' }, '2026-10-08T15:00:00Z')
  expect(oneDay.notes.filter((x) => typeof x !== 'string' && x.kind === 'same_day_data')).toEqual([{ kind: 'same_day_data', text: "This report includes Oct 8, 2026, and Peec can still update that day's data, so these numbers may change. Rerun later to pick up Peec's latest numbers." }])
  // Across a month boundary the day before is computed on the calendar.
  const firstDay = buildSnapshotData({ ...PULL, window: { start: '2026-09-28', end: '2026-10-01' }, pulledDay: '2026-10-01' }, '2026-10-01T15:00:00Z')
  expect(texts(firstDay.notes).find((t) => t.startsWith('This report includes'))).toContain('start a new report that ends Sep 30, 2026.')
  // The pull's day decides, not generatedAt: a run whose pull fell on Oct 8 still warns when it finishes after midnight.
  const late = buildSnapshotData({ ...PULL, pulledDay: '2026-10-08' }, '2026-10-09T00:01:00Z')
  expect(late.notes.some((x) => typeof x !== 'string' && x.kind === 'same_day_data')).toBe(true)
  for (const pulledDay of ['2026-10-09', '2026-11-30']) {
    const later = buildSnapshotData({ ...PULL, pulledDay }, '2026-10-08T15:00:00Z')
    expect(later.notes.some((x) => typeof x !== 'string' && x.kind === 'same_day_data'), pulledDay).toBe(false)
  }
})
