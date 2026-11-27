import type { UsedAsSourceBasis } from '@/lib/aeo/v2/types'

/** Section 03's gauge metric lives in the URL so the PDF export draws the same gauges. */
export const GAUGE_PARAM = 'aeoGauge'

export type GaugeMetric = 'visibility' | 'sov' | 'source'

/** Reads `aeoGauge`: only `sov` and `source` are recognised (case-sensitive); anything else is the default. */
export function parseGaugeMetric(raw: string | null | undefined): GaugeMetric {
  return raw === 'sov' || raw === 'source' ? raw : 'visibility'
}

/** The param value for a metric; `null` means delete the param (the default). */
export function serializeGaugeMetric(m: GaugeMetric): string | null {
  return m === 'visibility' ? null : m
}

/** The metric's name. The third is a share of answers (Peec) or, where only citations exist (Profound), citation share. */
export function gaugeMetricLabel(m: GaugeMetric, basis: UsedAsSourceBasis): string {
  if (m === 'visibility') return 'Visibility'
  if (m === 'sov') return 'Share of voice'
  return basis === 'citations' ? 'Citation share' : 'Used as a source'
}
