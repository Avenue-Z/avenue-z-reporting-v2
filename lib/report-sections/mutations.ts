// lib/report-sections/mutations.ts
// Pure, synchronous config transforms for report-section overrides. Kept out of
// the `'use server'` action file so (a) they can be unit-tested without a DB and
// (b) they don't violate Next.js's rule that Server Action modules export only
// async functions. Mirrors the config-mutations.ts / dashboard.ts split.
import { parseReportSectionConfig } from './validate'
import { resolveSection } from './resolve'
import { assertReferencedPinsPublished } from './registry'
import type { PartRegistry, ReportSectionConfig, ResolvedPart, SectionOverride, SectionSnapshot, SectionTemplate } from './types'

/** When re-saving a section override, preserve a prior sharedParts opt-in if the new
 *  payload doesn't set one. An explicit sharedParts in `next` wins. Keeps a body-only
 *  edit from dropping a client's commentary (shared-part) opt-in. */
export function mergePreservingSharedParts(
  prev: SectionOverride | undefined,
  next: SectionOverride,
): SectionOverride {
  const sharedParts = next.sharedParts ?? prev?.sharedParts
  return sharedParts === undefined ? next : { ...next, sharedParts }
}

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

/**
 * Returns violation strings if any pin in computeFreeze(template, override).order
 * references an unpublished version. Empty array means safe to freeze.
 */
export function freezeViolations(
  template: SectionTemplate,
  override: SectionOverride | undefined,
  registry: PartRegistry<unknown>,
): string[] {
  const snapshot = computeFreeze(template, override)
  return assertReferencedPinsPublished(registry, snapshot.order)
}

/**
 * Returns violation strings if any pin in the computed next template references
 * an unpublished version. Empty array means safe to promote.
 */
export function promotionViolations(next: SectionTemplate, registry: PartRegistry<unknown>): string[] {
  return assertReferencedPinsPublished(registry, next.order)
}

/**
 * Validates a single section's raw override against its registry + template ids.
 * Returns a full ReportSectionConfig keyed on the section slug so callers can
 * extract parsedConfig[section] for the single section's SectionOverride.
 *
 * Accepts a per-section templateIds: string[] for ergonomics and internally
 * calls parseReportSectionConfig with the per-section Record shape it expects.
 */
export function validateSectionOverride(
  section: string,
  raw: unknown,
  registries: Record<string, PartRegistry<unknown>>,
  templateIds: string[],
  sharedReg: PartRegistry<unknown> = {},
): ReportSectionConfig {
  return parseReportSectionConfig({ [section]: raw }, registries, { [section]: templateIds }, sharedReg)
}

/**
 * Returns a new SectionTemplate with version pins moved for each partId present
 * in sourceResolved. Labels/thresholds are lifted only when opts.labels/opts.thresholds
 * are set. Does not mutate inputs. Backward moves are allowed. PartIds not present
 * in sourceResolved are ignored (template unchanged for those parts).
 */
export function computePromotion(
  template: SectionTemplate,
  sourceResolved: ResolvedPart[],
  partIds: string[],
  opts: { labels?: boolean; thresholds?: boolean },
): SectionTemplate {
  const bySource = new Map(sourceResolved.map((r) => [r.id, r]))
  const order = template.order.map((pin) => {
    const src = partIds.includes(pin.id) ? bySource.get(pin.id) : undefined
    return src ? { id: pin.id, version: src.version } : pin
  })
  const labels = { ...template.labels }
  const thresholds = { ...template.thresholds }
  for (const id of partIds) {
    const src = bySource.get(id)
    if (!src) continue
    if (opts.labels) labels[id] = src.label
    if (opts.thresholds && src.threshold !== undefined) thresholds[id] = src.threshold
  }
  return { order, labels, thresholds }
}
