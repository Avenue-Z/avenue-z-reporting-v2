'use client'
// A test renders the client component with function props; the directive keeps check:rsc from reading this file as a Server Component.
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { ConfirmDialog } from './confirm-dialog'

afterEach(() => cleanup())
function Harness({ onConfirm = vi.fn() }: { onConfirm?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Revoke</button>
      {open && (
        <ConfirmDialog title="Revoke the link for Acme sent to Jane Doe? It stops working right away and can't be turned back on." confirmLabel="Revoke link" cancelLabel="Keep link" onConfirm={onConfirm} onCancel={() => setOpen(false)} />
      )}
    </>
  )
}
test('the dialog names the consequence, focuses the safe button, traps focus, closes on Escape and returns focus', () => {
  render(<Harness />)
  const opener = screen.getByRole('button', { name: 'Revoke' })
  opener.focus()
  fireEvent.click(opener)
  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveTextContent("Revoke the link for Acme sent to Jane Doe? It stops working right away and can't be turned back on.")
  const keep = screen.getByRole('button', { name: 'Keep link' })
  const revoke = screen.getByRole('button', { name: 'Revoke link' })
  expect(document.activeElement).toBe(keep)
  revoke.focus()
  fireEvent.keyDown(dialog, { key: 'Tab' })
  expect(document.activeElement).toBe(keep)
  fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(revoke)
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(document.activeElement).toBe(opener)
})
test('the verb button confirms; busy disables both and Escape', () => {
  const onConfirm = vi.fn()
  render(<Harness onConfirm={onConfirm} />)
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
  fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }))
  expect(onConfirm).toHaveBeenCalledTimes(1)
  cleanup()
  const onCancel = vi.fn()
  render(<ConfirmDialog title="t" confirmLabel="Go" cancelLabel="Stop" onConfirm={vi.fn()} onCancel={onCancel} busy />)
  expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(onCancel).not.toHaveBeenCalled()
})

test('after a click outside, Tab lands back on a dialog button', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
  ;(document.activeElement as HTMLElement).blur()
  fireEvent.mouseDown(document.body)
  expect(document.activeElement).toBe(document.body)
  fireEvent.keyDown(document.body, { key: 'Tab' })
  expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
  expect(document.activeElement).toBeInstanceOf(HTMLButtonElement)
})
test('while busy, focus is on the dialog and Escape does not cancel', () => {
  const onCancel = vi.fn()
  const { rerender } = render(<ConfirmDialog title="t" confirmLabel="Go" cancelLabel="Stop" onConfirm={vi.fn()} onCancel={onCancel} />)
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Stop' }))
  rerender(<ConfirmDialog title="t" confirmLabel="Go" cancelLabel="Stop" onConfirm={vi.fn()} onCancel={onCancel} busy />)
  expect(document.activeElement).toBe(screen.getByRole('dialog'))
  fireEvent.keyDown(document.body, { key: 'Escape' })
  expect(onCancel).not.toHaveBeenCalled()
})
