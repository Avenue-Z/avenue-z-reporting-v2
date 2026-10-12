import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { V1_DATA, V1_DATA_BLOCK, V1_FLAGS, V1_SLOTS } from './__fixtures__/v1-row'
import { dataBlock } from './prompt'
import { groundingFlags } from './grounding'
import { AIVX_JS } from './aivx/js'
import { HEADER_CLONE_JS, renderSnapshotHtml } from './render'

// The v1.0 final page of V1_DATA and V1_SLOTS, generated once from the code at 06e68c0d (plan Task 1 Step 4).
const GOLDEN = readFileSync('lib/aeo-outbound/__fixtures__/v1-0-final.html', 'utf8')

test('a version 1 row keeps its version 1 Data block', () => {
  expect(dataBlock(V1_DATA)).toBe(V1_DATA_BLOCK)
})

test('a version 1 row keeps its version 1 grounding flags: the new keys read defaults that carry no numbers', () => {
  const legacy = (ns: { path?: string; text: string }[]) => [...new Set(ns.map((n) => `${(n.path ?? '').split('.')[0]}: ${n.text}`))]
  expect(legacy(groundingFlags(V1_SLOTS, V1_DATA, V1_DATA_BLOCK))).toEqual(V1_FLAGS)
})

// Deliberate differences from v1.0 (spec v1.1 §9 and §16.1), applied to the frozen v1.0 golden: the donut hover reads
// Retrievals, the header clone script follows the AIVx script, and (Task 3b) no AIVx wordmark and no Powered by line.
const V10_LOGO = '<div class="aivx-brand">AIVx</div>\n    <div class="powered">Powered by Avenue Z</div>'
const v11 = (html: string) => {
  expect(html.split('Citations: %{value}')).toHaveLength(2)
  const aivx = `<script>${AIVX_JS}</script>`
  expect(html.split(aivx)).toHaveLength(2)
  expect(html.split(V10_LOGO)).toHaveLength(2)
  return html.split('Citations: %{value}').join('Retrievals: %{value}').split(aivx).join(`${aivx}<script>${HEADER_CLONE_JS}</script>`).split(V10_LOGO).join('<div class="aivx-brand">Avenue Z</div>')
}
// The footer description and disclaimer are one slot value each now, rendered on one line where v1.0 wrapped them over
// several; HTML collapses whitespace, so the page reads the same. Every other byte is compared as is.
const squash = (s: string) => s.replace(/\s+/g, ' ')
test('a version 1 row renders its final page as v1.0 did, apart from the deliberate changes', () => {
  expect(squash(renderSnapshotHtml(V1_DATA, V1_SLOTS, 'final', 'Oct 9, 2026'))).toBe(squash(v11(GOLDEN)))
})
