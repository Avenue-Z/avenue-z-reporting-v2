// The pin check (spec docs/superpowers/specs/2026-11-24-os-design-past-months.md, section 3): a month before a client's
// designFrom draws each kit version as the version it wraps, so a kit pin is safe only over exactly that version. Called by
// the private pin script before any write. Pure: compares what the client resolves today (the environment's template row,
// or the code template, plus the override) with what it would resolve after.
import { resolveSection } from '@/lib/report-sections/resolve'
import type { PartPin, SectionOverride, SectionTemplate } from '@/lib/report-sections/types'
import { KIT_WRAPS, SHARED_KIT_WRAPS } from './kit-wraps'

type Wraps = typeof KIT_WRAPS

function problems(wraps: Wraps, before: Map<string, number>, after: Iterable<[string, number]>): string[] {
  const out: string[] = []
  for (const [id, version] of after) {
    const wrapped = wraps[id]?.[version]
    if (wrapped === undefined) continue // not a kit version
    const was = before.get(id)
    if (was === version) continue // already pinned at this kit version
    if (was === wrapped) continue
    const drew = was === undefined ? 'nothing' : `@${was}`
    out.push(`${id}@${version} wraps @${wrapped}, but the client draws ${drew} today, so a month before designFrom would change`)
  }
  return out
}

/** One plain sentence per kit pin in `after` that does not replace exactly the version it wraps. */
export function kitPinProblems(template: SectionTemplate, before: SectionOverride | undefined, after: SectionOverride | undefined): string[] {
  const was = new Map(resolveSection(template, before).map((r) => [r.id, r.version] as const))
  return problems(KIT_WRAPS, was, resolveSection(template, after).map((r) => [r.id, r.version] as [string, number]))
}

/** The same for the shared boxes (`sharedParts` on the base 'organic-social' key). */
export function sharedKitPinProblems(before: PartPin[] | undefined, after: PartPin[] | undefined): string[] {
  const was = new Map((before ?? []).map((p) => [p.id, p.version] as const))
  return problems(SHARED_KIT_WRAPS, was, (after ?? []).map((p) => [p.id, p.version] as [string, number]))
}
