import { expect, test } from 'vitest'
import vectors from './round.vectors.json'
import { buildSnapshotData, fmtDay, fmtEasternDay, pyRound, titleClassification } from './metrics'
import type { MetricDecisions } from './metrics'
import type { PeecPull } from './pull'

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
  window: { start: '2026-10-01', end: '2026-10-08' },
  brands: [
    { brand: { id: 'kw_b', name: 'Beta' }, visibility: 0.185, share_of_voice: 0.169, position: 3.1 },
    { brand: { id: 'kw_own', name: 'Example Co' }, visibility: 0.151, share_of_voice: 0.159, position: 3.06 },
    { brand: { id: 'kw_a', name: 'Alpha' }, visibility: 0.261, share_of_voice: 0.225, position: 2.4 },
  ],
  domains: [
    { domain: 'example.com', classification: 'OWN', retrieved_chat_count: 1989, retrieval_count: 3698, retrieved_percentage: 0.2236 },
    { domain: 'alpha.com', classification: 'COMPETITOR', retrieved_chat_count: 1250, retrieval_count: 5902, mentioned_brands: [{ id: 'kw_a' }] },
    { domain: 'news.com', classification: 'EDITORIAL', retrieved_chat_count: 900, retrieval_count: 1000, mentioned_brands: [{ id: 'kw_own' }, { id: 'kw_a' }] },
    { domain: 'forum.com', classification: 'UGC', retrieved_chat_count: 300, retrieval_count: 400, mentioned_brands: [{ id: 'kw_b' }] },
    { domain: 'blank.com', classification: null, retrieved_chat_count: 5, retrieval_count: 0 },
  ],
  actions: [{ id: 'x', title: 'Give this page an H1 heading', impact: 'HIGH', type: 'SEO_ISSUE', status: 'PENDING' }],
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
  const d = buildSnapshotData(PULL, '2026-10-08T15:00:00Z')
  expect(d.sourceMix.map((s) => [s.label, s.weight])).toEqual([['Competitor', 5902], ['You', 3698], ['Editorial', 1000], ['UGC', 400]])
  expect(d.sourceMix.reduce((t, s) => t + s.weight, 0)).toBe(11000)
})

test('competitor gap domains: own brand absent, a competitor present, ranked by retrieved chats', () => {
  const d = buildSnapshotData(PULL, '2026-10-08T15:00:00Z')
  expect(d.gapDomains).toEqual([{ domain: 'alpha.com', retrievedChats: 1250 }, { domain: 'forum.com', retrievedChats: 300 }])
})

test('own site with no rows: zero chats, null percent, and a note', () => {
  const d = buildSnapshotData({ ...PULL, domains: PULL.domains.filter((r) => r.domain !== 'example.com') }, '2026-10-08T15:00:00Z')
  expect(d.ownRetrievedChats).toBe(0)
  expect(d.ownRetrievedPct).toBeNull()
  expect(d.notes.join(' ')).toContain('No retrievals of the brand\'s own site')
})

test('missing SOV or position drops that card (his three-card rule) and adds a note', () => {
  const brands = PULL.brands.map((b) => (b.brand.id === 'kw_own' ? { ...b, share_of_voice: null, position: null } : b))
  const d = buildSnapshotData({ ...PULL, brands }, '2026-10-08T15:00:00Z')
  expect(d.kpis.map((k) => k.label)).toEqual(['AI visibility', 'Competitive rank'])
  expect(d.notes.join(' ')).toContain('share of voice')
})

test('only the own brand tracked: no rank card, a note, no competitor gaps', () => {
  const solo: PeecPull = { ...PULL, roster: [PULL.ownBrand], brands: [PULL.brands[1]] }
  const d = buildSnapshotData(solo, '2026-10-08T15:00:00Z')
  expect(d.competitorsTracked).toBe(0)
  expect(d.kpis.map((k) => k.label)).not.toContain('Competitive rank')
  expect(d.notes).toContain('No competitors tracked in this Peec project')
})

test('no profile: category and market are null with a note', () => {
  const d = buildSnapshotData({ ...PULL, profile: null }, '2026-10-08T15:00:00Z')
  expect([d.category, d.market]).toEqual([null, null])
  expect(d.notes.join(' ')).toContain('no project profile')
})

const DEFAULTS: MetricDecisions = { rankAmong: null, competitorSiteGaps: true, sourceMixWeight: 'retrieval_count' }

test('two arguments read DECISIONS, whose defaults are every brand, site gaps on, retrieval_count', () => {
  expect(buildSnapshotData(PULL, '2026-10-08T15:00:00Z')).toEqual(buildSnapshotData(PULL, '2026-10-08T15:00:00Z', DEFAULTS))
  expect(buildSnapshotData(PULL, '2026-10-08T15:00:00Z').notes).toContain('Rank is by visibility among the 3 brands tracked in Peec.')
})

