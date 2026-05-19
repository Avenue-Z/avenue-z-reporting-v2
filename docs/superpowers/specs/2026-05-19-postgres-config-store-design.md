# Postgres Config Store — Design

**Date:** 2026-05-19
**Branch:** `feature/db`
**Owner:** paul.ramirez@avenuez.com

## Goal

Replace the static `lib/clients.config.ts` file with a Postgres-backed registry of clients and users, hosted on Neon's free tier and accessed via Drizzle ORM. The drop motivation: onboarding a new client currently requires editing a TypeScript file, opening a PR, and redeploying — unworkable as the platform scales toward 40+ clients.

## Current state

- `lib/clients.config.ts` exports a `clients: ClientConfig[]` array (currently one entry: Avenue Z) plus three helpers: `getClientBySlug`, `getClientByEmail`, `getAllClients`.
- ~25 consumers across the codebase import from `@/lib/clients.config` — every dashboard/portal page, auth callbacks, sidebars, several `lib/<vendor>/client.ts` modules, and a few API routes.
- All consumers are already in async contexts (Server Components, Server Actions, route handlers, NextAuth callbacks) or trivially convertible.
- BigQuery is already in use for the FFCI report ([lib/bigquery/client.ts](../../../lib/bigquery/client.ts)) — this design does **not** touch the analytics-data path. Analytics consolidation is a separate future track.

## Non-goals

- Admin UI for managing clients in the browser — use Drizzle Studio or the Neon dashboard for v1.
- Password hash storage for external client credential login — TODO in `auth.ts`; separate future migration.
- OAuth refresh token storage (for branded Supermetrics auth) — separate future migration.
- Migration of report sections to query BigQuery instead of live APIs — separate branch.
- Multi-tenant generalization of `lib/bigquery/client.ts` (currently hardcoded to "Fun Spot America") — separate branch.

## Design

### 1. Database provider

**Neon free tier.** Specific limits:

- 0.5 GB storage (estimated data fits in ~36 MB even with audit logs and growth to 40 clients × 5 users × multiple refresh tokens; ~0.007 % of cap)
- ~192 compute hours/month (request-level caching keeps DB load minimal; estimated 1–3 hours/month at moderate traffic)
- Auto-suspend when idle, auto-resume on connection — no permanent pausing (unlike Supabase free tier)

Connection via `@neondatabase/serverless` — uses WebSockets, works in both Node and Edge runtimes, avoids cold-start connection issues that `pg` hits in serverless.

Two environments:

- `avenue-z-reporting-dev` — local dev, shared with Vercel preview deployments
- `avenue-z-reporting-prod` — production

### 2. Schema

Two tables and one enum. SQL-equivalent shape (actual Drizzle definitions written in `lib/db/schema.ts`):

```sql
CREATE TYPE client_role AS ENUM (
  'INTERNAL_ADMIN', 'INTERNAL_ANALYST', 'CLIENT_ADMIN', 'CLIENT_VIEWER'
);

CREATE TABLE clients (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                     text UNIQUE NOT NULL,
  name                     text NOT NULL,
  logo_url                 text,
  ga4_property_id          text,          -- value directly, e.g. 'properties/123456789'
  gsc_site_url             text,          -- value directly, e.g. 'sc-domain:avenuez.com'
  hubspot_token_env_var    text,          -- env var NAME (secret stays in env), null = no HubSpot
  pr_config                jsonb,         -- existing PRConfig blob
  enabled_reports          text[] NOT NULL,
  hidden_reports           text[] NOT NULL DEFAULT '{}',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text UNIQUE NOT NULL,         -- lowercased on insert
  role        client_role NOT NULL,
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX users_client_id_idx ON users(client_id);
```

Notes:

- **Identifiers in DB, secrets in env.** GA4 property IDs and GSC site URLs are identifiers, stored directly. HubSpot access tokens are secrets, env stores the value, DB stores only the env var name pointing to it.
- **`enabled_reports` as `text[]`, not a join table.** Current code treats it as a flat list with no relational queries needed; array column matches existing shape exactly.
- **`pr_config` as `jsonb`.** Free-form blob with optional fields; relational structure would be overkill.

