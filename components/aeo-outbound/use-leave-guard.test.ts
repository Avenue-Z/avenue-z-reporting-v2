import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { GUARD_STATE_KEY, useLeaveGuard } from './use-leave-guard'

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

// Spec v1.1 §19.7 (A2): the browser Back button asks first while there are unsaved edits.
describe('browser Back', () => {
  let pushState: ReturnType<typeof vi.spyOn>
  let back: ReturnType<typeof vi.spyOn>
  let go: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    window.history.replaceState({ __NA: true }, '', '/tools/new-business/abc')
    pushState = vi.spyOn(window.history, 'pushState')
    back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
  })

  /** The browser landing back on the page's own entry: the one under the guard entry, same address, no guard mark. */
  const landOnPage = () => {
    window.history.replaceState({ __NA: true }, '', '/tools/new-business/abc')
    window.dispatchEvent(new PopStateEvent('popstate', { state: { __NA: true } }))
  }

  test('mounting adds one guard entry for the same address, keeping the router state; a remount on it adds none', () => {
    const first = renderHook(() => useLeaveGuard(false, ask))
    expect(pushState).toHaveBeenCalledTimes(1)
    expect(pushState.mock.calls[0][0]).toMatchObject({ __NA: true, [GUARD_STATE_KEY]: true })
    expect(pushState.mock.calls[0][2]).toBe(window.location.href)
    first.unmount()
    // A remount while the guard entry is current (React's strict-mode double mount) does not add a second.
    renderHook(() => useLeaveGuard(false, ask))
    expect(pushState).toHaveBeenCalledTimes(1)
  })

  test('with nothing unsaved, Back goes straight back: one press, no question', () => {
    renderHook(() => useLeaveGuard(false, ask))
    landOnPage()
    expect(back).toHaveBeenCalledTimes(1)
    expect(ask).not.toHaveBeenCalled()
  })

  test('with unsaved edits, Back stays on the page and asks; Stay keeps it, Leave goes back past the guard entry', () => {
    renderHook(() => useLeaveGuard(true, ask))
    pushState.mockClear()
    landOnPage()
    expect(back).not.toHaveBeenCalled()
    // The guard entry is added again at once, so staying needs nothing and a second Back asks again.
    expect(pushState).toHaveBeenCalledTimes(1)
    expect(ask).toHaveBeenCalledTimes(1)
    const leave = ask.mock.calls[0][0] as () => void
    leave()
    expect(go).toHaveBeenCalledWith(-2)
    // While leaving, the popstate that follows is not asked about again.
    landOnPage()
    expect(ask).toHaveBeenCalledTimes(1)
  })

  test('a popstate onto another address, or onto the guard entry itself, is left alone', () => {
    renderHook(() => useLeaveGuard(true, ask))
    window.history.replaceState({ __NA: true }, '', '/tools/new-business')
    window.dispatchEvent(new PopStateEvent('popstate', { state: { __NA: true } }))
    window.history.replaceState({ __NA: true, [GUARD_STATE_KEY]: true }, '', '/tools/new-business/abc')
    window.dispatchEvent(new PopStateEvent('popstate', { state: { __NA: true, [GUARD_STATE_KEY]: true } }))
    expect(ask).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
  })

  test('unmounting removes the Back listener', () => {
    const h = renderHook(() => useLeaveGuard(true, ask))
    h.unmount()
    landOnPage()
    expect(ask).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
  })

  test('the unsaved flag is read when Back is pressed, not when the page mounted', () => {
    const h = renderHook(({ unsaved }) => useLeaveGuard(unsaved, ask), { initialProps: { unsaved: false } })
    h.rerender({ unsaved: true })
    landOnPage()
    expect(ask).toHaveBeenCalledTimes(1)
  })
})
