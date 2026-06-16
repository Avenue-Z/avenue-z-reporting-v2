/**
 * Pure derivations for the Content Impact GA4 sections.
 *
 * Kept separate from the RSC so the classification logic (§E decay vs.
 * compounding) is unit-testable without a GA4 round-trip. The component is
 * responsible for normalizing GA4 rows (paths/hosts) and supplying primitives.
 */

export type Trajectory =
  | 'Compounding URLs'
  | 'Stable URLs'
  | 'Decaying URLs'
  | 'High AI / Low Traffic'
  | 'High Traffic / No AI'
  | 'No Activity'

/**
 * Thresholds for the §E trajectory classifier. These are product judgment
 * calls, surfaced here so they are easy to tune:
 *  - UP/DOWN: period-over-period session change that counts as growth/decline.
 *  - LOW_TRAFFIC: at/below this many current sessions a cited page is "AI-cited
 *    but no human traffic yet".
 *  - HIGH_TRAFFIC: at/above this many current sessions an un-cited page is
 *    "popular but not AI-indexed".
 */
export const TRAJECTORY_THRESHOLDS = {
  UP: 0.1,
  DOWN: -0.1,
  LOW_TRAFFIC: 10,
  HIGH_TRAFFIC: 100,
} as const

export interface TrajectoryInput {
  /** Current-period sessions for the page. */
  cur: number
  /** Prior-period sessions for the page. */
  prior: number
  /** Whether the page is cited by any AI engine (Peec). */
  cited: boolean
}

/**
 * Classify a single owned page's trajectory from its current vs. prior sessions
 * and whether it earns AI citations. Buckets are mutually exclusive; the order
 * of checks defines precedence.
 */
export function classifyTrajectory({ cur, prior, cited }: TrajectoryInput): Trajectory {
  const { UP, DOWN, LOW_TRAFFIC, HIGH_TRAFFIC } = TRAJECTORY_THRESHOLDS

  // No traffic in either period and not cited → nothing happening.
  if (cur === 0 && prior === 0 && !cited) return 'No Activity'

  // pct change; treat 0→N as full growth, and a flat 0/0 as no change.
  const pct = prior > 0 ? (cur - prior) / prior : cur > 0 ? 1 : 0

  // Cited but barely any human traffic.
  if (cited && cur <= LOW_TRAFFIC) return 'High AI / Low Traffic'

  // Lots of traffic but no AI citations.
  if (!cited && cur >= HIGH_TRAFFIC) return 'High Traffic / No AI'

  // Growing and cited → the assets to protect/scale.
  if (pct > UP && cited) return 'Compounding URLs'

  // Declining and not earning citations.
  if (pct < DOWN && !cited) return 'Decaying URLs'

  // Everything else: roughly flat / mixed.
  return 'Stable URLs'
}

export const TRAJECTORY_LABELS: Trajectory[] = [
  'Compounding URLs',
  'Stable URLs',
  'Decaying URLs',
  'High AI / Low Traffic',
  'High Traffic / No AI',
  'No Activity',
]

/** Tally a set of pages into per-bucket counts. */
export function tallyTrajectories(items: TrajectoryInput[]): Record<Trajectory, number> {
  const counts = Object.fromEntries(
    TRAJECTORY_LABELS.map((l) => [l, 0]),
  ) as Record<Trajectory, number>
  for (const item of items) counts[classifyTrajectory(item)]++
  return counts
}
