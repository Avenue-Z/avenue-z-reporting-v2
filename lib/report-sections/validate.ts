// lib/report-sections/validate.ts
import type { PartPin, PartRegistry, ReportSectionConfig, SectionOverride, SectionSnapshot, SectionTemplate } from './types'

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

function parsePin(raw: unknown, reg: PartRegistry<unknown>, requirePublished: boolean): PartPin {
  if (!isObj(raw) || typeof raw.id !== 'string' || !isInt(raw.version)) throw new Error(`invalid part pin: ${JSON.stringify(raw)}`)
  const impl = reg[raw.id]?.[raw.version]
  if (!impl) throw new Error(`unknown part ${raw.id}@${raw.version}`)
  if (requirePublished && !impl.published) throw new Error(`part ${raw.id}@${raw.version} is not published`)
  return { id: raw.id, version: raw.version }
}

function parseStrMap(raw: unknown, kind: string): Record<string, string> {
  if (raw === undefined) return {}
  if (!isObj(raw)) throw new Error(`invalid ${kind} map`)
  for (const v of Object.values(raw)) if (typeof v !== 'string') throw new Error(`invalid ${kind} value`)
  return raw as Record<string, string>
}
function parseNumMap(raw: unknown, kind: string): Record<string, number> {
  if (raw === undefined) return {}
  if (!isObj(raw)) throw new Error(`invalid ${kind} map`)
  for (const v of Object.values(raw)) if (typeof v !== 'number') throw new Error(`invalid ${kind} value`)
  return raw as Record<string, number>
}

export function parseSectionTemplate(raw: unknown, reg: PartRegistry<unknown>): SectionTemplate {
  if (!isObj(raw) || !Array.isArray(raw.order)) throw new Error('invalid template')
  return {
    order: raw.order.map((p) => parsePin(p, reg, true)),
    labels: parseStrMap(raw.labels, 'template.labels'),
    thresholds: parseNumMap(raw.thresholds, 'template.thresholds'),
  }
}

function parseSnapshot(raw: unknown, reg: PartRegistry<unknown>): SectionSnapshot {
  if (!isObj(raw) || !Array.isArray(raw.order)) throw new Error('invalid frozen snapshot')
  return {
    order: raw.order.map((p) => parsePin(p, reg, true)), // frozen pins must be published
    labels: parseStrMap(raw.labels, 'frozen.labels'),
    thresholds: parseNumMap(raw.thresholds, 'frozen.thresholds'),
  }
}

function parseVersions(raw: unknown, reg: PartRegistry<unknown>): Record<string, number> {
  if (raw === undefined) return {}
  if (!isObj(raw)) throw new Error('invalid versions map')
  const out: Record<string, number> = {}
  for (const [id, version] of Object.entries(raw)) {
    if (!isInt(version)) throw new Error(`invalid version for ${id}`)
    if (!reg[id]?.[version]) throw new Error(`unknown part ${id}@${version}`)
    out[id] = version // pins may reference unpublished (guinea-pig) versions
  }
  return out
}

function parseStrArray(raw: unknown, kind: string): string[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.some((s) => typeof s !== 'string')) throw new Error(`invalid ${kind}`)
  return raw as string[]
}

function parseOverride(raw: unknown, reg: PartRegistry<unknown>, templateIds: string[]): SectionOverride {
  if (!isObj(raw)) throw new Error('invalid section override')
  const out: SectionOverride = {}
  if (raw.frozen !== undefined) out.frozen = parseSnapshot(raw.frozen, reg)
  out.versions = parseVersions(raw.versions, reg)
  out.hidden = parseStrArray(raw.hidden, 'hidden')
  out.order = parseStrArray(raw.order, 'order')
  out.labels = parseStrMap(raw.labels, 'labels')
  out.thresholds = parseNumMap(raw.thresholds, 'thresholds')
  if (raw.extraParts !== undefined) {
    if (!Array.isArray(raw.extraParts)) throw new Error('invalid extraParts')
    out.extraParts = raw.extraParts.map((p) => {
      const pin = parsePin(p, reg, false) // bespoke pins may be unpublished until frozen/promoted
      if (templateIds.includes(pin.id)) throw new Error(`extraParts id "${pin.id}" already in template — use versions to re-version`)
      return pin
    })
  }
  return out
}

export function parseReportSectionConfig(
  raw: unknown,
  registries: Record<string, PartRegistry<unknown>>,
  templateIds: string[] = [],
): ReportSectionConfig {
  if (!isObj(raw)) throw new Error('invalid reportSectionConfig')
  const out: ReportSectionConfig = {}
  for (const [section, override] of Object.entries(raw)) {
    const reg = registries[section]
    if (!reg) throw new Error(`unknown section "${section}"`)
    out[section] = parseOverride(override, reg, templateIds)
  }
  return out
}
