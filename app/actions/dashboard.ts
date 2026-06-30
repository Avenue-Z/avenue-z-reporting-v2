'use server'

import { eq } from 'drizzle-orm'
import { unstable_cache, revalidateTag } from 'next/cache'
import { createHash, randomBytes } from 'node:crypto'
import { auth } from '@/auth'
import { db } from '@/lib/db/client'
import { clients, dashboardShares } from '@/lib/db/schema'
import { getClientBySlug, getCachedSmDimensionValues, getDashboardConfig, getDashboardShareForClient } from '@/lib/db/queries'
import { parseDashboardConfig } from '@/lib/dashboard/persistence'
import { canEditDashboard } from '@/lib/dashboard/permissions'
import { setBlockText, setLabelOverride } from '@/components/dashboard/config-mutations'
import { resolveSmApiKey } from '@/lib/dashboard/adapters/supermetrics'
import { smAccounts, smFieldsAndDimensions, type MetricOption, type AccountOption } from '@/lib/supermetrics/discovery'
import type { DashboardConfig, EditTarget } from '@/lib/dashboard/types'
import { resolveBlockNL } from '@/lib/dashboard/nl/resolve'
import { resolveAggregateNL } from '@/lib/dashboard/nl/aggregate-resolve'
import type { ResolutionResult } from '@/lib/dashboard/nl/types'
import type { AggregateResolutionResult } from '@/lib/dashboard/nl/aggregate-types'
import { parseDateRange } from '@/lib/ga4/client'
import { twFields, twDistinctValues, type TwFields } from '@/lib/triplewhale/discovery'

export type ProposeBlockInput = {
  source: 'supermetrics' | 'triplewhale' | 'aggregate'
  prompt: string // NL prompt for leaf sources; the formula for aggregate
  slug: string
}

/**
 * Save a client's configurable dashboard. Internal admins may edit any client;
 * client admins only their own. Validates the config before writing.
 */
export async function saveDashboardConfig(
  slug: string,
  config: DashboardConfig,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, slug)) {
    return { ok: false, error: 'forbidden' }
  }
  const parsed = parseDashboardConfig(config)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  await db
    .update(clients)
    .set({ dashboardConfig: parsed.config, updatedAt: new Date() })
    .where(eq(clients.slug, slug))

  // Bust the 'db'-tagged cache: getClientBySlug/getDashboardConfig persist for ~5 min
  // via cached(), so without this the next render (router.refresh()) re-reads the STALE
  // config and the edit appears to revert — a deleted block reappears, an added block
  // vanishes — until the TTL expires. Targeted by tag: the SM/TW query Data Cache is
  // untagged, so this does not purge it (no cold re-resolution of chart data).
  revalidateTag('db', 'max')
  return { ok: true }
}

/**
 * Resolve a natural-language block request into a proposal (or clarify/error)
 * via the server-side resolvers. Same edit-permission gate as save.
 */
export async function proposeBlock(
  input: ProposeBlockInput,
): Promise<ResolutionResult | AggregateResolutionResult> {
  const session = await auth()
  if (!session?.user) return { kind: 'error', error: 'unauthenticated' }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, input.slug)) {
    return { kind: 'error', error: 'forbidden' }
  }
  // formula and shopify are manual-only: there is no NL/AI proposer path for
  // either, so reject them server-side even if a caller force-casts the source.
  const widenedSource: string = input.source
  if (widenedSource === 'formula' || widenedSource === 'shopify') {
    return { kind: 'error', error: 'unsupported-source' }
  }
  const actAsEmail = session.user.email ?? ''
  if (input.source === 'aggregate') {
    return resolveAggregateNL({ formula: input.prompt, actAsEmail })
  }
  return resolveBlockNL({ source: input.source, prompt: input.prompt, actAsEmail })
}

const keyHash = (apiKey: string) => createHash('sha256').update(apiKey).digest('hex').slice(0, 16)

async function resolveKeyForSlug(slug: string): Promise<string | undefined> {
  const client = await getClientBySlug(slug)
  return resolveSmApiKey(client?.smApiKeyEnvVar, process.env)
}

/** Live Supermetrics metrics + dimensions for a data source, from a single
 *  /query/fields fetch. Same edit gate as save; cached per (dsId, key). */
export async function getSmFields(
  slug: string,
  dsId: string,
): Promise<{ ok: true; metrics: MetricOption[]; dimensions: MetricOption[] } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, slug)) return { ok: false, error: 'forbidden' }
  const apiKey = await resolveKeyForSlug(slug)
  if (!apiKey) return { ok: false, error: 'disconnected' }
  try {
    const { metrics, dimensions } = await unstable_cache(
      () => smFieldsAndDimensions(apiKey, dsId),
      ['sm-fields', dsId, keyHash(apiKey)],
      { revalidate: 3600 },
    )()
    return { ok: true, metrics, dimensions }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'discovery failed' }
  }
}

/** Live Supermetrics account options for a data source. Same edit gate as save; cached per (dsId, key). */
export async function getAccountOptions(
  slug: string,
  dsId: string,
): Promise<{ ok: true; options: AccountOption[] } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, slug)) return { ok: false, error: 'forbidden' }
  const apiKey = await resolveKeyForSlug(slug)
  if (!apiKey) return { ok: false, error: 'disconnected' }
  try {
    const options = await unstable_cache(
      () => smAccounts(apiKey, dsId),
      ['sm-accounts', dsId, keyHash(apiKey)],
      { revalidate: 3600 },
    )()
    return { ok: true, options }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'discovery failed' }
  }
}

