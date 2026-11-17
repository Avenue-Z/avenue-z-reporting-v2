export type BqFallbackReason = 'unsupported' | 'stale' | 'error'

/** Raised when the mart cannot answer a query exactly; callers fall back to the live API. */
export class BqUnavailable extends Error {
  constructor(readonly reason: BqFallbackReason, message: string) {
    super(message)
    this.name = 'BqUnavailable'
  }
}
