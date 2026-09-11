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

## Add clients.ga4_config, clients.hidden_journey_stages (delivered, awaiting apply)

- Migrations: `drizzle/0022_military_the_santerians.sql` (`ga4_config`,
  nullable jsonb) and `drizzle/0023_clever_nightcrawler.sql`
  (`hidden_journey_stages`, `text[]` with a `'{}'` default) — kept as two
  migrations, not one, matching the two features being independently
  revertable (PR `#235` review). Both additive, no data change, no backfill.
  Stack directly on `0021` (`salesforce_config`, above) in the journal.

**Same failure mode as `0021`, for the same reason: `getClientBySlug` /
`getClientByEmail` / `getAllClients` (`lib/db/queries.ts`) now name both new
columns in every `clients` read, because they're in `lib/db/schema.ts`.**
Against a database missing either column that's a Postgres `42703`, and it
throws rather than degrades — nobody logs in, no client's report or portal
renders, not just the Executive Overview's conversion cards.

As of PR `#235` (2026-09-11), per Thomas's review on that PR (verified directly
against `information_schema` on all three databases — I don't have staging or
production credentials to re-confirm this myself, so this table is his
finding, cited, not independently re-verified):

| Database | Has `ga4_config` / `hidden_journey_stages`? | Also still missing |
|---|---|---|
| dev (`ep-still-tree`) | yes (0022 + 0023 applied) | — |
| staging (`ep-restless-union`) | no | `owned_linkedin_handle` too |
| production (`ep-green-violet`) | no | `owned_linkedin_handle`, `salesforce_config` |

Production is missing `salesforce_config` too, meaning **`0021` was never
applied there either** — the exact silent-skip scenario this file already
warned about for `0021`, now confirmed live rather than hypothetical. `0022`
and `0023` sit directly on top of `0021` in the journal, so applying them to
production requires applying `0021` first, in order.

**Production's ledger is further behind than just `0021`.** Per Thomas's
review, production's `drizzle.__drizzle_migrations` tip is `0019`, not
`0021` — so production is missing `0020` too, which creates the entire
`top_content_snapshots` table plus a foreign key, not merely two additive
columns. Applying `0021`/`0022`/`0023` to production means `0020` has to go
first, in order, and whoever schedules the prod apply should read `0020`'s
SQL before running anything — this is a materially bigger change than this
PR's own two columns.

**On the migration renumbering (`0022`/`0023` replacing the original combined
`0022_calm_silver_sable`):** confirmed safe by Thomas via independent
verification against all three ledgers. Two things worth recording:

- Dev carries an orphan row in `drizzle.__drizzle_migrations` — the old
  combined `0022_calm_silver_sable`'s hash, left behind by the split.
  Harmless (both migrators only ever check whether the CURRENT local files'
  hashes are recorded, never the reverse), but real, so noted here rather
  than left a mystery for whoever next queries that table.
- The "safe because the original never reached staging or production"
  justification for the split covers those two environments specifically,
  not every database that might hold the old migration — a Neon preview
  branch or another developer's local dev database could have it too. Those
  self-heal automatically: `migrate-http.ts` treats "column already exists"
  as "already applied" and records the new hash, so re-running it against
  such a database is safe without any special handling. `drizzle-kit
  migrate` (the timestamp-gated one) would NOT self-heal there — it would
  attempt `ADD COLUMN` against an already-existing column and hard-fail —
  which is one more reason to standardize on `migrate-http.ts` everywhere,
  not just dev.

Apply per environment, before merge, the same way as `0021`:

1. `CACHE_DISABLE=1 npx tsx --env-file=.env.local scripts/migrate-http.ts`
   for dev. **For staging, use `migrate-http.ts` too**, not `npm run
   db:migrate:staging` — that command runs `scripts/migrate-staging.sh`,
   which internally invokes `npx drizzle-kit migrate`, the exact
   timestamp-gated migrator this file bans two paragraphs up. It happens to
   be safe for staging today (both new `when` values sit above staging's
   newest ledger row, so nothing would be skipped), but the file's own rule
   should hold everywhere, not just where it's currently harmless to break
   it: `CACHE_DISABLE=1 npx tsx --env-file=.env.staging scripts/migrate-http.ts`.
   (`.env.staging` is gitignored; it needs `DATABASE_URL_UNPOOLED` for the
   staging branch — see `scripts/migrate-staging.sh`'s own header for where
   to get it from the Neon console.) Production is Neon console only,
   applied in journal order (`0020`, then `0021`, then `0022`, then `0023`),
   by deliberate act, not by editing any guard. **Not** `npm run db:migrate`
   / the `db-migrate.yml` workflow either way — both use the same banned
   migrator.
2. Verify with a direct query, not a migrator exit code:

       select column_name from information_schema.columns
       where table_name = 'clients'
       and column_name in ('salesforce_config', 'ga4_config', 'hidden_journey_stages');

   **Code must not merge to an environment's branch until this returns all
   three rows for that environment** (all three, not just the two this
   migration adds — `0021` has to be confirmed too, given the table above).
   For production, also confirm `top_content_snapshots` exists before
   assuming `0020` landed.
3. Once confirmed, set Renaissance's values with the two targeted scripts
   written for this (config-as-code, not a hand-typed SQL edit — see each
   script's header for why): `CACHE_DISABLE=1 npx tsx --env-file=<env file>
   scripts/set-renaissance-ga4-config.ts` and `scripts/hide-renaissance-pipeline-stages.ts`.
   Kept as two scripts, deliberately, matching the two columns being two
   unrelated features that happen to share this migration. Neither script
   guards which database it points at (matching the `set-renaissance-campaign-scope.ts`
   precedent, which doesn't either) — double-check `--env-file` before
   running either one anywhere but dev.
