// lib/aeo/cited-urls.ts
// Shared row shape for the AEO Overview v2 Cited Sources URL table, and the join of
// a current and a prior window into ranked rows. Pure: no vendor calls.

export type SourceType = 'own' | 'competitor' | 'third_party'
type Provider = 'peec' | 'profound'

export type UrlWindowRow = {
  key: string
  url: string
  title: string | null
  sourceType: SourceType
  sourceLabel: string
  pageType: string | null
  answersUsing: number
  citations: number
}

export type UrlWindow = {
  rows: UrlWindowRow[]
  totalAnswers: number
  totalCitations: number
  complete: boolean
}

export type CitedUrlRow = {
  rank: number
  key: string
  url: string
  title: string | null
  sourceType: SourceType
  sourceLabel: string
  pageType: string | null
  usedPct: number | null
  citationRate: number | null
  prior: { usedPct: number | null; citationRate: number | null } | null
}

export type CitedUrls = {
  provider: Provider
  rows: CitedUrlRow[]
  totalRows: number
  totalCitations: number
  compared: boolean
  hasPageType: boolean
  complete: boolean
  tooLong: boolean
}

export const URL_ROW_CAP = 500
// The one place the 92-day cutoff lives (open with Tina).
export const MAX_URL_WINDOW_DAYS = 92

// The one switch for the Page type column (open with Tina).
export function providerHasPageType(provider: Provider): boolean {
  return provider === 'peec'
}

export type IsoWindow = { startDate: string; endDate: string }

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

// UTC midnight for a real calendar day, or NaN for anything malformed (e.g. 2026-13-45).
function utcDay(iso: string): number {
  if (!ISO_DAY.test(iso)) return NaN
  const [y, m, d] = iso.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d)
  return new Date(t).toISOString().slice(0, 10) === iso ? t : NaN
}

// Fails closed: a malformed or inverted window counts as too long, so it never reaches a vendor.
export function windowTooLong(w: IsoWindow): boolean {
  const start = utcDay(w.startDate)
  const end = utcDay(w.endDate)
  if (Number.isNaN(start) || Number.isNaN(end)) return true
  const days = Math.round((end - start) / 86_400_000) + 1
  return days < 1 || days > MAX_URL_WINDOW_DAYS
}

export function emptyCitedUrls(provider: Provider, opts?: { tooLong?: boolean }): CitedUrls {
  return {
    provider,
    rows: [],
    totalRows: 0,
    totalCitations: 0,
    compared: false,
    hasPageType: providerHasPageType(provider),
    complete: true,
    tooLong: opts?.tooLong ?? false,
  }
}

function metrics(r: UrlWindowRow, totalAnswers: number) {
  return {
    usedPct: totalAnswers > 0 ? (r.answersUsing / totalAnswers) * 100 : null,
    citationRate: r.answersUsing > 0 ? r.citations / r.answersUsing : null,
  }
}

export function joinWindows(
  provider: Provider,
  current: UrlWindow,
  prior: UrlWindow | null,
  opts?: { cap?: number },
): CitedUrls {
  const cap = opts?.cap ?? URL_ROW_CAP
  const priorByKey = new Map<string, UrlWindowRow>()
  if (prior) for (const r of prior.rows) priorByKey.set(r.key, r)

  const joined = current.rows.map((r) => {
    const p = priorByKey.get(r.key)
    return {
      key: r.key,
      url: r.url,
      title: r.title,
      sourceType: r.sourceType,
      sourceLabel: r.sourceLabel,
      pageType: r.pageType,
      citations: r.citations,
      ...metrics(r, current.totalAnswers),
      prior: p && prior ? metrics(p, prior.totalAnswers) : null,
    }
  })

  joined.sort((a, b) => {
    if (a.usedPct !== b.usedPct) {
      if (a.usedPct === null) return 1
      if (b.usedPct === null) return -1
      return b.usedPct - a.usedPct
    }
    if (a.citations !== b.citations) return b.citations - a.citations
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  })

  const ranked: CitedUrlRow[] = joined.map(({ citations: _c, ...rest }, i) => ({ rank: i + 1, ...rest }))
  const rows = ranked.filter((r, i) => i < cap || r.sourceType === 'own')

  return {
    provider,
    rows,
    totalRows: ranked.length,
    totalCitations: current.totalCitations,
    compared: prior !== null,
    hasPageType: providerHasPageType(provider),
    complete: current.complete && (prior?.complete ?? true),
    tooLong: false,
  }
}
