import type { BlockConfig, MetricFormat } from '@/lib/dashboard/types'

/** User's choices on the preview card. metric/account are chosen alternative values (leaf only). */
export interface BlockSelections {
  name: string
  format: MetricFormat
  metric?: string
  account?: string
}

/**
 * Turn a resolver proposal's config into the final block: apply name/format/id,
 * and (for leaf bindings) swap in the chosen metric/account alternative values.
 * Aggregate bindings are left as-resolved (operand alternatives are deferred).
 */
export function applySelections(proposalConfig: BlockConfig, selections: BlockSelections, id: string): BlockConfig {
  const binding = structuredClone(proposalConfig.binding)
  if (binding.source === 'supermetrics') {
    if (selections.metric) binding.metricField = selections.metric
    if (selections.account) binding.account = selections.account
  } else if (binding.source === 'triplewhale') {
    if (selections.metric) binding.metric = selections.metric
  }
  return { id, name: selections.name, format: selections.format, range: proposalConfig.range, binding }
}
