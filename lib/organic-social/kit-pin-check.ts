// The pin check (spec docs/superpowers/specs/2026-11-24-os-design-past-months.md, section 3): a month before a client's
// designFrom draws each kit version as the version it wraps, so a kit pin is safe only over exactly that version. Called by
// the private pin script before any write. Pure: compares what the client resolves today (the environment's template row,
// or the code template, plus the override) with what it would resolve after.
import { resolveSection } from '@/lib/report-sections/resolve'
import type { PartPin, PartRegistry, SectionOverride, SectionTemplate } from '@/lib/report-sections/types'
import { resolveSharedParts } from '@/components/report-sections/shared/parts/resolve'
import { KIT_WRAPS, SHARED_KIT_WRAPS } from './kit-wraps'

type Wraps = typeof KIT_WRAPS

/** Every version of each part the client draws today, in the order drawn. A part can be drawn more than once (a
 *  duplicate shared pin renders twice, resolveSharedParts), so each id maps to a list. */
function drawnById(parts: { id: string; version: number }[]): Map<string, number[]> {
  const out = new Map<string, number[]>()
  for (const p of parts) out.set(p.id, [...(out.get(p.id) ?? []), p.version])
  return out
}

/** A kit pin is fine only when everything the client draws today for that part is the kit version itself (already
 *  pinned) or the version it wraps. Drawing nothing, or any other version, is a problem. */
function problems(wraps: Wraps, before: Map<string, number[]>, after: Iterable<[string, number]>): string[] {
  const out: string[] = []
  for (const [id, version] of after) {
    const wrapped = wraps[id]?.[version]
    if (wrapped === undefined) continue // not a kit version
    const was = before.get(id) ?? []
    if (was.length > 0 && was.every((v) => v === version || v === wrapped)) continue
    const drew = was.length === 0 ? 'nothing' : [...new Set(was)].map((v) => `@${v}`).join(' and ')
    out.push(`${id}@${version} wraps @${wrapped}, but the client draws ${drew} today, so a month before designFrom would change`)
  }
  return out
}

/** One plain sentence per kit pin in `after` that does not replace exactly the version it wraps. */
export function kitPinProblems(template: SectionTemplate, before: SectionOverride | undefined, after: SectionOverride | undefined): string[] {
  const was = drawnById(resolveSection(template, before))
  return problems(KIT_WRAPS, was, resolveSection(template, after).map((r) => [r.id, r.version] as [string, number]))
}

/** The same for the shared boxes (`sharedParts` on the base 'organic-social' key). "Before" is read the way the app
 *  draws it, through resolveSharedParts with the shared registry (Paul, #512): a pin the registry does not know is
 *  dropped, and a duplicate counts every time. `reg` is the shared registry (SHARED_PARTS); the caller passes it so this
 *  file loads no component code. */
export function sharedKitPinProblems(before: PartPin[] | undefined, after: PartPin[] | undefined, reg: PartRegistry<unknown>): string[] {
  const was = drawnById(resolveSharedParts(before, reg))
  return problems(SHARED_KIT_WRAPS, was, (after ?? []).map((p) => [p.id, p.version] as [string, number]))
}
