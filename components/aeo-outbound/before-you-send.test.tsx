'use client'
// The test harness is client code (it holds the tick state), so the RSC prop check treats it as one.
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { BeforeYouSend, openCount, tickKey } from './before-you-send'
import type { StoredNote } from '@/lib/aeo-outbound/notes'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const NOTES: StoredNote[] = [{ kind: 'number_not_in_data', text: 'Same note' }, { kind: 'number_not_in_data', text: 'Same note' }]
function Harness({ notes, onMinimize = () => {} }: { notes: StoredNote[]; onMinimize?: () => void }) {
  const [ticks, setTicks] = useState<ReadonlySet<string>>(new Set())
  return (
    <>
      <output data-testid="count">{openCount([], notes, ticks)}</output>
      <BeforeYouSend
        needsValidation={[]} notes={notes} titles={['A', 'B']} about={null} ticks={ticks} ownTicks={new Set()} highlight={null}
        onTick={(k) => setTicks((t) => { const n = new Set(t); if (n.has(k)) n.delete(k); else n.add(k); return n })}
        onOwnTick={() => {}} onGoTo={() => {}} onMinimize={onMinimize}
      />
    </>
  )
}

test('D6: two identical notes render two items with separate ticks and no duplicate-key warning', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  render(<Harness notes={NOTES} />)
  expect(screen.getAllByText('Same note')).toHaveLength(2)
  const boxes = screen.getAllByRole('checkbox', { name: 'Looks right' })
  expect(boxes).toHaveLength(2)
  fireEvent.click(boxes[0])
  expect(boxes[0]).toBeChecked()
  expect(boxes[1]).not.toBeChecked()
  expect(screen.getByTestId('count')).toHaveTextContent('1')
  expect(error.mock.calls.flat().join(' ')).not.toContain('same key')
})

test('D6: the first copy of a note keeps the plain tick key, so list ticks still drop by path', () => {
  expect(tickKey(NOTES[0])).toBe('number_not_in_data||Same note')
})

test('the header has a Minimize button that calls onMinimize', () => {
  const onMinimize = vi.fn()
  render(<Harness notes={NOTES} onMinimize={onMinimize} />)
  fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
  expect(onMinimize).toHaveBeenCalledTimes(1)
})

test('2026-10-19 (Ryan): the same-day data note is a Check these item with its own Looks right tick, counted until ticked', () => {
  const text = "This report includes Oct 19, 2026, the day it was generated, and Peec can still update that day's data. Rerun just before sending so the numbers match Peec."
  render(<Harness notes={[{ kind: 'same_day_data', text }]} />)
  expect(screen.getByText(text)).toBeInTheDocument()
  expect(screen.getByTestId('count')).toHaveTextContent('1')
  fireEvent.click(screen.getByRole('checkbox', { name: 'Looks right' }))
  expect(screen.getByTestId('count')).toHaveTextContent('0')
})
