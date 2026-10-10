import { expect, test } from 'vitest'
import { groundingFlags } from './grounding'
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
