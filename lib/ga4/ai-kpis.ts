import { ga4Query } from '@/lib/ga4/client'
import { AI_REFERRER_DOMAINS, aiSourceModel } from '@/lib/constants'
import { hasLeadEvents, leadEventFilter } from '@/lib/ga4/lead-events'
import type { GA4DimensionFilter } from '@/lib/ga4/types'
import type { Ga4Config } from '@/lib/db/schema'
import type { AEOModel } from '@/lib/peec/models'

/** Sessions whose source contains any known AI referrer domain. */
export const AI_SOURCE_FILTER: GA4DimensionFilter = {
  orGroup: {
    expressions: AI_REFERRER_DOMAINS.map((d) => ({
      filter: {
        fieldName: 'sessionSource',
        stringFilter: { matchType: 'CONTAINS' as const, value: d, caseSensitive: false },
      },
    })),
  },
}

export type AiKpiWindow = {
  totalSessions: number
  bySource: { source: string; sessions: number; keyEvents: number }[]
  /** null = no lead-event allowlist, leads come from keyEvents. */
  leadsBySource: { source: string; leads: number }[] | null
}

export type Ga4KpiState =
  | { status: 'not-configured' }
  | { status: 'error' }
  | { status: 'ok'; now: AiKpiWindow; prior: AiKpiWindow | null }

/**
 * Gathers both kinds of lead rows (key events and, when configured, the
 * allowlist). It does not decide which one counts: that is `summarizeAiKpis`.
 * Any rejection rejects the whole call.
 */
export async function fetchAiKpiWindow(
  clientSlug: string,
  isoRange: string,
  ga4Config: Ga4Config | null | undefined,
): Promise<AiKpiWindow> {
  const withLeads = hasLeadEvents(ga4Config)
  const [totals, sources, leadRows] = await Promise.all([
    ga4Query({ clientSlug, dateRange: isoRange, metrics: ['sessions'] }),
    ga4Query({
      clientSlug,
      dateRange: isoRange,
      metrics: ['sessions', 'keyEvents'],
      dimensions: ['sessionSource'],
      limit: 1000,
      dimensionFilter: AI_SOURCE_FILTER,
    }),
    withLeads
      ? ga4Query({
          clientSlug,
          dateRange: isoRange,
          metrics: ['eventCount'],
          dimensions: ['sessionSource', 'eventName'],
          limit: 1000,
          dimensionFilter: {
            andGroup: { expressions: [AI_SOURCE_FILTER!, leadEventFilter(ga4Config as Ga4Config)!] },
          },
        })
      : Promise.resolve(null),
  ])

  let leadsBySource: AiKpiWindow['leadsBySource'] = null
  if (leadRows) {
    const sums = new Map<string, number>()
    for (const r of leadRows.rows) {
      const source = String(r.sessionSource ?? '')
      sums.set(source, (sums.get(source) ?? 0) + Number(r.eventCount ?? 0))
    }
    leadsBySource = [...sums].map(([source, leads]) => ({ source, leads }))
  }

  return {
    totalSessions: Number(totals.rows[0]?.sessions ?? 0),
    bySource: sources.rows.map((r) => ({
      source: String(r.sessionSource ?? ''),
      sessions: Number(r.sessions ?? 0),
      keyEvents: Number(r.keyEvents ?? 0),
    })),
    leadsBySource,
  }
}

/**
 * The ONE place that chooses what "leads" means: the lead-event allowlist
 * when it was fetched, else GA4 key events. Switching to key events only is
 * a one-line change here.
 */
export function summarizeAiKpis(
  w: AiKpiWindow,
  models: AEOModel[] | null,
): { sessions: number; leads: number; totalSessions: number; leadBasis: 'lead-events' | 'key-events' } {
  const counts = (source: string) => {
    if (models === null) return true
    const m = aiSourceModel(source)
    return m !== null && models.includes(m)
  }
  const sessions = w.bySource.filter((s) => counts(s.source)).reduce((a, s) => a + s.sessions, 0)
  const useLeadEvents = w.leadsBySource !== null
  const leads = useLeadEvents
    ? w.leadsBySource!.filter((s) => counts(s.source)).reduce((a, s) => a + s.leads, 0)
    : w.bySource.filter((s) => counts(s.source)).reduce((a, s) => a + s.keyEvents, 0)
  return {
    sessions,
    leads,
    totalSessions: w.totalSessions,
    leadBasis: useLeadEvents ? 'lead-events' : 'key-events',
  }
}
