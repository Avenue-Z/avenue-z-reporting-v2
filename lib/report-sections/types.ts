// lib/report-sections/types.ts
import type React from 'react'

export type PartPin = { id: string; version: number }

export type SectionTemplate = {
  order: PartPin[]
  labels: Record<string, string>
  thresholds: Record<string, number>
}

export type SectionSnapshot = {
  order: PartPin[]
  labels: Record<string, string>
  thresholds: Record<string, number>
}

export type SectionOverride = {
  frozen?: SectionSnapshot
  versions?: Record<string, number>
  order?: string[]
  hidden?: string[]
  extraParts?: PartPin[]
  sharedParts?: PartPin[]   // cross-section shared parts (commentary, …); validated against SHARED_PARTS
  labels?: Record<string, string>
  thresholds?: Record<string, number>
}

/** Per-client report config. A key is EITHER a section slug (body composition,
 *  looked up in REGISTRIES) OR a viewKey (shared-parts opt-in, e.g.
 *  'peec-ai:pr-influence') OR both (single-view sections where viewKey == slug).
 *  A viewKey-only key has no REGISTRIES entry — that is expected, not an orphan. */
export type ReportSectionConfig = Record<string, SectionOverride>

export type ResolvedPart = { id: string; version: number; label: string; threshold?: number }

export type PartImpl<Ctx> = {
  id: string
  version: number
  published: boolean
  defaultLabel: string
  // Pure synchronous function — no await, no fetching IN render itself. It MAY return a
  // <Suspense> wrapping an async child that fetches (organic-social streams per-section
  // this way); render stays sync and the fetch happens in the child behind the boundary.
  render: (ctx: Ctx, resolved: ResolvedPart) => React.ReactNode
}

// registry: id -> version -> impl
export type PartRegistry<Ctx> = Record<string, Record<number, PartImpl<Ctx>>>
