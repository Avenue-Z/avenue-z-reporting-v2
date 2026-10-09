import { expect, test, vi } from 'vitest'
import { SaveQueue, type SendResult } from './save-queue'

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)) }
test('one PATCH at a time, the latest value per path, revision carried forward', async () => {
  const calls: [string, string, number][] = []
  let rev = 3
  const send = vi.fn(async (p: string, v: string, r: number): Promise<SendResult> => { calls.push([p, v, r]); return { kind: 'ok', revision: ++rev } })
  const q = new SaveQueue(send, 3, () => {})
  q.markDirty('headline'); q.edit('headline', 'a'); q.edit('headline', 'b'); q.markDirty('why'); q.edit('why', 'c')
  await flush()
  expect(calls.map(([, , r]) => r)).toEqual(calls.map((_, i) => 3 + i))
  expect(calls.at(-1)).toEqual(['why', 'c', 3 + calls.length - 1])
  expect(calls.filter(([p]) => p === 'headline').at(-1)?.[1]).toBe('b')
  expect(q.state).toMatchObject({ dirty: false, saving: false, revision: rev })
})
test('a keystroke marks its field dirty before any edit message', () => {
  const q = new SaveQueue(vi.fn(), 0, () => {})
  q.markDirty('why')
  expect(q.state.dirty).toBe(true)
})
test("saving field A never clears field B that is still being typed", async () => {
  const q = new SaveQueue(vi.fn(async (): Promise<SendResult> => ({ kind: 'ok', revision: 1 })), 0, () => {})
  q.markDirty('headline'); q.edit('headline', 'a')
  q.markDirty('why')
  await flush()
  expect(q.state.dirty).toBe(true)
  q.edit('why', 'w'); await flush()
  expect(q.state.dirty).toBe(false)
})
test('a keystroke after an edit was sent keeps the field dirty', async () => {
  const q = new SaveQueue(vi.fn(async (): Promise<SendResult> => ({ kind: 'ok', revision: 1 })), 0, () => {})
  q.markDirty('why'); q.edit('why', 'a'); q.markDirty('why')
  await flush()
  expect(q.state.dirty).toBe(true)
})
test('5xx and network errors retry with backoff; 400 shows the reason and keeps the edit dirty', async () => {
  const sleep = vi.fn(async (_ms: number) => {})
  const send = vi.fn<(p: string, v: string, r: number) => Promise<SendResult>>()
    .mockResolvedValueOnce({ kind: 'retry' }).mockResolvedValueOnce({ kind: 'ok', revision: 1 })
  const q = new SaveQueue(send, 0, () => {}, sleep)
  q.markDirty('why'); q.edit('why', 'x'); await flush()
  expect(sleep).toHaveBeenCalledWith(1000)
  expect(q.state.revision).toBe(1)
  const bad = new SaveQueue(vi.fn(async (): Promise<SendResult> => ({ kind: 'bad', error: 'Keep this under 80 characters.' })), 0, () => {})
  bad.markDirty('competitive_bullets.0.lead'); bad.edit('competitive_bullets.0.lead', 'x'.repeat(81)); await flush()
  expect(bad.state).toMatchObject({ dirty: true, error: 'Keep this under 80 characters.', stopped: false })
})
test('403, 404 and 409 stop the queue for good', async () => {
  const q = new SaveQueue(vi.fn(async (): Promise<SendResult> => ({ kind: 'stop' })), 0, () => {})
  q.markDirty('why'); q.edit('why', 'x'); await flush()
  expect(q.state.stopped).toBe(true)
  q.edit('why', 'y'); await flush()
  expect(q.state.stopped).toBe(true)
})

const LEAD = 'competitive_bullets.0.lead'
const MSG = 'Keep this under 80 characters.'
test('a 400 on one field does not stall the others', async () => {
  let rev = 0
  let leadOk = false
  const sent: string[] = []
  const send = vi.fn(async (p: string): Promise<SendResult> => {
    sent.push(p)
    if (p === LEAD && !leadOk) return { kind: 'bad', error: MSG }
    return { kind: 'ok', revision: ++rev }
  })
  const q = new SaveQueue(send, 0, () => {})
  q.markDirty(LEAD); q.edit(LEAD, 'x'.repeat(81))
  q.markDirty('headline'); q.edit('headline', 'h')
  await flush()
  expect(sent).toContain('headline')
  expect(q.state.error).toBe(MSG)
  expect(q.state.dirty).toBe(true)
  expect(q.state.stopped).toBe(false)
  leadOk = true
  q.markDirty(LEAD); q.edit(LEAD, 'short')
  await flush()
  expect(q.state.error).toBeNull()
  expect(q.state.dirty).toBe(false)
})
test('a retry that succeeds does not hide an outstanding 400', async () => {
  const sleep = vi.fn(async (_ms: number) => {})
  let whyTries = 0
  const send = vi.fn(async (p: string): Promise<SendResult> => {
    if (p === LEAD) return { kind: 'bad', error: MSG }
    if (++whyTries === 1) return { kind: 'retry' }
    return { kind: 'ok', revision: 1 }
  })
  const q = new SaveQueue(send, 0, () => {}, sleep)
  q.markDirty(LEAD); q.edit(LEAD, 'x'.repeat(81))
  q.markDirty('why'); q.edit('why', 'w')
  await flush()
  expect(sleep).toHaveBeenCalledWith(1000)
  expect(q.state.error).toBe(MSG)
})
