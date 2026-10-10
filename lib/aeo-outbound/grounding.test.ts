import { expect, test } from 'vitest'
import { groundingFlags } from './grounding'
import { dataBlock } from './prompt'
import type { SnapshotData } from './metrics'
import type { Slots } from './slots'

const D = { brands: [{ name: '7-Eleven' }], ownDomains: ['example.com'], gapDomains: [{ domain: 'alpha.com', retrievedChats: 1250 }], window: { start: '2026-10-01', end: '2026-10-08' } } as unknown as SnapshotData
const base: Slots = { category: 'c', market: 'm', headline: 'Ranks #3 of 12 with 15.1% visibility', summary: 's', context: '7-Eleven leads.', competitive_bullets: [{ lead: 'a', text: '1,989 chats on example.com in 2026' }, { lead: 'b', text: 'c' }], sources_bullets: [{ lead: 'a', text: 'alpha.com' }, { lead: 'b', text: 'c' }], why: 'w', opportunities: [0, 1, 2].map(() => ({ signal: 's', opportunity: 'o', workstream: 'w' })), methodology: 'm', next_step: 'n' }
const allowed = 'AI visibility 15.1% | rank #3 of 12 | own site 1,989 chats'

test('numbers in the data and exempt numbers pass', () => {
  expect(groundingFlags(base, D, allowed)).toEqual([])
})
test('a number not in the data is flagged with its field', () => {
  const s = { ...base, why: 'Visibility rose 12.5% this month' }
  expect(groundingFlags(s, D, allowed)).toEqual(['why: "12.5%" is not in the Peec data'])
})
test('a long dash is flagged', () => {
  const s = { ...base, why: `Strong ${String.fromCharCode(0x2014)} for now` }
  expect(groundingFlags(s, D, allowed)).toEqual(['why: contains a long dash; use a period or comma'])
})
test('a dash in a code-set field or a roster brand name is not flagged', () => {
  const dash = String.fromCharCode(0x2013)
  const d = { ...D, brands: [{ name: `Alpha${dash}Beta` }] } as unknown as SnapshotData
  const s = { ...base, category: `Fin${dash}tech`, context: `Alpha${dash}Beta leads.` }
  expect(groundingFlags(s, d, allowed)).toEqual([])
})
test('an unknown domain is flagged', () => {
  const s = { ...base, why: 'See competitor.io for more' }
  expect(groundingFlags(s, D, allowed)).toEqual(['why: "competitor.io" is not a domain in the Peec data'])
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
const say = (why: string) => groundingFlags({ ...plain, why }, R, RT)

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
  expect(groundingFlags({ ...plain, why: 'Formula 7 Labs leads' }, d, t)).toEqual(['why: "7" is not in the Peec data'])
  expect(groundingFlags({ ...plain, why: 'Example Co leads' }, d, t)).toEqual([])
})

test('with no competitors tracked the hidden context slot is never flagged; other slots still are', () => {
  const d = { ...R, competitorsTracked: 0 } as unknown as SnapshotData
  const t = dataBlock(d)
  const dash = String.fromCharCode(0x2014)
  const s = { ...plain, context: `Visibility rose 99% ${dash} see competitor.io`, why: 'Visibility rose 99%' }
  expect(groundingFlags(s, d, t)).toEqual(['why: "99%" is not in the Peec data'])
  // With competitors tracked the same context is shown, so it is flagged.
  expect(groundingFlags(s, R, RT).filter((f) => f.startsWith('context:'))).toHaveLength(3)
})

test('the window days are allowed as bare numbers but not as percentages or ranks', () => {
  const d = { ...R, windowLabel: 'Sep 9, 2026 to Oct 8, 2026', window: { start: '2026-09-09', end: '2026-10-08' } } as unknown as SnapshotData
  const text = dataBlock(d)
  const run = (why: string) => groundingFlags({ ...plain, why }, d, text)
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
  expect(groundingFlags(good, d, text)).toEqual([])
})
