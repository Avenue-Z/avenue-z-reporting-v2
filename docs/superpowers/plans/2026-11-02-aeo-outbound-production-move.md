# AEO Outbound: moving the tool to production (plan only, nothing executed)

**Date:** 2026-11-02. **Status:** read-only research. Nothing here has been run against production. **Gate:** nothing
starts until Paul has approved #434, #431, #432 and #433, they are merged to `dev` and promoted to staging, and Ryan has
signed off on staging.

Every fact below cites the commit, file or record it was read from (refs as of 2026-11-02: `main` `17aa47db`, staging
`05b399cc`, `dev` `4cf99df2`). Anything that could not be read from here is marked **Unverified** with the read-only
check that settles it.

## 1. What production is today

- **The tool is not on production.** `main` has no `lib/aeo-outbound/` and its migrations stop at `0025`
  (`git ls-tree origin/main drizzle/`). Staging has `0026` to `0029`.
- **A staging to main promotion ships more than the tool.** Staging is 451 commits ahead of `main`. Outside the tool's
  own files (`lib/aeo-outbound`, `components/aeo-outbound`, `app/tools/new-business`, `app/api/aeo-outbound`,
  `app/snapshot`), it carries, on Renaissance's live path:
  - Bulk PDF export (#386, 2026-10-14): `lib/export/bulk.ts`, `lib/export/pages.ts`, `components/export-pdf-button.tsx`,
    both report pages.
  - The Neon network-transfer fix for the Organic Social lock sweep (`651cd21e`, `0c0de4a2`, `c6edad3b`, 2026-10-21).
  - The Next.js security bump 16.3.8 to 16.4.1 (`4603ae7c`, GHSA-2464-fhr4-w9xw, GHSA-p3m5-59mp-jv5r).
  - New Business in the Tools list (`2a994744`, `lib/constants.ts`).
- **Production runs the lock sweep without the transfer fix.** `main`'s `vercel.json` schedules `/api/lock-sweep`
  hourly, and `main` lacks `651cd21e`, which the commit records as the cause of the Neon project using its 5 GB monthly
  transfer on 2026-10-21 (about 9.5 MB a run, every hour). **Unverified:** whether production's database is in the same
  Neon project (and quota) as dev and staging, and whether production's sweep has opted-in clients to sweep. This is a
  production risk today, independent of the tool, and the promotion fixes it.

## 2. What the tool needs at runtime (read from staging's code)

| Need | Source | Production today |
|---|---|---|
| Four tables: `aeo_outbound_reports`, `_opens`, `_settings`, `_settings_log`, plus the `aeo_outbound_status` enum | `drizzle/0026` to `0029`; additive, no existing table touched | Absent (migrations not on `main`). **Unverified** in the database itself |
| `PEEC_AI_CUSTOMER_TOKEN` | `lib/aeo-outbound/peec.ts:207` | Already read by 6 files on `main` (`lib/peec/*`), so likely set. **Unverified** |
| `GLEAN_INSTANCE`, `GLEAN_API_TOKEN` | `lib/aeo-outbound/glean.ts:36` | Already read on `main` (`lib/glean.ts`). **Unverified** |
| `GLEAN_ACT_AS` | `glean.ts:37`: `true` acts as the signed-in user and needs an organization-wide token; unset runs as the token's own user (`.env.example:63`) | New. Must match the token type production uses. **Unverified** which staging uses |
| `AEO_OUTBOUND_USERS` | `access.ts:22`: the floor list of users, every one an admin | New. With an empty settings table it is the only way in (`access.ts`; `settings.ts:62` falls back to defaults) |
| Public link domain | `share-origin.ts`: `VERCEL_TARGET_ENV=production` gives `https://reporting.avenuez.com` (set by Vercel) | Nothing to set |
| Login | `/tools/*` is behind the proxy (`proxy.ts:25`); `/snapshot` is public by design | Google sign-in already works on production |

Settings, users and every report live in the database, so nothing Ryan set on staging carries over: production starts
with the defaults and an empty hub.

## 3. The database: what the repo's own record says

`MIGRATIONS-PENDING.md` (on staging, absent from `main`) is the migration record. It says:

- Use `scripts/migrate-http.ts` for every environment. It hashes each migration and checks it against
  `drizzle.__drizzle_migrations`. Never `npm run db:migrate`, `db:migrate:staging` or the `db-migrate.yml` workflow:
  `drizzle-kit migrate` is timestamp-gated, can skip a migration silently and exit 0, and has hung against Neon.
- Apply before the code merges, and verify with a direct query, never a migrator's exit code.
- As of 2026-09-11, production's ledger stopped at `0019` and production lacked `salesforce_config`, `ga4_config` and
  `hidden_journey_stages`; the production steps for `0020` to `0023` are still marked pending. `0020`'s `CREATE TABLE` has
  no `IF NOT EXISTS` and the table already exists on production, so it must go through `migrate-http.ts`, which records it.

**Contradiction, unresolved:** `main`'s schema names all three columns on every client read
(`lib/db/schema.ts:228`, `:230`, `:236`), and the record says a missing one takes the whole app down. Production is in
use, so they were most likely applied after the record was written. Until it is checked, assume nothing about
production's ledger: `migrate-http.ts` applies every missing migration in journal order, so if production is behind on
`0020` to `0025`, running it for the tool would apply those too.

## 4. The move, in order (each step a separate decision; none started)

**Step 0. Read-only checks** (you, in the Neon SQL editor on production, or give me a read-only connection through the
hidden-paste command; nothing below writes):

```sql
-- Which migrations production has recorded, and how many.
select count(*), max(created_at) from drizzle.__drizzle_migrations;
select hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 8;
-- The three client columns the record calls pending.
select column_name from information_schema.columns where table_name = 'clients'
  and column_name in ('salesforce_config', 'ga4_config', 'hidden_journey_stages');
-- The tool's tables (expect none).
select to_regclass('public.aeo_outbound_reports'), to_regclass('public.aeo_outbound_settings');
```

Plus, in Vercel and Neon (names only, never values):
- Which production env vars exist: `PEEC_AI_CUSTOMER_TOKEN`, `GLEAN_INSTANCE`, `GLEAN_API_TOKEN`, `GLEAN_ACT_AS` (and
  staging's value of it), `AEO_OUTBOUND_USERS`.
- Which Neon project and plan production's `DATABASE_URL` points at, and its network transfer used this month.

I compare the hashes against the journal (`drizzle/meta/_journal.json`, entries 0 to 25 on `main`) and report exactly
which migrations production is missing before anything is applied.

**Step 1. Decide the promotion's scope.** The branch flow promotes all of staging. Confirm with Tina's QA status that
bulk PDF export and the other staging changes in section 1 are ready for production too; otherwise they ship with the tool.

**Step 2. Migrate production, before the code.** `CACHE_DISABLE=1 npx tsx --env-file=<production env file>
scripts/migrate-http.ts`, with production's own connection string, never by editing the staging guard. It applies what
step 0 found missing, in order, ending at `0029`. Then re-run the step 0 queries; every one must show the expected
result before step 4. `0026` to `0029` only add the tool's own tables, so nothing else reads them.

**Step 3. Production env vars.** Add `AEO_OUTBOUND_USERS` (Ryan, you, and anyone else who generates reports) and set
`GLEAN_ACT_AS` to match staging's Glean token type. Each value also goes in a local gitignored env file, per the
credentials rule.

**Step 4. Promote staging to main.** One PR, with the self-review comment and `self-reviewed` label, local checks if CI
minutes are out, and your explicit go-ahead. Vercel deploys `main` to production.

**Step 5. Verify on production.**
- Read only first: the hub loads for Ryan; Settings shows the defaults; `/snapshot/<anything>` answers "not available".
- Then one real report (a write): generate a draft from a live Peec project and check its Cited Sources and notes.
- Approve it and confirm the `reporting.avenuez.com` link opens signed out, and counts one open from another browser.
- One signed-in PDF export on a Renaissance page (#433's follow-up: Chrome 153 on Vercel with puppeteer 25.16).
- Neon transfer the next day, to confirm the lock sweep fix is holding.

**Step 6. Ryan's setup on production.** Re-enter any settings he changed on staging (section titles, wordmark, report
name, users). Staging links keep working where they are; final links come from production from then on.

## 5. Rollback

`0026` to `0029` are standalone, so reverting `main` to `17aa47db` leaves the tables in place, unread and harmless. The
tool's pages and `/snapshot` route disappear with the code, so **any production link sent before a rollback stops
opening** until the tool is restored. That is the reason to send production links only after step 5 passes.

## 6. Open questions (yours)

1. Does production's database share a Neon transfer quota with dev and staging, and is it near the limit now?
2. Promote all of staging, or should anything in section 1 wait?
3. Who goes on `AEO_OUTBOUND_USERS` for production?
4. Which Glean token type does staging use (`GLEAN_ACT_AS`)?
