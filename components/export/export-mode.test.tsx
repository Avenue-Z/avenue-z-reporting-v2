import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, render, renderHook } from '@testing-library/react'
import { ExportModeProvider, ExportReadyReporter, useExportMode } from './export-mode'

beforeEach(() => {
  delete window.__exportReady
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve(), status: 'loaded' } })
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
})
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

test('export mode is off outside the provider and on inside it', () => {
  expect(renderHook(() => useExportMode()).result.current).toBe(false)
  expect(renderHook(() => useExportMode(), { wrapper: ExportModeProvider }).result.current).toBe(true)
})

test('the page is reported ready only after it has loaded', async () => {
  const pending = document.createElement('div')
  pending.setAttribute('data-export-pending', '')
  document.body.appendChild(pending)
  render(<ExportReadyReporter />)
  await act(async () => { await Promise.resolve(); vi.advanceTimersToNextFrame(); vi.advanceTimersToNextFrame() })
  expect(window.__exportReady).toBeUndefined()
  pending.remove()
  await act(async () => { vi.advanceTimersToNextFrame(); vi.advanceTimersToNextFrame(); vi.advanceTimersToNextFrame() })
  expect(window.__exportReady).toBe(true)
})
