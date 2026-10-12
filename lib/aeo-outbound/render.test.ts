import { expect, test } from 'vitest'
import { AIVX_CSS } from './aivx/css'
import { EDITOR_STYLE, FRAME_SCRIPT_JS, HEADER_CLONE_JS, PAGE_CSS, PAGE_JS, SHARE_BUTTON, SHARE_MOBILE, renderSnapshotHtml, showsPowered } from './render'
import { AIVX_JS } from './aivx/js'
import { slotEntries, withDefaults } from './slots'
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
  // PAGE_JS names the selector [data-slot][contenteditable]: remove that one known occurrence, then check the bare words.
  const parts = h.split(`<script>${PAGE_JS}</script>`)
  expect(parts).toHaveLength(2)
  const rest = parts.join('')
  expect(rest).not.toContain('data-slot')
  expect(rest).not.toContain('contenteditable')
  expect(h).not.toContain('class="share-btn"')
  expect(h).toContain('Prepared Oct 9, 2026')
})

test('renders hostile Peec names inert', () => {
  const h = renderSnapshotHtml(DATA, SLOTS, 'final', 'Oct 9, 2026')
  expect(h).not.toContain('<script>alert(1)</script>')
  expect(h).toContain('Headline &lt;script&gt;alert(1)&lt;/script&gt;')
  expect(h).not.toContain('Example <Co>')
})

const parse = (h: string) => new DOMParser().parseFromString(h, 'text/html')

test('draft: every slot is marked, none is editable until the frame says so, the frame script and style are present, share hidden', () => {
  const h = renderSnapshotHtml(DATA, SLOTS, 'draft', 'Oct 8, 2026')
  for (const p of ['headline', 'summary', 'context', 'category', 'market', 'why', 'methodology', 'next_step', 'competitive_bullets.0.lead', 'sources_bullets.1.text', 'opportunities.2.workstream', 'brand', 'window_label', 'kpis.0.label', 'kpis.3.value', 'page.series', 'page.footer_disclaimer']) {
    expect(h).toContain(`data-slot="${p}"`)
  }
  expect(parse(h).querySelectorAll('[contenteditable]')).toHaveLength(0)
  expect(h).toContain(FRAME_SCRIPT_JS)
  expect(h).toContain(EDITOR_STYLE)
  expect(h).not.toContain('class="share-btn"')
})

test('preview and final carry no editing markup at all', () => {
  for (const mode of ['preview', 'final'] as const) {
    const h = renderSnapshotHtml(DATA, SLOTS, mode, 'Oct 8, 2026')
    // PAGE_JS (every mode) names the selector [data-slot][contenteditable]: remove that one known occurrence, then check the bare words.
    const parts = h.split(`<script>${PAGE_JS}</script>`)
    expect(parts, mode).toHaveLength(2)
    // PAGE_CSS (every mode) names the draft's .aeo-ctl button in a spacing rule (v1.1 §17.8): remove that one known style block too.
    const css = parts.join('').split(`<style>${PAGE_CSS}</style>`)
    expect(css, mode).toHaveLength(2)
    const rest = css.join('')
    for (const s of ['data-slot', 'data-mirror', 'data-locked', 'data-structure', 'aeo-w', 'aeo-ctl', 'contenteditable', FRAME_SCRIPT_JS, EDITOR_STYLE]) expect(rest, `${mode} ${s.slice(0, 20)}`).not.toContain(s)
  }
  expect(renderSnapshotHtml(DATA, SLOTS, 'preview', 'x')).not.toContain('class="share-btn"')
})

test('three KPI cards switch the strip to three columns', () => {
  const h4 = renderSnapshotHtml(DATA, SLOTS, 'final', 'x')
  expect(h4).toContain('<div class="kpi-strip">')
  const h3 = renderSnapshotHtml({ ...DATA, kpis: DATA.kpis.slice(0, 3) }, SLOTS, 'final', 'x')
  expect(h3).toContain('<div class="kpi-strip" data-kpis="3" style="grid-template-columns:repeat(3, 1fr)">')
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
  expect(final).not.toContain('class="share-btn"')
  // One competitor tracked: the same slots show the context box.
  expect(renderSnapshotHtml(DATA, SLOTS, 'draft', 'x')).toContain('data-slot="context"')
})

