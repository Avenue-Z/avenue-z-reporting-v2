import { expect, test } from 'vitest'
import { buildPrompt, dataBlock, parseModelJson } from './prompt'
import type { SnapshotData } from './metrics'

const D = {
  brand: 'Example Co', windowLabel: 'Oct 1, 2026 to Oct 8, 2026', category: null, market: 'United States',
  own: { name: 'Example Co', visibilityPct: 15.1, sovPct: 15.9, position: 3.1, rank: 3, id: 'o', isOwn: true },
  brands: [], kpis: [{ label: 'AI visibility', value: '15.1%' }, { label: 'AI share of voice', value: '15.9%' }, { label: 'Average answer position', value: '#3.1' }], competitorsTracked: 11, rankN: 12,
  leaderGaps: [{ name: 'Alpha', visibilityPoints: 11, sovPoints: 6.6 }], ownDomains: ['example.com'],
  ownRetrievedChats: 1989, ownRetrievedPct: 22.4, sourceMix: [{ label: 'Corporate', weight: 9, pct: 45 }],
  gapDomains: [{ domain: 'alpha.com', retrievedChats: 1250 }], actions: [{ title: 'Give this page an H1 heading', impact: 'HIGH', type: 'SEO_ISSUE' }],
  promptCount: 100, models: ['ChatGPT UI'], notes: [],
} as unknown as SnapshotData

