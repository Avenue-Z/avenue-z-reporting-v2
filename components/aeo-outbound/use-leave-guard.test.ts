import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { useLeaveGuard } from './use-leave-guard'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const ask = vi.fn()
let anchors: HTMLElement[] = []
beforeEach(() => { push.mockReset(); ask.mockReset(); anchors = [] })
afterEach(() => { cleanup(); anchors.forEach((a) => a.remove()); vi.restoreAllMocks() })

function link(href: string, attrs: Record<string, string> = {}, inDialog = false): HTMLAnchorElement {
  const a = document.createElement('a')
  a.setAttribute('href', href)
  Object.entries(attrs).forEach(([k, v]) => a.setAttribute(k, v))
  let root: HTMLElement = a
  if (inDialog) { root = document.createElement('div'); root.setAttribute('role', 'dialog'); root.appendChild(a) }
  document.body.appendChild(root)
  anchors.push(root)
  return a
}
// A bubble listener on document cancels whatever the guard did not stop, so jsdom never tries to navigate. The guard
// decides in the capture phase, and `defaultPrevented` is read from the guard's own cancel: see `stopped`.
const click = (a: HTMLElement, init: MouseEventInit = {}) => {
  const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init })
  let reached = false
  const last = (ev: Event) => { reached = true; ev.preventDefault() }
  document.addEventListener('click', last)
  a.dispatchEvent(e)
  document.removeEventListener('click', last)
  // The guard calls stopPropagation, so the bubble listener is reached only when the guard left the click alone.
  return { defaultPrevented: !reached }
}

test('while unsaved, a same-origin link click is stopped and asks; Leave pushes path, query and hash', () => {
  renderHook(() => useLeaveGuard(true, ask))
  const e = click(link('/tools/new-business?x=1#top'))
  expect(e.defaultPrevented).toBe(true)
  expect(ask).toHaveBeenCalledTimes(1)
  expect(push).not.toHaveBeenCalled()
  ask.mock.calls[0][0]()
  expect(push).toHaveBeenCalledWith('/tools/new-business?x=1#top')
})

test('when not unsaved, nothing is registered', () => {
  const add = vi.spyOn(window, 'addEventListener')
  renderHook(() => useLeaveGuard(false, ask))
  expect(add.mock.calls.filter(([t]) => t === 'beforeunload')).toHaveLength(0)
  expect(click(link('/x')).defaultPrevented).toBe(false)
  expect(ask).not.toHaveBeenCalled()
})

test.each([
  ['meta', { metaKey: true }], ['ctrl', { ctrlKey: true }], ['shift', { shiftKey: true }], ['alt', { altKey: true }], ['middle button', { button: 1 }],
])('a %s click is left alone', (_n, init) => {
  renderHook(() => useLeaveGuard(true, ask))
  expect(click(link('/x'), init as MouseEventInit).defaultPrevented).toBe(false)
  expect(ask).not.toHaveBeenCalled()
})

test('target _blank, another origin, no href and a link inside a dialog are left alone', () => {
  renderHook(() => useLeaveGuard(true, ask))
  expect(click(link('/x', { target: '_blank' })).defaultPrevented).toBe(false)
  expect(click(link('https://example.org/x')).defaultPrevented).toBe(false)
  const noHref = document.createElement('a'); document.body.appendChild(noHref); anchors.push(noHref)
  expect(click(noHref).defaultPrevented).toBe(false)
  expect(click(link('/x', {}, true)).defaultPrevented).toBe(false)
  expect(ask).not.toHaveBeenCalled()
})

test('beforeunload is prevented while unsaved only, and both listeners go when it turns false or on unmount', () => {
  const { rerender, unmount } = renderHook(({ u }) => useLeaveGuard(u, ask), { initialProps: { u: true } })
  const on = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(on)
  expect(on.defaultPrevented).toBe(true)
  rerender({ u: false })
  const off = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(off)
  expect(off.defaultPrevented).toBe(false)
  expect(click(link('/x')).defaultPrevented).toBe(false)
  rerender({ u: true })
  unmount()
  const gone = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(gone)
  expect(gone.defaultPrevented).toBe(false)
  expect(click(link('/y')).defaultPrevented).toBe(false)
})

