// lib/peec/competitor-tables.ts
// Pure row builders for the competitor tables (H1 domains, H2 brand-absent pages).
// Moved verbatim out of content-impact.tsx; the caller decides whether deltas show.
import type { TopDomain } from './client'
import type { ByModel } from './by-model'
import { filterDomainRowsByModel } from './by-model'
import type { AEOModel } from './models'
import type { UrlCitation } from './url-citations'
import { domainPromptIds, urlPromptIds } from './url-citations'
import type { CoverageProjection } from './coverage-projection'
import type {
  CompetitorDomainsCitedRow,
  CompetitorGapRow,
  CompetitorUrlsBrandAbsentRow,
} from '@/components/report-sections/peec-ai/competitor-tables'
import type { ReportAudience } from '@/components/report-sections/peec-ai/ctx'

export type BrandAbsentRow = CompetitorUrlsBrandAbsentRow & {
  /** Raw Peec `classification`; humanising is the render layer's concern. */
  pageType: string | null
  promptIds: string[]
}

/** Competitor domains after the model filter (null/absent filter = unchanged). */
export function filterCompetitorDomains(
  competitorDomains: TopDomain[],
  domainCitationsByModel: ByModel<string, number> | null | undefined,
  models: AEOModel[] | null,
): TopDomain[] {
  return domainCitationsByModel
    ? filterDomainRowsByModel(competitorDomains, domainCitationsByModel, models ?? null)
    : competitorDomains
}

/** A cited URL that does not mention your brand and mentions at least one competitor brand. */
export function isBrandAbsent(c: UrlCitation): boolean {
  return !c.mentionsYourBrand && c.competitorBrandNames.length > 0
}

export function buildCompetitorDomainRows(input: {
  competitorDomains: TopDomain[]
  /** Per-domain, per-model citations; when set with `models`, rows are model-filtered (H1). */
  domainCitationsByModel?: ByModel<string, number> | null
  coverage: CoverageProjection
  coveragePrior: CoverageProjection | null
  totalTrackedPrompts: number
  models: AEOModel[] | null
  showDeltas: boolean
}): CompetitorDomainsCitedRow[] {
  const { coverage, coveragePrior, totalTrackedPrompts, models, showDeltas } = input
  const filtered = filterCompetitorDomains(input.competitorDomains, input.domainCitationsByModel, models)

  const coverageAvailable =
    Object.keys(coverage.promptIdsByDomain).length > 0 ||
    Object.keys(coverage.tagIdsByDomain).length > 0
  const coveragePriorAvailable = !!coveragePrior && (
    Object.keys(coveragePrior.promptIdsByDomain).length > 0 ||
    Object.keys(coveragePrior.tagIdsByDomain).length > 0)
  const getPromptCoverage = (domain: string): number | null =>
    coverageAvailable && totalTrackedPrompts > 0
      ? Math.round(domainPromptIds(coverage, domain).length / totalTrackedPrompts * 100)
      : null
  // FB-040: same totalTrackedPrompts denominator (tracked-prompt list is not period-dependent).
  const getPromptCoveragePrior = (domain: string): number | null =>
    coveragePrior && coveragePriorAvailable && totalTrackedPrompts > 0
      ? Math.round(domainPromptIds(coveragePrior, domain).length / totalTrackedPrompts * 100)
      : null

  // FB-063: with a model filter active, prior-period values are all-model while the
  // current citationCount is model-filtered, so every delta renders as -- (null).
  const modelFilterActive = models != null && models.length > 0
  const deltasOn = showDeltas && !modelFilterActive

  // FB-051: Citation Share = domain.citationCount / sum of competitor citationCounts * 100.
  // FB-058: delta = current share - prior share, both over the competitor-only denominator.
  const total = filtered.reduce((s, d) => s + (d.citationCount ?? 0), 0)
  const totalPrior = filtered.reduce((s, d) => s + (d.priorCitationCount ?? 0), 0)

  return filtered.slice(0, 25).map((d) => {
    const promptCovCurrent = getPromptCoverage(d.domain)
    const promptCovPrior = deltasOn ? getPromptCoveragePrior(d.domain) : null
    const promptCovDelta = deltasOn && promptCovCurrent !== null && promptCovPrior !== null
      ? promptCovCurrent - promptCovPrior
      : null
    const citationShareValue = total > 0 ? (d.citationCount / total) * 100 : 0
    const citationSharePrior = deltasOn && totalPrior > 0
      ? (d.priorCitationCount / totalPrior) * 100
      : null
    const citationShareDelta = deltasOn && citationSharePrior !== null
      ? citationShareValue - citationSharePrior
      : null
    return {
      domain: d.domain,
      aiVisibility: d.retrieved,
      aiVisibilityDelta: deltasOn ? d.retrievedDelta : null,
      citationShare: citationShareValue,
      citationShareDelta,
      promptCoverage: promptCovCurrent,
      promptCoverageDelta: promptCovDelta,
    }
  })
}

