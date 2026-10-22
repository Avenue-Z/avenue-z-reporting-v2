import { expect, test } from 'vitest'
import { AIVX_CSS } from './aivx/css'
import { EDITOR_STYLE, FRAME_SCRIPT_JS, HEADER_CLONE_JS, PAGE_CSS, PAGE_JS, SHARE_BUTTON, SHARE_MOBILE, renderSnapshotHtml, showsPowered } from './render'
import { AIVX_JS } from './aivx/js'
import { pageDefaults, slotEntries, withDefaults } from './slots'
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

test('round 3: a new row reads Executive Summary in menu item 01 and as the headline section label', () => {
  const page = pageDefaults({ sectionTitles: ['Category data', 'Competitive visibility'], sidebarWordmark: 'Avenue Z', series: 'AI Visibility Snapshot' })
  const h = renderSnapshotHtml(DATA, { ...SLOTS, page }, 'final', 'Oct 9, 2026')
  expect(h).toContain('<a href="#headline"><span class="nav-num">01</span> Executive Summary</a>')
  expect(h).toContain('<div class="exec-label">Executive Summary</div>')
  expect(h).not.toContain('Headline signal')
})

const VIS_FIRST: Slots = { ...SLOTS, section_order: 'visibility_first' }
const menuOf = (doc: Document) => [...doc.querySelectorAll('.sidebar-nav a')].map((a) => [a.getAttribute('href'), a.querySelector('.nav-num')!.textContent])
const sectionIds = (doc: Document) => [...doc.querySelectorAll('section[id]')].map((e) => e.id)

test('round 3: a row with the marker lists Competitive Visibility at 02 and Cited Sources at 03, in the menu and on the page, in every mode', () => {
  for (const mode of ['final', 'preview', 'draft'] as const) {
    const doc = parse(renderSnapshotHtml(DATA, VIS_FIRST, mode, 'x'))
    expect(menuOf(doc)).toEqual([['#headline', '01'], ['#competitive-visibility', '02'], ['#category-data', '03'], ['#opportunities', '04'], ['#methodology', '05']])
    expect(sectionIds(doc)).toEqual(['headline', 'competitive-visibility', 'category-data', 'opportunities', 'methodology'])
    expect(doc.querySelector('#competitive-visibility .section-label')!.textContent).toMatch(/^02 \/ /)
    expect(doc.querySelector('#category-data .section-label')!.textContent).toMatch(/^03 \/ /)
  }
})

test('round 3: with the marker each section keeps its own title, bullets and chart, and the menu copies follow the page', () => {
  const doc = parse(renderSnapshotHtml(DATA, VIS_FIRST, 'draft', 'x'))
  const cv = doc.getElementById('competitive-visibility')!
  const cd = doc.getElementById('category-data')!
  expect(cv.querySelector('h2')!.getAttribute('data-slot')).toBe('page.section_2_title')
  expect(cv.querySelector('[data-slot="sources_bullets.0.lead"]')).not.toBeNull()
  expect(cv.querySelector('[data-slot="page.chart_2_title"]')).not.toBeNull()
  expect(cd.querySelector('h2')!.getAttribute('data-slot')).toBe('page.section_1_title')
  expect(cd.querySelector('[data-slot="competitive_bullets.0.lead"]')).not.toBeNull()
  expect(cd.querySelector('[data-slot="page.chart_1_title"]')).not.toBeNull()
  expect([...doc.querySelectorAll('[data-mirror-edit]')].map((e) => e.getAttribute('data-mirror'))).toEqual(['page.headline_label', 'page.section_2_title', 'page.section_1_title', 'page.opps_label'])
})