// Spec v1.1 §19.7 (A2): the browser Back and Forward buttons ask first while there are unsaved edits, through the
// browser's Navigation API (a stand-in here: jsdom has none).
describe('browser Back and Forward', () => {
  let nav: EventTarget & { traverseTo: ReturnType<typeof vi.fn> }
  beforeEach(() => {
    nav = Object.assign(new EventTarget(), { traverseTo: vi.fn(() => ({ finished: Promise.resolve() })) })
    Object.defineProperty(window, 'navigation', { value: nav, configurable: true })
  })
  afterEach(() => { delete (window as unknown as { navigation?: unknown }).navigation })

  /** A navigate event as the browser fires it; returns whether the page cancelled it. */
  const traverse = (over: { navigationType?: string; cancelable?: boolean; key?: string } = {}) => {
    const e = new Event('navigate', { cancelable: over.cancelable ?? true })
    Object.assign(e, { navigationType: over.navigationType ?? 'traverse', destination: { key: over.key ?? 'k-hub' } })
    nav.dispatchEvent(e)
    return e.defaultPrevented
  }

  test('with unsaved edits, Back is cancelled and asks; Leave goes where Back was going, once', () => {
    renderHook(() => useLeaveGuard(true, ask))
    expect(traverse()).toBe(true)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(nav.traverseTo).not.toHaveBeenCalled()
    ask.mock.calls[0][0]()
    expect(nav.traverseTo).toHaveBeenCalledWith('k-hub')
    // The traversal Leave starts is not asked about again.
    expect(traverse()).toBe(false)
    expect(ask).toHaveBeenCalledTimes(1)
  })

  test('Stay is doing nothing: the page stays and the next Back asks again', () => {
    renderHook(() => useLeaveGuard(true, ask))
    traverse()
    expect(traverse()).toBe(true)
    expect(ask).toHaveBeenCalledTimes(2)
  })

  test('with nothing unsaved, Back and Forward pass straight through, adding no history entry', () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    renderHook(() => useLeaveGuard(false, ask))
    expect(traverse()).toBe(false)
    expect(ask).not.toHaveBeenCalled()
    expect(pushState).not.toHaveBeenCalled()
  })

  test('a push or replace navigation, or a traversal the browser does not let the page cancel, is left alone', () => {
    renderHook(() => useLeaveGuard(true, ask))
    expect(traverse({ navigationType: 'push' })).toBe(false)
    expect(traverse({ navigationType: 'replace' })).toBe(false)
    expect(traverse({ cancelable: false })).toBe(false)
    expect(ask).not.toHaveBeenCalled()
  })

  test('the unsaved flag is read when Back is pressed, not when the page mounted', () => {
    const h = renderHook(({ unsaved }) => useLeaveGuard(unsaved, ask), { initialProps: { unsaved: false } })
    h.rerender({ unsaved: true })
    expect(traverse()).toBe(true)
  })

  test('a Leave whose traversal fails hands the guard back', async () => {
    nav.traverseTo.mockReturnValueOnce({ finished: Promise.reject(new Error('gone')) })
    renderHook(() => useLeaveGuard(true, ask))
    traverse()
    ask.mock.calls[0][0]()
    await new Promise((r) => setTimeout(r, 0))
    expect(traverse()).toBe(true)
  })

  test('unmounting removes the listener; without the Navigation API nothing is registered and nothing breaks', () => {
    const h = renderHook(() => useLeaveGuard(true, ask))
    h.unmount()
    expect(traverse()).toBe(false)
    delete (window as unknown as { navigation?: unknown }).navigation
    expect(() => renderHook(() => useLeaveGuard(true, ask))).not.toThrow()
  })
})
