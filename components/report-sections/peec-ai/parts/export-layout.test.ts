import { expect, test } from 'vitest'
import { PEEC_PARTS } from './registry'
import { BESPOKE_PARTS } from './bespoke/registry'
import { mergeRegistries } from '@/lib/report-sections/registry'
import { PEEC_EXPORT_LAYOUT, peecWrapsAsBlock } from './export-layout'

// Every AEO Overview part says how it pages in the PDF export, as Organic Social's do: it lays out its own blocks
// (it can be taller than a page), or the Overview wraps it whole. A part registered without a decision fails here.
const registered = Object.entries(mergeRegistries(PEEC_PARTS, BESPOKE_PARTS)).flatMap(([id, v]) => Object.keys(v).map((n) => `${id}@${n}`)).sort()

test('every registered part has an export layout, and nothing else does', () => {
  expect(Object.keys(PEEC_EXPORT_LAYOUT).sort()).toEqual(registered)
})

test('tables lay out their own rows; short parts are wrapped whole; an unknown part is wrapped', () => {
  expect(['brand-rankings', 'domains-row', 'llm-breakdown'].map((id) => peecWrapsAsBlock(id, 1))).toEqual([false, false, false])
  expect(['kpi-cards', 'footer', 'overview-synopsis'].map((id) => peecWrapsAsBlock(id, 1))).toEqual([true, true, true])
  expect(peecWrapsAsBlock('not-a-part', 1)).toBe(true)
})
