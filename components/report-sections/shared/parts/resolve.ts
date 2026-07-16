import { lookup } from '@/lib/report-sections/registry'
import type { PartPin, PartRegistry, ResolvedPart } from '@/lib/report-sections/types'

/** Which shared parts render for a client's view. Pure — no I/O, no component imports.
 *  Array order is render order; a pin not in `reg` is dropped. */
export function resolveSharedParts(
  sharedParts: PartPin[] | undefined,
  reg: PartRegistry<unknown>,
): ResolvedPart[] {
  return (sharedParts ?? [])
    .map((pin) => {
      const impl = lookup(reg, pin.id, pin.version)
      return impl ? { id: pin.id, version: pin.version, label: impl.defaultLabel } : null
    })
    .filter((r): r is ResolvedPart => r !== null)
}
