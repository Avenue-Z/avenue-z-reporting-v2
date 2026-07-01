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
  labels?: Record<string, string>
  thresholds?: Record<string, number>
}

export type ReportSectionConfig = Record<string, SectionOverride>

export type ResolvedPart = { id: string; version: number; label: string; threshold?: number }

export type PartImpl<Ctx> = {
  id: string
  version: number
  published: boolean
  defaultLabel: string
  // Pure synchronous presentational function — no await, no fetching.
  render: (ctx: Ctx, resolved: ResolvedPart) => React.ReactNode
}

// registry: id -> version -> impl
export type PartRegistry<Ctx> = Record<string, Record<number, PartImpl<Ctx>>>
