import { afterEach, beforeEach, expect, test, vi, type MockInstance } from 'vitest'
import { FRAME_SCRIPT_JS, PAGE_JS, renderSnapshotHtml, type RenderMode } from './render'
import { AIVX_SHARE_BLOCK } from './aivx/share'
import { AIVX_JS } from './aivx/js'
import { sourceDonutFigure } from './charts'
import { pyRound } from './metrics'
import { V1_DATA, V1_SLOTS } from './__fixtures__/v1-row'
import type { Slots } from './slots'

// The frame script runs against a parsed draft page. window is a stand-in event target for the frame's own window;
// parent is the test window, whose postMessage is spied, so nothing is really posted.
let post: MockInstance<typeof window.postMessage>
let win: EventTarget
let doc: Document
function boot(slots: Slots = V1_SLOTS) {
  doc = new DOMParser().parseFromString(renderSnapshotHtml(V1_DATA, slots, 'draft', 'Oct 8, 2026'), 'text/html')
  win = new EventTarget()
  new Function('window', 'document', 'parent', FRAME_SCRIPT_JS)(win, doc, window)
}
const sent = () => post.mock.calls.map((c) => c[0])
const fromParent = (data: unknown, source: Window | null = window) => { win.dispatchEvent(new MessageEvent('message', { data, source })) }
const slot = (p: string) => doc.querySelector(`[data-slot="${p}"]`) as HTMLElement
const type = (p: string, text: string) => { const el = slot(p); el.textContent = text; el.dispatchEvent(new Event('input', { bubbles: true })) }
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

