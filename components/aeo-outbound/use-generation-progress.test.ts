import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useGenerationProgress } from './use-generation-progress'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
type Answer = () => Promise<Response>
let answers: Answer[] = []
// Each poll takes the next answer; the last one repeats.
const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => (answers.length > 1 ? answers.shift()! : answers[0])())
const CLICK = Date.parse('2026-10-08T15:00:00.000Z')
const row = (step: number, createdAt = '2026-10-08T15:00:03.000Z'): Answer => async () => json(200, { id: 'r1', step, createdAt })
const none: Answer = async () => json(200, { step: null })
const tick = (ms = 1000) => act(() => vi.advanceTimersByTimeAsync(ms))

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(CLICK); fetchMock.mockClear(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

test('by project: null before any row keeps polling, each step shows, and null after a row means finished (spec v1.1 §16.3)', async () => {
  answers = [none, none, row(2), row(9), none]
  const onFinished = vi.fn()
  const { result } = renderHook(() => useGenerationProgress({ projectId: 'p1', clickedAt: CLICK }, 0, onFinished))
  await tick()
  expect(result.current).toEqual({ step: 0, createdAt: null, finished: false })
  await tick()
  expect(result.current.step).toBe(2)
  await tick()
  expect(result.current).toEqual({ step: 9, createdAt: '2026-10-08T15:00:03.000Z', finished: false })
  await tick()
  expect(result.current.finished).toBe(true)
  expect(onFinished).toHaveBeenCalledTimes(1)
  const calls = fetchMock.mock.calls.length
  await tick(5000)
  expect(fetchMock.mock.calls.length).toBe(calls)
  expect(fetchMock.mock.calls[0][0]).toBe('/api/aeo-outbound/progress?projectId=p1')
})

test("by project: a row created more than 5 seconds before the click is another tab's run and is ignored", async () => {
  answers = [row(4, '2026-10-08T14:59:54.000Z')]
  const { result } = renderHook(() => useGenerationProgress({ projectId: 'p1', clickedAt: CLICK }))
  await tick(3000)
  expect(result.current.step).toBe(0)
  answers = [row(4, '2026-10-08T14:59:56.000Z')]
  await tick()
  expect(result.current.step).toBe(4)
})

test('by id: the row is already known to be generating, so the first null means finished', async () => {
  answers = [none]
  const onFinished = vi.fn()
  const { result } = renderHook(() => useGenerationProgress({ id: 'r1' }, 4, onFinished))
  expect(result.current.step).toBe(4)
  await tick()
  expect(result.current.finished).toBe(true)
  expect(onFinished).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0][0]).toBe('/api/aeo-outbound/progress?id=r1')
})

test('a failed or refused poll keeps the last state and tries again; polling stops 300 seconds after it started', async () => {
  answers = [row(3), async () => { throw new TypeError('Failed to fetch') }, async () => json(503, { error: 'unavailable' }), async () => new Response('<html>', { status: 200 }), row(5)]
  const { result } = renderHook(() => useGenerationProgress({ projectId: 'p1', clickedAt: CLICK }))
  await tick()
  expect(result.current.step).toBe(3)
  await tick(2000)
  expect(result.current.step).toBe(3)
  await tick()
  expect(result.current.step).toBe(5)
  await tick(300_000)
  const calls = fetchMock.mock.calls.length
  await tick(5000)
  expect(fetchMock.mock.calls.length).toBe(calls)
  expect(result.current.finished).toBe(false)
})

test('no target polls nothing', async () => {
  renderHook(() => useGenerationProgress(null))
  await tick(3000)
  expect(fetchMock).not.toHaveBeenCalled()
})

test('a slow null never finishes the run early once a row has answered; polls do not overlap (spec v1.1 §16.3)', async () => {
  const slowNull: Answer = () => new Promise((r) => setTimeout(() => r(json(200, { step: null })), 1500))
  answers = [slowNull, row(6)]
  const onFinished = vi.fn()
  const { result } = renderHook(() => useGenerationProgress({ projectId: 'p1', clickedAt: CLICK }, 0, onFinished))
  await tick(3000)
  expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3)
  expect(result.current.finished).toBe(false)
  expect(onFinished).not.toHaveBeenCalled()
  await tick(2000)
  expect(result.current.step).toBe(6)
})

test('against a fetch that never resolves, one request is in flight at a time and polling resumes after the 5 second abort', async () => {
  let open = 0, peak = 0
  fetchMock.mockImplementation(((_u: string, init?: RequestInit) => new Promise<Response>((_res, rej) => {
    open++; peak = Math.max(peak, open)
    init?.signal?.addEventListener('abort', () => { open--; rej(new DOMException('aborted', 'AbortError')) })
  })) as never)
  renderHook(() => useGenerationProgress({ projectId: 'p1', clickedAt: CLICK }))
  await tick(4900)
  expect(fetchMock.mock.calls.length).toBe(1)
  await tick(10_000)
  expect(peak).toBe(1)
  expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)
  fetchMock.mockImplementation(async (_url: string, _init?: RequestInit) => (answers.length > 1 ? answers.shift()! : answers[0])())
})

test('clearing the target resets to the initial step, so the next run never shows the last one', async () => {
  answers = [row(7)]
  const { result, rerender } = renderHook(({ t }: { t: { projectId: string; clickedAt: number } | null }) => useGenerationProgress(t, 2), { initialProps: { t: { projectId: 'p1', clickedAt: CLICK } as { projectId: string; clickedAt: number } | null } })
  await tick()
  expect(result.current.step).toBe(7)
  rerender({ t: null })
  expect(result.current.step).toBe(2)
  rerender({ t: { projectId: 'p1', clickedAt: CLICK + 1 } })
  expect(result.current.step).toBe(2)
})
