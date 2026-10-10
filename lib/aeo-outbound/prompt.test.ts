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
  const own = { id: 'o', name: 'Example Co', isOwn: true, visibilityPct: 15.1, sovPct: 15.9, position: 3.1, rank: 1 }
  const stray = { id: 'x', name: 'Strayco', isOwn: false, visibilityPct: 30, sovPct: 20, position: 2, rank: 1 }
  const d = { ...D, competitorsTracked: 0, rankN: 1, brands: [stray, own], leaderGaps: [{ name: 'Strayco', visibilityPoints: 14.9, sovPoints: 4.1 }] } as unknown as SnapshotData
  const b = dataBlock(d)
  expect(b).not.toContain('Strayco')
  expect(b).not.toContain('14.9')
  expect(b).toContain('Example Co')
  expect(b).toContain('Gap to each brand ranked above (visibility points, share of voice points): none')
})
test('the prompt carries the rules, the sections, the source rule and no em or en dashes', () => {
  const p = buildPrompt(D, [])
  expect(p).toContain('Use ONLY the Data section')
  expect(p).toContain('competitive_bullets')
  expect(p).toContain('strengths')
  expect(p).toContain('Peec recommends')
  expect(p).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`))
  expect(buildPrompt(D, ['why: 12% is not in the data'])).toContain('12% is not in the data')
})
test('parses direct, fenced and wrapped JSON', () => {
  expect(parseModelJson('{"a":1}')).toEqual({ a: 1 })
  expect(parseModelJson('```json\n{"a":2}\n```')).toEqual({ a: 2 })
  expect(parseModelJson('Here you go: {"a":3} done')).toEqual({ a: 3 })
  expect(parseModelJson('no json')).toBeNull()
})