beforeEach(() => {
  vi.useFakeTimers()
  post = vi.spyOn(window, 'postMessage').mockImplementation(() => {})
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

test('the frame says ready on load, and the mode message makes every slot editable or not', () => {
  boot()
  expect(sent()).toEqual([{ type: 'ready' }])
  fromParent({ type: 'mode', edit: true })
  const slots = [...doc.querySelectorAll('[data-slot]')]
  expect(slots.every((e) => e.getAttribute('contenteditable') === 'plaintext-only')).toBe(true)
  expect(doc.documentElement.classList.contains('aeo-edit')).toBe(true)
  fromParent({ type: 'mode', edit: false })
  expect(doc.querySelectorAll('[contenteditable]')).toHaveLength(0)
  expect(doc.documentElement.classList.contains('aeo-edit')).toBe(false)
})

test('contenteditable falls back to true where plaintext-only is unsupported', () => {
  Object.defineProperty(HTMLElement.prototype, 'contentEditable', {
    configurable: true,
    get() { return 'inherit' },
    set(v: string) { if (v === 'plaintext-only') throw new DOMException('unsupported', 'SyntaxError') },
  })
  try {
    boot()
    fromParent({ type: 'mode', edit: true })
    expect(slot('headline').getAttribute('contenteditable')).toBe('true')
  } finally {
    delete (HTMLElement.prototype as { contentEditable?: unknown }).contentEditable
  }
})

test('typing in edit mode posts dirty at once and the edit after 800 ms, and every mirror of that path follows', () => {
  boot()
  fromParent({ type: 'mode', edit: true })
  type('page.series', '  New   series ')
  expect(sent().at(-1)).toEqual({ type: 'dirty', path: 'page.series' })
  vi.advanceTimersByTime(799)
  expect(sent().filter((m) => (m as { type: string }).type === 'edit')).toEqual([])
  vi.advanceTimersByTime(1)
  expect(sent().at(-1)).toEqual({ type: 'edit', path: 'page.series', value: '  New   series ' })
  expect(doc.querySelector('.sidebar-industry [data-mirror="page.series"]')!.textContent).toBe('New series')
  expect(doc.querySelector('[data-mirror="page.series"][data-upper]')!.textContent).toBe('NEW SERIES')
})

test('in Preview nothing is editable: typing and clicks post nothing, and links are left alone', () => {
  boot()
  type('headline', 'x')
  expect(click(doc.querySelector('[data-locked="chart"]')!)).toBe(true)
  expect(click(doc.querySelector('.footer-link')!)).toBe(true)
  vi.advanceTimersByTime(1000)
  expect(sent()).toEqual([{ type: 'ready' }])
})

test('in edit mode links and the sidebar nav never navigate', () => {
  boot()
  fromParent({ type: 'mode', edit: true })
  expect(click(doc.querySelector('.footer-link')!)).toBe(false)
  expect(click(doc.querySelector('.sidebar-nav a')!)).toBe(false)
})

test('locked: a chart posts chart, a nav number or the Prepared date posts fixed, a mirror posts fixed with the path it copies', () => {
  boot()
  fromParent({ type: 'mode', edit: true })
  click(doc.querySelector('[data-locked="chart"] .plotly-graph-div')!)
  click(doc.querySelector('.nav-num')!)
  click(doc.querySelector('.sidebar-industry [data-mirror="brand"]')!)
  click(slot('headline'))
  expect(sent().slice(1)).toEqual([
    { type: 'locked', what: 'chart' },
    { type: 'locked', what: 'fixed' },
    { type: 'locked', what: 'fixed', path: 'brand' },
  ])
})

test('a structural click sends the pending edit first', () => {
  boot()
  fromParent({ type: 'mode', edit: true })
  type('headline', 'Typed headline')
  click(doc.querySelector('[data-structure="add"][data-path="competitive_bullets"]')!)
  expect(sent().slice(1)).toEqual([
    { type: 'dirty', path: 'headline' },
    { type: 'edit', path: 'headline', value: 'Typed headline' },
    { type: 'structure', op: 'add', path: 'competitive_bullets' },
  ])
  vi.advanceTimersByTime(1000)
  expect(sent()).toHaveLength(4)
})

test('a Remove click names the bullet', () => {
  boot({ ...V1_SLOTS, sources_bullets: [...V1_SLOTS.sources_bullets, { lead: 'L3:', text: 'T3.' }] })
  fromParent({ type: 'mode', edit: true })
  click(doc.querySelector('[data-structure="remove"][data-path="sources_bullets.1"]')!)
  expect(sent().at(-1)).toEqual({ type: 'structure', op: 'remove', path: 'sources_bullets.1' })
})

test('a Remove click on bullet 5 of 6 posts competitive_bullets.4 and remove (spec v1.1 18.12)', () => {
  boot({ ...V1_SLOTS, competitive_bullets: Array.from({ length: 6 }, (_, i) => ({ lead: `L${i}:`, text: `T${i}.` })) })
  fromParent({ type: 'mode', edit: true })
  click(doc.querySelector('[data-structure="remove"][data-path="competitive_bullets.4"]')!)
  expect(sent().at(-1)).toEqual({ type: 'structure', op: 'remove', path: 'competitive_bullets.4' })
  expect(doc.querySelector('[data-structure="add"][data-path="competitive_bullets"]')).toBeNull()
})

test('flush from the parent sends every pending edit; the same message from anyone else is ignored', () => {
  boot()
  fromParent({ type: 'mode', edit: true })
  type('why', 'Typed')
  fromParent({ type: 'flush' }, null)
  expect(sent().at(-1)).toEqual({ type: 'dirty', path: 'why' })
  fromParent({ type: 'flush' })
  expect(sent().at(-1)).toEqual({ type: 'edit', path: 'why', value: 'Typed' })
})

test('focus flashes the field and focuses it; Enter never adds a line', () => {
  boot()
  fromParent({ type: 'mode', edit: true })
  fromParent({ type: 'focus', path: 'why' })
  expect(slot('why').classList.contains('aeo-flash')).toBe(true)
  vi.advanceTimersByTime(1200)
  expect(slot('why').classList.contains('aeo-flash')).toBe(false)
  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  expect(slot('why').dispatchEvent(enter)).toBe(false)
})

test('the listener is delegated: a node cloned after the script ran still posts its edits', () => {
  boot()
  fromParent({ type: 'mode', edit: true })
  const thead = doc.querySelector('.leaderboard thead')!
  thead.parentNode!.replaceChild(thead.cloneNode(true), thead)
  type('page.opps_col_1', 'Evidence')
  expect(sent().at(-1)).toEqual({ type: 'dirty', path: 'page.opps_col_1' })
})

test('Enter is cancelled on a slot only in edit mode, so a keyboard user can open a link slot in Preview', () => {
  boot()
  const enter = () => new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  expect(slot('page.footer_link').dispatchEvent(enter())).toBe(true)
  fromParent({ type: 'mode', edit: true })
  expect(slot('page.footer_link').dispatchEvent(enter())).toBe(false)
})

// PAGE_JS (v1.1 §17.1, §17.2) runs first, as in the page, then the frame script when the mode is draft.
let scrolled: MockInstance
function bootPage(mode: RenderMode, extra: Record<string, unknown> = {}, slots: Slots = V1_SLOTS) {
  doc = new DOMParser().parseFromString(renderSnapshotHtml(V1_DATA, slots, mode, 'Oct 8, 2026'), 'text/html')
  win = Object.assign(new EventTarget(), extra)
  new Function('window', 'document', PAGE_JS)(win, doc)
  if (mode === 'draft') new Function('window', 'document', 'parent', FRAME_SCRIPT_JS)(win, doc, window)
  if (doc.readyState !== 'complete') win.dispatchEvent(new Event('load'))
}
const link = (id: string) => doc.querySelector(`.sidebar-nav a[href="#${id}"]`)!
function stubScroll() {
  const fn = vi.fn()
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: fn })
  scrolled = fn as unknown as MockInstance
}
afterEach(() => { delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView })

