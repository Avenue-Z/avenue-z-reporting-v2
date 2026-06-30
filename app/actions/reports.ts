// app/actions/reports.ts
'use server'

import { revalidateTag } from 'next/cache'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/lib/db/client'
import { clients } from '@/lib/db/schema'
import { getClientBySlug } from '@/lib/db/queries'
import { isInternalStaff } from '@/lib/dashboard/permissions'
import { isValidShop } from '@/lib/shopify/oauth'
import { buildMetricSql } from '@/lib/triplewhale/queries'
import { twSql, twValue } from '@/lib/triplewhale/client'
import { parseDateRange } from '@/lib/ga4/client'
import { slugify } from '@/lib/dashboard/slugify'
import { buildStarterTemplate } from '@/lib/dashboard/starter-template'
import { parseDashboardConfig } from '@/lib/dashboard/persistence'

export type CreateReportResult =
  | { ok: true; url: string }
  | { ok: false; error: string }
  | { ok: false; code: 'exists'; url: string }

function dashUrl(slug: string): string {
  return `/dashboard/${slug}/configurable-dashboard`
}

/**
 * Self-service provisioning: validate a TripleWhale shop, upsert the client row
 * (never clobbering an existing dashboard), install the TW starter template, and
 * return the new dashboard URL. Internal staff only.
 */
export async function createClientReport(input: {
  name: string
  triplewhaleShopId: string
}): Promise<CreateReportResult> {
  // 1. Auth — internal staff only.
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'unauthenticated' }
  if (!isInternalStaff(session.user.role)) return { ok: false, error: 'forbidden' }

  // 2. Validate input.
  const name = input.name.trim()
  const shopId = input.triplewhaleShopId.trim().toLowerCase()
  if (!name) return { ok: false, error: 'Enter a client name.' }
  if (!isValidShop(shopId)) {
    return { ok: false, error: 'Shop ID must look like your-store.myshopify.com.' }
  }

  // 3. TripleWhale probe — confirm the shop is reachable under our TW account.
  const apiKey = process.env.TRIPLE_WHALE_API_KEY
  if (!apiKey) return { ok: false, error: 'TripleWhale is not configured on the server.' }
  const { startDate, endDate } = parseDateRange('last_30_days')
  const noData = { ok: false as const, error: 'No TripleWhale data for that shop ID. Check the shop and try again.' }
  try {
    // twSql returns [] (no throw) on an accepted-but-empty response, so a wrong/unknown
    // shop would otherwise pass. twValue(rows) is null when there's no data (≥ 0 passes,
    // so a valid shop with genuinely zero recent spend still provisions).
    const rows = await twSql({ apiKey, shopId, query: buildMetricSql('ad_spend'), startDate, endDate })
    if (twValue(rows) === null) return noData
  } catch {
    return noData
  }

  // 4. Resolve slug + 5. upsert guardrail.
  const slug = slugify(name)
  if (!slug) return { ok: false, error: 'Enter a client name with letters or numbers.' }

  const existing = await getClientBySlug(slug)
  if (existing?.dashboardConfig) {
    return { ok: false, code: 'exists', url: dashUrl(slug) }
  }

  // 6. Build + validate template, then write.
  const parsed = parseDashboardConfig(buildStarterTemplate())
  if (!parsed.ok) return { ok: false, error: `Template invalid: ${parsed.error}` }

  if (existing) {
    await db
      .update(clients)
      .set({ triplewhaleShopId: shopId, dashboardConfig: parsed.config, updatedAt: new Date() })
      .where(eq(clients.slug, slug))
  } else {
    // Brand-new row created purely to host a report → mark dashboardOnly so it stays
    // out of the /dashboard client lists (getVisibleClients). Filling an existing
    // (real) client's empty dashboard above must NOT set this — it stays a real client.
    await db.insert(clients).values({
      slug,
      name,
      triplewhaleShopId: shopId,
      dashboardOnly: true,
      dashboardConfig: parsed.config,
      enabledReports: [],
    })
  }

  revalidateTag('db', 'max')
  return { ok: true, url: dashUrl(slug) }
}
