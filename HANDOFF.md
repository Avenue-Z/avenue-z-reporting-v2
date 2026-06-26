# HANDOFF — Admin Panel & Client Access Control (`repo-admin-panel`)

**For: Paul.** Everything you need to pull, run, and test this branch is here.

- **Branch:** `repo-admin-panel`
- **PR:** https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/94 (open, base `main`, **mergeable / checks green** — do not merge yet)
- **What it does:** an internal Avenue Z admin can set a per‑client shared password, set a per‑client seat limit, and assign one external client admin. That external admin can invite/remove up to 5 teammates (admin counts as 1), each scoped to **only their own client's** portal. Client‑side users log in with their email + the client's shared password.

> ## 🔑 The shared password is NOT set yet — on purpose
> The system **fails closed**: no client can log in on the client side until a
> shared password is set for that client. The *real* production password is
> chosen by Avenue Z in the dashboard at launch. **For testing, you set a throwaway
> one** (Step 4 below). This is expected, not a bug.

---

## Status — what's done & verified

All code is committed and pushed. It was type‑checked, production‑built, and
**live‑tested against a real (Neon) database** — the integration suite passed
**19/19**, and live testing caught + fixed one real bug (duplicate‑at‑seat‑cap
misreported as "seat limit").

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npm run build` (production) | ✅ compiles, all routes incl. `/dashboard/[clientSlug]/access` + `/portal/[clientSlug]/team` |
| `rsc-boundary` CI check | ✅ pass |
| Migration applies (`npm run db:migrate`) | ✅ adds 2 columns, existing clients backfill `max_seats=5`, `demo_mode` preserved |
| Seat cap / duplicate / auth / cross‑client isolation | ✅ 19/19 live |

---

## ⚠️ The one thing you can't skip: apply the migration

The schema references two new columns (`clients.shared_password_hash`,
`clients.max_seats`). Until the migration is applied to the DB you point at,
**every page errors** (Drizzle selects columns that don't exist) — not just the
new features. So whatever DB you use (local or a Vercel preview), it must have
migration `0011` applied first.

---

## Quick start (local)

```bash
# 1. Pull + install (bcryptjs was added — install is required)
git fetch origin && git checkout repo-admin-panel && git pull
npm install

# 2. Create .env.local (git-ignored). Use your OWN test DB.
#    Easiest: Neon console -> Branches -> New Branch -> copy connection string.
cat > .env.local <<'ENV'
DATABASE_URL=<pooled string, host has -pooler>
DATABASE_URL_UNPOOLED=<same string WITHOUT -pooler in the host>
AUTH_SECRET=<run: openssl rand -base64 32>
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_URL=http://localhost:3000
# Only needed to log into the INTERNAL dashboard via Google. Ask Thomas (in Vercel).
# NOT needed for the client-side flow if you use the helper in Step 4b.
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
ENV

# 3. Apply the migration (REQUIRED) + seed sample clients if the DB is empty
npm run db:migrate
npm run db:seed        # only if your branch DB has no clients yet

# 4b. Set a TEST shared password + external admin + viewer (no Google needed)
npx tsx --env-file=.env.local scripts/dev-set-client-access.ts \
  renaissance test1234 extadmin@test.com viewer@test.com

