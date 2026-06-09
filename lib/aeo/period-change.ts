// lib/aeo/period-change.ts
import type { PeriodMover, PromptOpportunity, PeriodChange } from './types'

export type BrandPoint = { name: string; visibility: number; isYou: boolean }
export type DomainPoint = { domain: string; share: number }
export type PromptPoint = { text: string; visibility: number }

function biggestAbsMover(current: { label: string; value: number }[], prior: Map<string, number>): PeriodMover {
  let best: PeriodMover = null
  for (const c of current) {
    const p = prior.get(c.label)
    if (p === undefined) continue
    const delta = c.value - p
    if (best === null || Math.abs(delta) > Math.abs(best.delta)) best = { label: c.label, delta }
  }
  return best
}

export function visibilityMover(curr: BrandPoint[], prior: BrandPoint[]): PeriodMover {
  const priorMap = new Map(prior.map((b) => [b.name, b.visibility]))
  return biggestAbsMover(curr.map((b) => ({ label: b.name, value: b.visibility })), priorMap)
}

export function competitorShift(curr: BrandPoint[], prior: BrandPoint[]): PeriodMover {
  const priorMap = new Map(prior.map((b) => [b.name, b.visibility]))
  let best: PeriodMover = null
  for (const c of curr.filter((b) => !b.isYou)) {
    const p = priorMap.get(c.name)
    if (p === undefined) continue
    const delta = c.visibility - p // largest GAIN (rising threat)
    if (best === null || delta > best.delta) best = { label: c.name, delta }
  }
  return best
}

export function domainMover(curr: DomainPoint[], prior: DomainPoint[]): PeriodMover {
  const priorMap = new Map(prior.map((d) => [d.domain, d.share]))
  return biggestAbsMover(curr.map((d) => ({ label: d.domain, value: d.share })), priorMap)
}

export function promptOpportunity(prompts: PromptPoint[]): PromptOpportunity {
  const eligible = prompts.filter((p) => p.text)
  if (eligible.length === 0) return null
  let worst = eligible[0] // lowest current visibility = most headroom
  for (const p of eligible) if (p.visibility < worst.visibility) worst = p
  return { text: worst.text, visibility: worst.visibility }
}

export function buildPeriodChange(args: {
  brandsCurrent: BrandPoint[]
  brandsPrior: BrandPoint[]
  domainsCurrent: DomainPoint[]
  domainsPrior: DomainPoint[]
  prompts: PromptPoint[]
}): PeriodChange {
  return {
    visibilityMover: visibilityMover(args.brandsCurrent, args.brandsPrior),
    competitorShift: competitorShift(args.brandsCurrent, args.brandsPrior),
    domainMover:     domainMover(args.domainsCurrent, args.domainsPrior),
    promptOpportunity: promptOpportunity(args.prompts),
  }
}
