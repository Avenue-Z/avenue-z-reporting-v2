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
- Adds one nullable jsonb column. No data change, no backfill.
- Apply per environment with `npm run db:migrate` against that environment's DATABASE_URL_UNPOOLED, then set the value for renaissance with a targeted UPDATE (see `docs/superpowers/plans/2026-08-16-renaissance-crm-pipeline.md`, "Enablement, per environment").
- `scripts/seed.ts` does set `salesforceConfig` now (Task 6 of that plan), so the field is not absent from the seed. The reason not to run `db:seed` against a real database is that the seed is stale against live data in both directions and would clobber real client rows, not that it lacks the field.
