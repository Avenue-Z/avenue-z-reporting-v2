'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath, unstable_cache } from 'next/cache'
import { createHash } from 'node:crypto'
import { auth } from '@/auth'
import { db } from '@/lib/db/client'
import { clients } from '@/lib/db/schema'
import { getClientBySlug } from '@/lib/db/queries'
import { parseDashboardConfig } from '@/lib/dashboard/persistence'
import { canEditDashboard } from '@/lib/dashboard/permissions'
import { resolveSmApiKey } from '@/lib/dashboard/adapters/supermetrics'
import { smFields, smAccounts, smDimensions, smDimensionValues, type MetricOption, type AccountOption } from '@/lib/supermetrics/discovery'
import type { DashboardConfig } from '@/lib/dashboard/types'
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

  revalidatePath('/', 'layout')
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

/** Live Supermetrics metric options for a data source. Same edit gate as save; cached per (dsId, key). */
export async function getMetricOptions(
  slug: string,
  dsId: string,
): Promise<{ ok: true; options: MetricOption[] } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, slug)) return { ok: false, error: 'forbidden' }
  const apiKey = await resolveKeyForSlug(slug)
  if (!apiKey) return { ok: false, error: 'disconnected' }
  try {
    const options = await unstable_cache(
      () => smFields(apiKey, dsId),
      ['sm-fields', dsId, keyHash(apiKey)],
      { revalidate: 3600 },
    )()
    return { ok: true, options }
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

/** Live Supermetrics dimension options for a data source. Same edit gate as save; cached per (dsId, key). */
export async function getSmDimensions(
  slug: string,
  dsId: string,
): Promise<{ ok: true; options: MetricOption[] } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, slug)) return { ok: false, error: 'forbidden' }
  const apiKey = await resolveKeyForSlug(slug)
  if (!apiKey) return { ok: false, error: 'disconnected' }
  try {
    const options = await unstable_cache(
      () => smDimensions(apiKey, dsId),
      ['sm-dimensions', dsId, keyHash(apiKey)],
      { revalidate: 3600 },
    )()
    return { ok: true, options }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'discovery failed' }
  }
}

/** Live distinct values for a Supermetrics dimension (per data source + account). */
export async function getSmDimensionValues(
  slug: string,
  dsId: string,
  account: string,
  column: string,
): Promise<{ ok: true; values: string[] } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, slug)) return { ok: false, error: 'forbidden' }
  const apiKey = await resolveKeyForSlug(slug)
  if (!apiKey) return { ok: false, error: 'disconnected' }
  const { startDate, endDate } = parseDateRange('last_30_days')
  try {
    const values = await unstable_cache(
      () => smDimensionValues(apiKey, dsId, account, column, { startDate, endDate }),
      ['sm-dim-values', dsId, account, column, keyHash(apiKey)],
      { revalidate: 3600 },
    )()
    return { ok: true, values }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'discovery failed' }
  }
}
