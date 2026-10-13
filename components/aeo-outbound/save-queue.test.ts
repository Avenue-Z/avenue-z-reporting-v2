import { expect, test, vi } from 'vitest'
import { SAVE_TIMEOUT_MS, SaveQueue, type SendResult } from './save-queue'

type Meta = { writer: string; seq: number; signal: AbortSignal }

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)) }
test('one PATCH at a time, the latest value per path, revision carried forward', async () => {
  const calls: [string, string, number][] = []
  let rev = 3
  const send = vi.fn(async (p: string, v: string, r: number, _m: Meta): Promise<SendResult> => { calls.push([p, v, r]); return { kind: 'ok', revision: ++rev } })
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
  const send = vi.fn<(p: string, v: string, r: number, m: Meta) => Promise<SendResult>>()
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
  const send = vi.fn(async (p: string, _v: string, _r: number, _m: Meta): Promise<SendResult> => {
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
  const send = vi.fn(async (p: string, _v: string, _r: number, _m: Meta): Promise<SendResult> => {
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

test('typing during a retry wait keeps the retry message, and the ok clears it', async () => {
  let release: () => void = () => {}
  const sleep = vi.fn(() => new Promise<void>((r) => { release = r }))
  let calls = 0
  const send = vi.fn(async (): Promise<SendResult> => (++calls === 1 ? { kind: 'retry' } : { kind: 'ok', revision: calls }))
  const q = new SaveQueue(send, 0, () => {}, sleep)
  q.markDirty('why'); q.edit('why', 'w'); await flush()
  expect(q.state.error).toBe("Couldn't save, retrying")
  q.markDirty('headline'); q.edit('headline', 'h'); await flush()
  expect(q.state.error).toBe("Couldn't save, retrying")
  release(); await flush()
  expect(q.state.error).toBeNull()
  expect(q.state.dirty).toBe(false)
})
test('typing while the resend is in flight keeps the retry message until the server answers', async () => {
  const sleep = vi.fn(() => Promise.resolve())
  let release: (r: SendResult) => void = () => {}
  let calls = 0
  const send = vi.fn((): Promise<SendResult> => (++calls === 1 ? Promise.resolve({ kind: 'retry' }) : new Promise((r) => { release = r })))
  const q = new SaveQueue(send, 0, () => {}, sleep)
  q.markDirty('why'); q.edit('why', 'w'); await flush()
  expect(calls).toBe(2)
  q.markDirty('headline'); q.edit('headline', 'h')
  expect(q.state.error).toBe("Couldn't save, retrying")
  release({ kind: 'ok', revision: 1 }); await flush()
  release({ kind: 'ok', revision: 2 }); await flush()
  expect(q.state.error).toBeNull()
})
test('an outstanding 400 makes the queue dirty even without a keystroke', async () => {
  const q = new SaveQueue(vi.fn(async (): Promise<SendResult> => ({ kind: 'bad', error: MSG })), 0, () => {})
  q.edit(LEAD, 'x'.repeat(81)); await flush()
  expect(q.state.dirty).toBe(true)
})
test('a send that throws synchronously is treated as a retry', async () => {
  const sleep = vi.fn(async (_ms: number) => {})
  let n = 0
  const send = vi.fn((): Promise<SendResult> => { if (++n === 1) throw new Error('boom'); return Promise.resolve({ kind: 'ok', revision: 1 }) })
  const q = new SaveQueue(send, 0, () => {}, sleep)
  q.markDirty('why'); q.edit('why', 'x'); await flush()
  expect(sleep).toHaveBeenCalledWith(1000)
  expect(q.state).toMatchObject({ saving: false, revision: 1, dirty: false })
})
test('a 400 that arrives after the same field was edited again is not recorded, and the newer value is sent', async () => {
  let release: (r: SendResult) => void = () => {}
  const values: string[] = []
  const send = vi.fn((_p: string, v: string, _r: number, _m: Meta): Promise<SendResult> => {
    values.push(v)
    return values.length === 1 ? new Promise((r) => { release = r }) : Promise.resolve({ kind: 'ok', revision: 2 })
  })
  const q = new SaveQueue(send, 0, () => {})
  q.markDirty(LEAD); q.edit(LEAD, 'old'); await flush()
  q.markDirty(LEAD); q.edit(LEAD, 'new')
  release({ kind: 'bad', error: MSG }); await flush()
  expect(values).toEqual(['old', 'new'])
  expect(q.state.error).toBeNull()
  expect(q.state.dirty).toBe(false)
})
test('stop() while a send is in flight: a late ok changes neither the revision nor the stopped state', async () => {
  let release: (r: SendResult) => void = () => {}
  const send = vi.fn((): Promise<SendResult> => new Promise((r) => { release = r }))
  const q = new SaveQueue(send, 5, () => {})
  q.markDirty('why'); q.edit('why', 'x'); await flush()
  q.stop('This snapshot changed. Reload.')
  release({ kind: 'ok', revision: 9 }); await flush()
  expect(q.state).toMatchObject({ revision: 5, stopped: true, error: 'This snapshot changed. Reload.' })
})
test('badPaths names every field with an outstanding 400, and empties once each is fixed', async () => {
  let leadOk = false
  const send = vi.fn(async (p: string): Promise<SendResult> => (p === LEAD && !leadOk ? { kind: 'bad', error: MSG } : { kind: 'ok', revision: 1 }))
  const q = new SaveQueue(send, 0, () => {})
  expect(q.state.badPaths).toEqual([])
  q.markDirty(LEAD); q.edit(LEAD, 'x'.repeat(81))
  q.markDirty('headline'); q.edit('headline', 'h')
  await flush()
  expect(q.state.badPaths).toEqual([LEAD])
  expect(q.state.error).toBe(MSG)
  leadOk = true
  q.markDirty(LEAD); q.edit(LEAD, 'short')
  await flush()
  expect(q.state.badPaths).toEqual([])
})

test('a structural item waits for every pending edit, then goes out with the revision the last save returned', async () => {
  const calls: [string, string, number][] = []
  let rev = 3
  const send = vi.fn(async (p: string, v: string, r: number): Promise<SendResult> => { calls.push([p, v, r]); return { kind: 'ok', revision: ++rev } })
  const states: boolean[] = []
  const q = new SaveQueue(send, 3, (s) => states.push(s.structuring))
  q.markDirty('headline'); q.edit('headline', 'a')
  q.structure('competitive_bullets.add')
  expect(q.state.structuring).toBe(true)
  await flush()
  expect(calls).toEqual([['headline', 'a', 3], ['competitive_bullets.add', 'structure', 4]])
  expect(q.state).toMatchObject({ structuring: false, dirty: false, saving: false, revision: 5 })
  expect(states).toContain(true)
})

test('a refused structural item is dropped with its error; a stop stops it', async () => {
  const q = new SaveQueue(vi.fn(async (): Promise<SendResult> => ({ kind: 'bad', error: 'A list needs at least two bullets.' })), 0, () => {})
  q.structure('sources_bullets.0.remove')
  await flush()
  expect(q.state).toMatchObject({ structuring: false, error: 'A list needs at least two bullets.' })
  const stopped = new SaveQueue(vi.fn(async (): Promise<SendResult> => ({ kind: 'stop' })), 0, () => {})
  stopped.structure('sources_bullets.add')
  await flush()
  expect(stopped.state).toMatchObject({ stopped: true, error: 'This snapshot changed. Reload.' })
})

test('a structural save clears the errors and dirt of the list it changed, and leaves other lists alone', async () => {
  const send = vi.fn(async (p: string, _v: string, r: number): Promise<SendResult> =>
    p === 'sources_bullets.2.lead' ? { kind: 'bad', error: 'Too long.' } : { kind: 'ok', revision: r + 1 })
  const q = new SaveQueue(send, 1, () => {})
  q.markDirty('sources_bullets.2.lead'); q.edit('sources_bullets.2.lead', 'x')
  await flush()
  expect(q.state).toMatchObject({ dirty: true, badPaths: ['sources_bullets.2.lead'], error: 'Too long.' })
  q.markDirty('competitive_bullets.0.lead'); q.edit('competitive_bullets.0.lead', 'y')
  await flush()
  q.markDirty('competitive_bullets.1.lead')
  q.structure('sources_bullets.2.remove')
  await flush()
  expect(q.state.badPaths).toEqual([])
  expect(q.state.error).toBeNull()
  expect(q.state.dirty).toBe(true)
  q.edit('competitive_bullets.1.lead', 'z')
  await flush()
  expect(q.state).toMatchObject({ dirty: false, badPaths: [], error: null })
})

// Spec v1.1 section 18.4: every save says who wrote it and in what order, a retried field goes first, and a hung
// save times out into a retry.
type Sent = { path: string; value: string; revision: number; writer: string; seq: number }
const record = (log: Sent[], answer: (n: number, path: string) => SendResult | Promise<SendResult>) =>
  vi.fn((path: string, value: string, revision: number, m: Meta): Promise<SendResult> => {
    log.push({ path, value, revision, writer: m.writer, seq: m.seq })
    return Promise.resolve(answer(log.length, path))
  })

test('one writer per queue, made once, on every send', async () => {
  const ids = ['writer-1', 'writer-2']
  const newId = vi.fn(() => ids.shift() as string)
  const log: Sent[] = []
  const q = new SaveQueue(record(log, (n) => ({ kind: 'ok', revision: n })), 0, () => {}, undefined, newId)
  q.edit('headline', 'a'); q.edit('why', 'b'); await flush()
  q.edit('headline', 'c'); await flush()
  expect(log.map((s) => s.writer)).toEqual(['writer-1', 'writer-1', 'writer-1'])
  expect(q.writer).toBe('writer-1')
  expect(newId).toHaveBeenCalledTimes(1)
  const other = new SaveQueue(record([], () => ({ kind: 'ok', revision: 1 })), 0, () => {}, undefined, newId)
  expect(other.writer).toBe('writer-2')
})
test('the default writer is a random UUID', () => {
  const a = new SaveQueue(vi.fn(), 0, () => {})
  const b = new SaveQueue(vi.fn(), 0, () => {})
  expect(a.writer).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  expect(b.writer).not.toBe(a.writer)
})
test('seq is 1, 2, 3 in send order, and a retry of the same item keeps its seq', async () => {
  const sleep = vi.fn(async (_ms: number) => {})
  const log: Sent[] = []
  const q = new SaveQueue(record(log, (n) => (n === 2 ? { kind: 'retry' } : { kind: 'ok', revision: n })), 0, () => {}, sleep, () => 'w')
  q.edit('headline', 'a'); q.edit('why', 'b'); q.edit('lead', 'c'); await flush()
  expect(log.map((s) => [s.path, s.seq])).toEqual([['headline', 1], ['why', 2], ['why', 2], ['lead', 3]])
  expect(log[2].revision).toBe(1)
})
// P is first in insertion order here anyway; the edit-during-backoff test below is the one that proves retry first.
test('after a retry on P with Q pending, the next send is P again', async () => {
  const sleep = vi.fn(async (_ms: number) => {})
  const log: Sent[] = []
  const q = new SaveQueue(record(log, (n) => (n === 1 ? { kind: 'retry' } : { kind: 'ok', revision: n })), 0, () => {}, sleep, () => 'w')
  q.edit('P', 'p'); q.edit('Q', 'q'); await flush()
  expect(log.map((s) => [s.path, s.value, s.seq])).toEqual([['P', 'p', 1], ['P', 'p', 1], ['Q', 'q', 2]])
  expect(q.state).toMatchObject({ dirty: false, saving: false, error: null, revision: 3 })
})
test("an edit to P during P's backoff is sent next with a new seq, ahead of Q, and keeps that seq on its own retry", async () => {
  let release: () => void = () => {}
  const sleep = vi.fn(() => new Promise<void>((r) => { release = r }))
  const log: Sent[] = []
  const q = new SaveQueue(record(log, (n) => (n <= 2 ? { kind: 'retry' } : { kind: 'ok', revision: n })), 0, () => {}, sleep, () => 'w')
  q.edit('P', 'old'); q.edit('Q', 'q'); await flush()
  expect(log.map((s) => [s.path, s.value, s.seq])).toEqual([['P', 'old', 1]])
  // The newer P value replaces the old one and moves behind Q in normal order; the retry still goes first.
  q.edit('P', 'new'); release(); await flush()
  expect(log.map((s) => [s.path, s.value, s.seq])).toEqual([['P', 'old', 1], ['P', 'new', 2]])
  release(); await flush()
  expect(log.map((s) => [s.path, s.value, s.seq])).toEqual([['P', 'old', 1], ['P', 'new', 2], ['P', 'new', 2], ['Q', 'q', 3]])
  expect(q.state).toMatchObject({ dirty: false, saving: false, error: null, revision: 4 })
})
test('after the retried item answers, normal order resumes', async () => {
  const sleep = vi.fn(async (_ms: number) => {})
  let hold: (r: SendResult) => void = () => {}
  const log: Sent[] = []
  const send = record(log, (n) => (n === 1 ? { kind: 'retry' } : n === 2 ? new Promise<SendResult>((r) => { hold = r }) : { kind: 'ok', revision: n }))
  const q = new SaveQueue(send, 0, () => {}, sleep, () => 'w')
  q.edit('P', 'p'); q.edit('Q', 'q'); await flush()
  // P's resend is in flight; a newer P value now sits behind Q.
  q.edit('P', 'p2')
  hold({ kind: 'ok', revision: 2 }); await flush()
  expect(log.map((s) => [s.path, s.value, s.seq])).toEqual([['P', 'p', 1], ['P', 'p', 1], ['Q', 'q', 2], ['P', 'p2', 3]])
})
test('a hung save times out: the signal aborts, the attempt is a retry, and its late answer is ignored', async () => {
  vi.useFakeTimers()
  try {
    expect(SAVE_TIMEOUT_MS).toBe(15_000)
    const sleep = vi.fn(async (_ms: number) => {})
    const signals: AbortSignal[] = []
    let late: (r: SendResult) => void = () => {}
    const send = vi.fn((_p: string, _v: string, _r: number, m: Meta): Promise<SendResult> => {
      signals.push(m.signal)
      return signals.length === 1 ? new Promise((r) => { late = r }) : Promise.resolve({ kind: 'ok', revision: 7 })
    })
    const q = new SaveQueue(send, 3, () => {}, sleep, () => 'w')
    q.markDirty('why'); q.edit('why', 'x')
    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS - 1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(signals[0].aborted).toBe(false)
    expect(q.state.saving).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(signals[0].aborted).toBe(true)
    expect(sleep).toHaveBeenCalledWith(1000)
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1][3].seq).toBe(send.mock.calls[0][3].seq)
    expect(send.mock.calls[1][2]).toBe(3)
    expect(signals[1].aborted).toBe(false)
    expect(q.state).toMatchObject({ revision: 7, saving: false, dirty: false, error: null })
    late({ kind: 'ok', revision: 99 }); await vi.advanceTimersByTimeAsync(0)
    expect(q.state).toMatchObject({ revision: 7, stopped: false, error: null })
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    vi.useRealTimers()
  }
})
test('the timer is cleared as soon as send settles, whatever the answer', async () => {
  vi.useFakeTimers()
  try {
    const answers: SendResult[] = [{ kind: 'ok', revision: 1 }, { kind: 'bad', error: MSG }, { kind: 'stop' }]
    for (const answer of answers) {
      const signals: AbortSignal[] = []
      const q = new SaveQueue((_p, _v, _r, m) => { signals.push(m.signal); return Promise.resolve(answer) }, 0, () => {}, async () => {}, () => 'w', 50)
      q.edit('why', 'x')
      await vi.advanceTimersByTimeAsync(0)
      expect(signals).toHaveLength(1)
      expect(vi.getTimerCount()).toBe(0)
      await vi.advanceTimersByTimeAsync(100)
      expect(signals[0].aborted).toBe(false)
    }
    // A send that throws synchronously is still a retry, and leaves no timer behind.
    let n = 0
    const q = new SaveQueue(() => { if (++n === 1) throw new Error('boom'); return Promise.resolve({ kind: 'ok', revision: 2 }) }, 0, () => {}, async () => {}, () => 'w', 50)
    q.edit('why', 'x')
    await vi.advanceTimersByTimeAsync(0)
    expect(n).toBe(2)
    expect(q.state).toMatchObject({ revision: 2, dirty: false })
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    vi.useRealTimers()
  }
})
test('stop() during a hanging send aborts its signal, clears the timer, and ignores the late answer', async () => {
  vi.useFakeTimers()
  try {
    const signals: AbortSignal[] = []
    let late: (r: SendResult) => void = () => {}
    const send = vi.fn((_p: string, _v: string, _r: number, m: Meta): Promise<SendResult> => {
      signals.push(m.signal)
      return new Promise((r) => { late = r })
    })
    const q = new SaveQueue(send, 5, () => {}, async () => {}, () => 'w')
    q.markDirty('why'); q.edit('why', 'x')
    await vi.advanceTimersByTimeAsync(0)
    expect(signals).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(1)
    q.stop('This snapshot changed. Reload.')
    expect(signals[0].aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)
    late({ kind: 'ok', revision: 9 }); await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS)
    expect(send).toHaveBeenCalledTimes(1)
    expect(q.state).toMatchObject({ revision: 5, stopped: true, saving: false, error: 'This snapshot changed. Reload.' })
  } finally {
    vi.useRealTimers()
  }
})
test('without crypto.randomUUID (plain http), the writer is a version 4 UUID built from getRandomValues', () => {
  const real = globalThis.crypto
  vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
  try {
    expect(typeof (globalThis.crypto as Partial<Crypto>).randomUUID).toBe('undefined')
    const a = new SaveQueue(vi.fn(), 0, () => {}).writer
    const b = new SaveQueue(vi.fn(), 0, () => {}).writer
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(b).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(b).not.toBe(a)
  } finally {
    vi.unstubAllGlobals()
  }
})

// Spec v1.1 section 18.4, structure items (#368 only): a structure item gets its seq on first send and keeps it on
// every retry, and after a retry it stays first even when edits are pending.
test('a structure item gets its seq on first send and keeps it on every retry', async () => {
  const sleep = vi.fn(async (_ms: number) => {})
  const log: Sent[] = []
  const q = new SaveQueue(record(log, (n) => (n === 2 || n === 3 ? { kind: 'retry' } : { kind: 'ok', revision: n })), 0, () => {}, sleep, () => 'w')
  q.edit('headline', 'a'); await flush()
  q.structure('competitive_bullets.add'); await flush()
  expect(log.map((s) => [s.path, s.value, s.seq, s.revision])).toEqual([
    ['headline', 'a', 1, 0],
    ['competitive_bullets.add', 'structure', 2, 1],
    ['competitive_bullets.add', 'structure', 2, 1],
    ['competitive_bullets.add', 'structure', 2, 1],
  ])
  expect(q.state).toMatchObject({ structuring: false, saving: false, error: null, revision: 4 })
})
test('a structure item retried goes before a pending edit and keeps its seq; then normal order resumes', async () => {
  let release: () => void = () => {}
  const sleep = vi.fn(() => new Promise<void>((r) => { release = r }))
  const log: Sent[] = []
  const q = new SaveQueue(record(log, (n) => (n === 1 ? { kind: 'retry' } : { kind: 'ok', revision: n })), 0, () => {}, sleep, () => 'w')
  q.structure('competitive_bullets.add'); await flush()
  expect(log.map((s) => [s.path, s.seq])).toEqual([['competitive_bullets.add', 1]])
  // During the backoff an edit and a second structure item queue up. Without retry first the edit would go next.
  q.markDirty('headline'); q.edit('headline', 'h')
  q.structure('sources_bullets.0.remove')
  release(); await flush()
  // The retried add goes first with its seq; then edits before structure items again, each new item a new seq.
  expect(log.map((s) => [s.path, s.value, s.seq])).toEqual([
    ['competitive_bullets.add', 'structure', 1],
    ['competitive_bullets.add', 'structure', 1],
    ['headline', 'h', 2],
    ['sources_bullets.0.remove', 'structure', 3],
  ])
  expect(q.state).toMatchObject({ structuring: false, dirty: false, saving: false, error: null, revision: 4 })
})
