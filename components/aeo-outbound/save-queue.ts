// The editor's single save queue (spec §9a): one PATCH at a time, newest value per path, the revision from each
// 200 carried into the next request. A field is dirty from its first keystroke until an edit sent after its last
// keystroke is saved, so Approve (disabled while dirty or saving) can never approve text Ryan is still typing.
// A 400 belongs to its own field: it is recorded, the field stays dirty, and every other pending field still sends.
export type SendResult = { kind: 'ok'; revision: number } | { kind: 'bad'; error: string } | { kind: 'stop' } | { kind: 'retry' }
export interface SaveState { dirty: boolean; saving: boolean; revision: number; error: string | null; stopped: boolean }
const RETRY_MESSAGE = "Couldn't save, retrying"
const BACKOFF = [1000, 2000, 4000]

export class SaveQueue {
  private pending = new Map<string, { value: string; stamp: number }>()
  private typed = new Map<string, number>()
  private dirtyPaths = new Set<string>()
  private bad = new Map<string, string>()
  private running = false
  private waiting = false
  private attempt = 0
  state: SaveState

  constructor(
    private readonly send: (path: string, value: string, revision: number) => Promise<SendResult>,
    revision: number,
    private readonly onState: (s: SaveState) => void,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
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
    this.set({ error: this.waiting ? RETRY_MESSAGE : this.outstandingBad() })
    void this.run()
  }

  stop(message: string) { this.set({ stopped: true, saving: false, error: message }) }

  private async run() {
    if (this.running) return
    this.running = true
    try {
      while (this.pending.size && !this.state.stopped) {
        const [path, item] = this.pending.entries().next().value as [string, { value: string; stamp: number }]
        this.set({ saving: true })
        const r = await Promise.resolve().then(() => this.send(path, item.value, this.state.revision)).catch((): SendResult => ({ kind: 'retry' }))
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
