// lib/peec/slope-chart.ts
//
// FB-038: Pure derivation for the Content Impact §E ranked slope chart
// "Which pages are gaining momentum and which are losing it?".
//
// Caller pre-aggregates per-path / per-URL values for all 3 metrics x 2
// periods (current + prior). This helper picks the right source map for the
// active metric, drops (0, 0) pages, ranks by absolute delta, caps to top 15,
// and assigns a direction (gainer / loser / flat) for line coloring.
//
// All data is sourced from variables already in scope at the §E mount point
// in content-impact.tsx; this file does no fetching.

import { labelFromPath } from '@/lib/url'

export type SlopeMetric = 'ai-referral' | 'organic' | 'citation-share'

export type SlopeDirection = 'gainer' | 'loser' | 'flat'

export interface SlopePoint {
  url: string
  topic: string
  prior: number
  current: number
  delta: number
  direction: SlopeDirection
}

export interface SlopeChartInput {
  aiReferralByPath: Map<string, [number, number]>
  organicByPath: Map<string, [number, number]>
  citationShareByUrlKey: Map<string, { prior: number; current: number; url: string }>
}

export interface SlopeChartResult {
  points: SlopePoint[]
  metric: SlopeMetric
}

const TOP_N = 15

function classifyDirection(prior: number, current: number): SlopeDirection {
  if (current > prior) return 'gainer'
  if (current < prior) return 'loser'
  return 'flat'
}

function pointsFromPathMap(map: Map<string, [number, number]>): SlopePoint[] {
  const out: SlopePoint[] = []
  for (const [path, pair] of map) {
    const prior = pair[0]
    const current = pair[1]
    if (prior === 0 && current === 0) continue
    out.push({
      url: path,
      topic: labelFromPath(path),
      prior,
      current,
      delta: current - prior,
      direction: classifyDirection(prior, current),
    })
  }
  return out
}

function pointsFromCitationMap(
  map: Map<string, { prior: number; current: number; url: string }>,
): SlopePoint[] {
  const out: SlopePoint[] = []
  for (const entry of map.values()) {
    if (entry.prior === 0 && entry.current === 0) continue
    out.push({
      url: entry.url,
      topic: labelFromPath(entry.url),
      prior: entry.prior,
      current: entry.current,
      delta: entry.current - entry.prior,
      direction: classifyDirection(entry.prior, entry.current),
    })
  }
  return out
}

export function computeSlopeChart(
  metric: SlopeMetric,
  input: SlopeChartInput,
): SlopeChartResult {
  let raw: SlopePoint[]
  if (metric === 'ai-referral') raw = pointsFromPathMap(input.aiReferralByPath)
  else if (metric === 'organic') raw = pointsFromPathMap(input.organicByPath)
  else raw = pointsFromCitationMap(input.citationShareByUrlKey)

  raw.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  const points = raw.slice(0, TOP_N)
  return { points, metric }
}
