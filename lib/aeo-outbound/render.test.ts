import { expect, test } from 'vitest'
import { AIVX_CSS } from './aivx/css'
import { SHARE_BUTTON, renderSnapshotHtml } from './render'
import { AIVX_SHARE_BLOCK } from './aivx/share'
import type { SnapshotData } from './metrics'
import type { Slots } from './slots'

const BRANDS = [
  { id: 'a', name: 'Alpha', isOwn: false, visibilityPct: 26.1, sovPct: 22.5, position: 2.4, rank: 1 },
  { id: 'o', name: 'Example <Co> & "Sons"', isOwn: true, visibilityPct: 15.1, sovPct: 15.9, position: 3.1, rank: 2 },
]
const DATA = {
  projectId: 'or_a', projectName: 'p', brand: 'Example <Co> & "Sons"', generatedAt: '2026-10-08T15:00:00Z',
  window: { start: '2026-10-01', end: '2026-10-08' }, windowLabel: 'Oct 1, 2026 to Oct 8, 2026',
  category: 'Fintech', market: 'United States', brands: BRANDS, own: BRANDS[1],
  kpis: [{ label: 'AI visibility', value: '15.1%' }, { label: 'AI share of voice', value: '15.9%' }, { label: 'Average answer position', value: '#3.1' }, { label: 'Competitive rank', value: '#2 of 2 brands' }],
  competitorsTracked: 1, rankN: 2, leaderGaps: [], ownDomains: ['example.com'], ownRetrievedChats: 10, ownRetrievedPct: 22.4,
  sourceMix: [{ label: 'Corporate', weight: 5, pct: 50 }, { label: 'You', weight: 5, pct: 50 }], gapDomains: [], actions: [],
  promptCount: 100, models: ['ChatGPT UI'], notes: [],
} as SnapshotData
const SLOTS: Slots = {
  category: 'Fintech', market: 'United States', headline: 'Headline <script>alert(1)</script>', summary: 'Summary.',
  context: 'Alpha leads Example <Co> & "Sons".', competitive_bullets: [{ lead: 'Lead:', text: 'Text.' }, { lead: 'L2:', text: 'T2.' }],
  sources_bullets: [{ lead: 'Gap:', text: 'G.' }, { lead: 'G2:', text: 'G2.' }], why: 'Why.',
  opportunities: [0, 1, 2].map((i) => ({ signal: `s${i}`, opportunity: `o${i}`, workstream: 'Content / AEO' })),
  methodology: 'Method.', next_step: 'Next.',
}

test('final: AIVx head and stylesheet verbatim, no editing hooks, share button present', () => {
  const h = renderSnapshotHtml(DATA, SLOTS, 'final', 'Oct 9, 2026')
  expect(h.startsWith('<!DOCTYPE html>')).toBe(true)
  expect(h).toContain(`<style>${AIVX_CSS}</style>`)
  // AIVx's tag (renderer.py:2537) plus Subresource Integrity for the CDN file (sha384 of plotly-3.5.0.min.js, measured 2026-10-08).
  expect(h).toContain('<script src="https://cdn.plot.ly/plotly-3.5.0.min.js" charset="utf-8" integrity="sha384-DPvk2KODrsA0CfBr4HTwAwhdDROPqqK2PvSSswJMQMpnUkwSTg4gLBxXc3wv2e5L" crossorigin="anonymous"></script>')
  expect(h).toContain('<meta name="robots" content="noindex,nofollow">')
  expect(h).toContain('<title>AI Visibility Snapshot: Example &lt;Co&gt; &amp; &quot;Sons&quot; | Avenue Z</title>')
  expect(h).not.toContain('<link rel="canonical"')
  expect(h).not.toContain('report-editor')
  expect(h).not.toContain('data-slot')
  expect(h).not.toContain('contenteditable')
  expect(h).toContain('class="share-btn"')
  expect(h).toContain('Prepared Oct 9, 2026')
})

test('renders hostile Peec names inert', () => {
  const h = renderSnapshotHtml(DATA, SLOTS, 'final', 'Oct 9, 2026')
  expect(h).not.toContain('<script>alert(1)</script>')
  expect(h).toContain('Headline &lt;script&gt;alert(1)&lt;/script&gt;')
  expect(h).not.toContain('Example <Co>')
})

test('draft: every slot editable, editor script present, share hidden', () => {
  const h = renderSnapshotHtml(DATA, SLOTS, 'draft', 'Oct 8, 2026')
  for (const p of ['headline', 'summary', 'context', 'category', 'market', 'why', 'methodology', 'next_step', 'competitive_bullets.0.lead', 'sources_bullets.1.text', 'opportunities.2.workstream']) {
    expect(h).toContain(`data-slot="${p}" contenteditable="plaintext-only"`)
  }
  expect(h).toContain("parent.postMessage({type:'dirty',path:p}")
  expect(h).toContain("e.data.type==='flush'")
  expect(h).not.toContain('class="share-btn"')
})

test('preview: no hooks and no share button', () => {
  const h = renderSnapshotHtml(DATA, SLOTS, 'preview', 'Oct 8, 2026')
  expect(h).not.toContain('data-slot')
  expect(h).not.toContain('class="share-btn"')
})

test('three KPI cards switch the strip to three columns', () => {
  const h4 = renderSnapshotHtml(DATA, SLOTS, 'final', 'x')
  expect(h4).toContain('<div class="kpi-strip">')
  const h3 = renderSnapshotHtml({ ...DATA, kpis: DATA.kpis.slice(0, 3) }, SLOTS, 'final', 'x')
  expect(h3).toContain('<div class="kpi-strip" style="grid-template-columns:repeat(3, 1fr)">')
})

