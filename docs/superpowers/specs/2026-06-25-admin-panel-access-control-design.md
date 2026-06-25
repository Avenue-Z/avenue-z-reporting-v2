# Admin Panel & Client Access Control — Design

**Date:** 2026-06-25
**Branch:** `repo-admin-panel`
**Status:** Approved design, pending implementation plan

---

## Goal

Two related capabilities on top of the existing reporting platform:

1. **Internal admin (Avenue Z):** From the internal dashboard, give a client
   access to *their own* portal only, by (a) setting a per-client shared
   password and (b) assigning one external `CLIENT_ADMIN` for that client.
2. **External admin (client side):** That `CLIENT_ADMIN` can invite up to a
   total of **5 client-side seats** (themselves + up to 4 `CLIENT_VIEWER`
   teammates), each scoped to *only their client's* portal. Teammates log in
   with their provisioned email + the shared password.

No client may ever see another client's data.

---

## Why this is low-risk

The architecture already implements most of this. We are **extending**, not
rebuilding:

- **Roles already exist** — `INTERNAL_ADMIN`, `INTERNAL_ANALYST`,
  `CLIENT_ADMIN`, `CLIENT_VIEWER` are in the `client_role` pg enum
  (`lib/db/schema.ts`).
- **Internal gating already exists** — `app/dashboard/layout.tsx` redirects any
  non-internal role to `/unauthorized`.
- **Per-client scoping already exists** — `app/portal/[clientSlug]/layout.tsx`
  redirects a client user to `/unauthorized` unless
  `session.user.clientSlug === clientSlug`. Role + slug are baked into the JWT
  at sign-in (`auth.ts` jwt callback) from a DB lookup.
- **Access scope = the whole client portal** (all of that client's
  `enabledReports`), which is exactly how `/portal/[clientSlug]` already works.
  **No new per-report scoping is introduced.**

---

## Decisions (locked)

| Decision | Choice |
|---|---|
| Team-member identity | **Named seats** — one provisioned email per person |
| Seat cap | **5 total client-side users per client** (admin counts as 1 → ≤4 viewers) |
| Access scope | The client's **whole portal** (their enabled report sections) |
| Shared password | **One per client, set by Avenue Z** (internal admin) |
| External admin login | **Same as team** — email + the client's shared password; `CLIENT_ADMIN` role only unlocks the Team page |
| Migration | **Isolated, additive, applied by Thomas** — never touches prod from here |
| `demo_mode` drop | **Out of scope** for this PR (kept separate) |

---

## Schema change (the only DB change)

A single additive, nullable column:

```sql
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "shared_password_hash" text;
```

- Stores a **bcrypt hash** of the client's shared password. Nullable: a client
  with no hash set cannot have client-side users log in (fail closed).
- **No new tables.** Named seats are rows in the existing `users` table
  (`email` unique, `role`, `clientId`). The 5-seat cap is enforced in
  application code via a count-then-insert inside a transaction.
- **No drops, no NOT-NULL backfills, no type changes** → existing rows are
  untouched.

### Migration handling (the careful part)

- The migration file is **hand-authored** to contain *only* the `ADD COLUMN IF
  NOT EXISTS` above, so `drizzle-kit generate` does not bundle the pre-existing
  pending `users.demo_mode` drop (see `MIGRATIONS-PENDING.md`).
- Drizzle metadata (`drizzle/meta/_journal.json` + snapshot) must stay
  consistent. The implementation plan will specify the exact mechanism (either
  hand-author the snapshot to add only the new column, or generate then strip
  the demo_mode drop) and **verify** the resulting `drizzle/` state diffs to
  exactly one `ADD COLUMN`.
- **Application:** the migration is **not** run against production from this
  workflow. Thomas applies it (recommended: against a Neon branch DB first via
  `DATABASE_URL_UNPOOLED`, verify, then promote to prod).
- `clients.shared_password_hash` is added to `lib/db/schema.ts` so the app and
  types know about it.

---

## Security fixes bundled in (must-do before launch)

These are pre-existing holes that this feature depends on closing:

1. **Real password validation** (`auth.ts`, Credentials `authorize`):
   - Look up user by email → load their client → if the client has a
     `shared_password_hash` and `bcrypt.compare(password, hash)` is true,
     return the user; otherwise return `null`.
   - Today the provider returns a user for **any** email in the DB with **no
     password check** (the code comment admits this is a stub). This is the
     hole the shared password closes.
   - Credentials login is for **client-side roles only**. Internal users sign
     in with Google (unchanged). If an internal email has no client shared
     password, credentials login simply fails for them — they use Google.

