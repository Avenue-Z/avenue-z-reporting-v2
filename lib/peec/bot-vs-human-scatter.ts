// lib/peec/bot-vs-human-scatter.ts
//
// FB-037: Pure derivation for the Content Impact section D scatter chart
// "AI Bot Traffic vs. Human Traffic".
//
// Input: per-path bot crawl counts (Peec /agent-analytics) and per-path human
// session counts (GA4, excluding AI-referred sessions). Both maps keyed by the
// canonical urlJoinKey of the path.
//
// Output: one scatter point per page that has any bot OR human traffic. Each
// point carries its quadrant assignment, derived from a median split on each
// axis. Boundary ties go to "low" (strict greater-than comparison).
//
// Pages with zero bot AND zero human traffic are dropped (not displayed).

export type BotVsHumanQuadrant =
  | 'high-bot-high-human'
  | 'low-bot-high-human'
  | 'high-bot-low-human'
  | 'low-bot-low-human'

export interface BotVsHumanScatterPoint {
  path: string
  bots: number
  humans: number
  quadrant: BotVsHumanQuadrant
}

export interface BotVsHumanScatterResult {
  points: BotVsHumanScatterPoint[]
  medianBot: number
  medianHuman: number
}

export interface BotVsHumanScatterInput {
  pathBots: Map<string, number>
  pathHumans: Map<string, number>
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function classifyQuadrant(bots: number, humans: number, medianBot: number, medianHuman: number): BotVsHumanQuadrant {
  const high_b = bots > medianBot
  const high_h = humans > medianHuman
  if (high_b && high_h) return 'high-bot-high-human'
  if (high_b && !high_h) return 'high-bot-low-human'
  if (!high_b && high_h) return 'low-bot-high-human'
  return 'low-bot-low-human'
}

export function computeBotVsHumanScatter(input: BotVsHumanScatterInput): BotVsHumanScatterResult {
  const allPaths = new Set<string>([...input.pathBots.keys(), ...input.pathHumans.keys()])
  const raw: { path: string; bots: number; humans: number }[] = []
  for (const path of allPaths) {
    const bots = input.pathBots.get(path) ?? 0
    const humans = input.pathHumans.get(path) ?? 0
    if (bots === 0 && humans === 0) continue
    raw.push({ path, bots, humans })
  }
  if (raw.length === 0) {
    return { points: [], medianBot: 0, medianHuman: 0 }
  }
  const medianBot = median(raw.map((r) => r.bots))
  const medianHuman = median(raw.map((r) => r.humans))
  const points: BotVsHumanScatterPoint[] = raw.map((r) => ({
    ...r,
    quadrant: classifyQuadrant(r.bots, r.humans, medianBot, medianHuman),
  }))
  return { points, medianBot, medianHuman }
}
