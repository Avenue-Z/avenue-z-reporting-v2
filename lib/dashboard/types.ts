export type MetricFormat = 'currency' | 'percent' | 'count' | 'number' | 'multiple'
export type Granularity = 'day' | 'week' | 'month'

export interface SupermetricsBinding {
  source: 'supermetrics'
  dsId: string
  metricField: string
  account: string
  expectedAccounts?: string[]
  filters?: { column: string; values: string[] }[]
  dimensions?: string[]       // grouped mode (bar/table): v1 length exactly 1
  granularity?: Granularity   // series mode (line)
}
export interface TripleWhaleBinding {
  source: 'triplewhale'
  metric: string
  account?: string
  filters?: { column: string; values: string[] }[]
  dimensions?: string[]
  granularity?: Granularity
}
export interface ShopifyBinding {
  source: 'shopify'
  query: string               // ShopifyQL body, no date/GROUP BY clause
  dimensions?: string[]       // grouped: GROUP BY <dim>
  granularity?: Granularity   // series: GROUP BY day|week|month
}
export type LeafBinding = SupermetricsBinding | TripleWhaleBinding | ShopifyBinding

export interface CalculatedBinding { source: 'calculated'; terms: { coefficient: number; leaf: LeafBinding }[] }
export type AggregateOperand = LeafBinding | CalculatedBinding
export interface AggregateBinding { source: 'aggregate'; left: AggregateOperand; op: '+' | '-' | '*' | '/'; right: AggregateOperand }

export type FormulaOperand =
  | { kind: 'ref'; blockId: string }
  | { kind: 'metric'; leaf: LeafBinding }
export interface FormulaBinding { source: 'formula'; expr: string; operands: Record<string, FormulaOperand> }

export type Binding = LeafBinding | CalculatedBinding | AggregateBinding | FormulaBinding

export type BlockKind = 'kpi' | 'pills' | 'bar' | 'line' | 'table' | 'narrative' | 'header'
export interface BlockLayout { x: number; y: number; w: number; h: number }

export interface BlockConfig {
  id: string
  name: string
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
  /** Header-only: heading level (1 = largest). Default 2. */
  headerLevel?: 1 | 2 | 3
  /** Narrative-only: markdown body (rendered via react-markdown). */
  narrativeBody?: string
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

/** A persisted block = a resolvable BlockConfig plus optional grid layout (widened by #3). */
export type PersistedBlock = BlockConfig & { layout?: BlockLayout }

/** One per-client configurable dashboard. `blocks` array order is display order. */
export interface DashboardConfig {
  defaultRange: { dateRange: string; compareRange: string | null }
  blocks: PersistedBlock[]
}
