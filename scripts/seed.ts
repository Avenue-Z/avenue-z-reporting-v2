import { db } from '../lib/db/client'
import { clients, users, type PRConfig, type ReportSlug } from '../lib/db/schema'

type SeedClient = {
  slug: string
  name: string
  logoUrl: string | null
  domain: string | null
  ga4PropertyId: string | null
  gscSiteUrl: string | null
  hubspotTokenEnvVar: string | null
  sfCsvFileId: string | null
  sfPrevCsvFileId: string | null
  sitebulbSheetId: string | null
  peecCustomerProjectId: string | null
  prProofSheetId: string | null
  contentCalendarSheetId: string | null
  peecYourBrand: string | null
  prConfig: PRConfig | null
  enabledReports: ReportSlug[]
  hiddenReports: ReportSlug[]
  users: { email: string; role: 'INTERNAL_ADMIN' | 'INTERNAL_ANALYST' | 'CLIENT_ADMIN' | 'CLIENT_VIEWER' }[]
}

// Inline seed data — kept aligned with the deleted clients.config.ts and
// subsequent updates merged from main. DB is the source of truth after this runs.
const SEED: SeedClient[] = [
  {
    slug: 'avenue-z',
    name: 'Avenue Z',
    logoUrl: '/logos/AvenueZ_White.png',
    domain: 'avenuez.com',
    ga4PropertyId: 'properties/355114071',
    gscSiteUrl: 'sc-domain:avenuez.com',
    hubspotTokenEnvVar: 'HUBSPOT_ACCESS_TOKEN_AVENUE_Z',
    sfCsvFileId: '1ddlYbe_0wqadeqbIQVAsCt0F_9AOXSe9',
    sfPrevCsvFileId: null,
    sitebulbSheetId: '1cKW5k0aqeWEk3HVakIDpiCrSP_mMf5oxQW7HJOxqsiw',
    peecCustomerProjectId: 'or_043ae735-9397-48cf-a754-6e346a55f394',
    prProofSheetId: '1tcZZ3p0Syy_525xnyW0V8fXnB8No7jBFVoqjIzT1F8M',
    contentCalendarSheetId: '1-Ar5vGXLWHnO3qtbymFVsgGD6kpJxCZvGWUSK5NngyQ',
    peecYourBrand: 'Avenue Z',
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
      'ga4',
      'hubspot-performance',
      'inbound-funnel',
      'peec-ai',
      'request-a-report',
    ],
    hiddenReports: ['exec-summary'],
    users: [
      { email: 'nick@avenuez.com', role: 'INTERNAL_ADMIN' },
      { email: 'demo@avenuez.com', role: 'INTERNAL_ANALYST' },
    ],
  },
  {
    slug: 'renaissance',
    name: 'Renaissance',
    logoUrl: '/logos/RenaissanceBenefits.jpeg',
    domain: 'renaissancebenefits.com',
    ga4PropertyId: 'properties/310998391',
    gscSiteUrl: 'sc-domain:renaissancebenefits.com',
    hubspotTokenEnvVar: null,
    sfCsvFileId: '10zM21GXKKfkQTLoZg8Q99YC38oioRFEs',
    sfPrevCsvFileId: null,
    sitebulbSheetId: '1a-kMXV3VQg2_wo9r4xkSf3BRqw4ZLT8qBzdocrveNGs',
    peecCustomerProjectId: 'or_60dbe88c-7e3e-4cbc-b014-a8ae16912c86',
    prProofSheetId: '1tcZZ3p0Syy_525xnyW0V8fXnB8No7jBFVoqjIzT1F8M',
    contentCalendarSheetId: '1IkMw_7WUX5KBDVnHjPCLfTGRTqJBhVckvupVBIE240o',
    peecYourBrand: 'Renaissance',
    prConfig: null,
    enabledReports: [
      'peec-ai',
      'request-a-report',
    ],
    hiddenReports: [],
    users: [
      { email: 'thomas.chang@avenuez.com', role: 'INTERNAL_ADMIN' },
      { email: 'nick@avenuez.com', role: 'INTERNAL_ADMIN' },
    ],
  },
]

async function main() {
  for (const c of SEED) {
    const clientValues = {
      slug: c.slug,
      name: c.name,
      logoUrl: c.logoUrl,
      domain: c.domain,
      ga4PropertyId: c.ga4PropertyId,
      gscSiteUrl: c.gscSiteUrl,
      hubspotTokenEnvVar: c.hubspotTokenEnvVar,
      sfCsvFileId: c.sfCsvFileId,
      sfPrevCsvFileId: c.sfPrevCsvFileId,
      sitebulbSheetId: c.sitebulbSheetId,
      peecCustomerProjectId: c.peecCustomerProjectId,
      prProofSheetId: c.prProofSheetId,
      contentCalendarSheetId: c.contentCalendarSheetId,
      peecYourBrand: c.peecYourBrand,
      prConfig: c.prConfig,
      enabledReports: c.enabledReports,
      hiddenReports: c.hiddenReports,
      updatedAt: new Date(),
    }

    // Upsert: insert new client, or update existing row on slug conflict so
    // re-running picks up new columns / changed enabledReports.
    const [row] = await db
      .insert(clients)
      .values(clientValues)
      .onConflictDoUpdate({ target: clients.slug, set: clientValues })
      .returning()

    const clientId = row.id

    for (const u of c.users) {
      await db
        .insert(users)
        .values({
          email: u.email.toLowerCase(),
          role: u.role,
          clientId,
        })
        .onConflictDoUpdate({
          target: users.email,
          set: { role: u.role, clientId },
        })
    }
    console.log(`Seeded ${c.slug} with ${c.users.length} users.`)
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
