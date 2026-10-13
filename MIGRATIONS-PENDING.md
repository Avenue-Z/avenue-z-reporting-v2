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

## Add clients.ga4_config, clients.hidden_journey_stages (delivered; applied to dev + staging, awaiting production)

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

As of 2026-09-11:

| Database | Has `ga4_config` / `hidden_journey_stages`? | Also still missing |
|---|---|---|
| dev (`ep-still-tree`) | yes (0022 + 0023 applied) | — |
| staging (`ep-restless-union`) | **yes (0022 + 0023 applied 2026-09-11, via `migrate-http.ts` against `.env.staging` — same day as the `dev → staging` promotion, PR `#237`)** | `owned_linkedin_handle` |
| production (`ep-green-violet`) | no | `owned_linkedin_handle`, `salesforce_config` |

Renaissance's `ga4_config.leadEvents` and `hidden_journey_stages` are also
already set on both dev and staging (via `scripts/set-renaissance-ga4-config.ts`
and `scripts/hide-renaissance-pipeline-stages.ts`), so staging's Executive
Overview is already showing the corrected numbers, not just column-ready.

The original version of this table (PR `#235`, 2026-09-11) was Thomas's
`information_schema` finding at review time, before dev/staging were
merged/migrated — cited then, since the author had no staging/production
credentials to check directly. The staging row above is now the author's own
direct verification, post-merge.

**`owned_linkedin_handle` is not part of this apply plan and never will be
from following it.** It has no Drizzle migration and isn't in `lib/db/schema.ts`
— it exists on dev only, added out of band by hand. The table above is
accurate about what each database has, but none of the numbered steps below
create this column anywhere, and because it isn't in `schema.ts`, its absence
can't cause the `42703` the rest of this entry is about (Drizzle only
enumerates columns it knows about). If this column is meant to ship, it
needs its own migration; don't infer one from this entry's presence in the
table above.

Production is missing `salesforce_config` too, meaning **`0021` was never
applied there either** — the exact silent-skip scenario this file already
warned about for `0021`, now confirmed live rather than hypothetical. `0022`
and `0023` sit directly on top of `0021` in the journal, so applying them to
production requires applying `0021` first, in order.

**Production's ledger is further behind than just `0021` — but only the
ledger, corrected after an error in an earlier draft of this entry.**
Production's `drizzle.__drizzle_migrations` tip is `0019`, not `0021`
(re-verified independently by Thomas: 20 rows, no orphans). An earlier
version of this paragraph said production was also missing the
`top_content_snapshots` table `0020` creates. **That was wrong — the table
already exists in production, foreign key included. Only the `0020` ledger
row itself is missing**, a bookkeeping gap, not an absent table. This matters
operationally: `drizzle/0020_chief_red_shift.sql` is a bare `CREATE TABLE`
with no `IF NOT EXISTS`, so applying it via the Neon console (pasting the SQL
directly) throws `relation "top_content_snapshots" already exists` on the
first statement and stops there, mid-sequence, on production. Route `0020`
through `migrate-http.ts` instead, the same as every other migration here —
it catches `/already exists/i`, records the hash, and moves on, which is
exactly the self-heal already described below for the preview-branch case.
Production is not "Neon console only" for this reason (see the apply steps
below, corrected to match).

**On the migration renumbering (`0022`/`0023` replacing the original combined
`0022_calm_silver_sable`):** confirmed safe by Thomas via independent
verification against all three ledgers. Two things worth recording:

