'use server'

import { revalidateTag } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { clients, sectionTemplates } from '@/lib/db/schema'
import { getClientBySlug, getSectionTemplate } from '@/lib/db/queries'
import { auth } from '@/auth'
import { canEditDashboard } from '@/lib/dashboard/permissions'
import { applyFreeze, applyPinVersion, applyUnfreeze, computeFreeze, computePromotion, freezeViolations, promotionViolations, validateSectionOverride } from '@/lib/report-sections/mutations'
import { REGISTRIES } from '@/lib/report-sections/registries'
import { lookup } from '@/lib/report-sections/registry'
import { resolveSection } from '@/lib/report-sections/resolve'
import type { PartRegistry, ReportSectionConfig } from '@/lib/report-sections/types'
import { SHARED_PARTS } from '@/components/report-sections/shared/parts/registry'

type Result = { ok: true } | { ok: false; error: string }

// The pure cores (applyPinVersion / computeFreeze / applyFreeze / applyUnfreeze)
// live in lib/report-sections/mutations.ts — unit-tested there, and kept out of
// this `'use server'` module (which may only export async functions).

async function authorize(slug: string): Promise<Result & { cfg?: ReportSectionConfig }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  // canEditDashboard's real signature is (role, clientSlug, targetSlug) — not
  // (session, client) as the brief assumed. role/clientSlug come off session.user.
  if (!canEditDashboard(session.user.role, session.user.clientSlug, slug)) {
    return { ok: false, error: 'forbidden' }
  }
  const client = await getClientBySlug(slug)
  if (!client) return { ok: false, error: 'client not found' }
  return { ok: true, cfg: client.reportSectionConfig ?? {} }
}

async function persist(slug: string, cfg: ReportSectionConfig): Promise<Result> {
  await db.update(clients).set({ reportSectionConfig: cfg, updatedAt: new Date() }).where(eq(clients.slug, slug))
  // Same targeted bust as saveDashboardConfig: getClientBySlug is cached ~5min via
  // the 'db' tag, so without this the next render re-reads the stale config.
  revalidateTag('db', 'max')
  return { ok: true }
}

export async function pinVersion(
  slug: string,
  section: string,
  partId: string,
  version: number,
): Promise<Result> {
  const a = await authorize(slug)
  if (!a.ok) return a
  if (!lookup(REGISTRIES[section], partId, version)) {
    return { ok: false, error: `unknown part ${partId}@${version}` }
  }
  return persist(slug, applyPinVersion(a.cfg!, section, partId, version))
}

export async function freezeSection(slug: string, section: string): Promise<Result> {
  const a = await authorize(slug)
  if (!a.ok) return a
  const template = await getSectionTemplate(section)
  if (!template) return { ok: false, error: `no template for ${section}` }
  const violations = freezeViolations(template, a.cfg![section], REGISTRIES[section])
  if (violations.length > 0) {
    return { ok: false, error: 'cannot freeze: unpublished version(s): ' + violations.join(', ') }
  }
  const snapshot = computeFreeze(template, a.cfg![section])
  return persist(slug, applyFreeze(a.cfg!, section, snapshot))
}

export async function unfreezeSection(slug: string, section: string): Promise<Result> {
  const a = await authorize(slug)
  if (!a.ok) return a
  return persist(slug, applyUnfreeze(a.cfg!, section))
}

/** Validates and persists a raw section-override payload for a client. */
export async function saveReportSectionConfig(slug: string, section: string, raw: unknown): Promise<Result> {
  const a = await authorize(slug)
  if (!a.ok) return a
  const template = await getSectionTemplate(section)
  const templateIds = (template?.order ?? []).map((p) => p.id)
  let parsedSection: ReportSectionConfig[string]
  try {
    parsedSection = validateSectionOverride(section, raw, REGISTRIES, templateIds, SHARED_PARTS as unknown as PartRegistry<unknown>)[section]
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  return persist(slug, { ...a.cfg!, [section]: parsedSection })
}

/**
 * Promotes one or more part version pins from a source client's resolved section
 * into the canonical section template. Restricted to INTERNAL_ADMIN.
 *
 * By default only the version pin is moved. Pass opts.labels/opts.thresholds to
 * also lift those fields from the source resolution.
 *
 * Logs old→new per part, then upserts the sectionTemplates row and busts the
 * 'db' cache tag.
 */
export async function promoteToTemplate(
  section: string,
  fromSlug: string,
  partIds: string[],
  opts: { labels?: boolean; thresholds?: boolean } = {},
): Promise<Result> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (session.user.role !== 'INTERNAL_ADMIN') return { ok: false, error: 'unauthorized' }

  const source = await getClientBySlug(fromSlug)
  if (!source) return { ok: false, error: 'source client not found' }

  const template = await getSectionTemplate(section)
  if (!template) return { ok: false, error: `no template for ${section}` }

  const sourceResolved = resolveSection(template, source.reportSectionConfig?.[section])
  const next = computePromotion(template, sourceResolved, partIds, opts)

  const violations = promotionViolations(next, REGISTRIES[section])
  if (violations.length > 0) {
    return { ok: false, error: 'cannot promote: unpublished version(s): ' + violations.join(', ') }
  }

  for (const id of partIds) {
    const before = template.order.find((p) => p.id === id)?.version
    const after = next.order.find((p) => p.id === id)?.version
    console.log(`[promote] ${section}/${id}: v${before ?? '?'} -> v${after ?? '?'} (from ${fromSlug})`)
  }

  await db
    .insert(sectionTemplates)
    .values({
      sectionSlug: section,
      composition: next,
      updatedBy: session.user.email ?? null,
      promotedFrom: fromSlug,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: sectionTemplates.sectionSlug,
      set: {
        composition: next,
        updatedBy: session.user.email ?? null,
        promotedFrom: fromSlug,
        updatedAt: new Date(),
      },
    })

  revalidateTag('db', 'max')
  return { ok: true }
}
