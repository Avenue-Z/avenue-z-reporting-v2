import { expect, test } from 'vitest'
import { groundingFlags } from './grounding'
import { dataBlock } from './prompt'
import type { SnapshotData } from './metrics'
import type { Slots } from './slots'
import type { Note } from './notes'

const legacy = (ns: Note[]) => [...new Set(ns.map((n) => `${(n.path ?? '').split('.')[0]}: ${n.text}`))]
const D = { brands: [{ name: '7-Eleven' }], ownDomains: ['example.com'], gapDomains: [{ domain: 'alpha.com', retrievedChats: 1250 }], window: { start: '2026-10-01', end: '2026-10-08' }, brand: 'Example Co', windowLabel: 'Oct 1, 2026 to Oct 8, 2026', kpis: [] } as unknown as SnapshotData
const base: Slots = { category: 'c', market: 'm', headline: 'Ranks #3 of 12 with 15.1% visibility', summary: 's', context: '7-Eleven leads.', competitive_bullets: [{ lead: 'a', text: '1,989 chats on example.com in 2026' }, { lead: 'b', text: 'c' }], sources_bullets: [{ lead: 'a', text: 'alpha.com' }, { lead: 'b', text: 'c' }], why: 'w', opportunities: [0, 1, 2].map(() => ({ signal: 's', opportunity: 'o', workstream: 'w' })), methodology: 'm', next_step: 'n' }
const allowed = 'AI visibility 15.1% | rank #3 of 12 | own site 1,989 chats'

test('numbers in the data and exempt numbers pass', () => {
  expect(legacy(groundingFlags(base, D, allowed))).toEqual([])
})
test('a number not in the data is flagged with its field', () => {
  const s = { ...base, why: 'Visibility rose 12.5% this month' }
  expect(legacy(groundingFlags(s, D, allowed))).toEqual(['why: "12.5%" is not in the Peec data'])
})
test('a long dash is flagged', () => {
  const s = { ...base, why: `Strong ${String.fromCharCode(0x2014)} for now` }
  expect(legacy(groundingFlags(s, D, allowed))).toEqual(['why: contains a long dash; use a period or comma'])
})
test('a dash in a code-set field or a roster brand name is not flagged', () => {
  const dash = String.fromCharCode(0x2013)
  const d = { ...D, brands: [{ name: `Alpha${dash}Beta` }] } as unknown as SnapshotData
  const s = { ...base, category: `Fin${dash}tech`, context: `Alpha${dash}Beta leads.` }
  expect(legacy(groundingFlags(s, d, allowed))).toEqual([])
})
test('an unknown domain is flagged', () => {
  const s = { ...base, why: 'See competitor.io for more' }
  expect(legacy(groundingFlags(s, D, allowed))).toEqual(['why: "competitor.io" is not a domain in the Peec data'])
})

// The real Data block, not a hand-written string: the digits in names, domains and dates must not open the door.
const R = {
  brand: 'Example Co', windowLabel: 'Oct 1, 2026 to Oct 8, 2026', category: null, market: 'United States',
  window: { start: '2026-10-01', end: '2026-10-08' },
  brands: [
    { id: 'o', name: 'Example Co', isOwn: true, visibilityPct: 15.1, sovPct: 15.9, position: 3.1, rank: 3 },
    { id: 'f', name: 'Formula 7 Labs', isOwn: false, visibilityPct: 26.1, sovPct: 22.5, position: 2.2, rank: 1 },
  ],
  kpis: [{ label: 'AI visibility', value: '15.1%' }, { label: 'Average answer position', value: '#3.1' }], competitorsTracked: 11, rankN: 12,
  leaderGaps: [{ name: 'Formula 7 Labs', visibilityPoints: 11, sovPoints: 6.6 }], ownDomains: ['example.com'],
  ownRetrievedChats: 1989, ownRetrievedPct: 22.4, sourceMix: [{ label: 'Corporate', weight: 9, pct: 45 }],
  gapDomains: [{ domain: 'alpha.com', retrievedChats: 1250 }], actions: [], promptCount: 100, models: ['ChatGPT UI'], notes: [],
} as unknown as SnapshotData
const RT = dataBlock(R)
const plain: Slots = { ...base, headline: 'h', context: 'c', competitive_bullets: [{ lead: 'a', text: 't' }, { lead: 'b', text: 't' }], sources_bullets: [{ lead: 'a', text: 't' }, { lead: 'b', text: 't' }] }
const say = (why: string) => legacy(groundingFlags({ ...plain, why }, R, RT))

