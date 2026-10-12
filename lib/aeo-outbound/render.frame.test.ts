import { afterEach, beforeEach, expect, test, vi, type MockInstance } from 'vitest'
import { FRAME_SCRIPT_JS, renderSnapshotHtml } from './render'
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
