export type MetricFormat = 'currency' | 'percent' | 'count' | 'number'

export type Granularity = 'day' | 'week' | 'month'

export interface SupermetricsBinding {
  source: 'supermetrics'
  dsId: string
  metricField: string
  account: string
  expectedAccounts?: string[] // drift guard: returned accounts must be ⊆ this set
  filters?: { column: string; values: string[] }[] // OR within a row (any value), AND across rows
  /** v1: array length exactly 1. Used by resolveGroupedBlock and resolveSeriesBlock; ignored in scalar mode. */
  dimensions?: string[]
  /** Required when called via resolveSeriesBlock; ignored otherwise. */
  granularity?: Granularity
}

export interface TripleWhaleBinding {
  source: 'triplewhale'
  metric: string
  account?: string
  filters?: { column: string; values: string[] }[]
  /** v1: array length exactly 1. */
  dimensions?: string[]
  granularity?: Granularity
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

/** One row per dimension value. `value` is undefined only when the dim only
 *  appears in the compare period; otherwise both `value` and (when comparison
 *  is active and matched) `prevValue` are present. */
export interface GroupedRow {
  dim: Record<string, string>
  value: number | undefined
  prevValue?: number
}

export type GroupedResult =
  | { ok: true; rows: GroupedRow[]; format: MetricFormat }
  | { ok: false; error: BlockError }

/** One point per time bucket. `bucket` is the ISO YYYY-MM-DD of the period
 *  start (for all granularities). */
export interface SeriesPoint {
  bucket: string
  value: number
  prevValue?: number
}

export type SeriesResult =
  | { ok: true; points: SeriesPoint[]; format: MetricFormat; granularity: Granularity }
  | { ok: false; error: BlockError }

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