test('with the real Data block, figures of the wrong kind or from names and dates are flagged', () => {
  for (const [text, bad] of [['It appears in 7% of answers', '7%'], ['Visibility of 12% trails the leader', '12%'], ['Retrieved in 100% of answers', '100%'], ['An 8% share of voice', '8%'], ['A gap of 11% to the leader', '11%'], ['Only 45% of sources', '45%']]) {
    expect(say(text)).toEqual([`why: "${bad}" is not in the Peec data`])
  }
})
test('with the real Data block, the data figures pass', () => {
  for (const t of ['Visibility is 15.1%', 'Ranks #3 of 12', 'It had 1,989 retrievals', 'A gap of 11 points', 'Data as of 2026', 'Share of voice 22.5%']) expect(say(t)).toEqual([])
})
test('with no competitors tracked an outside brand name is not exempt', () => {
  const d = { ...R, competitorsTracked: 0 } as unknown as SnapshotData
  const t = dataBlock(d)
  expect(legacy(groundingFlags({ ...plain, why: 'Formula 7 Labs leads' }, d, t))).toEqual(['why: "7" is not in the Peec data'])
  expect(legacy(groundingFlags({ ...plain, why: 'Example Co leads' }, d, t))).toEqual([])
})

test('with no competitors tracked the hidden context slot is never flagged; other slots still are', () => {
  const d = { ...R, competitorsTracked: 0 } as unknown as SnapshotData
  const t = dataBlock(d)
  const dash = String.fromCharCode(0x2014)
  const s = { ...plain, context: `Visibility rose 99% ${dash} see competitor.io`, why: 'Visibility rose 99%' }
  expect(legacy(groundingFlags(s, d, t))).toEqual(['why: "99%" is not in the Peec data'])
  // With competitors tracked the same context is shown, so it is flagged.
  expect(legacy(groundingFlags(s, R, RT)).filter((f) => f.startsWith('context:'))).toHaveLength(3)
})

test('the window days are allowed as bare numbers but not as percentages or ranks', () => {
  const d = { ...R, windowLabel: 'Sep 9, 2026 to Oct 8, 2026', window: { start: '2026-09-09', end: '2026-10-08' } } as unknown as SnapshotData
  const text = dataBlock(d)
  const run = (why: string) => legacy(groundingFlags({ ...plain, why }, d, text))
  expect(run('Peec data from Sep 9, 2026 to Oct 8, 2026')).toEqual([])
  expect(run('An 8% share of voice')).toEqual(['why: "8%" is not in the Peec data'])
  expect(run('9% of answers')).toEqual(['why: "9%" is not in the Peec data'])
  expect(run('Ranked #8')).toEqual(['why: "#8" is not in the Peec data'])
})
test('a whole realistic good reply produces no flags', () => {
  const d = { ...R, windowLabel: 'Sep 9, 2026 to Oct 8, 2026', window: { start: '2026-09-09', end: '2026-10-08' } } as unknown as SnapshotData
  const text = dataBlock(d)
  const good: Slots = {
    category: 'Skincare', market: 'United States',
    headline: 'Example Co ranks #3 of 12 brands with 15.1% visibility',
    summary: 'Formula 7 Labs leads with 26.1% visibility.',
    context: 'Formula 7 Labs leads with 26.1% visibility and 22.5% share of voice, ahead of Example Co at #3.',
    competitive_bullets: [{ lead: 'Own site:', text: 'The site was retrieved in 1,989 answers, 22.4% of answers on example.com.' }, { lead: 'Position:', text: 'Average answer position is #3.1.' }],
    sources_bullets: [{ lead: 'Gap:', text: 'alpha.com was used in 1,250 answers where the brand is absent.' }, { lead: 'Visibility:', text: 'The gap to Formula 7 Labs is 11 points.' }],
    why: 'The pattern may affect consideration.',
    opportunities: [{ signal: 'Peec recommends fixing a heading', opportunity: 'Explore it', workstream: 'Technical AEO / SEO' }, { signal: 'alpha.com is cited often', opportunity: 'Investigate', workstream: 'PR / earned media' }, { signal: 'Share of voice is 15.9%', opportunity: 'Test content', workstream: 'Content / AEO' }],
    methodology: 'Peec data from Sep 9, 2026 to Oct 8, 2026 across 12 brands, 100 prompts on ChatGPT UI. Results are directional.',
    next_step: 'A full AEO audit.',
  }
  expect(legacy(groundingFlags(good, d, text))).toEqual([])
})

