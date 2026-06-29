import type { LabelOverrides } from './types'

/** Display label for a dimension VALUE: override if present, else the raw value. */
export function resolveValueLabel(o: LabelOverrides | undefined, dimKey: string, raw: string): string {
  return o?.values?.[dimKey]?.[raw] ?? raw
}

/** Display label for a dimension KEY (column header): override if present, else the raw key. */
export function resolveDimLabel(o: LabelOverrides | undefined, dimKey: string): string {
  return o?.dims?.[dimKey] ?? dimKey
}