2. **Remove the public "Preview Access" button** (`app/login/page.tsx`):
   - It one-click submits `demo@avenuez.com` / `demo`, which — combined with
     the no-password stub — is a public door into an `INTERNAL_ANALYST` session
     (sees **every** client). Delete it.

3. **Fix portal logout + remove dead demo code:**
   - `components/layout/portal-sidebar.tsx` logout currently calls `demoLogout`
     (clears a nonexistent cookie) instead of ending the real NextAuth session
     → portal users can't actually log out. Switch it to a real `signOut`.
   - Delete the unused `app/actions/demo-auth.ts` (its login functions are
     imported nowhere; only `demoLogout` is referenced, and that reference is
     being replaced).

---

## Components

### A. Internal admin — manage client access

Location: the internal dashboard, per client (exact placement — the existing
`/dashboard/[clientSlug]` page or `/dashboard/settings` — decided in the plan).

- **Set / rotate shared password** for a client → server action writes
  `bcrypt.hash(newPassword)` to `clients.shared_password_hash`, busts the `db`
  cache tag.
- **Assign the external `CLIENT_ADMIN`** for a client → server action inserts/
  updates a `users` row (`role = CLIENT_ADMIN`, `clientId = <client>`), subject
  to the same 5-seat cap.
- Both actions hard-gated: `session.user.role === 'INTERNAL_ADMIN'`.

### B. External admin — Team page (client side)

Location: a new page inside `/portal/[clientSlug]` visible only to
`CLIENT_ADMIN`.

- Lists current client-side users for that client with remaining seats.
- **Invite teammate** (email) → server action inserts a `users` row
  (`role = CLIENT_VIEWER`, `clientId = <their client>`), **only if** total
  client-side users for that client `< 5`, checked inside a transaction.
- **Remove teammate** → server action deletes the row (cannot remove self;
  cannot remove the `CLIENT_ADMIN`).
- The "invite link" is simply the portal login URL. The teammate logs in with
  their provisioned email + the client's shared password.

---

## Security invariants (non-negotiable)

1. **Every write server action re-derives the session server-side** and checks
   both **role** and **client ownership** before mutating. Never trust a
   `clientSlug`/`clientId` from the client.
   - Internal actions require `INTERNAL_ADMIN`.
   - Team actions require `CLIENT_ADMIN` **and** that the target client equals
     the caller's `session.user.clientSlug`.
2. **Seat cap is enforced transactionally** (count-then-insert in one DB
   transaction) to avoid a race that exceeds 5.
3. **Fail closed:** no `shared_password_hash` → no client-side login for that
   client.
4. **Emails normalized to lowercase** on write (matches existing
   `getClientByEmail` lookup which lowercases).
5. **Internal roles cannot be assigned** through any client-facing action.
6. Existing portal/dashboard layout guards remain the last line of defense and
   are unchanged.

---

## Dependencies

- Add `bcryptjs` + `@types/bcryptjs` (pure-JS, runs on the Node runtime used by
  `auth.ts` / server actions). Hashing/verifying happens server-side only.

---

## Out of scope (YAGNI for tomorrow)

- Per-user individual passwords for the external admin.
- Single-use invite tokens / magic links (the login URL + provisioned email +
  shared password is sufficient).
- Per-report (sub-portal) scoping.
- Dropping `users.demo_mode` (tracked separately in `MIGRATIONS-PENDING.md`).
- Password reset/self-service flows (Avenue Z rotates passwords).

---

## Testing & verification

- Unit: `authorize` returns `null` for wrong password, missing hash, and
  unknown email; returns the user for a correct match.
- Unit/integration: seat-cap action rejects the 6th client-side user; rejects
  cross-client invites; rejects non-admin callers.
- Manual: internal admin sets a password + assigns a `CLIENT_ADMIN`; that admin
  logs in, adds a viewer, sends the URL; viewer logs in and sees **only** their
  portal; attempting another client's slug → `/unauthorized`.
- Migration: verify the generated `drizzle/` diff is exactly one `ADD COLUMN`
  and applies cleanly on a Neon branch before prod.

---

## Delivery

- All work on branch `repo-admin-panel`.
- **Open a pull/merge request only — do not merge to `main`.**
- The migration is delivered as a file; Thomas applies it to the database.
