import { expect, test } from 'vitest'
import { applySlotPatch, cleanValue, needsValidationPaths, slotEntries, validateGeneratedSlots, type Slots } from './slots'

const S: Slots = {
  category: 'Fintech', market: 'United States', headline: 'H', summary: 'S', context: 'C',
  competitive_bullets: [{ lead: 'L1', text: 'T1' }, { lead: 'L2', text: 'T2' }],
  sources_bullets: [{ lead: 'G1', text: 'U1' }, { lead: 'G2', text: 'U2' }],
  why: 'W', opportunities: [0, 1, 2].map((i) => ({ signal: `s${i}`, opportunity: `o${i}`, workstream: 'Content / AEO' })),
  methodology: 'M', next_step: 'N',
}

test('cleanValue trims, strips control characters and collapses whitespace', () => {
  expect(cleanValue('  a \n\t b  ')).toBe('a b')
  expect(cleanValue('brands  today')).toBe('brands today')
  expect(cleanValue('x' + String.fromCharCode(0) + 'y')).toBe('x y')
})

test('every closed path form saves; nothing else does', () => {
  for (const [path] of slotEntries(S)) expect(applySlotPatch(S, path, 'new value').ok).toBe(true)
  for (const bad of ['', 'brand', 'headline.0', 'competitive_bullets.2.lead', 'opportunities.3.signal', 'opportunities.0.title', '__proto__', 'constructor']) {
    expect(applySlotPatch(S, bad, 'v')).toEqual({ ok: false, error: 'unknown field' })
  }
})

test('values: text only, not empty, within limits; the input is never mutated', () => {
  expect(applySlotPatch(S, 'headline', 5 as unknown as string)).toEqual({ ok: false, error: 'value must be text' })
  expect(applySlotPatch(S, 'headline', '   ').ok).toBe(false)
  expect(applySlotPatch(S, 'competitive_bullets.0.lead', 'x'.repeat(81)).ok).toBe(false)
  expect(applySlotPatch(S, 'why', 'x'.repeat(1001)).ok).toBe(false)
  const r = applySlotPatch(S, 'opportunities.1.workstream', ' PR / earned media ')
  expect(r.ok && r.slots.opportunities[1].workstream).toBe('PR / earned media')
  expect(S.opportunities[1].workstream).toBe('Content / AEO')
})

test('needsValidationPaths finds every slot still marked', () => {
  const r = applySlotPatch(S, 'market', 'Needs validation')
  expect(r.ok && needsValidationPaths(r.slots)).toEqual(['market'])
})

const MODEL = {
  headline: 'H', summary: 'S', context: 'C',
  competitive_bullets: [{ lead: 'L', text: 'T' }, { lead: 'L', text: 'T' }],
  sources_bullets: [{ lead: 'L', text: 'T' }, { lead: 'L', text: 'T' }, { lead: 'L', text: 'T' }],
  why: 'W', opportunities: [0, 1, 2].map(() => ({ signal: 's', opportunity: 'o', workstream: 'w' })),
  methodology: 'M', next_step: 'N',
}
test('accepts a well-formed model reply and merges the fixed fields', () => {
  const r = validateGeneratedSlots(MODEL, { category: 'Fintech', market: 'Needs validation' })
  expect(r.ok && r.slots.category).toBe('Fintech')
  expect(r.ok && r.slots.next_step).toBe('N')
  const f = validateGeneratedSlots(MODEL, { category: 'X', market: 'Y', next_step: 'Fixed sentence.' })
  expect(f.ok && f.slots.next_step).toBe('Fixed sentence.')
})
test('rejects wrong shapes', () => {
  const cases: unknown[] = [
    null, 'text', { ...MODEL, headline: 5 }, { ...MODEL, why: '' },
    { ...MODEL, competitive_bullets: [MODEL.competitive_bullets[0]] },
    { ...MODEL, sources_bullets: [...MODEL.sources_bullets, MODEL.sources_bullets[0]] },
    { ...MODEL, opportunities: MODEL.opportunities.slice(0, 2) },
    { ...MODEL, competitive_bullets: [{ lead: 'x'.repeat(81), text: 't' }, { lead: 'l', text: 't' }] },
  ]
  for (const c of cases) expect(validateGeneratedSlots(c, { category: 'a', market: 'b' }).ok).toBe(false)
})

test('a fixed value that is empty, too long or control-only is a shape error naming the field', () => {
  const empty = validateGeneratedSlots(MODEL, { category: '', market: 'Y' })
  expect(empty.ok).toBe(false)
  expect(!empty.ok && empty.errors.join(' ')).toContain('category')
  const long = validateGeneratedSlots(MODEL, { category: 'C', market: 'x'.repeat(1001) })
  expect(!long.ok && long.errors.join(' ')).toContain('market')
  const blank = validateGeneratedSlots(MODEL, { category: 'C', market: 'Y', next_step: '\n\t' })
  expect(!blank.ok && blank.errors.join(' ')).toContain('next_step')
})

test('a fixed value is cleaned like a generated one, and Needs validation passes', () => {
  const r = validateGeneratedSlots(MODEL, { category: '  Fin\ntech ', market: 'Needs validation' })
  expect(r.ok && [r.slots.category, r.slots.market]).toEqual(['Fin tech', 'Needs validation'])
})

test('an extra key in the reply is ignored: the fixed category wins', () => {
  const r = validateGeneratedSlots({ ...MODEL, category: 'Z' }, { category: 'Fintech', market: 'Y' })
  expect(r.ok).toBe(true)
  expect(r.ok && r.slots.category).toBe('Fintech')
})
