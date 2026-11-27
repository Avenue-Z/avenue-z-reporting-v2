// AEO Overview v2, section 02 (Peec): the per-brand table (Visibility, Share of voice, Used as a source %) and the
// year-to-date visibility trend per brand. Window, project and "your brand" resolve exactly as getPeecOverviewImpl does;
// the metric math is the same aggregateBrandRows + aggToMetrics v1's brand table uses, so the two pages agree.
import { cached } from '@/lib/cache'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { resolveYou } from '@/lib/aeo/v2/you'
import type { DailyPoint } from '@/lib/aeo/types'
import type { BrandRowV2, BrandTrend, CompareMode, VisibilityV2 } from '@/lib/aeo/v2/types'
import {
  distinctAnswersByBrand,
  multiRowBrands,
  usedAsSourceByBrand,
  type DomainShareRow,
} from '@/lib/aeo/v2/used-as-source'
import {
  aggregateBrandRows,
  aggToMetrics,
  fetchAllRows,
  peecPost,
  type ApiBrandRow,
  type ApiDomainRow,
} from './client'
import { getPeecRoster, type PeecRosterBrand } from './roster'

const DOMAIN_LIMIT = 10_000
const YTD_MAX_ROWS = 20_000
const CHAT_PAGES_MAX = 5
const CHAT_MAX_ROWS = CHAT_PAGES_MAX * DOMAIN_LIMIT

export function buildPeecBrandRows(
  current: ApiBrandRow[],
  prior: ApiBrandRow[],
  used: Map<string, number | null>,
  usedPrior: Map<string, number | null>,
  you: string | null,
): BrandRowV2[] {
  const currentAgg = aggregateBrandRows(current)
  const priorAgg = aggregateBrandRows(prior)
  return Array.from(currentAgg.entries())
    .map(([id, agg]) => {
      const curr = aggToMetrics(agg)
      const p = priorAgg.get(id)
      const prev = p ? aggToMetrics(p) : null
      return {
        name: agg.name,
        isYou: agg.name === you,
        visibility: curr.visibility,
        visibilityPrior: prev ? prev.visibility : null,
        sov: curr.sov,
        sovPrior: prev ? prev.sov : null,
        usedAsSource: used.get(agg.name) ?? null,
        // A brand with no prior row is new this period: no prior in any column.
        usedAsSourcePrior: p ? (usedPrior.get(agg.name) ?? null) : null,
      }
    })
    .sort((a, b) => b.visibility - a.visibility)
    .map((b, i) => ({ ...b, rank: i + 1 }))
}

function buildTrend(rows: ApiBrandRow[], you: string | null): BrandTrend[] {
  const byBrand = new Map<string, Map<string, { c: number; t: number }>>()
  for (const r of rows) {
    if (!r.date) continue
    const day = r.date.slice(0, 10)
    const days = byBrand.get(r.brand.name) ?? new Map<string, { c: number; t: number }>()
    const e = days.get(day)
    if (e) { e.c += r.visibility_count; e.t += r.visibility_total } else days.set(day, { c: r.visibility_count, t: r.visibility_total })
    byBrand.set(r.brand.name, days)
  }
  return Array.from(byBrand.entries()).map(([name, days]) => {
    const points: DailyPoint[] = Array.from(days.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([, { t }]) => t > 0)
      .map(([date, { c, t }]) => ({ date, visibility: (c / t) * 100 }))
    return { name, isYou: name === you, points }
  }).filter((t) => t.points.length > 0)
}

const toShareRows = (rows: ApiDomainRow[]): DomainShareRow[] =>
  rows.map((r) => ({ domain: r.domain, answers: r.retrieved_chat_count, totalAnswers: r.total_chat_count }))

