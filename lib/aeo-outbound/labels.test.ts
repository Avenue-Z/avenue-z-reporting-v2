import { expect, test } from 'vitest'
import { fieldLabel } from './labels'
import { slotEntries, withDefaults, type Slots } from './slots'

const T: [string, string] = ['Strengths', 'Gaps']
const S0: Slots = {
  category: 'c', market: 'm', headline: 'h', summary: 's', context: 'c',
  competitive_bullets: [{ lead: 'a', text: 'b' }, { lead: 'a', text: 'b' }, { lead: 'a', text: 'b' }], sources_bullets: [{ lead: 'a', text: 'b' }, { lead: 'a', text: 'b' }],
  why: 'w', opportunities: [0, 1, 2].map(() => ({ signal: 's', opportunity: 'o', workstream: 'w' })), methodology: 'm', next_step: 'n',
}
const FULL = withDefaults(S0, { brand: 'B', windowLabel: 'W', kpis: [{ label: 'l', value: 'v' }, { label: 'l', value: 'v' }] })

test('the label map names each field in plain words, a bullet by its current section title', () => {
  expect(fieldLabel('competitive_bullets.0.lead', T)).toBe('Strengths, bullet 1, bold lead-in')
  expect(fieldLabel('sources_bullets.1.text', T)).toBe('Gaps, bullet 2, text')
  expect(fieldLabel('competitive_bullets.2.remove', T)).toBe('Strengths, bullet 3, remove')
  expect(fieldLabel('sources_bullets.add', T)).toBe('Gaps, add a bullet')
  expect(fieldLabel('opportunities.2.workstream', T)).toBe('Opportunity 3, workstream')
  expect(fieldLabel('kpis.0.value', T)).toBe('Metric card 1, value')
  expect(fieldLabel('page.opps_col_2', T)).toBe('Opportunities table, second column')
  expect(fieldLabel('why', T)).toBe('Why it matters')
  expect(fieldLabel('brand', T)).toBe('Brand name')
})

test('every editable path has a label that is not the path itself', () => {
  for (const [p] of slotEntries(FULL)) expect(fieldLabel(p, T), p).not.toBe(p)
})

test('an unknown path, a prototype key included, is returned as given', () => {
  for (const p of ['nope', '__proto__', 'constructor', 'page.__proto__', 'page.toString']) expect(fieldLabel(p, T)).toBe(p)
})

test('the two settings-backed page words use the settings page labels', () => {
  expect(fieldLabel('page.sidebar_wordmark', T)).toBe('Top-left name')
  expect(fieldLabel('page.series', T)).toBe('Report name')
})

test('the Methodology title has its own label (v1.1 §17.14)', () => {
  expect(fieldLabel('page.method_title', T)).toBe('Methodology title')
})

test('bullet 6 is labelled, for its lead, text and Remove, in both boxes (spec v1.1 18.12)', () => {
  expect(fieldLabel('competitive_bullets.5.lead', T)).toBe('Strengths, bullet 6, bold lead-in')
  expect(fieldLabel('sources_bullets.5.text', T)).toBe('Gaps, bullet 6, text')
  expect(fieldLabel('sources_bullets.5.remove', T)).toBe('Gaps, bullet 6, remove')
  const six = withDefaults({ ...S0, sources_bullets: Array.from({ length: 6 }, () => ({ lead: 'a', text: 'b' })) }, { brand: 'B', windowLabel: 'W', kpis: [] })
  for (const [p] of slotEntries(six)) expect(fieldLabel(p, T), p).not.toBe(p)
})

test('every editable path of a hidden Opportunities page still has a label', () => {
  for (const [p] of slotEntries({ ...FULL, opportunities_page: 'hidden' })) expect(fieldLabel(p, T), p).not.toBe(p)
})

test('pillar rows name their fields as pillars (Ryan, round 3); a table row keeps its labels', () => {
  expect(fieldLabel('opportunities.0.workstream', T, true)).toBe('Pillar 1, name')
  expect(fieldLabel('opportunities.1.opportunity', T, true)).toBe('Pillar 2, description')
  expect(fieldLabel('opportunities.2.signal', T, true)).toBe('Pillar 3, data line')
  expect(fieldLabel('opportunities.2.signal', T)).toBe('Opportunity 3, signal')
  for (const [p] of slotEntries({ ...FULL, opportunities_layout: 'pillars' })) expect(fieldLabel(p, T, true), p).not.toBe(p)
})
