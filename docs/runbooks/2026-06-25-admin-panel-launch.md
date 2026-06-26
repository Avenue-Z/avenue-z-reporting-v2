# Admin Panel Launch Runbook

## 1. Apply the migration to production
Migration `drizzle/0012_huge_cobalt_man.sql` adds `clients.shared_password_hash`
and `clients.max_seats` only — additive, idempotent (`ADD COLUMN IF NOT EXISTS`).
(Renumbered from 0011 to 0012 when merging `main`, which had its own 0011 —
`0011_aberrant_revanche` (the `health_state` table). `db:migrate` applies pending
migrations in journal order, so it runs 0011 then 0012; no manual ordering needed.)

**Verified on a Neon branch (2026-06-25):** `npm run db:migrate` applied it
cleanly, all existing clients backfilled to `max_seats = 5` (zero nulls),
`shared_password_hash` is null on every client (fail-closed), and `demo_mode`
was preserved. The live admin-access integration suite passed 19/19.

Apply to prod via the existing GitHub Action — the connection string stays in
GitHub, never on a laptop:
1. Merge this PR to `main`.
2. GitHub → **Actions → "DB migrate (manual)" → Run workflow** (on `main`). It
   runs `npm run db:migrate` against the `production` environment secret
   `DATABASE_URL_UNPOOLED`. (Optionally add a required reviewer on the
   `production` environment for an approval gate.)
3. Verify: `select column_name from information_schema.columns where
   table_name='clients' and column_name in ('shared_password_hash','max_seats');`
   → two rows; existing clients show `max_seats = 5`.

Note: prod should be at the standard `main` migration lineage (`0000`–`0011`,
including `0011_aberrant_revanche` / `health_state`) before/when this runs;
`db:migrate` applies any pending ones (0011 health and/or 0012 admin) in order.
This admin migration is additive and idempotent, safe even if re-run.

## 2. Onboard the first client
1. As an Avenue Z internal admin (Google sign-in), open
   `/dashboard/<clientSlug>/access`.
2. Set the client's **shared password** (≥ 8 chars). Communicate it to the
   client out-of-band (you tell them — the app does not email).
3. Set the **seat limit** if 5 is not right.
4. **Assign external admin**: enter the client contact's email → creates their
   CLIENT_ADMIN seat (counts toward the limit).

## 3. External admin invites their team
1. The external admin signs in at `/login` with their email + the shared
   password, lands in their portal, opens **Team**.
2. They invite teammates by email (up to the seat limit) and send each the
   copied login link + the shared password.

## 4. Verify isolation (do before going live)
- Client A user can reach `/portal/client-a/...` but `/portal/client-b/...`
  redirects to `/unauthorized`.
- Wrong password and unprovisioned emails are rejected at `/login`.
- A removed teammate can no longer sign in.

## Rollback
- The change is additive. To roll back app code, revert the branch; the two
  columns can remain (harmless, nullable / defaulted).