test('Q2: rankAmong N keeps the brand and its N - 1 most visible competitors', () => {
  const d = buildSnapshotData(PULL, '2026-10-08T15:00:00Z', { ...DEFAULTS, rankAmong: 2 })
  expect(d.brands.map((b) => [b.name, b.rank])).toEqual([['Alpha', 1], ['Example Co', 2]])
  expect(d.kpis.at(-1)).toEqual({ label: 'Competitive rank', value: '#2 of 2 brands' })
  expect(d.leaderGaps).toEqual([{ name: 'Alpha', visibilityPoints: 11, sovPoints: 6.6 }])
  expect(d.notes).toContain('Rank is by visibility among 2 of the 3 brands tracked in Peec: the brand and the competitors with the highest visibility.')
})

test('Q2: rankAmong at or above the tracked count changes nothing', () => {
  expect(buildSnapshotData(PULL, '2026-10-08T15:00:00Z', { ...DEFAULTS, rankAmong: 3 })).toEqual(buildSnapshotData(PULL, '2026-10-08T15:00:00Z', DEFAULTS))
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
  expect(d.sourceMix.map((s) => [s.label, s.weight])).toEqual([['You', 1989], ['Competitor', 1250], ['Editorial', 900], ['UGC', 300], ['Uncategorized', 5]])
  expect(d.sourceMix.reduce((t, s) => t + s.weight, 0)).toBe(4444)
})

test('leader gaps use the exact ratios, not the rounded percentages (spec 5a row 17)', () => {
  const brands = [
    { brand: { id: 'kw_a', name: 'Alpha' }, visibility: 0.2614, share_of_voice: 0.2234, position: 2.4 },
    { brand: { id: 'kw_own', name: 'Example Co' }, visibility: 0.1516, share_of_voice: 0.1585, position: 3.06 },
  ]
  const d = buildSnapshotData({ ...PULL, brands }, '2026-10-08T15:00:00Z')
  // Rounded first: 26.1 - 15.2 = 10.9 and 22.3 - 15.9 = 6.4. Exact: 10.98 -> 11 and 6.49 -> 6.5.
  expect(d.leaderGaps).toEqual([{ name: 'Alpha', visibilityPoints: 11, sovPoints: 6.5 }])
})

test('leader gap share of voice is null when either side has none', () => {
  const brands = PULL.brands.map((b) => (b.brand.id === 'kw_own' ? { ...b, share_of_voice: null } : b))
  const d = buildSnapshotData({ ...PULL, brands }, '2026-10-08T15:00:00Z')
  expect(d.leaderGaps.map((g) => g.sovPoints)).toEqual([null, null])
})

test('more than one own domain: the chat count adds them up, the percentage is the top domain, and a note says so', () => {
  const own = { ...PULL.ownBrand, domains: ['example.com', 'shop.example.com'] }
  const domains = [...PULL.domains, { domain: 'shop.example.com', classification: 'OWN', retrieved_chat_count: 11, retrieval_count: 20, retrieved_percentage: 0.01 }]
  const d = buildSnapshotData({ ...PULL, ownBrand: own, domains }, '2026-10-08T15:00:00Z')
  expect(d.ownRetrievedChats).toBe(2000)
  expect(d.ownRetrievedPct).toBe(22.4)
  expect(d.notes).toContain('The brand has 2 own domains with retrievals; the chat count adds them up and the percentage is for example.com only.')
})

test('one own domain adds no own-domains note', () => {
  expect(buildSnapshotData(PULL, '2026-10-08T15:00:00Z').notes.join(' ')).not.toContain('own domains')
})

test('an empty source mix says so in a note', () => {
  const domains = PULL.domains.map((r) => ({ ...r, retrieval_count: 0 }))
  const d = buildSnapshotData({ ...PULL, domains }, '2026-10-08T15:00:00Z')
  expect(d.sourceMix).toEqual([])
  expect(d.notes).toContain('Peec reported no source weights for this window, so the source mix is empty.')
  expect(buildSnapshotData(PULL, '2026-10-08T15:00:00Z').notes.join(' ')).not.toContain('no source weights')
})

test('competitor gap domains are capped at 4, the top by retrieved chats', () => {
  const gap = (n: number) => ({ domain: `gap${n}.com`, classification: 'EDITORIAL', retrieved_chat_count: 100 * n, retrieval_count: 1, mentioned_brands: [{ id: 'kw_a' }] })
  const d = buildSnapshotData({ ...PULL, domains: [...PULL.domains.filter((r) => r.domain === 'example.com'), ...[1, 2, 3, 4, 5].map(gap)] }, '2026-10-08T15:00:00Z')
  expect(d.gapDomains.map((g) => g.domain)).toEqual(['gap5.com', 'gap4.com', 'gap3.com', 'gap2.com'])
})