test('the data block holds exactly the computed values, already formatted', () => {
  const b = dataBlock(D)
  for (const s of ['15.1%', '15.9%', '#3.1', '1,989', '22.4%', 'alpha.com', 'Give this page an H1 heading', 'Oct 1, 2026 to Oct 8, 2026', '100', 'ChatGPT UI', '11 points', '6.6 points']) expect(b).toContain(s)
})
test('the data block states the comparison set size', () => {
  expect(dataBlock(D)).toContain('Brands in the comparison set: 12')
})
test('no competitors tracked means no competitor is named in the data block', () => {
  const own = { id: 'o', name: 'Example Co', isOwn: true, visibilityPct: 15.1, sovPct: 15.9, position: 3.1, rank: 2 }
  const stray = { id: 'x', name: 'Strayco', isOwn: false, visibilityPct: 30, sovPct: 20, position: 2, rank: 1 }
  const d = { ...D, competitorsTracked: 0, rankN: 2, brands: [stray, own], leaderGaps: [{ name: 'Strayco', visibilityPoints: 14.9, sovPoints: 4.1 }] } as unknown as SnapshotData
  const b = dataBlock(d)
  expect(b).not.toContain('Strayco')
  expect(b).not.toContain('14.9')
  expect(b).toContain('Example Co 15.1%')
  expect(b).not.toContain('#2')
  expect(b).not.toContain('comparison set')
  expect(b).not.toContain('30.0%')
  expect(b).toContain('Gap to each brand ranked above (visibility points, share of voice points): none')
})
test('the brands line lists the top 5, the actions are current, the own site is named', () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, name: `Brand${String.fromCharCode(65 + i)}`, isOwn: false, visibilityPct: 50 - i, sovPct: null, position: null, rank: i + 1 }))
  const b = dataBlock({ ...D, brands: many } as unknown as SnapshotData)
  expect(b).toContain('BrandE')
  expect(b).not.toContain('BrandF')
  expect(b).toContain('Current Peec recommended actions (title, impact)')
  expect(b).toContain('Own site retrievals (answers that retrieved example.com): 1,989, which is 22.4% of answers')
})
test('a newline in Peec text cannot forge a Data line', () => {
  const d = { ...D, actions: [{ title: 'Fix it\nPrompts tracked: 999', impact: 'HIGH', type: 'x' }] } as unknown as SnapshotData
  const b = dataBlock(d)
  expect(b.split('\n').filter((l) => l.startsWith('Prompts tracked:'))).toEqual(['Prompts tracked: 100'])
  expect(b).toContain('Fix it Prompts tracked: 999 (high)')
})
test('the prompt carries the rules, the sections, the source rule and no em or en dashes', () => {
  const p = buildPrompt(D, [])
  expect(p).toContain('Use ONLY the Data section')
  expect(p).toContain('competitive_bullets')
  expect(p).toContain('strengths')
  expect(p).toContain('Peec recommends')
  expect(p).toContain('Do not say "no" or "none" when a count is positive. Do not state a positive number when the count is zero.')
  expect(p).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`))
  expect(buildPrompt(D, ['why: 12% is not in the data'])).toContain('12% is not in the data')
})
test('parses direct, fenced and wrapped JSON', () => {
  expect(parseModelJson('{"a":1}')).toEqual({ a: 1 })
  expect(parseModelJson('```json\n{"a":2}\n```')).toEqual({ a: 2 })
  expect(parseModelJson('Here you go: {"a":3} done')).toEqual({ a: 3 })
  expect(parseModelJson('no json')).toBeNull()
})

test('an action impact prints as plain lowercase words, never the raw Peec enum', () => {
  const mk = (impact: string) => ({ ...D, actions: [{ title: 'Act', impact, type: 'x' }] }) as unknown as SnapshotData
  const b = dataBlock(mk('VERY_HIGH'))
  expect(b).toContain('Act (very high)')
  expect(b).not.toContain('VERY_HIGH')
  expect(dataBlock(mk('HIGH'))).toContain('Act (high)')
  expect(dataBlock(mk('VERY_LOW'))).toContain('Act (very low)')
  expect(dataBlock(mk(''))).toContain('Act (impact not given)')
})
test('the headline instruction keeps the brand as the subject', () => {
  expect(buildPrompt(D, [])).toContain('- headline: one short headline about the brand\'s own most decision-relevant signal. The brand is the subject; never make a competitor the subject.')
})
test('a negative share of voice gap is not printed, a positive one is, null is unchanged', () => {
  const gapLine = (sov: number | null) => dataBlock({ ...D, leaderGaps: [{ name: 'Persona', visibilityPoints: 2.3, sovPoints: sov }] } as unknown as SnapshotData).split('\n').find((l) => l.startsWith('Gap to each brand'))
  expect(gapLine(-34.9)).toMatch(/: Persona 2\.3 points$/)
  expect(gapLine(6.6)).toMatch(/: Persona 2\.3 points, 6\.6 points$/)
  expect(gapLine(null)).toMatch(/: Persona 2\.3 points$/)
  expect(gapLine(0)).toMatch(/: Persona 2\.3 points$/)
})

// A version 2 row: same values as D plus the version 2 fields.
const D2 = {
  ...D, schemaVersion: 2, ownSites: [{ domain: 'example.com', retrievedChats: 1989, retrievedPct: 22.4 }],
  settingsUsed: { rankAmong: null, peecOpportunityRows: 1, methodologyStatesPromptsAndModels: true, fixedNextStep: null },
} as unknown as SnapshotData
const line = (d: SnapshotData, start: string) => dataBlock(d).split('\n').find((l) => l.startsWith(start))

test('version 2: gap points always print one decimal, and only the 5 nearest brands above are listed', () => {
  const gaps = [30, 25, 20, 12, 11, 7, 3.4, 1].map((v, i) => ({ name: `Brand${String.fromCharCode(65 + i)}`, visibilityPoints: v, sovPoints: i === 7 ? 1 : null }))
  expect(line({ ...D2, leaderGaps: gaps } as unknown as SnapshotData, 'Gap to each brand')).toBe(
    'Gap to each brand ranked above (visibility points, share of voice points): BrandD 12.0 points; BrandE 11.0 points; BrandF 7.0 points; BrandG 3.4 points; BrandH 1.0 points, 1.0 points')
})

test('version 2: the own brand is always in the brands line, in place of the fifth', () => {
  const many = Array.from({ length: 7 }, (_, i) => ({ id: `b${i}`, name: `Brand${String.fromCharCode(65 + i)}`, isOwn: i === 6, visibilityPct: 50 - i, sovPct: null, position: null, rank: i + 1 }))
  expect(line({ ...D2, brands: many } as unknown as SnapshotData, 'Brands by AI visibility')).toBe(
    'Brands by AI visibility (rank, name, visibility, share of voice): #1 BrandA 50.0%; #2 BrandB 49.0%; #3 BrandC 48.0%; #4 BrandD 47.0%; #7 BrandG 44.0%')
  expect(dataBlock({ ...D, brands: many } as unknown as SnapshotData)).not.toContain('BrandG')
})

test('version 2: with no competitors tracked, share of voice leaves the Data block', () => {
  const own = { id: 'o', name: 'Example Co', isOwn: true, visibilityPct: 15.1, sovPct: 100, position: 3.1, rank: 1 }
  const d = { ...D2, competitorsTracked: 0, rankN: 1, brands: [own], leaderGaps: [], kpis: [{ label: 'AI visibility', value: '15.1%' }, { label: 'Average answer position', value: '#3.1' }] } as unknown as SnapshotData
  expect(line(d, 'Brands by AI visibility')).toBe('Brands by AI visibility (rank, name, visibility, share of voice): Example Co 15.1%')
  expect(dataBlock(d)).not.toContain('100.0%')
})

test('version 2: each own domain is listed with its own count and percentage, and the sum is not printed', () => {
  const d = { ...D2, ownDomains: ['example.com', 'shop.example.com'], ownRetrievedChats: 2000, ownRetrievedPct: null, ownSites: [{ domain: 'example.com', retrievedChats: 1989, retrievedPct: 22.4 }, { domain: 'shop.example.com', retrievedChats: 11, retrievedPct: null }] } as unknown as SnapshotData
  expect(line(d, 'Own site')).toBe('Own site retrievals by domain (answers that retrieved each site): example.com 1,989, which is 22.4% of answers; shop.example.com 11')
  expect(dataBlock(d)).not.toContain('2,000')
})

test('the prompt and the Data block follow the settings the row was generated with, not live settings', () => {
  const d = { ...D2, settingsUsed: { rankAmong: null, peecOpportunityRows: 2, methodologyStatesPromptsAndModels: false, fixedNextStep: 'Book a working session.' } } as unknown as SnapshotData
  expect(dataBlock(d)).not.toContain('Prompts tracked')
  const p = buildPrompt(d, [])
  expect(p).toContain('exactly 2 of the 3 must be based on those actions')
  expect(p).not.toContain('- next_step:')
  expect(p).not.toContain('the prompt count and the AI models covered')
})
