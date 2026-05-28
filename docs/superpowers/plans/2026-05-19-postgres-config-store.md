# Postgres Config Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `lib/clients.config.ts` with a Neon Postgres datastore accessed via Drizzle ORM, migrating ~25 consumers to async DB-backed helpers in a single cut-over PR.

**Architecture:** Two tables (`clients`, `users`) on Neon free tier, accessed via the `@neondatabase/serverless` HTTP driver and Drizzle ORM. Three same-named async helpers (`getClientBySlug`, `getClientByEmail`, `getAllClients`) replace the file-based exports, wrapped in `React.cache()` for per-render deduplication. All consumers add `await` and update the import path; `lib/clients.config.ts` is deleted in the same PR.

**Tech Stack:** Next.js 16 (App Router), Drizzle ORM, @neondatabase/serverless (HTTP), Neon free-tier Postgres, TypeScript. No automated test framework in this project — verification is `npx tsc --noEmit`, `npm run lint`, and manual browser smoke tests.

**Reference:** [Design spec](../specs/2026-05-19-postgres-config-store-design.md)

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `lib/db/schema.ts` | Drizzle table definitions + Drizzle relations + exported TS types (`Client`, `User`, `ClientRole`, `ReportSlug`, `PRConfig`) |
| `lib/db/client.ts` | Drizzle client singleton bound to `@neondatabase/serverless` HTTP driver |
| `lib/db/queries.ts` | Same-named async helpers: `getClientBySlug`, `getClientByEmail`, `getAllClients` — all wrapped in `React.cache()` |
| `drizzle.config.ts` | Drizzle Kit CLI config at repo root |
| `drizzle/0000_*.sql` | Auto-generated migration; committed to git |
| `scripts/seed.ts` | One-time inline-data seed runner |

**Modified:**

`package.json`, `auth.ts`, plus 24 consumers (see Task 8–14).

**Deleted:**

`lib/clients.config.ts` (in Task 15, after all consumers migrated).

---

## Task 1: Neon dev DB + env vars (manual)

This is a prerequisite for everything else. No code changes here.

**Files:** `.env.local` (gitignored)

- [ ] **Step 1: Create a Neon project for development**

  Go to https://neon.tech, sign in, create a new project named `avenue-z-reporting-dev`. Pick the region closest to your Vercel deployment region (US East is the default for Vercel and a safe default).

- [ ] **Step 2: Copy connection strings**

  In the Neon project dashboard, find **Connection Details**. There are two connection strings — both needed:
  - **Pooled** (default; ends in `-pooler.<region>.aws.neon.tech`) → goes into `DATABASE_URL`
  - **Direct** (no `-pooler` in hostname) → goes into `DATABASE_URL_UNPOOLED`

  Append to `.env.local`:

  ```env
  DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require
  DATABASE_URL_UNPOOLED=postgresql://...neon.tech/neondb?sslmode=require
  ```

- [ ] **Step 3: Verify connection strings load**

  Run:

  ```bash
  awk -F= '/^DATABASE_URL=/ {print "DATABASE_URL len:", length($2)} /^DATABASE_URL_UNPOOLED=/ {print "DATABASE_URL_UNPOOLED len:", length($2)}' .env.local
  ```

  Expected: both lengths > 50. If 0, repeat Step 2.

No commit in this task — `.env.local` is gitignored.

---

## Task 2: Install deps + Drizzle config + npm scripts

