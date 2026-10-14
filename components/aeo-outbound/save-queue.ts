// The editor's single save queue (spec §9a): one PATCH at a time, newest value per path, the revision from each
// 200 carried into the next request. A field is dirty from its first keystroke until an edit sent after its last
// keystroke is saved, so Approve (disabled while dirty or saving) can never approve text Ryan is still typing.
// A 400 belongs to its own field: it is recorded, the field stays dirty, and every other pending field still sends.
// Spec v1.1 section 18.4: every save carries this queue's `writer` and the item's `seq` (assigned the first time the
// item is sent, kept on every retry, so seq order is send order), a field whose attempt came back `retry` is sent
// again before any other field, and an attempt that has not answered within SAVE_TIMEOUT_MS is aborted and retried.
export type SendResult = { kind: 'ok'; revision: number } | { kind: 'bad'; error: string } | { kind: 'stop' } | { kind: 'retry' }
export interface SaveState { dirty: boolean; saving: boolean; revision: number; error: string | null; stopped: boolean }
const RETRY_MESSAGE = "Couldn't save, retrying"
const BACKOFF = [1000, 2000, 4000]
// A decision, not a measurement (spec 18.4): a save is four Neon queries, normally well under a second.
export const SAVE_TIMEOUT_MS = 15_000
export interface SendMeta { writer: string; seq: number; signal: AbortSignal }
type Item = { value: string; stamp: number; seq?: number }

// crypto.randomUUID exists only in secure contexts, so the dev server opened by its LAN IP over plain http has none.
// getRandomValues has no such limit: build an RFC 4122 version 4 UUID from 16 random bytes.
export function newSaveId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export class SaveQueue {
  private pending = new Map<string, Item>()
  private typed = new Map<string, number>()
  private dirtyPaths = new Set<string>()
  private bad = new Map<string, string>()
  private running = false
  private waiting = false
  private attempt = 0
  private nextSeq = 1
  // The path whose last attempt came back `retry`: its pending value is the next one sent.
  private retryPath: string | null = null
  // The attempt in flight, so stop() can abort it.
  private inFlight: AbortController | null = null
  readonly writer: string
  state: SaveState

  constructor(
    private readonly send: (path: string, value: string, revision: number, meta: SendMeta) => Promise<SendResult>,
    revision: number,
    private readonly onState: (s: SaveState) => void,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    newId: () => string = newSaveId,
    private readonly timeoutMs: number = SAVE_TIMEOUT_MS,
  ) {
    this.writer = newId()
    this.state = { dirty: false, saving: false, revision, error: null, stopped: false }
  }

  private set(p: Partial<SaveState>) {
    this.state = { ...this.state, ...p, dirty: this.dirtyPaths.size > 0 || this.pending.size > 0 || this.bad.size > 0 }
    this.onState(this.state)
  }

  // The message of the most recently recorded 400 that is still outstanding, or null.
  private outstandingBad(): string | null {
    let last: string | null = null
    for (const m of this.bad.values()) last = m
    return last
  }

  markDirty(path: string) {
    if (this.state.stopped) return
    this.typed.set(path, (this.typed.get(path) ?? 0) + 1)
    this.dirtyPaths.add(path)
    this.set({})
  }

  edit(path: string, value: string) {
    if (this.state.stopped) return
    this.bad.delete(path)
    this.pending.delete(path)
    this.pending.set(path, { value, stamp: this.typed.get(path) ?? 0 })
    this.set({ error: this.waiting || this.attempt > 0 ? RETRY_MESSAGE : this.outstandingBad() })
    void this.run()
  }

  stop(message: string) {
    this.set({ stopped: true, saving: false, error: message })
    this.inFlight?.abort()
  }

  // Retry first, then insertion order (an edit re-inserts its path, so the oldest untouched field goes first).
  private next(): [string, Item] {
    const retried = this.retryPath === null ? undefined : this.pending.get(this.retryPath)
    if (retried) return [this.retryPath as string, retried]
    return this.pending.entries().next().value as [string, Item]
  }

  // One attempt: a synchronous throw or a rejection is a `retry`, and so is an abort, by the timer after timeoutMs
  // or by stop(). The race settles once, so a late answer from an aborted attempt is ignored, and the timer is
  // cleared as soon as either side settles.
  private attemptSend(path: string, value: string, revision: number, seq: number): Promise<SendResult> {
    const controller = new AbortController()
    this.inFlight = controller
    let timer: ReturnType<typeof setTimeout> | undefined
    const aborted = new Promise<SendResult>((resolve) => {
      controller.signal.addEventListener('abort', () => resolve({ kind: 'retry' }), { once: true })
      timer = setTimeout(() => controller.abort(), this.timeoutMs)
    })
    const answered = Promise.resolve()
      .then(() => this.send(path, value, revision, { writer: this.writer, seq, signal: controller.signal }))
      .catch((): SendResult => ({ kind: 'retry' }))
    return Promise.race([answered, aborted]).finally(() => {
      clearTimeout(timer)
      if (this.inFlight === controller) this.inFlight = null
    })
  }

  private async run() {
    if (this.running) return
    this.running = true
    try {
      while (this.pending.size && !this.state.stopped) {
        const [path, item] = this.next()
        this.retryPath = null
        item.seq ??= this.nextSeq++
        this.set({ saving: true })
        const r = await this.attemptSend(path, item.value, this.state.revision, item.seq)
        if (this.state.stopped) return
        if (r.kind === 'ok') {
          if (this.pending.get(path) === item) this.pending.delete(path)
          if ((this.typed.get(path) ?? 0) === item.stamp && !this.pending.has(path)) this.dirtyPaths.delete(path)
          this.attempt = 0
          this.set({ revision: r.revision, saving: false, error: this.outstandingBad() })
        } else if (r.kind === 'bad') {
          this.attempt = 0
          // Only this field is refused. It stays dirty until Ryan changes that text; the others keep sending.
          if (this.pending.get(path) === item) {
            this.pending.delete(path)
            this.bad.delete(path)
            this.bad.set(path, r.error)
          }
          this.set({ saving: false, error: this.outstandingBad() })
        } else if (r.kind === 'stop') {
          this.stop('This snapshot changed. Reload.')
          return
        } else {
          this.retryPath = path
          this.set({ saving: false, error: RETRY_MESSAGE })
          this.waiting = true
          try { await this.sleep(BACKOFF[this.attempt] ?? 10_000) } finally { this.waiting = false }
          this.attempt++
        }
      }
    } finally {
      this.running = false
    }
  }
}