### 3. File layout

```
lib/db/
  client.ts       # Drizzle client singleton using @neondatabase/serverless
  schema.ts       # Table definitions + inferred TS types
  queries.ts      # Typed helpers: getClientBySlug, getClientByEmail, getAllClients

drizzle.config.ts  # Drizzle CLI config (at repo root)
drizzle/           # Auto-generated SQL migrations (committed to git)
scripts/
  seed.ts         # One-time seed of current clients.config.ts data into DB
```

### 4. Helper functions

Replace the three exports from `clients.config.ts` with same-named async functions in `lib/db/queries.ts`. Each wrapped in `React.cache()` for per-render deduplication.

```ts
import { cache } from 'react'
import { db } from './client'
import { clients, users } from './schema'
import { eq } from 'drizzle-orm'

export const getClientBySlug = cache(async (slug: string) => {
  const rows = await db.query.clients.findFirst({
    where: eq(clients.slug, slug),
    with: { users: true },
  })
  return rows ?? null
})

export const getClientByEmail = cache(async (email: string) => {
  const row = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
    with: { client: true },
  })
  return row ? { email: row.email, role: row.role, slug: row.client.slug } : null
})

export const getAllClients = cache(async () => {
  return db.query.clients.findMany({ orderBy: clients.name })
})
```

Same function names as today minimize churn at the ~25 callsites — consumers add `await` and update the import path.

### 5. Caching strategy

Three layers, in increasing scope:

| Layer | Where | Effect |
|---|---|---|
| Request scope | `React.cache()` in `queries.ts` | Multiple Server Components in one render dedupe to a single DB query |
| JWT scope | NextAuth `jwt` callback | DB lookup happens only at **sign-in**; role and clientSlug are baked into the JWT cookie, subsequent requests decode from token |
| Process scope | None in v1 | No `unstable_cache` or in-memory store. Add later only if metrics show a real need. |

The JWT layer is critical: it means auth doesn't hit the DB on every request — only when a new session is minted. The existing auth.ts already has this shape (`if (user?.email)` guard in the jwt callback runs only on sign-in).

### 6. Consumer migration pattern

Three mechanical changes per callsite:

1. Import path: `@/lib/clients.config` → `@/lib/db/queries`
2. Add `await` before the call
3. Mark the enclosing function `async` (almost all already are)

Most consumers don't care about specific fields, just the helpers' return shape. A few need attention:

- **[lib/ga4/client.ts](../../../lib/ga4/client.ts) and [lib/gsc/client.ts](../../../lib/gsc/client.ts)** — currently do `process.env[client.ga4PropertyId]` because the field stored an env var name. After migration, the field stores the value directly. Drop the `process.env[...]` indirection.
- **[auth.ts](../../../auth.ts)** — async-ify the `getClientByEmail` call in the jwt callback. JWT guard ensures this still only runs on sign-in.
- **Sidebars** ([sidebar.tsx](../../../components/layout/sidebar.tsx), [portal-sidebar.tsx](../../../components/layout/portal-sidebar.tsx)) — already async RSCs; mechanical await + import path update.
- **HubSpot client** ([lib/hubspot/client.ts](../../../lib/hubspot/client.ts)) — `process.env[client.hubspotTokenEnvVar]` stays the way it is. Secret remains in env.

`lib/clients.config.ts` deleted in the same PR. The TypeScript compiler flags any missed imports — `tsc --noEmit` becomes the "did I miss any callsite" gate.

### 7. Seeding + deployment

**Seed script** (`scripts/seed.ts`) is idempotent — uses `ON CONFLICT (slug) DO NOTHING`. The script has the seed data **inline as a literal object** (copied from `clients.config.ts` at PR-write time) so it has no runtime dependency on the file being deleted. Committed to the repo. Can be removed after the initial seed but worth keeping around for spinning up new environments.