test('a methodology naming a one-day window passes grounding', () => {
  const d = { ...R, windowLabel: 'Oct 5, 2026', window: { start: '2026-10-05', end: '2026-10-05' } } as unknown as SnapshotData
  const text = dataBlock(d)
  expect(legacy(groundingFlags({ ...plain, why: 'Peec data from Oct 5, 2026' }, d, text))).toEqual([])
})

test('long-dash exemption (spec v1.1 §16.1): category on version 1 always, on version 2 only while it is the code value; next_step only while it is the fixed sentence; market always', () => {
  const dash = String.fromCharCode(0x2014)
  const fixed = 'A fixed sentence.'
  const v2 = { ...D, schemaVersion: 2, category: `Fin${dash}tech`, settingsUsed: { rankAmong: null, peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, fixedNextStep: fixed } } as unknown as SnapshotData
  const flag = (path: string) => `${path}: contains a long dash; use a period or comma`
  // Peec's own category, untouched, and the untouched fixed sentence: Glean can't fix either, so no flag.
  expect(legacy(groundingFlags({ ...base, category: `Fin${dash}tech`, market: `U${dash}S`, next_step: fixed }, v2, allowed))).toEqual([])
  // A written or edited category with a dash.
  expect(legacy(groundingFlags({ ...base, category: `Consumer ${dash} lending`, next_step: fixed }, v2, allowed))).toEqual([flag('category')])
  // An edited next step with a dash.
  expect(legacy(groundingFlags({ ...base, category: `Fin${dash}tech`, next_step: `Book ${dash} soon` }, v2, allowed))).toEqual([flag('next_step')])
  // No Peec category: the code value is Needs validation.
  const noCategory = { ...v2, category: null } as unknown as SnapshotData
  expect(legacy(groundingFlags({ ...base, category: 'Needs validation', next_step: fixed }, noCategory, allowed))).toEqual([])
  // Version 1 (no schemaVersion, no settingsUsed): category always exempt; next_step never, its fixed sentence was null.
  expect(legacy(groundingFlags({ ...base, category: `Consumer ${dash} lending`, next_step: `Book ${dash} soon` }, D, allowed))).toEqual([flag('next_step')])
})

const KPIS = [{ label: 'AI visibility', value: '15.5%' }, { label: 'AI share of voice', value: '15.9%' }, { label: 'Average answer position', value: '#3.1' }, { label: 'Competitive rank', value: '#3 of 12 brands' }]
const RK = { ...R, kpis: KPIS } as unknown as SnapshotData
const RKT = dataBlock(RK)
const withKpi = (i: number, value: string, label?: string) => groundingFlags({ ...plain, kpis: KPIS.map((k, j) => (j === i ? { label: label ?? k.label, value } : k)) }, RK, RKT)

test("the KPI comparison: a value is compared with Peec's after removing %, # and commas, at Peec's displayed precision", () => {
  expect(withKpi(0, '16%')).toEqual([{ kind: 'kpi_changed', path: 'kpis.0.value', text: 'AI visibility shows 16% but Peec says 15.5%' }])
  expect(withKpi(0, '15.5')).toEqual([])
  expect(withKpi(0, '15.50%')).toEqual([])
  expect(withKpi(2, '3.1')).toEqual([])
  expect(withKpi(0, '15.5%', 'Visibility in AI answers')).toEqual([])
})

test('the KPI comparison: the rank card is compared by its number tokens, in order', () => {
  expect(withKpi(3, '#2 of 12 brands')).toEqual([{ kind: 'kpi_changed', path: 'kpis.3.value', text: 'Competitive rank shows #2 of 12 brands but Peec says #3 of 12 brands' }])
  expect(withKpi(3, '#3 of 12')).toEqual([])
  expect(withKpi(3, 'Third of 12')).toHaveLength(1)
})

test('a KPI value with words or another unit is reported, never thrown on', () => {
  for (const v of ['about 15%', '15.5 pts', '%', 'n/a']) expect(() => withKpi(0, v)).not.toThrow()
  expect(withKpi(0, 'about 15%')).toHaveLength(1)
  expect(withKpi(0, '15.5 pts')).toHaveLength(1)
})

test("the window label is compared as text with Peec's", () => {
  expect(groundingFlags({ ...plain, window_label: 'Oct 2, 2026 to Oct 8, 2026' }, R, RT)).toEqual([
    { kind: 'kpi_changed', path: 'window_label', text: 'Data window shows Oct 2, 2026 to Oct 8, 2026 but Peec says Oct 1, 2026 to Oct 8, 2026' },
  ])
})