test('a final page carries no share button, share block, toast or phone Share block (v1.1 §17.11)', () => {
  for (const mode of ['draft', 'preview', 'final'] as const) {
    const h = renderSnapshotHtml(DATA, SLOTS, mode, 'x')
    for (const part of [SHARE_BUTTON, SHARE_MOBILE, AIVX_SHARE_BLOCK]) expect(h, `${mode}`).not.toContain(part)
    // AIVx's stylesheet still holds the .share-btn and .share-toast rules (verbatim, never edited), so test the markup and script.
    for (const word of ['class="share-btn"', 'class="share-toast"', "querySelector('.share-btn')", 'aeo-share-mobile']) expect(h, `${mode} ${word}`).not.toContain(word)
  }
})
test('SHARE_BUTTON and SHARE_MOBILE stay exported so the preview can strip rows approved before v1.1 §17.11', () => {
  expect(SHARE_BUTTON).toContain('<button class="share-btn"')
  expect(SHARE_MOBILE).toBe('<div class="aeo-share-mobile"><button class="aeo-share-mobile-btn" type="button" aria-label="Copy shareable link to this report">Share Report</button></div>')
})
test('PAGE_CSS follows the AIVx style and PAGE_JS follows the header clone, in draft, preview and final', () => {
  for (const mode of ['draft', 'preview', 'final'] as const) {
    const h = renderSnapshotHtml(DATA, SLOTS, mode, 'x')
    const css = `<style>${AIVX_CSS}</style><style>${PAGE_CSS}</style>`
    expect(h).toContain(css)
    if (mode === 'draft') expect(h).toContain(`${css}${EDITOR_STYLE}`)
    const clone = `<script>${HEADER_CLONE_JS}</script>`
    expect(h).toContain(`${clone}<script>${PAGE_JS}</script>`)
    const at = h.indexOf(`<script>${PAGE_JS}</script>`)
    if (mode === 'draft') expect(h.indexOf(FRAME_SCRIPT_JS)).toBeGreaterThan(at)
  }
})

test('PAGE_CSS and PAGE_JS have no phone Share rules or proxy (v1.1 §17.11)', () => {
  expect(PAGE_CSS).not.toContain('aeo-share-mobile')
  expect(PAGE_JS).not.toContain('aeo-share-mobile-btn')
  expect(PAGE_JS).not.toContain('share-btn')
})

/** v1.1 §17.8 and §17.10: the rules that close up the space beside the two charts and lay the findings out as rows, verbatim and in order. */
const CHART_SPACING_RULES = [
  '#category-data .two-col,#competitive-visibility .two-col{margin-bottom:0}',
  '#category-data .two-col>div:first-child,#competitive-visibility .two-col>div:first-child{display:flex}',
  '#category-data .insight-box,#competitive-visibility .insight-box{flex:1;margin:24px 0 0;display:flex;flex-direction:column;padding:28px 32px}',
  '#category-data .insight-box>.aeo-ctl,#competitive-visibility .insight-box>.aeo-ctl{align-self:flex-start}',
  '#category-data .insight-box ul,#competitive-visibility .insight-box ul{flex:1;justify-content:space-evenly;list-style:none}',
  '#category-data .insight-box li,#competitive-visibility .insight-box li{font-size:16px;line-height:1.6;padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.08)}',
  '#category-data .insight-box li:last-child,#competitive-visibility .insight-box li:last-child{border-bottom:none}',
  '#category-data .insight-box li strong,#competitive-visibility .insight-box li strong{display:block;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px}',
  '#category-data .chart-wrap,#competitive-visibility .chart-wrap{margin-bottom:0}',
]
const COLOR_SCHEME_RULE = 'html{color-scheme:dark}'
const outsideRules = () => PAGE_CSS.slice(0, PAGE_CSS.indexOf('@media (max-width: 900px){')).split('\n').filter(Boolean)

test('every PAGE_CSS rule except aeo-long, the chart spacing rules sits inside the phone media query', () => {
  const open = '@media (max-width: 900px){'
  const at = PAGE_CSS.indexOf(open)
  expect(at).toBeGreaterThan(-1)
  expect(PAGE_CSS.endsWith('}')).toBe(true)
  const outside = PAGE_CSS.slice(0, at).split('\n').filter(Boolean)
  expect(outside).toEqual(['.kpi-value.aeo-long{font-size:24px;line-height:1.15}', COLOR_SCHEME_RULE, ...CHART_SPACING_RULES])
  const inside = PAGE_CSS.slice(at + open.length, -1).split('\n').filter(Boolean)
  expect(inside.length).toBeGreaterThan(5)
  expect(inside.every((r) => r.endsWith('}') && !r.includes('@media'))).toBe(true)
  expect(PAGE_CSS.split('@media')).toHaveLength(2)
  expect(inside).toContain('.kpi-strip[data-kpis="3"]{grid-template-columns:repeat(2,1fr)!important}')
  expect(PAGE_CSS).not.toMatch(/[\u2013\u2014]/)
})

test('every opportunities cell carries data-label with its column word, escaped, in every mode', () => {
  const slots: Slots = { ...SLOTS, page: { opps_col_1: 'Signal & proof', opps_col_2: 'Idea', opps_col_3: 'Team' } }
  for (const mode of ['draft', 'preview', 'final'] as const) {
    const doc = parse(renderSnapshotHtml(DATA, slots, mode, 'x'))
    const rows = [...doc.querySelectorAll('.leaderboard tbody tr')]
    expect(rows).toHaveLength(3)
    for (const r of rows) expect([...r.children].map((c) => c.getAttribute('data-label'))).toEqual(['Signal & proof', 'Idea', 'Team'])
  }
  expect(renderSnapshotHtml(DATA, slots, 'final', 'x')).toContain('<td data-label="Signal &amp; proof">s0</td>')
})