**Files:**
- Create: `drizzle.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install runtime + dev dependencies**

  Run:

  ```bash
  npm install drizzle-orm @neondatabase/serverless
  npm install -D drizzle-kit tsx dotenv
  ```

  Expected: no errors. `dotenv` is needed for `scripts/seed.ts` to load env vars when run outside Next.js.

- [ ] **Step 2: Create `drizzle.config.ts` at repo root**

  ```ts
  import { defineConfig } from 'drizzle-kit'
  import 'dotenv/config'

  export default defineConfig({
    schema: './lib/db/schema.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
      url: process.env.DATABASE_URL_UNPOOLED!,
    },
  })
  ```

- [ ] **Step 3: Add npm scripts to `package.json`**

  Add these four lines to the `"scripts"` block (between existing `"lint"` and the closing brace):

  ```json
      "db:generate": "drizzle-kit generate",
      "db:migrate": "drizzle-kit migrate",
      "db:studio": "drizzle-kit studio",
      "db:seed": "tsx --env-file=.env.local scripts/seed.ts"
  ```

- [ ] **Step 4: Type-check passes**

  Run:

  ```bash
  npx tsc --noEmit
  ```

  Expected: exits 0 (no schema files yet but no errors should appear from the new config).

- [ ] **Step 5: Commit**

  ```bash
  git add package.json package-lock.json drizzle.config.ts
  git commit -m "Add Drizzle + Neon dependencies and config"
  ```

---

## Task 3: Schema + types in `lib/db/schema.ts`

**Files:**
- Create: `lib/db/schema.ts`

- [ ] **Step 1: Create the schema file**

  ```ts
  import { pgTable, uuid, text, jsonb, timestamp, pgEnum, index } from 'drizzle-orm/pg-core'
  import { relations } from 'drizzle-orm'

  // --- Domain types preserved from the deleted clients.config.ts ---

  export type ReportSlug =
    | 'exec-summary'
    | 'ga4'
    | 'meta-ads'
    | 'google-ads'
    | 'email-marketing'
    | 'blended-performance'
    | 'linkedin-ads'
    | 'snapchat-ads'
    | 'tiktok-ads'
    | 'shopify-performance'
    | 'hubspot-performance'
    | 'inbound-funnel'
    | 'reddit-ads'
    | 'bing-ads'
    | 'ffci'
    | 'tiktok-shop'
    | 'pr-placements'
    | 'google-search-console'
    | 'salesforce'
    | 'gohighlevel'
    | 'ticket-sales'
    | 'peec-ai'
    | 'profound-ai'
    | 'demand-overview'
    | 'ai-summaries'
    | 'report-generator'

  export interface PRConfig {
    keywords: string[]
    excludeKeywords?: string[]
    sourceLocationUri?: string[]
    language?: string
    dataTypes?: ('news' | 'pr' | 'blog')[]
    lookbackDays?: number
  }

  // --- Drizzle schema ---

  export const clientRoleEnum = pgEnum('client_role', [
    'INTERNAL_ADMIN',
    'INTERNAL_ANALYST',
    'CLIENT_ADMIN',
    'CLIENT_VIEWER',
  ])

  export const clients = pgTable('clients', {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    logoUrl: text('logo_url'),
    ga4PropertyId: text('ga4_property_id'),
    gscSiteUrl: text('gsc_site_url'),
    hubspotTokenEnvVar: text('hubspot_token_env_var'),
    prConfig: jsonb('pr_config').$type<PRConfig>(),
    enabledReports: text('enabled_reports').array().notNull().$type<ReportSlug[]>(),
    hiddenReports: text('hidden_reports').array().notNull().default([]).$type<ReportSlug[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  })

  export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    role: clientRoleEnum('role').notNull(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }, (table) => ({
    clientIdIdx: index('users_client_id_idx').on(table.clientId),
  }))

  // --- Relations (enables nested queries) ---

  export const clientsRelations = relations(clients, ({ many }) => ({
    users: many(users),
  }))

  export const usersRelations = relations(users, ({ one }) => ({
    client: one(clients, {
      fields: [users.clientId],
      references: [clients.id],
    }),
  }))

  // --- Inferred TS types for consumers ---

  export type Client = typeof clients.$inferSelect
  export type NewClient = typeof clients.$inferInsert
  export type User = typeof users.$inferSelect
  export type NewUser = typeof users.$inferInsert
  export type ClientRole = (typeof clientRoleEnum.enumValues)[number]
  ```

- [ ] **Step 2: Type-check passes**

  Run:

  ```bash
  npx tsc --noEmit
  ```

  Expected: exits 0.

- [ ] **Step 3: Commit**

  ```bash
  git add lib/db/schema.ts
  git commit -m "Define clients and users tables in Drizzle schema"
  ```

---

## Task 4: Drizzle client in `lib/db/client.ts`

**Files:**
- Create: `lib/db/client.ts`

- [ ] **Step 1: Create the client singleton**

  ```ts
  import { drizzle } from 'drizzle-orm/neon-http'
  import { neon } from '@neondatabase/serverless'
  import * as schema from './schema'

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL env var')
  }

  const sql = neon(connectionString)
  export const db = drizzle({ client: sql, schema })
  ```

  Using the HTTP driver (not WebSocket) keeps things simple — no pooling concerns, works in both Node and Edge runtimes, sufficient for our request volume.

- [ ] **Step 2: Type-check passes**

  Run:

  ```bash
  npx tsc --noEmit
  ```

  Expected: exits 0.

- [ ] **Step 3: Commit**

  ```bash
  git add lib/db/client.ts
  git commit -m "Add Drizzle Neon HTTP client singleton"
  ```

---

## Task 5: Query helpers in `lib/db/queries.ts`

**Files:**
- Create: `lib/db/queries.ts`

- [ ] **Step 1: Create the three helpers**

  ```ts
  import { cache } from 'react'
  import { eq } from 'drizzle-orm'
  import { db } from './client'
  import { clients, users, type Client, type User, type ClientRole } from './schema'

  /**
   * Find one client by slug, including its users.
   * Returns null if not found. Per-render deduplicated via React.cache.
   */
  export const getClientBySlug = cache(async (slug: string): Promise<(Client & { users: User[] }) | null> => {
    const row = await db.query.clients.findFirst({
      where: eq(clients.slug, slug),
      with: { users: true },
    })
    return row ?? null
  })

  /**
   * Find one user by email, returning a flattened shape that matches
   * the legacy getClientByEmail contract: { email, role, slug }.
   * Returns null if not found.
   */
  export const getClientByEmail = cache(async (email: string): Promise<{ email: string; role: ClientRole; slug: string } | null> => {
    const row = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
      with: { client: true },
    })
    if (!row) return null
    return { email: row.email, role: row.role, slug: row.client.slug }
  })

  /**
   * List all clients ordered by name.
   */
  export const getAllClients = cache(async (): Promise<Client[]> => {
    return db.query.clients.findMany({
      orderBy: (c, { asc }) => [asc(c.name)],
    })
  })
  ```

- [ ] **Step 2: Type-check passes**

  Run:

  ```bash
  npx tsc --noEmit
  ```

  Expected: exits 0.

- [ ] **Step 3: Commit**

  ```bash
  git add lib/db/queries.ts
  git commit -m "Add async client/user query helpers wrapped in React.cache"
  ```

---

## Task 6: Generate migration + apply to Neon dev

**Files:**
- Create: `drizzle/0000_*.sql` (auto-generated)
- Create: `drizzle/meta/*` (auto-generated)

- [ ] **Step 1: Generate the SQL migration from the schema**

  Run:

  ```bash
  npm run db:generate
  ```

  Expected output:

  ```
  Reading config file '.../drizzle.config.ts'
  ...
  ✓ Your SQL migration file ➜ drizzle/0000_<random-name>.sql 🚀
  ```

- [ ] **Step 2: Inspect the generated SQL**

  Run:

  ```bash
  ls drizzle/ && cat drizzle/0000_*.sql
  ```

  Expected: file contains `CREATE TYPE "public"."client_role"`, `CREATE TABLE "clients"`, `CREATE TABLE "users"`, the FK constraint, and the `users_client_id_idx` index.

- [ ] **Step 3: Apply migration to Neon dev DB**

  Run:

  ```bash
  npm run db:migrate
  ```

  Expected: `[migrate] Migrations applied successfully!` or equivalent. If you see `Missing DATABASE_URL_UNPOOLED`, double-check Task 1 step 3.

- [ ] **Step 4: Verify tables exist**

  Run:

  ```bash
  npx tsx --env-file=.env.local -e "import('./lib/db/client.js').then(async ({ db }) => { const { sql } = await import('drizzle-orm'); const r = await db.execute(sql\`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name\`); console.log(r.rows) })"
  ```

  Expected output (order may differ): `[{ table_name: '__drizzle_migrations' }, { table_name: 'clients' }, { table_name: 'users' }]`.

  If that one-liner is fragile, alternative: open https://console.neon.tech/, navigate to your project's SQL editor, and run `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`

- [ ] **Step 5: Commit migration files**

  ```bash
  git add drizzle/
  git commit -m "Generate initial migration: clients + users tables"
  ```

---

## Task 7: Seed script + run it

**Files:**
- Create: `scripts/seed.ts`

- [ ] **Step 1: Create `scripts/seed.ts` with inline data**

  ```ts
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
  ```

  Note the script reads `GA4_PROPERTY_ID_AVENUE_Z` and `GSC_SITE_URL_AVENUE_Z` from env so the actual values land in the DB rather than env var names. After seeding, these env vars become removable (handled in Task 15).

- [ ] **Step 2: Run the seed**

  Run:

  ```bash
  npm run db:seed
  ```

  Expected output:

  ```
  Seeded avenue-z with 2 users.
  ```

- [ ] **Step 3: Verify data in Neon**

  Run:

  ```bash
  npx tsx --env-file=.env.local -e "import('./lib/db/client.js').then(async ({ db }) => { const { sql } = await import('drizzle-orm'); const c = await db.execute(sql\`SELECT slug, name, ga4_property_id IS NOT NULL AS has_ga4, gsc_site_url IS NOT NULL AS has_gsc FROM clients\`); console.log('clients:', c.rows); const u = await db.execute(sql\`SELECT email, role FROM users ORDER BY email\`); console.log('users:', u.rows) })"
  ```

  Expected:

  ```
  clients: [ { slug: 'avenue-z', name: 'Avenue Z', has_ga4: true, has_gsc: true } ]
  users: [ { email: 'demo@avenuez.com', role: 'INTERNAL_ANALYST' }, { email: 'nick@avenuez.com', role: 'INTERNAL_ADMIN' } ]
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add scripts/seed.ts
  git commit -m "Add idempotent seed script with inline Avenue Z data"
  ```

---

## Task 8: Migrate `auth.ts` to async DB lookup

**Files:**
- Modify: `auth.ts`

- [ ] **Step 1: Read current `auth.ts`**

  Run `cat auth.ts` and confirm it imports `getClientByEmail` from `@/lib/clients.config` and uses it inside the `jwt` callback's `if (user?.email)` guard.

- [ ] **Step 2: Update the import path**

  Change the import line at the top of the file:

  ```ts
  // Before:
  import { getClientByEmail } from '@/lib/clients.config'

  // After:
  import { getClientByEmail } from '@/lib/db/queries'
  ```

- [ ] **Step 3: Add `await` to the call inside the jwt callback**

  Inside the `async jwt({ token, user })` callback, change:

  ```ts
  // Before:
  const clientConfig = getClientByEmail(user.email)

  // After:
  const clientConfig = await getClientByEmail(user.email)
  ```

  The callback is already `async` so no signature change is needed.

- [ ] **Step 4: Type-check passes**

  Run:

  ```bash
  npx tsc --noEmit
  ```

  Expected: exits 0.

- [ ] **Step 5: Commit**

  ```bash
  git add auth.ts
  git commit -m "Migrate auth.ts to async DB-backed getClientByEmail"
  ```

---

## Task 9: Semantic migration of `lib/ga4/client.ts` and `lib/gsc/client.ts`

These two files currently do `process.env[client.ga4PropertyId]` (or `client.gscSiteUrl`) because the field stored an env var name. After migration, the field stores the value directly.

**Files:**
- Modify: `lib/ga4/client.ts`
- Modify: `lib/gsc/client.ts`

- [ ] **Step 1: Locate the env-var-name indirection in `lib/ga4/client.ts`**

  Run:

  ```bash
  grep -n "process.env\[.*ga4PropertyId\|ga4PropertyId" lib/ga4/client.ts
  ```

  Expected: at least one line like `const propertyId = process.env[client.ga4PropertyId]` and the lookup of the client itself via `getClientBySlug` or similar.

- [ ] **Step 2: Update `lib/ga4/client.ts`**

  Change two things:

  1. The import: `from '@/lib/clients.config'` → `from '@/lib/db/queries'`
  2. The client lookup: synchronous → `await`
  3. The property ID resolution: drop `process.env[...]`, use the field directly

  Example before/after pattern (your file may have variations — apply consistently):

  ```ts
  // Before:
  import { getClientBySlug } from '@/lib/clients.config'
  // ...
  const client = getClientBySlug(clientSlug)
  if (!client?.ga4PropertyId) throw new Error(...)
  const propertyId = process.env[client.ga4PropertyId]
  if (!propertyId) throw new Error(`Missing env var: ${client.ga4PropertyId}`)

  // After:
  import { getClientBySlug } from '@/lib/db/queries'
  // ...
  const client = await getClientBySlug(clientSlug)
  if (!client?.ga4PropertyId) throw new Error(...)
  const propertyId = client.ga4PropertyId
  ```

  Make sure the enclosing function is `async` (it almost certainly already is).

- [ ] **Step 3: Same change in `lib/gsc/client.ts`**

  Same pattern, but with `gscSiteUrl` instead of `ga4PropertyId`:

  ```ts
  // Before:
  import { getClientBySlug } from '@/lib/clients.config'
  // ...
  const client = getClientBySlug(clientSlug)
  const rawSiteUrl = process.env[client!.gscSiteUrl!]

  // After:
  import { getClientBySlug } from '@/lib/db/queries'
  // ...
  const client = await getClientBySlug(clientSlug)
  const rawSiteUrl = client?.gscSiteUrl
  ```

- [ ] **Step 4: Type-check passes**

  Run:

  ```bash
  npx tsc --noEmit
  ```

  Expected: exits 0.

- [ ] **Step 5: Commit**

  ```bash
  git add lib/ga4/client.ts lib/gsc/client.ts
  git commit -m "Migrate GA4 and GSC clients off env-var-name indirection"
  ```

---

## Task 10: Migrate remaining `lib/` consumers

**Files:**
- Modify: `lib/hubspot/client.ts`
- Modify: `lib/report-generator/context.ts`

- [ ] **Step 1: Update `lib/hubspot/client.ts`**

  HubSpot keeps the env-var-name pointer pattern (the token is a secret, stays in env). Only the import path and `await` change:

  ```ts
  // Before:
  import { getClientBySlug } from '@/lib/clients.config'
  // ...
  const client = getClientBySlug(clientSlug)
  const token = process.env[client.hubspotToken]

  // After:
  import { getClientBySlug } from '@/lib/db/queries'
  // ...
  const client = await getClientBySlug(clientSlug)
  const token = client?.hubspotTokenEnvVar ? process.env[client.hubspotTokenEnvVar] : undefined
  ```

  Note the field name change: `hubspotToken` (old) → `hubspotTokenEnvVar` (new — matches schema). The variable still holds an env var name.

- [ ] **Step 2: Update `lib/report-generator/context.ts`**

  Pure mechanical change. Update import path and add `await` to any `getClientBySlug` / `getClientByEmail` / `getAllClients` calls:

  ```ts
  // Before:
  import { getClientBySlug } from '@/lib/clients.config'
  const client = getClientBySlug(slug)

  // After:
  import { getClientBySlug } from '@/lib/db/queries'
  const client = await getClientBySlug(slug)
  ```

- [ ] **Step 3: Type-check passes**

  Run:

  ```bash
  npx tsc --noEmit
  ```

  Expected: exits 0.

- [ ] **Step 4: Commit**

  ```bash
  git add lib/hubspot/client.ts lib/report-generator/context.ts
  git commit -m "Migrate HubSpot and report-generator clients to DB queries"
  ```

---

## Task 11: Migrate `components/` consumers

Six component files. All mechanical: import path + `await`. Many are already async Server Components.

**Files:**
- Modify: `components/layout/sidebar.tsx`
- Modify: `components/layout/portal-sidebar.tsx`
- Modify: `components/report-sections/ai-summaries/index.tsx`
- Modify: `components/report-sections/report-generator/index.tsx`
- Modify: `components/report-sections/pr-placements/index.tsx`
- Modify: `components/report-sections/conversational-summary/index.tsx`

- [ ] **Step 1: For each file, apply the mechanical migration**

  Same pattern for all six:

  ```ts
  // Before:
  import { getClientBySlug, getAllClients } from '@/lib/clients.config'
  // ... inside a function or component:
  const client = getClientBySlug(slug)
  const all = getAllClients()

  // After:
  import { getClientBySlug, getAllClients } from '@/lib/db/queries'
  // ...
  const client = await getClientBySlug(slug)
  const all = await getAllClients()
  ```

  If any component is currently a synchronous function (not `async`), make it `async`. The two sidebars and four report sections should all already be RSCs (`export default async function ...`); if any are exported as a plain function, just add `async`.

  Apply to each of the six files in turn, committing after each one (per the bite-sized rule) **or** in one batch — see Step 2.

- [ ] **Step 2: Type-check passes**

  Run:

  ```bash
  npx tsc --noEmit
  ```

  Expected: exits 0.

- [ ] **Step 3: Verify no remaining imports**

  Run:

  ```bash
  grep -l "from '@/lib/clients.config" components/
  ```

  Expected: no output (all migrated).

- [ ] **Step 4: Commit**

  ```bash
  git add components/
  git commit -m "Migrate components to async DB-backed client helpers"
  ```

---

## Task 12: Migrate `app/dashboard/` pages

Eight files. All mechanical.

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `app/dashboard/connections/page.tsx`
- Modify: `app/dashboard/settings/page.tsx`
- Modify: `app/dashboard/[clientSlug]/page.tsx`
- Modify: `app/dashboard/[clientSlug]/auth/page.tsx`
- Modify: `app/dashboard/[clientSlug]/reports/page.tsx`
- Modify: `app/dashboard/[clientSlug]/reports/report-nav.tsx`
- Modify: `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx`

- [ ] **Step 1: For each file, apply the mechanical migration**

  Same pattern as Task 11. Examples of what to look for and change:

  ```ts
  // Before:
  import { getClientBySlug, getAllClients, type ClientConfig } from '@/lib/clients.config'
  const client = getClientBySlug(slug)

  // After:
  import { getClientBySlug, getAllClients } from '@/lib/db/queries'
  import type { Client } from '@/lib/db/schema'
  const client = await getClientBySlug(slug)
  ```

  Note: `ClientConfig` type is replaced by `Client` from `lib/db/schema` for any callsite that explicitly typed the result. For most callsites, type inference handles it and no type import is needed.

- [ ] **Step 2: Type-check passes**

  Run:

  ```bash
  npx tsc --noEmit
  ```

  Expected: exits 0.

- [ ] **Step 3: Verify no remaining imports**

  Run:

  ```bash
  grep -l "from '@/lib/clients.config" app/dashboard/
  ```

  Expected: no output.

- [ ] **Step 4: Commit**

  ```bash
  git add app/dashboard/
  git commit -m "Migrate dashboard pages to async DB-backed client helpers"
  ```

---

## Task 13: Migrate `app/portal/` pages

Five files. Same mechanical pattern.

**Files:**
- Modify: `app/portal/[clientSlug]/page.tsx`
- Modify: `app/portal/[clientSlug]/auth/page.tsx`
- Modify: `app/portal/[clientSlug]/reports/page.tsx`
- Modify: `app/portal/[clientSlug]/reports/report-nav.tsx`
- Modify: `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx`

- [ ] **Step 1: Apply the mechanical migration to each**

  Same import path + `await` pattern as Tasks 11 and 12.

- [ ] **Step 2: Type-check passes**

  Run:

  ```bash
  npx tsc --noEmit
  ```

  Expected: exits 0.

- [ ] **Step 3: Verify no remaining imports**

  Run:

  ```bash
  grep -l "from '@/lib/clients.config" app/portal/
  ```

  Expected: no output.

- [ ] **Step 4: Commit**

  ```bash
  git add app/portal/
  git commit -m "Migrate portal pages to async DB-backed client helpers"
  ```

---

## Task 14: Migrate `app/api/pr-placements/route.ts`

Single API route file. Mechanical.

**Files:**
- Modify: `app/api/pr-placements/route.ts`

- [ ] **Step 1: Apply the mechanical migration**

  Same pattern as above. Route handlers (`export async function GET(...)`, etc.) are already async, so just import path + `await`.

- [ ] **Step 2: Type-check passes**

  Run:

  ```bash
  npx tsc --noEmit
  ```

  Expected: exits 0.

- [ ] **Step 3: Commit**

  ```bash
  git add app/api/pr-placements/route.ts
  git commit -m "Migrate PR placements API route to async DB helpers"
  ```

---

## Task 15: Delete `lib/clients.config.ts` and clean up unused env vars

**Files:**
- Delete: `lib/clients.config.ts`
- Modify: `.env.local` (remove now-unused env vars)

- [ ] **Step 1: Verify no remaining imports of clients.config**

  Run:

  ```bash
  grep -rn "from '@/lib/clients.config\|from '@/lib/clients.config'" app/ lib/ components/ auth.ts 2>/dev/null
  ```

  Expected: no output. If anything appears, migrate that file first (using the pattern in Tasks 8-14), then return.

- [ ] **Step 2: Delete `lib/clients.config.ts`**

  Run:

  ```bash
  rm lib/clients.config.ts
  ```

- [ ] **Step 3: Type-check is the final gate**

  Run:

  ```bash
  npx tsc --noEmit
  ```

  Expected: exits 0. If anything fails, a consumer was missed — re-check Step 1's grep.

- [ ] **Step 4: Lint**

  Run:

  ```bash
  npm run lint 2>&1 | grep -E "clients.config\b" | head -5
  ```

  Expected: no output. (There are pre-existing lint errors in this repo unrelated to this work; we only care that this change didn't add any.)

- [ ] **Step 5: Production build sanity check**

  Run:

  ```bash
  npm run build
  ```

  Expected: build succeeds. Stop the dev server first if port 3000 is in use.

- [ ] **Step 6: Clean up now-unused per-client env vars in `.env.local`**

  These env vars stored values that now live in the DB and can be removed from local dev:

  - `GA4_PROPERTY_ID_AVENUE_Z`
  - `GSC_SITE_URL_AVENUE_Z`

  Delete those two lines from `.env.local`. Keep `HUBSPOT_ACCESS_TOKEN_AVENUE_Z` — it's still a secret pointed to by DB.

  These should be removed from Vercel's env settings during production rollout (Task 17), not now.

- [ ] **Step 7: Commit**

  ```bash
  git add -A
  git commit -m "Remove lib/clients.config.ts; database is now the source of truth"
  ```

---

## Task 16: Manual browser verification

No automated test framework in this repo. Run these scenarios in a browser against `http://localhost:3000`.

- [ ] **Step 1: Restart the dev server**

  If the dev server is running, stop it. Start fresh so it picks up the env var removals from Task 15 Step 6:

  ```bash
  npm run dev
  ```

  Wait for `✓ Ready in`.

- [ ] **Step 2: Sign in flow works**

  In an incognito window, open http://localhost:3000/login. Sign in with `nick@avenuez.com` via Google (assuming OAuth env vars are set; if not, use credentials with `demo@avenuez.com` / `demo`).

  Expected: redirect to `/dashboard`. JWT contains `role: 'INTERNAL_ADMIN'` (Nick) or `'INTERNAL_ANALYST'` (demo) — confirms `getClientByEmail` resolves from DB.

- [ ] **Step 3: Client picker on internal dashboard renders**

  As an internal user, http://localhost:3000/dashboard should show the Avenue Z client in the picker — confirms `getAllClients()` works.

- [ ] **Step 4: GA4 report loads**

  Navigate to http://localhost:3000/dashboard/avenue-z/reports?section=ga4

  Expected: GA4 report renders with live data — confirms the env-var-name → direct-value field change in `lib/ga4/client.ts`.

- [ ] **Step 5: Search Console subsection loads**

  Navigate to http://localhost:3000/dashboard/avenue-z/reports?section=ga4&subsection=search-console

  Expected: Search Console renders with live data (assuming `GSC_IMPERSONATE_EMAIL` is configured) — confirms `lib/gsc/client.ts` migration.

- [ ] **Step 6: HubSpot Performance loads**

  Navigate to http://localhost:3000/dashboard/avenue-z/reports?section=hubspot-performance

  Expected: HubSpot Performance renders — confirms `hubspotTokenEnvVar` lookup still works for secrets in env.

- [ ] **Step 7: Sidebar renders**

  Sidebar shows the report list correctly — confirms `client.enabledReports` array is read correctly from DB.

  If any scenario fails, capture the dev server log line + error trace and fix before proceeding to Task 17.

No commit in this task.

---

## Task 17: Production rollout (manual, after merge)

This is the production deploy sequence. Do not start until Tasks 1-16 are committed and reviewed.

- [ ] **Step 1: Create Neon prod project**

  Sign in to https://neon.tech, create a new project named `avenue-z-reporting-prod`. Copy both connection strings.

- [ ] **Step 2: Add env vars to Vercel (Production scope)**

  In Vercel project → Settings → Environment Variables, add:

  - `DATABASE_URL` (pooled string) — scope: Production
  - `DATABASE_URL_UNPOOLED` (direct string) — scope: Production

- [ ] **Step 3: Run migrations and seed against prod**

  From a local terminal, with prod connection strings temporarily exported:

  ```bash
  DATABASE_URL_UNPOOLED="<prod direct string>" \
  DATABASE_URL="<prod pooled string>" \
  GA4_PROPERTY_ID_AVENUE_Z="$(awk -F= '/^GA4_PROPERTY_ID_AVENUE_Z=/ {print $2}' .env.local)" \
  GSC_SITE_URL_AVENUE_Z="$(awk -F= '/^GSC_SITE_URL_AVENUE_Z=/ {print $2}' .env.local)" \
  npx drizzle-kit migrate && \
  npx tsx scripts/seed.ts
  ```

  Wait — by this point you've already deleted `GA4_PROPERTY_ID_AVENUE_Z` and `GSC_SITE_URL_AVENUE_Z` from local `.env.local` in Task 15 Step 6. Re-add them temporarily for this command, or supply the values inline:

  ```bash
  DATABASE_URL_UNPOOLED="<prod direct>" \
  DATABASE_URL="<prod pooled>" \
  GA4_PROPERTY_ID_AVENUE_Z="properties/<numeric id>" \
  GSC_SITE_URL_AVENUE_Z="sc-domain:avenuez.com" \
  npx drizzle-kit migrate && \
  npx tsx scripts/seed.ts
  ```

  Expected output ends with: `Seeded avenue-z with 2 users.`

- [ ] **Step 4: Merge the PR**

  Open the PR for this branch against `main`. Once approved, merge. Vercel auto-deploys (if connected — verify in Vercel dashboard).

- [ ] **Step 5: Smoke test production**

  Repeat Task 16's manual scenarios against the production URL (`https://reporting.avenuez.com` based on prior session context).

  If anything fails, **rollback by reverting the merge commit on main**. The DB stays — code returns to file-based. Inspect logs, fix, redeploy.

- [ ] **Step 6: Remove now-unused per-client env vars from Vercel**

  In Vercel project → Settings → Environment Variables, delete:

  - `GA4_PROPERTY_ID_AVENUE_Z` (value now in DB)
  - `GSC_SITE_URL_AVENUE_Z` (value now in DB)

  Keep `HUBSPOT_ACCESS_TOKEN_AVENUE_Z`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `GSC_IMPERSONATE_EMAIL`, and all other secret env vars.

  Redeploy after the env change (Vercel doesn't hot-reload env).

---

## Done

After Tasks 1-17 are checked off:

- ✓ `lib/clients.config.ts` is gone; DB is the source of truth
- ✓ Onboarding a new client = an SQL insert (via Drizzle Studio or Neon dashboard), no code deploy needed
- ✓ Identifiers (GA4 property IDs, GSC site URLs) live in DB; secrets (HubSpot tokens, OAuth client/secret, Google SA key) still in env
- ✓ Future work (refresh tokens, password hashes, admin UI, BigQuery generalization) tracked in the design spec's "Open / future work" section