test('the brand_changed note counts the slots that still say the Peec name, and the edited brand is exempt', () => {
  const s = { ...plain, brand: 'Example 9 Co', headline: 'Example Co leads', why: 'Example 9 Co grows' }
  expect(groundingFlags(s, R, RT)).toEqual([{ kind: 'brand_changed', path: 'brand', text: 'The copy still says Example Co in 1 place' }])
  expect(groundingFlags({ ...s, summary: 'Example Co again' }, R, RT).at(-1)).toEqual({ kind: 'brand_changed', path: 'brand', text: 'The copy still says Example Co in 2 places' })
  expect(groundingFlags({ ...plain, brand: 'Example 9 Co' }, R, RT)).toEqual([])
})

test('avenuez.com is always an allowed domain, on every slot', () => {
  expect(groundingFlags({ ...plain, why: 'See avenuez.com for more', page: { footer_link: 'avenuez.com/aeo ↗' } }, R, RT)).toEqual([])
})

test('every slot is checked: a KPI label or page word with a number not in the data is flagged with its full path', () => {
  expect(groundingFlags({ ...plain, page: { opps_title: 'Seven 77 ideas' }, kpis: [{ label: 'Top 9 rank', value: '15.1%' }, { label: 'Average answer position', value: '#3.1' }] }, R, RT)).toEqual([
    { kind: 'number_not_in_data', path: 'kpis.0.label', text: '"9" is not in the Peec data' },
    { kind: 'number_not_in_data', path: 'page.opps_title', text: '"77" is not in the Peec data' },
  ])
})

test('next_step is set by code only when the row was generated with a fixed sentence: read from the row, never live settings', () => {
  const dash = String.fromCharCode(0x2014)
  const s = { ...plain, next_step: `Book a call ${dash} soon` }
  expect(groundingFlags(s, R, RT)).toEqual([{ kind: 'long_dash', path: 'next_step', text: 'contains a long dash; use a period or comma' }])
  const fixed = { ...R, schemaVersion: 2, settingsUsed: { rankAmong: null, peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, fixedNextStep: `Book a call ${dash} soon` } } as unknown as SnapshotData
  expect(groundingFlags(s, fixed, dataBlock(fixed))).toEqual([])
})

test('the long-dash exemption compares cleaned values, and the hidden Powered by line is never checked (spec v1.1 §16.1)', () => {
  const dash = String.fromCharCode(0x2014)
  const v2 = { ...R, schemaVersion: 2, category: `Fin  ${dash} tech `, settingsUsed: { rankAmong: null, peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, fixedNextStep: ` Book a call  ${dash} soon` } } as unknown as SnapshotData
  expect(groundingFlags({ ...plain, category: `Fin ${dash} tech`, next_step: `Book a call ${dash} soon` }, v2, RT)).toEqual([])
  expect(groundingFlags({ ...plain, page: { sidebar_wordmark: 'Avenue Z', sidebar_powered: `Powered by 77 ${dash} x` } }, R, RT)).toEqual([])
  expect(groundingFlags({ ...plain, page: { sidebar_wordmark: 'AIVx', sidebar_powered: `Powered by 77 ${dash} x` } }, R, RT)).toEqual([
    { kind: 'number_not_in_data', path: 'page.sidebar_powered', text: '"77" is not in the Peec data' },
    { kind: 'long_dash', path: 'page.sidebar_powered', text: 'contains a long dash; use a period or comma' },
  ])
})

test('the brand_changed count ignores the new brand when it contains the old name', () => {
  const s = { ...plain, brand: 'Example Co Inc', headline: 'Example Co Inc leads' }
  expect(groundingFlags(s, R, RT)).toEqual([])
  expect(groundingFlags({ ...s, headline: 'Example Co leads' }, R, RT)).toEqual([{ kind: 'brand_changed', path: 'brand', text: 'The copy still says Example Co in 1 place' }])
})

test('page.series and page.sidebar_wordmark skip the number and domain checks but keep the long-dash check (v1.1 §17.5)', () => {
  const dash = String.fromCharCode(0x2014)
  expect(groundingFlags({ ...plain, page: { series: 'AEO Snapshot 2026', sidebar_wordmark: 'Lens.io' } }, R, RT)).toEqual([])
  const flags = groundingFlags({ ...plain, page: { series: `Snapshot ${dash} 2026`, sidebar_wordmark: `Lens${dash}io 7` } }, R, RT)
  expect(flags).toEqual([
    { kind: 'long_dash', path: 'page.series', text: 'contains a long dash; use a period or comma' },
    { kind: 'long_dash', path: 'page.sidebar_wordmark', text: 'contains a long dash; use a period or comma' },
  ])
})
