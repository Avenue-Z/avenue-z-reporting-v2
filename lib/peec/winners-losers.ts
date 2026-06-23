// lib/peec/winners-losers.ts
// FB-023: per Tina v2 CSV E11, the Biggest Winners + Biggest Losers cards on
// the AEO Overview tab must react to BOTH the page date range AND the active
// model filter. Two pure functions:
//
//   1. applyModelFilter(prompts, models) collapses each prompt's per-model
//      position maps (positionByModel + priorPositionByModel) into a flat
//      { position, priorPosition } pair, restricted to the selected models.
//      When models=null, averages across all models for which the prompt has
//      data. Prompts with no current-period data for any selected model are
//      dropped (we can't show a current rank if there isn't one).
//
//   2. computeWinnersLosers(flat) takes the collapsed prompts and splits them
//      into winners (rank improved vs prior, positive delta) and losers
//      (rank declined, negative delta), sorted by absolute delta, capped at
//      20 per side by default.

import type { TrackedPrompt } from './client'
import type { AEOModel } from './models'

export type PromptDelta = { text: string; rank: number; delta: number }

/** Output shape of applyModelFilter: a prompt collapsed to flat scalar metrics. */
export type FlatPrompt = {
  text: string
  position: number
  priorPosition: number | null
}

export function applyModelFilter(
  prompts: TrackedPrompt[],
  models: AEOModel[] | null,
): FlatPrompt[] {
  const out: FlatPrompt[] = []
  for (const p of prompts) {
    const cur  = filteredAvg(p.positionByModel,      models)
    const prev = filteredAvg(p.priorPositionByModel, models)
    if (cur === null) continue
    out.push({ text: p.text, position: cur, priorPosition: prev })
  }
  return out
}

function filteredAvg(
  byModel: Partial<Record<AEOModel, number>>,
  models: AEOModel[] | null,
): number | null {
  const entries = Object.entries(byModel) as [AEOModel, number][]
  const filtered = models === null
    ? entries
    : entries.filter(([m]) => models.includes(m))
  if (filtered.length === 0) return null
  return filtered.reduce((s, [, v]) => s + v, 0) / filtered.length
}

type Options = { limit?: number }

export function computeWinnersLosers(
  prompts: FlatPrompt[],
  opts: Options = {},
): { winners: PromptDelta[]; losers: PromptDelta[] } {
  const limit = opts.limit ?? 20

  const deltas: PromptDelta[] = []
  for (const p of prompts) {
    if (p.position <= 0) continue
    if (p.priorPosition == null || p.priorPosition <= 0) continue
    const rawDelta = p.priorPosition - p.position
    // EPS guard: subtraction of fractional inputs (e.g. 10.2 - 3.7) can land
    // a hair below the true half (6.499999…) and round the wrong way. A tiny
    // epsilon before Math.round restores the expected nearest-integer rounding
    // without affecting any larger delta in practice.
    const delta = Math.round(rawDelta + (rawDelta > 0 ? 1e-9 : -1e-9))
    if (delta === 0) continue
    deltas.push({
      text: p.text,
      rank: Math.round(p.position),
      delta,
    })
  }

  const winners = deltas
    .filter((d) => d.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, limit)

  const losers = deltas
    .filter((d) => d.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, limit)

  return { winners, losers }
}
