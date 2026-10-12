import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { V1_DATA, V1_DATA_BLOCK, V1_FLAGS, V1_SLOTS } from './__fixtures__/v1-row'
import { dataBlock } from './prompt'
import { groundingFlags } from './grounding'
import { AIVX_JS } from './aivx/js'
import { AIVX_CSS } from './aivx/css'
import { HEADER_CLONE_JS, PAGE_CSS, PAGE_JS, SHARE_MOBILE, renderSnapshotHtml } from './render'

// The v1.0 final page of V1_DATA and V1_SLOTS, generated once from the code at 06e68c0d (plan Task 1 Step 4).
const GOLDEN = readFileSync('lib/aeo-outbound/__fixtures__/v1-0-final.html', 'utf8')

test('a version 1 row keeps its version 1 Data block', () => {
  expect(dataBlock(V1_DATA)).toBe(V1_DATA_BLOCK)
})

test('a version 1 row keeps its version 1 grounding flags: the new keys read defaults that carry no numbers', () => {
  const legacy = (ns: { path?: string; text: string }[]) => [...new Set(ns.map((n) => `${(n.path ?? '').split('.')[0]}: ${n.text}`))]
  expect(legacy(groundingFlags(V1_SLOTS, V1_DATA, V1_DATA_BLOCK))).toEqual(V1_FLAGS)
})

// Also deliberate for version 1 drafts: the own brand replaces the 10th bar (§9); the golden has too few brands to show it (charts.test.ts pins it).
// Deliberate differences from v1.0 (spec v1.1 §9 and §16.1), applied to the frozen v1.0 golden: the donut hover reads
// Retrievals, the header clone script follows the AIVx script, and (Task 3b) no AIVx wordmark and no Powered by line.
const V10_LOGO = '<div class="aivx-brand">AIVx</div>\n    <div class="powered">Powered by Avenue Z</div>'
const v11 = (html: string) => {
  expect(html.split('Citations: %{value}')).toHaveLength(2)
  const aivx = `<script>${AIVX_JS}</script>`
  expect(html.split(aivx)).toHaveLength(2)
  expect(html.split(V10_LOGO)).toHaveLength(2)
  const once = (h: string, from: string, to: string, n = 1) => {
    expect(h.split(from)).toHaveLength(n + 1)
    return h.split(from).join(to)
  }
  let out = html.split('Citations: %{value}').join('Retrievals: %{value}').split(aivx).join(`${aivx}<script>${HEADER_CLONE_JS}</script><script>${PAGE_JS}</script>`).split(V10_LOGO).join('<div class="aivx-brand">Avenue Z</div>')
  // v1.1 §17: the page stylesheet after AIVx's, the data-label on each opportunities cell, aeo-long on the long rank value, the phone Share block.
  out = once(out, `<style>${AIVX_CSS}</style>`, `<style>${AIVX_CSS}</style><style>${PAGE_CSS}</style>`)
  out = once(out, '<tr><td>', '<tr><td data-label="Signal">', 3)
  out = once(out, '</td><td>Explore it</td><td>Technical', '</td><td data-label="Opportunity to explore">Explore it</td><td data-label="Likely workstream">Technical')
  out = once(out, '</td><td>Investigate</td><td>PR / earned media', '</td><td data-label="Opportunity to explore">Investigate</td><td data-label="Likely workstream">PR / earned media')
  out = once(out, '</td><td>Test content</td><td>Content / AEO', '</td><td data-label="Opportunity to explore">Test content</td><td data-label="Likely workstream">Content / AEO')
  out = once(out, '<div class="kpi-value">#3 of 3 brands</div>', '<div class="kpi-value aeo-long">#3 of 3 brands</div>')
  out = once(out, '</section>\n<footer class="footer">', `</section>\n${SHARE_MOBILE}<footer class="footer">`)
  return out
}
// The footer description and disclaimer are one slot value each now, rendered on one line where v1.0 wrapped them over
// several. Each wrapped block is rewritten to its one-line form, so every byte is compared exactly.
const WRAPPED = [
  'Avenue Z is a digital marketing and PR agency specializing in AI visibility\n        and Answer Engine Optimization (AEO). We help brands earn citation authority\n        with AI models through earned media, content strategy, and technical optimization.',
  'Data reflects a Peec AI visibility snapshot for the stated window and is directional.\n    Avenue Z makes no representations about future AI visibility outcomes.',
]
const oneLine = (html: string) => WRAPPED.reduce((h, w) => {
  expect(h.split(w)).toHaveLength(2)
  return h.split(w).join(w.replace(/\s*\n\s*/g, ' '))
}, html)
test('a version 1 row renders its final page as v1.0 did, apart from the deliberate changes', () => {
  expect(renderSnapshotHtml(V1_DATA, V1_SLOTS, 'final', 'Oct 9, 2026')).toBe(oneLine(v11(GOLDEN)))
})
