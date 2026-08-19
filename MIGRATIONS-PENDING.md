# Pending Migrations

Schema changes that have been removed from application code but not yet
applied to the database.

## Drop `users.demo_mode` column

The demo-mode toggle was removed in `feat/remove-demo-mode` (2026-06-25). The
`demoMode` field was removed from `lib/db/schema.ts`, but the `demo_mode`
column is still present in the database. Generate and run a Drizzle migration
to drop it:

    npm run db:generate   # produces the DROP COLUMN migration
    npm run db:migrate

## Add client access columns (delivered, awaiting apply)

`drizzle/0011_*.sql` adds `clients.shared_password_hash` and
`clients.max_seats` (additive). Delivered on `repo-admin-panel`; apply per
`docs/runbooks/2026-06-25-admin-panel-launch.md`. The `users.demo_mode` drop
above is intentionally still separate and unapplied.

## Add clients.salesforce_config (delivered, awaiting apply)

- Migration: `drizzle/0021_old_silver_centurion.sql`
  (`ALTER TABLE "clients" ADD COLUMN "salesforce_config" jsonb;`). One
  nullable column, additive, no data change, no backfill.

**This migration MUST be applied to an environment's database BEFORE the
`Renaissance-CRM-Salesforce` code merges to that environment's branch.** This
is not a normal "run it when convenient" migration, for two compounding
reasons:

1. **Drizzle's query builder enumerates columns explicitly, it never does
   `select *`.** `getClientBySlug` / `getClientByEmail`
   (`lib/db/queries.ts`, via `db.query.clients.findFirst`) now select
   `salesforce_config` in every `clients` row read, because the column is in
   `lib/db/schema.ts`. Against a database that doesn't have the column yet,
   that is a Postgres `42703 column does not exist` error, and it throws, not
   degrades. These two helpers back the Auth.js session callback and every
   `/dashboard` and `/portal` page. Merging this code ahead of the migration
   does not just break the Salesforce CRM blocks, it takes down the WHOLE
   APP: nobody can log in, nobody can load any client's report or portal.

2. **`npm run db:migrate` (`drizzle-kit migrate`) is timestamp-gated, not
   hash-diffed, and can silently no-op.** Verified in
   `node_modules/drizzle-orm/neon-http/migrator.js`: it reads only the single
   newest bookkeeping row (`order by created_at desc limit 1`, line 17) and
   applies a migration only when
   `Number(lastDbMigration.created_at) < migration.folderMillis` (line 22).
   It never compares hashes or file contents against what's actually applied.
   Dev's `__drizzle_migrations` table holds more recorded rows than this
   repo's journal has entries. If any one of those extra rows is dated later
   than `0021_old_silver_centurion`'s journal `when` (1786904411935), this
   migrator skips 0021 entirely, silently, and still exits 0. A clean exit
   code from `db:migrate` is not evidence the column exists.

Apply the migration in this order, every environment:

1. **Apply before merge, not after.** Run the migration against the target
   environment's database before the `Renaissance-CRM-Salesforce` PR merges
   into that environment's branch. Do not merge first and apply "shortly
   after": the app is down for the whole gap.
2. **Use the HTTP migrator, not `npm run db:migrate`.** `npm run db:migrate`
   has been observed to hang against Neon. The path that works is the
   hash-diffed script that exists in this repo for exactly that reason:

       DATABASE_URL_UNPOOLED='<target-direct-url>' npx tsx --env-file=.env.local scripts/migrate-http.ts

   (`scripts/migrate-http.ts` hashes each journal entry's SQL and checks it
   against `drizzle.__drizzle_migrations` directly, so unlike
   `drizzle-kit migrate` it is not fooled by an out-of-order timestamp.)
3. **A clean exit code from either migrator is not proof of anything.**
   Because of the timestamp-gating behavior above, verify the column exists
   with a direct query against the target database, every time, regardless
   of which migrator ran or what it printed:

       select column_name from information_schema.columns
       where table_name = 'clients' and column_name = 'salesforce_config';

   **The code must not merge to that environment's branch until this query
   returns exactly one row.** If it returns zero rows, the column is not
   there no matter what the migrator's exit code said, and merging anyway
   reproduces the 42703 failure above: auth and every `/dashboard` and
   `/portal` page down, not just the CRM blocks.
4. Once the column is confirmed present, set the value for renaissance with a
   targeted UPDATE (see
   `docs/superpowers/plans/2026-08-16-renaissance-crm-pipeline.md`,
   "Enablement, per environment").
5. `scripts/seed.ts` does set `salesforceConfig` now (Task 6 of that plan),
   so the field is not absent from the seed. Do not run `npm run db:seed`
   against a real database anyway: the seed is stale against live data in
   both directions and would clobber real client rows. That is the reason
   not to run it, not a lack of the field.
