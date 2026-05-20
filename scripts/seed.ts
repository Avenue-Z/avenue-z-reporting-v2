import { db } from '../lib/db/client'
import { clients, users, type PRConfig, type ReportSlug } from '../lib/db/schema'

type SeedClient = {
  slug: string
  name: string
  logoUrl: string | null
  ga4PropertyId: string | null
  gscSiteUrl: string | null
  hubspotTokenEnvVar: string | null
  prConfig: PRConfig | null
  enabledReports: ReportSlug[]
  hiddenReports: ReportSlug[]
  users: { email: string; role: 'INTERNAL_ADMIN' | 'INTERNAL_ANALYST' | 'CLIENT_ADMIN' | 'CLIENT_VIEWER' }[]
}

// Inline copy of clients.config.ts data at time of seed-script authoring.
// Source of truth shifts to DB after this runs.
const SEED: SeedClient[] = [
  {
    slug: 'avenue-z',
    name: 'Avenue Z',
    logoUrl: '/logos/AvenueZ_White.png',
    ga4PropertyId: process.env.GA4_PROPERTY_ID_AVENUE_Z ?? null,
    gscSiteUrl: process.env.GSC_SITE_URL_AVENUE_Z ?? null,
    hubspotTokenEnvVar: 'HUBSPOT_ACCESS_TOKEN_AVENUE_Z',
    prConfig: {
      keywords: ['"Avenue Z"', '"Avenue Z Agency"', '"Avenue Z marketing"', 'avenuez.com'],
      excludeKeywords: ['"avenue z-line"', '"avenue zone"', '"avenue zip"'],
      sourceLocationUri: ['http://en.wikipedia.org/wiki/United_States'],
      language: 'eng',
      dataTypes: ['news', 'pr', 'blog'],
      lookbackDays: 31,
    },
    enabledReports: [
      'demand-overview',
      'ai-summaries',
      'report-generator',
      'ga4',
      'hubspot-performance',
      'inbound-funnel',
      'peec-ai',
    ],
    hiddenReports: ['exec-summary'],
    users: [
      { email: 'nick@avenuez.com', role: 'INTERNAL_ADMIN' },
      { email: 'demo@avenuez.com', role: 'INTERNAL_ANALYST' },
    ],
  },
]

async function main() {
  for (const c of SEED) {
    const [row] = await db
      .insert(clients)
      .values({
        slug: c.slug,
        name: c.name,
        logoUrl: c.logoUrl,
        ga4PropertyId: c.ga4PropertyId,
        gscSiteUrl: c.gscSiteUrl,
        hubspotTokenEnvVar: c.hubspotTokenEnvVar,
        prConfig: c.prConfig,
        enabledReports: c.enabledReports,
        hiddenReports: c.hiddenReports,
      })
      .onConflictDoNothing({ target: clients.slug })
      .returning()

    const clientId = row?.id
    if (!clientId) {
      console.log(`Client ${c.slug} already exists, skipping users.`)
      continue
    }

    for (const u of c.users) {
      await db
        .insert(users)
        .values({
          email: u.email.toLowerCase(),
          role: u.role,
          clientId,
        })
        .onConflictDoNothing({ target: users.email })
    }
    console.log(`Seeded ${c.slug} with ${c.users.length} users.`)
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
