import { eq, sql } from 'drizzle-orm'
import { db } from '../lib/db/client'
import { clients, type ReportSlug } from '../lib/db/schema'

const BEGIN_HEALTH = {
  slug: 'begin-health',
  name: 'Begin Health',
  logoUrl: null,
  domain: null,
  ga4PropertyId: null,
  gscSiteUrl: null,
  hubspotTokenEnvVar: null,
  sfCsvFileId: null,
  sfPrevCsvFileId: null,
  sitebulbSheetId: null,
  peecCustomerProjectId: null,
  prProofSheetId: null,
  prProofColumnMap: null,
  contentCalendarSheetId: null,
  peecYourBrand: null,
  profoundCategoryId: null,
  prConfig: null,
  enabledReports: [
    'demand-overview',
    'peec-ai',
    'paid-media',
    'ga4',
    'inbound-funnel',
    'hubspot-performance',
    'request-a-report',
  ] as ReportSlug[],
  hiddenReports: [] as ReportSlug[],
}

async function main() {
  const existing = await db.select().from(clients).where(eq(clients.slug, BEGIN_HEALTH.slug))
  if (existing.length === 0) {
    await db.insert(clients).values({ ...BEGIN_HEALTH, updatedAt: new Date() })
    console.log('Inserted client: begin-health')
  } else {
    await db
      .update(clients)
      .set({
        name: BEGIN_HEALTH.name,
        enabledReports: BEGIN_HEALTH.enabledReports,
        hiddenReports: BEGIN_HEALTH.hiddenReports,
        updatedAt: new Date(),
      })
      .where(eq(clients.slug, BEGIN_HEALTH.slug))
    console.log('Updated client: begin-health (enabledReports / hiddenReports)')
  }

  const result = await db.execute(sql`
    UPDATE clients
       SET hidden_reports = array_append(hidden_reports, 'paid-media'),
           updated_at     = NOW()
     WHERE slug != ${BEGIN_HEALTH.slug}
       AND NOT ('paid-media' = ANY(hidden_reports))
  `)
  const count = (result as { rowCount?: number }).rowCount ?? 0
  console.log(`Hid 'paid-media' on ${count} other client(s).`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