test.each(['preview', 'draft'] as const)('%s outside edit mode: a menu click scrolls to the section smoothly and is default-prevented', (mode) => {
  stubScroll()
  bootPage(mode)
  expect(click(link('headline'))).toBe(false)
  expect(scrolled).toHaveBeenCalledTimes(1)
  expect(scrolled.mock.instances[0]).toBe(doc.getElementById('headline'))
  expect(scrolled).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
})

test('final: a menu click scrolls too', () => {
  stubScroll()
  bootPage('final')
  expect(click(link('methodology'))).toBe(false)
  expect(scrolled.mock.instances[0]).toBe(doc.getElementById('methodology'))
})

test('in edit mode PAGE_JS does nothing (no scroll, no prevent); the frame script still cancels the link', () => {
  stubScroll()
  bootPage('draft')
  fromParent({ type: 'mode', edit: true })
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
  // PAGE_JS alone must not prevent: run it on a second page that has no frame script.
  const a = link('headline')
  expect(a.dispatchEvent(ev)).toBe(false) // the frame script's rule
  expect(scrolled).not.toHaveBeenCalled()
  const only = new DOMParser().parseFromString(renderSnapshotHtml(V1_DATA, V1_SLOTS, 'draft', 'x'), 'text/html')
  only.querySelector('[data-slot]')!.setAttribute('contenteditable', 'true')
  new Function('window', 'document', PAGE_JS)(new EventTarget(), only)
  expect(only.querySelector('.sidebar-nav a[href="#headline"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))).toBe(true)
  expect(scrolled).not.toHaveBeenCalled()
})

test('a link to a hash with no section is not prevented', () => {
  stubScroll()
  bootPage('preview')
  const a = doc.createElement('a')
  a.setAttribute('href', '#nope')
  doc.body.appendChild(a)
  expect(click(a)).toBe(true)
  expect(scrolled).not.toHaveBeenCalled()
})

// The donut (v1.1 §17.2): Plotly and matchMedia are stubs; the tests prove the calls.
const MIX = [{ label: 'Reference', weight: 4.8 }, { label: 'Corporate', weight: 60.3 }, { label: 'You', weight: 34.9 }]
function bootDonut(over: { matches?: boolean; react?: () => unknown; noPlotly?: boolean; noEl?: boolean; mix?: typeof MIX } = {}) {
  const fig = sourceDonutFigure(over.mix ?? MIX)
  const react = vi.fn(over.react ?? (() => Promise.resolve()))
  const listeners: ((e: { matches: boolean }) => void)[] = []
  const mq = { matches: over.matches ?? true, addEventListener: (_: string, f: (e: { matches: boolean }) => void) => { listeners.push(f) } }
  const matchMedia = vi.fn(() => mq)
  doc = new DOMParser().parseFromString(renderSnapshotHtml(V1_DATA, V1_SLOTS, 'final', 'x'), 'text/html')
  const el = doc.getElementById('aeo-chart-sources') as unknown as { data?: unknown; layout?: unknown } & HTMLElement
  if (over.noEl) el.removeAttribute('id')
  else { el.data = JSON.parse(JSON.stringify(fig.data)); el.layout = JSON.parse(JSON.stringify(fig.layout)) }
  win = Object.assign(new EventTarget(), { matchMedia }, over.noPlotly ? {} : { Plotly: { react } })
  new Function('window', 'document', PAGE_JS)(win, doc)
  if (doc.readyState !== 'complete') win.dispatchEvent(new Event('load'))
  return { react, fig, mq, change: (matches: boolean) => listeners.forEach((f) => f({ matches })), matchMedia }
}

test('donut on a phone: one react call with percent text from 5%, percentages in the legend, and a customdata hover', () => {
  const { react, fig, matchMedia } = bootDonut()
  expect(matchMedia).toHaveBeenCalledWith('(max-width: 900px)')
  expect(react).toHaveBeenCalledTimes(1)
  const [target, data, layout] = react.mock.calls[0] as unknown as [unknown, Record<string, unknown>[], unknown]
  expect(target).toBe(doc.getElementById('aeo-chart-sources'))
  const t = data[0]
  expect(t.texttemplate).toEqual(['', '%{percent:.1%}', '%{percent:.1%}'])
  expect(t.labels).toEqual(['Reference 4.8%', 'Corporate 60.3%', 'You 34.9%'])
  expect(t.customdata).toEqual(['Reference', 'Corporate', 'You'])
  expect(String(t.hovertemplate)).toContain('%{customdata}')
  expect(String(t.hovertemplate)).not.toContain('%{label}')
  expect(layout).toEqual(JSON.parse(JSON.stringify(fig.layout)))
})

test('donut on a phone: an exact tie rounds half to even, the same as the source-mix sentence (final review M5)', () => {
  // 25 of 400 is exactly 6.25 and 375 of 400 exactly 93.75: the sentence's pyRound gives 6.2 and 93.8.
  const { react } = bootDonut({ mix: [{ label: 'Corporate', weight: 375 }, { label: 'Editorial', weight: 25 }] })
  const t = (react.mock.calls[0] as unknown as [unknown, Record<string, unknown>[]])[1][0]
  expect(t.labels).toEqual([`Corporate ${pyRound((375 / 400) * 100, 1).toFixed(1)}%`, `Editorial ${pyRound((25 / 400) * 100, 1).toFixed(1)}%`])
  expect(t.labels).toEqual(['Corporate 93.8%', 'Editorial 6.2%'])
})

test('donut: when the query stops matching react gets the originals; matching again redraws', () => {
  const { react, fig, change } = bootDonut()
  change(false)
  expect(react).toHaveBeenCalledTimes(2)
  expect((react.mock.calls[1] as unknown[])[1]).toEqual(JSON.parse(JSON.stringify(fig.data)))
  change(true)
  expect(react).toHaveBeenCalledTimes(3)
  expect((((react.mock.calls[2] as unknown[])[1]) as Record<string, unknown>[])[0].customdata).toEqual(['Reference', 'Corporate', 'You'])
})

test('donut on a desktop width: no call at load; narrowing draws the phone figure, widening restores the originals', () => {
  const { react, fig, change } = bootDonut({ matches: false })
  expect(react).not.toHaveBeenCalled()
  change(true)
  expect(react).toHaveBeenCalledTimes(1)
  expect(((react.mock.calls[0] as unknown[])[1] as Record<string, unknown>[])[0].labels).toEqual(['Reference 4.8%', 'Corporate 60.3%', 'You 34.9%'])
  change(false)
  expect(react).toHaveBeenCalledTimes(2)
  expect((react.mock.calls[1] as unknown[])[1]).toEqual(JSON.parse(JSON.stringify(fig.data)))
})

test('donut: a rejected react restores the originals once, and a throw does the same', async () => {
  const rejected = bootDonut({ react: () => Promise.reject(new Error('x')) })
  await vi.advanceTimersByTimeAsync(0)
  expect(rejected.react).toHaveBeenCalledTimes(2)
  expect((rejected.react.mock.calls[1] as unknown[])[1]).toEqual(JSON.parse(JSON.stringify(rejected.fig.data)))
  const throwing = bootDonut({ react: () => { throw new Error('x') } })
  expect(throwing.react).toHaveBeenCalledTimes(2)
  expect((throwing.react.mock.calls[1] as unknown[])[1]).toEqual(JSON.parse(JSON.stringify(throwing.fig.data)))
})

test('donut: no Plotly or no element means no throw and no call', () => {
  const none0 = bootDonut({ noPlotly: true })
  const el = doc.getElementById('aeo-chart-sources') as unknown as { data: unknown; layout: unknown }
  const data = el.data, layout = el.layout
  expect(none0.matchMedia).not.toHaveBeenCalled()
  expect(el.data).toBe(data)
  expect(el.layout).toBe(layout)
  expect(JSON.stringify(el.data)).toBe(JSON.stringify(sourceDonutFigure(MIX).data))
  const none = bootDonut({ noEl: true })
  expect(none.react).not.toHaveBeenCalled()
})

// The menu highlights 05 at the bottom of the page (v1.1 §17.12). AIVx's real scroll-spy runs first, then PAGE_JS, as in
// the page. getBoundingClientRect is stubbed so the sections sit where the test says; the scroll metrics are stubbed too.
const SECTION_IDS = ['headline', 'category-data', 'competitive-visibility', 'opportunities', 'methodology']
function bootSpy(mode: RenderMode, o: { bottom: boolean; tops?: number[]; edit?: boolean }) {
  doc = new DOMParser().parseFromString(renderSnapshotHtml(V1_DATA, V1_SLOTS, mode, 'Oct 8, 2026'), 'text/html')
  if (o.edit) doc.querySelector('[data-slot]')!.setAttribute('contenteditable', 'true')
  const tops = o.tops ?? [-900, -600, 0, 400, 700]
  SECTION_IDS.forEach((id, i) => {
    const el = doc.getElementById(id)!
    el.classList.add('section')
    el.getBoundingClientRect = () => ({ top: tops[i] }) as DOMRect
  })
  Object.defineProperty(doc.documentElement, 'scrollHeight', { configurable: true, value: 3000 })
  win = Object.assign(new EventTarget(), { innerHeight: 800, scrollY: o.bottom ? 2200 : 500 })
  new Function('window', 'document', AIVX_JS)(win, doc)
  new Function('window', 'document', PAGE_JS)(win, doc)
}
const actives = () => [...doc.querySelectorAll('.sidebar-nav a.active')].map((a) => a.getAttribute('href'))

test('at the bottom a scroll leaves only the 05 link active, after AIVx chose 04', () => {
  bootSpy('final', { bottom: true })
  win.dispatchEvent(new Event('scroll'))
  expect(actives()).toEqual(['#methodology'])
})

test('mid-page a scroll leaves AIVx choice standing and does not force 05', () => {
  bootSpy('final', { bottom: false })
  win.dispatchEvent(new Event('scroll'))
  expect(actives()).toEqual(['#competitive-visibility'])
})

test('a short page already at the bottom on load highlights 05 without a scroll', () => {
  bootSpy('final', { bottom: true })
  win.dispatchEvent(new Event('load'))
  expect(actives()).toEqual(['#methodology'])
})

test('clicking the 03 link in preview marks 03 active at once', () => {
  stubScroll()
  bootSpy('preview', { bottom: false, tops: [-900, -600, 700, 800, 900] })
  click(link('competitive-visibility'))
  expect(actives()).toEqual(['#competitive-visibility'])
})

test('in edit mode a click marks nothing new', () => {
  stubScroll()
  bootSpy('draft', { bottom: false, tops: [-900, -600, 700, 800, 900], edit: true })
  click(link('competitive-visibility'))
  expect(actives()).toEqual(['#category-data'])
})

// Spec v1.1 §17.16: the four menu copies are editable where they are and stay in sync with their section.
const menu = (p: string) => doc.querySelector(`.sidebar-nav [data-mirror="${p}"][data-mirror-edit]`) as HTMLElement
const typeMenu = (p: string, text: string) => { const el = menu(p); el.textContent = text; el.dispatchEvent(new Event('input', { bubbles: true })) }
const MENU_PATHS = ['page.headline_label', 'page.section_1_title', 'page.section_2_title', 'page.opps_label']

test('menu copies become contenteditable with the mode, like slots', () => {
  boot()
  const all = () => [...doc.querySelectorAll('[data-mirror-edit]')]
  expect(all()).toHaveLength(4)
  fromParent({ type: 'mode', edit: true })
  expect(all().every((e) => e.getAttribute('contenteditable') === 'plaintext-only')).toBe(true)
  fromParent({ type: 'mode', edit: false })
  expect(doc.querySelectorAll('[contenteditable]')).toHaveLength(0)
})

test('typing in menu 02 updates the section title and the section label copy, and posts one edit after the debounce', () => {
  boot()
  fromParent({ type: 'mode', edit: true })
  typeMenu('page.section_1_title', 'New   category')
  expect(sent().slice(1)).toEqual([{ type: 'dirty', path: 'page.section_1_title' }])
  expect(slot('page.section_1_title').textContent).toBe('New   category')
  expect(doc.querySelector('.section-label [data-mirror="page.section_1_title"]')!.textContent).toBe('New   category')
  vi.advanceTimersByTime(799)
  expect(sent().filter((m) => (m as { type: string }).type === 'edit')).toEqual([])
  vi.advanceTimersByTime(1)
  expect(sent().filter((m) => (m as { type: string }).type === 'edit')).toEqual([{ type: 'edit', path: 'page.section_1_title', value: 'New   category' }])
})

test('typing in a menu copy again before the debounce ends still posts one edit', () => {
  boot()
  fromParent({ type: 'mode', edit: true })
  typeMenu('page.opps_label', 'A')
  vi.advanceTimersByTime(500)
  typeMenu('page.opps_label', 'AB')
  vi.advanceTimersByTime(800)
  expect(sent().filter((m) => (m as { type: string }).type === 'edit')).toEqual([{ type: 'edit', path: 'page.opps_label', value: 'AB' }])
})

test('typing in a section title updates its menu item after the debounce', () => {
  boot()
  fromParent({ type: 'mode', edit: true })
  for (const p of MENU_PATHS) {
    type(p, `Typed ${p}`)
    vi.advanceTimersByTime(800)
    expect(menu(p).textContent).toBe(`Typed ${p}`)
  }
})

test('mirror never rewrites the focused element, so the caret stays', () => {
  boot()
  fromParent({ type: 'mode', edit: true })
  const m = menu('page.section_1_title')
  // A DOMParser document has no browsing context, so focus() cannot make m active: stand in for the focused element.
  Object.defineProperty(doc, 'activeElement', { configurable: true, get: () => m })
  m.textContent = 'Typed  twice '
  const fresh = m.firstChild as Text
  m.dispatchEvent(new Event('input', { bubbles: true }))
  vi.advanceTimersByTime(800)
  // The same text node survives: nothing wrote textContent on the focused element.
  expect(m.firstChild).toBe(fresh)
  expect(m.textContent).toBe('Typed  twice ')
  expect(slot('page.section_1_title').textContent).toBe('Typed  twice ')
})

test('a click on a menu copy posts no locked and does not navigate; a section-label copy still posts locked', () => {
  boot()
  fromParent({ type: 'mode', edit: true })
  expect(click(menu('page.headline_label'))).toBe(false)
  expect(sent()).toEqual([{ type: 'ready' }])
  click(doc.querySelector('.section-label [data-mirror="page.section_1_title"]')!)
  expect(sent().slice(1)).toEqual([{ type: 'locked', what: 'fixed', path: 'page.section_1_title' }])
  click(doc.querySelector('.sidebar-nav .nav-num')!)
  expect(sent().at(-1)).toEqual({ type: 'locked', what: 'fixed' })
})

test('Enter blurs a menu copy, paste inserts plain text and drop is blocked, as for slots', () => {
  boot()
  const m = menu('page.section_2_title')
  const enter = () => new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  expect(m.dispatchEvent(enter())).toBe(true)
  fromParent({ type: 'mode', edit: true })
  expect(m.dispatchEvent(enter())).toBe(false)
  const insert = vi.fn()
  ;(doc as unknown as { execCommand: unknown }).execCommand = insert
  const paste = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData?: unknown }
  paste.clipboardData = { getData: () => 'plain' }
  expect(m.dispatchEvent(paste)).toBe(false)
  expect(insert).toHaveBeenCalledWith('insertText', false, 'plain')
  expect(m.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }))).toBe(false)
})

