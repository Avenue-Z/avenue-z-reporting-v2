# Admin Panel Launch Runbook

## 1. Apply the migration (Thomas runs this — never run against prod blind)
- Migration: `drizzle/0011_*.sql` — adds `clients.shared_password_hash` and
  `clients.max_seats` only. Idempotent (`ADD COLUMN IF NOT EXISTS`).
- Recommended: create a Neon branch, set `DATABASE_URL_UNPOOLED` to it, run
  `npm run db:migrate`, verify, then run against prod.
- Verify after: `select column_name from information_schema.columns where
  table_name='clients' and column_name in ('shared_password_hash','max_seats');`
  → two rows. Existing clients show `max_seats = 5`.

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
