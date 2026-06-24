export type MetricFormat = 'currency' | 'percent' | 'count' | 'number'

export interface SupermetricsBinding {
  source: 'supermetrics'
  dsId: string
  metricField: string
  account: string
  expectedAccounts?: string[] // drift guard: returned accounts must be ⊆ this set
  filters?: { column: string; values: string[] }[] // OR within a row (any value), AND across rows
}

export interface TripleWhaleBinding {
  source: 'triplewhale'
  metric: string
  account?: string
  filters?: { column: string; values: string[] }[]
}

export type LeafBinding = SupermetricsBinding | TripleWhaleBinding

export interface CalculatedBinding {
  source: 'calculated'
  terms: { coefficient: number; leaf: LeafBinding }[] // value = Σ coefficientᵢ × leafᵢ
}

/** An operand of a binary aggregate: a single leaf or a weighted-sum calculation. */
export type AggregateOperand = LeafBinding | CalculatedBinding

export interface AggregateBinding {
  source: 'aggregate'
  left: AggregateOperand
  op: '+' | '-' | '*' | '/'
  right: AggregateOperand
}

export type Binding = LeafBinding | CalculatedBinding | AggregateBinding

/** Block kind discriminator. Default at parse/render time is 'kpi' for back-compat. */
export type BlockKind = 'kpi' | 'bar' | 'line' | 'table' | 'narrative' | 'header'

/** Full grid layout: required when present. Missing layout = "auto-pack on next save". */
export interface BlockLayout {
  x: number
  y: number
  w: number
  h: number
}

export interface BlockConfig {
  id: string
  name: string
  /** Renderer + resolver mode. Omitted = 'kpi' (back-compat). */
  kind?: BlockKind
  binding: Binding
  format: MetricFormat
  range: { dateRange: string; compareRange: string | null } | null // null = inherit global
  /** KPI-only annotations (ignored by other kinds). */
  subLabel?: string
  /** Green when value ≥ target and < ceiling. */
  target?: number
  /** Orange when value ≥ ceiling. */
  ceiling?: number
}

export type BlockError = 'disconnected' | 'invalid-metric' | 'no-data' | 'rate-limited' | 'error'

/** Raw output of a single leaf resolution. prevValue present iff a comparison is active. */
export interface LeafValue {
  value: number
  prevValue?: number
}

/** Internal: outcome of attempting one leaf (success carries LeafValue, failure carries a BlockError). */
export type LeafAttempt = ({ ok: true } & LeafValue) | { ok: false; error: BlockError }

/** Public resolver output — drives the Metric Block UI states. */
export type ResolveResult =
  | { ok: true; value: number; prevValue?: number; delta?: number; format: MetricFormat; formatted: string }
  | { ok: false; error: BlockError }

/** A persisted block = a resolvable BlockConfig plus optional grid layout. */
export type PersistedBlock = BlockConfig & { layout?: BlockLayout }

/** One per-client configurable dashboard. `blocks` array order is display order. */
export interface DashboardConfig {
  defaultRange: { dateRange: string; compareRange: string | null }
  blocks: PersistedBlock[]
}
