import type { TrackedPrompt } from './client'
import type { CoverageProjection } from './coverage-projection'
import type { AEOModel } from './models'

export type PromptGapStatus = 'not-cited' | 'lost' | 'declining'

export type PromptGapRow = {
  promptId: string
  text: string
  topic: string
  status: PromptGapStatus
  otherSites: { url: string; namesCompetitor: boolean }[]
  otherSitesMore: number
}

export type PromptGapsResult =
  | { ok: true; rows: PromptGapRow[] }
  | { ok: false; reason: 'incomplete' | 'unavailable' }

/** Average position worsening (in ranks) that counts as declining. Proposal (Q-2). */
export const DEFAULT_DECLINE_THRESHOLD = 1

const STATUS_ORDER: Record<PromptGapStatus, number> = { 'not-cited': 0, lost: 1, declining: 2 }

function ownedSet(cov: CoverageProjection, models: AEOModel[] | null): Set<string> {
  if (!models || models.length === 0) return new Set(cov.ownedPromptIds)
  const ids = new Set<string>()
  for (const m of models) for (const id of cov.ownedPromptIdsByModel[m] ?? []) ids.add(id)
  return ids
}

/** Mean position worsening over models ranked (defined, non-zero) in BOTH periods; null if none. */
function positionWorsening(p: TrackedPrompt, models: AEOModel[] | null): number | null {
  const keys = (models && models.length > 0
    ? models
    : (Object.keys(p.positionByModel) as AEOModel[])
  ).filter((m) => (p.positionByModel[m] ?? 0) > 0 && (p.priorPositionByModel[m] ?? 0) > 0)
  if (keys.length === 0) return null
  let now = 0
  let before = 0
  for (const m of keys) {
    now += p.positionByModel[m] as number
    before += p.priorPositionByModel[m] as number
  }
  return (now - before) / keys.length
}

export function computePromptGaps(input: {
  prompts: TrackedPrompt[]
  coverage: CoverageProjection
  coveragePrevious: CoverageProjection
  models: AEOModel[] | null
  declineThreshold: number
}): PromptGapsResult {
  const { prompts, coverage, coveragePrevious, models, declineThreshold } = input
  if (!coverage.complete || !coveragePrevious.complete) return { ok: false, reason: 'incomplete' }

  const ownedNow = ownedSet(coverage, models)
  const ownedBefore = ownedSet(coveragePrevious, models)
  const seen = new Set<string>()
  const rows: PromptGapRow[] = []

  for (const p of prompts) {
    if (!p.id || seen.has(p.id)) continue
    seen.add(p.id)
    let status: PromptGapStatus | null = null
    if (!ownedNow.has(p.id)) {
      status = ownedBefore.has(p.id) ? 'lost' : 'not-cited'
    } else {
      const w = positionWorsening(p, models)
      if (w !== null && w >= declineThreshold) status = 'declining'
    }
    if (!status) continue
    const other = coverage.otherSitesByPrompt[p.id]
    rows.push({
      promptId: p.id,
      text: p.text,
      topic: p.group,
      status,
      otherSites: (other?.urls ?? []).map((u) => ({ url: u.url, namesCompetitor: u.namesCompetitor })),
      otherSitesMore: other?.more ?? 0,
    })
  }

  rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.text.localeCompare(b.text))
  return { ok: true, rows }
}
