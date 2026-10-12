import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CopyLink } from './copy-link'

const URL_ = 'https://app.example/snapshot/tok_123'
afterEach(() => { cleanup(); vi.useRealTimers() })
const clip = (writeText: () => Promise<void>) => Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(writeText) }, configurable: true })

test('Copy link awaits the clipboard, says Copied for 2 seconds and announces it', async () => {
  clip(async () => {})
  vi.useFakeTimers()
  render(<CopyLink url={URL_} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy link' })) })
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(URL_)
  expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Link copied')
  await act(async () => { vi.advanceTimersByTime(2000) })
  expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
})

test("a clipboard failure says so and shows the link in a read-only field", async () => {
  clip(async () => { throw new Error('denied') })
  render(<CopyLink url={URL_} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy link' })) })
  expect(screen.getByText("Couldn't copy. Select the link and copy it.")).toBeInTheDocument()
  const field = screen.getByRole('textbox', { name: 'Link' })
  expect(field).toHaveValue(URL_)
  expect(field).toHaveAttribute('readonly')
  expect(screen.getByRole('status')).toHaveTextContent("Couldn't copy. Select the link and copy it.")
})

test('showField shows the link next to the button from the start', () => {
  render(<CopyLink url={URL_} showField />)
  expect(screen.getByRole('textbox', { name: 'Link' })).toHaveValue(URL_)
})