# 5. Run it
npm run dev            # http://localhost:3000
```

> **Step 4a (alternative):** if you have `AUTH_GOOGLE_ID/SECRET`, skip the script
> and set the password through the UI instead — sign in with your `@avenuez.com`
> Google account, open `/dashboard/<client>/access`, set the password, and
> "Assign external admin". That also exercises the internal feature.

---

## Test flow (the full walk-through)

**A. Internal admin** *(needs Google login)* — `/dashboard` → pick a client →
**Manage Access**:
- Set/rotate the **shared password**.
- Change the **seat limit** (default 5; can't go below current user count).
- **Assign external admin** by email.
- All three are gated to `INTERNAL_ADMIN`; an `INTERNAL_ANALYST` who reaches the
  page can't mutate.

**B. External admin** *(email + shared password at `/login`)* — sign in as
`extadmin@test.com` / `test1234`. You land in **that client's portal only**.
Open **Team**:
- Invite a teammate by email → you get a **copy‑able login link** to send them
  (the app does not email).
- Remove a teammate. You can't remove yourself or another admin.
- The cap is enforced: a 6th client‑side user is blocked.

**C. Viewer** — `/login` as `viewer@test.com` / `test1234` → sees only that
client's reports, no Team page.

**D. Isolation (the important part — verify all of these):**
- As a client user, manually open **another** client's URL
  `/portal/<other-slug>/reports` → must redirect to `/unauthorized`.
- A **wrong password** or an **un‑provisioned email** at `/login` → rejected.
- A **removed** teammate can no longer log in (effective immediately).
- Re‑inviting someone who already has access → "already has access" (not "seat limit").

---

## What changed (so you know where to look)

**New roles in play** (already existed in the DB enum): `INTERNAL_ADMIN`,
`INTERNAL_ANALYST`, `CLIENT_ADMIN`, `CLIENT_VIEWER`.

**Auth (`auth.ts` + `lib/auth/*` + `lib/db/queries.ts`):** client login now
validates email + the client's bcrypt‑hashed shared password and **fails closed**
(no hash, wrong password, unknown email, or internal role → rejected). Internal
users still sign in with Google. This **closed a prior hole** where any email in
the DB logged in with no password. Also removed the public "Preview Access"
button and fixed portal logout.

**Internal UI:** `app/dashboard/[clientSlug]/access/` (page + panel) +
`app/actions/client-access.ts`.

**External UI:** `app/portal/[clientSlug]/team/` (page + panel) +
`app/actions/team.ts`; Team link added to `components/layout/portal-sidebar.tsx`
(only shown to `CLIENT_ADMIN`).

**DB layer:** `lib/db/admin-queries.ts` (seat‑safe atomic insert — the neon‑http
driver has no transactions, so the cap is enforced in one conditional SQL
statement), `lib/db/seat-result.ts`, and the migration
`drizzle/0011_huge_cobalt_man.sql` (additive: two columns only).

**Tests:** pure logic has `*.test.ts` files run with `npx tsx <file>.test.ts`.
There is no jest/vitest in this repo.

---

## Gotchas / troubleshooting

- **Pages 500 / "column does not exist"** → the migration isn't applied to your
  DB. Run `npm run db:migrate`.
- **Can't reach `/dashboard`** → internal dash needs Google login
  (`AUTH_GOOGLE_ID/SECRET`). Use the Step 4b helper to test the client side
  without it.
- **Client login says "Invalid email or password"** → that email isn't
  provisioned for a client, or no shared password is set for that client. Re‑run
  the Step 4b helper.
- **The Vercel preview from the PR** builds fine, but its pages only work if the
  DB Vercel points at has migration `0011` applied — same rule as local.
- **Pre‑existing lint errors** in unrelated files (`components/data-chat/*`,
  `components/report-sections/*`, the `as any` in `portal-sidebar.tsx`) pre‑date
  this branch and don't block `next build`.

---

## Production rollout (when Avenue Z is ready — not Paul's job)

See `docs/runbooks/2026-06-25-admin-panel-launch.md`. Summary: merge PR #94 →
GitHub **Actions → "DB migrate (manual)" → Run workflow** on `main` (applies the
migration to prod via a stored secret) → set each client's real shared password
in `/dashboard/<client>/access`.

---

## Reference: commits on this branch

```
docs: Paul test-handoff guide + dev helper to set a test shared password
docs: runbook — apply migration via the DB-migrate GitHub Action
fix: report duplicate (not seat_limit) when re-inviting at the seat cap
docs: admin panel launch runbook + pending-migration note
feat: external admin Team page (invite/remove viewers, copy login link, seat cap)
feat: internal admin Manage Access (set password, seat limit, assign external admin)
feat: seat-safe admin DB queries (atomic capped insert, no transaction)
fix: remove public Preview Access login, fix portal logout, drop dead demo-auth
feat: validate client logins against per-client shared password
feat: pure access-control helpers (email, role, seat math)
feat: add clients.shared_password_hash and clients.max_seats (additive migration)
feat: add bcrypt password hashing helper
```