test('round 3: a row without the marker keeps today\'s order', () => {
  const doc = parse(renderSnapshotHtml(DATA, SLOTS, 'final', 'x'))
  expect(menuOf(doc)).toEqual([['#headline', '01'], ['#category-data', '02'], ['#competitive-visibility', '03'], ['#opportunities', '04'], ['#methodology', '05']])
  expect(sectionIds(doc)).toEqual(['headline', 'category-data', 'competitive-visibility', 'opportunities', 'methodology'])
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
test('Q10: the wordmark reads Avenue Z with no Powered by line, in every mode (spec v1.1 §16.1)', () => {
  for (const mode of ['draft', 'preview', 'final'] as const) {
    const h = renderSnapshotHtml(DATA, SLOTS, mode, 'Oct 9, 2026')
    if (mode === 'draft') expect(h).toContain('data-slot="page.sidebar_wordmark">Avenue Z</div>')
    else expect(h).toContain('<div class="aivx-brand">Avenue Z</div>\n  </div>')
    expect(h).not.toContain('<div class="powered">')
    expect(h).not.toContain('>AIVx<')
  }
})

test('showsPowered: only a wordmark that is not Avenue Z, trimmed and compared without case, gets the line', () => {
  expect(showsPowered('AIVx')).toBe(true)
  for (const w of ['Avenue Z', 'avenue z ', ' AVENUE Z']) expect(showsPowered(w)).toBe(false)
})

const THREE: Slots = { ...SLOTS, competitive_bullets: [...SLOTS.competitive_bullets, { lead: 'L3:', text: 'T3.' }] }

test('every visible text in draft is a slot, a mirror, fixed by design, a chart or a bullet control', () => {
  for (const slots of [SLOTS, THREE]) {
    const doc = parse(renderSnapshotHtml(DATA, slots, 'draft', 'Oct 8, 2026'))
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
    const bare: string[] = []
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement!
      if (!/[A-Za-z0-9]/.test(n.textContent ?? '') || el.closest('script,style')) continue
      if (!el.closest('[data-slot],[data-mirror],[data-locked],[data-structure]')) bare.push((n.textContent ?? '').trim())
    }
    expect(bare).toEqual([])
  }
})

test('fixed by design means exactly the nav numbers, the section number prefixes and the Prepared date', () => {
  const doc = parse(renderSnapshotHtml(DATA, SLOTS, 'draft', 'Oct 8, 2026'))
  expect([...doc.querySelectorAll('[data-locked="fixed"]')].map((e) => e.textContent)).toEqual(['01', '02', '03', '04', '05', '02 / ', '03 / ', '04 / ', '05 / ', 'Oct 8, 2026'])
  expect(doc.querySelectorAll('[data-locked="chart"]')).toHaveLength(2)
})

test('one slot per path, the only other editable elements are the four menu copies, every path present, and every mirror copies a path that has one', () => {
  const doc = parse(renderSnapshotHtml(DATA, SLOTS, 'draft', 'x'))
  const paths = [...doc.querySelectorAll('[data-slot]')].map((e) => e.getAttribute('data-slot'))
  expect(paths.length).toBe(new Set(paths).size)
  // The default wordmark is Avenue Z, so the Powered by line and its slot are not on the page (spec v1.1 §16.1).
  expect(new Set(paths)).toEqual(new Set(slotEntries(withDefaults(SLOTS, DATA)).map(([p]) => p).filter((p) => p !== 'page.sidebar_powered')))
  const mirrors = new Set([...doc.querySelectorAll('[data-mirror]')].map((e) => e.getAttribute('data-mirror')))
  expect(mirrors).toEqual(new Set(['brand', 'page.series', 'page.headline_label', 'page.section_1_title', 'page.section_2_title', 'page.opps_label', 'page.method_nav']))
  for (const m of mirrors) expect(paths).toContain(m)
  expect(doc.querySelectorAll('[data-mirror][data-slot]')).toHaveLength(0)
  const edits = [...doc.querySelectorAll('[data-mirror-edit]')]
  expect(edits.map((e) => e.getAttribute('data-mirror'))).toEqual(['page.headline_label', 'page.section_1_title', 'page.section_2_title', 'page.opps_label'])
  for (const e of edits) {
    expect(e.hasAttribute('data-mirror')).toBe(true)
    expect(e.closest('.sidebar-nav')).not.toBeNull()
  }
  expect(doc.querySelectorAll('.section-label [data-mirror-edit]')).toHaveLength(0)
})

test('the editor style outlines menu copies like slots and keeps the not-allowed cursor off them (spec v1.1 §17.16)', () => {
  for (const sel of ['', ':hover', ':focus']) expect(EDITOR_STYLE).toContain(`[data-mirror-edit]${sel}`)
  expect(EDITOR_STYLE).toContain('html.aeo-edit [data-mirror]:not([data-mirror-edit]),html.aeo-edit [data-locked]{cursor:not-allowed}')
})

test('an emptied menu copy stays clickable in edit mode (spec v1.1 §17.16)', () => {
  expect(EDITOR_STYLE).toContain('html.aeo-edit [data-mirror-edit]:empty{display:inline-block;min-width:2em}')
})

test('preview and final carry no data-mirror-edit, (spec v1.1 §17.16)', () => {
  for (const mode of ['preview', 'final'] as const) expect(renderSnapshotHtml(DATA, SLOTS, mode, 'Oct 8, 2026')).not.toContain('data-mirror-edit')
})

test('the Powered by line and its slot appear only under a wordmark that is not Avenue Z (spec v1.1 §16.1)', () => {
  const aivx = parse(renderSnapshotHtml(DATA, { ...SLOTS, page: { sidebar_wordmark: 'AIVx' } }, 'draft', 'x'))
  expect(aivx.querySelector('[data-slot="page.sidebar_powered"]')?.textContent).toBe('Powered by Avenue Z')
  for (const w of ['Avenue Z', ' avenue z ']) {
    const h = renderSnapshotHtml(DATA, { ...SLOTS, page: { sidebar_wordmark: w } }, 'draft', 'x')
    expect(h).not.toContain('data-slot="page.sidebar_powered"')
    expect(h).not.toContain('<div class="powered"')
  }
  expect(renderSnapshotHtml(DATA, { ...SLOTS, page: { sidebar_wordmark: 'AIVx' } }, 'final', 'x')).toContain('<div class="aivx-brand">AIVx</div>\n    <div class="powered">Powered by Avenue Z</div>')
})

test('the brand slot is used in every place the brand shows: title, description, hero, sidebar, footer, bar label and bolding', () => {
  const own = { ...BRANDS[1], name: 'Own' }
  const d = { ...DATA, brand: 'Own', brands: [BRANDS[0], own], own } as SnapshotData
  const h = renderSnapshotHtml(d, { ...SLOTS, brand: 'Renamed Co', context: 'Alpha leads Renamed Co.' }, 'final', 'x')
  expect(h).toContain('<title>AI Visibility Snapshot: Renamed Co | Avenue Z</title>')
  expect(h).toContain('<meta name="description" content="AI Visibility Snapshot for Renamed Co. Powered by Avenue Z AEO Intelligence.">')
  expect(h).toContain('<span class="grad-text">Renamed Co</span>')
  expect(h).toContain('<span>Renamed Co</span>')
  expect(h).toContain('Renamed Co<br>Prepared x')
  expect(h).toContain('"Renamed Co"')
  expect(h).toContain('<strong>Alpha</strong> leads <strong>Renamed Co</strong>.')
  expect(h).not.toContain('>Own<')
})

test('the long-name rule reads the brand slot', () => {
  expect(renderSnapshotHtml(DATA, { ...SLOTS, brand: 'A Very Long Brand Name Incorporated' }, 'final', 'x')).toContain('<h1 class="hero-industry" style="font-size:72px">')
})

test('one key drives every place its words appear: the series in the title, the sidebar and the footer (uppercase there)', () => {
  const h = renderSnapshotHtml(DATA, { ...SLOTS, page: { series: 'Market Snapshot' } }, 'final', 'x')
  expect(h).toContain('<title>Market Snapshot: ')
  expect(h).toContain('content="Market Snapshot for ')
  expect(h).toContain('<div class="hero-series">Market Snapshot</div>')
  expect(h).toContain('\n    Market Snapshot\n    <span>')
  expect(h).toContain('\n        MARKET SNAPSHOT\n      </p>')
  const draft = renderSnapshotHtml(DATA, { ...SLOTS, page: { series: 'Market Snapshot' } }, 'draft', 'x')
  expect(draft).toContain('<span class="aeo-w" data-mirror="page.series" data-upper>MARKET SNAPSHOT</span>')
})

test('bullet controls (spec v1.1 18.12): Remove on each bullet of a list longer than 1, Add bullet under a list shorter than 6, in draft only', () => {
  const h = renderSnapshotHtml(DATA, THREE, 'draft', 'x')
  const doc = parse(h)
  expect([...doc.querySelectorAll('[data-structure="remove"]')].map((e) => e.getAttribute('data-path'))).toEqual(['competitive_bullets.0', 'competitive_bullets.1', 'competitive_bullets.2', 'sources_bullets.0', 'sources_bullets.1'])
  expect([...doc.querySelectorAll('[data-structure="add"]')].map((e) => [e.getAttribute('data-path'), e.textContent])).toEqual([['competitive_bullets', 'Add bullet'], ['sources_bullets', 'Add bullet']])
  expect(doc.querySelector('[data-structure="remove"]')!.textContent).toBe('Remove')
  for (const n of [1, 2, 5, 6]) {
    const list = (t: string) => Array.from({ length: n }, (_, i) => ({ lead: `${t}${i}:`, text: `${t}${i}.` }))
    const slots: Slots = { ...SLOTS, competitive_bullets: list('L'), sources_bullets: list('G') }
    const d = parse(renderSnapshotHtml(DATA, slots, 'draft', 'x'))
    for (const key of ['competitive_bullets', 'sources_bullets']) {
      const box = d.querySelector(`[data-slot="${key}.0.lead"]`)!.closest('.insight-box')!
      expect([...box.querySelectorAll('[data-structure="remove"]')].map((e) => e.getAttribute('data-path')), `${key} ${n} remove`).toEqual(n > 1 ? Array.from({ length: n }, (_, i) => `${key}.${i}`) : [])
      expect([...box.querySelectorAll('[data-structure="add"]')].map((e) => e.getAttribute('data-path')), `${key} ${n} add`).toEqual(n < 6 ? [key] : [])
    }
    for (const mode of ['preview', 'final'] as const) {
      const other = renderSnapshotHtml(DATA, slots, mode, 'x')
      expect(other, `${mode} ${n}`).not.toContain('data-structure')
      expect(parse(other).querySelectorAll('.insight-box li'), `${mode} ${n}`).toHaveLength(2 * n)
    }
  }
})

test('the wrapper reset targets only wrapper spans and inherits spacing and case; the sidebar brand span keeps AIVx styling', () => {
  expect(EDITOR_STYLE).toContain('span.aeo-w,.sidebar-industry span.aeo-w{display:inline;font:inherit;color:inherit;letter-spacing:inherit;text-transform:inherit;margin:0}')
  expect(EDITOR_STYLE).toContain('th[data-slot]{user-select:text;-webkit-user-select:text}')
  const h = renderSnapshotHtml(DATA, SLOTS, 'draft', 'x')
  expect(h).toContain('<span class="aeo-w" data-mirror="page.series">AI Visibility Snapshot</span>')
  expect(h).toContain(`<span data-mirror="brand">${'Example &lt;Co&gt; &amp; &quot;Sons&quot;'}</span>`)
})

test('in every mode the header clone runs after the AIVx script; in draft the frame script runs after both', () => {
  for (const mode of ['draft', 'preview', 'final'] as const) {
    const h = renderSnapshotHtml(DATA, SLOTS, mode, 'x')
    const aivx = `<script>${AIVX_JS}</script>`
    const at = h.indexOf(aivx)
    expect(at).toBeGreaterThan(-1)
    expect(h.indexOf(`<script>${HEADER_CLONE_JS}</script>`)).toBe(at + aivx.length)
    if (mode === 'draft') expect(h.indexOf(FRAME_SCRIPT_JS)).toBeGreaterThan(at + aivx.length)
  }
})

test('the header clone removes the AIVx table sort from the opportunities table', () => {
  const hadInnerText = 'innerText' in HTMLElement.prototype
  if (!hadInnerText) Object.defineProperty(HTMLElement.prototype, 'innerText', { configurable: true, get() { return (this as HTMLElement).textContent } })
  try {
    const sortClass = (clone: boolean) => {
      const doc = parse(renderSnapshotHtml(DATA, SLOTS, 'final', 'x'))
      new Function('window', 'document', AIVX_JS)(new EventTarget(), doc)
      if (clone) new Function('document', HEADER_CLONE_JS)(doc)
      const th = doc.querySelector('.leaderboard thead th')!
      th.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return th.className
    }
    expect(sortClass(false)).toBe('sort-asc')
    expect(sortClass(true)).toBe('')
  } finally {
    if (!hadInnerText) delete (HTMLElement.prototype as { innerText?: unknown }).innerText
  }
})

test('showsPowered (v1.1 §17.5): shown under a name without "avenue z", hidden under any name that contains it', () => {
  for (const w of ['AIVx', 'AEO Lens']) expect(showsPowered(w)).toBe(true)
  for (const w of ['Avenue Z', '  avenue z ', 'Avenue Z AEO']) expect(showsPowered(w)).toBe(false)
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

/** v1.1 §17.8 and §17.10: the rules that close up the space beside the two charts and lay the findings out as rows, verbatim and in order.
 *  v1.1 18.12: rules 2 to 4 replace §17.8's display:flex on the first column, in its place, so both columns are flex
 *  columns and the chart card grows to a tall findings box. Rule 4 centres the donut below its title; since round 3
 *  (Ryan, 2026-10-21) the bar chart is left out of it, so it starts right under its title. */
const CHART_SPACING_RULES = [
  '#category-data .two-col,#competitive-visibility .two-col{margin-bottom:0}',
  '#category-data .two-col>div,#competitive-visibility .two-col>div{display:flex;flex-direction:column}',
  '#category-data .chart-wrap,#competitive-visibility .chart-wrap{flex:1;display:flex;flex-direction:column}',
  '#category-data .chart-wrap>.chart-title~*{margin-top:auto;margin-bottom:auto}',
  '#category-data .insight-box,#competitive-visibility .insight-box{flex:1;margin:24px 0 0;display:flex;flex-direction:column;padding:28px 32px}',
  '#category-data .insight-box>.aeo-ctl,#competitive-visibility .insight-box>.aeo-ctl{align-self:flex-start}',
  '#category-data .insight-box ul,#competitive-visibility .insight-box ul{flex:1;justify-content:space-evenly;list-style:none}',
  '#category-data .insight-box li,#competitive-visibility .insight-box li{font-size:16px;line-height:1.6;padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.08)}',
  '#category-data .insight-box li:last-child,#competitive-visibility .insight-box li:last-child{border-bottom:none}',
  '#category-data .insight-box li strong,#competitive-visibility .insight-box li strong{display:block;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px}',
  '#category-data .chart-wrap,#competitive-visibility .chart-wrap{margin-bottom:0}',
]
const COLOR_SCHEME_RULE = 'html{color-scheme:dark}'
/** v1.1 §17.14: Methodology as plain paragraphs, verbatim and in order, after the chart-wrap rule. */
const METHOD_RULES = [
  '#methodology .method-note{background:none;border:none;border-radius:0;padding:0;margin-top:16px;max-width:none;font-style:normal;font-size:15px;line-height:1.75;color:rgba(255,255,255,0.75)}',
  '#methodology .method-note>div+div{margin-top:14px}',
  '#methodology .method-note strong{color:var(--white);font-weight:800;font-style:normal}',
]
/** Round 3 (Ryan, 2026-10-21): the pillar cards, one column by default, after the Methodology rules. */
const PILLAR_RULES = [
  '.aeo-pillars{display:grid;grid-template-columns:1fr;gap:12px;margin-top:20px}',
  '.aeo-pillar{display:flex;flex-direction:column;padding:24px}',
  '.aeo-pillar-desc{font-size:14px;line-height:1.6;color:rgba(255,255,255,0.6);margin:10px 0 18px}',
  '.aeo-pillar-line{margin:auto 0 0;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);font-size:16px;line-height:1.5;font-weight:600;color:#fff}',
]
/** v1.1 §17.15: Opportunities laid out like Ryan's table, in its own desktop block after the phone block, verbatim and in order. */
const DESKTOP_OPEN = '@media (min-width: 901px){'
const DESKTOP_RULES = [
  '#opportunities .leaderboard-wrap{border:none;border-radius:0;overflow:visible;margin:24px -3px 0}',
  '#opportunities .leaderboard{table-layout:fixed;width:100%;font-size:15px;border-collapse:separate;border-spacing:3px}',
  '#opportunities .leaderboard thead tr,#opportunities .leaderboard tbody tr{border-bottom:none}',
  '#opportunities .leaderboard th{width:33.333%;background:rgba(96,255,234,0.08);color:#60FFEA;-webkit-text-fill-color:#60FFEA;box-shadow:inset 0 -2px 0 #60FFEA;font-size:14px;font-weight:800;letter-spacing:0;text-transform:none;padding:12px 16px;white-space:normal;cursor:default;vertical-align:bottom}',
  '#opportunities .leaderboard th:hover{color:#60FFEA}',
  '#opportunities .leaderboard td{padding:14px 16px;vertical-align:top;line-height:1.6;color:rgba(255,255,255,0.88);overflow-wrap:anywhere}',
  '#opportunities .leaderboard tbody tr:nth-child(odd) td{background:rgba(255,255,255,0.08)}',
  '#opportunities .leaderboard tbody tr:nth-child(even) td{background:rgba(255,255,255,0.035)}',
  '#opportunities .leaderboard tbody tr:hover{background:none}',
  '#opportunities .chart-takeaway{border-top:none;padding:16px 0 0;margin:0;color:rgba(255,255,255,0.6)}',
  '#opportunities .aeo-pillars{grid-template-columns:repeat(3,1fr);gap:16px;margin-top:24px}',
]
const outsideRules = () => PAGE_CSS.slice(0, PAGE_CSS.indexOf('@media (max-width: 900px){')).split('\n').filter(Boolean)

test('every PAGE_CSS rule except aeo-long, the chart spacing rules sits inside the phone media query', () => {
  const open = '@media (max-width: 900px){'
  const at = PAGE_CSS.indexOf(open)
  expect(at).toBeGreaterThan(-1)
  expect(PAGE_CSS.endsWith('}')).toBe(true)
  const outside = PAGE_CSS.slice(0, at).split('\n').filter(Boolean)
  expect(outside).toEqual(['.kpi-value.aeo-long{font-size:24px;line-height:1.15}', COLOR_SCHEME_RULE, ...CHART_SPACING_RULES, ...METHOD_RULES, ...PILLAR_RULES])
  const desktopAt = PAGE_CSS.indexOf(DESKTOP_OPEN)
  expect(desktopAt).toBeGreaterThan(at)
  expect(PAGE_CSS.slice(desktopAt - 2, desktopAt)).toBe('}\n')
  const inside = PAGE_CSS.slice(at + open.length, desktopAt - 2).split('\n').filter(Boolean)
  expect(inside.length).toBeGreaterThan(5)
  expect(inside.every((r) => r.endsWith('}') && !r.includes('@media'))).toBe(true)
  expect(PAGE_CSS.split('@media')).toHaveLength(3)
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

test('chart spacing rules (v1.1 §17.8, 18.12): none names a chart internal, the two .chart-wrap rules are the 18.12 flex column then margin-bottom:0, no sizing or box property', () => {
  for (const r of CHART_SPACING_RULES) expect(r).not.toMatch(/plotly|svg|aeo-chart-/)
  const wraps = outsideRules().filter((r) => r.startsWith('#category-data .chart-wrap,#competitive-visibility .chart-wrap{'))
  expect(wraps.map((r) => r.slice(r.indexOf('{') + 1, -1))).toEqual(['flex:1;display:flex;flex-direction:column', 'margin-bottom:0'])
  expect(CHART_SPACING_RULES[CHART_SPACING_RULES.length - 1]).toBe(wraps[1])
  for (const r of outsideRules().filter((x) => /chart-wrap|plotly|svg|aeo-chart-/.test(x.slice(0, x.indexOf('{'))))) expect(r.slice(r.indexOf('{') + 1)).not.toMatch(/(^|[;{\s])(height|min-height|padding|border|overflow)\s*:/)
})

test('the chart card rules (spec v1.1 18.12): the three rules replace the first-column display:flex rule, verbatim, in its place', () => {
  const out = outsideRules()
  expect(PAGE_CSS).not.toContain('#category-data .two-col>div:first-child,#competitive-visibility .two-col>div:first-child{display:flex}')
  const at = out.indexOf('#category-data .two-col,#competitive-visibility .two-col{margin-bottom:0}')
  expect(out.slice(at + 1, at + 5)).toEqual([
    '#category-data .two-col>div,#competitive-visibility .two-col>div{display:flex;flex-direction:column}',
    '#category-data .chart-wrap,#competitive-visibility .chart-wrap{flex:1;display:flex;flex-direction:column}',
    '#category-data .chart-wrap>.chart-title~*{margin-top:auto;margin-bottom:auto}',
    '#category-data .insight-box,#competitive-visibility .insight-box{flex:1;margin:24px 0 0;display:flex;flex-direction:column;padding:28px 32px}',
  ])
  expect(PAGE_CSS).not.toContain('#competitive-visibility .chart-wrap>.chart-title~*')
})

test('chart spacing rules (v1.1 §17.8): each is in the draft, preview and final page exactly once', () => {
  for (const mode of ['draft', 'preview', 'final'] as const) {
    const h = renderSnapshotHtml(DATA, SLOTS, mode, 'x')
    for (const r of [COLOR_SCHEME_RULE, ...CHART_SPACING_RULES]) expect(h.split(r).length - 1, `${mode} ${r.slice(0, 40)}`).toBe(1)
  }
})

test('Methodology rules (v1.1 §17.14): verbatim, in order, after the chart-wrap rule, outside the phone query, once per mode', () => {
  const out = outsideRules()
  expect(out.slice(-3 - PILLAR_RULES.length, -PILLAR_RULES.length)).toEqual(METHOD_RULES)
  expect(out.indexOf(METHOD_RULES[0]!)).toBe(out.indexOf(CHART_SPACING_RULES[CHART_SPACING_RULES.length - 1]!) + 1)
  for (const mode of ['draft', 'preview', 'final'] as const) {
    const h = renderSnapshotHtml(DATA, SLOTS, mode, 'x')
    for (const r of METHOD_RULES) expect(h.split(r).length - 1, `${mode} ${r.slice(0, 40)}`).toBe(1)
  }
})

test('findings rows (v1.1 §17.10): the box loses justify-content:center, the list fills it, and html is drawn dark', () => {
  const out = outsideRules()
  expect(out.join('\n')).not.toContain('justify-content:center')
  expect(out.indexOf(COLOR_SCHEME_RULE)).toBe(out.indexOf('.kpi-value.aeo-long{font-size:24px;line-height:1.15}') + 1)
  const ctl = out.findIndex((r) => r.includes('.insight-box>.aeo-ctl'))
  expect(out.slice(ctl + 1, ctl + 5)).toEqual(CHART_SPACING_RULES.slice(6, 10))
})

test('the draft keeps the Add bullet and Remove buttons inside .insight-box with 1, 2, 3, 5 and 6 bullets', () => {
  for (const n of [1, 2, 3, 5, 6]) {
    const slots = { ...SLOTS, competitive_bullets: Array.from({ length: n }, (_, i) => ({ lead: `L${i}`, text: `T${i}` })), sources_bullets: Array.from({ length: n }, (_, i) => ({ lead: `S${i}`, text: `U${i}` })) } as unknown as Slots
    const doc = parse(renderSnapshotHtml(DATA, slots, 'draft', 'x'))
    const ctls = [...doc.querySelectorAll('[data-structure]')]
    expect(ctls.length).toBeGreaterThanOrEqual(2)
    for (const b of ctls) expect(b.closest('.insight-box'), `${n} ${b.getAttribute('data-structure')}`).not.toBeNull()
    expect(doc.querySelectorAll('[data-structure="add"]'), `${n} add`).toHaveLength(n < 6 ? 2 : 0)
    expect(doc.querySelectorAll('[data-structure="remove"]'), `${n} remove`).toHaveLength(n > 1 ? 2 * n : 0)
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

test('Methodology has a 05 label that follows the menu word, an editable title, and Next step in its own unstyled block (spec v1.1 §17.13, §17.14)', () => {
  for (const [word, slots] of [['Methodology', SLOTS], ['Approach', { ...SLOTS, page: { method_nav: 'Approach' } } as Slots]] as const) {
    for (const mode of ['draft', 'preview', 'final'] as const) {
      const doc = parse(renderSnapshotHtml(DATA, slots, mode, 'x'))
      const sec = doc.querySelector('#methodology')!
      const label = sec.querySelector('.section-label')!
      const title = sec.querySelector('h2.section-title')!
      expect(label.textContent, `${mode} ${word} label`).toBe(`05 / ${word}`)
      expect(title.textContent, `${mode} ${word} title`).toBe('Methodology and next step')
      if (mode === 'draft') {
        expect(label.querySelector('[data-mirror="page.method_nav"]')).not.toBeNull()
        expect(title.getAttribute('data-slot')).toBe('page.method_title')
        expect(title.querySelector('[data-mirror]')).toBeNull()
      } else {
        expect(title.hasAttribute('data-slot')).toBe(false)
      }
      const blocks = [...sec.querySelectorAll('.method-note > div')]
      expect(blocks, `${mode} blocks`).toHaveLength(2)
      expect(blocks[0].querySelector('strong')!.getAttribute('data-slot') ?? (mode === 'draft' ? 'missing' : null)).toBe(mode === 'draft' ? 'page.method_label' : null)
      if (mode === 'draft') {
        expect(blocks[0].querySelector('[data-slot="methodology"]')).not.toBeNull()
        expect(blocks[1].querySelector('[data-slot="page.next_label"]')).not.toBeNull()
        expect(blocks[1].querySelector('[data-slot="next_step"]')).not.toBeNull()
        expect(blocks[0].querySelector('[data-slot="next_step"]')).toBeNull()
      }
      expect(blocks[0].textContent).toContain('Method.')
      expect(blocks[1].textContent).toContain('Next.')
      expect(blocks[0].textContent).not.toContain('Next.')
      expect(blocks[1].hasAttribute('style')).toBe(false)
    }
  }
})

test('the Methodology title is a page word: a stored value shows in every mode, and a row without the key shows the default (v1.1 §17.14)', () => {
  for (const mode of ['draft', 'preview', 'final'] as const) {
    const renamed = parse(renderSnapshotHtml(DATA, { ...SLOTS, page: { method_title: 'How we measured' } } as Slots, mode, 'x'))
    expect(renamed.querySelector('#methodology h2.section-title')!.textContent, mode).toBe('How we measured')
    expect(renamed.querySelector('#methodology .section-label')!.textContent, mode).toBe('05 / Methodology')
    const old = parse(renderSnapshotHtml(DATA, { ...SLOTS, page: { series: 'Snapshot' } } as Slots, mode, 'x'))
    expect(old.querySelector('#methodology h2.section-title')!.textContent, mode).toBe('Methodology and next step')
  }
  const draft = parse(renderSnapshotHtml(DATA, SLOTS, 'draft', 'x'))
  expect(draft.querySelectorAll('[data-slot="page.method_title"]')).toHaveLength(1)
})

test('Opportunities table rules (v1.1 §17.15): verbatim, after the phone block, all inside (min-width: 901px), phone block unchanged', () => {
  const phoneOpen = '@media (max-width: 900px){'
  const phoneAt = PAGE_CSS.indexOf(phoneOpen)
  const at = PAGE_CSS.indexOf(DESKTOP_OPEN)
  expect(at).toBeGreaterThan(phoneAt)
  expect(PAGE_CSS.endsWith('\n}')).toBe(true)
  expect(PAGE_CSS.slice(at).split('\n')).toEqual([DESKTOP_OPEN, ...DESKTOP_RULES, '}'])
  const phone = PAGE_CSS.slice(phoneAt + phoneOpen.length, at - 2).split('\n').filter(Boolean)
  expect(phone).toHaveLength(9)
  expect(phone[0]).toBe('.hero-industry{font-size:clamp(40px,11vw,64px)!important;line-height:1.1}')
  expect(phone[8]).toBe('.leaderboard td::before{content:attr(data-label);display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:4px}')
  expect(PAGE_CSS.slice(0, phoneAt).split('\n').filter(Boolean).some((r) => r.includes('#opportunities'))).toBe(false)
  expect(phone.some((r) => r.includes('#opportunities'))).toBe(false)
})

test('Opportunities table rules (v1.1 §17.15): each is in the draft, preview and final page exactly once', () => {
  for (const mode of ['draft', 'preview', 'final'] as const) {
    const h = renderSnapshotHtml(DATA, SLOTS, mode, 'x')
    expect(h.split(DESKTOP_OPEN).length - 1, `${mode} open`).toBe(1)
    for (const r of DESKTOP_RULES) expect(h.split(r).length - 1, `${mode} ${r.slice(0, 40)}`).toBe(1)
  }
})

test('the headline signal gets the phone side padding, once per mode, inside the phone block only (v1.1 §17.17)', () => {
  const rule = '.exec-summary{padding:40px 24px}'
  const phoneOpen = '@media (max-width: 900px){'
  const phoneAt = PAGE_CSS.indexOf(phoneOpen)
  const desktopAt = PAGE_CSS.indexOf(DESKTOP_OPEN)
  const phone = PAGE_CSS.slice(phoneAt + phoneOpen.length, desktopAt - 2).split('\n').filter(Boolean)
  expect(phone[1]).toBe(rule)
  expect(PAGE_CSS.split(rule)).toHaveLength(2)
  expect(PAGE_CSS.indexOf(rule)).toBeGreaterThan(phoneAt)
  expect(PAGE_CSS.indexOf(rule)).toBeLessThan(desktopAt)
  for (const mode of ['draft', 'preview', 'final'] as const) expect(renderSnapshotHtml(DATA, SLOTS, mode, 'x').split(rule).length - 1, mode).toBe(1)
})

const HIDDEN: Slots = { ...SLOTS, opportunities_page: 'hidden' }
test('Opportunities page off (Ryan, round 3): no section, no menu item, Methodology is 04, Why it matters stays, in every mode', () => {
  for (const mode of ['draft', 'preview', 'final'] as const) {
    const h = renderSnapshotHtml(DATA, HIDDEN, mode, 'Oct 8, 2026')
    const doc = parse(h)
    expect(doc.getElementById('opportunities'), mode).toBeNull()
    expect(doc.querySelector('a[href="#opportunities"]'), mode).toBeNull()
    expect([...doc.querySelectorAll('.sidebar-nav .nav-num')].map((e) => e.textContent), mode).toEqual(['01', '02', '03', '04'])
    expect(doc.querySelector('#methodology .section-label')!.textContent, mode).toMatch(/^04 \/ /)
    expect(doc.querySelector('.rec-global-bottom-line'), mode).not.toBeNull()
    expect(h, mode).not.toContain('class="leaderboard"')
  }
})

test('Opportunities page on, stored or by default, renders the same bytes', () => {
  for (const mode of ['draft', 'preview', 'final'] as const) expect(renderSnapshotHtml(DATA, { ...SLOTS, opportunities_page: 'shown' }, mode, 'x')).toBe(renderSnapshotHtml(DATA, SLOTS, mode, 'x'))
})

test('hidden: the fixed marks, the slots and the menu copies follow the page (spec §9 m9)', () => {
  const doc = parse(renderSnapshotHtml(DATA, HIDDEN, 'draft', 'Oct 8, 2026'))
  expect([...doc.querySelectorAll('[data-locked="fixed"]')].map((e) => e.textContent)).toEqual(['01', '02', '03', '04', '02 / ', '03 / ', '04 / ', 'Oct 8, 2026'])
  const paths = [...doc.querySelectorAll('[data-slot]')].map((e) => e.getAttribute('data-slot'))
  expect(new Set(paths)).toEqual(new Set(slotEntries(withDefaults(HIDDEN, DATA)).map(([p]) => p).filter((p) => p !== 'page.sidebar_powered')))
  expect([...doc.querySelectorAll('[data-mirror-edit]')].map((e) => e.getAttribute('data-mirror'))).toEqual(['page.headline_label', 'page.section_1_title', 'page.section_2_title'])
})

const PILLAR_SLOTS: Slots = { ...SLOTS, opportunities_layout: 'pillars', opportunities: [0, 1, 2].map((i) => ({ workstream: `Pillar ${i}`, opportunity: `About ${i}`, signal: `Line ${i}` })) }
test('pillar layout (Ryan, round 3): three cards in order, name, description and line as slots, no table or footnote, every mode', () => {
  for (const mode of ['draft', 'preview', 'final'] as const) {
    const doc = parse(renderSnapshotHtml(DATA, PILLAR_SLOTS, mode, 'x'))
    const cards = [...doc.querySelectorAll('#opportunities .aeo-pillars > .cluster-card.aeo-pillar')]
    expect(cards.map((c) => [c.querySelector('.cluster-name')!.textContent, c.querySelector('.aeo-pillar-desc')!.textContent, c.querySelector('.aeo-pillar-line')!.textContent]), mode).toEqual([0, 1, 2].map((i) => [`Pillar ${i}`, `About ${i}`, `Line ${i}`]))
    expect(doc.querySelector('#opportunities table'), mode).toBeNull()
    expect(doc.querySelector('#opportunities .chart-takeaway'), mode).toBeNull()
    expect(doc.querySelector('#opportunities h2.section-title'), mode).not.toBeNull()
  }
  const draft = parse(renderSnapshotHtml(DATA, PILLAR_SLOTS, 'draft', 'x'))
  expect([...draft.querySelectorAll('#opportunities [data-slot]')].map((e) => e.getAttribute('data-slot'))).toEqual(['page.opps_label', 'page.opps_title', ...[0, 1, 2].flatMap((i) => [`opportunities.${i}.workstream`, `opportunities.${i}.opportunity`, `opportunities.${i}.signal`])])
  const paths = [...draft.querySelectorAll('[data-slot]')].map((e) => e.getAttribute('data-slot'))
  expect(new Set(paths)).toEqual(new Set(slotEntries(withDefaults(PILLAR_SLOTS, DATA)).map(([p]) => p).filter((p) => p !== 'page.sidebar_powered')))
})

test('both round-3 markers on one row: hidden writes no Opportunities section, cards or menu item; shown writes the cards', () => {
  for (const mode of ['draft', 'preview', 'final'] as const) {
    const doc = parse(renderSnapshotHtml(DATA, { ...PILLAR_SLOTS, opportunities_page: 'hidden' }, mode, 'x'))
    expect(doc.getElementById('opportunities'), mode).toBeNull()
    expect(doc.querySelector('.aeo-pillars'), mode).toBeNull()
    expect(doc.querySelector('a[href="#opportunities"]'), mode).toBeNull()
    expect(doc.querySelector('#methodology .section-label')!.textContent, mode).toMatch(/^04 \/ /)
    // Hidden, the layout leaves no trace: the page is the hidden table row's, byte for byte, so the hidden-page tests cover it.
    expect(renderSnapshotHtml(DATA, { ...PILLAR_SLOTS, opportunities_page: 'hidden' }, mode, 'x'), mode).toBe(renderSnapshotHtml(DATA, { ...SLOTS, opportunities_page: 'hidden' }, mode, 'x'))
  }
  const shown = parse(renderSnapshotHtml(DATA, { ...PILLAR_SLOTS, opportunities_page: 'shown' }, 'final', 'x'))
  expect(shown.querySelectorAll('#opportunities .aeo-pillars > .cluster-card.aeo-pillar')).toHaveLength(3)
})

test('pillar rules: verbatim after the Methodology rules, the 3-column rule in the desktop block, each once per mode', () => {
  for (const mode of ['draft', 'preview', 'final'] as const) {
    const h = renderSnapshotHtml(DATA, SLOTS, mode, 'x')
    for (const r of PILLAR_RULES) expect(h.split(r).length - 1, `${mode} ${r.slice(0, 40)}`).toBe(1)
  }
})