test('a menu edit posts nothing in Preview', () => {
  boot()
  typeMenu('page.headline_label', 'x')
  vi.advanceTimersByTime(1000)
  expect(sent()).toEqual([{ type: 'ready' }])
})

test('typing in the section title, then in its menu copy within the debounce, keeps both sets of keystrokes', () => {
  boot()
  fromParent({ type: 'mode', edit: true })
  type('page.section_1_title', 'Section text')
  vi.advanceTimersByTime(300)
  const m = menu('page.section_1_title')
  m.textContent = (m.textContent ?? '') + '!'
  m.dispatchEvent(new Event('input', { bubbles: true }))
  vi.advanceTimersByTime(800)
  expect(sent().filter((x) => (x as { type: string }).type === 'edit')).toEqual([{ type: 'edit', path: 'page.section_1_title', value: 'Section text!' }])
})

test('leaving Edit mode sends a pending menu edit once', () => {
  boot()
  fromParent({ type: 'mode', edit: true })
  typeMenu('page.opps_label', 'Pending')
  fromParent({ type: 'mode', edit: false })
  vi.advanceTimersByTime(1000)
  expect(sent().filter((x) => (x as { type: string }).type === 'edit')).toEqual([{ type: 'edit', path: 'page.opps_label', value: 'Pending' }])
})

// Spec v1.1 §19.7: after a bullet add or remove the new frame opens where Ryan was.
test('scrolling posts the frame\'s position at most every 200 ms, and a scroll message from the parent restores it', () => {
  boot()
  const scrollTo = vi.fn()
  Object.assign(win, { scrollY: 640, scrollTo })
  post.mockClear()
  win.dispatchEvent(new Event('scroll'))
  win.dispatchEvent(new Event('scroll'))
  expect(sent()).toEqual([])
  vi.advanceTimersByTime(200)
  expect(sent()).toEqual([{ type: 'scroll', y: 640 }])
  fromParent({ type: 'scroll', y: 1234 })
  expect(scrollTo).toHaveBeenCalledWith(0, 1234)
  for (const bad of [{ type: 'scroll', y: -1 }, { type: 'scroll', y: '9' }, { type: 'scroll' }]) fromParent(bad)
  expect(scrollTo).toHaveBeenCalledTimes(1)
  fromParent({ type: 'scroll', y: 50 }, null)
  expect(scrollTo).toHaveBeenCalledTimes(1)
})
