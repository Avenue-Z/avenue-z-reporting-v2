// lib/report-sections/registry.ts
import type { PartImpl, PartPin, PartRegistry, SectionOverride, SectionTemplate } from './types'

export function mergeRegistries<Ctx>(...regs: PartRegistry<Ctx>[]): PartRegistry<Ctx> {
  const out: PartRegistry<Ctx> = {}
  for (const reg of regs) {
    for (const [id, versions] of Object.entries(reg)) {
      out[id] = { ...(out[id] ?? {}), ...versions }
    }
  }
  return out
}

export function lookup<Ctx>(reg: PartRegistry<Ctx>, id: string, version: number): PartImpl<Ctx> | undefined {
  return reg[id]?.[version]
}

// Every pin the template pins, plus every pin captured in a client freeze snapshot.
export function collectReferencedPins(template: SectionTemplate, overrides: SectionOverride[]): PartPin[] {
  const pins: PartPin[] = [...template.order]
  for (const o of overrides) if (o.frozen) pins.push(...o.frozen.order)
  return pins
}

export function assertReferencedPinsPublished<Ctx>(reg: PartRegistry<Ctx>, pins: PartPin[]): string[] {
  const violations: string[] = []
  for (const { id, version } of pins) {
    const impl = reg[id]?.[version]
    if (!impl) violations.push(`missing part ${id}@${version}`)
    else if (!impl.published) violations.push(`referenced part ${id}@${version} is not published`)
  }
  return violations
}
