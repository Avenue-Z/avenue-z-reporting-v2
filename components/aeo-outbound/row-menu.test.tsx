import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RowMenu } from './row-menu'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const more = () => screen.getByRole('button', { name: 'More' })
const items = (over: Partial<{ a: () => void; b: () => void; bDisabled: boolean }> = {}) => [
  { label: 'Revoke', onSelect: over.a ?? (() => {}) },
  { label: 'Rerun', onSelect: over.b ?? (() => {}), disabled: over.bDisabled },
]

test('the button is a menu button, closed at first, and opens a list of menuitems', () => {
  render(<RowMenu items={items()} />)
  expect(more()).toHaveAttribute('aria-haspopup', 'menu')
  expect(more()).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  fireEvent.click(more())
  expect(more()).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getAllByRole('menuitem').map((e) => e.textContent)).toEqual(['Revoke', 'Rerun'])
  expect(more().querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
})

test('the list is placed fixed from the button, so the table card cannot clip it', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ bottom: 120, right: 900, top: 100, left: 850, width: 50, height: 20, x: 850, y: 100, toJSON: () => ({}) })
  Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true })
  render(<RowMenu items={items()} />)
  fireEvent.click(more())
  const menu = screen.getByRole('menu')
  expect(menu.style.position).toBe('fixed')
  expect(menu.style.top).toBe('124px')
  expect(menu.style.right).toBe('100px')
})

test('choosing an item focuses More before calling onSelect, then closes; a disabled item does nothing', () => {
  let focusedAtSelect: Element | null = null
  const a = vi.fn(() => { focusedAtSelect = document.activeElement })
  const b = vi.fn()
  render(<RowMenu items={items({ a, b, bDisabled: true })} />)
  fireEvent.click(more())
  expect(screen.getByRole('menuitem', { name: 'Rerun' })).toBeDisabled()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Rerun' }))
  expect(b).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Revoke' }))
  expect(a).toHaveBeenCalledTimes(1)
  expect(focusedAtSelect).toBe(more())
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

test('Escape closes the list and focuses More', () => {
  render(<RowMenu items={items()} />)
  fireEvent.click(more())
  screen.getByRole('menuitem', { name: 'Revoke' }).focus()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(more()).toHaveFocus()
})

test('a mousedown outside closes it; a mousedown inside does not', () => {
  render(<div><RowMenu items={items()} /><p>elsewhere</p></div>)
  fireEvent.click(more())
  fireEvent.mouseDown(screen.getByRole('menuitem', { name: 'Revoke' }))
  expect(screen.getByRole('menu')).toBeInTheDocument()
  fireEvent.mouseDown(screen.getByText('elsewhere'))
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

test('any scroll and a resize close it', () => {
  render(<RowMenu items={items()} />)
  fireEvent.click(more())
  fireEvent.scroll(document)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  fireEvent.click(more())
  fireEvent.scroll(document.body)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  fireEvent.click(more())
  fireEvent(window, new Event('resize'))
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

test('opening one menu closes another', () => {
  render(<><RowMenu items={items()} /><RowMenu items={[{ label: 'Discard', onSelect: () => {} }]} /></>)
  const [first, second] = screen.getAllByRole('button', { name: 'More' })
  fireEvent.click(first)
  expect(screen.getByRole('menuitem', { name: 'Revoke' })).toBeInTheDocument()
  fireEvent.click(second)
  expect(screen.queryByRole('menuitem', { name: 'Revoke' })).not.toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: 'Discard' })).toBeInTheDocument()
})

test('listeners exist only while open and are all removed on close and on unmount', () => {
  const docAdd = vi.spyOn(document, 'addEventListener')
  const docRemove = vi.spyOn(document, 'removeEventListener')
  const winAdd = vi.spyOn(window, 'addEventListener')
  const winRemove = vi.spyOn(window, 'removeEventListener')
  const ours = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter(([t]) => ['keydown', 'mousedown', 'scroll', 'resize', 'aeo-row-menu-open'].includes(String(t)))
  const { unmount } = render(<RowMenu items={items()} />)
  expect(ours(docAdd)).toHaveLength(0)
  expect(ours(winAdd)).toHaveLength(0)
  fireEvent.click(more())
  expect(ours(docAdd).length + ours(winAdd).length).toBeGreaterThan(0)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(ours(docRemove).length).toBe(ours(docAdd).length)
  expect(ours(winRemove).length).toBe(ours(winAdd).length)
  fireEvent.click(more())
  unmount()
  expect(ours(docRemove).length).toBe(ours(docAdd).length)
  expect(ours(winRemove).length).toBe(ours(winAdd).length)
})
