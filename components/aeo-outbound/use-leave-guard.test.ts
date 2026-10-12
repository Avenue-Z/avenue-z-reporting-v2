import { afterEach, beforeEach, expect, test, vi } from 'vitest'
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
const click = (a: HTMLElement, init: MouseEventInit = {}) => {
  const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init })
  a.dispatchEvent(e)
  return e
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