test('sections, nav ids and roster bolding', () => {
  const h = renderSnapshotHtml(DATA, SLOTS, 'final', 'x')
  for (const id of ['headline', 'category-data', 'competitive-visibility', 'opportunities', 'methodology']) expect(h).toContain(`href="#${id}"`)
  expect(h).toContain('<section id="category-data" class="section">')
  expect(h).toContain('<section id="competitive-visibility" class="section">')
  expect(h).toContain('<strong>Alpha</strong> leads <strong>Example &lt;Co&gt; &amp; &quot;Sons&quot;</strong>.')
  expect(h).toContain('These are opportunity hypotheses for discussion, not a full roadmap.')
})

test('a short brand name is bolded only as a whole word', () => {
  const brands = [...BRANDS, { id: 's', name: 'amp', isOwn: false, visibilityPct: 1, sovPct: 1, position: 5, rank: 3 }]
  const h = renderSnapshotHtml({ ...DATA, brands }, { ...SLOTS, context: 'Tom & Jerry vs amp and camping.' }, 'final', 'x')
  expect(h).toContain('Tom &amp; Jerry vs <strong>amp</strong> and camping.')
})

test('a long brand name gets the AIVx 72px hero rule', () => {
  const h = renderSnapshotHtml({ ...DATA, brand: 'A Very Long Brand Name Incorporated' }, SLOTS, 'final', 'x')
  expect(h).toContain('<h1 class="hero-industry" style="font-size:72px">')
})

test('hostile names and source labels stay inert through the whole page, figures included', () => {
  const EVIL = '</script><img src=x onerror=alert(1)>'
  const benignBrands = [BRANDS[0], { ...BRANDS[1], name: 'Own' }]
  const benign = renderSnapshotHtml(
    { ...DATA, brand: 'Own', brands: benignBrands, own: benignBrands[1], sourceMix: [{ label: 'Corporate', weight: 5, pct: 50 }, { label: 'You', weight: 5, pct: 50 }] },
    { ...SLOTS, headline: 'H', context: 'C' }, 'final', 'x')
  const evilBrands = [BRANDS[0], { ...BRANDS[1], name: EVIL }]
  const h = renderSnapshotHtml(
    { ...DATA, brand: EVIL, brands: evilBrands, own: evilBrands[1], sourceMix: [{ label: '</script><b>x</b>', weight: 5, pct: 50 }, { label: 'You', weight: 5, pct: 50 }] },
    { ...SLOTS, headline: 'H', context: 'C' }, 'final', 'x')
  expect(h).not.toContain('<img src=x')
  expect(h).not.toContain('</script><b>')
  expect(h).not.toContain('</script><img')
  expect(h.match(/<\/script>/g)?.length).toBe(benign.match(/<\/script>/g)?.length)
  // Title, sidebar, hero and footer carry the escaped name; the figures carry the stripped, JSON-escaped one.
  const esc = '&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;'
  expect(h).toContain(`<title>AI Visibility Snapshot: ${esc} | Avenue Z</title>`)
  expect(h).toContain(`<span>${esc}</span>`)
  expect(h).toContain(`<span class="grad-text">${esc}</span>`)
  expect(h).toContain(`${esc}<br>Prepared x`)
  // Each figure's own script must hold no raw < > & (jsonForScript), and must hold the escaped < from its hovertemplate.
  for (const id of ['aeo-chart-sources', 'aeo-chart-visibility']) {
    const inner = h.split('<script>').map((b) => b.split('</script>')[0]).find((b) => b.includes(`Plotly.newPlot("${id}"`))
    expect(inner, id).toBeDefined()
    expect(inner, id).not.toMatch(/[<>&]/)
    expect(inner, id).toContain('\\u003c')
  }
})

test('zero competitors: the context box is absent from final, draft and preview, and the rest still renders (spec §14)', () => {
  const zero = { ...DATA, competitorsTracked: 0, brands: [BRANDS[1]], rankN: 1 } as SnapshotData
  for (const mode of ['final', 'draft', 'preview'] as const) {
    const h = renderSnapshotHtml(zero, SLOTS, mode, 'Oct 9, 2026')
    expect(h).not.toContain('data-slot="context"')
    expect(h).not.toContain('Alpha leads')
    expect(h).not.toContain('<div class="insight-box"><strong>')
    for (const id of ['headline', 'category-data', 'competitive-visibility', 'opportunities', 'methodology']) expect(h).toContain(`id="${id}"`)
    expect(h).toContain('<div class="kpi-strip">')
    expect(h.trimEnd().endsWith('</html>')).toBe(true)
  }
  const draft = renderSnapshotHtml(zero, SLOTS, 'draft', 'Oct 9, 2026')
  expect(draft).toContain('data-slot="headline"')
  expect(draft).toContain('data-slot="why"')
  const final = renderSnapshotHtml(zero, SLOTS, 'final', 'Oct 9, 2026')
  expect(final).toContain('class="share-btn"')
  // One competitor tracked: the same slots show the context box.
  expect(renderSnapshotHtml(DATA, SLOTS, 'draft', 'x')).toContain('data-slot="context"')
})

test('SHARE_BUTTON is exactly the markup the final render uses, once, and only in final', () => {
  const final = renderSnapshotHtml(DATA, SLOTS, 'final', 'x')
  expect(SHARE_BUTTON).toContain('<button class="share-btn"')
  expect(final.split(SHARE_BUTTON)).toHaveLength(2)
  expect(final.split(AIVX_SHARE_BLOCK)).toHaveLength(2)
  for (const mode of ['draft', 'preview'] as const) {
    const h = renderSnapshotHtml(DATA, SLOTS, mode, 'x')
    expect(h).not.toContain(SHARE_BUTTON)
    expect(h).not.toContain(AIVX_SHARE_BLOCK)
  }
})