export function buildBrandAbsentRows(input: {
  citations: UrlCitation[]
  citationsPrior: UrlCitation[] | null
  coverage: CoverageProjection
  showDelta: boolean
}): BrandAbsentRow[] {
  const { citations, citationsPrior, coverage, showDelta } = input
  const sum = (rows: UrlCitation[]) => rows.reduce((s, c) => s + (c.citationCount || 0), 0)
  const totalCurrent = sum(citations)
  const totalPrior = citationsPrior ? sum(citationsPrior) : 0
  const priorByKey = new Map((citationsPrior ?? []).map((c) => [c.urlKey, c]))

  return citations
    .filter(isBrandAbsent)
    .sort((a, b) => b.citationCount - a.citationCount)
    .slice(0, 10)
    .map((c) => {
      const citePrior = priorByKey.get(c.urlKey)?.citationCount ?? null
      const citationShare = totalCurrent > 0 ? (c.citationCount / totalCurrent) * 100 : null
      const citationSharePrior = showDelta && citePrior !== null && totalPrior > 0
        ? (citePrior / totalPrior) * 100
        : null
      const citationShareDelta = citationShare !== null && citationSharePrior !== null
        ? citationShare - citationSharePrior
        : null
      return {
        domain: c.domain,
        articleTitle: c.title,
        url: c.url,
        citationShare,
        citationShareDelta,
        competitorsMentioned: c.competitorBrandNames.join(', ') || null,
        pageType: c.classification,
        promptIds: urlPromptIds(coverage, c.urlKey),
      }
    })
}

const PAGE_TYPES: Record<string, string> = {
  ARTICLE: 'Article', LISTICLE: 'Listicle', UGC: 'Forum', FORUM: 'Forum', PRODUCT_PAGE: 'Product page',
  CATEGORY_PAGE: 'Category page', HOW_TO_GUIDE: 'How-to guide', HOMEPAGE: 'Homepage',
}

/** Display name for a Peec URL `classification`; unknown values are Title Cased, a missing or blank one is null (`--`). */
export function humanisePageType(classification: string | null | undefined): string | null {
  const raw = (classification ?? '').trim()
  if (!raw) return null
  return PAGE_TYPES[raw.toUpperCase()]
    ?? raw.toLowerCase().split(/[_\s]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}

/**
 * Overview gap-table rows, the only shape that crosses to the client table (D-15): clients get the
 * prompt count alone; internal users also get the prompt texts. Prompt ids never cross. When the
 * coverage walk failed or came back incomplete the count is null (`--`), not a short count (D-21).
 */
export function toCompetitorGapRows(
  rows: BrandAbsentRow[],
  opts: {
    audience: ReportAudience
    coverageOk: boolean
    promptTextById: Map<string, string>
    /** Only these prompts count (M6): the walk can cite prompts no longer tracked, which have no text. */
    trackedPromptIds: Set<string>
  },
): CompetitorGapRow[] {
  return rows.map((r) => {
    const ids = r.promptIds.filter((id) => opts.trackedPromptIds.has(id))
    const row: CompetitorGapRow = {
      domain: r.domain,
      articleTitle: r.articleTitle,
      url: r.url,
      citationShare: r.citationShare,
      citationShareDelta: r.citationShareDelta,
      competitorsMentioned: r.competitorsMentioned,
      pageTypeLabel: humanisePageType(r.pageType),
      promptCount: opts.coverageOk ? ids.length : null,
    }
    if (opts.audience === 'internal' && opts.coverageOk) {
      row.prompts = ids.map((id) => opts.promptTextById.get(id)).filter((t): t is string => !!t)
    }
    return row
  })
}