test('aeo-long on a KPI value longer than 7 characters after trimming, not on 7', () => {
  const kpis = (v: string) => ({ ...SLOTS, kpis: DATA.kpis.map((k, i) => (i === 3 ? { ...k, value: v } : k)) }) as Slots
  const cls = (v: string) => parse(renderSnapshotHtml(DATA, kpis(v), 'final', 'x')).querySelectorAll('.kpi-value')[3].className
  expect(cls('#2 of 2')).toBe('kpi-value')
  expect(cls('#2 of 22')).toBe('kpi-value aeo-long')
  expect(cls('  #2 of 2  ')).toBe('kpi-value')
  expect(parse(renderSnapshotHtml(DATA, SLOTS, 'final', 'x')).querySelectorAll('.kpi-value')[0].className).toBe('kpi-value')
})

test('data-kpis="3" on the strip only with exactly three cards', () => {
  const strip = (n: number) => {
    const slots = { ...SLOTS, kpis: DATA.kpis.slice(0, n) } as Slots
    return parse(renderSnapshotHtml(DATA, slots, 'final', 'x')).querySelector('.kpi-strip')!
  }
  expect(strip(3).outerHTML.startsWith('<div class="kpi-strip" data-kpis="3" style="grid-template-columns:repeat(3, 1fr)">')).toBe(true)
  for (const n of [1, 2, 4]) expect(strip(n).hasAttribute('data-kpis')).toBe(false)
  expect(strip(2).getAttribute('style')).toBe('grid-template-columns:repeat(2, 1fr)')
})

test('chart spacing rules (v1.1 §17.8): none names a chart internal, the chart-wrap body is only margin-bottom:0, no sizing or box property', () => {
  for (const r of CHART_SPACING_RULES) expect(r).not.toMatch(/plotly|svg|aeo-chart-/)
  const wrap = CHART_SPACING_RULES[CHART_SPACING_RULES.length - 1]!
  expect(wrap.startsWith('#category-data .chart-wrap')).toBe(true)
  expect(wrap.slice(wrap.indexOf('{') + 1, -1)).toBe('margin-bottom:0')
  for (const r of outsideRules().filter((x) => /chart-wrap|plotly|svg|aeo-chart-/.test(x.slice(0, x.indexOf('{'))))) expect(r.slice(r.indexOf('{') + 1)).not.toMatch(/(^|[;{\s])(height|min-height|padding|border|overflow)\s*:/)
})

test('chart spacing rules (v1.1 §17.8): each is in the draft, preview and final page exactly once', () => {
  for (const mode of ['draft', 'preview', 'final'] as const) {
    const h = renderSnapshotHtml(DATA, SLOTS, mode, 'x')
    for (const r of [COLOR_SCHEME_RULE, ...CHART_SPACING_RULES]) expect(h.split(r).length - 1, `${mode} ${r.slice(0, 40)}`).toBe(1)
  }
})

test('findings rows (v1.1 §17.10): the box loses justify-content:center, the list fills it, and html is drawn dark', () => {
  const out = outsideRules()
  expect(out.join('\n')).not.toContain('justify-content:center')
  expect(out.indexOf(COLOR_SCHEME_RULE)).toBe(out.indexOf('.kpi-value.aeo-long{font-size:24px;line-height:1.15}') + 1)
  const ctl = out.findIndex((r) => r.includes('.insight-box>.aeo-ctl'))
  expect(out.slice(ctl + 1, ctl + 5)).toEqual(CHART_SPACING_RULES.slice(4, 8))
})

test('the draft keeps the Add bullet and Remove buttons inside .insight-box with 2 and 3 bullets', () => {
  for (const n of [2, 3]) {
    const slots = { ...SLOTS, competitive_bullets: Array.from({ length: n }, (_, i) => ({ lead: `L${i}`, text: `T${i}` })), sources_bullets: Array.from({ length: n }, (_, i) => ({ lead: `S${i}`, text: `U${i}` })) } as unknown as Slots
    const doc = parse(renderSnapshotHtml(DATA, slots, 'draft', 'x'))
    const ctls = [...doc.querySelectorAll('[data-structure]')]
    expect(ctls.length).toBeGreaterThanOrEqual(2)
    for (const b of ctls) expect(b.closest('.insight-box'), `${n} ${b.getAttribute('data-structure')}`).not.toBeNull()
    expect(doc.querySelectorAll(`[data-structure="${n === 2 ? 'add' : 'remove'}"]`)).toHaveLength(n === 2 ? 2 : 6)
  }
})

test('the Add bullet button is a direct child of .insight-box, which the .aeo-ctl rule relies on', () => {
  const doc = parse(renderSnapshotHtml(DATA, SLOTS, 'draft', 'x'))
  const add = [...doc.querySelectorAll('[data-structure="add"]')]
  expect(add).toHaveLength(2)
  for (const b of add) {
    expect(b.classList.contains('aeo-ctl')).toBe(true)
    expect(b.parentElement!.classList.contains('insight-box')).toBe(true)
  }
})
