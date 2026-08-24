# Pending Migrations

Schema changes that have been removed from application code but not yet
applied to the database.

**How to apply anything listed here:** [`docs/runbooks/applying-migrations.md`](docs/runbooks/applying-migrations.md)
— which tool per environment, the additive-vs-destructive ordering, and the
verification query. Do not go by a migrator's exit code.

## Drop `users.demo_mode` column

The demo-mode toggle was removed in `feat/remove-demo-mode` (2026-06-25). The
`demoMode` field was removed from `lib/db/schema.ts`, but the `demo_mode`
column is still present in the database.

`npm run db:generate` will **not** produce this migration: snapshot
`drizzle/meta/0011_snapshot.json` already records `users` without `demo_mode`,
so Drizzle believes the column is gone and has nothing to diff. It has to be
hand-written, and it is destructive — see the runbook's "Known drift" section
for the steps.

## Add client access columns (delivered, awaiting apply)

`drizzle/0011_*.sql` adds `clients.shared_password_hash` and
`clients.max_seats` (additive). Delivered on `repo-admin-panel`; apply per
`docs/runbooks/2026-06-25-admin-panel-launch.md`. The `users.demo_mode` drop
above is intentionally still separate and unapplied.