/** Live TripleWhale field discovery (numeric metrics + string dimensions) for a client's shop. */
export async function getTwFields(
  slug: string,
): Promise<{ ok: true; fields: TwFields } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, slug)) return { ok: false, error: 'forbidden' }
  const apiKey = process.env.TRIPLE_WHALE_API_KEY
  const shopId = (await getClientBySlug(slug))?.triplewhaleShopId
  if (!apiKey || !shopId) return { ok: false, error: 'disconnected' }
  const { startDate, endDate } = parseDateRange('last_30_days')
  try {
    const fields = await unstable_cache(
      () => twFields(apiKey, shopId, { startDate, endDate }),
      ['tw-fields', shopId, keyHash(apiKey)],
      { revalidate: 3600 },
    )()
    return { ok: true, fields }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'discovery failed' }
  }
}

/** Live distinct values for a TripleWhale dimension column, for a client's shop. */
export async function getTwDimensionValues(
  slug: string,
  column: string,
): Promise<{ ok: true; values: string[] } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, slug)) return { ok: false, error: 'forbidden' }
  const apiKey = process.env.TRIPLE_WHALE_API_KEY
  const shopId = (await getClientBySlug(slug))?.triplewhaleShopId
  if (!apiKey || !shopId) return { ok: false, error: 'disconnected' }
  const { startDate, endDate } = parseDateRange('last_30_days')
  try {
    const values = await unstable_cache(
      () => twDistinctValues(apiKey, shopId, column, { startDate, endDate }),
      ['tw-dim', shopId, column, keyHash(apiKey)],
      { revalidate: 3600 },
    )()
    return { ok: true, values }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'discovery failed' }
  }
}

/** Cached SM dimension values (DB read, instant). Population happens out-of-band
 *  via /api/discovery/sm-dimension-values. `cached:false` means not yet populated. */
export async function getSmDimensionValues(
  slug: string,
  dsId: string,
  account: string,
  column: string,
): Promise<{ ok: true; values: string[]; fetchedAt: string | null; cached: boolean } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, slug)) return { ok: false, error: 'forbidden' }
  try {
    const row = await getCachedSmDimensionValues(slug, dsId, account, column)
    if (!row) return { ok: true, values: [], fetchedAt: null, cached: false }
    return { ok: true, values: row.values, fetchedAt: row.fetchedAt.toISOString(), cached: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'cache read failed' }
  }
}

/**
 * Inline copy edit: patch a single block's `name` or `narrativeBody` and persist.
 * Authorization + validation happen inside saveDashboardConfig (which this calls),
 * so it shares the exact edit-permission gate as every other dashboard mutation.
 */
export async function updateBlockText(
  slug: string,
  blockId: string,
  field: 'name' | 'narrativeBody',
  value: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const next = field === 'name' ? value.trim() : value
  if (field === 'name' && next === '') return { ok: false, error: 'empty-name' }
  const config = await getDashboardConfig(slug)
  if (!config) return { ok: false, error: 'no-config' }
  return saveDashboardConfig(slug, setBlockText(config, blockId, field, next))
}

/**
 * Inline dimension-label edit: set/clear a dashboard-wide label override and persist.
 * Authorization + validation are delegated to saveDashboardConfig.
 */
export async function updateLabelOverride(
  slug: string,
  target: Extract<EditTarget, { kind: 'labelValue' | 'labelDim' }>,
  value: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = await getDashboardConfig(slug)
  if (!config) return { ok: false, error: 'no-config' }
  return saveDashboardConfig(slug, setLabelOverride(config, target, value))
}

/**
 * Create or update the single public share link for a client's dashboard. One row per
 * client (clientSlug unique): the token is minted once and kept stable across re-saves
 * so an already-distributed link keeps working. Edit-gated. expiryDays 0 = never expires.
 */
export async function saveDashboardShare(
  slug: string,
  input: { title: string; expiryDays: number; blockIds: string[] },
): Promise<{ ok: true; token: string; url: string } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, slug)) return { ok: false, error: 'forbidden' }

  const title = input.title.trim()
  if (!title) return { ok: false, error: 'A dashboard title is required.' }
  if (!Array.isArray(input.blockIds) || input.blockIds.length === 0) {
    return { ok: false, error: 'Select at least one block to share.' }
  }
  const days = Number.isFinite(input.expiryDays) && input.expiryDays > 0 ? Math.floor(input.expiryDays) : 0
  const expiresAt = days > 0 ? new Date(Date.now() + days * 86_400_000) : null

  // Reuse the existing token (stable link) or mint a new URL-safe one.
  const existing = (await db.select({ token: dashboardShares.token }).from(dashboardShares).where(eq(dashboardShares.clientSlug, slug)).limit(1))[0]
  const token = existing?.token ?? randomBytes(18).toString('base64url')

  await db
    .insert(dashboardShares)
    .values({ token, clientSlug: slug, title, blockIds: input.blockIds, expiresAt })
    .onConflictDoUpdate({
      target: dashboardShares.clientSlug,
      set: { token, title, blockIds: input.blockIds, expiresAt, updatedAt: new Date() },
    })

  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '').replace(/\/$/, '')
  return { ok: true, token, url: `${base}/share/${token}` }
}

/** Load the existing share for a client (to prefill the Share dialog). Edit-gated. */
export async function loadDashboardShare(
  slug: string,
): Promise<{ ok: true; share: { token: string; title: string; blockIds: string[] } | null } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, slug)) return { ok: false, error: 'forbidden' }
  const s = await getDashboardShareForClient(slug)
  return { ok: true, share: s ? { token: s.token, title: s.title, blockIds: s.blockIds } : null }
}
