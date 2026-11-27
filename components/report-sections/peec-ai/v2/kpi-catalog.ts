import { DEFAULT_KPIS, type KpiId } from '@/lib/report-sections/aeo-kpis'
import type { AeoProvider } from '../provider-tabs'
import type { DeltaUnit } from './delta'

export type KpiSource = 'aeo' | 'ga4'

export const KPI_CATALOG: Record<KpiId, { label: string; source: KpiSource; unit: DeltaUnit }> = {
  visibility: { label: 'AI visibility', source: 'aeo', unit: 'pts' },
  'share-of-voice': { label: 'AI share of voice', source: 'aeo', unit: 'pts' },
  'visibility-rank': { label: 'AI visibility rank', source: 'aeo', unit: 'places' },
  'used-as-source': { label: 'Used as a source %', source: 'aeo', unit: 'pts' },
  sentiment: { label: 'Sentiment', source: 'aeo', unit: 'pts' },
  'ai-sessions': { label: 'AI search sessions', source: 'ga4', unit: 'pct' },
  'ai-traffic-share': { label: 'Share of traffic from AI', source: 'ga4', unit: 'pts' },
  'ai-leads': { label: 'AI search leads', source: 'ga4', unit: 'pct' },
  'ai-cvr': { label: 'AI search CVR', source: 'ga4', unit: 'pts' },
}

export type KpiAvailability = { ga4Connected: boolean; provider: AeoProvider }

export function unavailableReason(id: KpiId, a: KpiAvailability): string | null {
  if (KPI_CATALOG[id].source === 'ga4' && !a.ga4Connected) return 'Source not connected'
  if (id === 'used-as-source' && a.provider === 'profound') return 'Not available from Profound'
  return null
}

export function effectiveKpis(saved: KpiId[] | null, a: KpiAvailability): KpiId[] {
  if (saved !== null) return saved
  return DEFAULT_KPIS.filter((id) => unavailableReason(id, a) === null)
}

/** Peec's own 0-100 score from the raw -1..1 sentiment. */
export function peecSentimentScore(raw: number): number {
  return 50 * (1 + raw)
}
