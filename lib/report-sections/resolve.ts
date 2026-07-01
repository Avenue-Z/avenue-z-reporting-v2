// lib/report-sections/resolve.ts
import type { PartPin, ResolvedPart, SectionOverride, SectionSnapshot, SectionTemplate } from './types'

// Base = template when unlocked, snapshot when frozen. Both carry pinned PartPins.
function selectBase(
  template: SectionTemplate,
  override: SectionOverride | undefined,
): { order: PartPin[]; labels: Record<string, string>; thresholds: Record<string, number>; frozen: boolean } {
  if (override?.frozen) {
    const s: SectionSnapshot = override.frozen
    return { order: s.order, labels: s.labels ?? {}, thresholds: s.thresholds ?? {}, frozen: true }
  }
  return { order: template.order, labels: template.labels ?? {}, thresholds: template.thresholds ?? {}, frozen: false }
}

export function resolveSection(
  template: SectionTemplate,
  override: SectionOverride | undefined,
): ResolvedPart[] {
  const base = selectBase(template, override)
  const o = override ?? {}
  const hidden = new Set(o.hidden ?? [])

  // 1. Working set: base ids + extraParts (new ids only), minus hidden. Dedupe by id, base wins.
  const baseVersion = new Map<string, number>()
  const orderIds: string[] = []
  for (const pin of base.order) {
    if (!baseVersion.has(pin.id)) {
      baseVersion.set(pin.id, pin.version)
      orderIds.push(pin.id)
    }
  }
  const extraVersion = new Map<string, number>()
  const extraIds: string[] = []
  for (const pin of o.extraParts ?? []) {
    if (baseVersion.has(pin.id) || extraVersion.has(pin.id)) continue // base wins; dedupe
    extraVersion.set(pin.id, pin.version)
    extraIds.push(pin.id)
  }
  const inWorkingSet = (id: string) => (baseVersion.has(id) || extraVersion.has(id)) && !hidden.has(id)

  // 2. Version resolution per id. Frozen base is NOT subject to override.versions.
  const resolveVersion = (id: string): number => {
    if (!base.frozen && o.versions && id in o.versions) return o.versions[id]
    return baseVersion.has(id) ? baseVersion.get(id)! : extraVersion.get(id)!
  }

  // 3. Priority pass over override.order (ids in working set only, first occurrence).
  const emitted: string[] = []
  const seen = new Set<string>()
  for (const id of o.order ?? []) {
    if (inWorkingSet(id) && !seen.has(id)) {
      seen.add(id)
      emitted.push(id)
    }
  }
  // 4. Remainder in base-relative order (template ids, then un-ordered extras).
  for (const id of [...orderIds, ...extraIds]) {
    if (inWorkingSet(id) && !seen.has(id)) {
      seen.add(id)
      emitted.push(id)
    }
  }

  // 5. Labels/thresholds layer override over base default; label falls back to id.
  return emitted.map((id) => {
    const label = o.labels?.[id] ?? base.labels[id] ?? id
    const threshold = o.thresholds?.[id] ?? base.thresholds[id]
    const out: ResolvedPart = { id, version: resolveVersion(id), label }
    if (threshold !== undefined) out.threshold = threshold
    return out
  })
}
