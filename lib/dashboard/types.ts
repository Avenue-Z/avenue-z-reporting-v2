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

export interface ShopifyBinding {
  source: 'shopify'
  query: string // ShopifyQL body (FROM…SHOW…WHERE…) without a SINCE/UNTIL date clause
}

export type LeafBinding = SupermetricsBinding | TripleWhaleBinding | ShopifyBinding

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

export interface BlockConfig {
  id: string
  name: string
  binding: Binding
  format: MetricFormat
  range: { dateRange: string; compareRange: string | null } | null // null = inherit global
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

/** A persisted block = a resolvable BlockConfig plus optional grid layout (widened by #3). */
export type PersistedBlock = BlockConfig & { layout?: { w?: number; h?: number } }

/** One per-client configurable dashboard. `blocks` array order is display order. */
export interface DashboardConfig {
  defaultRange: { dateRange: string; compareRange: string | null }
  blocks: PersistedBlock[]
}
