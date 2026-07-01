'use server'

import { revalidateTag } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { clients } from '@/lib/db/schema'
import { getClientBySlug, getSectionTemplate } from '@/lib/db/queries'
import { auth } from '@/auth'
import { canEditDashboard } from '@/lib/dashboard/permissions'
import { applyFreeze, applyPinVersion, applyUnfreeze, computeFreeze } from '@/lib/report-sections/mutations'
import type { ReportSectionConfig } from '@/lib/report-sections/types'

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
  return persist(slug, applyPinVersion(a.cfg!, section, partId, version))
}

export async function freezeSection(slug: string, section: string): Promise<Result> {
  const a = await authorize(slug)
  if (!a.ok) return a
  const template = await getSectionTemplate(section)
  if (!template) return { ok: false, error: `no template for ${section}` }
  const snapshot = computeFreeze(template, a.cfg![section])
  return persist(slug, applyFreeze(a.cfg!, section, snapshot))
}

export async function unfreezeSection(slug: string, section: string): Promise<Result> {
  const a = await authorize(slug)
  if (!a.ok) return a
  return persist(slug, applyUnfreeze(a.cfg!, section))
}
