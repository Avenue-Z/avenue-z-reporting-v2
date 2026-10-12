import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { V1_DATA, V1_DATA_BLOCK, V1_FLAGS, V1_SLOTS } from './__fixtures__/v1-row'
import { dataBlock } from './prompt'
import { groundingFlags } from './grounding'
import { renderSnapshotHtml } from './render'

// The v1.0 final page of V1_DATA and V1_SLOTS, generated once from the code at 06e68c0d (plan Task 1 Step 4).
const GOLDEN = readFileSync('lib/aeo-outbound/__fixtures__/v1-0-final.html', 'utf8')

test('a version 1 row keeps its version 1 Data block', () => {
  expect(dataBlock(V1_DATA)).toBe(V1_DATA_BLOCK)
})

test('a version 1 row keeps its version 1 grounding flags', () => {
  expect(groundingFlags(V1_SLOTS, V1_DATA, V1_DATA_BLOCK)).toEqual(V1_FLAGS)
})

// Deliberate differences from v1.0 (spec v1.1 §9), applied to the frozen v1.0 golden. Later tasks add to this list.
const v11 = (html: string) => {
  expect(html.split('Citations: %{value}')).toHaveLength(2)
  return html.split('Citations: %{value}').join('Retrievals: %{value}')
}
test('a version 1 row renders its final page as v1.0 did, apart from the deliberate changes', () => {
  expect(renderSnapshotHtml(V1_DATA, V1_SLOTS, 'final', 'Oct 9, 2026')).toBe(v11(GOLDEN))
})