**Local development sequence** (one-time setup):

```bash
# 1. Create Neon dev project at neon.tech, copy connection strings into .env.local
#    DATABASE_URL=<pooled>
#    DATABASE_URL_UNPOOLED=<direct, for migrations>

# 2. Install deps + migrate + seed
npm install
npm run db:generate     # produce SQL from schema.ts
npm run db:migrate      # apply migrations to Neon dev DB
npm run db:seed         # import current clients.config.ts data
```

**Production sequence** (one-time, when this PR merges):

1. Create Neon prod project (`avenue-z-reporting-prod`)
2. Add `DATABASE_URL` + `DATABASE_URL_UNPOOLED` to Vercel env vars (Production scope)
3. From local terminal with prod env vars temporarily loaded: `npm run db:migrate && npm run db:seed`
4. Merge PR → Vercel deploys code that reads from DB
5. Smoke test prod
6. `lib/clients.config.ts` is already deleted in the PR — no follow-up

**Rollback** if prod has issues: revert the PR. DB stays untouched; code goes back to reading from the file. Fast.

**Vercel preview deployments** share the dev DB for v1. Neon branching (copy-on-write per git branch) is a known follow-up if previews start conflicting; not blocking.

### 8. Package additions

```
runtime dependencies:
  drizzle-orm                    # ORM
  @neondatabase/serverless       # driver
  ws                             # Neon serverless driver dependency

dev dependencies:
  drizzle-kit                    # migration generator + CLI
  tsx                            # to run seed.ts
```

```
package.json scripts:
  "db:generate": "drizzle-kit generate",
  "db:migrate":  "drizzle-kit migrate",
  "db:studio":   "drizzle-kit studio",
  "db:seed":     "tsx scripts/seed.ts"
```

### 9. Environment variables

| Var | Used by | Scope |
|---|---|---|
| `DATABASE_URL` | App runtime (pooled, WebSocket) | `.env.local`, Vercel Production/Preview/Development |
| `DATABASE_URL_UNPOOLED` | Drizzle migrations only | `.env.local`, optionally Vercel for migration runs |

Existing env vars stay (`HUBSPOT_ACCESS_TOKEN_AVENUE_Z`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `GSC_IMPERSONATE_EMAIL`, etc.). The per-client `GA4_PROPERTY_ID_AVENUE_Z` and `GSC_SITE_URL_AVENUE_Z` become **removable** after migration (the values move into the DB) — remove in a cleanup commit at the end of the migration PR.

## Verification

After implementation:

1. `npx tsc --noEmit` passes — confirms no missed imports of the deleted `clients.config.ts`.
2. Sign in via Google → dashboard loads → role and clientSlug correct in session.
3. Sign in via credentials (demo@avenuez.com / demo) → dashboard loads.
4. GA4 report (`/dashboard/avenue-z/reports?section=ga4`) loads live data — verifies the env-var-name → direct-value field change in `lib/ga4/client.ts`.
5. GSC subsection (`/dashboard/avenue-z/reports?section=ga4&subsection=search-console`) loads — verifies same in `lib/gsc/client.ts`.
6. HubSpot Performance loads — verifies the env-var-name pointer pattern still works for secrets.
7. Sidebar's client picker (internal admin) loads from DB.

## Open / future work

Tracked here for visibility; not in scope for this branch:

- **Refresh token storage** — Supermetrics branded auth, per-client per-platform OAuth tokens.
- **Password hash storage** — `users.password_hash` column + bcrypt verification in `auth.ts` credentials provider; the TODO already in the codebase.
- **Admin UI** — manage clients/users from the dashboard instead of SQL/Drizzle Studio.
- **Audit log table** — track logins, config changes; future compliance need.
- **Neon branching for previews** — per-PR copy-on-write DBs.
- **Analytics consolidation onto BigQuery** — migrate report sections off live APIs.
