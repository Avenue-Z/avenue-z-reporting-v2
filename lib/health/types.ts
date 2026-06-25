export type Surface = 'portal' | 'dashboard'
export type HealthStatus = 'ok' | 'down'

/** One data fetch's outcome, recorded by the cached() wrapper during render. */
export interface SourceHealth {
  vendor: string
  fn: string
  ok: boolean
  error?: string
}

/** Serialized in-page by <ReportHealthBeacon> and parsed by the sweep. */
export interface HealthBeacon {
  surface: Surface
  clientSlug: string
  section: string
  sources: SourceHealth[]
  renderError?: string
}

/** A probed unit's resolved status after the sweep combines HTTP + beacon. */
export interface ProbeResult {
  key: string
  surface: Surface
  clientSlug: string
  section: string
  status: HealthStatus
  detail?: string
}

/** The subset of a health_state row the differ needs. */
export interface StoredHealth {
  key: string
  status: HealthStatus
  detail: string | null
}

/** A status change worth announcing to Slack. */
export interface Transition {
  key: string
  surface: Surface
  clientSlug: string
  section: string
  from: HealthStatus
  to: HealthStatus
  detail?: string
}