- Dev carries **five** orphan rows in `drizzle.__drizzle_migrations` (ids 9,
  10, 14, 25, 27) — only one of them (27, the old combined
  `0022_calm_silver_sable`'s hash) is from this PR's migration split; the
  other four predate it and are unrelated. Harmless either way (both
  migrators only ever check whether the CURRENT local files' hashes are
  recorded, never the reverse), but noted precisely rather than implying
  there's only the one from this PR.
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
  not just dev (and, per the correction above, that now includes `0020` on
  production specifically).

Apply per environment, before merge, the same way as `0021`:

1. ~~`CACHE_DISABLE=1 npx tsx --env-file=.env.local scripts/migrate-http.ts`
   for dev.~~ **Done** (2026-09-11, before `#235` merged). ~~For staging, use
   `migrate-http.ts` too, not `npm run db:migrate:staging`~~ **Also done**
   (2026-09-11, before PR `#237`'s `dev → staging` promotion, using
   `CACHE_DISABLE=1 npx tsx --env-file=.env.staging scripts/migrate-http.ts`
   — not `npm run db:migrate:staging`, which runs `scripts/migrate-staging.sh`,
   which internally invokes `npx drizzle-kit migrate`, the exact
   timestamp-gated migrator this file bans two paragraphs up. It would have
   been safe for staging regardless — both new `when` values sat above
   staging's newest ledger row — but the file's own rule should hold
   everywhere, not just where breaking it happens to be harmless.
   `.env.staging` is gitignored; `migrate-http.ts` falls back to
   `DATABASE_URL` when `DATABASE_URL_UNPOOLED` isn't set, so the pooled
   string alone worked fine — `DATABASE_URL_UNPOOLED` is only a hard
   requirement for `drizzle-kit`/`migrate-staging.sh`, not this script.
   **Production is still pending.** Use `migrate-http.ts` there too, not the
   Neon console — per the correction above, `0020`'s `CREATE TABLE` has no `IF
   NOT EXISTS`, and pasting it into the console throws on the first
   statement since the table already exists there; `migrate-http.ts`
   self-heals that case and everything after it in order (`0020`, `0021`,
   `0022`, `0023`). Still a deliberate act with production's own connection
   string, never by editing the staging guard. **Not** `npm run db:migrate`
   / the `db-migrate.yml` workflow for any environment — both use the same
   banned migrator.
2. Verify with a direct query, not a migrator exit code:

       select column_name from information_schema.columns
       where table_name = 'clients'
       and column_name in ('salesforce_config', 'ga4_config', 'hidden_journey_stages');

   **Code must not merge to an environment's branch until this returns all
   three rows for that environment** (all three, not just the two this
   migration adds — `0021` has to be confirmed too, given the table above).
   For production, checking whether `top_content_snapshots` exists proves
   nothing about `0020` specifically, since the table is already there
   regardless of the ledger — confirm `0020`'s hash is recorded instead:

       select hash from drizzle.__drizzle_migrations order by created_at desc limit 5;
3. Once confirmed, set Renaissance's values with the two targeted scripts
   written for this (config-as-code, not a hand-typed SQL edit — see each
   script's header for why): `CACHE_DISABLE=1 npx tsx --env-file=<env file>
   scripts/set-renaissance-ga4-config.ts` and `scripts/hide-renaissance-pipeline-stages.ts`.
   **Done for dev and staging** (2026-09-11, same day as their migrations
   above); **still pending for production.** Kept as two scripts,
   deliberately, matching the two columns being two unrelated features that
   happen to share this migration. Neither script guards which database it
   points at (matching the `set-renaissance-campaign-scope.ts` precedent,
   which doesn't either) — double-check `--env-file` before running either
   one against production.

## Add the October Organic Social tables (staging applied 2026-09-24; production pending)

`drizzle/0024_*.sql` adds two tables, both additive and both read only by clients that
opt in:

- `dash_response_locks` (lock every number, PR #256): the stored Dash answer for one
  exact request of a locked month, per client. Only clients with `reportingMonths` read
  or write it.
- `chart_annotation_hides` (annotations, PR #252): one row per annotation the team has
  hidden or unhidden on a v2 Organic Social graph.

One migration for both, because Drizzle keeps a single migration list: the same commit
is merged into #256 and #252, so whichever lands first applies it once. Nothing
Renaissance renders reads either table. Applied on staging on 2026-09-24 with
`CACHE_DISABLE=1 npx tsx --env-file=.env.staging scripts/migrate-http.ts`, the command this
file gives for staging above, not `npm run db:migrate:staging` (that runs the timestamp-gated
`drizzle-kit migrate` this file bans, and it refuses without `DATABASE_URL_UNPOOLED` in
`.env.staging`). Before: a read-only check that 0024 was the only unrecorded migration. After:
a direct read of the tables and the migration ledger. Production goes the same way, before the
production merge, per the usual flow.

## Add chart notes (annotations Phase 2; staging applied 2026-09-25; production pending)

`drizzle/0025_chart_notes.sql` adds one table, `chart_notes`: the team's written notes on the v2
Organic Social graphs, with Commentary's draft and approve lifecycle. Additive: no existing table,
column or row changes, and nothing Renaissance renders reads it. It reuses the existing
`commentary_status` enum. A partial unique index keeps at most one open draft per client,
platform, chart and day, and a check keeps a deleted note a draft.

Staging, only on my written go and before the code reaches staging:
`CACHE_DISABLE=1 npx tsx --env-file=.env.staging scripts/migrate-http.ts`. That script does not
check which database it points at, so a host guard runs first. Before: a read-only check that
0025 is the only unrecorded migration. After: a read-only check of the table, its check, both
indexes and the ledger. Production goes the same way, before the production merge, only on my
written go and only after Jasmine approves staging.

Dev: `0024` and `0025` applied to the dev database on 2026-09-24, on my written go, so we could
test chart notes on our own local app first (dev is where every feature is tried before staging).
A dev-only host guard and a dry run first (exactly `0024` and `0025` pending); read back: the three
tables, both `chart_notes` indexes (the partial one's `WHERE` intact) and its check present, the
ledger up by two. Renaissance's dev row unchanged before and after.

Staging: `0025` applied 2026-09-25, on my written go, after Paul approved #273 and before the code
reached staging. A read-only preflight first, host-guarded to the address the script uses: exactly
`0025_chart_notes` pending, Renaissance's config `brandId` only. Applied with the command above
(`apply 0025_chart_notes (4 stmt) ... done`, `applied 1 migration(s)`). Read back: `chart_notes`
with its 16 columns, both indexes (the partial one's `WHERE` intact), the foreign key and the
check; the ledger up by one with nothing pending; the table list changed by `chart_notes` only;
no rows; Renaissance's row unchanged. Production: not applied.

## Add aeo_outbound_reports (applied on dev, awaiting staging and production)

`drizzle/0026_aeo_outbound_reports.sql` creates the `aeo_outbound_status` enum and the standalone
`aeo_outbound_reports` table (AEO Outbound Snapshot). Additive: no existing table, column or row
changes, and only `lib/aeo-outbound/store.ts` reads it, so the `clients` 42703 risk above does not
apply. Apply with the hash-checked `scripts/migrate-http.ts`, dev first, then staging and production
each on my written go, before the code reaches that environment.

Each environment only on my written go, dev first, then staging, then production. That script
applies every unrecorded migration in journal order and does not check which database it points
at, so a host guard runs first and refuses any host that is not the one I named for that run.
Before: a read-only dry run that lists what is pending. 0026 is applied on dev (2026-10-11). For every environment's dry run now that
0027 is in the journal, see the 0027 entry below. On production `0025_chart_notes` is also unapplied,
so production needs 0025 applied first, on my go, or the dry run will show both and the script
would apply both. After: a read-only read-back of the `aeo_outbound_reports` table with its four
open-tracking columns, its two date columns (`requested_start`, `requested_end`), its four checks (the approved check
including `share_recipient`, and `aeo_outbound_range_both_or_neither`), both indexes
with the partial `WHERE status = 'generating'` intact, the `aeo_outbound_status` enum, and the
migration ledger up by one.

Dev: `0026` applied to the dev database on 2026-10-11, on my written go. A dev-only host guard first (it refused any host other
than `ep-still-tree-aqs8ui6d`), then a read-only dry run: exactly `0026_aeo_outbound_reports` pending, the table and the
`aeo_outbound_status` enum absent, the ledger at 31 rows. Applied with `scripts/migrate-http.ts`
(`apply 0026_aeo_outbound_reports (4 stmt) ... done`, `applied 1 migration(s)`). Read back: the enum
(`generating, draft, approved, failed`); the table with its 28 columns, including the four open-tracking columns and
`requested_start` and `requested_end`; its four checks (`aeo_outbound_approved_complete` including `share_recipient`,
`aeo_outbound_delete_only_draft_failed`, `aeo_outbound_range_both_or_neither`, `aeo_outbound_revoke_only_approved`); the
`share_token` unique constraint; both indexes, with `aeo_outbound_one_generating`'s `WHERE status = 'generating'` intact; no
rows; the ledger at 32 with nothing pending; `aeo_outbound_reports` the only table added. Staging and production: not applied.

## Add the AEO Outbound v1.1 tables and columns (applied on dev, awaiting staging and production)

`drizzle/0027_aeo_outbound_v1_1.sql` creates `aeo_outbound_opens` (one row per counted open of a live link: `report_id`
with a foreign key to `aeo_outbound_reports`, `opened_at`, `ua_family`, `likely_automated`, `reason`; no IP address and no
user agent), `aeo_outbound_settings` (at most one row: its key is `id boolean primary key default true` with the check
`aeo_outbound_settings_single_row`) and `aeo_outbound_settings_log`, and adds `progress_step integer not null default 0`
and `error_code text` to `aeo_outbound_reports`. Additive: no existing column, constraint or row changes, and only
`lib/aeo-outbound/store.ts` and `lib/aeo-outbound/settings-store.ts` read these, so the `clients` 42703 risk above does
not apply. Apply with the hash-checked `scripts/migrate-http.ts`, each environment only on my written go, dev first, with
the same host guard as `0026`.

Dry runs (read-only) before applying: dev must list exactly `0027_aeo_outbound_v1_1` (dev already has `0026`); staging
lists `0026_aeo_outbound_reports` and `0027_aeo_outbound_v1_1`; production lists `0025_chart_notes`,
`0026_aeo_outbound_reports` and `0027_aeo_outbound_v1_1`, and needs `0025` applied first, on my go. `0026` is applied on
dev, so it keeps its number: if `dev` gains another `0026`, mine keeps its number and the other is renumbered.

Read-back after applying: the three new tables with their columns, the foreign key, both new indexes and the single-row
check; the two new `aeo_outbound_reports` columns, with `progress_step` 0 on every existing row; the ledger up by one
with nothing pending. Until it is applied, the code that reads these tables must not reach that environment.

Dev: `0027` applied to the dev database on 2026-10-12, on my written go. The dev-only host guard first (it refuses any host
other than `ep-still-tree-aqs8ui6d`), then a read-only dry run: exactly `0027_aeo_outbound_v1_1` pending, the three tables and
the two columns absent, the ledger at 32. Applied with `scripts/migrate-http.ts`, given only the dev URL
(`apply 0027_aeo_outbound_v1_1 (8 stmt) ... done`, `applied 1 migration(s)`). Read back: `aeo_outbound_opens` (6 columns, the
foreign key to `aeo_outbound_reports`, the `(report_id, opened_at)` index), `aeo_outbound_settings` (11 columns, the
`aeo_outbound_settings_single_row` check), `aeo_outbound_settings_log` (6 columns, the `changed_at` index), all empty;
`aeo_outbound_reports.progress_step` `integer not null default 0` (0 on both existing rows) and `error_code text` (null on both);
the ledger at 33 with nothing pending; those three tables the only ones added. Staging and production: not applied.

## Add `series` to aeo_outbound_settings (applied on dev, awaiting staging and production)

`drizzle/0028_aeo_outbound_settings_series.sql` is one statement: `ALTER TABLE "aeo_outbound_settings" ADD COLUMN "series"
text DEFAULT 'AI Visibility Snapshot' NOT NULL;`. It makes the report name a team setting (the default of `page.series` on
every new report; the top-left name `sidebar_wordmark` is already a text column and needs no change). Additive: no existing
column, constraint or row changes, and the column default fills an existing settings row. Only
`lib/aeo-outbound/settings-store.ts` reads this table. Apply with the hash-checked `scripts/migrate-http.ts`, each
environment only on my written go, dev first, with a host guard that refuses any host but the one named for that run (dev:
`ep-still-tree-aqs8ui6d`).

Dry runs (read-only) before applying: dev must list exactly `0028_aeo_outbound_settings_series` (dev already has `0027`);
staging lists `0026_aeo_outbound_reports`, `0027_aeo_outbound_v1_1` and `0028_aeo_outbound_settings_series`; production lists
`0025_chart_notes` through `0028_aeo_outbound_settings_series`, and needs `0025` applied first, on my go.

Read-back after applying: `aeo_outbound_settings.series` is `text not null default 'AI Visibility Snapshot'` (the existing
row, if any, reads that value); the ledger up by one with nothing pending.

Any build whose `lib/db/schema.ts` has `series` must not reach an environment before `0028` is applied there: Drizzle names every column, so the settings read throws (42703), access falls back to `AEO_OUTBOUND_USERS`
only, and every save is refused with the read-failed message.

Dev: `0028` applied to the dev database on 2026-10-12, on my written go, so this branch's preview (if previews read the
dev database, as ENGINEERS.md says; unverified from the repo) is out of that degraded state. The dev-only host guard first,
then a read-only dry run: exactly `0028_aeo_outbound_settings_series` pending, the ledger at 33. Applied with
`scripts/migrate-http.ts`, given only the dev URL (`apply 0028_aeo_outbound_settings_series (1 stmt) ... done`,
`applied 1 migration(s)`). Read back: `aeo_outbound_settings` has 12 columns, `series` is `text not null default
'AI Visibility Snapshot'`, the table has no rows yet; the ledger at 34 with nothing pending. Staging and production: not
applied.

Until this change merges to `dev`, keep the top-left name on dev to `AIVx` or `Avenue Z`. Older deployments that share the
dev database still check it against the old two-value list, and a row outside it fails their settings contract, which
drops Settings-only users and admins there.

## Add `last_writer` and `last_seq` to aeo_outbound_reports (not applied anywhere)

`drizzle/0029_aeo_outbound_save_writer.sql` is two statements: `ALTER TABLE "aeo_outbound_reports" ADD COLUMN "last_writer"
uuid;` and `ALTER TABLE "aeo_outbound_reports" ADD COLUMN "last_seq" integer;`. They record which editor queue (`writer`, a
UUID per editor tab) and which of its saves (`seq`, rising in send order) made the last slots save, so a save whose answer
was lost can be retried safely (spec v1.1 section 18.4): the slots route answers a retry of a save that already landed
without applying it twice, and puts a newer save of ours on top of an earlier one of ours, while any other tab's write
still gets 409 `stale`. Additive: both columns are nullable with no default, so no existing column, constraint or row
changes, and every existing row reads NULL in both (treated as "not written by this queue"). Only
`lib/aeo-outbound/store.ts` writes them (`saveSlotsQuery`, which sets both on every save, to the request's values or to
NULL) and only the slots route (`app/api/aeo-outbound/reports/[id]/slots/route.ts`) reads them. Edit a copy
(`copyAsDraftQuery`) lists its columns and leaves both NULL on the new draft. Apply with the hash-checked
`scripts/migrate-http.ts`, each environment only on my written go, dev first, with a host guard that refuses any host but
the one named for that run (dev: `ep-still-tree-aqs8ui6d`).

Dry runs (read-only) before applying: dev must list exactly `0029_aeo_outbound_save_writer` (dev already has `0028`);
staging lists `0026_aeo_outbound_reports` through `0029_aeo_outbound_save_writer`; production lists `0025_chart_notes`
through `0029_aeo_outbound_save_writer`, and needs `0025` applied first, on my go.

Read-back after applying: `aeo_outbound_reports.last_writer` is `uuid` nullable and `last_seq` is `integer` nullable, both
with no default, and every existing row reads NULL in both; the ledger up by one with nothing pending.

Deploy order: any build whose `lib/db/schema.ts` has these two columns must not reach an environment before `0029` is
applied there. Drizzle names every column, so `getReport` throws (42703) on a database without them (the report page,
its view route, the report actions, the generate route and every save read through it), and so does the generating insert
(`insertGeneratingQuery`), whose column list names both. On dev that includes my local QA server:
apply `0029` to the dev database before it runs this branch.

Mixed builds: builds from before `0029` that share a database (dev's older previews) can still save, and their update
leaves both columns as they were. So a save of ours that landed, then a save from such a build, then a retry of ours, is
answered as already landed while the row holds that build's text. Only dev runs mixed builds; staging and production run
one build at a time: accepted.

Rollback (spec v1.1 section 18.12, which ships in the same PR): a build without 18.12 reads a stored row with 1 or 4 to 6
bullets in a list as unreadable (`lib/aeo-outbound/contracts.ts` stored slots, `lib/aeo-outbound/store.ts` `typed`),
drafts and approved rows alike. Rolling back past this build after anyone has saved such a row breaks those rows until it
is rolled forward. The columns `0029` adds are harmless to an older build once applied (it never names them).
