# Runbook — applying a Drizzle migration

The procedure behind the `migration-applied` and `migration-deferred-apply`
labels that [`guard-migration-ordering.yml`](../../.github/workflows/guard-migration-ordering.yml)
requires. Read the ordering section before the tooling section: using the right
tool in the wrong order is still an outage.

---

## Why this is gated at all

Drizzle's query builder enumerates columns explicitly — it never emits
`select *`. The moment a column appears in `lib/db/schema.ts`, every read of
that table selects it, including `getClientBySlug` / `getClientByEmail`, which
back the Auth.js session callback and every `/dashboard` and `/portal` page.
Against a database missing the column that is Postgres **42703**, and it throws
rather than degrades — so the ordering mistake takes the whole app down, not
just the feature that needed the column.

---

## Ordering

| Migration | Order | Label |
|---|---|---|
| **Additive** — `ADD COLUMN`, `CREATE TABLE`, `CREATE INDEX` | Apply **first**, then merge | `migration-applied` |
| **Destructive** — `DROP COLUMN`, `DROP TABLE`, `RENAME …` | Merge and **deploy first**, apply after | `migration-deferred-apply` |

The destructive direction is the one that is easy to get backwards. Dropping a
column while the deployed code still selects it is the same 42703 outage,
arriving from the other side. If deployed code still references the object, do
not use the label — split the change expand/contract: land the code that stops
referencing it, let that deploy go live, then ship the migration in a follow-up
PR.

`DROP CONSTRAINT`, `DROP DEFAULT` and `DROP NOT NULL` are not destructive in
this sense; they break no `select`.

---

## Applying

| Target | Command | Notes |
|---|---|---|
| **Production** | Actions → **DB migrate (manual)** → Run workflow | Runs `drizzle-kit migrate` with the connection string held as a repo secret; it never touches a developer machine. This is the supported path and it works — see the run history on `db-migrate.yml`. |
| **Staging** | `npm run db:migrate:staging` | `scripts/migrate-staging.sh`, which refuses any URL that is not the staging Neon endpoint before invoking `drizzle-kit`. Needs `.env.staging` (gitignored). |
| **Dev / local** | `npx tsx --env-file=.env.local scripts/migrate-http.ts` | `drizzle-kit migrate` falls back to the `@neondatabase/serverless` WebSocket driver (no `pg` or `postgres` package is installed) and is known to hang from developer machines; `scripts/migrate-http.ts` applies the same journal over Neon's HTTP driver instead. |

Both tools write to `drizzle.__drizzle_migrations` with `created_at` set to the
journal's `when`, so they can be mixed without drift.

---

## The exit code is not evidence — always run the query

`drizzle-kit migrate` selects the single newest row in
`drizzle.__drizzle_migrations` and applies only migrations stamped **later**
than it ([`drizzle-orm/pg-core/dialect.cjs:61-64`](../../node_modules/drizzle-orm/pg-core/dialect.cjs)):

```js
const lastDbMigration = dbMigrations[0];           // order by created_at desc limit 1
if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis) { … }
```

So any migration whose journal timestamp is older than the newest recorded row
is skipped **silently, with exit 0, forever**. `scripts/migrate-http.ts` gates
on hash-set membership instead and does not have this hole, which is also why
the two can disagree about what is pending.

That is why the label attests to a query, not to a green command. After
applying, against **each** environment you claimed:

```sql
select column_name
from information_schema.columns
where table_name = '<table>' and column_name = '<column>';
```

Zero rows means it did not apply, whatever the migrator printed.

---

## Known drift: `users.demo_mode`

`demoMode` was removed from `lib/db/schema.ts` in `feat/remove-demo-mode`
(2026-06-25) and the column is still in the database. **`npm run db:generate`
will not produce the drop** — snapshot `drizzle/meta/0011_snapshot.json` already
records `users` without `demo_mode` (`0010_snapshot.json` still has it) while
`drizzle/0011_aberrant_revanche.sql` only creates `health_state`. Drizzle
believes the column is already gone, so there is nothing left for it to diff.

Clearing it therefore means hand-writing the migration:

1. Add `drizzle/00NN_drop_demo_mode.sql` containing
   `ALTER TABLE "users" DROP COLUMN "demo_mode";` and its `drizzle/meta/_journal.json`
   entry. The snapshot needs no change — it is already correct.
2. It is destructive, so it takes `migration-deferred-apply`: merge, let the
   deploy go live, then apply. No deployed code reads the column, so this is
   safe as soon as the migration lands.
3. Remove the `TODO(remove-demo-mode)` comment in `lib/db/schema.ts` and this
   section in the same PR.
