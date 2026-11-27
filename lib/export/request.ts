import { isServerExportSection, type ServerExportSection } from './sections'
import type { AeoRange } from '@/lib/organic-social/aeo-tab/params'

/** What the Export PDF button asks for. Role and client identity are never here: the route takes them
 *  from the session (app/api/export/pdf/route.ts). Every field is validated strictly, because the
 *  slug and ranges go into the URL the server's own browser opens. */
export interface ExportRequest {
  clientSlug: string
  /** Which report. A body without one is Organic Social: a page loaded before other sections could export. */
  section: ServerExportSection
  subsection: string | null
  dateRange: string
  compareRange: string | null
  /** AEO's model filter as the page's `?models=` holds it (comma-separated names), or null. */
  models: string | null
  /** The AEO Informed Social tab's range (aeo=) and min competitors (aeomin=). Present only on that tab's export, so every other request,
   *  body and export path is exactly what it was. */
  aeo?: AeoRange
  aeoMin?: number
  /** AEO Overview: the page's Show deltas switch is off (`deltas=off`). Absent means deltas show. */
  deltas?: 'off'
  /** AEO Overview: the trend chart's `?aeoTrend=` (competitor keys, or `off`). The export page's chart reads it back from the URL. */
  aeoTrend?: string
  /** AEO Overview: the topic matrix's `?aeoMatrix=` when it is not the default (Competitors). The matrix reads it back from the URL. */
  aeoMatrix?: 'platforms' | 'all'
  /** The requester's IANA timezone, for the stamp and the filename date. */
  tz: string
}

const SLUG = /^[a-z0-9-]{1,64}$/
const RANGE = /^[A-Za-z0-9_:,-]{1,64}$/
const MODELS = /^[A-Za-z,]{1,128}$/
const AEO_RANGES: readonly AeoRange[] = ['month', 'ytd', 'all']
/** `off`, or one to seven brand keys (components/report-sections/peec-ai/v2/brand-colors.ts `brandKey`), comma-separated. */
const AEO_TREND = /^(off|[a-z0-9-]{1,48}(,[a-z0-9-]{1,48}){0,6})$/

/** The page's `aeoTrend` if the export would accept it, else null: a hand-edited value prints the default chart rather
 *  than failing the export. */
export function exportableAeoTrend(raw: unknown): string | null {
  return typeof raw === 'string' && AEO_TREND.test(raw) ? raw : null
}

/** The page's `aeoMatrix` if it is a non-default mode the export accepts, else null (the default prints without the param). */
export function exportableAeoMatrix(raw: unknown): 'platforms' | 'all' | null {
  return raw === 'platforms' || raw === 'all' ? raw : null
}

/** `tz` if it is an IANA timezone this runtime knows, else UTC. */
export function safeTimeZone(tz: unknown): string {
  if (typeof tz !== 'string' || tz.length > 64) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}

export function parseExportRequest(body: unknown): ExportRequest | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (typeof b.clientSlug !== 'string' || !SLUG.test(b.clientSlug)) return null
  if (b.subsection != null && (typeof b.subsection !== 'string' || !SLUG.test(b.subsection))) return null
  if (typeof b.dateRange !== 'string' || !RANGE.test(b.dateRange)) return null
  if (b.compareRange != null && (typeof b.compareRange !== 'string' || !RANGE.test(b.compareRange))) return null
  const section = b.section ?? 'organic-social'
  if (!isServerExportSection(section)) return null
  if (b.models != null && (typeof b.models !== 'string' || !MODELS.test(b.models))) return null
  if (b.aeo != null && !AEO_RANGES.includes(b.aeo as AeoRange)) return null
  if (b.aeoMin != null && !(typeof b.aeoMin === 'number' && Number.isInteger(b.aeoMin) && b.aeoMin >= 1 && b.aeoMin <= 5)) return null
  if (b.deltas != null && b.deltas !== 'off') return null
  if (b.aeoTrend != null && exportableAeoTrend(b.aeoTrend) === null) return null
  if (b.aeoMatrix != null && exportableAeoMatrix(b.aeoMatrix) === null) return null
  return {
    clientSlug: b.clientSlug,
    section,
    subsection: (b.subsection as string | null | undefined) ?? null,
    dateRange: b.dateRange,
    compareRange: (b.compareRange as string | null | undefined) ?? null,
    models: (b.models as string | null | undefined) ?? null,
    ...(b.aeo != null ? { aeo: b.aeo as AeoRange } : {}),
    ...(b.aeoMin != null ? { aeoMin: b.aeoMin as number } : {}),
    ...(b.deltas === 'off' ? { deltas: 'off' as const } : {}),
    ...(b.aeoTrend != null ? { aeoTrend: b.aeoTrend as string } : {}),
    ...(b.aeoMatrix != null ? { aeoMatrix: b.aeoMatrix as 'platforms' | 'all' } : {}),
    tz: safeTimeZone(b.tz),
  }
}

/** The export page the server's browser opens for this request (app/export/[clientSlug]/[section]). */
export function exportPagePath(r: ExportRequest): string {
  const sp = new URLSearchParams()
  sp.set('dateRange', r.dateRange)
  if (r.compareRange) sp.set('compareRange', r.compareRange)
  if (r.subsection) sp.set('subsection', r.subsection)
  if (r.models) sp.set('models', r.models)
  if (r.aeo) sp.set('aeo', r.aeo)
  if (r.aeoMin) sp.set('aeomin', String(r.aeoMin))
  if (r.deltas) sp.set('deltas', r.deltas)
  if (r.aeoTrend) sp.set('aeoTrend', r.aeoTrend)
  if (r.aeoMatrix) sp.set('aeoMatrix', r.aeoMatrix)
  sp.set('tz', r.tz)
  return `/export/${r.clientSlug}/${r.section}?${sp.toString()}`
}
