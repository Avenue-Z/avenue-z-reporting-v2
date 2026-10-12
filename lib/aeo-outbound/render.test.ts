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
  expect(h).toContain('class="share-btn"')
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
    const rest = parts.join('')
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
  expect([...doc.querySelectorAll('[data-locked="fixed"]')].map((e) => e.textContent)).toEqual(['01', '02', '03', '04', '05', '02 / ', '03 / ', '04 / ', 'Oct 8, 2026'])
  expect(doc.querySelectorAll('[data-locked="chart"]')).toHaveLength(2)
})

test('exactly one editable element per path, every path present, and every mirror copies a path that has one', () => {
  const doc = parse(renderSnapshotHtml(DATA, SLOTS, 'draft', 'x'))
  const paths = [...doc.querySelectorAll('[data-slot]')].map((e) => e.getAttribute('data-slot'))
  expect(paths.length).toBe(new Set(paths).size)
  // The default wordmark is Avenue Z, so the Powered by line and its slot are not on the page (spec v1.1 §16.1).
  expect(new Set(paths)).toEqual(new Set(slotEntries(withDefaults(SLOTS, DATA)).map(([p]) => p).filter((p) => p !== 'page.sidebar_powered')))
  const mirrors = new Set([...doc.querySelectorAll('[data-mirror]')].map((e) => e.getAttribute('data-mirror')))
  expect(mirrors).toEqual(new Set(['brand', 'page.series', 'page.headline_label', 'page.section_1_title', 'page.section_2_title', 'page.opps_label']))
  for (const m of mirrors) expect(paths).toContain(m)
  expect(doc.querySelectorAll('[data-mirror][data-slot]')).toHaveLength(0)
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

test('bullet controls: Add bullet under a list of 2, Remove on each bullet of a list of 3, in draft only', () => {
  const h = renderSnapshotHtml(DATA, THREE, 'draft', 'x')
  const doc = parse(h)
  expect([...doc.querySelectorAll('[data-structure="remove"]')].map((e) => e.getAttribute('data-path'))).toEqual(['competitive_bullets.0', 'competitive_bullets.1', 'competitive_bullets.2'])
  expect([...doc.querySelectorAll('[data-structure="add"]')].map((e) => [e.getAttribute('data-path'), e.textContent])).toEqual([['sources_bullets', 'Add bullet']])
  expect(doc.querySelector('[data-structure="remove"]')!.textContent).toBe('Remove')
  expect(renderSnapshotHtml(DATA, THREE, 'final', 'x')).not.toContain('data-structure')
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
    if (mode === 'final') expect(h.indexOf(AIVX_SHARE_BLOCK)).toBeGreaterThan(at)
    if (mode === 'draft') expect(h.indexOf(FRAME_SCRIPT_JS)).toBeGreaterThan(at)
  }
})

test('the phone Share block is in the final page only, immediately before the footer', () => {
  expect(renderSnapshotHtml(DATA, SLOTS, 'final', 'x')).toContain(`</section>\n${SHARE_MOBILE}<footer class="footer">`)
  for (const mode of ['draft', 'preview'] as const) expect(renderSnapshotHtml(DATA, SLOTS, mode, 'x')).not.toContain('class="aeo-share-mobile"')
  expect(SHARE_MOBILE).toBe('<div class="aeo-share-mobile"><button class="aeo-share-mobile-btn" type="button" aria-label="Copy shareable link to this report">Share Report</button></div>')
})

test('every PAGE_CSS rule except aeo-long and the default hidden share block sits inside the phone media query', () => {
  const open = '@media (max-width: 900px){'
  const at = PAGE_CSS.indexOf(open)
  expect(at).toBeGreaterThan(-1)
  expect(PAGE_CSS.endsWith('}')).toBe(true)
  const outside = PAGE_CSS.slice(0, at).split('\n').filter(Boolean)
  expect(outside).toEqual(['.kpi-value.aeo-long{font-size:24px;line-height:1.15}', '.aeo-share-mobile{display:none}'])
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
