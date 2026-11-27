// Storage contract for the AEO Snapshot KPI selection
// (report_section_config['peec-ai'].kpis). Must not import from components/.

export const AEO_KPI_IDS = [
  'visibility',
  'share-of-voice',
  'visibility-rank',
  'used-as-source',
  'sentiment',
  'ai-sessions',
  'ai-traffic-share',
  'ai-leads',
  'ai-cvr',
] as const

export type KpiId = (typeof AEO_KPI_IDS)[number]

export const MAX_KPIS = 5

export const DEFAULT_KPIS: readonly KpiId[] = [
  'visibility',
  'share-of-voice',
  'used-as-source',
  'ai-sessions',
  'ai-leads',
]

function isKpiId(v: unknown): v is KpiId {
  return typeof v === 'string' && (AEO_KPI_IDS as readonly string[]).includes(v)
}

function inCatalogOrder(ids: ReadonlySet<KpiId>): KpiId[] {
  return AEO_KPI_IDS.filter((id) => ids.has(id))
}

/** Strict, for writes. */
export function parseKpiSelection(raw: unknown): KpiId[] {
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string')) {
    throw new Error('invalid kpis')
  }
  const seen = new Set<KpiId>()
  for (const id of raw as string[]) {
    if (!isKpiId(id)) throw new Error(`unknown kpi ${id}`)
    if (seen.has(id)) throw new Error(`duplicate kpi ${id}`)
    seen.add(id)
  }
  if (seen.size > MAX_KPIS) throw new Error(`at most ${MAX_KPIS} kpis`)
  return inCatalogOrder(seen)
}

/** Tolerant, for reads. null = never saved (defaults apply). */
export function readSavedKpis(raw: unknown, slug: string): KpiId[] | null {
  if (raw === undefined) return null
  if (!Array.isArray(raw)) {
    console.warn('[aeo-kpis] invalid stored kpis slug=' + slug)
    return null
  }
  const known = new Set<KpiId>(raw.filter(isKpiId))
  return inCatalogOrder(known).slice(0, MAX_KPIS)
}
