// lib/report-sections/mutations.ts
// Pure, synchronous config transforms for report-section overrides. Kept out of
// the `'use server'` action file so (a) they can be unit-tested without a DB and
// (b) they don't violate Next.js's rule that Server Action modules export only
// async functions. Mirrors the config-mutations.ts / dashboard.ts split.
import { resolveSection } from './resolve'
import type { ReportSectionConfig, SectionOverride, SectionSnapshot, SectionTemplate } from './types'

export function applyPinVersion(
  cfg: ReportSectionConfig,
  section: string,
  partId: string,
  version: number,
): ReportSectionConfig {
  const prev = cfg[section] ?? {}
  return { ...cfg, [section]: { ...prev, versions: { ...(prev.versions ?? {}), [partId]: version } } }
}

export function computeFreeze(
  template: SectionTemplate,
  override: SectionOverride | undefined,
): SectionSnapshot {
  const resolved = resolveSection(template, override)
  return {
    order: resolved.map((r) => ({ id: r.id, version: r.version })),
    labels: Object.fromEntries(resolved.map((r) => [r.id, r.label])),
    thresholds: Object.fromEntries(
      resolved.filter((r) => r.threshold !== undefined).map((r) => [r.id, r.threshold as number]),
    ),
  }
}

export function applyFreeze(
  cfg: ReportSectionConfig,
  section: string,
  snapshot: SectionSnapshot,
): ReportSectionConfig {
  const prev = cfg[section] ?? {}
  return { ...cfg, [section]: { ...prev, frozen: snapshot } }
}

export function applyUnfreeze(cfg: ReportSectionConfig, section: string): ReportSectionConfig {
  const prev = cfg[section] ?? {}
  const { frozen: _drop, ...rest } = prev
  return { ...cfg, [section]: rest }
}
