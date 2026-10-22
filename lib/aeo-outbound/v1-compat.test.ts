import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { V1_DATA, V1_DATA_BLOCK, V1_FLAGS, V1_SLOTS } from './__fixtures__/v1-row'
import { dataBlock } from './prompt'
import { groundingFlags } from './grounding'
import { AIVX_JS } from './aivx/js'
import { AIVX_CSS } from './aivx/css'
import { HEADER_CLONE_JS, PAGE_CSS, PAGE_JS, SHARE_BUTTON, renderSnapshotHtml } from './render'
import { AIVX_SHARE_BLOCK } from './aivx/share'

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
const removeShare = (html: string) => {
  const block = `\n${AIVX_SHARE_BLOCK}`
  expect(html.split(SHARE_BUTTON)).toHaveLength(2)
  expect(html.split(block)).toHaveLength(2)
  expect(html.split('<button class="share-btn"')).toHaveLength(2)
  return html.split(SHARE_BUTTON).join('').split(block).join('')
}
const v11 = (html: string) => {
  expect(html.split('Citations: %{value}')).toHaveLength(2)
  const aivx = `<script>${AIVX_JS}</script>`
  expect(html.split(aivx)).toHaveLength(2)
  expect(html.split(V10_LOGO)).toHaveLength(2)
  const once = (h: string, from: string, to: string, n = 1) => {
    expect(h.split(from)).toHaveLength(n + 1)
    return h.split(from).join(to)
  }
  let out = html.split('Citations: %{value}').join('%{text}').split(aivx).join(`${aivx}<script>${HEADER_CLONE_JS}</script><script>${PAGE_JS}</script>`).split(V10_LOGO).join('<div class="aivx-brand">Avenue Z</div>')
  // v1.1 §17: the page stylesheet after AIVx's, the data-label on each opportunities cell, aeo-long on the long rank value.
  out = once(out, `<style>${AIVX_CSS}</style>`, `<style>${AIVX_CSS}</style><style>${PAGE_CSS}</style>`)
  out = once(out, '<tr><td>', '<tr><td data-label="Signal">', 3)
  out = once(out, '</td><td>Explore it</td><td>Technical', '</td><td data-label="Opportunity to explore">Explore it</td><td data-label="Likely workstream">Technical')
  out = once(out, '</td><td>Investigate</td><td>PR / earned media', '</td><td data-label="Opportunity to explore">Investigate</td><td data-label="Likely workstream">PR / earned media')
  out = once(out, '</td><td>Test content</td><td>Content / AEO', '</td><td data-label="Opportunity to explore">Test content</td><td data-label="Likely workstream">Content / AEO')
  out = once(out, '<div class="kpi-value">#3 of 3 brands</div>', '<div class="kpi-value aeo-long">#3 of 3 brands</div>')
  // 2026-10-19 (Ryan): the source donut labels each slice with the whole number of its stored pct (charts.ts sliceLabel), and
  // its hover reads that label (above), where v1.0 printed Plotly's percent and the weight.
  out = once(out, '"textinfo":"percent"', '"textinfo":"text","text":["54%","34%","9%","4%"]')
  // v1.1 §17.11: a sent report carries no Share button, so the golden's three share pieces are removed (button once, toast
  // and script once each, as one contiguous block).
  out = removeShare(out)
  // v1.1 §17.13 and §17.14: Methodology gets a section heading ("Methodology and next step") and Next step moves onto its own, unstyled line.
  out = once(
    out,
    '<section id="methodology" class="section">\n  <div class="method-note"><strong>Methodology:</strong> <span>Peec data from Oct 1, 2026 to Oct 8, 2026 across 3 brands and 100 prompts. Results are directional.</span> <strong>Next step:</strong> <span>A full AEO audit.</span></div>',
    '<section id="methodology" class="section">\n  <div class="section-label">05 / Methodology</div>\n  <h2 class="section-title">Methodology and next step</h2>\n  <div class="method-note"><div><strong>Methodology:</strong> <span>Peec data from Oct 1, 2026 to Oct 8, 2026 across 3 brands and 100 prompts. Results are directional.</span></div><div><strong>Next step:</strong> <span>A full AEO audit.</span></div></div>',
  )
  // 2026-10-21 (Ryan, round 3, spec 2026-10-21-aeo-outbound-charts-design.md C1 and C2): the bar chart's plot area is
  // black and its top margin 8px. The grey value also appears in the donut's layout, so the anchor runs to the bar's height.
  out = once(
    out,
    '"plot_bgcolor":"#1a1a1a","font":{"family":"Avenir, sans-serif","color":"#FFFFFF","size":13},"hoverlabel":{"bgcolor":"#272727","bordercolor":"rgba(255,255,255,0.1)","font":{"family":"Avenir","color":"#FFFFFF","size":13}},"height":420,"xaxis"',
    '"plot_bgcolor":"#000000","font":{"family":"Avenir, sans-serif","color":"#FFFFFF","size":13},"hoverlabel":{"bgcolor":"#272727","bordercolor":"rgba(255,255,255,0.1)","font":{"family":"Avenir","color":"#FFFFFF","size":13}},"height":420,"xaxis"',
  )
  out = once(out, '"bargap":0.38}', '"bargap":0.38,"margin":{"t":8}}')
  // 2026-10-21 (Ryan, round 3, spec C4): the donut's legend is two columns, with 24px sides so they fit. Paul's #410 review:
  // a uirevision keeps a hidden slice hidden when the legend redraws.
  out = once(
    out,
    '"xanchor":"center","yanchor":"top"},"height":420,"margin":{"l":90,"r":90,"t":28,"b":64}',
    '"xanchor":"center","yanchor":"top","entrywidth":0.5,"entrywidthmode":"fraction"},"height":420,"margin":{"l":24,"r":24,"t":28,"b":64},"uirevision":"aeo-sources"',
  )
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
