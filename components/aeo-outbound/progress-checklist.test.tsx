import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { ProgressChecklist } from './progress-checklist'

const START = Date.parse('2026-10-08T15:00:00.000Z')
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(START + 12_000) })
afterEach(() => { cleanup(); vi.useRealTimers() })
const box = () => screen.getByRole('status', { name: 'Generation progress' })
const states = () => within(box()).getAllByRole('listitem').map((li) => li.getAttribute('data-state'))

test('the current step, the clock, the bar, eight rows by state, the usual time and the keep-open advice (spec v1.1 §16.3)', () => {
  render(<ProgressChecklist step={5} startedAtMs={START} />)
  expect(within(box()).getByText('Loading brand visibility and AI models…')).toBeInTheDocument()
  expect(within(box()).getByText('0:12')).toBeInTheDocument()
  expect(states()).toEqual(['done', 'done', 'done', 'done', 'current', 'waiting', 'waiting', 'waiting'])
  expect(within(box()).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4')
  expect(within(box()).getByRole('progressbar')).toHaveAttribute('aria-valuemax', '8')
  expect(within(box()).getByText('Usually 35 to 45 seconds')).toBeInTheDocument()
  expect(within(box()).getByText('Keep this tab open until it finishes.')).toBeInTheDocument()
})

test('step 0 reads Starting with every row waiting; step 10 names the second attempt', () => {
  const { rerender } = render(<ProgressChecklist step={0} startedAtMs={START} />)
  expect(within(box()).getByText('Starting…')).toBeInTheDocument()
  expect(states()).toEqual(Array(8).fill('waiting'))
  rerender(<ProgressChecklist step={10} startedAtMs={START} />)
  expect(within(box()).getAllByText('Writing the copy, second attempt').length).toBeGreaterThan(0)
})

test('the clock ticks every second and the slow line replaces the usual time after 90 seconds', async () => {
  render(<ProgressChecklist step={9} startedAtMs={START} />)
  await act(() => vi.advanceTimersByTimeAsync(78_000))
  expect(within(box()).getByText('1:30')).toBeInTheDocument()
  expect(within(box()).getByText('Taking longer than usual. It stops by itself after 4 minutes 30 seconds.')).toBeInTheDocument()
  expect(within(box()).queryByText('Usually 35 to 45 seconds')).not.toBeInTheDocument()
})

test('a browser clock behind the start shows 0:00', () => {
  render(<ProgressChecklist step={1} startedAtMs={START + 60_000} />)
  expect(within(box()).getByText('0:00')).toBeInTheDocument()
})