/** One window's Used as a source % per brand name; a per-answer pull runs only for brands with several matching rows. */
async function usedForWindow(
  roster: PeecRosterBrand[],
  window: { start_date: string; end_date: string },
  pid: string,
  clientSlug: string,
): Promise<Map<string, number | null>> {
  const res = await peecPost<{ data: ApiDomainRow[] }>('/reports/domains', { ...window, limit: DOMAIN_LIMIT }, pid)
  const data = res.data ?? []
  if (data.length >= DOMAIN_LIMIT) console.warn(`[peec] domains report hit ${DOMAIN_LIMIT} rows`)
  const rows = toShareRows(data)
  const multi = multiRowBrands(roster, rows)
  let distinct: Map<string, number> | undefined
  if (multi.length > 0) {
    const values = Array.from(new Set(multi.flatMap((m) => m.domains)))
    const chatRows: { domain: string; chat?: { id: string } }[] = []
    let capped = false
    for (let offset = 0; ; offset += DOMAIN_LIMIT) {
      const page = await peecPost<{ data: ApiDomainRow[] }>('/reports/domains', {
        ...window,
        dimensions: ['chat_id'],
        filters: [{ field: 'domain', operator: 'in', values }],
        limit: DOMAIN_LIMIT,
        offset,
      }, pid)
      const batch = page.data ?? []
      chatRows.push(...batch)
      if (batch.length < DOMAIN_LIMIT) break
      if (chatRows.length >= CHAT_MAX_ROWS) { capped = true; break }
    }
    if (capped) console.warn(`[peec] chat_id rows hit ${CHAT_MAX_ROWS} for ${clientSlug}; distinct answers unavailable`)
    else distinct = distinctAnswersByBrand(multi, chatRows)
  }
  return usedAsSourceByBrand(roster, rows, distinct)
}

async function getPeecVisibilityV2Impl(clientSlug: string, dateRange: string, compareMode: CompareMode): Promise<VisibilityV2> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const config = await getClientBySlug(clientSlug)
  const pid = config?.peecCustomerProjectId
  if (!pid) throw new Error(`[peec] no Peec project configured for ${clientSlug}`)
  const yourBrand = config?.peecYourBrand ?? ''

  const mainDates = parseDateRange(dateRange)
  const compareDates = deriveCompareRange(dateRange, compareMode) ?? mainDates
  const current = { start_date: mainDates.startDate, end_date: mainDates.endDate }
  const prior = { start_date: compareDates.startDate, end_date: compareDates.endDate }
  const todayISO = new Date().toISOString().slice(0, 10)
  const ytd = { start_date: `${todayISO.slice(0, 4)}-01-01`, end_date: todayISO }

  const [roster, currentRes, priorRes, ytdRows] = await Promise.all([
    getPeecRoster(pid),
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...current }, pid),
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...prior }, pid),
    fetchAllRows({ ...ytd, dimensions: ['date'] }, pid, YTD_MAX_ROWS),
  ])
  const [used, usedPrior] = await Promise.all([usedForWindow(roster, current, pid, clientSlug), usedForWindow(roster, prior, pid, clientSlug)])

  if (ytdRows.length >= YTD_MAX_ROWS) console.warn(`[peec] YTD trend rows hit ${YTD_MAX_ROWS} for ${clientSlug}; the chart may be truncated`)
  // Brands in visibility-rank order, so several matches resolve to the best-ranked one.
  const ownByName = new Map(roster.map((b) => [b.name, b.isOwn]))
  const ranked = Array.from(aggregateBrandRows(currentRes.data ?? []).values())
    .map((agg) => ({ name: agg.name, isOwn: ownByName.get(agg.name) ?? false, visibility: aggToMetrics(agg).visibility }))
    .sort((a, b) => b.visibility - a.visibility)
  const you = resolveYou(ranked, yourBrand)

  return {
    roster: roster.map((b) => b.name),
    brands: buildPeecBrandRows(currentRes.data ?? [], priorRes.data ?? [], used, usedPrior, you),
    trend: buildTrend(ytdRows, you),
    usedAsSourceBasis: 'answers',
  }
}

export const getPeecVisibilityV2 = cached('peec', 'getVisibilityV2', getPeecVisibilityV2Impl, {
  version: 'v1',
  healthCritical: false,
  extractTags: ([clientSlug]) => ({ client: clientSlug }),
})
